import assert from 'node:assert/strict';
import test from 'node:test';

import { testoDelModello } from '../src/blocchi/testo-del-modello.mjs';

const ESC = '\u001b';

test('OSC 52 in una cella: nessun ESC, nessun BEL, nessun controllo resta', () => {
  const fuori = testoDelModello(`${ESC}]52;c;Y2lhbw==\u0007ciao`);
  assert.equal(fuori, ']52;c;Y2lhbw==ciao');
  assert.equal(/\p{Cc}/u.test(fuori), false);
});

test('tutti i controlli C0, DEL e C1 tolti, anche il titolo e OSC 8 del terminale', () => {
  let tutti = '';
  for (let c = 0; c < 0x20; c += 1) tutti += String.fromCharCode(c);
  tutti += '\u007f';
  for (let c = 0x80; c < 0xa0; c += 1) tutti += String.fromCharCode(c);
  const fuori = testoDelModello(`a${tutti}b`, { righe: 'piu' });
  assert.equal(/\p{Cc}/u.test(fuori.replace(/\n/g, () => '')), false);
  assert.equal(testoDelModello(`${ESC}]0;titolo finto${ESC}\\x`), ']0;titolo finto\\x');
  assert.equal(testoDelModello(`${ESC}]8;;https://x.y${ESC}\\link${ESC}]8;;${ESC}\\`), ']8;;https://x.y\\link]8;;\\');
  assert.equal(testoDelModello('a\u009bb\u009dc'), 'abc');
});

test('invisibili, direzione e tag tolti: U+202E, U+200B, U+E0041', () => {
  assert.equal(testoDelModello('a\u202Eb'), 'ab');
  assert.equal(testoDelModello('a\u200Bb'), 'ab');
  assert.equal(testoDelModello('a\u{E0041}\u{E0042}b'), 'ab');
  for (const c of ['\u200C', '\u200D', '\u200E', '\u200F', '\u2060', '\u2064', '\u2066', '\u2067', '\u2068', '\u2069', '\u202A', '\u202B', '\u202C', '\u202D', '\uFEFF', '\u00AD', '\u061C', '\u180E', '\u034F', '\u115F', '\u1160', '\u3164', '\uFFA0', '\uFE00', '\uFE0D', '\u{E0100}', '\u{E01EF}', '\u{E007F}', '\u{E0001}']) {
    assert.equal(testoDelModello(`x${c}y`), 'xy', `U+${c.codePointAt(0).toString(16)}`);
  }
});

test('surrogati soli tolti, coppie valide e presentazione emoji tenute', () => {
  assert.equal(testoDelModello('a\uD800b\uDC00c'), 'abc');
  assert.equal(testoDelModello('ok 😀\uFE0F'), 'ok 😀\uFE0F');
});

test('$& e gli altri segni delle sostituzioni restano intatti', () => {
  assert.equal(testoDelModello("a$&b$1$$c$'d$`"), "a$&b$1$$c$'d$`");
  assert.equal(testoDelModello("a$&\n$'", { righe: 'piu' }), "a$&\n$'");
  assert.equal(testoDelModello('$&'.repeat(10), { massimo: 5 }), '$&$&…');
});

test('una riga: ogni a capo diventa uno spazio, gli spazi si stringono', () => {
  assert.equal(testoDelModello('riga uno\nriga due'), 'riga uno riga due');
  assert.equal(testoDelModello('a\r\nb\rc\u2028d\u2029e\u0085f'), 'a b c d e f');
  assert.equal(testoDelModello('  a \t\t b  '), 'a b');
  assert.equal(testoDelModello('a\u00A0\u3000b'), 'a b');
});

test('più righe: a capo tenuti, al massimo una riga vuota, tab come spazio', () => {
  assert.equal(testoDelModello('a\r\n\n\n\nb\t c  \n', { righe: 'piu' }), 'a\n\nb c');
  assert.equal(testoDelModello('a\u2028b', { righe: 'piu' }), 'a\nb');
  assert.equal(testoDelModello('a\n\n\nb', { righe: 'piu' }), 'a\n\nb');
  assert.equal(testoDelModello('a\tb'), 'a b');
  assert.equal(testoDelModello('  rientro\n  secondo', { righe: 'piu' }), 'rientro\nsecondo');
});

test('tetto di lunghezza in punti di codice, con «…» e senza spezzare un emoji', () => {
  assert.equal(testoDelModello('abcdef', { massimo: 4 }), 'abc…');
  assert.equal(testoDelModello('abcd', { massimo: 4 }), 'abcd');
  assert.equal(testoDelModello('😀😀😀😀😀', { massimo: 3 }), '😀😀…');
  assert.equal(testoDelModello('ab   cdef', { massimo: 4 }), 'ab…');
  assert.equal(testoDelModello('x'.repeat(5_000_000), { massimo: 10 }), `${'x'.repeat(9)}…`);
  assert.equal(testoDelModello('a'.repeat(300)).length, 200, 'tetto di serie 200');
});

test('un testo enorme di soli invisibili non lascia passare la coda oltre il tetto', () => {
  const fuori = testoDelModello(`${'\u200B'.repeat(100_000)}segreto`, { massimo: 20 });
  assert.equal(fuori, '…', 'il testo è stato tagliato prima di pulirlo: lo si dice');
});

test('mai lancia: valori non testuali danno stringa vuota, opzioni strane il comportamento di serie', () => {
  for (const v of [undefined, null, 3, {}, [], Symbol('x'), 10n]) {
    assert.equal(testoDelModello(v), '');
  }
  assert.equal(testoDelModello('x', null), 'x');
  assert.equal(testoDelModello('a\nb', { righe: 'boh' }), 'a b');
  assert.equal(testoDelModello('abc', { massimo: -1 }), 'abc');
  assert.equal(testoDelModello('abc', { massimo: Number.NaN }), 'abc');
});

test('testo già pulito: identico in entrata e in uscita', () => {
  const pulito = 'Vendite di marzo: 1.200 € (+3%) — ok';
  assert.equal(testoDelModello(pulito), pulito);
});
