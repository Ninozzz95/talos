import { canonicalHash } from './canonical-json.mjs';
import {
  validateWorkflowDefinitionCore,
  validateWorkflowEvent,
  validateWorkflowGraphPatch,
} from './contract.mjs';
import { applyIndexDelta, applyIndexDeltaInPlace, buildWorkflowIndexes } from './indexes.mjs';

const TERMINAL_RUN_STATES = new Set(['succeeded', 'failed', 'cancelled']);
const TERMINAL_NODE_STATES = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded']);
const SATISFIED_NODE_STATES = new Set(['succeeded', 'skipped']);
const RUN_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SPENT_ZERO = Object.freeze({
  promptTokens: 0,
  completionTokens: 0,
  wallMs: 0,
  agentSeconds: 0,
  toolCalls: 0,
  modelRequests: 0,
  knownCostUsd: 0,
});

/**
 * F3-51b (25/09/2026), owner «il tetto si alza di quanto serve, detto prima»: quanto il tetto del run cresce se si rifanno questi
 * passi falliti — per ciascuno, il suo budget per tentativo × i tentativi che gli spettano da capo. Una dimensione senza tetto
 * nel passo (`null`) non aggiunge niente. È la sola fonte del numero: il riduttore lo applica col fatto, il pulsante lo dice prima.
 * @param {{ nodes: Array<object> }} definition
 * @param {string[]} nodeIds
 */
export function aumentoDelTettoPerRiprova(definition, nodeIds) {
  const aumento = { ...SPENT_ZERO };
  for (const nodeId of nodeIds) {
    const node = definition.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) reducerInvalid(`unknown workflow node ${nodeId}`);
    const tetti = [node.activityPolicy?.maxAttempts, node.budget?.attempts].filter((valore) => Number.isSafeInteger(valore) && valore > 0);
    const tentativi = tetti.length ? Math.min(...tetti) : 1;
    for (const key of Object.keys(SPENT_ZERO)) {
      const perTentativo = node.budget?.[key];
      if (typeof perTentativo === 'number' && Number.isFinite(perTentativo)) aumento[key] += perTentativo * tentativi;
    }
  }
  return aumento;
}

export class WorkflowReducerError extends Error {
  constructor(message, code = 'WORKFLOW_REDUCER_INVALID') {
    super(message);
    this.name = 'WorkflowReducerError';
    this.code = code;
  }
}

const reducerInvalid = (message, code) => { throw new WorkflowReducerError(message, code); };
const clone = (value) => structuredClone(value);

function initialNodeRun(nodeId) {
  return {
    nodeId,
    state: 'pending',
    attempt: 0,
    leaseEpoch: 0,
    activeLeaseId: null,
    activeActivityExecutionId: null,
    retryFactId: null,
    timerIds: [],
    resultRefIds: [],
    humanRequestId: null,
    terminalReason: null,
  };
}

export function workflowInitialState({ definition, runId, definitionHash = canonicalHash(definition), engineSchemaVersion = 1 }) {
  validateWorkflowDefinitionCore(definition);
  if (!RUN_UUID.test(runId)) reducerInvalid('workflow runId must be a v4 UUID', 'WORKFLOW_RUN_ID_INVALID');
  if (engineSchemaVersion !== 1) reducerInvalid('workflow engineSchemaVersion is unsupported', 'WORKFLOW_ENGINE_VERSION_UNSUPPORTED');
  if (definition.engineCompatibility.minEngineSchemaVersion > engineSchemaVersion) {
    reducerInvalid('workflow Definition is incompatible with this engine version', 'WORKFLOW_ENGINE_INCOMPATIBLE');
  }
  const computedDefinitionHash = canonicalHash(definition);
  if (definitionHash !== computedDefinitionHash) {
    reducerInvalid('workflow definition hash does not match its Core', 'WORKFLOW_DEFINITION_HASH_MISMATCH');
  }
  const state = {
    definition: clone(definition),
    definitionHash,
    run: {
      runId,
      definitionHash,
      engineSchemaVersion,
      status: null,
      graphVersion: 0,
      pauseRequested: false,
      cancelRequested: false,
      cancellationState: null,
      schedulingEnabled: false,
      needsAttentionReasons: [],
    },
    nodes: new Map(definition.nodes.map((node) => [node.id, initialNodeRun(node.id)])),
    activities: new Map(),
    leases: new Map(),
    capacityClaims: new Map(),
    budget: { spent: { ...SPENT_ZERO }, reservations: new Map() },
    humanGates: new Map(),
    timers: new Map(),
    providerControl: new Map(),
    resultRefs: new Map(),
    commands: new Map(),
    audit: { staleActivityCompletions: [], checkpoints: [], recoveredNodes: [] },
    lastSeq: 0,
    eventIds: new Set(),
    lastEventId: null,
    indexes: null,
  };
  state.indexes = buildWorkflowIndexes(state.definition, state);
  return state;
}

function updateNodeState(state, nodeId, nextState, terminalReason = null) {
  const node = state.nodes.get(nodeId);
  if (!node) reducerInvalid(`unknown workflow node ${nodeId}`);
  node.state = nextState;
  if (TERMINAL_NODE_STATES.has(nextState)) {
    node.terminalReason = terminalReason;
    node.activeLeaseId = null;
    node.activeActivityExecutionId = null;
  }
  return node;
}

function refreshReadyNodes(state) {
  if (state.run.status !== 'running' || !state.run.schedulingEnabled) return;
  for (const [nodeId, node] of state.nodes) {
    if (!['pending', 'blocked'].includes(node.state)) continue;
    node.state = (state.indexes.remainingDeps.get(nodeId) ?? 0) === 0 ? 'ready' : 'blocked';
  }
}

