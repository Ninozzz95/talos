import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { workflowIdForToolCall, proposeWorkflowFromTool, readWorkflowProposal,
  approveWorkflowProposal } from '../src/workflow/planning-control.mjs';
import { createWorkflowStore, lookupCommandReceipt } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '82000000-0000-4000-8000-000000000001';
const base = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
function phasedCore() {
  const core = structuredClone(base);
  core.schema = 'talos.workflow-definition-core.v2';
  core.definitionSchemaVersion = 2;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation';
  core.nodes[1].phaseId = 'verification';
  return core;
}
async function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-planning-control-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { if (store.state !== 'closed') await store.close(); rimuoviCartellaDiProva(root); });
  return { root, store };
}
function proposalInput(overrides = {}) {
  return { sessionId, toolCallId: 'call_proposal_1', core: phasedCore(), plannerModel: null,
    sessionModel: 'provider/model', modalitaOperativa: 'normale', agentRole: 'root', ...overrides }; // F3-10: Normale al posto di Workflow
}
const exists = (id) => id === sessionId;

test('WF-PROPOSAL-IDENTITY: one server-owned UUIDv8 per session/tool call', () => {
  const first = workflowIdForToolCall({ sessionId, toolCallId: 'call_proposal_1' });
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.equal(first, workflowIdForToolCall({ sessionId, toolCallId: 'call_proposal_1' }));
  assert.notEqual(first, workflowIdForToolCall({ sessionId, toolCallId: 'call_proposal_2' }));
  assert.notEqual(first, workflowIdForToolCall({ sessionId: randomUUID(), toolCallId: 'call_proposal_1' }));
  assert.throws(() => workflowIdForToolCall({ sessionId, toolCallId: '' }), /toolCallId/i);
});

test('WF-PROPOSAL-DURABLE-REPLAY: the Normal/Plan root creates one immutable phased Definition', async (t) => {
  const { root, store } = await harness(t);
  const first = await proposeWorkflowFromTool(store, proposalInput(), { nowFn: () => '2026-09-23T14:00:00.000Z' });
  assert.equal(first.status, 'proposed');
  assert.equal(first.version, 1);
  assert.equal(first.workflowId, workflowIdForToolCall({ sessionId, toolCallId: 'call_proposal_1' }));
  const replay = await proposeWorkflowFromTool(store, proposalInput(), { nowFn: () => '2026-09-23T15:00:00.000Z' });
  assert.deepEqual(replay, first);
  const view = await readWorkflowProposal(store, { workflowId: first.workflowId, version: 1 }, { sessionExistsFn: exists });
  assert.equal(view.status, 'proposed');
  // F3-21 (25/09/2026): la revisione è limitata (vista v2), il Core non viaggia più — le stesse verità dai campi della vista
  assert.equal(view.proposal.initiatingSessionId, sessionId);
  assert.equal(view.proposal.createdAt, '2026-09-23T14:00:00.000Z');
  assert.equal(view.phases.length, 2);
  assert.equal(view.definitionHash, first.definitionHash);
  assert.deepEqual(readdirSync(join(root, 'runs')), []);
  const changed = phasedCore(); changed.title = 'Cambio sostanziale';
  await assert.rejects(() => proposeWorkflowFromTool(store, proposalInput({ core: changed })),
    (error) => error?.code === 'WORKFLOW_DEFINITION_CONFLICT');
});

test('WF-PROPOSAL-AUTHORITY: a child, a retired mode and an orphan session cannot propose or approve', async (t) => {
  const { store } = await harness(t);
  // F3-10 (23/09/2026): Normale ora PUÒ proporre (vedi WF-PROPOSAL-TOOL-MODES-V2); il modo ritirato no.
  for (const override of [{ agentRole: 'child' }, { modalitaOperativa: 'workflow' }]) {
    await assert.rejects(() => proposeWorkflowFromTool(store, proposalInput(override)),
      (error) => error?.code === 'WORKFLOW_PROPOSAL_FORBIDDEN');
  }
  const proposed = await proposeWorkflowFromTool(store, proposalInput());
  await assert.rejects(() => readWorkflowProposal(store,
    { workflowId: proposed.workflowId, version: 1 }, { sessionExistsFn: () => false }),
  (error) => error?.code === 'WORKFLOW_PROPOSAL_NOT_FOUND');
  await assert.rejects(() => approveWorkflowProposal(store,
    { workflowId: proposed.workflowId, version: 1, definitionHash: proposed.definitionHash, commandId: randomUUID() },
    { sessionExistsFn: () => false }),
  (error) => error?.code === 'WORKFLOW_PROPOSAL_NOT_FOUND');
});

test('WF-PROPOSAL-PHASES-REQUIRED: model tool rejects legacy v1 Core before persistence', async (t) => {
  const { root, store } = await harness(t);
  await assert.rejects(() => proposeWorkflowFromTool(store, proposalInput({ core: structuredClone(base) })),
    (error) => error?.code === 'WORKFLOW_PROPOSAL_INVALID');
  assert.deepEqual(readdirSync(join(root, 'definitions')), []);
});

