import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { releaseBudget, reserveBudget, settleBudget, settleBudgetFromActivity } from '../src/workflow/budget.mjs';
import { workflowReplay } from '../src/workflow/run.mjs';

const definitionRecord = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8',
));
const RUN_ID = 'a0000000-0000-4000-8000-000000000001';
const ACTIVITY_1 = 'a0000000-0000-4000-8000-000000000002';
const ACTIVITY_2 = 'a0000000-0000-4000-8000-000000000003';
const LEASE_1 = 'a0000000-0000-4000-8000-000000000004';
const LEASE_2 = 'a0000000-0000-4000-8000-000000000005';
const RESERVATION_1 = 'a0000000-0000-4000-8000-000000000006';
const RESERVATION_2 = 'a0000000-0000-4000-8000-000000000007';

function measured(overrides = {}) {
  return {
    promptTokens: 0, completionTokens: 0, wallMs: 0, agentSeconds: 0,
    toolCalls: 0, modelRequests: 0, knownCostUsd: null, ...overrides,
  };
}

function envelope(seq, type, payload, definition, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: randomUUID(), runId: RUN_ID, seq,
    at: `2026-09-22T13:00:${String(seq).padStart(2, '0')}.000Z`,
    type, nodeId: null, commandId: null, commandType: null,
    commandPayloadHash: null, causationId: null, correlationId: RUN_ID,
    graphVersion: 1, activityExecutionId: null, attempt: null,
    leaseId: null, leaseEpoch: null, payload, ...overrides,
  };
}

function fixture(update = () => {}) {
  const definition = structuredClone(definitionRecord.core);
  update(definition);
  const events = [
    envelope(1, 'run_created', {
      workflowId: definitionRecord.workflowId,
      definitionVersion: 1,
      definitionHash: canonicalHash(definition),
      rootSessionId: '40000000-0000-4000-8000-000000000001',
      workspaceBaselineId: null, workspaceBaselineHash: null,
    }, definition, {
      commandId: randomUUID(), commandType: 'start-run',
      commandPayloadHash: `sha256:${'d'.repeat(64)}`,
    }),
    envelope(2, 'run_started', {}, definition),
  ];
  return { definition, events, state: workflowReplay({ definition, runId: RUN_ID, events }) };
}

function advance(fixtureValue, fact, identity = {}) {
  fixtureValue.events.push(envelope(
    fixtureValue.events.length + 1, fact.type, fact.payload, fixtureValue.definition,
    { nodeId: fact.nodeId ?? null, ...identity },
  ));
  fixtureValue.state = workflowReplay({
    definition: fixtureValue.definition, runId: RUN_ID, events: fixtureValue.events,
  });
}

function request(fixtureValue, overrides = {}) {
  return {
    state: fixtureValue.state,
    definition: fixtureValue.state.definition,
    events: fixtureValue.events,
    input: {
      reservationId: RESERVATION_1, runId: RUN_ID, nodeId: 'implement',
      activityExecutionId: ACTIVITY_1, leaseId: LEASE_1, leaseEpoch: 1,
      reserved: measured({ promptTokens: 60 }), ...overrides,
    },
    at: '2026-09-22T13:10:00.000Z',
  };
}

test('M050_BUDGET_OVERSUBSCRIBED_BY_CONCURRENT_RESERVATIONS', () => {
  const item = fixture((definition) => { definition.budgets.promptTokens = 100; });
  advance(item, reserveBudget(request(item)));
  assert.throws(
    () => reserveBudget(request(item, {
      reservationId: RESERVATION_2, activityExecutionId: ACTIVITY_2,
      leaseId: LEASE_2, reserved: measured({ promptTokens: 41 }),
    })),
    (error) => error?.code === 'WORKFLOW_BUDGET_EXCEEDED',
  );
});

