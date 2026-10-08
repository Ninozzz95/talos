// Public, bounded read model. Never serialize a Definition, reducer state, or journal directly.
const SCHEMA = 'talos.workflow-graph-view.v2';
const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded']);
const ATTENTION = new Set(['failed', 'uncertain', 'reconciling']);

function pushReady(heap, value, compare) {
  let index = heap.length;
  heap.push(value);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (compare(heap[parent], value) <= 0) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function popReady(heap, compare) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child = right < heap.length && compare(heap[right], heap[left]) < 0 ? right : left;
      if (compare(last, heap[child]) <= 0) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return first;
}

function orderedNodes(definition) {
  const nodes = definition.nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const forward = new Map(nodes.map((node) => [node.id, []]));
  const backward = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of definition.edges) {
    forward.get(edge.from)?.push(edge.to);
    backward.get(edge.to)?.push(edge.from);
  }
  for (const graph of [forward, backward]) for (const neighbours of graph.values()) neighbours.sort();

  // Iterative Kosaraju: safe for 5,000+ logical nodes and legal loop SCCs.
  const visited = new Set();
  const finish = [];
  for (const root of [...byId.keys()].sort()) {
    if (visited.has(root)) continue;
    visited.add(root);
    const stack = [{ id: root, next: 0 }];
    while (stack.length) {
      const top = stack.at(-1);
      const neighbours = forward.get(top.id);
      if (top.next < neighbours.length) {
        const next = neighbours[top.next++];
        if (!visited.has(next)) { visited.add(next); stack.push({ id: next, next: 0 }); }
      } else { finish.push(top.id); stack.pop(); }
    }
  }

  const componentOf = new Map();
  const components = [];
  for (const root of finish.reverse()) {
    if (componentOf.has(root)) continue;
    const componentId = components.length;
    const members = [];
    const stack = [root];
    componentOf.set(root, componentId);
    while (stack.length) {
      const id = stack.pop();
      members.push(id);
      for (const predecessor of backward.get(id)) {
        if (!componentOf.has(predecessor)) { componentOf.set(predecessor, componentId); stack.push(predecessor); }
      }
    }
    components.push(members.sort());
  }

  const outgoing = components.map(() => new Set());
  const indegree = components.map(() => 0);
  for (const edge of definition.edges) {
    const from = componentOf.get(edge.from), to = componentOf.get(edge.to);
    if (from !== to && !outgoing[from].has(to)) { outgoing[from].add(to); indegree[to]++; }
  }
  const ready = [];
  const compareReady = (left, right) => components[left][0].localeCompare(components[right][0], 'en');
  for (let index = 0; index < components.length; index++) {
    if (indegree[index] === 0) pushReady(ready, index, compareReady);
  }
  const result = [];
  while (ready.length) {
    const current = popReady(ready, compareReady);
    for (const id of components[current]) result.push(byId.get(id));
    for (const next of outgoing[current]) if (--indegree[next] === 0) pushReady(ready, next, compareReady);
  }
  return result;
}

function values(input) {
  if (!input?.state?.definition?.nodes || !(input.state.nodes instanceof Map)) throw new TypeError('Workflow read model requires verified reducer state');
  return input.state;
}

/*
 * ⭐ F3-21 (25/09/2026) — il grafo PIANIFICATO: la stessa vista v2 costruita dalla sola Definition, prima che esista un run.
 *   Decisione owner 6 (23/09): «prima fasi e nodi pianificati senza stati inventati». Quindi ogni passo è `planned` (mai
 *   `pending`, che in un run vuol dire «in attesa del suo turno»), nessuno è terminato o chiede attenzione, e l'avanzamento
 *   di una fase è `null` e non 0%: uno zero direbbe che il lavoro è partito e non ha fatto niente. `runId` è null e la
 *   revisione è l'impronta della Definition, che è immutabile: la stessa proposta dà sempre gli stessi byte.
 */
const PLANNED = 'planned';