/*
 * ⭐ F3-41b (25/09/2026), decisione owner «come Hermes»: un passo fallito NON ferma il run — i rami indipendenti vanno
 *   avanti, i passi che dipendono da lui restano `blocked`. Quando non si può più muovere niente (nessun passo pronto, in
 *   volo, in attesa di un ritentativo o di una persona, nessuno slot occupato) e almeno un passo è `failed`, il run è in
 *   «Serve attenzione»: DERIVATO da condizioni durevoli (catalogo §18.1), e quindi ricalcolato anche dopo un `run_resumed`
 *   finché il passo fallito non viene ripreso (Riprova, F3-51). Hermes: `failure_limit` → `blocked`, i figli restano in attesa
 *   (`hermes_cli/kanban_db.py:2128-2146`).
 */
const STATI_CHE_SI_MUOVONO = new Set(['pending', 'ready', 'leased', 'running', 'retry_wait', 'uncertain', 'reconciling', 'waiting_human']);
function deriveAttentionFromFailedNodes(state) {
  if (state.run.status !== 'running' || !state.run.schedulingEnabled) return;
  let fallito = false;
  for (const node of state.nodes.values()) {
    if (STATI_CHE_SI_MUOVONO.has(node.state)) return;
    if (node.state === 'failed') fallito = true;
  }
  if (!fallito || [...(state.capacityClaims?.values() ?? [])].some((claim) => claim.state === 'active')) return;
  addAttention(state, 'node_failed');
}

function reconcileNodeStateIndexes(state) {
  const nodesByState = new Map();
  const readyQueue = [];
  for (const node of state.nodes.values()) {
    if (!nodesByState.has(node.state)) nodesByState.set(node.state, new Set());
    nodesByState.get(node.state).add(node.nodeId);
    if (node.state === 'ready') readyQueue.push(node.nodeId);
  }
  readyQueue.sort((left, right) => {
    const definitions = state.indexes.nodeById;
    return (definitions.get(right).priority - definitions.get(left).priority) || left.localeCompare(right, 'en');
  });
  state.indexes.nodesByState = nodesByState;
  state.indexes.readyQueue = readyQueue;
}

function addAttention(state, reason) {
  if (!state.run.needsAttentionReasons.includes(reason)) state.run.needsAttentionReasons.push(reason);
  state.run.needsAttentionReasons.sort();
  state.run.status = 'needs_attention';
  state.run.schedulingEnabled = false;
}

function assertTransition(condition, message) {
  if (!condition) reducerInvalid(message, 'WORKFLOW_TRANSITION_INVALID');
}

function activityForEvent(state, event, { allowStale = false } = {}) {
  const activity = state.activities.get(event.activityExecutionId);
  if (!activity) reducerInvalid(`unknown activity ${event.activityExecutionId}`);
  const current = state.nodes.get(event.nodeId);
  const matches = current?.activeActivityExecutionId === event.activityExecutionId
    && current.activeLeaseId === event.leaseId
    && current.leaseEpoch === event.leaseEpoch;
  if (!allowStale && !matches) reducerInvalid('activity completion has a stale lease or epoch', 'WORKFLOW_STALE_LEASE');
  return { activity, current, matches };
}

function applyGraphPatch(state, event) {
  const patch = {
    patchId: event.payload.patchId,
    expectedGraphVersion: event.payload.expectedGraphVersion,
    operations: event.payload.operations,
  };
  validateWorkflowGraphPatch(patch, { core: state.definition });
  if (patch.expectedGraphVersion !== state.run.graphVersion) reducerInvalid('graph patch expectedGraphVersion is stale', 'WORKFLOW_GRAPH_VERSION_CONFLICT');
  const definition = clone(state.definition);
  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));
  for (const operation of patch.operations) {
    if (operation.op === 'add-node') {
      const node = clone(operation.node);
      definition.nodes.push(node);
      nodeById.set(node.id, node);
      state.nodes.set(node.id, initialNodeRun(node.id));
    } else if (operation.op === 'add-edge') definition.edges.push(clone(operation.edge));
    else if (operation.op === 'update-node-policy') {
      const node = nodeById.get(operation.nodeId);
      for (const [key, value] of Object.entries(operation.patch)) {
        if (key === 'activityPolicy') node.activityPolicy = { ...node.activityPolicy, ...clone(value) };
        else node[key] = clone(value);
      }
    } else if (operation.op === 'cancel-subgraph') {
      const outgoing = new Map(definition.nodes.map((node) => [node.id, []]));
      for (const edge of definition.edges) outgoing.get(edge.from)?.push(edge.to);
      const pending = [operation.rootNodeId];
      const seen = new Set();
      while (pending.length) {
        const nodeId = pending.pop();
        if (seen.has(nodeId)) continue;
        seen.add(nodeId);
        const nodeRun = state.nodes.get(nodeId);
        if (nodeRun && !TERMINAL_NODE_STATES.has(nodeRun.state)) updateNodeState(state, nodeId, 'cancelled', 'graph_patch');
        for (const child of outgoing.get(nodeId) ?? []) pending.push(child);
      }
    }
  }
  validateWorkflowDefinitionCore(definition);
  state.definition = definition;
  state.run.graphVersion = event.payload.newGraphVersion;
}

