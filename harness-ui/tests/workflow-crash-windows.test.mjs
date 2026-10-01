/*
 * F3-41c (25/09/2026) — le FINESTRE DI CROLLO del ciclo, dal prodotto: un processo che muore a metà lascia nel giornale uno stato
 * intermedio, e il processo nuovo (registro ripristinato dal disco, orchestratore e scheduler nuovi, stesso Store) deve
 * riprenderlo da solo, senza doppioni e senza posti o budget appesi. Decisioni owner del 25/09: «lo rifaccio da solo» (un
 * tentativo incerto dopo un riavvio si ritenta, e conta come tentativo) e «i token del tentativo interrotto contano».
 * Catalogo: `harness-ui/docs/WORKFLOW-EVENT-CATALOG-v1-2026-09-20.md` §19 (ordine dei fatti) e activity_reconciled.
 * Ledger: `.claude/LEDGER-F3-41-SCHEDULER-2026-09-25.md`, sezione F3-41c.
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
import { validateWorkflowEvent } from '../src/workflow/contract.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { workflowReplay } from '../src/workflow/run.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler, decidiDopoFallimento, riservaDelPasso } from '../src/workflow/scheduler.mjs';
import { createWorkflowStore, readDefinition, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { creaAttesaAProgresso } from './aiuto/attesa-a-progresso.mjs';

const CLOUD = 'z-ai/glm-5.3-flash';
const BOZZA = {
  title: 'Prova crolli', objective: 'Provare la ripresa dopo un crollo.',
  phases: [{ id: 'f', label: 'Fase' }],
  nodes: [
    { id: 'prepara', phase: 'f', label: 'Prepara', task: 'Prepara.' },
    { id: 'uno', phase: 'f', label: 'Uno', task: 'Fai uno.', dependsOn: ['prepara'] },
  ],
};

function giriFinti() {
  const giri = [];
  const api = {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi, consegna: input.task?.consegna ?? '' });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    indice(testo) { return giri.findIndex((giro) => giro.consegna.startsWith(testo)); },
    consuma(i, usage) { giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage } }); },
    rispondi(i, testo = 'fatto') {
      api.consuma(i, { prompt_tokens: 10, completion_tokens: 5 });
      giri[i].input.onEvento({ type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' });
      giri[i].input.onEvento({ type: 'TextMessageContent', messageId: `m${i}`, delta: testo });
      giri[i].input.onEvento({ type: 'RunFinished' });
      giri[i].risolvi({ ok: true });
    },
    get quanti() { return giri.length; },
  };
  return api;
}

/* 01/10/2026: l'attesa conta il tempo SENZA progresso delle cartelle dati del banco (tests/aiuto/attesa-a-progresso.mjs). */
const { aspettaChe, segui } = creaAttesaAProgresso({ ms: 3_000 });

async function svuota(cartellaStore) {
  for (let i = 0; i < 3; i += 1) {
    try { await attendiScritture({ cartellaStore }); } catch { /* */ }
    await new Promise((r) => setImmediate(r));
  }
}