function plannedValues(record) {
  if (!record?.core?.nodes || !Array.isArray(record.core.edges) || typeof record.definitionHash !== 'string') {
    throw new TypeError('Planned Workflow read model requires a verified Definition record');
  }
  return { state: { definition: record.core, nodes: new Map(), lastSeq: 0, run: null,
    planned: { workflowId: record.workflowId, version: record.version, definitionHash: record.definitionHash } }, events: [] };
}

function nodeStateOf(state, nodeId) {
  return state.nodes.get(nodeId)?.state ?? (state.planned ? PLANNED : 'pending');
}

function lastUpdated(events, nodeId) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.nodeId === nodeId && typeof event.at === 'string') return event.at;
  }
  return null;
}

function countsFor(nodes, state) {
  const counts = {};
  let terminated = 0, attention = 0;
  for (const node of nodes) {
    const status = nodeStateOf(state, node.id);
    counts[status] = (counts[status] ?? 0) + 1;
    if (TERMINAL.has(status)) terminated++;
    if (ATTENTION.has(status)) attention++;
  }
  return { counts, terminated, attention };
}

const LEGACY_PHASE = Object.freeze({ id: 'legacy-unassigned', label: 'Unassigned phase (Definition v1)' });

function phasesFor(definition) {
  return definition.schema === 'talos.workflow-definition-core.v2'
    ? { phaseSource: 'explicit', phases: definition.phases }
    : { phaseSource: 'legacy-unassigned', phases: [LEGACY_PHASE] };
}

function phaseIdFor(node, phaseSource) {
  return phaseSource === 'explicit' ? node.phaseId : LEGACY_PHASE.id;
}

function groupConnectionsFor(definition, phaseSource, phases) {
  const phaseByNode = new Map(definition.nodes.map((node) => [node.id, phaseIdFor(node, phaseSource)]));
  const orderByPhase = new Map(phases.map((phase, order) => [phase.id, order]));
  const connections = new Map();
  for (const edge of definition.edges) {
    const fromPhaseId = phaseByNode.get(edge.from);
    const toPhaseId = phaseByNode.get(edge.to);
    if (fromPhaseId === toPhaseId) continue;
    const key = `${fromPhaseId}\u0000${toPhaseId}`;
    if (!connections.has(key)) connections.set(key, { fromPhaseId, toPhaseId, total: 0, types: {} });
    const connection = connections.get(key);
    connection.total += 1;
    connection.types[edge.type] = (connection.types[edge.type] ?? 0) + 1;
  }
  return [...connections.values()]
    .sort((left, right) => orderByPhase.get(left.fromPhaseId) - orderByPhase.get(right.fromPhaseId)
      || orderByPhase.get(left.toPhaseId) - orderByPhase.get(right.toPhaseId))
    .map((entry) => ({ ...entry, types: Object.fromEntries(Object.entries(entry.types).sort(([a], [b]) => a.localeCompare(b, 'en'))) }));
}

function base(state) {
  if (state.planned) {
    return {
      schema: SCHEMA,
      runId: null,
      workflowId: state.planned.workflowId,
      version: state.planned.version,
      definitionHash: state.planned.definitionHash,
      graphVersion: null,
      lastSeq: 0,
      revision: state.planned.definitionHash,
      status: PLANNED,
    };
  }
  return {
    schema: SCHEMA,
    runId: state.run.runId,
    graphVersion: state.run.graphVersion,
    lastSeq: state.lastSeq,
    revision: `${state.run.graphVersion}:${state.lastSeq}`,
    status: state.run.status,
    /* F3-52 (25/09/2026): una pausa o un annullamento CHIESTI e non ancora compiuti (lo stato resta «running» finché i passi in
       corso non finiscono, `run.mjs`). I controlli del diagramma non offrono di nuovo ciò che è già chiesto: il server lo
       rifiuterebbe (`WORKFLOW_RUN_STATE_CONFLICT`, «the run is already pausing»). Solo nelle viste di un run. */
    pauseRequested: state.run.pauseRequested === true,
    cancelRequested: state.run.cancelRequested === true,
  };
}

