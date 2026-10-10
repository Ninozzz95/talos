import { REGISTRO_FORNITORI } from '../provider-registry.mjs';
import { separaFonteModello } from '../model-destination.mjs';
import { posix, win32 } from 'node:path';
import { canonicalHash, canonicalJson, validateCanonicalizable } from './canonical-json.mjs';

const VALUE_TYPES = new Set([
  'string', 'boolean', 'integer', 'number', 'json', 'text', 'result-ref',
  'artifact', 'commit', 'patch', 'test-report', 'node-id-list',
]);
const NODE_KINDS = new Set([
  'agent', 'router', 'fanout', 'reduce', 'verify', 'judge', 'test', 'human',
  'merge', 'loop', 'gate', 'artifact', 'subworkflow',
]);
const NODE_ROLES = new Set(['coordinator', 'researcher', 'implementer', 'reviewer', 'integrator', 'tester']);
/** 25/09/2026, decisione owner D28: gli stessi sei ruoli per la bozza del modello (una fonte sola; il kernel li ripete nello schema dell'attrezzo e un test ne controlla l'uguaglianza). */
export const WORKFLOW_NODE_ROLES = Object.freeze([...NODE_ROLES]);
const CAPABILITIES = Object.freeze(['read', 'workspace-write', 'on-request', 'full']);
const EDGE_TYPES = new Set(['control', 'data', 'spawn', 'review', 'retry', 'repair', 'merge', 'human', 'branch', 'fallback']);
const RETRY_REASONS = new Set(['rate_limit', 'transient_network', 'provider_5xx', 'timeout', 'process_exit_retryable', 'store_transient']);
/*
 * F3-51b (25/09/2026), owner «Riprova: rifà solo i passi falliti, tentativi da capo»: il ritentativo chiesto da una PERSONA è un
 *   `retry_scheduled` col motivo `user_retry` — il comando `retry-node` era già destinato a questo fatto (`expectedCommandTypes`).
 *   Vale solo nei fatti, non nei `retryOn` di una Definition: una politica non può «chiedere» un ritentativo umano.
 */
const RETRY_FACT_REASONS = new Set([...RETRY_REASONS, 'user_retry']);
const CONDITION_OPS = new Set(['eq', 'neq', 'exists', 'not-exists', 'in', 'not-in', 'lt', 'lte', 'gt', 'gte', 'truthy', 'falsy']);
const NULL_CONDITION_OPS = new Set(['exists', 'not-exists', 'truthy', 'falsy']);
const ORDER_CONDITION_OPS = new Set(['lt', 'lte', 'gt', 'gte']);
const BUDGET_FIELDS = Object.freeze([
  'promptTokens', 'completionTokens', 'wallMs', 'agentSeconds', 'toolCalls',
  'modelRequests', 'retryPromptTokens', 'retryModelRequests', 'knownCostUsd',
]);
const DEFINITION_KEYS = Object.freeze([
  'schema', 'definitionSchemaVersion', 'title', 'objective', 'engineCompatibility',
  'nodes', 'edges', 'budgets', 'limits', 'policy', 'acceptance',
]);
const NODE_KEYS = Object.freeze([
  'id', 'kind', 'label', 'instructions', 'role', 'inputs', 'outputs',
  'capabilityProfile', 'workspacePolicy', 'modelPolicy', 'activityPolicy',
  'retryPolicy', 'cachePolicy', 'writeSetHint', 'priority', 'budget', 'metadata',
]);
const PHASE_KEYS = Object.freeze(['id', 'label']);
const HARD_LIMITS = Object.freeze({
  maxLogicalNodes: 100_000,
  maxEdges: 1_000_000,
  maxGraphMutations: 100_000,
  maxFanoutPerNode: 100_000,
  maxAgentSessions: 100_000,
  maxDepth: 1_000,
});
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const PORT = /^[a-z][a-z0-9_]{0,63}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,199}$/u;

export class WorkflowContractError extends Error {
  constructor(message, code = 'WORKFLOW_DEFINITION_INVALID') {
    super(message);
    this.name = 'WorkflowContractError';
    this.code = code;
  }
}

const invalid = (message, code) => { throw new WorkflowContractError(message, code); };
const plainObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function exactKeys(value, required, optional = [], path = 'value') {
  if (!plainObject(value)) invalid(`${path} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) invalid(`${path} has unknown field ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) invalid(`${path} is missing field ${key}`);
  return value;
}

function stringBound(value, min, max, path) {
  if (typeof value !== 'string' || value.length < min || value.length > max) invalid(`${path} must be a string of ${min}..${max} characters`);
  return value;
}

function safeInteger(value, min, max, path) {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(`${path} must be a safe integer in ${min}..${max}`);
  return value;
}

function nullableSafeInteger(value, path) {
  if (value === null) return value;
  return safeInteger(value, 0, Number.MAX_SAFE_INTEGER, path);
}

function finiteNumber(value, min, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0) || value < min) invalid(`${path} must be a finite number >= ${min}`);
  return value;
}

function uniqueStrings(values, { max, itemMax = 200, pattern = null, path }) {
  if (!Array.isArray(values) || values.length > max) invalid(`${path} must contain at most ${max} entries`);
  const seen = new Set();
  for (const value of values) {
    stringBound(value, 1, itemMax, path);
    if (pattern && !pattern.test(value)) invalid(`${path} contains an invalid identifier`);
    if (seen.has(value)) invalid(`${path} contains a duplicate value`);
    seen.add(value);
  }
  return values;
}

function validIso(value, path) {
  stringBound(value, 1, 64, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/u.exec(value);
  if (!match) invalid(`${path} must be an ISO-8601 UTC timestamp`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month]
    || hour > 23 || minute > 59 || second > 59) invalid(`${path} must be a real ISO-8601 UTC timestamp`);
  return value;
}

function validateModelId(value, path) {
  stringBound(value, 1, 200, path);
  if (!MODEL.test(value) || value.includes('://')) invalid(`${path} is not a valid TALOS model identifier`);
  let destination;
  try { destination = separaFonteModello(value); } catch { invalid(`${path} is not a valid TALOS model identifier`); }
  if (!destination?.modelloRemoto || !MODEL.test(destination.modelloRemoto)) invalid(`${path} is not a valid TALOS model identifier`);
  return value;
}

/** C3 (09/10/2026): vero se `value` è un modello che un passo può usare (la stessa regola della Definition, `modelPolicy.model`). */
export function isValidStepModelId(value) {
  try { validateModelId(value, 'model'); return true; } catch { return false; }
}

/** C3: il riassunto con cui la persona segna fatto un passo. Come Hermes `complete_task`: non vuoto, non di soli spazi. */
export const RIASSUNTO_DELLA_PERSONA_MAX = 4_000;
export function isValidPersonSummary(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= RIASSUNTO_DELLA_PERSONA_MAX;
}

function validateBudget(value, { node = false, path = 'budget' } = {}) {
  exactKeys(value, node ? [...BUDGET_FIELDS, 'attempts'] : BUDGET_FIELDS, [], path);
  for (const key of BUDGET_FIELDS) {
    if (key === 'knownCostUsd') {
      if (value[key] !== null) finiteNumber(value[key], 0, `${path}.${key}`);
    } else nullableSafeInteger(value[key], `${path}.${key}`);
  }
  if (node) nullableSafeInteger(value.attempts, `${path}.attempts`);
  return value;
}

export function validateWorkflowLimits(value) {
  const keys = Object.keys(HARD_LIMITS);
  exactKeys(value, keys, [], 'limits');
  for (const key of keys) safeInteger(value[key], key === 'maxDepth' ? 1 : 0, HARD_LIMITS[key], `limits.${key}`);
  if (value.maxLogicalNodes < 1) invalid('limits.maxLogicalNodes must be at least one');
  if (value.maxFanoutPerNode > value.maxLogicalNodes) invalid('limits.maxFanoutPerNode exceeds maxLogicalNodes');
  if (value.maxAgentSessions > value.maxLogicalNodes) invalid('limits.maxAgentSessions exceeds maxLogicalNodes');
  return value;
}

export function validateWorkflowCapabilities(value, ceiling) {
  if (value === 'custom' || ceiling === 'custom') invalid('custom capability profiles are reserved and invalid in v1');
  const rank = (candidate) => CAPABILITIES.indexOf(candidate);
  if (rank(value) < 0 || rank(ceiling) < 0) invalid('workflow capability is invalid');
  if (rank(value) > rank(ceiling)) invalid(`capability ${value} exceeds ceiling ${ceiling}`);
  return value;
}

function validatePort(value, { input, path }) {
  exactKeys(value, input ? ['name', 'type', 'required'] : ['name', 'type'], ['description'], path);
  if (!PORT.test(value.name)) invalid(`${path}.name is not snake_case`);
  if (!VALUE_TYPES.has(value.type)) invalid(`${path}.type is invalid`);
  if (input && typeof value.required !== 'boolean') invalid(`${path}.required must be boolean`);
  if (Object.hasOwn(value, 'description') && value.description !== null) stringBound(value.description, 1, 300, `${path}.description`);
  return value;
}

function validatePorts(values, { input, path }) {
  if (!Array.isArray(values) || values.length > 32) invalid(`${path} must contain at most 32 ports`);
  const names = new Set();
  values.forEach((port, index) => {
    validatePort(port, { input, path: `${path}[${index}]` });
    if (names.has(port.name)) invalid(`${path} contains duplicate ${input ? 'input' : 'output'} port ${port.name}`);
    names.add(port.name);
  });
  return values;
}

function validateModelPolicy(value, path) {
  exactKeys(value, ['mode', 'model', 'reasoning'], [], path);
  if (!['inherit', 'role', 'explicit'].includes(value.mode)) invalid(`${path}.mode is invalid`);
  if (value.mode === 'explicit') validateModelId(value.model, `${path}.model`);
  else if (value.model !== null) invalid(`${path}.model must be null unless mode is explicit`);
  if (value.reasoning !== null) {
    if (!plainObject(value.reasoning)) invalid(`${path}.reasoning must be null or an object`);
    validateCanonicalizable(value.reasoning);
    if (Buffer.byteLength(canonicalJson(value.reasoning), 'utf8') > 4_096) invalid(`${path}.reasoning is too large`);
  }
  return value;
}

function validateActivityPolicy(value, kind, path) {
  exactKeys(value, ['effectClass', 'retryMode', 'maxAttempts', 'deadlineMs'], [], path);
  const allowedEffects = new Set(['pure', 'idempotent', 'reconcilable', 'billable', 'non-idempotent']);
  if (!allowedEffects.has(value.effectClass)) invalid(`${path}.effectClass is invalid`);
  if (!['at-least-once', 'at-most-once', 'manual-on-uncertain'].includes(value.retryMode)) invalid(`${path}.retryMode is invalid`);
  safeInteger(value.maxAttempts, 1, 10_000, `${path}.maxAttempts`);
  if (value.deadlineMs !== null) safeInteger(value.deadlineMs, 1, Number.MAX_SAFE_INTEGER, `${path}.deadlineMs`);

  const safeByKind = {
    agent: ['reconcilable'], test: ['reconcilable'], merge: ['reconcilable'], artifact: ['reconcilable'],
    judge: ['billable'], human: ['non-idempotent'], loop: ['pure'], fanout: ['pure'], gate: ['pure'], subworkflow: ['pure'],
    router: ['pure', 'billable'], reduce: ['pure', 'billable'], verify: ['billable', 'reconcilable'],
  };
  if (!safeByKind[kind].includes(value.effectClass)) invalid(`${path}.effectClass weakens or contradicts node kind ${kind}`);
  return value;
}

function validateRetryPolicy(value, path) {
  exactKeys(value, ['backoff', 'jitter', 'retryOn'], [], path);
  if (!['none', 'linear', 'exponential'].includes(value.backoff)) invalid(`${path}.backoff is invalid`);
  if (typeof value.jitter !== 'boolean') invalid(`${path}.jitter must be boolean`);
  if (!Array.isArray(value.retryOn) || value.retryOn.length > RETRY_REASONS.size) invalid(`${path}.retryOn is invalid`);
  const seen = new Set();
  for (const reason of value.retryOn) {
    if (!RETRY_REASONS.has(reason)) invalid(`${path}.retryOn contains an unsupported reason`);
    if (seen.has(reason)) invalid(`${path}.retryOn contains a duplicate reason`);
    seen.add(reason);
  }
  return value;
}

