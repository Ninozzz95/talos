/*
 * 0.2.4, block 1, round 2, item D (reviewer: M21 is NOT equivalent). After a name that is a secret or AMBIGUOUS (`tokens`, `pass` in text),
 * the last word is held while it arrives: `tokens: 98765FINTO` must not show «98765» for one frame (the digits alone would be read as a
 * counter and stay readable). With the after-name condition removed (M21) one frame shows it; with the quote before the tail not allowed
 * (the reviewer's R11) `tokens: "98765…` would show. The stream is cut at EVERY character. Fake secrets only.
 * Red: on the M21 and R11 mutants (copy C:/T/024-b1-mut), green on the head.
 * Not here, on the list: a value stuck to `=` (`tokens=4242FINTO`, one frame, the same on the base: the reviewer's yellow 1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { oscuraFormeDiSegreto, oscuraTestoInArrivo } from '../src/forme-di-segreto.mjs';

const CASI = [
  ['tokens: 98765FINTOq7Zt next', '98765'], ['tokens: "98765FINTOq7Zt" next', '98765'], ["tokens: '98765FINTOq7Zt' next", '98765'],
  ['pass: 1234FINTOq7Zt next', '1234'], ['DB_PASSWORD: 4242FINTOq7Zt next', '4242'], ['access_tokens: 777FINTOq7Zt next', '777'],
];

test('B1-FLUSSO-M21: after a secret or ambiguous name the digits that start a secret never show while it arrives', () => {
  for (const [testo, pezzo] of CASI) {
    assert.ok(!oscuraFormeDiSegreto(testo).includes(pezzo), `${testo}: masked when whole`);
    for (let n = 1; n <= testo.length; n += 1) {
      const fuori = oscuraTestoInArrivo(testo.slice(0, n));
      assert.ok(!fuori.includes(pezzo) && !fuori.includes('FINTO'), `${testo} cut at ${n}: ${fuori}`);
    }
  }
});

test('B1-FLUSSO-M21-02: an honest counter is shown once it is complete, and a plain word after an honest name is not held', () => {
  assert.equal(oscuraTestoInArrivo('tokens: 98765 next'), 'tokens: 98765 next');
  assert.equal(oscuraTestoInArrivo('max_tokens: 4096'), 'max_tokens: 4096', 'a counter name does not hold');
  assert.equal(oscuraTestoInArrivo('name: build'), 'name: build');
  assert.equal(oscuraTestoInArrivo('tokens: 98765'), 'tokens: …', 'an ambiguous name holds its last word until it closes');
});
