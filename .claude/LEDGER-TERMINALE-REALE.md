# Terminale REALE (PTY) — correzione e ledger

## Stato: ✅ CHIUSA 28/8, verificata dal vivo (tastiera reale via CDP)

> Owner, 28/8, testuale: *"non so come hai integrato il terminale ma a
> me mi dà nessun comando eseguito in questa sessione [...] deve essere
> un terminale vero e proprio bash customizzato un po' come fa Ermes
> con stile Talos [...] un vero e proprio terminale bash che non ha
> limiti ovviamente usabile dall'utente con le sue dita umane, ack e
> continua"*.

## Correzione: il blocco 4 (§1.3-BIS) era chiuso su un fraintendimento di scope

Il piano madre (`elegant-spinning-dongarra.md`, §1.3-BIS, blocco 4) e la
matrice competitiva (Parte 2.2, riga "Terminale reale nella UI") davano
questa capacità per **chiusa e pari ai concorrenti**. Era vero per
un'interpretazione più stretta: una vista che mostra, riga per riga, i
comandi che **l'AGENTE** ha lanciato (tool `shell`, o `!comando` che
rilancia `talosLavora` con un unico comando) — il codice stesso lo
dichiara esplicitamente in un commento (`app.js:2664`): *"Non un vero
emulatore (niente cursore che si muove, niente ANSI)"*.

Non è quello che l'owner intende per "terminale vero": una shell reale,
interattiva, con TTY vero (colori, cursore, programmi interattivi come
`vim`/`top`), digitabile DIRETTAMENTE dall'utente, indipendente da una
sessione agente. Il blocco 4 **riapre** con questo scope corretto — non
è un buco nuovo, è lo stesso buco già segnalato altrove in questa
sessione quando una spunta "fatto" si è rivelata vera solo a grana
grossa (`TAL-L-018`, in archivio nello stesso piano madre).

## Perché il vecchio disegno non può diventare questo con una patch

`runDirectShell` → `POST /sessions/:id/shell` → `sessionRegistry.shell()`
rilancia **lo stesso `talosLavora`** usato per un task agente, con UN
comando fisso come "task", passato per il sandbox/timeout/troncamento
già previsti per l'attrezzo `shell` dell'agente (`eseguiComandoSandboxato`,
§1.3-BIS.T). Tre limiti strutturali, non correggibili incrementalmente:
1. **Non interattivo**: invia una stringa, aspetta l'esito finale — zero
   TTY, impossibile lanciare un editor o un REPL.
2. **Richiede una sessione agente viva** (`state.realSession.id`) — da
   qui il sintomo riportato: terminale vuoto quando nessuna sessione è
   in corso.
3. **Ha limiti** (timeout, troncamento output) per costruzione — corretti
   per un attrezzo dato in mano a un modello, sbagliati per una shell
   data in mano al proprietario della macchina.

## Ricerca fatta prima di scrivere (REGOLA ZERO, Hermes per primo)

