# Ledger a livello di codice — Nuova sessione / workspace chooser

Data: 2026-09-01  
Stato: **implementazione e gate tecnici verdi; gate visuale ufficiale bloccato dall'assenza di un browser integrato disponibile**.  
Dossier bloccante: `.claude/DOSSIER-RICERCA-WORKSPACE-CHOOSER-2026-09-01.md`.

## 1. Confine architetturale

Subsystem owner: **TALOS UI desktop + server Node locale Harness UI**.  
Mobile: sola lettura/riferimento.  
Nessun processo esterno, nessun runtime LLM, nessun TALOS-BANCO, nessun contenuto file.  
Il nuovo backend enumera directory in sola lettura; `custom-task.mjs` resta l'autorità finale di ammissione e scrivibilità della cartella.

## 2. File esatti

### Creare

- `harness-ui/src/workspace-browser.mjs`
  - `WorkspaceBrowserError extends Error`
  - `createWorkspaceBrowser(deps)`
  - metodo pubblico ritornato `browse(percorso?)`
- `harness-ui/tests/workspace-browser.test.mjs`
- `harness-ui/tests/http-routes-workspace-browser.test.mjs`
- `harness-ui/frontend/tests/browser/workspace-chooser.spec.mjs`
- `harness-ui/frontend/tests/browser/workspace-chooser-real.spec.mjs` — gate opt-in UI + endpoint reale su server isolato.
- `.claude/DOSSIER-RICERCA-WORKSPACE-CHOOSER-2026-09-01.md`
- `.claude/LEDGER-WORKSPACE-CHOOSER-2026-09-01.md`
- `.claude/CONSEGNA-WORKSPACE-CHOOSER-2026-09-01.md` al termine della fase

### Modificare

- `harness-ui/src/frequent-dirs.mjs`
  - preservare `cartelleFrequenti(deps)` senza cambio di comportamento;
  - aggiungere `cartelleConsigliate(deps)`, unione deduplicata cronologia + cartelle standard reali.
- `harness-ui/tests/frequent-dirs.test.mjs`
  - caratterizzazione permanente di compatibilità `cartelleFrequenti`;
  - RED/GREEN per `cartelleConsigliate`.
- `harness-ui/src/http-app.mjs`
  - aggiungere dipendenza `workspaceBrowser` a `createHttpApp(deps)`;
  - aggiungere `GET /api/v1/workspace-browser?path=...`;
  - non cambiare envelope `talos.harness-ui.api.v1` né error mapping pubblico.
- `harness-ui/server.mjs`
  - importare/costruire `createWorkspaceBrowser` con root del volume corrente, progetti configurati e `cartelleConsigliate`;
  - iniettare l'istanza in `createHttpApp`.
- `harness-ui/public/app.js`
  - sostituire il corpo di `openRealTaskSheet()`;
  - aggiungere funzioni private `creaWorkspaceChooser`, `caricaWorkspaceChooser`, `renderizzaWorkspaceChooser`, `selezionaWorkspaceChooser`, `gestisciTastieraWorkspaceChooser`, `aggiornaConfermaWorkspaceChooser`, `distruggiWorkspaceChooser`;
  - aggiungere token/generazione richiesta per ignorare risposte obsolete;
  - preservare `creaModelPicker`, `creaEffortPicker`, `avviaSessionePendente`, `impostaPermesso`, `showEmbeddedDialog`, `closeEmbeddedDialog`.
- `harness-ui/public/styles.css`
  - variante `.sheet-dialog--new-session`;
  - layout `.workspace-chooser*`, stati focus/selected/loading/error, footer sticky e breakpoint;
  - usare esclusivamente token `--talos-*`, `--surface-*`, `--motion-*`, `--line*`, `--accent*` già esistenti.
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
  - sostituire il test del `<select>` legacy;
  - aggiungere scenari browser nominati sotto.
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
  - aggiornare solo dopo build verificata, registrando righe/byte/SHA.
- `harness-ui/scripts/qa-visual-pipeline.mjs`
  - migrare i passi che digitano/leggono `#customTaskCartella*` verso il contratto del chooser; nessun selettore legacy nascosto introdotto soltanto per far passare la pipeline.
