#!/usr/bin/env node
/*
 * Derives the "simple narrow" class that src/tui/text-width.ts takes its fast path for (P-C2, 07/10/2026): the BMP code points of a few
 * candidate blocks that the runtime's own Intl.Segmenter calls ONE grapheme and string-width calls ONE column, plus, with --pairs, an
 * exhaustive check that no ordered pair of them joins into one grapheme. Prints the character-class source to paste in text-width.ts.
 * The unit test test/tui/text-width-ascii-fast-path.test.ts pins the class to the runtime on every run; this script is how it is rebuilt
 * when that test goes red after a Node/ICU or string-width upgrade.
 * Usage: node scripts/gen-simple-class.mjs [--pairs]   (--pairs: 3.4 million segmentations, about 6 s)
 */
import stringWidth from 'string-width';

const segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
const graphemes = (text) => { let count = 0; for (const _ of segmenter.segment(text)) count++; return count; };
/* ASCII printable; Latin-1 to spacing modifiers; Greek and Cyrillic; general punctuation; arrows and math; box drawing, blocks, shapes. */
const BLOCKS = [[0x20, 0x7e], [0xa0, 0x2ff], [0x370, 0x52f], [0x2010, 0x205e], [0x2190, 0x22ff], [0x2500, 0x25ff]];

const accepted = [];
for (const [from, to] of BLOCKS) for (let cp = from; cp <= to; cp++) {
  const ch = String.fromCodePoint(cp);
  if (graphemes(ch) === 1 && stringWidth(ch) === 1) accepted.push(cp);
}
console.log(`accepted ${accepted.length} code points`);

if (process.argv.includes('--pairs')) {
  let joining = 0;
  for (const a of accepted) for (const b of accepted) {
    if (graphemes(String.fromCodePoint(a) + String.fromCodePoint(b)) !== 2) { joining++; if (joining <= 10) console.log(`JOINS ${a.toString(16)} ${b.toString(16)}`); }
  }
  console.log(`${accepted.length * accepted.length} ordered pairs checked, ${joining} join`);
  if (joining) process.exitCode = 1;
}

const ranges = [];
for (const cp of accepted) { const last = ranges.at(-1); if (last && last[1] === cp - 1) last[1] = cp; else ranges.push([cp, cp]); }
const BACKSLASH = String.fromCharCode(92);
const escape = (n) => `${BACKSLASH}u${n.toString(16).toUpperCase().padStart(4, '0')}`;
console.log(ranges.map(([a, b]) => (a === b ? escape(a) : `${escape(a)}-${escape(b)}`)).join(''));
