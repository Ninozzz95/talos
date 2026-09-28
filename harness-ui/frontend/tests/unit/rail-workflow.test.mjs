/*
 * F3-50 (25/09/2026) — il rail «Agenti» del workflow. Decisioni owner del 25/09 sera: «Richiede attenzione» = decisioni ed
 * errori (i passi in coda no), la card degli errori sempre anche a zero, card e «Vedi tutto» filtrano l'elenco del rail.
 * Ricerca: `.claude/RICERCA-10x4-F3-50-RAIL-2026-09-25.md`. Il comportamento a schermo si prova nel browser
 * (`tests/browser/rail-workflow.spec.mjs`); qui le regole pure, il montaggio su un DOM finto e il flusso condiviso.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTRI_RAIL, PAGINA_RAIL, contaAttivi, contaFiltro, montaRailWorkflow, testaDaLeggere, vociAttenzione } from '../../src/components/rail-workflow.js';
import { creaClientGrafo } from '../../src/components/workflow-graph-client.js';

/* ——— regole pure ——— */
const gruppo = (counts, extra = {}) => ({ phaseId: 'f', label: 'F', total: Object.values(counts).reduce((a, b) => a + b, 0), terminated: 0, progress: 0, counts, ...extra });

test('WF-RAIL-ATTENTION: decisions and errors only; queued steps are normal flow (owner decision 16)', () => {
  const coda = vociAttenzione({ groups: [gruppo({ pending: 6, ready: 2, running: 2, succeeded: 4 })] });
  assert.deepEqual(coda.voci.map((v) => [v.chiave, v.titolo, v.sotto]), [['errori', '0 errori', 'Nessun errore attivo']],
    'six steps waiting on a previous activity do not ask for attention');
  assert.equal(coda.daVedere, 0);
  // mockup 5.000: «2 decisioni in attesa · Attende una decisione», «1 errore · Richiede intervento», «Vedi tutto (3)»
  const mille = vociAttenzione({ groups: [gruppo({ waiting_human: 1, failed: 1, pending: 900 }), gruppo({ waiting_human: 1, reconciling: 4, retry_wait: 3 })] });
  assert.deepEqual(mille.voci.map((v) => [v.chiave, v.titolo, v.sotto, v.tono]), [
    ['decisioni', '2 decisioni in attesa', 'Attende una decisione', 'avviso'],
    ['errori', '1 errore', 'Richiede intervento', 'errore'],
  ]);
  assert.equal(mille.daVedere, 3, 'reconciling and retry_wait are the system at work, not the person');
  const incerti = vociAttenzione({ groups: [gruppo({ uncertain: 1_200 })] });
  assert.equal(incerti.voci[0].titolo, '1.200 errori', 'a step to verify is an error to look at, and numbers are grouped');
});

test('WF-RAIL-FILTER-HEAD: how many rows to read at the head of a page sorted by state', () => {
  const g = gruppo({ failed: 2, uncertain: 1, waiting_human: 3, reconciling: 4, running: 9, pending: 50 });
  assert.equal(testaDaLeggere(g, 'errori'), 3, 'weight 0 only');
  assert.equal(testaDaLeggere(g, 'decisioni'), 10, 'the whole weight-1 class: ties follow graph order, reconciling can come first');
  assert.equal(testaDaLeggere(g, 'attenzione'), 10);
  assert.equal(contaFiltro({ groups: [g, g] }, 'decisioni'), 6);
  assert.equal(contaFiltro({ groups: [g] }, 'attenzione'), 6);
  assert.deepEqual(Object.keys(FILTRI_RAIL), ['decisioni', 'errori', 'attenzione']);
  assert.equal(contaAttivi({ groups: [gruppo({ running: 2, leased: 1, reconciling: 5 })] }), 3, 'the tab number counts steps at work');
});

