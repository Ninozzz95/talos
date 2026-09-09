import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createContextEngine } from '../src/engine.mjs';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { parseContextSettings } from '../src/contracts.mjs';

const modelProfile = { provider: 'local', model: 'controlled-fixture', windowTokens: 16384, responseReserve: 2048, local: true };
const now = '2026-09-09T00:00:00.000Z';
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const summary = { schema: 'talos.context.summary.v1', text: 'Database SQLite, scelta confermata.', goal: 'Continuare il progetto', decisions: ['Database SQLite'], constraints: [], completed: [], pending: [], resources: [], sources: [{ recordId: 'u0', quote: 'Database SQLite' }] };
async function fixture(t, { summarize, settings, faultPoint, decorateStore } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'tcec-engine-'));
  const databasePath = join(directory, 'context.sqlite');
  const store = createSqliteContextStore({ databasePath, faultPoint });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'chat', settings: parseContextSettings(settings ?? {}) });
  const calls = [];
  const model = { resolveModel: async ({ sessionModel }) => sessionModel, summarize: async request => {
    calls.push(request);
    if (summarize) return summarize(request);
    const sourceId = JSON.parse(request.messages.at(-1).content).sourceIds?.[0] ?? 'u0';
    const quote = sourceId === 'u0' ? 'Database SQLite' : sourceId.startsWith('a') ? 'risposta' : `richiesta ${sourceId.slice(1)}`;
    return { text: JSON.stringify({ ...summary, sources: [{ recordId: sourceId, quote }] }), finishReason: 'stop', usage: { inputTokens: 50, outputTokens: 30 } };
  } };
  const tokenCounter = { async countPreparedContext({ messages, tools, model }) { return { schema: 'talos.context.tokens.v1', inputTokens: Math.ceil(JSON.stringify({ messages, tools }).length / 4), windowTokens: model.windowTokens, responseReserve: model.responseReserve, method: 'heuristic', exact: false, requestHash: sha({ messages, tools }), provider: model.provider, model: model.model }; } };
  const engine = createContextEngine({ store: decorateStore ? decorateStore(store) : store, model, tokenCounter, clock: () => now });
  for (let i = 0; i < 5; i++) {
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `u${i}`, message: { role: 'user', content: i ? `richiesta ${i} ` + 'dati '.repeat(500) : 'Database SQLite ' + 'contesto '.repeat(500) }, createdAt: now } });
    await engine.appendOriginal({ sessionId: 'chat', record: { id: `a${i}`, message: { role: 'assistant', content: 'risposta '.repeat(500) }, createdAt: now } });
  }
  return { store, engine, calls, databasePath, model, tokenCounter };
}
async function compact(engine, key = 'one') {
  const job = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: key, sessionModel: modelProfile });
  return engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
}
test('CTX-ENGINE-PUBLISH archives originals and publishes only validated reduced context', async t => {
  const { engine, store, calls } = await fixture(t);
  const before = await store.readOriginals({ sessionId: 'chat' });
  const job = await compact(engine);
  assert.equal(job.state, 'committed', JSON.stringify(job.error));
  assert.deepEqual(await store.readOriginals({ sessionId: 'chat' }), before);
  const prepared = await engine.prepareForRequest({ sessionId: 'chat', sessionModel: modelProfile, tools: [] });
  assert.ok(prepared.versionId);
  assert.ok(prepared.messages.some(m => m.content?.includes('richiesta 4')));
  assert.ok(calls.every(c => !c.tools?.length));
  assert.equal((await store.readUsage({ sessionId: 'chat' })).length, calls.length);
});
for (const [name, response, code] of [
  ['EMPTY', { text: '', finishReason: 'stop' }, 'CTX_EMPTY_SUMMARY'],
  ['TRUNCATED', { text: JSON.stringify(summary), finishReason: 'length' }, 'CTX_TRUNCATED_SUMMARY'],
  ['INVALID-SOURCE', { text: JSON.stringify({ ...summary, sources: [{ recordId: 'other-chat', quote: 'inventata' }] }), finishReason: 'stop' }, 'CTX_INVALID_SOURCE'],
]) test(`CTX-${name}-SUMMARY keeps valid checkpoint and never repeats same request`, async t => {
  const { engine, store, calls } = await fixture(t, { summarize: () => response });
  const job = await compact(engine);
  assert.equal(job.state, 'failed'); assert.equal(job.error.code, code);
  assert.equal((await engine.getContextState({ sessionId: 'chat' })).activeVersion, null);
  await compact(engine);
  assert.equal(calls.length, 1);
  assert.equal((await store.readOriginals({ sessionId: 'chat' })).length, 10);
});
test('CTX-CANCEL aborting synthesis preserves originals and blocks late completion', async t => {
  let entered; const started = new Promise(resolve => { entered = resolve; });
  const { engine, store } = await fixture(t, { summarize: ({ signal }) => new Promise((resolve, reject) => { entered(); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) });
  const job = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'cancel', sessionModel: modelProfile });
  await started;
  await engine.cancelCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal((await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id })).state, 'cancelled');
  assert.equal((await store.readContextSnapshot({ sessionId: 'chat' })).activeVersion, null);
});
test('CTX-STALE-JOB pin correction during synthesis rejects candidate', async t => {
  let entered, finish; const started = new Promise(resolve => { entered = resolve; });
  const { engine } = await fixture(t, { summarize: () => new Promise(resolve => { entered(); finish = () => resolve({ text: JSON.stringify(summary), finishReason: 'stop' }); }) });
  const job = await engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'stale', sessionModel: modelProfile });
  await started;
  const state = await engine.getContextState({ sessionId: 'chat' });
  await engine.upsertProtectedFact({ sessionId: 'chat', expectedRevision: state.revision, actor: 'owner', fact: { id: 'database', text: 'Database SQLite', sources: [] } });
  finish();
  const final = await engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal(final.state, 'failed'); assert.equal(final.error.code, 'CTX_STALE_REVISION');
});
test('CTX-PIN-CONFLICT model proposal cannot overwrite owner fact', async t => {
  const { engine } = await fixture(t);
  let state = await engine.getContextState({ sessionId: 'chat' });
  await engine.upsertProtectedFact({ sessionId: 'chat', expectedRevision: state.revision, actor: 'owner', fact: { id: 'database', text: 'SQLite', sources: [] } });
  state = await engine.getContextState({ sessionId: 'chat' });
  const fact = await engine.upsertProtectedFact({ sessionId: 'chat', expectedRevision: state.revision, actor: 'model', fact: { id: 'database', text: 'Postgres', sources: [] } });
  assert.equal(fact.text, 'SQLite'); assert.equal(fact.status, 'conflict');
});
test('CTX-PERSIST-FAILURE no candidate active after transactional failure', async t => {
  const { engine, store } = await fixture(t, { faultPoint: 'publish-after-version' });
  const job = await compact(engine);
  assert.equal(job.state, 'failed'); assert.equal(job.error.code, 'CTX_PERSISTENCE_FAILED');
  assert.equal((await store.readContextSnapshot({ sessionId: 'chat' })).activeVersion, null);
});

