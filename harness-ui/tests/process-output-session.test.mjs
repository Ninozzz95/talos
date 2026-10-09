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

/*
 * ⭐ Owner, 08/10/2026 notte («"In sottofondo", con quanto è salvato»): un comando SFONDATO (dal tempo, dalla riga, o partito in
 *   sfondo) non ha fallito la conservazione. Misurato sulla 4176 prima della cura: 7 byte salvati e confermati, ricevuta «failed /
 *   OUTPUT_CAPTURE_NOT_CONFIRMED», e il modello leggeva «retention failed… the command already ran» accanto a «keeps running in
 *   the background». Ora: ricevuta conclusa con terminazione 'background' e i byte fino a lì; la nota dice che il comando gira.
 */
const metaCattura = {schema: 'talos.process-output-metadata.v1', controlFooter: null};
const sfondato = (pezzi, meta) => async ({onBytes}) => {
  for (const p of pezzi) await onBytes({stream: 'stdout', bytes: Buffer.from(p), ...(meta === undefined ? {} : {metadata: meta})});
  return {codice: null, messoInSfondo: true, testo: 'IN BACKGROUND: moved to the background instead of being killed.'};
};
for (const [nome, pezzi, meta] of [['CON-METADATI', ['inizio\n'], metaCattura], ['SENZA-METADATI', ['inizio\n'], undefined], ['VUOTO', [], undefined]]) {
  test(`OUTPUT14-BACKGROUND-${nome}: un comando passato in sottofondo chiude la ricevuta coi byte fino a lì, mai «failed»`, async t => {
    const b = await bank(t);
    const result = await api.runWithProcessOutput(b.scope, sfondato(pezzi, meta));
    const attesi = pezzi.join('').length;
    assert.equal(result.processOutput.state, 'complete');
    assert.equal(result.processOutput.termination, 'background');
    assert.equal(result.processOutput.exitCode, null);
    assert.equal(result.processOutput.storedBytes, attesi);
    assert.equal(result.outputStorageFailed, false);
    assert.match(result.testo, new RegExp(`still running in the background: ${attesi} bytes retained up to that point`));
    assert.doesNotMatch(result.testo, /retention failed|already ran/);
    assert.match(result.testo, /IN BACKGROUND/, 'il testo del kernel resta, sotto la nota');
    if (attesi) assert.equal(Buffer.from((await b.store.readPage({sessionId: 'session14', outputId: result.processOutput.outputId, stream: 'stdout'})).bytes).toString(), pezzi.join(''));
  });
}
/* Review del collega, 08/10: sottofondo DOPO il tetto di conservazione (1024 byte, 3×1000 scritti) — la ricevuta resta «limited»
   con terminazione 'background', non diventa «failed», e la nota dice che il limite è stato raggiunto. */
test('OUTPUT14-BACKGROUND-LIMITED: sottofondo dopo il tetto resta «limited» + background, 1024 di 3000, mai «failed»', async t => {
  const b = await bank(t, 1024);
  const result = await api.runWithProcessOutput(b.scope, sfondato(['a'.repeat(1000), 'b'.repeat(1000), 'c'.repeat(1000)], metaCattura));
  assert.equal(result.processOutput.state, 'limited');
  assert.equal(result.processOutput.termination, 'background');
  assert.equal(result.processOutput.storedBytes, 1024);
  assert.equal(result.outputStorageFailed, false);
  assert.match(result.testo, /still running in the background: 1024 bytes retained up to that point/);
  assert.match(result.testo, /the retention limit was reached/);
  assert.doesNotMatch(result.testo, /retention failed|already ran/);
});
test('OUTPUT14-BACKGROUND-FINISH-FALLITO AL CONTRARIO: se l\'archivio non chiude, l\'avviso di conservazione fallita resta', async t => {
  const b = await bank(t);
  const store = {...b.store, finish: async () => {throw Object.assign(Error('private path'), {code: 'OUTPUT_STORE_IO'});}};
  const result = await api.runWithProcessOutput({...b.scope, store}, sfondato(['inizio\n'], metaCattura));
  assert.equal(result.outputStorageFailed, true);
  assert.match(result.testo, /retention failed \(OUTPUT_STORE_IO\)/);
  assert.doesNotMatch(result.testo, /private path/);
});
