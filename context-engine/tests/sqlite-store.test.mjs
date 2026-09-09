import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';

const settings = { auto: true, model: { mode: 'follow-session' }, triggerRatio: .75, targetRatio: .55, retainRecentTurns: 2, focus: '', nativeMode: 'off', semanticSearch: true };
const createdAt = '2026-09-08T00:00:00.000Z';
const hash = value => createHash('sha256').update(value).digest('hex');
const record = (id, content = id) => ({ id, message: { role: 'user', content }, createdAt });

test('CTX-USAGE-ATOMIC durable usage and outbox share identity across replay and restart', async t => {
  const { store, databasePath } = await fixture(t);
  const input = { sessionId: 'a', operationId: 'attempt', usage: { prompt_tokens: 30, completion_tokens: 4 } };
  await store.recordUsage(input);
  const events = await store.readContextOutbox({ sessionId: 'a' });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'context.usage.recorded');
  assert.deepEqual(events[0].payload, { operationId: 'attempt', usage: input.usage });
  await store.recordUsage(input);
  assert.deepEqual(await store.readContextOutbox({ sessionId: 'a' }), events);
  await store.ackContextEvent({ sessionId: 'a', eventId: events[0].id });
  await store.close();
  const reopened = createSqliteContextStore({ databasePath });
  try {
    await reopened.recordUsage(input);
    assert.deepEqual(await reopened.readContextOutbox({ sessionId: 'a' }), []);
    assert.equal((await reopened.readUsage({ sessionId: 'a' })).length, 1);
  } finally { await reopened.close(); }
});

for (const faultPoint of ['usage-after-record', 'crash-usage-after-record', 'usage-after-outbox', 'crash-usage-after-outbox']) {
  test(`CTX-USAGE-CRASH ${faultPoint}: receipt and accounting roll back together`, async t => {
    const { store, databasePath } = await fixture(t, { faultPoint });
    await assert.rejects(store.recordUsage({ sessionId: 'a', operationId: 'attempt', usage: { inputTokens: 9 } }), { code: faultPoint.startsWith('crash') ? 'CTX_WORKER_EXIT' : 'CTX_PERSISTENCE_FAILED' });
    await store.close();
    const reopened = createSqliteContextStore({ databasePath });
    try {
      assert.deepEqual(await reopened.readUsage({ sessionId: 'a' }), []);
      assert.deepEqual(await reopened.readContextOutbox({ sessionId: 'a' }), []);
    } finally { await reopened.close(); }
  });
}

test('CTX-USAGE-LEGACY prior accounting rows get a durable delivery receipt without changing the archive', async t => {
  const { store, databasePath } = await fixture(t);
  const db = new DatabaseSync(databasePath);
  db.prepare('INSERT INTO usage_records(session_id,operation_id,usage_json) VALUES(?,?,?)').run('a', 'old', JSON.stringify({ inputTokens: 7 })); db.close();
  const events = await store.readContextOutbox({ sessionId: 'a' });
  assert.equal(events.length, 1); assert.equal(events[0].payload.operationId, 'old');
  assert.equal((await store.readContextSnapshot({ sessionId: 'a' })).revision, 0);
});
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'talos-context-store-'));
  const databasePath = join(directory, 'context.sqlite');
  const store = createSqliteContextStore({ databasePath, ...options });
  t.after(async () => { await store.close(); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'a', settings });
  return { store, databasePath, directory };
}
async function candidate(store, id = 'job1') {
  const snapshot = await store.readContextSnapshot({ sessionId: 'a' });
  const records = await store.readOriginals({ sessionId: 'a' });
  const job = { schema: 'talos.context.job.v1', id, sessionId: 'a', idempotencyKey: id, requestFingerprint: hash(id), kind: 'compact', state: 'ready', baseRevision: snapshot.revision, baseStateRevision: snapshot.stateRevision, coveredThrough: snapshot.headSequence, model: { provider: 'local', model: 'fixture' }, createdAt, updatedAt: createdAt, completedSegments: [], progress: { completed: 1, total: 1, phase: 'ready' } };
  await store.claimContextJob({ sessionId: 'a', job });
  const version = { schema: 'talos.context.version.v1', id: `version-${id}`, sessionId: 'a', coveredThrough: snapshot.headSequence, sourceIds: records.map(r => r.id), sourceHash: hash(JSON.stringify(records.map(({ id, sha256 }) => ({ id, sha256 })))), summary: { schema: 'talos.context.summary.v1', text: 'Retained context', goal: 'Keep originals', decisions: [], constraints: [], completed: [], pending: [], resources: [], sources: records.length ? [{ recordId: records[0].id, quote: records[0].message.content }] : [] }, activeMessages: [{ role: 'user', content: 'Retained context' }], model: job.model, measurement: { schema: 'talos.context.tokens.v1', inputTokens: 10, windowTokens: 1000, responseReserve: 100, method: 'heuristic', exact: false, requestHash: hash('request'), provider: 'local', model: 'fixture' }, createdAt };
  return { sessionId: 'a', expectedRevision: snapshot.revision, expectedStateRevision: snapshot.stateRevision, jobId: job.id, version, job };
}