test('BUDGET-UNKNOWN-COST-IS-NOT-ZERO', () => {
  const item = fixture((definition) => { definition.budgets.knownCostUsd = 1; });
  assert.throws(() => reserveBudget(request(item)),
    (error) => error?.code === 'WORKFLOW_BUDGET_UNKNOWN_COST');
  assert.equal(item.events.length, 2);
});

test('BUDGET-UNKNOWN-ACTUAL-COST-REMAINS-RESERVED', () => {
  const item = fixture((definition) => { definition.budgets.knownCostUsd = 1; });
  advance(item, reserveBudget(request(item, {
    reserved: measured({ knownCostUsd: 0.5 }),
  })));
  assert.throws(() => settleBudget({
    state: item.state, reservationId: RESERVATION_1, actual: measured(),
  }), (error) => error?.code === 'WORKFLOW_BUDGET_UNKNOWN_COST');
  assert.equal(item.state.budget.reservations.size, 1);
});

test('BUDGET-NODE-CEILING', () => {
  const item = fixture((definition) => {
    definition.budgets.promptTokens = 1000;
    definition.nodes[0].budget.promptTokens = 50;
  });
  assert.throws(() => reserveBudget(request(item)),
    (error) => error?.code === 'WORKFLOW_BUDGET_EXCEEDED');
});

test('BUDGET-DUPLICATE-IDENTITY', () => {
  const item = fixture();
  advance(item, reserveBudget(request(item)));
  assert.throws(() => reserveBudget(request(item)),
    (error) => error?.code === 'WORKFLOW_BUDGET_DUPLICATE');
  const actual = measured({ promptTokens: 2 });
  advance(item, settleBudget({ state: item.state, reservationId: RESERVATION_1, actual }));
  assert.throws(() => reserveBudget(request(item)),
    (error) => error?.code === 'WORKFLOW_BUDGET_DUPLICATE');
  assert.throws(() => reserveBudget(request(item, { reservationId: RESERVATION_2 })),
    (error) => error?.code === 'WORKFLOW_BUDGET_DUPLICATE');
});

test('BUDGET-SETTLEMENT-ACTUAL-OVER-RESERVED', () => {
  const item = fixture((definition) => { definition.budgets.promptTokens = 100; });
  advance(item, reserveBudget(request(item)));
  const settled = settleBudget({
    state: item.state, reservationId: RESERVATION_1,
    actual: measured({ promptTokens: 120 }),
  });
  assert.deepEqual(settled.payload.overrunDimensions, ['promptTokens']);
  assert.equal(settled.payload.actual.promptTokens, 120);
  advance(item, settled);
  assert.equal(item.state.budget.spent.promptTokens, 120);
  assert.equal(item.state.run.status, 'needs_attention');
  assert.throws(() => reserveBudget(request(item, {
    reservationId: RESERVATION_2, activityExecutionId: ACTIVITY_2,
    leaseId: LEASE_2, reserved: measured({ promptTokens: 1 }),
  })), (error) => error?.code === 'WORKFLOW_BUDGET_RUN_NOT_SCHEDULABLE');
});

test('BUDGET-SETTLEMENT-RETURNS-HEADROOM', () => {
  const item = fixture((definition) => { definition.budgets.promptTokens = 100; });
  advance(item, reserveBudget(request(item)));
  advance(item, settleBudget({
    state: item.state, reservationId: RESERVATION_1,
    actual: measured({ promptTokens: 20 }),
  }));
  assert.equal(item.state.budget.spent.promptTokens, 20);
  const second = reserveBudget(request(item, {
    reservationId: RESERVATION_2, activityExecutionId: ACTIVITY_2,
    leaseId: LEASE_2, reserved: measured({ promptTokens: 80 }),
  }));
  assert.equal(second.payload.reserved.promptTokens, 80);
});

