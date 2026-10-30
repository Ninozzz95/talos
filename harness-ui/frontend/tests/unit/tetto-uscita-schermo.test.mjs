/*
 * CONTRATTO-R30-R31 (owner 30/10/2026 notte), lo schermo del PC: la riga del ritento col canale `tetto-uscita` (senza stato HTTP né
 * attesa, che si chiude col suo `fine`) e la carta di PROVIDER_OUTPUT_CAP_EXHAUSTED, nelle due lingue.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { riduciRetry, testoRetry } from '../../src/components/provider-retry.js';
import { spiegaErrore } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';

const evento = (valore, seq) => ({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: seq, value: {
  schema: 'talos.provider-retry.v1', threadId: 't', runId: 'r', requestId: 'req-1', giro: 3, fase: 'invio', tentativo: 1, tentativiMassimi: 2,
  canale: 'tetto-uscita', ...valore } });
const avviato = riduciRetry(null, { type: 'RunStarted', runId: 'r', threadId: 't' });

test('TUS-UI-01 la riga del ritento: ragionamento più basso, poi tetto più alto; «può costare» solo se si paga; si chiude col suo fine', () => {
  impostaLingua('en');
  let s = riduciRetry(avviato, evento({ motivo: 'solo-ragionamento', tettoNuovo: 32_000, ragionamento: { da: 'high', a: 'medium' }, costoDiNuovo: true }, 1));
  assert.ok(s.retry, 'la riga si accetta senza stato HTTP né attesa');
  assert.deepEqual(testoRetry(s.retry, Date.now(), true), { titolo: 'Answer limit reached',
    motivo: 'The model spent its whole limit on reasoning. Retrying with medium reasoning for this request. The new request may cost again. Attempt 1 of 2.', tempo: 'Request in progress' });
  s = riduciRetry(s, evento({ requestId: 'req-2', tentativo: 2, motivo: 'chiamata-tagliata', tettoNuovo: 64_000, costoDiNuovo: false }, 2));
  assert.equal(testoRetry(s.retry, Date.now(), false).motivo,
    'Il limite ha tagliato una chiamata prima che fosse completa: non è partita. Riprovo con un limite di 64.000 token. Tentativo 2 di 2.');
  s = riduciRetry(s, evento({ requestId: 'req-2', fase: 'fine', tentativo: 2 }, 3));
  assert.equal(s.retry, null, 'la risposta usabile chiude la riga');
});

test('TUS-UI-02 AL CONTRARIO: una riga del tetto con uno stato HTTP non si accetta (la CLI e lo schermo leggono il canale)', () => {
  const s = riduciRetry(avviato, evento({ httpStatus: 429, motivo: 'solo-ragionamento' }, 1));
  assert.equal(s.retry, null);
});

test('TUS-UI-03 la carta di PROVIDER_OUTPUT_CAP_EXHAUSTED: il caso dalla frase del nucleo, i rimedi giusti, nelle due lingue', () => {
  impostaLingua('it');
  const attrezzo = spiegaErrore("The model's tool call was cut by the answer limit before it was complete, so the tool did not run (after a higher answer limit).", 'PROVIDER_OUTPUT_CAP_EXHAUSTED');
  assert.match(attrezzo.cosa, /ha tagliato una chiamata/u);
  assert.ok(attrezzo.rimedi.some((r) => /in un file, a pezzi/u.test(r)));
  impostaLingua('en');
  const ragiona = spiegaErrore('The model spent its whole answer limit on reasoning and returned neither text nor tools (after a lower reasoning effort).', 'PROVIDER_OUTPUT_CAP_EXHAUSTED');
  assert.match(ragiona.cosa, /spent its whole answer limit on reasoning/u);
  assert.ok(!ragiona.rimedi.some((r) => /file/u.test(r)), 'il rimedio del file solo per la chiamata tagliata');
});
