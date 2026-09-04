import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoardSurface } from '../../src/app/surfaces/board.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const COLONNE = [
  { id: 'sessione', label: 'Sessione', rowHeader: true },
  { id: 'stato', label: 'Stato' },
  { id: 'modello', label: 'Modello' },
  { id: 'giri', label: 'Giri', align: 'end', sortable: true },
  { id: 'cache', label: 'Cache', align: 'end', sortable: true },
  { id: 'primoToken', label: 'Primo token', align: 'end', sortable: true },
  { id: 'chiusura', label: 'Chiusa per' },
];
const ETICHETTE = {
  caption: 'Tutte le sessioni',
  columns: COLONNE,
  unmeasured: 'non misurato',
  stillRunning: 'ancora in corso',
  ascending: 'crescente',
  descending: 'decrescente',
  status: { live: 'in corso', done: 'conclusa', error: 'giri finiti' },
  closeReasons: { 'fine-lavoro': 'fine lavoro', 'giri-finiti': 'giri finiti', errore: 'errore', fermata: 'fermata da te' },
};

const SESSIONI = [
  { id: 's1', title: 'W1-02 registro processi', status: 'running', model: 'claude-opus-5' },
  { id: 's2', title: 'Cancello ricerca web', status: 'done', model: 'claude-opus-5' },
];

function store(sessions = SESSIONI) {
  const s = createStore({ initialState: createInitialState(), reducer });
  s.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions, projects: [] } });
  return s;
}
const monta = (s, extra = {}) => createBoardSurface({
  documentObj: fakeDocument(), store: s, labels: { ...ETICHETTE, ...extra }, testId: 'board',
});
const celle = (elemento) => {
  const trovate = [];
  const cerca = (el) => { if (el.tagName === 'TD' || (el.tagName === 'TH' && el.getAttribute('scope') === 'row')) trovate.push(el); for (const f of el.children) cerca(f); };
  cerca(elemento);
  return trovate;
};

/* --- La regola: «zero misurato» e «non misurato» non si scrivono uguali --- */

test('BOARD-01 ⭐ un tasso di cache a ZERO MISURATO si scrive 0%, non un trattino', () => {
  const s = store();
  const b = monta(s);
  b.update({ metricsById: { s1: { registrato: true, cache: { percentuale: 0, frazione: 0 } } } });
  const riga = celle(b.element).slice(0, 7);
  assert.equal(testoDi(riga[4]), '0 %');
  assert.equal(trova(riga[4], (e) => e.className === 'talos-board__unmeasured'), null);
});

test('BOARD-02 ⭐ una cache NON misurata è un trattino, col MOTIVO, mai uno 0% inventato', () => {
  const s = store();
  const b = monta(s);
  b.update({ metricsById: { s1: { registrato: true, cache: { percentuale: null, motivoAssente: 'nessun evento di consumo in questa storia' } } } });
  const riga = celle(b.element).slice(0, 7);
  const nonMisurato = trova(riga[4], (e) => e.className === 'talos-board__unmeasured');
  assert.notEqual(nonMisurato, null);
  assert.equal(nonMisurato.getAttribute('title'), 'nessun evento di consumo in questa storia');
  // Chi guarda vede il segno; chi ascolta sente la parola.
  assert.equal(testoDi(nonMisurato), '—non misurato');
});

test('BOARD-03 ⭐ il tempo al primo token assente NON diventa zero secondi', () => {
  const s = store();
  const b = monta(s);
  b.update({ metricsById: { s1: { registrato: true, primoToken: { ms: null, motivoAssente: 'gli eventi persistiti non portano un orario' } } } });
  const riga = celle(b.element).slice(0, 7);
  assert.match(testoDi(riga[5]), /—/);
  assert.doesNotMatch(testoDi(riga[5]), /0,0/);
});

test('BOARD-04 un tempo al primo token misurato si legge in secondi', () => {
  const s = store();
  const b = monta(s);
  b.update({ metricsById: { s1: { registrato: true, primoToken: { ms: 1420 } } } });
  assert.equal(testoDi(celle(b.element)[5]), '1,4 s');
});

test('BOARD-05 una sessione ancora in corso dice «ancora in corso», non «errore»', () => {
  const s = store();
  const b = monta(s);
  b.update({ metricsById: { s1: { registrato: true, chiusura: { motivo: null, motivoAssente: 'il giro non ha ancora un esito' } } } });
  const cella = celle(b.element)[6];
  assert.equal(testoDi(trova(cella, (e) => e.className === 'talos-board__unmeasured')), '—ancora in corso');
});

