/*
 * ⛔⛔ B1 (07/10/2026, misurato sul 4174 col profilo CPU) — `calm-controls` lavorava per tutta l'app a ogni evento del
 *   replay. Il suo ambito è ristretto (Impostazioni, Theme Studio, `[data-calm-controls]`, `main.js`), ma il ramo
 *   `childList` di `relevant()` non guardava l'ambito: un nodo aggiunto FUORI (chat, Review, ispettore) che contenesse
 *   una checkbox, una select o uno slider faceva ripartire `refresh()` — che rilegge e rinomina TUTTI i controlli (con
 *   `cloneNode` delle etichette) — anche se `eligible()` non ne avrebbe mai migliorato uno. 6,4 s su 25,6 s all'apertura
 *   di una sessione da 1286 giri.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCalmControls } from '../../src/components/calm-controls.js';

function documentoFinto() {
  let osservatore = null;
  const microtask = [];
  const win = {
    AbortController,
    MutationObserver: class { constructor(cb) { this.cb = cb; osservatore = this; } observe() {} disconnect() {} },
    queueMicrotask: (fn) => microtask.push(fn),
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout,
    addEventListener() {},
  };
  const ambito = { nodeType: 1, closest: (sel) => (sel.includes('[data-calm-controls]') ? ambito : null), matches: () => false, querySelector: () => null, querySelectorAll: () => [] };
  let letture = 0;
  const doc = {
    defaultView: win, documentElement: null, body: null,
    querySelectorAll: () => { letture += 1; return [ambito]; },
    addEventListener() {}, matches: () => false,
  };
  doc.documentElement = doc;
  const conCheckbox = { nodeType: 1, matches: (sel) => sel.includes('input[type="checkbox"]') && false, querySelector: (sel) => (sel.includes('input[type="checkbox"]') ? {} : null) };
  const fuori = { nodeType: 1, closest: () => null, matches: () => false };
  return { doc, ambito, fuori, conCheckbox, get osservatore() { return osservatore; }, get letture() { return letture; }, svuota() { while (microtask.length) microtask.shift()(); } };
}

test('B1-CALM-01: un nodo con una checkbox aggiunto FUORI dall ambito non fa ripartire refresh', () => {
  const f = documentoFinto();
  const api = mountCalmControls(f.doc, { scope: '#schermoImpostazioni, .td-theme-studio, [data-calm-controls]' });
  const prima = f.letture;
  f.osservatore.cb([{ type: 'childList', target: f.fuori, addedNodes: [f.conCheckbox], removedNodes: [] }]);
  f.svuota();
  assert.equal(f.letture, prima, 'refresh non deve rileggere i controlli per una mutazione fuori ambito');
  api.dispose();
});

test('B1-CALM-02: contropelo — lo stesso nodo aggiunto DENTRO l ambito fa ripartire refresh', () => {
  const f = documentoFinto();
  const api = mountCalmControls(f.doc, { scope: '#schermoImpostazioni, .td-theme-studio, [data-calm-controls]' });
  const prima = f.letture;
  f.osservatore.cb([{ type: 'childList', target: f.ambito, addedNodes: [f.conCheckbox], removedNodes: [] }]);
  f.svuota();
  assert.equal(f.letture, prima + 1, 'una sorgente nuova nell ambito si migliora');
  api.dispose();
});

test('B1-CALM-03: contropelo — un nodo fuori che PORTA dentro un ambito intero (una schermata montata) fa ripartire refresh', () => {
  const f = documentoFinto();
  const api = mountCalmControls(f.doc, { scope: '#schermoImpostazioni, .td-theme-studio, [data-calm-controls]' });
  const prima = f.letture;
  const schermata = { nodeType: 1, matches: (sel) => sel.includes('#schermoImpostazioni'), querySelector: () => ({}) };
  f.osservatore.cb([{ type: 'childList', target: f.fuori, addedNodes: [schermata], removedNodes: [] }]);
  f.svuota();
  assert.equal(f.letture, prima + 1);
  api.dispose();
});
