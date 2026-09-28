import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { preflightWorkflowDefinition } from '../src/workflow/preflight.mjs';

const base = JSON.parse(await readFile(
  new URL('./fixtures/workflow/definitions/core-v1-minimal.json', import.meta.url),
  'utf8',
));

const clone = (value) => structuredClone(value);
const codes = (entries) => entries.map((entry) => entry.code);

function graphOf(nodes, edges, overrides = {}) {
  const core = clone(base);
  core.nodes = nodes;
  core.edges = edges;
  core.acceptance = overrides.acceptance ?? [];
  core.limits = {
    ...core.limits,
    maxLogicalNodes: Math.max(nodes.length, overrides.maxLogicalNodes ?? nodes.length),
    maxEdges: Math.max(edges.length, overrides.maxEdges ?? edges.length),
    maxFanoutPerNode: overrides.maxFanoutPerNode ?? Math.max(1, nodes.length),
    maxAgentSessions: overrides.maxAgentSessions ?? Math.max(1, nodes.length),
    maxDepth: overrides.maxDepth ?? Math.max(1, nodes.length),
  };
  return core;
}

function readNode(id, kind = 'test') {
  const node = clone(kind === 'agent' ? base.nodes[0] : base.nodes[1]);
  node.id = id;
  node.label = id;
  node.inputs = [];
  node.outputs = [];
  node.capabilityProfile = 'read';
  node.workspacePolicy = { mode: 'shared-read' };
  node.writeSetHint = [];
  node.role = kind === 'agent' ? 'researcher' : 'tester';
  return node;
}

function controlEdge(from, to, index) {
  return { id: `edge_${index}`, from, to, type: 'control', condition: null, mapping: null };
}

test('PREFLIGHT-VALID-SUMMARY', () => {
  const result = preflightWorkflowDefinition(clone(base));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.estimates, {
    nodeCount: 2,
    edgeCount: 1,
    writerCount: 1,
    humanGateCount: 0,
    acceptanceGateCount: 1,
    maxTheoreticalFanout: 1,
    criticalPathLength: 2,
    modelIds: [],
    capabilityProfiles: ['read', 'workspace-write'],
  });
  assert.ok(codes(result.warnings).includes('PREFLIGHT_UNKNOWN_COST'));
});

test('PREFLIGHT-INVALID-CONTRACT-AS-DIAGNOSTIC', () => {
  const invalid = clone(base);
  invalid.nodes = [];
  const result = preflightWorkflowDefinition(invalid);
  assert.deepEqual(codes(result.errors), ['PREFLIGHT_DEFINITION_INVALID']);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.estimates.nodeCount, 0);
});

test('PREFLIGHT-DEPTH-AND-FANOUT-LIMITS', () => {
  const chainNodes = Array.from({ length: 6 }, (_, index) => readNode(`n${index}`));
  const chainEdges = Array.from({ length: 5 }, (_, index) => controlEdge(`n${index}`, `n${index + 1}`, index));
  const deep = preflightWorkflowDefinition(graphOf(chainNodes, chainEdges, { maxDepth: 4 }));
  assert.ok(codes(deep.errors).includes('PREFLIGHT_GRAPH_DEPTH_EXCEEDED'));

  const starNodes = Array.from({ length: 8 }, (_, index) => readNode(`s${index}`));
  const starEdges = Array.from({ length: 7 }, (_, index) => controlEdge('s0', `s${index + 1}`, index));
  const wide = preflightWorkflowDefinition(graphOf(starNodes, starEdges, { maxFanoutPerNode: 5 }));
  assert.ok(codes(wide.errors).includes('PREFLIGHT_FANOUT_LIMIT_EXCEEDED'));
});

test('PREFLIGHT-AGENT-SESSION-LIMIT', () => {
  const nodes = [readNode('a0', 'agent'), readNode('a1', 'agent'), readNode('a2', 'agent')];
  const edges = [controlEdge('a0', 'a1', 0), controlEdge('a1', 'a2', 1)];
  const result = preflightWorkflowDefinition(graphOf(nodes, edges, { maxAgentSessions: 2 }));
  assert.ok(codes(result.errors).includes('PREFLIGHT_AGENT_SESSION_LIMIT_EXCEEDED'));
});

test('PREFLIGHT-EXPLICIT-MODEL-UNAVAILABLE', () => {
  const core = clone(base);
  core.nodes[0].modelPolicy = { mode: 'explicit', model: 'provider/model', reasoning: null };
  const result = preflightWorkflowDefinition(core, {
    availableModelIds: ['provider/other'],
    availableToolIds: null,
    graphMutationAuthorized: null,
    workspace: null,
  });
  assert.ok(codes(result.errors).includes('PREFLIGHT_MODEL_UNAVAILABLE'));
});

test('PREFLIGHT-REQUIRED-TOOL-UNAVAILABLE', () => {
  const core = clone(base);
  core.policy.externalTools = { mode: 'allowlist', ids: ['tool_a'] };
  const result = preflightWorkflowDefinition(core, {
    availableModelIds: null,
    availableToolIds: ['tool_b'],
    requiredToolIds: ['tool_a'],
    graphMutationAuthorized: null,
    workspace: null,
  });
  assert.ok(codes(result.errors).includes('PREFLIGHT_TOOL_UNAVAILABLE'));
});

test('PREFLIGHT-GRAPH-MUTATOR-MISSING', () => {
  const result = preflightWorkflowDefinition(clone(base), {
    availableModelIds: null,
    availableToolIds: null,
    graphMutationAuthorized: false,
    workspace: null,
  });
  assert.ok(codes(result.errors).includes('PREFLIGHT_GRAPH_MUTATOR_MISSING'));
});

