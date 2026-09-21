import test from 'node:test';
import assert from 'node:assert/strict';
import { risolviLingua, etichettaLinguaRisolta, applicaLingua, DIZIONARIO } from '../../src/components/lingua.js';

// 06/09 B8 — la lingua dei menu: preferenza e lingua risolta sono due cose (H21).

test('LINGUA-RISOLTA: la scelta esplicita vince; «sistema» segue il browser; sconosciuta → inglese', () => {
  assert.equal(risolviLingua('en', ['it-IT']), 'en');
  assert.equal(risolviLingua('sistema', ['it-IT', 'en']), 'it');
  assert.equal(risolviLingua('sistema', ['de-DE', 'fr']), 'en');
  assert.equal(risolviLingua('sistema', 'en-US'), 'en');
  assert.equal(risolviLingua(undefined, []), 'en');
  assert.equal(etichettaLinguaRisolta('sistema', 'it'), 'Segui il sistema (italiano)');
  assert.equal(etichettaLinguaRisolta('en', 'en'), 'English');
});

test('LINGUA-DIZIONARIO: le due lingue hanno le stesse chiavi', () => {
  assert.deepEqual(Object.keys(DIZIONARIO.en).sort(), Object.keys(DIZIONARIO.it).sort());
});

test('LINGUA-APPLICA: traduce solo il primo nodo di testo (il badge dentro la scheda resta) e i placeholder; lang sulla radice', () => {
  // un DOM minimo senza browser
  const figli = [];
  const testo = (data) => ({ nodeType: 3, data });
  const badge = { nodeType: 1, textContent: '2' };
  const tab = { childNodes: [testo('Terminale '), badge], getAttribute: () => 'terminale', textContent: 'Terminale 2' };
  const campo = { getAttribute: () => 'cerca', placeholder: 'Cerca chat…' };
  const radice = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const root = { documentElement: radice, querySelectorAll: (sel) => (sel === '[data-t]' ? [tab] : [campo]) };
  const toccati = applicaLingua(root, 'en');
  assert.equal(toccati, 2);
  assert.equal(tab.childNodes[0].data, 'Terminal ');
  assert.equal(badge.textContent, '2');
  assert.equal(campo.placeholder, 'Search chats…');
  assert.equal(radice.attrs.lang, 'en');
  void figli;
});
