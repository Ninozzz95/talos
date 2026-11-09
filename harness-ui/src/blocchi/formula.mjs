// La formula del blocco `cursore` (interfaccia generativa, catalogo v2, scena 7 / FE-082, 05/11/2026).
//
// Un'aritmetica minima scritta a mano: numeri, i nomi DICHIARATI dal blocco (le colonne e il cursore), `+ - * / ( )` e il meno
// unario. Nient'altro: nessun altro identificatore, nessuna chiamata, nessun accesso a proprietà, nessun `eval`/`Function`/`with`/
// import dinamico. Si legge in un albero di oggetti semplici e si calcola camminando l'albero: il testo del modello non diventa MAI
// codice. I valori dei nomi si leggono solo con `Object.hasOwn` (mai dal prototipo), e `__proto__`/`constructor`/`prototype` non
// diventano mai un nome, nemmeno se un blocco li dichiara.
// ⛔ Nessun pacchetto di formule: expr-eval ha la CVE-2025-12735 (CVSS 9.8, CWE-94 e CWE-1321: un contesto costruito ad arte o
//   l'accesso a membro portano a eseguire codice; https://nvd.nist.gov/vuln/detail/CVE-2025-12735, ricerca del 05/11/2026: nessuna
//   correzione nel pacchetto `expr-eval` di silentmatt, solo nel fork `expr-eval-fork` 3.0.1). Il nostro sottoinsieme sta in ~100 righe
//   e si prova tutto (`tests/blocchi-formula.test.mjs`).
//
// Puro e senza dipendenze oltre il catalogo (lo legge anche la CLI e, copiato al pin, il telefono).

import { Rotto } from './catalogo.mjs';

export const LUNGHEZZA_MASSIMA_DELLA_FORMULA = 200;
const PROFONDITA_MASSIMA = 24;
const RISERVATI = new Set(['__proto__', 'constructor', 'prototype']);

const rotta = () => new Rotto('valoreNonValido', 'formula');

function gettoni(testo) {
  const fuori = [];
  let i = 0;
  while (i < testo.length) {
    const c = testo[i];
    if (c === ' ' || c === '\t') { i += 1; continue; }
    if ('+-*/()'.includes(c)) { fuori.push({ k: c }); i += 1; continue; }
    const numero = /^\d+(?:\.\d+)?/.exec(testo.slice(i));
    if (numero) { fuori.push({ k: 'n', v: Number(numero[0]) }); i += numero[0].length; continue; }
    const nome = /^[A-Za-z_][A-Za-z0-9_]*/.exec(testo.slice(i));
    if (nome) { fuori.push({ k: 'v', v: nome[0] }); i += nome[0].length; continue; }
    return null; // qualunque altro carattere: `.`, `;`, `[`, virgolette, `=`, `,`…
  }
  return fuori;
}

/**
 * Legge una formula in un albero: `{ n }` numero, `{ v }` nome dichiarato, `{ o: '+'|'-'|'*'|'/', a, b }`, `{ o: 'meno', a }`.
 * @param {string} testo
 * @param {string[]} nomi i nomi che la formula può usare (le colonne del blocco e il cursore)
 * @returns {object|Rotto} l'albero, oppure `Rotto('valoreNonValido', 'formula')`; non lancia mai
 */
export function leggiFormula(testo, nomi) {
  if (typeof testo !== 'string' || testo.length === 0 || testo.length > LUNGHEZZA_MASSIMA_DELLA_FORMULA) return rotta();
  const ammessi = new Set((Array.isArray(nomi) ? nomi : []).filter((n) => typeof n === 'string' && !RISERVATI.has(n)));
  const g = gettoni(testo);
  if (!g || g.length === 0) return rotta();
  let p = 0;
  let profondita = 0;
  const guarda = () => g[p];
  const binario = (sotto, operatori) => () => {
    let a = sotto();
    while (a && guarda() && operatori.includes(guarda().k)) {
      const o = g[p++].k;
      const b = sotto();
      a = b && Object.freeze({ o, a, b });
    }
    return a;
  };
  const unario = () => {
    profondita += 1;
    try {
      const x = guarda();
      if (!x || profondita > PROFONDITA_MASSIMA) return null;
      p += 1;
      if (x.k === '-') { const a = unario(); return a && Object.freeze({ o: 'meno', a }); }
      if (x.k === '+') return unario();
      if (x.k === 'n') return Object.freeze({ n: x.v });
      if (x.k === 'v') return ammessi.has(x.v) ? Object.freeze({ v: x.v }) : null;
      if (x.k === '(') {
        const a = somma();
        if (!a || !guarda() || guarda().k !== ')') return null;
        p += 1;
        return a;
      }
      return null;
    } finally {
      profondita -= 1;
    }
  };
  const prodotto = binario(unario, ['*', '/']);
  const somma = binario(prodotto, ['+', '-']);
  const albero = somma();
  // un gettone avanzato (`a (b)`, `f(1)`, `1 2`) vuol dire che la formula non è un'espressione sola
  return albero && p === g.length ? albero : rotta();
}

/**
 * Calcola un albero di `leggiFormula`.
 * @param {object} albero
 * @param {Record<string, unknown>} valori i valori dei nomi; un nome senza un numero finito dà `null`
 * @returns {number|null} `null` per una divisione per zero, un valore mancante o un risultato non finito (a schermo «—»)
 */
export function calcola(albero, valori) {
  const v = (nodo) => {
    if (!nodo || typeof nodo !== 'object') return null;
    if (Object.hasOwn(nodo, 'n')) return nodo.n;
    if (Object.hasOwn(nodo, 'v')) {
      const x = valori && Object.hasOwn(valori, nodo.v) ? valori[nodo.v] : null;
      return typeof x === 'number' && Number.isFinite(x) ? x : null;
    }
    const a = v(nodo.a);
    if (a === null) return null;
    if (nodo.o === 'meno') return -a;
    const b = v(nodo.b);
    if (b === null) return null;
    switch (nodo.o) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
      default: return null;
    }
  };
  const r = v(albero);
  return r === null || !Number.isFinite(r) ? null : r;
}
