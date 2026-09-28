import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  WorkflowContractError,
  analyzeWorkflowGraph,
  validateWorkflowCapabilities,
  validateWorkflowDefinitionCore,
  validateWorkflowDefinitionRecord,
  validateWorkflowGraphPatch,
  validateWorkflowLimits,
} from '../src/workflow/contract.mjs';

const fixture = async (relative) => JSON.parse(await readFile(
  new URL(`./fixtures/workflow/${relative}`, import.meta.url),
  'utf8',
));
const copy = (value) => structuredClone(value);
const withPhases = (core) => {
  const next = copy(core);
  next.schema = 'talos.workflow-definition-core.v2';
  next.definitionSchemaVersion = 2;
  next.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  next.nodes.forEach((node) => { node.phaseId = node.id === 'test' ? 'verification' : 'implementation'; });
  return next;
};
const rejects = (fn, pattern = /workflow/i) => assert.throws(fn, (error) => {
  assert.ok(error instanceof WorkflowContractError);
  assert.match(error.message, pattern);
  return true;
});

test('CONTRACT-FIXTURES — minimal, diamond and bounded-loop Definitions validate', async () => {
  for (const name of ['core-v1-minimal.json', 'core-v1-diamond.json', 'core-v1-loop.json']) {
    const core = await fixture(`definitions/${name}`);
    assert.equal(validateWorkflowDefinitionCore(core), core);
  }
});

test('WF-PHASE-V2-CONTRACT-STRICT — phases are explicit, bounded, unique and fully referenced', async () => {
  const core = withPhases(await fixture('definitions/core-v1-minimal.json'));
  assert.equal(validateWorkflowDefinitionCore(core), core);
  for (const mutate of [
    (x) => { delete x.phases; },
    (x) => { x.phases = []; },
    (x) => { x.phases.push(copy(x.phases[0])); },
    (x) => { x.phases[0].label = ''; },
    (x) => { x.phases.push({ id: 'unused', label: 'Unused' }); },
    (x) => { x.nodes[0].phaseId = 'unknown'; },
    (x) => { delete x.nodes[0].phaseId; },
    (x) => { x.phases.push(...Array.from({ length: 63 }, (_, i) => ({ id: `extra-${i}`, label: `Extra ${i}` }))); },
  ]) {
    const invalid = copy(core);
    mutate(invalid);
    rejects(() => validateWorkflowDefinitionCore(invalid), /phase/i);
  }
  const v1 = await fixture('definitions/core-v1-minimal.json');
  v1.phases = core.phases;
  rejects(() => validateWorkflowDefinitionCore(v1), /unknown|phase/i);
});

test('WF-PHASE-GRAPH-PATCH — a v2 added node must reference a declared phase', async () => {
  const core = withPhases(await fixture('definitions/core-v1-minimal.json'));
  const node = { ...copy(core.nodes[0]), id: 'added', label: 'Added', phaseId: 'verification' };
  const patch = { patchId: '00000000-0000-4000-8000-000000000099', expectedGraphVersion: 2,
    operations: [{ op: 'add-node', node }, { op: 'add-edge', edge: { id: 'added-link', from: 'test', to: 'added', type: 'control', condition: null, mapping: null } }] };
  assert.equal(validateWorkflowGraphPatch(patch, { core }), patch);
  const unknown = copy(patch);
  unknown.operations[0].node.phaseId = 'missing';
  rejects(() => validateWorkflowGraphPatch(unknown, { core }), /phase/i);
  const missing = copy(patch);
  delete missing.operations[0].node.phaseId;
  rejects(() => validateWorkflowGraphPatch(missing, { core }), /phase/i);
});

test('WF-PHASE-5000-STACK — a 5000-node chain validates without recursive overflow', async () => {
  const core = withPhases(await fixture('definitions/core-v1-minimal.json'));
  core.nodes = Array.from({ length: 5_000 }, (_, i) => ({ ...copy(core.nodes[0]), id: `n-${i}`, phaseId: i < 2_500 ? 'implementation' : 'verification' }));
  core.edges = core.nodes.slice(1).map((node, i) => ({ id: `e-${i}`, from: core.nodes[i].id, to: node.id, type: 'control', condition: null, mapping: null }));
  core.acceptance = [];
  core.limits.maxLogicalNodes = 5_000;
  core.limits.maxEdges = 5_000;
  core.limits.maxFanoutPerNode = 5_000;
  assert.equal(validateWorkflowDefinitionCore(core), core);
});

