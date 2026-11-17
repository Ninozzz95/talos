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
import { BASE, PRINCIPALE, SECONDO, dipFisico, finti, prossimoGiro, aspetta, vivi } from './fixtures/segno-finestre-finte.mjs';

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
  assert.equal(o.paintWhenInitiallyHidden, true, 'giro 6: nascosta e appena nata disegna, se no il primo battito non arriva mai');
  assert.deepEqual(o.webPreferences, { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false });
  assert.equal('partition' in o.webPreferences, false, 'senza partition cookie e BroadcastChannel della bolla non si vedono');
  assert.equal('preload' in o.webPreferences, false, 'niente ipc');
  const f = finti();
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  await segno.aggiorna(BASE, 1);
  /* giro 5 della bolla: si mostra al primo battito di OGNI schermo (segno-battito.test.mjs), non al caricamento */
  for (const w of f.finestre) w.carica(200);
  for (const w of f.finestre) w.batti();
  for (const w of f.finestre) {
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
  let [w] = f.finestre;
  w.carica(404);
  assert.equal(w.visibile, false, 'un 404 trasparente e sempre sopra non si mostra');
  assert.match(f.righe.join('\n'), /404/u);
  /* Giro 4 della bolla (controllore CU, 13/11): dopo una pagina mancata il segno resta spento per tutto l'avvio, come con la protezione rifiutata. Il server
     l'ha già saputo e l'aiutante ha riacceso il suo cursore: una pagina buona dopo darebbe DUE cursori. Prima qui il server ripartito la mostrava di nuovo. */
  assert.equal(await segno.aggiorna(BASE, 2), false, 'spento per tutto l avvio: niente ricarica');
  w.carica(200); w.batti();
  assert.equal(w.visibile, false, 'una pagina buona arrivata dopo non si mostra, nemmeno se batte');
  /* una pagina buona, poi un caricamento che fallisce sulla cornice principale: si nasconde. Giro 5: «buona» = arrivata con 200 E battuta su ogni schermo */
  const g = finti();
  const s2 = creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false });
  await s2.aggiorna(BASE, 1);
  const [v] = g.finestre;
  for (const x of g.finestre) { x.carica(200); x.batti(); }
  assert.equal(v.visibile, true, 'arrivata con 200 e battuta: si mostra');
  await s2.aggiorna(BASE, 2);
  v.carica(200);
  v.emettiContenuto('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', `${BASE}/segno.html`, true);
  assert.equal(v.visibile, false);
  /* AL CONTRARIO: una cornice che fallisce dentro la pagina non conta; i controlli della navigazione su questa finestra buona */
  const h = finti();
  await creaSegnoFinestre({ ...h.dipendenze, accesa: true, vecchio: false }).aggiorna(BASE, 1);
  w = h.finestre[0];
  for (const x of h.finestre) { x.carica(200); x.batti(); }
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
  /* giro 4: una pagina ancora in caricamento (prima qui un 404, che ora spegne il segno per tutto l'avvio: SEGNO-FINESTRA-23) */
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
    const notizie = [];
    const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5, quandoCambia: (a) => notizie.push(a) });
    await segno.aggiorna(BASE, 1);
    for (const w of f.finestre) { w.carica(200); w.batti(); } // giro 5: acceso solo dopo il battito di ogni schermo
    assert.deepEqual(notizie, [true]);
    f.emettiSchermo('display-metrics-changed', PRINCIPALE, ['scaleFactor']);
    /* la seconda volta il timer sfugge alla cancellazione: lo ferma il timer stesso, a guscio chiuso */
    const vero = globalThis.clearTimeout;
    if (!timerCancellato) globalThis.clearTimeout = () => {};
    try { segno.chiudi(); } finally { globalThis.clearTimeout = vero; }
    await aspetta(30);
    assert.deepEqual([f.finestre.length, vivi(f).length], [2, 0], `nessuna finestra dopo la chiusura (timer cancellato: ${timerCancellato})`);
    assert.deepEqual(notizie, [true, false], 'giudice v1790: a guscio chiuso il segno non si vede più, il server lo sa una volta');
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
    const notizie = []; // giudice v1790: il server lo sa una volta, anche se lo schermo che tiene è l'altro
    const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5, adesso: () => (ora += 1000), quandoCambia: (a) => notizie.push(a) });
    segno.bollaPronta();
    assert.equal(await segno.aggiorna(BASE, 1), false, nome);
    /* giro 5 della bolla: il segno non è mai stato acceso (nessun battito), quindi il server è partito col cursore dell'aiutante e non c'è niente da dirgli.
       Prima qui la notizia `false` arrivava perché `acceso()` era vero ancora prima delle finestre */
    assert.deepEqual([notizie, segno.acceso()], [[], false], `${nome}: il cursore dell'aiutante resta`);
    assert.deepEqual([f.finestre.length, vivi(f).length], [2, 0], `${nome}: zero finestre vive, nemmeno quella protetta`);
    for (const w of f.finestre) {
      assert.deepEqual([w.caricati.length, w.visibile], [0, false], `${nome}: mai caricata, mai mostrata`);
      w.emettiContenuto('did-navigate', {}, BASE, 200); w.emettiContenuto('did-finish-load'); w.batti();
      assert.equal(w.visibile, false, `${nome}: un caricamento tardivo, anche con il battito, non la mostra`);
    }
    assert.deepEqual([notizie, segno.acceso()], [[], false], nome);
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