export function projectWorkflowOverview(input) {
  const state = values(input);
  const nodes = orderedNodes(state.definition);
  const { phaseSource, phases } = phasesFor(state.definition);
  const groupsByPhase = new Map(phases.map((phase) => [phase.id, []]));
  for (const node of nodes) {
    groupsByPhase.get(phaseIdFor(node, phaseSource)).push(node);
  }
  /* F3-42 (25/09/2026), decisione owner D28: l'icona di una fase viene dai RUOLI dei suoi passi (e, senza ruolo, dal tipo):
     la panoramica ne porta il conteggio, così il diagramma la sceglie senza scaricare le righe di ogni fase (a 5.000 passi
     sarebbero cento pagine). Chiavi ordinate: stessi fatti, stessi byte (ETag). */
  const tally = (members, pick) => {
    const counts = {};
    for (const node of members) { const key = pick(node); if (typeof key === 'string') counts[key] = (counts[key] ?? 0) + 1; }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'en')));
  };
  const groups = phases.map((phase, order) => {
    const members = groupsByPhase.get(phase.id);
    const { counts, terminated, attention } = countsFor(members, state);
    return { phaseId: phase.id, label: phase.label, order, total: members.length, terminated, attention, counts,
      progress: members.length && !state.planned ? terminated / members.length : null,
      roles: tally(members, (node) => node.role), kinds: tally(members, (node) => node.kind) };
  });
  const { terminated, attention } = countsFor(nodes, state);
  return { ...base(state), phaseSource, total: nodes.length, terminated, attention, groups,
    groupConnections: groupConnectionsFor(state.definition, phaseSource, phases) };
}

/* F3-42 (25/09/2026): la riga di un passo di un RUN porta anche i fatti derivati (D27) — inizio, fine, durata, sessione e
   modello effettivo — perché le card del diagramma li mostrano per ogni passo (mockup 14 e 200). `derivati` è l'indice di
   `indiceDerivati` sui passi della pagina; il grafo pianificato non ne ha (nessun fatto è ancora accaduto). */
function safeRow(node, state, events, derivati = null) {
  const dependencies = state.definition.edges.filter((edge) => edge.to === node.id && edge.type !== 'retry').length;
  const children = state.definition.edges.filter((edge) => edge.from === node.id && edge.type === 'spawn').length;
  const nodeState = state.nodes.get(node.id);
  return {
    nodeId: node.id,
    phaseId: phaseIdFor(node, phasesFor(state.definition).phaseSource),
    label: node.label,
    kind: node.kind,
    role: node.role,
    state: nodeStateOf(state, node.id),
    priority: node.priority,
    updatedAt: lastUpdated(events, node.id),
    dependencyCount: dependencies,
    childCount: children,
    attentionCount: ATTENTION.has(nodeState?.state) ? 1 : 0,
    ...(state.planned || !derivati ? {} : derivati(node.id)),
  };
}

/*
 * F3-42 (25/09/2026): `sort: 'stato'` ordina la pagina di fase per ciò che conta a chi guarda — prima chi chiede attenzione,
 *   poi chi lavora, chi aspetta, i fermati, i conclusi — e a parità nell'ordine del grafo. Serve al CAMPIONE del gruppo aperto
 *   (mockup 200/5.000: «quattro righe campione»): in ordine di grafo, a 1.120 passi la prima pagina è fatta di conclusi e chi
 *   sta lavorando non si vedrebbe mai. Senza `sort` resta l'ordine del grafo (l'elenco paginato).
 */
export const WORKFLOW_GROUP_SORTS = Object.freeze(['stato']);
const PESO_DELLO_STATO = Object.freeze({
  // F3-52: `blocked` (aspetta un passo precedente, `run.mjs:134`) pesa come `pending`; prima finiva in fondo, dopo i conclusi
  failed: 0, uncertain: 0, waiting_human: 1, reconciling: 1, leased: 2, running: 2, pending: 3, blocked: 3, ready: 3, retry_wait: 3,
  cancelled: 4, skipped: 4, superseded: 4, planned: 4, succeeded: 5,
});

