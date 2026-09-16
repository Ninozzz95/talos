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
