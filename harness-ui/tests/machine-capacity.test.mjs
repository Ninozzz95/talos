import assert from 'node:assert/strict';
import test from 'node:test';

import { MACHINE_CAPACITY_SCHEMA, misuraCapacitaMacchina } from '../src/machine-capacity.mjs';

const statfs = (stats) => async () => stats;

test('MODEL-LAB-CAPACITY-01 calcola RAM e storage con le API iniettate', async () => {
  const result = await misuraCapacitaMacchina({
    totalmemFn: () => 16_000,
    freememFn: () => 4_000,
    statfsFn: statfs({ bsize: 100n, bavail: 90n, blocks: 200n }),
    platformFn: () => 'win32',
    archFn: () => 'x64',
    reserveBytes: 1_000,
  });
  assert.equal(result.schema, MACHINE_CAPACITY_SCHEMA);
  assert.deepEqual(result.memory, { totalBytes: 16_000, freeBytes: 4_000 });
  assert.deepEqual(result.storage, { totalBytes: 20_000, availableBytes: 9_000, reserveBytes: 1_000, allocatableBytes: 8_000 });
  assert.deepEqual(result.runtime, { status: 'unconfigured', reason: 'Runtime locale desktop non scelto' });
});

test('MODEL-LAB-CAPACITY-RESERVE-01 non produce storage allocabile negativo', async () => {
  const result = await misuraCapacitaMacchina({
    totalmemFn: () => 2_000,
    freememFn: () => 1_000,
    statfsFn: statfs({ bsize: 1n, bavail: 10n, blocks: 20n }),
    reserveBytes: 100,
  });
  assert.equal(result.storage.allocatableBytes, 0);
});

test('MODEL-LAB-CAPACITY-ERROR-01 espone un errore controllato se statfs fallisce', async () => {
  await assert.rejects(
    misuraCapacitaMacchina({ statfsFn: async () => { throw new Error('permesso negato'); } }),
    (error) => error.code === 'MACHINE_CAPACITY_UNAVAILABLE',
  );
});
