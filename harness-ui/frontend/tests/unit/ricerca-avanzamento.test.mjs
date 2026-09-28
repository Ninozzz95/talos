/*
 * ⛔ 24/09/2026 — l'avanzamento della ricerca approfondita nell'interfaccia (decisione owner «Barra + fase e conteggi»).
 * Numeri della ricerca vera dell'owner 92536781…: 2 linee, 12 passi previsti, 5 finiti, 2 fonti lette.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { creaAvanzamentoRicerca, testiAvanzamentoRicerca } from '../../src/components/ricerca-avanzamento.js';
import { creaReportRow } from '../../src/components/ricerca.js';

class Nodo {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = new Map(); this._t = null; this.className = ''; }
  append(...n) { this.children.push(...n); }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  removeAttribute(k) { this.attributes.delete(k); }
  addEventListener() {}
  set textContent(v) { this._t = String(v); this.children = []; }
  get textContent() { return this._t ?? this.children.map((c) => c.textContent).join(''); }
  *tutti() { for (const c of this.children) { yield c; if (c.tutti) yield* c.tutti(); } }
  trova(sel) { return [...this.tutti()].find((n) => sel(n)) ?? null; }
}
const documento = () => ({ createElement: (t) => new Nodo(t), createElementNS: (_ns, t) => new Nodo(t) });
const IN_CORSO = { fase: 'ricerca', frazione: 0.375, passiFatti: 4, passiFalliti: 1, passiStimati: 12, lineeTotali: 2, lineeIniziate: 2, lineaCorrente: 2, fontiLette: 2, partiRapporto: 0 };

test('RES-UI-PROGRESS-TEXT: fase in parole e conteggi veri; il testo accessibile dice i passi sul piano', () => {
  const t = testiAvanzamentoRicerca(IN_CORSO);
  assert.equal(t.fase, 'Cerca e legge le fonti');
  assert.deepEqual(t.conteggi, ['linea 2 di 2', '2 fonti lette']);
  assert.equal(t.percento, 38);
  assert.match(t.accessibile, /5 passi su circa 12 previsti dal piano/u);
  assert.deepEqual(testiAvanzamentoRicerca({ ...IN_CORSO, fase: 'scrittura', partiRapporto: 1, fontiLette: 1 }).conteggi,
    ['1 fonte letta', '1 parte del rapporto scritta'], 'singolare e plurale giusti; la linea non si dice mentre scrive');
});

test('RES-UI-PROGRESS-BAR: la barra è il <progress> a tema del sistema, col valore e il testo accessibile', () => {
  const blocco = creaAvanzamentoRicerca(documento(), IN_CORSO);
  const barra = blocco.trova((n) => n.tagName === 'progress');
  assert.equal(barra.className, 'talos-context__progress');
  assert.equal(barra.max, 100);
  assert.equal(barra.value, 38);
  assert.match(barra.getAttribute('aria-valuetext'), /circa 12 previsti/u);
  assert.equal(blocco.trova((n) => n.className === 'talos-research-progress__text').textContent, 'Cerca e legge le fonti · linea 2 di 2 · 2 fonti lette');
});

test('RES-UI-PROGRESS-NO-INVENTED-BAR: al contrario, senza una frazione nota non c’è barra, solo la fase', () => {
  const blocco = creaAvanzamentoRicerca(documento(), { ...IN_CORSO, frazione: null, passiStimati: null });
  assert.equal(blocco.trova((n) => n.tagName === 'progress'), null);
  assert.match(blocco.textContent, /Cerca e legge le fonti/u);
  assert.equal(creaAvanzamentoRicerca(documento(), null), null);
});

test('RES-UI-PROGRESS-ROW: la riga di una ricerca in corso porta l’avanzamento; una conclusa no', () => {
  const inCorso = creaReportRow({ id: 'r1', domanda: 'Capitale dell’Australia', stato: 'running', avviataAlle: '2026-09-24T17:36:35.184Z', avanzamento: IN_CORSO }, { document: documento() });
  assert.ok(inCorso.trova((n) => n.className === 'talos-research-progress'), 'la riga in corso ha la barra');
  const conclusa = creaReportRow({ id: 'r2', domanda: 'Stati dell’Unione', stato: 'done', avviataAlle: '2026-09-24T17:36:35.250Z', avanzamento: IN_CORSO }, { document: documento() });
  assert.equal(conclusa.trova((n) => n.className === 'talos-research-progress'), null);
});
