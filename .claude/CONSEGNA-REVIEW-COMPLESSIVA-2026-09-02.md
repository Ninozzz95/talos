# Consegna — review complessiva Harness Desktop (02/09/2026)

> Esegue `.claude/BRIEF-REVIEW-COMPLESSIVA-HARNESS-DESKTOP-2026-09-02.md`.
> Lane `lane/harness-desktop`, worktree `AVM-harness-desktop`, HEAD `aa0442ee`.
> Server owner `127.0.0.1:4174` (PID 17460, `node harness-ui/server.mjs`,
> avviato 02/09 00:17) mai riavviato, `/api/v1/health` 200 prima e dopo ogni
> misura. Nessun turno modello lanciato. Nessuna riga di codice prodotto
> toccata: solo documenti e due script diagnostici in `artifacts/`
> (gitignorati). Nessun Agent/Workflow.
>
> Tutto ciò che segue è **misurato in questa sessione**, non ereditato dai
> ledger, salvo dove è scritto "dichiarato da".

## 0 — La risposta al brief in tre righe

1. **Il lag "ancora oggi" non è nel codice.** Il Chrome dell'owner ha
   l'accelerazione hardware **disattivata** (`Local State`:
   `hardware_acceleration_mode.enabled=false`, nessuna policy di sistema).
   Stessa pagina, stesso Chrome 151, stesso server: da fermo **6,1 ms** per
   frame con GPU, **109 ms** (p95 212, 5-9 fps) senza. Le tre chiusure GREEN
   dei ledger erano vere e insufficienti: rendevano più economico ciò che il
   rendering software rende costoso per categoria.
2. **Il replay storico (§1-bis del brief) regge**: una sessione da 765 eventi
   produce 1 sola lettura dell'albero, testo differito, 930 ms con GPU. Ma la
   sessione stessa è patologica: workspace = **intero Desktop**, 490
   `WorkspaceChanged` (355 dopo la fine dell'ultimo giro), log da 1,9 MB
   rigiocato per intero a ogni apertura. Difetto di prodotto, non del replay.
3. **Suite tutte rilanciate dal vivo**: backend 1259/1259, `verify` frontend
   verde, browser 85 passati + 2 opt-in saltati. Review visiva su 6 viewport
   e 2 temi: **14 difetti** elencati in §4, tra cui i mockup Review/Browser
   ancora mostrati senza sessione e senza alcun badge "Demo UI".

## 1 — Il lag: attribuzione strumentata, non a occhio

### 1.1 Il quarto sospetto era l'ambiente

- Processo GPU del Chrome dell'owner (letto da `Win32_Process`):
  `--use-gl=angle --use-angle=d3d11-warp-webgl`. WARP è il rasterizzatore
  software di Windows; è il fallback che Chrome usa quando l'accelerazione è
  spenta (ricerca web fatta, più prova diretta sotto).
- `%LOCALAPPDATA%\Google\Chrome\User Data\Local State`:
  `"hardware_acceleration_mode": {"enabled": false}`. Nessuna chiave
  `HardwareAccelerationModeEnabled` in `HKLM`/`HKCU\SOFTWARE\Policies\Google\Chrome`
  ⇒ scelta dell'utente, non blocklist né policy. (Il ledger del lag, sezione
  aggiunta da un'altra sessione alle 08:54 di oggi, riporta l'owner: *"era la
  accelerazione hardware disattivata da me"* — coerente con quanto misurato
  qui, ma è la parola di quella sessione, non un fatto verificato in questa.)
- Hardware: AMD Radeon RX 9070 XT + un "SudoMaker Virtual Display Adapter",
  Ryzen 7 7800X3D, 31,6 GB. La GPU c'è ed è sana: `chrome://gpu` con
  accelerazione attiva mostra `ANGLE (AMD Radeon RX 9070 XT Direct3D11)`.

### 1.2 La matrice: stessa pagina, tre browser

Strumento: `harness-ui/frontend/artifacts/review-2026-09-02/diagnose-matrix.mjs`
(copia parametrizzata dello script diagnostico di Codex; legge `chrome://gpu`
PRIMA di misurare e lo scrive nel report). Viewport 1440×900, server 4174,
prima sessione della sidebar aperta, scroll reali con la rotella. Frame =
intervalli `requestAnimationFrame`; LoAF = Long Animation Frames API.
Report: `.../review-2026-09-02/{chrome-gpu,chrome-nogpu,headless-bundle}/report.json`
+ uno screenshot per scenario.

