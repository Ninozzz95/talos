import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {runConfigCommand} from '../../src/commands/config-cli.ts';
import {runProjectCommand} from '../../src/commands/project-cli.ts';
import {loadEffectiveConfig} from '../../src/config/load.ts';
import {main} from '../../src/main.ts';
import {ensureCliPaths,projectId,resolveCliPaths} from '../../src/paths.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {persistPermissionRule} from '../../src/security/persist.ts';
import type {RuleSetInput} from '../../src/security/types.ts';

// B1 slice 23. Measured at 5e05de8e: the loader merged user, then project, then project-user, and a list or a
// `null` in a later file REPLACED the earlier value. So a project's `.talos-cli/config.json` setting
// `permissions.deny` — even to `[]` — switched off the person's own deny rules, `permissions: null` became three
// empty lists in main.ts, and `permissionMode: "bypassPermissions"` from the repository was obeyed.
// Everything below goes through the real loader, the real permission engine and the real `main`.

// ⛔ Hermetic. Every secret-named variable is removed and every profile the loader or `main()` resolves is a
// temporary one, set BEFORE anything reads it: nothing here reaches the owner's %APPDATA%\TALOS-CLI or a provider.
for(const key of Object.keys(process.env))if(/KEY|TOKEN|SECRET|PASSW|CRED|AUTH|PRIVATE/iu.test(key))delete process.env[key];
const TEMP=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'talos-permission-scopes-')));
test.after(()=>fs.rmSync(TEMP,{recursive:true,force:true}));

