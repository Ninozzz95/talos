/*
 * F-ENG-2 (stress-test smoke of rc.1, 08/10/2026; owner: «Fermarli e dirlo nel risultato», in rc.2): `talos -p` never exited
 * when the run left a command in the background — the live child kept Node's event loop open. Claude Code has the same
 * defect (issue 61416: `claude -p` does not exit after the final text when the session used run_in_background; the workaround
 * is a TaskStop on each entry); Codex terminates every background terminal at Shutdown (core/src/session/handlers.rs) and
 * Hermes kills the session's processes at agent close (tools/process_registry.py `kill_all(source="agent_close")`).
 * Here the end of a headless run — final turn, failure, timeout, Ctrl+C — stops the background commands of the session and of
 * its delegated agents, says so in a warning BEFORE the terminal event (nothing follows the terminal event in the stream) and
 * lists them in the result (`backgroundStopped`, additive like `permissionDenials`). A stop whose exit is not seen is said as
 * such; the WSL clause is there because a stop reaches the Windows tree, not the Linux process inside the distribution.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {collectHeadlessRun} from '../../src/headless/run.ts';
import {createSessionFacade} from '../../src/runtime/session-facade.ts';
import {createRuntimeSupervisor} from '../../src/runtime/supervisor.ts';
import {createDeferredRuntimeContext} from '../../src/runtime/deferred-context.ts';

const text=(delta:string)=>({type:'TextMessageContent',messageId:'m',delta});
const agent=(childId:string,reason:'created'|'completed')=>({type:'CUSTOM',name:'talos.agenti',
  value:{version:1,sessionId:'s',parentId:'s',childId,reason,agent:{sessionId:childId,conclusa:reason==='completed'},operation:{kind:'lifecycle',status:reason==='completed'?'completed':'started'}}});
const woken=(...childIds:string[])=>({type:'RunStarted',runId:'w',input:{origine:'delega',childIds,risultatiDelega:childIds.map(childId=>({codaId:`q-${childId}`,childId,testo:`Il sotto-agente ha finito.
${JSON.stringify({schema:'talos.subagent-result.v1',childId,stato:'concluso',compito:`task ${childId}`,risultatoNonFidato:'done'})}`}))}});
const DEV={sessionId:'s',toolCallId:'t1',command:'npm run dev',outputFile:'C:/work/.talos/processi-sfondo/t1.log',exited:true};

function controllable(stops:any[]|(()=>Promise<any[]>)=[DEV]){
  /* one subscription per session, as the real runtime (0.6.8: the runner also follows each child's approvals) */
  const sinks=new Map<string,(event:any)=>void>();const asked:string[][]=[];const cancelled:string[]=[];
  const runtime:any={start:async()=>'s',subscribe(id:string,fn:(event:any)=>void){sinks.set(id,fn);return()=>{if(sinks.get(id)===fn)sinks.delete(id);};},answerApproval:async()=>{},
    cancel:async(id:string)=>{cancelled.push(id);if(id==='s')sinks.get('s')?.({type:'RunError',code:'fermato',message:'stopped'});},
    stopBackgroundCommands:async(ids:readonly string[])=>{asked.push([...ids]);return typeof stops==='function'?stops():stops;},
    restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{}};
  return{runtime,asked,cancelled,send:(...events:any[])=>{for(const event of events)sinks.get('s')?.(event);}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
function within<T>(promise:Promise<T>,ms=1_000):Promise<T>{
  let timer:NodeJS.Timeout|undefined;
  return Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`still waiting after ${ms} ms`)),ms);timer.unref();})]).finally(()=>clearTimeout(timer));
}
const input=(extra:Record<string,unknown>={})=>({projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]},...extra}) as any;
const isWarning=(event:any)=>event.type==='warning'&&event.data?.code==='BACKGROUND_COMMANDS_STOPPED';
const terminalIndex=(events:any[])=>events.findIndex(event=>['run.completed','run.failed','run.cancelled'].includes(event.type));