test('WF-APPROVAL-READ-BINDING: copied approval from another Definition never reports approved', async (t) => {
  const { root, store } = await harness(t);
  const first = await proposeWorkflowFromTool(store, proposalInput({ toolCallId: 'call_first' }));
  const second = await proposeWorkflowFromTool(store, proposalInput({ toolCallId: 'call_second' }));
  await approveWorkflowProposal(store, { workflowId: second.workflowId, version: 1,
    definitionHash: second.definitionHash, commandId: randomUUID() }, { sessionExistsFn: exists });
  copyFileSync(join(root, 'definitions', second.workflowId, '1', 'approval.json'),
    join(root, 'definitions', first.workflowId, '1', 'approval.json'));
  await assert.rejects(() => readWorkflowProposal(store, { workflowId: first.workflowId, version: 1 },
    { sessionExistsFn: exists }), (error) => error?.code === 'WORKFLOW_STORE_NEEDS_ATTENTION');
});

test('WF-APPROVAL-EXACT-HASH: duplicate command returns durable receipt, conflicts fail closed', async (t) => {
  const { root, store } = await harness(t);
  const proposed = await proposeWorkflowFromTool(store, proposalInput());
  const commandId = randomUUID();
  const input = { workflowId: proposed.workflowId, version: 1, definitionHash: proposed.definitionHash, commandId };
  await assert.rejects(() => approveWorkflowProposal(store, { ...input, definitionHash: `sha256:${'0'.repeat(64)}` },
    { sessionExistsFn: exists }), (error) => error?.code === 'WORKFLOW_DEFINITION_HASH_MISMATCH');
  const [first, concurrent] = await Promise.all([
    approveWorkflowProposal(store, input, { sessionExistsFn: exists, nowFn: () => '2026-09-23T14:00:00.000Z' }),
    approveWorkflowProposal(store, input, { sessionExistsFn: exists, nowFn: () => '2026-09-23T14:01:00.000Z' }),
  ]);
  assert.equal(first.status, 'approved');
  assert.equal(concurrent.status, 'approved');
  assert.deepEqual(first.receipt, concurrent.receipt);
  assert.equal((await lookupCommandReceipt(store, { commandId })).acceptedAt, '2026-09-23T14:00:00.000Z');
  const view = await readWorkflowProposal(store, { workflowId: proposed.workflowId, version: 1 }, { sessionExistsFn: exists });
  assert.equal(view.status, 'approved');
  assert.equal(view.approval.commandId, commandId);
  assert.deepEqual(readdirSync(join(root, 'runs')), []);
  await assert.rejects(() => approveWorkflowProposal(store, { ...input, commandId: randomUUID() },
    { sessionExistsFn: exists }), (error) => error?.code === 'WORKFLOW_APPROVAL_CONFLICT');
});

test('WF-PROPOSAL-REPLAY-AFTER-APPROVAL: repeated model tool call reports current approved state', async (t) => {
  const { store } = await harness(t);
  const input = proposalInput({ toolCallId: 'call_replayed_after_approval' });
  const proposed = await proposeWorkflowFromTool(store, input);
  await approveWorkflowProposal(store, { workflowId: proposed.workflowId, version: 1,
    definitionHash: proposed.definitionHash, commandId: randomUUID() }, { sessionExistsFn: exists });
  const replay = await proposeWorkflowFromTool(store, input);
  assert.equal(replay.workflowId, proposed.workflowId);
  assert.equal(replay.definitionHash, proposed.definitionHash);
  assert.equal(replay.status, 'approved');
});

/*
 * ⛔ F3-10 (23/09/2026, decisione owner D02-a) — il modo «Workflow» non esiste più: la proposta si accetta
 *   dal root in Normale e in Piano. `workflow` qui è un valore che il registro non passa più (lo rilegge
 *   come Normale): se arriva, è un contratto violato e si rifiuta chiuso, senza scrivere niente.
 */
test('WF-PROPOSAL-TOOL-MODES-V2: the root proposes in Normal and Plan; retired or child modes fail closed', async (t) => {
  const { store } = await harness(t);
  for (const modalitaOperativa of ['normale', 'piano']) {
    const esito = await proposeWorkflowFromTool(store, proposalInput({ modalitaOperativa, toolCallId: `call_${modalitaOperativa}` }));
    assert.equal(esito.status, 'proposed', modalitaOperativa);
  }
  for (const [agentRole, modalitaOperativa] of [['root', 'workflow'], ['root', 'automatico'], ['child', 'normale']]) {
    await assert.rejects(proposeWorkflowFromTool(store, proposalInput({ agentRole, modalitaOperativa, toolCallId: `call_no_${agentRole}_${modalitaOperativa}` })),
      (errore) => errore.code === 'WORKFLOW_PROPOSAL_FORBIDDEN', `${agentRole}/${modalitaOperativa}`);
  }
});

