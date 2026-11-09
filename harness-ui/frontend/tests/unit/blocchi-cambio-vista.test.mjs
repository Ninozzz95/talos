/*
 * Scene 1 (FE-081, G-B, 05/11/2026), UIG-1.6: «Bars ↔ Table» on the PC, with no network and no model. Every result is a block the
 * reader accepts; a block with no other view gets null (the menu entry is not offered).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { leggi } from '../../../src/blocchi/lettore.mjs';
import { scriviSorgente } from '../../../src/blocchi/versioni.mjs';
import { impostaLingua, t } from '../../src/components/lingua.js';
import { altraVista, graficoInTabella, tabellaInGrafico } from '../../src/components/blocchi/cambio-vista.js';

impostaLingua('it');
const BARRE = Object.freeze({
  tipo: 'grafico', id: 'g1', titolo: 'Spese', forma: 'barre', descrizione: 'Spese per mese', unita: '€',
  serie: [
    { nome: 'Casa', punti: [{ x: 'gen', y: 10 }, { x: 'feb', y: 12 }] },
    { nome: 'Auto', punti: [{ x: 'feb', y: 3 }, { x: 'mar', y: -4 }] },
  ],
});
const ok = (b) => assert.equal(leggi(scriviSorgente(b)).stato, 'completo', JSON.stringify(b));

test('UIG-1.6 bars → table: one row per category in first-seen order, one column per series, empty where a series has no value', () => {
  const tab = graficoInTabella(BARRE);
  ok(tab);
  assert.equal(tab.tipo, 'tabella');
  assert.deepEqual(tab.colonne.map((c) => [c.titolo, c.tipo]), [[t('blocchi.view.category'), 'testo'], ['Casa', 'soldi'], ['Auto', 'soldi']]);
  assert.deepEqual(tab.righe, [['gen', 10, null], ['feb', 12, 3], ['mar', null, -4]]);
  assert.equal(tab.titolo, 'Spese');
  /* a unit that is not money stays in the column title */
  const kg = graficoInTabella({ ...BARRE, unita: 'kg' });
  assert.deepEqual(kg.colonne.slice(1).map((c) => [c.titolo, c.tipo]), [['Casa (kg)', 'numero'], ['Auto (kg)', 'numero']]);
});

test('UIG-1.6 table → bars and back gives the same series; empty cells are left out', () => {
  const g = tabellaInGrafico(graficoInTabella(BARRE));
  ok(g);
  assert.equal(g.forma, 'barre');
  assert.equal(g.unita, '€');
  assert.deepEqual(g.serie, BARRE.serie);
  assert.equal(g.descrizione, t('blocchi.view.asBars', { title: 'Spese' }), 'a chart always has its text alternative');
});

test('UIG-1.6 no other view: lines, pie, a table with a text column after the first, a table with no numbers, other types', () => {
  assert.equal(altraVista({ ...BARRE, forma: 'linee' }), null);
  assert.equal(altraVista({ ...BARRE, forma: 'torta' }), null);
  const tab = { tipo: 'tabella', id: 't', titolo: 'T', colonne: [{ id: 'a', titolo: 'A', tipo: 'testo' }, { id: 'b', titolo: 'B', tipo: 'testo' }], righe: [['x', 'y']] };
  assert.equal(altraVista(tab), null);
  assert.equal(altraVista({ ...tab, colonne: [tab.colonne[0], { id: 'n', titolo: 'N', tipo: 'numero' }], righe: [['x', null]] }), null, 'no number at all: no chart');
  assert.equal(altraVista({ tipo: 'avviso', id: 'a', livello: 'info', testo: 'x' }), null);
  assert.equal(altraVista(null), null);
  /* a second text column would be dropped in silence: no chart */
  assert.equal(altraVista({ ...tab, colonne: [...tab.colonne, { id: 'n', titolo: 'N', tipo: 'numero' }], righe: [['x', 'y', 2]] }), null);
  /* a number column with no value at all is not an empty series */
  const g = altraVista({ ...tab, colonne: [tab.colonne[0], { id: 'v', titolo: 'Vuota', tipo: 'numero' }, { id: 'n', titolo: 'N', tipo: 'numero' }], righe: [['x', null, 2]] });
  assert.deepEqual(g.serie.map((s) => s.nome), ['N']);
  /* eight number columns would make eight series, past the six a chart may have: the reader refuses, no entry */
  const otto = Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, titolo: `N${i}`, tipo: 'numero' }));
  assert.equal(altraVista({ ...tab, colonne: [tab.colonne[0], ...otto], righe: [['x', 1, 2, 3, 4, 5, 6, 7, 8]] }), null);
  /* the right way round: a valid table does switch */
  ok(altraVista({ ...tab, colonne: [tab.colonne[0], { id: 'n', titolo: 'N', tipo: 'numero' }], righe: [['x', 2]] }));
});

test('UIG-1.6 the switch makes no network call (the module has no fetch)', async () => {
  const { readFileSync } = await import('node:fs');
  const sorgente = readFileSync(new URL('../../src/components/blocchi/cambio-vista.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sorgente, /fetch\(|XMLHttpRequest|sendBeacon/u);
});

test('UIG-1.6 the menu words exist in English and Italian', async () => {
  for (const lingua of ['en', 'it']) {
    impostaLingua(lingua);
    for (const k of ['blocchi.actions.barsTable', 'blocchi.view.category', 'blocchi.view.asBars']) assert.notEqual(t(k), k, `${lingua}: ${k}`);
  }
  impostaLingua('it');
});
