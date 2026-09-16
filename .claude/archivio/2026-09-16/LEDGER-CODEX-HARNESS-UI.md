# Ledger di esecuzione — Codex Harness UI

Data: 2026-08-24  
Stato: **DA APPROVARE — NON AUTORIZZA CODICE DI PRODOTTO**  
Ricerca vincolante: `DOSSIER-RICERCA-CODEX-HARNESS-UI.md`  
Registro autoritativo: `DECISIONI-CODEX-HARNESS-UI.md`, §9

## 1. Obiettivo e confini

Creare in `C:\Users\Antonino\Desktop\projects\AVM-harness-ui` una sola Harness UI responsive, statica e locale, fedele all'intero mockup consegnato. Board/Dashboard leggono dati reali soltanto dalle due campagne consentite; tutte le altre superfici sono dummy UI funzionante con etichetta esplicita. Il server usa Node.js 24.18.0 e sola libreria standard.

Fuori perimetro:

- ogni modifica, file nuovo, lock, artefatto o commit in `TALOS-BANCO`;
- ogni modifica ad `AVM-harness`;
- ogni modifica o import da `mobile/` e `control-plane/`;
- Vue, Vite, framework, pacchetti npm, browser automation package;
- offline, service worker, IndexedDB, local-first, multi-browser, WCAG come gate, budget prestazionali bloccanti;
- deployment, hosting, LAN, CORS, autenticazione o multiutente;
- push e release.

## 2. Base, pin e upstream decision

- Worktree: `C:\Users\Antonino\Desktop\projects\AVM-harness-ui`.
- Ramo: `lane/harness-ui`.
- Base immutabile iniziale: `587f989fd3137547732b28c1446e8b588df11311`.
- Runtime: Node.js `24.18.0`, adopt direct.
- Browser di accettazione: Google Chrome Windows `151.0.7922.173`, adopt direct.
- Server/test: `node:http`, `node:fs`, `node:path`, `node:url`, `node:readline`, `node:crypto`, `node:test`.
- Upstream rifiutati: `http-server@14.1.1`, `serve-static@2.2.1`, `serve-handler@6.1.7`, `express@5.2.1`, `ajv@8.20.0`; nessuno viene installato o vendorizzato.
- Contratto standard adattato: RFC 8259, WHATWG URL/HTML dialog, CSP 3, linee guida OWASP per traversal/header.

## 3. File ledger — nessun wildcard

### 3.1 File esistenti da modificare

1. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\.github\workflows\ci.yml`
   - aggiunge il job `harness-ui` con `actions/setup-node` già pinata nel repository;
   - Node esatto `24.18.0`;
   - esegue test Node, smoke server e controlli statici senza `npm install`.
2. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\.gitignore`
   - ignora `harness-ui/.artifacts/` e `harness-ui/.tmp/`;
   - mantiene il divieto generale `banco/`, ma ri-ammette esclusivamente
     `harness-ui/tests/fixtures/banco/**`: fixture sintetiche nominate al §3.4,
     necessarie perché la regola storica altrimenti le nasconde a Git.
3. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\THIRD_PARTY_NOTICES.md`
   - registra il bundle mockup fornito dall'owner, il percorso sorgente, gli hash e lo stato reference-only delle quattro immagini; nessuna nuova dipendenza runtime.

Nessun altro file esistente viene modificato.

Amendment d'ispezione 2026-08-24: il percorso fixture approvato al §3.4 collide
con la regola preesistente `.gitignore` `banco/`. La modifica sopra è stata
registrata prima del codice di Slice 1–2; non consente né copia né versionamento
di TALOS-BANCO e ri-ammette soltanto i file sintetici sotto il percorso test
letterale.

### 3.2 Copia immutata del mockup — 18 file da creare

Destinazione comune: `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\mockup-originale\`.

1. `README.md`
2. `RESEARCH.md`
3. `UI_REVIEW.md`
4. `app.js`
5. `index.html`
6. `styles.css`
7. `talos-harness-standalone.html`
8. `preview-desktop.png`
9. `preview-laptop.png`
10. `preview-tablet.png`
11. `preview-mobile.png`
12. `preview-mobile-narrow.png`
13. `preview-mobile-review.png`
14. `preview-mobile-capabilities.png`
15. `references/claude-mobile-reference.jpg`
16. `references/deepseek-harness-reference.png`
17. `references/openclaw-workbench-reference.png`
18. `references/talos-current-reference.jpg`

La sorgente è la cartella interna `talos-responsive-harness-mockup`; lo ZIP esterno non viene copiato. I 18 file devono risultare byte-identici alla sorgente. Il manifest SHA-256 viene scritto nel file di provenienza, non dentro la copia.

### 3.3 Runtime e documentazione da creare

1. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\README.md`
   - avvio, variabili ambiente, API, limiti, distinzione real/demo, Chrome QA e troubleshooting;
   - dichiara Node 24.18.0 e il comando diretto `node harness-ui/server.mjs`;
   - documenta il comando raccomandato con Permission Model senza permessi di scrittura o child process.
2. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\PROVENANCE.md`
   - percorso e data del mockup, elenco dei 18 SHA-256, rapporto fra copia immutata e implementazione derivata, attribuzione delle immagini senza rivendicare diritti non documentati.
3. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\server.mjs`
   - unico entrypoint eseguibile;
   - carica configurazione, crea servizi/server, effettua bind e gestisce shutdown/errori senza loggare evidenze.
4. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\config.mjs`
   - parsing e validazione fail-closed della configurazione.
5. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\path-policy.mjs`
   - allowlist, `realpath`, contenimento e rifiuto traversal/symlink esterni.
6. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\jsonl-reader.mjs`
   - streaming JSONL, limiti, normalizzazione whitelist e diagnostiche per riga.
7. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\campaign-service.mjs`
   - elenco campagne, righe, filtri, ordinamento, cursori, summary trasparente, hash e timestamp.
8. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\cost-reader.mjs`
   - legge in sola lettura gli esistenti `<harness>.costo.json`, applica il
     fallback DEC-026 e conserva fonte/stato stimato.
9. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\report-source.mjs`
   - legge esclusivamente il basename fisso `<campagna>/rapporto.txt` e restituisce il blocco testuale opaco;
   - non importa né esegue codice da TALOS-BANCO e non avvia processi.
10. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\http-app.mjs`
   - router API, envelope, status code, header e limiti.
11. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\src\static-files.mjs`
    - serve solo i tre asset pubblici conosciuti; niente directory listing, fallback filesystem o MIME sniffing.
12. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\public\index.html`
    - implementazione derivata fedele al mockup completo;
    - hook DOM stabili e label demo/real.
13. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\public\styles.css`
    - stile del mockup, custom properties del tema e responsive behavior; nessun import remoto.
14. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\public\app.js`
    - interazioni dummy locali, collegamento Board/Dashboard, refresh manuale, rendering sicuro e stati QA.
15. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\scripts\qa-chrome.ps1`
    - usa esclusivamente Chrome installato per screenshot/DOM dei sei stati canonici;
    - accetta URL loopback e directory output espliciti, non avvia il server e non legge TALOS-BANCO.
16. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\RITORNO-HARNESS-UI.md`
    - compilato soltanto alla chiusura con commit, test, hash, misure, screenshot, limiti e rollback.

Non vengono creati `package.json`, `package-lock.json`, `node_modules`, file Vue/Vite o asset scaricati dalla rete.

### 3.4 Test e fixture da creare

1. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\config.test.mjs`
2. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\path-policy.test.mjs`
3. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\jsonl-reader.test.mjs`
4. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\campaign-service.test.mjs`
5. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\cost-reader.test.mjs`
6. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\report-source.test.mjs`
7. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\http-app.test.mjs`
8. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\ui-contract.test.mjs`
9. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\mockup-fidelity.test.mjs`
10. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-progetti\alpha.jsonl`
11. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-progetti\beta.jsonl`
12. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-storia\alpha.jsonl`
13. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-non-ammessi\evil.jsonl`
14. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-progetti\alpha.costo.json`
15. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-progetti\beta.costo.json`
16. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-storia\alpha.costo.json`
17. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-progetti\rapporto.txt`
18. `C:\Users\Antonino\Desktop\projects\AVM-harness-ui\harness-ui\tests\fixtures\banco\esiti-22ago-storia\rapporto.txt`

