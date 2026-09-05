import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProduction } from '../../scripts/build.mjs';

test('PHASE1-ASSET-ALLOWLIST-01 copia esattamente font, licenze upstream e marchio', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-assets-'));
  try {
    await buildProduction({ outputDir: output });
    const manifest = JSON.parse(await readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
    assert.equal(manifest.schema, 'talos.desktop.assets.v1');
    // 26 dal 05/09: +3 di Prism (LICENSE, README, prism.js), che la pagina originale caricava e il template nuovo carica allo stesso modo.
    assert.equal(manifest.files.length, 26);
    assert.ok(manifest.files.some((item) => item.path === 'vendor/prism/prism.js'));
    assert.deepEqual(manifest.files.map((item) => item.path), [...manifest.files.map((item) => item.path)].sort());
    assert.ok(manifest.files.every((item) => item.bytes > 0 && /^[a-f0-9]{64}$/u.test(item.sha256)));
    for (const license of ['LICENSE-addon-fit', 'LICENSE-addon-webgl', 'LICENSE-xterm']) {
      assert.ok(manifest.files.some((item) => item.path === `vendor/xterm/${license}`));
    }
    assert.ok(manifest.files.some((item) => item.path === 'vendor/tanstack/LICENSE-virtual-core'));
    for (const license of ['LICENSE-dom', 'LICENSE-core', 'LICENSE-utils']) {
      assert.ok(manifest.files.some((item) => item.path === `vendor/floating-ui/${license}`));
    }
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
