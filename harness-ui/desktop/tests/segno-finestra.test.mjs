/*
 * FE-070, il guscio del segno del computer use (contratto `Downloads/TALOS/desktop/in-corso/CONTRATTO-SEGNO-COMPUTER-USE-2026-11-05.md`, sezione «segno-finestra.mjs»;
 *   nota `computer-use-pc-segue-il-bozzetto-05-11`). Electron non parte: finestre e schermo sono finti e si iniettano, come in `bolla-finestra.test.mjs`.
 *   Il resto (livello sopra le app a tutto schermo, scale miste, esclusione dalle catture) si prova dal vivo nel treno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  INDIRIZZO_RIPIEGO, MESSAGGIO_ASSENTE, creaSegnoFinestre, indirizzoSegno, opzioniFinestraSegno, schermoFisico, windowsVecchio,
} from '../segno-finestra.mjs';

const BASE = 'http://127.0.0.1:51234';
/* due schermi: il principale al 150%, il secondo a destra al 100% (in DIP, come li dà Electron) */
const PRINCIPALE = Object.freeze({ id: 1, bounds: { x: 0, y: 0, width: 1280, height: 720 }, workArea: { x: 0, y: 0, width: 1280, height: 680 }, scaleFactor: 1.5 });
const SECONDO = Object.freeze({ id: 2, bounds: { x: 1280, y: 0, width: 1920, height: 1080 }, workArea: { x: 1280, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 });

/* la conversione di Windows, finta ma fedele: ogni schermo ha la sua scala, l'origine fisica del secondo è dopo la larghezza fisica del primo */
function dipFisico(r) {
  if (r.x >= SECONDO.bounds.x) return { x: 1920 + (r.x - 1280), y: r.y, width: r.width, height: r.height };
  return { x: Math.round(r.x * 1.5), y: Math.round(r.y * 1.5), width: Math.round(r.width * 1.5), height: Math.round(r.height * 1.5) };
}

function finti({ schermi = [PRINCIPALE, SECONDO], windows = true, protezione = true, protezioneTiene = true } = {}) {
  const finestre = [];
  const chiamate = [];
  class FintaFinestra {
    constructor(opzioni) {
      this.opzioni = opzioni; this.confini = { x: opzioni.x, y: opzioni.y, width: opzioni.width, height: opzioni.height };
      this.caricati = []; this.eventi = {}; this.contenuto = {}; this.distrutta = false; this.visibile = false; this.fuoco = false;
      this.ordine = []; this.eseguiti = []; this.apertura = null; this.rimessa = null;
      const io = this;
      this.webContents = {
        setWindowOpenHandler(f) { io.apertura = f; },
        on(nome, f) { (io.contenuto[nome] ??= []).push(f); },
        async executeJavaScript(codice) { io.eseguiti.push(codice); },
        /* lo zoom come Chromium: di serie per origine, quindi il menu «Ingrandisci» della principale arriva anche qui */
        zoom: 1, modoZoom: 'default',
        setZoomMode(modo) { this.modoZoom = modo; },
        /* come Electron: su un webContents distrutto ogni metodo lancia «Object has been destroyed» */
        chiamateZoom: 0,
        setZoomFactor(fattore) { this.chiamateZoom++; if (io.distrutta) throw new TypeError('Object has been destroyed'); this.zoom = fattore; },
      };
      finestre.push(this);
    }
    on(nome, f) { (this.eventi[nome] ??= []).push(f); }
    once(nome, f) { this.on(nome, f); }
    emetti(nome, ...a) { for (const f of this.eventi[nome] ?? []) f(...a); }
    emettiContenuto(nome, ...a) { for (const f of this.contenuto[nome] ?? []) f(...a); }
    async loadURL(u) { this.caricati.push(u); }
    setIgnoreMouseEvents(si) { this.ordine.push(['ignora', si]); }
    setAlwaysOnTop(si, livello) { this.ordine.push(['sopra', si, livello]); }
    setContentProtection(si) { if (!protezione) throw new Error('non disponibile'); this.ordine.push(['protetta', si]); this.protetta = si && (typeof protezioneTiene === 'function' ? protezioneTiene(this.opzioni) : protezioneTiene); }
    /* Electron: `setContentProtection` è void e tace se SetWindowDisplayAffinity fallisce; si legge dopo */
    isContentProtected() { return this.protetta === true; }
    setBounds(c) { this.confini = { ...c }; this.rimessa = { ...c }; }
    getBounds() { return { ...this.confini }; }
    isDestroyed() { return this.distrutta; }
    destroy() { this.distrutta = true; this.emetti('closed'); }
    show() { this.visibile = true; this.fuoco = true; this.ordine.push(['show']); }
    showInactive() { this.visibile = true; this.ordine.push(['showInactive']); }
    hide() { this.visibile = false; }
    isVisible() { return this.visibile; }
    focus() { this.fuoco = true; }
    /* come Electron: `did-navigate` col codice HTTP, poi `did-finish-load` */
    carica(codice = 200) { this.emettiContenuto('did-navigate', {}, this.caricati.at(-1), codice); this.emettiContenuto('did-finish-load'); }
  }
  const ascoltatori = {};
  const cursore = { x: 1500, y: 100 };
  const screen = {
    getAllDisplays: () => schermi.map(s => ({ ...s, bounds: { ...s.bounds } })),
    getPrimaryDisplay: () => schermi[0],
    getCursorScreenPoint: () => ({ ...cursore }),
    getDisplayNearestPoint: (p) => schermi.find(s => p.x >= s.bounds.x && p.x < s.bounds.x + s.bounds.width) ?? schermi[0],
    on(nome, f) { chiamate.push(['on', nome]); (ascoltatori[nome] ??= []).push(f); },
    removeListener(nome, f) { chiamate.push(['off', nome]); ascoltatori[nome] = (ascoltatori[nome] ?? []).filter(g => g !== f); },
  };
  if (windows) {
    screen.dipToScreenRect = (finestra, r) => { chiamate.push(['rect', finestra]); return dipFisico(r); };
    screen.dipToScreenPoint = (p) => { const r = dipFisico({ ...p, width: 0, height: 0 }); return { x: r.x, y: r.y }; };
  }
  const emettiSchermo = (nome, ...a) => { for (const f of ascoltatori[nome] ?? []) f({}, ...a); };
  const righe = [];
  const bolla = { messaggi: [], riesce: true };
  return {
    finestre, chiamate, ascoltatori, cursore, emettiSchermo, righe, bolla, schermi,
    dipendenze: { piattaforma: 'win32', BrowserWindow: FintaFinestra, screen, registro: (r) => righe.push(r), postaNellaBolla: (m) => { if (!bolla.riesce) return false; bolla.messaggi.push(m); return true; } },
  };
}
const prossimoGiro = () => new Promise((ok) => setImmediate(ok));
const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));
const vivi = (f) => f.finestre.filter(w => !w.distrutta);

