import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import {
  workflowApply,
  workflowInitialState,
  workflowReadyNodes,
  workflowRecover,
  workflowStateHash,
  workflowStateProjection,
} from '../src/workflow/run.mjs';

const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
const RUN_ID = '10000000-0000-4000-8000-000000000001';
let serial = 0;

function next(type, payload = {}, overrides = {}) {
  serial += 1;
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: `20000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    runId: RUN_ID, seq: serial, at: `2026-09-22T10:00:${String(serial).padStart(2, '0')}.000Z`,
    type, nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
    causationId: null, correlationId: RUN_ID, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload, ...overrides,
  };
}

function boot() {
  serial = 0;
  let state = workflowInitialState({ definition, runId: RUN_ID });
  state = workflowApply(state, next('run_created', {
    workflowId: '30000000-0000-4000-8000-000000000001', definitionVersion: 1,
    definitionHash: canonicalHash(definition), rootSessionId: '40000000-0000-4000-8000-000000000001',
    workspaceBaselineId: null, workspaceBaselineHash: null,
  }, {
    commandId: '50000000-0000-4000-8000-000000000001', commandType: 'start-run',
    commandPayloadHash: `sha256:${'b'.repeat(64)}`,
  }));
  state = workflowApply(state, next('run_started'));
  return state;
}

const CAPACITY_ACTIVITY = Object.freeze({
  nodeId: 'implement', activityExecutionId: '60000000-0000-4000-8000-000000000011',
  attempt: 1, leaseId: '70000000-0000-4000-8000-000000000011', leaseEpoch: 1,
});
const CAPACITY_RESERVATION_ID = '80000000-0000-4000-8000-000000000011';
const CAPACITY_CLAIM_ID = '90000000-0000-4000-8000-000000000011';
const ZERO_BUDGET = Object.freeze({ promptTokens: 0, completionTokens: 0, wallMs: 0,
  agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null });

function capacityEvent(type, payload, identity = CAPACITY_ACTIVITY) {
  return next(type, payload, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...identity,
  });
}

function reserveCapacityBudget(state, overrides = {}) {
  return workflowApply(state, next('budget_reserved', {
    schema: 'talos.workflow-budget-reservation.v1', reservationId: CAPACITY_RESERVATION_ID,
    runId: RUN_ID, nodeId: 'implement', activityExecutionId: CAPACITY_ACTIVITY.activityExecutionId,
    leaseId: CAPACITY_ACTIVITY.leaseId, leaseEpoch: CAPACITY_ACTIVITY.leaseEpoch,
    reserved: ZERO_BUDGET, state: 'reserved', actual: null,
    reservedAt: '2026-09-22T10:00:03.000Z', settledAt: null, ...overrides,
  }));
}

function claimCapacity(state, overrides = {}, identity = CAPACITY_ACTIVITY) {
  return workflowApply(state, capacityEvent('capacity_claimed', {
    schema: 'talos.workflow-capacity-claim.v1', claimId: CAPACITY_CLAIM_ID,
    budgetReservationId: CAPACITY_RESERVATION_ID, provider: null, model: null,
    workspaceRoot: 'C:\\workspace', agentSlots: 0, writerSlots: 1, localProcessSlots: 0,
    ...overrides,
  }, identity));
}

function scheduleCapacity(state, identity = CAPACITY_ACTIVITY) {
  return workflowApply(state, capacityEvent('activity_scheduled', {
    activityKind: 'file-write', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
    idempotencyKey: 'capacity/implement/1', resourceClass: 'writer',
    budgetReservationId: CAPACITY_RESERVATION_ID, deadlineAt: null,
  }, identity));
}

function rejectsCapacity(state, operation, pattern) {
  assert.throws(operation, pattern);
  serial = state.lastSeq;
}

test('CAPACITY-V1-STATEHASH-BYTE-COMPAT / CAPACITY-V2-REQUIRES-MATCHING-BUDGET', () => {
  let state = boot();
  const before = workflowStateProjection(state);
  assert.equal(before.schema, 'talos.workflow-state-projection.v1');
  assert.equal(Object.hasOwn(before, 'capacityClaims'), false);
  assert.equal(workflowStateHash(state), canonicalHash(before));
  rejectsCapacity(state, () => claimCapacity(state), /budget|reservation/i);
  state = reserveCapacityBudget(state);
  rejectsCapacity(state, () => claimCapacity(state, {}, { ...CAPACITY_ACTIVITY, leaseEpoch: 2 }), /budget|reservation|identity/i);
  state = claimCapacity(state);
  assert.equal(workflowStateProjection(state).schema, 'talos.workflow-state-projection.v2');
  assert.equal(workflowStateProjection(state).capacityClaims[0].state, 'active');
  assert.throws(() => claimCapacity(state), /claim|duplicate|identity/i);
});

test('CAPACITY-V2-SCHEDULE-REQUIRES-CLAIM-IDENTITY / CAPACITY-RELEASE-TERMINAL-ONLY', () => {
  let state = reserveCapacityBudget(boot());
  rejectsCapacity(state, () => scheduleCapacity(state), /claim|capacity/i);
  state = claimCapacity(state);
  rejectsCapacity(state, () => scheduleCapacity(state, { ...CAPACITY_ACTIVITY, leaseId: '70000000-0000-4000-8000-000000000012' }), /claim|identity|budget/i);
  state = scheduleCapacity(state);
  rejectsCapacity(state, () => workflowApply(state, capacityEvent('capacity_released', {
    claimId: CAPACITY_CLAIM_ID, reason: 'activity_terminal',
  })), /terminal|activity/i);
  state = workflowApply(state, capacityEvent('activity_started', { adapterId: 'writer-adapter' }));
  state = workflowApply(state, capacityEvent('activity_completed', {
    resultIds: [], receiptRef: 'receipt-1', actualUsage: null,
  }));
  state = workflowApply(state, capacityEvent('capacity_released', {
    claimId: CAPACITY_CLAIM_ID, reason: 'activity_terminal',
  }));
  assert.equal(state.capacityClaims.get(CAPACITY_CLAIM_ID).state, 'released');
});

test('ADMISSION-DUPLICATE-NODE-CLAIM — second active claim cannot occupy the same ready node', () => {
  let state = claimCapacity(reserveCapacityBudget(boot()));
  const secondIdentity = {
    nodeId: 'implement', activityExecutionId: '60000000-0000-4000-8000-000000000012',
    attempt: 1, leaseId: '70000000-0000-4000-8000-000000000012', leaseEpoch: 1,
  };
  const secondReservationId = '80000000-0000-4000-8000-000000000012';
  state = reserveCapacityBudget(state, {
    reservationId: secondReservationId,
    activityExecutionId: secondIdentity.activityExecutionId,
    leaseId: secondIdentity.leaseId,
  });
  rejectsCapacity(state, () => claimCapacity(state, {
    claimId: '90000000-0000-4000-8000-000000000012',
    budgetReservationId: secondReservationId,
  }, secondIdentity), /active|claim|node/i);
  assert.equal(state.capacityClaims.get(CAPACITY_CLAIM_ID).state, 'active');
});

test('USAGE-V2-DURABLE-ACTIVITY-PROJECTION', () => {
  let state = scheduleCapacity(claimCapacity(reserveCapacityBudget(boot())));
  state = workflowApply(state, capacityEvent('activity_started', { adapterId: 'writer-adapter' }));
  const actualUsage = {
    promptTokens: 3, completionTokens: 5, wallMs: 9, agentSeconds: 1,
    toolCalls: 0, modelRequests: 1, knownCostUsd: null,
  };
  state = workflowApply(state, capacityEvent('activity_completed', {
    resultIds: [], receiptRef: 'receipt-usage-1', actualUsage,
  }));
  assert.deepEqual(state.activities.get(CAPACITY_ACTIVITY.activityExecutionId).actualUsage, actualUsage);
  assert.deepEqual(workflowStateProjection(state).activities[0].actualUsage, actualUsage);
});

test('USAGE-V1-RAW-HASH-AND-PROJECTION-UNCHANGED', () => {
  let state = boot();
  const identity = {
    nodeId: 'implement', activityExecutionId: '60000000-0000-4000-8000-000000000021',
    attempt: 1, leaseId: '70000000-0000-4000-8000-000000000021', leaseEpoch: 1,
  };
  state = workflowApply(state, next('activity_scheduled', {
    activityKind: 'agent-session', effectClass: 'reconcilable',
    retryMode: 'manual-on-uncertain', idempotencyKey: 'legacy/implement/1',
    resourceClass: 'agent', budgetReservationId: null, deadlineAt: null,
  }, identity));
  state = workflowApply(state, next('activity_started', { adapterId: 'legacy-adapter' }, identity));
  const terminal = next('activity_completed', { resultIds: [], receiptRef: 'legacy-receipt' }, identity);
  const rawHash = canonicalHash(terminal);
  state = workflowApply(state, terminal);
  assert.equal(canonicalHash(terminal), rawHash);
  assert.equal(Object.hasOwn(terminal.payload, 'actualUsage'), false);
  assert.equal(Object.hasOwn(state.activities.get(identity.activityExecutionId), 'actualUsage'), false);
  const projection = workflowStateProjection(state);
  assert.equal(projection.schema, 'talos.workflow-state-projection.v1');
  assert.equal(Object.hasOwn(projection.activities[0], 'actualUsage'), false);
  assert.equal(workflowStateHash(state), canonicalHash(projection));
});

test('CAPACITY-RELEASE-UNCERTAIN-RETAINS-SLOTS', () => {
  let state = claimCapacity(reserveCapacityBudget(boot()));
  state = scheduleCapacity(state);
  state = workflowApply(state, capacityEvent('activity_started', { adapterId: 'writer-adapter' }));
  state = workflowApply(state, capacityEvent('activity_uncertain', {
    reasonClass: 'receipt_missing', observedReceiptRef: null,
  }));
  assert.equal(state.capacityClaims.get(CAPACITY_CLAIM_ID).state, 'active');
  rejectsCapacity(state, () => workflowApply(state, capacityEvent('capacity_released', {
    claimId: CAPACITY_CLAIM_ID, reason: 'activity_terminal',
  })), /terminal|uncertain|activity/i);
});

test('CAPACITY-NO-TERMINAL-WITH-ACTIVE-CLAIM / CAPACITY-BUDGET-CANNOT-CLOSE-UNDER-ACTIVE-CLAIM', () => {
  let state = claimCapacity(reserveCapacityBudget(boot()));
  rejectsCapacity(state, () => workflowApply(state, next('run_failed', {
    errorClass: 'internal', evidenceResultIds: [],
  })), /capacity|claim|active/i);
  rejectsCapacity(state, () => workflowApply(state, next('run_cancelled', { reason: 'user' })), /capacity|claim|active/i);
  rejectsCapacity(state, () => workflowApply(state, next('budget_released', {
    reservationId: CAPACITY_RESERVATION_ID, reason: 'not_started',
  })), /capacity|claim|active/i);
  rejectsCapacity(state, () => workflowApply(state, next('budget_settled', {
    reservationId: CAPACITY_RESERVATION_ID, actual: ZERO_BUDGET, overrunDimensions: [],
  })), /capacity|claim|active/i);
  rejectsCapacity(state, () => reserveCapacityBudget(state), /duplicate|reservation/i);
  state = workflowApply(state, capacityEvent('capacity_released', {
    claimId: CAPACITY_CLAIM_ID, reason: 'never_scheduled',
  }));
  state = workflowApply(state, next('budget_released', {
    reservationId: CAPACITY_RESERVATION_ID, reason: 'not_started',
  }));
  state = workflowApply(state, next('run_failed', { errorClass: 'internal', evidenceResultIds: [] }));
  assert.equal(state.run.status, 'failed');
});

test('CAPACITY-V1-SCHEDULE-CANNOT-BYPASS-EXISTING-CLAIM', () => {
  const state = claimCapacity(reserveCapacityBudget(boot()));
  rejectsCapacity(state, () => workflowApply(state, next('activity_scheduled', {
    activityKind: 'file-write', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
    idempotencyKey: 'capacity/implement/1', resourceClass: 'writer',
    budgetReservationId: CAPACITY_RESERVATION_ID, deadlineAt: null,
  }, CAPACITY_ACTIVITY)), /claim|capacity|version/i);
});

test('CAPACITY-V1-CHECKPOINT-TAIL-V2-CLAIM', () => {
  const current = reserveCapacityBudget(boot());
  const historicalCheckpointState = structuredClone(current);
  delete historicalCheckpointState.capacityClaims;
  const expectedStateHash = workflowStateHash(current);
  assert.equal(workflowStateHash(historicalCheckpointState), expectedStateHash);
  const claimed = capacityEvent('capacity_claimed', {
    schema: 'talos.workflow-capacity-claim.v1', claimId: CAPACITY_CLAIM_ID,
    budgetReservationId: CAPACITY_RESERVATION_ID, provider: null, model: null,
    workspaceRoot: 'C:\\workspace', agentSlots: 0, writerSlots: 1, localProcessSlots: 0,
  });
  const recovered = workflowRecover({
    checkpointState: historicalCheckpointState, expectedStateHash, events: [claimed],
  });
  assert.equal(recovered.capacityClaims.get(CAPACITY_CLAIM_ID).state, 'active');
  assert.equal(workflowStateProjection(recovered).schema, 'talos.workflow-state-projection.v2');
});

test('EVENT-PAUSE-REQUEST-DURABLE / EVENT-CANCEL-REQUEST-DURABLE', () => {
  let state = boot();
  state = workflowApply(state, next('run_pause_requested', { reason: 'user' }, {
    commandId: '50000000-0000-4000-8000-000000000002', commandType: 'pause-run',
    commandPayloadHash: `sha256:${'c'.repeat(64)}`,
  }));
  assert.equal(state.run.pauseRequested, true);
  assert.equal(state.run.schedulingEnabled, false);
  state = workflowApply(state, next('run_paused', { reason: 'user' }));
  assert.equal(state.run.status, 'paused');
  state = workflowApply(state, next('run_cancel_requested', { reason: 'user' }, {
    commandId: '50000000-0000-4000-8000-000000000003', commandType: 'cancel-run',
    commandPayloadHash: `sha256:${'d'.repeat(64)}`,
  }));
  assert.equal(state.run.cancelRequested, true);
  assert.equal(state.run.schedulingEnabled, false);
});

test('EVENT-READY-DERIVED — dependency counters unlock the successor only after success', () => {
  let state = boot();
  assert.deepEqual(workflowReadyNodes(state), ['implement']);
  state = workflowApply(state, next('node_started', { trigger: 'deterministic' }, { nodeId: 'implement' }));
  assert.deepEqual(workflowReadyNodes(state), []);
  state = workflowApply(state, next('node_succeeded', { resultIds: ['commit-result'] }, { nodeId: 'implement' }));
  assert.deepEqual(workflowReadyNodes(state), ['test']);
});

test('EVENT-STALE-COMPLETION-AUDIT-ONLY — stale epochs never mutate the current activity or node', () => {
  let state = boot();
  const current = {
    nodeId: 'implement', activityExecutionId: '60000000-0000-4000-8000-000000000001',
    attempt: 1, leaseId: '70000000-0000-4000-8000-000000000001', leaseEpoch: 2,
  };
  state = workflowApply(state, next('activity_scheduled', {
    activityKind: 'agent-session', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
    idempotencyKey: 'run/implement/1', resourceClass: 'agent', budgetReservationId: null, deadlineAt: null,
  }, current));
  state = workflowApply(state, next('activity_started', { adapterId: 'agent-service' }, current));
  const before = workflowStateHash(state);
  state = workflowApply(state, next('stale_activity_completion_observed', {
    currentLeaseId: current.leaseId, currentLeaseEpoch: current.leaseEpoch,
    observedOutcome: 'completed', forensicResultIds: ['forensic-only'],
  }, { ...current, leaseId: '70000000-0000-4000-8000-000000000099', leaseEpoch: 1 }));
  assert.equal(state.nodes.get('implement').state, 'running');
  assert.equal(state.activities.get(current.activityExecutionId).state, 'started');
  assert.equal(state.audit.staleActivityCompletions.length, 1);
  assert.equal(workflowStateHash(state), before, 'forensic audit remains in the journal, outside StateHashProjection');
});

test('EVENT-GRAPHVERSION-ONLY-PATCH — one self-contained patch increments exactly once', () => {
  let state = boot();
  const operations = [{ op: 'update-node-policy', nodeId: 'implement', patch: { priority: 5 } }];
  state = workflowApply(state, next('graph_patch_applied', {
    patchId: '80000000-0000-4000-8000-000000000001', expectedGraphVersion: 1,
    operationsHash: canonicalHash(operations), previousGraphVersion: 1, newGraphVersion: 2, operations,
  }, { graphVersion: 2 }));
  assert.equal(state.run.graphVersion, 2);
  assert.equal(state.definition.nodes.find((node) => node.id === 'implement').priority, 5);
  assert.throws(() => workflowApply(state, next('run_pause_requested', { reason: 'policy' }, { graphVersion: 3 })), /graphVersion/i);
});

test('EVENT-BUDGET-OVERRUN-FAIL-CLOSED — overrun derives attention and blocks leases', () => {
  let state = boot();
  state = workflowApply(state, next('budget_overrun_observed', {
    reservationId: null, source: 'provider_receipt', dimensions: ['modelRequests'],
    observed: { promptTokens: 0, completionTokens: 0, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 1, knownCostUsd: null },
  }));
  assert.equal(state.run.status, 'needs_attention');
  assert.equal(state.run.schedulingEnabled, false);
  assert.deepEqual(state.run.needsAttentionReasons, ['budget_overrun']);
});
