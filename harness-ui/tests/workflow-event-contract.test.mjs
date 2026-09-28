import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import {
  WORKFLOW_EVENT_TYPES,
  WorkflowContractError,
  validateWorkflowEvent,
  validateWorkflowJournalRecord,
} from '../src/workflow/contract.mjs';

const RUN_ID = '10000000-0000-4000-8000-000000000001';
const EVENT_ID = '20000000-0000-4000-8000-000000000001';
const NODE_ID = 'implement';
const HASH = `sha256:${'a'.repeat(64)}`;
const CAPACITY_IDENTITY = Object.freeze({
  nodeId: NODE_ID,
  activityExecutionId: '50000000-0000-4000-8000-000000000001',
  attempt: 1,
  leaseId: '60000000-0000-4000-8000-000000000001',
  leaseEpoch: 1,
});
const CAPACITY_CLAIM = Object.freeze({
  schema: 'talos.workflow-capacity-claim.v1',
  claimId: '70000000-0000-4000-8000-000000000001',
  budgetReservationId: '80000000-0000-4000-8000-000000000001',
  provider: null,
  model: null,
  workspaceRoot: 'C:\\workspace',
  agentSlots: 0,
  writerSlots: 1,
  localProcessSlots: 0,
});

function event(type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1',
    eventSchemaVersion: 1,
    engineSchemaVersion: 1,
    eventId: EVENT_ID,
    runId: RUN_ID,
    seq: 1,
    at: '2026-09-22T10:00:00.000Z',
    type,
    nodeId: null,
    commandId: null,
    commandType: null,
    commandPayloadHash: null,
    causationId: null,
    correlationId: RUN_ID,
    graphVersion: 1,
    activityExecutionId: null,
    attempt: null,
    leaseId: null,
    leaseEpoch: null,
    payload,
    ...overrides,
  };
}

const rejects = (value, pattern = /event/i) => assert.throws(
  () => validateWorkflowEvent(value),
  (error) => error instanceof WorkflowContractError && pattern.test(error.message),
);

test('EVENT-TYPE-CLOSED-SET / EVENT-NO-NODE-READY-DURABLE / EVENT-NO-NODE-LEASED-DURABLE', () => {
  assert.equal(WORKFLOW_EVENT_TYPES.length, 55);
  assert.equal(new Set(WORKFLOW_EVENT_TYPES).size, WORKFLOW_EVENT_TYPES.length);
  assert.equal(WORKFLOW_EVENT_TYPES.includes('node_ready'), false);
  assert.equal(WORKFLOW_EVENT_TYPES.includes('node_leased'), false);
  rejects(event('future_event'), /type|unknown/i);
});

test('CAPACITY-V2-CLAIM-CONTRACT-STRICT / CAPACITY-V1-CANNOT-SMUGGLE-CLAIM', () => {
  const claimed = event('capacity_claimed', CAPACITY_CLAIM, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...CAPACITY_IDENTITY,
  });
  assert.equal(validateWorkflowEvent(claimed), claimed);
  assert.equal(validateWorkflowEvent({ ...claimed, payload: { ...CAPACITY_CLAIM, workspaceRoot: '/srv/workspace' } }).type, 'capacity_claimed');
  assert.equal(validateWorkflowEvent({ ...claimed, payload: { ...CAPACITY_CLAIM, workspaceRoot: '\\\\server\\share\\workspace' } }).type, 'capacity_claimed');
  rejects({ ...claimed, schema: 'talos.workflow-event.v1', eventSchemaVersion: 1 }, /version|capacity|schema/i);
  rejects({ ...claimed, payload: { ...CAPACITY_CLAIM, unexpected: 1 } }, /unknown|field|payload/i);
  rejects({ ...claimed, payload: { ...CAPACITY_CLAIM, writerSlots: 0 } }, /slot|capacity/i);
  rejects({ ...claimed, payload: { ...CAPACITY_CLAIM, workspaceRoot: '../relative' } }, /workspaceRoot|absolute/i);
  rejects({ ...claimed, payload: { ...CAPACITY_CLAIM, workspaceRoot: '\\workspace' } }, /workspaceRoot|absolute|qualified/i);
  rejects({ ...claimed, payload: { ...CAPACITY_CLAIM, provider: 'openai', model: null } }, /provider|model/i);
  rejects({ ...claimed, payload: { ...CAPACITY_CLAIM, writerSlots: 0, agentSlots: 1 } }, /provider|model/i);
  rejects({ ...claimed, leaseId: null }, /activity|lease/i);
  const released = event('capacity_released', { claimId: CAPACITY_CLAIM.claimId, reason: 'activity_terminal' }, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...CAPACITY_IDENTITY,
  });
  assert.equal(validateWorkflowEvent(released), released);
  rejects({ ...released, payload: { ...released.payload, reason: 'timeout' } }, /reason/i);
});