test('CTX-SESSION-ISOLATION immutable originals, atomic duplicates and real WAL/FULL', async t => {
  const { store, databasePath } = await fixture(t);
  const result = await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1')], expectedRevision: 0 });
  assert.equal(result.records[0].sha256, hash(JSON.stringify(record('r1').message)));
  assert.equal(result.revision, 1);
  assert.equal((await store.readContextSnapshot({ sessionId: 'a' })).stateRevision, 0);
  assert.equal((await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1')] })).revision, 1);
  await assert.rejects(store.appendOriginalBatch({ sessionId: 'a', records: [record('r2'), record('r1', 'different')] }), { code: 'CTX_RECORD_CONFLICT' });
  assert.equal((await store.readOriginals({ sessionId: 'a' })).length, 1);
  await store.initSession({ sessionId: 'b', settings });
  assert.deepEqual(await store.readOriginals({ sessionId: 'b', ids: ['r1'] }), []);
  await store.appendOriginalBatch({ sessionId: 'b', records: [record('r1', 'other session')] });
  const db = new DatabaseSync(databasePath);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.throws(() => db.prepare('UPDATE original_records SET record_json=?').run('{}'), /immutable/);
  db.close();
  const health = await store.health();
  assert.equal(health.fts5, true);
  assert.equal(health.integrity, 'ok');
});

test('CTX-STALE-JOB concurrent revisions, stable prefix append and atomic outbox', async t => {
  const { store } = await fixture(t);
  const results = await Promise.allSettled([1, 2].map(n => store.appendOriginalBatch({ sessionId: 'a', records: [record(`r${n}`)], expectedRevision: 0 })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'CTX_STALE_REVISION');
  const args = await candidate(store);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('tail')] });
  await assert.rejects(store.commitContextVersion(args), { code: 'CTX_STALE_REVISION' });
  args.expectedRevision++;
  await store.commitContextVersion(args);
  const snapshot = await store.readContextSnapshot({ sessionId: 'a' });
  assert.equal(snapshot.activeVersion.id, args.version.id);
  assert.equal(snapshot.headSequence, 2);
  assert.equal(snapshot.stateRevision, 1);
  assert.equal((await store.readContextJob({ sessionId: 'a', jobId: args.jobId })).state, 'committed');
  const events = await store.readContextOutbox({ sessionId: 'a' });
  assert.equal(events.length, 1);
  assert.equal(events[0].versionId, args.version.id);
  await store.ackContextEvent({ sessionId: 'b', eventId: events[0].id });
  assert.equal((await store.readContextOutbox({ sessionId: 'a' })).length, 1);
  await store.ackContextEvent({ sessionId: 'a', eventId: events[0].id });
  assert.deepEqual(await store.readContextOutbox({ sessionId: 'a' }), []);
});

