import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocalRuntimeSnapshot, parseLocalRuntimeEvent } from '../src/local-runtime-contract.mjs';

const snapshot = {
  runtimeId: 'llama.cpp',
  version: 'b10695',
  backend: { id: 'vulkan', device: 'observed-device' },
  model: { id: 'liquid/lfm2.5-2.6b-gguf', label: 'LFM2.5 2.6B' },
  contextTokens: 65536,
  capabilities: { streaming: true, reasoning: true, toolCalls: false, multimodal: false },
  state: 'ready',
  observedAt: '2026-08-30T12:00:00.000Z',
};

test('accepts a ready runtime snapshot with observed capabilities', () => {
  assert.deepEqual(parseLocalRuntimeSnapshot(snapshot), snapshot);
});

test('rejects impossible snapshots and absolute model paths', () => {
  assert.throws(() => parseLocalRuntimeSnapshot({ ...snapshot, state: 'ready', model: null }), { code: 'LOCAL_RUNTIME_INVALID' });
  assert.throws(() => parseLocalRuntimeSnapshot({ ...snapshot, contextTokens: 0 }), { code: 'LOCAL_RUNTIME_INVALID' });
  assert.throws(() => parseLocalRuntimeSnapshot({ ...snapshot, model: { id: 'C:\\models\\model.gguf', label: null } }), { code: 'LOCAL_RUNTIME_INVALID' });
  assert.throws(() => parseLocalRuntimeSnapshot({ ...snapshot, unknown: true }), { code: 'LOCAL_RUNTIME_INVALID' });
});

test('accepts typed reasoning and status events', () => {
  assert.equal(parseLocalRuntimeEvent({ type: 'reasoning', value: 'planning', seq: 1 }), 'reasoning');
  assert.equal(parseLocalRuntimeEvent({ type: 'status', state: 'loading', seq: 2 }), 'status');
  assert.equal(parseLocalRuntimeEvent({ type: 'tool_call', id: 'call-1', name: 'library_search', arguments: '{}', seq: 3 }), 'tool_call');
});

test('rejects malformed reasoning and tool-call events', () => {
  assert.throws(() => parseLocalRuntimeEvent({ type: 'reasoning', seq: 1 }), { code: 'LOCAL_RUNTIME_INVALID' });
  assert.throws(() => parseLocalRuntimeEvent({ type: 'tool_call', id: 'call-1', name: 'library_search', arguments: '{', seq: 1 }), { code: 'LOCAL_RUNTIME_INVALID' });
});
