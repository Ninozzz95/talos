// Riparazione D3, 24/09/2026 — portato qui dalla revisione avversaria del 23/09
// (`tests/red/rev-wf-admission-not-performed-red.test.mjs`). Un'Activity riconciliata
// «proved_not_performed» deve liberare slot globale e riserva di budget con
// budget_released(reason='reconciled_not_performed'), con o senza receiptRef; prima restava
// bloccata (receiptRef null) o scriveva capacity_released e poi falliva il saldo (receiptRef presente).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { appendEvent, approveDefinition, createDefinition, createRun, createWorkflowStore, readEvents } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const definitionRecord = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const ROOT = '40000000-0000-4000-8000-000000000001';
const ev = (runId, seq, type, payload = {}, o = {}) => ({ schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
  eventId: randomUUID(), runId, seq, at: `2026-09-22T13:00:${String(seq).padStart(2, '0')}.000Z`, type, nodeId: null,
  commandId: null, commandType: null, commandPayloadHash: null, causationId: null, correlationId: runId, graphVersion: 1,
  activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null, payload, ...o });
const created = (runId) => ev(runId, 1, 'run_created', { workflowId: definitionRecord.workflowId, definitionVersion: definitionRecord.version,
  definitionHash: definitionRecord.definitionHash, rootSessionId: ROOT, workspaceBaselineId: null, workspaceBaselineHash: null },
{ commandId: randomUUID(), commandType: 'start-run', commandPayloadHash: `sha256:${'d'.repeat(64)}` });
const capacity = () => ({ globalAgents: 1, globalWriters: 0, localProcesses: 0, perProvider: new Map([['openai', 1]]),
  perModel: new Map([['openai', new Map([['gpt-5-nano', 1]])]]), perWorkspaceWriters: new Map() });
const admission = (runId) => ({ runId, nodeId: 'implement', provider: 'openai', model: 'gpt-5-nano', workspaceRoot: null,
  agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  reserved: { promptTokens: 60_000, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null } });

for (const receiptRef of [null, 'receipt://provider/not-performed']) {
  test(`WF-ADMISSION-NOT-PERFORMED-FREES-SLOT (receiptRef=${receiptRef})`, async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'talos-workflow-not-performed-'));
    const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
    t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
    await createDefinition(store, { record: definitionRecord });
    await approveDefinition(store, { approval });
    const runId = randomUUID(); const second = randomUUID();
    for (const id of [runId, second]) { await createRun(store, { event: created(id) }); await appendEvent(store, { event: ev(id, 2, 'run_started') }); }
    const agent = { id: 'agent-integration-adapter',
      async execute() { return { status: 'uncertain', reasonClass: 'transport_ambiguous', observedReceiptRef: null, actualUsage: null }; },
      async reconcile() { return { outcome: 'proved_not_performed', receiptRef, resultIds: [], actualUsage: null }; },
      async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; } };
    const orch = createWorkflowOrchestrator({ store, adapters: new Map([['agent-session', agent]]), capacityFn: capacity });
    await orch.recover();
    const admitted = await orch.admitActivity(admission(runId));
    const out = await orch.executeNode({ runId, nodeId: 'implement', activityKind: 'agent-session', resourceClass: 'agent',
      idempotencyKey: `${runId}/implement/1`, budgetReservationId: admitted.budgetReservationId, deadlineAt: null,
      preparedIdentity: admitted.preparedIdentity });
    assert.equal(out.status, 'uncertain');
    const rec = await orch.reconcileActivity({ runId, activityExecutionId: admitted.preparedIdentity.activityExecutionId });
    assert.equal(rec.outcome, 'proved_not_performed');
    // Atteso dal contratto (budget.mjs:RELEASE_REASONS 'reconciled_not_performed'): lo slot si libera.
    await orch.releaseAdmission({ runId, claimId: admitted.claimId });
    const facts = await readEvents(store, { runId });
    assert.equal(facts.filter((e) => e.type === 'capacity_released').length, 1);
    assert.deepEqual(facts.filter((e) => e.type === 'budget_released').map((e) => e.payload.reason), ['reconciled_not_performed']);
    assert.equal(facts.filter((e) => e.type === 'budget_settled').length, 0);
    // Il rilascio è idempotente: una seconda chiamata (ripresa dopo un crash) non scrive altro.
    await orch.releaseAdmission({ runId, claimId: admitted.claimId });
    assert.equal((await readEvents(store, { runId })).length, facts.length);
    const next = await orch.admitActivity(admission(second));
    assert.equal(typeof next.claimId, 'string');
  });
}
