# Piano implementativo — Model Lab mobile tranche correttiva pre-Fase 5

Data: 2026-08-05
Owner esecutivo: main agent, lane `mobile`
Stato: IN PROGRESS — Slice A, B e C chiuse; Slice D ed E aperte
Commit/push: vietati dal root `AGENTS.md`
OAuth: `DEFERRED`, non parte al termine automatico di questo piano

Riferimenti:

- ricerca: `../research/2026-08-05-model-lab-corrective-tranche-research.md`;
- design: `../specs/2026-08-05-model-lab-download-center-local-compatibility-design.md`;
- ledger: `../ledgers/2026-08-05-model-lab-corrective-tranche-ledger.md`.

## 0. Regole di esecuzione

1. Una sola slice `in_progress`.
2. Ogni comportamento nasce da un RED nominato.
3. Ogni regressione scoperta diventa scenario permanente prima della fix.
4. Nessuna dipendenza nuova e nessun aumento budget.
5. Nessuna modifica fuori `mobile`.
6. Il baseline corrente è zero GGUF perché l'owner li ha eliminati
   intenzionalmente; questa assenza non è un bug e nessun futuro modello owner
   può essere usato o eliminato dalla campagna.
7. La campagna usa un solo GGUF temporaneo per volta.
8. Ogni slice termina con screenshot sul dispositivo fisico; senza screenshot
   resta al massimo `GREEN UPSTREAM`.
9. Override telefono e forward ADB task-owned sono ripristinati/rimossi in
   `finally`; il forward estraneo `tcp:9223` viene preservato.
10. Il tree sporco Fasi 3/4 viene preservato senza stash/reset/revert.

## 1. Slice A — Settings e gerarchia

Stato esecutivo 2026-08-05: **CLOSED — GREEN DEVICE + REVIEW GREEN**.
Le prove fisiche e i risultati finali sono nel manifest correttivo e nel
ledger; questa slice non va riaperta senza una regressione nominata.

### A1 — RED

- cambiare `settingsGroups.test.ts` perché pretenda `models` come prima
  destinazione di Intelligence;
- cambiare `settingsTabs.test.ts` mantenendo parse compatibility ma non
  esclusione visuale;
- cambiare `TalosMobileSettingsCenter.test.ts` perché account preceda Model
  Lab a phone/tablet e non esista nessun tablist;
- estendere l'E2E settings/model navigation con ordine DOM e route reale.

Fallimento atteso: link Model Lab ancora prima di account, non nel gruppo, e
tablet ancora `tablist`.

### A2 — GREEN

- includere `models` nel primo gruppo;
- rendere il gruppo una lista di destinazioni route/panel;
- eliminare la grammatica tabs/roving soltanto dalla rail Settings;
- conservare pane tablet, Back phone, URL/deep link e lazy routes;
- usare soltanto token Theme Engine nelle righe toccate.

### A3 — Gate

- unit settings + shell;
- E2E settings/model navigation;
- typecheck e theme gate;
- dispositivo fisico: phone emulato e tablet nativo;
- screenshot `settings-intelligence-phone.png` e
  `settings-intelligence-tablet.png`.

Checkpoint: Model Lab è una sola volta sotto il nome utente e non è nel drawer
come destinazione primaria.

## 2. Slice B — trasferimento durevole e Download Center

Stato esecutivo 2026-08-05: **CLOSED — GREEN AUTOMATION + GREEN DEVICE**.
Registro schema 2, due slot attivi, coda FIFO durevole, azioni per riga,
process-death recovery e chrome globali sono stati provati sull'APK
`4226ab4e…`. Slice C non è inclusa in questa chiusura.

### B1 — RED service/store

- provare parsing di due record, `waiting`, pause/resume/cancel per ID,
  isolamento delle azioni, failure-preserving refresh e observer idempotente;
- provare che il terzo record resta in coda e che un doppio start canonico non
  crea una seconda riga;
- provare che `localModels.ts` non possiede una seconda richiesta resume;
- provare che il tool stato legge la sorgente globale;
- provare che le pagine non creano interval propri.

### B2 — RED native

