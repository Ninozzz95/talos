import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { exportContextArchive, importContextArchive, verifyContextArchive } from '../src/node/context-export.mjs';
const settings = { auto: true, model: { mode: 'follow-session' }, triggerRatio: .75, targetRatio: .55, retainRecentTurns: 2, focus: '', nativeMode: 'off', semanticSearch: true };
function resign(archive) {
  const { manifest, ...payload } = archive;
  archive.manifest = { ...manifest, payloadSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
  return archive;
}
async function sample(t) {
  const source = createSqliteContextStore({ databasePath: ':memory:' });
  const target = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(async () => { await source.close(); await target.close(); });
  await source.initSession({ sessionId: 'a', settings });
  await source.putBlob({ sessionId: 'a', id: 'asset', bytes: Uint8Array.from([0, 255, 30]), mimeType: 'image/png' });
  await source.appendOriginalBatch({ sessionId: 'a', records: [{ id: 'r1', message: { role: 'user', content: 'original' }, createdAt: '2026-09-08T00:00:00.000Z', assetRefs: ['asset'] }] });
  return { source, target, archive: await exportContextArchive({ sessionId: 'a' }, { store: source }) };
}

test('CTX-ARCHIVE-ROUNDTRIP verifies hashes, attachments and idempotent import', async t => {
  const { source, target, archive } = await sample(t);
  assert.deepEqual(verifyContextArchive(archive), archive);
  const snapshot = await importContextArchive(archive, { store: target });
  assert.deepEqual(snapshot, await source.readContextSnapshot({ sessionId: 'a' }));
  assert.deepEqual(await target.exportSession({ sessionId: 'a' }), archive);
  assert.deepEqual(await importContextArchive(archive, { store: target }), snapshot);
  await target.appendOriginalBatch({ sessionId: 'a', records: [{ id: 'r2', message: { role: 'user', content: 'new' }, createdAt: '2026-09-08T00:00:00.000Z' }] });
  await assert.rejects(importContextArchive(archive, { store: target }), { code: 'CTX_IMPORT_CONFLICT' });
});

for (const [name, mutate] of [
  ['message hash', a => { a.records[0].message.content = 'forged'; }],
  ['blob hash', a => { a.blobs[0].base64 = 'AAAA'; }],
  ['duplicate record', a => { a.records.push(a.records[0]); }],
  ['cross-session record', a => { a.records[0].sessionId = 'elsewhere'; }],
  ['missing asset', a => { a.blobs = []; }],
  ['invalid settings', a => { a.session.settings.targetRatio = .99; }],
  ['coerced settings', a => { a.session.settings.targetRatio = '0.55'; }],
  ['orphan active version', a => { a.session.activeVersion = { id: 'absent' }; }],
]) {
  test(`CTX-ARCHIVE-REJECT ${name} leaves destination untouched even with recomputed manifest`, async t => {
    const { target, archive } = await sample(t);
    mutate(archive);
    resign(archive);
    await assert.rejects(importContextArchive(archive, { store: target }), { code: 'CTX_ARCHIVE_INVALID' });
    assert.equal(await target.readContextSnapshot({ sessionId: 'a' }), null);
  });
}

test('CTX-IMPORT-FAULT validated archive is atomic when persistence fails after originals', async t => {
  const { archive } = await sample(t);
  const failing = createSqliteContextStore({ databasePath: ':memory:', faultPoint: 'import-after-records' });
  t.after(() => failing.close());
  await assert.rejects(importContextArchive(archive, { store: failing }), { code: 'CTX_PERSISTENCE_FAILED' });
  assert.equal(await failing.readContextSnapshot({ sessionId: 'a' }), null);
});

test('CTX-IMPORT-IDEMPOTENT-ORDER valid unordered blob manifest remains idempotent', async t => {
  const { source, target } = await sample(t);
  await source.putBlob({ sessionId: 'a', id: 'another', bytes: Uint8Array.of(1), mimeType: 'text/plain' });
  const archive = await source.exportSession({ sessionId: 'a' });
  archive.blobs.reverse();
  resign(archive);
  const snapshot = await importContextArchive(archive, { store: target });
  assert.deepEqual(await importContextArchive(archive, { store: target }), snapshot);
});