test('CTX-CANCEL late job progress and finals cannot publish or mutate identity', async t => {
  const { store } = await fixture(t);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1')] });
  const args = await candidate(store);
  await assert.rejects(store.claimContextJob({ sessionId: 'a', job: { ...args.job, id: 'different', requestFingerprint: 'changed' } }), { code: 'CTX_IDEMPOTENCY_CONFLICT' });
  await store.saveJobProgress({ sessionId: 'a', job: { ...args.job, state: 'cancelled' } });
  await assert.rejects(store.saveJobProgress({ sessionId: 'a', job: { ...args.job, state: 'ready' } }), { code: 'CTX_JOB_CANCELLED' });
  await assert.rejects(store.commitContextVersion(args), { code: 'CTX_JOB_CANCELLED' });
  assert.deepEqual(await store.listContextVersions({ sessionId: 'a' }), []);
});

for (const faultPoint of ['publish-after-version', 'crash-publish-after-version']) {
  test(`CTX-${faultPoint.startsWith('crash') ? 'CRASH-PUBLISH' : 'PERSIST-FAILURE'} rolls back version, activation and outbox`, async t => {
    const { store, databasePath } = await fixture(t, { faultPoint });
    await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1')] });
    const args = await candidate(store);
    await assert.rejects(store.commitContextVersion(args), { code: faultPoint.startsWith('crash') ? 'CTX_WORKER_EXIT' : 'CTX_PERSISTENCE_FAILED' });
    await store.close();
    const reopened = createSqliteContextStore({ databasePath });
    try {
      assert.equal((await reopened.readContextSnapshot({ sessionId: 'a' })).activeVersion, null);
      assert.deepEqual(await reopened.listContextVersions({ sessionId: 'a' }), []);
      assert.deepEqual(await reopened.readContextOutbox({ sessionId: 'a' }), []);
      assert.equal((await reopened.readOriginals({ sessionId: 'a' })).length, 1);
    } finally { await reopened.close(); }
  });
}

test('CTX-RESTORE-SUFFIX restores immutable version without losing later originals', async t => {
  const { store, directory } = await fixture(t);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1')] });
  const args = await candidate(store);
  await store.commitContextVersion(args);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('tail')] });
  const snapshot = await store.readContextSnapshot({ sessionId: 'a' });
  const restored = await store.restoreContextVersion({ sessionId: 'a', versionId: args.version.id, expectedRevision: snapshot.revision, newVersionId: 'restored', createdAt });
  assert.equal(restored.restoredFrom, args.version.id);
  assert.equal((await store.readOriginals({ sessionId: 'a', afterSequence: restored.coveredThrough }))[0].id, 'tail');
  const backupPath = join(directory, 'backup.sqlite');
  const manifest = await store.backup({ destinationPath: backupPath });
  assert.equal(manifest.sha256, hash(await readFile(backupPath)));
  const copy = createSqliteContextStore({ databasePath: backupPath });
  try { assert.equal((await copy.readContextSnapshot({ sessionId: 'a' })).activeVersion.id, 'restored'); } finally { await copy.close(); }
});

test('CTX-SEARCH-OWNERSHIP FTS5 escapes syntax, refuses forged chunks and handles empty sessions', async t => {
  const { store } = await fixture(t);
  await store.initSession({ sessionId: 'b', settings });
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1', 'Find the lunar relay')] });
  const chunk = { id: 'c1', recordId: 'r1', sequence: 1, text: 'Find the lunar relay', start: 0, end: 20 };
  await store.replaceSearchChunks({ sessionId: 'a', chunks: [chunk] });
  assert.equal((await store.searchLexical({ sessionId: 'a', query: 'lunar' }))[0].recordId, 'r1');
  assert.deepEqual(await store.searchLexical({ sessionId: 'b', query: 'lunar' }), []);
  await store.searchLexical({ sessionId: 'a', query: '" OR * NEAR(() --' });
  await assert.rejects(store.replaceSearchChunks({ sessionId: 'b', chunks: [chunk] }), { code: 'CTX_SOURCE_INVALID' });
  await assert.rejects(store.replaceSearchChunks({ sessionId: 'a', chunks: [{ ...chunk, text: 'forged' }] }), { code: 'CTX_SOURCE_INVALID' });
  assert.equal((await store.searchLexical({ sessionId: 'a', query: 'lunar' })).length, 1);
  await assert.rejects(store.searchVector({ sessionId: 'a', embedding: [1, 0] }), { code: 'CTX_VECTOR_UNAVAILABLE' });
});

