/*
 * F3-41b (25/09/2026) — il CICLO dello scheduler, dal prodotto: proposta → approvazione → avvio (run `prepared`) → lo scheduler
 * scrive `run_started`, ammette i passi pronti sotto i tetti, li esegue come sessioni vere del registro (kernel finto), decide
 * i ritentativi e chiude il run. Decisioni owner del 25/09: 4 insieme con AIMD sul 429, locale da solo, fallimento «come
 * Hermes», budget pieno a ogni tentativo. Ledger: `.claude/LEDGER-F3-41-SCHEDULER-2026-09-25.md`.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { createAgentSessionAdapter } from '../src/workflow/adapters/agent-session.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { workflowReplay } from '../src/workflow/run.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from '../src/workflow/scheduler.mjs';
import { createWorkflowStore, readDefinition, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const CLOUD = 'z-ai/glm-5.3-flash';
const bozza = (figli, extra = []) => ({
  title: 'Prova scheduler', objective: 'Provare il ciclo.',
  phases: [{ id: 'f', label: 'Fase' }],
  nodes: [
    { id: 'prepara', phase: 'f', label: 'Prepara', task: 'Prepara.' },
    ...figli.map((id) => ({ id, phase: 'f', label: id, task: `Fai ${id}.`, dependsOn: ['prepara'] })),
    ...extra,
  ],
});

function giriFinti() {
  const giri = [];
  const tocca = (i, usage) => giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage } });
  const misura = { vivi: 0, massimo: 0, viviIndici: new Set() };
  const api = {
    misura,
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi, consegna: input.task?.consegna ?? '' });
      const i = giri.length - 1;
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      // i passi (non la radice) contati mentre sono vivi
      if (i > 0) {
        misura.vivi += 1;
        misura.viviIndici.add(i);
        misura.massimo = Math.max(misura.massimo, misura.vivi);
        promessa.then(() => { misura.vivi -= 1; misura.viviIndici.delete(i); });
      }
      return promessa;
    },
    /** L'indice del giro che porta il compito di un passo (la consegna comincia col suo `task`). */
    indice(testo) { return giri.findIndex((giro) => giro.consegna.startsWith(testo)); },
    rispondi(i, testo = 'fatto') {
      tocca(i, { prompt_tokens: 10, completion_tokens: 5 });
      giri[i].input.onEvento({ type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' });
      giri[i].input.onEvento({ type: 'TextMessageContent', messageId: `m${i}`, delta: testo });
      giri[i].input.onEvento({ type: 'RunFinished' });
      giri[i].risolvi({ ok: true });
    },
    fallisci(i, classe, message = 'guasto') {
      tocca(i, { prompt_tokens: 10, completion_tokens: 0 });
      giri[i].input.onEvento({ type: 'RunError', message, code: 'PROVIDER_REQUEST_ERROR', classe });
      giri[i].risolvi({ ok: false, esito: null, erroreInterno: message, codiceErrore: 'PROVIDER_REQUEST_ERROR' });
    },
    get quanti() { return giri.length; },
  };
  return api;
}

// ⛔ a tempo di OROLOGIO: la prima stesura contava i giri, e con una condizione lenta (un rigioco intero del giornale) un
// «3 secondi» durava ore — è successo con 41 passi.
async function aspettaChe(condizione, ms = 3_000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return Boolean(await condizione());
}
const calma = () => new Promise((r) => setTimeout(r, 120));

