import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';

import { createHfModelTransfer } from '../src/hf-model-transfer.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const revision = 'a'.repeat(40);
const bytes = Buffer.from('GGUF-test-model');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const request = Object.freeze({
  id: 'qwen-local',
  repo: 'org/qwen-gguf',
  revision,
  files: [{ path: 'model.gguf', bytes: bytes.length, sha256 }],
  bytes: bytes.length,
  sha256,
  license: 'apache-2.0',
  path: 'models/qwen-local',
});

class FakeChild extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.kills = [];
  }
  kill(signal = 'SIGTERM') { this.kills.push(signal); return true; }
}

function memoryStore() {
  const manifests = new Map();
  return {
    async inspect(id) { return manifests.has(id) ? structuredClone(manifests.get(id)) : null; },
    async register(value) { manifests.set(value.id, structuredClone(value)); return structuredClone(value); },
    async setState(id, state) {
      const value = manifests.get(id);
      if (!value) throw Object.assign(new Error('missing'), { code: 'MODEL_NOT_FOUND' });
      value.state = state;
      value.updatedAt = '2026-08-31T12:00:00.000Z';
      return structuredClone(value);
    },
  };
}

async function withTransfer(t, options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'talos-hf-transfer-'));
  t.after(() => rimuoviCartellaDiProvaAttesa(rootDir));
  const children = [];
  const calls = [];
  const spawnImpl = options.spawnImpl ?? ((command, args, spawnOptions) => {
    const child = new FakeChild();
    children.push(child);
    calls.push({ command, args, options: spawnOptions });
    return child;
  });
  const store = options.modelStore ?? memoryStore();
  const transfer = createHfModelTransfer({
    hfExecutable: options.hfExecutable ?? 'hf',
    spawnImpl,
    modelStore: store,
    rootDir,
    allowedRepositories: ['org/qwen-gguf'],
    now: () => new Date('2026-08-31T12:00:00.000Z'),
  });
  return { transfer, rootDir, store, children, calls };
}

test('HF-TRANSFER-REVISION-01 rifiuta revision corta e repository fuori allowlist', async (t) => {
  const { transfer } = await withTransfer(t);
  await assert.rejects(transfer.inspect({ ...request, revision: 'main' }), { code: 'HF_TRANSFER_INVALID' });
  await assert.rejects(transfer.inspect({ ...request, repo: 'other/model' }), { code: 'HF_REPOSITORY_NOT_ALLOWED' });
});

test('HF-TRANSFER-CLI-01 espone gated quando il CLI non esiste', async (t) => {
  const { transfer } = await withTransfer(t, {
    spawnImpl: () => {
      const child = new FakeChild();
      queueMicrotask(() => child.emit('error', Object.assign(new Error('missing'), { code: 'ENOENT' })));
      return child;
    },
  });
  assert.deepEqual(await transfer.inspect(request), { state: 'gated', reason: 'HF_CLI_MISSING' });
});

test('HF-TRANSFER-SPAWN-01 usa argv separati, shell false e registra incomplete', async (t) => {
  const { transfer, store, children, calls, rootDir } = await withTransfer(t);
  const started = await transfer.start(request);
  assert.equal(started.state, 'running');
  assert.equal((await store.inspect(request.id)).state, 'incomplete');
  assert.equal(calls[0].command, 'hf');
  assert.equal(calls[0].options.shell, false);
  assert.deepEqual(calls[0].args, [
    'download', request.repo, '--revision', revision, '--include', 'model.gguf',
    '--local-dir', join(rootDir, request.path), '--quiet',
  ]);
  children[0].emit('close', 0, null);
});

test('HF-TRANSFER-PROGRESS-01 il progresso osservato non può diminuire', async (t) => {
  const { transfer, children } = await withTransfer(t);
  await transfer.start(request);
  children[0].stderr.emit('data', Buffer.from('progress 60%\nprogress 30%\nprogress 80%\n'));
  assert.equal(transfer.status(request.id).progress, 80);
  children[0].emit('close', 0, null);
});

test('HF-TRANSFER-RESUME-01 pausa e riprende la stessa revisione senza registrare un nuovo manifest', async (t) => {
  const store = memoryStore();
  let registrations = 0;
  const register = store.register;
  store.register = async (value) => { registrations += 1; return register(value); };
  const { transfer, children, calls } = await withTransfer(t, { modelStore: store });
  await transfer.start(request);
  assert.equal(await transfer.pause(request.id), true);
  assert.deepEqual(children[0].kills, ['SIGTERM']);
  children[0].emit('close', null, 'SIGTERM');
  await transfer.resume(request.id);
  assert.equal(registrations, 1);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].args, calls[0].args);
  children[1].emit('close', 0, null);
});

test('HF-TRANSFER-CHECKSUM-01 un hash errato non pubblica ready', async (t) => {
  const { transfer, rootDir, store } = await withTransfer(t);
  await store.register({ ...request, state: 'incomplete', updatedAt: '2026-08-31T12:00:00.000Z' });
  await mkdir(join(rootDir, request.path), { recursive: true });
  await writeFile(join(rootDir, request.path, 'model.gguf'), 'wrong');
  await assert.rejects(transfer.verify(request.id), { code: 'CHECKSUM_MISMATCH' });
  assert.equal((await store.inspect(request.id)).state, 'incomplete');
});

test('HF-TRANSFER-CANCEL-01 cancella il processo e mantiene incomplete', async (t) => {
  const { transfer, children, store } = await withTransfer(t);
  await transfer.start(request);
  assert.equal(await transfer.cancel(request.id), true);
  assert.deepEqual(children[0].kills, ['SIGTERM']);
  children[0].emit('close', null, 'SIGTERM');
  assert.equal(transfer.status(request.id).state, 'cancelled');
  assert.equal((await store.inspect(request.id)).state, 'incomplete');
});

test('HF-TRANSFER-OFFLINE-01 importa e verifica un GGUF locale senza CLI', async (t) => {
  const { transfer, rootDir, store, calls } = await withTransfer(t);
  const source = join(rootDir, 'source.gguf');
  await writeFile(source, bytes);
  const result = await transfer.importLocal(request, source);
  assert.equal(result.state, 'ready');
  assert.equal((await store.inspect(request.id)).state, 'ready');
  assert.deepEqual(await readFile(join(rootDir, request.path, 'model.gguf')), bytes);
  assert.equal(calls.length, 0);
});
