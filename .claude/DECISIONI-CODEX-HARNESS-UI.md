# Registro decisionale — Codex Harness UI

Stato: **requisiti consolidati, implementazione non autorizzata**

Data di consolidamento: 2026-08-24

Documento autorevole per la fase di preparazione: questo file
Documenti di origine, ora subordinati a questo registro:

- `PROMPT-CODEX-HARNESS-UI.md`
- `PROPOSTA-CODEX-HARNESS-UI.md`
- `CONSEGNA-CODEX-HARNESS-UI.md`
- documentazione inclusa nel mockup esterno

## 1. Scopo e autorità

I documenti di origine sono bozze e materiale progettuale, non istruzioni
esecutive autonome. Le decisioni esplicite dell'owner raccolte qui prevalgono
su quei documenti. In caso di conflitto futuro, vale questo ordine:

1. nuove decisioni esplicite dell'owner;
2. ledger file-per-file approvato dall'owner;
3. questo registro decisionale;
4. prompt, proposta e consegna originari;
5. documentazione e comportamento simulato del mockup.

Questo documento autorizza esclusivamente la registrazione delle decisioni.
Non autorizza modifiche di prodotto, installazioni, test che scrivono,
inizializzazioni Git, commit, push o modifiche a TALOS-BANCO.

## 2. Stato del gate

Non si può ancora iniziare l'implementazione. Mancano obbligatoriamente:

1. conclusione e commit pulito del lavoro mobile attualmente in corso;
2. identificazione del relativo commit mobile autorevole;
3. aggiornamento del worktree `lane/harness-ui` a quel commit;
4. decisione del main agent sulla strategia di versionamento e rollback di
   TALOS-BANCO;
5. ricerca web aggiornata su fonti ufficiali e primarie;
6. ledger di esecuzione al livello di file, simboli, test, gate e rollback;
7. approvazione esplicita del ledger da parte dell'owner;
8. autorizzazioni separate per la fase TALOS-BANCO e per la fase Harness UI.

Fino alla chiusura di tutti questi punti non si scrive codice di prodotto.

## 3. Registro completo delle decisioni

### DEC-001 — Autorità dei documenti

**Decisione A.** Prompt e proposta sono bozze da consolidare. Diventano
vincolanti soltanto attraverso le decisioni dell'owner e il ledger approvato.

### DEC-002 — Confine architetturale

**Decisione A, precisata dall'owner.** Harness UI sarà uno strumento autonomo.
Deve coprire desktop e mobile. La qualità e i pattern del prodotto mobile hanno
priorità perché la versione desktop esistente è considerata obsoleta.

### DEC-003 — Sorgente autorevole della UI mobile

**Decisione A.** Il riferimento sarà la versione mobile più recente, fissata a
un commit pulito prima dell'inizio.

### DEC-004 — Momento del pin mobile

**Decisione A.** Il pin avverrà dopo la conclusione e il commit del lavoro
mobile attualmente non committato.

### DEC-005 — Base del worktree Harness

**Decisione A.** Prima di creare file, `lane/harness-ui` verrà aggiornato al
commit mobile autorevole. Non si implementerà sulla vecchia base `587f989f`.

### DEC-006 — Ruolo del mockup

**Decisione B, precisata dall'owner.** Il mockup deve essere replicato
integralmente. La replica deve però collegarsi ai token stilistici e al theme
engine autorevoli del mobile. Quasi tutte le funzionalità non integrate
resteranno dummy UI funzionante esclusivamente lato interfaccia.

### DEC-007 — Etichettatura della dummy UI

**Decisione A.** Ogni sezione non collegata deve avere un'etichetta locale
esplicita, equivalente a `Demo UI · non collegato`. Navigazione e stati locali
possono funzionare; nessuna simulazione può dichiarare un'esecuzione reale.

### DEC-008 — Copia originale del mockup

**Decisione A.** Si archiviano i 18 file della cartella interna del mockup. Lo
ZIP esterno, che duplica gli stessi file, viene escluso.

Sorgente verificata:

`C:\Users\Antonino\Desktop\projects\TALOS-RICERCHE\harness-ui-mockup-2026-08-20\talos-responsive-harness-mockup`

