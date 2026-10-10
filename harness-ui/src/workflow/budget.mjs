import { passoFinito } from './stati-finali.mjs';

const DIMENSIONS = Object.freeze([
  'promptTokens', 'completionTokens', 'wallMs', 'agentSeconds',
  'toolCalls', 'modelRequests', 'knownCostUsd',
]);
const INTEGER_DIMENSIONS = DIMENSIONS.filter((key) => key !== 'knownCostUsd');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RELEASE_REASONS = new Set([
  'not_started', 'cancelled_before_effect', 'fallback_transfer', 'reconciled_not_performed',
  // C3 tappa 2 (09/10/2026, decisione owner): un tentativo INCERTO deciso dalla persona si rilascia, consumo sconosciuto
  'person_resolved',
  // C3 tappa 5 (09/10/2026, prova dal vivo): un tentativo fallito PRIMA che la sua sessione esistesse non ha speso niente
  'failed_before_session',
]);

export class WorkflowBudgetError extends Error {
  constructor(message, code = 'WORKFLOW_BUDGET_INVALID') {
    super(message);
    this.name = 'WorkflowBudgetError';
    this.code = code;
  }
}

const fail = (message, code, dettagli = null) => { throw Object.assign(new WorkflowBudgetError(message, code), dettagli ?? {}); };

/* Le voci che un tentativo riserva dal budget del passo (il costo a parte: si riserva solo se il passo lo dichiara). */
const DIMENSIONI_DELLA_RISERVA = Object.freeze(['promptTokens', 'completionTokens', 'wallMs', 'agentSeconds', 'toolCalls', 'modelRequests']);

/**
 * Owner 25/09 «budget pieno a ogni tentativo»: ogni tentativo riserva il budget del passo (con zeri, il consumo vero è un overrun).
 * C3 tappa 3 (09/10/2026): spostata qui da `scheduler.mjs` — la usano lo scheduler (la riserva vera) e `aumentoPerFinire` (la
 * cifra detta prima): due copie direbbero due numeri diversi per lo stesso passo.
 */
export function riservaDelPasso(step, definition) {
  const riserva = {};
  for (const chiave of DIMENSIONI_DELLA_RISERVA) riserva[chiave] = step.budget?.[chiave] ?? definition.budgets?.[chiave] ?? 0;
  riserva.knownCostUsd = step.budget?.knownCostUsd ?? null;
  return riserva;
}

/**
 * ⭐ C3 tappa 3 (09/10/2026, decisione owner: «quanto serve per finire») — di quanto il tetto del run deve crescere perché i passi
 *   rimasti possano partire. Per ogni voce con un tetto: speso + riserve aperte + una riserva per ogni passo non finito che non
 *   ne ha già una aperta − tetto di adesso (con gli aumenti già concessi), mai sotto zero. È una STIMA dichiarata: suppone che
 *   ogni passo rimasto spenda la sua riserva una volta (un ritentativo automatico ne vorrebbe un'altra). Una voce senza tetto
 *   del run non cresce. La stessa funzione dà l'anteprima sul pulsante e la cifra scritta nel fatto `budget_ceiling_raised`.
 */
export function aumentoPerFinire(state) {
  const definition = state.definition;
  const aperte = [...state.budget.reservations.values()];
  const conRiserva = new Set(aperte.map((riserva) => riserva.nodeId));
  const rimasti = [...state.nodes.values()].filter((node) => !passoFinito(node.state) && !conRiserva.has(node.nodeId));
  const riserve = rimasti.map((node) => riservaDelPasso(definition.nodes.find((candidate) => candidate.id === node.nodeId) ?? {}, definition));
  const aumento = {};
  for (const key of DIMENSIONS) {
    const tetto = definition.budgets?.[key];
    if (tetto === null || tetto === undefined) { aumento[key] = 0; continue; }
    const servono = state.budget.spent[key]
      + aperte.reduce((somma, riserva) => somma + (riserva.reserved[key] ?? 0), 0)
      + riserve.reduce((somma, riserva) => somma + (riserva[key] ?? 0), 0);
    const mancano = servono - (tetto + (state.budget.ceilingRaise?.[key] ?? 0));
    aumento[key] = mancano > 0 ? mancano : 0;
  }
  return { amount: aumento, nodeIds: rimasti.map((node) => node.nodeId).sort() };
}

function exactObject(value, keys, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    fail(`${name} must have exactly the required keys`, 'WORKFLOW_BUDGET_MEASUREMENT_INVALID');
  }
}

