/*
 * ASYNC phase, step 6 (owner 01/10: «talos -p aspetta i figli»). A delegation no longer holds its parent's turn: the
 * first turn ends while the children work, and the kernel starts a new turn of the same session with their results.
 * A one-shot run has nobody to read that later turn, so it waits: Hermes «sessions without a later consumer (one-shot
 * CLI, cron) wait for the children inside the call» (tools/delegate_tool.py); Claude Code's print mode waits for
 * background tasks up to a ceiling, then stops them («Background tasks still running after …; terminating»).
 * It ends when no child works, every ended child's result was answered (a turn started with it) and no turn is open —
 * or, if no wake comes, after a grace. Ctrl+C and the timeout stop the whole tree. The answer joins the turns.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {collectHeadlessRun} from '../../src/headless/run.ts';

const agent=(childId:string,reason:'created'|'completed',extra:Record<string,unknown>={})=>({type:'CUSTOM',name:'talos.agenti',
  value:{version:1,sessionId:'s',parentId:'s',childId,reason,agent:{sessionId:childId,taskCorto:`task ${childId}`,conclusa:reason==='completed',...extra},operation:{kind:'lifecycle',status:reason==='completed'?'completed':'started'}}});
const result=(childId:string)=>({codaId:`q-${childId}`,childId,testo:`Il sotto-agente ha finito.\n${JSON.stringify({schema:'talos.subagent-result.v1',childId,stato:'concluso',compito:`task ${childId}`,risultatoNonFidato:'all read'})}`});
const woken=(...childIds:string[])=>({type:'RunStarted',runId:'w',input:{origine:'delega',childIds,risultatiDelega:childIds.map(result)}});
const text=(delta:string)=>({type:'TextMessageContent',messageId:`m${delta.length}`,delta});

function controllable(){
  /* one subscription per session, as the real runtime (0.6.8: the runner also follows each child's approvals) */
  const sinks=new Map<string,(event:any)=>void>();const cancelled:string[]=[];
  const runtime:any={start:async()=>'s',subscribe(id:string,fn:(event:any)=>void){sinks.set(id,fn);return()=>{if(sinks.get(id)===fn)sinks.delete(id);};},answerApproval:async()=>{},
    cancel:async(id:string)=>{cancelled.push(id);if(id==='s')sinks.get('s')?.({type:'RunError',code:'fermato',message:'stopped'});},
    restore:async()=>({restored:0,total:0}),resume:async(x:string)=>x,fork:async()=>'',export:()=>null,close:async()=>{}};
  return{runtime,cancelled,send:(...events:any[])=>{for(const event of events)sinks.get('s')?.(event);}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
/* The run must end on its own within `ms` (a broken wait would hang until the test's timeout instead). */
function within<T>(promise:Promise<T>,ms=1_000):Promise<T>{
  let timer:NodeJS.Timeout|undefined;
  return Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`still waiting after ${ms} ms`)),ms);timer.unref();})]).finally(()=>clearTimeout(timer));
}
const timers=()=>process.getActiveResourcesInfo().filter(kind=>kind==='Timeout').length;
const input=(extra:Record<string,unknown>={})=>({projectRoot:process.cwd(),prompt:'x',model:'m',permissionMode:'dontAsk',permissionRules:{allow:[],ask:[],deny:[]},...extra}) as any;

for(const protocolVersion of ['v1','v2'] as const){
  test(`ASYNC 6 (${protocolVersion}): -p waits for its children and the turn that answers them, then joins the answers`,async()=>{
    const f=controllable();let finished=false;
    const run=collectHeadlessRun(f.runtime,input({protocolVersion,agentWakeGraceMs:600_000})).then(value=>{finished=true;return value;});
    await tick();
    f.send({type:'RunStarted',runId:'r'},text('Started an agent.'),agent('c1','created'),{type:'RunFinished',runId:'r'});
    await tick();
    assert.equal(finished,false,'the first turn ended, a child still works: wait');
    f.send(agent('c1','completed'));
    await tick();
    assert.equal(finished,false,'the child ended, its result is not answered yet: wait');
    f.send(woken('c1'),text('Done: the agent reported back.'),{type:'RunFinished',runId:'w'});
    const x:any=await within(run);
    const answer=x.result.result?.text;
    assert.equal(answer,'Started an agent.\n\nDone: the agent reported back.','both turns, one blank line between');
    assert.deepEqual(f.cancelled,[],'nothing stopped');
  });
}

test('ASYNC 6: without children -p ends at its turn, as before',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input());
  await tick();f.send({type:'RunStarted',runId:'r'},text('Hello.'),{type:'RunFinished',runId:'r'});
  const x:any=await run;
  assert.equal(x.result.result?.text,'Hello.');
});

