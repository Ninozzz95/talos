import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProduction } from '../../scripts/build.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

test('PHASE1-ASSET-ALLOWLIST-01 copia esattamente font, licenze upstream e marchio', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-assets-'));
  try {
    await buildProduction({ outputDir: output });
    const manifest = JSON.parse(await readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
    assert.equal(manifest.schema, 'talos.desktop.assets.v1');
    // 26 dal 05/09: +3 di Prism (LICENSE, README, prism.js), che la pagina originale caricava e il template nuovo carica allo stesso modo.
    // 27 dal 06/09: +1 talos/browser-annota.js, l'overlay che il proxy locale inietta nella pagina viva (Browser oltre Hermes).
    // 30 dal 16/09 (P0-E, punto 9): +3 di shell-quote 1.10.0 (LICENSE, README di provenienza, parse.js),
    // il parser vendorizzato che veste la riga di comando nella colonna «Processi».
    assert.equal(manifest.files.length, 30);
    for (const nome of ['LICENSE-shell-quote', 'README.md', 'parse.js']) {
      assert.ok(manifest.files.some((item) => item.path === `vendor/shell-quote/${nome}`), `manca vendor/shell-quote/${nome}`);
    }
    assert.ok(manifest.files.some((item) => item.path === 'talos/browser-annota.js'));
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
    await rimuoviCartellaDiProvaAttesa(output);
  }
});
