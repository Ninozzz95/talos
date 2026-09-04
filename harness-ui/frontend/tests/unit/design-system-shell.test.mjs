import assert from 'node:assert/strict';
import test from 'node:test';

import { createComposer } from '../../src/design-system/composer.js';
import { createResizablePane } from '../../src/design-system/resizable-pane.js';
import { fakeDocument, trova } from './fake-dom.mjs';

const doc = () => fakeDocument();

/** Una radice finta che registra le variabili di tema scritte. */
function radiceFinta() {
  const scritte = new Map();
  return { scritte, style: { setProperty: (nome, valore) => scritte.set(nome, valore) } };
}
/** Una finestra finta che raccoglie gli ascoltatori globali. */
function finestraFinta() {
  const ascoltatori = new Map();
  return {
    ascoltatori,
    addEventListener(tipo, fn) { ascoltatori.set(tipo, [...(ascoltatori.get(tipo) || []), fn]); },
    removeEventListener(tipo, fn) { ascoltatori.set(tipo, (ascoltatori.get(tipo) || []).filter((f) => f !== fn)); },
    lancia(tipo, evento) { for (const fn of [...(ascoltatori.get(tipo) || [])]) fn(evento); },
    quanti(tipo) { return (ascoltatori.get(tipo) || []).length; },
  };
}
const maniglia = (extra = {}) => createResizablePane({
  document: doc(),
  root: radiceFinta(),
  token: '--talos-sidebar-w',
  controls: 'sidebar-principale',
  label: 'Ridimensiona la barra laterale',
  min: 220,
  max: 420,
  base: 276,
  value: 276,
  ...extra,
});

/* ---------------- ResizablePane ---------------- */

test('SPLIT-01 ⭐ è un separatore focalizzabile che dichiara COSA muove', () => {
  const m = maniglia();
  assert.equal(m.element.getAttribute('role'), 'separator');
  assert.equal(m.element.getAttribute('aria-orientation'), 'vertical');
  assert.equal(m.element.tabIndex, 0);
  assert.equal(m.element.getAttribute('aria-controls'), 'sidebar-principale');
});

test('SPLIT-02 dichiara dove sta e fin dove può andare', () => {
  const m = maniglia();
  assert.equal(m.element.getAttribute('aria-valuenow'), '276');
  assert.equal(m.element.getAttribute('aria-valuemin'), '220');
  assert.equal(m.element.getAttribute('aria-valuemax'), '420');
});

test('SPLIT-03 il nome viene dall\'etichetta VISIBILE quando c\'è', () => {
  const conTesto = maniglia({ label: undefined, labelledBy: 'titolo-sidebar' });
  assert.equal(conTesto.element.getAttribute('aria-labelledby'), 'titolo-sidebar');
  assert.equal(conTesto.element.getAttribute('aria-label'), null);
});

test('SPLIT-04 la larghezza finisce in un TOKEN, non in uno stile in linea', () => {
  const radice = radiceFinta();
  createResizablePane({
    document: doc(), root: radice, token: '--talos-inspector-w', controls: 'colonna',
    label: 'Ridimensiona la colonna', min: 280, max: 520, value: 340,
  });
  assert.equal(radice.scritte.get('--talos-inspector-w'), '340px');
});

test('SPLIT-05 ⭐ il trascinamento ascolta la FINESTRA, e smette quando finisce', () => {
  const finestra = finestraFinta();
  const radice = radiceFinta();
  const m = createResizablePane({
    document: doc(), root: radice, window: finestra, token: '--talos-sidebar-w',
    controls: 'sidebar', label: 'Ridimensiona', min: 220, max: 420, value: 276,
  });
  m.element.lancia('pointerdown', { clientX: 100, preventDefault() {} });
  assert.equal(finestra.quanti('pointermove'), 1);
  assert.equal(m.element.dataset.trascina, 'si');
  finestra.lancia('pointermove', { clientX: 160 });
  assert.equal(radice.scritte.get('--talos-sidebar-w'), '336px');
  finestra.lancia('pointerup', {});
  assert.equal(finestra.quanti('pointermove'), 0);
  assert.equal(m.element.dataset.trascina, undefined);
});

test('SPLIT-06 i limiti tengono, in tutte e due le direzioni', () => {
  const finestra = finestraFinta();
  const radice = radiceFinta();
  const m = createResizablePane({
    document: doc(), root: radice, window: finestra, token: '--talos-sidebar-w',
    controls: 'sidebar', label: 'Ridimensiona', min: 220, max: 420, value: 276,
  });
  m.element.lancia('pointerdown', { clientX: 0, preventDefault() {} });
  finestra.lancia('pointermove', { clientX: 5000 });
  assert.equal(radice.scritte.get('--talos-sidebar-w'), '420px');
  finestra.lancia('pointermove', { clientX: -5000 });
  assert.equal(radice.scritte.get('--talos-sidebar-w'), '220px');
});

test('SPLIT-07 la tastiera muove, Home torna al valore normale, e si annuncia', () => {
  const radice = radiceFinta();
  const detti = [];
  const m = createResizablePane({
    document: doc(), root: radice, token: '--talos-sidebar-w', controls: 'sidebar',
    label: 'Barra laterale', min: 220, max: 420, base: 276, value: 276, announce: (x) => detti.push(x),
  });
  m.element.lancia('keydown', { key: 'ArrowRight', preventDefault() {} });
  assert.equal(radice.scritte.get('--talos-sidebar-w'), '284px');
  m.element.lancia('keydown', { key: 'ArrowRight', shiftKey: true, preventDefault() {} });
  assert.equal(radice.scritte.get('--talos-sidebar-w'), '316px');
  m.element.lancia('keydown', { key: 'Home', preventDefault() {} });
  assert.equal(radice.scritte.get('--talos-sidebar-w'), '276px');
  assert.deepEqual(detti, ['Barra laterale: 284 pixel', 'Barra laterale: 316 pixel', 'Barra laterale: 276 pixel']);
});

