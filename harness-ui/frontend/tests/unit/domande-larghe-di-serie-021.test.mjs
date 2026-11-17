import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOGO_IMPOSTAZIONI } from '../../../src/impostazioni/catalogo-impostazioni.mjs';

/*
 * ⭐ 0.2.2-DL (09/11/2026, owner 19:33): «Domande a tutta larghezza» ACCESA di serie. Prima (27/10) era spenta di serie.
 *
 * ⛔ Il salvataggio delle preferenze è rado (`salvaImpostazioniDesktop`): in `appearance` si scrive solo ciò che differisce dal
 *   valore di serie. Nella 0.2.0 chi aveva spento l'interruttore non ha niente di salvato (il suo `false` era uguale a quello di
 *   serie), quindi non si distingue da chi non l'ha mai toccato: dopo il cambio tutti quelli senza un valore salvato la vedono
 *   accesa. Da ora chi la spegne resta spento, perché `false` diventa diverso dal valore di serie e quindi si scrive.
 *
 * Le funzioni vere si estraggono da `legacy/app.js` e si ESEGUONO (come `bc42-albero-pigro.test.mjs`): il valore di serie, la
 *   normalizzazione, la lettura e il salvataggio rado. Ciò che non riguarda questa voce (temi, lingue, movimento, chat, spazi di
 *   lavoro) si sostituisce con tabelle vuote: i loro valori restano quelli di serie, che è ciò che qui serve.
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

function bloccoDa(sorgente, inizio) {
  if (inizio === -1) return null;
  const apertura = sorgente.indexOf('{', inizio);
  let livello = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') livello += 1;
    else if (sorgente[i] === '}') {
      livello -= 1;
      if (livello === 0) return sorgente.slice(inizio, i + 1);
    }
  }
  return null;
}
const funzione = (nome) => bloccoDa(APP, APP.search(new RegExp(`function ${nome}\\s*\\(`)));
const costante = (nome) => `${bloccoDa(APP, APP.indexOf(`const ${nome} = {`))};`;

/** Una finestra finta: `localStorage` in memoria e `document` che conta gli eventi; ritorna le funzioni vere di app.js. */
function fabbrica(archivio = new Map()) {
  const eventi = [];
  const window = {
    localStorage: {
      getItem: (k) => (archivio.has(k) ? archivio.get(k) : null),
      setItem: (k, v) => { archivio.set(k, String(v)); },
    },
  };
  const document = { dispatchEvent: (e) => { eventi.push(e); return true; } };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const corpo = [
    "const DESKTOP_SETTINGS_KEY = 'talos.harness.desktop.settings.v1';",
    'const ASPETTO_SCELTA_VERSIONE = 2;',
    "const ASPETTO_CHIAVI_VERSIONATE = ['themePreset', 'sceneOverride', 'backgroundMotion'];",
    'const chiaveVersioneAspetto = (chiave) => `${chiave}Versione`;',
    'const TALOS_THEME_IDS = []; const COLOR_MODE_IDS = []; const TALOS_SCENE_IDS = []; const LINGUE_MENU = [];',
    'const VALORI_LINGUA_DELLE_RISPOSTE = []; const UI_FONT_SCALE_FACTORS = {}; const CHAT_FONT_SCALE_SIZES = {};',
    'const MOTION_MODE_IDS = []; const MOTION_QUALITY_IDS = []; const MOTION_PROFILE_IDS = []; const MOTION_EASING_IDS = [];',
    'const MOTION_RANGE_DEFS = {};',
    'const normalizzaPreferenzeChatDesktop = (v) => v ?? {}; const normalizzaWorkspaces = (v) => v ?? {};',
    costante('DESKTOP_APPEARANCE_DEFAULTS'),
    ...['enumValue', 'numberValue', 'boolValue', 'normalizzaAspettoDesktop', 'leggiImpostazioniDesktop', 'salvaImpostazioniDesktop'].map(funzione),
    'return { DESKTOP_APPEARANCE_DEFAULTS, normalizzaAspettoDesktop, leggiImpostazioniDesktop, salvaImpostazioniDesktop };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const fatto = new Function('window', 'document', 'CustomEvent', corpo)(window, document, CustomEvent);
  return { ...fatto, archivio, eventi, salvato: () => JSON.parse(archivio.get('talos.harness.desktop.settings.v1') ?? 'null') };
}

test('DL-01 · con un archivio vuoto «Domande a tutta larghezza» è accesa', () => {
  const f = fabbrica();
  assert.equal(f.DESKTOP_APPEARANCE_DEFAULTS.userBubbleFullWidth, true, 'il valore di serie è acceso (owner 09/11 19:33)');
  assert.equal(f.leggiImpostazioniDesktop().appearance.userBubbleFullWidth, true, 'chi non l’ha mai toccata la vede accesa');
  assert.equal(f.normalizzaAspettoDesktop({}).userBubbleFullWidth, true);
  assert.equal(f.normalizzaAspettoDesktop({ userBubbleFullWidth: 'no' }).userBubbleFullWidth, true, 'un valore non booleano torna al valore di serie');
});

test('DL-02 · spenta, salvata e ricaricata: resta spenta, e il `false` è scritto', () => {
  const f = fabbrica();
  const prima = f.leggiImpostazioniDesktop();
  assert.equal(f.salvaImpostazioniDesktop({ ...prima, appearance: { ...prima.appearance, userBubbleFullWidth: false } }), true);
  assert.equal(f.salvato().appearance.userBubbleFullWidth, false, 'il salvataggio rado deve scrivere il false, ora diverso dal valore di serie');
  assert.equal(fabbrica(f.archivio).leggiImpostazioniDesktop().appearance.userBubbleFullWidth, false, 'dopo la ricarica resta spenta');
});

test('DL-03 · accesa, salvata e ricaricata: resta accesa', () => {
  const f = fabbrica();
  const prima = f.leggiImpostazioniDesktop();
  f.salvaImpostazioniDesktop({ ...prima, appearance: { ...prima.appearance, userBubbleFullWidth: false } });
  const spenta = f.leggiImpostazioniDesktop();
  assert.equal(f.salvaImpostazioniDesktop({ ...spenta, appearance: { ...spenta.appearance, userBubbleFullWidth: true } }), true);
  assert.equal(Object.hasOwn(f.salvato().appearance, 'userBubbleFullWidth'), false, 'acceso è il valore di serie: il salvataggio rado non lo scrive');
  assert.equal(fabbrica(f.archivio).leggiImpostazioniDesktop().appearance.userBubbleFullWidth, true, 'dopo la ricarica resta accesa');
  /* un `true` scritto da una versione precedente (chi l'aveva accesa nella 0.2.0) resta acceso */
  const vecchio = new Map([['talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { userBubbleFullWidth: true } })]]);
  assert.equal(fabbrica(vecchio).leggiImpostazioniDesktop().appearance.userBubbleFullWidth, true);
});

/*
 * Giro 2 (revisione avversaria del 09/11, reperto 2: 6 mutanti vivi su 10): il FILO dell'interruttore, senza browser. Le funzioni vere
 *   di app.js si eseguono su una radice e su caselle finte: niente regex sul sorgente per dire «la classe c'è».
 */
/** `applicaAspettoDesktop` vera su una radice finta (classi, stile, dataset) e caselle finte per ogni `$('#…')`. */
function applicatore() {
  const classi = new Set();
  const host = {
    classList: {
      toggle: (nome, forza) => { const si = forza === undefined ? !classi.has(nome) : Boolean(forza); if (si) classi.add(nome); else classi.delete(nome); return si; },
      contains: (nome) => classi.has(nome), add: (nome) => { classi.add(nome); }, remove: (nome) => { classi.delete(nome); },
    },
    style: { setProperty: () => {} }, dataset: {},
  };
  const caselle = new Map();
  const $ = (selettore) => { if (!caselle.has(selettore)) caselle.set(selettore, { checked: null, value: null }); return caselle.get(selettore); };
  const document = { documentElement: { setAttribute: () => {}, removeAttribute: () => {}, dataset: {} } };
  const corpo = [
    "const ASPETTO_SCELTA_VERSIONE = 2; const ASPETTO_CHIAVI_VERSIONATE = ['themePreset', 'sceneOverride', 'backgroundMotion'];",
    'const chiaveVersioneAspetto = (chiave) => `${chiave}Versione`;',
    'const TALOS_THEME_IDS = []; const COLOR_MODE_IDS = []; const TALOS_SCENE_IDS = []; const LINGUE_MENU = [];',
    'const VALORI_LINGUA_DELLE_RISPOSTE = []; const UI_FONT_SCALE_FACTORS = {}; const CHAT_FONT_SCALE_SIZES = {};',
    'const MOTION_MODE_IDS = []; const MOTION_QUALITY_IDS = []; const MOTION_PROFILE_IDS = []; const MOTION_EASING_IDS = [];',
    'const MOTION_RANGE_DEFS = {};',
    /* ciò che non riguarda questa voce (tema, piede, densità, lingua, movimento, sfondo) non fa niente */
    'const HOST = () => host; const ROOT = () => host; const location = { hash: "" }; const navigator = { language: "en", languages: ["en"] };',
    'const applicaThemeDesktop = () => {}; const aggiornaPiedeSidebar = () => {}; const aggiornaMotionDesktop = () => {}; const aggiornaBackgroundDesktop = () => {};',
    'const workspacePreferences = { adoptLegacyDensity: () => {}, read: () => ({ density: "compact" }) };',
    'const linguaDaIndirizzo = () => "en"; const risolviLingua = () => "en"; const applicaLingua = () => {}; const sincronizzaSelettoriDensitaLingua = () => {};',
    costante('DESKTOP_APPEARANCE_DEFAULTS'),
    ...['enumValue', 'numberValue', 'boolValue', 'normalizzaAspettoDesktop', 'applicaAspettoDesktop'].map(funzione),
    'return { applicaAspettoDesktop };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const fatto = new Function('host', '$', 'document', corpo)(host, $, document);
  return { ...fatto, classi, casella: (id) => $(`#${id}`) };
}

test('DL-04 · il catalogo del server e la finestra parlano dello STESSO campo, con lo stesso valore di serie', () => {
  /* il server legge la copia della finestra sopra i SUOI valori di serie (`servizio-impostazioni.mjs`, `diSerieFinestra`): finché la
     finestra non ha mandato la sua copia, il modello deve leggere ciò che la persona vede */
  const diSerie = fabbrica().DESKTOP_APPEARANCE_DEFAULTS;
  const voce = CATALOGO_IMPOSTAZIONI.find((v) => v.chiave === 'appearance.userBubbleFullWidth');
  assert.ok(voce, 'la voce del catalogo esiste');
  assert.equal(voce.campo, 'userBubbleFullWidth', 'la voce scrive il campo che la finestra legge, non quello di un’altra voce');
  assert.equal(voce.fonte, 'finestra');
  assert.equal(voce.diSerie, diSerie.userBubbleFullWidth, 'catalogo del server e finestra devono dire lo stesso valore di serie');
  /* e nessun’altra voce della finestra scrive lo stesso campo (due chiavi su un campo: una delle due mente) */
  const stessoCampo = CATALOGO_IMPOSTAZIONI.filter((v) => v.fonte === 'finestra' && v.campo === voce.campo).map((v) => v.chiave);
  assert.deepEqual(stessoCampo, ['appearance.userBubbleFullWidth']);
});

test('DL-05 · `applicaAspettoDesktop` vera: accesa mette la classe sulla radice e spunta la casella; spenta le toglie tutte e due', () => {
  const a = applicatore();
  a.applicaAspettoDesktop({ userBubbleFullWidth: true });
  const accese = new Set(a.classi);
  assert.equal(a.casella('userBubbleFullWidthToggle').checked, true, 'la casella delle Impostazioni mostra accesa');
  assert.equal(a.casella('chatFullWidthToggle').checked, false, 'e non muove la casella vicina');
  a.applicaAspettoDesktop({ userBubbleFullWidth: false });
  assert.equal(a.casella('userBubbleFullWidthToggle').checked, false, 'la casella mostra spenta');
  /* la classe di questa voce è quella che c'è da accesa e non da spenta: una sola, e resta sulla radice dopo l'applicazione */
  const classe = [...accese].filter((c) => !a.classi.has(c));
  assert.equal(classe.length, 1, `una sola classe segue l'interruttore: ${JSON.stringify(classe)}`);
  /* senza valore (archivio vuoto) vale il valore di serie: accesa */
  a.applicaAspettoDesktop({});
  assert.equal(a.classi.has(classe[0]), true);
  assert.equal(a.casella('userBubbleFullWidthToggle').checked, true);
  /* il foglio di stile conosce QUELLA classe sulla radice: è il filo fra app.js e `domanda-appiccicata.css` (il disegno vero lo
     misura il browser, BOLLE-05) */
  const css = readFileSync(new URL('../../src/styles/domanda-appiccicata.css', import.meta.url), 'utf8');
  const selettore = `:root.${classe[0]}`;
  const regole = css.split(selettore).slice(1).filter((dopo) => !/^[\w-]/u.test(dopo)).length; // il nome intero, non un suo prefisso
  assert.ok(regole > 0, `il foglio di stile ha regole per ${selettore}`);
});

test('DL-06 · la casella delle Impostazioni scrive la SUA chiave: la mappa dei controlli vera, senza doppioni', () => {
  const mappa = new Function(`${bloccoDa(APP, APP.indexOf('const appearanceControlMap = {'))}; return appearanceControlMap;`)(); // eslint-disable-line no-new-func
  assert.equal(mappa.userBubbleFullWidthToggle, 'userBubbleFullWidth');
  assert.equal(mappa.chatFullWidthToggle, 'chatFullWidth');
  const chiavi = Object.values(mappa);
  assert.deepEqual(chiavi.filter((k, i) => chiavi.indexOf(k) !== i), [], 'due controlli non scrivono mai la stessa chiave');
  const diSerie = fabbrica().DESKTOP_APPEARANCE_DEFAULTS;
  assert.deepEqual(chiavi.filter((k) => !Object.hasOwn(diSerie, k)), [], 'ogni controllo scrive una chiave che l’aspetto conosce');
});

test('DL-07 · il riepilogo dei fatti della chat dice «sì» quando è accesa e «no» quando è spenta (la riga vera di app.js)', () => {
  /* l'istruzione vera `riempiFatti('settingsChatFacts', [ … ]);` di `renderSettingsRiepiloghi`, eseguita con `tr` che ridà la chiave */
  const inizio = APP.indexOf("riempiFatti('settingsChatFacts', [");
  assert.notEqual(inizio, -1);
  let livello = 0; let fine = -1;
  for (let i = APP.indexOf('(', inizio); i < APP.length; i += 1) {
    if (APP[i] === '(') livello += 1;
    else if (APP[i] === ')') { livello -= 1; if (livello === 0) { fine = i + 1; break; } }
  }
  const istruzione = APP.slice(inizio, fine);
  const fatti = (aspetto) => {
    let coppie = null;
    // eslint-disable-next-line no-new-func
    new Function('riempiFatti', 'tr', 'etichetta', 'a', 'state', istruzione)((_id, c) => { coppie = c; }, (k) => k, () => '-', aspetto, { mostraRagionamento: false });
    return Object.fromEntries(coppie);
  };
  const accesa = fatti({ chatFullWidth: false, userBubbleFullWidth: true });
  assert.equal(accesa['app.settings.facts.fullWidthQuestions'], 'app.settings.facts.yes');
  assert.equal(accesa['app.settings.facts.fullWidthChat'], 'app.settings.facts.no', 'la riga vicina segue il SUO valore');
  const spenta = fatti({ chatFullWidth: true, userBubbleFullWidth: false });
  assert.equal(spenta['app.settings.facts.fullWidthQuestions'], 'app.settings.facts.no');
  assert.equal(spenta['app.settings.facts.fullWidthChat'], 'app.settings.facts.yes');
});
