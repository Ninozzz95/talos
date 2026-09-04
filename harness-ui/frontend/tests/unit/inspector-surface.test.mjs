import assert from 'node:assert/strict';
import test from 'node:test';

import { createInspectorSurface } from '../../src/app/surfaces/inspector.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = {
  regionLabel: 'Dettagli della sessione',
  unmeasured: 'non misurato',
  tabs: [
    { id: 'contesto', label: 'Contesto' },
    { id: 'file', label: 'File toccati' },
    { id: 'sottoagenti', label: 'Sotto-agenti' },
    { id: 'processi', label: 'Processi' },
  ],
  contextEmpty: 'Nessun contesto da mostrare.',
  filesEmpty: 'Questo giro non ha toccato file.',
  subagentsEmpty: 'Nessun sotto-agente in questo giro.',
  processesUnknown: 'Registro dei processi non ancora caricato.',
  processesNone: 'Nessun processo registrato.',
  processesEmpty: 'Questa sessione non ha lanciato processi.',
  stallNotEvaluated: 'Il silenzio non è stato valutato:',
  stallKinds: { silenzio: 'Fermo da un po’', 'giro-a-vuoto': 'Sta rifacendo la stessa cosa' },
  stallAnnounce: '{n} avvisi nel registro dei processi',
  stallCountUnit: 'avvisi',
  origins: { agente: 'lanciato dall’agente', utente: 'lanciato da te' },
  runningForUnit: 's finora',
  reasons: { 'non-registrato': 'questa sessione non ha eventi registrati' },
};

const PROCESSO = {
  toolCallId: 'tc1',
  attrezzo: 'shell',
  origine: 'agente',
  comando: 'npm test',
  motivoComandoAssente: null,
  descrizione: null,
  durataMs: 2400,
  inCorsoDaMs: null,
  motivoTempoAssente: null,
  esito: 'riuscito',
  codiceUscita: 0,
};

function store() {
  const s = createStore({ initialState: createInitialState(), reducer });
  s.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: [], projects: [] } });
  return s;
}
const monta = (s, extra = {}) => createInspectorSurface({
  documentObj: fakeDocument(), store: s, labels: { ...ETICHETTE, ...extra }, testId: 'inspector',
});
const schede = (el) => el.querySelectorAll('[role="tab"]');
const pannelloDi = (el, id) => {
  const tab = el.querySelector(`[data-tab-id="${id}"]`);
  return el.querySelector(`[id="${tab.getAttribute('aria-controls')}"]`);
};

/* --- W1-02: il registro dei processi trova finalmente il suo posto --- */

test('ISP-01 ⭐ ogni processo porta comando, ORIGINE e durata misurata', () => {
  const s = store();
  const i = monta(s);
  i.update({ processes: { registrato: true, processi: [PROCESSO], guardia: null } });
  const pannello = pannelloDi(i.element, 'processi');
  const riga = trova(pannello, (e) => String(e.className).includes('talos-list-row'));
  assert.match(testoDi(riga), /npm test/);
  assert.match(testoDi(riga), /lanciato dall’agente/, 'chi ha lanciato il comando è parte della riga, non un dettaglio');
  assert.match(testoDi(riga), /2,4 s/);
});

test('ISP-02 ⭐ un processo ancora in corso dice DA QUANTO, che non è «durata ignota»', () => {
  const s = store();
  const i = monta(s);
  i.update({
    processes: {
      registrato: true,
      processi: [{ ...PROCESSO, durataMs: null, inCorsoDaMs: 91000, esito: 'in-corso', motivoTempoAssente: 'il processo è ancora in corso' }],
      guardia: null,
    },
  });
  const pannello = pannelloDi(i.element, 'processi');
  assert.match(testoDi(pannello), /91,0 s finora/);
  assert.equal(trova(pannello, (e) => e.className === 'talos-inspector__unmeasured'), null);
});

test('ISP-03 ⭐ senza tempi misurabili si scrive il trattino col MOTIVO, mai uno zero', () => {
  const s = store();
  const i = monta(s);
  i.update({
    processes: {
      registrato: true,
      processi: [{ ...PROCESSO, durataMs: null, inCorsoDaMs: null, motivoTempoAssente: 'gli eventi persistiti non portano un orario' }],
      guardia: null,
    },
  });
  const nm = trova(pannelloDi(i.element, 'processi'), (e) => e.className === 'talos-inspector__unmeasured');
  assert.notEqual(nm, null);
  assert.equal(nm.getAttribute('title'), 'gli eventi persistiti non portano un orario');
  assert.doesNotMatch(testoDi(nm), /0,0/);
});

