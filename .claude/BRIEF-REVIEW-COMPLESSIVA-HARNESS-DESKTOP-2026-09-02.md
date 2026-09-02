# Brief — review complessiva Harness Desktop (UI/UX, backend, frontend, visiva, sintesi)

> Scritto per chi la esegue (Fable 5.1 in una sessione separata, o il
> proseguimento di questa). Owner: *"siamo sbattuti su un muro in cui
> l'interfaccia aveva un lag spaventoso e ancora oggi c'è del lag
> inspiegabile assieme a tutto il resto dell'interfaccia e del
> back-end... review complessiva sia UI/UX, back end, front-end, review
> visiva e sintetica."* Non ripartire dalle scoperte già fatte: sono
> elencate qui con dove stanno, non da riscoprire.

## 0 — Punto di partenza, non da rileggere da capo

- Lane: `C:\Users\Antonino\Desktop\projects\AVM-harness-desktop`,
  `lane/harness-desktop`. È lo stesso repository di `AVM` (mobile), in
  worktree diversi — vedi `git worktree list`.
- Server owner: `http://127.0.0.1:4174` — verificare `/api/v1/health`
  prima di toccare qualunque cosa, PID/comando/porta prima di un
  riavvio (regola del progetto, costata cara due volte).
- Ultimo commit: `cca79b08`, un **checkpoint di sicurezza** — 214 file
  di Codex (11 commit + lavoro non committato) messi al sicuro, **mai
  riletti riga per riga**. Non è una garanzia di correttezza, è solo
  "non si perde".
- Tre ledger da leggere per primi, in questo ordine, prima di guardare
  il codice:
  1. `.claude/LEDGER-BUNDLE-CANONICO-DIVERGENTE-2026-09-02.md` — quale
     file è VERO oggi (`harness-ui/public/`, non `mobile/public/
     harness-ui/`) e perché.
  2. `.claude/LEDGER-LAG-DESKTOP-2026-09-01.md` — la storia INTERA del
     P0 lag, riaperto **tre volte** (watcher/compositor → replay
     storico → interazione scroll/modali). Ogni riapertura ha
     invalidato la chiusura precedente. Leggerla tutta, non solo
     l'ultima sezione: il pattern "chiuso ma non era vero" si è già
     ripetuto tre volte su QUESTO stesso problema.
  3. `.claude/PIANO-COMPLETO-DESKTOP-2026-08-31.md` — stato dichiarato
     delle fasi, con l'addendum del 02/09 già corretto.

## 1 — Già verificato in questo giro (02/09, dopo la scrittura di questo brief) — NON rifare

`setBackgroundInteractionPause`/`syncBackgroundDialogPause`/
`queueBackgroundScrollPause` (`harness-ui/public/app.js:5982-6018`) —
riletta tutta la logica, tracciati i tre percorsi di chiusura di un
dialog (bottone/azione, Escape, click backdrop) fino in fondo, nessuno
scavalca la ripresa; teardown pulito. **Rilanciati dal vivo**
`LAG-INTERACTION-DIALOG-38`/`-39` — **2/2 passati** contro il server
owner reale. Dettaglio in `.claude/LEDGER-LAG-DESKTOP-2026-09-01.md`,
sezione "Seconda lettura — 02/09/2026". Nessun difetto trovato in
questa slice specifica.

⇒ **Conseguenza per la review**: se il lag è ancora presente come
riporta l'owner, la causa **non è qui**. Non ripartire da questo pezzo.

## 1-bis — Il filo NON verificato, ora priorità assoluta

