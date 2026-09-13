import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenAiCompatibleRuntime } from '../src/openai-compatible-runtime.mjs';

const observedAt = '2026-08-31T13:00:00.000Z';

function response(body, { status = 200, contentType = 'application/json' } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    json: async () => JSON.parse(text),
    text: async () => text,
    body: new Response(text, { headers: { 'content-type': contentType } }).body,
  };
}

function makeRuntime(routes = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const route = routes[`${options.method ?? 'GET'} ${url}`] ?? routes[url];
    if (route instanceof Error) throw route;
    if (!route) return response({}, { status: 404 });
    return typeof route === 'function' ? route(options) : route;
  };
  return { runtime: createOpenAiCompatibleRuntime({ fetchImpl, now: () => new Date(observedAt) }), calls };
}

test('OPENAI-RUNTIME-DETECT-OLLAMA-01 rileva Ollama da /api/tags', async () => {
  const { runtime } = makeRuntime({ 'GET http://127.0.0.1:11434/api/tags': response({ models: [{ name: 'gemma3', size: 123, digest: 'abc', details: { format: 'gguf', parameter_size: '4B' } }] }) });
  const result = await runtime.detect('ollama');
  assert.deepEqual(result, { provider: 'ollama', state: 'observed', baseUrl: 'http://127.0.0.1:11434', observedAt });
});

test('OPENAI-RUNTIME-DETECT-LMSTUDIO-01 rileva LM Studio da /api/v1/models', async () => {
  const { runtime } = makeRuntime({ 'GET http://127.0.0.1:1234/api/v1/models': response({ models: [{ type: 'llm', key: 'qwen/qwen3', display_name: 'Qwen 3', capabilities: { reasoning: { default: 'off' } } }] }) });
  const result = await runtime.detect('lmstudio');
  assert.equal(result.state, 'observed');
  assert.equal(result.provider, 'lmstudio');
});

test('OPENAI-RUNTIME-DETECT-UNKNOWN-01 shape ambigua resta unknown', async () => {
  const { runtime } = makeRuntime({ 'GET http://127.0.0.1:11434/api/tags': response({ data: [{ id: 'x' }] }) });
  const result = await runtime.detect('ollama');
  assert.deepEqual(result, { provider: 'ollama', state: 'unknown', baseUrl: 'http://127.0.0.1:11434', observedAt, failureReason: 'INVALID_RESPONSE' });
});

test('OPENAI-RUNTIME-MODELS-01 normalizza source, contesto verificato e capability', async () => {
  const { runtime } = makeRuntime({ 'GET http://127.0.0.1:1234/api/v1/models': response({ models: [{ type: 'llm', key: 'qwen/qwen3', display_name: 'Qwen 3', architecture: 'qwen', quantization: { name: 'Q4_K_M' }, size_bytes: 1000, capabilities: { vision: true, trained_for_tool_use: false, reasoning: { default: 'off' } }, variants: [{ id: 'q4' }] }] }) });
  const models = await runtime.listModels('lmstudio');
  assert.deepEqual(models, [{ id: 'qwen/qwen3', name: 'Qwen 3', source: 'lmstudio', context: { state: 'unknown', value: null }, verifiedContext: false, capabilities: { vision: { state: 'observed', value: true }, toolUse: { state: 'observed', value: false }, reasoning: { state: 'observed', value: false } }, sizeBytes: 1000, quantization: 'Q4_K_M', observedAt }]);
});

test('OPENAI-RUNTIME-LIFECYCLE-01 LM Studio load/unload richiedono conferma upstream', async () => {
  const { runtime, calls } = makeRuntime({
    'POST http://127.0.0.1:1234/api/v1/models/load': response({ status: 'loaded', model: 'qwen/qwen3' }),
    'POST http://127.0.0.1:1234/api/v1/models/unload': response({ status: 'unloaded', model: 'qwen/qwen3' }),
  });
  assert.deepEqual(await runtime.load('lmstudio', 'qwen/qwen3', { contextLength: 65_536 }), { state: 'loaded', provider: 'lmstudio', modelId: 'qwen/qwen3', observedAt });
  assert.deepEqual(await runtime.unload('lmstudio', 'qwen/qwen3'), { state: 'unloaded', provider: 'lmstudio', modelId: 'qwen/qwen3', observedAt });
  assert.equal(JSON.stringify(calls).includes('Authorization'), false);
});

test('OPENAI-RUNTIME-STREAM-01 separa NDJSON Ollama in text, reasoning e tool call', async () => {
  const body = [
    JSON.stringify({ message: { thinking: 'penso' }, done: false }),
    JSON.stringify({ message: { content: 'ciao', tool_calls: [{ function: { name: 'search', arguments: { q: 'x' } } }] }, done: false }),
    JSON.stringify({ done: true }),
  ].join('\n');
  const { runtime } = makeRuntime({ 'POST http://127.0.0.1:11434/api/chat': response(body, { contentType: 'application/x-ndjson' }) });
  const events = [];
  for await (const event of runtime.generateStream({ provider: 'ollama', modelId: 'gemma3', messages: [{ role: 'user', content: 'ciao' }] })) events.push(event);
  assert.deepEqual(events.map(({ type, value, name }) => ({ type, ...(value ? { value } : {}), ...(name ? { name } : {}) })), [
    { type: 'reasoning', value: 'penso' }, { type: 'text', value: 'ciao' }, { type: 'tool_call', name: 'search' }, { type: 'done' },
  ]);
});