test('USAGE-V2-TERMINAL-PAYLOAD-STRICT / USAGE-V1-PAYLOAD-UNCHANGED', () => {
  const actualUsage = {
    promptTokens: 3, completionTokens: 5, wallMs: 9, agentSeconds: 1,
    toolCalls: 0, modelRequests: 1, knownCostUsd: null,
  };
  const completed = event('activity_completed', {
    resultIds: [], receiptRef: 'receipt://provider/1', actualUsage,
  }, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...CAPACITY_IDENTITY,
  });
  assert.equal(validateWorkflowEvent(completed), completed);
  const unknown = { ...completed, payload: { ...completed.payload, actualUsage: null } };
  assert.equal(validateWorkflowEvent(unknown), unknown);
  rejects({ ...completed, payload: { resultIds: [], receiptRef: 'receipt://provider/1' } }, /actualUsage|missing/i);
  rejects({ ...completed, payload: { ...completed.payload, actualUsage: { ...actualUsage, promptTokens: -1 } } }, /promptTokens|usage/i);
  rejects({ ...completed, schema: 'talos.workflow-event.v1', eventSchemaVersion: 1 }, /actualUsage|unknown|payload/i);
});

test('EVENT-ENVELOPE-STRICT / EVENT-UNKNOWN-PAYLOAD-KEY-REJECTED / EVENT-FUTURE-SCHEMA-REJECTED', () => {
  const started = event('run_started');
  assert.equal(validateWorkflowEvent(started), started);
  rejects({ ...started, extra: true }, /unknown|field/i);
  rejects(event('run_started', { extra: true }), /payload|unknown/i);
  rejects({ ...started, eventSchemaVersion: 2 }, /future|schema/i);
});

test('EVENT-TIMESTAMP-UTC-CANONICAL — durable timestamps reject local offsets and impossible dates', () => {
  const valid = event('run_started');
  assert.equal(validateWorkflowEvent(valid), valid);
  rejects({ ...event('run_started'), at: '2026-09-22T12:00:00+02:00' }, /timestamp|UTC|ISO/i);
  rejects({ ...event('run_started'), at: '2026-02-31T12:00:00.000Z' }, /timestamp|date|ISO/i);
});

test('EVENT-NULLABILITY / EVENT-CORRELATION-RUNID / EVENT-CAUSATION-EVENTID', () => {
  rejects({ ...event('run_started'), correlationId: '10000000-0000-4000-8000-000000000002' }, /correlation/i);
  rejects({ ...event('run_started'), causationId: 'not-an-event-id' }, /causation/i);
  rejects({ ...event('run_started'), commandId: '30000000-0000-4000-8000-000000000001' }, /command.*all|nullability/i);
  rejects({ ...event('node_started', { trigger: 'activity' }), nodeId: null }, /nodeId/i);
});

test('EVENT-COMMAND-HASH-ON-ACCEPTED-MUTATION / EVENT-COMMAND-RECEIPT-DERIVED', () => {
  const accepted = event('run_pause_requested', { reason: 'user' }, {
    commandId: '30000000-0000-4000-8000-000000000001',
    commandType: 'pause-run',
    commandPayloadHash: HASH,
  });
  assert.equal(validateWorkflowEvent(accepted), accepted);
  rejects({ ...accepted, commandType: 'start-run' }, /commandType|command/i);
});

