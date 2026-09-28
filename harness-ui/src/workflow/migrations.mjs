import { validateCanonicalizable } from './canonical-json.mjs';
import { validateWorkflowDefinitionRecord, validateWorkflowEvent } from './contract.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export class WorkflowMigrationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'WorkflowMigrationError';
    this.code = code;
  }
}

function migrationError(message, code) {
  throw new WorkflowMigrationError(message, code);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, fields, code, label) {
  if (!plainObject(value)) migrationError(`${label} must be a plain object`, code);
  const allowed = new Set(fields);
  if (Object.keys(value).length !== fields.length
    || Object.keys(value).some((key) => !allowed.has(key))) {
    migrationError(`${label} has an unknown or missing field`, code);
  }
}

function schemaVersion(value, prefix, versionField, maxSupported = 1) {
  const match = typeof value?.schema === 'string'
    ? new RegExp(`^${prefix.replaceAll('.', '\\.')}\\.v([0-9]+)$`, 'u').exec(value.schema)
    : null;
  if (!match) migrationError(`Unsupported ${prefix} schema`, 'WORKFLOW_SCHEMA_UNSUPPORTED');
  const declared = Number(match[1]);
  const explicit = versionField === null ? declared : value[versionField];
  if ((Number.isSafeInteger(declared) && declared > maxSupported)
    || (Number.isSafeInteger(explicit) && explicit > maxSupported)) {
    migrationError(`Future ${prefix} schema is unsupported`, 'WORKFLOW_SCHEMA_FUTURE');
  }
  if (!Number.isSafeInteger(declared) || declared < 1 || declared !== explicit) {
    migrationError(`Historical ${prefix} schema has no grounded migration`, 'WORKFLOW_SCHEMA_UNSUPPORTED');
  }
}

function clone(value) {
  validateCanonicalizable(value);
  return structuredClone(value);
}

function validUtc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

export function upgradeEvent(value) {
  validateCanonicalizable(value);
  schemaVersion(value, 'talos.workflow-event', 'eventSchemaVersion', 2);
  const upgraded = clone(value);
  try {
    validateWorkflowEvent(upgraded);
  } catch (error) {
    if (error?.code === 'WORKFLOW_SCHEMA_FUTURE') throw error;
    migrationError(error.message, 'WORKFLOW_EVENT_INVALID');
  }
  return upgraded;
}

export function upgradeDefinition(value) {
  validateCanonicalizable(value);
  schemaVersion(value, 'talos.workflow-definition-record', null);
  schemaVersion(value?.core, 'talos.workflow-definition-core', 'definitionSchemaVersion', 2);
  const upgraded = clone(value);
  validateWorkflowDefinitionRecord(upgraded);
  return upgraded;
}

export function upgradeCheckpoint(value) {
  validateCanonicalizable(value);
  schemaVersion(value, 'talos.workflow-checkpoint', 'checkpointSchemaVersion');
  const code = 'WORKFLOW_CHECKPOINT_INVALID';
  const fields = [
    'schema', 'checkpointSchemaVersion', 'engineSchemaVersion', 'runId', 'definitionHash',
    'throughSeq', 'stateHash', 'graphVersion', 'createdAt', 'state', 'indexSeed',
  ];
  exactKeys(value, fields, code, 'workflow checkpoint');
  try { validateCanonicalizable(value); } catch (error) { migrationError(error.message, code); }
  if (value.engineSchemaVersion !== 1) {
    if (Number.isSafeInteger(value.engineSchemaVersion) && value.engineSchemaVersion > 1) {
      migrationError('Future checkpoint engine schema is unsupported', 'WORKFLOW_SCHEMA_FUTURE');
    }
    migrationError('Checkpoint engine schema is unsupported', 'WORKFLOW_SCHEMA_UNSUPPORTED');
  }
  if (!UUID.test(value.runId) || !SHA256.test(value.definitionHash) || !SHA256.test(value.stateHash)
    || !Number.isSafeInteger(value.throughSeq) || value.throughSeq < 0
    || !Number.isSafeInteger(value.graphVersion) || value.graphVersion < 0
    || !validUtc(value.createdAt) || !plainObject(value.state) || !plainObject(value.indexSeed)) {
    migrationError('Workflow checkpoint violates its v1 contract', code);
  }
  return structuredClone(value);
}

export function upgradeSnapshot(value) {
  validateCanonicalizable(value);
  schemaVersion(value, 'talos.workflow-snapshot', 'snapshotSchemaVersion');
  const code = 'WORKFLOW_SNAPSHOT_INVALID';
  const fields = [
    'schema', 'snapshotSchemaVersion', 'runId', 'throughSeq', 'graphVersion',
    'stateHash', 'definitionHash', 'nodes', 'edges', 'clusters',
  ];
  exactKeys(value, fields, code, 'workflow snapshot');
  try { validateCanonicalizable(value); } catch (error) { migrationError(error.message, code); }
  if (!UUID.test(value.runId) || !SHA256.test(value.stateHash) || !SHA256.test(value.definitionHash)
    || !Number.isSafeInteger(value.throughSeq) || value.throughSeq < 0
    || !Number.isSafeInteger(value.graphVersion) || value.graphVersion < 0
    || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || !Array.isArray(value.clusters)) {
    migrationError('Workflow snapshot violates its v1 contract', code);
  }
  return structuredClone(value);
}