test('SEGNO-FINESTRA-01 spento di serie: niente finestre, niente ascolto degli schermi, niente messaggi alla bolla', async () => {
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: false, vecchio: false });
  assert.equal(await segno.aggiorna(BASE, 1), false);
  segno.bollaPronta();
  assert.equal(segno.ripiego(), false);
  segno.chiudi();
  assert.deepEqual([f.finestre.length, f.chiamate.length, f.bolla.messaggi.length], [0, 0, 0]);
  const vecchio = finti();
  const s2 = creaSegnoFinestre({ ...vecchio.dipendenze, accesa: false, vecchio: true });
  s2.bollaPronta();
  assert.equal(vecchio.bolla.messaggi.length, 0, 'spento non avvisa nemmeno su Windows vecchio');
});

test('SEGNO-FINESTRA-02 la finestra: trasparente, senza cornice, senza fuoco, sopra, attraversabile, fuori dalle catture, stessa sessione, nessun ponte', async () => {
  const o = opzioniFinestraSegno({ x: 1, y: 2, width: 3, height: 4 });
  assert.deepEqual([o.x, o.y, o.width, o.height], [1, 2, 3, 4]);
  assert.deepEqual([o.frame, o.transparent, o.focusable, o.skipTaskbar, o.alwaysOnTop, o.show, o.hasShadow, o.resizable, o.movable],
    [false, true, false, true, true, false, false, false, false]);
  assert.equal(o.backgroundColor, '#00000000');
  assert.deepEqual(o.webPreferences, { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false });
  assert.equal('partition' in o.webPreferences, false, 'senza partition cookie e BroadcastChannel della bolla non si vedono');
  assert.equal('preload' in o.webPreferences, false, 'niente ipc');
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) {
    w.carica(200);
    const i = w.ordine.findIndex(([n]) => n === 'showInactive');
    assert.ok(i > 0, 'si mostra');
    const prima = w.ordine.slice(0, i);
    assert.deepEqual(prima, [['ignora', true], ['sopra', true, 'screen-saver'], ['protetta', true]], 'le tre cose PRIMA di showInactive');
    assert.equal(w.fuoco, false, 'mai il fuoco');
    assert.equal(w.ordine.some(([n]) => n === 'show'), false, 'mai show(), che dà il fuoco');
  }
});

