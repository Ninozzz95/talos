/*
 * P1 della ricognizione dei parametri dei fornitori, passata 2 (21/10/2026) — Kimi, platform.kimi.ai/docs/api/chat letta il 21/10/2026:
 * kimi-k3 (ragiona sempre, reasoning_effort low|high|max, nessun `thinking`), max_tokens deprecato, reasoning_content da preservare.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';
import { REGISTRO_FORNITORI, verificaRegistro } from '../src/provider-registry.mjs';

const conAttrezzo = [
  { role: 'user', content: 'Leggi a.txt.' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: 'c1', content: 'ciao' },
];

test('KIMI-01 kimi-k3: reasoning_effort fra low/high/max, mai `thinking` né `reasoning`; «Spento» = il minimo, con una nota', () => {
  const alto = preparaRichiestaCompatibile('kimi', { model: 'kimi-k3', messages: [], reasoning: { effort: 'high' } });
  assert.equal(alto.corpo.reasoning_effort, 'high');
  assert.equal(Object.hasOwn(alto.corpo, 'thinking'), false, JSON.stringify(alto.corpo));
  assert.equal(Object.hasOwn(alto.corpo, 'reasoning'), false);
  assert.deepEqual(alto.note, []);
  assert.equal(preparaRichiestaCompatibile('kimi', { model: 'kimi-k3', messages: [], reasoning: { effort: 'xhigh' } }).corpo.reasoning_effort, 'max', 'xhigh ≡ max, in silenzio');
  const medio = preparaRichiestaCompatibile('kimi', { model: 'kimi-k3', messages: [], reasoning: { effort: 'medium' } });
  assert.equal(medio.corpo.reasoning_effort, 'low', 'il più vicino senza superare il costo scelto (BUG-18)');
  assert.equal(medio.note.length, 1);
  const spento = preparaRichiestaCompatibile('kimi', { model: 'kimi-k3', messages: [], reasoning: { effort: 'none' } });
  assert.equal(spento.corpo.reasoning_effort, 'low', 'mai il predefinito del fornitore (max)');
  assert.equal(spento.note.length, 1);
});

test('KIMI-02 il limite d\'uscita parte come max_completion_tokens su tutti i modelli Kimi (max_tokens deprecato)', () => {
  for (const model of ['kimi-k3', 'kimi-k2.6', 'kimi-k2.7-code']) {
    const { corpo } = preparaRichiestaCompatibile('kimi', { model, messages: [], max_tokens: 4096, stream: true });
    assert.equal(corpo.max_completion_tokens, 4096, model);
    assert.equal(Object.hasOwn(corpo, 'max_tokens'), false, model);
  }
});

test('KIMI-03 il reasoning_content dei messaggi dell\'assistente riparte (il suo o uno spazio); il corpo del chiamante non cambia', () => {
  const entrata = { model: 'kimi-k2.7-code', messages: structuredClone(conAttrezzo), stream: true };
  const prima = structuredClone(entrata);
  const { corpo } = preparaRichiestaCompatibile('kimi', entrata);
  assert.equal(corpo.messages[1].reasoning_content, ' ');
  assert.equal(Object.hasOwn(corpo.messages[0], 'reasoning_content'), false);
  assert.deepEqual(entrata, prima);
  // verso contrario: k2.6 a pensiero spento non riceve il riempimento
  const spento = preparaRichiestaCompatibile('kimi', { model: 'kimi-k2.6', messages: structuredClone(conAttrezzo), reasoning: { effort: 'none' } }).corpo;
  assert.equal(spento.thinking.type, 'disabled');
  assert.equal(Object.hasOwn(spento.messages[1], 'reasoning_content'), false);
});

test('KIMI-04 verso contrario: k2.6 resta acceso/spento senza livelli, e il registro tiene i livelli solo dove il modello non ha l\'interruttore', () => {
  const { corpo, note } = preparaRichiestaCompatibile('kimi', { model: 'kimi-k2.6', messages: [], reasoning: { effort: 'high' } });
  assert.deepEqual(corpo.thinking, { type: 'enabled' });
  assert.equal(Object.hasOwn(corpo, 'reasoning_effort'), false);
  assert.equal(note.length, 1, 'il livello non si manda, e si dice');
  assert.equal(verificaRegistro(), true);
  const k = REGISTRO_FORNITORI.kimi;
  const conLivelliSuK26 = { ...REGISTRO_FORNITORI, kimi: { ...k, richiestaCompatibile: { ...k.richiestaCompatibile, modelli: { ...k.richiestaCompatibile.modelli,
    'kimi-k2.6': { ...k.richiestaCompatibile.modelli['kimi-k2.6'], livelliRagionamento: ['high'] } } } } };
  assert.throws(() => verificaRegistro(conLivelliSuK26), /reasoning control/u);
});

test('KIMI-05 (revisione K1/K2/Q4/Q6) id ignoto con le cure del fornitore; k3 col thinking accanto manda solo lo sforzo; temperatura su k3 non parte', () => {
  const ignoto = preparaRichiestaCompatibile('kimi', { model: 'kimi-latest', messages: [], max_tokens: 100, reasoning: { effort: 'high' } });
  assert.equal(ignoto.corpo.max_completion_tokens, 100);
  assert.equal(Object.hasOwn(ignoto.corpo, 'reasoning'), false, 'l\u2019involucro di OpenRouter non parte');
  assert.equal(ignoto.note.length, 1);
  const k3 = preparaRichiestaCompatibile('kimi', { model: 'kimi-k3', messages: [], extra_body: { thinking: { type: 'enabled' } }, reasoning_effort: 'high', temperature: 0.3 });
  assert.equal(k3.corpo.reasoning_effort, 'high');
  assert.equal(Object.hasOwn(k3.corpo, 'thinking'), false, 'Moonshot rifiuta thinking accanto a reasoning_effort');
  assert.equal(Object.hasOwn(k3.corpo, 'temperature'), false);
  assert.ok(k3.note.some((n) => n.includes('no reasoning switch')), JSON.stringify(k3.note));
});

test('KIMI-06 (revisione V4/I-1) anche un id fuori profilo riceve il riempimento, come Hermes a livello di fornitore (reasoning_params.py:192-194)', () => {
  const m = preparaRichiestaCompatibile('kimi', { model: 'moonshot-v1-8k', messages: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'y' }] }).corpo.messages;
  assert.equal(m[1].reasoning_content, ' ');
});
