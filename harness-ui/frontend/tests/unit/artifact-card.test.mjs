/*
 * La carta dell'artefatto in chat e il suo pannello «A lato» (0.2.1-ART, D2 e D3, bozzetto approvato dall'owner il 09/11/2026 19:55).
 * La carta è sola: icona, titolo UNA volta, «⋯». Un clic la apre a lato, nella cornice blindata di sempre; in chat non c'è più
 * un'anteprima. Il pannello ha «Apri a parte», «Copia», «Scarica» e la ✕, e in fondo resta la domanda a parte. L'errore sta sotto
 * la carta, con «Riprova». «⋯» e tasto destro danno le stesse cinque voci.
 * Il DOM è quello finto dei blocchi (`aiuto-dom-blocchi.mjs`): `innerHTML` lancia, quindi il titolo del modello entra solo come testo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, clic, orologio } from './aiuto-dom-blocchi.mjs';
import { creaChatALato } from '../../src/components/pannello/a-lato.js';
import { creaMenuContestuale } from '../../src/components/schede.js';

const carica = async (percorso) => {
  const url = new URL(percorso, import.meta.url);
  return import(url.href).catch((e) => { if (e.code === 'ERR_MODULE_NOT_FOUND' && e.url === url.href) return {}; throw e; });
};
const api = await carica('../../src/components/artifact-card.js');
const pannello = await carica('../../src/components/pannello/artefatto-a-lato.js');

const LIB = 'lib-00000000-0000-4000-8000-000000000001';
const PAGE = '/api/v1/pagine/' + 'c'.repeat(43) + '/Same.html';
const HTML = '<!doctype html><h1>Bilancio</h1>';
const evento = { id: 'volatile30', titolo: 'Exact <p> title', voceLibreriaId: LIB };
const SESSIONE = 'session /雪';
const PAGINE = '/api/v1/sessions/session%20%2F%E9%9B%AA/pagine';
const byte = (testo) => new TextEncoder().encode(testo).buffer;
const giro = () => new Promise((f) => setTimeout(f, 0));

/** Il server finto: le pagine (POST), le versioni (GET) e i byte della pagina (GET). Ogni richiesta resta in `calls`. */
function serverFinto({ pagine = () => ({ ok: true, json: async () => ({ data: { indirizzo: PAGE } }) }), versioni = null, html = HTML } = {}) {
  const calls = [];
  const fetchFn = async (indirizzo, init = {}) => {
    calls.push([indirizzo, init]);
    if (init.method === 'POST') return pagine(calls.filter((c) => c[1].method === 'POST').length, JSON.parse(init.body));
    if (indirizzo.endsWith('/versions')) return versioni ? { ok: true, json: async () => ({ data: { versioni } }) } : { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, arrayBuffer: async () => byte(html), text: async () => html };
  };
  return { calls, fetchFn, post: () => calls.filter((c) => c[1].method === 'POST') };
}

/** La colonna destra finta: il posto della scheda «A lato» con la domanda a parte VERA e il pannello dell'artefatto VERO. */
function colonna(doc, tempo = orologio()) {
  const posto = doc.createElement('div'); posto.id = 'railLato';
  const scheda = doc.createElement('button');
  doc.body.append(scheda, posto);
  const chieste = [];
  const chat = creaChatALato({ document: doc, sessione: () => 's1', chiedi: async (s, corpo) => { chieste.push(corpo); return { risposta: 'ok', usage: null }; },
    trasforma: async () => ({}), apriSessione: () => {}, testoConsumo: () => '', testoErrore: (e) => e.message });
  posto.append(chat.nodo);
  const mostrate = [];
  assert.equal(typeof pannello.creaArtefattoALato, 'function', 'il pannello dell\'artefatto a lato esiste');
  const lato = pannello.creaArtefattoALato({ document: doc, posto, chat, scheda, mostra: () => mostrate.push(1), timer: tempo.timer });
  return { posto, scheda, chat, chieste, lato, mostrate, tempo };
}

function setup(options = {}, { conLato = true } = {}) {
  assert.equal(typeof api.creaCardArtefatto, 'function');
  const doc = options.document ?? documento();
  const server = options.server ?? serverFinto();
  const opened = [], navigations = [], tabs = [], copiati = [], scaricati = [], inLibreria = [], avvisi = [];
  const col = conLato ? (options.colonna ?? colonna(doc)) : null;
  const { document: _d, server: _s, colonna: _c, ...resto } = options;
  const c = api.creaCardArtefatto({ evento, sessionId: SESSIONE, API: (p) => p, fetchFn: server.fetchFn,
    apriFn: (...args) => { opened.push(args); const tab = { opener: { owner: true }, closed: false, location: { replace: (u) => navigations.push(u) }, close() { this.closed = true; } }; tabs.push(tab); return tab; },
    ancoraValida: () => true, gettoneGuscio: () => undefined, lato: col?.lato ?? null,
    copia: async (testo) => { copiati.push(testo); }, scarica: (d, file) => { scaricati.push(file); },
    mostraInLibreria: (id) => inLibreria.push(id), avvisa: (...a) => avvisi.push(a), ...resto }, { document: doc });
  doc.body.append(c.card);
  return Object.assign(c, { doc, server, calls: server.calls, opened, navigations, tabs, copiati, scaricati, inLibreria, avvisi, col });
}
const cornice = (c) => c.col.posto.querySelector('iframe');
const pulsanti = (c) => c.col.posto.querySelectorAll('.lato-art__azioni button');
const errore = (c) => c.card.querySelector('.talos-artifact__errore');
const voci = (c) => c.doc.body.querySelectorAll('#menuArtefatto [role="menuitem"]');
const CINQUE = ['Apri a lato', 'Apri a parte', 'Copia', 'Scarica', 'Mostra nella Libreria'];

