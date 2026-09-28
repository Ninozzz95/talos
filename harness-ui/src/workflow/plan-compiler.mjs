import { canonicalHash, canonicalJson, validateCanonicalizable } from './canonical-json.mjs';
import {
  validateWorkflowDefinitionCore,
  validateWorkflowDefinitionRecord,
} from './contract.mjs';
import { preflightWorkflowDefinition } from './preflight.mjs';
import { createDefinition, readDefinition } from './store.mjs';

const INPUT_KEYS = Object.freeze([
  'core', 'workflowId', 'version', 'initiatingSessionId', 'plannerModel', 'sessionModel',
]);
const DEP_KEYS = Object.freeze(['nowFn', 'preflightContext']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class WorkflowPlanCompileError extends Error {
  constructor(message, code = 'WORKFLOW_DEFINITION_INVALID', { cause, preflight } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowPlanCompileError';
    this.code = code;
    if (preflight) this.preflight = structuredClone(preflight);
  }
}

function fail(message, code = 'WORKFLOW_DEFINITION_INVALID', options) {
  throw new WorkflowPlanCompileError(message, code, options);
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactObject(value, keys, path) {
  try { validateCanonicalizable(value); } catch (error) { fail(`${path} is not canonical JSON: ${error.message}`, 'WORKFLOW_DEFINITION_INVALID', { cause: error }); }
  if (!plainObject(value)) fail(`${path} must be a plain object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    fail(`${path} has an unknown or missing field`);
  }
}

function validateDeps(value) {
  if (value === undefined) return { nowFn: () => new Date().toISOString(), preflightContext: {} };
  if (!plainObject(value)) fail('compileWorkflowProposal deps must be a plain object');
  for (const key of Object.keys(value)) if (!DEP_KEYS.includes(key)) fail(`compileWorkflowProposal deps has unknown field ${key}`);
  if (value.nowFn !== undefined && typeof value.nowFn !== 'function') fail('compileWorkflowProposal deps.nowFn must be a function');
  return {
    nowFn: value.nowFn ?? (() => new Date().toISOString()),
    preflightContext: value.preflightContext ?? {},
  };
}

function sameProposalInput(record, input) {
  return record.workflowId === input.workflowId
    && record.version === input.version
    && canonicalJson(record.core) === canonicalJson(input.core)
    && record.proposal.initiatingSessionId === input.initiatingSessionId
    && record.proposal.plannerModel === input.plannerModel
    && record.proposal.sessionModel === input.sessionModel;
}

export async function compileWorkflowProposal(store, input, deps = {}) {
  exactObject(input, INPUT_KEYS, 'compileWorkflowProposal input');
  if (!UUID.test(input.workflowId) || !Number.isSafeInteger(input.version) || input.version < 1) {
    fail('Workflow proposal identity/version is invalid');
  }
  const runtime = validateDeps(deps);
  let existing;
  try {
    existing = await readDefinition(store, { workflowId: input.workflowId, version: input.version });
  } catch (error) {
    if (error?.code !== 'WORKFLOW_DEFINITION_NOT_FOUND') throw error;
  }
  if (existing) {
    if (sameProposalInput(existing, input)) return { record: structuredClone(existing) };
    fail('An immutable Workflow Definition already exists for this workflowId/version.',
      'WORKFLOW_DEFINITION_CONFLICT');
  }
  const core = structuredClone(input.core);
  const preflight = preflightWorkflowDefinition(core, runtime.preflightContext);
  if (preflight.errors.length) fail(
    'Workflow proposal failed static preflight and was not persisted.',
    'WORKFLOW_DEFINITION_INVALID',
    { preflight },
  );

  try { validateWorkflowDefinitionCore(core); } catch (error) {
    fail(`Workflow Definition is invalid: ${error.message}`, 'WORKFLOW_DEFINITION_INVALID', { cause: error, preflight });
  }
  const record = {
    schema: 'talos.workflow-definition-record.v1',
    workflowId: input.workflowId,
    version: input.version,
    core,
    definitionHash: canonicalHash(core),
    proposal: {
      initiatingSessionId: input.initiatingSessionId,
      createdAt: runtime.nowFn(),
      plannerModel: input.plannerModel,
      sessionModel: input.sessionModel,
    },
    preflight,
  };
  try { validateWorkflowDefinitionRecord(record); } catch (error) {
    fail(`Workflow proposal record is invalid: ${error.message}`, 'WORKFLOW_DEFINITION_INVALID', { cause: error, preflight });
  }

  try {
    return { record: structuredClone(await createDefinition(store, { record })) };
  } catch (error) {
    if (error?.code !== 'WORKFLOW_DEFINITION_CONFLICT') throw error;
    const raced = await readDefinition(store, { workflowId: record.workflowId, version: record.version });
    if (sameProposalInput(raced, input)) return { record: structuredClone(raced) };
    fail('An immutable Workflow Definition already exists for this workflowId/version.',
      'WORKFLOW_DEFINITION_CONFLICT', { cause: error });
  }
}
