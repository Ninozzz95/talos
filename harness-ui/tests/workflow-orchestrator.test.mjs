import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import {
  appendEvent,
  approveDefinition,
  createDefinition,
  createRun,
  createWorkflowStore,
  readEvents,
} from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const definitionRecord = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url),
  'utf8',
));
const approval = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url),
  'utf8',
));
const ROOT_SESSION_ID = '40000000-0000-4000-8000-000000000001';

function event(runId, seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1',
    eventSchemaVersion: 1,
    engineSchemaVersion: 1,
    eventId: randomUUID(),
    runId,
    seq,
    at: `2026-09-22T13:00:${String(seq).padStart(2, '0')}.000Z`,
    type,
    nodeId: null,
    commandId: null,
    commandType: null,
    commandPayloadHash: null,
    causationId: null,
    correlationId: runId,
    graphVersion: 1,
    activityExecutionId: null,
    attempt: null,
    leaseId: null,
    leaseEpoch: null,
    payload,
    ...overrides,
  };
}

function runCreated(runId) {
  return event(runId, 1, 'run_created', {
    workflowId: definitionRecord.workflowId,
    definitionVersion: definitionRecord.version,
    definitionHash: definitionRecord.definitionHash,
    rootSessionId: ROOT_SESSION_ID,
    workspaceBaselineId: null,
    workspaceBaselineHash: null,
  }, {
    commandId: randomUUID(),
    commandType: 'start-run',
    commandPayloadHash: `sha256:${'d'.repeat(64)}`,
  });
}

async function fixture(t, adapter, { capacityFn } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-orchestrator-'));
  const store = await createWorkflowStore({
    workflowDataRoot: root,
    workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record: definitionRecord });
  await approveDefinition(store, { approval });
  const runId = randomUUID();
  await createRun(store, { event: runCreated(runId) });
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  const orchestrator = createWorkflowOrchestrator({
    store,
    adapters: new Map([['agent-session', adapter]]),
    nowFn: () => '2026-09-22T13:10:00.000Z',
    idFn: randomUUID,
    capacityFn,
  });
  return { root, store, runId, orchestrator };
}

function adapter(execute) {
  return {
    id: 'agent-integration-adapter',
    execute,
    async reconcile() { return { outcome: 'still_unknown', receiptRef: null, resultIds: [] }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; },
  };
}

const executeInput = (runId) => ({
  runId,
  nodeId: 'implement',
  activityKind: 'agent-session',
  resourceClass: 'agent',
  idempotencyKey: `${runId}/implement/1`,
  budgetReservationId: null,
  deadlineAt: null,
});

const oneSlotCapacity = () => ({
  globalAgents: 1, globalWriters: 0, localProcesses: 0,
  perProvider: new Map([['openai', 1]]),
  perModel: new Map([['openai', new Map([['gpt-5-nano', 1]])]]),
  perWorkspaceWriters: new Map(),
});

const admissionInput = (runId) => ({
  runId, nodeId: 'implement', provider: 'openai', model: 'gpt-5-nano',
  workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  reserved: {
    promptTokens: 60_000, completionTokens: 0, wallMs: 0,
    agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null,
  },
});

