/*
 * 0.2.1-ART D1 (09/11/2026, owner sulla 0.2.0: «non si può aprire a parte»). «Apri» di un artefatto nell'app PC finiva SEMPRE nel
 *   `deny` di `setWindowOpenHandler` (main.mjs): la carta apriva `about:blank` e il guscio la negava, nessuna finestra.
 * ⇒ Vincolo del giudice: la pagina chiede con un indirizzo `talos-desktop://artefatto?gettone=…&pagina=…` che il guscio riconosce e
 *   NEGA, poi apre LUI una finestra propria (sandbox, contextIsolation, niente nodeIntegration, niente preload), con la navigazione
 *   chiusa dentro l'artefatto e `window.open` negato anche lì. Electron non parte: finestra e sessione sono finte e si iniettano, come in
 *   `bolla-finestra.test.mjs` e come Hermes (`apps/desktop/electron/challenge-window.ts:113-144`).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as modulo from '../finestra-artefatto.mjs';

const {
  PARTIZIONE_ARTEFATTI, copioneGettoneArtefatti, creaFinestreArtefatto, gestisciRichiestaArtefatto, navigazioneArtefattoConsentita,
  opzioniFinestraArtefatto, richiestaArtefatto,
} = modulo;

const BASE = 'http://127.0.0.1:51234';
const GETTONE = 'a'.repeat(48);
const CAP = 'C'.repeat(43);
const PAGINA = `/api/v1/pagine/${CAP}/Budget%20personale.html`;
const richiesta = (gettone = GETTONE, pagina = PAGINA) => `talos-desktop://artefatto?gettone=${encodeURIComponent(gettone)}&pagina=${encodeURIComponent(pagina)}`;

/* la finestra carica dopo che la rete della sessione è chiusa (una promessa): le prove aspettano un giro */
const giro = () => new Promise((fatto) => setImmediate(fatto));

function finti(opzioni = {}) {
  const finestre = [];
  const passi = []; // l'ordine conta: la rete si chiude PRIMA di caricare
  const guasti = {};
  const sessione = { permessi: null, controllo: null, eventi: {}, proxy: [], esitoProxy: () => Promise.resolve(), intestazioni: [],
    setPermissionRequestHandler(f) { this.permessi = f; }, setPermissionCheckHandler(f) { this.controllo = f; },
    setProxy(config) { this.proxy.push(config); passi.push('proxy'); return this.esitoProxy(config); },
    webRequest: { onHeadersReceived(...argomenti) { sessione.intestazioni.push(argomenti); } },
    on(nome, f) { (this.eventi[nome] ??= []).push(f); } };
  class FintaFinestra {
    constructor(opzioni) {
      this.opzioni = opzioni; this.caricati = []; this.eventi = {}; this.contenuto = {}; this.distrutta = false; this.titolo = opzioni.title; this.menuTolto = false;
      const io = this;
      this.webContents = {
        apertura: null,
        setWindowOpenHandler(f) { this.apertura = f; },
        setWebRTCIPHandlingPolicy(politica) { if (guasti.politica) throw new Error('politica'); io.politicaWebrtc = politica; passi.push('politica'); },
        on(nome, f) { (io.contenuto[nome] ??= []).push(f); },
        reload() { io.ricariche = (io.ricariche ?? 0) + 1; },
      };
      finestre.push(this);
    }
    on(nome, f) { (this.eventi[nome] ??= []).push(f); }
    once(nome, f) { this.on(nome, f); }
    removeMenu() { this.menuTolto = true; }
    setTitle(t) { this.titolo = t; }
    show() { this.visibile = true; }
    focus() { this.fuochi = (this.fuochi ?? 0) + 1; }
    isMinimized() { return this.ridotta === true; }
    restore() { this.ridotta = false; }
    isDestroyed() { return this.distrutta; }
    close() { this.distrutta = true; for (const f of this.eventi.closed ?? []) f(); }
    destroy() { this.forzata = true; this.distrutta = true; for (const f of this.eventi.closed ?? []) f(); }
    loadURL(u) { this.caricati.push(u); passi.push('carica'); return Promise.resolve(); }
  }
  const righe = [];
  const finestreArtefatto = creaFinestreArtefatto({ BrowserWindow: FintaFinestra, sessione: () => sessione, registro: (r) => righe.push(r), ...opzioni });
  return { finestre, sessione, righe, finestreArtefatto, passi, guasti };
}

/* lo stesso giro di main.mjs: prima la richiesta dell'artefatto, poi il resto; `setImmediate` si salta */
function gestore(f, base = BASE) {
  return ({ url }) => gestisciRichiestaArtefatto(url, { gettone: GETTONE, base, apri: (dove) => f.finestreArtefatto.apri(dove), registro: (r) => f.righe.push(r), dopo: (fn) => fn() })
    ?? { action: 'deny', altro: true };
}

const evento = () => { const e = { fermato: false, preventDefault() { e.fermato = true; } }; return e; };

test('ART-GUSCIO-01 una richiesta d artefatto col gettone giusto è negata come finestra del browser e apre UNA finestra di TALOS sulla pagina', async () => {
  const f = finti();
  const esito = gestore(f)({ url: richiesta() });
  await giro();
  assert.deepEqual(esito, { action: 'deny' }, 'mai una finestra creata da Chromium: la apre il guscio');
  assert.equal(f.finestre.length, 1, 'oggi finisce in deny e non apre nulla');
  assert.deepEqual(f.finestre[0].caricati, [BASE + PAGINA]);
});

test('ART-GUSCIO-02 la finestra dell artefatto: sandbox, contextIsolation, niente nodeIntegration, niente preload, sessione propria', () => {
  const f = finti();
  gestore(f)({ url: richiesta() });
  const w = f.finestre[0].opzioni.webPreferences;
  assert.equal(w.sandbox, true);
  assert.equal(w.contextIsolation, true);
  assert.equal(w.nodeIntegration, false);
  assert.equal(w.nodeIntegrationInSubFrames, false);
  assert.equal(w.nodeIntegrationInWorker, false, 'nemmeno nei worker (revisione 3, mutante M14)');
  assert.equal(w.allowRunningInsecureContent, false, 'niente contenuto insicuro (revisione 3, mutante M15)');
  assert.equal(w.webviewTag, false);
  assert.equal(w.webSecurity, true);
  assert.equal('preload' in w, false, 'nessun preload con poteri');
  assert.equal(w.session, f.sessione, 'sessione in memoria propria: niente cookie di TALOS');
  assert.equal(opzioniFinestraArtefatto(f.sessione).webPreferences.sandbox, true);
  assert.equal(PARTIZIONE_ARTEFATTI.startsWith('persist:'), false, 'in memoria, non sul disco');
  assert.equal(f.finestre[0].menuTolto, true, 'il menu dell app (Ricarica, Esci…) non sta sulla finestra dell artefatto');
  /* la sessione nega permessi e scaricamenti */
  let dato = null; f.sessione.permessi(null, 'media', (v) => { dato = v; });
  assert.equal(dato, false);
  assert.equal(f.sessione.controllo(), false);
  const scarica = evento(); f.sessione.eventi['will-download'][0](scarica);
  assert.equal(scarica.fermato, true);
});

test('ART-GUSCIO-03 una navigazione fuori dall artefatto è negata (script, rimando, cornice principale); dentro il suo lasciapassare passa', () => {
  const f = finti();
  gestore(f)({ url: richiesta() });
  const c = f.finestre[0].contenuto;
  for (const nome of ['will-navigate', 'will-redirect']) {
    for (const fuori of ['https://evil.example/', `${BASE}/`, `${BASE}/api/v1/sessions`, `${BASE}/api/v1/pagine/${'D'.repeat(43)}/x.html`, 'file:///C:/Windows/win.ini', 'javascript:alert(1)']) {
      const e = evento(); c[nome][0](e, fuori);
      assert.equal(e.fermato, true, `${nome} verso ${fuori}`);
    }
    const dentro = evento(); c[nome][0](dentro, `${BASE}/api/v1/pagine/${CAP}/altra.html`);
    assert.equal(dentro.fermato, false, 'la stessa cartella dell artefatto (i suoi link relativi)');
  }
  /* will-redirect di Electron passa anche l'evento coi dettagli: si legge `url` se non c'è il secondo argomento */
  const r = { ...evento(), url: 'https://evil.example/' }; r.preventDefault = () => { r.fermato = true; };
  c['will-redirect'][0](r);
  assert.equal(r.fermato, true);
  assert.equal(navigazioneArtefattoConsentita(BASE + PAGINA, `${BASE}/api/v1/pagine/${CAP}/a/b.css`), true);
  assert.equal(navigazioneArtefattoConsentita(BASE + PAGINA, `http://127.0.0.1:9999/api/v1/pagine/${CAP}/x.html`), false, 'altra porta');
  assert.equal(navigazioneArtefattoConsentita('non un url', `${BASE}/api/v1/pagine/${CAP}/x.html`), false);
  const webview = evento(); c['will-attach-webview'][0](webview);
  assert.equal(webview.fermato, true);
});

test('ART-GUSCIO-04 una window.open dalla pagina dell artefatto è negata, anche verso un altro artefatto col gettone', () => {
  const f = finti();
  gestore(f)({ url: richiesta() });
  const apertura = f.finestre[0].webContents.apertura;
  assert.equal(typeof apertura, 'function');
  for (const url of ['https://evil.example/', 'about:blank', richiesta(), `${BASE}/api/v1/pagine/${CAP}/x.html`]) assert.deepEqual(apertura({ url }), { action: 'deny' });
  assert.equal(f.finestre.length, 1, 'nessuna finestra nuova da dentro l artefatto');
});

