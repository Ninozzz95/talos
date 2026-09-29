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
import { creaOnWorkflowFn } from '../src/workflow/per-il-modello.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { startWorkflowRun } from '../src/workflow/run-control.mjs';
import { appendEvent, createWorkflowStore, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODELLO = 'z-ai/glm-5.3-flash';
const BOZZA = {
  title: 'Lettura dipendente', objective: 'Verificare l’accesso ai risultati durevoli.',
  phases: [{ id: 'a', label: 'Prima' }, { id: 'b', label: 'Seconda' }],
  nodes: [
    { id: 'prima', phase: 'a', label: 'Prima', task: 'Leggi.' },
    { id: 'altra', phase: 'a', label: 'Altra', task: 'Leggi altro.', dependsOn: ['prima'] },
    { id: 'seconda', phase: 'b', label: 'Seconda', task: 'Leggi l’output.', dependsOn: ['prima'] },
  ],
};

async function banco(t) {
  const cartellaStore = cartellaDiProva('talos-wf-step-output-');
  const workflowDataRoot = mkdtempSync(join(tmpdir(), 'talos-wf-step-results-'));
  const giri = [];
  let onWorkflowFn;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaStore,
    cartellaEsisteFn: () => true,
    workflowPlanProposeFn: async () => ({}),
    workflowPerIlModelloFn: (...args) => onWorkflowFn(...args),
    avviaSessioneFn(input) {
      let risolvi;
      const fine = new Promise((resolve) => { risolvi = resolve; });
      giri.push({ input, risolvi });
      input.onEvento({ type: 'RunStarted', threadId: `t${giri.length}`, runId: `r${giri.length}` });
      return fine;
    },
    preparaEsecuzioneFn: (taskId) => {
      if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
      return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'radice' } };
    },
  });
  const store = await createWorkflowStore({ workflowDataRoot, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  onWorkflowFn = creaOnWorkflowFn({ store, runtimeFn: () => null });
  t.after(async () => {
    await store.close();
    for (let i = 0; i < 3; i += 1) { try { await attendiScritture({ cartellaStore }); } catch { /* cleanup */ } await new Promise((r) => setImmediate(r)); }
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(workflowDataRoot);
  });
  const root = registro.avvia('task-vero', { modelloScelto: MODELLO });
  const proposta = await proposeWorkflowFromTool(store, { sessionId: root.sessionId, toolCallId: 'call_step_output', draft: BOZZA,
    plannerModel: null, sessionModel: MODELLO, modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: (id) => id === root.sessionId });
  const avviato = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: (id) => id === root.sessionId, supportedNodeKinds: ['agent'] });
  const [created] = await readEvents(store, { runId: avviato.runId });
  await appendEvent(store, { event: { ...created, eventId: randomUUID(), seq: 2, type: 'run_started',
    commandId: null, commandType: null, commandPayloadHash: null, payload: {} } });
  const orchestrator = createWorkflowOrchestrator({ store, adapters: new Map([['agent-session', createAgentSessionAdapter({ sessions: registro })]]),
    capacityFn: () => ({ globalAgents: 2, globalWriters: 0, localProcesses: 0,
      perProvider: new Map([['openrouter', 2]]), perModel: new Map([['openrouter', new Map([[MODELLO, 2]])]]),
      perWorkspaceWriters: new Map() }) });
  await orchestrator.recover();
  const esegui = async (nodeId) => {
    const ammesso = await orchestrator.admitActivity({ runId: avviato.runId, nodeId, provider: 'openrouter', model: MODELLO,
      workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
      reserved: { promptTokens: 1_000, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null } });
    return orchestrator.executeNode({ runId: avviato.runId, nodeId, activityKind: 'agent-session', resourceClass: 'agent',
      idempotencyKey: `${avviato.runId}/${nodeId}/1`, budgetReservationId: ammesso.budgetReservationId, deadlineAt: null,
      preparedIdentity: ammesso.preparedIdentity });
  };
  const aspetta = async (n) => {
    for (let i = 0; i < 400 && giri.length < n; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(giri.length >= n, `${n} turns expected`);
    return giri[n - 1].input;
  };
  const rispondi = (n, testo) => {
    const giro = giri[n - 1];
    giro.input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 } } });
    giro.input.onEvento({ type: 'TextMessageStart', messageId: `m${n}`, role: 'assistant' });
    giro.input.onEvento({ type: 'TextMessageContent', messageId: `m${n}`, delta: testo });
    giro.input.onEvento({ type: 'RunFinished' });
    giro.risolvi({ ok: true });
  };
  return { store, giri, avviato, esegui, aspetta, rispondi };
}

test('F-014-ACCESS: un passo dipendente legge dal CAS soltanto il predecessore provato nel journal', async (t) => {
  const { store, avviato, esegui, aspetta, rispondi } = await banco(t);
  const first = esegui('prima');
  await aspetta(2);
  rispondi(2, 'RISULTATO-PRIMA-COMPLETO');
  assert.equal((await first).status, 'completed');

  const second = esegui('seconda');
  const input = await aspetta(3);
  let created;
  for (let i = 0; i < 400 && !created; i += 1) {
    created = (await readEvents(store, { runId: avviato.runId })).find((e) => e.type === 'agent_session_created' && e.nodeId === 'seconda');
    if (!created) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(created, 'il journal lega il passo alla sua sessione');
  assert.ok(input.strumentiEstesi.includes('workflow_output'), 'il tool deve essere offerto al passo');
  assert.ok(!input.strumentiEstesi.includes('workflow_status'));
  assert.ok(!input.strumentiEstesi.includes('workflow_control'));
  assert.equal(typeof input.onWorkflowFn, 'function', 'il callback deve essere presente nel giro reale');
  const testo = await input.onWorkflowFn('workflow_output', { runId: avviato.runId, nodeId: 'prima' });
  assert.match(testo, /RISULTATO-PRIMA-COMPLETO/u);
  await assert.rejects(() => input.onWorkflowFn('workflow_output', { runId: randomUUID(), nodeId: 'prima' }));
  await assert.rejects(() => input.onWorkflowFn('workflow_output', { runId: avviato.runId, nodeId: 'altra' }));
  await assert.rejects(() => input.onWorkflowFn('workflow_status', { runId: avviato.runId }));
  await assert.rejects(() => input.onWorkflowFn('workflow_control', { runId: avviato.runId, azione: 'cancel' }));
  const callback = creaOnWorkflowFn({ store, runtimeFn: () => null });
  const legame = { runId: avviato.runId, nodeId: created.nodeId,
    activityExecutionId: created.activityExecutionId, attempt: created.attempt,
    leaseId: created.leaseId, leaseEpoch: created.leaseEpoch,
    sessionId: created.payload.sessionId };
  await assert.rejects(() => callback('workflow_output', { runId: avviato.runId, nodeId: 'prima' },
    { workflowStep: { ...legame, sessionId: randomUUID() } }), { code: 'WORKFLOW_STEP_OUTPUT_FORBIDDEN' });
  await assert.rejects(() => callback('workflow_output', { runId: avviato.runId, nodeId: 'prima' },
    { workflowStep: { ...legame, leaseId: randomUUID() } }), { code: 'WORKFLOW_STEP_OUTPUT_FORBIDDEN' });
  rispondi(3, 'Ho letto.');
  assert.equal((await second).status, 'completed');
});
