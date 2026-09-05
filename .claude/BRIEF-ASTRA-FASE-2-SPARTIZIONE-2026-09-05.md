# BRIEF per Astra — Fase 2, la spartizione: metà della nuova interfaccia la fai tu (05/09/2026)

> Autosufficiente: qui c'è tutto quello che serve per lavorare senza chiedere. Se una cosa
> non c'è, è nel repo al percorso indicato. Se una premessa è falsa, vale il §9.
> Base: commit **`1813e27a`** del worktree `AVM-harness-desktop` (branch `lane/harness-desktop`).

## 0. In una frase

Il mockup approvato (`.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html`) **è diventato il corpo
della app** e il monolite (`harness-ui/frontend/src/legacy/app.js`) è il cervello che ci gira
dentro. Ora ogni funzione del monolite che disegna DOM va rifatta come **componente** che
emette *esattamente* il blocco del mockup a partire dai dati veri dell'API. Il lavoro è diviso
in due metà: **la chat e tutto ciò che le sta attorno la faccio io** (Claude, sessione
desktop); **le pagine, i pannelli, il terminale e i dialoghi li fai tu**. Ogni componente
chiude solo con il cancello di parità verde **e** il confronto visivo fatto a occhio contro
il mockup **e** contro la app originale. L'owner accetta solo questo: niente skip, niente
«quasi», niente componente rotto.

