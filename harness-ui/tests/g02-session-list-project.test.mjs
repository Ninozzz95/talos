/*
 * G02 feature 5 (CLI lane 515b20b6c + 11cfc27ca, M6-B): the session list names the project a session belongs to. The task
 * the host prepares may carry a `progetto` label; `elenca()` returns it (trimmed-empty or absent → null). Only the list
 * changes: a redirect restart does not copy it (11cfc27ca took it back out of avviaESegui).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionRegistry} from '../src/session-registry.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

test('G02-5 elenca() carries the project label of each session', async (t) => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-g02-project-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const projects = {a: 'Alpha', b: '   ', c: undefined};
  const registry = createSessionRegistry({cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: (taskId) => ({cartella: tmpdir(), comandoProva: 'npm test', task: {id: taskId, consegna: 'x', ...(projects[taskId] !== undefined ? {progetto: projects[taskId]} : {})}}),
    avviaSessioneFn(input) {
      input.onEvento({type: 'RunStarted', threadId: 't', runId: 'r'});
      input.onEvento({type: 'RunFinished', threadId: 't', runId: 'r'});
      return Promise.resolve({ok: true, esito: {detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{role: 'user', content: 'x'}, {role: 'assistant', content: 'ok'}]}});
    }});
  const ids = {};
  for (const taskId of ['a', 'b', 'c']) {ids[taskId] = registry.avvia(taskId).sessionId; await registry.attendiAssestamento(ids[taskId]);}
  const rows = Object.fromEntries(registry.elenca().map((row) => [row.sessionId, row]));
  assert.equal(rows[ids.a].progetto, 'Alpha');
  assert.equal(rows[ids.b].progetto, null, 'a blank label is no label');
  assert.equal(rows[ids.c].progetto, null);
});