test('CTX-RESUME-TERMINAL-RACE resume during final generation returns its committed job', async t => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t);
  const normal = f.model.summarize;
  let first = true;
  f.model.summarize = async request => { if (first) { first = false; entered(); await gate; } return normal(request); };
  const job = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'resume-race', sessionModel: modelProfile });
  await started;
  const resumed = f.engine.resumeCompaction({ sessionId: 'chat', jobId: job.id, sessionModel: modelProfile });
  release();
  assert.equal((await resumed).state, 'committed');
});

test('CTX-CANCEL-PROGRESS-RACE cancellation still succeeds when progress advances after read', async t => {
  let advance = false, entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { decorateStore: store => ({ ...store, async readContextJob(args) {
    const job = await store.readContextJob(args);
    if (advance && job && !['cancelled', 'committed', 'failed'].includes(job.state)) {
      advance = false;
      await store.saveJobProgress({ sessionId: args.sessionId, job: { ...job, progress: { ...job.progress, completed: job.progress.completed + 1, total: job.progress.total + 1 } } });
    }
    return job;
  } }) });
  const normal = f.model.summarize;
  f.model.summarize = async request => { entered(); await gate; request.signal.throwIfAborted(); return normal(request); };
  const job = await f.engine.startCompaction({ sessionId: 'chat', idempotencyKey: 'cancel-race', sessionModel: modelProfile });
  await started;
  advance = true;
  try { assert.equal((await f.engine.cancelCompaction({ sessionId: 'chat', jobId: job.id })).state, 'cancelled'); }
  finally { release(); await f.engine.waitForCompaction({ sessionId: 'chat', jobId: job.id }); }
  assert.equal((await f.store.readContextSnapshot({ sessionId: 'chat' })).activeVersion, null);
});

test('CTX-RESUME-USAGE-IDENTITY paid paused attempt and resumed attempt retain distinct consumption', async t => {
  const f = await fixture(t);
  const normal = f.model.summarize;
  let first = true;
  f.model.summarize = async request => {
    if (first) { first = false; throw Object.assign(new Error('Pause after paid request'), { code: 'CTX_RESOURCE_BUSY', usage: { inputTokens: 123, outputTokens: 1 } }); }
    return normal(request);
  };
  const job = await compact(f.engine, 'usage-resume');
  assert.equal(job.state, 'paused');
  await f.engine.resumeCompaction({ sessionId: 'chat', jobId: job.id, sessionModel: modelProfile });
  const finished = await f.engine.waitForCompaction({ sessionId: 'chat', jobId: job.id });
  assert.equal(finished.state, 'committed', JSON.stringify(finished.error));
  const usage = await f.store.readUsage({ sessionId: 'chat' });
  assert.equal(usage.length, f.calls.length + 1);
  assert.equal(new Set(usage.map(record => record.operationId)).size, usage.length);
});
