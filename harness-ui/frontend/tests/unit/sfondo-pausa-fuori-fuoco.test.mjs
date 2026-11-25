/*
 * Owner 11/11/2026 ~13:30 (`giudice/DECISIONE-OWNER-2026-11-11-1330-TELEFONO-MI-FIDO-SFONDO-FUORI-FUOCO.md`, punto 2; registro delle
 * richieste, riga 71): «Sì, pausa fuori fuoco». Lo sfondo animato si ferma quando la finestra di TALOS non è quella in uso e riparte quando
 * ci si torna. Supera, solo per questo, la vecchia scelta «si muove sempre». Nata ROSSA sulla candidata `1675a84bc`: la scena si fermava
 * solo con la scheda nascosta (`visibilitychange`), non con la finestra fuori fuoco.
 * Fonte: Hermes `apps/desktop/src/lib/renderer-loop-pause.ts:41-43,53` (`pauseWhenUnfocused`: `blur`/`focus` della finestra).
 * Un DOM finto minimo: niente browser, i fotogrammi li fa girare la prova.
 * Giro 2 (revisore 22/11/2026, R1, MR2, MR3): se il fuoco resta dentro un iframe della pagina, al ritorno la finestra madre non riceve
 * `focus`; la scena ferma SOLO per il fuoco ricontrolla una volta al secondo (timer finti di `node:test`). Fuori fuoco la tela resta
 * disegnata, e al ritorno la scena continua da dove era, senza ripartire da capo.
 */
import assert from 'node:assert/strict';
import test, { mock } from 'node:test';

mock.timers.enable({ apis: ['setTimeout'] });

const ascoltatori = new Map();
const bersaglio = (nome) => ({
  addEventListener: (tipo, fn) => { const chiave = `${nome}:${tipo}`; ascoltatori.set(chiave, [...(ascoltatori.get(chiave) ?? []), fn]); },
  removeEventListener: () => {},
});
const lancia = (nome, tipo) => { for (const fn of ascoltatori.get(`${nome}:${tipo}`) ?? []) fn({ type: tipo }); };

let fuoco = true;
let chiamateHasFocus = 0;
const fotogrammi = new Map();
let prossimoId = 1;
let adesso = 1000;
globalThis.requestAnimationFrame = (fn) => { const id = prossimoId++; fotogrammi.set(id, fn); return id; };
globalThis.cancelAnimationFrame = (id) => { fotogrammi.delete(id); };
function giraFotogrammi(quanti) {
  for (let i = 0; i < quanti; i += 1) {
    const coda = [...fotogrammi.values()];
    fotogrammi.clear();
    adesso += 34;
    for (const fn of coda) fn(adesso);
  }
}

/* il contesto del canvas: ogni metodo esiste e restituisce un oggetto che ha a sua volta ogni metodo (gradienti compresi) */
const ovunque = new Proxy(function () {}, {
  get: (_t, chiave) => (chiave === Symbol.toPrimitive ? () => 0 : ovunque),
  apply: () => ovunque,
  set: () => true,
});
/* la tela della scena registra le sue chiamate: ogni `setTransform` apre un disegno, la firma è il nome e i numeri di ogni chiamata */
const disegniTela = [];
const tela = new Proxy({}, {
  get: (_t, chiave) => (chiave === Symbol.toPrimitive ? () => 0 : (...argomenti) => {
    if (chiave === 'setTransform') disegniTela.push([]);
    disegniTela.at(-1)?.push(`${String(chiave)}(${argomenti.filter((a) => typeof a === 'number').map((n) => n.toFixed(4)).join(',')})`);
    return ovunque;
  }),
  set: () => true,
});
const disegniVeri = () => disegniTela.filter((d) => d.length > 1);
const firma = (d) => d.join(';');
const ultimaChiamata = () => disegniTela.at(-1)?.at(-1) ?? '';
const richiamiResize = [];
/* letture di `hasFocus()` fatte dal timer, senza far girare fotogrammi: una per ogni ricontrollo */
function letturePerTimer(ms) {
  const prima = chiamateHasFocus;
  // a passi: un solo `tick` lungo non esegue i timer messi durante lo stesso `tick`
  for (let passato = 0; passato < ms; passato += 250) mock.timers.tick(250);
  return chiamateHasFocus - prima;
}
function classi(iniziali = []) {
  const insieme = new Set(iniziali);
  return { contains: (c) => insieme.has(c), add: (c) => insieme.add(c), remove: (c) => insieme.delete(c) };
}
function elemento(tag, iniziali = []) {
  return {
    tagName: tag, dataset: {}, style: {}, classList: classi(iniziali), isConnected: tag !== 'canvas', width: 0, height: 0,
    setAttribute() {}, removeAttribute() {}, querySelector: () => null, closest: () => null,
    append(figlio) { figlio.isConnected = true; }, prepend(figlio) { figlio.isConnected = true; }, remove() { this.isConnected = false; },
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
    getContext: () => (tag === 'canvas' ? tela : ovunque),
  };
}
const chat = elemento('section');
const radice = elemento('html');
globalThis.window = { devicePixelRatio: 1, ...bersaglio('window'), setInterval: () => 0, clearInterval: () => {} };
globalThis.document = {
  ...bersaglio('document'),
  hidden: false,
  visibilityState: 'visible',
  hasFocus: () => { chiamateHasFocus += 1; return fuoco; },
  documentElement: radice,
  body: elemento('body', ['background-motion-active']),
  getElementById: (id) => (id === 'schermoChat' ? chat : null),
  createElement: (tag) => elemento(tag),
  querySelector: () => null,
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '', color: '' });
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.ResizeObserver = class { constructor(richiamo) { richiamiResize.push(richiamo); } observe() {} disconnect() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} };