function commandReceipt(state, event) {
  if (event.commandId === null) return;
  const prior = state.commands.get(event.commandId);
  const receipt = {
    schema: 'talos.workflow-command-receipt.v1',
    commandId: event.commandId,
    commandType: event.commandType,
    payloadHash: event.commandPayloadHash,
    acceptedAt: event.at,
    source: 'journal-event',
    resultingSeq: event.seq,
    resultingGraphVersion: event.graphVersion,
    outcome: 'accepted',
    errorCode: null,
  };
  if (prior && (prior.commandType !== receipt.commandType || prior.payloadHash !== receipt.payloadHash)) reducerInvalid('commandId was already accepted with a different command or payload', 'WORKFLOW_COMMAND_CONFLICT');
  if (!prior) state.commands.set(event.commandId, receipt);
}

function applyEvent(next, event) {
  if (event.type === 'run_created') {
    assertTransition(next.run.status === null, 'run_created requires an empty run');
    assertTransition(event.payload.definitionHash === next.definitionHash, 'run_created definition hash mismatch');
    next.run.status = 'created';
    next.run.graphVersion = 1;
  } else if (event.type === 'run_started') {
    assertTransition(next.run.status === 'created', 'run_started requires created');
    next.run.status = 'running';
    next.run.schedulingEnabled = true;
  } else if (event.type === 'run_pause_requested') {
    assertTransition(next.run.status === 'running', 'run_pause_requested requires running');
    next.run.pauseRequested = true;
    next.run.schedulingEnabled = false;
  } else if (event.type === 'run_paused') {
    assertTransition(next.run.status === 'running' && next.run.pauseRequested, 'run_paused requires a durable pause request');
    const undrained = [...next.activities.values()].some((activity) => ['scheduled', 'started', 'uncertain'].includes(activity.state));
    assertTransition(!undrained, 'run_paused requires drained owned effects');
    next.run.status = 'paused';
    next.run.pauseRequested = false;
  } else if (event.type === 'run_resumed') {
    assertTransition(['paused', 'needs_attention'].includes(next.run.status) && !next.run.cancelRequested, 'run_resumed requires paused or resolved attention');
    next.run.status = 'running';
    next.run.pauseRequested = false;
    next.run.needsAttentionReasons = [];
    next.run.schedulingEnabled = true;
  } else if (event.type === 'run_cancel_requested') {
    assertTransition(next.run.status !== null && !TERMINAL_RUN_STATES.has(next.run.status), 'run_cancel_requested requires a non-terminal run');
    next.run.cancelRequested = true;
    next.run.cancellationState = 'requested';
    next.run.schedulingEnabled = false;
  } else if (event.type === 'run_cancelled') {
    assertTransition(next.run.status !== null && !TERMINAL_RUN_STATES.has(next.run.status), 'run_cancelled requires a non-terminal run');
    assertTransition(![...next.capacityClaims.values()].some((claim) => claim.state === 'active'), 'run_cancelled requires all capacity claims released');
    next.run.status = 'cancelled';
    next.run.cancellationState = 'complete';
    next.run.schedulingEnabled = false;
  } else if (event.type === 'run_succeeded') {
    assertTransition(next.run.status === 'running' && [...next.nodes.values()].every((node) => SATISFIED_NODE_STATES.has(node.state)), 'run_succeeded requires all nodes satisfied');
    assertTransition(![...next.capacityClaims.values()].some((claim) => claim.state === 'active'), 'run_succeeded requires all capacity claims released');
    next.run.status = 'succeeded';
    next.run.schedulingEnabled = false;
  } else if (event.type === 'run_failed') {
    assertTransition(next.run.status !== null && !TERMINAL_RUN_STATES.has(next.run.status), 'run_failed requires a non-terminal run');
    assertTransition(![...next.capacityClaims.values()].some((claim) => claim.state === 'active'), 'run_failed requires all capacity claims released');
    next.run.status = 'failed';
    next.run.schedulingEnabled = false;
  } else if (event.type === 'graph_patch_applied') applyGraphPatch(next, event);
  else if (event.type === 'node_started') {
    const node = next.nodes.get(event.nodeId);
    assertTransition(node && ['ready', 'leased', 'retry_wait', 'waiting_human', 'reconciling'].includes(node.state), 'node_started transition is invalid');
    updateNodeState(next, event.nodeId, 'running');
  } else if (['node_succeeded', 'node_failed', 'node_cancelled', 'node_skipped'].includes(event.type)) {
    const target = event.type.slice('node_'.length);
    const node = next.nodes.get(event.nodeId);
    if (node?.state === target) return;
    assertTransition(node && !TERMINAL_NODE_STATES.has(node.state), `${event.type} requires a non-terminal node`);
    if (event.type === 'node_skipped') assertTransition(['pending', 'blocked', 'ready'].includes(node.state), 'node_skipped transition is invalid');
    const results = event.payload.resultIds ?? event.payload.evidenceResultIds ?? [];
    node.resultRefIds = [...new Set([...node.resultRefIds, ...results])].sort();
    updateNodeState(next, event.nodeId, target, event.payload.reason ?? event.payload.errorClass ?? null);
  } else if (event.type === 'node_recovered') next.audit.recoveredNodes.push({ nodeId: event.nodeId, ...clone(event.payload) });
  else if (event.type === 'capacity_claimed') {
    const claim = event.payload;
    const node = next.nodes.get(event.nodeId);
    assertTransition(next.run.status === 'running' && next.run.schedulingEnabled, 'capacity claim requires a schedulable run');
    assertTransition(node?.state === 'ready', 'capacity claim requires a ready node');
    assertTransition(!next.capacityClaims.has(claim.claimId), 'capacity claimId already exists');
    assertTransition(![...next.capacityClaims.values()].some((prior) =>
      prior.state === 'active' && prior.nodeId === event.nodeId),
    'capacity claim requires no other active claim for the node');
    assertTransition(!next.activities.has(event.activityExecutionId) && !next.leases.has(event.leaseId), 'capacity claim activity or lease identity already exists');
    assertTransition(![...next.capacityClaims.values()].some((prior) => prior.activityExecutionId === event.activityExecutionId || prior.leaseId === event.leaseId), 'capacity claim activity or lease identity already claimed');
    const reservation = next.budget.reservations.get(claim.budgetReservationId);
    assertTransition(reservation?.state === 'reserved'
      && reservation.runId === event.runId && reservation.nodeId === event.nodeId
      && reservation.activityExecutionId === event.activityExecutionId
      && reservation.leaseId === event.leaseId && reservation.leaseEpoch === event.leaseEpoch,
    'capacity claim requires a matching active budget reservation identity');
    next.capacityClaims.set(claim.claimId, {
      ...clone(claim), runId: event.runId, nodeId: event.nodeId,
      activityExecutionId: event.activityExecutionId, attempt: event.attempt,
      leaseId: event.leaseId, leaseEpoch: event.leaseEpoch,
      state: 'active', claimedAt: event.at, releasedAt: null,
    });
  } else if (event.type === 'capacity_released') {
    const claim = next.capacityClaims.get(event.payload.claimId);
    assertTransition(claim?.state === 'active', 'capacity release requires an active claim');
    assertTransition(claim.runId === event.runId && claim.nodeId === event.nodeId
      && claim.activityExecutionId === event.activityExecutionId && claim.attempt === event.attempt
      && claim.leaseId === event.leaseId && claim.leaseEpoch === event.leaseEpoch,
    'capacity release identity does not match claim');
    const activity = next.activities.get(claim.activityExecutionId);
    if (event.payload.reason === 'never_scheduled') assertTransition(!activity, 'capacity release never_scheduled requires no Activity');
    else assertTransition(activity && ['completed', 'failed', 'reconciled'].includes(activity.state)
      && (activity.state !== 'reconciled' || activity.receiptRef !== null
        // Riparazione D3, 24/09/2026: un'Activity riconciliata «proved_not_performed» ha già la
        // sua prova durevole nell'evento stesso (catalogo eventi, activity_reconciled: «activity
        // becomes reconciled; retry policy may schedule a new attempt»; budget.mjs releaseBudget
        // 'reconciled_not_performed' la accetta come unica prova). Senza questa riga lo slot
        // globale restava occupato per sempre quando l'adapter non ha una ricevuta da dare.
        || activity.reconcileOutcome === 'proved_not_performed'),
    'capacity release requires a terminal Activity or proved reconciliation');
    claim.state = 'released';
    claim.releasedAt = event.at;
  }
  else if (event.type === 'activity_scheduled') {
    const node = next.nodes.get(event.nodeId);
    assertTransition(node && ['ready', 'running', 'retry_wait', 'reconciling'].includes(node.state), 'activity_scheduled node is not eligible');
    assertTransition(!next.activities.has(event.activityExecutionId), 'activityExecutionId already exists');
    if (event.payload.budgetReservationId !== null) assertTransition(next.budget.reservations.has(event.payload.budgetReservationId), 'activity_scheduled requires durable budget reservation');
    if (event.eventSchemaVersion === 1) {
      assertTransition(![...next.capacityClaims.values()].some((claim) => claim.activityExecutionId === event.activityExecutionId),
        'v1 activity_scheduled cannot bypass a capacity claim');
    }
    if (event.eventSchemaVersion === 2) {
      // F3-41b, fence 1 di WFS §8: nessun attacco nuovo dopo una pausa o un annullamento chiesti, anche se il controllo del
      // chiamante è passato prima — l'ultima parola è del fatto, sotto la coda del giornale.
      assertTransition(next.run.status === 'running' && next.run.schedulingEnabled && !next.run.pauseRequested && !next.run.cancelRequested,
        'v2 activity_scheduled requires a schedulable run');
      const claim = [...next.capacityClaims.values()].find((candidate) => candidate.activityExecutionId === event.activityExecutionId);
      assertTransition(claim?.state === 'active', 'v2 activity_scheduled requires an active capacity claim');
      assertTransition(claim.runId === event.runId && claim.nodeId === event.nodeId
        && claim.attempt === event.attempt && claim.leaseId === event.leaseId
        && claim.leaseEpoch === event.leaseEpoch
        && claim.budgetReservationId === event.payload.budgetReservationId,
      'v2 activity_scheduled capacity claim identity mismatch');
      const reservation = next.budget.reservations.get(claim.budgetReservationId);
      assertTransition(reservation?.state === 'reserved' && reservation.runId === event.runId
        && reservation.nodeId === event.nodeId && reservation.activityExecutionId === event.activityExecutionId
        && reservation.leaseId === event.leaseId && reservation.leaseEpoch === event.leaseEpoch,
      'v2 activity_scheduled budget reservation identity mismatch');
    }
    next.activities.set(event.activityExecutionId, {
      activityExecutionId: event.activityExecutionId, nodeId: event.nodeId, attempt: event.attempt,
      leaseId: event.leaseId, leaseEpoch: event.leaseEpoch, state: 'scheduled',
      activityKind: event.payload.activityKind, effectClass: event.payload.effectClass,
      retryMode: event.payload.retryMode, resultIds: [], receiptRef: null,
    });
    next.leases.set(event.leaseId, { leaseId: event.leaseId, nodeId: event.nodeId, activityExecutionId: event.activityExecutionId, leaseEpoch: event.leaseEpoch, state: 'active' });
    node.state = 'leased'; node.attempt = event.attempt; node.leaseEpoch = event.leaseEpoch;
    node.activeLeaseId = event.leaseId; node.activeActivityExecutionId = event.activityExecutionId;
  } else if (event.type === 'activity_started') {
    const { activity, current } = activityForEvent(next, event);
    assertTransition(activity.state === 'scheduled', 'activity_started requires scheduled');
    activity.state = 'started'; current.state = 'running';
  } else if (event.type === 'activity_uncertain') {
    const { activity, current } = activityForEvent(next, event);
    assertTransition(activity.state === 'started', 'activity_uncertain requires started');
    activity.state = 'uncertain'; current.state = 'uncertain';
    if (activity.retryMode === 'manual-on-uncertain') addAttention(next, `activity_uncertain:${event.activityExecutionId}`);
  } else if (event.type === 'activity_reconciled') {
    const { activity, current } = activityForEvent(next, event);
    assertTransition(activity.state === 'uncertain', 'activity_reconciled requires uncertain');
    if (event.payload.outcome === 'still_unknown') addAttention(next, `activity_uncertain:${event.activityExecutionId}`);
    else { activity.state = 'reconciled'; current.state = 'reconciling'; activity.resultIds = clone(event.payload.resultIds); activity.receiptRef = event.payload.receiptRef; activity.reconcileOutcome = event.payload.outcome; }
    if (event.eventSchemaVersion === 2) activity.actualUsage = clone(event.payload.actualUsage);
  } else if (['activity_completed', 'activity_failed'].includes(event.type)) {
    const { activity } = activityForEvent(next, event);
    if (activity.state === (event.type === 'activity_completed' ? 'completed' : 'failed')) return;
    assertTransition(activity.state === 'started', `${event.type} requires started`);
    activity.state = event.type === 'activity_completed' ? 'completed' : 'failed';
    activity.resultIds = clone(event.payload.resultIds ?? event.payload.evidenceResultIds);
    activity.receiptRef = event.payload.receiptRef ?? null;
    if (event.eventSchemaVersion === 2) activity.actualUsage = clone(event.payload.actualUsage);
    // F3-41a: solo quando è VERO, così le proiezioni (e le impronte d'oro) dei fallimenti di sempre non cambiano.
    if (event.type === 'activity_failed' && event.payload.retryable === true) activity.retryable = true;
    next.leases.get(event.leaseId).state = 'released';
  } else if (event.type === 'stale_activity_completion_observed') next.audit.staleActivityCompletions.push(clone(event));
  else if (event.type === 'budget_reserved') {
    assertTransition(!next.budget.reservations.has(event.payload.reservationId), 'duplicate budget reservation identity');
    next.budget.reservations.set(event.payload.reservationId, clone(event.payload));
  }
  else if (event.type === 'budget_settled') {
    const reservation = next.budget.reservations.get(event.payload.reservationId);
    assertTransition(Boolean(reservation), 'budget_settled references an unknown reservation');
    assertTransition(![...next.capacityClaims.values()].some((claim) => claim.state === 'active' && claim.budgetReservationId === event.payload.reservationId),
      'budget_settled cannot close an active capacity claim');
    const claims = [...next.capacityClaims.values()].filter((claim) =>
      claim.budgetReservationId === event.payload.reservationId);
    if (claims.length) {
      const claim = claims[0];
      const activity = next.activities.get(reservation.activityExecutionId);
      assertTransition(claims.length === 1 && claim.state === 'released'
        && claim.runId === reservation.runId && claim.nodeId === reservation.nodeId
        && claim.activityExecutionId === reservation.activityExecutionId
        && claim.leaseId === reservation.leaseId && claim.leaseEpoch === reservation.leaseEpoch
        && event.runId === reservation.runId && event.nodeId === reservation.nodeId
        && activity && ['completed', 'failed', 'reconciled'].includes(activity.state)
        && activity.attempt === claim.attempt && activity.leaseId === claim.leaseId
        && activity.leaseEpoch === claim.leaseEpoch
        && (activity.effectClass === 'pure' || activity.receiptRef !== null)
        && activity.actualUsage !== null && activity.actualUsage !== undefined
        && Object.keys(SPENT_ZERO).every((key) =>
          activity.actualUsage[key] === event.payload.actual[key]),
      'budget_settled must match durable Activity usage and receipt');
    }
    next.budget.reservations.delete(event.payload.reservationId);
    for (const [key, amount] of Object.entries(event.payload.actual)) if (amount !== null) next.budget.spent[key] += amount;
    if (event.payload.overrunDimensions.length) addAttention(next, 'budget_overrun');
  } else if (event.type === 'budget_released') {
    assertTransition(next.budget.reservations.has(event.payload.reservationId), 'budget_released references an unknown reservation');
    assertTransition(![...next.capacityClaims.values()].some((claim) => claim.state === 'active' && claim.budgetReservationId === event.payload.reservationId),
      'budget_released cannot close an active capacity claim');
    next.budget.reservations.delete(event.payload.reservationId);
  } else if (event.type === 'budget_overrun_observed') addAttention(next, 'budget_overrun');
  else if (event.type === 'retry_scheduled') {
    /*
     * ⭐ F3-41a (25/09/2026) — un ritentativo si decide DOPO il tentativo che ha fallito e dopo il suo saldo (catalogo §19:
     *   «activity_completed|failed|uncertain → budget_settled|released → node terminal/retry fact»): il tentativo è quello
     *   corrente del nodo, è finito in un fallimento ritentabile e provato (o riconciliato «non eseguito»), lo slot è libero e
     *   la sua riserva è chiusa. Prima non c'era nessuna guardia: nessuno lo scriveva.
     */
    const payload = event.payload;
    const node = next.nodes.get(payload.nodeId);
    const activity = next.activities.get(payload.activityExecutionId);
    /*
     * ⭐ F3-51b (25/09/2026), owner «Riprova: rifà solo i passi falliti, tentativi da capo; il tetto si alza, detto prima»: il
     *   ritentativo UMANO (`user_retry`, comando `retry-node`) è l'unico fatto che riapre un passo `failed` — terminale per
     *   tutto il resto. Pretende l'ultimo tentativo del passo finito, il run in corsa o in «Serve attenzione» e non annullato.
     *   Il passo ricorda da quale tentativo è ripartito (`attemptBase`: il tetto dei tentativi si conta da lì) e il tetto del run
     *   cresce di quanto il passo può spendere di nuovo (`aumentoDelTettoPerRiprova`, la stessa funzione che il pulsante usa per
     *   dirlo prima). Campi scritti SOLO quando c'è un Riprova: le impronte degli stati di sempre non cambiano.
     */
    const umano = payload.reasonClass === 'user_retry';
    if (umano) {
      assertTransition(node?.state === 'failed', 'a user retry reopens a failed node');
      assertTransition(!next.run.cancelRequested && ['running', 'needs_attention'].includes(next.run.status),
        'a user retry requires a running run or one that needs attention');
      assertTransition(activity && activity.nodeId === payload.nodeId && activity.attempt === payload.attempt
        && activity.attempt === node.attempt && ['failed', 'reconciled'].includes(activity.state),
      'a user retry requires the last ended attempt of the node');
    } else {
      assertTransition(node && !TERMINAL_NODE_STATES.has(node.state) && node.activeActivityExecutionId === payload.activityExecutionId,
        'retry_scheduled requires the current activity of a non-terminal node');
      assertTransition(activity && activity.nodeId === payload.nodeId && activity.attempt === payload.attempt
        && ((activity.state === 'failed' && activity.retryable === true)
          || (activity.state === 'reconciled' && ['proved_not_performed', 'proved_interrupted'].includes(activity.reconcileOutcome))),
      'retry_scheduled requires a retryable failed or not-performed attempt');
    }
    assertTransition(![...next.capacityClaims.values()].some((claim) => claim.state === 'active' && claim.nodeId === payload.nodeId),
      'retry_scheduled requires the attempt capacity to be released');
    assertTransition(payload.budgetReservationId === null || !next.budget.reservations.has(payload.budgetReservationId),
      'retry_scheduled requires the attempt budget to be closed');
    next.timers.set(`retry:${payload.activityExecutionId}:${payload.attempt}`, clone(payload));
    node.state = 'retry_wait';
    node.retryFactId = `${payload.activityExecutionId}:${payload.attempt}`;
    if (umano) {
      node.terminalReason = null;
      node.attemptBase = payload.attempt;
      const aumento = aumentoDelTettoPerRiprova(next.definition, [payload.nodeId]);
      next.budget.ceilingRaise = Object.fromEntries(Object.keys(SPENT_ZERO).map((key) =>
        [key, (next.budget.ceilingRaise?.[key] ?? 0) + (aumento[key] ?? 0)]));
    }
  } else if (event.type === 'timer_scheduled') {
    next.timers.set(event.payload.timerId, { ...clone(event.payload), status: 'scheduled' });
    if (event.payload.nodeId) {
      const node = next.nodes.get(event.payload.nodeId);
      if (node && !node.timerIds.includes(event.payload.timerId)) node.timerIds.push(event.payload.timerId);
    }
  } else if (event.type === 'timer_fired') {
    const timer = next.timers.get(event.payload.timerId);
    const primoFuoco = timer?.status === 'scheduled';
    if (primoFuoco) timer.status = 'fired';
    /*
     * ⭐ F3-41a — il timer di un ritentativo riporta il nodo in gioco (`pending`, poi `ready` da `refreshReadyNodes`) solo se:
     *   è il PRIMO fuoco (duplicato idempotente per `timerId`), non arriva prima di `fireAt`, e il nodo aspetta ancora QUEL
     *   fatto di ritentativo. Un fuoco tardivo, o per un fatto già superato, è una prova vecchia: non rianima (catalogo §9).
     */
    if (primoFuoco && timer.kind === 'retry' && event.payload.targetKind === 'retry') {
      assertTransition(Date.parse(event.at) >= Date.parse(timer.fireAt), 'retry timer cannot fire before its fireAt');
      const node = timer.nodeId ? next.nodes.get(timer.nodeId) : null;
      if (node?.state === 'retry_wait' && node.retryFactId === event.payload.targetId) {
        node.state = 'pending';
        node.retryFactId = null;
      }
    }
  } else if (event.type === 'human_requested') {
    next.humanGates.set(event.payload.gate.requestId, clone(event.payload.gate));
    const node = next.nodes.get(event.nodeId);
    if (node) { node.state = 'waiting_human'; node.humanRequestId = event.payload.gate.requestId; }
  } else if (['human_resolved', 'human_cancelled', 'human_superseded'].includes(event.type)) {
    const gate = next.humanGates.get(event.payload.requestId);
    assertTransition(gate && gate.requestVersion === event.payload.requestVersion && gate.status === 'pending', `${event.type} requires the current pending HumanGate`);
    gate.status = event.type === 'human_resolved' ? event.payload.status : event.type.slice('human_'.length);
    if (event.type === 'human_resolved') {
      gate.answers = clone(event.payload.answers);
      gate.resolvedAt = event.at;
      const node = next.nodes.get(gate.nodeId);
      if (node?.humanRequestId === gate.requestId) {
        node.humanRequestId = null;
        node.state = 'pending';
      }
    }
  } else if (event.type === 'result_recorded') {
    const ref = event.payload.resultRef;
    const prior = next.resultRefs.get(ref.id);
    if (prior && prior.sha256 !== ref.sha256) reducerInvalid('ResultRef id conflicts with another digest');
    if (!prior) next.resultRefs.set(ref.id, clone(ref));
    const node = next.nodes.get(ref.nodeId);
    if (node && !node.resultRefIds.includes(ref.id)) { node.resultRefIds.push(ref.id); node.resultRefIds.sort(); }
  } else if (event.type === 'checkpoint_written') next.audit.checkpoints.push(clone(event.payload));
  else if (['provider_limit_changed', 'circuit_opened', 'circuit_half_open', 'circuit_closed'].includes(event.type)) {
    const key = `${event.payload.provider}/${event.payload.model ?? '*'}`;
    next.providerControl.set(key, { type: event.type, ...clone(event.payload) });
  }
}

