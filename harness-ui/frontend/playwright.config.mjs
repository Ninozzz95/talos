import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

/*
 * ⛔⛔⛔ 02/9 — PRIMA di questo blocco la suite NON era un cancello, ed è
 * stato misurato, non supposto: `baseURL` puntava al **4174 dell'owner**,
 * il server di lavoro con le sue sessioni vere in `.sessions-store/`, e
 * non esisteva nessun `webServer`. Lanciata **due volte di fila sullo
 * stesso identico codice** dava **21 rossi** e poi **19**, con insiemi
 * diversi: l'esito dipendeva da quante sessioni c'erano sul disco e da
 * quale si apriva da sola all'avvio. Un conteggio così non prova niente —
 * e infatti aveva già fatto riportare un miglioramento inesistente
 * ("da 20 rossi a 6"), poi ritirato.
 *
 * ⭐ Ricerca 02/9 — i tre concorrenti isolano lo stato dei test esattamente
 * così, tutti e tre con una variabile d'ambiente sulla cartella di stato:
 * **Codex** `CODEX_HOME` ("isolates the eval from any personal Codex
 * configuration on the machine"), **Hermes** `HERMES_HOME` (fixture da una
 * home isolata, ogni profilo col proprio session database), **Claude Code**
 * `CLAUDE_CONFIG_DIR` ("keeping your real config untouched"). E Playwright
 * stesso documenta `webServer` + `reuseExistingServer: false` per avere
 * un'istanza fresca a ogni giro.
 *
 * ⇒ Qui: un server TUTTO nostro, su una porta sua e con uno store VUOTO
 * creato a ogni esecuzione. Il 4174 dell'owner non viene né letto né
 * toccato, e può restare acceso mentre i test girano.
 */
const QUI = fileURLToPath(new URL('.', import.meta.url));
const HARNESS_UI = resolve(QUI, '..');
const DIST_CORRENTE = resolve(QUI, 'dist');

/** Impedisce alla suite locale di validare un bundle diverso dalla build frontend. */
export function verificaBuildBrowser({ buildDir }) {
  const root = resolve(buildDir);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, 'build-manifest.json'), 'utf8'));
  } catch (error) {
    throw new Error(`Build browser mancante o manifest illeggibile in ${root}: eseguire npm run build`, { cause: error });
  }
  if (manifest.schema !== 'talos.desktop.frontend-build.v1'
    || manifest.entries?.script !== 'app.js'
    || manifest.entries?.style !== 'styles.css'
    || !Array.isArray(manifest.files)) {
    throw new Error(`Build browser non valida in ${root}: schema o entry del manifest`);
  }
  for (const name of ['index.html', 'app.js', 'styles.css']) {
    const entries = manifest.files.filter((entry) => entry?.path === name);
    if (entries.length !== 1 || !Number.isSafeInteger(entries[0].bytes)
      || !/^[a-f0-9]{64}$/.test(entries[0].sha256)) {
      throw new Error(`Build browser non valida in ${root}: entry ${name} assente o ambigua`);
    }
    let bytes;
    try {
      bytes = readFileSync(join(root, name));
    } catch (error) {
      throw new Error(`Build browser non valida in ${root}: ${name} mancante`, { cause: error });
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== entries[0].bytes || sha256 !== entries[0].sha256) {
      throw new Error(`Build browser non valida in ${root}: ${name} differisce dal manifest`);
    }
  }
  return root;
}

/** ⛔ Porta DIVERSA da 4174 (owner) e da 4175 (laboratorio modulare): tre server possono convivere. */
const PORTA_TEST = Number(process.env.TALOS_HARNESS_UI_TEST_PORT || 4176);

/*
 * ⛔ `TALOS_HARNESS_UI_BASE_URL` continua a vincere: serve a puntare la
 * suite a un server già acceso (debug, o il 4174 vero quando lo si vuole
 * DAVVERO). In quel caso `webServer` non deve partire, altrimenti si
 * avvierebbe un server che nessuno usa.
 */
