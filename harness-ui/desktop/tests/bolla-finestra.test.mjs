/*
 * FE-066, il guscio della bolla del computer use (forma `Downloads/TALOS/frontend/in-corso/FORMA-BOLLA-COMPUTER-USE-2026-11-03.md`). Electron non parte: la finestra, la
 *   scorciatoia e lo schermo sono finti e si iniettano, come fa Hermes con `globalShortcut` (`apps/desktop/electron/quick-entry.ts:373-378`). Il resto si prova dal vivo nel treno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARGOMENTO_BOLLA, INDIRIZZO_PORTA_DAVANTI, MISURA_BOLLA, SCORCIATOIA_BOLLA, bollaAccesa, creaBolla, etichettaBolla, indirizzoBolla, leggiPosto, nuoviConfini, opzioniFinestraBolla,
} from '../bolla-finestra.mjs';

const AREA = Object.freeze({ x: 0, y: 0, width: 1920, height: 1040 });
const BASE = 'http://127.0.0.1:51234';

function finti({ registrabile = true } = {}) {
  const finestre = [];
  class FintaFinestra {
    constructor(opzioni) {
      this.opzioni = opzioni; this.confini = { x: opzioni.x, y: opzioni.y, width: opzioni.width, height: opzioni.height };
      this.caricati = []; this.eventi = {}; this.contenuto = {}; this.distrutta = false; this.visibile = false; this.fuoco = false; this.sopra = null; this.protetta = false; this.apertura = null;
      const io = this;
      this.webContents = {
        setWindowOpenHandler(f) { io.apertura = f; },
        on(nome, f) { (io.contenuto[nome] ??= []).push(f); },
      };
      finestre.push(this);
    }
    on(nome, f) { (this.eventi[nome] ??= []).push(f); }
    once(nome, f) { this.on(nome, f); }
    emetti(nome, ...a) { for (const f of this.eventi[nome] ?? []) f(...a); }
    emettiContenuto(nome, ...a) { for (const f of this.contenuto[nome] ?? []) f(...a); }
    async loadURL(u) { this.caricati.push(u); }
    setAlwaysOnTop(si, livello) { this.sopra = [si, livello]; }
    setContentProtection(si) { this.protetta = si; }
    getBounds() { return { ...this.confini }; }
    setBounds(c) { this.confini = { ...c }; this.emetti('move'); }
    isDestroyed() { return this.distrutta; }
    destroy() { this.distrutta = true; this.emetti('closed'); }
    show() { this.visibile = true; }
    showInactive() { this.visibile = true; }
    hide() { this.visibile = false; this.fuoco = false; }
    isVisible() { return this.visibile; }
    focus() { this.fuoco = true; }
    /* come Electron: `did-navigate` col codice HTTP della pagina, prima di `ready-to-show` */
    carica(codice = 200) { this.emettiContenuto('did-navigate', {}, this.caricati.at(-1), codice); }
  }
  const scorciatoie = new Map();
  const globalShortcut = {
    isRegistered: (a) => scorciatoie.has(a),
    register: (a, f) => { if (!registrabile) return false; scorciatoie.set(a, f); return true; },
    unregister: (a) => { scorciatoie.delete(a); },
  };
  const screen = { getPrimaryDisplay: () => ({ workArea: AREA }), getDisplayMatching: () => ({ workArea: AREA }) };
  const righe = [];
  const davanti = { volte: 0 };
  return { finestre, scorciatoie, righe, davanti, dipendenze: { BrowserWindow: FintaFinestra, globalShortcut, screen, registro: (r) => righe.push(r), portaDavanti: () => { davanti.volte += 1; } } };
}

const cartella = () => mkdtempSync(join(tmpdir(), 'talos-bolla-guscio-'));
const prossimoGiro = () => new Promise((ok) => setImmediate(ok));

