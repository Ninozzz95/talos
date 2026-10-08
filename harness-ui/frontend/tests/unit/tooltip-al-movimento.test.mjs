/*
 * VELO-PERMESSI-PIEDE v2 (08/10/2026, bugfixer) — un elemento che COMPARE sotto un puntatore fermo non è un passaggio del
 * mouse. Misurato sulla 4176 a 1920×1080: aperta la finestra dei permessi col chip del compositore, la maniglia del bordo
 * basso cadeva sotto il puntatore fermo e «Trascina o usa le frecce…» copriva «Riporta a…/Fatto». Cura come Radix
 * (`onPointerMove`, una volta per ingresso): chi porta `data-tip-al-movimento` si apre solo al primo movimento.
 * Si prova la funzione VERA `collegaTooltip` con un DOM minimo e gli eventi spediti a mano.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collegaTooltip } from '../../src/components/tooltip.js';

function elemento(attributi = {}, genitore = null) {
  const a = new Map(Object.entries(attributi));
  return {
    nodeType: 1, tagName: 'BUTTON', parentElement: genitore, style: {},
    hasAttribute: (k) => a.has(k), getAttribute: (k) => (a.has(k) ? a.get(k) : null),
    setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: (k) => a.delete(k),
    getBoundingClientRect: () => ({ top: 500, bottom: 510, left: 10, right: 20 }),
  };
}

function banco() {
  const ascoltatori = new Map();
  const testo = { textContent: '' };
  const bolla = {
    hidden: true, contains: () => false, addEventListener() {}, querySelector: () => testo,
    showPopover() { this.hidden = false; }, hidePopover() { this.hidden = true; }, style: {},
  };
  const documento = {
    getElementById: (id) => (id === 'talosTip' ? bolla : null),
    addEventListener: (tipo, fn) => { if (!ascoltatori.has(tipo)) ascoltatori.set(tipo, []); ascoltatori.get(tipo).push(fn); },
    removeEventListener() {}, defaultView: null,
  };
  globalThis.innerWidth = 1920; globalThis.innerHeight = 1080;
  const stacca = collegaTooltip(documento, { ritardo: 0 });
  const manda = (tipo, target, extra = {}) => { for (const fn of ascoltatori.get(tipo) ?? []) fn({ type: tipo, target, ...extra }); };
  return { bolla, testo, manda, stacca };
}
const unGiro = () => new Promise((r) => setTimeout(r, 5));

test('TIP-MOV-01 una maniglia comparsa sotto il puntatore FERMO non apre la bolla; il primo movimento sì', async () => {
  const b = banco();
  const maniglia = elemento({ title: 'Trascina o usa le frecce', 'data-tip-al-movimento': '' });
  b.manda('pointerover', maniglia);
  await unGiro();
  assert.equal(b.bolla.hidden, true, 'solo pointerover: niente bolla');
  b.manda('pointermove', maniglia);
  await unGiro();
  assert.equal(b.bolla.hidden, false, 'col movimento la bolla è legittima');
  assert.equal(b.testo.textContent, 'Trascina o usa le frecce');
  b.stacca();
});

test('TIP-MOV-02 al contrario: un suggerimento SENZA l attributo si apre come prima, al solo passaggio', async () => {
  const b = banco();
  const bottone = elemento({ title: 'Copia' });
  b.manda('pointerover', bottone);
  await unGiro();
  assert.equal(b.bolla.hidden, false);
  b.stacca();
});

test('TIP-MOV-03 il movimento conta solo SOPRA la maniglia: passare su un altro elemento non la apre', async () => {
  const b = banco();
  const maniglia = elemento({ title: 'Trascina', 'data-tip-al-movimento': '' });
  const altro = elemento({});
  b.manda('pointerover', maniglia);
  b.manda('pointermove', altro);
  b.manda('pointermove', maniglia); // l'attesa è già consumata: serve un nuovo ingresso
  await unGiro();
  assert.equal(b.bolla.hidden, true);
  b.manda('pointerover', maniglia);
  b.manda('pointermove', maniglia);
  await unGiro();
  assert.equal(b.bolla.hidden, false, 'un nuovo ingresso col movimento la apre');
  b.stacca();
});

test('TIP-MOV-04 un clic annulla l attesa: niente bolla al movimento dopo un pointerdown', async () => {
  const b = banco();
  const maniglia = elemento({ title: 'Trascina', 'data-tip-al-movimento': '' });
  b.manda('pointerover', maniglia);
  b.manda('pointerdown', maniglia);
  b.manda('pointermove', maniglia);
  await unGiro();
  assert.equal(b.bolla.hidden, true);
  b.stacca();
});

test('TIP-MOV-06 il FUOCO da tastiera sulla maniglia apre la bolla senza movimento (Radix: onFocus apre, nessun pointermove)', async () => {
  // review di «talos desktop»: chi usa la tastiera non muove il puntatore; il suggerimento è scritto proprio per lui
  const b = banco();
  const maniglia = { ...elemento({ title: 'Trascina o usa le frecce', 'data-tip-al-movimento': '' }), matches: (s) => s === ':focus-visible' };
  b.manda('keydown', maniglia, { key: 'Tab' });
  b.manda('focusin', maniglia);
  await unGiro();
  assert.equal(b.bolla.hidden, false, 'al fuoco da tastiera la bolla si apre');
  assert.equal(b.testo.textContent, 'Trascina o usa le frecce');
  b.stacca();
});

test('TIP-MOV-05 le maniglie dei dialoghi portano l attributo (dialoghi.js)', () => {
  const sorgente = readFileSync(new URL('../../src/components/dialoghi.js', import.meta.url), 'utf8');
  const collega = sorgente.slice(sorgente.indexOf('export function collegaRidimensionamentoDialoghi('));
  assert.match(collega.slice(0, 2500), /h\.setAttribute\('data-tip-al-movimento', ''\);/);
});
