import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretaEventoCompattazione, creaNotaJournalRiparato, aggiornaNotaJournalRiparato } from '../../src/components/compattazione-legacy.js';
import { impostaLingua } from '../../src/components/lingua.js';
import { documento as documentoDeiBlocchi } from './aiuto-dom-blocchi.mjs';

function documento() {
  const doc = documentoDeiBlocchi();
  const proto = Object.getPrototypeOf(doc.body);
  if (!('lastElementChild' in proto)) Object.defineProperty(proto, 'lastElementChild', { get() { return this.children.at(-1) ?? null; } });
  return doc;
}

/*
 * 13/11/2026 — cura del revisore affitto 1 di 3 (giudice v1804, punti 1 e 5):
 *   · una scrittura messa DOPO le righe di un altro TALOS (il recinto) si dice in chat con UNA riga, in inglese e in italiano, niente
 *     carte (`scrittaAltrove: true`);
 *   · il conteggio «{n} lines written at the same time by another TALOS» conta solo le righe che hanno RIUSATO un numero (`doppie`),
 *     non tutte le righe spostate dopo il primo doppio (`rinumerate`, che resta per le righe scritte prima di questa cura).
 */
const RINUMERATA = { type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, completata: true, righeScartate: 0, byteScartati: null, backup: 'C:\\finto\\s.jsonl.prima-della-rinumerazione-2026-11-13T16-00-00-000Z', rinumerate: 194890, doppie: 3 } };
const ALTROVE = { type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, completata: true, righeScartate: 0, byteScartati: null, backup: null, scrittaAltrove: true } };

test('ALTROVE-UI-01: the count says the lines that reused a number (doppie), not every line moved after the first one', () => {
  try {
    impostaLingua('en');
    const letto = interpretaEventoCompattazione(RINUMERATA);
    assert.equal(letto.doppie, 3);
    const testo = creaNotaJournalRiparato(letto, { document: documento() }).textContent;
    assert.match(testo, /3 lines written at the same time by another TALOS/);
    assert.doesNotMatch(testo, /194/);
    impostaLingua('it');
    assert.match(creaNotaJournalRiparato(letto, { document: documento() }).textContent, /3 righe scritte nello stesso momento da un altro TALOS/);
    impostaLingua('en');
    const vecchia = { ...RINUMERATA, value: { ...RINUMERATA.value, doppie: undefined, rinumerate: 2 } };
    assert.match(creaNotaJournalRiparato(interpretaEventoCompattazione(vecchia), { document: documento() }).textContent, /2 lines written/, 'a line written before this fix keeps its count');
  } finally {
    impostaLingua('it');
  }
});

test('ALTROVE-UI-02: a write placed after another TALOS lines is ONE note, English then Italian, nothing lost, no copy button, no count', () => {
  try {
    impostaLingua('en');
    const letto = interpretaEventoCompattazione(ALTROVE);
    assert.equal(letto.scrittaAltrove, true);
    const en = creaNotaJournalRiparato(letto, { document: documento() }).textContent;
    assert.match(en, /Another TALOS wrote in this chat at the same time/);
    assert.match(en, /Nothing was lost/);
    assert.doesNotMatch(en, /discarded|Where the copy is/);
    impostaLingua('it');
    const it = creaNotaJournalRiparato(letto, { document: documento() }).textContent;
    assert.match(it, /Un altro TALOS ha scritto in questa chat nello stesso momento/);
    assert.match(it, /Niente è andato perso/);
    assert.doesNotMatch(it, /scartat|Dove sta la copia/);
  } finally {
    impostaLingua('it');
  }
});

test('ALTROVE-UI-03: through the column door the note is placed once, and it is not taken for a «0 lines discarded» repair', () => {
  try {
    impostaLingua('en');
    const doc = documento();
    const colonna = doc.createElement('div');
    colonna.querySelectorAll = () => colonna.children.filter((n) => n.dataset?.journalRiparato !== undefined);
    const zero = interpretaEventoCompattazione({ type: 'CUSTOM', name: 'talos.journal-riparato', value: { riparato: true, completata: true, righeScartate: 0, byteScartati: null, backup: null } });
    const notaZero = aggiornaNotaJournalRiparato(colonna, zero, { document: doc });
    const nota = aggiornaNotaJournalRiparato(colonna, interpretaEventoCompattazione(ALTROVE), { document: doc });
    assert.notEqual(nota, notaZero, 'a different note');
    assert.equal(aggiornaNotaJournalRiparato(colonna, interpretaEventoCompattazione(ALTROVE), { document: doc }), nota, 'the same note once');
    assert.equal('scrittaAltrove' in interpretaEventoCompattazione({ ...ALTROVE, value: { ...ALTROVE.value, scrittaAltrove: 'si' } }), false, 'only a true boolean');
    assert.equal('doppie' in interpretaEventoCompattazione({ ...RINUMERATA, value: { ...RINUMERATA.value, doppie: 0 } }), false, 'only a positive integer');
  } finally {
    impostaLingua('it');
  }
});

test('ALTROVE-UI-04: through the column door too, a renumbering of 7 moved lines of which 1 reused a number says «1 line», in both languages', () => {
  try {
    const evento = { ...RINUMERATA, value: { ...RINUMERATA.value, rinumerate: 7, doppie: 1 } };
    for (const [lingua, atteso, vietato] of [['en', /1 lines? written at the same time by another TALOS/, /7 lines/], ['it', /1 rig[ae] scritt[ae] nello stesso momento da un altro TALOS/, /7 righe/]]) {
      impostaLingua(lingua);
      const doc = documento();
      const colonna = doc.createElement('div');
      colonna.querySelectorAll = () => colonna.children.filter((n) => n.dataset?.journalRiparato !== undefined);
      const testo = aggiornaNotaJournalRiparato(colonna, interpretaEventoCompattazione(evento), { document: doc }).textContent;
      assert.match(testo, atteso, `${lingua}: ${testo}`);
      assert.doesNotMatch(testo, vietato, `${lingua}: not every moved line`);
    }
  } finally {
    impostaLingua('it');
  }
});
