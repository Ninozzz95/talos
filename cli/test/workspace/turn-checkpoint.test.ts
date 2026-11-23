import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

import {collectHeadlessFork,collectHeadlessResume,collectHeadlessRun} from '../../src/headless/run.ts';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {undoCheckpoint} from '../../src/workspace/restore.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {composeTalosRuntime} from '../../src/runtime/talos-composition.ts';
import {fileURLToPath} from 'node:url';

const REPO_ROOT=fileURLToPath(new URL('../../../',import.meta.url));

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'talos-turn-checkpoint-'));
  const projectRoot=join(root,'project'),checkpointsRoot=join(root,'checkpoints'),queueRoot=join(root,'queue');
  await mkdir(projectRoot,{recursive:true});
  await writeFile(join(projectRoot,'state.txt'),'before','utf8');
  return{root,projectRoot,checkpointsRoot,queueRoot};
}
async function waitFor(predicate:()=>Promise<boolean>,label:string){
  for(let attempt=0;attempt<100;attempt+=1){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.fail(`Timed out waiting for ${label}`);
}
function runtimeBase(){
  let sink:((event:any)=>void)|null=null;
  const runtime:any={
    restore:async()=>({restored:1,total:1}),
    start:async()=> 's1',
    resume:async(id:string)=>id,
    fork:async()=> 'child',
    setDefaultReasoningEffort(){},
    setReasoningEffort:async()=>{},
    steer:async()=>({redirectId:'r'}),
    compact:async()=>({}),
    listSessions:async()=>[],
    subscribe(_id:string,next:(event:any)=>void){sink=next;queueMicrotask(()=>next({type:'RunFinished'}));return()=>{sink=null;};},
    answerApproval:async()=>{},cancel:async()=>{},shell:async()=>{},export:()=>({eventi:[]}),close:async()=>{},
  };
  return{runtime,get sink(){return sink;}};
}

test('headless start/resume/fork persist an open checkpoint before invoking the runtime mutation',async()=>{
  for(const operation of ['start','resume','fork'] as const){
    const {projectRoot,checkpointsRoot}=await fixture();
    const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
    const f=runtimeBase();
    const assertOpen=async()=>{
      const rows=await store.list();
      assert.equal(rows.length,1,operation);
      assert.equal(rows[0]?.state,'open',operation);
      await writeFile(join(projectRoot,'state.txt'),operation,'utf8');
    };
    if(operation==='start')f.runtime.start=async()=>{await assertOpen();return's1';};
    if(operation==='resume')f.runtime.resume=async(id:string)=>{await assertOpen();return id;};
    if(operation==='fork')f.runtime.fork=async()=>{await assertOpen();return'child';};
    const input:any={projectRoot,model:'m',permissionMode:'default',checkpointsRoot};
    if(operation==='start')await collectHeadlessRun(f.runtime,{...input,prompt:'go'});
    if(operation==='resume')await collectHeadlessResume(f.runtime,'s1','go',input);
    if(operation==='fork')await collectHeadlessFork(f.runtime,'s1','go',input);
    const [record]=await store.list();
    assert.equal(record?.state,'complete',operation);
    assert.ok(record?.post,operation);
  }
});

/* D1 (stress test 03/10, owner «Mai bloccare»): a checkpoint that cannot be taken never stops a headless run */
test('a headless run whose checkpoint cannot be taken still runs, without /undo',async()=>{
  const {root,projectRoot}=await fixture();const notAFolder=join(root,'checkpoints-file');await writeFile(notAFolder,'not a directory','utf8');
  const f=runtimeBase();let started=false;f.runtime.start=async()=>{started=true;return's1';};
  const result=await collectHeadlessRun(f.runtime,{projectRoot,model:'m',permissionMode:'default',checkpointsRoot:notAFolder,prompt:'go'} as any);
  assert.equal(started,true,'the run starts');
  assert.doesNotMatch(JSON.stringify(result.result),/CHECKPOINT/u);
});

test('plan/read-only headless turns do not claim a filesystem checkpoint',async()=>{
  const {projectRoot,checkpointsRoot}=await fixture();
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const f=runtimeBase();
  f.runtime.start=async()=>{assert.deepEqual(await store.list(),[]);return's1';};
  await collectHeadlessRun(f.runtime,{projectRoot,prompt:'inspect',model:'m',permissionMode:'plan',checkpointsRoot} as any);
  assert.deepEqual(await store.list(),[]);
});

for(const protocolVersion of ['v1','v2'] as const){
 for(const operation of ['start','resume','fork'] as const){
  test(`REV-PERF-FIRST ${protocolVersion} ${operation}: runtime-owned read-only turns avoid eager snapshots`,async()=>{
   const {projectRoot,checkpointsRoot}=await fixture();const f=runtimeBase();
   const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});const settled:string[]=[];
   f.runtime.modelCheckpoints={projectRoot,rootDir:checkpointsRoot,async settle(id:string){settled.push(id);assert.deepEqual(await store.list(),[]);}};
   const input:any={projectRoot,checkpointsRoot,model:'m',permissionMode:'default',protocolVersion};
   if(operation==='start')await collectHeadlessRun(f.runtime,{...input,prompt:'inspect'});
   if(operation==='resume')await collectHeadlessResume(f.runtime,'s1','inspect',input);
   if(operation==='fork')await collectHeadlessFork(f.runtime,'s1','inspect',input);
   assert.deepEqual(await store.list(),[],'a read-only model turn never captures the workspace');
   assert.deepEqual(settled,[operation==='fork'?'child':'s1'],'settle follows the actual session id');
  });
 }
 test(`REV-PERF-FIRST ${protocolVersion}: terminal waits for runtime checkpoint durability and surfaces failure`,async()=>{
  for(const fail of [false,true]){
   const {projectRoot,checkpointsRoot}=await fixture();const f=runtimeBase();let release!:()=>void;let entered!:()=>void;
   const barrier=new Promise<void>(resolve=>{release=resolve;});const waiting=new Promise<void>(resolve=>{entered=resolve;});
   f.runtime.modelCheckpoints={projectRoot,rootDir:checkpointsRoot,async settle(){entered();await barrier;if(fail)throw new Error('durable write refused');}};
   let finished=false;const task=collectHeadlessRun(f.runtime,{projectRoot,checkpointsRoot,model:'m',permissionMode:'default',prompt:'go',protocolVersion} as any).then(result=>{finished=true;return result;});
   // Bounded observation: the old implementation completes without calling settle.
   await Promise.race([waiting,task]);assert.equal(finished,false,'RunFinished must not outrun durability');release();
   const outcome=await task;const serialized=JSON.stringify(outcome.result);
   assert.equal(serialized.includes('CHECKPOINT_FINALIZE_FAILED'),fail,serialized);
  }
 });
}

