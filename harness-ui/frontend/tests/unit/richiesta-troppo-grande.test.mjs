/*
 * §4.2, regola N (owner 22/10/2026; bozzetto «Invia come allegato» approvato il 29/10). La carta del messaggio che da solo non entra:
 * la regola di `errori.js` sul codice REQUEST_TOO_LARGE, il tono d'attenzione, il pulsante solo se il server dice `allegabile`; e i
 * numeri della frase del server con il separatore delle migliaia (`testo-server.js`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { spiegaErrore, vestizioneErrore } from '../../src/components/errori.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { testoDelServer } from '../../src/components/testo-server.js';

const DATI = { tokensRichiesta: 212000, tokensCornice: 18000, finestra: 200000, fonte: 'stima' };

test('TROPPO-GRANDE-01 — la regola riconosce il CODICE, è attenzione e non guasto, e il pulsante dipende da `allegabile`', () => {
  impostaLingua('it');
  const si = spiegaErrore('Il tuo messaggio occupa circa 212.000…', 'REQUEST_TOO_LARGE', { allegabile: true });
  assert.equal(si.id, 'richiesta-troppo-grande');
  assert.equal(si.allegabile, true);
  assert.match(si.cosa, /troppo grande per questo modello/u);
  assert.match(si.perche, /Non è stato inviato niente e non hai speso niente/u);
  assert.match(si.rimedi.join(' '), /Come allegato/u);
  assert.equal(vestizioneErrore(si).tono, 'warning');
  const no = spiegaErrore('…', 'REQUEST_TOO_LARGE', { allegabile: false });
  assert.equal(no.allegabile, false);
  assert.match(no.rimedi.join(' '), /niente da spostare in un allegato/u);
  /* AL CONTRARIO: senza contesto, o con un valore non booleano, niente pulsante; e la stessa frase senza il codice non è questa regola */
  assert.equal(spiegaErrore('…', 'REQUEST_TOO_LARGE').allegabile, false);
  assert.equal(spiegaErrore('…', 'REQUEST_TOO_LARGE', { allegabile: 'true' }).allegabile, false);
  assert.notEqual(spiegaErrore('Your message is about 212,000 tokens', '').id, 'richiesta-troppo-grande');
});

test('TROPPO-GRANDE-02 — inglese prima: la carta e i rimedi nelle due lingue', () => {
  impostaLingua('en');
  const s = spiegaErrore('…', 'REQUEST_TOO_LARGE', { allegabile: true });
  assert.match(s.cosa, /too large for this model/u);
  assert.match(s.perche, /Nothing was sent and you spent nothing/u);
  assert.match(vestizioneErrore(s).badge, /Not sent/u);
  impostaLingua('it');
  assert.match(vestizioneErrore(s).badge, /Non inviato/u);
});

test('TROPPO-GRANDE-03 — i numeri della frase del server col separatore delle migliaia, nelle due lingue; una porta resta com\'è', () => {
  impostaLingua('it');
  const it = testoDelServer('server.run.requestTooLarge', DATI, 'riserva');
  assert.match(it, /212\.000 dei 200\.000 token/u);
  assert.match(it, /18\.000 in più/u);
  impostaLingua('en');
  assert.match(testoDelServer('server.run.requestTooLarge', DATI, 'riserva'), /about 212,000 of this model’s 200,000-token window/u);
  /* AL CONTRARIO: un parametro che non è una quantità di token non si tocca (una porta, un anno) */
  impostaLingua('it');
  assert.match(testoDelServer('server.run.requestTooLarge', { ...DATI, porta: 4174 }, 'x'), /212\.000/u);
  assert.equal(testoDelServer('chiave.che.non.esiste', { finestra: 4174 }, 'riserva intatta'), 'riserva intatta');
});
