/*
 * D9, punto 3 (forma del 04/11/2026, OK di CLI, Mobile e Performance): nel nucleo NATIVO la cattura iniziale (`catturaSenzaFermare('start')`)
 *   che trova il modello locale ancora in apertura (CTX_RUNTIME_PROFILE_MISMATCH con `details.nonPronto`) non dice «ripiego», come
 *   l'adattatore del desktop e come lo «skipped» di Hermes (`agent/compaction_events.py:67`). Se è ancora non pronto alla richiesta
 *   (cattura `before-request`), la riga torna: un'apertura incastrata non diventa muta (condizione di Performance).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MISMATCH = 'CTX_RUNTIME_PROFILE_MISMATCH';
const nonPronto = () => Object.assign(new Error('non pronto'), { code: MISMATCH, details: { nonPronto: true } });
const guasto = () => Object.assign(new Error('modello diverso'), { code: MISMATCH });
const fornitore = async () => Response.json({ choices: [{ message: { role: 'assistant', content: 'Fatto.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } });

async function giro(t, capture) {
  const c = mkdtempSync(join(tmpdir(), 'talos-d9-nativo-'));
  writeFileSync(join(c, 'uno.txt'), 'x');
  t.after(() => rimuoviCartellaDiProva(c));
  const eventi = [];
  const avvisi = console.warn; console.warn = () => {};
  try {
    const esito = await talosLavora({ cartella: c, task: { consegna: 'Rispondi.' }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete: fornitore,
      contestoDelProgetto: 'P', comandoProva: 'node -e 0', onGiro: (e) => eventi.push(e), contextHooks: { capture, prepare: async ({ messages }) => ({ messages }) } });
    return { esito, righe: eventi.filter((e) => e.tipo === 'compattazione-fine' && e.motivo === 'ripiego').map((e) => e.codice) };
  } finally { console.warn = avvisi; }
}

test('D9-NATIVO-01 — cattura iniziale col modello in apertura, poi pronto: nessuna riga di ripiego', async (t) => {
  const { esito, righe } = await giro(t, async ({ reason }) => { if (reason === 'start') throw nonPronto(); });
  assert.equal(esito.comeFinita, 'concluso');
  assert.deepEqual(righe, []);
  assert.equal(esito.ripiegoDetto, null, 'niente di detto, niente da ricordare');
});

test('D9-NATIVO-02 — AL CONTRARIO: ancora non pronto alla richiesta, la riga torna (una volta)', async (t) => {
  const { righe } = await giro(t, async ({ reason }) => { if (reason === 'start' || reason === 'before-request') throw nonPronto(); });
  assert.deepEqual(righe, [MISMATCH]);
});

test('D9-NATIVO-03 — AL CONTRARIO: lo stesso codice senza nonPronto (modello diverso) resta un guasto e si dice subito', async (t) => {
  const { righe } = await giro(t, async ({ reason }) => { if (reason === 'start') throw guasto(); });
  assert.deepEqual(righe, [MISMATCH]);
});
