/*
 * 27/10/2026 — trovato dalla suite del browser sul candidato del blocco 9 (FACCETTE-07, PAGINA-10, SCHEDA-08, la matrice visiva: «zero
 * errori in console»). Senza motore locale (un server di prova, un PC senza il binario) `GET /api/v1/local-engine/window-policy`
 * rispondeva **500 INTERNAL_ERROR**: `LOCAL_RUNTIME_NOT_CONFIGURED` non era un codice dichiarato, e la carta «Quando la finestra di un
 * modello locale si riempie» lo chiede a ogni apertura delle Impostazioni. ⇒ La scelta è una preferenza in un file: si legge e si salva
 * anche senza motore; «Allarga la finestra» senza motore risponde col suo codice (503), mai un 500.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { createHttpApp } from '../src/http-app.mjs';
import { creaSceltaFinestraPiena } from '../src/finestra-che-cresce.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function server(t, opzioni) {
  const s = http.createServer(createHttpApp(opzioni));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => s.close(r)));
  return `http://127.0.0.1:${s.address().port}/api/v1/local-engine`;
}
const posta = (url, corpo) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });

test('FP-SENZA-MOTORE-01: senza motore la scelta si legge (di serie «allarga») e si salva, e regge in un deposito nuovo sulla stessa cartella', async (t) => {
  const cartella = cartellaDiProva('talos-fp-senza-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const base = await server(t, { finestraPiena: creaSceltaFinestraPiena({ cartella }) });
  const get = await fetch(`${base}/window-policy`);
  assert.equal(get.status, 200);
  assert.deepEqual((await get.json()).data, { scelta: 'allarga' });
  const post = await posta(`${base}/window-policy`, { scelta: 'chiedi' });
  assert.equal(post.status, 200);
  assert.equal(await creaSceltaFinestraPiena({ cartella }).scelta(), 'chiedi', 'saved in the same file the engine reads');
  assert.equal((await posta(`${base}/window-policy`, { scelta: 'boh' })).status, 400);
});

test('FP-SENZA-MOTORE-02: «Allarga la finestra» senza motore risponde LOCAL_RUNTIME_NOT_CONFIGURED con 503, mai 500; senza nessun deposito anche la scelta', async (t) => {
  const cartella = cartellaDiProva('talos-fp-senza-');
  t.after(() => rimuoviCartellaDiProva(cartella));
  const base = await server(t, { finestraPiena: creaSceltaFinestraPiena({ cartella }) });
  const allarga = await posta(`${base}/window/enlarge`, { modelId: 'm', servono: 1000 });
  assert.equal(allarga.status, 503);
  assert.equal((await allarga.json()).error?.code, 'LOCAL_RUNTIME_NOT_CONFIGURED');
  const nessuno = await server(t, {});
  const r = await fetch(`${nessuno}/window-policy`);
  assert.equal(r.status, 503, 'a declared code, not an internal error');
  assert.equal((await r.json()).error?.code, 'LOCAL_RUNTIME_NOT_CONFIGURED');
  void join;
});
