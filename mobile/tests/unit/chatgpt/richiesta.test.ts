// @vitest-environment node
// @ts-nocheck — prove portate dal desktop (JS)
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { CAMPI_VIETATI_DAL_PIANO, adattaCorpoAlPiano, chiaveDellaCacheDelPiano, creaFetchDelPiano, eventoFinaleDelFlusso } from '@/lib/chatgpt/richiesta';

/* N15 (mobile, 12/10/2026): prove del desktop r4 `2a61e35dc` (`harness-ui/tests/chatgpt-richiesta.test.mjs`) portate senza
   cambiare i casi; tolta solo la RICHIESTA-05, che passa dall'adattatore nativo e dall'SDK del desktop.
   «Continue with ChatGPT» (11/10/2026) — le richieste come il piano le accetta. Forme degli eventi prese dalla prova dal vivo. */
const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
// La forma di una risposta vera di Responses, quanto basta perché l'SDK la accetti.
const COMPLETA = { type: 'response.completed', response: { id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-6-sol',
  output: [{ id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'ciao', annotations: [] }] }],
  usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 4 } } };

test('RICHIESTA-01 — the body loses every field the plan refuses, always streams, never stores, and system becomes developer', () => {
  const corpo = Object.fromEntries(CAMPI_VIETATI_DAL_PIANO.map((c) => [c, 1]));
  Object.assign(corpo, { model: 'gpt-6-sol', store: true, stream: false, reasoning: { effort: 'high' }, tools: [{ type: 'function', name: 'leggi' }],
    input: [{ role: 'system', content: 'S' }, { role: 'developer', content: 'D' }, { role: 'user', content: 'U' }] });
  const congelato = structuredClone(corpo);
  const { corpo: nuovo, volevaIlFlusso, tolti } = adattaCorpoAlPiano(corpo);
  assert.deepEqual(corpo, congelato, 'the caller’s object is not touched');
  assert.deepEqual(Object.keys(nuovo).sort(), ['input', 'model', 'prompt_cache_key', 'reasoning', 'store', 'stream', 'tools']);
  assert.equal(nuovo.store, false);
  assert.equal(nuovo.stream, true);
  assert.equal(volevaIlFlusso, false);
  assert.deepEqual(tolti.sort(), [...CAMPI_VIETATI_DAL_PIANO].sort());
  assert.deepEqual(nuovo.input.map((v) => v.role), ['developer', 'developer', 'user']);
  assert.equal(adattaCorpoAlPiano({ model: 'm', stream: true }).volevaIlFlusso, true);
  for (const rotto of [null, 'x', []]) assert.throws(() => adattaCorpoAlPiano(rotto), (e) => e.code === 'CHATGPT_RICHIESTA_INCOMPLETA');
  for (const campo of ['max_output_tokens', 'temperature', 'top_p', 'metadata', 'truncation', 'user', 'previous_response_id']) assert.ok(CAMPI_VIETATI_DAL_PIANO.includes(campo), campo);
});

test('RICHIESTA-02 — the last terminal event decides; a stream without one decides nothing', async () => {
  assert.deepEqual(await eventoFinaleDelFlusso(sse({ type: 'response.created' }, { type: 'response.output_text.delta', delta: 'c' }, COMPLETA)), { tipo: 'response.completed', risposta: COMPLETA.response });
  assert.equal((await eventoFinaleDelFlusso(sse({ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }))).tipo, 'response.failed');
  assert.equal((await eventoFinaleDelFlusso(sse({ type: 'response.incomplete', response: { incomplete_details: { reason: 'max_output_tokens' } } }))).tipo, 'response.incomplete');
  assert.equal(await eventoFinaleDelFlusso(sse({ type: 'response.created' }, { type: 'response.output_text.delta', delta: 'c' })), null);
  assert.equal(await eventoFinaleDelFlusso('data: non-json\n\ndata: [DONE]\n\n'), null);
  assert.equal((await eventoFinaleDelFlusso(new Response(sse(COMPLETA).replaceAll('\n', '\r\n')).body)).tipo, 'response.completed', 'CRLF and a real stream');
});

