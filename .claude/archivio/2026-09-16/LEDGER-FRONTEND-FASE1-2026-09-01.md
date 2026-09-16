# Ledger esecutivo — Frontend desktop Fase 1

Data: 2026-09-01  
Owner: TALOS UI desktop  
Stato: GREEN verificato il 01/09/2026; RED iniziale conservato come evidenza.  
Cutover: vietato; `harness-ui/public/` e server `4174` restano invariati.

## File esatti

### Da creare

- `.claude/DOSSIER-RICERCA-FRONTEND-FASE1-2026-09-01.md`
- `.claude/LEDGER-FRONTEND-FASE1-2026-09-01.md`
- `.claude/CONSEGNA-FRONTEND-FASE1-2026-09-01.md`
- `harness-ui/frontend/index.template.html`
- `harness-ui/frontend/playwright.lab.config.mjs`
- `harness-ui/frontend/lab/index.html`
- `harness-ui/frontend/lab/main.js`
- `harness-ui/frontend/src/main.js`
- `harness-ui/frontend/src/styles/reset.css`
- `harness-ui/frontend/src/styles/index.css`
- `harness-ui/frontend/src/contracts/api-client.js`
- `harness-ui/frontend/src/contracts/host-bridge.js`
- `harness-ui/frontend/src/contracts/persistence.js`
- `harness-ui/frontend/src/contracts/routes.js`
- `harness-ui/frontend/src/contracts/session-events.js`
- `harness-ui/frontend/src/contracts/session-stream.js`
- `harness-ui/frontend/src/contracts/terminal-protocol.js`
- `harness-ui/frontend/src/contracts/terminal-transport.js`
- `harness-ui/frontend/src/assets/talos/brand/logo-short.svg`
- `harness-ui/frontend/src/assets/fonts/instrument-sans-latin-400-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/instrument-sans-latin-500-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/instrument-sans-latin-600-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/instrument-sans-latin-ext-400-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/instrument-sans-latin-ext-500-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/instrument-sans-latin-ext-600-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/jetbrains-mono-latin-400-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/jetbrains-mono-latin-500-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/jetbrains-mono-latin-ext-400-normal.woff2`
- `harness-ui/frontend/src/assets/fonts/jetbrains-mono-latin-ext-500-normal.woff2`
- `harness-ui/frontend/src/assets/xterm/LICENSE-addon-fit`
- `harness-ui/frontend/src/assets/xterm/LICENSE-addon-webgl`
- `harness-ui/frontend/src/assets/xterm/LICENSE-xterm`
- `harness-ui/frontend/src/assets/xterm/README.md`
- `harness-ui/frontend/src/assets/xterm/addon-fit.js`
- `harness-ui/frontend/src/assets/xterm/addon-webgl.js`
- `harness-ui/frontend/src/assets/xterm/xterm.css`
- `harness-ui/frontend/src/assets/xterm/xterm.js`
- `harness-ui/frontend/scripts/build.mjs`
- `harness-ui/frontend/scripts/copy-vendored-assets.mjs`
- `harness-ui/frontend/scripts/serve-lab.mjs`
- `harness-ui/frontend/scripts/verify-build.mjs`
- `harness-ui/frontend/scripts/verify.mjs`
- `harness-ui/frontend/tests/contract/build-output.test.mjs`
- `harness-ui/frontend/tests/contract/production-graph.test.mjs`
- `harness-ui/frontend/tests/contract/vendored-assets.test.mjs`
- `harness-ui/frontend/tests/contract/session-events.test.mjs`
- `harness-ui/frontend/tests/contract/terminal-protocol.test.mjs`
- `harness-ui/frontend/tests/unit/api-client.test.mjs`
- `harness-ui/frontend/tests/unit/host-bridge.test.mjs`
- `harness-ui/frontend/tests/unit/persistence.test.mjs`
- `harness-ui/frontend/tests/unit/routes.test.mjs`
- `harness-ui/frontend/tests/unit/session-stream.test.mjs`
- `harness-ui/frontend/tests/unit/terminal-transport.test.mjs`
- `harness-ui/frontend/tests/browser/lab-bootstrap.spec.mjs`

