import test from 'node:test';
import assert from 'node:assert/strict';
import { ATTRIBUTO, bersaglioDi, latoPreferito, migraTitle } from '../../src/components/tooltip.js';

/* Un elemento finto: solo quello che il componente tocca davvero. */
function elemento({ tag = 'button', title = null, tip = null, padre = null } = {}) {
  const attributi = new Map();
  if (title !== null) attributi.set('title', title);
  if (tip !== null) attributi.set(ATTRIBUTO, tip);
  return {
    nodeType: 1, tagName: tag.toUpperCase(), parentElement: padre, ownerSVGElement: null,
    getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
    setAttribute: (k, v) => attributi.set(k, v),
    removeAttribute: (k) => attributi.delete(k),
    hasAttribute: (k) => attributi.has(k),
    attributi,
  };
}

test('migraTitle: il title nativo diventa nostro, e sparisce davvero', () => {
  const b = elemento({ title: 'Torna dove sta scrivendo' });
  assert.equal(migraTitle(b), 'Torna dove sta scrivendo');
  assert.equal(b.getAttribute(ATTRIBUTO), 'Torna dove sta scrivendo');
  // ⛔ se il title restasse, si vedrebbero DUE riquadri: il nostro e quello del sistema
  assert.equal(b.hasAttribute('title'), false);
});

test('migraTitle: chi ce l’ha già non viene toccato, e il vuoto non diventa un riquadro vuoto', () => {
  const gia = elemento({ tip: 'Detto una volta sola' });
  assert.equal(migraTitle(gia), 'Detto una volta sola');
  assert.equal(migraTitle(elemento({ title: '   ' })), '', 'uno spazio non è un suggerimento');
  assert.equal(migraTitle(elemento({})), '');
  assert.equal(migraTitle(null), '');
});

test('⛔ AL CONTRARIO — su iframe e SVG il title NON si tocca: lì è il nome, non un suggerimento', () => {
  const frame = elemento({ tag: 'iframe', title: 'Anteprima della pagina' });
  assert.equal(migraTitle(frame), '');
  assert.equal(frame.hasAttribute('title'), true, 'portarlo via toglierebbe il nome accessibile');
  const dentroSvg = elemento({ tag: 'path', title: 'Grafico' });
  dentroSvg.ownerSVGElement = {};
  assert.equal(migraTitle(dentroSvg), '');
  assert.equal(dentroSvg.hasAttribute('title'), true);
});

test('bersaglioDi: risale ai genitori — si passa sopra l’icona, il suggerimento è del bottone', () => {
  const bottone = elemento({ title: 'Ferma il giro' });
  const icona = elemento({ tag: 'svg', padre: bottone });
  assert.equal(bersaglioDi(icona), bottone);
  assert.equal(bersaglioDi(elemento({ tag: 'div' })), null, 'chi non ha niente da dire non è un bersaglio');
  assert.equal(bersaglioDi(null), null);
});

test('latoPreferito: non si apre dove non c’è spazio', () => {
  const finestra = { width: 1440, height: 900 };
  // in mezzo alla pagina: sopra, che è la posizione naturale
  assert.equal(latoPreferito({ top: 400, bottom: 430, left: 700, right: 760 }, finestra), 'block-start');
  // ⛔ sulla barra in alto non può aprirsi verso l'alto: uscirebbe dallo schermo
  assert.equal(latoPreferito({ top: 12, bottom: 40, left: 700, right: 760 }, finestra), 'block-end');
  // in fondo, il contrario
  assert.equal(latoPreferito({ top: 860, bottom: 890, left: 700, right: 760 }, finestra), 'block-start');
  // schiacciato fra i due bordi: si va di lato, dalla parte con più spazio
  assert.equal(latoPreferito({ top: 20, bottom: 880, left: 40, right: 100 }, finestra), 'inline-end');
});

/*
 * ⛔ 07/09/2026, visto negli screenshot della prova del curioso: il fumetto di una scheda del Browser
 *   si apriva sopra e copriva la barra delle viste (Chat / Terminale / Review / Browser). La scelta
 *   automatica preferisce «sopra» quando c'è spazio — e lo spazio c'era, ma occupato.
 */
test('IL LATO SI PUÒ CHIEDERE: chi ha qualcosa sopra di sé lo dice, e il fumetto ubbidisce', () => {
  // la funzione pura resta com'è: la scelta automatica non cambia per nessun altro
  assert.equal(latoPreferito({ top: 200, bottom: 240 }, { width: 1600, height: 1000 }), 'block-start');
  assert.equal(latoPreferito({ top: 10, bottom: 40 }, { width: 1600, height: 1000 }), 'block-end');
});
