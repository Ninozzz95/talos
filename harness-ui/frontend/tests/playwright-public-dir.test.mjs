import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProva } from '../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configUrl = new URL('../playwright.config.mjs', import.meta.url);
const dist = resolve(frontend, 'dist');
const legacyPublic = resolve(frontend, '..', 'public');

function leggiConfig(extraEnv = {}, tempRoot = null) {
  const env = { ...process.env, ...extraEnv };
  if (tempRoot) { env.TEMP = tempRoot; env.TMP = tempRoot; }
  delete env.TALOS_HARNESS_UI_BASE_URL;
  delete env.TALOS_HARNESS_UI_PUBLIC_DIR;
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value !== undefined) env[key] = value;
  }
  const script = `import config from ${JSON.stringify(configUrl.href)};
process.stdout.write(JSON.stringify({ baseURL: config.use.baseURL, testIgnore: config.testIgnore, webServer: config.webServer && { publicDir: config.webServer.env.TALOS_HARNESS_UI_PUBLIC_DIR, storeDir: config.webServer.env.TALOS_HARNESS_UI_SESSIONS_DIR, cwd: config.webServer.cwd, reuseExistingServer: config.webServer.reuseExistingServer, envKeys: Object.keys(config.webServer.env) } }));`;
  return spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: frontend,
    env,
    encoding: 'utf8',
  });
}

for (const scenario of [
  { name: 'baseURL esterna', env: { TALOS_HARNESS_UI_BASE_URL: 'http://127.0.0.1:49999/' }, status: 0 },
  { name: 'config locale invalida', env: { TALOS_HARNESS_UI_PUBLIC_DIR: legacyPublic }, status: 1 },
  { name: 'uscita locale normale', env: {}, status: 0 },
]) {
  test(`nessuno store temporaneo residuo dopo ${scenario.name}`, () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'talos-playwright-config-lifecycle-'));
    try {
      const child = leggiConfig(scenario.env, tempRoot);
      if (scenario.status === 0) assert.equal(child.status, 0, child.stderr);
      else assert.notEqual(child.status, 0);
      if (scenario.name === 'uscita locale normale') {
        const config = JSON.parse(child.stdout);
        assert.ok(config.webServer.storeDir.startsWith(tempRoot), 'store creato nella radice privata');
      }
      assert.deepEqual(readdirSync(tempRoot), [], `${scenario.name}: nessuno store orfano`);
    } finally {
      rimuoviCartellaDiProva(tempRoot); // classe A: il figlio è già uscito (spawnSync)
    }
  });
}

test('il browser locale serve la build dist corrente con path assoluto e server isolato', () => {
  const child = leggiConfig();
  assert.equal(child.status, 0, child.stderr);
  const config = JSON.parse(child.stdout);
  assert.equal(config.webServer.publicDir, dist);
  assert.equal(config.webServer.cwd, resolve(frontend, '..'));
  assert.equal(config.webServer.reuseExistingServer, false);
});

test('PW-REPORT-SECRET-019 — il config serializzato non contiene credenziali ereditate', () => {
  const child = leggiConfig({
    OPENROUTER_API_KEY: 'synthetic-openrouter-key',
    OPENAI_API_KEY: 'synthetic-openai-key',
    GEMINI_API_KEY: 'synthetic-gemini-key',
  });
  assert.equal(child.status, 0, child.stderr);
  const { envKeys } = JSON.parse(child.stdout).webServer;
  for (const key of ['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY']) {
    assert.ok(!envKeys.includes(key), `${key} non deve finire nel report Playwright`);
  }
  assert.ok(envKeys.includes('TALOS_HARNESS_UI_KEYRING'));
});

test('solo i due confronti storici e il lab legacy restano fuori dal gate browser automatico', () => {
  const child = leggiConfig({ TALOS_HARNESS_UI_BASE_URL: 'http://127.0.0.1:49999/' });
  assert.equal(child.status, 0, child.stderr);
  const config = JSON.parse(child.stdout);
  assert.deepEqual(config.testIgnore, [
    'lab-bootstrap.spec.mjs',
    '_confronto-exa.spec.mjs',
    '_confronto-fase1.spec.mjs',
  ]);
  assert.ok(!config.testIgnore.includes('r4-approved-mockups.spec.mjs'));
});

test('un override verso il vecchio public non può dare un falso verde', () => {
  const child = leggiConfig({ TALOS_HARNESS_UI_PUBLIC_DIR: legacyPublic });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /TALOS_HARNESS_UI_PUBLIC_DIR|dist/);
});

test('un baseURL esterno esplicito non avvia un server locale', () => {
  const external = 'http://127.0.0.1:49999/';
  const child = leggiConfig({
    TALOS_HARNESS_UI_BASE_URL: external,
    TALOS_HARNESS_UI_PUBLIC_DIR: legacyPublic,
  });
  assert.equal(child.status, 0, child.stderr);
  const config = JSON.parse(child.stdout);
  assert.equal(config.baseURL, external);
  assert.equal(config.webServer, undefined);
});

test('il manifest e gli asset non possono essere manomessi o mancanti', async () => {
  const module = await import(configUrl.href);
  assert.equal(typeof module.verificaBuildBrowser, 'function');
  const fixture = mkdtempSync(join(tmpdir(), 'talos-playwright-build-'));
  try {
    const files = ['index.html', 'app.js', 'styles.css'];
    const contents = ['<html></html>', 'console.log(1);', 'body{}'];
    for (let index = 0; index < files.length; index += 1) {
      writeFileSync(join(fixture, files[index]), contents[index]);
    }
    writeFileSync(join(fixture, 'build-manifest.json'), JSON.stringify({
      schema: 'talos.desktop.frontend-build.v1',
      entries: { script: 'app.js', style: 'styles.css' },
      files: files.map((file, index) => ({
        path: file,
        bytes: Buffer.byteLength(contents[index]),
        sha256: createHash('sha256').update(contents[index]).digest('hex'),
      })),
    }));
    assert.equal(module.verificaBuildBrowser({ buildDir: fixture }), fixture);
    writeFileSync(join(fixture, 'styles.css'), 'body{color:red}');
    assert.throws(() => module.verificaBuildBrowser({ buildDir: fixture }), /styles\.css/);
    rmSync(join(fixture, 'app.js'));
    assert.throws(() => module.verificaBuildBrowser({ buildDir: fixture }), /app\.js|styles\.css/);
  } finally {
    rimuoviCartellaDiProva(fixture); // classe A: nessuna risorsa a lunga vita
  }
});
