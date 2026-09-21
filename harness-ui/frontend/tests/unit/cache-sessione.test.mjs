import test from 'node:test';
import assert from 'node:assert/strict';
import { testoRiusoCache } from '../../src/components/consumo-sessione.js';
import { righeFinestra, aggiornaInspector } from '../../src/components/inspector.js';
import { aggiornaCosti } from '../../src/components/costi-consumo.js';

const misura = { percentuale: 63, tokenIngresso: 3000, tokenDaCache: 1890, giriMisurati: 2, giriNonMisurati: 1, fonte: 'consumo-fornitore' };

test('BC48-UI-TESTO: percentuale su giri misurati, zero e assenza distinti', () => {
  assert.equal(testoRiusoCache(misura), '63 % · su 2 giri');
  assert.equal(testoRiusoCache({ ...misura, percentuale: 0, tokenDaCache: 0, giriMisurati: 1 }), '0 % · su 1 giro');
  for (const valore of [null, {}, { percentuale: null }, { percentuale: NaN }, { ...misura, percentuale: 101 }, { ...misura, giriMisurati: 0 }]) assert.equal(testoRiusoCache(valore), 'non misurato');
});

test('BC48-UI-FINESTRA: la cache di sessione non cambia Conversazione e Libera', () => {
  const base = righeFinestra({ prompt_tokens: 100, completion_tokens: 20 }, 1000);
  const con = righeFinestra({ prompt_tokens: 100, completion_tokens: 20 }, 1000, null, misura);
  assert.deepEqual(con.righe.slice(0, -1), base.righe.slice(0, -1));
  assert.deepEqual(con.righe.at(-1), ['Riusato dalla cache', '63 % · su 2 giri']);
  assert.deepEqual(base.righe.at(-1), ['Riusato dalla cache', 'non misurato']);
});

/** DOM minimo sul modello delle altre prove unit del repository; nessun HTML interpretato. */
function documento() {
  const crea = tag => {
    const n = { tag, figli: [], dataset: {}, className: '', proprio: '',
      get textContent() { return this.proprio + this.figli.map(x => x.textContent).join(''); },
      set textContent(v) { this.proprio = String(v); this.figli = []; },
      append(...nodi) { for (const x of nodi) { x.parent = this; this.figli.push(x); } },
      appendChild(x) { this.append(x); return x; },
      replaceChildren(...nodi) { this.figli = []; this.proprio = ''; this.append(...nodi); },
      remove() { if (this.parent) this.parent.figli = this.parent.figli.filter(x => x !== this); },
      querySelector() { return null; },
      querySelectorAll(s) { return this.figli.filter(x => x.className === s.slice(1)); },
      setAttribute() {},
    };
    return n;
  };
  return { createElement: crea, createTextNode: testo => { const n = crea('#text'); n.textContent = testo; return n; } };
}

test('BC48-UI-DOM: inspector e costi mostrano la stessa misura, reload e cambio sessione', () => {
  const d = documento(); const card = d.createElement('div');
  const inspector = { querySelector: () => null, querySelectorAll: () => [null, card, null] };
  const riepilogo = d.createElement('div');
  const pannello = { querySelector: s => s === '#costiRiepilogo' ? riepilogo : null };
  const sessioni = [{ sessionId: 'aperta', cacheSessione: JSON.parse(JSON.stringify(misura)) }, { sessionId: 'altra', cacheSessione: { ...misura, percentuale: 80 } }];
  aggiornaInspector(inspector, { cacheSessione: sessioni[0].cacheSessione }, { document: d });
  aggiornaCosti(pannello, sessioni, { document: d, sessioneId: 'aperta' });
  assert.match(card.textContent, /Riusato dalla cache.*63 % · su 2 giri/);
  assert.match(riepilogo.textContent, /Sessione aperta · Riusato dalla cache · 63 % · su 2 giri/);
  assert.doesNotMatch(riepilogo.textContent, /80 %/);
  aggiornaInspector(inspector, { cacheSessione: null }, { document: d });
  aggiornaCosti(pannello, sessioni, { document: d, sessioneId: 'assente' });
  assert.match(card.textContent, /Riusato dalla cache.*non misurato/);
  assert.match(riepilogo.textContent, /Riusato dalla cache · non misurato/);
  assert.doesNotMatch(card.textContent + riepilogo.textContent, /63 %|cached_tokens|prompt_tokens/);
  assert.equal(card.textContent.match(/Riusato dalla cache/g).length, 1);
  assert.equal(riepilogo.textContent.match(/Riusato dalla cache/g).length, 1);
});