test('ART-GUSCIO-05 un gettone sbagliato, mancante o una pagina fuori forma sono negati e non aprono nulla', () => {
  const f = finti();
  for (const url of [richiesta('b'.repeat(48)), richiesta(''), `talos-desktop://artefatto?pagina=${encodeURIComponent(PAGINA)}`, richiesta(GETTONE.slice(1)),
    richiesta(GETTONE, 'https://evil.example/x.html'), richiesta(GETTONE, '/api/v1/sessions'), richiesta(GETTONE, `/api/v1/pagine/${CAP}/..`),
    richiesta(GETTONE, `/api/v1/pagine/${CAP}/%2E%2E`), richiesta(GETTONE, `/api/v1/pagine/${CAP}/a%2Fb`), richiesta(GETTONE, `/api/v1/pagine/${CAP}/x.html?y=1`),
    richiesta(GETTONE, `//evil.example/api/v1/pagine/${CAP}/x.html`), richiesta(GETTONE, `/api/v1/pagine/corto/x.html`),
    /* revisione 1 R3 (`..%5cx`) e revisione 3 M21-M22: barra rovescia, due punti, caratteri di controllo e il punto solo nel nome */
    richiesta(GETTONE, `/api/v1/pagine/${CAP}/..%5cx`), richiesta(GETTONE, `/api/v1/pagine/${CAP}/C%3Ax`), richiesta(GETTONE, `/api/v1/pagine/${CAP}/x%00`),
    richiesta(GETTONE, `/api/v1/pagine/${CAP}/x%1Fy`), richiesta(GETTONE, `/api/v1/pagine/${CAP}/x%7F`), richiesta(GETTONE, `/api/v1/pagine/${CAP}/.`),
    /* revisione 3 reperto 9: lo spazio in coda sparisce quando l'indirizzo si risolve, e `.. ` porterebbe la finestra fuori cartella */
    richiesta(GETTONE, `/api/v1/pagine/${CAP}/.. `), richiesta(GETTONE, `/api/v1/pagine/${CAP}/. `),
    `talos-desktop://artefatto/altro?gettone=${GETTONE}&pagina=${encodeURIComponent(PAGINA)}`]) {
    assert.deepEqual(gestore(f)({ url }), { action: 'deny' }, url);
    /* la richiesta è già fuori forma di suo, prima di arrivare ad `apri` (revisione 3, M22: il punto solo lo fermava soltanto il
       secondo controllo); i due nomi con lo spazio in coda sono in forma finché l'indirizzo non si risolve, e li ferma `apri` */
    if (!url.endsWith('%20')) assert.deepEqual(richiestaArtefatto(url, GETTONE), { valida: false }, url);
  }
  assert.equal(f.finestre.length, 0);
  assert.ok(f.righe.length >= 1 && f.righe.every((r) => !r.includes(GETTONE)), 'si scrive nel registro, mai il gettone');
  /* senza indirizzo del servizio (in avvio) nulla si apre */
  assert.deepEqual(gestore(f, null)({ url: richiesta() }), { action: 'deny' });
  assert.equal(f.finestre.length, 0);
  /* non è nostra: la gestisce chi viene dopo */
  assert.equal(richiestaArtefatto('talos-desktop://menu?x=1&y=2', GETTONE), null);
  assert.equal(richiestaArtefatto('https://github.com/', GETTONE), null);
  /* revisione 3 M19: conta lo schema, non il solo nome «artefatto» */
  assert.equal(richiestaArtefatto(`https://artefatto/?gettone=${GETTONE}&pagina=${encodeURIComponent(PAGINA)}`, GETTONE), null);
  assert.deepEqual(gestore(f)({ url: 'https://github.com/' }), { action: 'deny', altro: true });
  /* un gettone vuoto del guscio non combacia mai con un vuoto */
  assert.deepEqual(richiestaArtefatto(richiesta(''), ''), { valida: false });
});

test('ART-GUSCIO-06 la pagina riceve il gettone con un copione JSON, mai testo interpolato', () => {
  const copione = copioneGettoneArtefatti(GETTONE);
  const finestra = {};
  new Function('window', copione)(finestra);
  assert.deepEqual({ ...finestra.__talosGuscioArtefatti }, { gettone: GETTONE });
  assert.equal(Object.isFrozen(finestra.__talosGuscioArtefatti), true);
  assert.match(copioneGettoneArtefatti('"); alert(1); ("'), /\\"\); alert\(1\); \(\\"/u, 'le virgolette restano dentro la stringa JSON');
});

test('ART-GUSCIO-07 chiudiTutte chiude le finestre aperte; il titolo è quello della pagina, col segno «Artifact» davanti, dentro TALOS', () => {
  const f = finti();
  gestore(f)({ url: richiesta() });
  gestore(f)({ url: richiesta(GETTONE, `/api/v1/pagine/${'E'.repeat(43)}/b.html`) });
  assert.equal(f.finestre.length, 2);
  const e = evento(); f.finestre[0].contenuto['page-title-updated'][0](e, 'Budget');
  assert.equal(e.fermato, true);
  assert.equal(f.finestre[0].titolo, 'Artifact · Budget — TALOS');
  f.finestreArtefatto.chiudiTutte();
  assert.ok(f.finestre.every((w) => w.distrutta));
});

