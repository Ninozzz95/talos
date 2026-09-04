import assert from 'node:assert/strict';
import test from 'node:test';

import { createTopbarSurface, troncaAlCentro } from '../../src/app/surfaces/topbar.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = {
  regionLabel: 'Intestazione della sessione',
  untitled: 'Nuova conversazione',
  noWorkspace: 'nessuna cartella scelta',
  pathMax: 40,
  views: [
    { id: 'chat', label: 'Chat' },
    { id: 'terminal', label: 'Terminale', countUnit: 'schede' },
    { id: 'diff', label: 'Review', countUnit: 'file' },
  ],
};

const SESSIONI = [
  { id: 's1', title: 'W1-02 registro processi', status: 'running' },
  { id: 's2', status: 'done' },
];

function store() {
  const s = createStore({ initialState: createInitialState(), reducer });
  s.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: SESSIONI, projects: [] } });
  return s;
}
const monta = (s, extra = {}) => createTopbarSurface({
  documentObj: fakeDocument(), store: s, labels: { ...ETICHETTE, ...extra }, testId: 'topbar',
});
const percorsoDi = (el) => trova(el, (e) => e.className === 'talos-topbar__path');
const visibileDi = (el) => percorsoDi(el).children[0];
const interoDi = (el) => percorsoDi(el).children[1];

/* --- Troncare un percorso --- */

test('TOP-01 ⭐⭐ un percorso si tronca AL CENTRO: contano la testa E la coda', () => {
  const lungo = 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui/frontend';
  const troncato = troncaAlCentro(lungo, 40);
  assert.ok(troncato.length <= 40);
  assert.match(troncato, /^C:\/Users/, 'la testa dice quale disco e quale casa');
  assert.match(troncato, /frontend$/, 'la coda dice la cartella VERA: tagliarla lo rende inutile');
  assert.match(troncato, /…/);
});

test('TOP-02 un percorso corto non si tocca', () => {
  assert.equal(troncaAlCentro('C:/talos', 40), 'C:/talos');
  assert.equal(troncaAlCentro('', 40), '');
});

test('TOP-03 ⭐ se non c\'è spazio per testa E coda NON si tronca a caso: meglio lungo che illeggibile', () => {
  const lungo = 'C:/Users/Antonino/Desktop/progetto';
  assert.equal(troncaAlCentro(lungo, 10), lungo);
});

/* --- Il percorso a schermo --- */

test('TOP-04 ⭐⭐ il percorso INTERO è testo vero, non solo un attributo title', () => {
  const s = store();
  const t = monta(s);
  const lungo = 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui';
  t.update({ workspace: lungo });
  // Il title c'è, per il mouse...
  assert.equal(percorsoDi(t.element).getAttribute('title'), lungo);
  // ...ma il testo intero è VERO: il title non esiste sul tocco, le traduzioni
  // lo saltano e le tecnologie assistive non ci si possono affidare.
  assert.equal(testoDi(interoDi(t.element)), lungo);
  assert.equal(interoDi(t.element).className, 'sr-only');
  // E la parte troncata è nascosta a chi ascolta: altrimenti sentirebbe due volte.
  assert.equal(visibileDi(t.element).getAttribute('aria-hidden'), 'true');
  assert.match(testoDi(visibileDi(t.element)), /…/);
});

test('TOP-05 ⭐⭐ un workspace che è la RADICE di un disco resta visibile e segnato', () => {
  const s = store();
  const t = monta(s);
  t.update({ workspace: 'C:\\' });
  // ⛔ Il 02/09 una sessione girava col Desktop intero, il 04/09 un'altra con
  // C:\ — accorciare quel percorso «per bellezza» nasconderebbe l'unica cosa
  // che va guardata.
  assert.equal(testoDi(visibileDi(t.element)), 'C:\\');
  assert.equal(percorsoDi(t.element).dataset.radice, 'si');
  t.update({ workspace: 'C:/progetti/talos' });
  assert.equal(percorsoDi(t.element).dataset.radice, undefined);
});

test('TOP-06 nessun workspace non è una cartella vuota: si dice', () => {
  const s = store();
  const t = monta(s);
  assert.equal(testoDi(visibileDi(t.element)), 'nessuna cartella scelta');
  assert.equal(percorsoDi(t.element).getAttribute('title'), null);
});

/* --- Titolo e viste --- */

test('TOP-07 il titolo è un h1 solo, e una sessione senza nome non mostra il suo id', () => {
  const s = store();
  const t = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  const h1 = trova(t.element, (e) => e.tagName === 'H1');
  assert.equal(testoDi(h1), 'W1-02 registro processi');
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's2' } });
  assert.equal(testoDi(h1), 'Nuova conversazione');
  assert.doesNotMatch(testoDi(h1), /s2/);
});

