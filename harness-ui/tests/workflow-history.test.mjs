import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { appendEvent, approveDefinition, createDefinition, createRun, createWorkflowStore } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '40000000-0000-4000-8000-000000000001';
const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));

async function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-history-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definition });
  await approveDefinition(store, { approval });
  const server = createServer(createHttpApp({ staticHandler: async () => null, workflowStore: store,
    sessionRegistry: { leggiSessioneContesto: (id) => id === sessionId ? { sessionId: id } : null } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${sessionId}/workflows`;
  const created = async (runId, at) => {
    const event = { schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
      eventId: randomUUID(), runId, seq: 1, at, type: 'run_created', nodeId: null,
      commandId: randomUUID(), commandType: 'start-run', commandPayloadHash: `sha256:${'c'.repeat(64)}`,
      causationId: null, correlationId: runId, graphVersion: 1,
      activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
      payload: { workflowId: definition.workflowId, definitionVersion: definition.version,
        definitionHash: definition.definitionHash, rootSessionId: sessionId, workspaceBaselineId: null, workspaceBaselineHash: null } };
    await createRun(store, { event });
    return event;
  };
  const next = async (prior, type, at, payload = {}) => appendEvent(store, { event: {
    ...prior, eventId: randomUUID(), seq: prior.seq + 1, at, type,
    commandId: null, commandType: null, commandPayloadHash: null, payload,
  } });
  return { base, created, next };
}

test('WF-HISTORY-METADATA/UNKNOWN-MODEL: only verified title, facts and measurable duration are exposed', async (t) => {
  const { base, created, next } = await setup(t);
  const id = '10000000-0000-4000-8000-000000000001';
  const first = await created(id, '2026-09-28T10:00:00.000Z');
  await next(first, 'run_started', '2026-09-28T10:00:01.000Z');
  await next({ ...first, seq: 2 }, 'run_failed', '2026-09-28T10:00:04.000Z', { errorClass: 'internal', evidenceResultIds: [] });
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const [item] = (await response.json()).data.items;
  assert.equal(item.title, definition.core.title);
  assert.equal(item.startedAt, '2026-09-28T10:00:01.000Z');
  assert.equal(item.finishedAt, '2026-09-28T10:00:04.000Z');
  assert.equal(item.durationMs, 3000);
  assert.equal(item.model, 'unknown');
  assert.equal(item.steps.total, definition.core.nodes.length);
  assert.equal(item.steps.terminal, 0);
  assert.equal(item.status, 'failed');
  assert.doesNotMatch(JSON.stringify(item), /instructions|workspacePolicy|capabilityProfile/u);
});

test('WF-HISTORY-FILTER-BEFORE-PAGE/QUERY-INVALID: counts and cursor describe filtered runs', async (t) => {
  const { base, created, next } = await setup(t);
  const failedId = '10000000-0000-4000-8000-000000000001';
  const otherId = '10000000-0000-4000-8000-000000000002';
  const first = await created(failedId, '2026-09-28T10:00:00.000Z');
  await next(first, 'run_started', '2026-09-28T10:00:01.000Z');
  await next({ ...first, seq: 2 }, 'run_failed', '2026-09-28T10:00:04.000Z', { errorClass: 'internal', evidenceResultIds: [] });
  await created(otherId, '2026-09-28T11:00:00.000Z');
  const filtered = await fetch(`${base}?stato=failed&offset=0&limit=1`);
  assert.equal(filtered.status, 200);
  const data = (await filtered.json()).data;
  assert.deepEqual(data.items.map((item) => item.runId), [failedId]);
  assert.equal(data.total, 1);
  assert.equal(data.nextOffset, null);
  const searched = await fetch(`${base}?q=${failedId}&limit=1`);
  assert.deepEqual((await searched.json()).data.items.map((item) => item.runId), [failedId]);
  for (const query of ['?stato=unknown', '?stato=failed&stato=created', '?q=x&q=y', '?q=' + 'x'.repeat(257)]) {
    assert.equal((await fetch(`${base}${query}`)).status, 400, query);
  }
});