- `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md`
  - stato fase, risultati e debiti reali.
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
  - taccuino screenshot e discrepanze per viewport/stato.

### Eliminare

- nessun file.

## 3. Contratti pubblici stabili

Devono restare compatibili:

- `createHttpApp(deps)` e envelope API v1;
- `cartelleFrequenti(deps)` e `/api/v1/frequent-dirs`;
- `avviaSessionePendente(input)`;
- body sessione: `cartellaId` **oppure** `cartellaLibera`, mai entrambi;
- `creaModelPicker`, `creaEffortPicker` e relativi comportamenti;
- lifecycle del `sheetDialog` condiviso;
- owner server `http://127.0.0.1:4174` sempre disponibile.

Nuovo contratto:

```js
createWorkspaceBrowser({
  rootDir,
  projectDirectories,
  recommendedDirectoriesFn,
  readdirFn,
  realpathFn,
}) -> {
  browse(path?) -> Promise<{
    root, path, parent,
    items: Array<{ name, path, projectId|null }>,
    recommended: Array<{ label, path, kind, projectId|null }>
  }>
}
```

## 4. RED permanente e fallimento atteso

1. `WORKSPACE-CHOOSER-ROOT-01` — senza query parte dalla root e restituisce solo directory, un livello. Oggi endpoint/modulo non esistono.
2. `WORKSPACE-CHOOSER-LAZY-02` — una directory figlia non viene letta prima dell'espansione. Oggi non esiste un browser pre-sessione.
3. `WORKSPACE-CHOOSER-TRAVERSAL-03` — relativo, `..`, NUL, UNC, altro drive e path >1024 sono rifiutati prima di `readdir`.
4. `WORKSPACE-CHOOSER-REPARSE-04` — symlink/junction non viene offerto né attraversato.
5. `WORKSPACE-CHOOSER-PERMISSION-05` — directory illeggibile genera stato naturale stabile, non dettagli Node.
6. `WORKSPACE-CHOOSER-RECOMMENDED-06` — recenti + Desktop/Download/Documenti reali, deduplicati; il vecchio `cartelleFrequenti` resta identico.
7. `WORKSPACE-CHOOSER-SELECTION-07` — focus e selezione sono distinti; solo una directory è selezionata.
8. `WORKSPACE-CHOOSER-KEYBOARD-08` — Arrow Left/Right/Up/Down, Home/End, Enter e typeahead seguono APG.
9. `WORKSPACE-CHOOSER-DIALOG-09` — la modale usa la variante ampia a due colonne e non lascia overflow a 1440, 1280, 1024.
10. `WORKSPACE-CHOOSER-SUBMIT-10` — allowlisted invia solo `cartellaId`; arbitraria richiede esplicitamente `Full access` e invia solo `cartellaLibera`.
11. `WORKSPACE-CHOOSER-PROJECT-11` — il progetto desktop corrente resta scelta iniziale, senza configurazione manuale.
12. `WORKSPACE-CHOOSER-CANCEL-12` — X/Escape non mutano model/policy/workspace e restituiscono il focus a “Nuova sessione”.
13. `WORKSPACE-CHOOSER-REOPEN-13` — una scelta non confermata non viene ripristinata; la cronologia vera resta la sola fonte di consigli.
14. `WORKSPACE-CHOOSER-RACE-14` — una risposta lenta a una scorciatoia precedente non sovrascrive la selezione più recente.
15. `WORKSPACE-CHOOSER-ERROR-15` — errore visibile in linguaggio naturale con “Riprova” e “Apri Doctor”.
16. `WORKSPACE-CHOOSER-REDUCED-MOTION-16` — nessuna animazione residua con reduced motion.
17. `WORKSPACE-CHOOSER-NO-MUTATION-17` — assenti context menu, rename, delete, attach, drag/drop.
18. `WORKSPACE-CHOOSER-END-TO-END-18` — cartella scelta → composer → un messaggio reale Qwen 3.8 Flash → output, senza riavviare `4174`.
19. `WORKSPACE-CHOOSER-INVERSE-19` — directory arbitraria con `Workspace write` non parte e non eleva la policy da sola.
20. `WORKSPACE-CHOOSER-EMPTY-20` — root leggibile ma priva di sottocartelle mostra stato vuoto, non errore.
21. `WORKSPACE-CHOOSER-REAL-21` — UI e endpoint reale condividono il contratto su server isolato.
22. `WORKSPACE-CHOOSER-PENDING-22` — durante qualsiasi browse in-flight il submit è disabilitato; una navigazione con `select:true` invalida la selezione precedente e neppure `requestSubmit()` può avviare la cartella vecchia. Solo l'ultima risposta valida riabilita la CTA.
23. `WORKSPACE-CHOOSER-TREE-23` — ArrowRight sul nodo corrente sposta al primo figlio, ArrowLeft sul figlio torna al parent e il chevron apre la cartella con un singolo click.
24. `WORKSPACE-CHOOSER-MODAL-24` — Tab/Shift+Tab restano nel dialog e ciclano tra chiusura e ultimo controllo; lo sfondo non riceve focus.
25. `WORKSPACE-CHOOSER-ESCAPE-25` — Escape dentro model picker o planner chiude soltanto il layer annidato e restituisce il focus al trigger; un Escape successivo chiude la modale.
26. `WORKSPACE-CHOOSER-REPARSE-DIRECT-26` — un path diretto o consigliato che attraversa una junction/symlink in qualunque segmento viene rifiutato prima di `realpath`/`readdir`, anche quando il target canonico resta dentro la root.

