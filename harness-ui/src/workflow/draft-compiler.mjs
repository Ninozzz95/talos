/*
 * ⭐⭐⭐ F3-11a (24/09/2026 sera) — IL COMPILATORE DELLA BOZZA DEL WORKFLOW. Puro: nessun I/O, nessun orologio.
 *
 * Decisioni dell'owner (memoria `decisioni-owner-f3-workflow-plan-ask-23-09.md`): 40 (D14) al modello si annuncia SOLO la
 * bozza corta e il server la compila nella definizione completa; 1 nodi in sola lettura; 14 nodi scrittori ⇒ proposta
 * respinta con motivo prima di salvare; 41 (D16) passo umano ⇒ respinto con motivo; 15 tetti prudenti e visibili; 42 (D18)
 * modello della sessione, eccezioni fra i disponibili verificate prima dell'approvazione.
 * Ledger con le politiche e i loro perché: `.claude/LEDGER-F3-11A-BOZZA-2026-09-24.md`.
 *
 * ⛔ Perché una bozza e non il Core intero. Il 23/09 il GLM vero, davanti a `core:{type:object}` nudo, ha indovinato un
 *   altro contratto (`harness-ui/docs/WF-GLM-LIVE-TOOL-SCHEMA-RED-2026-09-23.md`) e ha speso 15 chiamate a cercarlo nel
 *   codice. Il Core v2 ha 12 campi esatti in cima, una ventina per nodo, bilanci e politiche annidati: non è un contratto
 *   per un modello. Gli schemi piatti e descritti campo per campo sbagliano molto meno (dev.to/docat0209, letto 24/09/2026);
 *   Hermes chiede ai modelli una lista piatta di compiti (`tools/delegate_tool.py:635-705`, clone `65ad529`).
 * ⛔ La compilazione fallisce CHIUSA: ogni rifiuto arriva prima di qualunque scrittura, con un motivo che il modello può
 *   usare per correggersi al giro dopo. Mai una definizione a metà, mai un campo indovinato in silenzio.
 */
import { canonicalHash } from './canonical-json.mjs';
import { validateWorkflowDefinitionCore, WORKFLOW_NODE_ROLES } from './contract.mjs';
import { preflightWorkflowDefinition } from './preflight.mjs';

export class WorkflowDraftError extends Error {
  constructor(message, code = 'WORKFLOW_DRAFT_INVALID', details = null) {
    super(message);
    this.name = 'WorkflowDraftError';
    this.code = code;
    this.details = details;
  }
}

const fail = (message, code = 'WORKFLOW_DRAFT_INVALID', details = null) => { throw new WorkflowDraftError(message, code, details); };
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype;
const freezeDeep = (value) => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); }
  return value;
};

/** Id della bozza: niente punti, perché il punto separa gli id negli archi compilati (`<da>.<a>`), e un id con un punto
 *  renderebbe due coppie diverse lo stesso arco. */
const ID_BOZZA = /^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/u;

/*
 * Le politiche prudenti, con un nome e in un posto solo (decisione 15: visibili, e modificabili prima di approvare quando
 * arriverà la card). I perché dei numeri stanno nel ledger.
 */
export const DRAFT_POLICY = freezeDeep({
  bounds: { maxPhases: 12, maxNodes: 50, maxDependsOn: 16, titleMax: 200, objectiveMax: 4_000, labelMax: 200, taskMax: 8_000 },
  nodeBudget: {
    promptTokens: 400_000, completionTokens: 40_000, wallMs: 1_200_000, agentSeconds: 1_200, toolCalls: 60,
    modelRequests: 40, retryPromptTokens: 200_000, retryModelRequests: 10, knownCostUsd: null, attempts: 2,
  },
  runBudgetCap: {
    promptTokens: 4_000_000, completionTokens: 400_000, wallMs: 7_200_000, agentSeconds: 36_000, toolCalls: 1_000,
    modelRequests: 600, retryPromptTokens: 1_000_000, retryModelRequests: 100, knownCostUsd: null,
  },
  retryOn: ['rate_limit', 'transient_network', 'provider_5xx', 'timeout'],
});

const DRAFT_KEYS = ['title', 'objective', 'phases', 'nodes'];
const PHASE_KEYS = ['id', 'label'];
const NODE_REQUIRED = ['id', 'phase', 'label', 'task'];
const NODE_OPTIONAL = ['dependsOn', 'model', 'access', 'role'];

