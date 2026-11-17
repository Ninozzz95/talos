/*
 * Giro 5 della bolla (decisione dell'owner 14/11/2026 08:18, giudice v1838-v1839; ROSSO del controllore, punto 3): la pagina del segno dice al guscio che disegna
 *   davvero, con un battito periodico. Il battito usa la porta senza ponte del ripiego (`window.open` di un indirizzo convenuto, che il guscio nega:
 *   `desktop/segno-finestra.mjs`). Parte solo dopo che il segno è nella pagina E il browser ha disegnato un fotogramma (due `requestAnimationFrame` di fila:
 *   la richiamata arriva prima del disegno del fotogramma dopo, HTML «update the rendering»); poi ogni MS_BATTITO, e ogni volta ricontrolla che il segno ci sia.
 *   Script che manca, che si rompe prima della fine, schermo non valido (il segno non disegna) o pagina bloccata: nessun battito, e il guscio torna al cursore
 *   dell'aiutante. Electron (`web-preferences.md`): con `backgroundThrottling: false` la finestra nascosta disegna lo stesso, quindi i fotogrammi arrivano.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { documento, orologio } from './aiuto-dom-blocchi.mjs';
import * as messaggi from '../../src/components/computer-use/bolla-messaggi.js';
import * as componente from '../../src/components/computer-use/segno.js';

const BATTITO = 'talos-segno:battito';

/** I fotogrammi finti: `fotogramma(f)` mette in coda, `disegna()` li chiama come il browser al fotogramma dopo. */
function fotogrammi() {
  let coda = [];
  return { fotogramma: (f) => { coda.push(f); return coda.length; }, disegna() { const ora = coda; coda = []; for (const f of ora) f(); }, inCoda: () => coda.length };
}

test('SBAT-01 il battito parte solo dopo un fotogramma disegnato col segno nella pagina, poi a intervalli; mai col segno fuori o nascosto; si ferma', () => {
  assert.equal(messaggi.INDIRIZZO_BATTITO, BATTITO);
  assert.equal(typeof messaggi.MS_BATTITO, 'number');
  assert.equal(typeof componente.creaBattito, 'function');
  const document = documento();
  const nodo = document.createElement('div');
  document.body.append(nodo);
  const clock = orologio(); const f = fotogrammi(); const battiti = [];
  const b = componente.creaBattito({ nodo, batti: () => battiti.push(clock.adesso()), fotogramma: f.fotogramma, timer: clock.timer, ms: 500 });
  /* giro 6: senza fotogrammi il primo battito arriva dai timer dopo 500 ms (la finestra mai mostrata, segno-battito-nascosto.test.mjs); prima no */
  clock.avanza(400);
  assert.deepEqual(battiti, [], 'nessun fotogramma ancora e tempo non scaduto: nessun battito');
  f.disegna();
  assert.deepEqual(battiti, [], 'un fotogramma solo: la richiamata viene PRIMA del disegno');
  f.disegna();
  assert.equal(battiti.length, 1, 'disegnato: il primo battito');
  clock.avanza(1600);
  assert.equal(battiti.length, 4, 'poi uno ogni 500 ms');
  nodo.remove();
  clock.avanza(1000);
  assert.equal(battiti.length, 4, 'il segno non è più nella pagina: niente battiti');
  document.body.append(nodo);
  nodo.hidden = true;
  clock.avanza(1000);
  assert.equal(battiti.length, 4, 'nascosto (schermo non valido): niente battiti');
  nodo.hidden = false;
  clock.avanza(500);
  assert.equal(battiti.length, 5);
  b.ferma();
  clock.avanza(5000);
  assert.equal(battiti.length, 5, 'fermato');
  /* AL CONTRARIO: il segno mai entrato nella pagina non batte nemmeno dopo i fotogrammi */
  const fuori = document.createElement('div');
  const g = fotogrammi(); const altri = [];
  componente.creaBattito({ nodo: fuori, batti: () => altri.push(1), fotogramma: g.fotogramma, timer: clock.timer, ms: 500 });
  g.disegna(); g.disegna(); clock.avanza(3000);
  assert.deepEqual(altri, []);
});