/* Giudice v1790 (13/11/2026): il server spegne il cursore dell'aiutante (`mcp --no-overlay`) SOLO quando il segno di TALOS si vede davvero.
   `acceso()` è la domanda del guscio, `quandoCambia(false)` la notizia quando smette di vedersi (protezione rifiutata, guscio chiuso). */
test('SEGNO-FINESTRA-20 acceso() è vero solo col segno acceso, su Windows 2004 o dopo, a protezione tenuta e guscio aperto', async () => {
  const f = finti();
  assert.equal(creaSegnoFinestre({ ...f.dipendenze, accesa: false, vecchio: false }).acceso(), false, 'spento di serie (niente --talos-bolla)');
  assert.equal(creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: true }).acceso(), false, 'Windows prima della 2004');
  for (const piattaforma of ['linux', 'darwin']) assert.equal(creaSegnoFinestre({ ...f.dipendenze, piattaforma, accesa: true, vecchio: false }).acceso(), false, piattaforma);
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false });
  /* giro 5 della bolla: prima era vero già prima delle finestre, e un compito partito subito restava senza cursori; ora solo dopo il battito di ogni schermo */
  assert.equal(segno.acceso(), false, 'prima delle finestre: il server parte col cursore dell aiutante');
  await segno.aggiorna(BASE, 1);
  assert.equal(segno.acceso(), false, 'la protezione tiene, ma le pagine non hanno ancora battuto');
  for (const w of f.finestre) { w.carica(200); w.batti(); }
  assert.equal(segno.acceso(), true, 'la protezione tiene e ogni schermo batte');
  segno.chiudi();
  assert.equal(segno.acceso(), false, 'guscio chiuso');
  const g = finti({ protezioneTiene: false });
  const rifiutato = creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false });
  await rifiutato.aggiorna(BASE, 1);
  assert.equal(rifiutato.acceso(), false, 'protezione rifiutata');
  const h = finti({ protezione: false });
  const senza = creaSegnoFinestre({ ...h.dipendenze, accesa: true, vecchio: false });
  await senza.aggiorna(BASE, 1);
  assert.equal(senza.acceso(), false, 'protezione non disponibile');
});

