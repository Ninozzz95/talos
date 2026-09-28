// F3-21 (25/09/2026) — la proposta si vede: elenco per sessione dallo Store, revisione LIMITATA, grafo «pianificato».
// Mappa: `.claude/F3-MAPPA-WORKFLOW-PLAN-ASK-2026-09-23.md` §2.3 F3-21; decisioni owner 5, 6 (fasi e nodi pianificati
// senza stati inventati), 19 (modifica = versione nuova). Hermes `plugins/kanban/dashboard/plugin_api.py:279-335`: la card
// porta un'anteprima, il testo pieno arriva dal dettaglio; conteggi aggregati, mai N+1.
import assert from 'node:assert/strict';
import { readdirSync, mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { approveWorkflowProposal, listWorkflowProposals, proposeWorkflowFromTool, readPlannedWorkflowGraph,
  readWorkflowProposal } from '../src/workflow/planning-control.mjs';
import { createWorkflowStore, listDefinitionsForSession } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionA = '82000000-0000-4000-8000-00000000000a';
const sessionB = '82000000-0000-4000-8000-00000000000b';
const coreV1 = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
const copy = (value) => structuredClone(value);

function phasedCore(title = 'Verifica e integra una modifica') {
  const core = copy(coreV1);
  core.schema = 'talos.workflow-definition-core.v2'; core.definitionSchemaVersion = 2;
  core.title = title;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation'; core.nodes[1].phaseId = 'verification';
  return core;
}

/**
 * `count` passi in sola lettura su due fasi, a STELLA: il primo passo, poi tutti gli altri dopo di lui (profondità 2).
 * ⛔ Non una catena: il preflight tiene `limits.maxDepth` in 1..1000, e una catena di 5.000 passi non è una proposta valida.
 */
function chainCore(count) {
  const core = phasedCore('Catena lunga');
  const modello = { ...copy(core.nodes[0]), capabilityProfile: 'read', writeSetHint: [], instructions: 'Leggi il modulo e riassumi.' };
  core.policy.capabilityCeiling = 'read';
  core.nodes = Array.from({ length: count }, (_, i) => ({ ...copy(modello), id: `n-${String(i).padStart(5, '0')}`,
    label: `Passo ${i}`, phaseId: i < count / 2 ? 'implementation' : 'verification' }));
  core.edges = core.nodes.slice(1).map((node, i) => ({ id: `e-${String(i).padStart(5, '0')}`, from: core.nodes[0].id, to: node.id,
    type: 'control', condition: null, mapping: null }));
  core.acceptance = [];
  core.limits.maxLogicalNodes = count; core.limits.maxEdges = count; core.limits.maxFanoutPerNode = count;
  core.limits.maxAgentSessions = count; core.limits.maxDepth = 8;
  return core;
}

async function openStore(root) {
  return createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
}
async function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-proposal-list-'));
  const ctx = { root, store: await openStore(root) };
  t.after(async () => { if (ctx.store.state !== 'closed') await ctx.store.close(); rimuoviCartellaDiProva(root); });
  return ctx;
}
function propose(store, { sessionId = sessionA, toolCallId, core = phasedCore(), at = '2026-09-25T10:00:00.000Z' } = {}) {
  return proposeWorkflowFromTool(store, { sessionId, toolCallId, core, plannerModel: null, sessionModel: 'provider/model',
    modalitaOperativa: 'normale', agentRole: 'root' }, { nowFn: () => at });
}
const esiste = (...ids) => (id) => ids.includes(id);

