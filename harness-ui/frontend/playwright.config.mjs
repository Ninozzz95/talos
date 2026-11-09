import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { cookieDellaCorsa } from './tests/browser/fixtures/cookie-della-corsa.mjs';
import { ignoraSonde4174 } from './tests/browser/sonde-4174.mjs'; // L3-11: le sonde del 4174 fuori dalla suite di serie

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
 * ⭐ Decisione 106 dell'owner (03/11/2026, «lente + due server»): con `TALOS_PW_SERVER=2` (lo mette `run-browser-tests.mjs
 * --server=2`) la suite gira su DUE server di prova, ognuno col suo store isolato, e ogni server serve metà dei lavoratori.
 * Senza l'opzione tutto resta com'era: un server, `webServer` oggetto, nessuna variabile nuova.
 *
 * Come si divide il lavoro: per LAVORATORE, non per file. Playwright dà a ogni lavoratore un `parallelIndex` stabile fra 0 e
 * workers-1 («workers running at the same time have a different parallelIndex; when a worker is restarted… the new worker
 * process has the same parallelIndex», doc `class-workerinfo`), e lo mette in `process.env.TEST_PARALLEL_INDEX` PRIMA di caricare
 * questo file nel lavoratore (`playwright/lib/worker/workerProcessEntry.js`, costruttore di WorkerMain, poi `deserializeConfig`
 * che ricarica la configurazione). Gli indici pari vanno al server 1, i dispari al server 2: con 8 lavoratori 4 e 4, e ogni
 * lavoratore libero prende il file dopo dalla stessa fila (niente squilibrio fra due metà fisse). Le alternative misurate a
 * parole: due corse con `--shard` dividono per FILE quando `fullyParallel` è spento (doc `test-sharding`: «tests are split at the
 * file level… certain shards may end up running significantly more»), e `remoto-invio-file` da solo terrebbe ferma una metà;
 * due progetti con `workers` ciascuno (doc `class-testproject`, v1.52) cambiano il nome del progetto nel resoconto e lasciano
 * fermi i lavoratori del progetto che finisce prima.
 */
const DUE_SERVER = process.env.TALOS_PW_SERVER === '2';
/** Porte di altri (owner, laboratorio, sessioni): un secondo server non ci si siede mai sopra. */
export const PORTE_DI_ALTRI = Object.freeze([4174, 4175, 4177, 4179]);
const PORTA_TEST_2 = Number(process.env.TALOS_HARNESS_UI_TEST_PORT_2 || PORTA_TEST + 1);
if (DUE_SERVER && !process.env.TALOS_HARNESS_UI_BASE_URL) {
  for (const p of [PORTA_TEST, PORTA_TEST_2]) {
    if (!Number.isInteger(p) || p < 1024 || p > 65535) throw new Error(`porta di prova non valida: ${p}`);
    if (PORTE_DI_ALTRI.includes(p)) throw new Error(`porta di prova ${p} riservata (${PORTE_DI_ALTRI.join(', ')}): scegline un'altra con TALOS_HARNESS_UI_TEST_PORT/_2`);
  }
  if (PORTA_TEST === PORTA_TEST_2) throw new Error(`i due server di prova vogliono due porte diverse (entrambe ${PORTA_TEST})`);
}
/** Il server di questo processo: 1 nel principale e nei lavoratori pari, 2 nei lavoratori dispari (solo coi due server). */
const indiceParallelo = process.env.TEST_PARALLEL_INDEX;
const SERVER_DEL_LAVORATORE = DUE_SERVER && indiceParallelo !== undefined && Number(indiceParallelo) % 2 === 1 ? 2 : 1;

/*
 * ⛔ `TALOS_HARNESS_UI_BASE_URL` continua a vincere: serve a puntare la
 * suite a un server già acceso (debug, o il 4174 vero quando lo si vuole
 * DAVVERO). In quel caso `webServer` non deve partire, altrimenti si
 * avvierebbe un server che nessuno usa.
 */
