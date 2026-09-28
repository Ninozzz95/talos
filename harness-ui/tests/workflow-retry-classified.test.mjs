/*
 * F3-41a (25/09/2026) — il RITENTATIVO CLASSIFICATO di un passo di Workflow, dal prodotto: sessione vera del registro (kernel
 * finto) che finisce con un guasto del fornitore → `activity_failed` con la classe del catalogo → rilascio e saldo →
 * `retry_scheduled` + timer → il nodo torna `ready` solo col `timer_fired` giusto → secondo tentativo.
 * Ledger: `.claude/LEDGER-F3-41-SCHEDULER-2026-09-25.md`. Decisioni owner del 25/09 (2 tentativi, «come Hermes»).
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
import { classeDelFallimento, createAgentSessionAdapter } from '../src/workflow/adapters/agent-session.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { workflowApply, workflowReplay } from '../src/workflow/run.mjs';
import { decidiDopoFallimento } from '../src/workflow/scheduler.mjs';
import { appendEvent, createWorkflowStore, readDefinition, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODELLO = 'z-ai/glm-5.3-flash';
const BOZZA = {
  title: 'Riassunto', objective: 'Riassumere le note.',
  phases: [{ id: 'lettura', label: 'Lettura' }],
  nodes: [{ id: 'leggi', phase: 'lettura', label: 'Leggi le note', task: 'Leggi note.md e riassumi le decisioni.' }],
};
const TRAFFICO = { code: 'PROVIDER_REQUEST_ERROR', classe: 'traffico', message: 'Troppo traffico presso il fornitore.' };

function giriFinti() {
  const giri = [];
  const consumo = (i, usage) => giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage } });
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    rispondi(i, testo, usage) {
      consumo(i, usage);
      giri[i].input.onEvento({ type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' });
      giri[i].input.onEvento({ type: 'TextMessageContent', messageId: `m${i}`, delta: testo });
      giri[i].input.onEvento({ type: 'RunFinished' });
      giri[i].risolvi({ ok: true });
    },
    /** Come fa agent-service quando il kernel lancia: un `RunError` col codice, e la classe quando il kernel l'ha decisa. */
    fallisci(i, { code, classe, message }, usage) {
      consumo(i, usage);
      giri[i].input.onEvento({ type: 'RunError', message, code, ...(classe === undefined ? {} : { classe }) });
      giri[i].risolvi({ ok: false, esito: null, erroreInterno: message, codiceErrore: code });
    },
    async aspetta(n) { for (let k = 0; k < 400 && giri.length < n; k += 1) await new Promise((r) => setTimeout(r, 5)); assert.ok(giri.length >= n, `${n} runs expected, ${giri.length} started`); },
  };
}

