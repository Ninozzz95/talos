import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalModelStore, LocalModelStoreError } from '../src/local-model-store.mjs';

const valid = {
  id: 'lfm2-6b-q6',
  repo: 'LiquidAI/LFM2.5-2.6B-GGUF',
  revision: 'dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe',
  files: [{ path: 'LFM2.5-2.6B-Q6_K.gguf', bytes: 1024, sha256: 'a'.repeat(64) }],
  bytes: 1024,
  sha256: 'a'.repeat(64),
  license: 'apache-2.0',
  path: 'lfm2-6b-q6/LFM2.5-2.6B-Q6_K.gguf',
  state: 'ready',
  updatedAt: '2026-08-30T12:00:00.000Z',
};

async function withStore(run, options = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), 'talos-model-store-'));
  try {
    await run(createLocalModelStore({ rootDir, ...options }), rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test('register and inspect persist a validated manifest atomically', async () => {
  await withStore(async (store) => {
    assert.deepEqual(await store.register(valid), valid);
    assert.deepEqual(await store.inspect(valid.id), valid);
  });
});

test('rejects traversal, absolute paths, short revisions, invalid hashes and unknown fields', async () => {
  await withStore(async (store) => {
    await assert.rejects(store.register({ ...valid, path: '../outside.gguf' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, path: 'C:\\models\\model.gguf' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, revision: 'short' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, sha256: 'invalid' }), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.register({ ...valid, prompt: 'secret' }), (error) => error.code === 'MODEL_INVALID');
  });
});

test('rejects an id collision instead of overwriting the existing manifest', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    await assert.rejects(store.register({ ...valid, license: 'mit' }), (error) => error.code === 'MODEL_EXISTS');
    assert.equal((await store.inspect(valid.id)).license, valid.license);
  });
});

test('allows one lock, rejects a second lock, and releases it explicitly', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    assert.equal(await store.lock(valid.id), true);
    await assert.rejects(store.lock(valid.id), (error) => error.code === 'MODEL_LOCKED');
    assert.equal(await store.unlock(valid.id), true);
    assert.equal(await store.lock(valid.id), true);
  });
});

test('does not publish a manifest when the atomic rename fails', async () => {
  await withStore(async (_unused, rootDir) => {
    const store = createLocalModelStore({
      rootDir,
      fsImpl: { rename: async () => { throw new Error('disk full'); } },
    });
    await assert.rejects(store.register(valid), (error) => error instanceof LocalModelStoreError && error.code === 'MODEL_WRITE_FAILED');
    assert.equal(await store.inspect(valid.id), null);
  });
});

test('MODEL-STORE-STATE-01 aggiorna lo stato del manifest con rename atomico', async () => {
  await withStore(async (store, rootDir) => {
    await store.register({ ...valid, state: 'incomplete' });
    const updated = await store.setState(valid.id, 'ready');
    assert.equal(updated.state, 'ready');
    assert.equal((await store.inspect(valid.id)).state, 'ready');
    const files = await readdir(join(rootDir, 'manifests'));
    assert.deepEqual(files, [`${valid.id}.json`]);
  });
});

test('MODEL-STORE-LIST-01 elenca solo manifest validi, ordinati per id', async () => {
  await withStore(async (store) => {
    await store.register({ ...valid, id: 'z-model' });
    await store.register({ ...valid, id: 'a-model' });
    assert.deepEqual((await store.list()).map(({ id }) => id), ['a-model', 'z-model']);
  });
});

test('MODEL-STORE-RENAME-01 rinomina il nome visualizzato senza cambiare id o percorso', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    const renamed = await store.rename(valid.id, 'Modello cucina');
    assert.equal(renamed.id, valid.id);
    assert.equal(renamed.name, 'Modello cucina');
    assert.equal(renamed.path, valid.path);
    assert.equal((await store.inspect(valid.id)).name, 'Modello cucina');
  });
});

test('MODEL-STORE-RENAME-02 rifiuta nomi vuoti o troppo lunghi', async () => {
  await withStore(async (store) => {
    await store.register(valid);
    await assert.rejects(store.rename(valid.id, ''), (error) => error.code === 'MODEL_INVALID');
    await assert.rejects(store.rename(valid.id, 'x'.repeat(161)), (error) => error.code === 'MODEL_INVALID');
  });
});
