/*
 * FE-070: il segno del computer use del PC (Desktop 05/11 16:47, bozzetto approvato `bozzetto-computer-use-pc`, TABELLA-PEZZI righe 9-12 e 33).
 * Una finestra trasparente per schermo, aperta dal guscio con `?fx=&fy=&fw=&fh=&scala=` (pixel fisici). Gli eventi arrivano sul canale della bolla in pixel fisici globali;
 * la pagina converte nel suo schermo: locale = (p − fx,fy) / scala. Una sola curva fra gli schermi: ogni finestra anima la stessa curva nelle sue coordinate, all'orologio di t0.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documento, orologio } from './aiuto-dom-blocchi.mjs';
import { leggiMessaggio } from '../../src/components/computer-use/bolla-protocollo.js';
import { INDIRIZZO_RIPIEGO } from '../../src/components/computer-use/bolla-messaggi.js';
import {
  leggiSchermo, inLocale, inGlobale, rettangoloLocale, leggiRipiego, riduciSegno, STATO_INIZIALE_SEGNO, creaSegno,
  DURATA_CURSORE, DURATA_MINIMA_CURSORE, ANDAMENTO_CURSORE, RITARDO_ANELLO, DURATA_ANELLO, TARDI_OLTRE, inizioAnello,
} from '../../src/components/computer-use/segno.js';

const vicino = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} invece di ${b}`);
const schermo = (q) => leggiSchermo(new URLSearchParams(q));
const evento = (name, value) => ({ tipo: 'evento', evento: { name, value } });
const annuncio = (value) => evento('talos.computer-use-annuncio', value);
const FIN = { x: 2100, y: 150, w: 1200, h: 800 };

function canaleFinto() {
  const c = { onmessage: null, arriva(data) { c.onmessage?.({ data }); } };
  return c;
}
function scena({ q = 'fx=0&fy=0&fw=1920&fh=1080&scala=1', ridotto = false } = {}) {
  const document = documento();
  const canale = canaleFinto();
  const clock = orologio();
  let ora = 10_000;
  clock.avanzaTutto = (ms) => { ora += ms; clock.avanza(ms); };
  const animazioni = [];
  const anima = (el, fotogrammi, opzioni) => { const a = { el, fotogrammi, opzioni, currentTime: null, annullata: false, cancel() { a.annullata = true; } }; animazioni.push(a); return a; };
  const chiesti = [];
  const s = creaSegno({ document, canale, schermo: schermo(q), adesso: () => ora, timer: clock.timer, anima, ridotto, chiedi: () => chiesti.push(ora) });
  document.body.append(s.nodo);
  return { document, canale, clock, animazioni, s, ora: () => ora, chiesti };
}
const trasla = (x, y) => `translate(${x}px, ${y}px)`;

test('SEG-01 (R3) la query del guscio: solo numeri semplici, misure e scala positive; altrimenti non si disegna niente', () => {
  assert.deepEqual(schermo('fx=-1280&fy=0&fw=2560&fh=1440&scala=1.25'), { fx: -1280, fy: 0, fw: 2560, fh: 1440, scala: 1.25 }, 'uno schermo a sinistra del principale ha fx negativo');
  assert.deepEqual(leggiSchermo('?fx=0&fy=0&fw=1920&fh=1080&scala=1&altro=x'), { fx: 0, fy: 0, fw: 1920, fh: 1080, scala: 1 }, 'anche una stringa; il resto si ignora');
  for (const q of ['', 'fx=0&fy=0&fw=1920&fh=1080', 'fx=a&fy=0&fw=1920&fh=1080&scala=1', 'fx=1e3&fy=0&fw=1920&fh=1080&scala=1', 'fx=0&fy=0&fw=0&fh=1080&scala=1',
    'fx=0&fy=0&fw=1920&fh=-5&scala=1', 'fx=0&fy=0&fw=1920&fh=1080&scala=0', 'fx=0&fy=0&fw=1920&fh=1080&scala=-1.5', 'fx=0&fy=0&fw=1920&fh=1080&scala=Infinity', 'fx= 0&fy=0&fw=1920&fh=1080&scala=1']) {
    assert.equal(schermo(q), null, q);
  }
  const d = documento();
  const s = creaSegno({ document: d, canale: canaleFinto(), schermo: null, adesso: () => 0, timer: orologio().timer, anima: () => assert.fail('senza schermo non si anima') });
  assert.equal(s.nodo.hidden, true, 'senza schermo la pagina resta vuota');
});

test('SEG-02 (R1) da pixel fisici globali a locali a 100, 125 e 150%', () => {
  const casi = [
    ['fx=0&fy=0&fw=1920&fh=1080&scala=1', { x: 500, y: 300 }, { x: 500, y: 300 }],
    ['fx=1920&fy=0&fw=2560&fh=1440&scala=1.25', { x: 2500, y: 300 }, { x: 464, y: 240 }],
    ['fx=-3840&fy=-200&fw=3840&fh=2160&scala=1.5', { x: -2340, y: 100 }, { x: 1000, y: 200 }],
  ];
  for (const [q, globale, atteso] of casi) {
    const s = schermo(q);
    const l = inLocale(globale, s);
    vicino(l.x, atteso.x, `${q} x`); vicino(l.y, atteso.y, `${q} y`);
    const g = inGlobale(l, s);
    vicino(g.x, globale.x, `${q} ritorno x`); vicino(g.y, globale.y, `${q} ritorno y`);
  }
  assert.deepEqual(rettangoloLocale(FIN, schermo('fx=1920&fy=0&fw=2560&fh=1440&scala=1.25')), { x: 144, y: 120, w: 960, h: 640 });
});

test('SEG-03 (R2) due schermi affiancati, 100% e 150%: il bordo comune coincide e la curva è una sola', () => {
  const sx = schermo('fx=0&fy=0&fw=1920&fh=1080&scala=1');
  const dx = schermo('fx=1920&fy=0&fw=3840&fh=2160&scala=1.5');
  const cucitura = { x: 1920, y: 600 };
  assert.deepEqual(inLocale(cucitura, sx), { x: 1920, y: 600 }, 'a sinistra: il bordo destro (fw/scala)');
  assert.deepEqual(inLocale(cucitura, dx), { x: 0, y: 400 }, 'a destra: il bordo sinistro');
  // Ogni finestra interpola fra i suoi due estremi locali con lo stesso andamento: in ogni istante le due danno lo stesso punto globale, perché la conversione è affine.
  const A = { x: 400, y: 900 }, B = { x: 4000, y: 200 };
  for (const e of [0, 0.13, 0.5, 0.87, 1]) {
    const globale = { x: A.x + (B.x - A.x) * e, y: A.y + (B.y - A.y) * e };
    for (const s of [sx, dx]) {
      const a = inLocale(A, s), b = inLocale(B, s);
      const g = inGlobale({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e }, s);
      vicino(g.x, globale.x, `e=${e} scala=${s.scala} x`); vicino(g.y, globale.y, `e=${e} scala=${s.scala} y`);
    }
  }
});

test('SEG-04 il canale della bolla porta anche annuncio e guarda; il segno li legge per forma', () => {
  const v = { finestra: FIN, punto: { x: 2400, y: 500 }, t0: 1 };
  assert.ok(leggiMessaggio(annuncio(v)), 'annuncio');
  assert.ok(leggiMessaggio(evento('talos.computer-use-guarda', { finestra: FIN })), 'guarda');
  const s0 = STATO_INIZIALE_SEGNO;
  for (const cattivo of [{ ...v, punto: { x: '1', y: 2 } }, { ...v, finestra: { ...FIN, w: 0 } }, { ...v, t0: 'ora' }, { ...v, punto: null }, { ...v, modo: 'browser' }, { ...v, punto: { x: Infinity, y: 0 } }]) {
    assert.equal(riduciSegno(s0, annuncio(cattivo)), s0, JSON.stringify(cattivo));
  }
  assert.equal(riduciSegno(s0, evento('talos.computer-use-guarda', { finestra: { x: 1, y: 2, w: 3 } })), s0, 'finestra senza altezza');
  assert.equal(riduciSegno(s0, { tipo: 'sessione', sessionId: 'x' }), s0, 'il resto non tocca il segno');
  const s1 = riduciSegno(s0, annuncio(v));
  assert.deepEqual(s1.annuncio, { finestra: FIN, punto: { x: 2400, y: 500 }, t0: 1, durata: 850, modo: 'sottofondo', da: null }, 'il primo annuncio non ha punto di partenza; senza durata, 850 ms');
  assert.deepEqual(s1.guarda, FIN, 'la finestra su cui agisce è quella che guarda');
  const s2 = riduciSegno(s1, annuncio({ ...v, punto: { x: 2600, y: 700 }, t0: 2000, modo: 'preso' }));
  assert.deepEqual(s2.annuncio.da, { x: 2400, y: 500 }, 'il secondo parte dove è finito il primo');
  assert.equal(s2.annuncio.modo, 'preso');
  for (const nome of ['talos.computer-use-pausa', 'talos.computer-use-fermato', 'talos.computer-use-esito']) {
    assert.deepEqual(riduciSegno(s2, evento(nome, {})), STATO_INIZIALE_SEGNO, `${nome} spegne tutto`);
  }
});

test('SEG-05 (R4) annuncio: il cursore segue la curva del bozzetto all orologio di t0, l anello parte a 420 ms', () => {
  const { canale, clock, animazioni, s, ora } = scena();
  canale.arriva(annuncio({ finestra: { x: 100, y: 100, w: 1000, h: 700 }, punto: { x: 300, y: 200 }, t0: ora() }));
  const cursore = s.nodo.querySelector('.cursore');
  assert.ok(cursore, 'il cursore di TALOS');
  assert.equal(cursore.querySelector('b').textContent, 'TALOS');
  assert.equal(cursore.querySelector('path').getAttribute('d'), 'M4 2l15 12-7 1-3 7z', 'la freccia del bozzetto');
  assert.equal(cursore.style.transform, trasla(296, 198), 'il primo annuncio: la punta (4,2) già sul punto');
  canale.arriva(annuncio({ finestra: { x: 100, y: 100, w: 1000, h: 700 }, punto: { x: 900, y: 600 }, t0: ora() - 100 }));
  const a = animazioni.at(-1);
  assert.equal(a.el, cursore);
  assert.deepEqual(a.fotogrammi, [{ transform: trasla(296, 198) }, { transform: trasla(896, 598) }]);
  assert.deepEqual(a.opzioni, { duration: DURATA_CURSORE, easing: ANDAMENTO_CURSORE, fill: 'forwards' });
  assert.equal(DURATA_CURSORE, 850); assert.equal(ANDAMENTO_CURSORE, 'cubic-bezier(.3,.7,.2,1)');
  assert.equal(a.currentTime, 100, 'arrivato in ritardo: la curva riprende dal suo istante');
  clock.avanzaTutto(RITARDO_ANELLO - 100 - 1);
  assert.equal(s.nodo.querySelectorAll('.anello').length, 0, 'l anello del primo annuncio è stato superato dal secondo; quello del secondo non ancora');
  clock.avanzaTutto(1);
  assert.equal(RITARDO_ANELLO, 420);
  assert.equal(s.nodo.querySelectorAll('.anello').length, 1, 'a t0+420 ms');
  const anello = s.nodo.querySelectorAll('.anello').at(-1);
  assert.equal(anello.style.left, '901px'); assert.equal(anello.style.top, '601px');
  clock.avanzaTutto(DURATA_ANELLO + 1000);
  assert.equal(s.nodo.querySelectorAll('.anello').length, 0, 'finita la sua animazione l anello sparisce');
});

test('SEG-06 (R4) un annuncio già concluso: niente animazione, cursore sul punto, niente anello', () => {
  const { canale, animazioni, s, ora } = scena();
  canale.arriva(annuncio({ finestra: FIN, punto: { x: 300, y: 200 }, t0: ora() - 5000 }));
  canale.arriva(annuncio({ finestra: FIN, punto: { x: 700, y: 400 }, t0: ora() - 2000 }));
  assert.equal(animazioni.length, 0);
  assert.equal(s.nodo.querySelector('.cursore').style.transform, trasla(696, 398));
  assert.equal(s.nodo.querySelectorAll('.anello').length, 0);
});

test('SEG-07 (R5) guarda: il bordo nel rettangolo locale; pausa, fermato ed esito spengono tutto', () => {
  const { canale, s, ora } = scena({ q: 'fx=1920&fy=0&fw=2560&fh=1440&scala=1.25' });
  canale.arriva(evento('talos.computer-use-guarda', { finestra: FIN }));
  const bordo = s.nodo.querySelector('.guarda');
  assert.ok(bordo);
  assert.deepEqual([bordo.style.left, bordo.style.top, bordo.style.width, bordo.style.height], ['144px', '120px', '960px', '640px']);
  assert.equal(bordo.getAttribute('aria-hidden'), 'true');
  for (const nome of ['talos.computer-use-pausa', 'talos.computer-use-fermato', 'talos.computer-use-esito']) {
    canale.arriva(annuncio({ finestra: FIN, punto: { x: 2400, y: 500 }, t0: ora() }));
    assert.ok(s.nodo.querySelector('.cursore') && s.nodo.querySelector('.guarda'));
    canale.arriva(evento(nome, { motivo: 'x' }));
    assert.equal(s.nodo.querySelector('.cursore'), null, `${nome}: niente cursore`);
    assert.equal(s.nodo.querySelector('.guarda'), null, `${nome}: niente bordo`);
    assert.equal(s.nodo.querySelectorAll('.anello').length, 0, `${nome}: niente anello`);
  }
});

test('SEG-08 il mouse preso: l anello del bozzetto con TALOS sul mouse vero, senza la freccia finta', () => {
  const { canale, s, ora } = scena();
  canale.arriva(annuncio({ finestra: FIN, punto: { x: 300, y: 200 }, t0: ora(), modo: 'preso' }));
  assert.equal(s.nodo.querySelector('.cursore'), null, 'nel mouse preso il cursore è quello vero');
  const mio = s.nodo.querySelector('.mio');
  assert.ok(mio && mio.classList.contains('mio--preso'));
  assert.equal(mio.querySelector('svg'), null, 'la freccia è quella del sistema');
  assert.equal(mio.querySelector('b').textContent, 'TALOS');
  assert.equal(mio.style.transform, trasla(300 - 11 / 3, 200 - 11 / 6), 'la punta della freccia del bozzetto (4,2 su 24, disegnata a 22) sul punto');
});

test('SEG-09 (R6) movimento ridotto: nessuna animazione, cursore subito sul punto, anello fermo e breve', () => {
  const { canale, clock, animazioni, s, ora } = scena({ ridotto: true });
  canale.arriva(annuncio({ finestra: FIN, punto: { x: 300, y: 200 }, t0: ora() - 900 }));
  canale.arriva(annuncio({ finestra: FIN, punto: { x: 900, y: 600 }, t0: ora() }));
  assert.equal(animazioni.length, 0);
  assert.equal(s.nodo.querySelector('.cursore').style.transform, trasla(896, 598));
  assert.equal(s.nodo.querySelectorAll('.anello').length, 1, 'subito, come CALMA?0:420 del bozzetto');
  clock.avanzaTutto(DURATA_ANELLO);
  assert.equal(s.nodo.querySelectorAll('.anello').length, 0);
});

test('SEG-10 (R7) la posizione vera è il ripiego: anello lì solo se non c è una curva prevista in corso', () => {
  assert.equal(leggiRipiego({ tipo: 'segno-ripiego', punto: { x: 10, y: 20 } }).punto.x, 10);
  for (const m of [null, 'x', { tipo: 'altro', punto: { x: 1, y: 2 } }, { tipo: 'segno-ripiego', punto: { x: '1', y: 2 } }, { tipo: 'segno-ripiego' }]) assert.equal(leggiRipiego(m), null, JSON.stringify(m));
  const { canale, clock, s, ora } = scena({ q: 'fx=1920&fy=0&fw=2560&fh=1440&scala=1.25' });
  s.ripiego({ tipo: 'segno-ripiego', punto: { x: 2500, y: 300 } });
  const a = s.nodo.querySelectorAll('.anello');
  assert.equal(a.length, 1, 'senza annuncio: anello sulla posizione vera');
  assert.deepEqual([a[0].style.left, a[0].style.top], ['465px', '241px']);
  clock.avanzaTutto(DURATA_ANELLO + 10);
  canale.arriva(annuncio({ finestra: FIN, punto: { x: 2400, y: 500 }, t0: ora() }));
  const n = s.nodo.querySelectorAll('.anello').length;
  s.ripiego({ tipo: 'segno-ripiego', punto: { x: 2500, y: 300 } });
  assert.equal(s.nodo.querySelectorAll('.anello').length, n, 'con la curva prevista in corso il ripiego non disegna');
});

test('SEG-11 la pagina è servita e costruita: ingresso, stile trasparente, niente script in linea, CSS del bozzetto', async () => {
  const leggi = (u) => readFileSync(new URL(u, import.meta.url), 'utf8');
  const html = leggi('../../segno.template.html');
  assert.match(html, /<script type="module" src="\.\/segno\.js"><\/script>/u);
  assert.match(html, /href="\.\/segno-stile\.css"/u);
  assert.doesNotMatch(html, /<script(?![^>]*src=)[^>]*>/u);
  assert.match(html, /<\/head>/u, 'serve al nonce del server');
  const build = leggi('../../scripts/build.mjs');
  assert.match(build, /segno: 'src\/segno\.js'/u);
  assert.match(build, /'segno-stile': 'src\/styles\/segno\.css'/u);
  assert.match(build, /segno\.template\.html/u);
  const statici = leggi('../../../src/static-files.mjs');
  for (const p of ["'/segno.html'", "'/segno.js'", "'/segno-stile.css'"]) assert.ok(statici.includes(p), p);
  const css = leggi('../../src/styles/segno.css');
  assert.match(css, /html,body\{[^}]*background:transparent/u, 'la finestra è trasparente');
  assert.match(css, /animation:anello 650ms ease-out both/u);
  assert.match(css, /animation:guarda 2s ease-in-out infinite/u);
  assert.match(css, /box-shadow:0 0 0 3px #c98b32,0 0 26px rgba\(201,139,50,\.5\)/u);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.anello,\.guarda\{animation:none\}\}/u);
  const ingresso = leggi('../../src/segno.js');
  assert.match(ingresso, /e\.source === window && e\.origin === location\.origin/u, 'il ripiego solo dalla pagina stessa (executeJavaScript del guscio)');
});

test('SEG-12 lo stesso annuncio due volte (due pagine principali aperte) non rompe la curva', () => {
  const { canale, animazioni, s, ora } = scena();
  canale.arriva(annuncio({ finestra: FIN, punto: { x: 300, y: 200 }, t0: ora() - 900 }));
  const v = { finestra: FIN, punto: { x: 900, y: 600 }, t0: ora() - 100 };
  canale.arriva(annuncio(v));
  const stato = s.stato();
  canale.arriva(annuncio({ ...v, finestra: { ...FIN } }));
  assert.equal(s.stato(), stato, 'il doppione non cambia lo stato');
  assert.equal(animazioni.length, 1);
  assert.equal(animazioni[0].annullata, false, 'la curva continua');
});

/* Decisione 252 dell'owner (Desktop 05/11 16:57): il viaggio del cursore dura secondo la distanza, da 250 a 850 ms; l'annuncio porta `durata`. L'anello parte a
   durata·420/850, chi arriva oltre durata+220 non disegna né curva né anello; senza durata, o non numerica, 850 come prima. */
