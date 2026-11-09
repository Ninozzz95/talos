/*
 * D21 del Tester (02/11/2026): in «Modifica e rimanda» il file diventava un cerchio, un disegno diverso da quello del messaggio.
 * La scheda ha un modulo solo: messaggio e modifica lo chiamano tutti e due, e il foglio di stile non lascia stirare la pillola.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { pezziSchedaFile } from '../../src/components/scheda-file.js';

function nodo(tag) {
  const n = {
    tag, attributi: {}, figli: [], dataset: {}, className: '', textContent: '',
    classList: { add(c) { n.className = `${n.className} ${c}`.trim(); } },
    setAttribute(k, v) { n.attributi[k] = v; },
    append(...f) { n.figli.push(...f); },
  };
  return n;
}
const doc = { createElement: nodo, createElementNS: (_, tag) => nodo(tag) };
const usa = (n) => n.figli.flatMap((f) => (f.tag === 'use' ? [f.attributi.href] : usa(f)));

test('D21 file: glifo della Libreria con estensione, nome, riga con tipo, peso e token', () => {
  const { pezzi, rigaSotto } = pezziSchedaFile(doc, { allegato: { tipo: 'file', nome: 'ordini.csv', byte: 4096 }, nome: 'ordini.csv', costo: '~20 token' });
  const [glifo, testi] = pezzi;
  assert.match(glifo.className, /talos-scheda-file__glifo/);
  assert.deepEqual(usa(glifo), ['#i-lib-file-spreadsheet']);
  assert.equal(glifo.figli.at(-1).textContent, 'CSV');
  assert.equal(testi.figli[0].textContent, 'ordini.csv');
  assert.match(testi.figli[0].className, /talos-allegati-chip__nome/, 'la modifica e le altre parti cercano ancora questa classe');
  assert.match(rigaSotto, /^Foglio di calcolo · 4[.,]0 KB · ~20 token$/u);
});

test('D21 pagina aperta: globo, nessuna estensione; la riga usa la parola data da chi chiama', () => {
  const { pezzi, rigaSotto } = pezziSchedaFile(doc, { allegato: { daBrowser: true, nome: 'example.com' }, nome: 'example.com', tipo: 'pagina aperta' });
  assert.deepEqual(usa(pezzi[0]), ['#i-globe']);
  assert.equal(rigaSotto, 'pagina aperta');
});

test('D21 senza peso né token la riga dice solo il tipo, mai uno zero', () => {
  assert.equal(pezziSchedaFile(doc, { allegato: { nome: 'a.txt' }, nome: 'a.txt' }).rigaSotto, 'Testo');
});

test('D21 messaggio e modifica passano dallo stesso modulo, e la fila della modifica non stira le schede', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.equal(app.match(/pezziSchedaFile\(document,/g)?.length, 2, 'una chiamata nel messaggio, una nella modifica');
  assert.doesNotMatch(app, /chip\.append\(textElement\('span', 'talos-allegati-chip__nome'/, 'la pillola vecchia della modifica non torna');
  const rami = readFileSync(new URL('../../src/styles/rami.css', import.meta.url), 'utf8');
  assert.match(rami, /\.talos-rami-modifica__immagini \{[^}]*align-items: flex-start/);
});
