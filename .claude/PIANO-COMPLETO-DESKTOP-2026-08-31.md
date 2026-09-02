# Piano completo desktop — stato e lavoro residuo

Data: 31/08/2026  
Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`  
Ownership: desktop; `mobile/` soltanto riferimento read-only.

## Stato attuale

Le Fasi 0–4 sono chiuse nel perimetro desktop: baseline/ricerca, parità
Appearance A01–A35, Model Lab preparatorio, contratti runtime/sicurezza e
percorso Hugging Face → llama.cpp reale. La prova ha usato il repository
`MaziyarPanahi/Qwen3-0.6B-GGUF`, revisione
`16d75108d73a476af91a4f6df4cd77e854b42d04`, con verifica SHA-256, caricamento
llama.cpp `b10517`, stream SSE e stop.

Il commit `98784a9e` ha chiuso il canale di importazione locale Model Lab.
Il lavoro successivo resta nel worktree fino al commit desktop autorizzato
della chiusura dei tre blocchi P1.

## Fasi residue ordinate

## Coda prioritaria aggiunta dall’owner — 31/08/2026

### P0 — Nuova sessione: messaggio comprensibile sulle cartelle

Situazione osservata: quando non esistono cartelle configurate, la modale mostra
il nome della variabile `TALOS_HARNESS_UI_PROJECT_DIRS`, il riavvio del server e
altri dettagli da sviluppatore. Questo viola la regola di linguaggio naturale.

Da correggere nei percorsi esatti:

- `mobile/public/harness-ui/app.js` — testo della modale e renderer degli errori;
- `harness-ui/src/http-app.mjs` — envelope con messaggio naturale, soluzione
  proposta e riferimento diagnostico separato;
- `harness-ui/src/config.mjs` — mantenere il dettaglio tecnico soltanto nel
  log/Doctor, mai nella UI;
- `harness-ui/src/doctor.mjs` — controllo reale della disponibilità delle
  cartelle di progetto e registrazione del motivo tecnico;
- `harness-ui/tests/http-routes-sessions.test.mjs`,
  `harness-ui/tests/http-routes-doctor.test.mjs`,
  `harness-ui/tests/config.test.mjs`,
  `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — RED/GREEN.

Contratto UX: la UI dirà cosa è successo, come risolverlo e offrirà il pulsante
“Apri Doctor”; codici, nomi di variabili, stack e percorsi assoluti saranno
visibili soltanto nel Doctor/log locale.

### P0 — Menu contestuale completo sulle sessioni

Situazione osservata: il tasto destro su una sessione apre direttamente la
conferma di eliminazione. Deve usare lo stesso pattern CRUD già presente nel
menu contestuale dei Files.

File e comportamento:

- `mobile/public/harness-ui/app.js` — sostituire `openSheet('deleteSession')`
  nell’handler `contextmenu` con un menu azioni ancorato alla riga;
- `mobile/public/harness-ui/styles.css` — posizionamento, z-index, chiusura con
  click esterno/Escape e stati focus/pressed;
- `harness-ui/src/http-app.mjs` e `harness-ui/src/session-registry.mjs` —
  mantenere le operazioni reali e i relativi errori naturali;