function measurement(value, name) {
  exactObject(value, DIMENSIONS, name);
  for (const key of INTEGER_DIMENSIONS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) {
      fail(`${name}.${key} must be a nonnegative safe integer`, 'WORKFLOW_BUDGET_MEASUREMENT_INVALID');
    }
  }
  if (value.knownCostUsd !== null
    && (!Number.isFinite(value.knownCostUsd) || value.knownCostUsd < 0)) {
    fail(`${name}.knownCostUsd must be finite, nonnegative or null`, 'WORKFLOW_BUDGET_MEASUREMENT_INVALID');
  }
  return structuredClone(value);
}

export function validateMeasuredUsage(value) {
  return measurement(value, 'actualUsage');
}

function uuid(value, name) {
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    fail(`${name} must be a UUIDv4`, 'WORKFLOW_BUDGET_IDENTITY_INVALID');
  }
}

function activeReservation(state, reservationId) {
  const reservation = state?.budget?.reservations?.get(reservationId);
  if (!reservation) fail('active budget reservation does not exist', 'WORKFLOW_BUDGET_RESERVATION_NOT_FOUND');
  return reservation;
}

function budgetCeiling(definition, nodeId, key) {
  const node = definition.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) fail('budget node does not exist', 'WORKFLOW_BUDGET_NODE_NOT_READY');
  return { run: definition.budgets[key], node: node.budget[key] };
}

export function reserveBudget({ state, definition, events, input, at } = {}) {
  if (!state || !definition || !Array.isArray(events) || !input || typeof input !== 'object') {
    fail('replayed state, current Definition, journal and request are required', 'WORKFLOW_BUDGET_INVALID');
  }
  for (const key of ['reservationId', 'runId', 'activityExecutionId', 'leaseId']) uuid(input[key], key);
  if (typeof input.nodeId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(input.nodeId)
    || !Number.isSafeInteger(input.leaseEpoch) || input.leaseEpoch < 0
    || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) {
    fail('reservation identity or timestamp is invalid', 'WORKFLOW_BUDGET_IDENTITY_INVALID');
  }
  if (input.runId !== state.run.runId || definition !== state.definition) {
    fail('reservation does not match the replayed run/Definition', 'WORKFLOW_BUDGET_STATE_INVALID');
  }
  if (state.run.status !== 'running' || !state.run.schedulingEnabled
    || state.run.pauseRequested || state.run.cancelRequested) {
    fail('run is not schedulable', 'WORKFLOW_BUDGET_RUN_NOT_SCHEDULABLE');
  }
  if (state.nodes.get(input.nodeId)?.state !== 'ready') {
    fail('node is not ready', 'WORKFLOW_BUDGET_NODE_NOT_READY');
  }
  if (events.some((event) => event.type === 'budget_reserved'
    && (event.payload.reservationId === input.reservationId
      || event.payload.activityExecutionId === input.activityExecutionId
      || event.payload.leaseId === input.leaseId))
    || state.budget.reservations.has(input.reservationId)
    || state.activities.has(input.activityExecutionId)
    || state.leases.has(input.leaseId)
    || [...state.budget.reservations.values()].some((reservation) =>
      reservation.activityExecutionId === input.activityExecutionId
      || reservation.leaseId === input.leaseId)) {
    fail('reservation, activity or lease identity already exists', 'WORKFLOW_BUDGET_DUPLICATE');
  }
  const reserved = measurement(input.reserved, 'reserved');
  for (const key of DIMENSIONS) {
    const ceiling = budgetCeiling(definition, input.nodeId, key);
    if (key === 'knownCostUsd' && reserved[key] === null
      && (ceiling.run !== null || ceiling.node !== null)) {
      fail('unknown cost cannot consume a known monetary ceiling', 'WORKFLOW_BUDGET_UNKNOWN_COST');
    }
    if (ceiling.node !== null && reserved[key] !== null && reserved[key] > ceiling.node) {
      fail(`${key} exceeds node ceiling`, 'WORKFLOW_BUDGET_EXCEEDED');
    }
    if (ceiling.run === null) continue;
    const spent = state.budget.spent[key];
    const active = [...state.budget.reservations.values()].reduce(
      (sum, reservation) => sum + (reservation.reserved[key] ?? 0), 0,
    );
    const total = spent + active + (reserved[key] ?? 0);
    // F3-51b: il tetto del run cresce di quanto un Riprova ha concesso (fatto `retry_scheduled` `user_retry`, `run.mjs`)
    const tettoDelRun = ceiling.run + (state.budget.ceilingRaise?.[key] ?? 0);
    if (!Number.isFinite(total) || total > tettoDelRun) {
      // C3 tappa 3: chi riceve il no sa che è il tetto del RUN (lo alza la persona), non quello del passo
      fail(`${key} exceeds run ceiling`, 'WORKFLOW_BUDGET_EXCEEDED', { scope: 'run', dimension: key, observed: total });
    }
  }
  return {
    type: 'budget_reserved', nodeId: input.nodeId,
    payload: {
      schema: 'talos.workflow-budget-reservation.v1',
      reservationId: input.reservationId, runId: input.runId,
      nodeId: input.nodeId, activityExecutionId: input.activityExecutionId,
      leaseId: input.leaseId, leaseEpoch: input.leaseEpoch,
      reserved, state: 'reserved', actual: null,
      reservedAt: at, settledAt: null,
    },
  };
}

