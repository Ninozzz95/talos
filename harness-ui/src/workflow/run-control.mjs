import { randomUUID } from 'node:crypto';

import { canonicalHash } from './canonical-json.mjs';
import { createRun, listDefinitionsForSession, lookupCommandReceipt, readDefinition, readDefinitionApproval, withGlobalAdmission } from './store.mjs';

/*
 * ⭐ F3-31 (25/09/2026) — il comando di AVVIO di un Workflow, senza HTTP (la rotta arriva con F3-51, dopo lo scheduler).
 *
 * Il contratto è quello già scritto (RP §8.2, `docs/WORKFLOW-IMPLEMENTATION-RESUME-PROMPT-v1-2026-09-20.md:493-522`):
 *   il PRIMO fatto di dominio che accetta il comando porta la terna `commandId / commandType / commandPayloadHash` — qui è
 *   `run_created`, e `contract.mjs:1069` lo pretende. Quel fatto È la ricevuta: `lookupCommandReceipt` la ritrova nel
 *   giornale, quindi ripetere lo stesso comando (anche dopo un riavvio) risolve sempre lo STESSO run, e un comando respinto
 *   prima di scrivere non consuma il suo id. Stessa forma di Hermes (`gateway/platforms/api_server_runs.py:420-428`, letto il
 *   25/09/2026): la ripetizione restituisce il run originale, la stessa chiave con un altro contenuto è un conflitto.
 *
 * Decisioni owner: 5 (Avvia è un passo SEPARATO dopo Approva), 1 (in questa fase i passi sono in sola lettura), 44 (più run
 *   della stessa Definition sono ammessi: un comando nuovo è un run nuovo). Un run appena nato è PREPARATO (`created` nel
 *   riduttore): nessun `run_started`, nessun passo in corso — chi lo guarda non deve vedere lavoro che non c'è.
 *
 * ⛔ Si rifiuta PRIMA di `run_created` ciò che nessuno sa ancora eseguire: un tipo di passo senza adattatore, o un passo che
 *   scrive. L'elenco dei tipi eseguibili lo dà chi compone il server (gli adattatori di F3-32); senza elenco non parte niente.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const READ_ONLY_PROFILE = 'read';

export class WorkflowRunControlError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowRunControlError';
    this.code = code;
  }
}

function fail(message, code, cause) { throw new WorkflowRunControlError(message, code, cause); }

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** SHA-256(JCS(CommandDedupProjection)) for `start-run`: the commandId is excluded (RP §8.2, golden in `command-dedupe-v1.json`). */
export function startCommandHash({ workflowId, version, definitionHash } = {}) {
  return canonicalHash({
    schema: 'talos.workflow-command-dedupe.v1',
    commandType: 'start-run',
    target: { workflowId, definitionVersion: version, runId: null, nodeId: null, requestId: null },
    payload: { definitionHash },
  });
}

/**
 * F3-51a (25/09/2026) — la stessa proiezione per i comandi del RUN (`pause-run`, `resume-run`, `cancel-run`): il bersaglio è il
 * run (e la Definition che esegue), il contenuto è vuoto — «pausa» non ha parametri. `commandId` escluso, come sopra.
 */
export function runControlCommandHash({ commandType, workflowId, version, runId } = {}) {
  return canonicalHash({
    schema: 'talos.workflow-command-dedupe.v1',
    commandType,
    target: { workflowId, definitionVersion: version, runId, nodeId: null, requestId: null },
    payload: {},
  });
}

function refuseUnrunnable(core, supportedNodeKinds) {
  // ⛔ Dopo la ripetizione, mai prima: un comando già accettato risponde col suo run anche se oggi gli adattatori mancano.
  if (supportedNodeKinds.length === 0) fail('No Workflow step adapter is available on this server. Nothing was started.', 'WORKFLOW_START_UNSUPPORTED');
  const eseguibili = new Set(supportedNodeKinds);
  const tipi = core.nodes.filter((node) => !eseguibili.has(node.kind)).slice(0, 10).map((node) => `"${node.id}" (${node.kind})`);
  if (tipi.length) fail(`These steps cannot run yet: ${tipi.join(', ')}. Nothing was started.`, 'WORKFLOW_START_UNSUPPORTED');
  const scrittori = core.nodes.filter((node) => node.capabilityProfile !== READ_ONLY_PROFILE).slice(0, 10).map((node) => `"${node.id}"`);
  if (scrittori.length) fail(`These steps would write (${scrittori.join(', ')}); in this phase a Workflow runs read-only steps only. Nothing was started.`,
    'WORKFLOW_START_UNSUPPORTED');
}

/**
 * Start an approved Workflow Definition: exactly one durable `run_created` per commandId.
 * @param {object} store
 * @param {{workflowId: string, version: number, definitionHash: string, commandId: string}} input
 * @param {{sessionExistsFn: Function, supportedNodeKinds: string[], nowFn?: Function, runIdFn?: Function}} deps
 */