/* ——— DOM finto ——— */
function fintoDocumento() {
  const doc = {};
  const crea = (tag) => {
    const nodo = {
      tag, ownerDocument: doc, parent: null, children: [], dataset: {}, attributes: new Map(), listeners: {}, style: {}, hidden: false, className: '',
      append(...figli) { for (const f of figli) { f.parent = this; this.children.push(f); } },
      replaceChildren(...figli) { for (const f of this.children) f.parent = null; this.children = []; this.append(...figli); },
      remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } },
      setAttribute(k, v) { this.attributes.set(k, String(v)); },
      getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; },
      removeAttribute(k) { this.attributes.delete(k); },
      addEventListener(tipo, fn) { (this.listeners[tipo] ??= []).push(fn); },
      clicca() { for (const fn of this.listeners.click ?? []) fn({ target: this }); },
      closest(sel) { const chiave = /^\[data-([a-z]+)\]$/u.exec(sel)?.[1]; for (let n = this; n; n = n.parent) if (chiave && n.dataset[chiave] !== undefined) return n; return null; },
      querySelector(sel) { return tutti(this).find((n) => n.tag === sel) ?? null; },
      focus() { doc.activeElement = this; },
      set textContent(v) { this._testo = String(v); for (const f of this.children) f.parent = null; this.children = []; },
      get textContent() { return this._testo ?? this.children.map((c) => c.textContent).join(' ').trim(); },
    };
    return nodo;
  };
  doc.createElement = crea;
  doc.createElementNS = (_ns, tag) => crea(tag);
  return doc;
}
const tutti = (radice) => (radice?.children ?? []).flatMap((c) => [c, ...tutti(c)]);
const perClasse = (radice, classe) => tutti(radice).filter((n) => n.className.split(' ').includes(classe));
const testo = (nodo) => nodo.textContent.replace(/\s+/gu, ' ').trim();

/* ——— server finto: un run con le sue fasi, ordinate «per stato» come il read-model ——— */
const PESO = { failed: 0, uncertain: 0, waiting_human: 1, reconciling: 1, leased: 2, running: 2, pending: 3, ready: 3, retry_wait: 3, cancelled: 4, skipped: 4, superseded: 4, planned: 4, succeeded: 5 };
const S = 'sessione-1';
function serverFinto(fasi, { status = 'running' } = {}) {
  const chieste = [];
  const risposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  const panoramica = () => ({
    total: fasi.reduce((t, f) => t + f.passi.length, 0), status, lastSeq: 7,
    groups: fasi.map((f) => {
      const counts = {};
      for (const p of f.passi) counts[p.state] = (counts[p.state] ?? 0) + 1;
      const terminated = f.passi.filter((p) => ['succeeded', 'failed', 'cancelled', 'skipped', 'superseded'].includes(p.state)).length;
      return { phaseId: f.id, label: f.label, total: f.passi.length, terminated, progress: terminated / f.passi.length, counts, roles: {}, kinds: {} };
    }),
  });
  const fetchFn = async (url, opzioni = {}) => {
    chieste.push({ url, metodo: opzioni.method ?? 'GET' });
    if (url === `/api/v1/sessions/${S}/workflows/r1/graph`) return risposta(200, { ok: true, data: panoramica() });
    const pagina = /\/workflows\/r1\/groups\/([^?]+)\?offset=(\d+)&limit=(\d+)(&sort=stato)?$/u.exec(url);
    if (pagina) {
      const fase = fasi.find((f) => f.id === decodeURIComponent(pagina[1]));
      let passi = fase.passi.map((p, i) => ({ ...p, i }));
      if (pagina[4]) passi = passi.sort((a, b) => PESO[a.state] - PESO[b.state] || a.i - b.i);
      const offset = Number(pagina[2]), limit = Number(pagina[3]);
      return risposta(200, { ok: true, data: { phaseId: fase.id, offset, limit, total: passi.length, nextOffset: offset + limit < passi.length ? offset + limit : null,
        items: passi.slice(offset, offset + limit).map(({ i, ...p }) => ({ ...p, phaseId: fase.id })) } });
    }
    return risposta(404, { ok: false, error: { code: 'NOT_FOUND' } });
  };
  return { fetchFn, chieste, fasi };
}
const passi = (fase, stati) => stati.map((state, i) => ({ nodeId: `${fase}-${i + 1}`, label: `${fase} ${i + 1}`, state }));
const aspetta = async (volte = 12) => { for (let i = 0; i < volte; i++) await new Promise((r) => setTimeout(r, 0)); };
const SORGENTE = { tipo: 'run', runId: 'r1', workflowId: 'w1', version: 1, status: 'running' };
class FintoFlusso {
  static creati = [];
  constructor(url) { this.url = url; this.readyState = 1; this.ascoltatori = {}; this.chiuso = false; this.constructor.creati.push(this); }
  addEventListener(tipo, fn) { (this.ascoltatori[tipo] ??= []).push(fn); }
  close() { this.chiuso = true; this.readyState = 2; }
  emetti(dati) { for (const fn of this.ascoltatori['run-update'] ?? []) fn({ data: JSON.stringify(dati), lastEventId: '9' }); }
}
function monta(server, opzioni = {}) {
  const d = fintoDocumento();
  const contenitore = d.createElement('div');
  const client = creaClientGrafo({ sessionId: S, fetchFn: server.fetchFn, EventSourceCtor: opzioni.EventSourceCtor ?? FintoFlusso });
  const aperti = [], conteggi = [];
  const rail = montaRailWorkflow(contenitore, {
    client, sorgente: opzioni.sorgente ?? SORGENTE, visibile: opzioni.visibile ?? (() => true), pianifica: (f) => f(),
    onApri: (dove) => aperti.push(dove), onConteggio: (n) => conteggi.push(n),
  });
  return { rail, root: rail.elemento, aperti, conteggi, d };
}

