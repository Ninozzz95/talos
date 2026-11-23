import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {loadEffectiveConfig,writeConfigScope} from '../../src/config/load.ts';
import {ensureCliPaths,projectId,resolveCliPaths} from '../../src/paths.ts';
import {parseRule} from '../../src/security/rule-parser.ts';
import {createPermissionEngine} from '../../src/security/permission-engine.ts';
import {permissionActionToRule,persistPermissionRule} from '../../src/security/persist.ts';
import type {PermissionAction,RuleSetInput} from '../../src/security/types.ts';

// B1 slice 21. Three measured ways a permission rule broke the CLI or did nothing:
// - "allow always" on a command with a line break wrote a rule the parser cannot read, and the next
//   start threw PERMISSION_RULE_INVALID with a stack: one keypress stopped the CLI from starting;
// - "allow always" did nothing in the running session, because the engine compiled its rules once;
// - on a compound command it wrote `Bash(<whole command>)`, which matches none of the segments the
//   engine judges one at a time, so it never took effect at all.
// Everything here goes through the real writer and the real loader, in a temporary profile.

// ⛔ Hermetic. The profile the engine and `main()` resolve comes from the environment, so the
// environment is pointed at a temporary directory BEFORE anything reads it, and every secret-named
// variable is removed: nothing below may reach the owner's own %APPDATA%\TALOS-CLI or a provider.
for(const key of Object.keys(process.env))if(/KEY|TOKEN|SECRET|PASSW|AUTH|CREDENTIAL/iu.test(key))delete process.env[key];
const TEMP=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'talos-rule-integrity-')));
process.env.APPDATA=path.join(TEMP,'appdata');process.env.LOCALAPPDATA=path.join(TEMP,'localappdata');
process.env.XDG_CONFIG_HOME=path.join(TEMP,'config');process.env.XDG_STATE_HOME=path.join(TEMP,'state');process.env.XDG_CACHE_HOME=path.join(TEMP,'cache');
test.after(()=>fs.rmSync(TEMP,{recursive:true,force:true}));

const LF=String.fromCharCode(10);const CR=String.fromCharCode(13);const LS=String.fromCharCode(0x2028);
const EMPTY:RuleSetInput={allow:[],ask:[],deny:[]};
const ASKING={interactive:true,mode:'default' as const};
let projects=0;
async function profile(){
  const paths=resolveCliPaths(process.env,process.platform,os.homedir());
  assert.ok(paths.configRoot.startsWith(TEMP)&&paths.projectOverridesRoot.startsWith(TEMP),'the profile must be the temporary one');
  await ensureCliPaths(paths);
  const project=path.join(TEMP,`project-${projects+=1}`);fs.mkdirSync(project,{recursive:true});
  const files={user:path.join(paths.configRoot,'config.json'),project:path.join(project,'.talos-cli','config.json'),projectUser:path.join(paths.projectOverridesRoot,projectId(project),'config.json')};
  const persistingEngine=(rules:RuleSetInput)=>createPermissionEngine({projectRoot:project,rules,persistRule:(effect,action)=>persistPermissionRule({paths,projectRoot:project,effect,action})});
  const loadedRules=async()=>(await loadEffectiveConfig({paths,projectRoot:project})).value.permissions!;
  const stored=()=>fs.existsSync(files.projectUser)?JSON.parse(fs.readFileSync(files.projectUser,'utf8')).permissions??{}:{};
  return{paths,project,files,persistingEngine,loadedRules,stored};
}
async function answer(engine:ReturnType<typeof createPermissionEngine>,action:PermissionAction,choice:'allow-always'|'deny-always'){
  const decision=await engine.decide(action,ASKING);
  assert.equal(decision.kind,'ask',`${JSON.stringify(action.command)} must ask before it is answered`);
  if(decision.kind==='ask')await engine.resolve(decision.requestId,choice);
}
function thrown(run:()=>unknown):Error&{code?:string}{
  try{run();}catch(error){return error as Error&{code?:string};}
  assert.fail('expected the call to throw');
}

