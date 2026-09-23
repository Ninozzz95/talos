import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {
  MAX_TRANSCRIPT_ITEMS,appendTranscriptMessage,appendTranscriptWarning,createTranscriptModel,reduceTranscriptEvent,
} from '../../src/tui/transcript-model.ts';
import {createTuiEventAdapter} from '../../src/tui/event-adapter.ts';
import {initialTuiState,reduceTuiEvent} from '../../src/tui/state.ts';

test('M4-A RED — one timeline preserves first-appearance chronology while streams mutate in place',()=>{
  let model=createTranscriptModel();
  model=reduceTranscriptEvent(model,{type:'run.started',sessionId:'s1',runId:'r1',eventId:'seq:1'});
  model=reduceTranscriptEvent(model,{type:'message.started',messageId:'a1',role:'assistant',eventId:'seq:2'});
  model=reduceTranscriptEvent(model,{type:'message.delta',messageId:'a1',delta:'before'});
  model=reduceTranscriptEvent(model,{type:'tool.started',toolCallId:'t1',toolName:'bash',eventId:'seq:3'});
  model=reduceTranscriptEvent(model,{type:'tool.args',toolCallId:'t1',delta:'{"command":"pwd"}'});
  model=reduceTranscriptEvent(model,{type:'reasoning.started',messageId:'q1',eventId:'seq:4'});
  model=reduceTranscriptEvent(model,{type:'reasoning.delta',messageId:'q1',delta:'checking'});
  model=reduceTranscriptEvent(model,{type:'tool.completed',toolCallId:'t1',content:'/repo'});
  model=reduceTranscriptEvent(model,{type:'message.started',messageId:'a2',role:'assistant',eventId:'seq:5'});
  model=reduceTranscriptEvent(model,{type:'message.delta',messageId:'a2',delta:'after'});
  assert.deepEqual(model.items.map(row=>row.id),['run:r1','message:a1','tool:t1','reasoning:q1','message:a2']);
  assert.equal((model.items[1] as any).text,'before');
  assert.equal((model.items[2] as any).finalOutput,'/repo');
  assert.equal((model.items[3] as any).text,'checking');

  const before=model.items.map(row=>row.id);
  model=reduceTranscriptEvent(model,{type:'message.started',messageId:'a1',role:'assistant',eventId:'seq:99'});
  model=reduceTranscriptEvent(model,{type:'message.delta',messageId:'a1',delta:'!'});
  assert.deepEqual(model.items.map(row=>row.id),before);
  assert.equal((model.items[1] as any).text,'before!');
});

test('M4-A RED — local user and warning facts join the same chronology with stable explicit/local ids',()=>{
  let model=createTranscriptModel();
  model=appendTranscriptMessage(model,{id:'user-submit-1',role:'user',text:'do it'});
  model=appendTranscriptWarning(model,'runtime fallback');
  model=appendTranscriptWarning(model,'runtime fallback');
  assert.deepEqual(model.items.map(row=>row.kind),['message','warning','warning']);
  assert.equal(model.items[0]?.id,'message:user-submit-1');
  assert.notEqual(model.items[1]?.id,model.items[2]?.id);
  assert.deepEqual(model.items.map(row=>row.id),[...new Set(model.items.map(row=>row.id))]);
});

test('M4-A RED — unified bound evicts oldest finalized items but never active streams or running tools',()=>{
  let model=createTranscriptModel();
  model=reduceTranscriptEvent(model,{type:'message.started',messageId:'live',role:'assistant',eventId:'seq:1'});
  model=reduceTranscriptEvent(model,{type:'message.delta',messageId:'live',delta:'still streaming'});
  model=reduceTranscriptEvent(model,{type:'tool.started',toolCallId:'tool-live',toolName:'bash',eventId:'seq:2'});
  for(let i=0;i<MAX_TRANSCRIPT_ITEMS+25;i++)model=appendTranscriptWarning(model,'warning '+i);
  assert.equal(model.items.length,MAX_TRANSCRIPT_ITEMS);
  assert.ok(model.items.some(row=>row.id==='message:live'));
  assert.ok(model.items.some(row=>row.id==='tool:tool-live'));
  assert.equal(model.items.some(row=>row.kind==='warning'&&(row as any).text==='warning 0'),false);
});

test('M4-A RED — adapter retains stream starts roles run ids and persisted event identity',()=>{
  const adapter=createTuiEventAdapter([]);
  adapter.bindSession('s1');
  assert.deepEqual(adapter.translate({type:'TextMessageStart',messageId:'m1',role:'assistant',_sequenza:11}),{
    type:'message.started',messageId:'m1',role:'assistant',eventId:'seq:11',
  });
  assert.deepEqual(adapter.translate({type:'ReasoningMessageStart',messageId:'q1',_sequenza:12}),{
    type:'reasoning.started',messageId:'q1',eventId:'seq:12',
  });
  assert.deepEqual(adapter.translate({type:'RunStarted',sessionId:'s1',threadId:'thread',runId:'r1',_sequenza:10}),{
    type:'run.started',sessionId:'s1',runId:'r1',eventId:'seq:10',
  });
  assert.deepEqual(adapter.translate({type:'RuntimeFallback',reason:'provider down',_sequenza:13}),{
    type:'warning',message:'provider down',eventId:'seq:13',
  });
  assert.deepEqual(adapter.translate({type:'RunFinished',runId:'r1',_sequenza:14}),{
    type:'run.completed',runId:'r1',eventId:'seq:14',
  });
});

test('M4-A RED — state keeps compatibility fields but transcript is the semantic source of chronology',()=>{
  let state=initialTuiState({model:'m',permissionMode:'default'});
  state=reduceTuiEvent(state,{type:'message.started',messageId:'a1',role:'assistant',eventId:'seq:1'});
  state=reduceTuiEvent(state,{type:'message.delta',messageId:'a1',delta:'hello'});
  state=reduceTuiEvent(state,{type:'tool.started',toolCallId:'t1',toolName:'bash',eventId:'seq:2'});
  state=reduceTuiEvent(state,{type:'message.end',messageId:'a1'});
  assert.deepEqual(state.transcript.items.map((row:any)=>row.id),['message:a1','tool:t1']);
  assert.equal(state.messages.at(-1)?.text,'hello');
  assert.equal(state.tools.at(-1)?.id,'t1');
});

test('M4-A RED — app renders and navigates the semantic timeline instead of category buckets',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/state\.transcript\.items as TranscriptItem\[\]/u);
  assert.match(source,/planTranscriptVirtualWindow/u);
  assert.match(source,/items:visibleTranscriptItems/u);
  assert.match(source,/renderTranscriptItem/u);
  assert.doesNotMatch(source,/\.\.\.messages\.map\(/u);
  assert.doesNotMatch(source,/\.\.\.state\.tools\.slice\(/u);
  assert.match(source,/transcript:createTranscriptModel\(\)/u);
});
