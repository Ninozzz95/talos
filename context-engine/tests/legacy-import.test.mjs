import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { importLegacySession, selectLastValidCheckpoint } from '../src/node/legacy-import.mjs';
const settings = { auto: true, model: { mode: 'follow-session' }, triggerRatio: .75, targetRatio: .55, retainRecentTurns: 2, focus: '', nativeMode: 'off', semanticSearch: true };
const user = content => ({ role: 'user', content });

test('CTX-LEGACY-LATEST-VALID malformed late finals do not eclipse good checkpoint', () => {
  const records = [
    { tipo: 'messaggi-finali', versioneGiro: 2, messaggiFinali: [user('older')] },
    { tipo: 'checkpoint-ripresa', versioneGiro: 4, messaggi: [user('valid checkpoint')] },
    { tipo: 'messaggi-finali', versioneGiro: 8, messaggiFinali: 'malformed' },
    { tipo: 'messaggi-finali', versioneGiro: 9, messaggiFinali: [{ role: 'tool', content: 'unpaired' }] },
    { tipo: 'messaggi-finali', versioneGiro: 3, messaggiFinali: [user('late stale')] },
  ];
  assert.deepEqual(selectLastValidCheckpoint(records), { messages: [user('valid checkpoint')], versioneGiro: 4, recordIndex: 1 });
});

test('CTX-LEGACY-NONFINITE latest JSON body with overflowing number is invalid', () => {
  const entries = [
    { tipo: 'checkpoint-ripresa', versioneGiro: 1, messaggi: [user('valid')] },
    JSON.parse('{"tipo":"messaggi-finali","versioneGiro":2,"messaggiFinali":[{"role":"user","content":1e999}]}'),
  ];
  assert.equal(selectLastValidCheckpoint(entries).versioneGiro, 1);
});

test('CTX-LEGACY-SOURCE immutable exact source bytes, deterministic idempotency and damaged tail disclosure', async t => {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  const jsonl = `${JSON.stringify({ tipo: 'checkpoint-ripresa', versioneGiro: 4, messaggi: [user('original')] })}\r\n{"broken":`;
  const snapshot = await importLegacySession({ sessionId: 'legacy', jsonl, settings }, { store });
  assert.equal(snapshot.metadata.legacy.corruptTail, true);
  const archive = await store.exportSession({ sessionId: 'legacy' });
  assert.equal(Buffer.from(archive.blobs[0].base64, 'base64').toString(), jsonl);
  assert.equal(archive.records[0].message.content, 'original');
  assert.equal(archive.records[0].origin, 'legacy-jsonl');
  assert.equal(snapshot.metadata.legacy.records[0].recordId, archive.records[0].id);
  assert.deepEqual(await importLegacySession({ sessionId: 'legacy', jsonl, settings }, { store }), snapshot);
});

test('CTX-LEGACY-CORRUPTION rejects intermediate corrupt bytes without partial session', async t => {
  const store = createSqliteContextStore({ databasePath: ':memory:' });
  t.after(() => store.close());
  await assert.rejects(importLegacySession({ sessionId: 'bad', jsonl: '{broken\n{"tipo":"checkpoint-ripresa","messaggi":[]}', settings }, { store }), { code: 'CTX_LEGACY_CORRUPT' });
  assert.equal(await store.readContextSnapshot({ sessionId: 'bad' }), null);
});