let profiles=0;
async function profile(){
  const base=path.join(TEMP,`profile-${profiles+=1}`);
  process.env.APPDATA=path.join(base,'appdata');process.env.LOCALAPPDATA=path.join(base,'localappdata');
  process.env.XDG_CONFIG_HOME=path.join(base,'config');process.env.XDG_STATE_HOME=path.join(base,'state');process.env.XDG_CACHE_HOME=path.join(base,'cache');
  const paths=resolveCliPaths(process.env,process.platform,os.homedir());
  assert.ok(paths.configRoot.startsWith(base)&&paths.projectOverridesRoot.startsWith(base),'the profile must be the temporary one');
  await ensureCliPaths(paths);
  const project=path.join(base,'project');fs.mkdirSync(project,{recursive:true});
  const files={user:path.join(paths.configRoot,'config.json'),project:path.join(project,'.talos-cli','config.json'),projectUser:path.join(paths.projectOverridesRoot,projectId(project),'config.json')};
  // Written by hand, as a person or a repository would: the writer is not what put these shapes on disk.
  const write=(file:string,content:unknown)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(content,null,2)}\n`);};
  const effective=()=>loadEffectiveConfig({paths,projectRoot:project});
  const decide=async(command:string)=>{
    const rules=(await effective()).value.permissions as RuleSetInput;
    return (await createPermissionEngine({projectRoot:project,rules}).decide({tool:'Bash',command},{interactive:true,mode:'default'})).kind;
  };
  return{paths,project,files,write,effective,decide};
}

type Io={stdout:string;stderr:string;writeOut(text:string):void;writeErr(text:string):void;stdinIsTTY:boolean;stdoutIsTTY:boolean;readStdin():Promise<string>};
function io(tty:boolean):Io{return{stdout:'',stderr:'',writeOut(text){this.stdout+=text;},writeErr(text){this.stderr+=text;},stdinIsTTY:tty,stdoutIsTTY:tty,readStdin:async()=>''};}
// A runtime that asks for exactly one command, then ends its turn whatever the answer: since C-005 (owner 01/10) a refusal
// goes back to the model and the run goes on, so the engine's decision is read from `permissionDenials`, never from a failure.
function askingRuntime(command:string){
  let sink:((event:unknown)=>void)|null=null;let started:any=null;const answers:boolean[]=[];
  const runtime:any={
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>null,resume:async(id:string)=>id,fork:async()=>'',compact:async()=>({}),shell:async()=>{},close:async()=>{},cancel:async()=>{},
    start:async(input:any)=>{started=input;return 's-scopes';},
    subscribe(_id:string,next:(event:unknown)=>void){sink=next;queueMicrotask(()=>next({type:'ApprovalRequested',requestId:'r1',azione:{tipo:'comando',comando:command}}));return()=>{};},
    answerApproval:async(_id:string,_request:string,approved:boolean)=>{answers.push(approved);queueMicrotask(()=>sink?.({type:'RunFinished'}));},
  };
  return{runtime,answers,started:()=>started};
}
/* R5a lane A (ledger R2 close and R5 gate §13): RED 5 hit the 5 s run timeout under full-suite load and passed alone. The
   `auto` runs measure the host's sandbox first, which is slow under load; the property here is which scope's mode took
   effect, never how fast, so the run gets a timeout no loaded machine reaches. An approved run still ends at once. */
const RUN_TIMEOUT_SECONDS='60';
/* The engine's decision for the one command: its denial code, or 'ran', or the failure that ended the run. */
const outcomeOf=(result:any):string=>result.permissionDenials?.[0]?.code??(result.ok?'ran':result.error?.code);
async function headless(project:string,command:string,format:string[]=['--json']){
  const asking=askingRuntime(command);const out=io(false);
  const code=await main(['--project',project,'-p','work','--timeout',RUN_TIMEOUT_SECONDS,...format],{io:out,createRuntime:async()=>asking.runtime,runTui:async()=>{throw new Error('a headless run must not open the screen');}} as never);
  return{code,stdout:out.stdout,stderr:out.stderr,answers:asking.answers,mode:asking.started()?.permissionMode};
}
async function originsRows(paths:unknown,project:string){
  const out:string[]=[];
  /* F-P-004 (09/10/2026): `config origins` shows what a session applies, and a session applies the project's file only in a
     trusted project; these scopes are read as a trusted project's, as a session would. */
  const home=path.join(project,'..','home');fs.mkdirSync(home,{recursive:true});
  assert.equal(await runProjectCommand({invocation:{outputFormat:'json'},io:{writeOut(){},writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:project,paths} as never,['trust'],{homeDir:home}),0);
  const code=await runConfigCommand({invocation:{outputFormat:'json'},io:{writeOut:(text:string)=>out.push(text),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:project,paths} as never,['origins']);
  assert.equal(code,0);
  return JSON.parse(out.join('')) as Array<{path:string;value:unknown;origin:unknown}>;
}

test('RED 1: a user deny still denies when the project file sets deny to [], to another list, or permissions to null',async()=>{
  const variants=[
    ['deny: [] next to an allow for the same command',{permissions:{allow:['Bash(cat secrets.txt)'],ask:[],deny:[]}}],
    ['deny: another list',{permissions:{deny:['Bash(curl evil.example)']}}],
    ['permissions: null',{permissions:null}],
  ] as const;
  const observed=[];
  for(const [label,projectFile] of variants){
    const {files,write,project,effective}=await profile();
    write(files.user,{permissions:{deny:['Bash(cat secrets.txt)']}});
    write(files.project,projectFile);
    const deny=(await effective()).value.permissions?.deny;
    const run=await headless(project,'cat secrets.txt');
    const result=JSON.parse(run.stdout);
    observed.push({label,userDenyInEffectiveList:Array.isArray(deny)&&deny.includes('Bash(cat secrets.txt)'),answers:run.answers,outcome:outcomeOf(result),exit:run.code});
  }
  assert.deepEqual(observed,variants.map(([label])=>({label,userDenyInEffectiveList:true,answers:[false],outcome:'PERMISSION_DENIED',exit:0})));
});

test('RED 2: a project-user file carrying deny: [] (written before slice 21) or permissions: null does not erase a project deny',async()=>{
  {
    const {paths,project,files,write,decide}=await profile();
    write(files.project,{permissions:{allow:[],ask:[],deny:['Bash(curl evil.example)']}});
    write(files.projectUser,{permissions:{allow:['Bash(npm test)'],ask:[],deny:[]}});
    assert.deepEqual({curl:await decide('curl evil.example'),npm:await decide('npm test')},{curl:'deny',npm:'allow'},'the project deny holds and the project-user allow keeps its effect');
    // One more "allow always" through the real writer: the project deny is still in force afterwards…
    await persistPermissionRule({paths,projectRoot:project,effect:'allow',action:{tool:'Bash',command:'npm run lint'}});
    assert.deepEqual({curl:await decide('curl evil.example'),lint:await decide('npm run lint')},{curl:'deny',lint:'allow'});
    // …and the per-file write semantics are unchanged: each file still holds exactly its own lists.
    assert.deepEqual(JSON.parse(fs.readFileSync(files.projectUser,'utf8')).permissions,{allow:['Bash(npm test)','Bash(npm run lint)'],ask:[],deny:[]});
    assert.deepEqual(JSON.parse(fs.readFileSync(files.project,'utf8')).permissions,{allow:[],ask:[],deny:['Bash(curl evil.example)']});
  }
  {
    const {project,files,write}=await profile();
    write(files.project,{permissions:{deny:['Bash(curl evil.example)']}});
    write(files.projectUser,{permissions:null});
    const run=await headless(project,'curl evil.example');
    const result=JSON.parse(run.stdout);
    assert.deepEqual({answers:run.answers,outcome:outcomeOf(result)},{answers:[false],outcome:'PERMISSION_DENIED'},`permissions: null in the project-user file: ${run.stdout}`);
  }
});

test('RED 3: the effective deny list holds the entries of every scope once, and talos config origins names each entry\'s scope',async()=>{
  const {paths,project,files,write,effective,decide}=await profile();
  write(files.user,{permissions:{deny:['Bash(cat secrets.txt)','Bash(rm -rf build)']}});
  write(files.project,{permissions:{deny:['Bash(curl evil.example)','Bash(cat secrets.txt)']}});
  write(files.projectUser,{permissions:{allow:['Bash(npm test)'],deny:['Bash(git push --force)']}});
  const deny=(await effective()).value.permissions?.deny??[];
  const expected=['Bash(cat secrets.txt)','Bash(curl evil.example)','Bash(git push --force)','Bash(rm -rf build)'];
  assert.deepEqual([...deny].sort(),expected,`every scope's entries, each once: ${JSON.stringify(deny)}`);
  const decisions:Record<string,string>={};
  for(const command of ['cat secrets.txt','curl evil.example','git push --force','rm -rf build'])decisions[command]=await decide(command);
  assert.deepEqual(decisions,{'cat secrets.txt':'deny','curl evil.example':'deny','git push --force':'deny','rm -rf build':'deny'});
  const rows=await originsRows(paths,project);
  const perEntry=(list:string)=>{
    const row=rows.find(candidate=>candidate.path===`permissions.${list}`);
    assert.ok(row&&Array.isArray(row.origin),`talos config origins describes permissions.${list} entry by entry: ${JSON.stringify(row)}`);
    return Object.fromEntries((row.origin as Array<{value:string;origin:string;scopes:string[]}>).map(entry=>[entry.value,{origin:entry.origin,scopes:entry.scopes}]));
  };
  assert.deepEqual(perEntry('deny'),{
    'Bash(git push --force)':{origin:'project-user',scopes:['project-user']},
    'Bash(curl evil.example)':{origin:'project',scopes:['project']},
    'Bash(cat secrets.txt)':{origin:'project',scopes:['project','user']},
    'Bash(rm -rf build)':{origin:'user',scopes:['user']},
  });
  assert.deepEqual(perEntry('allow'),{'Bash(npm test)':{origin:'project-user',scopes:['project-user']}});
  assert.deepEqual(perEntry('ask'),{});
});

