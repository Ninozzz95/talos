import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {runConfigCommand} from '../../src/commands/config-cli.ts';

function paths(root:string){return{configRoot:join(root,'config'),dataRoot:join(root,'data'),cacheRoot:join(root,'cache'),sessionsRoot:join(root,'data','sessions'),logsRoot:join(root,'data','logs'),projectOverridesRoot:join(root,'data','project-overrides'),trust:{hooks:join(root,'trust-hooks'),mcp:join(root,'trust-mcp'),plugins:join(root,'trust-plugins'),projects:join(root,'trust-projects')}};}
async function snapshot(root:string){const rows:Record<string,string>={};async function walk(dir:string,prefix=''){let entries:any[]=[];try{entries=await readdir(dir,{withFileTypes:true});}catch{return;}for(const entry of entries){const path=join(dir,entry.name);const rel=prefix?prefix+'/'+entry.name:entry.name;if(entry.isDirectory())await walk(path,rel);else if(entry.isFile())rows[rel]=await readFile(path,'utf8');}}await walk(root);return rows;}
function context(root:string,out:string[],format:'json'|'text',runtime:{calls:number}){return{invocation:{outputFormat:format} as any,io:{writeOut:(s:string)=>out.push(s),writeErr(){},stdinIsTTY:false,stdoutIsTTY:false,readStdin:async()=>''},projectRoot:join(root,'project'),paths:paths(root),repoRoot:root,createRuntimeContext:async()=>{runtime.calls++;throw new Error('DRY_RUN_MUST_NOT_CREATE_RUNTIME');}} as any;}

test('config permissions dry-run explains compound precedence without executing or persisting anything',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-permission-dry-run-'));await mkdir(join(root,'project'),{recursive:true});
  const out:string[]=[];const runtime={calls:0};const ctx=context(root,out,'json',runtime);
  assert.equal(await runConfigCommand(ctx,['set','permissions',JSON.stringify({allow:['Bash(git status)'],ask:[],deny:['Bash(rm -rf build)']}),'--scope','project-user']),0);
  const before=await snapshot(root);out.length=0;
  const code=await runConfigCommand(ctx,['permissions','dry-run','--tool','Bash','--command','git status && rm -rf build']);
  assert.equal(code,0);
  const result=JSON.parse(out.at(-1)!);
  assert.equal(result.effect,'deny');
  assert.equal(result.requiresApproval,false);
  assert.equal(result.explanation.precedence,'deny > ask > allow');
  assert.equal(result.explanation.decisiveSegment,1);
  assert.deepEqual(result.explanation.segments.map((row:any)=>[row.command,row.effect,row.rule??null]),[
    ['git status','allow','Bash(git status)'],
    ['rm -rf build','deny','Bash(rm -rf build)'],
  ]);
  assert.equal(runtime.calls,0,'dry-run must not create a runtime');
  assert.deepEqual(await snapshot(root),before,'dry-run must not write or mutate permission configuration');
});

test('text dry-run names the verdict, precedence and decisive segment for a human',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-permission-dry-run-text-'));await mkdir(join(root,'project'),{recursive:true});
  const out:string[]=[];const runtime={calls:0};const ctx=context(root,out,'text',runtime);
  await runConfigCommand(ctx,['set','permissions',JSON.stringify({allow:['Bash(git status)'],ask:[],deny:['Bash(git push)']}),'--scope','project-user']);
  out.length=0;
  assert.equal(await runConfigCommand(ctx,['permissions','dry-run','--tool','Bash','--command','git status && git push']),0);
  const text=out.join('');
  assert.match(text,/\bdeny\b/u);
  assert.match(text,/deny > ask > allow/u);
  assert.match(text,/segment 2/u);
  assert.match(text,/git push/u);
  assert.equal(runtime.calls,0);
});

/*
 * F-P-001 (stress test 0.5.2): the dry-run read the rules alone, so it said deny for `mkdir` that acceptEdits runs and allow for
 * reading `.env`, which a session asks about in every mode. It now answers in the mode a run would use, with the kernel's own
 * secret check, for a session and for -p.
 */
const REPO_ROOT=join(import.meta.dirname,'..','..','..');
function modeContext(root:string,out:string[],permissionMode?:string){const ctx=context(root,out,'json',{calls:0});ctx.repoRoot=REPO_ROOT;if(permissionMode)ctx.invocation.permissionMode=permissionMode;return ctx;}