## 5. Cicli GREEN e comandi

Focused backend:

```powershell
rtk node --test harness-ui/tests/workspace-browser.test.mjs harness-ui/tests/frequent-dirs.test.mjs harness-ui/tests/http-routes-workspace-browser.test.mjs
```

Focused browser:

```powershell
rtk npm --prefix harness-ui/frontend run test:browser -- --grep "WORKSPACE-CHOOSER"
```

Regressione:

```powershell
rtk node --test "harness-ui/tests/*.test.mjs"
rtk npm --prefix harness-ui/frontend run test:browser
rtk npm --prefix harness-ui/frontend run build
rtk npm --prefix harness-ui/frontend run verify
rtk git diff --check
```

Il comando browser esatto sarà allineato agli script presenti in `package.json`; se l'ispezione lo invalida, questo ledger viene emendato prima del prodotto.

## 6. Gate real-upstream e human-visible proof

- Nessun package upstream nuovo.
- Verifica contro i contratti WAI-ARIA tramite browser test e tastiera reale.
- Server di prova isolato (porta diversa da `4174`) per caricare il nuovo endpoint.
- Unico modello autorizzato per il messaggio reale: **Qwen 3.8 Flash**.
- Screenshot completi e ispezionati: 1440×900, 1280×800, 1024×800; default, shortcut, gate Full access, errore, tastiera, reduced motion.
- `GET http://127.0.0.1:4174/api/v1/health` deve restare 200 prima, durante e dopo.

## 7. Rollback

Rollback per file, senza cancellare cambi owner:

- rimuovere soltanto `workspace-browser.mjs` e i due test nuovi;
- rimuovere soltanto l'iniezione/rotta nuova da server/http-app;
- ripristinare il corpo precedente di `openRealTaskSheet` e le sole classi `.workspace-chooser*`;
- ripristinare snapshot solo se hash/build tornano esattamente al contratto precedente.

Mai `git reset --hard`, mai `git checkout --`, mai `git add -A`.

## 8. Gate di fermata

La fase non è green se manca una delle seguenti prove:

- test RED osservato e GREEN successivo;
- suite backend/browser/build/snapshot;
- verifica visuale reale ufficiale;
- sessione reale Qwen 3.8 Flash;
- review indipendente senza finding bloccanti;
- documenti consegna/QA aggiornati.

Blocco noto al momento della pianificazione: il browser ufficiale integrato non espone alcuna istanza. Il lavoro può arrivare fino ai gate sintetici, ma non viene dichiarato concluso senza ripristinare la prova visuale.

