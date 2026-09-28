/*
 * F3-41b (25/09/2026) — i tre FENCE di `WFS` §8 e poi i passi PARALLELI dello stesso run, che la coda lunga per run
 * serializzava (`WFS` §7). Ledger: `.claude/LEDGER-F3-41-SCHEDULER-2026-09-25.md`.
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
import { createActivityRunner } from '../src/workflow/activity-runner.mjs';
import { createAgentSessionAdapter } from '../src/workflow/adapters/agent-session.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { workflowApply, workflowReplay } from '../src/workflow/run.mjs';
import { appendEvent, createWorkflowStore, readDefinition, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODELLO = 'z-ai/glm-5.3-flash';
// il compilatore vuole un grafo connesso: un passo iniziale e due passi indipendenti che dipendono solo da lui
const BOZZA = {
  title: 'Due letture', objective: 'Leggere due file in parallelo.',
  phases: [{ id: 'lettura', label: 'Lettura' }],
  nodes: [
    { id: 'prepara', phase: 'lettura', label: 'Prepara', task: 'Elenca i file da leggere.' },
    { id: 'uno', phase: 'lettura', label: 'Leggi uno', task: 'Leggi uno.md.', dependsOn: ['prepara'] },
    { id: 'due', phase: 'lettura', label: 'Leggi due', task: 'Leggi due.md.', dependsOn: ['prepara'] },
  ],
};
const RISERVA = { promptTokens: 400_000, completionTokens: 40_000, wallMs: 1_200_000, agentSeconds: 1_200, toolCalls: 60, modelRequests: 40, knownCostUsd: null };

function giriFinti() {
  const giri = [];
  return {
    avviaSessioneFn(input) {
      let risolvi;
      const promessa = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return promessa;
    },
    rispondi(i, testo) {
      giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage: { prompt_tokens: 10, completion_tokens: 5 } } });
      giri[i].input.onEvento({ type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' });
      giri[i].input.onEvento({ type: 'TextMessageContent', messageId: `m${i}`, delta: testo });
      giri[i].input.onEvento({ type: 'RunFinished' });
      giri[i].risolvi({ ok: true });
    },
    async aspetta(n, ms = 2_000) { for (let k = 0; k * 5 < ms && giri.length < n; k += 1) await new Promise((r) => setTimeout(r, 5)); return giri.length; },
  };
}

async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-wf-fence-sessioni-');
  const radiceWorkflow = mkdtempSync(join(tmpdir(), 'talos-wf-fence-store-'));
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
  const proposta = await proposeWorkflowFromTool(store, { sessionId: radice.sessionId, toolCallId: 'call_fence', draft: BOZZA,
    plannerModel: null, sessionModel: MODELLO, modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste });
  const avviato = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });
  const runId = avviato.runId;
  const aggiungi = async (type, payload) => {
    const tutti = await readEvents(store, { runId });
    const ultimo = tutti.at(-1);
    await appendEvent(store, { event: { ...tutti[0], eventId: randomUUID(), seq: tutti.length + 1, at: new Date().toISOString(),
      type, commandId: null, commandType: null, commandPayloadHash: null, graphVersion: ultimo.graphVersion, payload } });
  };
  await aggiungi('run_started', {});
  const orchestrator = createWorkflowOrchestrator({ store,
    adapters: new Map([['agent-session', createAgentSessionAdapter({ sessions: registro })]]),
    capacityFn: () => ({ globalAgents: 4, globalWriters: 0, localProcesses: 0,
      perProvider: new Map([['openrouter', 4]]), perModel: new Map([['openrouter', new Map([[MODELLO, 4]])]]),
      perWorkspaceWriters: new Map() }) });
  await orchestrator.recover();
  const ammetti = (nodeId) => orchestrator.admitActivity({ runId, nodeId, provider: 'openrouter', model: MODELLO,
    workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0, reserved: RISERVA });
  const esegui = (nodeId, ammesso) => orchestrator.executeNode({ runId, nodeId, activityKind: 'agent-session', resourceClass: 'agent',
    idempotencyKey: `${runId}/${nodeId}/1`, budgetReservationId: ammesso.budgetReservationId, deadlineAt: null,
    preparedIdentity: ammesso.preparedIdentity });
  const stato = async () => {
    const eventi = await readEvents(store, { runId });
    const definizione = await readDefinition(store, { workflowId: eventi[0].payload.workflowId, version: eventi[0].payload.definitionVersion });
    return { eventi, definizione: definizione.core, stato: workflowReplay({ definition: definizione.core, runId, events: eventi }) };
  };
  return { giri, runId, ammetti, esegui, aggiungi, stato };
}

test('WF-RUN-PARALLEL-NODES: two independent steps of the same run are in flight together, and each schedule/start pair stays contiguous', async (t) => {
  const b = await banco(t);
  const iniziale = b.esegui('prepara', await b.ammetti('prepara'));
  assert.equal(await b.giri.aspetta(2), 2);
  b.giri.rispondi(1, 'uno.md, due.md');
  assert.equal((await iniziale).status, 'completed');
  const primo = await b.ammetti('uno');
  const secondo = await b.ammetti('due');
  const esitoUno = b.esegui('uno', primo);
  const esitoDue = b.esegui('due', secondo);
  // radice = giro 0, «prepara» = giro 1: servono i giri 2 E 3 vivi insieme, prima che uno dei due risponda
  assert.equal(await b.giri.aspetta(4), 4, 'the second step must start while the first is still running');
  b.giri.rispondi(3, 'due fatto');
  b.giri.rispondi(2, 'uno fatto');
  assert.deepEqual([(await esitoUno).status, (await esitoDue).status], ['completed', 'completed']);
  const { eventi, stato } = await b.stato();
  assert.equal(stato.nodes.get('uno').state, 'succeeded');
  assert.equal(stato.nodes.get('due').state, 'succeeded');
  for (const programmato of eventi.filter((evento) => evento.type === 'activity_scheduled')) {
    const avviato = eventi.find((evento) => evento.type === 'activity_started' && evento.activityExecutionId === programmato.activityExecutionId);
    assert.equal(avviato.seq, programmato.seq + 1, 'nothing may land between activity_scheduled and activity_started');
  }
});

test('WF-FENCE-SCHEDULE-AFTER-CANCEL: a v2 activity_scheduled is refused once a cancel or a pause is requested, even with a valid claim', async (t) => {
  for (const [tipo, payload] of [['run_cancel_requested', { reason: 'user' }], ['run_pause_requested', { reason: 'user' }]]) {
    const b = await banco(t);
    const ammesso = await b.ammetti('prepara');
    await b.aggiungi(tipo, payload);
    const { eventi, definizione } = await b.stato();
    const base = workflowReplay({ definition: definizione, runId: b.runId, events: eventi });
    const claim = eventi.find((evento) => evento.type === 'capacity_claimed');
    const evento = { ...claim, eventId: randomUUID(), seq: eventi.length + 1, type: 'activity_scheduled',
      payload: { activityKind: 'agent-session', effectClass: 'reconcilable', retryMode: 'at-least-once', idempotencyKey: 'k',
        resourceClass: 'agent', budgetReservationId: ammesso.budgetReservationId, deadlineAt: null } };
    assert.throws(() => workflowApply(base, evento), /schedulable run/u, `${tipo} must stop a new attempt`);
  }
});

// ── i due fence del runner, sul runner da solo (giornale finto: ogni interleaving è deterministico) ─────────────────────
const RUN_ID = '20000000-0000-4000-8000-000000000001';
function giornaleFinto() {
  const facts = [];
  const state = {
    run: { runId: RUN_ID, status: 'running', graphVersion: 1, cancelRequested: true },
    definitionHash: `sha256:${'a'.repeat(64)}`,
    nodes: new Map([['work', { nodeId: 'work', state: 'ready', attempt: 0, leaseEpoch: 0, activeLeaseId: null, activeActivityExecutionId: null, resultRefIds: [] }]]),
    activities: new Map(),
    resultRefs: new Map(),
  };
  const core = { schema: 'talos.workflow-definition-core.v1', edges: [],
    nodes: [{ id: 'work', kind: 'agent', activityPolicy: { effectClass: 'reconcilable', retryMode: 'at-least-once', maxAttempts: 2, deadlineMs: null } }] };
  return {
    facts, state, dopo: null,
    async load() { return { definition: core, state, events: facts }; },
    async append(_runId, fact) {
      facts.push(structuredClone(fact));
      const node = state.nodes.get(fact.nodeId);
      if (fact.type === 'activity_scheduled') {
        state.activities.set(fact.activityExecutionId, { activityExecutionId: fact.activityExecutionId, nodeId: fact.nodeId, attempt: fact.attempt,
          leaseId: fact.leaseId, leaseEpoch: fact.leaseEpoch, state: 'scheduled', activityKind: fact.payload.activityKind,
          effectClass: fact.payload.effectClass, retryMode: fact.payload.retryMode });
        Object.assign(node, { state: 'leased', attempt: fact.attempt, leaseEpoch: fact.leaseEpoch, activeLeaseId: fact.leaseId, activeActivityExecutionId: fact.activityExecutionId });
      } else if (fact.type === 'activity_started') {
        state.activities.get(fact.activityExecutionId).state = 'started';
        node.state = 'running';
      } else if (fact.type === 'activity_failed') state.activities.get(fact.activityExecutionId).state = 'failed';
      else if (fact.type === 'activity_uncertain') state.activities.get(fact.activityExecutionId).state = 'uncertain';
      else if (fact.type === 'node_cancelled') node.state = 'cancelled';
      if (this.dopo) await this.dopo(fact);
      return fact;
    },
  };
}
async function runnerSu(giornale, adattatore) {
  let i = 0;
  const runner = createActivityRunner({ journal: giornale, adapters: new Map([['agent-session', adattatore]]),
    publishResult: async () => { throw new Error('unexpected result'); }, nowFn: () => '2026-09-25T10:00:00.000Z',
    idFn: () => `10000000-0000-4000-8000-${String(++i).padStart(12, '0')}` });
  await runner.recover({ runIds: [] });
  return runner;
}
const esecuzione = { runId: RUN_ID, nodeId: 'work', activityKind: 'agent-session', resourceClass: 'agent', idempotencyKey: 'k', budgetReservationId: null, deadlineAt: null };

test('WF-FENCE-CANCEL-BEFORE-EFFECT: a cancel that lands between activity_started and the adapter call stops the effect from starting', async () => {
  const giornale = giornaleFinto();
  let chiamate = 0;
  const adattatore = { id: 'fence-adapter',
    async execute() { chiamate += 1; return { status: 'completed', receiptRef: 'r', results: [] }; },
    async reconcile() { return { outcome: 'still_unknown', receiptRef: null, resultIds: [] }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; } };
  const runner = await runnerSu(giornale, adattatore);
  let annullamento = null;
  giornale.dopo = async (fact) => {
    if (fact.type !== 'activity_started') return;
    annullamento = runner.cancel({ runId: RUN_ID, activityExecutionId: fact.activityExecutionId });
    await new Promise((r) => setImmediate(r));
  };
  const esito = await runner.execute(esecuzione);
  assert.equal(esito.status, 'cancelled');
  assert.equal((await annullamento).status, 'cancelled');
  assert.equal(chiamate, 0, 'the adapter must not start after the cancel');
  assert.deepEqual(giornale.facts.map((fact) => fact.type), ['activity_scheduled', 'activity_started', 'activity_failed', 'node_cancelled']);
});

test('WF-FENCE-RECONCILE-LIVE: an activity still running here is not reconciled, and recovery refuses to run over live activities', async () => {
  const giornale = giornaleFinto();
  let rispondi;
  let chiamato;
  const partito = new Promise((resolve) => { chiamato = resolve; });
  const adattatore = { id: 'fence-adapter',
    execute() { chiamato(); return new Promise((resolve) => { rispondi = resolve; }); },
    async reconcile() { return { outcome: 'still_unknown', receiptRef: null, resultIds: [] }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; } };
  const runner = await runnerSu(giornale, adattatore);
  const esito = runner.execute(esecuzione);
  await partito;
  const attivita = giornale.facts.find((fact) => fact.type === 'activity_started').activityExecutionId;
  await assert.rejects(runner.reconcile({ runId: RUN_ID, activityExecutionId: attivita }), { code: 'WORKFLOW_ACTIVITY_LIVE' });
  await assert.rejects(runner.recover({ runIds: [RUN_ID] }), { code: 'WORKFLOW_RECOVERY_WITH_LIVE_ACTIVITIES' });
  assert.ok(!giornale.facts.some((fact) => fact.type === 'activity_uncertain'), 'the live activity was not touched');
  rispondi({ status: 'completed', receiptRef: 'r', results: [] });
  assert.equal((await esito).status, 'completed');
});