Le fixture sono sintetiche, minimali e prive di contenuti reali/credenziali. Traversal, symlink e file sovradimensionati vengono creati sotto `os.tmpdir()` durante i test e rimossi dal singolo test; non diventano file del repository. Se Windows nega la creazione del symlink, il test usa un adapter `realpath` deterministico e il gate reale ripete il caso su una junction temporanea controllata.

## 4. Simboli pubblici e contratti

Tutti gli altri simboli restano privati al modulo.

### 4.1 `src/config.mjs`

- `DEFAULT_HOST = '127.0.0.1'`
- `DEFAULT_PORT = 4174`
- `INITIAL_CAMPAIGNS = Object.freeze(['esiti-22ago-progetti', 'esiti-22ago-storia'])`
- `ConfigurationError extends Error`
- `loadConfig(env, moduleUrl)` → `HarnessUiConfig`

Variabili esatte:

- `TALOS_BANCO_DIR`: obbligatoria, assoluta, esistente e leggibile;
- `TALOS_HARNESS_UI_CAMPAIGNS`: opzionale, lista CSV che può soltanto restringere `INITIAL_CAMPAIGNS`, mai espanderla;
- `TALOS_HARNESS_UI_HOST`: default `127.0.0.1`, ammessi soltanto `127.0.0.1`, `::1`, `localhost`;
- `TALOS_HARNESS_UI_PORT`: default `4174`, intero `1024..65535`;

`HarnessUiConfig`:

```text
{ bancoDir, campaigns, host, port, publicDir }
```

### 4.2 `src/path-policy.mjs`

- `PathPolicyError extends Error`
- `isPathInside(rootRealPath, candidateRealPath)` → boolean
- `createPathPolicy({ bancoDir, campaigns, fsAdapter })` → `PathPolicy`

`PathPolicy` espone:

- `initialize()`
- `listCampaigns()`
- `resolveCampaignDir(campaign)`
- `listJsonlFiles(campaign)`
- `resolveHarnessCostFile(campaign, harness)`
- `resolveReportFile(campaign)`

Nessuna API accetta un percorso file dal browser.

### 4.3 `src/jsonl-reader.mjs`

- `MAX_JSONL_FILE_BYTES = 16_777_216`
- `MAX_JSONL_LINE_BYTES = 1_048_576`
- `MAX_CAMPAIGN_ROWS = 10_000`
- `JsonlReadError extends Error`
- `normalizeRunRow(value, source)` → `{ row } | { diagnostic }`
- `readJsonlFile(file, limits)` → async iterator di row/diagnostic
- `readCampaignRows(pathPolicy, campaign, limits)` → `CampaignRead`

`RunRow`:

```text
{
  rowKey, harness, id, difficolta, esito, ms, costoUsd,
  corpus, modello, quota, quando, giriDelTask,
  detto, cambiamenti: { quanti } | null,
  source: { file, line }
}
```

`source.file` è solo il basename, mai un percorso assoluto. Campi mancanti opzionali diventano `null`; tipi incompatibili generano diagnostica e non coercizioni nascoste. `giriDelTask` conserva solo `{ esito, ms, costoUsd }` per giro.

`CampaignRead`:

```text
{ campaign, rows, diagnostics, sourceFiles, readAt, sourceHash }
```

### 4.4 `src/cost-reader.mjs`

- `CostReadError extends Error`
- `normalizeCostFile(value, harness)` → `HarnessCost | null`
- `readHarnessCost(pathPolicy, campaign, harness, rows)` → `HarnessCost`
- `readCampaignCosts(pathPolicy, campaign, rowsByHarness)` → `HarnessCost[]`