- `harness-ui/tests/session-registry.test.mjs`,
  `harness-ui/tests/http-routes-sessions.test.mjs`,
  `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — test per apri,
  rinomina, duplica/fork se supportato, elimina con conferma e percorso inverso.

Il menu non deve promettere azioni prive di endpoint: ogni voce non disponibile
deve essere disabilitata con una spiegazione naturale.

### P0 — Impostazioni organizzate per categorie

Decisione UX proposta: layout **list-detail** su desktop, coerente con i layout
canonici Material 3: a sinistra un menu verticale di categorie, a destra una
sola sezione alla volta. Sotto la soglia compatta il menu diventa una barra di
righe/tabs scorrevole; la categoria attiva resta sempre evidente. Questo riduce
lo scroll infinito, conserva la densità da workbench e mantiene la grammatica
mobile senza duplicare pannelli.

Sezioni minime, tutte presenti e ordinate come sul mobile:

1. Aspetto e movimento;
2. Chat e composer;
3. Laboratorio modelli;
4. Provider e accessi;
5. Strumenti agente e permessi;
6. Privacy e dati locali;
7. File e workspace;
8. Account, Doctor e backup.

File candidati:

- `mobile/public/harness-ui/index.html`, `app.js`, `styles.css` — struttura,
  stato selezione, deep-link/reload, tastiera e responsive;
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts` — contratto categorie,
  tab/pannello attivo, reload e stati vuoti;
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md` — screenshot completi desktop e
  confronto con il pannello Settings mobile.

La scelta list-detail è supportata dai layout canonici Material 3 e dalle
semantiche ARIA `tablist`/`tabpanel`; i menu contestuali useranno invece il
pattern `menu` soltanto per azioni, con Escape che restituisce il focus al
controllo d’origine.

### Fase 5 — completare la parità Model Lab mobile

⛔ 02/09 — corretti i tre percorsi sotto: dal commit `16677c48` (31/8, dopo
che questa sezione era già scritta) il bundle canonico servito è
`harness-ui/public/`, non più `mobile/public/harness-ui/` (che dal 01/09 è
dichiarato esplicitamente fuori competenza del desktop, vedi Fase 2 sotto,
"Il desktop non modificherà `mobile/public/harness-ui`"). `config.mjs` ha
il dettaglio completo. File candidati, da ledger prima di ogni modifica:

- `harness-ui/public/index.html`
- `harness-ui/public/app.js`
- `harness-ui/public/styles.css`
- `harness-ui/src/http-app.mjs`
- `harness-ui/src/hf-hub-client.mjs`
- `harness-ui/src/local-model-store.mjs`
- `harness-ui/src/local-runtime-probe.mjs`
- `harness-ui/tests/http-routes-model-lab.test.mjs`
- `harness-ui/tests/hf-hub-client.test.mjs`
- `harness-ui/tests/local-model-store.test.mjs`
- `harness-ui/tests/local-runtime-probe.test.mjs`
- `mobile/tests/unit/harness/harnessUiFrontend.test.ts`

⛔⛔⛔ 02/09 — le 7 voci sotto sono state VERIFICATE una per una leggendo il
codice reale (`harness-ui/public/{index.html,app.js}`, `harness-ui/src/`),
non presunte. Il Model Lab è molto più avanti di quanto questa sezione (mai
aggiornata dal 31/8) lasciasse credere:

1. ✅ **FATTO** — importazione locale `.gguf`: selettore file, XHR con
   progresso reale, annulla, validazione estensione/dimensione,
   sanificazione nome, hash lato server (`POST /api/v1/local-models/import`,
   `app.js` righe ~1499-1523).
2. ✅ **FATTO** — ricerca (`modelLabInstalledSearchControl`), rinomina, copia
   percorso, cancellazione con conferma (`window.confirm`), tutte collegate a
   route reali (`app.js` righe ~1397-1414).
3. ⚠️ **PARZIALE** — ordina (download/preferiti/più recenti/aggiornati),
   filtro per autore, un campo filtri libero (`app.js` riga 1495) — copre
   l'intento ma non le voci ESATTE `fits/chat/code/q4/open-licence` come
   controlli dedicati. Paginazione/retry non verificati in questo giro.
4. ⚠️ **PARZIALE, backend FATTO — 02/09** — `readHeader(path)` scritto
   (`harness-ui/src/gguf-header.mjs`, ricerca dello spec ufficiale PRIMA
   di scrivere, testato su 3 file GGUF reali + 7 casi AL CONTRARIO su una
   fixture binaria costruita a mano — commit `90cac7a`). `local-runtime-probe.mjs`
   ora istanziato in `server.mjs` (quando `config.llamaServerPath` è
   configurata) e `GET /api/v1/local-models/:id/fit` lo espone (sola
   lettura, mai un caricamento vero) — backend 1331/1331. 🔜 **Resta da
   fare**: la UI "prima di load" che chiama questa rotta e mostra
   compatible/blocked/chat-only/unknown con la motivazione (nessun
   controllo dedicato oggi nel pannello Installati), e `qualify()` (il
   giro di generazione reale, consenso esplicito) non ha ancora una
   rotta — dichiarato, non implementato in questo giro.
5. ⚠️ **PARZIALE** — 7 card provider (OpenRouter/OpenAI/DeepSeek/Anthropic/
   Gemini/Ollama/HuggingFace) con chiave/indirizzo/timeout, salva/rimuovi
   chiave — reale. Il "motore" che li rende operativi per la chat locale è
   esplicitamente e onestamente gated (`disabled`, `data-disabled-reason="Il
   motore degli altri provider sarà collegato nella fase successiva"`, non
   un mockup silenzioso).
6. ❌ **MANCANTE** — il pannello dettaglio catalogo (`modelLabModelDetail`)
   mostra metadata strutturati (provider/contesto/modalità/parametri/
   prezzi), non una vera model card con Markdown renderizzato e immagini
   remote su policy/allowlist. Nessun rendering Markdown trovato nel giro
   di verifica.
