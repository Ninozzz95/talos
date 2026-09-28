import { createHash } from 'node:crypto';

import { canonicalHash, canonicalJson } from './canonical-json.mjs';
import { compileWorkflowDraft } from './draft-compiler.mjs';
import { compileWorkflowProposal } from './plan-compiler.mjs';
import { LINEAGE_DIRECTIONS, LINEAGE_PAGE_MAX, projectPlannedWorkflowEdgePage, projectPlannedWorkflowGroupPage,
  projectPlannedWorkflowLineage, projectPlannedWorkflowNodeDetail, projectPlannedWorkflowOverview } from './read-model.mjs';
import { approveDefinition, listDefinitionsForSession, listRunSummariesForSession, lookupCommandReceipt, readDefinition,
  readDefinitionApproval, readDefinitionForView, withGlobalAdmission } from './store.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^sha256:[0-9a-f]{64}$/u;

export class WorkflowPlanningError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'WorkflowPlanningError';
    this.code = code;
  }
}

function fail(message, code, cause) { throw new WorkflowPlanningError(message, code, cause); }
function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exact(value, keys, code = 'QUERY_INVALID') {
  if (!plainObject(value) || Object.keys(value).length !== keys.length
    || Object.keys(value).some((key) => !keys.includes(key))) fail('Workflow request shape is invalid', code);
}

