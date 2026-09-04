import assert from 'node:assert/strict';
import test from 'node:test';

import { createCheckCard } from '../../src/design-system/check-card.js';
import { createDataTable } from '../../src/design-system/data-table.js';
import { createSettingRow } from '../../src/design-system/setting-row.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const doc = () => fakeDocument();
const tutti = (el, predicato, trovati = []) => {
  if (predicato(el)) trovati.push(el);
  for (const figlio of el.children) tutti(figlio, predicato, trovati);
  return trovati;
};

const COLONNE = [
  { id: 'sessione', label: 'Sessione', rowHeader: true },
  { id: 'giri', label: 'Giri', align: 'end', sortable: true },
  { id: 'costo', label: 'Costo', align: 'end', sortable: true },
];
const RIGHE = [
  { cells: { sessione: 'W1-02 registro processi', giri: '7', costo: '$0,08' } },
  { cells: { sessione: 'Cancello ricerca web', giri: '3', costo: '$0,02' } },
];

/* ---------------- DataTable ---------------- */

test('TABLE-01 il nome della tabella è una didascalia VISIBILE, non un attributo', () => {
  const t = createDataTable({ document: doc(), caption: 'Tutte le sessioni', columns: COLONNE, rows: RIGHE });
  const caption = trova(t.element, (e) => e.tagName === 'CAPTION');
  assert.equal(caption.textContent, 'Tutte le sessioni');
  assert.equal(trova(t.element, (e) => e.tagName === 'TABLE').getAttribute('aria-label'), null);
});

test('TABLE-02 ogni intestazione dichiara la sua colonna, e la prima cella è l\'intestazione della RIGA', () => {
  const t = createDataTable({ document: doc(), caption: 'Sessioni', columns: COLONNE, rows: RIGHE });
  const intestazioni = tutti(t.element, (e) => e.tagName === 'TH' && e.getAttribute('scope') === 'col');
  assert.equal(intestazioni.length, 3);
  const righeIntestazione = tutti(t.element, (e) => e.tagName === 'TH' && e.getAttribute('scope') === 'row');
  assert.equal(righeIntestazione.length, 2);
  assert.equal(righeIntestazione[0].textContent, 'W1-02 registro processi');
});

test('TABLE-03 ⭐ una colonna ordinabile ha un BOTTONE vero: si raggiunge con Tab', () => {
  const t = createDataTable({ document: doc(), caption: 'Sessioni', columns: COLONNE, rows: RIGHE });
  const bottoni = tutti(t.element, (e) => e.tagName === 'BUTTON');
  assert.equal(bottoni.length, 2);
  assert.equal(bottoni[0].type, 'button');
  assert.match(testoDi(bottoni[0]), /^Giri/);
});

test('TABLE-04 ⭐ aria-sort sta sul th e SOLO sulla colonna attiva', () => {
  const t = createDataTable({
    document: doc(), caption: 'Sessioni', columns: COLONNE, rows: RIGHE,
    sort: { column: 'costo', direction: 'descending' },
  });
  const conOrdine = tutti(t.element, (e) => e.hasAttribute('aria-sort'));
  assert.equal(conOrdine.length, 1);
  assert.equal(conOrdine[0].tagName, 'TH');
  assert.equal(conOrdine[0].getAttribute('aria-sort'), 'descending');
});

test('TABLE-05 ⭐ la freccia è nascosta: lo stato lo dice già aria-sort', () => {
  const t = createDataTable({
    document: doc(), caption: 'Sessioni', columns: COLONNE, rows: RIGHE,
    sort: { column: 'giri', direction: 'ascending' },
  });
  const freccia = trova(t.element, (e) => e.className === 'talos-table__arrow' && e.textContent);
  assert.equal(freccia.textContent, '↑');
  assert.equal(freccia.getAttribute('aria-hidden'), 'true');
});

test('TABLE-06 premere una colonna chiede l\'ordinamento e lo annuncia', () => {
  const chiesti = [];
  const detti = [];
  const t = createDataTable({
    document: doc(), caption: 'Sessioni', columns: COLONNE, rows: RIGHE,
    sort: { column: 'giri', direction: 'ascending' },
    onSort: (o) => chiesti.push(o),
    announce: (m) => detti.push(m),
  });
  const bottoni = tutti(t.element, (e) => e.tagName === 'BUTTON');
  bottoni[0].lancia('click', {});
  assert.deepEqual(chiesti, [{ column: 'giri', direction: 'descending' }]);
  assert.deepEqual(detti, ['Giri, decrescente']);
  bottoni[1].lancia('click', {});
  assert.deepEqual(chiesti[1], { column: 'costo', direction: 'ascending' });
});