async function banco(t) {
  const cartellaStore = segui(cartellaDiProva('talos-wf-crolli-sessioni-'));
  const radiceWorkflow = segui(mkdtempSync(join(tmpdir(), 'talos-wf-crolli-store-')));
  const opzioniRegistro = (giri) => ({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaStore,
    avviaSessioneFn: giri.avviaSessioneFn, cartellaEsisteFn: () => true, workflowPlanProposeFn: async () => ({}),
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'radice' } };
    } });
  const giri = giriFinti();
  const registro = createSessionRegistry(opzioniRegistro(giri));
  const store = await createWorkflowStore({ workflowDataRoot: radiceWorkflow, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  const orologio = { ms: Date.now() + 60_000, avanza(ms) { this.ms += ms; } };
  const nowFn = () => new Date(orologio.ms).toISOString();
  const timer = { attesi: [] };
  const schedulers = [];
  /** Un processo: orchestratore e scheduler nuovi sul registro dato. `idFn` serve a far crollare una scrittura. */
  const componi = ({ sessioni = registro, idFn, adattatori } = {}) => {
    const capacita = createCapacitaAdattiva();
    const orchestrator = createWorkflowOrchestrator({ store, nowFn, randomFn: () => 0.5, capacityFn: () => capacita.politica(),
      ...(idFn ? { idFn } : {}), adapters: adattatori ?? new Map([['agent-session', createAgentSessionAdapter({ sessions: sessioni })]]) });
    const errori = [];
    const scheduler = createWorkflowScheduler({ orchestrator, store, capacita, nowFn, onErrore: (errore) => errori.push(errore),
      timerFn: (fn, ms) => { const voce = { fn, ms }; timer.attesi.push(voce); return voce; },
      clearTimerFn: (voce) => { timer.attesi = timer.attesi.filter((altro) => altro !== voce); } });
    schedulers.push(scheduler);
    return { capacita, orchestrator, scheduler, errori };
  };
  /** Il processo nuovo dopo un crollo: un registro NUOVO ripristinato dal disco (nessuna sessione vecchia è viva). */
  const riavvia = async ({ adattatori } = {}) => {
    await svuota(cartellaStore);
    const giriDopo = giriFinti();
    const registroDopo = createSessionRegistry(opzioniRegistro(giriDopo));
    await registroDopo.ripristina();
    return { giri: giriDopo, registro: registroDopo, ...componi({ sessioni: registroDopo, adattatori }) };
  };
  t.after(async () => {
    for (const scheduler of schedulers) scheduler.ferma();
    await store.close();
    await svuota(cartellaStore);
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(radiceWorkflow);
  });
  const radice = registro.avvia('task-vero', { modelloScelto: CLOUD });
  const esiste = (id) => id === radice.sessionId;
  const proposta = await proposeWorkflowFromTool(store, { sessionId: radice.sessionId, toolCallId: `call_${randomUUID()}`, draft: BOZZA,
    plannerModel: null, sessionModel: CLOUD, modalitaOperativa: 'normale', agentRole: 'root' });
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
  return { componi, riavvia, giri, registro, runId, stato, orologio, timer, cartellaStore };
}

/** Ammette `prepara` a mano, come fa lo scheduler (stessi argomenti), e ne restituisce l'ammissione. */
async function ammettiPrepara({ orchestrator, capacita }, runId) {
  capacita.registra('openrouter', CLOUD);
  await orchestrator.startRun({ runId });
  const run = await orchestrator.readRun({ runId });
  const step = run.definition.nodes.find((node) => node.id === 'prepara');
  return orchestrator.admitActivity({ runId, nodeId: 'prepara', provider: 'openrouter', model: CLOUD, workspaceRoot: null,
    agentSlots: 1, writerSlots: 0, localProcessSlots: 0, reserved: riservaDelPasso(step, run.definition) });
}

const tipiDelNodo = (eventi, nodeId) => eventi.filter((evento) => evento.nodeId === nodeId).map((evento) => evento.type);
const nessunPostoAppeso = (stato) => ![...stato.capacityClaims.values()].some((claim) => claim.state === 'active') && stato.budget.reservations.size === 0;

test('WF-UNCERTAIN-RETRIED-AFTER-RESTART: a step cut by a restart is proven interrupted, its tokens are settled, and it is retried as attempt 2', async (t) => {
  const b = await banco(t);
  const primo = b.componi();
  await primo.orchestrator.recover();
  await primo.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2), 'the first step starts');
  // il passo ha già speso: due richieste al fornitore, 700 + 40 token, poi il processo muore senza una fine
  b.giri.consuma(1, { prompt_tokens: 400, completion_tokens: 25 });
  b.giri.consuma(1, { prompt_tokens: 300, completion_tokens: 15 });
  primo.scheduler.ferma();

  const dopo = await b.riavvia();
  await dopo.orchestrator.recover();
  await dopo.scheduler.avvia();
  let { eventi, stato } = await b.stato();
  const riconciliato = eventi.find((evento) => evento.type === 'activity_reconciled');
  assert.equal(riconciliato?.payload.outcome, 'proved_interrupted', 'the session is found on disk, not alive: interrupted');
  assert.match(riconciliato.payload.receiptRef, /^talos-session:/u);
  assert.equal(riconciliato.payload.actualUsage.promptTokens, 700);
  assert.equal(riconciliato.payload.actualUsage.completionTokens, 40);
  assert.equal(riconciliato.payload.actualUsage.modelRequests, 2);
  const saldo = eventi.find((evento) => evento.type === 'budget_settled' && evento.nodeId === 'prepara');
  assert.equal(saldo?.payload.actual.promptTokens, 700, '«i token del tentativo interrotto contano»: settled, not released');
  assert.equal(stato.budget.spent.promptTokens, 700);
  assert.deepEqual(tipiDelNodo(eventi, 'prepara').slice(-6),
    ['activity_uncertain', 'activity_reconciled', 'capacity_released', 'budget_settled', 'retry_scheduled', 'timer_scheduled'],
    'catalog §19 order: reconciliation → release → settlement → retry fact');
  assert.equal(eventi.find((evento) => evento.type === 'retry_scheduled').payload.reasonClass, 'process_exit_retryable');
  assert.equal(stato.nodes.get('prepara').state, 'retry_wait');
  assert.ok(nessunPostoAppeso(stato));

  b.orologio.avanza(1_000);
  b.timer.attesi.at(-1).fn();
  assert.ok(await aspettaChe(() => dopo.giri.quanti === 1), 'the second attempt starts in the new process');
  dopo.giri.rispondi(0);
  assert.ok(await aspettaChe(() => dopo.giri.quanti === 2), 'then its dependent');
  dopo.giri.rispondi(1);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  ({ eventi, stato } = await b.stato());
  assert.equal(stato.nodes.get('prepara').attempt, 2, 'the interrupted attempt counted');
  assert.equal(stato.budget.spent.promptTokens, 720, '700 of the interrupted attempt + 10 + 10 of the two answers');
  assert.equal(b.giri.quanti, 2, 'nothing ran again in the dead process');
  assert.deepEqual([...primo.errori, ...dopo.errori], []);

  // il contratto del fatto: prova, consumo misurato e nessun risultato, o niente
  const { payload, ...resto } = riconciliato;
  validateWorkflowEvent(riconciliato);
  for (const [guasto, rotto] of [
    ['no receipt', { ...payload, receiptRef: null }],
    ['no usage', { ...payload, actualUsage: null }],
    ['results', { ...payload, resultIds: [randomUUID()] }],
  ]) {
    assert.throws(() => validateWorkflowEvent({ ...resto, payload: rotto }), { code: 'WORKFLOW_EVENT_INVALID' }, guasto);
  }
  assert.throws(() => validateWorkflowEvent({ ...resto, schema: 'talos.workflow-event.v1', eventSchemaVersion: 1,
    payload: { outcome: 'proved_interrupted', receiptRef: payload.receiptRef, resultIds: [] } }), { code: 'WORKFLOW_EVENT_INVALID' },
  'v1 has no interrupted outcome');
});

