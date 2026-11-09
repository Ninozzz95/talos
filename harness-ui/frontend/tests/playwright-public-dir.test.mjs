import { FILE_SONDE_4174 } from './browser/sonde-4174.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { rimuoviCartellaDiProva } from '../../tests/aiuto/rimuovi-cartella-di-prova.mjs';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configUrl = new URL('../playwright.config.mjs', import.meta.url);
const dist = resolve(frontend, 'dist');
const legacyPublic = resolve(frontend, '..', 'public');

const SCRIPT_SERVER_UNICO = `import config from ${JSON.stringify(configUrl.href)};
process.stdout.write(JSON.stringify({ baseURL: config.use.baseURL, testIgnore: config.testIgnore.map((x) => (x instanceof RegExp ? String(x) : x)), webServer: config.webServer && { publicDir: config.webServer.env.TALOS_HARNESS_UI_PUBLIC_DIR, storeDir: config.webServer.env.TALOS_HARNESS_UI_SESSIONS_DIR, dataDir: config.webServer.env.TALOS_DESKTOP_DATA_DIR, cwd: config.webServer.cwd, reuseExistingServer: config.webServer.reuseExistingServer, envKeys: Object.keys(config.webServer.env) } }));`;
/* Decisione 106 (03/11/2026, due server): coi due server `webServer` è un ELENCO; si legge anche lo store che le prove del
   lavoratore trovano in `TALOS_PW_STORE_ISOLATO` (lo legge `artefatti-versioni.spec.mjs`). */
const SCRIPT_DUE_SERVER = `import config from ${JSON.stringify(configUrl.href)};
const ws = config.webServer === undefined ? null : [].concat(config.webServer);
process.stdout.write(JSON.stringify({ baseURL: config.use.baseURL, origine: config.use.storageState.origins[0].origin, storeDelLavoratore: process.env.TALOS_PW_STORE_ISOLATO, gettone: Boolean(process.env.TALOS_PW_GETTONE), webServer: ws && ws.map((w) => ({ name: w.name, url: w.url, command: w.command, pronto: w.wait && String(w.wait.stdout), port: w.env.TALOS_HARNESS_UI_PORT, storeDir: w.env.TALOS_HARNESS_UI_SESSIONS_DIR, dataDir: w.env.TALOS_DESKTOP_DATA_DIR, envKeys: Object.keys(w.env), reuseExistingServer: w.reuseExistingServer })) }));`;
function leggiConfig(extraEnv = {}, tempRoot = null, script = SCRIPT_SERVER_UNICO) {
  const env = { ...process.env, ...extraEnv };
  if (tempRoot) { env.TEMP = tempRoot; env.TMP = tempRoot; }
  delete env.TALOS_HARNESS_UI_BASE_URL;
  delete env.TALOS_HARNESS_UI_PUBLIC_DIR;
  // Decisione 106: un'eredità dei due server (o di un lavoratore Playwright) non cambia le prove del server unico.
  for (const k of ['TALOS_PW_SERVER', 'TEST_PARALLEL_INDEX', 'TALOS_PW_STORE_ISOLATO', 'TALOS_PW_STORE_ISOLATO_2', 'TALOS_HARNESS_UI_TEST_PORT', 'TALOS_HARNESS_UI_TEST_PORT_2']) delete env[k];
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value !== undefined) env[key] = value;
  }
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

