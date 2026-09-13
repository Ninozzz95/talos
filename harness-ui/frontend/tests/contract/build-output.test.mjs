import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildProduction } from '../../scripts/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const publicFiles = ['index.html', 'app.js', 'styles.css'];

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function fingerprints(output) {
  const manifest = JSON.parse(await readFile(path.join(output, 'build-manifest.json'), 'utf8'));
  return Promise.all([
    'build-manifest.json',
    ...manifest.files.map((file) => file.path),
  ].map(async (name) => [name, await digest(path.join(output, ...name.split('/')))]));
}

test('PHASE1-BUILD-PARALLEL-01 produce un bundle ESM deterministico fuori da public', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-build-'));
  try {
    const publicBefore = await Promise.all(publicFiles.map((name) => digest(path.join(repoRoot, 'harness-ui/public', name))));
    await buildProduction({ outputDir: output });
    const first = await fingerprints(output);
    await buildProduction({ outputDir: output });
    const second = await fingerprints(output);
    assert.deepEqual(second, first);
    assert.deepEqual(await Promise.all(publicFiles.map((name) => digest(path.join(repoRoot, 'harness-ui/public', name)))), publicBefore);
    const html = await readFile(path.join(output, 'index.html'), 'utf8');
    assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/u);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