function controllaFatto(state, event) {
  validateWorkflowEvent(event);
  if (event.runId !== state.run.runId) reducerInvalid('workflow event runId does not match state');
  if (event.seq !== state.lastSeq + 1) reducerInvalid(`workflow event seq gap: expected ${state.lastSeq + 1}, received ${event.seq}`);
  if (state.eventIds.has(event.eventId)) reducerInvalid(`duplicate workflow eventId ${event.eventId}`);
  if (TERMINAL_RUN_STATES.has(state.run.status)) reducerInvalid('terminal workflow run cannot accept more domain events');
  const expectedGraphVersion = event.type === 'run_created' ? 1
    : event.type === 'graph_patch_applied' ? state.run.graphVersion + 1
      : state.run.graphVersion;
  if (event.graphVersion !== expectedGraphVersion) reducerInvalid(`workflow event graphVersion must be ${expectedGraphVersion}`);
}

/** Il corpo del riduttore, uguale nelle due strade: `next` è lo stato da cambiare, `aggiornaIndici` sa da dove partono gli indici. */
function concludiFatto(next, event, aggiornaIndici) {
  if (!Object.hasOwn(next, 'capacityClaims')) next.capacityClaims = new Map();
  else if (!(next.capacityClaims instanceof Map)) reducerInvalid('capacityClaims checkpoint state is invalid');
  commandReceipt(next, event);
  applyEvent(next, event);
  next.lastSeq = event.seq;
  next.lastEventId = event.eventId;
  next.eventIds.add(event.eventId);
  next.indexes = aggiornaIndici(next);
  refreshReadyNodes(next);
  deriveAttentionFromFailedNodes(next);
  reconcileNodeStateIndexes(next);
  return next;
}