function validateWriteSetHint(values, path) {
  if (!Array.isArray(values) || values.length > 128) invalid(`${path} must contain at most 128 entries`);
  const seen = new Set();
  for (const value of values) {
    stringBound(value, 1, 1_024, path);
    const normalized = value.replaceAll('\\', '/');
    if (value !== normalized
      || normalized.startsWith('/')
      || /^[A-Za-z]:/u.test(normalized)
      || normalized.startsWith(':(')
      || normalized.split('/').some((part) => part === '..' || part === '.')) invalid(`${path} contains an unsafe relative path or pathspec`);
    if (seen.has(value)) invalid(`${path} contains a duplicate path`);
    seen.add(value);
  }
  return values;
}

function validateMetadata(value, path) {
  if (!plainObject(value)) invalid(`${path} must be a plain object`);
  validateCanonicalizable(value);
  let keys = 0;
  const stack = [{ value, depth: 1 }];
  while (stack.length) {
    const current = stack.pop();
    if (current.depth > 4) invalid(`${path} exceeds metadata depth 4`);
    if (plainObject(current.value)) {
      for (const [key, child] of Object.entries(current.value)) {
        keys += 1;
        if (keys > 64) invalid(`${path} exceeds 64 metadata keys`);
        if (key.startsWith('talos.control.')) invalid(`${path} contains forbidden talos.control metadata`);
        if (plainObject(child) || Array.isArray(child)) stack.push({ value: child, depth: current.depth + 1 });
      }
    } else if (Array.isArray(current.value)) {
      for (const child of current.value) if (plainObject(child) || Array.isArray(child)) stack.push({ value: child, depth: current.depth + 1 });
    }
  }
  if (Buffer.byteLength(canonicalJson(value), 'utf8') > 8 * 1_024) invalid(`${path} exceeds 8 KiB`);
  return value;
}

function validateNodeControl(value, kind, limits, path) {
  if (!['fanout', 'loop', 'subworkflow'].includes(kind)) {
    if (value !== undefined) invalid(`${path} is forbidden for node kind ${kind}`);
    return;
  }
  if (value === undefined) invalid(`${path} is required for node kind ${kind}`);
  if (kind === 'fanout') {
    exactKeys(value, ['type', 'minChildren', 'maxChildren', 'batchSize', 'stopPolicy'], [], path);
    if (value.type !== 'fanout') invalid(`${path}.type must match node kind`);
    safeInteger(value.minChildren, 1, limits.maxFanoutPerNode, `${path}.minChildren`);
    safeInteger(value.maxChildren, value.minChildren, limits.maxFanoutPerNode, `${path}.maxChildren`);
    safeInteger(value.batchSize, 1, value.maxChildren, `${path}.batchSize`);
    if (!['fixed', 'coverage', 'marginal-utility', 'budget'].includes(value.stopPolicy)) invalid(`${path}.stopPolicy is invalid`);
    if (value.stopPolicy === 'fixed' && value.minChildren !== value.maxChildren) invalid(`${path} fixed fanout requires equal minChildren and maxChildren`);
    return;
  }
  if (kind === 'loop') {
    exactKeys(value, ['type', 'maxIterations', 'maxNoProgress', 'onExhausted'], [], path);
    if (value.type !== 'loop' || value.onExhausted !== 'needs-attention') invalid(`${path} is not a v1 loop control`);
    safeInteger(value.maxIterations, 1, 10_000, `${path}.maxIterations`);
    safeInteger(value.maxNoProgress, 1, value.maxIterations, `${path}.maxNoProgress`);
    return;
  }
  exactKeys(value, ['type', 'workflowId', 'version', 'definitionHash'], [], path);
  if (value.type !== 'subworkflow' || !UUID.test(value.workflowId) || !SHA256.test(value.definitionHash)) invalid(`${path} is not a valid subworkflow reference`);
  safeInteger(value.version, 1, Number.MAX_SAFE_INTEGER, `${path}.version`);
}

export function validateWorkflowNodeDefinition(value, context = {}) {
  const path = context.path ?? 'node';
  const limits = context.limits ?? HARD_LIMITS;
  const phaseIds = context.phaseIds ?? null;
  const hasPhase = Boolean(phaseIds) || (context.allowUnresolvedPhase === true && Object.hasOwn(value ?? {}, 'phaseId'));
  exactKeys(value, hasPhase ? [...NODE_KEYS, 'phaseId'] : NODE_KEYS, ['control'], path);
  if (hasPhase && (typeof value.phaseId !== 'string' || !ID.test(value.phaseId))) invalid(`${path}.phaseId is invalid`);
  if (phaseIds && !phaseIds.has(value.phaseId)) invalid(`${path}.phaseId references an unknown phase`);
  if (!ID.test(value.id)) invalid(`${path}.id is invalid`);
  if (!NODE_KINDS.has(value.kind)) invalid(`${path}.kind is invalid`);
  stringBound(value.label, 1, 200, `${path}.label`);
  if (value.instructions !== null) stringBound(value.instructions, 1, 32 * 1_024, `${path}.instructions`);
  if (value.role !== null && !NODE_ROLES.has(value.role)) invalid(`${path}.role is invalid`);
  validatePorts(value.inputs, { input: true, path: `${path}.inputs` });
  validatePorts(value.outputs, { input: false, path: `${path}.outputs` });
  const ceiling = context.capabilityCeiling ?? 'full';
  validateWorkflowCapabilities(value.capabilityProfile, ceiling);
  exactKeys(value.workspacePolicy, ['mode'], [], `${path}.workspacePolicy`);
  if (!['shared-read', 'isolated-write', 'integration', 'none'].includes(value.workspacePolicy.mode)) invalid(`${path}.workspacePolicy.mode is invalid`);
  if (CAPABILITIES.indexOf(value.capabilityProfile) >= CAPABILITIES.indexOf('workspace-write')
    && !['isolated-write', 'integration'].includes(value.workspacePolicy.mode)) invalid(`${path} write capability requires an isolated or integration workspace`);
  validateModelPolicy(value.modelPolicy, `${path}.modelPolicy`);
  validateActivityPolicy(value.activityPolicy, value.kind, `${path}.activityPolicy`);
  validateRetryPolicy(value.retryPolicy, `${path}.retryPolicy`);
  if (!['never', 'same-run', 'content-addressed-deterministic'].includes(value.cachePolicy)) invalid(`${path}.cachePolicy is invalid`);
  validateWriteSetHint(value.writeSetHint, `${path}.writeSetHint`);
  safeInteger(value.priority, -100, 100, `${path}.priority`);
  validateBudget(value.budget, { node: true, path: `${path}.budget` });
  if (value.budget.attempts !== null && value.budget.attempts > value.activityPolicy.maxAttempts) invalid(`${path}.budget.attempts exceeds activityPolicy.maxAttempts`);
  validateNodeControl(value.control, value.kind, limits, `${path}.control`);
  validateMetadata(value.metadata, `${path}.metadata`);
  return value;
}

function typeAssignable(from, to) {
  return from === to
    || (['artifact', 'commit', 'patch', 'test-report'].includes(from) && to === 'result-ref')
    || (from === 'integer' && to === 'number');
}

function validateCondition(value, context, path) {
  exactKeys(value, ['source', 'op', 'value'], [], path);
  exactKeys(value.source, ['scope', 'nodeId', 'name'], [], `${path}.source`);
  if (!CONDITION_OPS.has(value.op)) invalid(`${path} operator is invalid`);
  let sourceType = null;
  if (value.source.scope === 'run-field') {
    if (value.source.nodeId !== null || !['status', 'needs_attention'].includes(value.source.name)) invalid(`${path} run-field source is invalid`);
    sourceType = value.source.name === 'needs_attention' ? 'boolean' : 'string';
  } else if (value.source.scope === 'node-output') {
    if (!ID.test(value.source.nodeId ?? '')) invalid(`${path} node-output source needs a nodeId`);
    const sourceNode = context.nodeById?.get(value.source.nodeId);
    const output = sourceNode?.outputs.find((entry) => entry.name === value.source.name);
    if (!output) invalid(`${path} references an unknown node output`);
    sourceType = output.type;
  } else invalid(`${path} source scope is invalid`);

  if (NULL_CONDITION_OPS.has(value.op) && value.value !== null) invalid(`${path} operator requires null value`);
  if (ORDER_CONDITION_OPS.has(value.op) && !['integer', 'number'].includes(sourceType)) invalid(`${path} order operator requires a numeric source`);
  if (['in', 'not-in'].includes(value.op)) {
    if (!Array.isArray(value.value) || value.value.length > 100) invalid(`${path} membership value must be a bounded array`);
    const kinds = new Set(value.value.map((entry) => typeof entry));
    if (kinds.size > 1 || [...kinds].some((kind) => !['string', 'number', 'boolean'].includes(kind))) invalid(`${path} membership values must have one scalar type`);
  } else if (!NULL_CONDITION_OPS.has(value.op)
    && !(value.value === null || ['string', 'number', 'boolean'].includes(typeof value.value))) invalid(`${path} value must be a scalar`);
  return value;
}

export function validateWorkflowEdgeDefinition(value, context = {}) {
  const path = context.path ?? 'edge';
  exactKeys(value, ['id', 'from', 'to', 'type', 'condition', 'mapping'], [], path);
  if (!ID.test(value.id) || !ID.test(value.from) || !ID.test(value.to)) invalid(`${path} has an invalid id or endpoint`);
  if (!EDGE_TYPES.has(value.type)) invalid(`${path}.type is invalid`);
  const fromNode = context.nodeById?.get(value.from);
  const toNode = context.nodeById?.get(value.to);
  if (context.nodeById && (!fromNode || !toNode)) invalid(`${path} references an unknown node`);
  if (value.from === value.to && fromNode?.kind !== 'loop') invalid(`${path} self-edge is allowed only on a loop controller`);
  if (value.condition !== null) validateCondition(value.condition, context, `${path}.condition`);

  if (value.type === 'data') {
    if (!Array.isArray(value.mapping) || value.mapping.length < 1 || value.mapping.length > 32) invalid(`${path}.mapping is required for data edges`);
    const targets = new Set();
    value.mapping.forEach((mapping, index) => {
      exactKeys(mapping, ['from', 'to'], [], `${path}.mapping[${index}]`);
      if (!PORT.test(mapping.from) || !PORT.test(mapping.to)) invalid(`${path}.mapping has invalid port names`);
      const output = fromNode?.outputs.find((entry) => entry.name === mapping.from);
      const input = toNode?.inputs.find((entry) => entry.name === mapping.to);
      if (!output || !input) invalid(`${path}.mapping references an undeclared input or output`);
      if (!typeAssignable(output.type, input.type)) invalid(`${path}.mapping types are not compatible`);
      if (targets.has(mapping.to)) invalid(`${path}.mapping writes an input more than once`);
      targets.add(mapping.to);
    });
  } else if (value.mapping !== null) invalid(`${path}.mapping is only valid on data edges`);
  return value;
}

