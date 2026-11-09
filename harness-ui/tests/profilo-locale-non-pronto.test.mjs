/*
 * D9 del Tester (blocco 25, 02/11/2026): «Conversation not compacted» su una chat di 3 messaggi, perché il profilo del motore del
 * contesto chiesto col modello locale ancora in apertura alza CTX_RUNTIME_PROFILE_MISMATCH, lo stesso codice di un modello diverso o
 * di una finestra sbagliata. Chi lo riceve non può distinguere «non ancora aperto» (da saltare, come lo «skipped» di Hermes,
 * `agent/compaction_events.py:67`) da un guasto vero. Forma: stesso codice, più `details.nonPronto` solo nel primo caso.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDesktopContextProfile, resolveDesktopDefaultProfile } from '../src/context-runtime.mjs';

const MODELLO = 'qwen-locale';
const errore = async (fn) => { try { await fn(); } catch (e) { return e; } assert.fail('premessa: doveva lanciare'); };

test('PROFILO-NON-PRONTO-01 — motore locale in apertura: stesso codice, con details.nonPronto', async () => {
  for (const state of ['loading', 'starting', 'stopped', undefined]) {
    const e = await errore(() => resolveDesktopDefaultProfile({ provider: 'local', model: MODELLO, readLocalRuntime: async () => ({ state, modelId: MODELLO, windowTokens: 32_768 }), env: {} }));
    assert.equal(e.code, 'CTX_RUNTIME_PROFILE_MISMATCH');
    assert.equal(e.details?.nonPronto, true, `stato ${state}`);
  }
  const senza = await errore(() => resolveDesktopDefaultProfile({ provider: 'local', model: MODELLO, readLocalRuntime: async () => null, env: {} }));
  assert.equal(senza.details?.nonPronto, true, 'nessuno stato letto = non pronto');
  const prova = await errore(() => resolveDesktopContextProfile({ profiles: [{ provider: 'local', model: MODELLO, windowTokens: 32_768, responseReserve: 4_096 }], provider: 'local', model: MODELLO,
    readLocalRuntime: async () => ({ state: 'loading', modelId: MODELLO, windowTokens: 32_768 }) }));
  assert.equal(prova.details?.nonPronto, true, 'anche il profilo della prova');
});

test('PROFILO-NON-PRONTO-02 — AL CONTRARIO: pronto con un altro modello o con una finestra sbagliata resta un guasto vero', async () => {
  const altro = await errore(() => resolveDesktopDefaultProfile({ provider: 'local', model: MODELLO, readLocalRuntime: async () => ({ state: 'ready', modelId: 'altro', windowTokens: 32_768 }), env: {} }));
  assert.equal(altro.code, 'CTX_RUNTIME_PROFILE_MISMATCH');
  assert.notEqual(altro.details?.nonPronto, true);
  const finestra = await errore(() => resolveDesktopDefaultProfile({ provider: 'local', model: MODELLO, readLocalRuntime: async () => ({ state: 'ready', modelId: MODELLO, windowTokens: 0 }), env: {} }));
  assert.notEqual(finestra.details?.nonPronto, true);
  const ok = await resolveDesktopDefaultProfile({ provider: 'local', model: MODELLO, readLocalRuntime: async () => ({ state: 'ready', modelId: MODELLO, windowTokens: 32_768 }), env: {} });
  assert.ok(ok.windowTokens > 0, 'premessa: pronto e giusto passa');
});
