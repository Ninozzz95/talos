# LEDGER W1-01 — schede terminale multiple per sessione (backend)

**Data:** 2026-09-05 · **Lane:** `lane/harness-desktop` · **Ambito:** SOLO backend.
⛔ Fuori: `public/app.js` · `public/index.html` · `public/styles.css` (congelati dal
contratto `frontend/tests/contract/legacy-contract-snapshot.test.mjs`, byte-count +
sha256), `frontend/**`, il server dell'owner sul **4174**, `mobile/`, il kernel.
Nessuno di questi è stato toccato — verificato su `git status --short` prima dell'add.

---

## 1. La ricerca — fonte + data (fatta PRIMA di scrivere)

⛔ È la regola che si viola di più qui: si cerca prima di scrivere, **soprattutto
quando non si hanno dubbi**. Quello che è mancato non era la soluzione: erano i vincoli.

### 1.1 Ricevute dal brief e tenute

| # | Fonte | Data lettura | Il vincolo che porta |
|---|---|---|---|
| 1 | **CVE-2026-59224** — Open WebUI. <https://github.com/advisories/GHSA-j657-m4c4-24jq> · <https://securelayer7.net/lab/cve-2026-59224-open-webui-terminal-proxy-user-id-spoofing> | 05/09/2026 | Il proxy WS del terminale costruiva l'URL a monte **concatenando il `session_id` ricevuto dal client** senza validarlo né percent-encodarlo: delimitatore codificato ⇒ `user_id` arbitrario, e con un session id vivo ci si **agganciava alla PTY di un'altra persona**. Identità inoltrata come pretesa «bearer», **senza legame di integrità**. ⇒ È **letteralmente la forma di W1-01**. |
| 2 | **CVE-2026-39987** — Marimo. <https://github.com/marimo-team/marimo/security/advisories/GHSA-2679-6mx9-h9xc> | 05/09/2026 | `/terminal/ws` era l'**unica** WebSocket senza `validate_auth()` ⇒ RCE pre-autenticazione. Il terminale è l'endpoint dove un buco non è un buco, è una shell. |
| 3 | **OWASP WebSocket Security Cheat Sheet**. <https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html> | 05/09/2026 | Il browser **non** applica la same-origin policy alle WS come a `fetch`: serve il controllo Origin esplicito (già presente) **più** un valore imprevedibile. |
| 4 | **VS Code, sessioni persistenti**. <https://code.visualstudio.com/docs/terminal/advanced> · <https://medium.com/@joaomoreno/persistent-terminal-sessions-in-vs-code-8fc469ed6b41> | 05/09/2026 | *Process reconnection* (stesso processo vivo, contenuto ripristinato) ≠ *process revive* (processo rilanciato). Lo scrollback ripristinato è **limitato** da `terminal.integrated.persistentSessionScrollback`, mai infinito. |

### 1.2 Cercate da me, in aggiunta

| # | Fonte | Data | Il vincolo che ha aggiunto — e che dal codice NON si vedeva |
|---|---|---|---|
| 5 | **OWASP API1:2023 — Broken Object Level Authorization (BOLA/IDOR)**, ancora #1; ricerca su prevenzione IDOR con identificativi forniti dal client (sentinelone.com, authgear.com, pentasio.com) | 05/09/2026 | «L'API si fida di un identificativo fornito dal client senza verificare che il chiamante possa accedere a QUELL'oggetto.» Il controllo va fatto **al livello dei dati**, a **ogni** richiesta. ⭐ E il vincolo che non conoscevo: **un identificativo non è una policy, e una risposta riuscita non è prova che l'accesso fosse legittimo** ⇒ «non esiste» e «non è tuo» devono rispondere **lo stesso codice**, altrimenti l'errore stesso diventa una sonda per enumerare gli id validi. **Applicato**: `chiudi()` risponde `NOT_FOUND` in entrambi i casi. |
| 6 | **`terminal.integrated.persistentSessionScrollback`** — valore di default (vscode-docs, bobbyhadz, dev.to) | 05/09/2026 | Il default è **100 righe**. Lo stato dell'arte NON rigioca tutto: dichiara un tetto. ⇒ Il nostro `BACKLOG_MASSIMO_BYTE = 200_000` è ora **dichiarato per scheda**, non "grande abbastanza". |
| 7 | **node-pty con più terminali nello stesso processo** — <https://munderdiffl.in/blog/building-a-terminal-ui-xterm-node-pty/> (giugno 2026) | 05/09/2026 | ⭐ Vincolo che non conoscevo: **«node-pty keeps no scrollback. The scrollback buffer lives in _xterm_, not the PTY.»** ⇒ il backlog **deve** stare lato server, altrimenti un F5 (che ricrea la xterm) parte da uno schermo vuoto finché il programma in corso non ridisegna. Conferma anche il modello «pool persistente, una voce per `ptyId`, teardown esplicito», e che la memoria scala **linearmente col numero di terminali**. |
| 8 | **node-pty ConPTY su Windows** — <https://github.com/microsoft/node-pty/issues/471> | 05/09/2026 | ⭐ Vincolo decisivo per questa macchina: con ConPTY **il processo `conhost` resta vivo anche quando il processo sottostante è finito**. ⇒ schede illimitate = processi di sistema illimitati: il tetto per sessione **non è burocrazia**, ed è per questo che lo shutdown deve chiuderle **tutte**. |
| 9 | Spring Session / websocket.org — mappatura sessione→connessioni e pattern «ticket» | 05/09/2026 | Si tiene una **mappa lato server** sessione → connessioni vive, così che chiudere la sessione chiuda le WS. Conferma la scelta del registro server-side invece di un id auto-descrittivo. |

