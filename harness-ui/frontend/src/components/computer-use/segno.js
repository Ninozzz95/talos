/*
 * FE-070: il segno del computer use del PC — il cursore di TALOS, l'anello del clic, il mouse preso e il bordo «TALOS guarda questa finestra», uguali al bozzetto approvato
 * (`bozzetto-computer-use-pc`, TABELLA-PEZZI righe 9-12 e 33; Desktop 05/11 16:47).
 * Il guscio apre una finestra trasparente per schermo (`segno-finestra.mjs`, del Desktop) con `?fx=&fy=&fw=&fh=&scala=`: il rettangolo dello schermo in pixel fisici e la sua scala.
 * Gli eventi arrivano sul canale della bolla in pixel fisici globali; qui si converte: locale = (p − fx,fy) / scala. La conversione è affine, quindi ogni finestra che anima la
 * stessa curva nelle sue coordinate, all'orologio di `t0`, disegna in ogni istante lo stesso punto globale: una sola curva fra gli schermi, ritagliata da ogni finestra.
 * L'animazione è la Web Animations API del browser (W3C), con l'andamento e la durata del bozzetto: nessuna dipendenza.
 * ⛔ Si legge per forma e si disegna soltanto: nessun gesto, nessuna risposta. La posizione vera del mouse è solo il ripiego (c): l'anello segue il percorso previsto.
 */

import { leggiMessaggio } from './bolla-messaggi.js'; // FE-072: non dal protocollo della bolla, che importa la pillola e le traduzioni

/* Decisione 252 dell'owner (Desktop 05/11 16:57): il viaggio dura secondo la distanza, da 250 a 850 ms, e l'annuncio porta `durata`; senza, o non numerica, 850 come
   nel bozzetto. Fuori dall'intervallo si riporta dentro: il segno non disegna mai un viaggio che l'owner non ha approvato. */
export const DURATA_CURSORE = 850;
export const DURATA_MINIMA_CURSORE = 250;
export const ANDAMENTO_CURSORE = 'cubic-bezier(.3,.7,.2,1)';
export const RITARDO_ANELLO = 420;
export const DURATA_ANELLO = 650;
/** Chi arriva oltre durata+220 ms non disegna né curva né anello (a 850 è il vecchio 420+650). */
export const TARDI_OLTRE = 220;
/** L'anello parte nella stessa proporzione del bozzetto: 420 su 850. */
export const inizioAnello = (durata) => (durata * RITARDO_ANELLO) / DURATA_CURSORE;
const durataDa = (d) => (numero(d) ? Math.min(DURATA_CURSORE, Math.max(DURATA_MINIMA_CURSORE, d)) : DURATA_CURSORE);

/** La punta della freccia di TALOS (24×24, punta in 4,2) e di quella della persona (viewBox 24 disegnato a 22). */
const PUNTA_CURSORE = Object.freeze({ x: 4, y: 2 });
const PUNTA_MIO = Object.freeze({ x: 11 / 3, y: 11 / 6 });
/** Il bozzetto mette l'anello in (x+5, y+3) rispetto alla traslazione del cursore: un pixel oltre la punta. */
const SCARTO_ANELLO = 1;
const SVG = 'http://www.w3.org/2000/svg';
const MODI = new Set(['sottofondo', 'preso']);
const SPEGNE = new Set(['talos.computer-use-pausa', 'talos.computer-use-fermato', 'talos.computer-use-esito']);
const NUMERO_SEMPLICE = /^-?\d+(?:\.\d+)?$/u;
/* FE-074: i nomi del clic nel ciclo del computer use (italiano e inglese), gli esiti di un'azione fatta (`ESITI_AZIONE` meno rifiutata e non-eseguita), la fine di un compito. */
const CLIC = new Set(['clic', 'click', 'premi', 'press', 'scegli', 'select']);
const ESEGUITI = new Set(['confermata', 'non-verificabile', 'probabilmente-a-vuoto']);
const FINE_COMPITO = new Set(['talos.computer-use-fermato', 'talos.computer-use-esito']);

const oggetto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const numero = (x) => typeof x === 'number' && Number.isFinite(x);
const punto = (p) => (oggetto(p) && numero(p.x) && numero(p.y) ? { x: p.x, y: p.y } : null);
const rettangolo = (r) => (oggetto(r) && numero(r.x) && numero(r.y) && numero(r.w) && numero(r.h) && r.w > 0 && r.h > 0 ? { x: r.x, y: r.y, w: r.w, h: r.h } : null);

/** Lo schermo di questa finestra dalla query del guscio, o `null`: solo numeri semplici, misure e scala positive. */
export function leggiSchermo(query) {
  const q = typeof query === 'string' ? new URLSearchParams(query) : query;
  const v = {};
  for (const k of ['fx', 'fy', 'fw', 'fh', 'scala']) {
    const testo = q?.get?.(k);
    if (typeof testo !== 'string' || !NUMERO_SEMPLICE.test(testo)) return null;
    v[k] = Number(testo);
  }
  return v.fw > 0 && v.fh > 0 && v.scala > 0 ? v : null;
}

