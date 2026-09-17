import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { createLocalResumeDiagnostics, createResumeRecorder, createBoundedResumeSink, RESUME_LIMITS } from '../src/local-resume-diagnostics.mjs';
import { createLlamaServerRuntime } from '../src/local-runtime-llama-server.mjs';
import { createLlamaServerSupervisor } from '../src/llama-server-supervisor.mjs';
import { buildResumeReport } from '../scripts/report-local-resume.mjs';
const enc = new TextEncoder();
const raw = 'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n';
const response = () => new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(raw)); c.close(); } }), { headers: { 'content-type': 'text/event-stream' } });
function memory() { const records = [], files = new Map(); return { records, files, record: r => { records.push(r); return true; }, privateRequest: (id, body) => { files.set(id, body); return true; }, flush: async () => ({ errors: 0, dropped: 0 }) }; }
function fakeSupervisor(fn = async () => response()) { return { status: () => ({ state: 'ready', modelId: 'm' }), request: fn, start: async () => ({ state: 'ready' }), stop: async () => ({ state: 'unavailable' }) }; }
function harness({ captureRaw = false, selected = 's', limits } = {}) {
  const sink = memory(), diag = createResumeRecorder({ sink, sessionId: selected, captureRaw, ...(limits ? { limits } : {}) });
  let pending;
  const supervisor = diag.wrapSupervisor(fakeSupervisor());
  const registry = diag.wrapRegistry({ resume(id, body) { pending = Promise.resolve().then(async () => { const r = await diag.withRoute('owner-transport', () => supervisor.request('/v1/chat/completions', { method: 'POST', body })); return r.text(); }); return { sessionId: id }; } });
  return { sink, diag, registry, supervisor, get pending() { return pending; } };
}

test('disabled diagnostics returns original objects/functions with no filesystem activity', async () => {
  const d = await createLocalResumeDiagnostics({ env: {} }); const x = {};
  assert.equal(d.enabled, false); for (const method of ['registryOptions','wrapRegistry','supervisorOptions','wrapSupervisor','wrapRuntime']) assert.equal(d[method](x), x);
  assert.equal(d.withRoute('owner-transport', () => x), x);
});

test('invalid opt-in directory fails back to unchanged inference, with a generic warning', async () => {
  const warnings = []; const d = await createLocalResumeDiagnostics({ env: { TALOS_RESUME_DIAGNOSTICS_DIR: 'relative' }, warn: x => warnings.push(x) });
  assert.equal(d.enabled, false); assert.equal(warnings.length, 1);
});

test('resume returns synchronously and records exact body privately only after explicit selection', async () => {
  const h = harness({ captureRaw: true });
  const body = '{ "model": "m", "messages": [{"role":"user","content":"SECRET"}], "tools": [] }';
  assert.deepEqual(h.registry.resume('s', body), { sessionId: 's' }); assert.equal(await h.pending, raw);
  assert.equal(h.sink.files.size, 1); assert.equal([...h.sink.files.values()][0], body);
  const start = h.sink.records.find(e => e.type === 'request-start'); assert.equal(start.entry, 'resume'); assert.equal(start.route, 'owner-transport');
  assert.match(start.sessionKey, /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(h.sink.records).includes('SECRET'));
  assert.equal(start.snapshot.controls.cache_prompt, null);
});

test('non-selected sessions and auxiliary endpoints never persist request content', async () => {
  const h = harness({ captureRaw: true }); h.registry.resume('other', JSON.stringify({ model: 'm', messages: [{ content: 'SECRET' }] })); await h.pending;
  await (await h.supervisor.request('/tokenize', { body: '{"content":"SECRET"}' })).text();
  assert.equal(h.sink.files.size, 0); assert.ok(!JSON.stringify(h.sink.records).includes('SECRET'));
});

test('metadata-only mode compares selected prompts without any private file', async () => {
  const h = harness();
  h.registry.resume('s', JSON.stringify({ model: 'm', messages: [{ role: 'system', content: 'secret1' }] })); await h.pending;
  h.registry.resume('s', JSON.stringify({ model: 'm', messages: [{ role: 'system', content: 'secret2' }] })); await h.pending;
  const start = h.sink.records.filter(e => e.type === 'request-start').at(-1);
  assert.equal(start.snapshot.prefix.firstChangedMessage.index, 0); assert.equal(start.snapshot.prefix.commonPromptTokens, null);
  assert.equal(h.sink.files.size, 0); assert.ok(!JSON.stringify(h.sink.records).includes('secret1'));
});

test('request headers, abort signal, body and return error object are untouched', async () => {
  const sink = memory(), d = createResumeRecorder({ sink }); const controller = new AbortController();
  const options = { body: '{}', headers: new Headers({ Authorization: 'secret-key' }), signal: controller.signal };
  const failure = new Error('secret-error'); let received;
  const s = d.wrapSupervisor(fakeSupervisor(async (_path, o) => { received = o; throw failure; }));
  await assert.rejects(s.request('/v1/chat/completions', options), e => e === failure); assert.equal(received, options);
  assert.ok(!JSON.stringify(sink.records).includes('secret-key')); assert.ok(!JSON.stringify(sink.records).includes('secret-error'));
});

