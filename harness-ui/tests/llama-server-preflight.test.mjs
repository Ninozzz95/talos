import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';

const modelPath = join(tmpdir(), 'talos-preflight-test-model.gguf');
const binaryPath = join(tmpdir(), 'talos-preflight-runtime', 'llama-server');
const options = { modelId: 'test-model', modelPath, contextLength: 4096 };
const help = '--spec-type none,ngram-mod';
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function childProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kills = [];
  child.kill = signal => { child.kills.push(signal); child.emit('close', 0, signal); return true; };
  return child;
}
function fixture(overrides = {}) {
  const calls = [], locks = [], children = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath, gpuLayers: 99, portAllocator: async () => 18080,
    pollIntervalMs: 1, healthTimeoutMs: 1_000,
    sondaBinario: (_exe, args) => args.includes('--help') ? help : '-c 4096 -ngl -1',
    spawnImpl: (...args) => { calls.push(args); const child = childProcess(); children.push(child); return child; },
    fetchImpl: async () => ({ ok: true, status: 200 }),
    modelStore: { lock: async id => { locks.push(['lock', id]); }, unlock: async id => { locks.push(['unlock', id]); } },
    ...overrides,
  });
  return { supervisor, calls, locks, children };
}
const rejectsCancelled = promise => assert.rejects(promise, e => e.code === 'RUNTIME_START_CANCELLED');
const rejectsActive = promise => assert.rejects(promise, e => e.code === 'RUNTIME_ALREADY_RUNNING');

test('legacy synchronous probe injection preserves the successful GPU launch configuration', async () => {
  const f = fixture();
  assert.equal((await f.supervisor.start(options)).state, 'ready');
  const args = f.calls[0][1];
  assert.ok(args.includes('ngram-mod'));
  assert.equal(args[args.indexOf('--cache-type-k') + 1], 'f16');
  assert.equal(args[args.indexOf('-c') + 1], '4096');
  assert.equal(args[args.indexOf('-ngl') + 1], '99');
  assert.equal(f.calls[0][2].shell, false);
  assert.equal(Object.hasOwn(f.supervisor.status(), 'apiKey'), false);
  await f.supervisor.stop();
  assert.deepEqual(f.locks, [['lock', 'test-model'], ['unlock', 'test-model']]);
});

test('async fit → alternate fit → help remain sequential and finish before server spawn', async () => {
  const gates = [deferred(), deferred(), deferred()];
  const probes = [];
  const f = fixture({ sondaBinario: (_exe, args) => { probes.push(args); return gates[probes.length - 1].promise; } });
  const starting = f.supervisor.start(options);
  await tick();
  assert.equal(probes.length, 1); assert.equal(f.calls.length, 0);
  assert.equal(f.supervisor.status().state, 'loading');
  assert.equal((await f.supervisor.health()).ok, false);
  gates[0].resolve('-c 4096 -ngl 12'); await tick();
  assert.equal(probes.length, 2); assert.ok(probes[1].includes('q8_0')); assert.equal(f.calls.length, 0);
  gates[1].resolve('-c 4096 -ngl -1'); await tick();
  assert.deepEqual(probes[2], ['--help']); assert.equal(f.calls.length, 0);
  gates[2].resolve(help); await starting;
  assert.equal(f.calls[0][1][f.calls[0][1].indexOf('--cache-type-k') + 1], 'q8_0');
  await f.supervisor.stop();
});

test('start reservation prevents concurrent starts while the port is being allocated', async () => {
  const port = deferred(); let allocations = 0;
  const f = fixture({ portAllocator: () => { allocations++; return port.promise; } });
  const starting = f.supervisor.start(options);
  await rejectsActive(f.supervisor.start(options));
  assert.equal(allocations, 1);
  port.resolve(18080); await starting;
  assert.equal(f.calls.length, 1); await f.supervisor.stop();
});

test('stop during lock acquisition drains the lock owner and releases exactly once', async () => {
  const lock = deferred(); const locks = [];
  const f = fixture({ modelStore: { lock: async id => { locks.push(['lock', id]); await lock.promise; }, unlock: async id => { locks.push(['unlock', id]); } } });
  const starting = f.supervisor.start(options); const rejected = rejectsCancelled(starting);
  await tick();
  const stopping = f.supervisor.stop();
  await rejectsActive(f.supervisor.start(options));
  lock.resolve(); await rejected; await stopping;
  assert.deepEqual(locks, [['lock', 'test-model'], ['unlock', 'test-model']]);
  assert.equal(f.calls.length, 0); assert.equal(f.supervisor.status().state, 'unavailable');
});

