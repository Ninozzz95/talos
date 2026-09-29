import { validateMeasuredUsage } from './budget.mjs';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ACTIVITY_KINDS = new Set([
  'model', 'agent-session', 'process', 'file-write', 'worktree', 'git',
  'external-tool', 'test', 'human-wait', 'deterministic',
]);
const FAILURE_CLASSES = new Set([
  'auth', 'quota_hard', 'rate_limit', 'transient_network', 'provider_5xx',
  'model_invalid', 'context_overflow', 'process_exit', 'validation',
  'cancelled', 'internal',
]);
const UNCERTAIN_REASONS = new Set([
  'crash_after_start', 'receipt_missing', 'transport_ambiguous',
  'effect_seen_without_ack', 'recovery_unknown',
]);
const RECONCILE_OUTCOMES = new Set(['proved_completed', 'proved_not_performed', 'proved_interrupted', 'still_unknown']);
const ACTIVITY_KIND_BY_NODE_KIND = Object.freeze({
  agent: 'agent-session',
  router: 'model',
  fanout: 'deterministic',
  reduce: 'model',
  verify: 'test',
  judge: 'model',
  test: 'test',
  human: 'human-wait',
  merge: 'git',
  loop: 'deterministic',
  gate: 'deterministic',
  artifact: 'file-write',
  subworkflow: 'deterministic',
});

export class WorkflowActivityRunnerError extends Error {
  constructor(message, code = 'WORKFLOW_ACTIVITY_INVALID', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowActivityRunnerError';
    this.code = code;
  }
}

const activityError = (message, code, cause) => new WorkflowActivityRunnerError(message, code, cause);

function plainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw activityError(`${name} is invalid`, 'WORKFLOW_ACTIVITY_INVALID');
  }
  return value;
}

function requireRunId(value) {
  if (!UUID_V4.test(value)) throw activityError('runId is invalid', 'WORKFLOW_RUN_ID_INVALID');
  return value;
}

function requireNodeId(value) {
  if (!ID.test(value)) throw activityError('nodeId is invalid', 'WORKFLOW_ACTIVITY_INVALID');
  return value;
}

function requireUuid(value, name) {
  if (!UUID_V4.test(value)) throw activityError(`${name} is invalid`, 'WORKFLOW_ACTIVITY_ID_INVALID');
  return value;
}

function exactKeys(value, required, optional, name) {
  if (!plainObject(value)) throw activityError(`${name} must be a plain object`, 'WORKFLOW_ACTIVITY_INVALID');
  const accepted = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) throw activityError(`${name} has unknown field ${key}`, 'WORKFLOW_ACTIVITY_INVALID');
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw activityError(`${name} is missing field ${key}`, 'WORKFLOW_ACTIVITY_INVALID');
  }
  return value;
}

function adapterMap(value) {
  const entries = value instanceof Map ? [...value.entries()] : Object.entries(value ?? {});
  const accepted = new Map();
  for (const [kind, adapter] of entries) {
    if (!ACTIVITY_KINDS.has(kind) || !plainObject(adapter)) {
      throw activityError('adapter registry is invalid', 'WORKFLOW_ADAPTER_INVALID');
    }
    requireString(adapter.id, 'adapter.id', 200);
    if (typeof adapter.execute !== 'function' || typeof adapter.reconcile !== 'function' || typeof adapter.cancel !== 'function') {
      throw activityError(`adapter ${kind} must expose execute, reconcile and cancel`, 'WORKFLOW_ADAPTER_INVALID');
    }
    if (accepted.has(kind)) throw activityError(`duplicate adapter for ${kind}`, 'WORKFLOW_ADAPTER_INVALID');
    accepted.set(kind, adapter);
  }
  return accepted;
}

function nodeDefinition(definition, nodeId) {
  const node = definition?.nodes?.find((candidate) => candidate.id === nodeId);
  if (!node) throw activityError(`unknown workflow node ${nodeId}`, 'WORKFLOW_NODE_NOT_FOUND');
  if (!plainObject(node.activityPolicy)) throw activityError('node activityPolicy is unavailable', 'WORKFLOW_ACTIVITY_INVALID');
  return node;
}

/*
 * ⭐ F3-32 (25/09/2026), decisione owner «Sì, come Hermes»: un passo riceve i risultati dei passi da cui DIPENDE (archi entranti
 *   che non sono ritentativi), dai fatti del giornale — mai da ciò che dice il modello. Ogni risultato arriva come il suo
 *   `summary` registrato (≤4.096 caratteri per contratto, lo stesso tetto di Hermes `_CTX_MAX_FIELD_BYTES = 4 * 1024`,
 *   `hermes_cli/kanban_db.py:327`), dichiarato troncato quando i byte sono di più, con l'istante in cui il passo è finito.
 *   Al più 20 predecessori, e quelli in più si contano: un tetto che si dice, non un taglio silenzioso.
 */
const PREDECESSORS_MAX = 20;

/*
 * ⛔⛔ F-014 (piano 0.1.19 §1.6, 28/09) — ogni risultato del predecessore porta anche il suo `sha256`:
 *   il figlio che riceve lo snapshot sa non solo CHE c'è un moncone, ma QUALE output integrale
 *   chiedere con `workflow_output(runId, nodeId)`. Esportata per le prove (stessa ragione per cui
 *   il kernel esporta `verificaPermessoScrittura`): un test la esercita con uno snapshot vero
 *   senza far girare l'intero run.
 */
