import test from 'node:test';
import assert from 'node:assert/strict';
import { descriviContextCompactor } from '../../src/components/context-compactor.js';

/*
 * 09/09 — la misura nella modale ora arriva dallo stato (`measurement.tokens`, con `revision` e
 * `measuredAt`). Tre cose da dire a schermo, e nessuna da inventare: i numeri, QUANDO sono stati
 * misurati, e se il contesto è cambiato dopo — perché una misura vecchia presentata come attuale
 * è la forma più sottile di bugia.
 */
const tokens = { schema: 'talos.context.tokens.v1', inputTokens: 1200, windowTokens: 16384, responseReserve: 2048, method: 'runtime', exact: true, requestHash: 'h', provider: 'local', model: 'm' };
const identita = x => x;

test('CTX-MEASURE-LABEL: numbers, time of measurement, and whether the context moved since', () => {
  const fresh = descriviContextCompactor({ revision: 3, measurement: { revision: 3, measuredAt: '2026-09-09T10:15:00.000Z', tokens } }, { translate: identita });
  assert.equal(fresh.measurement.known, true);
  assert.equal(fresh.measurement.inputTokens, 1200);
  assert.equal(fresh.measurement.current, true);
  assert.match(fresh.measurement.methodLabel, /misurata alle \d{2}:\d{2}/, 'l’ora della misura è parte del dato');
  assert.doesNotMatch(fresh.measurement.methodLabel, /cambiato/);

  const stale = descriviContextCompactor({ revision: 5, measurement: { revision: 3, measuredAt: '2026-09-09T10:15:00.000Z', tokens } }, { translate: identita });
  assert.equal(stale.measurement.current, false);
  assert.match(stale.measurement.methodLabel, /il contesto è cambiato dopo la misura/);

  const none = descriviContextCompactor({ revision: 1, measurement: null }, { translate: identita });
  assert.equal(none.measurement.known, false);
  assert.equal(none.measurement.current, false);
});