- registro schema 2 round-trip con due record, migrazione v1, job ID unici,
  reject schema/path/hash malformati e nessun campo token;
- process restart ricostruisce ogni request e progresso sidecar;
- pausa utente non chiede retry;
- stop sistema conserva request e chiede retry;
- cancel elimina solo slot allowlisted e record identificato;
- dispatcher ammette due slot, conserva il terzo `waiting` e lo promuove in
  ordine quando uno si libera;
- riserva storage serializza check e preallocazione dell'intero set;
- notification action porta l'ID, usa child raggruppate e completion route è
  `/settings/models/local`.

### B3 — GREEN native

- migrare il journal AVM a registro schema 2 con scritture atomiche;
- aggiungere dispatcher `MAX_ACTIVE_TRANSFERS = 2` e coda durevole;
- distinguere stop causes e runtime per ID;
- ripristinare le request in Job/Service dopo process death;
- ricostruire progresso dai sidecar;
- implementare plugin `pause/resume/cancel/status` per ID, collection status e
  alias legacy `stop` non ambiguo;
- rendere JobService e foreground service host di worker indipendenti;
- correggere notifica e control receiver.

### B4 — GREEN UI

- creare lo store globale;
- creare trigger/popover lazy Reka come `ul/li` compatta e scrollabile;
- mettere azioni e conferma nella riga del relativo modello, con label
  accessibili distinte e badge count;
- montarlo nei cinque chrome;
- rimuovere poller/card duplicate dalle pagine;
- mantenere wrapper di compatibilità per tool/test;
- localizzare entrambe le lingue;
- aggiungere componenti al Theme Engine gate;
- pinzare il nuovo dynamic boundary senza alzare il budget.

### B5 — Gate reale

- unit TS e JVM;
- instrumentation lifecycle/process recreation;
- build/chunk/parity;
- install APK corrente;
- iniziare due modelli temporanei reali a distanza minima e provare due righe
  simultanee; mettere in pausa il primo e verificare che il secondo continui;
  riavviare app/processo, riprendere il primo, poi annullare ciascun ID e
  verificare cleanup nominativo;
- provare automaticamente un terzo record `waiting` e la promozione quando uno
  dei primi due libera lo slot;
- screenshot:
  `download-chat-running.png`, `download-drawer-running.png`,
  `download-model-lab-running.png`, `download-center-paused.png`,
  `download-center-tablet.png`, `download-center-two-active.png`.

Checkpoint: non esiste mai un terzo worker, una pausa non modifica l'altra riga
e un process death non perde target, ordine o controlli.

## 3. Slice C — compattezza locale e rail filtri

### C1 — RED

- prima di questo RED, completare un addendum di ricerca primaria su accordion
  disclosure accessibili, transizioni route con `prefers-reduced-motion` e
  progressive disclosure delle sezioni vuote;
- provare che Hugging Face usa la stessa grammatica collapsed/expanded dei
  provider API key, con logo provider e stati accessibili equivalenti;
- provare che le route interne Model Lab hanno una transizione direzionale
  osservabile, senza animazione quando reduced motion è attivo;
- provare che `Su questo dispositivo` non è nel DOM dopo una scansione valida
  con zero modelli e compare, con tutti i controlli, quando almeno uno esiste;
- riprodurre `memory_write` visibile nella riga attività chat, includere
  `createTalosMemoryWriteTools(...)` nella guardia completa e pretendere copy
  naturale italiano/inglese senza cambiare l'ID di protocollo;
- sostituire il test wrapping con `LOCAL-FILTER-RAIL-01`:
  `flex-nowrap`, `overflow-x-auto`, nessun `flex-wrap`, chip `shrink-0`;
- provare ordine/AND/reset invariati dopo lo scroll;
- provare installed list continua e metadata massimo due righe;
- provare result list continua senza card gap;
- provare variant row compatta, download raggiungibile e detail disclosure;
- estendere theme/static responsive test.

### C2 — GREEN

- adattare la card accesso Hugging Face alla disclosure già posseduta dal
  pannello provider, senza duplicare credenziali o introdurre un secondo stato;
- animare esclusivamente il cambio route dentro Model Lab usando il boundary
  motion TALOS e rispettando reduced motion, Back e focus;