const { initTalosDesktopBackground } = await import('../../src/motion/desktop-background.js');
const api = initTalosDesktopBackground();
const disegni = () => api.status().stages[0].draws;

test('SFONDO-FUOCO-01 (al contrario): con la finestra in uso la scena NON si ferma, nemmeno se il fuoco passa a una cornice della pagina', () => {
  assert.ok(api, 'lo sfondo si monta nel DOM finto');
  assert.equal(api.status().errors.length, 0);
  assert.equal(api.status().running, true);
  const prima = disegni();
  giraFotogrammi(4);
  assert.ok(disegni() >= prima + 3, `la scena disegna (${prima} → ${disegni()})`);
  // la finestra perde il fuoco verso un iframe della pagina: arriva `blur`, ma il documento ha ancora il fuoco
  lancia('window', 'blur');
  assert.equal(api.status().running, true);
  const dopo = disegni();
  giraFotogrammi(4);
  assert.ok(disegni() >= dopo + 3, 'un `blur` con la finestra ancora in uso non ferma niente');
});

test('SFONDO-FUOCO-02: la finestra di TALOS non è più quella in uso ⇒ la scena si ferma e non disegna più', () => {
  fuoco = false;
  lancia('window', 'blur');
  assert.equal(api.status().running, false, 'nessun fotogramma in attesa fuori fuoco');
  const fermo = disegni();
  giraFotogrammi(6);
  assert.equal(disegni(), fermo);
});

test('SFONDO-FUOCO-03: si torna alla finestra ⇒ la scena riparte', () => {
  fuoco = true;
  lancia('window', 'focus');
  assert.equal(api.status().running, true);
  const prima = disegni();
  giraFotogrammi(4);
  assert.ok(disegni() >= prima + 3, `la scena riparte (${prima} → ${disegni()})`);
});

test('SFONDO-FUOCO-04: anche senza l’evento (perso o in ritardo) il fotogramma dopo vede la finestra fuori fuoco e si ferma', () => {
  assert.equal(api.status().running, true);
  fuoco = false;
  giraFotogrammi(2);
  assert.equal(api.status().running, false);
  const fermo = disegni();
  giraFotogrammi(4);
  assert.equal(disegni(), fermo);
});

test('SFONDO-FUOCO-06 (R1): fuoco rimasto in un iframe, Alt+Tab e ritorno senza `focus` sulla madre ⇒ entro 1,5 s la scena riparte', () => {
  fuoco = true;
  lancia('window', 'focus');
  assert.equal(api.status().running, true);
  // clic dentro l'artefatto «A lato»: la madre riceve `blur`, il documento ha ancora il fuoco
  lancia('window', 'blur');
  assert.equal(api.status().running, true);
  // Alt+Tab: `blur` va solo alla finestra dell'iframe; il fotogramma vede `hasFocus()` falso e si ferma
  fuoco = false;
  giraFotogrammi(2);
  assert.equal(api.status().running, false);
  // ritorno su TALOS senza clic: `focus` va solo all'iframe, la madre non riceve niente
  fuoco = true;
  letturePerTimer(1500);
  assert.equal(api.status().running, true, 'la finestra è di nuovo in uso: la scena deve ripartire da sola');
  const prima = disegni();
  giraFotogrammi(4);
  assert.ok(disegni() >= prima + 3, `la scena disegna di nuovo (${prima} → ${disegni()})`);
});