test('WF-UNCERTAIN-NOT-RETRIED-WHEN-THE-STEP-SAYS-SO: an interrupted attempt of a step that is not at-least-once fails and asks for a person', async (t) => {
  const b = await banco(t);
  const primo = b.componi();
  await primo.orchestrator.recover();
  // il passo VERO compilato dalla bozza; la politica «a mano» si prova sulla decisione, perché la bozza oggi dà sempre at-least-once
  const run = await primo.orchestrator.readRun({ runId: b.runId });
  const passo = run.definition.nodes.find((node) => node.id === 'prepara');
  const decisione = decidiDopoFallimento({ step: { ...passo, activityPolicy: { ...passo.activityPolicy, retryMode: 'manual-on-uncertain' } },
    oraIso: new Date().toISOString(), fallito: { attempt: 1, errorClass: 'process_exit', retryable: true, interrotto: true } });
  assert.deepEqual(decisione, { azione: 'fallisci', errorClass: 'process_exit', motivo: 'incerto-da-decidere-a-mano' });
  const nonEseguito = decidiDopoFallimento({ step: { ...passo, activityPolicy: { ...passo.activityPolicy, retryMode: 'manual-on-uncertain' } },
    oraIso: new Date().toISOString(), casuale: () => 0.5, fallito: { attempt: 1, errorClass: 'process_exit', retryable: true, nonEseguito: true } });
  assert.equal(nonEseguito.azione, 'ritenta', 'a step proven NOT performed has no effect to repeat: retried whatever the mode');
  const ultimo = decidiDopoFallimento({ step: passo, oraIso: new Date().toISOString(),
    fallito: { attempt: 2, errorClass: 'process_exit', retryable: true, interrotto: true } });
  assert.equal(ultimo.motivo, 'tentativi-esauriti', 'the attempt cap still holds for interrupted attempts');
});

