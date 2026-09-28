/*
 * F3-51d (25/09/2026) — il FLUSSO DAL VIVO di un run (decisione owner D33: SSE dedicato, cursore sulla sequenza del registro,
 * riletta del grafo a un buco; RP §8.14: cursore, buchi, riallineamento, contropressione limitata per client). Server HTTP vero
 * in processo, runtime vero (Store, orchestratore, scheduler), passo eseguito da un adattatore finto con un cancello.
 * Ledger: `.claude/LEDGER-F3-51-CONTROLLI-DEL-RUN-2026-09-25.md`.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createHttpApp, metodiAmmessiPerRotta } from '../src/http-app.mjs';
import { createWorkflowOrchestrator } from '../src/workflow-orchestrator.mjs';
import { approveWorkflowProposal, proposeWorkflowFromTool } from '../src/workflow/planning-control.mjs';
import { runStreamCursor, serveWorkflowRunStream } from '../src/workflow/run-stream.mjs';
import { projectWorkflowRunUpdate, RUN_UPDATE_NODE_LIMIT } from '../src/workflow/read-model.mjs';
import { createCapacitaAdattiva, createWorkflowScheduler } from '../src/workflow/scheduler.mjs';
import { countRunWatchers, createWorkflowStore, readRunState } from '../src/workflow/store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const sessionId = '84000000-0000-4000-8000-000000000001';
const altraSessione = '84000000-0000-4000-8000-000000000002';
const BOZZA = {
  title: 'Prova flusso', objective: 'Provare il flusso dal vivo.',
  phases: [{ id: 'f', label: 'Fase' }],
  nodes: [
    { id: 'uno', phase: 'f', label: 'Uno', task: 'Fai uno.' },
    { id: 'dopo', phase: 'f', label: 'Dopo', task: 'Dopo uno.', dependsOn: ['uno'] },
  ],
};
const CONSUMO = { promptTokens: 3, completionTokens: 1, wallMs: 0, agentSeconds: 0, toolCalls: 0, modelRequests: 1, knownCostUsd: null };

function adattatoreFinto() {
  const cancelli = new Map();
  const tentativi = new Map();
  return {
    id: 'finto-flusso',
    tentativi,
    chiudi(nodeId) { let apri; const promessa = new Promise((r) => { apri = r; }); cancelli.set(nodeId, { promessa, apri }); },
    apri(nodeId) { cancelli.get(nodeId)?.apri(); cancelli.delete(nodeId); },
    async execute(ctx) {
      const n = (tentativi.get(ctx.nodeId) ?? 0) + 1;
      tentativi.set(ctx.nodeId, n);
      if (cancelli.has(ctx.nodeId)) await cancelli.get(ctx.nodeId).promessa;
      return { status: 'completed', receiptRef: `finto:${ctx.nodeId}:${n}`, results: [], actualUsage: CONSUMO };
    },
    async reconcile() { return { outcome: 'proved_not_performed', receiptRef: null, resultIds: [], actualUsage: null }; },
    async cancel(ctx) { this.apri(ctx.nodeId); return { outcome: 'cancelled', evidenceResultIds: [] }; },
  };
}

async function aspettaChe(condizione, ms = 15_000) {
  const fine = Date.now() + ms;
  while (Date.now() < fine) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, 5));
  }
  return Boolean(await condizione());
}

async function banco(t, { conStore = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-http-run-stream-'));
  const store = await createWorkflowStore({ workflowDataRoot: root, workspaceRoots: [],
    resultLimits: { maxItemBytes: 1_048_576, maxRunBytes: 8_388_608 } });
  const finto = adattatoreFinto();
  const capacita = createCapacitaAdattiva();
  const orchestrator = createWorkflowOrchestrator({ store, capacityFn: () => capacita.politica(),
    adapters: new Map([['agent-session', finto]]) });
  const errori = [];
  const scheduler = createWorkflowScheduler({ orchestrator, store, capacita, onErrore: (errore) => errori.push(errore) });
  await orchestrator.recover();
  const registry = { leggiSessioneContesto: (id) => ([sessionId, altraSessione].includes(id) ? { sessionId: id } : null) };
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry,
    workflowStore: conStore ? store : null, workflowRuntime: conStore ? { orchestrator, scheduler, capacita } : null, token: 'secret' }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const aperti = new Set();
  t.after(async () => {
    for (const controllo of aperti) controllo.abort();
    scheduler.ferma();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await store.close();
    rimuoviCartellaDiProva(root);
  });
  const proposta = await proposeWorkflowFromTool(store, { sessionId, toolCallId: `call_${randomUUID()}`, draft: BOZZA,
    plannerModel: null, sessionModel: 'z-ai/glm-5.3-flash', modalitaOperativa: 'normale', agentRole: 'root' });
  await approveWorkflowProposal(store, { workflowId: proposta.workflowId, version: 1, definitionHash: proposta.definitionHash,
    commandId: randomUUID() }, { sessionExistsFn: (id) => id === sessionId });
  const base = `http://127.0.0.1:${server.address().port}`;
  const avvia = async () => (await (await fetch(`${base}/api/v1/workflows/${proposta.workflowId}/versions/1/start`, { method: 'POST',
    headers: { Cookie: 'talos_token=secret', 'Content-Type': 'application/json' },
    body: JSON.stringify({ commandId: randomUUID(), definitionHash: proposta.definitionHash }) })).json()).data.runId;
  const flusso = (runId, { after, lastEventId, sessione = sessionId, query } = {}) => {
    const controllo = new AbortController(); aperti.add(controllo);
    const q = query ?? (after === undefined ? '' : `?after=${after}`);
    const headers = { Cookie: 'talos_token=secret', ...(lastEventId === undefined ? {} : { 'Last-Event-ID': String(lastEventId) }) };
    return fetch(`${base}/api/v1/sessions/${sessione}/workflows/${runId}/events${q}`, { headers, signal: controllo.signal })
      .then((risposta) => Object.assign(risposta, { controllo }));
  };
  const stato = async (runId) => (await readRunState(store, { runId })).state;
  return { store, finto, errori, base, avvia, flusso, stato };
}

/** I fotogrammi SSE di una risposta fetch, man mano che arrivano (`id`, `event`, `data` già letto come JSON). */
function lettore(risposta) {
  const reader = risposta.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finito = false;
  const fotogrammi = [];
  const commenti = [];
  const pompa = (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) { finito = true; return; }
      buffer += decoder.decode(value, { stream: true });
      let fine;
      while ((fine = buffer.indexOf('\n\n')) >= 0) {
        const blocco = buffer.slice(0, fine); buffer = buffer.slice(fine + 2);
        const campi = { id: null, event: 'message', data: null };
        for (const riga of blocco.split('\n')) {
          if (riga.startsWith(':')) { commenti.push(riga); continue; }
          const due = riga.indexOf(':');
          const nome = riga.slice(0, due); const valore = riga.slice(due + 1).replace(/^ /u, '');
          if (nome === 'id') campi.id = valore; else if (nome === 'event') campi.event = valore; else if (nome === 'data') campi.data = JSON.parse(valore);
        }
        if (campi.data !== null) fotogrammi.push(campi);
      }
    }
  })();
  return { fotogrammi, commenti, get finito() { return finito; }, pompa };
}