test('BOLLA-GUSCIO-01 spenta di serie: senza l opzione niente finestra, niente scorciatoia, niente voce', async () => {
  assert.equal(bollaAccesa([]), false);
  assert.equal(bollaAccesa(['TALOS.exe', '--talos-bolla=1']), false, 'la forma è una sola');
  assert.equal(bollaAccesa(['TALOS.exe', ARGOMENTO_BOLLA]), true);
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: false, filePosto: join(cartella(), 'bolla.json'), lingua: 'it-IT' });
  assert.equal(await bolla.aggiorna(BASE, 1), false);
  assert.equal(bolla.registraScorciatoia().registrata, false);
  bolla.mostra();
  assert.deepEqual([f.finestre.length, f.scorciatoie.size, bolla.voceDelMenu()], [0, 0, null]);
});

test('BOLLA-GUSCIO-02 la finestra: senza cornice, trasparente, sopra, fuori dalle catture, stessa sessione, nessun ponte, misura dalla pagina', async () => {
  const o = opzioniFinestraBolla({ x: 1, y: 2, width: 3, height: 4 });
  assert.deepEqual([o.frame, o.transparent, o.skipTaskbar, o.alwaysOnTop, o.show, o.resizable], [false, true, true, true, false, false]);
  assert.deepEqual(o.webPreferences, { contextIsolation: true, nodeIntegration: false, sandbox: true, enablePreferredSizeMode: true });
  assert.equal('partition' in o.webPreferences, false, 'senza partition cookie e BroadcastChannel non si vedono');
  assert.equal('preload' in o.webPreferences, false, 'niente ipc: la forma lo esclude');
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'en-US' });
  await bolla.aggiorna(BASE, 1);
  const [w] = f.finestre;
  assert.deepEqual(w.sopra, [true, 'screen-saver']);
  assert.equal(w.protetta, true);
  w.carica(200);
  w.emetti('ready-to-show');
  assert.equal(w.visibile, true);
  assert.equal(w.fuoco, false, 'a riposo non ruba il fuoco');
});

test('BOLLA-GUSCIO-03 carica bolla.html senza gettone, e ricarica DOPO la principale solo quando la generazione cambia', async () => {
  assert.equal(indirizzoBolla(`${BASE}/?token=${'a'.repeat(64)}#x`), `${BASE}/bolla.html`);
  for (const sbagliato of ['https://127.0.0.1:51234', 'http://localhost:51234', 'http://u:p@127.0.0.1:51234', 'http://127.0.0.1:80', 'http://127.0.0.1', 'non un indirizzo']) {
    assert.throws(() => indirizzoBolla(sbagliato), /non consentito|Invalid URL/u, sbagliato);
  }
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'it' });
  assert.equal(await bolla.aggiorna(BASE, 1), true);
  assert.equal(await bolla.aggiorna(BASE, 1), false, 'stessa generazione: niente ricarica');
  assert.equal(await bolla.aggiorna('http://127.0.0.1:51300', 2), true, 'server ripartito: credenziale nuova, si ricarica');
  assert.deepEqual(f.finestre[0].caricati, [`${BASE}/bolla.html`, 'http://127.0.0.1:51300/bolla.html']);
  assert.equal(f.finestre.length, 1);
  for (const u of f.finestre[0].caricati) assert.doesNotMatch(u, /token|ingresso/u);
  /* una finestra chiusa si rifà alla generazione seguente */
  f.finestre[0].destroy();
  assert.equal(await bolla.aggiorna('http://127.0.0.1:51300', 2), true);
  assert.equal(f.finestre.length, 2);
});

test('BOLLA-GUSCIO-04 window.open: «porta davanti» chiama portaDavanti e nega; ogni altra finestra si nega e basta; la navigazione resta sull origine', async () => {
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'it' });
  await bolla.aggiorna(BASE, 1);
  const [w] = f.finestre;
  assert.equal(INDIRIZZO_PORTA_DAVANTI, 'talos-bolla:porta-davanti');
  assert.deepEqual(w.apertura({ url: INDIRIZZO_PORTA_DAVANTI }), { action: 'deny' });
  await prossimoGiro();
  assert.equal(f.davanti.volte, 1);
  for (const url of ['talos-bolla:porta-davanti?x', 'https://evil.test/', `${BASE}/`, 'talos-desktop://menu']) assert.deepEqual(w.apertura({ url }), { action: 'deny' }, url);
  await prossimoGiro();
  assert.equal(f.davanti.volte, 1, 'solo l indirizzo esatto');
  const fermata = (dest) => { let ferma = false; w.emettiContenuto('will-navigate', { preventDefault: () => { ferma = true; } }, dest); return ferma; };
  assert.equal(fermata(`${BASE}/bolla.html`), false);
  assert.equal(fermata('http://localhost:51234/bolla.html'), true);
  assert.equal(fermata('https://evil.test/'), true);
  let rimando = false; w.emettiContenuto('will-redirect', { url: 'https://evil.test/', preventDefault: () => { rimando = true; } });
  assert.equal(rimando, true);
});