test('WF-PROPOSAL-LIST-OWNER-SCOPE: each session lists only its own proposals, newest first, bounded and without the Core', async (t) => {
  const { store } = await harness(t);
  const vecchia = await propose(store, { toolCallId: 'call_a1', core: phasedCore('Prima'), at: '2026-09-25T10:00:00.000Z' });
  const nuova = await propose(store, { toolCallId: 'call_a2', core: phasedCore('Seconda'), at: '2026-09-25T11:00:00.000Z' });
  const altrui = await propose(store, { sessionId: sessionB, toolCallId: 'call_b1', core: phasedCore('Di B') });
  const lista = await listWorkflowProposals(store, { sessionId: sessionA, offset: 0, limit: 50 }, { sessionExistsFn: esiste(sessionA, sessionB) });
  assert.equal(lista.schema, 'talos.workflow-proposal-list.v1');
  assert.equal(lista.total, 2);
  assert.deepEqual(lista.items.map((item) => item.workflowId), [nuova.workflowId, vecchia.workflowId]);
  assert.ok(!lista.items.some((item) => item.workflowId === altrui.workflowId), 'a proposal of another session leaked into the list');
  assert.deepEqual(lista.items[0], {
    workflowId: nuova.workflowId, version: 1, definitionHash: nuova.definitionHash, createdAt: '2026-09-25T11:00:00.000Z',
    title: 'Seconda', phaseCount: 2, nodeCount: 2, edgeCount: 1, writerCount: lista.items[0].writerCount, status: 'proposed',
  });
  assert.equal(typeof lista.items[0].writerCount, 'number');
  assert.doesNotMatch(JSON.stringify(lista), /"core"|"instructions"|"nodes"/u);
  const pagina = await listWorkflowProposals(store, { sessionId: sessionA, offset: 0, limit: 1 }, { sessionExistsFn: esiste(sessionA) });
  assert.equal(pagina.items.length, 1);
  assert.equal(pagina.nextOffset, 1);
  // fuori proprietario: la sessione non esiste (o è stata cancellata) ⇒ nessun elenco, nemmeno vuoto
  await assert.rejects(() => listWorkflowProposals(store, { sessionId: sessionA, offset: 0, limit: 50 }, { sessionExistsFn: esiste(sessionB) }),
    (error) => error?.code === 'WORKFLOW_PROPOSAL_NOT_FOUND');
  await assert.rejects(() => listWorkflowProposals(store, { sessionId: sessionA, offset: 0, limit: 51 }, { sessionExistsFn: esiste(sessionA) }),
    (error) => error?.code === 'QUERY_INVALID');
  assert.deepEqual(listDefinitionsForSession(store, { sessionId: sessionB }).map((item) => item.workflowId), [altrui.workflowId]);
});

test('WF-PROPOSAL-LIST-RESTART: the list and the approval state survive a restart of the Store', async (t) => {
  const ctx = await harness(t);
  const prima = await propose(ctx.store, { toolCallId: 'call_restart_1' });
  await approveWorkflowProposal(ctx.store, { workflowId: prima.workflowId, version: 1, definitionHash: prima.definitionHash,
    commandId: '4f7c0a4e-8f1b-4c62-9d0a-6f8f2b1c3d4e' }, { sessionExistsFn: esiste(sessionA) });
  const approvata = await listWorkflowProposals(ctx.store, { sessionId: sessionA, offset: 0, limit: 50 }, { sessionExistsFn: esiste(sessionA) });
  assert.equal(approvata.items[0].status, 'approved', 'the in-memory index did not see the approval');
  await ctx.store.close();
  ctx.store = await openStore(ctx.root);
  const dopo = await listWorkflowProposals(ctx.store, { sessionId: sessionA, offset: 0, limit: 50 }, { sessionExistsFn: esiste(sessionA) });
  assert.deepEqual(dopo.items.map(({ workflowId, status, definitionHash }) => ({ workflowId, status, definitionHash })),
    [{ workflowId: prima.workflowId, status: 'approved', definitionHash: prima.definitionHash }]);
  const seconda = await propose(ctx.store, { toolCallId: 'call_restart_2', at: '2026-09-25T12:00:00.000Z' });
  const ancora = await listWorkflowProposals(ctx.store, { sessionId: sessionA, offset: 0, limit: 50 }, { sessionExistsFn: esiste(sessionA) });
  assert.deepEqual(ancora.items.map((item) => [item.workflowId, item.status]), [[seconda.workflowId, 'proposed'], [prima.workflowId, 'approved']]);
});