test('WF-STREAM-LIVE: the run is followed live from the graph cursor to the end, then the browser is told to stop reconnecting', { timeout: 60_000 }, async (t) => {
  const b = await banco(t);
  b.finto.chiudi('uno');
  const runId = await b.avvia();
  assert.ok(await aspettaChe(() => b.finto.tentativi.get('uno') === 1), 'the step is at work');
  const inizio = (await b.stato(runId)).lastSeq;
  const risposta = await b.flusso(runId, { after: inizio });
  assert.equal(risposta.status, 200);
  assert.match(risposta.headers.get('content-type'), /^text\/event-stream/u);
  assert.equal(risposta.headers.get('cache-control'), 'no-store');
  const l = lettore(risposta);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(l.fotogrammi.length, 0, 'a client already at the cursor gets nothing to replay');
  b.finto.apri('uno');
  assert.ok(await aspettaChe(() => l.finito), 'the stream closes when the run ends');
  const fine = await b.stato(runId);
  assert.equal(fine.run.status, 'succeeded');
  assert.ok(l.fotogrammi.length >= 1);
  for (const f of l.fotogrammi) assert.equal(f.event, 'run-update');
  // i cursori crescono, ogni fotogramma riprende esattamente dal precedente (niente buchi, niente doppioni)
  let atteso = inizio + 1;
  for (const f of l.fotogrammi) {
    assert.equal(f.data.fromSeq, atteso, 'contiguous frames');
    assert.equal(Number(f.id), f.data.lastSeq);
    atteso = f.data.lastSeq + 1;
  }
  const ultimo = l.fotogrammi.at(-1);
  assert.equal(Number(ultimo.id), fine.lastSeq, 'the last id is the journal head');
  assert.equal(ultimo.data.status, 'succeeded');
  assert.equal(ultimo.data.terminated, 2);
  const righe = new Map(l.fotogrammi.flatMap((f) => f.data.nodes).map((riga) => [riga.nodeId, riga]));
  assert.equal(righe.get('uno')?.state, 'succeeded');
  assert.equal(righe.get('dopo')?.state, 'succeeded');
  assert.ok(l.fotogrammi.every((f) => f.data.resync === false && f.data.graphVersion === 1));
  // niente contenuto del registro nei fotogrammi: solo le righe pubbliche del grafo
  const testo = JSON.stringify(l.fotogrammi);
  for (const vietato of ['payload', 'receiptRef', 'finto:', 'task', 'commandPayloadHash']) assert.ok(!testo.includes(vietato), vietato);
  // la riconnessione del browser col suo ultimo id, a run finito: 204 = smetti di riconnetterti (WHATWG)
  const riconnessione = await b.flusso(runId, { lastEventId: ultimo.id });
  assert.equal(riconnessione.status, 204);
  assert.deepEqual(b.errori, []);
});

