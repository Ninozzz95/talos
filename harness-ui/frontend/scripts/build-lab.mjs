import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFrontend } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildLab({ outputDir = path.join(root, 'dist-lab') } = {}) {
  return buildFrontend({ entryPoint: 'lab/main.js', htmlTemplate: 'lab/index.html', outputDir, mode: 'laboratory' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildLab().then(({ manifest }) => console.log(`Laboratorio pronto: ${manifest.files.length} asset verificati`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