test('SEGNO-FINESTRA-21 quandoCambia(false) una volta sola quando il segno smette di vedersi; mai se non si è mai visto', async () => {
  for (const opzioni of [{ protezioneTiene: false }, { protezione: false }]) {
    const f = finti(opzioni);
    const notizie = [];
    const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 1, quandoCambia: (acceso) => notizie.push(acceso) });
    assert.deepEqual(notizie, [], 'niente prima delle finestre');
    await segno.aggiorna(BASE, 1);
    /* giro 5 della bolla: rifiutata al primo giro il segno non è mai stato acceso (nessun battito), il server è partito col cursore dell'aiutante: nessuna
       notizia. Prima qui arrivava `false` perché `acceso()` era vero già prima delle finestre. Rifiutata A METÀ: BATTITO-11 (una notizia `false`) */
    assert.deepEqual(notizie, [], `${JSON.stringify(opzioni)}: mai acceso, niente da dire`);
    f.emettiSchermo('display-added', f.schermi[0]);
    await aspetta(20);
    segno.chiudi();
    assert.deepEqual(notizie, [], 'un cambio di schermi e la chiusura non inventano notizie');
  }
  /* AL CONTRARIO: la protezione tiene e le pagine battono ⇒ acceso una volta, poi alla chiusura spento una volta */
  const g = finti();
  const notizie = [];
  const segno = creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false, quandoCambia: (acceso) => notizie.push(acceso) });
  await segno.aggiorna(BASE, 1);
  assert.deepEqual(notizie, []);
  for (const w of g.finestre) { w.carica(200); w.batti(); w.batti(); }
  assert.deepEqual(notizie, [true]);
  segno.chiudi(); segno.chiudi();
  assert.deepEqual(notizie, [true, false]);
  /* spento di serie, Windows vecchio: mai visto, mai una notizia */
  for (const o of [{ accesa: false, vecchio: false }, { accesa: true, vecchio: true }, { accesa: true, vecchio: false, piattaforma: 'linux' }]) {
    const h = finti();
    const n = [];
    const s = creaSegnoFinestre({ ...h.dipendenze, ...o, quandoCambia: (acceso) => n.push(acceso) });
    await s.aggiorna(BASE, 1); s.chiudi();
    assert.deepEqual(n, [], JSON.stringify(o));
  }
});

test('SEGNO-FINESTRA-22 main.mjs dice il segno al server: nell ambiente quando lo avvia, e col canale privato quando smette di vedersi', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  assert.match(main, /creaAvvioFiglio\(\{[^\n]*segnoAcceso: segno\.acceso\(\)[^\n]*\}\)/u, 'letto a ogni avvio del server, non una volta per sempre');
  assert.match(main, /quandoCambia: acceso => \{ for \(const h of figli\) if \(h\.proc\.connected\) h\.proc\.send\(\{ tipo: 'segno', acceso \}, \(\) => \{\}\); \}/u);
  const bootstrap = readFileSync(new URL('../child-bootstrap.mjs', import.meta.url), 'utf8');
  assert.match(bootstrap, /messaggio\?\.tipo === 'segno'/u);
});

/* giro 5 della bolla: l'altro verso del canale. Il guscio non decide da sé chi ha un aiutante col cursore: dà al segno ogni messaggio e ogni uscita col figlio
   che li riguarda, e il segno tiene il conto (BATTITO-19 lo prova in esecuzione). Un figlio uscito senza dirlo terrebbe il segno nascosto per sempre. */
test('SEGNO-FINESTRA-25 main.mjs passa al segno, figlio per figlio, il messaggio `segno-aiutante` del server e l uscita del figlio', () => {
  const main = readFileSync(new URL('../main.mjs', import.meta.url), 'utf8');
  const chiamate = [...main.matchAll(/segno\.aiutante\(([^)]*)\)/gu)].map((m) => m[1]);
  assert.deepEqual(chiamate, ['messaggio.conCursore, handle', 'false, handle'], 'due chiamate: il messaggio del server e l uscita, sempre col figlio');
  assert.ok(main.indexOf("messaggio?.tipo === 'segno-aiutante'") > main.indexOf("proc.on('message'"), 'dentro l ascolto dei messaggi di quel figlio');
  assert.ok(main.indexOf('segno.aiutante(false, handle)') > main.indexOf('const terminato = codice =>'), 'all uscita del figlio');
});

/* Giro 4 della bolla (controllore CU, 13/11, sonda `sonda-segno-non-caricato.test.mjs` copiata e allargata): la pagina del segno non c'è (HTTP 404), non si
   carica (cornice principale), il suo processo muore, o non è mai pronta. Prima `acceso()` restava vero e `quandoCambia` non partiva: il server lasciava
   l'aiutante con `--no-overlay` e sullo schermo non c'era NESSUN cursore. Ora il segno si spegne per tutto l'avvio, su tutti gli schermi, e il server lo sa.
   Hermes fa lo stesso con le sue finestre: un `did-fail-load` della cornice principale o `render-process-gone` = finestra fallita, una volta
   (`apps/desktop/electron/window-reveal.ts:166-174`), e ERR_ABORTED (-3) non è un guasto (`window-renderer-lifecycle.ts:200-201`). */
