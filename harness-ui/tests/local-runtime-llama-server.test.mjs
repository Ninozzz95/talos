import assert from 'node:assert/strict';
import test from 'node:test';
import { createLlamaServerRuntime, LlamaServerRuntimeError } from '../src/local-runtime-llama-server.mjs';

function sseResponse(events, { status = 200, ok = true } = {}) {
  const encoder = new TextEncoder();
  const payload = events.map((event) => `data: ${event}\n\n`).join('') + 'data: [DONE]\n\n';
  return { ok, status, text: async () => 'upstream error', body: new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(payload.slice(0, 17))); controller.enqueue(encoder.encode(payload.slice(17))); controller.close(); } }) };
}

function supervisorFake() {
  return {
    status: () => ({ state: 'ready', runtimeId: 'llama.cpp', baseUrl: 'http://127.0.0.1:18080' }),
    health: async () => ({ ok: true, status: 200 }),
    start: async (options) => ({ state: 'ready', ...options, baseUrl: 'http://127.0.0.1:18080' }),
    stop: async () => ({ state: 'unavailable', runtimeId: 'llama.cpp' }),
  };
}

test('lists models and probes llama-server properties through the supervisor endpoint', async () => {
  const calls = [];
  const runtime = createLlamaServerRuntime({
    supervisor: supervisorFake(),
    fetchImpl: async (url) => {
      calls.push(url);
      return url.endsWith('/v1/models')
        ? { ok: true, status: 200, json: async () => ({ data: [{ id: 'model-1' }] }) }
        : { ok: true, status: 200, json: async () => ({ default_generation_settings: { n_ctx: 65536 }, chat_template: 'tool_use' }) };
    },
  });
  assert.deepEqual(await runtime.listModels(), [{ id: 'model-1' }]);
  assert.deepEqual(await runtime.probe(), { default_generation_settings: { n_ctx: 65536 }, chat_template: 'tool_use' });
  assert.deepEqual(calls, ['http://127.0.0.1:18080/v1/models', 'http://127.0.0.1:18080/props']);
});

test('converts SSE chunks into separate text, reasoning, tool_call and done events', async () => {
  const runtime = createLlamaServerRuntime({
    supervisor: supervisorFake(),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.stream, true);
      assert.equal(body.max_tokens, 512);
      return sseResponse([
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'plan' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'answer' } }] }),
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'library_search', arguments: '{"q":"x"}' } }] } }] }),
      ]);
    },
  });
  const events = [];
  for await (const event of runtime.generateStream({ runId: 'run-1', turnId: 'turn-1', modelId: 'model-1', messages: [{ role: 'user', content: 'hi' }] })) events.push(event);
  assert.deepEqual(events.map((event) => event.type), ['reasoning', 'text', 'tool_call', 'done']);
  assert.equal(events[0].value, 'plan');
  assert.equal(events[1].value, 'answer');
  assert.deepEqual(events[2], { runId: 'run-1', turnId: 'turn-1', runtimeId: 'llama.cpp', seq: 2, at: events[2].at, type: 'tool_call', id: 'call-1', name: 'library_search', arguments: '{"q":"x"}' });
});

test('does not emit raw think/tool markup as normal text', async () => {
  const runtime = createLlamaServerRuntime({
    supervisor: supervisorFake(),
    fetchImpl: async () => sseResponse([JSON.stringify({ choices: [{ delta: { content: '<think>secret</think>' } }] })]),
  });
  const events = [];
  for await (const event of runtime.generateStream({ runId: 'run-2', turnId: 'turn-2', modelId: 'model-1', messages: [] })) events.push(event);
  assert.equal(events.some((event) => event.type === 'text'), false);
  assert.deepEqual(events.filter((event) => event.type).map((event) => event.type), ['reasoning', 'done']);
  assert.equal(events.find((event) => event.type === 'reasoning')?.value, 'secret');
  assert.equal(events.some((event) => event.code === 'REASONING_MARKUP_LEAK'), false);
});

test('turns a non-2xx response into a typed runtime error', async () => {
  const runtime = createLlamaServerRuntime({ supervisor: supervisorFake(), fetchImpl: async () => ({ ok: false, status: 503, text: async () => 'loading' }) });
  await assert.rejects(async () => {
    for await (const _event of runtime.generateStream({ runId: 'run-3', turnId: 'turn-3', modelId: 'model-1', messages: [] })) { /* consume */ }
  }, (error) => error instanceof LlamaServerRuntimeError && error.code === 'RUNTIME_HTTP_ERROR');
});

test('load/unload delegate to the supervisor and abort is propagated', async () => {
  let started;
  const supervisor = supervisorFake();
  supervisor.start = async (options) => { started = options; return { state: 'ready', runtimeId: 'llama.cpp' }; };
  const runtime = createLlamaServerRuntime({ supervisor, fetchImpl: async () => { throw new DOMException('aborted', 'AbortError'); } });
  await runtime.load({ modelId: 'model-1', modelPath: 'C:\\models\\model.gguf', port: 18080 });
  assert.deepEqual(started, { modelId: 'model-1', modelPath: 'C:\\models\\model.gguf', port: 18080 });
  await runtime.unload();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(async () => {
    for await (const _event of runtime.generateStream({ runId: 'run-4', turnId: 'turn-4', modelId: 'model-1', messages: [], signal: controller.signal })) { /* consume */ }
  }, (error) => error.name === 'AbortError');
});