test('WF-RAIL-14: up to 25 steps the rail lists the agents with their state in words, and four totals (mockup 14)', async () => {
  const server = serverFinto([
    { id: 'f1', label: 'Analisi', passi: passi('a', ['succeeded', 'succeeded', 'succeeded', 'succeeded']) },
    { id: 'f2', label: 'Implementazione', passi: passi('b', ['running', 'succeeded', 'succeeded', 'pending']) },
    { id: 'f3', label: 'Validazione', passi: passi('c', ['pending', 'pending', 'pending', 'pending', 'pending', 'running']) },
  ]);
  const { rail, root, conteggi } = monta(server);
  await aspetta();
  assert.equal(root.dataset.modo, 'agenti');
  const righe = perClasse(root, 'talos-wfr__agente');
  assert.equal(righe.length, 14);
  assert.deepEqual([testo(righe[4]), righe[4].dataset.tono], ['b 1 In esecuzione', 'corso']);
  assert.equal(testo(perClasse(root, 'talos-wfr__testa--elenco')[0]).startsWith('Agenti della sessione 14'), true);
  const voci = perClasse(root, 'talos-wfr__voce-attenzione');
  assert.deepEqual(voci.map(testo), ['0 errori Nessun errore attivo'], 'the six waiting steps are not attention; zero errors still shows (decision 17)');
  assert.equal(perClasse(root, 'talos-wfr__testa')[0].children[1].hidden, true, '«Vedi tutto» has nothing to show');
  assert.deepEqual(perClasse(root, 'talos-wfr__totale').map(testo), ['Totale agenti 14', 'In esecuzione 2', 'Completati 6', 'In attesa 6']);
  assert.deepEqual(conteggi, [2], 'the tab number is the steps at work');
  assert.ok(server.chieste.every((c) => c.metodo === 'GET' && !c.url.includes('/versions/')), 'reads only, and no version page per row');
  assert.equal(FintoFlusso.creati.at(-1).url, `/api/v1/sessions/${S}/workflows/r1/events?after=7`);
  rail.distruggi();
  assert.equal(FintoFlusso.creati.at(-1).chiuso, true);
});

test('WF-RAIL-200: beyond 25 steps the rail shows the groups with count, bar and terminated/total (mockup 200)', async () => {
  const fasi = [
    { id: 'ric', label: 'Ricerca', passi: passi('r', Array(32).fill('succeeded')) },
    { id: 'imp', label: 'Implementazione', passi: passi('i', [...Array(26).fill('succeeded'), 'waiting_human', ...Array(13).fill('running')]) },
    { id: 'ver', label: 'Verifica', passi: passi('v', Array(36).fill('pending')) },
  ];
  const { rail, root } = monta(serverFinto(fasi));
  await aspetta();
  assert.equal(root.dataset.modo, 'gruppi');
  assert.deepEqual(perClasse(root, 'talos-wfr__gruppo').map(testo), ['Ricerca 32 agenti 100%', 'Implementazione 40 agenti 65%', 'Verifica 36 agenti 0%']);
  assert.deepEqual(perClasse(root, 'talos-wfr__voce-attenzione').map(testo), ['1 decisione in attesa Attende una decisione', '0 errori Nessun errore attivo']);
  assert.equal(testo(perClasse(root, 'talos-wfr__testa')[0]), 'Richiede attenzione Vedi tutto (1)');
  assert.deepEqual(perClasse(root, 'talos-wfr__totale').map(testo), ['Totale agenti logici 108', 'Gruppi visibili 3']);
  perClasse(root, 'talos-wfr__gruppo')[1].clicca();
  rail.distruggi();
});