test('SEG-13 durata secondo la distanza: breve e lunga, anello a durata·420/850, ritardo oltre durata+220, 850 se manca', () => {
  assert.equal(DURATA_MINIMA_CURSORE, 250); assert.equal(TARDI_OLTRE, 220);
  assert.equal(inizioAnello(850), 420); assert.equal(inizioAnello(255), 126);
  const v = { finestra: FIN, punto: { x: 900, y: 600 }, t0: 1 };
  for (const [durata, attesa] of [[undefined, 850], ['300', 850], [NaN, 850], [null, 850], [255, 255], [600, 600], [100, 250], [5000, 850]]) {
    assert.equal(riduciSegno(STATO_INIZIALE_SEGNO, annuncio({ ...v, durata })).annuncio.durata, attesa, `durata ${durata}`);
  }
  for (const [durata, nome] of [[255, 'breve'], [850, 'lunga']]) {
    const { canale, clock, animazioni, s, ora } = scena();
    canale.arriva(annuncio({ ...v, punto: { x: 300, y: 200 }, t0: ora() - 5000 }));
    canale.arriva(annuncio({ ...v, t0: ora(), durata }));
    assert.deepEqual(animazioni.at(-1).opzioni, { duration: durata, easing: ANDAMENTO_CURSORE, fill: 'forwards' }, `${nome}: la curva dura ${durata} ms`);
    clock.avanzaTutto(inizioAnello(durata) - 1);
    assert.equal(s.nodo.querySelectorAll('.anello').length, 0, `${nome}: non ancora`);
    clock.avanzaTutto(1);
    assert.equal(s.nodo.querySelectorAll('.anello').length, 1, `${nome}: l anello a ${inizioAnello(durata)} ms`);
  }
  { // breve, arrivato tardi ma entro durata+220: niente curva (è già arrivato), l anello sì, già avanti
    const { canale, animazioni, s, ora } = scena();
    canale.arriva(annuncio({ ...v, punto: { x: 300, y: 200 }, t0: ora() - 5000 }));
    canale.arriva(annuncio({ ...v, t0: ora() - 460, durata: 255 }));
    assert.equal(animazioni.length, 0);
    const a = s.nodo.querySelectorAll('.anello');
    assert.equal(a.length, 1); assert.equal(a[0].style.animationDelay, '-334ms');
  }
  { // breve, oltre durata+220: nessun anello, cursore sul punto
    const { canale, animazioni, s, ora } = scena();
    canale.arriva(annuncio({ ...v, punto: { x: 300, y: 200 }, t0: ora() - 5000 }));
    canale.arriva(annuncio({ ...v, t0: ora() - 476, durata: 255 }));
    assert.equal(animazioni.length, 0);
    assert.equal(s.nodo.querySelectorAll('.anello').length, 0, '476 > 255+220');
    assert.equal(s.nodo.querySelector('.cursore').style.transform, trasla(896, 598));
  }
});

