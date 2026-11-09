import assert from 'node:assert/strict';
import test from 'node:test';
import { chiaveScheda, creaSorveglianteScheda, percentile90 } from '../src/scheda-lenta.mjs';

const BASE = { modello: 'qwen3.8', scheda: 'RX 9070 XT', versione: 'b11669', finestra: 16_384, generati: 400 };
const ORA = Date.parse('2026-11-02T10:00:00Z');
const nuovo = (opzioni) => creaSorveglianteScheda({ adesso: () => ORA, ...opzioni });
const giri = (s, velocita, extra = {}) => velocita.map((tps) => s.registra({ ...BASE, ...extra, tokenPerSecondo: tps }));

test('SL-1 five long answers of history, then three under 80% of the 90th percentile: once «lenta», with the Mobile field', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  const [a, b, c] = giri(s, [31, 30, 32]);
  assert.equal(a.evento, null);
  assert.equal(b.evento, null);
  assert.equal(c.evento, 'lenta');
  assert.deepEqual(c.schedaLenta, { dalle: new Date(ORA).toISOString(), migliore: 41, adesso: 32, unita: 'token/s' });
  assert.deepEqual(s.corrente(), c.schedaLenta);
});

test('SL-2 the other way: one or two slow answers, or one slow among normal ones, say nothing', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  assert.deepEqual(giri(s, [31, 30, 40, 31, 30]).map((r) => r.evento), [null, null, null, null, null]);
  assert.equal(s.corrente(), null);
});

test('SL-3 no verdict before 5 long answers of history (Performance), and short answers never count', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40]);
  assert.deepEqual(giri(s, [20, 20, 20]).map((r) => r.evento), [null, null, null], 'four of history are not enough');
  const t = nuovo();
  giri(t, [40, 41, 42, 40, 39]);
  assert.deepEqual(giri(t, [10, 10, 10], { generati: 199 }).map((r) => r.evento), [null, null, null], 'under 200 generated tokens: not long');
});

test('SL-4 the reference is the 90th percentile, not the best: one lucky answer does not make the row fire', () => {
  const s = nuovo();
  giri(s, [40, 40, 40, 40, 40, 40, 40, 40, 40, 90]);
  assert.equal(giri(s, [34, 34, 34]).at(-1).evento, null, '34 is above 80% of 40; it would be under 80% of the lucky 90');
  assert.equal(Math.round(percentile90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) * 10) / 10, 9.1);
  assert.ok(percentile90([40, 40, 40, 40, 90]) < 90, 'sixth review C1: with 5 answers it is not the maximum');
  assert.equal(percentile90([]), null);
});

test('SL-5 hysteresis: the row goes away after 2 answers in a row above 90%, not after one', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  giri(s, [30, 30, 30]);
  assert.equal(giri(s, [39]).at(-1).evento, null, 'one above 90%: still slow');
  assert.ok(s.corrente());
  assert.equal(giri(s, [30]).at(-1).evento, null, 'a slow one resets the count');
  const [, ultima] = giri(s, [39, 40]);
  assert.equal(ultima.evento, 'tornata');
  assert.equal(s.corrente(), null);
});

test('SL-6 once per start: after it came back, a new drop keeps the field but sends no second «lenta»', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  giri(s, [30, 30, 30]);
  giri(s, [40, 40]);
  const di = giri(s, [30, 30, 30]);
  assert.equal(di.some((r) => r.evento === 'lenta'), false);
  assert.ok(s.corrente(), 'the field still says it');
});

test('SL-7 a much longer window is not a slow card: only answers with a window within double are compared', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  assert.deepEqual(giri(s, [25, 25, 25], { finestra: 65_536 }).map((r) => r.evento), [null, null, null]);
  assert.equal(s.corrente(), null);
});

test('SL-8 another model, card or engine version has its own history', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  for (const altro of [{ modello: 'gemma4' }, { scheda: 'altra' }, { versione: 'b11960' }]) {
    assert.equal(giri(s, [20, 20, 20], altro).at(-1).evento, null, JSON.stringify(altro));
  }
  assert.notEqual(chiaveScheda(BASE), chiaveScheda({ ...BASE, versione: 'b11960' }));
});

test('SL-9 the history survives a restart through leggi/scrivi; a broken file starts empty; a failing write never throws', () => {
  let disco = null;
  const prima = nuovo({ scrivi: (d) => { disco = JSON.parse(JSON.stringify(d)); } });
  giri(prima, [40, 41, 42, 40, 39]);
  const dopo = nuovo({ leggi: () => disco });
  assert.equal(giri(dopo, [30, 30, 30]).at(-1).evento, 'lenta', 'the reference came from the file');
  assert.doesNotThrow(() => nuovo({ leggi: () => { throw new Error('rotto'); } }));
  const rotta = nuovo({ leggi: () => [1, 2], scrivi: () => { throw new Error('disco pieno'); } });
  assert.doesNotThrow(() => giri(rotta, [40]));
});

test('SL-11 the measured speed of a model: 90th percentile of its long answers, on the most used card; null before the first one', () => {
  const s = nuovo();
  assert.equal(s.velocitaMisurata('qwen3.8'), null);
  giri(s, [40, 41, 42, 40, 39, 38, 43, 40, 41, 44]);
  giri(s, [20, 21], { scheda: 'altra' });
  assert.deepEqual(s.velocitaMisurata('qwen3.8'), { tokenPerSecondo: 43, risposte: 10, unita: 'token/s' });
  assert.equal(s.velocitaMisurata('qwen3'), null, 'a model whose name is the start of another is another model');
  giri(s, [10], { generati: 50 });
  assert.equal(s.velocitaMisurata('qwen3.8').risposte, 10, 'short answers never count');
});

test('SL-12 sixth review C2 and C4: three slow answers across two windows are not three; the field belongs to the model asked about', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  giri(s, [40, 41, 42, 40, 39], { finestra: 4_096 });
  giri(s, [30, 30], { finestra: 16_384 });
  assert.equal(giri(s, [30], { finestra: 4_096 }).at(-1).evento, null, 'the third slow one has another window: the count starts again');
  const t = nuovo();
  giri(t, [40, 41, 42, 40, 39]);
  giri(t, [30, 30, 30]);
  assert.ok(t.corrente('qwen3.8'));
  assert.equal(t.corrente('gemma4'), null, 'another model open: no stale field');
});

test('SL-10 nonsense speeds are ignored', () => {
  const s = nuovo();
  giri(s, [40, 41, 42, 40, 39]);
  assert.deepEqual(giri(s, [Number.NaN, 0, -3, Infinity]).map((r) => r.evento), [null, null, null, null]);
  assert.equal(giri(s, [30, 30, 30]).at(-1).evento, 'lenta', 'they did not enter the last three');
});
