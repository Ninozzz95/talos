import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PDFJS_CMAPS, PDFJS_DECODIFICATORI_JS, PDFJS_FONT_STANDARD, PDFJS_LICENZE } from '../../src/pdfjs-risorse.mjs';

const FONT_NAMES = Object.freeze([
  'instrument-sans-latin-400-normal.woff2',
  'instrument-sans-latin-500-normal.woff2',
  'instrument-sans-latin-600-normal.woff2',
  'instrument-sans-latin-ext-400-normal.woff2',
  'instrument-sans-latin-ext-500-normal.woff2',
  'instrument-sans-latin-ext-600-normal.woff2',
  'jetbrains-mono-latin-400-normal.woff2',
  'jetbrains-mono-latin-500-normal.woff2',
  'jetbrains-mono-latin-ext-400-normal.woff2',
  'jetbrains-mono-latin-ext-500-normal.woff2',
]);
const PRISM_NAMES = Object.freeze(['LICENSE-prism', 'README.md', 'prism.js']);
/*
 * ⛔ 16/09/2026, P0-E punto 9 — `shell-quote` 1.10.0 (MIT, nessuna dipendenza di produzione):
 *   il parser della riga di comando che veste la colonna «Processi». Il sorgente è IMPORTATO dal
 *   bundle (`src/components/comando-shell.js`), ma passa di qui lo stesso — licenza, provenienza e
 *   impronta sha256 nel manifesto — per la stessa ragione di xterm e Prism: una sostituzione
 *   silenziosa del file vendorizzato deve far cadere `tests/contract/vendored-assets.test.mjs`,
 *   non passare inosservata.
 */
const SHELL_QUOTE_NAMES = Object.freeze(['LICENSE-shell-quote', 'README.md', 'parse.js']);
const XTERM_NAMES = Object.freeze([
  'LICENSE-addon-fit', 'LICENSE-addon-webgl', 'LICENSE-xterm', 'README.md',
  'addon-fit.js', 'addon-webgl.js', 'xterm.css', 'xterm.js',
]);

