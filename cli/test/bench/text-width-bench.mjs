#!/usr/bin/env node
/*
 * P-C / P-C2 bench — the TUI text helpers on a resume-sized load. NOT a pass/fail test: it prints numbers (the convention of
 * test/bench/session-list-bench.mjs). What it pins is the SPEED of the fast path in `text-width.ts`, which the unit test cannot see (a
 * fast path that is never taken gives the same output; test/tui/text-width-ascii-fast-path.test.ts proves the output and that the
 * grapheme segmenter is skipped, this proves the rest of the cost is gone too).
 *
 * Fixtures (seeded): 28,000 lines of 60-179 characters (about a long session's visible text) —
 *   ascii: printable ASCII only; prose: Italian prose with accents, typographic quotes, dashes, arrows and box drawing (the class of P-C2).
 * Measured 07/10/2026 on the owner's PC, best of 3, ms for the whole fixture, ascii line:
 *   wrapDisplay(100)   388 → 4      truncateDisplay(60)  354 → 5
 *   splitGraphemes     283 → 4      truncateMiddle(60)   515 → 5
 * Usage: node test/bench/text-width-bench.mjs
 */
import {performance} from 'node:perf_hooks';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const {wrapDisplay, splitGraphemes, truncateDisplay, truncateMiddle, displayWidth} = await import(pathToFileURL(join(root, 'src', 'tui', 'text-width.ts')).href);

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const ascii = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789 .,;:/\\-_()[]{}';
const prose = ascii + 'àèéìòùçñüßÆøÅ “”‘’—–…•→←│─▌█';
const lines = (alphabet) => Array.from({length: 28000}, () => Array.from({length: 60 + Math.floor(rnd() * 120)}, () => alphabet[Math.floor(rnd() * alphabet.length)]).join(''));
const best = (fn) => { fn(); let min = Infinity; for (let i = 0; i < 3; i++) { const t = performance.now(); fn(); min = Math.min(min, performance.now() - t); } return min; };
for (const [name, fixture] of [['ascii', lines(ascii)], ['prose', lines(prose)]]) {
  const rows = {
    'wrapDisplay(100)': () => { let n = 0; for (const l of fixture) n += wrapDisplay(l, 100).length; return n; },
    'wrapDisplay(40)': () => { let n = 0; for (const l of fixture) n += wrapDisplay(l, 40).length; return n; },
    'splitGraphemes': () => { let n = 0; for (const l of fixture) n += splitGraphemes(l).length; return n; },
    'displayWidth': () => { let n = 0; for (const l of fixture) n += displayWidth(l); return n; },
    'truncateDisplay(60)': () => { let n = 0; for (const l of fixture) n += truncateDisplay(l, 60).length; return n; },
    'truncateMiddle(60)': () => { let n = 0; for (const l of fixture) n += truncateMiddle(l, 60).length; return n; },
  };
  console.log(`-- ${name}`);
  for (const [label, fn] of Object.entries(rows)) console.log(label.padEnd(22), best(fn).toFixed(1).padStart(8), 'ms');
}
