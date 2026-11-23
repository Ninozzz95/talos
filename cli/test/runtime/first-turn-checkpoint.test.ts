import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,mkdir,unlink,rmdir} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,startScriptedProvider,runTurn,MODEL} from './r5a-r-fixture.ts';
import {collectHeadlessRun,collectHeadlessResume,collectHeadlessFork} from '../../src/headless/run.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';
import {createCheckpointStore} from '../../src/workspace/checkpoint-store.ts';
import {undoCheckpoint,redoCheckpoint} from '../../src/workspace/restore.ts';

test('REV-PERF-EXTENSION real capability rechecks extension presence before each turn',async()=>hermetic(async h=>{
 const key=dummyKey('deepseek');const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text',text:'OK'})});
 const context=await composeWithFake(h,fake.url,key);const runtime=createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime});
 try{
  const capability=runtime.modelCheckpoints!;assert.equal(typeof capability.canDefer,'function');assert.equal(await capability.canDefer!(),true);
  for(const [path,directory] of [[join(h.project,'.harness-ui-hooks.json'),false],[join(h.project,'.harness-ui-mcp.json'),false],[join(h.project,'.harness-ui-plugins'),true],[join(h.paths.dataRoot,'forge'),true]] as const){
   if(directory)await mkdir(path);else await writeFile(path,'{}');assert.equal(await capability.canDefer!(),false,path);
   if(directory)await rmdir(path);else await unlink(path);assert.equal(await capability.canDefer!(),true);
  }
 }finally{await runtime.close();await fake.close();}
}));

test('REV-IMAGE-WIRE-FIXTURE waits for the v4 registry boundary before a follow-up',async()=>{
 let release!:()=>void;let ready=false;let resumed=false;
 const barrier=new Promise<void>(resolve=>{release=resolve;});
 const context={registry:{async attendiAssestamento(id:string){assert.equal(id,'s1');await barrier;}},runtime:{
  subscribe(_id:string,sink:(event:any)=>void){if(resumed)sink({type:'RunFinished'});return()=>{};},
  async resume(id:string){resumed=true;assert.equal(ready,true,'do not resume in the closing window');return id;},
 }};
 const task=runTurn(context,{} as any,'Look again',{sessionId:'s1',timeoutMs:1000}).then(value=>({value}),error=>({error}));
 try{await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(resumed,false,'resume waits for the registry, not a timer');}
 finally{ready=true;release();}
 const result=await task;assert.equal('error' in result,false,JSON.stringify(result));assert.equal(resumed,true);
});

