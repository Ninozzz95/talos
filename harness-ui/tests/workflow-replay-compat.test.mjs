import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import {
  upgradeCheckpoint,
  upgradeDefinition,
  upgradeEvent,
  upgradeSnapshot,
} from '../src/workflow/migrations.mjs';

const definitionRecord = JSON.parse(await readFile(
  new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url),
  'utf8',
));
const RUN_ID = '10000000-0000-4000-8000-000000000001';

function runCreatedEvent() {
  return {
    schema: 'talos.workflow-event.v1',
    eventSchemaVersion: 1,
    engineSchemaVersion: 1,
    eventId: '20000000-0000-4000-8000-000000000001',
    runId: RUN_ID,
    seq: 1,
    at: '2026-09-22T10:00:00.000Z',
    type: 'run_created',
    nodeId: null,
    commandId: '30000000-0000-4000-8000-000000000001',
    commandType: 'start-run',
    commandPayloadHash: `sha256:${'a'.repeat(64)}`,
    causationId: null,
    correlationId: RUN_ID,
    graphVersion: 1,
    activityExecutionId: null,
    attempt: null,
    leaseId: null,
    leaseEpoch: null,
    payload: {
      workflowId: definitionRecord.workflowId,
      definitionVersion: definitionRecord.version,
      definitionHash: definitionRecord.definitionHash,
      rootSessionId: '40000000-0000-4000-8000-000000000001',
      workspaceBaselineId: null,
      workspaceBaselineHash: null,
    },
  };
}

function checkpoint() {
  const state = { schema: 'talos.workflow-serialized-state.v1', lastSeq: 1 };
  return {
    schema: 'talos.workflow-checkpoint.v1',
    checkpointSchemaVersion: 1,
    engineSchemaVersion: 1,
    runId: RUN_ID,
    definitionHash: definitionRecord.definitionHash,
    throughSeq: 1,
    stateHash: canonicalHash(state),
    graphVersion: 1,
    createdAt: '2026-09-22T10:00:01.000Z',
    state,
    indexSeed: {},
  };
}

function snapshot() {
  return {
    schema: 'talos.workflow-snapshot.v1',
    snapshotSchemaVersion: 1,
    runId: RUN_ID,
    throughSeq: 1,
    graphVersion: 1,
    stateHash: `sha256:${'b'.repeat(64)}`,
    definitionHash: definitionRecord.definitionHash,
    nodes: [],
    edges: [],
    clusters: [],
  };
}

test('M016_OLD_EVENT_SCHEMA_NOT_MIGRATED — current v1 records cross a pure upgrade boundary', () => {
  const event = runCreatedEvent();
  const upgradedEvent = upgradeEvent(event);
  const upgradedDefinition = upgradeDefinition(definitionRecord);
  const upgradedCheckpoint = upgradeCheckpoint(checkpoint());
  const upgradedSnapshot = upgradeSnapshot(snapshot());

  assert.deepEqual(upgradedEvent, event);
  assert.notEqual(upgradedEvent, event);
  assert.notEqual(upgradedEvent.payload, event.payload);
  assert.deepEqual(upgradedDefinition, definitionRecord);
  assert.notEqual(upgradedDefinition, definitionRecord);
  assert.deepEqual(upgradedCheckpoint, checkpoint());
  assert.deepEqual(upgradedSnapshot, snapshot());
});

test('WF-PHASE-V1-HASH-REPLAY — historical v1 is byte/hash stable while v2 core upgrades without rewriting envelope', () => {
  const v1Bytes = JSON.stringify(definitionRecord);
  const historical = upgradeDefinition(definitionRecord);
  assert.equal(JSON.stringify(definitionRecord), v1Bytes);
  assert.equal(historical.definitionHash, definitionRecord.definitionHash);
  assert.deepEqual(historical.core, definitionRecord.core);

  const v2 = structuredClone(definitionRecord);
  v2.core.schema = 'talos.workflow-definition-core.v2';
  v2.core.definitionSchemaVersion = 2;
  v2.core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  for (const node of v2.core.nodes) node.phaseId = node.id === 'test' ? 'verification' : 'implementation';
  v2.definitionHash = canonicalHash(v2.core);
  assert.equal(upgradeDefinition(v2).definitionHash, v2.definitionHash);
  assert.equal(v2.schema, 'talos.workflow-definition-record.v1');
  assert.equal(JSON.stringify(definitionRecord), v1Bytes);
});

