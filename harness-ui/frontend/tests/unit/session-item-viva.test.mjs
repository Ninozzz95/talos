import test from 'node:test';
import assert from 'node:assert/strict';

import { aggiornaSessionItem } from '../../src/components/session-item.js';

/*
 * ⛔⛔ N1 (10/09/2026) — LA BARRA LATERALE VIVA.
 *
 * Owner, ordine del 09/09: «PO-01 → N1 (barra laterale viva)». Misurato prima di scrivere: durante
 * un giro l'unica cosa che si aggiornava era l'albero delle figlie; la riga della sessione restava
 * quella del momento in cui era nata — «1 giro» anche al quinto.
 *
 * ⛔ Le prove che contano qui sono quelle sul NON fare: non ricostruire, non toccare ciò che non è
 *   cambiato, non sovrascrivere l'ora con un conteggio, non dire «in corso» a una sessione che sta
 *   aspettando una risposta.
 */

/** Una riga come quella vera, ridotta a ciò che la funzione tocca. */
function rigaFinta({ stato = 'vivo', tono = 'live', testo = 'in corso · glm-5.3-flash', giri = null, ora = '08:37' } = {}) {
  const figli = new Map();
  const crea = (classe, contenuto) => {
    const nodo = {
      className: classe,
      textContent: contenuto,
      ownerDocument: doc,
      append(...x) { nodo.figliArray.push(...x); },
      figliArray: [],
      get lastElementChild() { return nodo.figliArray.length ? nodo.figliArray[nodo.figliArray.length - 1] : null; },
    };
    return nodo;
  };
  const doc = { createElement: (tag) => ({ tag, textContent: '', ownerDocument: doc, figliArray: [], dataset: {}, append() {} }) }; // `dataset` c'è in ogni elemento vero
  const pallino = crea(`talos-dot talos-dot--sm${tono ? ` talos-dot--${tono}` : ''}`, '');
  const testoStato = crea('talos-session-item__state', testo);
  const aside = crea('talos-session-item__aside', '');
  aside.figliArray.push(crea('', ora));
  if (giri) aside.figliArray.push(crea('', giri));
  figli.set('.talos-dot', pallino);
  figli.set('.talos-session-item__state', testoStato);
  figli.set('.talos-session-item__aside', aside);
  return {
    dataset: { sessionState: stato },
    ownerDocument: doc,
    querySelector: (sel) => figli.get(sel) ?? null,
    pezzi: { pallino, testoStato, aside },
  };
}

test('N1: lo stato e i giri cambiano sul posto, e la funzione dice che ha fatto qualcosa', () => {
  const riga = rigaFinta({ stato: 'attesa', tono: 'warning', testo: 'aspetta te · glm-5.3-flash', giri: '2 richieste al modello' });
  const cambiato = aggiornaSessionItem(riga, { stato: { classe: 'vivo', testo: 'in corso', tono: 'live' }, giri: 5 });
  assert.equal(cambiato, true);
  assert.equal(riga.dataset.sessionState, 'vivo');
  assert.equal(riga.pezzi.pallino.className, 'talos-dot talos-dot--sm talos-dot--live');
  assert.equal(riga.pezzi.testoStato.textContent, 'in corso · glm-5.3-flash', 'il modello resta: chi chiama non lo passa, e cancellarlo sarebbe una perdita');
  assert.equal(riga.pezzi.aside.lastElementChild.textContent, '5 richieste al modello');
});

test('N1, AL CONTRARIO: se niente è cambiato non si tocca il DOM', () => {
  const riga = rigaFinta({ stato: 'vivo', tono: 'live', testo: 'in corso · glm-5.3-flash', giri: '3 richieste al modello' });
  const cambiato = aggiornaSessionItem(riga, { stato: { classe: 'vivo', testo: 'in corso', tono: 'live' }, giri: 3 });
  assert.equal(cambiato, false, '⛔ riscrivere lo stesso testo cancella la selezione di chi sta leggendo');
});

