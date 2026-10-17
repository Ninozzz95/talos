/*
 * Revisione avversaria di 71141bb05 (K2, 16/10/2026): la chiamata non valida sul filo di Anthropic, con gli argomenti in DELTA, e due
 * chiamate nella stessa risposta di cui una sola non valida. SDK vero (`ai` + `@ai-sdk/anthropic`), fornitore finto, nessuna rete.
 * Ricerca del 16/10/2026: `NoSuchToolError` quando il nome non è fra gli attrezzi dello step (community.vercel.com/t/7701,
 * betterclaw.io «model tried to call unavailable tool»); gli argomenti a pezzi come causa dei guasti in streaming (stesso thread).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

const messages = [{ role: 'system', content: 'Aiuta la persona.' }, { role: 'user', content: 'Leggi il file.' }];
const tools = [{ type: 'function', function: { name: 'leggi', description: 'Legge un file', parameters: { type: 'object', properties: { percorso: { type: 'string' } }, required: ['percorso'] } } }];
const native = (body, fetchFn) => nativeProviderResponse({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'test-only-key', body, fetchFn });
const sse = (eventi) => new Response(eventi.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });

function risposta(blocchi) {
  const eventi = [['message_start', { type: 'message_start', message: { id: 'msg_k2', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }]];
  blocchi.forEach(([nome, pezzi], i) => {
    eventi.push(['content_block_start', { type: 'content_block_start', index: i, content_block: { type: 'tool_use', id: `toolu_${i}`, name: nome, input: {} } }]);
    for (const p of pezzi) eventi.push(['content_block_delta', { type: 'content_block_delta', index: i, delta: { type: 'input_json_delta', partial_json: p } }]);
    eventi.push(['content_block_stop', { type: 'content_block_stop', index: i }]);
  });
  eventi.push(['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 20 } }]);
  eventi.push(['message_stop', { type: 'message_stop' }]);
  return eventi;
}

test('K2-REV-01 — Anthropic: un attrezzo inesistente con gli argomenti in delta arriva come chiamata, coi suoi argomenti una volta sola', async () => {
  const result = await native({ messages, tools, stream: true }, async () => sse(risposta([['non_esiste', ['{"x"', ':1}']]])));
  const parsed = await consumaFlussoSSE(result);
  assert.equal(parsed.scelta.tool_calls?.length, 1);
  assert.equal(parsed.scelta.tool_calls[0].function.name, 'non_esiste');
  assert.deepEqual(JSON.parse(parsed.scelta.tool_calls[0].function.arguments), { x: 1 });
});

test('K2-REV-02 — Anthropic: due chiamate, la seconda non valida: arrivano TUTTE E DUE, ognuna coi suoi argomenti', async () => {
  const result = await native({ messages, tools, stream: true }, async () => sse(risposta([['leggi', ['{"percorso":', '"a.txt"}']], ['non_esiste', ['{"y":2}']]])));
  const parsed = await consumaFlussoSSE(result);
  const nomi = (parsed.scelta.tool_calls ?? []).map((c) => c.function.name);
  assert.deepEqual(nomi, ['leggi', 'non_esiste']);
  assert.deepEqual(JSON.parse(parsed.scelta.tool_calls[0].function.arguments), { percorso: 'a.txt' });
  assert.deepEqual(JSON.parse(parsed.scelta.tool_calls[1].function.arguments), { y: 2 });
});

test('K2-REV-03 — Anthropic: argomenti fuori schema (manca il campo obbligatorio) arrivano come chiamata, senza lanciare', async () => {
  const result = await native({ messages, tools, stream: true }, async () => sse(risposta([['leggi', ['{"altro":', '1}']]])));
  const parsed = await consumaFlussoSSE(result);
  assert.equal(parsed.scelta.tool_calls?.length, 1);
  assert.deepEqual(JSON.parse(parsed.scelta.tool_calls[0].function.arguments), { altro: 1 });
});