test('ART-GUSCIO-08 main.mjs: la richiesta dell artefatto si legge PRIMA del resto nel gestore della principale; gettone consegnato a ogni caricamento; finestre chiuse all uscita; modulo nel pacchetto', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /setWindowOpenHandler\(\(\{ url \}\) => \{\s*(?:\/\*[\s\S]*?\*\/\s*)?const sceltaArtefatto = gestisciRichiestaArtefatto\(url, \{ gettone: gettoneArtefatti, base,/u);
  assert.match(main, /if \(sceltaArtefatto\) return sceltaArtefatto;/u);
  assert.match(main, /const gettoneArtefatti = randomBytes\(24\)\.toString\('hex'\);/u);
  /* revisione 1 R1 e revisione 3 reperto 5: il gettone si posa SOLO sul documento dell'app, mai su una pagina resa arrivata nella principale */
  assert.match(main, /did-finish-load', \(\) => \{[^}]*consegnaGettoneArtefatti\(questa\.webContents, base, gettoneArtefatti, riga => registro\.scrivi\(riga\)\);\s*\}\);/u);
  assert.equal((main.match(/consegnaGettoneArtefatti\(/gu) ?? []).length, 1, 'un posto solo posa il gettone, quello col controllo (ART-GUSCIO-19)');
  assert.doesNotMatch(main, /copioneGettoneArtefatti|__talosGuscioArtefatti|PROPRIETA_PAGINA/u, 'main.mjs non posa il gettone per conto suo, in nessuna cornice');
  /* giro di sicurezza 2 (giudice v1301): la rete delle pagine rese si chiude anche nella principale, appena l'app è pronta e prima del servizio */
  assert.match(main, /app\.whenReady\(\)\.then\(async \(\) => \{\s*chiudiRetePagineRese\(session\.defaultSession, \(\) => base\);/u);
  assert.match(main, /creaFinestreArtefatto\(\{ BrowserWindow, sessione: \(\) => session\.fromPartition\(PARTIZIONE_ARTEFATTI\),\s*registro: riga => registro\.scrivi\(riga\), icona: [^\n]*, lingua: \(\) => app\.getLocale\(\) \}\);/u);
  assert.doesNotMatch(main, /webPreferences: \{[^}]*session:/u, 'la principale resta nella sessione di serie, quella che chiudiRetePagineRese protegge');
  assert.match(main, /session\.fromPartition\(PARTIZIONE_ARTEFATTI\)/u);
  assert.match(main, /bolla\.chiudi\(\); segno\.chiudi\(\); finestreArtefatto\.chiudiTutte\(\);/u, 'all uscita');
  assert.match(main, /if \(!staUscendo && !restaNelVassoio\) finestreArtefatto\.chiudiTutte\(\);/u, 'senza vassoio la principale chiusa chiude anche loro, così l app esce');
  assert.doesNotMatch(main, /apribileNelBrowserDelSistema\(url[^)]*\)[^;]*finestreArtefatto/u);
  const pacchetto = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pacchetto.build.files.includes('finestra-artefatto.mjs'));
  /* Electron tiene UN solo ascolto `onHeadersReceived` per sessione: un secondo, posato altrove nel guscio, toglierebbe in silenzio la lista
     delle connessioni alle pagine rese. Finché serve un altro ascolto, passa da `finestra-artefatto.mjs`. */
  /* Giro 3 (F4, mutanti K12 e K14 del controllore: `webRequest['onHeaders' + 'Received']` in main.mjs o bolla-finestra.mjs): si cerca la
     parola `webRequest`, non il nome del metodo, in OGNI modulo del guscio (non solo quelli del pacchetto) e in quelli del servizio che il
     guscio può importare; a caldo il sigillo di `posaAscolto` fa lanciare un secondo ascolto (ART-GUSCIO-20, ART-RETE-11). */
  const moduli = (cartella, prefisso) => readdirSync(new URL(cartella, import.meta.url), { recursive: true, withFileTypes: true })
    .filter((voce) => voce.isFile() && /\.m?js$/u.test(voce.name) && !/node_modules|[\\/]tests?[\\/]|^tests?$/u.test(relative(fileURLToPath(new URL(cartella, import.meta.url)), voce.parentPath)))
    .map((voce) => `${prefisso}${relative(fileURLToPath(new URL(cartella, import.meta.url)), join(voce.parentPath, voce.name)).replaceAll('\\', '/')}`);
  const guscio = readdirSync(new URL('../', import.meta.url)).filter((nome) => nome.endsWith('.mjs'));
  const servizio = moduli('../../src/', '../src/');
  assert.ok(guscio.includes('main.mjs') && guscio.includes('bolla-finestra.mjs') && servizio.length > 20, `${guscio.length} moduli del guscio, ${servizio.length} del servizio`);
  const conAscolto = [...guscio, ...servizio].filter((nome) => /webRequest|onHeadersReceived/u.test(readFileSync(new URL(`../${nome}`, import.meta.url), 'utf8')));
  assert.deepEqual(conAscolto, ['finestra-artefatto.mjs']);
  for (const nome of pacchetto.build.files.filter((n) => n.endsWith('.mjs'))) assert.ok(guscio.includes(nome), `${nome} del pacchetto è fra i moduli cercati`);
  /* giro 3 (N1): un processo per pagina resa PRIMA di «ready», e la sorveglianza delle anteprime sulla principale, una volta per finestra */
  const prima = main.indexOf('isolaPagineRese(app.commandLine);');
  assert.ok(prima > 0 && prima < main.indexOf('app.whenReady()'), 'isolaPagineRese prima di app.whenReady');
  assert.equal((main.match(/isolaPagineRese\(/gu) ?? []).length, 1);
  assert.match(main, /sorvegliaAnteprime\(questa\.webContents, \(\) => base, \{ registro: riga => registro\.scrivi\(riga\) \}\);/u);
  assert.equal((main.match(/sorvegliaAnteprime\(/gu) ?? []).length, 1);
  assert.ok(pacchetto.scripts['test:guscio'].includes('tests/finestra-artefatto-rete.spec.mjs'), 'la prova con Electron vero della rete sta nel cancello del guscio');
});

/* ───── Cure dei revisori di sicurezza 1 e 3 (09/11/2026 sera), commit a parte sopra D1 ───── */

test('ART-GUSCIO-09 (R1, rev3-5) il gettone si posa solo sul documento dell app: mai su una pagina resa, un altra origine o un indirizzo vuoto', () => {
  assert.equal(typeof modulo.documentoDellApp, 'function', 'oggi il gettone va in ogni documento della principale');
  const app = modulo.documentoDellApp;
  for (const si of [`${BASE}/`, `${BASE}/?token=${'f'.repeat(64)}`, `${BASE}/#chat`, BASE]) assert.equal(app(si, BASE), true, si);
  for (const no of [BASE + PAGINA, `${BASE}/api/v1/pagine/${CAP}/`, `${BASE}/api/v1/sessions`, `${BASE}//`, 'http://127.0.0.1:9999/', 'https://evil.example/',
    'about:blank', 'file:///C:/x/index.html', '', null, undefined]) assert.equal(app(no, BASE), false, String(no));
  assert.equal(app(`${BASE}/`, null), false, 'senza indirizzo del servizio nulla è l app');
  assert.equal(app(`${BASE}/`, 'non un url'), false);
});

test('ART-GUSCIO-10 (R2, rev3-4) la stessa pagina chiesta due volte porta davanti la finestra aperta; oltre il tetto si chiude la più vecchia', async () => {
  const f = finti();
  const pagina = (i) => `/api/v1/pagine/${CAP}/p${i}.html`;
  const prima = f.finestreArtefatto.apri({ base: BASE, pagina: pagina(0) });
  prima.ridotta = true;
  const ancora = f.finestreArtefatto.apri({ base: BASE, pagina: pagina(0) });
  await giro();
  assert.equal(f.finestre.length, 1, 'oggi ogni richiesta apre una finestra in più');
  assert.equal(ancora, prima);
  assert.equal(prima.ridotta, false, 'se era ridotta a icona torna su');
  assert.equal(prima.visibile, true);
  assert.equal(prima.fuochi, 1, 'e prende il fuoco');
  assert.deepEqual(prima.caricati, [BASE + pagina(0)], 'senza ricaricarla');
  const tetto = modulo.TETTO_FINESTRE_ARTEFATTO;
  assert.equal(tetto, 8);
  for (let i = 1; i <= tetto; i += 1) f.finestreArtefatto.apri({ base: BASE, pagina: pagina(i) });
  assert.equal(f.finestre.length, tetto + 1);
  assert.equal(f.finestre.filter((w) => !w.distrutta).length, tetto, 'mai più di otto insieme');
  assert.equal(prima.distrutta, true, 'se ne va la più vecchia');
  assert.equal(f.finestre.at(-1).distrutta, false, 'e la nuova si apre');
  /* una finestra chiusa non conta più: la sua pagina si riapre, in una finestra nuova */
  const riaperta = f.finestreArtefatto.apri({ base: BASE, pagina: pagina(0) });
  await giro();
  assert.notEqual(riaperta, prima);
  assert.deepEqual(riaperta.caricati, [BASE + pagina(0)]);
  assert.equal(f.finestre.filter((w) => !w.distrutta).length, tetto);
  /* una chiusura che arriva tardi (Electron chiude dopo): la finestra in uscita non conta due volte */
  const g = finti();
  const lente = [];
  for (let i = 0; i <= tetto + 1; i += 1) {
    const w = g.finestreArtefatto.apri({ base: BASE, pagina: pagina(i) });
    w.destroy = () => { lente.push(w); };
  }
  assert.deepEqual(lente, [g.finestre[0], g.finestre[1]], 'ogni apertura oltre il tetto chiude UNA finestra, la più vecchia ancora viva');
  /* la pagina di una finestra che se ne sta andando si riapre in una finestra NUOVA: quella in uscita non torna davanti */
  const quante = g.finestre.length;
  const rinata = g.finestreArtefatto.apri({ base: BASE, pagina: pagina(0) });
  assert.notEqual(rinata, g.finestre[0]);
  assert.equal(g.finestre.length, quante + 1);
  assert.equal(g.finestre[0].visibile, undefined, 'nessuno ha chiamato show() sulla finestra in uscita');
});

test('ART-GUSCIO-11 (R3, rev3-6) dentro la finestra una barra codificata nel percorso è negata, e la cartella conta solo in testa al percorso', () => {
  const dentro = BASE + PAGINA;
  for (const no of ['..%2fx', '..%2Fx', '..%5cx', '..%5Cx', 'a%2f..%2f..%2fsessions', 'a/b%5C..']) {
    assert.equal(navigazioneArtefattoConsentita(dentro, `${BASE}/api/v1/pagine/${CAP}/${no}`), false, no);
  }
  assert.equal(navigazioneArtefattoConsentita(dentro, `${BASE}/x/api/v1/pagine/${CAP}/a.html`), false, 'la cartella in mezzo al percorso non vale');
  assert.equal(navigazioneArtefattoConsentita(dentro, `${BASE}/api/v1/pagine/${CAP}x/a.html`), false, 'un lasciapassare che comincia uguale non è lo stesso: conta la barra in fondo (revisione 3, M11)');
  assert.equal(navigazioneArtefattoConsentita(dentro, `${BASE}/api/v1/pagine/${CAP}/a%20b.html`), true, 'le altre codifiche passano');
  assert.equal(navigazioneArtefattoConsentita(dentro, `${BASE}/api/v1/pagine/${CAP}/a/b.css?v=2%2f3`), true, 'conta il percorso, non la domanda');
  const f = finti();
  gestore(f)({ url: richiesta() });
  const e = evento(); f.finestre[0].contenuto['will-navigate'][0](e, `${BASE}/api/v1/pagine/${CAP}/..%2f..%2f..%2fsessions`);
  assert.equal(e.fermato, true);
});

test('ART-GUSCIO-12 (rev3-3) anche la navigazione di una cornice figlia resta nell artefatto: non dipende dalla sola politica del server', () => {
  const f = finti();
  gestore(f)({ url: richiesta() });
  const ascolti = f.finestre[0].contenuto['will-frame-navigate'];
  assert.equal(ascolti?.length, 1, 'oggi nessuno ascolta le cornici');
  /* Electron passa un evento solo, coi dettagli */
  for (const fuori of ['https://evil.example/', `${BASE}/`, 'about:blank', `${BASE}/api/v1/pagine/${'D'.repeat(43)}/x.html`]) {
    const e = { ...evento(), url: fuori, isMainFrame: false }; e.preventDefault = () => { e.fermato = true; };
    ascolti[0](e);
    assert.equal(e.fermato, true, fuori);
  }
  const dentro = { ...evento(), url: `${BASE}/api/v1/pagine/${CAP}/parte.html`, isMainFrame: false }; dentro.preventDefault = () => { dentro.fermato = true; };
  ascolti[0](dentro);
  assert.equal(dentro.fermato, false);
});

test('ART-GUSCIO-13 (rev3-9) dopo aver risolto l indirizzo la pagina deve essere ancora in forma, nello stesso lasciapassare', async () => {
  const f = finti();
  for (const nome of ['.. ', '. ', '..\t', '..\n', '..  ']) {
    assert.equal(f.finestreArtefatto.apri({ base: BASE, pagina: `/api/v1/pagine/${CAP}/${nome}` }), null, JSON.stringify(nome));
  }
  assert.equal(f.finestre.length, 0, 'oggi «.. » apre una finestra su /api/v1/pagine/');
  assert.ok(f.righe.length >= 1);
  /* uno spazio in coda a un nome vero si perde e basta: resta nella sua cartella */
  const w = f.finestreArtefatto.apri({ base: BASE, pagina: `/api/v1/pagine/${CAP}/ok.html ` });
  await giro();
  assert.deepEqual(w.caricati, [`${BASE}/api/v1/pagine/${CAP}/ok.html`]);
  /* `apri` chiamata da sola (revisione 3, M18): una pagina fuori forma torna null, senza eccezioni e senza finestre */
  const g = finti();
  for (const fuori of [`/api/v1/pagine/${CAP}/x.html?y=1`, `/api/v1/pagine/${CAP}/x.html#y`, `/api/v1/pagine/${CAP}/a/b.html`, '/api/v1/sessions', 'https://evil.example/x.html', '', null, undefined, 42]) {
    assert.equal(g.finestreArtefatto.apri({ base: BASE, pagina: fuori }), null, String(fuori));
  }
  assert.equal(g.finestre.length, 0);
  assert.deepEqual(g.sessione.proxy, []);
});

test('ART-GUSCIO-14 (R4, rev3 M01) il gettone si confronta a tempo costante', () => {
  /* Il tempo costante non si misura qui (una prova a cronometro sarebbe fragile): si fissa nel sorgente che il confronto passa da
     `timingSafeEqual` su due buffer della stessa lunghezza, e che nessun confronto diretto fra i due gettoni lo scavalca. */
  const sorgente = readFileSync(new URL('../finestra-artefatto.mjs', import.meta.url), 'utf8');
  const corpo = /function stessoGettone\(a, b\) \{([\s\S]*?)\n\}/u.exec(sorgente)?.[1] ?? '';
  assert.match(corpo, /return x\.length === y\.length && x\.length > 0 && timingSafeEqual\(x, y\);/u);
  assert.doesNotMatch(corpo, /\ba\s*[!=]==?\s*b\b|String\(a[^)]*\)\s*[!=]==?/u, 'mai un confronto diretto fra i gettoni');
  assert.match(sorgente, /if \(!stessoGettone\(url\.searchParams\.get\('gettone'\), gettone\)\) return \{ valida: false \};/u);
  assert.equal((sorgente.match(/searchParams\.get\('gettone'\)/gu) ?? []).length, 1, 'il gettone della richiesta si legge in un posto solo');
});

/* ───── Giro di sicurezza 2 (10/11/2026): la rete della finestra e delle pagine rese, il titolo, la chiusura, il gettone ───── */

test('ART-GUSCIO-15 (rev3-1) la rete della finestra è chiusa PRIMA di caricare: proxy morto con la sola base in eccezione, WebRTC senza UDP diretto, lista delle connessioni', async () => {
  assert.equal(typeof modulo.reteChiusa, 'function', 'oggi la finestra carica con la rete aperta: una pagina con RTCPeerConnection esce verso STUN e TURN');
  const f = finti();
  let sblocca; f.sessione.esitoProxy = () => new Promise((fatto) => { sblocca = fatto; });
  const w = f.finestreArtefatto.apri({ base: BASE, pagina: PAGINA });
  await giro();
  assert.deepEqual(f.sessione.proxy, [{ mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1', proxyBypassRules: '<-loopback>;127.0.0.1:51234;*.localhost:51234' }],
    'tutto a un proxy che non c è; diretti solo la base del servizio e i nomi delle pagine alla sua porta (giro 5; `<-loopback>` toglie l eccezione di serie per ogni porta locale)');
  assert.equal(w.politicaWebrtc, 'disable_non_proxied_udp', 'WebRTC senza UDP diretto: gli resta il TCP, che passa dal proxy morto');
  assert.deepEqual(w.caricati, [], 'finché il proxy non è posato la pagina non parte');
  sblocca(); await giro();
  assert.deepEqual(w.caricati, [BASE + PAGINA]);
  assert.deepEqual(f.passi, ['politica', 'proxy', 'carica']);
  /* un altra finestra sullo stesso servizio non riposa il proxy; un servizio ripartito su un altra porta sì */
  f.sessione.esitoProxy = () => Promise.resolve();
  const seconda = f.finestreArtefatto.apri({ base: BASE, pagina: `/api/v1/pagine/${CAP}/altra.html` }); await giro();
  assert.equal(f.sessione.proxy.length, 1);
  assert.equal(seconda.politicaWebrtc, 'disable_non_proxied_udp', 'la politica WebRTC è del contenuto: ogni finestra la sua');
  assert.deepEqual(seconda.caricati, [`${BASE}/api/v1/pagine/${CAP}/altra.html`]);
  const altrove = f.finestreArtefatto.apri({ base: 'http://127.0.0.1:51999', pagina: PAGINA }); await giro();
  assert.deepEqual(f.sessione.proxy.at(-1), { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1', proxyBypassRules: '<-loopback>;127.0.0.1:51999;*.localhost:51999' });
  assert.deepEqual(altrove.caricati, [`http://127.0.0.1:51999${PAGINA}`]);
  assert.deepEqual(modulo.reteChiusa('http://localhost:8080/x?y'), { mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1', proxyBypassRules: '<-loopback>;localhost:8080;*.localhost:8080' });
  /* senza porta l eccezione varrebbe per ogni porta di quell host: non si apre nulla */
  for (const senzaPorta of ['http://127.0.0.1', 'http://127.0.0.1:80', 'http://localhost/']) assert.throws(() => modulo.reteChiusa(senzaPorta), /^Error: base senza porta$/u, senzaPorta);
  for (const nonUrl of ['non un url', '', null, undefined]) assert.throws(() => modulo.reteChiusa(nonUrl), { code: 'ERR_INVALID_URL' }, String(nonUrl));
  const n = finti();
  assert.equal(n.finestreArtefatto.apri({ base: 'http://127.0.0.1', pagina: PAGINA }), null);
  assert.equal(n.finestre.length, 0); assert.deepEqual(n.sessione.proxy, []);

  /* se la rete non si chiude la pagina NON si carica: finestra tolta, riga nel registro, e la volta dopo si riprova */
  const g = finti(); g.sessione.esitoProxy = () => Promise.reject(new Error('proxy'));
  const persa = g.finestreArtefatto.apri({ base: BASE, pagina: PAGINA }); await giro();
  assert.deepEqual(persa.caricati, []); assert.equal(persa.distrutta, true);
  assert.ok(g.righe.some((r) => /rete non chiusa/u.test(r)), g.righe.join('|'));
  g.sessione.esitoProxy = () => Promise.resolve();
  const dopo = g.finestreArtefatto.apri({ base: BASE, pagina: PAGINA }); await giro();
  assert.equal(g.sessione.proxy.length, 2, 'un proxy fallito non resta in memoria come posato');
  assert.deepEqual(dopo.caricati, [BASE + PAGINA]);
  const lancia = finti(); lancia.sessione.esitoProxy = () => { throw new Error('proxy'); };
  const mai = lancia.finestreArtefatto.apri({ base: BASE, pagina: PAGINA }); await giro();
  assert.deepEqual(mai.caricati, []); assert.equal(mai.distrutta, true);
  const h = finti(); h.guasti.politica = true;
  const muta = h.finestreArtefatto.apri({ base: BASE, pagina: PAGINA }); await giro();
  assert.deepEqual(muta.caricati, [], 'senza la politica WebRTC la pagina non parte'); assert.equal(muta.distrutta, true);
  assert.deepEqual(h.passi.filter((p) => p === 'carica'), []);

  /* lo strato del documento: nella sessione degli artefatti OGNI risposta porta la lista «solo l origine della risposta»
     (Connection-Allowlist, Chrome 152: chiude anche WebRTC), al posto di qualunque lista arrivi */
  assert.equal(f.sessione.intestazioni.length, 1, 'un ascolto solo per sessione, anche con più finestre');
  assert.equal(f.sessione.intestazioni[0].length, 1, 'senza filtro: lì dentro tutto è pagina resa');
  const [ascolto] = f.sessione.intestazioni[0];
  let risposta = 'MAI';
  ascolto({ url: BASE + PAGINA, responseHeaders: { 'Content-Type': ['text/html'], 'connection-allowlist': ['("https://evil.example/*")'] } }, (r) => { risposta = r; });
  assert.deepEqual(risposta, { responseHeaders: { 'Content-Type': ['text/html'], 'Connection-Allowlist': ['(response-origin)'] } });
  ascolto({ url: BASE + PAGINA }, (r) => { risposta = r; });
  assert.deepEqual(risposta, { responseHeaders: { 'Connection-Allowlist': ['(response-origin)'] } });
});

test('ART-GUSCIO-16 (giudice v1301) nella principale ogni pagina resa (documento «sandbox» del servizio, o sotto /api/v1/pagine/) riceve la lista delle connessioni; l app e il Browser no', () => {
  assert.equal(typeof modulo.chiudiRetePagineRese, 'function', 'oggi l anteprima in chat esce con WebRTC come la finestra');
  const sessione = { ascolti: [], webRequest: { onHeadersReceived(...a) { sessione.ascolti.push(a); } } };
  let base = BASE;
  modulo.chiudiRetePagineRese(sessione, () => base);
  assert.equal(sessione.ascolti.length, 1);
  const [filtro, ascolto] = sessione.ascolti[0];
  /* giro 3, F3: i tre nomi con cui il servizio risponde (`src/http-app.mjs`, gli Host ammessi); solo documenti, mai le chiamate dell app */
  assert.deepEqual(filtro, { urls: ['http://127.0.0.1/*', 'http://localhost/*', 'http://[::1]/*', 'http://*.localhost/*'], types: ['mainFrame', 'subFrame'] }, 'solo i documenti del servizio locale: le chiamate dell app non passano di qui');
  const chiedi = (url, responseHeaders) => { let r = 'MAI'; ascolto({ url, responseHeaders }, (v) => { r = v; }); return r; };
  const con = (intestazioni) => ({ responseHeaders: { ...intestazioni, 'Connection-Allowlist': ['(response-origin)'] } });
  const POLITICA = "sandbox allow-scripts; default-src 'none'; connect-src 'none'; frame-ancestors 'self'";
  /* la pagina resa, con la sua politica */
  assert.deepEqual(chiedi(BASE + PAGINA, { 'Content-Security-Policy': [POLITICA] }), con({ 'Content-Security-Policy': [POLITICA] }));
  /* sotto /api/v1/pagine/ anche se la politica del server mancasse: non dipende da lei */
  assert.deepEqual(chiedi(BASE + PAGINA, { 'Content-Type': ['text/html'] }), con({ 'Content-Type': ['text/html'] }));
  assert.deepEqual(chiedi(BASE + PAGINA, undefined), con({}));
  /* «sandbox» altrove nel servizio (la rotta vecchia degli artefatti, il lettore): nome minuscolo, più politiche, non per prima, maiuscole */
  for (const csp of [["sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'"], ["default-src 'none'; sandbox"], ["default-src 'none';SANDBOX allow-scripts"],
    ["default-src 'self'", 'sandbox'], ["default-src 'self', sandbox allow-scripts"], ["default-src 'none' ;\tsandbox\tallow-scripts"]]) {
    assert.deepEqual(chiedi(`${BASE}/api/v1/artifacts/abc`, { 'content-security-policy': csp }), con({ 'content-security-policy': csp }), JSON.stringify(csp));
  }
  /* una lista già presente si sostituisce, non si somma (due intestazioni = lista non valida) */
  assert.deepEqual(chiedi(BASE + PAGINA, { 'connection-allowlist': ['("https://evil.example/*")'], 'CONNECTION-ALLOWLIST': ['()'] }), con({}));
  /* il documento dell app resta com è: deve poter incorniciare il Browser e parlare col servizio */
  assert.deepEqual(chiedi(`${BASE}/`, { 'Content-Security-Policy': ["default-src 'self'; script-src 'self'; frame-src 'self' https:; frame-ancestors 'none'"] }), {});
  assert.deepEqual(chiedi(`${BASE}/?token=${'f'.repeat(64)}`, {}), {});
  assert.deepEqual(chiedi(`${BASE}/api/v1/lettore/altro`, undefined), {});
  /* la parola dentro un altro valore non è la direttiva */
  for (const csp of ["script-src 'self' https://sandbox.example", "default-src 'self'; frame-src https://x.example/sandbox", 'report-uri /sandbox', 'sandboxed x', "default-src 'none'; x-sandbox"]) {
    assert.deepEqual(chiedi(`${BASE}/x`, { 'Content-Security-Policy': [csp] }), {}, csp);
  }
  /* la sola politica «di prova» non chiude nulla: non conta */
  assert.deepEqual(chiedi(`${BASE}/x`, { 'Content-Security-Policy-Report-Only': ['sandbox'] }), {});
  /* giro 3, F3: una pagina resa chiamata con l altro nome di questa macchina, sulla porta del servizio, prende la lista (prima la fermava
     solo `frame-ancestors 'self'` del servizio) */
  for (const url of [`http://localhost:51234/api/v1/pagine/${CAP}/x.html`, `http://[::1]:51234/api/v1/pagine/${CAP}/x.html`, `http://LOCALHOST:51234/api/v1/pagine/${CAP}/x.html`]) {
    assert.deepEqual(chiedi(url, {}), con({}), url);
  }
  /* su quei nomi vale SOLO il percorso: il proxy del Browser ci vive e tiene la sua rete anche se dichiara «sandbox»; un altra porta, un
     altro nome di loopback o un sito non si toccano */
  for (const url of [`http://localhost:51234/browser/x`, `http://localhost:51234/`, `http://[::1]:51234/x`, `http://localhost:9999/api/v1/pagine/${CAP}/x.html`,
    `http://127.0.0.1:9999/api/v1/pagine/${CAP}/x.html`, `http://127.0.0.2:51234/api/v1/pagine/${CAP}/x.html`, `https://localhost:51234/api/v1/pagine/${CAP}/x.html`,
    `https://evil.example/api/v1/pagine/${CAP}/x.html`, `http://localhost.evil.example:51234/api/v1/pagine/${CAP}/x.html`]) {
    assert.deepEqual(chiedi(url, { 'Content-Security-Policy': ['sandbox'] }), {}, url);
  }
  /* servizio non pronto o indirizzo non valido: nulla da aggiungere, ma la risposta arriva SEMPRE (senza, la richiesta resta appesa) */
  base = null; assert.deepEqual(chiedi(BASE + PAGINA, { 'Content-Security-Policy': ['sandbox'] }), {});
  base = BASE; assert.deepEqual(chiedi('non un url', { 'Content-Security-Policy': ['sandbox'] }), {});
  /* il servizio riparte su un altra porta: vale la base del momento */
  base = 'http://127.0.0.1:9999';
  assert.deepEqual(chiedi(`http://127.0.0.1:9999/api/v1/pagine/${CAP}/x.html`, {}), con({}));
  assert.deepEqual(chiedi(BASE + PAGINA, {}), {});
});

test('ART-GUSCIO-17 (rev3-2, M12-M13) il titolo scelto dalla pagina: via i caratteri invisibili e di formato, 120 al massimo, e davanti il segno fisso che è un artefatto', () => {
  const titolo = modulo.titoloFinestraArtefatto;
  assert.equal(typeof titolo, 'function', 'oggi passa «Accesso a TALOS … Inserisci la password» con U+202E, senza nessun segno');
  assert.equal(titolo('Budget', 'en-US'), 'Artifact · Budget — TALOS');
  assert.equal(titolo('Budget', 'it-IT'), 'Artefatto · Budget — TALOS');
  assert.equal(titolo('Budget', 'it'), 'Artefatto · Budget — TALOS');
  assert.equal(titolo('Budget', 'IT_it'), 'Artefatto · Budget — TALOS');
  for (const lingua of ['italic', 'fr-FR', 'en', '', null, undefined]) assert.equal(titolo('Budget', lingua), 'Artifact · Budget — TALOS', String(lingua));
  for (const vuoto of ['', '   ', null, undefined, '\u202e\u200b', '\n\t', '\u3000\u00a0']) {
    assert.equal(titolo(vuoto, 'en'), 'Artifact — TALOS', JSON.stringify(vuoto));
    assert.equal(titolo(vuoto, 'it'), 'Artefatto — TALOS', JSON.stringify(vuoto));
  }
  /* il caso misurato dal revisore 3 */
  assert.equal(titolo('Accesso a TALOS \u202egnp.exe — Inserisci la password', 'it'), 'Artefatto · Accesso a TALOS gnp.exe — Inserisci la password — TALOS');
  /* formato e invisibili spariscono; controlli e ogni genere di spazio diventano UNO spazio (niente righe, niente imbottitura) */
  for (const [nome, c] of [['RLO', '\u202e'], ['LRO', '\u202d'], ['RLI', '\u2067'], ['PDI', '\u2069'], ['RLM', '\u200f'], ['ZWSP', '\u200b'], ['ZWJ', '\u200d'], ['BOM', '\ufeff'],
    ['trattino molle', '\u00ad'], ['WJ', '\u2060'], ['etichetta', '\u{e0041}'], ['uso privato', '\ue000'], ['surrogato solo', '\ud800']]) {
    assert.equal(titolo(`a${c}b`, 'en'), 'Artifact · ab — TALOS', nome);
  }
  for (const [nome, c] of [['NUL', '\u0000'], ['ESC', '\u001b'], ['DEL', '\u007f'], ['C1', '\u0085'], ['a capo', '\n'], ['ritorno', '\r\n'], ['tab', '\t'], ['separatore di riga', '\u2028'],
    ['separatore di paragrafo', '\u2029'], ['spazio largo', '\u3000'], ['spazio che non va a capo', '\u00a0'], ['cento spazi', ' '.repeat(100)]]) {
    assert.equal(titolo(`a${c}b`, 'en'), 'Artifact · a b — TALOS', nome);
  }
  /* 120 caratteri della pagina, contati per carattere e non per mezza coppia */
  assert.equal(titolo('x'.repeat(200), 'en'), `Artifact · ${'x'.repeat(120)} — TALOS`);
  assert.equal(titolo('x'.repeat(120), 'en'), `Artifact · ${'x'.repeat(120)} — TALOS`);
  assert.equal(titolo('\u{1f600}'.repeat(130), 'en'), `Artifact · ${'\u{1f600}'.repeat(120)} — TALOS`);
  assert.equal(titolo(`${'x'.repeat(119)} y`, 'en'), `Artifact · ${'x'.repeat(119)} — TALOS`, 'il taglio non lascia uno spazio in coda');
  assert.equal(titolo(42, 'en'), 'Artifact · 42 — TALOS');
  /* la finestra: il segno c è già prima che la pagina dica il suo titolo, nella lingua del sistema (letta all apertura), e resta a ogni cambio */
  const f = finti({ lingua: () => 'it-IT' });
  gestore(f)({ url: richiesta() });
  assert.equal(f.finestre[0].opzioni.title, 'Artefatto — TALOS');
  const e = evento(); f.finestre[0].contenuto['page-title-updated'][0](e, 'Accesso a TALOS \u202egnp.exe');
  assert.equal(e.fermato, true, 'mai il titolo della pagina così com è');
  assert.equal(f.finestre[0].titolo, 'Artefatto · Accesso a TALOS gnp.exe — TALOS');
  const vuoto = evento(); f.finestre[0].contenuto['page-title-updated'][0](vuoto, undefined);
  assert.equal(f.finestre[0].titolo, 'Artefatto — TALOS');
  const g = finti({ lingua: 'it' }); gestore(g)({ url: richiesta() });
  assert.equal(g.finestre[0].opzioni.title, 'Artefatto — TALOS', 'la lingua può essere una stringa');
  const h = finti(); gestore(h)({ url: richiesta() });
  assert.equal(h.finestre[0].opzioni.title, 'Artifact — TALOS', 'inglese di serie');
  assert.equal(opzioniFinestraArtefatto(h.sessione).title, 'Artifact — TALOS');
});

test('ART-GUSCIO-18 (rev2-C) una pagina non trattiene la finestra: il suo «beforeunload» è ignorato, e le chiusure del guscio non lo chiedono nemmeno', () => {
  const f = finti();
  gestore(f)({ url: richiesta() });
  gestore(f)({ url: richiesta(GETTONE, `/api/v1/pagine/${'E'.repeat(43)}/b.html`) });
  const [a, b] = f.finestre;
  const trattiene = a.contenuto['will-prevent-unload'];
  assert.equal(trattiene?.length, 1, 'oggi nessuno ascolta: senza la politica «sandbox» del server la X non chiude');
  const e = evento(); trattiene[0](e);
  assert.equal(e.fermato, true, '`preventDefault` su «will-prevent-unload» = la pagina si scarica lo stesso');
  /* all uscita dell app una pagina che rifiuta `close()` se ne va lo stesso */
  a.close = () => { a.rifiuti = (a.rifiuti ?? 0) + 1; };
  b.close = () => { b.rifiuti = (b.rifiuti ?? 0) + 1; };
  f.finestreArtefatto.chiudiTutte();
  assert.equal(a.distrutta, true); assert.equal(b.distrutta, true);
  assert.equal(a.forzata, true, '`destroy()`: nessun «beforeunload» da chiedere');
  assert.equal(b.forzata, true);
  /* e oltre il tetto la più vecchia se ne va allo stesso modo */
  const g = finti();
  const prima = g.finestreArtefatto.apri({ base: BASE, pagina: `/api/v1/pagine/${CAP}/p0.html` });
  prima.close = () => {};
  for (let i = 1; i <= modulo.TETTO_FINESTRE_ARTEFATTO; i += 1) g.finestreArtefatto.apri({ base: BASE, pagina: `/api/v1/pagine/${CAP}/p${i}.html` });
  assert.equal(prima.distrutta, true);
  assert.equal(g.finestre.filter((w) => !w.distrutta).length, modulo.TETTO_FINESTRE_ARTEFATTO);
});

test('ART-GUSCIO-19 (rev3 M25, rev2 N20) il gettone si posa nella sola cornice principale del documento dell app, senza gesto dell utente simulato', async () => {
  const consegna = modulo.consegnaGettoneArtefatti;
  assert.equal(typeof consegna, 'function', 'oggi la consegna sta in main.mjs, col gesto simulato, e nessuna prova la esegue');
  const contenuto = (url, esito = () => Promise.resolve()) => {
    const c = { chiamate: [], nelleCornici: [], getURL: () => url, executeJavaScript(...argomenti) { c.chiamate.push(argomenti); return esito(); } };
    const cornice = () => ({ executeJavaScript(...argomenti) { c.nelleCornici.push(argomenti); return Promise.resolve(); } });
    c.mainFrame = { ...cornice(), frames: [cornice(), cornice()], framesInSubtree: [cornice(), cornice(), cornice()] };
    return c;
  };
  const righe = [];
  const app = contenuto(`${BASE}/`);
  assert.equal(consegna(app, BASE, GETTONE, (r) => righe.push(r)), true);
  assert.deepEqual(app.chiamate, [[copioneGettoneArtefatti(GETTONE)]], 'un argomento solo: nessun gesto dell utente regalato alla pagina a ogni caricamento');
  assert.deepEqual(app.nelleCornici, [], 'mai nelle cornici: lì vive il contenuto del modello');
  for (const altrove of [BASE + PAGINA, `${BASE}/api/v1/sessions`, 'http://127.0.0.1:9999/', 'https://evil.example/', 'about:blank', '']) {
    const c = contenuto(altrove);
    assert.equal(consegna(c, BASE, GETTONE, (r) => righe.push(r)), false, altrove);
    assert.deepEqual(c.chiamate, [], altrove); assert.deepEqual(c.nelleCornici, [], altrove);
  }
  const presto = contenuto(`${BASE}/`);
  assert.equal(consegna(presto, null, GETTONE), false, 'servizio non pronto');
  assert.deepEqual(presto.chiamate, []);
  assert.deepEqual(righe, []);
  /* pagina non pronta: lo dice nel registro, senza il gettone, e non lancia */
  const rotta = contenuto(`${BASE}/`, () => Promise.reject(new Error(`non pronta ${GETTONE}`)));
  assert.equal(consegna(rotta, BASE, GETTONE, (r) => righe.push(r)), true);
  await giro();
  assert.deepEqual(righe, ['Gettone degli artefatti non consegnato.']);
  const muta = contenuto(`${BASE}/`, () => Promise.reject(new Error('non pronta')));
  consegna(muta, BASE, GETTONE); await giro(); // senza registro non lancia
});

/* ───── Giro di sicurezza 3 (10/11/2026; controllore del giro 2: N1, F3, F4): la pagina che cade, il secondo ascolto ───── */

/* una sessione finta come quella di Electron: `webRequest` è un oggetto solo, col metodo come proprietà sua (misurato su 44.3.0) */
const sessioneFinta = () => {
  const s = { ascolti: [] };
  s.webRequest = { onHeadersReceived(...a) { s.ascolti.push(a); } };
  return s;
};

test('ART-GUSCIO-20 (F4) dopo il nostro ascolto onHeadersReceived il metodo della sessione lancia: un secondo ascolto ferma l avvio, non toglie la lista in silenzio', () => {
  assert.equal(typeof modulo.SECONDO_ASCOLTO, 'string', 'oggi un secondo ascolto sostituisce il primo senza dire niente');
  const s = sessioneFinta();
  modulo.chiudiRetePagineRese(s, () => BASE);
  assert.equal(s.ascolti.length, 1);
  /* l istruzione del mutante K12 del controllore, tale e quale; poi la stessa chiamata per nome; poi una seconda protezione */
  assert.throws(() => s.webRequest['onHeaders' + 'Received']((_d, r) => r({})), { message: modulo.SECONDO_ASCOLTO });
  assert.throws(() => s.webRequest.onHeadersReceived(null), { message: modulo.SECONDO_ASCOLTO }, 'nemmeno per toglierla');
  assert.throws(() => modulo.chiudiRetePagineRese(s, () => BASE), { message: modulo.SECONDO_ASCOLTO });
  assert.equal(s.ascolti.length, 1, 'la lista resta quella di prima');
  /* riassegnare o ridefinire il metodo non passa (il modulo è in modo rigoroso: la riassegnazione lancia) */
  assert.throws(() => { s.webRequest.onHeadersReceived = () => {}; }, TypeError);
  assert.throws(() => Object.defineProperty(s.webRequest, 'onHeadersReceived', { value() {} }), TypeError);
  /* la sessione degli artefatti: un ascolto solo anche con più finestre, poi sigillata */
  const f = finti();
  gestore(f)({ url: richiesta() });
  gestore(f)({ url: richiesta(GETTONE, `/api/v1/pagine/${'E'.repeat(43)}/b.html`) });
  assert.equal(f.sessione.intestazioni.length, 1);
  assert.throws(() => f.sessione.webRequest.onHeadersReceived(null), { message: modulo.SECONDO_ASCOLTO });
  /* se il nostro ascolto non si posa (Electron lancia), il sigillo non scatta: si potrà riprovare */
  const rotta = { webRequest: { onHeadersReceived() { throw new Error('rotta'); } } };
  assert.throws(() => modulo.chiudiRetePagineRese(rotta, () => BASE), /rotta/u);
  rotta.webRequest.onHeadersReceived = function rifatta(...a) { rotta.posata = a.length; };
  modulo.chiudiRetePagineRese(rotta, () => BASE);
  assert.equal(rotta.posata, 2);
});

test('ART-GUSCIO-21 (N1) un processo per pagina resa: la funzione di Chromium si aggiunge alle altre già chieste, senza doppioni', () => {
  assert.equal(typeof modulo.isolaPagineRese, 'function', 'oggi tutte le anteprime in chat dividono un processo: ne cade una, cadono tutte');
  assert.equal(modulo.ISOLAMENTO_PAGINE_RESE, 'IsolateSandboxedIframes:grouping/per-origin'); // giro 5: per origine, ogni pagina ha la sua
  const riga = (valore) => {
    const r = { chiamate: [], getSwitchValue: (nome) => (nome === 'enable-features' ? valore : ''), appendSwitch(...a) { r.chiamate.push(a); } };
    return r;
  };
  for (const [prima, dopo] of [['', 'IsolateSandboxedIframes:grouping/per-origin'], [undefined, 'IsolateSandboxedIframes:grouping/per-origin'],
    ['Foo,Bar:x/1', 'Foo,Bar:x/1,IsolateSandboxedIframes:grouping/per-origin'],
    ['Foo,IsolateSandboxedIframes:grouping/per-document', 'Foo,IsolateSandboxedIframes:grouping/per-origin'],
    ['IsolateSandboxedIframes,Foo,', 'Foo,IsolateSandboxedIframes:grouping/per-origin'],
    ['IsolateSandboxedIframesX', 'IsolateSandboxedIframesX,IsolateSandboxedIframes:grouping/per-origin']]) {
    const r = riga(prima);
    modulo.isolaPagineRese(r);
    assert.deepEqual(r.chiamate, [['enable-features', dopo]], String(prima));
  }
});

/* la principale finta per `sorvegliaAnteprime`: cornici con nodo, processo e stato; un orologio a mano */
function principaleFinta(url = `${BASE}/`) {
  const c = { cornici: [], eventi: {}, una: {}, copioni: [], url, esito: () => Promise.resolve(),
    get mainFrame() { return { frames: c.cornici, executeJavaScript(copione) { c.copioni.push(copione); return c.esito(); } }; }, getURL: () => c.url,
    on(nome, f) { (c.eventi[nome] ??= []).push(f); }, once(nome, f) { c.una[nome] = f; },
    executeJavaScript(copione) { c.suWebContents = (c.suWebContents ?? 0) + 1; return c.esito(); } };
  c.naviga = (indirizzo, cornice, principale = false) => { for (const f of c.eventi['did-frame-navigate'] ?? []) f({}, indirizzo, 200, 'OK', principale, cornice?.processId, cornice?.routingId); };
  return c;
}
const corniceFinta = (id, processo = 10 + id) => ({ frameTreeNodeId: id, processId: processo, routingId: id, detached: false, morta: false, isDestroyed() { return this.morta; } });
function orologio() {
  const o = { giri: [], fermati: 0 };
  o.setInterval = (f, ms) => { o.giri.push({ f, ms, vivo: true }); return o.giri.length; };
  o.clearInterval = (n) => { if (o.giri[n - 1]?.vivo) { o.giri[n - 1].vivo = false; o.fermati += 1; } };
  o.vivi = () => o.giri.filter((g) => g.vivo);
  return o;
}

test('ART-GUSCIO-22 (N1) il guscio si accorge di un anteprima caduta e lo dice al documento dell app, una volta, coi soli percorsi', async () => {
  assert.equal(typeof modulo.sorvegliaAnteprime, 'function', 'oggi nessuno se ne accorge: Chromium non manda eventi al guscio per una cornice figlia');
  const c = principaleFinta(); const o = orologio(); const righe = [];
  const s = modulo.sorvegliaAnteprime(c, () => BASE, { registro: (r) => righe.push(r), ogni: 600, timer: o });
  const a = corniceFinta(1); const b = corniceFinta(2); const fuori = corniceFinta(3);
  c.cornici.push(a, b, fuori);
  assert.equal(o.giri.length, 0, 'nessun giro finché non c è un anteprima');
  c.naviga('http://127.0.0.1:9999/x', fuori); c.naviga('https://evil.example/', fuori);
  assert.equal(o.giri.length, 0, 'le cornici di altre origini (il Browser) non si guardano');
  c.naviga(`${BASE}${PAGINA}?v=1`, a);
  c.naviga(`${BASE}/api/v1/pagine/${CAP}/b.html`, b);
  assert.equal(o.vivi().length, 1, 'un giro solo per tutte');
  assert.equal(o.giri[0].ms, 600);
  s.controlla();
  assert.deepEqual(c.copioni, [], 'vive: niente da dire');
  /* caduta: un giro non basta (un cambio di processo in corso non è una caduta), il secondo sì */
  a.detached = true;
  s.controlla();
  assert.deepEqual(c.copioni, []);
  s.controlla(); await giro();
  assert.equal(c.copioni.length, 1);
  assert.deepEqual(righe, ['Anteprima caduta: avvisata l\'app.']);
  /* il copione porta l evento con i percorsi, in JSON */
  const inviati = [];
  new Function('window', 'CustomEvent', c.copioni[0])({ dispatchEvent: (e) => inviati.push(e) }, class { constructor(tipo, o) { this.type = tipo; this.detail = o.detail; } });
  assert.deepEqual(inviati.map((e) => [e.type, e.detail]), [['talos:anteprime-cadute', { indirizzi: [`${PAGINA}?v=1`] }]]);
  assert.equal(modulo.EVENTO_ANTEPRIME_CADUTE, 'talos:anteprime-cadute');
  /* detta una volta: non si ripete */
  s.controlla(); s.controlla(); await giro();
  assert.equal(c.copioni.length, 1);
  /* l altra cade con isDestroyed; un giro vivo in mezzo azzera il conto */
  b.morta = true; s.controlla(); b.morta = false; s.controlla(); b.morta = true; s.controlla(); await giro();
  assert.equal(c.copioni.length, 1, 'il conto riparte dopo un giro vivo');
  s.controlla(); await giro();
  assert.equal(c.copioni.length, 2);
  assert.equal(o.vivi().length, 0, 'senza anteprime guardate il giro si ferma');
  assert.ok(righe.every((r) => !r.includes('/api/') && !r.includes(CAP)), 'nel registro mai i percorsi');
  assert.equal(c.suWebContents, undefined, 'l avviso va alla cornice principale, non aspetta la fine del carico');

  /* la stessa cornice che naviga: si dicono il primo percorso (quello che l app conosce) e l ultimo */
  const d = principaleFinta(); const g = modulo.sorvegliaAnteprime(d, () => BASE, { timer: orologio() });
  const x = corniceFinta(7); d.cornici.push(x);
  d.naviga(`${BASE}/api/v1/pagine/${CAP}/a.html`, x); d.naviga(`${BASE}/api/v1/pagine/${CAP}/b.html`, x); d.naviga(`${BASE}/api/v1/pagine/${CAP}/c.html`, x);
  x.detached = true; g.controlla(); g.controlla(); await giro();
  assert.match(d.copioni[0], new RegExp(`\\["/api/v1/pagine/${CAP}/a\\.html","/api/v1/pagine/${CAP}/c\\.html"\\]`, 'u'));

  /* una cornice TOLTA dalla pagina non è una caduta */
  const e = principaleFinta(); const h = modulo.sorvegliaAnteprime(e, () => BASE, { timer: orologio() });
  const y = corniceFinta(8); e.cornici.push(y); e.naviga(`${BASE}${PAGINA}`, y);
  e.cornici.length = 0; h.controlla(); h.controlla(); await giro();
  assert.deepEqual(e.copioni, []);

  /* la principale lontana dal documento dell app (una pagina resa, un altra origine): non si avvisa nessuno */
  for (const altrove of [`${BASE}${PAGINA}`, 'https://evil.example/', '']) {
    const p = principaleFinta(altrove); const k = modulo.sorvegliaAnteprime(p, () => BASE, { timer: orologio() });
    const z = corniceFinta(9); p.cornici.push(z); p.naviga(`${BASE}${PAGINA}`, z); z.detached = true; k.controlla(); k.controlla(); await giro();
    assert.deepEqual(p.copioni, [], altrove);
  }

  /* la principale naviga, o se ne va: si dimentica tutto e il giro si ferma */
  const q = principaleFinta(); const oq = orologio(); modulo.sorvegliaAnteprime(q, () => BASE, { timer: oq });
  const w = corniceFinta(4); q.cornici.push(w); q.naviga(`${BASE}${PAGINA}`, w);
  q.naviga(`${BASE}/`, null, true);
  assert.equal(oq.vivi().length, 0);
  w.detached = true; oq.giri[0].f(); oq.giri[0].f(); await giro();
  assert.deepEqual(q.copioni, []);
  q.naviga(`${BASE}${PAGINA}`, w); q.una.destroyed();
  assert.equal(oq.vivi().length, 0);

  /* una cornice che non si trova (processo diverso) o senza servizio pronto non si guarda */
  const r = principaleFinta(); const or = orologio(); modulo.sorvegliaAnteprime(r, () => null, { timer: or });
  const u = corniceFinta(5); r.cornici.push(u); r.naviga(`${BASE}${PAGINA}`, u);
  r.naviga(`${BASE}${PAGINA}`, { processId: 999, routingId: 1 });
  assert.equal(or.giri.length, 0);

  /* l avviso che non arriva lo dice il registro, senza percorsi, e non lancia */
  const t = principaleFinta(); const righeT = []; t.esito = () => Promise.reject(new Error(`no ${PAGINA}`));
  const kt = modulo.sorvegliaAnteprime(t, () => BASE, { registro: (x) => righeT.push(x), timer: orologio() });
  const v = corniceFinta(6); t.cornici.push(v); t.naviga(`${BASE}${PAGINA}`, v); v.detached = true; kt.controlla(); kt.controlla();
  await giro(); await giro();
  assert.deepEqual(righeT, ['Anteprima caduta: avvisata l\'app.', 'Anteprima caduta: avviso non consegnato.']);
});

/* la pagina d'errore che la finestra carica (un indirizzo `data:`), letta come testo */
const testoDi = (indirizzo) => decodeURIComponent(String(indirizzo).replace(/^data:text\/html;charset=utf-8,/u, ''));
const vai = (w, dove) => { const e = evento(); for (const f of w.contenuto['will-navigate'] ?? []) f(e, dove); return e.fermato; };
const RIGA_FINESTRA = 'Finestra dell\'artefatto: la pagina è caduta di nuovo dopo la ricarica; mostrata «Pagina non caricata».';

test('ART-GUSCIO-23 (N1, giro 4 C3) nella finestra dell artefatto la pagina caduta si ricarica UNA volta; alla seconda la finestra RESTA e dice «Pagina non caricata.» con un «Riprova» che funziona, mai un giro', async () => {
  assert.equal(modulo.RICARICHE_FINESTRA_ARTEFATTO, 1);
  const f = finti();
  gestore(f)({ url: richiesta() });
  await giro(); await giro();
  const w = f.finestre[0];
  const pagina = `${BASE}${PAGINA}`;
  assert.deepEqual(w.caricati, [pagina]);
  const cade = w.contenuto['render-process-gone'];
  assert.equal(cade?.length, 1, 'oggi nessuno ascolta: la finestra resta bianca');
  cade[0]({}, { reason: 'crashed' });
  assert.equal(w.ricariche, 1);
  assert.equal(w.distrutta, false);
  /* una navigazione nella pagina viva non azzera niente: il conto lo azzera solo «Riprova» */
  assert.equal(vai(w, pagina), false);
  cade[0]({}, { reason: 'crashed' });
  await giro();
  assert.equal(w.ricariche, 1, 'la seconda caduta non ricarica');
  assert.equal(w.distrutta, false, 'oggi la finestra sparisce senza una parola');
  assert.equal(w.caricati.length, 2);
  assert.match(w.caricati[1], /^data:text\/html;charset=utf-8,/u, 'la riga si mostra NELLA finestra');
  const riga = testoDi(w.caricati[1]);
  assert.ok(riga.includes('<h1>Page not loaded.</h1>'), riga);
  assert.ok(riga.includes(`<a href="${pagina}">Try again</a>`), 'il «Riprova» porta alla pagina vera, nella sua cartella');
  assert.doesNotMatch(riga, /<script|\son[a-z]+=|javascript:/iu, 'la riga non ha copioni');
  assert.deepEqual(f.righe, [RIGA_FINESTRA]);
  assert.ok(f.righe.every((r) => !r.includes('/api/v1/pagine/')), 'mai il percorso nel registro');
  /* «Riprova»: la navigazione verso la pagina passa (resta nel lasciapassare), e il conto riparte: una ricarica, poi di nuovo la riga */
  assert.equal(vai(w, pagina), false, '«Riprova» non è fermato');
  cade[0]({}, { reason: 'crashed' });
  assert.equal(w.ricariche, 2, 'dopo «Riprova» torna la ricarica automatica');
  cade[0]({}, { reason: 'crashed' });
  await giro();
  assert.equal(w.ricariche, 2);
  assert.equal(w.caricati.length, 3);
  assert.equal(testoDi(w.caricati[2]), riga, 'la stessa riga');
  assert.equal(w.distrutta, false);
  /* dalla riga si va solo nella cartella della pagina */
  assert.equal(vai(w, 'https://esempio.test/'), true);
  /* una finestra già chiusa da sé non ricarica e non mostra niente */
  const g = finti(); gestore(g)({ url: richiesta() });
  await giro(); await giro();
  g.finestre[0].distrutta = true; g.finestre[0].contenuto['render-process-gone'][0]({}, {});
  assert.equal(g.finestre[0].ricariche, undefined);
  assert.equal(g.finestre[0].caricati.length, 1);
});

test('ART-GUSCIO-32 (giro 4, C3) la riga della finestra in inglese e in italiano, parola per parola, chiavi senza trattino', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(modulo.TESTI_PAGINA_NON_CARICATA)), {
    en: { titolo: 'Page not loaded.', spiegazione: 'It stopped working twice. Try again, or open it again from its card in the chat.', riprova: 'Try again',
      nonDisponibile: 'It could not be loaded. Try again, or open it again from its card in the chat.' }, // giro 5: il rifiuto del servizio
    it: { titolo: 'Pagina non caricata.', spiegazione: 'Si è fermata due volte. Riprova, oppure riaprila dalla sua carta nella chat.', riprova: 'Riprova',
      nonDisponibile: 'Non si è potuta caricare. Riprova, oppure riaprila dalla sua carta nella chat.' },
  });
  for (const lingua of ['en', 'it']) for (const chiave of Object.keys(modulo.TESTI_PAGINA_NON_CARICATA[lingua])) assert.doesNotMatch(chiave, /-/u);
  const pagina = `${BASE}${PAGINA}`;
  const it = testoDi(modulo.paginaNonCaricata(pagina, 'it-IT'));
  assert.ok(it.includes('<html lang="it">') && it.includes('<h1>Pagina non caricata.</h1>') && it.includes('<p>Si è fermata due volte. Riprova, oppure riaprila dalla sua carta nella chat.</p>') && it.includes(`>Riprova</a>`), it);
  assert.ok(it.includes('<title>Pagina non caricata.</title>'));
  const en = testoDi(modulo.paginaNonCaricata(pagina, 'en-US'));
  assert.ok(en.includes('<html lang="en">') && en.includes('<h1>Page not loaded.</h1>') && en.includes('>Try again</a>'), en);
  assert.ok(testoDi(modulo.paginaNonCaricata(pagina, undefined)).includes('Page not loaded.'), 'senza lingua: inglese');
  /* la politica della riga: niente copioni, niente rete, niente moduli */
  assert.match(en, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">/u);
  /* l indirizzo si mette in un attributo: le virgolette e i segni non escono dall attributo */
  const strano = testoDi(modulo.paginaNonCaricata(`${BASE}/api/v1/pagine/${CAP}/a%22%3E%3Cscript%3E.html`, 'en'));
  assert.doesNotMatch(strano, /<script/iu);
  assert.equal(modulo.paginaNonCaricata('http://127.0.0.1:1/x"><b>', 'en').includes('"><b>'), false);
  assert.ok(testoDi(modulo.paginaNonCaricata('http://127.0.0.1:1/x" onmouseover="y', 'en')).includes('<a href="http://127.0.0.1:1/x&quot; onmouseover=&quot;y">'), 'le virgolette restano nell attributo');
});

test('ART-GUSCIO-24 (F3) il servizio dà ancora `frame-ancestors \'self\'` a ogni documento «sandbox allow-scripts» che si incornicia (src/http-app.mjs)', () => {
  /* Il secondo strato sull altro nome della macchina: senza, una pagina chiamata `localhost` nell app avrebbe solo la lista del guscio. */
  const servizio = readFileSync(new URL('../../src/http-app.mjs', import.meta.url), 'utf8');
  const politiche = [...servizio.matchAll(/'Content-Security-Policy': [`"]sandbox allow-scripts;[^\n]*/gu)].map((m) => m[0]);
  assert.ok(politiche.length >= 3, `le pagine, il lettore e la rotta vecchia degli artefatti: ${politiche.length}`);
  /* giro 5: la rotta delle pagine sul nome di una pagina dà l'app (`${app ?? "'self'"}`), mai niente */
  for (const politica of politiche) assert.match(politica, /frame-ancestors (?:'self'|\$\{app \?\? "'self'"\})[`"],?\s*$/u, politica.slice(0, 120));
});

/* ───── Giro di sicurezza 5 delle anteprime (11/11/2026): un'ORIGINE per ogni pagina resa (`<etichetta>.localhost` alla porta del servizio) ───── */
const ETICHETTA = '0123456789abcdef'.repeat(2);
const ALTRA_ETICHETTA = 'fedcba9876543210'.repeat(2);
const SUA = `http://${ETICHETTA}.localhost:51234`;
const PAGINA_SUA = `${SUA}${PAGINA}`;

test('ART-GUSCIO-33 (giro 5) l isolamento resta quello di serie di Chromium, un processo per ORIGINE: si chiede per-origin, mai per-document', () => {
  assert.equal(modulo.ISOLAMENTO_PAGINE_RESE, 'IsolateSandboxedIframes:grouping/per-origin', 'oggi un processo per documento: anche i siti del Browser, +455 MB con 20 cornici');
  const riga = (valore) => { const r = { chiamate: [], getSwitchValue: (n) => (n === 'enable-features' ? valore : ''), appendSwitch(...a) { r.chiamate.push(a); } }; return r; };
  for (const [prima, dopo] of [['', 'IsolateSandboxedIframes:grouping/per-origin'], ['Foo,IsolateSandboxedIframes:grouping/per-document', 'Foo,IsolateSandboxedIframes:grouping/per-origin']]) {
    const r = riga(prima); modulo.isolaPagineRese(r);
    assert.deepEqual(r.chiamate, [['enable-features', dopo]], prima);
  }
});

test('ART-GUSCIO-34 (giro 5) l origine di una pagina: 32 cifre esadecimali sotto localhost, http, alla porta del servizio; nient altro', async () => {
  const { origineDiPagina } = await import('../runtime.mjs');
  assert.equal(typeof origineDiPagina, 'function', 'oggi il guscio non conosce le origini delle pagine');
  for (const si of [PAGINA_SUA, `${SUA}/`, `http://${ETICHETTA.toUpperCase()}.localhost:51234/x`]) assert.equal(origineDiPagina(si, BASE), true, si);
  for (const no of [`http://${ETICHETTA}.localhost:51235/`, `https://${ETICHETTA}.localhost:51234/`, `http://${ETICHETTA.slice(1)}.localhost:51234/`,
    `http://x.${ETICHETTA}.localhost:51234/`, 'http://localhost:51234/', `${BASE}/`, `http://${ETICHETTA}.localhost.evil.example:51234/`,
    `http://u:p@${ETICHETTA}.localhost:51234/`, 'non un indirizzo', '', null]) assert.equal(origineDiPagina(no, BASE), false, String(no));
  assert.equal(origineDiPagina(PAGINA_SUA, null), false, 'senza servizio non c è origine');
});

test('ART-GUSCIO-35 (giro 5) nella principale la pagina sulla sua origine prende la lista delle connessioni; il filtro la vede', () => {
  assert.ok(modulo.DOCUMENTI_LOCALI.urls.includes('http://*.localhost/*'), 'oggi l ascolto non vede le origini delle pagine: la pagina uscirebbe con WebRTC');
  const con = (h) => ({ responseHeaders: { ...h, 'Connection-Allowlist': ['(response-origin)'] } });
  assert.deepEqual({ responseHeaders: modulo.intestazioniPaginaResa({ url: PAGINA_SUA, responseHeaders: {} }, BASE) }, con({}));
  assert.deepEqual({ responseHeaders: modulo.intestazioniPaginaResa({ url: `${SUA}/api/v1/pagine/${CAP}/stile.css`, responseHeaders: { 'Content-Type': ['text/css'] } }, BASE) },
    con({ 'Content-Type': ['text/css'] }));
  for (const url of [`http://${ETICHETTA}.localhost:9999${PAGINA}`, `${SUA}/x`, `https://${ETICHETTA}.localhost:51234${PAGINA}`, `http://x.${ETICHETTA}.localhost:51234${PAGINA}`]) {
    assert.equal(modulo.intestazioniPaginaResa({ url, responseHeaders: { 'Content-Security-Policy': ['sandbox'] } }, BASE), null, url);
  }
});

test('ART-GUSCIO-36 (giro 5) una cornice sulla sua origine naviga solo nel suo lasciapassare, sulla sua origine', async () => {
  const { navigazioneCorniceConsentita } = await import('../runtime.mjs');
  assert.equal(navigazioneCorniceConsentita(BASE, PAGINA_SUA, `${SUA}/api/v1/pagine/${CAP}/guida/index.html`), true, 'un link interno');
  for (const [a, quale] of [['https://esterno.example/?dati=segreti', 'internet'], [`${BASE}${PAGINA}`, 'la stessa pagina sull origine dell app'],
    [`${SUA}/api/v1/pagine/${'B'.repeat(43)}/x.html`, 'un altro lasciapassare'], [`${SUA}/api/v1/sessions`, 'il resto dell API'],
    [`http://${ALTRA_ETICHETTA}.localhost:51234${PAGINA}`, 'l origine di un altra pagina'], [`${BASE}/api/v1/sessions`, 'l API dell app']]) {
    assert.equal(navigazioneCorniceConsentita(BASE, PAGINA_SUA, a), false, `oggi passa verso ${quale}`);
  }
  /* le pagine sul nome dell app (browser, telefono) come prima */
  assert.equal(navigazioneCorniceConsentita(BASE, `${BASE}${PAGINA}`, `${BASE}/api/v1/pagine/${CAP}/x.html`), true);
  assert.equal(navigazioneCorniceConsentita(BASE, `${BASE}${PAGINA}`, `${SUA}/api/v1/pagine/${CAP}/x.html`), false);
});

test('ART-GUSCIO-37 (giro 5) la finestra a parte apre la pagina sulla SUA origine; il proxy morto lascia diretta la porta del servizio, una volta per tutte le pagine', async () => {
  const assoluta = (etichetta = ETICHETTA, porta = 51234, percorso = PAGINA) => `http://${etichetta}.localhost:${porta}${percorso}`;
  assert.deepEqual(richiestaArtefatto(richiesta(GETTONE, assoluta()), GETTONE), { valida: true, pagina: assoluta() }, 'oggi la richiesta con l origine della pagina è negata');
  for (const no of [`https://${ETICHETTA}.localhost:51234${PAGINA}`, `http://${ETICHETTA.slice(2)}.localhost:51234${PAGINA}`, `http://x.${ETICHETTA}.localhost:51234${PAGINA}`,
    `http://${ETICHETTA}.localhost:51234/api/v1/sessions`, `${assoluta()}?x=1`, `${assoluta()}#x`, `http://${ETICHETTA}.localhost${PAGINA}`, `http://evil.example:51234${PAGINA}`,
    `http://u@${ETICHETTA}.localhost:51234${PAGINA}`, `http://${ETICHETTA}.localhost:51234/api/v1/pagine/${CAP}/..`]) {
    assert.deepEqual(richiestaArtefatto(richiesta(GETTONE, no), GETTONE), { valida: false }, no);
  }
  const f = finti();
  const w = f.finestreArtefatto.apri({ base: BASE, pagina: assoluta() }); await giro();
  assert.ok(w, f.righe.join('|'));
  assert.deepEqual(w.caricati, [assoluta()]);
  assert.deepEqual(f.sessione.proxy, [{ mode: 'fixed_servers', proxyRules: 'http://127.0.0.1:1', proxyBypassRules: '<-loopback>;127.0.0.1:51234;*.localhost:51234' }]);
  const seconda = f.finestreArtefatto.apri({ base: BASE, pagina: assoluta(ALTRA_ETICHETTA, 51234, `/api/v1/pagine/${CAP}/altra.html`) }); await giro();
  assert.equal(f.sessione.proxy.length, 1, 'due pagine, due origini, un servizio: il proxy si posa una volta');
  assert.deepEqual(seconda.caricati, [assoluta(ALTRA_ETICHETTA, 51234, `/api/v1/pagine/${CAP}/altra.html`)]);
  /* dentro la finestra si resta sulla sua origine e nel suo lasciapassare */
  assert.equal(navigazioneArtefattoConsentita(assoluta(), `${SUA}/api/v1/pagine/${CAP}/b.html`), true);
  assert.equal(navigazioneArtefattoConsentita(assoluta(), `${BASE}/api/v1/pagine/${CAP}/b.html`), false);
  /* un'altra porta (un altro servizio) non si apre */
  const g = finti();
  assert.equal(g.finestreArtefatto.apri({ base: BASE, pagina: assoluta(ETICHETTA, 51999) }), null);
  assert.equal(g.finestre.length, 0);
});

test('ART-GUSCIO-38 (giro 5) il guscio guarda anche le anteprime sulle loro origini, e all app dice il solo percorso', async () => {
  const c = principaleFinta(); const o = orologio();
  const s = modulo.sorvegliaAnteprime(c, () => BASE, { timer: o });
  const a = corniceFinta(1); const altrove = corniceFinta(2);
  c.cornici.push(a, altrove);
  c.naviga(`http://${ETICHETTA}.localhost:9999${PAGINA}`, altrove);
  assert.equal(o.giri.length, 0, 'un altra porta non è il servizio');
  c.naviga(`${PAGINA_SUA}?v=1`, a);
  assert.equal(o.vivi().length, 1, 'oggi l anteprima sulla sua origine non si guarda: se cade nessuno lo dice');
  a.detached = true; s.controlla(); s.controlla(); await giro();
  const inviati = [];
  new Function('window', 'CustomEvent', c.copioni[0])({ dispatchEvent: (e) => inviati.push(e) }, class { constructor(tipo, x) { this.type = tipo; this.detail = x.detail; } });
  assert.deepEqual(inviati.map((e) => e.detail), [{ indirizzi: [`${PAGINA}?v=1`] }]);
});

test('ART-GUSCIO-39 (giro 5, w-scaduta del controllore) la finestra che riceve un rifiuto del servizio (lasciapassare scaduto) mostra la riga, mai il JSON crudo', async () => {
  const f = finti({ lingua: 'it-IT' });
  const w = f.finestreArtefatto.apri({ base: BASE, pagina: PAGINA_SUA }); await giro();
  const naviga = (finestra, url, codice) => { for (const h of finestra.contenuto['did-navigate'] ?? []) h({}, url, codice, codice === 200 ? 'OK' : 'Not Found'); };
  naviga(w, PAGINA_SUA, 200); await giro();
  assert.equal(w.caricati.length, 1, 'la pagina viva resta');
  /* il lasciapassare scade (30 minuti fermo), la pagina cade, la ricarica riceve 404 */
  for (const h of w.contenuto['render-process-gone'] ?? []) h({}, { reason: 'crashed' });
  assert.equal(w.ricariche, 1);
  naviga(w, PAGINA_SUA, 404); await giro();
  assert.equal(w.caricati.length, 2, 'oggi la finestra resta sul 404 JSON del servizio');
  const riga = testoDi(w.caricati[1]);
  assert.match(riga, /<h1>Pagina non caricata\.<\/h1>/u);
  assert.ok(riga.includes(`<p>${modulo.TESTI_PAGINA_NON_CARICATA?.it?.nonDisponibile}</p>`), riga);
  assert.ok(riga.includes(`<a href="${PAGINA_SUA}">Riprova</a>`), 'Riprova porta alla pagina vera');
  assert.ok(f.righe.includes(modulo.RIGA_FINESTRA_RIFIUTATA), f.righe.join('|'));
  /* «Riprova» sullo stesso lasciapassare scaduto: un altro 404 e la stessa riga, mai un giro */
  assert.equal(vai(w, PAGINA_SUA), false);
  naviga(w, PAGINA_SUA, 404); await giro();
  assert.equal(w.caricati.length, 3);
  assert.equal(w.ricariche, 1, 'nessuna ricarica da sola dopo un rifiuto');
  /* un'altra pagina dello stesso lasciapassare rifiutata: la stessa riga; un'altra origine, un 200 o la riga stessa (data:) no */
  naviga(w, 'data:text/html,x', 0); naviga(w, `${BASE}${PAGINA}`, 404); naviga(w, PAGINA_SUA, 200); await giro();
  assert.equal(w.caricati.length, 3);
  naviga(w, `${SUA}/api/v1/pagine/${CAP}/altra.html`, 410); await giro();
  assert.equal(w.caricati.length, 4);
  assert.ok(testoDi(w.caricati[3]).includes(`<a href="${PAGINA_SUA}">Riprova</a>`), 'Riprova porta sempre alla pagina aperta');
  /* inglese di serie */
  const e = finti();
  const we = e.finestreArtefatto.apri({ base: BASE, pagina: PAGINA }); await giro();
  naviga(we, BASE + PAGINA, 404); await giro();
  assert.ok(testoDi(we.caricati[1]).includes(`<p>${modulo.TESTI_PAGINA_NON_CARICATA?.en?.nonDisponibile}</p>`));
  assert.equal(modulo.TESTI_PAGINA_NON_CARICATA.en.nonDisponibile, 'It could not be loaded. Try again, or open it again from its card in the chat.');
  assert.equal(modulo.TESTI_PAGINA_NON_CARICATA.it.nonDisponibile, 'Non si è potuta caricare. Riprova, oppure riaprila dalla sua carta nella chat.');
});