test('N1: il singolare si flette — «1 giro», non «1 giri»', () => {
  const riga = rigaFinta({ giri: null });
  aggiornaSessionItem(riga, { giri: 1 });
  assert.equal(riga.pezzi.aside.lastElementChild.textContent, '1 richiesta al modello');
});

/*
 * ⛔ IL CASO CHE GIUSTIFICA IL RICONOSCIMENTO PER PAROLA. Una riga senza giri ha nell'aside la sola
 * ORA: prendere «l'ultimo figlio» e sovrascriverlo direbbe l'ora sbagliata, per sempre.
 */
test('N1, AL CONTRARIO: su una riga senza giri il conteggio si AGGIUNGE, non copre l’ora', () => {
  const riga = rigaFinta({ giri: null, ora: '08:37' });
  aggiornaSessionItem(riga, { giri: 4 });
  const dentro = riga.pezzi.aside.figliArray.map((f) => f.textContent);
  assert.deepEqual(dentro, ['08:37', '4 richieste al modello'], '⛔ se l’ora sparisce, questa prova ha fatto il suo lavoro');
});

/*
 * ⛔ TACCUINO (09/10/2026, bugfixer): il conteggio si riconosceva dalla PAROLA, e quando è diventato «richieste al modello» ogni
 *   aggiornamento ne aggiungeva uno NUOVO accanto al vecchio. Ora lo ritrova il segno `data-conteggio` messo da chi lo crea: anche
 *   con una parola che il ripiego non conosce (un'altra lingua, una parola futura), il conteggio è uno solo.
 */
test('TACCUINO-CONTEGGIO — il conteggio si ritrova dal suo segno, non dalla parola: niente doppioni', () => {
  const riga = rigaFinta({ giri: null });
  aggiornaSessionItem(riga, { giri: 2 });
  const creato = riga.pezzi.aside.lastElementChild;
  assert.equal(creato.dataset?.conteggio, '', 'chi crea il conteggio lo segna');
  creato.textContent = '2 ⟦parola che nessuno conosce⟧';
  aggiornaSessionItem(riga, { giri: 3 });
  assert.equal(riga.pezzi.aside.figliArray.length, 2, 'l’ora e UN conteggio');
  assert.equal(riga.pezzi.aside.lastElementChild.textContent, '3 richieste al modello');
});

test('N1, AL CONTRARIO: senza stato si aggiornano solo i giri — è il caso di una sessione che aspetta te', () => {
  const riga = rigaFinta({ stato: 'attesa', tono: 'warning', testo: 'aspetta te · glm-5.3-flash', giri: '2 richieste al modello' });
  aggiornaSessionItem(riga, { giri: 3 });
  assert.equal(riga.dataset.sessionState, 'attesa', '⛔ dire «in corso» a chi aspetta te è il difetto curato il 04/09');
  assert.equal(riga.pezzi.testoStato.textContent, 'aspetta te · glm-5.3-flash');
  assert.equal(riga.pezzi.aside.lastElementChild.textContent, '3 richieste al modello');
});

test('N1, AL CONTRARIO: un conteggio assente o zero non scrive «0 giri»', () => {
  for (const valore of [null, undefined, 0, NaN, '4']) {
    const riga = rigaFinta({ giri: null });
    aggiornaSessionItem(riga, { giri: valore });
    assert.deepEqual(riga.pezzi.aside.figliArray.map((f) => f.textContent), ['08:37'], `⛔ ${JSON.stringify(valore)} non è un conteggio`);
  }
});

test('N1, AL CONTRARIO: senza riga non si crolla', () => {
  assert.equal(aggiornaSessionItem(null, { giri: 3 }), false);
  assert.equal(aggiornaSessionItem({}, { giri: 3 }), false, 'un oggetto che non è un elemento non deve far cadere il giro');
});