test('ART-CARTA-01: the card alone — icon, the title once, «⋯»; no preview frame in the chat and no capability asked at birth', async () => {
  const c = setup(); await c.pronta;
  assert.equal(c.carta.tagName, 'BUTTON'); assert.ok(c.carta.classList.contains('talos-artifact__carta'));
  assert.equal(c.card.querySelectorAll('.talos-artifact__title').length, 1);
  assert.equal(c.card.textContent.split('Exact <p> title').length - 1, 1, 'il titolo una volta sola');
  assert.equal(c.card.querySelector('.talos-artifact__title').textContent, 'Exact <p> title');
  assert.equal(c.card.querySelector('p'), null, 'il titolo del modello è testo, non markup');
  assert.equal(c.card.querySelector('iframe'), null, 'niente anteprima in chat');
  assert.equal(c.card.querySelector('.talos-badge'), null, 'niente distintivo «Artefatto» accanto al titolo');
  assert.ok(c.card.querySelector('.talos-artifact__icona svg use'));
  assert.equal(c.piu.getAttribute('aria-haspopup'), 'menu'); assert.equal(c.piu.getAttribute('aria-label'), 'Altre azioni');
  assert.match(c.card.querySelector('.talos-artifact__sotto').textContent, /Pagina interattiva/);
  assert.equal(c.carta.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(c.server.post(), [], 'il lasciapassare si chiede al clic, non alla nascita');
  assert.equal(errore(c).hidden, true);
});

test('ART-LATO-01: a click on the card opens the artifact aside, in the same sealed frame, with a fresh capability; a second click closes it', async () => {
  const c = setup(); await c.pronta;
  assert.equal(c.col.posto.querySelector('.lato-art').hidden, true);
  clic(c.carta); await c.apertura;
  assert.equal(c.server.post().length, 1); assert.equal(c.server.post()[0][0], PAGINE);
  assert.deepEqual(JSON.parse(c.server.post()[0][1].body), { voceId: LIB }); assert.equal(c.server.post()[0][1].credentials, 'same-origin');
  const f = cornice(c);
  assert.ok(f, 'la cornice sta nel pannello a lato'); assert.equal(f.src, PAGE);
  assert.equal(f.getAttribute('sandbox'), 'allow-scripts'); assert.equal(f.getAttribute('referrerpolicy'), 'no-referrer');
  assert.equal(f.getAttribute('title'), 'Exact <p> title');
  assert.equal(c.col.posto.querySelector('.lato-art').hidden, false);
  assert.equal(c.col.posto.querySelector('.lato-art__titolo').textContent, 'Exact <p> title');
  assert.equal(c.carta.getAttribute('aria-expanded'), 'true');
  assert.match(c.card.querySelector('.talos-artifact__sotto').textContent, /aperta a lato/);
  assert.equal(c.col.scheda.hasAttribute('data-con-artefatto'), true, 'il pallino sulla scheda «A lato»');
  assert.equal(c.col.mostrate.length, 1, 'la colonna si apre sulla scheda «A lato»');
  assert.deepEqual(c.opened, [], 'nessuna finestra');
  clic(c.carta); await c.apertura;
  assert.equal(c.col.posto.querySelector('.lato-art').hidden, true); assert.equal(cornice(c), null, 'chiusa: la pagina non gira più');
  assert.equal(c.carta.getAttribute('aria-expanded'), 'false'); assert.equal(c.col.scheda.hasAttribute('data-con-artefatto'), false);
  assert.doesNotMatch(c.card.querySelector('.talos-artifact__sotto').textContent, /aperta a lato/);
  assert.equal(c.server.post().length, 1);
});

test('ART-LATO-02: the panel has «Apri a parte», «Copia», «Scarica» always in sight and the ✕; each works on what the app already has', async () => {
  const c = setup(); await c.pronta; clic(c.carta); await c.apertura;
  assert.deepEqual(pulsanti(c).map((b) => b.textContent), ['Apri a parte', 'Copia', 'Scarica']);
  assert.ok(pulsanti(c)[0].classList.contains('talos-button--primary'));
  for (const b of pulsanti(c)) assert.equal(b.hidden, false);
  const chiudi = c.col.posto.querySelector('.lato-art__chiudi');
  assert.equal(chiudi.getAttribute('aria-label'), 'Chiudi');
  const [aParte, copia, scarica] = pulsanti(c);
  clic(copia); await giro(); await giro();
  assert.deepEqual(c.copiati, [HTML], 'il testo della pagina, letto dal server: nessun ponte verso la cornice');
  assert.equal(copia.textContent, 'Copiato'); c.col.tempo.avanza(2000); assert.equal(copia.textContent, 'Copia');
  clic(scarica); await giro(); await giro();
  assert.deepEqual(c.scaricati, [{ nome: 'Exact p title.html', testo: HTML, mime: 'text/html;charset=utf-8' }]);
  assert.equal(scarica.textContent, 'Scaricato'); c.col.tempo.avanza(2000); assert.equal(scarica.textContent, 'Scarica');
  assert.deepEqual(c.avvisi, [], 'dal pannello la conferma sta sul pulsante');
  clic(aParte); await c.apertura;
  assert.deepEqual(c.opened, [['about:blank', '_blank']]); assert.deepEqual(c.navigations, [PAGE]); assert.equal(c.tabs[0].opener, null);
  assert.equal(c.col.posto.querySelector('.lato-art').hidden, false, 'a parte non chiude il lato');
  clic(chiudi);
  assert.equal(c.col.posto.querySelector('.lato-art').hidden, true); assert.equal(c.carta.getAttribute('aria-expanded'), 'false');
  assert.equal(c.doc.activeElement, c.carta, 'la ✕ riporta il fuoco alla carta');
});

test('ART-LATO-03: the side question is still there, at the bottom, and still asks', async () => {
  const c = setup(); await c.pronta;
  const campo = () => c.col.posto.querySelector('.lato-campo input');
  assert.equal(campo().placeholder, 'Chiedi a parte…');
  clic(c.carta); await c.apertura;
  const figli = c.col.posto.children;
  assert.ok(figli[0].classList.contains('lato-art')); assert.ok(figli[1].classList.contains('lato'), 'la domanda a parte sta sotto l\'artefatto');
  assert.ok(c.col.posto.classList.contains('talos-inspector__body--artefatto'));
  assert.equal(campo().placeholder, 'Chiedi a parte su questo artefatto…'); assert.equal(campo().getAttribute('aria-label'), 'Chiedi a parte su questo artefatto…');
  assert.equal(c.col.posto.querySelector('.lato-campo button').textContent, 'Chiedi');
  assert.equal(c.col.chat.fai('che cosa mostra?'), true); await giro();
  assert.equal(c.col.chieste.length, 1); assert.equal(c.col.chieste[0].domanda, 'che cosa mostra?');
  c.col.lato.chiudi();
  assert.equal(campo().placeholder, 'Chiedi a parte…'); assert.equal(c.col.posto.classList.contains('talos-inspector__body--artefatto'), false);
});

test('ART-LATO-04: one artifact aside at a time — a second card takes the panel and the first one says it is closed', async () => {
  const doc = documento(); const col = colonna(doc);
  const a = setup({ document: doc, colonna: col }); const b = setup({ document: doc, colonna: col, evento: { ...evento, titolo: 'Seconda' } });
  await Promise.all([a.pronta, b.pronta]);
  clic(a.carta); await a.apertura; clic(b.carta); await b.apertura;
  assert.equal(a.carta.getAttribute('aria-expanded'), 'false'); assert.equal(b.carta.getAttribute('aria-expanded'), 'true');
  assert.equal(col.posto.querySelectorAll('iframe').length, 1); assert.equal(col.posto.querySelector('.lato-art__titolo').textContent, 'Seconda');
  col.lato.chiudi({ fuoco: false });
  assert.equal(b.carta.getAttribute('aria-expanded'), 'false'); assert.notEqual(doc.activeElement, b.carta);
});

test('ART-CARTA-02: while the model writes, the state lives in the card («Sto creando…»); once filled it is the card of that artifact', async () => {
  const c = setup({ evento: null, attesa: { tipo: 'creating', titolo: '' } });
  assert.equal(c.carta.getAttribute('aria-busy'), 'true'); assert.equal(c.piu.hidden, true);
  assert.match(c.card.querySelector('.talos-artifact__sotto').textContent, /Sto creando…/);
  assert.ok(c.card.querySelector('.talos-artifact__sotto svg'), 'la ruota');
  assert.equal(c.card.querySelector('.talos-artifact__title').textContent, 'Artefatto');
  c.titolo('Bilancio di casa'); assert.equal(c.card.querySelector('.talos-artifact__title').textContent, 'Bilancio di casa');
  clic(c.carta); await c.apertura; assert.deepEqual(c.calls, [], 'una carta in attesa non apre niente');
  c.carta.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true })); assert.equal(voci(c).length, 0);
  const d = setup({ evento: null, attesa: { tipo: 'updating', titolo: 'X' } });
  assert.match(d.card.querySelector('.talos-artifact__sotto').textContent, /Sto aggiornando…/);
  c.riempi(evento); await c.pronta;
  assert.equal(c.carta.hasAttribute('aria-busy'), false); assert.equal(c.piu.hidden, false);
  assert.equal(c.card.querySelector('.talos-artifact__title').textContent, 'Exact <p> title');
  assert.doesNotMatch(c.card.textContent, /Sto creando/); assert.match(c.card.querySelector('.talos-artifact__sotto').textContent, /Pagina interattiva/);
  clic(c.carta); await c.apertura; assert.equal(cornice(c).src, PAGE);
});

