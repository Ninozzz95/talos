import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRuntimeEventEnvelope, createRuntimeEventLedger } from '../src/local-runtime-events.mjs';

const base = {
  runId: 'run-1',
  turnId: 'turn-1',
  runtimeId: 'llama.cpp',
  seq: 0,
  at: '2026-08-30T12:00:00.000Z',
  type: 'text',
  value: 'hello',
};

test('accepts a replay-safe event envelope', () => {
  assert.deepEqual(parseRuntimeEventEnvelope(base), base);
});

test('deduplicates repeated sequence numbers and preserves replay order', () => {
  const ledger = createRuntimeEventLedger();
  assert.equal(ledger.push(base), true);
  assert.equal(ledger.push({ ...base }), false);
  const done = { runId: base.runId, turnId: base.turnId, runtimeId: base.runtimeId, seq: 1, at: base.at, type: 'done' };
  assert.equal(ledger.push(done), true);
  assert.deepEqual(ledger.replay(), [base, done]);
});

test('rejects invalid sequence and unknown envelope fields', () => {
  assert.throws(() => parseRuntimeEventEnvelope({ ...base, seq: -1 }), { code: 'LOCAL_RUNTIME_INVALID' });
  assert.throws(() => parseRuntimeEventEnvelope({ ...base, extra: true }), { code: 'LOCAL_RUNTIME_INVALID' });
});