export function projectWorkflowGroupPage(input, { phaseId, offset = 0, limit = 50, sort = null } = {}) {
  const state = values(input);
  const { phaseSource, phases } = phasesFor(state.definition);
  if (typeof phaseId !== 'string' || !phases.some((phase) => phase.id === phaseId)) throw new RangeError('Workflow group not found');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Workflow offset must be nonnegative');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new RangeError('Workflow limit must be 1..50');
  if (sort !== null && !WORKFLOW_GROUP_SORTS.includes(sort)) throw new RangeError('Workflow sort is invalid');
  let nodes = orderedNodes(state.definition).filter((node) => phaseIdFor(node, phaseSource) === phaseId);
  if (sort === 'stato') {
    const peso = (node) => PESO_DELLO_STATO[nodeStateOf(state, node.id)] ?? 6;
    nodes = nodes.map((node, ordine) => ({ node, ordine, peso: peso(node) }))
      .sort((a, b) => a.peso - b.peso || a.ordine - b.ordine).map((voce) => voce.node);
  }
  const pagina = nodes.slice(offset, offset + limit);
  const events = input.events ?? [];
  const derivati = state.planned ? null : indiceDerivati(events, new Set(pagina.map((node) => node.id)));
  return {
    ...base(state), phaseSource, phaseId, offset, limit, ...(sort ? { sort } : {}), total: nodes.length,
    nextOffset: offset + limit < nodes.length ? offset + limit : null,
    items: pagina.map((node) => safeRow(node, state, events, derivati)),
  };
}

/*
 * Refactor dei grafi, decisione owner 30 (26/09/2026): gli archi si chiedono solo per i GRUPPI APERTI. `phaseIds` = le fasi
 *   aperte; tornano gli archi con ENTRAMBI i capi dentro quell'insieme (l'interno di ogni fase e quelli fra due fasi aperte),
 *   mai verso una fase chiusa: lì basta il `groupConnections` contato della panoramica (gli «archi fusi» di Airflow, #67714).
 *   A 5.000 passi gli archi sono 61 pagine; una fase aperta come sottografo ne ha al più una manciata. L'insieme torna
 *   normalizzato nell'ordine delle fasi e senza doppioni: la stessa domanda dà gli stessi byte, e lo stesso ETag.
 */
export function projectWorkflowEdgePage(input, { offset = 0, limit = 50, phaseIds = null } = {}) {
  const state = values(input);
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Workflow offset must be nonnegative');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Workflow limit must be 1..100');
  let edges = [...state.definition.edges].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  let filtro = null;
  if (phaseIds !== null) {
    const { phaseSource, phases } = phasesFor(state.definition);
    if (!Array.isArray(phaseIds) || phaseIds.length === 0) throw new RangeError('Workflow phaseIds must be a nonempty list');
    const chieste = new Set(phaseIds);
    if ([...chieste].some((phaseId) => !phases.some((phase) => phase.id === phaseId))) throw new RangeError('Workflow group not found');
    filtro = phases.map((phase) => phase.id).filter((phaseId) => chieste.has(phaseId));
    const faseDi = new Map(state.definition.nodes.map((node) => [node.id, phaseIdFor(node, phaseSource)]));
    edges = edges.filter((edge) => chieste.has(faseDi.get(edge.from)) && chieste.has(faseDi.get(edge.to)));
  }
  return {
    ...base(state), ...(filtro ? { phaseIds: filtro } : {}), offset, limit, total: edges.length,
    nextOffset: offset + limit < edges.length ? offset + limit : null,
    items: edges.slice(offset, offset + limit).map((edge) => ({
      edgeId: edge.id, fromNodeId: edge.from, toNodeId: edge.to, type: edge.type,
    })),
  };
}

/*
 * ⭐ Refactor dei grafi, decisione owner 29 (26/09/2026): la storia PUBBLICA degli stati, per la riproduzione fedele del run.
 *   Le voci le scrive il riduttore (`workflowStateChanges`, `run.mjs`) e le conserva lo Store; qui si paginano. Ogni passo parte
 *   da `initialState` (`pending`, `workflowInitialState`) e chi riproduce applica le voci in ordine: a ogni `seq` ritrova lo stato
 *   del riduttore dopo quel fatto. Pagine per offset, come le altre viste v2: la storia cresce solo in coda, quindi un offset
 *   già letto non cambia mai (lo stesso patto del `next_page_token` della storia di Temporal, `GetWorkflowExecutionHistory`,
 *   letto il 26/09/2026). ⛔ Si copiano solo i campi pubblici della voce, mai la voce così com'è.
 */
