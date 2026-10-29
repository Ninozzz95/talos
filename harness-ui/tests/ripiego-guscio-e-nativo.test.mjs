/*
 * Richiesta della CLI (29/10/2026, prima della fusione di ae2672e8d): il guscio desktop chiama il nucleo nativo con `...input` e coi suoi
 *   `contextHooks`, quindi ora il nativo riceve anche `ripiegoDetto` e fa girare `catturaSenzaFermare` sulla capture DEL GUSCIO. La strada
 *   della CLI deve dare ESATTAMENTE UNA riga di ripiego nel giro con la storia divergente, e ZERO nel giro dopo ancora rotto (R12-2) —
 *   mai una del guscio e una del nativo. E l'esito porta il `ripiegoDetto` del guscio, non quello del nativo (`...preparazione` dopo
 *   `...result`, talosHarness.desktop-hotfix.mjs).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-ripiego-guscio-'));
  writeFileSync(join(c, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const rete = () => async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } });
/* l'archivio diverge e resta rotto: ogni capture e ogni prepare lanciano lo stesso codice */
const rotti = (codice) => {
  const conti = { capture: 0, prepare: 0 };
  return {
    conti,
    capture: async () => { conti.capture += 1; throw Object.assign(new Error('divergente'), { code: codice }); },
    prepare: async () => { conti.prepare += 1; throw Object.assign(new Error('divergente'), { code: codice }); },
  };
};
async function giro(c, contextHooks, ripiegoDetto) {
  const eventi = [];
  const avvisi = console.warn; console.warn = () => {};
  try {
    const esito = await talosLavora({ cartella: c, task: { consegna: 'Rispondi.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete: rete(),
      contestoDelProgetto: 'P', contextHooks, onGiro: (e) => eventi.push(e), ...(ripiegoDetto !== undefined ? { ripiegoDetto } : {}) });
    return { esito, righe: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego').map((e) => e.codice) };
  } finally { console.warn = avvisi; }
}

test('RIPIEGO-GUSCIO-01 storia divergente sulla strada della CLI (guscio + nucleo nativo): UNA riga nel giro, ZERO nel giro dopo ancora rotto', async (t) => {
  const c = cartella(t);
  const ganci1 = rotti('CTX_HISTORY_DIVERGED');
  const g1 = await giro(c, ganci1);
  assert.ok(ganci1.conti.capture > 0 && ganci1.conti.prepare > 0, `premessa: il guasto è stato toccato (${JSON.stringify(ganci1.conti)})`);
  assert.equal(g1.esito.comeFinita, 'concluso', 'il giro arriva in fondo');
  assert.deepEqual(g1.righe, ['CTX_HISTORY_DIVERGED'], 'una riga sola, non una del guscio e una del nativo');
  assert.equal(g1.esito.ripiegoDetto, 'CTX_HISTORY_DIVERGED', 'l\'esito porta il ricordo del guscio, non il null del nativo');
  const g2 = await giro(c, rotti('CTX_HISTORY_DIVERGED'), g1.esito.ripiegoDetto);
  assert.deepEqual(g2.righe, [], 'il giro dopo, ancora rotto: zero righe');
  assert.equal(g2.esito.ripiegoDetto, 'CTX_HISTORY_DIVERGED');
});

test('RIPIEGO-GUSCIO-02 AL CONTRARIO: sulla strada della CLI un archivio sano non dà righe e azzera il ricordo', async (t) => {
  const c = cartella(t);
  const g = await giro(c, { capture: async () => {}, prepare: async ({ messages }) => ({ messages }) }, 'CTX_HISTORY_DIVERGED');
  assert.deepEqual(g.righe, []);
  assert.equal(g.esito.ripiegoDetto, null, 'guarito');
});