7. ✅ **FATTO** — `aggiornaPillolaModello()` aggiorna la pillola Chat E
   `#modelLabActiveModel` dalla STESSA `state.model`, una sola fonte di
   verità (`app.js` riga 3827).

⇒ **Prossimo passo reale, non ancora iniziato**: la UI "prima di load" nel
pannello Installati (chiama `GET /api/v1/local-models/:id/fit`, appena
scritta — punto 4 sopra — e mostra lo stato onesto), poi eventualmente
`qualify()` con una rotta e un consenso esplicito.

Gate: RED per ogni voce, test HTTP/UI, reload, errore e stato gated; E2E reale
desktop a 1440×900 e 1024×800 con screenshot interi.

### Stato consolidato dei tre blocchi P1 — 31/08/2026

| Blocco | Stato | Evidenza |
|---|---|---|
| Model Lab, download e importazione locale | ✅ chiuso | Suite completa, import binario GGUF, hash e QA visiva già registrati nel ledger remediation. |
| Runtime locale e lifecycle/capability | ✅ chiuso nel perimetro software | Adapter llama.cpp/Ollama/LM Studio, supervisor loopback, stream separati, abort, automazioni e orchestrazione: 101 test mirati verdi. Il gate hardware/provider opzionale resta condizionato alla disponibilità dell’owner. |
| Full access su radice `C:\\` | ✅ rischio watcher chiuso; gate modello reale aperto | Il watcher ricorsivo non parte su una radice volume; tree lazy e consenso esplicito restano invariati. Test dedicato e suite completa verdi. |

### Fase 6 — performance e qualità del runtime

File/evidenze:

- `harness-ui/scripts/qa-visual-pipeline.mjs`
- `harness-ui/src/local-runtime-llama-server.mjs`
- `harness-ui/src/llama-server-supervisor.mjs`
- `.claude/QA-VISIVA-HARNESS-2026-08-30.md`
- nuovo raw evidence locale sotto `harness-ui/.qa-runs/` (ignorato)

Misurare con stesso prompt/modello/contesto: cold start, warm start, TTFT,
tok/s, RAM peak, GPU layers/backend, cancel latency e comportamento a 64K.
Ripetere con quantizzazione Q4_K_M o superiore; Q2_K resta solo il fixture di
trasporto. Registrare OS/architettura/build/hash e non pubblicare prompt,
token o path assoluti.

### Fase 7 — provider esterni

Eseguire smoke reali per Ollama e LM Studio solo se installati e raggiungibili
su loopback. Oggi sono `not installed`/non raggiungibili: non sostituire questa
condizione con mock nel gate finale. Conservare adapter provider-neutral e
capability osservate.

### Fase 8 — distribuzione desktop

Progettare installer Windows/Linux/macOS con runtime pinato o bootstrap
verificato, scelta componenti opzionale, aggiornamento, firma, disinstallazione
reversibile e rollback. Prima del codice servono ricerca upstream, matrice
licenze, manifest degli asset e ledger file-per-file.

### Fase 9 — README e release evidence

Aggiornare il README desktop solo dopo evidenza TALOS-BANCO riproducibile:
architettura, Model Lab, runtime, benchmark AVM ON/OFF, screenshot approvati,
limiti noti e istruzioni di avvio. Non dichiarare superiorità senza raw logs.

### Fase 10 — gate di pubblicazione

Eseguire suite completa, build, `git diff --check`, controllo segreti/path,
review del diff e verifica degli artefatti ignorati. L’owner autorizza il
commit; il push/release resta una decisione separata.

## Chiusure già verificate

- Backend: `node --test tests/*.test.mjs` → 1058/1058.
- Frontend Harness: `npm exec vitest run tests/unit/harness` → 192/192.
- `npm run typecheck`, `node --check`, `git diff --check` → pass.
- Download reale HF, hash e manifest `ready` → pass.
- Runtime llama.cpp reale, stream SSE, stop e cleanup processo → pass.
- Pausa/ripresa/annullamento reale → pass; `.partial` assente e manifest
  `incomplete` conservato per resume esplicito.
- Screenshot CDP 1440×900 e 1024×800 ispezionati integralmente; nessun overflow,
  sovrapposizione, errore JS o HTTP fallito.

## Addendum P0 UX e Settings full width — stato consolidato (31/08/2026)

La coda P0 è stata eseguita prima di aprire le fasi successive:

| Voce | Stato verificato | Evidenza |
|---|---|---|
| Modale nuova sessione senza cartelle | ✅ chiusa | Copy naturale, soluzione Full access/Doctor, nessun dettaglio tecnico nel testo UI. |
| Menu contestuale sessione | ✅ chiusa | Apri/Rinomina/Fork/Copia identificativo/Elimina, chiusura Escape e click esterno, focus preservato. |
| Settings a sezioni | ✅ chiusa | Otto categorie list-detail, una sola attiva, barra compatta scorrevole. |
| Settings full width | ✅ chiusa | `.view-pane[data-view="settings"] > .generic-shell` è 100% del pannello centrale e non usa il max-width della chat; container query evita griglie compresse. |

File modificati per questo addendum: `mobile/public/harness-ui/app.js`,
`mobile/public/harness-ui/index.html`, `mobile/public/harness-ui/styles.css`,
`mobile/tests/unit/harness/harnessUiFrontend.test.ts` e
`harness-ui/scripts/qa-visual-pipeline.mjs`. Nessun file server nuovo e nessun
endpoint inventato.

Gate: `node --test tests/*.test.mjs` **1.060/1.060**,
`npm exec vitest run tests/unit/harness` **197/197**, typecheck, sintassi dello
scenario QA e `git diff --check` passati. Prove visive complete a 1440×900 e
1024×800 in `.qa-runs/qa-p0-ux-2026-08-31T08-51-42-753Z/` e
`.qa-runs/qa-p0-ux-2026-08-31T08-52-01-511Z/`; ogni corsa: tre screenshot,
zero eccezioni JS, zero richieste fallite.

Il confronto con VS Code/Cursor/Cline/Hermes conferma list-detail per le
impostazioni e menu contestuale per le azioni di riga; il miglioramento TALOS
è il linguaggio naturale in superficie con diagnosi tecnica confinata a Doctor,
più un layout full width che usa tutto il workbench senza rubare spazio alla
chat.

## Documenti di riferimento

- [Ledger Fase 10](./LEDGER-FASE-10-HF-DOWNLOAD-RUNTIME-DESKTOP-2026-08-31.md)
- [Consegna Fase 10](./CONSEGNA-FASE-10-HF-DOWNLOAD-RUNTIME-DESKTOP-2026-08-31.md)
- [Taccuino QA visiva](./QA-VISIVA-HARNESS-2026-08-30.md)
- [Tabella di marcia desktop](./LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30.md)
- [Inventario impostazioni mobile→desktop](./INVENTARIO-IMPOSTAZIONI-MOBILE-DESKTOP-2026-08-30.md)

## Riepilogo semplice

Il cuore del download e dell’esecuzione locale desktop funziona già davvero.
La vecchia frase sulla parità incompleta del Laboratorio modelli è superata
dalle consegne successive. Lo stato autoritativo dal 1 settembre 2026 è quello
dell'aggiornamento seguente.

## Aggiornamento autoritativo — 1 settembre 2026

### Correzione dello stato storico

Sono chiusi e non devono essere ricostruiti:

- baseline, ricerca, remediation P0 e contratto frontend;
- Appearance A01–A35, Settings a otto sezioni e Settings full width;
- Provider/API key con segreti server-side;
- Model Lab, Hugging Face, download/resume/annullamento, import `.gguf`, hash e
  manifest;
- runtime locale llama.cpp, adapter Ollama/LM Studio, stream, stop e policy;
- persistenza modello/sessione/permessi, reasoning nascosto, lifecycle tool e
  composer;
- watcher sicuro sulla radice volume e degradazione onesta del catalogo task;
- integrazione Windows “Apri cartella con TALOS”, provata sul server owner con
  una sessione Qwen reale e persistenza.

Queste funzioni restano contratti di compatibilità durante il refactor. Il
refactor ZIP v1+v2, invece, **non è chiuso**: `harness-ui/frontend/` contiene
toolchain, contratti e test, ma `harness-ui/frontend/src/` non esiste ancora e
la UI produttiva vive tuttora nel monolite `harness-ui/public/app.js`.

### Decisione upstream aggiornata

- **ADAPT** il modello di integrazione backend/manifest di Vite, mantenendo per
  il primo strangler il builder `esbuild 0.28.2` già pin­nato e il manifest AVM.
  Nessun cambio degli URL pubblici.
- **DEFER** un cutover completo a Vue: la documentazione Vue richiede prima di
  scegliere l'architettura in base a carico e interattività e raccomanda
  profiling, code splitting e virtualizzazione delle liste. Vue non viene
  introdotto per “curare” il lag senza una baseline misurata. Il gate della
  Fase 2 confronterà moduli ESM posseduti da TALOS con un prototipo Vue
  isolato; l'owner approverà l'eventuale adozione.