/** Il suggerimento per le chiavi che i modelli usano davvero (il GLM del 23/09 ne ha usate quattro di queste). */
const SUGGERIMENTI = Object.freeze({
  name: 'label', title: 'label', prompt: 'task', instructions: 'task', description: 'task', goal: 'task',
  phaseId: 'phase', phase_id: 'phase', stage: 'phase', next: 'dependsOn (list the steps this one waits for, not the ones after it)',
  depends_on: 'dependsOn', dependencies: 'dependsOn', deps: 'dependsOn', after: 'dependsOn',
});
/** Chi si dichiara umano o approvazione (decisione 41), e chi si dichiara di un altro tipo. */
const CHIAVI_DI_TIPO = ['type', 'kind', 'nodeType', 'node_type'];
const TIPI_UMANI = /^(approval|approve|human|manual|confirm|confirmation|sign-?off|signoff|review-by-user|user|wait-for-user|gate|ask|question)$/iu;

function unknownKeyMessage(key, path, allowed) {
  const hint = Object.hasOwn(SUGGERIMENTI, key) ? ` Did you mean "${SUGGERIMENTI[key]}"?` : '';
  return `${path} has an unknown field "${key}".${hint} Allowed fields: ${allowed.join(', ')}.`;
}

function text(value, max, path) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(`${path} must be a non-empty string.`);
  if (value.length > max) fail(`${path} is too long: at most ${max} characters.`, 'WORKFLOW_DRAFT_BOUNDS');
  return value;
}

function checkNodeKind(node, path) {
  for (const key of CHIAVI_DI_TIPO) {
    if (!Object.hasOwn(node, key)) continue;
    const value = String(node[key]);
    if (TIPI_UMANI.test(value)) {
      fail(`${path} is a human approval step ("${key}": "${value}"). A workflow cannot stop halfway to ask the person: `
        + 'ask with ask_user_question before proposing it, or split the work into two workflows.', 'WORKFLOW_DRAFT_HUMAN_STEP');
    }
    fail(`${path} declares a step type ("${key}": "${value}"). Only plain steps are supported: each step is one read-only `
      + 'agent. Remove the field.', 'WORKFLOW_DRAFT_UNSUPPORTED_KIND');
  }
}

function strictKeys(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(unknownKeyMessage(key, path, allowed));
}

