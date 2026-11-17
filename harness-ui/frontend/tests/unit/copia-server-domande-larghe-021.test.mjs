import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { creaCopiaFinestra } from '../../../src/impostazioni/copia-finestra.mjs';
import { creaServizioImpostazioni, MIGRAZIONE_DOMANDE_LARGHE } from '../../../src/impostazioni/servizio-impostazioni.mjs';
import { creaRotteImpostazioni } from '../../../src/impostazioni/rotte-impostazioni.mjs';
import { creaCopiaSulServer, EVENTO_IMPOSTAZIONI_FINESTRA, DESTINATARIO_FINESTRE_PC, CHIAVE_REVISIONE_VISTA, CHIAVE_DA_MANDARE } from '../../src/features/settings/copia-sul-server.js';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';
import { segniDalleRicevute } from '../../src/components/impostazioni-dalla-chat.js'; // giro 7 (K2): da qui nasce «Cambiata da TALOS · Annulla»

/*
 * 0.2.2-DL, giro 3 (decisione dell'owner del 09/11/2026 21:57; le quattro misure del revisore REV-A…REV-D diventano prove del ramo) — LE
 *   DUE PORTE dopo l'aggiornamento: la finestra (le funzioni VERE di `app.js` e `copia-sul-server.js`) e il modello (il servizio VERO),
 *   sulla copia del server VERA scritta su file e migrata al primo avvio della 0.2.2.
 * La finestra 0.2.0 è la stessa `app.js` col valore di serie di allora (`userBubbleFullWidth: false`): il commit ca7fa709a ha cambiato in
 *   `app.js` solo quella riga di codice (e i commenti). La 0.2.0 del server è il file della copia senza il timbro (`migrazioni`), come lo
 *   scriveva la 0.2.0; il riavvio è una copia e un servizio nuovi sugli stessi file.
 */
const APP_021 = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const RIGA_DI_SERIE = 'userBubbleFullWidth: true,';
assert.equal(APP_021.split(RIGA_DI_SERIE).length, 2, 'una sola riga del valore di serie in app.js');
const APP_020 = APP_021.replace(RIGA_DI_SERIE, () => 'userBubbleFullWidth: false,');
const CHIAVE_ARCHIVIO = 'talos.harness.desktop.settings.v1';
const VOCE = 'appearance.userBubbleFullWidth';

