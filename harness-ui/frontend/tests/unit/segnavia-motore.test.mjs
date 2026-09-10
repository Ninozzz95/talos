import test from 'node:test';
import assert from 'node:assert/strict';
import { animaSegnavia, ATTESA_VERIFICA_MS, INTERVALLO_CONFRONTO_MS } from '../../src/components/conversazione.js';

/*
 * ⛔⛔⛔ IL MOTORE DEL SEGNAVIA — l'owner, cinque volte: «non si muove», e ogni mia misura diceva di
 * sì. SMIL gira in tutte le condizioni che so riprodurre (due temi × tre modi di «riduci
 * animazioni»: 12 valori distinti su 12, sei volte su sei), quindi ciò che lo ferma sul suo Chrome
 * è qualcosa che non riesco a mettere sul banco. ⇒ La misura si sposta nel browser di chi guarda.
 *
 * Qui si prova la LOGICA, in modo deterministico: nessun tempo vero, nessun browser. La finestra è
 * finta e i tempi li decido io — altrimenti questo test misurerebbe il carico della macchina, che
 * è l'errore già pagato con D-10C.
 */

/** Un segnavia finto: sa dire i suoi attributi, e finge di essere nel documento. */
function segnaviaFinto({ smilSiMuove }) {
  const attributi = new Map();
  const nodo = () => { const a = new Map(); return { setAttribute: (k, v) => a.set(k, String(v)), get: (k) => a.get(k) }; };
  const sweep = nodo();
  const nodi = [nodo(), nodo(), nodo()];
  let letture = 0;
  return {
    isConnected: true,
    setAttribute: (k, v) => attributi.set(k, String(v)),
    getAttribute: (k) => attributi.get(k) ?? null,
    querySelector: (s) => (s.endsWith('sweep') ? sweep : null),
    querySelectorAll: () => nodi,
    pauseAnimations() { attributi.set('__pausa', 'sì'); },
    /* Lo stile calcolato: se «SMIL si muove» ogni lettura dà un valore diverso, come nel browser. */
    stile: () => ({ strokeDashoffset: smilSiMuove ? `${88 - (letture += 1) * 7}px` : '88px' }),
    sweep, nodi,
  };
}

/** Una finestra finta: i timer si scaricano a mano, i frame pure. */
function finestraFinta() {
  const attesi = [];
  const frame = [];
  return {
    setTimeout: (fn, ms) => { attesi.push({ fn, ms }); return attesi.length; },
    clearInterval() {}, setInterval: (fn) => { frame.push(fn); return 99; },
    requestAnimationFrame: (fn) => { frame.push(fn); return frame.length; },
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    /* ⛔ I timer sono DUE in cascata (attesa, poi confronto): scaricarne uno solo proverebbe meta'
       della logica — ed e' proprio la meta' che sbagliava. Si scarica finche' non ne nascono piu'. */
    scaricaTimer: () => { for (let g = 0; g < 5 && attesi.length; g += 1) for (const t of attesi.splice(0)) t.fn(); },
    frame,
  };
}

test('SEGNAVIA: se SMIL si muove, il motore JS non tocca niente', () => {
  const svg = segnaviaFinto({ smilSiMuove: true });
  const f = finestraFinta();
  f.getComputedStyle = () => svg.stile();
  animaSegnavia(svg, { window: f, adesso: () => 0 });
  assert.equal(svg.getAttribute('data-motore'), 'smil');
  f.scaricaTimer();
  assert.equal(svg.getAttribute('data-motore'), 'smil', '⛔ due motori sullo stesso attributo litigano');
  assert.equal(f.frame.length, 0, 'nessun frame chiesto: SMIL bastava');
  assert.equal(svg.getAttribute('__pausa'), null, 'e SMIL non va messo in pausa');
});

