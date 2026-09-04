import assert from 'node:assert/strict';
import test from 'node:test';

import { createStatusBarSurface } from '../../src/app/surfaces/status-bar.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = {
  regionLabel: 'Stato della sessione',
  unmeasured: 'non misurato',
  noUsageReason: 'nessun consumo misurato per questa sessione',
  announceTemplate: 'Sessione {fase}',
  fields: [
    { id: 'tokens', label: 'token' },
    { id: 'turns', label: 'giri' },
    { id: 'cacheTokens', label: 'cache' },
    { id: 'connection', label: 'ponte' },
  ],
  phases: { 'ready-active': 'pronta', 'ready-empty': 'nessuna sessione', running: 'in corso', booting: 'in avvio' },
  connections: { connecting: 'in collegamento', open: 'collegato' },
  missingReasons: { cacheTokens: 'il fornitore non ha dichiarato la cache' },
};

const SESSIONI = [
  { id: 's1', title: 'Prima', status: 'done' },
  { id: 's2', title: 'Seconda', status: 'done' },
];

function store() {
  const s = createStore({ initialState: createInitialState(), reducer });
  s.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: SESSIONI, projects: [] } });
  return s;
}
const monta = (s, extra = {}) => createStatusBarSurface({
  documentObj: fakeDocument(), store: s, labels: { ...ETICHETTE, ...extra }, testId: 'status-bar',
});
/** Il valore scritto nella cella di un campo. */
const cella = (elemento, id) => {
  const indice = ETICHETTE.fields.findIndex((c) => c.id === id);
  const celle = elemento.children.filter((c) => c.className === 'talos-status-bar__cell');
  // La prima cella è la fase, poi i campi nell'ordine dichiarato.
  return celle[indice + 1].children.find((c) => c.className === 'talos-status-bar__value');
};

/* --- G30: la barra deve dire il vero --- */

test('BARRA-01 ⭐⭐ G30 AL CONTRARIO: cambiando sessione il consumo della PRECEDENTE non resta a schermo', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  s.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: { tokens: 100100, turns: 8, cacheTokens: 50700 } } });
  assert.equal(testoDi(cella(b.element, 'tokens')), '100100');

  // Il difetto misurato il 04/09: si apre un'altra sessione e la barra
  // continuava a mostrare 100.1k token · 8 giri · cache 50.7k.
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's2' } });
  for (const campo of ['tokens', 'turns', 'cacheTokens']) {
    const valore = cella(b.element, campo);
    assert.doesNotMatch(testoDi(valore), /100100|50700|8/, `${campo} non deve portarsi dietro la sessione precedente`);
    assert.notEqual(trova(valore, (e) => e.className === 'talos-status-bar__unmeasured'), null);
  }
});

test('BARRA-02 ⭐ senza consumo misurato la barra scrive un trattino col MOTIVO, mai uno zero', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  const valore = cella(b.element, 'tokens');
  const nonMisurato = trova(valore, (e) => e.className === 'talos-status-bar__unmeasured');
  assert.notEqual(nonMisurato, null);
  assert.equal(nonMisurato.getAttribute('title'), 'nessun consumo misurato per questa sessione');
  assert.equal(testoDi(nonMisurato), '—non misurato');
  assert.doesNotMatch(testoDi(valore), /\b0\b/);
});

test('BARRA-03 ⭐ uno ZERO MISURATO si scrive 0: una sessione che non ha speso niente lo dichiara', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1', usage: { tokens: 0, turns: 0, cacheTokens: 0 } } });
  assert.equal(testoDi(cella(b.element, 'tokens')), '0');
  assert.equal(trova(cella(b.element, 'tokens'), (e) => e.className === 'talos-status-bar__unmeasured'), null);
});

test('BARRA-04 ⭐ un campo assente non prende in prestito lo zero del vicino', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1', usage: { tokens: 1200, turns: 2, cacheTokens: null } } });
  assert.equal(testoDi(cella(b.element, 'tokens')), '1200');
  const cache = trova(cella(b.element, 'cacheTokens'), (e) => e.className === 'talos-status-bar__unmeasured');
  assert.notEqual(cache, null);
  assert.equal(cache.getAttribute('title'), 'il fornitore non ha dichiarato la cache');
});

test('BARRA-05 da «non misurato» a un numero e ritorno, la cella resta leggibile in entrambi i versi', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  s.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: { tokens: 42 } } });
  assert.equal(testoDi(cella(b.element, 'tokens')), '42');
  s.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: null } });
  assert.match(testoDi(cella(b.element, 'tokens')), /—/);
  s.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: { tokens: 43 } } });
  assert.equal(testoDi(cella(b.element, 'tokens')), '43', 'la misura deve tornare visibile, non restare staccata');
});