test('ART-CARTA-03: the error sits UNDER the card, says what happened and has «Riprova»; nothing opens aside until it works', async () => {
  const server = serverFinto({ pagine: (n) => n === 1 ? { ok: false, status: 404, json: async () => ({ error: { message: 'Questa voce non esiste più' } }) } : { ok: true, json: async () => ({ data: { indirizzo: PAGE } }) } });
  const c = setup({ server }); await c.pronta; clic(c.carta); await c.apertura;
  const e = errore(c);
  assert.equal(e.hidden, false); assert.equal(e, c.stato); assert.equal(e.getAttribute('role'), 'status');
  const figli = c.card.children;
  assert.ok(figli.indexOf(e) > figli.indexOf(c.card.querySelector('.talos-artifact__box')), 'sotto la carta, non sopra');
  assert.match(e.textContent, /L’artefatto non si è aperto\./); assert.match(e.textContent, /non esiste più/); assert.match(e.textContent, /Libreria/);
  const riprova = e.querySelector('button');
  assert.equal(riprova.textContent, 'Riprova'); assert.equal(riprova.hidden, false);
  assert.equal(cornice(c), null); assert.equal(c.carta.getAttribute('aria-expanded'), 'false'); assert.deepEqual(c.opened, []);
  assert.equal(server.post().length, 1, 'nessun tentativo da solo');
  clic(riprova); await c.apertura;
  assert.equal(server.post().length, 2); assert.equal(e.hidden, true); assert.equal(cornice(c).src, PAGE);
});