export const STATE_HISTORY_PAGE_MAX = 1000;

export function projectWorkflowStateHistory(input, { offset = 0, limit = STATE_HISTORY_PAGE_MAX } = {}) {
  const state = values(input);
  if (!Array.isArray(input.history)) throw new TypeError('Workflow state history requires the reducer history');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Workflow offset must be nonnegative');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > STATE_HISTORY_PAGE_MAX) throw new RangeError(`Workflow limit must be 1..${STATE_HISTORY_PAGE_MAX}`);
  const history = input.history;
  /* la FASE di ogni passo viaggia con la voce: chi riproduce conta i passi per fase a ogni istante senza scaricare le righe
     di tutte le fasi (a 5.000 passi sarebbero cento pagine) — il dato è pubblico, è lo stesso `phaseId` delle righe */
  const { phaseSource } = phasesFor(state.definition);
  const faseDi = new Map(state.definition.nodes.map((node) => [node.id, phaseIdFor(node, phaseSource)]));
  return {
    ...base(state), initialState: 'pending', offset, limit, total: history.length,
    nextOffset: offset + limit < history.length ? offset + limit : null,
    items: history.slice(offset, offset + limit).map((voce) => (voce.scope === 'run'
      ? { seq: voce.seq, at: voce.at, scope: 'run', state: voce.state }
      : { seq: voce.seq, at: voce.at, scope: 'node', nodeId: voce.nodeId, phaseId: faseDi.get(voce.nodeId) ?? null, state: voce.state })),
  };
}

/*
 * ⭐ Refactor dei grafi, decisioni owner 24 e 30 (26/09/2026): il FOCUS «Da cosa dipende · Cosa aspetta» del prototipo approvato,
 *   a ogni scala, senza scaricare tutti gli archi (decisione 30: il client tiene solo quelli dei gruppi aperti). Il server segue
 *   gli archi della Definition — tranne `retry`, che in un ciclo torna indietro e non è una dipendenza (la stessa regola di
 *   `dependencyCount`) — e restituisce l'insieme in ordine di grafo, senza il passo stesso, paginato come la storia. È
 *   strutturale: non dipende dagli stati, quindi vale per il vivo, per la riproduzione e per un piano non ancora avviato.
 */
export const LINEAGE_DIRECTIONS = Object.freeze(['upstream', 'downstream']);
export const LINEAGE_PAGE_MAX = 1000;

export function projectWorkflowLineage(input, { nodeId, direction, offset = 0, limit = LINEAGE_PAGE_MAX } = {}) {
  const state = values(input);
  if (!LINEAGE_DIRECTIONS.includes(direction)) throw new RangeError('Workflow lineage direction is invalid');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new RangeError('Workflow offset must be nonnegative');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > LINEAGE_PAGE_MAX) throw new RangeError(`Workflow limit must be 1..${LINEAGE_PAGE_MAX}`);
  if (!state.definition.nodes.some((node) => node.id === nodeId)) throw new RangeError('Workflow node not found');
  const vicini = new Map();
  for (const edge of state.definition.edges) {
    if (edge.type === 'retry') continue;
    const [da, verso] = direction === 'upstream' ? [edge.to, edge.from] : [edge.from, edge.to];
    if (!vicini.has(da)) vicini.set(da, []);
    vicini.get(da).push(verso);
  }
  const visti = new Set([nodeId]);
  const coda = [nodeId];
  while (coda.length) for (const vicino of vicini.get(coda.pop()) ?? []) if (!visti.has(vicino)) { visti.add(vicino); coda.push(vicino); }
  visti.delete(nodeId);
  const insieme = orderedNodes(state.definition).filter((node) => visti.has(node.id)).map((node) => node.id);
  return {
    ...base(state), nodeId, direction, offset, limit, total: insieme.length,
    nextOffset: offset + limit < insieme.length ? offset + limit : null,
    items: insieme.slice(offset, offset + limit),
  };
}

