import test from 'node:test';
import assert from 'node:assert/strict';
import {createZeroTestScanner} from '../src/kernel/zero-test-scanner.mjs';
import {provaSenzaTest} from '../src/kernel/talosHarness.mjs';

function scan(parts, code = 0) {
  const scanner = createZeroTestScanner();
  for (const part of parts) scanner.append(part);
  return scanner.finish(code);
}
const cases = ['', 'tests 0', '# tests 0\n', 'ℹ tests 0\r\n', '0 passing (2ms)',
  'Error: No test files found: x', 'No tests found', '10 passing', 'tests 01', 'xtests 0',
  'tests 0x\n', 'tests 0\nX', 'tests\n0', '#\r\n tests\t0', 'no\ntests found',
  '\ufeff# tests\u00a00\r', '\rtests 0', 'x\rtests 0', '\n\n#\n tests\n0\n',
  'x'.repeat(65) + '0 passing', 'x'.repeat(65) + ' 0 passing', 'x\ntests 0\nno tests found'];
test('OUTPUT17-SPLITS: all two-chunk splits and single code units match the existing oracle', () => {
  for (const text of cases) {
    const expected = provaSenzaTest(0, text);
    for (let i = 0; i <= text.length; i++) assert.equal(scan([text.slice(0, i), text.slice(i)]).zeroTests, expected, JSON.stringify({text, i}));
    assert.equal(scan(text.split('')).zeroTests, expected, text);
  }
});
test('OUTPUT17-EOF: chunk ending tests 0 is not an end of stream', () => {
  assert.equal(scan(['tests 0', '1']).zeroTests, false);
  assert.equal(scan(['tests 0', ' ', 'x']).zeroTests, false);
  assert.equal(scan(['tests 0', '\n', 'x']).zeroTests, true);
});
test('OUTPUT17-EXIT: nonzero/null process exits keep their meaning', () => {
  for (const exit of [1, 127, 130, 124, -1, null, undefined]) assert.equal(scan(['# tests 0\n'], exit ?? null).zeroTests, false);
});
test('OUTPUT17-QUOTE: normal first declared line is preserved, not paraphrased', () => {
  assert.equal(scan(['prefix\n  0 pass', 'ing (2ms)\r\nNo tests found']).declaration, '0 passing (2ms)');
  assert.equal(scan(['ℹ tests ', '0']).declaration, 'ℹ tests 0');
  assert.equal(scan(['tests\n0']).declaration, ''); // old split-lines quote cannot represent this odd multiline declaration
});
test('OUTPUT17-LONG: unbounded whitespace, middle declaration and long diagnostic', () => {
  const spaces = ' '.repeat(65_536);
  assert.equal(scan(['# tests', spaces, spaces, '0', spaces, '\n']).zeroTests, true);
  assert.equal(scan(['# tests', spaces, '01\n']).zeroTests, false);
  const result = scan(['x'.repeat(100_000), ' No tests found ', 'y'.repeat(100_000)]);
  assert.equal(result.zeroTests, true);
  assert.ok(result.declaration.length < 5_000);
  assert.match(result.declaration, /omitted/);
  assert.match(result.declaration, /No tests found/);
  assert.equal(scan(['before\n# tests 0\n', 'x'.repeat(500_000)]).zeroTests, true);
});
test('OUTPUT17-UNICODE-QUOTE: a long declaration never cuts a surrogate pair', () => {
  const result = scan(['x'.repeat(2_047) + '😀 No tests found ' + 'y'.repeat(5_000) + '😀' + 'z'.repeat(2_047)]);
  assert.equal(result.zeroTests, true);
  assert.equal(result.declaration.isWellFormed(), true);
});
test('OUTPUT17-DIFFERENTIAL: deterministic combinations preserve all four legacy declarations', () => {
  let seed = 0x170017;
  const random = n => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n;};
  const tokens = ['x', '\n', '\r', '\t', ' ', '\ufeff', '\u2028', '#', 'ℹ', 'tests', '0', '1', ' passing', 'No tests found', 'No test files found'];
  for (let n = 0; n < 4_000; n++) {
    let text = '';
    for (let i = 0; i < 20; i++) text += tokens[random(tokens.length)];
    const pieces = [];
    for (let offset = 0; offset < text.length;) {const size = 1 + random(13); pieces.push(text.slice(offset, offset += size));}
    assert.equal(scan(pieces).zeroTests, provaSenzaTest(0, text), JSON.stringify({n, text}));
  }
});