function validatePolicy(value) {
  exactKeys(value, ['capabilityCeiling', 'externalTools', 'providerFallback', 'graphMutation', 'human', 'finalApply'], [], 'policy');
  validateWorkflowCapabilities('read', value.capabilityCeiling);
  exactKeys(value.externalTools, ['mode', 'ids'], [], 'policy.externalTools');
  if (!['deny', 'allowlist'].includes(value.externalTools.mode)) invalid('policy.externalTools.mode is invalid');
  uniqueStrings(value.externalTools.ids, { max: 128, itemMax: 200, pattern: ID, path: 'policy.externalTools.ids' });
  if (value.externalTools.mode === 'deny' && value.externalTools.ids.length !== 0) invalid('policy.externalTools deny mode requires empty ids');

  exactKeys(value.providerFallback, ['mode', 'providers'], [], 'policy.providerFallback');
  if (!['forbidden', 'allowlist'].includes(value.providerFallback.mode)) invalid('policy.providerFallback.mode is invalid');
  uniqueStrings(value.providerFallback.providers, { max: 8, itemMax: 64, pattern: ID, path: 'policy.providerFallback.providers' });
  if (value.providerFallback.mode === 'forbidden' && value.providerFallback.providers.length !== 0) invalid('policy.providerFallback forbidden mode requires no providers');
  for (const provider of value.providerFallback.providers) if (!Object.hasOwn(REGISTRO_FORNITORI, provider)) invalid(`policy.providerFallback contains unknown provider ${provider}`);

  exactKeys(value.graphMutation, ['mode', 'maxOperationsPerPatch', 'maxAddedNodesPerPatch', 'maxAddedEdgesPerPatch'], [], 'policy.graphMutation');
  if (!['forbidden', 'coordinator-only', 'coordinator-and-router'].includes(value.graphMutation.mode)) invalid('policy.graphMutation.mode is invalid');
  safeInteger(value.graphMutation.maxOperationsPerPatch, 0, 1_000, 'policy.graphMutation.maxOperationsPerPatch');
  safeInteger(value.graphMutation.maxAddedNodesPerPatch, 0, 1_000, 'policy.graphMutation.maxAddedNodesPerPatch');
  safeInteger(value.graphMutation.maxAddedEdgesPerPatch, 0, 1_000, 'policy.graphMutation.maxAddedEdgesPerPatch');
  if (value.graphMutation.mode === 'forbidden'
    && [value.graphMutation.maxOperationsPerPatch, value.graphMutation.maxAddedNodesPerPatch, value.graphMutation.maxAddedEdgesPerPatch].some(Boolean)) invalid('forbidden graph mutation policy requires zero mutation limits');

  exactKeys(value.human, ['maxPending', 'allowBatchIdenticalSchema'], [], 'policy.human');
  safeInteger(value.human.maxPending, 0, 10_000, 'policy.human.maxPending');
  if (typeof value.human.allowBatchIdenticalSchema !== 'boolean') invalid('policy.human.allowBatchIdenticalSchema must be boolean');
  if (value.finalApply !== 'user-explicit') invalid('policy.finalApply must be user-explicit');
  return value;
}

function validateAcceptance(values, nodeById) {
  if (!Array.isArray(values) || values.length > 128) invalid('acceptance must contain at most 128 criteria');
  const ids = new Set();
  for (const [index, value] of values.entries()) {
    const path = `acceptance[${index}]`;
    exactKeys(value, ['id', 'label', 'source', 'evidenceKind', 'minTrust', 'predicate', 'required'], [], path);
    if (!PORT.test(value.id) || ids.has(value.id)) invalid(`${path}.id is invalid or duplicate`);
    ids.add(value.id);
    stringBound(value.label, 1, 300, `${path}.label`);
    exactKeys(value.source, ['nodeId', 'output'], [], `${path}.source`);
    const node = nodeById.get(value.source.nodeId);
    const output = node?.outputs.find((entry) => entry.name === value.source.output);
    if (!output) invalid(`${path}.source references an unknown output`);
    if (!['test-report', 'artifact', 'commit', 'patch', 'json', 'text'].includes(value.evidenceKind)) invalid(`${path}.evidenceKind is invalid`);
    if (!typeAssignable(output.type, value.evidenceKind) && output.type !== value.evidenceKind) invalid(`${path}.evidenceKind does not match its output`);
    if (!['validated', 'deterministic-evidence'].includes(value.minTrust)) invalid(`${path}.minTrust is invalid`);
    if (typeof value.required !== 'boolean') invalid(`${path}.required must be boolean`);
    if (!plainObject(value.predicate) || typeof value.predicate.op !== 'string') invalid(`${path}.predicate is invalid`);
    if (value.predicate.op === 'exists') exactKeys(value.predicate, ['op'], [], `${path}.predicate`);
    else if (value.predicate.op === 'boolean-equals') {
      exactKeys(value.predicate, ['op', 'value'], [], `${path}.predicate`);
      if (typeof value.predicate.value !== 'boolean') invalid(`${path}.predicate.value must be boolean`);
    } else if (value.predicate.op === 'number-compare') {
      exactKeys(value.predicate, ['op', 'comparator', 'value'], [], `${path}.predicate`);
      if (!['lt', 'lte', 'eq', 'gte', 'gt'].includes(value.predicate.comparator)) invalid(`${path}.predicate comparator is invalid`);
      finiteNumber(value.predicate.value, -Number.MAX_VALUE, `${path}.predicate.value`);
    } else if (value.predicate.op === 'test-status') {
      exactKeys(value.predicate, ['op', 'value'], [], `${path}.predicate`);
      if (value.predicate.value !== 'passed') invalid(`${path}.predicate test status is invalid`);
    } else if (value.predicate.op === 'result-kind') {
      exactKeys(value.predicate, ['op', 'value'], [], `${path}.predicate`);
      if (!['artifact', 'commit', 'patch', 'test-report', 'json', 'text'].includes(value.predicate.value)) invalid(`${path}.predicate result kind is invalid`);
    } else invalid(`${path}.predicate op is invalid`);
  }
  return values;
}

export function analyzeWorkflowGraph(core) {
  if (!plainObject(core) || !Array.isArray(core.nodes) || !Array.isArray(core.edges)) invalid('workflow graph is invalid');
  const ids = core.nodes.map((node) => node.id);
  const nodeSet = new Set(ids);
  const outgoing = new Map(ids.map((id) => [id, []]));
  const undirected = new Map(ids.map((id) => [id, []]));
  for (const edge of core.edges) {
    if (!nodeSet.has(edge.from) || !nodeSet.has(edge.to)) invalid(`edge ${edge.id ?? '<unknown>'} references an unknown node`);
    outgoing.get(edge.from).push(edge.to);
    undirected.get(edge.from).push(edge.to);
    undirected.get(edge.to).push(edge.from);
  }

  const weakSeen = new Set();
  let weakComponentCount = 0;
  for (const id of ids) {
    if (weakSeen.has(id)) continue;
    weakComponentCount += 1;
    const stack = [id];
    weakSeen.add(id);
    while (stack.length) for (const next of undirected.get(stack.pop())) if (!weakSeen.has(next)) { weakSeen.add(next); stack.push(next); }
  }

  let nextIndex = 0;
  const index = new Map();
  const low = new Map();
  const active = new Set();
  const stack = [];
  const components = [];
  for (const root of ids) {
    if (index.has(root)) continue;
    const frames = [{ id: root, next: 0, parent: null, entered: false }];
    while (frames.length) {
      const frame = frames.at(-1);
      if (!frame.entered) {
        index.set(frame.id, nextIndex);
        low.set(frame.id, nextIndex);
        nextIndex += 1;
        stack.push(frame.id);
        active.add(frame.id);
        frame.entered = true;
      }
      const neighbours = outgoing.get(frame.id);
      if (frame.next < neighbours.length) {
        const target = neighbours[frame.next++];
        if (!index.has(target)) frames.push({ id: target, next: 0, parent: frame.id, entered: false });
        else if (active.has(target)) low.set(frame.id, Math.min(low.get(frame.id), index.get(target)));
        continue;
      }
      if (low.get(frame.id) === index.get(frame.id)) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          active.delete(member);
          component.push(member);
        } while (member !== frame.id);
        components.push(component.sort());
      }
      frames.pop();
      if (frame.parent !== null) low.set(frame.parent, Math.min(low.get(frame.parent), low.get(frame.id)));
    }
  }
  const selfLoops = new Set(core.edges.filter((edge) => edge.from === edge.to).map((edge) => edge.from));
  const cyclicComponents = components.filter((component) => component.length > 1
    || selfLoops.has(component[0]));
  return { components, cyclicComponents, weakComponentCount };
}

export function validateWorkflowDefinitionCore(value) {
  validateCanonicalizable(value);
  const v2 = value?.schema === 'talos.workflow-definition-core.v2' && value?.definitionSchemaVersion === 2;
  if (!v2 && (value?.schema !== 'talos.workflow-definition-core.v1' || value?.definitionSchemaVersion !== 1)) invalid('workflow definition schema/version is invalid');
  exactKeys(value, v2 ? [...DEFINITION_KEYS, 'phases'] : DEFINITION_KEYS, [], 'workflow definition core');
  let phaseIds = null;
  if (v2) {
    if (!Array.isArray(value.phases) || value.phases.length < 1 || value.phases.length > 64) invalid('phases must contain 1..64 entries');
    phaseIds = new Set();
    value.phases.forEach((phase, index) => {
      exactKeys(phase, PHASE_KEYS, [], `phases[${index}]`);
      if (typeof phase.id !== 'string' || !ID.test(phase.id) || phaseIds.has(phase.id)) invalid(`phases[${index}].id is invalid or duplicate`);
      phaseIds.add(phase.id);
      stringBound(phase.label, 1, 200, `phases[${index}].label`);
    });
  }
  stringBound(value.title, 1, 200, 'title');
  stringBound(value.objective, 1, 4_000, 'objective');
  exactKeys(value.engineCompatibility, ['minEngineSchemaVersion', 'requiredFeatures'], [], 'engineCompatibility');
  safeInteger(value.engineCompatibility.minEngineSchemaVersion, 1, Number.MAX_SAFE_INTEGER, 'engineCompatibility.minEngineSchemaVersion');
  uniqueStrings(value.engineCompatibility.requiredFeatures, { max: 128, itemMax: 128, pattern: ID, path: 'engineCompatibility.requiredFeatures' });
  validateWorkflowLimits(value.limits);
  validateBudget(value.budgets, { path: 'budgets' });
  validatePolicy(value.policy);

  if (!Array.isArray(value.nodes) || value.nodes.length < 1 || value.nodes.length > value.limits.maxLogicalNodes) invalid('nodes exceed maxLogicalNodes or are empty');
  if (!Array.isArray(value.edges) || value.edges.length > value.limits.maxEdges) invalid('edges exceed maxEdges');
  const nodeById = new Map();
  value.nodes.forEach((node, index) => {
    validateWorkflowNodeDefinition(node, { limits: value.limits, capabilityCeiling: value.policy.capabilityCeiling, phaseIds, path: `nodes[${index}]` });
    if (nodeById.has(node.id)) invalid(`duplicate node id ${node.id}`);
    nodeById.set(node.id, node);
    for (const key of BUDGET_FIELDS) {
      const run = value.budgets[key];
      const own = node.budget[key];
      if (run !== null && own !== null && own > run) invalid(`nodes[${index}].budget.${key} exceeds the run budget`);
    }
  });
  if (phaseIds) for (const phaseId of phaseIds) if (![...nodeById.values()].some((node) => node.phaseId === phaseId)) invalid(`phase ${phaseId} is empty`);
  const edgeIds = new Set();
  value.edges.forEach((edge, index) => {
    validateWorkflowEdgeDefinition(edge, { nodeById, path: `edges[${index}]` });
    if (edgeIds.has(edge.id)) invalid(`duplicate edge id ${edge.id}`);
    edgeIds.add(edge.id);
  });

  const analysis = analyzeWorkflowGraph(value);
  if (value.nodes.length > 1 && analysis.weakComponentCount !== 1) invalid('workflow graph contains disconnected or unreachable nodes');
  for (const component of analysis.cyclicComponents) {
    const members = new Set(component);
    const loopCount = component.filter((id) => nodeById.get(id).kind === 'loop').length;
    const hasRetry = value.edges.some((edge) => members.has(edge.from) && members.has(edge.to) && edge.type === 'retry');
    if (loopCount !== 1 || !hasRetry) invalid('each cyclic SCC must contain exactly one loop controller and retry semantics');
  }
  validateAcceptance(value.acceptance, nodeById);
  return value;
}

export function validateWorkflowDefinitionRecord(value) {
  validateCanonicalizable(value);
  exactKeys(value, ['schema', 'workflowId', 'version', 'core', 'definitionHash', 'proposal', 'preflight'], [], 'workflow definition record');
  if (value.schema !== 'talos.workflow-definition-record.v1' || !UUID.test(value.workflowId)) invalid('workflow definition record identity is invalid');
  safeInteger(value.version, 1, Number.MAX_SAFE_INTEGER, 'version');
  validateWorkflowDefinitionCore(value.core);
  if (!SHA256.test(value.definitionHash) || value.definitionHash !== canonicalHash(value.core)) invalid('workflow definition record hash does not match its Core');
  exactKeys(value.proposal, ['initiatingSessionId', 'createdAt', 'plannerModel', 'sessionModel'], [], 'proposal');
  if (!UUID.test(value.proposal.initiatingSessionId)) invalid('proposal.initiatingSessionId is invalid');
  validIso(value.proposal.createdAt, 'proposal.createdAt');
  for (const key of ['plannerModel', 'sessionModel']) if (value.proposal[key] !== null) validateModelId(value.proposal[key], `proposal.${key}`);
  exactKeys(value.preflight, ['errors', 'warnings', 'estimates'], [], 'preflight');
  if (!Array.isArray(value.preflight.errors) || value.preflight.errors.length > 1_000
    || !Array.isArray(value.preflight.warnings) || value.preflight.warnings.length > 1_000
    || !plainObject(value.preflight.estimates)) invalid('preflight shape is invalid');
  if (Buffer.byteLength(canonicalJson(value.preflight), 'utf8') > 256 * 1_024) invalid('preflight is too large');
  return value;
}