test('ISP-04 ⭐⭐ i DUE stalli restano due: silenzio e giro a vuoto non si appiattiscono', () => {
  const s = store();
  const i = monta(s);
  i.update({
    processes: {
      registrato: true,
      processi: [PROCESSO],
      guardia: {
        osservata: true,
        interviene: false,
        silenzioValutabile: true,
        segnalazioni: [
          { tipo: 'silenzio', descrizione: 'Approvazione «shell rm -rf» (r1) in attesa da 240 s, soglia 120 s: il giro è vivo ma non andrà avanti finché nessuno risponde.' },
          { tipo: 'giro-a-vuoto', descrizione: 'L’attrezzo «leggi» è stato chiamato 4 volte con gli stessi argomenti e lo stesso esito.' },
        ],
      },
    },
  });
  const pannello = pannelloDi(i.element, 'processi');
  const avvisi = pannello.querySelectorAll('[data-tipo]');
  assert.deepEqual(avvisi.map((a) => a.dataset.tipo), ['silenzio', 'giro-a-vuoto']);
  // ⛔ La descrizione del motore porta CHI e DA QUANTO: si mostra, non si riassume.
  assert.match(testoDi(avvisi[0]), /r1.*240 s.*soglia 120 s/s);
  assert.match(testoDi(avvisi[0]), /Fermo da un po’/);
  assert.match(testoDi(avvisi[1]), /Sta rifacendo la stessa cosa/);
});

test('ISP-05 ⭐⭐ se la guardia NON ha potuto misurare il silenzio, lo dice: «nessun allarme» non è «non abbiamo guardato»', () => {
  const s = store();
  const i = monta(s);
  i.update({
    processes: {
      registrato: true,
      processi: [PROCESSO],
      guardia: {
        osservata: true,
        interviene: false,
        silenzioValutabile: false,
        motivoSilenzioNonValutabile: 'nessun orologio passato alla guardia',
        segnalazioni: [],
      },
    },
  });
  const nota = trova(pannelloDi(i.element, 'processi'), (e) => e.className === 'talos-inspector__note');
  assert.notEqual(nota, null);
  assert.match(testoDi(nota), /Il silenzio non è stato valutato:.*nessun orologio/);
});

/* --- Il contrassegno: il pannello nascosto non è nell'albero --- */

test('ISP-06 ⭐⭐ l\'avviso si vede sulla SCHEDA anche mentre si guarda un\'altra scheda', () => {
  const s = store();
  const i = monta(s);
  i.update({
    processes: {
      registrato: true,
      processi: [PROCESSO],
      guardia: { osservata: true, interviene: false, silenzioValutabile: true, segnalazioni: [{ tipo: 'silenzio', descrizione: 'x' }] },
    },
  });
  // La scheda attiva è la prima: il pannello «Processi» è nascosto.
  assert.equal(pannelloDi(i.element, 'processi').hidden, true);
  const schedaProcessi = i.element.querySelector('[data-tab-id="processi"]');
  const conto = trova(schedaProcessi, (e) => e.className === 'talos-tabs__count');
  assert.notEqual(conto, null, 'il contrassegno deve stare sulla scheda: il pannello nascosto esce dall’albero');
  assert.equal(testoDi(conto), '1 avvisi');
});

test('ISP-07 ⭐ la regione che parla sta FUORI dai pannelli, altrimenti tacerebbe da nascosta', () => {
  const s = store();
  const i = monta(s);
  const annuncio = trova(i.element, (e) => e.getAttribute('role') === 'status');
  assert.notEqual(annuncio, null);
  assert.equal(annuncio.closest('[role="tabpanel"]'), null, 'dentro un pannello nascosto non annuncerebbe mai');
  i.update({
    processes: { registrato: true, processi: [], guardia: { silenzioValutabile: true, segnalazioni: [{ tipo: 'silenzio', descrizione: 'x' }, { tipo: 'silenzio', descrizione: 'y' }] } },
  });
  assert.equal(testoDi(annuncio), '2 avvisi nel registro dei processi');
});