/*
 * ⭐ F3-11c (24/09/2026 notte), decisione owner 40 — la proposta accetta la BOZZA corta del modello e la compila in un Core v2
 *   in sola lettura (`draft-compiler.mjs`); `core` resta com'era (le prove qui sopra lo coprono: stessi byte, stessa impronta).
 */
const bozza = () => ({
  title: 'Revisione del modulo prezzi', objective: 'Capire dove si calcola lo sconto e se i test lo coprono.',
  phases: [{ id: 'lettura', label: 'Lettura' }, { id: 'sintesi', label: 'Sintesi' }],
  nodes: [
    { id: 'codice', phase: 'lettura', label: 'Leggi il codice', task: 'Trova dove si calcola lo sconto in src/.' },
    { id: 'test', phase: 'lettura', label: 'Leggi i test', task: 'Trova i test che coprono lo sconto.' },
    { id: 'rapporto', phase: 'sintesi', label: 'Rapporto', task: 'Scrivi cosa è coperto e cosa no.', dependsOn: ['codice', 'test'] },
  ],
});
function draftInput(overrides = {}) {
  const input = proposalInput({ toolCallId: 'call_draft_1', ...overrides });
  delete input.core;
  return { ...input, draft: bozza(), ...overrides };
}

test('WF-DRAFT-PLANNED-GRAPH: la bozza del modello diventa una Definition v2 a fasi, proposta e non avviata', async (t) => {
  const { compileWorkflowDraft } = await import('../src/workflow/draft-compiler.mjs');
  const { store } = await harness(t);
  const esito = await proposeWorkflowFromTool(store, draftInput(), { nowFn: () => '2026-09-24T22:00:00.000Z' });
  assert.equal(esito.status, 'proposed', 'proposta, non approvata né avviata');
  const view = await readWorkflowProposal(store, { workflowId: esito.workflowId, version: 1 }, { sessionExistsFn: exists });
  // F3-21: la vista non porta il Core; l'impronta canonica del Core salvato è quella della bozza compilata (stessi byte)
  assert.equal(view.definitionHash, compileWorkflowDraft(bozza(), { availableModelIds: null }).definitionHash, 'il Core salvato è quello compilato dalla bozza');
  assert.deepEqual(view.phases.map((p) => p.id), ['lettura', 'sintesi']);
  assert.equal(view.counts.nodes, 3);
  // stessa tool-call ripetuta: una Definition sola, stessa ricevuta
  assert.deepEqual(await proposeWorkflowFromTool(store, draftInput(), { nowFn: () => '2026-09-24T23:00:00.000Z' }), esito);
});

test('WF-DRAFT-PROPOSAL-EXACTLY-ONE: bozza e core insieme si rifiutano; una bozza sbagliata dice il motivo e non salva niente', async (t) => {
  const { store } = await harness(t);
  await assert.rejects(proposeWorkflowFromTool(store, { ...draftInput({ toolCallId: 'call_both' }), core: phasedCore() }),
    (errore) => errore.code === 'WORKFLOW_PROPOSAL_INVALID');
  const scrittore = bozza(); scrittore.nodes[0].access = 'write';
  await assert.rejects(proposeWorkflowFromTool(store, draftInput({ toolCallId: 'call_writer', draft: scrittore })),
    (errore) => errore.code === 'WORKFLOW_DRAFT_WRITER' && /read-only/.test(errore.message));
  await assert.rejects(readWorkflowProposal(store, { workflowId: workflowIdForToolCall({ sessionId, toolCallId: 'call_writer' }), version: 1 }, { sessionExistsFn: exists }),
    (errore) => errore.code === 'WORKFLOW_PROPOSAL_NOT_FOUND', 'una bozza respinta non lascia una Definition a metà');
});

test('WF-DRAFT-PROPOSAL-MODEL-AVAILABLE: un modello per passo passa solo se il catalogo lo offre (decisione 42)', async (t) => {
  const { store } = await harness(t);
  const conModello = bozza(); conModello.nodes[2].model = 'openai/gpt-5.5-mini';
  await assert.rejects(proposeWorkflowFromTool(store, draftInput({ toolCallId: 'call_model_no', draft: conModello }), { availableModelIdsFn: async () => ['z-ai/glm-5.3-flash'] }),
    (errore) => errore.code === 'WORKFLOW_DRAFT_MODEL_UNAVAILABLE');
  // catalogo che non risponde: l'elenco resta ignoto e il compilatore lo dice, non lo indovina
  await assert.rejects(proposeWorkflowFromTool(store, draftInput({ toolCallId: 'call_model_ignoto', draft: conModello }), { availableModelIdsFn: async () => { throw new Error('rete'); } }),
    (errore) => errore.code === 'WORKFLOW_DRAFT_MODEL_UNAVAILABLE' && /not known/.test(errore.message));
  const esito = await proposeWorkflowFromTool(store, draftInput({ toolCallId: 'call_model_si', draft: conModello }), { availableModelIdsFn: async () => ['z-ai/glm-5.3-flash', 'openai/gpt-5.5-mini'] });
  assert.equal(esito.status, 'proposed');
});