Questo brief **si somma** a `BRIEF-ASTRA-SCHERMATE-MANCANTI-MOCKUP-2026-09-05.md` (le 7
schermate da disegnare NEL mockup): quello è la **parte A** e va fatta **per prima**, perché
Terminale/Browser/dialoghi/toast/albero che disegni lì sono i blocchi che poi rendi vivi qui.
Le sue regole (§0-bis navigare il mockup da solo, §3 non violare lo stile, §4 accettazione
schermata per schermata dall'owner) valgono anche qui, parola per parola — con UNA eccezione:
il «non toccare `harness-ui/`» del suo §3 vale solo per la parte A; nella parte B il tuo
perimetro dentro `harness-ui/frontend/` è quello del §5 di questo brief.

## 1. La spartizione (equa per peso, non per conteggio)

| chi | schermate / blocchi | funzioni del monolite (ancore per NOME, in `src/legacy/app.js`) |
|---|---|---|
| **io** | Sidebar (SessionItem ✅ fatto, NavItem, NavGroup, WorkspaceFooter), Topbar+Tabs, **Chat** (Turn, Message, ActivityBundle, ToolRow, ToolFailure, ApprovalCard, DiffView, SignedReceipt, SystemNote, TouchedFiles, skeleton), Piede (StatusStrip, MessageQueue, Composer ridimensionabile, StatusBar), Chat vuota, **Review** (riusa il mio DiffView), Fase 3 cutover, review di ogni tuo commit | `aggiornaElencoSessioniReali`, `statoSessione`, `aggiornaSottotitoloSessione`, `appendRealTaskStart`, `appendUserFollowUp`, `ensureAssistantMessageElement`, `apriBatchSeServe`, `appendToolNote`, `appendApprovalCard`, `appendStatusNote`, `appendArtifactCard`, `mostraAttesaRisposta`, `syncRunComposerState`, `renderizzaBannerCoda`, `aggiornaContatoreUsage`, `setupComposerResize`, `costruisciConversationHero`, `renderRealReviewList`, `updateRealReview` |
| **tu** | **A.** le 7 schermate mancanti nel mockup (brief A) · **B1** Terminale (TerminalPane + schede) · **B2** Colonna destra (InspectorCard, TurnIndex, TouchedFiles, ProcessRow, albero file) · **B3** Board (DataTable, FilterChips, Select) · **B4** Capability (Tabs, ToolList, DetailPanel, PendingList, ScopeNote) · **B5** Memoria · Attività · Libreria · Ricerca · Officina · Automazioni (MemoryRow, TaskRow, LibraryRow, ReportRow, ForgeList+CodeBlock, AutomationRow) · **B6** Impostazioni + Doctor + Model Lab (SettingsNav, SettingsSection, SettingRow, Switch, SeverityCount, CheckCard) · **B7** Dialoghi (veloNuova, veloPermessi, veloAlbero, Dialog generico, palette comandi, intro, toast) · **B8** le meccaniche della regia dentro la app (sidebar a icone, densità, tema chiaro, lingua — persistite in `talos.harness.desktop.settings.v1`) | `montaTerminaleSeServe`, `impostaChipTerminale`, `aggiornaPannelloAmbiente`, `caricaAlberoSessione`, `renderSessionsBoard`, i 12 `caricaPannello*`, `rigaFiglio`, `rigaHook`, `rigaAttrezzo`, `rigaVoceLibreria`, `rigaNota`, `rigaAttivita`, `rigaMemoria`, `rigaRicerca`, `rigaToolForgiato`, `rigaSkill`, `rigaServerMcp`, `rigaPlugin`, `inizializzaSettingsNavigation`, `eseguiDoctor`, `openSheet` (tutti i fogli), `openRealTaskSheet`, `creaWorkspaceChooser` |

Ordine consigliato per te: **A → B3 → B5 → B4 → B6 → B2 → B7 → B1 → B8** (dalle pagine
«dati → righe», che sono il tuo SessionItem, verso le cose con più meccanica). Ogni lettera è
una consegna a sé, con il suo commit e il suo sì dell'owner.

## 1-bis. Aggiornamento 05/09 sera (commit `9d1db1ba`): cosa è già fatto da Claude

Fatti e verificati dal vivo (ledger `LEDGER-FASE-2-CLAUDE-2026-09-05.md`): S-01 SessionItem, S-02 NavItem,
S-03 WorkspaceFooter, S-04 Topbar (+ Comandi/Comprimi/Dettagli), S-05 Conversazione, S-06 ChatFooter
(composer con maniglia ricordata, chip, microfono, Reindirizza), S-07 Review **a schede** (ordine
dell'owner: schede in alto, diff a tutta larghezza), S-08 stato vuoto, S-09 le due colonne si
comprimono e si ricordano. ⛔ Di B8 resta a te SOLO: densità, tema chiaro, lingua (la sidebar a icone
è fatta). ⛔ Prima di ogni edit: `merge lane/harness-desktop`.

## 2. Com'è fatta la app oggi (leggi questi file, nell'ordine, prima di toccare qualcosa)

```
harness-ui/frontend/
  index.template.html            il corpo: il markup del mockup, SENZA la sua regia (generato da scripts/mockup-to-template.mjs — NON si edita a mano)
  src/styles/index.css           il CSS del mockup (generato dallo stesso script — NON si edita a mano)
  src/main.js                    monta il ponte, poi importa il monolite (ordine obbligatorio)
  src/bridge/legacy-dom.js       IL PONTE: assegna al DOM del mockup gli id/classi/data-* che il monolite cerca; monta i frammenti legacy nascosti
  src/legacy/frammenti.html      il DOM del monolite che il mockup non ha (strato nascosto + strato visibile)
  src/legacy/app.js              IL CERVELLO: copia del monolite (13.968 righe), con le patch «05/9» marcate nei commenti
  src/components/session-item.js IL COMPONENTE DI RIFERIMENTO: leggilo tutto, è il modello di ogni tuo componente
  lab/main.js + lab/fixtures/    il laboratorio: rende il template con fixture VERE al posto dei dati finti del mockup
  tests/parity/parita.spec.mjs   cancello 1: pagina statica ↔ mockup (54/54, DEVE restare verde)
  tests/parity/componenti.spec.mjs + aiuto.mjs   cancello 2: componente dai dati ↔ mockup (struttura + parole + pixel)
  playwright.lab.config.mjs / playwright.componenti.config.mjs
  scripts/mockup-to-template.mjs rigenera template+css dal mockup (dopo OGNI modifica al mockup)
.claude/PIANO-MOCKUP-DIVENTA-LA-APP-2026-09-05.md   il piano (§5 = tabella del ponte degli id; §4 = cancello di chiusura)
.claude/MOCKUP-REDESIGN-TALOS-2026-09-04.html         il bersaglio (93 blocchi data-c, 276 classi talos-*, sprite di 29 simboli)
```

Fatti che decidono tutto:
- Il monolite trova gli elementi **per id e data-\*** (160 id, ~40 data-*), mai per struttura.
  Il ponte (`legacy-dom.js`) assegna quegli id agli elementi del mockup. Se il tuo componente
  sostituisce un elemento che il monolite cerca per id, **l'id resta** sull'elemento nuovo.
- Il mockup ha un attributo di radice `data-vista` (`sessione` per Chat/Vuota/Terminale/Review,
  `pagina` per il resto: nasconde la colonna destra e cambia la griglia) e `data-schermo`.
  `setView` del monolite li imposta già (patch 05/9). Non inventare un secondo meccanismo.
- Il contratto congelato (`tests/contract/legacy-contract-snapshot.test.mjs`): 7 chiavi di
  `localStorage`, 23 tipi di evento, 19 frammenti di endpoint. **Non si cambia** finché la Fase 3
  non lo sblocca, una volta sola.
- I nomi tecnici **non vanno a schermo** (owner 04/09): `web_search`, `tool_create`,
  `document_create` diventano nomi umani in UN solo posto (`src/app/nomi-attrezzi.js` esiste già
  come mappa; riusala o spostala, non duplicarla). I nomi che riceve il **modello** non si toccano.
- Lingua: la app è italiana per default; i cancelli girano con `locale: 'it-IT'` perché la regia
  del mockup traduce da `navigator.language`. Non aggiungere testo inglese.

## 3. Il metodo, passo per passo (è quello che ha prodotto SessionItem; non si salta nulla)

1. **Ricerca web prima di scrivere** (regola dell'owner, vale anche per te): prima di ogni
   componente, una ricerca sullo stato dell'arte di *quel* pezzo (tabelle accessibili, tab
   pattern WAI-ARIA, dialog nativo `<dialog>`, resize di pannelli, terminale xterm, ecc.) e
   **fonte + data nel ledger e nel commit**. Senza citazione, la ricerca non c'è stata.
2. Apri il blocco nel mockup (`grep -n 'data-c="NomeBlocco"'`) e **copia il markup esatto**:
   stessi tag, stesse classi `talos-*`, stesso `data-c`, stesse icone `<use href="#i-…">`.
3. Leggi la funzione del monolite che oggi disegna quel pezzo e i dati che riceve (l'endpoint:
   `grep -n "api/v1" src/legacy/app.js` dentro la funzione; la forma vera si legge con un
   `curl` sulla tua istanza, §6). **Le fixture si scrivono nella forma vera dell'API**, mai
   inventate: `lab/fixtures/<nome>.js`, con `ADESSO` fisso per date e ore.
4. Scrivi `src/components/<nome-blocco>.js`: `crea<Blocco>(dati, opzioni)` → `HTMLElement`,
   funzioni pure per le derivazioni (stato, ora compatta, nome modello…) esportate e testate
   con `node --test` in `tests/unit/`. Niente innerHTML con dati non escapati; niente CSS nuovo
   (il CSS è quello del mockup: se manca, prima si disegna NEL mockup — brief A — e si
   rigenera il template).
5. Aggiungi al `LABORATORI` di `lab/main.js` la voce che toglie le righe finte del mockup e
   monta le tue dalle fixture; aggiungi la riga in `COMPONENTI` di
   `tests/parity/componenti.spec.mjs` (`nome`, `schermata`, `selettore` del contenitore).
6. `cd harness-ui/frontend && TALOS_LAB_PORT=4178 npx playwright test --config=playwright.componenti.config.mjs`
   → verde a 1440/1280/1024. Poi **apri le due immagini** in `artifacts/parita/comp-<Nome>-*-mockup.png`
   e `-app.png` e guardale tu: si scrivono sempre, anche a verde, proprio perché un verde
   sotto soglia non esonera dal guardare.
7. **Innesto nel monolite**: la funzione originale in `src/legacy/app.js` chiama il tuo
   componente al posto del suo DOM (import in testa al file, commento `// 05/9 Fase 2: <Blocco>`
   sul punto toccato). Tocchi **solo le funzioni della tua metà** (tabella §1): il file è
   condiviso con me e i conflitti si evitano per perimetro, non per fortuna.
8. `npm run test:lab` (cancello 1, deve restare 54/54) · `npm --prefix frontend run verify` ·
   poi **dal vivo** sulla tua istanza (§6): la schermata con i dati veri, screenshot alle tre
   larghezze, confrontati **a occhio** con il mockup **e** con la app originale sugli stessi
   dati (stesse sessioni, stessi numeri, stessi stati — la app originale è il metro dei DATI,
   il mockup il metro della FORMA). Difetti in un taccuino, correzione in batch, riverifica
   visiva una volta alla fine (regola owner 27/8).
9. Un commit per componente (mai `git add -A`: `git status --short` prima dell'add), ledger
   aggiornato, screenshot in `.claude/immagini/astra-fase2/<Blocco>/`. **Chiude l'owner**,
   guardando gli screenshot, una consegna alla volta.

## 4. Le tue consegne, una per una

Per ognuna: blocchi del mockup (`data-c`) · funzione/i del monolite · cosa deve fare **dal vivo**.

- **B3 Board** — `DataTable`, `FilterChips`, `Select` in `#schermoBoard`. `renderSessionsBoard`
  (+ `/api/v1/sessions` e `/metrics`). Dal vivo: 73 sessioni dello store copiato, ordinamento e
  filtri che filtrano davvero, click su una riga → apre la sessione (chat).
- **B5 le sei pagine** — `#schermoMemoria` `MemoryRow` (`rigaMemoria`, `rigaNota`) ·
  `#schermoAttivita` `TaskRow` (`rigaAttivita`, `rigaFiglio`) · `#schermoLibreria` `LibraryRow`
  (`rigaVoceLibreria`) · `#schermoRicerca` `ReportRow` (`rigaRicerca`) · `#schermoOfficina`
  `ForgeList`+`CodeBlock` (`rigaToolForgiato`, `rigaSkill`, `rigaServerMcp`, `rigaPlugin`,
  `rigaHook`) · `#schermoAutomazioni` `AutomationRow` (`#automationListReal`). Dal vivo: ogni
  riga con i dati veri dell'endpoint, stato vuoto ONESTO quando non c'è niente (mai i dati
  finti del mockup a schermo), ogni pulsante di riga che fa ciò che fa oggi nell'originale.
- **B4 Capability** — `#schermoCapability`: `Tabs`, `ToolList`, `DetailPanel`, `PendingList`,
  `ScopeNote`. I 12 `caricaPannello*` + `rigaAttrezzo`. Dal vivo: 43 attrezzi come nel
  contatore, dettaglio che si apre, permessi sempre/chiedi/nega che si salvano e si rileggono.
- **B6 Impostazioni · Doctor · Model Lab** — `#schermoImpostazioni` (`SettingsNav`,
  `SettingsSection`, `SettingRow`, `Switch`), `#schermoDoctor` (`SeverityCount`, `CheckCard`),
  `#schermoModelLab` (lo disegni tu nella parte A). `inizializzaSettingsNavigation`,
  `eseguiDoctor`, i `#modelLab*`. Dal vivo: ogni impostazione persiste nella chiave del
  contratto e sopravvive al ricarico; Doctor esegue i controlli veri e li mostra per gravità.
- **B2 Colonna destra** — `.talos-inspector`, `#railTabs`, `#rail*`: `InspectorCard`,
  `TurnIndex`, `TouchedFiles`, `ProcessRow`, l'albero (parte A, §2.6).
  `aggiornaPannelloAmbiente`, `caricaAlberoSessione`, W1-02 `/processes`. Dal vivo: le quattro
  schede con i dati della sessione aperta; l'albero della cartella vera; i processi vivi.
- **B7 Dialoghi** — `#veloNuova` (`Steps`, `FolderPicker`) ← `openRealTaskSheet` +
  `creaWorkspaceChooser` (la «Cartella scelta» sticky resta) · `#veloPermessi`
  (`ChoiceCards`, `ToolPermissionList`) ← `openSheet('permissions')` · `#veloAlbero`
  (`BranchTree`) ← `openSheet('sessionTree')` · gli altri `openSheet` sul `Dialog` generico
  (parte A, §2.7) · palette (`#commandDialog`), intro (`#introDialog`), toast (`#toastRegion`).
  Dal vivo: aprire/chiudere con mouse, Esc e focus che torna dove era; nuova sessione creata
  per davvero con la cartella scelta.
- **B1 Terminale** — `#schermoTerminale`, `TerminalPane`: `montaTerminaleSeServe`,
  `impostaChipTerminale`, le schede W1-01 (`src/terminal-registry.mjs`, WS
  `terminalFrames {data:0, control:1}`). Dal vivo: xterm montato nel `.talos-terminal__body`
  del mockup, fit al resize, schede che si aprono/chiudono, chip di stato che dice il vero.
- **B8 Meccaniche della regia** — sidebar a icone, densità, tema chiaro, lingua: come le fa
  la regia del mockup (leggi il suo script in fondo al file, ~riga 1420 in poi) ma dentro
  `app.js`, persistite in `talos.harness.desktop.settings.v1` (chiave del contratto) e le
  larghezze dei pannelli in `talos-harness-panel-widths`. Le maniglie scrivono i token
  `--talos-sidebar-w` / `--talos-inspector-w` (già cablati in `PANEL_RESIZE_VAR`).

## 5. Convivenza: come non pestarci i piedi

- Lavori in **un tuo worktree**: `git -C AVM-harness-desktop worktree add ../AVM-astra-fase2 -b lane/astra-fase2 1813e27a`.
  Un commit per componente, senza trailer `Co-Authored-By`/`Claude-Session`, **niente push**.
  Io faccio `merge`/review da lì; se ho committato sopra, fai `git rebase lane/harness-desktop`
  prima di consegnare (i conflitti in `app.js` non devono esistere per perimetro: se ne vedi
  uno, è perché uno dei due ha sconfinato — fermati e scrivilo nel ledger).
- **Non tocchi**: `src/main.js`, `src/bridge/legacy-dom.js`, `src/legacy/frammenti.html`,
  `index.template.html`/`index.css` a mano, `public/` (congelato fino al cutover), le funzioni
  della mia metà, il kernel, `mobile/`. Se ti serve un id nuovo nel ponte o un frammento
  legacy, scrivi la richiesta nel ledger (§8 «Richieste a Claude») con l'id, l'elemento del
  mockup e il perché: la applico io in giornata.
- **Porte**: **4174 MAI** (è dell'owner, con lo store vero). 4175/4176 sono le mie. Le tue:
  **4177** app nuova, **4178** laboratorio, **4179** app originale per il confronto.
- Lo store si **copia**, mai si punta all'originale: `harness-ui/.sessions-store/` (73
  sessioni) → una cartella tua.

## 6. La tua istanza dal vivo (ricetta esatta)

```bash
cd AVM-astra-fase2/harness-ui
npm ci && npm --prefix frontend ci
cp -r .sessions-store /c/Users/Antonino/AppData/Local/Temp/astra-store       # copia, una volta
npm --prefix frontend run build                                              # → frontend/dist
TALOS_HARNESS_UI_PORT=4177 TALOS_HARNESS_UI_PUBLIC_DIR=frontend/dist \
TALOS_HARNESS_UI_SESSIONS_DIR=/c/Users/Antonino/AppData/Local/Temp/astra-store node server.mjs
# la app ORIGINALE, stesso store, per il confronto dei DATI:
TALOS_HARNESS_UI_PORT=4179 TALOS_HARNESS_UI_PUBLIC_DIR=public \
TALOS_HARNESS_UI_SESSIONS_DIR=/c/Users/Antonino/AppData/Local/Temp/astra-store node server.mjs
```
Prima verifica, sempre: su 4177 `document.querySelectorAll('[data-c]').length` ≥ 93 e zero
errori in console (gli avvisi CSP sugli stili inline sono gli stessi dell'originale: parità).
`TALOS_OWNER_RUNTIME_MODULE` non è impostata: i giri reali del modello falliscono e va bene
così per le tue schermate (leggono dati); se una consegna ne ha bisogno, scrivilo nel ledger.

## 7. Cosa NON fare

- Non «migliorare» il mockup mentre lo rendi vivo: la forma è approvata, cambia solo perché
  diventa funzionante. Se una cosa del mockup non può funzionare così com'è, si disegna la
  variante NEL mockup col suo linguaggio (brief A) e si rigenera il template — mai CSS a mano.
- Non lasciare dati finti a schermo: ogni numero, nome, ora viene dall'API o è uno stato vuoto
  dichiarato.
- Non dichiarare verde ciò che non hai guardato con gli occhi, alle tre larghezze, contro
  mockup E originale. Non scrivere «fatto» su un test verde.
- Non dare ore stimate senza misura. Non usare `node -e` con backtick da bash (patch su file).
- Non toccare i nomi degli attrezzi che riceve il modello.

## 8. Consegna e ledger

`.claude/LEDGER-ASTRA-FASE-2-2026-09-05.md`, una sezione per consegna (A, B1…B8) con: blocchi
riusati · fixture (endpoint e forma) · funzioni del monolite toccate · ricerca (fonte + data) ·
esito dei cancelli (numeri) · screenshot confrontati (percorsi) · difetti visti e corretti ·
«Richieste a Claude» · «Non verificato» (per nome). Le tre domande in coda a ogni sezione:
**Cosa deve fare l'owner · Cosa fai tu dopo · Cosa rimane**.

## 9. Se una premessa di questo brief è falsa

Fermati e scrivila nel ledger con la misura (file, riga, comando, output) invece di adattare il
lavoro a una premessa sbagliata. Vale in particolare per: un id che il monolite cerca e il
ponte non assegna, un endpoint che risponde in una forma diversa dalle fixture, un blocco del
mockup che manca. La misura vale più del lavoro fatto sopra l'errore.