test('stop cancels an abort-aware probe and never spawns the server afterwards', async () => {
  let observedSignal;
  const f = fixture({ sondaBinario: (_exe, _args, _timeout, { signal }) => {
    observedSignal = signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  } });
  const rejected = rejectsCancelled(f.supervisor.start(options));
  await tick(); await f.supervisor.stop(); await rejected;
  assert.equal(observedSignal.aborted, true); assert.equal(f.calls.length, 0);
  assert.deepEqual(f.locks, [['lock', 'test-model'], ['unlock', 'test-model']]);
});

test('a late non-cooperative probe cannot resurrect a stopped operation or populate caches', async () => {
  const gate = deferred(); let probes = 0;
  const f = fixture({ gpuLayers: 0, sondaBinario: () => ++probes === 1 ? gate.promise : help });
  const rejected = rejectsCancelled(f.supervisor.start(options)); await tick();
  const stop1 = f.supervisor.stop(), stop2 = f.supervisor.stop();
  assert.equal(stop1, stop2);
  await rejectsActive(f.supervisor.start(options));
  gate.resolve(help); await rejected; await stop1;
  assert.equal(f.calls.length, 0);
  await f.supervisor.start(options);
  assert.equal(probes, 2, 'cancelled help was not cached');
  assert.equal(f.calls.length, 1);
  await f.supervisor.stop();
});

test('pre-aborted start allocates no port, locks no model and spawns nothing', async () => {
  const controller = new AbortController(); controller.abort(); let allocations = 0;
  const f = fixture({ portAllocator: async () => { allocations++; return 18080; } });
  await rejectsCancelled(f.supervisor.start({ ...options, signal: controller.signal }));
  assert.equal(allocations, 0); assert.equal(f.locks.length, 0); assert.equal(f.calls.length, 0);
  assert.equal(f.supervisor.status().state, 'unavailable');
});

test('stop while port allocation is pending cannot be followed by a late model lock', async () => {
  const gate = deferred(); const f = fixture({ portAllocator: () => gate.promise });
  const rejected = rejectsCancelled(f.supervisor.start(options));
  const stopped = f.supervisor.stop(); gate.resolve(18080);
  await stopped; await rejected;
  assert.equal(f.locks.length, 0); assert.equal(f.calls.length, 0);
});

test('external abort during preflight follows the same owned cleanup path', async () => {
  const controller = new AbortController(); const gate = deferred();
  const f = fixture({ sondaBinario: () => gate.promise });
  const rejected = rejectsCancelled(f.supervisor.start({ ...options, signal: controller.signal }));
  await tick(); controller.abort(); gate.resolve('-ngl -1'); await rejected;
  assert.equal(f.calls.length, 0); assert.equal(f.supervisor.status().state, 'unavailable');
  assert.deepEqual(f.locks, [['lock', 'test-model'], ['unlock', 'test-model']]);
});

test('a log listener may stop preflight without allowing a subsequent spawn', async () => {
  const f = fixture(); let stopping;
  f.supervisor.subscribeLogs(() => { stopping ??= f.supervisor.stop(); });
  await rejectsCancelled(f.supervisor.start(options)); await stopping;
  assert.equal(f.calls.length, 0);
});

test('stop while health is pending cannot publish a late ready state', async () => {
  const gate = deferred(); let signal;
  const f = fixture({ fetchImpl: async (_url, opts) => { signal = opts.signal; return gate.promise; } });
  const rejected = rejectsCancelled(f.supervisor.start(options)); await tick();
  const stopping = f.supervisor.stop();
  assert.equal(signal.aborted, true);
  gate.resolve({ ok: true, status: 200 }); await stopping; await rejected;
  assert.equal(f.supervisor.status().state, 'unavailable');
  assert.deepEqual(f.children[0].kills, ['SIGTERM']);
  assert.equal(f.locks.filter(([action]) => action === 'unlock').length, 1);
});