test('ISP-08 ⭐ senza avvisi la scheda non porta un contrassegno e la regione tace', () => {
  const s = store();
  const i = monta(s);
  i.update({ processes: { registrato: true, processi: [PROCESSO], guardia: { silenzioValutabile: true, segnalazioni: [] } } });
  assert.equal(trova(i.element.querySelector('[data-tab-id="processi"]'), (e) => e.className === 'talos-tabs__count'), null);
  assert.equal(testoDi(trova(i.element, (e) => e.getAttribute('role') === 'status')), '');
});

/* --- Stati vuoti onesti, e le schede --- */

test('ISP-09 ⭐ i pannelli senza dati mostrano uno stato vuoto ONESTO, mai dati finti', () => {
  const s = store();
  const i = monta(s);
  assert.match(testoDi(pannelloDi(i.element, 'file')), /Questo giro non ha toccato file/);
  assert.match(testoDi(pannelloDi(i.element, 'sottoagenti')), /Nessun sotto-agente/);
  assert.match(testoDi(pannelloDi(i.element, 'contesto')), /Nessun contesto/);
  assert.match(testoDi(pannelloDi(i.element, 'processi')), /non ancora caricato/);
});

test('ISP-10 «non registrato» porta il suo motivo, e non è «zero processi»', () => {
  const s = store();
  const i = monta(s);
  i.update({ processes: { registrato: false, processi: null, motivo: 'non-registrato' } });
  const pannello = pannelloDi(i.element, 'processi');
  assert.match(testoDi(pannello), /Nessun processo registrato/);
  assert.match(testoDi(pannello), /questa sessione non ha eventi registrati/);
});

test('ISP-11 quattro schede, una sola selezionata, e premere una cambia la vista nello store', () => {
  const s = store();
  const i = monta(s);
  const tabs = schede(i.element);
  assert.equal(tabs.length, 4);
  assert.deepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['true', 'false', 'false', 'false']);
  assert.deepEqual(tabs.map((t) => t.tabIndex), [0, -1, -1, -1]);
  i.element.querySelector('[data-tab-id="processi"]').lancia('click', { target: i.element.querySelector('[data-tab-id="processi"]') });
  assert.equal(s.getState().layout.activeDockTab, 'processi');
  assert.equal(pannelloDi(i.element, 'processi').hidden, false);
});

test('ISP-12 ⭐ una scheda salvata che non esiste più non fa esplodere la colonna: ricade sulla prima', () => {
  const s = store();
  // `activeDockTab` iniziale vale 'preview': una vista che il redesign ha tolto.
  assert.equal(s.getState().layout.activeDockTab, 'preview');
  const i = monta(s);
  assert.equal(pannelloDi(i.element, 'contesto').hidden, false);
  s.dispatch({ type: ACTIONS.LAYOUT_UPDATED, payload: { values: { activeDockTab: 'inventata' } } });
  assert.equal(pannelloDi(i.element, 'contesto').hidden, false, 'una scheda ignota non deve lasciare la colonna senza vista');
});

test('ISP-13 AL CONTRARIO dopo destroy lo store non la ridisegna più', () => {
  const s = store();
  const i = monta(s);
  i.update({ processes: { registrato: true, processi: [PROCESSO], guardia: null } });
  assert.equal(i.destroy(), true);
  assert.equal(i.destroy(), false);
  const prima = testoDi(i.element);
  s.dispatch({ type: ACTIONS.LAYOUT_UPDATED, payload: { values: { activeDockTab: 'processi' } } });
  assert.equal(testoDi(i.element), prima);
});

test('ISP-14 AL CONTRARIO senza store, documento o etichette non si monta', () => {
  const s = store();
  assert.throws(() => createInspectorSurface({ documentObj: fakeDocument(), labels: ETICHETTE }), /dipendenze inspector mancanti/);
  assert.throws(() => createInspectorSurface({ store: s, labels: ETICHETTE }), /dipendenze inspector mancanti/);
  assert.throws(() => createInspectorSurface({ documentObj: fakeDocument(), store: s, labels: { tabs: [] } }), /richiede le sue etichette/);
});