test('SEG-14 (FE-072) il segno è leggero: impacchettato e minificato sta sotto i 40 KB, senza pillola né traduzioni', async () => {
  /* Il 05/11 pesava 1.558.846 byte minificato (circa 1,7 MB nella build): `leggiMessaggio` veniva dal protocollo della bolla, che importa la pillola, che importa
     le traduzioni di tutta l'app. Una finestra per schermo, sempre aperta durante il computer use: il segno carica solo ciò che disegna. */
  const esbuild = await import('esbuild');
  const { fileURLToPath } = await import('node:url');
  const risultato = await esbuild.build({ entryPoints: [fileURLToPath(new URL('../../src/segno.js', import.meta.url))], bundle: true, minify: true, format: 'esm', write: false, metafile: true, logLevel: 'silent' });
  const peso = risultato.outputFiles[0].contents.length;
  const ingressi = Object.keys(risultato.metafile.inputs).map((p) => p.replaceAll('\\', '/'));
  for (const vietato of ['computer-use/pillola.js', 'computer-use/parole.js', 'components/lingua.js']) {
    assert.ok(!ingressi.some((p) => p.endsWith(vietato)), `${vietato} non entra nel segno`);
  }
  assert.ok(peso < 40 * 1024, `segno.js minificato pesa ${peso} byte`);
});