Destinazione prevista, da confermare nel ledger:

`harness-ui/mockup-originale/`

### DEC-009 — Provenienza delle immagini di riferimento

**Decisione A.** Le immagini restano intatte e vengono accompagnate da una
nota di provenienza separata. La nota deve dichiarare che i riferimenti visivi
di terzi non vengono automaticamente rilicenziati sotto la licenza AVM.

### DEC-010 — Criterio di completezza del mockup

**Decisione A.** Il numero 18 descrive i file, non un numero normativo di
schermate. La completezza verrà provata con un inventario nominativo di tutte
le viste, sezioni, rail, inspector, drawer, sheet, palette, dialoghi, stati e
varianti responsive.

### DEC-011 — Collocazione dei dati reali

**Decisione A.** I dati reali vivranno nella vista Board/Dashboard:

- selettore campagna nell'header;
- metriche e righe per harness nel board;
- rapporto testuale in un pannello dedicato.

Le altre viste restano fedeli al mockup e sono dummy quando non collegate.

### DEC-012 — Selezione delle campagne

**Decisione A.** Le campagne sono governate da un'allowlist esplicita e
configurabile. Non si deduce la validità di una campagna dal suo nome e non si
elencano automaticamente tutte le directory `esiti-*`.

### DEC-013 — Allowlist iniziale

**Decisione A.** La prima allowlist contiene:

- `esiti-22ago-progetti`;
- `esiti-22ago-storia`.

### DEC-014 — Collocazione del registro decisionale

**Decisione A.** Il documento autorevole è:

`.claude/DECISIONI-CODEX-HARNESS-UI.md`

Deve contenere tutte le decisioni, le precisazioni, i vincoli, le questioni
rinviate, le autorizzazioni e i gate.

### DEC-015 — Produzione del rapporto reale

**Decisione A.** Harness UI non avvia `rapportoCampagna.mjs`. TALOS-BANCO
produce artefatti canonici; Harness UI li legge soltanto. È quindi risolto a
favore del read-only il conflitto originario fra “nessun processo” e “lancia il
rapporto”.

### DEC-016 — Proprietà del contratto degli artefatti

**Decisione A.** La generazione degli artefatti viene implementata mediante
una modifica preparatoria separata in TALOS-BANCO. La UI non riproduce gli
algoritmi del banco.

### DEC-017 — Responsabilità della modifica al banco

**Decisione A.** La fase TALOS-BANCO è affidata a Codex, ma richiederà ricerca,
ledger e autorizzazione propri. Deve terminare prima che Harness UI consumi il
nuovo contratto.

### DEC-018 — Versionamento e rollback di TALOS-BANCO

**Decisione rinviata.** Sarà il main agent a scegliere la strategia. La
proposta finale deve esporre almeno queste alternative:

1. **raccomandata:** inizializzare un repository dedicato per script e
   contratti, mantenendo gli esiti immutati ed esclusi ma censiti tramite hash;
2. backup verificati dei soli file interessati e manifest degli hash;
3. modifica diretta senza versionamento, sconsigliata.

Nessuna di queste alternative è ancora approvata.

### DEC-019 — Collocazione degli artefatti di campagna

**Decisione A.** Ogni directory di campagna approvata contiene:

- `rapporto.txt`;
- `rapporto.v1.json`.

Gli artefatti sono prodotti dal banco, mai dalla UI.

### DEC-020 — Ampiezza del JSON canonico

**Decisione A.** `rapporto.v1.json` è un contratto completo e versionato. Deve
includere almeno:

- versione dello schema;
- identità della campagna;
- timestamp di generazione;
- modello e quota;
- harness;
- dimensione del campione misurato;
- task risolti;
- pass-rate e intervallo;
- costo e fonte del costo;
- righe ignote o escluse;
- avvisi e limiti;
- provenienza delle metriche.

La forma esatta e tutti i simboli pubblici saranno definiti nel ledger della
fase TALOS-BANCO.

### DEC-021 — Righe normalizzate dei task

**Decisione A.** `rapporto.v1.json` include anche le righe normalizzate dei
singoli task. Harness UI non interpreta direttamente i JSONL eterogenei.

