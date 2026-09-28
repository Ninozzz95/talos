/*
 * ⭐ Refactor dei grafi, decisioni owner 29 e 30 (26/09/2026): la riproduzione del run è FEDELE — si rigioca la storia
 *   pubblica degli stati letta dal riduttore, paginata — e gli archi si chiedono solo per i gruppi aperti (filtro per fase).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { canonicalHash } from '../src/workflow/canonical-json.mjs';
import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';
import { workflowApply, workflowInitialState, workflowReplay, workflowStateChanges } from '../src/workflow/run.mjs';
import { LINEAGE_PAGE_MAX, projectWorkflowEdgePage, projectWorkflowLineage, projectWorkflowStateHistory, STATE_HISTORY_PAGE_MAX } from '../src/workflow/read-model.mjs';
import { proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { appendEvent, approveDefinition, createDefinition, createRun, createWorkflowStore, readRunHistory } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const diamond = JSON.parse(await readFile(new URL('./fixtures/workflow/definitions/core-v1-diamond.json', import.meta.url), 'utf8'));
const record = JSON.parse(await readFile(new URL('./fixtures/workflow/records/definition-record-v1.json', import.meta.url), 'utf8'));
const approval = JSON.parse(await readFile(new URL('./fixtures/workflow/records/approval-v1.json', import.meta.url), 'utf8'));
const RUN = '10000000-0000-4000-8000-000000000001';
const ROOT_SESSION = '40000000-0000-4000-8000-000000000001';
const OTHER_SESSION = '40000000-0000-4000-8000-000000000002';

function evento(seq, type, payload = {}, overrides = {}) {
  return {
    schema: 'talos.workflow-event.v1', eventSchemaVersion: 1, engineSchemaVersion: 1,
    eventId: `20000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    runId: RUN, seq, at: `2026-09-26T09:00:${String(seq).padStart(2, '0')}.000Z`,
    type, nodeId: null, commandId: null, commandType: null, commandPayloadHash: null,
    causationId: null, correlationId: RUN, graphVersion: 1,
    activityExecutionId: null, attempt: null, leaseId: null, leaseEpoch: null,
    payload, ...overrides,
  };
}
const comando = (n, tipo) => ({ commandId: `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`, commandType: tipo, commandPayloadHash: `sha256:${String(n % 10).repeat(64)}` });
const nato = (definition, workflowId, version) => evento(1, 'run_created', {
  workflowId, definitionVersion: version, definitionHash: canonicalHash(definition),
  rootSessionId: ROOT_SESSION, workspaceBaselineId: null, workspaceBaselineHash: null,
}, comando(1, 'start-run'));

/* Un run del rombo root → (left, right) → join con una pausa in mezzo e un fallimento: passi mossi da fatti che non li
   nominano (`refreshReadyNodes`: join resta bloccato, left e right diventano pronti quando root finisce) e stati del run. */
const eventiDelRombo = () => [
  nato(diamond, '30000000-0000-4000-8000-000000000001', 1),
  evento(2, 'run_started'),
  evento(3, 'node_started', { trigger: 'deterministic' }, { nodeId: 'root' }),
  evento(4, 'node_succeeded', { resultIds: [] }, { nodeId: 'root' }),
  evento(5, 'run_pause_requested', { reason: 'user' }, comando(5, 'pause-run')),
  evento(6, 'run_paused', { reason: 'user' }),
  evento(7, 'run_resumed', { reason: 'user' }, comando(7, 'resume-run')),
  evento(8, 'node_started', { trigger: 'deterministic' }, { nodeId: 'left' }),
  evento(9, 'node_failed', { errorClass: 'internal', evidenceResultIds: [] }, { nodeId: 'left' }),
  evento(10, 'node_started', { trigger: 'deterministic' }, { nodeId: 'right' }),
  evento(11, 'node_succeeded', { resultIds: [] }, { nodeId: 'right' }),
];