test('PREFLIGHT-MULTI-WRITER-NO-INTEGRATION', () => {
  const core = clone(base);
  const second = clone(core.nodes[0]);
  second.id = 'implement_b';
  second.label = 'Implementa B';
  core.nodes.push(second);
  core.nodes[1].workspacePolicy = { mode: 'shared-read' };
  core.edges.push({ ...clone(core.edges[0]), id: 'implement_b_to_test', from: 'implement_b' });
  const result = preflightWorkflowDefinition(core);
  assert.ok(codes(result.errors).includes('PREFLIGHT_MULTI_WRITER_INTEGRATION_MISSING'));
});

test('PREFLIGHT-ACCEPTANCE-NO-EVIDENCE-PATH', () => {
  const core = clone(base);
  core.acceptance[0] = {
    ...core.acceptance[0],
    source: { nodeId: 'implement', output: 'commit' },
    evidenceKind: 'commit',
    predicate: { op: 'result-kind', value: 'commit' },
  };
  const result = preflightWorkflowDefinition(core);
  assert.ok(codes(result.errors).includes('PREFLIGHT_ACCEPTANCE_EVIDENCE_PATH_MISSING'));
});

test('PREFLIGHT-WORKSPACE-WRITER-HAZARDS', () => {
  const result = preflightWorkflowDefinition(clone(base), {
    availableModelIds: null,
    availableToolIds: null,
    graphMutationAuthorized: null,
    workspace: { hasConflict: true, hasDirtySubmodule: true },
  });
  assert.ok(codes(result.errors).includes('PREFLIGHT_WORKSPACE_CONFLICT'));
  assert.ok(codes(result.errors).includes('PREFLIGHT_DIRTY_SUBMODULE'));
});

test('PREFLIGHT-WRITESET-OVERLAP-AND-HOTSPOT', () => {
  const core = clone(base);
  const second = clone(core.nodes[0]);
  second.id = 'implement_b';
  second.label = 'Implementa B';
  second.writeSetHint = ['src/shared.js'];
  core.nodes[0].writeSetHint = ['src/shared.js'];
  core.nodes.push(second);
  core.edges.push({ ...clone(core.edges[0]), id: 'implement_b_to_test', from: 'implement_b' });
  let result = preflightWorkflowDefinition(core);
  assert.ok(codes(result.warnings).includes('PREFLIGHT_HOTSPOT_FILE'));

  core.nodes[0].writeSetHint = ['src/**'];
  result = preflightWorkflowDefinition(core);
  assert.ok(codes(result.warnings).includes('PREFLIGHT_WRITESET_OVERLAP'));
});

test('PREFLIGHT-HIGH-FANOUT-AND-LONG-PATH', () => {
  const starNodes = Array.from({ length: 12 }, (_, index) => readNode(`w${index}`));
  const starEdges = Array.from({ length: 11 }, (_, index) => controlEdge('w0', `w${index + 1}`, index));
  const wide = preflightWorkflowDefinition(graphOf(starNodes, starEdges, {
    maxLogicalNodes: 20,
    maxFanoutPerNode: 20,
  }));
  assert.ok(codes(wide.warnings).includes('PREFLIGHT_HIGH_FANOUT'));

  const chainNodes = Array.from({ length: 6 }, (_, index) => readNode(`p${index}`));
  const chainEdges = Array.from({ length: 5 }, (_, index) => controlEdge(`p${index}`, `p${index + 1}`, index));
  const long = preflightWorkflowDefinition(graphOf(chainNodes, chainEdges, { maxDepth: 8 }));
  assert.ok(codes(long.warnings).includes('PREFLIGHT_LONG_CRITICAL_PATH'));
});

test('PREFLIGHT-BUDGET-AND-UNKNOWN-COST / M108_UNKNOWN_COST_COERCED_TO_ZERO', () => {
  const core = clone(base);
  core.budgets.wallMs = 700_000;
  const result = preflightWorkflowDefinition(core);
  assert.ok(codes(result.warnings).includes('PREFLIGHT_BUDGET_PROBABLY_INSUFFICIENT'));
  assert.ok(codes(result.warnings).includes('PREFLIGHT_UNKNOWN_COST'));
  assert.equal(core.budgets.knownCostUsd, null);
});

test('PREFLIGHT-SINGLE-MODEL-JUDGE', () => {
  const core = clone(base);
  core.nodes[1].kind = 'judge';
  core.nodes[1].role = 'reviewer';
  core.nodes[1].activityPolicy.effectClass = 'billable';
  const result = preflightWorkflowDefinition(core);
  assert.ok(codes(result.warnings).includes('PREFLIGHT_SINGLE_MODEL_JUDGE'));
});

test('PREFLIGHT-DETERMINISTIC-ORDER / M110_PREFLIGHT_DIAGNOSTICS_NONDETERMINISTIC', () => {
  const core = clone(base);
  core.budgets.wallMs = 700_000;
  const first = preflightWorkflowDefinition(core, {
    availableModelIds: null,
    availableToolIds: null,
    graphMutationAuthorized: false,
    workspace: { hasConflict: true, hasDirtySubmodule: true },
  });
  const second = preflightWorkflowDefinition(clone(core), {
    availableModelIds: null,
    availableToolIds: null,
    graphMutationAuthorized: false,
    workspace: { hasDirtySubmodule: true, hasConflict: true },
  });
  assert.deepEqual(first, second);
  assert.deepEqual(codes(first.errors), [...codes(first.errors)].sort());
  assert.deepEqual(codes(first.warnings), [...codes(first.warnings)].sort());
});

test('PREFLIGHT-CONTEXT-STRICT', () => {
  assert.throws(
    () => preflightWorkflowDefinition(clone(base), { unexpected: true }),
    (error) => error?.code === 'WORKFLOW_DEFINITION_INVALID',
  );
});
