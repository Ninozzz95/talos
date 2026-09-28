import assert from 'node:assert/strict';
import test from 'node:test';

import { createActivityRunner } from '../src/workflow/activity-runner.mjs';

const IDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
];
const RUN_ID = '20000000-0000-4000-8000-000000000001';

function definition(effectClass = 'reconcilable', retryMode = 'manual-on-uncertain') {
  return {
    schema: 'talos.workflow-definition-core.v1',
    nodes: [{
      id: 'work', kind: 'agent', activityPolicy: {
        effectClass, retryMode, maxAttempts: 2, deadlineMs: null,
      },
    }],
    // F3-32 (25/09/2026): una Definition valida ha sempre i suoi archi (il contratto li pretende); il runner li legge per
    // passare a un passo i risultati dei predecessori, prima di `activity_scheduled`.
    edges: [],
  };
}

function fakeJournal(options = {}) {
  const facts = [];
  const state = {
    run: { runId: RUN_ID, status: 'running', graphVersion: 1, cancelRequested: options.cancelRequested ?? false },
    definitionHash: `sha256:${'a'.repeat(64)}`,
    nodes: new Map([['work', {
      nodeId: 'work', state: 'ready', attempt: 0, leaseEpoch: 0,
      activeLeaseId: null, activeActivityExecutionId: null, resultRefIds: [],
    }]]),
    activities: new Map(),
    resultRefs: new Map(options.resultRefs ?? []),
  };
  const core = options.definition ?? definition();
  return {
    facts,
    state,
    async load() { return { definition: core, state, events: facts }; },
    async append(_runId, fact) {
      if (options.failOnType === fact.type) throw Object.assign(new Error('append failed'), { code: 'TEST_APPEND_FAILED' });
      facts.push(structuredClone(fact));
      const node = state.nodes.get(fact.nodeId);
      if (fact.type === 'activity_scheduled') {
        state.activities.set(fact.activityExecutionId, {
          activityExecutionId: fact.activityExecutionId,
          nodeId: fact.nodeId,
          attempt: fact.attempt,
          leaseId: fact.leaseId,
          leaseEpoch: fact.leaseEpoch,
          state: 'scheduled',
          activityKind: fact.payload.activityKind,
          effectClass: fact.payload.effectClass,
          retryMode: fact.payload.retryMode,
        });
        Object.assign(node, {
          state: 'leased', attempt: fact.attempt, leaseEpoch: fact.leaseEpoch,
          activeLeaseId: fact.leaseId, activeActivityExecutionId: fact.activityExecutionId,
        });
      } else if (fact.type === 'activity_started') {
        state.activities.get(fact.activityExecutionId).state = 'started';
        node.state = 'running';
      } else if (fact.type === 'activity_completed') {
        state.activities.get(fact.activityExecutionId).state = 'completed';
      } else if (fact.type === 'activity_failed') {
        state.activities.get(fact.activityExecutionId).state = 'failed';
      } else if (fact.type === 'activity_uncertain') {
        state.activities.get(fact.activityExecutionId).state = 'uncertain';
        node.state = 'uncertain';
      } else if (fact.type === 'activity_reconciled') {
        state.activities.get(fact.activityExecutionId).state = fact.payload.outcome === 'still_unknown' ? 'uncertain' : 'reconciled';
        node.state = fact.payload.outcome === 'still_unknown' ? 'uncertain' : 'reconciling';
      } else if (fact.type === 'node_succeeded') {
        node.state = 'succeeded';
        node.resultRefIds = [...fact.payload.resultIds];
        node.activeLeaseId = null;
        node.activeActivityExecutionId = null;
      } else if (fact.type === 'node_failed') node.state = 'failed';
      else if (fact.type === 'node_cancelled') {
        node.state = 'cancelled';
        node.activeLeaseId = null;
        node.activeActivityExecutionId = null;
      }
      return fact;
    },
  };
}