function storiaDalRiduttore(definition, events) {
  let state = workflowInitialState({ definition, runId: RUN });
  const storia = [];
  for (const event of events) {
    const next = workflowApply(state, event);
    storia.push(...workflowStateChanges(state, next, event));
    state = next;
  }
  return { state, storia };
}

/* Chi riproduce parte da `initialState` per ogni passo e applica le voci in ordine: deve ritrovare, a OGNI sequenza, gli
   stati che il riduttore ha dopo quel fatto — la definizione operativa di «fedele». */
function statiRigiocati(nodeIds, storia, finoA) {
  const nodi = new Map(nodeIds.map((id) => [id, 'pending']));
  let run = null;
  for (const voce of storia) {
    if (voce.seq > finoA) break;
    if (voce.scope === 'run') run = voce.state; else nodi.set(voce.nodeId, voce.state);
  }
  return { run, nodi: Object.fromEntries(nodi) };
}

test('WF-HISTORY-FAITHFUL — a ogni sequenza la storia rigiocata dà gli stati del riduttore, anche quelli che nessun fatto nomina', () => {
  const events = eventiDelRombo();
  const { storia } = storiaDalRiduttore(diamond, events);
  const ids = diamond.nodes.map((node) => node.id);
  for (let k = 1; k <= events.length; k++) {
    const atteso = workflowReplay({ definition: diamond, runId: RUN, events: events.slice(0, k) });
    const rigiocato = statiRigiocati(ids, storia, k);
    assert.equal(rigiocato.run, atteso.run.status, `run al seq ${k}`);
    assert.deepEqual(rigiocato.nodi, Object.fromEntries(ids.map((id) => [id, atteso.nodes.get(id).state])), `passi al seq ${k}`);
  }
  // i passi mossi da fatti che non li nominano ci sono: al via root è pronto e gli altri bloccati; finito root, left e right pronti
  assert.deepEqual(storia.filter((voce) => voce.seq === 2).map((voce) => [voce.scope, voce.nodeId ?? null, voce.state]),
    [['run', null, 'running'], ['node', 'root', 'ready'], ['node', 'left', 'blocked'], ['node', 'right', 'blocked'], ['node', 'join', 'blocked']]);
  assert.deepEqual(storia.filter((voce) => voce.seq === 4).map((voce) => [voce.nodeId, voce.state]),
    [['root', 'succeeded'], ['left', 'ready'], ['right', 'ready']]);
  // la pausa chiesta non cambia lo stato pubblico del run (resta «running» finché non è compiuta): nessuna voce al seq 5
  assert.equal(storia.some((voce) => voce.seq === 5), false);
  // e lo stato DERIVATO del run: left fallito, right finito, join non può partire ⇒ «Serve attenzione» senza un fatto che lo
  // nomini (`deriveAttentionFromFailedNodes`, `run.mjs`) — proprio il genere di cambio che una ricostruzione dai tipi perderebbe
  assert.deepEqual(storia.filter((voce) => voce.scope === 'run').map((voce) => [voce.seq, voce.state]),
    [[1, 'created'], [2, 'running'], [6, 'paused'], [7, 'running'], [11, 'needs_attention']]);
  // ogni voce porta l'ora del SUO fatto, e nient'altro
  for (const voce of storia) {
    assert.equal(voce.at, events[voce.seq - 1].at);
    assert.deepEqual(Object.keys(voce).sort(), voce.scope === 'run' ? ['at', 'scope', 'seq', 'state'] : ['at', 'nodeId', 'scope', 'seq', 'state']);
    assert.equal(Object.isFrozen(voce), true);
  }
});