/** L'ingresso VERO della pagina (`src/segno.js`), impacchettato come nella build, eseguito con un browser finto: ciò che apre con `window.open`. */
async function ingresso({ query = '?fx=0&fy=0&fw=1920&fh=1080&scala=1', canaleRotto = false, mediaRidotto = false } = {}) {
  const esbuild = await import('esbuild');
  const r = await esbuild.build({ entryPoints: [fileURLToPath(new URL('../../src/segno.js', import.meta.url))], bundle: true, format: 'iife', write: false, logLevel: 'silent' });
  const document = documento();
  const clock = orologio(); const f = fotogrammi(); const aperti = [];
  /* giro 5 (mutanti a 2 uccisori): gli ascoltatori della finestra e della preferenza di Windows, e l'archivio delle impostazioni, guidati dalla prova */
  const ascolta = { finestra: {}, media: {} }; let salvate = null;
  const window = { open: (u) => { aperti.push(u); return null; }, addEventListener: (nome, fn) => { ascolta.finestra[nome] = fn; }, localStorage: { getItem: () => salvate } };
  const media = { matches: mediaRidotto, addEventListener: (nome, fn) => { ascolta.media[nome] = fn; } };
  const contesto = {
    document, window, location: { search: query, origin: 'http://127.0.0.1:51234' },
    matchMedia: () => media,
    BroadcastChannel: class { constructor() { if (canaleRotto) throw new Error('canale rotto'); this.onmessage = null; } },
    requestAnimationFrame: f.fotogramma,
    setTimeout: clock.timer.setTimeout, clearTimeout: clock.timer.clearTimeout, setInterval: clock.timer.setInterval, clearInterval: clock.timer.clearInterval,
    Date, URLSearchParams, Object, Array, Map, Set, Math, Number, JSON, String,
  };
  let errore = null;
  try { runInNewContext(r.outputFiles[0].text, contesto); } catch (e) { errore = e; }
  const salva = (impostazioni) => { salvate = impostazioni === null ? null : JSON.stringify(impostazioni); };
  return { aperti, f, clock, errore, document, ascolta, media, salva };
}
const CHIAVE = 'talos.harness.desktop.settings.v1';
const ridotto = (p) => p.document.body.children[0].classList.contains('reduce-motion');

test('SBAT-02 l ingresso vero della pagina batte dopo il disegno; con lo schermo non valido o con lo script che si rompe a metà non batte mai', async () => {
  const buona = await ingresso();
  assert.equal(buona.errore, null);
  buona.clock.avanza(messaggi.MS_BATTITO - 100); // giro 6: dopo MS_BATTITO batte anche senza fotogrammi (segno-battito-nascosto.test.mjs)
  assert.deepEqual(buona.aperti, [], 'caricata, nessun fotogramma e tempo non scaduto: nessun battito');
  buona.f.disegna(); buona.f.disegna();
  assert.deepEqual(buona.aperti, [BATTITO], 'il primo battito dopo il disegno');
  buona.clock.avanza(messaggi.MS_BATTITO * 3);
  assert.deepEqual(buona.aperti, [BATTITO, BATTITO, BATTITO, BATTITO], 'poi a intervalli');
  /* la query del guscio non valida: il segno non disegna niente, e non lo dice al guscio come se disegnasse */
  const storta = await ingresso({ query: '?fx=0&fy=0&fw=0&fh=1080&scala=1' });
  storta.f.disegna(); storta.f.disegna(); storta.clock.avanza(3000);
  assert.deepEqual(storta.aperti, []);
  /* lo script si rompe prima di arrivare in fondo: nessun battito */
  const rotta = await ingresso({ canaleRotto: true });
  assert.ok(rotta.errore, 'lo script si è rotto');
  rotta.f.disegna(); rotta.f.disegna(); rotta.clock.avanza(3000);
  assert.deepEqual(rotta.aperti, []);
});

/* Giro 5 (controllore, mutanti a 2 uccisori): ciò che SEG-18 controlla sul testo dell'ingresso, qui sull'ingresso VERO in esecuzione. La pagina del segno resta
   aperta per tutto l'avvio: «Riduci movimento» cambiato con TALOS aperto (evento `storage` con la chiave, o `null` = archivio svuotato; MDN «Window: storage
   event») e la preferenza di Windows (`change`) arrivano al segno nei due versi; il battito continua intanto. */
test('SBAT-03 l ingresso vero segue «Riduci movimento» e Windows a pagina aperta, nei due versi, e intanto continua a battere', async () => {
  const p = await ingresso();
  assert.equal(p.errore, null);
  p.f.disegna(); p.f.disegna();
  assert.equal(ridotto(p), false, 'di serie si muove');
  p.media.matches = true; p.ascolta.media.change();
  assert.equal(ridotto(p), true, 'Windows chiede il movimento ridotto');
  p.media.matches = false; p.ascolta.media.change();
  assert.equal(ridotto(p), false, 'e smette di chiederlo: il segno torna a muoversi');
  p.salva({ appearance: { reducedMotion: true } }); p.ascolta.finestra.storage({ key: CHIAVE });
  assert.equal(ridotto(p), true, '«Riduci movimento» acceso nella pagina principale');
  p.salva({ appearance: { reducedMotion: false } }); p.ascolta.finestra.storage({ key: 'un.altra.chiave' });
  assert.equal(ridotto(p), true, 'un altra chiave non conta');
  p.salva(null); p.ascolta.finestra.storage({ key: null });
  assert.equal(ridotto(p), false, 'archivio svuotato (`key` null): si torna a muoversi');
  p.clock.avanza(messaggi.MS_BATTITO * 2);
  assert.deepEqual(p.aperti, [BATTITO, BATTITO, BATTITO], 'il battito non si è fermato');
});

test('SBAT-04 l ingresso vero con il movimento ridotto già chiesto da Windows: il segno nasce fermo, e batte dopo il disegno', async () => {
  const p = await ingresso({ mediaRidotto: true });
  assert.equal(p.errore, null);
  assert.equal(ridotto(p), true, 'fermo dal primo fotogramma, senza aspettare un cambio');
  assert.deepEqual(p.aperti, [], 'non ancora disegnato');
  p.f.disegna(); p.f.disegna();
  assert.deepEqual(p.aperti, [BATTITO]);
});
