import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProduction } from '../../scripts/build.mjs';
import { PDFJS_CMAPS, PDFJS_DECODIFICATORI_JS, PDFJS_FONT_STANDARD, PDFJS_LICENZE } from '../../../src/pdfjs-risorse.mjs';
import { createStaticHandler } from '../../../src/static-files.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

test('PHASE1-ASSET-ALLOWLIST-01 copia esattamente font, licenze upstream e marchio', async (t) => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-assets-'));
  try {
    await buildProduction({ outputDir: output });
    await t.test('F5-VENDOR-LICENSE-BYTES-019 conserva nel repository i byte dichiarati dal manifest', async () => {
      const bytes = await readFile(path.join(output, 'vendor/lettore/LICENSE-docx-preview'));
      const cwd = path.resolve(import.meta.dirname, '../../../..');
      const oid = (args) => execFileSync('git', ['hash-object', ...args, '--stdin'], {
        cwd, input: bytes, encoding: 'utf8',
      }).trim();
      assert.equal(
        oid(['--path=harness-ui/public/vendor/lettore/LICENSE-docx-preview']),
        oid(['--no-filters']),
        'Git non deve normalizzare i byte della licenza usati dal build-manifest',
      );
    });
    const manifest = JSON.parse(await readFile(path.join(output, 'asset-manifest.json'), 'utf8'));
    assert.equal(manifest.schema, 'talos.desktop.assets.v1');
    // 26 dal 05/09: +3 di Prism (LICENSE, README, prism.js), che la pagina originale caricava e il template nuovo carica allo stesso modo.
    // 27 dal 06/09: +1 talos/browser-annota.js, l'overlay che il proxy locale inietta nella pagina viva (Browser oltre Hermes).
    // 30 dal 16/09 (P0-E, punto 9): +3 di shell-quote 1.10.0 (LICENSE, README di provenienza, parse.js),
    // il parser vendorizzato che veste la riga di comando nella colonna «Processi».
    // Due licenze aggiunte dal layout reale del grafo, senza rimuovere asset precedenti.
    // 35 dal 26/09 (refactor dei grafi): +3 — il worker di elkjs, la sua licenza e quella di @xyflow/system.
    // 52 dal 26/09 (F5 File reader): +17 — le licenze delle rese Office (anche le otto MIT che pptx-viewer-core porta nel
    // bundle) e il NOTICE di pptx-viewer-core (Apache-2.0 §4(d)).
    // 55 dal 27/09 (ATLAS F3, owner: «prima pagina con pdf.js»): +3 — pdfjs-dist 6.3.289, la libreria, il worker e la licenza.
    // 246 dal 27/09 sera (ATLAS F3, owner: «aggiungi le risorse»): +191 — 168 CMap, 14 font standard, 2 decodificatori
    // JPEG2000/JBIG2 in versione JS e 7 licenze, dall'elenco unico `src/pdfjs-risorse.mjs`.
    assert.equal(manifest.files.length, 55 + PDFJS_CMAPS.length + PDFJS_FONT_STANDARD.length + PDFJS_DECODIFICATORI_JS.length + PDFJS_LICENZE.length);
    assert.equal(manifest.files.length, 246);
    const pdfjs = [
      ['vendor/pdfjs/pdf.min.mjs', 'build/pdf.min.mjs'],
      ['vendor/pdfjs/pdf.worker.min.mjs', 'build/pdf.worker.min.mjs'],
      ['vendor/pdfjs/LICENSE-pdfjs', 'LICENSE'],
      ...PDFJS_CMAPS.map((nome) => [`vendor/pdfjs/cmaps/${nome}`, `cmaps/${nome}`]),
      ...PDFJS_FONT_STANDARD.map((nome) => [`vendor/pdfjs/standard_fonts/${nome}`, `standard_fonts/${nome}`]),
      ...PDFJS_DECODIFICATORI_JS.map((nome) => [`vendor/pdfjs/wasm/${nome}`, `wasm/${nome}`]),
      ...PDFJS_LICENZE.map(([cartella, nome]) => [`vendor/pdfjs/${cartella}/${nome}`, `${cartella}/${nome}`]),
    ];
    // Byte per byte quelli del pacchetto ufficiale — TUTTI, worker compreso (revisione Codex 27/09, rilievo 17: prima il
    // worker aveva solo presenza e metadati). Una sostituzione di un file vendorizzato deve far cadere questa prova.
    for (const [copiato, originale] of pdfjs) {
      assert.ok(manifest.files.some((item) => item.path === copiato), `manca ${copiato}`);
      assert.ok((await readFile(path.join(output, ...copiato.split('/')))).equals(await readFile(new URL(`../../node_modules/pdfjs-dist/${originale}`, import.meta.url))), `${copiato} diverso dal pacchetto`);
    }
    // E il server serve esattamente ciò che il build copia (la lista chiusa di `static-files.mjs`): un file copiato e non
    // servito darebbe un'anteprima incompleta senza un errore a schermo.
    const servito = createStaticHandler(output);
    for (const [copiato] of pdfjs.filter(([p]) => !/LICENSE/u.test(p))) {
      assert.equal((await servito(`/${copiato}`))?.statusCode, 200, `il server non serve /${copiato}`);
    }
    for (const nome of ['LICENSE-docx-preview', 'LICENSE-dompurify', 'LICENSE-pptx-viewer-core', 'NOTICE-pptx-viewer-core', 'LICENSE-mtx-decompressor', 'LICENSE-emf-converter', 'LICENSE-jszip', 'LICENSE-pako', 'LICENSE-xlsx',
      'LICENSE-anynum', 'LICENSE-fast-xml-builder', 'LICENSE-fast-xml-parser', 'LICENSE-is-unsafe', 'LICENSE-path-expression-matcher', 'LICENSE-strnum', 'LICENSE-utif', 'LICENSE-xml-naming']) {
      assert.ok(manifest.files.some((item) => item.path === `vendor/lettore/${nome}`), `manca vendor/lettore/${nome}`);
    }
    assert.match(await readFile(path.join(output, 'vendor/lettore/NOTICE-pptx-viewer-core'), 'utf8'), /mtx-decompressor[\s\S]*Mozilla Public License 2\.0/u);
    for (const percorso of ['vendor/elk/elk-worker.min.js', 'vendor/elk/LICENSE-elkjs', 'vendor/xyflow/LICENSE-system']) {
      assert.ok(manifest.files.some((item) => item.path === percorso), `manca ${percorso}`);
    }
    assert.equal(await readFile(path.join(output, 'vendor/elk/elk-worker.min.js'), 'utf8'), await readFile(new URL('../../node_modules/elkjs/lib/elk-worker.min.js', import.meta.url), 'utf8'));
    for (const [pacchetto, file] of [['dagre', 'LICENSE-dagre'], ['graphlib', 'LICENSE-graphlib']]) {
      assert.ok(manifest.files.some(item => item.path === `vendor/dagre/${file}`));
      assert.equal(await readFile(path.join(output, 'vendor/dagre', file), 'utf8'), await readFile(new URL(`../../node_modules/@dagrejs/${pacchetto}/LICENSE`, import.meta.url), 'utf8'));
    }
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