/*
 * ⭐ F3 Workflow UI, decisione owner D27 (25/09/2026): i dati del mockup si DERIVANO dai fatti veri, e ciò che non ha una
 *   sorgente non si mostra. Per l'ultimo tentativo del passo: inizio (`activity_started`), fine (il primo esito dopo),
 *   durata solo se è finito (a passo in corso la calcola chi guarda, dall'inizio: il server non inventa un «adesso»), il
 *   modello EFFETTIVO e la sessione del passo da `agent_session_created` (le «Evidenze recenti» si leggono da lì, come la coda
 *   della trascrizione dei sotto-agenti di Hermes, `status-stack/subagent-transcript.tsx`). ⛔ Nessuna percentuale per il
 *   singolo passo: non esiste un fatto che la misuri.
 */
const ESITI_DEL_TENTATIVO = new Set(['activity_completed', 'activity_failed', 'node_cancelled']);
/* F3-42 (25/09/2026): i derivati di un INSIEME di passi con una passata sola sul registro — una pagina di 50 righe non
   rilegge il registro 50 volte. */
function indiceDerivati(events, nodeIds) {
  const grezzi = new Map();
  for (const event of events) {
    if (!nodeIds.has(event.nodeId)) continue;
    let voce = grezzi.get(event.nodeId);
    if (!voce) grezzi.set(event.nodeId, voce = { startedAt: null, finishedAt: null, session: null });
    if (event.type === 'activity_started') { voce.startedAt = event.at; voce.finishedAt = null; }
    else if (ESITI_DEL_TENTATIVO.has(event.type) && voce.startedAt !== null && voce.finishedAt === null) voce.finishedAt = event.at;
    else if (event.type === 'agent_session_created') voce.session = event.payload;
  }
  return (nodeId) => {
    const { startedAt = null, finishedAt = null, session = null } = grezzi.get(nodeId) ?? {};
    const durata = startedAt && finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : null;
    return { startedAt, finishedAt, durationMs: Number.isFinite(durata) && durata >= 0 ? durata : null,
      stepSessionId: session?.sessionId ?? null, effectiveModel: session ? { provider: session.provider, model: session.model } : null };
  };
}

export function projectWorkflowNodeDetail(input, { nodeId, outputOffset = 0 } = {}) {
  if (!Number.isSafeInteger(outputOffset) || outputOffset < 0) throw new RangeError('Workflow output offset must be nonnegative');
  const state = values(input);
  const node = state.definition.nodes.find((entry) => entry.id === nodeId);
  if (!node) throw new RangeError('Workflow node not found');
  const nodeState = state.nodes.get(nodeId);
  const allResultIds = nodeState?.resultRefIds ?? [];
  const resultIds = allResultIds.slice(outputOffset, outputOffset + 20);
  const events = input.events ?? [];
  /* il passo di un run porta i fatti derivati (D27), dalla sua riga. ⛔ NON il compito: il run non serializza la Definition
     (`WF-HTTP-SECRET-OMISSION`, riga 1 di questo file); il «Task corrente» si legge dalla revisione della versione
     approvata (`/workflows/{id}/versions/{v}/nodes/{id}`), che lo mostra per scelta a chi l'ha approvata. */
  return {
    ...base(state), ...safeRow(node, state, events, state.planned ? null : indiceDerivati(events, new Set([nodeId]))),
    attempt: nodeState?.attempt ?? 0,
    resultRefIds: resultIds,
    totalOutputs: allResultIds.length,
    outputOffset,
    nextOutputOffset: outputOffset + 20 < allResultIds.length ? outputOffset + 20 : null,
    /* F-014 (piano §1.6): gli OUTPUT del passo concluso — il ref (sha256) e un'ANTEPRIMA di al più
       NODE_OUTPUT_PREVIEW_MAX caratteri, con `truncated` dichiarato: la Board (§3.4) mostra
       l'anteprima e l'integrale lo serve la rotta output. Pura: viene dallo stato (summary dei
       ref), stessa domanda = stessi byte = stesso ETag. */
    outputs: resultIds
      .map((id) => state.resultRefs?.get(id))
      .filter(Boolean)
      .map((ref) => ({
        resultId: ref.id,
        sha256: ref.sha256,
        bytes: ref.bytes,
        kind: ref.kind,
        contentType: ref.contentType,
        preview: anteprimaOutput(ref.summary),
        truncated: ref.bytes > Buffer.byteLength(String(ref.summary ?? ''), 'utf8'),
      })),
  };
}

