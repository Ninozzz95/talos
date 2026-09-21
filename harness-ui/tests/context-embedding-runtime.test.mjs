import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContextEmbeddingRuntime } from '../src/context-embedding-runtime.mjs';

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'talos-context-embedding-')); t.after(() => rm(root, { recursive: true, force: true }));
  const modelPath = join(root, 'embedding.gguf'); const data = Buffer.from('GGUF fixture bytes, no model inference');
  await writeFile(modelPath, data);
  const spawns = []; const requests = []; const children = [];
  const processPolicy = { spawn(binary, args, options) {
    spawns.push({ binary, args, options }); const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', 0)); return true; }; children.push(child); return child;
  } };
  const options = { binaryPath: process.execPath, modelPath, modelSha256: createHash('sha256').update(data).digest('hex'), processPolicy, fetchFn: async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
    const input = JSON.parse(init.body).input;
    return { ok: true, json: async () => ({ data: input.map((_, index) => ({ index, embedding: Array(1024).fill(index + 1) })).reverse() }) };
  }, ...overrides };
  const runtime = createContextEmbeddingRuntime(options); t.after(() => runtime.close());
  return { runtime, options, spawns, requests, children, modelPath, root };
}

test('CTX-EMBEDDING-CPU uses explicit CPU loopback and preserves input order/dimensions', async t => {
  const { runtime, spawns, requests } = await fixture(t);
  const manifest = await runtime.ensureEmbeddingModel({ approved: false }); assert.equal(manifest.state, 'ready'); assert.equal(manifest.dimensions, 1024);
  const vectors = await runtime.embedContextBatch({ texts: ['alpha', 'beta'], kind: 'query' });
  assert.equal(vectors[0][0], 1); assert.equal(vectors[1][0], 2);
  const args = spawns[0].args; assert.equal(args[args.indexOf('--host') + 1], '127.0.0.1'); assert.equal(args[args.indexOf('-ngl') + 1], '0'); assert.equal(args[args.indexOf('--pooling') + 1], 'last'); assert.ok(args.includes('--embedding'));
  assert.equal(spawns[0].options.shell, false); assert.equal(spawns[0].options.windowsHide, true);
  const wire = JSON.parse(requests.find(r => r.url.endsWith('/v1/embeddings')).init.body);
  assert.equal(wire.encoding_format, 'float'); assert.match(wire.input[0], /^Instruct: .*\nQuery: alpha$/);
  await runtime.embedContextBatch({ texts: ['document'], kind: 'document' }); assert.equal(spawns.length, 1);
  assert.equal((await runtime.health()).ready, true);
});

test('CTX-EMBEDDING-APPROVAL never downloads automatically and pins guided download', async t => {
  const f = await fixture(t); await rm(f.modelPath); let download;
  const runtime = createContextEmbeddingRuntime({ ...f.options, downloadModel: async input => { download = input; return { state: 'downloading' }; } }); t.after(() => runtime.close());
  assert.equal((await runtime.ensureEmbeddingModel({ approved: false })).state, 'approval-required'); assert.equal(download, undefined);
  await assert.rejects(runtime.embedContextBatch({ texts: ['hi'], kind: 'document' }), { code: 'CTX_EMBEDDING_MODEL_REQUIRED' });
  assert.equal((await runtime.ensureEmbeddingModel({ approved: true })).state, 'downloading');
  assert.equal(download.repo, 'Qwen/Qwen3-Embedding-0.6B-GGUF'); assert.equal(download.revision, '370f27d7550e0def9b39c1f16d3fbaa13aa67728');
  assert.equal(download.sha256, '06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439'); assert.equal(download.bytes, 639150592);
});

test('CTX-EMBEDDING-HASH rejects changed weights before launch', async t => {
  const { runtime, modelPath, spawns } = await fixture(t); await writeFile(modelPath, 'tampered');
  await assert.rejects(runtime.ensureEmbeddingModel({ approved: false }), { code: 'CTX_EMBEDDING_HASH' }); assert.equal(spawns.length, 0);
});

test('CTX-EMBEDDING-RESPONSE rejects malformed, nonfinite, wrong dimensions and duplicate indexes', async t => {
  for (const data of [[{ index: 0, embedding: [1] }], [{ index: 0, embedding: Array(1024).fill(NaN) }], [{ index: 2, embedding: Array(1024).fill(1) }], [{ index: 0, embedding: 'base64' }]]) {
    const { runtime } = await fixture(t, { fetchFn: async url => ({ ok: true, json: async () => url.endsWith('/health') ? { status: 'ok' } : { data } }) });
    await assert.rejects(runtime.embedContextBatch({ texts: ['one'], kind: 'document' }), { code: 'CTX_EMBEDDING_RESPONSE' });
  }
  const { runtime } = await fixture(t, { fetchFn: async url => ({ ok: true, json: async () => url.endsWith('/health') ? { status: 'ok' } : { data: [{ index: 0, embedding: Array(1024).fill(1) }, { index: 0, embedding: Array(1024).fill(2) }] } }) });
  await assert.rejects(runtime.embedContextBatch({ texts: ['one', 'two'], kind: 'document' }), { code: 'CTX_EMBEDDING_RESPONSE' });
});