/* --- Chi ascolta: i numeri NON si annunciano, la fase sì --- */

test('BARRA-06 ⭐⭐ i numeri non stanno in una regione live: cambiano troppo spesso per essere annunciati', () => {
  const b = monta(store());
  const barra = b.element;
  assert.equal(barra.getAttribute('role'), 'group');
  assert.equal(barra.getAttribute('aria-live'), null);
  for (const campo of ETICHETTE.fields) {
    const valore = cella(barra, campo.id);
    assert.equal(valore.getAttribute('aria-live'), null);
    assert.equal(valore.getAttribute('role'), null);
  }
});

test('BARRA-07 ⭐ la regione che parla contiene SOLO la frase, così aria-atomic rilegge una frase e non tutta la barra', () => {
  const s = store();
  const b = monta(s);
  const annuncio = trova(b.element, (e) => e.getAttribute('role') === 'status');
  assert.notEqual(annuncio, null);
  assert.equal(annuncio.className, 'sr-only');
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  assert.equal(testoDi(annuncio), 'Sessione pronta');
  assert.equal(annuncio.children.length, 0, 'niente numeri dentro la regione che parla');
});

test('BARRA-08 ⭐ un consumo che cambia NON riscrive l\'annuncio: solo la fase lo fa', () => {
  const s = store();
  const b = monta(s);
  const annuncio = trova(b.element, (e) => e.getAttribute('role') === 'status');
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  // ⛔ Si CONTANO le scritture, non si confronta il testo: riscrivere la
  // stessa frase e' comunque una mutazione, e su una regione live e' un
  // annuncio in piu'. Una prova sul testo passa anche col difetto dentro
  // (misurato: la mutazione «riscrivi sempre» non la faceva fallire).
  const scrittureDopoLaFase = annuncio.scrittureTesto;
  for (let i = 0; i < 50; i += 1) {
    s.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: { tokens: i } } });
  }
  assert.equal(annuncio.scrittureTesto, scrittureDopoLaFase, '50 token in piu non sono 50 annunci');
  s.dispatch({ type: ACTIONS.EXECUTION_STATUS_CHANGED, payload: { status: 'running' } });
  assert.equal(testoDi(annuncio), 'Sessione in corso');
  assert.equal(annuncio.scrittureTesto, scrittureDopoLaFase + 1, 'un cambio di fase e' + " " + 'esattamente un annuncio');
});

/* --- Stati e contratto --- */

test('BARRA-09 una fase sconosciuta resta grezza e il pallino è neutro, mai un verde inventato', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.EXECUTION_STATUS_CHANGED, payload: { status: 'quantum' } });
  const pallino = trova(b.element, (e) => String(e.className).startsWith('talos-dot'));
  assert.equal(pallino.dataset.tone, 'neutral');
  assert.match(testoDi(trova(b.element, (e) => e.className === 'talos-status-bar__phase')), /quantum/);
});

test('BARRA-10 AL CONTRARIO un consumo che arriva senza sessione aperta viene ignorato', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: { tokens: 999 } } });
  assert.equal(s.getState().execution.usage, null);
  assert.doesNotMatch(testoDi(cella(b.element, 'tokens')), /999/);
});

test('BARRA-11 AL CONTRARIO dopo destroy lo store non la ridisegna più', () => {
  const s = store();
  const b = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1', usage: { tokens: 7 } } });
  assert.equal(b.destroy(), true);
  assert.equal(b.destroy(), false);
  // `destroy` smonta anche le misure: la cella resta vuota. Il verso che conta
  // e' che un dispatch successivo NON la riempia di nuovo.
  const dopoDestroy = testoDi(cella(b.element, 'tokens'));
  s.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: { tokens: 8 } } });
  assert.equal(testoDi(cella(b.element, 'tokens')), dopoDestroy, 'lo store non deve piu ridisegnare una superficie distrutta');
  assert.doesNotMatch(testoDi(cella(b.element, 'tokens')), /8/);
});

test('BARRA-12 AL CONTRARIO senza store, documento o etichette non si monta', () => {
  const s = store();
  assert.throws(() => createStatusBarSurface({ documentObj: fakeDocument(), labels: ETICHETTE }), /dipendenze barra di stato mancanti/);
  assert.throws(() => createStatusBarSurface({ store: s, labels: ETICHETTE }), /dipendenze barra di stato mancanti/);
  assert.throws(() => createStatusBarSurface({ documentObj: fakeDocument(), store: s, labels: { fields: [] } }), /richiede le sue etichette/);
});
