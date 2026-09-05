import assert from 'node:assert/strict';
import test from 'node:test';

import { createSettingsSurface } from '../../src/app/surfaces/settings.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';
import { fakeDocument, testoDi, trova } from './fake-dom.mjs';

const ETICHETTE = {
  regionLabel: 'Impostazioni',
  save: 'Salva',
  discard: 'Scarta le modifiche',
  unsaved: 'Hai modifiche non salvate.',
  scopes: { auto: 'vale da subito', explicit: 'vale dalle sessioni nuove' },
  sections: [
    {
      id: 'aspetto',
      label: 'Aspetto',
      saving: 'auto',
      rows: [
        { id: 'temaChiaro', type: 'switch', label: 'Tema chiaro', scope: 'vale da subito' },
        { id: 'animazioni', type: 'switch', label: 'Animazioni', scope: 'vale da subito' },
      ],
    },
    {
      id: 'fornitore',
      label: 'Fornitore',
      saving: 'explicit',
      rows: [
        { id: 'chiaveApi', type: 'password', label: 'Chiave API', scope: 'vale dalle sessioni nuove' },
        { id: 'modello', type: 'select', label: 'Modello', scope: 'vale dalle sessioni nuove', options: [{ value: 'opus', label: 'Opus 5' }, { value: 'sonnet', label: 'Sonnet 5' }] },
      ],
    },
  ],
};

function store(settings = {}) {
  const s = createStore({ initialState: createInitialState(), reducer });
  s.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: [], projects: [] } });
  return s;
}
const monta = (s, extra = {}, handlers = {}) => createSettingsSurface({
  documentObj: fakeDocument(), store: s, labels: { ...ETICHETTE, ...extra }, testId: 'settings', ...handlers,
});
const sezione = (el, id) => el.querySelector(`[data-sezione="${id}"]`);

/* --- La regola: non si mescolano i due modi di salvare --- */

test('IMP-01 ⭐⭐⭐ una sezione «automatica» con un campo da compilare si RIFIUTA, e dice quale riga', () => {
  const s = store();
  // ⛔ Un valore scritto non deve partire prima che la persona lo invii — e
  // qui i campi di testo contengono chiavi di fornitore.
  assert.throws(
    () => monta(s, {
      sections: [{
        id: 'misto', label: 'Misto', saving: 'auto',
        rows: [{ id: 'temaChiaro', type: 'switch', label: 'Tema', scope: 'x' }, { id: 'chiaveApi', type: 'password', label: 'Chiave', scope: 'x' }],
      }],
    }),
    /si salva da sola ma contiene «chiaveApi»/,
  );
});

test('IMP-02 ⭐⭐ una sezione che non dichiara COME si salva non si monta', () => {
  const s = store();
  assert.throws(
    () => monta(s, { sections: [{ id: 'x', label: 'X', saving: undefined, rows: [] }] }),
    /deve dichiarare come si salva/,
  );
  assert.throws(
    () => monta(s, { sections: [{ id: 'x', label: 'X', saving: 'ogni-tanto', rows: [] }] }),
    /deve dichiarare come si salva/,
  );
});

test('IMP-03 ⭐⭐ solo le sezioni esplicite hanno «Salva»: sotto un interruttore sarebbe una bugia', () => {
  const s = store();
  const i = monta(s);
  // ⛔ Un «Salva» sotto una sezione che si salva da sola direbbe a chi guarda
  // che le sue scelte NON sono ancora al sicuro: il contrario del vero.
  assert.equal(sezione(i.element, 'aspetto').querySelector('[data-testid="settings-save-aspetto"]'), null);
  assert.notEqual(sezione(i.element, 'fornitore').querySelector('[data-testid="settings-save-fornitore"]'), null);
});

test('IMP-04 il modo di salvataggio resta leggibile dal DOM, non si deduce', () => {
  const s = store();
  const i = monta(s);
  assert.equal(sezione(i.element, 'aspetto').dataset.salvataggio, 'auto');
  assert.equal(sezione(i.element, 'fornitore').dataset.salvataggio, 'explicit');
});

/* --- Modifiche non salvate --- */

test('IMP-05 ⭐ senza modifiche «Salva» è spento e non c\'è nessun avviso', () => {
  const s = store();
  const i = monta(s);
  const salva = sezione(i.element, 'fornitore').querySelector('[data-testid="settings-save-fornitore"]');
  assert.equal(salva.disabled, true);
  assert.equal(testoDi(trova(sezione(i.element, 'fornitore'), (e) => e.className === 'talos-settings__dirty')), '');
});

test('IMP-06 ⭐⭐ con modifiche non salvate lo si VEDE, «Salva» si accende e compare «Scarta»', () => {
  const s = store();
  const i = monta(s);
  i.update({ dirty: { fornitore: true } });
  const blocco = sezione(i.element, 'fornitore');
  assert.equal(testoDi(trova(blocco, (e) => e.className === 'talos-settings__dirty')), 'Hai modifiche non salvate.');
  assert.equal(blocco.querySelector('[data-testid="settings-save-fornitore"]').disabled, false);
  assert.notEqual(blocco.querySelector('[data-testid="settings-discard-fornitore"]'), null);
});

