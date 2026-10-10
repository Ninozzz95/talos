import { createHash, randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute, normalize as normalizePath } from 'node:path';

import { createActivityRunner } from './workflow/activity-runner.mjs';
import {
  WorkflowAdmissionError, assertCapacityAvailable, validateCapacityPolicy,
} from './workflow/admission.mjs';
import {
  aumentoPerFinire,
  releaseBudget as makeBudgetRelease,
  reserveBudget as makeBudgetReservation,
  riservaDelPasso,
  settleBudget as makeBudgetSettlement,
  settleBudgetFromActivity as makeDurableBudgetSettlement,
  WorkflowBudgetError,
  fallitoSenzaConsumoDichiarato,
} from './workflow/budget.mjs';
import { putResultBytes } from './workflow/result-store.mjs';
import { azioniConsentiteDelRun, codaDelRifiuto, motiviDiAttenzioneDelRun, passiFallitiDelRun, rifiutoDelControllo } from './workflow/azioni-del-run.mjs';
import { isValidPersonSummary, isValidStepModelId } from './workflow/contract.mjs';
import { raiseCeilingCommandHash, resolveNodeCommandHash, runControlCommandHash } from './workflow/run-control.mjs';import { STATI_FINALI_DEL_PASSO, STATI_FINALI_DEL_RUN } from './workflow/stati-finali.mjs';
import { aumentoDelTettoPerRiprova, chiusuraConPassiMessiDaParte, workflowStateProjection } from './workflow/run.mjs';
import { decidiDopoFallimento } from './workflow/scheduler.mjs';
import {
  appendEvent, listActiveCapacityClaims, listRunIds, lookupCommandReceipt, readDefinition, readRunState,
  withGlobalAdmission,
} from './workflow/store.mjs';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RESULT_KINDS = new Set(['json', 'text', 'artifact', 'commit', 'test-report', 'patch']);
const RESULT_TRUST = new Set(['untrusted', 'validated', 'deterministic-evidence']);
const RESULT_SENSITIVITY = new Set(['public', 'workspace', 'secret-adjacent']);
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const TERMINAL_NODE_STATES_ORCH = new Set(STATI_FINALI_DEL_PASSO);
const NON_BLOCKING_EDGES_ORCH = new Set(['retry', 'fallback']);
// C3 tappa 2b: `resume-verify` («Riprendi verificando») vale SOLO per un passo incerto: un passo fallito non ha niente da verificare
const AZIONI_SUL_PASSO = new Set(['mark-done', 'set-aside', 'retry-other-model', 'resume-verify']);

export class WorkflowOrchestratorError extends Error {
  constructor(message, code = 'WORKFLOW_ORCHESTRATOR_INVALID', cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowOrchestratorError';
    this.code = code;
  }
}

const orchestratorError = (message, code, cause) => new WorkflowOrchestratorError(message, code, cause);

function plainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function exactKeys(value, required, optional, name) {
  if (!plainObject(value)) throw orchestratorError(`${name} must be a plain object`);
  const accepted = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) throw orchestratorError(`${name} has unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) throw orchestratorError(`${name} is missing field ${key}`);
  }
  return value;
}

function requireRunId(value) {
  if (!UUID_V4.test(value)) throw orchestratorError('runId is invalid', 'WORKFLOW_RUN_ID_INVALID');
  return value;
}

function requireUuid(value, name) {
  if (!UUID_V4.test(value)) throw orchestratorError(`${name} is invalid`, 'WORKFLOW_ORCHESTRATOR_INVALID');
  return value;
}

function requireString(value, name, min, max) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    throw orchestratorError(`${name} is invalid`, 'WORKFLOW_RESULT_INVALID');
  }
  return value;
}

function enqueue(queues, key, operation) {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(key, current.then(() => undefined, () => undefined));
  return current;
}

async function canonicalWorkspaceRoot(value) {
  if (typeof value !== 'string' || value.length === 0 || !isAbsolute(value)) {
    throw new WorkflowAdmissionError('writer workspace root is invalid', 'WORKFLOW_CAPACITY_WORKSPACE_INVALID');
  }
  try {
    const resolved = normalizePath(await realpath(value));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  } catch (error) {
    throw new WorkflowAdmissionError(`writer workspace root cannot be verified: ${error.message}`,
      'WORKFLOW_CAPACITY_WORKSPACE_INVALID');
  }
}

async function canonicalCapacityPolicy(value) {
  validateCapacityPolicy(value);
  const workspace = new Map();
  for (const [root, limit] of value.perWorkspaceWriters) {
    const canonical = await canonicalWorkspaceRoot(root);
    if (workspace.has(canonical) && workspace.get(canonical) !== limit) {
      throw new WorkflowAdmissionError('workspace alias has conflicting hard limits');
    }
    workspace.set(canonical, limit);
  }
  return { ...value, perWorkspaceWriters: workspace };
}

function resultDraft(value) {
  exactKeys(value, [
    'kind', 'contentType', 'bytes', 'summary', 'trust', 'sensitivity',
    'eligibleForIntegration', 'provenance',
  ], [], 'ResultDraft');
  if (!RESULT_KINDS.has(value.kind)) throw orchestratorError('ResultDraft kind is invalid', 'WORKFLOW_RESULT_INVALID');
  requireString(value.contentType, 'ResultDraft contentType', 1, 256);
  if (!(value.bytes instanceof Uint8Array)) throw orchestratorError('ResultDraft bytes are invalid', 'WORKFLOW_RESULT_INVALID');
  requireString(value.summary, 'ResultDraft summary', 0, 4_096);
  if (!RESULT_TRUST.has(value.trust) || !RESULT_SENSITIVITY.has(value.sensitivity)
    || typeof value.eligibleForIntegration !== 'boolean') {
    throw orchestratorError('ResultDraft policy fields are invalid', 'WORKFLOW_RESULT_INVALID');
  }
  if (value.eligibleForIntegration) {
    throw orchestratorError('Phase 5 producers cannot self-authorize integration eligibility', 'WORKFLOW_RESULT_INTEGRATION_FORBIDDEN');
  }
  exactKeys(value.provenance, [
    'workspaceBaselineHash', 'inputHash', 'model', 'provider', 'toolVersions',
  ], [], 'ResultDraft provenance');
  if (value.provenance.workspaceBaselineHash !== null && !SHA256.test(value.provenance.workspaceBaselineHash)) {
    throw orchestratorError('ResultDraft workspaceBaselineHash is invalid', 'WORKFLOW_RESULT_INVALID');
  }
  if (!SHA256.test(value.provenance.inputHash)
    || (value.provenance.model !== null && typeof value.provenance.model !== 'string')
    || (value.provenance.provider !== null && typeof value.provenance.provider !== 'string')
    || !plainObject(value.provenance.toolVersions)) {
    throw orchestratorError('ResultDraft provenance is invalid', 'WORKFLOW_RESULT_INVALID');
  }
  return value;
}

export function createWorkflowOrchestrator({
  store,
  adapters,
  nowFn = () => new Date().toISOString(),
  idFn = randomUUID,
  nestedActivityGateway,
  capacityFn,
  randomFn = Math.random,
} = {}) {
  if (!store || typeof nowFn !== 'function' || typeof idFn !== 'function' || typeof randomFn !== 'function') {
    throw orchestratorError('store, nowFn and idFn are required', 'WORKFLOW_ORCHESTRATOR_COMPOSITION_INVALID');
  }
  if (!Number.isSafeInteger(store.resultLimits?.maxItemBytes) || store.resultLimits.maxItemBytes < 1) {
    throw orchestratorError('store result limits are unavailable', 'WORKFLOW_ORCHESTRATOR_COMPOSITION_INVALID');
  }
  const appendQueues = new Map();
  const operationQueues = new Map();
  const passiInVolo = new Set();
  let runtimeState = 'quarantined';
  let recoveryError = null;

  /*
   * ⭐ F3-41b (25/09/2026) — lo stato del run viene dallo Store (`readRunState`, dalla sua cache verificata quando i segmenti non
   *   sono cambiati) invece di un secondo rigioco qui: il rigioco completo a ogni operazione costava 130-365 ms su ~100 eventi,
   *   ed era la parte più grossa del tempo di un passo. La Definition resta quella approvata, e la sua impronta deve essere la
   *   stessa su cui lo Store ha rigiocato il run.
   */
  async function load(runId) {
    requireRunId(runId);
    const { state, events } = await readRunState(store, { runId });
    const created = events[0];
    if (created?.type !== 'run_created') {
      throw orchestratorError('run has no durable run_created fact', 'WORKFLOW_RUN_NOT_FOUND');
    }
    const definition = await readDefinition(store, {
      workflowId: created.payload.workflowId,
      version: created.payload.definitionVersion,
    });
    if (state.definitionHash !== definition.definitionHash) {
      throw orchestratorError('run Definition hash is inconsistent', 'WORKFLOW_DEFINITION_HASH_MISMATCH');
    }
    return { definition: definition.core, definitionRecord: definition, state, events };
  }

  function requireFact(fact) {
    if (!plainObject(fact) || typeof fact.type !== 'string' || !plainObject(fact.payload)) {
      throw orchestratorError('journal fact is invalid', 'WORKFLOW_ORCHESTRATOR_INVALID');
    }
    return fact;
  }

  async function appendFact(runId, fact) {
    requireRunId(runId);
    requireFact(fact);
    return enqueue(appendQueues, runId, () => appendInQueue(runId, fact));
  }

  /*
   * F3-41b (25/09/2026) — più fatti in UN turno della coda del giornale: nessun altro fatto dello stesso run può entrare fra
   * loro (fence 1 di WFS §8: fra `activity_scheduled` e `activity_started` non passa un `run_cancel_requested`).
   */
  async function appendFacts(runId, facts) {
    requireRunId(runId);
    if (!Array.isArray(facts) || facts.length === 0) throw orchestratorError('journal facts are invalid', 'WORKFLOW_ORCHESTRATOR_INVALID');
    facts.forEach(requireFact);
    return enqueue(appendQueues, runId, async () => {
      const appended = [];
      for (const fact of facts) appended.push(await appendInQueue(runId, fact));
      return appended;
    });
  }

  async function appendInQueue(runId, fact) {
    const snapshot = await load(runId);
    const hasActivity = fact.activityExecutionId !== undefined;
    const eventSchemaVersion = fact.eventSchemaVersion ?? 1;
    if (![1, 2].includes(eventSchemaVersion)) {
      throw orchestratorError('journal fact eventSchemaVersion is invalid', 'WORKFLOW_ORCHESTRATOR_INVALID');
    }
    const event = {
      schema: `talos.workflow-event.v${eventSchemaVersion}`,
      eventSchemaVersion,
      engineSchemaVersion: 1,
      eventId: requireUuid(idFn(), 'eventId'),
      runId,
      seq: snapshot.events.length + 1,
      at: nowFn(),
      type: fact.type,
      nodeId: fact.nodeId ?? null,
      // F3-51a: il PRIMO fatto che accetta un comando porta la sua terna (catalogo §19, «accepted mutating command»)
      commandId: fact.command?.commandId ?? null,
      commandType: fact.command?.commandType ?? null,
      commandPayloadHash: fact.command?.commandPayloadHash ?? null,
      causationId: null,
      correlationId: runId,
      graphVersion: snapshot.state.run.graphVersion,
      activityExecutionId: hasActivity ? fact.activityExecutionId : null,
      attempt: hasActivity ? fact.attempt : null,
      leaseId: hasActivity ? fact.leaseId : null,
      leaseEpoch: hasActivity ? fact.leaseEpoch : null,
      payload: structuredClone(fact.payload),
    };
    return appendEvent(store, { event });
  }

  const journal = Object.freeze({ load, append: appendFact, appendMany: appendFacts });

  async function publishResult({ runId, identity, draft }) {
    requireRunId(runId);
    const accepted = resultDraft(draft);
    const bytes = Buffer.from(accepted.bytes);
    const hex = createHash('sha256').update(bytes).digest('hex');
    const snapshot = await load(runId);
    if (snapshot.state.definitionHash !== snapshot.definitionRecord.definitionHash) {
      throw orchestratorError('run Definition hash is inconsistent', 'WORKFLOW_DEFINITION_HASH_MISMATCH');
    }
    const resultRef = {
      schema: 'talos.workflow-result-ref.v1',
      id: requireUuid(idFn(), 'ResultRef id'),
      sha256: `sha256:${hex}`,
      runId,
      nodeId: identity.nodeId,
      activityExecutionId: identity.activityExecutionId,
      kind: accepted.kind,
      contentType: accepted.contentType,
      bytes: bytes.byteLength,
      storageKey: `${hex.slice(0, 2)}/${hex}`,
      summary: accepted.summary,
      trust: accepted.trust,
      provenance: {
        definitionHash: snapshot.state.definitionHash,
        workspaceBaselineHash: accepted.provenance.workspaceBaselineHash,
        inputHash: accepted.provenance.inputHash,
        model: accepted.provenance.model,
        provider: accepted.provenance.provider,
        toolVersions: structuredClone(accepted.provenance.toolVersions),
        leaseEpoch: identity.leaseEpoch,
      },
      sensitivity: accepted.sensitivity,
      eligibleForIntegration: accepted.eligibleForIntegration,
    };
    const stored = await putResultBytes({
      workflowDataRoot: store.root,
      bytes,
      maxBytes: store.resultLimits.maxItemBytes,
    });
    if (stored.sha256 !== resultRef.sha256) {
      throw orchestratorError('CAS digest does not match ResultRef', 'WORKFLOW_RESULT_CORRUPT');
    }
    await appendFact(runId, {
      type: 'result_recorded',
      ...identity,
      payload: { resultRef },
    });
    return structuredClone(resultRef);
  }

  const activityRunner = createActivityRunner({
    journal,
    adapters,
    publishResult,
    nowFn,
    idFn,
    nestedActivityGateway,
  });

  function status() {
    return Object.freeze({
      state: runtimeState,
      storeState: store.state,
      activityRunner: activityRunner.status(),
      errorCode: recoveryError?.code ?? null,
    });
  }

  function assertReady() {
    if (runtimeState !== 'ready') {
      throw orchestratorError('Workflow runtime recovery is not complete', 'WORKFLOW_RUNTIME_NOT_READY');
    }
  }

  async function recover({ runIds, signal } = {}) {
    if (runtimeState === 'recovering') throw orchestratorError('Workflow recovery is already running', 'WORKFLOW_RECOVERY_IN_PROGRESS');
    if (store.state !== 'ready') {
      throw orchestratorError('Workflow store is not ready', 'WORKFLOW_STORE_NOT_READY');
    }
    const existingRunIds = await listRunIds(store);
    const recoveryRunIds = runIds === undefined ? existingRunIds : runIds;
    if (!Array.isArray(recoveryRunIds)
      || recoveryRunIds.some((runId) => !UUID_V4.test(runId))
      || [...new Set(recoveryRunIds)].sort().join('\n') !== existingRunIds.join('\n')) {
      throw orchestratorError('Workflow recovery scope must include every durable run exactly once', 'WORKFLOW_RECOVERY_SCOPE_INCOMPLETE');
    }
    runtimeState = 'recovering';
    recoveryError = null;
    try {
      await activityRunner.recover({ runIds: recoveryRunIds, signal });
      // C3: un'azione della persona interrotta a metà (fatto decisivo scritto, salti o ripresa no) si completa al riavvio
      for (const runId of recoveryRunIds) await enqueue(operationQueues, runId, () => chiudiDopoLAzione(runId));
      runtimeState = 'ready';
      return status();
    } catch (error) {
      runtimeState = 'needs_attention';
      recoveryError = error;
      throw error;
    }
  }

  async function snapshot({ runId } = {}) {
    const replayed = await load(requireRunId(runId));
    return workflowStateProjection(replayed.state);
  }

  /*
   * ⭐ F3-41b (25/09/2026) — le tre primitive che servono al ciclo dello scheduler:
   *   - `readRun`: lo stato rigiocato del run con la sua Definition e il record della proposta (il modello congelato);
   *   - `startRun`: `run_started`, che lo scheduler scrive dopo il recupero (il comando di avvio lascia il run `prepared`,
   *     ledger F3-31/F3-32): solo da `created`, e solo a runtime pronto;
   *   - `completeRun`: `run_succeeded`, quando ogni passo è soddisfatto e nessuno slot è occupato (lo verifica il riduttore).
   */
  async function readRun({ runId } = {}) {
    return load(requireRunId(runId));
  }

  async function startRun(input = {}) {
    assertReady();
    exactKeys(input, ['runId'], [], 'Run start');
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      // F3-51a: un run annullato prima di partire non parte più
      if (current.state.run.status !== 'created' || current.state.run.cancelRequested) {
        return Object.freeze({ runId, started: false, status: current.state.run.status });
      }
      await appendFact(runId, { type: 'run_started', payload: {} });
      return Object.freeze({ runId, started: true, status: 'running' });
    });
  }

  /*
   * ⭐ F3-51a (25/09/2026) — PAUSA, RIPRENDI, ANNULLA come comandi durevoli (decisioni owner del 25/09: la pausa lascia finire i
   *   passi in corso e non ne avvia di nuovi; l'annullamento li ferma subito). Stessa disciplina di Avvia (`run-control.mjs`,
   *   F3-31): il primo fatto che accetta il comando porta `commandId/commandType/commandPayloadHash` ed È la ricevuta; lo
   *   stesso comando ripetuto (anche dopo un riavvio) risponde con la stessa ricevuta; lo stesso id con un altro contenuto è
   *   un conflitto; un comando rifiutato non consuma il suo id. Qui si scrive solo l'INTENZIONE: il lavoro (drenare,
   *   fermare, chiudere) lo fa lo scheduler, svegliato da chi ha dato il comando, e resiste a un riavvio perché l'intenzione è
   *   nel giornale («Mai usare flag RAM-only per pause/cancel intent», RP §8.3).
   */
  const CONTROLLI_DEL_RUN = Object.freeze({
    pause: Object.freeze({ commandType: 'pause-run', type: 'run_pause_requested' }),
    resume: Object.freeze({ commandType: 'resume-run', type: 'run_resumed' }),
    cancel: Object.freeze({ commandType: 'cancel-run', type: 'run_cancel_requested' }),
    // F3-51b (owner 25/09, «Riprova: rifà solo i passi falliti, tentativi da capo; il tetto si alza, detto prima»)
    retry: Object.freeze({ commandType: 'retry-node', type: 'retry_scheduled' }),
  });
  /*
   * ⛔ A10 (07/10/2026) — `rifiutoDelControllo` vive in `workflow/azioni-del-run.mjs`, insieme alle azioni ammesse: una
   *   regola sola per il rifiuto e per ciò che si dice valido. Il rifiuto porta `allowedActions` e `attentionReasons`
   *   (additivi) e li nomina nel testo, così chi riceve il no sa che cosa può fare adesso e perché il run aspetta.
   */
  const RUN_TERMINALI = new Set(STATI_FINALI_DEL_RUN);
  const rifiutoConAzioni = (motivo, state) => Object.assign(
    orchestratorError(`${motivo}. Nothing was changed.${codaDelRifiuto(state)}`, 'WORKFLOW_RUN_STATE_CONFLICT'),
    { allowedActions: azioniConsentiteDelRun(state), attentionReasons: motiviDiAttenzioneDelRun(state?.run), refusalReason: motivo });

  async function requestRunControl(input = {}) {
    assertReady();
    exactKeys(input, ['runId', 'action', 'commandId'], [], 'Run control');
    const runId = requireRunId(input.runId);
    const controllo = Object.hasOwn(CONTROLLI_DEL_RUN, input.action) ? CONTROLLI_DEL_RUN[input.action] : null;
    if (!controllo) throw orchestratorError('run control action is invalid', 'QUERY_INVALID');
    if (typeof input.commandId !== 'string' || !UUID_V4.test(input.commandId)) throw orchestratorError('commandId must be a v4 UUID', 'QUERY_INVALID');
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      const nato = current.events[0];
      const commandPayloadHash = runControlCommandHash({ commandType: controllo.commandType, workflowId: nato.payload.workflowId,
        version: nato.payload.definitionVersion, runId });
      // la ripetizione PRIMA di ogni controllo di stato: un comando già accettato risponde con la sua ricevuta anche se nel
      // frattempo il run è andato avanti (la pausa chiesta è diventata «in pausa»)
      const prior = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (prior) {
        if (prior.commandType !== controllo.commandType || prior.payloadHash !== commandPayloadHash) {
          throw orchestratorError('commandId is already bound to a different Workflow command', 'WORKFLOW_COMMAND_CONFLICT');
        }
        return Object.freeze({ runId, action: input.action, status: current.state.run.status, receipt: prior, deduplicated: true });
      }
      const rifiuto = rifiutoDelControllo(input.action, current.state.run);
      if (rifiuto) throw rifiutoConAzioni(rifiuto, current.state);
      const command = { commandId: input.commandId, commandType: controllo.commandType, commandPayloadHash };
      if (input.action === 'retry') await scriviRiprova(runId, current, command);
      else await appendFact(runId, { type: controllo.type, payload: { reason: 'user' }, command });
      const receipt = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (!receipt || receipt.runId !== runId || receipt.commandType !== controllo.commandType) {
        throw orchestratorError('the run control command was not durably visible after write', 'WORKFLOW_STORE_NEEDS_ATTENTION');
      }
      const dopo = await load(runId);
      return Object.freeze({ runId, action: input.action, status: dopo.state.run.status, receipt, deduplicated: false });
    });
  }

  /*
   * ⭐ F3-51b (25/09/2026) — i fatti di un «Riprova»: per ogni passo `failed` (in ordine di id) un `retry_scheduled` `user_retry`
   *   sul suo ultimo tentativo, senza attesa, e il timer che lo rimette in gioco; il PRIMO fatto porta il comando ed è la
   *   ricevuta. Se il run era in «Serve attenzione», `run_resumed`. Un passo fallito il cui ultimo tentativo non è ancora
   *   rilasciato e saldato rifiuta tutto il comando (niente a metà): lo scheduler lo sta chiudendo, si riprova fra un attimo.
   */
  const passiDaRiprovare = passiFallitiDelRun; // A10: la stessa lista che decide se `retry` è fra le azioni ammesse

  async function scriviRiprova(runId, current, command) {
    const falliti = passiDaRiprovare(current.state);
    if (falliti.length === 0) throw rifiutoConAzioni('there is no failed step to retry', current.state);
    const piani = falliti.map((nodeId) => {
      const nodeRun = current.state.nodes.get(nodeId);
      const activity = [...current.state.activities.values()].find((candidate) => candidate.nodeId === nodeId && candidate.attempt === nodeRun.attempt);
      const claim = activity ? [...current.state.capacityClaims.values()].find((candidate) => candidate.activityExecutionId === activity.activityExecutionId) : null;
      if (!activity || !['failed', 'reconciled'].includes(activity.state) || claim?.state === 'active'
        || (claim && current.state.budget.reservations.has(claim.budgetReservationId))) {
        throw rifiutoConAzioni(`the failed step "${nodeId}" is still being settled: try again in a moment`, current.state);
      }
      return { nodeId, activity, budgetReservationId: claim?.budgetReservationId ?? null };
    });
    const at = nowFn();
    for (const [indice, { nodeId, activity, budgetReservationId }] of piani.entries()) {
      const retryFactId = `${activity.activityExecutionId}:${activity.attempt}`;
      await appendFact(runId, {
        type: 'retry_scheduled', nodeId,
        payload: {
          schema: 'talos.workflow-retry-fact.v1', runId, nodeId, activityExecutionId: activity.activityExecutionId,
          attempt: activity.attempt, reasonClass: 'user_retry', backoffMs: 0, jitterMs: 0, retryAt: at, budgetReservationId,
        },
        ...(indice === 0 ? { command } : {}),
      });
      await appendFact(runId, {
        type: 'timer_scheduled', nodeId,
        payload: {
          schema: 'talos.workflow-timer-fact.v1', timerId: requireUuid(idFn(), 'timerId'), runId, nodeId, kind: 'retry',
          fireAt: at, causationId: retryFactId, scheduledAt: at,
        },
      });
    }
    if (current.state.run.status === 'needs_attention') await appendFact(runId, { type: 'run_resumed', payload: { reason: 'user' } });
  }

  /** F3-51b — che cosa farebbe «Riprova» adesso, e di quanto alzerebbe il tetto: lo stesso numero che il fatto applicherà. */
  async function retryPreview(input = {}) {
    exactKeys(input, ['runId'], [], 'Retry preview');
    const current = await load(requireRunId(input.runId));
    const nodeIds = passiDaRiprovare(current.state);
    return Object.freeze({ runId: input.runId, nodeIds, ceilingRaise: aumentoDelTettoPerRiprova(current.state.definition, nodeIds) });
  }

  /*
   * ⭐ C3, tappa 1 (09/10/2026, «talos desktop») — LE AZIONI DELLA PERSONA SU UN PASSO FALLITO (decisione owner del 07/10, «come
   *   Hermes»; contratto `C3-CONTRATTO-WORKFLOW-E-DELEGHE-2026-10-07.md` §2-bis):
   *   - `mark-done` «Segna come fatto»: il riassunto della persona diventa il risultato del passo (`result_recorded`, testo,
   *     `trust:'validated'`, nessun modello) e i dipendenti lo leggono. Come Hermes `complete_task` (`kanban_db.py:2731`), un
   *     riassunto vuoto o di soli spazi si rifiuta: una chiusura vuole un'evidenza;
   *   - `set-aside` «Metti da parte»: `node_set_aside`, poi ogni dipendente ancora fermo `node_skipped` `dependency_set_aside`, in
   *     ordine topologico. ⛔ Al contrario di Hermes (`archived` libera i figli): qui i figli NON partono, decisione owner;
   *   - `retry-other-model` «Rifai con un altro modello»: il Riprova di QUEL passo, con il fatto v2 `resume: { mode:'fresh',
   *     modelPolicy }` (Hermes `reassign_task`, «the "this profile's model is broken" path», `kanban_db.py:2602`).
   *   Comando durevole e idempotente come gli altri (`resolve-node`): il fatto DECISIVO porta la terna ed è la ricevuta; lo stesso id
   *   con un altro contenuto è un conflitto; un rifiuto non scrive niente. Solo la PERSONA: `workflow_control` del modello non
   *   arriva qui (contratto §2). Se dopo l'azione non resta nessun passo fallito né altri motivi, il run riparte da sé.
   */
  function ultimoTentativoChiuso(state, nodeId) {
    const nodeRun = state.nodes.get(nodeId);
    const activity = [...state.activities.values()].find((candidate) => candidate.nodeId === nodeId && candidate.attempt === nodeRun.attempt);
    const claim = activity ? [...state.capacityClaims.values()].find((candidate) => candidate.activityExecutionId === activity.activityExecutionId) : null;
    if (!activity || !['failed', 'reconciled'].includes(activity.state) || claim?.state === 'active'
      || (claim && state.budget.reservations.has(claim.budgetReservationId))) return null;
    return { nodeRun, activity, claim, budgetReservationId: claim?.budgetReservationId ?? null };
  }

  /** I dipendenti (transitivi) di `nodeId` ancora fermi, genitori prima dei figli: l'ordine che il riduttore vuole. */
  function dipendentiDaSaltare(state, nodeId) {
    const figli = new Map(state.definition.nodes.map((node) => [node.id, []]));
    for (const edge of state.definition.edges) if (!NON_BLOCKING_EDGES_ORCH.has(edge.type)) figli.get(edge.from)?.push(edge.to);
    const postOrdine = [];
    const visti = new Set([nodeId]);
    const visita = (id) => {
      for (const figlio of [...(figli.get(id) ?? [])].sort()) {
        if (visti.has(figlio)) continue;
        visti.add(figlio);
        visita(figlio);
        postOrdine.push(figlio);
      }
    };
    visita(nodeId);
    return postOrdine.reverse().filter((id) => ['pending', 'blocked', 'ready'].includes(state.nodes.get(id)?.state));
  }

  /*
   * ⭐ C3 — i fatti di un'azione della persona su un passo il cui ultimo tentativo è CHIUSO (posto rilasciato, riserva chiusa): dal
   *   passo fallito (tappa 1, col comando) o dal passo incerto che la persona ha deciso (tappa 2a, senza comando: la ricevuta è
   *   `uncertain_resolved`). Una funzione sola, così le due strade scrivono gli stessi fatti.
   */
  async function compiAzione(runId, nodeId, chiuso, { action, summary = null, model = null }, command = null) {
    const conComando = command ? { command } : {};
    const at = nowFn();
    if (action === 'mark-done') {
      const { activity } = chiuso;
      const ref = await publishResult({ runId,
        identity: { nodeId, activityExecutionId: activity.activityExecutionId, attempt: activity.attempt,
          leaseId: activity.leaseId, leaseEpoch: activity.leaseEpoch },
        draft: { kind: 'text', contentType: 'text/plain; charset=utf-8', bytes: Buffer.from(summary, 'utf8'),
          summary: summary.slice(0, 4_096), trust: 'validated', sensitivity: 'workspace', eligibleForIntegration: false,
          provenance: { workspaceBaselineHash: null, inputHash: `sha256:${createHash('sha256').update(summary, 'utf8').digest('hex')}`,
            model: null, provider: null, toolVersions: {} } } });
      await appendFact(runId, { type: 'node_succeeded', nodeId, payload: { resultIds: [ref.id], by: 'person', summary }, ...conComando });
    } else if (action === 'set-aside') {
      await appendFact(runId, { type: 'node_set_aside', nodeId, payload: { reason: 'user' }, ...conComando });
    } else {
      const { activity, budgetReservationId } = chiuso;
      await appendFact(runId, {
        type: 'retry_scheduled', nodeId,
        payload: {
          schema: 'talos.workflow-retry-fact.v2', runId, nodeId, activityExecutionId: activity.activityExecutionId,
          attempt: activity.attempt, reasonClass: 'user_retry', backoffMs: 0, jitterMs: 0, retryAt: at, budgetReservationId,
          resume: action === 'resume-verify' ? { mode: 'verify', modelPolicy: null }
            : { mode: 'fresh', modelPolicy: { mode: 'explicit', model, reasoning: null } },
        },
        ...conComando,
      });
      await appendFact(runId, {
        type: 'timer_scheduled', nodeId,
        payload: { schema: 'talos.workflow-timer-fact.v1', timerId: requireUuid(idFn(), 'timerId'), runId, nodeId, kind: 'retry',
          fireAt: at, causationId: `${activity.activityExecutionId}:${activity.attempt}`, scheduledAt: at },
      });
    }
  }

  /** C3 tappa 2a — i passi «in verifica» il cui tentativo incerto la persona ha deciso e la cui azione non è ancora compiuta. */
  function passiDecisiInSospeso(state) {
    return [...state.nodes.values()].filter((node) => node.state === 'reconciling'
      && state.activities.get(node.activeActivityExecutionId)?.reconcileOutcome === 'person_resolved')
      .map((node) => node.nodeId).sort();
  }

  /*
   * ⭐ C3 — ciò che segue il fatto decisivo di un'azione della persona, IDEMPOTENTE: (0) l'azione decisa su un passo INCERTO, appena
   *   il suo posto e la sua riserva sono chiusi (tappa 2a; finché non lo sono si aspetta il rilascio, dello scheduler o del comando);
   *   (1) ogni passo che aspetta (anche da lontano) un passo messo da parte e non è ancora fermo si salta (`dependency_set_aside`,
   *   genitori prima); (2) se l'attenzione era solo per passi falliti — o non resta nessun motivo — e non ne resta nessuno, e nessuna
   *   azione è in sospeso, il run riparte. Senza niente da fare non scrive niente.
   *   ⛔ Review avversaria 09/10: col salto scritto SOLO dopo `node_set_aside`, un'interruzione fra i due lasciava il run fermo per
   *   sempre — la ripetizione dello stesso comando trovava la ricevuta e rispondeva «già fatto». Ora la chiamano il comando, la sua
   *   ripetizione, lo scheduler (dopo i rilasci) e il recupero d'avvio. Va chiamata DENTRO la coda delle operazioni del run.
   */
  async function chiudiDopoLAzione(runId) {
    let current = await load(runId);
    if (STATI_FINALI_DEL_RUN.includes(current.state.run.status)) return;
    for (const nodeId of passiDecisiInSospeso(current.state)) {
      const chiuso = ultimoTentativoChiuso(current.state, nodeId);
      if (!chiuso) continue;
      await compiAzione(runId, nodeId, chiuso, chiuso.activity.personAction);
      current = await load(runId);
    }
    const messiDaParte = [...current.state.nodes.values()].filter((node) => node.state === 'set_aside').map((node) => node.nodeId).sort();
    for (const nodeId of messiDaParte) {
      const daSaltare = dipendentiDaSaltare(current.state, nodeId);
      for (const dipendente of daSaltare) {
        await appendFact(runId, { type: 'node_skipped', nodeId: dipendente, payload: { reason: 'dependency_set_aside' } });
      }
      if (daSaltare.length) current = await load(runId);
    }
    const motivi = motiviDiAttenzioneDelRun(current.state.run);
    if (current.state.run.status === 'needs_attention' && motivi.every((motivo) => motivo === 'node_failed')
      && passiFallitiDelRun(current.state).length === 0 && passiDecisiInSospeso(current.state).length === 0) {
      await appendFact(runId, { type: 'run_resumed', payload: { reason: 'user' } });
    }
  }

  /** C3 tappa 2a — per lo scheduler: completa le azioni della persona appena i rilasci lo permettono. */
  async function completaAzioniDellaPersona(input = {}) {
    assertReady();
    exactKeys(input, ['runId'], [], 'Person actions completion');
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, () => chiudiDopoLAzione(runId));
  }

  /*
   * ⭐ C3 tappa 3 (09/10/2026, owner: «quanto serve per finire», «il blocco muto dentro la tappa 3») — IL TETTO DEL RUN.
   *   - `segnalaTettoRaggiunto` (lo scheduler, a passi fermi): un passo pronto non entra nel tetto del run ⇒
   *     `budget_overrun_observed` con la fonte `admission`, e il run va in «Serve attenzione» invece di restare «In corso» per
   *     sempre. Si riverifica qui, nella coda del run: se adesso il passo entra (o il run non è più in corsa) non si scrive niente.
   *   - `ceilingPreview`: la cifra che il pulsante dice PRIMA (`aumentoPerFinire`, la stessa funzione del fatto).
   *   - `raiseCeiling`: comando durevole e idempotente come gli altri; il contenuto è la cifra detta, e se non è più quella di
   *     adesso si rifiuta senza scrivere (la persona deve vedere la cifra che approva). Poi `chiudiDopoLAzione`: se non resta
   *     nessun motivo d'attenzione il run riparte da sé.
   *   ⛔ Solo la persona: il modello non ha questa azione (contratto §2).
   */
  async function segnalaTettoRaggiunto(input = {}) {
    assertReady();
    exactKeys(input, ['runId', 'nodeId', 'dimension'], [], 'Ceiling reached');
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      const { run } = current.state;
      if (run.status !== 'running' || run.cancelRequested || run.pauseRequested || run.needsAttentionReasons.includes('budget_overrun')
        || current.state.nodes.get(input.nodeId)?.state !== 'ready') return Object.freeze({ runId, signalled: false });
      const definition = current.state.definition;
      const step = definition.nodes.find((node) => node.id === input.nodeId);
      const riserva = riservaDelPasso(step, definition);
      const aperte = [...current.state.budget.reservations.values()];
      const observed = {};
      const dimensions = [];
      for (const key of Object.keys(current.state.budget.spent)) {
        observed[key] = current.state.budget.spent[key] + aperte.reduce((somma, r) => somma + (r.reserved[key] ?? 0), 0) + (riserva[key] ?? 0);
        const tetto = definition.budgets?.[key];
        if (tetto !== null && tetto !== undefined && observed[key] > tetto + (current.state.budget.ceilingRaise?.[key] ?? 0)) dimensions.push(key);
      }
      if (dimensions.length === 0) return Object.freeze({ runId, signalled: false });
      await appendFact(runId, { type: 'budget_overrun_observed', nodeId: input.nodeId,
        payload: { reservationId: null, source: 'admission', dimensions, observed } });
      return Object.freeze({ runId, signalled: true, dimensions });
    });
  }

  async function ceilingPreview(input = {}) {
    exactKeys(input, ['runId'], [], 'Ceiling preview');
    const current = await load(requireRunId(input.runId));
    const { amount, nodeIds } = aumentoPerFinire(current.state);
    return Object.freeze({ runId: input.runId, waiting: current.state.run.status === 'needs_attention'
      && current.state.run.needsAttentionReasons.includes('budget_overrun'), amount, nodeIds });
  }

  async function raiseCeiling(input = {}) {
    assertReady();
    exactKeys(input, ['runId', 'commandId', 'amount'], [], 'Ceiling raise');
    const runId = requireRunId(input.runId);
    if (typeof input.commandId !== 'string' || !UUID_V4.test(input.commandId)) throw orchestratorError('commandId must be a v4 UUID', 'QUERY_INVALID');
    const chiavi = ['promptTokens', 'completionTokens', 'wallMs', 'agentSeconds', 'toolCalls', 'modelRequests', 'knownCostUsd'];
    if (!plainObject(input.amount) || Object.keys(input.amount).length !== chiavi.length
      || chiavi.some((key) => typeof input.amount[key] !== 'number' || !Number.isFinite(input.amount[key]) || input.amount[key] < 0
        || (key !== 'knownCostUsd' && !Number.isSafeInteger(input.amount[key])))) {
      throw orchestratorError('amount must have every budget dimension as a nonnegative number', 'QUERY_INVALID');
    }
    const amount = Object.fromEntries(chiavi.map((key) => [key, input.amount[key]]));
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      const nato = current.events[0];
      const commandPayloadHash = raiseCeilingCommandHash({ workflowId: nato.payload.workflowId, version: nato.payload.definitionVersion, runId, amount });
      const esito = (stato, receipt, deduplicated) => Object.freeze({ runId, status: stato.state.run.status, amount, receipt, deduplicated });
      const prior = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (prior) {
        if (prior.commandType !== 'raise-ceiling' || prior.payloadHash !== commandPayloadHash) {
          throw orchestratorError('commandId is already bound to a different Workflow command', 'WORKFLOW_COMMAND_CONFLICT');
        }
        await chiudiDopoLAzione(runId);
        return esito(await load(runId), prior, true);
      }
      const { run } = current.state;
      if (run.cancelRequested || RUN_TERMINALI.has(run.status) || run.status !== 'needs_attention' || !run.needsAttentionReasons.includes('budget_overrun')) {
        throw rifiutoConAzioni('the run is not waiting for a higher budget ceiling', current.state);
      }
      const adesso = aumentoPerFinire(current.state).amount;
      if (chiavi.some((key) => adesso[key] !== amount[key])) {
        throw Object.assign(rifiutoConAzioni('the amount needed has changed since it was shown: look at it again', current.state), { ceilingRaise: adesso });
      }
      await appendFact(runId, { type: 'budget_ceiling_raised', payload: { reason: 'user', amount },
        command: { commandId: input.commandId, commandType: 'raise-ceiling', commandPayloadHash } });
      await chiudiDopoLAzione(runId);
      const receipt = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (!receipt || receipt.runId !== runId || receipt.commandType !== 'raise-ceiling') {
        throw orchestratorError('the ceiling command was not durably visible after write', 'WORKFLOW_STORE_NEEDS_ATTENTION');
      }
      return esito(await load(runId), receipt, false);
    });
  }

  async function resolveFailedStep(input = {}) {
    assertReady();
    exactKeys(input, ['runId', 'nodeId', 'action', 'commandId'], ['summary', 'model'], 'Step resolution');
    const runId = requireRunId(input.runId);
    if (typeof input.nodeId !== 'string' || input.nodeId.length === 0) throw orchestratorError('nodeId is required', 'QUERY_INVALID');
    if (!AZIONI_SUL_PASSO.has(input.action)) throw orchestratorError('step action is invalid', 'QUERY_INVALID');
    if (typeof input.commandId !== 'string' || !UUID_V4.test(input.commandId)) throw orchestratorError('commandId must be a v4 UUID', 'QUERY_INVALID');
    const summary = input.action === 'mark-done' ? input.summary : null;
    const model = input.action === 'retry-other-model' ? input.model : null;
    if (input.action === 'mark-done' && !isValidPersonSummary(summary)) {
      throw orchestratorError('a step marked done needs a summary of what was done (not empty)', 'QUERY_INVALID');
    }
    if (input.action === 'retry-other-model' && !isValidStepModelId(model)) throw orchestratorError('a valid model is required', 'QUERY_INVALID');
    if ((input.action !== 'mark-done' && Object.hasOwn(input, 'summary')) || (input.action !== 'retry-other-model' && Object.hasOwn(input, 'model'))) {
      throw orchestratorError(`"${input.action}" takes no ${Object.hasOwn(input, 'summary') ? 'summary' : 'model'}`, 'QUERY_INVALID');
    }
    const azione = { action: input.action, ...(summary !== null ? { summary } : {}), ...(model !== null ? { model } : {}) };
    let commandPayloadHash = null;
    const esito = (current, receipt, deduplicated) => Object.freeze({ runId, nodeId: input.nodeId, action: input.action,
      status: current.state.run.status, receipt, deduplicated });
    /** La ripetizione PRIMA di ogni controllo di stato: finisce ciò che il primo invio può aver lasciato a metà. */
    const ripetizione = async () => {
      const prior = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (!prior) return null;
      if (prior.commandType !== 'resolve-node' || prior.payloadHash !== commandPayloadHash) {
        throw orchestratorError('commandId is already bound to a different Workflow command', 'WORKFLOW_COMMAND_CONFLICT');
      }
      await chiudiDopoLAzione(runId);
      return esito(await load(runId), prior, true);
    };
    const statoAmmesso = (current) => {
      const rifiuto = rifiutoDelControllo('retry', current.state.run); // stessa regola del Riprova: run in corsa o in attenzione
      if (rifiuto) throw rifiutoConAzioni(rifiuto, current.state);
      if (!current.state.nodes.has(input.nodeId)) throw orchestratorError(`unknown step "${input.nodeId}"`, 'QUERY_INVALID');
    };
    /** Un passo incerto si decide solo quando il sistema ha rinunciato a riconciliarlo (il motivo d'attenzione c'è). */
    const incertoDaDecidere = (current) => {
      const node = current.state.nodes.get(input.nodeId);
      if (node?.state !== 'uncertain' || !node.activeActivityExecutionId) return null;
      const motivo = `activity_uncertain:${node.activeActivityExecutionId}`;
      return motiviDiAttenzioneDelRun(current.state.run).includes(motivo) ? node.activeActivityExecutionId : null;
    };

    /* 0. C3 tappa 5 (09/10/2026, prova dal vivo) — RIPARAZIONE: un passo fallito il cui ultimo tentativo ha lo slot rilasciato ma la
       riserva ancora APERTA (il saldo era fallito: tentativo morto prima della sessione, prima di `failed_before_session`) restava
       «still being settled» per sempre. `releaseAdmission` è idempotente e adesso sa rilasciarla: si completa qui, fuori dalla
       coda come al passo 4. Solo gli errori di BUDGET lasciano la strada di sempre (il rifiuto qui sotto); il resto si rilancia. */
    {
      const prima = await load(runId);
      const nodo = prima.state.nodes.get(input.nodeId);
      const tentativo = nodo?.state === 'failed'
        ? [...prima.state.activities.values()].find((candidate) => candidate.nodeId === input.nodeId && candidate.attempt === nodo.attempt) : null;
      const posto = tentativo ? [...prima.state.capacityClaims.values()].find((candidate) => candidate.activityExecutionId === tentativo.activityExecutionId) : null;
      if (posto?.state === 'released' && prima.state.budget.reservations.has(posto.budgetReservationId)) {
        try { await releaseAdmission({ runId, claimId: posto.claimId }); } catch (errore) { if (!(errore instanceof WorkflowBudgetError)) throw errore; }
      }
    }
    // 1. nella coda del run: ripetizione, passo FALLITO (tappa 1, tutto qui), oppure la strada del passo INCERTO
    const primo = await enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      const nato = current.events[0];
      commandPayloadHash = resolveNodeCommandHash({ workflowId: nato.payload.workflowId, version: nato.payload.definitionVersion, runId,
        nodeId: input.nodeId, action: input.action, summary, model });
      const ripetuto = await ripetizione();
      if (ripetuto) return { fatto: ripetuto };
      statoAmmesso(current);
      const node = current.state.nodes.get(input.nodeId);
      if (node.state === 'failed') {
        if (input.action === 'resume-verify') {
          throw rifiutoConAzioni(`the step "${input.nodeId}" failed: there is nothing to verify, redo it or mark it done`, current.state);
        }
        const chiuso = ultimoTentativoChiuso(current.state, input.nodeId);
        if (!chiuso) throw rifiutoConAzioni(`the failed step "${input.nodeId}" is still being settled: try again in a moment`, current.state);
        await compiAzione(runId, input.nodeId, chiuso, azione, { commandId: input.commandId, commandType: 'resolve-node', commandPayloadHash });
        await chiudiDopoLAzione(runId);
        const receipt = await lookupCommandReceipt(store, { commandId: input.commandId });
        if (!receipt || receipt.runId !== runId || receipt.commandType !== 'resolve-node') {
          throw orchestratorError('the step command was not durably visible after write', 'WORKFLOW_STORE_NEEDS_ATTENTION');
        }
        return { fatto: esito(await load(runId), receipt, false) };
      }
      const incerto = incertoDaDecidere(current);
      if (!incerto) {
        throw rifiutoConAzioni(`the step "${input.nodeId}" has not failed and is not waiting for your decision (it is ${node.state})`, current.state);
      }
      return { incerto };
    });
    if (primo.fatto) return primo.fatto;

    // 2. fuori dalla coda: la sessione del tentativo incerto si ferma e si aspetta chiusa (contratto §2-bis)
    await activityRunner.fermaPerLaPersona({ runId, activityExecutionId: primo.incerto });

    // 3. nella coda: la decisione durevole, che è la ricevuta (lo stato si ricontrolla: nel frattempo può essere cambiato)
    const deciso = await enqueue(operationQueues, runId, async () => {
      const ripetuto = await ripetizione();
      if (ripetuto) return { fatto: ripetuto };
      const current = await load(runId);
      statoAmmesso(current);
      if (incertoDaDecidere(current) !== primo.incerto) {
        throw rifiutoConAzioni(`the step "${input.nodeId}" changed while its session was stopping: look at it again`, current.state);
      }
      const activity = current.state.activities.get(primo.incerto);
      await appendFact(runId, {
        type: 'uncertain_resolved', nodeId: input.nodeId, activityExecutionId: activity.activityExecutionId, attempt: activity.attempt,
        leaseId: activity.leaseId, leaseEpoch: activity.leaseEpoch, payload: { reason: 'user', ...azione },
        command: { commandId: input.commandId, commandType: 'resolve-node', commandPayloadHash },
      });
      return {};
    });
    if (deciso.fatto) return deciso.fatto;

    // 4. posto e riserva, con la stessa via dello scheduler (sotto il lucchetto delle ammissioni)
    const dopoLaDecisione = await load(runId);
    const claim = [...dopoLaDecisione.state.capacityClaims.values()].find((candidate) => candidate.activityExecutionId === primo.incerto);
    if (claim && (claim.state === 'active' || dopoLaDecisione.state.budget.reservations.has(claim.budgetReservationId))) {
      await releaseAdmission({ runId, claimId: claim.claimId });
    }

    // 5. nella coda: l'azione scelta, i salti, la ripresa
    return enqueue(operationQueues, runId, async () => {
      await chiudiDopoLAzione(runId);
      const receipt = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (!receipt || receipt.runId !== runId || receipt.commandType !== 'resolve-node') {
        throw orchestratorError('the step command was not durably visible after write', 'WORKFLOW_STORE_NEEDS_ATTENTION');
      }
      return esito(await load(runId), receipt, false);
    });
  }

  /** F3-51a — la pausa CHIESTA diventa «in pausa» quando nessun effetto è più in corso e nessun posto è occupato. */
  async function completePause(input = {}) {
    assertReady();
    exactKeys(input, ['runId'], [], 'Run pause completion');
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      const { run } = current.state;
      const inCorso = [...current.state.activities.values()].some((activity) => ['scheduled', 'started', 'uncertain'].includes(activity.state));
      const occupati = [...current.state.capacityClaims.values()].some((claim) => claim.state === 'active');
      if (run.status !== 'running' || !run.pauseRequested || run.cancelRequested || inCorso || occupati) {
        return Object.freeze({ runId, paused: false, status: run.status });
      }
      await appendFact(runId, { type: 'run_paused', payload: { reason: 'user' } });
      return Object.freeze({ runId, paused: true, status: 'paused' });
    });
  }

  /*
   * F3-51a — l'annullamento CHIESTO si chiude: i passi che non hanno un effetto in corso si segnano annullati (quelli in corso
   *   li chiude la loro esecuzione, fermata dallo scheduler), e quando nessun effetto è più in corso e nessun posto è occupato
   *   il run diventa «Annullato». I risultati già registrati restano (i fatti non si cancellano).
   */
  async function finishCancel(input = {}) {
    assertReady();
    exactKeys(input, ['runId'], [], 'Run cancel completion');
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      let current = await load(runId);
      if (!current.state.run.cancelRequested || RUN_TERMINALI.has(current.state.run.status)) {
        return Object.freeze({ runId, cancelled: false, status: current.state.run.status });
      }
      const inCorso = (activityExecutionId) => ['scheduled', 'started', 'uncertain']
        .includes(current.state.activities.get(activityExecutionId)?.state);
      for (const node of current.state.nodes.values()) {
        if (TERMINAL_NODE_STATES_ORCH.has(node.state)) continue;
        if (node.activeActivityExecutionId && inCorso(node.activeActivityExecutionId)) continue;
        await appendFact(runId, { type: 'node_cancelled', nodeId: node.nodeId, payload: { reason: 'run_cancelled' } });
      }
      current = await load(runId);
      const ancoraInCorso = [...current.state.activities.values()].some((activity) => ['scheduled', 'started', 'uncertain'].includes(activity.state));
      const occupati = [...current.state.capacityClaims.values()].some((claim) => claim.state === 'active');
      if (ancoraInCorso || occupati) return Object.freeze({ runId, cancelled: false, status: current.state.run.status });
      await appendFact(runId, { type: 'run_cancelled', payload: { reason: 'user' } });
      return Object.freeze({ runId, cancelled: true, status: 'cancelled' });
    });
  }

  async function completeRun(input = {}) {
    assertReady();
    exactKeys(input, ['runId'], [], 'Run completion');
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      if (current.state.run.status !== 'running') return Object.freeze({ runId, completed: false, status: current.state.run.status });
      // i risultati finali sono quelli dei passi da cui nessuno dipende (le foglie del grafo); nessuna integrazione per i passi
      // in sola lettura (catalogo, `run_succeeded`: `{ finalResultIds, integrationCommit }`)
      const conSeguito = new Set(current.state.definition.edges.map((edge) => edge.from));
      const nodi = [...current.state.nodes.values()];
      /*
       * C3 (09/10/2026) — «fatto, con passi messi da parte»: ogni passo è finito o messo da parte dalla persona (con la catena
       *   che lo aspettava saltata). I risultati che restano sono quelli dei passi FINITI che nessun altro passo finito ha letto:
       *   le foglie, più chi stava sopra un passo saltato. Il fatto nomina gli uni e gli altri, come la carta del riepilogo.
       *   `pronto` vuole almeno un passo messo da parte: un run senza resta sulla strada di sempre.
       */
      const chiusura = chiusuraConPassiMessiDaParte(current.state);
      if (chiusura.pronto) {
        const finiti = new Set(nodi.filter((node) => node.state === 'succeeded').map((node) => node.nodeId));
        const lettoDaUnFinito = new Set(current.state.definition.edges
          .filter((edge) => !NON_BLOCKING_EDGES_ORCH.has(edge.type) && finiti.has(edge.to)).map((edge) => edge.from));
        const finalResultIds = [...new Set(nodi.filter((node) => finiti.has(node.nodeId) && !lettoDaUnFinito.has(node.nodeId))
          .flatMap((node) => node.resultRefIds))].sort();
        await appendFact(runId, { type: 'run_succeeded_with_set_aside',
          payload: { finalResultIds, setAsideNodeIds: chiusura.setAsideNodeIds, skippedNodeIds: chiusura.skippedNodeIds } });
        return Object.freeze({ runId, completed: true, status: 'succeeded_with_set_aside', finalResultIds });
      }
      const finalResultIds = [...new Set(nodi
        .filter((node) => !conSeguito.has(node.nodeId)).flatMap((node) => node.resultRefIds))].sort();
      await appendFact(runId, { type: 'run_succeeded', payload: { finalResultIds, integrationCommit: null } });
      return Object.freeze({ runId, completed: true, status: 'succeeded', finalResultIds });
    });
  }

  async function executeNode(input = {}) {
    assertReady();
    const runId = requireRunId(input.runId);
    /*
     * ⭐ F3-41b — «un solo dispatch per passo» (`WFS` sequenza 4): senza la coda lunga, due `executeNode` sullo stesso passo
     *   partirebbero insieme (sul percorso v1 senza capacità il riduttore accetta un secondo `activity_scheduled` su un nodo
     *   `running`). Il secondo si rifiuta subito, con lo stesso codice che prima arrivava dopo la fine del primo.
     */
    const chiavePasso = `${runId}/${typeof input.nodeId === 'string' ? input.nodeId : ''}`;
    if (passiInVolo.has(chiavePasso)) throw orchestratorError('the step already has an activity in flight here', 'WORKFLOW_NODE_NOT_READY');
    passiInVolo.add(chiavePasso);
    try {
      return await eseguiPasso(runId, input);
    } finally {
      passiInVolo.delete(chiavePasso);
    }
  }

  async function eseguiPasso(runId, input) {
    await enqueue(operationQueues, runId, async () => {
      if (typeof capacityFn !== 'function') {
        const current = await load(runId);
        if (current.definition.definitionSchemaVersion >= 2) {
          throw orchestratorError('v2 Workflow execution requires a hard capacity policy', 'WORKFLOW_CAPACITY_POLICY_UNAVAILABLE');
        }
      } else if (!Object.hasOwn(input, 'preparedIdentity')) {
        throw orchestratorError('capacity-controlled execution requires admission identity', 'WORKFLOW_ADMISSION_REQUIRED');
      }
    });
    /*
     * ⭐ F3-41b (25/09/2026) — l'esecuzione NON tiene più la coda del run: la teneva per tutta la durata dell'adattatore, e due
     *   passi indipendenti dello stesso run andavano uno dopo l'altro (`WFS` §7). Tolta DOPO i tre fence di §8 (runner e
     *   riduttore): i fatti restano in fila nella coda del giornale, due passi girano insieme.
     */
    return activityRunner.execute(input);
  }

  async function cancelActivity(input = {}) {
    assertReady();
    requireRunId(input.runId);
    return activityRunner.cancel(input);
  }

  async function reconcileActivity(input = {}) {
    assertReady();
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, () => activityRunner.reconcile(input));
  }

  async function reserveBudget(input = {}) {
    assertReady();
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const replayed = await load(runId);
      const fact = makeBudgetReservation({
        state: replayed.state,
        definition: replayed.state.definition,
        events: replayed.events,
        input,
        at: nowFn(),
      });
      return appendFact(runId, fact);
    });
  }

  async function admitActivity(input = {}) {
    assertReady();
    const runId = requireRunId(input.runId);
    if (typeof capacityFn !== 'function') {
      throw orchestratorError('Workflow hard capacity policy is unavailable', 'WORKFLOW_CAPACITY_POLICY_UNAVAILABLE');
    }
    exactKeys(input, [
      'runId', 'nodeId', 'provider', 'model', 'workspaceRoot',
      'agentSlots', 'writerSlots', 'localProcessSlots', 'reserved',
    ], [], 'Activity admission');
    return withGlobalAdmission(store, async () => {
      assertReady();
      const current = await load(runId);
      if ([...current.state.capacityClaims.values()].some((claim) =>
        claim.state === 'active' && claim.nodeId === input.nodeId)) {
        throw orchestratorError('node already has an active capacity claim', 'WORKFLOW_ADMISSION_DUPLICATE_NODE');
      }
      if ([...current.state.budget.reservations.values()].some((reservation) =>
        reservation.state === 'reserved' && reservation.nodeId === input.nodeId)) {
        throw orchestratorError('node has an unsettled budget reservation', 'WORKFLOW_ADMISSION_RESERVATION_PENDING');
      }
      const nodeRun = current.state.nodes.get(input.nodeId);
      if (nodeRun?.state !== 'ready') {
        throw orchestratorError('node is not ready for admission', 'WORKFLOW_ADMISSION_NODE_NOT_READY');
      }
      const rawPolicy = await capacityFn();
      const policy = await canonicalCapacityPolicy(rawPolicy);
      const workspaceRoot = input.workspaceRoot === null
        ? null : await canonicalWorkspaceRoot(input.workspaceRoot);
      const claim = {
        schema: 'talos.workflow-capacity-claim.v1',
        claimId: requireUuid(idFn(), 'claimId'),
        budgetReservationId: requireUuid(idFn(), 'budgetReservationId'),
        provider: input.provider,
        model: input.model,
        workspaceRoot,
        agentSlots: input.agentSlots,
        writerSlots: input.writerSlots,
        localProcessSlots: input.localProcessSlots,
      };
      const activeClaims = await Promise.all(listActiveCapacityClaims(store).map(async (active) => ({
        ...active,
        workspaceRoot: active.workspaceRoot === null
          ? null : await canonicalWorkspaceRoot(active.workspaceRoot),
      })));
      assertCapacityAvailable({ policy, activeClaims, requested: claim });
      const preparedIdentity = {
        nodeId: input.nodeId,
        activityExecutionId: requireUuid(idFn(), 'activityExecutionId'),
        attempt: nodeRun.attempt + 1,
        leaseId: requireUuid(idFn(), 'leaseId'),
        leaseEpoch: nodeRun.leaseEpoch + 1,
      };
      const reservationInput = {
        reservationId: claim.budgetReservationId,
        runId,
        nodeId: input.nodeId,
        activityExecutionId: preparedIdentity.activityExecutionId,
        leaseId: preparedIdentity.leaseId,
        leaseEpoch: preparedIdentity.leaseEpoch,
        reserved: input.reserved,
      };
      const reservationFact = makeBudgetReservation({
        state: current.state, definition: current.state.definition,
        events: current.events, input: reservationInput, at: nowFn(),
      });
      await appendFact(runId, reservationFact);
      try {
        await appendFact(runId, {
          type: 'capacity_claimed', eventSchemaVersion: 2,
          ...preparedIdentity, payload: claim,
        });
      } catch (error) {
        if (store.state === 'ready') {
          try {
            const after = await load(runId);
            if (!after.state.capacityClaims.has(claim.claimId)
              && after.state.budget.reservations.get(claim.budgetReservationId)?.state === 'reserved') {
              await appendFact(runId, makeBudgetRelease({
                state: after.state, events: after.events,
                reservationId: claim.budgetReservationId, reason: 'not_started',
              }));
            }
          } catch (releaseError) {
            runtimeState = 'needs_attention';
            recoveryError = releaseError;
            throw releaseError;
          }
        }
        throw error;
      }
      return Object.freeze({
        runId, claimId: claim.claimId,
        budgetReservationId: claim.budgetReservationId,
        preparedIdentity: Object.freeze(preparedIdentity),
      });
    });
  }

  async function releaseAdmission(input = {}) {
    assertReady();
    exactKeys(input, ['runId', 'claimId'], [], 'Admission release');
    const runId = requireRunId(input.runId);
    const claimId = requireUuid(input.claimId, 'claimId');
    return withGlobalAdmission(store, async () => {
      assertReady();
      let current = await load(runId);
      const claim = current.state.capacityClaims.get(claimId);
      if (!claim) throw orchestratorError('capacity claim does not exist', 'WORKFLOW_ADMISSION_CLAIM_NOT_FOUND');
      const activity = current.state.activities.get(claim.activityExecutionId);
      const identity = {
        nodeId: claim.nodeId, activityExecutionId: claim.activityExecutionId,
        attempt: claim.attempt, leaseId: claim.leaseId, leaseEpoch: claim.leaseEpoch,
      };
      /*
       * Riparazione D3, 24/09/2026: un'Activity riconciliata «proved_not_performed» non ha
       * effetto né consumo da saldare. La via del contratto esiste (budget.mjs releaseBudget,
       * reason 'reconciled_not_performed') e prima non veniva mai presa: con receiptRef null lo
       * slot restava bloccato per sempre, con receiptRef presente si scriveva capacity_released
       * e poi il saldo falliva (WORKFLOW_BUDGET_PROOF_INVALID) lasciando la riserva appesa.
       * ⇒ Il fatto di rilascio del budget si costruisce e si valida PRIMA di scrivere
       *   capacity_released: se la prova manca non si scrive niente.
       */
      const notPerformed = activity?.state === 'reconciled' && activity.reconcileOutcome === 'proved_not_performed';
      // C3 tappa 2a (decisione owner 09/10): un tentativo incerto DECISO dalla persona si rilascia senza saldo, consumo sconosciuto
      const decisoDallaPersona = activity?.state === 'reconciled' && activity.reconcileOutcome === 'person_resolved';
      /* C3 tappa 5 (09/10/2026, prova dal vivo con glm-5.3-flash): un tentativo FALLITO prima che la sua sessione esistesse (la
         chiave del fornitore mancava all'avvio) non ha consumo né ricevuta: il saldo qui sotto lanciava, la riserva restava
         aperta e il passo «still being settled» per sempre — «Segna come fatto», «Metti da parte», «Rifai» rifiutati. Si
         rilascia con la prova nel giornale (budget.mjs `failed_before_session`), come `spawn_failed` di Hermes. */
      const fallitoPrimaDellaSessione = activity?.state === 'failed'
        && current.state.definition?.nodes?.find((node) => node.id === claim.nodeId)?.kind === 'agent'
        && !current.events.some((event) => event.type === 'agent_session_created' && event.activityExecutionId === claim.activityExecutionId)
        && current.events.some((event) => event.activityExecutionId === claim.activityExecutionId && fallitoSenzaConsumoDichiarato(event));
      const motivoDelRilascio = decisoDallaPersona ? 'person_resolved' : fallitoPrimaDellaSessione ? 'failed_before_session' : 'reconciled_not_performed';
      const senzaSaldo = notPerformed || decisoDallaPersona || fallitoPrimaDellaSessione;
      let notPerformedRelease = null;
      if (senzaSaldo && current.state.budget.reservations.has(claim.budgetReservationId)) {
        notPerformedRelease = makeBudgetRelease({
          state: current.state, events: current.events,
          reservationId: claim.budgetReservationId, reason: motivoDelRilascio,
        });
      }
      if (claim.state === 'active') {
        if (activity && !['completed', 'failed', 'reconciled'].includes(activity.state)) {
          throw orchestratorError('activity effect is not durably terminal', 'WORKFLOW_ADMISSION_EFFECT_UNCERTAIN');
        }
        if (activity?.state === 'reconciled' && activity.receiptRef === null && !notPerformed && !decisoDallaPersona) {
          throw orchestratorError('reconciled activity has no terminal receipt proof', 'WORKFLOW_ADMISSION_EFFECT_UNCERTAIN');
        }
        await appendFact(runId, {
          type: 'capacity_released', eventSchemaVersion: 2, ...identity,
          payload: { claimId, reason: activity ? 'activity_terminal' : 'never_scheduled' },
        });
        current = await load(runId);
      }
      if (current.state.budget.reservations.has(claim.budgetReservationId)) {
        const fact = senzaSaldo
          ? (notPerformedRelease ?? makeBudgetRelease({
            state: current.state, events: current.events,
            reservationId: claim.budgetReservationId, reason: motivoDelRilascio,
          }))
          : activity
          ? makeDurableBudgetSettlement({
            state: current.state, events: current.events,
            reservationId: claim.budgetReservationId,
          })
          : makeBudgetRelease({
            state: current.state, events: current.events,
            reservationId: claim.budgetReservationId, reason: 'not_started',
          });
        await appendFact(runId, fact);
      }
      return Object.freeze({ runId, claimId, state: 'released' });
    });
  }

  async function settleBudget(input = {}) {
    assertReady();
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const replayed = await load(runId);
      if ([...replayed.state.capacityClaims.values()].some((claim) =>
        claim.budgetReservationId === input.reservationId)) {
        throw orchestratorError('claimed Activity must settle from durable usage', 'WORKFLOW_BUDGET_DURABLE_USAGE_REQUIRED');
      }
      const fact = makeBudgetSettlement({
        state: replayed.state,
        reservationId: input.reservationId,
        actual: input.actual,
      });
      return appendFact(runId, fact);
    });
  }

  async function settleBudgetFromActivity(input = {}) {
    assertReady();
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const replayed = await load(runId);
      const fact = makeDurableBudgetSettlement({
        state: replayed.state,
        events: replayed.events,
        reservationId: input.reservationId,
      });
      return appendFact(runId, fact);
    });
  }

  async function releaseBudget(input = {}) {
    assertReady();
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const replayed = await load(runId);
      const fact = makeBudgetRelease({
        state: replayed.state,
        events: replayed.events,
        reservationId: input.reservationId,
        reason: input.reason,
      });
      return appendFact(runId, fact);
    });
  }

  /*
   * ⭐ F3-41a (25/09/2026) — DOPO un tentativo fallito in modo ritentabile e provato, e DOPO il suo rilascio e saldo
   *   (`releaseAdmission`; catalogo §19): ritentativo (`retry_scheduled` + il suo timer) oppure `node_failed`. La decisione è
   *   la funzione pura di `scheduler.mjs`; qui solo i fatti. Un tentativo che non è più il corrente del nodo è VECCHIO:
   *   non si decide niente (può succedere dopo un riavvio, se la decisione era già stata scritta).
   */
  async function decideAfterFailure(input = {}) {
    assertReady();
    exactKeys(input, ['runId', 'activityExecutionId'], [], 'Failure decision');
    const runId = requireRunId(input.runId);
    const activityExecutionId = requireUuid(input.activityExecutionId, 'activityExecutionId');
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      const activity = current.state.activities.get(activityExecutionId);
      // F3-41c: anche un tentativo riconciliato «interrotto» (col suo consumo) o «non eseguito» si decide qui
      const riconciliato = activity?.state === 'reconciled' ? activity.reconcileOutcome : null;
      const interrotto = riconciliato === 'proved_interrupted' || riconciliato === 'proved_not_performed';
      if (!activity || (!interrotto && (activity.state !== 'failed' || activity.retryable !== true))) {
        throw orchestratorError('activity is not a proven retryable failure', 'WORKFLOW_RETRY_NOT_APPLICABLE');
      }
      const nodeRun = current.state.nodes.get(activity.nodeId);
      if (nodeRun?.activeActivityExecutionId !== activityExecutionId || nodeRun.state !== (interrotto ? 'reconciling' : 'running')) {
        return Object.freeze({ runId, nodeId: activity.nodeId, decision: 'stale' });
      }
      const claim = [...current.state.capacityClaims.values()].find((candidate) => candidate.activityExecutionId === activityExecutionId);
      if (claim?.state === 'active' || (claim && current.state.budget.reservations.has(claim.budgetReservationId))) {
        throw orchestratorError('the failed attempt must be released and settled first', 'WORKFLOW_RETRY_ATTEMPT_NOT_SETTLED');
      }
      const failed = interrotto ? null : [...current.events].reverse().find((event) => event.type === 'activity_failed'
        && event.activityExecutionId === activityExecutionId);
      const errorClass = interrotto ? 'process_exit' : failed.payload.errorClass;
      const step = current.definition.nodes.find((node) => node.id === activity.nodeId);
      const at = nowFn();
      const decision = decidiDopoFallimento({
        step, oraIso: at, casuale: randomFn,
        fallito: {
          // F3-51b: dopo un Riprova i tentativi ripartono da capo — si contano da quello da cui il passo è ripartito
          attempt: activity.attempt - (nodeRun.attemptBase ?? 0), errorClass, retryable: true,
          interrotto: riconciliato === 'proved_interrupted', nonEseguito: riconciliato === 'proved_not_performed',
        },
      });
      if (decision.azione === 'fallisci') {
        await appendFact(runId, {
          type: 'node_failed', nodeId: activity.nodeId,
          payload: { errorClass, evidenceResultIds: failed?.payload.evidenceResultIds ?? [] },
        });
        return Object.freeze({ runId, nodeId: activity.nodeId, decision: 'failed', reason: decision.motivo });
      }
      const retryFactId = `${activityExecutionId}:${activity.attempt}`;
      await appendFact(runId, {
        type: 'retry_scheduled', nodeId: activity.nodeId,
        payload: {
          schema: 'talos.workflow-retry-fact.v1', runId, nodeId: activity.nodeId, activityExecutionId,
          attempt: activity.attempt, reasonClass: decision.reasonClass, backoffMs: decision.backoffMs,
          jitterMs: decision.jitterMs, retryAt: decision.retryAt, budgetReservationId: claim?.budgetReservationId ?? null,
        },
      });
      const timerId = requireUuid(idFn(), 'timerId');
      await appendFact(runId, {
        type: 'timer_scheduled', nodeId: activity.nodeId,
        payload: {
          schema: 'talos.workflow-timer-fact.v1', timerId, runId, nodeId: activity.nodeId, kind: 'retry',
          fireAt: decision.retryAt, causationId: retryFactId, scheduledAt: at,
        },
      });
      return Object.freeze({ runId, nodeId: activity.nodeId, decision: 'retry', retryAt: decision.retryAt, timerId });
    });
  }

  /** F3-41a — accende i timer dei ritentativi già scaduti di un run: il nodo torna in gioco solo col fatto `timer_fired`. */
  async function fireDueRetryTimers(input = {}) {
    assertReady();
    exactKeys(input, ['runId'], [], 'Retry timers');
    const runId = requireRunId(input.runId);
    return enqueue(operationQueues, runId, async () => {
      const current = await load(runId);
      const now = Date.parse(nowFn());
      const due = [...current.state.timers.entries()]
        .filter(([key, timer]) => key === timer.timerId && timer.kind === 'retry' && timer.status === 'scheduled'
          && Date.parse(timer.fireAt) <= now)
        .map(([, timer]) => timer)
        .sort((left, right) => left.fireAt.localeCompare(right.fireAt, 'en') || left.timerId.localeCompare(right.timerId, 'en'));
      for (const timer of due) {
        await appendFact(runId, {
          type: 'timer_fired', nodeId: timer.nodeId,
          payload: { timerId: timer.timerId, scheduledAt: timer.scheduledAt, fireAt: timer.fireAt, targetKind: 'retry', targetId: timer.causationId },
        });
      }
      return Object.freeze({ runId, fired: due.map((timer) => timer.timerId) });
    });
  }

  return Object.freeze({
    status,
    recover,
    snapshot,
    readRun,
    startRun,
    completeRun,
    requestRunControl,
    retryPreview,
    resolveFailedStep,
    completaAzioniDellaPersona,
    segnalaTettoRaggiunto,
    ceilingPreview,
    raiseCeiling,
    completePause,
    finishCancel,
    decideAfterFailure,
    fireDueRetryTimers,
    executeNode,
    cancelActivity,
    reconcileActivity,
    reserveBudget,
    admitActivity,
    releaseAdmission,
    settleBudget,
    settleBudgetFromActivity,
    releaseBudget,
  });
}
