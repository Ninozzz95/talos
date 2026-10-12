/*
 * R-01 (S1, 12/10/2026) — SUL FILO RESPONSES OGNI CAMPO FACOLTATIVO DIVENTAVA OBBLIGATORIO. Gli attrezzi partivano senza `strict`, e
 * l'API Responses di OpenAI, quando `strict` manca, «will attempt to normalize your schema into strict mode when possible», dove
 * «All fields in `properties` must be marked as `required`» (developers.openai.com/api/docs/guides/function-calling, letta il
 * 12/10/2026). Dal vivo, col piano ChatGPT (`chatgpt:gpt-6.1-sol`, trascritto dell'owner): il modello ha mandato `""` in ogni campo
 * facoltativo — `modello` 31 volte, `cartella` 21, `model` 18 — e la delega e il Workflow lo hanno rifiutato. Codex, sullo stesso
 * servizio, dichiara `strict: false` (`codex-rs/core/src/tools/handlers/multi_agents_spec.rs:92`). Qui: si guarda il CORPO che parte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';

const sse = (...eventi) => eventi.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const RISPOSTA = sse(
  { type: 'response.created', response: { id: 'resp_1', created_at: 1791700000, model: 'gpt-x' } },
  { type: 'response.completed', response: { id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-x', output: [],
    usage: { input_tokens: 3, input_tokens_details: { cached_tokens: 0 }, output_tokens: 1, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 4 } } },
);
const ATTREZZI = [
  { type: 'function', function: { name: 'delega_sottotask', description: 'Delegate a sub-task.', parameters: { type: 'object', required: ['task'],
    properties: { task: { type: 'string' }, cartella: { type: 'string' }, modalita: { type: 'string', enum: ['lettura', 'modifica'] }, modello: { type: 'string' } } } } },
  { type: 'function', function: { name: 'elenca', description: 'List a folder.', parameters: { type: 'object', properties: { percorso: { type: 'string' }, cursor: { type: 'string' } } } } },
];

async function corpoInviato({ provider, model, baseURL, stream = true }) {
  let corpo = null;
  const fetchFn = async (_url, init) => {
    corpo = JSON.parse(String(init.body));
    return stream
      ? new Response(RISPOSTA, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      : new Response(JSON.stringify({ id: 'resp_1', object: 'response', created_at: 1791700000, status: 'completed', model: 'gpt-x', output: [], usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const r = await nativeProviderResponse({ provider, model, apiKey: 'k', baseURL, fetchFn, body: { stream, tools: ATTREZZI, messages: [{ role: 'user', content: 'ciao' }] } });
  await r.text();
  return corpo;
}

test('R-01-01 — on the Responses wire every function tool is declared non-strict, so an optional field stays optional', async () => {
  for (const stream of [true, false]) {
    const corpo = await corpoInviato({ provider: 'openai', model: 'gpt-x', baseURL: 'https://api.openai.com/v1', stream });
    const funzioni = (corpo.tools ?? []).filter((t) => t.type === 'function');
    assert.deepEqual(funzioni.map((t) => t.name), ['delega_sottotask', 'elenca'], `stream=${stream}: both tools reach the provider`);
    for (const t of funzioni) assert.equal(t.strict, false, `stream=${stream} ${t.name}: strict must be false, or Responses normalizes every field into required`);
    assert.deepEqual(funzioni[0].parameters.required, ['task'], 'the schema keeps its own required list, untouched');
  }
});

test('R-01-02 — AL CONTRARIO: the Anthropic wire carries no OpenAI strict flag on its tools', async () => {
  let corpo = null;
  const fetchFn = async (_url, init) => { corpo = JSON.parse(String(init.body)); return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }), { status: 529, headers: { 'content-type': 'application/json' } }); };
  await nativeProviderResponse({ provider: 'anthropic', model: 'claude-x', apiKey: 'k', fetchFn, body: { stream: true, tools: ATTREZZI, messages: [{ role: 'user', content: 'ciao' }] } });
  for (const t of corpo.tools) assert.equal('strict' in t, false, `${t.name}: no strict flag on Anthropic`);
});
