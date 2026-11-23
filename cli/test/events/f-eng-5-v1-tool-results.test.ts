/*
 * F-ENG-5 (stress test of 0.5.0, 08/10/2026): in `--output-format stream-json` with protocol v1 only shell commands reported
 * anything after `tool.started` (their output chunks, as `tool.completed` with `delta`); a read, an edit, a search had no
 * result event at all (the stress run: 280 tool.started, 72 tool.completed). Every tool now ends with one `tool.completed`
 * carrying its result `content` and `status`, as Codex `exec --json` (`item.completed`) and OpenCode `run --format json`
 * (`tool_use` on completed/error) do. Additive: the shell's chunks keep their bytes (v1-golden).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventBridge} from '../../src/events/bridge.ts';

const at=()=>'2026-10-09T10:00:00.000Z';

test('F-ENG-5: a non-shell tool ends with one tool.completed carrying its result and status',()=>{
  const bridge=createEventBridge('s',at);
  const started=bridge.translate({type:'ToolCallStart',toolCallId:'call-read',toolCallName:'leggi'});
  const done=bridge.translate({type:'ToolCallResult',messageId:'m',toolCallId:'call-read',content:'# demo',role:'tool'});
  assert.equal(started?.type,'tool.started');
  assert.equal(done?.type,'tool.completed','the result is reported');
  assert.deepEqual({toolCallId:done?.data.toolCallId,content:done?.data.content,status:done?.data.status},{toolCallId:'call-read',content:'# demo',status:'completed'});
  assert.equal(done!.seq,started!.seq+1,'it takes the next number of the same sequence');
});

test('F-ENG-5: a failed tool says failed; a second result for the same call is not a second event',()=>{
  const bridge=createEventBridge('s',at);
  const failed=bridge.translate({type:'ToolCallResult',toolCallId:'call-x',content:'error: EISDIR',isError:true,receipt:{status:'failed'}});
  assert.equal(failed?.data.status,'failed');
  assert.equal(bridge.translate({type:'ToolCallResult',toolCallId:'call-x',content:'error: EISDIR',receipt:{status:'failed',evidence:{exitCode:1}}}),null);
});

test('F-ENG-5: the shell keeps its output chunks, then ends with its result like every tool',()=>{
  const bridge=createEventBridge('s',at);
  const chunk=bridge.translate({type:'ToolCallOutput',toolCallId:'call-sh',delta:'hello'});
  const done=bridge.translate({type:'ToolCallResult',toolCallId:'call-sh',content:'exit 0\nhello',receipt:{status:'succeeded',evidence:{exitCode:0}}});
  assert.deepEqual(chunk?.data,{toolCallId:'call-sh',delta:'hello'},'the chunk is unchanged');
  assert.equal(done?.type,'tool.completed');
  assert.equal(done?.data.status,'completed');
  assert.equal(done?.data.exitCode,0);
});

test('F-ENG-5: a call refused (by a hook, a rule, a person) or that errored is not reported as completed',()=>{
  const bridge=createEventBridge('s',at);
  const refused=bridge.translate({type:'ToolCallResult',toolCallId:'call-w',content:'REFUSED. hook exited 7 Nothing was done.',receipt:{consentito:false,via:'hook'}});
  const errored=bridge.translate({type:'ToolCallResult',toolCallId:'call-e',content:'error: EISDIR',isError:true});
  assert.equal(refused?.data.status,'failed');
  assert.equal(errored?.data.status,'failed');
});

test('F-ENG-5: a secret in a result is redacted like every other event',()=>{
  const bridge=createEventBridge('s',at,['sk-live-SECRET123456']);
  const done=bridge.translate({type:'ToolCallResult',toolCallId:'call-env',content:'KEY=sk-live-SECRET123456'});
  assert.doesNotMatch(String(done?.data.content),/SECRET123456/u);
});
