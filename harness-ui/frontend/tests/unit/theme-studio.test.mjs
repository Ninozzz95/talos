import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nomiTemi, leggiSemiTemi, fondoDelTema, temaChiaro, impostaAspetto, aspettoCorrente, SEMI,
  DESCRIZIONI_TEMI, descrizioneTema, CONTROLLI_MIGRATI, CURSORI_SCENA, campoDi, titoloStudio,
  scenaPerAspetto, parametriScena, statoAnteprima, TESTO_STATO, valoreAspetto,
  migraRigheImpostazioni, risolviColore, normalizzaColore, caricaScene,
} from '../../src/components/theme-studio.js';
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

/* ============================================================================================
 * 12/09/2026 — lo studio diventa il POSTO di quattordici preferenze, e l'anteprima è VIVA.
 * Le prove qui sotto sono tutte NEI DUE VERSI: ogni cosa che deve succedere ha accanto la cosa
 * che NON deve succedere. Il difetto che le ha fatte nascere sta nel commento di ognuna.
 * ============================================================================================ */

test('STUDIO-PROSA: i quattordici temi hanno una scheda, e uno sconosciuto non ne inventa una', () => {
  const ids = nomiTemi().map((t) => t.id);
  assert.equal(ids.length, 14);
  for (const id of ids) {
    const scheda = DESCRIZIONI_TEMI[id];
    assert.ok(scheda, `manca la prosa di ${id}`);
    assert.ok(scheda.scena && scheda.materiale && scheda.testo, `scheda incompleta per ${id}`);
  }
  /* ⛔ La prosa è l'UNICA cosa che arriva dal mockup: non deve portarsi dietro un colore, o
     sarebbe la quindicesima tavolozza travestita da testo. */
  const tutto = JSON.stringify(DESCRIZIONI_TEMI);
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(tutto), false, 'nella prosa dei temi è comparso un colore');
  // ⛔ verso contrario: un tema che la prosa non conosce riceve una scheda onesta, non tre vuoti
  const ignoto = descrizioneTema('quindicesimo', { fondoChiaro: '#fff' });
  assert.equal(ignoto.scena, 'quindicesimo');
  assert.equal(ignoto.materiale, 'Tavolozza chiara');
  assert.match(ignoto.testo, /non ha ancora una descrizione/);
  assert.equal(descrizioneTema('quindicesimo').materiale, 'Tavolozza scura');
});

test('STUDIO-MIGRATI: nello studio passano SOLO tema e sfondo animato, non la densità né il testo chat', () => {
  assert.equal(CONTROLLI_MIGRATI.length, 14);
  for (const id of CONTROLLI_MIGRATI) assert.ok(campoDi(id), `${id} non è nel contratto dei controlli`);
  for (const id of CONTROLLI_MIGRATI) assert.equal(campoDi(id).sezione, 'appearance');
  assert.deepEqual([...CURSORI_SCENA].sort(), CONTROLLI_MIGRATI.filter((id) => campoDi(id).tipo === 'range').sort());
  /* ⛔ VERSO CONTRARIO, ed è la precisazione dell'owner del 12/09 («gli slider relativi
     dell'animazione e del tema, ovviamente»): densità delle liste, dimensione interfaccia, testo
     chat, forma del composer e le preferenze di accessibilità RESTANO nelle Impostazioni. */
  for (const id of ['uiDensitySelect', 'uiFontScaleSelect', 'chatFontScaleSelect', 'composerShapeSelect',
    'interfaceMotionToggle', 'reducedMotionToggle', 'pauseWhenHiddenToggle', 'respectDataSaverToggle',
    'motionProfileSelect', 'motionDurationRange', 'immersiveHeaderToggle']) {
    assert.equal(CONTROLLI_MIGRATI.includes(id), false, `${id} non deve passare nello studio`);
  }
});