test('CONTRACT-STRICT — unknown fields fail closed at every trust-boundary object', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  for (const mutate of [
    (x) => { x.unknown = true; },
    (x) => { x.nodes[0].unknown = true; },
    (x) => { x.nodes[0].activityPolicy.unknown = true; },
    (x) => { x.edges[0].mapping[0].unknown = true; },
    (x) => { x.policy.graphMutation.unknown = true; },
  ]) {
    const invalid = copy(core);
    mutate(invalid);
    rejects(() => validateWorkflowDefinitionCore(invalid), /unknown|keys|field/i);
  }
});

test('CONTRACT-IDENTITY — duplicate nodes, edges and ports are rejected', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  const duplicateNode = copy(core);
  duplicateNode.nodes[1].id = duplicateNode.nodes[0].id;
  rejects(() => validateWorkflowDefinitionCore(duplicateNode), /duplicate.*node/i);

  const duplicateEdge = copy(core);
  duplicateEdge.edges.push(copy(duplicateEdge.edges[0]));
  rejects(() => validateWorkflowDefinitionCore(duplicateEdge), /duplicate.*edge/i);

  const duplicatePort = copy(core);
  duplicatePort.nodes[0].outputs.push(copy(duplicatePort.nodes[0].outputs[0]));
  rejects(() => validateWorkflowDefinitionCore(duplicatePort), /duplicate.*output|output.*duplicate/i);
});

test('CONTRACT-GRAPH — orphan endpoints, disconnected nodes and unbounded SCCs fail', async () => {
  const minimal = await fixture('definitions/core-v1-minimal.json');
  const orphan = copy(minimal);
  orphan.edges[0].to = 'missing';
  rejects(() => validateWorkflowDefinitionCore(orphan), /edge.*missing|unknown.*node/i);

  const disconnected = copy(minimal);
  disconnected.edges = [];
  rejects(() => validateWorkflowDefinitionCore(disconnected), /disconnected|reachable/i);

  const invalidCycle = await fixture('definitions/invalid-cycle.json');
  rejects(() => validateWorkflowDefinitionCore(invalidCycle), /cycle|loop|scc/i);
});

test('CONTRACT-LOOP — exactly one typed loop controller bounds each cyclic SCC', async () => {
  const valid = await fixture('definitions/core-v1-loop.json');
  const analysis = analyzeWorkflowGraph(valid);
  assert.equal(analysis.cyclicComponents.length, 1);
  assert.deepEqual(new Set(analysis.cyclicComponents[0]), new Set(['loop', 'body']));

  const missingControl = copy(valid);
  delete missingControl.nodes[0].control;
  rejects(() => validateWorkflowDefinitionCore(missingControl), /control/i);

  const extraLoop = copy(valid);
  extraLoop.nodes[1].kind = 'loop';
  extraLoop.nodes[1].control = copy(extraLoop.nodes[0].control);
  rejects(() => validateWorkflowDefinitionCore(extraLoop), /exactly one|one loop/i);
});

test('CONTRACT-CAPABILITY — custom and ceiling escalation are rejected', async () => {
  const invalid = await fixture('definitions/invalid-capability-escalation.json');
  rejects(() => validateWorkflowDefinitionCore(invalid), /capability|ceiling/i);
  rejects(() => validateWorkflowCapabilities('custom', 'full'), /custom/i);
  assert.equal(validateWorkflowCapabilities('read', 'workspace-write'), 'read');
});

test('CONTRACT-LIMITS — static relationships and prospective graph sizes are enforced', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  const invalid = copy(core);
  invalid.limits.maxLogicalNodes = 1;
  rejects(() => validateWorkflowDefinitionCore(invalid), /maxLogicalNodes|limit/i);
  rejects(() => validateWorkflowLimits({ ...core.limits, maxFanoutPerNode: 101 }), /maxFanoutPerNode/i);
  assert.equal(validateWorkflowLimits(core.limits), core.limits);
});

