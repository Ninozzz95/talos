import test from 'node:test';
import assert from 'node:assert/strict';
import { descriviContextCompactor } from '../../src/components/context-compactor.js';

test('CTX-UI-COUNT-HONEST: unknown measurement never becomes a zero or an invented window', () => {
  for (const measurement of [undefined, {}, { inputTokens: null, windowTokens: 100 }, { inputTokens: 42, windowTokens: 0 }]) {
    const result = descriviContextCompactor({ measurement });
    assert.equal(result.measurement.known, false);
    assert.equal(result.measurement.ratio, null);
  }
  assert.equal(descriviContextCompactor({}).auto, true);
  assert.equal(descriviContextCompactor(null).canCompact, false);
});

test('CTX-UI-COUNT-METHOD: provider estimates stay estimates; reserve remains distinct', () => {
  const result = descriviContextCompactor({ measurement: { inputTokens: 600, windowTokens: 1000, responseReserve: 200, method: 'provider', exact: false } });
  assert.equal(result.measurement.ratio, .6);
  assert.equal(result.measurement.responseReserve, 200);
  assert.match(result.measurement.methodLabel, /fornitore.*stima/i);
  assert.equal(result.measurement.exact, false);
});

test('CTX-UI-JOB: active job wins over terminal history; no fabricated progress', () => {
  const job = { id: 'new', state: 'summarizing', progress: { completed: 1, total: 3, phase: 'summary' } };
  const result = descriviContextCompactor({ jobs: [{ id: 'old', state: 'committed' }, job], settings: { auto: false } });
  assert.equal(result.job, job);
  assert.equal(result.canCompact, false);
  assert.equal(result.auto, false);
  assert.equal(result.jobLabel, 'Compattazione contesto in corso');
});

test('CTX-UI-CAPABILITY: explicit server denial disables manual compaction', () => {
  assert.equal(descriviContextCompactor({ capabilities: { compact: false } }).canCompact, false);
  assert.equal(descriviContextCompactor({ jobs: [] }).canCompact, true);
});

/* 31/10/2026, contratto «niente da compattare» (OK di Performance, Mobile e CLI): una compattazione CHIESTA che non ha liberato spazio si
   dice come esito («non ha liberato spazio»), non come errore; quella automatica resta «non riuscita», e anche un altro errore. */
test('CTX-UI-NIENTE-DA-COMPATTARE: a requested no-reduction reads as an outcome, an automatic one as a failure', () => {
  const lavoro = (idempotencyKey, code = 'CTX_NO_REDUCTION') => ({ jobs: [{ id: 'j', state: 'failed', idempotencyKey, error: { code, message: 'La sintesi non libera spazio sufficiente.' } }] });
  const chiesta = descriviContextCompactor(lavoro('compatta-ora'));
  assert.equal(chiesta.esitoNeutro, true);
  assert.match(chiesta.jobLabel, /non ha liberato spazio/u);
  const automatica = descriviContextCompactor(lavoro('auto-mabcdef0123456789-3-x'));
  assert.equal(automatica.esitoNeutro, false);
  assert.match(automatica.jobLabel, /non riuscita/u);
  assert.equal(descriviContextCompactor(lavoro('compatta-ora', 'CTX_INVALID_SUMMARY')).esitoNeutro, false, 'another error stays an error');
});
