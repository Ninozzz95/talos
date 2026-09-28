import assert from 'node:assert/strict';
import test from 'node:test';

/*
 * ⭐ 24/09/2026, owner: «non vedo più il logo di caricamento TALOS dopo che scrivi la risposta… l'orb con la linea che
 * gira attorno in cerchio… migliora l'esperienza utente». L'orb viveva SOLO nella bolla d'attesa (`creaAttesa`), che
 * sparisce al primo token: 2-7 s nei giri di prova, pochi millisecondi con la cache calda. Decisione dell'owner (24/09,
 * ribaltando il 10/09 «togli il logo dalla testata»): l'orb sta nella TESTATA del messaggio TALOS come sul mobile
 * (`TalosMobileAssistantHeader.vue:7`), gira finché il giro è vivo (`working`) e resta fermo dopo.
 */
import { creaMessaggioTalos } from '../../src/components/conversazione.js';

function documentoFinto() {
  const creati = [];
  const nodo = (tag) => {
    const n = { tag, className: '', dataset: {}, children: [], attr: new Map(), textContent: '' };
    n.setAttribute = (k, v) => { n.attr.set(k, String(v)); };
    n.getAttribute = (k) => n.attr.get(k) ?? null;
    n.append = (...figli) => { for (const f of figli) n.children.push(f); };
    n.appendChild = (f) => { n.children.push(f); return f; };
    n.classList = { add: (c) => { n.className = `${n.className} ${c}`.trim(); }, remove: (c) => { n.className = n.className.split(/\s+/).filter((x) => x !== c).join(' '); }, contains: (c) => n.className.split(/\s+/).includes(c), toggle() {} };
    creati.push(n);
    return n;
  };
  return { creati, doc: { createElement: nodo, createElementNS: (_ns, tag) => nodo(tag), createTextNode: (t) => ({ t }) } };
}

test('ORB-TESTATA-01 — il messaggio TALOS porta l’orb del mobile nella testata, primo, e con `working` mentre il giro è vivo', () => {
  const { creati, doc } = documentoFinto();
  const m = creaMessaggioTalos({ modello: 'glm-5.3-flash', ora: '10:14', working: true }, { document: doc });
  const testata = m.children.find((c) => /talos-message__head/.test(c.className));
  assert.ok(testata, 'la testata esiste');
  const orb = testata.children[0];
  assert.match(orb.className, /^talos-orb\b/, 'l’orb è il PRIMO figlio della testata, prima della scritta TALOS');
  assert.match(orb.className, /\bworking\b/, 'mentre il giro è vivo l’anello gira');
  assert.equal(orb.getAttribute('aria-hidden'), 'true', 'decorativo: il lettore di schermo legge «TALOS», non l’orb');
  assert.equal(orb.getAttribute('data-testid'), 'talos-message-orb');
  const marchio = orb.children.find((c) => /talos-short-logo/.test(c.className));
  assert.ok(marchio && marchio.children.some((c) => /talos-short-logo-mark/.test(c.className)), 'stessa struttura del mobile: cerchio → marchio corto → segno');
  assert.ok(testata.children.some((c) => /talos-message__who--talos/.test(c.className)), 'la scritta TALOS resta (10/09)');
  assert.equal(creati.filter((n) => /talos-orb/.test(n.className)).length, 1, 'un orb solo per messaggio');
});

test('ORB-TESTATA-02 al contrario — senza `working` (storia rigiocata, giro finito) l’orb c’è ma è FERMO', () => {
  const { doc } = documentoFinto();
  const m = creaMessaggioTalos({ modello: 'glm-5.3-flash', ora: '10:14' }, { document: doc });
  const orb = m.children.find((c) => /talos-message__head/.test(c.className)).children[0];
  assert.match(orb.className, /^talos-orb$/, 'niente anello che gira su un messaggio già scritto');
});
