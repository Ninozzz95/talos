/*
 * A5c, cure round 1 (reviewer's R1, 19/11/2026; cases adopted from the reviewer's rev-a5c-context-stop.test.ts). Decision 245: when the
 * model stops «for the context» the kernel sends it on once; if that resumption comes back EMPTY, the kernel closes the turn on the
 * answer that stopped (talosHarness.mjs, «la nota esce dalla storia e il giro si chiude sulla risposta che si fermava»). So `-p` must
 * not take that answer out before a resumed answer has text of its own: the cut waits for the first text of another message. Through
 * the REAL composition and kernel, a scripted provider on 127.0.0.1 and a fake environment object.
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {MODEL,startScriptedProvider,textOf,type ChatRequest,type Step} from '../runtime/r5a-r-fixture.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {createRunResultAccumulator} from '../../src/headless/result.ts';
import {createV2RunResultAccumulator} from '../../src/protocol/v2/events.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

const STOPPED="I read the notes. I'll stop here: the context is almost full, I will pick it up in the next turn.";
const AGAIN=`${STOPPED} AGAIN`;
const RESUMED='RESUMED: the notes say hello, the task is done.';
const NOTE=/Context is compacted automatically/u;
const pushed=(request:ChatRequest)=>NOTE.test(textOf(request.body?.messages?.at(-1)?.content));
const READ:Step={kind:'tool',name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'notes.txt'}]};

async function compose(h:Hermetic,url:string,key:string){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:url});
  const env={APPDATA:h.appdata,LOCALAPPDATA:h.local,TALOS_HARNESS_UI_KEYRING:'memoria',TALOS_CREDENTIAL_STORE:'memory'};
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env,environmentKeys:'consent',keyring:fakeKeyring()} as any);
  context.providerStore.setKey('deepseek',key);await context.tuiCatalog.chooseProvider('deepseek');
  return context;
}
const input=(h:Hermetic,protocolVersion:'v1'|'v2')=>({projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:MODEL,
  permissionMode:'bypassPermissions' as const,prompt:'Read notes.txt and tell me what it says.',protocolVersion}) as any;

/* by request index: 0 read, 1 the answer that stops, 2.. the case; `text` is the result's whole text, `ok` false for a failed run */
const CASES:Record<string,{steps:Step[];text:string|null}>={
  'empty resumption keeps the answer that stopped':{steps:[READ,{kind:'text',text:STOPPED},{kind:'text',text:''}],text:STOPPED},
  'a resumption with only reasoning keeps the answer that stopped':{steps:[READ,{kind:'text',text:STOPPED},{kind:'text',text:'',reasoning:'Thinking about the notes.'}],text:STOPPED},
  'a resumption that stops again is the result':{steps:[READ,{kind:'text',text:STOPPED},{kind:'text',text:AGAIN}],text:AGAIN},
  'a resumption with a tool, then text, is the result':{steps:[READ,{kind:'text',text:STOPPED},READ,{kind:'text',text:RESUMED}],text:RESUMED},
  'a resumption that fails is a failed run':{steps:[READ,{kind:'text',text:STOPPED},{kind:'fail',status:400,message:'bad request (fake)'}],text:null},
};

for(const protocolVersion of ['v1','v2'] as const)for(const [name,{steps,text}] of Object.entries(CASES)){
  test(`A5c cure ${protocolVersion}: ${name}`,{timeout:90_000},async()=>hermetic(async h=>{
    await writeFile(join(h.project,'notes.txt'),'hello\n');
    const key=dummyKey('deepseek');
    const fake=await startScriptedProvider({goodKey:key,respond:(r)=>steps[Math.min(r.index,steps.length-1)]!});
    const context=await compose(h,fake.url,key);const runtime=createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime});
    try{
      const {result}:any=await collectHeadlessRun(runtime,input(h,protocolVersion));
      assert.equal(fake.requests.filter(pushed).length,1,'the kernel pushed once');
      if(text===null)assert.equal(result.ok,false,'the failure stays a failure');
      else{
        assert.equal(result.ok,true);
        assert.equal(result.result?.text,text,'no text of the answer is lost, and the answer that stopped goes only when another one has text');
      }
      assert.deepEqual((result.warnings??[]).filter((w:string)=>/stopped early|asked the model to continue/u.test(w)),[]);
      assert.deepEqual(h.network.blocked,[]);
    }finally{await runtime.close();await fake.close();}
  }));
}

/* The accumulators alone: two stops in a row, then an empty resumption; reasoning and empty deltas never apply the cut. */
const v1Delta=(messageId:string,delta:string)=>({schema:'talos.cli.event.v1',seq:1,ts:'t',sessionId:'s',type:'message.delta',data:{messageId,delta}}) as any;
const v2Delta=(messageId:string,delta:string)=>({sessionId:'s',type:'message.delta',data:{messageId,delta}}) as any;
test('A5c cure, the accumulators: two stops in a row and an empty resumption keep the last answer that has text',()=>{
  const v1=createRunResultAccumulator();const v2=createV2RunResultAccumulator();
  const both=(fn:(a:any,d:(id:string,s:string)=>any)=>void)=>{fn(v1,v1Delta);fn(v2,v2Delta);};
  both((a,d)=>{a.add(d('a','First.'));a.add(d('b','Stop 1.'));a.resumedAfterContextStop();});
  both((a,d)=>{a.add(d('c',''));a.add({sessionId:'s',type:'reasoning.delta',data:{messageId:'r',delta:'thinking'}});});
  assert.equal((v1.result() as any).result.text,'First.\n\nStop 1.','an empty delta or reasoning does not cut');
  both((a,d)=>{a.add(d('c','Stop 2.'));a.resumedAfterContextStop();a.add(d('e',''));});
  assert.equal((v1.result() as any).result.text,'First.\n\nStop 2.');
  assert.equal((v2.result() as any).result.text,'First.Stop 2.');
  both((a,d)=>{a.add(d('f','Done.'));});
  assert.equal((v1.result() as any).result.text,'First.\n\nDone.');
  assert.equal((v2.result() as any).result.text,'First.Done.');
});
test('A5c cure: a message that opened with an empty delta still gets its blank line after the cut (v1)',()=>{
  const v1=createRunResultAccumulator();
  v1.add(v1Delta('a','First.'));v1.add(v1Delta('b','Stop.'));v1.resumedAfterContextStop();v1.add(v1Delta('c',''));v1.add(v1Delta('c','Done.'));
  assert.equal((v1.result() as any).result.text,'First.\n\nDone.');
});
test('A5c cure: only ANOTHER message cuts; a late piece of the answer that stopped does not',()=>{
  const v1=createRunResultAccumulator();const v2=createV2RunResultAccumulator();
  v1.add(v1Delta('a','First.'));v1.add(v1Delta('b','Stop.'));v1.resumedAfterContextStop();v1.add(v1Delta('b',' Late.'));
  v2.add(v2Delta('a','First.'));v2.add(v2Delta('b','Stop.'));v2.resumedAfterContextStop();v2.add(v2Delta('b',' Late.'));
  assert.equal((v1.result() as any).result.text,'First.\n\nStop. Late.');
  assert.equal((v2.result() as any).result.text,'First.Stop. Late.');
});