| scenario | A · Chrome 151 headed, GPU hardware | B · stesso Chrome, `--disable-gpu` (= owner) | C · Chromium headless bundle (= ledger) |
|---|---|---|---|
| `chrome://gpu` Compositing | Hardware accelerated | **Software only. Hardware acceleration disabled** (SwiftShader) | non leggibile (headless shell) |
| IDLE-5S, pagina ferma | 883 frame · mediana 6,1 · p95 6,1 · 0 sopra 16,7 ms | **49 frame · mediana 109,1 · p95 212,1 · 44 sopra 50 ms · 46 LoAF senza script** | 130 frame · mediana 33,4 · p95 50,1 · 77 sopra 33 |
| CHAT-SIDEBARS-OPEN, scroll | p95 6,2 · 0 sopra 16,7 | p95 6,2 · max 133 · 5 sopra 50 | p95 33,3 · 33/88 sopra 16,7 |
| CHAT-SIDEBARS-COLLAPSED | p95 6,2 | p95 6,2 · max 84,8 · 6 sopra 50 | p95 33,3 |
| NEW-SESSION-SCROLL | p95 6,2 · 0 sopra 16,7 | p95 6,2 · max 218 · 7 sopra 50 | p95 16,8 · 4 sopra 50 |
| COMMAND-PALETTE (digitazione+scroll) | p95 6,2 | **p95 200,1 · 19/117 sopra 50 · 21 LoAF** | p95 66,7 · 11 sopra 50 |
| REPLAY-HISTORICAL (sessione e572474a) | 930 ms · 1 LoAF da 58 ms | 1203 ms · 11 LoAF 111-226 ms, `scripts: []` | 1001 ms |
| REPLAY-LIVE-SYNTH (13.068 car., 162 delta) | 1,4 s · task 1,28 s · 8 frame sopra 16,7 | traccia non letta (IO.read fallito) | **6,7 s** |

Lettura: in B il costo è tutto compositing (LoAF con `scripts: []`, `RunTask`
2900× per 5,3 s, `ScriptDuration` trascurabile). La pausa dello sfondo su
scroll/modale (chiusura del 02/09) funziona anche in B — lo scroll puro è a
6 ms — ma appena il gesto finisce lo sfondo riparte e la pagina torna a 9 fps;
la digitazione nella palette non pausa nulla e paga 200 ms a frame. Il monitor
dell'owner va a ~165 Hz (mediana 6,1 ms in A): la differenza percepita fra A e
B è 18×.

La colonna C spiega perché i ledger sembravano verdi: il Chromium headless è
anch'esso software e ha un tetto a 30 fps, quindi "p95 33 ms" era il MASSIMO
possibile, non una misura di fluidità. Nessuno dei quattro scenari CDP
precedenti ha mai letto `chrome://gpu`.

### 1.2-bis Senza GPU, quanto recupera l'app da sola (misurato dopo la prima consegna)

Stesso Chrome con `--disable-gpu`, pagina ferma 5 s, sidebar aperte, report in
`.../review-2026-09-02/chrome-nogpu-degrado/report.json`:

| variante | frame in 5 s | mediana | p95 | sopra 50 ms |
|---|---|---|---|---|
| com'è oggi (sfondo in moto + backdrop-filter) | 48 | 109,2 ms | 121,2 ms | 46 |
| solo backdrop-filter spento, sfondo in moto | 94 | 60,5 ms | 66,7 ms | 60 |
| **solo sfondo fermo**, backdrop-filter intatto | **883** | **6,1 ms** | **6,1 ms** | **0** |
| sfondo fermo e backdrop-filter spento | 875 | 6,1 ms | 6,2 ms | 0 |
| palette: digitazione con sfondo in moto | — | p95 163,7 ms | | 13 |
| palette: digitazione con sfondo fermo | — | p95 109 ms | | 3 |

