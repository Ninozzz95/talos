/*
 * 174 (04/11/2026, forma C, OK di Performance, CLI e Mobile): il tetto della finestra resta fermo.
 * Il margine di sicurezza copre l'errore della STIMA, quindi si misura sulla sola parte stimata quando la misura porta un'àncora
 * del fornitore: margine = max(5% della finestra, 15% della parte stimata). Una misura tutta stimata resta al 15% della finestra,
 * come oggi. Hermes fa lo stesso conto (`agent/context_breakdown.py:194-213`, `agent/usage_anchor.py:108-120`: àncora del
 * fornitore + stima dei soli messaggi aggiunti) e la soglia di Hermes non dipende dal metodo della misura
 * (`agent/context_compressor.py:2778-2790`); Codex uguale (`codex-rs/core/src/context_manager/history.rs:1006-1030`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContextProfile } from '../src/profiles.mjs';
import { computeContextBudget } from '../src/compaction-planner.mjs';
import { TokenMeasurementV1, ContextMeasurementV1 } from '../src/contracts.mjs';

/* il caso misurato dal giro UX (`scratchpad/ux174/misura174.txt`): DeepSeek V4.1 Flash via OpenRouter, finestra 266.667, riserva 32.000 */
const W = 266_667;
const R = 32_000;
const base = { provider: 'openrouter', model: 'deepseek/deepseek-v4.1-flash', windowTokens: W, responseReserve: R };
const soglia = (extra) => computeContextBudget({ ...base, inputTokens: 150_000, ...extra }).triggerTokens;

test('T174-1 — misura del fornitore, poi stima con 2k aggiunti sull\'àncora: la soglia resta la stessa (oggi 165.999 → 145.999)', () => {
  const fornitore = soglia({ method: 'provider' });
  assert.equal(fornitore, 165_999);
  const dopo = soglia({ method: 'heuristic', inputTokens: 152_000, anchorTokens: 150_000, estimatedDeltaTokens: 2_000 });
  assert.ok(Math.abs(dopo - fornitore) <= fornitore * 0.01, `soglia ${dopo} contro ${fornitore}`);
  assert.equal(dopo, 165_999);
  assert.equal(validateContextProfile({ ...base, method: 'heuristic', anchorTokens: 150_000, estimatedDeltaTokens: 2_000 }).safetyMarginTokens, 13_334);
});

test('T174-2 — AL CONTRARIO: una misura tutta stimata resta al 15% della finestra, come oggi (anche con un\'àncora vuota o campi rotti)', () => {
  assert.equal(soglia({ method: 'heuristic' }), 145_999);
  assert.equal(validateContextProfile({ ...base, method: 'heuristic' }).safetyMarginTokens, 40_001);
  for (const rotti of [{ anchorTokens: 0, estimatedDeltaTokens: 2_000 }, { anchorTokens: 150_000 }, { estimatedDeltaTokens: 2_000 },
    { anchorTokens: -1, estimatedDeltaTokens: 2_000 }, { anchorTokens: 150_000, estimatedDeltaTokens: -5 }, { anchorTokens: 1.5, estimatedDeltaTokens: 2_000 },
    { anchorTokens: 150_000, estimatedDeltaTokens: '2000' }]) {
    assert.equal(validateContextProfile({ ...base, method: 'heuristic', ...rotti }).safetyMarginTokens, 40_001, JSON.stringify(rotti));
  }
  // e i metodi esatti senza àncora restano al 5%
  assert.equal(validateContextProfile({ ...base, method: 'provider' }).safetyMarginTokens, 13_334);
  assert.equal(validateContextProfile({ ...base, method: 'runtime' }).safetyMarginTokens, 13_334);
});

test('T174-3 — una parte stimata enorme (150k incollati sull\'àncora) prende il margine largo e riassume prima', () => {
  const margine = validateContextProfile({ ...base, method: 'provider', anchorTokens: 20_000, estimatedDeltaTokens: 150_000 }).safetyMarginTokens;
  assert.equal(margine, 22_500, '15% di 150.000, più del 5% della finestra');
  assert.ok(soglia({ method: 'provider', inputTokens: 170_000, anchorTokens: 20_000, estimatedDeltaTokens: 150_000 }) < 165_999);
  // il confine del max: 15% della parte stimata contro 5% della finestra
  assert.equal(validateContextProfile({ ...base, method: 'heuristic', anchorTokens: 1, estimatedDeltaTokens: 88_000 }).safetyMarginTokens, 13_334);
  assert.equal(validateContextProfile({ ...base, method: 'heuristic', anchorTokens: 1, estimatedDeltaTokens: 89_000 }).safetyMarginTokens, 13_350);
  assert.equal(validateContextProfile({ ...base, method: 'heuristic', anchorTokens: 1, estimatedDeltaTokens: 89_001 }).safetyMarginTokens, 13_351, 'arrotondato in su, mai frazionario');
  // l'àncora senza niente di stimato dopo (la richiesta è quella ancorata): il 5% della finestra
  assert.equal(validateContextProfile({ ...base, method: 'heuristic', anchorTokens: 150_000, estimatedDeltaTokens: 0 }).safetyMarginTokens, 13_334);
});