export function predecessorResults(snapshot, nodeId) {
  const definition = snapshot.definition;
  const froms = [...new Set(definition.edges.filter((edge) => edge.to === nodeId && edge.type !== 'retry').map((edge) => edge.from))]
    .sort((left, right) => left.localeCompare(right, 'en'));
  const items = froms.slice(0, PREDECESSORS_MAX).map((from) => {
    const nodeState = snapshot.state.nodes.get(from);
    const refs = (nodeState?.resultRefIds ?? []).map((id) => snapshot.state.resultRefs?.get(id)).filter(Boolean);
    const finished = [...(snapshot.events ?? [])].reverse().find((event) => event.type === 'node_succeeded' && event.nodeId === from);
    return Object.freeze({
      nodeId: from,
      label: definition.nodes.find((candidate) => candidate.id === from)?.label ?? from,
      state: nodeState?.state ?? 'pending',
      completedAt: finished?.at ?? null,
      results: Object.freeze(refs.map((ref) => Object.freeze({
        resultId: ref.id, sha256: ref.sha256, summary: ref.summary, bytes: ref.bytes,
        truncated: ref.bytes > Buffer.byteLength(ref.summary, 'utf8'),
      }))),
    });
  });
  return Object.freeze({ items: Object.freeze(items), omitted: Math.max(0, froms.length - PREDECESSORS_MAX) });
}

const SESSION_FACTS = new Set(['agent_session_created', 'agent_session_finished']);

function currentIdentity(snapshot, identity) {
  const node = snapshot.state.nodes.get(identity.nodeId);
  return node?.activeActivityExecutionId === identity.activityExecutionId
    && node.activeLeaseId === identity.leaseId
    && node.leaseEpoch === identity.leaseEpoch;
}

function durableResultIds(snapshot, resultIds, identity, { requireCurrentActivity = false } = {}) {
  const unique = [...new Set(resultIds)].sort();
  for (const id of unique) {
    const resultRef = snapshot.state.resultRefs.get(id);
    if (!resultRef || (requireCurrentActivity && resultRef.activityExecutionId !== identity.activityExecutionId)) {
      throw activityError('adapter referenced a ResultRef that is not durably recorded for this activity', 'WORKFLOW_RESULT_NOT_RECORDED');
    }
  }
  return unique;
}

function activityFacts(events, activityExecutionId) {
  return events.filter((event) => event.activityExecutionId === activityExecutionId);
}

function operationalContext(snapshot, activityExecutionId) {
  const facts = activityFacts(snapshot.events, activityExecutionId);
  const scheduled = facts.find((event) => event.type === 'activity_scheduled');
  const started = facts.find((event) => event.type === 'activity_started');
  const activity = snapshot.state.activities.get(activityExecutionId);
  if (!scheduled || !activity) throw activityError('activity journal facts are incomplete', 'WORKFLOW_ACTIVITY_NOT_FOUND');
  return {
    identity: {
      nodeId: scheduled.nodeId,
      activityExecutionId: scheduled.activityExecutionId,
      attempt: scheduled.attempt,
      leaseId: scheduled.leaseId,
      leaseEpoch: scheduled.leaseEpoch,
    },
    scheduled: scheduled.payload,
    eventSchemaVersion: scheduled.eventSchemaVersion ?? 1,
    adapterId: started?.payload?.adapterId ?? null,
    activity,
  };
}

function outcomeUsage(value, required) {
  if (!required) return undefined;
  if (value.actualUsage === null) return null;
  try { return validateMeasuredUsage(value.actualUsage); } catch (error) {
    throw activityError(`adapter actualUsage is invalid: ${error.message}`, 'WORKFLOW_ADAPTER_RESULT_INVALID', error);
  }
}

function normalizeCompleted(value, v2) {
  exactKeys(value, ['status', 'receiptRef', 'results', ...(v2 ? ['actualUsage'] : [])], [], 'completed adapter outcome');
  if (value.status !== 'completed' || (value.receiptRef !== null && typeof value.receiptRef !== 'string')) {
    throw activityError('completed adapter outcome is invalid', 'WORKFLOW_ADAPTER_RESULT_INVALID');
  }
  if (!Array.isArray(value.results) || value.results.length > 10_000) {
    throw activityError('completed adapter results are invalid', 'WORKFLOW_ADAPTER_RESULT_INVALID');
  }
  return v2 ? { ...value, actualUsage: outcomeUsage(value, true) } : value;
}

function normalizeFailure(value, v2) {
  exactKeys(value, ['status', 'errorClass', 'retryable', 'evidenceResultIds', ...(v2 ? ['receiptRef', 'actualUsage'] : [])], [], 'failed adapter outcome');
  if (value.status !== 'failed' || !FAILURE_CLASSES.has(value.errorClass)
    || typeof value.retryable !== 'boolean'
    || !Array.isArray(value.evidenceResultIds)
    || value.evidenceResultIds.some((entry) => typeof entry !== 'string')
    || (v2 && value.receiptRef !== null && typeof value.receiptRef !== 'string')) {
    throw activityError('failed adapter outcome is invalid', 'WORKFLOW_ADAPTER_RESULT_INVALID');
  }
  return v2 ? { ...value, actualUsage: outcomeUsage(value, true) } : value;
}

