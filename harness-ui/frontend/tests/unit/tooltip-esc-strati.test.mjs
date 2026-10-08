/*
 * ESC-STRATI (08/10/2026, bugfixer) — con la bolla aperta sopra la finestra dei permessi, UN Esc chiudeva la bolla E la finestra
 * (misurato sulla 4176: `veloAperto:false` dopo un solo Esc). La bolla è lo strato più in alto: Esc è suo e basta, come in Radix
 * (`DismissableLayer`: cattura, solo lo strato più alto, `preventDefault()`). Il gestore dei veli ignora già un Esc
 * `defaultPrevented` (`overlays/manager.ts`, `handleKey`). Si prova la funzione VERA `collegaTooltip`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { collegaTooltip } from '../../src/components/tooltip.js';

function elemento(attributi = {}) {
  const a = new Map(Object.entries(attributi));
  return {
    nodeType: 1, tagName: 'BUTTON', parentElement: null, style: {},
    hasAttribute: (k) => a.has(k), getAttribute: (k) => (a.has(k) ? a.get(k) : null),
    setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: (k) => a.delete(k),
    getBoundingClientRect: () => ({ top: 500, bottom: 510, left: 10, right: 20 }),
  };
}
function banco(ritardo = 0) {
  const ascoltatori = new Map();
  const bolla = {
    hidden: true, contains: () => false, addEventListener() {}, querySelector: () => ({ textContent: '' }),
    showPopover() { this.hidden = false; }, hidePopover() { this.hidden = true; }, style: {},
  };
  const documento = {
    getElementById: (id) => (id === 'talosTip' ? bolla : null),
    addEventListener: (tipo, fn) => { if (!ascoltatori.has(tipo)) ascoltatori.set(tipo, []); ascoltatori.get(tipo).push(fn); },
    removeEventListener() {}, defaultView: null,
  };
  globalThis.innerWidth = 1920; globalThis.innerHeight = 1080;
  const stacca = collegaTooltip(documento, { ritardo });
  const manda = (tipo, target, extra = {}) => { for (const fn of ascoltatori.get(tipo) ?? []) fn({ type: tipo, target, ...extra }); };
  const esc = () => {
    const evento = { type: 'keydown', key: 'Escape', defaultPrevented: false, fermato: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.fermato = true; } };
    for (const fn of ascoltatori.get('keydown') ?? []) fn(evento);
    return evento;
  };
  return { bolla, manda, esc, stacca };
}
const unGiro = () => new Promise((r) => setTimeout(r, 5));

test('ESC-01 bolla VISIBILE: Esc chiude solo la bolla e ferma l evento (la finestra sotto resta aperta)', async () => {
  const b = banco();
  b.manda('pointerover', elemento({ title: 'Trascina o usa le frecce' }));
  await unGiro();
  assert.equal(b.bolla.hidden, false, 'premessa: la bolla è aperta');
  const evento = b.esc();
  assert.equal(b.bolla.hidden, true, 'la bolla si chiude');
  assert.equal(evento.defaultPrevented, true, 'il gestore dei veli vede un Esc già usato');
  assert.equal(evento.fermato, true, 'e nessun altro strato lo riceve');
  b.stacca();
});

test('ESC-02 al contrario: SENZA bolla, Esc passa intatto allo strato sotto (la finestra si chiude come prima)', () => {
  const b = banco();
  const evento = b.esc();
  assert.equal(evento.defaultPrevented, false);
  assert.equal(evento.fermato, false);
  b.stacca();
});

test('ESC-03 bolla solo IN ATTESA (non ancora a schermo): Esc annulla l attesa e passa allo strato sotto', async () => {
  const b = banco(1_000);
  b.manda('pointerover', elemento({ title: 'Copia' }));
  const evento = b.esc();
  assert.equal(evento.defaultPrevented, false, 'la persona non ha visto niente: il suo Esc è per la finestra');
  assert.equal(evento.fermato, false);
  await new Promise((r) => setTimeout(r, 1_050));
  assert.equal(b.bolla.hidden, true, 'e la bolla in attesa non compare più dopo');
  b.stacca();
});