/*
 * ⛔ La strada IMMUTABILE resta quella delle scritture dal vivo: lo Store applica il fatto candidato a una copia e la tiene solo
 *   se la scrittura sul disco riesce (`store.mjs`, `appendEventInternal`) — lo stato di prima non deve cambiare mai.
 */
export function workflowApply(state, event) {
  controllaFatto(state, event);
  const previous = state;
  const next = clone(state);
  return concludiFatto(next, event, (n) => applyIndexDelta(state.indexes, previous, n, event));
}

/*
 * ⭐⭐ Owner 26/09/2026 («debiti del Workflow prima della release») — IL RIGIOCO ERA QUADRATICO: `workflowApply` copia lo stato
 *   INTERO a ogni fatto, e lo stato cresce coi fatti ⇒ 1.000 passi = 52 s (misurato), e all'avvio la scansione rigioca ogni run.
 *   Il rigioco di un giornale GIÀ VERIFICATO possiede il suo stato: si copia UNA volta all'inizio (definizione compresa, perché
 *   `graph_patch_applied` la cambia) e poi ogni fatto si applica SUL POSTO. Si copia invece il FATTO, che è piccolo: il
 *   riduttore in un paio di punti assegna oggetti del fatto per riferimento (`receiptRef`), e un fatto successivo applicato
 *   sul posto potrebbe altrimenti cambiare il fatto stesso nel giornale in memoria. Forma di Marten/Axon: un aggregato si
 *   ricostruisce applicando gli eventi a UNA istanza, non copiandola a ogni evento.
 *   La prova che è lo STESSO stato: `tests/workflow-rigioco-lineare.test.mjs` confronta l'impronta con la piega di
 *   `workflowApply` su giornali veri e sintetici.
 */