function validatePolicyPatch(value, node, path) {
  const allowed = ['priority', 'budget', 'modelPolicy', 'retryPolicy', 'activityPolicy', 'capabilityProfile'];
  exactKeys(value, [], allowed, path);
  if (Object.keys(value).length === 0) invalid(`${path} must not be empty`);
  if (Object.hasOwn(value, 'priority')) safeInteger(value.priority, -100, 100, `${path}.priority`);
  if (Object.hasOwn(value, 'budget')) {
    validateBudget(value.budget, { node: true, path: `${path}.budget` });
    if (node) for (const key of [...BUDGET_FIELDS, 'attempts']) {
      if (node.budget[key] !== null && (value.budget[key] === null || value.budget[key] > node.budget[key])) invalid(`${path}.budget may only tighten existing limits`);
    }
  }
  if (Object.hasOwn(value, 'modelPolicy')) validateModelPolicy(value.modelPolicy, `${path}.modelPolicy`);
  if (Object.hasOwn(value, 'retryPolicy')) validateRetryPolicy(value.retryPolicy, `${path}.retryPolicy`);
  if (Object.hasOwn(value, 'activityPolicy')) {
    exactKeys(value.activityPolicy, ['maxAttempts'], [], `${path}.activityPolicy`);
    safeInteger(value.activityPolicy.maxAttempts, 1, node?.activityPolicy.maxAttempts ?? 10_000, `${path}.activityPolicy.maxAttempts`);
  }
  if (Object.hasOwn(value, 'capabilityProfile')) {
    if (value.capabilityProfile === 'custom' || !CAPABILITIES.includes(value.capabilityProfile)) invalid(`${path}.capabilityProfile is invalid`);
    if (node && CAPABILITIES.indexOf(value.capabilityProfile) > CAPABILITIES.indexOf(node.capabilityProfile)) invalid(`${path}.capabilityProfile cannot increase capability`);
  }
}

export function validateWorkflowGraphPatch(value, context = {}) {
  validateCanonicalizable(value);
  exactKeys(value, ['patchId', 'expectedGraphVersion', 'operations'], [], 'graph patch');
  if (!UUID.test(value.patchId)) invalid('graph patch patchId is invalid', 'WORKFLOW_GRAPH_PATCH_INVALID');
  safeInteger(value.expectedGraphVersion, 0, Number.MAX_SAFE_INTEGER, 'graph patch expectedGraphVersion');
  const core = context.core ?? null;
  const maxOperations = Math.min(core?.policy.graphMutation.maxOperationsPerPatch ?? 1_000, 1_000);
  if (!Array.isArray(value.operations) || value.operations.length < 1 || value.operations.length > maxOperations) invalid('graph patch operations exceed the policy limit', 'WORKFLOW_GRAPH_PATCH_INVALID');
  if (core?.policy.graphMutation.mode === 'forbidden') invalid('graph mutation is forbidden by policy', 'WORKFLOW_GRAPH_PATCH_INVALID');
  const nodes = core ? core.nodes.map((node) => structuredClone(node)) : [];
  const edges = core ? core.edges.map((edge) => structuredClone(edge)) : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeIds = new Set(edges.map((edge) => edge.id));
  let addedNodes = 0;
  let addedEdges = 0;
  for (const [index, operation] of value.operations.entries()) {
    const path = `graph patch operations[${index}]`;
    if (!plainObject(operation) || typeof operation.op !== 'string') invalid(`${path} is invalid`, 'WORKFLOW_GRAPH_PATCH_INVALID');
    if (operation.op === 'add-node') {
      exactKeys(operation, ['op', 'node'], [], path);
      validateWorkflowNodeDefinition(operation.node, {
        limits: core?.limits ?? HARD_LIMITS,
        capabilityCeiling: core?.policy.capabilityCeiling ?? 'full',
        phaseIds: core?.definitionSchemaVersion === 2 ? new Set(core.phases.map((phase) => phase.id)) : null,
        path: `${path}.node`,
      });
      if (nodeById.has(operation.node.id)) invalid(`${path} duplicates node ${operation.node.id}`, 'WORKFLOW_GRAPH_PATCH_INVALID');
      nodeById.set(operation.node.id, operation.node);
      nodes.push(operation.node);
      addedNodes += 1;
    } else if (operation.op === 'add-edge') {
      exactKeys(operation, ['op', 'edge'], [], path);
      validateWorkflowEdgeDefinition(operation.edge, { nodeById, path: `${path}.edge` });
      if (edgeIds.has(operation.edge.id)) invalid(`${path} duplicates edge ${operation.edge.id}`, 'WORKFLOW_GRAPH_PATCH_INVALID');
      edgeIds.add(operation.edge.id);
      edges.push(operation.edge);
      addedEdges += 1;
    } else if (operation.op === 'update-node-policy') {
      exactKeys(operation, ['op', 'nodeId', 'patch'], [], path);
      const node = nodeById.get(operation.nodeId);
      if (!node) invalid(`${path} references an unknown node`, 'WORKFLOW_GRAPH_PATCH_INVALID');
      validatePolicyPatch(operation.patch, node, `${path}.patch`);
    } else if (operation.op === 'cancel-subgraph') {
      exactKeys(operation, ['op', 'rootNodeId'], [], path);
      if (!nodeById.has(operation.rootNodeId)) invalid(`${path} references an unknown root node`, 'WORKFLOW_GRAPH_PATCH_INVALID');
    } else invalid(`${path} operation is invalid`, 'WORKFLOW_GRAPH_PATCH_INVALID');
  }
  if (core) {
    if (addedNodes > core.policy.graphMutation.maxAddedNodesPerPatch || addedEdges > core.policy.graphMutation.maxAddedEdgesPerPatch) invalid('graph patch exceeds add limits', 'WORKFLOW_GRAPH_PATCH_INVALID');
    const prospective = { ...core, nodes, edges };
    validateWorkflowDefinitionCore(prospective);
  }
  return value;
}

export const WORKFLOW_EVENT_TYPES = Object.freeze([
  'run_created', 'run_started', 'run_pause_requested', 'run_paused', 'run_resumed',
  'run_cancel_requested', 'run_cancelled', 'run_succeeded', 'run_failed',
  // C3 (09/10/2026): un run con passi messi da parte dalla persona finisce così (decisione owner del 07/10)
  'run_succeeded_with_set_aside',
  'graph_patch_applied',
  'node_started', 'node_succeeded', 'node_failed', 'node_cancelled', 'node_skipped', 'node_recovered',
  'node_set_aside',
  'activity_scheduled', 'activity_started', 'activity_uncertain', 'activity_reconciled', 'activity_completed', 'activity_failed',
  // C3 tappa 2a (09/10/2026): la persona decide di un tentativo INCERTO (nessuna prova possibile: la decisione è sua)
  'uncertain_resolved',
  'capacity_claimed', 'capacity_released',
  'budget_reserved', 'budget_settled', 'budget_released', 'budget_overrun_observed',
  // C3 tappa 3 (09/10/2026, owner «quanto serve per finire»): la persona alza il tetto del run della cifra detta prima
  'budget_ceiling_raised',
  'provider_limit_changed', 'circuit_opened', 'circuit_half_open', 'circuit_closed',
  'retry_scheduled', 'timer_scheduled', 'timer_fired',
  'agent_session_created', 'agent_session_finished', 'agent_steer_requested',
  'human_requested', 'human_resolved', 'human_cancelled', 'human_superseded',
  'workspace_baseline_created', 'worktree_created', 'worktree_verified', 'worktree_cleanup_requested', 'worktree_removed',
  'result_recorded',
  'merge_started', 'merge_conflict', 'merge_succeeded', 'merge_failed',
  'test_recorded', 'stale_activity_completion_observed', 'checkpoint_written',
]);

const EVENT_TYPES = new Set(WORKFLOW_EVENT_TYPES);
const COMMAND_TYPES = new Set([
  'approve-definition', 'start-run', 'pause-run', 'resume-run', 'cancel-run',
  'retry-node', 'steer-node', 'set-node-priority', 'graph-patch', 'answer-human-gate',
  // C3: le azioni della PERSONA su un passo (segna come fatto, metti da parte, rifai con un altro modello)
  'resolve-node',
  // C3 tappa 3: «Alza il tetto e riprendi», solo la persona
  'raise-ceiling',
]);
const NODE_EVENT_TYPES = new Set(['node_started', 'node_succeeded', 'node_failed', 'node_cancelled', 'node_skipped', 'node_recovered', 'node_set_aside']);
const ACTIVITY_EVENT_TYPES = new Set([
  'activity_scheduled', 'activity_started', 'activity_uncertain', 'activity_reconciled',
  'activity_completed', 'activity_failed', 'stale_activity_completion_observed', 'uncertain_resolved',
  'capacity_claimed', 'capacity_released',
]);
const RUN_EVENT_TYPES = new Set([
  'run_created', 'run_started', 'run_pause_requested', 'run_paused', 'run_resumed',
  'run_cancel_requested', 'run_cancelled', 'run_succeeded', 'run_failed', 'run_succeeded_with_set_aside',
  'budget_ceiling_raised',
]);
const ENVELOPE_KEYS = Object.freeze([
  'schema', 'eventSchemaVersion', 'engineSchemaVersion', 'eventId', 'runId', 'seq',
  'at', 'type', 'nodeId', 'commandId', 'commandType', 'commandPayloadHash',
  'causationId', 'correlationId', 'graphVersion', 'activityExecutionId', 'attempt',
  'leaseId', 'leaseEpoch', 'payload',
]);
const EVENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EVENT_BUDGET_DIMENSIONS = Object.freeze([
  'promptTokens', 'completionTokens', 'wallMs', 'agentSeconds', 'toolCalls', 'modelRequests', 'knownCostUsd',
]);

function eventInvalid(message, code = 'WORKFLOW_EVENT_INVALID') {
  invalid(message, code);
}

function exactPayload(value, required, optional = [], type = 'event') {
  return exactKeys(value, required, optional, `${type} payload`);
}

function eventId(value, path, { uuid = false, nullable = false } = {}) {
  if (nullable && value === null) return value;
  if (uuid ? !EVENT_UUID.test(value) : (typeof value !== 'string' || value.length < 1 || value.length > 512)) eventInvalid(`${path} is invalid`);
  return value;
}

function eventStringArray(value, path, max = 10_000) {
  return uniqueStrings(value, { max, itemMax: 512, path });
}

function eventHash(value, path, nullable = false) {
  if (nullable && value === null) return value;
  if (!SHA256.test(value)) eventInvalid(`${path} must be a SHA-256 identity`);
  return value;
}

function eventEnum(value, allowed, path) {
  if (!allowed.includes(value)) eventInvalid(`${path} is invalid`);
  return value;
}

function validateMeasuredBudget(value, path) {
  exactKeys(value, EVENT_BUDGET_DIMENSIONS, [], path);
  for (const key of EVENT_BUDGET_DIMENSIONS) {
    if (key === 'knownCostUsd') {
      if (value[key] !== null) finiteNumber(value[key], 0, `${path}.${key}`);
    } else safeInteger(value[key], 0, Number.MAX_SAFE_INTEGER, `${path}.${key}`);
  }
  return value;
}

function validateBudgetReservation(value) {
  exactPayload(value, [
    'schema', 'reservationId', 'runId', 'nodeId', 'activityExecutionId', 'leaseId',
    'leaseEpoch', 'reserved', 'state', 'actual', 'reservedAt', 'settledAt',
  ], [], 'budget_reserved');
  if (value.schema !== 'talos.workflow-budget-reservation.v1') eventInvalid('budget_reserved payload schema is invalid');
  for (const key of ['reservationId', 'runId', 'activityExecutionId', 'leaseId']) eventId(value[key], `budget_reserved payload.${key}`, { uuid: true });
  if (!ID.test(value.nodeId)) eventInvalid('budget_reserved payload.nodeId is invalid');
  safeInteger(value.leaseEpoch, 0, Number.MAX_SAFE_INTEGER, 'budget_reserved payload.leaseEpoch');
  validateMeasuredBudget(value.reserved, 'budget_reserved payload.reserved');
  eventEnum(value.state, ['reserved', 'settled', 'released'], 'budget_reserved payload.state');
  if (value.actual !== null) validateMeasuredBudget(value.actual, 'budget_reserved payload.actual');
  validIso(value.reservedAt, 'budget_reserved payload.reservedAt');
  if (value.settledAt !== null) validIso(value.settledAt, 'budget_reserved payload.settledAt');
  if (value.state === 'reserved' && (value.actual !== null || value.settledAt !== null)) eventInvalid('reserved budget payload cannot already be settled');
  return value;
}

