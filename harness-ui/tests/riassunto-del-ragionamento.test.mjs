/*
 * Il riassunto del ragionamento scelto da chi ospita (`reasoning.summary`), sul filo Responses (piano ChatGPT e OpenAI).
 * Forma chiusa il 30/10/2026 sera; owner: muto «solo -p e banco». «none» omette il campo, come Codex (`client.rs:944`).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { creaFetchDelPiano } from '../src/chatgpt-richiesta.mjs';
import { reasoningRichiestaValido } from '../src/config.mjs';

const SSE = [
  { type: 'response.created', response: { id: 'r1', created_at: 1, model: 'm' } },
  { type: 'response.completed', response: { id: 'r1', status: 'completed', usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } },
].map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

async function sulFilo(reasoning) {
  let inviato = null;
  const fetchFn = async (_u, init) => { inviato = JSON.parse(init.body); return new Response(SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
  const r = await nativeProviderResponse({ provider: 'openai', model: 'gpt-5', apiKey: 'x', body: { model: 'gpt-5', stream: true, reasoning, messages: [{ role: 'user', content: 'ciao' }] }, fetchFn });
  if (r?.body?.getReader) { const rd = r.body.getReader(); while (!(await rd.read()).done) { /* consuma */ } }
  return inviato.reasoning;
}

test('RIA-01 «none» omette il campo summary (come Codex), lo sforzo resta', async () => {
  assert.deepEqual(await sulFilo({ effort: 'high', summary: 'none' }), { effort: 'high' });
});

test('RIA-02 auto/concise/detailed passano così come sono', async () => {
  for (const s of ['auto', 'concise', 'detailed']) assert.equal((await sulFilo({ effort: 'high', summary: s })).summary, s);
});

test('RIA-03 AL CONTRARIO: senza summary e con un valore ignoto resta il comportamento di oggi («detailed» con lo sforzo)', async () => {
  assert.equal((await sulFilo({ effort: 'high' })).summary, 'detailed');
  assert.equal((await sulFilo({ effort: 'high', summary: 'inventato' })).summary, 'detailed');
});

/* Il corpo che parte davvero verso il piano: adattatore nativo più il filtro del piano, la stessa catena del server (`runtime-owner-adapter.mjs`). */
async function sulPiano(reasoning) {
  let inviato = null;
  const rete = async (_u, init) => { inviato = JSON.parse(init.body); return new Response(SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } }); };
  const r = await nativeProviderResponse({ provider: 'chatgpt', model: 'gpt-6-luna', apiKey: 'x', baseURL: 'https://piano.invalid/v1', fetchFn: creaFetchDelPiano(rete), body: { model: 'gpt-6-luna', stream: true, reasoning, messages: [{ role: 'user', content: 'ciao' }] } });
  if (r?.body?.getReader) { const rd = r.body.getReader(); while (!(await rd.read()).done) { /* consuma */ } }
  return inviato;
}

test('RIA-04 il server accetta «none» e continua a rifiutare un valore ignoto', () => {
  assert.equal(reasoningRichiestaValido({ effort: 'high', summary: 'none' }), true);
  assert.equal(reasoningRichiestaValido({ effort: 'high', summary: 'inventato' }), false);
});

test('RIA-05 sul piano «none» non manda nessun summary, e lo sforzo resta', async () => {
  const corpo = await sulPiano({ effort: 'high', summary: 'none' });
  assert.deepEqual(corpo.reasoning, { effort: 'high' });
  assert.equal(JSON.stringify(corpo).includes('"summary"'), false);
});

test('RIA-06 AL CONTRARIO: sul piano, senza «none», il riassunto parte', async () => {
  assert.equal((await sulPiano({ effort: 'high' })).reasoning.summary, 'detailed');
});