- **Hermes Agent** (bersaglio primario): *"The dashboard's /chat tab
  embeds a real terminal via a POSIX PTY (ptyprocess)... true
  interactive bash shell interaction with human input."* Su Windows,
  **dove Hermes non ha un primitivo PTY POSIX nativo, monta Git Bash** —
  *"same strategy Claude Code uses"* ([hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com/docs/user-guide/windows-native), [blakecrosley.com/guides/hermes](https://blakecrosley.com/guides/hermes)).
  ⇒ Design diretto da copiare: su questa macchina (Windows), la shell
  reale è **Git Bash**, non `cmd.exe`/PowerShell — coerente con "un
  terminale bash", testuale nella richiesta dell'owner.
- **Stato dell'arte 2026 per un terminale nel browser**: xterm.js
  (rinominato `@xterm/xterm`, v6.0.0 — 18/8/2026) + `node-pty` sul
  backend + WebSocket come trasporto, è **l'unico pattern usato in
  pratica** ovunque (VS Code, Theia, Hyper, ttyd, code-server) — non
  un'opzione fra tante. Guida di sicurezza raccolta: autenticare PRIMA
  di accettare il socket, validare l'Origin, preservare i byte di
  controllo/le sequenze ANSI senza incapsularle in JSON che le
  corromperebbe ([itechguides.com/xterm-js](https://www.itechguides.com/xterm-js-build-terminals-in-the-browser/), [xtermjs.org/docs/guides/flowcontrol](https://xtermjs.org/docs/guides/flowcontrol/)).

## Verificato empiricamente su QUESTA macchina, non presunto

- `node-pty@1.1.0` include prebuild `win32-x64` **dentro il pacchetto
  npm stesso** (`prebuilds/win32-x64/{conpty,pty}.node` + `winpty-agent.exe`)
  — zero compilazione, zero Visual Studio Build Tools richiesti. `node
  -e "require('node-pty')"` carica pulito.
- Git Bash è installato: `C:\Program Files\Git\bin\bash.exe` (lo stesso
  binario che questa stessa sessione Claude Code usa per il tool Bash).
- **Sonda reale**: `pty.spawn('C:/Program Files/Git/bin/bash.exe',
  ['--login','-i'], {name:'xterm-256color', ...})`, scritto un comando
  vero (`echo hello-from-real-pty && pwd && node --version`) come
  keystroke (`p.write(...+'\r')`), catturato l'output: prompt MINGW64
  reale, sequenze ANSI vere (`\x1b[32m`, OSC title, bracketed-paste),
  esito dei tre comandi corretto. **Non un'ipotesi — una PTY vera,
  osservata.**

## Design

### Backend — `harness-ui/src/pty-terminal.mjs` (nuovo)

- `sceltaShell(deps)` — su `win32`: cerca `C:\Program Files\Git\bin\bash.exe`
  (percorso iniettabile per i test, `existsFn` iniettabile); se assente,
  fallback dichiarato a `cmd.exe` con un flag `powershellFallback:true`
  nel risultato (mai un fallback silenzioso — stesso principio "onestà
  sull'enforcement" già usato in `eseguiComandoSandboxato`). Su POSIX:
  `process.env.SHELL || '/bin/bash'`.
- **Registro per id** (chiave = `sessionId` quando una sessione è
  aperta, altrimenti un id di terminale standalone generato lato
  client): `{ptyHandle, bufferBacklog (ring buffer, tetto 200 KB),
  ultimaDisconnessioneAt}`. Una WS che si riconnette sullo STESSO id
  riaggancia la PTY viva invece di aprirne una seconda (un F5 non perde
  la shell) — replay del backlog prima di tornare live, stesso principio
  del `Last-Event-ID` già in uso per SSE.
- Un reaper (`setInterval(...).unref()`, stesso stile di
  `automation-scheduler.mjs`) chiude le PTY disconnesse da più di 10
  minuti — non un tetto sulla shell VIVA (nessun timeout mentre è
  attaccata: "non ha limiti" si applica qui), solo pulizia di processi
  orfani da una scheda mai più tornata.
- Nessun timeout, nessun troncamento dell'output, nessuna allowlist di
  comandi — a differenza dell'attrezzo `shell` dell'agente: qui è la
  mano del proprietario della macchina, non un modello.

### Trasporto — WebSocket, stesso `http.Server`, nessuna porta nuova

- `server.mjs`: `server.on('upgrade', ...)` sullo STESSO server HTTP già
  bindato solo su loopback (`config.host`, validato in `config.mjs`) —
  zero nuova superficie di rete, la WS eredita lo stesso bind.
- Path atteso `/api/v1/terminal/ws?id=<id>`; **validazione Origin
  esplicita** (deve combaciare `http://<host>:<porta>` del server
  stesso) PRIMA di completare l'upgrade — mitigazione diretta del
  rischio "cross-site WebSocket hijacking" trovato in ricerca (un
  browser non applica la same-origin policy alle WebSocket come la
  applica a `fetch`).
- Framing binario, un byte di comando in testa (stesso principio
  "mai wrappare lo stream in JSON" dalla ricerca): `0x00` = dati grezzi
  (client→server: byte da scrivere nella PTY; server→client: output
  della PTY), `0x01` = controllo JSON (client→server: `{cols,rows}` su
  resize; server→client: `{evento:'uscita', codice}` alla chiusura
  della shell).
- Dipendenza: pacchetto `ws` (8.21.3) — stesso principio di
  `chokidar`/`docx` in `harness-ui/package.json`: un'eccezione dichiarata
  al "zero dipendenze", SOLO nel backend, mai nel bundle frontend.

### Frontend — xterm.js vendorizzato, zero CDN, zero build step

- `mobile/public/harness-ui/vendor/xterm/{xterm.js,xterm.css,addon-fit.js,LICENSE}`
  — build UMD ufficiale (`@xterm/xterm@6.0.0`, MIT), scaricata una volta
  e committata come asset statico, MAI una `<script src="https://...">`:
  stesso principio "self-contained" già rispettato per fontane/loghi in
  questo bundle. Si attacca a `globalThis` (`window.Terminal`,
  `window.FitAddon.FitAddon`) — un `<script>` classico, coerente con
  `app.js` che NON è un modulo ES (`<script src="app.js">`, non
  `type="module"`).
- `index.html`: il markup statico `<pre class="terminal-window"><code>...`
  (il "pty demo" finto) diventa un contenitore di mount
  `<div class="terminal-window" id="realTerminalMount"></div>`; il
  chip di stato passa da "pty demo" a uno stato vero (connesso/in
  attesa/disconnesso).
- `app.js`: nuova funzione `montaTerminaleReale()` — istanzia
  `Terminal` col tema TALOS (`--bg-deep #17181b`, `--text-2 #d6d2ca`,
  `--accent #c08b3c` per il cursore/selection), apre la WebSocket verso
  `/api/v1/terminal/ws?id=...`, `term.onData()` → frame `0x00` sulla WS,
  frame `0x00` dalla WS → `term.write()`, `FitAddon` + `ResizeObserver`
  per il resize (frame `0x01`). Montato PIGRO (solo alla prima apertura
  della vista Terminale, mai al boot — stessa disciplina "niente fetch
  fantasma al mount" già in uso per Board/sessioni), un'istanza per id
  di terminale (session-scoped quando una sessione è aperta, altrimenti
  un id standalone stabile per la scheda del browser).
- ⛔ Deliberatamente FUORI da questo giro: unire l'output della shell
  dell'agente (tool-call `shell`) nella STESSA PTY che l'utente digita —
  restano due canali separati (l'agente continua a comparire nel log
  tool-call della chat, invariato) per evitare una race fra tastiera
  umana e scrittura automatica nello stesso terminale. Segnalato, non
  perso.

## Verifica — ESEGUITA

1. ✅ `pty-terminal.test.mjs` (17 test) + `terminal-ws.test.mjs` (11) +
   `session-registry.mjs::cartellaDi` (2) — PTY/WS finti iniettati, mai
   una shell vera nei test unitari. Copre: scelta shell (Windows→Git
   Bash, fallback dichiarato), registro per id, riaggancio su
   riconnessione + replay backlog, reaper che chiude solo le PTY
   scadute (AL CONTRARIO: mai una viva), framing binario (AL CONTRARIO:
   frame vuoto/tipo ignoto → `null`, mai un crash), Origin fuori
   allowlist → 403 senza upgrade (AL CONTRARIO di un Origin valido).
2. ✅ Suite backend intera: **418/418** verdi (era 374 all'inizio di
   questa sessione — +44 fra hook-registry e questo lavoro).
3. ✅ Suite frontend intera: **6642/6684** verdi, gli stessi identici 32
   fallimenti pre-esistenti ed estranei (androidAssetsConformance/
   gitBashLauncherConformance/shadcnConformance) — zero regressioni.
4. ✅ **Dal vivo via CDP, tastiera VERA** (`Input.insertText`+
   `Input.dispatchKeyEvent`, non un `.value` sintetico — xterm.js non
   legge un value, ascolta eventi di tastiera reali sul suo textarea
   nascosto). Nuovo scenario `terminale-reale` in
   `qa-visual-pipeline.mjs` (riusabile, committato): apre il tab,
   aspetta la PTY vera (`attendiCondizione`, non un'attesa fissa —
   stessa lezione già in memoria per il catalogo modelli), click REALE
   (`Input.dispatchMouseEvent`, non `el.click()` — xterm prende il
   focus solo su un mousedown vero) dentro il pannello, digita
   `echo <marcatore>`, preme Invio, verifica il marcatore nello
   schermo VERO di xterm (`term.buffer.active`, non il DOM/canvas che
   possono mentire), verifica i colori ANSI campionando i PIXEL VERI
   del canvas (`getImageData`, non un'impressione visiva) — **629
   colori RGB distinti**, prompt verde/magenta/giallo/ciano reale.
   Cinque screenshot, tutti ispezionati uno per uno.

### Tre bug reali trovati SOLO dalla verifica dal vivo (mai dai test unitari)

1. **Asset vendorizzati mai serviti**: `static-files.mjs` ha
   un'allowlist esplicita per pathname — `vendor/xterm/*` non c'era,
   404 su tutti e tre i file, la UI diceva onestamente "xterm.js non
   caricato" invece di fingersi connessa (il fallback dichiarato ha
   funzionato come progettato). Corretto aggiungendo le tre voci.
2. **Loop di retroazione del ResizeObserver**: `.terminal-window` aveva
   `min-height`, non `height` — xterm.js ridimensiona sé stesso
   nell'elemento osservato, il box cresceva per contenere il contenuto
   più alto, il ResizeObserver lo notava, un altro fit, ancora più alto
   (+1 riga ridisegnata ad ogni giro, mai un prompt stabile — misurato,
   non ipotizzato: byte del frame che crescevano di esattamente 5 alla
   volta, la lunghezza di `\x1b[K\r\n`). **Due difese**: `height` fissa
   in CSS (rompe il loop alla radice) + invio del resize alla PTY solo
   se cols/rows sono DAVVERO cambiati (difesa indipendente).
3. **Colore ANSI assente**: xterm.js v6 core ha SOLO un renderer DOM
   (niente più canvas incluso), che colora iniettando un `<style>`
   dinamico — bloccato in silenzio dalla CSP di questo server
   (`style-src 'self'`, deliberata, mai allentata). Cura: renderer
   `@xterm/addon-webgl` (pixel GPU veri, zero CSS coinvolto — lo stesso
   renderer di VS Code), con `preserveDrawingBuffer:true` (altrimenti
   il buffer si pulisce dopo ogni presentazione e una lettura pixel
   tardiva vede il vuoto) e fallback dichiarato (`onContextLoss`, mai
   un fallimento silenzioso) al renderer DOM se WebGL non c'è.
   `@xterm/addon-canvas` scartato: il suo ultimo rilascio (0.7.0)
   dipende ancora da `@xterm/xterm@^5`, incompatibile con la `6.0.0`
   usata qui (verificato con `npm install`, non assunto).

Più due difetti minori nel MIO script di verifica, non nel prodotto:
`Pipeline.click()` (sintetico, `el.click()`) non basta per il focus di
xterm.js — serve un click REALE (`clickReale`, nuovo metodo, coordinate
vere + `Input.dispatchMouseEvent`); un controllo del buffer immediatamente
dopo "connesso" non basta — la PTY spawna in quel momento, il primo
output arriva un istante dopo via rete (stessa lezione già nota per il
catalogo modelli OpenRouter).

## File toccati

- NUOVI: `harness-ui/src/pty-terminal.mjs`, `harness-ui/src/terminal-ws.mjs`,
  `harness-ui/tests/pty-terminal.test.mjs`, `harness-ui/tests/terminal-ws.test.mjs`,
  `mobile/public/harness-ui/vendor/xterm/{xterm.js,xterm.css,addon-fit.js,addon-webgl.js,LICENSE-*,README.md}`
- MODIFICATI: `harness-ui/package.json` (+`node-pty`,+`ws`),
  `harness-ui/server.mjs` (registro terminali + upgrade WS + reaper +
  shutdown pulito), `harness-ui/src/static-files.mjs` (allowlist vendor),
  `harness-ui/src/session-registry.mjs` (+`cartellaDi`),
  `harness-ui/tests/session-registry.test.mjs` (+2 test),
  `harness-ui/scripts/qa-visual-pipeline.mjs` (+`clickReale`/`digitaTastieraVera`/
  `premiTasto`, +scenario `terminale-reale`),
  `mobile/public/harness-ui/{index.html,app.js,styles.css}` (markup,
  sottosistema terminale, CSS — inclusa la rimozione delle regole morte
  `.prompt`/`.path`/`.branch`/`.cursor`/`@keyframes blink` del vecchio
  log finto).

## Non ancora fatto, dichiarato

- L'attività `shell` dell'AGENTE resta un canale separato (solo nel
  bubble collassabile della chat) — deliberatamente NON specchiata
  nella stessa PTY dell'utente, per evitare una gara fra tastiera umana
  e scrittura automatica. Segnalato come possibile v2, non perso.
- Nessun test automatico per il renderer WebGL stesso (richiederebbe un
  vero contesto GPU — fuori scope per `node:test`); verificato solo dal
  vivo via CDP, come sopra.
- Push: non fatto, come da regola — commit locale sì, push solo dopo un
  sì esplicito fresco.
