/*
 * Giro 6 della bolla (owner 14/11 15:46, giudice v1884; ROSSO della prova dal vivo, punto 2): nella finestra del segno MAI mostrata `requestAnimationFrame` non
 *   scatta, quindi la pagina non batteva mai, il guscio non la mostrava mai, e cursore e bordo di TALOS restavano spenti per tutto il lancio (le misure del giro 5
 *   c'erano solo col battito iniettato a mano). Il guscio mostra la finestra SOLO dopo il primo battito: aspettare un fotogramma che arriva solo a finestra
 *   mostrata è un cane che si morde la coda. La cura: il primo battito parte dopo due fotogrammi OPPURE, se i fotogrammi non arrivano (finestra nascosta), dopo
 *   MS_BATTITO dai timer (che con `backgroundThrottling: false` corrono anche a finestra nascosta, Electron `web-preferences.md`); poi a intervalli come prima.
 *   Una pagina bloccata non batte comunque (i timer stanno sullo stesso filo), e un segno fuori dalla pagina o nascosto (schermo non valido) nemmeno.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { documento, orologio } from './aiuto-dom-blocchi.mjs';
import * as messaggi from '../../src/components/computer-use/bolla-messaggi.js';
import * as componente from '../../src/components/computer-use/segno.js';

const BATTITO = 'talos-segno:battito';
const MAI = () => 0; // la finestra nascosta: `requestAnimationFrame` accetta la richiamata e non la chiama mai

test('SBAT-N1 RED: finestra mai mostrata, nessun fotogramma: il primo battito arriva lo stesso entro MS_BATTITO, poi a intervalli', () => {
  const document = documento();
  const nodo = document.createElement('div');
  document.body.append(nodo);
  const clock = orologio(); const battiti = [];
  componente.creaBattito({ nodo, batti: () => battiti.push(clock.adesso()), fotogramma: MAI, timer: clock.timer, ms: 500 });
  clock.avanza(499);
  assert.deepEqual(battiti, [], 'non prima del tempo: una pagina che sta ancora nascendo non si dice pronta');
  clock.avanza(1);
  assert.deepEqual(battiti, [500], 'nessun fotogramma: il primo battito dai timer, a 500 ms');
  clock.avanza(1500);
  assert.deepEqual(battiti, [500, 1000, 1500, 2000], 'poi uno ogni 500 ms');
});

test('SBAT-N2: coi fotogrammi il primo battito parte al secondo fotogramma, prima del tempo dei timer, e mai due volte', () => {
  const document = documento();
  const nodo = document.createElement('div');
  document.body.append(nodo);
  const clock = orologio(); const battiti = []; let coda = [];
  const fotogramma = (f) => { coda.push(f); return coda.length; };
  const disegna = () => { const ora = coda; coda = []; for (const f of ora) f(); };
  componente.creaBattito({ nodo, batti: () => battiti.push(clock.adesso()), fotogramma, timer: clock.timer, ms: 500 });
  clock.avanza(16); disegna();
  assert.deepEqual(battiti, [], 'un fotogramma solo: la richiamata viene prima del disegno');
  clock.avanza(16); disegna();
  assert.deepEqual(battiti, [32], 'al secondo fotogramma, senza aspettare i timer');
  clock.avanza(1000);
  assert.deepEqual(battiti, [32, 532, 1032], 'un ritmo solo: il tempo dei timer non fa partire un secondo intervallo');
});

test('SBAT-N3: anche senza fotogrammi, un segno fuori dalla pagina o nascosto non batte, e fermato prima del tempo non batte mai', () => {
  const document = documento();
  const clock = orologio();
  const fuori = document.createElement('div'); const a = [];
  componente.creaBattito({ nodo: fuori, batti: () => a.push(1), fotogramma: MAI, timer: clock.timer, ms: 500 });
  const nascosto = document.createElement('div'); nascosto.hidden = true; document.body.append(nascosto); const b = [];
  componente.creaBattito({ nodo: nascosto, batti: () => b.push(1), fotogramma: MAI, timer: clock.timer, ms: 500 });
  const buono = document.createElement('div'); document.body.append(buono); const c = [];
  const suo = orologio(); // il battito fermato ha il suo orologio: fermato non lascia timer (gli altri due restano accesi e guardano a ogni giro, come prima)
  const fermo = componente.creaBattito({ nodo: buono, batti: () => c.push(1), fotogramma: MAI, timer: suo.timer, ms: 500 });
  fermo.ferma();
  clock.avanza(3000); suo.avanza(3000);
  assert.deepEqual([a, b, c], [[], [], []]);
  assert.equal(suo.attese(), 0, 'fermato prima del tempo: nessun timer lasciato acceso');
});

/** La finestra nascosta che poi si MOSTRA: i fotogrammi arrivano dopo il primo battito dei timer. */
function nascostaPoiMostrata() {
  const document = documento();
  const nodo = document.createElement('div');
  document.body.append(nodo);
  const clock = orologio(); const battiti = []; let coda = [];
  const fotogramma = (f) => { coda.push(f); return coda.length; };
  const disegna = () => { const ora = coda; coda = []; for (const f of ora) f(); };
  const b = componente.creaBattito({ nodo, batti: () => battiti.push(clock.adesso()), fotogramma, timer: clock.timer, ms: 500 });
  return { clock, battiti, disegna, b };
}

