/*
 * Interfaccia generativa, blocco 2 (02/11/2026): gli attrezzi comuni dei disegnatori del PC.
 *
 * ⛔ Il testo del modello entra nella pagina SOLO come testo: `textContent`, `setAttribute` o `data-*`, MAI `innerHTML`
 *   (lo controlla una guardia statica sui sorgenti, `tests/unit/blocchi-pc.test.mjs`). Il lettore del nucleo lo ha già passato dalla
 *   funzione unica (`harness-ui/src/blocchi/testo-del-modello.mjs`): una riga dove serve, via controlli e invisibili, tetti.
 * ⛔ Nessun colore scritto qui: le classi portano i token del tema (`styles/blocchi.css`).
 */
import { linguaCorrenteDiT, LINGUA_DI_RISERVA, LINGUA_PSEUDO } from '../lingua.js';

/** Un elemento con classe e testo (sempre `textContent`). */
export function el(doc, tag, classe, testo) {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
}

const SVG = 'http://www.w3.org/2000/svg';
/** Un elemento SVG con i suoi attributi (mai markup). */
export function svg(doc, tag, attributi = {}) {
  const n = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attributi)) n.setAttribute(k, String(v));
  return n;
}

/** Un pulsante della grammatica di casa (`talos-button`), `type="button"`. */
export function tasto(doc, testo, variante = 'ghost', taglia = 'sm') {
  const b = el(doc, 'button', `talos-button talos-button--${variante} talos-button--${taglia}`, testo);
  b.type = 'button';
  return b;
}

/** La lingua dei numeri: quella dell'interfaccia (la pseudo-lingua scrive come l'inglese). */
export function linguaDeiNumeri() {
  const l = linguaCorrenteDiT();
  return l === LINGUA_PSEUDO || !l ? LINGUA_DI_RISERVA : l;
}

const formati = new Map();
function formato(chiave, opzioni) {
  const k = `${linguaDeiNumeri()}|${chiave}`;
  if (!formati.has(k)) formati.set(k, new Intl.NumberFormat(linguaDeiNumeri(), opzioni));
  return formati.get(k);
}

/**
 * Un numero nella lingua dell'interfaccia. `soldi`: sempre due decimali e « €» dopo, staccato da uno spazio NON separabile (U+00A0,
 * ledger G-C UIG-9.5): la cifra e il simbolo non vanno mai a capo separati (Unicode UAX #14, classe GL; il formato it-IT di Intl
 * per EUR mette lo stesso U+00A0 prima del simbolo).
 */
export function numero(v, tipo = 'numero') {
  if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '');
  if (tipo === 'soldi') return `${formato('soldi', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}\u00A0€`;
  return formato('numero', { maximumFractionDigits: 6 }).format(v);
}

/** Il testo di una cella o di un valore: numeri nella lingua, `null` come trattino. */
export function testoDelValore(v, tipo) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return numero(v, tipo);
  return String(v);
}

/** Le colonne che si allineano a destra (cifre). */
export const eNumerica = (tipo) => tipo === 'numero' || tipo === 'soldi';

/** Un elenco del blocco, anche parziale (mentre arriva un campo può mancare). */
export const lista = (v) => (Array.isArray(v) ? v : []);
