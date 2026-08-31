import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalRuntimeProbe } from '../src/local-runtime-probe.mjs';

const manifest = Object.freeze({
  id: 'qwen-local',
  path: 'models/qwen-local.gguf',
  bytes: 4_000,
  state: 'ready',
});

const header = Object.freeze({
  magic: 'GGUF',
  version: 3,
  trainedContext: 131_072,
  estimatedWorkingBytes: 8_000,
});

const capacity = Object.freeze({
  memory: { totalBytes: 32_000, freeBytes: 16_000 },
  storage: { allocatableBytes: 20_000 },
});

function makeProbe({
  props = {
    default_generation_settings: { n_ctx: 65_536 },
    chat_template: 'private template source',
    chat_template_caps: {
      supports_tools: false,
      supports_tool_calls: false,
      supports_system_role: true,
    },
  },
  headerValue = header,
  readHeader = async () => headerValue,
  machine = capacity,
  generateStream,
  metrics = async () => '',
  clockMs = () => 0,
} = {}) {
  let generations = 0;
  const runtime = {
    probe: async () => structuredClone(props),
    metrics,
    generateStream: generateStream ?? (async function* () {
      generations += 1;
      yield { type: 'text', value: 'ok' };
      yield { type: 'done' };
    }),
  };
  const probe = createLocalRuntimeProbe({
    runtime,
    modelStore: { inspect: async (id) => id === manifest.id ? structuredClone(manifest) : null },
    readHeader,
    measureMachine: async () => structuredClone(machine),
    now: () => new Date('2026-08-31T10:00:00.000Z'),
    clockMs,
  });
  return { probe, generations: () => generations };
}

test('LOCAL-RUNTIME-PROBE-GGUF-01 segnala un header illeggibile', async () => {
  const { probe } = makeProbe({ readHeader: async () => { throw new Error('disk failure'); } });
  await assert.rejects(probe.inspectModel(manifest.id), { code: 'MODEL_HEADER_UNREADABLE' });
});

test('LOCAL-RUNTIME-PROBE-GGUF-02 rifiuta magic, versione o misure GGUF invalidi', async () => {
  const { probe } = makeProbe({ headerValue: { ...header, version: 2 } });
  await assert.rejects(probe.inspectModel(manifest.id), { code: 'MODEL_HEADER_INVALID' });
});

test('LOCAL-RUNTIME-PROBE-CAPS-01 conserva capability false osservate senza esporre il template', async () => {
  const { probe } = makeProbe();
  const result = await probe.inspectModel(manifest.id);
  assert.deepEqual(result.capabilities, {
    tools: { state: 'observed', value: false },
    toolCalls: { state: 'observed', value: false },
    systemRole: { state: 'observed', value: true },
  });
  assert.deepEqual(result.template, { state: 'observed', value: true });
  assert.equal(JSON.stringify(result).includes('private template source'), false);
  assert.deepEqual(result.context, {
    trainedTokens: { state: 'declared', value: 131_072 },
    runtimeTokens: { state: 'observed', value: 65_536 },
    effectiveTokens: { state: 'observed', value: 65_536 },
  });
  const fit = await probe.fit(manifest.id);
  assert.equal(fit.state, 'chat-only');
  assert.equal(fit.reason, 'template');
});

test('LOCAL-RUNTIME-PROBE-CAPS-02 lascia unknown le capability non osservate', async () => {
  const { probe } = makeProbe({ props: { default_generation_settings: { n_ctx: 65_536 } } });
  const result = await probe.inspectModel(manifest.id);
  assert.deepEqual(result.capabilities, {
    tools: { state: 'unknown', value: null },
    toolCalls: { state: 'unknown', value: null },
    systemRole: { state: 'unknown', value: null },
  });
  assert.deepEqual(result.template, { state: 'unknown', value: null });
  const fit = await probe.fit(manifest.id);
  assert.equal(fit.state, 'unknown');
  assert.equal(fit.reason, 'capabilities');
});

test('LOCAL-RUNTIME-PROBE-CONTEXT-01 classifica chat-only un profilo agente sotto 65536 token', async () => {
  const { probe } = makeProbe({ props: { default_generation_settings: { n_ctx: 32_768 } } });
  const result = await probe.fit(manifest.id, { profile: 'agent', contextTokens: 65_536 });
  assert.equal(result.state, 'chat-only');
  assert.equal(result.reason, 'context');
  assert.equal(result.context.availableTokens, 32_768);
});

test('LOCAL-RUNTIME-PROBE-MEMORY-01 blocca prima storage e poi RAM insufficienti', async () => {
  const storage = makeProbe({ machine: { memory: { totalBytes: 32_000, freeBytes: 4_000 }, storage: { allocatableBytes: 3_999 } } });
  const storageFit = await storage.probe.fit(manifest.id);
  assert.equal(storageFit.state, 'blocked');
  assert.equal(storageFit.reason, 'storage');

  const memory = makeProbe({ machine: { memory: { totalBytes: 32_000, freeBytes: 7_999 }, storage: { allocatableBytes: 20_000 } } });
  const memoryFit = await memory.probe.fit(manifest.id);
  assert.equal(memoryFit.state, 'blocked');
  assert.equal(memoryFit.reason, 'memory');
});

test('LOCAL-RUNTIME-PROBE-BACKEND-01 non inventa backend o segnale termico assenti', async () => {
  const { probe } = makeProbe();
  assert.deepEqual(await probe.measureBackend(), {
    backend: { state: 'unknown', value: null },
    thermal: { state: 'unknown', value: null },
    observedAt: '2026-08-31T10:00:00.000Z',
  });
});

test('LOCAL-RUNTIME-PROBE-CONSENT-01 qualifica solo con consenso e misura TTFT e tok/s upstream', async () => {
  const ticks = [100, 350, 1_100];
  const { probe, generations } = makeProbe({
    props: {
      default_generation_settings: { n_ctx: 131_072 },
      chat_template: 'template',
      chat_template_caps: { supports_tools: true, supports_tool_calls: true, supports_system_role: true },
      backend: 'CUDA',
      build: 'llama.cpp-b1234',
    },
    metrics: async () => 'llamacpp:predicted_tokens_seconds 12.5\n',
    clockMs: () => ticks.shift(),
  });

  await assert.rejects(probe.qualify({ modelId: manifest.id, consent: false }), { code: 'PROBE_CONSENT_REQUIRED' });
  assert.equal(generations(), 0);

  const result = await probe.qualify({ modelId: manifest.id, consent: true });
  assert.equal(generations(), 1);
  assert.deepEqual(result.performance, {
    ttftMs: { state: 'observed', value: 250 },
    tokensPerSecond: { state: 'observed', value: 12.5 },
  });
  assert.deepEqual(result.backend, { state: 'observed', value: 'CUDA' });
  assert.deepEqual(result.build, { state: 'observed', value: 'llama.cpp-b1234' });
});
