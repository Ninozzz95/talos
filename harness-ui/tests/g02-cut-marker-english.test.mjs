/*
 * G02 feature 10, lane R point 6 (desktop agreement 30/09/2026): the marker the MODEL reads where `uscitaUtile` cut the
 * middle of an output is English, in the same shape as the Q0 header (`[TALOS cut this output: …]`). The CLI is English;
 * the model read an Italian marker inside an English conversation. Nothing in the frontend parses it (desktop, checked).
 * Head and tail kept, the count of removed characters exact, short outputs untouched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {uscitaUtile, conIntestazioneDiTaglio} from '../src/kernel/talosHarness.mjs';

test('G02-10 the middle-cut marker is English and exact', () => {
  const text = 'A'.repeat(3_000) + 'B'.repeat(4_000) + 'C'.repeat(3_000);
  const cut = uscitaUtile(text, 4_000, 0.25);
  assert.ok(cut.includes('[TALOS cut 6000 characters from the middle of this output]'), cut.slice(900, 1_100));
  assert.doesNotMatch(cut, /tolti|caratteri|mezzo/u);
  assert.ok(cut.startsWith('A'.repeat(1_000)));
  assert.ok(cut.endsWith('C'.repeat(3_000)));
  assert.equal(uscitaUtile('short', 4_000), 'short');
  assert.match(conIntestazioneDiTaglio(text, cut), /^\[TALOS cut this output: 10000 characters were produced and 6000 were removed from the MIDDLE/u, 'the Q0 header is unchanged');
});