test('REV-PERF-FIRST different checkpoint roots retain the eager compatibility checkpoint',async()=>{
 const {projectRoot,checkpointsRoot}=await fixture();const f=runtimeBase();
 const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
 f.runtime.modelCheckpoints={projectRoot,rootDir:join(checkpointsRoot,'other'),async settle(){assert.fail('unrelated checkpoint owner');}};
 f.runtime.start=async()=>{assert.equal((await store.list())[0]?.state,'open');return's1';};
 await collectHeadlessRun(f.runtime,{projectRoot,checkpointsRoot,model:'m',permissionMode:'default',prompt:'go'});
 assert.equal((await store.list())[0]?.state,'complete');
});

test('REV-PERF-EXTENSION an unsafe deferred scope retains the eager checkpoint',async()=>{
 const {projectRoot,checkpointsRoot}=await fixture();const f=runtimeBase();const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
 f.runtime.modelCheckpoints={projectRoot,rootDir:checkpointsRoot,canDefer:async()=>false,settle:async()=>{}};
 f.runtime.start=async()=>{assert.equal((await store.list())[0]?.state,'open');return's1';};
 await collectHeadlessRun(f.runtime,{projectRoot,checkpointsRoot,model:'m',permissionMode:'default',prompt:'go'});
});

for(const callback of ['onDelega','onArtefatto','chiamaToolMcpFn','eseguiToolPluginFn','eseguiToolForgeFn']){
 test(`REV-PERF-EXTENSION ${callback} snapshots before callback effects`,async()=>{
  const {root,projectRoot,checkpointsRoot,queueRoot}=await fixture();const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});let options:any;
  const modules:any={createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
   createOwnerRuntimeAdapter:()=>({attrezziKernel:async()=>({base:[],estesi:[]}),talosLavora:async(input:any)=>{assert.equal(await input[callback]('argument'),42);return{};}}),
   avviaSessione:async(input:any)=>input.talosLavoraFn({checkpointSessionId:'s1',[callback]:async(arg:string)=>{assert.equal(arg,'argument');assert.equal((await store.list())[0]?.state,'open');await writeFile(join(projectRoot,'state.txt'),'callback-after');return 42;}}),
   /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(input:any)=>{options=input;return{attendiAssestamento:async()=>{},ripristina:async()=>({ripristinate:0,totali:0}),iscriviti:()=>()=>{}};}};
  const data=join(root,'data');const paths:any={configRoot:join(root,'config'),dataRoot:data,cacheRoot:join(root,'cache'),sessionsRoot:join(data,'sessions'),logsRoot:join(data,'logs'),projectOverridesRoot:join(root,'config','projects'),checkpointsRoot,queueRoot,trust:{hooks:join(data,'trust','hooks'),mcp:join(data,'trust','mcp'),plugins:join(data,'trust','plugins'),projects:join(data,'trust','projects')}};
  await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot,paths,model:'m',env:{},modules});await options.avviaSessioneFn({});
  const rows=await store.list();assert.equal(rows.length,1);assert.equal(rows[0].state,'complete');assert.ok(rows[0].post);
  await undoCheckpoint({store,id:rows[0].id});assert.equal(await readFile(join(projectRoot,'state.txt'),'utf8'),'before');
 });
}