/* FE-074 (Desktop 05/11 18:34): il guscio non vede gli eventi del computer use, quindi è la pagina a chiedere la posizione vera del mouse (`window.open` dell'indirizzo
   convenuto, negato dal guscio) quando un clic è stato fatto senza una curva prevista. Solo col mouse preso: in sottofondo il mouse vero è della persona (decisione 1). */
const esitoClic = (n, extra = {}) => evento('talos.computer-use-passo', { n, fase: 'esito', tipo: 'clic', esito: 'confermata', motivo: null, modo: 'preso', processo: null, ...extra });
test('SEG-15 (R11) un clic fatto senza curva prevista chiede il ripiego, una volta per passo; con la curva, in sottofondo o senza clic no', () => {
  assert.equal(INDIRIZZO_RIPIEGO, 'talos-segno:ripiego');
  const { canale, clock, s, chiesti, ora } = scena();
  canale.arriva(evento('talos.computer-use-passo', { fase: 'annuncio', n: 1, tipo: 'clic', bersaglio: 'Treni' }));
  canale.arriva(esitoClic(1));
  assert.equal(chiesti.length, 1, 'clic fatto, nessuna curva: si chiede');
  canale.arriva(esitoClic(1));
  assert.equal(chiesti.length, 1, 'lo stesso esito da due pagine principali: una volta');
  for (const tipo of ['click', 'premi', 'press', 'scegli', 'select']) { canale.arriva(esitoClic(10 + chiesti.length, { tipo })); }
  assert.equal(chiesti.length, 6, 'i nomi del clic in italiano e in inglese');

  const prima = chiesti.length;
  let n = 30;
  for (const extra of [{ modo: 'sottofondo' }, { modo: null }, { modo: undefined }, { esito: 'non-eseguita' }, { esito: 'rifiutata' }, { tipo: 'tasti' }, { tipo: 'scrivi' }, { n: '31' }]) {
    canale.arriva(esitoClic(n++, extra));
  }
  canale.arriva(evento('talos.computer-use-passo', { fase: 'annuncio', n: 40, tipo: 'clic' }));
  assert.equal(chiesti.length, prima, 'in sottofondo o senza modo, non eseguito, non un clic, n non numerico, o un annuncio: niente');

  canale.arriva(annuncio({ finestra: FIN, punto: { x: 2400, y: 500 }, t0: ora(), modo: 'preso' }));
  clock.avanzaTutto(DURATA_CURSORE + DURATA_ANELLO + 10);
  canale.arriva(esitoClic(50));
  assert.equal(chiesti.length, prima, 'il clic aveva la sua curva (già finita): niente ripiego');
  canale.arriva(esitoClic(51));
  assert.equal(chiesti.length, prima + 1, 'la curva vale per un passo solo');
  canale.arriva(annuncio({ punto: { x: 2400, y: 500 }, t0: ora(), modo: 'preso' }));
  canale.arriva(esitoClic(54));
  assert.equal(chiesti.length, prima + 2, 'un annuncio malformato non disegna, quindi non è una curva');

  canale.arriva(annuncio({ finestra: FIN, punto: { x: 2400, y: 600 }, t0: ora(), modo: 'preso' }));
  canale.arriva(esitoClic(52));
  canale.arriva(esitoClic(53));
  assert.equal(chiesti.length, prima + 2, 'mentre una curva prevista è in corso non si chiede');

  clock.avanzaTutto(DURATA_CURSORE + DURATA_ANELLO + 10);
  canale.arriva(evento('talos.computer-use-esito', { esito: 'completato', motivo: 'completato', decisioni: [], spese: [] }));
  canale.arriva(esitoClic(53));
  assert.equal(chiesti.length, prima + 3, 'un compito nuovo riparte da capo: lo stesso n dell ultimo passo di prima conta di nuovo');
  s.chiudi();
  canale.arriva(esitoClic(2));
  assert.equal(chiesti.length, prima + 3, 'chiuso il segno non chiede più');
  assert.ok(readFileSync(new URL('../../src/segno.js', import.meta.url), 'utf8').includes('chiedi: () => window.open(INDIRIZZO_RIPIEGO)'), 'nella pagina vera chiede col window.open convenuto');
});