/** RFC 9562 UUIDv8; domain-separated SHA-256 of server-owned session and model tool call IDs. */
export function workflowIdForToolCall({ sessionId, toolCallId } = {}) {
  if (!UUID_V4.test(sessionId)) fail('sessionId is invalid', 'WORKFLOW_PROPOSAL_INVALID');
  if (typeof toolCallId !== 'string' || toolCallId.length < 1 || toolCallId.length > 256
    || /[\u0000-\u001f\u007f]/u.test(toolCallId)) fail('toolCallId is invalid', 'WORKFLOW_PROPOSAL_INVALID');
  const bytes = createHash('sha256').update('talos.workflow-proposal-tool-call.v1\0')
    .update(sessionId).update('\0').update(toolCallId).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function proposeWorkflowFromTool(store, input, deps = {}) {
  /* ⭐ F3-11c (24/09/2026 notte), decisione owner 40: il modello propone una BOZZA corta (`draft`), che qui si compila in un
     Core v2 in sola lettura (`draft-compiler.mjs`); `core` resta per le prove e le API interne. Esattamente uno dei due:
     entrambi fanno sbagliare il conteggio delle chiavi e si rifiutano come prima. */
  const conBozza = plainObject(input) && Object.hasOwn(input, 'draft');
  exact(input, ['sessionId', 'toolCallId', conBozza ? 'draft' : 'core', 'plannerModel', 'sessionModel', 'modalitaOperativa', 'agentRole'], 'WORKFLOW_PROPOSAL_INVALID');
  // ⛔ F3-10 (23/09/2026, decisione owner D02-a): il root propone in Normale e in Piano; `workflow` non è più un modo.
  if (input.agentRole !== 'root' || !['normale', 'piano'].includes(input.modalitaOperativa)) {
    fail('Only the root agent in Normal or Plan mode may propose a Workflow', 'WORKFLOW_PROPOSAL_FORBIDDEN');
  }
  let core = input.core;
  if (conBozza) {
    // decisione 42: un modello per nodo passa solo se è fra i disponibili; senza elenco, il compilatore lo rifiuta con motivo
    // il catalogo si chiede SOLO se un passo nomina un modello: altrimenti è una chiamata di rete che non decide niente
    const chiedeModello = Array.isArray(input.draft?.nodes) && input.draft.nodes.some((n) => n && typeof n === 'object' && n.model != null);
    let disponibili = null;
    try { disponibili = chiedeModello && typeof deps.availableModelIdsFn === 'function' ? await deps.availableModelIdsFn() : null; }
    catch { disponibili = null; }
    core = compileWorkflowDraft(input.draft, { availableModelIds: Array.isArray(disponibili) ? disponibili : null }).core;
  }
  if (!plainObject(core) || core.schema !== 'talos.workflow-definition-core.v2'
    || core.definitionSchemaVersion !== 2) {
    fail('Workflow proposals from the model require a v2 Core with explicit phases', 'WORKFLOW_PROPOSAL_INVALID');
  }
  const workflowId = workflowIdForToolCall(input);
  const { record } = await compileWorkflowProposal(store, {
    core,
    workflowId,
    version: 1,
    initiatingSessionId: input.sessionId,
    plannerModel: input.plannerModel,
    sessionModel: input.sessionModel,
  }, { nowFn: deps.nowFn, preflightContext: deps.preflightContext });
  let approval = null;
  try { approval = await readDefinitionApproval(store, { workflowId: record.workflowId, version: record.version }); }
  catch (error) {
    if (error?.code !== 'WORKFLOW_APPROVAL_NOT_FOUND') throw error;
  }
  return {
    schema: 'talos.workflow-proposal-receipt.v1',
    workflowId: record.workflowId,
    version: record.version,
    definitionHash: record.definitionHash,
    status: approval ? 'approved' : 'proposed',
    preflight: structuredClone(record.preflight),
  };
}

async function ownedDefinition(store, { workflowId, version }, sessionExistsFn, read = readDefinition) {
  if (!UUID.test(workflowId) || !Number.isSafeInteger(version) || version < 1
    || typeof sessionExistsFn !== 'function') fail('Workflow proposal was not found', 'WORKFLOW_PROPOSAL_NOT_FOUND');
  let record;
  try { record = await read(store, { workflowId, version }); }
  catch (error) {
    if (error?.code === 'WORKFLOW_DEFINITION_NOT_FOUND') fail('Workflow proposal was not found', 'WORKFLOW_PROPOSAL_NOT_FOUND');
    throw error;
  }
  if (!(await sessionExistsFn(record.proposal.initiatingSessionId))) {
    fail('Workflow proposal was not found', 'WORKFLOW_PROPOSAL_NOT_FOUND');
  }
  return record;
}

/*
 * ⭐ F3-21 (25/09/2026) — la revisione è LIMITATA. Fino a ieri il GET restituiva il record intero, Core compreso: con 5.000
 *   passi erano megabyte di istruzioni per disegnare una card. Qui c'è ciò che serve a decidere (titolo, obiettivo, fasi con
 *   quanti passi, conteggi, scrittori, politiche, tetti, preflight, impronta, chi e quando) e nient'altro; i passi si leggono
 *   uno per pagina dal grafo pianificato (`readPlannedWorkflowGraph`). Il preflight porta al più 20 errori e 20 avvisi più i
 *   totali: un avviso per passo su 5.000 passi rifarebbe il problema.
 */
const REVIEW_ISSUES_MAX = 20;

function boundedIssues(list) {
  return (Array.isArray(list) ? list : []).slice(0, REVIEW_ISSUES_MAX).map((issue) => ({
    code: issue.code, message: issue.message,
    subjects: Array.isArray(issue.subjects) ? issue.subjects.slice(0, 10) : [],
  }));
}

function proposalReview(record, approval) {
  const phaseTotals = new Map((record.core.phases ?? []).map((phase) => [phase.id, 0]));
  for (const node of record.core.nodes) if (phaseTotals.has(node.phaseId)) phaseTotals.set(node.phaseId, phaseTotals.get(node.phaseId) + 1);
  const policy = record.core.policy;
  return {
    schema: 'talos.workflow-proposal-view.v2',
    status: approval ? 'approved' : 'proposed',
    workflowId: record.workflowId,
    version: record.version,
    definitionHash: record.definitionHash,
    proposal: structuredClone(record.proposal),
    title: record.core.title,
    objective: record.core.objective,
    phases: (record.core.phases ?? []).map((phase) => ({ id: phase.id, label: phase.label, total: phaseTotals.get(phase.id) })),
    counts: {
      nodes: record.core.nodes.length,
      edges: record.core.edges.length,
      writers: Number.isSafeInteger(record.preflight?.estimates?.writerCount) ? record.preflight.estimates.writerCount : null,
      acceptance: Array.isArray(record.core.acceptance) ? record.core.acceptance.length : 0,
    },
    policy: {
      capabilityCeiling: policy.capabilityCeiling,
      externalTools: policy.externalTools.mode,
      providerFallback: policy.providerFallback.mode,
      graphMutation: policy.graphMutation.mode,
      finalApply: policy.finalApply,
    },
    budgets: structuredClone(record.core.budgets),
    limits: structuredClone(record.core.limits),
    preflight: {
      errorCount: record.preflight?.errors?.length ?? 0,
      warningCount: record.preflight?.warnings?.length ?? 0,
      errors: boundedIssues(record.preflight?.errors),
      warnings: boundedIssues(record.preflight?.warnings),
      estimates: structuredClone(record.preflight?.estimates ?? {}),
    },
    approval: approval ? structuredClone(approval) : null,
  };
}

async function approvalOrNull(store, input) {
  try { return await readDefinitionApproval(store, input); }
  catch (error) {
    if (error?.code !== 'WORKFLOW_APPROVAL_NOT_FOUND') throw error;
    return null;
  }
}

export async function readWorkflowProposal(store, input, { sessionExistsFn } = {}) {
  exact(input, ['workflowId', 'version']);
  const record = await ownedDefinition(store, input, sessionExistsFn, readDefinitionForView);
  return proposalReview(record, await approvalOrNull(store, input));
}

function pageBounds({ offset, limit }, maxLimit) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit) {
    fail('Workflow page bounds are invalid', 'QUERY_INVALID');
  }
}

