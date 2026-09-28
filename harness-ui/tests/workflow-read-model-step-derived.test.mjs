/*
 * F3 Workflow UI, decisione owner D27 (25/09/2026): i dati del mockup sul passo si DERIVANO dai fatti veri — inizio, fine e
 * durata dell'ultimo tentativo, modello effettivo e sessione del passo — e ciò che non ha una sorgente non compare (nessuna
 * percentuale per il singolo passo). Il passo PIANIFICATO non cambia forma. Ledger: `.claude/LEDGER-F3-WORKFLOW-UI-2026-09-25.md`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { PLANNED_TASK_PREVIEW_MAX, projectPlannedWorkflowGroupPage, projectWorkflowGroupPage, projectWorkflowNodeDetail,
  projectWorkflowOverview, projectWorkflowRunUpdate } from '../src/workflow/read-model.mjs';

const nodo = (id) => ({ id, label: id, kind: 'agent', role: 'researcher', priority: 0, phaseId: 'f', instructions: `Fai ${id}.` });
const input = (events, { planned = false } = {}) => ({
  state: {
    definition: { schema: 'talos.workflow-definition-core.v2', phases: [{ id: 'f', label: 'F' }], nodes: [nodo('a'), nodo('b')], edges: [] },
    nodes: new Map(), lastSeq: events.length, run: planned ? null : { runId: 'r', graphVersion: 1, status: 'running' },
    ...(planned ? { planned: { workflowId: 'w', version: 1, definitionHash: 'sha256:x' } } : {}),
  },
  events,
});
const fatto = (seq, type, nodeId, at, payload = {}) => ({ seq, type, nodeId, at, payload });
const SESSIONE = { sessionId: '11111111-1111-4111-8111-111111111111', provider: 'openrouter', model: 'z-ai/glm-5.3-flash', capabilityProfile: 'read', workspaceLeaseId: 'l' };

test('WF-STEP-DERIVED-FINISHED: a finished attempt gives start, end, duration, the effective model and the step session', () => {
  const d = projectWorkflowNodeDetail(input([
    fatto(1, 'activity_started', 'a', '2026-09-25T11:36:24.466Z', { adapterId: 'agent-session' }),
    fatto(2, 'agent_session_created', 'a', '2026-09-25T11:36:24.588Z', SESSIONE),
    fatto(3, 'activity_started', 'b', '2026-09-25T11:36:25.000Z', { adapterId: 'agent-session' }),
    fatto(4, 'activity_completed', 'a', '2026-09-25T11:36:36.409Z'),
  ]), { nodeId: 'a' });
  assert.equal(d.startedAt, '2026-09-25T11:36:24.466Z');
  assert.equal(d.finishedAt, '2026-09-25T11:36:36.409Z');
  assert.equal(d.durationMs, 11_943);
  assert.equal(d.stepSessionId, SESSIONE.sessionId);
  assert.deepEqual(d.effectiveModel, { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' });
  // ⛔ il compito resta fuori dal run (WF-HTTP-SECRET-OMISSION): si legge dalla revisione della versione approvata
  assert.equal(Object.hasOwn(d, 'instructions'), false);
  assert.equal(Object.hasOwn(d, 'progress'), false, 'no percentage for a single step: no fact measures it');
  // un altro passo non presta i suoi fatti
  const b = projectWorkflowNodeDetail(input([fatto(1, 'activity_started', 'b', '2026-09-25T11:36:25.000Z')]), { nodeId: 'b' });
  assert.deepEqual([b.startedAt, b.finishedAt, b.durationMs, b.stepSessionId, b.effectiveModel], ['2026-09-25T11:36:25.000Z', null, null, null, null]);
});

test('WF-STEP-DERIVED-RETRY: only the latest attempt counts, and a running attempt has no duration (the viewer computes it)', () => {
  const d = projectWorkflowNodeDetail(input([
    fatto(1, 'activity_started', 'a', '2026-09-25T10:00:00.000Z'),
    fatto(2, 'activity_failed', 'a', '2026-09-25T10:00:05.000Z'),
    fatto(3, 'activity_started', 'a', '2026-09-25T10:01:00.000Z'),
  ]), { nodeId: 'a' });
  assert.deepEqual([d.startedAt, d.finishedAt, d.durationMs], ['2026-09-25T10:01:00.000Z', null, null]);
  const annullato = projectWorkflowNodeDetail(input([
    fatto(1, 'activity_started', 'a', '2026-09-25T10:00:00.000Z'),
    fatto(2, 'node_cancelled', 'a', '2026-09-25T10:00:02.500Z'),
  ]), { nodeId: 'a' });
  assert.equal(annullato.durationMs, 2_500, 'a cancel ends the attempt');
  const vuoto = projectWorkflowNodeDetail(input([]), { nodeId: 'a' });
  assert.deepEqual([vuoto.startedAt, vuoto.durationMs, vuoto.stepSessionId], [null, null, null]);
});

test('WF-STEP-DERIVED-PLANNED-UNCHANGED: a planned step gets none of the run fields', () => {
  const d = projectWorkflowNodeDetail(input([], { planned: true }), { nodeId: 'a' });
  for (const campo of ['startedAt', 'finishedAt', 'durationMs', 'stepSessionId', 'effectiveModel', 'instructions']) {
    assert.equal(Object.hasOwn(d, campo), false, campo);
  }
});

/*
 * F3-42 (25/09/2026): le card del diagramma mostrano modello e durata di OGNI passo di una pagina (mockup 14 e 200) ⇒ le RIGHE
 * di un run portano gli stessi derivati del dettaglio, calcolati con una passata sola; le righe PIANIFICATE portano il modello
 * scelto e l'anteprima del compito; le righe di un run restano senza compito (WF-HTTP-SECRET-OMISSION).
 */
