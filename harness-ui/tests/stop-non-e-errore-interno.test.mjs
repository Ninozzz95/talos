/*
 * Reperto (1) dello stress test del telefono 0.1.47 (Mobile 30/10/2026, REPERTI-STRESS-0147 #16): «ERROR [internal-error]: ⛔ stopped on
 * request.» dopo uno Stop. Causa: lo Stop che arriva mentre il nucleo salva la storia del giro (`catturaSenzaFermare`) esce come
 * eccezione COL segno dello Stop (`name:'AbortError'`, `fermatoSuRichiesta:true`), e il catch di `avviaSessione` la etichettava
 * 'internal-error' (un `.code` 'fermato' è vietato apposta). Cura (forma approvata da CLI, Mobile, Performance): col segno del nucleo ⇒
 * `code:'fermato'`, come uno Stop normale; senza il segno, un `.code` qualunque resta 'internal-error'.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { avviaSessione } from '../src/agent-service.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function giroCheLancia(t, errore) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-stop-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const eventi = [];
  const r = await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: (e) => { eventi.push(e); },
    talosLavoraFn: async () => { throw errore; } });
  return { r, finale: eventi.find((e) => e.type === 'RunError') };
}
const stopDelNucleo = () => Object.assign(new Error('⛔ stopped on request.'), { name: 'AbortError', fermatoSuRichiesta: true });

test('STOP-CAPTURE-01 — lo Stop del nucleo (col suo segno) esce come «fermato», mai come «internal-error»', async (t) => {
  const { r, finale } = await giroCheLancia(t, stopDelNucleo());
  assert.equal(finale.code, 'fermato');
  assert.equal(r.codiceErrore, 'fermato');
  assert.match(finale.message, /stopped on request/u);
});

test('STOP-CAPTURE-02 — il lavoro fatto resta: la storia del giro viaggia anche con lo Stop', async (t) => {
  const errore = stopDelNucleo(); errore.messaggiDelGiro = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'mezzo' }];
  const { r } = await giroCheLancia(t, errore);
  assert.deepEqual(r.messaggiDelGiro, errore.messaggiDelGiro);
});

test('STOP-CAPTURE-03 — AL CONTRARIO: un errore che dice code «fermato» ma SENZA il segno del nucleo resta «internal-error»', async (t) => {
  const { finale } = await giroCheLancia(t, Object.assign(new Error('qualcosa'), { code: 'fermato' }));
  assert.equal(finale.code, 'internal-error');
  const { finale: soloNome } = await giroCheLancia(t, Object.assign(new Error('x'), { name: 'AbortError' }));
  assert.equal(soloNome.code, 'internal-error', 'il solo nome AbortError non basta: serve il segno che mette il nucleo');
});
