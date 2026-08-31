# Consegna — Frontend desktop Phase 0

Data: 2026-08-31  
Lane: `AVM-harness-desktop`, `lane/harness-desktop`  
Ambito: contratto frontend desktop e fondazione toolchain; nessun cutover visuale.

## Chiuso

- Baseline immutabile dei tre asset desktop reali (`harness-ui/public/app.js`, `index.html`, `styles.css`).
- Estrattore deterministico in `harness-ui/frontend/scripts/extract-legacy-contract.mjs`.
- Snapshot verificato di globali host, chiavi storage, eventi AG-UI, asset statici, famiglie endpoint e framing terminale.
- Toolchain frontend pinned in `harness-ui/frontend/package.json` e `package-lock.json`: Node 24.18–26, esbuild 0.28.2, Playwright 1.62.1, axe-core 4.13.0, pixelmatch 7.2.0, pngjs 7.0.0.
- Configurazione Playwright predisposta, con trace on-first-retry e screenshot on-failure.
- Runner unitario frontend funzionante; runner browser fail-closed quando il browser/test harness non è installato, con CLI locale ufficiale di `@playwright/test`.
- Build di laboratorio e packaging dichiarati esplicitamente non disponibili, senza produrre output fittizi.
- `VIS-001` chiuso: i badge “Demo UI · non collegato” non vengono più creati nell’URL operativo; restano disponibili solo con opt-in esplicito `#ui-lab` per l’audit.
- `VIS-002` chiuso sul cold start: branch, worktree, token, velocità, cache e capability non mostrano più numeri o nomi inventati; mostrano uno stato non osservato finché il runtime non fornisce dati reali.

## Verifiche

- `node --test harness-ui/frontend/tests/contract/legacy-contract-snapshot.test.mjs`: 2/2.
- `npm run test:unit` da `harness-ui/frontend`: 3/3.
- Suite desktop precedente: 1149/1149.
- `npm run build:ui`: 22 asset verificati.
- `npm run verify:ui`: manifest verificato.
- `npm run test:browser` con server reale su `127.0.0.1:4174`: 1/1 pass, dopo installazione Chromium pinned.
- `npm run test:browser` dopo la chiusura di `VIS-001`: 3/3 pass (shell reale, produzione senza badge, laboratorio con badge).
- `npm run test:browser` dopo la chiusura di `VIS-002`: 4/4 pass, inclusa l’asserzione contro ogni valore hard-coded del primo frame.
- `git diff --check`: pass.

## Non eseguito, correttamente

- Nessun serving cutover.
- Nessun serving cutover; `harness-ui/public/app.js` è stato modificato esclusivamente per il guard di `VIS-001`.
- Nessuna modifica a `mobile/`.
- Nessuna matrice screenshot live: il test browser baseline è passato, ma la raccolta visuale dei 12 scenari resta nella fase VIS dedicata.
- Nessun commit aggiuntivo e nessun push per questa fase.

## File creati

- `harness-ui/frontend/scripts/extract-legacy-contract.mjs`
- `harness-ui/frontend/tests/contract/legacy-contract-snapshot.test.mjs`
- `harness-ui/frontend/tests/contract/package-shape.test.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
- `harness-ui/frontend/tests/fixtures/legacy-assets.sha256`
- `harness-ui/frontend/package.json`
- `harness-ui/frontend/package-lock.json`
- `harness-ui/frontend/playwright.config.mjs`
- `harness-ui/frontend/scripts/run-node-tests.mjs`
- `harness-ui/frontend/scripts/run-browser-tests.mjs`
- `harness-ui/frontend/scripts/build-lab.mjs`
- `harness-ui/frontend/scripts/package-frontend.mjs`
- `harness-ui/frontend/.gitignore`
- `.claude/LEDGER-FRONTEND-PHASE0-CONTRACT-2026-08-31.md`

## Finding ancora aperti

- Nessun finding VIS-001/VIS-002/VIS-003/VIS-004/VIS-006 resta aperto nei test mirati; la riconferma visuale sui 12 scenari è ancora necessaria prima della chiusura finale.

## File modificati per VIS-001

- `harness-ui/public/app.js`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
- `harness-ui/frontend/scripts/run-browser-tests.mjs`
- `.claude/LEDGER-FRONTEND-PHASE0-CONTRACT-2026-08-31.md`

## Nota per la fase successiva

La differenza tra asset desktop e mobile è stata misurata: non sono copie byte-per-byte. Il refactor deve quindi mantenere la desktop lane come fonte di verità e usare il mobile soltanto per confronto di comportamento, mai come sorgente da sovrascrivere.

La prossima fase richiede l’installazione effettiva delle dipendenze frontend, il primo test browser RED e una baseline screenshot a 360×800, 768×1024, 1024×800, 1280×800 e 1440×900. Solo dopo questa evidenza sarà autorizzabile il primo cambiamento visuale.

La correzione del runner è registrata nel ledger: `harness-ui/frontend/scripts/run-browser-tests.mjs` ora invoca `@playwright/test/cli.js`, coerentemente con la documentazione ufficiale Playwright. La matrice visuale completa resta subordinata alla sequenza `VIS-001` → `VIS-002` → `VIS-003` → `VIS-004` → `VIS-006` → audit finale.
## Aggiornamento esecutivo — VIS-003/VIS-004/VIS-006

- `VIS-003` è stato chiuso nella fondazione geometrica: il browser verifica i controlli principali e la superficie Impostazioni a 1440×900, mentre il token mobile resta invariato.
- `VIS-004` è stato chiuso nel Model Lab: autore, filtri e ordinamento Hugging Face hanno nomi accessibili espliciti e il test controlla anche la geometria.
- `VIS-006` è stato chiuso nei test mirati: il browser inserisce una risposta lunga e codice non spezzabile, conferma che la pagina e il contenitore del testo non si allargano e che il codice mantiene uno scroll locale.
- Evidenza aggiornata: `npm run test:browser` 8/8 e `npm run verify` 3/3; la matrice screenshot completa dei 12 scenari resta obbligatoria e non è stata dichiarata conclusa.
- File aggiunti/modificati in questa tranche: `harness-ui/public/app.js`, `harness-ui/public/index.html`, `harness-ui/public/styles.css`, `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`, `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`, questo documento e il ledger Phase 0.
## Aggiornamento fase 7 — matrice visuale completa

La nuova suite `harness-ui/frontend/tests/browser/visual-matrix.spec.mjs` ha prodotto dodici screenshot e dodici metriche nel percorso locale ignorato `harness-ui/frontend/artifacts/visual-audit-2026-08-31/`. Sono stati controllati: tre stati vuoti, chat attiva, approvazione pendente, contenuti lunghi, Board, Impostazioni, Model Lab, Terminale, Capability Hub e reduced-motion.

Risultato: 12/12 scenari passano il controllo di viewport, assenza di overflow orizzontale della pagina, presenza della superficie interattiva e assenza di errori JavaScript inattesi. Gli screenshot sono stati aperti e ispezionati per intero.

Unico rilievo residuo: il Terminale produce avvisi `style-src 'self'` perché xterm.js tenta stili inline. Non è stato indebolito il Content Security Policy; il rilievo resta documentato nel ledger e richiede una decisione dedicata prima di poter dichiarare la console completamente silenziosa.