test('SEGNAVIA, AL CONTRARIO: se SMIL è fermo, il motore JS prende il comando e disegna', () => {
  const svg = segnaviaFinto({ smilSiMuove: false });
  const f = finestraFinta();
  f.getComputedStyle = () => svg.stile();
  let tempo = 0;
  animaSegnavia(svg, { window: f, adesso: () => tempo });
  f.scaricaTimer();
  /* ⛔ `js` o `js-intervallo`: qui conta che il ripiego sia acceso e che DISEGNI. Quale delle due
     vie lo faccia dipende da quanti frame la finestra finta concede, che è una proprietà del banco
     e non del codice — pretendere `js` misurerebbe il banco. La via si prova nel test dedicato. */
  assert.notEqual(svg.getAttribute('data-motore'), 'smil', '⛔ senza questo nessuno saprebbe che via è viva');
  assert.equal(svg.getAttribute('__pausa'), 'sì', 'SMIL fermo va tolto di mezzo, o litiga sull’attributo');

  /* Si scorrono quattro istanti del ciclo e si guarda che il disegno CAMBI davvero. */
  const visti = new Set();
  const accesi = new Set();
  for (const t of [0, 400, 800, 1200]) {
    tempo = t;
    f.frame.splice(0).forEach((fn) => fn());
    visti.add(svg.sweep.get('stroke-dashoffset'));
    accesi.add(svg.nodi.map((n) => n.get('fill-opacity')).join('|'));
  }
  assert.equal(visti.size, 4, `⛔ la linea deve muoversi a ogni frame. Trovato: ${[...visti].join(', ')}`);
  assert.equal(accesi.size, 4, `⛔ e i tre nodi non si accendono insieme. Trovato: ${[...accesi].join(' / ')}`);
});

test('SEGNAVIA: se nemmeno i frame arrivano, si passa all’intervallo', () => {
  const svg = segnaviaFinto({ smilSiMuove: false });
  const f = finestraFinta();
  f.getComputedStyle = () => svg.stile();
  f.requestAnimationFrame = () => null; // ⛔ un browser che non concede frame: rAF strozzato
  animaSegnavia(svg, { window: f, adesso: () => 0 });
  f.scaricaTimer();
  assert.equal(svg.getAttribute('data-motore'), 'js-intervallo');
});

test('SEGNAVIA: un segnavia tolto dal documento non lascia un motore acceso', () => {
  const svg = segnaviaFinto({ smilSiMuove: false });
  const f = finestraFinta();
  f.getComputedStyle = () => svg.stile();
  animaSegnavia(svg, { window: f, adesso: () => 0 });
  svg.isConnected = false;
  f.scaricaTimer();
  assert.equal(f.frame.length, 0, '⛔ un timer che sopravvive al suo elemento è una perdita invisibile');
});

/*
 * ⛔⛔⛔ IL DIFETTO CHE LA PROVA DAL VIVO HA TROVATO: la prima versione leggeva `stroke-dashoffset`
 * SUBITO, cioè a SVG ancora fuori dal documento — `getComputedStyle` lì torna stringa vuota, e il
 * confronto '' contro '88px' diceva sempre «SMIL lavora». Il ripiego non partiva MAI. Un ripiego
 * che non si accende è peggio di nessun ripiego: fa credere che ci sia una rete.
 */
test('SEGNAVIA: le due letture avvengono DOPO l’attesa, mai a elemento non ancora inserito', () => {
  const svg = segnaviaFinto({ smilSiMuove: false });
  const f = finestraFinta();
  const quando = [];
  let orologio = 0;
  f.getComputedStyle = () => { quando.push(orologio); return svg.stile(); };
  f.setTimeout = (fn, ms) => { const t = orologio; return (f.__coda ??= []).push(() => { orologio = t + ms; fn(); }); };
  f.scaricaTimer = () => { for (let g = 0; g < 5 && f.__coda?.length; g += 1) for (const fn of f.__coda.splice(0)) fn(); };
  animaSegnavia(svg, { window: f, adesso: () => orologio });
  assert.deepEqual(quando, [], '⛔ nessuna lettura prima dell’attesa: lì l’SVG non è ancora nel documento');
  f.scaricaTimer();
  assert.equal(quando.length >= 2, true, 'due letture, non una');
  assert.ok(quando.every((t) => t >= ATTESA_VERIFICA_MS), `⛔ letture troppo presto: ${quando.join(', ')}`);
  assert.ok(quando[1] - quando[0] >= INTERVALLO_CONFRONTO_MS, 'e separate abbastanza da vedere il movimento');
  /* ⛔ `js` o `js-intervallo`: quale delle due vie non conta qui — conta che il ripiego SIA partito.
     (In questo test i frame restano in coda e non scattano, quindi il degrado all'intervallo e'
     atteso: pretendere `js` misurerebbe la finestra finta, non la logica.) */
  assert.notEqual(svg.getAttribute('data-motore'), 'smil', '⛔ il ripiego deve accendersi');
});

test('SEGNAVIA, AL CONTRARIO: senza sweep non esplode e non fa niente', () => {
  const finto = { isConnected: true, querySelector: () => null, setAttribute() {} };
  assert.doesNotThrow(() => animaSegnavia(finto, { window: finestraFinta() }));
});