test('SPLIT-08 il lato di destra si muove al CONTRARIO', () => {
  const finestra = finestraFinta();
  const radice = radiceFinta();
  const m = createResizablePane({
    document: doc(), root: radice, window: finestra, token: '--talos-inspector-w', side: 'end',
    controls: 'colonna', label: 'Colonna', min: 280, max: 520, value: 340,
  });
  m.element.lancia('pointerdown', { clientX: 1000, preventDefault() {} });
  finestra.lancia('pointermove', { clientX: 960 });
  assert.equal(radice.scritte.get('--talos-inspector-w'), '380px');
});

test('SPLIT-09 AL CONTRARIO senza aria-controls, senza nome, senza token o coi limiti storti non si monta', () => {
  assert.throws(() => maniglia({ controls: undefined }), /richiede aria-controls/);
  assert.throws(() => maniglia({ label: undefined, labelledBy: undefined }), /richiede un nome/);
  assert.throws(() => maniglia({ token: undefined }), /richiede il token/);
  assert.throws(() => maniglia({ min: 400, max: 300 }), /limiti della maniglia incoerenti/);
  assert.throws(() => maniglia({ side: 'sopra' }), /lato della maniglia non valido/);
});

/* ---------------- Composer ---------------- */

const compositore = (extra = {}) => createComposer({
  document: doc(),
  label: 'Messaggio',
  sendLabel: 'Invia',
  stopLabel: 'Ferma',
  attachLabel: 'Allega file o immagini',
  capabilityLabel: 'Capability',
  ...extra,
});

test('COMPOSER-01 ⭐ un solo pulsante, due stati che non possono divergere', () => {
  const c = compositore();
  const bottone = trova(c.element, (e) => String(e.className).startsWith('talos-send'));
  assert.equal(bottone.textContent, 'Invia');
  assert.equal(bottone.getAttribute('aria-label'), 'Invia');
  c.update({ busy: true });
  assert.equal(bottone.textContent, 'Ferma');
  assert.equal(bottone.getAttribute('aria-label'), 'Ferma');
  assert.match(bottone.className, /talos-send--stop/);
});

test('COMPOSER-02 lo stesso pulsante manda o ferma secondo lo stato', () => {
  const mandati = [];
  const fermati = [];
  const c = compositore({ onSend: (t) => mandati.push(t), onStop: () => fermati.push(1) });
  const bottone = trova(c.element, (e) => String(e.className).startsWith('talos-send'));
  bottone.lancia('click', {});
  c.update({ busy: true });
  bottone.lancia('click', {});
  assert.equal(mandati.length, 1);
  assert.equal(fermati.length, 1);
});

test('COMPOSER-03 ⭐ la striscia di stato è un annuncio EDUCATO, e c\'è solo mentre lavora', () => {
  const c = compositore();
  const striscia = trova(c.element, (e) => e.className === 'talos-status-strip');
  assert.equal(striscia.getAttribute('role'), 'status');
  assert.equal(striscia.hidden, true);
  c.update({ busy: true, statusText: 'Comando nel terminale · giro 7' });
  assert.equal(striscia.hidden, false);
  assert.equal(trova(striscia, (e) => e.className === 'talos-status-strip__what').textContent, 'Comando nel terminale · giro 7');
});

test('COMPOSER-04 ⭐ la coda è visibile per costruzione: un messaggio accodato non si perde', () => {
  const c = compositore();
  const coda = trova(c.element, (e) => e.className === 'talos-queue');
  assert.equal(coda.hidden, true);
  c.update({ queue: ['Poi aggiorna il ledger con i numeri veri'] });
  assert.equal(coda.hidden, false);
  assert.equal(trova(coda, (e) => String(e.className).includes('talos-badge')).textContent, '1 in coda');
  assert.equal(trova(coda, (e) => e.className === 'talos-queue__text').textContent, 'Poi aggiorna il ledger con i numeri veri');
});

test('COMPOSER-05 AL CONTRARIO senza i nomi obbligatori non si monta', () => {
  const base = { document: doc(), label: 'Messaggio', sendLabel: 'Invia', stopLabel: 'Ferma', attachLabel: 'Allega', capabilityLabel: 'Capability' };
  assert.throws(() => createComposer({ ...base, label: undefined }), /nome del campo/);
  assert.throws(() => createComposer({ ...base, stopLabel: undefined }), /due stati del pulsante/);
  // ⛔ Il pulsante che allega è l'ALTERNATIVA DA TASTIERA al trascinamento:
  // senza, chi non usa il mouse resta fuori. Per questo non è opzionale.
  assert.throws(() => createComposer({ ...base, attachLabel: undefined }), /alternativa da tastiera/);
  // ⛔ O-08: due pulsanti separati, «Capability» e «+».
  assert.throws(() => createComposer({ ...base, capabilityLabel: undefined }), /due pulsanti separati/);
});

test('COMPOSER-06 le pillole si montano e si sostituiscono senza duplicarsi', () => {
  const d = doc();
  const a = d.createElement('span');
  const b = d.createElement('span');
  const c = createComposer({ document: d, label: 'Messaggio', sendLabel: 'Invia', stopLabel: 'Ferma', attachLabel: 'Allega', capabilityLabel: 'Capability', pills: [a] });
  const zona = trova(c.element, (e) => e.className === 'talos-composer__pills');
  assert.deepEqual(zona.children, [a]);
  c.update({ pills: [a, b] });
  assert.deepEqual(zona.children, [a, b]);
});