test('ASYNC 6: two children, two wakes — it ends only after the last answer',async()=>{
  const f=controllable();let finished=false;
  const run=collectHeadlessRun(f.runtime,input({protocolVersion:'v2',agentWakeGraceMs:600_000})).then(value=>{finished=true;return value;});
  await tick();
  f.send({type:'RunStarted',runId:'r'},agent('a','created'),agent('b','created'),{type:'RunFinished',runId:'r'},agent('a','completed'),woken('a'),{type:'RunFinished',runId:'w'});
  await tick();
  assert.equal(finished,false,'b still works');
  f.send(agent('b','completed'),woken('b'),{type:'RunFinished',runId:'w2'});
  const x:any=await within(run);
  assert.equal(x.result.outcome,'completed');
  assert.equal(x.events.filter((event:any)=>event.type==='agent.changed').length,4,'v2 carries every agent change');
});

test('ASYNC 6: a child the kernel stopped has ended; once its result is answered the run ends',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input({agentWakeGraceMs:600_000}));
  await tick();
  f.send({type:'RunStarted',runId:'r'},agent('c1','created'),{type:'RunFinished',runId:'r'},
    {...agent('c1','created'),value:{...agent('c1','created').value,reason:'updated',agent:{sessionId:'c1',conclusa:false,interrotta:true}}},
    woken('c1'),{type:'RunFinished',runId:'w'});
  const x:any=await within(run);
  assert.equal(x.result.ok,true);
});

test('ASYNC 6: no wake within the grace — it ends anyway',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input({agentWakeGraceMs:30}));
  await tick();f.send({type:'RunStarted',runId:'r'},text('Started.'),agent('c1','created'),{type:'RunFinished',runId:'r'},agent('c1','completed'));
  const x:any=await run;
  assert.equal(x.result.ok,true);
  assert.equal(x.result.result?.text,'Started.');
});

test('ASYNC 6: Ctrl+C while children work stops the whole tree',async()=>{
  const f=controllable();const controller=new AbortController();
  const run=collectHeadlessRun(f.runtime,input({signal:controller.signal,interruptGraceMs:50,protocolVersion:'v2'}));
  await tick();f.send({type:'RunStarted',runId:'r'},agent('c1','created'),agent('c2','created'),agent('c2','completed'),{type:'RunFinished',runId:'r'});
  await tick();controller.abort();
  const x:any=await run;
  assert.equal(x.result.outcome,'cancelled');
  assert.deepEqual([...f.cancelled].sort(),['c1','s'],'the main session and the child still working; not the ended one');
});

for(const protocolVersion of ['v1','v2'] as const){
  test(`ASYNC 6 (${protocolVersion}): Ctrl+C with the main agent idle ends at once — an idle session has no run to report its stop`,async()=>{
    const f=controllable();const controller=new AbortController();
    f.runtime.cancel=async(id:string)=>{f.cancelled.push(id);};
    const before=timers();
    const run=collectHeadlessRun(f.runtime,input({signal:controller.signal,interruptGraceMs:600_000,protocolVersion}));
    await tick();f.send({type:'RunStarted',runId:'r'},agent('c1','created'),{type:'RunFinished',runId:'r'});
    await tick();controller.abort();
    const x:any=await within(run);
    await tick();
    assert.ok(timers()<=before,'nothing is left waiting after the run: the stop grace is not armed once the run has ended (it would hold the process for 600 s)');
    assert.equal(protocolVersion==='v1'?x.result.error?.code:x.result.outcome,protocolVersion==='v1'?'INTERRUPTED':'cancelled');
    assert.deepEqual([...f.cancelled].sort(),['c1','s']);
  });
}

test('ASYNC 6: the timeout covers the wait and stops the children',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input({timeoutSeconds:0.05}));
  await tick();f.send({type:'RunStarted',runId:'r'},agent('c1','created'),{type:'RunFinished',runId:'r'});
  const x:any=await run;
  assert.equal(x.result.error?.code,'RUN_TIMEOUT');
  assert.ok(f.cancelled.includes('c1'),'the child is stopped');
});

test('ASYNC 6: a failed main turn ends the run at once and stops the children nobody will read',async()=>{
  const f=controllable();
  const run=collectHeadlessRun(f.runtime,input());
  await tick();f.send({type:'RunStarted',runId:'r'},agent('c1','created'),{type:'RunError',code:'PROVIDER_ERROR',message:'boom'});
  const x:any=await run;
  assert.equal(x.result.ok,false);
  assert.ok(f.cancelled.includes('c1'));
});