---

## 2. Il difetto misurato (la premessa del brief, confermata)

`server.mjs:589`, prima di oggi:

```js
risolviCartella: (id) => sessionRegistry.cartellaDi(id)
  ?? config.cartelleProgetto[0]?.percorso ?? process.cwd(),
```

Un id **sconosciuto** non veniva rifiutato: **cadeva sul primo progetto configurato**.
Finché l'id *era* il `sessionId` il danno era contenuto. Con un `terminalId` libero,
**qualunque stringa apre una shell**. ⇒ Confermato leggendo il codice, non presunto.

## 2-bis. ⛔ UNA PREMESSA DEL BRIEF ERA INCOMPLETA — misurata, non aggirata

Il brief dice: «`public/app.js` è congelato e si collega con `?id=<sessionId>`».
**È vero solo a metà.** Letto il file congelato (offset ~413.264):

```js
function idTerminaleCorrente() {
  if (state.realSession.id) return state.realSession.id;
  const t = statoTerminale();
  if (!t.standaloneId) {
    t.standaloneId = window.crypto?.randomUUID?.() ?? `standalone-${Date.now()}-...`;
  }
  return t.standaloneId;
}
```

⇒ Esiste una **terza strada**: quando NON c'è sessione, il monolite **inventa un id
lato client**. Ed è raggiungibile davvero: `setView('terminal')` chiama
`apriVistaTerminaleReale()` **senza condizioni** — basta aprire il tab Terminale
prima di avviare qualsiasi cosa. Quel caso è precisamente ciò che il `??` teneva in
piedi, ed è la funzione «terminale standalone» del prodotto spedito.

**Non ho adattato il codice alla premessa sbagliata, e non ho rotto la funzione in
silenzio.** Il registro è **stretto per costruzione** (`cartellaStandaloneLegacy`
default `null` ⇒ un id ignoto si rifiuta); la compatibilità è una **riga sola,
dichiarata, in `server.mjs`**, con un tetto suo. Decisione dell'owner in §7.

---

## 3. Il disegno scelto, e perché

**Due moduli, non uno.** `pty-terminal.mjs` = ciclo di vita delle PTY.
`terminal-registry.mjs` (nuovo) = **autorizzazione**. Fino al 04/9 erano la stessa
cosa perché l'id della PTY *era* il `sessionId`, quindi non c'era niente da
autorizzare. Separarli rende il cancello una cosa che si può leggere, provare e
rompere di proposito (§5) — invece di un `??` nascosto in una riga di wiring.

**Il principio non negoziabile:** *il `terminalId` non decide MAI la cartella.*
La cartella si risolve **una volta, alla creazione**, da `cartellaDiSessione()`, e
resta **congelata** nella voce. Il client può solo **nominare** un terminale che il
server gli ha già dato.

**`risolviPerConnessione(id)` — tre esiti, in quest'ordine:**

1. **scheda registrata** → la sua voce (cartella congelata, mai ri-risolta);
2. **id che è un `sessionId` VIVO** → prima scheda di quella sessione, registrata al
   volo, con `terminalId === sessionId` ⇒ **il monolite congelato funziona senza una
   riga di modifica** (requisito 4 del brief). L'autorità resta il registro sessioni;
3. **tutto il resto** → `null` ⇒ **rifiuto**. `registro.apri` non viene sfiorato.

**Perché `randomUUID` server-side** (fonte 3 + 5): Origin esplicito **più** un valore
imprevedibile. Un id che il client propone è la CVE; un id sequenziale è indovinabile.

**Perché il tetto (8 per sessione, `TERMINAL_LIMIT_REACHED` → 409)**: fonte 8 —
ogni PTY su Windows porta con sé un `conhost` che sopravvive al figlio. 409 e non 400
perché la richiesta è legittima: è lo **stato** a impedirla (stessa famiglia di
`RUNTIME_ALREADY_RUNNING`, già in tabella).

