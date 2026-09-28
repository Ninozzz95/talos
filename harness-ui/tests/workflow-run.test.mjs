import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import {
  workflowApply,
  workflowInitialState,
  workflowIsTerminal,
  workflowProgress,
  workflowRecover,
  workflowReplay,
  workflowStateHash,
  workflowStateProjection,
} from '../src/workflow/run.mjs';

const definition = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url), 'utf8'));
const RUN = '10000000-0000-4000-8000-000000000001';
const HASH = canonicalHash(definition);

function makeEvent(seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: `20000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    runId: RUN, seq, at: `2026-09-22T11:00:${String(seq).padStart(2, '0')}.000Z`,
    type, nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
    causationId: null, correlationId: RUN, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload, ...overrides,
  };
}

const created = makeEvent(1, 'run_created', {
  workflowId: '30000000-0000-4000-8000-000000000001', definitionVersion: 1, definitionHash: HASH,
  rootSessionId: '40000000-0000-4000-8000-000000000001', workspaceBaselineId: null, workspaceBaselineHash: null,
}, {
  commandId: '50000000-0000-4000-8000-000000000001', commandType: 'start-run',
  commandPayloadHash: `sha256:${'a'.repeat(64)}`,
});

test('RUN-PURE-REPLAY — apply does not mutate its input and replay is deterministic', () => {
  const initial = workflowInitialState({ definition, runId: RUN });
  const events = [created, makeEvent(2, 'run_started')];
  const once = workflowReplay({ initialState: initial, events });
  const twice = workflowReplay({ initialState: workflowInitialState({ definition, runId: RUN }), events });
  assert.equal(initial.run.status, null);
  assert.equal(once.run.status, 'running');
  assert.deepEqual(workflowStateProjection(once), workflowStateProjection(twice));
  assert.equal(workflowStateHash(once), workflowStateHash(twice));
});

test('RUN-SEQ-AND-IDENTITY — replay rejects gaps, duplicate event IDs and cross-run events', () => {
  const initial = workflowInitialState({ definition, runId: RUN });
  assert.throws(() => workflowApply(initial, makeEvent(2, 'run_started')), /seq/i);
  const state = workflowApply(initial, created);
  assert.throws(() => workflowApply(state, { ...makeEvent(2, 'run_started'), eventId: created.eventId }), /eventId|duplicate/i);
  assert.throws(() => workflowApply(state, { ...makeEvent(2, 'run_started'), runId: '10000000-0000-4000-8000-000000000099', correlationId: '10000000-0000-4000-8000-000000000099' }), /runId/i);
});

test('RUN-TERMINAL-IDEMPOTENCE — duplicate semantic terminal facts do not change projected state', () => {
  let state = workflowReplay({ initialState: workflowInitialState({ definition, runId: RUN }), events: [created, makeEvent(2, 'run_started')] });
  state = workflowApply(state, makeEvent(3, 'node_succeeded', { resultIds: ['commit'] }, { nodeId: 'implement' }));
  const before = workflowStateHash(state);
  state = workflowApply(state, makeEvent(4, 'node_succeeded', { resultIds: ['commit'] }, { nodeId: 'implement' }));
  assert.equal(workflowStateHash(state), before);
});

test('RUN-PROGRESS-TERMINAL — progress is bounded and terminal run facts are monotone', () => {
  let state = workflowReplay({ initialState: workflowInitialState({ definition, runId: RUN }), events: [created, makeEvent(2, 'run_started')] });
  assert.deepEqual(workflowProgress(state), { completed: 0, total: 2, ratio: 0 });
  state = workflowApply(state, makeEvent(3, 'node_succeeded', { resultIds: [] }, { nodeId: 'implement' }));
  assert.deepEqual(workflowProgress(state), { completed: 1, total: 2, ratio: 0.5 });
  state = workflowApply(state, makeEvent(4, 'node_succeeded', { resultIds: [] }, { nodeId: 'test' }));
  state = workflowApply(state, makeEvent(5, 'run_succeeded', { finalResultIds: [], integrationCommit: null }));
  assert.equal(workflowIsTerminal(state), true);
  assert.throws(() => workflowApply(state, makeEvent(6, 'run_resumed', { reason: 'user' }, {
    commandId: '50000000-0000-4000-8000-000000000006', commandType: 'resume-run', commandPayloadHash: `sha256:${'f'.repeat(64)}`,
  })), /terminal|transition/i);
});

test('RUN-RECOVERY — valid checkpoint projection plus tail equals full replay', () => {
  const initial = workflowInitialState({ definition, runId: RUN });
  const events = [created, makeEvent(2, 'run_started'), makeEvent(3, 'node_succeeded', { resultIds: [] }, { nodeId: 'implement' })];
  const throughTwo = workflowReplay({ initialState: initial, events: events.slice(0, 2) });
  const recovered = workflowRecover({ checkpointState: throughTwo, events: events.slice(2) });
  const full = workflowReplay({ initialState: workflowInitialState({ definition, runId: RUN }), events });
  assert.equal(workflowStateHash(recovered), workflowStateHash(full));
});

test('RUN-DEFINITION-HASH-BINDING — initial state rejects a hash that does not identify the supplied Core', () => {
  assert.throws(() => workflowInitialState({
    definition,
    runId: RUN,
    definitionHash: `sha256:${'0'.repeat(64)}`,
  }), /definition hash|definitionHash|Core/i);
});

test('RUN-INITIAL-IDENTITY-AND-ENGINE — initial state rejects invalid identity and incompatible engine semantics', () => {
  assert.throws(() => workflowInitialState({ definition, runId: 'not-a-run-id' }), /runId|UUID/i);
  assert.throws(() => workflowInitialState({ definition, runId: RUN, engineSchemaVersion: 2 }), /engineSchemaVersion|engine/i);
  const futureDefinition = structuredClone(definition);
  futureDefinition.engineCompatibility.minEngineSchemaVersion = 2;
  assert.throws(() => workflowInitialState({ definition: futureDefinition, runId: RUN }), /compatib|engine/i);
});

test('QUESTION-RESOLVE-EXACT-NODE-READY', () => {
  const questions = [{
    id: 'strategy',
    question: 'Come vuoi proseguire?',
    options: [
      { label: 'A', description: 'Prima strada.' },
      { label: 'B', description: 'Seconda strada.' },
    ],
    multiSelect: false,
    allowOther: false,
  }];
  const answerSchema = canonicalHash({
    questions: [{ id: 'strategy', optionLabels: ['A', 'B'], multiSelect: false, allowOther: false }],
    onSkip: 'forbidden',
  });
  const requestId = '70000000-0000-4000-8000-000000000001';
  let state = workflowReplay({
    initialState: workflowInitialState({ definition, runId: RUN }),
    events: [created, makeEvent(2, 'run_started')],
  });
  state = workflowApply(state, makeEvent(3, 'human_requested', {
    gate: {
      schema: 'talos.workflow-question.v1',
      requestId,
      requestVersion: 1,
      runId: RUN,
      nodeId: 'implement',
      decisionKey: 'implementation-strategy',
      createdAt: '2026-09-22T11:00:03.000Z',
      fingerprint: canonicalHash({ questions, onSkip: 'forbidden', timeoutPolicy: null }),
      answerSchemaHash: answerSchema,
      status: 'pending',
      onSkip: 'forbidden',
      timeoutPolicy: null,
      questions,
      answers: null,
      resolvedAt: null,
    },
  }, { nodeId: 'implement' }));
  assert.equal(state.nodes.get('implement').state, 'waiting_human');
  assert.equal(state.nodes.get('implement').humanRequestId, requestId);

  state = workflowApply(state, makeEvent(4, 'human_resolved', {
    requestId,
    requestVersion: 1,
    answerSchemaHash: answerSchema,
    status: 'answered',
    answers: { strategy: 'A' },
    answerHash: canonicalHash({ status: 'answered', answers: { strategy: 'A' } }),
  }, {
    nodeId: 'implement',
    commandId: '71000000-0000-4000-8000-000000000001',
    commandType: 'answer-human-gate',
    commandPayloadHash: `sha256:${'d'.repeat(64)}`,
  }));
  assert.equal(state.nodes.get('implement').state, 'ready');
  assert.equal(state.nodes.get('implement').humanRequestId, null);
  assert.equal(state.nodes.get('test').state, 'blocked');
  assert.equal(state.humanGates.get(requestId).status, 'answered');
});
