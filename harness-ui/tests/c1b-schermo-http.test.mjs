import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { createHttpApp } from '../src/http-app.mjs';

/*
 * C1b (review del bugfixer, 10/10/2026) — le due righe della rotta dello schermo (`GET /api/v1/browser/vivo/schermo`) che nessuna
 *   prova raggiungeva:
 *   1. un rifiuto della funzione di stop, alla chiusura della risposta, non deve diventare un rifiuto non raccolto (Node 24 chiude il
 *      processo: è così che il server moriva alla sesta apertura);
 *   2. se la risposta si chiude MENTRE `segui` sta partendo, il suo `close` è già passato: lo stop va chiamato subito.
 * Il gestore del browser è finto: qui si prova la rotta, non Chromium.
 */
async function banco(t, browserVivo) {
  const server = createServer(createHttpApp({ staticHandler: async () => null, browserVivo }));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(ok); }));
  return `http://127.0.0.1:${server.address().port}/api/v1/browser/vivo/schermo?sessione=s1`;
}

const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));

test('C1B-HTTP-01 — a stop that rejects when the page closes is contained: no unhandled rejection reaches the process', async (t) => {
  const nonRaccolti = [];
  const spia = (motivo) => nonRaccolti.push(motivo);
  process.on('unhandledRejection', spia);
  t.after(() => process.off('unhandledRejection', spia));
  let fermate = 0;
  const url = await banco(t, {
    async segui() { return async () => { fermate += 1; throw new TypeError("Cannot read properties of null (reading 'cdp')"); }; },
  });
  const controller = new AbortController();
  const risposta = await fetch(url, { signal: controller.signal });
  assert.equal(risposta.status, 200);
  const lettore = risposta.body.getReader();
  await lettore.read(); // `:ok`: il flusso è partito e lo stop è agganciato
  controller.abort();
  await aspetta(150);
  assert.equal(fermate, 1, 'the stop runs when the page goes away');
  assert.deepEqual(nonRaccolti, [], 'its rejection is contained');
});

test('C1B-HTTP-02 — the page closed while the screen was starting: the stop is called at once, not left for nobody', async (t) => {
  let fermate = 0;
  let lasciaPartire;
  const partito = new Promise((ok) => { lasciaPartire = ok; });
  const url = await banco(t, {
    async segui() { await partito; return async () => { fermate += 1; }; },
  });
  const controller = new AbortController();
  const risposta = await fetch(url, { signal: controller.signal });
  const lettore = risposta.body.getReader();
  await lettore.read(); // `:ok`
  controller.abort(); // la persona se ne va mentre `segui` aspetta ancora Chromium
  await aspetta(100);
  assert.equal(fermate, 0, 'premise: nothing to stop yet');
  lasciaPartire();
  await aspetta(150);
  assert.equal(fermate, 1, 'the late start is stopped at once');
});
