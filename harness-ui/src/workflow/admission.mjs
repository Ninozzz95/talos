export class WorkflowAdmissionError extends Error {
  constructor(message, code = 'WORKFLOW_CAPACITY_POLICY_INVALID') {
    super(message);
    this.name = 'WorkflowAdmissionError';
    this.code = code;
  }
}

const invalid = (message) => { throw new WorkflowAdmissionError(message); };
const exceeded = (dimension) => {
  throw new WorkflowAdmissionError(`${dimension} capacity is exhausted`, 'WORKFLOW_CAPACITY_EXCEEDED');
};

function slots(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(`${name} must be a nonnegative safe integer`);
  return value;
}

function limitsMap(value, name) {
  if (!(value instanceof Map)) invalid(`${name} must be a Map`);
  for (const [key, limit] of value) {
    if (typeof key !== 'string' || key.length === 0) invalid(`${name} has an invalid key`);
    slots(limit, `${name}.${key}`);
  }
  return value;
}

export function validateCapacityPolicy(value) {
  const keys = ['globalAgents', 'globalWriters', 'localProcesses', 'perProvider', 'perModel', 'perWorkspaceWriters'];
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    invalid('capacity policy must define every hard dimension exactly once');
  }
  for (const key of keys.slice(0, 3)) slots(value[key], key);
  limitsMap(value.perProvider, 'perProvider');
  limitsMap(value.perWorkspaceWriters, 'perWorkspaceWriters');
  if (!(value.perModel instanceof Map)) invalid('perModel must be a Map');
  for (const [provider, models] of value.perModel) {
    if (typeof provider !== 'string' || provider.length === 0) invalid('perModel provider is invalid');
    limitsMap(models, `perModel.${provider}`);
  }
  return value;
}

function sumActive(activeClaims, field, matches = () => true) {
  let total = 0;
  for (const claim of activeClaims) {
    if (!matches(claim)) continue;
    const amount = slots(claim[field], `active claim ${field}`);
    total += amount;
    if (!Number.isSafeInteger(total)) invalid(`${field} active occupancy overflow`);
  }
  return total;
}

function assertFits(used, requested, ceiling, dimension) {
  const increment = slots(requested, dimension);
  if (!Number.isSafeInteger(used + increment) || used + increment > ceiling) exceeded(dimension);
}

export function assertCapacityAvailable({ policy, activeClaims, requested } = {}) {
  validateCapacityPolicy(policy);
  if (!Array.isArray(activeClaims) || requested === null || typeof requested !== 'object') {
    invalid('active claims and requested claim are required');
  }
  for (const key of ['agentSlots', 'writerSlots', 'localProcessSlots']) slots(requested[key], key);
  if (requested.agentSlots + requested.writerSlots + requested.localProcessSlots < 1) invalid('claim has no occupied slots');
  if (requested.agentSlots > 0 && (typeof requested.provider !== 'string' || typeof requested.model !== 'string')) {
    invalid('agent claim needs provider and model');
  }
  if (requested.writerSlots > 0 && (typeof requested.workspaceRoot !== 'string' || requested.workspaceRoot.length === 0)) {
    invalid('writer claim needs workspace root');
  }
  assertFits(sumActive(activeClaims, 'agentSlots'), requested.agentSlots, policy.globalAgents, 'globalAgents');
  assertFits(sumActive(activeClaims, 'writerSlots'), requested.writerSlots, policy.globalWriters, 'globalWriters');
  assertFits(sumActive(activeClaims, 'localProcessSlots'), requested.localProcessSlots, policy.localProcesses, 'localProcesses');
  if (requested.agentSlots > 0) {
    assertFits(sumActive(activeClaims, 'agentSlots', (claim) => claim.provider === requested.provider),
      requested.agentSlots, policy.perProvider.get(requested.provider) ?? 0, 'perProvider');
    assertFits(sumActive(activeClaims, 'agentSlots', (claim) => claim.provider === requested.provider && claim.model === requested.model),
      requested.agentSlots, policy.perModel.get(requested.provider)?.get(requested.model) ?? 0, 'perModel');
  }
  if (requested.writerSlots > 0) {
    assertFits(sumActive(activeClaims, 'writerSlots', (claim) => claim.workspaceRoot === requested.workspaceRoot),
      requested.writerSlots, policy.perWorkspaceWriters.get(requested.workspaceRoot) ?? 0, 'perWorkspaceWriters');
  }
}