export const inLocale = (p, s) => ({ x: (p.x - s.fx) / s.scala, y: (p.y - s.fy) / s.scala });
export const inGlobale = (p, s) => ({ x: p.x * s.scala + s.fx, y: p.y * s.scala + s.fy });
export function rettangoloLocale(r, s) {
  const o = inLocale(r, s);
  return { x: o.x, y: o.y, w: r.w / s.scala, h: r.h / s.scala };
}

/** Il ripiego dal guscio (`postMessage` nella pagina): la posizione vera del mouse in pixel fisici globali. */
export function leggiRipiego(m) {
  if (!oggetto(m) || m.tipo !== 'segno-ripiego') return null;
  const p = punto(m.punto);
  return p ? { tipo: 'segno-ripiego', punto: p } : null;
}

export const STATO_INIZIALE_SEGNO = Object.freeze({ annuncio: null, guarda: null });

/** `m` è un messaggio già letto da `leggiMessaggio` della bolla; il valore dell'evento si legge qui per forma. */
export function riduciSegno(stato, m) {
  if (!oggetto(m) || m.tipo !== 'evento' || !oggetto(m.evento)) return stato;
  const { name, value } = m.evento;
  if (SPEGNE.has(name)) return STATO_INIZIALE_SEGNO;
  if (!oggetto(value)) return stato;
  if (name === 'talos.computer-use-guarda') {
    const finestra = rettangolo(value.finestra);
    return finestra ? { ...stato, guarda: finestra } : stato;
  }
  if (name === 'talos.computer-use-annuncio') {
    // difetto 8a (revisione 05/11 sera): `finestra: null` è la finestra non valida del passo; il punto è dello schermo, quindi il cursore vola e il bordo resta quello di prima
    const finestra = value.finestra === null ? null : rettangolo(value.finestra);
    const p = punto(value.punto);
    const modo = value.modo === undefined ? 'sottofondo' : value.modo;
    if ((!finestra && value.finestra !== null) || !p || !numero(value.t0) || !MODI.has(modo)) return stato;
    const ora = stato.annuncio;
    if (ora && ora.t0 === value.t0 && ora.punto.x === p.x && ora.punto.y === p.y && ora.modo === modo) return stato; // lo stesso annuncio da due pagine principali
    return { annuncio: { finestra, punto: p, t0: value.t0, durata: durataDa(value.durata), modo, da: stato.annuncio ? stato.annuncio.punto : null }, guarda: finestra ?? stato.guarda };
  }
  return stato;
}

const trasla = (x, y) => `translate(${x}px, ${y}px)`;

/**
 * La pagina del segno. `anima(el, fotogrammi, opzioni)` è `el.animate` nel browser; `ridotto` è `prefers-reduced-motion`. Senza schermo valido non disegna e non ascolta.
 * `chiedi()` (FE-074) chiede al guscio la posizione vera del mouse: nel browser è `window.open(INDIRIZZO_RIPIEGO)`, che il guscio nega e a cui risponde con `segno-ripiego`.
 */
