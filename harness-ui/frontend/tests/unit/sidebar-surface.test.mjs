import assert from 'node:assert/strict';
import test from 'node:test';

import { createSidebarSurface, tonoDelloStato } from '../../src/app/surfaces/sidebar.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

/*
 * ⛔ Qui lo store e' QUELLO VERO (createStore + reducer + initial-state), non
 * un finto: la superficie deve reggere le regole del riduttore, comprese
 * quelle che rifiutano un'azione (una sessione che non esiste non si
 * seleziona). Un finto avrebbe accettato tutto e non avrebbe provato niente.
 */
const ETICHETTE = {
  navigation: 'Navigazione principale',
  places: 'Luoghi',
  sessions: 'Sessioni',
  empty: 'Nessuna sessione',
  turnsUnit: 'giri',
  unknownStatus: 'stato sconosciuto',
  status: { live: 'in corso', waiting: 'aspetta te', done: 'conclusa', error: 'giri finiti', interrupted: 'interrotta' },
  placeItems: [
    { id: 'capability', label: 'Capability', count: 43, countUnit: 'attrezzi' },
    { id: 'board', label: 'Board', count: 69, countUnit: 'sessioni' },
  ],
};

function conSessioni(sessions, activeSessionId = null) {
  const store = createStore({ initialState: createInitialState(), reducer });
  store.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions, projects: [], activeSessionId } });
  return store;
}
const monta = (store, extra = {}) => createSidebarSurface({
  documentObj: fakeDocument(), store, labels: { ...ETICHETTE, ...extra },
});

const SESSIONI = [
  { id: 'w1-02', title: 'W1-02 registro processi', status: 'running', model: 'claude-opus-5', turns: 7, updatedAtLabel: '18:09' },
  { id: 'cancello', title: 'Cancello ricerca web', status: 'done', model: 'claude-opus-5', turns: 3, updatedAtLabel: '17:10' },
];

test('SIDEBAR-01 le sessioni dello stato diventano righe, in una lista vera', () => {
  const s = monta(conSessioni(SESSIONI));
  const lista = trova(s.element, (e) => e.tagName === 'UL' && String(e.className).includes('talos-sidebar__sessions'));
  assert.equal(lista.children.length, 2);
  assert.equal(lista.children[0].tagName, 'LI');
  assert.match(testoDi(lista.children[0]), /W1-02 registro processi/);
});

test('SIDEBAR-02 la sessione aperta è «corrente», e cambia quando cambia lo stato', () => {
  const store = conSessioni(SESSIONI, 'w1-02');
  const s = monta(store);
  const bottoni = () => {
    const lista = trova(s.element, (e) => e.tagName === 'UL' && String(e.className).includes('talos-sidebar__sessions'));
    return lista.children.map((li) => li.children[0]);
  };
  assert.equal(bottoni()[0].getAttribute('aria-current'), 'true');
  assert.equal(bottoni()[1].getAttribute('aria-current'), null);
  store.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 'cancello' } });
  assert.equal(bottoni()[0].getAttribute('aria-current'), null);
  assert.equal(bottoni()[1].getAttribute('aria-current'), 'true');
});

test('SIDEBAR-03 premere una sessione la seleziona nello STORE, non in uno stato locale', () => {
  const store = conSessioni(SESSIONI);
  const s = monta(store);
  const lista = trova(s.element, (e) => e.tagName === 'UL' && String(e.className).includes('talos-sidebar__sessions'));
  lista.children[1].children[0].lancia('click', {});
  assert.equal(store.getState().sessions.activeId, 'cancello');
  assert.equal(store.getState().runtime.phase, 'ready-active');
});

test('SIDEBAR-04 ⭐ uno stato SCONOSCIUTO non si traduce a caso: testo grezzo e tono neutro', () => {
  const store = conSessioni([{ id: 'x', title: 'Sessione strana', status: 'quantum-superposition' }]);
  const s = monta(store);
  const sotto = trova(s.element, (e) => e.className === 'talos-session-item__sub');
  assert.match(testoDi(sotto), /quantum-superposition/);
  const pallino = trova(sotto, (e) => String(e.className).startsWith('talos-dot'));
  assert.match(pallino.className, /talos-dot--neutral/);
});