test('WF-PROPOSAL-REVIEW-BOUNDED-5000: the review of a 5000-step proposal is small and never carries the Core', async (t) => {
  const { store } = await harness(t);
  const proposta = await propose(store, { toolCallId: 'call_5000', core: chainCore(5_000) });
  const campioni = [];
  let vista;
  for (let i = 0; i < 3; i += 1) {
    const avvio = performance.now();
    vista = await readWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1 }, { sessionExistsFn: esiste(sessionA) });
    campioni.push(performance.now() - avvio);
  }
  const json = JSON.stringify(vista);
  const mediana = campioni.sort((a, b) => a - b)[1];
  t.diagnostic(`revisione 5000 passi: ${Buffer.byteLength(json)} byte, mediana ${mediana.toFixed(1)} ms`);
  assert.equal(vista.schema, 'talos.workflow-proposal-view.v2');
  assert.equal(vista.status, 'proposed');
  assert.equal(vista.definitionHash, proposta.definitionHash);
  assert.equal(vista.title, 'Catena lunga');
  assert.equal(vista.proposal.initiatingSessionId, sessionA);
  assert.deepEqual(vista.phases, [{ id: 'implementation', label: 'Implementazione', total: 2_500 },
    { id: 'verification', label: 'Verifica', total: 2_500 }]);
  assert.equal(vista.counts.nodes, 5_000);
  assert.equal(vista.counts.edges, 4_999);
  assert.equal(vista.counts.writers, 0);
  assert.ok(Buffer.byteLength(json) < 32_768, `review is ${Buffer.byteLength(json)} bytes`);
  assert.doesNotMatch(json, /"core"|"instructions"|"(?:nodes|edges)"\s*:\s*\[|Leggi il modulo/u);
  assert.ok(Array.isArray(vista.preflight.warnings) && vista.preflight.warnings.length <= 20);
  assert.equal(typeof vista.preflight.warningCount, 'number');
  assert.equal(typeof vista.preflight.errorCount, 'number');
  assert.ok(vista.policy && vista.budgets && vista.limits, 'the review must show policy, budgets and limits');
});

test('WF-PLANNED-GRAPH-NO-PHANTOM-ACTIVE: a proposal is planned — no run, no progress, no invented state, before and after approval', async (t) => {
  const { root, store } = await harness(t);
  const proposta = await propose(store, { toolCallId: 'call_planned', core: chainCore(14) });
  const leggi = (opts) => readPlannedWorkflowGraph(store, { workflowId: proposta.workflowId, version: 1, ...opts }, { sessionExistsFn: esiste(sessionA) });
  for (const fase of ['proposta', 'approvata']) {
    const panoramica = await leggi({ view: 'overview' });
    assert.equal(panoramica.schema, 'talos.workflow-graph-view.v2', fase);
    assert.equal(panoramica.status, 'planned', fase);
    assert.equal(panoramica.runId, null, fase);
    assert.equal(panoramica.workflowId, proposta.workflowId, fase);
    assert.equal(panoramica.definitionHash, proposta.definitionHash, fase);
    assert.equal(panoramica.total, 14, fase);
    assert.equal(panoramica.terminated, 0, fase);
    assert.equal(panoramica.attention, 0, fase);
    for (const gruppo of panoramica.groups) {
      assert.deepEqual(gruppo.counts, { planned: gruppo.total }, `${fase}: ${gruppo.phaseId}`);
      assert.equal(gruppo.progress, null, `${fase}: a planned group has no progress, not 0%`);
    }
    const pagina = await leggi({ view: 'group', phaseId: 'implementation', offset: 0, limit: 50 });
    assert.equal(pagina.items.length, 7, fase);
    assert.ok(pagina.items.every((item) => item.state === 'planned' && item.updatedAt === null), fase);
    assert.deepEqual(readdirSync(join(root, 'runs')), [], `${fase}: reading a planned graph created a run`);
    if (fase === 'proposta') {
      await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
        commandId: '5a8d1b5f-9a2c-4d73-8e1b-7a9c3c2d4e5f' }, { sessionExistsFn: esiste(sessionA) });
    }
  }
  await assert.rejects(() => readPlannedWorkflowGraph(store, { workflowId: proposta.workflowId, version: 1, view: 'overview' },
    { sessionExistsFn: esiste(sessionB) }), (error) => error?.code === 'WORKFLOW_PROPOSAL_NOT_FOUND');
});

