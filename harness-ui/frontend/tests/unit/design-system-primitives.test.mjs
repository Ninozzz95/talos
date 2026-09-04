import assert from 'node:assert/strict';
import test from 'node:test';

import { createField } from '../../src/design-system/field.js';
import { createKbd, applicaScorciatoia, scorciatoiaAria, validaScorciatoia } from '../../src/design-system/kbd.js';
import { createListRow } from '../../src/design-system/list-row.js';
import { createMeasure } from '../../src/design-system/measure.js';
import { createSelect } from '../../src/design-system/select.js';
import { createStatusDot } from '../../src/design-system/status-dot.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

/*
 * Un DOM finto piccolo, come in `dom.test.mjs`: queste primitive toccano
 * classi, attributi e testo, e sono esattamente le cose che si rompono in
 * silenzio. Il comportamento nel browser vero resta coperto dal banco
 * Playwright del design system.
 */
const doc = () => fakeDocument();

/* ---------------- Measure: la provenienza del numero ---------------- */

test('MEASURE-01 un numero misurato non porta la parola «stima»', () => {
  const m = createMeasure({ document: doc(), value: '1.565', unit: 'test' });
  assert.equal(m.element.className, 'talos-mono talos-measure');
  assert.equal(m.element.dataset.provenance, 'measured');
  assert.equal(testoDi(m.element), '1.565 test');
});

test('MEASURE-02 una stima si vede nella FORMA e si sente nel TESTO', () => {
  const m = createMeasure({ document: doc(), value: '7,5k', unit: 'token', provenance: 'estimated' });
  assert.match(m.element.className, /talos-measure--estimate/);
  assert.equal(testoDi(m.element), 'stima: 7,5k token');
  // ⛔ La parola sta in un testo `sr-only`, non in un aria-label: i browser
  // NON traducono gli aria-label, e l'interfaccia e' bilingue (decisione H21).
  assert.equal(m.element.getAttribute('aria-label'), null);
  assert.equal(m.element.children[0].className, 'sr-only');
});

test('MEASURE-03 la parola della stima si traduce col catalogo', () => {
  const m = createMeasure({ document: doc(), value: '0.08', unit: '$', provenance: 'estimated', estimateWord: 'estimated:' });
  assert.equal(testoDi(m.element), 'estimated: 0.08 $');
});

test('MEASURE-04 AL CONTRARIO una provenienza inventata non passa', () => {
  assert.throws(() => createMeasure({ document: doc(), value: '1', provenance: 'circa' }), /provenienza misura non valida/);
});

test('MEASURE-05 passando da misurato a stima cambiano forma e testo', () => {
  const m = createMeasure({ document: doc(), value: '41,2k' });
  m.update({ provenance: 'estimated' });
  assert.match(m.element.className, /talos-measure--estimate/);
  assert.equal(testoDi(m.element), 'stima: 41,2k');
});

/* ---------------- StatusDot ---------------- */

test('DOT-01 senza nome il pallino è decorazione e sparisce ai lettori', () => {
  const d = createStatusDot({ document: doc(), tone: 'success' });
  assert.equal(d.element.getAttribute('aria-hidden'), 'true');
  assert.equal(testoDi(d.element), '');
});

test('DOT-02 col nome lo stato diventa leggibile, come testo vero', () => {
  const d = createStatusDot({ document: doc(), tone: 'live', label: 'in corso' });
  assert.equal(d.element.getAttribute('aria-hidden'), null);
  assert.equal(testoDi(d.element), 'in corso');
  assert.match(d.element.className, /talos-dot--live/);
});

test('DOT-03 AL CONTRARIO tono e dimensione inventati non passano', () => {
  assert.throws(() => createStatusDot({ document: doc(), tone: 'viola' }), /tono pallino non valido/);
  assert.throws(() => createStatusDot({ document: doc(), size: 'xl' }), /dimensione pallino non valida/);
});

/* ---------------- Kbd e la scorciatoia vera ---------------- */

test('KBD-01 i simboli si scrivono, i nomi si pronunciano', () => {
  const k = createKbd({ document: doc(), keys: ['Ctrl', '⇧', 'M'] });
  assert.equal(k.element.textContent, 'Ctrl ⇧ M');
  assert.equal(k.element.getAttribute('aria-label'), 'Control Shift M');
});

test('KBD-02 aria-keyshortcuts va sul CONTROLLO, non sull\'etichetta', () => {
  const d = doc();
  const bottone = d.createElement('button');
  createKbd({ document: d, keys: ['Ctrl', '⇧', 'M'], control: bottone });
  assert.equal(bottone.getAttribute('aria-keyshortcuts'), 'Control+Shift+M');
});

test('KBD-03 AL CONTRARIO una scorciatoia di una lettera sola viene rifiutata', () => {
  assert.equal(validaScorciatoia(['M']).valida, false);
  assert.equal(validaScorciatoia(['Ctrl', 'M']).valida, true);
  const bottone = doc().createElement('button');
  assert.throws(() => applicaScorciatoia(bottone, ['M']), /una lettera sola/);
  assert.equal(bottone.getAttribute('aria-keyshortcuts'), null);
});

test('KBD-04 la forma per aria usa i nomi standard', () => {
  assert.equal(scorciatoiaAria(['⌘', '↵']), 'Meta+Enter');
  assert.equal(scorciatoiaAria('Esc'), 'Escape');
});

