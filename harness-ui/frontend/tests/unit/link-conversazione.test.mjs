/*
 * link-conversazione.test.mjs — decisione owner 27/09 (memoria `decisioni-owner-capacita-sezioni-27-09`, punto 3): dopo
 *   `conversation_search` il modello scrive `[titolo](talos://conversazione/<id>)`, e la chat lo rende come un PULSANTE che
 *   apre quella conversazione. Solo quello schema e solo dove chi chiama lo accende: i link web in chat restano spenti come
 *   deciso il 18/09 (`markdown.js`, commento sui link).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderizzaMarkdown } from '../../src/components/markdown.js';

/* Lo stesso DOM finto, minimo, di `markdown-recinti-e-citazioni.test.mjs`. */
function creaDocumentoFinto() {
  const creaNodo = (tag) => {
    const nodo = {
      tag, tipo: 'elemento', figli: [], attributi: new Map(), style: {}, classe: '', testoProprio: null,
      get className() { return nodo.classe; }, set className(v) { nodo.classe = String(v); },
      get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent).join(''); },
      set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
      get innerHTML() { return ''; }, set innerHTML(v) { void v; },
      appendChild: (f) => { nodo.figli.push(f); return f; },
      append: (...f) => nodo.figli.push(...f),
      setAttribute: (k, v) => nodo.attributi.set(k, String(v)),
      getAttribute: (k) => (nodo.attributi.has(k) ? nodo.attributi.get(k) : null),
    };
    return nodo;
  };
  return {
    createElement: (tag) => creaNodo(tag),
    createTextNode: (t) => ({ tag: '#text', tipo: 'testo', figli: [], testo: String(t), get textContent() { return this.testo; } }),
    createDocumentFragment: () => creaNodo('#fragment'),
  };
}
const perTag = (nodo, tag) => {
  const fuori = [];
  const giro = (n) => (n.figli || []).forEach((f) => { if (f.tag === tag) fuori.push(f); giro(f); });
  giro(nodo);
  return fuori;
};
const rendi = (testo, opzioni = {}) => renderizzaMarkdown(testo, { document: creaDocumentoFinto(), ...opzioni });
const ID = 'a1b2c3d4-0000-4000-8000-000000000001';

test('LINK-CONVERSAZIONE-01 — acceso, diventa un pulsante col titolo e l’id; il testo intorno resta', () => {
  const f = rendi(`Ne abbiamo parlato in [Saluto **enterprise**](talos://conversazione/${ID}), ieri.`, { linkConversazione: true });
  const [b] = perTag(f, 'button');
  assert.ok(b, 'c’è il pulsante');
  assert.equal(b.classe, 'talos-link-conversazione');
  assert.equal(b.getAttribute('data-conversazione'), ID);
  assert.equal(b.type, 'button');
  assert.equal(b.textContent, 'Saluto **enterprise**', 'il titolo è testo, mai markup');
  assert.equal(f.textContent, 'Ne abbiamo parlato in Saluto **enterprise**, ieri.');
  assert.equal(perTag(f, 'a').length, 0, 'nessun indirizzo');
});

test('LINK-CONVERSAZIONE-02 — AL CONTRARIO: spento non nasce; un link web o un javascript: in chat restano testo', () => {
  const spento = rendi(`[Saluto](talos://conversazione/${ID})`);
  assert.equal(perTag(spento, 'button').length, 0);
  assert.equal(spento.textContent, `[Saluto](talos://conversazione/${ID})`);
  for (const altro of ['[sito](https://example.com)', '[x](javascript:alert(1))', `[x](talos://altro/${ID})`, `![img](talos://conversazione/${ID})`]) {
    const f = rendi(altro, { linkConversazione: true });
    assert.equal(perTag(f, 'button').length, 0, altro);
    assert.equal(perTag(f, 'a').length, 0, altro);
  }
});

test('LINK-CONVERSAZIONE-03 — con i link web accesi (scheda del modello) i due convivono, e gli indici non slittano', () => {
  const f = rendi(`[conv](talos://conversazione/${ID}) e [sito](https://example.com) e **forte**`, { linkConversazione: true, linkMarkdown: true });
  assert.equal(perTag(f, 'button')[0]?.getAttribute('data-conversazione'), ID);
  assert.equal(perTag(f, 'a')[0]?.getAttribute('href'), 'https://example.com');
  assert.equal(perTag(f, 'strong')[0]?.textContent, 'forte');
});