test('SEGNO-FINESTRA-03 una finestra per schermo, coi limiti fisici e la scala nell indirizzo, solo numeri, solo 127.0.0.1', async () => {
  assert.deepEqual(schermoFisico(PRINCIPALE, { dipToScreenRect: (_w, r) => dipFisico(r) }), { fx: 0, fy: 0, fw: 1920, fh: 1080, scala: 1.5 });
  assert.deepEqual(schermoFisico(SECONDO, { dipToScreenRect: (_w, r) => dipFisico(r) }), { fx: 1920, fy: 0, fw: 1920, fh: 1080, scala: 1 });
  /* fuori da Windows (senza dipToScreenRect): si moltiplica per la scala dello schermo */
  assert.deepEqual(schermoFisico(PRINCIPALE, {}), { fx: 0, fy: 0, fw: 1920, fh: 1080, scala: 1.5 });
  assert.equal(indirizzoSegno(`${BASE}/?token=${'a'.repeat(64)}#x`, { fx: -1920, fy: 0, fw: 1920, fh: 1080, scala: 1.25 }),
    `${BASE}/segno.html?fx=-1920&fy=0&fw=1920&fh=1080&scala=1.25`);
  assert.equal(indirizzoSegno(BASE, { fx: 0, fy: 0, fw: 2880, fh: 1620, scala: 1.7500000001 }), `${BASE}/segno.html?fx=0&fy=0&fw=2880&fh=1620&scala=1.75`, 'al più sei decimali');
  for (const sbagliato of ['https://127.0.0.1:51234', 'http://localhost:51234', 'http://u:p@127.0.0.1:51234', 'http://127.0.0.1:80', 'non un indirizzo']) {
    assert.throws(() => indirizzoSegno(sbagliato, { fx: 0, fy: 0, fw: 1, fh: 1, scala: 1 }), /non consentito|Invalid URL/u, sbagliato);
  }
  /* solo numeri semplici, come vuole il server (`requireValidStaticQuery`, `^-?\d{1,6}(?:\.\d{1,6})?$`) e la pagina (misure e scala positive) */
  for (const s of [{ fx: NaN, fy: 0, fw: 1, fh: 1, scala: 1 }, { fx: 0, fy: 0, fw: 0, fh: 1, scala: 1 }, { fx: 0, fy: 0, fw: 1, fh: 1, scala: 0 },
    { fx: 1e7, fy: 0, fw: 1, fh: 1, scala: 1 }, { fx: 0, fy: 0, fw: 1, fh: 1, scala: Infinity }, { fx: '0', fy: 0, fw: 1, fh: 1, scala: 1 }]) {
    assert.throws(() => indirizzoSegno(BASE, s), /schermo/u, JSON.stringify(s));
  }
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  assert.equal(await segno.aggiorna(BASE, 1), true);
  assert.equal(f.finestre.length, 2, 'una per schermo');
  assert.deepEqual(f.finestre.map(w => w.caricati), [[`${BASE}/segno.html?fx=0&fy=0&fw=1920&fh=1080&scala=1.5`], [`${BASE}/segno.html?fx=1920&fy=0&fw=1920&fh=1080&scala=1`]]);
  assert.deepEqual(f.finestre.map(w => w.getBounds()), [PRINCIPALE.bounds, SECONDO.bounds], 'ogni finestra copre il suo schermo, in DIP');
  assert.deepEqual(f.finestre.map(w => w.rimessa), [PRINCIPALE.bounds, SECONDO.bounds], 'e ci viene rimessa dopo la creazione: con scale miste la prima misura può sbagliare');
  /* AL CONTRARIO: uno schermo con misure strane non apre una finestra rotta, e gli altri restano */
  const g = finti({ schermi: [PRINCIPALE, { ...SECONDO, scaleFactor: NaN }] });
  await creaSegnoFinestre({ ...g.dipendenze, screen: { ...g.dipendenze.screen, dipToScreenRect: undefined }, accesa: true, vecchio: false }).aggiorna(BASE, 1);
  assert.equal(g.finestre.length, 1);
  assert.match(g.righe.join('\n'), /schermo/u);
});