/*
 * R0 realignment (2026-09-23). Since `e1f7eb363` ("dispatch model before mutation checkpoint", RED `f47ced78c`) the
 * TUI controller no longer opens a model checkpoint before `runtime.start`: the composition opens it LAZILY, at the
 * kernel's pre-mutation barrier (`primaDiMutazioneFn`), and finalizes it when the kernel turn ends. The property this
 * test protected — "a model turn's filesystem effect is covered by a checkpoint opened before the write and finalized at
 * the run boundary" — now lives in the composition, so the test drives the composition, not the controller.
 */
test('a model turn is checkpointed at its first mutation and finalized when the kernel turn ends',async t=>{
  const {root,projectRoot,checkpointsRoot,queueRoot}=await fixture();
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const seen:string[]=[];let registryOpts:any=null;let releaseSettlement!:()=>void;
  const settlement=new Promise<void>(resolve=>{releaseSettlement=resolve;});
  const modules:any={
    createProviderCredentialStore:()=>({loadFromKeyring(){},getKey:()=>'k',getRuntime:()=>({}),hasKey:()=>true}),
    createOwnerRuntimeAdapter:()=>({attrezziKernel:async()=>({base:[],estesi:[]}),talosLavora:async(input:any)=>{
      seen.push(`before-barrier:${(await store.list()).length}`);
      await input.primaDiMutazioneFn({tipo:'scrittura'});
      seen.push(`after-barrier:${(await store.list())[0]?.state}`);
      await writeFile(join(projectRoot,'state.txt'),'model-after','utf8');
      await input.primaDiMutazioneFn({tipo:'scrittura'});
      seen.push(`second-barrier:${(await store.list()).length}`);
      return{};
    }}),
    avviaSessione:async(input:any)=>input.talosLavoraFn({checkpointSessionId:'s1',checkpointOperation:'start'}),
    /* stage 3: the kernel's own tool list, as session-registry.mjs exports it */STRUMENTI_ESTESI_PREDEFINITI:Object.freeze(['ask_user_question','present_plan']),createSessionRegistry:(options:any)=>{registryOpts=options;return{attendiAssestamento:async(id:string)=>{assert.equal(id,'s1');await settlement;},ripristina:async()=>({ripristinate:0,totali:0}),avviaLibero:()=>({sessionId:'s1'}),iscriviti:()=>()=>{},ferma:()=>true,rispondiApprovazione:()=>({ok:true})};},
  };
  const data=join(root,'data');
  const paths={configRoot:join(root,'config'),dataRoot:data,cacheRoot:join(root,'cache'),sessionsRoot:join(data,'sessions'),logsRoot:join(data,'logs'),projectOverridesRoot:join(root,'config','projects'),checkpointsRoot,queueRoot,trust:{hooks:join(data,'trust','hooks'),mcp:join(data,'trust','mcp'),plugins:join(data,'trust','plugins'),projects:join(data,'trust','projects')}};
  const context=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot,paths:paths as any,model:'m',env:{},modules});
  await registryOpts.avviaSessioneFn({});
  assert.deepEqual(seen,['before-barrier:0','after-barrier:open','second-barrier:1'],'no checkpoint before the first mutation, one open at the barrier, and a second mutation reuses it');
  const [record]=await store.list();
  assert.equal(record?.operation,'start');
  assert.equal(record?.state,'complete','the checkpoint is finalized when the kernel turn ends');
  assert.ok(record?.post,'the finalized checkpoint carries the post-state');
  await t.test('REV-PERF-FIRST composition checkpoint capability waits for registry settlement',async()=>{
    let complete=false;const ready=context.runtime.modelCheckpoints!.settle('s1').then(()=>{complete=true;});
    try{await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(complete,false,'terminal notification is not registry settlement');}
    finally{releaseSettlement();await ready;}
    assert.equal(complete,true);
  });
});

