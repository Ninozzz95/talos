/* 01/11/2026, «Tieni sveglio il PC»: la carta in Strumenti e permessi. DOM finto minimo, fetch finto: nessun server. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { MODI_PC_SVEGLIO, montaPcSveglio } from '../../src/components/pc-sveglio-impostazioni.js';

class Nodo {
  constructor(tag) { this.tagName = tag; this.figli = []; this.attributi = {}; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.hidden = false; this.disabled = false; this.value = ''; this.genitore = null; }
  get isConnected() { return true; }
  get options() { return this.figli; }
  append(...n) { for (const x of n) { x.genitore = this; this.figli.push(x); } }
  after(n) { this.genitore?.append(n); }
  setAttribute(k, v) { this.attributi[k] = String(v); }
  addEventListener(tipo, f) { (this.listeners[tipo] ??= []).push(f); }
  removeEventListener() {}
  set innerHTML(_html) { /* the card is built by hand below */ }
  querySelector(s) { return trova(this, s); }
}
function trova(radice, s) {
  const chiave = { '[data-pc-sveglio-modo]': 'menu', '.settings-group__title': 'titolo', '[data-pc-sveglio-aiuto]': 'aiuto', '[data-pc-sveglio-stato]': 'stato' }[s];
  if (chiave) return radice.parti?.[chiave] ?? null;
  return null;
}
function documento() {
  const pannello = new Nodo('div');
  pannello.querySelector = () => null;
  const doc = {
    listeners: {},
    documentElement: { addEventListener() {}, removeEventListener() {} },
    addEventListener(tipo, f) { (doc.listeners[tipo] ??= []).push(f); },
    removeEventListener() {},
    getElementById: (id) => (id === 'setting-panel-tools' ? pannello : null),
    createElement(tag) {
      const n = new Nodo(tag);
      if (tag === 'div' && !doc.primaScheda) {
        doc.primaScheda = n;
        n.parti = { menu: new Nodo('select'), titolo: new Nodo('h3'), aiuto: new Nodo('p'), stato: new Nodo('p') };
      }
      return n;
    },
  };
  return { doc, pannello };
}
const risposta = (dati, ok = true) => ({ ok, json: async () => (ok ? { data: dati } : { error: { code: 'X' } }) });
const attesa = () => new Promise((r) => setTimeout(r, 0));

test('KAU-1 in the installed app: three choices with the Frontend words, the saved one selected, a change is saved', async () => {
  const { doc, pannello } = documento();
  const chiamate = [];
  let modo = 'mentre-lavora';
  const fetchFn = async (_url, init) => { chiamate.push(init?.method ?? 'GET'); if (init?.method === 'POST') modo = JSON.parse(init.body).modo; return risposta({ modo, nellApp: true }); };
  const c = montaPcSveglio({ documento: doc, fetchFn });
  await attesa(); await attesa();
  const scheda = pannello.figli[0];
  assert.ok(scheda, 'the card is in «Tools and permissions»');
  const menu = scheda.parti.menu;
  assert.deepEqual(menu.figli.map((o) => o.value), MODI_PC_SVEGLIO.map((m) => m.valore));
  assert.equal(menu.value, 'mentre-lavora');
  assert.equal(menu.disabled, false);
  assert.equal(scheda.parti.stato.hidden, true);
  await c.salva('mai');
  assert.deepEqual(chiamate, ['GET', 'POST']);
  assert.equal(menu.value, 'mai');
});

test('KAU-2 outside the installed app: visible but off, and it says why; nothing is saved', async () => {
  const { doc, pannello } = documento();
  const chiamate = [];
  const c = montaPcSveglio({ documento: doc, fetchFn: async (_u, init) => { chiamate.push(init?.method ?? 'GET'); return risposta({ modo: 'mentre-lavora', nellApp: false }); } });
  await attesa(); await attesa();
  const scheda = pannello.figli[0];
  assert.equal(scheda.parti.menu.disabled, true);
  assert.equal(scheda.parti.stato.hidden, false);
  assert.notEqual(scheda.parti.stato.textContent, '');
  await c.salva('sempre');
  assert.deepEqual(chiamate, ['GET']);
});

test('KAU-3 a failed save keeps the old choice and says it; an unreadable route switches the row off', async () => {
  const { doc, pannello } = documento();
  const c = montaPcSveglio({ documento: doc, fetchFn: async (_u, init) => (init?.method === 'POST' ? risposta(null, false) : risposta({ modo: 'sempre', nellApp: true })) });
  await attesa(); await attesa();
  await c.salva('mai');
  const scheda = pannello.figli[0];
  assert.equal(scheda.parti.menu.value, 'sempre');
  assert.equal(scheda.parti.stato.hidden, false);
  const altro = documento();
  montaPcSveglio({ documento: altro.doc, fetchFn: async () => risposta(null, false) });
  await attesa(); await attesa();
  assert.equal(altro.pannello.figli[0].parti.menu.disabled, true);
});
