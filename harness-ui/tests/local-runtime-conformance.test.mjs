import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadConfig, ConfigurationError } from '../src/config.mjs';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';
import { createLocalModelStore } from '../src/local-model-store.mjs';
import { createLocalRuntimeProbe } from '../src/local-runtime-probe.mjs';
import { createOpenAiCompatibleRuntime } from '../src/openai-compatible-runtime.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';

const OBSERVED_AT = '2026-08-31T15:00:00.000Z';

function jsonResponse(body, { status = 200, contentType = 'application/json' } = {}) {
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

function sseResponse(lines) {
  const payload = lines.map((line) => `data: ${line}\n\n`).join('') + 'data: [DONE]\n\n';
  return jsonResponse(payload, { contentType: 'text/event-stream' });
}

function supervisorFake() {
  return {
    status: () => ({ state: 'ready', runtimeId: 'llama.cpp', baseUrl: 'http://127.0.0.1:18080' }),
    health: async () => ({ ok: true, status: 200 }),
    start: async (options) => ({ state: 'ready', runtimeId: 'llama.cpp', ...options }),
    stop: async () => ({ state: 'unavailable', runtimeId: 'llama.cpp' }),
  };
}

test('CONFORMANCE-LLAMA-STREAM-01 separa reasoning, testo e tool call nello stream OpenAI', async () => {
  const runtime = createLlamaServerRuntime({
    supervisor: supervisorFake(),
    fetchImpl: async (url) => url.endsWith('/v1/chat/completions')
      ? sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'piano' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'risposta' } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: 'call-1', function: { name: 'search', arguments: '{"q":"x"}' } }] } }] }),
      ])
      : jsonResponse({ data: [{ id: 'model-1' }] }),
  });
  const events = [];
  for await (const event of runtime.generateStream({ runId: 'run-1', turnId: 'turn-1', modelId: 'model-1', messages: [] })) events.push(event);
  assert.deepEqual(events.map(({ type }) => type), ['reasoning', 'text', 'tool_call', 'done']);
});

test('CONFORMANCE-OLLAMA-STREAM-01 separa NDJSON Ollama e chiude su done', async () => {
  const runtime = createOpenAiCompatibleRuntime({
    now: () => new Date(OBSERVED_AT),
    fetchImpl: async (url) => url.endsWith('/api/chat')
      ? jsonResponse([
        JSON.stringify({ message: { thinking: 'penso' }, done: false }),
        JSON.stringify({ message: { content: 'ciao', tool_calls: [{ function: { name: 'search', arguments: { q: 'x' } } }] }, done: false }),
        JSON.stringify({ done: true }),
      ].join('\n'), { contentType: 'application/x-ndjson' })
      : jsonResponse({ models: [] }),
  });
  const events = [];
  for await (const event of runtime.generateStream({ provider: 'ollama', modelId: 'gemma3', messages: [] })) events.push(event);
  assert.deepEqual(events.map(({ type }) => type), ['reasoning', 'text', 'tool_call', 'done']);
});

test('CONFORMANCE-LMSTUDIO-STREAM-01 separa SSE LM Studio e mantiene il provider', async () => {
  const runtime = createOpenAiCompatibleRuntime({
    fetchImpl: async (url) => url.endsWith('/v1/chat/completions')
      ? sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'penso' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'ok' } }] }),
      ])
      : jsonResponse({ models: [] }),
  });
  const events = [];
  for await (const event of runtime.generateStream({ provider: 'lmstudio', modelId: 'qwen/qwen3', messages: [] })) events.push(event);
  assert.equal(events[0].type, 'reasoning');
  assert.equal(events[1].type, 'text');
  assert.equal(events.at(-1).type, 'done');
});

test('CONFORMANCE-MALFORMED-01 output SSE corrotto diventa errore tipizzato e non testo', async () => {
  const runtime = createLlamaServerRuntime({
    supervisor: supervisorFake(),
    fetchImpl: async () => sseResponse(['{bad-json']),
  });
  const events = [];
  for await (const event of runtime.generateStream({ runId: 'run-bad', turnId: 'turn-bad', modelId: 'model-1', messages: [] })) events.push(event);
  assert.equal(events.some((event) => event.type === 'text'), false);
  assert.equal(events.find((event) => event.type === 'error')?.code, 'RUNTIME_SSE_INVALID');
});

