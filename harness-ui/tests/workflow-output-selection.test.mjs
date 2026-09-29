import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp } from '../src/http-app.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { approveDefinition, appendEvent, createDefinition, createRun, createWorkflowStore, readRunState } from '../src/workflow/store.mjs';
import { projectWorkflowNodeDetail } from '../src/workflow/read-model.mjs';
import { creaOnWorkflowFn } from '../src/workflow/per-il-modello.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const definitionRecord = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const SESSION_ID = '40000000-0000-4000-8000-000000000001';
const BINARIO = Buffer.from([0, 255, 1, 2, 128, 10]);
const UTF8_ROTTO = Buffer.from([0xC3, 0x28]);

function event(runId, seq, type, payload = {}, overrides = {}) {
  return { schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId, seq, at: `2026-09-28T13:00:${String(seq).padStart(2, '0')}.000Z`, type,
    nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
    causationId: null, correlationId: runId, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null, payload, ...overrides };
}

async function banco(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-wf-output-selection-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definitionRecord });
  await approveDefinition(store, { approval });
  const runId = randomUUID();
  await createRun(store, { event: event(runId, 1, 'run_created', {
    workflowId: definitionRecord.workflowId, definitionVersion: definitionRecord.version,
    definitionHash: definitionRecord.definitionHash, rootSessionId: SESSION_ID,
    workspaceBaselineId: null, workspaceBaselineHash: null,
  }, { commandId: randomUUID(), commandType: 'start-run', commandPayloadHash: `sha256:${'d'.repeat(64)}` }) });
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  const results = [
    { kind: 'text', contentType: 'text/plain; charset=utf-8', bytes: Buffer.from('PRIMO-CREATO'), summary: 'PRIMO-CREATO' },
    { kind: 'text', contentType: 'text/plain; charset=utf-8', bytes: Buffer.from('SECONDO-CREATO'), summary: 'SECONDO-CREATO' },
    { kind: 'artifact', contentType: 'application/octet-stream', bytes: BINARIO, summary: 'BINARIO' },
    { kind: 'text', contentType: 'text/plain; charset=utf-8', bytes: UTF8_ROTTO, summary: 'UTF8-ROTTO' },
    ...Array.from({ length: 19 }, (_, i) => ({ kind: 'text', contentType: 'text/plain; charset=utf-8',
      bytes: Buffer.from(`EXTRA-${i}`), summary: `EXTRA-${i}` })),
  ].map((result) => ({ ...result, trust: 'untrusted', sensitivity: 'workspace', eligibleForIntegration: false,
    provenance: { workspaceBaselineHash: null, inputHash: `sha256:${'e'.repeat(64)}`, model: null, provider: null, toolVersions: {} } }));
  const orchestrator = createWorkflowOrchestrator({ store, adapters: new Map([['agent-session', {
    id: 'selection-test-adapter',
    async execute() { return { status: 'completed', receiptRef: `receipt://result/${randomUUID()}`, results }; },
    async reconcile() { return { outcome: 'still_unknown', receiptRef: null, resultIds: [] }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; },
  }]]), nowFn: () => '2026-09-28T13:10:00.000Z', idFn: randomUUID });
  await orchestrator.recover({ runIds: [runId] });
  const executed = await orchestrator.executeNode({ runId, nodeId: 'implement', activityKind: 'agent-session', resourceClass: 'agent',
    idempotencyKey: `${runId}/implement/1`, budgetReservationId: null, deadlineAt: null });
  assert.equal(executed.status, 'completed');
  const input = await readRunState(store, { runId });
  assert.equal(input.state.nodes.get('implement').resultRefIds.length, 23);
  const refs = [...input.state.resultRefs.values()];
  const find = (summary) => refs.find((ref) => ref.summary === summary);
  const registry = { leggiSessioneContesto: (id) => id === SESSION_ID ? { sessionId: id } : null };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore: store }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${SESSION_ID}/workflows/${runId}/nodes/implement/output`;
  return { store, runId, input, find, url };
}

test('F-014-SELECT: indice esplicito, scelta per ID, byte grezzi e pagina oltre i primi 20', async (t) => {
  const { store, runId, input, find, url } = await banco(t);
  const callback = creaOnWorkflowFn({ store, runtimeFn: () => null });
  const args = { runId, nodeId: 'implement' };
  const indice = await callback('workflow_output', args, { rootSessionId: SESSION_ID });
  assert.match(indice, /23 recorded outputs/u);
  assert.match(indice, /PRIMO-CREATO/u);
  assert.match(indice, /SECONDO-CREATO/u);
  assert.doesNotMatch(indice, /showing the latest/u);

  const primo = await callback('workflow_output', { ...args, resultId: find('PRIMO-CREATO').id }, { rootSessionId: SESSION_ID });
  assert.match(primo, /PRIMO-CREATO/u);
  assert.doesNotMatch(primo, /SECONDO-CREATO/u);
  await assert.rejects(() => callback('workflow_output', { ...args, resultId: randomUUID() }, { rootSessionId: SESSION_ID }));
  const binaryInfo = await callback('workflow_output', { ...args, resultId: find('BINARIO').id }, { rootSessionId: SESSION_ID });
  assert.match(binaryInfo, /not text|binary|raw/iu);
  assert.doesNotMatch(binaryInfo, /�/u);
  const malformed = await callback('workflow_output', { ...args, resultId: find('UTF8-ROTTO').id }, { rootSessionId: SESSION_ID });
  assert.match(malformed, /invalid UTF-8|raw/iu);
  assert.doesNotMatch(malformed, /�/u);

  const httpIndex = await (await fetch(url)).json();
  assert.equal(httpIndex.data.results.length, 23);
  assert.equal(httpIndex.data.results.find((x) => x.resultId === find('BINARIO').id).bytes, BINARIO.length);
  const alien = await fetch(`${url}?resultId=${randomUUID()}`);
  assert.equal(alien.status, 404);
  const raw = await fetch(`${url}?resultId=${find('BINARIO').id}&format=raw`);
  assert.equal(raw.status, 200);
  assert.match(raw.headers.get('content-disposition'), /^attachment;/u);
  assert.equal(raw.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await raw.arrayBuffer()), BINARIO);
  const brokenRaw = await fetch(`${url}?resultId=${find('UTF8-ROTTO').id}&format=raw`);
  assert.deepEqual(Buffer.from(await brokenRaw.arrayBuffer()), UTF8_ROTTO);

  const detail = projectWorkflowNodeDetail(input, { nodeId: 'implement' });
  assert.equal(detail.outputs.length, 20);
  assert.equal(detail.totalOutputs, 23);
  assert.equal(detail.nextOutputOffset, 20);
  const next = projectWorkflowNodeDetail(input, { nodeId: 'implement', outputOffset: 20 });
  assert.equal(next.outputs.length, 3);
  assert.equal(next.nextOutputOffset, null);
  const nextHttp = await (await fetch(`${url.slice(0, -'/output'.length)}?outputOffset=20`)).json();
  assert.equal(nextHttp.data.outputs.length, 3);
});
