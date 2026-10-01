/*
 * G02 feature 8 (CLI lane 4296295f9 + 53716a9cf, M10-C): the person manages versions of a Forge tool. The model's
 * `tool_create` stays create-only (a second create on the same id is a conflict forever); the owner-only path installs a
 * NEWER revision (monotonic, never reused), lists the retained ones (the last 10) and rolls back to one; every change leaves
 * an audit row and the tool stays OFF until the person enables it again. A tool the model created is not adopted silently.
 * Adapted, one-up on the CLI lane: the owner install goes through the same kernel validator as the model
 * (`validaManifestForgeLocale`) and takes capabilities, actions and risk FROM IT — a caller cannot declare a lower risk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionRegistry} from '../src/session-registry.mjs';
import * as forgeStore from '../src/tool-forge-store.mjs';
const {installaToolForgiato} = forgeStore;
const leggiAuditToolForgiatoOwner = (input) => forgeStore.leggiAuditToolForgiatoOwner(input);
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

const manifest = (title = 'Log water intake') => ({
  id: 'log-water-intake', title, description: 'Creates a note logging water intake.',
  flow: {entry: 'n1', maxTransitions: 10, nodes: [
    {id: 'n1', type: 'capability', capability: 'notes.create', input: {title: {$ref: '$.input.title'}}, target: '$.state.esito', next: 'n2'},
    {id: 'n2', type: 'return', value: {$ref: '$.state.esito'}},
  ]},
});

async function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-g02-forge-'));
  t.after(() => rimuoviCartellaDiProva(root));
  const cartellaForge = join(root, 'forge');
  const registry = createSessionRegistry({cartellaStore: join(root, 'store'), cartellaForge, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({cartella: root, comandoProva: 'npm test', task: {id: 'task', consegna: 'x'}}),
    avviaSessioneFn(input) {
      input.onEvento({type: 'RunStarted', threadId: 't', runId: 'r'});
      input.onEvento({type: 'RunFinished', threadId: 't', runId: 'r'});
      return Promise.resolve({ok: true, esito: {detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{role: 'user', content: 'x'}, {role: 'assistant', content: 'ok'}]}});
    }});
  const {sessionId} = registry.avvia('task');
  await registry.attendiAssestamento(sessionId);
  return {registry, sessionId, cartellaForge};
}

test('G02-8 install newer revisions, list the retained ones, roll back; the tool stays off and every change is audited', async (t) => {
  const {registry, sessionId, cartellaForge} = await setup(t);
  const v1 = await registry.installaVersioneToolForgiato(sessionId, {revision: 1, manifest: manifest('v1')});
  assert.equal(v1.ok, true, JSON.stringify(v1));
  assert.deepEqual([v1.strumento.ownerRevision, v1.strumento.abilitato, v1.strumento.ownerManaged], [1, false, true]);
  const v2 = await registry.installaVersioneToolForgiato(sessionId, {revision: 2, manifest: manifest('v2')});
  assert.equal(v2.strumento.manifest.title, 'v2');
  assert.equal((await registry.installaVersioneToolForgiato(sessionId, {revision: 2, manifest: manifest('again')})).code, 'FORGE_VERSION_NOT_NEWER');
  assert.equal((await registry.installaVersioneToolForgiato(sessionId, {revision: 1, manifest: manifest('older')})).code, 'FORGE_VERSION_NOT_NEWER');
  const versions = await registry.versioniToolForgiato(sessionId, 'log-water-intake');
  assert.deepEqual(versions.versioni.map((row) => [row.revision, row.manifest.title]), [[1, 'v1'], [2, 'v2']]);
  const back = await registry.ripristinaVersioneToolForgiato(sessionId, 'log-water-intake', 1);
  assert.deepEqual([back.ok, back.strumento.manifest.title, back.strumento.abilitato], [true, 'v1', false]);
  assert.deepEqual((await leggiAuditToolForgiatoOwner({cartella: cartellaForge, id: 'log-water-intake'})).map((row) => [row.kind, row.revision]), [['install', 1], ['update', 2], ['rollback', 1]]);
  assert.equal((await registry.installaVersioneToolForgiato(sessionId, {revision: 2, manifest: manifest('reuse')})).code, 'FORGE_VERSION_NOT_NEWER', 'a revision number is never reused, even after a rollback');
  rmSync(join(cartellaForge, '.owner-versions', 'log-water-intake', 'versions', '2.json'));
  assert.equal((await registry.installaVersioneToolForgiato(sessionId, {revision: 2, manifest: manifest('reuse')})).code, 'FORGE_VERSION_NOT_NEWER', 'not even when its snapshot file is gone: the max-ever revision is recorded');
});

test('G02-8 the kernel validator decides capabilities and risk; an invalid manifest writes nothing', async (t) => {
  const {registry, sessionId, cartellaForge} = await setup(t);
  const spoof = await registry.installaVersioneToolForgiato(sessionId, {revision: 1, manifest: manifest(), capacita: [], azioni: [], rischio: 'R0'});
  assert.deepEqual([spoof.strumento.rischio, spoof.strumento.azioni, spoof.strumento.capacita], ['R2', ['write'], ['notes.create']], 'the declared R0 is ignored');
  const bad = await registry.installaVersioneToolForgiato(sessionId, {revision: 5, manifest: {...manifest(), id: 'Bad Id'}});
  assert.equal(bad.code, 'FORGE_INVALID');
  assert.deepEqual(readdirSync(cartellaForge).filter((name) => name.startsWith('Bad')), []);
  const brokenFlow = await registry.installaVersioneToolForgiato(sessionId, {revision: 6, manifest: {...manifest(), id: 'broken-flow', flow: {entry: 'missing', maxTransitions: 10, nodes: []}}});
  assert.equal(brokenFlow.code, 'FORGE_INVALID', 'a valid id with an invalid flow is refused by the kernel validator');
  assert.deepEqual(readdirSync(cartellaForge).filter((name) => name.startsWith('broken-flow')), [], 'nothing written');
  assert.equal((await registry.installaVersioneToolForgiato('nope', {revision: 1, manifest: manifest()})).code, 'NOT_FOUND');
});

test('G02-8 a model-created tool is not adopted silently; only the last 10 revisions are kept', async (t) => {
  const {registry, sessionId, cartellaForge} = await setup(t);
  await installaToolForgiato({cartella: cartellaForge, manifest: {...manifest(), id: 'model-made'}, capacita: ['notes.create'], azioni: ['write'], rischio: 'R2'});
  assert.equal((await registry.installaVersioneToolForgiato(sessionId, {revision: 1, manifest: {...manifest(), id: 'model-made'}})).code, 'FORGE_OWNER_ADOPTION_REQUIRED');
  for (let revision = 1; revision <= 12; revision++) assert.equal((await registry.installaVersioneToolForgiato(sessionId, {revision, manifest: manifest(`v${revision}`)})).ok, true);
  assert.deepEqual((await registry.versioniToolForgiato(sessionId, 'log-water-intake')).versioni.map((row) => row.revision), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal((await registry.ripristinaVersioneToolForgiato(sessionId, 'log-water-intake', 1)).code, 'FORGE_VERSION_NOT_FOUND');
});