const GUASTI_DELLA_PAGINA = [
  ['404', (w) => { w.emettiContenuto('did-navigate', {}, w.caricati.at(-1), 404); w.emettiContenuto('did-finish-load'); }],
  ['500', (w) => { w.emettiContenuto('did-navigate', {}, w.caricati.at(-1), 500); w.emettiContenuto('did-finish-load'); }],
  ['caricamento fallito', (w) => { w.emettiContenuto('did-fail-load', {}, -102, 'ERR_CONNECTION_REFUSED', w.caricati.at(-1), true); }],
  ['processo della pagina morto', (w) => { w.carica(200); w.emettiContenuto('render-process-gone', {}, { reason: 'crashed', exitCode: -1 }); }],
  ['mai pronta', async () => { await aspetta(60); }],
  /* giro 5: arrivate con 200 su tutti e due gli schermi, ma non battono mai (lo script manca, si rompe o non disegna): scaduto il tempo è come mai pronta */
  ['200 che non batte', async (_w, f) => { for (const w of f.finestre) w.carica(200); await aspetta(60); }],
];
/** I guasti in cui nessuna pagina batte mai: il segno non si accende, e il server non riceve notizie. */
const MAI_BATTUTE = new Set(['mai pronta', '200 che non batte']);

/* giro 5 della bolla (controllore, mutanti a 2 uccisori): la prova unica e grande spezzata in una prova per guasto, stessi controlli, niente perso */
for (const [nome, guasto] of GUASTI_DELLA_PAGINA) {
  test(`SEGNO-FINESTRA-23 (${nome}) la pagina del segno manca su uno schermo: il segno si spegne ovunque, acceso() falso, il server lo sa una volta; mai zero cursori`, async () => {
    let ora = 0;
    const f = finti();
    const notizie = [];
    const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5, msPaginaPronta: 30, adesso: () => (ora += 1000), quandoCambia: (a) => notizie.push(a) });
    /* giro 5 della bolla: prima qui il guscio diceva già «acceso» prima della pagina (e un compito partito subito restava senza cursori); ora no */
    assert.equal(segno.acceso(), false, `${nome}: prima della pagina il server parte col cursore dell aiutante`);
    assert.equal(await segno.aggiorna(BASE, 1), true, nome);
    const [rotta, buona] = f.finestre;
    /* giro 5: le due pagine arrivano e battono (il segno si vede), poi si guasta quella di uno schermo solo; «mai pronta» e «200 che non batte» non battono mai */
    if (!MAI_BATTUTE.has(nome)) { for (const w of f.finestre) { w.carica(200); w.batti(); } assert.equal(segno.acceso(), true, nome); }
    await guasto(rotta, f);
    assert.equal(segno.acceso(), false, `${nome}: il segno non si vede, il guscio non dice più «acceso»`);
    assert.deepEqual(notizie, MAI_BATTUTE.has(nome) ? [] : [true, false], `${nome}: il server lo sa una volta, e l'aiutante riaccende il suo cursore`);
    assert.deepEqual(f.finestre.map((w) => w.visibile), [false, false], `${nome}: nessun segno su nessuno schermo, nemmeno dove la pagina c'era`);
    assert.equal(buona.ordine.some(([n]) => n === 'hide') || MAI_BATTUTE.has(nome), true, `${nome}: anche la finestra buona si nasconde`);
    assert.ok(f.righe.length >= 1, `${nome}: una riga nel registro del guscio`);
    /* e resta spento: una pagina buona tardiva che batte (prima e dopo la chiusura delle finestre), un server ripartito, un cambio di schermi, il ripiego non lo riaccendono */
    for (const w of f.finestre) { w.emettiContenuto('did-navigate', {}, BASE, 200); w.emettiContenuto('did-finish-load'); w.batti(); }
    assert.deepEqual(f.finestre.map((w) => w.visibile), [false, false], `${nome}: una pagina buona subito dopo non lo mostra`);
    await prossimoGiro();
    for (const w of f.finestre) { w.emettiContenuto('did-navigate', {}, BASE, 200); w.emettiContenuto('did-finish-load'); w.batti(); }
    assert.deepEqual(f.finestre.map((w) => w.visibile), [false, false], `${nome}: un caricamento tardivo non lo mostra`);
    assert.equal(await segno.aggiorna(BASE, 2), false, `${nome}: niente ricarica`);
    f.emettiSchermo('display-added', SECONDO);
    await aspetta(20);
    assert.equal(vivi(f).length, 0, `${nome}: nessuna finestra viva, nessuna rifatta`);
    assert.equal(f.finestre.length, 2, `${nome}: nessuna finestra nuova`);
    assert.equal(segno.ripiego(), false, nome);
    assert.equal(segno.acceso(), false, nome);
    segno.chiudi();
    assert.deepEqual(notizie, MAI_BATTUTE.has(nome) ? [] : [true, false], `${nome}: la chiusura dopo non ripete la notizia`);
  });
}