test('OUTPUT19-PROFILE-ISOLATION: every desktop store uses the test profile, overriding an inherited owner profile', () => {
  const child = leggiConfig({TALOS_DESKTOP_DATA_DIR: resolve(tmpdir(), 'owner-profile-must-not-be-used')});
  assert.equal(child.status, 0, child.stderr);
  const {dataDir, storeDir} = JSON.parse(child.stdout).webServer;
  assert.equal(typeof dataDir, 'string'); assert.equal(dataDir, storeDir);
  assert.notEqual(dataDir, resolve(tmpdir(), 'owner-profile-must-not-be-used'));
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

test('solo i due confronti storici, il lab legacy e le sonde del 4174 restano fuori dal gate browser automatico', () => {
  /* L3-11 (15/10/2026): le sonde scritte per il 4174 (`_*-4174.spec.mjs`) sono fuori anche col baseURL esterno, e rientrano solo
     con TALOS_SONDE_4174=1 (`tests/browser/sonde-4174.mjs`). Prima l'elenco era di tre: il quarto è dichiarato, non scivolato. */
  const child = leggiConfig({ TALOS_HARNESS_UI_BASE_URL: 'http://127.0.0.1:49999/' });
  assert.equal(child.status, 0, child.stderr);
  const config = JSON.parse(child.stdout);
  assert.deepEqual(config.testIgnore, [
    'lab-bootstrap.spec.mjs',
    '_confronto-exa.spec.mjs',
    '_confronto-fase1.spec.mjs',
    String(FILE_SONDE_4174), // il contratto vive in `tests/browser/sonde-4174.mjs`
  ]);
  const conSonde = JSON.parse(leggiConfig({ TALOS_HARNESS_UI_BASE_URL: 'http://127.0.0.1:49999/', TALOS_SONDE_4174: '1' }).stdout);
  assert.deepEqual(conSonde.testIgnore, ['lab-bootstrap.spec.mjs', '_confronto-exa.spec.mjs', '_confronto-fase1.spec.mjs'], 'chieste apposta, le sonde rientrano');
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

/* ⭐ Decisione 106 dell'owner (03/11/2026, «lente + due server»): `--server=2` (TALOS_PW_SERVER=2) accende due server di prova,
   ognuno col suo store; senza l'opzione la configurazione è quella di prima (un oggetto, provato dalle prove qui sopra). */
const DUE = { TALOS_PW_SERVER: '2', TALOS_HARNESS_UI_TEST_PORT: '4193', TALOS_HARNESS_UI_TEST_PORT_2: '4194' };

test('DUE-SERVER-01 — nel processo principale: due server, due porte, due store distinti, e all\'uscita nessuno dei due resta', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'talos-playwright-config-due-'));
  try {
    const child = leggiConfig(DUE, tempRoot, SCRIPT_DUE_SERVER);
    assert.equal(child.status, 0, child.stderr);
    const config = JSON.parse(child.stdout);
    assert.equal(config.baseURL, 'http://127.0.0.1:4193/', 'il principale guarda il server 1');
    assert.equal(config.webServer.length, 2);
    const [uno, due] = config.webServer;
    assert.deepEqual([uno.name, due.name], ['server-1', 'server-2']);
    assert.deepEqual([uno.port, due.port], ['4193', '4194']);
    /* «Gettone sempre» (owner 02/11/2026): ognuno dei due server parte dallo script col gettone e si dice pronto con la SUA riga, quando
       `/api/v1/health` risponde 200 col cookie. Un `url` qui sarebbe sbagliato: Playwright prende anche un 401 per «pronto». */
    assert.equal(config.gettone, true, 'il principale crea il gettone della corsa, che i due server ereditano');
    assert.deepEqual([uno.command, due.command], ['node frontend/scripts/server-di-prova-col-gettone.mjs', 'node frontend/scripts/server-di-prova-col-gettone.mjs']);
    assert.deepEqual([uno.pronto, due.pronto], ['/TALOS-SERVER-DI-PROVA-PRONTO/u', '/TALOS-SERVER-DI-PROVA-PRONTO/u']);
    assert.deepEqual([uno.url, due.url], [undefined, undefined], 'nessun controllo per indirizzo: col gettone un 401 sembrerebbe «pronto»');
    assert.notEqual(uno.storeDir, due.storeDir, 'ogni server ha il SUO store');
    for (const w of [uno, due]) {
      assert.equal(w.dataDir, w.storeDir, `${w.name}: anche i dati del desktop nello store di prova`);
      assert.ok(w.storeDir.startsWith(tempRoot) && basename(w.storeDir).startsWith('talos-harness-test-store-'), `${w.name}: store nella radice privata, col prefisso che la pulizia riconosce`);
      assert.equal(w.reuseExistingServer, false, `${w.name}: una porta occupata ferma la corsa`);
      assert.ok(w.envKeys.includes('TALOS_HARNESS_UI_KEYRING'));
      assert.ok(!w.envKeys.some((k) => /API_KEY/.test(k)), `${w.name}: nessuna chiave nel resoconto`);
    }
    assert.deepEqual(uno.envKeys, due.envKeys, 'stesso ambiente per i due server, cambiano solo porta e store');
    assert.deepEqual(readdirSync(tempRoot), [], 'all\'uscita i DUE store sono tolti con la stessa verifica di prima');
  } finally {
    rimuoviCartellaDiProva(tempRoot); // classe A: il figlio è già uscito (spawnSync)
  }
});

test('DUE-SERVER-02 — i lavoratori dispari vanno al server 2 col suo store, i pari al server 1; senza l\'opzione l\'indice non conta', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'talos-playwright-config-lavoratore-'));
  try {
    const s1 = join(tempRoot, 'talos-harness-test-store-uno');
    const s2 = join(tempRoot, 'talos-harness-test-store-due');
    const eredita = { ...DUE, TALOS_PW_STORE_ISOLATO: s1, TALOS_PW_STORE_ISOLATO_2: s2 };
    const dispari = JSON.parse(leggiConfig({ ...eredita, TEST_PARALLEL_INDEX: '3' }, tempRoot, SCRIPT_DUE_SERVER).stdout);
    assert.equal(dispari.baseURL, 'http://127.0.0.1:4194/');
    assert.equal(dispari.origine, 'http://127.0.0.1:4194', 'la memoria iniziale del browser è quella dell\'origine del suo server');
    assert.equal(dispari.storeDelLavoratore, s2, 'le prove che leggono lo store trovano quello del loro server');
    const pari = JSON.parse(leggiConfig({ ...eredita, TEST_PARALLEL_INDEX: '2' }, tempRoot, SCRIPT_DUE_SERVER).stdout);
    assert.equal(pari.baseURL, 'http://127.0.0.1:4193/');
    assert.equal(pari.storeDelLavoratore, s1);
    const unico = JSON.parse(leggiConfig({ TALOS_HARNESS_UI_TEST_PORT: '4193', TEST_PARALLEL_INDEX: '3', TALOS_PW_STORE_ISOLATO: s1 }, tempRoot).stdout);
    assert.equal(unico.baseURL, 'http://127.0.0.1:4193/', 'senza --server=2 ogni lavoratore resta sul server unico');
    assert.equal(unico.webServer.storeDir, s1);
    const senzaStore2 = leggiConfig({ ...DUE, TALOS_PW_STORE_ISOLATO: s1, TEST_PARALLEL_INDEX: '1' }, tempRoot, SCRIPT_DUE_SERVER);
    assert.notEqual(senzaStore2.status, 0, 'un lavoratore senza lo store del secondo server non ne inventa uno suo');
    assert.match(senzaStore2.stderr, /TALOS_PW_STORE_ISOLATO_2/);
  } finally {
    rimuoviCartellaDiProva(tempRoot); // classe A: i figli sono già usciti
  }
});

for (const [nome, porte] of [['4174 dell\'owner', ['4174', '4194']], ['4175 del laboratorio', ['4193', '4175']], ['4177', ['4177', '4194']], ['4179', ['4193', '4179']], ['due porte uguali', ['4193', '4193']], ['una porta non valida', ['4193', 'abc']]]) {
  test(`DUE-SERVER-03 — coi due server la configurazione si ferma su ${nome}, senza lasciare store`, () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'talos-playwright-config-porte-'));
    try {
      const child = leggiConfig({ TALOS_PW_SERVER: '2', TALOS_HARNESS_UI_TEST_PORT: porte[0], TALOS_HARNESS_UI_TEST_PORT_2: porte[1] }, tempRoot, SCRIPT_DUE_SERVER);
      assert.notEqual(child.status, 0, `${nome}: doveva fermarsi`);
      assert.match(child.stderr, /porta|porte/);
      assert.deepEqual(readdirSync(tempRoot), [], `${nome}: nessuno store orfano`);
    } finally {
      rimuoviCartellaDiProva(tempRoot);
    }
  });
}
