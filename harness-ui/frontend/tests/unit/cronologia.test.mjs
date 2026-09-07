import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { larghezzaLente, anteprima, testoFumetto, LENTE } from '../../src/components/cronologia.js';

/*
 * ⛔ 07/09/2026, owner (screenshot): passando il mouse sulla barra dei giri comparivano DUE riquadri
 *   sovrapposti con lo stesso testo. Riprodotto sul 4174 (`cronologia-hover.png`): uno era il nostro
 *   fumetto, l'altro il tooltip NATIVO che Chrome disegna da `title` — che appare dopo circa un
 *   secondo, ignora il tema, e si posiziona dove vuole lui. In questo stesso progetto esiste già
 *   `tooltip.js` con `migraTitle()` proprio per non avere due riquadri: la barra lo scavalcava
 *   riscrivendo `b.title` a ogni aggiornamento.
 * ⇒ La guardia sta qui, non nella memoria: se qualcuno rimette un `title` su una voce, questo test
 *   diventa rosso. E ha la sua metà AL CONTRARIO, perché un cancello che non ha mai respinto niente
 *   non è un cancello.
 */
const SORGENTE = readFileSync(new URL('../../src/components/cronologia.js', import.meta.url), 'utf8');
const assegnaTitle = (codice) => /\.title\s*=/.test(codice);

test('CRONOLOGIA-FUMETTO-UNICO: nessuna voce riceve il `title` nativo', () => {
  assert.equal(assegnaTitle(SORGENTE), false, 'un `title` qui rimette il doppio riquadro del 07/9');
  assert.match(SORGENTE, /removeAttribute\('title'\)/, 'e il title di un DOM già disegnato va tolto, non solo evitato');
});

test('CRONOLOGIA-FUMETTO-UNICO, al contrario: la guardia MORDE se il title torna', () => {
  assert.equal(assegnaTitle("b.title = testoFumetto(v);"), true);
  assert.equal(assegnaTitle("b.setAttribute('aria-label', 'Vai al giro 3');"), false);
});

test('LENTE: 26 sotto il cursore, poi 20·14·10·6, e il fondo per chi è lontano', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((d) => larghezzaLente(d, 0)), [26, 20, 14, 10, 6, 6]);
  assert.equal(larghezzaLente(5, 7), LENTE[2]);
  assert.equal(larghezzaLente(NaN, 0), 6, 'senza un indice valido si sta al minimo, non si esplode');
});

test('ANTEPRIMA: una riga sola, tagliata, e il vuoto lo dice', () => {
  assert.equal(anteprima('  due   righe\ndi testo '), 'due righe di testo');
  assert.equal(anteprima(''), 'Messaggio senza testo');
  assert.equal(anteprima('x'.repeat(200)).length, 140);
  assert.match(anteprima('x'.repeat(200)), /…$/);
});

test('FUMETTO: il capo dice giro, esito e attrezzi solo quando ci sono', () => {
  assert.equal(testoFumetto({ numero: 5, tono: 'danger', attrezzi: 3, testo: 'ciao' }), 'Giro 5 · errore · 3 attrezzi\nciao');
  assert.equal(testoFumetto({ testo: 'senza numero' }), 'senza numero');
  assert.equal(testoFumetto({ numero: 2, attrezzi: 1, testo: 'uno solo' }), 'Giro 2\nuno solo', 'un attrezzo solo non merita una riga');
  assert.equal(testoFumetto(null), '');
});