test('SEGNO-FINESTRA-04 ricarica solo quando cambia la generazione del server; una finestra chiusa si rifà', async () => {
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  assert.equal(await segno.aggiorna(BASE, 1), true);
  assert.equal(await segno.aggiorna(BASE, 1), false, 'stessa generazione: niente ricarica');
  assert.equal(await segno.aggiorna('http://127.0.0.1:51300', 2), true);
  assert.equal(f.finestre.length, 2, 'le stesse finestre');
  assert.deepEqual(f.finestre[0].caricati.map(u => new URL(u).origin), [BASE, 'http://127.0.0.1:51300']);
  for (const w of f.finestre) for (const u of w.caricati) assert.doesNotMatch(u, /token|ingresso/u);
  f.finestre[1].destroy();
  assert.equal(await segno.aggiorna('http://127.0.0.1:51300', 2), true, 'una finestra sparita rifà tutto il giro');
  assert.equal(vivi(f).length, 2);
  /* un indirizzo non locale non apre niente */
  const g = finti();
  await assert.rejects(creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false }).aggiorna('http://localhost:51234', 1), /non consentito/u);
  assert.equal(g.finestre.length, 0);
});

test('SEGNO-FINESTRA-05 cambio di schermi: si ricostruisce una volta sola, con la base di adesso; l area di lavoro da sola non conta; alla chiusura si smette di ascoltare', async () => {
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5 });
  await segno.aggiorna(BASE, 7);
  assert.deepEqual(Object.keys(f.ascoltatori).sort(), ['display-added', 'display-metrics-changed', 'display-removed']);
  await segno.aggiorna(BASE, 8);
  assert.equal(f.chiamate.filter(([c]) => c === 'on').length, 3, 'si ascolta una volta sola');
  /* la barra delle applicazioni che si nasconde cambia solo l area di lavoro: le finestre coprono lo schermo intero, restano */
  f.emettiSchermo('display-metrics-changed', SECONDO, ['workArea']);
  await aspetta(20);
  assert.equal(f.finestre.length, 2);
  /* uno schermo nuovo, poi due cambi di scala in fila: un solo giro */
  f.schermi.push({ id: 3, bounds: { x: -1920, y: 0, width: 1920, height: 1080 }, workArea: { x: -1920, y: 0, width: 1920, height: 1040 }, scaleFactor: 1 });
  f.emettiSchermo('display-added', f.schermi[2]);
  f.emettiSchermo('display-metrics-changed', PRINCIPALE, ['scaleFactor']);
  f.emettiSchermo('display-metrics-changed', PRINCIPALE, ['bounds', 'workArea']);
  await aspetta(30);
  assert.equal(f.finestre.length, 5, 'le due di prima più tre nuove');
  assert.deepEqual(f.finestre.slice(0, 2).map(w => w.distrutta), [true, true], 'le vecchie si chiudono');
  assert.equal(vivi(f).length, 3);
  for (const w of vivi(f)) assert.equal(w.caricati.length, 1, 'le nuove caricano subito, con la generazione di adesso');
  assert.ok(vivi(f).every(w => w.caricati[0].startsWith(`${BASE}/segno.html?`)));
  f.schermi.pop();
  f.emettiSchermo('display-removed', { id: 3 });
  await aspetta(30);
  assert.equal(vivi(f).length, 2);
  segno.chiudi();
  assert.equal(vivi(f).length, 0);
  assert.equal(f.chiamate.filter(([c]) => c === 'off').length, 3);
  assert.equal(await segno.aggiorna(BASE, 9), false, 'chiuso resta chiuso');
  assert.equal(segno.ripiego(), false);
  /* AL CONTRARIO: un cambio arrivato dopo la chiusura non riapre niente */
  f.emettiSchermo('display-added', f.schermi[0]);
  await aspetta(20);
  assert.equal(vivi(f).length, 0);
});

test('SEGNO-FINESTRA-06 si mostra solo una pagina arrivata con 200; la navigazione resta sull origine; ogni window.open si nega', async () => {
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  await segno.aggiorna(BASE, 1);
  const [w] = f.finestre;
  w.carica(404);
  assert.equal(w.visibile, false, 'un 404 trasparente e sempre sopra non si mostra');
  assert.match(f.righe.join('\n'), /404/u);
  await segno.aggiorna(BASE, 2);
  w.carica(200);
  assert.equal(w.visibile, true, 'il server riparte con la pagina: si mostra');
  await segno.aggiorna(BASE, 3);
  w.carica(404);
  assert.equal(w.visibile, false, 'un 404 dopo una pagina buona la nasconde');
  await segno.aggiorna(BASE, 4);
  w.carica(200);
  w.emettiContenuto('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', `${BASE}/segno.html`, true);
  assert.equal(w.visibile, false);
  /* AL CONTRARIO: una cornice che fallisce dentro la pagina non conta */
  await segno.aggiorna(BASE, 5);
  w.carica(200);
  w.emettiContenuto('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://x.test/', false);
  assert.equal(w.visibile, true);
  const fermata = (dest) => { let ferma = false; w.emettiContenuto('will-navigate', { preventDefault: () => { ferma = true; } }, dest); return ferma; };
  assert.equal(fermata(`${BASE}/segno.html?fx=0&fy=0&fw=1&fh=1&scala=1`), false);
  assert.equal(fermata('http://localhost:51234/segno.html'), true);
  assert.equal(fermata('https://evil.test/'), true);
  let rimando = false; w.emettiContenuto('will-redirect', { url: 'https://evil.test/', preventDefault: () => { rimando = true; } });
  assert.equal(rimando, true);
  for (const url of [INDIRIZZO_RIPIEGO, 'https://evil.test/', `${BASE}/`, 'talos-bolla:porta-davanti']) assert.deepEqual(w.apertura({ url }), { action: 'deny' }, url);
});