test('BOLLA-GUSCIO-05 la misura viene dalla pagina: il fondo e il centro restano fermi, i limiti tengono la finestra sullo schermo', async () => {
  const attuali = { x: 720, y: 950, width: 480, height: 64 };
  assert.deepEqual(nuoviConfini(attuali, { width: 480, height: 300 }, AREA), { x: 720, y: 714, width: 480, height: 300 }, 'la carta cresce verso l alto');
  assert.deepEqual(nuoviConfini(attuali, { width: 100, height: 10 }, AREA), { x: 960 - MISURA_BOLLA.minL / 2, y: 1014 - MISURA_BOLLA.minA, width: MISURA_BOLLA.minL, height: MISURA_BOLLA.minA });
  assert.deepEqual(nuoviConfini(attuali, { width: 5000, height: 5000 }, AREA).width, MISURA_BOLLA.maxL);
  assert.equal(nuoviConfini(attuali, { width: 5000, height: 5000 }, AREA).height, MISURA_BOLLA.maxA);
  assert.deepEqual(nuoviConfini({ x: 1800, y: 0, width: 480, height: 64 }, { width: 480, height: 300 }, AREA), { x: 1440, y: 0, width: 480, height: 300 }, 'dentro l area di lavoro');
  const f = finti();
  const file = join(cartella(), 'bolla.json');
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: file, lingua: 'it' });
  await bolla.aggiorna(BASE, 1);
  const [w] = f.finestre;
  const prima = w.getBounds();
  w.emettiContenuto('preferred-size-changed', {}, { width: prima.width, height: 260 });
  assert.equal(w.getBounds().height, 260);
  assert.equal(w.getBounds().y + w.getBounds().height, prima.y + prima.height);
});

test('BOLLA-GUSCIO-06 ricorda il posto: centro e fondo in bolla.json, riletti al prossimo avvio; un file rotto vale «di serie»', async (t) => {
  const dir = cartella();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'bolla.json');
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: file, lingua: 'it', ritardoSalva: 0 });
  await bolla.aggiorna(BASE, 1);
  const [w] = f.finestre;
  assert.equal(w.getBounds().y + w.getBounds().height, AREA.y + AREA.height - MISURA_BOLLA.margine, 'di serie in basso al centro');
  w.setBounds({ x: 100, y: 200, width: 480, height: 64 });
  await new Promise((ok) => setTimeout(ok, 20));
  assert.deepEqual(leggiPosto(file), { centro: 340, fondo: 264 });
  const g = finti();
  await creaBolla({ ...g.dipendenze, accesa: true, filePosto: file, lingua: 'it' }).aggiorna(BASE, 1);
  assert.deepEqual(g.finestre[0].getBounds(), { x: 100, y: 200, width: 480, height: 64 });
  writeFileSync(file, '{rotto');
  assert.equal(leggiPosto(file), null);
  writeFileSync(file, JSON.stringify({ centro: 'x', fondo: 3 }));
  assert.equal(leggiPosto(file), null);
  assert.equal(existsSync(`${file}.tmp`), false, 'scrittura con temporaneo e rinomina');
});