- rendere condizionale l'intera sezione installati dopo la scansione, senza
  confondere errore di lettura con zero modelli;
- aggiungere `memory_write` al registro attività centralizzato, alla relativa
  icon map e alle locale `toolActivity`, lasciando il fallback raw soltanto ai
  tool realmente sconosciuti;
- convertire i cinque filtri in rail orizzontale;
- compattare toolbar e conteggi;
- convertire installati e risultati in liste continue con divider;
- compattare README/header;
- convertire varianti in righe informative con disclosure e azioni coerenti;
- mantenere tutti i filtri, check, gated, revision, warning e CRUD.

### C3 — Gate

- unit provider/HF, shell motion, sezione installati zero/non-zero e label
  attività `memory_write` resa in italiano/inglese;
- E2E avanti/indietro tra le quattro route Model Lab, con e senza reduced
  motion, verificando focus e nessun doppio screen durante il cambio;
- unit locali/repo/filter/theme;
- E2E filtri e coherence;
- metriche phone: nessun overflow pagina, rail più larga della viewport quando
  necessario, una sola riga chip, azioni minime 48dp;
- tablet nativo: nessuna riga artificialmente desktop, nessun duplicato;
- screenshot:
  `providers-hf-collapsed.png`, `providers-hf-expanded.png`,
  `model-lab-route-transition-end.png`, `model-lab-route-reduced-motion.png`,
  `local-overview-rail-start.png`, `local-overview-rail-end.png`,
  `local-installed-compact.png`, `local-repo-compact.png`,
  `local-repo-tablet.png`, `chat-memory-write-natural.png`.

Checkpoint: tutte le label restano complete e raggiungibili senza aumentare
l'altezza della pagina.

## 4. Slice D — runtime locale e policy contesto

### D1 — RED TypeScript

- `LOCAL-CONTEXT-PARITY-01`: fit e chat importano 4096 dallo stesso simbolo;
- `LOCAL-OPEN-FALLBACK-02`: solo `context` tenta 2048;
- `LOCAL-OPEN-NO-RETRY-03`: model-load/path/sampler non vengono ritentati;
- `LOCAL-OPEN-UI-04`: adapter produce provider error localizzato, non il solo
  `TALOS_LLAMA_OPEN_FAILED`.

### D2 — RED native

- mapping di `nativeLastOpenError` a stage stabile;
- invalid GGUF restituisce `model-load`;
- `OpenAttempt` conserva vecchio `open()` come compatibilità;
- instrumentation chat template/generation accetta fixture scelta da args.

### D3 — GREEN

- introdurre policy unica e alias legacy;
- introdurre error type e bounded fallback;
- conservare stadio JNI sul thread di open;
- attraversare Java/Capacitor/TS con code non sensibili;
- mappare a frase/azione i18n nella chat;
- non cambiare llama.cpp pin salvo un fallimento di matrice attribuito e un
  emendamento ledger con nuova ricerca primaria.

### D4 — Riproduzione bug owner

- il Qwen3.5 4B originariamente previsto non è più sul dispositivo: l'owner ha
  eliminato volontariamente tutti i GGUF prima di questa slice;
- usare quindi il caso pin C2 `Qwen/Qwen3-0.6B-GGUF` come riproduzione fisica
  controllata, senza qualificare l'assenza del modello owner come regressione;
- aprire dalla chat con 4096, applicare template e generare una risposta breve;
- verificare assenza di `TALOS_LLAMA_OPEN_FAILED` e PSS/swap non equivalente
  alla vecchia apertura 16384;
- screenshot `local-chat-qwen-recovered.png` e log redatto.

Checkpoint: la stessa classe di apertura esportata dall'owner è riprodotta con
un fixture revision-pinned e chiusa sul dispositivo, non soltanto nel mock; il
modello owner cancellato non viene ricreato né attribuito a TALOS.

## 5. Slice E — matrice Hugging Face sequenziale

### E1 — Harness

