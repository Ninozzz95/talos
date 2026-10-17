/*
 * ⭐ MODULO-REV-01 (revisione del bugfixer, 14/10/2026 notte): un modulo con metodi ASYNC passava l'avvio, poi `get` dava sempre
 * null («nessuna chiave», in silenzio) e una scrittura rifiutata diventava un unhandledRejection. Le due reti, nei due versi:
 *   · all'avvio una funzione `async` ⇒ KEYRING_MODULE_INVALID, il server non parte;
 *   · a ogni chiamata un metodo normale che restituisce una promessa ⇒ KEYRING_MODULE_INVALID lanciato, e nessun rifiuto orfano;
 *   · un modulo sincrono funziona come prima.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { creaAdattatorePortachiavi } from '../src/adattatore-keyring.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function modulo(t, nome, sorgente) {
  const c = mkdtempSync(join(tmpdir(), 'talos-modulo-sinc-'));
  t.after(() => rimuoviCartellaDiProva(c));
  const file = join(c, nome);
  writeFileSync(file, sorgente);
  return { TALOS_HARNESS_UI_KEYRING: `modulo:${file}` };
}
const codice = (e) => e?.code;

test('MODULO-SINC-01 — una funzione `async` fra i tre metodi ferma l\'avvio', async (t) => {
  for (const metodo of ['get', 'set', 'remove']) {
    const corpo = ['get', 'set', 'remove'].map((m) => (m === metodo ? `async ${m}() { return null; }` : `${m}() { return null; }`)).join(', ');
    const env = modulo(t, `${metodo}.mjs`, `export function creaPortachiavi() { return { ${corpo} }; }`);
    await assert.rejects(creaAdattatorePortachiavi(env), (e) => codice(e) === 'KEYRING_MODULE_INVALID', metodo);
  }
});

test('MODULO-SINC-02 — un metodo normale che restituisce una promessa: si lancia, e il rifiuto della promessa non resta orfano', async (t) => {
  const orfani = [];
  const alRifiuto = (motivo) => orfani.push(motivo);
  process.on('unhandledRejection', alRifiuto);
  t.after(() => process.off('unhandledRejection', alRifiuto));
  const env = modulo(t, 'promesse.mjs', `export function creaPortachiavi() { return {
    get() { return Promise.resolve('segreto'); },
    set() { return Promise.reject(new Error('archivio chiuso')); },
    remove() { return Promise.reject(new Error('archivio chiuso')); },
  }; }`);
  const a = await creaAdattatorePortachiavi(env);
  assert.throws(() => a.get('s', 'a'), (e) => codice(e) === 'KEYRING_MODULE_INVALID');
  assert.throws(() => a.set('s', 'a', 'v'), (e) => codice(e) === 'KEYRING_MODULE_INVALID');
  assert.throws(() => a.remove('s', 'a'), (e) => codice(e) === 'KEYRING_MODULE_INVALID');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(orfani, [], 'nessun unhandledRejection');
});

test('MODULO-SINC-03 — AL CONTRARIO: un modulo sincrono legge, scrive e toglie come prima', async (t) => {
  const env = modulo(t, 'buono.mjs', `export function creaPortachiavi() { const m = new Map(); return {
    get(s, a) { return m.get(s + '/' + a) ?? null; }, set(s, a, v) { m.set(s + '/' + a, v); }, remove(s, a) { m.delete(s + '/' + a); },
  }; }`);
  const a = await creaAdattatorePortachiavi(env);
  assert.equal(a.get('s', 'a'), null);
  a.set('s', 'a', 'v');
  assert.equal(a.get('s', 'a'), 'v');
  a.remove('s', 'a');
  assert.equal(a.get('s', 'a'), null);
});