function applicaSulPosto(state, eventoDelGiornale) {
  controllaFatto(state, eventoDelGiornale);
  const event = clone(eventoDelGiornale);
  const nodoPrima = event.nodeId !== null ? state.nodes.get(event.nodeId) : undefined;
  const prima = nodoPrima ? { esiste: true, stato: nodoPrima.state } : { esiste: false, stato: undefined };
  return concludiFatto(state, event, (n) => applyIndexDeltaInPlace(n.indexes, prima, n, event));
}

/*
 * ⭐ Refactor dei grafi, decisione owner 29 (26/09/2026, «riproduzione FEDELE»): la storia PUBBLICA degli stati — dopo un fatto,
 *   il run e i passi il cui stato è cambiato, letti confrontando lo stato del riduttore PRIMA e DOPO quel fatto. ⛔ Non si
 *   ricostruisce dai tipi degli eventi: `refreshReadyNodes` muove passi che il fatto non nomina (finito `root`, i suoi figli
 *   diventano `ready`), e una seconda copia delle regole divergerebbe in silenzio. Il costo è un giro sui passi per fatto, lo
 *   stesso che `refreshReadyNodes` fa già a ogni `workflowApply`. Forma come gli `states` del grafo di Prefect (id, ora, tipo,
 *   `read-flow-run-graph-v2`, letto il 26/09/2026); voci congelate, così chi le condivide (la cache dello Store) non le cambia.
 */