/** The proposals a session made, from the Store index: newest first, at most 50 per page, never a Core. */
export async function listWorkflowProposals(store, input, { sessionExistsFn } = {}) {
  exact(input, ['sessionId', 'offset', 'limit']);
  pageBounds(input, 50);
  if (typeof sessionExistsFn !== 'function' || !(await sessionExistsFn(input.sessionId))) {
    fail('Workflow proposal was not found', 'WORKFLOW_PROPOSAL_NOT_FOUND');
  }
  const items = listDefinitionsForSession(store, { sessionId: input.sessionId });
  return {
    schema: 'talos.workflow-proposal-list.v1',
    sessionId: input.sessionId,
    total: items.length,
    offset: input.offset,
    limit: input.limit,
    nextOffset: input.offset + input.limit < items.length ? input.offset + input.limit : null,
    items: items.slice(input.offset, input.offset + input.limit),
  };
}

const PLANNED_VIEWS = Object.freeze({
  overview: [],
  group: ['phaseId', 'offset', 'limit'],
  edges: ['offset', 'limit'],
  node: ['nodeId'],
  // refactor dei grafi (decisioni owner 24 e 30): il focus a monte e a valle anche su un piano
  lineage: ['nodeId', 'direction', 'offset', 'limit'],
});

/**
 * The graph of a proposal BEFORE any run: same v2 shapes as a run graph, every step `planned` (owner decision 6).
 * Owner scope as the review: the proposing session must still exist.
 */
export async function readPlannedWorkflowGraph(store, input, { sessionExistsFn } = {}) {
  const view = plainObject(input) ? input.view : undefined;
  if (!Object.hasOwn(PLANNED_VIEWS, view ?? '')) fail('Workflow graph view is invalid', 'QUERY_INVALID');
  // F3-42: la pagina di fase ammette anche `sort` (solo 'stato', `read-model.mjs`); refactor dei grafi (decisione owner 30):
  // gli archi ammettono `phaseIds`, le fasi aperte. Le altre viste restano esatte
  const facoltativi = view === 'group' && Object.hasOwn(input, 'sort') ? ['sort']
    : view === 'edges' && Object.hasOwn(input, 'phaseIds') ? ['phaseIds'] : [];
  exact(input, ['workflowId', 'version', 'view', ...PLANNED_VIEWS[view], ...facoltativi]);
  if (view === 'group' && facoltativi.length && input.sort !== 'stato') fail('Workflow sort is invalid', 'QUERY_INVALID');
  if (view === 'edges' && facoltativi.length && (!Array.isArray(input.phaseIds) || input.phaseIds.length === 0
    || input.phaseIds.some((phaseId) => typeof phaseId !== 'string'))) fail('Workflow phaseIds are invalid', 'QUERY_INVALID');
  if (view === 'group') pageBounds(input, 50);
  if (view === 'edges') pageBounds(input, 100);
  if (view === 'lineage') {
    pageBounds(input, LINEAGE_PAGE_MAX);
    if (!LINEAGE_DIRECTIONS.includes(input.direction)) fail('Workflow lineage direction is invalid', 'QUERY_INVALID');
  }
  const record = await ownedDefinition(store, input, sessionExistsFn, readDefinitionForView);
  if (view === 'overview') return projectPlannedWorkflowOverview(record);
  if (view === 'edges') {
    const fasi = input.phaseIds ?? null;
    if (fasi && fasi.some((phaseId) => !(record.core.phases ?? []).some((phase) => phase.id === phaseId))) fail('Workflow group was not found', 'WORKFLOW_GROUP_NOT_FOUND');
    return projectPlannedWorkflowEdgePage(record, { offset: input.offset, limit: input.limit, ...(fasi ? { phaseIds: fasi } : {}) });
  }
  if (view === 'lineage') {
    if (!record.core.nodes.some((node) => node.id === input.nodeId)) fail('Workflow node was not found', 'WORKFLOW_NODE_NOT_FOUND');
    return projectPlannedWorkflowLineage(record, { nodeId: input.nodeId, direction: input.direction, offset: input.offset, limit: input.limit });
  }
  if (view === 'group') {
    if (!(record.core.phases ?? []).some((phase) => phase.id === input.phaseId)) fail('Workflow group was not found', 'WORKFLOW_GROUP_NOT_FOUND');
    return projectPlannedWorkflowGroupPage(record, { phaseId: input.phaseId, offset: input.offset, limit: input.limit, ...(input.sort ? { sort: input.sort } : {}) });
  }
  if (!record.core.nodes.some((node) => node.id === input.nodeId)) fail('Workflow node was not found', 'WORKFLOW_NODE_NOT_FOUND');
  return projectPlannedWorkflowNodeDetail(record, { nodeId: input.nodeId });
}