test('KBD-05 AL CONTRARIO un elenco di tasti vuoto non passa', () => {
  assert.throws(() => createKbd({ document: doc(), keys: [] }), /almeno un tasto/);
  assert.throws(() => createKbd({ document: doc(), keys: ['  '] }), /almeno un tasto/);
});

/* ---------------- Field ---------------- */

test('FIELD-01 il campo ha una label vera, nascosta ma tradotta', () => {
  const f = createField({ document: doc(), label: 'Cerca nelle conversazioni', placeholder: 'Cerca chat…' });
  const [label, input] = f.element.children;
  assert.equal(label.tagName, 'LABEL');
  assert.equal(label.className, 'sr-only');
  assert.equal(label.textContent, 'Cerca nelle conversazioni');
  assert.equal(label.getAttribute('for'), input.id);
  assert.equal(input.placeholder, 'Cerca chat…');
});

test('FIELD-02 AL CONTRARIO un campo senza nome non si monta', () => {
  assert.throws(() => createField({ document: doc(), placeholder: 'cerca' }), /richiede una label/);
});

test('FIELD-03 quello che scrivi arriva a chi ascolta', () => {
  const visti = [];
  const f = createField({ document: doc(), label: 'Cerca', onInput: (v) => visti.push(v) });
  const input = f.element.children[1];
  input.lancia('input', { target: { value: 'session-registry' } });
  assert.deepEqual(visti, ['session-registry']);
  f.destroy();
  input.lancia('input', { target: { value: 'dopo la distruzione' } });
  assert.deepEqual(visti, ['session-registry']);
});

/* ---------------- Select ---------------- */

test('SELECT-01 le opzioni diventano option vere, con quella scelta selezionata', () => {
  const s = createSelect({ document: doc(), label: 'Modello', options: ['claude-opus-5', 'claude-sonnet-5'], value: 'claude-sonnet-5' });
  const select = s.element.children[1];
  assert.equal(select.children.length, 2);
  assert.equal(select.children[1].selected, true);
  assert.equal(select.value, 'claude-sonnet-5');
});

test('SELECT-02 le opzioni possono avere valore e nome diversi', () => {
  const s = createSelect({ document: doc(), label: 'Permesso', options: [{ value: 'ask', label: 'Chiede sempre' }] });
  assert.equal(s.element.children[1].children[0].textContent, 'Chiede sempre');
  assert.equal(s.element.children[1].children[0].value, 'ask');
});

test('SELECT-03 AL CONTRARIO senza opzioni o senza label non si monta', () => {
  assert.throws(() => createSelect({ document: doc(), label: 'Modello', options: [] }), /almeno un/);
  assert.throws(() => createSelect({ document: doc(), options: ['a'] }), /richiede una label/);
});

/* ---------------- ListRow ---------------- */

test('ROW-01 una riga non premibile è un div, non finisce nella tastiera', () => {
  const r = createListRow({ document: doc(), title: 'Comando nel terminale', subtitle: 'esegue un comando' });
  assert.equal(r.element.tagName, 'DIV');
  assert.equal(r.element.getAttribute('role'), null);
});

test('ROW-02 nome e descrizione stanno su DUE righe (difetto E6)', () => {
  const r = createListRow({ document: doc(), title: 'Ricerca nei file', subtitle: 'cerca dentro la cartella' });
  const testo = r.element.children.find((c) => c.className === 'talos-list-row__text');
  assert.equal(testo.children[0].className, 'talos-list-row__title');
  assert.equal(testo.children[0].textContent, 'Ricerca nei file');
  assert.equal(testo.children[1].className, 'talos-list-row__sub');
  assert.equal(testo.children[1].textContent, 'cerca dentro la cartella');
});

test('ROW-03 una riga a scelta singola è un option con il suo stato', () => {
  const r = createListRow({ document: doc(), title: 'Attrezzo', interactive: 'select', selected: true });
  assert.equal(r.element.tagName, 'BUTTON');
  assert.equal(r.element.getAttribute('role'), 'option');
  assert.equal(r.element.getAttribute('aria-selected'), 'true');
  r.update({ selected: false });
  assert.equal(r.element.getAttribute('aria-selected'), 'false');
});

test('ROW-04 una riga premibile chiama chi ascolta, e smette quando muore', () => {
  const premute = [];
  const r = createListRow({ document: doc(), title: 'Apri', interactive: 'press', onPress: () => premute.push(1) });
  r.element.lancia('click', {});
  r.destroy();
  r.element.lancia('click', {});
  assert.equal(premute.length, 1);
});

test('ROW-05 AL CONTRARIO senza titolo, o con un\'interazione inventata, non si monta', () => {
  assert.throws(() => createListRow({ document: doc(), subtitle: 'solo descrizione' }), /richiede un titolo/);
  assert.throws(() => createListRow({ document: doc(), title: 'x', interactive: 'trascina' }), /interazione riga non valida/);
});

test('ROW-06 il sottotitolo assente non lascia una riga vuota', () => {
  const r = createListRow({ document: doc(), title: 'Solo titolo' });
  const testo = r.element.children.find((c) => c.className === 'talos-list-row__text');
  assert.equal(testo.children[1].hidden, true);
});