test('BOARD-06 il motivo di chiusura si traduce, e il CODICE grezzo resta consultabile', () => {
  const s = store();
  const b = monta(s);
  b.update({ metricsById: { s1: { registrato: true, chiusura: { motivo: 'giri-finiti', codice: 'giri-esauriti' } } } });
  const cella = celle(b.element)[6];
  assert.equal(testoDi(cella), 'giri finiti');
  assert.equal(cella.children[0].getAttribute('title'), 'giri-esauriti');
});

test('BOARD-07 uno stato di sessione sconosciuto resta grezzo', () => {
  const s = store([{ id: 'x', title: 'Strana', status: 'quantum' }]);
  const b = monta(s);
  assert.match(testoDi(celle(b.element)[1]), /quantum/);
});

/* --- Ordinamento --- */

test('BOARD-08 ⭐ chi NON ha una misura finisce in fondo, in ENTRAMBI i versi', () => {
  const s = store();
  const b = monta(s);
  b.update({
    metricsById: {
      s1: { registrato: true, cache: { percentuale: null } },
      s2: { registrato: true, cache: { percentuale: 87 } },
    },
    sort: { column: 'cache', direction: 'descending' },
  });
  const titoli = () => celle(b.element).filter((c) => c.tagName === 'TH').map((c) => c.textContent);
  assert.deepEqual(titoli(), ['Cancello ricerca web', 'W1-02 registro processi']);
  b.update({ sort: { column: 'cache', direction: 'ascending' } });
  assert.deepEqual(titoli(), ['Cancello ricerca web', 'W1-02 registro processi'],
    'il non misurato resta in fondo anche in salita: metterlo in cima lo farebbe sembrare il più basso');
});

test('BOARD-09 premere una colonna riordina e lo annuncia', () => {
  const detti = [];
  const s = store();
  const b = monta(s, { announce: (m) => detti.push(m) });
  b.update({ metricsById: { s1: { registrato: true, giri: 7 }, s2: { registrato: true, giri: 24 } } });
  const bottone = trova(b.element, (e) => e.tagName === 'BUTTON' && testoDi(e).startsWith('Giri'));
  bottone.lancia('click', {});
  assert.deepEqual(detti, ['Giri, crescente']);
  const titoli = celle(b.element).filter((c) => c.tagName === 'TH').map((c) => c.textContent);
  assert.deepEqual(titoli, ['W1-02 registro processi', 'Cancello ricerca web']);
});

/* --- Contratto --- */

test('BOARD-10 la tabella ha la sua didascalia visibile e le intestazioni di colonna', () => {
  const b = monta(store());
  assert.equal(trova(b.element, (e) => e.tagName === 'CAPTION').textContent, 'Tutte le sessioni');
  const intestazioni = [];
  const cerca = (el) => { if (el.tagName === 'TH' && el.getAttribute('scope') === 'col') intestazioni.push(el); for (const f of el.children) cerca(f); };
  cerca(b.element);
  assert.equal(intestazioni.length, 7);
});

test('BOARD-11 senza metriche la tabella non inventa niente: tutte le colonne derivate sono trattini', () => {
  const b = monta(store());
  const riga = celle(b.element).slice(0, 7);
  for (const indice of [4, 5, 6]) {
    assert.notEqual(trova(riga[indice], (e) => e.className === 'talos-board__unmeasured'), null);
  }
});

test('BOARD-12 AL CONTRARIO dopo destroy lo store non la ridisegna più', () => {
  const s = store();
  const b = monta(s);
  assert.equal(b.destroy(), true);
  assert.equal(b.destroy(), false);
  // Due sessioni per sette colonne: quello che c'è al momento della distruzione.
  const celleDopoDestroy = celle(b.element).length;
  assert.equal(celleDopoDestroy, 14);
  // ⭐ Il verso che conta: se l'iscrizione fosse viva, questo dispatch
  // svuoterebbe la tabella. Resta com'era, quindi lo store non la chiama più.
  s.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: [], projects: [] } });
  assert.equal(celle(b.element).length, celleDopoDestroy, 'lo store non deve più ridisegnare una superficie distrutta');
});

test('BOARD-13 AL CONTRARIO senza store, documento o etichette non si monta', () => {
  const s = store();
  assert.throws(() => createBoardSurface({ documentObj: fakeDocument(), labels: ETICHETTE }), /dipendenze board mancanti/);
  assert.throws(() => createBoardSurface({ store: s, labels: ETICHETTE }), /dipendenze board mancanti/);
  assert.throws(() => createBoardSurface({ documentObj: fakeDocument(), store: s, labels: { caption: 'x' } }), /richiede le sue etichette/);
});
