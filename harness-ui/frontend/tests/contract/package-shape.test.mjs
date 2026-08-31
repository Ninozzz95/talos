import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(here, '../../package.json');

test('il pacchetto frontend ha toolchain e comandi pinned senza cutover implicito', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  for (const name of ['build', 'build:lab', 'test:unit', 'test:browser', 'test', 'verify']) {
    assert.equal(typeof pkg.scripts?.[name], 'string', `script mancante: ${name}`);
  }
  assert.equal(pkg.devDependencies?.esbuild, '0.28.2');
  assert.equal(pkg.devDependencies?.['@playwright/test'], '1.62.1');
  assert.equal(pkg.devDependencies?.['axe-core'], '4.13.0');
  assert.equal(pkg.devDependencies?.pixelmatch, '7.2.0');
  assert.equal(pkg.devDependencies?.pngjs, '7.0.0');
});

