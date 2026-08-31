import assert from 'node:assert/strict';
import test from 'node:test';

import { RuntimeOwnerContractError, parseRuntimeOwnerSnapshot } from '../src/runtime-owner-contract.mjs';

test('runtime snapshot without an owner is an unavailable resource with null items', () => {
  assert.deepEqual(parseRuntimeOwnerSnapshot(null), {
    status: 'unavailable', items: null, reason: 'runtime_not_configured', observedAt: null,
  });
});

test('runtime snapshot with a real empty catalog is available with an empty list', () => {
  assert.deepEqual(parseRuntimeOwnerSnapshot({ status: 'available', items: [], observedAt: '2026-08-31T12:00:00.000Z' }), {
    status: 'available', items: [], reason: null, observedAt: '2026-08-31T12:00:00.000Z',
  });
});

test('runtime snapshot rejects malformed status, items and timestamps', () => {
  for (const value of [
    {},
    { status: 'available', items: null },
    { status: 'unavailable', items: [] },
    { status: 'available', items: {}, observedAt: 'not-a-date' },
  ]) {
    assert.throws(() => parseRuntimeOwnerSnapshot(value), (error) => error instanceof RuntimeOwnerContractError && error.code === 'RUNTIME_SNAPSHOT_INVALID');
  }
});