/*
 * ⭐ F3-51d (25/09/2026) — l'AGGIORNAMENTO DAL VIVO di un run (decisione owner D33: flusso dedicato, cursore sulla sequenza,
 *   riletta del grafo a un buco; RP §8.14: «snapshot + durable structural deltas», «telemetry-only update non incrementa
 *   graphVersion e non causa full relayout»). Un fotogramma dice cosa è cambiato DOPO il cursore del client: le righe pubbliche
 *   dei passi toccati (le stesse del grafo, `safeRow`), i conteggi e lo stato del run — mai un fatto del registro.
 *   `resync: true` e nessuna riga quando il client deve rileggere il grafo con l'ETag: struttura cambiata
 *   (`graph_patch_applied`, l'unico fatto che muove `graphVersion`, `run.mjs:573`), troppi passi toccati per un fotogramma,
 *   o un cursore più avanti del registro (un run che il client non conosce così).
 */
export const RUN_UPDATE_NODE_LIMIT = 50;

export function projectWorkflowRunUpdate(input, { afterSeq, limit = RUN_UPDATE_NODE_LIMIT } = {}) {
  const state = values(input);
  if (!Number.isSafeInteger(afterSeq) || afterSeq < 0) throw new RangeError('Workflow cursor must be nonnegative');
  const events = input.events ?? [];
  const nuovi = events.filter((event) => event.seq > afterSeq);
  const toccati = [...new Set(nuovi.map((event) => event.nodeId).filter((nodeId) => typeof nodeId === 'string'))];
  const byId = new Map(state.definition.nodes.map((node) => [node.id, node]));
  const resyncReason = afterSeq > state.lastSeq ? 'cursor_ahead'
    : nuovi.some((event) => event.type === 'graph_patch_applied') || toccati.some((nodeId) => !byId.has(nodeId)) ? 'graph_changed'
      : toccati.length > limit ? 'too_many_changes' : null;
  const { terminated, attention } = countsFor(state.definition.nodes, state);
  const derivati = resyncReason ? null : indiceDerivati(events, new Set(toccati));
  return {
    ...base(state), fromSeq: afterSeq + 1, total: state.definition.nodes.length, terminated, attention,
    resync: resyncReason !== null, resyncReason,
    nodes: resyncReason ? [] : toccati.sort().map((nodeId) => safeRow(byId.get(nodeId), state, events, derivati)),
  };
}

export function projectPlannedWorkflowOverview(record) {
  return projectWorkflowOverview(plannedValues(record));
}

/*
 * F3-42 (25/09/2026): la riga di un passo PIANIFICATO porta anche il modello scelto (`null` = quello della sessione,
 *   decisione owner 42) e un'ANTEPRIMA del compito — la prima riga non vuota, al più 140 caratteri — perché le card del
 *   diagramma la mostrano sotto il nome (mockup 14: «Scrive e integra il codice»). Stessa regola del cassetto di Hermes: la
 *   card porta un'anteprima corta, il testo pieno sta nel dettaglio (`plugin_api.py:371`, «cards on /board carry a
 *   200-char preview»). ⛔ Solo qui, nella vista di chi approva: le viste di un run restano senza compito
 *   (WF-HTTP-SECRET-OMISSION), e il diagramma di un run legge l'anteprima da questa pagina della sua versione.
 */
