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

## Aggiornamento esecutivo 2026-09-01 — riavvio controllato e prova Qwen

Il server desktop è stato riavviato su `http://127.0.0.1:4174` con configurazione esplicita del runtime owner. Il riavvio è stato eseguito dopo l'autorizzazione dell'owner; il processo è ora attivo e non deve essere interrotto durante l'uso.

È stata aperta una sessione reale con il solo modello autorizzato `qwen/qwen3.8-flash`, permesso `Full access` e messaggio “Rispondi soltanto con OK”. La sessione `bb68b52b-51cc-42b8-9f04-9323f23bbb9b` ha prodotto `OK` e si è chiusa con `RunFinished` riuscito.

Durante la prova è stato riprodotto un difetto di robustezza: il watcher osservava anche lo stato interno di Harness e generava un ciclo di eventi. Il difetto è stato corretto in `harness-ui/src/workspace-watcher.mjs` e fissato con un test contrario in `harness-ui/tests/workspace-watcher.test.mjs`.

### Evidenza test

- Suite watcher: **8/8 pass**.
- Suite backend interessata (watcher, agent-service, session-registry, route sessioni): **452/452 pass**.
- Prova reale Qwen: **pass**, risposta `OK`, nessun flusso ripetuto di eventi interni.

### Stato trasparente

- `/api/v1/tasks` resta non disponibile perché il modulo runtime attualmente configurato non espone il catalogo task richiesto. Questo non blocca il percorso custom Full access, ma impedisce di dichiarare chiusi i task preset.
- Il server segnala un vecchio record sessione corrotto (`b7b1b7d2-a6b3-4f81-bc3c-5ec57e0ead4a`); è stato lasciato intatto.
- L'avviso CSP inline di xterm.js resta un debito noto e non è stato aggirato indebolendo la CSP.

### Regola aggiunta — chip modello

È stata recepita e applicata la regola owner: la dicitura “Predefinito del server” non viene più mostrata nel chip del composer né nel riepilogo del Model Lab. Prima della scelta compare un invito neutro; dopo la scelta viene mostrato il nome reale del modello, mantenendo un'unica fonte di verità (`state.model`). Il test browser dedicato è verde.
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

## Consegna tranche P0 1–6 — 2026-09-01

### Cosa è stato chiuso

- **Doctor veritiero:** ora mostra se l’ambiente è raggiungibile, se l’agente è davvero pronto, se il catalogo attività è disponibile e se esistono sessioni persistite da controllare. Il processo può essere vivo senza essere pronto: i due stati non vengono più confusi.
- **Attività e automazioni:** quando il catalogo owner non è disponibile, l’API restituisce un elenco vuoto esplicito e l’interfaccia spiega in linguaggio naturale cosa manca. Non vengono mostrate attività di esempio come se fossero reali.
- **Sessioni danneggiate:** Doctor rende visibili gli identificativi non ripristinati e il conteggio dell’ultima lettura, lasciando intatti i file originali.
- **Test receipt:** il test ora funziona indipendentemente dalla cartella da cui viene avviato.
- **Regola chip modello:** resta valida e coperta: nessuna dicitura “Predefinito del server”, solo invito neutro prima della scelta e nome reale dopo.

### Verifiche eseguite

- `node --test harness-ui/tests/*.test.mjs`: **1153/1153**;
- test mirati Doctor/sessioni/receipt/HTTP: **294/294**;
- `npm run verify` in `harness-ui/frontend`: **3/3**;
- `npm run test:browser` contro `http://127.0.0.1:4175`: **12/12**;
- matrice visuale: **12 screenshot** acquisiti e aperti per intero; metriche e immagini in `harness-ui/frontend/artifacts/visual-audit-2026-08-31/`;
- `git diff --check`: superato.

### Stato del server e dipendenze

Il controllo finale ha rilevato che il processo owner su `http://127.0.0.1:4174` non era più in ascolto; non è stato terminato da questa tranche. È stato riavviato con la stessa configurazione già autorizzata e lasciato attivo. La porta 4175 è stata usata solo per la diagnosi isolata, senza sostituire il server owner. Doctor osserva attualmente:

- runtime agente non pronto perché il modulo configurato non espone ancora il catalogo/preparazione delle attività;
- catalogo attività predefinite non disponibile;
- una sessione persistita corrotta (`b7b1b7d2-a6b3-4f81-bc3c-5ec57e0ead4a`), lasciata intatta.