test('WF-ROW-DERIVED: run rows carry the derived facts of their own step, with one pass over the journal', () => {
  const fatti = [
    fatto(1, 'activity_started', 'a', '2026-09-25T11:36:24.466Z'),
    fatto(2, 'agent_session_created', 'a', '2026-09-25T11:36:24.588Z', SESSIONE),
    fatto(3, 'activity_started', 'b', '2026-09-25T11:36:25.000Z'),
    fatto(4, 'activity_completed', 'a', '2026-09-25T11:36:36.409Z'),
  ];
  let passate = 0;
  class Registro extends Array { [Symbol.iterator]() { passate += 1; return super[Symbol.iterator](); } }
  const pagina = projectWorkflowGroupPage(input(Registro.from(fatti)), { phaseId: 'f' });
  assert.equal(passate, 1, 'one pass over the journal for the whole page');
  const [a, b] = pagina.items;
  assert.deepEqual([a.startedAt, a.finishedAt, a.durationMs, a.stepSessionId], ['2026-09-25T11:36:24.466Z', '2026-09-25T11:36:36.409Z', 11_943, SESSIONE.sessionId]);
  assert.deepEqual(a.effectiveModel, { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' });
  assert.deepEqual([b.startedAt, b.durationMs, b.effectiveModel], ['2026-09-25T11:36:25.000Z', null, null], 'a step does not borrow the facts of another');
  for (const riga of pagina.items) assert.equal(Object.hasOwn(riga, 'taskPreview'), false, 'no task in a run row');
  assert.doesNotMatch(JSON.stringify(pagina), /Fai a\.|instructions/u);
  // il fotogramma dal vivo porta le stesse righe
  const aggiornamento = projectWorkflowRunUpdate(input(fatti), { afterSeq: 3 });
  assert.deepEqual(aggiornamento.nodes.map((riga) => [riga.nodeId, riga.durationMs]), [['a', 11_943]]);
});

test('WF-PLANNED-ROW-PREVIEW: planned rows carry the chosen model and the first line of the task, capped', () => {
  const lungo = 'x'.repeat(PLANNED_TASK_PREVIEW_MAX + 20);
  const core = { schema: 'talos.workflow-definition-core.v2', phases: [{ id: 'f', label: 'F' }], edges: [], nodes: [
    { ...nodo('a'), instructions: '\n   \r\n  Riassumi le note della riunione.  \nPoi elenca le decisioni.', modelPolicy: { mode: 'session' } },
    { ...nodo('b'), instructions: lungo, modelPolicy: { mode: 'explicit', model: 'z-ai/glm-5.3-flash' } },
  ] };
  const pagina = projectPlannedWorkflowGroupPage({ workflowId: 'w', version: 1, definitionHash: 'sha256:x', core }, { phaseId: 'f' });
  const [a, b] = pagina.items;
  assert.equal(a.taskPreview, 'Riassumi le note della riunione.');
  assert.equal(a.model, null, 'null = the session model');
  assert.equal(b.model, 'z-ai/glm-5.3-flash');
  assert.equal([...b.taskPreview].length, PLANNED_TASK_PREVIEW_MAX);
  assert.ok(b.taskPreview.endsWith('…'));
  for (const riga of pagina.items) assert.equal(Object.hasOwn(riga, 'durationMs'), false, 'nothing happened yet in a plan');
});

test('WF-GROUP-SORT-STATE: the sample page puts attention and work first, the graph order breaks ties, the default stays the graph order', () => {
  const nodi = ['a', 'b', 'c', 'd', 'e'].map((id, priority) => ({ ...nodo(id), priority }));
  const stati = { a: 'succeeded', b: 'pending', c: 'running', d: 'failed', e: 'running' };
  const run = { state: { definition: { schema: 'talos.workflow-definition-core.v2', phases: [{ id: 'f', label: 'F' }], nodes: nodi, edges: [] },
    nodes: new Map(Object.entries(stati).map(([nodeId, state]) => [nodeId, { nodeId, state }])), lastSeq: 0, run: { runId: 'r', graphVersion: 1, status: 'running' } }, events: [] };
  const perStato = projectWorkflowGroupPage(run, { phaseId: 'f', limit: 4, sort: 'stato' });
  assert.deepEqual(perStato.items.map((r) => r.nodeId), ['d', 'c', 'e', 'b']);
  assert.equal(perStato.sort, 'stato');
  assert.equal(perStato.total, 5);
  assert.deepEqual(projectWorkflowGroupPage(run, { phaseId: 'f' }).items.map((r) => r.nodeId), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(Object.hasOwn(projectWorkflowGroupPage(run, { phaseId: 'f' }), 'sort'), false);
  assert.throws(() => projectWorkflowGroupPage(run, { phaseId: 'f', sort: 'nome' }), /sort/u);
});

test('WF-OVERVIEW-ROLE-TALLY: each phase carries the count of its roles and kinds, keys sorted (D28)', () => {
  const nodi = [{ ...nodo('a'), role: 'tester', kind: 'test' }, { ...nodo('b'), role: 'researcher' }, { ...nodo('c'), role: null, kind: 'artifact' }];
  const panoramica = projectWorkflowOverview({ state: { definition: { schema: 'talos.workflow-definition-core.v2', phases: [{ id: 'f', label: 'F' }], nodes: nodi, edges: [] },
    nodes: new Map(), lastSeq: 0, run: { runId: 'r', graphVersion: 1, status: 'running' } }, events: [] });
  assert.deepEqual(panoramica.groups[0].roles, { researcher: 1, tester: 1 });
  assert.deepEqual(panoramica.groups[0].kinds, { agent: 1, artifact: 1, test: 1 });
  assert.deepEqual(Object.keys(panoramica.groups[0].kinds), ['agent', 'artifact', 'test']);
});

test('WF-RUN-CONTROL-FLAGS: the run views say when a pause or a cancel is requested and not done yet (F3-52)', () => {
  const conRun = (run) => ({ ...input([]), state: { ...input([]).state, run: { runId: 'r', graphVersion: 1, status: 'running', ...run } } });
  const libero = projectWorkflowOverview(conRun({}));
  assert.deepEqual([libero.pauseRequested, libero.cancelRequested], [false, false]);
  const inPausa = projectWorkflowOverview(conRun({ pauseRequested: true }));
  assert.deepEqual([inPausa.status, inPausa.pauseRequested, inPausa.cancelRequested], ['running', true, false]);
  assert.equal(projectWorkflowRunUpdate(conRun({ cancelRequested: true }), { afterSeq: 0 }).cancelRequested, true, 'the live frame says it too');
  assert.equal(projectWorkflowGroupPage(conRun({ pauseRequested: true }), { phaseId: 'f' }).pauseRequested, true);
  // una vista pianificata non ha un run: niente segnali inventati
  const piano = projectWorkflowOverview(input([], { planned: true }));
  assert.equal(Object.hasOwn(piano, 'pauseRequested'), false);
});

test('WF-GROUP-SORT-BLOCKED: a blocked step sorts with the waiting ones, not after the finished ones (F3-52, real run)', () => {
  const stati = { a: 'succeeded', b: 'blocked' };
  const base = input([]);
  const conStati = { ...base, state: { ...base.state, nodes: new Map(Object.entries(stati).map(([id, state]) => [id, { nodeId: id, state }])) } };
  const pagina = projectWorkflowGroupPage(conStati, { phaseId: 'f', sort: 'stato' });
  assert.deepEqual(pagina.items.map((r) => r.nodeId), ['b', 'a']);
});