### DEC-022 — Dati grezzi e derivati

**Decisione A.** Ogni riga conserva, in sezioni distinte:

- i campi originali ammessi;
- il verdetto canonico derivato;
- la fonte del verdetto;
- lo stato misurata/non misurata;
- il riferimento al file e alla riga sorgente.

I dati derivati non devono sovrascrivere o mascherare l'evidenza originale.

### DEC-023 — Campo `detto`

**Decisione A.** `detto` viene conservato integralmente come evidenza locale
non fidata. Requisiti obbligatori:

- visualizzazione soltanto su richiesta;
- rendering come testo puro, mai HTML;
- nessuna istruzione contenuta in `detto` può azionare strumenti;
- nessun log automatico del contenuto;
- nessun export automatico;
- servizio esclusivamente loopback;
- cancellazione locale esplicita prevista dalla UI.

### DEC-024 — Campo `cambiamenti`

**Decisione A.** Il contratto espone soltanto conteggi strutturati:

- `quanti`;
- aggiunti;
- modificati;
- rimossi;
- estratti come quantità.

Il contenuto degli estratti di codice non entra nell'artefatto destinato alla
UI.

### DEC-025 — Coerenza degli artefatti

**Decisione A.** La generazione è atomica e verificabile. Il contratto deve
prevedere:

- scrittura temporanea e sostituzione atomica;
- timestamp;
- versione schema;
- hash dei JSONL sorgente;
- rilevamento di artefatto obsoleto o incompatibile;
- errore controllato, mai uso silenzioso di dati incoerenti.

### DEC-026 — Costo canonico

**Decisione A.** Il costo replica la semantica corrente del rapporto:

1. `<harness>.costo.json` è la fonte primaria;
2. se manca, si usa la somma delle righe e la si marca esplicitamente come
   stima `~`;
3. il costo mancante è `null`, mai zero;
4. la fonte e il numero di righe senza costo sono sempre dichiarati.

### DEC-027 — Pass-rate canonico

**Decisione A.** Il pass-rate replica la semantica corrente del rapporto:

- solo variante baseline;
- esclusione delle prove non misurate;
- rilevamento dei limiti di traffico secondo la logica autorevole del banco;
- maggioranza dei risultati in `giriDelTask` quando disponibile;
- intervallo bootstrap al 95%;
- conteggio esplicito delle righe escluse;
- provenienza e variazioni del verdetto dichiarate.

### DEC-028 — Esiti non binari

**Decisione A.** Si preservano tutti gli esiti originali, inclusi almeno:

- `riuscito`;
- `fallito`;
- `fermato`;
- `inventato`;
- `manomesso`;
- `ignoto`;
- `rottoAltrove`.

La UI usa badge e legenda distinti e non confonde l'esito grezzo con il
verdetto canonico.

### DEC-029 — Esposizione del server locale

**Decisione A.** Default approvati:

- host `127.0.0.1`;
- porta `4174`;
- override esplicito tramite variabili d'ambiente;
- CORS disabilitato;
- nessun ascolto LAN;
- nessun bind implicito a `0.0.0.0`.

### DEC-030 — Configurazione

**Decisione A.** Configurazione esclusivamente tramite variabili d'ambiente,
senza fallback impliciti. Nomi approvati concettualmente:

- `TALOS_BANCO_DIR`;
- `TALOS_HARNESS_UI_CAMPAIGNS`;
- variabili esplicite per host e porta.

Il percorso mancante, non leggibile o non contenuto deve produrre un errore
chiaro e fail-closed. I nomi esatti aggiuntivi saranno fissati nel ledger.

### DEC-031 — Aggiornamento dei dati

**Decisione A.** L'aggiornamento è manuale tramite un comando UI “Aggiorna”.
Ogni aggiornamento rilegge atomicamente gli artefatti e mostra timestamp e
hash. Non sono previsti polling o watcher filesystem.

### DEC-032 — Contratto frontend/server

**Decisione A.** Frontend e server comunicano tramite API JSON same-origin,
versionata sotto `/api/v1/...`, con envelope tipizzati ed errori strutturati.
Il browser non accede direttamente al filesystem.

