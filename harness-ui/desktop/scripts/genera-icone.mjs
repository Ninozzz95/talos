import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Marchio originale, accento Calm; rasterizzazione upstream resvg-js 2.6.2.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const svg = readFileSync(join(root, '..', 'public', 'talos', 'brand', 'logo-short.svg'), 'utf8').replaceAll('currentColor', '#c08b3c');
mkdirSync(join(root, 'assets'), { recursive: true });
for (const [lato, nome] of [[256, 'talos.png'], [32, 'talos-tray.png']]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: lato }, font: { loadSystemFonts: false } }).render();
  writeFileSync(join(root, 'assets', nome), png.asPng());
}
console.log('Marchio Calm rasterizzato: 256 e 32 pixel.');