test('"allow always" on a command with a line break writes nothing unparseable, and the next start still loads',async()=>{
  for(const command of [`ls${LF}rm -rf /`,`echo "a${LF}b"`,`echo "a${CR}b"`,`echo a${LS}b`]){
    for(const choice of ['allow-always','deny-always'] as const){
      const {project,persistingEngine,loadedRules,stored}=await profile();
      await answer(persistingEngine(EMPTY),{tool:'Bash',command},choice);
      const written=stored();
      for(const effect of ['allow','ask','deny'] as const)for(const rule of written[effect]??[])
        assert.doesNotThrow(()=>parseRule(rule,effect),`${choice} on ${JSON.stringify(command)} wrote the unreadable ${effect} rule ${JSON.stringify(rule)}`);
      const rules=await loadedRules();
      assert.doesNotThrow(()=>createPermissionEngine({projectRoot:project,rules}),`the next start must load after ${choice} on ${JSON.stringify(command)}`);
    }
  }
});

test('an unparseable rule already on disk yields a named, actionable error and not a thrown stack',async()=>{
  const poison=`Bash(ls${LF}rm -rf /)`;
  for(const scope of ['project-user','project','user'] as const){
    const {paths,project,files,loadedRules}=await profile();
    await writeConfigScope({paths,projectRoot:project,scope,patch:{permissions:{allow:[poison],ask:[],deny:[]}}});
    const file=scope==='user'?files.user:scope==='project'?files.project:files.projectUser;
    const rules=await loadedRules();
    // The user file is shared by every project of this profile: it is removed, by its exact path, before
    // any assertion can stop this iteration, so no later test starts on it.
    let error:Error&{code?:string};
    try{error=thrown(()=>createPermissionEngine({projectRoot:project,rules}));}finally{if(scope==='user')fs.rmSync(files.user,{force:true});}
    assert.equal(error.code,'PERMISSION_RULE_INVALID');
    assert.ok(error.message.includes(file),`the error names the file the rule is in (${scope}): ${error.message}`);
    assert.ok(error.message.includes(JSON.stringify(poison)),`the error names the rule as it is spelled in that file: ${error.message}`);
    assert.ok(error.message.includes('"permissions.allow"'),`the error names the list to edit: ${error.message}`);
    assert.match(error.message,/Delete that entry/u,'the error says how to remove it');
    assert.doesNotMatch(error.message,/[\x00-\x1f\x7f-\x9f\u2028\u2029]/u,'no raw control character reaches a terminal through the message');
    assert.equal(String(error.stack).split(LF).length,1,`a configuration error carries no stack frames: ${error.stack}`);
  }
  // Two files define the list: the one the engine's list came from (the higher-precedence project-user file)
  // is the one named, and a separator JSON leaves raw (U+2028) reaches the message only as `\u2028`.
  {
    const {paths,project,files,loadedRules}=await profile();
    const separated=`Bash(ls${LS}rm -rf /)`;
    await writeConfigScope({paths,projectRoot:project,scope:'user',patch:{permissions:{allow:['Bash(npm test)'],ask:[],deny:[]}}});
    await writeConfigScope({paths,projectRoot:project,scope:'project-user',patch:{permissions:{allow:[separated],ask:[],deny:[]}}});
    const rules=await loadedRules();
    let error:Error&{code?:string};
    try{error=thrown(()=>createPermissionEngine({projectRoot:project,rules}));}finally{fs.rmSync(files.user,{force:true});}
    assert.ok(error.message.includes(` of ${files.projectUser} `),`the file the list came from is named: ${error.message}`);
    assert.doesNotMatch(error.message,/[\x00-\x1f\x7f-\x9f\u2028\u2029]/u,'no raw separator reaches a terminal through the message');
    assert.ok(error.message.includes(String.raw`\u2028`),`the separator is shown as its escape: ${error.message}`);
  }
  // Rules handed to the engine directly, not read from any file: the error says so instead of guessing a file.
  await profile();
  const direct=thrown(()=>createPermissionEngine({projectRoot:path.join(TEMP,'nowhere'),rules:{allow:[poison],ask:[],deny:[]}}));
  assert.match(direct.message,/It is not in .*handed to the engine directly/u,direct.message);
});