/* Revisione 05/11 sera, difetto 8a: A manda `finestra: null` quando la finestra del passo non è valida (`ciclo.mjs`, emetti(EVENTI.annuncio)), ma il punto resta in pixel
   fisici globali dello schermo. Il cursore si muove lo stesso; il bordo resta quello dell'ultimo «guarda» (l'annuncio non sa di quale finestra si tratti). Una chiave
   assente o un rettangolo storto restano un annuncio malformato (SEG-15). */
test('SEG-16 (difetto 8a) annuncio con finestra null e punto valido: il cursore si muove, il bordo resta quello di prima', () => {
  const vuoto = riduciSegno(STATO_INIZIALE_SEGNO, annuncio({ finestra: null, punto: { x: 300, y: 200 }, t0: 5 }));
  assert.deepEqual(vuoto.annuncio?.punto, { x: 300, y: 200 }, 'lo stato porta l annuncio');
  assert.equal(vuoto.guarda, null, 'nessun bordo inventato');
  for (const storta of [undefined, { x: 1, y: 2, w: 0, h: 3 }, 'x']) {
    const st = riduciSegno(STATO_INIZIALE_SEGNO, annuncio({ finestra: storta, punto: { x: 300, y: 200 }, t0: 5 }));
    assert.equal(st, STATO_INIZIALE_SEGNO, `finestra ${JSON.stringify(storta)}: malformato, come prima`);
  }
  const { canale, animazioni, s, ora } = scena();
  canale.arriva(evento('talos.computer-use-guarda', { finestra: FIN }));
  canale.arriva(annuncio({ finestra: null, punto: { x: 300, y: 200 }, t0: ora() }));
  const cursore = s.nodo.querySelector('.cursore');
  assert.ok(cursore, 'il cursore di TALOS c è');
  assert.equal(cursore.style.transform, trasla(296, 198), 'la punta sul punto');
  assert.deepEqual(s.stato().guarda, FIN, 'il bordo dell ultimo guarda resta');
  assert.ok(s.nodo.querySelector('.guarda'), 'e resta a schermo');
  canale.arriva(annuncio({ finestra: null, punto: { x: 900, y: 600 }, t0: ora() }));
  assert.deepEqual(animazioni.at(-1)?.fotogrammi, [{ transform: trasla(296, 198) }, { transform: trasla(896, 598) }], 'il secondo vola dal primo');
  // revisione delle cure piccole, difetto 3: un annuncio con una finestra valida sostituisce il bordo dell ultimo guarda
  const ALTRA = { x: 40, y: 60, w: 500, h: 400 };
  canale.arriva(annuncio({ finestra: ALTRA, punto: { x: 100, y: 100 }, t0: ora() }));
  assert.deepEqual(s.stato().guarda, ALTRA, 'il bordo passa alla finestra dell annuncio');
  assert.deepEqual(riduciSegno({ ...STATO_INIZIALE_SEGNO, guarda: FIN }, annuncio({ finestra: ALTRA, punto: { x: 100, y: 100 }, t0: 9 })).guarda, ALTRA, 'anche nel riduttore');
});
