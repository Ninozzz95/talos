/*
 * 27/10/2026 — trovato dalla CLI dal vivo col Mobile sul Pad: «Nuova sessione» da un dispositivo, su un `talos remote` il cui modello non ha
 * chiave. Il registro risponde giusto (`{ erroreAvvio, code: 'PROVIDER_KEY_MISSING' }`), ma `http-app.mjs` non dichiarava il codice: il
 * dispositivo riceveva **500 «Internal error»**, falso e senza via d'uscita. Ora è una configurazione mancante (422) con una frase che dice
 * cosa fare, nelle due lingue (il dizionario degli errori lo pretende, ERRORI-DIZ-01).
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('AVVIO-CHIAVE-01: un avvio senza chiave del fornitore risponde PROVIDER_KEY_MISSING (422) con una frase che dice cosa fare, mai 500', async (t) => {
  const cartella = cartellaDiProva('talos-avvio-chiave-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const sessionRegistry = {
    avviaLibero: () => ({ erroreAvvio: 'No API key for OpenAI. Set OPENAI_API_KEY or run `talos provider set-key openai`.', code: 'PROVIDER_KEY_MISSING' }),
    elenca: () => [],
  };
  const server = http.createServer(createHttpApp({ sessionRegistry }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const risposta = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/sessions/custom`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cartellaLibera: cartella, consegna: 'ciao' }),
  });
  const corpo = await risposta.json();
  assert.equal(corpo.error?.code, 'PROVIDER_KEY_MISSING', JSON.stringify(corpo));
  assert.equal(risposta.status, 422);
  assert.doesNotMatch(String(corpo.error?.message), /^Internal error$/u);
});