test('the rendered start with a poisoned configuration names the file and shows no stack',async()=>{
  const {paths,project,files}=await profile();
  await writeConfigScope({paths,projectRoot:project,scope:'project-user',patch:{permissions:{allow:[`Bash(ls${LF}rm -rf /)`],ask:[],deny:[]}}});
  const {main}=await import('../../src/main.ts');
  const React=(await import('react')).default;const Ink:any=await import('ink');
  const {createTuiAppComponent}=await import('../../src/tui/app.ts');
  const frames:string[]=[];let stderr='';
  const stdout:any=Object.assign(new EventEmitter(),{columns:80,rows:30,isTTY:true,write(chunk:string){frames.push(String(chunk));return true;}});
  const stdin:any=Object.assign(new PassThrough(),{isTTY:true,setRawMode(){return stdin;},ref(){},unref(){}});
  const runtime:any={restore:async()=>({}),listSessions:async()=>[],start:async()=>'s1',resume:async(id:string)=>id,subscribe(){return()=>{};},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},shell:async()=>{}};
  process.env.FORCE_COLOR='0';
  const code=await main(['--project',project],{
    io:{writeOut:()=>{},writeErr:(text:string)=>{stderr+=text;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''},
    createRuntimeContext:async()=>({runtime,tuiCatalog:{listModels:async()=>[]}}),
    runTui:async(props:any)=>{
      const TuiApp=createTuiAppComponent(React,Ink,{interactive:true,color:false,motion:false,unicode:true});
      const app=Ink.render(React.createElement(TuiApp,props),{stdout,stdin,stderr:stdout,debug:true,exitOnCtrlC:false,patchConsole:false});
      const timer=setTimeout(()=>app.unmount(),5000);
      try{await app.waitUntilExit();}finally{clearTimeout(timer);}
    },
  });
  const screen=frames.join('');const flat=screen.replace(/\s+/gu,'');
  assert.ok(flat.includes(files.projectUser.replace(/\s+/gu,'')),`the screen names the file: ${screen}`);
  assert.ok(flat.includes('"permissions.allow"'),'the screen names the list to edit');
  assert.doesNotMatch(screen,/file:\/\/\/|\.ts:\d+:\d+|react-reconciler/u,`no stack frame reaches the screen: ${screen}`);
  // R2 lane E realignment (Q-R2-4): three lines; the code once, the file named in the details.
  assert.ok(stderr.startsWith('Error: A permission rule in the configuration is not valid')&&stderr.includes('(PERMISSION_RULE_INVALID)')&&stderr.includes(files.projectUser),`the failure names the fault, the code and the file: ${stderr}`);
  assert.equal(code,10,'the exit code is the one measured before the change');
});

test('a deny rule is never skipped: every invalid shape of the deny list refuses to build the engine',async()=>{
  const {project}=await profile();
  for(const deny of [[`Bash(cat secrets.txt${LF})`],[123],['Bash(cat secrets.txt)',null],null,'Bash(cat secrets.txt)'] as unknown[]){
    const rules={allow:['Bash(*)'],ask:[],deny} as unknown as RuleSetInput;
    let engine:ReturnType<typeof createPermissionEngine>|undefined;
    let error:(Error&{code?:string})|undefined;
    try{engine=createPermissionEngine({projectRoot:project,rules});}catch(caught){error=caught as Error&{code?:string};}
    if(engine)assert.fail(`deny ${JSON.stringify(deny)} built an engine; it decides cat secrets.txt as ${(await engine.decide({tool:'Bash',command:'cat secrets.txt'},ASKING)).kind}`);
    assert.equal(error?.code,'PERMISSION_RULE_INVALID',`deny ${JSON.stringify(deny)}: ${error?.message}`);
    assert.ok(error!.message.includes('"permissions.deny"'),`the error names the deny list: ${error!.message}`);
  }
});

test('"allow always" takes effect for the identical command in the same session, and never for a neighbour',async()=>{
  const {project,persistingEngine,loadedRules,stored}=await profile();
  const engine=persistingEngine(EMPTY);
  await answer(engine,{tool:'Bash',command:'npm publish'},'allow-always');
  assert.deepEqual(stored().allow,['Bash(npm publish)']);
  assert.deepEqual(await engine.decide({tool:'Bash',command:'npm publish'},ASKING),{kind:'allow',source:'Bash(npm publish)'},'the same session obeys the rule it just wrote');
  assert.equal((await engine.decide({tool:'Bash',command:'npm publish --tag next'},ASKING)).kind,'ask','a neighbouring command still asks');
  const restarted=createPermissionEngine({projectRoot:project,rules:await loadedRules()});
  assert.deepEqual(await restarted.decide({tool:'Bash',command:'npm publish'},ASKING),{kind:'allow',source:'Bash(npm publish)'},'the next session decides exactly as this one does');
  // "deny always" too, in the safe direction.
  await answer(engine,{tool:'Bash',command:'npm unpublish'},'deny-always');
  assert.equal((await engine.decide({tool:'Bash',command:'npm unpublish'},ASKING)).kind,'deny');
});