export function workflowStateChanges(previous, next, event) {
  return cambiamentiDiStato(previous.run.status, (nodeId) => previous.nodes.get(nodeId)?.state, next, event);
}

function cambiamentiDiStato(statoRunPrima, statoNodoPrima, next, event) {
  const changes = [];
  if (statoRunPrima !== next.run.status) {
    changes.push(Object.freeze({ seq: event.seq, at: event.at, scope: 'run', state: next.run.status }));
  }
  for (const [nodeId, node] of next.nodes) {
    if (statoNodoPrima(nodeId) !== node.state) {
      changes.push(Object.freeze({ seq: event.seq, at: event.at, scope: 'node', nodeId, state: node.state }));
    }
  }
  return changes;
}

export function workflowReplay({ initialState, definition, runId, events = [] }) {
  let state = clone(initialState ?? workflowInitialState({ definition, runId }));
  for (const event of events) state = applicaSulPosto(state, event);
  return state;
}

/**
 * Il rigioco con la storia pubblica degli stati (decisione owner 29): stesso stato di `workflowReplay`, e per ogni fatto le
 * voci che `workflowStateChanges` darebbe confrontando lo stato prima e dopo — qui «prima» è una fotografia degli stati
 * (una stringa per passo), non una copia dello stato.
 */
