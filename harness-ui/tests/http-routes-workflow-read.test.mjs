import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { appendEvent, approveDefinition, createDefinition, createRun, createWorkflowStore } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const rootSessionId = '40000000-0000-4000-8000-000000000001';
const otherSessionId = '40000000-0000-4000-8000-000000000002';
const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));

async function startApp(t, workflowStore) {
  const registry = { leggiSessioneContesto: (id) => [rootSessionId, otherSessionId].includes(id) ? { sessionId: id } : null };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function realStore(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-http-read-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definition });
  await approveDefinition(store, { approval });
  const runId = '10000000-0000-4000-8000-000000000001';
  await createRun(store, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId, seq: 1, at: '2026-09-23T10:00:00.000Z', type: 'run_created',
    nodeId: null, commandId: randomUUID(), commandType: 'start-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`, causationId: null, correlationId: runId,
    graphVersion: 1, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: definition.workflowId, definitionVersion: definition.version,
      definitionHash: definition.definitionHash, rootSessionId, workspaceBaselineId: null, workspaceBaselineHash: null },
  } });
  return { store, runId };
}

test('WF-HTTP-STORE-UNAVAILABLE: il server dichiara Workflow non configurato', async (t) => {
  const base = await startApp(t, null);
  const response = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'WORKFLOW_STORE_UNAVAILABLE');
});

test('WF-HTTP-OWNER-ISOLATION / ETag: Store reale, run autorizzato e 304', async (t) => {
  const { store, runId } = await realStore(t);
  const base = await startApp(t, store);
  const collection = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows`);
  assert.equal(collection.status, 200);
  assert.deepEqual((await collection.json()).data.items.map((item) => item.runId), [runId]);
  const url = `${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/graph`;
  const first = await fetch(url);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.match(etag, /^"sha256:/);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('etag'), etag);
  assert.equal(await head.text(), '');
  const firstBody = await first.json();
  assert.equal(firstBody.data.schema, 'talos.workflow-graph-view.v2');
  assert.equal(firstBody.data.phaseSource, 'legacy-unassigned');
  assert.doesNotMatch(JSON.stringify(firstBody), /instructions|workspacePolicy|capabilityProfile/);
  const unchanged = await fetch(url, { headers: { 'If-None-Match': etag } });
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  const weak = await fetch(url, { headers: { 'If-None-Match': `W/${etag}` } });
  assert.equal(weak.status, 304);
  const foreign = await fetch(`${base}/api/v1/sessions/${otherSessionId}/workflows/${runId}/graph`);
  assert.equal(foreign.status, 404);
  const group = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/groups/legacy-unassigned?offset=0&limit=1`);
  assert.equal(group.status, 200);
  assert.ok((await group.json()).data.items.length <= 1);
  const duplicate = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/groups/legacy-unassigned?offset=0&offset=1`);
  assert.equal(duplicate.status, 400);
  // F3-42: la pagina di fase ordinata per stato (il campione del gruppo aperto); un altro valore o due `sort` sono 400
  const perStato = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/groups/legacy-unassigned?offset=0&limit=4&sort=stato`);
  assert.equal(perStato.status, 200);
  assert.equal((await perStato.json()).data.sort, 'stato');
  for (const query of ['?sort=nome', '?sort=stato&sort=stato']) {
    assert.equal((await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/groups/legacy-unassigned${query}`)).status, 400, query);
  }
  await appendEvent(store, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId, seq: 2, at: '2026-09-23T10:00:01.000Z', type: 'budget_overrun_observed',
    nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
    causationId: null, correlationId: runId, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { reservationId: null, source: 'provider_receipt', dimensions: ['toolCalls'],
      observed: { promptTokens: 0, completionTokens: 0, wallMs: 0, agentSeconds: 0,
        toolCalls: 1, modelRequests: 0, knownCostUsd: null } },
  } });
  const changed = await fetch(url, { headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('etag'), etag);
  assert.equal((await changed.json()).data.lastSeq, 2);
});

test('WF-HTTP-RUN-ORDER: run piu recente prima, createdAt dal fatto verificato e non da UUID', async (t) => {
  const { store, runId: olderId } = await realStore(t);
  const newerId = 'f0000000-0000-4000-8000-000000000001';
  await createRun(store, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId: newerId, seq: 1, at: '2026-09-23T11:00:00.000Z', type: 'run_created',
    nodeId: null, commandId: randomUUID(), commandType: 'start-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`, causationId: null, correlationId: newerId,
    graphVersion: 1, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: definition.workflowId, definitionVersion: definition.version,
      definitionHash: definition.definitionHash, rootSessionId,
      workspaceBaselineId: null, workspaceBaselineHash: null },
  } });
  const base = await startApp(t, store);
  const response = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows?offset=0&limit=1`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.total, 2);
  assert.equal(body.data.nextOffset, 1);
  // F3 Workflow UI (25/09): la riga porta anche il workflow e lo stato, perché la card della proposta ritrovi il suo run
  const legame = { workflowId: definition.workflowId, version: definition.version, status: 'created' };
  assert.deepEqual(body.data.items.map(({ runId, createdAt, workflowId, version, status }) => ({ runId, createdAt, workflowId, version, status })),
    [{ runId: newerId, createdAt: '2026-09-23T11:00:00.000Z', ...legame }]);
  const second = await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows?offset=1&limit=1`);
  assert.deepEqual((await second.json()).data.items.map(({ runId, createdAt, workflowId, version, status }) => ({ runId, createdAt, workflowId, version, status })),
    [{ runId: olderId, createdAt: '2026-09-23T10:00:00.000Z', ...legame }]);
});

