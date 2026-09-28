import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  putResultBytes,
  readResultBytes,
  verifyResultBytes,
} from '../src/workflow/result-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function rootFor(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-workflow-cas-'));
  t.after(() => rimuoviCartellaDiProva(root));
  return root;
}

test('RESULT-CAS-CONTENT-ADDRESS — bytes publish once, dedupe and reread exactly', async (t) => {
  const root = rootFor(t);
  const bytes = Buffer.from('TALOS result bytes\0\xff', 'utf8');
  const first = await putResultBytes({ workflowDataRoot: root, bytes, maxBytes: 1024 });
  const second = await putResultBytes({ workflowDataRoot: root, bytes: new Uint8Array(bytes), maxBytes: 1024 });
  assert.deepEqual(second, first);
  assert.equal(first.sha256, `sha256:${digest(bytes)}`);
  assert.match(first.storageKey, /^cas\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}$/u);
  assert.deepEqual(await readResultBytes({ workflowDataRoot: root, sha256: first.sha256, maxBytes: 1024 }), bytes);
  assert.equal(await verifyResultBytes({ workflowDataRoot: root, sha256: first.sha256, maxBytes: 1024 }), true);
});

test('M018_RESULT_HASH_MISMATCH_ACCEPTED — corrupt bytes never pass read or verification', async (t) => {
  const root = rootFor(t);
  const stored = await putResultBytes({ workflowDataRoot: root, bytes: Buffer.from('original'), maxBytes: 1024 });
  const path = join(root, ...stored.storageKey.split('/'));
  writeFileSync(path, 'tampered', 'utf8');
  await assert.rejects(
    () => readResultBytes({ workflowDataRoot: root, sha256: stored.sha256, maxBytes: 1024 }),
    (error) => error?.code === 'WORKFLOW_RESULT_CORRUPT',
  );
  await assert.rejects(
    () => verifyResultBytes({ workflowDataRoot: root, sha256: stored.sha256, maxBytes: 1024 }),
    (error) => error?.code === 'WORKFLOW_RESULT_CORRUPT',
  );
});

test('RESULT-CAS-LIMIT — caller must provide and obey an explicit per-item byte limit', async (t) => {
  const root = rootFor(t);
  await assert.rejects(
    () => putResultBytes({ workflowDataRoot: root, bytes: Buffer.alloc(2) }),
    (error) => error?.code === 'WORKFLOW_LIMIT_EXCEEDED',
  );
  await assert.rejects(
    () => putResultBytes({ workflowDataRoot: root, bytes: Buffer.alloc(2), maxBytes: 1 }),
    (error) => error?.code === 'WORKFLOW_LIMIT_EXCEEDED',
  );
});

test('M065_CAS_ORPHAN_PROMOTED_AS_RESULT — an on-disk blob has no inferred ResultRef identity', async (t) => {
  const root = rootFor(t);
  const bytes = Buffer.from('orphan');
  const hex = digest(bytes);
  const directory = join(root, 'cas', 'sha256', hex.slice(0, 2));
  await mkdir(directory, { recursive: true });
  writeFileSync(join(directory, hex), bytes);
  const reread = await readResultBytes({ workflowDataRoot: root, sha256: `sha256:${hex}`, maxBytes: 1024 });
  assert.deepEqual(reread, bytes, 'CAS may read addressed bytes');
  assert.equal(readFileSync(join(directory, hex)).equals(bytes), true);
  assert.equal('resultRef' in reread, false, 'raw bytes cannot manufacture logical metadata');
});

test('RESULT-CAS-PATH — logical sha256 prefix and unsafe text never become caller-selected paths', async (t) => {
  const root = rootFor(t);
  await assert.rejects(
    () => readResultBytes({ workflowDataRoot: root, sha256: 'sha256:../escape', maxBytes: 1024 }),
    (error) => error?.code === 'WORKFLOW_RESULT_NOT_FOUND',
  );
});

test('RESULT-CAS-REPARSE — a symlink or junction cannot redirect CAS publication outside its root', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'talos-result-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'talos-result-outside-'));
  try {
    symlinkSync(outside, join(root, 'cas'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    rimuoviCartellaDiProva(root);
    rimuoviCartellaDiProva(outside);
    t.skip(`platform cannot create the test alias: ${error.code ?? error.message}`);
    return;
  }
  t.after(() => { rimuoviCartellaDiProva(root); rimuoviCartellaDiProva(outside); });
  await assert.rejects(
    () => putResultBytes({ workflowDataRoot: root, bytes: Buffer.from('must stay contained'), maxBytes: 1024 }),
    (error) => error?.code === 'WORKFLOW_STORE_LOCATION_INVALID',
  );
  assert.equal(existsSync(join(outside, 'sha256')), false);
});