test('SEGNO-FINESTRA-07 Windows 10 prima della 2004: niente finestre, e la bolla lo sa una volta per avvio', async () => {
  assert.equal(windowsVecchio('win32', '10.0.18363'), true, '1909');
  assert.equal(windowsVecchio('win32', '10.0.19040'), true);
  assert.equal(windowsVecchio('win32', '10.0.19041'), false, '2004');
  assert.equal(windowsVecchio('win32', '10.0.22631'), false, 'Windows 11');
  assert.equal(windowsVecchio('win32', '6.3.9600'), true, 'Windows 8.1');
  assert.equal(windowsVecchio('win32', '9.0.99999'), true, 'prima di 10 conta la versione, non la build');
  assert.equal(windowsVecchio('win32', 'strano'), true, 'una versione che non si legge vale vecchia: meglio la pillola che un rettangolo nero');
  assert.equal(windowsVecchio('linux', '5.15.0'), false);
  assert.equal(windowsVecchio('darwin', '23.1.0'), false);
  assert.deepEqual(MESSAGGIO_ASSENTE, { tipo: 'segno-assente', motivo: 'windows-vecchio' });
  const f = finti();
  f.bolla.riesce = false;
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: true });
  assert.equal(await segno.aggiorna(BASE, 1), false);
  assert.equal(f.finestre.length, 0, 'nessuna finestra: con WDA_MONITOR sarebbe un rettangolo nero in ogni cattura');
  assert.equal(f.chiamate.length, 0, 'niente ascolto degli schermi');
  segno.bollaPronta();
  assert.equal(f.bolla.messaggi.length, 0, 'la bolla non era pronta: si riprova alla prossima');
  f.bolla.riesce = true;
  segno.bollaPronta();
  segno.bollaPronta();
  assert.deepEqual(f.bolla.messaggi, [MESSAGGIO_ASSENTE], 'una volta sola per avvio');
  /* AL CONTRARIO: su un Windows nuovo la bolla non riceve niente */
  const g = finti();
  const nuovo = creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false });
  nuovo.bollaPronta();
  assert.equal(g.bolla.messaggi.length, 0);
});

test('SEGNO-FINESTRA-08 ripiego (c): la pagina chiede con window.open, il guscio risponde col cursore vero in pixel fisici globali, a tutte le pagine pronte, al più ogni 100 ms', async () => {
  assert.equal(INDIRIZZO_RIPIEGO, 'talos-segno:ripiego');
  let ora = 1000;
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, adesso: () => ora });
  await segno.aggiorna(BASE, 1);
  const [a, b] = f.finestre;
  a.carica(200); b.carica(200);
  f.cursore.x = 1500; f.cursore.y = 100; // DIP sul secondo schermo
  assert.deepEqual(a.apertura({ url: INDIRIZZO_RIPIEGO }), { action: 'deny' });
  await prossimoGiro();
  const atteso = `postMessage(${JSON.stringify({ tipo: 'segno-ripiego', punto: { x: 2140, y: 100 } })}, location.origin)`;
  assert.deepEqual([a.eseguiti, b.eseguiti], [[atteso], [atteso]]);
  /* tutte le pagine chiedono allo stesso evento: una risposta sola */
  b.apertura({ url: INDIRIZZO_RIPIEGO });
  await prossimoGiro();
  assert.equal(a.eseguiti.length, 1);
  ora += 100;
  f.cursore.x = 100; f.cursore.y = 200; // sul principale al 150%
  b.apertura({ url: INDIRIZZO_RIPIEGO });
  await prossimoGiro();
  assert.equal(a.eseguiti.at(-1), `postMessage(${JSON.stringify({ tipo: 'segno-ripiego', punto: { x: 150, y: 300 } })}, location.origin)`);
  /* AL CONTRARIO: un indirizzo simile non chiede niente, e una pagina non pronta non riceve */
  ora += 1000;
  a.apertura({ url: `${INDIRIZZO_RIPIEGO}?x` });
  a.apertura({ url: 'talos-segno:ripieg' });
  await prossimoGiro();
  assert.equal(a.eseguiti.length, 2);
  await segno.aggiorna(BASE, 2);
  a.carica(404);
  b.carica(200);
  segno.ripiego();
  assert.deepEqual([a.eseguiti.length, b.eseguiti.length], [2, 3]);
  /* fuori da Windows: la scala dello schermo più vicino */
  const g = finti({ windows: false });
  let t = 0;
  const s2 = creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false, adesso: () => (t += 1000) });
  await s2.aggiorna(BASE, 1);
  g.finestre[0].carica(200);
  g.cursore.x = 100; g.cursore.y = 200;
  s2.ripiego();
  assert.equal(g.finestre[0].eseguiti[0], `postMessage(${JSON.stringify({ tipo: 'segno-ripiego', punto: { x: 150, y: 300 } })}, location.origin)`);
});