test('CTX-ASSET-ROUNDTRIP session ownership, hash check and usage idempotency', async t => {
  const { store } = await fixture(t);
  await store.initSession({ sessionId: 'b', settings });
  const bytes = Uint8Array.from([0, 255, 10, 80]);
  const blob = await store.putBlob({ sessionId: 'a', id: '../../asset', bytes, mimeType: 'image/png' });
  assert.equal(blob.sha256, hash(bytes));
  assert.equal(await store.readBlob({ sessionId: 'b', id: '../../asset' }), null);
  assert.deepEqual((await store.readBlob({ sessionId: 'a', id: '../../asset' })).bytes, bytes);
  await assert.rejects(store.putBlob({ sessionId: 'a', id: 'invalid', bytes, mimeType: 'image/png', sha256: '0'.repeat(64) }), { code: 'CTX_HASH_MISMATCH' });
  await store.recordUsage({ sessionId: 'a', jobId: null, operationId: 'op', usage: { inputTokens: 7 } });
  await store.recordUsage({ sessionId: 'a', jobId: null, operationId: 'op', usage: { inputTokens: 7 } });
  assert.equal((await store.readUsage({ sessionId: 'a' })).length, 1);
});

test('CTX-VECTOR-UPSTREAM real pinned sqlite-vec cosine search respects session and dimensions', async t => {
  const { store } = await fixture(t, { vectorExtension: true });
  assert.equal((await store.health()).vector, true, 'Real sqlite-vec 0.1.9 must be loaded');
  await store.initSession({ sessionId: 'b', settings });
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1', 'lunar'), record('r2', 'solar')] });
  await store.replaceSearchChunks({ sessionId: 'a', chunks: [
    { id: 'c1', recordId: 'r1', sequence: 1, text: 'lunar', start: 0, end: 5, embedding: [1, 0] },
    { id: 'c2', recordId: 'r2', sequence: 2, text: 'solar', start: 0, end: 5, embedding: [0, 1] },
  ] });
  const hits = await store.searchVector({ sessionId: 'a', embedding: [1, 0] });
  assert.deepEqual(hits.map(hit => hit.id), ['c1', 'c2']);
  assert.equal(hits[0].score, 1);
  assert.deepEqual(await store.searchVector({ sessionId: 'b', embedding: [1, 0] }), []);
  await assert.rejects(store.searchVector({ sessionId: 'a', embedding: [1] }), { code: 'CTX_INVALID_INPUT' });
});

test('CTX-STATE-CAS settings and protected facts invalidate old candidates', async t => {
  const { store } = await fixture(t);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1', 'Keep this precise fact')] });
  const args = await candidate(store);
  const fact = await store.upsertProtectedFact({ sessionId: 'a', expectedRevision: args.expectedRevision, fact: { id: 'fact', text: 'Pinned', status: 'active', revision: 0, sources: [{ recordId: 'r1', quote: 'precise fact' }] } });
  assert.equal(fact.sources[0].start, 10);
  await assert.rejects(store.commitContextVersion({ ...args, expectedRevision: args.expectedRevision + 1, expectedStateRevision: args.expectedStateRevision + 1 }), { code: 'CTX_STALE_REVISION' });
  const changed = await store.updateSessionSettings({ sessionId: 'a', expectedRevision: args.expectedRevision + 1, settings: { ...settings, auto: false } });
  assert.equal(changed.stateRevision, 2);
  const removed = await store.removeProtectedFact({ sessionId: 'a', factId: 'fact', expectedRevision: changed.revision });
  assert.equal(removed.status, 'removed');
  assert.equal((await store.readOriginals({ sessionId: 'a' }))[0].message.content, 'Keep this precise fact');
});