test('TOP-08 ⭐ il titolo NON è una regione live: cambia quando cambi sessione, e lo hai fatto tu', () => {
  const s = store();
  const t = monta(s);
  const h1 = trova(t.element, (e) => e.tagName === 'H1');
  assert.equal(h1.getAttribute('aria-live'), null);
  assert.equal(t.element.getAttribute('aria-live'), null);
});

test('TOP-09 le viste portano il conteggio, e premerne una cambia la rotta nello store', () => {
  const s = store();
  const t = monta(s);
  t.update({ counts: { terminal: 2, diff: 3 } });
  const conto = trova(t.element.querySelector('[data-tab-id="terminal"]'), (e) => e.className === 'talos-tabs__count');
  assert.equal(testoDi(conto), '2 schede');
  const scheda = t.element.querySelector('[data-tab-id="diff"]');
  scheda.lancia('click', { target: scheda });
  assert.equal(s.getState().layout.route, 'diff');
  assert.equal(t.element.querySelector('[data-tab-id="diff"]').getAttribute('aria-selected'), 'true');
});

test('TOP-10 ⭐ una rotta che non è una vista della sessione non lascia le schede senza selezione', () => {
  const s = store();
  const t = monta(s);
  s.dispatch({ type: ACTIONS.ROUTE_CHANGED, payload: { route: 'settings' } });
  assert.equal(t.element.querySelector('[data-tab-id="chat"]').getAttribute('aria-selected'), 'true');
});

test('TOP-11 una vista senza conteggio non mostra un contrassegno vuoto', () => {
  const s = store();
  const t = monta(s);
  t.update({ counts: { terminal: 2 } });
  assert.equal(trova(t.element.querySelector('[data-tab-id="diff"]'), (e) => e.className === 'talos-tabs__count'), null);
});

test('TOP-12 le azioni passate da fuori finiscono nella loro zona', () => {
  const s = store();
  const doc = fakeDocument();
  const bottone = doc.createElement('button');
  bottone.className = 'azione-prova';
  const t = createTopbarSurface({ documentObj: doc, store: s, labels: ETICHETTE, azioni: [bottone] });
  assert.equal(trova(t.element, (e) => e.className === 'azione-prova'), bottone);
  assert.equal(bottone.parentNode.className, 'talos-topbar__actions');
});

test('TOP-13 AL CONTRARIO dopo destroy lo store non la ridisegna più', () => {
  const s = store();
  const t = monta(s);
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  assert.equal(t.destroy(), true);
  assert.equal(t.destroy(), false);
  const prima = testoDi(trova(t.element, (e) => e.tagName === 'H1'));
  s.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's2' } });
  assert.equal(testoDi(trova(t.element, (e) => e.tagName === 'H1')), prima);
});

test('TOP-14 AL CONTRARIO senza store, documento o viste non si monta', () => {
  const s = store();
  assert.throws(() => createTopbarSurface({ documentObj: fakeDocument(), labels: ETICHETTE }), /dipendenze topbar mancanti/);
  assert.throws(() => createTopbarSurface({ store: s, labels: ETICHETTE }), /dipendenze topbar mancanti/);
  assert.throws(() => createTopbarSurface({ documentObj: fakeDocument(), store: s, labels: { views: [] } }), /richiede le sue etichette/);
});

test('TOP-15 ⭐⭐ le viste non disegnano pannelli qui: i loro pannelli sono l\'area principale', () => {
  const s = store();
  const t = monta(s);
  // ⛔ Un pannello vuoto disegnato nella barra prometterebbe un contenuto che
  // non c'è — e nel giro visivo dava alla barra un'altezza che spingeva le
  // schede sopra il titolo.
  assert.equal(t.element.querySelector('[role="tabpanel"]'), null);
});

test('TOP-16 ⭐⭐ una vista senza il suo id NON riceve un aria-controls appeso al vuoto', () => {
  const s = store();
  const t = monta(s);
  // Nessuna vista dichiara `controls`: meglio l'attributo assente che un
  // riferimento a un elemento che non esiste.
  assert.equal(t.element.querySelector('[data-tab-id="chat"]').getAttribute('aria-controls'), null);

  const conId = createTopbarSurface({
    documentObj: fakeDocument(),
    store: s,
    labels: { ...ETICHETTE, views: [{ id: 'chat', label: 'Chat', controls: 'area-principale' }, { id: 'diff', label: 'Review' }] },
  });
  assert.equal(conId.element.querySelector('[data-tab-id="chat"]').getAttribute('aria-controls'), 'area-principale');
  assert.equal(conId.element.querySelector('[data-tab-id="diff"]').getAttribute('aria-controls'), null);
});