La riapertura P0 PRECEDENTE a questa (sezione "Riapertura P0... replay
storico" nello stesso ledger) — coalescenza di `TextMessageContent`/
`WorkspaceChanged` su una sessione con molti eventi storici
(`realSession.deferHistoricalRendering`, `passaASessione()`,
`nuovaGenerazioneSessione()`). Dichiarata GREEN dal proprio autore, **mai
riverificata da un secondo lettore** in questo giro — stesso trattamento
appena dato al punto 1: rileggere la logica, poi riprodurre dal vivo
aprendo una sessione storica con centinaia di eventi (ce ne sono già
nel `.sessions-store/`) e misurare con CDP `Tracing`/`PerformanceObserver`,
non fidarsi del numero dichiarato nel ledger.

Se ANCHE questo regge, il colpevole del lag "di oggi" è un quarto
sospetto non ancora nominato — a quel punto serve un'attribuzione da
zero (stesso strumentario, stessi quattro scenari CDP già usati nelle
riaperture precedenti: `CHAT-SIDEBARS-OPEN`, `CHAT-SIDEBARS-COLLAPSED`,
`NEW-SESSION-SCROLL`, `COMMAND-PALETTE-SCROLL`, script già pronto in
`harness-ui/frontend/scripts/diagnose-interaction-lag.mjs`), non una
supposizione.

## 2 — Domande aperte, non decise, da NON decidere da soli

- **Il ponte `adb reverse` verso il telefono** (DEC-053, mai
  implementato) — se l'intento è ancora vivo, ora aggancerebbe un
  bundle esplicitamente desktop (font/logo propri). Segnalare
  all'owner, non decidere.
- **`mobile/public/harness-ui/`** resta sul disco, stantio (~95KB
  indietro). Nessuno l'ha dichiarato morto per iscritto.

## 3 — Perimetro della review, per dimensione

### Backend (`harness-ui/src/`, `harness-ui/tests/`)
- Stato noto: **1259/1259** verde (`node --test tests/**/*.test.mjs`,
  dalla radice `harness-ui/` — girare da `harness-ui/` stesso rompeva
  4 test per un percorso relativo fragile, corretto in `cca79b08`,
  verificare che sia rimasto corretto).
- Non ancora riletti a rischio: Model Lab locale (`hf-hub-client.mjs`,
  `local-model-store.mjs`, `local-runtime-probe.mjs` — scaricano file
  reali, eseguono un binario esterno `llama-server.exe`, gestiscono un
  token HF: superficie di sicurezza vera), `workspace-browser.mjs`/
  `workspace-launch-store.mjs` (nuovi, aprono percorsi sul filesystem
  reale), `harness-ui/scripts/windows/*.ps1` (registrazione HKCU,
  eseguita da un test ma mai da un umano).

### Frontend servito (`harness-ui/public/`)
- `app.js`/`index.html`/`styles.css` — il bundle VERO (§0.3). Cercare
  altri residui mockup oltre quello già trovato e corretto il 30/8 (il
  tab Files) — es. le righe con `TalosComposer.vue` ancora presenti nel
  pannello Review/diff-toolbar di `index.html` (righe ~185-222), MAI
  verificate se sono demo intenzionale o un secondo residuo.

### Nuova toolchain frontend (`harness-ui/frontend/`)
- Sistema di build/test PARALLELO (esbuild, Playwright, contract test,
  a11y, visual regression) — non ancora chiaro se `frontend/src/` è
  un rifacimento in corso destinato a sostituire `public/app.js` o
  solo infrastruttura di test per l'app esistente. Va capito leggendo
  `harness-ui/frontend/src/app/bootstrap.js` e se qualcosa lo importa
  da `public/`, prima di assumere l'uno o l'altro.
- `npm --prefix harness-ui/frontend run verify` e
  `npm --prefix harness-ui/frontend run test:browser` — mai rilanciati
  in questo giro di verifica, solo dichiarati verdi dal ledger.

### UI/UX
- Owner ha già segnalato e ottenuto corretti: mockup residuo tab
  Files, cartelle "più usate" finte (`.claude/
  LEDGER-MOCKUP-FILES-TAB-CARTELLE-FREQUENTI-2026-08-31.md` — verificare
  se questo nome file esiste ancora così o è stato rinominato). Cercare
  la STESSA famiglia di difetto altrove: ogni superficie che promette
  "reale" ma non ha un percorso `stato vuoto → stato pendente → stato
  reale` esplicito, come già accertato per Terminale/Browser/Review/
  Files.
- Le 8 categorie di Settings, il menu contestuale CRUD sessioni, il
  workspace chooser (`.claude/CONSEGNA-WORKSPACE-CHOOSER-2026-09-01.md`,
  `.claude/LEDGER-WORKSPACE-CHOOSER-2026-09-01.md`) — dichiarati fatti,
  mai riverificati dal vivo da un secondo lettore.

### Review visiva
- Screenshot già esistenti (non rifare da zero, controllare prima):
  `harness-ui/frontend/artifacts/p0-lag-2026-09-01/`,
  `harness-ui/frontend/artifacts/lag-interaction-2026-09-02/` (se
  esiste — il ledger la nomina come output atteso, verificare che sia
  stata prodotta davvero).
- Quattro viewport standard di questo progetto: tablet portrait
  (principale, primo e ultimo), tablet landscape, telefono verticale,
  telefono orizzontale — regola vincolante, mai solo desktop 1440×900.
- Tema chiaro E scuro — c'è un `LEDGER-TEMA-CHIARO-2026-09-01.md` mai
  incrociato con uno screenshot reale in questo giro.

## 4 — Metodo, non negoziabile in questo progetto

- Si strumenta sempre, mai ipotesi: ogni claim di "verde"/"corretto"
  ereditato dai ledger di Codex va **riprodotto**, non preso per buono
  — sono la sua parola, non una prova di questa sessione.
  ⛔⛔⛔ owner: "ANCORA OGGI c'è del lag inspiegabile" — significa che
  ALMENO una chiusura dichiarata "GREEN" nei ledger esistenti NON lo
  era per davvero, o non lo è più. Trovare quale, non assumere che sia
  l'ultima.
- Ogni funzione si prova anche al contrario (un caso che DEVE fallire).
- Screenshot scattati DURANTE, non solo alla fine; ispezionati per
  intero, non solo per la cosa che si stava cercando.
- Niente push. Commit locali sì, dichiarati per cosa sono (checkpoint
  vs. fix verificato — non mescolare le due etichette).
- ⛔⛔⛔⛔⛔⛔ MAI un Agent/sub-agente, nemmeno di sola lettura — vincolo
  assoluto di questo progetto specifico, non negoziabile.

## 5 — Consegna attesa

Un documento `CONSEGNA-REVIEW-COMPLESSIVA-2026-09-XX.md` con: per ogni
dimensione (§3) cosa è stato VERIFICATO dal vivo (non ereditato), cosa
è REALMENTE rotto con la causa attribuita a uno strumento (non a
occhio), cosa resta legittimamente aperto per l'owner (§2 più quanto
emerge), numeri prima/dopo per qualunque claim di prestazione, e gli
screenshot nominati per file.
