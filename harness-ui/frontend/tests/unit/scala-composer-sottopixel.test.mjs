import test from 'node:test';
import assert from 'node:assert/strict';
import { etichettaTagliata } from '../../src/components/scala-composer.js';

/*
 * 29/10/2026 — un taglio di una FRAZIONE di pixel fa comparire i puntini (`text-overflow: ellipsis`) ma non si vede da `scrollWidth` e
 * `clientWidth`, che sono interi (Mozilla bug 1250824). Il browser della prova D2 (d) dà un taglio intero (61 su 60); qui l'elemento
 * ha misure esatte, così si prova il ramo al sottopixel da solo: interi uguali, testo più largo del riquadro di un terzo di pixel.
 */
function etichetta({ scroll, client, riquadro, testo, padding = 0, position = 'static' }) {
  const el = {
    isConnected: true,
    scrollWidth: scroll,
    clientWidth: client,
    getClientRects: () => [{}],
    getBoundingClientRect: () => ({ width: riquadro + 2 * padding }),
    ownerDocument: { createRange: () => ({ selectNodeContents() {}, getBoundingClientRect: () => ({ width: testo }) }) },
  };
  const win = { getComputedStyle: () => ({ position, paddingLeft: `${padding}px`, paddingRight: `${padding}px`, borderLeftWidth: '0px', borderRightWidth: '0px' }) };
  return [el, win];
}

test('SCALA-SOTTOPIXEL-01 — interi uguali ma testo più largo di un terzo di pixel: è tagliata (i puntini ci sono)', () => {
  assert.equal(etichettaTagliata(...etichetta({ scroll: 60, client: 60, riquadro: 60.2, testo: 60.53 })), true);
});

test('SCALA-SOTTOPIXEL-02 — AL CONTRARIO: testo che entra al centesimo, e il padding non conta come spazio del testo', () => {
  assert.equal(etichettaTagliata(...etichetta({ scroll: 60, client: 60, riquadro: 60.2, testo: 60.2 })), false);
  assert.equal(etichettaTagliata(...etichetta({ scroll: 64, client: 64, riquadro: 60, testo: 60.5, padding: 2 })), true, 'il padding non è spazio per il testo');
});

test('SCALA-SOTTOPIXEL-03 — un taglio intero resta tagliato, e un\'etichetta ceduta (assoluta) non lo è mai', () => {
  assert.equal(etichettaTagliata(...etichetta({ scroll: 61, client: 60, riquadro: 60, testo: 61 })), true);
  assert.equal(etichettaTagliata(...etichetta({ scroll: 61, client: 1, riquadro: 1, testo: 61, position: 'absolute' })), false);
});
