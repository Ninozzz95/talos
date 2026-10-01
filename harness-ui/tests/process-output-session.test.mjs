import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {createProcessOutputStore} from '../src/process-output-store.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';
const url = new URL('../src/process-output-session.mjs', import.meta.url);
const api = await import(url.href).catch(e => {if (e.code === 'ERR_MODULE_NOT_FOUND' && e.url === url.href) return {}; throw e;});
async function bank(t, maxOutputBytes = 1024) {
  const root = mkdtempSync(join(tmpdir(), 'talos-output-lifecycle-'));
  const store = await createProcessOutputStore({databasePath: join(root, 'output.sqlite'), maxOutputBytes});
  t.after(async () => {await store.close(); const p = relative(resolve(tmpdir()), resolve(root)); assert.ok(p && !p.startsWith('..') && !isAbsolute(p)); rimuoviCartellaDiProva(root);});
  const events = [], scope = {store, sessionId: 'session14', runId: 'run14', toolCallId: 'tool14', emit: e => {events.push(e); return true;}};
  return {store, events, scope};
}
const bytes = Buffer.from('real bytes');
const delivered = {state: 'delivered', observedBytes: bytes.length, deliveredBytes: bytes.length};
async function execute({onBytes}) {
  try {await onBytes({stream: 'stdout', bytes});}
  catch (e) {return {codice: 0, testo: 'ran once', outputCapture: {state: 'failed', errorCode: e.code}};}
  return {codice: 0, testo: 'ran once', outputCapture: delivered};
}
test('OUTPUT14-SESSION: begin receipt is durable before execution and finish is readable by the exact owner', async t => {
  const b = await bank(t); let release;
  const gate = new Promise(r => {release = r;}); let executed = false, entered = false;
  const pending = api.runWithProcessOutput({...b.scope, emit: async e => {b.events.push(e); if (e.value.state === 'recording') {entered = true; await gate;}}}, async options => {executed = true; return execute(options);});
  await t.waitFor(() => assert.ok(entered)); assert.equal(executed, false); release();
  const result = await pending; assert.equal(result.processOutput.state, 'complete');
  const {outputId} = result.processOutput; assert.equal(result.processOutput.runId, 'run14');
  assert.equal(Buffer.from((await b.store.readPage({sessionId: 'session14', outputId, stream: 'stdout'})).bytes).toString(), bytes.toString());
  await assert.rejects(b.store.inspect({sessionId: 'other', outputId}), e => e.code === 'OUTPUT_NOT_FOUND');
  assert.equal(b.events.length, 2); assert.ok(b.events.every(e => e.type === 'CUSTOM' && e.name === 'talos.process-output'));
});
for (const boundary of ['BEGIN', 'RECEIPT-BEGIN']) test(`OUTPUT14-${boundary}: failed admission never runs the command`, async t => {
  const b = await bank(t); let runs = 0;
  const options = boundary === 'BEGIN' ? {...b.scope, store: {...b.store, begin: async () => {throw Error('private path');}}}
    : {...b.scope, emit: () => false};
  await assert.rejects(api.runWithProcessOutput(options, async () => {runs++;}), e => /^OUTPUT_/.test(e.code) && !e.message.includes('private path'));
  assert.equal(runs, 0);
});
for (const boundary of ['APPEND', 'FINISH', 'RECEIPT-FINAL']) test(`OUTPUT14-${boundary}: failed retention is distinct from a successful process and never repeats it`, async t => {
  const b = await bank(t); let runs = 0;
  const options = {...b.scope};
  if (boundary === 'RECEIPT-FINAL') options.emit = e => e.value.state === 'recording';
  else options.store = {...b.store, [boundary.toLowerCase()]: async () => {throw Object.assign(Error('private path'), {code: 'OUTPUT_STORE_IO'});}};
  const result = await api.runWithProcessOutput(options, options => {runs++; return execute(options);});
  assert.equal(runs, 1); assert.equal(result.codice, 0); assert.equal(result.outputStorageFailed, true);
  assert.match(result.testo, /already ran.*do not rerun/i); assert.doesNotMatch(result.testo, /private path/);
  assert.ok(result.processOutput.errorCode);
});
test('OUTPUT14-LIMIT: the archive cap is declared independently of process success', async t => {
  const b = await bank(t, 4), result = await api.runWithProcessOutput(b.scope, execute);
  assert.equal(result.processOutput.state, 'limited'); assert.equal(result.processOutput.storedBytes, 4);
  assert.equal(result.processOutput.observedBytes, bytes.length); assert.equal(result.outputStorageFailed, false);
  assert.match(result.testo, /4 of 10 bytes/);
});
for (const [flags, termination, code] of [[{fermatoSuRichiesta: true}, 'cancelled', 130], [{fermatoDalTempo: true}, 'timeout', 124], [{}, 'spawn-error', -1]]) test(`OUTPUT14-${termination}: termination survives independently of capture`, async t => {
  const b = await bank(t);
  const result = await api.runWithProcessOutput(b.scope, async opts => ({...await execute(opts), ...flags, codice: code}));
  assert.equal(result.processOutput.termination, termination); assert.equal(result.processOutput.exitCode, code);
});
test('OUTPUT14-EXIT: no-tests semantic status does not rewrite the actual process exit code', async t => {
  const b = await bank(t);
  const result = await api.runWithProcessOutput(b.scope, async opts => ({...await execute(opts), codice: 127, actualExitCode: 0}));
  assert.equal(result.codice, 127); assert.equal(result.processOutput.exitCode, 0);
});