test('STUDIO-TITOLI: nel pannello «Sfondo attivo» e «Sfondo animato» non stanno più una accanto all’altra', () => {
  /* ⛔ Visto nella prima foto: due righe vicine dicevano «Sfondo attivo» e «Sfondo animato», sotto
     un titolo che diceva già «Sfondo animato». E «Renderer» è un nome tecnico a schermo. */
  assert.equal(titoloStudio('backgroundMotionToggle'), 'Attivo dietro la chat');
  assert.equal(titoloStudio('sceneOverrideSelect'), 'Scena');
  assert.equal(titoloStudio('motionModeSelect'), 'Modo di disegno');
  // ⛔ e il contratto NON è stato toccato: nelle Impostazioni quelle righe si chiamano ancora così
  assert.equal(campoDi('backgroundMotionToggle').titolo, 'Sfondo attivo');
  assert.equal(campoDi('sceneOverrideSelect').titolo, 'Sfondo animato');
  // chi non è riscritto usa il titolo del contratto, e un id sconosciuto non diventa «undefined»
  assert.equal(titoloStudio('motionIntensityRange'), 'Intensità');
  assert.equal(titoloStudio('controlloInesistente'), 'controlloInesistente');
});

test('STUDIO-SCENA: la scena scelta vince sul tema, «segui il tema» no, e l’ignoto ricade su calm', () => {
  const disponibili = new Set(['calm', 'paper', 'noir']);
  assert.equal(scenaPerAspetto({ tema: 'paper', scena: 'noir' }, disponibili), 'noir');
  assert.equal(scenaPerAspetto({ tema: 'paper', scena: 'follow-theme' }, disponibili), 'paper');
  assert.equal(scenaPerAspetto({ tema: 'paper' }, disponibili), 'paper');
  // ⛔ verso contrario: nomi che il pacchetto non conosce non fanno disegnare niente a caso
  assert.equal(scenaPerAspetto({ tema: 'inesistente', scena: 'nemmeno-questa' }, disponibili), 'calm');
  assert.equal(scenaPerAspetto({ tema: 'paper', scena: 'nemmeno-questa' }, disponibili), 'paper');
});

test('STUDIO-PARAMETRI: i cursori si leggono dai token vivi, con i limiti del renderer', () => {
  /* ⛔ Si leggono da `--talos-motion-*` (frazioni scritte sulla radice da `applicaAspettoDesktop`)
     e non dai cursori: se un altro pezzo di app cambiasse quelle variabili, leggere il cursore
     farebbe mostrare un numero e disegnare un altro. */
  const stile = { getPropertyValue: (k) => ({ '--talos-motion-speed': '1.5', '--talos-motion-intensity': '0.42', '--talos-motion-density': '0.1' }[k] ?? '') };
  const p = parametriScena(stile);
  assert.equal(p.speed, 150);
  assert.equal(p.intensity, 42);
  assert.equal(p.density, 25, 'la densità ha un minimo dichiarato: 25');
  // ⛔ verso contrario: un token assente NON diventa 0 — vale il valore di serie del pacchetto
  assert.equal(p.contrast, 80);
  assert.equal(p.glow, 10);
  assert.equal(p.parallax, 0);
  assert.equal(Object.keys(parametriScena(null)).length, 8, 'senza stile si risponde comunque con gli otto');
});

test('STUDIO-STATO: «riduci movimento» batte tutto, e ferma NON vuol dire spento', () => {
  /* MDN «prefers-reduced-motion» (10/06/2026): «reduce» chiede di togliere il MOTO. L'anteprima
     resta dipinta: lo stato lo dice, e la prova dal vivo conta i pixel (154.000 su 234.432). */
  assert.equal(statoAnteprima({ ridotto: true, modo: 'adaptive', pausa: false }), 'reduced');
  assert.equal(statoAnteprima({ ridotto: true, modo: 'off', pausa: true }), 'reduced', 'la preferenza viene prima di tutto');
  assert.equal(statoAnteprima({ modo: 'off' }), 'renderer-fermo');
  assert.equal(statoAnteprima({ modo: 'static' }), 'renderer-fermo');
  assert.equal(statoAnteprima({ pausa: true }), 'paused');
  assert.equal(statoAnteprima({ nascosto: true }), 'static');
  assert.equal(statoAnteprima({}), 'animating');
  // ogni stato ha una frase in italiano: nessuno arriva a schermo come parola inglese
  for (const stato of ['reduced', 'renderer-fermo', 'paused', 'static', 'animating', 'assente']) {
    assert.ok(TESTO_STATO[stato], `manca la frase per ${stato}`);
    assert.equal(/[a-z]/.test(TESTO_STATO[stato]), true);
  }
});

