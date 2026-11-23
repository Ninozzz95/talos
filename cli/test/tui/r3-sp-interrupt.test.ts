/*
 * R3 lane SP — gate E8, owner decision Q-R3-8: a stop the person asked for is not a failure. The kernel ends every stopped
 * run with `RunError{code:'fermato'}` (harness-ui/src/agent-service.mjs:185), which reached the transcript as
 * `Run · failed · Interrupted at your request …` (measured, gate §0.2). The CLI knows it asked for the stop, so the
 * controller turns that terminal event into the existing interrupted path (`run.cancelled{interrupted:true}`) with
 * `reason:'person'`. A `fermato` the person did not ask for (the model went silent) stays a failure.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';

function fakeRuntime(){
  const sinks=new Map<string,(e:any)=>void>();let releaseCancel:()=>void=()=>{};
  const r:any={
    restore:async()=>({restored:0,total:0}),listSessions:async()=>[],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);return()=>sinks.delete(id);},
    answerApproval:async()=>{},cancel:async()=>{},close:async()=>{},shell:async()=>{},
  };
  return{r,sinks,get releaseCancel(){return releaseCancel;}};
}
function controller(f:ReturnType<typeof fakeRuntime>,events:any[]){
  return createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:(e:any)=>events.push(e)} as any);
}
const tick=()=>new Promise(r=>setTimeout(r,0));

test('R3-SP E8: Esc (interrupt) then the kernel\'s fermato is an interrupted run, not a failure',async()=>{
  const f=fakeRuntime();const events:any[]=[];const c=controller(f,events);c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',threadId:'s1',input:{consegna:'hello'}});
  const stopping=c.interrupt();await tick();
  f.sinks.get('s1')?.({type:'RunError',runId:'r1',code:'fermato',message:'Fermato su richiesta.'});
  await stopping;
  const terminal=events.filter(e=>e.type==='run.failed'||e.type==='run.cancelled');
  assert.equal(terminal.length,1);
  assert.equal(terminal[0].type,'run.cancelled',`E8: the person's stop reached the screen as ${terminal[0].type}`);
  assert.equal(terminal[0].interrupted,true);
  assert.equal(terminal[0].reason,'person');
  assert.equal(terminal[0].runId,'r1');
});

test('R3-SP E8: Ctrl+C (cancel) then fermato is an interrupted run too, even when the kernel answers after cancel() returned',async()=>{
  const f=fakeRuntime();const events:any[]=[];const c=controller(f,events);c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',threadId:'s1',input:{consegna:'hello'}});
  await c.cancel();await tick();
  f.sinks.get('s1')?.({type:'RunError',runId:'r1',code:'fermato',message:'Fermato su richiesta.'});
  const last=events.filter(e=>e.type==='run.failed'||(e.type==='run.cancelled'&&e.runId)).at(-1);
  assert.equal(last?.type,'run.cancelled',`E8: a late fermato after cancel() became ${last?.type}`);
  assert.equal(last?.reason,'person');
});

test('R3-SP E8: a fermato nobody asked for stays a failure',async()=>{
  const f=fakeRuntime();const events:any[]=[];const c=controller(f,events);c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',threadId:'s1',input:{consegna:'hello'}});
  f.sinks.get('s1')?.({type:'RunError',runId:'r1',code:'fermato',message:'stopped'});
  assert.equal(events.at(-1)?.type,'run.failed');
});

test('R3-SP E8: a provider failure that races the stop stays a failure, and the next run is judged afresh',async()=>{
  const f=fakeRuntime();const events:any[]=[];const c=controller(f,events);c.attach('s1');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r1',threadId:'s1',input:{consegna:'hello'}});
  const stopping=c.interrupt();await tick();
  f.sinks.get('s1')?.({type:'RunError',runId:'r1',code:'PROVIDER_REQUEST_ERROR',message:'HTTP 500'});
  await stopping;
  assert.equal(events.at(-1)?.type,'run.failed','a provider failure is not rewritten into an interrupt');
  f.sinks.get('s1')?.({type:'RunStarted',runId:'r2',threadId:'s1',input:{consegna:'again'}});
  f.sinks.get('s1')?.({type:'RunError',runId:'r2',code:'fermato',message:'stopped'});
  assert.equal(events.at(-1)?.type,'run.failed','the stop request of r1 does not leak into r2');
});

/*
 * Coordinator note (R3 integration): a person's stop replayed from history (a `RunError{code:'fermato'}` in the session
 * log) still read as R2's failure line. The kernel sends `fermato` for exactly two things (agent-service.mjs:185): the
 * person's stop, and a generation that stopped by itself, which carries KERNEL_RUN_TEXT.stoppedWithoutAnswer word for word
 * (kernel-map.ts). In a replay the CLI cannot have asked, so every `fermato` but that one is the person's interrupt.
 */
test('R3-SP E8: a replayed person stop is an interrupt; a replayed "stopped without an answer" stays a failure',async()=>{
  const {KERNEL_RUN_TEXT}=await import('../../src/i18n/kernel-map.ts');
  for(const [message,expected] of [['⛔ interrotto su richiesta: mentre il modello stava rispondendo, al giro 1.','run.cancelled'],[KERNEL_RUN_TEXT.stoppedWithoutAnswer,'run.failed']] as const){
    const history=[{type:'RunStarted',runId:'r1',threadId:'s1',input:{consegna:'hello'}},{type:'RunError',runId:'r1',code:'fermato',message}];
    const f=fakeRuntime();const events:any[]=[];
    f.r.subscribe=(id:string,sink:(e:any)=>void)=>{f.sinks.set(id,sink);for(const e of history)sink(e);return()=>f.sinks.delete(id);};
    f.r.listSessions=async()=>[{sessionId:'s1',outcome:'stopped'}];
    const c=controller(f,events);await c.resumeSession('s1');
    const terminal=events.filter(e=>e.type==='run.failed'||e.type==='run.cancelled');
    assert.equal(terminal.length,1);
    assert.equal(terminal[0].type,expected,`${message}: ${terminal[0].type}`);
    if(expected==='run.cancelled'){assert.equal(terminal[0].interrupted,true);assert.equal(terminal[0].reason,'person');}
  }
});
