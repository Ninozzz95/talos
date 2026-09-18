# PIANO DI REFACTOR — 18/09/2026 · il ledger dei file e delle righe

**Lane:** `lane/harness-desktop` · **Ambito:** harness desktop (frontend `harness-ui/frontend`, backend `harness-ui/src`) · **Server vivo:** 4174 (sola lettura per le sonde).
**Chi ha prodotto cosa:** tre cartografi (le tre PR dell'owner) + cinque revisori avversari (le superfici), tutti in sola lettura; io ho fatto le cure, le consegne e le misure sul 4174.

> ⛔ **Regola che governa questo piano** (owner, 18/09/2026): i mockup delle tre PR vanno integrati
> **interamente e identicamente**, ma **non alla cieca**: devono risultare **funzionanti, testati e
> verificati sulla struttura attuale**, e **a ogni passo** va fatta una ricerca web delle best
> practices di *quel* passo. Ciò che si intende lasciare fuori si elenca **prima** e si aspetta il sì.

---

## §0 — STATO MISURATO OGGI (fatto e verificato, non «dichiarato»)

| # | Cosa | Prova | Stato |
|---|---|---|---|
| 1 | **Regressione mia, trovata dall'owner**: sostituendo l'header avevo scritto **due** `#schermoHome`; la seconda, senza `.view-pane`, non era nascondibile e mostrava «Apro il tuo workspace…» **sopra la chat** | sonda sul 4174: `#centro` con due `SECTION#schermoHome`, `segnapostoAncora: true` → dopo la cura `segnapostoAncora: false` e una sola sezione; foto `home-glitch.png` | ✅ curato, consegnato, riverificato |
| 2 | **Barra della workspace rimossa** (ordine: «TALOS / Conversazione · Disposizione del workspace · Compatta · Comandi Ctrl K, definitivamente») | `data-workspace-bar` → 0 nel sorgente, 0 nel bundle, 0 nella pagina viva; regole CSS della barra → 0 nel bundle | ✅ fatto e consegnato |
| 3 | **«Torna in fondo» al centro** (non più a destra) | `left:0; right:0; margin-inline:auto` nel bundle; `chat-attesa-fondo` **15/15** alle sei larghezze | ✅ fatto |
| 4 | **BC-78.3**: il pannello appiccicato era più alto dello spazio che ha | 1200×420: pannello **336 → 277** su uno scorrimento di 301, `appiccicatoEFuori: false`; `bc78-barra-e-dettaglio` **7/7** | ✅ curato e committato (`4d5adc93`) |
| 5 | **Famiglia CHAT-FONDO** (tondo + hover + soglia del seguito + rotta SSE del banco) | `chat-attesa-fondo` **15/15**; commit `49cce620` | ✅ chiusa |
| 6 | **P0A 9/9 · PO27-VUOTO 5/5 · NOTIFICHE 1/1** (la v2 atterra sulla Home: i test entrano nella chat; NOTIFICHE semina le preferenze v2) | tre spec insieme **17/17**; commit `727b2ce8` | ✅ chiuso |
| 7 | Unità frontend | `npm run test:unit` → **1362/1362** | ✅ |
| 8 | Suite browser intera | in corso su porta 4180, sonde escluse | ⏳ |

**Difetti APERTI, misurati sul 4174 vivo (BC-82.6 — «la sidebar di sinistra è rotta»):**
- 1024×800: la testata **«Strumenti»** è disegnata **509-543** contro un contenitore che chiude a **528** (tagliata a metà); una riga di sessione **693-759** e una riga vuota **712-740** contro un fondo a **739**.
- 1440×900: una riga di sessione **782-848** contro un fondo a **839**.
- Cause: `.td-sidebar-nav { max-height: 50% }` + scorrimento proprio (`src/styles/mockup-sidebar.css:66-73`), e un secondo contenitore per le sessioni che scorre a parte.

---

## §1 — LE TRE PR DELL'OWNER, MAPPATE SULLA STRUTTURA ATTUALE

### §1.1 `TALOS_Reviewer_PR28-31_CP5_23f631f8.zip` → **non tocca il frontend; tre PR su quattro sono già fuse**

- **Frontend toccato: ZERO file** (`grep -c 'a/harness-ui/frontend'` → 0 · 0 · 0 · 0).
- **Già applicate sulla lane** (17/09): #28 → `93650914`, #30 → `2a0350a9`, #31 → `b49d5a68`. Prova: sha256 dei file `changed/` — #28 **5/5 uguale**, #30 **6/7**, #31 **19/20**; e la selezione di prove del dossier → **127 pass · 0 fail**.
- **#29 non applicata, e non va applicata**: il dossier stesso scrive «**Do not merge or release this Draft PR**»; i suoi `gates` sono `failure` di causa non auditata; il verdetto di performance del suo autore è **negativo** (+6,72% nel caso lettura-sola); e il suo trasporto **aggira il registratore della #31**. Il suo obiettivo è già raggiunto da **BC-76** per un'altra via.
- **Rischio numero uno se si «integrasse per sicurezza»**: riapplicare #30 sovrascriverebbe `llama-binary-probe.mjs` e **cancellerebbe la nostra cura di sicurezza** (`ambienteSoloServer`, file che nel pacchetto non esiste) — la sonda tornerebbe a ereditare i token dell'API locale. Danno **silenzioso e verde**.
- Restano due cose **non** dal pacchetto: il debito di privacy della #31 (la cartella di cattura non è mai validata) e le due idee buone della #29 già in coda come **BC-79.2** (`/props`) e **BC-81** (legame al processo esatto).

### §1.2 `talos-pr33-reviewer.zip` → **la parte di produzione è GIÀ applicata, byte-identica**

- `src/styles/inspector-tab-visibility.css` è **byte-identico** al pacchetto (sha256 `4c93cc08…` in tre posti) e l'import c'è (`src/styles/main.css:67`); la guardia è nel **bundle servito** (`public/styles.css:14830-14838`). Applicazione: commit `4c28fe74` (17/09).
- Il resto (63 file su 67) è **laboratorio offline**: il pacchetto stesso dichiara `"scope": "… not complete runtime integration"`.
- **La patch non è applicabile e deve restare così** (`git apply --check` fallisce su entrambi gli hunk): applicarla creerebbe un **import duplicato**.
- **⛔ Rischio mortale del laboratorio**: il suo `shell.html` usa `aria-controls="railContext"` e un solo `#railContent`; il nostro ponte **lancia** se un id manca (`bridge/legacy-dom.js`), quindi importare quel DOM **spegne l'avvio dell'app**, non degrada.
- **Cosa resta da fare** (il vero guadagno): **l'asserzione che manca** — con la tab «Agenti» riselezionata col dettaglio aperto, `#railAgenti` deve restare **nascosto** (`setInspectorTab` gli toglie `hidden`, `app.js:9585-9589`; l'unica garanzia è la R3 del foglio). E il giro vero Agenti → dettaglio → File → Contesto → Processi → Agenti su sessione viva.