- **ADOPT** i gate Playwright su comportamento visibile, isolamento, locatori
  user-facing e snapshot nello stesso ambiente/browser.
- **ADAPT** da Hermes la chiarezza di sessioni, tool, skill, profili, cron e
  stato; TALOS mantiene in più provenance, policy fail-closed e Doctor.

Fonti primarie aggiornate:

- <https://vite.dev/guide/backend-integration.html>
- <https://vuejs.org/guide/best-practices/performance>
- <https://playwright.dev/docs/best-practices>
- <https://playwright.dev/docs/test-snapshots>
- <https://github.com/NousResearch/hermes-agent>

### Fasi ancora mancanti — sequenza unica

| # | Stato | Fase | Risultato richiesto |
|---:|---|---|---|
| 1 | ✅ chiusa | Fondazioni frontend modulari | `frontend/src`, entry ESM, adapter, build deterministica e laboratorio isolato verificati; API, storage, SSE, WebSocket e URL conservati. |
| 2 | ✅ chiusa | Stato, lifecycle e decisione architetturale | Store/effect scope/abort/teardown verificati; ESM framework-neutral confermato dalle misure, senza cutover produttivo. |
| 3 | 🚧 in corso | Design system Calm e primitive | Token e componenti posseduti per pulsanti, menu, tabs, switch, sheet, tooltip, motion e focus. Ledger: `.claude/LEDGER-FRONTEND-FASE3-2026-09-01.md`. |
| 4 | ⏳ | Shell, navigazione e layout | Sidebar, header, inspector, composer, URL/deep-link e overflow ricomposti senza regressioni. |
| 5 | ⏳ | Conversazioni e sessioni | Portare nel nuovo frontend streaming, reasoning/tool lifecycle, approvazioni, queue/steer, selettori e persistenza già reali. |
| 6 | ⏳ | Repository e review | File tree VS Code-like, CRUD, Git/diff/test/rischio ed evidenza reale con liste grandi virtualizzate. |
| 7 | ⏳ | Superfici di esecuzione | Terminale, Browser, artefatti, task e agenti; risolvere o accettare formalmente il warning CSP xterm senza allargare la CSP. |
| 8 | ⏳ | Management | Portare senza riscriverli Settings, Model Lab, provider, download, hook/MCP/skill/plugin e automazioni. |
| 9 | ⏳ | UI Lab, performance e quality gates | 50 scenari/152 factory della ZIP, viewport/zoom/temi/tastiera/motion/forced-colors, misure lag e runtime Q4+. |
| 10 | ⏳ | Cutover strangler e release engineering | Parità completa, rollback, clean-room, installer e updater; `IExplorerCommand` moderno; README/benchmark e gate finale separato dal push. |

### Debiti trasversali da non perdere

1. Conferma manuale dell'aspetto della voce “Apri cartella con TALOS” in
   **Mostra altre opzioni**; il flusso tecnico è già verde.
2. Catalogo task preset: degradazione onesta chiusa, provider owner completo
   ancora da integrare quando esisterà il contratto approvato.