const baseUrlEsterno = process.env.TALOS_HARNESS_UI_BASE_URL;
const baseURL = baseUrlEsterno || `http://127.0.0.1:${SERVER_DEL_LAVORATORE === 2 ? PORTA_TEST_2 : PORTA_TEST}/`;
/* ⛔ «Gettone sempre» (owner 02/11/2026): la suite gira col gettone, come l'app vera. Uno solo per corsa: Playwright carica questo file anche in ogni worker, che eredita
   l'ambiente del principale (la stessa lezione di `TALOS_PW_STORE_ISOLATO`, qui sotto). Vale solo per il server usa e getta della corsa. */
if (!baseUrlEsterno) process.env.TALOS_PW_GETTONE ??= randomBytes(32).toString('hex');
let publicDirLocale;
let STORE_ISOLATO;
let STORE_ISOLATO_2;
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
  /* Decisione 106: il secondo server ha il SUO store, nato anche lui una volta sola nel principale e ereditato dai lavoratori;
     stesso prefisso (lo pulisce anche la spazzata delle corse vecchie qui sopra) e stessa pulizia controllata all'uscita. */
  if (DUE_SERVER) {
    const ereditato2 = process.env.TALOS_PW_STORE_ISOLATO_2;
    if (!proprietario && !ereditato2) throw new Error('lavoratore coi due server senza lo store del secondo (TALOS_PW_STORE_ISOLATO_2)');
    STORE_ISOLATO_2 = ereditato2 || mkdtempSync(join(tmpdir(), 'talos-harness-test-store-'));
    process.env.TALOS_PW_STORE_ISOLATO_2 = STORE_ISOLATO_2;
  }
  const pulisci = (store) => {
    try {
      if (!existsSync(store)) return;
      const owned = realpathSync(store);
      if (dirname(owned) !== realpathSync(tmpdir())
        || !basename(owned).startsWith('talos-harness-test-store-')) {
        throw new Error('store browser fuori dalla directory temporanea prevista');
      }
      rmSync(owned, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch (error) {
      process.stderr.write(`Cleanup dello store browser fallito: ${error.message}\n`);
      process.exitCode = 1;
    }
  };
  if (proprietario) process.once('exit', () => { pulisci(STORE_ISOLATO); if (STORE_ISOLATO_2) pulisci(STORE_ISOLATO_2); });
  /* Nel lavoratore del server 2 le prove che leggono lo store sul disco (`artefatti-versioni.spec.mjs`, `semina`) devono
     trovare quello del LORO server: la variabile si riscrive solo nel processo di questo lavoratore. */
  if (SERVER_DEL_LAVORATORE === 2) process.env.TALOS_PW_STORE_ISOLATO = STORE_ISOLATO_2;
}

/** L'ambiente di un server di prova: lo stesso per i due, cambiano porta e store. */
const ambienteServer = (porta, store) => ({
  // Playwright eredita gia process.env nel processo server. Copiarlo qui
  // serializza le chiavi nel report JSON (config.webServer.env).
  TALOS_HARNESS_UI_PORT: String(porta),
  TALOS_HARNESS_UI_SESSIONS_DIR: store,
  // Isolate every desktop store, including process output, not only journals.
  TALOS_DESKTOP_DATA_DIR: store,
  // ⛔ 23/09/2026: custodia delle chiavi in memoria. Senza, una prova che salva una chiave finta
  // (BC-62) cancellava la chiave OpenRouter VERA dell'owner nel Credential Manager. Vedi
  // `src/adattatore-keyring.mjs`, `creaAdattatorePortachiaviInMemoria`.
  TALOS_HARNESS_UI_KEYRING: 'memoria',
  TALOS_SCRATCH_DIR: join(store, 'scratch'), // 24/09/2026: mai la radice vera %LOCALAPPDATA%TALOS,
  TALOS_HARNESS_UI_PUBLIC_DIR: publicDirLocale,
});
/** Un server di prova. ⛔ Si aspetta `/api/v1/health`, non la porta aperta: il server ascolta PRIMA di aver finito di
    ripristinare le sessioni, e un test che parte in quella finestra vede uno stato a metà (stesso difetto già pagato
    sull'avvio a freddo di `avviaServerHarness`). `reuseExistingServer: false`: una porta già occupata ferma la corsa
    («is already used», Playwright), mai un server di altri preso per buono. */
const serverDiProva = (porta, store, nome) => ({
  // «Gettone sempre» (owner 02/11/2026): lo script passa il gettone al server dallo stdin e stampa la riga di pronto solo quando
  // `/api/v1/health` risponde 200 COL cookie (col gettone un 401 per Playwright sarebbe già «risponde»). Vale per ognuno dei due server.
  command: 'node frontend/scripts/server-di-prova-col-gettone.mjs',
  cwd: HARNESS_UI,
  wait: { stdout: /TALOS-SERVER-DI-PROVA-PRONTO/u },
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: 'pipe',
  stderr: 'pipe',
  ...(nome ? { name: nome } : {}),
  env: ambienteServer(porta, store),
});
function webServerDiProva() {
  if (baseUrlEsterno) return undefined;
  if (!DUE_SERVER) return serverDiProva(PORTA_TEST, STORE_ISOLATO);
  return [serverDiProva(PORTA_TEST, STORE_ISOLATO, 'server-1'), serverDiProva(PORTA_TEST_2, STORE_ISOLATO_2, 'server-2')];
}

export default defineConfig({
  testDir: './tests/browser',
  // Il laboratorio modulare ha server, build e matrice propri (4175):
  // eseguirlo contro il 4174 prodotto è un falso negativo, non un gate.
  // playwright.lab.config.mjs lo include esplicitamente con testMatch.
  // I due CONFRONTO richiedono porte e mockup storici esterni alla build
  // isolata: restano leggibili/eseguibili manualmente, ma il gate R4 usa
  // il proprio test visuale deterministico sui mockup approvati.
  // L3-11 (D13, 13/10/2026): le sonde scritte per il 4174 restano fuori, anche con TALOS_HARNESS_UI_BASE_URL; rientrano solo con
  // TALOS_SONDE_4174=1 (`tests/browser/sonde-4174.mjs`). `testIgnore` e non `grepInvert`: un --grep-invert da riga di comando lo
  // sostituirebbe.
  testIgnore: ['lab-bootstrap.spec.mjs', '_confronto-exa.spec.mjs', '_confronto-fase1.spec.mjs', ...ignoraSonde4174()],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/playwright.json' }]],
  webServer: webServerDiProva(),
  use: {
    baseURL,
    /* ⛔ 03/10/2026 (fase della lingua): le prove sono scritte sull'interfaccia ITALIANA. Con la preferenza «sistema» la lingua
       la decide il browser, e Chromium in prova parte in en-US: appena i componenti hanno seguito davvero la lingua, ogni
       asserzione sul testo italiano è diventata rossa. La lingua si fissa qui; l'inglese lo provano le prove che lo chiedono. */
    locale: 'it-IT',
    /* ⛔ 31/10/2026 (barra di sinistra, variante D dell'owner): «Spazi di lavoro» nasce CHIUSO. Le prove sono scritte con quel gruppo
       aperto (cliccano Note, Libreria, Bacheca… dalla barra): come per la lingua, la scelta si fissa qui, salvata come la salverebbe
       la persona. Il valore di serie (chiuso) lo prova `barra-variante-d.spec.mjs`, che riparte da una memoria vuota.
       ⛔ 02/11/2026 (treno, 126 rosse in tre minuti): le prove condividono UN server, e la fase 8 tiene lì una copia delle preferenze che ogni
       finestra nuova applica se è più nuova dell'ultima vista (`copia-sul-server.js`). Così lingua e tema di una prova finivano nella prova dopo.
       Ogni finestra di prova parte dicendo di averla già vista: resta sua. */
    storageState: { cookies: cookieDellaCorsa(baseURL), origins: [{ origin: new URL(baseURL).origin, localStorage: [
      { name: 'talos.harness.desktop.barra.gruppi.v1', value: '{"lavoro":true}' },
      { name: 'talos.harness.desktop.settings.copy.v1', value: String(Number.MAX_SAFE_INTEGER) },
    ] }] },
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