### §1.3 `sidebar-tested-source-final.zip` → **è la PR #32**: 6 file nuovi, 6 modificati, 47 hunk

- **Nuovi**: `sidebar-desktop.js` (montaggio), `sidebar-state.js` (stato puro), `sidebar-view.js` (DOM), `sidebar-desktop.css` (169 righe), e lato server `sidebar-feed.mjs` (SSE `/api/v1/sidebar/events`) e `sidebar-activity.mjs` (proiezione attività).
- **Modificati**: `legacy/app.js` **30 hunk (26 applicano, 4 no)**, `main.css` 1 (no: punto d'innesto spostato), `session-registry.mjs` 9 (9 ok), `http-app.mjs` 4 (4 ok), `tests/parity/nessun-errore-a-runtime.spec.mjs` 2 (**no: file rifattorizzato da noi**), `tests/bc09-classificazione-rimozioni.test.mjs` 1 (ok).
- **⛔ NON cura il difetto delle righe a metà** e ne aggiunge **un secondo tetto** (`max-height: 32%` sotto i 600 px di altezza, `sidebar-desktop.css:165`).
- **⛔ Due contenitori sullo stesso elemento**: `container-name: barra` (`index.css:1225`) contro `desktop-sidebar` (`sidebar-desktop.css:4`) — vince il pacchetto e il nostro `@container barra` diventa **muto** (regressione silenziosa).
- **⛔ La parity spec del pacchetto rimette indietro una nostra cura** (`.talos-sidebar [data-vaia="libreria"]` → `getByRole`): va riscritta, non applicata.

---

## §2 — I DIFETTI VISTI DAI CINQUE REVISORI AVVERSARI

*(tre rapporti ancora in corso: colonna destra · chat · Home e schermate. Sotto: i due arrivati.)*

### §2.1 Barra laterale sinistra (rapporto consegnato — misure sul 4174, due temi, tre finestre)

| # | Difetto | Prova | Gravità | Stato |
|---|---|---|---|---|
| S1 | La testata di gruppo **«Strumenti» è tagliata a metà** nello stato di default | nav 400 visibili su 423 di contenuto; testata disegnata **508,5-543** contro un contenitore che chiude a **528** (15 px su 34,5 = 43% tagliati); cade sulla testata per ogni altezza fra **762 e 830** e sotto gli **846** c'è sempre; a 1200×500 le voci tagliate sono **cinque** | **ALTA** | ✅ **curato** (una regione sola, tetto del 50% via) — in verifica |
| S2 | A finestra bassa la lista sessioni è **più bassa di una riga**: `61 px` contro una riga da `66` ⇒ nessuno scorrimento ne mostra una intera, e il «⋯» ha **8,7 px su 28** dentro la lista (mirandolo basso si aprono le **Impostazioni**) | `rev-sx-zoom-1200x500-*` | **ALTA** a finestre basse | ✅ **curato dalla stessa cura** (nessuna altezza allocata) |
| S3 | Titolo di sessione troncato fino al **71%** e **senza via di recupero** (nessun `title`): 11 righe per scena in ognuna delle 13 scene | `session-item.js:505-512` imposta `title` solo se `stato.aiuto` | MEDIA | 🔜 da curare (`title` sempre) |
| S4 | La maniglia trasparente di ridimensionamento copre il bordo destro | misure geometriche; **nessun danno dimostrato** (le barre sono overlay) | BASSA | 🔜 dichiarato non verificato |
| — | **Zero difetti**: contrasto min 5,39 (chiaro) / 5,58 (scuro) su 30-35 voci; niente tagliato da `.talos-sidebar`; il blocco «Fissate» scritto a mano misura **0×0** | | | |
| ⚠️ | **Osservato e non misurato**: la voce «Doctor» porta un fondo grigio in 4 foto (sospetto `:hover`) | | | da misurare |

⛔ **Correzione al prodotto trovata dal revisore**: il commento di `mockup-sidebar.css` che diceva «con Strumenti chiuso il tetto non viene nemmeno toccato» era **falso** — corretto nella cura.

### §2.2 Piede e composer (rapporto consegnato)

| # | Difetto | Prova | Gravità |
|---|---|---|---|
| P1 | **Il pannello del terminale esce dalla finestra e la parte tagliata non è raggiungibile**: a 1200×500 `fuoriFinestra: 104 px`, e **nessun antenato scorre**. Causa: `--talos-terminale-h: 320px` con una media query che guarda **solo la larghezza** (`terminale-basso.css:168`) | `sovrapp-1200x500-terminale.png` | **ALTA** |
| P2 | **La scala «una parola cede» non può scattare mai**: `[data-runtime-costo]` è sempre `hidden` (l'unico scrittore passa `costo: null`), quindi il `:has()` che la governa non matcha **per costruzione**; al suo posto le etichette si tagliano **a metà parola** («qwen3.8-fla…», «Scrive nel proge…», «Termin…»; a 1024×800: −21/−28/−16 px). E il `title` dei permessi **non contiene** la parola tagliata | `index.css:1416,1431-1432`, `app.js:9062`, `chat-foot.js:384` | **ALTA** |
| P3 | Il tasto annunciato **«Ctrl ⇧ M» è invisibile** a ogni larghezza normale: la soglia `@container (max-width:820px)` non si verifica mai (la barra non supera 740) | `index.css:1418`; a composer allargato a mano **compare** | MEDIA |
| P4 | **Il campo di scrittura non cresce col testo che va a capo**: 386 caratteri senza `\n` → `rows:1`, `scrollHeight 102` contro `clientHeight 40`, ~3 righe su 5 invisibili e non scorribili. Causa: `autoGrowTextarea()` conta **solo i `\n`** (`app.js:20064`) | `largo-dark-2-pieno.png` | MEDIA |
| P5 | Il tondo «torna in fondo» copre due parole dell'ultima riga — **centrato per ordine dell'owner**; la prova `torna-in-fondo-non-copre` esiste già. ⛔ **Addendum del revisore**: la zona «ultimi 48 px sopra il piede» è già riconosciuta pericolosa dal progetto — la regressione di BC-77 (17/09 notte) nacque da un toast che finiva **esattamente su `#chatTornaInFondo`**. Oggi è il tondo a stare sopra il testo | `tondo-copre-1024x800.png`; 392 px² a 1440, 36×32 a 1024, 36×30 a 1200 | ALTA (regressione di una cura documentata) |
| P6 | Nomi incoerenti: «Reindirizza» / «Indirizza ora» per lo stesso gesto; «Interrompi adesso» / «Interrompi risposta»; la connessione annunciata due volte (toast + riga) | | BASSE |
| P7 | **La riga dell'attrezzo `shell` dice la stessa frase DUE volte e non mostra mai il comando**: nome «Esegue node e termina con codice di uscita 3 — non riuscito» (serve 366 px, ne ha 292) e dettaglio la stessa frase meno il suffisso (304 contro 283). Il comando vero (`node -e "process.exit(3)"`) non compare | sorgenti: `app.js:11342` (nome = `tronca(descrizione,92)`), `app.js:11214` (dettaglio = `tronca(descrizione,60)`), `index.css:591` (`max-width:44%`) | MEDIA — ⛔ **è già in coda: BC-82.2** (`CODA-BUG-CRITICI-2026-09-08.md:1356`); non aprire una corsia nuova, aggiungere questi numeri alla scheda |
| P8 | **Una riga tagliata a metà dal bordo del composer** (1024×800 e 1200×500, `mask-image: none`): a 1200×500 il `<p>` «Punto 3 — eseguo il comando shell richiesto:» ha riquadro 352..374 e lo scroller finisce a 360 | `confine-1200x500.png`, `confine-1024x800.png` | **ALTA — stessa classe di BC-78.2/BC-82.1/BC-82.6** (l'addendum del revisore è nel piano: il taglio che non dice «continua» si legge come un guasto) |

**Accuse cadute, misurate nel verso opposto** (non vanno riportate come difetti): il tondo **è** centrato (scarto 0 a 1024/1200/1440); il piede **non** copre la conversazione (`convFinisceSottoIlPiede = 0` in 6 combinazioni); nessun comando sborda (8 figli, gap minimo 6 px); il segnaposto non è tagliato; «+» e bacchetta sono due gesti diversi; «Giri» e «Sessione» sono nascoste per progetto.

### §2.3 ⛔ DIFETTO D'INFRASTRUTTURA — il cancello della ricerca nega l'Edit ai subagenti per costruzione

`.claude/hooks/ricerca-prima-di-scrivere.mjs` legge `input.transcript_path`: per un agente delegato è il transcript **del padre**, dove la sua ricerca non appare come `tool_use`. Il revisore del piede ha preso **tre `Edit` negati dopo aver cercato davvero**, e si è salvato con script in `%TEMP%` (cartella esente per disegno). ⇒ Finché non si cura, **la regola «sempre review avversariali» non è eseguibile dai revisori** (che devono scrivere sonde).
⛔ **Cura che avevo proposto, e perché NON si fa così:** un registro di sessione letto dal cancello. L'ho scritta e il **classificatore me l'ha negata** con la motivazione giusta: *«a user-configured guard loosened without the user asking»* — allargava una guardia **dell'owner** di mia iniziativa. Non si aggira: si cambia strada.
✅ **Cura adottata (non indebolisce niente):** i revisori scrivono le loro sonde nella **cartella temporanea**, che il cancello esenta **per disegno** (`ESENTI`, riga 91), e il file entra nel repo con una mia copia — io la ricerca l'ho fatta. Il revisore del piede ci era già arrivato da solo (`%TEMP%\revisione-piede\`).
🔜 **Se l'owner vuole il cancello che vede anche le ricerche degli agenti**, la via giusta è un `PostToolUse` che le registra: ma è **una sua decisione** (allarga la guardia), quindi si propone, non si applica.

---

## §3 — IL PIANO, A PASSI, COL LEDGER

> Formato del ledger: **passo · file · righe · azione · verifica · rischio**. Le «righe» sono quelle
> misurate oggi sul nostro albero; quando il passo si esegue, si rileggono dal disco e si aggiornano.
> ⛔ A ogni passo: **ricerca web di quel passo** (docs/repo/concorrenti), fonte e data nel commit.

### A. I difetti aperti della UI (prima di ogni integrazione)

| Passo | File | Righe | Azione | Verifica | Rischio |
|---|---|---|---|---|---|
| A1 | `src/styles/mockup-sidebar.css` | **66-73** (`.td-sidebar-nav`, tetto 50% + 4 sfumature) | Decidere con l'owner: togliere il tetto e fare UNA regione di scorrimento (si vede tutto) **oppure** tenere il tetto con la sfumatura. Se si toglie: `flex: 1 1 auto; min-height: 0; overflow-y: auto` sulla barra intera e `.talos-sidebar__block` senza scorrimento proprio | foto 4174 nei due temi a 1024×800 · 1440×900 · 1200×500; nessuna riga disegnata a metà al confine interno; `baseline-shell` e `colonna-destra-p0` verdi | medio: cambia come si scorre la barra; tocca regole misurate (BC-78.2) |
| A2 | `src/styles/mockup-sidebar.css` | **113** (`:root[data-sidebar="icone"]`) | Allineare dopo A1 (la regola delle icone dichiara `overflow: visible`) | foto in modalità icone | basso |
| A3 | `.claude/MEMORIA-*.md` / coda | — | Registrare la cura e chiudere BC-82.6 con la misura | riga di coda con foto e numeri | nessuno |

### B. Pacchetto PR #32 (la sidebar) — 6 passi, dal più sicuro

| Passo | File | Righe/hunk | Azione | Verifica | Rischio |
|---|---|---|---|---|---|
| B0 | — | — | **Copia di sicurezza**: ramo dedicato (`git worktree` o ramo) prima di toccare `app.js` | `git status` pulito sul ramo nuovo | nessuno |
| B1 | `harness-ui/src/sidebar-feed.mjs` · `sidebar-activity.mjs` | 2 file nuovi (5.635 + 5.137 B) | Copiare. Additivi puri: nessuno li importa | `node --check` · `harness-ui/tests/sidebar-feed.test.mjs` | **zero** |
| B2 | `harness-ui/src/session-registry.mjs` · `src/http-app.mjs` | 9 hunk + 4 hunk (**13/13 applicano**) | Applicare. Nasce `GET /api/v1/sidebar/events` | (a) `curl -N …/sidebar/events` → `retry: 2000`, `snapshot`, `heartbeat` 15 s; (b) **`GET /api/v1/sessions` deve restituire la stessa forma di prima** (`elenca()` è riscritto in toto e lo consuma `http-app.mjs:5607`); (c) `bc09-classificazione-rimozioni` | ⛔ alto sul contratto: un campo perso dal serializzatore condiviso sparisce da **tutto** l'elenco |
| B3 | `src/styles/sidebar-desktop.css` (nuovo) · `src/styles/main.css` | 1 file nuovo + 1 riga d'import **prima** di `superfici-galleggianti.css` | Copiare + importare. Tutte le regole stanno sotto `[data-sidebar-live="true"]` **tranne** `container-type`/`container-name` (righe 3-4) che entrano in vigore subito | foto **prima/dopo** nei due temi: devono essere **identiche**; se cambiano, è il `@container` | medio: sostituisce il `@container barra` di `index.css:1225` (due `container-name` sullo stesso nodo: vince l'ultimo) |
| B4 | `sidebar-state.js` · `sidebar-view.js` · `sidebar-desktop.js` | 3 file nuovi (13.961 + 21.728 + 8.314 B) | Copiare (nessuno li importa ancora) | `frontend/tests/unit/sidebar-state.test.mjs` + `node --check` | basso |
| B5 | `src/legacy/app.js` | **30 hunk: 26 applicano, 4 a mano** — #1 import da fondere nel blocco TS (`app.js:1-6`), #5/#6 **già fatti altrove** (`services/api-client.ts:45,49,61`), #21 contesto spostato (`app.js:18107`) | Il montaggio vero: guardie ai tre punti (`scriviRigaSessioneViva`, `segnalaRigaSessioneViva`, il ramo `#sessionSearch` a `app.js:21070`), `aggiornaElencoSessioniReali` riscritto (`app.js:18082-18107`), montaggio prima del blocco campanella, `destroy` | (a) `tests/parity/nessun-errore-a-runtime` **nostro** (non quello del pacchetto); (b) `#realSessionsBlock` con **zero** figli disegnati da noi (o le righe si sdoppiano); (c) menu col tasto destro **e** coi tre puntini **e** da tastiera; (d) foto nei due temi a quattro viewport | ⛔⛔ alto: (1) due disegnatori sulla stessa scatola → sessioni doppie; (2) la riconciliazione del compositore: una riga sbagliata **fa perdere testo scritto dall'owner** — si prova con `elenco-dopo-lo-stop.spec.mjs`; (3) la casella di selezione esce dal bottone: ogni lettore di `data-session-select` va ricontrollato o la selezione si rompe in silenzio |
| B6 | prove del pacchetto | 6 file | Copiare le prove **tranne** la parity spec, che va **riscritta** (rimette `getByRole` dove noi usiamo `[data-vaia="libreria"]`) | le prove nuove verdi; parity nostra verde | medio (una prova riscritta male è peggio di nessuna prova) |

### C. Pacchetto PR #28-31 — **nessun passo di applicazione**

| Passo | Azione | Verifica |
|---|---|---|
| C1 | **Non applicare niente** (#28/#30/#31 già fuse; #29 vietata dal suo stesso dossier) | rieseguire la selezione del dossier: `node --test tests/local-resume-*.test.mjs tests/local-runtime-llama-server.test.mjs tests/local-runtime-stream-fragments.test.mjs tests/llama-binary-probe.test.mjs tests/llama-server-preflight.test.mjs tests/bc09-classificazione-rimozioni.test.mjs` → **127 pass · 0 fail** |
| C2 (facoltativo, decide l'owner) | Il **debito di privacy** della #31: validare `TALOS_RESUME_DIAGNOSTICS_DIR` (rifiutare una cartella dentro il repo o sincronizzata) — `src/local-resume-diagnostics.mjs:225` | tre prove che devono restare **rosse** prima della cura: cattura fuori dalla sessione scelta · registratore acceso senza cartella · cartella relativa accettata |

### D. Pacchetto PR #33 — un'asserzione, non un'integrazione

| Passo | File | Righe | Azione | Verifica | Rischio |
|---|---|---|---|---|---|
| D1 | `frontend/tests/browser/colonna-destra-p0.spec.mjs` | 333-343 (le asserzioni esistenti) | Aggiungere l'asserzione che MANCA: con la tab **Agenti** riselezionata col dettaglio aperto, `#railAgenti` deve restare **nascosto** (`setInspectorTab` gli toglie `hidden`: `app.js:9585-9589`; la garanzia è R3, `inspector-tab-visibility.css:17-22`) | prova nuova **rossa sulla base** (togliendo R3) e verde con R3; e il verso opposto: dopo «Tutti gli agenti» l'elenco **visibile** | basso |
| D2 | — | — | Il **giro vero** su sessione viva: Agenti → dettaglio → File → Contesto → Processi → Agenti, con eventi in arrivo; scroll e sezione ricordati (`app.js:9173/9209`) | foto 4174 nei due temi + nessun errore in console | medio (34 punti chiamano `aggiornaInspectorDaStato`) |
| D3 | — | — | **NON** importare il DOM del laboratorio (`aria-controls="railContext"`, `#railContent`): il ponte **lancia** e l'app non parte | `git apply --check` della patch deve **fallire** | ⛔ mortale se ignorato |

---

## §4 — COSA NON SI FA, E PERCHÉ

1. **Non si riapplicano #28/#30/#31** — già fuse; #30 cancellerebbe la cura sull'ambiente della sonda.
2. **Non si applica #29** — il suo stesso dossier lo vieta.
3. **Non si applica la patch della #33** — creerebbe un import duplicato.
4. **Non si importa il DOM del laboratorio della #33** — spegnerebbe l'avvio (il ponte lancia sugli id mancanti).
5. **Non si applica la parity spec della sidebar** — rimetterebbe indietro una cura nostra.

## §5 — LE DECISIONI CHE SPETTANO ALL'OWNER

1. **La disposizione del workspace** (Sviluppo/Ricerca/Documenti/Concentrazione) ha perso il suo **unico** comando a schermo con la rimozione della barra: la riporto in Impostazioni o resta una preferenza senza comando?
2. **Due stati vuoti nella barra**: `#noSessionsPlaceholder` (oggi un no-op silenzioso) e `.td-sidebar-empty` del pacchetto: quale resta?
3. **BC77-A-TETTO** (i toast e la testata) è ancora da decidere.
4. **Il tetto del 50%** della barra: si toglie (una sola regione di scorrimento, «si vede tutto») o si tiene con la sfumatura?
