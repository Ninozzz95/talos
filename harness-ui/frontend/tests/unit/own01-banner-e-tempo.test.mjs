/*
 * OWN-01 nel desktop (09/10/2026, bugfixer; kernel CLI 0.5.2: tempo alla prima risposta 600 s, fino a 3 reinvii senza nessun byte).
 * Il banner dice «il fornitore non ha ancora cominciato a rispondere» quando la causa è quella, non «si è interrotta»; e la card del
 * fornitore manda il tempo SOLO se la persona l'ha cambiato, così il predefinito del server (600 s) resta suo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { riduciRetry, testoRetry } from '../../src/components/provider-retry.js';
import { leggiCollegamentoProvider } from '../../src/components/provider-card.js';

const start = { type: 'RunStarted', runId: 'run1', threadId: 'thread1' };
const attesa = (extra) => ({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: 2, value: {
  schema: 'talos.provider-retry.v1', runId: 'run1', threadId: 'thread1', requestId: 'request1', fase: 'attesa', tentativo: 1,
  tentativiMassimi: 3, modello: 'zai/glm-5.3-flash', retryAt: 30_000, attesaMs: 2000, canale: 'esito-incerto',
  motivo: 'il fornitore non ha cominciato a rispondere entro il tempo', ...extra,
} });

test('OWN01-BANNER: senza nessun byte il banner dice che il fornitore non ha ancora cominciato, in italiano e in inglese', () => {
  const s = riduciRetry(riduciRetry(null, start), attesa({ causa: 'nessuna-prima-risposta' }));
  assert.ok(s.retry);
  assert.match(testoRetry(s.retry, 28_100).motivo, /non ha ancora cominciato a rispondere/u);
  assert.doesNotMatch(testoRetry(s.retry, 28_100).motivo, /interrotta/u);
  assert.match(testoRetry(s.retry, 28_100, true).motivo, /has not started answering yet/u);
});

test('OWN01-BANNER-CONTRARIO: senza la causa (o con una sconosciuta) resta la frase del canale incerto di sempre', () => {
  for (const extra of [{}, { causa: 'altro' }]) {
    const s = riduciRetry(riduciRetry(null, start), attesa(extra));
    assert.match(testoRetry(s.retry, 28_100).motivo, /interrotta senza esito/u, JSON.stringify(extra));
  }
});

/* La card finta: solo ciò che `leggiCollegamentoProvider` legge. */
function card({ endpoint = 'https://api.z.ai/api/paas/v4', tempo, iniziale } = {}) {
  const campi = { '[data-provider-endpoint]': { value: endpoint } };
  if (tempo !== undefined) campi['[data-provider-timeout]'] = { value: tempo, dataset: iniziale === undefined ? {} : { valoreIniziale: iniziale } };
  return { querySelector: (s) => campi[s] ?? null };
}

test('OWN01-TEMPO: il tempo parte solo se la persona l’ha cambiato', () => {
  const row = { id: 'zai' };
  assert.equal(Object.hasOwn(leggiCollegamentoProvider(row, card({ tempo: '600', iniziale: '600' })), 'timeoutSeconds'), false, 'invariato: niente tempo');
  assert.deepEqual(leggiCollegamentoProvider(row, card({ tempo: '900', iniziale: '600' })), { endpoint: 'https://api.z.ai/api/paas/v4', timeoutSeconds: 900 });
  assert.equal(Object.hasOwn(leggiCollegamentoProvider(row, card()), 'timeoutSeconds'), false, 'senza campo: niente tempo');
  // un campo senza valore d'origine noto (non costruito da `campo`, come nelle prove PKLB) manda il tempo, come prima di OWN-01
  assert.equal(leggiCollegamentoProvider(row, card({ tempo: '35' })).timeoutSeconds, 35);
  // AL CONTRARIO: un campo svuotato dalla persona è un cambio, e torna al predefinito del server
  assert.equal(leggiCollegamentoProvider(row, card({ tempo: '', iniziale: '600' })).timeoutSeconds, 600);
});