### DEC-033 — Caricamento delle righe

**Decisione A.** Filtri, ordinamento e paginazione sono gestiti dal server. I
payload hanno limiti espliciti e l'ordinamento è deterministico.

### DEC-034 — Paginazione mobile

**Decisione A.** La UI usa un pulsante “Carica altri” basato su cursore. Non è
previsto scroll infinito automatico. Posizione e focus devono essere
preservati.

### DEC-035 — Local-first mobile

**Decisione A, richiesta esplicita dell'owner.** La versione mobile deve essere
local-first. IndexedDB conserva l'ultima campagna verificata e lo stato UI. La
Board resta consultabile senza server; “Aggiorna” sincronizza esplicitamente
dal server locale.

### DEC-036 — Contenuto dello snapshot locale

**Decisione A.** Lo snapshot contiene l'artefatto completo, incluso `detto`.
La persistenza e la protezione dati devono seguire i pattern della versione
mobile autorevole. La UI offre un comando esplicito per cancellare la cache.

### DEC-037 — Evoluzione della cache

**Decisione A.** La cache è versionata e mantiene il “last known good”:

- migrazioni esplicite;
- validazione completa prima della sostituzione;
- conservazione dello snapshot precedente quando un aggiornamento fallisce;
- nessuna lettura permissiva di dati incompatibili o parzialmente corrotti.

### DEC-038 — App shell offline

**Decisione A.** Un service worker leggero conserva gli asset statici e
permette la riapertura offline. Non è richiesta una PWA installabile completa.

### DEC-039 — Token stilistici

**Decisione A.** Harness UI usa un artefatto CSS standalone generato dai token
canonici del mobile, protetto da un test di parità. Non si duplicano valori a
mano e non esiste una dipendenza runtime dalla struttura interna di `mobile/`.

### DEC-040 — Theme engine

**Decisione A.** Si adotta il contratto completo mobile:

- preferenza di sistema;
- tema chiaro;
- tema scuro;
- contrasto elevato quando previsto dal contratto mobile;
- variabili CSS canoniche;
- preferenza persistente locale;
- applicazione iniziale senza flash del tema errato.

### DEC-041 — Ordine responsive

**Decisione B, con vincolo precedente confermato.** Mobile e desktop vengono
sviluppati in parallelo componente per componente. Il mobile resta il
riferimento qualitativo prioritario; la scelta parallela non autorizza a
progettare desktop-first.

### DEC-042 — Matrice delle viewport

**Decisione A.** Gate su tutte le otto viewport documentate:

1. 320×720;
2. 360×800;
3. 390×844;
4. 430×900;
5. 768×1024;
6. 1024×800;
7. 1280×800;
8. 1440×900.

### DEC-043 — Browser di accettazione

**Decisione A.** Il gate comprende Chromium, Firefox e WebKit. Edge/Chrome è
il riferimento principale. È richiesta una prova su dispositivo reale quando
l'ambiente è disponibile; l'assenza di tale ambiente deve essere dichiarata e
non simulata come prova reale.

### DEC-044 — Accessibilità

**Decisione A.** Obiettivo e gate: WCAG 2.2 livello AA. Sono obbligatori almeno:

- uso completo da tastiera;
- focus visibile e gestione corretta del focus;
- landmark, nomi e relazioni accessibili;
- contrasto conforme;
- reduced motion;
- zoom al 200%;
- target touch di almeno 44×44 px.

### DEC-045 — Stati di errore e offline

**Decisione A.** La UI possiede stati espliciti e recuperabili per:

- caricamento;
- assenza di campagne o righe;
- offline;
- snapshot obsoleto;
- schema incompatibile;
- hash non valido;
- aggiornamento fallito;
- quota locale esaurita;
- server o banco non disponibili.

Quando possibile viene mantenuto e dichiarato l'ultimo snapshot valido.

### DEC-046 — Budget prestazionali

**Decisione A.** Soglie iniziali bloccanti:

- API locale p95 non superiore a 200 ms;
- vista da cache disponibile entro 1 secondo;
- risposta alle interazioni entro 100 ms;
- app shell compressa non superiore a 250 KB.

