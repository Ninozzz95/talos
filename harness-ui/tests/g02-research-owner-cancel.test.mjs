/*
 * G02 feature 7 (CLI lane ba548285a, M10-A): the person can cancel a research from the product, not only the model
 * (`research_cancel`). `annullaRicerca(sessionId, ricercaId)` has the same authority as the model tool and goes through
 * the same `azioneSuRicerca` as pause/resume: unknown session → NOT_FOUND, absent on disk → {ok:true, ricerca:null},
 * otherwise the orchestrator's `annulla`. A research already stopped is cancelled for good (metadata terminata:'cancelled'),
 * where a pause is refused: that is what tells cancel from pause.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSessionRegistry} from '../src/session-registry.mjs';
import {rimuoviCartellaDiProva} from './aiuto/rimuovi-cartella-di-prova.mjs';

async function setup(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-g02-research-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const updates = [], events = [];
  const registry = createSessionRegistry({cartellaStore, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({cartella: cartellaStore, comandoProva: 'npm test', task: {id: 'task', consegna: 'research'}}),
    cartellaDatiProgettoFn: async () => cartellaStore,
    leggiRicercaFn: async ({id}) => ({id, stato: 'paused'}),
    aggiornaRicercaFn: async (input) => {updates.push(input);},
    accodaEventoFn: async (...args) => {events.push(args);},
    avviaSessioneFn(input) {
      input.onEvento({type: 'RunStarted', threadId: 't', runId: 'r'});
      input.onEvento({type: 'RunFinished', threadId: 't', runId: 'r'});
      return Promise.resolve({ok: true, esito: {detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{role: 'user', content: 'x'}, {role: 'assistant', content: 'ok'}]}});
    }});
  const {sessionId} = registry.avvia('task');
  await registry.attendiAssestamento(sessionId);
  return {registry, sessionId, updates};
}

test('G02-7 the person cancels a stopped research for good; a pause of the same research is refused', async (t) => {
  const {registry, sessionId, updates} = await setup(t);
  assert.equal(typeof registry.annullaRicerca, 'function', 'the owner-facing cancel exists');
  const paused = await registry.pausaRicerca(sessionId, sessionId);
  assert.equal(paused.ok, false, 'a stopped research cannot be paused');
  const cancelled = await registry.annullaRicerca(sessionId, sessionId);
  assert.equal(cancelled.ok, true, JSON.stringify(cancelled));
  assert.deepEqual(updates.map(({id, terminata}) => ({id, terminata})), [{id: sessionId, terminata: 'cancelled'}]);
});

test('G02-7 cancel uses the same guards as pause and resume', async (t) => {
  const {registry, sessionId} = await setup(t);
  assert.equal((await registry.annullaRicerca('nope', 'x')).code, 'NOT_FOUND');
  const unknown = await registry.annullaRicerca(sessionId, 'not-running');
  assert.equal(unknown.ok, false, 'a research that is not in the orchestrator is not cancelled');
});
