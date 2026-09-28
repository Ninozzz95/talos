const SATISFIED_NODE_STATES = new Set(['succeeded', 'skipped']);
const NON_BLOCKING_EDGE_TYPES = new Set(['retry', 'fallback']);

function dependencyEdges(definition) {
  return definition.edges.filter((edge) => !NON_BLOCKING_EDGE_TYPES.has(edge.type));
}

function sortedReady(definition, nodeRuns) {
  const priority = new Map(definition.nodes.map((node) => [node.id, node.priority]));
  return [...nodeRuns.values()]
    .filter((nodeRun) => nodeRun.state === 'ready')
    .map((nodeRun) => nodeRun.nodeId)
    .sort((left, right) => (priority.get(right) - priority.get(left)) || left.localeCompare(right, 'en'));
}

function buildCriticalPathRanks(definition, outgoingByNode) {
  const rank = new Map();
  const visiting = new Set();
  const visit = (nodeId) => {
    if (rank.has(nodeId)) return rank.get(nodeId);
    if (visiting.has(nodeId)) return 0;
    visiting.add(nodeId);
    let value = 0;
    for (const edge of outgoingByNode.get(nodeId) ?? []) {
      if (NON_BLOCKING_EDGE_TYPES.has(edge.type)) continue;
      value = Math.max(value, 1 + visit(edge.to));
    }
    visiting.delete(nodeId);
    rank.set(nodeId, value);
    return value;
  };
  for (const node of definition.nodes) visit(node.id);
  return rank;
}

export function buildWorkflowIndexes(definition, state = {}) {
  const nodeRuns = state.nodes instanceof Map ? state.nodes : new Map();
  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));
  const incomingByNode = new Map(definition.nodes.map((node) => [node.id, []]));
  const outgoingByNode = new Map(definition.nodes.map((node) => [node.id, []]));
  for (const edge of definition.edges) {
    incomingByNode.get(edge.to)?.push(edge);
    outgoingByNode.get(edge.from)?.push(edge);
  }
  const remainingDeps = new Map();
  for (const node of definition.nodes) {
    const remaining = (incomingByNode.get(node.id) ?? [])
      .filter((edge) => !NON_BLOCKING_EDGE_TYPES.has(edge.type))
      .filter((edge) => !SATISFIED_NODE_STATES.has(nodeRuns.get(edge.from)?.state))
      .length;
    remainingDeps.set(node.id, remaining);
  }
  const nodesByState = new Map();
  for (const nodeRun of nodeRuns.values()) {
    if (!nodesByState.has(nodeRun.state)) nodesByState.set(nodeRun.state, new Set());
    nodesByState.get(nodeRun.state).add(nodeRun.nodeId);
  }
  const activeLeaseByNode = new Map();
  for (const nodeRun of nodeRuns.values()) if (nodeRun.activeLeaseId !== null) activeLeaseByNode.set(nodeRun.nodeId, {
    leaseId: nodeRun.activeLeaseId,
    leaseEpoch: nodeRun.leaseEpoch,
    activityExecutionId: nodeRun.activeActivityExecutionId,
  });
  const resultRefsByNode = new Map(definition.nodes.map((node) => [node.id, []]));
  if (state.resultRefs instanceof Map) for (const result of state.resultRefs.values()) resultRefsByNode.get(result.nodeId)?.push(result.id);
  for (const values of resultRefsByNode.values()) values.sort();
  return {
    nodeById,
    incomingByNode,
    outgoingByNode,
    remainingDeps,
    readyQueue: sortedReady(definition, nodeRuns),
    activeLeaseByNode,
    resultRefsByNode,
    nodesByState,
    criticalPathRank: buildCriticalPathRanks(definition, outgoingByNode),
  };
}

export function applyIndexDelta(indexes, previousState, nextState, event) {
  if (event.type === 'graph_patch_applied') return buildWorkflowIndexes(nextState.definition, nextState);
  const next = {
    ...indexes,
    remainingDeps: new Map(indexes.remainingDeps),
    readyQueue: [...indexes.readyQueue],
    activeLeaseByNode: new Map(indexes.activeLeaseByNode),
    resultRefsByNode: new Map([...indexes.resultRefsByNode].map(([key, values]) => [key, [...values]])),
    nodesByState: new Map([...indexes.nodesByState].map(([key, values]) => [key, new Set(values)])),
  };
  const before = event.nodeId !== null ? previousState.nodes.get(event.nodeId) : undefined;
  applicaDeltaIndici(next, before ? { esiste: true, stato: before.state } : { esiste: false, stato: undefined }, nextState, event);
  return next;
}

/*
 * ⭐ Owner 26/09/2026 («debiti del Workflow prima della release»): la stessa delta, SUL POSTO. La usa solo il rigioco di un
 *   giornale già verificato (`run.mjs`, `workflowReplay`), che possiede il suo stato: copiare gli indici a ogni fatto
 *   rendeva il rigioco quadratico (1.000 passi = 52 s, misurato). `prima` è lo stato del nodo del fatto PRIMA di applicarlo.
 */
export function applyIndexDeltaInPlace(indexes, prima, nextState, event) {
  if (event.type === 'graph_patch_applied') return buildWorkflowIndexes(nextState.definition, nextState);
  applicaDeltaIndici(indexes, prima, nextState, event);
  return indexes;
}

function applicaDeltaIndici(next, prima, nextState, event) {
  const nodeId = event.nodeId;
  if (nodeId !== null) {
    const after = nextState.nodes.get(nodeId);
    const before = prima.esiste ? { state: prima.stato } : undefined;
    if (before && after && before.state !== after.state) {
      next.nodesByState.get(before.state)?.delete(nodeId);
      if (!next.nodesByState.has(after.state)) next.nodesByState.set(after.state, new Set());
      next.nodesByState.get(after.state).add(nodeId);
      if (!SATISFIED_NODE_STATES.has(before.state) && SATISFIED_NODE_STATES.has(after.state)) {
        for (const edge of next.outgoingByNode.get(nodeId) ?? []) {
          if (NON_BLOCKING_EDGE_TYPES.has(edge.type)) continue;
          next.remainingDeps.set(edge.to, Math.max(0, (next.remainingDeps.get(edge.to) ?? 0) - 1));
        }
      }
    }
    if (after?.activeLeaseId !== null && after?.activeLeaseId !== undefined) next.activeLeaseByNode.set(nodeId, {
      leaseId: after.activeLeaseId,
      leaseEpoch: after.leaseEpoch,
      activityExecutionId: after.activeActivityExecutionId,
    });
    else next.activeLeaseByNode.delete(nodeId);
  }
  if (event.type === 'result_recorded') {
    const ref = event.payload.resultRef;
    if (!next.resultRefsByNode.has(ref.nodeId)) next.resultRefsByNode.set(ref.nodeId, []);
    const values = next.resultRefsByNode.get(ref.nodeId);
    if (!values.includes(ref.id)) values.push(ref.id);
    values.sort();
  }
  next.readyQueue = sortedReady(nextState.definition, nextState.nodes);
  return next;
}

export const workflowDependencyEdges = dependencyEdges;
