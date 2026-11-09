// UIG-7.1, 7.2, 7.3 (ledger UI generativa 05/11, G-C, scena 7): la formula del cursore. Aritmetica a mano, mai codice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Rotto } from '../src/blocchi/catalogo.mjs';
import { calcola, leggiFormula } from '../src/blocchi/formula.mjs';

const conto = (testo, valori, nomi = Object.keys(valori)) => {
  const albero = leggiFormula(testo, nomi);
  assert.ok(!(albero instanceof Rotto), `${testo} si legge`);
  return calcola(albero, valori);
};

test('UIG-7.1 2*(a+b) con a=1, b=2 fa 6; precedenza, sinistra a destra, meno unario', () => {
  assert.equal(conto('2*(a+b)', { a: 1, b: 2 }), 6);
  assert.equal(conto('a+b*2', { a: 1, b: 2 }), 5);
  assert.equal(conto('a-b-1', { a: 10, b: 2 }), 7);
  assert.equal(conto('a/b/2', { a: 8, b: 2 }), 2);
  assert.equal(conto('-a + -(-b)', { a: 1, b: 5 }), 4);
  assert.equal(conto('+a', { a: 3 }), 3);
  assert.equal(conto('spesa * (1 - sconto / 100)', { spesa: 412, sconto: 30 }), 412 * (1 - 30 / 100));
  assert.equal(conto('1.5 * 2', {}), 3);
});

test('UIG-7.1 la divisione per zero e un valore mancante danno null (a schermo «—»), mai Infinity o NaN', () => {
  assert.equal(conto('a/b', { a: 1, b: 0 }), null);
  assert.equal(conto('a/(b-b)', { a: 1, b: 3 }), null);
  /* lo zero al denominatore si ferma SUBITO: senza, 1/(1/0) = 1/Infinity = 0 e il controllo di finitezza finale non lo vede */
  assert.equal(conto('a/(a/b)', { a: 1, b: 0 }), null);
  assert.equal(conto('a+b', { a: 1, b: null }), null);
  assert.equal(conto('a+b', { a: 1, b: 'x' }), null);
  assert.equal(calcola(leggiFormula('a*a', ['a']), { a: 1e200 }), null);
});

const OSTILI = ['constructor', '__proto__', 'a.b', 'f(1)', '1;2', 'c', 'a(1)', 'a b', '(a', 'a)', '', 'a+', '*a', 'a[0]', 'a=1',
  '"a"', 'this', 'globalThis', 'eval', 'Function', 'import(a)', 'with(a)', 'a,b', 'a**b', '1e3', '.5', 'a//b', 'toString'];

test('UIG-7.2 sono rifiutati: constructor, __proto__, a.b, f(1), 1;2 e ogni nome non dichiarato', () => {
  for (const testo of OSTILI) {
    const r = leggiFormula(testo, ['a', 'b']);
    assert.ok(r instanceof Rotto, `«${testo}» rifiutata`);
    assert.equal(r.campo, 'formula');
  }
  // anche dichiarati dal blocco, i nomi del prototipo non diventano mai variabili
  for (const nome of ['constructor', '__proto__', 'prototype']) assert.ok(leggiFormula(nome, [nome]) instanceof Rotto, nome);
  assert.ok(leggiFormula(`${'('.repeat(30)}a${')'.repeat(30)}`, ['a']) instanceof Rotto, 'oltre la profondità');
  assert.ok(!(leggiFormula(`${'('.repeat(10)}a${')'.repeat(10)}`, ['a']) instanceof Rotto), 'dieci parentesi si leggono');
  assert.ok(leggiFormula(`${'a+'.repeat(100)}a`, ['a']) instanceof Rotto, 'oltre i 200 caratteri');
  assert.equal(calcola(leggiFormula('a', ['a']), Object.create({ a: 5 })), null, 'un valore ereditato non si legge');
});

test('UIG-7.3 fuzz: 2000 stringhe a caso non lanciano mai e non chiamano mai Function né eval', () => {
  const veroFunction = globalThis.Function;
  const veroEval = globalThis.eval;
  let chiamate = 0;
  globalThis.Function = function spia() { chiamate += 1; throw new Error('Function chiamata'); };
  globalThis.eval = () => { chiamate += 1; throw new Error('eval chiamata'); };
  let lette = 0;
  try {
    let seme = 20261105;
    const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
    const alfabeto = ['a', 'b', '1', '2.5', '+', '-', '*', '/', '(', ')', ' ', '.', ';', '[', ']', '"', 'constructor', '__proto__',
      'f', ',', '=', '\u0000', '😀', '0', '\n'];
    for (let i = 0; i < 2000; i += 1) {
      const lunghezza = Math.floor(caso() * 40);
      let testo = '';
      for (let k = 0; k < lunghezza; k += 1) testo += alfabeto[Math.floor(caso() * alfabeto.length)];
      const r = leggiFormula(testo, ['a', 'b']);
      if (!(r instanceof Rotto)) {
        lette += 1;
        const x = calcola(r, { a: caso() * 10 - 5, b: 0 });
        assert.ok(x === null || Number.isFinite(x), testo);
      }
    }
  } finally {
    globalThis.Function = veroFunction;
    globalThis.eval = veroEval;
  }
  assert.equal(chiamate, 0);
  assert.ok(lette > 0, 'il fuzz produce anche formule valide, non solo rifiuti');
  const sorgente = readFileSync(new URL('../src/blocchi/formula.mjs', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(sorgente, /\beval\b|\bFunction\s*\(|\bwith\s*\(|\bimport\s*\(/);
  assert.doesNotMatch(sorgente, /^import .* from '(?!\.)/m, 'nessun pacchetto esterno');
});
