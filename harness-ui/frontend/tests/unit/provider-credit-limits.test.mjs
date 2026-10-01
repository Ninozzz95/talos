import assert from 'node:assert/strict';
import test from 'node:test';
import { spiegaErrore, vestizioneErrore } from '../../src/components/errori.js';
import { riduciRetry, testoRetry } from '../../src/components/provider-retry.js';

for (const [code, id] of [
  ['PROVIDER_BUDGET_OCCUPIED', 'budget-occupato'],
  ['PROVIDER_KEY_SPEND_LIMIT', 'limite-spesa-chiave'],
  ['PROVIDER_REQUEST_BUDGET', 'richiesta-costosa'],
  ['PROVIDER_CREDIT_LIMIT', 'credito-insufficiente'],
  ['PROVIDER_PAYMENT_REQUIRED', 'limite-spesa-sconosciuto'],
]) test(`RETRY09-UI-${code}: codice canonico prima del testo grezzo`, () => {
  for (const text of ['', 'invalid api key', 'Credito non disponibile presso il fornitore.', 'HTTP 503']) {
    const s = spiegaErrore(text, code);
    assert.equal(s.id, id); assert.equal(s.riconosciuto, true);
    assert.equal(vestizioneErrore(s).tono, 'warning');
    assert.doesNotMatch(`${s.cosa} ${s.perche}`, /chiave.*(?:non valida|scaduta)|fornitore non risponde/iu);
    if (code !== 'PROVIDER_BUDGET_OCCUPIED') assert.doesNotMatch(s.rimedi.join(' '), /aspetta qualche istante e riprova|oppure scegli un altro/iu);
  }
});

test('RETRY09-UI-402: countdown solo col motivo canonico, IT/EN e fine', () => {
  const initial = riduciRetry(null, { type: 'RunStarted', runId: 'run', threadId: 'thread' });
  const event = { type: 'CUSTOM', name: 'talos.provider-retry', value: { schema: 'talos.provider-retry.v1',
    runId: 'run', threadId: 'thread', requestId: 'req', fase: 'attesa', tentativo: 2, tentativiMassimi: 4,
    httpStatus: 402, attesaMs: 2000, retryAt: 3000, motivo: 'budget-occupato' } };
  const state = riduciRetry(initial, event);
  assert.equal(state.retry?.motivo, 'budget-occupato');
  assert.match(testoRetry(state.retry, 1000).motivo, /budget.*temporaneamente occupato/iu);
  assert.match(testoRetry(state.retry, 1000, true).motivo, /budget.*temporarily occupied/iu);
  for (const motivo of [undefined, 'credito', 'in_flight_budget_exhausted']) {
    assert.equal(riduciRetry(initial, { ...event, value: { ...event.value, motivo } }).retry, null);
  }
  assert.equal(riduciRetry(state, { ...event, value: { ...event.value, fase: 'fine', retryAt: null, attesaMs: 0 } }).retry, null);
});
