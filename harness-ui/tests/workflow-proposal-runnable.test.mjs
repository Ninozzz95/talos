// Riparazione D1, 24/09/2026 — portato qui dalla revisione avversaria del 23/09
// (`tests/red/rev-wf-proposed-workflow-runnable-red.test.mjs`). planning-control.mjs conia il
// workflowId di una proposta come UUIDv8 name-based SHA-256 (RFC 9562 §6.5), e il contratto eventi
// validava run_created.payload.workflowId come solo v4: una proposta approvata non poteva mai
// diventare un run. Ora run_created accetta lo stesso insieme di versioni della Definition (v1-8).
// Il caso prova anche la RILETTURA dopo un riavvio dello Store: il vincolo è che le proposte già
// salvate (v8) restino leggibili e avviabili.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { createRun, createWorkflowStore, readEvents, readRunState } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '82000000-0000-4000-8000-000000000001';
const coreV1 = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));

test('WF-PROPOSED-DEFINITION-CAN-CREATE-RUN: an approved model proposal becomes a run and replays after restart', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-proposal-run-'));
  const open = () => createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  let store = await open();
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const core = structuredClone(coreV1);
  core.schema = 'talos.workflow-definition-core.v2'; core.definitionSchemaVersion = 2;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation'; core.nodes[1].phaseId = 'verification';
  const proposed = await proposeWorkflowFromTool(store, { sessionId, toolCallId: 'call-1', core, plannerModel: null,
    sessionModel: 'provider/model', modalitaOperativa: 'normale', agentRole: 'root' }); /* F3-10 (23/09/2026): il modo «Workflow» è ritirato; la proposta nasce dal root in Normale. */
  await approveWorkflowProposal(store, { workflowId: proposed.workflowId, version: 1, definitionHash: proposed.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: () => true });
  const runId = randomUUID();
  await createRun(store, { event: {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1, eventId: randomUUID(), runId, seq: 1,
    at: '2026-09-23T10:00:00.000Z', type: 'run_created', nodeId: null, commandId: randomUUID(), commandType: 'start-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`, causationId: null, correlationId: runId, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload: { workflowId: proposed.workflowId, definitionVersion: 1, definitionHash: proposed.definitionHash,
      rootSessionId: sessionId, workspaceBaselineId: null, workspaceBaselineHash: null },
  } });
  assert.match(proposed.workflowId, /^[0-9a-f]{8}-[0-9a-f]{4}-8/u);
  await store.close();
  store = await open();
  const events = await readEvents(store, { runId });
  assert.equal(events[0].payload.workflowId, proposed.workflowId);
  assert.equal((await readRunState(store, { runId })).state.run.runId, runId);
});
