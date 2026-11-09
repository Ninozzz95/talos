import test from 'node:test';
import assert from 'node:assert/strict';
import { adattaScala, etichettaTagliata, STADIO_MASSIMO } from '../../src/components/scala-composer.js';

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

/* Frontend, 01/11/2026: lo spazio del fulmine lo paga il nome del modello. La barra finta non ricalcola: la scala si ferma a 0 o arriva in cima */
function barra({ tagliNome = 0, tagliPermesso = 0, fulmine = 'acceso', larghezzaFulmine = 13, gap = 5 } = {}) {
  const [nome] = etichetta({ scroll: 60 + tagliNome, client: 60, riquadro: 60, testo: 60 + tagliNome });
  const [permesso] = etichetta({ scroll: 90 + tagliPermesso, client: 90, riquadro: 90, testo: 90 + tagliPermesso });
  const segno = fulmine === 'assente' ? null : { hidden: fulmine === 'nascosto', parentElement: {}, getBoundingClientRect: () => ({ width: larghezzaFulmine }) };
  const b = {
    dataset: {},
    querySelector: (sel) => {
      if (sel === '.talos-chip__veloce') return segno;
      if (sel.startsWith('[data-open-sheet="model"]')) return nome;
      if (sel.startsWith('[data-open-sheet="permissions"]')) return permesso;
      return null;
    },
  };
  const win = { getComputedStyle: () => ({ position: 'static', paddingLeft: '0px', paddingRight: '0px', borderLeftWidth: '0px', borderRightWidth: '0px', columnGap: `${gap}px` }) };
  return [b, win];
}

test('SCALA-FULMINE-01 — da accesa il nome può perdere la larghezza del fulmine e del suo spazio senza far salire la scala', () => {
  assert.equal(adattaScala(...barra({ tagliNome: 10 })), 0);
  assert.equal(adattaScala(...barra({ tagliNome: 18 })), 0, 'fulmine 13 più spazio 5: al limite esatto');
});

test('SCALA-FULMINE-02 — AL CONTRARIO: oltre quella larghezza si cede come sempre', () => {
  assert.equal(adattaScala(...barra({ tagliNome: 18.5 })), STADIO_MASSIMO);
});

test('SCALA-FULMINE-03 — AL CONTRARIO: da spenta, o senza fulmine, il nome non ha nessuno sconto', () => {
  assert.equal(adattaScala(...barra({ tagliNome: 1, fulmine: 'nascosto' })), STADIO_MASSIMO);
  assert.equal(adattaScala(...barra({ tagliNome: 1, fulmine: 'assente' })), STADIO_MASSIMO);
});

test('SCALA-FULMINE-04 — AL CONTRARIO: lo sconto è del solo nome del modello, il permesso tagliato fa salire la scala', () => {
  assert.equal(adattaScala(...barra({ tagliPermesso: 1 })), STADIO_MASSIMO);
});
