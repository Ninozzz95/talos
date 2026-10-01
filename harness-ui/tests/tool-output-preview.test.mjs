import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolOutputPreview} from '../src/kernel/tool-output-preview.mjs';

test('OUTPUT11-BOUND: after the budget, no more pending text or clock activity can accumulate', () => {
  const deltas = []; let ticks = 0;
  const preview = createToolOutputPreview({onOutput: s => deltas.push(s), now: () => {ticks++; return 1000;}});
  preview.append('x'.repeat(40_000));
  assert.equal(ticks, 1);
  const chunk = 'y'.repeat(65_536);
  for (let i = 0; i < 1024; i++) preview.append(chunk);
  assert.equal(preview.snapshot().bufferedCodeUnits, 0, 'discarded preview text must not remain retained');
  preview.flush();
  assert.equal(ticks, 1);
  assert.deepEqual(deltas, ['x'.repeat(40_000)]);
  assert.deepEqual(preview.snapshot(), {receivedCodeUnits: 40_000 + 1024 * 65_536, emittedCodeUnits: 40_000, bufferedCodeUnits: 0, omittedCodeUnits: 1024 * 65_536, truncated: true});
});
test('OUTPUT11-LARGE-CHUNK: a single huge chunk never enters the pending buffer in full', () => {
  const preview = createToolOutputPreview({onOutput() {}, limit: 16, batchSize: 32, intervalMs: 1000, now: () => 0});
  preview.append('x'.repeat(1_000_000));
  assert.equal(preview.snapshot().bufferedCodeUnits, 16);
  assert.equal(preview.snapshot().omittedCodeUnits, 999_984);
  preview.flush();
  assert.equal(preview.snapshot().bufferedCodeUnits, 0);
});
test('OUTPUT11-PENDING: pending data consumes the same budget as already emitted data', () => {
  const deltas = [];
  const preview = createToolOutputPreview({onOutput: s => deltas.push(s), limit: 5, batchSize: 10, now: () => 0});
  preview.append('ab'); preview.append('cdef'); preview.append('must not return');
  assert.equal(preview.snapshot().bufferedCodeUnits, 5);
  preview.flush(); preview.flush();
  assert.deepEqual(deltas, ['abcde']);
});
test('OUTPUT11-COALESCE: size, time and final flush retain the historical delivery thresholds', () => {
  const deltas = []; let now = 0;
  const preview = createToolOutputPreview({onOutput: s => deltas.push(s), now: () => now});
  preview.append('a'); now = 119; preview.append('b');
  assert.deepEqual(deltas, []);
  now = 120; preview.append('c');
  assert.deepEqual(deltas, ['abc']);
  preview.append('x'.repeat(2047)); assert.equal(deltas.length, 1);
  preview.append('y'); assert.equal(deltas[1], 'x'.repeat(2047) + 'y');
  preview.append('last'); preview.flush(); preview.flush();
  assert.equal(deltas[2], 'last'); assert.equal(deltas.length, 3);
  assert.equal(preview.snapshot().truncated, false);
});
for (const [name, limit, expected] of [['EXCLUDE', 2, 'a'], ['INCLUDE', 3, 'a🙂'], ['ONLY-PAIR', 1, '']]) {
  test(`OUTPUT11-UNICODE-${name}: only complete Unicode characters are retained at the boundary`, () => {
    const deltas = [], input = name === 'ONLY-PAIR' ? '🙂z' : 'a🙂z';
    const preview = createToolOutputPreview({onOutput: s => deltas.push(s), limit});
    preview.append(input); preview.append('later'); preview.flush();
    assert.equal(deltas.join(''), expected);
    assert.ok(deltas.every(s => s.isWellFormed() && s.length > 0));
    assert.equal(preview.snapshot().bufferedCodeUnits, 0);
    assert.equal(preview.snapshot().omittedCodeUnits, input.length + 5 - expected.length);
  });
}
test('OUTPUT11-EXACT: equality with the cap is not falsely reported as truncation', () => {
  const preview = createToolOutputPreview({onOutput() {}, limit: 3});
  preview.append('abc'); preview.flush();
  assert.equal(preview.snapshot().truncated, false);
  preview.append('d'); assert.equal(preview.snapshot().truncated, true);
});
test('OUTPUT11-ZERO-EMPTY: disabled or silent previews never call the observer or clock', () => {
  for (const limit of [0, 40_000]) {
    const preview = createToolOutputPreview({onOutput: () => assert.fail('unexpected output'), now: () => assert.fail('unexpected clock'), limit});
    preview.append(''); preview.flush();
    if (limit === 0) {preview.append('ignored'); assert.equal(preview.snapshot().omittedCodeUnits, 7);}
  }
});
test('OUTPUT11-OBSERVER: a throwing observer never leaves buffered data to be delivered twice', () => {
  let calls = 0;
  const preview = createToolOutputPreview({onOutput: () => {calls++; throw Error('observer');}});
  assert.throws(() => preview.append('text'), /observer/);
  preview.flush(); assert.equal(calls, 1); assert.equal(preview.snapshot().bufferedCodeUnits, 0);
});
test('OUTPUT11-SNAPSHOT: mutating returned diagnostics cannot enlarge the budget', () => {
  const deltas = [];
  const preview = createToolOutputPreview({onOutput: s => deltas.push(s), limit: 3, now: () => 0});
  preview.append('ab'); const snapshot = preview.snapshot(); snapshot.bufferedCodeUnits = 0;
  preview.append('cd'); preview.flush(); assert.equal(deltas.join(''), 'abc');
});
test('OUTPUT11-INVALID: invalid configuration or non-text input fails before output', () => {
  for (const options of [{}, {onOutput: 1}, {onOutput() {}, limit: -1}, {onOutput() {}, limit: 1.5}, {onOutput() {}, batchSize: 0}, {onOutput() {}, intervalMs: -1}, {onOutput() {}, now: 1}]) {
    assert.throws(() => createToolOutputPreview(options), TypeError);
  }
  const preview = createToolOutputPreview({onOutput: () => assert.fail('unexpected output')});
  assert.throws(() => preview.append(null), TypeError);
});