test('WF-PLANNED-EDGES-REAL-ONLY: the planned edges are exactly the Definition edges, and phase links come only from real ones', async (t) => {
  const { store } = await harness(t);
  const core = chainCore(6);
  // un arco in più DENTRO la stessa fase: non deve generare collegamenti fra fasi (i tre fra le fasi sono n-00000 → n-00003..5)
  core.edges.push({ id: 'e-extra', from: 'n-00001', to: 'n-00002', type: 'control', condition: null, mapping: null });
  const proposta = await propose(store, { toolCallId: 'call_edges', core });
  const leggi = (opts) => readPlannedWorkflowGraph(store, { workflowId: proposta.workflowId, version: 1, ...opts }, { sessionExistsFn: esiste(sessionA) });
  const archi = await leggi({ view: 'edges', offset: 0, limit: 100 });
  assert.equal(archi.total, core.edges.length);
  assert.deepEqual(archi.items.map(({ edgeId, fromNodeId, toNodeId, type }) => [edgeId, fromNodeId, toNodeId, type]),
    [...core.edges].sort((a, b) => a.id.localeCompare(b.id, 'en')).map((e) => [e.id, e.from, e.to, e.type]));
  const panoramica = await leggi({ view: 'overview' });
  assert.deepEqual(panoramica.groupConnections, [{ fromPhaseId: 'implementation', toPhaseId: 'verification', total: 3, types: { control: 3 } }]);
  await assert.rejects(() => leggi({ view: 'edges', offset: 0, limit: 101 }), (error) => error?.code === 'QUERY_INVALID');
});

test('WF-PLANNED-NODE-DETAIL: a planned step shows what it will do, never its workspace path', async (t) => {
  const { store } = await harness(t);
  const core = chainCore(4);
  core.nodes[1].workspacePolicy = { ...core.nodes[1].workspacePolicy };
  const proposta = await propose(store, { toolCallId: 'call_detail', core });
  const leggi = (opts) => readPlannedWorkflowGraph(store, { workflowId: proposta.workflowId, version: 1, ...opts }, { sessionExistsFn: esiste(sessionA) });
  const dettaglio = await leggi({ view: 'node', nodeId: 'n-00001' });
  assert.equal(dettaglio.status, 'planned');
  assert.equal(dettaglio.nodeId, 'n-00001');
  assert.equal(dettaglio.state, 'planned');
  assert.equal(dettaglio.instructions, 'Leggi il modulo e riassumi.');
  assert.equal(dettaglio.capabilityProfile, 'read');
  assert.equal(dettaglio.model, null, 'null = the session model (decision 42)');
  assert.deepEqual(dettaglio.dependsOn, ['n-00000']);
  assert.equal(dettaglio.attempt, 0);
  assert.doesNotMatch(JSON.stringify(dettaglio), /workspacePolicy|resultRefIds/u);
  await assert.rejects(() => leggi({ view: 'node', nodeId: 'non-esiste' }), (error) => error?.code === 'WORKFLOW_NODE_NOT_FOUND');
  await assert.rejects(() => leggi({ view: 'group', phaseId: 'non-esiste', offset: 0, limit: 50 }), (error) => error?.code === 'WORKFLOW_GROUP_NOT_FOUND');
});