async function copyAndDescribe(source, destination, relativePath) {
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const bytes = await readFile(destination);
  return { path: relativePath, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function copyVendoredAssets({ frontendRoot, outputDir }) {
  const assetsRoot = path.join(frontendRoot, 'src/assets');
  const entries = [
    { source: path.join(frontendRoot, 'node_modules/@dagrejs/dagre/LICENSE'), relativePath: 'vendor/dagre/LICENSE-dagre' },
    { source: path.join(frontendRoot, 'node_modules/@dagrejs/graphlib/LICENSE'), relativePath: 'vendor/dagre/LICENSE-graphlib' },
    ...FONT_NAMES.map((name) => ({ source: path.join(assetsRoot, 'fonts', name), relativePath: `fonts/${name}` })),
    ...XTERM_NAMES.map((name) => ({ source: path.join(assetsRoot, 'xterm', name), relativePath: `vendor/xterm/${name}` })),
    ...PRISM_NAMES.map((name) => ({ source: path.join(assetsRoot, 'prism', name), relativePath: `vendor/prism/${name}` })),
    ...SHELL_QUOTE_NAMES.map((name) => ({ source: path.join(assetsRoot, 'shell-quote', name), relativePath: `vendor/shell-quote/${name}` })),
    /* refactor dei grafi (decisione owner 26, 25/09/2026): elkjs 0.12.0 — il worker che la pagina carica per nome e la licenza
       (EPL-2.0 OR GPL-3.0-or-later); @xyflow/system 0.0.83 (MIT) è nel bundle, qui solo la sua licenza. */
    { source: path.join(frontendRoot, 'node_modules', 'elkjs', 'lib', 'elk-worker.min.js'), relativePath: 'vendor/elk/elk-worker.min.js' },
    { source: path.join(frontendRoot, 'node_modules', 'elkjs', 'LICENSE.md'), relativePath: 'vendor/elk/LICENSE-elkjs' },
    { source: path.join(frontendRoot, 'node_modules', '@xyflow', 'system', 'LICENSE'), relativePath: 'vendor/xyflow/LICENSE-system' },
    {
      source: path.join(frontendRoot, 'node_modules', '@tanstack', 'virtual-core', 'LICENSE'),
      relativePath: 'vendor/tanstack/LICENSE-virtual-core',
    },
    {
      source: path.join(frontendRoot, 'node_modules', '@floating-ui', 'dom', 'LICENSE'),
      relativePath: 'vendor/floating-ui/LICENSE-dom',
    },
    {
      source: path.join(frontendRoot, 'node_modules', '@floating-ui', 'core', 'LICENSE'),
      relativePath: 'vendor/floating-ui/LICENSE-core',
    },
    {
      source: path.join(frontendRoot, 'node_modules', '@floating-ui', 'utils', 'LICENSE'),
      relativePath: 'vendor/floating-ui/LICENSE-utils',
    },
    /* F5 File reader (26/09/2026): le rese Office sono minificate senza commenti di licenza (`legalComments: 'none'`), quindi
       i testi viaggiano qui accanto. Il NOTICE di pptx-viewer-core si conserva per Apache-2.0 §4(d), e dice anche dove sta il
       sorgente di mtx-decompressor (MPL-2.0 §3.2(a)). */
    ...[
      ['docx-preview/LICENSE', 'LICENSE-docx-preview'],
      ['dompurify/LICENSE', 'LICENSE-dompurify'],
      ['pptx-viewer-core/LICENSE', 'LICENSE-pptx-viewer-core'],
      ['pptx-viewer-core/NOTICE', 'NOTICE-pptx-viewer-core'],
      ['mtx-decompressor/LICENSE', 'LICENSE-mtx-decompressor'],
      ['emf-converter/LICENSE', 'LICENSE-emf-converter'],
      ['jszip/LICENSE.markdown', 'LICENSE-jszip'],
      ['pako/LICENSE', 'LICENSE-pako'],
      ['xlsx/LICENSE', 'LICENSE-xlsx'],
      // MIT, dentro pptx-viewer-core (misurato sul metafile di esbuild); @nodable/entities non ha un file: sta negli avvisi
      ...['anynum', 'fast-xml-builder', 'fast-xml-parser', 'is-unsafe', 'path-expression-matcher', 'strnum', 'utif', 'xml-naming'].map((p) => [`${p}/LICENSE`, `LICENSE-${p}`]),
    ].map(([sorgente, nome]) => ({ source: path.join(frontendRoot, 'node_modules', ...sorgente.split('/')), relativePath: `vendor/lettore/${nome}` })),
    /* ATLAS F3 (27/09/2026, owner: «prima pagina con pdf.js»): la card della Libreria disegna la prima pagina di un PDF
       come fa il mobile. pdfjs-dist 6.3.289 (Apache-2.0), i due file della build già minificati: la libreria, caricata con
       un `import()` per indirizzo solo quando una card PDF entra in vista, e il suo worker. */
    { source: path.join(frontendRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.min.mjs'), relativePath: 'vendor/pdfjs/pdf.min.mjs' },
    { source: path.join(frontendRoot, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs'), relativePath: 'vendor/pdfjs/pdf.worker.min.mjs' },
    { source: path.join(frontendRoot, 'node_modules', 'pdfjs-dist', 'LICENSE'), relativePath: 'vendor/pdfjs/LICENSE-pdfjs' },
    /* ATLAS F3 (27/09/2026, owner: «aggiungi le risorse») — ciò che il worker chiede per una prima pagina fedele: CMap, font
       standard, decodificatori JPEG2000/JBIG2 in versione JS, con le loro licenze. L'elenco è UNO, lo stesso che il server
       ammette (`src/pdfjs-risorse.mjs`): un file copiato e non servito, o servito e non copiato, non può esistere. */
    ...PDFJS_CMAPS.map((nome) => ({ source: path.join(frontendRoot, 'node_modules', 'pdfjs-dist', 'cmaps', nome), relativePath: `vendor/pdfjs/cmaps/${nome}` })),
    ...PDFJS_FONT_STANDARD.map((nome) => ({ source: path.join(frontendRoot, 'node_modules', 'pdfjs-dist', 'standard_fonts', nome), relativePath: `vendor/pdfjs/standard_fonts/${nome}` })),
    ...PDFJS_DECODIFICATORI_JS.map((nome) => ({ source: path.join(frontendRoot, 'node_modules', 'pdfjs-dist', 'wasm', nome), relativePath: `vendor/pdfjs/wasm/${nome}` })),
    ...PDFJS_LICENZE.map(([cartella, nome]) => ({ source: path.join(frontendRoot, 'node_modules', 'pdfjs-dist', cartella, nome), relativePath: `vendor/pdfjs/${cartella}/${nome}` })),
    { source: path.join(assetsRoot, 'talos/brand/logo-short.svg'), relativePath: 'talos/brand/logo-short.svg' },
    { source: path.join(assetsRoot, 'talos/browser-annota.js'), relativePath: 'talos/browser-annota.js' }, // Browser con annotazione 06/9
  ].sort((a, b) => (a.relativePath < b.relativePath ? -1 : (a.relativePath > b.relativePath ? 1 : 0)));
  const files = [];
  for (const entry of entries) {
    files.push(await copyAndDescribe(entry.source, path.join(outputDir, ...entry.relativePath.split('/')), entry.relativePath));
  }
  await writeFile(path.join(outputDir, 'asset-manifest.json'), `${JSON.stringify({ schema: 'talos.desktop.assets.v1', files }, null, 2)}\n`, 'utf8');
  return files;
}
