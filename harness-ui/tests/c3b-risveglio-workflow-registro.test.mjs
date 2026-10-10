/*
 * C3b (owner 09/10/2026 sera, punto 4 di `decisioni-owner-c3b-avvio-automatico-09-10`) — IL PADRE SI SVEGLIA CON L'ESITO DI UN
 *   WORKFLOW, sullo STESSO percorso dei risultati delle figlie (F-020): una voce di coda durevole con `origine: 'workflow'` e il suo
 *   `runId`, il risveglio quando il padre è fermo e assestato, mai durante un giro vivo o dopo un giro fallito, e la coda che
 *   sopravvive al riavvio. Un risveglio porta voci di UNA origine sola: le figlie e i Workflow non si mescolano in un messaggio.
 * Kernel finto come `agent-result-wake.test.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { testoDellEsitoWorkflow } from '../src/kernel/confine-dati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const RUN = '22222222-2222-4222-8222-222222222222';
const ALTRO_RUN = '33333333-3333-4333-8333-333333333333';
const esito = (runId = RUN, stato = 'succeeded') => testoDellEsitoWorkflow({ runId, titolo: 'Leggi e confronta', stato, motiviAttenzione: [],
  passi: [{ nodeId: 'uno', etichetta: 'Uno', stato: 'succeeded', riassunto: 'valore 7' }], nota: 'Tell the person the outcome in a few lines.' });

function runtimeControllabile() {
  const runs = [];
  return {
    runs,
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const index = runs.length;
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` });
      return promise;
    },
    fine(index, comeFinita = 'concluso') {
      const run = runs[index];
      run.input.onEvento({ type: comeFinita === 'concluso' ? 'RunFinished' : 'RunError', threadId: `t${index}`, runId: `r${index}` });
      // come il kernel vero: la storia finale è quella con cui il giro è partito, più la sua risposta
      const partenza = run.input.messaggiIniziali?.length ? run.input.messaggiIniziali : [{ role: 'user', content: 'proponi un workflow' }];
      run.resolve({ ok: comeFinita === 'concluso', esito: { detto: `risposta ${index}`, comeFinita,
        messaggiFinali: [...partenza, { role: 'assistant', content: `risposta ${index}` }] } });
    },
  };
}

async function banco(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c3b-risveglio-'));
  const runtime = runtimeControllabile();
  const opzioni = () => ({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'proponi un workflow' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  const registry = createSessionRegistry(opzioni());
  t.after(async () => {
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  return { cartellaStore, runtime, registry, opzioni };
}
const pausa = (ms = 70) => new Promise((r) => setTimeout(r, ms));

test('C3B-RISVEGLIO-01: a settled parent wakes with the Workflow outcome as a new message, origin «workflow», with its runId', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registry.avvia('task');
  b.runtime.fine(0);
  await b.registry.attendiAssestamento(sessionId);
  assert.equal(b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: esito(), chiave: `${RUN}:9` }), true);
  await t.waitFor(() => assert.equal(b.runtime.runs.length, 2, 'one wake turn'));
  const input = b.runtime.runs[1].input;
  assert.equal(input.messaggiIniziali.at(-1).role, 'user');
  assert.equal(input.messaggiIniziali.at(-1).content, esito());
  assert.equal(input.messaggiIniziali.at(-1).talosOrigin, 'workflow-notice');
  assert.equal(input.task.origine, 'workflow');
  assert.deepEqual(input.task.runIds, [RUN]);
  assert.deepEqual(input.task.risultatiWorkflow.map((r) => r.runId), [RUN]);
  assert.equal(input.task.risultatiWorkflow[0].testo, esito());
  b.runtime.fine(1);
  await b.registry.attendiAssestamento(sessionId);
  assert.deepEqual(b.registry.statoCoda(sessionId).voci, [], 'consumed');
});

test('C3B-RISVEGLIO-02: while the parent is working the outcome waits in the queue; it wakes the parent once the turn settles', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registry.avvia('task');
  b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: esito(), chiave: `${RUN}:9` });
  await pausa();
  assert.equal(b.runtime.runs.length, 1, 'no second turn on a live parent');
  const voci = b.registry.statoCoda(sessionId).voci;
  assert.equal(voci.length, 1);
  assert.equal(voci[0].origine, 'workflow');
  assert.equal(voci[0].runId, RUN);
  b.runtime.fine(0);
  await b.registry.attendiAssestamento(sessionId);
  await t.waitFor(() => assert.equal(b.runtime.runs.length, 2));
  assert.equal(b.runtime.runs[1].input.task.origine, 'workflow');
  b.runtime.fine(1);
  await b.registry.attendiAssestamento(sessionId);
});

test('C3B-RISVEGLIO-03: after a failed turn the outcome stays queued for the person (the same rule as a child result)', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registry.avvia('task');
  b.runtime.fine(0, 'errore');
  await b.registry.attendiAssestamento(sessionId);
  b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: esito(), chiave: `${RUN}:9` });
  await pausa();
  assert.equal(b.runtime.runs.length, 1);
  assert.equal(b.registry.statoCoda(sessionId).voci.length, 1);
});

test('C3B-RISVEGLIO-04: a child result and a Workflow outcome never share one wake message: one wake per origin, in queue order', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registry.avvia('task');
  assert.equal((await b.runtime.runs[0].input.onDelega('figlia', '/tmp/uno')).esito, 'avviato');
  b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: esito(), chiave: `${RUN}:9` });
  b.runtime.fine(1); // la figlia finisce: il suo risultato va in coda DOPO l'esito del Workflow
  await t.waitFor(() => assert.equal(b.registry.statoCoda(sessionId).voci.length, 2));
  b.runtime.fine(0);
  await b.registry.attendiAssestamento(sessionId);
  await t.waitFor(() => assert.equal(b.runtime.runs.length, 3));
  assert.equal(b.runtime.runs[2].input.task.origine, 'workflow');
  assert.equal(b.runtime.runs[2].input.messaggiIniziali.at(-1).content, esito(), 'the workflow outcome alone');
  b.runtime.fine(2);
  await b.registry.attendiAssestamento(sessionId);
  await t.waitFor(() => assert.equal(b.runtime.runs.length, 4));
  assert.equal(b.runtime.runs[3].input.task.origine, 'delega');
  b.runtime.fine(3);
  await b.registry.attendiAssestamento(sessionId);
});

test('C3B-RISVEGLIO-05: the queued outcome survives a restart with its origin and runId (paused, like every restored queue)', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registry.avvia('task');
  b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: esito(), chiave: `${RUN}:9` });
  await pausa();
  try { await attendiScritture({ cartellaStore: b.cartellaStore }); } catch { /* */ }
  const dopo = createSessionRegistry(b.opzioni());
  t.after(() => dopo.chiudi?.());
  await dopo.ripristina();
  const voci = dopo.statoCoda(sessionId).voci;
  assert.equal(voci.length, 1);
  assert.equal(voci[0].origine, 'workflow');
  assert.equal(voci[0].runId, RUN);
  assert.equal(voci[0].testo, esito());
});

