import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';

function childProcess() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kills = [];
  child.kill = (signal) => {
    child.kills.push(signal);
    child.emit('close', 0, signal);
    return true;
  };
  return child;
}

test('starts llama-server on loopback without shell and reaches ready after health 503→200', async () => {
  const child = childProcess();
  let spawnCall;
  const healthStatuses = [503, 200];
  const logs = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async (_url, options) => {
      assert.match(options.headers.Authorization, /^Bearer [a-f0-9]{64}$/);
      return { status: healthStatuses.shift(), ok: healthStatuses.length === 0 };
    },
    portAllocator: async () => 18080,
    pollIntervalMs: 1,
  });
  supervisor.subscribeLogs((entry) => logs.push(entry));
  const status = await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });

  assert.equal(status.state, 'ready');
  assert.deepEqual(spawnCall[1], ['-m', 'C:\\models\\model.gguf', '--host', '127.0.0.1', '--port', '18080', '--api-key', spawnCall[1][7], '--jinja', '--metrics', '--props']);
  assert.equal(spawnCall[2].shell, false);
  assert.deepEqual(spawnCall[2].stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(Object.hasOwn(status, 'apiKey'), false);
  assert.equal(Object.hasOwn(status, 'modelPath'), false);

  child.stderr.emit('data', Buffer.from('ready\n'));
  assert.deepEqual(logs, [{ stream: 'stderr', text: 'ready\n' }]);
});

test('health reports a controlled unreachable state instead of throwing', async () => {
  const supervisor = createLlamaServerSupervisor({ binaryPath: 'llama-server.exe', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.deepEqual(await supervisor.health(), { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' });
});

test('exposes only an authenticated relative-path transport to the runtime adapter', async () => {
  const child = childProcess();
  const requests = [];
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe',
    spawnImpl: () => child,
    portAllocator: async () => 18084,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { status: 200, ok: true, json: async () => ({ data: [] }) };
    },
  });
  await supervisor.start({ modelId: 'model-1', modelPath: 'C:\\models\\model.gguf' });
  const response = await supervisor.request('/v1/models');
  assert.equal(response.ok, true);
  assert.equal(requests.at(-1).url, 'http://127.0.0.1:18084/v1/models');
  assert.match(requests.at(-1).options.headers.get('Authorization'), /^Bearer [a-f0-9]{64}$/);
  await assert.rejects(supervisor.request('https://evil.example/steal'), (error) => error.code === 'RUNTIME_INVALID');
  assert.equal(Object.hasOwn(supervisor.status(), 'apiKey'), false);
});

test('process error transitions to failed and rejects start', async () => {
  const child = childProcess();
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe',
    spawnImpl: () => { setTimeout(() => child.emit('error', new Error('ENOENT')), 0); return child; },
    portAllocator: async () => 18081,
    fetchImpl: async () => ({ status: 503, ok: false }),
    pollIntervalMs: 1,
    healthTimeoutMs: 20,
  });
  await assert.rejects(supervisor.start({ modelPath: 'C:\\models\\model.gguf' }), (error) => error.code === 'RUNTIME_PROCESS_FAILED');
  assert.equal(supervisor.status().state, 'failed');
});

test('stop kills the process, is idempotent, and clears the runtime', async () => {
  const child = childProcess();
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'llama-server.exe',
    spawnImpl: () => child,
    portAllocator: async () => 18082,
    fetchImpl: async () => ({ status: 200, ok: true }),
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  await supervisor.stop();
  await supervisor.stop();
  assert.deepEqual(child.kills, ['SIGTERM']);
  assert.equal(supervisor.status().state, 'unavailable');
});

test('rejects a relative model path before spawning anything', async () => {
  let spawned = false;
  const supervisor = createLlamaServerSupervisor({ binaryPath: 'llama-server.exe', spawnImpl: () => { spawned = true; return childProcess(); } });
  await assert.rejects(supervisor.start({ modelPath: 'models/model.gguf', port: 18083 }), (error) => error.code === 'RUNTIME_INVALID');
  assert.equal(spawned, false);
});