Questi stati sono mostrati come problemi risolvibili, non come errore tecnico incomprensibile. Il percorso di sessione personalizzata resta separato e non è stato falsificato.

### Debito dichiarato

Il Terminale continua a generare avvisi CSP `style-src 'self'` quando xterm.js applica stili inline. La CSP non è stata allargata e non sono comparsi errori JavaScript inattesi: il finding richiede una scelta dedicata (integrazione CSS compatibile o intervento upstream) prima di poter dichiarare la console completamente silenziosa.

### File modificati in questa tranche

- `harness-ui/server.mjs`
- `harness-ui/src/doctor.mjs`
- `harness-ui/src/session-registry.mjs`
- `harness-ui/public/app.js`
- `harness-ui/tests/doctor.test.mjs`
- `harness-ui/tests/session-registry.test.mjs`
- `harness-ui/tests/http-routes-sessions.test.mjs`
- `harness-ui/tests/harness-receipt-keypair.test.mjs`
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`
- `harness-ui/frontend/tests/fixtures/legacy-contract.snapshot.json`
- `.claude/LEDGER-FRONTEND-PHASE0-CONTRACT-2026-08-31.md`

Nessun file mobile è stato toccato o messo in staging. Nessun commit o push è stato eseguito in questa tranche; la skill operativa richiede che il commit resti all’owner.

### Riconferma finale sul server owner

Dopo la verifica isolata, il server owner è stato riportato in ascolto su `http://127.0.0.1:4174` e lasciato attivo. Health e Doctor sono stati riletti su questa porta; la matrice browser completa è stata rieseguita sul server owner: **12/12 pass**. La porta 4175 resta solo il riferimento diagnostico della prova precedente.

### Taccuino visivo finale

Gli screenshot della matrice sono stati aperti integralmente, non solo ritagliati sul controllo sotto esame. Non risultano barre orizzontali della pagina, clipping del composer o pannelli che escano dal viewport; anche il contenuto lungo mantiene lo scorrimento locale del codice. Nei pannelli senza runtime i testi attenuati e i valori non osservati sono coerenti con lo stato degradato e non vengono letti come dati reali. Il Terminale resta l’unica superficie con avvisi CSP attesi di xterm.js, già registrati come debito separato.

## Hotfix P0 — Nuova sessione pronta al primo avvio (2026-09-01)

### Problema e decisione

La schermata **Nuova sessione** mostrava all’utente un messaggio tecnico che chiedeva di impostare `TALOS_HARNESS_UI_PROJECT_DIRS`, anche quando il server era avviato correttamente. L’assenza della variabile produceva zero cartelle disponibili.

È stato adottato il comportamento verificato nelle documentazioni ufficiali di Claude Code, Codex e Hermes: la directory del progetto che avvia lo strumento è disponibile subito come workspace predefinita; cartelle aggiuntive restano esplicite e validate. Non viene concesso l’intero disco `C:\\` automaticamente.

### Correzione applicata

- `harness-ui/src/config.mjs`: `parseCartelleProgetto(raw, defaultProjectDir)` valida la radice desktop reale e crea la voce stabile `id: "default"`; `loadConfig()` deriva la radice dal percorso del server.
- `harness-ui/README.md`: documentazione aggiornata.
- `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs`: test utente reale per **Nuova**, che verifica l’apertura del foglio, la voce `AVM-harness-desktop` e l’assenza del messaggio tecnico.
- `harness-ui/tests/config.test.mjs`: test per il default zero-config e per la radice desktop effettiva.

### Evidenza reale

- `GET /health` su `http://127.0.0.1:4174`: server raggiungibile.
- `GET /api/v1/projects`: restituisce `default → AVM-harness-desktop`.
- `GET /api/v1/doctor`: `cartelleProgetto.disponibili: true`, `conteggio: 1`.
- Flusso API reale: creazione di una sessione custom sulla cartella `default`, accodamento del messaggio e chiusura riuscita (`RunFinished`), senza configurazione manuale della directory.

### Verifiche finali

- Suite backend: **1154/1154**.
- `npm run verify` frontend: **3/3**.
- Browser baseline + regressioni: **13/13**, inclusa la nuova sessione zero-config.
- Matrice visuale: **12/12** scenari già acquisiti e ispezionati integralmente.
- `git diff --check`: superato.

### Limiti dichiarati