test('WF-V2-ADMISSION-NO-BYPASS — phased Definition cannot execute without hard capacity policy', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-orchestrator-v2-guard-'));
  const store = await createWorkflowStore({
    workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const phased = structuredClone(definitionRecord);
  phased.core.schema = 'talos.workflow-definition-core.v2';
  phased.core.definitionSchemaVersion = 2;
  phased.core.phases = [
    { id: 'implementation', label: 'Implementazione' },
    { id: 'verification', label: 'Verifica' },
  ];
  for (const node of phased.core.nodes) node.phaseId = node.id === 'test' ? 'verification' : 'implementation';
  phased.definitionHash = canonicalHash(phased.core);
  await createDefinition(store, { record: phased });
  const phasedApproval = { ...approval, definitionHash: phased.definitionHash };
  phasedApproval.commandPayloadHash = canonicalHash({
    schema: 'talos.workflow-command-dedupe.v1', commandType: 'approve-definition',
    target: { workflowId: phased.workflowId, definitionVersion: phased.version,
      runId: null, nodeId: null, requestId: null },
    payload: { definitionHash: phased.definitionHash },
  });
  await approveDefinition(store, { approval: phasedApproval });
  const runId = randomUUID();
  const created = runCreated(runId);
  created.payload.definitionHash = phased.definitionHash;
  await createRun(store, { event: created });
  await appendEvent(store, { event: event(runId, 2, 'run_started') });
  let effects = 0;
  const orchestrator = createWorkflowOrchestrator({
    store, adapters: new Map([['agent-session', adapter(async () => {
      effects += 1;
      return { status: 'completed', receiptRef: 'effect-receipt', results: [] };
    })]]),
  });
  await orchestrator.recover();
  await assert.rejects(orchestrator.executeNode(executeInput(runId)),
    (error) => error?.code === 'WORKFLOW_CAPACITY_POLICY_UNAVAILABLE');
  assert.equal(effects, 0);
  assert.deepEqual((await readEvents(store, { runId })).map((entry) => entry.type),
    ['run_created', 'run_started']);
});

test('ADMISSION-GLOBAL-ONE-SLOT-TWO-RUNS — loser gets no durable reservation or effect', async (t) => {
  let effects = 0;
  const setup = await fixture(t, adapter(async () => { effects += 1; return {
    status: 'completed', receiptRef: 'receipt://unused', results: [], actualUsage: null,
  }; }), { capacityFn: oneSlotCapacity });
  const secondRunId = randomUUID();
  await createRun(setup.store, { event: runCreated(secondRunId) });
  await appendEvent(setup.store, { event: event(secondRunId, 2, 'run_started') });
  await setup.orchestrator.recover();

  const outcomes = await Promise.allSettled([
    setup.orchestrator.admitActivity(admissionInput(setup.runId)),
    setup.orchestrator.admitActivity(admissionInput(secondRunId)),
  ]);
  assert.deepEqual(outcomes.map((item) => item.status), ['fulfilled', 'rejected']);
  assert.equal(outcomes[1].reason.code, 'WORKFLOW_CAPACITY_EXCEEDED');
  assert.equal(effects, 0);
  const firstEvents = await readEvents(setup.store, { runId: setup.runId });
  const secondEvents = await readEvents(setup.store, { runId: secondRunId });
  assert.equal(firstEvents.filter((item) => item.type === 'budget_reserved').length, 1);
  assert.equal(firstEvents.filter((item) => item.type === 'capacity_claimed').length, 1);
  assert.equal(secondEvents.filter((item) => item.type === 'budget_reserved').length, 0);
  assert.equal(secondEvents.filter((item) => item.type === 'capacity_claimed').length, 0);
});

test('ADMISSION-REPLAY-CLAIM-BLOCKS — restart reconstructs occupied global slot', async (t) => {
  const setup = await fixture(t, adapter(async () => {
    throw new Error('adapter must not run during admission');
  }), { capacityFn: oneSlotCapacity });
  const secondRunId = randomUUID();
  await createRun(setup.store, { event: runCreated(secondRunId) });
  await appendEvent(setup.store, { event: event(secondRunId, 2, 'run_started') });
  await setup.orchestrator.recover();
  const admitted = await setup.orchestrator.admitActivity(admissionInput(setup.runId));
  assert.equal(typeof admitted.claimId, 'string');
  await setup.store.close();

  const reopened = await createWorkflowStore({
    workflowDataRoot: setup.root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
  try {
    const recovered = createWorkflowOrchestrator({
      store: reopened,
      adapters: new Map([['agent-session', adapter(async () => { throw new Error('unexpected effect'); })]]),
      capacityFn: oneSlotCapacity,
    });
    await recovered.recover();
    await assert.rejects(recovered.admitActivity(admissionInput(secondRunId)),
      (error) => error.code === 'WORKFLOW_CAPACITY_EXCEEDED');
    const events = await readEvents(reopened, { runId: secondRunId });
    assert.equal(events.some((item) => item.type === 'budget_reserved'), false);
  } finally {
    await reopened.close();
  }
});

test('ADMISSION-RELEASE-PROOF — no-schedule release frees capacity and budget', async (t) => {
  const setup = await fixture(t, adapter(async () => {
    throw new Error('adapter must not run');
  }), { capacityFn: oneSlotCapacity });
  const secondRunId = randomUUID();
  await createRun(setup.store, { event: runCreated(secondRunId) });
  await appendEvent(setup.store, { event: event(secondRunId, 2, 'run_started') });
  await setup.orchestrator.recover();
  const first = await setup.orchestrator.admitActivity(admissionInput(setup.runId));
  await setup.orchestrator.releaseAdmission({ runId: setup.runId, claimId: first.claimId });
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.filter((item) => item.type === 'capacity_released').length, 1);
  assert.equal(facts.filter((item) => item.type === 'budget_released').length, 1);
  const next = await setup.orchestrator.admitActivity(admissionInput(secondRunId));
  assert.equal(typeof next.claimId, 'string');
});

test('ADMISSION-RELEASE-PROOF — terminal Activity usage is settled from durable facts', async (t) => {
  const actualUsage = {
    promptTokens: 11, completionTokens: 7, wallMs: 30, agentSeconds: 1,
    toolCalls: 0, modelRequests: 1, knownCostUsd: null,
  };
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://provider/admission-terminal',
    results: [], actualUsage,
  })), { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  const admitted = await setup.orchestrator.admitActivity(admissionInput(setup.runId));
  const executed = await setup.orchestrator.executeNode({
    ...executeInput(setup.runId),
    budgetReservationId: admitted.budgetReservationId,
    preparedIdentity: admitted.preparedIdentity,
  });
  assert.equal(executed.status, 'completed');
  await setup.orchestrator.releaseAdmission({ runId: setup.runId, claimId: admitted.claimId });
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.filter((item) => item.type === 'capacity_released').length, 1);
  const settlement = facts.find((item) => item.type === 'budget_settled');
  assert.deepEqual(settlement?.payload.actual, actualUsage);
  assert.equal(facts.some((item) => item.type === 'budget_released'), false);
});