test('F-P-001: the dry-run answers in the chosen mode, for a session and for -p',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-permission-dry-run-mode-'));await mkdir(join(root,'project'),{recursive:true});
  const verdict=async(mode:string|undefined,args:string[])=>{const out:string[]=[];assert.equal(await runConfigCommand(modeContext(root,out,mode),['permissions','dry-run',...args]),0);return JSON.parse(out.at(-1)!);};
  const manual=await verdict(undefined,['--tool','Bash','--command','mkdir out']);
  assert.deepEqual([manual.mode,manual.effect,manual.inSession.effect,manual.print.effect,manual.rules],['default','ask','ask','deny','ask']);
  const edits=await verdict('acceptEdits',['--tool','Bash','--command','mkdir out']);
  assert.deepEqual([edits.mode,edits.effect,edits.print.effect],['acceptEdits','allow','allow']);
  const other=await verdict('acceptEdits',['--tool','Bash','--command','npm test']);
  assert.deepEqual([other.effect,other.print.effect],['ask','deny'],'acceptEdits asks for any other command; -p refuses it');
  const full=await verdict('bypassPermissions',['--tool','Bash','--command','npm test']);
  assert.equal(full.effect,'allow');
});

test('F-P-001: reading .env is marked as a secret and asks, -p refuses it; Full access reads it (owner 16/10/2026)',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-permission-dry-run-secret-'));await mkdir(join(root,'project'),{recursive:true});
  for(const mode of ['default','acceptEdits','bypassPermissions']){
    const out:string[]=[];assert.equal(await runConfigCommand(modeContext(root,out,mode),['permissions','dry-run','--tool','Read','--resource','.env']),0);
    const result=JSON.parse(out.at(-1)!);
    const full=mode==='bypassPermissions';
    assert.deepEqual([result.sensitive,result.secretCheck,result.effect,result.print.effect,result.rules],['secret','done',full?'allow':'ask',full?'allow':'deny','allow'],mode);
  }
  const plain:string[]=[];await runConfigCommand(modeContext(root,plain,'bypassPermissions'),['permissions','dry-run','--tool','Read','--resource','README.md']);
  assert.equal(JSON.parse(plain.at(-1)!).sensitive,null);
});

test('F-P-001: the configured mode is used when none is given, and a missing kernel check is said',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-permission-dry-run-config-'));await mkdir(join(root,'project'),{recursive:true});
  const out:string[]=[];const ctx=modeContext(root,out);
  assert.equal(await runConfigCommand(ctx,['set','permissionMode','"acceptEdits"','--scope','user']),0);out.length=0;
  await runConfigCommand(ctx,['permissions','dry-run','--tool','Bash','--command','mkdir out']);
  assert.deepEqual([JSON.parse(out.at(-1)!).mode,JSON.parse(out.at(-1)!).effect],['acceptEdits','allow']);
  const text:string[]=[];const textCtx=context(root,text,'text',{calls:0});
  await runConfigCommand(textCtx,['permissions','dry-run','--tool','Read','--resource','.env']);
  assert.match(text.join(''),/Secret check unavailable/u,'a dry-run that could not run the kernel check says so');
});

/*
 * F-P-001 second pass (stress test of 0.5.3): in `auto` the dry-run said "ask" for everything, because it had no classifier,
 * while -p allowed a write inside and denied mkdir. It now uses the session's classifier (main.ts createLocalAutoClassifier).
 */
test('F-P-001: in auto the dry-run answers with the session classifier: a write inside goes, mkdir is refused in -p',async()=>{
  const root=await mkdtemp(join(tmpdir(),'talos-permission-dry-run-auto-'));await mkdir(join(root,'project'),{recursive:true});
  const verdict=async(args:string[])=>{const out:string[]=[];assert.equal(await runConfigCommand(modeContext(root,out,'auto'),['permissions','dry-run',...args]),0);return JSON.parse(out.at(-1)!);};
  const write=await verdict(['--tool','Write','--resource','notes.txt']);
  assert.deepEqual([write.mode,write.effect,write.print.effect,write.inSession.reason],['auto','allow','allow','the automatic classifier lets it go']);
  const mkdirRun=await verdict(['--tool','Bash','--command','mkdir out']);
  assert.deepEqual([mkdirRun.inSession.effect,mkdirRun.print.effect],['ask','deny'],'mkdir is not a command the classifier allows: asked in a session, refused in -p');
  const env=await verdict(['--tool','Read','--resource','.env']);
  assert.deepEqual([env.sensitive,env.print.effect],['secret','deny'],'a secret is never allowed by the classifier');
});