test('RED 4: bypassPermissions or auto in the project file leaves the run in the user\'s mode, and the run says which value was ignored and from which file',async()=>{
  const MODES=['bypassPermissions','auto'] as const;
  // --json: the result carries the statement, and the engine decides `npm test` in the user's mode (both
  // bypassPermissions and the local auto classifier would allow it; acceptEdits asks, so headless refuses).
  const observed=[];
  for(const mode of MODES){
    const {project,files,write,effective}=await profile();
    write(files.user,{permissionMode:'acceptEdits'});
    write(files.project,{permissionMode:mode});
    const loaded=await effective();
    const run=await headless(project,'npm test');
    const result=JSON.parse(run.stdout);
    observed.push({mode,effectiveMode:loaded.value.permissionMode,origin:loaded.origins.get('permissionMode'),runMode:run.mode,answers:run.answers,outcome:outcomeOf(result),statement:(result.warnings??[]).some((warning:string)=>warning.includes(`"${mode}"`)&&warning.includes(files.project))});
  }
  assert.deepEqual(observed,MODES.map(mode=>({mode,effectiveMode:'acceptEdits',origin:'user',runMode:'acceptEdits',answers:[false],outcome:'PERMISSION_REQUIRED',statement:true})));
  for(const mode of MODES){
    const names=(text:string,file:string)=>text.includes(`"${mode}"`)&&text.includes(file);
    // No user mode at all: the next value is the built-in default.
    {
      const {project,files,write}=await profile();
      write(files.project,{permissionMode:mode});
      const run=await headless(project,'npm test');
      const result=JSON.parse(run.stdout);
      assert.deepEqual({runMode:run.mode,outcome:outcomeOf(result),statement:(result.warnings??[]).some((warning:string)=>names(warning,files.project))},{runMode:'default',outcome:'PERMISSION_REQUIRED',statement:true},`${mode} from the project, no user mode: ${run.stdout}`);
    }
    // stream-json: the statement is the first event, and the numbering stays contiguous from 1.
    {
      const {project,files,write}=await profile();
      write(files.user,{permissionMode:'acceptEdits'});
      write(files.project,{permissionMode:mode});
      const run=await headless(project,'npm test',['--output-format','stream-json']);
      const events=run.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
      assert.equal(events[0]?.type,'warning',`${mode}, stream-json: ${run.stdout}`);
      assert.equal(events[0]?.data?.code,'PERMISSION_MODE_IGNORED');
      assert.ok(names(String(events[0]?.data?.message),files.project),`${mode}, stream-json names the value and the file: ${run.stdout}`);
      assert.deepEqual(events.map(event=>event.seq),events.map((_event,index)=>index+1),`${mode}, stream-json numbering: ${run.stdout}`);
      assert.equal(run.mode,'acceptEdits');
    }
    // text: the statement goes to stderr, before the run.
    {
      const {project,files,write}=await profile();
      write(files.user,{permissionMode:'acceptEdits'});
      write(files.project,{permissionMode:mode});
      const run=await headless(project,'npm test',[]);
      assert.ok(names(run.stderr,files.project),`${mode}, text output states it on stderr: ${JSON.stringify(run.stderr)}`);
      assert.equal(run.mode,'acceptEdits');
    }
    // interactive: the screen starts in the user's mode, and the statement is printed before it starts.
    {
      const {project,files,write}=await profile();
      write(files.user,{permissionMode:'acceptEdits'});
      write(files.project,{permissionMode:mode});
      const out=io(true);let screen:any=null;let stderrAtStart='';
      const runtime:any={close:async()=>{}};
      const code=await main(['--project',project],{io:out,createRuntimeContext:async()=>({runtime,tuiCatalog:{}}),runTui:async(props:any)=>{screen=props;stderrAtStart=out.stderr;}} as never);
      assert.equal(code,0);
      assert.deepEqual({mode:screen?.invocation?.permissionMode,classifier:screen?.autoClassifier===undefined?'none':'present'},{mode:'acceptEdits',classifier:'none'},`${mode}, interactive`);
      assert.ok(names(stderrAtStart,files.project),`${mode}, interactive: stated before the screen starts: ${JSON.stringify(stderrAtStart)}`);
    }
  }
});

