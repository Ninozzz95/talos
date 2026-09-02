import assert from 'node:assert/strict';
import test from 'node:test';

import { TALOS_STORAGE_KEYS, createPersistence } from '../../src/contracts/persistence.js';

test('PHASE1-HOST-STORAGE-01 limita le chiavi e recupera JSON corrotto', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const persistence = createPersistence({ storage });
  const key = TALOS_STORAGE_KEYS.settings;
  persistence.write(key, { theme: 'calm' });
  assert.deepEqual(persistence.read(key), { theme: 'calm' });
  values.set(key, '{broken');
  assert.equal(persistence.read(key, null), null);
  assert.equal(values.has(key), false);
  assert.throws(() => persistence.write('token', 'secret'), /non consentita/u);
});

test('PHASE2-STORAGE-CONTRACT-DRIFT-20 includes the current modal size key without opening arbitrary storage', () => {
  assert.equal(TALOS_STORAGE_KEYS.modalSizes, 'talos-harness-modal-sizes-v1');
});