test('SEGNO-FINESTRA-24 AL CONTRARIO: una navigazione sostituita (ERR_ABORTED), una cornice interna, una pagina pronta in tempo non spengono niente', async () => {
  const f = finti();
  const notizie = [];
  const segno = creaSegnoFinestre({ ...f.dipendenze, accesa: true, vecchio: false, ritardoRicostruisci: 5, msPaginaPronta: 40, quandoCambia: (a) => notizie.push(a) });
  await segno.aggiorna(BASE, 1);
  for (const w of f.finestre) w.emettiContenuto('did-fail-load', {}, -3, 'ERR_ABORTED', w.caricati.at(-1), true); // il server è ripartito a metà caricamento
  await segno.aggiorna(BASE, 2);
  await aspetta(10);
  for (const w of f.finestre) { w.carica(200); w.batti(); }
  for (const w of f.finestre) w.emettiContenuto('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://x.test/', false);
  f.finestre[0].emettiContenuto('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
  await aspetta(80); // oltre msPaginaPronta: le pagine erano pronte in tempo
  /* giro 5 della bolla: acceso dopo il primo battito, quindi una notizia `true` (prima nessuna: era vero già dall'inizio) */
  assert.deepEqual([segno.acceso(), notizie], [true, [true]]);
  assert.deepEqual(f.finestre.map((w) => w.visibile), [true, true]);
  /* una ricarica per un server nuovo arrivata in tempo torna accesa anche lei: giro 5, nel mezzo è spento (la pagina nuova non ha ancora battuto) e il server lo sa */
  await segno.aggiorna(BASE, 3);
  await aspetta(10);
  for (const w of f.finestre) { w.carica(200); w.batti(); }
  await aspetta(60);
  assert.deepEqual([segno.acceso(), notizie, vivi(f).length], [true, [true, false, true], 2]);
  assert.deepEqual(f.finestre.map((w) => w.visibile), [true, true]);
  /* un cambio di schermi che rifà le finestre: le vecchie distrutte non contano, le nuove hanno il loro tempo (e il loro primo battito) */
  f.emettiSchermo('display-metrics-changed', PRINCIPALE, ['scaleFactor']);
  await aspetta(20); // il giro di ricostruzione (5 ms) viene prima della scadenza delle pagine nuove (40 ms dopo): l'ordine dei timer è fisso
  assert.equal(vivi(f).length, 2);
  for (const w of vivi(f)) { w.carica(200); w.batti(); }
  await aspetta(60);
  assert.deepEqual([segno.acceso(), notizie, vivi(f).length], [true, [true, false, true, false, true], 2]);
  assert.deepEqual(vivi(f).map((w) => w.visibile), [true, true]);
  segno.chiudi();
  assert.deepEqual(notizie, [true, false, true, false, true, false]);
  /* la scadenza di un caricamento vecchio non giudica quello nuovo: server ripartito a metà, la pagina nuova arriva dopo la scadenza vecchia e prima della sua */
  const g = finti();
  const n2 = [];
  const s2 = creaSegnoFinestre({ ...g.dipendenze, accesa: true, vecchio: false, msPaginaPronta: 40, quandoCambia: (a) => n2.push(a) });
  await s2.aggiorna(BASE, 1); // scade fra 40 ms
  await aspetta(25);
  await s2.aggiorna(BASE, 2); // scade 40 ms dopo questa
  await aspetta(25); // la prima scadenza è passata, la seconda no
  for (const w of g.finestre) { w.carica(200); w.batti(); }
  await aspetta(50);
  assert.deepEqual([s2.acceso(), n2, g.finestre.map((w) => w.visibile)], [true, [true], [true, true]]);
  s2.chiudi();
});
