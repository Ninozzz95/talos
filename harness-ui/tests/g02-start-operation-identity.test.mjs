/*
 * G02 feature 6 (CLI lane f7696afde, M7-C): an idempotent start. A host that may retry a start (the TALOS CLI after a lost
 * reply) passes an opaque `operationId` to avviaLibero. The same id with the same start parameters returns the session
 * already started (`duplicate: true`) instead of starting a second one; the same id with different parameters is refused
 * (START_OPERATION_CONFLICT); an invalid id is QUERY_INVALID. The identity and a signature of the parameters (RFC 8785,
 * the desktop's `canonicalHash`) are written in the session header and survive a restart. It grants no permission and does
 * not change the workspace. The CLI lane's second commit (533d328d9, fail closed when the header cannot be written) is
 * already the desktop's behaviour for every session (SESSION_STORE_HEADER_FAILED).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionRegistry} from '../src/session-registry.mjs';
import {attendiScritture} from '../src/session-store.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function registry(cartellaStore, runs) {
  return createSessionRegistry({cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneLiberaFn: (_cartelle, {cartellaLibera, consegna, comandoProva}) => ({cartella: cartellaLibera, comandoProva: comandoProva ?? 'npm test', task: {id: 'libero', consegna}}),
    avviaSessioneFn(input) {
      runs.push(input);
      input.onEvento({type: 'RunStarted', threadId: 't', runId: 'r'});
      input.onEvento({type: 'RunFinished', threadId: 't', runId: 'r'});
      return Promise.resolve({ok: true, esito: {detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{role: 'user', content: 'x'}, {role: 'assistant', content: 'ok'}]}});
    }});
}
function store(t) {
  const dir = mkdtempSync(join(tmpdir(), 'talos-g02-operation-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  return dir;
}

test('G02-6 the same operation id and parameters return the session already started', async (t) => {
  const runs = [], r = registry(store(t), runs), cartella = tmpdir();
  const first = r.avviaLibero({cartellaLibera: cartella, consegna: 'do it', operationId: 'op-1'});
  assert.ok(first.sessionId, JSON.stringify(first));
  await r.attendiAssestamento(first.sessionId);
  const again = r.avviaLibero({cartellaLibera: cartella, consegna: 'do it', operationId: 'op-1'});
  assert.deepEqual(again, {sessionId: first.sessionId, operationId: 'op-1', duplicate: true});
  assert.equal(runs.length, 1, 'no second model call');
});

test('G02-6 the same id with different parameters is refused; an invalid id is refused; no id starts every time', async (t) => {
  const runs = [], r = registry(store(t), runs), cartella = tmpdir();
  const first = r.avviaLibero({cartellaLibera: cartella, consegna: 'do it', operationId: 'op-2'});
  await r.attendiAssestamento(first.sessionId);
  assert.equal(r.avviaLibero({cartellaLibera: cartella, consegna: 'something else', operationId: 'op-2'}).code, 'START_OPERATION_CONFLICT');
  assert.equal(r.avviaLibero({cartellaLibera: cartella, consegna: 'do it', operationId: 'op-2', modalitaOperativa: 'piano'}).code, 'START_OPERATION_CONFLICT', 'the mode is part of the start');
  for (const bad of ['', 7, 'x'.repeat(257)]) assert.equal(r.avviaLibero({cartellaLibera: cartella, consegna: 'do it', operationId: bad}).code, 'QUERY_INVALID', String(bad).slice(0, 8));
  const a = r.avviaLibero({cartellaLibera: cartella, consegna: 'plain'}), b = r.avviaLibero({cartellaLibera: cartella, consegna: 'plain'});
  assert.notEqual(a.sessionId, b.sessionId, 'without an id nothing is deduplicated');
  assert.equal(a.duplicate, undefined);
});

test('G02-6 the identity survives a restart', async (t) => {
  const dir = store(t), cartella = tmpdir();
  const runs = [], r = registry(dir, runs);
  const first = r.avviaLibero({cartellaLibera: cartella, consegna: 'durable', operationId: 'op-3'});
  await r.attendiAssestamento(first.sessionId);
  await attendiScritture({cartellaStore: dir, sessionId: first.sessionId});
  const restored = registry(dir, []);
  await restored.ripristina();
  assert.deepEqual(restored.avviaLibero({cartellaLibera: cartella, consegna: 'durable', operationId: 'op-3'}), {sessionId: first.sessionId, operationId: 'op-3', duplicate: true});
  assert.equal(restored.avviaLibero({cartellaLibera: cartella, consegna: 'changed', operationId: 'op-3'}).code, 'START_OPERATION_CONFLICT');
});