test('WF-RAIL-FILTER: a card lists only its steps, read from the head of the pages sorted by state (decision 18)', async () => {
  const fasi = [
    { id: 'a', label: 'A', passi: passi('a', [...Array(30).fill('succeeded'), 'failed', 'reconciling', 'waiting_human']) },
    { id: 'b', label: 'B', passi: passi('b', ['reconciling', 'waiting_human', 'uncertain', ...Array(40).fill('pending')]) },
  ];
  const server = serverFinto(fasi);
  const { rail, root, aperti } = monta(server);
  await aspetta();
  assert.equal(root.dataset.modo, 'gruppi');
  const primaDelFiltro = server.chieste.length;
  const [decisioni] = perClasse(root, 'talos-wfr__voce-attenzione');
  decisioni.clicca();
  await aspetta();
  assert.equal(root.dataset.modo, 'agenti');
  assert.deepEqual(perClasse(root, 'talos-wfr__agente').map((b) => b.dataset.nodoId), ['a-33', 'b-2'], 'only the steps waiting for the person');
  assert.equal(testo(perClasse(root, 'talos-wfr__testa--elenco')[0]), 'Decisioni in attesa 2 Mostra tutti');
  assert.equal(decisioni.getAttribute('aria-pressed'), 'true');
  const lette = server.chieste.slice(primaDelFiltro).map((c) => c.url);
  assert.deepEqual(lette, [`/api/v1/sessions/${S}/workflows/r1/groups/a?offset=0&limit=3&sort=stato`, `/api/v1/sessions/${S}/workflows/r1/groups/b?offset=0&limit=3&sort=stato`],
    'the head of each group and nothing more: 30 concluded steps are never read');
  // «Vedi tutto» = decisioni + errori
  perClasse(root, 'talos-wfr__testa')[0].children[1].clicca();
  await aspetta();
  assert.deepEqual(perClasse(root, 'talos-wfr__agente').map((b) => b.dataset.nodoId), ['a-31', 'a-33', 'b-3', 'b-2']);
  perClasse(root, 'talos-wfr__agente')[2].clicca();
  assert.deepEqual(aperti.at(-1), { passo: 'b-3', gruppo: 'b' }, 'a step opens the diagram on itself');
  // «Mostra tutti» toglie il filtro
  perClasse(root, 'talos-wfr__togli')[0].clicca();
  await aspetta();
  assert.equal(perClasse(root, 'talos-wfr__agente').length, PAGINA_RAIL);
  assert.equal(testo(perClasse(root, 'talos-wfr__altri')[0]), `Mostra altri (${76 - PAGINA_RAIL} ancora)`);
  // l'errore a zero: il filtro dice che non c'è niente, non un elenco vuoto muto
  const vuoto = monta(serverFinto([{ id: 'x', label: 'X', passi: passi('x', ['running']) }]));
  await aspetta();
  perClasse(vuoto.root, 'talos-wfr__voce-attenzione')[0].clicca();
  await aspetta();
  assert.equal(testo(perClasse(vuoto.root, 'talos-wfr__esito')[0]), 'Nessun errore attivo.');
  rail.distruggi(); vuoto.rail.distruggi();
});

test('WF-RAIL-HIGHLIGHT: the row of what the diagram selected is marked, and only that one', async () => {
  const { rail, root, aperti } = monta(serverFinto([{ id: 'f1', label: 'Uno', passi: passi('a', ['running', 'pending', 'pending']) }]));
  await aspetta();
  rail.evidenzia({ gruppo: 'f1', passo: 'a-2' });
  assert.deepEqual(perClasse(root, 'talos-wfr__agente').map((b) => b.getAttribute('aria-current')), [null, 'true', null]);
  rail.evidenzia(null);
  assert.deepEqual(perClasse(root, 'talos-wfr__agente').map((b) => b.getAttribute('aria-current')), [null, null, null]);
  // decisione owner 19: la porta del diagramma c'è solo a diagramma chiuso, e apre il diagramma e basta
  const [porta] = perClasse(root, 'talos-wfr__porta');
  assert.equal([porta.dataset.nascosta ?? 'false', testo(porta)].join('|'), 'false|Apri diagramma');
  porta.clicca();
  assert.equal(aperti.at(-1), null);
  // decisione owner 20: nascosta ma al suo posto (niente `hidden`, che la toglierebbe dal flusso e farebbe salire il rail)
  rail.diagramma(true);
  assert.deepEqual([porta.dataset.nascosta, porta.hidden, porta.tabIndex], ['true', false, -1]);
  rail.diagramma(false);
  assert.deepEqual([porta.dataset.nascosta, porta.tabIndex], ['false', 0]);
  // a gruppi si segna la fase
  const grande = monta(serverFinto([{ id: 'g1', label: 'G1', passi: passi('g', Array(20).fill('pending')) }, { id: 'g2', label: 'G2', passi: passi('h', Array(20).fill('pending')) }]));
  await aspetta();
  grande.rail.evidenzia({ gruppo: 'g2', passo: 'h-3' });
  assert.deepEqual(perClasse(grande.root, 'talos-wfr__gruppo').map((b) => b.getAttribute('aria-current')), [null, 'true']);
  rail.distruggi(); grande.rail.distruggi();
});