/** Legge e controlla la bozza; torna le fasi e i nodi normalizzati, senza costruire niente. */
function readDraft(draft) {
  if (!plainObject(draft)) fail('The draft must be an object with title, objective, phases and nodes.');
  strictKeys(draft, DRAFT_KEYS, 'The draft');
  for (const key of DRAFT_KEYS) if (!Object.hasOwn(draft, key)) fail(`The draft is missing "${key}".`);
  const { bounds } = DRAFT_POLICY;
  const title = text(draft.title, bounds.titleMax, 'title');
  const objective = text(draft.objective, bounds.objectiveMax, 'objective');

  if (!Array.isArray(draft.phases) || draft.phases.length < 1) fail('phases must list at least one phase.');
  if (draft.phases.length > bounds.maxPhases) fail(`phases: at most ${bounds.maxPhases}.`, 'WORKFLOW_DRAFT_BOUNDS');
  const phaseIndex = new Map();
  const phases = draft.phases.map((phase, index) => {
    const path = `phases[${index}]`;
    if (!plainObject(phase)) fail(`${path} must be an object with id and label.`);
    strictKeys(phase, PHASE_KEYS, path);
    if (typeof phase.id !== 'string' || !ID_BOZZA.test(phase.id)) fail(`${path}.id must use letters, digits, "-" or "_" (at most 48).`);
    if (phaseIndex.has(phase.id)) fail(`${path}.id "${phase.id}" is used twice.`, 'WORKFLOW_DRAFT_DUPLICATE_ID');
    phaseIndex.set(phase.id, index);
    return { id: phase.id, label: text(phase.label, bounds.labelMax, `${path}.label`) };
  });

  if (!Array.isArray(draft.nodes) || draft.nodes.length < 1) fail('nodes must list at least one step.');
  if (draft.nodes.length > bounds.maxNodes) fail(`nodes: at most ${bounds.maxNodes} steps.`, 'WORKFLOW_DRAFT_BOUNDS');
  const ids = new Set();
  const nodes = draft.nodes.map((node, index) => {
    const path = `nodes[${index}]`;
    if (!plainObject(node)) fail(`${path} must be an object with id, phase, label and task.`);
    checkNodeKind(node, path);
    strictKeys(node, [...NODE_REQUIRED, ...NODE_OPTIONAL], path);
    for (const key of NODE_REQUIRED) if (!Object.hasOwn(node, key)) fail(`${path} is missing "${key}".`);
    if (typeof node.id !== 'string' || !ID_BOZZA.test(node.id)) fail(`${path}.id must use letters, digits, "-" or "_" (at most 48).`);
    if (ids.has(node.id)) fail(`${path}.id "${node.id}" is used twice.`, 'WORKFLOW_DRAFT_DUPLICATE_ID');
    ids.add(node.id);
    if (typeof node.phase !== 'string' || !phaseIndex.has(node.phase)) fail(`${path}.phase "${node.phase}" is not one of the phases.`);
    const access = node.access ?? 'read';
    if (access === 'write') {
      fail(`${path} ("${node.id}") is a writing step. Workflow steps are read-only in this version: they can read and search, `
        + 'not write files or run commands. Propose read-only steps, and do the writing yourself after the workflow.', 'WORKFLOW_DRAFT_WRITER');
    }
    if (access !== 'read') fail(`${path}.access must be "read".`);
    const dependsOn = node.dependsOn ?? [];
    if (!Array.isArray(dependsOn)) fail(`${path}.dependsOn must be a list of step ids.`);
    if (dependsOn.length > bounds.maxDependsOn) fail(`${path}.dependsOn: at most ${bounds.maxDependsOn}.`, 'WORKFLOW_DRAFT_BOUNDS');
    if (new Set(dependsOn).size !== dependsOn.length) fail(`${path}.dependsOn lists the same step twice.`);
    let model = null;
    if (node.model !== undefined && node.model !== null) {
      if (typeof node.model !== 'string' || node.model.trim().length === 0 || node.model.length > 200) fail(`${path}.model must be a model id.`);
      model = node.model;
    }
    /* 25/09/2026, decisione owner D28: il ruolo facoltativo dà l'icona della fase. Un valore fuori dai sei si RESPINGE con
       l'elenco, come ogni altro campo (fallire chiusi, riga 15): Hermes lo riduce al ruolo di serie con un avviso
       (`tools/delegate_tool.py:63-69`, clone `65ad529`), ma qui un campo indovinato in silenzio è la cosa che non si fa. */
    let role = null;
    if (node.role !== undefined && node.role !== null) {
      if (!WORKFLOW_NODE_ROLES.includes(node.role)) fail(`${path}.role must be one of: ${WORKFLOW_NODE_ROLES.join(', ')} (or omitted).`);
      role = node.role;
    }
    return {
      id: node.id, phase: node.phase, label: text(node.label, bounds.labelMax, `${path}.label`),
      task: text(node.task, bounds.taskMax, `${path}.task`), dependsOn: [...dependsOn], model, role,
    };
  });
  return { title, objective, phases, phaseIndex, nodes };
}

/** Dipendenze: dichiarate, non su sé stesse, mai verso una fase successiva, senza cicli, grafo connesso. */
function checkGraph({ phases, phaseIndex, nodes }) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (typeof dep !== 'string' || !byId.has(dep)) fail(`Step "${node.id}" depends on "${dep}", which is not a step of this draft.`, 'WORKFLOW_DRAFT_UNDECLARED_DEP');
      if (dep === node.id) fail(`Step "${node.id}" depends on itself.`, 'WORKFLOW_DRAFT_CYCLE');
      if (phaseIndex.get(byId.get(dep).phase) > phaseIndex.get(node.phase)) {
        fail(`Step "${node.id}" (phase "${node.phase}") waits for "${dep}", which is in a later phase ("${byId.get(dep).phase}"). `
          + 'A step can only wait for steps of its own phase or of earlier phases.', 'WORKFLOW_DRAFT_PHASE_ORDER');
      }
    }
  }
  for (const phase of phases) {
    if (!nodes.some((node) => node.phase === phase.id)) fail(`Phase "${phase.id}" has no steps.`, 'WORKFLOW_DRAFT_EMPTY_PHASE');
  }
  // Ciclo: visita in profondità con lo stack, per dire il PERCORSO e non solo «c'è un ciclo».
  const stato = new Map();
  const stack = [];
  const visita = (id) => {
    stato.set(id, 'aperto'); stack.push(id);
    for (const dep of byId.get(id).dependsOn) {
      if (stato.get(dep) === 'aperto') {
        const giro = [...stack.slice(stack.indexOf(dep)), dep];
        fail(`The steps wait for each other in a circle: ${giro.join(' → ')}.`, 'WORKFLOW_DRAFT_CYCLE', giro);
      }
      if (!stato.has(dep)) visita(dep);
    }
    stack.pop(); stato.set(id, 'chiuso');
  };
  for (const node of nodes) if (!stato.has(node.id)) visita(node.id);
  // Connessione debole: il Core rifiuta un grafo in più pezzi; qui si dice QUALI passi restano fuori.
  if (nodes.length > 1) {
    const vicini = new Map(nodes.map((node) => [node.id, new Set()]));
    for (const node of nodes) for (const dep of node.dependsOn) { vicini.get(node.id).add(dep); vicini.get(dep).add(node.id); }
    const visti = new Set([nodes[0].id]);
    const coda = [nodes[0].id];
    while (coda.length) for (const vicino of vicini.get(coda.shift())) if (!visti.has(vicino)) { visti.add(vicino); coda.push(vicino); }
    const fuori = nodes.filter((node) => !visti.has(node.id)).map((node) => node.id);
    if (fuori.length) {
      fail(`Some steps are not connected to the rest of the workflow: ${fuori.join(', ')}. Every step must wait for, or be waited `
        + 'for by, another step (use dependsOn).', 'WORKFLOW_DRAFT_DISCONNECTED', fuori);
    }
  }
}

