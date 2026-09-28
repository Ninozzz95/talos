import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  WorkflowCanonicalJsonError,
  canonicalHash,
  canonicalJson,
  validateCanonicalizable,
} from '../src/workflow/canonical-json.mjs';

const FIXTURE_ROOT = new URL('./fixtures/workflow/hashes/', import.meta.url);

async function fixture(name) {
  return JSON.parse(await readFile(new URL(name, FIXTURE_ROOT), 'utf8'));
}

test('JCS-RFC8785-VECTORS — canonical text and SHA-256 match the frozen RFC vectors', async () => {
  const vectors = await fixture('rfc8785-conformance-v1.json');
  for (const vector of vectors.cases) {
    assert.equal(canonicalJson(vector.input), vector.expectedCanonical, vector.id);
    assert.equal(canonicalHash(vector.input), `sha256:${vector.expectedSha256}`, vector.id);
  }
});

test('JCS-DEFINITION-HASH — insertion order and record metadata do not change the Core hash', async () => {
  const expectations = await fixture('hash-expectations-v1.json');
  for (const vector of expectations.cases) {
    const document = await fixture(vector.input);
    const selected = vector.select === '$.core' ? document.core : document;
    assert.equal(canonicalHash(selected), vector.expectedHash, vector.input);
  }
});

test('JCS-NESTED-ARRAYS — object members are recursively sorted without reordering arrays', () => {
  const value = {
    z: [{ z: 1, a: 2 }, 3, { beta: true, alpha: false }],
    a: 'first',
  };
  assert.equal(
    canonicalJson(value),
    '{"a":"first","z":[{"a":2,"z":1},3,{"alpha":false,"beta":true}]}',
  );
});

test('JCS-UNICODE-PRESERVED — canonicalization never normalizes Unicode text', () => {
  const composed = { value: '\u00e9' };
  const decomposed = { value: 'e\u0301' };
  assert.notEqual(canonicalJson(composed), canonicalJson(decomposed));
  assert.notEqual(canonicalHash(composed), canonicalHash(decomposed));
});

test('JCS-VALIDATION — accepted data is finite, plain, enumerable JSON state', () => {
  const shared = { ok: true };
  assert.doesNotThrow(() => validateCanonicalizable({
    null: null,
    boolean: false,
    number: 1.25,
    text: 'valore',
    array: [shared, shared],
    plainNullPrototype: Object.assign(Object.create(null), { value: 1 }),
  }));
});

test('WF-CANONICAL-5000-BOUNDED — 5000 node-shaped values fit while the traversal stays capped', () => {
  const node = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field${i}`, i]));
  assert.equal(validateCanonicalizable({ nodes: Array.from({ length: 5_000 }, () => node) }), true);
  assert.throws(() => validateCanonicalizable({ values: Array(500_000).fill(0) }), WorkflowCanonicalJsonError);
});

test('JCS-INVALID-NUMBERS — non-finite values and negative zero fail closed', () => {
  for (const value of [NaN, Infinity, -Infinity, -0]) {
    assert.throws(
      () => canonicalJson({ value }),
      (error) => error instanceof WorkflowCanonicalJsonError
        && error.code === 'WORKFLOW_CANONICAL_JSON_INVALID',
    );
  }
});

test('JCS-NON-JSON-VALUES — undefined, functions, symbols and BigInt fail closed at any depth', () => {
  for (const value of [
    undefined,
    () => {},
    Symbol('invalid'),
    1n,
    { nested: undefined },
    [1, undefined],
  ]) {
    assert.throws(() => canonicalJson(value), WorkflowCanonicalJsonError);
  }
});

test('JCS-UNICODE-INVALID — lone surrogates and Unicode noncharacters fail closed in keys and values', () => {
  for (const value of [
    { value: '\uDEAD' },
    { value: '\uFDD0' },
    { ['\uD800']: 'invalid key' },
  ]) {
    assert.throws(() => canonicalJson(value), WorkflowCanonicalJsonError);
  }
});

test('JCS-OBJECT-SHAPE — cycles, sparse arrays, accessors and hidden/symbol state fail closed', () => {
  const cyclic = {};
  cyclic.self = cyclic;

  const sparse = [];
  sparse[1] = 'value';

  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, 'value', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'secret';
    },
  });

  const hidden = { visible: true };
  Object.defineProperty(hidden, 'hidden', { enumerable: false, value: true });

  const symbolState = { visible: true };
  symbolState[Symbol('hidden')] = true;

  for (const value of [cyclic, sparse, accessor, hidden, symbolState, new Date(0), new Map()]) {
    assert.throws(() => canonicalJson(value), WorkflowCanonicalJsonError);
  }
  assert.equal(getterCalls, 0, 'la validazione non deve eseguire getter');
});
