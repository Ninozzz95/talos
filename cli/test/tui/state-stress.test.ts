import test from 'node:test';
import assert from 'node:assert/strict';
import {initialTuiState,reduceTuiEvent,selectVisibleTranscript} from '../../src/tui/state.ts';
function ev(type:string,data:any={}){return{type,...data} as any;}
test('50k transcript events keep render state bounded',()=>{let s=initialTuiState({model:'m',permissionMode:'default'});for(let i=0;i<10_000;i++){s=reduceTuiEvent(s,ev('message.delta',{messageId:`m${i}`,delta:'x'.repeat(10)}));s=reduceTuiEvent(s,ev('message.end',{messageId:`m${i}`}));s=reduceTuiEvent(s,ev('tool.started',{toolCallId:`t${i}`,toolName:'shell'}));s=reduceTuiEvent(s,ev('tool.completed',{toolCallId:`t${i}`,content:'ok'}));s=reduceTuiEvent(s,ev('warning',{message:`w${i}`}));s=reduceTuiEvent(s,ev('usage.updated',{value:{tokens:i}}));}assert.ok(s.messages.length<=512,`messages ${s.messages.length}`);assert.ok(s.tools.length<=256,`tools ${s.tools.length}`);assert.ok(s.warnings.length<=128,`warnings ${s.warnings.length}`);assert.ok(selectVisibleTranscript(s,{rows:30}).length<=90);});

test('one live assistant delta preserves historical collection identities',()=>{
  const before=initialTuiState({model:'m',permissionMode:'default'});
  const after=reduceTuiEvent(before,ev('message.delta',{messageId:'live',delta:'x'}));
  assert.strictEqual(after.messages,before.messages);
  assert.strictEqual(after.tools,before.tools);
  assert.strictEqual(after.warnings,before.warnings);
  assert.deepEqual(after.streamingAssistant,{id:'live',text:'x'});
});

test('animation scheduler has no dependency on transcript reducer state',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/render-scheduler.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/reduceTuiEvent|messages|transcript/u);
});