function nodeBudget() {
  const { attempts, ...rest } = DRAFT_POLICY.nodeBudget;
  return { ...rest, attempts };
}

/*
 * ⭐ F3-41a (25/09/2026), decisione owner «Budget pieno a ogni tentativo»: il tetto del run conta TUTTI i tentativi di ogni
 *   passo (passi × tentativi × budget del passo), sempre sotto `runBudgetCap`. Prima contava un tentativo solo, e un ritentativo
 *   di un run a un passo era rifiutato (`promptTokens exceeds run ceiling`, misurato). Come Hermes: ogni ritentativo è una
 *   corsa nuova col suo budget.
 */
function runBudget(nodeCount) {
  const run = {};
  const tentativi = DRAFT_POLICY.nodeBudget.attempts;
  for (const [key, cap] of Object.entries(DRAFT_POLICY.runBudgetCap)) {
    const perNode = DRAFT_POLICY.nodeBudget[key];
    run[key] = cap === null || perNode === null ? null : Math.min(perNode * nodeCount * tentativi, cap);
  }
  return run;
}

/**
 * La bozza diventa un Core v2. Deterministico: la stessa bozza dà gli stessi byte e la stessa impronta.
 * @param {object} draft
 * @param {{availableModelIds?: string[]|null}} [context] — i modelli fra cui un nodo può sceglierne uno diverso da quello della
 *   sessione. Senza elenco un modello esplicito NON si può verificare, e la bozza si respinge (decisione 42: verificato prima).
 * @returns {{core: object, definitionHash: string, preflight: {errors: object[], warnings: object[], estimates: object}}}
 */