### Da modificare

- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
- `C:/Users/Antonino/Desktop/projects/TALOS-RICERCHE/2026-08-31-harness-desktop-frontend-refactor-review-plan.md`
- `harness-ui/frontend/.gitignore`
- `harness-ui/frontend/package.json`
- `harness-ui/frontend/playwright.config.mjs`
- `harness-ui/frontend/scripts/build-lab.mjs`
- `harness-ui/frontend/tests/contract/package-shape.test.mjs`

### Da eliminare

- Nessuno.

## Simboli pubblici

- Build: `buildFrontend`, `buildProduction`, `buildLab`,
  `copyVendoredAssets`, `verifyBuild`.
- Bootstrap: `createFrontendBootstrap`.
- REST: `TalosApiError`, `createApiClient`, `resolveApiUrl`.
- Route: `TALOS_DESKTOP_ROUTES`, `normalizeRoute`, `routeHref`.
- Host: `createHostBridge`.
- Persistenza: `TALOS_STORAGE_KEYS`, `createPersistence`.
- Sessioni: `SESSION_EVENT_TYPES`, `normalizeSessionEvent`,
  `createSessionStreamFactory`.
- Terminale: `DATA_FRAME`, `CONTROL_FRAME`, `encodeTerminalFrame`,
  `decodeTerminalFrame`, `createTerminalTransportFactory`.

Compatibilità immutabile: globali `__talosHarness*`, chiavi storage congelate,
23 eventi AG-UI correnti, frame terminale byte `0/1`, frammenti `/api/v1/`, URL pubblici
legacy e hash dei tre asset produttivi correnti.

## RED nominati

- `PHASE1-BUILD-PARALLEL-01`: build e `frontend/src` assenti.
- `PHASE1-PUBLIC-IMMUTABLE-01`: due build devono essere identiche e non
  cambiare hash di `harness-ui/public/{index.html,app.js,styles.css}`.
- `PHASE1-GRAPH-ISOLATION-01`: il metafile non può contenere lab, fixture o
  test.
- `PHASE1-ASSET-ALLOWLIST-01`: esattamente 19 asset, hash e licenze.
- `PHASE1-REST-BOUNDARY-01`: JSON, 204, errore controllato, abort e rifiuto di
  path fuori `/api/v1/`.
- `PHASE1-HOST-STORAGE-01`: bridge opzionale, allowlist chiavi e JSON corrotto.
- `PHASE1-STREAM-CLOSE-01`: fine attesa distinta da interruzione; close
  idempotente.
- `PHASE1-TERMINAL-FRAME-01`: frame 0/1 e teardown WebSocket idempotente.
- `PHASE1-LAB-VISIBLE-01`: laboratorio raggiungibile, dichiarato non
  produttivo, senza errori console e con bootstrap visibile.

Fallimento atteso iniziale: `ERR_MODULE_NOT_FOUND` per i moduli sotto `src/`
e build/laboratorio placeholder con exit code 2.

### Evidenza RED — 2026-09-01

`rtk npm run test:unit` ha eseguito 14 test: 2 baseline verdi e 12 fallimenti
nominali. I fallimenti sono `ERR_MODULE_NOT_FOUND` per `scripts/build.mjs` e
gli otto moduli `src/contracts`, più `package-shape` rosso perché `test:lab`
non esiste ancora. Il comando legacy `npm run build` è rimasto verde con 22
asset: questa è la prova che il RED riguarda soltanto il nuovo confine e non
ha rotto la build owner.

## GREEN e regressioni

- `rtk npm --prefix harness-ui/frontend run test:unit`
- `rtk npm --prefix harness-ui/frontend run build`
- `rtk npm --prefix harness-ui/frontend run test:lab`
- `rtk npm --prefix harness-ui/frontend run verify`
- `rtk node --test harness-ui/tests/*.test.mjs`
- `rtk git diff --check`
- `GET http://127.0.0.1:4174/api/v1/health` deve restare 200 prima e dopo.

## Prova visibile