function validateCapacityClaim(value) {
  exactPayload(value, [
    'schema', 'claimId', 'budgetReservationId', 'provider', 'model', 'workspaceRoot',
    'agentSlots', 'writerSlots', 'localProcessSlots',
  ], [], 'capacity_claimed');
  if (value.schema !== 'talos.workflow-capacity-claim.v1') eventInvalid('capacity_claimed payload schema is invalid');
  eventId(value.claimId, 'capacity_claimed payload.claimId', { uuid: true });
  eventId(value.budgetReservationId, 'capacity_claimed payload.budgetReservationId', { uuid: true });
  if ((value.provider === null) !== (value.model === null)) eventInvalid('capacity_claimed provider and model must both be set or null');
  if (value.provider !== null) {
    if (!Object.hasOwn(REGISTRO_FORNITORI, value.provider)) eventInvalid('capacity_claimed provider is invalid');
    validateModelId(value.model, 'capacity_claimed model');
  }
  if (value.workspaceRoot !== null) {
    stringBound(value.workspaceRoot, 1, 4096, 'capacity_claimed workspaceRoot');
    const fullWindowsRoot = win32.isAbsolute(value.workspaceRoot) && win32.parse(value.workspaceRoot).root.length > 1;
    if (!posix.isAbsolute(value.workspaceRoot) && !fullWindowsRoot) eventInvalid('capacity_claimed workspaceRoot must be fully qualified absolute');
  }
  for (const key of ['agentSlots', 'writerSlots', 'localProcessSlots']) {
    safeInteger(value[key], 0, Number.MAX_SAFE_INTEGER, `capacity_claimed ${key}`);
  }
  if (value.agentSlots + value.writerSlots + value.localProcessSlots < 1) eventInvalid('capacity_claimed must reserve at least one slot');
  if (value.agentSlots > 0 && value.provider === null) eventInvalid('capacity_claimed agent slots require provider and model');
  if (value.writerSlots > 0 && value.workspaceRoot === null) eventInvalid('capacity_claimed writer slots require workspaceRoot');
}

function validateRetryFact(value) {
  const chiavi = ['schema', 'runId', 'nodeId', 'activityExecutionId', 'attempt', 'reasonClass', 'backoffMs', 'jitterMs', 'retryAt', 'budgetReservationId'];
  /*
   * C3 (09/10/2026, contratto §2-bis punto 2) — la v2 aggiunge `resume`, COME riprende il passo: `fresh` = sessione nuova con il
   *   modello scelto dalla persona («Rifai con un altro modello», Hermes `reassign_task`). La v1 resta valida così com'è: i giornali
   *   di sempre non cambiano. Solo un ritentativo umano porta `resume`.
   */
  if (value?.schema === 'talos.workflow-retry-fact.v2') {
    exactPayload(value, [...chiavi, 'resume'], [], 'retry_scheduled');
    if (value.reasonClass !== 'user_retry') eventInvalid('only a user retry says how the step resumes');
    exactKeys(value.resume, ['mode', 'modelPolicy'], [], 'retry_scheduled payload.resume');
    eventEnum(value.resume.mode, ['fresh', 'verify'], 'retry_scheduled payload.resume.mode');
    // C3 tappa 2b: `verify` riprende la STESSA sessione (il modello resta quello del passo); `fresh` nomina il modello nuovo
    if (value.resume.mode === 'verify') {
      if (value.resume.modelPolicy !== null) eventInvalid('a verify resume keeps the step model');
    } else {
      try { validateModelPolicy(value.resume.modelPolicy, 'retry_scheduled payload.resume.modelPolicy'); } catch (error) { eventInvalid(error.message); }
      if (value.resume.modelPolicy.mode !== 'explicit') eventInvalid('a fresh resume names the model explicitly');
    }
  } else {
    exactPayload(value, chiavi, [], 'retry_scheduled');
    if (value.schema !== 'talos.workflow-retry-fact.v1') eventInvalid('retry_scheduled payload schema is invalid');
  }
  eventId(value.runId, 'retry_scheduled payload.runId', { uuid: true });
  if (!ID.test(value.nodeId)) eventInvalid('retry_scheduled payload.nodeId is invalid');
  eventId(value.activityExecutionId, 'retry_scheduled payload.activityExecutionId', { uuid: true });
  safeInteger(value.attempt, 1, 10_000, 'retry_scheduled payload.attempt');
  if (!RETRY_FACT_REASONS.has(value.reasonClass)) eventInvalid('retry_scheduled payload.reasonClass is invalid');
  if (value.reasonClass === 'user_retry' && (value.backoffMs !== 0 || value.jitterMs !== 0)) eventInvalid('a user retry has no backoff');
  safeInteger(value.backoffMs, 0, Number.MAX_SAFE_INTEGER, 'retry_scheduled payload.backoffMs');
  safeInteger(value.jitterMs, 0, Number.MAX_SAFE_INTEGER, 'retry_scheduled payload.jitterMs');
  validIso(value.retryAt, 'retry_scheduled payload.retryAt');
  eventId(value.budgetReservationId, 'retry_scheduled payload.budgetReservationId', { uuid: true, nullable: true });
}

function validateTimerFact(value) {
  exactPayload(value, ['schema', 'timerId', 'runId', 'nodeId', 'kind', 'fireAt', 'causationId', 'scheduledAt'], [], 'timer_scheduled');
  if (value.schema !== 'talos.workflow-timer-fact.v1') eventInvalid('timer_scheduled payload schema is invalid');
  eventId(value.timerId, 'timer_scheduled payload.timerId', { uuid: true });
  eventId(value.runId, 'timer_scheduled payload.runId', { uuid: true });
  if (value.nodeId !== null && !ID.test(value.nodeId)) eventInvalid('timer_scheduled payload.nodeId is invalid');
  eventEnum(value.kind, ['human-timeout', 'retry', 'deadline'], 'timer_scheduled payload.kind');
  validIso(value.fireAt, 'timer_scheduled payload.fireAt');
  eventId(value.causationId, 'timer_scheduled payload.causationId');
  validIso(value.scheduledAt, 'timer_scheduled payload.scheduledAt');
}

function validateGraphPatchOperations(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 1_000) eventInvalid('graph_patch_applied payload.operations is invalid');
  value.forEach((operation, index) => {
    const path = `graph_patch_applied payload.operations[${index}]`;
    if (!plainObject(operation)) eventInvalid(`${path} is invalid`);
    if (operation.op === 'add-node') {
      exactKeys(operation, ['op', 'node'], [], path);
      validateWorkflowNodeDefinition(operation.node, { path: `${path}.node`, allowUnresolvedPhase: true });
    } else if (operation.op === 'add-edge') {
      exactKeys(operation, ['op', 'edge'], [], path);
      exactKeys(operation.edge, ['id', 'from', 'to', 'type', 'condition', 'mapping'], [], `${path}.edge`);
      if (!ID.test(operation.edge.id) || !ID.test(operation.edge.from) || !ID.test(operation.edge.to) || !EDGE_TYPES.has(operation.edge.type)) eventInvalid(`${path}.edge is invalid`);
    } else if (operation.op === 'update-node-policy') {
      exactKeys(operation, ['op', 'nodeId', 'patch'], [], path);
      if (!ID.test(operation.nodeId)) eventInvalid(`${path}.nodeId is invalid`);
      validatePolicyPatch(operation.patch, null, `${path}.patch`);
    } else if (operation.op === 'cancel-subgraph') {
      exactKeys(operation, ['op', 'rootNodeId'], [], path);
      if (!ID.test(operation.rootNodeId)) eventInvalid(`${path}.rootNodeId is invalid`);
    } else eventInvalid(`${path}.op is invalid`);
  });
}

function validateQuestion(value) {
  exactKeys(value, ['id', 'question', 'allowOther'], ['options', 'multiSelect'], 'human question');
  if (!PORT.test(value.id)) eventInvalid('human question id is invalid');
  stringBound(value.question, 1, 2_000, 'human question text');
  if (typeof value.allowOther !== 'boolean') eventInvalid('human question allowOther must be boolean');
  if (Object.hasOwn(value, 'multiSelect') && typeof value.multiSelect !== 'boolean') eventInvalid('human question multiSelect must be boolean');
  if (Object.hasOwn(value, 'options')) {
    if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 20) eventInvalid('human question options are invalid');
    value.options.forEach((option, index) => {
      exactKeys(option, ['label', 'description'], [], `human question options[${index}]`);
      stringBound(option.label, 1, 200, 'human option label');
      stringBound(option.description, 0, 500, 'human option description');
    });
  }
}

function validateHumanGate(value) {
  exactKeys(value, [
    'schema', 'requestId', 'requestVersion', 'runId', 'nodeId', 'decisionKey',
    'createdAt', 'fingerprint', 'answerSchemaHash', 'status', 'onSkip',
    'timeoutPolicy', 'questions', 'answers', 'resolvedAt',
  ], [], 'human_requested payload.gate');
  if (value.schema !== 'talos.workflow-question.v1') eventInvalid('human gate schema is invalid');
  for (const key of ['requestId', 'runId']) eventId(value[key], `human gate ${key}`, { uuid: true });
  safeInteger(value.requestVersion, 1, Number.MAX_SAFE_INTEGER, 'human gate requestVersion');
  if (!ID.test(value.nodeId)) eventInvalid('human gate nodeId is invalid');
  stringBound(value.decisionKey, 1, 256, 'human gate decisionKey');
  validIso(value.createdAt, 'human gate createdAt');
  eventHash(value.fingerprint, 'human gate fingerprint');
  eventHash(value.answerSchemaHash, 'human gate answerSchemaHash');
  eventEnum(value.status, ['pending', 'answered', 'skipped', 'cancelled', 'superseded'], 'human gate status');
  eventEnum(value.onSkip, ['continue-with-null', 'take-edge', 'fail-node', 'forbidden'], 'human gate onSkip');
  if (value.timeoutPolicy !== null) {
    exactKeys(value.timeoutPolicy, ['timerId', 'onTimeout'], [], 'human gate timeoutPolicy');
    eventId(value.timeoutPolicy.timerId, 'human gate timeoutPolicy.timerId', { uuid: true });
    eventEnum(value.timeoutPolicy.onTimeout, ['skip', 'fail-node', 'needs-attention'], 'human gate timeoutPolicy.onTimeout');
    if (value.timeoutPolicy.onTimeout === 'skip' && value.onSkip === 'forbidden') eventInvalid('human gate cannot time out to forbidden skip');
  }
  if (!Array.isArray(value.questions) || value.questions.length < 1 || value.questions.length > 10) eventInvalid('human gate questions are invalid');
  value.questions.forEach(validateQuestion);
  if (value.answers !== null) validateCanonicalizable(value.answers);
  if (value.resolvedAt !== null) validIso(value.resolvedAt, 'human gate resolvedAt');
}