Il runtime owner configurato è raggiungibile ma non espone il catalogo delle attività predefinite; Doctor lo segnala come non pronto. Questo non impedisce più la sessione personalizzata dalla workspace predefinita. La vecchia sessione persistita corrotta resta intatta e visibile in Doctor. Nessun file mobile è stato modificato e nessun commit/push è stato eseguito.
-
## Vincolo per la futura produzione Installer (2026-09-01)

La workspace automatica introdotta in sviluppo non è un percorso da incorporare nell’installer. In produzione dovrà essere dinamica e indipendente dal checkout.

La ricerca sulle linee guida Microsoft conferma: pacchetto/installazione in sola lettura, dati persistenti in uno spazio per-utente, installazione per-utente senza UAC quando possibile, aggiornamento e riparazione tracciabili, disinstallazione pulita e test su macchina pulita. Per distribuzione diretta è da valutare MSIX con `.appinstaller` e certificato attendibile.

Questo finding è registrato nel ledger: durante la fase Installer bisognerà risolvere a runtime radice d’installazione, radice dati utente e workspace del progetto; migrare le sessioni esistenti; non usare `process.cwd()` come contratto; mantenere una scelta esplicita per cartelle diverse; verificare installazione, primo avvio, upgrade, rollback e disinstallazione con conservazione dati.
-
## Hotfix P0 — pillola modello sincronizzata con la sessione (2026-09-01)

È stato corretto il caso in cui la sidebar mostrava una sessione con un modello reale ma il composer restava su “Seleziona modello”. La causa era un’informazione già presente nella risposta del server (`modello`) ma non propagata al cambio sessione.

`passaASessione()` ora riceve il modello della sessione, aggiorna la stessa `state.model` usata dal composer e ridisegna la pillola. Il menu Azioni e la lista sessioni usano lo stesso percorso; se una vecchia sessione non contiene il modello, non viene inventato alcun valore.

RED riprodotto e poi GREEN verificato con il test browser `selezionare una sessione sincronizza la pillola con il suo modello reale`.

Verifiche: backend **1155/1155**, frontend **3/3**, browser owner 4174 **14/14**, matrice visuale **12/12**, `git diff --check` superato. Nessun commit o push eseguito.

## Hotfix P0 — ragionamento opt-in e streaming centrato (2026-09-01)

### Cosa è cambiato

- Il ragionamento non compare più automaticamente nella conversazione. La nota
  viene comunque costruita e aggiornata per mantenere intatto il flusso degli
  eventi e il raggruppamento dei comandi; l’utente può mostrarla dalla modale
  **Modello** attivando **Mostra ragionamento**.
- Il nuovo switch usa il controllo binario già presente nei fogli e parte
  spento a ogni caricamento. Attivandolo rende visibili anche le note già
  arrivate; disattivandolo le nasconde senza perdere il contenuto.
- Durante ogni delta di testo dell’assistente, l’output attivo viene portato
  nella fascia centrale della conversazione. Gli aggiornamenti sono riuniti in
  una sola operazione per fotogramma e il valore è limitato allo scroll interno:
  non si blocca sul fondo e non muove la pagina esterna.

### Causa e garanzie

La causa del primo difetto era la visibilità predefinita dell’articolo
`real-reasoning-note`; la causa del secondo era l’assenza di uno scroll durante
`TextMessageContent`. `chiudiBatchTool()` resta eseguito sempre in
`ReasoningMessageStart`, anche quando la nota è nascosta: due comandi separati
da ragionamento continuano quindi a produrre due batch distinti.

### Verifiche eseguite

- RED riprodotto prima del codice: 3 test fallivano (ragionamento visibile,
  stato hidden assente, output senza scroll centrale).
- GREEN browser baseline: **16/16** su `http://127.0.0.1:4174`.
- Test dedicati: switch nascosto/visibile, raggruppamento di due batch con
  ragionamento nascosto, autoscroll nella fascia 25–75% del contenitore.
- `npm.cmd run verify`: **3/3**.
- Snapshot del contratto aggiornato per il nuovo bundle (`8495` righe,
  `458599` byte, SHA-256 `33e30a8ae535ba84a888a53127fa706fe3db4d60ae7b708be5eee6232b655cb1`).
  CSS aggiornato: `1955` righe, `150729` byte, SHA-256
  `ff21e5fed4e60dad04bf09a57e4315521a77a28c0c2ad2d87a47e6dd12863ca6`.

### Ricerca e limiti