test('CTX-EMBEDDING-CANCEL and busy chat yield without inference, close kills only owned runtime', async t => {
  const busyPolicy = { isChatBusy: async () => true, spawn() { assert.fail('chat has priority'); } };
  const { runtime } = await fixture(t, { processPolicy: busyPolicy });
  await assert.rejects(runtime.embedContextBatch({ texts: ['hello'], kind: 'document' }), { code: 'CTX_EMBEDDING_BUSY' });
  const { runtime: active, children } = await fixture(t); const abort = new AbortController(); abort.abort();
  await assert.rejects(active.embedContextBatch({ texts: ['hi'], kind: 'document', signal: abort.signal }), { code: 'CTX_CANCELLED' });
  await active.embedContextBatch({ texts: ['hi'], kind: 'document' }); await active.close(); assert.equal(children[0].killed, true);
  await assert.rejects(active.embedContextBatch({ texts: ['hi'], kind: 'document' }), { code: 'CTX_EMBEDDING_CLOSED' });
});

test('CTX-EMBEDDING-SINGLE-FLIGHT fences concurrent callers across asynchronous chat policy', async t => {
  const f = await fixture(t); f.options.processPolicy.isChatBusy = async () => false;
  const results = await Promise.allSettled([f.runtime.embedContextBatch({ texts: ['first'], kind: 'document' }), f.runtime.embedContextBatch({ texts: ['second'], kind: 'document' })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'CTX_EMBEDDING_BUSY');
  assert.equal(f.spawns.length, 1);
});

test('CTX-EMBEDDING-ACTIVE-CANCEL aborts hung transport and terminates owned process', async t => {
  let started; const startedPromise = new Promise(resolve => { started = resolve; });
  const { runtime, children } = await fixture(t, { fetchFn: async (url, init) => {
    if (url.endsWith('/health')) return { ok: true, json: async () => ({ status: 'ok' }) };
    started(init.signal); return new Promise(() => {});
  } });
  const controller = new AbortController(); const operation = runtime.embedContextBatch({ texts: ['test'], kind: 'document', signal: controller.signal });
  const transportSignal = await startedPromise; controller.abort();
  await assert.rejects(operation, { code: 'CTX_CANCELLED' }); assert.equal(transportSignal.aborted, true); assert.equal(children[0].killed, true);
});

test('CTX-EMBEDDING-MALFORMED-JSON maps protocol failure to actionable response code', async t => {
  const { runtime } = await fixture(t, { fetchFn: async url => ({ ok: true, json: async () => { if (url.endsWith('/health')) return { status: 'ok' }; throw new SyntaxError('invalid JSON'); } }) });
  await assert.rejects(runtime.embedContextBatch({ texts: ['test'], kind: 'document' }), { code: 'CTX_EMBEDDING_RESPONSE' });
});

test('CTX-EMBEDDING-INPUT-LIMIT rejects invalid Unicode, oversized batches and passages before process', async t => {
  const { runtime, spawns } = await fixture(t);
  for (const texts of [['\ud800'], ['a'.repeat(8000)], Array(33).fill('text')]) {
    await assert.rejects(runtime.embedContextBatch({ texts, kind: 'document' }), { code: 'CTX_EMBEDDING_INVALID' });
  }
  assert.equal(spawns.length, 0);
});

test('CTX-EMBEDDING-SPARSE rejects holes in input and vector arrays', async t => {
  const { runtime, spawns } = await fixture(t, { fetchFn: async url => ({ ok: true, json: async () => url.endsWith('/health') ? { status: 'ok' } : { data: [{ index: 0, embedding: new Array(1024) }] } }) });
  await assert.rejects(runtime.embedContextBatch({ texts: new Array(1), kind: 'document' }), { code: 'CTX_EMBEDDING_INVALID' });
  assert.equal(spawns.length, 0);
  await assert.rejects(runtime.embedContextBatch({ texts: ['text'], kind: 'document' }), { code: 'CTX_EMBEDDING_RESPONSE' });
});

test('CTX-EMBEDDING-HEALTH-EXIT does not promote a process that exits during health probe', async t => {
  const f = await fixture(t);
  const runtime = createContextEmbeddingRuntime({ ...f.options, fetchFn: async () => { f.children.at(-1).emit('close', 1); return { ok: true, json: async () => ({ status: 'ok' }) }; } });
  t.after(() => runtime.close());
  await assert.rejects(runtime.embedContextBatch({ texts: ['text'], kind: 'document' }), { code: 'CTX_EMBEDDING_PROCESS' });
  assert.equal((await runtime.health()).ready, false);
});

test('CTX-EMBEDDING-CLOSE-WAIT waits for forced process exit before releasing model ownership', async t => {
  const signals = []; let exited = false; let unlocked = false;
  const f = await fixture(t);
  const runtime = createContextEmbeddingRuntime({ ...f.options, modelStore: {
    inspect: async () => ({ sha256: f.options.modelSha256, state: 'ready' }), lock: async () => {},
    unlock: async () => { assert.equal(exited, true); unlocked = true; },
  }, processPolicy: { spawn() {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = signal => { signals.push(signal); if (signal === 'SIGKILL') setTimeout(() => { exited = true; child.emit('close', 0); }, 20); return true; };
    return child;
  } } });
  t.after(() => runtime.close());
  await runtime.embedContextBatch({ texts: ['test'], kind: 'document' });
  await runtime.close(); assert.equal(exited, true); assert.equal(unlocked, true); assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});