test('ADMISSION-RELEASE-PROOF — uncertain Activity cannot release its slot', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://provider/unknown-usage', results: [],
  })), { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  const admitted = await setup.orchestrator.admitActivity(admissionInput(setup.runId));
  const executed = await setup.orchestrator.executeNode({
    ...executeInput(setup.runId),
    budgetReservationId: admitted.budgetReservationId,
    preparedIdentity: admitted.preparedIdentity,
  });
  assert.equal(executed.status, 'uncertain');
  await assert.rejects(setup.orchestrator.releaseAdmission({
    runId: setup.runId, claimId: admitted.claimId,
  }), (error) => error.code === 'WORKFLOW_ADMISSION_EFFECT_UNCERTAIN');
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.some((item) => item.type === 'capacity_released'), false);
});

test('ADMISSION-SCHEDULED-GAP — append fault before started never dispatches or releases', async (t) => {
  let effects = 0;
  const setup = await fixture(t, adapter(async () => { effects += 1; throw new Error('unexpected effect'); }),
    { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  const admitted = await setup.orchestrator.admitActivity(admissionInput(setup.runId));
  setup.store.failpoint = async (name, details) => {
    if (name === 'store.journal.before_append' && details.runId === setup.runId && details.seq === 6) {
      throw new Error('simulated pre-start failure');
    }
  };
  await assert.rejects(setup.orchestrator.executeNode({
    ...executeInput(setup.runId),
    budgetReservationId: admitted.budgetReservationId,
    preparedIdentity: admitted.preparedIdentity,
  }), /simulated pre-start failure/);
  setup.store.failpoint = undefined;
  assert.equal(effects, 0);
  await assert.rejects(setup.orchestrator.releaseAdmission({
    runId: setup.runId, claimId: admitted.claimId,
  }), (error) => error.code === 'WORKFLOW_ADMISSION_EFFECT_UNCERTAIN');
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.filter((item) => item.type === 'activity_scheduled').length, 1);
  assert.equal(facts.some((item) => item.type === 'activity_started'), false);
  assert.equal(facts.some((item) => item.type === 'capacity_released'), false);
});

test('ADMISSION-V1-BYPASS-BLOCKED — active capacity controller rejects legacy direct execution', async (t) => {
  let effects = 0;
  const setup = await fixture(t, adapter(async () => { effects += 1; throw new Error('unexpected effect'); }),
    { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  await assert.rejects(setup.orchestrator.executeNode(executeInput(setup.runId)),
    (error) => error.code === 'WORKFLOW_ADMISSION_REQUIRED');
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.some((item) => item.type === 'activity_scheduled'), false);
  assert.equal(effects, 0);
});

test('ADMISSION-APPEND-FAIL-CLOSED — rejected claim append compensates only proved no-effect budget', async (t) => {
  let effects = 0;
  const setup = await fixture(t, adapter(async () => { effects += 1; throw new Error('unexpected effect'); }),
    { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  let injected = false;
  setup.store.failpoint = async (name, details) => {
    if (!injected && name === 'store.journal.before_append' && details.runId === setup.runId && details.seq === 4) {
      injected = true;
      throw new Error('simulated claim pre-append failure');
    }
  };
  await assert.rejects(setup.orchestrator.admitActivity(admissionInput(setup.runId)),
    /simulated claim pre-append failure/);
  setup.store.failpoint = undefined;
  assert.equal(setup.store.state, 'ready');
  assert.equal(effects, 0);
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.filter((item) => item.type === 'budget_reserved').length, 1);
  assert.equal(facts.filter((item) => item.type === 'budget_released').length, 1);
  assert.equal(facts.some((item) => item.type === 'capacity_claimed'), false);
});

test('ADMISSION-APPEND-FAIL-CLOSED — post-sync ambiguity quarantines admission', async (t) => {
  let effects = 0;
  const setup = await fixture(t, adapter(async () => { effects += 1; throw new Error('unexpected effect'); }),
    { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  setup.store.failpoint = async (name, details) => {
    if (name === 'store.journal.after_sync_before_cache' && details.runId === setup.runId && details.seq === 4) {
      throw new Error('simulated post-sync ambiguity');
    }
  };
  await assert.rejects(setup.orchestrator.admitActivity(admissionInput(setup.runId)),
    /simulated post-sync ambiguity/);
  setup.store.failpoint = undefined;
  assert.equal(setup.store.state, 'needs_attention');
  assert.equal(effects, 0);
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.some((item) => item.type === 'capacity_claimed'), true);
  assert.equal(facts.some((item) => item.type === 'budget_released'), false);
  await assert.rejects(setup.orchestrator.admitActivity(admissionInput(setup.runId)),
    (error) => error.code === 'WORKFLOW_STORE_NEEDS_ATTENTION');
});

test('ADMISSION-STORE-OWNER — second Store cannot own active admission root', async (t) => {
  const setup = await fixture(t, adapter(async () => { throw new Error('unexpected effect'); }),
    { capacityFn: oneSlotCapacity });
  await assert.rejects(createWorkflowStore({
    workflowDataRoot: setup.root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  }), (error) => error.code === 'WORKFLOW_STORE_OWNED');
});

test('ADMISSION-WORKSPACE-ALIAS — path aliases share one writer ceiling', async (t) => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'talos-writer-workspace-'));
  mkdirSync(join(workspaceRoot, 'sub'));
  t.after(() => rimuoviCartellaDiProva(workspaceRoot));
  const alias = `${workspaceRoot}\\sub\\..`;
  const capacityFn = () => ({
    globalAgents: 0, globalWriters: 2, localProcesses: 0,
    perProvider: new Map(), perModel: new Map(),
    perWorkspaceWriters: new Map([[workspaceRoot, 1], [alias, 1]]),
  });
  const setup = await fixture(t, adapter(async () => { throw new Error('unexpected effect'); }),
    { capacityFn });
  const secondRunId = randomUUID();
  await createRun(setup.store, { event: runCreated(secondRunId) });
  await appendEvent(setup.store, { event: event(secondRunId, 2, 'run_started') });
  await setup.orchestrator.recover();
  const writerInput = (runId, root) => ({
    ...admissionInput(runId), provider: null, model: null,
    workspaceRoot: root, agentSlots: 0, writerSlots: 1,
  });
  const first = await setup.orchestrator.admitActivity(writerInput(setup.runId, workspaceRoot));
  assert.equal(typeof first.claimId, 'string');
  await assert.rejects(setup.orchestrator.admitActivity(writerInput(secondRunId, alias)),
    (error) => error.code === 'WORKFLOW_CAPACITY_EXCEEDED');
  const facts = await readEvents(setup.store, { runId: secondRunId });
  assert.equal(facts.some((item) => item.type === 'budget_reserved'), false);
});

test('ADMISSION-WORKSPACE-RELATIVE-REJECTED — cwd cannot silently become durable writer identity', async (t) => {
  const capacityFn = () => ({
    globalAgents: 0, globalWriters: 1, localProcesses: 0,
    perProvider: new Map(), perModel: new Map(),
    perWorkspaceWriters: new Map([[process.cwd(), 1]]),
  });
  const setup = await fixture(t, adapter(async () => { throw new Error('unexpected effect'); }),
    { capacityFn });
  await setup.orchestrator.recover();
  await assert.rejects(setup.orchestrator.admitActivity({
    ...admissionInput(setup.runId), provider: null, model: null,
    workspaceRoot: '.', agentSlots: 0, writerSlots: 1,
  }), (error) => error.code === 'WORKFLOW_CAPACITY_WORKSPACE_INVALID');
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.some((item) => item.type === 'budget_reserved'), false);
});