Lettura: senza GPU il costo dominante è l'**animazione degli orb** (che
costringe a ricomporre tutto ciò che sta sopra, sfocature comprese); il
`backdrop-filter` da solo pesa la metà. Fermare lo sfondo riporta la pagina
ferma allo stesso frame rate della GPU accesa. Il controllo esiste già nelle
impostazioni («Sfondo animato» → Statico, oppure «Sfondo attivo» spento):
l'owner può usarlo oggi, senza codice. Una rilevazione automatica del
rendering software (sonda rAF da fermo > 50 ms → sfondo statico) resta
possibile ed è la sola parte che richiede codice.

### 1.3 Cosa resta vero del codice (misurato in A, dove il compositing non maschera)

- **Streaming vivo**: `renderizzaMessaggioStreamingOra()`
  (`harness-ui/public/app.js:338`) riparsa TUTTO il markdown accumulato a
  ogni frame. Un messaggio da 13k caratteri in 162 delta costa **1,28 s di
  main thread** (style 0,30 s, layout 0,33 s, paint 222 ms), ~8 ms/frame che
  crescono linearmente col testo: a 40k caratteri si superano i 16,7 ms per
  frame. Non è il lag dell'owner (le sessioni salvate hanno al massimo 12,9k
  caratteri di testo), ma è un costo O(n²) reale durante una risposta lunga.
- **Replay differito** (§1-bis): `deferHistoricalRendering` si accende solo
  in `passaASessione()` per `conclusa:true` e si spegne in
  `nuovaGenerazioneSessione()`; verificato dal vivo `deferHistoricalRendering:
  true`, `treeCache: 1`, `treeRequests: 1` per 765 eventi. Regge. Il caso non
  coperto è un F5 durante un giro **in corso** (`conclusa:false`): tutto lo
  storico passa dal percorso vivo qui sopra. Non misurato con una sessione
  reale (avrebbe richiesto un turno modello).

## 2 — La sessione col Desktop intero come workspace

Sessione `e572474a-64a6-4c9a-9f0a-d5c50da7a05a`, `cartella: C:\Users\Antonino\Desktop`,
scelta dal chooser tramite la scorciatoia "Desktop · usata di recente".

| misura | valore |
|---|---|
| righe nel `.jsonl` | 756 (era 756 anche 10 s dopo: cresce solo quando qualcosa cambia sul Desktop) |
| `WorkspaceChanged` | **490**, di cui **355 dopo l'ultimo RunFinished/RunError** |
| byte del file | 1.895.541, di cui 1.499.579 (**79 %**) sono `WorkspaceChanged` |
| evento più grande | 55.625 byte, 352 percorsi; 13 eventi con più di 100 percorsi |
| da dove vengono i percorsi | `projects/AVM-harness-desktop` 9.989 · `projects/AVM-harness-mobile-chat-parity` 1.142 · altre lane |
| trasferito a ogni apertura | 1.606.366 byte via SSE (CDP `Network.dataReceived`) |

Meccanismo, letto nel codice: `iscriviti()` attiva il watcher anche su una
sessione conclusa finché un client SSE resta connesso
(`session-registry.mjs:2359`); `broadcast()` persiste OGNI evento, compresi i
`WorkspaceChanged` (`session-registry.mjs:570-595`); la guardia del watcher
ferma solo la radice del volume (`workspace-watcher.mjs:55`, `eRadiceVolume`).
Il Desktop è la casa di 14 worktree, dei test Playwright e degli editor: ogni
file che chiunque scrive lì diventa un evento persistito per sempre e un
`treeCache.clear()` + fetch dell'albero nel browser dell'owner.