/*
 * ⭐ F3-33b (25/09/2026) — «Modifica» i tetti di una proposta: nasce una versione NUOVA dello stesso workflow, da riapprovare
 *   (decisioni owner 5, D17 b, D19 a e le quattro del 25/09 sera; ricerca `.claude/RICERCA-10x4-F3-33b-TETTI-2026-09-25.md`).
 *   · Si cambiano solo i SEI tetti del run che la card mostra; i tetti dei passi restano prudenti e si STRINGONO se il run scende
 *     sotto di loro (il contratto vieta un passo più largo del run, `contract.mjs:561-565`).
 *   · Nessun massimo e mai spento: un intero > 0 (il costo: un numero > 0, o `null` = non impostato, come oggi). Un valore non
 *     valido si RIFIUTA, non spegne il tetto (openai-agents-js #1819: «NaN maxTurns disables the run turn limit»).
 *   · Le versioni sono immutabili e numerate in fila (AWS Step Functions): si rivede solo l'ULTIMA, e solo se non è partita.
 *     La versione nasce dal contenuto, quindi lo stesso gesto ripetuto dopo un esito ambiguo ritrova la stessa versione
 *     (`compileWorkflowProposal` è idempotente sul contenuto) invece di crearne un'altra.
 *   · La v1 approvata resta avviabile finché la v2 non è approvata (decisione owner): lo controlla `startWorkflowRun`.
 */
export const REVISABLE_BUDGETS = Object.freeze(['promptTokens', 'completionTokens', 'wallMs', 'modelRequests', 'toolCalls', 'knownCostUsd']);

export async function reviseWorkflowBudgets(store, input, { sessionExistsFn, nowFn, preflightContext } = {}) {
  exact(input, ['workflowId', 'version', 'definitionHash', 'budgets']);
  if (!SHA256.test(input.definitionHash) || !plainObject(input.budgets)) fail('Workflow revision is invalid', 'QUERY_INVALID');
  const chiavi = Object.keys(input.budgets);
  if (!chiavi.length || chiavi.some((chiave) => !REVISABLE_BUDGETS.includes(chiave))) {
    fail(`Only these limits can be changed: ${REVISABLE_BUDGETS.join(', ')}.`, 'WORKFLOW_REVISION_INVALID');
  }
  for (const chiave of chiavi) {
    const valore = input.budgets[chiave];
    const valido = chiave === 'knownCostUsd'
      ? valore === null || (typeof valore === 'number' && Number.isFinite(valore) && valore > 0)
      : Number.isSafeInteger(valore) && valore >= 1;
    if (!valido) fail(`The limit ${chiave} must be a number greater than zero.`, 'WORKFLOW_REVISION_INVALID');
  }
  return withGlobalAdmission(store, async () => {
    const base = await ownedDefinition(store, input, sessionExistsFn);
    if (base.definitionHash !== input.definitionHash) {
      fail('Workflow Definition changed or revision hash is stale', 'WORKFLOW_DEFINITION_HASH_MISMATCH');
    }
    const core = structuredClone(base.core);
    let cambiati = 0;
    for (const chiave of chiavi) {
      const valore = input.budgets[chiave];
      if (core.budgets[chiave] !== valore) cambiati += 1;
      core.budgets[chiave] = valore;
      if (valore !== null) for (const node of core.nodes) if (node.budget[chiave] !== null && node.budget[chiave] > valore) node.budget[chiave] = valore;
    }
    if (!cambiati) fail('Nothing to change: these limits are the ones of this version.', 'WORKFLOW_REVISION_EMPTY');
    const sessionId = base.proposal.initiatingSessionId;
    const nuova = base.version + 1;
    const ultima = Math.max(...listDefinitionsForSession(store, { sessionId })
      .filter((voce) => voce.workflowId === base.workflowId).map((voce) => voce.version));
    if (ultima > nuova) fail('A newer version of this workflow exists: reload it.', 'WORKFLOW_VERSION_NOT_LATEST');
    if (ultima === nuova) {
      // lo stesso gesto ripetuto (esito ambiguo): la versione dopo esiste già con ESATTAMENTE questo contenuto
      const dopo = await readDefinition(store, { workflowId: base.workflowId, version: nuova });
      if (canonicalJson(dopo.core) !== canonicalJson(core)) fail('A newer version of this workflow exists: reload it.', 'WORKFLOW_VERSION_NOT_LATEST');
    } else {
      const runs = await listRunSummariesForSession(store, { rootSessionId: sessionId });
      if (runs.some((run) => run.workflowId === base.workflowId && run.version === base.version)) {
        fail('This version has already started: its limits can no longer change.', 'WORKFLOW_ALREADY_STARTED');
      }
    }
    const { record } = await compileWorkflowProposal(store, {
      core, workflowId: base.workflowId, version: nuova, initiatingSessionId: sessionId,
      plannerModel: base.proposal.plannerModel, sessionModel: base.proposal.sessionModel,
    }, { ...(nowFn ? { nowFn } : {}), ...(preflightContext ? { preflightContext } : {}) });
    return {
      schema: 'talos.workflow-revision-result.v1', status: 'proposed', workflowId: record.workflowId, version: record.version,
      definitionHash: record.definitionHash, previousVersion: base.version, preflight: structuredClone(record.preflight),
    };
  });
}