test('WF-STREAM-GAP-RESYNC: a client behind gets ONE frame covering the gap, a client ahead is told to re-read the graph, and Last-Event-ID wins over ?after', { timeout: 60_000 }, async (t) => {
  const b = await banco(t);
  const runId = await b.avvia();
  assert.ok(await aspettaChe(async () => (await b.stato(runId)).run.status === 'succeeded'));
  const testa = (await b.stato(runId)).lastSeq;
  assert.ok(testa > 5, `a finished run has several facts (${testa})`);
  // indietro di molti fatti: un fotogramma solo, da after+1 alla testa, poi chiusura (run finito)
  const indietro = lettore(await b.flusso(runId, { after: 1 }));
  await indietro.pompa;
  assert.equal(indietro.fotogrammi.length, 1, 'the gap is one coalesced frame');
  assert.deepEqual([indietro.fotogrammi[0].data.fromSeq, indietro.fotogrammi[0].data.lastSeq, indietro.fotogrammi[0].data.resync], [2, testa, false]);
  // avanti rispetto al registro (un run che il client non conosce così): rileggi il grafo
  const avanti = lettore(await b.flusso(runId, { lastEventId: testa + 40 }));
  await avanti.pompa;
  assert.equal(avanti.fotogrammi.length, 1);
  assert.deepEqual([avanti.fotogrammi[0].data.resync, avanti.fotogrammi[0].data.resyncReason, avanti.fotogrammi[0].data.nodes], [true, 'cursor_ahead', []]);
  assert.equal(Number(avanti.fotogrammi[0].id), testa, 'the resync frame moves the cursor back to the head');
  // Last-Event-ID (riconnessione) vince su ?after (prima apertura)
  assert.equal((await b.flusso(runId, { after: 1, lastEventId: testa })).status, 204);
  assert.equal(runStreamCursor({ lastEventId: '7', after: '3' }), 7);
  assert.equal(runStreamCursor({ after: '3' }), 3);
  assert.equal(runStreamCursor({}), 0);
});