export function settleBudget({ state, reservationId, actual } = {}) {
  uuid(reservationId, 'reservationId');
  const reservation = activeReservation(state, reservationId);
  const measured = measurement(actual, 'actual');
  const ceiling = budgetCeiling(state.definition, reservation.nodeId, 'knownCostUsd');
  if (measured.knownCostUsd === null && (ceiling.run !== null || ceiling.node !== null)) {
    fail('actual cost is unknown under a monetary ceiling', 'WORKFLOW_BUDGET_UNKNOWN_COST');
  }
  const overrunDimensions = DIMENSIONS.filter((key) => {
    const actualValue = measured[key];
    const reservedValue = reservation.reserved[key];
    return actualValue !== null && reservedValue !== null && actualValue > reservedValue;
  });
  return {
    type: 'budget_settled', nodeId: reservation.nodeId,
    payload: { reservationId, actual: measured, overrunDimensions },
  };
}

export function settleBudgetFromActivity({ state, events, reservationId } = {}) {
  uuid(reservationId, 'reservationId');
  const reservation = activeReservation(state, reservationId);
  if (!Array.isArray(events) || reservation.runId !== state?.run?.runId) {
    fail('verified journal and matching replayed run are required', 'WORKFLOW_BUDGET_PROOF_INVALID');
  }
  const claims = [...(state.capacityClaims?.values() ?? [])].filter((claim) =>
    claim.budgetReservationId === reservationId);
  if (claims.length !== 1) fail('exactly one durable capacity claim is required', 'WORKFLOW_BUDGET_PROOF_INVALID');
  const [claim] = claims;
  if (claim.state !== 'released') fail('capacity claim is still active', 'WORKFLOW_BUDGET_CLAIM_ACTIVE');
  const sameIdentity = (event) => event.runId === reservation.runId
    && event.nodeId === reservation.nodeId
    && event.activityExecutionId === reservation.activityExecutionId
    && event.leaseId === reservation.leaseId
    && event.leaseEpoch === reservation.leaseEpoch
    && event.attempt === claim.attempt;
  if (claim.runId !== reservation.runId || claim.nodeId !== reservation.nodeId
    || claim.activityExecutionId !== reservation.activityExecutionId
    || claim.leaseId !== reservation.leaseId || claim.leaseEpoch !== reservation.leaseEpoch) {
    fail('capacity claim does not match budget reservation', 'WORKFLOW_BUDGET_PROOF_INVALID');
  }
  const scheduled = events.filter((event) => event.type === 'activity_scheduled'
    && sameIdentity(event) && event.eventSchemaVersion === 2
    && event.payload.budgetReservationId === reservationId);
  const released = events.filter((event) => event.type === 'capacity_released'
    && sameIdentity(event) && event.eventSchemaVersion === 2
    && event.payload.claimId === claim.claimId && event.payload.reason === 'activity_terminal');
  const terminals = events.filter((event) => ['activity_completed', 'activity_failed', 'activity_reconciled'].includes(event.type)
    && sameIdentity(event) && event.eventSchemaVersion === 2
    // F3-41c: anche un tentativo provato INTERROTTO porta ricevuta e consumo misurato, e si salda (owner 25/09: «contano»)
    && (event.type !== 'activity_reconciled' || ['proved_completed', 'proved_interrupted'].includes(event.payload.outcome)));
  const activity = state.activities?.get(reservation.activityExecutionId);
  if (scheduled.length !== 1 || released.length !== 1 || terminals.length !== 1
    || !activity || !['completed', 'failed', 'reconciled'].includes(activity.state)
    || activity.leaseId !== reservation.leaseId || activity.leaseEpoch !== reservation.leaseEpoch
    || activity.attempt !== claim.attempt
    || (terminals[0].type === 'activity_reconciled' && activity.state !== 'reconciled')) {
    fail('durable Activity, release and reservation proofs do not match', 'WORKFLOW_BUDGET_PROOF_INVALID');
  }
  const terminal = terminals[0];
  if (activity.effectClass !== 'pure' && terminal.payload.receiptRef === null) {
    fail('a durable provider receipt is required', 'WORKFLOW_BUDGET_RECEIPT_MISSING');
  }
  if (terminal.payload.actualUsage === null || terminal.payload.actualUsage === undefined) {
    fail('durable actual usage is unknown', 'WORKFLOW_BUDGET_USAGE_UNKNOWN');
  }
  return settleBudget({ state, reservationId, actual: terminal.payload.actualUsage });
}