test('ART-CARTA-04: «⋯» and the right click give the same five entries, complete on their own', async () => {
  const c = setup(); await c.pronta;
  clic(c.piu);
  const menu = c.doc.body.querySelector('#menuArtefatto');
  assert.equal(menu.hidden, false); assert.equal(menu.getAttribute('role'), 'menu'); assert.equal(menu.getAttribute('aria-label'), 'Azioni dell’artefatto');
  assert.deepEqual(voci(c).map((v) => v.textContent), CINQUE);
  const figli = menu.children;
  assert.equal(figli[figli.indexOf(voci(c)[4]) - 1].getAttribute('role'), 'separator', 'la Libreria sta dopo un separatore');
  assert.equal(c.piu.getAttribute('aria-expanded'), 'true');
  c.doc.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  assert.equal(menu.hidden, true); assert.equal(c.piu.getAttribute('aria-expanded'), 'false');
  const destro = Object.assign(new Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 40, clientY: 50 });
  c.carta.dispatchEvent(destro);
  assert.equal(destro.defaultPrevented, true); assert.equal(menu.hidden, false);
  assert.deepEqual(voci(c).map((v) => v.textContent), CINQUE, 'tasto destro: le stesse cinque');
  clic(voci(c)[4]); assert.deepEqual(c.inLibreria, [LIB]); assert.equal(menu.hidden, true);
  clic(c.piu); clic(voci(c)[2]); await giro(); await giro();
  assert.deepEqual(c.copiati, [HTML]); assert.deepEqual(c.avvisi, [['Copiato']], 'dal menu la conferma è un avviso');
  clic(c.piu); clic(voci(c)[3]); await giro(); await giro();
  assert.equal(c.scaricati.length, 1); assert.deepEqual(c.avvisi.at(-1), ['Scaricato']);
  clic(c.piu); clic(voci(c)[0]); await c.apertura; assert.equal(cornice(c).src, PAGE);
  clic(c.piu); clic(voci(c)[0]); await c.apertura; assert.equal(cornice(c).src, PAGE, '«Apri a lato» dal menu non la richiude');
  clic(c.piu); clic(voci(c)[1]); await c.apertura; assert.deepEqual(c.opened, [['about:blank', '_blank']]);
  clic(c.piu); assert.equal(menu.hidden, false); c.doc.body.dispatchEvent(new Event('pointerdown', { bubbles: true })); assert.equal(menu.hidden, true, 'un clic fuori lo chiude');
});

test('ART-CARTA-04b: in a real browser the menu’s entries are a NodeList, not an array — the separator and the place under «⋯» still happen', async () => {
  /* Foto del 09/11/2026 sul server di prova: `querySelectorAll(...).at(-1)` lanciava (una NodeList non ha `at`), quindi il menu restava
     nell'angolo in alto a sinistra della finestra e senza il separatore. Il DOM finto dà array e non lo vedeva: qui la lista è come la vera. */
  const listaDelBrowser = (nodi) => { const l = { length: nodi.length, forEach: (f) => nodi.forEach(f), [Symbol.iterator]: () => nodi[Symbol.iterator]() }; nodi.forEach((n, i) => { l[i] = n; }); return l; };
  const c = setup(); await c.pronta;
  const menu = creaMenuContestuale(c.doc.body, { id: 'menuArtefatto' });
  const vero = menu.querySelectorAll.bind(menu);
  menu.querySelectorAll = (selettore) => listaDelBrowser(vero(selettore));
  c.piu.getBoundingClientRect = () => ({ left: 870, right: 900, top: 370, bottom: 400 });
  clic(c.piu);
  assert.equal(menu.hidden, false);
  const figli = [...menu.children];
  assert.deepEqual(figli.map((f) => f.getAttribute('role')), ['menuitem', 'menuitem', 'menuitem', 'menuitem', 'separator', 'menuitem']);
  assert.equal(menu.style.left, '660px', 'il bordo destro del menu sotto «⋯» (900 meno i 240 di larghezza)');
  assert.equal(menu.style.top, '406px', 'sei pixel sotto «⋯»');
  c.doc.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
  c.piu.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'ArrowUp' }));
  assert.equal(menu.hidden, false, 'freccia su apre dall’ultima voce, con la lista vera');
});

