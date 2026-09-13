# CODA UNICA DEI DEBITI — TALOS Harness Desktop

> ⛔⛔⛔ **11/09/2026 — QUESTO DOCUMENTO DICEVA APERTE QUATTORDICI RIGHE GIÀ CHIUSE.**
> Owner, oggi: «non voglio assolutamente vedere fasi già fatte in documenti di debiti/implementazioni
> in corso». Le quattordici righe stanno ora nella sezione «✅ CHIUSE» qui sotto, **non più fra gli
> aperti**, ognuna con la prova rimisurata oggi. Testo originale conservato: nessuna riga cancellata.
>
> ⛔ E il documento **si contraddiceva da solo**: la sua §6 («Aggiunte e smarcature del 07/09»)
> dichiarava CHIUSE **otto** righe (T03-D2, BH-05, BH-13, BH-14, CB-10, CB-11, CB-14, CB-18-bis) che
> le tabelle §2.1/§2.2 dello stesso file continuavano a elencare come APERTE, dieci schermate più su. La prima riga di §2.1 — «T03-permessi-D2», il difetto di
> sicurezza indicato anche come **numero 1 di §7 “L'ordine in cui la farei”** — era chiusa dal
> **06/09**, cioè il giorno stesso in cui il documento è nato.
>
> Lo stato accertato oggi di tutte le righe è in **`.claude/STATO-VERO-DELLE-RIGHE-2026-09-11.md`**.

## 📌 STATO DELLA CODA al 12/09/2026, 10:45 — aggiornato per l'owner («dammela tutta»)

> Una riga per voce, stato VERO alla data. ✅ chiuso e verificato sul 4174 · 🔧 codice fatto, manca la
> verifica dal vivo o un aggancio · 🏃 in corso (agente) · 🔜 approvato, non iniziato · ⏸ aperto, in
> attesa di una decisione · ❌ non iniziato.

### ⛔ DECISIONI DELL'OWNER — 12/09/2026, ore 11 (sulla tabella qui sopra)

Parole sue, in ordine, e cosa cambia nella coda:

| voce | parole dell'owner | conseguenza |
|---|---|---|
| **BC-13** | «importante, bisogna fare una ricerca delle ultime tecnologie e metodi all'avanguardia, dobbiamo rendere il motore di llm locale estremamente rapido e meglio dei competitor» | **RIDEFINITA**: non più «elenco dei modelli locali istantaneo» ma **velocità del motore locale del desktop** (`llama-server-supervisor.mjs`, llama.cpp b10517): ricerca web sullo stato dell'arte, misura di base su questa macchina, confronto coi concorrenti, cure misurate. Priorità **1** |
| **BC-15** | «io lo vedo e funziona già, manca verifica dal vivo» · poi «SI» al giro | ✅ **verificata dal vivo il 12/09 sul 4174** con glm-5.3-flash, sessione `dbf70964`, chiaro e scuro: pannello, «Sto riscrivendo…» fotografato DURANTE, esito in 48 s / 32 s con principi applicati, «Sostituisci» che riempie il composer (1.303 / 1.338 caratteri) e accende Invia, zero errori JS, unica POST quella della rotta. Foto in scratchpad `bc15/` |
| **BC-12 / BC-14** | «importante anche questo: il pulsante dice serve accesso pieno» | **secondo giro**: la cura di BC-14 dice il vero (il server rifiuta una cartella libera senza «Accesso pieno», `session-registry.mjs:3291`) ma la regola stessa è quella che l'owner non vuole: una cartella scelta a mano deve poter partire con «Scrive nel progetto»/«Chiede prima»/«Solo lettura». Priorità **2** |
| **BC-10** | «sì, in modalità chat a tutta larghezza» | confermata: margine sinistro pari al destro con la barra di navigazione, solo a tutta larghezza. Priorità **4** |
| **BC-08** | «importante» | barra di navigazione con anche le risposte del modello. Priorità **3** |
| **PO-13** | «da valutare in seguito» | ⏸ |
| **PO-14 P-D…P-L** | «ok ma diamo la precedenza alle cose più importanti» | dopo BC-13/12/14/08/10 |
| **L10** | «ok, aggiungi anche questo: modalità piano con ricerca strategica a regola d'arte» | **ALLARGATA**: non solo il pulsante di approvazione del piano, ma una **modalità piano** della ricerca approfondita — ricerca strategica preliminare (stato dell'arte: come lo fanno i sistemi di deep research nel 2026), piano a rami proposto e approvato dalla persona, poi la corsa. Dopo L9 |
| **BC-35** | «ok» | DOCX con titoli di Word + elenchi annidati nel Markdown server. Dopo L9 (stessi file di `src/research/`) |
| **A/B del banco** | «alla fine» | ⏸ ultimo |

