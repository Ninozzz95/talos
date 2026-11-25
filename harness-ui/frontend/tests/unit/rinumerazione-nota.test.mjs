import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretaEventoCompattazione, creaNotaJournalRiparato, aggiornaNotaJournalRiparato } from '../../src/components/compattazione-legacy.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { documento as documentoDeiBlocchi } from './aiuto-dom-blocchi.mjs';

/* il DOM finto dei blocchi non ha `lastElementChild`, che la nota usa: si aggiunge qui, solo per questa prova */
function documento() {
  const doc = documentoDeiBlocchi();
  const proto = Object.getPrototypeOf(doc.body);
  if (!('lastElementChild' in proto)) Object.defineProperty(proto, 'lastElementChild', { get() { return this.children.at(-1) ?? null; } });
  return doc;
}

/*
 * 13/11/2026 — pezzo 4 della cura dell'affitto compromesso: la rinumerazione di un giornale già sporco si dice in chat come la
 *   riparazione della coda (una riga «recuperata», niente carte), in inglese e in italiano, con la copia di prima a un clic.
 */
const EVENTO = { type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, completata: true, righeScartate: 0, byteScartati: null, backup: 'C:\\finto\\s.jsonl.prima-della-rinumerazione-2026-11-13T16-00-00-000Z', rinumerate: 2 } };

test('RIN-UI-01: the renumbering event is read with its count; the forms of before do not gain the field', () => {
  const letto = interpretaEventoCompattazione(EVENTO);
  assert.equal(letto.tipo, 'riparato');
  assert.equal(letto.rinumerate, 2);
  assert.equal(letto.backup, EVENTO.value.backup);
  assert.equal('rinumerate' in interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, righeScartate: 1 } }), false);
  for (const rotto of [0, -1, 1.5, '2', null]) {
    assert.equal('rinumerate' in interpretaEventoCompattazione({ ...EVENTO, value: { ...EVENTO.value, rinumerate: rotto } }), false, JSON.stringify(rotto));
  }
});

test('RIN-UI-03 (from the mutants): through the column door the line is placed once and says the order; a zero count reads exactly as the form of before', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    colonna.querySelectorAll = () => colonna.children.filter((n) => n.dataset?.journalRiparato !== undefined);
    const info = interpretaEventoCompattazione(EVENTO);
    const nota = aggiornaNotaJournalRiparato(colonna, info, { document: doc });
    assert.equal(aggiornaNotaJournalRiparato(colonna, info, { document: doc }), nota, 'the same line once');
    assert.match(nota.textContent, /2 lines written at the same time by another TALOS were put back in order/);
    assert.match(nota.textContent, /Nothing was lost/);
    const zero = { type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, completata: true, righeScartate: 3, byteScartati: 812, backup: 'C:\\x.bak', rinumerate: 0 } };
    assert.deepEqual(interpretaEventoCompattazione(zero), { tipo: 'riparato', riparato: true, completata: true, righeScartate: 3, byteScartati: 812, backup: 'C:\\x.bak', errore: null });
  } finally {
    impostaLingua('it');
  }
});

test('RIN-UI-02: the «recovered» line says the lines were put back in order (never «0 lines discarded»), in English then Italian, with the copy', () => {
  try {
    impostaLingua('en');
    const nota = creaNotaJournalRiparato(interpretaEventoCompattazione(EVENTO), { document: documento() });
    const testo = nota.textContent;
    assert.match(testo, /conversation recovered/i);
    assert.match(testo, /2 lines/);
    assert.match(testo, /order/);
    assert.doesNotMatch(testo, /discarded/);
    assert.match(testo, /Where the copy is/);
    const una = creaNotaJournalRiparato(interpretaEventoCompattazione({ ...EVENTO, value: { ...EVENTO.value, rinumerate: 1 } }), { document: documento() }).textContent;
    assert.match(una, /1 line /);
    impostaLingua('it');
    const it = creaNotaJournalRiparato(interpretaEventoCompattazione(EVENTO), { document: documento() }).textContent;
    assert.match(it, /conversazione recuperata/i);
    assert.match(it, /2 righe/);
    assert.match(it, /ordine/);
    assert.doesNotMatch(it, /scartat/);
    assert.match(it, /Dove sta la copia/);
  } finally {
    impostaLingua('it');
  }
});