test('a run that fails before its first event still says which value was ignored, in --json and in stream-json',async()=>{
  const {project,files,write}=await profile();
  write(files.project,{permissionMode:'bypassPermissions'});
  const failing=async(format:string[])=>{const out=io(false);const code=await main(['--project',project,'-p','work',...format],{io:out,createRuntime:async()=>{throw Object.assign(new Error('provider unavailable'),{code:'PROVIDER_UNREACHABLE'});}} as never);return{code,stdout:out.stdout,stderr:out.stderr};};
  const json=await failing(['--json']);const result=JSON.parse(json.stdout);
  assert.equal(result.error?.code,'PROVIDER_UNREACHABLE');
  assert.ok(result.warnings.some((warning:string)=>warning.includes('"bypassPermissions"')&&warning.includes(files.project)),json.stdout);
  const stream=await failing(['--output-format','stream-json']);
  const events=stream.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.deepEqual(events.map(event=>[event.seq,event.type,event.data?.code]),[[1,'warning','PERMISSION_MODE_IGNORED'],[2,'run.failed','PROVIDER_UNREACHABLE']],stream.stdout);
  assert.equal(stream.stderr,'','stream-json stays machine-readable: nothing on stderr');
});

/* R0 realignment (2026-09-23, owner decision 2 after the R0 gate): in `auto` mode a shell command on a host whose
   sandbox is not verified always asks (Codex rule), so headless `auto` now refuses `npm test` with PERMISSION_REQUIRED.
   On a host whose sandbox IS verified (measured once here, same probe the product uses) auto runs it. The property of
   these tests is unchanged: `runMode` proves which scope's mode took effect. */
let hostVerified:Promise<boolean>|null=null;
function autoOutcome(){hostVerified??=(async()=>{const {cliShellIsolation}=await import('../../src/security/execution-backends.ts');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join:joinPath}=await import('node:path');const cache=await mkdtemp(joinPath(tmpdir(),'talos-scopes-iso-'));try{return (await cliShellIsolation({paths:{cacheRoot:cache}})()).verified;}finally{await rm(cache,{recursive:true,force:true,maxRetries:5});}})();return hostVerified.then(v=>v?'ran':'PERMISSION_REQUIRED');}
/* 23/11/2026 (first public CI run, judge v2658): on a host whose sandbox is not verified (a clean GitHub runner) the refusal of
   `npm test` is told to the person as the one warning of a headless run, word for word; nothing about an ignored mode, ever. */