test('OPENAI-RUNTIME-STREAM-LM-01 separa SSE LM Studio e chiude su [DONE]', async () => {
  const body = [
    `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: 'penso' } }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}`,
    'data: [DONE]',
  ].join('\n\n');
  const { runtime } = makeRuntime({ 'POST http://127.0.0.1:1234/v1/chat/completions': response(body, { contentType: 'text/event-stream' }) });
  const events = [];
  for await (const event of runtime.generateStream({ provider: 'lmstudio', modelId: 'qwen/qwen3', messages: [{ role: 'user', content: 'ciao' }] })) events.push(event);
  assert.deepEqual(events, [{ type: 'reasoning', value: 'penso' }, { type: 'text', value: 'ok' }, { type: 'done' }]);
});

test('OPENAI-RUNTIME-ERROR-01 HTTP e JSON corrotti diventano errori tipizzati', async () => {
  const { runtime } = makeRuntime({ 'GET http://127.0.0.1:11434/api/tags': response('bad', { status: 200 }) });
  await assert.rejects(runtime.listModels('ollama'), { code: 'RUNTIME_RESPONSE_INVALID' });
  const network = makeRuntime({ 'GET http://127.0.0.1:1234/api/v1/models': new Error('ECONNREFUSED') });
  await assert.rejects(network.runtime.listModels('lmstudio'), { code: 'RUNTIME_UNREACHABLE' });
});

test('OPENAI-COMPATIBLE-ABORT-01 propagates signal e cancel(requestId)', async () => {
  let requestSignal;
  let release;
  const body = {
    getReader() {
      return {
        read: () => new Promise((resolve) => { release = resolve; requestSignal.addEventListener('abort', () => resolve({ done: true }), { once: true }); }),
        cancel: async () => {},
      };
    },
  };
  const { runtime } = makeRuntime({ 'POST http://127.0.0.1:11434/api/chat': (options) => {
    requestSignal = options.signal;
    return { ok: true, status: 200, body };
  } });
  const iterator = runtime.generateStream({ provider: 'ollama', modelId: 'gemma3', messages: [], requestId: 'req-1' });
  const pending = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requestSignal.aborted, false);
  assert.equal(runtime.cancel('req-1'), true);
  assert.equal(requestSignal.aborted, true);
  release?.({ done: true });
  await pending;
});

test('OPENAI-RUNTIME-NO-SECRETS-01 token server-side non compare nel risultato', async () => {
  const { runtime } = makeRuntime({ 'GET http://127.0.0.1:1234/api/v1/models': (options) => { assert.equal(options.headers?.Authorization, undefined); return response({ models: [] }); } });
  const result = await runtime.detect('lmstudio');
  assert.equal(JSON.stringify(result).includes('token'), false);
});

test('RUNTIME-ENDPOINT-VIVO — l’indirizzo scelto nel pannello vale ADESSO, non quello dell’avvio', async () => {
  /*
   * ⛔⛔ 12/09, P-C — perché non basta leggerlo una volta.
   *
   * La chat risolve l'indirizzo di LM Studio a OGNI richiesta (`model-destination.mjs` chiede al
   * portachiavi). Il catalogo, prima di oggi, lo fotografava alla nascita del server. Se la
   * persona cambiava porta nel pannello, la scheda elencava i modelli di un motore e la chat ne
   * chiamava un altro — **senza un errore da nessuna parte**: è la forma di guasto silenzioso
   * contro cui esiste la regola «instradare con parametri diversi da quelli provati renderebbe la
   * prova una bugia».
   */
  const chiamate = [];
  let porta = 1234;
  const runtime = createOpenAiCompatibleRuntime({
    fetchImpl: async (url) => { chiamate.push(String(url)); return Response.json({ models: [] }); },
    endpoints: { lmstudio: () => ({ baseUrl: `http://127.0.0.1:${porta}` }) },
  });
  await runtime.listModels('lmstudio');
  porta = 4321; // la persona cambia porta a server acceso
  await runtime.listModels('lmstudio');
  assert.deepEqual(chiamate, ['http://127.0.0.1:1234/api/v1/models', 'http://127.0.0.1:4321/api/v1/models']);

  /* ⛔ Verso contrario 1: un override che LANCIA non spegne il motore — si torna al registro. */
  const conRotto = createOpenAiCompatibleRuntime({
    fetchImpl: async (url) => { chiamate.push(String(url)); return Response.json({ models: [] }); },
    endpoints: { lmstudio: () => { throw new Error('portachiavi non disponibile'); } },
  });
  await conRotto.listModels('lmstudio');
  assert.equal(chiamate.at(-1), 'http://127.0.0.1:1234/api/v1/models', 'senza override valido vale l’indirizzo del registro');

  /* ⛔ Verso contrario 2: la forma vecchia (un oggetto, non una funzione) continua a valere. */
  const conOggetto = createOpenAiCompatibleRuntime({
    fetchImpl: async (url) => { chiamate.push(String(url)); return Response.json({ models: [] }); },
    endpoints: { ollama: { baseUrl: 'http://altro.test:11434' } },
  });
  await conOggetto.listModels('ollama');
  assert.equal(chiamate.at(-1), 'http://altro.test:11434/api/tags');
});
