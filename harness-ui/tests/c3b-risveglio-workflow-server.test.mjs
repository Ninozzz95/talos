/*
 * C3b (owner 09/10/2026 sera, «Risvegliare il padre a fine run» e «anche a Serve attenzione») — DAL REGISTRO DEI WORKFLOW AL
 *   PADRE, con le parti vere: store dei Workflow, orchestratore, scheduler, registro delle sessioni (kernel finto). Chi guarda i
 *   cambi di stato del run (`creaRisveglioDaiWorkflow`) compone l'esito col confine dei dati e lo mette nella coda della sessione
 *   che ha avviato il run; il registro sveglia il padre fermo. Nei due versi: riuscito, «Serve attenzione» e annullato svegliano;
 *   la pausa no (la persona l'ha chiesta e la vede). E ogni cambio di stato sveglia UNA volta.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { createAgentSessionAdapter } from '../src/workflow/adapters/agent-session.mjs';
import { creaRisveglioDaiWorkflow } from '../src/workflow/esito-al-padre.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from '../src/workflow/scheduler.mjs';
import { createWorkflowStore, readRunState } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAttesaAProgresso } from './aiuto/attesa-a-progresso.mjs';

const CLOUD = 'z-ai/glm-5.3-flash';
const BOZZA = {
  title: 'Leggi e confronta', objective: 'Due letture indipendenti.',
  phases: [{ id: 'f', label: 'Fase' }],
  nodes: [
    { id: 'uno', phase: 'f', label: 'Uno', task: 'Fai uno.' },
    { id: 'due', phase: 'f', label: 'Due', task: 'Fai due.' },
    { id: 'confronta', phase: 'f', label: 'Confronta', task: 'Confronta i due.', dependsOn: ['uno', 'due'] },
  ],
};

/** Il kernel finto: ogni giro resta aperto finché la prova risponde; la radice chiude come il kernel vero (storia + «concluso»). */
function giriFinti() {
  const giri = [];
  const api = {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      const giro = { input, chiuso: false, consegna: input.task?.consegna ?? '' };
      giro.chiudi = (valore) => { if (giro.chiuso) return; giro.chiuso = true; risolvi(valore); };
      giri.push(giro);
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      input.segnaleStop?.addEventListener('abort', () => {
        if (giro.chiuso) return;
        input.onEvento({ type: 'RunError', message: 'Fermato.', code: 'fermato' });
        giro.chiudi({ ok: false, esito: 'fermato' });
      }, { once: true });
      return promessa;
    },
    indice(testo) { return giri.findIndex((giro) => giro.consegna.startsWith(testo)); },
    rispondi(i, testo = 'fatto') {
      giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage: { prompt_tokens: 10, completion_tokens: 5 } } });
      giri[i].input.onEvento({ type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' });
      giri[i].input.onEvento({ type: 'TextMessageContent', messageId: `m${i}`, delta: testo });
      giri[i].input.onEvento({ type: 'TextMessageEnd', messageId: `m${i}` });
      giri[i].input.onEvento({ type: 'RunFinished' });
      const partenza = giri[i].input.messaggiIniziali?.length ? giri[i].input.messaggiIniziali : [{ role: 'user', content: giri[i].consegna }];
      giri[i].chiudi({ ok: true, esito: { detto: testo, comeFinita: 'concluso', messaggiFinali: [...partenza, { role: 'assistant', content: testo }] } });
    },
    fallisci(i, classe, message = 'guasto') {
      giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage: { prompt_tokens: 10, completion_tokens: 0 } } });
      giri[i].input.onEvento({ type: 'RunError', message, code: 'PROVIDER_REQUEST_ERROR', classe });
      giri[i].chiudi({ ok: false, esito: null, erroreInterno: message, codiceErrore: 'PROVIDER_REQUEST_ERROR' });
    },
    /** I giri di risveglio: quelli che portano l'esito di un Workflow (le sessioni dei passi non ne hanno mai uno). */
    risvegli() { return giri.filter((giro) => giro.input.task?.origine === 'workflow'); },
    get quanti() { return giri.length; },
  };
  return api;
}

const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 3_000 });
const calma = () => new Promise((r) => setTimeout(r, 150));

async function banco(t) {
  const cartellaStore = segui(cartellaDiProva('talos-c3b-risveglio-srv-'));
  const radiceWorkflow = segui(mkdtempSync(join(tmpdir(), 'talos-c3b-risveglio-store-')));
  const giri = giriFinti();
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaStore,
    avviaSessioneFn: giri.avviaSessioneFn, cartellaEsisteFn: () => true, workflowPlanProposeFn: async () => ({}),
    preparaEsecuzioneFn: (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'radice' } }) });
  const store = await createWorkflowStore({ workflowDataRoot: radiceWorkflow, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  const nowFn = () => new Date(Date.now() + 60_000).toISOString();
  const capacita = createCapacitaAdattiva();
  const orchestrator = createWorkflowOrchestrator({ store, nowFn, randomFn: () => 0.5, capacityFn: () => capacita.politica(),
    adapters: new Map([['agent-session', createAgentSessionAdapter({ sessions: registro })]]) });
  const scheduler = createWorkflowScheduler({ orchestrator, store, capacita, nowFn, onErrore: () => {}, timerFn: () => null, clearTimerFn: () => {} });
  const consegnati = [];
  const smetti = creaRisveglioDaiWorkflow({ store, accodaFn: (x) => { const r = registro.accodaEsitoWorkflow(x); consegnati.push({ ...x, r }); if (process.env.DEBUG_C3B) console.log('ACCODA', x.sessionId, x.runId, r, JSON.stringify(registro.statoCoda(x.sessionId)).slice(0, 200)); return r; }, onErrore: (e) => { if (process.env.DEBUG_C3B) console.log('ERRORE', e); } });
  t.after(async () => {
    smetti();
    scheduler.ferma();
    await store.close();
    await registro.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* */ }
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(radiceWorkflow);
  });
  const radice = registro.avvia('task-vero', { modelloScelto: CLOUD });
  giri.rispondi(0, 'avviato, chiudo il turno');
  await registro.attendiAssestamento(radice.sessionId);
  const esiste = (id) => id === radice.sessionId;
  const proposta = await proposeWorkflowFromTool(store, { sessionId: radice.sessionId, toolCallId: `call_${randomUUID()}`, draft: BOZZA,
    plannerModel: null, sessionModel: CLOUD, modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste });
  const { runId } = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });
  await orchestrator.recover();
  await scheduler.avvia();
  assert.ok(await aspettaChe(() => giri.indice('Fai uno') >= 0 && giri.indice('Fai due') >= 0), 'both steps start');
  const stato = async () => (await readRunState(store, { runId })).state.run.status;
  const comanda = async (action) => { await orchestrator.requestRunControl({ runId, action, commandId: randomUUID() }); scheduler.sveglia(runId); };
  const esitoDi = (giro) => JSON.parse(giro.input.messaggiIniziali.at(-1).content.split('\n')[1]);
  return { giri, registro, rootId: radice.sessionId, runId, stato, comanda, esitoDi, consegnati, store };
}