test('T174-4 — finestre piccole del telefono (8192 e 4096): 2k stimati restano dentro, una parte stimata grande prende il margine largo', () => {
  // 8192: riserva = un ottavo (context-runtime.mjs, resolveDesktopDefaultProfile), il 5% fa 410
  const p8 = { provider: 'locale-ospite', model: 'lfm', windowTokens: 8_192, responseReserve: 1_024 };
  assert.equal(validateContextProfile({ ...p8, method: 'heuristic', anchorTokens: 4_000, estimatedDeltaTokens: 2_000 }).safetyMarginTokens, 410);
  const b8 = computeContextBudget({ ...p8, method: 'heuristic', inputTokens: 6_000, anchorTokens: 4_000, estimatedDeltaTokens: 2_000 });
  assert.equal(b8.inputLimit, 8_192 - 1_024 - 410);
  assert.ok(b8.fits, 'àncora + 2k stimati entrano');
  assert.ok(4_000 + Math.ceil(2_000 * 1.15) + 1_024 <= 8_192, 'anche con la stima sbagliata del 15% la richiesta resta nella finestra vera');
  assert.equal(validateContextProfile({ ...p8, method: 'heuristic', anchorTokens: 500, estimatedDeltaTokens: 5_000 }).safetyMarginTokens, 750, 'parte stimata grande ⇒ margine largo');
  // oggi la stessa misura senza àncora prende 1.229 (15% della finestra), e resta così
  assert.equal(validateContextProfile({ ...p8, method: 'heuristic' }).safetyMarginTokens, 1_229);
  // 4096: il 5% (205) è sotto il pavimento di 256, che resta
  const p4 = { provider: 'locale-ospite', model: 'lfm', windowTokens: 4_096, responseReserve: 512 };
  assert.equal(validateContextProfile({ ...p4, method: 'heuristic', anchorTokens: 1_500, estimatedDeltaTokens: 1_000 }).safetyMarginTokens, 256);
  assert.equal(validateContextProfile({ ...p4, method: 'heuristic', anchorTokens: 300, estimatedDeltaTokens: 2_000 }).safetyMarginTokens, 300);
  assert.equal(validateContextProfile({ ...p4, method: 'heuristic' }).safetyMarginTokens, 1_024, 'tutta stimata: come oggi');
});

test('T174-5 — Performance: àncora + parte stimata vicina al tetto ⇒ la richiesta, anche con la stima sbagliata del 15%, resta sotto la finestra vera', () => {
  for (const windowTokens of [4_096, 8_192, 16_384, 32_768, 131_072, 266_667, 1_000_000]) {
    const responseReserve = Math.min(32_000, Math.floor(windowTokens / 8));
    for (const quota of [0, 0.01, 0.1, 0.3, 0.5, 0.8, 1]) {
      // il più grande inputTokens che il motore lascia partire (fits), con la parte stimata pari a `quota` di lui
      let input = windowTokens;
      let b;
      for (;;) {
        const estimatedDeltaTokens = Math.floor(input * quota);
        const anchorTokens = Math.max(1, input - estimatedDeltaTokens);
        b = computeContextBudget({ provider: 'p', model: 'm', windowTokens, responseReserve, method: 'provider', inputTokens: anchorTokens + estimatedDeltaTokens, anchorTokens, estimatedDeltaTokens });
        if (b.fits || input <= 1) break;
        input = Math.min(input - 1, b.inputLimit);
      }
      assert.ok(b.fits);
      const vero = b.anchorTokens + Math.ceil(b.estimatedDeltaTokens * 1.15);
      assert.ok(vero + responseReserve <= windowTokens, `finestra ${windowTokens}, quota ${quota}: ${vero} + ${responseReserve} > ${windowTokens}`);
      // e mai meno prudente del 5% di oggi per una misura del fornitore
      assert.ok(b.safetyMarginTokens >= Math.max(256, Math.ceil(windowTokens * 0.05)));
    }
  }
});

test('T174-6 — CLI: un margine esplicito nel profilo vince sempre (come `validateContextProfile` di oggi)', () => {
  assert.equal(validateContextProfile({ ...base, method: 'heuristic', anchorTokens: 150_000, estimatedDeltaTokens: 2_000, marginTokens: 7 }).safetyMarginTokens, 7);
  assert.equal(validateContextProfile({ ...base, method: 'heuristic', marginTokens: 0 }).safetyMarginTokens, 0);
});

test('T174-7 — la misura porta àncora, parte stimata e margine (schema): li accetta e rifiuta valori rotti', () => {
  const misura = { schema: 'talos.context.tokens.v1', inputTokens: 152_000, windowTokens: W, responseReserve: R, method: 'provider', exact: false, requestHash: 'h', provider: 'openrouter', model: 'm', estimatedMarginTokens: 300, anchorTokens: 150_000, estimatedDeltaTokens: 2_000, marginTokens: 13_334 };
  assert.deepEqual(TokenMeasurementV1.parse(misura), misura);
  assert.deepEqual(ContextMeasurementV1.parse({ schema: 'talos.context.measurement.v1', revision: 1, measuredAt: '2026-11-04T20:00:00.000Z', tokens: misura }).tokens, misura);
  for (const campo of ['anchorTokens', 'estimatedDeltaTokens', 'marginTokens']) {
    assert.throws(() => TokenMeasurementV1.parse({ ...misura, [campo]: -1 }), undefined, campo);
    assert.throws(() => TokenMeasurementV1.parse({ ...misura, [campo]: 1.5 }), undefined, campo);
  }
  // senza i campi nuovi resta valida come prima (le misure già salvate)
  const { anchorTokens, estimatedDeltaTokens, marginTokens, ...vecchia } = misura;
  assert.deepEqual(TokenMeasurementV1.parse(vecchia), vecchia);
});