Conseguenze: (a) il log di una sessione conclusa cresce senza tetto; (b) il
replay si allunga a ogni apertura; (c) la conversazione vera è il 21 % del
file. Decisione owner: trattare "Desktop"/"Home" come radici logiche (stessa
guardia di `C:\`), e/o non persistere i `WorkspaceChanged` (sono stato del
filesystem, non storia della sessione). Non implementato: è codice.

## 3 — Verificato dal vivo, per dimensione

### Backend (`harness-ui/`)
- `node --test "tests/**/*.test.mjs"` dalla radice `harness-ui/`:
  **1259/1259, 14,5 s**. Il fix del percorso relativo in
  `windows-open-with-talos.test.mjs` (`cca79b08`) è rimasto corretto.
- Letti per rischio: `workspace-browser.mjs` (rifiuto lessicale di `..`,
  controllo dei segmenti symlink con `lstat`, confronto `realpath` radice/
  candidato, nomi riservati Windows), `workspace-launch-store.mjs` (token
  64 hex in file `0600` creato con `wx`, `timingSafeEqual`, `realpathSync` +
  `R_OK|W_OK`), `llama-server-supervisor.mjs` (`processPolicy.spawn`, args in
  array, `shell:false`, `windowsHide`, `--host 127.0.0.1`, `--api-key`
  casuale a 32 byte), `hf-direct-transfer.mjs` (`importStream`: id contro
  `LOCAL_ID`, nome file = `basename`, senza `/` o `\`, `.gguf`, ≤240,
  `inside(rootDir)`), `hf-hub-client.mjs` (token solo nell'header
  `Authorization`, mai loggato; verso il client esce solo `keyConfigured`),
  `scripts/windows/*.ps1` (solo `HKCU:\Software\Classes`, `BaseUrl` vincolato
  a loopback http, token letto da file e validato `^[a-f0-9]{64}$`,
  `-ExecutionPolicy Bypass` nel verbo registrato — standard per un verbo
  Explorer ma da conoscere). **Nessun difetto di sicurezza trovato** in
  questa lettura.

### Frontend servito (`harness-ui/public/`)
- Il server serve esattamente il file su disco: `app.js` 530.197 byte, md5
  `2c9c8513…` identico. Bundle canonico confermato.
- Residui mockup in `index.html` **non intenzionali e senza badge**: pannello
  Review (righe 178-205: "3 file modificati", +68/−31/6-6/Basso,
  `TalosComposer.vue`/`chat-layout.css`/`composer.spec.ts`, diff finto,
  "Approva tutto") e pannello Browser (righe 212-229: telefono finto
  "09:41 · 5G · 87%", chat finta, `gpt-5.6-sol`). Con sessione reale
  `resettaSuperficiRealiDedicate()` azzera i contatori e la lista ma **non il
  corpo del diff** (`#diffPath`/`#diffCode` restano `TalosComposer.vue`).
  Senza sessione non azzera niente. In tutti i 150 scatti
  `demoBadgesVisible: []`: il badge "Demo UI" che dovrebbe marcarli è nascosto.
  Anche la campanella con badge "2" è `data-demo-action="notifications"`.

### Nuova toolchain (`harness-ui/frontend/`)
- `frontend/src/` **esiste** (app/, state/, design-system/, ui/, contracts/…):
  è il rifacimento parallelo delle Fasi 1-3, non importato da `public/`. La
  UI prodotto resta il monolite `public/app.js`.
- `npm run verify`: verde ("Fase 3 verificata: build, contratti, determinismo
  e laboratorio").
- `npm run test:browser` contro 4174: **85 passati, 2 saltati (opt-in), 45,6 s**.
- Lo script `diagnose-interaction-lag.mjs` e la cartella
  `artifacts/lag-interaction-2026-09-02/` (11 png + report) esistono davvero.
  Ma lo script lancia SEMPRE `chromium.launch({ headless: true })`: misura in
  software rendering (vedi colonna C).

### UI/UX e review visiva
Strumento: `.../review-2026-09-02/visual-review.mjs`; scatti in
`.../review-2026-09-02/visual3/` (150 png + `notes.json` con overflow, badge
demo, errori JS, dialog aperto per ogni scatto; una prima corsa incompleta è
in `visual/`). Viewport: tablet portrait 1200×1696 (primo, scuro+chiaro),
desktop 1440×900 (scuro+chiaro), tablet landscape 1696×1200, desktop
1024×800, telefono 412×915, telefono 915×412. Zero overflow orizzontale, zero
errori JS in tutti gli scatti. Ogni png è stato guardato per intero.

## 4 — Difetti trovati guardando gli screenshot (nessuno ereditato)

| # | dove (file screenshot) | difetto |
|---|---|---|
| V1 | `tablet-portrait-dark-02-review-nosession.png`, `-light-02`, `phone-portrait-dark-02` | Review senza sessione mostra il mockup intero, nessun badge demo |
| V2 | `tablet-portrait-dark-03-browser-nosession.png` | Browser senza sessione mostra il telefono finto con `gpt-5.6-sol` |
| V3 | `tablet-portrait-dark-05-review-session.png`, `desktop-1024-dark-05` | Con sessione reale: "0 file modificati" corretto, ma sotto resta il diff finto di `TalosComposer.vue` con "Commenta/Apri file" e "Approva tutto" attivo |
| V4 | ogni scatto | Campanella con badge "2" finto (`data-demo-action`) |
| V5 | ogni scatto della sidebar | Riquadro tratteggiato "Nessuna sessione ancora — premi «Nuova»" mostrato SOTTO quattro sessioni reali |
| V6 | `tablet-portrait-dark-01-fresh.png` e tutti i tablet portrait | "Fork questa sessione" va a capo su tre righe; campo cerca ridotto alla sola "C" |
| V7 | `tablet-portrait-dark-10-settings-first.png` (anche light) | Sezione Aspetto a 1200 px con inspector aperto: etichette sovrapposte alle caselle ("Sospendi finestra nascosta"), valori incollati alle etichette ("Velocità100%", "Ritardo progressivo 40ms") |
| V8 | `tablet-portrait-dark-11-settings-models.png` | Laboratorio modelli a 1200 px: colonna "Capacità di questa macchina" schiacciata a pochi px con i numeri sovrapposti, il pannello runtime le passa sopra; tile "Misur…", "Catal… non carica…" troncati |
| V9 | `desktop-1440-dark-01-fresh.png`, `-04`, `desktop-1440-light-02` | A 1440 il chip "Ambiente non osservato" copre la linguetta **Terminale** del selettore Chat/Terminale (si vede "Chat ↓0" e poi il chip) |
| V10 | `tablet-portrait-dark-12-session-contextmenu.png` | Righe lunghe di un blocco monospazio (README della risposta) tagliate a destra, senza a capo né scorrimento |
| V11 | `tablet-portrait-dark-13-new-session.png`, `desktop-1440-*-13` | Modale Nuova sessione: la sezione "Cartella scelta" e le card "Accesso al workspace" finiscono sotto il footer; a tablet portrait usa metà dell'altezza disponibile |
| V12 | `tablet-portrait-dark-09-dashboard.png` | Board: sessione con due `RunError` etichettata "Conclusa" e insieme "in attesa del primo giro" |
| V13 | `phone-landscape-dark-01-fresh.png`, `-04`, `-10`, `-13` | 915×412: nessun layout compatto — sidebar da 260 px fissa, selettore "Chat Terminale Bo…" tagliato da "↓0", il composer copre l'hero e la conversazione, la modale Nuova sessione mostra solo intestazione e barra percorso (albero e colonna destra invisibili) |
| V14 | `tablet-portrait-dark-11-settings-chat.png`, `-providers`, `-tools`, `-privacy`, `-workspace` | Cinque delle otto categorie Settings sono un paragrafo e un bottone che rimanda altrove ("Apri preferenze chat", "Apri provider", "Gestisci permessi"); le otto categorie esistono, il contenuto list-detail dichiarato no |

Confermati come corretti: menu contestuale sessione (Apri/Rinomina/Fork/Copia
identificativo/Elimina, chiusura con Escape), tab Files reale (radice del
worktree, `.git` come file: giusto in un worktree), Browser e Terminale
onesti con sessione, tema chiaro leggibile ovunque (contrasto ok sui testi
dell'assistente), palette comandi, otto sezioni Settings raggiungibili via
`setSettingsSection`, tablet landscape e 1024×800 senza sovrapposizioni
(a 1024 l'inspector è a scomparsa per design: il tab Files "fuori viewport"
segnalato dallo script non è un difetto).

## 5 — Aperto, per l'owner (non deciso qui)

1. **Accelerazione hardware del browser**: riattivarla (chrome://settings →
   Sistema) risolve il lag misurato; in alternativa il prodotto potrebbe
   rilevare un rendering software (nessuna API diretta: solo una sonda rAF da
   fermo > 50 ms) e degradare a `motionQuality=low` / niente
   `backdrop-filter`. È una scelta di prodotto: decidere se il desktop deve
   reggere anche senza GPU.
2. **Workspace "Desktop"**: guardia come radice logica e/o non persistere i
   `WorkspaceChanged` (§2). Codice: serve un ordine.
3. **Protocollo di misura**: ogni script di lag deve leggere `chrome://gpu`
   e girare almeno una volta in `channel:'chrome'` headed; la matrice qui
   sopra è riusabile così com'è.
4. **Mockup Review/Browser/campanella** (V1-V4) e i 10 difetti visivi
   restanti: da correggere in batch, riverifica visiva una volta sola alla
   fine (regola 6-ter).
5. Dal brief §2, ancora aperti e non decisi: ponte `adb reverse` verso il
   telefono (DEC-053) e `mobile/public/harness-ui/` stantio sul disco.
6. `.claude/LEDGER-LAG-DESKTOP-2026-09-01.md` ha modifiche **non committate
   di un'altra sessione** (08:54, sezione "Causa vera del lag"): non le ho
   toccate né incluse nel mio commit.

## 5-bis — Ordini dell'owner (02/09, dopo la prima consegna) e cosa è già fatto

| # | ordine | stato |
|---|---|---|
| 1 | B — «Sfondo animato → Statico» lo imposta l'owner nel suo Chrome; l'app andrà in un installer e girerà anche in modo nativo | in mano all'owner |
| 2 | B — mai vietare cartelle: fare come Claude Code/Hermes, ricerca competitor | **FATTO** (fase B, sotto) |
| 3 | mockup Review/Browser/campanella: non togliere, **agganciare a dati veri**, ricerca completa | fase D, in corso |
| 4 | tutti i 14 difetti visivi, coerenti e allo stato dell'arte dell'ultimo mese | fase E, dopo la D |
| 5 | streaming: sistemare la rianalisi completa a ogni frame | **FATTO** (fase C, sotto) |
| 6 | regola di misura (`chrome://gpu` + Chrome vero) | scritta in `MEMORIA-REGOLE.md`; da portare nello script diagnostico di repo |
| 7 | B — committare la sezione del ledger scritta dall'altra sessione | **FATTO**, `d6817d6a` |

### Fase B — `WorkspaceChanged` effimero (commit `666a5fa8`)
Dossier competitor: `.claude/DOSSIER-RICERCA-WATCHER-COMPETITOR-2026-09-02.md`.
Cura in `session-registry.mjs` `broadcast()`: consegnato solo agli iscritti
vivi, mai in `voce.eventi`, mai su disco; i log vecchi si filtrano al
ripristino. Nessuna cartella vietata. Misurato su server isolato 4177:
replay di e572474a **1.606.366 → 98.241 byte**, eventi 743 → 250, UI identica.
Backend **1261/1261** (RED→GREEN `WORKSPACE-CHANGED-EPHEMERAL-01/02`).

### Fase C — streaming incrementale
`renderizzaMarkdownIncrementale()` + `confineBlocchiStabili()` in `app.js`:
i blocchi chiusi (riga vuota fuori fence) si rendono una volta e restano gli
stessi nodi DOM, solo la coda si rifà; vale anche per il ragionamento. DOM
piatto invariato. Stessa misura di prima (13.068 caratteri, 162 delta, Chrome
con GPU):

| | prima | dopo |
|---|---|---|
| main thread totale | 1,28 s | **0,35 s** |
| style / layout | 0,30 s / 0,33 s | 0,03 s / 0,04 s |
| paint | 222 ms | 126 ms |
| frame sopra 16,7 ms | 8 | **0** |
| durata dello stream | 1,41 s | 0,98 s |

Test nuovo `LAG-LIVE-INCREMENTAL-40` (identità dei nodi stabili attraverso 40
delta, fence con riga vuota interna non spezza il blocco, testo finale
completo). Unit/contratto 57/57, browser **86 passati + 2 opt-in saltati**,
snapshot legacy aggiornato solo per `assets.app`.

## 6 — File di questa consegna

- Questo documento; riga indice in `.claude/MEMORIA-REGOLE.md`; nota di
  memoria `il-lag-era-fuori-dal-codice-gpu-spenta-nel-browser.md`.
- Strumenti e prove (gitignorati, sul disco):
  `harness-ui/frontend/artifacts/review-2026-09-02/diagnose-matrix.mjs`,
  `visual-review.mjs`, `chrome-gpu/`, `chrome-nogpu/`, `headless-bundle/`
  (report.json + png per scenario), `visual3/` (150 png + notes.json).
- Log delle suite nello scratchpad di sessione (`backend-suite.log`,
  `frontend-verify.log`, `frontend-browser.log`).