async function banco(t, { draft, sessionModel = CLOUD }) {
  const cartellaStore = cartellaDiProva('talos-wf-sched-sessioni-');
  const radiceWorkflow = mkdtempSync(join(tmpdir(), 'talos-wf-sched-store-'));
  const giri = giriFinti();
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaStore,
    avviaSessioneFn: giri.avviaSessioneFn, cartellaEsisteFn: () => true, workflowPlanProposeFn: async () => ({}),
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'radice' } };
    } });
  const store = await createWorkflowStore({ workflowDataRoot: radiceWorkflow, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  const orologio = { ms: Date.now() + 60_000, avanza(ms) { this.ms += ms; } };
  const nowFn = () => new Date(orologio.ms).toISOString();
  const timer = { attesi: [] };
  const componi = () => {
    const capacita = createCapacitaAdattiva();
    const orchestrator = createWorkflowOrchestrator({ store, nowFn, randomFn: () => 0.5, capacityFn: () => capacita.politica(),
      adapters: new Map([['agent-session', createAgentSessionAdapter({ sessions: registro })]]) });
    const errori = [];
    const scheduler = createWorkflowScheduler({ orchestrator, store, capacita, nowFn, onErrore: (errore) => errori.push(errore),
      timerFn: (fn, ms) => { const voce = { fn, ms }; timer.attesi.push(voce); return voce; },
      clearTimerFn: (voce) => { timer.attesi = timer.attesi.filter((altro) => altro !== voce); } });
    return { capacita, orchestrator, scheduler, errori };
  };
  const primo = componi();
  t.after(async () => {
    primo.scheduler.ferma();
    await store.close();
    for (let i = 0; i < 3; i += 1) { try { await attendiScritture({ cartellaStore }); } catch { /* */ } await new Promise((r) => setImmediate(r)); }
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(radiceWorkflow);
  });
  const radice = registro.avvia('task-vero', { modelloScelto: sessionModel });
  const esiste = (id) => id === radice.sessionId;
  const proposta = await proposeWorkflowFromTool(store, { sessionId: radice.sessionId, toolCallId: `call_${randomUUID()}`, draft,
    plannerModel: null, sessionModel, modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste });
  const avviato = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });
  const runId = avviato.runId;
  const stato = async () => {
    const eventi = await readEvents(store, { runId });
    const definizione = await readDefinition(store, { workflowId: eventi[0].payload.workflowId, version: eventi[0].payload.definitionVersion });
    return { eventi, stato: workflowReplay({ definition: definizione.core, runId, events: eventi }) };
  };
  return { ...primo, componi, giri, runId, stato, orologio, timer, store };
}

test('WF-SCHEDULER-DEPENDENCY-ORDER: the scheduler starts the run, runs the first step alone, then its two children together, then closes the run', async (t) => {
  const b = await banco(t, { draft: bozza(['uno', 'due']) });
  await b.orchestrator.recover();
  await b.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2), 'the first step starts');
  await calma();
  assert.equal(b.giri.quanti, 2, 'no child before its parent has finished');
  let { eventi } = await b.stato();
  const iniziato = eventi.findIndex((evento) => evento.type === 'run_started');
  assert.ok(iniziato > 0 && iniziato < eventi.findIndex((evento) => evento.type === 'activity_scheduled'), 'run_started comes before any attempt');
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 4), 'the two children start together');
  b.giri.rispondi(b.giri.indice('Fai uno'));
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'), 'the run is closed');
  ({ eventi } = await b.stato());
  assert.equal(eventi.filter((evento) => evento.type === 'capacity_released').length, 3, 'every slot is released');
  const foglie = eventi.filter((evento) => evento.type === 'result_recorded' && ['uno', 'due'].includes(evento.payload.resultRef.nodeId))
    .map((evento) => evento.payload.resultRef.id).sort();
  assert.deepEqual(eventi.find((evento) => evento.type === 'run_succeeded').payload,
    { finalResultIds: foglie, integrationCommit: null }, 'the final results are those of the leaves, not of the first step');
  assert.deepEqual(b.errori, []);
});

test('WF-FAILURE-LIKE-HERMES: a failed step lets the independent branch finish, keeps its dependent blocked, then asks for attention', async (t) => {
  const b = await banco(t, { draft: bozza(['uno', 'due'], [{ id: 'dopo', phase: 'f', label: 'Dopo', task: 'Dopo uno.', dependsOn: ['uno'] }]) });
  await b.orchestrator.recover();
  await b.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 4));
  b.giri.fallisci(b.giri.indice('Fai uno'), 'credenziale', 'Credenziale rifiutata dal fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('uno').state === 'failed'));
  await calma();
  let { stato } = await b.stato();
  assert.equal(stato.run.status, 'running', 'the independent branch is still running: no attention yet');
  assert.equal(stato.nodes.get('dopo').state, 'blocked');
  b.giri.rispondi(b.giri.indice('Fai due'));
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'));
  ({ stato } = await b.stato());
  assert.deepEqual(stato.run.needsAttentionReasons, ['node_failed']);
  assert.equal(stato.nodes.get('due').state, 'succeeded');
  assert.equal(stato.nodes.get('dopo').state, 'blocked');
});