test('WF-CRASH-CLAIM-BEFORE-SCHEDULE: a slot taken by a process that died before scheduling is released as never scheduled, and the step runs', async (t) => {
  const b = await banco(t);
  const primo = b.componi();
  await primo.orchestrator.recover();
  const ammesso = await ammettiPrepara(primo, b.runId);
  let { stato } = await b.stato();
  assert.equal(stato.capacityClaims.get(ammesso.claimId)?.state, 'active', 'the crash leaves a claim with no attempt');

  const dopo = await b.riavvia();
  await dopo.orchestrator.recover();
  await dopo.scheduler.avvia();
  assert.ok(await aspettaChe(() => dopo.giri.quanti === 1), 'the step starts in the new process');
  let eventi;
  ({ eventi, stato } = await b.stato());
  const rilascio = eventi.find((evento) => evento.type === 'capacity_released' && evento.payload.claimId === ammesso.claimId);
  assert.equal(rilascio?.payload.reason, 'never_scheduled');
  assert.equal(eventi.find((evento) => evento.type === 'budget_released' && evento.payload.reservationId === ammesso.budgetReservationId)?.payload.reason,
    'not_started');
  const programmati = eventi.filter((evento) => evento.type === 'activity_scheduled');
  assert.equal(programmati.length, 1);
  assert.equal(programmati[0].attempt, 1, 'a claim that never became an attempt does not count as one');
  assert.equal(stato.budget.spent.promptTokens, 0);
  dopo.giri.rispondi(0);
  assert.ok(await aspettaChe(() => dopo.giri.quanti === 2));
  dopo.giri.rispondi(1);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  assert.deepEqual(dopo.errori, []);
});

test('WF-CRASH-SCHEDULE-BEFORE-START: an attempt scheduled but never started is proven not performed, released without spending, and retried', async (t) => {
  const b = await banco(t);
  let permesse = Infinity;
  const idFn = () => {
    if (permesse <= 0) throw Object.assign(new Error('the process died here'), { code: 'CROLLO_DI_PROVA' });
    permesse -= 1;
    return randomUUID();
  };
  const primo = b.componi({ idFn });
  await primo.orchestrator.recover();
  const ammesso = await ammettiPrepara(primo, b.runId);
  // con l'identità preparata l'unica chiamata a `idFn` prima dell'avvio è l'eventId di `activity_scheduled`: la seconda muore
  permesse = 1;
  await assert.rejects(primo.orchestrator.executeNode({ runId: b.runId, nodeId: 'prepara', activityKind: 'agent-session', resourceClass: 'agent',
    idempotencyKey: `${b.runId}/prepara/1`, budgetReservationId: ammesso.budgetReservationId, deadlineAt: null,
    preparedIdentity: ammesso.preparedIdentity }), { code: 'CROLLO_DI_PROVA' });
  let { eventi } = await b.stato();
  assert.deepEqual(tipiDelNodo(eventi, 'prepara').slice(-1), ['activity_scheduled'], 'the journal ends between the two facts');
  assert.equal(b.giri.quanti, 1, 'no session was started');

  const dopo = await b.riavvia();
  await dopo.orchestrator.recover();
  await dopo.scheduler.avvia();
  let stato;
  ({ eventi, stato } = await b.stato());
  assert.deepEqual(tipiDelNodo(eventi, 'prepara').slice(-8),
    ['activity_scheduled', 'activity_started', 'activity_uncertain', 'activity_reconciled', 'capacity_released', 'budget_released',
      'retry_scheduled', 'timer_scheduled']);
  assert.equal(eventi.find((evento) => evento.type === 'activity_reconciled').payload.outcome, 'proved_not_performed');
  assert.equal(eventi.find((evento) => evento.type === 'budget_released').payload.reason, 'reconciled_not_performed');
  assert.equal(stato.budget.spent.promptTokens, 0, 'nothing was spent');
  assert.ok(nessunPostoAppeso(stato));
  b.orologio.avanza(1_000);
  b.timer.attesi.at(-1).fn();
  assert.ok(await aspettaChe(() => dopo.giri.quanti === 1), 'the retry starts');
  dopo.giri.rispondi(0);
  assert.ok(await aspettaChe(() => dopo.giri.quanti === 2));
  dopo.giri.rispondi(1);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  ({ stato } = await b.stato());
  assert.equal(stato.nodes.get('prepara').attempt, 2);
  assert.deepEqual(dopo.errori, []);
});