`HarnessCost`:

```text
{
  harness, costoUsd,
  source: 'cost-file' | 'row-sum' | 'unavailable',
  estimated, rowsWithoutCost
}
```

Il file costo è derivato esclusivamente dal basename di un JSONL già scoperto;
non arriva mai dall'URL. Valore mancante o invalido usa il fallback alle righe;
se nessuna riga ha costo, `costoUsd` è `null`, mai zero.

### 4.5 `src/campaign-service.mjs`

- `DEFAULT_PAGE_SIZE = 40`
- `MAX_PAGE_SIZE = 100`
- `CampaignQueryError extends Error`
- `encodeCursor(sortTuple)` → string opaca
- `decodeCursor(cursor)` → sort tuple validata
- `summarizeCampaign(rows, costs, diagnostics)` → `CampaignSummary`
- `createCampaignService({ pathPolicy, costReader, reportSource, clock })` → `CampaignService`

`CampaignService` espone:

- `listCampaigns()`
- `getSnapshot(campaign)`
- `listRuns(campaign, query)`
- `getReport(campaign)`

`CampaignDescriptor`:

```text
{ name, available, jsonlFiles, lastModifiedAt }
```

`RunPage`:

```text
{ items, nextCursor, totalMatched, sourceHash, readAt, diagnostics }
```

Ordinamento predefinito deterministico: `harness ASC`, `id ASC`, `source.file ASC`, `source.line ASC`. Filtri ammessi: `harness`, `esito`, `cursor`, `limit`; nessun regex proveniente dal client.

`CampaignSummary` espone metriche con provenienza esplicita:

```text
{
  totalRows, measuredRows, majorityPassedRows, passRate,
  canonicalCostUsd, costEstimated, rowsWithoutCost,
  harnesses, outcomeCounts, diagnosticCount,
  metricProvenance: 'existing-bank-contract'
}
```

Ogni elemento `harnesses` combina conteggi/pass-rate con il relativo
`HarnessCost`. Un costo con `source: 'row-sum'` viene sempre mostrato con `~` e
spiegazione; `unavailable` viene mostrato come `—`, mai `$0`.

### 4.6 `src/report-source.mjs`

Contratto pubblico fermo:

- `ReportSourceError extends Error`
- `MAX_REPORT_BYTES = 2_097_152`
- `createReportSource(pathPolicy, fsAdapter)` → `ReportSource`
- `ReportSource.read(campaign)` → `CampaignReport`

`CampaignReport`:

```text
{ campaign, text, capturedAt, sourceHash, provenance }
```

`text` resta opaco: nessun parser, regex o estrazione metrica. La sorgente è
sempre il basename fisso `rapporto.txt` nella campagna allowlisted. Se il file
non esiste, `read()` restituisce `REPORT_UNAVAILABLE` con il messaggio pubblico
`Rapporto non ancora prodotto`; non crea il file e non avvia alcun comando.

### 4.7 `src/http-app.mjs` e `src/static-files.mjs`

- `API_SCHEMA = 'talos.harness-ui.api.v1'`
- `createHttpApp({ campaignService, staticHandler, clock })` → request listener Node
- `createStaticHandler(publicDir, fsAdapter)` → static handler

Route pubbliche esatte:

- `GET /api/v1/health`
- `GET /api/v1/campaigns`
- `GET /api/v1/campaigns/{campaign}/snapshot`
- `GET /api/v1/campaigns/{campaign}/runs?harness=&esito=&cursor=&limit=`
- `GET /api/v1/campaigns/{campaign}/report`
- `GET /`, `GET /index.html`, `GET /styles.css`, `GET /app.js`
- `HEAD` sulle stesse route; ogni altro metodo `405`.

Envelope successo:

```text
{ ok: true, data, meta: { schema, generatedAt, sourceHash? } }
```

Envelope errore:

```text
{ ok: false, error: { code, message, details? }, meta: { schema, generatedAt } }
```

Codici errore pubblici: `CONFIG_INVALID`, `CAMPAIGN_NOT_ALLOWED`, `CAMPAIGN_UNREADABLE`, `ROW_INVALID`, `QUERY_INVALID`, `REPORT_UNAVAILABLE`, `PAYLOAD_LIMIT`, `METHOD_NOT_ALLOWED`, `NOT_FOUND`, `INTERNAL_ERROR`. `INTERNAL_ERROR` non espone stack o percorsi.

Asset statici ammessi con mapping fisso: `/index.html`, `/styles.css`, `/app.js`. Nessun URL viene concatenato a un path filesystem.

### 4.8 `public/app.js`

Nessuna API JavaScript globale. Entry point privato `bootstrapHarnessUi()` su `DOMContentLoaded`.

Hook DOM pubblici/stabili per test e QA:

- `[data-real-surface='campaigns']`
- `[data-real-surface='summary']`
- `[data-real-surface='runs']`
- `[data-real-surface='report']`
- `[data-action='refresh-campaign']`
- `[data-action='load-more-runs']`
- `[data-action='clear-evidence']`
- `[data-demo-surface]`
- `[data-connection-state]`

Comportamenti obbligatori:

- la Board sceglie una campagna allowlisted e mostra summary, righe e report;
- `Aggiorna` effettua nuove GET e mostra `readAt` + `sourceHash`;
- `Carica altri` preserva focus/posizione e usa il cursore;
- `detto` viene creato con `textContent` solo quando l'owner apre la riga;
- `Svuota evidenze` rimuove dalla memoria/DOM i testi `detto`, senza scrivere o cancellare file;
- ogni superficie senza backend mostra `Demo UI · non collegato` localmente;
- nessuna stringa del banco passa a `innerHTML`, `insertAdjacentHTML`, `document.write`, URL eseguibili o attributi evento;
- `?qa=desktop|laptop|tablet|mobile|mobile-narrow|capabilities` seleziona soltanto lo stato visivo deterministico per screenshot e non cambia dati o privilegi.

## 5. Ledger TDD: RED, GREEN e regressioni

### Slice 0 — copia e provenienza

RED:

- `mockup-fidelity.test.mjs :: source manifest contains exactly the 18 approved files` fallisce perché la destinazione non esiste.
- `mockup-fidelity.test.mjs :: every copied byte matches the recorded SHA-256` fallisce prima della copia.

GREEN:

```powershell
node --test harness-ui/tests/mockup-fidelity.test.mjs
git diff --check
```

Commit previsto: `harness-ui: preserve approved mockup reference`.

### Slice 0.5 — intero mockup visibile prima del backend

Questa slice applica il gate sequenziale di `CONSEGNA-CODEX-HARNESS-UI.md`
§3: nessuna slice backend può iniziare finché l'intero mockup non ha una
controparte visibile e verificata.

File prodotti in questa slice:

- `harness-ui/public/index.html`
- `harness-ui/public/styles.css`
- `harness-ui/public/app.js`

RED permanenti:

- `all mockup surface ids remain present in production HTML`
- `every non-real surface owns a local Demo UI label`
- `all mockup interactions have a working UI-only counterpart`
- `all CSS and JS assets are local`
- `six canonical QA states map to the approved preview names and dimensions`

GREEN automatico:

```powershell
node --test harness-ui/tests/ui-contract.test.mjs harness-ui/tests/mockup-fidelity.test.mjs
```

GREEN umano, prima di `config.mjs`:

- apertura diretta della UI statica in Chrome;
- confronto side-by-side con ogni superficie del mockup originale;
- esercizio delle interazioni dummy locali;
- verifica dei sei stati canonici;
- conferma che ogni superficie sia presente e che quelle non collegate dicano
  localmente `Demo UI · non collegato`.

Commit previsto: `harness-ui: implant complete responsive mockup`.

