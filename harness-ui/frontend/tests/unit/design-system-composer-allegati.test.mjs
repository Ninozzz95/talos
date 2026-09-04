import assert from 'node:assert/strict';
import test from 'node:test';

import { createComposer } from '../../src/design-system/composer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

/*
 * Le righe dell'owner che il compositore si porta dietro:
 *  - O-05: immagini al modello dal desktop, con le TRE vie e il rifiuto onesto
 *  - O-08: DUE pulsanti separati, «Capability» e il «+» che allega e basta
 *  - B9:   ogni allegato dichiara quanto contesto costa, come stima
 */
const doc = () => fakeDocument();
const compositore = (extra = {}) => createComposer({
  document: doc(),
  label: 'Messaggio',
  sendLabel: 'Invia',
  stopLabel: 'Ferma',
  attachLabel: 'Allega file o immagini',
  capabilityLabel: 'Capability',
  ...extra,
});
/** Un file come lo passa il browser: nome e tipo, niente di più. */
const file = (name, type) => ({ name, type });

test('ALLEGATI-01 ⭐ O-08: due pulsanti separati, e il «+» NON apre l\'inventario', () => {
  const aperture = [];
  const c = compositore({ onCapability: () => aperture.push(1) });
  trova(c.element, (e) => e.textContent === 'Capability').lancia('click', {});
  assert.equal(aperture.length, 1);
  const piu = trova(c.element, (e) => e.className === 'talos-composer__attach');
  assert.equal(piu.getAttribute('aria-label'), 'Allega file o immagini');
  piu.lancia('click', {});
  assert.equal(aperture.length, 1, 'il «+» non deve aprire Capability');
});

test('ALLEGATI-02 ⭐ O-05: le TRE vie portano tutte allo stesso posto, e dicono da dove vengono', () => {
  const arrivi = [];
  const c = compositore({ onAttach: (files, origine) => arrivi.push([files.map((f) => f.name), origine]) });
  const guscio = trova(c.element, (e) => e.className === 'talos-composer');
  const campo = trova(c.element, (e) => e.className === 'talos-composer__input');
  const selettore = trova(c.element, (e) => e.type === 'file');

  campo.lancia('paste', { clipboardData: { files: [file('schermata.png', 'image/png')] }, preventDefault() {} });
  guscio.lancia('drop', { dataTransfer: { files: [file('foto.jpg', 'image/jpeg')] }, preventDefault() {} });
  selettore.lancia('change', { target: { files: [file('note.md', 'text/markdown')] } });

  assert.deepEqual(arrivi, [
    [['schermata.png'], 'paste'],
    [['foto.jpg'], 'drop'],
    [['note.md'], 'picker'],
  ]);
});

test('ALLEGATI-03 ⭐ il selettore di file è un input VERO: è l\'alternativa da tastiera al trascinamento', () => {
  const c = compositore({ accept: 'image/*,.md' });
  const selettore = trova(c.element, (e) => e.type === 'file');
  assert.equal(selettore.tagName, 'INPUT');
  assert.equal(selettore.multiple, true);
  assert.equal(selettore.className, 'sr-only');
  assert.equal(selettore.getAttribute('accept'), 'image/*,.md');
  // ⛔ L'input NON porta lo stesso nome del pulsante: sarebbero DUE controlli
  // identici per chi naviga per nome — la prova nel browser l'ha rilevato come
  // «strict mode violation: 2 elements». È il pulsante l'unico comando nominato,
  // e resta raggiungibile con Tab: è quella l'alternativa al trascinamento.
  assert.equal(selettore.getAttribute('aria-label'), null);
  assert.equal(selettore.getAttribute('aria-hidden'), 'true');
  assert.equal(selettore.tabIndex, -1);
});

