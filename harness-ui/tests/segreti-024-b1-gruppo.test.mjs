/*
 * 0.2.4, block 1, item 7 (list item 90, judge v2030, reviewer of the cards R2): the card of several calls has a cap on the calls it lists.
 * With N=100 the first card weighed 439 KB and the cards answered one at a time 22 MB in all (each repeats the rest). Now at most
 * TETTO_CHIAMATE_DEL_GRUPPO calls travel, masked as before, `totale` stays every call and `nonMostrate` says the rest.
 * Red on bb6d3799a: `gruppoPerLaCarta` does not exist (the list was built inline with every member).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nucleo from '../src/kernel/talosHarness.mjs';

const membri = (n) => Array.from({ length: n }, (_, i) => ({ toolCallId: `c${i}`, argomenti: { title: `bug ${i}`, body: 'x'.repeat(4_000), api_key: `FINTO-chiave-${i}` } }));

test('B1-GRUPPO-01: 100 calls ⇒ 20 listed, 80 said, totale 100; each listed call masked as the card of one call', () => {
  assert.equal(typeof nucleo.gruppoPerLaCarta, 'function');
  assert.equal(nucleo.TETTO_CHIAMATE_DEL_GRUPPO, 20);
  const g = nucleo.gruppoPerLaCarta(membri(100));
  assert.equal(g.totale, 100);
  assert.equal(g.chiamate.length, 20);
  assert.equal(g.nonMostrate, 80);
  assert.deepEqual(g.chiamate.map((c) => c.toolCallId), Array.from({ length: 20 }, (_, i) => `c${i}`));
  assert.ok(!JSON.stringify(g).includes('FINTO'), 'no listed call carries its key');
});

test('B1-GRUPPO-02: up to the cap every call is listed and nothing is said about calls left out (the card of before)', () => {
  for (const n of [2, 3, 20]) {
    const g = nucleo.gruppoPerLaCarta(membri(n));
    assert.equal(g.chiamate.length, n);
    assert.equal(g.totale, n);
    assert.equal('nonMostrate' in g, false);
  }
  const g21 = nucleo.gruppoPerLaCarta(membri(21));
  assert.equal(g21.chiamate.length, 20);
  assert.equal(g21.nonMostrate, 1);
});

test('B1-GRUPPO-03: answered one at a time, the 99 cards of a group of 100 weigh under 10 MB in all (before: about 22 MB), each under 120 KB', () => {
  const tutti = membri(100);
  let inTutto = 0;
  let massimo = 0;
  for (let da = 0; da < 99; da += 1) {
    const peso = JSON.stringify(nucleo.gruppoPerLaCarta(tutti.slice(da))).length;
    inTutto += peso;
    massimo = Math.max(massimo, peso);
  }
  console.log(`# 99 cards: ${(inTutto / 1e6).toFixed(2)} MB in all, the largest ${(massimo / 1e3).toFixed(1)} KB`);
  assert.ok(inTutto < 10e6, String(inTutto));
  assert.ok(massimo < 120e3, String(massimo));
});
