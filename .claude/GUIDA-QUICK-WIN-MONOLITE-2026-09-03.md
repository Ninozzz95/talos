# GUIDA QUICK WIN MONOLITE — prima di R-02 (03/09/2026)

> Owner 03/09, sera: «prima della R-02 vorrei componentizzare ed ottimizzare il monolite il più
> possibile senza che occupi molto tempo, modifiche quick win ed essenziali. Pianificalo e resta
> in attesa del mio via esplicito». Questo documento è il piano: **nessuna riga è approvata**,
> a differenza di R-01/R-02 (già «approvo» il 03/09). Ogni riga parte solo con un sì esplicito su
> quella riga.

## ⛔ Il file è sotto modifica concorrente — le righe si riverificano, non si fidano

Durante la stesura di questa guida `git status` ha mostrato `harness-ui/public/app.js` (+217/-3
righe), `styles.css` (+12) e `index.html` come **modificati e non committati da un'altra sessione**,
nello stesso worktree. Questa guida non li tocca e non li include in nessun commit (lezione
[[due-sessioni-stessa-cartella-intrecciano-i-commit]]). I numeri di riga sotto sono stati
**riverificati dopo aver notato la modifica** e sono corretti al momento della scrittura — ma il
file si muove: prima di eseguire Q-01/Q-02, rilanciare i `grep -n` di questa guida, non fidarsi dei
numeri stampati.

## I fatti misurati su `harness-ui/public/app.js`, il 03/09/2026 (sera, riverificati dopo la modifica concorrente)

Tutti verificati con `grep -n` diretto sul file, non stimati:

- **~12.450 righe, ~660 KB** (in movimento, vedi sopra), un'unica chiusura
  `(() => { 'use strict'; ... })()`. Non generato, non minificato (sorgente leggibile), nessun
  passo di build.
