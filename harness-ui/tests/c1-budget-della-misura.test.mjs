import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetDellaMisura } from '../src/context-desktop-service.mjs';
import { computeContextBudget } from '../../context-engine/src/compaction-planner.mjs';

/*
 * C1 (owner 10/10/2026, «un numero solo»): la scheda Contesto e l'avviso del compositore leggono il limite di una conversazione
 * col motore da `budget` di `GET /context`. Dev'essere lo STESSO numero con cui il motore decide (`engine.mjs` `budgetFor` =
 * `computeContextBudget({ ...measurement, settings })`), mai una stima a parte: con una finestra di 200k il motore riassume oltre
 * 130.212, il legacy oltre 150.000.
 */
const MISURA = { inputTokens: 98_000, windowTokens: 200_000, responseReserve: 16_384, method: 'runtime', exact: true };

test('C1-BUDGET-01 — il budget è quello con cui il motore decide, con le impostazioni della conversazione', () => {
  for (const settings of [{}, { triggerRatio: 0.6 }]) {
    const atteso = computeContextBudget({ ...MISURA, settings });
    assert.deepEqual(budgetDellaMisura({ measurement: { tokens: MISURA }, settings }), {
      windowTokens: atteso.windowTokens, inputLimit: atteso.inputLimit, triggerTokens: atteso.triggerTokens, inputTokens: 98_000, method: 'runtime',
    });
  }
  // il numero ricalcolato a mano (profiles.mjs: margine 5% per `runtime`; contracts.mjs: triggerRatio di serie)
  const b = budgetDellaMisura({ measurement: { tokens: MISURA }, settings: {} });
  assert.equal(b.inputLimit, 200_000 - 16_384 - 10_000);
  assert.ok(b.triggerTokens < b.inputLimit && b.triggerTokens > 0);
});

test('C1-BUDGET-02 — senza misura, o con un profilo non valido, il budget è null (mai un numero inventato)', () => {
  assert.equal(budgetDellaMisura(null), null);
  assert.equal(budgetDellaMisura({ measurement: null }), null);
  assert.equal(budgetDellaMisura({ measurement: { tokens: { ...MISURA, windowTokens: 0 } } }), null);
  assert.equal(budgetDellaMisura({ measurement: { tokens: { ...MISURA, responseReserve: 300_000 } } }), null);
});

test('C1-BUDGET-03 — cambiato il modello, il budget usa la finestra del modello ATTUALE (quella con cui il motore misurerà)', () => {
  const misura = { ...MISURA, provider: 'openrouter', model: 'vecchio/200k' };
  const nuovo = { provider: 'openrouter', model: 'nuovo/1m', windowTokens: 1_000_000, responseReserve: 32_000 };
  const b = budgetDellaMisura({ measurement: { tokens: misura }, settings: {} }, nuovo);
  const atteso = computeContextBudget({ ...misura, provider: nuovo.provider, model: nuovo.model, windowTokens: 1_000_000, responseReserve: 32_000, settings: {} });
  assert.equal(b.windowTokens, 1_000_000);
  assert.equal(b.triggerTokens, atteso.triggerTokens);
  assert.equal(b.inputTokens, 98_000, 'i token restano quelli misurati');
  // AL CONTRARIO: stesso modello, o profilo non verificato ⇒ la misura, identica a prima
  const stesso = budgetDellaMisura({ measurement: { tokens: misura }, settings: {} }, { provider: 'openrouter', model: 'vecchio/200k', windowTokens: 999_999, responseReserve: 1 });
  assert.equal(stesso.windowTokens, 200_000);
  assert.deepEqual(budgetDellaMisura({ measurement: { tokens: misura }, settings: {} }, { provider: 'openrouter', model: 'nuovo/1m' }), budgetDellaMisura({ measurement: { tokens: misura }, settings: {} }));
});
