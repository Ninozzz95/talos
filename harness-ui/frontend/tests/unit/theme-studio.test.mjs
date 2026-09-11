import test from 'node:test';
import assert from 'node:assert/strict';
import { nomiTemi, leggiSemiTemi, fondoDelTema, temaChiaro, impostaAspetto, aspettoCorrente, SEMI } from '../../src/components/theme-studio.js';
import { azioneAnnulla, DURATA_CON_ANNULLA, tonoDaTitolo } from '../../src/components/toast.js';

/*
 * Lotto F, 11/09/2026 — lo studio dei temi.
 * ⛔ Il cuore della prova è che NON esista una quindicesima copia della tavolozza: i nomi vengono
 *   dal contratto dei controlli, i colori dal foglio che dipinge la app. Qui si prova che i due
 *   lettori funzionano, e che quando il foglio non si legge lo studio NON inventa un colore.
 */

test('STUDIO-NOMI: i temi sono quelli del contratto delle Impostazioni, non un elenco a parte', () => {
  const temi = nomiTemi();
  assert.equal(temi.length, 14, 'i temi dichiarati dal campo themePresetSelect');
  assert.deepEqual(temi.find((t) => t.id === 'calm'), { id: 'calm', nome: 'Calm' });
  assert.ok(temi.every((t) => t.id && t.nome), 'ogni tema ha id e nome');
  // ⛔ verso contrario: un contratto senza quel campo non inventa quattordici temi
  assert.deepEqual(nomiTemi([{ id: 'altro', opzioni: [['x', 'X']] }]), []);
});

function foglioFinto(regole) {
  return { cssRules: regole.map(([selectorText, decl]) => ({ selectorText, style: { getPropertyValue: (k) => decl[k] || '' } })) };
}

test('STUDIO-SEMI: i colori si leggono dalle regole dei temi, e un foglio illeggibile non ferma gli altri', () => {
  const ostile = { get cssRules() { throw new Error('foglio di un’altra origine'); } };
  const doc = {
    styleSheets: [
      ostile,
      foglioFinto([
        [':root[data-talos-theme="forge"]', { [SEMI.accento]: '#c98b32', [SEMI.fondo]: '#080b11', [SEMI.linea]: '#27313e' }],
        [':root[data-talos-theme="paper"]', { [SEMI.accento]: '#a96617', [SEMI.fondo]: '#f8fafc', [SEMI.fondoChiaro]: '#f8fafc' }],
        [':root[data-talos-theme="forge"]:not([data-theme="light"])', { [SEMI.accento]: '#ffffff' }], // non è la regola dei semi
        ['.talos-card', { [SEMI.accento]: '#000000' }],
      ]),
    ],
  };
  const semi = leggiSemiTemi(doc);
  assert.deepEqual([...semi.keys()], ['forge', 'paper']);
  assert.equal(semi.get('forge').accento, '#c98b32');
  assert.equal(semi.get('paper').fondoChiaro, '#f8fafc');
  // ⛔ verso contrario: senza fogli non si inventa niente, e la mappa resta vuota
  assert.equal(leggiSemiTemi({ styleSheets: [] }).size, 0);
  assert.equal(leggiSemiTemi({}).size, 0);
});

test('STUDIO-FONDO: il chiaro prende il seme chiaro, lo scuro quello scuro, e chi non ce l’ha non resta senza', () => {
  const chiaro = { accento: '#a96617', fondo: '#f8fafc', fondoChiaro: '#f8fafc', fondoScuro: 'color-mix(in srgb, #a96617 10%, #06080d)' };
  const scuro = { accento: '#c98b32', fondo: '#080b11' };
  assert.equal(fondoDelTema(chiaro, 'light'), '#f8fafc');
  assert.equal(fondoDelTema(chiaro, 'dark'), 'color-mix(in srgb, #a96617 10%, #06080d)');
  assert.equal(fondoDelTema(scuro, 'dark'), '#080b11');
  assert.equal(fondoDelTema(scuro, 'light'), '#080b11'); // non ha un seme chiaro: si dice quello che c'è
  assert.equal(fondoDelTema(null, 'dark'), '');
  assert.equal(temaChiaro(chiaro), true);
  assert.equal(temaChiaro(scuro), false);
  assert.equal(temaChiaro(undefined), false);
});

function controlloFinto(tipo, valore = '') {
  const eventi = [];
  return {
    type: tipo, value: valore, checked: false, eventi,
    dispatchEvent: (e) => { eventi.push(e.type); return true; },
  };
}

test('STUDIO-APPLICA: un `<select>` riceve `change` (non `input`), un cursore riceve `input`', () => {
  const select = controlloFinto('select-one', 'calm');
  const range = controlloFinto('range', '50');
  const doc = { getElementById: (id) => ({ themePresetSelect: select, motionSpeedRange: range })[id] || null };
  assert.equal(impostaAspetto('themePresetSelect', 'aurora', doc), true);
  assert.equal(select.value, 'aurora');
  /* ⛔ È IL PUNTO: il mockup manda `input` anche ai select, e `legacy/app.js` ascolta `change`.
     Con l'evento sbagliato il tema non si applicherebbe e nessuno se ne accorgerebbe subito. */
  assert.deepEqual(select.eventi, ['change']);
  assert.equal(impostaAspetto('motionSpeedRange', '80', doc), true);
  assert.deepEqual(range.eventi, ['input']);
  // ⛔ verso contrario: un controllo che non esiste non fa finta di essere stato mosso
  assert.equal(impostaAspetto('controlloCheNonEsiste', 'x', doc), false);
});

test('STUDIO-APPLICA-RIPIEGO: se manca l’id legacy si usa quello generato dal mockup', () => {
  const generato = controlloFinto('select-one', 'calm');
  const doc = { getElementById: (id) => (id === 'setting-themePresetSelect' ? generato : null) };
  assert.equal(impostaAspetto('themePresetSelect', 'noir', doc), true);
  assert.equal(generato.value, 'noir');
});

test('STUDIO-CORRENTE: tema e modo si chiedono alla radice, non a una variabile nostra', () => {
  const doc = {
    documentElement: { getAttribute: (k) => ({ 'data-talos-theme': 'ember', 'data-theme': 'light' })[k] || null },
    getElementById: (id) => (id === 'colorModeSelect' ? { value: 'dark' } : null),
  };
  assert.deepEqual(aspettoCorrente(doc), { tema: 'ember', modo: 'dark' });
  // senza attributi e senza controlli: il default dichiarato, non «undefined» a schermo
  const vuoto = { documentElement: { getAttribute: () => null }, getElementById: () => null };
  assert.deepEqual(aspettoCorrente(vuoto), { tema: 'calm', modo: 'system' });
});

test('TOAST-ANNULLA: l’azione reversibile porta con sé il modo di disfarla, e resta 11 secondi', () => {
  let disfatto = 0;
  const opzioni = azioneAnnulla(() => { disfatto += 1; });
  assert.equal(opzioni.durata, DURATA_CON_ANNULLA);
  assert.equal(opzioni.durata, 11_000);
  assert.equal(opzioni.tono, 'riuscito');
  assert.equal(opzioni.azione.etichetta, 'Annulla');
  opzioni.azione.esegui();
  assert.equal(disfatto, 1);
  // il titolo «Rinominato» resta un esito riuscito anche passando dal riconoscitore di toni
  assert.equal(tonoDaTitolo('Rinominato'), 'riuscito');
});
