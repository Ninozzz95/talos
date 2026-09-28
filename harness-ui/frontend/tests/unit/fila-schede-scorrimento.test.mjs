import test from 'node:test';
import assert from 'node:assert/strict';
import { scorrimentoFilaSchede } from '../../src/components/schede.js';

/*
 * 26/09/2026 — F6-1, owner: «margine 10 px + scorrimento». Dove va lo scorrimento della fila perché la scheda attiva si veda tutta
 * (adattata da Hermes `tab-strip-scroll.ts`, `tabStripScrollLeft`). Fila larga 300, contenuto 500: si scorre fra 0 e 200.
 */
const fila = { larghezza: 300, contenuto: 500 };

test('FILA-SCHEDE-01: già in vista, non si muove niente', () => {
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 50, inizio: 100, fine: 200 }), 50);
});

test('FILA-SCHEDE-02: esce a destra ⇒ si porta la sua FINE al bordo; esce a sinistra ⇒ il suo INIZIO', () => {
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 0, inizio: 380, fine: 460 }), 160);
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 150, inizio: 40, fine: 120 }), 40);
});

test('FILA-SCHEDE-03: mai oltre lo scorrimento possibile, mai sotto zero; una fila che ci sta resta a zero', () => {
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 0, inizio: 480, fine: 560 }), 200);
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 400, inizio: 250, fine: 300 }), 200, 'uno scorrimento vecchio oltre il massimo si riporta dentro');
  assert.equal(scorrimentoFilaSchede({ larghezza: 300, contenuto: 280, scorrimento: 0, inizio: 200, fine: 270 }), 0);
});