export function creaSegno({ document, canale, schermo, adesso, timer, anima, ridotto = false, chiedi = () => {} }) {
  const nodo = document.createElement('div');
  nodo.className = 'segno';
  nodo.setAttribute('aria-hidden', 'true');
  if (!schermo) {
    nodo.hidden = true;
    return { nodo, stato: () => STATO_INIZIALE_SEGNO, ripiego() {}, chiudi() {} };
  }
  let stato = STATO_INIZIALE_SEGNO;
  let cursore = null, mio = null, bordo = null, animazione = null, attesaAnello = null;
  const anelli = new Map();

  const elemento = (tag, classe) => { const e = document.createElement(tag); e.className = classe; e.setAttribute('aria-hidden', 'true'); return e; };
  function nuovoCursore() {
    const c = elemento('span', 'cursore');
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of [['width', '24'], ['height', '24'], ['viewBox', '0 0 24 24']]) svg.setAttribute(k, v);
    const path = document.createElementNS(SVG, 'path');
    for (const [k, v] of [['d', 'M4 2l15 12-7 1-3 7z'], ['fill', '#c98b32'], ['stroke', '#1b1407'], ['stroke-width', '1.4'], ['stroke-linejoin', 'round']]) path.setAttribute(k, v);
    svg.append(path);
    const b = document.createElement('b');
    b.textContent = 'TALOS';
    c.append(svg, b);
    return c;
  }
  function nuovoMio() {
    const m = elemento('span', 'mio mio--preso');
    const b = document.createElement('b');
    b.textContent = 'TALOS';
    m.append(b);
    return m;
  }
  const togliAnello = (a) => { timer.clearTimeout(anelli.get(a)); anelli.delete(a); a.remove(); };
  function anello(p, gia = 0) {
    const l = inLocale(p, schermo);
    const a = elemento('span', 'anello');
    a.style.left = `${l.x + SCARTO_ANELLO}px`;
    a.style.top = `${l.y + SCARTO_ANELLO}px`;
    if (gia > 0) a.style.animationDelay = `-${gia}ms`;
    nodo.append(a);
    anelli.set(a, timer.setTimeout(() => togliAnello(a), DURATA_ANELLO - gia));
  }
  const inizio = (a) => (ridotto ? 0 : inizioAnello(a.durata));
  const curvaInCorso = () => Boolean(stato.annuncio) && adesso() - stato.annuncio.t0 < inizio(stato.annuncio) + DURATA_ANELLO;

  function fermaCurva() {
    animazione?.cancel();
    animazione = null;
    if (attesaAnello !== null) timer.clearTimeout(attesaAnello);
    attesaAnello = null;
  }
  function spegni() {
    fermaCurva();
    for (const a of [...anelli.keys()]) togliAnello(a);
    cursore?.remove(); mio?.remove(); bordo?.remove();
    cursore = mio = bordo = null;
  }
  function muovi(a) {
    fermaCurva();
    const preso = a.modo === 'preso';
    if (preso) { cursore?.remove(); cursore = null; if (!mio) { mio = nuovoMio(); nodo.append(mio); } }
    else { mio?.remove(); mio = null; if (!cursore) { cursore = nuovoCursore(); nodo.append(cursore); } }
    const el = preso ? mio : cursore;
    const punta = preso ? PUNTA_MIO : PUNTA_CURSORE;
    const verso = (p) => { const l = inLocale(p, schermo); return trasla(l.x - punta.x, l.y - punta.y); };
    const trascorso = adesso() - a.t0;
    el.style.transform = verso(a.punto);
    if (a.da && !ridotto && trascorso < a.durata) {
      animazione = anima(el, [{ transform: verso(a.da) }, { transform: verso(a.punto) }], { duration: a.durata, easing: ANDAMENTO_CURSORE, fill: 'forwards' });
      animazione.currentTime = Math.max(0, trascorso);
    }
    const parte = inizio(a);
    if (trascorso > a.durata + TARDI_OLTRE || trascorso >= parte + DURATA_ANELLO) return;
    if (trascorso >= parte) anello(a.punto, trascorso - parte);
    else attesaAnello = timer.setTimeout(() => { attesaAnello = null; anello(a.punto); }, parte - trascorso);
  }
  function disegna(prima) {
    if (stato === prima) return;
    if (!stato.annuncio && !stato.guarda) { spegni(); return; }
    if (stato.guarda) {
      if (!bordo) { bordo = elemento('span', 'guarda'); nodo.append(bordo); }
      const r = rettangoloLocale(stato.guarda, schermo);
      Object.assign(bordo.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    }
    if (stato.annuncio && stato.annuncio !== prima.annuncio) muovi(stato.annuncio);
  }

  /*
   * FE-074, il ripiego (c) del guscio: un clic fatto col mouse preso, senza una curva prevista per quel passo, si chiede dov'è il mouse vero. Una curva conta per il passo
   * il cui esito arriva dopo di lei (Desktop 05/11 18:34: l'annuncio precede l'esito; nessuna finestra d'attesa finché Computer use non dice il contrario).
   * In sottofondo, o senza `modo`, il mouse vero è della persona: niente (decisione 1 del Desktop).
   */
  let curva = false;
  let ultimoEsito = null;
  function forseRipiego(prima, m) {
    const { name, value } = m.evento;
    if (FINE_COMPITO.has(name)) { curva = false; ultimoEsito = null; return; }
    if (name === 'talos.computer-use-annuncio') { if (stato.annuncio !== prima.annuncio) curva = true; return; }
    if (name !== 'talos.computer-use-passo' || !oggetto(value) || value.fase !== 'esito' || !numero(value.n) || value.n === ultimoEsito) return;
    ultimoEsito = value.n; // lo stesso esito da due pagine principali conta una volta
    const conCurva = curva;
    curva = false;
    if (!conCurva && CLIC.has(value.tipo) && ESEGUITI.has(value.esito) && value.modo === 'preso' && !curvaInCorso()) chiedi();
  }

  const ricevi = (m) => {
    const prima = stato;
    stato = riduciSegno(stato, m);
    disegna(prima);
    if (m.tipo === 'evento' && oggetto(m.evento)) forseRipiego(prima, m);
  };
  canale.onmessage = (e) => { const m = leggiMessaggio(e?.data); if (m) ricevi(m); };
  return {
    nodo,
    stato: () => stato,
    ripiego(m) { const r = leggiRipiego(m); if (r && !curvaInCorso()) anello(r.punto); },
    chiudi() { canale.onmessage = null; spegni(); stato = STATO_INIZIALE_SEGNO; },
  };
}