test('ART-CARTA-04c: the right click on the card stops there — the answer that holds the card does not open its own menu too', async () => {
  /* Foto del 09/11/2026 sul server di prova: col tasto destro sulla carta si aprivano DUE menu, quello dell'artefatto e quello della
     risposta («Riprova» / «Elimina la risposta»), perché l'evento risaliva fino alla risposta. Come le righe dei file (app.js, 25/10). */
  const c = setup(); await c.pronta;
  let saliti = 0; c.doc.body.addEventListener('contextmenu', () => { saliti += 1; });
  const destro = Object.assign(new Event('contextmenu', { bubbles: true, cancelable: true }), { clientX: 40, clientY: 50 });
  c.carta.dispatchEvent(destro);
  assert.equal(c.doc.body.querySelector('#menuArtefatto').hidden, false); assert.equal(destro.defaultPrevented, true);
  assert.equal(saliti, 0, 'il tasto destro non arriva alla risposta');
  const inAttesa = setup({ evento: null, attesa: { tipo: 'creating', titolo: '' } });
  let salitiAttesa = 0; inAttesa.doc.body.addEventListener('contextmenu', () => { salitiAttesa += 1; });
  inAttesa.carta.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
  assert.equal(salitiAttesa, 1, 'una carta che non ha menu lascia passare il tasto destro, come ogni altro punto della risposta');
});

test('ART-VERSIONI-01: «vN di M» sits under the title; «Mostra l’ultima» changes what the panel, Copy and Download use', async () => {
  const versioni = [{ versione: 1 }, { versione: 2 }, { versione: 3, sessionNome: 'Q2' }];
  const server = serverFinto({ versioni });
  const c = setup({ server, evento: { ...evento, versione: 1 } }); await c.pronta; await giro();
  const etichetta = () => c.card.querySelector('.talos-artifact__versione').textContent;
  assert.equal(etichetta(), 'v1 di 3');
  const avviso = c.card.querySelector('.talos-artifact__avviso');
  assert.match(avviso.textContent, /Aggiornato poi in «Q2»/);
  clic(c.carta); await c.apertura;
  assert.deepEqual(JSON.parse(server.post()[0][1].body), { voceId: LIB, versione: 1 });
  clic(avviso.querySelector('[data-artefatto-ultima]')); await giro(); await giro();
  assert.equal(etichetta(), 'v3 di 3 · ultima');
  assert.deepEqual(JSON.parse(server.post().at(-1)[1].body), { voceId: LIB }, 'il pannello aperto ricarica l\'ultima');
  assert.match(c.col.posto.querySelector('.lato-art__sotto').textContent, /v3 di 3/);
  clic(avviso.querySelector('[data-artefatto-ultima]')); await giro(); await giro();
  assert.equal(etichetta(), 'v1 di 3'); assert.deepEqual(JSON.parse(server.post().at(-1)[1].body), { voceId: LIB, versione: 1 });
});

test('ARTIFACT30-UI-REPLAY: a fresh card resolves the saved Library reference again rather than caching a capability', async () => {
  const a = setup(), b = setup(); await Promise.all([a.pronta, b.pronta]);
  clic(a.carta); clic(b.carta); await Promise.all([a.apertura, b.apertura]);
  assert.equal(a.server.post().length, 1); assert.equal(b.server.post().length, 1); assert.deepEqual(a.server.post()[0], b.server.post()[0]);
});

test('ARTIFACT30-UI-DELETED: explicit error, no fallback, no automatic retry and no window after Library deletion', async () => {
  const server = serverFinto({ pagine: () => ({ ok: false, status: 404, json: async () => ({ error: { message: 'Questa voce non esiste più' } }) }) });
  const c = setup({ server }); await c.pronta; clic(c.carta); await c.apertura;
  assert.equal(server.post().length, 1); assert.equal(cornice(c), null); assert.match(c.stato.textContent, /non esiste più/); assert.match(c.stato.textContent, /Libreria/);
  assert.equal(c.opened.length, 0);
});

test('ARTIFACT30-UI-INVALID: malformed explicit Library reference refuses fetch and never silently falls back', async () => {
  for (const value of ['../x', 42, {}, null, '']) {
    const c = setup({ evento: { ...evento, voceLibreriaId: value } }); await c.pronta;
    assert.match(c.stato.textContent, /riferimento/i); assert.equal(c.stato.hidden, false);
    assert.equal(c.stato.querySelector('button').hidden, true, 'riprovare non cambierebbe niente');
    assert.equal(c.carta.getAttribute('aria-disabled'), 'true'); assert.equal(c.piu.hidden, true);
    clic(c.carta); await c.apertura; c.carta.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true }));
    assert.deepEqual(c.calls, []); assert.equal(cornice(c), null); assert.deepEqual(c.opened, []); assert.equal(voci(c).length, 0);
  }
});