test('WF-FAILURE-WAITS-FOR-RETRY: a failure does not ask for attention while another branch waits for its retry with no slot held', async (t) => {
  const b = await banco(t, { draft: bozza(['uno', 'due']) });
  await b.orchestrator.recover();
  await b.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 4));
  b.giri.fallisci(b.giri.indice('Fai due'), 'traffico', 'Troppo traffico presso il fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('due').state === 'retry_wait'));
  b.giri.fallisci(b.giri.indice('Fai uno'), 'credenziale', 'Credenziale rifiutata dal fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('uno').state === 'failed'));
  await calma();
  let { stato } = await b.stato();
  assert.equal(stato.run.status, 'running', '«due» will be retried: the run is not stuck yet');
  assert.ok(![...stato.capacityClaims.values()].some((claim) => claim.state === 'active'), 'and no slot is held (the other guard alone would not see it)');
  b.orologio.avanza(1_000);
  b.timer.attesi.at(-1).fn();
  assert.ok(await aspettaChe(() => b.giri.quanti === 5), 'the retry of «due» starts');
  b.giri.rispondi(4);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'needs_attention'));
  ({ stato } = await b.stato());
  assert.equal(stato.nodes.get('due').state, 'succeeded');
});

test('WF-ADAPTIVE-CEILING: 4 at once at most; a 429 halves the model limit and no new step starts until the flight drops under it', async (t) => {
  const b = await banco(t, { draft: bozza(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) });
  await b.orchestrator.recover();
  await b.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 6), 'four children start');
  await calma();
  assert.equal(b.giri.quanti, 6, 'never more than 4 at once');
  b.giri.fallisci(b.giri.indice('Fai c1'), 'traffico', 'Troppo traffico presso il fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('c1').state === 'retry_wait'));
  await calma();
  assert.equal(b.capacita.limite('openrouter', CLOUD), 2, 'the 429 halved the limit');
  assert.equal(b.giri.quanti, 6, 'three still in flight, over the new limit of 2: nothing new starts');
  b.giri.rispondi(b.giri.indice('Fai c2'));
  await aspettaChe(async () => (await b.stato()).stato.nodes.get('c2').state === 'succeeded');
  await calma();
  assert.equal(b.giri.quanti, 6, 'two in flight = the limit: still nothing new');
  b.giri.rispondi(b.giri.indice('Fai c3'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 7), 'one in flight: one more starts');
  await calma();
  assert.equal(b.giri.quanti, 7, 'and only one');
});

test('WF-SCHEDULER-RETRY-AFTER-RESTART: a proven retryable failure left undecided by a restart is released, decided and retried', async (t) => {
  const b = await banco(t, { draft: bozza(['uno']) });
  await b.orchestrator.recover();
  await b.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 3));
  // «riavvio»: il primo scheduler si ferma prima di vedere la fine del passo, che fallisce con un 429
  b.scheduler.ferma();
  b.giri.fallisci(b.giri.indice('Fai uno'), 'traffico', 'Troppo traffico presso il fornitore.');
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.some((evento) => evento.type === 'activity_failed')));
  await calma();
  assert.ok(!(await b.stato()).eventi.some((evento) => ['capacity_released', 'retry_scheduled'].includes(evento.type) && evento.nodeId === 'uno'),
    'a stopped scheduler writes nothing when a step finishes');
  const dopo = b.componi();
  await dopo.orchestrator.recover();
  await dopo.scheduler.avvia();
  let { eventi, stato } = await b.stato();
  assert.ok(eventi.some((evento) => evento.type === 'retry_scheduled'), 'the decision is taken again after the restart');
  assert.equal(stato.nodes.get('uno').state, 'retry_wait');
  assert.equal(b.timer.attesi.length > 0, true, 'a timer is armed for the retry');
  b.orologio.avanza(1_000);
  b.timer.attesi.at(-1).fn();
  assert.ok(await aspettaChe(() => b.giri.quanti === 4), 'the second attempt starts');
  b.giri.rispondi(3);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  dopo.scheduler.ferma();
  ({ stato } = await b.stato());
  assert.equal(stato.nodes.get('uno').attempt, 2);
});

/*
 * ⛔ 12 passi, non 40: con 41 passi la prova durava minuti PRIMA della cache di lettura dello Store (ogni operazione rigiocava
 *   tutto il giornale). ⛔ E a ONDATE, non con risposte automatiche a tempo: la prima stesura contava il massimo in volo con
 *   risposte dopo 300 ms, e nella suite intera (macchina carica) arrivava a 3 invece di 4 — una prova che dipendeva dai tempi.
 *   Qui a ogni ondata si aspetta che siano vivi ESATTAMENTE min(4, rimasti), si controlla che un quinto non parta, e se ne chiude uno.
 */
