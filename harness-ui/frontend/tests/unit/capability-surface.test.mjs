import assert from 'node:assert/strict';
import test from 'node:test';

import { createCapabilitySurface } from '../../src/app/surfaces/capability.js';
import { attrezziSenzaNome, corrispondeARicerca, nomeUmanoAttrezzo } from '../../src/app/nomi-attrezzi.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = {
  regionLabel: 'Capability',
  searchLabel: 'Cerca fra le capability',
  sections: [
    { id: 'attrezzi', label: 'Attrezzi', countUnit: 'attrezzi', emptyLabel: 'Nessun attrezzo offerto.' },
    { id: 'skill', label: 'Skill', countUnit: 'skill', emptyLabel: 'Nessuna skill installata.' },
    { id: 'mcp', label: 'Connettori', countUnit: 'connettori' },
  ],
  unnamed: 'Attrezzo senza nome ancora',
  unnamedNote: '{n} attrezzi non hanno ancora un nome leggibile.',
  offered: 'offerto a questo modello',
  notOffered: 'NON offerto a questo modello',
  offeredUnknown: 'non sappiamo se arriva a questo modello',
  notLoaded: 'Non ancora caricato.',
  noResults: 'Nessun risultato per «{q}».',
  empty: 'Vuoto.',
};

const ATTREZZI = [
  { id: 'web_search', enabled: true },
  { id: 'shell', enabled: true },
  { id: 'tool_create', enabled: false },
  { id: 'attrezzo_nuovissimo', enabled: false },
];

const monta = (extra = {}, onToggle) => createCapabilitySurface({
  documentObj: fakeDocument(), labels: { ...ETICHETTE, ...extra }, testId: 'cap', onToggle,
});
const pannelloDi = (el, id) => {
  const tab = el.querySelector(`[data-tab-id="${id}"]`);
  return el.querySelector(`[id="${tab.getAttribute('aria-controls')}"]`);
};
const voci = (el, sezione) => pannelloDi(el, sezione).querySelectorAll('[data-capability-id]');

/* --- La mappa dei nomi, da sola --- */

test('NOMI-01 ⭐⭐ un id sconosciuto torna null, NON l\'id stesso', () => {
  assert.equal(nomeUmanoAttrezzo('web_search'), 'ricerca sul web');
  // ⛔ Restituire l'id sarebbe comodo e romperebbe la regola in silenzio
  // proprio nel caso in cui serve saperlo.
  assert.equal(nomeUmanoAttrezzo('attrezzo_nuovissimo'), null);
  assert.equal(nomeUmanoAttrezzo(undefined), null);
});

test('NOMI-02 ⭐ un catalogo di traduzione sovrascrive i valori, non le chiavi', () => {
  assert.equal(nomeUmanoAttrezzo('web_search', { web_search: 'web search' }), 'web search');
  assert.equal(nomeUmanoAttrezzo('shell', { web_search: 'web search' }), 'comando nel terminale');
});

test('NOMI-03 ⭐⭐ la ricerca trova per nome umano E per id tecnico', () => {
  assert.equal(corrispondeARicerca('web_search', 'ricerca sul web'), true);
  // Chi ha letto una ricevuta scrive questo, non «ricerca sul web».
  assert.equal(corrispondeARicerca('web_search', 'web_search'), true);
  assert.equal(corrispondeARicerca('web_search', 'shell'), false);
  assert.equal(corrispondeARicerca('web_search', ''), true, 'una ricerca vuota non filtra niente');
});

test('NOMI-04 gli attrezzi senza nome si contano: è un debito, non un dettaglio', () => {
  assert.deepEqual(attrezziSenzaNome(['web_search', 'attrezzo_nuovissimo', 'altro_ignoto']), ['attrezzo_nuovissimo', 'altro_ignoto']);
  assert.deepEqual(attrezziSenzaNome(['web_search', 'shell']), []);
});

/* --- L'inventario --- */

test('CAP-01 ⭐⭐ a schermo si legge il nome umano, e il grezzo è un dettaglio SECONDARIO', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  const riga = voci(c.element, 'attrezzi')[0];
  const titolo = trova(riga, (e) => e.className === 'talos-list-row__title');
  const sotto = trova(riga, (e) => e.className === 'talos-list-row__sub');
  assert.equal(testoDi(titolo), 'ricerca sul web');
  assert.doesNotMatch(testoDi(titolo), /web_search/, 'il nome tecnico non è mai il titolo');
  assert.match(testoDi(sotto), /web_search/, 'ma resta leggibile e copiabile');
});

test('CAP-02 ⭐⭐ un attrezzo senza nome NON scivola a schermo col suo id: si dichiara', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  const riga = pannelloDi(c.element, 'attrezzi').querySelector('[data-capability-id="attrezzo_nuovissimo"]');
  assert.equal(riga.dataset.senzaNome, 'si');
  assert.equal(testoDi(trova(riga, (e) => e.className === 'talos-list-row__title')), 'Attrezzo senza nome ancora');
  // E il debito si conta, con i nomi dentro il title per chi deve ripararlo.
  const nota = trova(pannelloDi(c.element, 'attrezzi'), (e) => e.className === 'talos-capability__note');
  assert.match(testoDi(nota), /1 attrezzi non hanno ancora un nome/);
  assert.equal(nota.getAttribute('title'), 'attrezzo_nuovissimo');
});

