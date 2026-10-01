import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {DatabaseSync} from 'node:sqlite';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

const moduleUrl = new URL('../src/process-output-store.mjs', import.meta.url);
const api = await import(moduleUrl.href).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identity = () => ({sessionId: 'session-a', runId: 'run-a', toolCallId: 'tool-a', outputId: randomUUID()});
const scope = id => ({sessionId: id.sessionId, outputId: id.outputId});
async function bank(t, maxOutputBytes = 4 * 1024 * 1024) {
  assert.equal(typeof api.createProcessOutputStore, 'function', 'durable process output store contract is required');
  const root = mkdtempSync(join(tmpdir(), 'talos-process-output-')), databasePath = join(root, 'outputs.sqlite'), stores = [];
  t.after(async () => {
    for (const store of stores) await store.close();
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    rimuoviCartellaDiProva(root);
  });
  const open = async () => {const store = await api.createProcessOutputStore({databasePath, maxOutputBytes}); stores.push(store); return store;};
  return {root, databasePath, open, store: await open()};
}
async function begin(store) {const id = identity(); await store.begin(id); return id;}
const append = (store, id, sequence, bytes, stream = 'stdout') => store.append({...scope(id), sequence, stream, bytes: Buffer.from(bytes)});
const finish = (store, id, sequence, extra = {}) => store.finish({...scope(id), sequence, termination: 'exited', exitCode: 0, ...extra});