export async function startWorkflowRun(store, input, { sessionExistsFn, supportedNodeKinds, nowFn = () => new Date().toISOString(),
  runIdFn = randomUUID } = {}) {
  if (!plainObject(input) || Object.keys(input).length !== 4
    || !['workflowId', 'version', 'definitionHash', 'commandId'].every((key) => Object.hasOwn(input, key))) {
    fail('Workflow start request shape is invalid', 'QUERY_INVALID');
  }
  const { workflowId, version, definitionHash, commandId } = input;
  if (!UUID.test(workflowId) || !Number.isSafeInteger(version) || version < 1 || !SHA256.test(definitionHash)
    || !UUID_V4.test(commandId)) fail('Workflow start command is invalid', 'QUERY_INVALID');
  if (typeof sessionExistsFn !== 'function' || typeof nowFn !== 'function' || typeof runIdFn !== 'function') {
    fail('Workflow start dependencies are invalid', 'QUERY_INVALID');
  }
  if (!Array.isArray(supportedNodeKinds)) {
    fail('No Workflow step adapter is available on this server. Nothing was started.', 'WORKFLOW_START_UNSUPPORTED');
  }
  const commandPayloadHash = startCommandHash({ workflowId, version, definitionHash });
  return withGlobalAdmission(store, async () => {
    let record;
    try { record = await readDefinition(store, { workflowId, version }); }
    catch (error) {
      if (error?.code === 'WORKFLOW_DEFINITION_NOT_FOUND') fail('Workflow proposal was not found', 'WORKFLOW_PROPOSAL_NOT_FOUND', error);
      throw error;
    }
    const rootSessionId = record.proposal.initiatingSessionId;
    if (!(await sessionExistsFn(rootSessionId))) fail('Workflow proposal was not found', 'WORKFLOW_PROPOSAL_NOT_FOUND');
    // la ripetizione PRIMA di ogni altro controllo: un comando già accettato risponde col suo run anche se nel frattempo è
    // cambiato qualcosa (ad esempio l'elenco degli adattatori) — il fatto durevole è la verità
    const prior = await lookupCommandReceipt(store, { commandId });
    if (prior) {
      if (prior.commandType !== 'start-run' || prior.payloadHash !== commandPayloadHash || typeof prior.runId !== 'string') {
        fail('commandId is already bound to a different Workflow command', 'WORKFLOW_COMMAND_CONFLICT');
      }
      return { schema: 'talos.workflow-start-result.v1', status: 'prepared', workflowId, version, definitionHash,
        runId: prior.runId, receipt: prior, deduplicated: true };
    }
    if (record.definitionHash !== definitionHash) {
      fail('Workflow Definition changed or start hash is stale', 'WORKFLOW_DEFINITION_HASH_MISMATCH');
    }
    let approval = null;
    try { approval = await readDefinitionApproval(store, { workflowId, version }); }
    catch (error) { if (error?.code !== 'WORKFLOW_APPROVAL_NOT_FOUND') throw error; }
    if (!approval || approval.definitionHash !== definitionHash) {
      fail('This Workflow is not approved: approve it before starting it. Nothing was started.', 'WORKFLOW_DEFINITION_NOT_APPROVED');
    }
    /* F3-33b (25/09/2026), decisione owner: la v1 approvata resta avviabile finché la v2 (tetti rivisti) non è approvata;
       da lì si avvia la v2. Una versione più nuova solo PROPOSTA non toglie niente alla v1. */
    const superata = listDefinitionsForSession(store, { sessionId: rootSessionId })
      .some((voce) => voce.workflowId === workflowId && voce.version > version && voce.status === 'approved');
    if (superata) fail('A newer approved version of this Workflow exists: start that one. Nothing was started.', 'WORKFLOW_VERSION_SUPERSEDED');
    refuseUnrunnable(record.core, supportedNodeKinds);
    const runId = runIdFn();
    if (!UUID_V4.test(runId)) fail('Workflow runId must be a v4 UUID', 'QUERY_INVALID');
    await createRun(store, { event: {
      schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1, eventId: randomUUID(), runId, seq: 1,
      at: nowFn(), type: 'run_created', nodeId: null, commandId, commandType: 'start-run', commandPayloadHash,
      causationId: null, correlationId: runId, graphVersion: 1,
      activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
      payload: { workflowId, definitionVersion: version, definitionHash, rootSessionId,
        workspaceBaselineId: null, workspaceBaselineHash: null },
    } });
    const receipt = await lookupCommandReceipt(store, { commandId });
    if (!receipt || receipt.commandType !== 'start-run' || receipt.payloadHash !== commandPayloadHash || receipt.runId !== runId) {
      fail('Workflow start was not durably visible after write', 'WORKFLOW_STORE_NEEDS_ATTENTION');
    }
    return { schema: 'talos.workflow-start-result.v1', status: 'prepared', workflowId, version, definitionHash,
      runId, receipt, deduplicated: false };
  });
}
