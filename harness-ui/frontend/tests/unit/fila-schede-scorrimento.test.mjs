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

/*
 * 12/11/2026 (giudice v1608, revisore C dell'Assistente) — la fila sfuma per 24 px dove continua, e la scheda scelta non deve finire
 * sotto la sfumatura: col `margine` la si porta in vista lasciando libera la fascia (DeepSeek `TabPanel.tsx:183-190`, «with the fade
 * band (24px) cleared»). Ai due capi la fila non sfuma, e il margine si mangia contro lo zero e il massimo.
 */
test('FILA-SCHEDE-04: col margine la scheda scelta resta fuori dalla fascia che sfuma', () => {
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 0, inizio: 380, fine: 460, margine: 24 }), 184, 'esce a destra: la sua fine a 24 px dal bordo');
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 150, inizio: 140, fine: 220, margine: 24 }), 116, 'esce a sinistra: il suo inizio a 24 px dal bordo');
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 100, inizio: 110, fine: 180, margine: 24 }), 86, 'in vista ma sotto la fascia di sinistra: si sposta');
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 100, inizio: 320, fine: 390, margine: 24 }), 114, 'in vista ma sotto la fascia di destra: si sposta');
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 100, inizio: 140, fine: 200, margine: 24 }), 100, 'in vista e fuori dalle fasce: non si muove');
});

test('FILA-SCHEDE-05: ai capi il margine si ferma a zero e al massimo; più largo della metà libera non sposta la scheda fuori', () => {
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 100, inizio: 6, fine: 62, margine: 24 }), 0, 'la prima scheda: la fila torna all inizio');
  assert.equal(scorrimentoFilaSchede({ ...fila, scorrimento: 0, inizio: 440, fine: 495, margine: 24 }), 200, 'l ultima scheda: la fila va fino in fondo');
  assert.equal(scorrimentoFilaSchede({ larghezza: 100, contenuto: 500, scorrimento: 0, inizio: 200, fine: 290, margine: 24 }), 195, 'una scheda di 90 su 100: il margine scende a 5, la scheda resta intera');
  assert.equal(scorrimentoFilaSchede({ larghezza: 100, contenuto: 500, scorrimento: 0, inizio: 200, fine: 320, margine: 24 }), 220, 'una scheda di 120 su 100 (giro del revisore, R13): il margine si ferma a zero, mai negativo; se ne vede la fine, come Hermes');
});
