import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  TALOS_DESIGN_TOKEN_GROUPS,
  TALOS_REQUIRED_DESIGN_TOKENS,
  assertTalosDesignTokens,
} from '../../src/design-system/token-contract.js';

const here = path.dirname(fileURLToPath(import.meta.url));

test('PHASE3-TOKEN-CONTRACT-01 — il vocabolario Calm è completo, unico e immutabile', () => {
  assert.deepEqual(Object.keys(TALOS_DESIGN_TOKEN_GROUPS), [
    'color', 'typography', 'space', 'radius', 'control', 'motion', 'focus', 'layer',
  ]);
  assert.equal(new Set(TALOS_REQUIRED_DESIGN_TOKENS).size, TALOS_REQUIRED_DESIGN_TOKENS.length);
  assert.ok(TALOS_REQUIRED_DESIGN_TOKENS.length >= 35);
  assert.ok(TALOS_REQUIRED_DESIGN_TOKENS.every((name) => /^--talos-[a-z0-9-]+$/u.test(name)));
  assert.equal(Object.isFrozen(TALOS_DESIGN_TOKEN_GROUPS), true);
  assert.equal(Object.isFrozen(TALOS_REQUIRED_DESIGN_TOKENS), true);
});

test('PHASE3-TOKEN-CONTRACT-01 — la validazione fallisce chiusa e nomina ogni token assente', () => {
  const values = new Map(TALOS_REQUIRED_DESIGN_TOKENS.map((name) => [name, 'ok']));
  const style = { getPropertyValue: (name) => values.get(name) || '' };
  assert.equal(assertTalosDesignTokens(style), true);
  const missing = TALOS_REQUIRED_DESIGN_TOKENS.at(-1);
  values.delete(missing);
  assert.throws(() => assertTalosDesignTokens(style), new RegExp(missing, 'u'));
  assert.throws(() => assertTalosDesignTokens(null), /stile calcolato/u);
});

test('PHASE3-TOKEN-CONTRACT-01 — le primitive consumano token e non colori o durate raw', async () => {
  const source = await readFile(path.resolve(here, '../../src/styles/primitives.css'), 'utf8');
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/iu);
  assert.doesNotMatch(source, /\b\d+(?:\.\d+)?m?s\b/iu);
  assert.match(source, /var\(--talos-/u);
});