function bloccoDa(sorgente, inizio) {
  if (inizio === -1) return null;
  const apertura = sorgente.indexOf('{', inizio);
  let livello = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') livello += 1;
    else if (sorgente[i] === '}') { livello -= 1; if (livello === 0) return sorgente.slice(inizio, i + 1); }
  }
  return null;
}
/** Le funzioni vere di app.js su un archivio dato (come DL-01…03), più `aggiornaAspetto` = il cuore di `aggiornaAspettoDesktop`. */
function finestra(APP, archivio) {
  const funzione = (nome) => bloccoDa(APP, APP.search(new RegExp(`function ${nome}\\s*\\(`)));
  const costante = (nome) => `${bloccoDa(APP, APP.indexOf(`const ${nome} = {`))};`;
  const window = { localStorage: { getItem: (k) => (archivio.has(k) ? archivio.get(k) : null), setItem: (k, v) => { archivio.set(k, String(v)); } } };
  const document = { dispatchEvent: () => true };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const corpo = [
    "const DESKTOP_SETTINGS_KEY = 'talos.harness.desktop.settings.v1';",
    'const ASPETTO_SCELTA_VERSIONE = 2;',
    "const ASPETTO_CHIAVI_VERSIONATE = ['themePreset', 'sceneOverride', 'backgroundMotion'];",
    'const chiaveVersioneAspetto = (chiave) => `${chiave}Versione`;',
    "const TALOS_THEME_IDS = ['calm', 'paper']; const COLOR_MODE_IDS = []; const TALOS_SCENE_IDS = []; const LINGUE_MENU = [];",
    'const VALORI_LINGUA_DELLE_RISPOSTE = []; const UI_FONT_SCALE_FACTORS = {}; const CHAT_FONT_SCALE_SIZES = {};',
    'const MOTION_MODE_IDS = []; const MOTION_QUALITY_IDS = []; const MOTION_PROFILE_IDS = []; const MOTION_EASING_IDS = [];',
    'const MOTION_RANGE_DEFS = {};',
    'const normalizzaPreferenzeChatDesktop = (v) => v ?? {}; const normalizzaWorkspaces = (v) => v ?? {};',
    costante('DESKTOP_APPEARANCE_DEFAULTS'),
    ...['enumValue', 'numberValue', 'boolValue', 'normalizzaAspettoDesktop', 'leggiImpostazioniDesktop', 'salvaImpostazioniDesktop'].map(funzione),
    'return { DESKTOP_APPEARANCE_DEFAULTS, normalizzaAspettoDesktop, leggiImpostazioniDesktop, salvaImpostazioniDesktop };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const f = new Function('window', 'document', 'CustomEvent', corpo)(window, document, CustomEvent);
  const aggiornaAspetto = (patch) => {
    const documento = f.leggiImpostazioniDesktop();
    documento.appearance = f.normalizzaAspettoDesktop({ ...documento.appearance, ...patch });
    f.salvaImpostazioniDesktop(documento);
  };
  return { ...f, aggiornaAspetto, window, mostra: () => f.leggiImpostazioniDesktop().appearance.userBubbleFullWidth, salvato: () => JSON.parse(archivio.get(CHIAVE_ARCHIVIO) ?? 'null') };
}

/*
 * 0.2.2-DL, giro 7 (controllore del giro 6, K5 / R3: 8 prove della finestra cadevano il 25-47% delle volte sotto carico) — SI ASPETTA UN
 *   EVENTO, MAI UN TEMPO. Prima ogni passo dormiva 20-80 ms e sperava che l'invio della finestra fosse arrivato; su una macchina carica
 *   non lo era. Ora ogni canale di prova tiene il conto di ciò che è in volo (gli invii della finestra, gli eventi del server con la loro
 *   risposta `/applied`) e `quiete()` va avanti appena non c'è più niente in volo, nessun invio è da mandare (il segno «da mandare»
 *   della finestra, `CHIAVE_DA_MANDARE`) e un giro intero del ciclo è passato (le continuazioni dopo una risposta girano lì). Si ricontrolla
 *   a ogni evento, non a tempo; il tetto di 20 s c'è solo per fallire con un messaggio invece di restare appesi.
 *   `finché(condizione)`: lo stesso, per un passo che aspetta qualcosa di preciso (un invio partito e trattenuto).
 *   Fonti (lette l'11/11/2026): etherpad PR #7647 (1 maggio 2026, revisione): le pause fisse «timer jitter or event-loop delays can still
 *   cause intermittent failures under heavy CI load», la cura è aspettare la condizione; Node, `setImmediate` (documentazione v24): la
 *   callback gira nella fase «check», dopo che le microattività in coda sono finite.
 */
const ENTRO_MS = 20_000;
const unGiro = () => new Promise((r) => { setImmediate(r); });
function sorvegliante(memoria) {
  let attivi = 0; let trattenuti = 0; let iniziati = 0; let svegli = [];
  const sveglia = () => { const s = svegli; svegli = []; for (const r of s) r(); };
  const prossimo = (ms) => new Promise((r) => { svegli.push(r); const t = setTimeout(r, ms); t.unref?.(); });
  const fermo = () => attivi === trattenuti && (trattenuti > 0 || memoria?.getItem(CHIAVE_DA_MANDARE) !== '1');
  async function aspetta(condizione, cosa, entro) {
    const limite = Date.now() + entro;
    for (;;) {
      await unGiro();
      if (condizione()) { await unGiro(); if (condizione()) return; continue; }
      const resta = limite - Date.now();
      if (resta <= 0) throw new Error(`${cosa}: ancora niente dopo ${entro} ms (in volo ${attivi}, trattenuti ${trattenuti}, da mandare ${memoria?.getItem(CHIAVE_DA_MANDARE)})`);
      await prossimo(resta);
    }
  }
  return {
    /** Una cosa in volo (un invio, un evento con la sua risposta): finché non si chiude, niente è fermo. */
    traccia(lavoro) { attivi += 1; iniziati += 1; sveglia(); return Promise.resolve(lavoro).finally(() => { attivi -= 1; sveglia(); }); },
    /** Un invio trattenuto apposta dalla prova (la rete lenta): è in volo ma non lo si aspetta. */
    async trattenuto(cancello) { trattenuti += 1; sveglia(); try { await cancello; } finally { trattenuti -= 1; sveglia(); } },
    iniziati: () => iniziati, trattenuti: () => trattenuti, attivi: () => attivi,
    quiete: (entro = ENTRO_MS) => aspetta(fermo, 'quiete', entro),
    finché: (condizione, entro = ENTRO_MS) => aspetta(condizione, 'finché', entro),
  };
}
function cartella() { return mkdtempSync(join(tmpdir(), 'dlf-')); } // giro 6 (R-E): nel TEMP di chi lancia
const fileCopia = (d) => join(d, '.preferenze-finestra.json');

/** Un avvio del server sulla cartella (copia e servizio veri, come `server.mjs`), con la porta del modello. */
function server(d) {
  const copia = creaCopiaFinestra({ file: fileCopia(d) });
  const servizio = creaServizioImpostazioni({ copiaFinestra: copia, fileRicevute: join(d, '.impostazioni-ricevute.json'), attesaFinestraMs: 200 });
  const fn = servizio.perLaSessione({ sessionId: null });
  const modello = async () => {
    const { testo } = await fn('app_settings', { action: 'list', query: VOCE }, { fase: 'esegui' });
    return { valore: /= (true|false);/u.exec(testo.split('\n').find((r) => r.includes(VOCE)))?.[1], rev: Number(/Revision (\d+)/u.exec(testo)[1]) };
  };
  const cambia = async (changes) => fn('app_settings', { action: 'set', expected_revision: (await modello()).rev, changes }, { fase: 'esegui', toolCallId: 'c' });
  return { copia, servizio, modello, cambia, ferma: async () => { await copia.leggi(); await servizio.attendiScritture(); } };
}
/** La finestra attaccata al servizio come fanno le rotte `app-settings/window` e `/applied` e lo stream degli eventi. */
function canale(f, s) {
  const inviati = [];
  const sv = sorvegliante(f.window.localStorage); // giro 7 (K5)
  const c = creaCopiaSulServer({
    apiGet: () => s.servizio.finestra.leggi(),
    apiPost: (percorso, corpo) => sv.traccia((async () => {
      if (percorso.endsWith('/applied')) return s.servizio.finestra.risposta(corpo);
      inviati.push(corpo);
      const copia = await s.servizio.finestra.dallaPersona(corpo.valori);
      return { revisione: copia.revisione };
    })()),
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto,
    finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1,
  });
  const stacca = s.servizio.finestra.ascolta((evento) => { void sv.traccia(c.suEvento(evento)); });
  return { canale: c, inviati, stacca, quiete: sv.quiete };
}
/** Fine della 0.2.0: il file della copia senza il timbro. */
async function chiudiLa020(s, d) {
  await s.ferma();
  const { migrazioni: _timbro, ...comeLa020 } = JSON.parse(readFileSync(fileCopia(d), 'utf8'));
  writeFileSync(fileCopia(d), `${JSON.stringify(comeLa020, null, 1)}\n`);
  return comeLa020;
}
/** 0.2.0 mai toccata: prima apertura della finestra (manda l'aspetto intero, col false di serie di allora). */
async function installazione020(d) {
  const archivio = new Map();
  const s = server(d);
  const f = finestra(APP_020, archivio);
  assert.equal(f.mostra(), false, 'la 0.2.0 è spenta di serie');
  const { canale: c, inviati, stacca, quiete } = canale(f, s);
  assert.deepEqual(await c.avvio(), { esito: 'mandata' });
  assert.equal(inviati[0].valori.userBubbleFullWidth, false, 'REV-A: la copia mandata porta il false');
  return { archivio, s, f, c, stacca, quiete };
}

test('FIN-01 (REV-A, REV-B) · mai toccata: dopo l aggiornamento la finestra mostra accesa, il modello legge accesa e la può spegnere', async () => {
  const d = cartella();
  const v020 = await installazione020(d);
  v020.stacca();
  const prima = await chiudiLa020(v020.s, d);
  const s = server(d);
  const f = finestra(APP_021, v020.archivio);
  assert.equal(f.mostra(), true);
  const { canale: c, stacca, quiete } = canale(f, s);
  const esito = await c.avvio();
  assert.equal(esito.esito, 'applicata', 'la finestra aperta prima trova la revisione nuova');
  assert.deepEqual(esito.campi, [], 'e non riceve nessun false');
  assert.equal(Number(v020.archivio.get('talos.harness.desktop.settings.copy.v1')), prima.revisione + 1, 'allineata alla revisione nuova');
  assert.equal(f.mostra(), true);
  assert.equal((await s.modello()).valore, 'true', 'le due porte dicono la stessa cosa');
  /* REV-B: prima diceva «Nothing to change»; ora il modello spegne e la finestra aperta si spegne */
  const set = await s.cambia([{ key: VOCE, value: false }]);
  assert.match(set.testo, /true → false/u);
  await quiete();
  assert.equal(f.mostra(), false);
  assert.equal(f.salvato().appearance.userBubbleFullWidth, false, 'e in locale il false è scritto');
  stacca();
});

test('FIN-02 (REV-C) · un secondo browser con l archivio vuoto e un cambio del tema dal modello a finestra chiusa NON la spengono', async () => {
  const d = cartella();
  const v020 = await installazione020(d);
  v020.stacca();
  await chiudiLa020(v020.s, d);
  const s = server(d);
  const altro = finestra(APP_021, new Map());
  const esitoAltro = await canale(altro, s).canale.avvio();
  assert.equal(esitoAltro.campi.includes('userBubbleFullWidth'), false, `secondo browser: ${JSON.stringify(esitoAltro)}`);
  assert.equal(altro.mostra(), true);
  /* la finestra di sempre, dopo un cambio del tema fatto dal modello a finestra chiusa */
  assert.match((await s.cambia([{ key: 'appearance.theme', value: 'calm' }])).testo, /→ "calm"/u, 'il modello cambia il tema (nessuna finestra aperta)');
  const sempre = finestra(APP_021, v020.archivio);
  const esito = await canale(sempre, s).canale.avvio();
  assert.equal(esito.esito, 'applicata');
  assert.equal(esito.campi.includes('userBubbleFullWidth'), false, JSON.stringify(esito));
  assert.equal(sempre.mostra(), true);
});

test('FIN-03 · spenta dal modello nella 0.2.0 (con ricevuta): la finestra, che in locale non l aveva scritto, si allinea e si SPEGNE', async () => {
  const d = cartella();
  const v020 = await installazione020(d);
  v020.f.aggiornaAspetto({ userBubbleFullWidth: true }); // la persona l'accende a mano
  v020.c.dopoCambioDellaPersona();
  await v020.quiete();
  await v020.s.cambia([{ key: VOCE, value: false }]); // il modello la spegne (MIS-1)
  await v020.quiete();
  assert.equal(v020.f.mostra(), false);
  assert.equal(Object.hasOwn(v020.f.salvato().appearance, 'userBubbleFullWidth'), false, 'la 0.2.0 non scrive il false in locale');
  v020.stacca();
  const prima = await chiudiLa020(v020.s, d);
  const s = server(d);
  const f = finestra(APP_021, v020.archivio);
  assert.equal(f.mostra(), true, 'prima dell avvio la finestra 0.2.2 la mostrerebbe accesa');
  const { canale: c, stacca } = canale(f, s);
  const esito = await c.avvio();
  assert.deepEqual(esito, { esito: 'applicata', campi: ['userBubbleFullWidth'] }, 'la revisione nuova riporta la scelta alla finestra');
  assert.equal(f.mostra(), false);
  assert.equal(f.salvato().appearance.userBubbleFullWidth, false, 'e ora il false è scritto in locale: resta');
  assert.equal(Number(v020.archivio.get('talos.harness.desktop.settings.copy.v1')), prima.revisione + 1);
  assert.equal((await s.modello()).valore, 'false');
  stacca();
  assert.deepEqual(await canale(finestra(APP_021, v020.archivio), server(d)).canale.avvio(), { esito: 'allineata' }, 'un riavvio dopo: niente di nuovo');
});

test('FIN-04 (REV-D) · installazione nuova 0.2.2: coerente sulle due porte, e il primo false della persona resta', async () => {
  const d = cartella();
  const s = server(d);
  assert.equal((await s.modello()).valore, 'true');
  const f = finestra(APP_021, new Map());
  const { canale: c, inviati, stacca, quiete } = canale(f, s);
  assert.deepEqual(await c.avvio(), { esito: 'mandata' });
  assert.equal(inviati[0].valori.userBubbleFullWidth, true);
  f.aggiornaAspetto({ userBubbleFullWidth: false });
  c.dopoCambioDellaPersona();
  await quiete();
  stacca();
  await s.ferma();
  assert.equal((await server(d).modello()).valore, 'false', 'riavvio: un false scritto dopo il timbro non si migra');
});

/*
 * Giro 4 (giudice v1313) — MISURA, non una cura: se il file delle ricevute c'è ma non si legge a NESSUN avvio (qui una cartella al suo
 *   posto: EISDIR), la migrazione non decide mai. Cosa vede la persona: la copia sul server resta quella della 0.2.0 (il false della prima
 *   apertura), la finestra non trova una revisione più nuova e mostra il suo valore di serie. Le due porte NON sono d'accordo
 *   (finestra accesa, modello spenta: il guasto di prima della cura, solo in questo caso).
 * Giro 5 (revisione del giro 3, D1): il cambio di UN'ALTRA voce non le rimette più d'accordo scrivendo «accesa» sopra il false (era così
 *   che una scelta con la ricevuta si perdeva): finché la migrazione aspetta, quel campo non si prende dalla finestra. Le rimette
 *   d'accordo la prima SCELTA, da una delle due porte: qui la persona la spegne dalla finestra.
 */
test('FIN-05 (giudice v1313, MISURA; giro 5) · ricevute illeggibili a ogni avvio: la migrazione aspetta; il cambio di un altra voce non decide niente, la prima scelta della persona le rimette d accordo', async () => {
  const d = cartella();
  const v020 = await installazione020(d);
  v020.stacca();
  const prima = await chiudiLa020(v020.s, d);
  const ricevute = join(d, '.impostazioni-ricevute.json');
  rmSync(ricevute, { force: true });
  mkdirSync(ricevute);
  const avviso = console.warn;
  console.warn = () => {};
  try {
    for (let avvio = 1; avvio <= 2; avvio += 1) {
      const s = server(d);
      const f = finestra(APP_021, v020.archivio);
      const { canale: c, stacca, quiete } = canale(f, s);
      assert.deepEqual(await c.avvio(), { esito: 'allineata' }, `avvio ${avvio}: nessuna revisione nuova`);
      assert.deepEqual({ finestra: f.mostra(), modello: (await s.modello()).valore }, { finestra: true, modello: 'false' }, `avvio ${avvio}: MISURATO, le due porte non d accordo`);
      assert.equal(JSON.parse(readFileSync(fileCopia(d), 'utf8')).revisione, prima.revisione, 'la migrazione non ha scritto');
      if (avvio === 2) {
        f.aggiornaAspetto({ chatFullWidth: true });
        c.dopoCambioDellaPersona();
        await quiete();
        assert.deepEqual({ finestra: f.mostra(), modello: (await s.modello()).valore }, { finestra: true, modello: 'false' }, 'il cambio di un altra voce non copre il false e non decide');
        const disco = JSON.parse(readFileSync(fileCopia(d), 'utf8'));
        assert.deepEqual({ chat: disco.valori.chatFullWidth, piena: disco.valori.userBubbleFullWidth, timbro: disco.migrazioni }, { chat: true, piena: false, timbro: [] });
        f.aggiornaAspetto({ userBubbleFullWidth: false }); // la persona la spegne: una scelta di questa versione
        c.dopoCambioDellaPersona();
        await quiete();
        assert.deepEqual({ finestra: f.mostra(), modello: (await s.modello()).valore }, { finestra: false, modello: 'false' }, 'la scelta della persona le rimette d accordo');
        assert.deepEqual(JSON.parse(readFileSync(fileCopia(d), 'utf8')).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], 'e chiude la migrazione');
      }
      stacca();
      await s.ferma();
    }
  } finally { console.warn = avviso; }
});

/*
 * 0.2.2-DL, giro 5 (revisione GIALLA del giro 3, reperto D1; le misure V1313-a e V1316 del revisore diventano prove del ramo) — LE DUE
 *   PORTE mentre la migrazione ASPETTA le ricevute (una cartella al posto del file: c'è ma non si legge; `rimetti()` le fa tornare).
 *   La finestra 0.2.2 mostra accesa (il suo valore di serie) e a ogni cambio manda l'aspetto INTERO: quel «accesa» non è una scelta.
 */
function nascondiRicevute(d) {
  const f = join(d, '.impostazioni-ricevute.json');
  const cera = existsSync(f);
  if (cera) renameSync(f, `${f}.da-parte`);
  mkdirSync(f);
  return () => { rimuoviCartellaDiProva(f); if (cera) renameSync(`${f}.da-parte`, f); }; // BC-09, classe A: la cartella la crea la prova, nessuno la tiene
}
async function zitto(lavoro) { const avviso = console.warn; console.warn = () => {}; try { return await lavoro(); } finally { console.warn = avviso; } }
const sulDisco = (d) => JSON.parse(readFileSync(fileCopia(d), 'utf8'));
/** 0.2.0: la persona l'accende a mano, il modello la spegne (ricevuta «→ false»); la finestra non scrive il false in locale (FIN-03). */
async function sceltaDelModello020(d) {
  const v020 = await installazione020(d);
  v020.f.aggiornaAspetto({ userBubbleFullWidth: true }); v020.c.dopoCambioDellaPersona(); await v020.quiete();
  await v020.s.cambia([{ key: VOCE, value: false }]); await v020.quiete();
  v020.stacca();
  const prima = await chiudiLa020(v020.s, d);
  return { archivio: v020.archivio, prima };
}
async function maiToccata020(d) {
  const v020 = await installazione020(d);
  v020.stacca();
  const prima = await chiudiLa020(v020.s, d);
  return { archivio: v020.archivio, prima };
}
/** Un avvio intero della 0.2.2 (server e finestra sugli stessi file e sullo stesso archivio), con ciò che la persona fa mentre è aperta. */
async function unAvvio(d, archivio, durante = async () => {}) {
  const s = server(d);
  const f = finestra(APP_021, archivio);
  const { canale: c, inviati, stacca, quiete } = canale(f, s);
  const { esito } = await c.avvio();
  const stato = { esito, finestra: f.mostra(), modello: (await s.modello()).valore };
  const due = () => s.modello().then((m) => ({ finestra: f.mostra(), modello: m.valore }));
  await durante({ s, f, c, inviati, due, quiete });
  stacca();
  await s.ferma();
  return stato;
}
const cambiaAltraVoce = async ({ f, c, quiete }, patch = { chatFullWidth: true }) => { f.aggiornaAspetto(patch); c.dopoCambioDellaPersona(); await quiete(); };

test('FIN-06 (giro 5, D1a; revisore V1313-a) · scelta del MODELLO nella 0.2.0, ricevute illeggibili: la persona cambia UN ALTRA voce ⇒ il false non si copre; tornate leggibili, finestra e modello spente', async () => {
  await zitto(async () => {
    /* le ricevute tornano leggibili solo al riavvio */
    const d = cartella();
    const { archivio, prima } = await sceltaDelModello020(d);
    const rimetti = nascondiRicevute(d);
    const a1 = await unAvvio(d, archivio);
    let mandato; let dopoIlCambio;
    const a2 = await unAvvio(d, archivio, async (v) => {
      await cambiaAltraVoce(v);
      mandato = v.inviati.at(-1).valori.userBubbleFullWidth;
      dopoIlCambio = await v.due();
    });
    assert.deepEqual({ a1, a2, mandato, dopoIlCambio }, {
      a1: { esito: 'allineata', finestra: true, modello: 'false' }, a2: { esito: 'allineata', finestra: true, modello: 'false' },
      mandato: true, dopoIlCambio: { finestra: true, modello: 'false' },
    }, 'la finestra manda «accesa» con l aspetto intero: il server non la scrive sopra il false');
    assert.deepEqual({ piena: sulDisco(d).valori.userBubbleFullWidth, chat: sulDisco(d).valori.chatFullWidth, rev: sulDisco(d).revisione, timbro: sulDisco(d).migrazioni },
      { piena: false, chat: true, rev: prima.revisione + 1, timbro: [] }, 'l altra voce è scritta; la migrazione aspetta ancora');
    rimetti();
    const a3 = await unAvvio(d, archivio);
    assert.deepEqual(a3, { esito: 'applicata', finestra: false, modello: 'false' }, 'la scelta del modello con la ricevuta resta, e la finestra la prende');
    assert.equal(archivio.has(CHIAVE_ARCHIVIO) && JSON.parse(archivio.get(CHIAVE_ARCHIVIO)).appearance.userBubbleFullWidth, false, 'in locale il false è scritto');
    assert.deepEqual(await unAvvio(d, archivio), { esito: 'allineata', finestra: false, modello: 'false' });

    /* le ricevute tornano leggibili a finestra APERTA: il prossimo cambio fa ritentare, e la finestra aperta si spegne da sola */
    const d2 = cartella();
    const { archivio: archivio2 } = await sceltaDelModello020(d2);
    const rimetti2 = nascondiRicevute(d2);
    let aperta;
    const b1 = await unAvvio(d2, archivio2, async (v) => {
      rimetti2();
      const primaDelCambio = v.inviati.length;
      await cambiaAltraVoce(v);
      /* giro 6 (R-B): l'invio della persona portava «accesa»; la finestra, spenta dall'evento mentre quello viaggiava, RIMANDA ciò che mostra */
      aperta = { mandato: v.inviati[primaDelCambio].valori.userBubbleFullWidth, rimandato: v.inviati.slice(primaDelCambio + 1).map((i) => i.valori.userBubbleFullWidth),
        ...(await v.due()), inLocale: v.f.salvato().appearance.userBubbleFullWidth };
      await cambiaAltraVoce(v, { chatFullWidth: false }); // il cambio dopo porta già «spenta»
      aperta.poi = await v.due();
    });
    assert.deepEqual({ b1, aperta }, { b1: { esito: 'allineata', finestra: true, modello: 'false' },
      aperta: { mandato: true, rimandato: [false], finestra: false, modello: 'false', inLocale: false, poi: { finestra: false, modello: 'false' } } });
    assert.deepEqual({ piena: sulDisco(d2).valori.userBubbleFullWidth, timbro: sulDisco(d2).migrazioni }, { piena: false, timbro: [MIGRAZIONE_DOMANDE_LARGHE] });
    assert.deepEqual(await unAvvio(d2, archivio2), { esito: 'allineata', finestra: false, modello: 'false' });
  });
});

test('FIN-07 (giro 5) · MAI TOCCATA, ricevute illeggibili: il cambio di un altra voce non spegne niente; tornate leggibili, finestra e modello ACCESE e nessun false scritto in locale', async () => {
  await zitto(async () => {
    const d = cartella();
    const { archivio, prima } = await maiToccata020(d);
    const rimetti = nascondiRicevute(d);
    let dopoIlCambio;
    const a1 = await unAvvio(d, archivio, async (v) => { await cambiaAltraVoce(v); dopoIlCambio = await v.due(); });
    assert.deepEqual({ a1, dopoIlCambio }, { a1: { esito: 'allineata', finestra: true, modello: 'false' }, dopoIlCambio: { finestra: true, modello: 'false' } });
    assert.equal(Object.hasOwn(JSON.parse(archivio.get(CHIAVE_ARCHIVIO)).appearance, 'userBubbleFullWidth'), false, 'la finestra non ha mai ricevuto un false che nessuno ha scelto');
    rimetti();
    const a2 = await unAvvio(d, archivio);
    assert.deepEqual(a2, { esito: 'applicata', finestra: true, modello: 'true' }, 'nessuna ricevuta: il false di serie della 0.2.0 è scartato, le due porte accese');
    assert.deepEqual({ ha: Object.hasOwn(sulDisco(d).valori, 'userBubbleFullWidth'), chat: sulDisco(d).valori.chatFullWidth, rev: sulDisco(d).revisione, timbro: sulDisco(d).migrazioni },
      { ha: false, chat: true, rev: prima.revisione + 2, timbro: [MIGRAZIONE_DOMANDE_LARGHE] });
    assert.equal(Object.hasOwn(JSON.parse(archivio.get(CHIAVE_ARCHIVIO)).appearance, 'userBubbleFullWidth'), false);
    assert.deepEqual(await unAvvio(d, archivio), { esito: 'allineata', finestra: true, modello: 'true' });

    /* tornate leggibili a finestra aperta: il cambio dopo decide (scarto) e la finestra resta accesa */
    const d2 = cartella();
    const { archivio: archivio2 } = await maiToccata020(d2);
    const rimetti2 = nascondiRicevute(d2);
    let aperta;
    await unAvvio(d2, archivio2, async (v) => { rimetti2(); await cambiaAltraVoce(v); aperta = await v.due(); });
    assert.deepEqual(aperta, { finestra: true, modello: 'true' });
    assert.deepEqual({ ha: Object.hasOwn(sulDisco(d2).valori, 'userBubbleFullWidth'), timbro: sulDisco(d2).migrazioni }, { ha: false, timbro: [MIGRAZIONE_DOMANDE_LARGHE] });
  });
});

test('FIN-08 (giro 5, D1b dalle due porte della persona) · mentre la migrazione aspetta: la persona la SPEGNE dalla finestra, o la chiede spenta con `/settings` ⇒ resta spenta al riavvio, in finestra e per il modello', async () => {
  await zitto(async () => {
    for (const porta of ['finestra', 'settings']) {
      const d = cartella();
      const { archivio } = await maiToccata020(d);
      const rimetti = nascondiRicevute(d);
      let dopo;
      const a1 = await unAvvio(d, archivio, async (v) => {
        if (porta === 'finestra') await cambiaAltraVoce(v, { userBubbleFullWidth: false });
        else { assert.deepEqual((await v.s.servizio.applicaDallaPersona({ changes: [{ key: VOCE, value: false }], origine: { tipo: 'persona' } })).gia, [VOCE]); await v.quiete(); }
        dopo = await v.due();
      });
      assert.deepEqual({ a1, dopo }, { a1: { esito: 'allineata', finestra: true, modello: 'false' }, dopo: { finestra: false, modello: 'false' } }, porta);
      assert.deepEqual({ piena: sulDisco(d).valori.userBubbleFullWidth, timbro: sulDisco(d).migrazioni }, { piena: false, timbro: [MIGRAZIONE_DOMANDE_LARGHE] }, porta);
      rimetti();
      assert.deepEqual(await unAvvio(d, archivio), { esito: 'allineata', finestra: false, modello: 'false' }, `${porta}: riavvio con le ricevute leggibili (nessuna): la scelta di questa versione resta`);
    }
  });
});

test('FIN-09 (giro 5) · finché la migrazione aspetta, la copia letta dalla finestra non porta la voce: un altro browser (cursore a zero) non prende un false che nessuno ha deciso', async () => {
  await zitto(async () => {
    for (const caso of ['maiToccata', 'modello']) {
      const d = cartella();
      if (caso === 'modello') await sceltaDelModello020(d); else await maiToccata020(d);
      const rimetti = nascondiRicevute(d);
      const altro = new Map(); // un altro browser: archivio vuoto, nessuna revisione vista
      let dopoIlCambio;
      const a1 = await unAvvio(d, altro, async (v) => { await cambiaAltraVoce(v); dopoIlCambio = await v.due(); });
      assert.deepEqual({ a1, dopoIlCambio }, { a1: { esito: 'applicata', finestra: true, modello: 'false' }, dopoIlCambio: { finestra: true, modello: 'false' } }, caso);
      assert.equal(Object.hasOwn(JSON.parse(altro.get(CHIAVE_ARCHIVIO)).appearance, 'userBubbleFullWidth'), false, `${caso}: nessun false scritto in locale`);
      assert.deepEqual({ piena: sulDisco(d).valori.userBubbleFullWidth, timbro: sulDisco(d).migrazioni }, { piena: false, timbro: [] }, `${caso}: e niente deciso sul disco`);
      rimetti();
      assert.deepEqual(await unAvvio(d, altro), caso === 'modello' ? { esito: 'applicata', finestra: false, modello: 'false' } : { esito: 'applicata', finestra: true, modello: 'true' }, `${caso}: decisa al riavvio, le due porte d accordo`);
    }
  });
});

/*
 * 0.2.2-DL, giro 6 (owner 10/11/2026 22:51, «Ultimo giro piccolo»; controllore del giro 5, R-A e R-B/M7) — IL SEGNO e L'INVIO IN VOLO.
 *   R-A: finché la migrazione aspetta, la finestra mostra accesa e il modello legge spenta, e nessuno lo diceva. Ora la finestra lo SA
 *   (`inDisaccordo()`, dai `nonConfermati` che le rotte le danno) e lo dice con un segno accanto all'interruttore; un tocco lo toglie.
 *   R-B (M7): un invio della finestra già in volo quando arriva la decisione la copriva sul server (finestra spenta, modello accesa).
 * Qui la finestra parla col servizio dalle ROTTE vere (`rotte-impostazioni.mjs`), non da una loro copia.
 */
const CAMPO = 'userBubbleFullWidth';
const ROTTA_FINESTRA = '/api/v1/app-settings/window';
const leggiVista = (archivio) => Number(archivio.get(CHIAVE_REVISIONE_VISTA));
/** Come `canale`, dalle rotte vere. `trattieni()` / `rilascia()`: l'invio della finestra resta in volo (la rete, o la fila del server). */
function canaleVero(f, s) {
  const rotta = creaRotteImpostazioni({ servizio: s.servizio });
  const chiedi = async (method, percorso, corpo = null) => {
    const r = await rotta({ method, percorso, corpo });
    if (r.stato !== 200) throw new Error(`${method} ${percorso}: ${r.stato} ${r.errore?.code}`);
    return r.dati;
  };
  const inviati = []; let apri = null; let cancello = null; let avvisi = 0;
  const sv = sorvegliante(f.window.localStorage); // giro 7 (K5)
  const c = creaCopiaSulServer({
    apiGet: (percorso) => chiedi('GET', percorso),
    apiPost: (percorso, corpo) => sv.traccia((async () => {
      if (percorso === ROTTA_FINESTRA) { inviati.push(corpo); if (cancello) await sv.trattenuto(cancello); }
      return chiedi('POST', percorso, corpo);
    })()),
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto,
    finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1,
    quandoCambianoINonConfermati: () => { avvisi += 1; },
  });
  const stacca = s.servizio.finestra.ascolta((evento) => { void sv.traccia(c.suEvento(evento)); });
  return { canale: c, inviati, stacca, avvisi: () => avvisi, quiete: sv.quiete, finché: sv.finché, trattenuti: sv.trattenuti,
    trattieni: () => { cancello = new Promise((r) => { apri = r; }); }, rilascia: () => { const a = apri; cancello = null; apri = null; a?.(); } };
}
/** La 0.2.2 aperta con la migrazione in sospeso (le ricevute ci sono ma non si leggono). */
async function apertaInSospeso(caso) {
  const d = cartella();
  const { archivio } = caso === 'modello' ? await sceltaDelModello020(d) : await maiToccata020(d);
  const rimetti = nascondiRicevute(d);
  const s = server(d);
  const f = finestra(APP_021, archivio);
  const k = canaleVero(f, s);
  const primaDiSentire = k.canale.inDisaccordo();
  const { esito } = await k.canale.avvio();
  const due = async () => ({ segno: k.canale.inDisaccordo(), finestra: f.mostra(), modello: (await s.modello()).valore });
  return { d, archivio, rimetti, s, f, k, primaDiSentire, esito, due };
}

test('FIN-10 (giro 6, R-A) · la migrazione aspetta: la finestra SA che le due porte non sono d accordo (il segno); il cambio di un altra voce non lo toglie; UN tocco sull interruttore lo toglie subito e le rimette d accordo, un secondo la riaccende, e il segno non torna', async () => {
  await zitto(async () => {
    for (const caso of ['maiToccata', 'modello']) {
      const a = await apertaInSospeso(caso);
      assert.deepEqual({ prima: a.primaDiSentire, esito: a.esito, ...(await a.due()), avvisi: a.k.avvisi() },
        { prima: [], esito: 'allineata', segno: [CAMPO], finestra: true, modello: 'false', avvisi: 1 }, `${caso}: all apertura la finestra lo sa, e lo dice a chi disegna (una volta)`);
      const inLocale = a.archivio.get(CHIAVE_ARCHIVIO); // mai toccata: la finestra non ha ancora salvato niente
      assert.equal(inLocale ? Object.hasOwn(JSON.parse(inLocale).appearance, CAMPO) : false, false, `${caso}: saperlo non scrive nessun false in locale (la regola del giro 5 resta)`);
      await cambiaAltraVoce({ f: a.f, c: a.k.canale, quiete: a.k.quiete });
      assert.deepEqual({ ...(await a.due()), avvisi: a.k.avvisi() }, { segno: [CAMPO], finestra: true, modello: 'false', avvisi: 1 }, `${caso}: un altra voce non lo toglie, e non lo ridisegna`);
      /* UN tocco: il segno va via PRIMA ancora dell'invio (la finestra mostra già ciò che il modello legge) */
      a.f.aggiornaAspetto({ [CAMPO]: false });
      assert.deepEqual(a.k.canale.inDisaccordo(), [], `${caso}: via subito`);
      a.k.canale.dopoCambioDellaPersona(); await a.k.quiete();
      assert.deepEqual({ ...(await a.due()), timbro: sulDisco(a.d).migrazioni }, { segno: [], finestra: false, modello: 'false', timbro: [MIGRAZIONE_DOMANDE_LARGHE] }, `${caso}: d accordo, e la migrazione è chiusa`);
      /* il secondo tocco la riaccende: ora è una scelta come le altre, e il segno NON torna */
      a.f.aggiornaAspetto({ [CAMPO]: true });
      assert.deepEqual(a.k.canale.inDisaccordo(), [], `${caso}: nessun segno mentre l invio parte`);
      a.k.canale.dopoCambioDellaPersona(); await a.k.quiete();
      assert.deepEqual(await a.due(), { segno: [], finestra: true, modello: 'true' }, `${caso}: due tocchi per tenerla accesa`);
      a.k.stacca(); await a.s.ferma(); a.rimetti();
      assert.deepEqual(await unAvvio(a.d, a.archivio), { esito: 'allineata', finestra: true, modello: 'true' }, `${caso}: al riavvio resta`);
    }
  });
});

test('FIN-10b (giro 6, MISURA di un limite) · due tocchi dentro la stessa attesa dell invio (300 ms nell app): parte UN invio che porta «accesa», niente si decide e il segno RESTA', async () => {
  await zitto(async () => {
    const a = await apertaInSospeso('maiToccata');
    const primaDeiTocchi = a.k.inviati.length;
    a.f.aggiornaAspetto({ [CAMPO]: false }); a.k.canale.dopoCambioDellaPersona();
    a.f.aggiornaAspetto({ [CAMPO]: true }); a.k.canale.dopoCambioDellaPersona();
    await a.k.quiete();
    /* il file della 0.2.0 non ha ancora il timbro, e niente lo ha riscritto: `migrazioni` non c'è (in FIN-05 è `[]` dopo un'altra scrittura) */
    assert.deepEqual({ invii: a.k.inviati.length - primaDeiTocchi, portato: a.k.inviati.at(-1).valori[CAMPO], ...(await a.due()), timbro: sulDisco(a.d).migrazioni ?? [] },
      { invii: 1, portato: true, segno: [CAMPO], finestra: true, modello: 'false', timbro: [] });
    a.k.stacca(); await a.s.ferma(); a.rimetti();
  });
});

test('FIN-11 (giro 6, R-A; giudice v1377 (ii)) · il segno va via SENZA ricaricare quando decide l altra porta: il `set` del modello eseguito, `/settings` della persona, le ricevute tornate leggibili', async () => {
  await zitto(async () => {
    const strade = {
      /* la persona chiede al modello di spegnerla: il `set` allo stesso valore la conferma, e la finestra aperta si spegne */
      setDelModello: async (a) => { assert.match((await a.s.cambia([{ key: VOCE, value: false }])).testo, /^appearance\.userBubbleFullWidth: true → false \(/u); return false; }, // giro 7 (K2): il cambio che la persona vede
      settings: async (a) => { assert.deepEqual((await a.s.servizio.applicaDallaPersona({ changes: [{ key: VOCE, value: false }], origine: { tipo: 'persona' } })).gia, [VOCE]); return false; },
      /* mai toccata, le ricevute tornano: lo scarto ⇒ accesa sulle due porte */
      ricevuteTornate: async (a) => { a.rimetti(); assert.equal(await a.s.copia.ritentaMigrazioni(), 'fatta'); return true; },
    };
    for (const [strada, decide] of Object.entries(strade)) {
      const a = await apertaInSospeso('maiToccata');
      assert.deepEqual(await a.due(), { segno: [CAMPO], finestra: true, modello: 'false' }, strada);
      const avvisiPrima = a.k.avvisi();
      const deciso = await decide(a);
      await a.s.servizio.attendiScritture(); await a.k.quiete();
      assert.deepEqual({ ...(await a.due()), avvisi: a.k.avvisi() - avvisiPrima }, { segno: [], finestra: deciso, modello: String(deciso), avvisi: 1 }, `${strada}: stessa finestra, nessun avvio nuovo`);
      assert.deepEqual(sulDisco(a.d).migrazioni, [MIGRAZIONE_DOMANDE_LARGHE], strada);
      /* e non torna: la finestra ha DIMENTICATO il valore in sospeso (se lo tenesse, il prossimo tocco farebbe lampeggiare il segno) */
      a.f.aggiornaAspetto({ [CAMPO]: !deciso });
      assert.deepEqual(a.k.canale.inDisaccordo(), [], `${strada}: il tocco dopo non lo fa tornare`);
      a.k.canale.dopoCambioDellaPersona(); await a.k.quiete();
      assert.deepEqual(await a.due(), { segno: [], finestra: !deciso, modello: String(!deciso) }, strada);
      a.k.stacca(); await a.s.ferma();
      if (strada !== 'ricevuteTornate') a.rimetti();
    }
  });
});

test('FIN-12 (giro 6; giudice v1377 (ii)) · D ACCORDO il segno non compare MAI: 0 su 80 controlli (4 storie × 5 aperture × 4 momenti), e chi disegna non viene mai chiamato', async () => {
  await zitto(async () => {
    const storie = {
      nuova022: async () => new Map(),
      maiToccataDecisa: async (d) => (await maiToccata020(d)).archivio,
      sceltaDelModelloDecisa: async (d) => (await sceltaDelModello020(d)).archivio,
      spentaDallaPersonaNella022: async (d) => { const { archivio } = await maiToccata020(d); await unAvvio(d, archivio, (v) => cambiaAltraVoce(v, { [CAMPO]: false })); return archivio; },
    };
    let controlli = 0; let segni = 0; let avvisi = 0;
    for (const [nome, prepara] of Object.entries(storie)) {
      const d = cartella();
      const archivio = await prepara(d);
      for (let apertura = 1; apertura <= 5; apertura += 1) {
        const s = server(d);
        const f = finestra(APP_021, archivio);
        const k = canaleVero(f, s);
        await k.canale.avvio();
        const conta = (quando) => { controlli += 1; const n = k.canale.inDisaccordo().length; segni += n; assert.equal(n, 0, `${nome}, apertura ${apertura}, ${quando}`); };
        conta('all apertura');
        await cambiaAltraVoce({ f, c: k.canale, quiete: k.quiete }, { chatFullWidth: apertura % 2 === 1 });
        conta('dopo un altra voce');
        f.aggiornaAspetto({ [CAMPO]: !f.mostra() }); // la persona tocca proprio quell'interruttore
        conta('appena toccato l interruttore');
        k.canale.dopoCambioDellaPersona(); await k.quiete();
        conta('dopo l invio del tocco');
        assert.equal(String(f.mostra()), (await s.modello()).valore, `${nome}, apertura ${apertura}: le due porte d accordo`);
        avvisi += k.avvisi();
        k.stacca(); await s.ferma();
      }
    }
    assert.deepEqual({ controlli, segni, avvisi }, { controlli: 80, segni: 0, avvisi: 0 });
  });
});

/*
 * giro 6, R-B (M7 del controllore del giro 5, le sue prove CTRL-M7-a…d portate qui): 0.2.2 aperta con la migrazione in sospeso; le
 *   ricevute tornano leggibili; la persona cambia UN'ALTRA voce e l'invio resta in volo (porta «accesa», il valore di serie della
 *   finestra); la decisione arriva da un'altra strada e spegne la finestra; poi l'invio arriva al server, che ormai ha deciso e prende
 *   quell'«accesa» vecchia. Ora la finestra, vista la risposta, si accorge che non mostra più ciò che ha mandato e RIMANDA.
 */
async function scenaInVolo(prepara, decide, trattenuto = true) {
  const d = cartella();
  const { archivio } = await prepara(d);
  const rimetti = nascondiRicevute(d);
  const s = server(d);
  const f = finestra(APP_021, archivio);
  const k = canaleVero(f, s);
  await k.canale.avvio();
  rimetti();
  if (trattenuto) k.trattieni();
  f.aggiornaAspetto({ chatFullWidth: true }); k.canale.dopoCambioDellaPersona();
  if (trattenuto) await k.finché(() => k.trattenuti() === 1); else await k.quiete(); // giro 7 (K5): l invio è partito (e, se trattenuto, resta in volo)
  const inVolo = k.inviati.at(-1)?.valori[CAMPO];
  await decide(s);
  await s.servizio.attendiScritture(); await k.quiete();
  const dopoDecisione = { finestra: f.mostra(), modello: (await s.modello()).valore, timbro: sulDisco(d).migrazioni.length };
  k.rilascia(); await k.quiete();
  const dopoInvio = { segno: k.canale.inDisaccordo(), finestra: f.mostra(), modello: (await s.modello()).valore, chat: sulDisco(d).valori.chatFullWidth, vista: leggiVista(archivio) === sulDisco(d).revisione };
  const invii = k.inviati.length;
  const attesa = { finestra: f.leggiImpostazioniDesktop().appearance.askTimeout, disco: sulDisco(d).valori.askTimeout }; // la voce che il `set` del modello cambia
  k.stacca(); await s.ferma();
  const riavvio1 = await unAvvio(d, archivio);
  const riavvio2 = await unAvvio(d, archivio);
  return { inVolo, dopoDecisione, dopoInvio, invii, attesa, riavvio1, riavvio2 };
}
const colSetDelModello = (s) => s.cambia([{ key: 'chat.questionTimeout', value: '60' }]);
const colRitento = (s) => s.copia.ritentaMigrazioni();

test('FIN-13 (giro 6, R-B; controllore CTRL-M7-a, -b) · scelta del MODELLO con la ricevuta, invio della finestra IN VOLO quando arriva la decisione ⇒ la scelta resta sulle due porte, subito e ai due riavvii', async () => {
  await zitto(async () => {
    for (const [strada, decide] of [['set del modello su un altra voce', colSetDelModello], ['ritento delle ricevute', colRitento]]) {
      const m = await scenaInVolo(sceltaDelModello020, decide);
      assert.equal(m.inVolo, true, `${strada}: l invio in volo porta «accesa» (il valore di serie della finestra)`);
      assert.deepEqual(m.dopoDecisione, { finestra: false, modello: 'false', timbro: 1 }, `${strada}: la decisione tiene la scelta e la finestra aperta si spegne`);
      assert.deepEqual(m.dopoInvio, { segno: [], finestra: false, modello: 'false', chat: true, vista: true }, `${strada}: arrivato l invio vecchio, la finestra rimanda ciò che mostra; l altra voce resta scritta`);
      assert.deepEqual({ r1: m.riavvio1, r2: m.riavvio2 }, { r1: { esito: 'allineata', finestra: false, modello: 'false' }, r2: { esito: 'allineata', finestra: false, modello: 'false' } }, strada);
    }
  });
});

test('FIN-13b (giro 6; controllore CTRL-M7-c, -d) · controlli: senza invio in volo la scelta resta e non parte nessun invio in più; MAI TOCCATA con l invio in volo ⇒ accesa sulle due porte e niente false in locale', async () => {
  await zitto(async () => {
    const senzaVolo = await scenaInVolo(sceltaDelModello020, colSetDelModello, false);
    assert.deepEqual({ dopoInvio: senzaVolo.dopoInvio, r2: senzaVolo.riavvio2 }, { dopoInvio: { segno: [], finestra: false, modello: 'false', chat: true, vista: true }, r2: { esito: 'allineata', finestra: false, modello: 'false' } });
    const maiToccata = await scenaInVolo(maiToccata020, colRitento);
    assert.deepEqual({ dopoInvio: maiToccata.dopoInvio, invii: maiToccata.invii, r2: maiToccata.riavvio2 },
      { dopoInvio: { segno: [], finestra: true, modello: 'true', chat: true, vista: true }, invii: 1, r2: { esito: 'allineata', finestra: true, modello: 'true' } }, 'd accordo ⇒ nessun invio in più');
    /* decide un `set` del modello su UN'ALTRA voce: l'invio in volo portava quella voce al valore vecchio, e il server l'ha preso DOPO il
       `set`. Lo stesso guasto di M7 su una voce qualunque: la finestra rimanda (un invio in più, dovuto), e il `set` del modello resta. */
    const colSet = await scenaInVolo(maiToccata020, colSetDelModello);
    assert.deepEqual({ dopoInvio: colSet.dopoInvio, invii: colSet.invii, attesa: colSet.attesa, r2: colSet.riavvio2 },
      { dopoInvio: { segno: [], finestra: true, modello: 'true', chat: true, vista: true }, invii: 2, attesa: { finestra: '60', disco: '60' }, r2: { esito: 'allineata', finestra: true, modello: 'true' } }, 'il `set` del modello non si perde sotto l invio in volo');
  });
});

test('FIN-16 (giro 6) · una voce cambiata dal server a finestra aperta e RIPORTATA dalla persona al valore di prima: l invio parte (prima no: «niente è cambiato dall ultimo invio») e porta il valore della persona', async () => {
  const archivio = new Map();
  const f = finestra(APP_021, archivio);
  const mandati = []; let revisione = 4;
  const sv = sorvegliante(f.window.localStorage); // giro 7 (K5)
  const c = creaCopiaSulServer({
    apiGet: async () => ({ revisione, valori: {} }),
    apiPost: (percorso, corpo) => sv.traccia((async () => { if (percorso.endsWith('/applied')) return { ok: true }; mandati.push(corpo.valori); revisione += 1; return { revisione }; })()),
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto, finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1,
  });
  await c.avvio();
  assert.equal(f.mostra(), true);
  revisione += 1;
  await c.suEvento({ type: EVENTO_IMPOSTAZIONI_FINESTRA, destinatario: DESTINATARIO_FINESTRE_PC, richiestaId: 'r-spegne', valori: { [CAMPO]: false }, revisione });
  c.dopoCambioDellaPersona(); await sv.quiete(); // l'evento `talos:settings-persisted` di un salvataggio qualunque: niente è cambiato
  assert.deepEqual({ mostra: f.mostra(), mandati: mandati.length }, { mostra: false, mandati: 0 }, 'applicato dal server: la finestra non lo rimanda indietro');
  f.aggiornaAspetto({ [CAMPO]: true }); c.dopoCambioDellaPersona(); await sv.quiete();
  assert.deepEqual({ mandati: mandati.length, portato: mandati.at(-1)?.[CAMPO] }, { mandati: 1, portato: true }, 'la persona la riporta com era: il server lo deve sapere');
  f.aggiornaAspetto({ [CAMPO]: true }); c.dopoCambioDellaPersona(); await sv.quiete();
  assert.equal(mandati.length, 1, 'al contrario: lo stesso valore una seconda volta non manda niente');
});

test('FIN-14 (giro 6, R-B) · un evento PIÙ VECCHIO dell ultima revisione vista (arrivato dopo la risposta a un invio) non la abbassa, e la finestra rimanda ciò che mostra; un evento più nuovo si applica e basta', async () => {
  const archivio = new Map();
  const f = finestra(APP_021, archivio);
  const mandati = []; let revisione = 7;
  const sv = sorvegliante(f.window.localStorage); // giro 7 (K5)
  const c = creaCopiaSulServer({
    apiGet: async () => ({ revisione, valori: {} }),
    apiPost: (percorso, corpo) => sv.traccia((async () => { if (percorso.endsWith('/applied')) return { ok: true }; mandati.push(corpo.valori); revisione += 1; return { revisione }; })()),
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto, finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1,
  });
  assert.deepEqual(await c.avvio(), { esito: 'applicata', campi: [] });
  assert.equal(leggiVista(archivio), 7);
  const evento = (rev, valore, id) => ({ type: EVENTO_IMPOSTAZIONI_FINESTRA, destinatario: DESTINATARIO_FINESTRE_PC, richiestaId: id, valori: { [CAMPO]: valore }, revisione: rev });
  revisione = 9; // il modello ha scritto due volte: la seconda arriva subito, la prima in ritardo
  await c.suEvento(evento(9, false, 'r-nuovo'));
  await sv.quiete();
  assert.deepEqual({ mostra: f.mostra(), vista: leggiVista(archivio), mandati: mandati.length }, { mostra: false, vista: 9, mandati: 0 }, 'più nuovo: applicato, nessun invio');
  await c.suEvento(evento(8, true, 'r-vecchio'));
  assert.equal(leggiVista(archivio), 9, 'la revisione vista non torna indietro');
  await sv.quiete();
  assert.deepEqual({ mostra: f.mostra(), vista: leggiVista(archivio), mandati: mandati.length, portato: mandati.at(-1)?.[CAMPO] }, { mostra: true, vista: 10, mandati: 1, portato: true }, 'più vecchio: la finestra rimanda ciò che mostra, e torna pari al server');
});

test('FIN-15 (giro 6, R-A) · una risposta PARTITA prima della decisione e arrivata dopo non rimette il segno; quella a un invio partito dopo vale di nuovo', async () => {
  const archivio = new Map();
  const f = finestra(APP_021, archivio);
  let apri = null; let avvisi = 0; let revisione = 3; let inSospeso = { [CAMPO]: false };
  const sv = sorvegliante(f.window.localStorage); // giro 7 (K5)
  const c = creaCopiaSulServer({
    apiGet: async () => ({ revisione, valori: {}, nonConfermati: inSospeso }),
    apiPost: (percorso) => sv.traccia((async () => {
      if (percorso.endsWith('/applied')) return { ok: true };
      const risposta = { revisione: (revisione += 1), ...(inSospeso ? { nonConfermati: inSospeso } : {}) }; // il server risponde con ciò che sa ADESSO
      await sv.trattenuto(new Promise((r) => { apri = r; }));
      return risposta;
    })()),
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto, finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1,
    quandoCambianoINonConfermati: () => { avvisi += 1; },
  });
  await c.avvio();
  assert.deepEqual({ segno: c.inDisaccordo(), avvisi }, { segno: [CAMPO], avvisi: 1 });
  f.aggiornaAspetto({ chatFullWidth: true }); c.dopoCambioDellaPersona(); await sv.finché(() => sv.trattenuti() === 1); // l'invio parte, e resta in volo
  /* le ricevute tornano: lo scarto ⇒ «accesa» decisa, e l'evento arriva alla finestra PRIMA della risposta vecchia */
  inSospeso = null; revisione += 1;
  await c.suEvento({ type: EVENTO_IMPOSTAZIONI_FINESTRA, destinatario: DESTINATARIO_FINESTRE_PC, richiestaId: 'r-deciso', valori: { [CAMPO]: true }, revisione });
  assert.deepEqual({ segno: c.inDisaccordo(), avvisi }, { segno: [], avvisi: 2 }, 'deciso: il segno se ne va');
  apri(); await sv.quiete();
  assert.deepEqual({ segno: c.inDisaccordo(), avvisi, mostra: f.mostra() }, { segno: [], avvisi: 2, mostra: true }, 'la risposta vecchia diceva ancora «in sospeso»: non lo rimette');
  /* al contrario: una risposta a un invio partito DOPO vale (il server dice di nuovo «in sospeso», la finestra gli crede) */
  inSospeso = { [CAMPO]: false };
  f.aggiornaAspetto({ chatFullWidth: false }); c.dopoCambioDellaPersona(); await sv.finché(() => sv.trattenuti() === 1); apri(); await sv.quiete();
  assert.deepEqual({ segno: c.inDisaccordo(), avvisi }, { segno: [CAMPO], avvisi: 3 });
});

/*
 * giro 6, ripresa (mutanti F16 e F15 rimasti vivi alla prima corsa): le prove che mancavano.
 *   · F16: il rimando dopo un invio in volo (R-B) non spezza la raffica della persona: se un suo invio è già programmato, quello basta
 *     («una volta sola dopo una raffica di cambi», `dopoCambioDellaPersona`). Contati gli invii: 2, non 3.
 *   · F15: chi disegna il segno che lancia non ferma il canale: l'avvio, l'evento del server e la sua risposta `/applied` vanno avanti.
 */
test('FIN-17 (giro 6, ripresa; mutante F16) · invio in volo e la persona che continua a toccare: alla risposta non parte un invio in più, parte il suo dopo l attesa, con tutti i suoi cambi', async () => {
  const archivio = new Map();
  const f = finestra(APP_021, archivio);
  const mandati = []; let revisione = 2; let cancello = null; let apri = null;
  const sv = sorvegliante(f.window.localStorage); // giro 7 (K5)
  const c = creaCopiaSulServer({
    apiGet: async () => ({ revisione, valori: {} }),
    apiPost: (percorso, corpo) => sv.traccia((async () => {
      if (percorso.endsWith('/applied')) return { ok: true };
      mandati.push(corpo.valori);
      if (cancello) await sv.trattenuto(cancello);
      return { revisione: (revisione += 1) };
    })()),
    /* giro 7: 1 s invece dei 300 ms dell'app, perché nemmeno una macchina carica faccia partire l'invio della persona prima del controllo */
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto, finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1000,
  });
  assert.deepEqual(await c.avvio(), { esito: 'applicata', campi: [] });
  cancello = new Promise((r) => { apri = r; });
  f.aggiornaAspetto({ chatFullWidth: !f.leggiImpostazioniDesktop().appearance.chatFullWidth }); c.dopoCambioDellaPersona(); await sv.finché(() => sv.trattenuti() === 1); // l'attesa dell'invio, poi l'invio parte e resta in volo
  assert.equal(mandati.length, 1, 'il primo invio parte ed è in volo');
  cancello = null;
  /* in volo, la persona tocca un altro interruttore: il suo invio è programmato fra 1 s */
  f.aggiornaAspetto({ [CAMPO]: !f.mostra() }); c.dopoCambioDellaPersona();
  apri(); await sv.finché(() => sv.attivi() === 0); // la risposta è arrivata e la finestra l'ha letta (l'invio della persona aspetta ancora)
  /*
   * giro 7 (mutante F16 tornato vivo con le attese a evento): un rimando sbagliato partirebbe con un timer da 0 ms creato mentre la
   *   finestra leggeva la risposta. Un timer da 0 ms creato ADESSO gira dopo di lui (Node: i timer della stessa durata partono in ordine
   *   di creazione), quindi quando gira il nostro quel rimando sarebbe già partito. È l'ordine della coda, non una pausa a tempo.
   */
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(mandati.length, 1, 'arrivata la risposta: la finestra non mostra più ciò che ha mandato, ma un invio della persona è già programmato e basta');
  /* e continua a toccare dentro l'attesa: la raffica resta UN invio */
  f.aggiornaAspetto({ chatFullWidth: !f.leggiImpostazioniDesktop().appearance.chatFullWidth }); c.dopoCambioDellaPersona(); await sv.quiete();
  const ora = f.leggiImpostazioniDesktop().appearance;
  assert.deepEqual({ invii: mandati.length, portati: { chat: mandati.at(-1).chatFullWidth, piena: mandati.at(-1)[CAMPO] } },
    { invii: 2, portati: { chat: ora.chatFullWidth, piena: ora[CAMPO] } }, 'due invii in tutto, l ultimo con ciò che la finestra mostra');
  assert.equal(archivio.get(CHIAVE_DA_MANDARE), '0', 'niente rimasto da mandare');
});

test('FIN-18 (giro 6, ripresa; mutante F15) · chi disegna il segno e lancia un errore non ferma il canale: l avvio, l evento del server e la risposta `/applied` vanno avanti', async () => {
  const archivio = new Map();
  const f = finestra(APP_021, archivio);
  const risposte = []; let revisione = 3; let chiamate = 0;
  const c = creaCopiaSulServer({
    apiGet: async () => ({ revisione, valori: {}, nonConfermati: { [CAMPO]: false } }),
    apiPost: async (percorso, corpo) => { if (percorso.endsWith('/applied')) { risposte.push(corpo); return { ok: true }; } return { revisione: (revisione += 1) }; },
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto, finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1,
    quandoCambianoINonConfermati: () => { chiamate += 1; throw new Error('chi disegna si è rotto'); },
  });
  assert.deepEqual(await c.avvio(), { esito: 'applicata', campi: [] }, 'non «non-raggiunto»: l errore di chi disegna non è un errore di rete');
  assert.deepEqual({ segno: c.inDisaccordo(), chiamate, vista: leggiVista(archivio) }, { segno: [CAMPO], chiamate: 1, vista: 3 });
  const esito = await c.suEvento({ type: EVENTO_IMPOSTAZIONI_FINESTRA, destinatario: DESTINATARIO_FINESTRE_PC, richiestaId: 'r-deciso', valori: { [CAMPO]: false }, revisione: 4 });
  assert.deepEqual({ esito, risposte, segno: c.inDisaccordo(), chiamate, vista: leggiVista(archivio), mostra: f.mostra() },
    { esito: { applicati: { [CAMPO]: false }, nonApplicati: {} }, risposte: [{ richiestaId: 'r-deciso', applicati: { [CAMPO]: false } }], segno: [], chiamate: 2, vista: 4, mostra: false });
});

/*
 * 0.2.2-DL, giro 7 (controllore del giro 6, K2) — LA CONFERMA DEL MODELLO DALLA FINESTRA. La finestra mostra accesa col segno «non ancora
 *   confermata»; la persona chiede all'assistente di spegnerla e il suo `set` (0 carte) la spegne: ora quel cambio ha la RICEVUTA del
 *   modello, quindi nelle Impostazioni nasce «Cambiata da TALOS · Annulla» (`segniDalleRicevute`, la stessa funzione della pagina), e
 *   l'Annulla la riaccende sulle due porte.
 */
test('FIN-19 (giro 7, K2) · il `set` del modello che conferma la voce in attesa: la finestra si spegne, il segno «non confermata» va via e nasce «Cambiata da TALOS · Annulla»; l Annulla la riaccende sulle due porte', async () => {
  await zitto(async () => {
    const a = await apertaInSospeso('maiToccata');
    assert.deepEqual(await a.due(), { segno: [CAMPO], finestra: true, modello: 'false' });
    assert.equal(segniDalleRicevute(await a.s.servizio.ricevute()).has(VOCE), false, 'prima: nessun «Cambiata da TALOS»');
    const set = await a.s.cambia([{ key: VOCE, value: false }]);
    await a.k.quiete();
    assert.deepEqual(await a.due(), { segno: [], finestra: false, modello: 'false' });
    const segni = segniDalleRicevute(await a.s.servizio.ricevute());
    assert.equal(segni.get(VOCE)?.id, set.ricevuta, '«Cambiata da TALOS · Annulla» accanto all interruttore');
    await a.s.servizio.annullaDallaPersona({ receiptId: set.ricevuta, origine: { tipo: 'persona' } });
    await a.k.quiete();
    assert.deepEqual(await a.due(), { segno: [], finestra: true, modello: 'true' }, 'l Annulla la rimette com era a schermo, per tutti');
    assert.equal(segniDalleRicevute(await a.s.servizio.ricevute()).has(VOCE), false, 'annullata: il segno va via');
    a.k.stacca(); await a.s.ferma(); a.rimetti();
  });
});

/*
 * giro 7 (controllore del giro 6, mutanti X6 e X1 vivi):
 *   · X6: dopo un evento del server l'ultimo allineamento prende SOLO i campi che la finestra manda. Gli aggiornamenti automatici della
 *     finestra installata, prima che il guscio abbia detto il suo stato, non stanno fra ciò che la finestra manda: se entrassero
 *     nell'allineamento, il salvataggio dopo (niente cambiato) partirebbe lo stesso, un invio doppio.
 *   · X1: un campo che la finestra non ha non è «in disaccordo» (niente da confrontare, niente segno).
 */
test('FIN-20 (giro 7; mutante X6) · un evento con un campo che la finestra non manda non lo mette nell allineamento: il salvataggio dopo, senza cambi, non manda niente', async () => {
  const archivio = new Map();
  const f = finestra(APP_021, archivio);
  const mandati = []; let revisione = 4;
  const sv = sorvegliante(f.window.localStorage);
  const aperte = [];
  const c = creaCopiaSulServer({
    apiGet: async () => ({ revisione, valori: {} }),
    apiPost: (percorso, corpo) => sv.traccia((async () => { if (percorso.endsWith('/applied')) return { ok: true }; mandati.push(corpo.valori); revisione += 1; return { revisione }; })()),
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto, memoria: f.window.localStorage, attesaInvioMs: 1,
    /* la finestra installata: il gettone del guscio c'è, lo stato degli aggiornamenti non ancora */
    finestra: { __talosAggiornamenti: { gettone: 'g' }, open: (url) => { aperte.push(url); } },
  });
  assert.deepEqual(await c.avvio(), { esito: 'applicata', campi: [] });
  revisione += 1;
  const esito = await c.suEvento({ type: EVENTO_IMPOSTAZIONI_FINESTRA, destinatario: DESTINATARIO_FINESTRE_PC, richiestaId: 'r-agg', valori: { [CAMPO]: false, aggiornamentiAutomatici: true }, revisione });
  assert.deepEqual({ applicati: esito.applicati, aperte: aperte.length }, { applicati: { [CAMPO]: false, aggiornamentiAutomatici: true }, aperte: 1 }, 'al guscio si chiede, e si dice ciò che si è chiesto');
  c.dopoCambioDellaPersona(); await sv.quiete(); // un salvataggio qualunque (`talos:settings-persisted`): niente è cambiato
  assert.equal(mandati.length, 0, 'nessun invio doppio');
});

test('FIN-21 (giro 7; mutante X1) · `inDisaccordo`: un campo in sospeso che la finestra non ha non mette il segno; uno che ha e mostra diverso sì', async () => {
  const f = finestra(APP_021, new Map());
  const senza = (aspetto) => { const { [CAMPO]: _via, ...resto } = aspetto; return resto; };
  const crea = (leggiAspetto) => creaCopiaSulServer({
    apiGet: async () => ({ revisione: 3, valori: {}, nonConfermati: { [CAMPO]: false } }), apiPost: async () => ({ revisione: 4 }),
    leggiAspetto, applicaPatch: f.aggiornaAspetto, finestra: {}, memoria: { getItem: () => null, setItem: () => {} }, attesaInvioMs: 1,
  });
  const senzaIlCampo = crea(() => senza(f.leggiImpostazioniDesktop().appearance));
  await senzaIlCampo.avvio();
  assert.deepEqual(senzaIlCampo.inDisaccordo(), [], 'una finestra senza quella preferenza non ha niente da confrontare');
  const conIlCampo = crea(() => f.leggiImpostazioniDesktop().appearance);
  await conIlCampo.avvio();
  assert.deepEqual(conIlCampo.inDisaccordo(), [CAMPO], 'al contrario: mostra accesa, il modello legge spenta');
});

/*
 * giro 7 (controllore del giro 6, K6; mutanti X12 e X13 vivi) — IL FILO IN `legacy/app.js`, con le funzioni VERE della pagina (estratte
 *   come fa `finestra()` qui sopra) e tutto il resto finto: il segno «non ancora confermata» si ridisegna (1) a ogni disegno delle
 *   Impostazioni, ANCHE quando le ricevute non arrivano (è il caso in cui serve), (2) quando la copia dice che i non confermati sono
 *   cambiati, (3) a ogni salvataggio della persona, anche senza invio; e un disegno che si rompe non rompe la pagina.
 */
test('FIN-22 (giro 7, K6; mutanti X12, X13) · il filo di app.js: il segno si ridisegna al disegno delle Impostazioni (anche senza ricevute), quando la copia lo chiede e a ogni salvataggio', async () => {
  const funzione = (nome) => bloccoDa(APP_021, APP_021.search(new RegExp(`(async )?function ${nome}\\s*\\(`)));
  const daQui = (inizio) => { const i = APP_021.indexOf(inizio); assert.notEqual(i, -1, inizio); return i; };
  const copiaDaApp = `${bloccoDa(APP_021, daQui('const copiaImpostazioniSulServer = creaCopiaSulServer({'))});`;
  const ascoltoDaApp = APP_021.slice(daQui("document.addEventListener('talos:settings-persisted'"), APP_021.indexOf('\n', daQui("document.addEventListener('talos:settings-persisted'")));
  const conti = { segni: [], mandati: 0, ricevute: 0 };
  let opzioni = null; let rompi = false; let ricevute = null;
  const ascolti = new Map();
  const finti = {
    $: (sel) => (sel === '#schermoImpostazioni' ? { radice: true } : null),
    caricaCatalogoImpostazioni: async () => true,
    leggiRicevuteImpostazioni: async () => { conti.ricevute += 1; return ricevute; },
    montaSegniImpostazioni: () => 0, annullaImpostazioni: async () => {}, segnaNonAnnullato: () => null,
    montaSegniNonConfermate: (radice, campi) => { if (rompi) throw new Error('il disegno si è rotto'); conti.segni.push(campi); return campi.length; },
    creaCopiaSulServer: (o) => { opzioni = o; return { inDisaccordo: () => [CAMPO], dopoCambioDellaPersona: () => { conti.mandati += 1; } }; },
    apiGet: () => null, apiPost: () => null, leggiImpostazioniDesktop: () => ({ appearance: {} }), aggiornaAspettoDesktop: () => {},
    workspacePreferences: { update: () => {} }, HOST: () => ({ classList: { contains: () => false } }),
    document: { addEventListener: (tipo, fn) => { ascolti.set(tipo, fn); } },
  };
  const nomi = Object.keys(finti);
  const corpo = [copiaDaApp, funzione('aggiornaSegniImpostazioni'), funzione('aggiornaSegniNonConfermate'), ascoltoDaApp,
    'return { aggiornaSegniImpostazioni, aggiornaSegniNonConfermate };'].join('\n');
  // eslint-disable-next-line no-new-func
  const pagina = new Function(...nomi, corpo)(...nomi.map((n) => finti[n]));
  /* (1) il disegno delle Impostazioni, con le ricevute che NON arrivano (null): il segno si mette lo stesso */
  await pagina.aggiornaSegniImpostazioni();
  assert.deepEqual({ segni: conti.segni, ricevute: conti.ricevute }, { segni: [[CAMPO]], ricevute: 1 }, 'X13: al disegno, prima delle ricevute');
  /* (2) la copia dice che i non confermati sono cambiati */
  assert.equal(typeof opzioni?.quandoCambianoINonConfermati, 'function', 'app.js passa chi ridisegna alla copia');
  opzioni.quandoCambianoINonConfermati();
  assert.equal(conti.segni.length, 2);
  /* (3) un salvataggio: con `saved` manda e ridisegna, senza ridisegna e basta */
  const salvato = ascolti.get('talos:settings-persisted');
  salvato({ detail: { saved: true } });
  assert.deepEqual({ segni: conti.segni.length, mandati: conti.mandati }, { segni: 3, mandati: 1 }, 'X12: il tocco toglie il segno subito');
  salvato({ detail: { saved: false } });
  assert.deepEqual({ segni: conti.segni.length, mandati: conti.mandati }, { segni: 4, mandati: 1 });
  /* un disegno che si rompe non rompe la pagina (né il salvataggio, né il disegno delle Impostazioni) */
  rompi = true;
  assert.doesNotThrow(() => salvato({ detail: { saved: true } }));
  await pagina.aggiornaSegniImpostazioni();
  assert.equal(conti.mandati, 2);
});

/*
 * giro 7 (mutante X7, «invii doppi» del controllore: ucciso a intermittenza col vecchio file a pause, vivo con le attese a evento) —
 *   l'evento del server con la STESSA revisione che la finestra ha già visto (la risposta al suo invio è arrivata prima) è la stessa
 *   scrittura: si applica e basta, nessun rimando. Solo uno più VECCHIO fa rimandare (FIN-14).
 */
test('FIN-23 (giro 7; mutante X7) · un evento con la revisione già vista non fa rimandare: un invio solo, niente da mandare', async () => {
  const archivio = new Map();
  const f = finestra(APP_021, archivio);
  const mandati = []; let revisione = 4;
  const sv = sorvegliante(f.window.localStorage);
  const c = creaCopiaSulServer({
    apiGet: async () => ({ revisione, valori: {} }),
    apiPost: (percorso, corpo) => sv.traccia((async () => { if (percorso.endsWith('/applied')) return { ok: true }; mandati.push(corpo.valori); revisione += 1; return { revisione }; })()),
    leggiAspetto: () => f.leggiImpostazioniDesktop().appearance, applicaPatch: f.aggiornaAspetto, finestra: {}, memoria: f.window.localStorage, attesaInvioMs: 1,
  });
  assert.deepEqual(await c.avvio(), { esito: 'applicata', campi: [] });
  f.aggiornaAspetto({ [CAMPO]: !f.mostra() }); c.dopoCambioDellaPersona(); await sv.quiete();
  assert.deepEqual({ mandati: mandati.length, vista: leggiVista(archivio) }, { mandati: 1, vista: 5 });
  /* l'eco della stessa scrittura, con la revisione 5 */
  await sv.traccia(c.suEvento({ type: EVENTO_IMPOSTAZIONI_FINESTRA, destinatario: DESTINATARIO_FINESTRE_PC, richiestaId: 'r-eco', valori: { [CAMPO]: f.mostra() }, revisione: 5 }));
  await sv.quiete();
  assert.deepEqual({ mandati: mandati.length, vista: leggiVista(archivio), daMandare: archivio.get(CHIAVE_DA_MANDARE) }, { mandati: 1, vista: 5, daMandare: '0' }, 'stessa revisione: nessun invio in più');
});