export const PLANNED_TASK_PREVIEW_MAX = 140;
/*
 * ⛔⛔ F-014 (piano 0.1.19 §1.6, 28/09) — l'ANTEPRIMA dell'OUTPUT di un nodo concluso, la stessa
 *   regola di PLANNED_TASK_PREVIEW_MAX qui accanto: al più 2.000 caratteri nel dettaglio del
 *   passo di un run; l'integrale si chiede alla rotta `.../nodes/:nodeId/output` (la Board,
 *   §3.4) o con l'attrezzo `workflow_output` (§1.5). Un'anteprima è un invito, non un tetto
 *   travestito: `truncated` dice che c'è altro.
 */
export const NODE_OUTPUT_PREVIEW_MAX = 2000;
function anteprimaOutput(summary) {
  const caratteri = [...String(summary ?? '')];
  return caratteri.length > NODE_OUTPUT_PREVIEW_MAX ? `${caratteri.slice(0, NODE_OUTPUT_PREVIEW_MAX - 1).join('').trimEnd()}…` : caratteri.join('');
}
function anteprimaCompito(instructions) {
  const riga = String(instructions ?? '').split(/\r?\n/u).map((voce) => voce.trim()).find(Boolean) ?? '';
  const caratteri = [...riga];
  return caratteri.length > PLANNED_TASK_PREVIEW_MAX ? `${caratteri.slice(0, PLANNED_TASK_PREVIEW_MAX - 1).join('').trimEnd()}…` : riga;
}

export function projectPlannedWorkflowGroupPage(record, options) {
  const pagina = projectWorkflowGroupPage(plannedValues(record), options);
  const byId = new Map(record.core.nodes.map((node) => [node.id, node]));
  return { ...pagina, items: pagina.items.map((item) => {
    const node = byId.get(item.nodeId);
    return { ...item, model: node.modelPolicy?.mode === 'explicit' ? node.modelPolicy.model : null, taskPreview: anteprimaCompito(node.instructions) };
  }) };
}

export function projectPlannedWorkflowEdgePage(record, options) {
  return projectWorkflowEdgePage(plannedValues(record), options);
}

// Refactor dei grafi: il focus anche su un piano non ancora avviato (la struttura è la stessa, gli stati non servono)
export function projectPlannedWorkflowLineage(record, options) {
  return projectWorkflowLineage(plannedValues(record), options);
}

/*
 * Il dettaglio di un passo PIANIFICATO dice che cosa farà: senza, «Approva» firmerebbe un compito che nessuno ha letto.
 *   È la metà «il Core intero solo come risorsa paginata» della mappa F3-21, un passo alla volta (istruzioni ≤ 32 KB per
 *   contratto, `contract.mjs:302`), come il cassetto di Hermes che dà il testo pieno solo nel dettaglio
 *   (`plugin_api.py:371`: «Drawer returns the FULL summary (cards on /board carry a 200-char preview)»). ⛔ Non escono `workspacePolicy` (percorsi della macchina) né `resultRefIds`, che in un piano
 *   non esistono; le viste dei run restano senza istruzioni (WF-HTTP-SECRET-OMISSION). `model: null` = il modello della
 *   sessione (decisione owner 42); `dependsOn` elenca al più 50 predecessori, `dependencyCount` li conta tutti.
 */
export function projectPlannedWorkflowNodeDetail(record, { nodeId } = {}) {
  const input = plannedValues(record);
  const { resultRefIds, ...detail } = projectWorkflowNodeDetail(input, { nodeId });
  const node = record.core.nodes.find((entry) => entry.id === nodeId);
  const dependsOn = record.core.edges.filter((edge) => edge.to === nodeId && edge.type !== 'retry')
    .map((edge) => edge.from).sort((left, right) => left.localeCompare(right, 'en')).slice(0, 50);
  return {
    ...detail,
    instructions: node.instructions,
    taskPreview: anteprimaCompito(node.instructions), // F3-42: la stessa anteprima della riga, per chi la chiede passo per passo
    capabilityProfile: node.capabilityProfile,
    model: node.modelPolicy?.mode === 'explicit' ? node.modelPolicy.model : null,
    dependsOn,
  };
}