test('BOLLA-GUSCIO-07 la scorciatoia: registrata mostra e dà il fuoco; occupata da un altro programma si dice, nel registro e nel menu, nelle due lingue', async () => {
  assert.equal(SCORCIATOIA_BOLLA, 'Control+Alt+Space');
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'en-US' });
  await bolla.aggiorna(BASE, 1);
  assert.deepEqual(bolla.registraScorciatoia(), { registrata: true, occupata: false, scorciatoia: SCORCIATOIA_BOLLA });
  f.finestre[0].carica(200);
  f.scorciatoie.get(SCORCIATOIA_BOLLA)();
  assert.deepEqual([f.finestre[0].visibile, f.finestre[0].fuoco], [true, true]);
  assert.match(bolla.voceDelMenu().label, /^Show the bubble \(Ctrl\+Alt\+Space\)$/u);
  bolla.voceDelMenu().click();
  bolla.chiudi();
  assert.equal(f.scorciatoie.size, 0, 'alla chiusura si rilascia');
  assert.equal(f.finestre[0].distrutta, true);

  const occupata = finti({ registrabile: false });
  const it = creaBolla({ ...occupata.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'it-IT' });
  assert.deepEqual(it.registraScorciatoia(), { registrata: false, occupata: true, scorciatoia: SCORCIATOIA_BOLLA });
  assert.match(occupata.righe.join('\n'), /Ctrl\+Alt\+Space.*un altro programma/u);
  assert.equal(it.voceDelMenu().label, 'Mostra la bolla (un altro programma usa Ctrl+Alt+Space)');
  assert.equal(etichettaBolla('en', { occupata: true, scorciatoia: SCORCIATOIA_BOLLA }), 'Show the bubble (another program uses Ctrl+Alt+Space)');
  /* il mouse resta: la voce apre la bolla anche senza scorciatoia */
  await it.aggiorna(BASE, 1);
  occupata.finestre[0].carica(200);
  it.voceDelMenu().click();
  assert.equal(occupata.finestre[0].fuoco, true);
});

/*
 * N5 della seconda revisione (S3): senza la pagina (il ramo del Frontend che serve `/bolla.html`, `static-files.mjs:41-43`, non ancora fuso) la finestra caricava un
 *   404, trasparente e sempre sopra. Ora si mostra solo una pagina arrivata con 200: un 404 o un caricamento fallito la nascondono e lo dicono nel registro.
 */
test('BOLLA-GUSCIO-09 (N5) senza la pagina la bolla non si mostra: né all avvio, né con la scorciatoia, né dal menu; un ricaricamento buono la rimette', async () => {
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'it' });
  await bolla.aggiorna(BASE, 1);
  bolla.registraScorciatoia();
  const [w] = f.finestre;
  w.carica(404);
  w.emetti('ready-to-show');
  assert.equal(w.visibile, false, 'un 404 trasparente non si mostra');
  f.scorciatoie.get(SCORCIATOIA_BOLLA)();
  bolla.voceDelMenu().click();
  assert.equal(w.visibile, false, 'nemmeno a richiesta');
  assert.match(f.righe.join('\n'), /404/u);
  /* il server riparte con la pagina: si mostra a richiesta */
  await bolla.aggiorna(BASE, 2);
  w.carica(200);
  f.scorciatoie.get(SCORCIATOIA_BOLLA)();
  assert.deepEqual([w.visibile, w.fuoco], [true, true]);
  /* il server riparte SENZA la pagina: la bolla visibile si nasconde */
  await bolla.aggiorna(BASE, 21);
  w.carica(404);
  assert.equal(w.visibile, false, 'un 404 dopo una pagina buona la nasconde');
  /* mentre la pagina nuova arriva, la scorciatoia non apre una finestra ancora vuota */
  await bolla.aggiorna(BASE, 22);
  f.scorciatoie.get(SCORCIATOIA_BOLLA)();
  assert.equal(w.visibile, false, 'durante il ricaricamento');
  w.carica(200);
  /* anche dopo una pagina buona: finché la nuova non è arrivata la scorciatoia aspetta */
  bolla.mostra();
  assert.equal(w.visibile, true);
  w.hide();
  await bolla.aggiorna(BASE, 23);
  f.scorciatoie.get(SCORCIATOIA_BOLLA)();
  assert.equal(w.visibile, false, 'la pagina di prima non vale per quella nuova');
  w.carica(200);
  /* un caricamento che fallisce dopo la nasconde */
  bolla.mostra();
  assert.equal(w.visibile, true);
  await bolla.aggiorna(BASE, 3);
  w.emettiContenuto('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', `${BASE}/bolla.html`, true);
  assert.equal(w.visibile, false);
  /* AL CONTRARIO: una cornice dentro la pagina che fallisce non conta */
  await bolla.aggiorna(BASE, 4);
  w.carica(200);
  bolla.mostra();
  w.emettiContenuto('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://x.test/', false);
  assert.equal(w.visibile, true);
});