**Perché `NOT_FOUND` anche per «non è tuo»** (fonte 5): distinguere i due casi
regalerebbe una sonda per enumerare gli id vivi.

**Backlog**: verificato che il tetto era **già per voce** (`voce.byteBacklog` vive
dentro la singola voce) — requisito 6 già soddisfatto, ora **dichiarato**:
**200.000 byte per scheda**, con test che prova che riempire una non sfratta l'altra.

### File toccati

| File | Cosa |
|---|---|
| `src/terminal-registry.mjs` | **NUOVO** — il registro di autorizzazione |
| `src/pty-terminal.mjs` | `stato(id)` (tre fatti: viva / uscita / inesistente); doc del tetto backlog per scheda; doc «l'id non è più il sessionId» |
| `src/terminal-ws.mjs` | `risolviCartella` → **`risolviScheda`**, che può dire **no**: `null` ⇒ 403 e nessuna PTY |
| `src/http-app.mjs` | 3 rotte + 2 codici d'errore + dep `terminalRegistry` |
| `server.mjs` | i due registri montati prima di `createHttpApp`; wiring; shutdown che fotografa le chiavi |
| `scripts/qa-visual-pipeline.mjs` | **solo un commento** reso non fuorviante (citava `risolviCartella`) |

### Rotte (stile imitato da `/sessions/:id/cancel`: POST nominata prima del blanket-405, `requireNoQuery`, id da `split('/')[4]`, 404 per id ignoto)

- `GET  /api/v1/sessions/:id/terminals` — elenco, **solo** le schede di quella sessione
- `POST /api/v1/sessions/:id/terminals` — creazione (corpo **vuoto obbligatorio**)
- `POST /api/v1/sessions/:id/terminals/:terminalId/close` — chiusura, con controllo di proprietà

⛔ **Cancello W1-10 non aggirato**: stanno sotto `/api/`, quindi il controllo del
cookie `talos_token` scatta molto prima — provato su tutte e tre (§4).

---

## 4. I test

**+45 test** (1589 → 1634).

| File | Nuovi | Copre |
|---|---|---|
| `tests/terminal-registry.test.mjs` | 19 | prima scheda = sessionId · id nuovo per la seconda · sessione ignota = NOT_FOUND · id mai creato = `null` · cartella congelata · proprietà su `chiudi` · elenco per sessione · tre stati di `attiva` · tetto · collisione di `generaId` · porta legacy spenta di default, e col tetto |
| `tests/http-routes-terminals.test.mjs` | 15 | le tre rotte con il **registro VERO** (non un doppio) · corpo con qualunque chiave = 400 · query = 400 · 404 su sessione/terminale ignoto · chiusura altrui = 404 e PTY intatta · tetto = 409 · **401 su tutte e tre senza cookie** · 503 senza registro · DELETE = 405 |
| `tests/pty-terminal.test.mjs` | 6 | **due schede non condividono I/O** · backlog per scheda · chiudere una non tocca le altre · reaper su ogni scheda · shutdown a zero superstiti · `stato()` |
| `tests/terminal-ws.test.mjs` | 5 | id ignoto = 403 e **nessuna PTY** (contate) · id altrui = rifiutato · token prima del registro · cartella dalla scheda mai dalla query · compat `?id=<sessionId>` |
| `tests/http-token-gate.test.mjs` | (2 aggiornati) | TOKEN-05 usava `risolviCartella`: **la suite ha trovato il rename da sola** — intento invariato |

⛔ I test del cancello contano gli **spawn**, non lo status code: la prova che conta
non è «ha risposto 403», è **«la PTY non è nata»**.

## 5. Il ROSSO provato — quattro esperimenti

Ogni cura è stata **spenta di proposito** e la suite rilanciata. Un test che passa
anche col fix spento non prova niente.