La soluzione adatta CSSOM View (allineamento centrale) e il pattern WAI-ARIA
Switch, senza introdurre dipendenze o un secondo stato di chat. Riferimenti:
https://www.w3.org/TR/cssom-view/ e
https://www.w3.org/WAI/ARIA/apg/patterns/switch/.
Il Browser in-app non era disponibile in questa sessione; la verifica è stata
eseguita con Playwright Chromium sul server owner, come fallback documentato
dalla skill frontend. Non è stato usato alcun device mobile e non è stato
interrotto il processo owner durante le prove.

Nessun commit o push è stato eseguito; il commit resta all’owner.

### Verifica finale dopo l’integrazione

- `npm.cmd run build`: **22 asset verificati**.
- Suite browser completa sul server owner `http://127.0.0.1:4174`: **17/17**,
  inclusa la matrice visuale **12/12**.
- Suite backend `node --test harness-ui/tests/*.test.mjs`: **1155/1155**.
- Console/page errors nel percorso visuale dedicato: **0**.
- `git diff --check`: superato.
- Screenshot ispezionati integralmente: `harness-reasoning-switch-off.png`,
  `harness-reasoning-switch-on.png`, `harness-stream-center.png` in
  `C:\Users\Antonino\AppData\Local\Temp`.

Il processo owner resta in ascolto sulla porta 4174 (PID verificato dopo i
test). Le modifiche mobile e il file non riconosciuto già presente nel
worktree non sono stati toccati. Nessun commit o push è stato eseguito.

## Consegna P0 — modello durevole, composer invariato e attività in place (2026-09-01)

### Risultato per l'owner

- Cambiare modello in una sessione esistente non aggiorna più la pillola per
  finta: TALOS aspetta che la sessione sia stata davvero salvata. Se il server
  rifiuta l'operazione, rimangono visibili il modello precedente e il foglio di
  scelta, con una spiegazione utilizzabile.
- Dopo un salvataggio riuscito viene aggiornata anche la riga sessione già in
  memoria; selezionarla di nuovo non può più ripristinare `z.ai 4.7 Flash`.
- La modalità chat full width allarga soltanto conversazione, risposte e bolle
  domanda. Il composer conserva esattamente forma, altezza, padding, raggio e
  larghezza precedenti. La garanzia vale per le forme standard, classica e
  compatta e sopravvive al reload.
- Le domande brevi restano compatte; non vengono stirate artificialmente.
- Ogni attività dell'agente usa una sola riga che passa da “in corso” al
  risultato. Cinque letture diventano un unico totale “5 file letti”; il
  ragionamento nascosto non spezza più il gruppo.
- Una navigazione molto rapida fra Impostazioni e Chat non può più lasciare il
  centro dell'app vuoto.

### Prove concluse

- registro e rotte sessione: **286/286**;
- backend completo: **1160/1160**;
- browser completo: **34/34**;
- matrice visuale: **21/21** screenshot e metriche;
- contratto frontend: **3/3**;
- build: **22 asset verificati**;
- `git diff --check`: superato.

Gli screenshot sono in
`harness-ui/frontend/artifacts/visual-audit-2026-09-01/`. Sono stati aperti per
intero. In particolare, `chat-standard-1920x1080.png` e
`chat-full-width-1920x1080.png` mostrano un composer geometricamente identico;
le misure raccolte confermano width, height, min-height, padding e
border-radius identici.

### Correzione a una nota precedente

La consegna precedente affermava che il ragionamento nascosto chiudeva sempre
il gruppo attività. Quel comportamento è stato superato: un contenuto che
l'utente ha scelto di non vedere non crea più una separazione visibile. Testo
assistente, cambio turno, errore e fine esecuzione restano confini reali.

### Findings visivi annotati, non dimenticati

L'ispezione ha rilevato debiti distinti: contrasto insufficiente in varie
superfici del tema chiaro; fixture di approvazione con pulsanti senza testo;
testata troppo compressa con inspector ampio a 1200 px; riga stato troppo
vicina alla barra inferiore a 390 px; modale Capability scura poco leggibile;
Terminale apparentemente vuoto pur risultando connesso. Sono nominati nel
ledger con scenari permanenti e non vengono presentati come risolti.

### Ultimo gate reale necessario