test('BUDGET-RELEASE-BEFORE-EFFECT-ONLY', () => {
  const item = fixture();
  advance(item, reserveBudget(request(item)));
  const released = releaseBudget({
    state: item.state, events: item.events,
    reservationId: RESERVATION_1, reason: 'not_started',
  });
  assert.equal(released.payload.reason, 'not_started');
  advance(item, envelopeFact('activity_scheduled', 'implement', {
    activityKind: 'agent-session', effectClass: 'reconcilable',
    retryMode: 'manual-on-uncertain', idempotencyKey: `${RUN_ID}/implement/1`,
    resourceClass: 'agent', budgetReservationId: RESERVATION_1,
    deadlineAt: null,
  }), { activityExecutionId: ACTIVITY_1, attempt: 1, leaseId: LEASE_1, leaseEpoch: 1 });
  advance(item, envelopeFact('activity_started', 'implement', { adapterId: 'test-adapter' }),
    { activityExecutionId: ACTIVITY_1, attempt: 1, leaseId: LEASE_1, leaseEpoch: 1 });
  assert.throws(() => releaseBudget({
    state: item.state, events: item.events,
    reservationId: RESERVATION_1, reason: 'not_started',
  }), (error) => error?.code === 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED');
});

test('BUDGET-RELEASE-SCHEDULED-FAILS-CLOSED', () => {
  const item = fixture();
  advance(item, reserveBudget(request(item)));
  advance(item, envelopeFact('activity_scheduled', 'implement', {
    activityKind: 'agent-session', effectClass: 'reconcilable',
    retryMode: 'manual-on-uncertain', idempotencyKey: `${RUN_ID}/implement/1`,
    resourceClass: 'agent', budgetReservationId: RESERVATION_1,
    deadlineAt: null,
  }), { activityExecutionId: ACTIVITY_1, attempt: 1, leaseId: LEASE_1, leaseEpoch: 1 });
  assert.throws(() => releaseBudget({
    state: item.state, events: item.events,
    reservationId: RESERVATION_1, reason: 'not_started',
  }), (error) => error?.code === 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED');
});

function envelopeFact(type, nodeId, payload) { return { type, nodeId, payload }; }

function durableClaimedCompletion(item, actualUsage, { release = true, receiptRef = 'receipt://provider/budget-1' } = {}) {
  const claimId = randomUUID();
  const identity = {
    nodeId: 'implement', activityExecutionId: ACTIVITY_1, attempt: 1,
    leaseId: LEASE_1, leaseEpoch: 1,
  };
  const v2 = { schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...identity };
  advance(item, reserveBudget(request(item, {
    reserved: measured({ promptTokens: 60, knownCostUsd: item.definition.budgets.knownCostUsd === null ? null : 0.5 }),
  })));
  advance(item, envelopeFact('capacity_claimed', 'implement', {
    schema: 'talos.workflow-capacity-claim.v1', claimId,
    budgetReservationId: RESERVATION_1, provider: 'openai', model: 'gpt-5-nano',
    workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  }), v2);
  advance(item, envelopeFact('activity_scheduled', 'implement', {
    activityKind: 'agent-session', effectClass: 'reconcilable',
    retryMode: 'manual-on-uncertain', idempotencyKey: `${RUN_ID}/implement/1`,
    resourceClass: 'agent', budgetReservationId: RESERVATION_1, deadlineAt: null,
  }), v2);
  advance(item, envelopeFact('activity_started', 'implement', { adapterId: 'test-adapter' }), identity);
  advance(item, envelopeFact('activity_completed', 'implement', {
    receiptRef, resultIds: [], actualUsage,
  }), v2);
  if (release) advance(item, envelopeFact('capacity_released', 'implement', {
    claimId, reason: 'activity_terminal',
  }), v2);
  return { claimId, identity };
}

test('USAGE-SETTLEMENT-RECEIPT-IDENTITY', () => {
  const item = fixture();
  const usage = measured({ promptTokens: 12, completionTokens: 4 });
  durableClaimedCompletion(item, usage, { release: false });
  assert.throws(() => settleBudgetFromActivity({
    state: item.state, events: item.events, reservationId: RESERVATION_1,
  }), (error) => error?.code === 'WORKFLOW_BUDGET_CLAIM_ACTIVE');
  const claim = [...item.state.capacityClaims.values()][0];
  advance(item, envelopeFact('capacity_released', 'implement', {
    claimId: claim.claimId, reason: 'activity_terminal',
  }), {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2,
    nodeId: 'implement', activityExecutionId: ACTIVITY_1, attempt: 1,
    leaseId: LEASE_1, leaseEpoch: 1,
  });
  const settlement = settleBudgetFromActivity({
    state: item.state, events: item.events, reservationId: RESERVATION_1,
  });
  assert.deepEqual(settlement.payload.actual, usage);
  advance(item, settlement);
  assert.equal(item.state.budget.spent.promptTokens, 12);
  assert.equal(item.state.budget.reservations.size, 0);
});

test('USAGE-UNKNOWN-COST-FAIL-CLOSED', () => {
  const item = fixture((definition) => { definition.budgets.knownCostUsd = 1; });
  durableClaimedCompletion(item, measured({ promptTokens: 12 }));
  assert.throws(() => settleBudgetFromActivity({
    state: item.state, events: item.events, reservationId: RESERVATION_1,
  }), (error) => error?.code === 'WORKFLOW_BUDGET_UNKNOWN_COST');
  assert.equal(item.state.budget.reservations.size, 1);
});

test('USAGE-SETTLEMENT-REJECTS-MISSING-RECEIPT-OR-USAGE', () => {
  const missingReceipt = fixture();
  durableClaimedCompletion(missingReceipt, measured({ promptTokens: 12 }), { receiptRef: null });
  assert.throws(() => settleBudgetFromActivity({
    state: missingReceipt.state, events: missingReceipt.events, reservationId: RESERVATION_1,
  }), (error) => error?.code === 'WORKFLOW_BUDGET_RECEIPT_MISSING');
  const unknown = fixture();
  durableClaimedCompletion(unknown, null);
  assert.throws(() => settleBudgetFromActivity({
    state: unknown.state, events: unknown.events, reservationId: RESERVATION_1,
  }), (error) => error?.code === 'WORKFLOW_BUDGET_USAGE_UNKNOWN');
});

test('USAGE-V2-REPLAY-SETTLEMENT-FORGED-ACTUAL-REJECTED', () => {
  const item = fixture();
  durableClaimedCompletion(item, measured({ promptTokens: 12 }));
  const forged = settleBudget({
    state: item.state, reservationId: RESERVATION_1,
    actual: measured({ promptTokens: 0 }),
  });
  assert.throws(() => advance(item, forged), /durable Activity usage/u);
});

test('BUDGET-DIMENSION-VOCABULARY-EXACT', () => {
  const item = fixture();
  assert.throws(() => reserveBudget(request(item, {
    reserved: { ...measured(), secretExtra: 1 },
  })), (error) => error?.code === 'WORKFLOW_BUDGET_MEASUREMENT_INVALID');
  assert.throws(() => reserveBudget(request(item, {
    reserved: measured({ promptTokens: Number.NaN }),
  })), (error) => error?.code === 'WORKFLOW_BUDGET_MEASUREMENT_INVALID');
});

test('BUDGET-NODE-ID-CONTRACT-COMPATIBLE', () => {
  const item = fixture((definition) => {
    definition.nodes[0].id = 'Implement.v2';
    for (const edge of definition.edges) {
      if (edge.from === 'implement') edge.from = 'Implement.v2';
      if (edge.to === 'implement') edge.to = 'Implement.v2';
    }
  });
  const fact = reserveBudget(request(item, { nodeId: 'Implement.v2' }));
  assert.equal(fact.payload.nodeId, 'Implement.v2');
});