for(const protocolVersion of ['v1','v2'] as const){
  test(`F-ENG-2 (${protocolVersion}): the end of -p stops the background commands, warns BEFORE the terminal event and lists them in the result`,async()=>{
    const f=controllable();
    const run=collectHeadlessRun(f.runtime,input({protocolVersion}));
    await tick();f.send({type:'RunStarted',runId:'r'},text('Started the dev server.'),{type:'RunFinished',runId:'r'});
    const x:any=await within(run);
    assert.deepEqual(f.asked,[['s']],'asked once, for the session of the run');
    assert.deepEqual(x.result.backgroundStopped,[DEV]);
    const warning=x.events.findIndex(isWarning);
    assert.ok(warning>=0,'a warning in the stream');
    assert.ok(warning<terminalIndex(x.events),'the warning comes before the terminal event: nothing follows the terminal event');
    if(protocolVersion==='v1'){const seqs=x.events.map((event:any)=>event.seq);assert.deepEqual(seqs,[...seqs].sort((a:number,b:number)=>a-b),'v1 seq still grows');assert.equal(new Set(seqs).size,seqs.length,'and never repeats');}
    const message=String(x.events[warning].data.message);
    assert.match(message,/npm run dev/u);assert.match(message,/t1\.log/u);
    assert.match(message,/WSL/u,'a stop reaches the Windows tree, not a Linux process inside WSL: said once');
    assert.ok(x.result.warnings.some((line:string)=>/npm run dev/u.test(line)),'and in the result warnings');
    assert.equal(protocolVersion==='v1'?x.result.ok:x.result.outcome,protocolVersion==='v1'?true:'completed','the run itself still succeeded');
  });
}

test('F-ENG-2: a stop whose exit was not seen is said as such, never as stopped',async()=>{
  const f=controllable([{...DEV,exited:false}]);
  const run=collectHeadlessRun(f.runtime,input());
  await tick();f.send({type:'RunStarted',runId:'r'},{type:'RunFinished',runId:'r'});
  const x:any=await within(run);
  const message=String(x.events.find(isWarning)?.data.message);
  assert.match(message,/not seen exiting/u);
});

test('F-ENG-2: nothing in the background, nothing said and no field',async()=>{
  const f=controllable([]);
  const run=collectHeadlessRun(f.runtime,input());
  await tick();f.send({type:'RunStarted',runId:'r'},text('Hi.'),{type:'RunFinished',runId:'r'});
  const x:any=await within(run);
  assert.deepEqual(f.asked,[['s']]);
  assert.equal(x.events.some(isWarning),false);
  assert.equal('backgroundStopped' in x.result,false);
});

test('F-ENG-2: a failed turn stops them too, and warns before run.failed',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input());
  await tick();f.send({type:'RunStarted',runId:'r'},{type:'RunError',code:'PROVIDER_ERROR',message:'boom'});
  const x:any=await within(run);
  assert.equal(x.result.ok,false);
  assert.deepEqual(x.result.backgroundStopped,[DEV]);
  assert.ok(x.events.findIndex(isWarning)<terminalIndex(x.events));
});

test('F-ENG-2: the timeout stops them too',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input({timeoutSeconds:0.05,protocolVersion:'v2'}));
  await tick();f.send({type:'RunStarted',runId:'r'});
  const x:any=await within(run);
  assert.equal(x.result.outcome,'failed');
  assert.deepEqual(x.result.backgroundStopped,[DEV]);
});

test('F-ENG-2: Ctrl+C stops them too',async()=>{
  const f=controllable();const controller=new AbortController();
  const run=collectHeadlessRun(f.runtime,input({signal:controller.signal,interruptGraceMs:50}));
  await tick();f.send({type:'RunStarted',runId:'r'});await tick();controller.abort();
  const x:any=await within(run);
  assert.equal(x.result.error?.code,'INTERRUPTED');
  assert.deepEqual(x.result.backgroundStopped,[DEV]);
});

test('F-ENG-2: the delegated agents of the run are asked too',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input({agentWakeGraceMs:600_000}));
  await tick();f.send({type:'RunStarted',runId:'r'},agent('c1','created'),{type:'RunFinished',runId:'r'},agent('c1','completed'),woken('c1'),{type:'RunFinished',runId:'w'});
  await within(run);
  assert.deepEqual(f.asked,[['s','c1']]);
});

test('F-ENG-2: a stop that throws never holds the run',async()=>{
  const f=controllable(async()=>{throw new Error('kernel gone');});
  const run=collectHeadlessRun(f.runtime,input());
  await tick();f.send({type:'RunStarted',runId:'r'},text('Hi.'),{type:'RunFinished',runId:'r'});
  const x:any=await within(run);
  assert.equal(x.result.ok,true);
  assert.equal('backgroundStopped' in x.result,false);
});

