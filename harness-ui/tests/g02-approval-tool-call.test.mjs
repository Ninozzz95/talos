/*
 * G02 feature 3 (CLI lane 8c84ae706 + a44c6608d): every action the kernel checks carries the model's `toolCallId`, so an
 * approval request (and the host barrier) names the exact tool call it is about. The CLI draws the approval next to that
 * tool's row; the desktop's `ApprovalRequested` gets the same field additively (its card reads specific fields only).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {talosLavora} from '../src/kernel/talosHarness.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-g02-approval-'));
  t.after(() => {const p = relative(resolve(tmpdir()), resolve(root)); assert.ok(p && !p.startsWith('..') && !isAbsolute(p)); rimuoviCartellaDiProva(root);});
  return root;
}
function network(...replies) {
  let n = 0;
  return async () => {const message = replies[Math.min(n++, replies.length - 1)];
    return Response.json({choices: [{message, finish_reason: message.tool_calls?.length ? 'tool_calls' : 'stop'}]});};
}
const call = (id, name, args) => ({role: 'assistant', content: '', tool_calls: [{id, type: 'function', function: {name, arguments: JSON.stringify(args)}}]});
const DONE = {role: 'assistant', content: 'done'};

for (const [name, args] of [['scrivi', {percorso: 'a.txt', contenuto: 'x'}], ['shell', {comando: 'echo x'}], ['notes_create', {title: 'n', content: 'c'}]]) {
  test(`G02-3 the approval request for ${name} names its tool call`, async (t) => {
    const root = workspace(t), asked = [], barrier = [];
    await talosLavora({cartella: root, task: {consegna: 't'}, modello: 'x', chiave: 'y', livelloAccesso: 'su-richiesta', _giriMassimiInterno: 3,
      messaggiIniziali: [{role: 'system', content: 't'}, {role: 'user', content: 't'}],
      ambienteComandiFn: () => ({dove: 'windows', revisione: 0}),
      eseguiComandoSandboxatoFn: async () => ({codice: 0, testo: 'x', enforcement: 'none'}),
      fetchDiRete: network(call(`call_${name}`, name, args), DONE),
      chiediApprovazioneFn: async (a) => {asked.push(a); return false;},
      primaDiMutazioneFn: async (a) => barrier.push(a)});
    assert.equal(asked.length, 1, `${name} asked once`);
    assert.equal(asked[0].tipo, name);
    assert.equal(asked[0].toolCallId, `call_${name}`);
  });
}

test('G02-3 the barrier sees the same tool call id', async (t) => {
  const root = workspace(t), seen = [];
  await talosLavora({cartella: root, task: {consegna: 't'}, modello: 'x', chiave: 'y', livelloAccesso: 'scrittura-progetto', _giriMassimiInterno: 3,
    messaggiIniziali: [{role: 'system', content: 't'}, {role: 'user', content: 't'}],
    fetchDiRete: network(call('call_w', 'scrivi', {percorso: 'b.txt', contenuto: 'x'}), DONE), primaDiMutazioneFn: async (a) => seen.push(a.toolCallId)});
  assert.deepEqual(seen, ['call_w']);
});
