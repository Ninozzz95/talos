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

/*
 * ⭐⭐⭐ D-10R — IL NODO CRESCE, non solo si accende.
 *
 * ⛔ La misura che ha chiuso il debito sta sui PIXEL, non qui: 11,6 pixel cambiati per fotogramma su
 *   864 (1,3%) prima, 25,8 (3,0%) dopo, e il salto massimo fra due istanti del ciclo da 42 a 132
 *   (4,9% → 15,3%), in Chrome con `--disable-gpu` (la condizione del Chrome dell'owner). Questi test
 *   tengono le due condizioni da cui quella misura dipende, e che nessuno vedrebbe rompersi: che i
 *   due `<animate>` ci siano e siano sincroni, e che il ripiego JavaScript disegni ANCHE il raggio.
 */
function documentoSvgFinto() {
  const nodo = (tag) => {
    const attributi = new Map();
    const self = {
      tag, figli: [], testoProprio: null, className: '',
      get textContent() { return self.testoProprio ?? self.figli.map((f) => f.textContent ?? '').join(''); },
      set textContent(v) { self.testoProprio = String(v); },
      setAttribute: (k, v) => attributi.set(k, String(v)),
      getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
      append: (...x) => self.figli.push(...x),
      addEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      tuttiConTag(t, dentro = []) { if (self.tag === t) dentro.push(self); for (const f of self.figli) f.tuttiConTag?.(t, dentro); return dentro; },
      conClasse(c, dentro = []) { if (String(self.getAttribute('class') || self.className || '').split(/\s+/).includes(c)) dentro.push(self); for (const f of self.figli) f.conClasse?.(c, dentro); return dentro; },
    };
    return self;
  };
  return { createElement: (t) => nodo(t), createElementNS: (_ns, t) => nodo(t), createTextNode: (t) => ({ tag: '#text', textContent: String(t), figli: [] }) };
}



/*
 * ⛔⛔⛔ MENO MOVIMENTO: i tre nodi devono essere accesi TUTTI E TRE.
 *
 * Il difetto che questo test tiene fermo è stato trovato provando al verso contrario dal vivo, con
 * `prefers-reduced-motion: reduce`: il segnavia mostrava `fill-opacity [0, 1, 1]` e `r [4, 7, 7]` —
 * il PRIMO nodo spento e piccolo, gli altri due accesi. Si costruivano gli `<animate>`, si
 * scrivevano a mano i valori fermi e poi si chiamava `pauseAnimations()`: a t=0 solo l'animazione
 * con `begin="0s"` era già partita, e sovrascriveva il primo nodo col suo valore iniziale.
 */


test('SEGNAVIA, AL CONTRARIO: il ripiego JavaScript muove ANCHE il raggio', () => {
  const svg = segnaviaFinto({ smilSiMuove: false });
  const f = finestraFinta();
  f.getComputedStyle = () => svg.stile();
  let tempo = 0;
  animaSegnavia(svg, { window: f, adesso: () => tempo });
  f.scaricaTimer();
  const raggi = new Set();
  for (const t of [0, 400, 800, 1200]) {
    tempo = t;
    f.frame.splice(0).forEach((fn) => fn());
    raggi.add(svg.nodi.map((n) => n.get('r')).join('|'));
  }
  assert.equal(raggi.size, 4, `⛔ un ripiego che accende ma non fa crescere vale meno dell’originale. Trovato: ${[...raggi].join(' / ')}`);
});

/*
 * ⛔⛔⛔ 10/09 — IL SEGNAVIA E' QUELLO DEL MOBILE, e questo test lo inchioda.
 *
 * Owner: «identico a quello che c'e' gia' nel mobile, e piccolo». «Identico» e' una promessa che
 * si puo' rompere in silenzio con una riga — un raggio diverso, un nodo spostato — e allora la
 * si prova: la geometria qui sotto e' letta da `mobile/src/components/brand/TalosLineLoader.vue`.
 *
 * ⛔ Qui NON si prova piu' SMIL, e non e' una rinuncia: SMIL e il motore JS di riserva erano due
 *   cure a un problema che non esisteva. Il segnavia non si muoveva perche' due regole universali
 *   con `!important` (`body.reduce-motion *` e `@media (prefers-reduced-motion){ * }`) spegnevano
 *   OGNI animazione dell'app. Tolte quelle, l'animazione CSS del mobile funziona.
 */
import { creaAttesa } from '../../src/components/conversazione.js';

test('ORB (12/09, owner): la bolla d’attesa monta l’orb del mobile — cerchio, marchio corto, anello che ruota — e non più il segnavia', () => {
  const creati = [];
  const finto = {
    createElementNS: (_ns, tag) => { const n = { tag, setAttribute() {}, getAttribute: () => null, append() {} }; creati.push(n); return n; },
    createElement: (tag) => {
      const n = { tag, className: '', dataset: {}, children: [], attr: new Map(), setAttribute(k, v) { n.attr.set(k, String(v)); }, getAttribute: (k) => n.attr.get(k) ?? null, append: (...x) => n.children.push(...x), appendChild: (x) => n.children.push(x) };
      creati.push(n);
      return n;
    },
    createTextNode: (t) => ({ t }),
  };
  const { blocco } = creaAttesa({ etichetta: 'x' }, { document: finto });
  const orb = creati.find((n) => typeof n.className === 'string' && /talos-orb/.test(n.className));
  assert.ok(orb, 'esiste lo span .talos-orb');
  assert.match(orb.className, /working/, 'durante l’attesa lavora: l’anello gira');
  assert.equal(orb.getAttribute('aria-hidden'), 'true');
  const marchio = orb.children.find((c) => /talos-short-logo/.test(c.className));
  assert.ok(marchio, 'dentro: .talos-short-logo');
  assert.ok(marchio.children.some((c) => /talos-short-logo-mark/.test(c.className)), 'e il marchio corto .talos-short-logo-mark');
  /* ⛔ AL CONTRARIO: niente più segnavia SVG nella bolla d’attesa, niente SMIL. */
  assert.equal(creati.filter((n) => n.tag === 'svg' || n.tag === 'animate' || n.tag === 'circle').length, 0, 'il segnavia a tre nodi non si monta più');
  const riga = blocco.children.find((c) => /talos-waiting__row/.test(c.className));
  assert.equal(riga.children[0], orb, 'l’orb sta al posto del segnavia, primo nella riga');
});