test('TUI direct shell binds the synchronous command id and finalizes only on ComandoUtenteFinito',async()=>{
  const {root,projectRoot,checkpointsRoot,queueRoot}=await fixture();
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const f=runtimeBase();
  const sinks=new Map<string,(event:any)=>void>();
  f.runtime.subscribe=(id:string,sink:(event:any)=>void)=>{sinks.set(id,sink);return()=>sinks.delete(id);};
  const controller=createTuiSessionController({
    runtime:f.runtime,projectRoot,model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},
    paths:{checkpointsRoot,queueRoot,dataRoot:join(root,'data')} as any,onEvent:()=>{},
  });
  controller.attach('s1');
  f.runtime.shell=async(id:string,command:string)=>{
    const sink=sinks.get(id)!;
    sink({type:'ComandoUtenteIniziato',comandoId:'cmd-1',comando:command});
    const shellRecord=(await store.list()).find(row=>row.operation==='shell');
    assert.equal(shellRecord?.state,'open');
    await writeFile(join(projectRoot,'state.txt'),'shell-after','utf8');
    sink({type:'ComandoUtenteFinito',comandoId:'cmd-1',codice:0});
  };
  await controller.send('!echo ok',{model:'m',running:false});
  await waitFor(async()=>((await store.list()).find(row=>row.operation==='shell')?.state==='complete'),'shell checkpoint finalization');
  const shell=(await store.list()).find(row=>row.operation==='shell');
  assert.equal(shell?.commandId,'cmd-1');
  assert.equal(shell?.state,'complete');
});


/*
 * R0 realignment (2026-09-23). The preparation phase this test required (added by `840d641d9`) was removed on purpose
 * four hours later by `e1f7eb363` (RED `f47ced78c`: "model submit has no starting/preparation activity state"): a
 * model start is dispatched before any checkpoint exists. The test now protects that property at the checkpoint
 * boundary instead of the removed `onPreparation` callback.
 */
test('a model start is dispatched before any checkpoint exists (no preparation gate)',async()=>{
  const {root,projectRoot,checkpointsRoot,queueRoot}=await fixture();
  const store=createCheckpointStore({rootDir:checkpointsRoot,projectRoot});
  const f=runtimeBase();const atStart:number[]=[];
  f.runtime.start=async()=>{atStart.push((await store.list()).length);return's1';};
  const controller=createTuiSessionController({
    runtime:f.runtime,projectRoot,model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},
    paths:{checkpointsRoot,queueRoot,dataRoot:join(root,'data')} as any,onEvent:()=>{},
  });
  assert.equal(await controller.initialize({initialPrompt:'go'}),'s1');
  assert.deepEqual(atStart,[0],'runtime.start ran once, and the controller had opened no checkpoint before it');
  assert.deepEqual(await store.list(),[],'the controller opens no model checkpoint at all; the composition does, at the first mutation');
});