async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-wf-retry-sessioni-');
  const radiceWorkflow = mkdtempSync(join(tmpdir(), 'talos-wf-retry-store-'));
  const giri = giriFinti();
  const registro = createSessionRegistry({ guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaStore,
    avviaSessioneFn: giri.avviaSessioneFn, cartellaEsisteFn: () => true, workflowPlanProposeFn: async () => ({}),
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'radice' } };
    } });
  const store = await createWorkflowStore({ workflowDataRoot: radiceWorkflow, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => {
    await store.close();
    for (let i = 0; i < 3; i += 1) { try { await attendiScritture({ cartellaStore }); } catch { /* */ } await new Promise((r) => setImmediate(r)); }
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(radiceWorkflow);
  });
  const radice = registro.avvia('task-vero', { modelloScelto: MODELLO });
  const esiste = (id) => id === radice.sessionId;
  const proposta = await proposeWorkflowFromTool(store, { sessionId: radice.sessionId, toolCallId: 'call_retry', draft: BOZZA,
    plannerModel: null, sessionModel: MODELLO, modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste });
  const avviato = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });
  const [creato] = await readEvents(store, { runId: avviato.runId });
  await appendEvent(store, { event: { ...creato, eventId: randomUUID(), seq: 2, type: 'run_started', commandId: null,
    commandType: null, commandPayloadHash: null, payload: {} } });
  const orologio = { ms: Date.now() + 60_000, avanza(ms) { this.ms += ms; } };
  const componi = () => createWorkflowOrchestrator({ store, nowFn: () => new Date(orologio.ms).toISOString(), randomFn: () => 0.5,
    adapters: new Map([['agent-session', createAgentSessionAdapter({ sessions: registro })]]),
    capacityFn: () => ({ globalAgents: 2, globalWriters: 0, localProcesses: 0,
      perProvider: new Map([['openrouter', 2]]), perModel: new Map([['openrouter', new Map([[MODELLO, 2]])]]),
      perWorkspaceWriters: new Map() }) });
  const orchestrator = componi();
  await orchestrator.recover();
  const runId = avviato.runId;
  const esegui = async (nodeId, tentativo) => {
    const ammesso = await orchestrator.admitActivity({ runId, nodeId, provider: 'openrouter', model: MODELLO,
      workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
      // la riserva del passo come la farà lo scheduler: il budget del nodo (con zeri, il consumo vero è un `budget_overrun`)
      reserved: { promptTokens: 400_000, completionTokens: 40_000, wallMs: 1_200_000, agentSeconds: 1_200, toolCalls: 60, modelRequests: 40, knownCostUsd: null } });
    const esito = orchestrator.executeNode({ runId, nodeId, activityKind: 'agent-session', resourceClass: 'agent',
      idempotencyKey: `${runId}/${nodeId}/${tentativo}`, budgetReservationId: ammesso.budgetReservationId, deadlineAt: null,
      preparedIdentity: ammesso.preparedIdentity });
    return { ammesso, esito };
  };
  const eventi = () => readEvents(store, { runId });
  const stato = async () => {
    const tutti = await eventi();
    const definizione = await readDefinition(store, { workflowId: tutti[0].payload.workflowId, version: tutti[0].payload.definitionVersion });
    return { eventi: tutti, definizione: definizione.core, stato: workflowReplay({ definition: definizione.core, runId, events: tutti }) };
  };
  return { store, registro, giri, orchestrator, componi, orologio, runId, esegui, eventi, stato };
}

/** Porta il primo tentativo fino al `retry_scheduled`: 429 → activity_failed → rilascio → decisione. */
async function primoTentativoRitentato(b) {
  const { ammesso, esito } = await b.esegui('leggi', 1);
  await b.giri.aspetta(2);
  b.giri.fallisci(1, TRAFFICO, { prompt_tokens: 50, completion_tokens: 0, cost: 0.0001 });
  const fallito = await esito;
  await b.orchestrator.releaseAdmission({ runId: b.runId, claimId: ammesso.claimId });
  const decisione = await b.orchestrator.decideAfterFailure({ runId: b.runId, activityExecutionId: fallito.activityExecutionId });
  return { ammesso, fallito, decisione };
}