test('CAP-03 ⭐⭐ si cerca per nome umano E per id tecnico', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  c.update({ query: 'terminale' });
  assert.deepEqual(voci(c.element, 'attrezzi').map((v) => v.dataset.capabilityId), ['shell']);
  c.update({ query: 'web_search' });
  assert.deepEqual(voci(c.element, 'attrezzi').map((v) => v.dataset.capabilityId), ['web_search']);
});

test('CAP-04 ⭐ scrivere nel campo filtra davvero, non solo aggiornando le props da fuori', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  const campo = trova(c.element, (e) => e.tagName === 'INPUT');
  campo.value = 'tool_create';
  campo.lancia('input', { target: campo });
  assert.deepEqual(voci(c.element, 'attrezzi').map((v) => v.dataset.capabilityId), ['tool_create']);
});

test('CAP-05 ⭐ «nessun risultato» e «sezione vuota» sono due frasi diverse', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  c.update({ query: 'niente-che-esiste' });
  assert.match(testoDi(pannelloDi(c.element, 'attrezzi')), /Nessun risultato per «niente-che-esiste»/);
  c.update({ query: '', items: { attrezzi: [] } });
  assert.match(testoDi(pannelloDi(c.element, 'attrezzi')), /Nessun attrezzo offerto/);
});

test('CAP-06 ⭐⭐ O-06: tre stati sull\'offerta al modello, non due', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  // Senza modello non si dice niente: non è «non offerto».
  assert.equal(voci(c.element, 'attrezzi')[0].dataset.offerta, undefined);

  c.update({ model: { id: 'gemma-3', tools: ['shell'] } });
  const perId = Object.fromEntries(voci(c.element, 'attrezzi').map((v) => [v.dataset.capabilityId, v]));
  assert.equal(perId.shell.dataset.offerta, 'true');
  assert.equal(perId.web_search.dataset.offerta, 'false');
  assert.match(testoDi(perId.web_search), /NON offerto a questo modello/);

  // ⛔ Un modello di cui non conosciamo gli attrezzi NON diventa «non offerto».
  c.update({ model: { id: 'ignoto', tools: null } });
  assert.equal(voci(c.element, 'attrezzi')[0].dataset.offerta, undefined);
  assert.match(testoDi(voci(c.element, 'attrezzi')[0]), /non sappiamo se arriva/);
});

test('CAP-07 una sezione non caricata dice che non è caricata, non che è vuota', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  assert.match(testoDi(pannelloDi(c.element, 'skill')), /Non ancora caricato/);
  assert.doesNotMatch(testoDi(pannelloDi(c.element, 'skill')), /Nessuna skill installata/);
});

test('CAP-08 le schede portano il conteggio delle voci', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI, skill: [] } });
  const conto = trova(c.element.querySelector('[data-tab-id="attrezzi"]'), (e) => e.className === 'talos-tabs__count');
  assert.equal(testoDi(conto), '4 attrezzi');
  assert.equal(testoDi(trova(c.element.querySelector('[data-tab-id="skill"]'), (e) => e.className === 'talos-tabs__count')), '0 skill');
});

test('CAP-09 senza onToggle le righe NON sembrano premibili', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  const riga = trova(voci(c.element, 'attrezzi')[0], (e) => String(e.className).includes('talos-list-row'));
  assert.equal(riga.tagName, 'DIV', 'una riga non premibile che sembra premibile è la bugia più comune degli elenchi');
});

test('CAP-10 con onToggle la riga è una scelta vera e passa l\'ID TECNICO a chi decide', () => {
  const scelte = [];
  const c = monta({}, (sezione, voce) => scelte.push([sezione, voce.id]));
  c.update({ items: { attrezzi: ATTREZZI } });
  const riga = trova(voci(c.element, 'attrezzi')[0], (e) => e.tagName === 'BUTTON');
  assert.equal(riga.getAttribute('role'), 'option');
  riga.lancia('click', { target: riga });
  // ⛔ Verso il resto del sistema viaggia l'id, mai il nome umano: è il
  // contratto col kernel, e questo modulo è unidirezionale.
  assert.deepEqual(scelte, [['attrezzi', 'web_search']]);
});

test('CAP-11 AL CONTRARIO dopo destroy scrivere nel campo non ridisegna più', () => {
  const c = monta();
  c.update({ items: { attrezzi: ATTREZZI } });
  const campo = trova(c.element, (e) => e.tagName === 'INPUT');
  assert.equal(c.destroy(), true);
  assert.equal(c.destroy(), false);
  const prima = testoDi(c.element);
  campo.value = 'shell';
  campo.lancia('input', { target: campo });
  assert.equal(testoDi(c.element), prima);
});

test('CAP-12 AL CONTRARIO senza documento, etichette o sezioni valide non si monta', () => {
  assert.throws(() => createCapabilitySurface({ labels: ETICHETTE }), /dipendenze capability mancanti/);
  assert.throws(() => createCapabilitySurface({ documentObj: fakeDocument(), labels: { sections: [] } }), /richiede le sue etichette/);
  assert.throws(
    () => createCapabilitySurface({ documentObj: fakeDocument(), labels: { ...ETICHETTE, sections: [{ id: 'inventata', label: 'X' }] } }),
    /nessuna sezione valida/,
  );
});