test('ADMISSION-RELEASE-SPLIT-REPLAY — terminal release resumes settlement after restart', async (t) => {
  const actualUsage = {
    promptTokens: 9, completionTokens: 3, wallMs: 15, agentSeconds: 1,
    toolCalls: 0, modelRequests: 1, knownCostUsd: null,
  };
  const agent = adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://provider/release-split',
    results: [], actualUsage,
  }));
  const setup = await fixture(t, agent, { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  const admitted = await setup.orchestrator.admitActivity(admissionInput(setup.runId));
  await setup.orchestrator.executeNode({
    ...executeInput(setup.runId),
    budgetReservationId: admitted.budgetReservationId,
    preparedIdentity: admitted.preparedIdentity,
  });
  const settlementSeq = (await readEvents(setup.store, { runId: setup.runId })).length + 2;
  let injected = false;
  setup.store.failpoint = async (name, details) => {
    if (!injected && name === 'store.journal.before_append'
      && details.runId === setup.runId && details.seq === settlementSeq) {
      injected = true;
      throw new Error('simulated budget settlement gap');
    }
  };
  await assert.rejects(setup.orchestrator.releaseAdmission({
    runId: setup.runId, claimId: admitted.claimId,
  }), /simulated budget settlement gap/);
  setup.store.failpoint = undefined;
  const partial = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(partial.filter((item) => item.type === 'capacity_released').length, 1);
  assert.equal(partial.some((item) => item.type === 'budget_settled'), false);
  await setup.store.close();
  const reopened = await createWorkflowStore({
    workflowDataRoot: setup.root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
  try {
    const resumed = createWorkflowOrchestrator({
      store: reopened, adapters: new Map([['agent-session', agent]]),
      capacityFn: oneSlotCapacity,
    });
    await resumed.recover();
    await resumed.releaseAdmission({ runId: setup.runId, claimId: admitted.claimId });
    await resumed.releaseAdmission({ runId: setup.runId, claimId: admitted.claimId });
    const facts = await readEvents(reopened, { runId: setup.runId });
    assert.equal(facts.filter((item) => item.type === 'capacity_released').length, 1);
    assert.equal(facts.filter((item) => item.type === 'budget_settled').length, 1);
    assert.deepEqual(facts.find((item) => item.type === 'budget_settled')?.payload.actual, actualUsage);
  } finally {
    await reopened.close();
  }
});

test('ADMISSION-TWO-ORCHESTRATORS-ONE-STORE — controllers share one global lock', async (t) => {
  const agent = adapter(async () => { throw new Error('unexpected effect'); });
  const setup = await fixture(t, agent, { capacityFn: oneSlotCapacity });
  const secondRunId = randomUUID();
  await createRun(setup.store, { event: runCreated(secondRunId) });
  await appendEvent(setup.store, { event: event(secondRunId, 2, 'run_started') });
  const other = createWorkflowOrchestrator({
    store: setup.store, adapters: new Map([['agent-session', agent]]),
    capacityFn: oneSlotCapacity,
  });
  await Promise.all([setup.orchestrator.recover(), other.recover()]);
  const results = await Promise.allSettled([
    setup.orchestrator.admitActivity(admissionInput(setup.runId)),
    other.admitActivity(admissionInput(secondRunId)),
  ]);
  assert.deepEqual(results.map((item) => item.status), ['fulfilled', 'rejected']);
  assert.equal(results[1].reason.code, 'WORKFLOW_CAPACITY_EXCEEDED');
  const secondFacts = await readEvents(setup.store, { runId: secondRunId });
  assert.equal(secondFacts.some((item) => item.type === 'budget_reserved'), false);
});

test('ADMISSION-NODE-NOT-READY — unknown node returns typed error without facts', async (t) => {
  const setup = await fixture(t, adapter(async () => { throw new Error('unexpected effect'); }),
    { capacityFn: oneSlotCapacity });
  await setup.orchestrator.recover();
  await assert.rejects(setup.orchestrator.admitActivity({
    ...admissionInput(setup.runId), nodeId: 'missing',
  }), (error) => error.code === 'WORKFLOW_ADMISSION_NODE_NOT_READY');
  const facts = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(facts.some((item) => item.type === 'budget_reserved'), false);
});

test('USAGE-ADAPTER-OUTCOME-TYPED-AND-DURABLE / USAGE-CRASH-AFTER-ACTIVITY-TERMINAL-REPLAY', async (t) => {
  const actualUsage = {
    promptTokens: 7, completionTokens: 4, wallMs: 12, agentSeconds: 1,
    toolCalls: 0, modelRequests: 1, knownCostUsd: null,
  };
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://provider/usage-1', results: [], actualUsage,
  })));
  await setup.orchestrator.recover();
  const reservationId = randomUUID();
  const preparedIdentity = {
    nodeId: 'implement', activityExecutionId: randomUUID(), attempt: 1,
    leaseId: randomUUID(), leaseEpoch: 1,
  };
  await setup.orchestrator.reserveBudget(budgetInput(setup.runId, {
    reservationId, activityExecutionId: preparedIdentity.activityExecutionId,
    leaseId: preparedIdentity.leaseId, leaseEpoch: preparedIdentity.leaseEpoch,
  }));
  const claimId = randomUUID();
  await appendEvent(setup.store, { event: event(setup.runId, 4, 'capacity_claimed', {
    schema: 'talos.workflow-capacity-claim.v1', claimId,
    budgetReservationId: reservationId, provider: 'openai', model: 'gpt-5-nano',
    workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  }, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...preparedIdentity,
  }) });
  await setup.orchestrator.executeNode({
    ...executeInput(setup.runId), budgetReservationId: reservationId, preparedIdentity,
  });
  const events = await readEvents(setup.store, { runId: setup.runId });
  const scheduled = events.find((entry) => entry.type === 'activity_scheduled');
  const completed = events.find((entry) => entry.type === 'activity_completed');
  assert.equal(scheduled.eventSchemaVersion, 2);
  assert.equal(scheduled.activityExecutionId, preparedIdentity.activityExecutionId);
  assert.equal(completed.eventSchemaVersion, 2);
  assert.deepEqual(completed.payload.actualUsage, actualUsage);
  await appendEvent(setup.store, { event: event(setup.runId, events.length + 1, 'capacity_released', {
    claimId, reason: 'activity_terminal',
  }, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...preparedIdentity,
  }) });
  await assert.rejects(() => setup.orchestrator.settleBudget({
    runId: setup.runId, reservationId,
    actual: { ...actualUsage, promptTokens: 0, completionTokens: 0 },
  }), (error) => error?.code === 'WORKFLOW_BUDGET_DURABLE_USAGE_REQUIRED');
  const settled = await setup.orchestrator.settleBudgetFromActivity({
    runId: setup.runId, reservationId,
  });
  assert.deepEqual(settled.payload.actual, actualUsage);
  await setup.store.close();
  const reopened = await createWorkflowStore({
    workflowDataRoot: setup.root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 },
  });
  try {
    assert.deepEqual((await readEvents(reopened, { runId: setup.runId }))
      .find((entry) => entry.type === 'activity_completed').payload.actualUsage, actualUsage);
  } finally { await reopened.close(); }
});

