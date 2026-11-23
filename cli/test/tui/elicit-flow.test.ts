/*
 * Stage 3, MCP elicitation on the screen (owner 02/10; mockup step-17). The server's request reaches the screen's events;
 * the session controller shows one at a time and sends the person's answer (closed from anywhere, a replay reopens it only
 * while its run waits — as questions and plans); the transcript says what happened as the mockup does: a decline
 * («You declined: <server> will not get access.»), a cancel by the person («Cancelled.»), nothing for a close by the system.
 * The form's content never comes back from the kernel (privacy): its receipt is added by the screen when it sends.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {appendTranscriptAnswers,createTranscriptModel,reduceTranscriptEvent,type TranscriptModel} from '../../src/tui/transcript-model.ts';
import {createTuiSessionController,type PendingTuiElicitation} from '../../src/tui/session-controller.ts';

const requested=(extra:Record<string,unknown>={})=>({type:'McpElicitationRequested',requestId:'e-1',server:'linear',mode:'url',message:'Sign in',url:'https://linear.app/oauth',dominio:'linear.app',elicitationId:'x',...extra});
const resolved=(extra:Record<string,unknown>)=>({type:'McpElicitationResolved',requestId:'e-1',...extra});

function feed(...records:Array<Record<string,unknown>>){
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const bridge=createV2EventBridge('s1',()=>'2026-10-02T20:00:00.000Z');
  const events:TuiEvent[]=[];let model:TranscriptModel=createTranscriptModel();
  for(const record of records)for(const event of adapter.translateAll(bridge.translate(record))){events.push(event);model=reduceTranscriptEvent(model,event);}
  return{events,model};
}
const texts=(model:TranscriptModel)=>model.items.map(i=>(i as any).text??i.kind);

test('the request reaches the screen\'s events with the server, the mode and the domain',()=>{
  const event=feed(requested()).events.find(e=>e.type==='elicitation.required') as Extract<TuiEvent,{type:'elicitation.required'}>;
  assert.deepEqual([event.requestId,event.server,event.mode,event.url,event.domain],['e-1','linear','url','https://linear.app/oauth','linear.app']);
});

test('the transcript: a decline and a person\'s cancel say so; a system close and an accept leave nothing from the event',()=>{
  assert.deepEqual(texts(feed(requested(),resolved({action:'decline',da:'persona'})).model),['You declined: linear will not get access.']);
  assert.deepEqual(texts(feed(requested(),resolved({action:'cancel',da:'persona'})).model),['Cancelled.']);
  assert.deepEqual(texts(feed(requested(),resolved({action:'cancel',da:'sistema',motivo:'fermato'})).model),[]);
  assert.deepEqual(texts(feed(requested(),resolved({action:'accept',da:'persona'})).model),[]);
  const local=appendTranscriptAnswers(createTranscriptModel(),'elicit:e-1',[{title:'Repository',answer:'acme/shop-api'}]);
  assert.deepEqual(local.items.map(i=>[i.kind,(i as any).pairs]),[['answers',[{title:'Repository',answer:'acme/shop-api'}]]]);
});

function fakeRuntime(history:any[]=[],outcome='running'){
  const sinks=new Map<string,(e:any)=>void>();const answers:any[]=[];
  const r:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s1',outcome}],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);for(const e of history)sink(e);return()=>sinks.delete(id);},
    answerApproval:async()=>{},answerQuestion:async()=>{},answerPlan:async()=>{},answerElicitation:async(...a:any[])=>{answers.push(a);},cancel:async()=>{},close:async()=>{}};
  return{r,answers,emit:(e:any)=>sinks.get('s1')?.(e)};
}
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const controller=(f:ReturnType<typeof fakeRuntime>,shown:Array<PendingTuiElicitation|null>)=>createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onElicitation:(e:PendingTuiElicitation|null)=>shown.push(e)} as any);

test('the controller shows the request, sends the answer, and a close from anywhere takes it away',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiElicitation|null>=[];const c=controller(f,shown);
  await c.initialize({initialPrompt:'open a PR'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(requested());await tick();
  assert.deepEqual(shown.at(-1),{requestId:'e-1',sessionId:'s1',server:'linear',mode:'url',message:'Sign in',url:'https://linear.app/oauth',domain:'linear.app'});
  await c.answerElicitation('e-1',{action:'decline'});
  assert.deepEqual(f.answers,[['s1','e-1',{action:'decline'}]]);
  assert.equal(shown.at(-1),null);
  await assert.rejects(c.answerElicitation('e-1',{action:'cancel'}),{code:'ELICITATION_NOT_OPEN'});
  f.emit(requested({requestId:'e-2'}));await tick();
  f.emit(resolved({requestId:'e-2',action:'cancel',da:'sistema',motivo:'fermato'}));await tick();
  assert.equal(shown.at(-1),null);
});

test('replay: a closed request never reopens; an open one reopens only while its run waits',async()=>{
  const closed=fakeRuntime([{type:'RunStarted',runId:'r1'},requested(),resolved({action:'decline',da:'persona'})],'running');const a:Array<PendingTuiElicitation|null>=[];
  await controller(closed,a).resumeSession('s1');await tick(5);
  assert.deepEqual(a.filter(Boolean),[]);
  const live=fakeRuntime([{type:'RunStarted',runId:'r1'},requested()],'running');const b:Array<PendingTuiElicitation|null>=[];
  await controller(live,b).resumeSession('s1');await tick(5);
  assert.equal(b.at(-1)?.requestId,'e-1');
  const dead=fakeRuntime([{type:'RunStarted',runId:'r1'},requested()],'stopped');const d:Array<PendingTuiElicitation|null>=[];
  await controller(dead,d).resumeSession('s1');await tick(5);
  assert.deepEqual(d.filter(Boolean),[]);
});

test('a refused answer keeps the request on screen',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiElicitation|null>=[];const c=controller(f,shown);
  f.r.answerElicitation=async()=>{throw Object.assign(new Error('bad values'),{code:'ELICITATION_ANSWER_INVALID'});};
  await c.initialize({initialPrompt:'open a PR'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(requested());await tick();
  await assert.rejects(c.answerElicitation('e-1',{action:'accept'}),{code:'ELICITATION_ANSWER_INVALID'});
  assert.equal(shown.at(-1)?.requestId,'e-1');
});
