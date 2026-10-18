import assert from 'node:assert/strict';
import test from 'node:test';
import { segnaAutomazioneSenzaCarta } from '../../src/components/automazione-carta.js';
import { impostaLingua } from '../../src/components/lingua.js';

/*
 * ⭐ Full access (owner 17/10/2026, dopo la revisione I: «niente carta, avviso visibile a te»). La riga dell'attrezzo di
 *   un'automazione fatta senza carta porta il segno, e il dettaglio gli stessi riquadri della carta più «Apri l'automazione».
 */
function nodoFinto(tag, doc) {
  const nodo = {
    tag, ownerDocument: doc, figli: [], padre: null, dataset: {}, attributi: {}, textContent: '', title: '', type: '', classi: new Set(), ascoltatori: {},
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: { add: (...c) => c.forEach((x) => nodo.classi.add(x)), contains: (c) => nodo.classi.has(c) },
    setAttribute: (k, v) => { nodo.attributi[k] = String(v); },
    getAttribute: (k) => nodo.attributi[k] ?? null,
    addEventListener: (tipo, fn) => { (nodo.ascoltatori[tipo] ??= []).push(fn); },
    click: () => (nodo.ascoltatori.click ?? []).forEach((fn) => fn()),
    append: (...x) => { for (const f of x) { f.padre = nodo; nodo.figli.push(f); } },
    prepend: (...x) => { for (const f of x.reverse()) { f.padre = nodo; nodo.figli.unshift(f); } },
    before: (f) => { const i = nodo.padre.figli.indexOf(nodo); f.padre = nodo.padre; nodo.padre.figli.splice(i, 0, f); },
    querySelector: (sel) => {
      const m = /^:scope > \.([\w-]+)$/u.exec(sel);
      if (!m) throw new Error(`selettore non previsto: ${sel}`);
      return nodo.figli.find((f) => f.classi.has(m[1])) ?? null;
    },
  };
  return nodo;
}
function rigaFinta() {
  const doc = { createElement: (tag) => nodoFinto(tag, doc) };
  const riga = doc.createElement('div');
  for (const c of ['talos-tool-row__name', 'talos-voce__meta']) { const f = doc.createElement('span'); f.className = c; riga.append(f); }
  const corpo = doc.createElement('pre');
  return { riga, corpo };
}
const tutto = (n) => [n.textContent, ...n.figli.flatMap(tutto)];
const trova = (n, p) => (p(n) ? n : n.figli.map((f) => trova(f, p)).find(Boolean));
const SENZA_CARTA = { oltre: [{ codice: 'accesso-pieno' }], minacce: ['ignora-istruzioni'], automationId: 'auto-1' };

test('AUTO-SENZA-CARTA-01: segno sulla riga, riquadri della carta nel dettaglio, «Apri l’automazione» apre QUELLA automazione', () => {
  impostaLingua('it');
  const { riga, corpo } = rigaFinta();
  const aperte = [];
  segnaAutomazioneSenzaCarta({ riga, corpo, senzaCarta: SENZA_CARTA, apri: (id) => aperte.push(id) });
  const segno = riga.figli.find((f) => f.classi.has('talos-tool-row__senza-carta'));
  assert.equal(segno.textContent, 'Senza conferma');
  assert.equal(riga.figli.indexOf(segno), 1, 'prima dei metadati, come il segno del contenuto sospetto');
  const testi = tutto(corpo).join(' | ');
  assert.match(testi, /Fatto senza chiedere: è attivo l’Accesso pieno/u);
  assert.match(testi, /Queste istruzioni sembrano un’iniezione/u, 'il riquadro delle minacce della carta');
  assert.match(testi, /Accesso pieno: può cambiare qualunque file/u, 'il riquadro «oltre la chat» della carta');
  const bottone = trova(corpo, (n) => n.tag === 'button');
  assert.equal(bottone.textContent, 'Apri l’automazione');
  bottone.click();
  assert.deepEqual(aperte, ['auto-1']);
});

test('AUTO-SENZA-CARTA-02: in inglese; una volta sola per riga; senza id niente pulsante', () => {
  impostaLingua('en');
  try {
    const { riga, corpo } = rigaFinta();
    segnaAutomazioneSenzaCarta({ riga, corpo, senzaCarta: { ...SENZA_CARTA, automationId: undefined }, apri: () => {} });
    segnaAutomazioneSenzaCarta({ riga, corpo, senzaCarta: SENZA_CARTA, apri: () => {} });
    assert.equal(riga.figli.filter((f) => f.classi.has('talos-tool-row__senza-carta')).length, 1, 'una riconnessione non raddoppia');
    assert.equal(corpo.figli.length, 1);
    assert.match(tutto(corpo).join(' | '), /Done without asking: Full access is on/u);
    assert.equal(trova(corpo, (n) => n.tag === 'button'), undefined);
  } finally {
    impostaLingua('it');
  }
});
