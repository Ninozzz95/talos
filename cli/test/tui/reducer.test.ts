import assert from 'node:assert/strict';
import test from 'node:test';
import {initialTuiState,reduceTuiEvent,selectVisibleTranscript} from '../../src/tui/state.ts';
const ev=(type:string,rest:Record<string,unknown>={})=>({type,...rest} as never);

test('assistant deltas stay live until message end and do not duplicate final text',()=>{
  let s=initialTuiState({model:'openai:gpt-5-mini',permissionMode:'default'});
  s=reduceTuiEvent(s,ev('message.delta',{messageId:'m1',delta:'hel'}));
  s=reduceTuiEvent(s,ev('message.delta',{messageId:'m1',delta:'lo'}));
  assert.equal(s.streamingAssistant?.text,'hello');
  assert.equal(s.messages.length,0);
  s=reduceTuiEvent(s,ev('message.end',{messageId:'m1'}));
  assert.equal(s.streamingAssistant,null);
  assert.equal(s.messages.at(-1)?.text,'hello');
});

test('partial tool output updates one row and cancellation closes open rows',()=>{
  let s=initialTuiState({model:'m',permissionMode:'default'});
  s=reduceTuiEvent(s,ev('tool.started',{toolCallId:'t',toolName:'bash'}));
  s=reduceTuiEvent(s,ev('tool.output',{toolCallId:'t',delta:'a'}));
  s=reduceTuiEvent(s,ev('tool.output',{toolCallId:'t',delta:'b'}));
  assert.equal(s.tools.length,1);
  assert.equal(s.tools[0]?.liveOutput,'ab');
  s=reduceTuiEvent(s,ev('run.cancelled'));
  assert.equal(s.tools[0]?.status,'cancelled');
});

test('approval stores exact request id',()=>{let s=initialTuiState({model:'m',permissionMode:'default'});s=reduceTuiEvent(s,ev('approval.required',{requestId:'r7',payload:{tool:'Bash',command:'npm test'}}));assert.equal(s.approval?.requestId,'r7');});
test('visible transcript remains bounded after 50000 events',()=>{let s=initialTuiState({model:'m',permissionMode:'default'});for(let i=0;i<50000;i++){s=reduceTuiEvent(s,ev('message.delta',{messageId:`m${i}`,delta:'x'}));s=reduceTuiEvent(s,ev('message.end',{messageId:`m${i}`}));}assert.ok(selectVisibleTranscript(s,{rows:40}).length<=120);});
test('render state bounds retained transcript metadata',()=>{let s=initialTuiState({model:'m',permissionMode:'default'});for(let i=0;i<1000;i++){s=reduceTuiEvent(s,ev('message.delta',{messageId:`b${i}`,delta:'x'}));s=reduceTuiEvent(s,ev('message.end',{messageId:`b${i}`}));}assert.ok(s.messages.length<=512);});

test('reasoning remains separate from final assistant transcript',()=>{
  let s=initialTuiState({model:'m',permissionMode:'default'});
  s=reduceTuiEvent(s,{type:'reasoning.delta',messageId:'r',delta:'private progress'});
  s=reduceTuiEvent(s,{type:'message.delta',messageId:'a',delta:'answer'});
  assert.equal(s.reasoning?.text,'private progress');
  assert.equal(s.streamingAssistant?.text,'answer');
});
