import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildUi } from '../scripts/build-ui.mjs';
import { verifyUiManifest } from '../scripts/verify-ui-manifest.mjs';

async function sourceFixture() {
  const root = await mkdtemp(join(tmpdir(), 'talos-ui-source-'));
  await writeFile(join(root, 'index.html'), '<!doctype html>');
  await writeFile(join(root, 'app.js'), 'console.log("ok")');
  await writeFile(join(root, 'styles.css'), ':root{}');
  return root;
}

test('UI build produces a hash manifest and verification passes', async () => {
  const source = await sourceFixture(); const output = await mkdtemp(join(tmpdir(), 'talos-ui-dist-'));
  const manifest = await buildUi({ sourceDir: source, outputDir: output });
  assert.equal(manifest.files.length, 3);
  assert.equal((await verifyUiManifest({ distDir: output })).files.length, 3);
});

test('UI manifest fails closed when an asset changes after build', async () => {
  const source = await sourceFixture(); const output = await mkdtemp(join(tmpdir(), 'talos-ui-dist-'));
  await buildUi({ sourceDir: source, outputDir: output });
  await writeFile(join(output, 'app.js'), 'alterato');
  await assert.rejects(verifyUiManifest({ distDir: output }), /UI asset drift: app\.js/);
});
