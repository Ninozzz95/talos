/*
 * 11/10/2026 (owner: «levare dal composer la pillola dei giri… c'è la sezione Contesto»; scelta: «Via dal composer, il dato nel
 * Contesto»). La pillola diceva le richieste dell'INVIO in corso contro il tetto del kernel, e si accendeva vicino al tetto (decisione
 * B12 del 06/09). Ora quel dato è la prima riga dell'Indice dei giri, con lo stesso tono; e siccome la card nasce compressa,
 * vicino al tetto l'avviso si legge anche nella sua testata.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggiornaInspector, rigaDellInvio } from '../../src/components/inspector.js';

function documento() {
  const crea = (tag) => {
    const n = { tag, figli: [], dataset: {}, className: '', proprio: '',
      get textContent() { return this.proprio + this.figli.map((x) => x.textContent).join(''); },
      set textContent(v) { this.proprio = String(v); this.figli = []; },
      append(...nodi) { for (const x of nodi) { x.parent = this; this.figli.push(x); } },
      appendChild(x) { this.append(x); return x; },
      replaceChildren(...nodi) { this.figli = []; this.proprio = ''; this.append(...nodi); },
      remove() { if (this.parent) this.parent.figli = this.parent.figli.filter((x) => x !== this); },
      querySelector(s) { return s === '[data-anteprima]' ? this.anteprima ?? null : null; },
      querySelectorAll(s) { return this.figli.filter((x) => x.className === s.slice(1)); },
      setAttribute() {},
    };
    return n;
  };
  return { createElement: crea, createTextNode: (testo) => { const n = crea('#text'); n.textContent = testo; return n; } };
}
function colonna() {
  const d = documento();
  const indice = d.createElement('div');
  indice.anteprima = d.createElement('span');
  const inspector = { querySelector: () => null, querySelectorAll: () => [null, null, indice] };
  return { d, indice, inspector };
}
const tutti = (n) => [n, ...n.figli.flatMap(tutti)];

test('INVIO-01: la riga dice le richieste dell invio contro il tetto; avviso dall 80%, come la pillola (B12)', () => {
  assert.deepEqual(rigaDellInvio({ giri: 12, tetto: 24 }), ['Questo invio', '12 di 24 richieste', '']);
  assert.deepEqual(rigaDellInvio({ giri: 19, tetto: 24 }), ['Questo invio', '19 di 24 richieste', '']);
  assert.deepEqual(rigaDellInvio({ giri: 20, tetto: 24 }), ['Questo invio', '20 di 24 richieste', 'invio-vicino']);
  assert.deepEqual(rigaDellInvio({ giri: 1 }), ['Questo invio', '1 richiesta', ''], 'senza tetto dichiarato: il numero e basta');
  assert.deepEqual(rigaDellInvio({ giri: 1, tetto: 1 }), ['Questo invio', '1 di 1 richiesta', 'invio-vicino'], 'il plurale segue il tetto');
  assert.deepEqual(rigaDellInvio({ giri: 5, tetto: null }), ['Questo invio', '5 richieste', '']);
  // AL CONTRARIO: niente da dire, niente riga
  for (const vuoto of [{}, { giri: 0, tetto: 24 }, { giri: null, tetto: 24 }, { giri: 'x' }, { giri: -3 }]) assert.equal(rigaDellInvio(vuoto), null, JSON.stringify(vuoto));
});

test('INVIO-02: nella colonna la riga sta IN TESTA all indice; vicino al tetto ha il suo tono e si legge anche a card chiusa', () => {
  const { d, indice, inspector } = colonna();
  const giri = [{ numero: 1, token: 900 }, { numero: 2, token: 1200 }];
  aggiornaInspector(inspector, { giri, invio: { giri: 12, tetto: 24 } }, { document: d });
  assert.match(indice.textContent, /^\s*Questo invio12 di 24 richieste\s*1 · Giro/u, 'prima riga, poi i giri');
  assert.equal(tutti(indice).some((n) => String(n.className).includes('talos-kv__v--avviso')), false, 'sotto l 80% nessun avviso');
  assert.doesNotMatch(indice.anteprima.textContent, /Questo invio/u);
  aggiornaInspector(inspector, { giri, invio: { giri: 22, tetto: 24 } }, { document: d });
  assert.equal(tutti(indice).some((n) => String(n.className).includes('talos-kv__v--avviso')), true);
  assert.match(indice.anteprima.textContent, /^Questo invio 22 di 24 richieste · 2 giri$/u);
  // AL CONTRARIO: senza sessione (invio null) la riga se ne va
  aggiornaInspector(inspector, { giri, invio: null }, { document: d });
  assert.doesNotMatch(indice.textContent, /Questo invio/u);
});

test('INVIO-03: la pillola dei giri non è più nel composer, e la colonna riceve il dato dalla stessa fonte del piede', () => {
  const template = readFileSync(new URL('../../index.template.html', import.meta.url), 'utf8');
  assert.equal(/<[a-z][^>]*\sdata-runtime-giri/u.test(template), false, 'nessun elemento (un commento che la nomina va bene)');
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /invio: state\.realSession\.id \? \{ giri: Number\.isFinite\(Number\(state\.realSession\.usage\?\.giri\)\) \? Number\(state\.realSession\.usage\.giri\) : null, tetto: state\.realSession\.tettoGiriDichiarato \} : null,/u);
  assert.match(app, /tettoGiri: state\.realSession\.tettoGiriDichiarato,/u, 'stesso tetto del piede');
});