test('concurrent resumes retain distinct operation IDs and session keys', async () => {
  const sink = memory(), d = createResumeRecorder({ sink }); const waits = [], completed = [];
  const sup = d.wrapSupervisor(fakeSupervisor(async () => { await new Promise(r => waits.push(r)); return response(); }));
  const registry = d.wrapRegistry({ resume(id) { completed.push(Promise.resolve().then(async () => (await d.withRoute('owner-transport', () => sup.request('/v1/chat/completions', { body: '{"model":"m"}' }))).text())); return { sessionId: id }; } });
  registry.resume('a'); registry.resume('b'); await new Promise(r => setImmediate(r)); waits.reverse().forEach(r => r()); await Promise.all(completed);
  const starts = sink.records.filter(e => e.type === 'request-start'); const ends = sink.records.filter(e => e.type === 'request-end');
  assert.notEqual(starts[0].operationId, starts[1].operationId); assert.notEqual(starts[0].sessionKey, starts[1].sessionKey);
  for (const start of starts) assert.equal(ends.find(e => e.requestId === start.requestId).sessionKey, start.sessionKey);
});

test('real runtime adapter uses its own origin and retains text/reasoning/tagged-tool behavior', async () => {
  const sink = memory(), d = createResumeRecorder({ sink });
  const chunks = [{ choices: [{ delta: { content: '<think>piano</think>testo<tool_call>{"name":"read","arguments":{}}</tool_call>' } }] }];
  const payload = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n';
  const s = d.wrapSupervisor(fakeSupervisor(async () => new Response(payload, { headers: { 'content-type': 'text/event-stream' } })));
  const runtime = d.wrapRuntime(createLlamaServerRuntime({ supervisor: s }));
  const out = []; for await (const e of runtime.generateStream({ runId: 'r', turnId: 't', modelId: 'm', messages: [] })) out.push(e);
  assert.deepEqual(out.map(e => e.type), ['reasoning', 'text', 'tool_call', 'done']);
  assert.equal(sink.records.find(e => e.type === 'request-start').route, 'llama-adapter');
});

test('early generator return closes underlying iterator', async () => {
  let closed = false; const d = createResumeRecorder({ sink: memory() });
  const runtime = d.wrapRuntime({ async *generateStream() { try { yield 1; yield 2; } finally { closed = true; } } });
  for await (const e of runtime.generateStream()) { assert.equal(e, 1); break; }
  assert.equal(closed, true);
});

test('real supervisor receives identical launch args; process closure is distinct from stop', async () => {
  const sink = memory(), d = createResumeRecorder({ sink }); const calls = [];
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.pid = 456;
  child.kill = signal => { child.emit('close', 0, signal); return true; };
  const supervisor = d.wrapSupervisor(createLlamaServerSupervisor(d.supervisorOptions({
    binaryPath: process.execPath, spawnImpl: (...args) => { calls.push(args); return child; },
    sondaBinario: () => null, fetchImpl: async () => ({ ok: true, status: 200 }), portAllocator: async () => 19999,
  })));
  await supervisor.start({ modelId: 'SECRET-model', modelPath: join(tmpdir(), 'SECRET-model.gguf'), contextLength: 8192 });
  await supervisor.stop();
  assert.equal(calls.length, 1); assert.equal(calls[0][2].shell, false); assert.ok(calls[0][1].includes('--api-key'));
  const spawnRecord = sink.records.find(e => e.type === 'process-spawn'); assert.equal(spawnRecord.process.pid, 456); assert.equal(spawnRecord.flags['-c'], '8192');
  assert.ok(sink.records.some(e => e.type === 'process-close')); assert.ok(sink.records.some(e => e.type === 'stop-end'));
  assert.ok(!JSON.stringify(sink.records).includes('SECRET-model')); assert.ok(!JSON.stringify(sink.records).includes(calls[0][1][calls[0][1].indexOf('--api-key') + 1]));
});

test('agent callback original event and return value preserved; bodies and tool args excluded', () => {
  const sink = memory(), d = createResumeRecorder({ sink }); const received = [];
  const options = d.registryOptions({ avviaSessioneFn(input) {
    const a = { type: 'TextMessageContent', messageId: 'm', delta: 'SECRET' };
    assert.equal(input.onEvento(a), 99); assert.equal(input.onEvento(a), 99); return 'unchanged';
  } });
  assert.equal(options.avviaSessioneFn({ onEvento: e => { received.push(e); return 99; } }), 'unchanged');
  assert.equal(received.length, 2); assert.equal(sink.records.filter(e => e.eventType === 'TextMessageContent').length, 1); assert.ok(!JSON.stringify(sink.records).includes('SECRET'));
});

