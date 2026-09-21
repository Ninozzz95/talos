import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProduction } from './build.mjs';

export async function verifyBuild() {
  const firstDir = await mkdtemp(path.join(tmpdir(), 'talos-phase1-first-'));
  const secondDir = await mkdtemp(path.join(tmpdir(), 'talos-phase1-second-'));
  try {
    await buildProduction({ outputDir: firstDir });
    await buildProduction({ outputDir: secondDir });
    const first = JSON.parse(await readFile(path.join(firstDir, 'build-manifest.json'), 'utf8'));
    const second = JSON.parse(await readFile(path.join(secondDir, 'build-manifest.json'), 'utf8'));
    assert.deepEqual(second, first);
    return first;
  } finally {
    await rm(firstDir, { recursive: true, force: true });
    await rm(secondDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyBuild().then((manifest) => console.log(`Build deterministica: ${manifest.files.length} file`)).catch((error) => { console.error(error); process.exitCode = 1; });
}