function idFn() {
  let index = 0;
  return () => IDS[index++] ?? `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function completedAdapter(overrides = {}) {
  return {
    id: 'agent-test-adapter',
    async execute() {
      return { status: 'completed', receiptRef: 'receipt://agent/1', results: [], ...overrides };
    },
    async reconcile() { return { outcome: 'still_unknown', receiptRef: null, resultIds: [] }; },
    async cancel() { return { outcome: 'cancelled', evidenceResultIds: [] }; },
  };
}

function runnerFor(journal, adapter, options = {}) {
  return createActivityRunner({
    journal,
    adapters: new Map([['agent-session', adapter]]),
    publishResult: options.publishResult ?? (async () => { throw new Error('unexpected result'); }),
    nowFn: () => '2026-09-22T12:00:00.000Z',
    idFn: idFn(),
    nestedActivityGateway: options.nestedActivityGateway,
  });
}

async function ready(runner) {
  await runner.recover({ runIds: [] });
}

const executeInput = {
  runId: RUN_ID,
  nodeId: 'work',
  activityKind: 'agent-session',
  resourceClass: 'agent',
  idempotencyKey: 'run/work/1',
  budgetReservationId: null,
  deadlineAt: null,
};

test('M048_EFFECT_BEFORE_DURABLE_STARTED', async () => {
  const journal = fakeJournal();
  let observed = [];
  const adapter = completedAdapter({});
  adapter.execute = async () => {
    observed = journal.facts.map((fact) => fact.type);
    return { status: 'completed', receiptRef: 'receipt://agent/1', results: [] };
  };
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  await runner.execute(executeInput);
  assert.deepEqual(observed, ['activity_scheduled', 'activity_started']);
  assert.deepEqual(journal.facts.map((fact) => fact.type), [
    'activity_scheduled', 'activity_started', 'activity_completed', 'node_succeeded',
  ]);
});

test('ACTIVITY-START-APPEND-FAILS-CLOSED', async () => {
  const journal = fakeJournal({ failOnType: 'activity_started' });
  let effects = 0;
  const adapter = completedAdapter();
  adapter.execute = async () => { effects += 1; return { status: 'completed', receiptRef: 'x', results: [] }; };
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  await assert.rejects(() => runner.execute(executeInput), (error) => error?.code === 'TEST_APPEND_FAILED');
  assert.equal(effects, 0);
  assert.deepEqual(journal.facts.map((fact) => fact.type), ['activity_scheduled']);
});

test('M014_EFFECT_WITHOUT_RECEIPT_MARKED_FAILED', async () => {
  const journal = fakeJournal();
  const adapter = completedAdapter({ receiptRef: null });
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  const result = await runner.execute(executeInput);
  assert.equal(result.status, 'uncertain');
  assert.equal(journal.facts.at(-1).type, 'activity_uncertain');
  assert.equal(journal.facts.some((fact) => fact.type === 'activity_failed'), false);
});

test('ACTIVITY-CERTAIN-FAILURE-IS-TERMINAL', async () => {
  const journal = fakeJournal();
  const adapter = completedAdapter();
  adapter.execute = async () => ({
    status: 'failed', errorClass: 'validation', retryable: false, evidenceResultIds: [],
  });
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  await runner.execute(executeInput);
  assert.deepEqual(journal.facts.slice(-2).map((fact) => fact.type), ['activity_failed', 'node_failed']);
});

test('ACTIVITY-RESULT-PUBLISHED-BEFORE-COMPLETION', async () => {
  const journal = fakeJournal();
  const order = [];
  const draft = {
    kind: 'text', contentType: 'text/plain', bytes: Buffer.from('done'), summary: 'done',
    trust: 'validated', sensitivity: 'workspace', eligibleForIntegration: false,
    provenance: {
      workspaceBaselineHash: null, inputHash: `sha256:${'b'.repeat(64)}`,
      model: null, provider: null, toolVersions: {},
    },
  };
  const adapter = completedAdapter({ results: [draft] });
  const runner = runnerFor(journal, adapter, {
    publishResult: async (input) => {
      order.push('publish');
      assert.equal(input.draft, draft);
      journal.state.resultRefs.set('result-1', {
        id: 'result-1', activityExecutionId: input.identity.activityExecutionId,
      });
      return { id: 'result-1' };
    },
  });
  const originalAppend = journal.append;
  journal.append = async (...args) => {
    if (args[1].type === 'activity_completed') order.push('complete');
    return originalAppend(...args);
  };
  await ready(runner);
  await runner.execute(executeInput);
  assert.deepEqual(order, ['publish', 'complete']);
  assert.deepEqual(journal.facts.at(-2).payload.resultIds, ['result-1']);
});

test('M009_STALE_LEASE_ACCEPTED', async () => {
  const journal = fakeJournal();
  const adapter = completedAdapter();
  adapter.execute = async () => {
    const node = journal.state.nodes.get('work');
    node.activeLeaseId = '90000000-0000-4000-8000-000000000099';
    node.leaseEpoch += 1;
    return { status: 'completed', receiptRef: 'receipt://stale', results: [] };
  };
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  const result = await runner.execute(executeInput);
  assert.equal(result.status, 'stale');
  assert.equal(journal.facts.at(-1).type, 'stale_activity_completion_observed');
  assert.equal(journal.facts.some((fact) => fact.type === 'activity_completed'), false);
});

test('M013_PARENT_CANCEL_NOT_PROPAGATED', async () => {
  const journal = fakeJournal();
  const controller = new AbortController();
  let observedAbort = false;
  const adapter = completedAdapter();
  adapter.execute = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      observedAbort = true;
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true });
    controller.abort('parent_cancelled');
  });
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  const result = await runner.execute({ ...executeInput, signal: controller.signal });
  assert.equal(observedAbort, true);
  assert.equal(result.status, 'uncertain');
});

test('M049_NESTED_AGENT_EFFECT_UNTRACKED', async () => {
  const journal = fakeJournal();
  const adapter = completedAdapter();
  adapter.execute = async (context) => {
    assert.deepEqual(Object.keys(context.nestedEffects).sort(), ['mode', 'request']);
    assert.equal(context.nestedEffects.mode, 'activity-only');
    await assert.rejects(() => context.nestedEffects.request({ kind: 'external-tool' }), (error) => error?.code === 'WORKFLOW_NESTED_EFFECT_FORBIDDEN');
    assert.equal('tools' in context, false);
    return { status: 'completed', receiptRef: 'receipt://agent/1', results: [] };
  };
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  const outcome = await runner.execute(executeInput);
  assert.equal(outcome.status, 'completed');
});

test('ACTIVITY-KIND-MUST-MATCH-APPROVED-NODE-KIND', async () => {
  const journal = fakeJournal();
  const runner = createActivityRunner({
    journal,
    adapters: new Map([['external-tool', completedAdapter()]]),
    publishResult: async () => { throw new Error('unexpected result'); },
    nowFn: () => '2026-09-22T12:00:00.000Z',
    idFn: idFn(),
  });
  await ready(runner);
  await assert.rejects(
    () => runner.execute({ ...executeInput, activityKind: 'external-tool' }),
    (error) => error?.code === 'WORKFLOW_ACTIVITY_KIND_MISMATCH',
  );
  assert.equal(journal.facts.length, 0);
});

test('M055_SERVER_READY_BEFORE_RECOVERY_QUARANTINE', async () => {
  const runner = runnerFor(fakeJournal(), completedAdapter());
  assert.equal(runner.status().state, 'quarantined');
  await assert.rejects(() => runner.execute(executeInput), (error) => error?.code === 'WORKFLOW_RUNTIME_NOT_READY');
});

test('M080_WORKFLOW_READY_WHILE_UNCERTAIN_RECOVERY_PENDING', async () => {
  const journal = fakeJournal();
  const identity = {
    nodeId: 'work', activityExecutionId: IDS[0], attempt: 1, leaseId: IDS[1], leaseEpoch: 1,
  };
  await journal.append(RUN_ID, {
    type: 'activity_scheduled', ...identity,
    payload: {
      activityKind: 'agent-session', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
      idempotencyKey: 'run/work/1', resourceClass: 'agent', budgetReservationId: null, deadlineAt: null,
    },
  });
  await journal.append(RUN_ID, { type: 'activity_started', ...identity, payload: { adapterId: 'agent-test-adapter' } });
  let release;
  const adapter = completedAdapter();
  adapter.reconcile = () => new Promise((resolve) => { release = resolve; });
  const runner = runnerFor(journal, adapter);
  const recovering = runner.recover({ runIds: [RUN_ID] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runner.status().state, 'recovering');
  release({ outcome: 'still_unknown', receiptRef: null, resultIds: [] });
  await recovering;
  assert.equal(runner.status().state, 'ready');
  assert.deepEqual(journal.facts.slice(-2).map((fact) => fact.type), ['activity_uncertain', 'activity_reconciled']);
});

test('ACTIVITY-RECOVERY-DOES-NOT-INVENT-POST-RECONCILE-TERMINAL', async () => {
  const journal = fakeJournal();
  const identity = {
    nodeId: 'work', activityExecutionId: IDS[0], attempt: 1, leaseId: IDS[1], leaseEpoch: 1,
  };
  await journal.append(RUN_ID, {
    type: 'activity_scheduled', ...identity,
    payload: {
      activityKind: 'agent-session', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
      idempotencyKey: 'run/work/1', resourceClass: 'agent', budgetReservationId: null, deadlineAt: null,
    },
  });
  await journal.append(RUN_ID, { type: 'activity_started', ...identity, payload: { adapterId: 'agent-test-adapter' } });
  const adapter = completedAdapter();
  adapter.reconcile = async () => ({ outcome: 'proved_completed', receiptRef: 'receipt://recovered', resultIds: [] });
  const runner = runnerFor(journal, adapter);
  await runner.recover({ runIds: [RUN_ID] });
  assert.equal(journal.facts.at(-1).type, 'activity_reconciled');
  assert.equal(journal.facts.some((fact) => fact.type === 'activity_completed'), false);
  assert.equal(journal.facts.some((fact) => fact.type === 'node_succeeded'), false);
});

test('M059_CANCEL_SUBGRAPH_DELETES_EVIDENCE', async () => {
  const evidence = { id: 'evidence-1', sha256: `sha256:${'c'.repeat(64)}` };
  const journal = fakeJournal({ resultRefs: [['evidence-1', evidence]], cancelRequested: true });
  const adapter = completedAdapter();
  adapter.execute = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
  });
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  const execution = runner.execute(executeInput);
  await new Promise((resolve) => setImmediate(resolve));
  const activityExecutionId = journal.facts[0].activityExecutionId;
  await runner.cancel({ runId: RUN_ID, activityExecutionId, reason: 'run_cancelled' });
  await execution;
  assert.equal(journal.state.resultRefs.get('evidence-1'), evidence);
  assert.equal(journal.facts.some((fact) => fact.type === 'node_cancelled'), true);
});

test('CANCEL-REQUIRES-DURABLE-INTENT', async () => {
  const journal = fakeJournal();
  const adapter = completedAdapter();
  adapter.execute = () => new Promise(() => {});
  const runner = runnerFor(journal, adapter);
  await ready(runner);
  void runner.execute(executeInput);
  await new Promise((resolve) => setImmediate(resolve));
  const activityExecutionId = journal.facts[0].activityExecutionId;
  await assert.rejects(
    () => runner.cancel({ runId: RUN_ID, activityExecutionId, reason: 'run_cancelled' }),
    (error) => error?.code === 'WORKFLOW_CANCEL_INTENT_MISSING',
  );
});

test('ACTIVITY-RECOVERY-CLOSES-DURABLE-TERMINAL-SPLIT', async () => {
  const journal = fakeJournal();
  const identity = {
    nodeId: 'work', activityExecutionId: IDS[0], attempt: 1, leaseId: IDS[1], leaseEpoch: 1,
  };
  await journal.append(RUN_ID, {
    type: 'activity_scheduled', ...identity,
    payload: {
      activityKind: 'agent-session', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
      idempotencyKey: 'run/work/1', resourceClass: 'agent', budgetReservationId: null, deadlineAt: null,
    },
  });
  await journal.append(RUN_ID, { type: 'activity_started', ...identity, payload: { adapterId: 'agent-test-adapter' } });
  await journal.append(RUN_ID, { type: 'activity_completed', ...identity, payload: { resultIds: [], receiptRef: 'receipt://done' } });
  assert.equal(journal.state.nodes.get('work').state, 'running');
  const runner = runnerFor(journal, completedAdapter());
  await runner.recover({ runIds: [RUN_ID] });
  assert.equal(journal.facts.at(-1).type, 'node_succeeded');
  assert.equal(journal.state.nodes.get('work').state, 'succeeded');
});

test('WF-RUNNER-CONTEXT-BEFORE-SCHEDULE: a step context that cannot be built fails loudly with no fact, never as an uncertain effect (F3-32)', async () => {
  const senzaArchi = definition();
  delete senzaArchi.edges; // una Definition che il contratto non ammetterebbe: il runner deve fermarsi, non indovinare
  const journal = fakeJournal({ definition: senzaArchi });
  let chiamato = false;
  const runner = runnerFor(journal, { ...completedAdapter(), async execute() { chiamato = true; return { status: 'completed', receiptRef: 'r', results: [] }; } });
  await ready(runner);
  await assert.rejects(runner.execute(executeInput), TypeError);
  assert.deepEqual(journal.facts, [], 'no activity_scheduled, no activity_started, no activity_uncertain');
  assert.equal(chiamato, false, 'the adapter was never called');
});