test('REPLAY-COMPAT-FUTURE — future persisted schemas fail closed with WORKFLOW_SCHEMA_FUTURE', () => {
  const fixtures = [
    [upgradeEvent, { ...runCreatedEvent(), schema: 'talos.workflow-event.v3', eventSchemaVersion: 3 }],
    [upgradeDefinition, { ...definitionRecord, schema: 'talos.workflow-definition-record.v2' }],
    [upgradeCheckpoint, { ...checkpoint(), schema: 'talos.workflow-checkpoint.v2', checkpointSchemaVersion: 2 }],
    [upgradeSnapshot, { ...snapshot(), schema: 'talos.workflow-snapshot.v2', snapshotSchemaVersion: 2 }],
  ];
  for (const [upgrade, value] of fixtures) {
    assert.throws(() => upgrade(value), (error) => error?.code === 'WORKFLOW_SCHEMA_FUTURE');
  }
});

test('CAPACITY-V3-FUTURE-FAILS-CLOSED — v2 event upgrade is pure and v3 remains unsupported', () => {
  const v2 = { ...runCreatedEvent(), schema: 'talos.workflow-event.v2', eventSchemaVersion: 2 };
  assert.deepEqual(upgradeEvent(v2), v2);
  assert.notEqual(upgradeEvent(v2), v2);
  assert.throws(() => upgradeEvent({ ...v2, schema: 'talos.workflow-event.v3', eventSchemaVersion: 3 }),
    (error) => error?.code === 'WORKFLOW_SCHEMA_FUTURE');
});

test('REPLAY-COMPAT-PAST — ungrounded historical shapes are rejected until a real fixture exists', () => {
  const fixtures = [
    [upgradeEvent, { ...runCreatedEvent(), schema: 'talos.workflow-event.v0', eventSchemaVersion: 0 }],
    [upgradeDefinition, { ...definitionRecord, schema: 'talos.workflow-definition-record.v0' }],
    [upgradeCheckpoint, { ...checkpoint(), schema: 'talos.workflow-checkpoint.v0', checkpointSchemaVersion: 0 }],
    [upgradeSnapshot, { ...snapshot(), schema: 'talos.workflow-snapshot.v0', snapshotSchemaVersion: 0 }],
  ];
  for (const [upgrade, value] of fixtures) {
    assert.throws(() => upgrade(value), (error) => error?.code === 'WORKFLOW_SCHEMA_UNSUPPORTED');
  }
});

test('REPLAY-COMPAT-STRICT — current-version values are still structurally validated', () => {
  assert.throws(
    () => upgradeEvent({ ...runCreatedEvent(), payload: {} }),
    (error) => error?.code === 'WORKFLOW_EVENT_INVALID',
  );
  assert.throws(
    () => upgradeCheckpoint({ ...checkpoint(), unexpected: true }),
    (error) => error?.code === 'WORKFLOW_CHECKPOINT_INVALID',
  );
  assert.throws(
    () => upgradeSnapshot({ ...snapshot(), nodes: null }),
    (error) => error?.code === 'WORKFLOW_SNAPSHOT_INVALID',
  );

  let getterReads = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'schema', {
    enumerable: true,
    get() { getterReads += 1; return 'talos.workflow-event.v1'; },
  });
  assert.throws(() => upgradeEvent(accessor));
  assert.equal(getterReads, 0, 'schema gates must reject accessors before reading untrusted values');
});