const baseUrlEsterno = process.env.TALOS_HARNESS_UI_BASE_URL;
const baseURL = baseUrlEsterno || `http://127.0.0.1:${PORTA_TEST}/`;
let publicDirLocale;
let STORE_ISOLATO;
if (!baseUrlEsterno) {
  const override = process.env.TALOS_HARNESS_UI_PUBLIC_DIR;
  if (override && resolve(override) !== DIST_CORRENTE) {
    throw new Error(`TALOS_HARNESS_UI_PUBLIC_DIR deve indicare la build frontend corrente: ${DIST_CORRENTE}`);
  }
  publicDirLocale = verificaBuildBrowser({ buildDir: DIST_CORRENTE });
  // Solo una suite locale valida possiede uno store. Gli import per debug e
  // le configurazioni respinte non lasciano directory temporanee vuote.
  /*
   * ⛔⛔ 23/09/2026 — 336 cartelle `talos-harness-test-store-*` nella TEMP dell'owner. Due cause misurate:
   *   1) Playwright carica QUESTO file nel processo principale E in ogni worker: ognuno creava il suo
   *      archivio, e i worker non escono in modo ordinato. ⇒ l'archivio nasce una volta sola nel processo
   *      principale e i worker lo ereditano da `TALOS_PW_STORE_ISOLATO` (i worker ricevono l'ambiente
   *      del principale).
   *   2) Su Windows la rimozione all'uscita partiva mentre il server di prova teneva ancora aperti i suoi
   *      file ⇒ EBUSY/EPERM e cartella lasciata. ⇒ `rmSync` coi ritentativi (Node 24: `maxRetries` vale
   *      solo per EBUSY, EMFILE, ENFILE, ENOTEMPTY, EPERM; default 0), e all'avvio si tolgono gli archivi
   *      di corse finite da più di un'ora — mai quelli recenti, che possono essere di una corsa viva.
   */
  const ereditato = process.env.TALOS_PW_STORE_ISOLATO;
  const proprietario = !ereditato;
  if (proprietario) {
    const radiceTemp = realpathSync(tmpdir());
    const unOraFa = Date.now() - 60 * 60 * 1000;
    for (const nome of readdirSync(radiceTemp)) {
      if (!nome.startsWith('talos-harness-test-store-')) continue;
      const vecchia = join(radiceTemp, nome);
      try {
        const st = lstatSync(vecchia);
        if (st.isDirectory() && !st.isSymbolicLink() && st.mtimeMs < unOraFa) rmSync(vecchia, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch { /* una cartella che non si toglie ora si ritenta alla corsa dopo */ }
    }
  }
  STORE_ISOLATO = ereditato || mkdtempSync(join(tmpdir(), 'talos-harness-test-store-'));
  process.env.TALOS_PW_STORE_ISOLATO = STORE_ISOLATO;
  if (proprietario) process.once('exit', () => {
    try {
      if (!existsSync(STORE_ISOLATO)) return;
      const owned = realpathSync(STORE_ISOLATO);
      if (dirname(owned) !== realpathSync(tmpdir())
        || !basename(owned).startsWith('talos-harness-test-store-')) {
        throw new Error('store browser fuori dalla directory temporanea prevista');
      }
      rmSync(owned, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (error) {
      process.stderr.write(`Cleanup dello store browser fallito: ${error.message}\n`);
      process.exitCode = 1;
    }
  });
}

export default defineConfig({
  testDir: './tests/browser',
  // Il laboratorio modulare ha server, build e matrice propri (4175):
  // eseguirlo contro il 4174 prodotto è un falso negativo, non un gate.
  // playwright.lab.config.mjs lo include esplicitamente con testMatch.
  // I due CONFRONTO richiedono porte e mockup storici esterni alla build
  // isolata: restano leggibili/eseguibili manualmente, ma il gate R4 usa
  // il proprio test visuale deterministico sui mockup approvati.
  testIgnore: ['lab-bootstrap.spec.mjs', '_confronto-exa.spec.mjs', '_confronto-fase1.spec.mjs'],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/playwright.json' }]],
  webServer: baseUrlEsterno ? undefined : {
    command: 'node server.mjs',
    cwd: HARNESS_UI,
    // ⛔ Si aspetta `/api/v1/health`, non la porta aperta: il server ascolta
    // PRIMA di aver finito di ripristinare le sessioni, e un test che parte
    // in quella finestra vede uno stato a metà (stesso difetto già pagato
    // sull'avvio a freddo di `avviaServerHarness`).
    url: `http://127.0.0.1:${PORTA_TEST}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      // Playwright eredita gia process.env nel processo server. Copiarlo qui
      // serializza le chiavi nel report JSON (config.webServer.env).
      TALOS_HARNESS_UI_PORT: String(PORTA_TEST),
      TALOS_HARNESS_UI_SESSIONS_DIR: STORE_ISOLATO,
      // Isolate every desktop store, including process output, not only journals.
      TALOS_DESKTOP_DATA_DIR: STORE_ISOLATO,
      // ⛔ 23/09/2026: custodia delle chiavi in memoria. Senza, una prova che salva una chiave finta
      // (BC-62) cancellava la chiave OpenRouter VERA dell'owner nel Credential Manager. Vedi
      // `src/adattatore-keyring.mjs`, `creaAdattatorePortachiaviInMemoria`.
      TALOS_HARNESS_UI_KEYRING: 'memoria',
      TALOS_SCRATCH_DIR: join(STORE_ISOLATO, 'scratch'), // 24/09/2026: mai la radice vera %LOCALAPPDATA%TALOS,
      TALOS_HARNESS_UI_PUBLIC_DIR: publicDirLocale,
    },
  },
  use: {
    baseURL,
    /* ⛔ 03/10/2026 (fase della lingua): le prove sono scritte sull'interfaccia ITALIANA. Con la preferenza «sistema» la lingua
       la decide il browser, e Chromium in prova parte in en-US: appena i componenti hanno seguito davvero la lingua, ogni
       asserzione sul testo italiano è diventata rossa. La lingua si fissa qui; l'inglese lo provano le prove che lo chiedono. */
    locale: 'it-IT',
    trace: 'on-first-retry',
    // Le catture esplicite dei test visivi impostano prima un viewport >= 1920x1080.
    // Un fallimento su viewport funzionali più piccoli non deve produrre un PNG automatico.
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
