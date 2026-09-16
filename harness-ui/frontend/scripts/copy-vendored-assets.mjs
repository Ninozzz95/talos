import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
    ...FONT_NAMES.map((name) => ({ source: path.join(assetsRoot, 'fonts', name), relativePath: `fonts/${name}` })),
    ...XTERM_NAMES.map((name) => ({ source: path.join(assetsRoot, 'xterm', name), relativePath: `vendor/xterm/${name}` })),
    ...PRISM_NAMES.map((name) => ({ source: path.join(assetsRoot, 'prism', name), relativePath: `vendor/prism/${name}` })),
    ...SHELL_QUOTE_NAMES.map((name) => ({ source: path.join(assetsRoot, 'shell-quote', name), relativePath: `vendor/shell-quote/${name}` })),
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
