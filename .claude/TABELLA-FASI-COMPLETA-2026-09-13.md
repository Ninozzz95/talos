# TABELLA DELLE FASI — la tabella di marcia unica del desktop (riscritta il 16/09/2026)

> Owner, 16/09/2026, al reset dei limiti: «ispeziona le modifiche fatte e aggiorna la tabella di
> marcia unica alle ultime modifiche eliminando doc e tutto quello che è obsoleto/passato/fatto».
>
> ⇒ Questo file è **l'unico** stato del lavoro desktop. Ciò che è chiuso sta nel registro in fondo,
> in una riga con la prova; i documenti delle fasi chiuse sono in `archivio/2026-09-16/` (indice
> lì dentro). Le code (`CODA-UNICA-DEBITI`, `CODA-PROPOSTE-OWNER`, `CODA-BUG-CRITICI`) restano come
> **deposito dei requisiti**: le loro intestazioni non sono uno stato corrente, questo file sì.
>
> Come il 13/09: ogni fase è raccontata per intero — **cosa succede oggi, perché, cosa cambia dopo** —
> senza rimandi da andare a cercare. Le sigle (BC-07, PO-25…) servono solo a ritrovare la scheda
> nelle code.

---

## Stato al 16/09/2026, misurato

| cosa | stato |
|---|---|
| **Pubblico** `Ninozzz95/talos` | release desktop **0.1.5 · 0.1.7 · 0.1.8 · 0.1.10 · 0.1.13** (0.1.6, 0.1.9, 0.1.11, 0.1.12 bruciate: un tag pubblicato non si riscrive). La **0.1.13** è uscita oggi alle 16:35Z con tre asset. Oggi su `main` sono entrate le PR #18-#22: chiavi con scope desktop (portachiavi separato prod↔dev), disinstallazione con spunta «mantieni/elimina dati e chiavi», batch della Libreria, review chiavi (gate sul seme d'ambiente, migrazione chiavi legacy), le due cure del percorso di release. Le porta avanti **un'altra sessione** («Gate rossi di TALOS»), che ha dichiarato di non chiedermi più review. |
| **Privato** `lane/harness-desktop` | pubblicato fino a `3415c030` (Fase 3 + streaming). **Tre commit locali non pubblicati di un'altra sessione** (`6d1e078a` batch Libreria, `c36c63ba` generatori di test dal pubblico, `9c9a0fd2` esenzione BC49) e **due test modificati non committati** (porte di scrittura no-op in `research-orchestrator.test.mjs` e `ricerca-deposito-strutturato.test.mjs`): non sono miei, non li tocco, li dichiaro. |
| ⛔ **Divergenza privato↔pubblico** | il pubblico è **avanti** sul packaging desktop (chiavi, disinstallazione, release-path) e la lane privata ha cose che il pubblico non ha (worktree WIP). Regola già scritta il 14/09 e ancora vera: **non riesportare la lane privata prima di recuperarvi i fix pubblici**; direzione privato→pubblico **a pezzi**, mai copiando `http-app.mjs` intero. È un debito con un nome, non una fase: si chiude dentro la prima fase che tocca quei file. |
| **Custodito, da valutare INSIEME (owner 16/09)** | **Audit indipendente mobile+desktop sul commit pubblico `13f65c1`**: 10 finding, 33 task, 73 fonti, script di riproduzione; in `TALOS-RICERCHE/2026-09-16-talos-audit-indipendente-mobile-desktop-13f65c1.zip` (+ copia, impronte in `IMPRONTE.txt`). ⛔ Non ancora valutato — ma **TUTTO dentro questa tabella** (owner 16/09: «niente deve rimanere fuori»): i 10 finding e i 33 task stanno in **FASE 12**, uno per uno, con la proprietà; si riproducono sul banco prima di crederci | FASE 12 |
| **Decisione rinviata dall'owner (17/09: «decidiamo più in là»)** | **Quale copia del kernel è la FONTE.** `kernel:controlla` legge `AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs` (lane mobile, ferma al 06/09, **6.260 righe**) e la lane desktop ne ha **10.025**; il controllo esce 0 anche quando divergono. Finché non si decide: `AVM-harness` (2,3 GB) resta sul disco, io non scrivo sotto `mobile/`, e ogni cura al kernel del desktop va riportata a mano quando la fonte verrà scelta | da riproporre io a fine P0-bis/PO-26 |
| **Debito dell'owner (17/09: «segnalo e lo facciamo dopo»)** | **BC-65 — la compattazione automatica va rivista e resa SUPER ROBUSTA**: l'owner non l'ha mai vista funzionare su sessioni lunghe e teme che comprometta i task a lungo termine. Misurato: nel giro vero del 16/09 è scattata al giro 8 di 10 col 9% della finestra (troppo presto), e sul 4174 il motore del contesto è spento per costruzione. Si lega alla **Fase 9** (corsie 2 e 3: divieto sul server di prova, misure mai prese). Scheda in `CODA-BUG-CRITICI` | dopo le fasi in corso; la ripropongo io |
| **Fuori dal mio scope, altrove** | **La CLI di TALOS** (owner 16/09: «se ne sta occupando un altro agente, è fuori scope»; vive in `AVM-talos-cli-competitive`, con me in contatto diretto se serve). **Il bug dello streaming a blocchi** (il testo si ferma ogni mezzo secondo; owner: «lascia stare, lo faccio risolvere ad altri agenti»). **Il mobile** (sola lettura, lane sua). **La catena di release pubblica** (l'altra sessione). |
| **Debiti trasversali dichiarati** | 12 rossi di parità componenti (ProviderCard, Conversazione, Inspector — mockup vs app, decisione owner) · 49 rossi `baseline-shell` mai indagati · REDUCED-MOTION-02 · `[data-runtime-usage]` scritto dal codice ma assente dalla pagina · timer della striscia senza prova a schermo · cura del titolo non riverificata con un giro vero · `kernel:controlla` rosso in locale (fonte dell'owner divergente: 9.461 righe contro 6.260) e verde in CI per costruzione · i due store `.harness-ui-research`/`.harness-ui-library` da cancellare dal Desktop a fine lavoro (promemoria owner 11/09). |

---

## ⛔ COME SI ESEGUONO — la regola dell'owner del 16/09/2026

> «Sarai coordinatore, code reviewer e orchestratore di **5 agenti Opus 5 high o extra high**, in
> modalità **separata o Workflow a tua scelta**. 5 agenti per singola fase divisa in 5 parti, **o**
> 5 agenti, 1 agente per ciascuna fase. **Al termine di questi limiti procederai inline**, non lo
> dimenticare.»

- **Cinque agenti Opus 5** per fase, sforzo **high** (xhigh sui pezzi più difficili: kernel,
  concorrenza, rendering pesante). Due forme a mia scelta: cinque `Agent` separati su **file
  disgiunti** (o un worktree ciascuno) quando le corsie sono indipendenti; un `Workflow`
  deterministico quando la fase è una pipeline con verifica avversariale.
- **Due schemi di spesa:** una fase divisa in cinque parti, oppure un agente per fase in sequenza.
  Si sceglie per **proprietà dei file**, non per importanza: `frontend/src/legacy/app.js` (20.638
  righe, 602 funzioni) lo tocca **un agente solo** per fase — la corsia marcata 🔒.
- **Finiti i limiti degli agenti: inline.** Non è una fermata.
- **Io non implemento**: divido, scrivo i brief con la riga «cosa esiste già» (che dal 16/09
  include «chi ci sta già lavorando altrove»), assegno i file, rivedo ogni consegna con un
  controllore avversariale per corsia. Restano miei: commit (messaggio **in inglese**, da file,
  senza co-authoring), fusioni, build, consegna sul 4174, giri veri (`glm-5.3-flash`), foto nei due
  temi, richiesta di push.
- ⛔ **Prima di aprire una fase, ogni riga si riaccerta nel codice**, e ogni numero in un brief è
  misurato nel turno in cui lo si scrive. Il 13/09 è costato crediti veri due volte.
- ⛔ `AGENTS.md` alla radice (12/09) dice ancora «i subagenti eseguono solo prove semplici e controlli
  meccanici; non implementano»: è la regola dell'epoca Astra/Codex, **superata dall'ordine dell'owner
  del 13 e del 16/09** per la sessione Claude. Va riscritto in quella riga, in inglese, nel primo
  commit di documentazione utile — non in silenzio.

---

# FASE P0 · Terminale, Browser, Chat, Reasoning, Processi e Agenti — i dieci punti dell'owner

**Da dove viene:** il prompt tecnico consegnato dall'owner il 16/09 («aggiungi come fase P0 questa»),
custodito in `TALOS-RICERCHE/2026-09-16-prompt-tecnico-p0-terminale-browser-chat-reasoning-processi-agenti.md`
(due copie, impronta registrata). **Va prima di tutto il resto.**

**La regola che il prompt impone a ogni punto, e che vale come cancello:** *ricerca tecnica
aggiornata → analisi del codebase → progettazione → implementazione → verifica*, con **confronto coi
concorrenti** (Codex, Claude Code, Hermes, ChatGPT, IDE AI) dove osservabile, **root cause** prima di
toccare, **niente `setTimeout` a nascondere una corsa**, **profiling prima e dopo** dove è
prestazione, e un **report finale** per punto che distingua ciò che è **misurato** da ciò che è
valutazione.

**✅ Piano approvato dall'owner il 16/09** (`C:\Users\Antonino\.claude\plans\binary-launching-ullman.md`):
cinque corsie in un Workflow — **A** terminale (1-3) · **B** browser (4-5) · **C** 🔒 chat: scroll e
rendering (6, 8, xhigh) · **D** timeout (7, xhigh) · **E** colonna destra: Processi e Agenti (9-10) —
ognuna in un worktree suo con regioni di `app.js` dichiarate riga per riga, controllore avversariale
per corsia, fusione mia nell'ordine D, A, B, E, C. **Le root cause sono già misurate nel piano**
(tre esploratori, file:riga): la larghezza del terminale è `index.css:649`; la scheda nuova è la
palette che annuncia `Ctrl T/B/R` senza intercettarli; su xterm 6.0 non c'è né handler dei tasti né
clipboard né menu; il modo Pagina/Testo è globale e riazzerato a ogni cambio scheda (decisione
dell'11/09 ribaltata dal prompt); lo scroll è scavalcato da `scorriAllaBollaAppesa` (otto chiamanti)
e da una guardia invertita; i tetti di durata sono 180 s nel kernel e `timeoutSeconds` 60 s totali,
attivi su locale e non-OpenRouter; il ragionamento chiuso viene parsato a ogni frame; la colonna
destra si ridisegna intera da 34 punti senza tetto; la figlia è senza Markdown e O(n²). **Stato: in
esecuzione dal 16/09** — Workflow `wf_a38b4449-882`, script in
`~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM-harness-desktop/af5c3844-…/workflows/scripts/p0-cinque-corsie-wf_a38b4449-882.js`
(si riprende con `Workflow({scriptPath, resumeFromRunId: 'wf_a38b4449-882'})`: gli agenti già
conclusi tornano dalla cache). Base dei worktree: `4c58c961`. Alla consegna: fusione squash nell'ordine
D, A, B, E, C con messaggi miei in inglese; i worktree delle corsie restano su disco finché non li
ho fusi.

**⛔ FASE P0 — CHIUSA il 17/09/2026 (notte), consegnata sul 4174 — il rapporto, misurato contro valutato**

Tutte e cinque le corsie sono fuse sul ramo (D `9b611182`, A `7388969d`, E `f4507891`, B `5e667b96`,
C `26199280`), più la cura dei sei rossi emersi solo sulla suite intera (`d276450d`) e il pacchetto
consegnato (`99955dbf`). B e C hanno avuto un **secondo** giro di riparazione mirato (un agente Opus 5
high ciascuno, coi verdetti esatti in mano): B ha reso le etichette del pannello di stato sensibili al
cambio lingua a caldo e tradotto «N caratteri»; C ha curato la regressione «apri e richiudi il
ragionamento durante la generazione → resta la prima fetta» (CHAT-LUNGA-P0-07, rosso prima, verde dopo).

| punto | esito | **misurato** | valutato / non verificato |
|---|---|---|---|
| 1 terminale a tutta larghezza | ✅ | pannello = area principale a 1024 e 1440 (cancello in pixel; sweep 26 larghezze: 19 esatte, 7 rientrate ≤44 px nella banda 1580→1820); foto nei due temi: il pannello va da bordo a bordo della colonna centrale | — |
| 2 scheda nuova | ✅ | `Ctrl T/B/R` spariti dalla palette; un toggle per clic anche col cablaggio doppio (unit + browser) | il «clic che apre una scheda» non è mai stato riprodotto: curata la causa plausibile (scorciatoie annunciate e non intercettate) |
| 3 clipboard | ✅ | copia con selezione (Ctrl+C / Ctrl+Shift+C / Ctrl+Insert), incolla (Ctrl+V / Ctrl+Shift+V / Shift+Insert / menu), `Ctrl+C` senza selezione → `^C` alla shell, su PTY finto coi permessi clipboard | non provato con la clipboard di sistema di Windows dal vivo |
| 4 browser robusto | ✅ | macchina a stati per scheda, ritentativi con backoff e `AbortController`, iframe nascosto e non ricostruito, una scheda in errore non tocca le altre (browser-p0 13/13; foto: «La pagina vieta ogni cornice (X-Frame-Options: DENY). Qui sotto c'è il testo che ha letto l'agente» sulla pagina IANA) | la vista viva resta una alla volta per scelta dichiarata |
| 5 Pagina/Testo per scheda | ✅ | stato per id di scheda, A=Pagina B=Testo C=Pagina → A ancora Pagina, e al contrario | — |
| 6 scroll durante la generazione | ✅ | uno scrittore di scroll, un flag; 240 delta con la persona a metà → `scrollTop` invariato; `RunStarted` non riarma (al base tirava giù di 5.334 px); zero `setTimeout` nuovi, due tolti | — |
| 7 nessun tetto al ragionamento | ✅ | via i 180 s del kernel e la deadline totale dell'adapter (al base: 4 token su 12 e interrotta a 5,0 s; curato: 12 su 12 a 13,0 s); un solo failsafe di **inattività** 30 min (`TALOS_GENERATION_IDLE_MS`), commenti SSE = vita, Stop <1 s su fornitore muto (P0-D 20/20) | non provato con un modello LOCALE che ragiona >60 s dal vivo |
| 8 rendering ragionamento / chat lunghe | ✅ con numeri | sessione da 34.026 righe (DESKTOP-BJ9I7OU, mediana di 3): ragionamento vivo collassato **74 → 37 ms**, lavoro per frame **40 → 1 ms**, costo per token piatto (rapporto 240/480 delta **4,06 → 1**), nodi DOM **25.7k → 11.0k**; **al contrario**: aprire una scheda costa **8 → 205 ms** (ora monta a pezzi) e il replay è **374 → 560 ms** con LoAF peggiore 254 → 334 ms | virtualizzazione **non introdotta**, coi numeri scritti; il costo all'apertura e il replay più lento sono il prezzo dichiarato — da guardare in una fase di prestazioni se l'owner lo sente |
| 9 scheda Processi | ✅ | aggiornamento per riga su un rAF (`replaceChildren` sparito), comando parsato con `shell-quote` vendorizzato, icona per famiglia, stato con icona, cwd, uscita, figlia; 1.000 processi finti misurati; foto: `npm test` / `ls -la` / `node --version` / `git status`, «Riuscito · uscita 0» | ⛔ visto in foto: nel replay la durata è «0 s» (i tempi non sopravvivono al registro) e `prova` non compare fra i processi (è un comando anche lui) |
| 10 scheda Agenti | ✅ | figlia col renderer Markdown condiviso, riduzione incrementale, scroll conservato, re-render della madre = 0 (colonna-destra-p0); foto: «Ha fatto 1 giro · 5 chiamate», 1 attrezzo, ragionamento ripiegabile, risposta in Markdown | a 1024 la colonna destra è ripiegata: la figlia non è fotografata a quella larghezza |

**Cancelli sullo stato fuso, da soli:** backend **3056 verdi / 0 rossi / 4 skip** (dopo la cura dei sei: PG-12 e CACHE-08 volevano
«la stessa Response» e il guardiano di D la rimonta per costruzione → guardiano iniettabile, contratti provati separatamente;
BC48-B ×4 erano rossi da `02aff50e`, cioè da PRIMA della P0); kernel **598 + 1 skip**; unit frontend **1122/1122**; cinque
cancelli browser P0 **45 verdi + 1 skip con un worker** (con più worker su un server solo: 2 timeout d'avvio — debito del cancello,
non del prodotto); parità a runtime **15/15** (banco 5477).

**Giro vero sul 4174** (`glm-5.3-flash`, sessione `dc42bc6c`, spazio usa-e-getta nello scratchpad): 14 attrezzi — 4 `shell` in
WSL2 exit 0, `leggi`, `elenca`, `file_edit` (un rifiuto onesto per `old_string` mancante, poi riuscito), `scrivi`, `prova` con
la suite vera (2/2), 2 `naviga` HTTP 200, `delega_sottotask` con figlia `07882cc8` che ha scritto `NOTE.md`; 7 blocchi di
ragionamento (6.505 caratteri), `RunFinished`; 24 foto (2 temi × 2 larghezze × 6 viste) nello scratchpad, 12 ispezionate una per una.

**Trovato guardando le foto, fuori dai dieci punti:** a **1024** la pill del composer tronca «Giri 10» in «Giri 1…» — un numero
tagliato è un numero sbagliato (→ BC-58); i tooltip restano nelle foto dopo il clic (cosmetico); due errori JS «Failed to read
localStorage: the document is sandboxed» nascono **dentro l'iframe della cornice** (pagine terze con script; il nostro
`browser-proxy.mjs:9` dichiara che il proxy dei dev server locali condivide la nostra origine) — attribuiti, non verificati.

**Stato della fusione, 16/09 sera (misurato):** il Workflow è finito — 18 agenti, 0 errori, 4 h 07 min,
5,2 M token. Verdetti dei controllori avversariali: **D approvata** dopo un giro di riparazione (il
failsafe era costruito e non agganciato), **E approvata** al primo passaggio, **A/B/C bocciate** anche
dopo il giro di riparazione per residui piccoli e precisi (A: due numeri di uno sweep sbagliati nei
commenti; B: le etichette dei due pulsanti del pannello di stato non seguono il cambio lingua a caldo, e
«caratteri» non tradotto; C: **regressione vera** — chi apre e richiude il ragionamento durante la
generazione perde il testo, 7.595 su 47.302 caratteri — e un commento che contraddice il file).
⇒ **Fuse sul ramo**: D (`9b611182`), A (`7388969d`, dopo la mia correzione dei due numeri), E
(`f4507891`). Cancelli rifatti da me sullo stato fuso, da soli: suite D+BC-53 **52/52**, unit frontend
**1108/1108**, kernel **598 verdi, 1 skip**. **B e C**: secondo giro di riparazione mirato in corso
(un agente Opus 5 high per corsia, nei loro worktree, coi verdetti in mano); poi fusione B, C, build,
suite backend intera, parity/browser, consegna sul 4174, giro vero, foto, richiesta di push.
⛔ Nota per chi fonde: i worktree C e D sono nati da `3415c030` (non da `4c58c961`); il diff fra i due
su `frontend/src` e `frontend/tests` è vuoto, quindi i numeri di riga valgono; C ha committato foto e
misure in `frontend/artifacts/p0-C/` (da NON portare nel ramo: le misure vanno nel registro).

| # | punto | cosa succede oggi (dall'owner) | finita quando |
|---|---|---|---|
| 1 | **Terminale dal composer a tutta larghezza** | la pill «Terminale» apre il terminale con la larghezza del composer | si apre usando tutta l'area principale, coerente con la sezione dedicata, responsive |
| 2 | **Il terminale a volte apre una scheda nuova** | un clic sul terminale apre ogni tanto una tab del browser | il clic è deterministico: mai una tab nuova, mai un duplicato (`target=_blank`, `window.open`, bubbling, handler doppi, routing) |
| 3 | **Copia/incolla nel terminale Bash** | tasto destro, `Ctrl+V`, selezione e clipboard di sistema non affidabili, in entrambi i terminali | selezione, copia, incolla, menu contestuale e scorciatoie giuste per il sistema operativo, senza perdere quelle native del terminale |
| 4 | **Browser interno robusto** | instabile, molte pagine non si caricano | stati chiari *loading / loaded / error / retrying / unreachable / cancelled*; una tab non compromette il browser; mai uno schermo vuoto senza spiegazione |
| 5 | **Ogni tab ricorda Pagina/Testo** | cambiando tab la modalità si perde | stato per **id di tab**, sopravvive a switch, re-render, navigazione, streaming |
| 6 | **Scroll della chat durante la generazione** | scorrendo verso l'alto la schermata continua a spostarsi | auto-scroll **solo** se si è in fondo; scroll manuale sempre prioritario; niente `setTimeout` |
| 7 | **Nessun limite arbitrario al reasoning** | un tetto in secondi può interrompere ragionamento/streaming | separare *timeout di generazione* da *salute della connessione*; si interrompe solo per Stop, errore del fornitore, socket morto; eventuale failsafe altissimo, configurabile, documentato, lato server |
| 8 | **Rendering del reasoning e delle chat lunghe** | reasoning collassato tenuto tutto nel DOM; re-render dell'intera chat a ogni token; freeze | collassato = niente DOM inutile; espanso = progressivo; streaming isolato; chat da centinaia di messaggi usabili; spinner solo con lavoro vero; **profiling prima/dopo** |
| 9 | **Tab Processi: paginazione, prestazioni, ridisegno** | lista lunga e indistinta di stringhe di comando | paginazione/virtualizzazione scelta **misurando**; ogni riga con tipo, comando, argomenti, cwd, stato, durata, exit code; comandi riconosciuti e formattati (git/npm/python/docker…); icone affidabili con fallback; un aggiornamento non ridisegna tutte le righe |
| 10 | **Tab Agenti: apertura leggera e Markdown** | la conversazione della figlia si apre dentro la chat principale senza Markdown e con costo pieno | apertura veloce e isolata dalla chat principale; lazy load; skeleton onesto; Markdown/code block/reasoning come nella chat, senza duplicare il renderer; switch A→B→C→A stabile; scroll per agente; **profiling** |

⛔ **Il punto 8 e il bug dello streaming a blocchi si toccano ma non coincidono:** quello è
affidato ad altri agenti; qui si lavora su rendering, DOM e re-render. Chi apre il punto 8 legge prima
`archivio/2026-09-16/LEDGER-FLUIDITA-PROMPT-2026-09-15.md` (l'ultima cura al ritmo di streaming) e
si coordina con chi ha in mano il bug, invece di curare due volte lo stesso strato.

---

# FASE P0-bis · La shell chiede davanti a un segreto — **approvata dall'owner il 16/09** («Sì»)

> **17/09 — scelta dell'owner: «entrambi stretto».** (1) **Lista come innesco**, non come barriera: una classe dichiarata di
> percorsi segreti (`.env*`, `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.netrc`, `~/.npmrc`, `~/.docker/config.json`, `*.pem`/`*.key`/`*.p12`,
> `id_rsa*`, il portachiavi di sistema, i nostri `.provider-runtime.json` e le chiavi) applicata al testo del comando `shell` **e**
> a `leggi`: se li nomina, si CHIEDE anche con «sempre». (2) **Confine stretto**: una lettura/scrittura che esce dal workspace e
> tocca un percorso nascosto o sotto la home chiede; nessuna euristica sul contenuto del comando (ogni «chiedi» in più addestra a
> cliccare sì). (3) Mai «nega» di serie. Fonti già lette il 16/09: Docker «AI Coding Agent Horror Stories» (18/05/2026, blocklist
> spedita), Developers Digest (28/07/2026, deny rules per SSH keys e .env), Pillar (20/07/2026: una lista come CONFINE è debole —
> qui è un innesco). Misurato il 17/09: `path-policy.mjs` non ha oggi nessuna grammatica dei segreti (0 occorrenze). Corsia **D**
> della P0-bis, un agente Opus 5 xhigh: `verificaPermessoScrittura` (`talosHarness.mjs:5771`), `path-policy.mjs`, il ramo `leggi`.
>
> **Stato della P0-bis, 17/09 (misurato):** A, B e D **fuse** dopo bocciatura del revisore avversariale e riparazione
> (A `c936f3a8`: il tilde in testa; B `f32673ef`: il cancello di `prova` più stretto di npm nel monorepo; D `6c3db56d`: nella
> sessione PREDEFINITA negava invece di chiedere perché il registro non costruiva il canale di approvazione). Suite backend
> intera da sola: 3146 test, 1 rosso che nessuna corsia vedeva (BC09: rimozioni nude nei test nuovi) curato in `32b6ec6a`;
> kernel 598 + 1 skip. Consegnate sul 4174 e provate con un **giro vero** (`glm-5.3-flash`, sessione `d449a3ca`, PREDEFINITA,
> spazio usa-e-getta con un `.env` finto): `echo '$HOME'; false; echo rc=$?; X=42 sh -c …` → **`$HOME` · `rc=1` · `X=42`** in
> `[sandbox: wsl2]` (BC-54/55); `cat .env` → **due** richieste con la frase «Il comando tocca un file che può contenere chiavi o
> password (.env): vuoi che lo esegua?»: al NO `REFUSED… The command was not run`, al SÌ il file letto (F15); `prova` senza
> `scripts.test` → **`exit 127 · nessuna suite trovata`** (BC-57); ogni risultato porta `avviatoA`, `durataMs` (123 e 156 ms),
> `comando`, `cwd` (OSS-1/2 lato server). **C** (`95f51ed7` sul ramo `p0bis-c`: BC-58, lettura del contratto eventi, OSS-3,
> BC-59) è committata e sotto revisione avversariale; le resta l'ultimo pezzo di F15 a schermo (la frase come motivo della
> scheda di approvazione, `leggi` nel blocco codice, niente «Consenti sempre» davanti a un segreto).
>
> **Esecuzione della P0-bis, dal 17/09:** corsie **A** (shell WSL: BC-54/55/56, xhigh), **B** (prova ed eventi: BC-57, OSS-1,
> OSS-2), **C** (frontend: BC-58, lettura del contratto eventi, OSS-3, **BC-59**), **D** (F15) — agenti separati in worktree,
> revisore avversariale per corsia, fusione mia con la suite intera PRIMA di consegnare.

**Subito dopo la fusione della P0**, come corsia unica con un agente Opus 5 high e il suo
controllore: una **classe di percorsi segreti** aggiunta alla stessa grammatica dei file di controllo
(`ePercorsoDiControllo`, realpath risolto, alias e junction coperti), applicata all'**argomento**
della shell dopo la tokenizzazione che il kernel usa già, che riporta la shell a **«chiedi» anche
quando è su «sempre»** — esattamente come già succede per `.hooks-trust`/`.mcp-trust`/`CLAUDE.md`
in scrittura. Lista di partenza: `.ssh`, `.aws`, `.gnupg`, `.netrc`, `.env*`, `*.pem`, `*.key`,
`id_*`, i portachiavi di sistema. **Finita quando:** con la shell su «sempre», `cat ~/.ssh/id_rsa`
chiede e `npm test` no; una junction verso `.ssh` chiede; provato al contrario; giro vero; **limite
dichiarato** nel report: `grep -r AWS_SECRET ~` non nomina un file segreto e passa comunque (la
difesa lì è D-10E, che pulisce l'ambiente, e il fatto che i segreti di TALOS vivono nel portachiavi).
⛔ Stesso commit da riportare nella copia sorgente del kernel fuori repo. Tocca il kernel nella
regione dei permessi (`ATTREZZI_CON_PERMESSO_PER_ATTREZZO`, `config.mjs:307`; l'esecuzione della
shell in `talosHarness.mjs` ~7831), che nessuna corsia della P0 ha: per questo viene **dopo** la
fusione, non in parallelo.

---

**Dentro la stessa corsia, dall'audit interno del 16/09 (riprodotti sul banco, schede in `CODA-BUG-CRITICI`):**

| riga | cosa | finita quando |
|---|---|---|
| **BC-54** | `wsl.exe --` fa passare la riga da DUE shell: `$HOME`, `$?`, `$X` espansi prima del nostro `bash -lc`, anche negli apici singoli. Cura misurata: `--exec` (`talosHarness.mjs:4268`) | `echo '$HOME'` → `$HOME`, `false; echo $?` → `1`, `X=42 sh -c 'echo $X'` → `42`; test sull'argv + integrazione che gira solo se WSL c'è |
| **BC-55** | `VAR=…`, `export`, `(cd …` finiscono su cmd.exe `[sandbox: none]` perché `primoProgramma` prende il primo token e WSL «non ce l'ha» | i tre comandi del report girano in WSL con `dove: null` e l'esito dice dove; la scelta della sessione (`doveGiranoIComandi`) esposta nell'interfaccia |
| **BC-56** | comando vuoto = `TypeError` non catturato sul ramo Windows, `{  ; }` su WSL | esito `-1` con «Il comando è vuoto», nei due rami |
| **BC-57** | `prova` → `exit 0` senza suite (trascritto `4c3e1649`, app 0.1.13), non riprodotto sul banco | causa trovata con un giro vero su banco; e comunque «nessuna suite trovata in <cartella>» al posto del verde, che conta come NON provato |
| **BC-58** | a 1024 la pill del composer tronca «Giri 10» in «Giri 1…» (owner 17/09: «mettile nella P0-bis») | il contatore non si tronca mai: a 1024, con un numero a due cifre, si legge intero nei due temi (foto) |
| **OSS-1** | nel replay la scheda Processi dice «0 s» per ogni comando: i tempi non sopravvivono al registro | la durata viaggia nell'evento di fine attrezzo (`durataMs`) e al replay si legge da lì; se non è misurata, la riga non dice «0 s» ma niente |
| **OSS-2** | `prova` non compare fra i processi: la scheda elenca solo `shell` | `npm test` lanciato da `prova` è una riga della scheda come le altre, con uscita e durata |
| **BC-59** | nella riga attività della chat compare il nome tecnico `file_edit` (owner 17/09); misurato: `file_edit` ha ZERO voci nelle mappe umane (`nomi-attrezzi.js:30/135`, `conversazione.js:484`, `permessi.js:22`) e la mappa è duplicata in `app.js:2560` | ogni nome che il kernel espone ha un nome umano, un'icona e una descrizione in UN posto solo, con un test di contratto che confronta l'elenco degli attrezzi del kernel con la mappa; la copia in `app.js:2560` sparisce |
| **OSS-3** | due errori JS «Failed to read localStorage… sandboxed» a ogni apertura del Browser su una pagina terza con script (iframe `sandbox`) | misurato da quale frame nascono; se sono della pagina terza, la console della nostra app non li riporta come nostri (o li etichetta); se sono nostri, si curano |

---

# FASE 3-bis · MODALITÀ WORKFLOW — i «Piani di lavoro»

**A cosa serve:** oggi TALOS sa delegare **un** compito a **una** figlia, e il padre si ferma ad
aspettarla. Non sa dividere un lavoro in cinque lavorazioni parallele, non sa impedire che due figlie
scrivano lo stesso file, e se chiudi la app il lavoro in corso è perso. ⇒ Questa fase mette nel
prodotto **il mestiere che oggi fa una persona**.

**Da dove viene il disegno** (piano approvato il 13/09, `binary-launching-ullman.md`): documentazione
ufficiale dei sotto-agenti di Claude Code; Hermes e Codex **letti nel codice** a commit fissato;
soprattutto **Paperclip**, riletto col repository clonato: si prendono i **contratti di esecuzione**,
non il prodotto — checkout a due lucchetti, liveness, decomposizione esatta-una-volta, i due guardiani
distinti («un sottoalbero fermo» non è «un processo vivo ma silenzioso»). ⛔ Le fonti vanno
rinfrescate quando la fase si apre: due settimane qui sono lunghe.

**Le quattro decisioni dell'owner (13/09):** il modello **propone** il piano e l'owner approva ·
budget **opzionale, spento di serie** · **prenotazione dei file** dentro il piano, intersezioni vuote ·
**sopravvive alla chiusura** e riprende.

⭐ **Cosa esiste già, verificato nel codice:** la delega a una figlia è matura, la verifica che una
figlia non menta pure, la scheda «Agenti» funziona, e la Ricerca approfondita ha **già** approvazione
del piano, giornale a sola aggiunta e ripresa dopo un riavvio. Mancano tre cose: aprire più figlie in
un colpo, la coda quando la concorrenza è satura, la prenotazione dei file. ⇒ Il workflow è il
**terzo specchio** di un impianto che esiste.

| corsia | riga | cosa fa | file | finita quando |
|---|---|---|---|---|
| 1 | **WF-1** | il piano è un oggetto: fasi in sequenza, lavorazioni in parallelo, ognuna dichiara **i file che tocca**; due lavorazioni sullo stesso file ⇒ **piano respinto prima di partire** | `src/piano-di-lavoro.mjs` (nuovo) | un piano con file sovrapposti è respinto **prima** di aprire una figlia; uno con file disgiunti passa |
| 2 | **WF-3** | il motore: apre tutte le lavorazioni della fase senza aspettarle una a una; oltre il tetto di dieci figli la undicesima **si accoda** invece di essere respinta | `src/workflow-orchestrator.mjs` (nuovo) | undici lavorazioni con tetto dieci: la undicesima parte quando si libera un posto |
| 3 | **WF-2 + WF-5** | l'attrezzo con cui il modello **propone** un piano senza eseguirlo; il budget opzionale che, se acceso, vale sull'albero intero | `src/kernel/talosHarness.mjs` | il modello propone e non esegue; col budget acceso un piano troppo grande è respinto prima, con quello spento parte |
| 4 | **WF-4** | ripresa dopo la chiusura col **doppio lucchetto**: chi ha il *diritto* di eseguire e quale esecuzione è *viva adesso* sono due campi | `src/session-registry.mjs`, `src/agent-service.mjs`, rotte in `src/http-app.mjs` | piano interrotto, server riavviato, riprende dalla lavorazione non conclusa; due riprese insieme, una sola prende |
| 5 | **WF-6 + WF-7** | a schermo **dentro la scheda Agenti che esiste**, mai una sezione nuova; nessuna lavorazione ferma in silenzio: per ognuna «che cosa la fa avanzare adesso» | `frontend/src/components/inspector.js` | un piano a due fasi si vede partire, avanzare e concludersi nei due temi; una figlia muta compare **ferma con un motivo** |

⛔ Il nome a schermo è «Piani di lavoro», mai «workflow». ⛔ Non si copiano l'organigramma di
Paperclip, le stanze fra agenti di Hermes, né il programma che il modello scrive ed esegue da solo:
qui il piano è **dati approvabili**.

**Subito dopo, e per questo esiste la fase — PO-25:** il pulsante «+» come pannello «Cosa vuoi fare?»
con **procedure guidate** (crea una presentazione, un sito: linguaggio, framework, obiettivo, stack).
Sul mobile oggi tre voci di «Crea» dicono testualmente «Precompila il messaggio»: il pulsante scrive
testo nel composer e si ferma lì. Una procedura guidata è un piano di lavoro che parte da un modello:
senza il motore sarebbe una finestrella che incolla testo con più passaggi. ⛔ Cosa esiste dietro il
«+» sul desktop non è stato misurato: si accerta nel codice quando la riga si apre.

---

# FASE 3-quater · PO-27 — Via la modale «Primo avvio» — **approvata dall'owner il 17/09** («sì confermo rimozione»)

> **Tre DEBITI segnalati dall'owner il 17/09 («segna adesso i bug come debiti»), da fare con PO-27 subito dopo la P0-bis:**
> **BC-62** — aprire la vista Terminale creava una tab in più: ✅ **curato il 17/09** (`e5f4d9b1`: due caricamenti insieme facevano
> partire due POST, la seconda creava una scheda vera; ora volo unico per sessione, con cancello browser), sul 4174, **da confermare
> dal vivo dall'owner**. **BC-63** — la Revisione deve usare lo STESSO componente a schede
> (stile Chrome) del Terminale: un componente condiviso fra Terminale, Browser e Revisione, zero copie. **BC-64** —
> «Visualizza in Esplora file» non apriva niente: ✅ **curato il 17/09** (`0f711a4c`: la politica di processo nascondeva la finestra,
> misurato `Visible=False`), consegnato sul 4174 e **confermato dal vivo dall'owner il 17/09 («ok funziona»)**; l'app installata lo prende alla prossima release.
>
> **Nella stessa corsia di PO-27 (frontend, dopo la P0-bis) entrano i due difetti trovati nelle foto del 17/09:**
> **BC-60** — sotto la risposta tre icone in fila, nessun «⋯», nessun Elimina, nessun tasto destro (`conversazione.js:180-203`):
> finita quando in riga restano al più due azioni, il resto sta nel menu e nel tasto destro con Elimina, nei due temi;
> **BC-61** — il piede della barra laterale mostra l'id grezzo del fornitore («z-ai»): finita quando legge il nome umano dal
> registro dei fornitori, con un test su tutti i fornitori. Schede in `CODA-BUG-CRITICI`.


**Cosa succede oggi, misurato:** la modale è viva (`#veloIntro`, si apre da `/api/v1/setup/stato` in `app.js:21546`,
`apriIntroMockup`), quattro passi (la prima cartella, con quale modello lavori, e due successivi), **18 file di test** la citano
(la saltano scrivendo `talos.harness.desktop.intro.v1 = {esito:'saltata'}`). Tutto ciò che fa esiste già altrove: la cartella dal
«+» e da «Apri cartella con TALOS» in Esplora, il modello dalla pill del composer e dalle Impostazioni. L'owner: «abbastanza inutile».

**Cosa cambia:** la modale sparisce per intero (template, `components/intro.js`, `app.js` 18682-18800 e 21546, il flag
`intro.v1`, la rotta `/api/v1/setup/stato` se non ha altri lettori); al suo posto uno **stato vuoto onesto** della chat — una
riga e due azioni («Scegli una cartella» · «Collega un modello») — che compare solo quando manca la cartella o il modello e
sparisce da solo; i 18 test perdono il salto e ne nasce uno sullo stato vuoto (mai a schermo con cartella e modello presenti).
Skill `frontend-design` caricata, tema Calm rispettato, foto nei due temi a 1024 e 1440.

**Finita quando:** un profilo nuovo apre l'app senza nessuna modale; senza cartella/modello vede la riga con le due azioni e
ognuna porta dove dice; con cartella e modello non vede niente; `grep -rn "intro.v1\|veloIntro" frontend/` → 0. Una corsia,
dopo la P0-bis.

---

# FASE 3-ter · PO-26 — Una cartella dati sola, fuori dal workspace — **approvata dall'owner il 16/09** («PO-26 si»)

> Parte **dopo la fusione della P0** (una fase alla volta): una corsia, un agente Opus 5 high in worktree, con revisore
> avversariale; `server.mjs` e `README.md` sono in mano alla corsia D della P0 fino alla fusione, per questo non prima.

**Cosa succede oggi, misurato:** l'app scrive nella **radice del workspace** nove nomi diversi: `.harness-ui-library`
(`library-store.mjs:55`), `.harness-ui-research` (`research-store.mjs:60`), `.notes-store`, `.tasks-store`, `.memory-store`,
`.harness-ui-plugins`, `.harness-ui-skills`, `.harness-ui-hooks.json`, `.harness-ui-mcp.json` — tutti `join(cartella, NOME)`,
tutti elencati a mano come protetti in `path-policy.mjs:35-40`. L'audit del 16/09 sul Desktop ha lasciato
`Desktop\.harness-ui-library\lib-<uuid>` ×3; l'11/09 l'owner aveva già dovuto ripristinarle dal Cestino per finire BC-21/BC-25.
Lo store delle sessioni invece sta già **fuori**: `%APPDATA%\TALOS\sessions\` nell'app (`TALOS_DESKTOP_DATA_DIR`,
`runtime.mjs:58`), `harness-ui/.sessions-store/` sul 4174.

**Come fanno gli altri (ricerca 16/09/2026):** Claude Code tiene tutto ciò che GENERA in `~/.claude/projects/<percorso
assoluto codificato>/` (una cartella per progetto, dentro un file per sessione; nome troncato a 200 caratteri + hash se il
percorso è lungo; `CLAUDE_CONFIG_DIR` e `CLAUDE_CODE_PROJECT_DIR_NAME` per spostarla) e lascia nel repo solo ciò che la persona
SCRIVE (`.claude/`, `CLAUDE.md`). Codex CLI: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Gemini CLI: `~/.gemini/` per
l'utente, `.gemini/` nel progetto solo per la configurazione.

**La proposta (approvata):** due classi, non una.
1. **Ciò che l'app genera** — libreria, ricerche, note, attività, memoria — va in **`<dati>/workspaces/<slug del percorso
   assoluto>/{library,research,notes,tasks,memory}`**, dove `<dati>` è `TALOS_DESKTOP_DATA_DIR` nell'app e la cartella dello
   store sul server. Per **workspace**, con dentro la suddivisione per sessione dove il dato è di una sessione (le voci della
   libreria portano già `lib-<uuid>`; le sessioni sono già file per id). ⛔ Per sessione soltanto sarebbe peggio di Claude Code:
   la memoria e le note servono alla sessione DOPO, nello stesso progetto.
2. **Ciò che la persona scrive e può voler versionare** — hook, MCP, plugin, skill, `TALOS.md` — resta nel workspace ma sotto
   **una cartella sola, `.talos/`** (che `workspace-info.mjs:134` riconosce già come marcatore di progetto), come `.claude/`.
3. Migrazione automatica e una sola volta all'apertura (se c'è la cartella vecchia, si sposta e si scrive nel registro);
   `path-policy` protegge `.talos/` e basta; il vecchio elenco sparisce.

**Costo:** nove store + `path-policy` + `workspace-info` + i loro test: una corsia sola di un agente, dopo la P0 (non tocca
`app.js`). **Finita quando:** un workspace nuovo, dopo una sessione con libreria/ricerca/note/attività/memoria, ha nella
radice **zero** cartelle nostre oltre a `.talos/` (misurato con `ls -a`), i dati stanno sotto `<dati>/workspaces/<slug>/`,
un workspace vecchio si ritrova i suoi dati al primo avvio, e cancellare `<dati>/workspaces/<slug>/` non tocca il progetto.

---

# FASE 4 · Il motore locale più rapido dei concorrenti

**A cosa serve:** la riga a priorità 1 del 12/09 — «rendere il motore di modelli locali estremamente
rapido e meglio dei competitor». **Il codice è atterrato**, la verifica dal vivo e il confronto no.

**Il numero da battere, già misurato:** PocketPal risponde in **351 ms** con 25 token di sistema; noi
**33,9 s** con un modello e **3,1 s** con un altro, ma con **2.877** token di sistema. In generazione
siamo **2,2× più veloci**. ⛔ Il confronto vale solo a parità di richiesta: eguagliarli spegnendo
l'agente è cambiare prodotto.

| corsia | cosa | finita quando |
|---|---|---|
| 1 | il codice atterrato decide la memoria di lavoro dai parametri del modello e indovina le parole ripetute in anticipo: **nessuno dei due è misurato su un dispositivo vero** | i numeri vengono da una misura sul dispositivo, non da una stima |
| 2 | il confronto vero coi concorrenti, **sulla stessa richiesta** | primo token sotto il secondo con l'agente acceso, oppure il numero vero dichiarato per quello che è |
| 3 | col modello più piccolo il secondo turno si interrompe: il motore **non legge il campo che dice perché la risposta è finita** (`src/kernel/`) | il secondo turno completa anche col modello più piccolo |
| 4 | codici di errore sbagliati: «servizio non disponibile»/«errore interno» per richieste malformate (`src/http-app.mjs`) | ogni codice provato nel verso che lo genera |
| 5 🔒 | tre difetti dell'interfaccia che si contraddicono: un errore vero perde motivo e azione; il server cade e per un minuto barra e chat dicono due cose opposte; il suggerimento del composer sopravvive alla sessione (`legacy/app.js`) | i tre riprodotti e chiusi, ognuno con la sua fotografia |

---

# FASE 5 · La lingua, le etichette e i numeri

**A cosa serve:** l'app è bilingue per sbaglio: README inglese con foto italiane, pulsanti inglesi in
mezzo a testo italiano. **Misurato:** nella pagina costruita **sei sole etichette** sono traducibili;
barra laterale e pannello destro sono testo italiano scritto nel codice ⇒ una schermata inglese oggi
**non esiste**, non c'è il meccanismo.

| corsia | cosa | finita quando |
|---|---|---|
| 1 🔒 | la traduzione copre tutta l'app (oggi la sola barra laterale), compresi Agents, Hooks, Skills, Plugins, MCP. **Nello stesso giro: togliere i temi Paper, Claudius e Basicus** (owner 13/09, «non mi piacciono»). Misurato: 14 temi, elenco in **due posti**, ogni tema vive in **otto posti** (scene animate parallele per posizione). ⛔ Due conseguenze da mettere davanti all'owner prima: i temi chiari restano **uno**; chi ha salvato uno dei tre resta con un tema che non esiste ⇒ serve una migrazione (PO-22) | cambiando lingua cambia tutta la pagina, provato nei due versi; i tre nomi spariti dagli otto posti, scene a undici, profilo migrato, anche al contrario |
| 2 | un solo posto per i nomi umani; ⛔ i nomi che riceve il **modello** non si toccano (contratto col motore) | zero nomi tecnici a schermo, contratto invariato |
| 3 | numeri che non tornano: **tre numerazioni dello stesso giro** nella stessa schermata; il cursore del ragionamento promette **sei livelli**, il modello ne ha **tre** | un solo numero di giro, livelli veri |
| 4 | frasi del mockup e identificativi grezzi rimasti a schermo; ricerca senza risultati che mostra una lista vuota col contatore fermo | nessuna stringa del mockup, il vuoto dichiarato a parole |
| 5 | le fotografie del README, **in inglese**, ognuna col sì esplicito dell'owner una per una (`README.md`, `docs/immagini/`) | ogni foto approvata per nome nel manifesto |

---

# FASE 6 · Le sezioni con un elenco

**A cosa serve:** difetti trovati provando l'app sezione per sezione l'11/09; nessuno drammatico da
solo, insieme fanno sembrare il prodotto sciatto. ⛔ **Ogni riga va riaccertata nel codice prima di
aprire**: la Fase 3 ha rifatto la selezione e le liste, molte premesse sono cambiate.

| corsia | cosa | finita quando |
|---|---|---|
| 1 🔒 | Libreria scrive sempre «0 file · Token non disponibili»; Memoria divisa per **genere** invece che per **strato**; Attività senza **chi** ha fatto la cosa (`legacy/app.js` e le sezioni) | ogni sezione mostra il numero vero e l'autore vero |
| 2 | **sul proprio messaggio non si può fare niente.** Misurato il 13/09 (e corretta una mia misura sbagliata): **tre azioni sulla risposta del modello, zero sul messaggio della persona** — niente modifica, elimina, nemmeno copia. Il mobile con la pressione lunga ne ha almeno due: qui siamo **dietro**. Trovato dalla lane mobile provando a **disfare** un invio — la domanda di una persona vera. Un messaggio di prova è rimasto nella chat dell'owner: si dichiara, non si «risolve» cancellando la conversazione | si modifica e si elimina un proprio messaggio dal menu della bolla, la sessione conserva la modifica; al contrario, eliminare un messaggio altrui o già usato dal modello è rifiutato con un motivo |
| 3 | il rapporto e le fonti della ricerca approfondita non si aprono dall'interfaccia | rapporto e fonti si aprono da una ricerca vera |
| 4 | la prima sessione di chi apre l'app la prima volta: modale a due colonne, progetti senza conteggio, «Planner opzionale» di un'altra epoca, manca la riga totale attrezzi/costo per giro. ⛔ **E rifare la modale del primo avvio** (owner 13/09: «deve seguire le linee guida delle modali intro moderne 2026, ui super smooth e setup veloce»). Misurato: componente di **296 righe, quattro passi**, legge dati veri e porta già la ricerca del 06/09 (primo valore nel minor numero di passi, si può saltare). ⛔ Due cose morte attaccate: la vecchia modale (**176 righe** senza chiamanti) e un commento verso una funzione inesistente. ⛔ Serve la ricerca sulle linee guida 2026, con fonte e data, prima di disegnare (PO-24) | provata da **profilo vergine**, con contati passi e secondi fino al primo messaggio utile; provata saltando tutto; foto nei due temi e due larghezze; niente commenti verso funzioni inesistenti |
| 5 | copertura dei permessi per attrezzo: il foglio ne elenca **cinque**, gli attrezzi sono **43**; `config.mjs` ammette **sei** override (compreso `file_edit`, commit `4e8bfd6d`) — i numeri storici non sono requisiti | ogni attrezzo del catalogo corrente dichiara la policy applicata; gli override provati nei due versi |

---

# FASE 7 · L'installatore con una vera interfaccia

**A cosa serve:** oggi l'installatore è un colpo solo. L'owner vuole quello di Hermes: schermate e il
passo del **consenso**. ⛔ Misurato: l'installatore attuale **non può ospitare pagine**: va sostituito
con quello assistito. ⛔ I lavori di disegno non si fanno in parallelo (installatore, finestra,
assistenza condividono superfici e parole): uno per fase.

**Cosa è cambiato dal 13/09:** la **0.1.13 pubblica ha già una pagina di disinstallazione** con la
spunta «mantieni/elimina dati e chiavi» (PR #20), fatta dall'altra sessione. ⇒ La corsia 1 **parte
da lì**, non da zero.

⛔ **16/09 — la corsia 1 (PO-17) è in mano alla sessione «talos cli»**, su via dell'owner: lavora in
un worktree suo basato su `public/main` (0.1.13, `13f65c1`) e mi consegna patch + dossier da
integrare nella lane privata. Ha già diagnosticato il conflitto NSIS di una pagina welcome con
`System::Call` (`allowOnlyOneInstallerInstance.nsh` → `getProcessInfo.nsh`) e i warning che con
`-WX` diventano errori. Io non tocco `harness-ui/desktop/` finché non consegna. ⛔ **Bersaglio
cambiato dall'owner il 16/09** (riportato da quella sessione): non più «assistito + licenza + barra
laterale» ma **una finestra disegnata da noi con pagine nsDialogs, il più uguale possibile al mockup,
col tema Calm di TALOS, «come Hermes»** — cioè proprio la strada del conflitto `System::Call`, per
cui la cura della 0.1.13 (`56b990d`, `!ifndef BUILD_UNINSTALLER` sulla dichiarazione) è la pista. **Difetto della
mia lane, verificato il 16/09:** `desktop/tests/installer.spec.mjs:39-40` pretende ancora
`dist/TALOS-Setup-0.1.0.exe`/`TALOS-0.1.0-win.zip` mentre la versione è avanzata — quel cancello
fallirebbe sulla propria precondizione su un pacchetto fresco: si cura nella stessa consegna.

| corsia | cosa | finita quando |
|---|---|---|
| 1 | l'installatore assistito col consenso. **Nello stesso giro: l'icona del desktop su fondo pieno** (owner 13/09, con foto: «prendere tale e quale l'icona della app mobile»). Misurato: il file ha **due sole misure** (256 e 32); Windows usa la **48** per il collegamento, che non c'è ⇒ sgrana. L'icona mobile è a **due strati** e vettoriale: si prendono i due strati e si **ridisegna**, non si copia (margini Android sbagliati su Windows); un generatore esiste già. Due scelte all'owner: una icona o una per tema; quale fondo, guardato su chiaro **e** scuro (PO-23) | un'installazione vera dal vivo col consenso che blocca se rifiutato; il file con **tutte** le misure di Windows contate aprendolo; il collegamento fotografato su chiaro, scuro e a 16 px |
| 2 | un cancello che esiste e non gira: il comando delle verifiche non invoca quella dell'interfaccia | il comando la invoca, provato nel verso che deve fallire |
| 3 | codice morto misurato: una funzione di ~**180 righe** senza chiamanti, uno schermo irraggiungibile, **12 veli** che nessuno apre, due coppie di funzioni doppie, librerie esterne che nessuno carica | rimosso o ricollegato, dicendo quante righe |
| 4 | lo script di costruzione copia la cartella pubblica dentro una cartella ignorata dal repository | la copia serve e va altrove, o non serve e va tolta |
| 5 | accessibilità: in tutta l'app **non c'è una trappola del fuoco** — con Tab si esce dalla modale e si finisce nella pagina dietro | il fuoco resta dentro una modale aperta, provato da tastiera |

---

# FASE 8 · La finestra dell'app come interfaccia

**A cosa serve:** rifare la finestra desktop perché sia un'applicazione vera e non un browser
travestito, col riferimento visivo di Hermes. ⛔ **Una interfaccia nuova non nasconde funzioni che
esistono**: prima l'inventario di cosa fa oggi, poi ogni voce si ritrova o si segna come scelta.

| corsia | cosa | finita quando |
|---|---|---|
| 1 🔒 | la finestra (guscio e `legacy/app.js`) | inventario prima e dopo, nessuna funzione sparita |
| 2 | i segreti che viaggiano dove non dovrebbero: gettone e chiave di firma **nell'ambiente del processo** che esegue i comandi, quindi leggibili da qualunque comando. ⭐ La **0.1.13 pubblica ha già** un gate sul seme d'ambiente per la chiave OpenRouter (PR #22): riaccertare cosa resta scoperto. ⛔ **Misurato il 16/09 (segnalazione della lane CLI, riga F15, riprodotta in forma desktop):** `leggi` è confinato al workspace (`path-policy.mjs`) e rifiuta `~/.ssh/id_rsa`; la `shell` ha solo la policy per attrezzo (`config.mjs:307`) e D-10E le toglie i segreti dall'**ambiente**, ma **nessuno esamina l'argomento del comando** — con la shell su «sempre», `cat ~/.ssh/id_rsa` o `grep -r AWS_SECRET ~` passano dove `leggi` si ferma. ⛔ **Decisione dell'owner** (non una cura da corsia): una classificazione dei percorsi segreti sull'argomento (`.ssh`, `.env`, `.aws`, `.netrc`, chiavi) che riporti la shell a «chiedi» anche quando è su «sempre», come già fanno i file di controllo | nessun segreto nell'ambiente di un figlio, provato leggendolo davvero; e la shell che legge un segreto **chiede**, provato al contrario |
| 3 | il terminale: l'uscita arriva **tutta insieme alla fine** invece che mentre scorre; il comando `!` **non funziona mentre il modello lavora**. (D-10C, l'ordine dei due flussi, è chiuso con prova nella coda del 10/09: non si riapre senza riprodurlo.) ⛔ Si coordina con la **Fase P0 punti 1-3**, che tocca lo stesso terminale: una fase sola tocca quei file per volta | streaming durante l'esecuzione; `!` a modello occupato |
| 4 | dove gira davvero un tuo comando (il sottosistema Linux, non dichiarato: percorsi sorprendenti) e la copia del motore lì presente, coi suoi difetti | dichiarato a schermo e nei percorsi |
| 5 | il segnavia che non si muove sul Chrome dell'owner («rompicoglioni»). ⛔ Misurato **nel suo browser con l'accelerazione accesa**, non in quello senza finestra | riprodotto e chiuso con la foto |

---

# FASE 9 · Le righe che erano date per chiuse e non lo sono

| corsia | cosa | finita quando |
|---|---|---|
| 1 | accessi ai fornitori: uno collegato **a metà** (manca il giro vero); **ChatGPT e Claude a zero**, non c'è il codice | un giro vero per ciascuno, coi limiti dimostrati |
| 2 | ⛔ **decisione owner:** la compattazione del contesto è fatta e provata, ma sul server di prova è **vietata per costruzione**; togliere quel divieto è togliere una guardia scritta apposta | l'owner decide |
| 3 | le misure che la compattazione doveva portare: acceso/spento, latenza (una sola misura: **61,2 s** al primo token, fuori bersaglio), riuso della cache (il 40% attuale è finto), costi prima/dopo, un ritorno indietro **eseguito**, annullamento mentre scorre | i numeri veri, dichiarati |
| 4 | fornitori aggiuntivi (P-D…P-L implementati, mancano i giri reali senza credenziali e il fallback), l'agente esterno ACP (non chiude PO-15, la delega esterna completa), GitHub (PO-16) | giri reali; PO-15 e PO-16 distinti e chiusi |
| 5 | il registro dei numeri: le proposte si numerano in **due documenti senza registro unico**, e ha già prodotto una collisione | un registro solo |
| poi | **BC-52 — attrezzi su richiesta** (approvato 13/09): esporre gli strumenti caricando gli schemi quando servono; prima contratto, policy e compatibilità dei provider; dopo PO-15, PO-16 e l'A/B del preambolo; un lotto suo, non un sesto agente | strumenti ancora usabili dal composer, compatibilità provata, confronto misurato |

---

# FASE 10 · Le grandi mai iniziate

Nessuna è cominciata, e dichiararlo vale più di tenerle in una lista che sembra in corso:

- **il controllo del computer dentro TALOS** — ricognizione, confronto coi concorrenti, prove sul
  sistema vero, ritorno indietro;
- **i comandi dell'agente dentro il Terminale** — decisione owner dell'11/09, mai aperta (⛔ tocca il
  terminale della P0: si coordina);
- **la voce a due vie nell'API** — «non urgente ma interessantissima»;
- **lo spazio su disco** — cartella dei progetti e scratchpad da diversi giga;
- **le intestazioni di licenza nei sorgenti** — era di Astra dal 19/09; da riassegnare.

---

# FASE 11 · Portare nel mobile ciò che il desktop ha già

Owner 12/09: analisi **in sola lettura** dell'harness desktop e porting nel mobile di ciò che manca,
«estremamente dettagliata e delicata». Piano in `C:/Users/Antonino/Desktop/projects/AVM/.claude/PIANO-DEBITI-E-IMPLEMENTAZIONI-2026-09-12.md`
(sezione D). ⛔ Il metodo va confermato dall'owner prima di aprirla; nessuna scrittura in `mobile/`.

---

# FASE FINALE · L'evoluzione ricorsiva — «Aggiungi a TALOS questa funzione»

**Da dove viene:** la «TALOS Recursive Evolution Architecture — Design Proposal v1.0» (Design Freeze,
solo desktop, 64 sezioni), consegnata dall'owner il 16/09 con l'ordine esplicito **«da mettere alla
fine delle nuove implementazioni»**. Custodita in `TALOS-RICERCHE/2026-09-16-talos-recursive-evolution-architecture-v1.0.md`
(due copie, impronta registrata). ⇒ È l'**ultima** fase: non si apre prima che le precedenti siano
chiuse.

**Cosa propone, in una frase:** TALOS che, da una frase in chat, **progetta, scrive, costruisce in
isolamento, verifica, attiva a caldo, conserva e sa ritirare** una propria nuova funzione — sotto un
nucleo piccolo e immodificabile (l'*Evolution Supervisor*, Rust) che tiene autorità, sicurezza,
verifica e recupero. Il principio che regge tutto: **TALOS può inventare nuova capacità
computazionale, ma non nuova autorità** (`Authority(n+1) ⊆ Envelope(owner)`); chi propone una
modifica non è chi la dichiara valida; una policy cambiata si giudica con la policy **precedente**;
ogni evoluzione è reversibile; una firma prova chi ha prodotto una cosa, non che sia corretta; nessun
dato (memoria, pagina web, output di un attrezzo) può concedere privilegi.

**La prima milestone, e non è «TALOS riscrive il core»** (§57):
`chat → nuova feature → vero codice → build → sandbox → verify → hot activate → persist → rollback`,
nell'app installata. Il criterio di breakthrough (§63): installazione fresca, «Aggiungi X», la
funzione compare, si usa, sopravvive al riavvio, si ritira e resta la ricevuta — **senza che nessuno
apra un IDE, copi un plugin, modifichi un sorgente o riavvii a mano**.

**Cosa NON si fa nella prima architettura** (§61): AGI, auto-modifica del Supervisor, prova
matematica generale dell'utilità, tutto il codice formalmente verificato, cloud come requisito, dati
privati trasformati in training, obiettivi ultimi ridefiniti da TALOS.

**Le sette ondate dopo la prima** (§58): runtime self-evolution · evoluzione guidata dall'evidenza ·
popolazione/meta-evoluzione · evoluzione cognitiva · federata · verifica ad alta assurance.

⛔ **Prima di aprirla:** rileggere il documento per intero (non questo riassunto), rinfrescare la
ricerca (Wasm Component Model/Wasmtime, AppContainer, Kani/Verus, SLSA, TPM), e scomporre in corsie
a file disgiunti partendo dal §57. Il Supervisor in Rust è una decisione di **prodotto e di
piattaforma** che spetta all'owner, non a una corsia.

---

# ✅ REGISTRO DEL CHIUSO — una riga, la prova, dove sta il dettaglio

| cosa | chiusa da | dettaglio |
|---|---|---|
| **Fase 0 · il rilascio** | `desktop-v0.1.5` pubblica il 13/09 (tre asset, attestazioni); poi 0.1.7, 0.1.8, 0.1.10, 0.1.13 | `archivio/2026-09-16/` (RAPPORTO-R0x, LEDGER-R04, REPORT-PRE-RELEASE, RIALLINEAMENTO-ROADMAP) |
| **Fase 1 · il prodotto smette di mentire** | 13/09, cinque corsie, tre giri di review (`e5d67533`, `bfed1dfd`, `f9e5972c`, `412b36d7`, `1aa816de`); residui: `research_list` (poi chiuso in Fase 3), taglia pagina duplicata, parti BC-07 | archivio |
| **Fase 2 · scrivere mentre il modello lavora** | 13-14/09: coda **della sessione** (`4d3208a5`), reindirizzamento pulito e riconoscitore italiano (`1109156b`, `dcfdfc40`), delega figlie (`53b78013`), guardie riprovate al contrario (`3bfd0843`), il modello **modifica** un file (`4e8bfd6d`), i difetti delle foto (`40602263`) | TACCUINO 13-14/09; `RICERCA-FASE-2-REINDIRIZZAMENTO` in archivio |
| **Audit — le tre zip** | F01 confermato dal vivo e chiuso (`7879d81d`); F02-F07 (`f19edd6a`, `850bf0ec`): trust files, export binario, backlog PTY, PTY viva, scheduler single-flight, MCP concorrente opt-in; suite 3003/3007, 14 rotture al contrario. Overlay: candidato per una fase prestazioni (mai aperta). Audit kit: archiviato senza implementare | TACCUINO 14/09 |
| **Release desktop 0.1.6→0.1.8** | 0.1.6 morta ai cancelli (tre test che descrivevano la macchina), 0.1.7 sul privato, **0.1.8 pubblica** il 14/09 22:08Z con asset verificati; note di rilascio che portano il changelog, in inglese (`f287f68f`, `c8a300dc`) | TACCUINO 14/09; archivio |
| **Fase 3 · fare le cose in blocco** | 15/09, `3415c030` (+ pubblico `76f8c8c`): batch unico `POST …/:resource/batch` su cinque collezioni (250 id, esito per voce, 214 provate con una richiesta), selezione condivisa, guardia sui **tre** tool paginati (non quindici: censimento corretto), banco exporter rifatto (15/15, 2.224 rinomine), assistenza con fonti reali e «non lo so»; server 3.012/3.016, kernel 598/598 | `archivio/2026-09-16/LEDGER-FASE-3-2026-09-15.md` |
| **Streaming fluido + Prompt Enhance** | 15/09 (altra sessione): via l'arretrato del ritmo 140-160 car/s, `Copia`, `Sostituisci` esatto — pubblicato nella 0.1.8. ⛔ L'owner vede **ancora** lo streaming a blocchi il 16/09: è un altro strato o è aperto; lo giudica chi ha in mano il bug | `archivio/2026-09-16/LEDGER-FLUIDITA-PROMPT-2026-09-15.md` |
| **Gate rossi del pubblico** | 15/09 (altra sessione): CI pubblica verde su 7 gate, PR #12 e #9-#11 fuse, split desktop-core/desktop-ui | `archivio/2026-09-16/REPORT-GATE-ROSSI-TALOS-2026-09-15.md`, `LEDGER-GATE-MAIN-2026-09-15.md` |
| **`cd` su Windows che non persisteva** | `3d292939`, 16/09 — segnalato dalla sessione «talos cli», riprodotto prima di curare: `staccaCartellaFinale` leggeva la prima riga dopo il marcatore, ma la coda Windows (`echo.`) va a capo e la coda POSIX (`printf`) no ⇒ `cartellaFinale: null` con CRLF **e** con un solo LF (non era il `\r`). Cura: prima riga **non vuota**. 5/5 in un file di test proprio, kernel 598/598, rottura al contrario 2 rosse, sha256 identico. ⛔ Da riportare nella copia sorgente del kernel fuori repo | TACCUINO non aggiornato: il commit è la prova |
| **Le memorie superate** | «un agente alla volta», «niente più deleghe», «delega ad Astra», «stato release a cinque blocchi»: marcate storia negli indici il 13-14/09; la regola viva è quella del 16/09 qui sopra | indici di memoria |
| **Documenti** | 380 voci spostate in `archivio/2026-09-16/` il 16/09 (prompt e consegne ad Astra, dossier, ledger e rapporti delle righe chiuse, foto 11-13/09, patch mai applicate); restano vivi tabella, taccuino, indici, code, regole e i 23 documenti citati dal codice | `archivio/2026-09-16/INDICE.md` |

# FASE 12 · L'AUDIT INDIPENDENTE sul commit pubblico `13f65c1` — tutti i 10 finding e i 33 task (owner 16/09: «niente deve rimanere fuori»)

Fascicolo custodito in `TALOS-RICERCHE/2026-09-16-talos-audit-indipendente-mobile-desktop-13f65c1.zip` (+ copia,
impronte OK). **Non ancora valutato**: si apre insieme all'owner. Qui sta l'inventario completo, così nessuna riga vive
solo nello zip. ⛔ Ogni finding si **riproduce sul banco prima di crederci** (l'audit interno dello stesso giorno aveva
tre accuse vere su sette, e una «vera» con causa sbagliata). La proprietà è quella delle lane: **desktop = mia**,
**mobile = lane mobile** (io leggo e segnalo, non scrivo), **condiviso = da decidere con l'owner**.

## I 10 finding

| id | lane | gravità (loro) | cosa dicono | dove tocca la nostra roadmap |
|---|---|---|---|---|
| **F01** | desktop | High | la preview locale eredita l'autorità web di TALOS (same-origin) | corsia **B** della P0 (browser: cornice/proxy/vivo) e `http-app.mjs` rotte `/api/v1/browser/*` — si valuta DOPO la fusione P0, sul codice nuovo |
| **F02** | mobile | High | la policy HTTP locale non è applicata nel percorso provider letto | lane mobile |
| **F03** | mobile | Medium | il parser SSE non rispetta framing e campi `data:` multipli | lane mobile (il kernel desktop ha il suo parser: da confrontare, non da copiare) |
| **F04** | desktop | Medium | il tetto del proxy arriva dopo il buffering e misura caratteri, non byte | `browser-proxy.mjs` — parente di BC-53 (tetto in byte, prima del buffer) |
| **F05** | mobile | Medium | il budget first-byte non include l'attesa degli header | lane mobile — stessa famiglia della corsia **D** della P0 (timeout) |
| **F06** | mobile | Medium | il retry non ha deadline complessiva né cancellazione dell'attesa | lane mobile — idem |
| **F07** | desktop | Medium | il proxy verifica i redirect soltanto dopo averli seguiti | `browser-proxy.mjs`/`browser-proxy-universale.mjs` — da confrontare con `naviga` (DNS pinning e camminata sui redirect già portati dal mobile) |
| **F08** | condiviso | Low | il perimetro delle dichiarazioni di licenza è ambiguo | catena di release (LICENSE, notices) |
| **F09** | desktop | Medium | il quick start desktop contraddice i manifest presenti | README + CI (T09.1: «il quick start diventa un test») |
| **F10** | desktop | Improvement | la distribuzione Windows dichiara eseguibili non firmati | catena di release pubblica (firma) — decisione di prodotto dell'owner |

## I 33 task, nelle loro 11 fasi (0–10), con la proprietà

| id | fase | P | sforzo | titolo | finding | lane |
|---|---|---|---|---|---|---|
| T00.1 | 0 misurazione e baseline | P1 | M | chiudere l'inventario e fissare la provenienza | — | condiviso |
| T00.2 | 0 | P1 | M | portare le riproduzioni nel runtime supportato | F02–F06 | mobile + desktop |
| T00.3 | 0 | P1 | M | strumentare i percorsi critici senza payload sensibili | — | mobile + desktop + context-engine |
| T01.1 | 1 | **P0** | S | contenere la preview same-origin | F01 | desktop |
| T01.2 | 1 | P1 | M | applicare la policy provider ai due trasporti | F02 | mobile |
| T01.3 | 1 | P1 | M | correggere framing SSE e limite byte del proxy | F03, F04 | mobile + desktop |
| T02.1 | 2 | P1 | L | costruire la preview isolata | F01 | desktop (`main.mjs`, `browser.js`, `browser-proxy.mjs` — è la strada `WebContentsView` che la P0 ha lasciato fuori) |
| T02.2 | 2 | P1 | M/L | rendere deadline e abort contratti end-to-end | F05, F06 | mobile |
| T02.3 | 2 | P1 | M | chiudere il confine redirect/DNS per tipo di client | F07 | desktop |
| T02.4 | 2 | P1 | XL | audit approfondito dei confini privilegiati ancora aperti (terminal-ws, kernel, hook, MCP, plugin, keystore) | — | desktop + mobile |
| T03.1 | 3 | P2 | M | formalizzare confini e contratti condivisi (ADR) | F01, F02, F05, F06 | condiviso |
| T03.2 | 3 | P2 | L | estrarre famiglie di rotte da `http-app.mjs` mantenendo il contratto | F01, F07 | desktop |
| T03.3 | 3 | P2 | M | mappare duplicazioni canoniche e build-time (kernel copiato in `mobile/android/…/assets`) | — | condiviso — è la divergenza «il kernel è uno solo» già nota |
| T04.1 | 4 | P2 | M | verificare backpressure e shutdown del worker SQLite | — | context-engine |
| T04.2 | 4 | P1 | L | qualificare migrazioni, recovery e restore | — | context-engine + mobile |
| T04.3 | 4 | P2 | M/L | qualificare query, export e limiti delle risorse | — | context-engine + desktop |
| T05.1 | 5 | P2 | L | separare stato di operazione da rendering | F03, F05, F06 | mobile + desktop (`browser.js`: la macchina a stati per scheda della corsia B) |
| T05.2 | 5 | P2 | L | qualificare invalidazione e concorrenza del client | — | mobile + desktop |
| T05.3 | 5 | P2 | M | misurare e ridurre il grafo di avvio | — | mobile + desktop |
| T06.1 | 6 | P2 | M | rendere visibili destinazione, autorizzazione e reversibilità | F01, F02 | mobile + desktop |
| T06.2 | 6 | P2 | M | ridisegnare attesa, retry e recupero | F03, F05, F06 | mobile + desktop |
| T06.3 | 6 | P2 | L | qualificare design system e accessibilità | — | mobile + desktop |
| T06.4 | 6 | P2 | L | completare benchmark Android e ricerca sui journey | — | mobile |
| T07.1 | 7 | P2 | M | profilare le operazioni peggiori per piattaforma | — | mobile + desktop |
| T07.2 | 7 | P2 | L | ottimizzare rendering e I/O dove serve | — | mobile + desktop + context-engine |
| T08.1 | 8 | P1 | L | gate di sicurezza sul confine reale | F01, F02, F04, F07 | mobile + desktop |
| T08.2 | 8 | P1 | L | conformità, fault injection e contratti API | F03–F06 | mobile + desktop + context-engine |
| T08.3 | 8 | P1 | L | accettazione del prodotto pacchettizzato | F10 | desktop (release) + mobile (android) |
| T09.1 | 9 | P2 | S | rendere il quick start un test | F09 | desktop (README, CI) |
| T09.2 | 9 | P2 | M | chiarire licenze, notices e distinta delle dipendenze | F08, F10 | condiviso |
| T09.3 | 9 | P2 | L | qualificare dipendenze e provenienza della release | F10 | desktop (release) |
| T10.1 | 10 | P3 | L/XL | ottimizzazioni avanzate solo dopo baseline stabile | — | tutti |
| T10.2 | 10 | P1 | XL | chiudere la copertura dell'audit e rivalutare le priorità | — | condiviso |

**Come entra nel lavoro:** alla valutazione insieme, ogni riga riceve uno di tre esiti — **riprodotto → in una fase di
questa tabella** (con corsia e proprietà dei file, intersezioni vuote), **smentito dal banco → nel registro «chiuso senza
difetto» con la prova**, **mobile → segnalato alla lane mobile** con file:riga. Nessuna riga può restare «nello zip».

---

## Chiuso senza difetto — «abbiamo guardato e non c'è»

- L'attesa di una prova in una fase del ciclo diversa da quella del componente (trovato dal mobile):
  da noi i componenti delle frecce sono sincroni, nessun temporizzatore.
- D-10C (ordine stdout/stderr): chiuso con prova nella coda del 10/09; non si riapre senza riprodurre.
- Corsia 4 della Fase 1 (terminale in basso): **premessa falsa**, era già consegnato.

---

# Cosa resta fuori da ogni fase, e perché

| cosa | perché |
|---|---|
| La cartella `C:/c` sul disco dell'owner | nata da un percorso Unix passato a PowerShell; contiene anche file non miei: non la tocco |
| Un processo da **1.979 MB** vivo dal 10/09 | risalita la catena: **non è orfano**, è appeso a un albero vivo. Decide l'owner |
| La pulizia di fine lavoro | due store sul Desktop, scratchpad, worktree vecchi, cartelle di costruzione: solo al suo sì, misurando prima |
| I tre commit e i due test dell'altra sessione nel worktree privato | lavoro altrui in corso: si dichiara, non si committa né si scarta |