test('ARTIFACT30-UI-FOREIGN-URL: malformed server capability cannot reach the frame aside nor a window', async () => {
  for (const indirizzo of ['https://evil.example', '/api/v1/pagine/cap30/x.html', PAGE + '?other=1', PAGE.replace('Same.html', '%2E%2E%2Fsecret'), PAGE.replace('Same.html', '%zz')]) {
    const c = setup({ server: serverFinto({ pagine: () => ({ ok: true, json: async () => ({ data: { indirizzo } }) }) }) }); await c.pronta;
    clic(c.carta); await c.apertura; assert.equal(cornice(c), null, indirizzo); assert.equal(c.stato.hidden, false);
    void c.azioni.apriAParte(); await c.apertura; assert.deepEqual(c.navigations, [], indirizzo);
  }
});

test('ARTIFACT30-UI-STALE: late response and clicks after a session change have no effect', async () => {
  let valid = true, release;
  const c = setup({ ancoraValida: () => valid, server: serverFinto({ pagine: () => new Promise((r) => { release = r; }) }) }); await c.pronta;
  clic(c.carta); await giro(); valid = false; release({ ok: true, json: async () => ({ data: { indirizzo: PAGE } }) }); await c.apertura;
  assert.equal(cornice(c), null); assert.equal(c.carta.getAttribute('aria-expanded'), 'false');
  const d = setup({ ancoraValida: () => valid }); await d.pronta; clic(d.carta); await d.apertura; clic(d.piu); void d.azioni.apriAParte(); await d.apertura;
  assert.deepEqual(d.calls, []); assert.equal(d.opened.length, 0); assert.equal(voci(d).length, 0);
});

test('ARTIFACT30-UI-UNMOUNT: a card taken out of the page cannot apply an asynchronous result', async () => {
  let release; const c = setup({ server: serverFinto({ pagine: () => new Promise((r) => { release = r; }) }) }); await c.pronta;
  clic(c.carta); await giro(); c.card.remove(); release({ ok: true, json: async () => ({ data: { indirizzo: PAGE } }) }); await c.apertura; assert.equal(cornice(c), null);
});

test('ARTIFACT30-UI-LEGACY: old events keep the live route, aside, with an honest temporary note; no Library entry to show', async () => {
  const c = setup({ evento: { id: 'a /雪', titolo: 'old' } }); await c.pronta;
  assert.match(c.card.querySelector('.talos-artifact__nota').textContent, /temporanea/);
  clic(c.carta); await c.apertura;
  assert.equal(c.server.post().length, 0); assert.equal(cornice(c).src, '/api/v1/artifacts/a%20%2F%E9%9B%AA');
  clic(c.piu); assert.equal(voci(c)[4].disabled, true); assert.equal(voci(c)[0].disabled, false);
  clic(voci(c)[2]); await giro(); await giro();
  assert.deepEqual(c.calls.at(-1), ['/api/v1/artifacts/a%20%2F%E9%9B%AA', { credentials: 'same-origin' }]); assert.deepEqual(c.copiati, [HTML]);
});

test('ARTIFACT30-UI-MOUNT: a card created before insertion still becomes usable', async () => {
  const doc = documento(); const col = colonna(doc);
  const c = api.creaCardArtefatto({ evento: { id: 'legacy', titolo: 'old' }, sessionId: 's', lato: col.lato }, { document: doc });
  doc.body.append(c.card); await c.pronta; clic(c.carta); await c.apertura;
  assert.equal(col.posto.querySelector('iframe').src, '/api/v1/artifacts/legacy');
});

