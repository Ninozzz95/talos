/*
 * L3-3 (owner 13/10/2026, D1 + D2: «solo l'ULTIMA per conversazione, ed esportabile») — le copie dell'archivio messe da parte.
 *
 * Prima: ogni riparazione lasciava una copia in più (+~4 MB ogni 1.000 messaggi), per sempre, e nessuna operazione supportata
 * sapeva leggerla (`exportSession` moriva con «Invalid original provenance»: gli originali, giustamente intatti, portano l'id
 * della conversazione viva).
 * Ora: la copia DICHIARA di chi era (`metadata.aside`), si esporta come l'archivio di quella conversazione a quel momento, si
 * elenca, e le più vecchie si cancellano — SOLO dopo che la copia da tenere è stata riletta e verificata per intero.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createSqliteContextStore } from '../src/node/sqlite-store.mjs';
import { verifyContextArchive } from '../src/node/context-export.mjs';

const settings = { auto: true, model: { mode: 'follow-session' }, triggerRatio: .75, targetRatio: .55, retainRecentTurns: 2, focus: '', nativeMode: 'off', semanticSearch: true };
const createdAt = '2026-09-08T00:00:00.000Z';
const record = (id, content = id) => ({ id, message: { role: 'user', content }, createdAt });

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'talos-context-aside-'));
  const databasePath = join(directory, 'context.sqlite');
  const store = createSqliteContextStore({ databasePath, ...options });
  t.after(async () => { await store.close().catch(() => {}); await rm(directory, { recursive: true, force: true }); });
  await store.initSession({ sessionId: 'a', settings });
  return { store, databasePath };
}
/** Scrive una storia nella sessione viva e la mette da parte sotto `asideId`. */
async function giro(store, asideId, contenuti) {
  const prima = await store.readContextSnapshot({ sessionId: 'a' });
  await store.appendOriginalBatch({ sessionId: 'a', records: contenuti.map((c, i) => record(`r${i + 1}`, c)), expectedRevision: prima.revision });
  return store.setAsideSession({ sessionId: 'a', asideId });
}
const contenuti = async (store, sessionId) => (await store.readOriginals({ sessionId })).map((r) => r.message.content);

test('ASIDE-01: a copy set aside declares whose it was, is listed, and is exported as a verified archive of that conversation', async (t) => {
  const { store } = await fixture(t);
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1', 'uno'), record('r2', 'due')], expectedRevision: 0 });
  await store.upsertProtectedFact({ sessionId: 'a', expectedRevision: (await store.readContextSnapshot({ sessionId: 'a' })).revision, fact: { id: 'f1', text: 'The project uses Node 24', status: 'active', revision: 0, sources: [{ recordId: 'r1', quote: 'uno' }] } });
  await store.setAsideSession({ sessionId: 'a', asideId: 'a.aside-1700000000000-aaaaaaaa' });

  const elenco = await store.listAsideSessions({ sessionId: 'a' });
  assert.deepEqual(elenco.map((c) => [c.asideId, c.records]), [['a.aside-1700000000000-aaaaaaaa', 2]]);
  assert.match(elenco[0].asideAt, /^\d{4}-\d{2}-\d{2}T/u);

  const archivio = await store.exportSession({ sessionId: 'a.aside-1700000000000-aaaaaaaa' });
  verifyContextArchive(archivio); // è un archivio VERO: manifesto, provenienza, impronte
  assert.equal(archivio.session.sessionId, 'a', 'è l’archivio della conversazione a cui apparteneva');
  assert.deepEqual({ id: archivio.session.metadata.aside.id, of: archivio.session.metadata.aside.of }, { id: 'a.aside-1700000000000-aaaaaaaa', of: 'a' }, 'e dichiara di essere una copia da parte');
  assert.deepEqual(archivio.records.map((r) => r.message.content), ['uno', 'due']);
  assert.deepEqual(archivio.facts.map((f) => f.sources.map((s) => s.recordId)), [['r1']], 'con le sue fonti');

  /* al contrario: la viva si esporta come prima e NON dichiara niente; una copia che non esiste non si inventa */
  const viva = await store.exportSession({ sessionId: 'a' });
  assert.equal(viva.session.sessionId, 'a');
  assert.equal(Object.hasOwn(viva.session.metadata ?? {}, 'aside'), false);
  await assert.rejects(store.exportSession({ sessionId: 'a.aside-9-zzzzzzzz' }), { code: 'CTX_SESSION_NOT_FOUND' });
  /* l'elenco è della conversazione chiesta, non di una che comincia uguale */
  await store.initSession({ sessionId: 'a.b', settings });
  await store.appendOriginalBatch({ sessionId: 'a.b', records: [record('x')], expectedRevision: 0 });
  await store.setAsideSession({ sessionId: 'a.b', asideId: 'a.b.aside-1-bbbbbbbb' });
  assert.deepEqual((await store.listAsideSessions({ sessionId: 'a' })).map((c) => c.asideId), ['a.aside-1700000000000-aaaaaaaa']);
});