test('RICHIESTA-03 — the fetch fixes the body on the wire; a caller that wanted a whole answer gets one, built from the stream', async () => {
  const viste = [];
  const rete = (risposta) => async (url, opzioni) => { viste.push({ url: String(url), corpo: opzioni.body ? JSON.parse(opzioni.body) : null, metodo: opzioni.method ?? 'GET' }); return risposta(); };
  const flusso = () => new Response(sse({ type: 'response.created' }, COMPLETA), { status: 200, headers: { 'content-type': 'text/event-stream', 'x-oai-request-id': 'req_1' } });
  // non-stream caller
  const intera = await creaFetchDelPiano(rete(flusso))('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ model: 'm', max_output_tokens: 500, temperature: 0.2, input: [] }) });
  assert.deepEqual(viste.at(-1).corpo, { model: 'm', input: [], store: false, stream: true, prompt_cache_key: chiaveDellaCacheDelPiano({ model: 'm', input: [] }) });
  assert.equal(intera.status, 200);
  assert.equal(intera.headers.get('content-type'), 'application/json');
  assert.equal(intera.headers.get('x-oai-request-id'), 'req_1', 'the request id survives');
  assert.deepEqual(await intera.json(), COMPLETA.response);
  // stream caller: the stream is handed over untouched
  const inFlusso = await creaFetchDelPiano(rete(flusso))('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ model: 'm', stream: true, max_output_tokens: 1 }) });
  assert.equal(inFlusso.headers.get('content-type'), 'text/event-stream');
  assert.match(await inFlusso.text(), /response\.completed/u);
  assert.equal('max_output_tokens' in viste.at(-1).corpo, false);
  // other requests pass as they are
  await creaFetchDelPiano(rete(() => Response.json({ models: [] })))('https://api.openai.com/v1/models', { headers: {} });
  assert.deepEqual(viste.at(-1), { url: 'https://api.openai.com/v1/models', corpo: null, metodo: 'GET' });
});

test('RICHIESTA-04 — a stream that does not complete is an error with the service’s own code, never a short answer', async () => {
  const con = (testo, stato = 200) => creaFetchDelPiano(async () => new Response(testo, { status: stato, headers: { 'content-type': 'text/event-stream' } }));
  const chiama = (f) => f('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ model: 'm', input: [] }) });
  const limite = await chiama(con(sse({ type: 'response.created' }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded', message: 'limit' } } })));
  assert.equal(limite.status, 429);
  assert.equal((await limite.json()).error.code, 'subscription_sharing_usage_limit_exceeded');
  const tronco = await chiama(con(sse({ type: 'response.created' }, { type: 'response.output_text.delta', delta: 'mezza rispos' })));
  assert.equal(tronco.status, 502);
  assert.equal((await tronco.json()).error.code, 'stream_interrupted');
  const incompleta = await chiama(con(sse({ type: 'response.incomplete', response: { incomplete_details: { reason: 'content_filter' } } })));
  assert.equal(incompleta.status, 502);
  assert.match((await incompleta.json()).error.message, /content_filter/u);
  // an HTTP error from the service is returned untouched, body included
  const rifiuto = await chiama(con('{"error":{"code":"subscription_sharing_user_not_eligible"}}', 403));
  assert.equal(rifiuto.status, 403);
  assert.equal((await rifiuto.json()).error.code, 'subscription_sharing_user_not_eligible');
});

test('RICHIESTA-06 — the cache key: same conversation same key, turn after turn; another start, model or tool set gets another one', () => {
  const istruzioni = { role: 'developer', content: 'You are TALOS.' };
  const primo = { role: 'user', content: 'Read the README.' };
  const attrezzi = [{ type: 'function', name: 'leggi' }];
  const giro1 = { model: 'gpt-6-sol', tools: attrezzi, input: [istruzioni, primo] };
  const giro2 = { ...giro1, input: [istruzioni, primo, { type: 'function_call', name: 'leggi', call_id: 'c1', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c1', output: 'ok' }, { role: 'assistant', content: 'Done.' }, { role: 'user', content: 'And now?' }] };
  const chiave = chiaveDellaCacheDelPiano(giro1);
  assert.match(chiave, /^talos-[0-9a-f]{58}$/u);
  assert.ok([...chiave].length <= 64, 'OpenAI takes at most 64 characters');
  assert.equal(chiaveDellaCacheDelPiano(giro2), chiave, 'the second turn of the same chat goes to the same cache');
  assert.equal(adattaCorpoAlPiano(giro2).corpo.prompt_cache_key, chiave);
  assert.equal(chiaveDellaCacheDelPiano({ ...giro1, input: [{ role: 'system', content: 'You are TALOS.' }, primo] }), chiave, 'system said as developer is the same prefix');
  for (const [perche, altro] of [
    ['another first message', { ...giro1, input: [istruzioni, { role: 'user', content: 'Something else.' }] }],
    ['another model', { ...giro1, model: 'gpt-6-luna' }],
    ['other instructions', { ...giro1, input: [{ role: 'developer', content: 'You are someone else.' }, primo] }],
    ['other tools', { ...giro1, tools: [{ type: 'function', name: 'scrivi' }] }],
    ['instructions as a field', { ...giro1, instructions: 'Be brief.' }],
  ]) assert.notEqual(chiaveDellaCacheDelPiano(altro), chiave, perche);
  assert.equal(adattaCorpoAlPiano({ ...giro1, prompt_cache_key: 'chiave-di-chi-chiama' }).corpo.prompt_cache_key, 'chiave-di-chi-chiama', 'a key given by the caller stays');
  assert.match(chiaveDellaCacheDelPiano({ model: 'm' }), /^talos-[0-9a-f]{58}$/u, 'no input: still a key, never a crash');
});

/*
 * RICHIESTA-07 (11/10/2026 sera) — TROVATO DAL VIVO col piano dell'owner: «Migliora prompt» rispondeva «The model answered in a
 * format that cannot be used», e la richiesta era stata contata (586 token). Chi vuole una risposta intera la riceve costruita dal
 * flusso, e noi prendevamo `response.output` dall'evento finale: sul piano quell'elenco può arrivare VUOTO, e gli elementi stanno
 * negli eventi `response.output_item.done`. È quello che leggono Codex (`codex-rs/codex-api/src/sse/responses.rs:358`: l'elemento
 * viene da `output_item.done`; `:498`: da `response.completed` solo id e consumo) e Pi (`pi-openai-responses.ts`,
 * `processResponsesStream`). ⇒ Gli elementi si raccolgono lungo il flusso; se l'evento finale ne porta di suoi, valgono i suoi.
 */
test('RICHIESTA-07 — a whole answer is built from the items of the stream when the final event carries none', async () => {
  const messaggio = COMPLETA.response.output[0];
  const ragionamento = { id: 'rs_1', type: 'reasoning', summary: [] };
  const senzaElementi = { type: 'response.completed', response: { ...COMPLETA.response, output: [] } };
  const flusso = sse({ type: 'response.created' },
    { type: 'response.output_item.done', output_index: 1, item: messaggio },
    { type: 'response.output_item.done', output_index: 0, item: ragionamento },
    senzaElementi);
  const finale = await eventoFinaleDelFlusso(flusso);
  assert.deepEqual(finale.risposta.output, [ragionamento, messaggio], 'collected, in the order of output_index');
  assert.deepEqual((await eventoFinaleDelFlusso(sse({ type: 'response.output_item.done', output_index: 0, item: messaggio }, { type: 'response.completed', response: { ...COMPLETA.response, output: undefined } }))).risposta.output, [messaggio], 'a missing list is filled too');
  // the final event's own items win: nothing is doubled
  assert.deepEqual((await eventoFinaleDelFlusso(sse({ type: 'response.output_item.done', output_index: 0, item: ragionamento }, COMPLETA))).risposta.output, COMPLETA.response.output);
  // a failed stream stays a failure, whatever was collected
  assert.equal((await eventoFinaleDelFlusso(sse({ type: 'response.output_item.done', output_index: 0, item: messaggio }, { type: 'response.failed', response: { error: { code: 'x' } } }))).risposta.output, undefined);
  // (mobile) senza l'adattatore del desktop: lo stesso passaggio fatto sul fetch del piano — chi chiede una risposta intera
  // riceve il testo raccolto dal flusso.
  const rete = async () => new Response(flusso, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const r = await creaFetchDelPiano(rete)('https://api.openai.com/v1/responses', { method: 'POST', body: JSON.stringify({ model: 'gpt-6-sol', stream: false, input: [{ role: 'user', content: 'ciao' }] }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).output.find((e) => e.type === 'message').content[0].text, 'ciao');
});
