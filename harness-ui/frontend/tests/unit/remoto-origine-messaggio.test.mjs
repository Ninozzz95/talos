import test from 'node:test';
import assert from 'node:assert/strict';
import { creaMessaggioUtente } from '../../src/components/conversazione.js';
import { bollaPerLaRigiocata } from '../../src/components/bolla-della-persona.js';

/*
 * 18/10/2026 — controllo remoto, «dal telefono “Pad di Nino”» nella testata del messaggio della persona (mockup v5; owner 17/10:
 * nella testata, non sotto la bolla). Un documento finto minimo: il componente usa solo createElement/createTextNode/append.
 */
function documentoFinto() {
  const nodo = (tag) => ({
    tag, className: '', textContent: '', dataset: {}, children: [], attributi: {},
    append(...figli) { this.children.push(...figli); }, setAttribute(k, v) { this.attributi[k] = v; },
    querySelector(sel) { const cls = sel.replace(/^\./, ''); const cerca = (n) => (n.className?.split?.(' ').includes(cls) ? n : n.children?.map(cerca).find(Boolean)); return cerca(this) ?? null; },
  });
  return { createElement: nodo, createElementNS: (_ns, tag) => nodo(tag), createTextNode: (t) => ({ tag: '#text', textContent: t, children: [] }) };
}

test('ORIGINE-UI-01 un messaggio dal telefono porta «dal telefono» nella testata, in uno span suo', () => {
  const m = creaMessaggioUtente({ testo: 'ciao', ora: '12:43', meta: 'Follow-up', origine: { tipo: 'telefono', nome: 'Pad di Nino' } }, { document: documentoFinto() });
  const testata = m.querySelector('.talos-message__head');
  const origine = testata.querySelector('.talos-message__origine');
  assert.ok(origine, 'c\'è');
  assert.match(origine.textContent, /Pad di Nino/);
  assert.equal(testata.querySelector('.talos-message__meta').textContent, '12:43 · Follow-up', 'il meta (che il RunStarted riscrive) resta da solo');
});

test('ORIGINE-UI-02 al contrario: senza origine, o con un tipo che non è il telefono, niente', () => {
  for (const origine of [null, { tipo: 'pc', nome: 'X' }, 'telefono']) {
    const m = creaMessaggioUtente({ testo: 'ciao', origine }, { document: documentoFinto() });
    assert.equal(m.querySelector('.talos-message__origine'), null, JSON.stringify(origine));
  }
});

test('ORIGINE-UI-03 la rigiocata conserva l’origine della bolla salvata (ricarica e cambio di sessione)', () => {
  const b = bollaPerLaRigiocata({ bolla: { testo: 'x', allegati: [], origine: { tipo: 'telefono', nome: 'Pad' } }, consegna: 'x', immagini: [] });
  assert.deepEqual(b.origine, { tipo: 'telefono', nome: 'Pad' });
  assert.equal(bollaPerLaRigiocata({ bolla: { testo: 'x', allegati: [], origine: { tipo: 'altro' } }, consegna: 'x' }).origine, undefined);
});