test('SEGNO-FINESTRA-09 senza la protezione dalle catture la finestra non si apre: il modello vedrebbe un cursore finto nelle sue foto', async () => {
  const f = finti({ protezione: false });
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  await segno.aggiorna(BASE, 1);
  assert.equal(vivi(f).length, 0);
  assert.match(f.righe.join('\n'), /catture/u);
  for (const w of f.finestre) assert.equal(w.ordine.some(([n]) => n === 'showInactive'), false);
  assert.deepEqual(f.finestre.map(w => [w.caricati.length, w.rimessa]), [[0, null], [0, null]], 'distrutta e lasciata lì: niente misure, niente pagina');
});

test('SEGNO-FINESTRA-10 main.mjs usa il guscio accanto alla bolla, e il modulo entra nel pacchetto', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /import \{ creaSegnoFinestre \} from '\.\/segno-finestra\.mjs';/u);
  assert.match(main, /creaSegnoFinestre\(\{ accesa: bollaAccesa\(process\.argv\), BrowserWindow, screen,/u, 'lo stesso cancello della bolla');
  assert.match(main, /postaNellaBolla: messaggio => bolla\.posta\(messaggio\)/u);
  assert.match(main, /quandoPronta: \(\) => segno\.bollaPronta\(\)/u);
  /* dopo la principale, alla stessa generazione, come la bolla */
  assert.match(main, /bolla\.aggiorna\(base, generazione\)[^\n]*\n\s*segno\.aggiorna\(base, generazione\)/u);
  assert.match(main, /bolla\.chiudi\(\); segno\.chiudi\(\);/u, 'all uscita');
  /* senza vassoio la principale chiusa chiude anche il segno, altrimenti `window-all-closed` non arriva */
  assert.match(main, /questa\.on\('closed', \(\) => \{[^}]*segno\.chiudi\(\);[^}]*\}\);/u);
  const pacchetto = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pacchetto.build.files.includes('segno-finestra.mjs'));
});

test('SEGNO-FINESTRA-11 lo zoom della principale non sposta il segno: zoom isolato, e fattore 1 a ogni caricamento', async () => {
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) {
    assert.equal(w.webContents.modoZoom, 'isolated', 'stessa origine della principale: senza isolamento il suo zoom arriva qui');
    w.webContents.zoom = 1.5; // «Ingrandisci» due volte nella principale
    w.carica(200);
    assert.equal(w.webContents.zoom, 1, 'dopo il caricamento la pagina disegna a pixel veri');
  }
  /* anche dopo una ricarica, e anche se la pagina non è arrivata */
  await segno.aggiorna(BASE, 2);
  const [w] = f.finestre;
  w.webContents.zoom = 0.8;
  w.carica(404);
  assert.equal(w.webContents.zoom, 1);
});