test('capture body limit disables observation of content, not the request', async () => {
  const h = harness({ captureRaw: true, limits: { ...RESUME_LIMITS, bodyBytes: 10 } });
  h.registry.resume('s', '{"messages":["SECRET"]}'); assert.equal(await h.pending, raw);
  assert.equal(h.sink.files.size, 0); assert.equal(h.sink.records.find(e => e.type === 'request-start').snapshot.capture, 'unsupported-or-over-limit');
});

test('request recording limit emits one notice and leaves subsequent inference working', async () => {
  const h = harness({ limits: { ...RESUME_LIMITS, requests: 1 } });
  for (let i = 0; i < 3; i++) { h.registry.resume('s', '{}'); assert.equal(await h.pending, raw); }
  assert.equal(h.sink.records.filter(e => e.type === 'request-start').length, 1); assert.equal(h.sink.records.filter(e => e.type === 'recording-limit').length, 1);
});

test('previous-request memory is bounded and eviction yields no invented comparison', async () => {
  const h = harness({ limits: { ...RESUME_LIMITS, previousEntries: 1 } });
  for (const model of ['m1', 'm2', 'm1']) { h.registry.resume('s', JSON.stringify({ model, messages: [] })); await h.pending; }
  assert.equal(h.sink.records.filter(e => e.type === 'request-start').at(-1).snapshot.previousRequestId, null);
});

test('bounded sink reserves queued bytes synchronously and reports dropped writes', async () => {
  let release; const writes = [];
  const s = createBoundedResumeSink({ directory: '/unused', maxQueuedBytes: 20, maxDiskBytes: 50, write: async (...a) => { writes.push(a); await new Promise(r => { release = r; }); } });
  assert.equal(s.privateRequest('r1', 'x'.repeat(15)), true); assert.equal(s.privateRequest('r2', 'x'.repeat(15)), false);
  await new Promise(r => setImmediate(r)); release(); const stats = await s.flush(); assert.equal(stats.dropped, 1); assert.equal(stats.queuedBytes, 0); assert.equal(writes.length, 1);
});

test('disk write failure is contained and visible in sink stats', async () => {
  const s = createBoundedResumeSink({ directory: '/unused', write: async () => { throw new Error('disk-full'); } });
  s.record({ safe: 1 }); assert.equal((await s.flush()).errors, 1); assert.equal(s.record({ safe: 2 }), false);
});

test('real on-disk opt-in writes restricted files and source hashes, without raw by default', async t => {
  const root = await mkdtemp(join(tmpdir(), 'talos-resume-')); t.after(() => rm(root, { recursive: true, force: true }));
  const d = await createLocalResumeDiagnostics({ env: { TALOS_RESUME_DIAGNOSTICS_DIR: root, TALOS_RESUME_DIAGNOSTICS_SESSION: 's' }, warn: () => {} });
  assert.equal(d.enabled, true); await d.flush();
  const dirs = (await readdir(root)).filter(n => n.startsWith('run-')); assert.equal(dirs.length, 1);
  assert.deepEqual(await readdir(join(root, dirs[0], 'private')), []);
  const events = (await readFile(join(root, dirs[0], 'events.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.match(events.find(e => e.type === 'environment').sources.recorder.sha256, /^[a-f0-9]{64}$/);
  if (process.platform !== 'win32') assert.equal((await stat(join(root, '.resume-key'))).mode & 0o777, 0o600);
});

test('raw flag alone cannot capture an unidentified session', async () => {
  const h = harness({ captureRaw: true, selected: null }); h.registry.resume('s', '{"model":"m","messages":[]}'); await h.pending;
  assert.equal(h.sink.files.size, 0);
});

test('report whitelists metadata and distinguishes unknown model metrics and EOF', async () => {
  const h = harness(); h.registry.resume('s', '{"model":"m","messages":[]}'); await h.pending;
  const r = buildResumeReport([...h.sink.records, { schema: 'talos.local-resume.v1', type: 'unknown', messages: 'SECRET' }]);
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].serverCacheN, null); assert.equal(r.rows[0].frontendVisibleMs, null); assert.equal(r.rows[0].completedModelTurn, null); assert.equal(r.rows[0].outcome, 'eof'); assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('server composition root has explicit origin hooks and no cache flag mutation', async () => {
  const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("resumeDiagnostics.withRoute('owner-transport'")); assert.ok(source.includes("resumeDiagnostics.withRoute('context-counter'")); assert.ok(source.includes('resumeDiagnostics.wrapRuntime(createLlamaServerRuntime'));
  assert.ok(source.includes('resumeDiagnostics.wrapRegistry(createSessionRegistry')); assert.ok(!source.includes('cache_prompt: true'));
});