function normalizeUncertain(value, v2) {
  exactKeys(value, ['status', 'reasonClass', 'observedReceiptRef', ...(v2 ? ['actualUsage'] : [])], [], 'uncertain adapter outcome');
  if (value.status !== 'uncertain' || !UNCERTAIN_REASONS.has(value.reasonClass)
    || (value.observedReceiptRef !== null && typeof value.observedReceiptRef !== 'string')
    || (v2 && value.actualUsage !== null)) {
    throw activityError('uncertain adapter outcome is invalid', 'WORKFLOW_ADAPTER_RESULT_INVALID');
  }
  return value;
}

function normalizeOutcome(value, v2 = false) {
  if (!plainObject(value)) throw activityError('adapter outcome is invalid', 'WORKFLOW_ADAPTER_RESULT_INVALID');
  if (value.status === 'completed') return normalizeCompleted(value, v2);
  if (value.status === 'failed') return normalizeFailure(value, v2);
  if (value.status === 'uncertain') return normalizeUncertain(value, v2);
  throw activityError('adapter outcome status is invalid', 'WORKFLOW_ADAPTER_RESULT_INVALID');
}

function normalizeReconciliation(value, v2 = false) {
  exactKeys(value, ['outcome', 'receiptRef', 'resultIds', ...(v2 ? ['actualUsage'] : [])], [], 'reconciliation outcome');
  if (!RECONCILE_OUTCOMES.has(value.outcome)
    || (value.receiptRef !== null && typeof value.receiptRef !== 'string')
    || !Array.isArray(value.resultIds)
    || value.resultIds.some((entry) => typeof entry !== 'string')
    || (v2 && !['proved_completed', 'proved_interrupted'].includes(value.outcome) && value.actualUsage !== null)
    // F3-41c: un tentativo provato interrotto porta SEMPRE la ricevuta e il consumo misurato, mai risultati (solo v2)
    || (value.outcome === 'proved_interrupted' && (!v2 || value.actualUsage === null || value.receiptRef === null || value.resultIds.length !== 0))) {
    throw activityError('reconciliation outcome is invalid', 'WORKFLOW_ADAPTER_RESULT_INVALID');
  }
  return v2 ? { ...value, actualUsage: outcomeUsage(value, true) } : value;
}

function combinedSignal(parentSignal, localController) {
  if (parentSignal === undefined) return localController.signal;
  if (!(parentSignal instanceof AbortSignal)) throw activityError('signal must be an AbortSignal', 'WORKFLOW_ACTIVITY_INVALID');
  return AbortSignal.any([parentSignal, localController.signal]);
}

function adapterFor(registry, kind, expectedId = null) {
  const adapter = registry.get(kind);
  if (!adapter) throw activityError(`no adapter is registered for ${kind}`, 'WORKFLOW_ADAPTER_NOT_FOUND');
  if (expectedId !== null && adapter.id !== expectedId) {
    throw activityError('durable adapter identity does not match the registry', 'WORKFLOW_ADAPTER_MISMATCH');
  }
  return adapter;
}

function observedOutcome(value) {
  if (value?.status === 'completed') return 'completed';
  if (value?.status === 'failed') return 'failed';
  return 'cancelled';
}