test('health polling observes cancellation rather than waiting the full interval', async () => {
  let fetched = 0;
  const f = fixture({ pollIntervalMs: 60_000, fetchImpl: async () => { fetched++; return { ok: false, status: 503 }; } });
  const rejected = rejectsCancelled(f.supervisor.start(options)); await tick();
  assert.equal(fetched, 1); await f.supervisor.stop(); await rejected;
  assert.equal(f.supervisor.status().state, 'unavailable');
});

test('hanging health request is bounded by the startup deadline when transport honors abort', async () => {
  const f = fixture({ healthTimeoutMs: 30, fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  // AbortSignal.timeout is unref'd; a real fetch keeps the process alive, unlike this fake.
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    await assert.rejects(f.supervisor.start(options), e => e.code === 'RUNTIME_HEALTH_TIMEOUT');
    assert.equal(f.supervisor.status().state, 'failed');
    assert.deepEqual(f.locks, [['lock', 'test-model'], ['unlock', 'test-model']]);
  } finally { clearInterval(keepAlive); }
});

test('async CPU startup probes only help and does not add GPU cache flags', async () => {
  const probes = [];
  const f = fixture({ gpuLayers: 0, sondaBinario: async (_exe, args) => { probes.push(args); return ''; } });
  await f.supervisor.start(options);
  assert.deepEqual(probes, [['--help']]);
  for (const flag of ['-ngl', '-fa', '--cache-type-k', '--cache-type-v', '--spec-type']) assert.equal(f.calls[0][1].includes(flag), false);
  await f.supervisor.stop();
});

test('speculative off avoids the help probe and successful fit observations are reused', async () => {
  const probes = [];
  const f = fixture({ speculativaNgram: 'off', sondaBinario: async (_exe, args) => { probes.push(args); return '-ngl -1'; } });
  await f.supervisor.start(options); await f.supervisor.stop();
  await f.supervisor.start(options); await f.supervisor.stop();
  assert.equal(probes.length, 1); assert.equal(probes[0].includes('--help'), false);
  assert.equal(f.calls[0][1].includes('--spec-type'), false);
});

test('probe failure releases ownership and a fresh start remains possible', async () => {
  let fail = true;
  const f = fixture({ sondaBinario: async () => { if (fail) throw new Error('probe rejected'); return help; } });
  await assert.rejects(f.supervisor.start(options), e => e.code === 'RUNTIME_PROCESS_FAILED');
  assert.equal(f.calls.length, 0); assert.equal(f.supervisor.status().state, 'failed');
  fail = false; await f.supervisor.start(options); await f.supervisor.stop();
  assert.equal(f.locks.filter(([action]) => action === 'lock').length, 2);
  assert.equal(f.locks.filter(([action]) => action === 'unlock').length, 2);
});

test('stop while unlock is pending blocks a fresh model lock and is idempotent', async () => {
  const gate = deferred(); let unlocks = 0;
  const f = fixture({ modelStore: { lock: async () => {}, unlock: async () => { unlocks++; await gate.promise; } } });
  await f.supervisor.start(options);
  const stopped = f.supervisor.stop(); await tick();
  assert.equal(f.supervisor.stop(), stopped);
  await rejectsActive(f.supervisor.start(options));
  gate.resolve(); await stopped; assert.equal(unlocks, 1);
});

test('late error from an older stopped child cannot mark the next runtime failed', async () => {
  const f = fixture(); await f.supervisor.start(options); await f.supervisor.stop();
  await f.supervisor.start(options);
  f.children[0].emit('error', new Error('old process late error'));
  assert.equal(f.supervisor.status().state, 'ready'); await f.supervisor.stop();
});

test('a failed ready process has its old model lock released before a fresh start', async () => {
  const f = fixture(); await f.supervisor.start(options);
  f.children[0].emit('close', 1, null);
  assert.equal(f.supervisor.status().state, 'failed');
  await f.supervisor.start({ ...options, modelId: 'next-model' }); await f.supervisor.stop();
  assert.deepEqual(f.locks, [['lock', 'test-model'], ['unlock', 'test-model'], ['lock', 'next-model'], ['unlock', 'next-model']]);
});

test('authenticated request contract is preserved and credentials stay out of status', async () => {
  const requests = []; const f = fixture({ fetchImpl: async (...args) => { requests.push(args); return { ok: true, status: 200 }; } });
  await f.supervisor.start(options);
  await f.supervisor.request('/props', { headers: { Authorization: 'wrong' } });
  assert.match(requests.at(-1)[1].headers.get('Authorization'), /^Bearer [a-f0-9]{64}$/);
  await assert.rejects(f.supervisor.request('https://example.invalid'), e => e.code === 'RUNTIME_INVALID');
  assert.equal(Object.hasOwn(f.supervisor.status(), 'apiKey'), false);
  await f.supervisor.stop();
});

for (const [signature, fallbackExpected, proposalExpected] of [
  ['ggml_vulkan: No devices found', true, false],
  ['vk::DeviceLostError', true, false],
  ['ErrorOutOfDeviceMemory', false, true],
  ['corrupt GGUF', false, false],
]) {
  test(`async preflight preserves Vulkan fallback policy: ${signature}`, async () => {
    const binaries = [], children = [], locks = [];
    const f = fixture({
      motore: { variante: 'vulkan', dispositivi: ['test'] },
      fallbackBinaryPath: join(tmpdir(), 'talos-preflight-cpu', 'llama-server'),
      sondaBinario: async (_exe, args) => args.includes('--help') ? '' : '-ngl -1',
      spawnImpl: (binary, args) => {
        binaries.push({ binary, args }); const child = childProcess(); children.push(child);
        if (children.length === 1) queueMicrotask(() => { child.stderr.emit('data', `${signature}\n`); child.emit('close', 1, null); });
        return child;
      },
      fetchImpl: async () => ({ ok: children.length > 1, status: children.length > 1 ? 200 : 503 }),
      modelStore: { lock: async id => locks.push(['lock', id]), unlock: async id => locks.push(['unlock', id]) },
    });
    if (fallbackExpected) {
      assert.equal((await f.supervisor.start(options)).motore.variante, 'cpu');
      assert.equal(binaries.length, 2);
      assert.equal(binaries[1].args[binaries[1].args.indexOf('-ngl') + 1], '0');
      assert.equal(binaries[1].args[binaries[1].args.indexOf('--device') + 1], 'none');
      assert.equal(binaries[1].args.includes('--cache-type-k'), false);
      await f.supervisor.stop();
    } else {
      await assert.rejects(f.supervisor.start(options), e => e.code === 'RUNTIME_PROCESS_FAILED');
      assert.equal(binaries.length, 1);
      assert.equal(Boolean(f.supervisor.status().motore.proposta), proposalExpected);
    }
    assert.deepEqual(locks, [['lock', 'test-model'], ['unlock', 'test-model']]);
  });
}

test('cancellation between GPU failure and fallback never starts the CPU binary', async () => {
  const binaries = [];
  const f = fixture({
    motore: { variante: 'vulkan', dispositivi: [] },
    fallbackBinaryPath: join(tmpdir(), 'cpu', 'llama-server'),
    spawnImpl: (binary) => {
      binaries.push(binary); const child = childProcess();
      queueMicrotask(() => { child.stderr.emit('data', 'ggml_vulkan: No devices found\n'); child.emit('close', 1, null); });
      return child;
    },
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  let stopped;
  f.supervisor.subscribeLogs(event => { if (event.ripiego) stopped = f.supervisor.stop(); });
  await rejectsCancelled(f.supervisor.start(options)); await stopped;
  assert.equal(binaries.length, 1);
  assert.equal(f.supervisor.status().state, 'unavailable');
  assert.equal(f.locks.filter(([action]) => action === 'unlock').length, 1);
});

test('repeated start/stop cycles do not leak model locks or late server spawns', async () => {
  const f = fixture({ sondaBinario: async (_exe, args) => args.includes('--help') ? help : '-ngl -1' });
  for (let i = 0; i < 100; i++) {
    await f.supervisor.start({ ...options, modelId: `model-${i}` });
    await Promise.all([f.supervisor.stop(), f.supervisor.stop()]);
    assert.equal(f.supervisor.status().state, 'unavailable');
  }
  assert.equal(f.calls.length, 100);
  assert.equal(f.locks.length, 200);
  for (const child of f.children) assert.deepEqual(child.kills, ['SIGTERM']);
});

test('observer exceptions never prevent the default probe from reaching a server launch', async () => {
  const f = fixture({ binaryPath: process.execPath, gpuLayers: 0, sondaBinario: null, onProbe: () => { throw new Error('diagnostics unavailable'); } });
  assert.equal((await f.supervisor.start(options)).state, 'ready');
  assert.equal(f.calls.length, 1);
  await f.supervisor.stop();
});
