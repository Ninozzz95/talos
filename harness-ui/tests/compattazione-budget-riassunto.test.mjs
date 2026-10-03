/*
 * 02/10/2026, owner («Come Hermes, adesso») — il budget d'uscita del riassunto di compattazione.
 *
 * Il difetto, misurato sulla sessione vera b1e7382a dell'app installata: tre compattazioni su tre finite «troncato»,
 * ognuna con `completion_tokens: 2048` e `reasoning_tokens: 0` — il tetto fisso `MAX_TOKEN_RIASSUNTO`, riempito di
 * testo visibile senza arrivare in fondo (213.785 token da riassumere). L'unica riuscita ne aveva usati 1.570.
 *
 * La regola di Hermes (`agent/context_compressor.py:3427-3431`, costanti `:843-846`, finestra `:2222`):
 *   budget = max(2.000, min(20% dei token da riassumere, min(5% della finestra, 10.000))).
 * Senza finestra dichiarata vale quella implicita nella soglia (soglia = 0,75 × finestra ⇒ finestra = soglia / 0,75).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FRAZIONE_FINESTRA, TETTO_TOKEN_DEFAULT, budgetRiassunto, testoRichiestaDiRiassunto,
} from '../src/kernel/compattazione-desktop.mjs';

const parole = (token) => Math.floor((token * 1_200) / 2_048);

test('CTX-BUDGET-SESSIONE-VERA — 213.785 token da riassumere senza finestra: 10.000, non 2.048', () => {
  const b = budgetRiassunto({ tokenDaRiassumere: 213_785, finestraToken: null, soglia: 200_000 });
  assert.equal(b.maxOutputTokens, 10_000);
  assert.equal(b.paroleMassime, parole(10_000));
});

test('CTX-BUDGET-PAVIMENTO — poco da riassumere: mai sotto 2.000', () => {
  assert.equal(budgetRiassunto({ tokenDaRiassumere: 5_000, finestraToken: null, soglia: 200_000 }).maxOutputTokens, 2_000);
  assert.equal(budgetRiassunto({ tokenDaRiassumere: 0, finestraToken: 128_000, soglia: 96_000 }).maxOutputTokens, 2_000);
});

test('CTX-BUDGET-FINESTRA — il 5% della finestra limita, e il pavimento vince su una finestra piccola', () => {
  assert.equal(budgetRiassunto({ tokenDaRiassumere: 100_000, finestraToken: 128_000, soglia: 96_000 }).maxOutputTokens, 6_400);
  assert.equal(budgetRiassunto({ tokenDaRiassumere: 100_000, finestraToken: 32_768, soglia: 24_576 }).maxOutputTokens, 2_000);
  assert.equal(budgetRiassunto({ tokenDaRiassumere: 30_000, finestraToken: 1_000_000, soglia: 200_000 }).maxOutputTokens, 6_000);
});

test('CTX-BUDGET-SENZA-FINESTRA — la finestra implicita nella soglia (soglia / 0,75)', () => {
  // soglia 40.000 ⇒ finestra 53.333 ⇒ 5% = 2.666; 20% di 30.000 = 6.000 ⇒ 2.666
  assert.equal(budgetRiassunto({ tokenDaRiassumere: 30_000, finestraToken: null, soglia: 40_000 }).maxOutputTokens, 2_666);
  // né finestra né soglia: la soglia predefinita
  const predefinito = Math.min(Math.floor((TETTO_TOKEN_DEFAULT / FRAZIONE_FINESTRA) * 0.05), 10_000);
  assert.equal(budgetRiassunto({ tokenDaRiassumere: 213_785 }).maxOutputTokens, predefinito);
});

test('CTX-BUDGET-INGRESSI-SPORCHI — numeri assenti, negativi o non finiti non producono un budget assurdo', () => {
  for (const tokenDaRiassumere of [undefined, null, Number.NaN, -5, Number.POSITIVE_INFINITY]) {
    const b = budgetRiassunto({ tokenDaRiassumere, finestraToken: Number.NaN, soglia: -1 });
    assert.ok(Number.isSafeInteger(b.maxOutputTokens), `${tokenDaRiassumere}: ${b.maxOutputTokens}`);
    assert.ok(b.maxOutputTokens >= 2_000 && b.maxOutputTokens <= 10_000, `${tokenDaRiassumere}: ${b.maxOutputTokens}`);
    assert.ok(b.paroleMassime > 0);
  }
});

test('CTX-BUDGET-PROMPT — il prompt dichiara le parole del budget calcolato', () => {
  const { paroleMassime } = budgetRiassunto({ tokenDaRiassumere: 213_785, finestraToken: null, soglia: 200_000 });
  assert.ok(testoRichiestaDiRiassunto({ paroleMassime }).includes(`at most ${paroleMassime} words`));
});
