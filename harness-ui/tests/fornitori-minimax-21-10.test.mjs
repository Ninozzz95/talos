/*
 * P1 della ricognizione dei parametri dei fornitori, passata 2 (21/10/2026) — MiniMax sulla rotta OpenAI,
 * platform.minimax.io/docs/api-reference/text-openai-api letta il 21/10/2026.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';

test('MMX-01 M3.1-Flash: reasoning_effort fra i livelli, mai `thinking` (disabled = 400), «Spento» = il minimo', () => {
  const alto = preparaRichiestaCompatibile('minimax', { model: 'MiniMax-M3.1-Flash', messages: [], reasoning: { effort: 'xhigh' } }).corpo;
  assert.equal(alto.reasoning_effort, 'xhigh');
  assert.equal(Object.hasOwn(alto, 'thinking'), false, JSON.stringify(alto));
  const spento = preparaRichiestaCompatibile('minimax', { model: 'MiniMax-M3.1-Flash', messages: [], reasoning: { effort: 'none' } });
  assert.equal(spento.corpo.reasoning_effort, 'low', '«none» = 400: si manda il minimo, mai il predefinito max');
  assert.equal(Object.hasOwn(spento.corpo, 'thinking'), false);
});

test('MMX-02 reasoning_split:true e max_completion_tokens su ogni modello MiniMax; la temperatura su M3 la decide il modello', () => {
  for (const model of ['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5']) {
    const { corpo } = preparaRichiestaCompatibile('minimax', { model, messages: [], max_tokens: 2048 });
    assert.equal(corpo.reasoning_split, true, model);
    assert.equal(corpo.max_completion_tokens, 2048, model);
    assert.equal(Object.hasOwn(corpo, 'max_tokens'), false, model);
  }
  const m3 = preparaRichiestaCompatibile('minimax', { model: 'MiniMax-M3', messages: [], temperature: 0.2 });
  assert.equal(Object.hasOwn(m3.corpo, 'temperature'), false);
  assert.equal(m3.avvisi.length, 1);
});

test('MMX-03 verso contrario: M3 si spegne ancora con thinking disabled; il registro respinge un parametro fisso sconosciuto', () => {
  const spento = preparaRichiestaCompatibile('minimax', { model: 'MiniMax-M3', messages: [], reasoning: { effort: 'none' } }).corpo;
  assert.deepEqual(spento.thinking, { type: 'disabled' });
  assert.equal(verificaRegistro(), true);
  const m = REGISTRO_FORNITORI.minimax;
  const con = (parametriFissi) => ({ ...REGISTRO_FORNITORI, minimax: { ...m, richiestaCompatibile: { ...m.richiestaCompatibile, parametriFissi } } });
  for (const errato of [{ temperature: 1 }, { reasoning_split: 'true' }, [], null]) assert.throws(() => verificaRegistro(con(errato)), /compatibility profile/u, JSON.stringify(errato));
});

test('MMX-04 (revisione K1/M1/Q2) id in minuscolo = lo stesso modello; id ignoto con split e limite; split:false dell\u2019ospite si dice', () => {
  const minuscolo = preparaRichiestaCompatibile('minimax', { model: 'minimax-m3.1-flash', messages: [], reasoning: { effort: 'none' } }).corpo;
  assert.equal(minuscolo.reasoning_effort, 'low', 'riconosciuto come M3.1-Flash');
  const ignoto = preparaRichiestaCompatibile('minimax', { model: 'MiniMax-M2.1', messages: [], max_tokens: 50 }).corpo;
  assert.equal(ignoto.reasoning_split, true);
  assert.equal(ignoto.max_completion_tokens, 50);
  const falso = preparaRichiestaCompatibile('minimax', { model: 'MiniMax-M2.7', messages: [], reasoning_split: false });
  assert.equal(falso.corpo.reasoning_split, true);
  assert.equal(falso.note.length >= 1, true, JSON.stringify(falso.note));
});