test('WF-STREAM-SCOPE: foreign session, unknown run, bad cursor, extra query, no Store — and the route declares GET and HEAD', { timeout: 60_000 }, async (t) => {
  const b = await banco(t);
  const runId = await b.avvia();
  assert.equal((await b.flusso(runId, { sessione: altraSessione })).status, 404, 'another session cannot watch it');
  assert.equal((await b.flusso(randomUUID())).status, 404);
  assert.equal((await b.flusso(runId, { sessione: randomUUID() })).status, 404);
  for (const query of ['?after=-1', '?after=abc', '?after=1&after=2', '?x=1', '?after=01']) {
    assert.equal((await b.flusso(runId, { query })).status, 400, query);
  }
  assert.equal((await b.flusso(runId, { lastEventId: 'x' })).status, 400, 'a Last-Event-ID that is not a sequence');
  assert.equal((await fetch(`${b.base}/api/v1/sessions/${sessionId}/workflows/${runId}/events`)).status, 401, 'token required');
  assert.deepEqual(metodiAmmessiPerRotta(`/api/v1/sessions/${sessionId}/workflows/${runId}/events`), ['GET', 'HEAD']);
  b.finto.chiudi('uno'); // il run resta vivo: un flusso aperto resterebbe iscritto
  const vivo = await b.avvia();
  assert.ok(await aspettaChe(() => b.finto.tentativi.get('uno') === 1));
  const testa = await fetch(`${b.base}/api/v1/sessions/${sessionId}/workflows/${vivo}/events`, { method: 'HEAD', headers: { Cookie: 'talos_token=secret' } });
  assert.equal(testa.status, 200);
  assert.match(testa.headers.get('content-type'), /^text\/event-stream/u);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(countRunWatchers(b.store, { runId: vivo }), 0, 'HEAD answers with the headers and subscribes nobody');
  // un flusso aperto tiene UNA iscrizione; il client che si stacca la libera (niente iscrizioni appese)
  const aperto = await b.flusso(vivo, { after: 0 });
  assert.equal(aperto.status, 200);
  assert.ok(await aspettaChe(() => countRunWatchers(b.store, { runId: vivo }) === 1));
  aperto.controllo.abort();
  // SUBITO, non al battito dei 15 s: il battito libera anche lui un socket morto, ma è la rete di sicurezza, non la strada
  assert.ok(await aspettaChe(() => countRunWatchers(b.store, { runId: vivo }) === 0, 2_000), 'a client that goes away frees its subscription at once');
  b.finto.apri('uno');
  assert.equal((await fetch(`${b.base}/api/v1/sessions/${sessionId}/workflows/${runId}/events`, { method: 'POST', headers: { Cookie: 'talos_token=secret' } })).status, 405);
  const senza = await banco(t, { conStore: false });
  const risposta = await fetch(`${senza.base}/api/v1/sessions/${sessionId}/workflows/${runId}/events`, { headers: { Cookie: 'talos_token=secret' } });
  assert.equal(risposta.status, 503);
});

/** Una risposta finta: `write` restituisce false finché il test non emette `drain` — un client che non legge. */
function rispostaLenta() {
  const res = new EventEmitter();
  Object.assign(res, {
    scritture: [], stato: null, pieno: false, writableEnded: false, destroyed: false, socket: null,
    writeHead(status) { this.stato = status; return this; },
    write(testo) { this.scritture.push(testo); return !this.pieno; },
    end() { this.writableEnded = true; this.emit('close'); },
  });
  return res;
}

test('WF-STREAM-BACKPRESSURE: a client that does not drain gets nothing more until drain, then one frame for everything it missed', { timeout: 60_000 }, async (t) => {
  const b = await banco(t);
  b.finto.chiudi('uno');
  const runId = await b.avvia();
  assert.ok(await aspettaChe(() => b.finto.tentativi.get('uno') === 1));
  const res = rispostaLenta();
  res.pieno = true; // il socket è pieno fin dalla prima scrittura
  // battito a 10 ms: mentre il client non drena non si scrive NEMMENO il battito
  const { chiudi } = await serveWorkflowRunStream({ res, store: b.store, runId, afterSeq: 1, heartbeatMs: 10 });
  t.after(() => chiudi?.());
  const fotogrammi = () => res.scritture.filter((s) => s.startsWith('id: '));
  assert.equal(fotogrammi().length, 1, 'the first frame is written, and it fills the socket');
  const scrittePrima = res.scritture.length;
  // il run va avanti fino alla fine mentre il client non drena: nessuna scrittura in più
  b.finto.apri('uno');
  assert.ok(await aspettaChe(async () => (await b.stato(runId)).run.status === 'succeeded'));
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(res.scritture.length, scrittePrima, 'nothing is written, not even a heartbeat, to a client that does not read');
  // il client drena: UN fotogramma che copre tutto ciò che si è perso, poi la chiusura (run finito)
  res.pieno = false;
  res.emit('drain');
  assert.ok(await aspettaChe(() => res.writableEnded));
  assert.equal(fotogrammi().length, 2);
  const primo = JSON.parse(fotogrammi()[0].split('\ndata: ')[1]);
  const secondo = JSON.parse(fotogrammi()[1].split('\ndata: ')[1]);
  assert.equal(secondo.fromSeq, primo.lastSeq + 1, 'resumes exactly after the frame the client has');
  assert.equal(secondo.lastSeq, (await b.stato(runId)).lastSeq);
  assert.equal(secondo.status, 'succeeded');
});

