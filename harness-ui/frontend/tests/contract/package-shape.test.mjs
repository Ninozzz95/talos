import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(here, '../../package.json');
const verifyScriptPath = path.resolve(here, '../../scripts/verify.mjs');

test('il pacchetto frontend ha toolchain e comandi pinned senza cutover implicito', async () => {
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  for (const name of ['build', 'build:lab', 'test:unit', 'test:browser', 'test:lab', 'test', 'verify']) {
    assert.equal(typeof pkg.scripts?.[name], 'string', `script mancante: ${name}`);
  }
  assert.equal(pkg.scripts.build, 'node scripts/build.mjs');
  assert.equal(pkg.scripts['test:lab'], 'node scripts/run-browser-tests.mjs --config=playwright.lab.config.mjs');
  assert.equal(pkg.devDependencies?.esbuild, '0.28.2');
  assert.equal(pkg.devDependencies?.['@playwright/test'], '1.62.1');
  assert.equal(pkg.devDependencies?.['axe-core'], '4.13.0');
  assert.equal(pkg.devDependencies?.pixelmatch, '7.2.0');
  assert.equal(pkg.devDependencies?.pngjs, '7.0.0');
  assert.equal(pkg.dependencies?.['@floating-ui/dom'], '1.8.0');
});

test('PHASE2-VERIFICATION-EVIDENCE-23 — il gate certifica la fase corrente', async () => {
  const source = await readFile(verifyScriptPath, 'utf8');
  assert.doesNotMatch(source, /phase-01-verification\.json|phase:\s*1|Fase 1 verificata/);
});

test('PHASE3-VERIFICATION-EVIDENCE-11 — il gate certifica la fase corrente', async () => {
  const source = await readFile(verifyScriptPath, 'utf8');
  assert.match(source, /phase-03-verification\.json/);
  assert.match(source, /phase:\s*3/);
  assert.match(source, /Fase 3 verificata/);
  assert.doesNotMatch(source, /phase-02-verification\.json|phase:\s*2|Fase 2 verificata/);
});