test('ASIDE-02: pruning keeps the live archive and the copy named, removes the older ones, and the guards are back', async (t) => {
  const { store, databasePath } = await fixture(t);
  await giro(store, 'a.aside-1-aaaaaaaa', ['storia 1']);
  await giro(store, 'a.aside-2-bbbbbbbb', ['storia 2', 'storia 2 bis']);
  await giro(store, 'a.aside-3-cccccccc', ['storia 3']);
  const viva = await store.readContextSnapshot({ sessionId: 'a' });
  await store.appendOriginalBatch({ sessionId: 'a', records: [record('r1', 'storia viva')], expectedRevision: viva.revision });
  assert.equal((await store.listAsideSessions({ sessionId: 'a' })).length, 3, 'il controllo positivo: prima sono tre');

  const esito = await store.pruneAsideSessions({ sessionId: 'a', keep: 'a.aside-3-cccccccc' });
  assert.deepEqual(esito.removed.sort(), ['a.aside-1-aaaaaaaa', 'a.aside-2-bbbbbbbb']);
  assert.deepEqual((await store.listAsideSessions({ sessionId: 'a' })).map((c) => c.asideId), ['a.aside-3-cccccccc']);
  assert.deepEqual(await contenuti(store, 'a'), ['storia viva'], 'la viva è intatta');
  assert.deepEqual(await contenuti(store, 'a.aside-3-cccccccc'), ['storia 3'], 'l’ultima da parte è intatta');
  verifyContextArchive(await store.exportSession({ sessionId: 'a.aside-3-cccccccc' }));
  verifyContextArchive(await store.exportSession({ sessionId: 'a' }));
  assert.equal(await store.readContextSnapshot({ sessionId: 'a.aside-1-aaaaaaaa' }), null);
  assert.equal((await store.health()).integrity, 'ok');
  /* rifarlo non toglie altro */
  assert.deepEqual((await store.pruneAsideSessions({ sessionId: 'a', keep: 'a.aside-3-cccccccc' })).removed, []);
  await store.close();
  const db = new DatabaseSync(databasePath);
  try {
    for (const tabella of ['original_records', 'context_versions', 'summary_nodes', 'compaction_jobs', 'search_chunks', 'context_measurements', 'usage_records', 'protected_facts', 'record_assets', 'context_sessions']) {
      assert.equal(db.prepare(`SELECT count(*) AS n FROM ${tabella} WHERE session_id IN ('a.aside-1-aaaaaaaa','a.aside-2-bbbbbbbb')`).get().n, 0, `niente resta in ${tabella}`);
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('originals_no_update','originals_no_delete','versions_no_update','versions_no_delete','assets_no_update')").get().n, 5);
    assert.throws(() => db.prepare('DELETE FROM original_records').run(), /immutable/);
    assert.throws(() => db.prepare('UPDATE original_records SET record_json=?').run('{}'), /immutable/);
  } finally { db.close(); }
});

test('ASIDE-03, the other way round: nothing is removed unless the copy to keep exists, belongs to the conversation and reads back whole', async (t) => {
  const { store, databasePath } = await fixture(t);
  await giro(store, 'a.aside-1-aaaaaaaa', ['storia 1']);
  await giro(store, 'a.aside-2-bbbbbbbb', ['storia 2']);
  const tutte = async () => (await store.listAsideSessions({ sessionId: 'a' })).map((c) => c.asideId).sort();
  /* la copia da tenere non esiste (non è stata scritta) */
  await assert.rejects(store.pruneAsideSessions({ sessionId: 'a', keep: 'a.aside-9-zzzzzzzz' }), { code: 'CTX_SESSION_NOT_FOUND' });
  /* non è una copia di QUESTA conversazione: né la viva, né una di un'altra */
  await assert.rejects(store.pruneAsideSessions({ sessionId: 'a', keep: 'a' }), { code: 'CTX_INVALID_INPUT' });
  await store.initSession({ sessionId: 'b', settings });
  await store.appendOriginalBatch({ sessionId: 'b', records: [record('x')], expectedRevision: 0 });
  await store.setAsideSession({ sessionId: 'b', asideId: 'b.aside-1-cccccccc' });
  await assert.rejects(store.pruneAsideSessions({ sessionId: 'a', keep: 'b.aside-1-cccccccc' }), { code: 'CTX_INVALID_INPUT' });
  assert.deepEqual(await tutte(), ['a.aside-1-aaaaaaaa', 'a.aside-2-bbbbbbbb']);
  /* la copia da tenere c'è ma NON si rilegge intera (un originale manomesso sul disco): non si cancella niente */
  await store.close();
  const db = new DatabaseSync(databasePath);
  db.exec('DROP TRIGGER originals_no_update');
  db.prepare("UPDATE original_records SET record_json=json_set(record_json,'$.sha256','0000000000000000000000000000000000000000000000000000000000000000') WHERE session_id='a.aside-2-bbbbbbbb'").run();
  db.close();
  const riaperto = createSqliteContextStore({ databasePath });
  try {
    await assert.rejects(riaperto.pruneAsideSessions({ sessionId: 'a', keep: 'a.aside-2-bbbbbbbb' }), { code: 'CTX_ARCHIVE_INVALID' });
    assert.deepEqual((await riaperto.listAsideSessions({ sessionId: 'a' })).map((c) => c.asideId).sort(), ['a.aside-1-aaaaaaaa', 'a.aside-2-bbbbbbbb'], 'la copia più vecchia è ancora lì');
    assert.deepEqual((await riaperto.readOriginals({ sessionId: 'a.aside-1-aaaaaaaa' })).map((r) => r.message.content), ['storia 1']);
  } finally { await riaperto.close(); }
});

for (const faultPoint of ['prune-after-delete', 'crash-prune-after-delete']) {
  test(`ASIDE-CRASH ${faultPoint}: a pruning that dies half way removed nothing, and the guards are there`, async (t) => {
    const { store, databasePath } = await fixture(t, { faultPoint });
    await giro(store, 'a.aside-1-aaaaaaaa', ['storia 1']);
    await giro(store, 'a.aside-2-bbbbbbbb', ['storia 2']);
    await assert.rejects(store.pruneAsideSessions({ sessionId: 'a', keep: 'a.aside-2-bbbbbbbb' }), { code: faultPoint.startsWith('crash') ? 'CTX_WORKER_EXIT' : 'CTX_PERSISTENCE_FAILED' });
    await store.close().catch(() => {});
    const riaperto = createSqliteContextStore({ databasePath });
    try {
      assert.deepEqual((await riaperto.readOriginals({ sessionId: 'a.aside-1-aaaaaaaa' })).map((r) => r.message.content), ['storia 1']);
      assert.equal((await riaperto.listAsideSessions({ sessionId: 'a' })).length, 2);
      assert.equal((await riaperto.health()).integrity, 'ok');
    } finally { await riaperto.close(); }
    const db = new DatabaseSync(databasePath);
    try {
      assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('originals_no_delete','versions_no_delete')").get().n, 2);
      assert.throws(() => db.prepare('DELETE FROM original_records').run(), /immutable/);
    } finally { db.close(); }
  });
}

test('ASIDE-04: a copy set aside BEFORE this change (no declaration) is still recognised from its id, listed and exported', async (t) => {
  const { store, databasePath } = await fixture(t);
  await giro(store, 'a.aside-1700000000000-aaaaaaaa', ['storia vecchia']);
  await store.close();
  const db = new DatabaseSync(databasePath);
  db.prepare("UPDATE context_sessions SET metadata_json=json_remove(metadata_json,'$.aside') WHERE session_id='a.aside-1700000000000-aaaaaaaa'").run();
  db.close();
  const riaperto = createSqliteContextStore({ databasePath });
  try {
    assert.deepEqual((await riaperto.listAsideSessions({ sessionId: 'a' })).map((c) => c.asideId), ['a.aside-1700000000000-aaaaaaaa']);
    const archivio = await riaperto.exportSession({ sessionId: 'a.aside-1700000000000-aaaaaaaa' });
    assert.equal(archivio.session.sessionId, 'a');
    assert.deepEqual(archivio.records.map((r) => r.message.content), ['storia vecchia']);
  } finally { await riaperto.close(); }
});
