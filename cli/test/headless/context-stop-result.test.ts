/*
 * Decision 245, C4(c) and C4(d) on the CLI's side (owner 05/11/2026; A5c of the CLI 0.7.0, 19/11/2026).
 * The kernel sends the model on ONCE when its last answer says it stops «for the context» (talosHarness.mjs `decidiFermataPerContesto`,
 * NOTA_FERMATA_CONTESTO): the stopped answer stays in the history, and the PC says nothing about it (agent-service.mjs, the line goes to
 * the journal only). Through the REAL composition and the real kernel, with a scripted provider on 127.0.0.1 and a fake environment:
 * - C4(c): `talos -p` (v1 and v2) returns the resumed answer as its text, not the one that stopped, and says no notice about it;
 * - C4(d): a stop of the CLI's own (the run timeout, «system») or of the person (Ctrl+C) never lets that push go out.
 * Like Hermes `agent/turn_final_response.py:295-297`: an answer followed by a continuation nudge «is non-final» (`final_response = None`).
 */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';
import {dummyKey,fakeKeyring,hermetic,REPO_ROOT,writeProviderRuntime,type Hermetic} from '../provider/first-run-fixture.ts';
import {MODEL,startScriptedProvider,textOf,type ChatRequest,type Step} from '../runtime/r5a-r-fixture.ts';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';

const STOPPED="I read the notes. I'll stop here: the context is almost full, I will pick it up in the next turn.";
const RESUMED='RESUMED: the notes say hello, the task is done.';
const NOTE=/Context is compacted automatically/u;
const lastText=(request:ChatRequest)=>textOf(request.body?.messages?.at(-1)?.content);
const pushed=(request:ChatRequest)=>NOTE.test(lastText(request));
/* One read, then the answer that stops for the context, then (only after TALOS's note) the resumed answer. */
const script=(stoppedDelayMs=0)=>(request:ChatRequest):Step=>pushed(request)?{kind:'text',text:RESUMED}
  :request.toolResults===0?{kind:'tool',name:/^(read|read_file|leggi)$/iu,args:[{pattern:/^(path|percorso|file)/iu,value:'notes.txt'}]}
  :{kind:'text',text:STOPPED,...(stoppedDelayMs?{delayMs:stoppedDelayMs}:{})};

/* The real composition with a FAKE environment object: the test never hands the process's own environment to the product. */
async function compose(h:Hermetic,url:string,key:string){
  const {composeTalosRuntime}=await import('../../src/runtime/talos-composition.ts');
  writeProviderRuntime(h.paths,{deepseek:url});
  const env={APPDATA:h.appdata,LOCALAPPDATA:h.local,TALOS_HARNESS_UI_KEYRING:'memoria',TALOS_CREDENTIAL_STORE:'memory'};
  const context:any=await composeTalosRuntime({repoRoot:REPO_ROOT,projectRoot:h.project,paths:h.paths,model:MODEL,env,environmentKeys:'consent',keyring:fakeKeyring()} as any);
  context.providerStore.setKey('deepseek',key);await context.tuiCatalog.chooseProvider('deepseek');
  return context;
}
const input=(h:Hermetic,protocolVersion:'v1'|'v2',extra:Record<string,unknown>={})=>({projectRoot:h.project,checkpointsRoot:h.paths.checkpointsRoot,model:MODEL,
  permissionMode:'bypassPermissions' as const,prompt:'Read notes.txt and tell me what it says.',protocolVersion,...extra}) as any;

for(const protocolVersion of ['v1','v2'] as const){
  test(`C4(c) ${protocolVersion}: -p returns the resumed answer, not the one that stopped for the context, and says nothing about it`,{timeout:60_000},async()=>hermetic(async h=>{
    await writeFile(join(h.project,'notes.txt'),'hello\n');
    const key=dummyKey('deepseek');const fake=await startScriptedProvider({goodKey:key,respond:script()});
    const context=await compose(h,fake.url,key);const runtime=createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime});
    try{
      const {result}:any=await collectHeadlessRun(runtime,input(h,protocolVersion));
      assert.equal(fake.requests.length,3,'one read, the answer that stops, the one push of decision 245');
      assert.equal(fake.requests.filter(pushed).length,1,'the kernel pushed once');
      const text=String(result.result?.text);
      assert.equal(result.ok,true);
      assert.match(text,/RESUMED: the notes say hello/u,'the resumed answer is the result');
      assert.doesNotMatch(text,/stop here|context is almost full/u,'the answer that stopped is not the result');
      assert.deepEqual(result.warnings.filter((w:string)=>/stopped early|asked the model to continue/u.test(w)),[],'decision 245: zero notices for a stop for the context');
      assert.deepEqual(h.network.blocked,[]);
    }finally{await runtime.close();await fake.close();}
  }));
}

