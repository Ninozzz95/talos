// F3-31 (25/09/2026) — il comando di AVVIO di un Workflow approvato, senza HTTP: `run_created` porta la terna del comando
// `start-run` (RP §8.2), la ripetizione dello stesso comando risolve sempre lo stesso run, un comando respinto non consuma il
// suo id, e un run appena nato è PREPARATO, mai «in esecuzione». Decisioni owner 1 (nodi in sola lettura), 5 (Avvia è un passo
// separato dopo Approva), 44 (più run ammessi). Hermes `gateway/platforms/api_server_runs.py:420-428`: la ripetizione
// restituisce il run originale, la stessa chiave con un altro contenuto è un conflitto.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { startCommandHash, startWorkflowRun } from '../src/workflow/run-control.mjs';
import { createWorkflowStore, readEvents, readRunState } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '82000000-0000-4000-8000-0000000000d1';
const coreV1 = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
const vettori = JSON.parse(await readFile(new URL('./fixtures/workflow/vectors/command-dedupe-v1.json', import.meta.url), 'utf8'));
const esiste = (id) => id === sessionId;
const AGENTI = Object.freeze(['agent']);

function readOnlyCore(title = 'Due passi in lettura', mutate = () => {}) {
  const core = structuredClone(coreV1);
  core.schema = 'talos.workflow-definition-core.v2'; core.definitionSchemaVersion = 2; core.title = title;
  core.phases = [{ id: 'lettura', label: 'Lettura' }, { id: 'sintesi', label: 'Sintesi' }];
  const modello = { ...structuredClone(core.nodes[0]), kind: 'agent', capabilityProfile: 'read', writeSetHint: [], instructions: 'Leggi e riassumi.' };
  core.policy.capabilityCeiling = 'read';
  core.nodes = [{ ...structuredClone(modello), id: 'leggi', label: 'Leggi', phaseId: 'lettura' },
    { ...structuredClone(modello), id: 'riassumi', label: 'Riassumi', phaseId: 'sintesi' }];
  core.edges = [{ id: 'leggi.riassumi', from: 'leggi', to: 'riassumi', type: 'control', condition: null, mapping: null }];
  core.acceptance = [];
  mutate(core);
  return core;
}
async function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-run-control-'));
  const ctx = { root };
  ctx.open = () => createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  ctx.store = await ctx.open();
  t.after(async () => { if (ctx.store.state !== 'closed') await ctx.store.close(); rimuoviCartellaDiProva(root); });
  return ctx;
}
async function proposta(store, { toolCallId = 'call_start', core = readOnlyCore(), approva = true } = {}) {
  const p = await proposeWorkflowFromTool(store, { sessionId, toolCallId, core, plannerModel: null, sessionModel: 'provider/model',
    modalitaOperativa: 'normale', agentRole: 'root' });
  if (approva) await approveWorkflowProposal(store, { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, commandId: randomUUID() },
    { sessionExistsFn: esiste });
  return p;
}
const avvia = (store, p, commandId, extra = {}) => startWorkflowRun(store,
  { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, commandId, ...extra },
  { sessionExistsFn: esiste, supportedNodeKinds: AGENTI, nowFn: () => '2026-09-25T09:00:00.000Z' });
const runsDi = (root) => readdirSync(join(root, 'runs'));

test('WF-START-GOLDEN-HASH: the start-run command hash is the RP §8.2 golden', () => {
  const caso = vettori.cases.find((c) => c.name === 'start-run');
  assert.equal(startCommandHash({ workflowId: caso.projection.target.workflowId, version: caso.projection.target.definitionVersion,
    definitionHash: caso.projection.payload.definitionHash }), caso.expectedHash);
  assert.equal(caso.expectedHash, 'sha256:e9fc6ba327ff9f8f3f46f040a50a2f4ac62dab6327a87581f3495b45859ae1ac');
});