Il server owner ancora attivo su `http://127.0.0.1:4174` è stato avviato prima
che la nuova route di salvataggio modello fosse caricata e risponde `405` a
quella scrittura. Non è stato interrotto. Serve autorizzazione esplicita a un
riavvio controllato; subito dopo vanno provati scelta Gemini, reload e
riapertura della stessa sessione. Per un eventuale messaggio reale resta
vincolante l'unico modello autorizzato, Qwen 3.8 Flash.

Controllo finale in sola lettura: listener `127.0.0.1:4174`, PID `1936`,
comando `node harness-ui/server.mjs`, avviato il 2026-09-01 alle 11:24 locali;
`GET /api/v1/health` risponde `200`. Il processo è quindi vivo ma carica ancora
il backend precedente, mentre gli asset frontend letti dal disco sono già
quelli aggiornati.

### Riepilogo semplice dello step

Il codice e tutti i test automatici dicono che i due problemi segnalati sono
corretti: il modello non può più mentire dopo un salvataggio fallito e il
composer non cambia forma quando allarghi la chat. Manca una sola prova sul
server che stai usando tu, perché quel processo è ancora la versione caricata
prima del fix. Riavviarlo senza il tuo sì violerebbe la regola di accesso
continuo, quindi la verifica reale resta esplicitamente aperta.

## Chiusura del gate reale owner — autorizzazione ricevuta (2026-09-01)

Il gate precedente è ora superato. È stato fermato esclusivamente il vecchio
PID `1936`; il server è tornato sulla stessa porta `4174` come PID `9352`, con
salute `200`, chiave provider disponibile e runtime owner configurato. Nessun
altro processo Node è stato terminato e nessuna chiave è stata stampata.

### Risultati reali

- La sessione `14d329e9-67d2-4135-a427-12efb220020c` mostrava inizialmente
  `z-ai/glm-4.7-flash`.
- Dal picker visibile è stato scelto `google/gemini-3.7-flash`.
- Il server ha risposto `200`; la pillola è diventata Gemini; dopo reload e
  riapertura è rimasta Gemini; la lista server conferma lo stesso `modelId`.
- Nessun messaggio è stato inviato a Gemini.
- Il test conversazionale obbligatorio è stato eseguito in una nuova sessione
  separata, `a65e05b7-9670-4abc-b2cf-6bbd4ba6cc63`, esclusivamente con
  `qwen/qwen3.8-flash`: richiesta “Rispondi soltanto con OK”, risposta reale
  `OK`, sessione conclusa e persistita.

Evidenze visuali complete:

- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/model-persistence-real-4174.png`;
- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/qwen-real-message-4174.png`.

Entrambe sono state aperte e ispezionate integralmente. Il composer mantiene
la forma standard originale e il modello corretto è visibile nella pillola.
La risposta `OK` sul tema chiaro resta troppo poco contrastata: conferma il
debito `VISUAL-CONTRAST-LIGHT-ASSISTANT-01`, già registrato e non spacciato per
risolto.

### Riepilogo semplice finale

Il riavvio è riuscito, TALOS è nuovamente disponibile sulla stessa porta e il
problema segnalato è stato riprodotto sul dato vero: scegliendo Gemini, Gemini
rimane anche dopo il reload. Il composer non viene alterato dalla chat larga.
È stata inoltre inviata una vera richiesta solo a Qwen, che ha risposto `OK`.
I fix P0 modello/composer sono quindi chiusi; rimangono i debiti visivi già
elencati, soprattutto la leggibilità insufficiente del tema chiaro.

## Hotfix P0 — altezza composer uguale al mockup (2026-09-01)

Le forme desktop Classica e Compatta cambiavano anche l'altezza del composer:
rispettivamente `132px` e `82px`, mentre il mockup originale e la forma
Standard misurano `116px`. Ora tutte e tre occupano esattamente `116px`.
Classica e Compatta mantengono angoli e spaziatura interna propri, quindi la
preferenza continua a produrre un risultato visivo reale senza spostare la
conversazione o alterare il composer al cambio forma.

Il test RED ha rilevato il delta di `16px` della forma Classica. Dopo il fix,
il test dedicato attraversa le tre forme a `1440×900` e `1024×800`, inserisce
testo multilinea e verifica il reload. Le prove finali sono: browser **35/35**,
matrice visuale **24/24**, contratto **3/3**, build **22 asset**, diff check e
salute del server `4174=200`.

Screenshot completi ispezionati:

- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/composer-standard-1440x900.png`;
- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/composer-classic-1440x900.png`;
- `harness-ui/frontend/artifacts/visual-audit-2026-09-01/composer-compact-1440x900.png`.

