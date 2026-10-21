/*
 * P1 della ricognizione dei parametri dei fornitori, passata 2 (21/10/2026) — le connessioni cloud. Azure v1: `max_tokens` deprecato e
 * incompatibile coi modelli di ragionamento (learn.microsoft.com, chat v1). Vertex OpenAI: `reasoning_effort` minimal|low|medium|high.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';

test('CLOUD-01 Azure: il limite d\'uscita parte come max_completion_tokens; due limiti diversi sono un errore', () => {
  const { corpo } = preparaRichiestaCompatibile('azure', { model: 'mio-deployment', messages: [], max_tokens: 1000 });
  assert.equal(corpo.max_completion_tokens, 1000);
  assert.equal(Object.hasOwn(corpo, 'max_tokens'), false);
  assert.throws(() => preparaRichiestaCompatibile('azure', { model: 'x', messages: [], max_tokens: 10, max_completion_tokens: 20 }), { code: 'RUNTIME_INVALID' });
});

test('CLOUD-02 Vertex: lo sforzo resta fra minimal/low/medium/high; xhigh e max scendono a high, «none» sale al minimo, con una nota', () => {
  const v = (effort) => preparaRichiestaCompatibile('vertex', { model: 'google/gemini-3-pro', messages: [], reasoning: { effort } });
  assert.equal(v('medium').corpo.reasoning_effort, 'medium');
  assert.deepEqual(v('medium').note, []);
  assert.equal(v('max').corpo.reasoning_effort, 'high');
  assert.equal(v('xhigh').corpo.reasoning_effort, 'high');
  // revisione V-1 + G-1: «Spento» spegne davvero (thinking_budget 0) solo dove la pagina «Thinking» di Vertex (20/10/2026) lo permette
  const spento = (model, extra) => preparaRichiestaCompatibile('vertex', { model, messages: [], reasoning: { effort: 'none' }, ...(extra ? { extra_body: extra } : {}) });
  for (const model of ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-lite']) {
    assert.equal(Object.hasOwn(spento(model).corpo, 'reasoning_effort'), false, model);
    assert.deepEqual(spento(model).corpo.extra_body, { google: { thinking_config: { include_thoughts: false, thinking_budget: 0 } } }, model);
    assert.deepEqual(spento(model).note, [], model);
  }
  // 2.5 Pro non si spegne: il minimo documentato (128), detto
  assert.deepEqual(spento('google/gemini-2.5-pro').corpo.extra_body, { google: { thinking_config: { include_thoughts: false, thinking_budget: 128 } } });
  assert.equal(spento('google/gemini-2.5-pro').note.length, 1);
  // Gemini 3 e oltre: thinking_budget deprecato ⇒ mai mandato; il livello più basso documentato da tutti, «low», detto
  for (const model of ['google/gemini-3-pro', 'google/gemini-3.1-pro-preview', 'google/gemini-3-flash', 'google/gemini-4-flash', 'google/gemini-flash-latest']) {
    assert.equal(spento(model).corpo.reasoning_effort, 'low', model);
    assert.equal(Object.hasOwn(spento(model).corpo, 'extra_body'), false, model);
    assert.equal(spento(model).note.length, 1, model);
  }
  // revisione V-1: su Gemini 3+ mai `reasoning_effort` insieme al `thinking_config` del chiamante (Vertex: «only one … may be specified»)
  const tre = spento('google/gemini-3-pro', { x: 1, google: { cached_content: 'c', thinking_config: { thinking_level: 'high' } } });
  assert.equal(tre.corpo.reasoning_effort, 'low');
  assert.deepEqual(tre.corpo.extra_body, { x: 1, google: { cached_content: 'c' } });
  assert.equal(tre.note.length, 2);
  // revisione G-2 (W1): il resto di extra_body del chiamante resta suo; il suo thinking_config sostituito si dice
  const suo = spento('google/gemini-2.5-flash', { safety: 'x', google: { cached_content: 'c1', thinking_config: { thinking_budget: 500 } } });
  assert.deepEqual(suo.corpo.extra_body, { safety: 'x', google: { cached_content: 'c1', thinking_config: { include_thoughts: false, thinking_budget: 0 } } });
  assert.equal(suo.note.length, 1);
  const altro = preparaRichiestaCompatibile('vertex', { model: 'meta/llama-4', messages: [], reasoning: { effort: 'none' } });
  assert.equal(Object.hasOwn(altro.corpo, 'reasoning_effort'), false);
  assert.equal(Object.hasOwn(altro.corpo, 'extra_body'), false);
  assert.equal(altro.note.length, 1);
});

test('CLOUD-03 verso contrario: Bedrock resta com\'era (max_tokens e livello così come chiesti)', () => {
  const { corpo, note } = preparaRichiestaCompatibile('bedrock', { model: 'x', messages: [], max_tokens: 1000, reasoning: { effort: 'max' } });
  assert.equal(corpo.max_tokens, 1000);
  assert.equal(corpo.reasoning_effort, 'max');
  assert.deepEqual(note, []);
  assert.equal(Object.hasOwn(preparaRichiestaCompatibile('vertex', { model: 'x', messages: [], max_tokens: 5 }).corpo, 'max_tokens'), true, 'Vertex non dichiara un altro limite');
});

test('CLOUD-04 revisione V-2: con un livello esplicito il thinking_config del chiamante si toglie (Vertex ne vuole uno solo), una nota sola', () => {
  const { corpo, note } = preparaRichiestaCompatibile('vertex', { model: 'google/gemini-3-flash', messages: [], reasoning: { effort: 'high' },
    extra_body: { x: 1, google: { cached_content: 'c', thinking_config: { thinking_level: 'low' } } } });
  assert.equal(corpo.reasoning_effort, 'high');
  assert.deepEqual(corpo.extra_body, { x: 1, google: { cached_content: 'c' } });
  assert.equal(note.length, 1);
  // verso contrario: senza livello il thinking_config del chiamante resta suo
  const suo = preparaRichiestaCompatibile('vertex', { model: 'google/gemini-3-flash', messages: [], extra_body: { google: { thinking_config: { thinking_level: 'low' } } } });
  assert.deepEqual(suo.corpo.extra_body, { google: { thinking_config: { thinking_level: 'low' } } });
});