Il ledger dovrà definire ambiente, dataset, warm-up, numero di campioni e
comando ripetibile della misura; una soglia non è valida senza metodologia.

### DEC-047 — Stack frontend

**Decisione A.** Harness UI usa Vue 3 e Vite, fissati alle stesse versioni del
futuro commit mobile autorevole. Il progetto resta autonomo e possiede il
proprio manifest e lockfile.

### DEC-048 — Test e CI

**Decisione A.** È richiesta una suite completa e un job CI `harness-ui`.
La suite dovrà coprire almeno:

- unit test;
- schema e contratti server;
- sicurezza dei percorsi e fail-closed;
- IndexedDB e migrazioni;
- service worker e offline;
- componenti e theme engine;
- API, filtri, ordinamento e cursori;
- flussi E2E con artefatti reali o fixture canoniche;
- dummy UI e relative etichette;
- accessibilità;
- tre motori browser;
- otto viewport;
- budget prestazionali;
- assenza di scritture in TALOS-BANCO.

### DEC-049 — Installazione delle dipendenze

**Decisione A.** Dopo l'approvazione del ledger, le dipendenze vengono
installate soltanto in `harness-ui/`, usando il relativo lockfile. Non si
esegue `npm --prefix mobile ci`, perché mobile è una sorgente autorevole di
contratti e versioni, non una dipendenza di build della UI autonoma.

### DEC-050 — Strategia dei commit

**Decisione A.** La strategia prevista è a commit piccoli e tematici, senza
push. Le unità logiche previste sono:

1. registro decisionale;
2. mockup originale e provenienza;
3. contratto TALOS-BANCO nella sua fase/repository approvati;
4. fondazioni Harness UI;
5. collegamento dei dati;
6. local-first e offline;
7. QA e ritorno finale.

Questa decisione definisce la strategia, ma i commit non sono ancora
autorizzati: l'owner richiederà e approverà prima i ledger delle rispettive
fasi. Non è autorizzato alcun push.

### DEC-051 — Prova finale di accettazione

**Decisione A.** Il gate finale combina prove automatiche e verifica umana:

- avvio da clone/installazione puliti;
- confronto esatto con gli artefatti canonici del banco;
- reload e riapertura offline;
- persistenza e migrazioni;
- dummy UI completa e correttamente etichettata;
- otto viewport;
- Chromium, Firefox e WebKit;
- WCAG 2.2 AA;
- budget prestazionali;
- screenshot finali;
- prova che Harness UI non scrive in TALOS-BANCO;
- prova che Harness UI non avvia processi del banco.

### DEC-052 — Chiusura del gate e prossimo passo

**Decisione A.** Sequenza vincolante:

1. creare soltanto questo registro;
2. attendere il commit mobile pulito;
3. aggiornare l'ispezione e fissare l'upstream pin;
4. svolgere ricerca web aggiornata;
5. produrre i ledger file-per-file, prima TALOS-BANCO e poi Harness UI;
6. chiedere una nuova approvazione esplicita;
7. solo dopo l'approvazione iniziare codice, test, installazioni e commit.

Non è autorizzato un avvio automatico dopo il commit mobile.

## 4. Requisiti consolidati del prodotto

### 4.1 Natura del prodotto

Harness UI è un'applicazione web autonoma, responsive e local-first. Copre
mobile e desktop in parallelo, ma adotta il mobile aggiornato come riferimento
di design, qualità, persistenza e interazione. Non è una nuova pagina Laravel,
non entra nell'app mobile e non usa il validator come backend.

### 4.2 Fedeltà e comportamento dummy

L'intero mockup entra nel prodotto. Le superfici non collegate sono realmente
interattive soltanto sul piano UI e devono essere marcate localmente come demo.
È vietato mostrare falsi successi di terminale, browser, agenti, automazioni,
approvazioni o strumenti come se provenissero da un backend reale.

### 4.3 Confine con TALOS-BANCO

TALOS-BANCO possiede semantica, normalizzazione, costo, pass-rate, intervalli,
esclusioni, provenienza e artefatti. Harness UI:

- legge soltanto campagne in allowlist;
- legge soltanto `rapporto.txt` e `rapporto.v1.json` canonici;
- non interpreta direttamente i JSONL;
- non esegue gli script del banco;
- non usa `child_process`, `exec` o `spawn` per il banco;
- non scrive, rinomina o cancella file nel banco;
- non corregge o ricalcola silenziosamente le metriche.

### 4.4 Local-first

Il server locale è la sorgente di sincronizzazione, non un requisito per la
consultazione continua. L'app conserva app shell, snapshot valido, stato UI e
tema. Ogni aggiornamento è esplicito, validato e sostituisce la cache solo dopo
il successo completo.

### 4.5 Sicurezza

Tutti i dati del banco sono input non fidato. Requisiti minimi:

- bind loopback;
- CORS disabilitato;
- contenimento canonico dei percorsi;
- rifiuto di traversal, symlink/reparse point fuori radice e encoding ambigui;
- whitelist di metodi, file e tipi MIME;
- limiti di dimensione e paginazione;
- rendering testuale di `detto`;
- nessun log di payload sensibili;
- nessuna esecuzione derivata dai dati;
- service worker limitato all'origine e agli asset previsti;
- cancellazione esplicita dello snapshot locale.

I dettagli concreti, incluse CSP e intestazioni HTTP, richiedono ricerca e
ledger; non sono implicitamente decisi da questo paragrafo.

## 5. Contraddizioni dei documenti originari risolte

1. **Server senza processi vs rapporto lanciato dal server:** prevale il server
   senza processi; il banco produce artefatti.
2. **Costo dalle righe vs costo del rapporto:** prevale il costo canonico
   prodotto dal banco con provenienza esplicita.
3. **Pass-rate grezzo vs semantica dei giri:** prevale la semantica canonica del
   rapporto.
4. **Tutte le directory `esiti-*` vs campagne eterogenee:** prevale
   l'allowlist esplicita.
5. **18 schermate vs 18 file:** 18 indica i file; l'accettazione usa
   l'inventario delle superfici.
6. **6 risoluzioni vs matrice reale di 8:** prevalgono le 8 viewport elencate in
   DEC-042.
7. **Nessun framework/dipendenza vs allineamento al mobile:** prevalgono Vue 3
   e Vite, fissati al commit mobile autorevole.
8. **Mockup intatto vs desktop obsoleto:** il mockup viene replicato, ma token,
   theme engine, accessibilità e qualità responsive seguono il mobile.
9. **UI completamente simulata vs no-fake-feature:** la dummy UI è ammessa solo
   se marcata localmente e incapace di dichiarare azioni reali.

## 6. Questioni ancora aperte

### OPEN-001 — Commit mobile autorevole

Il commit non esiste ancora in forma finale perché il lavoro mobile corrente
non è stato concluso e committato. Nessun pin può essere inventato.

### OPEN-002 — Versionamento di TALOS-BANCO

La scelta è riservata al main agent. Vedere DEC-018.

### OPEN-003 — Versioni upstream e contratti precisi

Versioni Vue/Vite/test runner/browser tooling, forma JSON definitiva, endpoint,
nomi pubblici, CSP e dettagli del service worker saranno fissati solo dopo il
pin mobile e la ricerca obbligatoria.

### OPEN-004 — Prova su dispositivi reali

Il gate la richiede quando l'ambiente è disponibile. Il ledger deve elencare i
dispositivi realmente disponibili e distinguere chiaramente emulazione e
hardware reale.

## 7. Azioni espressamente non autorizzate ora

- modificare il worktree `AVM-harness-ui`;
- aggiornare, rebaseare o spostare branch;
- modificare TALOS-BANCO;
- inizializzare repository Git;
- copiare il mockup;
- installare dipendenze;
- avviare server o campagne;
- eseguire `rapportoCampagna.mjs`;
- eseguire test che scrivono artefatti;
- creare commit;
- effettuare push;
- iniziare automaticamente quando sarà disponibile il commit mobile.

## 8. Prossimo checkpoint richiesto

