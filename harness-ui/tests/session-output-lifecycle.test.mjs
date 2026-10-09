import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createHttpApp} from '../src/http-app.mjs';
import {eliminaSessionePersistita} from '../src/session-store.mjs';
import {avviaSessione} from '../src/agent-service.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {createSessionRegistry} from '../src/session-registry.mjs';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {rimuoviCartellaDiProvaAttesa} from './aiuto/rimuovi-cartella-di-prova.mjs';

async function fixture(t, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-output-delete-'));
  const cartellaStore = join(root, 'sessions'), databasePath = join(root, 'output.sqlite');
  const script = join(root, 'producer.cjs');
  writeFileSync(script, "require('node:fs').appendFileSync('executions.txt','x');process.stdout.write('retained18');");
  const command = `"${process.execPath}" "${script}"`;
  let store = await createProcessOutputStore({databasePath, maxOutputBytes: 100_000}), registry;
  const options = {
    cartellaStore, modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {}, processOutputStoreFn: () => store,
    preparaEsecuzioneFn: id => ({cartella: root, task: {id, consegna: 'Esegui la verifica locale.'}, comandoProva: command}),
    avviaSessioneFn: input => avviaSessione({...input, cartella: root, livelloAccesso: 'completo',
      contestoDelProgettoFn: async () => null, leggiContestoWorkspaceFn: () => ({}),
      talosLavoraFn: kernelInput => {
        let calls = 0;
        return talosLavora({...kernelInput, onDelta: undefined, _giriMassimiInterno: 3,
          ambienteComandiFn: () => ({dove: 'windows', revisione: 0}),
          fetchDiRete: async () => {
            const message = calls++ === 0
              ? {role: 'assistant', content: '', tool_calls: [{id: 'tool18', type: 'function', function: {name: 'prova', arguments: '{}'}}]}
              : {role: 'assistant', content: 'Fine.'};
            return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});
          },
        });
      },
    }), ...extra,
  };
  t.after(async () => {
    await registry?.chiudi(); await store.close();
    const child = relative(resolve(tmpdir()), resolve(root));
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    await rimuoviCartellaDiProvaAttesa(root);
  });
  registry = createSessionRegistry(options);
  const {sessionId} = registry.avvia('fixture18'); assert.ok(sessionId);
  await registry.attendiAssestamento(sessionId);
  const journal = join(cartellaStore, `${sessionId}.jsonl`);
  const rows = readFileSync(journal, 'utf8').trim().split('\n').map(JSON.parse);
  const receipt = rows.filter(r => r.type === 'CUSTOM' && r.name === 'talos.process-output').at(-1)?.value;
  assert.ok(receipt?.outputId, 'real command must have a durable output receipt');
  const id = {sessionId, outputId: receipt.outputId};
  return {root, cartellaStore, databasePath, journal, id, get store() {return store;}, get registry() {return registry;},
    async reopen() {await registry.chiudi(); await store.close(); store = await createProcessOutputStore({databasePath, maxOutputBytes: 100_000}); registry = createSessionRegistry(options); await registry.ripristina();},
  };
}

test('SESSION18-DELETE: deleting a real settled session removes its stored command bytes', async t => {
  const f = await fixture(t);
  assert.equal(Buffer.from((await f.store.readPage({...f.id, stream: 'stdout'})).bytes).toString(), 'retained18');
  assert.equal((await f.registry.elimina(f.id.sessionId)).ok, true);
  assert.equal(existsSync(f.journal), false);
  await assert.rejects(f.store.inspect(f.id), e => e.code === 'OUTPUT_NOT_FOUND');
  const db = new DatabaseSync(f.databasePath);
  try {assert.equal(db.prepare('SELECT count(*) AS n FROM output_chunks').get().n, 0);} finally {db.close();}
  await f.reopen();
  assert.equal(readFileSync(join(f.root, 'executions.txt'), 'utf8'), 'x', 'delete/restart must never rerun the command');
});

test('SESSION18-UNLINK-FAIL: failed journal delete restores the session and leaves its output readable after restart', async t => {
  const f = await fixture(t, {eliminaSessionePersistitaFn: async () => {throw Object.assign(new Error('fixture denied'), {code: 'EACCES'});}});
  await assert.rejects(f.registry.elimina(f.id.sessionId), {code: 'EACCES'});
  assert.equal(existsSync(f.journal), true);
  assert.equal((await f.store.listSessionDeletions({})).items.length, 0);
  await f.reopen();
  assert.equal((await f.store.inspect(f.id)).storedBytes, 10);
  assert.equal(readFileSync(join(f.root, 'executions.txt'), 'utf8'), 'x');
});