function validateResultRef(value) {
  exactKeys(value, [
    'schema', 'id', 'sha256', 'runId', 'nodeId', 'activityExecutionId', 'kind',
    'contentType', 'bytes', 'storageKey', 'summary', 'trust', 'provenance',
    'sensitivity', 'eligibleForIntegration',
  ], [], 'result_recorded payload.resultRef');
  if (value.schema !== 'talos.workflow-result-ref.v1') eventInvalid('ResultRef schema is invalid');
  eventId(value.id, 'ResultRef id');
  eventHash(value.sha256, 'ResultRef sha256');
  eventId(value.runId, 'ResultRef runId', { uuid: true });
  if (!ID.test(value.nodeId)) eventInvalid('ResultRef nodeId is invalid');
  eventId(value.activityExecutionId, 'ResultRef activityExecutionId', { uuid: true });
  eventEnum(value.kind, ['json', 'text', 'artifact', 'commit', 'test-report', 'patch'], 'ResultRef kind');
  stringBound(value.contentType, 1, 256, 'ResultRef contentType');
  safeInteger(value.bytes, 0, Number.MAX_SAFE_INTEGER, 'ResultRef bytes');
  if (!/^[0-9a-f]{2}\/[0-9a-f]{64}$/u.test(value.storageKey)) eventInvalid('ResultRef storageKey is invalid');
  stringBound(value.summary, 0, 4_096, 'ResultRef summary');
  eventEnum(value.trust, ['untrusted', 'validated', 'deterministic-evidence'], 'ResultRef trust');
  eventEnum(value.sensitivity, ['public', 'workspace', 'secret-adjacent'], 'ResultRef sensitivity');
  if (typeof value.eligibleForIntegration !== 'boolean') eventInvalid('ResultRef eligibleForIntegration must be boolean');
  exactKeys(value.provenance, ['definitionHash', 'workspaceBaselineHash', 'inputHash', 'model', 'provider', 'toolVersions', 'leaseEpoch'], [], 'ResultRef provenance');
  for (const key of ['definitionHash', 'workspaceBaselineHash', 'inputHash']) eventHash(value.provenance[key], `ResultRef provenance.${key}`, key === 'workspaceBaselineHash');
  if (value.provenance.model !== null) validateModelId(value.provenance.model, 'ResultRef provenance.model');
  if (value.provenance.provider !== null && !Object.hasOwn(REGISTRO_FORNITORI, value.provenance.provider)) eventInvalid('ResultRef provenance.provider is invalid');
  if (!plainObject(value.provenance.toolVersions)) eventInvalid('ResultRef provenance.toolVersions is invalid');
  safeInteger(value.provenance.leaseEpoch, 0, Number.MAX_SAFE_INTEGER, 'ResultRef provenance.leaseEpoch');
}