test('WF-RETRY-CLASSIFIED-429: a 429 from the provider is a proven retryable failure, retried after its timer, and the second attempt succeeds', async (t) => {
  const b = await banco(t);
  const { ammesso, esito } = await b.esegui('leggi', 1);
  await b.giri.aspetta(2);
  b.giri.fallisci(1, TRAFFICO, { prompt_tokens: 50, completion_tokens: 0, cost: 0.0001 });
  const fallito = await esito;
  assert.deepEqual({ status: fallito.status, errorClass: fallito.errorClass, retryable: fallito.retryable }, { status: 'failed', errorClass: 'rate_limit', retryable: true });
  let { eventi, stato } = await b.stato();
  const failedFact = eventi.find((evento) => evento.type === 'activity_failed');
  assert.equal(failedFact.payload.errorClass, 'rate_limit');
  assert.equal(failedFact.payload.retryable, true);
  assert.match(failedFact.payload.receiptRef, /^talos-session:[0-9a-f-]+#\d+$/u);
  assert.equal(failedFact.payload.actualUsage.promptTokens, 50);
  assert.ok(!eventi.some((evento) => evento.type === 'node_failed'), 'an activity_failed does not imply node_failed (catalog §6)');
  assert.equal(stato.nodes.get('leggi').state, 'running');

  // prima il rilascio e il saldo, poi la decisione (catalogo §19)
  await assert.rejects(b.orchestrator.decideAfterFailure({ runId: b.runId, activityExecutionId: fallito.activityExecutionId }), { code: 'WORKFLOW_RETRY_ATTEMPT_NOT_SETTLED' });
  await b.orchestrator.releaseAdmission({ runId: b.runId, claimId: ammesso.claimId });
  const decisione = await b.orchestrator.decideAfterFailure({ runId: b.runId, activityExecutionId: fallito.activityExecutionId });
  assert.equal(decisione.decision, 'retry');
  ({ eventi, stato } = await b.stato());
  const ritentativo = eventi.find((evento) => evento.type === 'retry_scheduled');
  // equal jitter con caso 0,5 al primo tentativo: 500 ms fissi + 250 a caso, PERSISTITI nel fatto (catalogo §9)
  assert.deepEqual({ reasonClass: ritentativo.payload.reasonClass, backoffMs: ritentativo.payload.backoffMs, jitterMs: ritentativo.payload.jitterMs },
    { reasonClass: 'rate_limit', backoffMs: 500, jitterMs: 250 });
  assert.equal(Date.parse(ritentativo.payload.retryAt) - Date.parse(ritentativo.at), 750);
  assert.equal(stato.nodes.get('leggi').state, 'retry_wait');

  // troppo presto: nessun fuoco, il nodo aspetta ancora
  assert.deepEqual((await b.orchestrator.fireDueRetryTimers({ runId: b.runId })).fired, []);
  assert.equal((await b.stato()).stato.nodes.get('leggi').state, 'retry_wait');
  b.orologio.avanza(750);
  assert.equal((await b.orchestrator.fireDueRetryTimers({ runId: b.runId })).fired.length, 1);
  assert.equal((await b.stato()).stato.nodes.get('leggi').state, 'ready');

  const secondo = await b.esegui('leggi', 2);
  assert.equal(secondo.ammesso.preparedIdentity.attempt, 2);
  await b.giri.aspetta(3);
  b.giri.rispondi(2, 'Decisioni: rilascio venerdì.', { prompt_tokens: 80, completion_tokens: 20, cost: 0.0003 });
  assert.equal((await secondo.esito).status, 'completed');
  ({ stato } = await b.stato());
  assert.equal(stato.nodes.get('leggi').state, 'succeeded');
});

test('WF-RETRY-EXHAUSTED: the second 429 exhausts the two attempts and the node fails with the provider class', async (t) => {
  const b = await banco(t);
  await primoTentativoRitentato(b);
  b.orologio.avanza(1_000);
  await b.orchestrator.fireDueRetryTimers({ runId: b.runId });
  const secondo = await b.esegui('leggi', 2);
  await b.giri.aspetta(3);
  b.giri.fallisci(2, TRAFFICO, { prompt_tokens: 40, completion_tokens: 0, cost: 0.0001 });
  const fallito = await secondo.esito;
  await b.orchestrator.releaseAdmission({ runId: b.runId, claimId: secondo.ammesso.claimId });
  const decisione = await b.orchestrator.decideAfterFailure({ runId: b.runId, activityExecutionId: fallito.activityExecutionId });
  assert.deepEqual({ decision: decisione.decision, reason: decisione.reason }, { decision: 'failed', reason: 'tentativi-esauriti' });
  const { eventi, stato } = await b.stato();
  assert.equal(eventi.filter((evento) => evento.type === 'retry_scheduled').length, 1);
  assert.equal(eventi.find((evento) => evento.type === 'node_failed').payload.errorClass, 'rate_limit');
  assert.equal(stato.nodes.get('leggi').state, 'failed');
});

test('WF-RETRY-NOT-RETRYABLE: a refused credential fails the node at once, and there is nothing to decide', async (t) => {
  const b = await banco(t);
  const { esito } = await b.esegui('leggi', 1);
  await b.giri.aspetta(2);
  b.giri.fallisci(1, { code: 'PROVIDER_REQUEST_ERROR', classe: 'credenziale', message: 'Credenziale rifiutata dal fornitore.' }, { prompt_tokens: 0, completion_tokens: 0 });
  const fallito = await esito;
  assert.deepEqual({ errorClass: fallito.errorClass, retryable: fallito.retryable }, { errorClass: 'auth', retryable: false });
  const { eventi, stato } = await b.stato();
  assert.equal(eventi.find((evento) => evento.type === 'activity_failed').payload.retryable, false);
  assert.equal(eventi.find((evento) => evento.type === 'node_failed').payload.errorClass, 'auth');
  assert.equal(stato.nodes.get('leggi').state, 'failed');
  await assert.rejects(b.orchestrator.decideAfterFailure({ runId: b.runId, activityExecutionId: fallito.activityExecutionId }), { code: 'WORKFLOW_RETRY_NOT_APPLICABLE' });
});

test('WF-RETRY-CLASS-FROM-MESSAGE: without a class in RunError, the saved code and message still classify it (BC-44 table)', async (t) => {
  const b = await banco(t);
  const { esito } = await b.esegui('leggi', 1);
  await b.giri.aspetta(2);
  b.giri.fallisci(1, { code: 'internal-error', message: 'HTTP 503 Service Unavailable' }, { prompt_tokens: 10, completion_tokens: 0 });
  const fallito = await esito;
  assert.deepEqual({ errorClass: fallito.errorClass, retryable: fallito.retryable }, { errorClass: 'provider_5xx', retryable: true });
});

test('WF-RETRY-TIMER-GUARDS: a retry timer cannot fire early; a fire for another fact, or a duplicate, revives nothing', async (t) => {
  const b = await banco(t);
  await primoTentativoRitentato(b);
  const { eventi, definizione } = await b.stato();
  const programmato = eventi.find((evento) => evento.type === 'timer_scheduled');
  const base = workflowReplay({ definition: definizione, runId: b.runId, events: eventi });
  const fuoco = (at, targetId, seq = eventi.length + 1) => ({ ...programmato, eventId: randomUUID(), seq, at, type: 'timer_fired',
    payload: { timerId: programmato.payload.timerId, scheduledAt: programmato.payload.scheduledAt, fireAt: programmato.payload.fireAt, targetKind: 'retry', targetId } });
  const giusto = programmato.payload.causationId;
  const prima = new Date(Date.parse(programmato.payload.fireAt) - 1).toISOString();
  assert.throws(() => workflowApply(base, fuoco(prima, giusto)), { code: 'WORKFLOW_TRANSITION_INVALID' });
  const altro = workflowApply(base, fuoco(programmato.payload.fireAt, `${randomUUID()}:1`));
  assert.equal(altro.nodes.get('leggi').state, 'retry_wait', 'a fire for another retry fact is stale evidence');
  const ripreso = workflowApply(base, fuoco(programmato.payload.fireAt, giusto));
  assert.equal(ripreso.nodes.get('leggi').state, 'ready');
  const duplicato = workflowApply(ripreso, fuoco(programmato.payload.fireAt, giusto, eventi.length + 2));
  assert.equal(duplicato.nodes.get('leggi').state, 'ready', 'a duplicate fire is idempotent by timerId');
});

test('WF-RETRY-ORDER: retry_scheduled is refused while the failed attempt still holds its slot', async (t) => {
  const b = await banco(t);
  const { esito } = await b.esegui('leggi', 1);
  await b.giri.aspetta(2);
  b.giri.fallisci(1, TRAFFICO, { prompt_tokens: 50, completion_tokens: 0 });
  const fallito = await esito;
  const { eventi, definizione } = await b.stato();
  const stato = workflowReplay({ definition: definizione, runId: b.runId, events: eventi });
  const ultimo = eventi.at(-1);
  const evento = { ...ultimo, eventId: randomUUID(), seq: eventi.length + 1, type: 'retry_scheduled', eventSchemaVersion: 1,
    schema: 'talos.workflow-event.v1', nodeId: 'leggi', activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { schema: 'talos.workflow-retry-fact.v1', runId: b.runId, nodeId: 'leggi', activityExecutionId: fallito.activityExecutionId,
      attempt: 1, reasonClass: 'rate_limit', backoffMs: 500, jitterMs: 0, retryAt: ultimo.at, budgetReservationId: null } };
  assert.throws(() => workflowApply(stato, evento), /released/u);
});

test('WF-RETRY-RECOVERY: after a restart, a proven retryable failure is not turned into node_failed', async (t) => {
  const b = await banco(t);
  const { esito } = await b.esegui('leggi', 1);
  await b.giri.aspetta(2);
  b.giri.fallisci(1, TRAFFICO, { prompt_tokens: 50, completion_tokens: 0 });
  await esito;
  const riavviato = b.componi();
  await riavviato.recover();
  const { eventi, stato } = await b.stato();
  assert.ok(!eventi.some((evento) => evento.type === 'node_failed'), 'the scheduler decides, not the recovery');
  assert.equal(stato.nodes.get('leggi').state, 'running');
});

test('F3-41a classeDelFallimento: the kernel classes map to the catalog classes, and only transient ones are retried', () => {
  const casi = [
    ['traffico', null, 'rate_limit', true], ['guasto-fornitore', null, 'provider_5xx', true], ['rete', null, 'transient_network', true],
    ['flusso-interrotto', null, 'transient_network', true], ['timeout-fornitore', null, 'transient_network', true],
    ['credenziale', null, 'auth', false], ['credito', null, 'quota_hard', false], ['contesto', null, 'context_overflow', false],
    ['richiesta-non-valida', null, 'model_invalid', false], ['ignoto', null, 'internal', false], ['giri-esauriti', null, 'internal', false],
    [null, null, 'internal', false], ['ignoto', 'PROVIDER_NETWORK_ERROR', 'transient_network', true],
    // 25/09/2026 notte: la risposta vuota arriva dopo la scala del kernel, rifare il passo ripagherebbe lo stesso vuoto
    ['risposta-vuota', 'PROVIDER_EMPTY_RESPONSE', 'internal', false],
  ];
  for (const [classeErrore, codiceErrore, errorClass, retryable] of casi) {
    assert.deepEqual(classeDelFallimento({ classeErrore, codiceErrore }), { errorClass, retryable }, `${classeErrore}/${codiceErrore}`);
  }
});

test('F3-41a decidiDopoFallimento: attempts, classes and the persisted backoff', () => {
  const passo = (retryPolicy, activityPolicy = { maxAttempts: 2 }, budget = { attempts: null }) => ({ retryPolicy, activityPolicy, budget });
  const esponenziale = passo({ backoff: 'exponential', jitter: false, retryOn: ['rate_limit', 'provider_5xx'] }, { maxAttempts: 20 });
  const ora = '2026-09-25T10:00:00.000Z';
  const fallito = (attempt, errorClass = 'rate_limit') => ({ attempt, errorClass, retryable: true });
  assert.equal(decidiDopoFallimento({ step: esponenziale, fallito: fallito(1), oraIso: ora }).backoffMs, 1_000);
  assert.equal(decidiDopoFallimento({ step: esponenziale, fallito: fallito(3), oraIso: ora }).backoffMs, 4_000);
  assert.equal(decidiDopoFallimento({ step: esponenziale, fallito: fallito(15), oraIso: ora }).backoffMs, 100_000, 'capped at 100 s');
  const conCaso = passo({ backoff: 'exponential', jitter: true, retryOn: ['rate_limit'] });
  assert.deepEqual(decidiDopoFallimento({ step: conCaso, fallito: fallito(1), oraIso: ora, casuale: () => 0 }),
    { azione: 'ritenta', reasonClass: 'rate_limit', backoffMs: 500, jitterMs: 0, retryAt: '2026-09-25T10:00:00.500Z' });
  assert.equal(decidiDopoFallimento({ step: conCaso, fallito: fallito(1), oraIso: ora, casuale: () => 1 }).retryAt, '2026-09-25T10:00:01.000Z',
    'equal jitter never goes below half and never above the full delay');
  assert.equal(decidiDopoFallimento({ step: passo({ backoff: 'linear', jitter: false, retryOn: ['rate_limit'] }, { maxAttempts: 5 }), fallito: fallito(3), oraIso: ora }).backoffMs, 3_000);
  assert.equal(decidiDopoFallimento({ step: passo({ backoff: 'none', jitter: false, retryOn: ['rate_limit'] }), fallito: fallito(1), oraIso: ora }).backoffMs, 0);
  assert.equal(decidiDopoFallimento({ step: esponenziale, fallito: fallito(1, 'transient_network'), oraIso: ora }).motivo, 'classe-non-ritentata-dal-passo');
  assert.equal(decidiDopoFallimento({ step: conCaso, fallito: fallito(2), oraIso: ora }).motivo, 'tentativi-esauriti');
  assert.equal(decidiDopoFallimento({ step: passo({ backoff: 'none', jitter: false, retryOn: ['rate_limit'] }, { maxAttempts: 3 }, { attempts: 1 }), fallito: fallito(1), oraIso: ora }).motivo,
    'tentativi-esauriti', 'the node budget caps attempts too');
  assert.equal(decidiDopoFallimento({ step: conCaso, fallito: { attempt: 1, errorClass: 'rate_limit', retryable: false }, oraIso: ora }).motivo, 'non-ritentabile');
  assert.equal(decidiDopoFallimento({ step: conCaso, fallito: fallito(1, 'auth'), oraIso: ora }).azione, 'fallisci');
});
