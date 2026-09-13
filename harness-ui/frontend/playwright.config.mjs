import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

/** ⛔ Porta DIVERSA da 4174 (owner) e da 4175 (laboratorio modulare): tre server possono convivere. */
const PORTA_TEST = Number(process.env.TALOS_HARNESS_UI_TEST_PORT || 4176);

/*
 * Store vuoto e NUOVO a ogni giro: `mkdtempSync` viene valutato una volta
 * per esecuzione, quando Playwright legge questo file. Non si riusa una
 * cartella fissa — una sessione lasciata da un giro precedente
 * rimetterebbe esattamente la non-ripetibilità che stiamo togliendo.
 */
const STORE_ISOLATO = mkdtempSync(join(tmpdir(), 'talos-harness-test-store-'));

/*
 * ⛔ `TALOS_HARNESS_UI_BASE_URL` continua a vincere: serve a puntare la
 * suite a un server già acceso (debug, o il 4174 vero quando lo si vuole
 * DAVVERO). In quel caso `webServer` non deve partire, altrimenti si
 * avvierebbe un server che nessuno usa.
 */
const baseUrlEsterno = process.env.TALOS_HARNESS_UI_BASE_URL;
const baseURL = baseUrlEsterno || `http://127.0.0.1:${PORTA_TEST}/`;

export default defineConfig({
  testDir: './tests/browser',
  // Il laboratorio modulare ha server, build e matrice propri (4175):
  // eseguirlo contro il 4174 prodotto è un falso negativo, non un gate.
  // playwright.lab.config.mjs lo include esplicitamente con testMatch.
  testIgnore: ['lab-bootstrap.spec.mjs'],
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
      ...process.env,
      TALOS_HARNESS_UI_PORT: String(PORTA_TEST),
      TALOS_HARNESS_UI_SESSIONS_DIR: STORE_ISOLATO,
    },
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
