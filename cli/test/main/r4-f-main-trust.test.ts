/*
 * R4 lane F — main.ts asks the trust question for every folder with no saved decision (Q-R4-1), saves the choice made
 * (Q-R4-2: this folder, the parent folder, or nothing for the home folder / a drive root), never asks headless (E3), and
 * tells the TUI which instruction files were loaded (Q-R4-13, `Loaded AGENTS.md`), read only after trust (E1).
 */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {main} from '../../src/main.ts';

const ENV=['XDG_CONFIG_HOME','XDG_STATE_HOME','XDG_CACHE_HOME'] as const;
async function withProfile<T>(run:(root:string,project:string)=>Promise<T>):Promise<T>{
  const root=await mkdtemp(join(tmpdir(),'r4-f-main-trust-'));const project=join(root,'project');
  const {mkdir}=await import('node:fs/promises');await mkdir(project,{recursive:true});
  const previous=ENV.map(name=>process.env[name]);ENV.forEach((name,index)=>{process.env[name]=join(root,['config','state','cache'][index]!);});
  try{return await run(root,project);}finally{ENV.forEach((name,index)=>{const value=previous[index];if(value===undefined)delete process.env[name];else process.env[name]=value;});}
}
function io(){return{stdout:'',stderr:'',writeOut(s:string){this.stdout+=s;},writeErr(s:string){this.stderr+=s;},stdinIsTTY:true,stdoutIsTTY:true,readStdin:async()=>''} as any;}
function assessment(project:string,{trusted=true,resources=[] as any[],folder={decided:false,source:null,path:null,sessionOnly:false,parent:join(project,'..')} as any}={}){
  return{trusted,reason:trusted?'NO_PROJECT_RESOURCES':'PROJECT_UNTRUSTED',workspace:{requestedRoot:project,canonicalRoot:project,gitRoot:null,nestedRepository:false,identityHash:'r4-f'},resources,storeSchema:null,migrationRequired:false,folder} as any;
}
const agents={workspaceIdentityHash:'r4-f',kind:'context',id:'AGENTS.md',relativePath:'AGENTS.md',fingerprint:'abc'};
async function launch(project:string,deps:Record<string,unknown>,args:string[]=[]){
  const calls:{prompt:any[];grant:any[];tui:any[];order:string[]}={prompt:[],grant:[],tui:[],order:[]};const out=io();
  const code=await main(['--project',project,...args],{io:out,
    promptProjectTrust:async(x:any)=>{calls.order.push('prompt');calls.prompt.push(x);return deps.choice??'trust';},
    trustProjectAssessment:async(x:any)=>{calls.order.push('grant');calls.grant.push(x);return{...x.assessment,trusted:true,folder:{...x.assessment.folder,decided:true}};},
    createRuntimeContext:async()=>{calls.order.push('context');return{runtime:{close:async()=>{}},tuiCatalog:{}};},
    runTui:async(x:any)=>{calls.order.push('tui');calls.tui.push(x);},
    loadedFiles:async()=>{calls.order.push('loaded');return['AGENTS.md'];},
    ...deps} as any);
  return{code,calls,out};
}

test('Q-R4-1: a folder with no project files and no decision is asked; "Trust this folder" saves it for this folder',()=>withProfile(async(_root,project)=>{
  const {code,calls}=await launch(project,{assessProjectTrust:async()=>assessment(project)});
  assert.equal(code,0);
  assert.equal(calls.prompt.length,1,'the plain folder is asked');
  assert.equal(calls.grant.length,1);assert.equal(calls.grant[0].folder,'this');
  assert.deepEqual(calls.order.slice(0,3),['prompt','grant','context'],'decided before anything is loaded (E1)');
}));

test('Q-R4-2: "Trust the parent folder" saves the decision for the parent',()=>withProfile(async(_root,project)=>{
  const {code,calls}=await launch(project,{choice:'trust-parent',assessProjectTrust:async()=>assessment(project)});
  assert.equal(code,0);assert.equal(calls.grant.length,1);assert.equal(calls.grant[0].folder,'parent');
}));

test('Q-R4-1: the home folder with nothing to trust is asked at every start and nothing is written',()=>withProfile(async(_root,project)=>{
  const home=assessment(project,{folder:{decided:false,source:null,path:null,sessionOnly:true,parent:null}});
  const {code,calls}=await launch(project,{assessProjectTrust:async()=>home});
  assert.equal(code,0);assert.equal(calls.prompt.length,1);assert.equal(calls.grant.length,0,'nothing is saved for the home folder');
  assert.equal(calls.tui.length,1);
  const withFiles=assessment(project,{trusted:false,resources:[agents],folder:{decided:false,source:null,path:null,sessionOnly:true,parent:null}});
  const second=await launch(project,{assessProjectTrust:async()=>withFiles});
  assert.equal(second.calls.grant.length,1);assert.equal(second.calls.grant[0].folder,'none','the folder is not saved');
  assert.equal(second.calls.grant[0].sessionOnly,true,'Q-R4-17: its files are trusted for this session only');
}));