test('"allow always" does not erase the deny rules of another configuration file',async()=>{
  const {paths,project,persistingEngine,loadedRules}=await profile();
  await writeConfigScope({paths,projectRoot:project,scope:'project',patch:{permissions:{allow:[],ask:[],deny:['Bash(curl evil.example)']}}});
  const engine=persistingEngine(await loadedRules());
  assert.equal((await engine.decide({tool:'Bash',command:'curl evil.example'},ASKING)).kind,'deny');
  await answer(engine,{tool:'Bash',command:'npm test'},'allow-always');
  const restarted=createPermissionEngine({projectRoot:project,rules:await loadedRules()});
  assert.equal((await restarted.decide({tool:'Bash',command:'curl evil.example'},ASKING)).kind,'deny','the project deny rule survives an unrelated "allow always"');
  assert.equal((await restarted.decide({tool:'Bash',command:'npm test'},ASKING)).kind,'allow');
});

test('a compound command: "always" writes nothing, never widens, says so before the key, and answers for this session only',async()=>{
  const {project,persistingEngine,loadedRules,stored}=await profile();
  const compound='git status && rm -rf build';
  const {explainApproval}=await import('../../src/tui/overlays/approval-dialog.ts');
  const preview=explainApproval({rules:EMPTY,action:{tool:'Bash',command:compound},projectRoot:project,persists:true}).alwaysSimulation as any;
  assert.equal(preview?.writes,null,'the preview does not claim a rule would be written');
  // R2 lane E realignment (gate E6): the reason is the code (lane T's describeError view) or the English sentence itself,
  // no longer a `RULE_COMPOUND_COMMAND:` prefix on the message.
  assert.match(preview?.refused??'',/RULE_COMPOUND_COMMAND|segments is not remembered|several parts/u,'the full review says why before the key is pressed');
  const engine=persistingEngine(EMPTY);
  await answer(engine,{tool:'Bash',command:compound},'allow-always');
  assert.deepEqual(stored(),{},'nothing is written for a compound command');
  assert.equal((await engine.decide({tool:'Bash',command:'rm -rf build'},ASKING)).kind,'ask','the risky segment alone is not allowed');
  assert.equal((await engine.decide({tool:'Bash',command:'echo x && rm -rf build'},ASKING)).kind,'ask','nor inside another compound');
  assert.deepEqual(await engine.decide({tool:'Bash',command:compound},ASKING),{kind:'allow',source:'session'},'the identical command is allowed for this session');
  const restarted=createPermissionEngine({projectRoot:project,rules:await loadedRules()});
  assert.equal((await restarted.decide({tool:'Bash',command:compound},ASKING)).kind,'ask','and asks again after a restart');
  await answer(engine,{tool:'Bash',command:'npm test; npm publish'},'deny-always');
  assert.deepEqual(stored(),{},'"deny always" on a compound command writes nothing either');
  // R2 lane E realignment (gate E6): the code is on error.code; the message is the English sentence alone.
  assert.throws(()=>permissionActionToRule({tool:'Bash',command:compound},project),{code:'RULE_COMPOUND_COMMAND',message:/^a command of \d+ segments is not remembered/u});
});

test('a rule that would not match the very request it was written for is not written',async()=>{
  const {project,persistingEngine,stored}=await profile();
  // `^&` is kept inside the segment by the shell splitter, and the rule matcher refuses a bare `&`:
  // measured, `Bash(echo a^&b)` never matched `echo a^&b`.
  const command='echo a^&b';
  assert.throws(()=>permissionActionToRule({tool:'Bash',command},project),{code:'RULE_MATCHES_NOTHING',message:/^the rule for this request would not match/u});// R2 lane E realignment (gate E6)
  const engine=persistingEngine(EMPTY);
  await answer(engine,{tool:'Bash',command},'allow-always');
  assert.deepEqual(stored(),{});
  assert.deepEqual(await engine.decide({tool:'Bash',command},ASKING),{kind:'allow',source:'session'});
});