**Gate d'ordine:** Slice 1 resta bloccata finché Slice 0.5 non è verde e il
riepilogo semplice dello step non è stato consegnato all'owner.

### Slice 1 — config e confine filesystem

RED permanenti:

- `config rejects missing TALOS_BANCO_DIR`
- `config rejects non-loopback host`
- `config cannot expand the campaign allowlist`
- `path policy rejects unknown campaign`
- `path policy rejects dot-dot, encoded dot-dot and Windows separator traversal`
- `path policy rejects absolute and UNC input`
- `path policy rejects a symlink or junction escaping bancoDir`

GREEN:

```powershell
node --test harness-ui/tests/config.test.mjs harness-ui/tests/path-policy.test.mjs
```

### Slice 2 — lettore JSONL e contratto sicuro

RED permanenti:

- `valid row preserves only the approved fields`
- `unknown fields never cross the normalization boundary`
- `missing optional cambiamenti is null, not a crash`
- `non-binary esito is preserved verbatim`
- `malformed line yields a line diagnostic and later rows remain readable`
- `non-object JSON yields a diagnostic`
- `file, line and campaign limits fail closed`
- `detto remains complete text and is never logged`
- `giriDelTask strips fields outside esito/ms/costoUsd`

GREEN:

```powershell
node --test harness-ui/tests/jsonl-reader.test.mjs
```

### Slice 3 — servizio campagne e metriche

RED permanenti:

- `campaign list contains only the configured intersection of the fixed allowlist`
- `run order and cursor are deterministic`
- `filters accept only exact harness and esito values`
- `refresh rereads files and changes readAt/hash without a watcher`
- `summary counts every observed non-binary outcome without coercion`
- `summary labels row cost provenance explicitly`
- `report text is returned byte-for-byte and never parsed`
- `canonical cost uses matching harness cost file before row sum`
- `missing cost file falls back to row sum and marks estimate`
- `missing file and missing row costs returns null, never zero`
- `cost file cannot be selected by browser input`

RED noto che richiede decisione:

- `report source returns rapporto.txt byte-for-byte without executing code` usa la fixture e deve diventare verde.
- `missing rapporto.txt returns Rapporto non ancora prodotto and creates nothing` deve diventare verde.
- `storia displayed cost uses canonical cost files, not the 1.365090835 row sum` deve diventare verde sul gate reale; il valore atteso aggregato è `0.660550154`.

GREEN focalizzato, dopo le decisioni:

```powershell
node --test harness-ui/tests/cost-reader.test.mjs harness-ui/tests/campaign-service.test.mjs harness-ui/tests/report-source.test.mjs
```

### Slice 4 — HTTP e security envelope

RED permanenti:

- `server binds to configured loopback only`
- `api serves the exact five GET resources and HEAD`
- `api rejects POST PUT PATCH DELETE and OPTIONS with 405 and no CORS`
- `static handler serves only three mapped assets and has no directory listing`
- `response headers apply CSP, nosniff, frame denial and no-store to data`
- `errors never expose absolute paths, stack or row evidence`
- `oversized query, cursor, JSONL or report returns a bounded error`
- `client abort closes work cleanly`
- `static index accepts only the six canonical qa states and rejects every
  other query` — regressione scoperta in Slice 5: il router iniziale applicava
  il divieto query anche a `/?qa=...`, rendendo impossibile il gate responsive
  già obbligatorio al §4.8 e §7. L'eccezione resta limitata al solo parametro
  `qa`, ai sei valori canonici e alle sole route `/` e `/index.html`.

GREEN:

```powershell
node --test harness-ui/tests/http-app.test.mjs
```

### Slice 5 — collegamento dei dati reali alla UI già completa

RED permanenti:

- `Board owns all four real surface hooks`
- `fetched data has no innerHTML execution sink`
- `refresh, load more and clear evidence actions exist`
- `real Board integration does not remove or relabel any mockup surface`
- `load more restores focus only after the temporary disabled state ends` —
  regressione scoperta nel gate Chrome della Slice 5: il gestore tentava di
  rifocalizzare il pulsante mentre era ancora `disabled`, facendo tornare il
  focus alla scheda Board. La prova permanente impone un punto di focus
  visibile dopo ogni pagina e posizione di scorrimento invariata.