test('USAGE-V2-RECONCILIATION-PERSISTS-OR-HOLDS', async (t) => {
  const actualUsage = {
    promptTokens: 9, completionTokens: 2, wallMs: 24, agentSeconds: 1,
    toolCalls: 0, modelRequests: 1, knownCostUsd: null,
  };
  const agent = adapter(async () => ({
    status: 'uncertain', reasonClass: 'transport_ambiguous',
    observedReceiptRef: null, actualUsage: null,
  }));
  agent.reconcile = async () => ({
    outcome: 'proved_completed', receiptRef: 'receipt://provider/recovered-usage',
    resultIds: [], actualUsage,
  });
  const setup = await fixture(t, agent);
  await setup.orchestrator.recover();
  const reservationId = randomUUID();
  const preparedIdentity = {
    nodeId: 'implement', activityExecutionId: randomUUID(), attempt: 1,
    leaseId: randomUUID(), leaseEpoch: 1,
  };
  await setup.orchestrator.reserveBudget(budgetInput(setup.runId, {
    reservationId, activityExecutionId: preparedIdentity.activityExecutionId,
    leaseId: preparedIdentity.leaseId, leaseEpoch: preparedIdentity.leaseEpoch,
  }));
  await appendEvent(setup.store, { event: event(setup.runId, 4, 'capacity_claimed', {
    schema: 'talos.workflow-capacity-claim.v1', claimId: randomUUID(),
    budgetReservationId: reservationId, provider: 'openai', model: 'gpt-5-nano',
    workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  }, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...preparedIdentity,
  }) });
  await setup.orchestrator.executeNode({
    ...executeInput(setup.runId), budgetReservationId: reservationId, preparedIdentity,
  });
  await setup.orchestrator.reconcileActivity({
    runId: setup.runId, activityExecutionId: preparedIdentity.activityExecutionId,
  });
  const reconciled = (await readEvents(setup.store, { runId: setup.runId }))
    .find((entry) => entry.type === 'activity_reconciled');
  assert.equal(reconciled.eventSchemaVersion, 2);
  assert.deepEqual(reconciled.payload.actualUsage, actualUsage);
});