test('IMP-07 premere Salva e Scarta avvisa chi decide, con la SEZIONE', () => {
  const salvate = [];
  const scartate = [];
  const s = store();
  const i = monta(s, {}, { onSave: (id) => salvate.push(id), onDiscard: (id) => scartate.push(id) });
  i.update({ dirty: { fornitore: true } });
  const blocco = sezione(i.element, 'fornitore');
  const salva = blocco.querySelector('[data-testid="settings-save-fornitore"]');
  salva.lancia('click', { target: salva });
  const scarta = blocco.querySelector('[data-testid="settings-discard-fornitore"]');
  scarta.lancia('click', { target: scarta });
  assert.deepEqual(salvate, ['fornitore']);
  assert.deepEqual(scartate, ['fornitore']);
});

/* --- I controlli --- */

test('IMP-08 ⭐ un interruttore riporta il suo cambio DICENDO che la sua sezione si salva da sola', () => {
  const cambi = [];
  const s = store();
  const i = monta(s, {}, { onChange: (id, valore, meta) => cambi.push([id, valore, meta.saving]) });
  const interruttore = trova(sezione(i.element, 'aspetto'), (e) => e.getAttribute('role') === 'switch' || e.type === 'checkbox');
  interruttore.lancia('click', { target: interruttore });
  assert.equal(cambi.length, 1);
  assert.equal(cambi[0][0], 'temaChiaro');
  assert.equal(cambi[0][2], 'auto', 'chi riceve il cambio deve sapere se è già al sicuro');
});

test('IMP-09 un campo scrive il suo valore e porta la sua sezione come esplicita', () => {
  const cambi = [];
  const s = store();
  const i = monta(s, {}, { onChange: (id, valore, meta) => cambi.push([id, valore, meta.saving]) });
  // ⛔ Il `testId` di Field sta sul CONTENITORE: l'evento va sull'input vero.
  const campo = sezione(i.element, 'fornitore').querySelector('[data-testid="settings-chiaveApi"]').querySelector('input');
  campo.value = 'sk-prova';
  campo.lancia('input', { target: campo });
  assert.deepEqual(cambi, [['chiaveApi', 'sk-prova', 'explicit']]);
});

test('IMP-10 ⭐⭐ un errore di validazione si vede, e il campo si dichiara NON valido', () => {
  const s = store();
  const i = monta(s);
  i.update({ validation: { chiaveApi: 'La chiave deve iniziare con «sk-».' } });
  const contenitore = sezione(i.element, 'fornitore').querySelector('[data-testid="settings-chiaveApi"]');
  assert.match(testoDi(contenitore), /deve iniziare con «sk-»/);
  const input = contenitore.querySelector('input');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  // ⛔ Il messaggio è LEGATO al campo, e il legame esiste da prima dell'errore.
  const messaggio = contenitore.querySelector('.talos-field__error');
  assert.equal(input.getAttribute('aria-describedby'), messaggio.id);
});

test('IMP-10b ⭐⭐ senza errore il campo NON si dichiara invalido, ma il legame resta', () => {
  const s = store();
  const i = monta(s);
  const contenitore = sezione(i.element, 'fornitore').querySelector('[data-testid="settings-chiaveApi"]');
  const input = contenitore.querySelector('input');
  // ⛔ Un `aria-invalid` dichiarato sempre renderebbe il campo permanentemente
  // sbagliato per chi ascolta.
  assert.equal(input.getAttribute('aria-invalid'), null);
  const messaggio = contenitore.querySelector('.talos-field__error');
  assert.equal(messaggio.hidden, true);
  assert.equal(input.getAttribute('aria-describedby'), messaggio.id, 'il legame esiste anche a campo pulito');
});

test('IMP-11 ogni riga dichiara la sua PORTATA: quando la modifica morde', () => {
  const s = store();
  const i = monta(s);
  assert.match(testoDi(sezione(i.element, 'aspetto')), /vale da subito/);
  assert.match(testoDi(sezione(i.element, 'fornitore')), /vale dalle sessioni nuove/);
});

test('IMP-12 AL CONTRARIO dopo destroy lo store non la ridisegna più', () => {
  const s = store();
  const i = monta(s);
  assert.equal(i.destroy(), true);
  assert.equal(i.destroy(), false);
  // `destroy` smonta i componenti; il verso che conta è che un cambio nello
  // store non li rimonti.
  const prima = testoDi(i.element);
  s.dispatch({ type: ACTIONS.LAYOUT_UPDATED, payload: { values: { theme: 'light' } } });
  assert.equal(testoDi(i.element), prima, 'una superficie distrutta non si ridisegna');
});

test('IMP-13 AL CONTRARIO senza store, documento o sezioni non si monta', () => {
  const s = store();
  assert.throws(() => createSettingsSurface({ documentObj: fakeDocument(), labels: ETICHETTE }), /dipendenze impostazioni mancanti/);
  assert.throws(() => createSettingsSurface({ store: s, labels: ETICHETTE }), /dipendenze impostazioni mancanti/);
  assert.throws(() => createSettingsSurface({ documentObj: fakeDocument(), store: s, labels: { sections: [] } }), /richiedono le loro etichette/);
});