test('STUDIO-VALORE: il valore si chiede al controllo vero, e un interruttore risponde sì o no', () => {
  const doc = {
    getElementById: (id) => ({
      backgroundMotionToggle: { type: 'checkbox', checked: true, value: 'on' },
      motionSpeedRange: { type: 'range', value: '120' },
    }[id] || null),
  };
  assert.equal(valoreAspetto('backgroundMotionToggle', doc), true);
  assert.equal(valoreAspetto('motionSpeedRange', doc), '120');
  // ⛔ verso contrario: un controllo assente risponde «non lo so», non «falso» — sono due cose diverse
  assert.equal(valoreAspetto('controlloAssente', doc), null);
});

function schermoFinto(ids) {
  const righe = new Map(ids.map((id) => [id, { dataset: {} }]));
  return {
    righe,
    querySelector: (sel) => {
      const riga = /\[data-setting-row="([^"]+)"\]/.exec(sel);
      if (riga) return righe.get(riga[1]) || null;
      return null;
    },
  };
}

test('STUDIO-MIGRAZIONE: le righe migrate si marcano una volta sola, e le altre non si toccano', () => {
  /* ⛔ NASCONDE, non rimuove: i controlli veri restano nel documento perché sono loro a portare la
     preferenza fino a `localStorage` (`appearanceControlMap` ascolta QUEI nodi). */
  const schermo = schermoFinto([...CONTROLLI_MIGRATI, 'uiDensitySelect', 'chatFontScaleSelect']);
  assert.equal(migraRigheImpostazioni(schermo), 14);
  assert.equal(schermo.righe.get('motionIntensityRange').dataset.tdMigrata, 'si');
  // ⛔ verso contrario: ciò che resta nelle Impostazioni NON viene marcato
  assert.equal(schermo.righe.get('uiDensitySelect').dataset.tdMigrata, undefined);
  assert.equal(schermo.righe.get('chatFontScaleSelect').dataset.tdMigrata, undefined);
  // idempotente: `montaImpostazioni` ridisegna le righe a ogni apertura e questo gira dopo
  assert.equal(migraRigheImpostazioni(schermo), 14);
  // e una schermata che quelle righe non ce l'ha non va in errore
  assert.equal(migraRigheImpostazioni(schermoFinto([])), 0);
  assert.equal(migraRigheImpostazioni(null), 0);
});

test('STUDIO-COLORE: senza un documento vero non si inventa un colore, e non si cade', () => {
  /* ⛔ `getPropertyValue('--talos-accent')` restituisce `color-mix(...)` su dieci temi su
     quattordici in modo chiaro: sotto «Accento applicato» l'owner avrebbe letto una formula.
     Qui c'è solo il ripiego: la risoluzione vera vuole un browser ed è provata dal vivo. */
  assert.equal(risolviColore('', null, 'ripiego'), 'ripiego');
  assert.equal(risolviColore('#c08b3c', null, ''), '#c08b3c');
  assert.equal(risolviColore(null, null, ''), '');
  assert.equal(normalizzaColore('', null), '');
  assert.equal(normalizzaColore('rgb(1, 2, 3)', null), 'rgb(1, 2, 3)');
});

test('STUDIO-SCENE: in un ambiente senza il pacchetto lo studio resta aperto e lo DICE', async () => {
  /* ⛔ `motion/desktop-scenes.js` è un IIFE che scrive su `window`: in Node l'import fallisce, e
     deve fallire in silenzio — lo studio serve anche solo per colori, nomi e cursori. */
  const scene = await caricaScene();
  assert.ok(scene instanceof Map);
  assert.equal(scene.size, 0, 'in Node non c’è nessuna scena, e va bene così');
  assert.equal(TESTO_STATO.assente, 'Scena non disponibile');
});