Quando l'owner comunicherà che il lavoro mobile è concluso e committato, il
solo passo consentito sarà una nuova ispezione read-only per:

1. verificare lo stato pulito;
2. registrare il commit esatto;
3. confrontare token, theme engine, stack, persistenza e pattern UI aggiornati;
4. verificare se le decisioni di questo documento restano applicabili;
5. avviare la ricerca e preparare i ledger, senza ancora scrivere codice.

## 9. Decisioni del proprietario, 2026-08-24 — precisano e SOSTITUISCONO parti della sezione 3

Il proprietario ha letto questo registro e risposto a una revisione critica.
Per la gerarchia dichiarata al §1, queste sono "nuove decisioni esplicite
dell'owner": prevalgono su ogni DEC- che contraddicono, comprese quelle già
marcate "precisata dall'owner" nella sezione 3, dove la lettura tecnica che
ne era stata data non corrisponde a quanto detto davvero.

### DEC-053 — Cosa significa "legato al mobile" (sostituisce la lettura tecnica di DEC-002/039/040/047, conferma l'intento di DEC-002/041)

**Decisione A.** Citazione diretta dell'owner, 2026-08-24: *"harness deve
essere fatto sia per mobile che desktop, funzionante allo stesso modo per
mobile e desktop, non ha senso riscrivere 2 volte la stessa funzione,
sarebbe una tortura, ovviamente la dobbiamo legare al mobile prima e quando
riprenderemo il desktop lo legheremo al desktop."*