test('USAGE-V2-PREPARED-RUN-NOT-SCHEDULABLE', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://unused', results: [], actualUsage: null,
  })));
  await setup.orchestrator.recover();
  const reservationId = randomUUID();
  const preparedIdentity = {
    nodeId: 'implement', activityExecutionId: randomUUID(), attempt: 1,
    leaseId: randomUUID(), leaseEpoch: 1,
  };
  await setup.orchestrator.reserveBudget(budgetInput(setup.runId, {
    reservationId, activityExecutionId: preparedIdentity.activityExecutionId,
    leaseId: preparedIdentity.leaseId, leaseEpoch: preparedIdentity.leaseEpoch,
  }));
  await appendEvent(setup.store, { event: event(setup.runId, 4, 'capacity_claimed', {
    schema: 'talos.workflow-capacity-claim.v1', claimId: randomUUID(),
    budgetReservationId: reservationId, provider: 'openai', model: 'gpt-5-nano',
    workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  }, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...preparedIdentity,
  }) });
  await appendEvent(setup.store, { event: event(setup.runId, 5, 'run_pause_requested', {
    reason: 'user',
  }, {
    commandId: randomUUID(), commandType: 'pause-run',
    commandPayloadHash: `sha256:${'d'.repeat(64)}`,
  }) });
  await assert.rejects(() => setup.orchestrator.executeNode({
    ...executeInput(setup.runId), budgetReservationId: reservationId, preparedIdentity,
  }), (error) => error?.code === 'WORKFLOW_RUN_NOT_SCHEDULABLE');
  assert.equal((await readEvents(setup.store, { runId: setup.runId })).length, 5);
});

test('USAGE-V2-ADAPTER-USAGE-INVALID-HOLDS', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://provider/missing-usage', results: [],
  })));
  await setup.orchestrator.recover();
  const reservationId = randomUUID();
  const preparedIdentity = {
    nodeId: 'implement', activityExecutionId: randomUUID(), attempt: 1,
    leaseId: randomUUID(), leaseEpoch: 1,
  };
  await setup.orchestrator.reserveBudget(budgetInput(setup.runId, {
    reservationId, activityExecutionId: preparedIdentity.activityExecutionId,
    leaseId: preparedIdentity.leaseId, leaseEpoch: preparedIdentity.leaseEpoch,
  }));
  await appendEvent(setup.store, { event: event(setup.runId, 4, 'capacity_claimed', {
    schema: 'talos.workflow-capacity-claim.v1', claimId: randomUUID(),
    budgetReservationId: reservationId, provider: 'openai', model: 'gpt-5-nano',
    workspaceRoot: null, agentSlots: 1, writerSlots: 0, localProcessSlots: 0,
  }, {
    schema: 'talos.workflow-event.v2', eventSchemaVersion: 2, ...preparedIdentity,
  }) });
  const result = await setup.orchestrator.executeNode({
    ...executeInput(setup.runId), budgetReservationId: reservationId, preparedIdentity,
  });
  assert.equal(result.status, 'uncertain');
  const events = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(events.some((entry) => entry.type === 'activity_completed'), false);
  assert.equal(events.some((entry) => entry.type === 'budget_settled'), false);
  assert.equal((await setup.orchestrator.snapshot({ runId: setup.runId })).budget.reservations.length, 1);
});

function budgetInput(runId, overrides = {}) {
  return {
    runId, nodeId: 'implement', reservationId: randomUUID(),
    activityExecutionId: randomUUID(), leaseId: randomUUID(), leaseEpoch: 1,
    reserved: {
      promptTokens: 60_000, completionTokens: 0, wallMs: 0,
      agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null,
    },
    ...overrides,
  };
}

test('ORCHESTRATOR-BUDGET-RESERVATION-DURABLE-BEFORE-RETURN', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://unused', results: [],
  })));
  await setup.orchestrator.recover();
  const input = budgetInput(setup.runId);
  const result = await setup.orchestrator.reserveBudget(input);
  const events = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(result.eventId, events.at(-1).eventId);
  assert.equal(result.type, 'budget_reserved');
  assert.equal(events.at(-1).payload.reservationId, input.reservationId);
  assert.equal((await setup.orchestrator.snapshot({ runId: setup.runId })).budget.reservations.length, 1);
});