test('CONTRACT-MAPPING — data mappings require compatible declared ports', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  const missing = copy(core);
  missing.edges[0].mapping[0].from = 'not_declared';
  rejects(() => validateWorkflowDefinitionCore(missing), /mapping|output/i);

  const incompatible = copy(core);
  incompatible.nodes[1].inputs[0].type = 'artifact';
  rejects(() => validateWorkflowDefinitionCore(incompatible), /compatible|mapping|type/i);

  const widening = copy(core);
  widening.nodes[0].outputs[0].type = 'integer';
  widening.nodes[1].inputs[0].type = 'number';
  assert.equal(validateWorkflowDefinitionCore(widening), widening);
});

test('CONTRACT-CONDITION — condition sources and operators are a closed typed vocabulary', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  const conditional = copy(core);
  conditional.edges[0].condition = {
    source: { scope: 'node-output', nodeId: 'implement', name: 'commit' },
    op: 'exists',
    value: null,
  };
  assert.equal(validateWorkflowDefinitionCore(conditional), conditional);

  const expression = copy(conditional);
  expression.edges[0].condition.op = 'eval';
  rejects(() => validateWorkflowDefinitionCore(expression), /condition|operator/i);

  const undeclared = copy(conditional);
  undeclared.edges[0].condition.source.name = 'missing';
  rejects(() => validateWorkflowDefinitionCore(undeclared), /condition|output/i);
});

test('CONTRACT-WRITE-POLICY — write authority requires isolated workspace ownership', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  const invalid = copy(core);
  invalid.nodes[0].workspacePolicy.mode = 'shared-read';
  rejects(() => validateWorkflowDefinitionCore(invalid), /workspace|write/i);
});

test('CONTRACT-METADATA-PATH — metadata control keys and unsafe pathspecs fail closed', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  const controlMetadata = copy(core);
  controlMetadata.nodes[0].metadata['talos.control.run'] = true;
  rejects(() => validateWorkflowDefinitionCore(controlMetadata), /metadata|talos\.control/i);

  for (const path of ['../outside', '/absolute', 'C:/absolute', ':(top)src/**']) {
    const unsafe = copy(core);
    unsafe.nodes[0].writeSetHint = [path];
    rejects(() => validateWorkflowDefinitionCore(unsafe), /writeSetHint|path/i);
  }

  const tooDeep = copy(core);
  tooDeep.nodes[0].metadata = { a: { b: { c: { d: { e: true } } } } };
  rejects(() => validateWorkflowDefinitionCore(tooDeep), /metadata.*depth|depth.*metadata/i);
});

test('CONTRACT-RECORD-HASH — record metadata cannot replace or alter the Core hash', async () => {
  const record = await fixture('records/definition-record-v1.json');
  assert.equal(validateWorkflowDefinitionRecord(record), record);
  const tampered = copy(record);
  tampered.core.title += ' alterato';
  rejects(() => validateWorkflowDefinitionRecord(tampered), /hash/i);
});

test('CONTRACT-GRAPH-PATCH — mutation surface is closed and policy-tightening only', async () => {
  const core = await fixture('definitions/core-v1-minimal.json');
  const valid = {
    patchId: '00000000-0000-4000-8000-000000000099',
    expectedGraphVersion: 2,
    operations: [{
      op: 'update-node-policy',
      nodeId: 'implement',
      patch: { priority: 10, capabilityProfile: 'read' },
    }],
  };
  assert.equal(validateWorkflowGraphPatch(valid, { core }), valid);

  const immutable = copy(valid);
  immutable.operations[0].patch.instructions = 'replace history';
  rejects(() => validateWorkflowGraphPatch(immutable, { core }), /immutable|unknown|field/i);

  const escalation = copy(valid);
  escalation.operations[0].nodeId = 'test';
  escalation.operations[0].patch.capabilityProfile = 'workspace-write';
  rejects(() => validateWorkflowGraphPatch(escalation, { core }), /capability|increase/i);

  const oversized = copy(valid);
  oversized.operations = Array.from({ length: core.policy.graphMutation.maxOperationsPerPatch + 1 },
    (_, index) => ({ op: 'cancel-subgraph', rootNodeId: index % 2 ? 'test' : 'implement' }));
  rejects(() => validateWorkflowGraphPatch(oversized, { core }), /operations|limit/i);
});