test('SBAT-N5: nascosta poi mostrata: il primo battito dai timer, poi i fotogrammi non fanno partire un secondo ritmo', () => {
  const { clock, battiti, disegna } = nascostaPoiMostrata();
  clock.avanza(500);
  assert.deepEqual(battiti, [500], 'da nascosta, dai timer');
  clock.avanza(16); disegna(); clock.avanza(16); disegna(); // la finestra si mostra: due fotogrammi
  clock.avanza(968);
  assert.deepEqual(battiti, [500, 1000, 1500], 'sempre uno ogni 500 ms, mai il doppio');
});

test('SBAT-N6: nascosta poi mostrata, poi fermata: nessun timer resta acceso', () => {
  const { clock, battiti, disegna, b } = nascostaPoiMostrata();
  clock.avanza(500);
  clock.avanza(16); disegna(); clock.avanza(16); disegna();
  b.ferma();
  const prima = battiti.length;
  clock.avanza(3000);
  assert.equal(battiti.length, prima, 'fermata non batte più');
  assert.equal(clock.attese(), 0, 'nessun timer lasciato acceso');
});

/** L'ingresso VERO (`src/segno.js`), impacchettato come nella build, in una finestra mai mostrata: `requestAnimationFrame` non chiama mai. */
async function ingressoNascosto(query = '?fx=0&fy=0&fw=1920&fh=1080&scala=1') {
  const esbuild = await import('esbuild');
  const r = await esbuild.build({ entryPoints: [fileURLToPath(new URL('../../src/segno.js', import.meta.url))], bundle: true, format: 'iife', write: false, logLevel: 'silent' });
  const document = documento();
  const clock = orologio(); const aperti = [];
  const window = { open: (u) => { aperti.push(u); return null; }, addEventListener: () => {}, localStorage: { getItem: () => null } };
  const contesto = {
    document, window, location: { search: query, origin: 'http://127.0.0.1:51234' },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    BroadcastChannel: class { constructor() { this.onmessage = null; } },
    requestAnimationFrame: MAI,
    setTimeout: clock.timer.setTimeout, clearTimeout: clock.timer.clearTimeout, setInterval: clock.timer.setInterval, clearInterval: clock.timer.clearInterval,
    Date, URLSearchParams, Object, Array, Map, Set, Math, Number, JSON, String,
  };
  runInNewContext(r.outputFiles[0].text, contesto);
  return { aperti, clock };
}

test('SBAT-N4 RED: l ingresso vero della pagina in una finestra mai mostrata batte entro MS_BATTITO, senza battito iniettato', async () => {
  const p = await ingressoNascosto();
  p.clock.avanza(messaggi.MS_BATTITO);
  assert.deepEqual(p.aperti, [BATTITO], 'il guscio riceve il primo battito e può mostrare la finestra');
  p.clock.avanza(messaggi.MS_BATTITO * 2);
  assert.deepEqual(p.aperti, [BATTITO, BATTITO, BATTITO]);
  /* AL CONTRARIO: con lo schermo non valido il segno non disegna e non batte, nemmeno dai timer */
  const storta = await ingressoNascosto('?fx=0&fy=0&fw=0&fh=1080&scala=1');
  storta.clock.avanza(3000);
  assert.deepEqual(storta.aperti, []);
});