- aggiungere manifest revision/byte/SHA/licenza/famiglia;
- validare manifest con test;
- implementare runner host con allowlist namespace e cleanup `finally`;
- sul build dev, usare una reverse ADB TCP effimera e far scrivere lo stream
  direttamente dall'instrumentation target all'unico target app-owned; non
  usare `adb push`, `run-as` sul mount FUSE, shared storage o HTTP;
- estendere instrumentation a open → template → generate → close;
- far ricontrollare sul device byte e SHA ricevuti dagli argomenti
  `talosExpectedBytes`/`talosExpectedSha256` prima dell'open;
- far eseguire move e cleanup dei due soli path allowlisted dal processo target,
  rimuovendo sempre la reverse nominativa nel `finally` host;
- registrare report machine-readable e manifest umano.
- dopo il PASS instrumentation, spostare atomicamente la stessa singola copia
  nel solo namespace UI allowlisted
  `files/models/__talos_compat__/<case>/talos-compat.gguf`, provarla nella chat
  reale, acquisire e ispezionare lo screenshot, quindi pulire quel namespace
  prima del caso successivo; non esistono mai due copie del modello.

### E2 — Ordine

1. SmolLM2 baseline;
2. Qwen3;
3. LFM2;
4. Granite 4 hybrid;
5. Phi-3;
6. Llama 3.2;
7. Gemma 3 gated, soltanto con licenza/token disponibili.

Tra due casi il runner deve dimostrare zero file nel namespace campagna. Un
fallimento non autorizza a saltare cleanup o a cancellare modelli installati.

### E3 — Compatibilità incrementale

Per ogni rosso:

1. conservare stage/log redatto;
2. classificare file/hash, architettura, context, template o generation;
3. aggiungere scenario permanente;
4. ripetere ricerca primaria sul difetto specifico;
5. emendare ledger con file e pin;
6. implementare la correzione più piccola;
7. rieseguire il caso rosso e tutti i precedenti.

### E4 — Gate

- report per ogni caso con PASS/FAIL/SKIPPED_GATED;
- screenshot `local-compatibility-summary.png` nella UI/Doctor o evidenza
  equivalente del report mostrato sul device;
- screenshot chat fisico per ogni famiglia realmente eseguita; un caso gated
  non autorizzato resta `SKIPPED_GATED` e non riceve una falsa prova PASS;
- nessun file campagna residuo host/device;
- modelli owner e byte invariati.

Checkpoint: “supportato” significa template e token reali, non solo header o
load.

### E5 — addendum C1: lingua upstream e prova non contaminata

- aggiungere al manifest il prompt inglese C1 documentato dalla model card;
- aggiungere il RED permanente `C45-RED-18E` che pretende il prompt per caso e
  il rifiuto automatico di `TALOS_MEMORY_CONTEXT`, `MEMORY 1`, `USER_TASK` nella
  reply usata come evidenza;
- modificare soltanto manifest e runner, senza filtro nel percorso chat;
- rieseguire C1 completo, ispezionare lo screenshot originale e avanzare a C2
  solo dopo una reply priva di marker interni;
- conservare il primo output come osservazione qualità negativa nel ledger e
  nel report, non come PASS visuale.

Checkpoint: la matrice misura compatibilità reale nella lingua dichiarata dal
modello e non promuove una schermata che espone il wrapper interno.

### E6 — addendum C1: system prompt locale compatto

- RED `C45-RED-18F` in `tone.test.ts`: provider locale sotto 600 caratteri,
  identità/safety/tono presenti, protocollo tone suggestion assente;
- estendere il RED harness alle frasi interne della identity line e del tone
  protocol;
- implementare il ramo locale nel builder esistente, senza cambiare firma o
  prompt specialistici;
- focused tone + manifest runner, typecheck, build, APK side-by-side e update
  in-place;
- rieseguire C1 da zero e accettare lo screenshot solo se non contiene marker,
  identity instruction o protocollo interno.

Checkpoint: un piccolo modello locale riceve un contratto completo ma breve; i
provider con chiave conservano byte-per-byte il prompt corrente.

### E7 — addendum C2: eccezione grammatica confinata nel native bridge

- registrare `C45-RED-18G` dal tombstone fisico C2 e non avanzare a C3;
- aggiungere il RED statico permanente sul contratto `applyGrammar`: catch
  dell'eccezione upstream, fallback senza grammatica e secondo confine protetto;