- `laptop session demo badge has a dedicated non-overlapping slot` —
  regressione scoperta nel gate Chrome 1024×800 della Slice 5: l'etichetta
  locale della superficie demo copriva il marchio TALOS. La regola responsive
  deve riservarle spazio sotto la testata senza nasconderla.
- `mobile capability demo badge does not cover the close control` —
  regressione scoperta nello stato canonico capabilities 390×844 della Slice
  5: l'etichetta locale attraversava il pulsante di chiusura. Il foglio mobile
  deve avere una riga di testata abbastanza alta e uno spazio dedicato per
  mostrare entrambe le informazioni senza collisioni.
- `CSP-safe UI never emits inline style mutations` — regressione scoperta
  attraversando i sei stati in Chrome: due attributi `style` del mockup e tre
  scritture JavaScript sullo stile venivano correttamente rifiutati dalla CSP
  `style-src 'self'`. La UI deve usare soltanto classi locali, attributi non
  eseguibili e CSS statico, mantenendo intatta la CSP.
- `network failures use an owner-actionable local message` — regressione
  scoperta spegnendo il server nel gate Chrome mobile: il browser mostrava il
  testo tecnico `Failed to fetch`. Ogni errore privo di un codice pubblico del
  server deve invece spiegare che il server locale non risponde e invitare ad
  avviare Harness UI e riprovare.

GREEN automatico:

```powershell
node --test harness-ui/tests/ui-contract.test.mjs harness-ui/tests/mockup-fidelity.test.mjs
```

GREEN umano in Chrome:

- nuova verifica che la UI completa già approvata nella Slice 0.5 non sia
  regredita dopo il collegamento dati;
- Board con 40 righe reali di `esiti-22ago-storia`, poi 120 di `esiti-22ago-progetti`;
- refresh, filtro, paginazione, dettaglio `detto`, cancellazione evidenze e stato errore;
- nessun overflow orizzontale nei sei stati canonici.

Commit previsto: `harness-ui: connect safe campaign board`.

### Slice 6 — QA, CI e chiusura

Suite completa:

```powershell
node --test harness-ui/tests/*.test.mjs
git diff --check
```

Job CI: stesso comando con Node 24.18.0; nessun install.

Smoke reale, read-only:

1. manifest SHA-256 e timestamp delle due directory campagne prima del test;
2. avvio server con `TALOS_BANCO_DIR` e allowlist esatti;
3. chiamata a health, campaigns, snapshot, runs e report;
4. rendering in Chrome 151.0.7922.173;
5. nuovo manifest SHA-256/timestamp;
6. gate verde soltanto se i manifest sono identici.

Misure non bloccanti da riportare: tempo start server, tempo prima risposta, tempo snapshot 40/120 righe, dimensione payload, tempo screenshot per stato, conteggio diagnostiche. Nessuna soglia di pass/fail.

Regressione permanente scoperta nel gate Slice 6:

- `qa-chrome uses CDP viewport emulation instead of cropped Windows windows` —
  Chrome headless su Windows applica una larghezza minima alla finestra: i
  primi PNG 390/320 erano ritagli di un layout CSS più largo. Lo script deve
  usare `Emulation.setDeviceMetricsOverride`, verificare `innerWidth`,
  `innerHeight` e overflow nel DOM, quindi acquisire con
  `Page.captureScreenshot`; il solo `--window-size` non è prova valida.
- `qa-chrome leaves no disposable Chrome profile` — Windows può rilasciare i
  lock del profilo qualche istante dopo l'arresto. Lo script deve riprovare la
  rimozione in un intervallo limitato e fallire se resta una directory
  `.chrome-profile-*`, senza interferire con altri processi Chrome.