test('ALLEGATI-04 ⭐ un\'immagine verso un modello SENZA visione si rifiuta e si DICE', () => {
  const rifiuti = [];
  const arrivi = [];
  const c = compositore({
    visionSupported: false,
    onRefused: (motivo) => rifiuti.push(motivo),
    onAttach: (files) => arrivi.push(files.map((f) => f.name)),
  });
  trova(c.element, (e) => e.className === 'talos-composer')
    .lancia('drop', { dataTransfer: { files: [file('foto.png', 'image/png')] }, preventDefault() {} });
  assert.equal(rifiuti.length, 1);
  assert.equal(rifiuti[0].reason, 'no-vision');
  assert.equal(rifiuti[0].source, 'drop');
  assert.deepEqual(arrivi, [], 'niente deve passare in silenzio');
});

test('ALLEGATI-05 senza visione i file NON immagine passano lo stesso', () => {
  const arrivi = [];
  const rifiuti = [];
  const c = compositore({
    visionSupported: false,
    onAttach: (f) => arrivi.push(f.map((x) => x.name)),
    onRefused: (m) => rifiuti.push(m),
  });
  trova(c.element, (e) => e.className === 'talos-composer')
    .lancia('drop', { dataTransfer: { files: [file('foto.png', 'image/png'), file('note.md', 'text/markdown')] }, preventDefault() {} });
  assert.deepEqual(arrivi, [['note.md']]);
  assert.equal(rifiuti.length, 1);
});

test('ALLEGATI-06 il trascinamento sopra si vede, e passando oltre smette', () => {
  const c = compositore();
  const guscio = trova(c.element, (e) => e.className === 'talos-composer');
  guscio.lancia('dragover', { preventDefault() {} });
  assert.equal(guscio.dataset.trascinaSopra, 'si');
  guscio.lancia('dragleave', {});
  assert.equal(guscio.dataset.trascinaSopra, undefined);
});

test('ALLEGATI-07 ⭐ B9: ogni allegato dichiara quanto contesto costa, come STIMA', () => {
  const c = compositore({ attachments: [{ id: 'a1', name: 'schermata.png', tokens: 1240 }] });
  const costo = trova(c.element, (e) => String(e.className).includes('talos-attachment__cost'));
  assert.match(costo.className, /talos-measure--estimate/);
  assert.equal(testoDi(costo), 'stima: 1240 token');
});

test('ALLEGATI-08 un allegato si può togliere, e il pulsante dice QUALE', () => {
  const tolti = [];
  const c = compositore({ attachments: [{ id: 'a1', name: 'schermata.png' }], onRemoveAttachment: (a) => tolti.push(a.id) });
  const togli = trova(c.element, (e) => e.textContent === 'Togli');
  assert.equal(togli.getAttribute('aria-label'), 'Togli schermata.png');
  togli.lancia('click', {});
  assert.deepEqual(tolti, ['a1']);
});

test('ALLEGATI-09 senza allegati la lista non lascia un buco', () => {
  const c = compositore();
  assert.equal(trova(c.element, (e) => e.className === 'talos-composer__attachments').hidden, true);
});

test('ALLEGATI-10 AL CONTRARIO dopo destroy incollare e trascinare non fanno più niente', () => {
  const arrivi = [];
  const c = compositore({ onAttach: (f) => arrivi.push(f) });
  const guscio = trova(c.element, (e) => e.className === 'talos-composer');
  const campo = trova(c.element, (e) => e.className === 'talos-composer__input');
  c.destroy();
  campo.lancia('paste', { clipboardData: { files: [file('x.png', 'image/png')] }, preventDefault() {} });
  guscio.lancia('drop', { dataTransfer: { files: [file('y.png', 'image/png')] }, preventDefault() {} });
  assert.deepEqual(arrivi, []);
});

test('ALLEGATI-11 un incollaggio senza file non ruba il testo a chi incolla', () => {
  const arrivi = [];
  let impedito = false;
  const c = compositore({ onAttach: (f) => arrivi.push(f) });
  trova(c.element, (e) => e.className === 'talos-composer__input')
    .lancia('paste', { clipboardData: { files: [] }, preventDefault() { impedito = true; } });
  assert.deepEqual(arrivi, []);
  assert.equal(impedito, false, 'incollare testo deve restare incollare testo');
});
