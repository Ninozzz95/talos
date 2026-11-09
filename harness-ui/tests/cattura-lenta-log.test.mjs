/*
 * COD-220 (Mobile 30/10/2026): una figlia locale è rimasta ~5 minuti dentro la cattura 'before-request'. Il nucleo dice nel registro
 * del processo QUALE cattura e QUANTO, solo quando supera 2 s. Forma approvata da CLI (nella TUI va nel registro, mai a schermo),
 * Performance (il banco non la legge) e Mobile.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const fine = () => ({ ok: true, status: 200, text: async () => '',
  json: async () => ({ choices: [{ message: { role: 'assistant', content: 'fatto', tool_calls: [] } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });

async function giroConCattura(t, attesaMs) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cattura-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const avvisi = [];
  const originale = console.warn;
  console.warn = (...a) => { avvisi.push(a.join(' ')); };
  t.after(() => { console.warn = originale; });
  await talosLavora({ cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete: async () => fine(),
    contextHooks: {
      prepare: async ({ messages }) => ({ messages }),
      capture: async ({ reason }) => { if (reason === 'before-request') await new Promise((r) => setTimeout(r, attesaMs)); },
    } });
  console.warn = originale;
  return avvisi.filter((a) => a.includes('context capture'));
}

test('CATTURA-LENTA-01: una cattura oltre 2 s si dice nel registro del processo, con il motivo e i ms', async (t) => {
  const righe = await giroConCattura(t, 2_200);
  assert.equal(righe.length, 1, JSON.stringify(righe));
  assert.match(righe[0], /^\[talos\] context capture "before-request" took \d{4,} ms$/u);
});

test('CATTURA-LENTA-02 AL CONTRARIO: una cattura veloce non scrive niente', async (t) => {
  assert.deepEqual(await giroConCattura(t, 0), []);
});

test('CATTURA-LENTA-03 (Mobile): una cattura che fallisce dice di chi e il dettaglio della divergenza, solo numeri, forma e ruolo', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-cattura-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const avvisi = [];
  const originale = console.warn;
  console.warn = (...a) => { avvisi.push(a.join(' ')); };
  t.after(() => { console.warn = originale; });
  const divergenza = () => Object.assign(new Error('The active history differs from the archive.'), { code: 'CTX_HISTORY_DIVERGED', sessionId: 'sess-123_ab',
    dettaglio: { archiviati: 7, attivi: 5, primoDiverso: 5, forma: 'piu-corta', ruolo: 'assistant', segreto: 'CONTENUTO-PRIVATO' } });
  await talosLavora({ cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete: async () => fine(),
    contextHooks: { prepare: async ({ messages }) => ({ messages }), capture: async ({ reason }) => { if (reason === 'finished') throw divergenza(); } } });
  console.warn = originale;
  const riga = avvisi.find((a) => a.includes('context capture failed (finished)'));
  assert.ok(riga, JSON.stringify(avvisi));
  assert.match(riga, /CTX_HISTORY_DIVERGED \[session=sess-123_ab archiviati=7 attivi=5 primoDiverso=5 forma=piu-corta ruolo=assistant\]$/u);
  assert.doesNotMatch(riga, /CONTENUTO-PRIVATO/u, 'mai un campo fuori dalla lista');
});