test('SEGNO-FINESTRA-12 la protezione dalle catture si rilegge: se Windows l ha rifiutata in silenzio la finestra si chiude, e la bolla lo sa una volta', async () => {
  const f = finti({ protezioneTiene: false });
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  segno.bollaPronta();
  await segno.aggiorna(BASE, 1);
  assert.equal(f.finestre.length, 2);
  for (const w of f.finestre) {
    assert.equal(w.distrutta, true);
    assert.equal(w.ordine.some(([n]) => n === 'showInactive' || n === 'show'), false, 'mai mostrata');
    assert.deepEqual([w.caricati.length, w.rimessa], [0, null]);
  }
  assert.match(f.righe.join('\n'), /protezione/u);
  assert.deepEqual(f.bolla.messaggi, [{ tipo: 'segno-assente', motivo: 'protezione' }], 'una volta sola, anche con due schermi');
  segno.bollaPronta();
  assert.equal(f.bolla.messaggi.length, 1);
  /* la bolla non ancora pronta: lo riceve quando lo diventa */
  const g = finti({ protezioneTiene: false });
  g.bolla.riesce = false;
  const s2 = creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false });
  await s2.aggiorna(BASE, 1);
  assert.equal(g.bolla.messaggi.length, 0);
  g.bolla.riesce = true;
  s2.bollaPronta();
  assert.deepEqual(g.bolla.messaggi, [{ tipo: 'segno-assente', motivo: 'protezione' }]);
  /* AL CONTRARIO: quando la protezione tiene, la bolla non riceve niente e le finestre restano */
  const h = finti();
  const s3 = creaSegnoFinestre({ ...h.dipendenze, accesa: true, vecchio: false });
  await s3.aggiorna(BASE, 1);
  s3.bollaPronta();
  assert.deepEqual([vivi(h).length, h.bolla.messaggi.length], [2, 0]);
});

test('SEGNO-FINESTRA-13 un cambio di schermi poco prima di chiudere non riapre niente dopo la chiusura', async () => {
  for (const timerCancellato of [true, false]) {
    const f = finti();
    const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5 });
    await segno.aggiorna(BASE, 1);
    f.emettiSchermo('display-metrics-changed', PRINCIPALE, ['scaleFactor']);
    /* la seconda volta il timer sfugge alla cancellazione: lo ferma il timer stesso, a guscio chiuso */
    const vero = globalThis.clearTimeout;
    if (!timerCancellato) globalThis.clearTimeout = () => {};
    try { segno.chiudi(); } finally { globalThis.clearTimeout = vero; }
    await aspetta(30);
    assert.deepEqual([f.finestre.length, vivi(f).length], [2, 0], `nessuna finestra dopo la chiusura (timer cancellato: ${timerCancellato})`);
  }
});

test('SEGNO-FINESTRA-14 fra la ricarica e il suo did-navigate il ripiego non arriva alla pagina che sta caricando', async () => {
  let ora = 0;
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, adesso: () => (ora += 1000) });
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) w.carica(200);
  assert.equal(segno.ripiego(), true);
  assert.deepEqual(f.finestre.map(w => w.eseguiti.length), [1, 1], 'pronte: ricevono');
  await segno.aggiorna(BASE, 2); // il server è ripartito: loadURL, e il did-navigate non è ancora arrivato
  assert.deepEqual(f.finestre.map(w => w.caricati.length), [2, 2]);
  segno.ripiego();
  assert.deepEqual(f.finestre.map(w => w.eseguiti.length), [1, 1], 'in caricamento: niente');
  for (const w of f.finestre) w.carica(200);
  segno.ripiego();
  assert.deepEqual(f.finestre.map(w => w.eseguiti.length), [2, 2], 'arrivata la pagina nuova: di nuovo');
});

test('SEGNO-FINESTRA-15 fuori da Windows niente finestre: dipToScreenRect e la protezione dalle catture lì non ci sono', async () => {
  for (const piattaforma of ['linux', 'darwin']) {
    const f = finti();
    const segno = creaSegnoFinestre({ ...f.dipendenze, piattaforma, accesa: true });
    assert.equal(await segno.aggiorna(BASE, 1), false, piattaforma);
    assert.equal(segno.ripiego(), false);
    segno.bollaPronta();
    segno.chiudi();
    assert.deepEqual([f.finestre.length, f.chiamate.length, f.bolla.messaggi.length], [0, 0, 0], piattaforma);
  }
  /* AL CONTRARIO: su Windows sì */
  const g = finti();
  assert.equal(await creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false }).aggiorna(BASE, 1), true);
  assert.equal(g.finestre.length, 2);
});

test('SEGNO-FINESTRA-16 protezione rifiutata su tutti gli schermi: un tentativo per schermo, una riga, un messaggio, poi più niente', async () => {
  /* rifiutata in silenzio (rilettura) e non disponibile (lancia): per il modello è la stessa cosa, un cursore nelle sue foto */
  for (const modo of [{ protezioneTiene: false }, { protezione: false }]) {
    const nome = JSON.stringify(modo);
    const f = finti(modo);
    const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5 });
    segno.bollaPronta();
    for (let g = 1; g <= 3; g++) assert.equal(await segno.aggiorna(BASE, g), false, `${nome} aggiorna ${g}`);
    f.emettiSchermo('display-added', SECONDO);
    f.emettiSchermo('display-metrics-changed', PRINCIPALE, ['scaleFactor']);
    await aspetta(30);
    assert.equal(segno.ripiego(), false, nome);
    assert.deepEqual([f.finestre.length, vivi(f).length], [2, 0], `${nome}: una finestra tentata per schermo, nessuna viva`);
    assert.equal(f.righe.length, 1, `${nome}: una riga sola nel registro: ${f.righe.join(' | ')}`);
    assert.match(f.righe[0], /catture/u);
    assert.deepEqual(f.bolla.messaggi, [{ tipo: 'segno-assente', motivo: 'protezione' }], nome);
    segno.chiudi();
  }
});