test('WF-GRAPH-HTTP-EDGE-OWNER — real Store edge page respects owner, query bounds, HEAD and ETag', async (t) => {
  const { store, runId } = await realStore(t);
  const base = await startApp(t, store);
  const url = `${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/edges?offset=0&limit=1`;
  const response = await fetch(url);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.schema, 'talos.workflow-graph-view.v2');
  assert.equal(body.data.items.length, 1);
  assert.deepEqual(Object.keys(body.data.items[0]).sort(), ['edgeId', 'fromNodeId', 'toNodeId', 'type']);
  const etag = response.headers.get('etag');
  assert.match(etag, /^"sha256:/);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('etag'), etag);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(url, { headers: { 'If-None-Match': etag } })).status, 304);
  assert.equal((await fetch(url.replace(rootSessionId, otherSessionId))).status, 404);
  for (const query of ['limit=101', 'offset=-1', 'offset=0&offset=1', 'surprise=1']) {
    assert.equal((await fetch(`${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}/edges?${query}`)).status, 400);
  }
});

test('WF-PHASE-STORE-RESTART — v2 phase and edge facts survive Store close/reopen and HTTP projection', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-phase-restart-'));
  const options = { workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } };
  let store = await createWorkflowStore(options);
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const record = structuredClone(definition);
  record.version = 2;
  record.core.schema = 'talos.workflow-definition-core.v2';
  record.core.definitionSchemaVersion = 2;
  record.core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  for (const node of record.core.nodes) node.phaseId = node.id === 'test' ? 'verification' : 'implementation';
  record.definitionHash = canonicalHash(record.core);
  const approved = structuredClone(approval);
  approved.version = record.version;
  approved.definitionHash = record.definitionHash;
  approved.commandPayloadHash = canonicalHash({
    schema: 'talos.workflow-command-dedupe.v1', commandType: 'approve-definition',
    target: { workflowId: record.workflowId, definitionVersion: record.version,
      runId: null, nodeId: null, requestId: null },
    payload: { definitionHash: record.definitionHash },
  });
  await createDefinition(store, { record });
  await approveDefinition(store, { approval: approved });
  const runId = '10000000-0000-4000-8000-000000000099';
  await createRun(store, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId, seq: 1, at: '2026-09-23T12:00:00.000Z', type: 'run_created',
    nodeId: null, commandId: randomUUID(), commandType: 'start-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`, causationId: null, correlationId: runId,
    graphVersion: 1, activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: record.workflowId, definitionVersion: record.version,
      definitionHash: record.definitionHash, rootSessionId,
      workspaceBaselineId: null, workspaceBaselineHash: null },
  } });
  await store.close();
  store = await createWorkflowStore(options);
  const base = await startApp(t, store);
  const prefix = `${base}/api/v1/sessions/${rootSessionId}/workflows/${runId}`;
  const graph = await fetch(`${prefix}/graph`);
  assert.equal(graph.status, 200);
  const view = (await graph.json()).data;
  assert.equal(view.phaseSource, 'explicit');
  assert.deepEqual(view.groups.map((group) => group.phaseId), ['implementation', 'verification']);
  assert.deepEqual(view.groupConnections.map((connection) => connection.total), [1]);
  const edges = await fetch(`${prefix}/edges`);
  assert.equal(edges.status, 200);
  assert.equal((await edges.json()).data.items[0].edgeId, 'implement_to_test');
});