export function createActivityRunner({
  journal,
  adapters,
  publishResult,
  nowFn = () => new Date().toISOString(),
  idFn,
  nestedActivityGateway,
} = {}) {
  if (!journal || typeof journal.load !== 'function' || typeof journal.append !== 'function') {
    throw activityError('journal.load and journal.append are required', 'WORKFLOW_ACTIVITY_COMPOSITION_INVALID');
  }
  if (typeof publishResult !== 'function' || typeof nowFn !== 'function' || typeof idFn !== 'function') {
    throw activityError('publishResult, nowFn and idFn are required', 'WORKFLOW_ACTIVITY_COMPOSITION_INVALID');
  }
  if (nestedActivityGateway !== undefined && typeof nestedActivityGateway !== 'function') {
    throw activityError('nestedActivityGateway must be a function', 'WORKFLOW_ACTIVITY_COMPOSITION_INVALID');
  }
  const registry = adapterMap(adapters);
  const active = new Map();
  let runtimeState = 'quarantined';
  let recoveryError = null;

  const status = () => Object.freeze({
    state: runtimeState,
    activeActivities: active.size,
    errorCode: recoveryError?.code ?? null,
  });

  function assertReady() {
    if (runtimeState !== 'ready') throw activityError('Workflow runtime recovery is not complete', 'WORKFLOW_RUNTIME_NOT_READY');
  }

  function nestedEffects(identity) {
    return Object.freeze({
      mode: 'activity-only',
      request: nestedActivityGateway
        ? (request) => nestedActivityGateway({ parent: structuredClone(identity), request })
        : async () => { throw activityError('nested external effect requires a registered Activity gateway', 'WORKFLOW_NESTED_EFFECT_FORBIDDEN'); },
    });
  }

  async function appendUncertain(runId, identity, reasonClass, observedReceiptRef = null) {
    await journal.append(runId, {
      type: 'activity_uncertain',
      ...identity,
      payload: { reasonClass, observedReceiptRef },
    });
    return Object.freeze({ status: 'uncertain', ...identity, reasonClass });
  }

  async function appendStale(runId, identity, snapshot, outcome, forensicResultIds = []) {
    const current = snapshot.state.nodes.get(identity.nodeId);
    await journal.append(runId, {
      type: 'stale_activity_completion_observed',
      ...identity,
      payload: {
        currentLeaseId: current?.activeLeaseId ?? null,
        currentLeaseEpoch: current?.activeLeaseId ? current.leaseEpoch : null,
        observedOutcome: observedOutcome(outcome),
        forensicResultIds,
      },
    });
    return Object.freeze({ status: 'stale', ...identity });
  }

  async function reconcile({ runId, activityExecutionId, reasonClass = 'recovery_unknown', signal } = {}, { allowQuarantine = false } = {}) {
    requireRunId(runId);
    requireUuid(activityExecutionId, 'activityExecutionId');
    if (!allowQuarantine) assertReady();
    if (!UNCERTAIN_REASONS.has(reasonClass)) throw activityError('reconciliation reasonClass is invalid', 'WORKFLOW_ACTIVITY_INVALID');
    // F3-41b, fence 3 di WFS §8: un'attività viva in questo processo non si riconcilia — il suo completamento tardivo diventerebbe
    // invalido. Si riconcilia ciò che nessuno sta più eseguendo (dopo un riavvio, o dopo che la chiamata è tornata).
    if (active.has(`${runId}/${activityExecutionId}`)) throw activityError('the activity is still running in this process', 'WORKFLOW_ACTIVITY_LIVE');
    let snapshot = await journal.load(runId);
    let context = operationalContext(snapshot, activityExecutionId);
    const adapter = adapterFor(registry, context.scheduled.activityKind, context.adapterId);
    if (context.activity.state === 'started') {
      await appendUncertain(runId, context.identity, reasonClass);
      snapshot = await journal.load(runId);
      context = operationalContext(snapshot, activityExecutionId);
    }
    if (context.activity.state !== 'uncertain') {
      throw activityError('only started or uncertain activities can be reconciled', 'WORKFLOW_ACTIVITY_STATE_INVALID');
    }
    const localController = new AbortController();
    const v2 = context.eventSchemaVersion === 2;
    const unknownOutcome = () => ({
      outcome: 'still_unknown', receiptRef: null, resultIds: [],
      ...(v2 ? { actualUsage: null } : {}),
    });
    let outcome;
    try {
      outcome = normalizeReconciliation(await adapter.reconcile(Object.freeze({
        runId,
        ...context.identity,
        idempotencyKey: context.scheduled.idempotencyKey,
        effectClass: context.scheduled.effectClass,
        retryMode: context.scheduled.retryMode,
        outcomeSchemaVersion: v2 ? 2 : 1, // F3-32: l'adattatore risponde nella forma che il runner accetterà
        signal: combinedSignal(signal, localController),
      })), v2);
    } catch {
      outcome = unknownOutcome();
    }
    if (outcome.outcome !== 'still_unknown') {
      try {
        outcome = { ...outcome, resultIds: durableResultIds(snapshot, outcome.resultIds, context.identity) };
      } catch {
        outcome = unknownOutcome();
      }
    }
    await journal.append(runId, {
      type: 'activity_reconciled',
      ...(v2 ? { eventSchemaVersion: 2 } : {}),
      ...context.identity,
      payload: outcome,
    });
    return Object.freeze({ status: 'reconciled', ...context.identity, outcome: outcome.outcome });
  }

  async function finishTerminalActivity(runId, snapshot, activity) {
    const context = operationalContext(snapshot, activity.activityExecutionId);
    if (!currentIdentity(snapshot, context.identity)) return;
    const terminal = [...activityFacts(snapshot.events, activity.activityExecutionId)]
      .reverse()
      .find((fact) => ['activity_completed', 'activity_failed'].includes(fact.type));
    if (!terminal) throw activityError('terminal activity has no durable terminal fact', 'WORKFLOW_ACTIVITY_RECOVERY_INVALID');
    if (terminal.type === 'activity_completed') {
      await journal.append(runId, {
        type: 'node_succeeded',
        nodeId: context.identity.nodeId,
        payload: { resultIds: terminal.payload.resultIds },
      });
      return;
    }
    // F3-41a: un fallimento ritentabile e provato non diventa `node_failed` al riavvio — ritentare o no lo decide lo scheduler.
    if (terminal.payload.retryable === true) return;
    if (terminal.payload.errorClass === 'cancelled') {
      if (!snapshot.state.run.cancelRequested) {
        throw activityError('cancelled activity has no durable run cancellation intent', 'WORKFLOW_CANCEL_INTENT_MISSING');
      }
      await journal.append(runId, {
        type: 'node_cancelled',
        nodeId: context.identity.nodeId,
        payload: { reason: 'run_cancelled' },
      });
      return;
    }
    await journal.append(runId, {
      type: 'node_failed',
      nodeId: context.identity.nodeId,
      payload: {
        errorClass: terminal.payload.errorClass,
        evidenceResultIds: terminal.payload.evidenceResultIds,
      },
    });
  }

  async function recover({ runIds = [], signal } = {}) {
    if (runtimeState === 'recovering') throw activityError('Workflow recovery is already running', 'WORKFLOW_RECOVERY_IN_PROGRESS');
    if (!Array.isArray(runIds) || runIds.some((runId) => !UUID_V4.test(runId))) {
      throw activityError('recovery runIds are invalid', 'WORKFLOW_RECOVERY_INVALID');
    }
    if (active.size > 0) throw activityError('recovery cannot run while activities are live', 'WORKFLOW_RECOVERY_WITH_LIVE_ACTIVITIES');
    runtimeState = 'recovering';
    recoveryError = null;
    try {
      for (const runId of [...new Set(runIds)].sort()) {
        const snapshot = await journal.load(runId);
        const recoverable = [...snapshot.state.activities.values()]
          .filter((activity) => ['scheduled', 'started', 'uncertain', 'completed', 'failed'].includes(activity.state))
          .sort((left, right) => left.activityExecutionId.localeCompare(right.activityExecutionId, 'en'));
        for (const activity of recoverable) {
          if (['completed', 'failed'].includes(activity.state)) await finishTerminalActivity(runId, await journal.load(runId), activity);
          else {
            /*
             * ⭐ F3-41c (25/09/2026) — la finestra «programmato ma non avviato» (`WF-CRASH-SCHEDULE-BEFORE-START`): i due fatti
             *   vanno insieme in un turno della coda (fence 1), ma sono due scritture, e un crollo fra le due lascia un tentativo
             *   `scheduled`. Nessun effetto può essere partito (il permesso si dà solo DOPO `activity_started` durevole, catalogo
             *   §6), ma dal contratto non esce nessuna transizione da `scheduled`: si scrive `activity_started` e si riconcilia
             *   subito — l'adattatore non trova la sessione e risponde «non eseguito», come deve.
             */
            if (activity.state === 'scheduled') {
              const context = operationalContext(await journal.load(runId), activity.activityExecutionId);
              const adapter = adapterFor(registry, context.scheduled.activityKind);
              if (currentIdentity(await journal.load(runId), context.identity)) {
                await journal.append(runId, { type: 'activity_started', ...context.identity, payload: { adapterId: adapter.id } });
              } else continue;
            }
            await reconcile({ runId, activityExecutionId: activity.activityExecutionId, signal }, { allowQuarantine: true });
          }
        }
      }
      runtimeState = 'ready';
      return status();
    } catch (error) {
      runtimeState = 'needs_attention';
      recoveryError = error;
      throw error;
    }
  }

  async function execute(input = {}) {
    assertReady();
    exactKeys(input, [
      'runId', 'nodeId', 'activityKind', 'resourceClass', 'idempotencyKey',
      'budgetReservationId', 'deadlineAt',
    ], ['signal', 'preparedIdentity'], 'activity execution');
    const runId = requireRunId(input.runId);
    const nodeId = requireNodeId(input.nodeId);
    if (!ACTIVITY_KINDS.has(input.activityKind)) throw activityError('activityKind is invalid', 'WORKFLOW_ACTIVITY_INVALID');
    requireString(input.resourceClass, 'resourceClass', 128);
    requireString(input.idempotencyKey, 'idempotencyKey', 512);
    if (input.budgetReservationId !== null) requireUuid(input.budgetReservationId, 'budgetReservationId');
    if (input.deadlineAt !== null) requireString(input.deadlineAt, 'deadlineAt', 64);

    const snapshot = await journal.load(runId);
    const nodeRun = snapshot.state.nodes.get(nodeId);
    const node = nodeDefinition(snapshot.definition, nodeId);
    if (!nodeRun || !['ready', 'retry_wait', 'reconciling'].includes(nodeRun.state)) {
      throw activityError('node is not eligible for a new activity', 'WORKFLOW_NODE_NOT_READY');
    }
    if (ACTIVITY_KIND_BY_NODE_KIND[node.kind] !== input.activityKind) {
      throw activityError('activityKind does not match the approved node kind', 'WORKFLOW_ACTIVITY_KIND_MISMATCH');
    }
    const v2 = Object.hasOwn(input, 'preparedIdentity');
    let prepared = null;
    if (v2) {
      if (snapshot.state.run.status !== 'running' || !snapshot.state.run.schedulingEnabled
        || snapshot.state.run.pauseRequested || snapshot.state.run.cancelRequested) {
        throw activityError('prepared Activity run is not schedulable', 'WORKFLOW_RUN_NOT_SCHEDULABLE');
      }
      prepared = exactKeys(input.preparedIdentity, [
        'nodeId', 'activityExecutionId', 'attempt', 'leaseId', 'leaseEpoch',
      ], [], 'prepared Activity identity');
      requireUuid(prepared.activityExecutionId, 'activityExecutionId');
      requireUuid(prepared.leaseId, 'leaseId');
      if (prepared.nodeId !== nodeId || nodeRun.state !== 'ready'
        || prepared.attempt !== nodeRun.attempt + 1
        || prepared.leaseEpoch !== nodeRun.leaseEpoch + 1
        || input.budgetReservationId === null) {
        throw activityError('prepared Activity identity does not match the ready node', 'WORKFLOW_CAPACITY_CLAIM_MISMATCH');
      }
      const claim = [...(snapshot.state.capacityClaims?.values() ?? [])].find((candidate) =>
        candidate.state === 'active' && candidate.runId === runId && candidate.nodeId === nodeId
        && candidate.activityExecutionId === prepared.activityExecutionId
        && candidate.attempt === prepared.attempt && candidate.leaseId === prepared.leaseId
        && candidate.leaseEpoch === prepared.leaseEpoch
        && candidate.budgetReservationId === input.budgetReservationId);
      const reservation = snapshot.state.budget?.reservations?.get(input.budgetReservationId);
      if (!claim || reservation?.state !== 'reserved'
        || reservation.activityExecutionId !== prepared.activityExecutionId
        || reservation.leaseId !== prepared.leaseId
        || reservation.leaseEpoch !== prepared.leaseEpoch) {
        throw activityError('prepared Activity requires an exact active claim and budget reservation', 'WORKFLOW_CAPACITY_CLAIM_MISMATCH');
      }
    }
    const adapter = adapterFor(registry, input.activityKind);
    const identity = prepared ? { ...prepared } : {
      nodeId,
      activityExecutionId: requireUuid(idFn(), 'activityExecutionId'),
      attempt: nodeRun.attempt + 1,
      leaseId: requireUuid(idFn(), 'leaseId'),
      leaseEpoch: nodeRun.leaseEpoch + 1,
    };
    /*
     * ⭐ F3-32 (25/09/2026) — ciò che l'adattatore deve sapere per ESEGUIRE il passo, dai fatti verificati del run e mai da un
     *   chiamante: il passo approvato, la sessione che ha proposto il run e il suo modello congelato nella proposta (decisione
     *   owner 42), i risultati dei predecessori. ⛔ Si costruisce PRIMA di `activity_scheduled`: dentro il `try` della chiamata
     *   all'adattatore un errore qui diventerebbe `activity_uncertain`, cioè un difetto del runner scambiato per un effetto
     *   incerto — trovato così dalla suite il 25/09 («il catch giusto nasconde il bug sbagliato»).
     */
    const contestoPasso = Object.freeze({
      outcomeSchemaVersion: v2 ? 2 : 1,
      step: Object.freeze(structuredClone(node)),
      run: Object.freeze({
        runId: snapshot.state.run?.runId ?? null, // F-014 (§1.6): la FRASE dello snapshot nomina il run
        rootSessionId: snapshot.events?.[0]?.payload?.rootSessionId ?? null,
        definitionHash: snapshot.events?.[0]?.payload?.definitionHash ?? null,
        sessionModel: snapshot.definitionRecord?.proposal?.sessionModel ?? null,
      }),
      predecessors: predecessorResults(snapshot, nodeId),
    });
    const fattoProgrammato = {
      type: 'activity_scheduled',
      ...(v2 ? { eventSchemaVersion: 2 } : {}),
      ...identity,
      payload: {
        activityKind: input.activityKind,
        effectClass: node.activityPolicy.effectClass,
        retryMode: node.activityPolicy.retryMode,
        idempotencyKey: input.idempotencyKey,
        resourceClass: input.resourceClass,
        budgetReservationId: input.budgetReservationId,
        deadlineAt: input.deadlineAt,
      },
    };
    const fattoAvviato = { type: 'activity_started', ...identity, payload: { adapterId: adapter.id } };

    /*
     * ⭐ F3-41b (25/09/2026) — i FENCE di `WFS` §8, prima di togliere la coda lunga per run (che serializzava i passi paralleli):
     *   1. `activity_scheduled` e `activity_started` si scrivono INSIEME (`journal.appendMany`, un solo turno della coda del
     *      giornale): fra i due non può entrare un `run_cancel_requested`; e il riduttore rifiuta un `activity_scheduled` v2 su
     *      un run non più schedulabile (pausa o annullamento chiesti).
     *   2. L'attività è registrata come VIVA prima dei due fatti: un annullamento che arriva fra `activity_started` e la
     *      chiamata all'adattatore la trova, e l'effetto non parte — prima la registrazione veniva dopo, l'annullamento non la
     *      trovava e l'adattatore partiva lo stesso.
     *   3. `reconcile` e `recover` rifiutano un'attività ancora viva in questo processo (sotto).
     */
    const localController = new AbortController();
    const signal = combinedSignal(input.signal, localController);
    const activeKey = `${runId}/${identity.activityExecutionId}`;
    /*
     * ⭐ F3-51a (25/09/2026) — la FINE dell'esecuzione si segnala a chi annulla: in v2 l'annullamento chiede lo stop e poi
     *   ASPETTA che sia questa esecuzione a scrivere il fatto terminale, con la ricevuta e il consumo del passo (owner 25/09,
     *   «Annulla: si fermano subito», e i token spesi contano). Prima scrivevano tutte e due, in gara: un fatto v1 su un'attività
     *   v2, e `node_cancelled` su un nodo già `failed`.
     */
    let segnaFinita;
    const finita = new Promise((resolve) => { segnaFinita = resolve; });
    active.set(activeKey, { adapter, controller: localController, identity, signal, cancellation: null,
      v2, annullamentoChiesto: false, finita });
    const corpo = async () => {
      try {
        if (typeof journal.appendMany === 'function') await journal.appendMany(runId, [fattoProgrammato, fattoAvviato]);
        else {
          await journal.append(runId, fattoProgrammato);
          await journal.append(runId, fattoAvviato);
        }
      } catch (error) {
        active.delete(activeKey);
        throw error;
      }
      const primaDellEffetto = active.get(activeKey);
      if (primaDellEffetto?.cancellation) {
        try { return await primaDellEffetto.cancellation; } finally { active.delete(activeKey); }
      }
      if (primaDellEffetto?.annullamentoChiesto) {
        // F3-51a, v2: annullato fra i due fatti e l'effetto — l'effetto NON parte; nessuna sessione ⇒ la riconciliazione lo
        // prova «non eseguito», e lo scheduler rilascia il posto e chiude il passo come annullato
        active.delete(activeKey);
        await appendUncertain(runId, identity, 'recovery_unknown');
        return reconcile({ runId, activityExecutionId: identity.activityExecutionId }, { allowQuarantine: true });
      }
      let outcome;
      try {
        outcome = normalizeOutcome(await adapter.execute(Object.freeze({
          runId,
          ...identity,
          activityKind: input.activityKind,
          effectClass: node.activityPolicy.effectClass,
          retryMode: node.activityPolicy.retryMode,
          idempotencyKey: input.idempotencyKey,
          resourceClass: input.resourceClass,
          deadlineAt: input.deadlineAt,
          startedAt: nowFn(),
          signal,
          nestedEffects: nestedEffects(identity),
          // F3-32: il passo e i suoi ingressi (costruiti prima di `activity_scheduled`), e l'unica scrittura concessa
          // all'adattatore nel giornale — i fatti `agent_session_*`, con l'identità di QUESTA attività (audit WFS punto 7).
          ...contestoPasso,
          recordSessionFact: async (type, payload) => {
            if (!SESSION_FACTS.has(type)) throw activityError(`adapter cannot record ${type}`, 'WORKFLOW_ADAPTER_FACT_FORBIDDEN');
            return journal.append(runId, { type, ...identity, payload });
          },
        })), v2);
      } catch (error) {
        const activeEntry = active.get(activeKey);
        if (activeEntry?.cancellation) {
          try { return await activeEntry.cancellation; } finally { active.delete(activeKey); }
        }
        const current = await journal.load(runId);
        active.delete(activeKey);
        if (!currentIdentity(current, identity)) return appendStale(runId, identity, current, { status: 'failed' });
        return appendUncertain(runId, identity, error?.name === 'AbortError' ? 'transport_ambiguous' : 'receipt_missing');
      }
      const current = await journal.load(runId);
      if (!currentIdentity(current, identity)) {
        active.delete(activeKey);
        return appendStale(runId, identity, current, outcome);
      }
      if (outcome.status === 'uncertain') {
        active.delete(activeKey);
        return appendUncertain(runId, identity, outcome.reasonClass, outcome.observedReceiptRef);
      }
      if (outcome.status === 'failed') {
        /*
         * ⭐ F3-41a (25/09/2026) — un fallimento ritentabile CON la sua prova (v2: ricevuta terminale e consumo durevoli) è un
         *   fallimento, non un effetto incerto: si scrive `activity_failed{retryable:true}` e NON `node_failed` — «An
         *   `activity_failed` does not imply `node_failed`; retry policy may emit `retry_scheduled`» (catalogo §6). Il nodo
         *   resta `running` finché lo scheduler decide: ritentativo o `node_failed`. Senza prova (v1, o ricevuta assente) resta
         *   com'era: incerto, da riconciliare.
         */
        // F3-51a: un passo fermato da «Annulla» chiude come ANNULLATO (col suo consumo, se c'è la prova), mai ritentato
        const annullato = v2 && active.get(activeKey)?.annullamentoChiesto === true;
        const ritentabileProvato = outcome.retryable && v2 && outcome.receiptRef !== null && !annullato;
        if (outcome.retryable && !ritentabileProvato && !(annullato && outcome.receiptRef !== null)) {
          active.delete(activeKey);
          return appendUncertain(runId, identity, 'recovery_unknown');
        }
        let evidenceResultIds;
        try {
          evidenceResultIds = durableResultIds(current, outcome.evidenceResultIds, identity);
        } catch {
          active.delete(activeKey);
          return appendUncertain(runId, identity, 'receipt_missing');
        }
        await journal.append(runId, {
          type: 'activity_failed', ...identity,
          ...(v2 ? { eventSchemaVersion: 2 } : {}),
          payload: {
            errorClass: outcome.errorClass,
            retryable: ritentabileProvato,
            evidenceResultIds,
            ...(v2 ? { receiptRef: outcome.receiptRef, actualUsage: outcome.actualUsage } : {}),
          },
        });
        if (annullato) {
          await journal.append(runId, { type: 'node_cancelled', nodeId, payload: { reason: 'run_cancelled' } });
        } else if (!ritentabileProvato) {
          await journal.append(runId, {
            type: 'node_failed', nodeId,
            payload: { errorClass: outcome.errorClass, evidenceResultIds },
          });
        }
        active.delete(activeKey);
        return Object.freeze({ status: 'failed', ...identity, errorClass: outcome.errorClass, retryable: ritentabileProvato });
      }
      if (node.activityPolicy.effectClass !== 'pure' && outcome.receiptRef === null) {
        active.delete(activeKey);
        return appendUncertain(runId, identity, 'receipt_missing');
      }
      const resultIds = [];
      try {
        for (const draft of outcome.results) {
          const resultRef = await publishResult({ runId, identity: structuredClone(identity), draft });
          requireString(resultRef?.id, 'ResultRef id');
          resultIds.push(resultRef.id);
        }
      } catch {
        active.delete(activeKey);
        return appendUncertain(runId, identity, 'receipt_missing', outcome.receiptRef);
      }
      const afterPublish = await journal.load(runId);
      const activeEntry = active.get(activeKey);
      if (activeEntry?.cancellation) {
        try { return await activeEntry.cancellation; } finally { active.delete(activeKey); }
      }
      let uniqueResultIds;
      try {
        uniqueResultIds = durableResultIds(afterPublish, resultIds, identity, { requireCurrentActivity: true });
      } catch {
        active.delete(activeKey);
        return appendUncertain(runId, identity, 'receipt_missing', outcome.receiptRef);
      }
      if (!currentIdentity(afterPublish, identity)) {
        active.delete(activeKey);
        return appendStale(runId, identity, afterPublish, outcome, uniqueResultIds);
      }
      await journal.append(runId, {
        type: 'activity_completed', ...identity,
        ...(v2 ? { eventSchemaVersion: 2 } : {}),
        payload: {
          resultIds: uniqueResultIds, receiptRef: outcome.receiptRef,
          ...(v2 ? { actualUsage: outcome.actualUsage } : {}),
        },
      });
      await journal.append(runId, {
        type: 'node_succeeded', nodeId,
        payload: { resultIds: uniqueResultIds },
      });
      active.delete(activeKey);
      return Object.freeze({ status: 'completed', ...identity, resultIds: uniqueResultIds });
    };
    try {
      return await corpo();
    } finally {
      segnaFinita();
    }
  }

  async function cancel({ runId, activityExecutionId, reason = 'run_cancelled' } = {}) {
    assertReady();
    requireRunId(runId);
    requireUuid(activityExecutionId, 'activityExecutionId');
    if (reason !== 'run_cancelled') {
      throw activityError('cancellation reason is invalid', 'WORKFLOW_ACTIVITY_INVALID');
    }
    /*
     * ⭐ F3-51a (25/09/2026) — in v2 annullare è CHIEDERE lo stop (l'adattatore ferma la sessione, come lo Stop della chat) e
     *   ASPETTARE: il fatto terminale lo scrive l'esecuzione, con ricevuta e consumo, e il nodo chiude `node_cancelled`. Un
     *   passo finito un attimo prima resta finito col suo risultato (owner 25/09: «i risultati già finiti restano visibili»).
     */
    const viva = active.get(`${runId}/${activityExecutionId}`);
    if (viva?.v2) {
      const prima = await journal.load(runId);
      if (!prima.state.run.cancelRequested) {
        throw activityError('activity cancellation requires durable run_cancel_requested intent', 'WORKFLOW_CANCEL_INTENT_MISSING');
      }
      viva.annullamentoChiesto = true;
      viva.controller.abort(reason);
      try {
        await viva.adapter.cancel(Object.freeze({ runId, ...viva.identity, reason, signal: viva.signal }));
      } catch { /* ciò che è successo lo scrive l'esecuzione */ }
      await viva.finita;
      const dopo = await journal.load(runId);
      return Object.freeze({ status: dopo.state.activities.get(activityExecutionId)?.state ?? 'unknown', ...viva.identity });
    }
    const snapshot = await journal.load(runId);
    const context = operationalContext(snapshot, activityExecutionId);
    if (context.eventSchemaVersion === 2) {
      throw activityError('a v2 activity is cancelled only while it runs here; after a restart it is reconciled', 'WORKFLOW_ACTIVITY_NOT_LIVE');
    }
    if (context.activity.state !== 'started') {
      throw activityError('activity is not cancellable', 'WORKFLOW_ACTIVITY_STATE_INVALID');
    }
    if (!snapshot.state.run.cancelRequested) {
      throw activityError('activity cancellation requires durable run_cancel_requested intent', 'WORKFLOW_CANCEL_INTENT_MISSING');
    }
    const adapter = adapterFor(registry, context.scheduled.activityKind, context.adapterId);
    const activeEntry = active.get(`${runId}/${activityExecutionId}`);
    let finishCancellation;
    let failCancellation;
    if (activeEntry) {
      activeEntry.cancellation = new Promise((resolve, reject) => {
        finishCancellation = resolve;
        failCancellation = reject;
      });
      activeEntry.controller.abort(reason);
    }
    try {
      let outcome;
      try {
        outcome = await adapter.cancel(Object.freeze({ runId, ...context.identity, reason, signal: activeEntry?.signal }));
      } catch {
        outcome = { outcome: 'unknown' };
      }
      if (outcome?.outcome !== 'cancelled') {
        const uncertain = await appendUncertain(runId, context.identity, 'recovery_unknown');
        finishCancellation?.(uncertain);
        return uncertain;
      }
      const evidenceResultIds = Array.isArray(outcome.evidenceResultIds)
        ? durableResultIds(snapshot, outcome.evidenceResultIds, context.identity)
        : [];
      await journal.append(runId, {
        type: 'activity_failed', ...context.identity,
        payload: { errorClass: 'cancelled', retryable: false, evidenceResultIds },
      });
      await journal.append(runId, {
        type: 'node_cancelled', nodeId: context.identity.nodeId,
        payload: { reason },
      });
      const cancelled = Object.freeze({ status: 'cancelled', ...context.identity });
      finishCancellation?.(cancelled);
      return cancelled;
    } catch (error) {
      failCancellation?.(error);
      throw error;
    }
  }

  return Object.freeze({ status, recover, execute, cancel, reconcile });
}