Commit previsto: `harness-ui: add local QA and CI gate`.

## 6. Gate upstream reale

- Node realmente eseguito: `node --version` deve essere `v24.18.0` localmente e in CI.
- Nessun `package.json`, lockfile o `node_modules` aggiunto sotto `harness-ui/`.
- Ricerca statica: nessun import non `node:` nel server; nessun URL remoto in HTML/CSS/JS.
- Chrome realmente eseguito: ProductVersion registrata nel ritorno; per questo ledger `151.0.7922.173`.
- Le API vengono provate sulle due directory reali; le fixture non sostituiscono il gate.
- Il report reale viene esercitato end-to-end soltanto quando i proprietari
  delle due corse hanno prodotto i rispettivi `rapporto.txt`; l'assenza è una
  dipendenza esterna dichiarata, non un motivo per eseguire lo script dalla UI.
- La parità costo/rapporto usa DEC-026 e viene esercitata quando il rapporto
  reale è disponibile; nessun mock può sostituire il confronto.

## 7. Prova umana visibile — sei stati canonici

1. desktop — `1440×900`, Board iniziale;
2. laptop — `1024×800`, Board con righe reali;
3. tablet — `768×1024`, navigazione/pannelli;
4. mobile — `390×844`, composer e Board;
5. mobile stretto — `320×720`, nessun overflow;
6. capacità — `390×844`, sheet capabilities aperto.

`preview-mobile-review.png` viene verificato nel confronto completo delle superfici ma non crea una settima dimensione. Il gate usa un solo browser, non device fisici obbligatori.

## 8. Rollback

- Ogni slice è un commit autonomo e non viene pushata.
- Il rollback preferito è `git revert <commit>` in ordine inverso; non si usa `reset --hard` e non si cancellano modifiche dell'owner.
- La copia mockup è isolata nel primo commit e può essere verificata o ripristinata indipendentemente.
- Le uniche modifiche fuori `harness-ui/` sono i tre file elencati al §3.1.
- TALOS-BANCO non richiede rollback perché il manifest prima/dopo deve essere identico e nessuna operazione di scrittura è prevista.

## 9. Criterio di done

La feature è chiusa soltanto quando:

- i due `rapporto.txt` sono stati prodotti dai proprietari delle corse, oppure
  la consegna dichiara esplicitamente non soddisfatto il gate end-to-end del
  rapporto senza sostituirlo con dati finti;
- questo ledger aggiornato è approvato esplicitamente;
- tutti i RED nominati sono verdi o rimossi dall'accettazione con decisione esplicita;
- la suite completa, CI, smoke reale e sei prove Chrome sono freschi e documentati;
- ogni superficie non reale è localmente etichettata demo;
- il manifest TALOS-BANCO prima/dopo è identico;
- `RITORNO-HARNESS-UI.md` contiene prove, misure, limiti e commit;
- non è stato eseguito alcun push.

Alla chiusura di ogni slice il main agent consegna inoltre un riepilogo semplice
ma esaustivo, non tecnico: lavoro svolto, significato pratico, prove ottenute e
passo o decisione successiva. Il riepilogo è parte del gate della slice, non un
extra facoltativo.

## 10. Decisioni e dipendenze residue

### GATE-L01 — risolto da DEC-015 e DEC-054

Harness UI legge `<campagna>/rapporto.txt` e non avvia processi. Il proprietario
della corsa produce il file tramite redirect di shell quando la campagna è
pronta. Al 2026-08-24 entrambi i file reali mancano: dipendenza del gate non
soddisfatta, non decisione aperta.

### GATE-L02 — risolto da DEC-026

Harness UI legge gli esistenti `<harness>.costo.json` come fonte primaria;
fallback alla somma delle righe marcata `~`; assente `null`. Non è una domanda
aperta e non richiede modifiche al banco.

Non risultano domande bloccanti nel perimetro ridotto. Restano soltanto la
produzione esterna dei due `rapporto.txt` e l'approvazione esplicita di questo
ledger prima del codice.