test('ORCHESTRATOR-BUDGET-CONCURRENT-ONE-WINS', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://unused', results: [],
  })));
  await setup.orchestrator.recover();
  const one = setup.orchestrator.reserveBudget(budgetInput(setup.runId));
  const two = setup.orchestrator.reserveBudget(budgetInput(setup.runId, {
    reserved: {
      promptTokens: 60_000, completionTokens: 0, wallMs: 0,
      agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null,
    },
  }));
  const outcomes = await Promise.allSettled([one, two]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'rejected']);
  assert.equal(outcomes[1].reason.code, 'WORKFLOW_BUDGET_EXCEEDED');
  assert.equal((await readEvents(setup.store, { runId: setup.runId })).length, 3);
});

test('ORCHESTRATOR-BUDGET-APPEND-FAILS-CLOSED', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://unused', results: [],
  })));
  await setup.orchestrator.recover();
  setup.store.failpoint = async (name) => {
    if (name === 'store.journal.before_append') throw new Error('injected append failure');
  };
  await assert.rejects(() => setup.orchestrator.reserveBudget(budgetInput(setup.runId)),
    /injected append failure/u);
  setup.store.failpoint = undefined;
  assert.equal((await readEvents(setup.store, { runId: setup.runId })).length, 2);
  assert.equal((await setup.orchestrator.snapshot({ runId: setup.runId })).budget.reservations.length, 0);
});

test('ORCHESTRATOR-BUDGET-REPLAY-AFTER-RESTART', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://unused', results: [],
  })));
  await setup.orchestrator.recover();
  const first = budgetInput(setup.runId);
  await setup.orchestrator.reserveBudget(first);
  const recovered = createWorkflowOrchestrator({
    store: setup.store,
    adapters: new Map([['agent-session', adapter(async () => ({
      status: 'completed', receiptRef: 'receipt://unused', results: [],
    }))]]),
    nowFn: () => '2026-09-22T13:20:00.000Z', idFn: randomUUID,
  });
  await recovered.recover();
  assert.equal((await recovered.snapshot({ runId: setup.runId })).budget.reservations[0].reservationId,
    first.reservationId);
  await assert.rejects(() => recovered.reserveBudget(budgetInput(setup.runId)),
    (error) => error?.code === 'WORKFLOW_BUDGET_EXCEEDED');
  const settled = await recovered.settleBudget({
    runId: setup.runId, reservationId: first.reservationId,
    actual: {
      promptTokens: 10_000, completionTokens: 0, wallMs: 0,
      agentSeconds: 0, toolCalls: 0, modelRequests: 0, knownCostUsd: null,
    },
  });
  assert.equal(settled.type, 'budget_settled');
  assert.equal((await recovered.snapshot({ runId: setup.runId })).budget.spent.promptTokens, 10_000);
});

test('ORCHESTRATOR-QUARANTINE-BLOCKS-EXECUTION', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://one', results: [],
  })));
  assert.equal(setup.orchestrator.status().state, 'quarantined');
  await assert.rejects(
    () => setup.orchestrator.executeNode(executeInput(setup.runId)),
    (error) => error?.code === 'WORKFLOW_RUNTIME_NOT_READY',
  );
  assert.equal((await readEvents(setup.store, { runId: setup.runId })).length, 2);
});

test('ORCHESTRATOR-RECOVERY-SCOPE-CANNOT-OMIT-RUN', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://one', results: [],
  })));
  await assert.rejects(
    () => setup.orchestrator.recover({ runIds: [] }),
    (error) => error?.code === 'WORKFLOW_RECOVERY_SCOPE_INCOMPLETE',
  );
  assert.equal(setup.orchestrator.status().state, 'quarantined');
  await setup.orchestrator.recover();
  assert.equal(setup.orchestrator.status().state, 'ready');
});

test('ORCHESTRATOR-RECOVERY-CLOSES-DURABLE-TERMINAL-SPLIT', async (t) => {
  const activityAdapter = adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://unused', results: [],
  }));
  const setup = await fixture(t, activityAdapter);
  const identity = {
    nodeId: 'implement',
    activityExecutionId: randomUUID(),
    attempt: 1,
    leaseId: randomUUID(),
    leaseEpoch: 1,
  };
  await appendEvent(setup.store, { event: event(setup.runId, 3, 'activity_scheduled', {
    activityKind: 'agent-session', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
    idempotencyKey: `${setup.runId}/implement/1`, resourceClass: 'agent',
    budgetReservationId: null, deadlineAt: null,
  }, identity) });
  await appendEvent(setup.store, { event: event(setup.runId, 4, 'activity_started', {
    adapterId: activityAdapter.id,
  }, identity) });
  await appendEvent(setup.store, { event: event(setup.runId, 5, 'activity_completed', {
    resultIds: [], receiptRef: 'receipt://durable',
  }, identity) });

  const recovered = createWorkflowOrchestrator({
    store: setup.store,
    adapters: new Map([['agent-session', activityAdapter]]),
    nowFn: () => '2026-09-22T13:20:00.000Z',
    idFn: randomUUID,
  });
  await recovered.recover();
  const snapshot = await recovered.snapshot({ runId: setup.runId });
  assert.equal(snapshot.nodeRuns.find((node) => node.nodeId === 'implement').state, 'succeeded');
  assert.equal((await readEvents(setup.store, { runId: setup.runId })).at(-1).type, 'node_succeeded');
});

