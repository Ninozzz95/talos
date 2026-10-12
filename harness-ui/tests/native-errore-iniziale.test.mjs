/*
 * F-H-002 (stress test della CLI 0.5.3, 12/10/2026 notte) — SUI FILI NATIVI UN ERRORE DEL FORNITORE ARRIVAVA COME 200.
 * Misurato: con OpenAI Responses e Anthropic in streaming, un 429 (o un 400) del fornitore diventava una risposta 200 col flusso che
 * poi falliva. Chi chiama non vedeva né lo stato né `Retry-After`: niente attesa giusta, e un 400 trattato come «esito incerto».
 * Il filo compatibile OpenAI (OpenRouter e gli altri) dà lo stato vero; ora anche i nativi: prima di rispondere si legge il primo
 * evento del flusso, e se è un errore HTTP del fornitore si risponde con QUELLO stato, le sue intestazioni e il suo corpo.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';

const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const COMPLETA = { type: 'response.completed', response: { id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-x',
  output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ciao', annotations: [] }] }],
  usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 4 } } };

const fili = [['openai', 'gpt-x', 'https://api.openai.com/v1'], ['anthropic', 'claude-x', undefined]];

test('NATIVO-ERRORE-01 — a provider error before the first token comes back with the provider status, Retry-After and body', async () => {
  for (const [provider, model, baseURL] of fili) {
    for (const stato of [429, 400, 503]) {
      const fetchFn = async () => new Response(JSON.stringify({ error: { message: 'Rate limit reached', type: 'rate_limit_error' } }), { status: stato, headers: { 'content-type': 'application/json', 'retry-after': '7', 'x-request-id': 'req_9' } });
      const r = await nativeProviderResponse({ provider, model, apiKey: 'k', baseURL, fetchFn, body: { stream: true, messages: [{ role: 'user', content: 'ciao' }] } });
      assert.equal(r.status, stato, `${provider} ${stato}`);
      assert.equal(r.headers.get('retry-after'), '7', `${provider} ${stato}: Retry-After reaches the caller`);
      assert.equal(r.headers.get('x-request-id'), 'req_9');
      assert.match(await r.text(), /Rate limit reached/u);
    }
  }
});

test('NATIVO-ERRORE-02 — AL CONTRARIO: a good stream is still a 200 stream with its text', async () => {
  const fetchFn = async () => new Response(sse({ type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-x' } }, { type: 'response.output_item.added', output_index: 0, item: { id: 'msg_1', type: 'message', role: 'assistant', status: 'in_progress', content: [] } }, { type: 'response.content_part.added', item_id: 'msg_1', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }, { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, content_index: 0, delta: 'ciao' }, COMPLETA), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const r = await nativeProviderResponse({ provider: 'openai', model: 'gpt-x', apiKey: 'k', baseURL: 'https://api.openai.com/v1', fetchFn, body: { stream: true, messages: [{ role: 'user', content: 'ciao' }] } });
  assert.equal(r.status, 200);
  const testo = await r.text();
  assert.match(testo, /"content":"ciao"/u);
  assert.match(testo, /\[DONE\]/u);
});

test('NATIVO-ERRORE-03 — a failure without an HTTP status (network) still reaches the reader as that failure, not as a cut stream', async () => {
  const fetchFn = async () => { throw new TypeError('fetch failed: connection reset'); };
  const r = await nativeProviderResponse({ provider: 'openai', model: 'gpt-x', apiKey: 'k', baseURL: 'https://api.openai.com/v1', fetchFn, body: { stream: true, messages: [{ role: 'user', content: 'ciao' }] } });
  assert.equal(r.status, 200, 'no status to report: the stream carries the failure');
  await assert.rejects(r.text(), (e) => /connection reset|Cannot connect|fetch failed/iu.test(String(e?.message ?? e)) && !/interrupted before completion/u.test(String(e?.message ?? e)));
});