for(const protocolVersion of ['v1','v2'] as const){
 test(`REV-PERF-FIRST real ${protocolVersion}: read-only provider turn has no checkpoint`,{timeout:30_000},async()=>hermetic(async h=>{
  const key=dummyKey('deepseek');const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text',text:'Ho letto la richiesta.'})});
  const context=await composeWithFake(h,fake.url,key);const runtime=createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime});
  const store=createCheckpointStore({rootDir:h.paths.checkpointsRoot,projectRoot:h.project});
  try{
   assert.ok(runtime.modelCheckpoints,'real composition exposes its mutation barrier');
   const result=await collectHeadlessRun(runtime,{projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:MODEL,permissionMode:'bypassPermissions',prompt:'Ciao, rispondi brevemente senza modificare file.',protocolVersion});
   assert.match(JSON.stringify(result.result),/Ho letto la richiesta/);assert.equal(fake.requests.length,1);
   assert.deepEqual(await store.list(),[]);
   const id=result.result.sessionId!;const raw:any[]=[];runtime.subscribe(id,event=>raw.push(event),0)();
   const from=Math.max(0,...raw.map(event=>event._sequenza??0));
   const input={projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:MODEL,permissionMode:'bypassPermissions' as const,protocolVersion,from};
   const resumed=await collectHeadlessResume(runtime,id,'Contnua, ancora senza scrivere.',input);
   assert.match(JSON.stringify(resumed.result),/Ho letto la richiesta/);
   const forked=await collectHeadlessFork(runtime,id,'Apri un seguito separato.',{...input,from:0});
   assert.notEqual(forked.result.sessionId,id);assert.match(JSON.stringify(forked.result),/Ho letto la richiesta/);
   // fork starts from the saved conversation, then consumes the facade's queued new prompt.
   assert.deepEqual(fake.requests.map(r=>r.lastUser),['Ciao, rispondi brevemente senza modificare file.','Contnua, ancora senza scrivere.','Contnua, ancora senza scrivere.','Apri un seguito separato.']);
   assert.deepEqual(await store.list(),[]);assert.deepEqual(h.network.blocked,[]);
  }finally{await runtime.close();await fake.close();}
 }));
 /* G02 (unified kernel, desktop T25/B09 «like Hermes and Claude Code»): `scrivi` refuses to replace a file the session has
    not read in full, before the permission and the checkpoint barrier. The scripted model therefore reads state.txt first. */
 test(`REV-PERF-FIRST real ${protocolVersion}: one checkpoint covers a tool write and survives undo/redo`,{timeout:30_000},async()=>hermetic(async h=>{
  const file=join(h.project,'state.txt');await writeFile(file,'before');const key=dummyKey('deepseek');
  const fake=await startScriptedProvider({goodKey:key,respond:request=>request.toolResults===0
   ?{kind:'tool',name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'state.txt'}]}
   :request.toolResults===1
   ?{kind:'tool',name:/^(write|write_file|scrivi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'state.txt'},{pattern:/^(content|contenuto|text)/iu,value:'after'}]}
   :{kind:'text',text:'File aggiornato.'}});
  const context=await composeWithFake(h,fake.url,key);const runtime=createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime});
  const store=createCheckpointStore({rootDir:h.paths.checkpointsRoot,projectRoot:h.project});
  try{
   assert.ok(runtime.modelCheckpoints);
   const result=await collectHeadlessRun(runtime,{projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:MODEL,permissionMode:'bypassPermissions',prompt:'Scrivi after in state.txt.',protocolVersion});
   assert.match(JSON.stringify(result.result),/File aggiornato/);assert.equal(await readFile(file,'utf8'),'after');
   const records=await store.list();assert.equal(records.length,1,'no duplicate headless checkpoint');
   assert.equal(records[0].state,'complete','headless completion waits for persisted post-state');assert.ok(records[0].sessionId);
   await undoCheckpoint({store,id:records[0].id});assert.equal(await readFile(file,'utf8'),'before');
   await redoCheckpoint({store,id:records[0].id});assert.equal(await readFile(file,'utf8'),'after');assert.deepEqual(h.network.blocked,[]);
  }finally{await runtime.close();await fake.close();}
 }));
 /* D1, the owner's case (stress test 03/10: a Downloads folder with archives over 64 MB, every write refused even after the
    person approved it): with the real limits a 65 MB file in the project no longer stops the write; it is left out of /undo,
    said once, and /undo still puts back what it covers. */
 test(`D1 real ${protocolVersion}: a project with a file over 64 MB still writes; /undo covers the rest and says what it leaves out`,{timeout:60_000},async()=>hermetic(async h=>{
  const file=join(h.project,'state.txt');await writeFile(file,'before');const big=join(h.project,'archive.zip');await writeFile(big,Buffer.alloc(65*1024*1024,1));
  const key=dummyKey('deepseek');
  const fake=await startScriptedProvider({goodKey:key,respond:request=>request.toolResults===0
   ?{kind:'tool',name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'state.txt'}]}
   :request.toolResults===1
   ?{kind:'tool',name:/^(write|write_file|scrivi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'state.txt'},{pattern:/^(content|contenuto|text)/iu,value:'after'}]}
   :{kind:'text',text:'File aggiornato.'}});
  const context=await composeWithFake(h,fake.url,key);
  const store=createCheckpointStore({rootDir:h.paths.checkpointsRoot,projectRoot:h.project});
  try{
   const result=await collectHeadlessRun(context.runtime,{projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:MODEL,permissionMode:'bypassPermissions',prompt:'Scrivi after in state.txt.',protocolVersion});
   assert.equal(await readFile(file,'utf8'),'after','the write happens');
   assert.match(JSON.stringify(result),/\/undo: 1 workspace entries are outside rollback coverage: archive\.zip \(65\.0 MB, over the 64\.0 MB limit for one file\)/u,'said once');
   assert.doesNotMatch(JSON.stringify(result.result),/CHECKPOINT_FILE_TOO_LARGE/u);
   const records=await store.list();assert.equal(records.length,1);
   await undoCheckpoint({store,id:records[0].id});
   assert.equal(await readFile(file,'utf8'),'before','what is covered goes back');
   assert.equal((await readFile(big)).length,65*1024*1024,'the archive is untouched');
  }finally{await context.runtime.close();await fake.close();}
 }));
 for(const failure of ['begin','finalize'] as const){
  test(`REV-PERF-FIRST real ${protocolVersion}: ${failure} failure is visible and never reported as success`,{timeout:30_000},async()=>hermetic(async h=>{
   const file=join(h.project,'state.txt');await writeFile(file,'before');const key=dummyKey('deepseek');
   const rootDir=failure==='begin'?join(h.root,'checkpoint-unavailable'):h.paths.checkpointsRoot;
   if(failure==='begin')await writeFile(rootDir,'not a directory');
   let readOnly=false;
   const fake=await startScriptedProvider({goodKey:key,respond:request=>readOnly?{kind:'text',text:'Lettura ancora disponibile.'}:request.toolResults===0
    ?{kind:'tool',name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'state.txt'}]}
    :request.toolResults===1
    ?{kind:'tool',name:/^(write|write_file|scrivi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'state.txt'},{pattern:/^(content|contenuto|text)/iu,value:'after'}]}
    :{kind:'text',text:'Risposta dopo il tool.'}});
   const context=await composeWithFake(h,fake.url,key,{paths:{...h.paths,checkpointsRoot:rootDir}});
   const originalFetch=globalThis.fetch;let calls=0;
   globalThis.fetch=(async(input:any,init?:any)=>{
    if(String(typeof input==='string'?input:input.url??input).includes('/chat/completions')&&++calls===3&&failure==='finalize'){
     const blobRoot=resolve(rootDir,'blobs'),saved=resolve(rootDir,'blobs-preserved');
     assert.ok(blobRoot.startsWith(resolve(h.root)+sep)&&saved.startsWith(resolve(h.root)+sep));
     await rename(blobRoot,saved);await writeFile(blobRoot,'simulated storage fault');
    }
    return originalFetch(input,init);
   }) as typeof fetch;
   try{
    const result=await collectHeadlessRun(context.runtime,{projectRoot:h.project,checkpointsRoot:rootDir,model:MODEL,permissionMode:'bypassPermissions',prompt:'Scrivi after in state.txt.',protocolVersion});
    /* D1 (stress test 03/10, owner «Mai bloccare»): a checkpoint that cannot be taken or finished never stops the write; the
       run says once that /undo does not cover this turn, and it still ends well */
    assert.equal(await readFile(file,'utf8'),'after','the write happens');
    assert.match(JSON.stringify(result),failure==='begin'?/This turn runs without \/undo/:/\/undo cannot go back before this turn/,'the gap is said');
    assert.doesNotMatch(JSON.stringify(result.result),/CHECKPOINT_FINALIZE_FAILED/,'not reported as a failed run');
    readOnly=true;
    const later=await collectHeadlessRun(context.runtime,{projectRoot:h.project,checkpointsRoot:rootDir,model:MODEL,permissionMode:'bypassPermissions',prompt:'Rispondi senza usare tool.',protocolVersion});
    assert.match(JSON.stringify(later.result),/Lettura ancora disponibile/,'a different read-only session does not inherit checkpoint failure');
    assert.doesNotMatch(JSON.stringify(later.result),/CHECKPOINT_FINALIZE_FAILED/);
   }finally{globalThis.fetch=originalFetch;await context.runtime.close();await fake.close();}
  }));
 }
}