test('EVENT-GRAPH-PATCH-SELF-CONTAINED', () => {
  const operations = [{ op: 'cancel-subgraph', rootNodeId: NODE_ID }];
  const structural = event('graph_patch_applied', {
    patchId: '40000000-0000-4000-8000-000000000001',
    expectedGraphVersion: 1,
    operationsHash: canonicalHash(operations),
    previousGraphVersion: 1,
    newGraphVersion: 2,
    operations,
  }, { graphVersion: 2 });
  assert.equal(validateWorkflowEvent(structural), structural);
  const tampered = structuredClone(structural);
  tampered.payload.operations[0].rootNodeId = 'other';
  rejects(tampered, /operationsHash|hash/i);
});

test('WF-PHASE-GRAPH-EVENT — v2 add-node carries an explicit phase through the journal envelope', async () => {
  const core = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
  const node = { ...core.nodes[0], id: 'new-agent', phaseId: 'verification' };
  const operations = [{ op: 'add-node', node }];
  const patchEvent = event('graph_patch_applied', {
    patchId: '40000000-0000-4000-8000-000000000001', expectedGraphVersion: 1,
    operationsHash: canonicalHash(operations), previousGraphVersion: 1, newGraphVersion: 2, operations,
  }, { graphVersion: 2 });
  assert.equal(validateWorkflowEvent(patchEvent), patchEvent);
  const malformed = structuredClone(patchEvent);
  malformed.payload.operations[0].node.phaseId = '../escape';
  malformed.payload.operationsHash = canonicalHash(malformed.payload.operations);
  rejects(malformed, /phaseId|phase/i);
});

test('EVENT-ACTIVITY-START-BEFORE-EFFECT / EVENT-STALE-COMPLETION-AUDIT-ONLY', () => {
  const activityFields = {
    nodeId: NODE_ID,
    activityExecutionId: '50000000-0000-4000-8000-000000000001',
    attempt: 1,
    leaseId: '60000000-0000-4000-8000-000000000001',
    leaseEpoch: 1,
  };
  const started = event('activity_started', { adapterId: 'test-adapter' }, activityFields);
  assert.equal(validateWorkflowEvent(started), started);
  const stale = event('stale_activity_completion_observed', {
    currentLeaseId: null,
    currentLeaseEpoch: null,
    observedOutcome: 'completed',
    forensicResultIds: [],
  }, activityFields);
  assert.equal(validateWorkflowEvent(stale), stale);
  rejects(event('activity_started', { adapterId: 'test-adapter' }, { nodeId: NODE_ID }), /activity|lease|attempt/i);
});

test('EVENT-BUDGET-DIMENSION-VOCABULARY / EVENT-BUDGET-OVERRUN-FAIL-CLOSED', () => {
  const observed = {
    promptTokens: 1, completionTokens: 2, wallMs: 3, agentSeconds: 4,
    toolCalls: 5, modelRequests: 6, knownCostUsd: null,
  };
  const overrun = event('budget_overrun_observed', {
    reservationId: null,
    source: 'provider_receipt',
    dimensions: ['promptTokens'],
    observed,
  });
  assert.equal(validateWorkflowEvent(overrun), overrun);
  const alias = structuredClone(overrun);
  alias.payload.observed.tokens = 1;
  rejects(alias, /unknown|dimension|observed/i);
});

test('EVENT-JOURNAL-HASH — journal wrapper binds seq, event and previous record', () => {
  const current = event('run_started');
  const unsigned = { seq: 1, event: current, prevRecordHash: 'GENESIS' };
  const record = { ...unsigned, recordHash: canonicalHash(unsigned) };
  assert.equal(validateWorkflowJournalRecord(record), record);
  rejectsJournal({ ...record, recordHash: HASH }, /recordHash|hash/i);
});

function rejectsJournal(value, pattern) {
  assert.throws(() => validateWorkflowJournalRecord(value), (error) => (
    error instanceof WorkflowContractError && pattern.test(error.message)
  ));
}