test('WF-SCHEDULER-CAPACITY-BACKPRESSURE: 12 steps ready at once keep exactly 4 sessions in flight, never 5, until all of them finish', async (t) => {
  const figli = Array.from({ length: 12 }, (_, i) => `s${String(i + 1).padStart(2, '0')}`);
  const b = await banco(t, { draft: bozza(figli) });
  await b.orchestrator.recover();
  await b.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  b.giri.rispondi(b.giri.indice('Prepara'));
  for (let rimasti = 12; rimasti > 0; rimasti -= 1) {
    const attesi = Math.min(4, rimasti);
    assert.ok(await aspettaChe(() => b.giri.misura.vivi === attesi, 5_000), `${attesi} in flight with ${rimasti} left, measured ${b.giri.misura.vivi}`);
    await calma();
    assert.equal(b.giri.misura.vivi, attesi, `never more than the ceiling: alive ${[...b.giri.misura.viviIndici]} of ${b.giri.quanti}, ${rimasti} left`);
    // si chiude il più vecchio e si aspetta che sia DAVVERO chiuso, prima di contare l'ondata dopo (altrimenti il conto è vecchio)
    const chiuso = Math.min(...b.giri.misura.viviIndici);
    b.giri.rispondi(chiuso);
    assert.ok(await aspettaChe(() => !b.giri.misura.viviIndici.has(chiuso)));
  }
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded', 10_000), 'every step finishes');
  assert.equal(b.giri.misura.massimo, 4);
  const { eventi } = await b.stato();
  assert.equal(eventi.filter((evento) => evento.type === 'node_succeeded').length, 13);
});

test('WF-SCHEDULER-NO-HOT-LOOP: a step whose dispatch is refused before any attempt exists is not re-admitted in a loop', async () => {
  let ammissioni = 0;
  const stato = {
    run: { status: 'running', schedulingEnabled: true }, capacityClaims: new Map(), activities: new Map(), timers: new Map(),
    nodes: new Map([['a', { nodeId: 'a', state: 'ready' }]]), indexes: { readyQueue: ['a'] },
  };
  const definition = { definitionSchemaVersion: 2, budgets: {}, nodes: [{ id: 'a', kind: 'agent', capabilityProfile: 'read', modelPolicy: { mode: 'session' }, budget: {} }] };
  const orchestrator = {
    // cede il turno come una lettura vera dal disco: senza, un giro caldo girerebbe solo sui microtask e fermerebbe anche la prova
    readRun: async () => { await new Promise((r) => setImmediate(r)); return { definition, definitionRecord: { proposal: { sessionModel: CLOUD } }, state: stato, events: [] }; },
    startRun: async () => ({}), completeRun: async () => ({}), fireDueRetryTimers: async () => ({ fired: [] }),
    decideAfterFailure: async () => ({}), releaseAdmission: async () => ({}),
    admitActivity: async () => { ammissioni += 1; return { claimId: randomUUID(), budgetReservationId: randomUUID(), preparedIdentity: { attempt: 1 } }; },
    executeNode: async () => { throw Object.assign(new Error('refused before any attempt'), { code: 'WORKFLOW_ACTIVITY_KIND_MISMATCH' }); },
  };
  const errori = [];
  const scheduler = createWorkflowScheduler({ orchestrator, store: {}, capacita: createCapacitaAdattiva(), onErrore: (e) => errori.push(e.code) });
  scheduler.sveglia(randomUUID());
  await new Promise((r) => setTimeout(r, 300));
  scheduler.ferma();
  assert.equal(ammissioni, 1, `admitted ${ammissioni} times in 300 ms`);
  assert.deepEqual(errori, ['WORKFLOW_ACTIVITY_KIND_MISMATCH'], 'said once');
});

test('WF-LOCAL-ALONE: steps on a local model run one at a time', async (t) => {
  const b = await banco(t, { draft: bozza(['uno', 'due']), sessionModel: 'ollama:llama3.2' });
  await b.orchestrator.recover();
  await b.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  b.giri.rispondi(b.giri.indice('Prepara'));
  assert.ok(await aspettaChe(() => b.giri.quanti === 3));
  await calma();
  assert.equal(b.giri.quanti, 3, 'the second local step waits');
  b.giri.rispondi(2);
  assert.ok(await aspettaChe(() => b.giri.quanti === 4), 'then it starts');
  b.giri.rispondi(3);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
});