L'intento è confermato: **una sola implementazione, responsive, mai due
riscritte separate per mobile e desktop.** Non richiede però nessuna
dipendenza tecnica da `mobile/` (l'app TALOS):

- Il mockup **è già** responsive (`talos-responsive-harness-mockup`, 6
  risoluzioni già provate da mobile a desktop in `UI_REVIEW.md`) — è
  esattamente lo strumento per "una sola funzione, non due".
- "Legato al mobile" NON significa: stesso Vue, stessa Vite, stesso commit
  dell'app mobile TALOS (DEC-047), né attendere che il lavoro mobile in
  corso sia concluso e committato (DEC-004/005, OPEN-001).
- Il linguaggio visivo TALOS non richiede un aggancio tecnico: il mockup è
  già disegnato per somigliare all'app (tema scuro, ambra, Orbitron) fin
  dall'origine.
- **DEC-004, DEC-005 e OPEN-001 sono ANNULLATE**: non esiste più nessun gate
  che blocchi l'inizio di harness-ui in attesa di un commit "mobile
  autorevole". Il lavoro mobile in corso (Fase 4/5, Agente 19) non ha una
  fine prevedibile a breve — un gate letto alla lettera avrebbe fermato
  harness-ui per giorni o settimane, cosa che l'owner non vuole.
- **DEC-047 è SOSTITUITA**: resta la decisione originale del piano
  approvato — niente Vue, niente Vite, niente framework nuovo, niente
  dipendenza npm nuova. Il mockup resta HTML/CSS/JS statico, con un
  piccolo server Node a libreria standard, esattamente come da disegno
  originale (`elegant-spinning-dongarra.md`, Traccia 2, §2.4).
- Quando (non prima) riprenderà il lavoro sul desktop, la STESSA base
  responsive si collega anche a quello — non una riscrittura, una seconda
  base.

### DEC-054 — TALOS-BANCO resta fuori (sostituisce DEC-015/016/017/018)

**Decisione A.** L'owner, testuale: *"non so tu cosa consigli? io avevo
detto a codex solo UI."* — cioè: nessuna istruzione dell'owner autorizzava
di toccare TALOS-BANCO. **DEC-016, DEC-017 e DEC-018 sono ANNULLATE.**

- Harness UI legge il contratto che esiste GIÀ, esattamente come nel
  disegno originale (`elegant-spinning-dongarra.md`, Traccia 2, §2.2): le
  righe di `esiti-*/*.jsonl` (i campi elencati lì, non altri) e l'output
  testuale di `rapportoCampagna.mjs`, trattato come blocco preformattato,
  mai riparsato campo per campo.
- Non esiste nessun `rapporto.v1.json` da progettare, non esiste nessuna
  domanda su come versionare TALOS-BANCO (DEC-018 non si applica: non c'è
  niente lì da modificare).
- Resta fermo, invariato: *"Non si tocca AVM-harness né TALOS-BANCO"*
  (CONSEGNA-CODEX-HARNESS-UI.md, §5). TALOS-BANCO è in taratura attiva
  proprio in queste ore (Stadio B) da un'altra sessione — un secondo
  agente che vi scrive rischia una collisione reale, non teorica.
- DEC-019 fino a DEC-028 (forma del contratto, campo `detto`, campo
  `cambiamenti`, esiti non binari) restano **valide come principi generali
  di come Harness UI deve TRATTARE i dati che legge** (mai eseguire,
  render testuale mai HTML, mai confondere dato grezzo e derivato) — si
  applicano al contratto ESISTENTE (jsonl + rapporto testo), non a un
  contratto nuovo da costruire.

### DEC-055 — Il bar di qualità si ridimensiona a "strumento per l'owner" (sostituisce DEC-042/043/044/046, ridimensiona DEC-038)

**Decisione A.** Nessuna delle richieste seguenti è mai stata chiesta
dall'owner; sono estrapolazioni di Codex non ancorate a un'istruzione.
Harness UI resta quello che il disegno originale dichiarava: *"uno
strumento per l'owner, non un prodotto pubblico. Nessun deployment,
nessun hosting."* (`elegant-spinning-dongarra.md`, Traccia 2, §2.4).

- **DEC-044 (WCAG 2.2 AA) è ANNULLATA.** Regole di accessibilità per
  utenti sconosciuti con disabilità; qui l'unico utente è l'owner.
- **DEC-043 è RIDOTTA**: un solo motore browser (quello che l'owner usa
  davvero), non tre. Nessuna prova Chromium+Firefox+WebKit richiesta.
- **DEC-042 è SOSTITUITA**: si riusano le 6 risoluzioni già provate nel
  mockup (`UI_REVIEW.md`), non la matrice nuova a 8 punti — sono già
  validate, inventarne altre non aggiunge niente.
- **DEC-038 (service worker, offline-first) è ANNULLATA.** Il server e il
  browser girano sulla STESSA macchina, nello stesso momento: "funziona
  offline" non risolve un problema che esiste per questo strumento.
- **DEC-046 (budget prestazionali con soglie bloccanti) è ANNULLATA** come
  gate; restano solo numeri MISURATI e riportati, mai una soglia che
  blocca la consegna.
- **DEC-035, DEC-036, DEC-037 (local-first, IndexedDB, migrazioni
  versionate) sono ANNULLATE** per lo stesso motivo di DEC-038: nascono
  dallo stesso equivoco "prodotto pubblico", non servono a uno strumento
  locale con un server locale sempre disponibile quando serve guardarlo.

### DEC-056 — Cosa NON cambia

Tutto il resto del registro (in particolare: DEC-007 l'etichettatura
"Demo UI · non collegato", DEC-008/009/010 il mockup intero e la sua
provenienza, DEC-011/012/013 dati reali su allowlist esplicita,
DEC-023/024 il trattamento sicuro di `detto` e `cambiamenti`, DEC-029/030
il server loopback configurabile, DEC-050 commit piccoli e mai push,
DEC-052 il gate di chiusura) **resta valido**. Non erano in discussione, e
sono letture corrette del disegno approvato o precisazioni sensate.

### Effetto pratico immediato

Con DEC-004/005 annullate, il gate del §2 punto 1-3 (attesa del commit
mobile) non si applica più a questa traccia: Harness UI può procedere
sulla base già assegnata (worktree `AVM-harness-ui`, ramo
`lane/harness-ui`, dal commit di Stadio A `587f989f` in `AVM-harness`, per
com'era già scritto nel prompt originale) senza aspettare nessun commit
di `mobile/`. Restano fermi, invariati: ricerca web aggiornata (§2 punto
5), un ledger file-per-file per quello che resta da decidere (§2 punto 6),
e l'approvazione esplicita dell'owner sul ledger (§2 punto 7) prima di
scrivere codice di prodotto.
