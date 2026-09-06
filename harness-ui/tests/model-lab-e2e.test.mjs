import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);
const source = async (file) => readFile(new URL(file, root), 'utf8');

test('MODEL-LAB-UI-IMPORT-01 espone picker GGUF, upload a flusso e annullamento', async () => {
  const app = await source('frontend/src/legacy/app.js');
  assert.match(app, /id=\\?['"]modelLabImportInput/);
  assert.match(app, /accept=\\?['"]\.gguf/);
  assert.match(app, /new XMLHttpRequest\(\)/);
  assert.match(app, /X-Talos-Model-Bytes/);
  assert.match(app, /X-Talos-Model-Filename/);
  assert.match(app, /modelLabImportCancelButton/);
  assert.doesNotMatch(app, /modelLabImportButton[^\n]+disabled/);
});

test('MODEL-LAB-UI-IMPORT-03 la rotta binaria non accetta sourcePath', async () => {
  const app = await source('src/http-app.mjs');
  assert.match(app, /application\/octet-stream/);
  assert.match(app, /x-talos-model-id/);
  assert.doesNotMatch(app, /localModelTransfer\.importLocal\(body\.manifest, body\.sourcePath\)/);
});