test('WF-CRASH-TERMINAL-BEFORE-SETTLEMENT: a step that finished while its process died is released and settled once, then the run goes on', async (t) => {
  const b = await banco(t);
  const primo = b.componi();
  await primo.orchestrator.recover();
  await primo.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  primo.scheduler.ferma();
  b.giri.rispondi(1);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.nodes.get('prepara').state === 'succeeded'));
  await new Promise((r) => setTimeout(r, 120));
  let { eventi, stato } = await b.stato();
  assert.ok(!eventi.some((evento) => ['capacity_released', 'budget_settled'].includes(evento.type)), 'the dead process wrote no settlement');
  assert.equal(b.giri.quanti, 2, 'and the dependent did not start');

  const dopo = await b.riavvia();
  await dopo.orchestrator.recover();
  await dopo.scheduler.avvia();
  assert.ok(await aspettaChe(() => dopo.giri.quanti === 1), 'the dependent starts in the new process');
  ({ eventi, stato } = await b.stato());
  assert.equal(eventi.filter((evento) => evento.type === 'capacity_released' && evento.nodeId === 'prepara').length, 1);
  assert.equal(eventi.filter((evento) => evento.type === 'budget_settled' && evento.nodeId === 'prepara').length, 1);
  assert.equal(eventi.filter((evento) => evento.type === 'activity_scheduled' && evento.nodeId === 'prepara').length, 1, 'no second attempt');
  assert.equal(stato.budget.spent.promptTokens, 10);
  dopo.giri.rispondi(0);
  assert.ok(await aspettaChe(async () => (await b.stato()).stato.run.status === 'succeeded'));
  assert.deepEqual(dopo.errori, []);
});

/*
 * WFS punto 5, `WF-STARTUP-QUARANTINE-NO-LEASE`: un recupero che non riesce (qui: il tipo di passo in volo non ha più un
 * adattatore in questo processo) lascia il runtime in quarantena — e lo scheduler, anche svegliato, non scrive NIENTE: nessun
 * posto, nessun tentativo, nessun ritentativo. La composizione del server non lo avvia nemmeno (`server.mjs`, WF-SERVER-…);
 * questa prova copre il caso in cui qualcuno lo svegli lo stesso.
 */
test('WF-STARTUP-QUARANTINE-NO-LEASE: after a failed recovery the scheduler writes nothing, even when woken', async (t) => {
  const b = await banco(t);
  const primo = b.componi();
  await primo.orchestrator.recover();
  await primo.scheduler.avvia();
  assert.ok(await aspettaChe(() => b.giri.quanti === 2));
  // il processo vecchio ha finito di scrivere ciò che scrive all'avvio di un passo (il fatto della sessione), poi «muore»
  assert.ok(await aspettaChe(async () => (await b.stato()).eventi.some((evento) => evento.type === 'agent_session_created')));
  primo.scheduler.ferma();
  const prima = (await b.stato()).eventi.length;

  const dopo = await b.riavvia({ adattatori: new Map() });
  await assert.rejects(dopo.orchestrator.recover(), 'the step in flight has no adapter here: recovery cannot prove anything');
  assert.notEqual(dopo.orchestrator.status().state, 'ready');
  await dopo.scheduler.avvia();
  await dopo.scheduler.sveglia(b.runId);
  const { eventi } = await b.stato();
  assert.deepEqual(eventi.slice(prima).map((evento) => evento.type), [], 'no fact at all: no lease, no release, no retry');
  assert.equal(dopo.giri.quanti, 0, 'no session started');
  assert.ok(dopo.errori.some((errore) => errore?.code === 'WORKFLOW_RUNTIME_NOT_READY'), 'and it says why');
});

test('WF-STARTUP-QUARANTINE-NO-LEASE (never recovered): a runtime that has not recovered does not even start a prepared run', async (t) => {
  const b = await banco(t);
  const processo = b.componi();
  assert.notEqual(processo.orchestrator.status().state, 'ready', 'a new runtime starts quarantined until recovery');
  const prima = (await b.stato()).eventi.map((evento) => evento.type);
  await processo.scheduler.avvia();
  await processo.scheduler.sveglia(b.runId);
  assert.deepEqual((await b.stato()).eventi.map((evento) => evento.type), prima, 'still only run_created: no run_started, no lease');
  assert.equal(b.giri.quanti, 1, 'only the root session');
  assert.ok(processo.errori.some((errore) => errore?.code === 'WORKFLOW_RUNTIME_NOT_READY'));
});
