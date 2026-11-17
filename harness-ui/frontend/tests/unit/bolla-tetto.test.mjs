/*
 * Giro 6 della bolla (owner 14/11 15:46; ROSSO della prova dal vivo, punto 3): la bolla prende l'altezza dal contenuto, dentro il bordo dello schermo.
 * Qui il tetto (`tettoDellaBolla`) e le regole che lo rendono possibile: la scena nel flusso (la misura preferita del guscio conta solo il flusso) e il tetto
 * scritto dalla pagina. La prova a schermo è `tests/browser/bolla-cresce.spec.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TETTO_BOLLA, tettoDellaBolla } from '../../src/components/computer-use/bolla.js';

const css = readFileSync(new URL('../../src/styles/bolla.css', import.meta.url), 'utf8');
const ingresso = readFileSync(new URL('../../src/bolla.js', import.meta.url), 'utf8');
/** il corpo della regola col selettore esatto, o null */
const regola = (selettore) => {
  const i = css.indexOf(`${selettore}{`);
  if (i < 0) return null;
  return css.slice(i + selettore.length + 1, css.indexOf('}', i));
};

test('BTET-01 il tetto: lo schermo meno 24 sopra e 24 sotto', () => {
  assert.equal(tettoDellaBolla(600), 552);
  assert.equal(tettoDellaBolla(420), 372);
  assert.equal(tettoDellaBolla(500.7), 452);
});

test('BTET-01b ai bordi: mai oltre 640, mai sotto 160', () => {
  assert.deepEqual({ ...TETTO_BOLLA }, { massimo: 640, margine: 24, minimo: 160 });
  assert.equal(tettoDellaBolla(1040), 640);
  assert.equal(tettoDellaBolla(688), 640);
  assert.equal(tettoDellaBolla(687), 639);
  assert.equal(tettoDellaBolla(208), 160);
  assert.equal(tettoDellaBolla(207), 160);
  assert.equal(tettoDellaBolla(100), 160);
});

test('BTET-02 senza misura vale il massimo: niente, zero, negativo, non numero, infinito', () => {
  for (const v of [undefined, null, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, '700']) assert.equal(tettoDellaBolla(v), 640, String(v));
});

test('BTET-03 la scena della bolla sta nel flusso, larga quanto pillola o carta, alta fino al tetto', () => {
  const scena = regola('.scena.cu-bolla');
  assert.ok(scena, 'manca la regola della scena della bolla');
  assert.match(scena, /position:relative/u);
  assert.match(scena, /inset:auto/u);
  assert.match(scena, /width:464px/u);
  assert.match(scena, /max-height:var\(--bolla-tetto,640px\)/u);
  assert.doesNotMatch(scena, /(^|;)height:/u, 'un altezza fissa taglia la carta');
  assert.match(regola('.scena.cu-bolla:has(>.cu-bolla__carta:not(:empty))') ?? '', /width:584px/u);
  assert.match(regola('html,body') ?? '', /height:auto/u, 'html e body alti quanto la bolla, non quanto la finestra (`styles.css` li mette al 100%)');
  /* la copia del telefono sotto resta fissa: la regola della bolla deve venire prima e vincere per specificità, non per ordine */
  assert.ok(css.indexOf('.scena.cu-bolla{') < css.indexOf('.scena {'), 'la regola della bolla sta sopra la copia del telefono');
});

test('BTET-04 la carta si stringe e scorre, la pillola resta intera', () => {
  assert.match(regola('.cu-bolla>.cu-bolla__carta:not(:empty)') ?? '', /min-height:0/u);
  assert.match(regola('.cu-bolla>.cu-bolla__carta:not(:empty)') ?? '', /max-width:560px/u, 'la carta larga 560 come nel bozzetto, la pillola 440');
  assert.match(regola('.cu-bolla>.cu-bolla__carta>:is(.carta,.cs)') ?? '', /max-height:none/u);
  assert.match(regola('.cu-bolla>.cu-bolla__carta>.cs') ?? '', /overflow-y:auto/u);
  assert.match(regola('.cu-bolla>.pillola') ?? '', /flex:none/u);
});

test('BTET-06 la radice si stringe al contenuto: senza, Chromium dà larghezza 0 al guscio e la carta da 584 resta tagliata a 480', () => {
  /* misurato il 15/11 alle 00:02 in Electron 44.3.0 (finestre con le opzioni della bolla): radice `width:auto` ⇒ `preferred-size-changed` con larghezza 0;
     `html{width:max-content}` ⇒ 464 la pillola, 584 con la carta (docs Electron web-contents.md: «the minimum size needed to contain the layout») */
  assert.match(regola('html') ?? '', /width:max-content/u, 'la radice della bolla larga quanto il contenuto');
  assert.ok(css.indexOf('html{') > -1 && css.indexOf('html{') < css.indexOf('.scena.cu-bolla{'), 'la regola della radice sta con le altre regole della pagina della bolla');
});

test('BTET-05 la pagina scrive il tetto dallo schermo all avvio e a ogni cambio di misura', () => {
  assert.match(ingresso, /setProperty\('--bolla-tetto', `\$\{tettoDellaBolla\(window\.screen\?\.availHeight\)\}px`\)/u);
  assert.match(ingresso, /addEventListener\('resize', tetto\)/u);
  assert.match(ingresso, /^tetto\(\);$/mu);
});