/*
 * N4 della seconda revisione (S3): la bolla è fuori dalle catture e sempre sopra, quindi il computer use non la vede ma i suoi clic la colpiscono. Hermes fa passare i
 *   clic con un canale verso la pagina (`hud-ipc.ts:173`, `setIgnoreMouseEvents(true, { forward: true })`), che qui non c'è; e «Ferma» deve restare raggiungibile col
 *   mouse. Il guscio quindi DICE dove sta la bolla: il computer use esclude quel rettangolo dai suoi clic. Si decide col computer use prima di accenderla (rapporto).
 */
test('BOLLA-GUSCIO-10 (N4) il guscio dice il rettangolo della bolla visibile, e nient altro', async () => {
  const f = finti();
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'it' });
  assert.equal(bolla.rettangoloFisico(), null, 'nessuna finestra');
  await bolla.aggiorna(BASE, 1);
  const [w] = f.finestre;
  assert.equal(bolla.rettangoloFisico(), null, 'nascosta');
  w.carica(200);
  w.emetti('ready-to-show');
  assert.deepEqual(bolla.rettangoloFisico(), w.getBounds());
  w.emettiContenuto('preferred-size-changed', {}, { width: 480, height: 300 });
  assert.deepEqual(bolla.rettangoloFisico(), w.getBounds(), 'segue la misura');
  w.destroy();
  assert.equal(bolla.rettangoloFisico(), null, 'distrutta');
  const spenta = creaBolla({ ...finti().dipendenze, accesa: false, filePosto: join(cartella(), 'b.json'), lingua: 'it' });
  assert.equal(spenta.rettangoloFisico(), null);
  const main = readFileSync(new URL('../bolla-finestra.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /il modello non la vede e non ci clicca sopra/u, 'il commento falso è tolto');
});

/*
 * 03/11 (Computer use): `getBounds()` è in pixel LOGICI (DIP); la cattura e i clic del computer use sono in pixel FISICI. A scala 150% la zona finiva nel posto sbagliato.
 *   Su Windows la conversione è del sistema (`screen.dipToScreenRect`, solo Windows); altrove si moltiplica per la scala dello schermo che la contiene.
 */
test('BOLLA-GUSCIO-11 il rettangolo della bolla è in pixel fisici, a ogni scala', async () => {
  const prova = async (schermo) => {
    const f = finti();
    const bolla = creaBolla({ ...f.dipendenze, screen: { ...f.dipendenze.screen, ...schermo(f.dipendenze.screen) }, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'it' });
    await bolla.aggiorna(BASE, 1);
    const [w] = f.finestre;
    w.carica(200);
    w.emetti('ready-to-show');
    return { fisico: bolla.rettangoloFisico(), logico: w.getBounds() };
  };
  const per = (r, k) => ({ x: Math.round(r.x * k), y: Math.round(r.y * k), width: Math.round(r.width * k), height: Math.round(r.height * k) });
  /* Windows: la conversione del sistema, con la finestra della bolla */
  let chiesta = null;
  const win = await prova(() => ({ dipToScreenRect: (finestra, r) => { chiesta = finestra; return per(r, 1.5); } }));
  assert.deepEqual(win.fisico, per(win.logico, 1.5));
  assert.ok(chiesta, 'la scala è quella dello schermo della bolla');
  /* altrove: la scala dello schermo che la contiene */
  const altrove = await prova((s) => ({ dipToScreenRect: undefined, getDisplayMatching: (c) => ({ ...s.getDisplayMatching(c), scaleFactor: 1.5 }) }));
  assert.deepEqual(altrove.fisico, per(altrove.logico, 1.5));
  /* AL CONTRARIO: a scala 1 resta uguale, e una bolla nascosta non ha rettangolo */
  const uno = await prova((s) => ({ dipToScreenRect: undefined, getDisplayMatching: (c) => ({ ...s.getDisplayMatching(c), scaleFactor: 1 }) }));
  assert.deepEqual(uno.fisico, uno.logico);
  const f = finti();
  assert.equal(creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'n.json'), lingua: 'it' }).rettangoloFisico(), null);
  assert.equal(typeof creaBolla({ ...f.dipendenze, accesa: false, filePosto: join(cartella(), 'm.json'), lingua: 'it' }).rettangolo, 'undefined', 'il nome dice l unità: niente rettangolo in DIP esposto');
});

