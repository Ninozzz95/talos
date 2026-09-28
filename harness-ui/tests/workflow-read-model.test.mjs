import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  projectWorkflowOverview,
  projectWorkflowGroupPage,
  projectWorkflowNodeDetail,
  projectWorkflowEdgePage,
} from '../src/workflow/read-model.mjs';

function fixture(count = 14) {
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: `node-${String(index).padStart(5, '0')}`,
    kind: index % 2 ? 'verify' : 'agent',
    label: `Node ${index}`,
    role: index % 2 ? null : 'researcher',
    priority: index,
    instructions: 'SEGRETO: non esporre',
    workspacePolicy: { path: 'C:/private' },
  }));
  return {
    state: {
      run: { runId: '12345678-1234-4123-8123-123456789abc', status: 'running', graphVersion: 2 },
      definition: { nodes, edges: nodes.slice(1).map((node, index) => ({ id: `edge-${index}`, from: nodes[index].id, to: node.id, type: 'control' })) },
      nodes: new Map(nodes.map((node, index) => [node.id, { nodeId: node.id, state: index < 4 ? 'succeeded' : 'ready', resultRefIds: ['ref-secret'] }])),
      lastSeq: 19,
    },
    events: [],
  };
}

test('WF-HTTP-SECRET-OMISSION: overview, pagina e dettaglio non espongono Definition privata', () => {
  const input = fixture();
  const overview = projectWorkflowOverview(input);
  const page = projectWorkflowGroupPage(input, { phaseId: 'legacy-unassigned', offset: 0, limit: 3 });
  const detail = projectWorkflowNodeDetail(input, { nodeId: 'node-00000' });
  assert.equal(overview.schema, 'talos.workflow-graph-view.v2');
  assert.equal(overview.total, 14);
  assert.equal(page.items.length, 3);
  assert.equal(detail.nodeId, 'node-00000');
  for (const value of [overview, page, detail]) {
    assert.doesNotMatch(JSON.stringify(value), /SEGRETO|C:\/private|instructions|workspacePolicy/);
  }
});

test('WF-HTTP-BOUND-5000: la risposta resta limitata e aggrega 5000 nodi logici', () => {
  const input = fixture(5_000);
  const overview = projectWorkflowOverview(input);
  const page = projectWorkflowGroupPage(input, { phaseId: 'legacy-unassigned', offset: 0, limit: 50 });
  assert.equal(overview.total, 5_000);
  assert.equal(overview.groups.reduce((sum, group) => sum + group.total, 0), 5_000);
  assert.equal(page.items.length, 50);
  assert.equal(page.total, 5_000);
  assert.throws(() => projectWorkflowGroupPage(input, { phaseId: 'legacy-unassigned', offset: 0, limit: 51 }), /limit/i);
});

test('WF-GRAPH-5000-WIDE-ORDER-PERF: 5000 agenti indipendenti restano ordinati senza latenza quadratica', () => {
  const input = fixture(5_000);
  input.state.definition.edges = [];
  input.state.definition.nodes.reverse();
  const samples = [];
  for (let index = 0; index < 3; index++) {
    const started = performance.now();
    const overview = projectWorkflowOverview(input);
    samples.push(performance.now() - started);
    assert.equal(overview.total, 5_000);
  }
  const medianMs = samples.sort((a, b) => a - b)[1];
  assert.ok(medianMs < 150, `5.000 nodi indipendenti: mediana ${medianMs.toFixed(1)} ms, budget 150 ms`);
  const page = projectWorkflowGroupPage(input, { phaseId: 'legacy-unassigned', limit: 50 });
  assert.deepEqual(page.items.map((item) => item.nodeId),
    Array.from({ length: 50 }, (_, index) => `node-${String(index).padStart(5, '0')}`));
});

test('WF-GRAPH-ORDER-SCC-HEAP-PARITY: una componente pronta tardi precede i pari successivi', () => {
  const input = fixture(5);
  input.state.definition.nodes.reverse();
  input.state.definition.edges = [
    { id: 'dependent', from: 'node-00001', to: 'node-00000', type: 'control' },
    { id: 'loop-out', from: 'node-00003', to: 'node-00004', type: 'control' },
    { id: 'loop-back', from: 'node-00004', to: 'node-00003', type: 'retry' },
  ];
  const page = projectWorkflowGroupPage(input, { phaseId: 'legacy-unassigned', limit: 5 });
  assert.deepEqual(page.items.map((item) => item.nodeId), [
    'node-00001', 'node-00000', 'node-00002', 'node-00003', 'node-00004',
  ]);
});

test('WF-GRAPH-REAL-EDGES — v2 phase grouping and links derive only from verified Definition facts', () => {
  const input = fixture(3);
  input.state.definition.schema = 'talos.workflow-definition-core.v2';
  input.state.definition.phases = [{ id: 'research', label: 'Ricerca' }, { id: 'verification', label: 'Verifica' }];
  input.state.definition.nodes.forEach((node, index) => { node.phaseId = index === 2 ? 'verification' : 'research'; });
  input.state.nodes.get('node-00001').state = 'failed';
  input.state.definition.edges.push({ id: 'parallel', from: 'node-00001', to: 'node-00002', type: 'review', condition: { secret: true }, mapping: null });
  const overview = projectWorkflowOverview(input);
  assert.equal(overview.schema, 'talos.workflow-graph-view.v2');
  assert.equal(overview.phaseSource, 'explicit');
  assert.deepEqual(overview.groups.map((group) => [group.phaseId, group.total]), [['research', 2], ['verification', 1]]);
  assert.deepEqual(overview.groupConnections, [{ fromPhaseId: 'research', toPhaseId: 'verification', total: 2, types: { control: 1, review: 1 } }]);
  assert.equal(overview.terminated, 3);
  assert.equal(overview.attention, 1);
  assert.equal(Object.hasOwn(overview, 'completed'), false);
  const page = projectWorkflowGroupPage(input, { phaseId: 'research', offset: 0, limit: 2 });
  assert.deepEqual(page.items.map((row) => row.nodeId), ['node-00000', 'node-00001']);
  assert.deepEqual(page.items.map((row) => row.phaseId), ['research', 'research']);
});

test('WF-GRAPH-EDGE-PAGE-PRIVACY — bounded sorted edge facts omit conditions and mappings', () => {
  const input = fixture(105);
  input.state.definition.edges[0].condition = { secret: 'HIDDEN' };
  input.state.definition.edges[0].mapping = [{ secret: 'HIDDEN' }];
  const page = projectWorkflowEdgePage(input, { offset: 0, limit: 100 });
  assert.equal(page.schema, 'talos.workflow-graph-view.v2');
  assert.equal(page.items.length, 100);
  assert.equal(page.nextOffset, 100);
  assert.equal(page.total, 104);
  assert.deepEqual(page.items[0], { edgeId: 'edge-0', fromNodeId: 'node-00000', toNodeId: 'node-00001', type: 'control' });
  assert.doesNotMatch(JSON.stringify(page), /HIDDEN|condition|mapping|instructions|workspacePolicy/);
  assert.throws(() => projectWorkflowEdgePage(input, { offset: 0, limit: 101 }), /limit/i);
});

test('WF-PHASE-LEGACY-UNASSIGNED — v1 never invents work phases from node kinds', () => {
  const overview = projectWorkflowOverview(fixture());
  assert.equal(overview.schema, 'talos.workflow-graph-view.v2');
  assert.equal(overview.phaseSource, 'legacy-unassigned');
  assert.deepEqual(overview.groups.map((group) => group.phaseId), ['legacy-unassigned']);
  assert.equal(overview.groups[0].total, 14);
});