test('ARTIFACT30-UI-WIRING: the app passes the event, the captured session and the panel aside; the tool row gives way to the card', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.ok(/creaCardArtefatto\(/.test(app)); assert.ok(/state\.realSession\.id === sessionId/.test(app));
  assert.ok(/lato: montaArtefattoALato\(\)/.test(app), 'la carta riceve il pannello a lato');
  assert.ok(/creaArtefattoALato\(/.test(app)); assert.ok(/attesaArtefatti\.inizia\(/.test(app)); assert.ok(/attesaArtefatti\.prendi\(\)/.test(app));
  assert.ok(/attesaArtefatti\.finisci\(/.test(app));
});

test('ARTIFACT30-UI-SOTTO: the line under the title is one line of text, so the dot between its pieces has the same space everywhere', () => {
  /* Foto del 09/11/2026 sul server di prova: in fila (`display:flex; gap:6px`) i nodi di testo si fondevano in una scatola e le etichette
     restavano scatole a sé, quindi «Interactive page·  v1 of 2» aveva un punto attaccato e uno largo, diverso da «2 · latest». */
  const css = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
  const regola = /\.talos-artifact--sola \.talos-artifact__sotto\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(regola, /display:block/u);
  assert.doesNotMatch(regola, /gap:|display:flex/u, 'niente fila con lo spazio fra scatole');
  assert.match(regola, /overflow:hidden; text-overflow:ellipsis; white-space:nowrap/u, 'in una chat stretta si accorcia, non esce dalla carta');
});

test('ARTIFACT30-UI-MENU-COLONNA: the «⋯» menu stacks its entries, so it is as wide as its longest entry and not as the right column', () => {
  /* Foto del 09/11/2026: le voci in riga contavano affiancate in `width:max-content`, e il menu arrivava al suo tetto, la larghezza
     della colonna destra (340 px di serie, 720 px con la colonna tutta aperta) invece dei ~220 px del bozzetto. */
  const css = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
  assert.match(css, /#menuArtefatto:not\(\[hidden\]\)\{display:flex; flex-direction:column\}/u);
  assert.match(css, /#menuArtefatto\{min-width:220px\}/u);
});

test('ART-LATO-05: the dot on the «Aside» tab takes no room, so the tab row does not grow and scroll when an artifact opens', () => {
  /* Foto del 09/11/2026 23:30 sul server di prova, colonna a 340 px (di serie): senza il pallino le sei linguette ci stanno; col
     pallino in fila (`flex:none; width:6px`) la riga cresceva, scorreva fino alla linguetta scelta e «Context» restava tagliata
     («ontext»). Il pallino sta sopra l'angolo della linguetta, come il punto di stato di Hermes (`screen-portal.tsx:197`). */
  const css = readFileSync(new URL('../../src/styles/a-lato.css', import.meta.url), 'utf8');
  const linguetta = /#railTabs \[data-rail="lato"\]\[data-con-artefatto\]\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  const pallino = /#railTabs \[data-rail="lato"\]\[data-con-artefatto\]::after\{([^}]*)\}/u.exec(css)?.[1] ?? '';
  assert.match(linguetta, /position:relative/u, 'la linguetta tiene il pallino');
  assert.match(pallino, /position:absolute/u, 'fuori dal flusso: la linguetta non si allarga');
  assert.doesNotMatch(pallino, /margin-left|flex:/u, 'niente posto in fila');
});

test('ARTIFACT30-UI-OPEN-RENEW: each «Apri a parte» renews a capability; the blank tab has no opener while waiting', async () => {
  let release; const fresh = PAGE.replace('c'.repeat(43), 'd'.repeat(43));
  const server = serverFinto({ pagine: () => new Promise((r) => { release = r; }) });
  const c = setup({ server }); await c.pronta;
  void c.azioni.apriAParte(); await giro();
  assert.equal(server.post().length, 1); assert.equal(c.tabs[0].opener, null); assert.deepEqual(c.navigations, []);
  void c.azioni.apriAParte(); clic(c.carta); assert.equal(server.post().length, 1, 'una richiesta alla volta'); assert.equal(c.tabs.length, 1);
  release({ ok: true, json: async () => ({ data: { indirizzo: fresh } }) }); await c.apertura; assert.deepEqual(c.navigations, [fresh]);
  assert.equal(c.carta.hasAttribute('aria-busy'), false);
});

test('ARTIFACT30-UI-OPEN-FAILED: failure closes the new tab, with no stale navigation; the error is under the card with «Riprova»', async () => {
  const c = setup({ server: serverFinto({ pagine: () => ({ ok: false, status: 404, json: async () => ({ error: { message: 'Voce rimossa' } }) }) }) }); await c.pronta;
  void c.azioni.apriAParte(); await c.apertura;
  assert.equal(c.tabs[0].closed, true); assert.deepEqual(c.navigations, []); assert.match(c.stato.textContent, /Voce rimossa/); assert.equal(c.stato.hidden, false);
  assert.equal(c.stato.querySelector('button').textContent, 'Riprova');
});

test('ARTIFACT30-UI-POPUP-BLOCKED: a blocked window says so under the card and the artifact opens aside instead', async () => {
  const c = setup({ apriFn: () => null }); await c.pronta; void c.azioni.apriAParte(); await c.apertura;
  assert.equal(c.stato.hidden, false);
  assert.match(c.stato.textContent, /La finestra a parte non si è aperta\./); assert.match(c.stato.textContent, /L’artefatto è aperto qui a lato\./);
  assert.equal(c.stato.querySelector('strong').textContent, 'La finestra a parte non si è aperta.');
  assert.equal(cornice(c).src, PAGE, 'aperto a lato'); assert.equal(c.carta.getAttribute('aria-expanded'), 'true');
  assert.equal(c.stato.querySelector('button').hidden, false);
  const senza = setup({ apriFn: () => null }, { conLato: false }); await senza.pronta; void senza.azioni.apriAParte(); await senza.apertura;
  assert.match(senza.stato.textContent, /La finestra a parte non si è aperta\./); assert.doesNotMatch(senza.stato.textContent, /qui a lato/);
});

test('ARTIFACT30-UI-OPEN-STALE: a session change during the renewal closes only the newly opened tab', async () => {
  let valid = true, release; const c = setup({ ancoraValida: () => valid, server: serverFinto({ pagine: () => new Promise((r) => { release = r; }) }) }); await c.pronta;
  void c.azioni.apriAParte(); await giro(); valid = false; release({ ok: true, json: async () => ({ data: { indirizzo: PAGE } }) }); await c.apertura;
  assert.equal(c.tabs[0].closed, true); assert.deepEqual(c.navigations, []);
});

test('ART-CARTA-05: without a panel aside (a page that has no right column) the card opens separately, as «Apri» did', async () => {
  const c = setup({}, { conLato: false }); await c.pronta; clic(c.carta); await c.apertura;
  assert.deepEqual(c.opened, [['about:blank', '_blank']]); assert.deepEqual(c.navigations, [PAGE]);
  clic(c.piu); assert.equal(voci(c)[0].disabled, true, '«Apri a lato» spenta'); assert.equal(voci(c).length, 5);
});

/* 0.2.1-ART D1 (09/11/2026): nell'app PC il guscio nega `about:blank` (`setWindowOpenHandler` → deny). Col gettone del guscio
   (`window.__talosGuscioArtefatti`, posato dal guscio a ogni caricamento) «Apri a parte» chiede la finestra al guscio con
   `talos-desktop://artefatto?gettone=…&pagina=…`; nel browser (remoto, 4174) resta la scheda. */
const GETTONE = 'f'.repeat(48);
const richiestaGuscio = (pagina) => 'talos-desktop://artefatto?gettone=' + GETTONE + '&pagina=' + encodeURIComponent(pagina);
test('ART-GUSCIO-UI-01: in the desktop shell «Apri a parte» never calls about:blank; it renews the capability and asks the shell with the token', async () => {
  const fresh = PAGE.replace('c'.repeat(43), 'e'.repeat(43));
  const server = serverFinto({ pagine: (n) => ({ ok: true, json: async () => ({ data: { indirizzo: n === 1 ? PAGE : fresh } }) }) });
  const c = setup({ gettoneGuscio: () => GETTONE, server }); await c.pronta;
  clic(c.carta); await c.apertura; clic(pulsanti(c)[0]); await c.apertura;
  assert.equal(c.opened.some((a) => a[0] === 'about:blank'), false, 'about:blank is denied by the shell');
  assert.deepEqual(c.opened, [[richiestaGuscio(fresh), '_blank']]); assert.equal(server.post().length, 2, 'a fresh capability for the window'); assert.deepEqual(c.navigations, []);
  assert.equal(c.stato.hidden, true);
});
test('ART-GUSCIO-UI-02: in the shell a failed renewal asks for nothing and says why; a stale card asks for nothing', async () => {
  const c = setup({ gettoneGuscio: () => GETTONE, server: serverFinto({ pagine: () => ({ ok: false, status: 404, json: async () => ({ error: { message: 'Voce rimossa' } }) }) }) }); await c.pronta;
  void c.azioni.apriAParte(); await c.apertura; assert.deepEqual(c.opened, []); assert.match(c.stato.textContent, /Voce rimossa/);
  let valid = true, release; const server = serverFinto({ pagine: () => new Promise((r) => { release = r; }) });
  const d = setup({ gettoneGuscio: () => GETTONE, ancoraValida: () => valid, server }); await d.pronta;
  void d.azioni.apriAParte(); await giro(); void d.azioni.apriAParte(); assert.equal(server.post().length, 1, 'one request at a time');
  valid = false; release({ ok: true, json: async () => ({ data: { indirizzo: PAGE } }) }); await d.apertura; assert.deepEqual(d.opened, []);
  /* security reviews 2 (C1) and 3 (M29): the last four pass the source's own check (`/api/v1/pagine/…`), so only the card's `paginaValida` stops them before the shell is asked */
  for (const indirizzo of ['https://evil.example/x.html', '/api/v1/sessions', '/api/v1/pagine/short/x.html', PAGE + '?y=1', '/api/v1/pagine/' + 'c'.repeat(43) + '/..%5cx', '/api/v1/pagine/' + 'c'.repeat(43) + '/a/b.html']) {
    const e = setup({ gettoneGuscio: () => GETTONE, server: serverFinto({ pagine: () => ({ ok: true, json: async () => ({ data: { indirizzo } }) }) }) }); await e.pronta;
    void e.azioni.apriAParte(); await e.apertura; assert.deepEqual(e.opened, [], indirizzo);
  }
  /* una carta vecchia (rotta col cookie) nel guscio non ha finestra a parte: lo dice e si apre a lato */
  const v = setup({ gettoneGuscio: () => GETTONE, evento: { id: 'vecchia', titolo: 'old' } }); await v.pronta; void v.azioni.apriAParte(); await v.apertura;
  assert.deepEqual(v.opened, []); assert.match(v.stato.textContent, /La finestra a parte non si è aperta\./); assert.equal(cornice(v).src, '/api/v1/artifacts/vecchia');
});
test('ART-GUSCIO-UI-03: without a well-formed shell token (browser, remote, 4174) «Apri a parte» keeps the browser tab path', async () => {
  for (const gettone of [undefined, null, '', 42, {}, 'corto', 'g'.repeat(48) + '"']) {
    const c = setup({ gettoneGuscio: () => gettone }); await c.pronta; void c.azioni.apriAParte(); await c.apertura; assert.deepEqual(c.opened, [['about:blank', '_blank']], String(gettone));
  }
  const doc = documento(); const aperte = [];
  globalThis.__talosGuscioArtefatti = { gettone: GETTONE };
  try {
    const c = api.creaCardArtefatto({ evento, sessionId: 's', API: (p) => p, fetchFn: async () => ({ ok: true, json: async () => ({ data: { indirizzo: PAGE } }) }), apriFn: (...a) => { aperte.push(a); return null; } }, { document: doc });
    doc.body.append(c.card); await c.pronta; void c.azioni.apriAParte(); await c.apertura;
    assert.deepEqual(aperte, [[richiestaGuscio(PAGE), '_blank']], 'the default reads the token the shell posted');
  } finally { delete globalThis.__talosGuscioArtefatti; }
});
