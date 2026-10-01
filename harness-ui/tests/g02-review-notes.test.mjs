/*
 * G02, the two notes of the desktop lane's review of the merge df591a648 (30/09/2026):
 * 1. the Forge owner audit rewrote the whole audit.jsonl on each append, so two concurrent owner changes to the same tool
 *    could lose a row (and the max-ever revision). Owner operations on one tool now run one after the other.
 * 2. the order "read-before-overwrite guard (T25/B09) BEFORE permission + barrier" held but was unguarded: a refused
 *    overwrite must never reach primaDiMutazioneFn (no checkpoint for a write that will not happen).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {installaVersioneToolForgiatoOwner, leggiAuditToolForgiatoOwner, elencaVersioniToolForgiatoOwner} from '../src/tool-forge-store.mjs';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function temp(t, prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => {const p = relative(resolve(tmpdir()), resolve(root)); assert.ok(p && !p.startsWith('..') && !isAbsolute(p)); rimuoviCartellaDiProva(root);});
  return root;
}
const manifest = (title) => ({id: 'log-water-intake', title, description: 'd', flow: {entry: 'n1', maxTransitions: 10, nodes: [{id: 'n1', type: 'return', value: 1}]}});

test('G02 review 1: concurrent owner installs of one tool keep every audit row and the max-ever revision', async (t) => {
  const cartella = temp(t, 'talos-g02-forge-race-');
  const results = await Promise.allSettled([1, 2, 3, 4, 5].map((revision) => installaVersioneToolForgiatoOwner({cartella, revision, manifest: manifest(`v${revision}`), capacita: [], azioni: [], rischio: 'R1'})));
  assert.deepEqual(results.map((r) => r.status), ['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled'], JSON.stringify(results.map((r) => r.reason?.message ?? null)));
  const audit = await leggiAuditToolForgiatoOwner({cartella, id: 'log-water-intake'});
  assert.deepEqual(audit.map((row) => row.revision), [1, 2, 3, 4, 5], 'no row lost');
  assert.deepEqual((await elencaVersioniToolForgiatoOwner({cartella, id: 'log-water-intake'})).map((row) => row.revision), [1, 2, 3, 4, 5]);
  const meta = JSON.parse(readFileSync(join(cartella, '.owner-versions', 'log-water-intake', 'meta.json'), 'utf8'));
  assert.equal(meta.maxRevision, 5);
});

test('G02 review 2: an overwrite refused by the read-before-overwrite guard never reaches the barrier', async (t) => {
  const root = temp(t, 'talos-g02-guard-order-');
  writeFileSync(join(root, 'kept.txt'), 'content the model never read\n');
  let n = 0;
  const net = async () => {const message = n++ === 0
    ? {role: 'assistant', content: '', tool_calls: [{id: 'c1', type: 'function', function: {name: 'scrivi', arguments: JSON.stringify({percorso: 'kept.txt', contenuto: 'replaced'})}}]}
    : {role: 'assistant', content: 'done'};
    return Response.json({choices: [{message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop'}]});};
  const barrier = [], events = [];
  await talosLavora({cartella: root, task: {consegna: 't'}, modello: 'x', chiave: 'y', livelloAccesso: 'completo', _giriMassimiInterno: 3,
    messaggiIniziali: [{role: 'system', content: 't'}, {role: 'user', content: 't'}], fetchDiRete: net, onGiro: (e) => events.push(e),
    primaDiMutazioneFn: async (a) => barrier.push(a.tipo)});
  assert.equal(readFileSync(join(root, 'kept.txt'), 'utf8'), 'content the model never read\n', 'not replaced');
  assert.match(events.find((e) => e.tipo === 'tool-esito')?.content ?? '', /^REFUSED\./u, 'the guard refused it');
  assert.deepEqual(barrier, [], 'no checkpoint for a write that will not happen');
  assert.ok(existsSync(join(root, 'kept.txt')));
});
