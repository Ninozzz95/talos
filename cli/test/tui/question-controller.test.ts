/*
 * Stage 3 (owner 01-02/10, registro 12): the session controller hands the screen the model's open question and the
 * person's answer back to the kernel, as it does for approvals. Like Codex's request queue (one shown, the next after it;
 * `serverRequest/resolved` clears one answered elsewhere) and our Q-R3-15 for approvals: a replay never reopens a question
 * already closed, and reopens a pending one only when its run is still waiting in the kernel.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiSessionController,type PendingTuiQuestion} from '../../src/tui/session-controller.ts';

const tick=(ms=0)=>new Promise(r=>setTimeout(r,ms));
const Q=(id:string)=>[{id,question:`Question ${id}?`,options:[{label:'Yes',description:'a'},{label:'No',description:'b'}]}];
const asked=(requestId:string,extra:Record<string,unknown>={})=>({type:'UserQuestionRequested',requestId,questions:Q(requestId),toolCallId:`call_${requestId}`,...extra});
const closed=(requestId:string,status='answered')=>({type:'UserQuestionResolved',requestId,status,...(status==='answered'?{answers:{[requestId]:'Yes'}}:{}),da:'persona'});

function fakeRuntime(history:any[]=[],outcome='running'){
  const sinks=new Map<string,(e:any)=>void>();const answers:any[]=[];
  const r:any={
    restore:async()=>({restored:1,total:1}),listSessions:async()=>[{sessionId:'s1',outcome}],export:()=>({eventi:[]}),
    start:async()=>'s1',resume:async(id:string)=>id,fork:async()=>'f1',compact:async()=>({ok:true}),
    subscribe(id:string,sink:(e:any)=>void){sinks.set(id,sink);for(const e of history)sink(e);return()=>sinks.delete(id);},
    answerApproval:async()=>{},answerQuestion:async(...a:any[])=>{answers.push(a);},cancel:async()=>{},close:async()=>{},
  };
  return{r,sinks,answers,emit:(e:any)=>sinks.get('s1')?.(e)};
}
function controller(f:ReturnType<typeof fakeRuntime>,shown:Array<PendingTuiQuestion|null>){
  return createTuiSessionController({runtime:f.r,projectRoot:process.cwd(),model:'m',mode:'default',rules:{allow:[],ask:[],deny:[]},onEvent:()=>{},onQuestion:(q:PendingTuiQuestion|null)=>shown.push(q)} as any);
}
const last=(shown:Array<PendingTuiQuestion|null>)=>shown.at(-1)??null;

test('a live question is shown with its session, questions and tool call; the answer goes to the kernel and closes it',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiQuestion|null>=[];const c=controller(f,shown);
  await c.initialize({initialPrompt:'go'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(asked('q1',{origine:{modalita:'normale',agente:'principale'}}));await tick();
  assert.deepEqual(last(shown),{requestId:'q1',sessionId:'s1',questions:Q('q1'),toolCallId:'call_q1',origin:{mode:'normal',agent:'root'}});
  await c.answerQuestion('q1',{status:'answered',answers:{q1:'Yes'}});
  assert.deepEqual(f.answers,[['s1','q1',{status:'answered',answers:{q1:'Yes'}}]]);
  assert.equal(last(shown),null);
});

test('one at a time: a second question waits behind the first and shows when the first closes, even closed elsewhere',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiQuestion|null>=[];const c=controller(f,shown);
  await c.initialize({initialPrompt:'go'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(asked('q1'));f.emit(asked('q2'));await tick();
  assert.equal(last(shown)?.requestId,'q1');
  f.emit(closed('q1'));await tick();
  assert.equal(last(shown)?.requestId,'q2','answered in another interface: the next one shows');
  f.emit(closed('q2','cancelled'));await tick();
  assert.equal(last(shown),null);
});

test('a refused answer keeps the question on screen and says why',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiQuestion|null>=[];const c=controller(f,shown);
  f.r.answerQuestion=async()=>{throw Object.assign(new Error('answer for an unknown question'),{code:'QUESTION_ANSWER_FAILED'});};
  await c.initialize({initialPrompt:'go'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(asked('q1'));await tick();
  await assert.rejects(c.answerQuestion('q1',{status:'answered',answers:{q1:'Yes'}}),/unknown question/u);
  assert.equal(last(shown)?.requestId,'q1');
});

test('an answer for a question that is not open is refused without calling the kernel',async()=>{
  const f=fakeRuntime();const c=controller(f,[]);
  await c.initialize({initialPrompt:'go'});
  await assert.rejects(c.answerQuestion('nope',{status:'cancelled'}),{code:'QUESTION_NOT_OPEN'});
  assert.deepEqual(f.answers,[]);
});

test('the end of the run takes its questions away',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiQuestion|null>=[];const c=controller(f,shown);
  await c.initialize({initialPrompt:'go'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(asked('q1'));await tick();
  assert.equal(last(shown)?.requestId,'q1');
  f.emit({type:'RunFinished',runId:'r1',esito:'fermato'});await tick();
  assert.equal(last(shown),null);
});

test('replay: an answered question never reopens; a pending one reopens only when its run is still waiting',async()=>{
  const answered=fakeRuntime([{type:'RunStarted',runId:'r1'},asked('old'),closed('old')],'running');const a:Array<PendingTuiQuestion|null>=[];
  await controller(answered,a).resumeSession('s1');await tick(5);
  assert.deepEqual(a.filter(Boolean),[],'already answered');
  const dead=fakeRuntime([{type:'RunStarted',runId:'r1'},asked('old',{ripristinabile:true})],'stopped');const d:Array<PendingTuiQuestion|null>=[];
  await controller(dead,d).resumeSession('s1');await tick(5);
  assert.deepEqual(d.filter(Boolean),[],'its run is over');
  const live=fakeRuntime([{type:'RunStarted',runId:'r1'},asked('live',{ripristinabile:true})],'running');const l:Array<PendingTuiQuestion|null>=[];
  await controller(live,l).resumeSession('s1');await tick(5);
  assert.equal(last(l)?.requestId,'live','its run still waits: shown once the replay is over');
});

test('a question already answered never reopens when the stream brings it again',async()=>{
  const f=fakeRuntime();const shown:Array<PendingTuiQuestion|null>=[];const c=controller(f,shown);
  await c.initialize({initialPrompt:'go'});
  f.emit({type:'RunStarted',runId:'r1'});f.emit(asked('q1'));await tick();
  await c.answerQuestion('q1',{status:'answered',answers:{q1:'Yes'}});
  f.emit(asked('q1'));await tick();
  assert.equal(last(shown),null);
});
