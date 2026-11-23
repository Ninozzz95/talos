/*
 * R1 lane R (2026-09-24) — the person's message is one item whether the local echo (app.ts `userMessage`) or the replayed
 * RunStarted arrives first, and a replayed history message never swallows a new echo (review D-04; gate E9).
 * The kernel event shapes are the ones measured through the real composition on 2026-09-24 (r1-resume-history.test.ts).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createTuiEventAdapter,type TuiEvent} from '../../src/tui/event-adapter.ts';
import {appendTranscriptMessage,createTranscriptModel,reduceTranscriptEvent,transcriptItemText,type TranscriptModel} from '../../src/tui/transcript-model.ts';

const echo=(model:TranscriptModel,text:string)=>appendTranscriptMessage(model,{role:'user',text});
const started=(runId:string,prompt:string,history=false):TuiEvent=>({type:'run.started',sessionId:'s1',runId,prompt,...(history?{history:true}:{})} as TuiEvent);
const texts=(model:TranscriptModel)=>model.items.filter(item=>item.kind==='message').map(item=>transcriptItemText(item));

test('R1-R — the adapter carries the prompt of RunStarted.input.consegna, with project references summarised as typed',()=>{
  const adapter=createTuiEventAdapter();adapter.bindSession('s1');
  const consegna='explain @README.md\n\n[TALOS project reference: README.md · 7 bytes]\n# demo\n\n[End TALOS project reference]';
  const event=adapter.translate({type:'RunStarted',_sequenza:1,threadId:'t',runId:'r1',input:{consegna,consegnaCorta:'explain',progetto:'p'}});
  assert.equal(event?.type==='run.started'?event.prompt:null,'explain @README.md');
  const plain=adapter.translate({type:'RunStarted',_sequenza:2,threadId:'t',runId:'r2',input:{consegna:'second',seguito:true}});
  assert.equal(plain?.type==='run.started'?plain.prompt:null,'second');
  const local=adapter.translate({type:'RunStarted',_sequenza:3,threadId:'t',runId:'r3',input:[{role:'system',content:'x'},{role:'user',content:'from the local runtime'}]});
  assert.equal(local?.type==='run.started'?local.prompt:null,'from the local runtime');
  const none=adapter.translate({type:'RunStarted',_sequenza:4,threadId:'t',runId:'r4'});
  assert.equal(none?.type==='run.started'&&'prompt' in none,false,'no input, no prompt field');
});

test('R1-R — echo first (a send from the composer): the replayed RunStarted adopts the echo, no duplicate',()=>{
  let model=echo(createTranscriptModel(),'hi');
  model=reduceTranscriptEvent(model,started('r1','hi'));
  model=reduceTranscriptEvent(model,{type:'message.started',messageId:'a1',role:'assistant'});
  model=reduceTranscriptEvent(model,{type:'message.delta',messageId:'a1',delta:'OK'});
  model=reduceTranscriptEvent(model,{type:'run.completed',runId:'r1'});
  assert.deepEqual(texts(model),['You\nhi','TALOS\nOK']);
  assert.equal(model.items[0]?.id,'message:user:r1','the echo now carries the stable id of its run');
  // The same history replayed again (a second attach from 0) is idempotent.
  model=reduceTranscriptEvent(model,started('r1','hi',true));
  assert.deepEqual(texts(model),['You\nhi','TALOS\nOK']);
});

test('R1-R — event first (a queued prompt, or the prompt given on the command line): the late echo is absorbed',()=>{
  let model=reduceTranscriptEvent(createTranscriptModel(),started('r1','queued one'));
  model=echo(model,'queued one');
  assert.deepEqual(texts(model),['You\nqueued one']);
  const kinds=model.items.map(item=>item.kind);
  /* R3 Q-R3-9 (owner 2026-09-24): the Run row is gone, so the You message is the run's only item; the run is followed in
     `model.runs`, anchored at that message. */
  assert.deepEqual(kinds,['message'],'the You message, and no Run row');
  assert.deepEqual(model.runs?.map(run=>[run.key,run.anchor]),[['r1','message:user:r1']]);
});

test('R1-R — a replayed history message never swallows a new echo with the same text',()=>{
  let model=reduceTranscriptEvent(createTranscriptModel(),started('r1','hi',true));
  model=reduceTranscriptEvent(model,{type:'run.completed',runId:'r1'});
  model=echo(model,'hi');
  assert.deepEqual(texts(model),['You\nhi','You\nhi'],'the new send is visible at once, even if it then fails');
  model=reduceTranscriptEvent(model,started('r2','hi'));
  assert.deepEqual(texts(model),['You\nhi','You\nhi'],'and its own RunStarted adopts it');
});

test('R1-R — two identical prompts sent one after the other stay two messages',()=>{
  let model=createTranscriptModel();
  for(const run of ['r1','r2']){model=echo(model,'again');model=reduceTranscriptEvent(model,started(run,'again'));model=reduceTranscriptEvent(model,{type:'run.completed',runId:run});}
  assert.deepEqual(texts(model),['You\nagain','You\nagain']);
  let queued=createTranscriptModel();
  for(const run of ['q1','q2']){queued=reduceTranscriptEvent(queued,started(run,'again'));queued=echo(queued,'again');}
  assert.deepEqual(texts(queued),['You\nagain','You\nagain'],'queued twice: each late echo is absorbed by its own run');
});

test('R1-R — an interrupted run closes its row and every streaming item',()=>{
  let model=reduceTranscriptEvent(createTranscriptModel(),started('r1','cut me off',true));
  model=reduceTranscriptEvent(model,{type:'message.started',messageId:'a1',role:'assistant'});
  model=reduceTranscriptEvent(model,{type:'message.delta',messageId:'a1',delta:'partial'});
  model=reduceTranscriptEvent(model,{type:'tool.started',toolCallId:'t1',toolName:'bash'});
  model=reduceTranscriptEvent(model,{type:'run.cancelled',runId:'r1',interrupted:true} as TuiEvent);
  /* R3 Q-R3-8/9 (owner 2026-09-24): no Run row; the run is closed as interrupted and leaves one neutral line that says
     TALOS was closed (a replayed history run the kernel reports cut off). */
  assert.deepEqual(model.runs?.map(run=>run.status),['interrupted']);
  const notice=model.items.find(item=>item.kind==='warning'&&item.outcome==='interrupted');
  assert.equal(model.items.some(item=>(item.kind==='message'&&item.streaming)||(item.kind==='tool'&&['queued','approval','running','streaming'].includes(item.status))),false);
  assert.equal(transcriptItemText(notice!),'Interrupted · TALOS was closed before this run finished');
});
