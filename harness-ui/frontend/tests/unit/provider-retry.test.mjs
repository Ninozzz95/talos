import assert from 'node:assert/strict';
import test from 'node:test';
import { riduciRetry, testoRetry, montaProviderRetry } from '../../src/components/provider-retry.js';

const start = { type: 'RunStarted', runId: 'run1', threadId: 'thread1' };
const wait = (extra = {}, sequence = 2) => ({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: sequence, value: {
  schema: 'talos.provider-retry.v1', runId: 'run1', threadId: 'thread1', requestId: 'request1',
  fase: 'attesa', tentativo: 2, tentativiMassimi: 4, httpStatus: 503, modello: 'provider/model', retryAt: 30_000, attesaMs: 2000, ...extra,
} });

test('RETRY06-UI-RUN: richiesta correlata al giro, nessuna associazione per posizione', () => {
  const s = riduciRetry(null, start);
  assert.equal(riduciRetry(s, wait({ runId: 'other' })).retry, null);
  assert.equal(riduciRetry(s, wait({ threadId: 'other' })).retry, null);
  const pending = riduciRetry(s, wait());
  assert.equal(pending.retry.tentativo, 2);
  assert.equal(riduciRetry(pending, { type: 'RunStarted', runId: 'run2', threadId: 'thread1' }).retry, null);
  assert.equal(riduciRetry(pending, { type: 'RunError', code: 'fermato' }).retry, null);
});
test('RETRY06-UI-ORDER: fine e riconnessione non rianimano attese duplicate', () => {
  let s = riduciRetry(riduciRetry(null, start), wait());
  s = riduciRetry(s, wait({ fase: 'fine', retryAt: null, attesaMs: 0 }, 4));
  assert.equal(s.retry, null);
  assert.equal(riduciRetry(s, wait()).retry, null);
  assert.equal(riduciRetry(s, wait({ fase: 'invio', retryAt: null, attesaMs: 0 }, 3)).retry, null);
});
test('RETRY06-UI-TERMINAL: un giro concluso non accetta eventi tardivi', () => {
  let s = riduciRetry(riduciRetry(null, start), wait());
  s = riduciRetry(s, { type: 'RunFinished', runId: 'run1' });
  assert.equal(riduciRetry(s, wait({}, 20)).retry, null);
});
test('RETRY06-UI-SCHEMA: contenuto malformato non entra nel countdown', () => {
  const s = riduciRetry(null, start);
  for (const bad of [{ schema: 'v2' }, { fase: 'inventata' }, { tentativo: 0 }, { tentativo: 5 },
    { tentativo: 2.5 }, { retryAt: NaN }, { retryAt: null }, { attesaMs: -1 }, { httpStatus: 401 }, { requestId: '' }]) {
    assert.equal(riduciRetry(s, wait(bad)).retry, null, JSON.stringify(bad));
  }
});
test('RETRY06-UI-CLOCK: scadenza assoluta, zero non inventa una nuova richiesta', () => {
  const r = wait().value;
  assert.match(testoRetry(r, 28_100).tempo, /2 s/u);
  assert.match(testoRetry(r, 30_100).tempo, /attesa di conferma/iu);
  assert.match(testoRetry({ ...r, fase: 'invio', retryAt: null }, 30_100).titolo, /Tentativo 2 di 4/u);
  assert.match(testoRetry(r, 28_100, true).titolo, /Retry scheduled/u);
  assert.match(testoRetry(r, 28_100).motivo, /503/u);
  assert.doesNotMatch(testoRetry(r, 28_100).motivo, /chiave.*invalid/iu);
});

test('RETRY06-IDLE-DOM: i delta estranei non interrogano il DOM del retry', () => {
  let letture = 0;
  const ui = montaProviderRetry({ contenitore: () => { letture++; return null; } });
  ui.evento(start, { attivo: true });
  letture = 0;
  for (let i = 0; i < 1000; i++) ui.evento({ type: 'TextMessageContent', delta: 'a' }, { attivo: true });
  assert.equal(letture, 0);
  ui.reset();
});

/* R1 della review avversariale BUG-16: il canale «esito-incerto» (reinvio automatico del kernel) deve
   arrivare FINO al banner: evento con la forma ESATTA che agent-service traduce dal giro del kernel
   (canale, requestId, modello, NESSUN httpStatus, primo tentativo = 1). */
test('RETRY06-UI-INCERTO: l\u2019attesa del reinvio BUG-16 arriva a schermo con il suo motivo, senza «HTTP null»', () => {
  const s = riduciRetry(riduciRetry(null, start), wait({
    canale: 'esito-incerto', fase: 'attesa', tentativo: 1, tentativiMassimi: 10,
    httpStatus: undefined, modello: 'deepseek/deepseek-chat', retryAt: 30_000, attesaMs: 2000,
    motivo: 'esito del fornitore incerto: nessun testo consegnato e nessuna lettura partita, reinvio sicuro — la nuova richiesta può comportare un altro costo',
  }, 2));
  assert.ok(s.retry, 'R1: l\u2019evento del canale incerto passa la validazione e resta vivo');
  assert.equal(s.retry.canale, 'esito-incerto');
  assert.equal(s.retry.tentativo, 1);
  const t = testoRetry(s.retry, 28_100);
  assert.match(t.titolo, /Nuovo tentativo programmato/u);
  assert.match(t.motivo, /interrotta senza esito/u, 'la voce i18n del canale incerto, non «servizio non disponibile»');
  assert.doesNotMatch(t.motivo, /HTTP/u, 'nessuno status inventato: qui non c\u2019è un codice HTTP');
  assert.match(t.motivo, /Tentativo 1 di 10\./u);
  assert.match(testoRetry(s.retry, 28_100, true).motivo, /cut short with no outcome/u, 'EN presente');
});

test('RETRY06-UI-INCERTO-SCHEMA: senza canale, con stato o col primo tentativo finto, l\u2019evento non entra', () => {
  const s = riduciRetry(null, start);
  const base = { canale: 'esito-incerto', fase: 'attesa', tentativo: 1, tentativiMassimi: 10,
    httpStatus: undefined, modello: 'deepseek/deepseek-chat', retryAt: 30_000, attesaMs: 2000 };
  /* Mutante-killer: se la validazione perdesse il canale (o lo scambio con l'HTTP), qui il banner si riempirebbe di falsi.
     NB: `httpStatus: null` nel canale incerto resta LECITO — è la forma dei journal scritti prima della cura R1 (replay). */
  for (const bad of [{ canale: undefined, httpStatus: 503 }, { canale: 'esito-incerto', httpStatus: 200 },
    { canale: 'esito-incerto', tentativo: 0 }, { canale: 'http' }]) {
    assert.equal(riduciRetry(s, wait({ ...base, ...bad }, 2)).retry, null, JSON.stringify(bad));
  }
  assert.ok(riduciRetry(s, wait({ ...base, httpStatus: null }, 2)).retry, 'null = assente: i journal pre-R1 restano leggibili in replay');
});