/** Un `activity_failed` v2 che DICHIARA consumo e ricevuta assenti (le chiavi ci sono e valgono null). */
export function fallitoSenzaConsumoDichiarato(event) {
  return event?.type === 'activity_failed' && event.eventSchemaVersion === 2
    && Object.hasOwn(event.payload ?? {}, 'actualUsage') && event.payload.actualUsage === null
    && Object.hasOwn(event.payload ?? {}, 'receiptRef') && event.payload.receiptRef === null;
}

export function releaseBudget({ state, events, reservationId, reason } = {}) {
  uuid(reservationId, 'reservationId');
  const reservation = activeReservation(state, reservationId);
  if (!RELEASE_REASONS.has(reason) || !Array.isArray(events)) {
    fail('release reason or journal is invalid', 'WORKFLOW_BUDGET_RELEASE_INVALID');
  }
  const activity = state.activities.get(reservation.activityExecutionId);
  if (reason === 'reconciled_not_performed') {
    const proved = events.some((event) => event.type === 'activity_reconciled'
      && event.activityExecutionId === reservation.activityExecutionId
      && event.payload.outcome === 'proved_not_performed');
    if (!proved || activity?.state !== 'reconciled') {
      fail('no durable proof that the effect was not performed', 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED');
    }
  } else if (reason === 'person_resolved') {
    // la prova è la decisione DUREVOLE della persona (`uncertain_resolved`), non un effetto escluso: i token restano sconosciuti
    const deciso = events.some((event) => event.type === 'uncertain_resolved'
      && event.activityExecutionId === reservation.activityExecutionId);
    if (!deciso || activity?.state !== 'reconciled' || activity.reconcileOutcome !== 'person_resolved') {
      fail('no durable decision of the person on this attempt', 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED');
    }
  } else if (reason === 'failed_before_session') {
    /* la prova: il tentativo è FALLITO, la sua sessione non è mai nata (nessun `agent_session_created`) e il fallimento non
       porta né consumo né ricevuta ⇒ nessuna richiesta è arrivata al fornitore. Hermes lo chiama `spawn_failed`. */
    const sessione = events.some((event) => event.type === 'agent_session_created'
      && event.activityExecutionId === reservation.activityExecutionId);
    const fallito = events.filter((event) => event.type === 'activity_failed'
      && event.activityExecutionId === reservation.activityExecutionId);
    /* review Y2 del bugfixer: «nessuna sessione ⇒ nessuna richiesta al fornitore» vale per l'adattatore AGENTE, e solo su un fatto
       v2 che DICHIARA consumo e ricevuta assenti (in v1 le chiavi mancano: `== null` le avrebbe prese per vuote) */
    const passo = state.definition?.nodes?.find((node) => node.id === reservation.nodeId);
    if (sessione || activity?.state !== 'failed' || fallito.length !== 1 || passo?.kind !== 'agent'
      || !fallitoSenzaConsumoDichiarato(fallito[0])) {
      fail('no durable proof that the attempt failed before its session', 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED');
    }
  } else if (activity) {
    fail('scheduled activity has no durable no-effect proof', 'WORKFLOW_BUDGET_EFFECT_NOT_EXCLUDED');
  }
  return {
    type: 'budget_released', nodeId: reservation.nodeId,
    payload: { reservationId, reason },
  };
}