function approvalCommandHash(input) {
  return canonicalHash({
    schema: 'talos.workflow-command-dedupe.v1',
    commandType: 'approve-definition',
    target: { workflowId: input.workflowId, definitionVersion: input.version,
      runId: null, nodeId: null, requestId: null },
    payload: { definitionHash: input.definitionHash },
  });
}

export async function approveWorkflowProposal(store, input, { sessionExistsFn, nowFn = () => new Date().toISOString() } = {}) {
  exact(input, ['workflowId', 'version', 'definitionHash', 'commandId']);
  if (!UUID_V4.test(input.commandId) || !SHA256.test(input.definitionHash) || typeof nowFn !== 'function') {
    fail('Workflow approval command is invalid', 'QUERY_INVALID');
  }
  return withGlobalAdmission(store, async () => {
    const record = await ownedDefinition(store, input, sessionExistsFn);
    if (record.definitionHash !== input.definitionHash) {
      fail('Workflow Definition changed or approval hash is stale', 'WORKFLOW_DEFINITION_HASH_MISMATCH');
    }
    const commandPayloadHash = approvalCommandHash(input);
    const prior = await lookupCommandReceipt(store, { commandId: input.commandId });
    if (prior) {
      if (prior.commandType !== 'approve-definition' || prior.payloadHash !== commandPayloadHash) {
        fail('commandId is already bound to a different Workflow command', 'WORKFLOW_COMMAND_CONFLICT');
      }
      return { schema: 'talos.workflow-approval-result.v1', status: 'approved', receipt: prior,
        workflowId: input.workflowId, version: input.version, definitionHash: input.definitionHash, deduplicated: true };
    }
    try {
      await approveDefinition(store, { approval: {
        schema: 'talos.workflow-approval.v1', workflowId: input.workflowId, version: input.version,
        definitionHash: input.definitionHash, commandId: input.commandId,
        approvedAt: nowFn(), approvedBy: 'user', commandPayloadHash,
      } });
    } catch (error) {
      if (error?.code !== 'WORKFLOW_APPROVAL_CONFLICT') throw error;
      const raced = await lookupCommandReceipt(store, { commandId: input.commandId });
      if (!raced || raced.commandType !== 'approve-definition' || raced.payloadHash !== commandPayloadHash) {
        fail('Workflow Definition was already approved with a different command', 'WORKFLOW_APPROVAL_CONFLICT', error);
      }
    }
    const receipt = await lookupCommandReceipt(store, { commandId: input.commandId });
    if (!receipt || receipt.commandType !== 'approve-definition' || receipt.payloadHash !== commandPayloadHash) {
      fail('Approval was not durably visible after write', 'WORKFLOW_STORE_NEEDS_ATTENTION');
    }
    return { schema: 'talos.workflow-approval-result.v1', status: 'approved', receipt,
      workflowId: input.workflowId, version: input.version, definitionHash: input.definitionHash, deduplicated: false };
  });
}