/* the facade: the kernel's process ledger says which rows are in the background; `fermaComando` stops each one, and its
   registration goes at the real exit (A6-bis R2), so «non-in-corso» on a later ask means the process exited */
function registryWith(rows:Record<string,any[]>,exitAfter:Record<string,number>){
  const calls:string[]=[];const asks=new Map<string,number>();
  const registry:any={avviaLibero(){return{sessionId:'s'};},iscriviti(){return()=>{};},
    elencaProcessi:(id:string)=>({ok:true,registrato:true,processi:rows[id]??[]}),
    fermaComando(id:string,toolCallId:string){calls.push(`${id}/${toolCallId}`);const n=(asks.get(toolCallId)??0)+1;asks.set(toolCallId,n);
      const limit=exitAfter[toolCallId];if(limit===undefined)return 'non-in-corso';return n>limit?'non-in-corso':'fermato';}};
  return{registry,calls};
}
const row=(toolCallId:string,inSfondo:boolean,extra:Record<string,unknown>={})=>({toolCallId,attrezzo:'shell',comando:`cmd ${toolCallId}`,inSfondo,fileSfondo:inSfondo?`C:/o/${toolCallId}.log`:null,...extra});

test('F-ENG-2 facade: stops the live background rows, waits for their exit, skips what this process does not run',async()=>{
  const {registry,calls}=registryWith({s:[row('a',true),row('b',false),row('c',true)],c1:[row('d',true)]},{a:2,d:1});
  const runtime=createSessionFacade(registry,{model:'m'});
  const stops=await runtime.stopBackgroundCommands!(['s','c1'],{waitMs:500,pollMs:5});
  assert.deepEqual(stops,[
    {sessionId:'s',toolCallId:'a',command:'cmd a',outputFile:'C:/o/a.log',exited:true},
    {sessionId:'c1',toolCallId:'d',command:'cmd d',outputFile:'C:/o/d.log',exited:true},
  ],'c is in the background in the ledger but not running in this process (a resumed session): not listed; b was not in the background');
  assert.equal(calls.includes('s/b'),false,'a finished row is never stopped');
});

test('F-ENG-2 facade: an exit not seen within the wait is reported as not exited',async()=>{
  const {registry}=registryWith({s:[row('a',true)]},{a:1_000_000});
  const runtime=createSessionFacade(registry,{model:'m'});
  const started=Date.now();
  const stops=await runtime.stopBackgroundCommands!(['s'],{waitMs:60,pollMs:5});
  assert.ok(Date.now()-started<1_000,'the wait is bounded');
  assert.deepEqual(stops.map(stop=>stop.exited),[false]);
});

test('F-ENG-2 facade: a kernel without the ledger or the stop answers nothing to stop',async()=>{
  const runtime=createSessionFacade({avviaLibero(){return{sessionId:'s'};},iscriviti(){return()=>{};}} as any,{model:'m'});
  assert.deepEqual(await runtime.stopBackgroundCommands!(['s']),[]);
});

test('F-ENG-2: the supervisor and the deferred context pass the stop through to the facade',async()=>{
  const {registry,calls}=registryWith({s:[row('a',true)]},{a:1});
  const facade=createSessionFacade(registry,{model:'m'});
  const supervised=createRuntimeSupervisor({initialRuntime:facade,runtimeFactory:()=>({}) as any});
  assert.equal(typeof supervised.stopBackgroundCommands,'function');
  const viaSupervisor=await supervised.stopBackgroundCommands!(['s'],{waitMs:50,pollMs:5});
  assert.deepEqual(viaSupervisor.map(stop=>stop.toolCallId),['a']);
  const deferred=createDeferredRuntimeContext(Promise.resolve({runtime:supervised,catalog:{},registry:{}}) as any,{});
  assert.equal(typeof deferred.runtime.stopBackgroundCommands,'function');
  await deferred.runtime.stopBackgroundCommands!(['s'],{waitMs:50,pollMs:5});
  assert.ok(calls.filter(call=>call==='s/a').length>=2,'both reached the kernel');
});
