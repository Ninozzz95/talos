import assert from 'node:assert/strict';
import test from 'node:test';

import { createConversationSurface } from '../../src/app/surfaces/conversation.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = { log: 'Conversazione con TALOS', you: 'Tu', assistant: 'TALOS', streaming: 'TALOS sta rispondendo' };

/** Uno scheduler a mano: i ridisegni si eseguono quando lo dico io. */
function scheduler() {
  const code = [];
  return {
    pianifica: (fn) => code.push(fn),
    fotogramma() { const da = code.splice(0); for (const fn of da) fn(); return da.length; },
    inCoda: () => code.length,
  };
}

function conSessione() {
  const store = createStore({ initialState: createInitialState(), reducer });
  store.dispatch({
    type: ACTIONS.BOOTSTRAP_SUCCEEDED,
    payload: { sessions: [{ id: 's1', title: 'W1-02', status: 'running' }], projects: [], activeSessionId: 's1' },
  });
  return store;
}
const evento = (store, event) => store.dispatch({
  type: ACTIONS.SESSION_EVENT_RECEIVED,
  payload: { sessionId: 's1', generation: store.getState().sessions.generation, event },
});

function monta(store, extra = {}) {
  const s = scheduler();
  const detti = [];
  const superficie = createConversationSurface({
    documentObj: fakeDocument(),
    store,
    schedule: s.pianifica,
    labels: { ...ETICHETTE, announce: (m) => detti.push(m), ...extra },
  });
  s.fotogramma();
  return { superficie, s, detti };
}

test('CONV-01 il contenitore è il log della fase 4, col suo nome', () => {
  const { superficie } = monta(conSessione());
  assert.equal(superficie.element.getAttribute('role'), 'log');
  assert.equal(superficie.element.getAttribute('aria-label'), 'Conversazione con TALOS');
});

test('CONV-02 ⭐ i token si ACCORPANO: cinque delta, UN solo ridisegno', () => {
  const store = conSessione();
  const { superficie, s } = monta(store);
  const prima = superficie.ridisegni();
  for (const pezzo of ['La ', 'guardia ', 'è ', 'scritta', '.']) {
    evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: pezzo });
  }
  assert.equal(s.inCoda(), 1, 'i cinque delta devono chiedere UN fotogramma solo');
  s.fotogramma();
  assert.equal(superficie.ridisegni() - prima, 1);
  assert.match(testoDi(superficie.element), /La guardia è scritta\./);
});

test('CONV-03 ⭐ mentre scrive si annuncia una volta; alla fine il messaggio INTERO', () => {
  const store = conSessione();
  const { superficie, s, detti } = monta(store);
  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: 'La guardia è scritta.' });
  s.fotogramma();
  assert.deepEqual(detti, ['TALOS sta rispondendo']);
  assert.equal(superficie.element.getAttribute('aria-busy'), 'true');

  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: ' I test la coprono.' });
  s.fotogramma();
  assert.deepEqual(detti, ['TALOS sta rispondendo'], 'mentre scrive non si annuncia altro');

  evento(store, { type: 'TextMessageEnd', messageId: 'm1' });
  s.fotogramma();
  assert.deepEqual(detti, ['TALOS sta rispondendo', 'La guardia è scritta. I test la coprono.']);
  assert.equal(superficie.element.getAttribute('aria-busy'), 'false');
});

test('CONV-04 ⭐ il messaggio si RIUSA: un delta non ricostruisce il nodo', () => {
  const store = conSessione();
  const { superficie, s } = monta(store);
  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: 'Primo' });
  s.fotogramma();
  const articolo = trova(superficie.element, (e) => e.tagName === 'ARTICLE');
  const paragrafo = trova(articolo, (e) => e.tagName === 'P');
  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: ' secondo' });
  s.fotogramma();
  assert.equal(trova(superficie.element, (e) => e.tagName === 'ARTICLE'), articolo, 'stesso article');
  assert.equal(trova(articolo, (e) => e.tagName === 'P'), paragrafo, 'stesso paragrafo');
  assert.equal(paragrafo.textContent, 'Primo secondo');
});

test('CONV-05 ⭐ chi è risalito a leggere NON viene trascinato in fondo', () => {
  const store = conSessione();
  const { superficie, s } = monta(store);
  const contenitore = superficie.element;
  contenitore.scrollHeight = 1000;
  contenitore.clientHeight = 300;

  // In fondo: l'aggancio tiene.
  contenitore.scrollTop = 700;
  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: 'uno' });
  s.fotogramma();
  assert.equal(contenitore.scrollTop, 1000);

  // Risalito a leggere: si resta dov'è.
  contenitore.scrollTop = 120;
  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: ' due' });
  s.fotogramma();
  assert.equal(contenitore.scrollTop, 120);
});

test('CONV-06 i due autori hanno nomi diversi, presi dalle etichette', () => {
  const store = conSessione();
  store.dispatch({
    type: ACTIONS.SESSION_SELECTED,
    payload: { id: 's1', messages: [
      { id: 'u1', role: 'user', content: 'Aggiungi la guardia' },
      { id: 'a1', role: 'assistant', content: 'Fatto' },
    ] },
  });
  const { superficie } = monta(store);
  const articoli = [];
  const cerca = (el) => { if (el.tagName === 'ARTICLE') articoli.push(el); for (const f of el.children) cerca(f); };
  cerca(superficie.element);
  assert.equal(articoli.length, 2);
  assert.match(testoDi(articoli[0]), /Tu/);
  assert.match(testoDi(articoli[1]), /TALOS/);
  assert.match(articoli[0].className, /talos-message--user/);
});

test('CONV-07 un messaggio che sparisce dallo stato viene smontato', () => {
  const store = conSessione();
  const { superficie, s } = monta(store);
  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: 'testo' });
  s.fotogramma();
  store.dispatch({ type: ACTIONS.SESSION_CLEARED, payload: {} });
  s.fotogramma();
  assert.equal(trova(superficie.element, (e) => e.tagName === 'ARTICLE'), null);
});

test('CONV-08 AL CONTRARIO dopo destroy niente si ridisegna, e il fotogramma pendente non esplode', () => {
  const store = conSessione();
  const { superficie, s } = monta(store);
  evento(store, { type: 'TextMessageContent', messageId: 'm1', delta: 'testo' });
  assert.equal(s.inCoda(), 1);
  assert.equal(superficie.destroy(), true);
  assert.equal(superficie.destroy(), false);
  const prima = superficie.ridisegni();
  s.fotogramma();
  assert.equal(superficie.ridisegni(), prima, 'il fotogramma pendente non deve ridisegnare una superficie morta');
  evento(store, { type: 'TextMessageContent', messageId: 'm2', delta: 'altro' });
  assert.equal(s.inCoda(), 0, 'lo store non deve più chiamarla');
});

test('CONV-09 AL CONTRARIO senza store, documento o etichette non si monta', () => {
  const store = conSessione();
  assert.throws(() => createConversationSurface({ documentObj: fakeDocument(), labels: ETICHETTE }), /dipendenze conversazione mancanti/);
  assert.throws(() => createConversationSurface({ store, labels: ETICHETTE }), /dipendenze conversazione mancanti/);
  assert.throws(() => createConversationSurface({ documentObj: fakeDocument(), store, labels: { log: 'x' } }), /richiede le sue etichette/);
});
