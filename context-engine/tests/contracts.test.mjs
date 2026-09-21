import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContextRecord, parseContextSettings, parseContextSummary, ContextEngineError } from '../src/contracts.mjs';

test('CTX-CONTRACTS: canonical messages preserve multimodal and provider data without allowing executable values', () => {
  const input = { id: 'm1', message: { role: 'user', content: [{ type: 'image_url', image_url: { url: '/api/v1/chat-images/i1' } }], extension: { values: [1, true, null] } }, createdAt: '2026-09-08T00:00:00.000Z' };
  assert.deepEqual(parseContextRecord(input).message, input.message);
  assert.throws(() => parseContextRecord({ ...input, message: { role: 'administrator', content: 'bad' } }), ContextEngineError);
  assert.throws(() => parseContextRecord({ ...input, message: { role: 'user', content: () => 'bad' } }), ContextEngineError);
});

test('CTX-CONTRACTS: tool results require identity and malformed calls cannot enter the canonical record', () => {
  const input = { id: 'm1', createdAt: '2026-09-08T00:00:00Z' };
  assert.throws(() => parseContextRecord({ ...input, message: { role: 'tool', content: 'output' } }), ContextEngineError);
  assert.equal(parseContextRecord({ ...input, message: { role: 'tool', tool_call_id: 'call1', content: 'output' } }).message.tool_call_id, 'call1');
  assert.throws(() => parseContextRecord({ ...input, message: { role: 'assistant', content: null, tool_calls: [{ id: 'call1', type: 'function', function: { name: 'read', arguments: {} } }] } }), ContextEngineError);
});

test('CTX-CONTRACTS: defaults auto-on with inherited model; reject inverted thresholds and credentials', () => {
  const settings = parseContextSettings({});
  assert.equal(settings.auto, true);
  assert.deepEqual(settings.model, { mode: 'follow-session' });
  assert.equal(settings.triggerRatio, 0.75);
  assert.equal(settings.targetRatio, 0.55);
  assert.throws(() => parseContextSettings({ targetRatio: 0.9, triggerRatio: 0.7 }), ContextEngineError);
  assert.throws(() => parseContextSettings({ apiKey: 'not-a-real-key' }), ContextEngineError);
  assert.throws(() => parseContextSettings({ retainRecentTurns: -1 }), ContextEngineError);
});

test('CTX-CONTRACTS: a blank or unversioned summary is not a checkpoint', () => {
  const value = { schema: 'talos.context.summary.v1', text: 'Decisione: SQLite.', goal: 'Riprendere la chat', decisions: ['SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'm1', quote: 'SQLite' }] };
  assert.equal(parseContextSummary(value).text, value.text);
  assert.throws(() => parseContextSummary({ ...value, text: '   ' }), ContextEngineError);
  assert.throws(() => parseContextSummary({ ...value, schema: 'v2' }), ContextEngineError);
  assert.throws(() => parseContextSummary({ ...value, sources: [{ recordId: 'm1', quote: '' }] }), ContextEngineError);
});
