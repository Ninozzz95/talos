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

/*
 * ⭐⭐⭐ 3/9 — flash-attention + KV cache quantizzata: MISURATO su AMD RX
 * 9070 XT (Vulkan), stesso modello stesso prompt, +15% generazione +408%
 * elaborazione prompt contro la riga precedente (solo -ngl). Zero
 * differenza di correttezza fra le due righe — verificato prima di
 * fidarsi del numero. Simmetrici (q8_0/q8_0): solo la coppia simmetrica
 * usa il kernel fuso veloce secondo la ricerca (ggml-org/llama.cpp
 * discussions #22411).
 */
test('con un backend GPU attivo aggiunge flash-attention e KV cache quantizzata simmetrica, non solo -ngl', async () => {
  const child = childProcess();
  let spawnCall;
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18081,
    pollIntervalMs: 1,
    gpuLayers: 99,
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  const argv = spawnCall[1];
  assert.deepEqual(argv, [
    '-m', 'C:\\models\\model.gguf', '--host', '127.0.0.1', '--port', '18081', '--api-key', argv[7],
    // ⛔⛔⛔ 03/9 — QUESTA PROVA È PASSATA PER 'auto' NELLO STESSO GIORNO, a
    // metà mattina: un modello giocattolo che ci sta comunque in VRAM aveva
    // nascosto che un 27B vero (16,46 GB contro 16,3 GB di scheda) con
    // '-ngl 99' esplicito forza un overflow muto verso la memoria condivisa
    // di Windows — 13,28 tok/s invece dei 62 possibili. La cura sembrava
    // ovvia: 'auto' come fa LM Studio (owner: "bisogna usare la RAM e la
    // VRAM come fa LM Studio"), lasciare decidere al fitter del binario.
    // ⇒ MISURATA e SMENTITA lo stesso pomeriggio: banco A/B pulito,
    // 'auto' 11,12 tok/s / 191,3 prompt tok/s contro 13,28 / 262,3 di '99'
    // esplicito, più un avviso "GDN mismatch" che '99' non genera — vedi
    // llama-server-supervisor.mjs per i numeri e la fonte esterna che li
    // corrobora. Si torna a '99': l'ipotesi era ragionevole, la misura ha
    // vinto sull'ipotesi, come vuole la regola del progetto.
    '-ngl', '99',
    '-fa', '1', '--cache-type-k', 'q8_0', '--cache-type-v', 'q8_0',
    '--jinja', '--metrics', '--props',
  ]);
});

/* ⛔ AL CONTRARIO, esplicito: senza backend GPU (gpuLayers assente/0, come nel primo test sopra) né -ngl né questi due flag compaiono — una build CPU-only non deve MAI ricevere una richiesta di quantizzare una KV cache che non passa mai dalla GPU. */
test('AL CONTRARIO: senza gpuLayers, nessuno dei flag GPU-only compare — non solo -ngl', async () => {
  const child = childProcess();
  let spawnCall;
  const supervisor = createLlamaServerSupervisor({
    binaryPath: 'C:\\talos\\llama-server.exe',
    spawnImpl: (...args) => { spawnCall = args; return child; },
    fetchImpl: async () => ({ status: 200, ok: true }),
    portAllocator: async () => 18082,
    pollIntervalMs: 1,
  });
  await supervisor.start({ modelPath: 'C:\\models\\model.gguf' });
  const argv = spawnCall[1];
  assert.equal(argv.includes('-ngl'), false);
  assert.equal(argv.includes('-fa'), false);
  assert.equal(argv.includes('--cache-type-k'), false);
  assert.equal(argv.includes('--cache-type-v'), false);
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
