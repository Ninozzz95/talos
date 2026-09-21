import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileProduzione, verificaImpronta, inventario } from '../scripts/prepara-pacchetto.mjs';

test('R02-INTEGRITA — impronta alterata blocca il pacchetto', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r02-hash-'));
  const file = join(dir, 'asset.zip'); writeFileSync(file, 'abc');
  await verificaImpronta(file, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(verificaImpronta(file, '0'.repeat(64)), /SHA256/);
});

test('R02-SELEZIONE — niente prove, mappe, modelli, segreti o junction nei sorgenti', async () => {
  for (const file of ['kernel/talosHarness.mjs', 'node/migrations/001-context.sql', 'assets/index.js', 'talos/brand/logo-short.svg']) assert.equal(fileProduzione(file), true, file);
  for (const file of ['kernel/talosHarness.test.mjs', 'a.spec.mjs', 'tests/a.mjs', '.env', 'a.gguf', 'scratch/a.mjs', 'bundle.js.map']) assert.equal(fileProduzione(file), false, file);
  const dir = mkdtempSync(join(tmpdir(), 'talos-r02-link-'));
  mkdirSync(join(dir, 'esterno')); mkdirSync(join(dir, 'radice'));
  symlinkSync(join(dir, 'esterno'), join(dir, 'radice', 'link'), 'junction');
  await assert.rejects(inventario(join(dir, 'radice')), /collegamento/i);
});

test('R02-MANIFEST — nomi ordinati, byte e impronte per ogni file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-r02-manifest-'));
  writeFileSync(join(dir, 'z.txt'), 'abc'); writeFileSync(join(dir, 'a.txt'), 'x');
  const files = await inventario(dir);
  assert.deepEqual(files.map(f => f.path), ['a.txt', 'z.txt']);
  assert.equal(files[1].bytes, 3);
  assert.equal(files[1].sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