/*
 * I tre motivi per cui un fotogramma dice «rileggi il grafo» invece di portare righe, provati sulla proiezione pura:
 * la struttura è cambiata (`graph_patch_applied`, l'unico fatto che muove graphVersion), un passo che la Definition non ha,
 * troppi passi per un fotogramma. Sotto il tetto le righe arrivano, in ordine e senza doppioni.
 */
test('WF-STREAM-UPDATE-PROJECTION: resync on a structural change, an unknown step or too many steps; rows otherwise', () => {
  const nodo = (id) => ({ id, label: id, kind: 'agent', role: 'worker', priority: 0, phaseId: 'f' });
  const input = (ids, events, lastSeq = events.at(-1)?.seq ?? 0) => ({
    state: { definition: { schema: 'talos.workflow-definition-core.v2', phases: [{ id: 'f', label: 'F' }], nodes: ids.map(nodo), edges: [] },
      nodes: new Map(), lastSeq, run: { runId: 'r', graphVersion: 1, status: 'running' } },
    events,
  });
  const ids = Array.from({ length: 60 }, (_, i) => `n${String(i).padStart(2, '0')}`);
  const fatti = (nodi) => nodi.map((nodeId, i) => ({ seq: i + 2, type: 'node_ready', nodeId, at: '2026-09-25T10:00:00.000Z' }));
  const giusti = projectWorkflowRunUpdate(input(ids, fatti(['n03', 'n01', 'n03'])), { afterSeq: 1 });
  assert.deepEqual([giusti.resync, giusti.resyncReason, giusti.nodes.map((r) => r.nodeId)], [false, null, ['n01', 'n03']]);
  assert.equal(giusti.fromSeq, 2);
  const dopoIlCursore = projectWorkflowRunUpdate(input(ids, fatti(['n03', 'n01'])), { afterSeq: 2 });
  assert.deepEqual(dopoIlCursore.nodes.map((r) => r.nodeId), ['n01'], 'only the facts after the cursor');
  const patch = projectWorkflowRunUpdate(input(ids, [...fatti(['n01']), { seq: 3, type: 'graph_patch_applied', at: '2026-09-25T10:00:00.000Z' }]), { afterSeq: 1 });
  assert.deepEqual([patch.resync, patch.resyncReason, patch.nodes], [true, 'graph_changed', []]);
  const ignoto = projectWorkflowRunUpdate(input(ids, fatti(['nuovo'])), { afterSeq: 1 });
  assert.equal(ignoto.resyncReason, 'graph_changed');
  assert.equal(projectWorkflowRunUpdate(input(ids, fatti(ids.slice(0, RUN_UPDATE_NODE_LIMIT))), { afterSeq: 1 }).nodes.length, RUN_UPDATE_NODE_LIMIT);
  assert.equal(projectWorkflowRunUpdate(input(ids, fatti(ids.slice(0, RUN_UPDATE_NODE_LIMIT + 1))), { afterSeq: 1 }).resyncReason, 'too_many_changes');
  assert.equal(projectWorkflowRunUpdate(input(ids, fatti(['n01'])), { afterSeq: 9 }).resyncReason, 'cursor_ahead');
  assert.throws(() => projectWorkflowRunUpdate(input(ids, []), { afterSeq: -1 }), RangeError);
});
