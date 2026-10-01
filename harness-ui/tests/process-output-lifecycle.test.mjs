import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, mkdirSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {deleteSessionWithOutput, recoverProcessOutputDeletions} from '../src/process-output-lifecycle.mjs';
import {esisteSessionePersistita} from '../src/session-store.mjs';
import {rimuoviCartellaDiProvaAttesa} from './aiuto/rimuovi-cartella-di-prova.mjs';

async function bank(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-lifecycle18-')), databasePath = join(root, 'outputs.sqlite'), stores = [];
  t.after(async () => {
    for (const store of stores) await store.close();
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    await rimuoviCartellaDiProvaAttesa(root);
  });
  const open = async () => {const s = await createProcessOutputStore({databasePath, maxOutputBytes: 100_000}); stores.push(s); return s;};
  return {root, databasePath, open, store: await open()};
}
const request = (sessionId = 'session18') => ({sessionId, operationId: randomUUID()});
const key = id => ({sessionId: id.sessionId, outputId: id.outputId});
async function capture(store, sessionId = 'session18', settled = true) {
  const id = {sessionId, runId: 'run18', toolCallId: 'tool18', outputId: randomUUID()};
  await store.begin(id);
  await store.append({...key(id), sequence: 0, stream: 'stdout', bytes: Buffer.from([0, 255, 1, 2])});
  if (settled) await store.finish({...key(id), sequence: 1, termination: 'exited', exitCode: 0});
  return id;
}
const bytes = async (store, id) => Buffer.from((await store.readPage({...key(id), stream: 'stdout'})).bytes);
function query(path, sql) {const db = new DatabaseSync(path); try {return db.prepare(sql).all();} finally {db.close();}}

test('OUTPUT18-TOKEN: fenced deletion is scoped, token-bound and idempotent without deleting later output', async t => {
  const b = await bank(t), id = await capture(b.store), other = await capture(b.store, 'other18'), req = request();
  const receipt = await b.store.beginSessionDeletion(req);
  assert.deepEqual(await b.store.beginSessionDeletion(request()), receipt);
  for (const method of ['cancelSessionDeletion', 'completeSessionDeletion']) await assert.rejects(b.store[method](request()), {code: 'OUTPUT_DELETE_CONFLICT'});
  await assert.rejects(b.store.readPage({...key(id), stream: 'stdout'}), {code: 'OUTPUT_SESSION_DELETING'});
  await assert.rejects(b.store.begin({...id, outputId: randomUUID()}), {code: 'OUTPUT_SESSION_DELETING'});
  assert.deepEqual(await bytes(b.store, other), Buffer.from([0, 255, 1, 2]));
  assert.deepEqual(await b.store.completeSessionDeletion(req), {state: 'complete', capturesRemoved: 1, bytesRemoved: 4});
  assert.deepEqual(await b.store.completeSessionDeletion(req), {state: 'complete', capturesRemoved: 0, bytesRemoved: 0});
  const later = await capture(b.store);
  await assert.rejects(b.store.completeSessionDeletion(req), {code: 'OUTPUT_DELETE_CONFLICT'});
  assert.deepEqual(await bytes(b.store, later), Buffer.from([0, 255, 1, 2]));
  assert.equal(query(b.databasePath, 'SELECT count(*) AS n FROM output_chunks')[0].n, 2);
});

test('OUTPUT18-BUSY: active writer blocks delete; interrupted writer can be deleted after reopen', async t => {
  const b = await bank(t), id = await capture(b.store, 'session18', false), req = request();
  await assert.rejects(b.store.beginSessionDeletion(req), {code: 'OUTPUT_SESSION_BUSY'});
  assert.equal((await b.store.listSessionDeletions({})).items.length, 0);
  await b.store.close(); const reopened = await b.open();
  await reopened.beginSessionDeletion(req);
  await assert.rejects(reopened.append({...key(id), sequence: 1, stream: 'stdout', bytes: Buffer.from('x')}), {code: 'OUTPUT_SESSION_DELETING'});
  await reopened.completeSessionDeletion(req);
  await assert.rejects(reopened.inspect(key(id)), {code: 'OUTPUT_NOT_FOUND'});
});