export function compileWorkflowDraft(draft, context = {}) {
  const lettura = readDraft(draft);
  checkGraph(lettura);
  const disponibili = Array.isArray(context.availableModelIds) ? [...new Set(context.availableModelIds)].sort() : null;
  for (const node of lettura.nodes) {
    if (node.model === null) continue;
    if (!disponibili) fail(`Step "${node.id}" asks for model "${node.model}", but the available models are not known: remove "model" to use the session model.`, 'WORKFLOW_DRAFT_MODEL_UNAVAILABLE');
    if (!disponibili.includes(node.model)) {
      fail(`Step "${node.id}" asks for model "${node.model}", which is not available. Remove "model" to use the session model, or pick one of the available models.`,
        'WORKFLOW_DRAFT_MODEL_UNAVAILABLE', { model: node.model });
    }
  }
  const nodeCount = lettura.nodes.length;
  const core = {
    schema: 'talos.workflow-definition-core.v2',
    definitionSchemaVersion: 2,
    title: lettura.title,
    objective: lettura.objective,
    engineCompatibility: { minEngineSchemaVersion: 1, requiredFeatures: [] },
    phases: lettura.phases.map((phase) => ({ id: phase.id, label: phase.label })),
    nodes: lettura.nodes.map((node) => ({
      id: node.id,
      kind: 'agent',
      label: node.label,
      instructions: node.task,
      role: node.role,
      inputs: [],
      outputs: [{ name: 'result', type: 'text' }],
      capabilityProfile: 'read',
      workspacePolicy: { mode: 'shared-read' },
      modelPolicy: node.model === null ? { mode: 'inherit', model: null, reasoning: null } : { mode: 'explicit', model: node.model, reasoning: null },
      activityPolicy: { effectClass: 'reconcilable', retryMode: 'at-least-once', maxAttempts: DRAFT_POLICY.nodeBudget.attempts, deadlineMs: null },
      retryPolicy: { backoff: 'exponential', jitter: true, retryOn: [...DRAFT_POLICY.retryOn] },
      cachePolicy: 'never',
      writeSetHint: [],
      priority: 0,
      budget: nodeBudget(),
      metadata: {},
      phaseId: node.phase,
    })),
    edges: lettura.nodes.flatMap((node) => node.dependsOn.map((dep) => ({
      id: `${dep}.${node.id}`, from: dep, to: node.id, type: 'control', condition: null, mapping: null,
    }))),
    budgets: runBudget(nodeCount),
    limits: {
      maxLogicalNodes: nodeCount,
      maxEdges: lettura.nodes.reduce((somma, node) => somma + node.dependsOn.length, 0),
      maxGraphMutations: 0,
      maxFanoutPerNode: nodeCount,
      maxAgentSessions: nodeCount,
      maxDepth: Math.max(8, nodeCount),
    },
    policy: {
      capabilityCeiling: 'read',
      externalTools: { mode: 'deny', ids: [] },
      providerFallback: { mode: 'forbidden', providers: [] },
      graphMutation: { mode: 'forbidden', maxOperationsPerPatch: 0, maxAddedNodesPerPatch: 0, maxAddedEdgesPerPatch: 0 },
      human: { maxPending: 0, allowBatchIdenticalSchema: false },
      finalApply: 'user-explicit',
    },
    acceptance: [],
  };
  try { validateWorkflowDefinitionCore(core); }
  catch (error) { fail(`The draft compiled into an invalid definition: ${error.message}`, 'WORKFLOW_DRAFT_COMPILED_INVALID'); }
  const preflight = preflightWorkflowDefinition(core, disponibili ? { availableModelIds: disponibili } : {});
  if (preflight.errors.length) {
    fail(`The draft does not pass the preflight: ${preflight.errors.map((e) => e.code).join(', ')}.`, 'WORKFLOW_DRAFT_PREFLIGHT', preflight.errors);
  }
  return { core, definitionHash: canonicalHash(core), preflight };
}

/*
 * Lo schema annunciato al modello (F3-11b lo mette nel kernel, che non può importare da qui: una prova ne controlla la
 * parità). Piatto e descritto campo per campo: il modello non deve indovinare niente.
 */
export const WORKFLOW_DRAFT_INPUT_SCHEMA = freezeDeep({
  type: 'object',
  additionalProperties: false,
  required: ['title', 'objective', 'phases', 'nodes'],
  properties: {
    title: { type: 'string', description: 'Short name of the workflow, as the person will see it (at most 200 characters).' },
    objective: { type: 'string', description: 'What the whole workflow must achieve, in one or two sentences.' },
    phases: {
      type: 'array', minItems: 1, maxItems: 12,
      description: 'The stages, in order. Every step belongs to exactly one phase.',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'label'],
        properties: {
          id: { type: 'string', description: 'Short identifier: letters, digits, "-" or "_", e.g. "research".' },
          label: { type: 'string', description: 'Name of the phase shown to the person.' },
        },
      },
    },
    nodes: {
      type: 'array', minItems: 1, maxItems: 50,
      description: 'The steps. Each step is one read-only agent: it can read files and search, it cannot write files or run commands. Do not add approval or human steps: ask before proposing instead.',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'phase', 'label', 'task'],
        properties: {
          id: { type: 'string', description: 'Unique identifier of the step: letters, digits, "-" or "_".' },
          phase: { type: 'string', description: 'The id of the phase this step belongs to.' },
          label: { type: 'string', description: 'Short name of the step, shown in the graph.' },
          task: { type: 'string', description: 'Complete instructions for the agent that runs this step.' },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'Ids of the steps that must finish before this one starts. This step receives their final answers, as snapshots of up to 4,096 characters each. Omit for the first steps. A step can wait only for steps of its own or earlier phases.' },
          model: { type: 'string', description: 'Optional: a different model for this step, among the available ones. Omit to use the session model.' },
          role: { type: 'string', enum: [...WORKFLOW_NODE_ROLES], description: 'Optional: the kind of work this step does, one of the listed values. It chooses the icon of its phase in the graph; omit it if none fits.' },
          access: { type: 'string', enum: ['read', 'write'], description: 'Optional, "read" by default. Writing steps are not supported yet: a draft with a "write" step is rejected.' },
        },
      },
    },
  },
});
