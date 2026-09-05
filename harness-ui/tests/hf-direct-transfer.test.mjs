import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { createLocalModelStore } from '../src/local-model-store.mjs';
import { createHfDirectTransfer } from '../src/hf-direct-transfer.mjs';

const bytes = Buffer.from('GGUF-fixture');
const sha = createHash('sha256').update(bytes).digest('hex');

async function setup(t, fetchImpl) {
  const root = await mkdtemp(join(tmpdir(), 'talos-hf-direct-'));
  const store = createLocalModelStore({ rootDir: root });
  const hub = { resolveDownload: async () => ({ url: 'https://cdn-lfs.huggingface.co/model.gguf' }) };
  const transfer = createHfDirectTransfer({ rootDir: root, modelStore: store, hubClient: hub, fetchImpl });
  t.after(async () => {});
  return { root, store, transfer };
}

function manifest() { return { id: 'org-model', repo: 'org/model', revision: 'a'.repeat(40), files: [{ path: 'model.gguf', bytes: bytes.length, sha256: sha }], bytes: bytes.length, sha256: sha, license: 'apache-2.0', path: 'org-model', state: 'incomplete', updatedAt: new Date().toISOString() }; }

test('HF-DIRECT-01 scarica, verifica e pubblica ready', async (t) => {
  const { root, store, transfer } = await setup(t, async (_url, options = {}) => {
    const range = options.headers?.Range;
    const payload = range ? bytes.subarray(Number(range.match(/=(\d+)-/)[1])) : bytes;
    return { ok: true, status: range ? 206 : 200, body: ReadableStream.from([payload]), headers: new Headers({ 'content-length': String(payload.length) }) };
  });
  const result = await transfer.start(manifest());
  assert.equal(result.state, 'running');
  for (let i = 0; i < 20 && transfer.status('org-model').state !== 'ready'; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(transfer.status('org-model').state, 'ready');
  // 06/09 B6.10: la coda a schermo vuole file, repository e ora di fine, non l'id interno
  assert.equal(transfer.status('org-model').file, 'model.gguf');
  assert.equal(transfer.status('org-model').repo, 'org/model');
  assert.ok(Number.isFinite(Date.parse(transfer.status('org-model').finishedAt)), 'finishedAt è una data');
  assert.deepEqual(await readFile(join(root, 'org-model', 'model.gguf')), bytes);
  assert.equal((await store.inspect('org-model')).state, 'ready');
});

test('HF-DIRECT-SECURITY-01 rifiuta risposta CDN non HTTPS', async (t) => {
  const { transfer } = await setup(t, async () => ({ ok: true, status: 200, body: ReadableStream.from([bytes]) }));
  const request = manifest();
  const badStore = { inspect: async () => null, register: async () => ({}), setState: async () => ({}) };
  const bad = createHfDirectTransfer({ rootDir: 'C:\\tmp', modelStore: badStore, hubClient: { resolveDownload: async () => ({ url: 'http://evil.example/file' }) }, fetchImpl: async () => ({}) });
  await bad.start(request);
  for (let i = 0; i < 20 && !['failed', 'cancelled'].includes(bad.status(request.id)?.state); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(bad.status(request.id).reason, 'HF_REDIRECT_HOST_REJECTED');
  void transfer;
});

test('HF-DIRECT-CONTROLS-01 pausa e annullamento conservano lo stato terminale corretto', async (t) => {
  const { store, transfer } = await setup(t, async (_url, options = {}) => ({ ok: true, status: 200, body: new ReadableStream({ async start(controller) { controller.enqueue(bytes.subarray(0, 2)); await new Promise((resolve) => setTimeout(resolve, 30)); controller.enqueue(bytes.subarray(2)); controller.close(); } }), signal: options.signal }));
  await transfer.start(manifest());
  assert.equal(await transfer.pause('org-model'), true);
  assert.equal(transfer.status('org-model').state, 'paused');
  assert.equal((await transfer.resume('org-model')).state, 'running');
  assert.equal(await transfer.cancel('org-model'), true);
  assert.equal(transfer.status('org-model').state, 'cancelled');
  assert.equal(await store.inspect('org-model'), null);
});

test('HF-DIRECT-IMPORT-01 importa uno stream GGUF, verifica hash e pubblica atomicamente', async (t) => {
  const { root, store, transfer } = await setup(t, async () => ({ ok: true, status: 200, body: ReadableStream.from([bytes]) }));
  const result = await transfer.importStream(Readable.from([bytes]), { id: 'local-gguf', filename: 'qwen.gguf', name: 'Qwen locale', expectedBytes: bytes.length });
  assert.equal(result.state, 'ready');
  assert.equal(result.repo, 'local-upload');
  assert.equal(result.revision, sha);
  assert.equal((await store.inspect('local-gguf')).name, 'Qwen locale');
  assert.deepEqual(await readFile(join(root, 'local-gguf', 'qwen.gguf')), bytes);
});

test('HF-DIRECT-IMPORT-02 rifiuta file che non dichiarano il magic GGUF', async (t) => {
  const { store, transfer } = await setup(t, async () => ({ ok: true, status: 200, body: ReadableStream.from([bytes]) }));
  await assert.rejects(
    transfer.importStream(Readable.from([Buffer.from('NOTGUF')]), { id: 'not-gguf', filename: 'model.gguf', expectedBytes: 6 }),
    (error) => error.code === 'LOCAL_IMPORT_NOT_GGUF',
  );
  assert.equal(await store.inspect('not-gguf'), null);
});

test('HF-DIRECT-IMPORT-03 applica il limite di byte prima di pubblicare il manifest', async (t) => {
  const { store, root } = await setup(t, async () => ({ ok: true, status: 200, body: ReadableStream.from([bytes]) }));
  const limited = createHfDirectTransfer({ rootDir: root, modelStore: store, hubClient: { resolveDownload: async () => ({ url: 'https://cdn-lfs.huggingface.co/model.gguf' }) }, maxImportBytes: 4 });
  await assert.rejects(
    limited.importStream(Readable.from([bytes]), { id: 'too-large', filename: 'model.gguf', expectedBytes: bytes.length }),
    (error) => error.code === 'LOCAL_IMPORT_TOO_LARGE',
  );
  assert.equal(await store.inspect('too-large'), null);
});