function validateEventPayload(event) {
  const { type, payload } = event;
  if (type === 'run_created') {
    exactPayload(payload, ['workflowId', 'definitionVersion', 'definitionHash', 'rootSessionId', 'workspaceBaselineId', 'workspaceBaselineHash'], [], type);
    // Riparazione D1, 24/09/2026: il workflowId di run_created NON è un id generato dal motore
    // eventi: è un riferimento a una Definition, e deve accettare lo stesso insieme di versioni che
    // la Definition stessa accetta (`UUID`, v1-8, come validateDefinitionRecord). Prima era
    // v4-only (EVENT_UUID) e ogni proposta del modello — coniata come UUIDv8 name-based SHA-256
    // (planning-control.mjs workflowIdForToolCall) — non poteva mai diventare un run.
    // Fonte primaria: RFC 9562 (maggio 2024), §6.5 «[name-based UUIDs with SHA-256] MUST NOT
    // utilize UUIDv5 and MUST be within the UUIDv8 space»; §5.4 v4 = bit casuali, quindi coniare
    // un v4 deterministico violerebbe la RFC e renderebbe illeggibili le proposte già salvate;
    // §6.12 «treat UUIDs as opaquely as possible». Letta il 24/09/2026.
    if (!UUID.test(payload.workflowId)) eventInvalid(`${type} payload.workflowId is invalid`);
    safeInteger(payload.definitionVersion, 1, Number.MAX_SAFE_INTEGER, `${type} payload.definitionVersion`);
    eventHash(payload.definitionHash, `${type} payload.definitionHash`);
    eventId(payload.rootSessionId, `${type} payload.rootSessionId`, { uuid: true });
    eventId(payload.workspaceBaselineId, `${type} payload.workspaceBaselineId`, { nullable: true });
    eventHash(payload.workspaceBaselineHash, `${type} payload.workspaceBaselineHash`, true);
  } else if (['run_started'].includes(type)) exactPayload(payload, [], [], type);
  else if (type === 'run_pause_requested') { exactPayload(payload, ['reason'], [], type); eventEnum(payload.reason, ['user', 'policy'], `${type} payload.reason`); }
  else if (type === 'run_paused') { exactPayload(payload, ['reason'], [], type); eventEnum(payload.reason, ['user', 'policy', 'recovery'], `${type} payload.reason`); }
  else if (type === 'run_resumed') { exactPayload(payload, ['reason'], [], type); eventEnum(payload.reason, ['user', 'recovery'], `${type} payload.reason`); }
  else if (['run_cancel_requested', 'run_cancelled'].includes(type)) { exactPayload(payload, ['reason'], [], type); eventEnum(payload.reason, ['user', 'parent_cancelled', 'policy', 'superseded'], `${type} payload.reason`); }
  else if (type === 'run_succeeded') {
    exactPayload(payload, ['finalResultIds', 'integrationCommit'], [], type); eventStringArray(payload.finalResultIds, `${type} payload.finalResultIds`); if (payload.integrationCommit !== null) stringBound(payload.integrationCommit, 1, 256, `${type} payload.integrationCommit`);
  } else if (type === 'run_succeeded_with_set_aside') {
    // C3: «Concluso, con passi messi da parte» (owner 07/10) — i risultati riusciti restano, il riepilogo nomina i passi messi da
    // parte e quelli che non sono partiti per colpa loro
    exactPayload(payload, ['finalResultIds', 'setAsideNodeIds', 'skippedNodeIds'], [], type);
    for (const key of ['finalResultIds', 'setAsideNodeIds', 'skippedNodeIds']) eventStringArray(payload[key], `${type} payload.${key}`);
    if (payload.setAsideNodeIds.length === 0) eventInvalid(`${type} needs at least one step set aside`);
  } else if (type === 'run_failed') {
    exactPayload(payload, ['errorClass', 'evidenceResultIds'], [], type); stringBound(payload.errorClass, 1, 128, `${type} payload.errorClass`); eventStringArray(payload.evidenceResultIds, `${type} payload.evidenceResultIds`);
  } else if (type === 'graph_patch_applied') {
    exactPayload(payload, ['patchId', 'expectedGraphVersion', 'operationsHash', 'previousGraphVersion', 'newGraphVersion', 'operations'], [], type);
    eventId(payload.patchId, `${type} payload.patchId`, { uuid: true });
    for (const key of ['expectedGraphVersion', 'previousGraphVersion', 'newGraphVersion']) safeInteger(payload[key], 0, Number.MAX_SAFE_INTEGER, `${type} payload.${key}`);
    eventHash(payload.operationsHash, `${type} payload.operationsHash`);
    validateGraphPatchOperations(payload.operations);
    if (canonicalHash(payload.operations) !== payload.operationsHash) eventInvalid(`${type} payload operationsHash does not match operations`);
    if (payload.expectedGraphVersion !== payload.previousGraphVersion || payload.newGraphVersion !== payload.previousGraphVersion + 1 || event.graphVersion !== payload.newGraphVersion) eventInvalid(`${type} graph versions are inconsistent`);
  } else if (type === 'node_started') { exactPayload(payload, ['trigger'], [], type); eventEnum(payload.trigger, ['activity', 'deterministic', 'human_resolved', 'recovered'], `${type} payload.trigger`); }
  else if (type === 'node_succeeded') {
    exactPayload(payload, ['resultIds'], ['by', 'summary'], type); eventStringArray(payload.resultIds, `${type} payload.resultIds`);
    // C3 «Segna come fatto»: SOLO la persona, con un riassunto vero (Hermes `complete_task`, `kanban_db.py:2731`: niente evidenza vuota)
    if (Object.hasOwn(payload, 'by') || Object.hasOwn(payload, 'summary')) {
      if (payload.by !== 'person') eventInvalid(`${type} payload.by must be person`);
      if (!isValidPersonSummary(payload.summary)) eventInvalid(`${type} payload.summary must be a non-empty summary`);
      if (payload.resultIds.length === 0) eventInvalid(`${type} by a person carries the summary as its result`);
    }
  }
  else if (type === 'node_set_aside') { exactPayload(payload, ['reason'], [], type); eventEnum(payload.reason, ['user'], `${type} payload.reason`); }
  else if (type === 'node_failed') { exactPayload(payload, ['errorClass', 'evidenceResultIds'], [], type); stringBound(payload.errorClass, 1, 128, `${type} payload.errorClass`); eventStringArray(payload.evidenceResultIds, `${type} payload.evidenceResultIds`); }
  else if (type === 'node_cancelled') { exactPayload(payload, ['reason'], [], type); eventEnum(payload.reason, ['user', 'parent_cancelled', 'graph_patch', 'run_cancelled', 'policy'], `${type} payload.reason`); }
  else if (type === 'node_skipped') { exactPayload(payload, ['reason'], [], type); eventEnum(payload.reason, ['condition_false', 'branch_not_selected', 'acceptance_already_satisfied', 'dependency_set_aside'], `${type} payload.reason`); }
  else if (type === 'node_recovered') { exactPayload(payload, ['from', 'evidenceResultIds'], [], type); eventEnum(payload.from, ['running', 'uncertain', 'retry_wait', 'waiting_human'], `${type} payload.from`); eventStringArray(payload.evidenceResultIds, `${type} payload.evidenceResultIds`); }
  else if (type === 'activity_scheduled') {
    exactPayload(payload, ['activityKind', 'effectClass', 'retryMode', 'idempotencyKey', 'resourceClass', 'budgetReservationId', 'deadlineAt'], [], type);
    eventEnum(payload.activityKind, ['model', 'agent-session', 'process', 'file-write', 'worktree', 'git', 'external-tool', 'test', 'human-wait', 'deterministic'], `${type} payload.activityKind`);
    eventEnum(payload.effectClass, ['pure', 'idempotent', 'reconcilable', 'billable', 'non-idempotent'], `${type} payload.effectClass`);
    eventEnum(payload.retryMode, ['at-least-once', 'at-most-once', 'manual-on-uncertain'], `${type} payload.retryMode`);
    stringBound(payload.idempotencyKey, 1, 512, `${type} payload.idempotencyKey`); stringBound(payload.resourceClass, 1, 128, `${type} payload.resourceClass`);
    eventId(payload.budgetReservationId, `${type} payload.budgetReservationId`, { nullable: true }); if (payload.deadlineAt !== null) validIso(payload.deadlineAt, `${type} payload.deadlineAt`);
  } else if (type === 'activity_started') { exactPayload(payload, ['adapterId'], [], type); stringBound(payload.adapterId, 1, 200, `${type} payload.adapterId`); }
  else if (type === 'activity_uncertain') { exactPayload(payload, ['reasonClass', 'observedReceiptRef'], [], type); eventEnum(payload.reasonClass, ['crash_after_start', 'receipt_missing', 'transport_ambiguous', 'effect_seen_without_ack', 'recovery_unknown'], `${type} payload.reasonClass`); if (payload.observedReceiptRef !== null) stringBound(payload.observedReceiptRef, 1, 512, `${type} payload.observedReceiptRef`); }
  else if (type === 'activity_reconciled') {
    const v2 = event.eventSchemaVersion === 2;
    exactPayload(payload, ['outcome', 'receiptRef', 'resultIds', ...(v2 ? ['actualUsage'] : [])], [], type);
    /*
     * ⭐ F3-41c (25/09/2026), decisione owner «i token del tentativo interrotto contano»: `proved_interrupted` (solo v2) — il
     *   tentativo è PROVATO fermo (la sua sessione non è viva e la risposta non è registrata), con la ricevuta e il consumo
     *   MISURATO dal suo file. Diverso da `proved_not_performed` (nessun effetto, nessun consumo) e da `still_unknown` (non si
     *   sa). Come i «crashed» di Hermes: un tentativo fallito col suo costo, che la politica di ritentativo può rifare.
     */
    const esiti = v2 ? ['proved_completed', 'proved_not_performed', 'proved_interrupted', 'still_unknown'] : ['proved_completed', 'proved_not_performed', 'still_unknown'];
    eventEnum(payload.outcome, esiti, `${type} payload.outcome`);
    if (payload.receiptRef !== null) stringBound(payload.receiptRef, 1, 512, `${type} payload.receiptRef`);
    eventStringArray(payload.resultIds, `${type} payload.resultIds`);
    if (v2 && payload.actualUsage !== null) validateMeasuredBudget(payload.actualUsage, `${type} payload.actualUsage`);
    if (payload.outcome === 'proved_interrupted' && (payload.receiptRef === null || payload.actualUsage === null || payload.resultIds.length !== 0)) {
      eventInvalid(`${type} proved_interrupted requires a receipt, measured usage and no results`);
    }
  }
  else if (type === 'activity_completed') {
    const v2 = event.eventSchemaVersion === 2;
    exactPayload(payload, ['resultIds', 'receiptRef', ...(v2 ? ['actualUsage'] : [])], [], type);
    eventStringArray(payload.resultIds, `${type} payload.resultIds`);
    if (payload.receiptRef !== null) stringBound(payload.receiptRef, 1, 512, `${type} payload.receiptRef`);
    if (v2 && payload.actualUsage !== null) validateMeasuredBudget(payload.actualUsage, `${type} payload.actualUsage`);
  }
  else if (type === 'activity_failed') {
    const v2 = event.eventSchemaVersion === 2;
    exactPayload(payload, ['errorClass', 'retryable', 'evidenceResultIds', ...(v2 ? ['receiptRef', 'actualUsage'] : [])], [], type);
    eventEnum(payload.errorClass, ['auth', 'quota_hard', 'rate_limit', 'transient_network', 'provider_5xx', 'model_invalid', 'context_overflow', 'process_exit', 'validation', 'cancelled', 'internal'], `${type} payload.errorClass`);
    if (typeof payload.retryable !== 'boolean') eventInvalid(`${type} payload.retryable must be boolean`);
    eventStringArray(payload.evidenceResultIds, `${type} payload.evidenceResultIds`);
    if (v2 && payload.receiptRef !== null) stringBound(payload.receiptRef, 1, 512, `${type} payload.receiptRef`);
    if (v2 && payload.actualUsage !== null) validateMeasuredBudget(payload.actualUsage, `${type} payload.actualUsage`);
  }
  else if (type === 'capacity_claimed') validateCapacityClaim(payload);
  else if (type === 'capacity_released') { exactPayload(payload, ['claimId', 'reason'], [], type); eventId(payload.claimId, `${type} payload.claimId`, { uuid: true }); eventEnum(payload.reason, ['never_scheduled', 'activity_terminal'], `${type} payload.reason`); }
  else if (type === 'budget_reserved') validateBudgetReservation(payload);
  // C3 tappa 3: l'aumento è per ogni voce del budget, quello calcolato da `aumentoPerFinire` e detto prima sul pulsante
  else if (type === 'budget_ceiling_raised') { exactPayload(payload, ['reason', 'amount'], [], type); eventEnum(payload.reason, ['user'], `${type} payload.reason`); validateMeasuredBudget(payload.amount, `${type} payload.amount`); if (payload.amount.knownCostUsd === null) eventInvalid(`${type} payload.amount.knownCostUsd must be a number`); }
  else if (type === 'budget_settled') { exactPayload(payload, ['reservationId', 'actual', 'overrunDimensions'], [], type); eventId(payload.reservationId, `${type} payload.reservationId`, { uuid: true }); validateMeasuredBudget(payload.actual, `${type} payload.actual`); eventStringArray(payload.overrunDimensions, `${type} payload.overrunDimensions`, EVENT_BUDGET_DIMENSIONS.length); for (const dimension of payload.overrunDimensions) if (!EVENT_BUDGET_DIMENSIONS.includes(dimension)) eventInvalid(`${type} payload contains unknown budget dimension`); }
  else if (type === 'budget_released') { exactPayload(payload, ['reservationId', 'reason'], [], type); eventId(payload.reservationId, `${type} payload.reservationId`, { uuid: true }); eventEnum(payload.reason, ['not_started', 'cancelled_before_effect', 'fallback_transfer', 'reconciled_not_performed', 'person_resolved', 'failed_before_session'], `${type} payload.reason`); }
  /*
   * C3 tappa 2a (09/10/2026, contratto §2-bis punto 1) — la persona decide di un tentativo INCERTO e dice che cosa farne: l'attività
   *   diventa `reconciled` con esito `person_resolved` (nessuna ricevuta, consumo sconosciuto) e l'azione scelta si compie dopo il
   *   rilascio del posto. L'azione sta NEL fatto, così una ripetizione o un riavvio sanno come finire il lavoro.
   */
  else if (type === 'uncertain_resolved') {
    exactPayload(payload, ['reason', 'action'], ['summary', 'model'], type);
    eventEnum(payload.reason, ['user'], `${type} payload.reason`);
    eventEnum(payload.action, ['mark-done', 'set-aside', 'retry-other-model', 'resume-verify'], `${type} payload.action`);
    if ((payload.action === 'mark-done') !== Object.hasOwn(payload, 'summary')) eventInvalid(`${type} carries a summary only to mark the step done`);
    if ((payload.action === 'retry-other-model') !== Object.hasOwn(payload, 'model')) eventInvalid(`${type} carries a model only to redo the step`);
    if (payload.action === 'mark-done' && !isValidPersonSummary(payload.summary)) eventInvalid(`${type} payload.summary must be a non-empty summary`);
    if (payload.action === 'retry-other-model' && !isValidStepModelId(payload.model)) eventInvalid(`${type} payload.model is invalid`);
  }
  else if (type === 'budget_overrun_observed') { exactPayload(payload, ['reservationId', 'source', 'dimensions', 'observed'], [], type); eventId(payload.reservationId, `${type} payload.reservationId`, { uuid: true, nullable: true }); eventEnum(payload.source, ['provider_receipt', 'process_receipt', 'tool_receipt', 'reconciliation', 'admission'], `${type} payload.source`); eventStringArray(payload.dimensions, `${type} payload.dimensions`, EVENT_BUDGET_DIMENSIONS.length); if (payload.dimensions.length < 1 || payload.dimensions.some((dimension) => !EVENT_BUDGET_DIMENSIONS.includes(dimension))) eventInvalid(`${type} payload dimensions are invalid`); validateMeasuredBudget(payload.observed, `${type} payload.observed`); }
  else if (type === 'provider_limit_changed') { exactPayload(payload, ['provider', 'model', 'previousLimit', 'newLimit', 'reason'], [], type); if (!Object.hasOwn(REGISTRO_FORNITORI, payload.provider)) eventInvalid(`${type} payload.provider is invalid`); validateModelId(payload.model, `${type} payload.model`); safeInteger(payload.previousLimit, 0, 100_000, `${type} payload.previousLimit`); safeInteger(payload.newLimit, 0, 100_000, `${type} payload.newLimit`); eventEnum(payload.reason, ['success', 'queue_delay', 'rate_limit', 'latency', 'manual_policy'], `${type} payload.reason`); }
  else if (type === 'circuit_opened') { exactPayload(payload, ['provider', 'model', 'reasonClass', 'reopenAt'], [], type); if (!Object.hasOwn(REGISTRO_FORNITORI, payload.provider)) eventInvalid(`${type} payload.provider is invalid`); if (payload.model !== null) validateModelId(payload.model, `${type} payload.model`); eventEnum(payload.reasonClass, ['rate_limit', 'transient_network', 'provider_5xx', 'quota_hard', 'auth'], `${type} payload.reasonClass`); if (payload.reopenAt !== null) validIso(payload.reopenAt, `${type} payload.reopenAt`); }
  else if (type === 'circuit_half_open') { exactPayload(payload, ['provider', 'model', 'probePermits'], [], type); if (!Object.hasOwn(REGISTRO_FORNITORI, payload.provider)) eventInvalid(`${type} payload.provider is invalid`); if (payload.model !== null) validateModelId(payload.model, `${type} payload.model`); safeInteger(payload.probePermits, 1, 100_000, `${type} payload.probePermits`); }
  else if (type === 'circuit_closed') { exactPayload(payload, ['provider', 'model', 'reason'], [], type); if (!Object.hasOwn(REGISTRO_FORNITORI, payload.provider)) eventInvalid(`${type} payload.provider is invalid`); if (payload.model !== null) validateModelId(payload.model, `${type} payload.model`); eventEnum(payload.reason, ['probe_success', 'manual_recovery'], `${type} payload.reason`); }
  else if (type === 'retry_scheduled') validateRetryFact(payload);
  else if (type === 'timer_scheduled') validateTimerFact(payload);
  else if (type === 'timer_fired') { exactPayload(payload, ['timerId', 'scheduledAt', 'fireAt', 'targetKind', 'targetId'], [], type); eventId(payload.timerId, `${type} payload.timerId`, { uuid: true }); validIso(payload.scheduledAt, `${type} payload.scheduledAt`); validIso(payload.fireAt, `${type} payload.fireAt`); stringBound(payload.targetKind, 1, 64, `${type} payload.targetKind`); stringBound(payload.targetId, 1, 512, `${type} payload.targetId`); }
  else if (type === 'agent_session_created') { exactPayload(payload, ['sessionId', 'provider', 'model', 'capabilityProfile', 'workspaceLeaseId'], [], type); eventId(payload.sessionId, `${type} payload.sessionId`, { uuid: true }); if (!Object.hasOwn(REGISTRO_FORNITORI, payload.provider)) eventInvalid(`${type} payload.provider is invalid`); validateModelId(payload.model, `${type} payload.model`); validateWorkflowCapabilities(payload.capabilityProfile, 'full'); eventId(payload.workspaceLeaseId, `${type} payload.workspaceLeaseId`, { nullable: true }); }
  else if (type === 'agent_session_finished') { exactPayload(payload, ['sessionId', 'outcome', 'resultIds'], [], type); eventId(payload.sessionId, `${type} payload.sessionId`, { uuid: true }); eventEnum(payload.outcome, ['succeeded', 'failed', 'cancelled', 'interrupted'], `${type} payload.outcome`); eventStringArray(payload.resultIds, `${type} payload.resultIds`); }
  else if (type === 'agent_steer_requested') { exactPayload(payload, ['sessionId', 'steerId', 'instructionRef', 'targetLeaseId', 'targetLeaseEpoch'], [], type); eventId(payload.sessionId, `${type} payload.sessionId`, { uuid: true }); eventId(payload.steerId, `${type} payload.steerId`, { uuid: true }); stringBound(payload.instructionRef, 1, 512, `${type} payload.instructionRef`); eventId(payload.targetLeaseId, `${type} payload.targetLeaseId`, { uuid: true }); safeInteger(payload.targetLeaseEpoch, 0, Number.MAX_SAFE_INTEGER, `${type} payload.targetLeaseEpoch`); }
  else if (type === 'human_requested') { exactPayload(payload, ['gate'], [], type); validateHumanGate(payload.gate); }
  else if (type === 'human_resolved') { exactPayload(payload, ['requestId', 'requestVersion', 'answerSchemaHash', 'status', 'answers', 'answerHash'], [], type); eventId(payload.requestId, `${type} payload.requestId`, { uuid: true }); safeInteger(payload.requestVersion, 1, Number.MAX_SAFE_INTEGER, `${type} payload.requestVersion`); eventHash(payload.answerSchemaHash, `${type} payload.answerSchemaHash`); eventEnum(payload.status, ['answered', 'skipped'], `${type} payload.status`); if (payload.status === 'skipped' && payload.answers !== null) eventInvalid(`${type} skipped answers must be null`); if (payload.status === 'answered') { if (!plainObject(payload.answers)) eventInvalid(`${type} answered answers must be an object`); validateCanonicalizable(payload.answers); } eventHash(payload.answerHash, `${type} payload.answerHash`); }
  else if (type === 'human_cancelled') { exactPayload(payload, ['requestId', 'requestVersion', 'reason'], [], type); eventId(payload.requestId, `${type} payload.requestId`, { uuid: true }); safeInteger(payload.requestVersion, 1, Number.MAX_SAFE_INTEGER, `${type} payload.requestVersion`); eventEnum(payload.reason, ['run_cancelled', 'node_cancelled', 'policy'], `${type} payload.reason`); }
  else if (type === 'human_superseded') { exactPayload(payload, ['requestId', 'requestVersion', 'reason', 'replacementRequestId'], [], type); eventId(payload.requestId, `${type} payload.requestId`, { uuid: true }); safeInteger(payload.requestVersion, 1, Number.MAX_SAFE_INTEGER, `${type} payload.requestVersion`); eventEnum(payload.reason, ['graph_patch', 'newer_decision'], `${type} payload.reason`); eventId(payload.replacementRequestId, `${type} payload.replacementRequestId`, { uuid: true, nullable: true }); }
  else if (type === 'workspace_baseline_created') { exactPayload(payload, ['baselineId', 'workspaceBaselineHash', 'sourceHead', 'sourceStatusHash', 'syntheticBranch', 'syntheticCommit', 'baselineTree'], [], type); eventId(payload.baselineId, `${type} payload.baselineId`); eventHash(payload.workspaceBaselineHash, `${type} payload.workspaceBaselineHash`); eventHash(payload.sourceStatusHash, `${type} payload.sourceStatusHash`); for (const key of ['sourceHead', 'syntheticBranch', 'syntheticCommit', 'baselineTree']) stringBound(payload[key], 1, 512, `${type} payload.${key}`); }
  else if (type === 'worktree_created') { exactPayload(payload, ['worktreeId', 'workspaceLeaseId', 'role', 'branch', 'commit', 'pathKey'], [], type); eventId(payload.worktreeId, `${type} payload.worktreeId`); eventId(payload.workspaceLeaseId, `${type} payload.workspaceLeaseId`); eventEnum(payload.role, ['writer', 'integration', 'baseline'], `${type} payload.role`); for (const key of ['branch', 'commit', 'pathKey']) stringBound(payload[key], 1, 512, `${type} payload.${key}`); }
  else if (type === 'worktree_verified') { exactPayload(payload, ['worktreeId', 'branch', 'head', 'clean', 'cwdFingerprint'], [], type); eventId(payload.worktreeId, `${type} payload.worktreeId`); stringBound(payload.branch, 1, 512, `${type} payload.branch`); stringBound(payload.head, 1, 512, `${type} payload.head`); if (typeof payload.clean !== 'boolean') eventInvalid(`${type} payload.clean must be boolean`); eventHash(payload.cwdFingerprint, `${type} payload.cwdFingerprint`); }
  else if (type === 'worktree_cleanup_requested') { exactPayload(payload, ['worktreeId', 'reason'], [], type); eventId(payload.worktreeId, `${type} payload.worktreeId`); eventEnum(payload.reason, ['run_terminal', 'node_terminal', 'recovery', 'manual_cleanup'], `${type} payload.reason`); }
  else if (type === 'worktree_removed') { exactPayload(payload, ['worktreeId', 'branchRemoved'], [], type); eventId(payload.worktreeId, `${type} payload.worktreeId`); if (typeof payload.branchRemoved !== 'boolean') eventInvalid(`${type} payload.branchRemoved must be boolean`); }
  else if (type === 'result_recorded') { exactPayload(payload, ['resultRef'], [], type); validateResultRef(payload.resultRef); }
  else if (type === 'merge_started') { exactPayload(payload, ['integrationWorktreeId', 'candidateResultIds', 'beforeCommit'], [], type); eventId(payload.integrationWorktreeId, `${type} payload.integrationWorktreeId`); eventStringArray(payload.candidateResultIds, `${type} payload.candidateResultIds`); stringBound(payload.beforeCommit, 1, 512, `${type} payload.beforeCommit`); }
  else if (type === 'merge_conflict') { exactPayload(payload, ['integrationWorktreeId', 'candidateResultIds', 'conflictResultId'], [], type); eventId(payload.integrationWorktreeId, `${type} payload.integrationWorktreeId`); eventStringArray(payload.candidateResultIds, `${type} payload.candidateResultIds`); stringBound(payload.conflictResultId, 1, 512, `${type} payload.conflictResultId`); }
  else if (type === 'merge_succeeded') { exactPayload(payload, ['integrationWorktreeId', 'candidateResultIds', 'integrationCommit', 'verificationResultIds'], [], type); eventId(payload.integrationWorktreeId, `${type} payload.integrationWorktreeId`); eventStringArray(payload.candidateResultIds, `${type} payload.candidateResultIds`); stringBound(payload.integrationCommit, 1, 512, `${type} payload.integrationCommit`); eventStringArray(payload.verificationResultIds, `${type} payload.verificationResultIds`); }
  else if (type === 'merge_failed') { exactPayload(payload, ['integrationWorktreeId', 'candidateResultIds', 'errorClass', 'evidenceResultIds'], [], type); eventId(payload.integrationWorktreeId, `${type} payload.integrationWorktreeId`); eventStringArray(payload.candidateResultIds, `${type} payload.candidateResultIds`); stringBound(payload.errorClass, 1, 128, `${type} payload.errorClass`); eventStringArray(payload.evidenceResultIds, `${type} payload.evidenceResultIds`); }
  else if (type === 'test_recorded') { exactPayload(payload, ['testResultId', 'commandHash', 'exitCode', 'passed', 'deterministic'], [], type); stringBound(payload.testResultId, 1, 512, `${type} payload.testResultId`); eventHash(payload.commandHash, `${type} payload.commandHash`); safeInteger(payload.exitCode, -2_147_483_648, 2_147_483_647, `${type} payload.exitCode`); if (typeof payload.passed !== 'boolean' || typeof payload.deterministic !== 'boolean') eventInvalid(`${type} payload booleans are invalid`); }
  else if (type === 'stale_activity_completion_observed') { exactPayload(payload, ['currentLeaseId', 'currentLeaseEpoch', 'observedOutcome', 'forensicResultIds'], [], type); eventId(payload.currentLeaseId, `${type} payload.currentLeaseId`, { uuid: true, nullable: true }); if (payload.currentLeaseEpoch !== null) safeInteger(payload.currentLeaseEpoch, 0, Number.MAX_SAFE_INTEGER, `${type} payload.currentLeaseEpoch`); eventEnum(payload.observedOutcome, ['completed', 'failed', 'cancelled'], `${type} payload.observedOutcome`); eventStringArray(payload.forensicResultIds, `${type} payload.forensicResultIds`); }
  else if (type === 'checkpoint_written') { exactPayload(payload, ['throughSeq', 'stateHash', 'checkpointFile', 'checkpointHash'], [], type); safeInteger(payload.throughSeq, 0, Number.MAX_SAFE_INTEGER, `${type} payload.throughSeq`); eventHash(payload.stateHash, `${type} payload.stateHash`); eventHash(payload.checkpointHash, `${type} payload.checkpointHash`); if (!/^\d+-[0-9a-f]{64}\.json$/u.test(payload.checkpointFile)) eventInvalid(`${type} payload.checkpointFile is invalid`); }
  else eventInvalid(`unknown workflow event type ${type}`);
}