test('WF-PLANNED-OVERVIEW-5000-TIME: after the first verified read, the planned views of 5000 steps stay within the run-graph budget', async (t) => {
  const { store } = await harness(t);
  const proposta = await propose(store, { toolCallId: 'call_time_5000', core: chainCore(5_000) });
  const leggi = (opts) => readPlannedWorkflowGraph(store, { workflowId: proposta.workflowId, version: 1, ...opts }, { sessionExistsFn: esiste(sessionA) });
  const primo = performance.now();
  await leggi({ view: 'overview' });
  const primaLettura = performance.now() - primo;
  const tempi = { overview: [], group: [], review: [] };
  for (let i = 0; i < 3; i += 1) {
    let avvio = performance.now(); await leggi({ view: 'overview' }); tempi.overview.push(performance.now() - avvio);
    avvio = performance.now(); await leggi({ view: 'group', phaseId: 'verification', offset: 2_450, limit: 50 }); tempi.group.push(performance.now() - avvio);
    avvio = performance.now();
    await readWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1 }, { sessionExistsFn: esiste(sessionA) });
    tempi.review.push(performance.now() - avvio);
  }
  const mediana = (valori) => valori.sort((a, b) => a - b)[1];
  t.diagnostic(`5000 passi: prima lettura verificata ${primaLettura.toFixed(0)} ms; poi mediane overview ${mediana(tempi.overview).toFixed(1)} ms, `
    + `pagina ${mediana(tempi.group).toFixed(1)} ms, revisione ${mediana(tempi.review).toFixed(1)} ms`);
  assert.ok(mediana(tempi.overview) < 150, `overview ${mediana(tempi.overview).toFixed(1)} ms, budget 150 ms (WF-GRAPH-5000-WIDE-ORDER-PERF)`);
  assert.ok(mediana(tempi.group) < 150, `page ${mediana(tempi.group).toFixed(1)} ms`);
  assert.ok(mediana(tempi.review) < 50, `review ${mediana(tempi.review).toFixed(1)} ms`);
});

test('WF-DEFINITION-VIEW-CACHE-STAMP: a Definition touched on disk after start is verified again, never served from the cache', async (t) => {
  const { root, store } = await harness(t);
  const proposta = await propose(store, { toolCallId: 'call_stamp', core: chainCore(4) });
  const leggi = () => readWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1 }, { sessionExistsFn: esiste(sessionA) });
  assert.equal((await leggi()).title, 'Catena lunga');
  const file = join(root, 'definitions', proposta.workflowId, '1', 'record.json');
  const { readFileSync, writeFileSync } = await import('node:fs');
  const record = JSON.parse(readFileSync(file, 'utf8'));
  record.core.title = 'Titolo cambiato a mano, impronta non più valida';
  writeFileSync(file, JSON.stringify(record));
  await assert.rejects(leggi, (error) => error?.code === 'WORKFLOW_STORE_CORRUPT',
    'the tampered Definition was served from the view cache');
});

test('WF-DEFINITION-VIEW-FROZEN: the cached Definition cannot be changed by a reader', async (t) => {
  const { store } = await harness(t);
  const proposta = await propose(store, { toolCallId: 'call_frozen', core: chainCore(4) });
  const { readDefinitionForView } = await import('../src/workflow/store.mjs');
  const record = await readDefinitionForView(store, { workflowId: proposta.workflowId, version: 1 });
  assert.throws(() => { record.core.nodes[0].instructions = 'altro'; }, TypeError);
  assert.equal((await readDefinitionForView(store, { workflowId: proposta.workflowId, version: 1 })).core.nodes[0].instructions,
    'Leggi il modulo e riassumi.');
});

test('WF-PROPOSAL-REVIEW-ISSUES-BOUNDED: 40 stored warnings reach the review as 20 plus their total, with at most 10 subjects each', async (t) => {
  const { store } = await harness(t);
  const { createDefinition, readDefinition } = await import('../src/workflow/store.mjs');
  const base = await propose(store, { toolCallId: 'call_issues_base', core: chainCore(4) });
  const record = structuredClone(await readDefinition(store, { workflowId: base.workflowId, version: 1 }));
  record.workflowId = '0f0e0d0c-0b0a-4908-8706-050403020100';
  record.preflight.warnings = Array.from({ length: 40 }, (_, i) => ({ code: 'PREFLIGHT_HIGH_FANOUT', message: `avviso ${i}`,
    subjects: Array.from({ length: 15 }, (_, j) => `s-${i}-${j}`) }));
  await createDefinition(store, { record });
  const vista = await readWorkflowProposal(store, { workflowId: record.workflowId, version: 1 }, { sessionExistsFn: esiste(sessionA) });
  assert.equal(vista.preflight.warningCount, 40);
  assert.equal(vista.preflight.warnings.length, 20);
  assert.deepEqual(vista.preflight.warnings.map((w) => w.message), Array.from({ length: 20 }, (_, i) => `avviso ${i}`), 'the FIRST 20, in order');
  assert.ok(vista.preflight.warnings.every((w) => w.subjects.length === 10));
  assert.equal(vista.preflight.errorCount, 0);
});
