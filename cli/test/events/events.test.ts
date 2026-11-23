import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventBridge} from '../../src/events/bridge.ts';

test('AG-UI text and final events translate to stable CLI schema', () => {
  const bridge = createEventBridge('s1', ()=>'2026-09-14T00:00:00.000Z');
  const first = bridge.translate({type:'TextMessageContent', messageId:'m1', delta:'ciao'});
  const final = bridge.translate({type:'RunFinished', result:{detto:'ok'}});
  assert.equal(first?.schema,'talos.cli.event.v1');
  assert.equal(first?.type,'message.delta');
  assert.equal(first?.data.delta,'ciao');
  assert.equal(final?.type,'run.completed');
  assert.equal(final?.seq,2);
});

test('approval event carries request id without exposing credentials', () => {
  const bridge = createEventBridge('s1');
  const e = bridge.translate({type:'ApprovalRequested', requestId:'r1', azione:{tipo:'shell',comando:'npm test'}})!;
  assert.equal(e.type,'approval.required');
  assert.equal(e.data.requestId,'r1');
  assert.doesNotMatch(JSON.stringify(e), /api[_-]?key|authorization/i);
});

test('event bridge redacts known secret values even when they appear inside ordinary text fields',()=>{
  const bridge=createEventBridge('s1',()=> '2026-09-14T00:00:00.000Z',['super-secret-value']);
  const e=bridge.translate({type:'ToolCallOutput',output:'token copied: super-secret-value'})!;
  const text=JSON.stringify(e);
  assert.doesNotMatch(text,/super-secret-value/u);
  assert.match(text,/REDACTED/u);
});
