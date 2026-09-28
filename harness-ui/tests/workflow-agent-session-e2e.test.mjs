/*
 * F3-32 (25/09/2026) — il ponte INTERO, dal prodotto: proposta con la bozza → approvazione → avvio (F3-31) → ammissione con
 * politica di capacità → `executeNode` → l'adattatore `agent-session` avvia una sessione VERA del registro (kernel finto) →
 * fatti `agent_session_*`, esito, risultato e consumo nel giornale del Workflow. Il secondo passo dipende dal primo e deve
 * ricevere la sua risposta (decisione owner «Sì, come Hermes»).
 * Contratto: `.claude/LEDGER-F3-32-CONTRATTO-SESSIONI-ATTIVITA-2026-09-25.md`.
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
import { appendEvent, createWorkflowStore, readEvents } from '../src/workflow/store.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const MODELLO = 'z-ai/glm-5.3-flash';
const BOZZA = {
  title: 'Riassunto e confronto', objective: 'Riassumere le note e dire cosa manca.',
  phases: [{ id: 'lettura', label: 'Lettura' }, { id: 'sintesi', label: 'Sintesi' }],
  nodes: [
    { id: 'leggi', phase: 'lettura', label: 'Leggi le note', task: 'Leggi note.md e riassumi le decisioni.' },
    { id: 'confronta', phase: 'sintesi', label: 'Confronta', task: 'Confronta il riassunto con la guida.', dependsOn: ['leggi'] },
  ],
};

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
    giro(i) { return giri[i]; },
    rispondi(i, testo, usage) {
      giri[i].input.onEvento({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', usage } });
      giri[i].input.onEvento({ type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' });
      giri[i].input.onEvento({ type: 'TextMessageContent', messageId: `m${i}`, delta: testo });
      giri[i].input.onEvento({ type: 'RunFinished' });
      giri[i].risolvi({ ok: true });
    },
    async aspetta(n) { for (let k = 0; k < 400 && giri.length < n; k += 1) await new Promise((r) => setTimeout(r, 5)); assert.ok(giri.length >= n, `${n} runs expected, ${giri.length} started`); },
    get quanti() { return giri.length; },
  };
}

async function banco(t, { avvolgi = (adattatore) => adattatore } = {}) {
  const cartellaStore = cartellaDiProva('talos-wf-e2e-sessioni-');
  const radiceWorkflow = mkdtempSync(join(tmpdir(), 'talos-wf-e2e-store-'));
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
  const proposta = await proposeWorkflowFromTool(store, { sessionId: radice.sessionId, toolCallId: 'call_e2e', draft: BOZZA,
    plannerModel: null, sessionModel: MODELLO, modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste });
  const avviato = await startWorkflowRun(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: esiste, supportedNodeKinds: ['agent'] });
  // `run_started` lo scriverà lo scheduler (F3-41); qui a mano, come nei test dell'orchestratore
  const [creato] = await readEvents(store, { runId: avviato.runId });
  await appendEvent(store, { event: { ...creato, eventId: randomUUID(), seq: 2, type: 'run_started', commandId: null,
    commandType: null, commandPayloadHash: null, payload: {} } });
  const orchestrator = createWorkflowOrchestrator({ store,
    adapters: new Map([['agent-session', avvolgi(createAgentSessionAdapter({ sessions: registro }))]]),
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
  return { store, registro, giri, radice, avviato, esegui };
}

test('WF-AGENT-E2E: an approved step runs as a read-only TALOS session, and its answer, usage and facts land in the Workflow journal', async (t) => {
  const { store, registro, giri, radice, avviato, esegui } = await banco(t);
  const primo = esegui('leggi');
  await giri.aspetta(2);
  const ingresso = giri.giro(1).input;
  assert.equal(ingresso.permessi, 'Read only');
  assert.ok(!ingresso.strumentiEstesi.includes('ask_user_question'));
  giri.rispondi(1, 'Decisioni: rilascio venerdì; manca la guida di installazione.', { prompt_tokens: 120, completion_tokens: 30, cost: 0.0004 });
  const esito = await primo;
  assert.equal(esito.status, 'completed', JSON.stringify(esito));
  const eventi = await readEvents(store, { runId: avviato.runId });
  const tipi = eventi.map((evento) => evento.type);
  for (const atteso of ['activity_started', 'agent_session_created', 'agent_session_finished', 'result_recorded', 'activity_completed', 'node_succeeded']) {
    assert.ok(tipi.includes(atteso), `${atteso} missing from ${tipi.join(', ')}`);
  }
  assert.ok(tipi.indexOf('activity_started') < tipi.indexOf('agent_session_created'), 'no effect before activity_started (RP §8.6)');
  const creata = eventi.find((evento) => evento.type === 'agent_session_created');
  assert.deepEqual({ ...creata.payload, sessionId: undefined }, { sessionId: undefined, provider: 'openrouter', model: MODELLO, capabilityProfile: 'read', workspaceLeaseId: null });
  assert.equal(registro.trovaSessioneDiPasso({ activityExecutionId: creata.activityExecutionId }), creata.payload.sessionId);
  assert.equal(eventi.find((evento) => evento.type === 'agent_session_finished').payload.outcome, 'succeeded');
  const risultato = eventi.find((evento) => evento.type === 'result_recorded').payload.resultRef;
  assert.equal(risultato.summary, 'Decisioni: rilascio venerdì; manca la guida di installazione.');
  assert.equal(risultato.trust, 'untrusted');
  const completata = eventi.find((evento) => evento.type === 'activity_completed');
  assert.match(completata.payload.receiptRef, new RegExp(`^talos-session:${creata.payload.sessionId}#\\d+$`, 'u'));
  const consumo = completata.payload.actualUsage;
  assert.deepEqual(Object.keys(consumo).sort(), ['agentSeconds', 'completionTokens', 'knownCostUsd', 'modelRequests', 'promptTokens', 'toolCalls', 'wallMs']);
  assert.equal(consumo.promptTokens, 120);
  assert.equal(consumo.completionTokens, 30);
  assert.equal(consumo.modelRequests, 1);
  assert.equal(consumo.knownCostUsd, 0.0004);
  assert.ok(Number.isSafeInteger(consumo.wallMs) && consumo.wallMs >= 0);
  assert.ok(radice.sessionId !== creata.payload.sessionId);
});

test('WF-AGENT-INPUTS: a step receives the answers of the steps it depends on, as snapshots; a first step receives none', async (t) => {
  const { giri, esegui } = await banco(t);
  const primo = esegui('leggi');
  await giri.aspetta(2);
  const consegnaPrimo = JSON.stringify(giri.giro(1).input);
  assert.doesNotMatch(consegnaPrimo, /Results of the steps this one depends on/u, 'a step without dependencies receives nothing');
  giri.rispondi(1, 'Le note dicono: rilascio venerdì.', { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 });
  await primo;
  const secondo = esegui('confronta');
  await giri.aspetta(3);
  const consegna = JSON.stringify(giri.giro(2).input);
  assert.match(consegna, /Confronta il riassunto con la guida\./u, 'the step keeps its own task');
  assert.match(consegna, /Results of the steps this one depends on/u);
  assert.match(consegna, /Leggi le note \(leggi\)/u);
  assert.match(consegna, /Le note dicono: rilascio venerdì\./u, 'the predecessor answer reaches the dependent step');
  assert.match(consegna, /not live state/u, 'declared as a snapshot, as Hermes does');
  giri.rispondi(2, 'Manca la data di rilascio nella guida.', { prompt_tokens: 20, completion_tokens: 5, cost: 0.0001 });
  assert.equal((await secondo).status, 'completed');
});

test('WF-AGENT-FACTS-SCOPED: an adapter may write only agent_session_* facts, with its own activity identity', async (t) => {
  let rifiuto = null;
  const { store, giri, avviato, esegui } = await banco(t, { avvolgi: (vero) => ({ ...vero, async execute(ctx) {
    try { await ctx.recordSessionFact('node_succeeded', {}); } catch (errore) { rifiuto = errore; }
    return vero.execute(ctx);
  } }) });
  const esecuzione = esegui('leggi');
  await giri.aspetta(2);
  giri.rispondi(1, 'fatto', { prompt_tokens: 1, completion_tokens: 1, cost: 0 });
  await esecuzione;
  assert.equal(rifiuto?.code, 'WORKFLOW_ADAPTER_FACT_FORBIDDEN');
  const creata = (await readEvents(store, { runId: avviato.runId })).find((evento) => evento.type === 'agent_session_created');
  const iniziata = (await readEvents(store, { runId: avviato.runId })).find((evento) => evento.type === 'activity_started');
  assert.equal(creata.activityExecutionId, iniziata.activityExecutionId, 'the fact carries the identity of THIS activity');
  assert.equal(creata.leaseId, iniziata.leaseId);
});
