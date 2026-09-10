import assert from 'node:assert/strict';
import { test } from 'node:test';

import { creaFileScaricabile, dimensioneLeggibile, indirizzoScarico } from '../../src/components/conversazione.js';

/*
 * ⛔⛔ PO-05, owner: «ogni file generato deve avere un collegamento diretto per scaricarlo con un clic;
 * nome, formato, dimensione e disponibilità REALI. **Un link o una scheda senza file non soddisfa il
 * requisito.**»
 *
 * Prima di oggi, dopo che il modello generava un documento, in chat si leggeva
 * `[binary docx file, 7714 bytes]`: una riga vera e inservibile. Misurato il 10/09/2026 su un giro del
 * generatore vero: un `.docx` da 7.695 byte, firma `50 4b 03 04`, scaricato via HTTP byte per byte
 * identico all'originale.
 *
 * Come lo fanno i tre (letto nel loro codice, 10/09/2026): Codex stampa solo `Saved to: file://…`;
 * Claude Code apre la cartella nel Finder; Hermes ha il bottone ma la sua scheda mostra SOLO il nome
 * — né dimensione né tipo. Il +1 di TALOS è dire anche formato e dimensione MISURATA.
 */

/** Il DOM minimo che serve alla scheda: nessun browser, nessuna dipendenza. */
function documentoFinto() {
  const crea = (tag) => {
    const nodo = {
      tagName: tag.toUpperCase(), className: '', dataset: {}, attributi: new Map(), figli: [], testo: '',
      append: (...v) => { for (const x of v) nodo.figli.push(x); },
      appendChild: (x) => { nodo.figli.push(x); return x; },
      setAttribute: (k, v) => nodo.attributi.set(k, String(v)),
      getAttribute: (k) => (nodo.attributi.has(k) ? nodo.attributi.get(k) : null),
      set textContent(v) { nodo.testo = String(v); },
      get textContent() { return nodo.figli.length ? nodo.figli.map((f) => (typeof f === 'string' ? f : f.textContent)).join('') : nodo.testo; },
      classList: { add: (c) => { nodo.className = `${nodo.className} ${c}`.trim(); }, contains: (c) => nodo.className.split(' ').includes(c) },
    };
    return nodo;
  };
  return { createElement: crea, createTextNode: (t) => ({ textContent: t, figli: [] }) };
}
const tutti = (nodo, fuori = []) => { fuori.push(nodo); for (const f of nodo.figli ?? []) if (typeof f === 'object') tutti(f, fuori); return fuori; };
const conClasse = (nodo, classe) => tutti(nodo).find((n) => n.className?.split(' ').includes(classe)) ?? null;

test('PO-05: la scheda dice nome, FORMATO e DIMENSIONE \u2014 i tre fatti che Hermes non mostra', () => {
  const scheda = creaFileScaricabile(
    { allegato: { nome: 'Relazione citt\u00e0.docx', formato: 'docx', byte: 7695 }, percorso: 'Relazione citt\u00e0.docx', sessionId: 'abc-1' },
    { document: documentoFinto() },
  );
  assert.equal(conClasse(scheda, 'talos-file-scaricabile__nome').textContent, 'Relazione citt\u00e0.docx');
  assert.equal(conClasse(scheda, 'talos-file-scaricabile__misura').textContent, 'DOCX \u00b7 7,5 KB');

  const link = conClasse(scheda, 'talos-file-scaricabile__scarica');
  assert.equal(link.tagName, 'A');
  assert.equal(link.getAttribute('download'), 'Relazione citt\u00e0.docx', 'il nome vero sopravvive all\u2019indirizzo percent-encoded');
  assert.equal(link.getAttribute('aria-label'), 'Scarica Relazione citt\u00e0.docx', 'tre allegati non possono essere tre \u00abScarica\u00bb indistinguibili');
  assert.match(link.href, /^\/api\/v1\/sessions\/abc-1\/file\?percorso=/);
});

test('PO-05, AL CONTRARIO: senza indirizzo NON si offre un clic che fallirebbe', () => {
  // \u26d4 «Un link o una scheda senza file non soddisfa il requisito»: allora non si mostra un bottone.
  const senzaSessione = creaFileScaricabile(
    { allegato: { nome: 'x.pdf', formato: 'pdf', byte: 10 }, percorso: 'x.pdf' },
    { document: documentoFinto() },
  );
  assert.equal(conClasse(senzaSessione, 'talos-file-scaricabile__scarica'), null, 'nessun bottone');
  assert.equal(conClasse(senzaSessione, 'talos-file-scaricabile__assente').textContent, 'Non disponibile da qui');

  assert.equal(indirizzoScarico({ sessionId: 'a' }), '', 'senza percorso non si costruisce un indirizzo');
  assert.equal(indirizzoScarico({ percorso: 'x' }), '', 'senza sessione nemmeno');
  assert.equal(indirizzoScarico(), '');
});

test('PO-05: la dimensione non si inventa \u2014 e un numero che non c\u2019\u00e8 non diventa \u00ab0 byte\u00bb', () => {
  assert.equal(dimensioneLeggibile(0), '0 byte');
  assert.equal(dimensioneLeggibile(512), '512 byte');
  assert.equal(dimensioneLeggibile(1024), '1,0 KB');
  assert.equal(dimensioneLeggibile(7695), '7,5 KB', 'il docx vero misurato il 10/09');
  assert.equal(dimensioneLeggibile(1536000), '1,5 MB');
  for (const nulla of [undefined, null, 'tanti', NaN, -5]) {
    assert.equal(dimensioneLeggibile(nulla), '', `\u26d4 ${JSON.stringify(nulla)} non deve diventare un numero`);
  }

  // e allora la riga della misura porta solo ci\u00f2 che si sa
  const soloFormato = creaFileScaricabile(
    { allegato: { nome: 'note.md', formato: 'md' }, percorso: 'note.md', sessionId: 's1' },
    { document: documentoFinto() },
  );
  assert.equal(conClasse(soloFormato, 'talos-file-scaricabile__misura').textContent, 'MD');
});

test('PO-05: il nome mostrato \u00e8 il file, non il percorso che lo contiene', () => {
  const scheda = creaFileScaricabile(
    { allegato: { byte: 2048 }, percorso: 'rapporti/2026/Relazione finale.xlsx', sessionId: 's1' },
    { document: documentoFinto() },
  );
  assert.equal(conClasse(scheda, 'talos-file-scaricabile__nome').textContent, 'Relazione finale.xlsx');
  assert.equal(conClasse(scheda, 'talos-file-scaricabile__misura').textContent, 'XLSX \u00b7 2,0 KB',
    'il formato si ricava dall\u2019estensione quando il server non lo dichiara');
  assert.match(conClasse(scheda, 'talos-file-scaricabile__scarica').href, /rapporti%2F2026%2FRelazione%20finale\.xlsx/,
    'l\u2019indirizzo porta il percorso INTERO: il nome corto \u00e8 solo ci\u00f2 che si legge');
});