test('SFONDO-FUOCO-07: il ricontrollo esiste solo a scena ferma per il fuoco, uno alla volta, e si toglie quando la scena riparte', () => {
  assert.equal(api.status().running, true);
  assert.equal(letturePerTimer(5000), 0, 'a scena accesa nessun timer: niente CPU in più');
  fuoco = false;
  lancia('window', 'blur');
  lancia('window', 'blur');
  lancia('window', 'blur');
  assert.equal(api.status().running, false);
  assert.equal(letturePerTimer(10_000), 10, 'una lettura al secondo, anche dopo tre `blur`: un solo timer');
  fuoco = true;
  lancia('window', 'focus');
  assert.equal(api.status().running, true);
  assert.equal(letturePerTimer(5000), 0, 'ripartita la scena, il timer non c’è più');
});

test('SFONDO-FUOCO-08: ferma per altri motivi (scheda nascosta, movimento ridotto) ⇒ nessun ricontrollo, anche fuori fuoco', () => {
  fuoco = false;
  document.hidden = true;
  lancia('document', 'visibilitychange');
  assert.equal(api.status().running, false);
  assert.equal(letturePerTimer(5000), 0, 'scheda nascosta: nessun timer');
  document.hidden = false;
  radice.classList.add('reduce-motion');
  lancia('window', 'blur');
  assert.equal(letturePerTimer(5000), 0, 'movimento ridotto: nessun timer');
  radice.classList.remove('reduce-motion');
  fuoco = true;
  lancia('window', 'focus');
  assert.equal(api.status().running, true);
});

test('SFONDO-FUOCO-09 (MR3): fuori fuoco la tela resta disegnata, anche se la finestra cambia misura mentre è ferma', () => {
  fuoco = false;
  lancia('window', 'blur');
  assert.equal(api.status().running, false);
  assert.doesNotMatch(ultimaChiamata(), /^clearRect/u, 'il `blur` non svuota la tela');
  const prima = disegni();
  richiamiResize[0]();
  giraFotogrammi(1);
  assert.equal(disegni(), prima + 1, 'la scena si ridisegna, ferma');
  assert.equal(api.status().stages[0].status, 'static');
  const ultimo = disegniTela.at(-1);
  const dopoPulizia = ultimo.slice(ultimo.findLastIndex((c) => c.startsWith('clearRect')) + 1);
  assert.ok(dopoPulizia.some((c) => /^(fill|stroke)/u.test(c)), `la tela è piena, non vuota (ultima chiamata: ${ultimaChiamata()})`);
});

test('SFONDO-FUOCO-10 (MR2): clic fuori e ritorno ⇒ la scena continua da dove era, non riparte da capo', () => {
  const inizio = new Set(disegniVeri().slice(0, 2).map(firma));
  assert.equal(inizio.size, 2, 'il primo disegno e il primo fotogramma sono diversi');
  assert.equal(api.status().running, false);
  const giaFatti = disegniVeri().length;
  const ferma = firma(disegniVeri().at(-1));
  fuoco = true;
  lancia('window', 'focus');
  giraFotogrammi(3);
  const nuovi = disegniVeri().slice(giaFatti).map(firma);
  assert.ok(nuovi.length >= 3, `la scena riparte (${nuovi.length} disegni)`);
  assert.ok(nuovi.every((f) => !inizio.has(f)), 'nessun disegno dopo il ritorno è uguale a quelli dell’inizio: niente salto da capo');
  assert.notEqual(nuovi[0], ferma, 'e si muove');
});

test('SFONDO-FUOCO-11: lo sfondo spento mentre la scena è ferma per il fuoco toglie anche il ricontrollo', () => {
  fuoco = false;
  giraFotogrammi(2);
  assert.equal(api.status().running, false);
  document.body.classList.add('background-motion-off');
  api.refresh();
  assert.equal(letturePerTimer(5000), 0, 'spento: nessun timer');
  document.body.classList.remove('background-motion-off');
  fuoco = true;
  api.refresh();
  assert.equal(api.status().running, true);
});

test('SFONDO-FUOCO-05: il «movimento ridotto» resta sopra a tutto: tornare alla finestra non fa ripartire la scena', () => {
  radice.classList.add('reduce-motion');
  fuoco = true;
  lancia('window', 'focus');
  assert.equal(api.status().running, false);
  radice.classList.remove('reduce-motion');
  lancia('window', 'focus');
  assert.equal(api.status().running, true, 'tolto il movimento ridotto, il ritorno alla finestra la fa ripartire');
  api.destroy();
});