test('WF-RAIL-HIDDEN: a hidden rail reads only the overview (the tab number), and the pages when it shows', async () => {
  let visibile = false;
  const server = serverFinto([{ id: 'f1', label: 'Uno', passi: passi('a', ['running', 'running', 'pending']) }]);
  const { rail, root, conteggi } = monta(server, { visibile: () => visibile });
  await aspetta();
  assert.deepEqual(server.chieste.map((c) => c.url), [`/api/v1/sessions/${S}/workflows/r1/graph`], 'no page, no DOM work while hidden');
  assert.deepEqual(conteggi, [2]);
  assert.equal(perClasse(root, 'talos-wfr__agente').length, 0);
  visibile = true;
  rail.visibilita();
  await aspetta();
  assert.equal(perClasse(root, 'talos-wfr__agente').length, 3);
  const letture = server.chieste.length;
  rail.visibilita();
  await aspetta();
  assert.equal(server.chieste.length, letture, 'no transition, no read');
  rail.distruggi();
});

test('WF-RAIL-NO-DUPLICATES: a live run that shifts between two pages does not list a step twice', async () => {
  const server = serverFinto([{ id: 'f1', label: 'Uno', passi: passi('a', Array(60).fill('pending')) }]);
  // fra la prima e la seconda pagina un passo è cambiato di posto: la seconda pagina riparte una riga prima
  const fetchFn = server.fetchFn;
  server.fetchFn = (url, opzioni) => fetchFn(url.replace(/offset=(\d+)/u, (_, n) => `offset=${Math.max(0, Number(n) - 1)}`), opzioni);
  const { rail, root } = monta(server);
  await aspetta();
  assert.equal(root.dataset.modo, 'gruppi', '60 steps: groups first');
  const [interruttore] = perClasse(root, 'talos-wfr__modi');
  for (const fn of interruttore.listeners.click) fn({ target: perClasse(root, 'talos-wfr__modo')[1] });
  await aspetta();
  assert.equal(perClasse(root, 'talos-wfr__agente').length, PAGINA_RAIL);
  perClasse(root, 'talos-wfr__altri')[0].clicca();
  await aspetta();
  const id = perClasse(root, 'talos-wfr__agente').map((b) => b.dataset.nodoId);
  assert.equal(new Set(id).size, id.length, 'every step once');
  assert.equal(id.length, 2 * PAGINA_RAIL, 'the duplicate is skipped and one more row is read: a page is 25 NEW steps');
  rail.distruggi();
});

test('WF-UI-LIVE-SHARED: one stream per run for card, rail and diagram; a late subscriber gets a resync; the last one closes it', async () => {
  class Flusso extends FintoFlusso {}
  Flusso.creati = [];
  const fetchFn = async () => ({ ok: false, status: 404, json: async () => null });
  const client = (id) => creaClientGrafo({ sessionId: id, fetchFn, EventSourceCtor: Flusso });
  const primi = [], secondi = [];
  let finiti = 0;
  const chiudiUno = client(S).segui(SORGENTE, { after: 3, onUpdate: (f) => primi.push(f), onFine: () => { finiti++; } });
  const chiudiDue = client(S).segui(SORGENTE, { after: 9, onUpdate: (f) => secondi.push(f), onFine: () => { finiti++; } });
  assert.equal(Flusso.creati.length, 1, 'the second subscriber joins the open stream');
  await aspetta(1);
  assert.deepEqual(secondi, [{ resync: true }], 'it may have missed frames before its read: it re-reads');
  Flusso.creati[0].emetti({ status: 'running' });
  assert.deepEqual([primi.length, secondi.length], [1, 2]);
  chiudiUno();
  assert.equal(Flusso.creati[0].chiuso, false, 'still one subscriber');
  chiudiDue();
  assert.equal(Flusso.creati[0].chiuso, true, 'the last one closes it');
  // un run finito: tutti ricevono la fine, e il prossimo iscritto apre un flusso nuovo
  const chiudiTre = client(S).segui(SORGENTE, { onFine: () => { finiti++; } });
  client(S).segui(SORGENTE, { onFine: () => { finiti++; } });
  const secondo = Flusso.creati[1];
  secondo.readyState = 2; secondo.onerror();
  assert.equal(finiti, 2);
  client(S).segui(SORGENTE, {});
  assert.equal(Flusso.creati.length, 3);
  chiudiTre();
  // un'altra sessione ha un altro flusso
  client('altra').segui(SORGENTE, {});
  assert.equal(Flusso.creati.length, 4);
});
