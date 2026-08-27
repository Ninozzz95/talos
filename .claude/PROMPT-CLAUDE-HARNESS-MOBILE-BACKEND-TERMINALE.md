# PROMPT — Harness mobile: backend vero + terminale via ADB, pareggio col desktop

> Scritto il 27/8 (notte) per una **sessione Claude Code separata**, sullo
> stesso repository (`AVM`, branch `lane/voce-personale` o una lane nuova a
> tua scelta se preferisci isolare — chiedi all'owner se hai dubbi). Non è
> un riassunto: è il prompt completo. Leggilo tutto prima di scrivere una
> riga.
>
> Owner, testuale, la richiesta che ha originato questo documento: *"adesso
> dobbiamo collegare il backend del harness mobile alla UI mobile, quindi
> dobbiamo fare un po' quello che ho fatto io ma in versione mobile,
> usando il ponte ADB per fare partire un terminale Shell e accedere...
> voglio che pareggiamo la UI harness mobile con quella desktop... voglio
> che includa anche tutti i cambiamenti fatti finora della UI e del
> desktop anche in quella mobile."*

---

## 0. Leggi PRIMA di tutto — in quest'ordine

1. `CLAUDE.md` alla radice del repo — si carica da solo, richiama
   `MEMORY.md` e i due indici di memoria (`MEMORIA-LEZIONI.md`,
   `MEMORIA-REGOLE.md`). Non saltarlo: contiene la regola vincolante su
   `PROGRAMMI_AMMESSI` (§1 sotto) che questo compito tocca da vicino.
2. Questo intero documento.
3. Il piano madre di tutto il lavoro Harness, `elegant-spinning-dongarra.md`
   (si trova nella cronologia della sessione che ha scritto questo prompt,
   non è nel repo — chiedi all'owner di incollartelo se non lo trovi, o
   ricostruiscilo da `.claude/CONSEGNA-HARNESS-UI-ROUTING.md` +
   `.claude/PROMPT-CLAUDE-HARNESS-UI-ROUTING.md`, che ne sono la fase
   precedente). In particolare, PRIMA di scrivere codice:
   - **§0** — l'architettura scelta: un solo frontend, un protocollo a
     eventi stile AG-UI, backend intercambiabili dietro lo stesso
     protocollo. Questo compito **aggiunge un backend**, non ne inventa
     uno nuovo di zecca — la garanzia di §0 è che il frontend non si
     riscrive.
   - **§3** — "Mobile: backend thin-client verso il PC via `adb reverse`"
     — GIÀ progettato per intero (perché `adb reverse` e non LAN diretta,
     perché non `TalosPonteAdb`, il comando esatto). Non ri-progettarlo:
     implementalo, poi estendilo per il terminale (§3 di QUESTO documento).
   - **§1.3-BIS.T** — il design del sesto attrezzo `shell` con sandbox a
     tre livelli (WSL2 preferito, nativo Windows come sotto-fase separata,
     `enforcement:'none'` mai spacciato per sandboxato) — costruito e
     CHIUSO sul lato desktop il 27/8. Questo prompt ti chiede di
     aggiungere un **quarto livello**, specifico per una sessione servita
     al mobile (§3 sotto).
4. Le note di memoria rilevanti (si aprono da
   `~/.claude/projects/C--Users-Antonino-Desktop-projects-AVM/memory/`):
   - `stessa-ui-mobile-desktop-backend-diverso.md` — owner: desktop e
     mobile devono avere STESSA UI e STESSE funzioni, backend
     sincronizzato diversamente.
   - `lesecuzione-sta-nella-shell-non-nellapp.md` — ⛔⛔ **`PROGRAMMI_AMMESSI`
     NON si allarga.** Leggi bene §3 di questo documento prima di pensare
     di aggiungere qualcosa a quella lista: la strada raccomandata qui
     **non la tocca affatto**.
   - `harness-ui-due-copie-divergenti.md` — la storia di come sono nate
     due copie del bundle Harness UI, e perché oggi `mobile/public/harness-ui/`
     è la base canonica (DEC-053, richiamata al §2 sotto).

---

## 1. Regole vincolanti — non negoziabili, valgono ANCHE per te

Le stesse regole di ogni sessione su questo repo. Le più rilevanti per
questo lavoro specifico:

- ⛔⛔⛔ **MAI il tool Agent/subagente**, nemmeno di sola lettura. Fai
  tutto tu, direttamente.
- ⛔ **REGOLA ZERO**: ricerca web PRIMA di ogni cambio di codice non
  banale. In particolare: prima di scegliere fra le opzioni del §3
  (thin-client puro vs shell on-device vs un ibrido), prima di toccare
  qualunque cosa in `mobile/android/app/src/main/java/ai/talos/agent/`.
- ⛔⛔ **SI STRUMENTA SEMPRE, MAI IPOTESI** — riprodurre prima di
  dichiarare risolto. Un `adb reverse` "dovrebbe funzionare" non è una
  prova: si verifica con `adb reverse --list` e con una richiesta HTTP
  vera dal telefono.
- ⛔ **Ogni funzione si prova ANCHE AL CONTRARIO** — non solo il
  percorso felice (es.: cosa succede se il tunnel cade a metà sessione?
  se il PC va in sleep? se due telefoni si connettono allo stesso PC?).
- ⛔⛔⛔ **Niente è chiuso senza DISPOSITIVO REALE**, in QUATTRO
  combinazioni viewport (tablet/telefono × verticale/orizzontale). Una
  grep non è una prova.
- ⛔⛔ **Ogni funzione SCREENSHOTTATA, e ogni screenshot ISPEZIONATO PER
  INTERO** — non solo l'elemento che stai testando.
- ⛔⛔ **Se la tocchi, la provi tutta.**
- ⛔⛔⛔ **IL CODICE si tocca SOLO su ordine esplicito** — questo
  documento È l'ordine, per l'ambito descritto al §2/§3. Qualcosa fuori
  da quell'ambito che sembra da correggere: segnalalo nella consegna
  finale, non correggerlo di tua iniziativa.
- ⛔⛔ **I COMMIT SÌ, il PUSH si CHIEDE.**
- ⛔⛔ **NIENTE CO-AUTHORING nei commit.**
- ⛔⛔⭐⭐⭐ `git status --short` PRIMA di ogni `git add`, **mai**
  `git add -A` — un'altra sessione potrebbe avere lavoro in corso in
  parallelo sullo stesso repository condiviso (`AVM/`, cartella
  condivisa con altre sessioni: vedi `due-sessioni-stessa-cartella-intrecciano-i-commit.md`
  in memoria — se stai lavorando in `AVM/` e non in un worktree
  dedicato, questo rischio è REALE, non teorico).
- ⛔ **`PROGRAMMI_AMMESSI` (Kotlin, `TalosPrivilegePlugin.kt`) NON SI
  ALLARGA** — vedi §3 per la strada che non ne ha bisogno.
- ⛔ **Fuori si scrive in inglese** — stringhe UI, i18n; commenti di
  codice nello stile del file che stai modificando (questo bundle ha
  commenti in italiano per le decisioni/perché).
- ⛔⛔ **NIENTE avvisi di contesto**, **MAI proporre una sessione nuova.**

---

## 2. Cosa esiste oggi — non ripartire da zero

### 2.1 — Il frontend, e perché non lo tocchi da solista

`mobile/public/harness-ui/{index.html,styles.css,app.js}` è la base
CANONICA (DEC-053), montata in uno shadow root dentro
`HarnessSessionScreen.vue`, raggiungibile dalla sidebar mobile come
schermo "Codice". **Oggi è "Demo UI · non collegato" per costruzione**:
il telefono non raggiunge nessun backend, zero tunnel costruito.

Una sessione **parallela e separata** (worktree `AVM-harness-desktop`,
branch `lane/harness-desktop`) ha passato l'intera giornata del 27/8
a rendere lo STESSO bundle (byte-per-byte identico nella sua parte
HTML/CSS/JS — `AVM-harness-desktop/mobile/public/harness-ui/`) vero sul
lato DESKTOP: un vero backend (`AVM-harness-desktop/harness-ui/`,
Node.js puro, zero dipendenze), un vero agente (`talosLavora`, da
`AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`, il kernel
reale di TALOS), un vero protocollo a eventi (AG-UI). **27 commit**, in
questo momento non ancora fusi in `lane/voce-personale` — rigenera
l'elenco aggiornato con:

```bash
cd /c/Users/Antonino/Desktop/projects/AVM-harness-desktop
git log --oneline lane/voce-personale..lane/harness-desktop -- mobile/public/harness-ui/
```

Fra questi, i più recenti (27/8 notte, quelli che questo prompt
presuppone tu conosca perché il terminale che ti si chiede di costruire
ci si aggancia sopra):

- `09bcd0cb` — tool-call collassabili: riga riassunta, espandibile,
  pass/fail veri estratti dall'output di `prova`.
- `c22e6777` — la barra di scorrimento della chat sull'orlo vero del
  pannello, non sull'orlo della colonna di testo.
- `582dffcf` — la card automazioni della sidebar legge lo stato vero
  (era testo statico in `index.html`, mai letto da nessuna riga di JS).
- `2991d0e7` — il tab "Split" (che non affiancava nulla) è ora
  "Terminale": apre la vista terminale reale.
- `b5b8556e` — **il formattatore diff vero**: righe rosse/verdi/neutre
  calcolate con un LCS vero (non un dump del contenuto intero), numeri
  di riga, marcatori +/-. Tocca sia `talosHarness.mjs`
  (`contenutoPrima`, commit `b1877664` su `AVM-harness`,
  `lane/harness-coding`) sia `agui-events.mjs`/`agent-service.mjs`
  (backend) sia `app.js` (rendering).

**Il tuo compito NON è ricostruire questo lavoro**: è portarlo dentro
`lane/voce-personale`, rispettando l'adattamento shadow-DOM già
documentato (§2.2 sotto), e POI collegarlo a un vero telefono invece
che a un browser Chrome sul PC.

### 2.2 — Le regole di adattamento, dalla riconciliazione del 26/8

Il bundle desktop e quello mobile **non sono identici byte-per-byte**
— sono stati riconciliati una volta (26/8, "Ripresa Codex", vedi
`.claude/CONSEGNA-HARNESS-UI-ROUTING.md`), e la differenza è
sistematica, non arbitraria:

- `app.js`: helper `ROOT()`/`HOST()` al posto di `document`/`window`
  bare, per funzionare dentro uno shadow root.
- `styles.css`: `:host` al posto di `:root` per i design token.
- Font/logo reali del progetto, non quelli demo di Codex.
- Composer CONDIVISO con `TalosMobileComposer.vue` (non una copia).
- Theme engine TALOS live (segue il tema reale dell'app), non un tema
  "Calm" fisso.
- Guardie `talos-embedded`/`talos-embedded-wide-short` per il
  ridimensionamento dentro lo shadow host invece che dentro una
  finestra browser vera.

⇒ **Non fare un copia-incolla verbatim** dei 27 commit desktop. Ogni
modifica ad `app.js`/`styles.css` va riletta contro queste convenzioni
mobile PRIMA di applicarla — la maggior parte dei commit (tool-call,
scrollbar, diff, automazioni) sono variazioni CSS/JS pure che si
applicano quasi certamente senza conflitti (non toccano `document`/
`window` bare, non toccano `:root`), ma verificalo file per file, non
per assunzione.

### 2.3 — Cosa esiste GIÀ per un vero "ponte ADB" — verificato oggi, non ipotizzato

Prima di progettare qualunque cosa, questi tre fatti (verificati
leggendo il codice sorgente vero, il 27/8 notte):

1. **`adb reverse` non è mai stato costruito**, ma è già interamente
   progettato: piano §3.1-§3.3. Riassunto: `adb -s <seriale> reverse
   tcp:4174 tcp:4174` rende `http://localhost:4174/...` chiamato dalla
   WebView del telefono trasparentemente raggiungente il processo
   `server.mjs` sul PC — **zero branching** nel frontend fra "sono su
   desktop" e "sono su mobile" (`app.js` non cambia). Il server resta
   bindato SOLO su `127.0.0.1`, il perimetro di sicurezza dichiarato
   ("owner-only, loopback") **non cambia**.
2. **Un ponte shell verso il telefono esiste GIÀ e FUNZIONA**:
   `TalosPonteAdb.shell()` (`mobile/android/app/src/main/java/ai/talos/agent/TalosPonteAdb.kt:344`)
   esegue `adb shell <comando>` sul telefono stesso (uid=2000, dominio
   `shell` — la stessa via che
   `TALOS-RICERCHE/2026-08-20-android-coding-agent-execution-plane.md`
   raccomanda come verdetto architetturale, §0 di quel documento),
   esposto a TypeScript via `TalosPrivilegePlugin.kt:825` (Capacitor
   plugin, già chiamabile da `mobile/src/lib/device/*.ts` oggi). ⛔ **Ma
   è ristretto a `PROGRAMMI_AMMESSI = setOf("cmd", "settings",
   "dumpsys", "pm", "am")`** (`TalosPrivilegePlugin.kt:1166`) — comandi
   di INTROSPEZIONE/CONTROLLO del sistema Android, non un terminale per
   sviluppatori (niente `node`, `npm`, `git`, `cat`, `ls`). Allargare
   questa lista è ESATTAMENTE ciò che la memoria vieta
   (`lesecuzione-sta-nella-shell-non-nellapp.md`) — **non lo fare**, la
   strada del §3 sotto non ne ha bisogno.
3. **Il design "execution plane" completo esiste, 3795 righe, NON
   autorizzato**: `TALOS-RICERCHE/2026-08-20-android-coding-agent-execution-plane.md`
   — workspace intero (non solo un comando) che vive in
   `/data/local/tmp/talos/` sul telefono, runner persistente, gestione
   di `npm install`/`node-gyp`/processi a lunga durata, 38 sezioni di
   design (sandbox, permessi, recovery, cost model...). È il documento
   di riferimento SE e QUANDO si deciderà di avere un workspace
   genuinamente on-device — non è lo scope di questo prompt (vedi §3.3).

---

## 3. L'obiettivo — cosa deve essere vero quando hai finito

### 3.1 — Il ponte: mobile raggiunge lo stesso backend del desktop

1. Verifica (o installa se manca) che `AVM-harness-desktop/harness-ui/server.mjs`
   sia avviabile e raggiungibile su `127.0.0.1:4174` — è lo stesso
   server usato tutta la sera del 27/8 per verificare il lavoro
   desktop. Se decidi di portare il backend DENTRO `AVM/` invece di
   lanciarlo dal worktree separato, motivalo nella consegna finale
   (tocca la domanda "chi possiede questo codice ora" — probabile
   candidato per un merge vero di `harness-ui/`, non solo un puntatore
   incrociato fra repository).
2. Scrivi lo script che il piano §3.2 già descrive (nome a tua scelta,
   stile coerente con gli altri script in `mobile/scripts/`): legge il
   seriale ADB attivo (riusa `scripts/device.mjs`, già esistente), lancia
   `adb -s <seriale> reverse tcp:4174 tcp:4174`, stampa conferma. Non
   parte da solo — è un comando manuale per una sessione di debug.
3. Verifica **dal dispositivo vero**, non da un'ipotesi:
   `adb reverse --list` mostra la regola attiva, e una richiesta reale
   dalla WebView del telefono (es. `fetch('http://localhost:4174/api/v1/doctor')`
   dalla console remota, o direttamente aprendo lo schermo "Codice" e
   osservando che "Demo UI · non collegato" sparisce) conferma che il
   telefono raggiunge davvero il PC.
4. Con questo solo passo, l'INTERA superficie già costruita sul
   desktop (chat reale, tool-call reali, Review con diff vero,
   Terminale — ancora ancorato al PC in questo passo, vedi §3.2 —
   Browser, Capability hub, Impostazioni, Doctor, Automazioni, Board)
   diventa raggiungibile dal telefono **senza una riga di codice
   nuova in `app.js`**: è la garanzia che l'architettura di §0 del
   piano madre esisteva a fare.

### 3.2 — Il terminale: dove esegue DAVVERO il comando, quando la sessione è mobile

Qui c'è una scelta architetturale reale, non un dettaglio — **decidila
esplicitamente, per iscritto, nella consegna finale**, non implicitamente
scrivendo codice:

**Opzione raccomandata — "shell diretta via ADB dal lato PC"**: quando
una sessione viene avviata/servita per un client mobile (da decidere
come riconoscerlo: un parametro esplicito nella richiesta di avvio
sessione è più onesto di un'euristica sullo User-Agent), il livello
"Livello 0" di `eseguiComandoSandboxato` (`talosHarness.mjs`, §1.3-BIS.T
del piano madre) diventa `adb -s <seriale> shell <comando>` — usando il
binario `adb` già presente sul PC (lo stesso già usato per `adb reverse`
e per ogni screenshot/test di questa intera giornata), **non**
`TalosPonteAdb.kt`/`PROGRAMMI_AMMESSI`. Il comando esegue per davvero
`uid=shell` sul telefono. Riporta `enforcement: 'adb-shell-on-device'`
nel risultato — mai spacciato per un WSL2 sandboxato, è un livello
diverso con garanzie diverse, dichiarale.

⛔ **La tensione che DEVI risolvere esplicitamente, non ignorare**: se
`elenca`/`cerca`/`leggi`/`scrivi` continuano a operare su una cartella
del PC (come fanno oggi) mentre `shell` esegue sul telefono, il
terminale non vede gli stessi file che l'agente legge/scrive — un
`ls` nel terminale mobile mostrerebbe il filesystem del TELEFONO, non
il workspace del task. Tre strade, nessuna scelta qui:
1. Il terminale mobile mostra onestamente che opera su un filesystem
   DIVERSO dal workspace del task (utile per introspezione del
   dispositivo, non per "vedere i file che l'agente ha appena scritto").
2. Il workspace del task viene ANCHE copiato/sincronizzato verso
   `/data/local/tmp/talos/` sul telefono (un pezzo, non tutto, del
   design in `2026-08-20-android-coding-agent-execution-plane.md`) —
   costo/complessità molto più alti, verifica se è davvero necessario
   per QUESTO obiettivo (pareggiare la UI) prima di intraprenderla.
3. Il terminale mobile resta, come sul desktop stasera, ancorato al
   PC (Livello 1 WSL2, invariato) — la sessione avviata dal telefono
   ottiene un terminale IDENTICO a quello desktop, e "il ponte ADB per
   accedere" si riferisce SOLO al trasporto (`adb reverse`, §3.1), non
   a dove il comando esegue. **Pareggia la UI** (stesso identico
   comportamento visibile) senza risolvere la tensione sopra, perché
   non la crea.

L'owner ha chiesto esplicitamente "usando il ponte ADB per fare
partire un terminale Shell" — leggilo come un'indicazione verso
l'opzione raccomandata o la (2), non verso la (3) di default, ma
**conferma con l'owner prima di impegnarti nella (2)** (costo/rischio
molto più alto) se la tensione sopra non ha una risposta ovvia.

### 3.3 — Cosa NON è questo compito

- **Non** costruire il workspace on-device completo (§0 di
  `2026-08-20-android-coding-agent-execution-plane.md`) — quello resta
  "SUO programma, si apre solo su ordine esplicito futuro" per il
  piano madre. Se durante questo lavoro ti sembra indispensabile,
  fermati e chiedi, non deciderlo da solo.
- **Non** allargare `PROGRAMMI_AMMESSI` in `TalosPrivilegePlugin.kt`.
- **Non** ri-progettare `adb reverse` vs LAN diretta — è già deciso
  (piano §3.1), con la ricerca a supporto già fatta.
- **Non** portare l'intero backend `harness-ui/` dentro `AVM/` senza
  prima aver verificato che girare dal worktree separato (§3.1 punto 1)
  non basti per questo obiettivo.

### 3.4 — Porta anche il resto dei 27 commit

Oltre al terminale (il pezzo nuovo di questo prompt), porta l'intero
elenco di §2.1 dentro `lane/voce-personale`, rispettando §2.2. Per
ciascuno: un commit distinto (non uno squash), verificato dal vivo sul
Pad prima di passare al successivo — stesso ritmo già tenuto stasera
lato desktop, non un batch alla cieca.

---

## 4. Verifica richiesta prima di dichiarare fatto

1. `npm run typecheck` + `npx vitest run` (suite intera di `mobile/`)
   verdi dopo ogni blocco toccato.
2. `node --test` sul backend (`AVM-harness-desktop/harness-ui/`, se lo
   tocchi) verde.
3. Dispositivo reale, quattro combinazioni viewport (tablet/telefono ×
   verticale/orizzontale) — screenshot ispezionati per intero, non solo
   il terminale: l'intera schermata "Codice" già raggiunta dal
   backend, non solo il pezzo nuovo.
4. `adb reverse --list` mostrato nella consegna come prova che il
   tunnel è davvero attivo durante il test, non assunto.
5. Il comportamento AL CONTRARIO, per ognuno:
   - Tunnel `adb reverse` mai avviato: la UI mobile mostra "Demo UI ·
     non collegato" come oggi, mai un errore crudo.
   - Tunnel caduto A META' di una sessione: cosa vede l'utente? Un
     comando diretto (`shell`) lanciato senza il tunnel: fallisce con un
     messaggio onesto, mai un timeout silenzioso.
   - Se hai implementato l'opzione raccomandata del §3.2: un comando
     shell lanciato SENZA un device ADB collegato in quel momento
     (`adb devices` vuoto) dichiara `enforcement:'none'`, mai un bluff.
6. Un resoconto finale che nomina esplicitamente quale delle tre strade
   del §3.2 hai scelto e perché, cosa resta della tensione workspace-PC
   vs workspace-telefono, e quali dei 27 commit hai portato con
   modifiche (elencale) rispetto a quali verbatim.

---

## 5. Consegna

- Commit locali piccoli, uno per pezzo verificato — **mai push** senza
  un sì esplicito e fresco dell'owner per QUESTA richiesta specifica.
- Alla fine, un resoconto che copre: cosa hai portato (elenco commit),
  la decisione del §3.2 e perché, cosa hai verificato sul device (con
  gli screenshot), cosa resta aperto e perché non l'hai chiuso.
- Se qualcosa in questo prompt si scontra con quello che trovi nel
  codice reale (un file spostato, un comando che non esiste più): **la
  ricerca vince sul prompt** — verifica alla fonte, segnala la
  discrepanza nella consegna, non forzare il prompt sopra alla realtà
  del repository.