3. Warning CSP xterm.js: nessun `unsafe-inline`; decisione nella Fase 7.
4. Gate reale Full access su `C:\`: watcher sicuro, ma affidabilità modello su
   una radice intera da misurare e limitare per prodotto.
5. Debiti visuali già annotati: contrasto tema chiaro, header compresso,
   capability modal, stato mobile e terminale apparentemente vuoto.
6. `DESKTOP-1024-COMPOSER-RAIL-01`: a 1024×800 il rail destro comprime/taglia
   la parte destra del composer; chiusura prevista nella Fase 4 con test
   geometrico e screenshot completo.

### Correzione immediata owner — descrizioni tool (01/09/2026)

Chiusa tecnicamente e in attesa della review indipendente pre-commit: il
contratto desktop chiede a Qwen una descrizione umana per ogni comando shell e
la UI la conserva nella stessa riga anche dopo l’esito. Runtime mobile e schemi
MCP/plugin/Forge restano invariati. Backend 1.188/1.188, browser prodotto 38/38,
lab 3/3 e gate Qwen reale isolato verdi. Documenti autoritativi:
`DOSSIER-RICERCA-DESCRIZIONI-COMANDI-2026-09-01.md`,
`LEDGER-DESCRIZIONI-COMANDI-2026-09-01.md` e
`CONSEGNA-DESCRIZIONI-COMANDI-2026-09-01.md`.

### Prossima fase consigliata

Iniziare dalla **Fase 3 — Design system Calm e primitive**. Le Fasi 1 e 2 sono
chiuse e documentate; la nuova slice deve consolidare token e componenti
posseduti per pulsanti, menu, tabs, switch, sheet, tooltip, motion e focus,
senza anticipare la ricomposizione della shell prevista dalla Fase 4.

## P0 successivo al ciclo corsa — Workspace chooser di Nuova sessione

Decisione owner del 1 settembre 2026: immediatamente dopo la chiusura del
blocco indicatore/Stop/coda/Reindirizza, sostituire il picker workspace della
modale **Nuova sessione** con una superficie desktop ampia e realmente utile.

Contratto di prodotto già deciso, da non reinterpretare durante il ledger:

- modale più larga e più alta, senza diventare una pagina full-screen;
- colonna sinistra dedicata alla scelta della cartella tramite un file tree
  reale, inizializzato sul disco `C:\`;
- sopra l'albero, scorciatoie consigliate (almeno Desktop, Documenti,
  Download e percorsi recenti/di progetto); la selezione di una scorciatoia
  riposiziona e aggiorna immediatamente lo stesso albero, senza un secondo
  picker o stato parallelo;
- colonna destra per modello, reasoning, permessi e restanti opzioni della
  sessione, con gerarchia e spaziature progettate per desktop;
- percorso selezionato sempre leggibile e confermabile prima dell'avvio;
- nessuna directory finta: discovery, espansione, errori, permessi e avvio
  devono passare dai contratti server reali e restare in linguaggio naturale.

Gate prima del codice: dossier tecnico aggiornato e confronto documentato con
VS Code, Claude, Codex e Hermes; inventario dei contratti file tree già presenti;
threat model di radici, junction/symlink, cartelle protette e volumi; ledger
file-per-file con RED, casi contrari, performance su alberi grandi, tastiera,
focus, reduced-motion e screenshot a viewport desktop rappresentative. La UI
potrà riusare il file tree esistente solo dopo aver provato che il suo stato e
le sue policy sono compatibili con una sessione non ancora creata.

### Stato 01/09/2026 — implementato, gate visuale ufficiale ancora aperto

Il workbench Nuova sessione è implementato da frontend a backend. La colonna
sinistra usa un browser cartelle read-only con root `C:\`, caricamento a un
livello, scorciatoie reali e semantica tree; la destra conserva modello,
reasoning, planner e policy. Il vecchio picker e tutti i suoi selettori sono
stati rimossi anche dalla pipeline QA.

Gate verdi: backend 1214/1214, browser prodotto 59/59, chooser focalizzato
12/12, integrazione reale endpoint+UI 1/1, unit/contract 14/14, build 23 asset,
verify e diff-check. Un server isolato su `4176` ha enumerato `C:\` e
`C:\Users` reali; Qwen 3.8 Flash ha chiuso con output esatto `OK` nella
sessione `015def7b-bb92-4e43-be5f-3adbf61d1415`. Il server owner `4174` non è
mai stato riavviato ed è rimasto healthy.

Il browser ufficiale in-app ha restituito zero istanze anche dopo il percorso
di troubleshooting della skill. I test sintetici non vengono equiparati a
ispezione visuale: la fase è engineering-green ma non può diventare totalmente
green finché non vengono acquisiti e ispezionati gli screenshot ufficiali a
1440×900, 1280×800 e 1024×800. Documento di ripresa:
`.claude/CONSEGNA-WORKSPACE-CHOOSER-2026-09-01.md`.

## P0 aggiuntivo — modali e comandi Explorer (01/09/2026)

Implementati i due contratti approvati dall'owner:

- ogni modale desktop ha tre prese di resize, tastiera, limiti viewport e
  persistenza separata per superficie logica;
- sidebar Files e workbench Nuova sessione espongono una command bar nello
  stile VS Code/Windows; Nuova cartella nel chooser usa una rotta reale e gli
  stessi gate root/reparse del browser cartelle.

Stato tecnico: backend 1219/1219, browser 70/70 scenari ordinari, unit 14/14,
build/verify verdi, gate endpoint reale 1/1 e creazione cartella reale verde.
La verifica ufficiale resta bloccata perché il browser integrato non espone
istanze; una nuova corsa Qwen su server isolato non ha concluso entro due
minuti ed è stata annullata. Documenti autoritativi:
`.claude/DOSSIER-RICERCA-MODALI-FILE-EXPLORER-2026-09-01.md`,
`.claude/LEDGER-MODALI-FILE-EXPLORER-2026-09-01.md` e
`.claude/CONSEGNA-MODALI-FILE-EXPLORER-2026-09-01.md`.

## P0 urgente — ripresa sessioni e attività percepibile (01/09/2026)

Implementazione e review indipendente del recupero sessioni sono verdi: 23
scenari permanenti coprono errore, riavvio, checkpoint, snapshot tardivi,
concorrenza e crash durante Reindirizza. La riga di attività usa ora tre punti
in pulsazione sequenziale più tempo; barra, testa e shimmer sono stati rimossi.

Documenti autoritativi:

- `.claude/DOSSIER-RICERCA-SESSION-RECOVERY-2026-09-01.md`;
- `.claude/LEDGER-SESSION-RECOVERY-2026-09-01.md`;
- `.claude/CONSEGNA-SESSION-RECOVERY-2026-09-01.md`;
- `.claude/DOSSIER-RICERCA-ATTIVITA-RISPOSTA-2026-09-01.md`;
- `.claude/LEDGER-ATTIVITA-RISPOSTA-2026-09-01.md`;
- `.claude/CONSEGNA-ATTIVITA-RISPOSTA-2026-09-01.md`.

Il P0 include ora anche resilienza OpenRouter e hot-swap auditabile:

- timeout di inattività rinnovato da chunk/commenti SSE, mai durata totale;
- errori SSE pre-output ritentabili e post-output non duplicabili;
- switch modello + reasoning persistito atomicamente;
- modello/reasoning per `RunStarted`, UI ed export per-turno;
- cronologia, tool call/result e permessi conservati nello stesso session id.

Documenti autoritativi aggiunti:

- `.claude/DOSSIER-RICERCA-OPENROUTER-RESILIENZA-2026-09-01.md`;
- `.claude/LEDGER-OPENROUTER-RESILIENZA-2026-09-01.md`;
- `.claude/CONSEGNA-OPENROUTER-RESILIENZA-2026-09-01.md`.

Evidenza sintetica/visuale: backend 1252/1252, browser 71/71 con un opt-in
saltato, focused switch/loader 4/4, quattro screenshot dedicati ispezionati e
`git diff --check` pulito. Due advisory high preesistenti restano nel ramo
`pptxgenjs -> image-size`; nessun `npm audit fix --force` breaking è stato
eseguito.

Gate successivo, unico e bloccante: con autorizzazione owner riavviare una
volta `4174`, verificare health/Doctor, riprendere una sessione Qwen con un
messaggio reale esclusivamente su `qwen/qwen3.8-flash`, effettuare uno switch
sintetico a un modello differente senza chiamarlo, tornare a Qwen, inviare un
follow-up reale, ricaricare e controllare cronologia, tool trace e modello di
ogni turno. Fino ad allora il processo owner resta intatto e la slice non viene
dichiarata completata al 100%.

## Aggiornamento P0 autorevole — gate Qwen e lag chiusi (01/09/2026)

Il gate descritto nel paragrafo precedente è stato successivamente eseguito e
chiuso sulla sola Qwen 3.8 Flash autorizzata; evidenze e screenshot sono in
`.claude/QA-VISIVA-HARNESS-2026-08-30.md` e
`harness-ui/frontend/artifacts/real-qwen-gate-2026-09-01/`. Non deve essere
ripetuto per validare il fix prestazionale seguente.

La profilazione prioritaria del lag ha isolato due cause reali e indipendenti:

1. l'osservatore Chokidar ricorsivo poteva crescere fino a `255330` handle e
   oltre `3 GB` di memoria privata su un workspace ampio;
2. il background scriveva custom property sulla radice a ogni frame, causando
   circa `0.4635 s` di ricalcolo stile ogni `5 s` anche senza interazione.

Entrambe sono chiuse con contratti permanenti:

- watcher nativo Node ricorsivo, condiviso e non persistente, posseduto soltanto
  da un run o da almeno un client SSE e rilasciato all'ultimo owner;
- animazione CSS sui soli `transform` dei due orb, con pausa esplicita per
  modalità statica, scheda nascosta, data saver e reduced motion.

Gate finale: backend `1259/1259`; frontend verify verde; browser `76` passati e
`2` opt-in saltati; processo post-fix stabile a `272–277` handle, circa `73–78
MB`, CPU a regime `0 s/5 s`; `RecalcStyleDuration=0` in 5 s sia motion ON sia
OFF. Screenshot scuro 1440×900 e chiaro 1024×800 ispezionati integralmente.

Documenti autoritativi:

- `.claude/DOSSIER-RICERCA-LAG-DESKTOP-2026-09-01.md`;
- `.claude/LEDGER-LAG-DESKTOP-2026-09-01.md`;
- `.claude/CONSEGNA-LAG-DESKTOP-2026-09-01.md`.

La ricognizione successiva ha chiuso formalmente anche la Fase 1 già
implementata; la tabella di marcia passa alla Fase 2. Utility process e
ParcelWatcher restano un fallback documentato, non una fase necessaria: il
watcher nativo soddisfa il budget misurato.

## Aggiornamento owner — capability di prima classe e 6.3B (01/09/2026)

Due debiti distinti entrano nella sequenza senza alterare il perimetro della
Fase 2:

1. `NAV-CAPABILITY-FIRSTCLASS-01`: Libreria, Memoria, Note, Attività e Ricerca
   approfondita esistono come capability reali ma sono nascoste nel Capability
   Hub. Devono diventare cinque righe sidebar di prima classe, ciascuna con una
   pagina dedicata collegata ai dati reali. La Fase 2 prepara route controller
   e stato; la Fase 4 consegna navigazione e pagine, senza placeholder attivi.
2. `RESEARCH-MOBILE-PARITY-01`: la Ricerca desktop resta una thin slice e non
   possiede ancora pianificazione event-sourced, verifica indipendente,
   citazioni e approvazione del piano del mobile. È un debito funzionale
   separato dalla sola presenza della pagina dedicata.

La futura `MESSAGE-ACTIONS-6.3B` viene collocata nella Fase 5
Conversazioni/sessioni, dopo stato/lifecycle. Il pin mobile canonico verificato
è `e69402bcf940a4a347434ab93e551c39ff7f86c6` e contiene schema, fixture,
resolver e test Harness. Il desktop non modificherà
`mobile/public/harness-ui`, il cui riallineamento resta responsabilità della
lane mobile.

## Fase 2 — chiusura tecnica e visiva (01/09/2026)

La fondazione parallela di stato, reducer, store, lifecycle, componenti,
virtualizzazione, focus, overlay, shortcut e annunci è implementata senza
cutover produttivo. La decisione architetturale resta ESM framework-neutral:
le misure P0 hanno escluso il framework come causa del lag; un eventuale
verticale Vue richiede decisione owner e parità misurata separatamente.

È adottato `@tanstack/virtual-core@3.17.8`, pin esatto MIT, dietro adapter
TALOS e con licenza nel manifest. La review del lifecycle ha aggiunto lo
scenario permanente `PHASE2-OVERLAY-STATE-11`: chiudere una modale ripristina
esattamente qualunque stato `inert`/`aria-hidden` preesistente.

Gate: frontend `53/53`, lab browser `15/15`, backend `1259/1259`, UI prodotto
`76` passati e `2` opt-in saltati, hash pubblici invariati, server owner `4174`
sempre `200`, nove screenshot interi ispezionati e review indipendente GREEN.
L'attestato coerente è `harness-ui/frontend/artifacts/phase-02-verification.json`.
Consegna:
`.claude/CONSEGNA-FRONTEND-FASE2-2026-09-01.md`.

Prossima fase in sequenza: Fase 3, Design system Calm e primitive sul lifecycle
appena verificato; la ricomposizione della shell resta Fase 4 e la parità azioni
messaggio 6.3B resta nella Fase 5.

## Valutazione FreeToken — slice differita e condizionata (01/09/2026)

La review indipendente al pin FreeToken
`e05cff83a04b322fc7823678aa2d05c826aad26c` decide **ADAPT**, non sostituzione:
FreeToken è un candidato runtime MoE NVIDIA opzionale dietro un adapter TALOS.
Catalogo, download, provenienza, policy, fit, Doctor e UI restano TALOS.

La slice non anticipa né interrompe le Fasi 3–5. Potrà aprirsi solo dopo:

1. contratto local-runtime provider-neutral e characterization llama.cpp;
2. probe hardware desktop con GPU/VRAM/RAM/PCIe e provenienza;
3. fit con confidenza e qualifica A/B end-to-end;
4. SBOM/licenze, sandbox del remote code, pin HF immutabile e rollback;
5. gate Windows/Linux esplicito su hardware NVIDIA autorizzato.

Il daemon upstream potrà essere integrato direttamente nel solo adapter
FreeToken. Il download HF upstream, `trust_remote_code=True`, la raccomandazione
`auto` non validata e la Desktop UI chiusa non vengono adottati.

Dossier: `.claude/DOSSIER-RICERCA-FREETOKEN-2026-09-01.md`.
