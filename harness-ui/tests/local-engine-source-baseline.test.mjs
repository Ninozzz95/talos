import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureSourceBaseline, sourceFingerprint } from '../scripts/local-engine-source-baseline.mjs';

test('source provenance uses Git blob hashing, including UTF-8 byte length', () => {
  assert.equal(sourceFingerprint(Buffer.from('test content\n')).gitBlobSha, 'd670460b4b4aece5915caf5c68d12f560a9fe3e4');
  assert.equal(sourceFingerprint(Buffer.from('caffè')).bytes, 6);
  assert.throws(() => sourceFingerprint('text'), TypeError);
});

test('provenance is deterministic, deduplicated and never a speed measurement', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-provenance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'a.mjs'), 'export const a = 1;\n');
  await writeFile(join(root, 'b.mjs'), 'export const b = 2;\n');
  const a = await captureSourceBaseline({ root, paths: ['b.mjs', 'a.mjs', 'a.mjs'] });
  const b = await captureSourceBaseline({ root, paths: ['a.mjs', 'b.mjs'] });
  assert.deepEqual(a.sources, b.sources);
  assert.equal(a.sources.length, 2);
  assert.equal(a.realInference, false);
  assert.equal(a.gitSha, null);
  assert.equal(Object.hasOwn(a, 'ttftMs'), false);
  assert.equal(Object.hasOwn(a, 'environment'), false);
});

test('incomplete snapshots and paths outside the root fail explicitly', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'talos-provenance-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(captureSourceBaseline({ root, paths: ['missing.mjs'] }), { code: 'ENOENT' });
  await assert.rejects(captureSourceBaseline({ root, paths: ['../outside.mjs'] }), TypeError);
  await assert.rejects(captureSourceBaseline({ root, paths: [join(root, 'absolute.mjs')] }), TypeError);
});