test('ORCHESTRATOR-SNAPSHOT-IS-DURABLE-REPLAY', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed', receiptRef: 'receipt://one', results: [],
  })));
  await setup.orchestrator.recover({ runIds: [setup.runId] });
  await setup.orchestrator.executeNode(executeInput(setup.runId));
  const snapshot = await setup.orchestrator.snapshot({ runId: setup.runId });
  assert.equal(snapshot.run.runId, setup.runId);
  assert.equal(snapshot.nodeRuns.find((node) => node.nodeId === 'implement').state, 'succeeded');
  assert.deepEqual((await readEvents(setup.store, { runId: setup.runId })).map((entry) => entry.seq), [1, 2, 3, 4, 5, 6]);
});

test('ORCHESTRATOR-PER-RUN-APPENDS-ARE-SEQUENTIAL', async (t) => {
  let active = 0;
  let maxActive = 0;
  let release;
  let entered;
  const adapterEntered = new Promise((resolve) => { entered = resolve; });
  const first = new Promise((resolve) => { release = resolve; });
  const setup = await fixture(t, adapter(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    entered();
    await first;
    active -= 1;
    return { status: 'completed', receiptRef: 'receipt://one', results: [] };
  }));
  await setup.orchestrator.recover({ runIds: [setup.runId] });
  const one = setup.orchestrator.executeNode(executeInput(setup.runId));
  const two = setup.orchestrator.executeNode(executeInput(setup.runId));
  // F3-41b (25/09/2026): senza la coda lunga per run il secondo dispatch dello STESSO passo è rifiutato subito («un solo
  // dispatch per passo»), non dopo la fine del primo: il gestore si attacca qui, le asserzioni sotto restano le stesse.
  two.catch(() => {});
  await adapterEntered;
  assert.equal(maxActive, 1);
  release();
  const outcomes = await Promise.allSettled([one, two]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ['fulfilled', 'rejected']);
  assert.equal(outcomes[1].reason.code, 'WORKFLOW_NODE_NOT_READY');
  assert.equal(maxActive, 1);
});

test('ACTIVITY-RESULT-STORAGE-KEY-IS-CONTRACT-COMPATIBLE', async (t) => {
  const bytes = Buffer.from('verified output', 'utf8');
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed',
    receiptRef: 'receipt://result/1',
    results: [{
      kind: 'text',
      contentType: 'text/plain; charset=utf-8',
      bytes,
      summary: 'verified output',
      trust: 'validated',
      sensitivity: 'workspace',
      eligibleForIntegration: false,
      provenance: {
        workspaceBaselineHash: null,
        inputHash: `sha256:${'e'.repeat(64)}`,
        model: null,
        provider: null,
        toolVersions: {},
      },
    }],
  })));
  await setup.orchestrator.recover({ runIds: [setup.runId] });
  const completed = await setup.orchestrator.executeNode(executeInput(setup.runId));
  assert.equal(completed.resultIds.length, 1);
  const events = await readEvents(setup.store, { runId: setup.runId });
  const ref = events.find((entry) => entry.type === 'result_recorded').payload.resultRef;
  assert.match(ref.storageKey, /^[0-9a-f]{2}\/[0-9a-f]{64}$/u);
  const physical = join(setup.root, 'cas', 'sha256', ...ref.storageKey.split('/'));
  assert.deepEqual(readFileSync(physical), bytes);
  assert.ok(events.findIndex((entry) => entry.type === 'result_recorded') < events.findIndex((entry) => entry.type === 'activity_completed'));
});

test('ACTIVITY-RESULT-CANNOT-SELF-AUTHORIZE-INTEGRATION', async (t) => {
  const setup = await fixture(t, adapter(async () => ({
    status: 'completed',
    receiptRef: 'receipt://result/unsafe',
    results: [{
      kind: 'text', contentType: 'text/plain', bytes: Buffer.from('unsafe'), summary: 'unsafe',
      trust: 'validated', sensitivity: 'workspace', eligibleForIntegration: true,
      provenance: {
        workspaceBaselineHash: null, inputHash: `sha256:${'f'.repeat(64)}`,
        model: null, provider: null, toolVersions: {},
      },
    }],
  })));
  await setup.orchestrator.recover({ runIds: [setup.runId] });
  const outcome = await setup.orchestrator.executeNode(executeInput(setup.runId));
  assert.equal(outcome.status, 'uncertain');
  const events = await readEvents(setup.store, { runId: setup.runId });
  assert.equal(events.some((entry) => entry.type === 'result_recorded'), false);
  assert.equal(events.at(-1).type, 'activity_uncertain');
});

test('ORCHESTRATOR-NO-HTTP-OR-REAL-ADAPTER-COMPOSITION', () => {
  const source = readFileSync(new URL('../src/workflow-orchestrator.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['http-app', 'server.mjs', 'git-service', 'process-policy', 'agent-service']) {
    assert.equal(source.includes(forbidden), false, `unexpected concrete dependency: ${forbidden}`);
  }
});
