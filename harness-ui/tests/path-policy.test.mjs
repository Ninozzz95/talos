import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { PathPolicyError, isPathInside } from '../src/path-policy.mjs';

/*
 * ⛔⛔⛔ 30/8 — questo file testava `createPathPolicy()` (5 test, tutti su
 * campagne TALOS-BANCO) — rimossa insieme al resto della lettura delle
 * campagne (piano "Board — da campagne TALOS-BANCO a cruscotto sessioni").
 * `isPathInside`/`PathPolicyError` restano vive (usate da
 * workspace-files.mjs/workspace-tree.mjs per il containment del
 * workspace) ma non avevano MAI un test proprio, solo indiretto via
 * createPathPolicy — questi test lo colmano, non solo lo spostano.
 */

test('isPathInside: un discendente reale è dentro la radice', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, join(root, 'sotto', 'file.txt')), true);
});

test('isPathInside: la radice stessa è dentro se stessa', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, root), true);
});

test('isPathInside AL CONTRARIO: ".." fuori dalla radice è rifiutato', () => {
  const root = resolve('/tmp/talos-radice');
  assert.equal(isPathInside(root, resolve(root, '..', 'fuori.txt')), false);
});

test('isPathInside AL CONTRARIO: un fratello con lo stesso prefisso testuale non è "dentro"', () => {
  // ⛔ il bug classico del containment ingenuo: confrontare le stringhe
  // farebbe passare "/tmp/talos-radice-evil" come "dentro"
  // "/tmp/talos-radice" perché il prefisso combacia — isPathInside usa
  // `relative()`, non un prefisso di stringa, e deve rifiutarlo.
  const root = resolve('/tmp/talos-radice');
  const sibling = resolve('/tmp/talos-radice-evil/file.txt');
  assert.equal(isPathInside(root, sibling), false);
});

test('PathPolicyError: nome e codice di default corretti', () => {
  const errore = new PathPolicyError('percorso non ammesso');
  assert.equal(errore.name, 'PathPolicyError');
  assert.equal(errore.code, 'PATH_NOT_ALLOWED');
  assert.ok(errore instanceof Error);
});

test('PathPolicyError: un codice esplicito sovrascrive il default', () => {
  const errore = new PathPolicyError('non inizializzata', 'CONFIG_INVALID');
  assert.equal(errore.code, 'CONFIG_INVALID');
});
