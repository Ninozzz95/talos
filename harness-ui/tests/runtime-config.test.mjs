import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ConfigurationError, loadConfig } from '../src/config.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('config validates an optional owner runtime module as an absolute existing file', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'talos-runtime-config-'));
  const modulePath = join(dir, 'runtime.mjs');
  writeFileSync(modulePath, 'export {}');
  t.after(() => rimuoviCartellaDiProva(dir));
  assert.equal(loadConfig({ TALOS_OWNER_RUNTIME_MODULE: modulePath }, import.meta.url).ownerRuntimeModule, modulePath);
  for (const value of ['runtime.mjs', join(dir, 'missing.mjs')]) {
    assert.throws(() => loadConfig({ TALOS_OWNER_RUNTIME_MODULE: value }, import.meta.url), ConfigurationError);
  }
});

