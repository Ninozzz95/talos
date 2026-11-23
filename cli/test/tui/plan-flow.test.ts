/*
 * Stage 3, the plan card (owner 02/10, registro 12). The proposed plan reaches the screen's events; the transcript keeps the
 * approved plan as the approved mockup draws it (`kind:'plan'`: «▣ Plan proposed · N steps» and the numbered steps) and
 * nothing for «keep planning» or a cancel; the `present_plan` tool draws no row of its own. The session controller shows
 * one plan at a time and sends the person's choice bound to the hash of the plan on screen, as for questions.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createV2EventBridge} from '../../src/protocol/v2/events.ts';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {planReceiptRows,type TranscriptPlanItem} from '../../src/tui/components/plan-receipt.ts';
import {createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';
import {estimateTranscriptItemRows} from '../../src/tui/components/transcript-virtualizer.ts';
import {createTuiSessionController,type PendingTuiPlan} from '../../src/tui/session-controller.ts';

const HASH='sha256:'+'c'.repeat(64);
const PLAN='1. Move the resize pipeline into src/export/worker.ts\n2. Post jobs through a bounded queue (4 at a time)\n3. Keep the sync path for files under 1 MB';
const value=(extra:Record<string,unknown>)=>({type:'CUSTOM',name:'talos.plan',value:{schema:'talos.plan.v1',planId:'p-1',sessionId:'s-1',revision:1,requestId:'r-1',hash:HASH,toolCallId:'call_plan',...extra}});
const proposed=value({status:'proposed',content:PLAN,ripristinabile:true});
const approved=value({status:'approved',decisione:'procedi-con-conferma',da:'persona'});

function feed(...records:Array<Record<string,unknown>>){
  const adapter=createTuiEventAdapter();adapter.bindSession('s-1');
  const bridge=createV2EventBridge('s-1',()=>'2026-10-02T16:00:00.000Z');
  const events:TuiEvent[]=[];let model:TranscriptModel=createTranscriptModel();
  for(const record of records)for(const event of adapter.translateAll(bridge.translate(record))){events.push(event);model=reduceTranscriptEvent(model,event);}
  return{events,model};
}

test('the screen gets the proposed plan and its close as events of their own',()=>{
  const {events}=feed(proposed,approved);
  const required=events.find(e=>e.type==='plan.required') as Extract<TuiEvent,{type:'plan.required'}>;
  assert.deepEqual([required.requestId,required.hash,required.content,required.toolCallId,required.revision],['r-1',HASH,PLAN,'call_plan',1]);
  const resolved=events.find(e=>e.type==='plan.resolved') as Extract<TuiEvent,{type:'plan.resolved'}>;
  assert.deepEqual([resolved.requestId,resolved.status,resolved.decision],['r-1','approved','ask-before-edits']);
});

test('approved: the transcript keeps the plan as the mockup draws it; the present_plan tool has no row',()=>{
  const {model}=feed({type:'ToolCallStart',toolCallId:'call_plan',toolCallName:'present_plan'},proposed,approved,
    {type:'ToolCallResult',toolCallId:'call_plan',content:'{"status":"approved"}',receipt:{status:'succeeded',consentito:true}});
  assert.deepEqual(model.items.map(i=>i.kind),['plan']);
  const item=model.items[0] as TranscriptPlanItem;
  assert.deepEqual(item.steps,['Move the resize pipeline into src/export/worker.ts','Post jobs through a bounded queue (4 at a time)','Keep the sync path for files under 1 MB']);
  assert.deepEqual(planReceiptRows(item,120,{unicode:true}),[
    {kind:'blank'},
    {kind:'header',glyph:'▣',title:'Plan proposed',count:' · 3 steps'},
    {kind:'step',number:'    1. ',text:'Move the resize pipeline into src/export/worker.ts'},
    {kind:'step',number:'    2. ',text:'Post jobs through a bounded queue (4 at a time)'},
    {kind:'step',number:'    3. ',text:'Keep the sync path for files under 1 MB'}]);
  assert.match(transcriptItemText(item),/^Plan proposed · 3 steps\n1\. Move the resize/u);
  assert.equal(estimateTranscriptItemRows(item,120),5);
});

test('keep planning, a cancel and a replayed close leave no extra rows; one plan item per request',()=>{
  assert.deepEqual(feed(proposed,value({status:'changes-requested',decisione:'continua-a-pianificare',da:'persona'})).model.items,[]);
  assert.deepEqual(feed(proposed,value({status:'cancelled',motivo:'fermato',da:'sistema'})).model.items,[]);
  assert.equal(feed(proposed,approved,approved).model.items.filter(i=>i.kind==='plan').length,1);
});

function fakeRuntime(history:any[]=[],outcome='running'){
  const sinks=new Map<string,(e:any)=>void>();const choices:any[]=[];
  const r:any={restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s1',outcome}],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);for(const e of history)sink(e);return()=>sinks.delete(id);},
    answerApproval:async()=>{},answerQuestion:async()=>{},answerPlan:async(...a:any[])=>{choices.push(a);},cancel:async()=>{},close:async()=>{}};
  return{r,choices,emit:(e:any)=>sinks.get('s1')?.(e)};
}
const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
function controller(f:ReturnType<typeof fakeRuntime>,shown:Array<PendingTuiPlan|null>){
  return createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'plan',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onPlan:(p:PendingTuiPlan|null)=>shown.push(p)} as any);
}

test('the controller shows the plan and sends the choice with the hash on screen; the close takes it away',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiPlan|null>=[];const c=controller(f,shown);
  await c.initialize({initialPrompt:'plan it'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(proposed);await tick();
  assert.deepEqual(shown.at(-1),{requestId:'r-1',sessionId:'s1',hash:HASH,content:PLAN,revision:1,toolCallId:'call_plan'});
  await c.answerPlan('r-1','keep-planning','smaller steps');
  assert.deepEqual(f.choices,[['s1',{requestId:'r-1',hash:HASH,decision:'keep-planning',feedback:'smaller steps'}]]);
  assert.equal(shown.at(-1),null);
  await assert.rejects(c.answerPlan('r-1','ask-before-edits'),{code:'PLAN_NOT_OPEN'});
});

test('a refused choice keeps the plan on screen; the end of the run and a close elsewhere take it away',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiPlan|null>=[];const c=controller(f,shown);
  f.r.answerPlan=async()=>{throw Object.assign(new Error('stale'),{code:'PLAN_STALE'});};
  await c.initialize({initialPrompt:'plan it'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(proposed);await tick();
  await assert.rejects(c.answerPlan('r-1','ask-before-edits'),{code:'PLAN_STALE'});
  assert.equal(shown.at(-1)?.requestId,'r-1');
  f.emit(approved);await tick();
  assert.equal(shown.at(-1),null,'approved in another interface');
  f.emit(value({status:'proposed',content:PLAN,requestId:'r-2',revision:2}));await tick();
  assert.equal(shown.at(-1)?.requestId,'r-2');
  f.emit({type:'RunFinished',runId:'r1'});await tick();
  assert.equal(shown.at(-1),null,'the end of the run');
});

test('replay: a decided plan never reopens; a pending one reopens only when its run still waits',async()=>{
  const decided=fakeRuntime([{type:'RunStarted',runId:'r1'},proposed,approved],'running');const d:Array<PendingTuiPlan|null>=[];
  await controller(decided,d).resumeSession('s1');await tick(5);
  assert.deepEqual(d.filter(Boolean),[]);
  const dead=fakeRuntime([{type:'RunStarted',runId:'r1'},proposed],'stopped');const x:Array<PendingTuiPlan|null>=[];
  await controller(dead,x).resumeSession('s1');await tick(5);
  assert.deepEqual(x.filter(Boolean),[]);
  const live=fakeRuntime([{type:'RunStarted',runId:'r1'},proposed],'running');const l:Array<PendingTuiPlan|null>=[];
  await controller(live,l).resumeSession('s1');await tick(5);
  assert.equal(l.at(-1)?.requestId,'r-1');
});

test('a plan the stream brings again after its approval is not drawn twice, and never reopens once decided',async()=>{
  assert.equal(feed(proposed,approved,proposed,approved).model.items.filter(i=>i.kind==='plan').length,1);
  const f=fakeRuntime();const shown:Array<PendingTuiPlan|null>=[];const c=controller(f,shown);
  await c.initialize({initialPrompt:'plan it'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(proposed);await tick();
  await c.answerPlan('r-1','ask-before-edits');
  f.emit(proposed);await tick();
  assert.equal(shown.at(-1),null);
});

test('after an approval made here the screen follows the kernel\'s new mode; a clean conversation names its session',async()=>{
  const decisions:Array<[string,string,string|undefined]>=[['procedi-con-conferma','default',undefined],['procedi-accetta-modifiche','acceptEdits',undefined],['conversazione-pulita','acceptEdits','s-new']];
  for(const [decisione,mode,newSessionId] of decisions){
    const f=fakeRuntime();const approvals:any[]=[];
    const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'plan',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onPlan:()=>{},onPlanApproved:(x:any)=>approvals.push(x)} as any);
    await c.initialize({initialPrompt:'plan it'});
    f.emit({type:'RunStarted',runId:'r1'});f.emit(proposed);await tick();
    f.emit(value({status:'approved',decisione,da:'persona',...(newSessionId?{nuovaSessionId:newSessionId}:{})}));await tick();
    assert.equal(c.mode(),mode,decisione);
    assert.deepEqual(approvals,[{mode,...(newSessionId?{newSessionId}:{})}],decisione);
  }
  const f=fakeRuntime();const approvals:any[]=[];
  const c=createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'plan',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onPlan:()=>{},onPlanApproved:(x:any)=>approvals.push(x)} as any);
  await c.initialize({initialPrompt:'plan it'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(proposed);await tick();
  f.emit(value({status:'changes-requested',decisione:'continua-a-pianificare',da:'persona'}));await tick();
  assert.equal(c.mode(),'plan','keep planning stays in plan mode');
  assert.deepEqual(approvals,[]);
  const replay=fakeRuntime([{type:'RunStarted',runId:'r1'},proposed,approved],'completed');const seen:any[]=[];
  const r=createTuiSessionController({runtime:replay.r,projectRoot:process.cwd(),model:'m',mode:'plan',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onPlan:()=>{},onPlanApproved:(x:any)=>seen.push(x)} as any);
  await r.resumeSession('s1');await tick(5);
  assert.deepEqual(seen,[],'an approval replayed from history changes nothing now');
});

