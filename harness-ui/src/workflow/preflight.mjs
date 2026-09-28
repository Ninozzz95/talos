import { canonicalJson, validateCanonicalizable } from './canonical-json.mjs';
import {
  WorkflowContractError,
  analyzeWorkflowGraph,
  validateWorkflowDefinitionCore,
} from './contract.mjs';

const CONTEXT_KEYS = Object.freeze([
  'availableModelIds', 'availableToolIds', 'requiredToolIds',
  'graphMutationAuthorized', 'workspace',
]);
const BUDGET_FIELDS = Object.freeze([
  'promptTokens', 'completionTokens', 'wallMs', 'agentSeconds', 'toolCalls',
  'modelRequests', 'retryPromptTokens', 'retryModelRequests', 'knownCostUsd',
]);
const WRITER_CAPABILITIES = new Set(['workspace-write', 'on-request', 'full']);
const VERIFIED_EVIDENCE_KINDS = Object.freeze({
  'deterministic-evidence': new Set(['test', 'verify']),
  validated: new Set(['test', 'verify', 'judge']),
});

function failContext(message) {
  throw new WorkflowContractError(message, 'WORKFLOW_DEFINITION_INVALID');
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactOptionalObject(value, allowed, path) {
  if (!plainObject(value)) failContext(`${path} must be a plain object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) failContext(`${path} has unknown field ${key}`);
}

function stringSet(value, path) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length > 10_000) failContext(`${path} must be null or a bounded string array`);
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length < 1 || entry.length > 512) failContext(`${path} contains an invalid id`);
    if (seen.has(entry)) failContext(`${path} contains a duplicate id`);
    seen.add(entry);
  }
  return seen;
}

function normalizeContext(value) {
  if (value === undefined) value = {};
  try { validateCanonicalizable(value); } catch (error) { failContext(`preflight context is not canonical JSON: ${error.message}`); }
  exactOptionalObject(value, CONTEXT_KEYS, 'preflight context');
  const graphMutationAuthorized = value.graphMutationAuthorized ?? null;
  if (graphMutationAuthorized !== null && typeof graphMutationAuthorized !== 'boolean') {
    failContext('preflight context.graphMutationAuthorized must be boolean or null');
  }
  let workspace = null;
  if (value.workspace !== undefined && value.workspace !== null) {
    exactOptionalObject(value.workspace, ['hasConflict', 'hasDirtySubmodule'], 'preflight context.workspace');
    if (typeof value.workspace.hasConflict !== 'boolean' || typeof value.workspace.hasDirtySubmodule !== 'boolean') {
      failContext('preflight context.workspace flags must be boolean');
    }
    workspace = {
      hasConflict: value.workspace.hasConflict,
      hasDirtySubmodule: value.workspace.hasDirtySubmodule,
    };
  }
  return {
    availableModelIds: stringSet(value.availableModelIds, 'preflight context.availableModelIds'),
    availableToolIds: stringSet(value.availableToolIds, 'preflight context.availableToolIds'),
    requiredToolIds: stringSet(value.requiredToolIds, 'preflight context.requiredToolIds'),
    graphMutationAuthorized,
    workspace,
  };
}

function diagnostic(code, message, subjects = []) {
  const allSubjects = [...new Set(subjects.map(String))].sort();
  const boundedSubjects = allSubjects.slice(0, 64);
  if (allSubjects.length > boundedSubjects.length) boundedSubjects.push(`+${allSubjects.length - boundedSubjects.length} more`);
  return {
    code,
    message,
    subjects: boundedSubjects,
  };
}

function sortDiagnostics(values) {
  return values.sort((left, right) => left.code.localeCompare(right.code)
    || canonicalJson(left.subjects).localeCompare(canonicalJson(right.subjects))
    || left.message.localeCompare(right.message));
}

function rawEstimates(core) {
  const nodes = Array.isArray(core?.nodes) ? core.nodes : [];
  const edges = Array.isArray(core?.edges) ? core.edges : [];
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    writerCount: 0,
    humanGateCount: 0,
    acceptanceGateCount: Array.isArray(core?.acceptance) ? core.acceptance.length : 0,
    maxTheoreticalFanout: 0,
    criticalPathLength: 0,
    modelIds: [],
    capabilityProfiles: [],
  };
}

function graphIndexes(core) {
  const outgoing = new Map(core.nodes.map((node) => [node.id, []]));
  for (const edge of core.edges) outgoing.get(edge.from).push(edge.to);
  for (const targets of outgoing.values()) targets.sort();
  return outgoing;
}

function reverseReachable(core, targetIds) {
  const incoming = new Map(core.nodes.map((node) => [node.id, []]));
  for (const edge of core.edges) incoming.get(edge.to).push(edge.from);
  const reachable = new Set(targetIds);
  const queue = [...reachable];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    for (const previous of incoming.get(queue[cursor]) ?? []) if (!reachable.has(previous)) {
      reachable.add(previous);
      queue.push(previous);
    }
  }
  return reachable;
}

function criticalPath(core) {
  const { components } = analyzeWorkflowGraph(core);
  const componentByNode = new Map();
  components.forEach((component, index) => component.forEach((nodeId) => componentByNode.set(nodeId, index)));
  const outgoing = components.map(() => new Set());
  const indegree = components.map(() => 0);
  for (const edge of core.edges) {
    const from = componentByNode.get(edge.from);
    const to = componentByNode.get(edge.to);
    if (from === to || outgoing[from].has(to)) continue;
    outgoing[from].add(to);
    indegree[to] += 1;
  }
  const queue = indegree.map((value, index) => ({ value, index }))
    .filter(({ value }) => value === 0)
    .map(({ index }) => index)
    .sort((a, b) => a - b);
  const distance = components.map((component) => component.length);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const next of [...outgoing[current]].sort((a, b) => a - b)) {
      distance[next] = Math.max(distance[next], distance[current] + components[next].length);
      indegree[next] -= 1;
      if (indegree[next] === 0) {
        queue.push(next);
      }
    }
  }
  return Math.max(0, ...distance);
}

function theoreticalFanout(core, outgoing) {
  let maximum = 0;
  for (const node of core.nodes) {
    maximum = Math.max(maximum, outgoing.get(node.id).length);
    if (node.kind === 'fanout') maximum = Math.max(maximum, node.control.maxChildren);
  }
  return maximum;
}

function theoreticalAgentSessions(core) {
  return core.nodes.filter((node) => node.kind === 'agent').length
    + core.nodes.filter((node) => node.kind === 'fanout')
      .reduce((total, node) => total + node.control.maxChildren, 0);
}

function sharedWriteHint(left, right) {
  if (left === right) return 'exact';
  const prefix = (value) => value.split(/[*?[{]/u, 1)[0].replace(/\/$/u, '');
  const leftPrefix = prefix(left);
  const rightPrefix = prefix(right);
  if (!leftPrefix || !rightPrefix) return 'overlap';
  if (leftPrefix === rightPrefix
    || leftPrefix.startsWith(`${rightPrefix}/`)
    || rightPrefix.startsWith(`${leftPrefix}/`)) return 'overlap';
  return null;
}

function addWriteSetWarnings(warnings, writers) {
  const exact = new Map();
  for (const writer of writers) for (const hint of writer.writeSetHint) {
    const entry = exact.get(hint) ?? { count: 0, owners: new Set() };
    entry.count += 1;
    if (entry.owners.size < 65) entry.owners.add(writer.id);
    exact.set(hint, entry);
  }
  for (const [hint, entry] of exact) if (entry.count > 1) {
    warnings.push(diagnostic(
      'PREFLIGHT_HOTSPOT_FILE',
      `Exact write target ${hint} is shared by multiple writer nodes.`,
      [hint, ...entry.owners, ...(entry.count > entry.owners.size ? [`+${entry.count - entry.owners.size} occurrences`] : [])],
    ));
  }
  const root = { children: new Map(), first: null, descendant: null };
  let overlap = null;
  for (const writer of writers) {
    for (const hint of writer.writeSetHint) {
      const entry = {
        writerId: writer.id,
        hint,
        prefix: hint.split(/[*?[{]/u, 1)[0].replace(/\/$/u, ''),
      };
      const segments = entry.prefix.split('/').filter(Boolean);
      let node = root;
      const visited = [root];
      for (const segment of segments) {
        if (node.first && node.first.writerId !== entry.writerId
          && sharedWriteHint(node.first.hint, entry.hint) === 'overlap') {
          overlap = [node.first.writerId, node.first.hint, entry.writerId, entry.hint];
          break;
        }
        if (!node.children.has(segment)) {
          node.children.set(segment, { children: new Map(), first: null, descendant: null });
        }
        node = node.children.get(segment);
        visited.push(node);
      }
      if (overlap) break;
      const prior = node.first ?? node.descendant;
      if (prior && prior.writerId !== entry.writerId
        && sharedWriteHint(prior.hint, entry.hint) === 'overlap') {
        overlap = [prior.writerId, prior.hint, entry.writerId, entry.hint];
        break;
      }
      if (!node.first) node.first = entry;
      for (const visitedNode of visited) if (!visitedNode.descendant) visitedNode.descendant = entry;
    }
    if (overlap) break;
  }
  if (overlap) warnings.push(diagnostic(
    'PREFLIGHT_WRITESET_OVERLAP',
    'Writer path hints overlap and may require serialization or integration repair.',
    overlap,
  ));
}

function addBudgetWarnings(warnings, core) {
  for (const field of BUDGET_FIELDS) {
    const runLimit = core.budgets[field];
    if (runLimit === null) continue;
    const values = core.nodes.map((node) => node.budget[field]);
    if (values.some((value) => value === null)) continue;
    const total = values.reduce((sum, value) => sum + value, 0);
    if (total > runLimit) warnings.push(diagnostic(
      'PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT',
      `The sum of node ${field} bounds exceeds the run bound.`,
      [field],
    ));
  }
  if (core.budgets.knownCostUsd === null
    || core.nodes.some((node) => node.budget.knownCostUsd === null)) {
    warnings.push(diagnostic(
      'PREFLIGHT_UNKNOWN_COST',
      'At least one cost bound is unknown; cost remains null rather than zero.',
      ['knownCostUsd'],
    ));
  }
}

export function preflightWorkflowDefinition(core, context = {}) {
  const environment = normalizeContext(context);
  const estimates = rawEstimates(core);
  try {
    validateWorkflowDefinitionCore(core);
  } catch (error) {
    return {
      errors: [diagnostic(
        'PREFLIGHT_DEFINITION_INVALID',
        `Workflow Definition violates its canonical contract: ${error.message}`,
      )],
      warnings: [],
      estimates,
    };
  }

  const errors = [];
  const warnings = [];
  const outgoing = graphIndexes(core);
  const nodeById = new Map(core.nodes.map((node) => [node.id, node]));
  const writers = core.nodes.filter((node) => WRITER_CAPABILITIES.has(node.capabilityProfile));
  const integrations = core.nodes.filter((node) => node.workspacePolicy.mode === 'integration');
  const maximumFanout = theoreticalFanout(core, outgoing);
  const pathLength = criticalPath(core);
  const modelIds = [...new Set(core.nodes
    .filter((node) => node.modelPolicy.mode === 'explicit')
    .map((node) => node.modelPolicy.model))].sort();

  Object.assign(estimates, {
    writerCount: writers.length,
    humanGateCount: core.nodes.filter((node) => node.kind === 'human').length,
    maxTheoreticalFanout: maximumFanout,
    criticalPathLength: pathLength,
    modelIds,
    capabilityProfiles: [...new Set(core.nodes.map((node) => node.capabilityProfile))].sort(),
  });

  if (pathLength > core.limits.maxDepth) errors.push(diagnostic(
    'PREFLIGHT_GRAPH_DEPTH_EXCEEDED',
    'The graph critical path exceeds limits.maxDepth.',
    [pathLength, core.limits.maxDepth],
  ));
  if (maximumFanout > core.limits.maxFanoutPerNode) errors.push(diagnostic(
    'PREFLIGHT_FANOUT_LIMIT_EXCEEDED',
    'The graph theoretical fanout exceeds limits.maxFanoutPerNode.',
    [maximumFanout, core.limits.maxFanoutPerNode],
  ));
  const agentSessions = theoreticalAgentSessions(core);
  if (agentSessions > core.limits.maxAgentSessions) errors.push(diagnostic(
    'PREFLIGHT_AGENT_SESSION_LIMIT_EXCEEDED',
    'The graph can materialize more agent sessions than the explicit limit.',
    [agentSessions, core.limits.maxAgentSessions],
  ));

  if (environment.availableModelIds) {
    const unavailableModels = modelIds.filter((modelId) => !environment.availableModelIds.has(modelId));
    if (unavailableModels.length) errors.push(diagnostic(
      'PREFLIGHT_MODEL_UNAVAILABLE',
      'One or more explicit models are unavailable in the supplied environment.',
      unavailableModels,
    ));
  }
  if (environment.requiredToolIds) {
    const unavailableTools = [];
    for (const toolId of environment.requiredToolIds) {
      const permitted = core.policy.externalTools.mode === 'allowlist'
        && core.policy.externalTools.ids.includes(toolId);
      const available = environment.availableToolIds === null
        ? null
        : environment.availableToolIds.has(toolId);
      if (!permitted || available === false) {
        unavailableTools.push(toolId);
      }
    }
    if (unavailableTools.length) errors.push(diagnostic(
      'PREFLIGHT_TOOL_UNAVAILABLE',
      'One or more required tools are unavailable or outside the proposal allowlist.',
      unavailableTools,
    ));
  }
  if (environment.graphMutationAuthorized === false && core.policy.graphMutation.mode !== 'forbidden') {
    errors.push(diagnostic(
      'PREFLIGHT_GRAPH_MUTATOR_MISSING',
      'The proposal enables graph mutation but the supplied authority forbids it.',
      [core.policy.graphMutation.mode],
    ));
  }

  if (writers.length > 1) {
    const reachesIntegration = reverseReachable(core, integrations.map((node) => node.id));
    const uncovered = writers.filter((writer) => !reachesIntegration.has(writer.id));
    if (uncovered.length) errors.push(diagnostic(
      'PREFLIGHT_MULTI_WRITER_INTEGRATION_MISSING',
      'One or more writer nodes have no reachable integration path.',
      uncovered.map((node) => node.id),
    ));
  }

  const requiredAcceptance = core.acceptance.filter((criterion) => criterion.required);
  const verifiedSources = requiredAcceptance.filter((criterion) => {
    const source = nodeById.get(criterion.source.nodeId);
    return VERIFIED_EVIDENCE_KINDS[criterion.minTrust]?.has(source?.kind);
  });
  const unverified = requiredAcceptance.filter((criterion) => !verifiedSources.includes(criterion));
  const reachesEvidence = reverseReachable(core, verifiedSources.map((criterion) => criterion.source.nodeId));
  const uncoveredWriters = writers.filter((writer) => !reachesEvidence.has(writer.id));
  if (unverified.length || (writers.length && uncoveredWriters.length)) errors.push(diagnostic(
    'PREFLIGHT_ACCEPTANCE_EVIDENCE_PATH_MISSING',
    'Required acceptance lacks a reachable verifier/test evidence path.',
    [...unverified.map((criterion) => criterion.id), ...uncoveredWriters.map((node) => node.id)],
  ));

  if (writers.length && environment.workspace?.hasConflict) errors.push(diagnostic(
    'PREFLIGHT_WORKSPACE_CONFLICT',
    'Writer execution cannot start from a workspace with unresolved conflicts.',
    writers.map((node) => node.id),
  ));
  if (writers.length && environment.workspace?.hasDirtySubmodule) errors.push(diagnostic(
    'PREFLIGHT_DIRTY_SUBMODULE',
    'Writer execution cannot safely represent the supplied dirty submodule state.',
    writers.map((node) => node.id),
  ));

  addWriteSetWarnings(warnings, writers);
  if (maximumFanout > 10) warnings.push(diagnostic(
    'PREFLIGHT_HIGH_FANOUT',
    'Theoretical fanout exceeds the established child-concurrency baseline of 10.',
    [maximumFanout],
  ));
  if (pathLength >= Math.ceil(core.limits.maxDepth * 0.75)) warnings.push(diagnostic(
    'PREFLIGHT_LONG_CRITICAL_PATH',
    'Critical path consumes at least 75% of the explicit graph depth limit.',
    [pathLength, core.limits.maxDepth],
  ));
  addBudgetWarnings(warnings, core);

  const judges = core.nodes.filter((node) => node.kind === 'judge');
  const judgeModels = new Set(judges.map((node) => (
    node.modelPolicy.mode === 'explicit' ? node.modelPolicy.model : node.modelPolicy.mode
  )));
  if (judges.length && judgeModels.size <= 1) warnings.push(diagnostic(
    'PREFLIGHT_SINGLE_MODEL_JUDGE',
    'Judging relies on one effective model policy and may preserve model-specific bias.',
    judges.map((node) => node.id),
  ));

  return {
    errors: sortDiagnostics(errors),
    warnings: sortDiagnostics(warnings),
    estimates,
  };
}