test('SIDEBAR-05 gli stati noti prendono il loro nome dalle etichette, non dal codice', () => {
  const s = monta(conSessioni(SESSIONI));
  const lista = trova(s.element, (e) => e.tagName === 'UL' && String(e.className).includes('talos-sidebar__sessions'));
  assert.match(testoDi(lista.children[0]), /in corso · claude-opus-5/);
  assert.match(testoDi(lista.children[1]), /conclusa · claude-opus-5/);
});

test('SIDEBAR-06 il luogo corrente segue la rotta, e premerlo la cambia nello store', () => {
  const store = conSessioni(SESSIONI);
  const s = monta(store);
  const voceBoard = trova(s.element, (e) => e.dataset?.testid === 'sidebar-place-board');
  voceBoard.lancia('click', {});
  assert.equal(store.getState().layout.route, 'board');
  assert.equal(voceBoard.getAttribute('aria-current'), 'page');
  const voceCapability = trova(s.element, (e) => e.dataset?.testid === 'sidebar-place-capability');
  assert.equal(voceCapability.getAttribute('aria-current'), null);
});

test('SIDEBAR-07 senza sessioni si dice, invece di lasciare un buco', () => {
  const s = monta(conSessioni([]));
  assert.match(testoDi(s.element), /Nessuna sessione/);
});

test('SIDEBAR-08 le righe si RIUSANO: una sessione che resta non viene ricostruita', () => {
  const store = conSessioni(SESSIONI);
  const s = monta(store);
  const lista = trova(s.element, (e) => e.tagName === 'UL' && String(e.className).includes('talos-sidebar__sessions'));
  const primaRiga = lista.children[0];
  store.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 'cancello' } });
  assert.equal(lista.children[0], primaRiga);
});

test('SIDEBAR-09 una sessione che sparisce dallo stato sparisce dalla lista', () => {
  const store = conSessioni(SESSIONI);
  const s = monta(store);
  store.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: [SESSIONI[0]], projects: [] } });
  const lista = trova(s.element, (e) => e.tagName === 'UL' && String(e.className).includes('talos-sidebar__sessions'));
  assert.equal(lista.children.length, 1);
  assert.match(testoDi(lista.children[0]), /W1-02/);
});

test('SIDEBAR-10 AL CONTRARIO dopo destroy lo store non la ridisegna più', () => {
  const store = conSessioni(SESSIONI);
  const s = monta(store);
  const lista = trova(s.element, (e) => e.tagName === 'UL' && String(e.className).includes('talos-sidebar__sessions'));
  assert.equal(s.destroy(), true);
  assert.equal(s.destroy(), false);
  // Dopo destroy la superficie ha smontato le sue righe: la lista è vuota.
  assert.equal(lista.children.length, 0);
  // ⭐ Il verso che conta: se l'iscrizione fosse ancora viva, questo dispatch
  // ripopolerebbe la lista. Resta vuota, quindi lo store non la chiama più.
  store.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: SESSIONI, projects: [] } });
  assert.equal(lista.children.length, 0, 'lo store non deve più ridisegnare una superficie distrutta');
});

test('SIDEBAR-11 AL CONTRARIO senza store, senza documento o senza etichette non si monta', () => {
  const store = conSessioni(SESSIONI);
  assert.throws(() => createSidebarSurface({ documentObj: fakeDocument(), labels: ETICHETTE }), /dipendenze sidebar mancanti/);
  assert.throws(() => createSidebarSurface({ store, labels: ETICHETTE }), /dipendenze sidebar mancanti/);
  assert.throws(() => createSidebarSurface({ documentObj: fakeDocument(), store, labels: { places: 'Luoghi' } }), /richiede le sue etichette/);
});

test('TONO-01 il tono conosce i suoi stati e ammette di non conoscere gli altri', () => {
  assert.equal(tonoDelloStato('running'), 'live');
  assert.equal(tonoDelloStato('Conclusa con errore'), 'error');
  assert.equal(tonoDelloStato('AWAITING-APPROVAL'), 'waiting');
  assert.equal(tonoDelloStato('boh'), null);
  assert.equal(tonoDelloStato(undefined), null);
});