test('CTX-CLOSE-DRAIN queued writes finish and caller mutation cannot change captured bytes', async t => {
  const { store, databasePath } = await fixture(t);
  const input = record('r1', 'captured');
  const writing = store.appendOriginalBatch({ sessionId: 'a', records: [input] });
  input.message.content = 'changed by caller';
  await Promise.all([writing, store.close()]);
  await assert.rejects(store.readContextSnapshot({ sessionId: 'a' }), { code: 'CTX_STORE_CLOSED' });
  const reopened = createSqliteContextStore({ databasePath });
  try { assert.equal((await reopened.readOriginals({ sessionId: 'a' }))[0].message.content, 'captured'); } finally { await reopened.close(); }
});

test('CTX-JOB-STALE-PROGRESS late phase cannot rewind verified job progress', async t => {
  const { store } = await fixture(t);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1')] });
  const { job } = await candidate(store);
  await assert.rejects(store.saveJobProgress({ sessionId: 'a', job: { ...job, state: 'summarizing', progress: { completed: 0, total: 1, phase: 'summarizing' } } }), { code: 'CTX_JOB_CONFLICT' });
});

test('CTX-ORIGINAL-WIRE missing assistant tool content and ISO offset remain byte-exact', async t => {
  const { store } = await fixture(t);
  const input = { id: 'call', message: { role: 'assistant', tool_calls: [{ id: 'call1', type: 'function', function: { name: 'read', arguments: '{}' } }] }, createdAt: '2026-09-08T12:30:00+02:00' };
  await store.appendOriginalBatch({ sessionId: 'a', records: [input] });
  const [stored] = await store.readOriginals({ sessionId: 'a' });
  assert.deepEqual(stored.message, input.message);
  assert.equal(stored.createdAt, input.createdAt);
  assert.equal(stored.sha256, hash(JSON.stringify(input.message)));
  assert.equal((await store.exportSession({ sessionId: 'a' })).records[0].createdAt, input.createdAt);
});

test('CTX-CANCEL-DURABLE-MERGE cancellation preserves concurrently committed job progress', async t => {
  const { store } = await fixture(t);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1')] });
  const { job } = await candidate(store);
  const newer = { ...job, progress: { ...job.progress, completed: 2, total: 2 } };
  await store.saveJobProgress({ sessionId: 'a', job: newer });
  const cancelled = await store.saveJobProgress({ sessionId: 'a', job: { ...job, state: 'cancelled' } });
  assert.equal(cancelled.state, 'cancelled');
  assert.deepEqual(cancelled.progress, newer.progress);
});

test('CTX-MUTATION-REPLAY durable retry preserves one revision and rejects changed payload', async t => {
  const { store, databasePath } = await fixture(t);
  const args = { sessionId: 'a', settings: { ...settings, auto: false }, expectedRevision: 0, idempotencyKey: 'request1', requestFingerprint: hash('request1') };
  const first = await store.updateSessionSettings(args);
  assert.equal(first.revision, 1);
  assert.deepEqual(await store.updateSessionSettings(args), first);
  const archive = await store.exportSession({ sessionId: 'a' });
  assert.equal(archive.mutations.length, 1);
  const imported = createSqliteContextStore({ databasePath: ':memory:' });
  try {
    await imported.importSession({ archive });
    assert.deepEqual(await imported.updateSessionSettings(args), first);
  } finally { await imported.close(); }
  await assert.rejects(store.updateSessionSettings({ ...args, requestFingerprint: hash('changed') }), { code: 'CTX_IDEMPOTENCY_CONFLICT' });
  await store.close();
  const reopened = createSqliteContextStore({ databasePath });
  try {
    assert.deepEqual(await reopened.updateSessionSettings(args), first);
    assert.deepEqual(await reopened.readContextMutation({ sessionId: 'a', idempotencyKey: 'request1', requestFingerprint: hash('request1') }), { result: first });
  } finally { await reopened.close(); }
});

test('CTX-MUTATION-ROLLBACK failed mutation never leaves a successful receipt', async t => {
  const { store } = await fixture(t);
  const args = { sessionId: 'a', settings: { ...settings, auto: false }, expectedRevision: 10, idempotencyKey: 'request1', requestFingerprint: hash('request1') };
  await assert.rejects(store.updateSessionSettings(args), { code: 'CTX_STALE_REVISION' });
  assert.equal(await store.readContextMutation(args), null);
});