Laboratorio isolato su `127.0.0.1:4175`, Chromium/Chrome pin del progetto:
1440×900, 1280×800 e 1024×800. Screenshot intero, console e richieste fallite.
Il confronto controlla bootstrap, gerarchia, font, focus e dichiarazione
“Laboratorio UI · non produzione”. Non è un sostituto della UI owner.

## Review indipendente

Un reviewer separato può eseguire solo test focalizzati e revisione meccanica:
coerenza ledger/diff, assenza di import mobile a runtime, nessun output
produttivo modificato, manifest deterministico, cleanup idempotente e prove
negative. Ogni finding bloccante riceve scenario permanente e correzione prima
del commit.

## Rollback

Rimuovere i nuovi sorgenti/test e ripristinare soltanto gli script frontend
modificati. `public/`, server, sessioni e configurazione non richiedono
migrazione o rollback perché non vengono modificati.

## Emendamento durante il GREEN

Il test di determinismo usa il manifest generato come sorgente dei path e non
tratta le directory ricorsive come file. Il builder marca `./fonts/*` come
external esclusivamente per preservare gli URL relativi già congelati; i byte
vengono poi copiati dall'allowlist con hash. Senza questa scelta esbuild
produrrebbe nomi font hashati e cambierebbe il contratto URL prima del cutover.

`PHASE1-MANIFEST-ORDER-02` è un nuovo scenario permanente: il primo GREEN ha
dimostrato che `localeCompare` ordina i nomi xterm diversamente dal sort
codepoint e può dipendere dalla locale. L'allowlist usa ora un confronto
codepoint esplicito; il test di determinismo legge solo i file nominati dal
manifest, senza confondere directory e asset.

`PHASE1-LAB-NETWORK-03` è un nuovo scenario permanente: il primo gate
Playwright ha rilevato il 404 della favicon implicita in tutte le viewport.
Entrambi gli HTML dichiarano ora una favicon vuota in data URL; il test
registra anche ogni risposta HTTP ≥400, oltre agli errori console e pagina.

`PHASE1-PLAYWRIGHT-ROUTING-04` è un nuovo scenario permanente: la prima suite
browser prodotto completa ha eseguito anche `lab-bootstrap.spec.mjs` contro il
server owner 4174 e ha fallito 1/39, mentre tutti i 38 scenari prodotto erano
verdi. La causa è il config prodotto senza esclusione simmetrica;
`playwright.lab.config.mjs` aveva già `testMatch`. `playwright.config.mjs` ora
dichiara `testIgnore: ['lab-bootstrap.spec.mjs']`; il gate richiede suite
prodotto e suite lab entrambe verdi nei rispettivi confini.

`PHASE2-EVENT-CONTRACT-DRIFT-19` aggiorna il conteggio storico del RED Fase 1:
la baseline originaria conteneva 19 eventi, mentre il contratto owner corrente
ne contiene 23 dopo l'introduzione dei quattro `RunRedirect*`. Adapter e test
sono stati riallineati durante la review Fase 2; non si tratta di eventi
inventati dal refactor.

## Chiusura finale

- `npm --prefix harness-ui/frontend run verify`: GREEN; build, 14 contratti,
  determinismo e laboratorio verificati.
- `npm --prefix harness-ui/frontend run test:lab`: `3/3` passati a 1440×900,
  1280×800 e 1024×800.
- Suite browser prodotto eseguita dopo il P0 lag: `76` passati, `2` gate reali
  opt-in saltati; il file lab resta escluso dal config prodotto.
- Backend desktop completo: `1259/1259`.
- `git diff --check`: pulito.
- `GET http://127.0.0.1:4174/api/v1/health`: `200`, PID owner `3640`.
- Screenshot ispezionati integralmente:
  `harness-ui/frontend/artifacts/phase-01-desktop-1440x900.png`,
  `phase-01-desktop-1280x800.png`, `phase-01-desktop-1024x800.png`.
- Nessun overflow, clipping, errore console/rete o ambiguità sul carattere
  non produttivo del laboratorio.
- Nessun cutover: `harness-ui/public/` continua a essere la UI owner; la build
  modulare resta parallela e rimovibile.

Consegna autoritativa:
`.claude/CONSEGNA-FRONTEND-FASE1-2026-09-01.md`.
