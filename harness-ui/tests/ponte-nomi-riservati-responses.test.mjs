/*
 * C5 (17/10/2026) — il filo Responses riserva `tool_search` (OpenAI e il piano ChatGPT hanno un Tool Search loro): il ponte degli
 * attrezzi differiti va sul filo come `talos_tool_search`, e il kernel riceve sempre `tool_search`. Come Hermes
 * (`agent/transports/codex.py:83-86, 126-151, 269-271, 836-843`). Nei due versi: Anthropic e un attrezzo qualsiasi restano com'erano.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { aliasDelFilo, nativeProviderResponse } from '../src/native-provider-adapter.mjs';

const attrezzo = (nome) => ({ type: 'function', function: { name: nome, description: nome, parameters: { type: 'object', properties: { query: { type: 'string' } } } } });
const tools = [attrezzo('tool_search'), attrezzo('tool_describe'), attrezzo('tool_call'), attrezzo('leggi')];
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const uso = { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
const risposta = (nome) => ({ id: 'r', created_at: 1, model: 'gpt-x', status: 'completed', error: null, incomplete_details: null, usage: uso,
  output: [{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: nome, arguments: '{"query":"note"}', status: 'completed' }] });
const sse = (eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

test('PONTE-RESP-01: aliasDelFilo — solo sul filo Responses, solo i nomi riservati, con suffisso se l\'alias è già preso', () => {
  assert.deepEqual([...aliasDelFilo(['tool_search', 'leggi'], true).verso], [['tool_search', 'talos_tool_search']]);
  assert.deepEqual([...aliasDelFilo(['tool_search', 'talos_tool_search'], true).verso], [['tool_search', 'talos_tool_search_2']]);
  assert.equal(aliasDelFilo(['tool_search'], false).verso.size, 0, 'AL CONTRARIO: fuori da Responses niente alias');
  assert.equal(aliasDelFilo(['leggi', 'tool_call'], true).verso.size, 0, 'AL CONTRARIO: nessun nome riservato, niente alias');
});

test('PONTE-RESP-02: OpenAI Responses — sul filo `talos_tool_search`, e la chiamata del modello torna al kernel come `tool_search`', async () => {
  let filo;
  const r = await nativeProviderResponse({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k', body: { messages: [{ role: 'user', content: 'cerca' }], tools },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return json(risposta('talos_tool_search')); } });
  const nomi = filo.tools.map((t) => t.name);
  assert.ok(nomi.includes('talos_tool_search') && !nomi.includes('tool_search'), nomi.join(','));
  assert.ok(nomi.includes('tool_describe') && nomi.includes('tool_call') && nomi.includes('leggi'), 'gli altri nomi non cambiano');
  const messaggio = (await r.json()).choices[0].message;
  assert.equal(messaggio.tool_calls[0].function.name, 'tool_search');
});

test('PONTE-RESP-03: piano ChatGPT in flusso — l\'apertura della chiamata porta il nome vero', async () => {
  const voce = { type: 'function_call', id: 'fc_0', call_id: 'call_0', name: 'talos_tool_search', arguments: '', status: 'in_progress' };
  const eventi = [{ type: 'response.created', sequence_number: 0, response: { id: 'r', created_at: 1, model: 'gpt-x', status: 'in_progress', output: [] } },
    { type: 'response.output_item.added', sequence_number: 1, output_index: 0, item: voce },
    { type: 'response.function_call_arguments.delta', sequence_number: 2, output_index: 0, item_id: 'fc_0', delta: '{"query":"note"}' },
    { type: 'response.output_item.done', sequence_number: 3, output_index: 0, item: { ...voce, arguments: '{"query":"note"}', status: 'completed' } },
    { type: 'response.completed', sequence_number: 4, response: { id: 'r', created_at: 1, model: 'gpt-x', status: 'completed', output: [{ ...voce, arguments: '{"query":"note"}', status: 'completed' }], usage: uso } }];
  let filo;
  const r = await nativeProviderResponse({ provider: 'chatgpt', model: 'gpt-x', apiKey: 'token', body: { stream: true, messages: [{ role: 'user', content: 'cerca' }], tools },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return new Response(sse(eventi), { headers: { 'content-type': 'text/event-stream' } }); } });
  const nomi = [];
  for (const riga of (await r.text()).split('\n')) {
    if (!riga.startsWith('data: ') || riga === 'data: [DONE]') continue;
    for (const c of JSON.parse(riga.slice(6)).choices?.[0]?.delta?.tool_calls ?? []) if (c.function?.name) nomi.push(c.function.name);
  }
  assert.ok(filo.tools.some((t) => t.name === 'talos_tool_search'));
  assert.deepEqual(nomi, ['tool_search']);
});

test('PONTE-RESP-04 AL CONTRARIO: Anthropic dichiara `tool_search` col suo nome (il filo Messages non lo riserva)', async () => {
  let filo;
  await nativeProviderResponse({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'k', body: { messages: [{ role: 'user', content: 'cerca' }], tools },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return json({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }); } });
  assert.ok(filo.tools.some((t) => t.name === 'tool_search'));
});

/* Revisione L (owner 17/10, «Rinominare anche la storia»): anche le chiamate già nella storia vanno sul filo Responses con l'alias. */
test('PONTE-RESP-05: la storia senza stato salvato manda `talos_tool_search` su Responses; AL CONTRARIO Anthropic manda il nome vero', async () => {
  const storia = [
    { role: 'user', content: 'cerca' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'tool_search', arguments: '{"query":"note"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'notes_update: …' },
    { role: 'user', content: 'ora' },
  ];
  let filo;
  await nativeProviderResponse({ provider: 'openai', model: 'gpt-5.4-mini', apiKey: 'k', body: { messages: storia, tools },
    fetchFn: async (_u, init) => { filo = JSON.parse(init.body); return json(risposta('leggi')); } });
  const chiamata = filo.input.find((p) => p.type === 'function_call');
  assert.equal(chiamata.name, 'talos_tool_search');
  assert.ok(filo.input.some((p) => p.type === 'function_call_output' && p.call_id === 'c1'));
  let anth;
  await nativeProviderResponse({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'k', body: { messages: storia, tools },
    fetchFn: async (_u, init) => { anth = JSON.parse(init.body); return json({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }); } });
  assert.equal(anth.messages.flatMap((m) => m.content).find((p) => p.type === 'tool_use').name, 'tool_search');
});
