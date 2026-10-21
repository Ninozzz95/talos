/*
 * P2 della revisione dei rigidi (21/10/2026): il riassunto parte con `tools: []` e `tool_choice: 'auto'`. Senza attrezzi `tool_choice` e
 * `parallel_tool_calls` si tolgono; la lista vuota si toglie come Hermes, tranne con chiamate d'attrezzo nella storia (come pi).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { preparaRichiestaCompatibile } from '../src/openai-compatible-runtime.mjs';

const conChiamata = [
  { role: 'user', content: 'leggi' },
  { role: 'assistant', content: null, tool_calls: [{ id: 'abc123def', type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
  { role: 'tool', tool_call_id: 'abc123def', content: 'ok' },
  { role: 'user', content: 'riassumi' },
];

test('AV-01 lista vuota senza storia d\'attrezzi: via tools, tool_choice e parallel_tool_calls', () => {
  for (const [id, model] of [['groq', 'openai/gpt-oss-20b'], ['cerebras', 'gpt-oss-120b'], ['zai', 'glm-5.3-flash'], ['openrouter', 'z-ai/glm-5.3-flash']]) {
    const { corpo } = preparaRichiestaCompatibile(id, { model, messages: [{ role: 'user', content: 'x' }], tools: [], tool_choice: 'auto', parallel_tool_calls: true });
    for (const campo of ['tools', 'tool_choice', 'parallel_tool_calls']) assert.equal(Object.hasOwn(corpo, campo), false, `${id} ${campo}`);
  }
});

test('AV-02 lista vuota con chiamate d\'attrezzo nella storia: tools: [] resta, tool_choice no', () => {
  const { corpo } = preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages: conChiamata, tools: [], tool_choice: 'auto' });
  assert.deepEqual(corpo.tools, []);
  assert.equal(Object.hasOwn(corpo, 'tool_choice'), false);
});

test('AV-03 verso contrario: con attrezzi veri tutto resta com\'era; il corpo del chiamante non cambia', () => {
  const attrezzi = [{ type: 'function', function: { name: 'leggi', parameters: { type: 'object', properties: {} } } }];
  const { corpo } = preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages: [], tools: attrezzi, tool_choice: 'auto' });
  assert.deepEqual(corpo.tools, attrezzi);
  assert.equal(corpo.tool_choice, 'auto');
  const entrata = { model: 'openai/gpt-oss-20b', messages: [], tools: [], tool_choice: 'auto' };
  preparaRichiestaCompatibile('groq', entrata);
  assert.deepEqual(entrata.tools, []);
  assert.equal(entrata.tool_choice, 'auto');
});

test('AV-04 revisione X11: una storia con soli esiti d\'attrezzo (role: tool) conta come storia d\'attrezzi', () => {
  const soloEsiti = [{ role: 'user', content: 'x' }, { role: 'tool', tool_call_id: 'abc123def', content: 'ok' }];
  const { corpo } = preparaRichiestaCompatibile('groq', { model: 'openai/gpt-oss-20b', messages: soloEsiti, tools: [], tool_choice: 'auto' });
  assert.deepEqual(corpo.tools, []);
});