/* The accumulators alone: several deltas per message, an earlier message kept, only the kernel's own row for a context stop counts. */
const v1Delta=(seq:number,messageId:string,delta:string)=>({schema:'talos.cli.event.v1',seq,ts:'t',sessionId:'s',type:'message.delta',data:{messageId,delta}}) as any;
const v2Delta=(messageId:string,delta:string)=>({sessionId:'s',type:'message.delta',data:{messageId,delta}}) as any;
const row=(motivo:unknown,name='talos.continuazione')=>({type:'CUSTOM',name,value:{schema:'talos.continuazione.v1',motivo}});
test('C4(c), the accumulators: only the answer before the kernel’s row leaves the text, whole, and nothing else does',async()=>{
  const {createRunResultAccumulator,resumesAfterContextStop}=await import('../../src/headless/result.ts');
  const {createV2RunResultAccumulator}=await import('../../src/protocol/v2/events.ts');
  assert.equal(resumesAfterContextStop(row('fermata-contesto')),true);
  for(const other of [row('tetto-uscita'),row('comando-rosso'),row(undefined),row('fermata-contesto','talos.altro'),{type:'TEXT',name:'talos.continuazione',value:{motivo:'fermata-contesto'}},null,'x'])
    assert.equal(resumesAfterContextStop(other),false,JSON.stringify(other));
  const v1=createRunResultAccumulator();const v2=createV2RunResultAccumulator();
  const feed=(id:string,parts:string[])=>{for(const part of parts){v1.add(v1Delta(1,id,part));v2.add(v2Delta(id,part));}};
  feed('a',['First ','message.']);feed('b',['I will ','stop: the context ','is full.']);
  v1.resumedAfterContextStop();v2.resumedAfterContextStop();
  feed('c',['Resumed ','answer.']);
  assert.equal((v1.result() as any).result.text,'First message.\n\nResumed answer.');
  assert.equal((v2.result() as any).result.text,'First message.Resumed answer.','v2 keeps its own joining, without the stopped answer');
  const alone=createRunResultAccumulator();alone.add(v1Delta(1,'b','Stopping for the context.'));alone.resumedAfterContextStop();alone.add(v1Delta(2,'c','Done.'));
  assert.equal((alone.result() as any).result.text,'Done.','the first answer of the run leaves no blank line behind');
});

/* C4(d): the push never follows a stop. The answer that would stop for the context comes late; the stop arrives while it is on its way. */
for(const who of ['system','person'] as const){
  test(`C4(d): after the ${who==='system'?'CLI’s own timeout («system»)':'person’s Ctrl+C'} the kernel never pushes the model on`,{timeout:60_000},async()=>hermetic(async h=>{
    await writeFile(join(h.project,'notes.txt'),'hello\n');
    const key=dummyKey('deepseek');const fake=await startScriptedProvider({goodKey:key,respond:script(1_500)});
    const context=await compose(h,fake.url,key);const runtime=createRuntimeSupervisor({initialRuntime:context.runtime,runtimeFactory:()=>context.runtime});
    const cancels:Array<unknown>=[];const cancel=runtime.cancel.bind(runtime);
    (runtime as any).cancel=(id:string,options?:unknown)=>{cancels.push(options??null);return cancel(id,options as any);};
    const abort=new AbortController();
    try{
      const run=collectHeadlessRun(runtime,input(h,'v1',who==='system'?{timeoutSeconds:0.9}:{signal:abort.signal}));
      if(who==='person'){const until=Date.now()+20_000;while(fake.requests.length<2&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,20));abort.abort();}
      const {result}:any=await run;
      assert.equal(result.ok,false,'the run ended on the stop');
      assert.equal(result.error.code,who==='system'?'RUN_TIMEOUT':'INTERRUPTED');
      assert.deepEqual(cancels.slice(0,1),[who==='system'?{by:'system'}:null],'the stop went to the kernel with its author');
      /* the late answer would have arrived by now: give the kernel the time to decide, then count */
      await new Promise(resolve=>setTimeout(resolve,2_500));
      assert.equal(fake.requests.filter(pushed).length,0,'no push after a stop');
      assert.ok(fake.requests.length<=2,`no request after the stop (${fake.requests.length})`);
    }finally{await runtime.close();await fake.close();}
  }));
}
