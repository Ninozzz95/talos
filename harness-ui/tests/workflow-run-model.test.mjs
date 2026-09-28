import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { buildWorkflowIndexes } from '../src/workflow/indexes.mjs';
import {
  workflowApply,
  workflowInitialState,
  workflowReadyNodes,
  workflowRecover,
  workflowReplay,
  workflowStateHash,
  workflowStateProjection,
} from '../src/workflow/run.mjs';

const diamond = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-diamond.json', import.meta.url), 'utf8'));
const minimal = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
const RUN_ID = '10000000-0000-4000-8000-000000000001';

function event(seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1',
    eventSchemaVersion: 1,
    engineSchemaVersion: 1,
    eventId: `20000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    runId: RUN_ID,
    seq,
    at: `2026-09-22T12:00:${String(seq).padStart(2, '0')}.000Z`,
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

function bootEvents(definition) {
  return [
    event(1, 'run_created', {
      workflowId: '30000000-0000-4000-8000-000000000001',
      definitionVersion: 1,
      definitionHash: canonicalHash(definition),
      rootSessionId: '40000000-0000-4000-8000-000000000001',
      workspaceBaselineId: null,
      workspaceBaselineHash: null,
    }, {
      commandId: '50000000-0000-4000-8000-000000000001',
      commandType: 'start-run',
      commandPayloadHash: `sha256:${'a'.repeat(64)}`,
    }),
    event(2, 'run_started'),
  ];
}

function graphDefinition(nodeCount, mask) {
  const template = diamond.nodes[0];
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    ...structuredClone(template),
    id: `n${index}`,
    label: `Node ${index}`,
    priority: index % 2,
  }));
  const candidates = [];
  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = from + 1; to < nodeCount; to += 1) candidates.push([from, to]);
  }
  const edges = candidates
    .filter((unused, bit) => (mask & (1 << bit)) !== 0)
    .map(([from, to]) => ({
      id: `e_${from}_${to}`,
      from: `n${from}`,
      to: `n${to}`,
      type: 'control',
      condition: null,
      mapping: null,
    }));
  return {
    ...structuredClone(diamond),
    title: `Reference DAG ${nodeCount}/${mask}`,
    objective: 'Confrontare il reducer con un modello indipendente.',
    nodes,
    edges,
    acceptance: [],
  };
}

function weaklyConnected(nodeCount, edges) {
  if (nodeCount === 1) return true;
  const neighbours = Array.from({ length: nodeCount }, () => []);
  for (const edge of edges) {
    const from = Number(edge.from.slice(1));
    const to = Number(edge.to.slice(1));
    neighbours[from].push(to);
    neighbours[to].push(from);
  }
  const seen = new Set([0]);
  const pending = [0];
  while (pending.length > 0) {
    for (const next of neighbours[pending.pop()]) {
      if (!seen.has(next)) {
        seen.add(next);
        pending.push(next);
      }
    }
  }
  return seen.size === nodeCount;
}

function referenceReady(definition, completed) {
  const incoming = new Map(definition.nodes.map((node) => [node.id, []]));
  for (const edge of definition.edges) incoming.get(edge.to).push(edge.from);
  const priority = new Map(definition.nodes.map((node) => [node.id, node.priority]));
  return definition.nodes
    .map((node) => node.id)
    .filter((nodeId) => !completed.has(nodeId) && incoming.get(nodeId).every((dependency) => completed.has(dependency)))
    .sort((left, right) => (priority.get(right) - priority.get(left)) || left.localeCompare(right, 'en'));
}

function seededIndex(seed, length) {
  const mixed = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return mixed % length;
}

function projectIndexes(indexes) {
  return {
    remainingDeps: [...indexes.remainingDeps].sort(([left], [right]) => left.localeCompare(right, 'en')),
    readyQueue: indexes.readyQueue,
    nodesByState: [...indexes.nodesByState]
      .map(([state, ids]) => [state, [...ids].sort()])
      .sort(([left], [right]) => left.localeCompare(right, 'en')),
    activeLeaseByNode: [...indexes.activeLeaseByNode].sort(([left], [right]) => left.localeCompare(right, 'en')),
    resultRefsByNode: [...indexes.resultRefsByNode].sort(([left], [right]) => left.localeCompare(right, 'en')),
  };
}

test('M006_NODE_READY_BEFORE_DEPS', () => {
  let checked = 0;
  for (let nodeCount = 1; nodeCount <= 4; nodeCount += 1) {
    const edgeCount = (nodeCount * (nodeCount - 1)) / 2;
    for (let mask = 0; mask < (1 << edgeCount); mask += 1) {
      const definition = graphDefinition(nodeCount, mask);
      if (!weaklyConnected(nodeCount, definition.edges)) continue;
      let state = workflowReplay({
        initialState: workflowInitialState({ definition, runId: RUN_ID }),
        events: bootEvents(definition),
      });
      const completed = new Set();
      let seq = 3;
      while (completed.size < nodeCount) {
        const expected = referenceReady(definition, completed);
        assert.deepEqual(workflowReadyNodes(state), expected, `ready mismatch for n=${nodeCount}, mask=${mask}`);
        const selected = expected[seededIndex(mask + seq + nodeCount, expected.length)];
        state = workflowApply(state, event(seq, 'node_succeeded', { resultIds: [] }, { nodeId: selected }));
        completed.add(selected);
        seq += 1;
      }
      assert.deepEqual(workflowReadyNodes(state), []);
      checked += 1;
    }
  }
  assert.equal(checked, 44, 'all weakly connected ordered DAGs with one through four nodes were checked');
});

test('M008_ACTIVITY_TERMINAL_DUPLICATED', () => {
  let state = workflowReplay({
    initialState: workflowInitialState({ definition: minimal, runId: RUN_ID }),
    events: bootEvents(minimal),
  });
  const identity = {
    nodeId: 'implement',
    activityExecutionId: '60000000-0000-4000-8000-000000000001',
    attempt: 1,
    leaseId: '70000000-0000-4000-8000-000000000001',
    leaseEpoch: 1,
  };
  state = workflowApply(state, event(3, 'activity_scheduled', {
    activityKind: 'agent-session', effectClass: 'reconcilable', retryMode: 'manual-on-uncertain',
    idempotencyKey: 'run/implement/1', resourceClass: 'agent', budgetReservationId: null, deadlineAt: null,
  }, identity));
  state = workflowApply(state, event(4, 'activity_started', { adapterId: 'agent-service' }, identity));
  state = workflowApply(state, event(5, 'activity_completed', { resultIds: ['result-1'], receiptRef: 'receipt-1' }, identity));
  const terminalHash = workflowStateHash(state);
  state = workflowApply(state, event(6, 'activity_completed', { resultIds: ['result-1'], receiptRef: 'receipt-1' }, identity));
  assert.equal(workflowStateHash(state), terminalHash);
  assert.equal(state.activities.get(identity.activityExecutionId).state, 'completed');
});

test('M015_REDUCER_READS_CLOCK_OR_RANDOM', async () => {
  const source = await readFile(new URL('../src/workflow/run.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(?:Date\.now|Math\.random|randomUUID|performance\.now)\b/u);
  const events = bootEvents(minimal);
  const left = workflowReplay({ initialState: workflowInitialState({ definition: minimal, runId: RUN_ID }), events });
  const right = workflowReplay({ initialState: workflowInitialState({ definition: minimal, runId: RUN_ID }), events });
  assert.deepEqual(workflowStateProjection(left), workflowStateProjection(right));
});

test('M039_SHADOW_REPLAY_HASH_DIVERGENCE_IGNORED', () => {
  const state = workflowReplay({
    initialState: workflowInitialState({ definition: minimal, runId: RUN_ID }),
    events: bootEvents(minimal),
  });
  const expected = workflowStateHash(state);
  const divergent = structuredClone(state);
  divergent.nodes.get('implement').state = 'succeeded';
  assert.notEqual(workflowStateHash(divergent), expected);
  assert.throws(() => workflowRecover({ checkpointState: divergent, expectedStateHash: expected }), /stateHash mismatch/i);
});

test('M047_READY_DUAL_WRITE_DRIFT', () => {
  let state = workflowReplay({
    initialState: workflowInitialState({ definition: minimal, runId: RUN_ID }),
    events: bootEvents(minimal),
  });
  assert.deepEqual(projectIndexes(state.indexes), projectIndexes(buildWorkflowIndexes(state.definition, state)));
  state = workflowApply(state, event(3, 'node_succeeded', { resultIds: [] }, { nodeId: 'implement' }));
  assert.deepEqual(projectIndexes(state.indexes), projectIndexes(buildWorkflowIndexes(state.definition, state)));
});

test('M087_STATE_HASH_OMITS_DURABLE_CONTROL_STATE', () => {
  let state = workflowReplay({
    initialState: workflowInitialState({ definition: minimal, runId: RUN_ID }),
    events: bootEvents(minimal),
  });
  const runningHash = workflowStateHash(state);
  state = workflowApply(state, event(3, 'run_pause_requested', { reason: 'user' }, {
    commandId: '50000000-0000-4000-8000-000000000002',
    commandType: 'pause-run',
    commandPayloadHash: `sha256:${'b'.repeat(64)}`,
  }));
  assert.notEqual(workflowStateHash(state), runningHash);
  assert.equal(workflowStateProjection(state).run.status, 'pausing');
});
