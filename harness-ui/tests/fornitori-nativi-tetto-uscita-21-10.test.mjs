/*
 * P1 della ricognizione (21/10/2026): sulla strada nativa, senza un limite chiesto, il ripiego fisso di 8.192 token troncava le risposte
 * lunghe. Sui fornitori di prima parte il limite lo decide l'SDK o il servizio (il massimo del modello); sui compatibili di terzi resta 8.192.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';

const messaggi = [{ role: 'system', content: 'Base.' }, { role: 'user', content: 'Ciao.' }];
const rispostaAnthropic = (model) => new Response(JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model, content: [{ type: 'text', text: 'ok' }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5, output_tokens: 2 } }), { headers: { 'content-type': 'application/json' } });

async function corpoAnthropic(provider, model, body = {}) {
  let corpo = null;
  await nativeProviderResponse({ provider, model, apiKey: 'test-only-key', body: { messages: messaggi, ...body },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return rispostaAnthropic(model); } });
  return corpo;
}

test('NTU-01 Anthropic senza limite chiesto: il massimo del modello secondo l\'SDK, non 8.192', async () => {
  assert.equal((await corpoAnthropic('anthropic', 'claude-opus-5-5')).max_tokens, 128_000);
  assert.equal((await corpoAnthropic('anthropic', 'claude-haiku-4-5')).max_tokens, 64_000);
});

test('NTU-02 un limite chiesto resta quello chiesto', async () => {
  assert.equal((await corpoAnthropic('anthropic', 'claude-opus-5-5', { max_tokens: 2000 })).max_tokens, 2000);
  assert.equal((await corpoAnthropic('anthropic', 'claude-opus-5-5', { max_completion_tokens: 3000 })).max_tokens, 3000);
});

test('NTU-03 verso contrario: un compatibile Anthropic di terzi (Z.AI) resta al ripiego di 8.192, non ai 4.096 dell\'SDK', async () => {
  assert.equal((await corpoAnthropic('zai-anthropic', 'glm-5.3-flash')).max_tokens, 8192);
});

test('NTU-04 OpenAI Responses senza limite chiesto: nessun max_output_tokens (decide il modello)', async () => {
  let corpo = null;
  const sse = [
    { type: 'response.created', response: { id: 'r1', created_at: 0, model: 'gpt-5-mini' } },
    { type: 'response.completed', response: { id: 'r1', created_at: 0, model: 'gpt-5-mini', output: [], usage: { input_tokens: 5, output_tokens: 2 } } },
  ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  await nativeProviderResponse({ provider: 'openai', model: 'gpt-5-mini', apiKey: 'test-only-key', body: { messages: messaggi, stream: true },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return new Response(sse, { headers: { 'content-type': 'text/event-stream' } }); } })
    .then((r) => r.text()).catch(() => {});
  assert.ok(corpo, 'la richiesta è partita');
  assert.equal(Object.hasOwn(corpo, 'max_output_tokens'), false);
});

test('NTU-05 revisione N1: Gemini senza limite chiesto riceve il tetto pubblicato 65.535 (il suo valore interno tronca), come Hermes', async () => {
  let corpo = null;
  await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3-flash', apiKey: 'test-only-key', body: { messages: messaggi },
    fetchFn: async (_url, init) => { corpo = JSON.parse(init.body); return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } }); } });
  assert.equal(corpo.generationConfig.maxOutputTokens, 65_535);
  let chiesto = null;
  await nativeProviderResponse({ provider: 'gemini', model: 'gemini-3-flash', apiKey: 'test-only-key', body: { messages: messaggi, max_tokens: 1234 },
    fetchFn: async (_url, init) => { chiesto = JSON.parse(init.body); return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } }); } });
  assert.equal(chiesto.generationConfig.maxOutputTokens, 1234, 'un limite chiesto resta quello');
});