test('SEGNO-FINESTRA-17 protezione rifiutata su uno schermo solo: il segno si spegne anche dove teneva, e resta spento', async () => {
  let ora = 0;
  for (const rifiuta of [PRINCIPALE, SECONDO]) {
    const nome = `rifiuta lo schermo ${rifiuta.id}`;
    const f = finti({ protezioneTiene: (o) => o.x !== rifiuta.bounds.x });
    const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5, adesso: () => (ora += 1000) });
    segno.bollaPronta();
    assert.equal(await segno.aggiorna(BASE, 1), false, nome);
    assert.deepEqual([f.finestre.length, vivi(f).length], [2, 0], `${nome}: zero finestre vive, nemmeno quella protetta`);
    for (const w of f.finestre) {
      assert.deepEqual([w.caricati.length, w.visibile], [0, false], `${nome}: mai caricata, mai mostrata`);
      w.emettiContenuto('did-navigate', {}, BASE, 200); w.emettiContenuto('did-finish-load');
      assert.equal(w.visibile, false, `${nome}: un caricamento tardivo non la mostra`);
    }
    /* dopo: niente aggiorna, niente ripiego, niente ricostruzione dagli schermi */
    assert.equal(await segno.aggiorna(BASE, 2), false, nome);
    assert.equal(segno.ripiego(), false, nome);
    f.emettiSchermo('display-removed', SECONDO);
    await aspetta(30);
    assert.deepEqual([f.finestre.length, vivi(f).length], [2, 0], nome);
    assert.deepEqual(f.finestre.map(w => w.eseguiti.length), [0, 0], nome);
    assert.equal(f.righe.length, 1, `${nome}: ${f.righe.join(' | ')}`);
    assert.deepEqual(f.bolla.messaggi, [{ tipo: 'segno-assente', motivo: 'protezione' }], nome);
    segno.chiudi();
  }
});

test('SEGNO-FINESTRA-18 senza piattaforma vale process.platform: main.mjs non la passa', async () => {
  /* creaSegnoFinestre({ piattaforma }) senza la chiave: il valore di serie lo decide */
  const senza = (f) => { const { piattaforma: _tolta, ...resto } = f.dipendenze; return resto; };
  const f = finti();
  const windows = process.platform === 'win32';
  assert.equal(await creaSegnoFinestre({ ...senza(f), accesa: true, vecchio: false }).aggiorna(BASE, 1), windows, process.platform);
  assert.equal(f.finestre.length, windows ? 2 : 0, process.platform);
  /* e su tutte e due le strade, qualunque sia la macchina della prova: il valore di serie si legge alla chiamata */
  const vero = Object.getOwnPropertyDescriptor(process, 'platform');
  try {
    for (const [piattaforma, attese] of [['linux', 0], ['darwin', 0], ['win32', 2]]) {
      Object.defineProperty(process, 'platform', { ...vero, value: piattaforma });
      const g = finti();
      assert.equal(await creaSegnoFinestre({ ...senza(g), accesa: true, vecchio: false }).aggiorna(BASE, 1), attese > 0, piattaforma);
      assert.deepEqual([g.finestre.length, g.chiamate.length > 0], [attese, attese > 0], piattaforma);
    }
  } finally {
    Object.defineProperty(process, 'platform', vero);
  }
  assert.equal(process.platform, vero.value);
});

test('SEGNO-FINESTRA-19 una finestra distrutta prima del suo did-finish-load non tocca lo zoom', async () => {
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  await segno.aggiorna(BASE, 1);
  const [w, altra] = f.finestre;
  w.destroy(); // la chiusura arriva fra did-navigate e did-finish-load
  assert.doesNotThrow(() => w.carica(200), 'Electron lancia su un webContents distrutto');
  assert.equal(w.webContents.chiamateZoom, 0, 'nessuna chiamata a una finestra già chiusa');
  assert.equal(w.visibile, false);
  /* la sorella viva resta servita */
  altra.carica(200);
  assert.equal(altra.webContents.chiamateZoom, 1);
  assert.equal(altra.webContents.zoom, 1);
});