Non sono comparsi nuovi difetti visuali. Resta visibile e già registrato il
contrasto insufficiente di alcuni testi nel tema chiaro. Nessun file mobile è
stato modificato in questa tranche e il server owner non è stato interrotto.

## Integrazione Windows — Apri cartella con TALOS (2026-09-01)

È stato completato il flusso desktop che permette di scegliere una cartella in
Esplora file e aprirla direttamente come nuova sessione TALOS. Il link contiene
solo un identificatore temporaneo: il percorso resta nel server locale e la
cartella conserva `Workspace write`, senza ottenere automaticamente
`Full access`.

Sono presenti due comandi per-utente, sulla cartella selezionata e sullo sfondo
della cartella. La prova reale su un server isolato ha aperto il progetto
corretto; sono verdi backend **1184/1184**, browser **37/37**, matrice visuale
**24/24**, contratto **3/3**, build **22 asset** e gate PowerShell Windows
**5/5**. L'ispezione ha anche trovato e corretto la sovrapposizione
preesistente tra Impostazioni, chat e composer.

Consegna completa:
`.claude/CONSEGNA-OPEN-WITH-TALOS-WINDOWS-2026-09-01.md`.

### Riepilogo semplice dello step

La funzione è costruita e provata: dal menu di una cartella Windows TALOS può
preparare una nuova sessione già puntata lì, senza esporre il percorso nel link
e senza allargare i permessi. In questo punto della sequenza il server owner
4174 non era ancora stato toccato; il gate richiesto è stato poi autorizzato e
chiuso nella sezione immediatamente successiva.

## Chiusura gate owner integrazione Windows (2026-09-01)

Dopo autorizzazione fresca è stato fermato soltanto il vecchio PID `9352`. Il
server owner è tornato su `127.0.0.1:4174` come PID `25424`, con salute `200`,
chiave OpenRouter disponibile e runtime owner configurato.

Il launcher reale ha consegnato la cartella `AVM-harness-desktop` al nuovo
endpoint. La sessione `486e464b-ad72-4b2f-96a2-6daccf350456` conserva
`Workspace write`, cartella e branch esatti, usa esclusivamente
`qwen/qwen3.8-flash`, ha ricevuto “Rispondi soltanto con OK” e ha concluso con
risposta `OK`. Il registro JSONL contiene `RunStarted`, risposta, uso e
`RunFinished success`; l'intenzione è poi diventata indisponibile con `410`,
come richiesto dal contratto monouso.

Il click nativo in Esplora file resta una conferma manuale: questa sessione non
ha browser o bridge Windows collegati, quindi non viene dichiarato uno
screenshot che non è stato possibile acquisire.

### Riepilogo semplice finale dello step

Il server che usa l'owner è aggiornato e continua a rispondere sulla stessa
porta. Il passaggio cartella → TALOS → sessione → risposta → salvataggio è
stato provato davvero e ha funzionato. Per controllare anche come appare la
voce nel menu di Windows basta che l'owner faccia un click manuale su una
cartella e apra **Mostra altre opzioni**.

## Chiusura tema chiaro e passaggio del lag a P0 — 2026-09-01

La sessione Qwen reale ha evidenziato che il testo risposta usava il fallback
Calm scuro nel tema chiaro. Il nuovo scenario permanente
`VISUAL-CONTRAST-LIGHT-ASSISTANT-01` è stato osservato RED, poi chiuso
completando i token semantici dentro `applicaThemeDesktop()`. Nessun secondo
theme store e nessuna eccezione CSS solo-chat sono stati introdotti.

Evidenza finale:

- contrasto della risposta reale: **12:1**;
- backend: **1253/1253**;
- browser: **73 pass, 2 opt-in skipped**;
- `npm run verify`: build, contratti, determinismo e laboratorio GREEN;
- `git diff --check`: pulito;
- screenshot finale:
  `harness-ui/frontend/artifacts/real-qwen-gate-2026-09-01/06-qwen-light-tokens-fixed-1440x900.png`.

Il server `4174` è healthy, ma un watcher attivo ha portato il processo fino a
circa 255.309 handle e 3,03 GB privati. Per ordine owner, il lag globale diventa
ora il P0 assoluto: prima solo ispezione tecnica e profiling sullo stato reale;
nessuna modifica finché la causa non è misurata e registrata nel ledger.