function expectedCommandTypes(type) {
  if (type === 'run_created') return ['start-run'];
  if (type === 'run_pause_requested') return ['pause-run'];
  if (type === 'run_resumed') return ['resume-run'];
  if (type === 'run_cancel_requested') return ['cancel-run'];
  if (type === 'graph_patch_applied') return ['graph-patch', 'set-node-priority'];
  if (type === 'retry_scheduled') return ['retry-node', 'resolve-node'];
  if (type === 'node_succeeded' || type === 'node_set_aside' || type === 'uncertain_resolved') return ['resolve-node'];
  if (type === 'agent_steer_requested') return ['steer-node'];
  if (type === 'human_resolved') return ['answer-human-gate'];
  if (type === 'budget_ceiling_raised') return ['raise-ceiling'];
  return [];
}

export function validateWorkflowEvent(value) {
  validateCanonicalizable(value);
  exactKeys(value, ENVELOPE_KEYS, [], 'workflow event');
  if (value.eventSchemaVersion > 2 || value.engineSchemaVersion > 1) eventInvalid('future workflow event schema is unsupported', 'WORKFLOW_SCHEMA_FUTURE');
  if (![1, 2].includes(value.eventSchemaVersion) || value.engineSchemaVersion !== 1
    || value.schema !== `talos.workflow-event.v${value.eventSchemaVersion}`) eventInvalid('workflow event schema version is invalid');
  if (['capacity_claimed', 'capacity_released'].includes(value.type) && value.eventSchemaVersion !== 2) eventInvalid('capacity facts require workflow event version 2');
  eventId(value.eventId, 'workflow event eventId', { uuid: true });
  eventId(value.runId, 'workflow event runId', { uuid: true });
  safeInteger(value.seq, 1, Number.MAX_SAFE_INTEGER, 'workflow event seq');
  validIso(value.at, 'workflow event at');
  if (!EVENT_TYPES.has(value.type)) eventInvalid(`unknown workflow event type ${value.type}`);
  if (value.nodeId !== null && !ID.test(value.nodeId)) eventInvalid('workflow event nodeId is invalid');
  if (value.causationId !== null) eventId(value.causationId, 'workflow event causationId', { uuid: true });
  if (value.correlationId !== value.runId) eventInvalid('workflow event correlationId must equal runId');
  safeInteger(value.graphVersion, 1, Number.MAX_SAFE_INTEGER, 'workflow event graphVersion');

  const commandNull = value.commandId === null && value.commandType === null && value.commandPayloadHash === null;
  const commandFull = EVENT_UUID.test(value.commandId) && COMMAND_TYPES.has(value.commandType) && SHA256.test(value.commandPayloadHash);
  if (!commandNull && !commandFull) eventInvalid('workflow event command fields must be all null or all valid');
  const expected = expectedCommandTypes(value.type);
  if (commandFull && !expected.includes(value.commandType)) eventInvalid(`workflow event commandType ${value.commandType} is invalid for ${value.type}`);
  if (value.type === 'run_created' && !commandFull) eventInvalid('run_created must carry the accepted start-run command');
  if (value.type === 'uncertain_resolved' && !commandFull) eventInvalid('uncertain_resolved must carry the person\'s resolve-node command');
  if (value.type === 'budget_ceiling_raised' && !commandFull) eventInvalid('budget_ceiling_raised must carry the person\'s raise-ceiling command');
  if (value.commandType === 'retry-node' && value.payload?.reasonClass !== 'user_retry') eventInvalid('a retry-node command is a user retry');
  if (value.commandType === 'resolve-node' && value.type === 'retry_scheduled' && value.payload?.reasonClass !== 'user_retry') eventInvalid('a resolve-node retry is a user retry');
  if (value.commandType === 'resolve-node' && value.type === 'node_succeeded' && value.payload?.by !== 'person') eventInvalid('a resolve-node success is marked by the person');

  const activityNull = value.activityExecutionId === null && value.attempt === null && value.leaseId === null && value.leaseEpoch === null;
  const activityFull = EVENT_UUID.test(value.activityExecutionId)
    && Number.isSafeInteger(value.attempt) && value.attempt >= 1
    && EVENT_UUID.test(value.leaseId) && Number.isSafeInteger(value.leaseEpoch) && value.leaseEpoch >= 0;
  if (!activityNull && !activityFull) eventInvalid('workflow event activity/attempt/lease fields must be all null or all valid');
  if (ACTIVITY_EVENT_TYPES.has(value.type) && !activityFull) eventInvalid(`${value.type} requires activity, attempt and lease identity`);
  if ((RUN_EVENT_TYPES.has(value.type) || value.type === 'graph_patch_applied') && (value.nodeId !== null || !activityNull)) eventInvalid(`${value.type} cannot be node/activity scoped`);
  if (NODE_EVENT_TYPES.has(value.type) && value.nodeId === null) eventInvalid(`${value.type} requires nodeId`);
  if (ACTIVITY_EVENT_TYPES.has(value.type) && value.nodeId === null) eventInvalid(`${value.type} requires nodeId`);
  if (value.type === 'run_created' && value.graphVersion !== 1) eventInvalid('run_created graphVersion must be 1');
  validateEventPayload(value);
  return value;
}

export function validateWorkflowJournalRecord(value) {
  validateCanonicalizable(value);
  exactKeys(value, ['seq', 'event', 'prevRecordHash', 'recordHash'], [], 'workflow journal record');
  safeInteger(value.seq, 1, Number.MAX_SAFE_INTEGER, 'workflow journal record seq');
  validateWorkflowEvent(value.event);
  if (value.seq !== value.event.seq) invalid('workflow journal record seq does not match event seq', 'WORKFLOW_JOURNAL_INVALID');
  if (value.prevRecordHash !== 'GENESIS' && !SHA256.test(value.prevRecordHash)) invalid('workflow journal prevRecordHash is invalid', 'WORKFLOW_JOURNAL_INVALID');
  if (!SHA256.test(value.recordHash)) invalid('workflow journal recordHash is invalid', 'WORKFLOW_JOURNAL_INVALID');
  const expected = canonicalHash({ seq: value.seq, event: value.event, prevRecordHash: value.prevRecordHash });
  if (value.recordHash !== expected) invalid('workflow journal recordHash does not match record bytes', 'WORKFLOW_JOURNAL_HASH_MISMATCH');
  return value;
}
