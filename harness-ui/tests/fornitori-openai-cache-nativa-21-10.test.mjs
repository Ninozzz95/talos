/*
 * P1 della ricognizione (21/10/2026): verso OpenAI con la chiave API (strada nativa Responses) parte una `prompt_cache_key`, l'impronta
 * del prefisso stabile come per il piano ChatGPT; il piano resta col suo calcolo; Anthropic non la riceve.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';

const sse = [
  { type: 'response.created', response: { id: 'r1', created_at: 0, model: 'gpt-5-mini' } },
  { type: 'response.completed', response: { id: 'r1', created_at: 0, model: 'gpt-5-mini', output: [], usage: { input_tokens: 5, output_tokens: 2 } } },
].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

async function corpoOpenAI(messages, extra = {}) {
  let corpo = null;
  await nativeProviderResponse({ provider: 'openai', model: 'gpt-5-mini', apiKey: 'test-only-key', body: { messages, stream: true, ...extra },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return new Response(sse, { headers: { 'content-type': 'text/event-stream' } }); } })
    .then((r) => r.text()).catch(() => {});
  return corpo;
}

const giro = (prima, dopo = []) => [{ role: 'system', content: 'Sei TALOS.' }, { role: 'user', content: prima }, ...dopo];

test('OCN-01 stessa conversazione ⇒ stessa chiave anche dopo altri giri; conversazione diversa ⇒ chiave diversa', async () => {
  const g1 = (await corpoOpenAI(giro('Scrivi un test.'))).prompt_cache_key;
  const g5 = (await corpoOpenAI(giro('Scrivi un test.', [{ role: 'assistant', content: 'ok' }, { role: 'user', content: 'e poi?' }]))).prompt_cache_key;
  const altra = (await corpoOpenAI(giro('Correggi il bug.'))).prompt_cache_key;
  assert.match(g1, /^talos-[0-9a-f]{58}$/u);
  assert.equal(g1, g5);
  assert.notEqual(g1, altra);
});

test('OCN-02 la chiave del chiamante resta sua', async () => {
  assert.equal((await corpoOpenAI(giro('x'), { prompt_cache_key: 'mia' })).prompt_cache_key, 'mia');
});

test('OCN-03 verso contrario: Anthropic non la riceve', async () => {
  let corpo = null;
  await nativeProviderResponse({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'test-only-key', body: { messages: giro('x') },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return Response.json({ id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } }); } });
  assert.equal(Object.hasOwn(corpo, 'prompt_cache_key'), false);
});

test('OCN-04 verso il piano ChatGPT la chiave NON parte dall\'SDK: la calcola il suo adattatore sul corpo Responses (chatgpt-richiesta.mjs)', async () => {
  let corpo = null;
  await nativeProviderResponse({ provider: 'chatgpt', model: 'gpt-6-sol', apiKey: 'T', baseURL: 'https://api.openai.com/v1', body: { messages: giro('x'), stream: true },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return new Response(sse, { headers: { 'content-type': 'text/event-stream' } }); } })
    .then((r) => r.text()).catch(() => {});
  assert.ok(corpo, 'la richiesta è partita');
  assert.equal(Object.hasOwn(corpo, 'prompt_cache_key'), false);
});