test('TABLE-07 AL CONTRARIO didascalia, colonne, verso e colonna inesistente non passano', () => {
  assert.throws(() => createDataTable({ document: doc(), columns: COLONNE }), /richiede una didascalia/);
  assert.throws(() => createDataTable({ document: doc(), caption: 'x', columns: [] }), /almeno una colonna/);
  assert.throws(() => createDataTable({ document: doc(), caption: 'x', columns: COLONNE, sort: { column: 'giri', direction: 'a caso' } }), /verso dell'ordinamento non valido/);
  assert.throws(() => createDataTable({ document: doc(), caption: 'x', columns: COLONNE, sort: { column: 'inesistente', direction: 'ascending' } }), /colonna che non esiste/);
  assert.throws(() => createDataTable({ document: doc(), caption: 'x', columns: [{ id: 'a' }] }), /id e label/);
});

test('TABLE-08 una cella può essere un elemento (una misura), non solo testo', () => {
  const d = doc();
  const misura = d.createElement('span');
  misura.textContent = '41,2k';
  const t = createDataTable({
    document: d, caption: 'Sessioni', columns: COLONNE,
    rows: [{ cells: { sessione: 'W1-02', giri: misura, costo: '' } }],
  });
  assert.equal(trova(t.element, (e) => e === misura), misura);
});

test('TABLE-09 gli ascoltatori dell\'ordinamento si staccano dopo destroy', () => {
  const chiesti = [];
  const t = createDataTable({ document: doc(), caption: 'x', columns: COLONNE, rows: RIGHE, onSort: (o) => chiesti.push(o) });
  const bottone = tutti(t.element, (e) => e.tagName === 'BUTTON')[0];
  t.destroy();
  bottone.lancia('click', {});
  assert.deepEqual(chiesti, []);
});

/* ---------------- CheckCard ---------------- */

test('CHECK-01 ⭐ la severità è una PAROLA, non solo una striscia colorata', () => {
  const c = createCheckCard({ document: doc(), severity: 'info', severityLabel: 'nota', title: 'Spazio occupato', text: 'App 318 MB.' });
  const badge = trova(c.element, (e) => String(e.className).includes('talos-badge'));
  assert.equal(badge.textContent, 'nota');
  assert.equal(trova(c.element, (e) => e.className === 'talos-check-card__stripe').getAttribute('aria-hidden'), 'true');
});

test('CHECK-02 ⭐ AL CONTRARIO un avviso senza rimedio non si monta', () => {
  assert.throws(() => createCheckCard({
    document: doc(), severity: 'warning', severityLabel: 'avviso', title: 'Cartella enorme', text: '48.213 file.',
  }), /richiede un rimedio/);
  assert.throws(() => createCheckCard({
    document: doc(), severity: 'danger', severityLabel: 'guasto', title: 'Server giù',
  }), /richiede un rimedio/);
});

test('CHECK-03 una nota e un ok possono non avere rimedio: non c\'è niente da fare', () => {
  const ok = createCheckCard({ document: doc(), severity: 'ok', severityLabel: 'ok', title: 'Suite di verifica', text: '1.565 su 1.565.' });
  assert.equal(trova(ok.element, (e) => e.className === 'talos-check-card__actions').hidden, true);
});

test('CHECK-04 un avviso col suo rimedio si monta, e il rimedio si vede', () => {
  const d = doc();
  const bottone = d.createElement('button');
  const c = createCheckCard({
    document: d, severity: 'warning', severityLabel: 'avviso', title: 'Cartella enorme',
    text: '48.213 file osservati.', actions: [bottone],
  });
  const azioni = trova(c.element, (e) => e.className === 'talos-check-card__actions');
  assert.equal(azioni.hidden, false);
  assert.equal(azioni.children[0], bottone);
});

test('CHECK-05 AL CONTRARIO severità inventata, titolo mancante o severità senza nome', () => {
  assert.throws(() => createCheckCard({ document: doc(), severity: 'grave', severityLabel: 'x', title: 't' }), /severita' non valida/);
  assert.throws(() => createCheckCard({ document: doc(), severity: 'ok', severityLabel: 'ok' }), /richiede un titolo/);
  assert.throws(() => createCheckCard({ document: doc(), severity: 'ok', title: 't' }), /NOME della severita/);
});

/* ---------------- SettingRow ---------------- */

test('SETTING-01 ⭐ AL CONTRARIO una riga senza PORTATA non si monta', () => {
  const d = doc();
  assert.throws(() => createSettingRow({
    document: d, label: 'Modello principale', control: d.createElement('select'),
  }), /richiede la PORTATA/);
});

test('SETTING-02 la portata si legge accanto all\'etichetta', () => {
  const d = doc();
  const r = createSettingRow({
    document: d, label: 'Visione (immagini)', scope: 'vale dalle sessioni nuove', control: d.createElement('select'),
  });
  assert.equal(trova(r.element, (e) => e.className === 'talos-setting__label').textContent, 'Visione (immagini)');
  assert.equal(trova(r.element, (e) => e.className === 'talos-setting__scope').textContent, 'vale dalle sessioni nuove');
});

test('SETTING-03 il controllo prende il nome dall\'etichetta VISIBILE', () => {
  const d = doc();
  const select = d.createElement('select');
  const r = createSettingRow({ document: d, label: 'Tema TALOS', scope: 'vale da subito', control: select });
  const etichetta = trova(r.element, (e) => e.className === 'talos-setting__label');
  assert.equal(select.getAttribute('aria-labelledby'), etichetta.id);
  assert.equal(select.getAttribute('aria-label'), null);
});

test('SETTING-04 AL CONTRARIO senza etichetta o senza controllo non si monta', () => {
  const d = doc();
  assert.throws(() => createSettingRow({ document: d, scope: 'vale da subito', control: d.createElement('select') }), /richiede un'etichetta/);
  assert.throws(() => createSettingRow({ document: d, label: 'x', scope: 'vale da subito' }), /richiede il suo controllo/);
});