- modificare soltanto `applyGrammar` nel ponte JNI, senza cambiare firme Java,
  bridge Capacitor, pin llama.cpp, template, parser o capability dei tool;
- eseguire focused RED/GREEN, regressione chat/native, typecheck, build, sync,
  assemble side-by-side e update in-place;
- rieseguire C2 da zero, pretendere processo vivo, reply reale, screenshot ADB
  originale-pixel e cleanup completo prima di C3.

Checkpoint: una grammatica tool auto-generata non compilabile degrada a
sampling non vincolato e non può più terminare TALOS.

### E8 — addendum C2: budget contesto e crash boundary del worker

- registrare separatamente `C45-RED-18H` (prompt tool `5779 > 4096`) e
  `C45-RED-18I` (eccezione Java non contenuta); C3 resta bloccato;
- aggiungere un contatore token JNI che usa le stesse opzioni di
  `nativeGenerate`, propagarlo come piano prompt `{ prompt, promptTokens,
  contextTokens }` senza rimuovere il simbolo compatibile che restituisce la
  sola stringa;
- aggiungere policy testata: partenza `4096`, riserva output reale, un solo
  rialzo al power-of-two necessario, massimo `8192`, nessun fallback verso
  `2048` durante un rialzo;
- riaprire esattamente a `8192` soltanto quando il piano non entra, ricostruire
  template/grammatica e conservare tutti i tool;
- racchiudere l'intero task `generate` in un boundary `try/catch/finally` che
  rifiuta la call con codice e metadata non sensibili e ripristina sempre
  `generating`; nessuna eccezione runtime può raggiungere l'uncaught handler;
- aggiungere messaggi i18n distinti per conversazione oltre il tetto mobile e
  fallimento di generazione;
- eseguire RED/GREEN Vitest e JVM, regressioni chat/native, build/sync/assemble,
  update in-place e rerun C2 completo con screenshot originale-pixel.

Checkpoint: C2 conserva i 20 tool, usa `8192` soltanto perché il prompt reale lo
richiede e un errore di budget diventa stato chat azionabile, mai process death.

### E9 — regressione sicurezza: nessun payload bridge in Logcat

- registrare `C45-RED-18J` senza includere alcun valore osservato;
- aggiungere RED permanente sulla fonte Capacitor e sull'asset Android
  generato: entrambi devono dichiarare `loggingBehavior: 'none'`;
- impostare l'opzione ufficiale nella sola fonte `capacitor.config.ts` e
  materializzarla esclusivamente tramite `npx cap sync android`;
- non patchare Capacitor `8.4.2`, Secure Storage o il plugin HTTP;
- aggiornare APK in-place e provare sul device, con marker sintetico, che
  apertura Provider e una richiesta non producano righe `methodData`, payload
  storage o header; catturare inoltre uno screenshot che dimostri che la UI
  Provider resta funzionante;
- registrare nel handoff la raccomandazione di rotazione delle credenziali
  esistenti, senza mai copiarle.

Checkpoint: il build debug utile alla matrice non trasforma più il bridge in un
canale laterale per segreti.

### E10 — regressione C3: il footer non può soddisfare il prompt

- preservare screenshot e hash del falso PASS LFM2 come prova diagnostica;
- aggiungere `C45-RED-18L` prima di cambiare il runner;
- introdurre il puro `validateCompatibilityReply(caseId, reply)` con test RED
  per vuoto, marker `TALOS` assente ed echo di contesto;
- in `exerciseRealChat` leggere esclusivamente
  `lastAssistant.getByTestId('talos-mobile-message-content')`, mai l'intero
  articolo con provider/footer/azioni;
- scrivere nel report soltanto il corpo validato;
- rieseguire C3 da zero, catturare un nuovo screenshot, ispezionarlo a pixel
  originali e confermare cleanup prima di sbloccare C4.

Checkpoint: un metadato TALOS non può trasformare una risposta incompatibile
in un PASS della matrice.

### E11 — fixture linguistico esplicito per ogni famiglia