test('OUTPUT18-ROLLBACK: failure after chunk deletion preserves chunks, manifest and intent', async t => {
  const b = await bank(t), id = await capture(b.store), req = request();
  await b.store.beginSessionDeletion(req);
  const db = new DatabaseSync(b.databasePath);
  try {
    db.exec("CREATE TRIGGER deny18 BEFORE DELETE ON output_captures BEGIN SELECT RAISE(ABORT,'denied18'); END;");
    await assert.rejects(b.store.completeSessionDeletion(req));
    assert.equal(db.prepare('SELECT count(*) AS n FROM output_chunks').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM output_captures').get().n, 1);
    assert.equal((await b.store.listSessionDeletions({})).items.length, 1);
    db.exec('DROP TRIGGER deny18');
  } finally {db.close();}
  await b.store.cancelSessionDeletion(req);
  assert.deepEqual(await bytes(b.store, id), Buffer.from([0, 255, 1, 2]));
});

test('OUTPUT18-PAGES: recovery covers more than one page and never skips entries while deleting them', async t => {
  const b = await bank(t);
  for (let n = 130; n >= 0; n--) await b.store.beginSessionDeletion(request(`session${String(n).padStart(3, '0')}`));
  const first = await b.store.listSessionDeletions({limit: 2});
  assert.deepEqual(first.items.map(r => r.sessionId), ['session000', 'session001']); assert.equal(first.nextAfter, 'session001');
  const seen = [];
  const result = await recoverProcessOutputDeletions({store: b.store, sessionExists: async id => {seen.push(id); return id === 'session130';}});
  assert.deepEqual(result, {completed: 130, cancelled: 1});
  assert.equal(new Set(seen).size, 131); assert.equal((await b.store.listSessionDeletions({})).items.length, 0);
});

test('OUTPUT18-INPUT: lifecycle requests reject malformed IDs, extra fields and unbounded pages', async t => {
  const {store} = await bank(t);
  for (const args of [{limit: 0}, {limit: 257}, {limit: 1.5}, {limit: '2'}, {offset: 3}, {after: ''}]) await assert.rejects(store.listSessionDeletions(args), {code: 'OUTPUT_INVALID_INPUT'});
  for (const method of ['beginSessionDeletion', 'cancelSessionDeletion', 'completeSessionDeletion']) {
    for (const args of [{sessionId: 'x'}, {...request(), operationId: 'bad'}, {...request(), extra: true}, {...request(), sessionId: ''}]) await assert.rejects(store[method](args), {code: 'OUTPUT_INVALID_INPUT'});
  }
});

test('OUTPUT18-MIGRATE2: version two upgrades without changing raw bytes or their hash', async t => {
  const b = await bank(t), id = await capture(b.store), manifest = await b.store.inspect(key(id));
  await b.store.close();
  const db = new DatabaseSync(b.databasePath);
  try {db.exec('DROP TABLE output_session_deletions; DROP INDEX output_capture_sessions; PRAGMA user_version=2;');} finally {db.close();}
  const reopened = await b.open();
  assert.equal((await reopened.health()).schemaVersion, 3);
  assert.deepEqual(await reopened.inspect(key(id)), manifest);
  assert.deepEqual(await bytes(reopened, id), Buffer.from([0, 255, 1, 2]));
});

test('OUTPUT18-UNKNOWN: unknown journal state preserves both pending intent and bytes', async t => {
  const b = await bank(t), id = await capture(b.store), req = request(); await b.store.beginSessionDeletion(req);
  await assert.rejects(recoverProcessOutputDeletions({store: b.store, sessionExists: async () => undefined}), TypeError);
  await assert.rejects(recoverProcessOutputDeletions({store: b.store, sessionExists: async () => {throw Object.assign(new Error('denied'), {code: 'EACCES'});}}), {code: 'EACCES'});
  assert.equal((await b.store.listSessionDeletions({})).items.length, 1);
  await b.store.cancelSessionDeletion(req); assert.equal((await bytes(b.store, id)).length, 4);
});

test('OUTPUT18-UNLINK: failed journal removal preserves bytes, cancels intent and retains original error', async t => {
  const b = await bank(t), id = await capture(b.store), failure = Object.assign(new Error('denied'), {code: 'EACCES'});
  await assert.rejects(deleteSessionWithOutput({store: b.store, sessionId: id.sessionId, deleteJournal: async () => {throw failure;}}), error => error === failure);
  assert.equal((await b.store.listSessionDeletions({})).items.length, 0); assert.equal((await bytes(b.store, id)).length, 4);
});

test('OUTPUT18-JOURNAL: only verified absence authorizes cleanup; links and unreadable paths fail closed', async t => {
  const b = await bank(t), cartellaStore = b.root;
  const inspect = sessionId => esisteSessionePersistita({cartellaStore, sessionId});
  assert.equal(await inspect('absent18'), false);
  writeFileSync(join(b.root, 'present18.jsonl'), 'not valid JSON: presence still protects data');
  assert.equal(await inspect('present18'), true);
  mkdirSync(join(b.root, 'directory18.jsonl'));
  symlinkSync(join(b.root, 'directory18.jsonl'), join(b.root, 'link18.jsonl'), 'junction');
  for (const id of ['directory18', 'link18', '../escape', 'a/b', 'a\\b', '.', '']) await assert.rejects(inspect(id), {code: 'SESSION_STORE_INSPECTION_FAILED'});
  await assert.rejects(esisteSessionePersistita({cartellaStore, sessionId: 'present18'}, {lstatFn: async () => {throw Object.assign(new Error('denied'), {code: 'EACCES'});}}), {code: 'SESSION_STORE_INSPECTION_FAILED'});
});

for (const unlink of [false, true]) test(`OUTPUT18-CRASH-${unlink ? 'AFTER' : 'BEFORE'}: a killed process recovers according to the durable journal state`, {timeout: 15_000}, async t => {
  const b = await bank(t), id = await capture(b.store);
  await b.store.close();
  const journal = join(b.root, 'session18.jsonl'); writeFileSync(journal, '{}\n');
  const script = join(b.root, 'crash.mjs');
  writeFileSync(script, `import {createProcessOutputStore} from ${JSON.stringify(new URL('../src/process-output-store.mjs', import.meta.url).href)};
import {unlinkSync} from 'node:fs';
const store=await createProcessOutputStore(${JSON.stringify({databasePath: b.databasePath, maxOutputBytes: 100_000})});
await store.beginSessionDeletion(${JSON.stringify(request())});
${unlink ? `unlinkSync(${JSON.stringify(journal)});` : ''}
process.send('intent-durable');setInterval(()=>{},1000);`);
  const child = fork(script, [], {execArgv: [], windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
  const closed = once(child, 'close');
  try {
    const ack = await Promise.race([once(child, 'message'), closed.then(() => {throw new Error('writer exited before deletion ACK');})]);
    assert.equal(ack[0], 'intent-durable');
  } finally {if (child.exitCode === null && child.signalCode === null) child.kill(); await closed;}
  const reopened = await b.open();
  const result = await recoverProcessOutputDeletions({store: reopened, sessionExists: sessionId => esisteSessionePersistita({cartellaStore: b.root, sessionId})});
  assert.deepEqual(result, unlink ? {completed: 1, cancelled: 0} : {completed: 0, cancelled: 1});
  if (unlink) await assert.rejects(reopened.inspect(key(id)), {code: 'OUTPUT_NOT_FOUND'});
  else assert.deepEqual(await bytes(reopened, id), Buffer.from([0, 255, 1, 2]));
  assert.equal((await reopened.listSessionDeletions({})).items.length, 0);
});