test('Q-R4-1: a decided folder whose files are trusted is not asked',()=>withProfile(async(_root,project)=>{
  const decided=assessment(project,{folder:{decided:true,source:'folder',path:project,sessionOnly:false,parent:null}});
  const {code,calls}=await launch(project,{assessProjectTrust:async()=>decided});
  assert.equal(code,0);assert.equal(calls.prompt.length,0);assert.equal(calls.grant.length,0);assert.equal(calls.tui.length,1);
}));

test('Q-R4-2: Cancel on a plain folder starts nothing and exits 2 with PROJECT_TRUST_REQUIRED',()=>withProfile(async(_root,project)=>{
  const {code,calls,out}=await launch(project,{choice:'cancel',assessProjectTrust:async()=>assessment(project),createRuntimeContext:async()=>{throw new Error('must not start');}});
  assert.equal(code,2);assert.equal(calls.grant.length,0);assert.match(out.stderr,/PROJECT_TRUST_REQUIRED/u);
}));

test('decision 2: «Only this time» trusts the files for this process only and saves no folder decision',()=>withProfile(async(_root,project)=>{
  const plain=await launch(project,{choice:'once',assessProjectTrust:async()=>assessment(project)});
  assert.equal(plain.code,0);assert.equal(plain.calls.grant.length,0,'a folder with nothing to trust: nothing written, asked again next time');
  assert.equal(plain.calls.tui.length,1,'and TALOS opens');
  const withFiles=await launch(project,{choice:'once',assessProjectTrust:async()=>assessment(project,{trusted:false,resources:[agents]})});
  assert.equal(withFiles.code,0);assert.equal(withFiles.calls.grant.length,1);
  assert.equal(withFiles.calls.grant[0].folder,'none','no folder decision is saved');
  assert.equal(withFiles.calls.grant[0].sessionOnly,true,'the files are trusted in memory, for this process');
  assert.deepEqual(withFiles.calls.order.slice(0,3),['prompt','grant','context'],'decided before anything is loaded (E1)');
}));

test('No (a): TALOS opens, the folder stays untrusted, nothing is saved, nothing of it is listed as loaded, and the mode is the asking one',()=>withProfile(async(_root,project)=>{
  const contexts:any[]=[];let readFolder=false;
  const {code,calls}=await launch(project,{choice:'no',assessProjectTrust:async()=>assessment(project,{trusted:false,resources:[agents]}),createRuntimeContext:async(x:any)=>{contexts.push(x);return{runtime:{},tuiCatalog:{}};},loadedFiles:async()=>{readFolder=true;return['AGENTS.md'];}},['--permission-mode','bypassPermissions']);
  assert.equal(code,0);assert.equal(calls.grant.length,0,'No writes no trust');
  assert.equal(calls.tui.length,1,'the screen opens');
  assert.equal(calls.tui[0].projectUntrusted,true);assert.deepEqual(calls.tui[0].loadedFiles,[]);assert.equal(readFolder,false,'the folder is not even read');
  assert.equal(calls.tui[0].invocation.permissionMode,'default','Full access from the command line does not pass');
  assert.equal(contexts[0]?.projectUntrusted,true,'the runtime knows it');
}));

test('Q-R4-3: the question is drawn without colour when --no-color is given',()=>withProfile(async(_root,project)=>{
  const {calls}=await launch(project,{assessProjectTrust:async()=>assessment(project)},['--no-color']);
  assert.equal(calls.prompt[0].color,false);
  const coloured=await launch(project,{assessProjectTrust:async()=>assessment(project)});
  assert.equal(coloured.calls.prompt[0].color,true);
}));

test('Q-R4-13: the TUI is told which instruction files were loaded, read after trust',()=>withProfile(async(_root,project)=>{
  const {calls}=await launch(project,{assessProjectTrust:async()=>assessment(project)});
  assert.deepEqual(calls.tui[0].loadedFiles,['AGENTS.md']);
  assert.ok(calls.order.indexOf('loaded')>calls.order.indexOf('grant'),`the files are read after trust: ${calls.order.join(' → ')}`);
}));

test('Q-R4-13: by default the files come from the kernel\'s own finder (AGENTS.md here, nothing in an empty folder)',()=>withProfile(async(root,project)=>{
  await writeFile(join(project,'AGENTS.md'),'Always answer in English.\n');
  const decided=assessment(project,{folder:{decided:true,source:'folder',path:project,sessionOnly:false,parent:null}});
  const withAgents=await launch(project,{assessProjectTrust:async()=>decided,loadedFiles:undefined});
  assert.deepEqual(withAgents.calls.tui[0].loadedFiles,['AGENTS.md']);
  const empty=join(root,'empty');const {mkdir}=await import('node:fs/promises');await mkdir(empty);
  const none=await launch(empty,{assessProjectTrust:async()=>({...decided,workspace:{...decided.workspace,canonicalRoot:empty,requestedRoot:empty}}),loadedFiles:undefined});
  assert.deepEqual(none.calls.tui[0].loadedFiles,[]);
}));