test('C3B-RISVEGLIO-06: the other way — unknown session, a runId that is not a UUID, empty text ⇒ nothing queued; the same key twice ⇒ one item', async (t) => {
  const b = await banco(t);
  const { sessionId } = b.registry.avvia('task');
  assert.equal(b.registry.accodaEsitoWorkflow({ sessionId: 'nessuna', runId: RUN, testo: esito(), chiave: 'a' }), false);
  assert.equal(b.registry.accodaEsitoWorkflow({ sessionId, runId: 'non-un-uuid', testo: esito(), chiave: 'b' }), false);
  assert.equal(b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: '  ', chiave: 'c' }), false);
  assert.equal(b.registry.statoCoda(sessionId).voci.length, 0);
  assert.equal(b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: esito(), chiave: `${RUN}:9` }), true);
  assert.equal(b.registry.accodaEsitoWorkflow({ sessionId, runId: RUN, testo: esito(), chiave: `${RUN}:9` }), true, 'already there: still true');
  assert.equal(b.registry.accodaEsitoWorkflow({ sessionId, runId: ALTRO_RUN, testo: esito(ALTRO_RUN), chiave: `${ALTRO_RUN}:4` }), true);
  assert.deepEqual(b.registry.statoCoda(sessionId).voci.map((v) => v.runId), [RUN, ALTRO_RUN]);
});