- registrare `C45-RED-18M` dopo il FAIL onesto C3;
- aggiungere RED che richiede `prompt` non vuoto per C1–C7, inglese per C3/C5
  e assenza del fallback italiano nel runner;
- rendere espliciti nel JSON tutti i prompt, senza cambiare pin, hash, byte,
  toolset o parametri del prodotto;
- rerun C3 completo; il marker deve provenire dal corpo e il report deve
  misurare il contesto nativo;
- soltanto dopo screenshot e cleanup accettati sbloccare C4.

Checkpoint: nessun modello fallisce perché il banco gli parla fuori dalle
lingue dichiarate dal suo upstream.

### E12 — il runner non può premere dettatura al posto di invio

- preservare il live screenshot C3 con draft vuoto/errore voce;
- registrare `C45-RED-18N` e aggiungere RED statico prima del runner edit;
- sostituire entrambi i selettori strutturali con role + accessible name
  bilingue, usando i nomi già posseduti dalle locale TALOS;
- dopo la chiusura del drawer, riempire e verificare nuovamente il prompt;
- pretendere un solo send visibile e abilitato prima del click;
- rerun C3 e confermare che non compaiano dettatura/errori voce, poi screenshot
  finale e cleanup.

Checkpoint: nessuna prova modello può passare o bloccarsi su un controllo
diverso da quello che un utente riconosce come «Invia messaggio».

### E13 — ogni prova modello è temporanea e non vede memorie owner

- registrare `C45-RED-18O` senza copiare nel repository il contenuto osservato;
- aggiungere RED comportamentale per il nuovo marker di echo e RED statico che
  impone click `talos-make-temporary` → badge `talos-temporary-chat-badge` prima
  del primo fill/selezione modello;
- rendere il confronto dei marker case-insensitive e bloccare il body prima di
  report e screenshot;
- usare esclusivamente la modalità temporanea reale già esposta da TALOS: non
  modificare controller, selezione memoria o comportamento delle chat normali;
- rerun C3 da zero e accettarlo soltanto se il tablet mostra badge temporaneo,
  nessun chip «memorie usate», body con `TALOS`, contesto nativo misurato e
  nessun dato owner;
- ispezionare il PNG a 2400×3392, aggiornare report/manifest hash e provare
  cleanup zero GGUF, reverse e file host prima di sbloccare C4.

Checkpoint: il banco di compatibilità esercita il backend reale con il minimo
privilegio sui dati e non può trasformare memorie owner in evidenza di test.

## 6. Regressione finale e consegna

Eseguire, in quest'ordine:

1. focused Vitest per ogni slice;
2. `npm run test:unit`;
3. `npm run typecheck`;
4. E2E Model Lab/Settings/shell/chat con un worker;
5. gate HF live sulle revision pin;
6. `npm run build` con chunk/parity;
7. `npx cap sync android`;
8. JVM Android completa;
9. assemble side-by-side;
10. instrumentation e matrice fisica;
11. cold start, reload, Back, keyboard/focus, reduced motion, tema chiaro/scuro,
    density/radius e failure state;
12. `git diff --check` e audit lane mobile;
13. manifest screenshot con hash;
14. rimozione `tcp:9222`, ripristino 2400×3392/density 420 e rotazione;
15. aggiornamento handoff.

Direttiva owner ricevuta durante la chiusura Slice B: lasciare sul Desktop una
copia nominata dell'APK correttivo verificato. Copia eseguita senza
sovrascrittura:

`C:\Users\Antonino\Desktop\TALOS-mobile-corrective-slice-b-verified-2026-08-05-4226ab4e.apk`

Byte `30388012`; SHA-256
`4226ab4ee32c1ff3ec34ea050ee9f6be67eb9803e36f2a34aa61d41abd3f3811`.
Il nome delimita correttamente la consegna: è finale per Slice B, non dichiara
chiuse Slice C–E e non sostituisce l'APK finale della tranche completa.

## 7. Punto di arresto

Al termine la tranche è `IMPLEMENTED`, ma la Fase 5 OAuth resta
`DEFERRED — OWNER DECISION / NO DOMAIN`. Si presenta il risultato e si attende
la valutazione dell'owner prima di ripianificare OAuth.
