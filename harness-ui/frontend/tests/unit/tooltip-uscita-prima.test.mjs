/*
 * Revisione UX della candidata, 04/11/2026 (agente Z), riga 34 — variante della cura VELO-PERMESSI-PIEDE v2 (8bbad5ca3, `tooltip.js` (4)):
 * «Trascina o usa le frecce · doppio clic per la misura normale» restava a schermo oltre 15 s sopra il selettore, col puntatore già altrove.
 * Il meccanismo: il puntatore passa sulla maniglia e se ne va PRIMA che scadano i 350 ms. `suUscita` usciva subito perché `bersaglio` era
 * ancora vuoto (la bolla non era aperta), il timer restava armato, e 350 ms dopo la bolla si apriva su un elemento che il puntatore aveva
 * già lasciato: nessun `pointerout` l'avrebbe più chiusa.
 * Cura come Radix e Hermes (`tooltip.tsx`): uscire dal bersaglio annulla anche l'apertura in attesa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { collegaTooltip } from '../../src/components/tooltip.js';

function elemento(attributi = {}) {
  const a = new Map(Object.entries(attributi));
  const el = {
    nodeType: 1, tagName: 'BUTTON', parentElement: null, style: {},
    hasAttribute: (k) => a.has(k), getAttribute: (k) => (a.has(k) ? a.get(k) : null),
    setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: (k) => a.delete(k),
    getBoundingClientRect: () => ({ top: 500, bottom: 510, left: 10, right: 20 }),
    contains: (n) => n === el,
  };
  return el;
}

function banco(ritardo) {
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
  const stacca = collegaTooltip(documento, { ritardo });
  const manda = (tipo, target, extra = {}) => { for (const fn of ascoltatori.get(tipo) ?? []) fn({ type: tipo, target, ...extra }); };
  return { bolla, manda, stacca };
}
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));

test('TIP-USCITA-01 (UX 34) la maniglia lasciata prima del ritardo non apre la bolla dopo', async () => {
  const b = banco(30);
  const maniglia = elemento({ title: 'Trascina o usa le frecce · doppio clic per la misura normale', 'data-tip-al-movimento': '' });
  const selettore = elemento({});
  b.manda('pointerover', maniglia);
  b.manda('pointermove', maniglia); // il movimento arma il timer
  b.manda('pointerout', maniglia, { relatedTarget: selettore }); // e il puntatore se ne va subito
  await aspetta(60);
  assert.equal(b.bolla.hidden, true, 'la bolla si apriva su un elemento già lasciato e restava lì');
  b.stacca();
});

test('TIP-USCITA-02 (UX 34) lo stesso per un suggerimento qualsiasi; uscire verso un figlio del bersaglio invece non annulla', async () => {
  const b = banco(30);
  const bottone = elemento({ title: 'Copia' });
  b.manda('pointerover', bottone);
  b.manda('pointerout', bottone, { relatedTarget: null }); // fuori dalla finestra
  await aspetta(60);
  assert.equal(b.bolla.hidden, true);
  b.manda('pointerover', bottone);
  b.manda('pointerout', bottone, { relatedTarget: bottone }); // dentro di sé (un figlio): resta
  await aspetta(60);
  assert.equal(b.bolla.hidden, false, 'il passaggio vero apre la bolla come prima');
  b.stacca();
});

test('TIP-USCITA-03 (UX 34) una maniglia comparsa e lasciata prima del movimento non resta in attesa', async () => {
  const b = banco(0);
  const maniglia = elemento({ title: 'Trascina', 'data-tip-al-movimento': '' });
  b.manda('pointerover', maniglia);
  b.manda('pointerout', maniglia, { relatedTarget: null });
  b.manda('pointermove', maniglia); // un movimento che arriva in ritardo, dopo l'uscita
  await aspetta(10);
  assert.equal(b.bolla.hidden, true);
  b.stacca();
});