**Decisioni successive (12/09, ore 11:40):** «calm primo» ⇒ fatto (`conCalmPrimo`, solo l'elenco dello studio, non il contratto); riga «Scena del tema» delle Impostazioni ⇒ tolta su mio consiglio (doppia con lo studio, vuota a sfondo spento).

**Trovati nel taccuino durante il giro BC-15 (nuovi, aperti):**
- **BC-36** — il chip del composer dice «Scrive nel progetto» mentre la testata della stessa sessione dice «Accesso pieno» (sessione `dbf70964`, foto `bc15/dark-3-esito.png`): il chip mostra un valore predefinito, non il permesso della sessione aperta.
- **BC-37** — la stessa sessione aperta due volte con `passaASessione` mostra due nomi diversi in testata: «Rispondi solo: uno.» e «Compito libero · cartella scelta a mano» (foto `bc15/dark-3-esito.png` e `light-3-esito.png`). Il nome dipende da quale dato arriva prima, non dalla sessione.

⇒ **Ordine di lavoro dal 12/09, ore 11:** L9 (in corso) → BC-13 · BC-12/14 #2 · BC-08 · BC-10 (in parallelo, file disgiunti) → L10 → BC-35 → P-D…P-L → PO-13 → A/B.

**BC-39 — 12/09, ore 13: «i modelli OpenRouter sono estremamente lenti al primo messaggio, quasi un minuto» (owner). ✅ CURATA (`5ccb3692`) E VERIFICATA SUL 4174: invio minimo su Desktop 37,5 s → **5,2 s** al primo token, stessi 3.856 token (pid 14984).**
Non era il fornitore né i token: `tempi-giro` diceva 2,4 s su `harness-ui`, 4,2 s su `AVM-harness-desktop`, **34-42 s su `Desktop`** a ogni invio dopo cinque minuti; invio minimo su Desktop: 37,5 s con 3.856 token. Da soli: `contestoDelProgetto` su Desktop **34.356 ms** (raccolta di 288 `.gitignore` = 12.342 ms; giudice che scorre 6.002 regole per ogni file contato; `realpath` per ogni cartella; cache di 5 minuti che fa aspettare la ricostruzione). Cure: tetti in tempo (1,5 s raccolta, 2 s mappa) dichiarati al modello; regole indicizzate per base (0,265 → 0,002 ms); `realpath` solo sui collegamenti; cache stale-while-revalidate. Dopo: **Desktop 1.594 ms, repo intero 1.278 ms, harness-ui 293 ms**, mappa identica al byte. Fonti: Anthropic «Effective context engineering» (29/09/2025), docs Claude Code (il `/doctor` toglie i «directory layouts»), aider repomap, RFC 5861.
Proposta dell'owner registrata («magari mettere il preambolo come tool»): la forma «just in time» — mappa minima nel preambolo e `elenca`/`cerca` per scendere — è la direzione che le fonti confermano; oggi la mappa pesa 998-7.234 token e il taglio in profondità a 4.000 token esiste già. **BC-40 — owner 12/09: «sì».** Ridurre la mappa del preambolo alla profondità 2 e lasciare il resto a `elenca`/`cerca`; misurare prima/dopo sui token del primo giro e sul tempo. Da assegnare (Opus High) dopo BC-38.

**BC-44 (nuovo) — la ripresa non accetta una ricerca `failed` per errore del FORNITORE.** Giro vero L9 del 12/09 (ricerca `dec896c0`): motore acceso (16 giri, 32 attrezzi, 67 fonti tenute, piano e passi nel giornale, 134k token dalla cache), a un passo dal deposito il fornitore ha chiuso la connessione (`RunError: Upstream idle timeout exceeded`) ⇒ `failed`, e `POST …/ripresa` risponde 409 RESEARCH_CONFLICT. Venti minuti di lavoro pagato che il giornale conserva e nessuno può riprendere. Da fare: `failed` per errore di rete/fornitore ⇒ ripresa permessa dal giornale (L9 la prova già in test), con il motivo dichiarato; e la verifica (giudice) non è mai stata provata dal vivo: resta da rifare il giro.

**PO-15 (nuovo, 12/09 ore 13, owner: «segna che anche TALOS dovrà avere la capacità di farlo, segnalo come implementazione futura») — TALOS delega a un agente esterno da riga di comando (Astra/Codex, e per estensione Claude Code, Hermes).** Verificato oggi: `codex exec` (CLI 0.153.4, accesso ChatGPT) risponde non interattivo in 12 s («Codex, basato su GPT-6»), accetta prompt da file/stdin, sandbox `read-only|workspace-write|full-auto`, `resume --last` per i seguiti, uscita anche in JSONL. Forma prevista: un attrezzo «delega esterna» (nome umano a schermo) che avvia la CLI in una cartella/worktree con permesso della sessione, registra stdout/JSONL nel giornale come un sotto-agente (scheda Agenti, D2 delega), esito nel deposito; permessi: mai oltre quelli della sessione; niente segreti in riga di comando. Ordine: dopo la coda attuale, prima di PO-13.

### 📋 TABELLA DI MARCIA — riscritta il 12/09 ore 13 (ordine di lavoro)

| # | voce | chi | stato |
|---|---|---|---|
| 1 | BC-40 mappa minima nel preambolo, resto agli attrezzi | agente | ✅ committata `752a764e`: profondità 2, tetto 1.200 token, `elenca` con `percorso`; preambolo del repo intero −38 %; giri veri 3/3 giusti (prima 2/3). Nuovo bersaglio misurato **BC-48**: il blocco `AGENTS.md` pesa 3.400 token, l'87 % del preambolo su `harness-ui/` |
| 2 | BC-36/37/41/42 chip permesso · nome doppio · giri «in corso» nel replay · albero chiesto a pannello nascosto (la diagnosi «percorso vuoto → 400» è smentita: il 400 è una cartella cancellata, 3 sessioni su 27) + aggancio BC-38 | agente | ✅ codice committato, 980/980; consegna e foto sul 4174 dopo BC-44 (i suoi file della ricerca sono a metà nell'albero). Nuovi aperti: **BC-45** iframe verso arxiv che tiene rosso RUNTIME-01 (`browser.js:464`); **BC-46** il server chiama «query non valida» una cartella cancellata (ENOENT → QUERY_INVALID in `workspace-tree.mjs`); **BC-47** «local:unsloth-…» a schermo nella barra delle sessioni |
| 3 | BC-44 ripresa di una ricerca fermata dal fornitore, giudice L9 dal vivo | agente | ✅ committata e VISTA sul 4174 (pid 24712) nei due temi: scheda «Interrotta dal fornitore» con la spiegazione, «Riprendi» nel menu ⋯, «Come è andata» con speso e giornale. Prova vera: ricerca `done` da sola col giudice `glm-4.7-flash` (11/4/6/10). Aperto: BC-49 (Astra, in corsa) |
| 4 | consegna `public/`, riavvio 4174, foto due temi, push del blocco | io | dopo 1-3 |
| 5 | L10 modalità piano della CHAT (owner 12/09: «ATTENZIONE, L10 è la modalità piano della chat, non della ricerca; ricerca web dei plan mode migliori del mondo, punti deboli, cosa fare per batterli tutti») | Astra (ricerca) | ✅ ricerca consegnata `.claude/RAPPORTO-L10-PLAN-MODE-CHAT-2026-09-12.md` (97 KB): 14 concorrenti con Hermes primo, matrice funzione × concorrente, disegno «piano vivo dentro la conversazione» (pillola Piano/Esegui, esplorazione in sola lettura, domande solo se cambiano il piano, approvazione della versione esatta, passi con prove, deviazioni dichiarate, verifica finale, costo per fase, piano in Note/Attività), ledger di implementazione. **Owner 12/09: «la modalità piano la rilasciamo dopo la prima versione»** ⇒ implementazione dopo la v0.1 desktop; la ricerca resta la base; le tre decisioni di confine (§7.1) si sciolgono allora. Il brief sbagliato (piano della ricerca) è archiviato come `PROMPT-ASTRA-…-L10-SBAGLIATO-…` |
| 6 | BC-35 DOCX con titoli di Word + elenchi annidati nel Markdown server | Astra via `codex exec` (primo lotto: 188k token, ~1 h) | ✅ committata, 47/47 rilanciati da me; manca solo l'apertura in Word e il riavvio del 4174 |
| 7 | BC-43 chiamanti dello scorrevole della chat | Astra | ✅ committata `81b5177a`: 33 risoluzioni censite, modulo `bridge/conversazione-dom.js`, ritorno in fondo e scroll sullo scorrevole (0 → 2161), spina 12/12 → 2/12 visibili, reduced-motion rispettato; 997/997; VISTO sul 4174 nei due temi (ritorno in fondo: scorrevole 0 → 8186, colonna 0) |
| 8 | PO-14 P-D…P-L fornitori | Astra, uno per volta | **P-D ✅ · P-E ✅ · P-F ✅ · P-G ✅ · P-H ✅ · P-I ✅ · P-J ✅ · P-K ✅ · P-L ✅** — P-J `0931d3de` (wire Anthropic verso Z.AI porta Anthropic e MiniMax porta Anthropic; in review la porta MiniMax rinominata `minimax-anthropic` perché P-I ha già `minimax` sul wire OpenAI), P-K `7ff477d0` (Azure/Bedrock/Vertex sul wire OpenAI ufficiale senza SDK cloud, campi Regione/Progetto/Versione nella scheda), P-L `97b1cc88` (agente esterno ACP v1 su stdio, record `esterno`); registro a **29** record; suite intera 2783/2786 (3 saltati), frontend 987/987; 4174 riavviato (`927304e9`), schede viste nei due temi in `.claude/foto-pjkl-2026-09-12/`. **Debiti aperti:** P-K-bis scelta dei nomi di distribuzione Azure/Vertex dal composer (oggi il catalogo dice «serve una configurazione»); P-L-bis `esterno` non compare nel selettore (il composer carica solo fornitori con chiave) e nessun agente vero provato; badge «Indirizzo predefinito» con indirizzo vuoto ✅ curato (`122ce7a1`, «Indirizzo da impostare»). **P-K-bis + P-L-bis ✅** (`dbe905c4`, public `71964d88`): modelli configurati per i cloud come preferenza non segreta (Azure/Vertex dalla lista, Bedrock catalogo + lista), agente esterno configurabile dalla scheda e visibile nel selettore solo se configurato; 158/158 backend, 30/30 frontend; visto sul 4174 nei due temi (scheda Azure con «Modelli configurati», scheda «Agente esterno» con Comando/Cartella/Argomenti/Variabili, badge «Agente da configurare»). Non verificato dal vivo: nessuna chiave di questi fornitori (`9ade5b09`+`b4ff229b`: Kimi, MiniMax, Qwen; registro a 23, 20 Diretti; 134/134 backend, 15/15 frontend; visti sul 4174 nei due temi in `.claude/foto-pi-2026-09-12/`; non provato dal vivo: nessuna chiave dei tre) (`bdaac011`+`72ae2969`, pushati: pool di chiavi con panchine per classe BC-44, riserve fra fornitori con conversazione intatta e riga onesta in chat; visto sul 4174 nei due temi: scheda del fornitore con le chiavi, «Se non risponde, continua con…» nella pillola e nella modale; **non verificato dal vivo** un cambio di fornitore a metà sessione). Prossimi: P-I Kimi/MiniMax/Qwen, P-J wire Anthropic, P-K Azure/Bedrock/Vertex, P-L provider esterno |
| 9 | PO-15 TALOS delega a un agente esterno da CLI | Astra + kernel (io) | 🔜 nuovo |
| 10 | PO-13 proposta GPT-Live-1 | — | ⏸ «in seguito» |
| — | **Orb del mobile nella bolla d'attesa** (owner 12/09 22:50: «il mobile ha introdotto un nuovo logo animato di caricamento… mettilo al posto del segnavia con i pallini e la linea») | io | ✅ `6d27602d` + `e04147f5` (url `/talos/*` esterni a esbuild) + public `1dca2a4a`: è l'orb dei messaggi Calm del mobile (commit `4ccbed1f`, ramo `lane/voce-personale`), cerchio 2,25 rem col marchio corto e anello che ruota in 1,5 s; visto DURANTE un giro vero nei due temi (`.claude/foto-orb-2026-09-12/`, anello `talos-orb-spin` 1.5s, marchio dal file servito) |
| — | PO-15 TALOS delega a un agente esterno da CLI | Astra | ⏸ **dopo la release** (owner 12/09 18:40); P-L (ACP) ne è la base |
| — | **PO-16 (nuovo, owner 12/09 20:05): connessione e autenticazione a GitHub con una voce nuova nella colonna destra «molto molto simile» al Source Control di Visual Studio Code** — commit, file modificati/dati con stato, diff, stage/unstage, commit e push, rami, pull request, «nei minimi dettagli» | ricerca prima (Astra), poi implementazione | ⏸ **dopo la release**; prima la ricerca (VS Code SCM API e vista Source Control, GitHub Desktop, GitLens, gh CLI, OAuth device flow di GitHub, Hermes) e una proposta di disegno da approvare |
| — | **BC-48** `AGENTS.md` = 87 % del preambolo | Astra (C, A) · owner+io (B) | **C ✅ committata `c50f96b0`** (istruzioni → mappa → scheda; primo byte diverso 214 → 13.222; «Riusato dalla cache · N %» dagli eventi P-H; **misura vera fatta** (`.claude/BC48-C-MISURA-CACHE-2026-09-12.jsonl`: sei sessioni a due turni, `cached_tokens` al turno 2 = **2.304 sia prima sia dopo**, 45,6 %: il riordino da solo non sposta il confine della cache su Z.AI/OpenRouter ⇒ **C-bis ✅** (adapter: il marcatore non cambia più la forma del preambolo già inviato sopra i 16.000 caratteri, prefisso stabile 443 → 19.533 byte con 18 KB; con 11,5 KiB il prefisso era già identico a 13.242 byte in entrambi gli ordini; **il plateau di 2.304 token resta non spiegato**: coincide con strumenti + istruzioni del kernel, Z.AI/OpenRouter non documentano la granularità. **C-ter, decide l'owner:** ripetere la misura con DeepSeek (cache a blocchi da 64 token, documentata, chiave presente) per capire se il limite è del fornitore — costa un giro con un modello diverso da glm-5.3-flash); la riga «Riusato dalla cache · 46 % · su 2 giri» è viva sul 4174 nei due temi (`.claude/foto-bc48c-2026-09-12/`). **A ✅ `ae844651`** (indice delle sezioni con righe e byte, sezioni «sempre» intere, sezioni per percorso accodate una volta via contextHooks; blocco istruzioni 11.845 → 3.552 byte): **due giri veri sul 4174** — il modello elenca le 15 sezioni con le righe giuste dall'indice (nessun attrezzo) e, alla domanda sulla ricerca web, chiama `leggi(AGENTS.md)` e risponde dalla sezione 61-84; `prompt_tokens` della prima chiamata 5.049 → 3.586 (−29 %). Bersaglio 900 token del preambolo non ancora raggiunto (1.259 stimati): tocca a B. Debiti A-bis: `leggi` per intervallo di righe e callback per le sessioni senza gestione del contesto (entrambi nel kernel condiviso: diff nel rapporto). **B ✅ `266b2378`** (radice 172 → 140 righe con sezioni «sempre» marcate, `core/`, `validator/`, `control-plane/`, `harness-ui/AGENTS.md` con i testi approvati; ogni riga dell'originale ritrovata; 101/101): blocco istruzioni su harness-ui/ 3.552 → 6.472 byte, preambolo stimato 1.259 → 1.989 token — **bersaglio 900 non raggiunto**: entrano intere le sezioni «sempre» della tabella e il file di cartella (2,2 KB); giro vero sul repo harness-ui/: prompt 4.567 token. **Decide l'owner** se accettare così o stringere (meno sezioni «sempre», file di cartella più corto). **C-ter ✅ misurata:** DeepSeek diretto respinge la chiave (401, sei chiamate: chiave da rinnovare); DeepSeek via OpenRouter cacheggia **3.584 su 3.687 token** al secondo turno (97 %, blocchi da 64) ⇒ il prefisso stabile di C funziona; Z.AI/OpenRouter con glm-5.3-flash cacheggia **sempre e solo 2.304 token** quando il prompt è ≥ ~4.800 (banco con AGENTS triplo: 2.304 su 4.816) e **0** quando è ~3.500: limite del fornitore, non del preambolo. Proposte per mobile (viewport) e banco (regola ON/OFF) nel rapporto B. Decisione 12/09 19:00: «approvo C, A, B, dopo P-I…P-L» — ricerca in `.claude/RICERCA-BC48-ISTRUZIONI-DI-PROGETTO-2026-09-12.md`; ordine C (prefisso stabile + cache misurata) → A (indice sempre, sezioni su richiesta) → B (radice corta, `AGENTS.md` per cartella, con tabella sezione→cartella prima di spostare); brief pronti in `.claude/PROMPT-ASTRA-2026-09-12-BC48-C-*.md` e `-A-*.md`, si lanciano alla chiusura di P-I…P-L; **B: «tabella ok» (owner 12/09 19:20)** — si applica `.claude/BC48-B-TABELLA-SEZIONI-PER-CARTELLA-2026-09-12.md` come proposta; sezione 3 riscritta e `harness-ui/AGENTS.md` **approvati («Ok», 19:30)** in `.claude/BC48-B-PROPOSTA-TESTI-2026-09-12.md`: B è interamente decisa, manca solo l'esecuzione (Astra, dopo C e A) |
| — | P-J · P-K · P-L in parallelo | tre sessioni Astra in worktree (`wt-astra-pj/pk/pl`, base `81e27a3b`) | ✅ chiuse e riconciliate il 12/09 (21:30); i tre worktree restano da rimuovere nella pulizia finale |
| 11 | Release desktop: R-01…R-06 (guscio Electron, installer «all in one» a un clic con Calm di serie e motore locale incluso, CI Windows con attestazione, misure, monorepo pubblico AGPL-3.0 su desktop e mobile, modelli scaricati dall'app) — **nessuna firma** (l'owner non ha partita IVA né azienda) | Astra + io | ✅ **le sei risposte sono date** (12/09 17:40, nel piano §5): si parte appena la coda dei difetti è chiusa |
| — | **R-01 guscio Electron** (`harness-ui/labs/electron-shell` → `harness-ui/desktop/`, Electron 44.3.0, figlio col Node di Electron, tray, «Apri nel browser», Playwright `_electron`) | Astra (worktree `wt-astra-r01`, brief `.claude/PROMPT-ASTRA-2026-09-13-R01-guscio-electron.md`) | ✅ `aca60ce5` (13/09 01:35): Electron 44.3.0, figlio col Node di Electron, node-pty senza rebuild, tray, «Apri nel browser», test Electron veri 3/3 dopo tre correzioni ai test in review (cartella delle misure, lettura del PTY dal WebSocket invece delle righe DOM di xterm con WebGL, doppia inversione della checkbox); misure: prima finestra 1.514 ms, seconda istanza 68 ms, guscio 433 MiB di working set + figlio 118 MiB; foto due temi in `.claude/foto-r01-2026-09-13/`. Aperto: token monouso per «Apri nel browser» (riga di comando dell'associazione Windows) |
| — | **R-02 installer a un clic** (electron-builder 26.16.1, NSIS per utente + zip, staging del server con dipendenze di produzione, llama.cpp b10517 CPU+Vulkan dentro, niente GGUF; prova di installazione silenziosa) | Astra (worktree `wt-astra-r02`, brief `.claude/PROMPT-ASTRA-2026-09-13-R02-installer-un-clic.md`) | ✅ chiusa 13/09 (exe 152,1 MB, zip 255,9 MB, installato 730,8 MB, installazione 42,8 s, prima finestra 3,82 s, disinstallazione pulita; `server.mjs` con `percorsoDatiDesktop` per tutti i negozi; misure in `desktop/LEDGER-R02.md`) |
| — | **R-04 CI Windows** (job `desktop` di `release.yml` su windows-latest: cancelli, `npm run dist`, smoke dell'installato con `scripts/ci-smoke.ps1`, SHA256SUMS e note, `actions/attest` v4, release con tre asset) | Astra (worktree `wt-astra-r04`, brief `.claude/PROMPT-ASTRA-2026-09-13-R04-ci-windows.md`) | ✅ chiusa 13/09: workflow provato in locale (33 test puri, actionlint 0, smoke reale sulla macchina dell'owner 84,2 s: installazione 48,2 s, avvio 7,9 s, salute 401/200/200, disinstallazione 20,3 s senza residui; il rosso di Astra era il crash GPU della sandbox); test delle ricevute portato sul kernel incluso. ⛔ **Bloccanti per il tag `desktop-v0.1.0`** (job mai lanciato): ~~i 3 rossi preesistenti di `src/kernel/talosHarness.test.mjs`~~ ✅ curati 13/09 su ordine dell'owner («cura tu»): test allineati ai contratti del 10-11/09, kernel 559/559; `kernel:controlla` esce 0 anche senza fonte esterna; attestazioni solo su repo pubblico o Enterprise (R-05). Rapporto `.claude/RAPPORTO-R04-CI-WINDOWS-2026-09-13.md` |
| — | **R-06 misure** (peso installer, RAM a riposo, tempo alla prima schermata, macchina dichiarata) | io | ✅ chiusa 13/09 dallo smoke di R-04: installer 145,0 MiB (zip 244,0), RAM a riposo **611 MiB** (guscio 479 su 4 processi + backend 132, due giri concordi), prima finestra **3,82 s** dal lancio Playwright dell'exe installato (non un doppio clic vero); `harness-ui/desktop/LEDGER-R06.md`. Trovato e curato un falso rosso dello smoke: il disinstallatore NSIS pulisce da una copia in Temp, i collegamenti si aspettano con scadenza |
| — | **R-05a licenza AGPL-3.0-only su tutto** (LICENSE, NOTICE, campi `license`, README, CHANGELOG desktop, compatibilità terze parti; `mobile/` solo diff) | Astra (worktree `wt-astra-r05a`, brief `.claude/PROMPT-ASTRA-2026-09-13-R05a-licenza-agpl.md`) | ✅ chiusa 13/09: LICENSE = testo GNU integrale (impronta ufficiale), NOTICE, README, 10 manifesti, CHANGELOG desktop, audit 448 pacchetti senza incompatibilità, 45/45 test puri. ⛔ **Handoff alle altre lane** (diff in `.claude/R05A-handoff.diff`): `mobile/**` (package, README, contracts, design-tokens, tools), `core/composer.json`, `control-plane/{composer,package}.json`. Proposta intestazioni nei sorgenti: decide l'owner (rapporto §8) |
| — | **R-05b monorepo pubblico** — ⛔ **decisione owner**: esiste già `Ninozzz95/talos` (copia della sola mobile alla radice, 81 commit tutti dell'owner, 28 release, chiavi di firma APK lì, esportata da `scripts/prepara-la-pubblicazione.ps1` + `pubblica.ps1`; `release.yml` già riconosce «dove sta l'app»). Consiglio: **evolvere `talos` in monorepo** (mobile in `mobile/`, desktop in `harness-ui/`, stessa disposizione del privato, un commit di riordino, storia e release conservate) invece di un repo nuovo (duplicherebbe la mobile, sposterebbe i segreti, romperebbe i link delle 28 release) | io + Astra | ✅ **chiusa 13/09 inline** (scelta A; Astra interrotta dai crediti, finita da Claude su ordine «B»): `scripts/prepara-monorepo-pubblico.ps1` 15/15 test, anteprima verde (926 file esportati, 2.208 rinomine R100, spie 0, licenza ok), giro reale su `AVM-PUBBLICA`: commit riordino `6b3f16a` + commit desktop, **push da chiedere**. Rapporto `.claude/RAPPORTO-R05B-MONOREPO-PUBBLICO-2026-09-13.md`. Dopo il push: avviso alla lane mobile |
| — | **R-03 motore dalla macchina** (Vulkan solo se `--list-devices` elenca un dispositivo, ripiego a caldo sulla CPU quando Vulkan non ha dispositivi o muore, scelta manuale nel guscio, stato nella UI; impronta sbagliata ⇒ rifiuto verificato). Il «download del motore al primo uso» del piano è superato da R-02 (motore nel pacchetto) | Astra (worktree `wt-astra-r03`, brief `.claude/PROMPT-ASTRA-2026-09-13-R03-motore-dalla-macchina.md`) | ▶ lanciata 13/09 07:10 in parallelo a R-05b (file disgiunti); verifica dal vivo mia: download di un GGUF piccolo dall'app installata, caricamento su Vulkan, un giro locale, foto |
| — | **R-05c intestazioni AGPL nei sorgenti** — owner 13/09 07:20: «Agpl sì». Script idempotente `scripts/intestazioni-licenza.mjs` (applica/controlla/rimuovi), forma corta SPDX scelta con le fonti, cancello permanente in `licenza.test.mjs`; solo le cartelle di questa lane (harness-ui, context-engine, worker, scripts); comando pronto per mobile/core/control-plane | Astra (brief `.claude/PROMPT-ASTRA-2026-09-13-R05c-intestazioni-agpl.md`, worktree `wt-astra-r05c` da creare) | ⏸ **aspetta Astra il 19/09** (owner 13/09 «B»: R-05b e R-03 li finisce Claude inline, R-05c resta ad Astra) |
| 12 | Pre-release: tabella di marcia con ricerca dell'ultimo mese, prove da utente nuovo, UX | io + Astra | al trigger (coda chiusa) |
| 13 | A/B del banco sul preambolo (~$5, 210 giri) | io | ⏸ **dopo la release** (owner 12/09 18:40) |
| — | **BC-52 attrezzi su richiesta** (proposta 13/09 dopo BC-48: gli schemi degli attrezzi pesano ~2.350 token su 4.567 di un giro vero; Claude Code elenca i nomi e carica lo schema quando serve) | Astra + kernel (lane mobile avvisata) | ✅ **confermata dall'owner il 13/09 («Attrezzi su richiesta dopo release»)**: si fa DOPO la release, in coda a PO-15/PO-16/A-B; il preambolo resta com'è fino ad allora (1.989 token stimati, nella fascia di Claude Code, Windsurf, Copilot, Codex) |
| — | Chiave DeepSeek diretta respinta dal fornitore (401 in sei chiamate del 13/09, C-ter) | owner | ⏸ da rinnovare in «Fornitori e accessi» quando vuole; DeepSeek via OpenRouter funziona (97 % in cache) |
| — | **BC-49** deposito del rapporto a pezzi | Astra | ✅ **VERIFICATA DAL VIVO sul 4174** (corsa `0925407d`, 14:59-15:28): 5 parti (3.766 · 2.607 · 2.720 · 3.368 · 3.766 byte, tutte sotto 4.096), nessuna caduta del fornitore, `done` in 29 min con giudice `glm-4.7-flash`: 17 affermazioni, 5 sostenute · 4 in parte · 1 contesa · 7 non sostenute · 0 non verificate, 10 prove distinte su 11 indirizzi; 24 giri, 439k token dentro, 317k dalla cache; rapporto 39.597 byte in Libreria. Visto nei due temi |
| — | **BC-50** striscia delle schede dei fornitori oltre sei | Astra | ✅ `74db6ff7`: una riga che scorre con ombre ai capi, schede mai compresse, focus in vista (141 → 45 px a 1024); 14/14 |
| — | **BC-51** giudice nell'elenco delle ricerche | Astra | ✅ `74db6ff7`: stessa proiezione del dettaglio, nessuna seconda lettura; 66/66 (sul 4174 dopo il riavvio con P-H) |
| — | Aperti minori senza data: BC-12 foto sul 4174, 27B da misurare a VRAM libera, `.non-rinominato`, mockup-to-template distruttivo, `<br>` nei .md, HEAD 404, fase3 Review, easing freccia, h2 25ch, «Rivela»→«Mostra», icona Browser, campi elenco note/attività/memoria, nome/timbro sovrapposti nelle righe Libreria | decidi tu | ⏸ |
| — | Fine lavoro: eliminare `.harness-ui-research`, `.harness-ui-library` sul Desktop e `harness-ui/scratch-l9/` | io, al tuo sì | promemoria |

### In corso adesso (aggiornato 12/09, ore 12:15)

| id | cosa | stato |
|---|---|---|
| BC-13 | motore locale rapido | ✅ codice `fa3bac38`: KV cache decisa da llama-fit-params (f16/q8_0 per modello e contesto), speculativa a n-grammi senza secondo modello, motore morto che fallisce subito. Banco Qwen3-4B su RX 9070 XT: primo token −29 %, generazione ×3,6, turno con cache −70 %. Aperti: prima/dopo sul 27B dell'owner (non si carica oggi: VRAM occupata da dwm e Chrome di altre sessioni), confronto misurato con LM Studio/Ollama (LM Studio senza GGUF, Ollama assente), aggiornamento b10517 → b10921 non misurato, `--props` inutile (POST che nessuno usa) |
| BC-12/14 #2 | cartella libera con qualunque permesso | ✅ codice `952c8d55` (server + modale + composer + «Usa come radice»), 471/471 + 10/10, dal vivo su banco con kernel vero; modale vista sul 4174 nei due temi (Desktop + «Scrive nel progetto» ⇒ pulsante vivo, frase onesta). ⏳ la parte server arriva al 4174 col prossimo riavvio (dopo BC-13). Aperto: giro completo con modello vero; tasto destro di Windows dal vivo |
| BC-08 + BC-10 | barra della conversazione a due lati, margine a tutta larghezza | ✅ `34420baa` (+ public `2c4882d8`), visto sul 4174 nei due temi su una sessione a 7 scambi: 14 voci (7 tue, 7 sue), segnavia che segue la lettura, fumetto con le prime parole; a tutta larghezza 46/46 px misurati dall'agente. Aperti trovati per strada: **BC-41** una sessione conclusa si ridisegna con decine di giri «in corso» (cura a monte in `app.js`, 21 turni su 56 su una sessione vera); **BC-42** `GET /tree?percorso=` vuoto → 400 a ogni apertura di sessione; **BC-43** i chiamanti di `$('#conversation')` che si aspettano lo scorrevole (è la colonna) |
| RELEASE | piano decisionale della prima release desktop | ✅ `.claude/PIANO-DECISIONALE-RELEASE-DESKTOP-2026-09-12.md` (`2ca9fc51`) su `.claude/RICERCA-RELEASE-DESKTOP-2026-09-12.md` (fuori dal repo). **Sei domande all'owner** (guscio, firma, v0.1 non firmata, licenza, telemetria, via alle righe R-01…R-06). Trovato: CI tutta su ubuntu, un `.exe` vuole `windows-latest`; firma individuale Azure solo US/CA |

### Fermi dal 12/09 mattina
| id | cosa | stato |
|---|---|---|
| **L9** | il motore della ricerca DENTRO la corsa | ✅ `fbc23c0d`, e verificato DAL VIVO con BC-44 il 12/09: ricerca `done` con giudice `glm-4.7-flash`, bilancio 11/4/6/10, 14 prove distinte su 19 indirizzi. Debiti lasciati da L9: giudice di default povero (solo il modello predefinito ⇒ spesso `judge:null`: serve la scelta del giudice nelle Impostazioni); `talosResearchProgressOf` può dire «10 di 4»; `synthesis.mjs` senza chiamanti; 3 rossi preesistenti in `src/kernel/talosHarness.test.mjs` (un test indietro a una cura del 10/09, due misurano l'ambiente); `kernel:controlla` divergente; stima +15…+35 % token per corsa da confermare |
| **BC-33** | Temi e atmosfere: anteprima VIVA, tutti i cursori di tema/animazione nella modale, confronto testa a testa, 14 temi | ✅ 12/09 `ad4a9121` + `7107417f`, visto sul 4174 nei due temi (aperti: ordine dell'elenco Calm ultimo/primo; la ricerca delle Impostazioni conta le 14 migrate; la riga «Scena del tema» delle Impostazioni è ora doppia con lo studio) |

### Chiusi l'11-12/09, verificati sul 4174 (chiaro e scuro)
| id | cosa | prova |
|---|---|---|
| BC-07 | latenza API: `cerca` senza allowlist (5 % → 71 % file cercabili), preambolo a 4 blocchi (−45/−64 % token), cache per blocco, regola del banco `pass^3` | giro vero: 29.148 → 11.074 token al primo giro |
| BC-09/BC-20 | sfondo animato rientrato col pacchetto dell'owner, porting del mockup (barra, cassetto, sessioni, sezioni elenco+dettaglio, toast, modali, temi) | 7 lotti, 147/147 nel cancello dei componenti |
| BC-11 | giro assurdo per file grandi: alias argomenti, risposta a parole, `mode:append`, html verbatim | giro vero: 2.238 righe in 4 scrivi, 39 giri, zero errori |
| BC-16 | punto 1 cache approvato | A/B: 0 hit su GLM 4.7 → su 5.3 la cache prende (53-88 %) |
| BC-17 | `shell` col comando vuoto (alias `command`) | test + giro BC-11 |
| BC-18 | scheda Agenti vuota con delega viva | foto |
| BC-19 | logo del velo d'avvio sui token del tema | foto chiaro/scuro |
| BC-21 | ricerca approfondita: permesso `Research`, cancello di consegna, giornale su disco, ripresa dopo riavvio, sezione consultabile a 5 viste, azioni (pausa/riprendi/ri-verifica/elimina), figlia col modello della madre, deposito strutturato | **L8 #2: `done`, 38 affermazioni, 28 fonti, cache 53 %** |
| BC-22 | cancello dei componenti rosso: riferimento indietro rispetto agli ordini | 37/37 · 111/111 · mockup di riferimento rigenerato |
| BC-23 | sfondo tagliato / da metà schermo (velo radiale) + chat trasparente | foto Terminal/Calm |
| BC-24 | albero: cartelle che si chiudono, «Apri in Esplora file» sulla radice, Esc che non apre il velo | Windows vero + foto |
| BC-25 | Libreria: file reso e testuale nel dettaglio, pari al mockup al pixel | foto affiancate |
| BC-26 | CRUD completo Note/Attività/Memoria (rotte + UI), note markdown rese | foto + banco |
| BC-27 | Board «undefined is not iterable» | test che passa ogni classe |
| BC-28 | animazioni del mockup: 17 su 19 portate, scarto 0 % | `getAnimations()` |
| BC-29 | markdown: recinti vestiti fuori dalla chat, citazioni GFM | foto |
| BC-30 | testata Review a 1280: menu ⋯ sotto i 760 px di contenitore | RIP-V01 9/9 |
| BC-31 | «research_deposit…» a schermo: nome umano + cancello sui nomi | 35/35 |
| BC-32 | suite di esportazioni (md/html/pdf×3/docx/json/bib/ris/fonti) | provata sul 4174 su L8 #2 |
| BC-34 | esportazioni col Markdown reso | foto HTML chiaro/scuro |
| PO-14 (P-A/B/C) | record unico di fornitore + cancello di parità, cache DeepSeek/Kimi/OpenRouter da una funzione, LM Studio in chat | 2501/2501 · 🔧 non ancora visto nella app |

### Codice fatto, manca l'aggancio o la verifica dal vivo (🔧)
| id | cosa | cosa manca |
|---|---|---|
| BC-13 | modelli locali istantanei (cura dal mobile) | l'aggancio in `app.js` (diff nel rapporto LOCALI-E-ENHANCER) |
| BC-15 | prompt enhancer (rotta + componente) | il pulsante nel composer (`index.template.html` + `app.js`, diff nel rapporto) e un giro vero |
| BC-12 · BC-14 | Diretti per provider; modale Nuova sessione che blocca Avvia | fatti dal lotto SELETTORE-E-MODALE: **da rivedere sul 4174** (mai fotografati da me) |
| BC-10 | spazio chat/navigator uguale a destra | lotto CSS-SPAZI: **da rivedere sul 4174** |

### Aperti (⏸ decisione tua · ❌ non iniziati)
| id | cosa | stato |
|---|---|---|
| BC-08 | barra di navigazione della conversazione: anche le risposte del modello, cliccabili | ❌ |
| PO-13 | proposta GPT-Live-1 | ⏸ |
| C-bis | switch righe/card nelle sezioni | ✅ (lotto C-bis) |
| PO-14 P-D…P-L | Z.AI diretto a due porte · models.dev catalogo · fallback_models · undici «una riga» su wire OpenAI · pool di chiavi + fallback · Kimi/MiniMax/Qwen · wire Anthropic verso terzi · Azure/Bedrock/Vertex · provider come processo esterno | 🔜 approvati, in quest'ordine, dopo L9/BC-33 |
| L10 (nuovo) | pulsante di approvazione del piano della ricerca nella sezione (dopo L9) | 🔜 |
| BC-35 (nuovo) | DOCX con titoli di Word (generatore condiviso con `document_create`) ed elenchi annidati nel Markdown server | 🔜 |
| A/B del banco | preambolo prima/dopo, 210 giri, ~$5,03, ~19,8 h | ⏸ «dopo» |
| decisioni | easing della freccia del gruppo; `max-width:25ch` sull'h2 del dettaglio; «Rivela in Esplora File» → «Mostra nella cartella»; icona della scheda Browser (mappamondo/foglio); campi di elenco per note/attività/memoria; HEAD 404 su /file,/anteprima,/tree/file; ripresa di una `cancelled` senza cancello; `<br>` fra righe nei file .md; fase3 della Review; PDF del mobile con l'indice della fonte sbagliato (non nostra lane); `.non-rinominato` che nessuno raccoglie; `mockup-to-template.mjs` distruttivo per `#talosAvvio` | ⏸ |
| incidente | le cartelle `.harness-ui-research` e `.harness-ui-library` sul Desktop (ripristinate dal Cestino) | 🔜 **da eliminare quando abbiamo finito — te lo ricordo io** |

### Fuori da questa lane (segnalati, non nostri)
mobile: PDF della ricerca con `sources[sourceIndex]` senza −1 (`researchPdf.ts:137,217`); MB-1/2/3 nel piano per la lane mobile (`PROMPT-ASTRA-2026-09-11-ricerca-approfondita-mobile.md`).

---

## ✅ CHIUSE — spostate qui l'11/09/2026, con la prova rimisurata

> Ogni riga è stata riletta **nel codice di oggi**, non copiata da un commit. Le misure fra parentesi
> sono comandi eseguiti l'11/09/2026 su `HEAD = 128b44e0`, albero pulito.

| id | il debito, com'era scritto | chiusa il | prova, misurata l'11/09 |
|---|---|---|---|
| **T03-permessi-D2** | «chiudere il cancello sulla sola *scrittura di un file* NON basta: il modello scrive lo stesso con *comando nel terminale*» — ⛔ era il **numero 1** di §2.1 e di §7 | **06/09**, `fed03a00` | `frontend/src/components/permessi.js` esiste (64 righe nuove nel commit); `app.js:54` importa `porteLateraliAperte` col commento «06/9 T03-D2: chiudere «scrivi» non chiude il terminale, e va detto»; l'avviso è **agibile sul posto** a `app.js:7574`; 44 righe di prova in `frontend/tests/unit/permessi.test.mjs` |
| **O-40** | «tutti i tooltip custom e stilizzati secondo il tema» — «zero lavoro», 208 tooltip di Windows | **dopo il 06/09** | `frontend/src/components/tooltip.js` esiste (8,7 KB); `grep -c 'title="' frontend/index.template.html` → **0** (il documento ne contava **156**) |
| **O-39** | «tutte le scrollbar custom e più compatte» — «Zero `::-webkit-scrollbar` che dipinga» | **dopo il 06/09** | `grep -c "::-webkit-scrollbar"` → **12** in `frontend/src/styles/index.css`, **9** nel foglio servito `public/styles.css` |
| **CB-10** | «nove riferimenti a icone che non esistono» (poi «sono 11») | **07/09** | già dichiarata CADUTA nella §6 di questo stesso documento: 48 simboli nello sprite, 41 nomi usati, **0 usati-e-non-disegnati**. ⚠️ Resta aperto **solo** il debito §6 n. 3: `icon()` (`app.js:1237`) non valida il nome contro lo sprite |
| **BH-05** = T10-D5 = T10-D9 | «Albero dei rami apre **due UI diverse** che si contraddicono» | **07/09** | §6 di questo documento: una porta sola, `sessionTree` → `veloAlbero` coi dati veri. Riletto oggi: `veloAlbero` compare 6 volte in `bridge/legacy-dom.js` e 11 nel template, senza il ramo che svuotava |
| **CB-18-bis** | «Approvato e Negato sono resi identici: il tono promesso non esiste» — «zero regole `approval__esito--`» | **07/09** | `grep -c "approval__esito--"` → **3** in `frontend/src/styles/index.css`, **2** nel foglio servito `public/styles.css` |
| **CB-11** | «la palette viva è in parte in inglese — e ne esiste una seconda, in italiano, che nessuno apre» | **07/09** | `app.js:17623` prende `#veloComandi` e `:17652` lo apre (`apriVeloMockup('veloComandi')`); il blocco è documentato in loco a `:17607` («LA PALETTE ITALIANA ESISTEVA E NESSUNO LA APRIVA») |
| **BH-13** = T10-D6 | «cappelli dei fogli in inglese», sei stringhe | **07/09** | `grep -c "eyebrow:'Conversation graph'"` → **0**; i cappelli letti oggi sono italiani (`eyebrow: 'Albero workspace'`, righe 7290/7304/7341) |
| **BH-14** | «Read only / Workspace write in inglese» | **07/09** | `frontend/src/components/politiche.js` esiste e traduce a schermo; il **valore** verso il kernel resta `Read only` byte per byte (riga 24), come la riga chiedeva |
| **CB-14** | «un solo interruttore in tutta la app non è stilato» | **07/09** | `app.js:15618` — `reasoningInput.className = 'talos-switch'` |
| **BH-06** = CB-19 | «12 errori CSP per ogni apertura del Terminale» | **08/09**, `511a382c` | `src/http-app.mjs:493` — `.replace("style-src 'self'", () => \`style-src 'self' 'nonce-${nonce}'\`)`, con la spiegazione BH-06 scritta in loco a `:448` («LA CSP SPEGNEVA IL TERMINALE») |
| **blocco release 1** | «il kernel non è nel repo» | **07/09** | `harness-ui/src/kernel/talosHarness.mjs` **esiste** nel repo, insieme al suo `talosHarness.test.mjs`; i 7 attrezzi di file/shell sono dichiarati alle righe 877-971 |
| **blocco release — CI** | «CI e release non sanno che il desktop esiste» (§2.5 riga 4) | **07/09** | `grep -c harness-ui .github/workflows/ci.yml` → **18**; `release.yml` → **13** |
| **blocco release 5** | «controlli morti nella Review» | **07/09** | già dichiarata CHIUSA nella §6: 40 marcati «fase 3», **0 visibili** su chat/review/terminale/browser, misurato col browser |
| **D-11** | «il 4174 non sa dire CHI ha creato una sessione» — la proposta era marcata «NON implementata — serve il tuo sì» | **10/09**, `40242136` | `origineRichiesta` viaggia come **argomento a parte** in `src/session-registry.mjs:2190, 2305, 3143-3163, 3189-3225`; raccolta lato rotta in `src/http-app.mjs`; 60 righe di prova in `tests/origine-della-richiesta.test.mjs`. La sezione D-11 in fondo a questo documento **non era stata aggiornata** |

### ⛔ Riverificate APERTE l'11/09 — restano dove sono, e nessuno le sta lavorando

- **CB-16-bis** — `frontend/src/components/modelli-installati.js:70` fa ancora
  `modello.name || modello.id`: il Model Lab «Installati» mostra ancora l'identificatore da 102
  caratteri. Delle **tre** superfici che §2.2 chiedeva ne risulta curata **una**. (Trovata da chi ha
  chiuso BC-04, fuori dal suo mandato.)
- **BH-15** — `frontend/src/components/session-item.js:122` `nomeModello()` fa solo `split('/')`,
  quindi è **inerte** sugli id `local:`; è la funzione che chiama `board.js:35`. Due funzioni per lo
  stesso lavoro: è il debito §6 n. 2, ed è **la causa** della mezza cura.
- **CB-07** — `ultimoBersaglioAttrezzo` **non** è fra i campi azzerati da `nuovaGenerazioneSessione`.
- **CB-16** — `explanation`/`doctorReference` non compaiono in nessun componente del frontend.
- **CB-20-bis** — `app.js:14185` guarda ancora solo `EventSource.CLOSED`.
- **T15-D1/D2** — le due frasi «non è ancora disponibile qui» sono ancora nel template (2 occorrenze).
- **BH-04** — nel template ci sono **16** `data-t`: «English» continua a coprire quasi solo i menu.

⛔ **Un rosso nuovo, trovato l'11/09 accertando PO-02**: `npm run verify:all` **è rosso**.
`CTX-UI-USAGE-CLOSED-RELOAD` (`frontend/tests/browser/context-compactor.spec.mjs:138`) non trova
`[data-runtime-usage]` dopo la ricarica di una sessione conclusa (`components/chat-foot.js:391`), e
quel file è dentro `playwright.componenti.config.mjs`, che `verify:all` esegue. **E morendo alla riga
138 il test non eseguiva le asserzioni successive**: un test lungo che muore a metà non prova ciò che
sta sotto.

⛔ **Quello che resta aperto dei blocchi della release** (§2.5, non spostato): nessuna prova end-to-end
col modello sulla UI nuova; la lane è **1.846** commit avanti a `main` (erano 1.643, quindi il numero
è **cresciuto**); nessuna prova da una macchina che non ha mai visto TALOS; gli screenshot del README
puntano ancora a `../mobile/docs/immagini/`; `public/vendor/floating-ui` e `public/vendor/tanstack`
non sono caricati da nessun file.

## ⛔ 08/09/2026 — LA SUITE DI PARITÀ SUL MOCKUP È ROSSA DA PRIMA, e nessuno la guardava

`npx playwright test -c playwright.lab.config.mjs` (le prove ASTRA sul file del mockup, non sul
4174): **69 fallite su 195** in una corsa, e i fallimenti NON sono di oggi.

Verificato con un A/B, non per impressione: worktree su `558e2e97` (prima di tutte le modifiche
al browser dell'08/09), stessi tre test, stesso comando —
  prima  9 falliti  ·  dopo  9 falliti  ·  stessi nomi
(`ASTRA Browser navigazione, letture e permessi`, `ASTRA Dialogo Ambiente`, `ASTRA Dialogo File`).
Gli insiemi coincidono: la suite era già rossa, e non l'ha rotta il lavoro di oggi.

⛔ Perché conta lo stesso: una suite rossa da tempo smette di essere una guardia. Nessuno può più
distinguere una regressione nuova dal rumore di fondo — che è esattamente il dubbio in cui mi sono
trovato oggi, e che è costato due corse da 25 minuti per essere sciolto.

Il primo fallimento, per dare la forma degli altri: il test clicca `[data-browser-demo="back"]` e
si aspetta in `#browserTesto` la stringa `<button id="astra-untrusted">` (la prova che il testo di
una lettura non venga interpretato come HTML); trova invece il testo di esempio del mockup
(«Registro dei processi»). Cioè la regia demo del mockup non cambia più lettura al clic su
«indietro» — un difetto del MOCKUP, non del prodotto, ma la prova non lo dice e sembra un bug di
sicurezza.

**DECISO dall owner, 08/09/2026: «leva astra».** E il motivo per cui nessuno la riparava e che la
suite l aveva scritta un ALTRO agente — ChatGPT-6 Astra — che ha finito i crediti giorni fa (detto
dall owner). Tolti  e , e lo script
 sparisce da : restano gli unitari (440) e la parita dei componenti (114), che
sono verdi. I file restano nella storia di git; la guardia sul package.json e stata GIRATA e adesso
pretende che  NON esista, cosi la suite non puo rientrare di soppiatto in un comando.



> Chiesto dall'owner: «fai in modo di non avere lasciato nessun bug, debito, implementazione per
> strada». Questo file incrocia **sette fonti** (registro dell'owner, report delle 20 prove, 27
> taccuini, due cacce ai bug, audit delle 193 decisioni, stato release) e **verifica ogni riga nel
> codice di oggi**, con `file:riga`.
>
> ⛔ **Base della verifica**: `HEAD = acea72a8`, ramo `lane/harness-desktop`, albero pulito.
> ⛔ **Il bersaglio si è mosso**: i documenti sorgente descrivono lo stato a `a460c6bd`/`c1984d79`.
> Da allora sono entrati **58 commit**, e molte righe date per aperte sono curate. Ogni riga qui
> sotto è riletta nel codice, non copiata dal documento che l'ha generata.
> ⛔ **Nessuna prova dal vivo è stata fatta in questo giro** (sola lettura, 4174 mai toccata,
> nessuna build lanciata): dove serviva un browser scrivo `CHIUSO-NON-PROVATO` o «non confermato»,
> mai ✅.

---

## 1 · Il totale, per fonte

| Fonte | Righe | APERTO | PARZIALE | CHIUSO-NON-PROVATO | CHIUSO | Ritirate / non giudicabili |
|---|---:|---:|---:|---:|---:|---:|
| `DIFETTI-SEGNALATI-OWNER` (O-01…O-40) | 40 | **2** | **2** | **8** | 28 | 0 |
| `REPORT-VERIFICA-20-TASK` (T05…T20) | 85 | **31** | **5** | **6** | 32 | 11 (6 ritirate + 5 non confermabili senza browser) |
| Taccuini **T01–T04** (mai in nessuna tabella) | 11 | **6** | **1** | **1** | 3 | 0 |
| Taccuini **T-LUOGHI-01…05** (riserve «per nome») | 22 | **18** | **2** | **2** | — | 0 |
| `BUG-HUNT` (BH-01…BH-24) | 24 | **12** | **3** | 0 | 9 | 0 |
| `BUG-HUNT-2` (CB-01…CB-25 + 4 bis/ter) | 29 | **17** | **3** | **2** | 7 | 0 |
| `AUDIT-DECISIONI` (193 righe) | 193 | **28 ❌ ancora veri** | **41 ⚠️** | — | 18 ❌ curati dopo l'audit | 26 🔜 mai verificabili senza un giro |
| `STATO-RELEASE-DESKTOP` (blocchi) | 5 + 7 doc | **4** | **1** | 0 | 0 | 0 |

**Al netto dei duplicati (24 coppie/terne, §3): 121 righe distinte ancora aperte o parziali.**

> ⛔ **11/09/2026 — QUESTI NUMERI NON SI POSSONO PIÙ CITARE.** Sono contati sul codice del 06/09.
> Quattordici righe che vi sono dentro sono state chiuse fra il 06 e il 10/09 e stanno ora nella
> sezione «✅ CHIUSE» in testa. Il totale vero non è stato ricontato: ricontarlo vuol dire rileggere
> 121 righe nel codice di oggi, che è un lavoro a sé. **Fino ad allora, «121» è una stima alta, non
> una misura** — e la stessa cautela che il documento chiede per `AUDIT-DECISIONI` vale adesso per sé.

⛔ Le tre cifre che contano: **77 APERTO** · **17 PARZIALE** · **19 CHIUSO-NON-PROVATO**.
⛔ E **41 righe non erano in nessuna tabella di stato** (§5): il 34% della coda vera era invisibile.

---

## 2 · La coda vera — dalla più grave alla più leggera

### 2.1 · Bloccanti per l'utente (lo vede, o gli mente in faccia)

| id | frase originale | stato REALE | verifica (`file:riga`) | cosa manca esattamente |
|---|---|---|---|---|
| **CB-16** | «un errore vero perde per strada il suo motivo e la sua azione» | **APERTO** | `frontend/src/legacy/app.js:11422` e `:13646` — `appendStatusNote('Avvio non riuscito: ' + error.message)`; il server ha già pronti `title`/`explanation`/`action`/`doctorReference` in `src/public-problem.mjs:5-11` | Leggere la busta invece del solo `message`. Davanti al guasto più comune (chiave assente) la persona non ha né motivo né passo successivo |
| **CB-20-bis** | «il server cade: la barra di stato lo dice, la chat dice il contrario per un minuto» | **APERTO** | `frontend/src/legacy/app.js:11300-11311` — l'avviso scatta solo se `source.readyState === EventSource.CLOSED`; con il server sparito Chrome resta in `CONNECTING` e quel ramo non parte mai. È stata aggiunta `sorveglianza?.segnalaSse(source.readyState)` (`:11307`) ma **non tocca la striscia, il pulsante «Ferma», la riga della sidebar né la colonna** | Quando la sorveglianza dice «il server non risponde», la chat deve smettere di dire «sta scrivendo» |
| **CB-07** | «il suggerimento del composer sopravvive alla sessione che l'ha generato» | **APERTO** | `frontend/src/legacy/app.js:11315-11371` — `nuovaGenerazioneSessione` azzera ~30 campi di `state.realSession`, **`ultimoBersaglioAttrezzo` non c'è** (definito `:258`, scritto `:10985`, letto `:7725`) | Una riga. Oggi la sessione B propone di rivedere un file toccato dalla sessione A, e col Tab quel testo entra nel campo |
| **BH-04** | «English traduce solo la barra laterale» | **PARZIALE, ancora quasi tutto aperto** | `frontend/src/components/lingua.js:117-137` traduce `[data-t]` e `[data-ph]`: nel template ci sono **26** `data-t` e **1** `data-ph` su 963 righe, e **0 dei 46 `<h2>`** ha `data-t`. `src/i18n/en.js` ha 70 chiavi | Portare sotto `data-t` i titoli, le spiegazioni e gli stati vuoti delle 13 schermate, o dichiarare che «English» copre solo i menu |
| **T15-D1 / T15-D2** | «La consultazione del rapporto e delle fonti **non è ancora disponibile qui**» · «La lettura della **definizione completa** non è ancora disponibile qui» | **APERTO** | `frontend/index.template.html:696` e `:723` — le due frasi sono ancora lì, sotto l'elenco stesso | C26 (rapporti riapribili) e C27 (codice dell'attrezzo in sola lettura): sono la ragione d'essere delle due sezioni |

### 2.2 · Gravi (rompono una decisione, o mostrano un dato falso)

| id | frase originale | stato REALE | verifica (`file:riga`) | cosa manca |
|---|---|---|---|---|
| **T17-D7** | «sei pulsanti, cinque inglesi: Agents · Hooks · Skills · Plugins · MCP · Doctor» | **APERTO** | `frontend/index.template.html`: `>Agents<` ×1, `>Hooks<` ×1, `>Skills<` ×1, `>Plugins<` ×1, `>MCP<` ×1 (`>Doctor<` ×2 è accettabile come nome proprio) | Cinque etichette |
| **BH-19** | «`GET /api/v1/huggingface/repo` senza `repo` → 503 invece di 400» | **APERTO** | `harness-ui/src/http-app.mjs:2442-2443` — `if (!repo || !hfHubClient?.describeModel || …) code='RUNTIME_NOT_AVAILABLE'`: «manca il parametro» e «l'hub non è configurato» nello stesso ramo | Separare le due guardie (confronta `:2464-2466`, che lo fa giusto) |
| **BH-07** | «`POST /api/v1/huggingface/download` con `{}` → 500 `INTERNAL_ERROR`» | **APERTO** (non riprovato dal vivo in questo giro) | `harness-ui/src/http-app.mjs:1528-1533` — `localModelTransfer.start(body)` chiamata **senza alcuna validazione del corpo** | Validare `body` e rispondere 400/422 come le altre 9 POST |
| **BH-16** | «ricerca senza risultati: lista vuota e contatore fermo» | **APERTO** | `frontend/src/legacy/app.js:14733-14738` — nasconde le righe con `item.hidden` e basta: nessuno stato vuoto, nessun aggiornamento del contatore «SESSIONI 74» | Stato vuoto + contatore dei risultati |
| **T12-D1 / T12-D3** | «Testata *0 file · Token non disponibili*, scritto **sempre**» | **APERTO** | `frontend/src/components/libreria.js:47` — la stringa `'Token non disponibili'` è concatenata incondizionatamente | C21/B9: il costo in token per file. E a libreria vuota la frase non ha senso |
| **T13-D1 / T13-D2 / T13-D4** | «Memoria divisa per genere, non per strato; nessun ricordo dichiara quando è stato usato» | **APERTO** | `frontend/src/components/memoria.js:6-11` (`GENERI`: preference/fact/procedure/rule) e `:18-20` (filtro per `genere`); nessun campo `ultimoUso` | C22 (strati: di lavoro · episodica · semantica) e C23 (ultimo uso): C23 tocca la **forma del dato**, non solo la vista |
| **T14-D3** | «Le Attività hanno i filtri *Mie / Dell'agente* ma nessuna riga dichiara l'autore» | **APERTO** (metà curata) | `frontend/src/components/attivita.js:16` — `autore:'Autore non registrato'` **scritto nel codice**. I due filtri sono ora nascosti (`index.template.html:573`, `hidden data-richiede="fase3"`) ⇒ non promettono più il falso, ma C25 resta non fatta | Il campo `autore` nel record lato server, e la riga che lo mostra |
| **T10-D2 / T10-D3** | «passando col mouse sul proprio messaggio non compare nessuna azione» · «non esiste nessun modo di modificare un proprio messaggio ⇒ B25 irraggiungibile» | **APERTO** | `frontend/src/components/conversazione.js:175` — il commento dice «le azioni sulla **risposta**»; `:197` monta «Chiedi di nuovo». Sulla bolla dell'utente: nessun bottone | Copia + modifica sul messaggio dell'utente. Senza la modifica, tutto il ramo B25 (fork) è codice mai raggiungibile |
| **CB-13** = T07-D3 = T07-D4 | «tre numerazioni diverse di *giro* nella stessa schermata» | **APERTO** | Tre sorgenti vive: `app.js:6741`/`:2103` (`usage.giri` del kernel → piede e striscia), `:9048` (`state.realSession.runCount` → Review), la spina della cronologia | O una parola diversa per ciascuno, o un solo contatore |
| **CB-16-bis** | «i modelli locali si presentano con l'identificatore interno, lungo 102 caratteri» | **APERTO** — e **la cura esiste già altrove** | `frontend/src/components/modelli-installati.js:70` — `nome: modello.name \|\| modello.id \|\| 'Modello'`, mai `repo`. Intanto `components/chat-foot.js:65 nomeModelloUmano()` fa esattamente il lavoro giusto ed è usata in **un solo posto** (`app.js:7129`) | Usare `nomeModelloUmano` anche nel selettore «Locali», nella lista «Installati» e nel titolo del dettaglio |
| **CB-16-ter** | «la descrizione del modello locale è una frase fissa del mockup» | **APERTO** | `frontend/src/components/modelli-installati.js:145` — `'Modello locale per conversazione e codice.'` scritta nel codice, uguale per il Nemotron 30B e per gpt-oss-20b; e anche nel mockup `index.template.html:463` | O una descrizione vera dal manifest, o «descrizione non disponibile». Oggi **afferma** qualcosa preso da un mockup |
| **CB-15 (1)** | «`Dettaglio: RUNTIME_UNREACHABLE` a schermo» | **APERTO** | `frontend/src/components/runtime-modelli.js:17` — `'Dettaglio: '+d.errore` | La mappa umana esiste già lato server (`src/public-problem.mjs:8`): usarla |
| **BH-15** = CB-15 (3) | «id grezzi dei modelli su quattro superfici» | **PARZIALE** | Curato nella chat (`app.js:7127-7129` → `nomeModelloUmano`). **Non** in Board e sidebar: usano `components/session-item.js:108-110 nomeModello()`, che fa solo `split('/')` — su `local:unsloth-gpt-oss-20b-GGUF` non traduce niente. `board.js:35` la chiama | Una funzione sola. Averne due è il debito che ha prodotto la mezza cura |
| **CB-12** | «il cursore del ragionamento promette sei livelli, il modello ne ha tre — e la posizione mostrata non è quella usata» | **APERTO** | `frontend/src/legacy/app.js:5406` `LIVELLI_RAGIONAMENTO` è una lista **fissa** di sei; `:5447` ripiega su `'high'` (dichiarato «solo estetica»); `effortCompatibilePerModello` (`:4922`) è applicata **solo** al percorso del chip (`:5236`), non al foglio «Nuova sessione» | Filtrare i livelli col catalogo del modello anche nel foglio |
| **T09-D4** (= T09-D2, T11-D10, T16-D3) | «tre deleghe su tre fallite: la shell del figlio prova a entrare in `/mnt/c/Users/…`» · i figli girano con un modello che non hai scelto · si entra dentro la sessione di un sotto-agente all'avvio · righe `delega:…` indistinguibili in Board | **CHIUSO-NON-PROVATO** (fuori lane) | Commit `3a6d6e51` «fix(delega): il figlio lavora dove lavora la madre, e ne eredita il modello». Il kernel non è in questo repo (`mobile/scripts/harness-talos/talosHarness.mjs` **non esiste** qui) ⇒ **non ho potuto rileggere la cura** | Una prova con una delega vera: quattro sessioni figlie, 8 giri e 76,8k token bruciati erano il costo del difetto |
| **O-10** = T09-D1 = T10-D9 | «spawno un sottoagente e non si vede in tab Agenti» | **CHIUSO-NON-PROVATO** | `frontend/src/legacy/app.js:10865-10867` — la scheda ora si rilegge quando la delega **parte** e quando finisce, non solo a giro concluso; `/children` letta a `:4101` e `:6840` | ⛔ Il registro dell'owner lo dichiara **riaperto** e dice testualmente: «si chiude con una **foto della scheda piena**, non con una riga di codice». Quella foto non esiste |

### 2.3 · Medi

| id | frase originale | stato REALE | verifica | cosa manca |
|---|---|---|---|---|
| **BH-18** = CB-20 | «75 richieste API per disegnare la Board» | **PARZIALE** | `frontend/src/legacy/app.js:5467-5480` — ora max **4 worker paralleli**, ma resta **una `/metrics` per sessione** a ogni apertura e a ogni «Aggiorna» | Una rotta che restituisca le metriche in blocco |
| **BH-17** | «38 `<label>` su 114 senza `for`» | **PARZIALE** | Oggi: **13 su 71** senza `for` in `frontend/index.template.html` | 13 associazioni |
| **BH-03 / BH-23** | «il fuoco esce dal velo modale» | **APERTO** | Nessun `trapFocus`/`focusTrap`/`inert` in `app.js`, `bridge/*.js`, `components/dialoghi.js` | `inert` sul guscio quando un velo `overlay-layer--modal` è aperto |
| **CB-22** | «la carta di approvazione ripete il percorso tre volte in quattro righe» | **APERTO** | `frontend/src/legacy/app.js:7959` («Vuole scrivere questo file:») + `:8043` (`bersaglio` + `codice`) | Una volta sola, nel blocco codice |
| **CB-23** | «il titolo della sessione è troncato senza suggerimento» | **APERTO** | `frontend/src/components/session-item.js:155` — `talos-session-item__title` creato senza `title` | Un `title` (in Board ce l'hanno tutti: qui no) |
| **T05-D6** | «il segnaposto promette *Invio indirizza il giro in corso* anche quando nessun giro è in corso» | **APERTO** | `frontend/src/legacy/app.js:6870` — il ramo «non attivo» usa proprio quella frase | Un testo per lo stato a riposo |
| **T16-D6** | «l'intestazione è un `<th>` senza `aria-sort` e cliccarla non riordina» | **PARZIALE** | `components/board.js:108` ora mette `aria-sort`; **nessun listener di click sul `th`** (l'ordine si cambia solo dalla barra) | Il clic sull'intestazione |
| **BH-24** | «`background-motion-active` è scritta su `html`/`body` e nessuna regola la nomina» | **APERTO** | Zero occorrenze in `frontend/src/styles/*.css` | O una regola, o togliere la classe |
| **CB-25** | «un `if (false) { }` nel percorso di reset delle superfici» | **APERTO** | `frontend/src/legacy/app.js:8098` | Cancellare il ramo |
| **CB-24** | «uno schermo intero di mockup, mai raggiungibile» | **APERTO** | `frontend/index.template.html:455-473` `#schermoModelLab` (Qwen3 8B finto, download al 64%, «Primo token 0,8 s»); i `data-vaia` esistenti sono 14 e **`modellab` non c'è** | Toglierlo dal documento |
| **BH-22** = T20-D9 | «`#introDialog` e `apriIntroPrimoAvvio()` sono codice morto» | **APERTO** | `frontend/src/legacy/frammenti.html:237` (`<dialog id="introDialog">`) e `frontend/src/legacy/app.js:13270` (`apriIntroPrimoAvvio`, ~180 righe, nessun chiamante — il primo avvio passa da `apriIntroMockup`, `:13233`) | Cancellare markup e funzione |
| **BH-21** | «11 velo su 20 non li apre nessuno» | **APERTO** (oggi sono 12) | `veloNuova`, `veloModello`, `veloPermessi`, `veloEsporta`, `veloAmbiente`, `veloRiferimenti`, `veloCreaFile`, `veloEliminaFile`, `veloRinominaFile`, `veloEliminaSessione`, `veloComandi`, `veloFile`: l'unico riferimento in tutto il JS è la mappa di misure `components/dialoghi.js:23,33` | O li si usa (sono il disegno approvato) o si tolgono |
| **BH-11** | «il titolo del toast è stampato due volte» | **APERTO** | `frontend/src/components/toast.js:78` — `testo.textContent = messaggioUmano(dati.messaggio) \|\| String(dati.titolo \|\| '')` | Non ripiegare sul titolo quando manca il messaggio |
| **T01-nuova-sessione-D1** | «la modale è ancora a due colonne dense: F1-F2 vuole DUE PASSI» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js`, `creaWorkspaceChooser` (foglio del monolite, colonne workspace/sessione) | La modale in due passi nel `veloNuova` del mockup |
| **T01-nuova-sessione-D6** | «*Planner opzionale* è ancora nella modale (F14 lo sposta nelle impostazioni)» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js:12586-12591` (`plannerSection`) | Spostarlo, o dichiarare che F14 è rimandata |
| **T01-nuova-sessione-D2** | «i progetti non dicono quante sessioni hanno (F5)» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js:12802` e `:12838` — la riga stampa solo nome + `Progetto`/`Usata di recente`/`Scelta rapida` | Il conteggio |
| **T01-nuova-sessione-D7** | «manca la riga col totale degli attrezzi e il costo per giro (F23)» | **APERTO** — ⛔ mai in una tabella | Nessuna riga «attrezzi» nel chooser | Il dato esiste già (`/api/v1/tools`, `tokenSchemaStimati`, usato dalle Impostazioni) |
| **T03-permessi-D1** | «nel foglio compaiono 5 attrezzi: E7 ne vuole 43» | **APERTO** — ⛔ mai in una tabella | `frontend/src/legacy/app.js:5949-5956` (5 righe) e il vincolo vero `harness-ui/src/config.mjs:273` | E7 non è realizzabile senza allargare l'insieme lato server: va deciso, non lasciato |
| **T02-primo-messaggio-D1** | «il costo della sessione non compare nel composer dopo il giro (B26)» | **CHIUSO-NON-PROVATO** — ⛔ mai in una tabella | `frontend/src/components/chat-foot.js:341-345` (`[data-runtime-costo]`, nascosto se `dati.costo` è nullo) | Serve un giro vero per vedere se `costo` arriva |
| **T05-D4** | «pannello *File toccati*, e da vuoto scrive *Nessun file scritto finora*» | **APERTO** | `frontend/index.template.html:223` («File toccati in questo giro») contro `:363` («Nessun file scritto finora») | Una parola sola per la stessa cosa |
| **T05-D5** | «l'albero mostra `.git` fra le cartelle di primo livello» | **non confermato** (nessun filtro `.git` nel frontend: la lista arriva dal server) | — | Da riprovare a schermo |
| **T05-D7** | «i toast restano sopra la colonna di destra e ne coprono l'elenco» | **non confermato** (geometria) | — | Da riprovare a schermo |
| **T06-D2 / D4 / D5 / D6** | Canc non chiude la scheda · due shell su una sessione nuova · piede tagliato · la scheda rinominata perde chi l'ha aperta | **non confermati** (servono schede vive) | `components/terminale.js:28` (`SCHEDE_MASSIME = 8`), `app.js:8283-8284` (le pastiglie del piede, isolamento incluso) | Un giro sul Terminale con tre schede |
| **T06-D3** | «la dichiarazione *Stessa macchina, senza isolamento* sparisce quando le schede diventano tre» | **non confermato** | `frontend/src/legacy/app.js:8283` — la pastiglia esiste; sparirebbe per spazio, non per codice | Misura a 1440 con tre schede |
| **T07-D2** | «*Non salvate* dice `–` mentre nel repo c'è la modifica appena scritta» | **non confermato** | `frontend/src/components/inspector.js:47` legge `c.nonSalvate`: il dato viene dal server | Un giro con una scrittura vera |
| **T07-D5 · T07-D6 · T10-D8 · T10-D10 · T10-D11 · T18-D2 · T20-D2 · T20-D7 · T20-D8** | toast ripetuto · titolo troncato a metà parola · percorsi `/mnt/c/…` e pallino orfano · niente menu col tasto destro sulla sessione · filo chiaro sul bordo · il fumetto copre «Nuova» · 12 combinazioni con testo tagliato in Board · «Apri Model Lab» in inglese · manca la riga di H20 | **non confermati in questo giro** (sono difetti di pixel e di stato vivo) | — | Vanno rifatti con il browser, non con una grep |

### 2.4 · Righe dell'owner ancora non chiuse davvero

| id | stato dichiarato | stato REALE | verifica |
|---|---|---|---|
| **O-28** | tabella ✅, prosa «🔴 APERTO» | **PARZIALE** — metà UI chiusa, metà kernel aperta | UI: `frontend/src/components/browser.js:23,135,249-256` (due modi, `testoLeggibile`, `riassuntoPulizia`) ⇒ **chiusa**. Kernel: `naviga` consegna ancora il **sorgente HTTP grezzo** troncato a 4.000 caratteri (`talosHarness.mjs:4940-4941`, **fuori da questo repo**, non riletto oggi) ⇒ il modello continua a pagare token per `<meta>` e `<style>` |
| **O-31** | tabella ✅ «provato dal vivo», prosa «🔴 APERTO, critico» | **CHIUSO-NON-PROVATO** | Commit `b4660ef1` «feat(browser): il modello vede la pagina dove navighi TU». Nessuna prova dal vivo nel repo; e la via (1) scelta ha un costo dichiarato (il server non ha i cookie della persona) che va **scritto a schermo** |
| **O-24** | ✅ | **PARZIALE** | `components/chat-foot.js:65 nomeModelloUmano` copre l'intestazione dei turni e la pillola (usata solo a `app.js:7129`). Model Lab «Installati» e la scheda «Locali» del selettore mostrano ancora i 102 caratteri (`components/modelli-installati.js:70`) — vedi CB-16-bis |
| **O-26** | 🔧 in corso | **CHIUSO-NON-PROVATO** | `frontend/src/legacy/app.js:1896-1945` — riconoscimento della riga di separazione, `md-table-wrap` che scorre, `<thead>`/`<tbody>`. Serve un giro vero (era CB-02) |
| **O-34** | 🔧, «il caso *sono salito* non ancora visto dal vivo» | **CHIUSO-NON-PROVATO** | `components/chat-foot.js:96-101 fondoInVista()` sottrae la coda; il caso «sono salito» resta non visto |
| **O-35** | 🔧 in corso | **CHIUSO-NON-PROVATO** | Commit `0251ca0a` «*Per questa sessione* ferma davvero le richieste, anche a giro in corso». La clausola `vaChiesto` sta nel kernel, fuori repo: non riletta |
| **O-36** | 🔧, «non ancora rivisto dal vivo su un rifiuto vero» | **CHIUSO-NON-PROVATO** | Commit `c6edeef5`; `components/errori.js:163 spiegaRifiutoAttrezzo` |
| **O-37** | 🔴 aperto | **CHIUSO-NON-PROVATO** | Commit `98a5446f` — l'artefatto si salva anche in Libreria. ⛔ La causa vera non era la chiave API: `artifact-store.mjs` teneva tutto in una `Map` in memoria, quindi **non erano salvati da nessuna parte** |
| **O-18** | 🔜 delegato | **CHIUSO-NON-PROVATO** | `T-LUOGHI-01` dà PASSA con 8 correzioni; restano non provati il download vero, la misura con esito vero (`/fit-estimate` risponde sempre 503 su quella macchina) e i repository `gated` |
| **O-22 / O-23** | ✅ | **CHIUSO** | `components/errori.js:31` (contesto ecceduto) e `:88` (flusso SSE vuoto), montati a `app.js:11218` |
| **O-19 / O-20 / O-21 / O-27 / O-32 / O-33** | ✅ | **CHIUSO** | `app.js:640-720` (`scrollerConversazione`, `scorriInFondoConversazione`, `--stream-follow-space`) + prova V01 dal vivo |
| **O-01…O-17 (tranne O-10), O-25, O-29, O-30, O-38** | ✅ | **CHIUSO** | verificate a campione: `components/cronologia.js`, `bridge/legacy-dom.js:192`, `chat-foot.js` (velocità locale), `styles/foglio-monolite.css:218` (`.sr-only`, era BH-08), `:159-160` (`.overlay-backdrop`, era BH-09), `:276-277` e `:346-347` (era BH-20), `dialog.command-dialog` a `:9` (era BH-01) |

### 2.5 · Blocchi della release (tutti confermati, uno smentito in parte)

| # | affermazione | stato REALE | verifica |
|---|---|---|---|
| 2 | «nessuna prova end-to-end col modello sulla UI nuova» | **APERTO — confermato** | Nessun giro a pagamento su `acea72a8` |
| 3 | «la lane è 1.583 commit avanti a `main`» | **APERTO — e cresciuta** | `git rev-list --count main..HEAD` = **1.643**; `HEAD..main` = **50** |
| doc | screenshot del README | **APERTO — confermato** | `harness-ui/README.md:8` punta a `../mobile/docs/immagini/tablet-9-coding-agent.png` |
| doc | vendor da ripulire | **APERTO — confermato** | `harness-ui/public/vendor/floating-ui` e `.../tanstack` esistono; nessun file del frontend li carica |

---

## 3 · I duplicati — quale id sopravvive

| stessa cosa, id diversi | **id da tenere** | perché |
|---|---|---|
| O-28 · T08-D4 · T08b-D1 · CB-05 · T08-D1 | **O-28** | È la segnalazione dell'owner. CB-05 resta come **prova del lato kernel** (`talosHarness.mjs:4940-4941`); T08-D1 è la metà UI, oggi chiusa |
| O-26 · CB-02 | **O-26** | Stessa cosa, stessa cura (`app.js:1896-1945`) |
| O-10 · T09-D1 · T10-D9 | **O-10** | La riga dell'owner; le altre due sono la stessa scheda vista da due prove |
| T09-D2 · T09-D3 · T09-D4 · T11-D10 · T16-D3 | **T09-D4** | Una sola causa nel kernel (`talosHarness.mjs:5915`): la delega rifiutata sulla stessa cartella. Modello non ereditato, righe `delega:…` in sidebar e Board, avvio dentro un sotto-agente sono **conseguenze** |
| T14-D1 · T14-D2 · T14-D4 | **T14-D4** | Una sola radice: `schermoNote` non esisteva. Curata (`index.template.html:543`, `components/note.js`, `bridge/legacy-dom.js:45`) |
| BH-06 · CB-19 | **BH-06** | Identico, riconosciuto dalla seconda caccia |
| BH-18 · CB-20 | **BH-18** | Identico |
| BH-15 · CB-15 (punto 3) | **BH-15** | Identico; O-24 ne copre solo la metà «chat» |
| BH-12 · T13-D3 | **BH-12** | «1 ricordi». Curato in `components/plurale.js` |
| BH-05 · T10-D5 · T10-D9 | **BH-05** | Le due UI dell'albero |
| BH-13 · T10-D6 | **BH-13** | Cappelli in inglese |
| BH-16 · la riga «ricerca sidebar» di A6 | **BH-16** (comportamento) e **A6** (decisione) | Sono due cose: il messaggio mancante e la ricerca dentro le conversazioni |
| T17-D2 · D5 dell'audit | **D5** | Curata dal blocco «luoghi» (`index.template.html:637`) |
| T17-D1 · D2 dell'audit | **D2** | Curata (`components/impostazioni-campi.js`, `SEZIONI_IMPOSTAZIONI` con i due gruppi) |
| T19-D1/D2 · H1-H5 | **H1-H5** | T-LUOGHI-05 ha verificato severità e conteggio; restano aperti solo i **rimedi eseguibili** |
| T16-D1 · T16-D2 · T16-D4 | **T16-D4** | Stessa colonna Costo. Curata nascondendola onestamente (`board.js:88` e `:107`, `th.hidden`) |
| CB-16-bis · O-24 | **entrambi** | O-24 = chat (chiusa) · CB-16-bis = Model Lab e selettore (aperta). Non fonderli o si perde la metà aperta |
| CB-09 · CB-08 | **entrambi** | CB-08 è il sintomo (una volta), CB-09 è il cancello che non lo vede (sempre) |
| T04-D1 · B16 dell'audit | **B16** | Curata (`app.js:15031`) |
| T11-D4 · T11-D9 · C10 · CB-17 | **C10** | Una sola cura: `components/nomi-attrezzi.js:130 DESCRIZIONI_ATTREZZI` + `:181 descrizioneAttrezzo`. Chiusa |
| T20-D9 · BH-22 | **BH-22** | `#introDialog` morto |
| CB-24 · BH-21 | **entrambi** | Uno schermo morto (CB-24) e dodici velo morti (BH-21): insiemi diversi |
| T17-D6 · D10-D12 | **D10-D12** | Curata (`components/scorciatoie.js` + `app.js:15017`, `Ctrl+/`) |
| T05-D2 · «lo stop diventa una carta rossa» | **T05-D2** | Curata (`app.js:7923-7931`, `fermato-da-te` → badge «Fermato», tono `accent`) |

⛔ **Ritirate, non farle risorgere**: `T06-D1`, `T07-D1`, `T10-D1`, `T15-D3`, `T18-D1`, `T20-D1`
(erano difetti della sonda, non della app) e le due accuse ritirate dell'audit sul modello avviato.

---

## 4 · Le contraddizioni fra documenti

1. ⛔ **O-28**: la **tabella** del registro dell'owner dice ✅ e la **prosa dello stesso file**
   intitola la sezione «🔴 APERTO». Verità: **UI chiusa, kernel aperto**. Il file si contraddice
   con sé stesso a venti righe di distanza.
2. ⛔ **O-31**: tabella ✅ («provato dal vivo, il modello risponde sulla pagina»), prosa «🔴 APERTO,
   critico» con tre vie proposte e nessuna scelta. Verità: c'è un commit (`b4660ef1`), non c'è una
   prova. **CHIUSO-NON-PROVATO.**
3. ⛔ **O-10**: tabella ✅, e più sotto «⛔ O-10 riaperto — una chiusura mia che non reggeva».
   La riga ✅ non è mai stata corretta.
4. ⛔ **AUDIT contro T-LUOGHI**: l'audit dà ❌ a **C5** («costo in token per attrezzo: assente»),
   **C9** («nessun pannello di dettaglio»), **G22/G29** («il pulsante notifiche non apre niente»).
   I taccuini `T-LUOGHI-03` e `T-LUOGHI-04` dimostrano, aprendo la pagina, che **erano già fatte**
   quando l'audit le ha scritte. ⇒ **l'audit del 06/09 è vecchio su almeno quattro righe**: i suoi
   numeri (80/41/46/26) non si possono citare senza rieseguirlo.
5. ⛔ **AUDIT contro T-LUOGHI-02**: D2 ⚠️, D5 ❌, D13 ⚠️, D21 ❌, D22 ❌, D26 ❌ — tutte curate.
   Verificato nel codice: `components/impostazioni-campi.js` (`SEZIONI_IMPOSTAZIONI`, dieci sezioni
   in due gruppi), `index.template.html:637` (Memoria e contesto, Costi e consumo, Sicurezza e
   privacy, Esporta/Importa/Ripristina).
6. ⛔ **BUG-HUNT-2 contro T-LUOGHI-05**: la tabella «difetti della prima caccia ancora vivi» elenca
   **BH-12** («1 sessioni» nella Board). È **curato**: `frontend/src/components/plurale.js`, usato
   da memoria · officina · board · libreria · capability · attività · doctor. La tabella è più
   vecchia della cura di poche ore.
7. ⛔ **STATO-RELEASE punto 5 contro BUG-HUNT-2 sospetto ritirato #5**: il primo dice «*Accetta
   questo file* e *Scarta tutto* senza nessun gestore», il secondo dice «non sono morti: sono
   nascosti». **Vince il secondo** (`components/review.js:135-138` + `app.js:9183`) — ma con la
   riserva del §2.5 punto 5 (sei elementi dipendono da una chiamata a runtime, uno è fuori raggio).
8. ⛔ **CB-09 contro oggi**: «`npm run verify:ui` fallisce sempre». Oggi **passa** («UI manifest
   verificato: 25 asset», uscita 0), perché `harness-ui/dist/` esiste in locale. Ma `dist/` è
   **gitignorata** (`.gitignore:48`) ⇒ su un clone pulito la diagnosi di CB-09 torna vera, e il
   difetto strutturale non è mai stato toccato (`scripts/build-ui.mjs:7-8`: `SOURCE = public`).
9. ⛔ **CB-08 contro oggi**: «`public/` è indietro rispetto ai sorgenti». **Non confermato oggi** —
   la build è vietata in questo giro. Sei marcatori delle cure più recenti (`sommaUsage`,
   `nomeModelloUmano`, `md-table`, `spiegaErrore`, `schermoNote`, `fermato-da-te`) sono **presenti**
   in `harness-ui/public/app.js`. Sembra allineata; **nessun cancello lo garantisce**.

---

## 5 · ⛔⛔⛔ LE COSE DIMENTICATE — nominate in un taccuino o nella prosa, mai in una tabella

> Questa è la sezione per cui questo documento esiste. **41 righe** vivono solo dentro un taccuino
> o dentro un paragrafo di prosa: nessuna tabella di stato le contiene, quindi domani nessuno le
> ritrova. Le ho verificate una per una.

### 5.1 · I taccuini T01–T04: **undici difetti fuori da ogni tabella**

Il `REPORT-VERIFICA-20-TASK` dichiara nel titolo di coprire **T05–T20**. I taccuini `T01`, `T02`,
`T03`, `T04` esistono, contengono difetti numerati, e **non compaiono in nessun altro file**
(verificato: `grep -rl "T01-nuova-sessione-D" .claude/` → solo il taccuino stesso; idem T02, T03,
T04).

| id | frase | stato REALE oggi |
|---|---|---|
| `T01-nuova-sessione-D1` | modale a due colonne invece che a due passi (F1-F2) | **APERTO** |
| `T01-nuova-sessione-D2` | i progetti non dicono quante sessioni hanno (F5) | **APERTO** (`app.js:12838`) |
| `T01-nuova-sessione-D3` | la cartella scelta è a 968 px dal pulsante (F8) | **non confermato** (geometria) |
| `T01-nuova-sessione-D4` | non dice quanti file ha la cartella né avvisa se è una radice (F9-F10) | **CHIUSO** — commit `a4d982c8`, `components/cartella-ritratto.js:23-29` |
| `T01-nuova-sessione-D5` | nessuna informazione git (F19-F21) | **CHIUSO** — stesso commit |
| `T01-nuova-sessione-D6` | «Planner opzionale» ancora nella modale (F14) | **APERTO** (`app.js:12586`) |
| `T01-nuova-sessione-D7` | manca la riga col totale attrezzi e il costo per giro (F23) | **APERTO** |
| `T02-primo-messaggio-D1` | il costo della sessione non compare nel composer (B26) | **CHIUSO-NON-PROVATO** (`chat-foot.js:341`) |
| `T03-permessi-D1` | 5 attrezzi nel foglio invece di 43 (E7) | **APERTO** (`config.mjs:273`) |
| **`T03-permessi-D2`** | **chiudere «scrivi» non impedisce la scrittura via «shell»** | **APERTO — è il difetto di sicurezza più grave di tutta la coda** |
| `T04-coda-e-reindirizzo-D1` | Esc non chiede di fermare il giro (B16) | **CHIUSO** (`app.js:15031`) |

⇒ **Sei aperti, uno grave, mai visti da nessuna tabella di stato in tre giorni.**

### 5.2 · Le riserve «NON VERIFICATO / NON FATTO, per nome» dei cinque taccuini T-LUOGHI

Ogni taccuino chiude con un blocco `⛔ NON VERIFICATO` scritto onestamente — e **nessuna di quelle
righe è mai risalita in una tabella**. Sono **22**:

- **T-LUOGHI-01 (Model Lab / Hugging Face)** — il **download vero** mai premuto · la misura con un
  esito **vero** (`compatible`/`tight`/`blocked`) mai vista: su quella macchina `/fit-estimate`
  risponde sempre 503, quindi il ramo «misura» di `varianteConsigliata` è provato **solo nei test
  unitari** · i repository **`gated`** mai visti a schermo · la stima copre i **soli pesi**, non il
  contesto (Hermes garantisce 64K: è un debito del runtime).
- **T-LUOGHI-02 (Impostazioni)** — **D7** (modello ausiliario per mestiere) **non fatta**, «serve il
  kernel» · **D14** (timeout approvazione), **D15** (redazione dei segreti), **D18** (checkpoint):
  **non fatte di proposito**, perché senza il motore dietro sarebbero promesse vuote · **D16/D17**
  non ispezionate · **D19** (pallino di salute dei provider) non fatta · **D27** (chat archiviate)
  non fatta, «è uno stato del server» · la **ripartizione con una finestra vera** mai vista a
  schermo · le **tabelle dei costi con dati veri** mai viste (store vuoto).
- **T-LUOGHI-03 (Capability)** — **C13** («trasforma questo lavoro in una skill») non fatta ·
  **C21** (costo in token di un file di Libreria) non fatta · **C8** (ordinare per più usati) non
  toccata · **C11** (attrezzi non supportati dal modello) non verificata · le schede **Skill ·
  Connettori · Plugin · Hook** aperte «solo di sfuggita», mai ispezionate ⇒ **C3** resta ⚠️ ·
  l'uso registrato per attrezzo mai provato con una sessione vera.
- **T-LUOGHI-04 (Notifiche)** — ⛔ **una notifica di sistema che parte DAVVERO non è mai stata
  vista**: provati solo i due versi contrari (senza permesso, a finestra visibile), entrambi a zero
  · il **clic sulla notifica** che riporta la finestra davanti: scritto, mai eseguito · il
  **contrassegno sulla riga** con un'approvazione vera in attesa: mai visto a schermo.
- **T-LUOGHI-05 (Doctor e luoghi)** — ⛔ **il plurale col numero UNO non è mai stato visto a
  schermo** (store vuoto ⇒ tutti i conteggi erano 0, cioè proprio il caso che il vecchio codice
  azzeccava per sbaglio): la cura è provata solo nei 12 test unitari · **H6** (quanto occupano app
  e store) mai cercata fra le 11 carte · **H9-H10** (versione pagina vs server) **non fatti**,
  legati alla riga W0-09 (verificato: zero controlli di versione fra pagina e server nel codice) ·
  i **rimedi eseguibili** del Doctor mai premuti («non so se ce ne sono») · **C21**, **C22**,
  **C25** non fatte.

### 5.3 · Le dodici righe «NON VERIFICATO» del report, senza un id

Il `REPORT-VERIFICA-20-TASK` ha una sezione `⛔ NON VERIFICATO, per nome` con **12 voci** — e
nessuna ha un id. Senza id non entrano in nessuna coda e nessuno le ricerca:

C12 (skill a tre stati) · C15-C17 (connettori MCP) · C18-C19 (plugin) · C21 su file veri ·
C26/C27 con dati veri · G22/G29 col caso pieno · la densità applicata alle **pagine** (provata solo
sulla sidebar) · i **veli alle tre viewport** (guardati solo a 1440×900) · il **passo 4 «Fine»**
dell'intro e H19 · il **secondo modo di O-28 su una pagina grande** (misurato solo su
`example.com`, quattro righe: il caso dell'owner da 438.747 caratteri non è mai stato riprodotto) ·
la **dettatura vocale** (B29) · il **tema chiaro guardato con l'occhio**.

⇒ Propongo gli id `NV-01…NV-12` e che entrino in questa coda.

### 5.4 · Difetti nominati nella prosa e mai numerati

1. ⛔ **Audit, sezione F, «fuori tabella»**: «con una cartella fuori dall'elenco dei progetti il
   server esige *Accesso pieno*; se scegli *Scrittura nel workspace* — cioè il default deciso in
   F16 — il primo messaggio **resta nel composer** e appare la nota *Serve Full access*».
   L'intro ti lascia scegliere una combinazione che non può funzionare e lo scopri al primo invio.
   **Nessun id, mai risalito.** Codice: `app.js`, ramo `cartellaLibera`.
2. ⛔ **Registro dell'owner, verifica finale**: «il triangolino del dettaglio si leggeva **b8** — un
   escape CSS senza terminatore veniva letto come carattere più il testo *b8*». Dichiarato corretto
   nello stesso giro, **senza id**: non c'è modo di verificarlo domani.
3. ⛔ **BUG-HUNT-2, prosa di CB-02**: «dalla stessa causa, **nessun link è cliccabile** —
   `.talos-message a[href]` = 0 su una risposta che conteneva un URL». È un difetto a sé, non un
   corollario: le tabelle sono state fatte (`app.js:1896-1945`), **i link no** (verificato: nessun
   ramo che costruisca `<a>` in `renderizzaMarkdownSemplice`, `app.js:1823`).
4. ⛔ **BUG-HUNT-2, «cosa non ho guardato»**: il **ritorno del server dopo la caduta** (CB-20-bis) —
   misurati 60 secondi di server morto, **mai riacceso**, e il pulsante «Riprova» della barra **mai
   premuto** · **due schede aperte sulla stessa sessione** (concorrenza fra client): mai provato ·
   il pulsante **«Verifica compatibilità»** della scheda Installati: visto, mai premuto.
5. ⛔ **BUG-HUNT-1, «cosa non ho coperto»**: **contrasto WCAG scartato** nella prima caccia e
   ricostruito nella seconda (CB-06) · **9 azioni distruttive saltate per costruzione** (elimina,
   svuota, disinstalla, riavvia, installa, scarica, esporta, accedi, termina) — **nessuno sa se
   funzionano**, in nessuna delle due cacce.
6. ⛔ **BUG-HUNT-2, onestà finale**: «gli screenshot li ho guardati **tutti con le sonde**, non
   tutti con gli occhi: delle 96 combinazioni ne restano guardate a occhio **una ventina**».
   ⇒ Su ~76 schermate un difetto di spaziatura o allineamento **sarebbe passato senza essere
   visto**. Non è un difetto: è un **buco di copertura** che nessuna tabella dichiara.
7. ⛔ **CB-06 (contrasto in tema chiaro)** — è in tabella nella seconda caccia ma **nessun altro
   documento lo riprende, e non è nel registro dell'owner**: `--talos-muted:#686a70` su `#ece9e2`
   dà **4,30-4,46 : 1** contro i 4,5 richiesti, su **144 elementi campionati**; il piede della chat
   sta a **2,84 : 1**. Il token è ancora quello (`frontend/src/styles/tokens.css` e
   `styles/index.css`, riga del tema chiaro). **APERTO**, e riguarda la metà della app che nessuno
   guarda.

---

## 6 · I debiti nel codice, non registrati da nessuna parte

> Cercati con `grep -rn "TODO\|FIXME\|XXX\|HACK\|@debito\|non implementato"` su
> `harness-ui/frontend/src` e `harness-ui/src`. Il risultato è **quasi pulito** (un solo TODO, e
> sta in `frontend/src/assets/xterm/xterm.css:80`, cioè in codice di terze parti). I debiti veri
> non sono commentati: sono strutturali.

| # | debito | `file:riga` | perché conta |
|---|---|---|---|
| 1 | `if (false) { }` dentro `resettaSuperficiRealiDedicate()` | `frontend/src/legacy/app.js:8098` | Residuo di una rimozione. Già CB-25, ma resta codice vivo |
| 2 | **Due funzioni per lo stesso lavoro**: `nomeModello()` (solo `split('/')`) e `nomeModelloUmano()` (traduce anche `local:`) | `frontend/src/components/session-item.js:108-110` contro `frontend/src/components/chat-foot.js:65-82` | È **la causa** della mezza cura di O-24/BH-15: Board e sidebar chiamano quella povera |
| 3 | **Due funzioni per la stessa icona**: `icon()` non valida, `iconaSvgAlbero()` ha la tabella ALIAS | `app.js:1128` contro `app.js:9830-9838` | È **la causa** di CB-10: una corregge, l'altra tace |
| 4 | `apriIntroPrimoAvvio()` (~180 righe) **senza chiamanti** + il suo `<dialog id="introDialog">` | `app.js:13270` · `frontend/src/legacy/frammenti.html:237` | Codice morto in uno strato non nascosto |
| 5 | `#schermoModelLab`: uno schermo intero di mockup finto, **irraggiungibile** | `frontend/index.template.html:455-473` | Nessun `data-vaia="modellab"` fra i 14 esistenti |
| 6 | **12 velo del mockup** che nessun codice apre | `index.template.html` (i velo) · unico riferimento `components/dialoghi.js:23,33` | Il disegno approvato è nel documento e non si usa |
| 7 | **40 `data-richiede="fase3"`**, di cui **6 senza `hidden` nel markup** | `index.template.html`; uno di questi (`talos-approval__foot-note`, «Scartare ripristina il file dal checkpoint del giro 4») sta in `#schermoChat`, che `nascondiAzioniFase3` (`components/review.js:135`, chiamata da `app.js:9183` su `#schermoReview`) **non tocca** | Un pulsante inerte che una funzione dimentica è peggio di uno dichiarato |
| 8 | `scripts/build-ui.mjs` **copia `public/` su `dist/`**: `SOURCE = public`, `OUTPUT = dist` | `harness-ui/scripts/build-ui.mjs:7-8` | Il «cancello» verifica che una copia sia uguale alla sua sorgente, **mai** che `public/` sia la build dei sorgenti |
| 9 | `verify:all` **non invoca** `verify:ui` | `harness-ui/package.json:6-8` | Il cancello esiste e non gira mai |
| 10 | `harness-ui/dist/` è **gitignorata** (`.gitignore:48`) e `verify-ui-manifest.mjs` la pretende | `harness-ui/scripts/verify-ui-manifest.mjs:6` | Passa sulla macchina di chi ha già buildato, fallisce su un clone pulito |
| 11 | `harness-ui/src/runtime-build-manifest.mjs` importato **solo dal suo test** | dichiarato in CB-09, non riverificato oggi | Un validatore che nessun codice di prodotto chiama |
| 12 | `public/vendor/floating-ui` e `public/vendor/tanstack` **non caricati da nessun file** | `harness-ui/public/vendor/` | Resti del frontend parallelo; `THIRD_PARTY_NOTICES.md` non li cita |
| 13 | Nessun **focus trap** e nessun `inert` in tutta la app | cercati `trapFocus`, `focusTrap`, `inert` in `app.js`, `bridge/*.js`, `components/dialoghi.js`: **zero** | BH-03/BH-23: il fuoco esce da ogni velo modale |
| 14 | Il permesso per attrezzo esiste solo per **5 attrezzi su 43** | `harness-ui/src/config.mjs:273` | È il tetto vero di E7 e la causa strutturale di T03-permessi-D2 |

---

## 7 · L'ordine in cui la farei

> ⛔ **11/09/2026 — QUESTO ORDINE ERA VECCHIO.** I punti 1 e 4 e cinque dei sette del punto 3 sono
> **già fatti**: T03-permessi-D2 (06/09), CB-18-bis, BH-05, BH-13, BH-14, CB-14, CB-11 (07/09),
> CB-10 (caduta), O-39 e O-40. Sono nella sezione «✅ CHIUSE» in testa al documento, con la prova.
> Testo originale conservato qui sotto, barrato nei punti superati.

1. ~~**T03-permessi-D2**~~ — ✅ **già fatta il 06/09** (`fed03a00`), vedi «✅ CHIUSE».
2. **CB-16 · CB-20-bis · CB-07** — tre cure piccole (una busta d'errore, un ramo di `readyState`,
   un campo da azzerare) su cose che **mentono** all'utente. ⛔ Riverificate aperte l'11/09:
   `explanation`/`doctorReference` non compaiono in nessun componente; `app.js:14185` guarda ancora
   solo `EventSource.CLOSED`; `ultimoBersaglioAttrezzo` non è fra i campi azzerati da
   `nuovaGenerazioneSessione`. (CB-18-bis, che era in questo punto, è chiusa.)
3. **T17-D7** — l'unico superstite dei sette «che si vedono a colpo d'occhio»: cinque etichette
   inglesi nella barra delle capacità. Gli altri sei sono chiusi.
4. ~~**O-39 poi O-40**~~ — ✅ **entrambe fatte**, vedi «✅ CHIUSE».
5. **Le 19 righe CHIUSO-NON-PROVATO** — una sessione vera col modello flash le chiude quasi tutte
   insieme: O-10, O-26, O-31, O-34, O-35, O-36, O-37, O-18, T09-D4, T02-D1, T20-D4, e almeno sei
   delle dodici `NV-*`. È anche il blocco 2 della release.
6. **I 14 debiti del §6** — sono la ragione per cui le stesse famiglie di difetti tornano.
7. **La release** (§2.5): kernel, merge di 1.643 commit, CI, README, changelog, versione.

⛔ **E prima di tutto**: rieseguire `AUDIT-DECISIONI` sulla app di oggi. Quattro delle sue ❌
(C5, C9, G22, G29) erano **già false quando è stato scritto**, e altre diciotto sono state curate
dopo: i suoi numeri non si possono citare finché non gira di nuovo.

---

## ⛔ 07/09 — UNA SOLA CAUSA dietro una fetta dei «riferimenti morti»: dodici finestre irraggiungibili

Trovato scendendo i sospetti del cancello, partendo da `data-ridimensiona`.

**Il template ha 22 veli (finestre modali). Dodici non si possono aprire**: nessun
`data-apre-velo="..."` nel markup, e nessun sorgente ne nomina l'id.

| irraggiungibile | e nel prodotto la stessa cosa si fa così |
|---|---|
| `veloNuova` | la modale vera è `#newSessionBtn` → `.workspace-chooser` |
| `veloPermessi` | il foglio vero è `openSheet('permissions')` |
| `veloModello` | il selettore vero è `.model-picker-trigger` |
| `veloEsporta` · `veloRinomina` · `veloEliminaSessione` | azioni di sessione, con `openSheet` |
| `veloFile` · `veloCreaFile` · `veloEliminaFile` · `veloRinominaFile` | menu dei file, altro meccanismo |
| `veloAmbiente` · `veloRiferimenti` | idem |

⇒ **Non è un difetto funzionale**: quelle funzioni esistono tutte, fatte col vecchio meccanismo del
monolite. È **debito del cutover**: il mockup portava la sua versione di ogni finestra, il prodotto
ne ha collegate 10 su 22, e le altre 12 sono rimaste nel markup.

**Quanto pesa: ~43 KB su 310, il 14% del template**, servito a ogni apertura della app.

⭐ E spiega **una sola causa** dietro tanti reperti del cancello: dei 15 attributi «scritti e mai
letti» (`data-modello-dialogo`, `data-fonte-modello`, `data-file-action`, `data-coda-togli`…), la
gran parte vive dentro questi dodici veli. Non sono 15 difetti sparsi: è **un difetto solo**, e ha
una cura sola.

⛔ **La cura è una decisione dell'owner**, non mia, perché sono due strade opposte:
1. **togliere** i dodici veli dal mockup — il template cala del 14%, e il mockup smette di
   promettere finestre che il prodotto non usa;
2. **collegarli** al posto dei fogli vecchi — è il cutover finito davvero, ma è molto più lavoro e
   tocca funzioni che oggi girano.

⛔ Nota su una mia cura di poche ore fa: «Gestisci nel Model Lab» l'ho collegato **dentro
`veloModello`**, cioè dentro una finestra che nessuno può aprire. Il collegamento funziona (provato
cliccando l'elemento) ma non è raggiungibile da una persona finché quella finestra resta chiusa.
Va rifatto sul selettore vero, o cade dentro la decisione qui sopra.

---

## 6 · Aggiunte e smarcature del 07/09 (owner: «non andare a memoria, segnala e smarca man mano»)

| id | cosa | stato |
|---|---|---|
| **O-59** | la risposta a schermo non è quella del giro (screenshot 14:54: otto ricerche su GLM-5.3 e sotto la risposta su `example.org`) | **APERTO — nuovo**, dettagli nel registro difetti |
| **O-60** | il suggerimento del composer riporta la query grezza con le virgolette annidate | **APERTO — nuovo** |
| **CB-10** | «11 icone che non esistono» | **CADUTA il 07/9**: misurato — 48 simboli nello sprite, 41 nomi usati, **0 usati-e-non-disegnati**. Resta solo la validazione di `icon()`, che non protegge da un nome futuro |
| **CB-11** | la palette italiana non si apriva | **IN CORSO 07/9**: `openCommandPalette` apre `#veloComandi`, ricerca/frecce/Invio collegati a entrambi i campi. Da riverificare dal vivo |
| **CB-18-bis** | l'esito di un'approvazione senza colore | **CHIUSA**: 3 regole `approval__esito--` nel foglio servito |
| **BH-13** | sei cappelli dei fogli in inglese | **CHIUSA** il 07/9 |
| **BH-14** | politiche in inglese a schermo | **CHIUSA** il 07/9 (`components/politiche.js`, valore del kernel invariato) |
| **CB-14** | l'unico interruttore non stilato | **CHIUSA** il 07/9 (vestiti tutti i controlli nativi) |
| **T03-D2** | chiudere «scrivi» non chiude il terminale | **CHIUSA** il 07/9: l'avviso vive nel velo Permessi ed è AGIBILE sul posto |
| **BH-05** | l'albero apriva due UI che si contraddicevano | **CHIUSA** il 07/9: una porta sola, `sessionTree` → `veloAlbero` coi dati veri |
| **CB-11** | la palette italiana non si apriva | **CHIUSA** il 07/9, provata dal vivo: si apre `#veloComandi`, filtra (anche per alias: «fork» trova «Crea un ramo»), frecce e Invio funzionano, «nessun risultato» compare, e il comando cambia vista |
| blocco release **1** | il kernel non era nel repo | **CHIUSA** il 07/9 (owner: «confermo, può stare sul repo pubblico»): `harness-ui/src/kernel/`, default nel config, 538 test suoi nei cancelli, `npm run kernel:controlla` per la divergenza. Provato: giro vero **senza** `TALOS_OWNER_RUNTIME_MODULE` |
| blocco release **3** | CI e artefatto non conoscevano il desktop | **CHIUSA** il 07/9: job `desktop` in `ci.yml` (4 cancelli + kernel), job `desktop` in `release.yml` sui tag `desktop-v*`, pacchetto **5,2 MB** provato dal vivo — `npm ci` in cartella pulita, avvio senza variabili, un giro vero concluso |
| blocco release **4** | nessuna prova da macchina pulita | **PARZIALE**: il pacchetto scompattato si installa, si avvia e fa un giro vero su QUESTA macchina (Node e chiave già presenti). Resta da provare su una macchina che non ha mai visto TALOS |
| blocco release **5** | controlli morti della Review | **CHIUSA**: 40 marcati «fase 3», **0 visibili** su chat/review/terminale/browser (misurato col browser) |
| **BROWSER-OGNI-PAGINA** | owner 07/09: «visualizzare ogni fottuta pagina — meglio degli altri». **DECISO: A+B, A predefinito, B quando A fallisce.** **A** = proxy universale su **origine separata** (riscrivere i link sulla nostra origine violerebbe la same-origin: gli script del sito vedrebbero `localStorage` e le nostre API). **B** = **Chromium di sistema** (canale `chrome`/`msedge` di Playwright: zero MB nel pacchetto, su Windows Edge c'è sempre; ripiego `install --only-shell`) pilotato **dal server**, con `Page.startScreencast` (~70 fps contro ~5 dello screenshot polling) e overlay di annotazione iniettato via CDP. Scartati con motivo: Servo (0.1.0 su crates.io il 13/04/2026, «rough edges» sul web aperto), Ultralight (motore ridotto, licenza commerciale), CEF (~100+ MB contro i nostri 5,2), WebView2/wry (ci obbligherebbe a diventare app nativa). ⭐ I tre sorpassi sui concorrenti diretti, in `.claude/DOSSIER-BROWSER-COMPETITOR-2026-09-07.md`: il browser sta **dove sta l'agente** (Hermes ammette in `preview-reach.ts` che col gateway cloud non si può fare); **nessuna estensione né schede personali** (Claude in Chrome chiede `debugger` e cattura le schede del gruppo); **pixel + DOM + testo insieme**. E il browser sta in un **processo separato**: Codex su Windows si chiude aprendo l'in-app browser su localhost (issue #32040). | **DA FARE — approvata, non ancora iniziata** |
| **O-42** | il Browser mostrava il riquadro rotto su una pagina che vieta la cornice | **CURATA il 07/9**: la cornice si chiede PRIMA (`/api/v1/browser/incorniciabile`) anche per le letture dell'agente; chi vieta va al testo con la riga che dice perché. Misurato: il ripiego a 4 s non poteva scattare (Chrome manda `load` sulla sua pagina d'errore). Riverifica dal vivo su github: in corso |
| **O-61** | due riquadri sovrapposti sul fumetto della barra dei giri | **CHIUSA il 07/9**: era il tooltip nativo (`title`) sopra il nostro; riverificato dal vivo (`conTitle:0, fumetti:1`) + cancello `tests/unit/cronologia.test.mjs` |
| **O-62** | il titolo della chat usciva sopra la testata in Review, e non si troncava abbastanza presto | **CHIUSA il 07/9**: il percorso era il quarto figlio di una griglia a tre colonne; ora dentro il titolo, tetto 420px. Riverificato a 1920 su quattro viste + cancello `tests/unit/topbar-forma.test.mjs` |
| **O-44 / O-46** | loghi mockup, e la chat vuota senza logo né nome | **CHIUSE il 07/9**: marchio VERO (`logo-short.svg`) nello sprite + nome in Orbitron sopra il benvenuto, misura che cresce col viewport. Verificate dal vivo con foto |
| **O-60** | il suggerimento col la query grezza | **CHIUSA il 07/9**: `frase-cercata.js`, 5 prove |
| **O-43** | l'accento nel testo del composer | **VERIFICATA il 07/9**: era già così su entrambi i composer e su entrambi i temi. Nessuna modifica |
| **O-41** | allegati dentro la bolla | **CHIUSA nel codice il 07/9** (mancava il PRIMO messaggio); riverifica dal vivo insieme a O-45 |
| **O-45** | i tre pallini non animati | **QUATTRO CAUSE ESCLUSE il 07/9** (Windows, CSS, GPU, animazione ricreata). 🔜 resta da guardare DURANTE un giro vero |
| **O-47 / O-48 / O-49 / O-50** | stop, stato del giro, errore ripetuto, riprendere | **CHIUSE**: stop misurato 4 ms; `runRealeAttivo` guarda il server; `APPROVAL_NOT_PENDING` invece di «Query non valida»; resume provato dal vivo |
| **fogli legacy** | «capabilities» e «control» erano due indici di cose che hanno già la loro schermata | **CHIUSA il 07/9**: `apriCapabilityDaFoglio()` e `case 'control' → eseguiDoctor()`; tolto anche l'ultimo chiamante (il pulsante «Apri Doctor» dell'errore cartella). 🔁 resta: i due TEMPLATE morti in `app.js` non si cancellano finché il velo `references` non ha un'altra via d'apertura (era lì dentro) |

## ✅ D-11 — CHIUSO il 10/09/2026 (`40242136`) — il testo dell'indagine resta qui per memoria

> ⛔ **Verificato l'11/09**: la proposta in fondo a questa sezione dice ancora «NON implementata —
> serve il tuo sì», e **il sì è già stato dato e il codice è dentro**. `origineRichiesta` viaggia
> come argomento a parte in `src/session-registry.mjs:2190, 2305, 3143-3163, 3189-3225`, la rotta la
> raccoglie in `src/http-app.mjs`, e `tests/origine-della-richiesta.test.mjs` (60 righe) la prova.
> La regola che l'indagine ha prodotto — «prima di riavviare il 4174, se c'è qualcosa da spiegare
> nei suoi log, si copiano» — resta valida e vincolante.

### Il testo originale dell'indagine (10/09/2026)

**Il fatto.** Fra le 16:29 e le 16:33 sono comparse sul 4174 quattro sessioni che non ho avviato io:
`3c8a5214`, `241e526f`, `6c3091c4`, `39f582b7` — consegna «Add and export a function `sottrai(a, b)`
in src/matematica.mjs», `comandoProva: npm test`, modello `~deepseek/deepseek-v4-flash-latest`
(**non** `glm-5.3-flash`, contro la regola dell'owner del 09/09), `taskId: libero:default`, permesso
`Read only`, concluse con successo, 4-6 giri, ~245.000 token in ingresso in totale.

**Chi è stato: NON LO SO, e non ho più il modo di saperlo.** La sessione peer `avm-1b` esclude sé
stessa e i suoi due sotto-agenti (motivi circostanziati, non una prova). Il mio agente in background
sui task di coding non ha ancora risposto. E la prova diretta non c'è più: **l'ho distrutta io**,
riavviando il 4174 prima di guardarne i log, che il riavvio riazzera.

**Il debito, che è più grande dell'episodio.** Il record di una sessione (`.sessions-store/*.jsonl`,
intestazione) dichiara cartella, task, modello, permessi, padre — **ma non l'origine della
richiesta**. Non c'è nessun campo che dica quale client, processo o sessione l'ha creata. Con dieci
figlie, due sessioni Claude e un banco che può parlare via HTTP, «chi ha avviato questa» è una
domanda senza risposta, e resterà tale ogni volta che si ripresenta.

⇒ È la stessa forma di [[il-guardiano-accusava-la-sessione-dellowner]] («un allarme che dice QUANTI
e non CHI non è azionabile») e di [[una-sonda-di-unaltra-sessione-scrive-sul-server-vivo]], la cui
cura fu proprio far viaggiare il dato mancante nell'evento.

**Proposta, NON implementata — serve il tuo sì.** L'intestazione registra l'origine: `client`
(già ammesso oggi, ma opzionale e generico), più indirizzo remoto e `User-Agent` della richiesta che
ha creato la sessione. Costo: piccolo. Effetto: la domanda «chi è stato» ha una risposta sul disco,
anche dopo un riavvio.

⛔ E una regola per me, che vale da subito: **prima di riavviare il 4174, se c'è qualcosa da
spiegare nei suoi log, si copiano.** Il riavvio è autonomo, ma non è gratis.

### D-11, aggiornamento della sera — tre piste chiuse, la domanda resta aperta

Ho interrogato tutti gli attori possibili e guardato le tracce. **Nessuno risponde di sì**, e questo
rende il debito più forte, non più debole:

- **`avm-1b`** (sessione peer, viva da 11 h): esclude sé stessa e i suoi due sotto-agenti. Lavora
  solo su `AVM/mobile` (misure sul Pad via adb, JNI, typecheck, vitest), nessun modello a chiave.
- **Il mio agente sui task di coding**: esclude sé stesso con dettagli che reggono — i suoi task
  hanno id `desktop-<sha7>`, comando `node --test --test-reporter=tap` e casi in italiano, nulla in
  comune con «Add and export a function `sottrai(a, b)`» + `npm test`. In più aveva messo una
  guardia apposta, `ambienteSenzaChiavi()`, che toglie al processo figlio ogni variabile
  `KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|COOKIE`: un test che provasse a chiamare un fornitore
  fallirebbe per mancanza di chiave invece di essere pagato.
- **La pipeline QA visiva**, che era la pista migliore: `scripts/qa-visual-pipeline.mjs:1842` digita
  nel composer **esattamente quella consegna** e fa il submit — è lo scenario
  `nuova-sessione-compito-libero`. Ma la guardia del 04/09 regge (`eseguitoDirettamente` confronta
  `process.argv[1]` con `import.meta.url`: importarla non fa niente), e soprattutto **non ha girato
  oggi**: l'ultima cartella in `.qa-runs/` è del **4 settembre**.

⇒ La consegna delle quattro sessioni è, parola per parola, quella della pipeline QA — quindi
qualcuno o qualcosa ha eseguito quello scenario, o l'ha copiato. Ma **con che cosa, e da dove, non è
ricostruibile**: il record della sessione non porta l'origine, e i log del server li ho azzerati io
riavviando.

⛔ Questo è il punto del debito, ed è dimostrato invece che supposto: **con tre attori interrogati,
una pista testuale esatta e nessuna risposta possibile, la domanda «chi ha avviato questa sessione»
oggi non ha modo di ricevere risposta.** Non serve un'indagine migliore: serve il campo mancante.

### D-11, chiusura dell'indagine — cinque piste, tutte esaurite

Alle tre già chiuse se ne aggiungono due, trovate cercando la consegna esatta su tutto il disco:

- **`mobile/tests/unit/harness/harnessUiRealSession.test.ts`** — il nome («real session») e le
  chiamate a `http://localhost:4174/api/v1/sessions` lo rendevano il sospetto migliore, tanto più
  che `avm-1b` lancia `npx vitest run` sul mobile. **Ma usa `fetchMock`**: gli URL del 4174 sono
  valori attesi in asserzioni contro un finto, nessuna richiesta vera parte.
- **`harness-ui/frontend/artifacts/confronto/*/esiti.json`** — contengono quella consegna perché la
  campagna di confronto la usò; sono file di dati, e sono **del 5 settembre**, non toccati oggi.

⇒ La consegna vive in sei posti (due documenti `.claude/`, quattro artefatti, la pipeline QA, un
test con mock) e **nessuno di essi ha girato oggi**. L'indagine è esaurita: non c'è altro da
guardare, perché ciò che servirebbe non è stato registrato da nessuno.

**Questo chiude la domanda «chi è stato» come NON RISPONDIBILE, e conferma il debito.** Non è che
l'indagine sia stata fatta male: è che il dato non esiste. Cinque piste, una corrispondenza testuale
esatta, due attori interrogati, e zero modi di sapere quale processo abbia fatto quel `POST`.

---

## BC-07 — LA LATENZA DEI MODELLI API: si indaga e si ottimizza (owner 11/09/2026, non urgente)

Owner: «dobbiamo indagare perché ci sta così tanto a rispondere usando i modelli api. Non è urgente
ma dobbiamo ottimizzare con tecniche aggiornate dell'ultimo 6 mesi, avanzate: ottimizzazione e
velocità di domanda e risposta e tempo totale».

**Quello che si vede già, senza aver indagato** (dallo schermo dell'owner e dalle sessioni di oggi,
non da un'ipotesi): «Ragionamento in corso… **27s**» su una conversazione con **1.113,7k token** e
cache all'81%. Cioè il primo sospetto è banale e va misurato prima di ogni altra cosa: **il prezzo
per giro cresce con la conversazione**, e quella sessione ne aveva 1,1 milioni di token. Nella
sessione `7b21ff93` si legge **primo token 23,8 s** con 950,7k token e cache al 71%.

⇒ Tre domande, in quest'ordine, e ognuna vuole un numero:
1. **quanto pesa il prefisso**: tempo al primo token in funzione dei token in ingresso, a parità di
   modello — se è lineare nel prefisso, il collo è la conversazione, non il fornitore;
2. **quanto prende la cache davvero**: `prompt_tokens_details.cached_tokens` per giro (già letto dal
   kernel), e cosa la rompe — sappiamo già che un prefisso che cambia la azzera e costa **3,5×**
   ([[comprimere-l-ingresso-rompe-la-cache]]), e che la cache vale **6×**;
3. **quanto del tempo è nostro**: fra la richiesta e il primo delta a schermo, quanto è rete,
   quanto è il fornitore, quanto è il nostro streaming.

⛔ Non toccare niente prima di avere quei tre numeri: qui una cura presa dall'intuito ha già fatto
danni misurati (spegnere la repo map di aider per «risparmiare» dimezzò i risolti).
Ricerca obbligatoria sugli ultimi sei mesi prima di scrivere codice (prompt caching, speculative
decoding, prefix reuse, streaming): fonte + data nel commit.

## BC-08 — LA BARRA DI NAVIGAZIONE DELLA CONVERSAZIONE mostra solo i messaggi dell'owner

Owner 11/09/2026: «la barretta di conversation navigation mostra sempre il messaggio che ho inviato
io ad ogni segment anziché quello inviato da lui (ed entrambi). Deve includere anche le sue risposte
e direzionare a quella se cliccato».

Oggi ogni segmento della barra è **un messaggio dell'utente** (è la forma misurata sull'app ChatGPT
desktop, dove la voce è «Vai al messaggio dell'utente N»). L'owner vuole **entrambi**: le sue
risposte devono avere il loro segmento, e il clic deve portare **a quella risposta**, non al turno
che l'ha originata.

Da fare: le voci diventano i turni (utente **e** assistente), il fumetto al passaggio porta le prime
parole di quel messaggio, e la lente resta com'è. ⛔ Attenzione al numero di voci: con entrambi i
lati raddoppiano, e la barra ha un tetto di altezza (`min(70vh, 40rem)`) — va deciso cosa succede
quando le voci non ci stanno, invece di lasciarle schiacciare.

### BC-07 — la prima indagine, 11/09/2026: **il preambolo è quasi tutto elenco di file, e la cache al primo giro è ZERO**

Misurato sui `.jsonl` di tutte le sessioni sul disco (nessuna corsa pagata, nessuna ipotesi).

⛔ **Prima stesura della sonda SBAGLIATA, e va detto:** `prompt_tokens` in `/usage` non è cumulativo
sulla sessione, **si azzera a ogni invio** (`RunStarted`). Attraversando quei confini uscivano delta
negativi assurdi (**−995.869** su `7b21ff93`). Rifatta segmentando per invio.

**I tre numeri:**

| misura | valore |
|---|---|
| token in ingresso al PRIMO giro di un invio (24 invii) | **mediana 29.148**, min 24.417, max 43.779 |
| cache al PRIMO giro di un invio | **mediana 0%** — **16 invii su 24 sotto il 10%** |
| cache all'ULTIMO giro dello stesso invio | **87-100%** |

⇒ Dentro un invio la cache prende benissimo. Ma **la prima risposta — l'unica che la persona sta
guardando — ripaga ogni volta tutto il preambolo da zero.** È il «Ragionamento in corso… 27 s» che
l'owner ha fotografato, e il «primo token 23,8 s» della sessione `7b21ff93`.

**Il prefisso NON cambia fra un invio e l'altro** (cinque blocchi di sistema, **una sola impronta**
`ee1cb4343d1d`): la causa non è la cache rotta da noi — è la finestra di cache del fornitore che
scade fra un messaggio e l'altro. ⇒ Quello che si può governare non è la cache: è **quanto pesa il
preambolo**.

**E il preambolo è quasi tutto UNA COSA SOLA:**

| blocco | peso |
|---|---|
| le istruzioni vere del kernel | **337 caratteri, ~84 token** |
| l'elenco dei file (`contestoDelProgetto`, P-13) | **66.523-69.545 caratteri, ~16.600-17.400 token** |

Cioè **il 99,5% del preambolo è l'elenco dei file** — e comincia così, su ogni sessione misurata,
sia col workspace `Desktop` sia col repo `AVM-harness-desktop`:

> `⚠ ELENCO INCOMPLETO — mi sono fermato a 1500 percorsi, l'albero ne ha altri.`

⛔ **È incompleto: non serve nemmeno allo scopo per cui lo paghiamo.** P-13 era stata misurata su un
corpus piccolo (655 righe, ~5.900 token, profondità 5); sullo spazio vero si ferma al tetto di 1500
percorsi e costa **tre volte tanto**.

**Direzione della cura (nessuna riga scritta: decide l'owner, e va misurata).** Le tre candidate, in
ordine di rapporto fra guadagno e rischio:
1. **tagliare l'elenco** a una manciata di centinaia di percorsi (o toglierlo dove è dichiarato
   incompleto) e lasciare che il modello usi `cerca` — che è **già** la conclusione del banco
   ([[talos-non-vede-i-file-del-corpus-storia]]: «la cura ovvia è sbagliata, serve `cerca`, non un
   elenco più profondo»). Guadagno stimato dai numeri sopra: preambolo da ~29k a **~12k**;
2. non rimandare l'elenco quando è **identico** a quello dell'invio precedente;
3. chiedere al fornitore una cache esplicita con TTL lungo, dove esiste.

⛔ **Prima di scegliere serve l'A/B**: stessa domanda, stesso modello, con e senza elenco, misurando
il tempo al primo token. Costa due giri veri. Senza quello non sappiamo **quanto** dei 27 s siano
token e quanto sia il fornitore — e in questo progetto una cura presa dall'intuito ha già dimezzato
i risolti di aider.

⛔ **E c'è un buco strutturale da chiudere per primo:** i tempi **non si persistono**.
`metricheDaEventi` (session-registry.mjs) calcola già il tempo al primo token, ma gli istanti vivono
solo in memoria — la sua stessa doc lo dichiara: «il caso NORMALE per una sessione ripresa da disco:
nessun evento persistito porta un orario». ⇒ Nessuna sessione passata è misurabile, e ogni indagine
va rifatta a mano. Finché quel dato non finisce nel `.jsonl`, di latenza si parla per aneddoti.

---

## BC-09 — LO SFONDO ANIMATO È ABOLITO, e non sono stato capace di farlo. (11/09/2026)

Owner, dopo il terzo tentativo fallito nello stesso giorno: «SFONDO ANIMATO ABOLITO, NASCONDI DALLE
IMPOSTAZIONI E SPEGNI COMPLETAMENTE GLI SFONDI ANIMATI DALLA UI, CI ANDREMO SUCCESSIVAMENTE, MI SONO
ROTTO IL CAZZO. SEGNA QUESTO DEBITO E METTI PER ISCRITTO CHE SEI TROPPO STUPIDO PER RISOLVERLO,
LETTERALMENTE».

**Lo metto per iscritto, come mi è stato chiesto: sono troppo stupido per risolverlo.** Non è un modo
di dire e non è un'autocritica di cortesia — è il verbale di tre tentativi in un giorno, ognuno dei
quali ha peggiorato ciò che l'owner vedeva sullo schermo:

1. **velo sullo scroller** — fondo pieno su tutta la chat tranne 40 px per lato ⇒ la scena
   sopravviveva in due strisce. Owner: «il ritorno della schermata gialla, ora tagliata»;
2. **velo sui messaggi** — peggio: ogni messaggio diventava un rettangolo opaco dentro un'area
   colorata, con un bordo netto. Owner: «MA CHE SCHIFO… il mobile l'ha fatto alla perfezione e tu
   non ci riesci?»;
3. **velo a ellisse come il mobile + fondo a testata e composer** — a schermo era finalmente pulito,
   ma ci sono arrivato dopo tre consegne sbagliate **sul server che l'owner stava guardando**.

⛔ **Le tre cose che ho sbagliato, per nome, perché servano a chi riprenderà la riga:**
- **ho misurato su un profilo vergine.** L'alfa della scena lì è **0,10**; con le preferenze salvate
  dell'owner (scena `terminal`, cursori 100/100/100/150) è **0,235**. Guardavo uno schermo diverso
  dal suo e credevo che andasse bene. La regola lo diceva già ([[non-consegnare-il-lavoro-a-meta-di-un-altro]]:
  una foto di un profilo vergine non è una verifica) e l'ho violata di nuovo;
- **ho continuato a mettere veli RETTANGOLARI** su una superficie che chiedeva una sfumatura. Il
  codice del mobile (`ChatScreen.vue:1124-1131`) è un'ellisse, e ce l'avevo davanti dalla prima riga;
- **ho consegnato al 4174 a ogni tentativo**, invece di provare su un banco e consegnare una volta
  sola quando era giusto.

**Che cosa ho fatto adesso**, su ordine: la scena non si disegna più, in nessun tema e con nessuna
preferenza salvata (`aspetto.css`, regola universale con `!important` sui due pseudo-elementi — è la
forma che non si batte da valle, e qui la si usa apposta perché le classi `background-motion-*`
continuano ad arrivare dalle preferenze già sul disco di chi le aveva accese). E la sezione «Sfondo e
risorse» sparisce dalle Impostazioni: un comando che non governa più niente è peggio di un comando
assente. **Nascosta, non cancellata**: markup e campi restano, il lavoro misurato resta nel foglio.

**Verificato** riproducendo lo stato salvato dell'owner, nei due temi: `#schermoChat::before` e
`::after` a `display:none`, velo dello scroller a `none`, sezione Impostazioni a `display:none`, zero
errori a runtime.

🔜 **Quando si riprenderà**, le condizioni minime: (a) ogni misura si fa con le preferenze VERE
dell'owner iniettate, mai su un profilo nuovo; (b) il velo è un gradiente radiale, mai un rettangolo;
(c) si prova su un banco e si consegna al 4174 **una volta sola**, alla fine.

## BC-10 — a tutta larghezza la chat sfiora la barra di navigazione della conversazione

Owner 11/09/2026: «la chat a tutta larghezza collide troppo vicina al navigator della conversazione
di sinistra, rendi lo spazio uguale a quello di destra».

Con `chat-full-width` la colonna perde il suo `max-width` (`index.css:735`) e si allarga fino al
padding dello scroller — che a sinistra deve però ospitare anche la **barra di navigazione della
conversazione** (`.talos-cronologia`, `position:absolute`, left 16px, larga 36px). Il testo le
arriva addosso, mentre a destra lo stesso padding è tutto spazio libero: i due margini **non sono
simmetrici**, e si vede.

Da fare: a tutta larghezza il margine sinistro della colonna tiene conto della barra (la sua
larghezza più il suo `left`), così lo spazio a sinistra del testo è uguale a quello a destra. ⛔ Non
una costante scritta a mano: le due misure esistono già nel CSS della barra e vanno lette da lì, o
diventano due numeri che divergono al primo ritocco.

### BC-07, seconda parte — COME LO RISOLVONO I BIG, letto nel loro codice (11/09/2026)

Owner: «guarda i big, Claude, Hermes, Codex hanno già pensato a tutto loro, guarda anche DeepSeek
harness e Qwen, voglio solo i metodi migliori». Fatto sui cloni a commit fissato in
`%LOCALAPPDATA%\Temp\talos-competitor`, non su un blog.

**Il metodo migliore ce l'ha Hermes, ed è a due passi da noi.**
`hermes-agent-v21/agent/agent_init.py:986-1008` e `agent/agent_runtime_helpers.py:2365-2430`:

- la cache del prompt **si chiede**, non si spera: marcatori `cache_control` espliciti, con un
  **TTL scelto** — `5m` o `1h`, da configurazione;
- il commento accanto al TTL descrive **letteralmente il nostro guasto**: *«1h tier costs 2x on
  write vs 1.25x for 5m, but **amortizes across long sessions with >5-minute pauses between
  turns**»*. Le nostre pause fra un messaggio e l'altro sono esattamente quelle, ed è il motivo per
  cui la cache al primo giro di un invio è **mediana 0%**;
- il marcatore si mette **sull'ultimo blocco cacheable** (`text`/`tool_use`) — un breakpoint che si
  sposta in avanti man mano che la conversazione cresce, non un punto fisso in testa;
- due layout: sui blocchi interni per Anthropic nativo, **sull'envelope del messaggio per
  OpenRouter e i proxy OpenAI-wire** — che è la nostra strada.

⛔⛔⛔ **E poi la riga che ci riguarda in pieno** (stesso file, doc di `anthropic_prompt_cache_policy`):

> «**Qwen / Alibaba-family** models … **also honour Anthropic-style `cache_control` markers on
> OpenAI-wire chat completions** … **Without markers these providers serve ZERO cache hits,
> re-billing the full prompt on every turn.**»

e, nell'elenco dei gateway che implementano il contratto: «MiniMax, **Zhipu GLM**, LiteLLM».
**Il nostro modello dei giri veri è `z-ai/glm-5.3-flash` — Zhipu GLM.** E in `harness-ui/src/`
la stringa `cache_control` compare **zero volte**: non mandiamo nessun marcatore.

La loro misura di quanto costa perdere quella politica, sullo stesso modello: **85% di cache share
contro 2%** — «tens of millions of re-billed input tokens per benchmark run».

⇒ **Ordine delle cure, aggiornato.** La prima non è più tagliare l'elenco dei file: è **chiedere la
cache**, perché costa poche righe e non toglie niente a nessuno.
1. `cache_control` sull'envelope del messaggio (layout OpenRouter) con **TTL 1h**, breakpoint
   sull'ultimo blocco cacheable;
2. poi l'elenco dei file (~17k token, e si dichiara pure incompleto);
3. poi non rimandare l'elenco quando è identico all'invio precedente.

⛔ Resta l'A/B da fare prima di cantare vittoria: la cache si misura da
`prompt_tokens_details.cached_tokens`, che già leggiamo — e adesso, con `tipo:'tempi-giro'` su
disco, un A/B si legge da sé senza sonde a mano.

---

# Debiti raccolti l'11/09/2026 dopo la ripresa dei crediti — BC-11 … BC-16

> Owner: «ricorda dove segni tutte le cose che ti ho detto da quando hai finito i crediti fino
> adesso». È **questo file**, `.claude/CODA-UNICA-DEBITI-2026-09-06.md`, in fondo. Ogni riga qui
> sotto è una sua frase, riportata com'è stata detta.

## BC-11 ⛔⛔⛔ CRITICO — il modello fa un giro assurdo per scrivere un file grande

Owner, con due schermate della sessione «genera dentro questa cartella un file html di almeno 1000
righe»: «il modello fa un giro assurdo per fare una cosa semplicissima… ha fatto un giro assurdo e
consumato un bordello di token. Questa cosa deve essere trattata con le pinze, devi fare un'analisi
delicatissima di come Hermes e gli altri competitor fanno in modo di ottimizzare tutti i tool e fare
in modo che il modello faccia meno giri possibili». E: «ho anche chiesto un html simulatore tokenizer
da 1000 righe, ci sta veramente troppo tempo, cioè ci deve stare il giusto».

**Quello che si vede nelle sue due schermate, testuale:**
- `exit 1 [sandbox: none]` · **«La riga di comando è troppo lunga.»** — il modello aveva provato ad
  accodare il contenuto con un comando di shell da **23.941 caratteri**;
- poi ha ripiegato da solo: «La shell rifiuta comandi troppo lunghi: scrivo le parti come file
  separati e le assemblerò in coda» ⇒ `_p2.html`, `_p3.html`, … un file per giro;
- e una scrittura è morta con **`error: EISDIR: illegal operation on a directory, open 'C:\Users\
  Antonino\Desktop\qwen 3.8'`** — il percorso è stato troncato allo **spazio** dentro «qwen 3.8
  research», quindi lo strumento ha aperto la CARTELLA invece del file;
- risultato: **13 giri** e ancora non finito, per un singolo file HTML.

⇒ Tre difetti distinti, e nessuno è «il modello è scemo»:
1. **`scrivi` non ha un modo di APPENDERE**: per un file più grande di una risposta, l'unica strada
   che il modello trova è la shell — che ha un tetto sulla riga di comando (~8.191 caratteri su
   `cmd`, 32.767 su `CreateProcess`) e lo rifiuta;
2. **un percorso con uno spazio viene troncato** da qualche parte fra il modello e il disco (EISDIR
   sulla cartella «qwen 3.8» invece del file dentro «qwen 3.8 research»);
3. **niente dice al modello quanto può scrivere in un colpo**, quindi scopre il limite sbattendoci.

⛔ **Ricerca obbligatoria PRIMA di scrivere**, e non solo sul web: **nel codice dei concorrenti**.
Hermes, Codex, Claude Code, DeepSeek harness, Qwen — come fanno a far scrivere un file lungo in
pochi giri? (patch/diff invece del contenuto intero? append esplicito? un attrezzo `apply_patch`?
streaming su file? un tetto dichiarato negli argomenti?). Cloni già sul disco in
`%LOCALAPPDATA%\Temp\talos-competitor`. Fonte + file + riga nel commit.

## BC-12 — «Diretti» va spezzata per provider

Owner: «diretti deve diventare per provider, quindi una tab dedicata per gemini openai e anthropic».
Oggi il selettore modelli ha tre schede — OpenRouter 444, Locali 2, **Diretti 113** — e dentro
«Diretti» i provider sono gruppi richiudibili (Anthropic 11, Gemini 31, OpenAI 71). Devono diventare
**schede di primo livello**, una per provider.

## BC-13 — i modelli locali devono comparire ISTANTANEI, e il mobile l'ha già fatto

Owner: «fare caricare i modelli locali in modo più istantaneo possibile, segnalo dicendo che bisogna
guardare il mobile e prendere spunto da lui — **il mobile ci ha lavorato proprio oggi**».
⇒ Si legge come lo fa `AVM/mobile` (ownership altrui: si LEGGE, non si tocca) e si porta qui.

## BC-14 — la modale «Nuova sessione»: il permesso disabilita Avvia e mente sul perché

Owner: «nella modale nuova sessione i tasti read only, workspace write e on request rendono il
pulsante avvia disabilitato perché mi dice "scegli una cartella" anche se l'ho appena scelta».
⇒ Difetto doppio: il pulsante si blocca **e** la ragione mostrata è falsa. Con «Full access» non
succede — il che dice già dove guardare (`cartellaGiaScelta` / `cartellaEffettivaPerPermessi` e la
validazione della modale, che probabilmente leggono due stati diversi della stessa scelta).

## BC-15 — il PROMPT ENHANCER, già pronto nel mobile

Owner: «segna anche questa nuova implementazione: il prompt enhancer, il mobile ce l'ha già bello e
pronto quindi basta guardare lì».

## BC-16 — il punto 1 di BC-07 è APPROVATO

Owner: «approvato il punto 1». ⇒ `cache_control` esplicito con TTL 1h, marcatore sull'ultimo blocco
cacheable, layout sull'envelope del messaggio per OpenRouter — il metodo letto nel codice di Hermes
(`agent_init.py:986-1008`, `agent_runtime_helpers.py:2365-2430`), che dichiara anche che **Zhipu GLM
e i modelli Qwen/Alibaba senza marcatori servono ZERO cache hit**.

## BC-17 ⛔⛔⛔ CRITICO — `shell` riceve la stringa del comando VUOTA

Owner 11/09/2026, con la schermata della sessione «genera dentro questa cartella un file html».
Il modello scrive, nella chat, la propria diagnosi:

> «a un certo punto il tool `shell` di questo ambiente si è rotto — la stringa comando arriva
> **vuota** a bash (`cd "…" && { ; }` → syntax error), anche su un banale `pwd`. Ho provato tre
> volte ed è sempre la stessa cosa, quindi non è un mio errore di sintassi. Senza shell non posso
> fare la concatenazione né eseguire i controlli.»

⛔ Questa è quasi certamente la causa VERA di BC-11 (il «giro assurdo»): il modello non stava
girando a vuoto per stupidità — **stava ritentando uno strumento rotto**, e ha finito per
inventarsi la strada dei file separati perché l'unica che gli restava.

⛔ Il guscio che si vede nell'errore (`cd "…" && { ; }`) dice dove guardare: il comando viene
interpolato dentro un involucro, e quando la stringa è vuota l'involucro resta e bash trova un
blocco vuoto. Da capire **perché arriva vuota** — troncatura degli argomenti in streaming? un JSON
degli argomenti chiuso male? un nome di campo diverso da quello atteso (`comando` vs `command`)?
⇒ Si riproduce con un giro vero, si guarda il `.jsonl` (gli argomenti arrivano in `ToolCallArgs`, a
pezzi) e **si legge il pezzo che arriva prima del guasto**, non quello dopo.

## BC-18 — la scheda «Agenti» resta vuota MENTRE una sotto-attività è in corso

Owner 11/09/2026, due schermate affiancate: nella chat c'è «**1 attività in corso…** · Sotto-attività:
Devi assemblare e validare un file HTML… · task: 4776 caratteri», e nella colonna di destra la
scheda **Agenti** dice «**Nessun sotto-agente in questa sessione.**»

⛔ BC-03 era stato dichiarato chiuso l'11/09 con foto e test — ma il suo stesso rapporto dichiarava
il buco: «**non verificato: nessun giro reale col modello, quindi la scheda con una figlia VIVA (e
il "Ferma questa delega") non l'ho mai vista a schermo**». Eccola: con una figlia viva la scheda è
vuota. ⇒ BC-03 **si riapre**, e la parte che mancava è esattamente quella che non era stata provata.

### BC-11, correzione (11/09, dall'agente «attrezzi: meno giri») — la MIA diagnosi sull'EISDIR era sbagliata
Il percorso nell'errore `EISDIR … open 'C:\Users\Antonino\Desktop\qwen 3.8 research'` è **completo**,
spazi inclusi: è la radice della sessione. Manca il NOME DEL FILE. `scrivi` riceveva
`percorso: undefined` — o per argomenti troncati a metà stream (`talosHarness.mjs:5814` sostituisce il
JSON monco con `{}`), o perché il modello scrive `"path"` invece di `"percorso"` (misurato: **46
chiamate su 308 col nome dell'argomento sbagliato** — `command` 39, `path` 2, `content` 1, `contuto` 1)
— e `kernelPerIlBanco.js:22` (`percorso ? resolve(radice, percorso) : radice`) **restituisce la
radice** per un percorso vuoto. ⇒ La cura di BC-17 (alias per `shell`) copriva metà del guasto: la
metà `scrivi` è ancora scoperta. E il difetto più grande: `document_create format:'html'` avvolge il
body e gli passa `escapeHtml` (`document-generator.mjs:234-245`) — **non può scrivere una pagina HTML
scritta a mano**. Per «genera un file html di 1000 righe» non esisteva NESSUN attrezzo capace.
Rapporto: `.claude/RAPPORTO-ATTREZZI-MENO-GIRI-2026-09-11.md`.

### BC-11, stato al 11/09 sera (verificato nel kernel, non dal vivo)
Nel kernel c'è già tutto ciò che il rapporto chiedeva: `percorsoDiFile`/`contenutoDiScrivi` (alias
`path`/`content`…, `talosHarness.mjs:944-960`), `scrivi` che con percorso vuoto o contenuto assente
**risponde a parole** senza toccare il disco (`~6620`, `messaggioArgomentiAssenti`, e dice se gli
argomenti erano troncati), `mode:"append"` nello schema con la regola «mai file numerati da assemblare»
(`~1425`), `document_create` html verbatim. `kernelPerIlBanco.js:22` (`dentro('')` → radice) resta
com'è: è il bundle del banco e il ramo `scrivi` ora si ferma prima. **Manca la prova che chiude il
debito**: lo stesso ordine dell'owner («genera dentro questa cartella un file html di almeno 1000
righe») con `glm-5.3-flash` su una cartella temporanea, contando i giri e i token — costa qualche
centesimo, parte col suo sì.

### BC-11 ✅ CHIUSO dal vivo (11/09, 23:27-23:35, giro accordato dall'owner)
Stesso ordine («genera dentro questa cartella un file html di almeno 1000 righe: un simulatore di
tokenizer…»), `glm-5.3-flash`, cartella temporanea: **concluso in 451 s**, `simulatore-tokenizer.html`
**2.238 righe / 60.144 byte** scritto con **4 chiamate di `scrivi`** (1 create + 3 append), più
`package.json` e uno `smoke-test.mjs` che il modello ha voluto lanciare (2 shell). **39 giri**, zero
EISDIR, zero «riga di comando troppo lunga», zero percorsi vuoti, zero rifiuti. Token: 714.985 dentro
di cui **627.008 dalla cache (87,7 %)**, 60.047 fuori — su glm-5.3-flash la cache del prefisso PRENDE
(su glm-4.7-flash era 0). Prima: 13 giri e non finito, poi 170 giri fermati a mano. Sessione
`1da2d212` nello store del 4174. Resta da dire al modello quanto può scrivere in un colpo (oggi lo
scopre da solo, ma senza sbatterci): dettaglio minore, non riapre il debito.

## BC-19 — il logo del velo d'avvio deve leggere i token del tema
Owner 11/09/2026 sera: «anche il logo di boot deve essere legato ai token del tema». Oggi il velo
`#talosAvvio` (`frontend/index.template.html`, `frontend/src/avvio.js`) porta il marchio copiato dal
mobile con i suoi colori: l'oro e il fondo vanno presi da `--talos-accent`/`--talos-background` del
tema salvato (il ponte del tema in `avvio.js` già legge la preferenza prima del primo disegno), così
un tema diverso da Calm non mostra un logo di un altro colore per 650 ms. Verificare nei preset
esistenti (calm, forge, terminal, claudius…) e nei due modi colore.

## BC-20 ⛔⛔ — il drop-in era un SOTTOINSIEME del mockup interattivo: manca tutto il JavaScript

Owner 11/09/2026, sera, dopo la consegna del drop-in sul 4174: «ci sono molte cose che non
funzionano, la sidebar se clicco su un elemento di Note, Libreria ecc, molte cose non sono state
messe, animazioni ecc, pessimo lavoro». E ha caricato `Talos_Desktop_Final_Mockup_Interattivo.html`
(938 KB) più un secondo zip — **identico byte per byte** al primo (stessi 41 file, diff vuoto).

**Misurato, mockup contro prodotto (bundle `public/styles.css`):**
- classi `.talos-*` del mockup: **574**, di cui **9** assenti nel prodotto; keyframes: **17 su 18** già
  presenti (manca solo `td-track`). ⇒ Il CSS «talos» del mockup è già quasi tutto nel prodotto,
  perché il mockup è costruito sul nostro template;
- ciò che il drop-in NON portava: **~130 classi `td-*`** nuove (master/detail, card, filtri, modali,
  toast, theme studio, drawer, sidebar a gruppi…) e **~90 funzioni JS**: `navigate` con transizione
  al cambio pagina (`motion(visible, opacity .4 → 1, translateY 5px → 0)`), `initSidebar` che
  riorganizza la barra in due gruppi richiudibili «Spazi di lavoro» (Conversazioni, Note, Attività,
  Libreria, Memoria, Ricerca, Progetti, Board) e «Strumenti» (Modelli, Capability, Officina,
  Automazioni, Doctor) con pulsante flottante e drawer sotto 860 px, `renderSection`/`renderDetail`
  (master-detail per ogni sezione), `sessionMenu`, selezione multipla delle sessioni, `toast`,
  `modalShow`, `themeChooser`/`initAtelier`, `initTerminal` (demo), `guide` (tour).
⇒ La sidebar «che non funziona» è la sidebar VECCHIA che apre le sezioni senza transizione: nel
  prodotto Note/Libreria/Memoria si aprono (foto dell'11/09 sera, due temi), ma senza la struttura e
  il moto del mockup. Il drop-in consegnato conteneva 5 file (Canvas + CSS): nessuno di questi JS.

**Cosa serve:** un porting vero, sezione per sezione, in `legacy/app.js` + `index.template.html` +
un foglio `td-*`, con l'owner che decide COSA portare (è un mockup: «siamo noi che decidiamo»).
Brief pronto in `.claude/BRIEF-PORTING-MOCKUP-2026-09-11.md`; parte quando l'agente dei residui
rilascia `app.js`.

### BC-20, precisazione (11/09 sera, dopo il confronto regola per regola)
Il primo confronto (stringa esatta, mockup contro `public/styles.css`) diceva «603 regole solo nel
mockup»: era troppo severo — differenze di virgolette e spazi contavano come regole assenti. Rifatto
per famiglie e verificato con grep mirati: le 79 regole `:root.talos-final-ui …` delle sezioni sono
nel bundle E la classe viene messa su `<html>` dal renderer (`bundle app.js` ×1); i preset di tema
nuovi stanno già in `temi.css` (17 riferimenti). ⇒ **Il CSS del mockup è nel prodotto.** Ciò che
manca è esattamente ciò che i quattro lotti in corso stanno portando: sidebar a gruppi, transizione
al cambio pagina, elenco+dettaglio, menu e selezione delle sessioni, toast, theme studio, modali
(~90 funzioni JS, 344 regole `td-*`). Le 259 «solo mockup non td» restanti sono stati `aria-*`,
hover/focus e varianti (`data-densita`, `data-sidebar="icone"`) da riverificare UNA volta a merge
fatto, sul DOM vero, non a confronto di stringhe.

### BC-07, l'A/B (11/09 sera, approvato dall'owner, reasoning basso) — **il marcatore NON prende su GLM**
Sessione vera su 4174, `z-ai/glm-5.3-flash`, due invii a pochi secondi di distanza, kernel col
`cache_control {type:'ephemeral', ttl:'1h'}` sull'ultimo blocco di sistema (contenuto multi-parte):

| invio | token dentro | da cache | primo token |
|---|---|---|---|
| 1 | 29.743 | **0** | 4.264 ms |
| 2 | 29.758 | **0** | 4.248 ms |

⇒ Né a radice né per blocco: su questa rotta il marcatore esplicito non produce cache hit. È coerente
con i due vincoli già dichiarati (l'elenco Alibaba dei modelli con caching esplicito non contiene
`z-ai/glm-*`; LiteLLM #19923 documenta la rimozione del marcatore per GLM/ZAI). La cache che si vede
dal secondo giro dello STESSO invio (87-100%) è quindi automatica del fornitore e non governabile da
noi. Il marcatore resta nel kernel — è innocuo, ~0 byte, e serve ai modelli che lo onorano (Qwen,
Claude) — ma **la leva per GLM è il PREAMBOLO**: ~17k token di elenco file, dichiarato incompleto.
Costo dell'A/B: due giri brevi (~$0,01). Registrato con `tempi-giro` su disco, nessuna sonda a mano.

### BC-07, la ricognizione sui quattro (11/09 sera) — rapporto `.claude/RAPPORTO-PREAMBOLO-CONCORRENTI-2026-09-11.md`
**Nessuno dei quattro manda al modello un elenco di file; tutti e quattro mandano le ISTRUZIONI di
progetto — TALOS è l'unico che manda l'elenco e non le istruzioni.** Letto nel codice: Codex
`<environment_context>` ~35 token + `AGENTS.md` (32 KiB) + `rg --files` nel prompt, contesto reso a
delta e appeso, mai riscritto; Claude Code 2.1.268 (dal binario) quattro chiavi di sessione,
`gitStatus` tagliato a 2.000 caratteri, `CLAUDE.md` a 200 righe/25.000 byte, memoria come indice di
percorsi, sezioni memoizzate e rottura della cache strumentata; Hermes «workspace block» ~100-130
token («never re-probed per turn: that would shatter the prompt cache») e un solo `search_files`
al posto di ls/grep/find; DeepSeek harness UNA frase + istruzioni a budget e approfondimento a
domanda (l'`AGENTS.md` profondo arriva solo dopo che un read/write tocca quella cartella).
**Misurato sui nostri moduli:** l'elenco di oggi copre il **30%** dei file (troncato a 1.500) e
pesa 15-20k token; una mappa delle sole CARTELLE, completa, pesa **1.400-1.700** (profondità 3).
⛔ **Da sistemare PRIMA di togliere l'elenco:** `cerca` ha una allowlist di estensioni — 1.004 file
`.php` del kernel non sono cercabili per contenuto, e `startsWith('.')` + `android/ios/vendor`
nascondono altri 505 file. Togliere l'elenco senza curare `cerca` = «ho azzoppato aider».
**Proposta:** preambolo in 4 blocchi — kernel (84) + scheda di lavoro (~150-250) + `AGENTS.md`
con tetto (oggi 0) + mappa delle cartelle completa (~1.000-1.700) — e contesto che si APPENDE, non
si riscrive. Risparmio stimato **15.500-19.300 token a messaggio**. **Regola del banco da
riscrivere**: metrica `pass^3`, colonne `tokenPrimoGiro`/`giriUsati`, corpus `storia` spaccato in
9 ciechi / 26 instabili, premessa «0 su 35» corretta.

### BC-21 — CRITICO · la ricerca approfondita parte in sola lettura e la sezione non la fa consultare (11/09/2026, sera)
**Segnalato dall'owner con due foto del 4174.** Sessione «ricerca» (20:56, `glm-4.7-flash`, 11 giri,
pill **«Solo lettura»**): 9 ricerche web e 14 navigazioni riuscite, poi «Attività non riuscita» e il
modello che scrive «la sessione è in sola lettura, quindi non posso creare documenti». ⇒ la ricerca
è partita con un permesso che le VIETA di consegnare il rapporto. Nella sezione «Ricerca
approfondita» la card dice **«Conclusa»** (falso: nessun rapporto) e in fondo «la consultazione del
rapporto e delle fonti non è ancora disponibile qui» — cioè la sezione è un elenco senza dentro.
**Owner:** «il mobile fa già una cosa molto interessante, voglio che la migliori e la renda più
robusta; voglio un disegno tecnico comparato con i competitor, realmente valido e unico».
**Stato:** disegno delegato (Opus 5 high, solo documento): riproduzione sui dati veri, causa con
file:riga, tabella mobile (23 file, 6.254 righe in `mobile/src/lib/research/`) vs Hermes/Claude
Code/Codex/DeepSeek, fonti web ago-set 2026, architettura, lotti. Documento atteso in
`.claude/DISEGNO-RICERCA-APPROFONDITA-2026-09-11.md`. ⛔ Nessun codice finché l'owner non approva.

### BC-22 — il cancello `npm run test:componenti` è ROSSO a HEAD (11/09/2026, sera)
Cinque righe `COMP …: dai dati alla riga del mockup — struttura, parole, pixel` (SettingRow,
CheckCard, ExtensionList_skills/mcp/plugins) falliscono a ~1 minuto l'una (timeout). L'agente della
barra l'ha provato con A/B nel worktree rimettendo i quattro file a HEAD: **rosso già prima** del
porting, quindi non introdotto dai lotti di stasera; rilanciato sulla lane dopo il merge: stesso
esito. **Causa trovata (11/09, 23:10, una prova isolata su porte libere 4321/4322):** non è il
velo del laboratorio — è il confronto delle PAROLE col mockup di riferimento (`tests/parity/aiuto.mjs`,
`MOCKUP`). `COMP ProviderCard`: atteso «… Salva chiave Prova collegamento Salva collegamento Rimuovi
chiave», ricevuto «… Salva chiave». La app ha spostato le azioni oltre le due in un menu «⋯» + tasto
destro per regola dell'owner del 10/09 («le azioni non si affiancano»): il **riferimento è rimasto
indietro rispetto alla decisione**, e i timeout a 1 minuto (CheckCard, ExtensionList×3) sono da
guardare a parte. ⇒ Cura: aggiornare il riferimento dei componenti toccati dalla regola (o insegnare
al confronto che le azioni nel menu overflow valgono come presenti), lotto a sé, dopo i lotti della
ricerca approfondita. Non è un difetto della app.

### BC-23 — lo sfondo animato è tagliato o parte da metà schermo (owner, 11/09/2026 sera)
Foto sul 4174, tema Terminal, sfondo acceso, finestra ~1600×794 CSS (DPR ≈ 1,25): la scena si vede
solo da y≈490 su 993 in giù e sul bordo destro; la metà alta della chat è vuota. Ipotesi da
misurare (non da supporre): `prepare()` abbassa il dpr sotto `devicePixelRatio` per il tetto di
pixel e chi disegna usa l'altro; il containing block di `.talos-motion-canvas` (`inset:0`) non è
`#schermoChat`; un padding in coda della conversazione pari a `clientHeight/2`. Delegato (Opus 5
high) con riproduzione a DPR 1 / 1.25 / 2, cura minima provata al contrario, foto chiaro/scuro.

### BC-24 — albero dei file: «Apri» manca sulla radice, e le cartelle si espandono ma non si comprimono (owner, 11/09/2026 sera)
Foto della scheda «File» dell'inspector (cartella `talos-bc11-3WpcAS`): tasto destro sulla radice
senza «Apri in Esplora file» (le azioni esistono per i FILE dal 27/8 e «Apri» gemella di «rivela»
dal 10/09: vanno estese alla cartella con la stessa validazione di `workspace-files.mjs`); le
cartelle si aprono e non si chiudono (`app.js` ~13239). Delegato (Opus 5 high): cura, prove nei due
versi, pattern APG Tree View, foto chiaro/scuro.

### BC-25 — Libreria: il dettaglio non mostra il file, né renderizzato né come testo (owner, 11/09/2026 sera)
Foto sul 4174: dettaglio «File di prova – Markdown.md» con «Azioni sul file» e un riquadro vuoto.
Il mockup (ordine dell'owner, «tale e quale») mostra il contenuto con due modi, Anteprima e Testo.
Delegato (Opus 5 high): switch Anteprima·Testo nel dettaglio (MD col render della chat, CSV a
tabella, PDF in iframe se il CSP lo permette, DOCX «si apre con l'app del sistema» senza finzioni),
fixture dei quattro tipi, foto chiaro/scuro; aggancio in app.js come diff (app.js è in mano al lotto
BC-24).

### BC-26 ⛔⛔⛔ NON NEGOZIABILE — note in markdown renderizzate; CRUD completo su Note, Attività, Memoria, Libreria (owner, 11/09/2026 sera)
«Le note, se sono markdown, devono essere renderizzate in markdown; tutte le Note, Attività,
Memoria, Libreria devono avere CRUD completi, non negotiable.» Oggi note/attività/memoria hanno
rotte SOLO GET (il modello scrive via attrezzi, la persona no) e i lotti UI di stasera hanno tolto i
pulsanti proprio per questo. Due lotti: **backend** (delegato ora: rotte crea/modifica/elimina/leggi
sulle stesse funzioni degli store che usano gli attrezzi del modello, contratto JSON, 405 con Allow
esatto) → **frontend** (dopo BC-25, su `sezioni-adattatori.js`: form di creazione/modifica nel
dettaglio, elimina con `confermaModale`, note in markdown col render della chat, switch
Anteprima·Testo come la Libreria; confronto testa a testa col mockup).

### BC-27 — il Board mostra «undefined is not iterable» (owner, 11/09/2026 sera)
`board.js:16` destruttura `STATO[chiave]` e la chiave viene da `statoSessione().classe`: una classe
non prevista dalla mappa (es. `pendente`, la «Nuova sessione» in attesa di avvio) fa cadere tutta la
pagina invece di una riga. Cura in loco: mappa completa + ripiego dichiarato, e un test che passa
OGNI classe di `statoSessione` per la mappa del Board (il verso contrario: una classe nuova senza
riga nel Board deve far diventare rosso il test, non la pagina).

### BC-28 — le animazioni del mockup vanno riportate «alla perfezione» nella app (owner, 11/09/2026 sera)
Inventario di OGNI animazione e transizione del mockup interattivo (`@keyframes`, `transition`,
JS: cambio pagina, apertura pannelli, menu, toast, hover, schede, cassetto, sfondo) contro la app,
testa a testa, con misura (durata, easing, proprietà) e foto/registrazione; porting di quelle
mancanti o diverse; `prefers-reduced-motion` e le preferenze «animazioni dell'interfaccia» rispettate.
Delegato (Opus 5 high).

### ⚠️ Incidente 11/09 sera — gli store `.harness-ui-library` e `.harness-ui-research` del Desktop sono nel CESTINO
Dopo il riavvio del 4174 (23:42) la sezione Ricerca del progetto Desktop era vuota e la Libreria
aveva solo i 4 «File di prova» delle 23:36. Cercato: nessuna sessione con `library_delete`/
`research_delete`, nessun test coi percorsi veri, nessun banco con store copiato che scriva lì.
Il Cestino di Windows contiene `.harness-ui-research` (eliminata 20:56:46) e `.harness-ui-library`
(21:00:33) provenienti dal Desktop: un `fs.rm` di Node NON passa dal Cestino, quindi è stata una
cancellazione da Esplora file, non del codice. Sono ripristinabili dal Cestino (decide l'owner).

### BC-29 — il render Markdown della chat non rende i blocchi di codice né le citazioni (12/09/2026, foto del 4174)
Nel dettaglio di una nota in Anteprima (`renderizzaMarkdownSemplice` iniettata dal CRUD frontend):
titoli, grassetto ed elenchi numerati resi; il recinto ```…``` esce come righe di testo normale e la
citazione «> …» esce letterale col «>». L'ordine dell'owner è «le note markdown renderizzate in
markdown»: recinti (monospazio, con la lingua) e citazioni vanno resi, in un posto solo (la stessa
funzione serve alla chat: verificare che lì i recinti passino da un'altra via e non duplicare).
Lotto piccolo, dopo BC-22.

### BC-22 ✅ CHIUSO (12/09, notte) — una causa sola, undici volte
Il riferimento `mockup/talos-mockup.html` è del 07/09; fra l'8 e l'11/09 l'owner ha ordinato
cambiamenti che la app ha fatto e il mockup no (menu ⋯, barra a gruppi, piede del composer, browser
che torna alla pagina). Nove rossi erano questo: riferimento aggiornato DENTRO la prova (blocco «IL
RIFERIMENTO SI AGGIORNA», ogni riga con l'ordine e la data; nessuna tolleranza allargata: 10 su 11 a
zero pixel); uno il laboratorio del Browser che caricava example.org in una cornice viva; uno
(`NotificationPanel`) rasterizzazione (scala di grigi vs subpixel), non disegno. Tre difetti per
strada: pill statica del Terminale svuotata dal laboratorio; riga Libreria senza azioni; `context-
compactor.spec` 6/6 in timeout per il velo d'avvio (ora 6 verdi in 10 s). Conteggio: COMP 26/37 →
**37/37** a 1440, **111/111** su tre viewport; `test:componenti` intero **146 passati, 1 fallito**
(RIP-V01, sotto). Residuo `Browser` 122 px (0,012 %): mappamondo nel mockup, foglio nella app per
una scheda di lettura — decide l'owner. **Debito**: rigenerare `mockup/talos-mockup.html` dal mockup
interattivo dell'11/09, così il riferimento non vive dentro la prova.

### BC-30 — Review: a 1280×800 le azioni della testata coprono le schede di 20 px (12/09, dal cancello)
`RIP-V01` rosso solo a 1280: `azioni.left − schede.right` = +59,77 a 1440 · **−20,23 a 1280** · +21,77
a 1024, identico nel mockup e nella app: impaginazione a quella larghezza già nel disegno, non una
regressione. Da curare nella testata Review (a capo delle azioni o menu ⋯ sotto i 1300 px), poi
foto a 1280.

### L8 (12/09, 08:02-08:09) — la verifica vera della ricerca approfondita: NON chiude, e dice perché
Madre `c8e9b07b` (glm-5.3-flash, Desktop) → `research_start` → figlia `3029dea2` col permesso nuovo
**«Research»** (L1 funziona: nessun REFUSED), 18 giri, 5 min, 265.670 token dentro / 7.288 fuori,
**cache 0**. Il rapporto è stato depositato (`.harness-ui-research/3029dea2…/rapporto.md`, 8.953 byte,
prosa buona con numeri) ma **senza il blocco ```talos-research-report** ⇒ cancello di consegna →
`senza-rapporto`, motivo onesto a schermo («il rapporto non porta il record verificabile»). Tre
difetti veri, trovati dal giro e non dai 2439 test:
1. **La figlia gira con `glm-4.7-flash`** (il modello di serie), non con quello della madre
   (`glm-5.3-flash`): `research_start` non passa il modello ⇒ cache 0 (su 4.7 non prende) e la regola
   dell'owner «giri reali solo con glm-5.3-flash» violata dal prodotto. Cura: la figlia eredita il
   modello della madre (o quello scelto nella sezione).
2. **Il record recintato affidato alla prosa del modello non arriva**: un modello flash produce il
   rapporto e ignora il JSON. Cura: `research_deposit` prende argomenti STRUTTURATI
   (`testo`, `affermazioni[{testo, fonte, passaggio}]`, `fonti[{url, titolo}]`) e il record lo scrive il
   SERVER con `src/research/report.mjs` — mai un fence lasciato al modello.
3. **La sezione non si aggiorna da sola** quando la figlia finisce: la card resta «In corso» finché
   non si preme Aggiorna (foto `fine-Rapporto.png`). Cura: ricaricare l'elenco al `RunFinished` di
   una figlia con `permessi: Research`.
Più: `giornale` 3 eventi, `passi 0`, `spesa 0` — il collettore non è agganciato (noto, L4 §): Piano e
Fonti restano vuoti finché non lo è.

### BC-31 — «research_deposit…» a schermo (owner, 12/09, foto della chat della ricerca L8)
Un attrezzo nuovo del kernel senza nome umano: regola del 04/09 violata. Curato subito (nome umano
«consegna del rapporto di ricerca» + descrizione) e cancello `nomi-attrezzi-copertura.test.mjs`:
ogni attrezzo dichiarato dal kernel deve avere il suo nome umano, altrimenti rosso il test e non lo
schermo. ⛔ Debito trovato per strada: la mappa dei nomi vive in DUE posti (`nomi-attrezzi.js` e una
copia in `legacy/app.js` ~2514) — «mappa in UN posto solo» era la regola; da unificare.

### PO-14 — inventario dei provider di Hermes e quanti aggiungerne ai nostri (owner, 12/09/2026)
«Inventario di lista provider/api key di Hermes; valutiamo quanti nuovi provider inserire nella
nostra app, ne abbiamo troppo pochi; inventario completo con grammatica e mappa API completissima.»
Delegato (Opus 5 high, solo documento prima del codice): tabella dei provider di Hermes (letti nel
codice del clone: nome, base URL, auth, forma dell'id modello, endpoint, streaming, tool calling,
cache, usage/prezzi, OAuth/keyless), la GRAMMATICA con cui Hermes li dichiara, i nostri di oggi
(`native-provider-adapter.mjs`, `openai-compatible-runtime.mjs`, `openrouter-oauth.mjs`,
`model-catalog.mjs`, il Catalogo dei fornitori nelle Impostazioni), il divario, e la proposta
ordinata di quali aggiungere e con quale grammatica unica. Codice dopo il sì dell'owner.

### BC-32 — la ricerca approfondita deve avere una suite di esportazioni COMPLETA (owner, 12/09/2026)
«Fai in modo che la ricerca approfondita abbia una suite di esportazioni completa.» Oggi: Markdown,
BibTeX, RIS dal menu (L7), copia. Mancano: PDF nei tre toni del mobile (`researchPdf.ts`: report ·
brief · dossier), DOCX, HTML autonomo, JSON del record verificabile, e l'esportazione delle fonti
come elenco. Backend: rotta `GET …/research/:id/esporta?formato=…` su `document-generator.mjs` e sul
porto di `researchPdf.ts`; frontend: sottomenu «Esporta» nel menu ⋯ della ricerca con tutti i
formati, nome del file dalla domanda, toast. Delegato in due lotti (backend + UI).

### L8, CURE (12/09) — i punti 1 e 2 sono CHIUSI; il 3 resta aperto
Rapporto: `.claude/RAPPORTO-RICERCA-L8-CURE-2026-09-12.md`. Ricerca web prima di scrivere: «The
Constraint Tax» (arXiv:2605.26128v1, 20/05/2026), «Constraint Tax in Open-Weight LLMs»
(arXiv:2606.25605v1, 24/06/2026), «PHREEQC-MCQ-200» (arXiv:2607.00436v1, 01/07/2026), OpenRouter
«Prompt Caching» (letto 12/09/2026).
1. ✅ **La figlia eredita modello e reasoning della madre** (`session-registry.mjs` `onRicercaAvvia`
   → `research-orchestrator.avvia`), il modello finisce sulla metadata della ricerca ed esce nel
   contratto della voce (quindicesimo campo). ⛔ Eccezione dichiarata e provata: da una madre su
   runtime LOCALE non si eredita niente (la figlia gira in cloud: un id di GGUF sarebbe un 400).
2. ✅ **`research_deposit` è strutturato**: `{testo, affermazioni[{testo,fonte,passaggio}],
   fonti[{url,titolo,dataDichiarata?,letta?}]}`, e il record recintato lo scrive il SERVER con
   `src/research/report.mjs` (`judge:null`, `claimSupported:'unchecked'` fissi — un modello non
   timbra sé stesso, e adesso non ha nemmeno il campo). Il modo vecchio resta accettato; argomenti
   mal formati ⇒ risposta a parole e nessun file; un `{testo}` senza record viene depositato lo
   stesso e la risposta DICE che non conterà come consegnato. La consegna non chiede più il recinto.
3. 🔜 **APERTO**: la sezione non si aggiorna da sola alla fine della figlia (è `frontend/`, fuori
   dal perimetro di questo lotto).
⛔ Il giro vero di conferma lo lancia l'OWNER: nessun test dimostra che glm-5.3-flash riempia
davvero `affermazioni` e `fonti`. Cosa guardare è elencato nel §7 del rapporto.

### PO-14 ✅ APPROVATA TUTTA (owner, 12/09: «approvo tutto») — ordine di esecuzione
P-A record unico + test di parità → P-B cache DeepSeek → P-C LM Studio in chat (lotto 1, delegato) →
P-D Z.AI diretto a due porte → P-E models.dev catalogo → P-F fallback_models + ausiliario → P-G gli
undici «una riga» su wire OpenAI (Groq · Cerebras · Mistral · Together · Fireworks · DeepInfra ·
Novita · Nebius · xAI · Ollama Cloud · HuggingFace) → P-H pool di chiavi + fallback → P-I Kimi ·
MiniMax · Qwen → P-J wire Anthropic Messages verso terzi → P-K Azure/Bedrock/Vertex → P-L provider
come processo esterno. Approvato anche il secondo giro di conferma di L8 (dopo il riavvio del 4174
col backend delle cure).

### BC-33 — «Temi e atmosfere»: anteprima DAL VIVO e tutti i cursori dentro la modale (owner, 12/09/2026)
Foto dell'owner: lo studio (lotto F) ha un'anteprima statica (pallino e barre, scura anche con
Paper) mentre nel mockup è viva. Ordini: (1) anteprima disegnata coi token del preset scelto, con la
mini-conversazione del mockup e la scena animata del tema (renderer del pacchetto), che cambia al
cambio di preset; (2) «i diversi slider TUTTI nella modale anziché nelle impostazioni, più semplice e
UX friendly» — precisato: «gli slider relativi dell'animazione e del tema, ovviamente»: preset, modo
colore, sfondo acceso/spento, scena, intensità, contrasto, velocità/densità e gli altri cursori della
scena — nello studio, con le stesse chiavi di salvataggio; densità liste, dimensione, testo chat,
composer restano in Impostazioni; per ciò che passa nello studio, in Impostazioni un rimando. Delegato (in corso, con confronto testa
a testa e i 14 temi provati uno per uno).

### BC-34 — le esportazioni HTML/PDF/DOCX della ricerca stampano il Markdown grezzo (12/09, foto sul 4174)
Prova degli otto formati sul 4174 riavviato: md/html/pdf/docx 200 con intestazioni giuste,
json/bib/ris/fonti 409 onesto senza record — ma l'HTML mostra «# », «## », «**…**», «- » letterali e
gli elenchi schiacciati. In cura nel modulo delle esportazioni (renderer server-side riusato da
document-generator o minimo senza dipendenze; il record recintato non si stampa come prosa).

### L8 #2 ✅ CHIUDE (12/09, 09:32-09:46) — la ricerca approfondita è «Conclusa» per davvero
Stessa domanda, madre `efc9559d` (glm-5.3-flash), figlia `2a8ab83b` **con lo stesso modello della
madre** (cura 1), 19 giri, 13 min 53 s, 323.454 token dentro di cui **172.032 dalla cache (53 %)**,
44.141 fuori. `research_deposit` strutturato (cura 2) → `rapporto.md` di 102 KB col record scritto
dal server → cancello di consegna → **`done`**, in Libreria (`lib-08e01b5f`). Bilancio: **38
affermazioni** (tutte «non verificate»: giudice nullo per costruzione, un modello non timbra sé
stesso), **28 fonti, 17 prove distinte** su 28 indirizzi. La sezione la mostra «Conclusa» col
bilancio, le affermazioni coi passaggi verbatim, le fonti; la card si è aggiornata da sola durante
la corsa (cura 3, foto `scratchpad/l8b/durante-*.png`). Restano vuoti «Piano» e «Speso» (`passi 0`,
`spesa 0`): il collettore e la verifica del motore portato NON sono ancora agganciati alla corsa —
è il prossimo lotto (**L9**: `collector.mjs`/`verification.mjs` nella figlia, giudice ≠ autore con
un secondo modello, passi nel giornale, spesa vera).
