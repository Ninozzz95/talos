/*
 * Owner 29/10/2026 sera (AskUserQuestion, consigliata «Una volta per chat»): nel nucleo NATIVO (telefono, server senza guscio) la riga del
 *   ripiego della `capture` si vede la prima volta; con lo stesso guasto nei giri dopo non si ripete; torna dopo una `capture` riuscita.
 *   È il contratto R12-2 che il guscio desktop ha già: `ripiegoDetto` entra nel giro (dal registro, `voce.ripiegoDetto`) ed esce in
 *   `esito.ripiegoDetto` (il registro lo legge con `Object.hasOwn`; prova del filo nel registro: R12-2 in r11-revisione-11-23-10).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-ripiego-nativo-'));
  writeFileSync(join(c, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}
const fornitore = () => async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } });
/* `guasto(reason)` → il codice con cui la capture fallisce, o null se riesce */
const ganci = (guasto) => ({
  capture: async ({ reason }) => { const c = guasto(reason); if (c) throw Object.assign(new Error('guasto'), { code: c }); },
  prepare: async ({ messages }) => ({ messages }),
});
async function giro(c, contextHooks, ripiegoDetto) {
  const eventi = [];
  const avvisi = console.warn; console.warn = () => {};
  try {
    const esito = await talosLavora({ cartella: c, task: { consegna: 'Rispondi.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete: fornitore(),
      contestoDelProgetto: 'P', comandoProva: 'node -e 0', onGiro: (e) => eventi.push(e), ...(contextHooks ? { contextHooks } : {}),
      ...(ripiegoDetto !== undefined ? { ripiegoDetto } : {}) });
    return { esito, righe: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego').map((e) => e.codice) };
  } finally { console.warn = avvisi; }
}

test('RIPIEGO-NATIVO-01 lo stesso guasto in tre giri di fila: una riga sola, e il codice esce ogni volta per il giro dopo', async (t) => {
  const c = cartella(t);
  const rotto = ganci(() => 'CTX_PERSISTENCE_FAILED');
  const g1 = await giro(c, rotto);
  assert.deepEqual(g1.righe, ['CTX_PERSISTENCE_FAILED']);
  assert.equal(g1.esito.ripiegoDetto, 'CTX_PERSISTENCE_FAILED');
  const g2 = await giro(c, rotto, g1.esito.ripiegoDetto);
  assert.deepEqual(g2.righe, [], 'già detto, non si ripete');
  assert.equal(g2.esito.ripiegoDetto, 'CTX_PERSISTENCE_FAILED', 'e resta da dire come non guarito');
  const g3 = await giro(c, rotto, g2.esito.ripiegoDetto);
  assert.deepEqual(g3.righe, []);
});

test('RIPIEGO-NATIVO-02 AL CONTRARIO: una capture riuscita guarisce, e il guasto dopo si dice di nuovo', async (t) => {
  const c = cartella(t);
  const g1 = await giro(c, ganci((r) => (r === 'start' ? 'CTX_HISTORY_DIVERGED' : null)));
  assert.deepEqual(g1.righe, ['CTX_HISTORY_DIVERGED']);
  assert.equal(g1.esito.ripiegoDetto, null, 'le capture dopo sono riuscite: guarito');
  const g2 = await giro(c, ganci(() => 'CTX_HISTORY_DIVERGED'), g1.esito.ripiegoDetto);
  assert.deepEqual(g2.righe, ['CTX_HISTORY_DIVERGED'], 'tornato dopo la guarigione: si dice');
});

test('RIPIEGO-NATIVO-03 AL CONTRARIO: un guasto con un codice DIVERSO da quello già detto si dice', async (t) => {
  const c = cartella(t);
  const g = await giro(c, ganci(() => 'CTX_STORE_BROKEN'), 'CTX_PERSISTENCE_FAILED');
  assert.deepEqual(g.righe, ['CTX_STORE_BROKEN']);
  assert.equal(g.esito.ripiegoDetto, 'CTX_STORE_BROKEN');
});

test('RIPIEGO-NATIVO-04 senza motore del contesto l\'esito non porta il campo (il registro non tocca niente); con la capture sana porta null', async (t) => {
  const c = cartella(t);
  const senza = await giro(c, null, 'CTX_PERSISTENCE_FAILED');
  assert.equal(Object.hasOwn(senza.esito, 'ripiegoDetto'), false);
  const sana = await giro(c, ganci(() => null), 'CTX_PERSISTENCE_FAILED');
  assert.equal(sana.esito.ripiegoDetto, null, 'una capture riuscita guarisce anche ciò che era stato detto prima');
  assert.deepEqual(sana.righe, []);
});