export function workflowReplayWithHistory({ initialState, definition, runId, events = [] }) {
  let state = clone(initialState ?? workflowInitialState({ definition, runId }));
  const history = [];
  for (const event of events) {
    const statoRunPrima = state.run.status;
    const statiPrima = new Map();
    for (const [nodeId, node] of state.nodes) statiPrima.set(nodeId, node.state);
    state = applicaSulPosto(state, event);
    for (const voce of cambiamentiDiStato(statoRunPrima, (nodeId) => statiPrima.get(nodeId), state, event)) history.push(voce);
  }
  return { state, history };
}

export function workflowRecover({ checkpointState, events = [], expectedStateHash = null }) {
  if (!checkpointState || typeof checkpointState !== 'object') reducerInvalid('checkpointState is required for recovery');
  if (expectedStateHash !== null && workflowStateHash(checkpointState) !== expectedStateHash) reducerInvalid('checkpoint stateHash mismatch', 'WORKFLOW_CHECKPOINT_INVALID');
  return workflowReplay({ initialState: clone(checkpointState), events });
}

export function workflowReadyNodes(state) {
  return [...state.indexes.readyQueue];
}

export function workflowProgress(state) {
  const total = state.nodes.size;
  const completed = [...state.nodes.values()].filter((node) => TERMINAL_NODE_STATES.has(node.state)).length;
  return { completed, total, ratio: total === 0 ? 1 : completed / total };
}

function sortedMapValues(map, key) {
  return [...map.values()].map(clone).sort((left, right) => String(left[key]).localeCompare(String(right[key]), 'en'));
}

export function workflowStateProjection(state) {
  const runStatus = state.run.status === 'running' && state.run.cancelRequested ? 'cancelling'
    : state.run.status === 'running' && state.run.pauseRequested ? 'pausing'
      : state.run.status;
  const projection = {
    schema: 'talos.workflow-state-projection.v1',
    run: {
      runId: state.run.runId,
      definitionHash: state.run.definitionHash,
      engineSchemaVersion: state.run.engineSchemaVersion,
      status: runStatus,
      graphVersion: state.run.graphVersion,
      cancellationState: state.run.cancellationState,
      needsAttentionReasons: [...new Set(state.run.needsAttentionReasons)].sort(),
    },
    graph: {
      nodes: clone(state.definition.nodes).sort((left, right) => left.id.localeCompare(right.id, 'en')),
      edges: clone(state.definition.edges).sort((left, right) => left.id.localeCompare(right.id, 'en')),
    },
    nodeRuns: sortedMapValues(state.nodes, 'nodeId').map((node) => ({ ...node, timerIds: [...new Set(node.timerIds)].sort(), resultRefIds: [...new Set(node.resultRefIds)].sort() })),
    activities: sortedMapValues(state.activities, 'activityExecutionId'),
    leases: sortedMapValues(state.leases, 'leaseId'),
    budget: {
      spent: clone(state.budget.spent),
      reservations: sortedMapValues(state.budget.reservations, 'reservationId'),
    },
    humanGates: sortedMapValues(state.humanGates, 'requestId'),
    timers: sortedMapValues(state.timers, 'timerId'),
    providerControl: [...state.providerControl.entries()].sort(([left], [right]) => left.localeCompare(right, 'en')).map(([, value]) => clone(value)),
    resultRefs: sortedMapValues(state.resultRefs, 'id').map((ref) => ({
      id: ref.id, sha256: ref.sha256, nodeId: ref.nodeId, activityExecutionId: ref.activityExecutionId,
      kind: ref.kind, trust: ref.trust, sensitivity: ref.sensitivity, eligibleForIntegration: ref.eligibleForIntegration,
    })),
  };
  if (state.capacityClaims?.size) {
    projection.schema = 'talos.workflow-state-projection.v2';
    projection.capacityClaims = sortedMapValues(state.capacityClaims, 'claimId');
  }
  return projection;
}

export function workflowStateHash(state) {
  return canonicalHash(workflowStateProjection(state));
}

export function workflowIsTerminal(state) {
  return TERMINAL_RUN_STATES.has(state.run.status);
}