test('after "allow always", the approval dialog of the same session explains with the rule the engine now obeys',async()=>{
  // The dialog's per-segment account is computed from the rule set the session was started with. If the
  // engine obeys a rule that set does not show, the account contradicts the verdict and is withheld.
  const {paths,project,stored}=await profile();
  const {createTuiSessionController}=await import('../../src/tui/session-controller.ts');
  const dialog=await import('../../src/tui/overlays/approval-dialog.ts');
  const sinks=new Map<string,(event:any)=>void>();
  const runtime:any={start:async()=>'s1',subscribe(id:string,sink:(event:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},answerApproval:async()=>{},cancel:async()=>{},close:async()=>{}};
  let pending:any=null;
  const rules:RuleSetInput={allow:[],ask:[],deny:[]};
  const controller=createTuiSessionController({runtime,projectRoot:project,model:'m',mode:'default',rules,paths,onEvent:()=>{},onApproval:(next:any)=>{pending=next;}});
  const id=await controller.initialize({initialPrompt:'x'});
  const ask=async(requestId:string,comando:string)=>{pending=null;sinks.get(id!)!({type:'ApprovalRequested',requestId,azione:{tipo:'comando',comando}});await new Promise(resolve=>setTimeout(resolve,10));return pending;};
  const first=await ask('r1','npm test');
  assert.ok(first,'npm test asks first');
  await controller.resolveApproval('r1','allow-always');
  assert.deepEqual(stored().allow,['Bash(npm test)']);
  const second=await ask('r2','npm test && npm publish');
  controller.close();
  assert.ok(second,'the compound command still asks, for its second segment');
  assert.equal(second.reason,'segment 2: no rule matched');
  const model:any=dialog.approvalDialogModel(second,{expanded:false});
  assert.equal(model.segmentsWithheld,undefined,`the account agrees with the verdict: ${model.segmentsWithheld}`);
  assert.deepEqual(model.segments.map((row:any)=>[row.position,row.effect,row.rule??null]),[[1,'allow','Bash(npm test)'],[2,'ask',null]]);
});

test('a refused "always" is still answered: the approval reaches the runtime and nothing is written',async()=>{
  // Measured at 805c89a0 through the real controller: "allow always" on `npm run test:*` rejected with
  // RULE_NOT_NARROWED and the runtime's approval was never answered.
  const {paths,project,stored}=await profile();
  const {createTuiSessionController}=await import('../../src/tui/session-controller.ts');
  const answers:string[]=[];const sinks=new Map<string,(event:any)=>void>();
  const runtime:any={start:async()=>'s1',subscribe(id:string,sink:(event:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},answerApproval:async(_s:string,requestId:string,approved:boolean)=>{answers.push(`${requestId}=${approved}`);},cancel:async()=>{},close:async()=>{}};
  const controller=createTuiSessionController({runtime,projectRoot:project,model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},paths,onEvent:()=>{},onApproval:()=>{}});
  const id=await controller.initialize({initialPrompt:'x'});
  try{
    for(const [requestId,comando,choice] of [['r1','npm run test:*','allow-always'],['r2','git status && rm -rf build','allow-always'],['r3','npm test; npm publish','deny-always']] as const){
      sinks.get(id!)!({type:'ApprovalRequested',requestId,azione:{tipo:'comando',comando}});
      await new Promise(resolve=>setTimeout(resolve,10));
      await controller.resolveApproval(requestId,choice);
    }
  }finally{controller.close();}
  assert.deepEqual(answers,['r1=true','r2=true','r3=false']);
  assert.deepEqual(stored(),{});
});

test('a deny list that is not a list, on disk, stops the start by name instead of being dropped',async()=>{
  for(const [label,content,listName] of [
    ['deny is a string',{permissions:{allow:['Bash(*)'],deny:'Bash(cat secrets.txt)'}},'"permissions.deny"'],
    ['permissions is a string',{permissions:'Bash(cat secrets.txt)'},'"permissions"'],
  ] as const){
    const {paths,project,files,loadedRules}=await profile();
    fs.mkdirSync(path.dirname(files.projectUser),{recursive:true});
    fs.writeFileSync(files.projectUser,`${JSON.stringify(content,null,2)}\n`);
    const rules=await loadedRules();
    const error=thrown(()=>createPermissionEngine({projectRoot:project,rules}));
    assert.equal(error.code,'PERMISSION_RULE_INVALID',label);
    assert.ok(error.message.includes(files.projectUser),`${label}: the error names the file: ${error.message}`);
    assert.ok(error.message.includes(`${listName} of `),`${label}: the error names ${listName}: ${error.message}`);
    assert.doesNotMatch(error.message,/handed to the engine directly/u,label);
    void paths;
  }
});