test('OUTPUT12-CONTRACT: durable output storage has an explicit public factory', () => {
  assert.equal(typeof api.createProcessOutputStore, 'function');
});
test('OUTPUT14-FOOTER: the verified control footer survives finish, retry and reopen', async t => {
  const b = await bank(t), id = await begin(b.store);
  const controlFooter = {type: 'cwd-marker-v1', stream: 'stdout', marker: '__TALOS_CWD_0123456789abcdef__'};
  const receipt = await finish(b.store, id, 0, {controlFooter});
  assert.deepEqual(receipt.controlFooter, controlFooter);
  assert.deepEqual((await finish(b.store, id, 0, {controlFooter})).controlFooter, controlFooter);
  await assert.rejects(finish(b.store, id, 0, {controlFooter: {...controlFooter, marker: '__TALOS_CWD_abcdef0123456789__'}}), e => e.code === 'OUTPUT_STATE_CONFLICT');
  await b.store.close(); assert.deepEqual((await (await b.open()).inspect(scope(id))).controlFooter, controlFooter);
});
test('OUTPUT14-FOOTER-INVALID: model-authored paths and arbitrary control markers cannot enter the manifest', async t => {
  const b = await bank(t), id = await begin(b.store);
  for (const controlFooter of [{type: 'cwd-marker-v1', stream: 'stderr', marker: '__TALOS_CWD_0123456789abcdef__'}, {type: 'cwd-marker-v1', stream: 'stdout', marker: 'C:/secret'}, []]) {
    await assert.rejects(finish(b.store, id, 0, {controlFooter}), e => e.code === 'OUTPUT_INVALID_INPUT');
  }
  assert.equal((await b.store.inspect(scope(id))).state, 'recording');
});
test('OUTPUT14-MIGRATE: schema one records and raw bytes survive the additive schema three migration', async t => {
  const b = await bank(t), id = await begin(b.store); await append(b.store, id, 0, 'unchanged'); await finish(b.store, id, 1);
  await b.store.close();
  const sql = new DatabaseSync(b.databasePath);
  sql.exec('DROP TABLE output_session_deletions; ALTER TABLE output_captures DROP COLUMN control_footer; PRAGMA user_version=1;'); sql.close();
  const reopened = await b.open();
  assert.equal((await reopened.health()).schemaVersion, 3);
  assert.equal(Buffer.from((await reopened.readPage({...scope(id), stream: 'stdout'})).bytes).toString(), 'unchanged');
});
test('OUTPUT12-BYTES: raw bytes, split UTF8 and stream identity survive reopen and byte pagination', async t => {
  const b = await bank(t), id = await begin(b.store);
  const out = Buffer.from([0x00, 0xff, 0xf0, 0x9f, 0x99, 0x82]), err = Buffer.from('errore\r\n');
  await append(b.store, id, 0, out.subarray(0, 3));
  await append(b.store, id, 1, err, 'stderr');
  await append(b.store, id, 2, out.subarray(3));
  const done = await finish(b.store, id, 3);
  assert.equal(done.state, 'complete'); assert.equal(done.stdout.sha256, hash(out)); assert.equal(done.stderr.sha256, hash(err));
  await b.store.close(); const reopened = await b.open();
  const a = await reopened.readPage({...scope(id), stream: 'stdout', offset: 1, limit: 4});
  assert.deepEqual(Buffer.from(a.bytes), out.subarray(1, 5)); assert.equal(a.nextOffset, 5);
  assert.equal(a.manifest.toolCallId, id.toolCallId); assert.equal(a.manifest.runId, id.runId);
  const z = await reopened.readPage({...scope(id), stream: 'stdout', offset: a.nextOffset});
  assert.deepEqual(Buffer.from(z.bytes), out.subarray(5)); assert.equal(z.nextOffset, null);
  assert.deepEqual(Buffer.from((await reopened.readPage({...scope(id), stream: 'stderr'})).bytes), err);
});
test('OUTPUT12-LARGE: more than one MiB is retained and retrieved without a full-result read API', async t => {
  const b = await bank(t), id = await begin(b.store), expected = createHash('sha256');
  for (let i = 0; i < 33; i++) {const chunk = Buffer.alloc(65_536, i); expected.update(chunk); await append(b.store, id, i, chunk);}
  const done = await finish(b.store, id, 33), digest = expected.digest('hex');
  assert.equal(done.storedBytes, 33 * 65_536); assert.equal(done.stdout.sha256, digest);
  await b.store.close(); const reopened = await b.open(), actual = createHash('sha256');
  let offset = 0, count = 0;
  do {const page = await reopened.readPage({...scope(id), stream: 'stdout', offset, limit: 31_337}); assert.ok(page.bytes.length <= 31_337); actual.update(page.bytes); offset = page.nextOffset; count++;} while (offset !== null);
  assert.ok(count > 33); assert.equal(actual.digest('hex'), digest);
});
test('OUTPUT12-EMPTY: an empty successful capture is complete with the hash of empty bytes', async t => {
  const {store} = await bank(t), id = await begin(store), done = await finish(store, id, 0);
  assert.equal(done.state, 'complete'); assert.equal(done.stdout.sha256, hash(Buffer.alloc(0)));
  const page = await store.readPage({...scope(id), stream: 'stderr'});
  assert.equal(page.bytes.length, 0); assert.equal(page.nextOffset, null); assert.equal(page.availableBytes, 0);
});
test('OUTPUT12-LIMIT: a capture cap is explicit, shared by streams and distinct from the real observed length', async t => {
  const {store} = await bank(t, 5), id = await begin(store);
  await append(store, id, 0, 'abc'); await append(store, id, 1, 'DEFG', 'stderr'); await append(store, id, 2, 'hi');
  const done = await finish(store, id, 3);
  assert.equal(done.state, 'limited'); assert.equal(done.observedBytes, 9); assert.equal(done.storedBytes, 5); assert.equal(done.limitBytes, 5);
  assert.deepEqual(done.stdout, {observedBytes: 5, storedBytes: 3, sha256: hash(Buffer.from('abc'))});
  assert.equal(Buffer.from((await store.readPage({...scope(id), stream: 'stderr'})).bytes).toString(), 'DE');
  assert.equal(done.stderr.observedBytes, 4); assert.equal(done.stderr.storedBytes, 2);
});
test('OUTPUT12-SEQUENCE: only the last identical append can be retried; gaps and changed payload are rejected', async t => {
  const {store} = await bank(t), id = await begin(store);
  await append(store, id, 0, 'first');
  const duplicate = await append(store, id, 0, 'first'); assert.equal(duplicate.duplicate, true);
  await assert.rejects(append(store, id, 0, 'changed'), {code: 'OUTPUT_SEQUENCE_CONFLICT'});
  await assert.rejects(append(store, id, 2, 'gap'), {code: 'OUTPUT_SEQUENCE_CONFLICT'});
  await append(store, id, 1, 'second');
  await assert.rejects(append(store, id, 0, 'first'), {code: 'OUTPUT_SEQUENCE_CONFLICT'});
  const done = await finish(store, id, 2); assert.equal(done.observedBytes, 11);
  assert.deepEqual(await finish(store, id, 2), done);
  await assert.rejects(finish(store, id, 2, {exitCode: 1}), {code: 'OUTPUT_STATE_CONFLICT'});
});
test('OUTPUT12-OWNERSHIP: another session cannot inspect, read, mutate or replace an output', async t => {
  const {store} = await bank(t), id = await begin(store);
  await append(store, id, 0, 'private');
  for (const action of [() => store.inspect({...scope(id), sessionId: 'foreign'}), () => store.readPage({...scope(id), sessionId: 'foreign', stream: 'stdout'}), () => append(store, {...id, sessionId: 'foreign'}, 1, 'x')]) await assert.rejects(action(), {code: 'OUTPUT_NOT_FOUND'});
  await assert.rejects(store.begin({...id, sessionId: 'foreign'}), {code: 'OUTPUT_ID_CONFLICT'});
  assert.equal((await store.inspect(scope(id))).observedBytes, 7);
});
test('OUTPUT12-WRITER: a second store cannot take ownership of another live or interrupted capture', async t => {
  const b = await bank(t), id = await begin(b.store), other = await b.open();
  await assert.rejects(append(other, id, 0, 'foreign writer'), {code: 'OUTPUT_WRITER_MISMATCH'});
  await append(b.store, id, 0, 'kept'); await b.store.close();
  assert.equal((await other.inspect(scope(id))).state, 'recording');
  await assert.rejects(finish(other, id, 1), {code: 'OUTPUT_WRITER_MISMATCH'});
  assert.equal(Buffer.from((await other.readPage({...scope(id), stream: 'stdout'})).bytes).toString(), 'kept');
});
test('OUTPUT12-CRASH: a killed parent process leaves acknowledged bytes recoverable, never falsely complete', async t => {
  const b = await bank(t), id = identity(); await b.store.close();
  const script = join(b.root, 'writer.mjs');
  writeFileSync(script, `import {createProcessOutputStore} from ${JSON.stringify(moduleUrl.href)};const s=await createProcessOutputStore(${JSON.stringify({databasePath: b.databasePath, maxOutputBytes: 65536})});await s.begin(${JSON.stringify(id)});await s.append({...${JSON.stringify(scope(id))},sequence:0,stream:'stdout',bytes:Buffer.from('DURABLE BEFORE CRASH')});process.send('committed');setInterval(()=>{},1000);`);
  const child = fork(script, [], {execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
  const exited = once(child, 'exit');
  t.after(async () => {if (child.exitCode === null && child.signalCode === null) child.kill(); await exited;});
  const message = await Promise.race([once(child, 'message'), exited.then(() => {throw Error('writer exited before durable ACK');})]);
  assert.equal(message[0], 'committed'); child.kill(); await exited;
  const recovered = await b.open(), page = await recovered.readPage({...scope(id), stream: 'stdout'});
  assert.equal(Buffer.from(page.bytes).toString(), 'DURABLE BEFORE CRASH'); assert.equal(page.manifest.state, 'recording');
  await assert.rejects(append(recovered, id, 1, 'not resumed'), {code: 'OUTPUT_WRITER_MISMATCH'});
});
test('OUTPUT12-ATOMIC: failed metadata update rolls back payload insertion and permits a verified retry', async t => {
  const b = await bank(t), id = await begin(b.store), sql = new DatabaseSync(b.databasePath);
  try {
    sql.exec("CREATE TRIGGER injected_failure BEFORE UPDATE ON output_captures BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    await assert.rejects(append(b.store, id, 0, 'rollback'), {code: 'OUTPUT_STORE_IO'});
    assert.equal(sql.prepare('SELECT count(*) AS n FROM output_chunks').get().n, 0);
    sql.exec('DROP TRIGGER injected_failure');
    assert.equal((await b.store.inspect(scope(id))).nextSequence, 0);
    await append(b.store, id, 0, 'retry'); assert.equal((await finish(b.store, id, 1)).storedBytes, 5);
  } finally {sql.close();}
});
for (const tamper of ['bytes', 'missing']) test(`OUTPUT12-CORRUPT-${tamper}: corrupt or missing retained bytes are never returned as a valid page`, async t => {
  const b = await bank(t), id = await begin(b.store); await append(b.store, id, 0, 'original'); await finish(b.store, id, 1); await b.store.close();
  const sql = new DatabaseSync(b.databasePath);
  try {sql.exec(tamper === 'bytes' ? "UPDATE output_chunks SET bytes=x'0102030405060708'" : 'DELETE FROM output_chunks');} finally {sql.close();}
  const reopened = await b.open(); await assert.rejects(reopened.readPage({...scope(id), stream: 'stdout'}), {code: 'OUTPUT_INTEGRITY_FAILED'});
});
test('OUTPUT12-FAILED: an explicit persistence failure retains the prefix with a durable failed state', async t => {
  const {store} = await bank(t), id = await begin(store); await append(store, id, 0, 'prefix');
  const failed = await store.fail({...scope(id), sequence: 1, code: 'OUTPUT_DISK_FULL'});
  assert.equal(failed.state, 'failed'); assert.equal(failed.errorCode, 'OUTPUT_DISK_FULL');
  await assert.rejects(append(store, id, 1, 'late'), {code: 'OUTPUT_STATE_CONFLICT'});
  assert.equal(Buffer.from((await store.readPage({...scope(id), stream: 'stdout'})).bytes).toString(), 'prefix');
});
for (const termination of ['cancelled', 'timeout', 'spawn-error']) test(`OUTPUT12-OUTCOME-${termination}: capture completeness does not turn process failure into success`, async t => {
  const {store} = await bank(t), id = await begin(store); await append(store, id, 0, 'diagnostic', 'stderr');
  const done = await finish(store, id, 1, {termination, exitCode: null});
  assert.equal(done.state, 'complete'); assert.equal(done.termination, termination); assert.equal(done.exitCode, null);
});
test('OUTPUT12-INPUT: limits, malformed IDs and a too-large chunk fail before a write', async t => {
  const {store} = await bank(t), id = await begin(store);
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(65_537), 'not bytes']) await assert.rejects(store.append({...scope(id), sequence: 0, stream: 'stdout', bytes}), {code: 'OUTPUT_INVALID_INPUT'});
  for (const extra of [{stream: 'combined'}, {offset: -1}, {offset: 0.5}, {limit: 0}, {limit: 65_537}]) await assert.rejects(store.readPage({...scope(id), stream: 'stdout', ...extra}), {code: 'OUTPUT_INVALID_INPUT'});
  await assert.rejects(store.begin({...identity(), sessionId: 'bad\0id'}), {code: 'OUTPUT_INVALID_INPUT'});
  assert.equal((await store.inspect(scope(id))).observedBytes, 0);
});
test('OUTPUT12-SCHEMA: an unrelated database is rejected without replacing its data', async t => {
  const b = await bank(t); await b.store.close();
  const foreign = join(b.root, 'foreign.sqlite'), sql = new DatabaseSync(foreign);
  sql.exec("CREATE TABLE sentinel(value TEXT);INSERT INTO sentinel VALUES('keep');PRAGMA user_version=99;"); sql.close();
  await assert.rejects(api.createProcessOutputStore({databasePath: foreign, maxOutputBytes: 64}), {code: 'OUTPUT_SCHEMA_UNSUPPORTED'});
  const check = new DatabaseSync(foreign); try {assert.equal(check.prepare('SELECT value FROM sentinel').get().value, 'keep'); assert.equal(check.prepare('PRAGMA user_version').get().user_version, 99);} finally {check.close();}
});
test('OUTPUT12-COPY: only the bounded view is copied and later caller mutation cannot alter submitted bytes', async t => {
  const {store} = await bank(t), id = await begin(store), backing = Buffer.alloc(1_000_000), view = backing.subarray(20, 23); view.set([1, 2, 3]);
  const pending = store.append({...scope(id), sequence: 0, stream: 'stdout', bytes: view}); view.fill(9); await pending;
  assert.deepEqual(Buffer.from((await store.readPage({...scope(id), stream: 'stdout'})).bytes), Buffer.from([1, 2, 3]));
});
test('OUTPUT12-BACKPRESSURE: excess requests are rejected before dispatch and the store remains usable', async t => {
  const {store} = await bank(t), id = await begin(store);
  const requests = Array.from({length: 65}, () => store.inspect(scope(id)));
  const results = await Promise.allSettled(requests), rejected = results.filter(r => r.status === 'rejected');
  assert.equal(rejected.length, 1); assert.equal(rejected[0].reason.code, 'OUTPUT_STORE_BUSY');
  await append(store, id, 0, 'still usable'); assert.equal((await finish(store, id, 1)).state, 'complete');
});
test('OUTPUT12-CLOSE: admitted writes settle before close; close is idempotent and new calls are rejected', async t => {
  const b = await bank(t), id = await begin(b.store), write = append(b.store, id, 0, 'before close'), closing = b.store.close();
  await write; await closing; await b.store.close();
  await assert.rejects(b.store.inspect(scope(id)), {code: 'OUTPUT_STORE_CLOSED'});
  const reopened = await b.open(); assert.equal((await reopened.inspect(scope(id))).storedBytes, 12);
});
test('OUTPUT12-UPSTREAM: the real SQLite connection uses FULL sync, WAL, foreign keys and schema3', async t => {
  const {store} = await bank(t), health = await store.health();
  assert.match(health.sqliteVersion, /^3\./); assert.equal(health.journalMode, 'wal'); assert.equal(health.synchronous, 2); assert.equal(health.foreignKeys, 1); assert.equal(health.schemaVersion, 3);
});