test('WF-HISTORY-PAGE — pagine limitate con cursore, stato iniziale dichiarato, nessun dato privato', () => {
  const events = eventiDelRombo();
  const { state, storia } = storiaDalRiduttore(diamond, events);
  state.definition = diamond;
  const input = { state, events, history: storia };
  const prima = projectWorkflowStateHistory(input, { offset: 0, limit: 4 });
  assert.equal(prima.schema, 'talos.workflow-graph-view.v2');
  assert.equal(prima.runId, RUN);
  assert.equal(prima.lastSeq, 11);
  assert.equal(prima.initialState, 'pending');
  assert.equal(prima.total, storia.length);
  assert.equal(prima.items.length, 4);
  assert.equal(prima.nextOffset, 4);
  const tutte = [];
  for (let offset = 0; offset !== null;) {
    const pagina = projectWorkflowStateHistory(input, { offset, limit: 4 });
    tutte.push(...pagina.items);
    offset = pagina.nextOffset;
  }
  // la fase viaggia con ogni voce di passo (una Definition v1 ha la sola fase «Senza fase»)
  assert.deepEqual(tutte, storia.map((voce) => (voce.scope === 'node' ? { ...voce, phaseId: 'legacy-unassigned' } : { ...voce })));
  assert.equal(STATE_HISTORY_PAGE_MAX, 1000);
  assert.equal(projectWorkflowStateHistory(input).limit, 1000);
  for (const sbagliata of [{ limit: 0 }, { limit: 1001 }, { offset: -1 }, { offset: 1.5 }]) {
    assert.throws(() => projectWorkflowStateHistory(input, sbagliata), RangeError, JSON.stringify(sbagliata));
  }
  assert.throws(() => projectWorkflowStateHistory({ state, events }), TypeError);
  // una voce con campi in più (un domani) non passa per la vista: si copiano solo i campi pubblici
  const sporca = { state, events, history: [{ seq: 1, at: events[0].at, scope: 'node', nodeId: 'root', state: 'ready', segreto: 'NO' }] };
  assert.doesNotMatch(JSON.stringify(projectWorkflowStateHistory(sporca)), /segreto|NO"/);
  assert.doesNotMatch(JSON.stringify(prima), /instructions|workspacePolicy|resultRefIds/);
});

function inFasi() {
  const nodes = ['a1', 'a2', 'b1', 'b2', 'c1'].map((id, priority) => ({ id, kind: 'agent', label: id.toUpperCase(), role: null, priority, phaseId: id[0] }));
  const edges = [
    { id: 'e-a1-a2', from: 'a1', to: 'a2', type: 'control' },
    { id: 'e-a2-b1', from: 'a2', to: 'b1', type: 'data' },
    { id: 'e-b1-b2', from: 'b1', to: 'b2', type: 'control' },
    { id: 'e-b2-c1', from: 'b2', to: 'c1', type: 'control' },
    { id: 'e-a1-c1', from: 'a1', to: 'c1', type: 'review' },
  ];
  return {
    state: {
      run: { runId: RUN, status: 'running', graphVersion: 1 },
      definition: { schema: 'talos.workflow-definition-core.v2', phases: ['a', 'b', 'c'].map((id) => ({ id, label: id })), nodes, edges },
      nodes: new Map(nodes.map((node) => [node.id, { nodeId: node.id, state: 'pending', resultRefIds: [] }])),
      lastSeq: 3,
    },
    events: [],
  };
}

test('WF-EDGES-BY-PHASE — gli archi dei gruppi aperti: interni alle fasi chieste e fra di loro, mai verso una fase chiusa', () => {
  const input = inFasi();
  const ids = (pagina) => pagina.items.map((arco) => arco.edgeId);
  assert.deepEqual(ids(projectWorkflowEdgePage(input, { phaseIds: ['a'] })), ['e-a1-a2']);
  assert.deepEqual(ids(projectWorkflowEdgePage(input, { phaseIds: ['b', 'a'] })), ['e-a1-a2', 'e-a2-b1', 'e-b1-b2']);
  const tre = projectWorkflowEdgePage(input, { phaseIds: ['c', 'a', 'b', 'a'] });
  assert.equal(tre.total, 5);
  // l'insieme torna normalizzato (ordine delle fasi, senza doppioni): stessa richiesta, stessi byte, stesso ETag
  assert.deepEqual(tre.phaseIds, ['a', 'b', 'c']);
  // senza filtro la pagina resta quella di sempre, senza il campo
  const tutti = projectWorkflowEdgePage(input, {});
  assert.equal(tutti.total, 5);
  assert.equal(Object.hasOwn(tutti, 'phaseIds'), false);
  const paginata = projectWorkflowEdgePage(input, { phaseIds: ['a', 'b'], offset: 1, limit: 1 });
  assert.deepEqual([ids(paginata), paginata.total, paginata.nextOffset], [['e-a2-b1'], 3, 2]);
  assert.throws(() => projectWorkflowEdgePage(input, { phaseIds: ['z'] }), RangeError);
  assert.throws(() => projectWorkflowEdgePage(input, { phaseIds: [] }), RangeError);
  assert.throws(() => projectWorkflowEdgePage(input, { phaseIds: 'a' }), RangeError);
});

test('WF-LINEAGE — a monte e a valle seguono le dipendenze vere, in ordine di grafo, senza il passo stesso e senza gli archi retry', () => {
  const input = inFasi();
  input.state.definition.edges.push({ id: 'e-c1-a1-retry', from: 'c1', to: 'a1', type: 'retry' });
  const insieme = (nodeId, direction, extra = {}) => projectWorkflowLineage(input, { nodeId, direction, ...extra });
  assert.deepEqual(insieme('c1', 'upstream').items, ['a1', 'a2', 'b1', 'b2']);
  assert.deepEqual(insieme('a1', 'downstream').items, ['a2', 'b1', 'b2', 'c1']);
  // l'arco `retry` torna indietro nel ciclo: c1 non «aspetta» a1 per questo, e a1 non dipende da c1
  assert.deepEqual(insieme('c1', 'downstream').items, []);
  assert.deepEqual(insieme('a1', 'upstream').items, []);
  assert.deepEqual(insieme('b1', 'upstream').items, ['a1', 'a2']);
  const pagina = insieme('a1', 'downstream', { offset: 1, limit: 2 });
  assert.deepEqual([pagina.items, pagina.total, pagina.nextOffset, pagina.nodeId, pagina.direction], [['b1', 'b2'], 4, 3, 'a1', 'downstream']);
  assert.equal(LINEAGE_PAGE_MAX, 1000);
  assert.throws(() => insieme('zz', 'upstream'), RangeError);
  assert.throws(() => insieme('a1', 'sideways'), RangeError);
  assert.throws(() => insieme('a1', 'upstream', { limit: 1001 }), RangeError);
});

async function storeVero(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-history-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  await createDefinition(store, { record });
  await approveDefinition(store, { approval });
  return { store, root };
}
const eventiDelMinimo = () => [
  nato(record.core, record.workflowId, record.version),
  evento(2, 'run_started'),
  evento(3, 'node_started', { trigger: 'deterministic' }, { nodeId: 'implement' }),
  evento(4, 'node_succeeded', { resultIds: [] }, { nodeId: 'implement' }),
];

test('WF-HISTORY-STORE — la storia della cache cresce con gli append ed è identica a quella del rigioco da disco', async (t) => {
  const { store, root } = await storeVero(t);
  const events = eventiDelMinimo();
  await createRun(store, { event: events[0] });
  for (const event of events.slice(1)) await appendEvent(store, { event });
  const dallaCache = await readRunHistory(store, { runId: RUN });
  const { storia } = storiaDalRiduttore(record.core, events);
  assert.deepEqual(dallaCache.history.map((voce) => ({ ...voce })), storia.map((voce) => ({ ...voce })));
  assert.equal(dallaCache.state.lastSeq, 4);
  assert.equal(dallaCache.events[0].payload.rootSessionId, ROOT_SESSION);
  // chi legge non tocca la cache: una pagina mutata non cambia la lettura dopo
  dallaCache.history.length = 0;
  assert.equal((await readRunHistory(store, { runId: RUN })).history.length, storia.length);
  // un secondo Store sulla stessa cartella parte senza gli eventi in cache (scansione d'avvio): rigioca dal disco
  await store.close();
  const riaperto = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  try {
    const dalDisco = await readRunHistory(riaperto, { runId: RUN });
    assert.deepEqual(dalDisco.history.map((voce) => ({ ...voce })), storia.map((voce) => ({ ...voce })));
  } finally { await riaperto.close(); }
});

async function avviaApp(t, workflowStore) {
  const registry = { leggiSessioneContesto: (id) => [ROOT_SESSION, OTHER_SESSION].includes(id) ? { sessionId: id } : null };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry, workflowStore }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('WF-HTTP-HISTORY / WF-HTTP-EDGES-PHASE — rotte di sola lettura, limitate, con ETag e proprietà della sessione', async (t) => {
  const { store } = await storeVero(t);
  const events = eventiDelMinimo();
  await createRun(store, { event: events[0] });
  for (const event of events.slice(1)) await appendEvent(store, { event });
  const base = await avviaApp(t, store);
  const run = `${base}/api/v1/sessions/${ROOT_SESSION}/workflows/${RUN}`;
  const prima = await fetch(`${run}/history?offset=0&limit=2`);
  assert.equal(prima.status, 200);
  const corpo = await prima.json();
  assert.equal(corpo.data.total, storiaDalRiduttore(record.core, events).storia.length);
  assert.equal(corpo.data.items.length, 2);
  assert.equal(corpo.data.nextOffset, 2);
  // «aggiornato alle» è l'ora dell'ULTIMO fatto del giornale, anche se la lettura non ne ricopia gli eventi
  assert.equal(corpo.meta.generatedAt, events.at(-1).at);
  assert.equal((await (await fetch(`${run}/history?limit=1000`)).json()).data.limit, 1000);
  const etag = prima.headers.get('etag');
  assert.match(etag, /^"sha256:/);
  assert.equal((await fetch(`${run}/history?offset=0&limit=2`, { headers: { 'If-None-Match': etag } })).status, 304);
  assert.equal((await fetch(`${run}/history`, { method: 'HEAD' })).status, 200);
  for (const query of ['?limit=1001', '?limit=0', '?offset=0&offset=1', '?sort=stato', '?phaseId=legacy-unassigned']) {
    assert.equal((await fetch(`${run}/history${query}`)).status, 400, query);
  }
  assert.equal((await fetch(`${base}/api/v1/sessions/${OTHER_SESSION}/workflows/${RUN}/history`)).status, 404);
  assert.equal((await fetch(`${run}/history`, { method: 'POST' })).status !== 200, true);
  // gli archi per fase: una Definition v1 ha la sola fase «Senza fase»
  const archi = await fetch(`${run}/edges?phaseId=legacy-unassigned&offset=0&limit=100`);
  assert.equal(archi.status, 200);
  const datiArchi = (await archi.json()).data;
  assert.deepEqual([datiArchi.phaseIds, datiArchi.items.map((arco) => arco.edgeId)], [['legacy-unassigned'], ['implement_to_test']]);
  assert.equal((await fetch(`${run}/edges?phaseId=nessuna`)).status, 404);
  assert.equal((await fetch(`${run}/edges?phaseId=`)).status, 400);
  assert.equal((await fetch(`${run}/edges?phaseId=${'x'.repeat(129)}`)).status, 400);
  assert.equal((await fetch(`${run}/edges?${Array.from({ length: 65 }, (_, i) => `phaseId=f${i}`).join('&')}`)).status, 400);
  assert.equal((await fetch(`${run}/edges?offset=0&offset=1&phaseId=legacy-unassigned`)).status, 400);
  // senza filtro la rotta risponde come sempre
  assert.equal((await (await fetch(`${run}/edges`)).json()).data.total, 1);
  // la discendenza del passo (focus a monte e a valle)
  const giu = await fetch(`${run}/nodes/implement/lineage?direction=downstream`);
  assert.equal(giu.status, 200);
  assert.deepEqual((await giu.json()).data.items, ['test']);
  assert.deepEqual((await (await fetch(`${run}/nodes/test/lineage?direction=upstream&limit=1000`)).json()).data.items, ['implement']);
  for (const query of ['', '?direction=sideways', '?direction=upstream&direction=upstream', '?direction=upstream&limit=1001', '?direction=upstream&sort=stato']) {
    assert.equal((await fetch(`${run}/nodes/test/lineage${query}`)).status, 400, query);
  }
  assert.equal((await fetch(`${run}/nodes/nessuno/lineage?direction=upstream`)).status, 404);
  assert.equal((await fetch(`${run}/nodes/te%2Fst/lineage?direction=upstream`)).status, 404);
  // un `%2F` nell'id resta dentro l'id: questo è il DETTAGLIO del passo «test/lineage» (che non esiste), non la discendenza di «test»
  assert.equal((await fetch(`${run}/nodes/test%2Flineage`)).status, 404);
  assert.equal((await fetch(`${base}/api/v1/sessions/${OTHER_SESSION}/workflows/${RUN}/nodes/test/lineage?direction=upstream`)).status, 404);
  // il dettaglio del passo resta quello di sempre
  assert.equal((await (await fetch(`${run}/nodes/test`)).json()).data.nodeId, 'test');
});

test('WF-HTTP-PLANNED-LINEAGE-EDGES — anche un piano non avviato ha la discendenza e gli archi per fase', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-history-plan-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [], resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  t.after(async () => { await store.close(); rimuoviCartellaDiProva(root); });
  const core = structuredClone(record.core);
  core.schema = 'talos.workflow-definition-core.v2'; core.definitionSchemaVersion = 2;
  core.phases = [{ id: 'implementation', label: 'Implementazione' }, { id: 'verification', label: 'Verifica' }];
  core.nodes[0].phaseId = 'implementation'; core.nodes[1].phaseId = 'verification';
  const proposta = await proposeWorkflowFromTool(store, { sessionId: ROOT_SESSION, toolCallId: 'storia_piano', core, plannerModel: null,
    sessionModel: 'provider/model', modalitaOperativa: 'normale', agentRole: 'root' });
  const base = await avviaApp(t, store);
  const versione = `${base}/api/v1/workflows/${proposta.workflowId}/versions/1`;
  const archi = async (query) => (await (await fetch(`${versione}/edges${query}`)).json()).data;
  // l'arco implement → test va da una fase all'altra: con una fase sola aperta non c'è, con le due sì
  assert.deepEqual((await archi('?phaseId=implementation')).items, []);
  assert.deepEqual((await archi('?phaseId=verification&phaseId=implementation')).items.map((arco) => arco.edgeId), ['implement_to_test']);
  assert.equal((await fetch(`${versione}/edges?phaseId=nessuna`)).status, 404);
  assert.equal((await archi('')).total, 1);
  const su = await fetch(`${versione}/nodes/test/lineage?direction=upstream`);
  assert.equal(su.status, 200);
  assert.deepEqual((await su.json()).data.items, ['implement']);
  assert.equal((await fetch(`${versione}/nodes/test/lineage?direction=avanti`)).status, 400);
  assert.equal((await fetch(`${versione}/nodes/nessuno/lineage?direction=upstream`)).status, 404);
  // l'inventario conosce le rotte nuove, solo in lettura
  for (const percorso of [`/api/v1/workflows/${proposta.workflowId}/versions/1/nodes/test/lineage`,
    `/api/v1/sessions/${ROOT_SESSION}/workflows/${RUN}/nodes/test/lineage`, `/api/v1/sessions/${ROOT_SESSION}/workflows/${RUN}/history`]) {
    assert.deepEqual(metodiAmmessiPerRotta(percorso), ['GET', 'HEAD'], percorso);
  }
});