const DENIED_NPM_TEST='Permission denied: the command `npm test` (PERMISSION_REQUIRED: Operation requires approval in non-interactive mode). The model was told and the run goes on.';
const autoWarnings=(outcome:string)=>outcome==='PERMISSION_REQUIRED'?[DENIED_NPM_TEST]:[];
test('RED 5: bypassPermissions and auto from the user scope still take effect, and nothing is reported',async()=>{
  for(const mode of ['bypassPermissions','auto'] as const){
    const {project,files,write}=await profile();
    write(files.user,{permissionMode:mode});
    const run=await headless(project,'npm test');
    const result=JSON.parse(run.stdout);
    assert.deepEqual({runMode:run.mode,answers:run.answers,outcome:outcomeOf(result),warnings:result.warnings},mode==='auto'?{runMode:mode,answers:run.answers,outcome:await autoOutcome(),warnings:autoWarnings(await autoOutcome())}:{runMode:mode,answers:[true],outcome:'ran',warnings:[]},`${mode} from the user scope: ${run.stdout}`);
  }
});

test('the project-user scope and the command line keep their effect over a project file, and nothing is reported',async()=>{
  {
    const {project,files,write}=await profile();
    write(files.project,{permissionMode:'bypassPermissions'});
    write(files.projectUser,{permissionMode:'auto'});
    const run=await headless(project,'npm test');
    const result=JSON.parse(run.stdout);
    assert.deepEqual({runMode:run.mode,outcome:outcomeOf(result),warnings:result.warnings},{runMode:'auto',outcome:await autoOutcome(),warnings:autoWarnings(await autoOutcome())},run.stdout);
  }
  {
    const {project,files,write}=await profile();
    write(files.user,{permissionMode:'plan'});
    write(files.project,{permissionMode:'auto'});
    const run=await headless(project,'npm test',['--json','--permission-mode','bypassPermissions']);
    const result=JSON.parse(run.stdout);
    assert.deepEqual({runMode:run.mode,outcome:outcomeOf(result),warnings:result.warnings},{runMode:'bypassPermissions',outcome:'ran',warnings:[]},run.stdout);
  }
});

test('a malformed permissions value contributes no rule and still stops the start by name: the user deny is never lost',async()=>{
  for(const [label,projectFile,list] of [
    ['permissions is a string',{permissions:'Bash(cat secrets.txt)'},'"permissions"'],
    ['deny is a string',{permissions:{allow:['Bash(*)'],deny:'Bash(cat secrets.txt)'}},'"permissions.deny"'],
    ['deny holds a number',{permissions:{deny:[123]}},'"permissions.deny"'],
  ] as const){
    const {project,files,write,effective}=await profile();
    write(files.user,{permissions:{deny:['Bash(cat secrets.txt)']}});
    write(files.project,projectFile);
    const rules=(await effective()).value.permissions as RuleSetInput;
    let error:(Error&{code?:string})|undefined;
    try{const engine=createPermissionEngine({projectRoot:project,rules});assert.fail(`${label}: an engine was built; it decides cat secrets.txt as ${(await engine.decide({tool:'Bash',command:'cat secrets.txt'},{interactive:true,mode:'default'})).kind}`);}
    catch(caught){error=caught as Error&{code?:string};}
    assert.equal(error?.code,'PERMISSION_RULE_INVALID',`${label}: ${error?.message}`);
    assert.ok(error!.message.includes(files.project),`${label}: the error names the project file: ${error!.message}`);
    assert.ok(error!.message.includes(list),`${label}: the error names ${list}: ${error!.message}`);
  }
  // A malformed list in a LOWER scope is not dropped by a higher scope's valid list either: before this slice
  // the project list replaced it, and the user's intended deny vanished without a word.
  {
    const {project,files,write,effective}=await profile();
    write(files.user,{permissions:{deny:'Bash(cat secrets.txt)'}});
    write(files.project,{permissions:{deny:['Bash(curl evil.example)']}});
    const rules=(await effective()).value.permissions as RuleSetInput;
    let code:string|undefined;
    try{createPermissionEngine({projectRoot:project,rules});}catch(caught){code=(caught as {code?:string}).code;}
    assert.equal(code,'PERMISSION_RULE_INVALID','a malformed deny list in the user file stops the start instead of vanishing');
  }
});
