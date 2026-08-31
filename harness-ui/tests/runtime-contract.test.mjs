import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RUNTIME_BOOTSTRAP_SCHEMA,
  RUNTIME_RESOURCE_SCHEMA,
  deriveRuntimePhase,
  parseBootstrapEnvelope,
  parseResourceEnvelope,
  parseRuntimeEventEnvelope,
} from '../src/runtime-contract.mjs';

const observedAt = '2026-08-31T12:00:00.000Z';

function resource(overrides = {}) {
  return {
    schema: RUNTIME_RESOURCE_SCHEMA,
    status: 'available',
    items: [{ id: 'llama.cpp', state: 'ready' }],
    consulted: true,
    observedAt,
    reason: null,
    ...overrides,
  };
}

test('runtime resource distinguishes a consulted empty runtime from an unavailable one', () => {
  assert.deepEqual(parseResourceEnvelope(resource({ items: [] })), resource({ items: [] }));
  assert.deepEqual(parseResourceEnvelope(resource({ status: 'unavailable', items: null, consulted: false, reason: 'not_configured' })), resource({ status: 'unavailable', items: null, consulted: false, reason: 'not_configured' }));
});

test('⛔ items [] without an endpoint consultation is invalid, and available items must be an array', () => {
  assert.throws(() => parseResourceEnvelope(resource({ items: [], consulted: false })), { code: 'RUNTIME_CONTRACT_INVALID' });
  assert.throws(() => parseResourceEnvelope(resource({ items: null })), { code: 'RUNTIME_CONTRACT_INVALID' });
});

test('bootstrap rejects browser-only active candidates and unknown versions/extra fields', () => {
  const valid = {
    schema: RUNTIME_BOOTSTRAP_SCHEMA,
    authoritative: 'backend',
    runtime: resource(),
    observedAt,
  };
  assert.deepEqual(parseBootstrapEnvelope(valid), valid);
  assert.throws(() => parseBootstrapEnvelope({ ...valid, authoritative: 'browser' }), { code: 'RUNTIME_CONTRACT_INVALID' });
  assert.throws(() => parseBootstrapEnvelope({ ...valid, schema: 'talos.runtime.bootstrap.v0' }), { code: 'RUNTIME_CONTRACT_INVALID' });
  assert.throws(() => parseBootstrapEnvelope({ ...valid, extra: true }), { code: 'RUNTIME_CONTRACT_INVALID' });
});

test('deriveRuntimePhase exposes only the five canonical states', () => {
  const base = { schema: RUNTIME_BOOTSTRAP_SCHEMA, authoritative: 'backend', runtime: resource(), observedAt };
  assert.equal(deriveRuntimePhase({ ...base, state: 'booting' }), 'booting');
  assert.equal(deriveRuntimePhase({ ...base, state: 'offline' }), 'offline');
  assert.equal(deriveRuntimePhase({ ...base, state: 'degraded' }), 'degraded');
  assert.equal(deriveRuntimePhase({ ...base, state: 'ready', runtime: resource({ items: [] }) }), 'ready-empty');
  assert.equal(deriveRuntimePhase({ ...base, state: 'ready' }), 'ready-active');
  assert.throws(() => deriveRuntimePhase({ ...base, state: 'ready', authoritative: 'browser' }), { code: 'RUNTIME_CONTRACT_INVALID' });
});

test('parseRuntimeEventEnvelope keeps the existing versioned event symbol', () => {
  const event = { runId: 'run-1', turnId: 'turn-1', runtimeId: 'llama.cpp', seq: 0, at: observedAt, type: 'text', value: 'ok' };
  assert.deepEqual(parseRuntimeEventEnvelope(event), event);
});