- **304 funzioni di primo livello** dentro quella sola chiusura (erano 298 prima della modifica
  concorrente: l'altra sessione ne ha aggiunte).
- **Sei superano le 300 righe**, tutte al centro dell'orchestrazione reale:
  `creaWorkspaceChooser` 627 righe (riga 10216), `handleRealEvent` 510 (8719), `executeCommand`
  464 (**11596**, era 11483 prima della modifica concorrente), `openSheet` 460 (4805),
  `creaModelPicker` 421 (4072), `nuovaGenerazioneSessione` 377 (9273).
- Le due più vicine a poter essere isolate — `creaWorkspaceChooser` e `creaModelPicker` —
  referenziano lo stato condiviso (`state.`) 10 e 6 volte; `handleRealEvent`, il dispatcher degli
  eventi reali, lo referenzia **57 volte**. Anche le "più semplici" chiamano ~80 altre funzioni
  del file: un'estrazione pulita porterebbe con sé una fetta grande della chiusura, non solo la
  funzione.
- **Riuso già presente**, non è un copia-incolla ingenuo: l'helper `textElement(` è chiamato 246
  volte, gli helper condivisi `$`/`$$`/`ROOT()`/`HOST()` sono usati ovunque, 58 commenti «FASE»
  segnano già sezioni logiche nella testa di chi ha scritto il file.
- **Copertura di test diretta sottile**: 7 file su 92 nel backend toccano il contenuto di `app.js`
  (`code-block-formatter`, `model-fit-ui`, `model-lab-e2e`, `response-activity-indicator`,
  `session-row-state`, `memoria-pannello`, `audit-harness-findings`). Letto `code-block-formatter.test.mjs`
  riga per riga: non eseguono le funzioni isolate, fanno `assert.match(testoDiAppJs, /regex/)` **sul
  testo sorgente**. Motivo: `app.js` non ha `export`, quindi i test non possono importare le sue
  funzioni — l'unica via che hanno è leggere il file come testo. **Spostare fisicamente una
  funzione romperebbe alcune di queste asserzioni testuali anche a comportamento identico**, e
  andrebbero riscritte insieme allo spostamento.
- **Una componentizzazione vera esiste già**: `frontend/src`, 41 file JS, 1,1 MB, con la sua suite
  di test in cinque cartelle (`browser/component/contract/integration/unit`). È spenta di
  proposito: `frontend/scripts/package-frontend.mjs` esce con codice 2, messaggio «cutover resta
  disabilitato fino alla fase di consegna». Questa è Wave 3 del piano A-Z (W3-01…W3-08, 66,5 gg
  già stimati, guida propria).

## Perché NON propongo di toccare le sei funzioni grandi ora

Sono il cuore vivo della sessione reale (ciclo di vita, dispaccio eventi, esecuzione comandi), la
loro rete di prova diretta è testuale e sottile, e la componentizzazione vera è già pianificata e
finanziata come Wave 3 con la sua disciplina RED/GREEN e la convenzione `PARITA.md`. Farla «in
fretta e il più possibile» ora userebbe lo stesso rischio di Wave 3 senza la sua rete di prova —
è esattamente il tipo di regressione silenziosa che la disciplina del progetto (verifica visiva,
niente lavoro frammentato, riprodurre prima di dichiarare risolto) esiste per evitare. Non è un
quick win: è Wave 3 fatta di corsa. Stessa conclusione per abilitare la compressione HTTP
(gzip/brotli) sulle risposte statiche: controllato, e **scartato** — il server è solo loopback
(`127.0.0.1`, vedi `harness-ui/README.md`), quindi il costo vero è l'analisi del motore JS nel
browser, non il trasferimento di rete, e comprimere non lo tocca.

## Cosa propongo come quick win vero, prima di R-02

### Q-01 — Consolidare le dichiarazioni CSS frammentate dello stesso selettore (0,5 gg, per analogia con W0-04)

**Fatto** (riverificato dopo la modifica concorrente, righe correnti): censimento dei selettori di
primo livello ripetuti in `public/styles.css` (~2.744 righe, ~216 KB, in movimento): `.composer` in
3 blocchi separati (righe 715, 1843, 1881), `.app-shell` in 3 (235, 1566, 1590), e altri ~8
selettori (`.workspace-chooser-selection`, `.topology-actions`, `.topbar`, ecc.) in 2 blocchi
ciascuno. Verificato che almeno i due controllati non sono dentro `@media`: sono dichiarazioni
successive che aggiungono 1-2 proprietà, non media query legittime. Le righe esatte vanno
riconfermate con `grep -n "^\.composer {"` all'esecuzione: il file è sotto modifica concorrente
(vedi sopra).

RED
1. Script di sola lettura (scratchpad) che elenca ogni selettore di primo livello ripetuto fuori da
   `@media`, con le righe esatte — base per sapere cosa consolidare, non un test automatico nuovo.
2. Screenshot di riferimento con la pipeline esistente (`scripts/qa-chrome.ps1`, sei stati
   canonici) o `qa-visual-pipeline.mjs` per gli scenari CDP: **prima** della modifica.

GREEN
3. Per ogni selettore del censimento, unire le dichiarazioni nella prima occorrenza, cancellare le
   successive. Nessuna proprietà persa, nessuna riordinata rispetto alla cascata se non
   esplicitamente verificato innocuo (stesso selettore = stessa specificità, l'ordine fra loro non
   cambia l'esito finale se le proprietà non si sovrappongono — verificare quelle che si
   sovrappongono una per una).
4. Rilanciare la pipeline di screenshot, confrontare con `pixelmatch` (già dipendenza di
   `frontend/package.json`) contro il riferimento del passo 2: zero differenza oltre la tolleranza
   di anti-aliasing.

Evidenza: tabella selettori-consolidati con riga prima/dopo; screenshot 1024×800 e 1440×900 a
confronto pixel. Rollback: revert del commit, nessun formato cambia. Criterio: stesso numero di
dichiarazioni effettive per selettore, zero differenza visiva misurata.

### Q-02 — Censimento a mano delle funzioni senza chiamanti, rimozione solo di quelle confermate morte (1 gg, per analogia; può chiudere a zero rimozioni)

**Fatto onesto**: un primo tentativo automatico in questa sessione (contare le occorrenze di ogni
nome di funzione con un ciclo shell) ha dato un **falso positivo** — ha segnalato
`suggerimentoDaUltimoAttrezzo` come priva di chiamanti, ma verificata a mano la funzione è chiamata
alla riga 9134. Lo script aveva un difetto nel confine di parola. **Non uso quello script per
decidere cosa cancellare**: serve una verifica a mano, funzione per funzione, o uno strumento
affidabile (non trovato/costruito in questa sessione).

RED
1. Elenco delle 298 funzioni di primo livello (già estratto, riproducibile con
   `grep -n '^  function ' public/app.js`).
2. Per ciascuna, verifica a mano del numero di chiamanti nel file, nei test, in `index.html`: `grep
   -n '\bnomeFunzione\b'` e lettura dei risultati, non solo il conteggio.

GREEN
3. Solo le funzioni con **zero** chiamanti confermati a mano vengono rimosse, **una alla volta, un
   commit per funzione** (mai un commit unico per tutte: se una rimozione rompe qualcosa, il
   rollback deve poter isolare quale).
4. Dopo ogni rimozione: `node --test harness-ui/tests/*.test.mjs` e, se la funzione rimossa era
   citata per nome in un test testuale (§ sopra), aggiornare quel test nello stesso commit.

Evidenza: tabella delle funzioni esaminate, quante confermate morte, quante rimosse, `verify:all`
verde dopo ogni rimozione. Rollback: revert del singolo commit. Criterio: zero funzioni rimosse
senza una verifica manuale dei chiamanti; **un risultato di zero rimozioni è un esito valido**, non
un fallimento — è la stessa regola del motore locale («una negativa è comunque una misura»).

## Esiti (03/09-04/09, dopo il via esplicito dell'owner: «totalmente approvati»)

**Q-01 — fatto.** 24 selettori di primo livello consolidati (`.app-shell`, `.composer`,
`.workspace-chooser-selection`, `.workspace-chooser-browser`, `.topology-actions`, `.topbar-right`,
`.topbar-center`, `.topbar`, `.tool-row`, `.toast-region`, `.toast`, `.title-button`,
`.sessions-panel`, `.send-btn`, `.run-state`, `.queue-toggle`, `.provider-field`,
`.provider-feedback`, `.provider-actions`, `.mode-tab`, `.inspector-panel`, `.context-chip`,
`.composer-wrap`, `.command-search`) — 2.804 → 2.780 righe. Verifica: due server reali con
`TALOS_HARNESS_UI_PUBLIC_DIR` puntato rispettivamente al vecchio e al nuovo `styles.css`,
screenshot Playwright su chat e settings, 1024×800 e 1440×900, confronto `pixelmatch`: **0 pixel
diversi su 4/4 combinazioni**. Suite backend e frontend verdi dopo la modifica.

**Q-02 — chiuso a ZERO rimozioni, esito valido.** Censimento delle 314 funzioni di primo livello
(numero cresciuto da 298 per i commit di un'altra sessione arrivati nel frattempo) con conteggio
delle occorrenze via regex `\b` **in Node**, non nel ciclo bash che in questa stessa sessione aveva
dato un falso positivo su `suggerimentoDaUltimoAttrezzo`: **0 funzioni con una sola occorrenza**
(solo la propria dichiarazione). Nessuna rimozione: non c'è niente di confermato morto da togliere.
Il criterio della riga permette esplicitamente questo esito.

## Cosa NON è incluso, e perché

- Estrarre `handleRealEvent`, `executeCommand`, `openSheet`, `creaWorkspaceChooser`,
  `creaModelPicker`, `nuovaGenerazioneSessione` in file separati: è Wave 3, non un quick win (sopra).
- Compressione HTTP delle risposte statiche: il server è loopback, non porta beneficio misurabile.
- Riorganizzare `app.js` in più file `<script>` caricati in sequenza: senza un vero sistema di
  moduli (ES modules o un passo di build) la chiusura condivisa (`$`, `$$`, `ROOT()`, `HOST()`,
  `state`) andrebbe spezzata a mano, con lo stesso rischio delle sei funzioni grandi. È Wave 3.