| # | Difetto reintrodotto | Rossi | Quali |
|---|---|---|---|
| 1 | Il fallback su un id ignoto (`?? 'C:/primo-progetto'`, tetto tolto) | **4** | id mai creato → `null` · scheda chiusa non riusabile · porta legacy spenta di default · tetto della porta legacy |
| 2 | Cancello WS spento (`risolviScheda(id) ?? {…cartella di ripiego}`) | **2** | id mai creato: 403 e nessuna PTY · id di un'altra sessione |
| 3 | Controllo di **proprietà** rimosso da `chiudi()` (`voce.sessionId !== sessionId` → solo `!voce`) | **2** | chiusura altrui, a livello registro **e** a livello HTTP |
| 4 | Isolamento rotto (`scrivi()` scrive sempre nella **prima** PTY, come quando l'id era il sessionId) | **1** | **due schede NON condividono I/O** — il criterio della riga |

Tutti e quattro **ripristinati** e riverificati verdi (72/72 sulle quattro suite).

## 6. I numeri dei cancelli — letti dalla riga `EXIT:` del comando

⛔ Mai da una notifica di background: il codice d'uscita di un task in background non
è quello del comando (lezione già pagata, 04/09).

| Momento | Comando | `EXIT:` | test | pass | fail | `Scenario:`/`4174` nel log |
|---|---|---|---|---|---|---|
| **Baseline** (prima di toccare) | `npm run verify:all` | **0** | 1589 | 1589 | 0 | **0 occorrenze** (log 1612 righe) |
| Dopo il codice, prima di TOKEN-05 | `npm run verify:all` | **1** | 1634 | 1633 | **1** | 0 |
| **Finale** | `npm run verify:all` | **0** | **1634** | **1634** | **0** | **0 occorrenze** (log 1656 righe) |

Coda del log finale letta fino in fondo: `Fase 3 verificata: build, contratti,
determinismo e laboratorio verdi` ⇒ anche il contratto che congela `public/app.js`
(byte-count + sha256) è **verde**: il monolite non è stato toccato.

⛔ **Il log è stato letto, non solo i conteggi**: zero occorrenze di `Scenario:` e di
`4174` in entrambe le corse ⇒ la fuga a pagamento del 04/09 non si ripresenta.

## 6-bis. La prova DAL VIVO — PTY vere, WebSocket vere

Sonda nello scratchpad (`live/sonda-w1-01.mjs`), server HTTP vero + `node-pty` vero +
`ws` vero. ⛔ **Porta 4191**, mai il 4174 dell'owner, store di prova nello scratchpad.
(4190 è nella lista «bad ports» WHATWG — ManageSieve — e `fetch` la rifiuta.)

**13/13 verdi**, fra cui:

- prima scheda `terminalId === 'sess-viva'` · seconda `dfe709a0-0513-428e-b3ea-d5f8af5e95c3`
- **IL CRITERIO** — scritto `echo MARCATORE_SOLO_B` nella scheda B: *B vede=true, A vede=**false***
- **F5** — riconnesse entrambe: A ritrova solo il suo marcatore, B solo il suo (`altrui=false` per entrambe)
- **AL CONTRARIO** — `id-mai-creato-dal-server` ⇒ `Unexpected server response: 403`, e **PTY prima=2, dopo=2** (contate nel registro, non dedotte dallo status)
- chiudere un terminale di un'altra sessione ⇒ **404**, e la PTY altrui ancora viva
- chiusura esplicita ⇒ 200, **PTY 3 → 2**, e la scheda A resta viva
- shutdown ⇒ **0 PTY superstiti**; nessun ascolto residuo su 4191 dopo l'uscita

⚠️ Durante la sonda node-pty ha stampato `AttachConsole failed` dal suo
`conpty_console_list_agent.js` — è l'helper **di node-pty**, non nostro codice, e
succede perché la sonda gira senza console attaccata. È la stessa area della fonte 8
(ConPTY/conhost). Non ha alterato nessuno dei 13 esiti.

## 7. ⛔ Cosa deve decidere l'owner

**Una riga sola**, `server.mjs`:

```js
cartellaStandaloneLegacy: config.cartelleProgetto[0]?.percorso ?? process.cwd(),
```

- **Com'è ora** → il «terminale standalone» del monolite congelato (tab Terminale
  aperto senza sessione) continua a funzionare, ma **con un tetto** e su una cartella
  **nominata una volta**, non su una catena di `??` valutata a ogni connessione.
- **Messa a `null`** → registro **completamente stretto**: un `terminalId` che il
  server non ha creato si rifiuta **sempre**. ⛔ E il terminale standalone del
  monolite **smette di funzionare** (le sessioni non sono toccate).

Va spenta comunque il giorno in cui il frontend nuovo sostituisce il monolite.

## 8. Debito — cosa NON è verificato, e perché

- **La parte UI** della riga (schede a video, apri/chiudi/rinomina) è del frontend
  nuovo, **fuori dal mio ambito** per il brief.
- **Pipeline QA visiva non lanciata** — esplicitamente esclusa dal brief.
- **Le schede non vengono mai dimenticate da sole**: una voce resta nel registro
  finché non la si chiude o non muore il processo (il reaper chiude la **PTY**, non
  la scheda — di proposito: così un F5 dopo 10 minuti riapre una shell nella cartella
  giusta invece di ricevere un 403). Il tetto per sessione lo rende limitato, ma su
  un server vivo per settimane con molte sessioni è crescita lenta e non misurata.
- **`useConpty`** non è stato toccato: la fonte 8 documenta `conhost` superstiti su
  Windows, ma cambiare il backend PTY è una decisione a sé, non parte di W1-01.
- Non ho verificato il comportamento con **più finestre browser** sullo **stesso**
  `terminalId` (oggi si attaccano entrambe alla stessa PTY, com'era prima): è il
  comportamento esistente e la riga non lo cambia.