test('WF-START-OWNER-HASH-COMMAND-REPLAY: one command, one run — replay returns the same run, even after a restart', async (t) => {
  const ctx = await harness(t);
  const p = await proposta(ctx.store);
  const comando = randomUUID();
  const primo = await avvia(ctx.store, p, comando);
  assert.equal(primo.schema, 'talos.workflow-start-result.v1');
  assert.equal(primo.status, 'prepared');
  assert.equal(primo.deduplicated, false);
  assert.match(primo.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  const [creato] = await readEvents(ctx.store, { runId: primo.runId });
  assert.equal(creato.type, 'run_created');
  assert.equal(creato.commandId, comando);
  assert.equal(creato.commandType, 'start-run');
  assert.equal(creato.commandPayloadHash, startCommandHash({ workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash }));
  assert.deepEqual(creato.payload, { workflowId: p.workflowId, definitionVersion: 1, definitionHash: p.definitionHash,
    rootSessionId: sessionId, workspaceBaselineId: null, workspaceBaselineHash: null });
  assert.equal(primo.receipt.runId, primo.runId, 'the receipt resolves the run');
  const replay = await avvia(ctx.store, p, comando);
  assert.equal(replay.runId, primo.runId);
  assert.equal(replay.deduplicated, true);
  assert.deepEqual(runsDi(ctx.root), [primo.runId]);
  await ctx.store.close();
  ctx.store = await ctx.open();
  const dopo = await avvia(ctx.store, p, comando);
  assert.equal(dopo.runId, primo.runId, 'the durable run_created is the receipt: a restart does not mint a second run');
  assert.deepEqual(runsDi(ctx.root), [primo.runId]);
  // lo stesso comando per un'ALTRA Definition è un conflitto, non un secondo run
  const altra = await proposta(ctx.store, { toolCallId: 'call_other', core: readOnlyCore('Altra') });
  await assert.rejects(() => avvia(ctx.store, altra, comando), (error) => error?.code === 'WORKFLOW_COMMAND_CONFLICT');
  assert.deepEqual(runsDi(ctx.root), [primo.runId]);
  // un comando nuovo sulla stessa Definition approvata è un run in più (decisione owner 44)
  const secondo = await avvia(ctx.store, p, randomUUID());
  assert.notEqual(secondo.runId, primo.runId);
  assert.equal(runsDi(ctx.root).length, 2);
});

test('WF-START-OWNER-AND-HASH: a stale hash or a gone session start nothing', async (t) => {
  const ctx = await harness(t);
  const p = await proposta(ctx.store);
  await assert.rejects(() => avvia(ctx.store, p, randomUUID(), { definitionHash: `sha256:${'0'.repeat(64)}` }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_HASH_MISMATCH');
  await assert.rejects(() => startWorkflowRun(ctx.store, { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, commandId: randomUUID() },
    { sessionExistsFn: () => false, supportedNodeKinds: AGENTI }), (error) => error?.code === 'WORKFLOW_PROPOSAL_NOT_FOUND');
  await assert.rejects(() => avvia(ctx.store, p, 'non-un-uuid'), (error) => error?.code === 'QUERY_INVALID');
  await assert.rejects(() => startWorkflowRun(ctx.store, { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, commandId: randomUUID() },
    { sessionExistsFn: esiste }), (error) => error?.code === 'WORKFLOW_START_UNSUPPORTED', 'without the adapters list nothing can start');
  assert.deepEqual(runsDi(ctx.root), []);
});

test('WF-START-NOT-APPROVED: a proposal that is not approved does not start, and the refused command id stays free', async (t) => {
  const ctx = await harness(t);
  const p = await proposta(ctx.store, { approva: false });
  const comando = randomUUID();
  await assert.rejects(() => avvia(ctx.store, p, comando), (error) => error?.code === 'WORKFLOW_DEFINITION_NOT_APPROVED');
  assert.deepEqual(runsDi(ctx.root), []);
  await approveWorkflowProposal(ctx.store, { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, commandId: randomUUID() },
    { sessionExistsFn: esiste });
  const dopo = await avvia(ctx.store, p, comando);
  assert.equal(dopo.deduplicated, false, 'RP §8.2: a rejected command without a durable fact does not consume its id');
});

test('WF-START-UNSUPPORTED-KIND: steps nobody can run yet, or that write, are refused before run_created', async (t) => {
  const ctx = await harness(t);
  // la fixture del contratto, a fasi: `implement` è un agente che SCRIVE, `test` è un passo di tipo `test` (passa il preflight)
  const core = structuredClone(coreV1);
  core.schema = 'talos.workflow-definition-core.v2'; core.definitionSchemaVersion = 2;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation'; core.nodes[1].phaseId = 'verification';
  const p = await proposta(ctx.store, { toolCallId: 'call_fixture', core });
  const conTipi = (supportedNodeKinds) => startWorkflowRun(ctx.store,
    { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, commandId: randomUUID() },
    { sessionExistsFn: esiste, supportedNodeKinds });
  await assert.rejects(() => conTipi(['agent']), (error) => error?.code === 'WORKFLOW_START_UNSUPPORTED'
    && /"test" \(test\)/u.test(error.message), 'a step kind without an adapter');
  await assert.rejects(() => conTipi(['agent', 'test']), (error) => error?.code === 'WORKFLOW_START_UNSUPPORTED'
    && /"implement"/u.test(error.message) && /read-only/u.test(error.message), 'a writer in the read-only phase (owner decision 1)');
  assert.deepEqual(runsDi(ctx.root), []);
});

test('WF-START-NO-PHANTOM-ACTIVE: a new run is prepared — created, not running, nothing scheduled', async (t) => {
  const ctx = await harness(t);
  const p = await proposta(ctx.store);
  const avviato = await avvia(ctx.store, p, randomUUID());
  const events = await readEvents(ctx.store, { runId: avviato.runId });
  assert.deepEqual(events.map((e) => e.type), ['run_created']);
  const { state } = await readRunState(ctx.store, { runId: avviato.runId });
  assert.equal(state.run.status, 'created');
  assert.notEqual(state.run.status, 'running');
  for (const node of state.definition.nodes) assert.ok(['pending', undefined].includes(state.nodes.get(node.id)?.state), node.id);
});

test('WF-START-REPLAY-BEFORE-ADAPTERS: an accepted start answers with its run even when no adapter is left; a new one is refused', async (t) => {
  const ctx = await harness(t);
  const p = await proposta(ctx.store);
  const comando = randomUUID();
  const primo = await avvia(ctx.store, p, comando);
  const conTipi = (commandId, supportedNodeKinds) => startWorkflowRun(ctx.store,
    { workflowId: p.workflowId, version: 1, definitionHash: p.definitionHash, commandId }, { sessionExistsFn: esiste, supportedNodeKinds });
  const replay = await conTipi(comando, []);
  assert.equal(replay.runId, primo.runId, 'the durable fact is the truth: the replay does not depend on today\'s adapters');
  assert.equal(replay.deduplicated, true);
  await assert.rejects(() => conTipi(randomUUID(), []), (error) => error?.code === 'WORKFLOW_START_UNSUPPORTED'
    && /No Workflow step adapter/u.test(error.message));
  assert.deepEqual(runsDi(ctx.root), [primo.runId]);
});
