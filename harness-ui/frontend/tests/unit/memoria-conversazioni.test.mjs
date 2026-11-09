/* 01/11/2026, «Memoria delle conversazioni»: la carta in Impostazioni → Modelli. DOM finto minimo, fetch finto. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { montaMemoriaConversazioni } from '../../src/components/memoria-conversazioni.js';
import { t } from '../../src/components/lingua.js';

class Nodo {
  constructor(tag) { this.tagName = tag; this.figli = []; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.hidden = false; this.disabled = false; this.value = ''; this.max = ''; }
  get isConnected() { return true; }
  append(n) { this.figli.push(n); }
  after(n) { this.figli.push(n); }
  setAttribute() {}
  addEventListener(tipo, f) { (this.listeners[tipo] ??= []).push(f); }
  removeEventListener() {}
  set innerHTML(_x) {}
  querySelector(s) { return this.parti?.[{ '.settings-group__title': 'titolo', '[data-memoria-aiuto]': 'aiuto', '[data-memoria-etichetta]': 'etichetta', '[data-memoria-gb]': 'campo', '[data-memoria-stato]': 'stato' }[s]] ?? null; }
}
function documento() {
  const pannello = new Nodo('div');
  pannello.querySelector = () => null;
  let prima = true;
  const doc = {
    documentElement: { addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {},
    getElementById: (id) => (id === 'setting-panel-models' ? pannello : null),
    createElement(tag) { const n = new Nodo(tag); if (prima) { prima = false; n.parti = { titolo: new Nodo('h3'), aiuto: new Nodo('p'), etichetta: new Nodo('span'), campo: new Nodo('input'), stato: new Nodo('p') }; } return n; },
  };
  return { doc, pannello };
}
const risposta = (data, ok = true) => ({ ok, json: async () => (ok ? { data } : { error: { code: 'X' } }) });
const attesa = () => new Promise((r) => setTimeout(r, 0));

test('MC-1 the value and the maximum come from the server; a change is saved; 0 says «Off» instead of the help', async () => {
  const { doc, pannello } = documento();
  let gb = 8;
  const c = montaMemoriaConversazioni({ documento: doc, fetchFn: async (_u, init) => { if (init?.method === 'POST') gb = JSON.parse(init.body).gb; return risposta({ gb, massimo: 30 }); } });
  await attesa(); await attesa();
  const p = pannello.figli[0].parti;
  assert.equal(p.campo.value, '8');
  assert.equal(p.campo.max, '30');
  assert.equal(p.stato.hidden, true);
  assert.notEqual(p.aiuto.textContent, '');
  await c.salva(0);
  assert.equal(p.campo.value, '0');
  assert.equal(p.aiuto.hidden, true);
  assert.equal(p.stato.hidden, false);
  assert.notEqual(p.stato.textContent, '');
});

test('MC-2 a failed save keeps the old value and says it; an unreadable route switches the field off', async () => {
  const { doc, pannello } = documento();
  const c = montaMemoriaConversazioni({ documento: doc, fetchFn: async (_u, init) => (init?.method === 'POST' ? risposta(null, false) : risposta({ gb: 8, massimo: 30 })) });
  await attesa(); await attesa();
  await c.salva(12);
  const p = pannello.figli[0].parti;
  assert.equal(p.campo.value, '8');
  assert.equal(p.stato.hidden, false);
  assert.equal(p.stato.textContent, t('varie.conversationMemory.notSaved'), 'its own key (Frontend), not the keep-awake one');
  assert.notEqual(p.stato.textContent, 'varie.conversationMemory.notSaved', 'the key resolves to a sentence');
  const altro = documento();
  montaMemoriaConversazioni({ documento: altro.doc, fetchFn: async () => risposta(null, false) });
  await attesa(); await attesa();
  assert.equal(altro.pannello.figli[0].parti.campo.disabled, true);
  assert.equal(altro.pannello.figli[0].parti.stato.textContent, t('varie.conversationMemory.unavailable'));
});

test('MC-4 the sister card mounted AFTER this one (its own server read): this card moves right after it (photo of 01/11 at 1024)', async () => {
  const { doc, pannello } = documento();
  const sorella = new Nodo('div');
  sorella.dataset.settingsCard = 'modelli-finestra-piena';
  let presente = false;
  pannello.querySelector = (s) => (presente && s === '[data-settings-card="modelli-finestra-piena"]' ? sorella : null);
  sorella.nextElementSibling = null;
  sorella.after = (n) => { sorella.nextElementSibling = n; sorella.spostamenti = (sorella.spostamenti ?? 0) + 1; };
  let avvisa = null;
  doc.defaultView = { MutationObserver: class { constructor(f) { avvisa = f; } observe() {} disconnect() {} } };
  montaMemoriaConversazioni({ documento: doc, fetchFn: async () => risposta({ gb: 8, massimo: 30 }) });
  await attesa(); await attesa();
  const carta = pannello.figli[0];
  assert.equal(sorella.nextElementSibling, null, 'no sister yet: the card is appended');
  presente = true; // the sister arrives and is appended after this card
  avvisa();
  assert.equal(sorella.nextElementSibling, carta);
  avvisa();
  assert.equal(sorella.spostamenti, 1, 'already in place: not moved again (no mutation loop)');
});

test('MC-3 the other way: nonsense values are not sent', async () => {
  const { doc } = documento();
  const chiamate = [];
  const c = montaMemoriaConversazioni({ documento: doc, fetchFn: async (_u, init) => { chiamate.push(init?.method ?? 'GET'); return risposta({ gb: 8, massimo: 30 }); } });
  await attesa(); await attesa();
  for (const v of [Number.NaN, -1, 2.5, 8]) await c.salva(v);
  assert.deepEqual(chiamate, ['GET']);
});