test('BOLLA-GUSCIO-08 main.mjs usa il guscio: dopo la principale, alla scorciatoia, nel menu, all uscita; e il modulo entra nel pacchetto', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /bollaAccesa\(process\.argv\)/u);
  /* la bolla si carica DOPO che la principale ha il cookie, nello stesso punto della generazione */
  assert.match(main, /await finestra\.loadURL\(urlIngresso\(base, token\)\);\s*generazioneMostrata = generazione;[\s\S]{0,200}?bolla\.aggiorna\(base, generazione\)/u);
  assert.match(main, /bolla\.registraScorciatoia\(\)/u);
  assert.match(main, /bolla\.voceDelMenu\(\)/u);
  assert.match(main, /pcSveglio\.chiudi\(\); bolla\.chiudi\(\);/u, 'all uscita la scorciatoia si rilascia');
  /* senza vassoio la principale chiusa chiude la bolla, così `window-all-closed` arriva e l'app esce come prima */
  assert.match(main, /questa\.on\('closed', \(\) => \{[^}]*if \(!staUscendo && !restaNelVassoio\) bolla\.chiudi\(\);/u);
  const pacchetto = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pacchetto.build.files.includes('bolla-finestra.mjs'));
});

/*
 * FE-073 (05/11, contratto del segno): su Windows 10 prima della 2004 il segno non ha finestre e lo dice alla bolla con executeJavaScript + postMessage nella sua pagina.
 *   La bolla dice quando la sua pagina è pronta (`quandoPronta`, a ogni caricamento buono) e consegna (`posta`) solo a una pagina arrivata con 200.
 */
test('BOLLA-GUSCIO-12 posta nella pagina della bolla solo quando è pronta, e dice quando lo è', async () => {
  const f = finti();
  let pronte = 0;
  const bolla = creaBolla({ ...f.dipendenze, accesa: true, filePosto: join(cartella(), 'bolla.json'), lingua: 'it', quandoPronta: () => { pronte += 1; } });
  assert.equal(bolla.posta({ tipo: 'segno-assente', motivo: 'windows-vecchio' }), false, 'nessuna finestra');
  await bolla.aggiorna(BASE, 1);
  const [w] = f.finestre;
  const eseguiti = [];
  w.webContents.executeJavaScript = async (codice) => { eseguiti.push(codice); };
  assert.equal(bolla.posta({ tipo: 'segno-assente', motivo: 'windows-vecchio' }), false, 'pagina non ancora arrivata');
  w.carica(404);
  w.emettiContenuto('did-finish-load');
  assert.equal(pronte, 0, 'un 404 non è una pagina pronta');
  await bolla.aggiorna(BASE, 2);
  w.carica(200);
  w.emettiContenuto('did-finish-load');
  assert.equal(pronte, 1);
  assert.equal(bolla.posta({ tipo: 'segno-assente', motivo: 'windows-vecchio' }), true);
  assert.deepEqual(eseguiti, [`postMessage(${JSON.stringify({ tipo: 'segno-assente', motivo: 'windows-vecchio' })}, location.origin)`]);
  w.destroy();
  assert.equal(bolla.posta({ tipo: 'segno-assente', motivo: 'windows-vecchio' }), false, 'distrutta');
  const spenta = creaBolla({ ...finti().dipendenze, accesa: false, filePosto: join(cartella(), 's.json'), lingua: 'it' });
  assert.equal(spenta.posta({ tipo: 'x' }), false);
});