test('SESSION18-STORE-FAIL: failed output cleanup stays pending and startup completes it without resurrecting the session', async t => {
  const f = await fixture(t), db = new DatabaseSync(f.databasePath);
  try {
    db.exec("CREATE TRIGGER deny18 BEFORE DELETE ON output_captures BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
    const result = await f.registry.elimina(f.id.sessionId);
    assert.equal(result.ok, true); assert.equal(result.outputCleanup.state, 'pending');
    assert.equal(existsSync(f.journal), false);
    assert.equal(db.prepare('SELECT count(*) AS n FROM output_chunks').get().n, 1);
    assert.equal((await f.store.listSessionDeletions({})).items.length, 1);
    db.exec('DROP TRIGGER deny18');
  } finally {db.close();}
  await f.reopen();
  assert.equal((await f.store.listSessionDeletions({})).items.length, 0);
  await assert.rejects(f.store.inspect(f.id), {code: 'OUTPUT_NOT_FOUND'});
  assert.equal(readFileSync(join(f.root, 'executions.txt'), 'utf8'), 'x');
});

test('SESSION18-RESTART-BEFORE: startup cancels an intent whose journal still exists', async t => {
  const f = await fixture(t);
  await f.store.beginSessionDeletion({sessionId: f.id.sessionId, operationId: randomUUID()});
  await f.reopen();
  assert.equal(existsSync(f.journal), true);
  assert.equal((await f.store.listSessionDeletions({})).items.length, 0);
  assert.equal((await f.store.inspect(f.id)).storedBytes, 10);
});

test('SESSION18-BUSY: an unsettled capture prevents journal unlink and keeps the session recoverable', async t => {
  const f = await fixture(t);
  const id = {...f.id, outputId: randomUUID(), runId: 'unfinished18', toolCallId: 'unfinished18'};
  await f.store.begin(id);
  const result = await f.registry.elimina(f.id.sessionId);
  assert.equal(result.code, 'SESSION_NOT_READY'); assert.equal(existsSync(f.journal), true);
  assert.equal((await f.store.listSessionDeletions({})).items.length, 0);
  await f.store.finish({...id, sequence: 0, termination: 'exited', exitCode: 0});
  assert.equal((await f.registry.elimina(f.id.sessionId)).outputCleanup.capturesRemoved, 2);
});

test('SESSION18-REPLAY-RACE: replay during deletion neither cancels the intent nor restores the deleted session', async t => {
  const admitted = Promise.withResolvers(), release = Promise.withResolvers();
  const f = await fixture(t, {eliminaSessionePersistitaFn: async args => {admitted.resolve(); await release.promise; return eliminaSessionePersistita(args);}});
  const deletion = f.registry.elimina(f.id.sessionId);
  try {
    await admitted.promise;
    await f.registry.ripristina();
    assert.equal((await f.store.listSessionDeletions({})).items.length, 1);
  } finally {release.resolve();}
  assert.equal((await deletion).ok, true);
  assert.equal(existsSync(f.journal), false);
  assert.equal(f.registry.leggiSessioneContesto(f.id.sessionId), null);
});

test('SESSION18-HTTP: authenticated deletion exposes pending cleanup without paths; unauthorized requests do not delete', async t => {
  const f = await fixture(t), db = new DatabaseSync(f.databasePath);
  const server = createServer(createHttpApp({staticHandler: () => {}, token: 'fixture18', sessionRegistry: f.registry}));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/api/v1/sessions/${f.id.sessionId}/delete`;
  try {
    assert.equal((await fetch(url, {method: 'POST'})).status, 401);
    // 0.1.25: a foreign Origin is refused by the server-wide guard before the token check (403 ORIGIN_FORBIDDEN, not 401)
    const foreign = await fetch(url, {method: 'POST', headers: {Origin: 'https://foreign.invalid'}});
    assert.equal(foreign.status, 403);
    assert.equal((await foreign.json()).error.code, 'ORIGIN_FORBIDDEN');
    assert.equal(existsSync(f.journal), true);
    db.exec("CREATE TRIGGER deny18 BEFORE DELETE ON output_captures BEGIN SELECT RAISE(ABORT,'private/path'); END;");
    const response = await fetch(url, {method: 'POST', headers: {Cookie: 'talos_token=fixture18', Origin: base, 'Content-Type': 'application/json'}, body: '{}'});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.outputCleanup.state, 'pending');
    assert.doesNotMatch(JSON.stringify(body), /private\/path|operationId|databasePath/);
  } finally {db.close(); await new Promise(r => server.close(r));}
});
