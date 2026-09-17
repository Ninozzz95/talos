import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { createLocalKernelRunner, localKernelRequest } from '../src/local-kernel-session.mjs';

const props = { chat_template: 'native', chat_template_caps: { supports_tools: true, supports_tool_calls: true, supports_system_role: true } };
const request = () => ({ model: 'local:m', messages: [{ role: 'user', content: 'ciao' }], tools: [], tool_choice: 'auto', stream: true });

test('request normalization preserves canonical messages, schemas, sampler and caller budgets', () => {
  const input = { ...request(), max_tokens: 4096, seed: 9, temperature: 0.3, cache_prompt: false, reasoning: { effort: 'high' } };
  input.messages.unshift({ role: 'system', content: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral' } }] });
  const original = structuredClone(input);
  const output = localKernelRequest(input, 'm');
  assert.deepEqual(input, original);
  assert.equal(output.model, 'm');
  assert.equal(output.reasoning_effort, 'high');
  assert.equal(output.max_tokens, 4096);
  assert.equal(output.cache_prompt, false);
  assert.equal(output.temperature, 0.3);
  assert.equal(output.seed, 9);
  assert.deepEqual(output.tools, input.tools);
  assert.deepEqual(output.messages[0].content, [{ type: 'text', text: 'system' }]);
  assert.equal(localKernelRequest(request(), 'm').max_tokens, undefined);
});

for (const reasoning of [{ enabled: true }, { enabled: false, effort: 'high' }, { enabled: true, effort: 'none' }, { summary: 'auto' }, { effort: 12 }]) {
  test(`untranslatable reasoning is rejected instead of silently ignored: ${JSON.stringify(reasoning)}`, () => {
    assert.throws(() => localKernelRequest({ ...request(), reasoning }, 'm'), { code: 'LOCAL_KERNEL_REASONING_UNSUPPORTED' });
  });
}

test('mismatched inference destination and remote image URLs are rejected', () => {
  assert.throws(() => localKernelRequest({ ...request(), model: 'openai:remote' }, 'm'), { code: 'LOCAL_KERNEL_DESTINATION' });
  assert.throws(() => localKernelRequest({ ...request(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://remote/image.png' } }] }] }, 'm'), { code: 'LOCAL_KERNEL_IMAGE_UNRESOLVED' });
});

test('configuration is explicit, default-off, and rejects typo values', () => {
  assert.equal(loadConfig({}).localAgentKernel, false);
  assert.equal(loadConfig({ TALOS_LOCAL_AGENT_KERNEL: '0' }).localAgentKernel, false);
  assert.equal(loadConfig({ TALOS_LOCAL_AGENT_KERNEL: '1' }).localAgentKernel, true);
  assert.throws(() => loadConfig({ TALOS_LOCAL_AGENT_KERNEL: 'true' }));
});

function fakeBinding(caps = props) {
  let released = 0, called = 0;
  const controller = new AbortController();
  return {
    signal: controller.signal, assertReady() {},
    request: async () => { called++; return Response.json(caps); },
    release: () => { released++; },
    get released() { return released; }, get called() { return called; },
  };
}

test('unsupported native template does not invoke kernel and always releases binding', async () => {
  const binding = fakeBinding({ chat_template: 'x' });
  const run = createLocalKernelRunner({ getSupervisor: () => ({ bindModel: () => binding }), runSession: () => assert.fail('kernel must not run') });
  await assert.rejects(run({ runtimeId: 'llama.cpp', modelId: 'm' }), { code: 'LOCAL_KERNEL_TEMPLATE_UNSUPPORTED' });
  assert.equal(binding.released, 1);
});

for (const options of [{ fallbackConsent: true }, { fallbackProviders: [{ provider: 'openai', model: 'remote' }] }, { modelloPlanner: 'remote' }, { contextHooks: {} }]) {
  test(`incompatible session option fails before binding: ${JSON.stringify(options)}`, async () => {
    const run = createLocalKernelRunner({ getSupervisor: () => assert.fail('no binding'), runSession: () => assert.fail('no kernel') });
    await assert.rejects(run({ runtimeId: 'llama.cpp', modelId: 'm', ...options }), /locale|trial|planner|fallback/u);
  });
}

test('same run uses the bound transport and retains hooks/events; nested inference fails explicitly', async () => {
  const binding = fakeBinding(); let hook = false, eventOptions;
  const run = createLocalKernelRunner({
    getSupervisor: () => ({ bindModel: () => binding }),
    runSession: async input => {
      assert.equal(input.modello, 'local:m'); assert.equal(input.chiave, undefined);
      assert.deepEqual(await input.hookFn({ tipo: 'pre_tool_call' }), { consentito: false });
      await assert.rejects(input.onDelega({}), { code: 'LOCAL_KERNEL_NESTED_UNSUPPORTED' });
      await assert.rejects(input.onRicercaAvvia({}), { code: 'LOCAL_KERNEL_NESTED_UNSUPPORTED' });
      const result = input.onEvento({ type: 'RunStarted' }, { durable: true }); assert.equal(result, 123);
      await assert.rejects(input.localInference.fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', body: JSON.stringify({ ...request(), model: 'other' }) }), { code: 'LOCAL_KERNEL_DESTINATION' });
      return { ok: true };
    },
  });
  assert.deepEqual(await run({ runtimeId: 'llama.cpp', modelId: 'm', chiave: 'must-not-leak',
    hookFn: async () => { hook = true; return { consentito: false }; },
    onEvento: (e, options) => { assert.equal(e.provider, 'local'); eventOptions = options; return 123; },
  }), { ok: true });
  assert.equal(binding.called, 1); assert.equal(binding.released, 1);
  assert.equal(hook, true); assert.deepEqual(eventOptions, { durable: true });
});

async function boundSupervisor() {
  const children = [], wire = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath: process.execPath, portAllocator: async () => 19191, sondaBinario: () => null,
    spawnImpl: () => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
      child.kill = () => { child.emit('close', 0); return true; }; children.push(child); return child;
    },
    fetchImpl: async (url, init) => { wire.push({ url, init }); return Response.json({}); },
  });
  await supervisor.start({ modelId: 'm', modelPath: resolve('fixture.gguf') });
  return { supervisor, children, wire };
}

test('binding survives status reads but cannot cross stop/reload of the SAME alias and port', async t => {
  const { supervisor, wire } = await boundSupervisor(); t.after(() => supervisor.stop());
  assert.throws(() => supervisor.bindModel('other'), { code: 'LOCAL_KERNEL_MODEL_MISMATCH' });
  const binding = supervisor.bindModel('m');
  assert.deepEqual(Object.keys(binding).sort(), ['assertReady', 'modelId', 'release', 'request', 'signal']);
  await binding.request('/props', { headers: { Authorization: 'Bearer wrong' } });
  assert.match(wire.at(-1).init.headers.get('authorization'), /^Bearer [a-f0-9]{64}$/u);
  const firstToken = wire.at(-1).init.headers.get('authorization');
  await supervisor.stop(); assert.equal(binding.signal.aborted, true);
  await supervisor.start({ modelId: 'm', modelPath: resolve('fixture.gguf') });
  await assert.rejects(binding.request('/props'), { code: 'LOCAL_KERNEL_MODEL_CHANGED' });
  const next = supervisor.bindModel('m'); await next.request('/props');
  assert.notEqual(wire.at(-1).init.headers.get('authorization'), firstToken);
  next.release(); next.release();
  await assert.rejects(next.request('/props'), { code: 'LOCAL_KERNEL_BINDING_RELEASED' });
});

for (const event of ['close', 'error']) test(`binding aborts on process ${event}`, async t => {
  const { supervisor, children } = await boundSupervisor(); t.after(() => supervisor.stop());
  const binding = supervisor.bindModel('m');
  children[0].emit(event, event === 'error' ? new Error('failure') : 1);
  assert.equal(binding.signal.aborted, true);
  assert.throws(binding.assertReady, { code: 'LOCAL_KERNEL_MODEL_CHANGED' });
});

test('bound owner transport never consults a remote image capability catalog', async () => {
  const { createOwnerRuntimeAdapter } = await import('../src/runtime-owner-adapter.mjs');
  let lookedUp = 0, resolved = 0, sent = 0;
  const adapter = createOwnerRuntimeAdapter({
    modulePath: resolve('fixture-owner.mjs'),
    importFn: async () => ({ talosLavora: input => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', body: JSON.stringify({ model: 'local:m', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }] }] }),
    }) }),
    modelCapabilityFn: () => { lookedUp++; throw new Error('remote lookup must not happen'); },
    resolveImagesFn: async messages => { resolved++; return messages; },
  });
  await adapter.talosLavora({ modello: 'local:m', localInference: { fetch: async (_url, init) => {
    sent++; assert.equal(JSON.parse(init.body).model, 'local:m'); return Response.json({});
  } } });
  assert.equal(lookedUp, 0); assert.equal(resolved, 1); assert.equal(sent, 1);
});
