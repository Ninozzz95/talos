import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProduction } from '../../scripts/build.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

test('PHASE1-GRAPH-ISOLATION-01 esclude laboratorio test e fixture dal grafo', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'talos-phase1-graph-'));
  try {
    const result = await buildProduction({ outputDir: output });
    const inputs = Object.keys(result.metafile.inputs).map((value) => value.replaceAll('\\', '/'));
    assert.equal(inputs.some((value) => value.includes('/lab/')), false);
    assert.equal(inputs.some((value) => value.includes('/tests/')), false);
    assert.equal(inputs.some((value) => value.includes('/fixtures/')), false);
  } finally {
    await rimuoviCartellaDiProvaAttesa(output);
  }
});