test('CONFORMANCE-CANCEL-01 cancel interrompe lo stream senza fallback implicito', async () => {
  let signal;
  const runtime = createOpenAiCompatibleRuntime({
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return { ok: true, status: 200, body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: async () => {} }) } };
    },
  });
  const iterator = runtime.generateStream({ provider: 'ollama', modelId: 'gemma3', messages: [], requestId: 'req-1' });
  const pending = iterator.next();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runtime.cancel('req-1'), true);
  assert.equal(signal.aborted, true);
  await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 20))]);
});

test('CONFORMANCE-TIMEOUT-01 timeout/abort upstream resta un errore di abort', async () => {
  const runtime = createOpenAiCompatibleRuntime({
    fetchImpl: async (_url, options) => {
      await new Promise((resolve) => options.signal.addEventListener('abort', resolve, { once: true }));
      throw new DOMException('timeout', 'AbortError');
    },
  });
  const controller = new AbortController();
  const iterator = runtime.generateStream({ provider: 'ollama', modelId: 'gemma3', messages: [], signal: controller.signal });
  const pending = iterator.next();
  controller.abort();
  await assert.rejects(pending, (error) => error.name === 'AbortError');
});

test('CONFORMANCE-CONTEXT-01 contesto insufficiente degrada a chat-only', async () => {
  const probe = createLocalRuntimeProbe({
    runtime: {
      probe: async () => ({ default_generation_settings: { n_ctx: 32_768 }, chat_template: 'chat', backend: 'CPU', build: 'fixture' }),
      generateStream: async function* () { yield { type: 'done' }; },
    },
    // ⛔ 02/9 — forma REALE del manifest: `path` è la CARTELLA, il nome del
    // file sta in `files[0].path`. La vecchia fixture metteva il file dentro
    // `path` e nascondeva un difetto vero (vedi local-runtime-probe.test.mjs).
    modelStore: { inspect: async () => ({ id: 'model-1', state: 'ready', bytes: 1, path: 'model-1', files: [{ path: 'model.gguf', bytes: 1, sha256: 'c'.repeat(64) }] }) },
    readHeader: async () => ({ magic: 'GGUF', version: 3, trainedContext: 65_536, estimatedWorkingBytes: 1 }),
    measureMachine: async () => ({ storage: { allocatableBytes: 10 }, memory: { freeBytes: 10 } }),
  });
  const result = await probe.fit('model-1', { profile: 'agent', contextTokens: 65_536 });
  assert.equal(result.state, 'chat-only');
  assert.equal(result.reason, 'context');
});

test('SECURITY-LOOPBACK-01 binding pubblico è rifiutato', () => {
  assert.throws(() => loadConfig({ TALOS_HARNESS_UI_HOST: '0.0.0.0' }), ConfigurationError);
});

test('SECURITY-PATH-01 manifest con traversal è rifiutato dal catalogo locale', () => {
  const root = mkdtempSync(join(tmpdir(), 'talos-conformance-models-'));
  try {
    const store = createLocalModelStore({ rootDir: root });
    const manifest = {
      id: 'model-1', repo: 'org/model', revision: 'a'.repeat(40),
      files: [{ path: 'weights.gguf', bytes: 1, sha256: 'b'.repeat(64) }],
      bytes: 1, sha256: 'b'.repeat(64), license: 'MIT', path: '../escape.gguf', state: 'ready',
      updatedAt: OBSERVED_AT,
    };
    return assert.rejects(store.register(manifest), { code: 'MODEL_INVALID' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('SECURITY-NO-SECRETS-01 status e adapter non restituiscono api key o path assoluti', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true;
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: () => child,
    portAllocator: async () => 18084,
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  const status = await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  assert.equal(Object.hasOwn(status, 'apiKey'), false);
  assert.equal(Object.hasOwn(status, 'modelPath'), false);
  assert.equal(JSON.stringify(status).includes('C:\\models'), false);
});

test('SECURITY-ORPHAN-01 stop chiude il processo e rende il runtime unavailable', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kills = [];
  child.kill = (signal) => { child.kills.push(signal); child.emit('close', 0, signal); return true; };
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe', spawnImpl: () => child,
    portAllocator: async () => 18085, fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  await supervisor.stop();
  assert.deepEqual(child.kills, ['SIGTERM']);
  assert.equal(supervisor.status().state, 'unavailable');
});