test('C3B-RISVEGLIO-SRV-01: the run succeeds ⇒ the parent wakes once with the outcome and each step\'s output, as data', async (t) => {
  const b = await banco(t);
  b.giri.rispondi(b.giri.indice('Fai uno'), 'valore 7');
  b.giri.rispondi(b.giri.indice('Fai due'), 'valore 9');
  assert.ok(await aspettaChe(() => b.giri.indice('Confronta') >= 0));
  b.giri.rispondi(b.giri.indice('Confronta'), 'il più alto è 9');
  assert.ok(await aspettaChe(async () => (await b.stato()) === 'succeeded'));
  assert.ok(await aspettaChe(() => b.giri.risvegli(b.rootId).length === 1), 'the parent wakes');
  const [risveglio] = b.giri.risvegli(b.rootId);
  assert.equal(risveglio.input.messaggiIniziali.at(-1).talosOrigin, 'workflow-notice');
  assert.deepEqual(risveglio.input.task.runIds, [b.runId]);
  const esito = b.esitoDi(risveglio);
  assert.equal(esito.schema, 'talos.workflow-outcome.v1');
  assert.equal(esito.runId, b.runId);
  assert.equal(esito.stato, 'succeeded');
  assert.equal(esito.titolo, 'Leggi e confronta');
  const passi = Object.fromEntries(esito.passi.map((p) => [p.nodeId, p]));
  assert.match(passi.uno.risultatoNonFidato, /valore 7/u);
  assert.match(passi.due.risultatoNonFidato, /valore 9/u);
  assert.match(passi.confronta.risultatoNonFidato, /il più alto è 9/u);
  await calma();
  assert.equal(b.giri.risvegli(b.rootId).length, 1, 'once, not once per fact');
});

test('C3B-RISVEGLIO-SRV-02: a failed step ⇒ «needs attention» wakes the parent with the reason; then cancel wakes it again with «cancelled»', async (t) => {
  const b = await banco(t);
  b.giri.fallisci(b.giri.indice('Fai uno'), 'credenziale', 'Credenziale rifiutata dal fornitore.');
  b.giri.rispondi(b.giri.indice('Fai due'), 'valore 9');
  assert.ok(await aspettaChe(async () => (await b.stato()) === 'needs_attention'));
  assert.ok(await aspettaChe(() => b.giri.risvegli(b.rootId).length === 1), 'the parent wakes on «needs attention»');
  const prima = b.esitoDi(b.giri.risvegli(b.rootId)[0]);
  assert.equal(prima.stato, 'needs_attention');
  assert.deepEqual(prima.motiviAttenzione, ['node_failed']);
  assert.match(prima.nota, /the person can retry/iu);
  b.giri.rispondi(b.giri.quanti - 1, 'il passo uno è fallito: ti spiego');
  await b.registro.attendiAssestamento(b.rootId);
  await b.comanda('cancel');
  assert.ok(await aspettaChe(async () => (await b.stato()) === 'cancelled'));
  assert.ok(await aspettaChe(() => b.giri.risvegli(b.rootId).length === 2), 'and again when the run is cancelled');
  assert.equal(b.esitoDi(b.giri.risvegli(b.rootId)[1]).stato, 'cancelled');
});

test('C3B-RISVEGLIO-SRV-03: the other way — a pause does not wake the parent (the person asked for it); the cancel after it does', async (t) => {
  const b = await banco(t);
  await b.comanda('pause');
  b.giri.rispondi(b.giri.indice('Fai uno'), 'valore 7');
  b.giri.rispondi(b.giri.indice('Fai due'), 'valore 9');
  assert.ok(await aspettaChe(async () => ['paused', 'succeeded'].includes(await b.stato())));
  const statoDopoPausa = await b.stato();
  await calma();
  if (statoDopoPausa === 'paused') {
    assert.equal(b.giri.risvegli(b.rootId).length, 0, 'paused: no wake');
    assert.equal(b.consegnati.length, 0);
    await b.comanda('cancel');
    assert.ok(await aspettaChe(async () => (await b.stato()) === 'cancelled'));
    assert.ok(await aspettaChe(() => b.giri.risvegli(b.rootId).length === 1));
  } else {
    // ⛔ i due passi finiti prima che la pausa avesse un passo da fermare: la scena non prova la pausa, lo dice
    assert.fail(`the run ended ${statoDopoPausa} before the pause took effect: the scene does not test the pause`);
  }
});