## 9. Esito di implementazione — 01/09/2026

### Contratti realizzati

- `createWorkspaceBrowser()` enumera in sola lettura un solo livello di directory sotto la root Windows configurata, con controllo del percorso reale e rifiuto di traversal, NUL, path relativo, altro volume e link simbolici/reparse esposti come tali.
- `GET /api/v1/workspace-browser` conserva l'envelope API v1, rifiuta query sconosciute o duplicate e restituisce errori traducibili in linguaggio naturale.
- `cartelleConsigliate()` unisce progetti consentiti, cronologia e cartelle Windows reali senza cambiare `cartelleFrequenti()` né il relativo endpoint compatibile.
- `creaWorkspaceChooser()` sostituisce integralmente il picker legacy con workbench a due colonne, albero ARIA, scorciatoie, modello, reasoning, planner e permessi.
- Una directory non allowlistata richiede un gesto esplicito su `Full access`; il submit invia `cartellaId` oppure `cartellaLibera`, mai entrambi.
- `qa-visual-pipeline.mjs` usa soltanto il nuovo contratto (`#workspaceChooser*` e scorciatoie del workbench): nessun selettore `#customTask*` è rimasto.

### Evidenza automatica e reale

- focused backend: **20/20**;
- suite backend completa: **1214/1214**;
- browser prodotto completo: **59/59**;
- focused chooser: **12/12**, con il gate reale opt-in escluso dalla corsa ordinaria;
- gate UI + endpoint reale su server isolato `4176`: **1/1**;
- unit/contract frontend: **14/14**;
- build: **23 asset**; `verify` verde;
- snapshot legacy aggiornato: `app.js` 9331 righe, 500602 byte, SHA-256 `620b6248b4a9ee860614ea445ede92fc3f12d92fed500a8e5050240ebdee3dde`; `styles.css` 2137 righe, 166866 byte, SHA-256 `1dedf9c48b5720c2d260fd09f8bad3baa992a646b04724a8c1aedd0001335b6a`;
- endpoint reale `4176`: root `C:\`, figli reali a un livello e consigli reali; `C:\Users` ha restituito `Antonino`, `Default`, `Public`;
- gate Qwen 3.8 Flash reale, server isolato con runtime owner: sessione `015def7b-bb92-4e43-be5f-3adbf61d1415`, output esatto `OK`, `RunFinished success`, 4581 token prompt, 21 completion, un giro;
- RED osservato e conservato: sessione `d78d3515-677d-4a82-9a44-96e57de23add` senza modulo runtime ha prodotto correttamente `RunError` invece di fingere una risposta;
- `qa-visual-pipeline.mjs` passa `node --check`; `git diff --check` verde;
- server owner `4174` mai riavviato e health finale **200**; server isolato `4176` fermato.

### Gate non chiudibile in questa sessione

La procedura ufficiale `browser:control-in-app-browser` ha restituito `No browser is available`; `agent.browsers.list()` ha restituito `[]` anche dopo la procedura di troubleshooting prevista dalla skill. I test Playwright provano comportamento, geometria, viewport e reduced motion ma non vengono presentati come ispezione visuale ufficiale. La fase è quindi **engineering green / visual gate blocked**, non “100% conclusa”.

### Addendum comandi Explorer — 01/09/2026

Il chooser non è più strettamente read-only: per decisione owner espone una
sola mutazione esplicita, `Nuova cartella`, confinata dagli stessi gate di
root, percorso reale e reparse point del browse. Restano esclusi rename,
delete, cut/paste e drag/drop. Sono stati aggiunti anche Aggiorna, Comprimi
tutto e Copia percorso. I nuovi scenari permanenti e i gate aggiornati sono in
`.claude/LEDGER-MODALI-FILE-EXPLORER-2026-09-01.md`.

Conteggi cumulativi correnti: backend 1219/1219, browser 70/70 scenari
ordinari, unit/contract 14/14, build 23 asset. Il gate visuale ufficiale resta
bloccato e una nuova corsa Qwen isolata non ha concluso entro il timeout, pur
essendo stata annullata correttamente.
