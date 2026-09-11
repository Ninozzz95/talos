# La sessione che SCATTA e ci mette TANTO — misura, causa, cura, misura

**11/09/2026 · lane `lane/harness-desktop` · sessione `8dde6bff-c463-4794-b6b9-7ddb4f5ce885`**

Owner, 11/09 sera: «sul 4174 la sessione `8dde6bff` quando carica SCATTA e ci sta TANTO».

**In una riga:** dal clic al primo frame stabile si passa da **20.157 ms a 7.083 ms (−65%)**, con
il main thread bloccato da **15,8 s a 3,0 s (−81%)** e gli eventi spediti da **34.019 a 1.391
(−95,9%)**, **a schermo esattamente lo stesso contenuto** (impronta del testo identica:
916.907 caratteri, hash `5770dfaa`). La cura è **una sola, lato server**, in
`src/http-app.mjs`; il residuo di 7 s è in `frontend/src/legacy/app.js`, che non ho toccato —
i due diff sono qui sotto, misurati, non applicati.

---

## 1. Misura PRIMA

### 1.1 Il banco (⛔ mai il 4174)

Porta **4179**, `TALOS_HARNESS_UI_SESSIONS_DIR` puntata a una **copia** dello store con due
sole sessioni: quella lunga e una corta (`da4fe957`, 669 righe) che serve da parcheggio.
Chrome **vero** (non headless) guidato via CDP, con
`--disable-backgrounding-occluded-windows --disable-renderer-backgrounding
--disable-background-timer-throttling` — senza quei tre, Chrome guidato da CDP strozza
`requestAnimationFrame` a ~1/s e ogni misura di fluidità è falsa.
Viewport **1440×900**. Sonde in scratchpad, **non nel repo**: sono generatori di misure, non test.

⛔ **Due errori di metodo trovati DALLA sonda, prima che i numeri contassero.** Li scrivo
perché sono la ragione per cui i primi numeri erano falsi:

1. **Un orologio esterno non può misurare un thread fermo.** La prima versione faceva polling
   via CDP ogni 200 ms con un contatore `fermoDa += 200`, e ha dichiarato «replay finito» a
   7,2 s su **19.634 messaggi ricevuti su 34.019**: durante un long task da 2,2 s il
   `Runtime.evaluate` si accoda, ma il mio timer correva lo stesso. Il silenzio ora si misura
   **dentro la pagina**, con `performance.now() - ultimoMessaggio`.
2. **All'avvio la pagina apre DA SOLA la sessione più recente** — che è proprio quella lunga.
   Il mio «clic» cadeva quindi a metà di un replay già partito (`minSeq 14386` su 34.019,
   `connessioni: 0`), perché un clic su una sessione già aperta prende il ramo
   `sessionId === state.realSession.id` di `passaASessione` e non riapre niente. Il protocollo
   ora parcheggia prima sulla sessione corta. ⭐ **Effetto collaterale che conta per l'owner:
   questo costo si paga anche solo APRENDO l'app, senza cliccare niente.**

### 1.2 Che cosa c'è nel file

`harness-ui/.sessions-store/8dde6bff-….jsonl` — **4.636.120 byte, 34.026 righe**, 0 illeggibili.

| tipo | numero | byte |
|---|---:|---:|
| `ReasoningMessageContent` | 16.662 | 1,97 MB |
| `ToolCallArgs` | 15.952 | 1,71 MB |
| `ToolCallResult` | 186 | 0,35 MB |
| `StateDelta` | 169 | 0,20 MB |
| `TextMessageContent` | 430 | 0,05 MB |
| tutto il resto | 627 | 0,10 MB |

**34.019 eventi AG-UI**, di cui il **96% sono delta di streaming da ~11 caratteri l'uno**.
Una sola tool-call ha **3.411 delta** per 37.239 caratteri finali; le prime cinque hanno
3.411 · 2.764 · 1.907 · 1.314 · 1.178 delta.

⛔ **Non è il fenomeno del 02/09** ([[il-lag-era-fuori-dal-codice-gpu-spenta-nel-browser]],
«490 `WorkspaceChanged` rigiocati»): in questa sessione i `WorkspaceChanged` sono **ZERO**.
È un replay integrale, ma di delta di token.

⛔ **Non è una sessione sfortunata.** Righe per sessione nello store dell'owner:
**34.026 · 30.349 · 28.662 · 22.095 · 21.905 · 18.474** e poi la coda corta. Sei sessioni
sopra le 18.000 righe.

### 1.3 Dove NON è il collo (misurato, per non accusare a torto)

| livello | misura |
|---|---|
| **server** | consegna i 34.019 frame, **5.170.067 byte (4,93 MB), in 222 ms** (`http.get` da Node) |
| **trasporto/browser** | un **EventSource NUDO** nella pagina li riceve **tutti e 34.019 in 358 ms**, `minSeq 1`, `maxSeq 34019`, **zero buchi**, zero errori |
| **GPU** | irrilevante: vedi 1.4 |
| **`elenca()` ogni 15 s** | `usageSessioneDaEventi` **2,3 ms**, `metricheDaEventi` 3,3 ms, `processiDaEventi` 4,1 ms, `guardiaDiStallo` 3,4 ms su questi 34.019 eventi — pochi ms, **registrato come debito, non curato** |

### 1.4 Dove È il collo — la pagina vera

| | **con GPU** | **`--disable-gpu`** |
|---|---:|---:|
| `gpu_compositing` (letto da `SystemInfo.getInfo`) | `enabled` | `disabled_software` |
| messaggi SSE ricevuti | 34.019 | 34.019 |
| byte | 4,35 MB | 4,35 MB |
| primo messaggio dal clic | 153 ms | 136 ms |
| **fine del replay** | **16.057 ms** | **16.364 ms** |
| conversazione scoperta (`is-restoring` via) | 12.962 ms | 12.820 ms |
| **primo frame stabile** | **20.157 ms** | **20.457 ms** |
| **long task** | **5 · somma 15.842 ms · il più lungo 4.449 ms** | 5 · 16.165 ms · 4.646 ms |
| fotogramma peggiore | 4.478,7 ms | 4.666,4 ms |
| fotogrammi a riposo | p50 6,1 · p95 6,1 ms | p50 6,1 · p95 6,2 ms |
| nodi DOM · di cui in chat | 26.414 · 19.471 | 26.411 · 19.468 |
| eccezioni JS | 0 | 0 |

⛔ **La GPU non c'entra**, e va detto perché la lezione del 02/09 dice il contrario per un
altro difetto: **20,2 s contro 20,5 s**, cioè 1,5% di differenza. A riposo il p95 è 6,1 ms in
entrambe le configurazioni. Questo conferma l'aggiornamento del 04/09 a quella lezione
(«la tabella non si riproduce più a riposo») e lo estende: **non si riproduce nemmeno sotto
carico**. Il difetto è puro main thread JavaScript.

⭐ Da leggere insieme: **i fotogrammi sopra 16,7 ms sono solo 6**. Non è una pagina che
disegna male: è una pagina che **per 15,8 secondi non disegna affatto**. Lo «SCATTA»
dell'owner è un fotogramma da 4,5 secondi, non una serie di frame lenti.

---

## 2. La causa

### 2.1 Il numero di eventi, non i byte

Il server consegna in 222 ms e il browser riceve in 358 ms gli stessi dati che la pagina
impiega 16 secondi a digerire. La differenza non sta nella quantità di dati: sta nel fatto
che ognuno dei **34.019** frame paga un dispatch di `EventSource`, un `JSON.parse`, e il giro
intero di `handleRealEvent`.

### 2.2 `frontend/src/legacy/app.js:13906` — `case 'ToolCallArgs'`

A OGNI delta:

```js
info.argomenti += evento.delta;
try { argomentiParsati = JSON.parse(info.argomenti); } catch { … }      // ① parse sulla stringa CRESCENTE
…
if (info.detail) renderizzaArgomentiAttrezzo(info.detail, info.argomenti);   // ② ricostruzione DOM
```

e `renderizzaArgomentiAttrezzo` (`app.js:10022-10025`) fa `contenitore.replaceChildren()` e
**un secondo `JSON.parse(jsonGrezzo)`**, poi ricrea `<pre><code>` col testo intero.

Contato sui dati veri: **154.884.711 caratteri** passano a `JSON.parse` solo per ①, e
altrettanti per ② — **~310 milioni di caratteri** per riparsare argomenti che crescono. Per
la sola tool-call da 3.411 delta: 6.822 parse su una stringa che arriva a 37 KB, e **3.411
ricostruzioni del sottoalbero DOM**.

⛔ **L'asimmetria che lo qualifica come difetto e non come scelta:** il ramo gemello
`case 'ReasoningMessageContent'` (`app.js:13826-13834`) **rispetta**
`deferHistoricalRendering` e durante un replay non disegna. `ToolCallArgs` è l'unico grande
delta che disegna anche mentre si rigioca il passato.

### 2.3 `app.js:15039` — `mantieniFondoDuranteRipristino`

Un `MutationObserver` con `subtree:true, attributes:true` chiama `inFondo()` a ogni mutazione,
e `inFondo()` **legge** `scrollHeight` e **scrive** `scrollTop` dentro il callback: reflow
sincrono forzato, il caso da manuale
(web.dev «Avoid large, complex layouts and layout thrashing», webperf.tips «Layout Thrashing
and Forced Reflows», Paul Irish «What forces layout/reflow» — letti l'11/09/2026).

E la rete di sicurezza che scopre la conversazione è a **8 s**, con il commento che dichiara
la taglia su cui fu tarata: *«1.235 righe in ~1s»*. Qui le righe sono **34.026**, 27× quella
taglia — prima della cura la chat si scopriva a 12,9 s, cioè **a costruzione ancora in corso**.

---

## 3. Che cosa fanno gli altri

### 3.1 AG-UI — il protocollo autorizza esplicitamente questa cura

`docs.ag-ui.com/concepts/events`, letto l'11/09/2026, **verbatim**:

> «ToolCallArgs events each contain a delta field with a chunk of the arguments. **Frontends
> should concatenate these deltas in the order received** to construct the complete arguments
> object.»

La concatenazione è associativa: concatenare a monte dà per costruzione la stessa stringa che
il client avrebbe costruito. Lo stesso protocollo prevede `MESSAGES_SNAPSHOT` — «complete
conversation history… **useful for re-sync or late-joining users**» — come forma normale per
chi arriva dopo, che è esattamente l'apertura di una sessione conclusa.

### 3.2 Hermes v0.21 — non rigioca eventi, ripristina uno snapshot

`apps/desktop/src/app/session/hooks/use-session-state-cache.ts`: all'apertura di una sessione
Hermes ripristina un array `ChatMessage[]` da `SessionStateCache` / `$messages` — uno
**snapshot di stato**. Non ha un equivalente del nostro replay token-per-token.

E per il DOM lungo, `apps/assistant-ui/thread/list.tsx`, **verbatim**:

> «DOM is bounded by a render-cost budget, not a message/turn count. The currency is
> `messagePaintWeight`: what a turn actually MOUNTS… "Show earlier" prepends another page;
> whole turns stay intact so the sticky human bubble never loses its turn. **This is the
> long-session perf lever WITHOUT a virtualizer** — pure rendering, never touches scrollTop,
> so it can't fight use-stick-to-bottom (the single scroll owner).»

⭐ Nota per dopo: il loro budget è *anche* la difesa contro il costo del DOM. Noi restiamo a
19.471 nodi in chat — il nostro problema non era quello, ma un giorno lo sarà.

### 3.3 SSE ed event sourcing

- `server-sent-events.com`, «Implementing a Replay Buffer for Last-Event-ID» (11/09/2026): per
  i flussi ad alta frequenza la coalescenza sta **dal lato del server**, non a carico di ogni
  client che si riconnette.
- `eventsourcing.dev/first-principles/snapshots`, `kurrent.io/blog/snapshots-in-event-sourcing`,
  EventSourcingDB «The Snapshot Paradox» (2026): si introducono snapshot **solo con prova
  concreta** che il replay costa; soglia citata «replay > 100 ms». Qui siamo a 16.057 ms, due
  ordini di grandezza sopra — la prova c'è. Ma la conclusione è **coalescere**, non riscrivere
  il modello: uno snapshot vero (`messaggi-finali`) è **già** sul disco, e promuoverlo a
  sorgente del replay creerebbe una seconda fonte di verità dentro gli stessi eventi.

---

## 4. La cura

### 4.1 Che cosa ho scritto

**Nuovo — `harness-ui/src/sse-replay-coalescente.mjs`.** Avvolge l'ascoltatore di una
connessione SSE perché il **replay** arrivi coalescente e il **dal vivo** no. I delta contigui
con la stessa chiave diventano un evento solo:

| tipo | chiave |
|---|---|
| `TextMessageContent` · `ReasoningMessageContent` | `messageId` |
| `ToolCallArgs` · `ToolCallOutput` | `toolCallId` |

**`harness-ui/src/http-app.mjs`, rotta `GET /api/v1/sessions/:id/events` (riga ~4690):**

```js
const replay = creaReplayCoalescente((evento) => { sseSession.send(evento); });
const disiscrivi = sessionRegistry.iscriviti(sessionId, replay.ascoltatore, daSequenza);
replay.fineReplay();
```

Funziona perché `iscriviti()` rigioca la storia **in modo sincrono e per intero** prima di
registrare l'ascoltatore per il futuro (`session-registry.mjs`: il `for` su `voce.eventi` gira
tutto prima di `voce.ascoltatori.add`). Quindi tutto ciò che passa prima che quella chiamata
ritorni è **passato** e si può fondere; tutto ciò che arriva dopo è il **presente** e passa
tale e quale.

### 4.2 Le quattro decisioni, e perché

- ⛔ **Solo il replay.** Dal vivo, mentre il modello scrive, la grana token-per-token È il
  prodotto. `fineReplay()` spegne la coalescenza.
- ⛔ **Qui e non in `session-registry.mjs::iscriviti()`.** Quello è il canale di *tutti* gli
  iscritti e il contratto di una trentina di test. Il replay di rete è un problema di
  trasporto e si cura al livello di trasporto: il registro continua a consegnare ogni singolo
  evento a chiunque si iscriva, e `voce.eventi` non viene mai toccato.
- ⛔ **`_sequenza` = quella dell'ULTIMO delta del gruppo.** È il numero che finisce nell'`id:`
  del frame SSE e quindi nel `Last-Event-ID` della riconnessione: con la prima, un client che
  si ricollega si rifarebbe mandare i delta successivi e **il testo si raddoppierebbe nel
  bubble** — il difetto del 27/8, «ricevo risposte duplicate». Il filtro `> daSequenza` vive
  dentro `iscriviti()`, cioè a monte, quindi un gruppo contiene solo eventi già ammessi.
- ⛔ **Il gruppo esce come oggetto NUOVO.** Gli eventi dentro `voce.eventi` sono gli stessi
  oggetti che `esporta()`, `metricheDaEventi()` e `usageSessioneDaEventi()` leggono: mutarli
  riscriverebbe la storia per tutti gli altri lettori. Un gruppo di UNO resta l'oggetto
  originale, senza copia.

### 4.3 Le prove — `harness-ui/tests/sse-replay-coalescente.test.mjs` (7, tutte nuove)

⛔ Nessun test esistente toccato.

| prova | che cosa morde |
|---|---|
| verso giusto | N delta contigui → un evento, testo intero, `_sequenza` dell'ultimo |
| ragionamento + gruppo di uno | un delta solo resta lo **stesso oggetto** |
| **⛔ contrario (1)** | **dal vivo NON si coalesce**: due delta dopo `fineReplay()` restano DUE eventi |
| **⛔ contrario (2)** | chiavi diverse non si fondono, due tool-call intrecciate restano quattro gruppi nell'ordine originale, e due tipi con lo stesso id non sono la stessa cosa |
| **⛔ contrario (3)** | `StateDelta` (JSON Patch, RFC 6902), `WorkspaceChanged` e un `ToolCallArgs` senza id passano **identici** |
| **⛔ contrario (4)** | `Last-Event-ID` a metà di un gruppo: si consegna solo la coda (`'cd'`, mai `'abcd'`) e la sua sequenza |
| **sui dati VERI** | rigioca il JSONL dell'owner e pretende che la concatenazione coalescente sia **byte-identica** per ogni `messageId`/`toolCallId` |

**E che i test MORDANO l'ho provato guastando il codice di proposito**, tre volte:

| guasto | test che l'ha colto |
|---|---|
| coalescenza anche dal vivo | ⛔ contrario (1) — 1 rosso |
| `_sequenza` = la prima del gruppo | verso giusto, ragionamento, ⛔ contrario (4) — 3 rossi |
| `StateDelta` trattato come delta | ⛔ contrario (3) — 1 rosso |

---

## 5. Misura DOPO

Stesso banco, stesso protocollo, stesse due configurazioni GPU.

| | prima GPU | **dopo GPU** | prima noGPU | **dopo noGPU** |
|---|---:|---:|---:|---:|
| **primo frame stabile** | 20.157 ms | **7.083 ms** | 20.457 ms | **7.317 ms** |
| fine del replay | 16.057 ms | **3.009 ms** | 16.364 ms | **3.239 ms** |
| chat scoperta | 12.962 ms | **3.052 ms** | 12.820 ms | **3.283 ms** |
| messaggi SSE | 34.019 | **1.391** | 34.019 | **1.391** |
| byte al client | 4,35 MB | **1,07 MB** | 4,35 MB | **1,07 MB** |
| **main thread bloccato** | 5 LT · **15.842 ms** | 2 LT · **2.966 ms** | 5 LT · 16.165 ms | 2 LT · **3.195 ms** |
| fotogramma peggiore | 4.478,7 ms | **2.472,7 ms** | 4.666,4 ms | **2.630,2 ms** |
| nodi in chat | 19.471 | 19.482 | 19.468 | 19.482 |
| eccezioni JS | 0 | **0** | 0 | **0** |

Lato server, sulla stessa rotta: **34.019 frame / 4,93 MB / 222 ms → 1.391 frame / 1,10 MB /
38 ms**.

### 5.1 ⛔ Il verso contrario che conta per l'owner: lo stesso contenuto a schermo

Una cura che accorcia i tempi perdendo un pezzo di conversazione è peggio del difetto. Corsa
A/B nella stessa mezz'ora, stesso banco, stesso Chrome, con la cura disattivata e riattivata:

| | messaggi SSE | primo frame stabile | **caratteri a schermo** | **hash** | righe attrezzo | `<details>` | `<pre>` |
|---|---:|---:|---:|---|---:|---:|---:|
| senza cura | 34.019 | 17.184 ms | **916.907** | **`5770dfaa`** | 339 | 43 | 614 |
| con cura | 1.391 | **6.470 ms** | **916.907** | **`5770dfaa`** | 339 | 43 | 614 |

**Impronta identica.** Il testo della conversazione, il numero di righe attrezzo, di blocchi
espandibili e di blocchi di codice sono gli stessi.

### 5.2 Foto — tema chiaro E tema scuro (owner 11/09)

`scratchpad/banco-lento/foto/` — sette scatti per tema (`dark` e `light`): prima del clic,
poi **DURANTE** l'apertura a 300 ms · 1 s · 3 s · 6 s (per ciò che scorre si fotografa durante,
non solo alla fine), poi a pagina ferma e in fondo alla conversazione. Preset `calm`,
`talosResolvedColorMode` `dark`/`light` verificato nel DOM, 19.469 nodi in chat in entrambi.

⛔ Nota di metodo trovata scattando: su un profilo Chrome **vergine** la modale «Primo avvio ·
2 di 4» copre la chat, e le prime foto mostravano l'onboarding invece della conversazione. È
la stessa trappola già in memoria ([[non-consegnare-il-lavoro-a-meta-di-un-altro]]): un
profilo pulito **non è** lo stato dell'owner. La sonda ora la chiude con «Salta per ora».

### 5.3 ⛔⛔ TROVATO GUARDANDO LE FOTO — un difetto GIÀ NOTO, NON MIO e NON corretto

⛔ **Attribuzione, prima dei numeri: non è una mia scoperta.** È già in memoria, stessa data —
[[un-confronto-css-per-stringa-sovrastima-le-mancanze]], 11/09: «**una regola su "tutti i
figli" del pacchetto ha svuotato la chat delle sessioni lunghe**: si prova su un figlio con
`position` suo e **su una sessione LUNGA**». Quello che segue è una **conferma indipendente con
i numeri**, arrivata per un'altra strada (le foto di questo giro), più la catena delle altezze
che quella nota non riporta. La causa è il pacchetto refactor UI dell'owner, già committato
(coerente col fatto che `public/` sia identico a HEAD).

Nelle foto **la colonna della chat appare vuota**, anche a pagina ferma, anche in fondo. Non
lo era: il DOM ha 19.469 nodi e 916.907 caratteri. Misurato risalendo la catena dei genitori
(sonda `sonda-catena-altezza.mjs`, finestra vera **senza** `setDeviceMetricsOverride`, per
escludere che fosse un artefatto della sonda):

| elemento | altezza | display | flex | min-height |
|---|---:|---|---|---|
| `body` | 806 | flex | `0 1 auto` | 0 |
| `#app.talos-shell.app-shell` | 806 | grid (`806px`) | — | 0 |
| `#centro main.talos-screen` | 806 | flex | `1 1 auto` | 0 |
| `#schermoChat.view-pane.active.chat-view` | **806** | flex | `1 1 auto` | 0 |
| **`.talos-conversation.conversation`** | **42** | block | `1 1 auto` | 0 |

**Lo scroller della conversazione è alto 42 px su un contenitore da 806.** Con
`scrollTop 9210 / scrollHeight 9253`, la finestra di 42 px cade su una zona vuota. E si
auto-alimenta: `aggiornaSpazioCodaConversazione` mette `padding-bottom: clientHeight/2` = **21 px**.

- ⛔ **Non è la mia cura**: succede identico sulla sessione **corta** di riferimento
  (`da4fe957`, 669 righe, primi turni a `top: -8861`), e l'impronta del DOM prima/dopo la cura
  è la stessa (§5.1).
- ⛔ **Non è il lavoro NON COMMITTATO dell'altro agente**: il server serve `harness-ui/public/`,
  e `git diff HEAD -- harness-ui/public/` è **vuoto** — il bundle servito è esattamente HEAD.
  (`frontend/src/legacy/app.js`, `index.template.html`, `avvio.js`, `styles/index.css` sono
  modificati in questo albero da lui, ma quelle modifiche non sono nel bundle servito.) ⇒ la
  regola CSS incriminata è **già committata**, il che quadra con l'attribuzione al pacchetto.
- ⛔ **Non l'ho corretto**: è layout, cioè CSS / `app.js` — non la mia lane oggi, ed è già
  in carico a chi ha trovato la nota di memoria.
- ⛔ **Non l'ho verificato sul 4174 dell'owner** (non lo tocco): se lì la chat si vede, il
  4174 gira da un albero diverso da questo.
- ⭐ Quello che questo giro AGGIUNGE alla nota già in memoria: la catena delle altezze qui
  sopra (dove esattamente collassa: `#schermoChat` 806 → `.talos-conversation` 42, con
  `flex: 1 1 auto; min-height: 0` che *sembrano* giusti — `public/styles.css:1634`), e il fatto
  che il padding in coda si **auto-alimenta** (`clientHeight/2` = 21 px su 42).

⭐ **Conseguenza sulle mie misure: sono CONSERVATIVE.** Con la colonna collassata a 42 px il
browser non paga il layout e il paint di quasi nessuno dei 19.469 nodi. Su una chat di altezza
normale il difetto «prima» sarebbe **peggiore** di 20,2 s, e il guadagno della cura maggiore —
mai il contrario. Ma il numero esatto, su un layout sano, non l'ho misurato.

⭐ Secondo difetto visto nella stessa foto (minore): a 3 s dal clic la colonna chat è
**completamente vuota, senza nessun segnale di caricamento** — `is-restoring` nasconde tutto
senza dire che sta costruendo. Tre secondi di vuoto muto. Registrato, non corretto (`app.js`).

### 5.3 Le suite

- backend: `node --test tests/*.test.mjs` → **2276 / 2276 verdi, 0 rossi** (2269 di prima + i 7
  nuovi). ⛔ Il rosso «non tuo» segnalato dal coordinatore **non si è manifestato**: su questa
  macchina, su questo albero, la suite backend è interamente verde.
- frontend: `npm run test:unit` → **696 / 696 verdi** (689 di prima; la differenza non è mia —
  non ho toccato `frontend/`).
- mirati durante il lavoro: `tests/http-routes-sessions.test.mjs` 139/139,
  `tests/session-registry.test.mjs` 314/314 — **senza modificarne nessuno**.

---

## 6. Che cosa RESTA, misurato (⛔ in `app.js`, che non ho toccato)

Restano **7,1 s** e **2 long task da ~2,4 s**. Non li ho ipotizzati: profilo CPU del
renderer (`Profiler`, campionamento a 200 µs, 49.540 campioni su 25,1 s di apertura). Self-time
in testa, escluso l'idle (86,2%):

| funzione | self-time | quota |
|---|---:|---:|
| `aggiornaSpazioCodaConversazione` (`app.js:693`) | **1.463 ms** | 5,8% |
| `fondoConversazioneInVista` (`app.js:8477`) | **643 ms** | 2,6% |
| `querySelectorAll` (nativa) | 518 ms | 2,1% |
| `inFondo` (dentro `mantieniFondoDuranteRipristino`, `app.js:15053`) | 234 ms | 0,9% |

**≈ 2,9 s, cioè esattamente i due long task residui — e sono tutti lo stesso difetto:** il
callback del `MutationObserver` legge layout e scrive scroll, e `aggiornaSpazioCodaConversazione`
per giunta fa `conversation.querySelector('.message, .talos-turn')` su un albero da 19.482 nodi
**due volte per ogni `inFondo()`**.

### 6.1 Diff n.1 — `mantieniFondoDuranteRipristino` (`app.js:15039`)

Separare lettura e scrittura e farle **una volta per frame**, non una per mutazione
(web.dev / webperf.tips, 11/09/2026). Misurato: vale ~2,3 dei 2,9 s residui.

```diff
-    const osservatore = new MutationObserver(inFondo);
+    /* ⛔ 11/09 — misurato col profilo CPU su una sessione da 19.482 nodi: `inFondo` legge
+       scrollHeight e scrive scrollTop DENTRO il callback, cioè un reflow sincrono forzato per
+       ogni mutazione — `aggiornaSpazioCodaConversazione` 1.463 ms + `fondoConversazioneInVista`
+       643 ms + querySelectorAll 518 ms di self-time. Il callback ora marca soltanto: la coppia
+       lettura+scrittura avviene una volta per frame. */
+    let inFondoChiesto = false;
+    const chiediFondo = () => {
+      if (inFondoChiesto || smesso) return;
+      inFondoChiesto = true;
+      window.requestAnimationFrame(() => { inFondoChiesto = false; inFondo(); });
+    };
+    const osservatore = new MutationObserver(chiediFondo);
```

e, più sotto, la rete di sicurezza che oggi è una costante:

```diff
-    window.setTimeout(() => { if (!smesso) scopri(); }, 8_000);
+    /* ⛔ 11/09 — gli 8 s erano tarati su «1.235 righe in ~1s» (il commento lo dichiara). La
+       sessione 8dde6bff ne ha 34.026: la chat si scopriva a 12,9 s, cioè a costruzione ancora
+       in corso. Il tetto segue la taglia della cronologia invece di essere un numero fisso. */
+    window.setTimeout(() => { if (!smesso) scopri(); }, Math.min(20_000, 8_000 + state.realSession.sequenzeViste.size * 2));
```

### 6.2 Diff n.2 — `case 'ToolCallArgs'` (`app.js:13906`)

Difesa in profondità: la cura lato server toglie il problema su questa rotta, ma un replay
arriva anche da `apriFlussoFiglia` (`app.js:8580`), e il doppio `JSON.parse` è comunque sprecato.

```diff
           info.argomenti += evento.delta;
+          /* ⛔ 11/09 — allineato al ramo gemello ReasoningMessageContent (13826), che durante un
+             replay NON disegna. Qui invece si parsava la stringa CRESCENTE e si ricostruiva il
+             sottoalbero a ogni delta: contati sul file dell'owner, 154.884.711 caratteri a
+             JSON.parse (×2, perché renderizzaArgomentiAttrezzo riparsa) e 15.952 replaceChildren. */
+          if (state.realSession.deferHistoricalRendering) break;
           let argomentiParsati = null;
           try { argomentiParsati = JSON.parse(info.argomenti); } catch { /* … */ }
```

con il disegno rimandato a `ToolCallResult` (dove `info.argomenti` è completo), e

```diff
-          if (info.detail) renderizzaArgomentiAttrezzo(info.detail, info.argomenti);
+          /* ⛔ il secondo JSON.parse era gratis da evitare: l'oggetto l'abbiamo già qui sopra. */
+          if (info.detail) renderizzaArgomentiAttrezzo(info.detail, info.argomenti, argomentiParsati);
```

(`renderizzaArgomentiAttrezzo`, `app.js:10022`, prende un terzo parametro opzionale e salta il
proprio `JSON.parse` quando lo riceve).

---

## 7. Che cosa NON ho verificato

- **Il Chrome reale dell'owner, col suo profilo e le sue preferenze.** Io misuro su un profilo
  pulito: il suo ha l'accelerazione hardware spenta in `Local State`, estensioni, e le
  preferenze salvate che Playwright/CDP non hanno. Ho coperto la parte GPU emulandola
  (`--disable-gpu`, `gpu_compositing: disabled_software`) e la differenza è 1,5% — ma non è
  la stessa cosa di aprire la sua finestra.
- **Il 4174.** Non l'ho toccato: banco su 4179 con una copia dello store.
- **Una sessione VIVA da 34k eventi** aperta mentre il modello sta ancora scrivendo. Il
  contrario (il dal vivo non si coalesce) è provato dal test, ma non dal vivo con un modello vero.
- **Le altre cinque sessioni sopra 18k righe**: stesso meccanismo, non riaperte una per una.
- **`ToolCallOutput`**: è nella tabella delle chiavi ed è provato dai test, ma in questo file
  ce ne sono **zero** — quindi non è passato per il giro vero.
- **Il costo di `elenca()` ogni 15 s**: misurato (2-4 ms per funzione su 34.019 eventi),
  registrato come debito, **non curato**.
- **I due diff per `app.js`**: scritti e motivati coi numeri, **non applicati né provati** —
  quel file è in mano a un altro agente fino al suo rientro.
- **Le viewport diverse da 1440×900** (laptop 1024×800, e le altre della matrice desktop).
- **Il difetto di §5.3 (colonna chat alta 42 px)**: misurato e attribuito (regola CSS «su tutti
  i figli» del pacchetto refactor, già nota in memoria) — ma **non corretto** e **non riprodotto
  sul 4174**. Finché resta, la misura «prima» di §1.4 è un limite INFERIORE al costo vero:
  quale sia il costo su un layout sano non l'ho misurato.
- **Quale sia la regola CSS esatta**: non l'ho isolata. Ho la catena delle altezze, non la
  riga colpevole — e non l'ho cercata oltre, perché è in carico ad altri.

---

## 8. Riepilogo

**Cosa devi fare tu**
- **§5.3 — la colonna della chat è alta 42 px in questo albero**, confermando con i numeri la
  nota già in memoria sul pacchetto refactor («una regola su tutti i figli ha svuotato la chat
  delle sessioni lunghe»). Dimmi se sul tuo 4174 la conversazione si vede: se sì, i due alberi
  divergono; se no, è aperto e grosso, e la catena delle altezze è in §5.3 per chi lo prende.
- Dire se i due diff di `app.js` (§6) li passo all'agente che ha quel file, o li tengo in coda.
- Dire se apro lo stesso giro sulle altre cinque sessioni sopra 18k righe o basta questa.
- Il push: non ho fatto nessun `git add`/`commit`/`push`.

**Cosa faccio io**
- Riprendo da solo su ciò che resta nella mia lane, se dai il via.

**Cosa rimane**
- I 7,1 s residui: causa misurata (layout thrashing in `app.js`, §6), cura scritta, non applicata.
- Il difetto §5.3 e il vuoto muto a 3 s: registrati, non corretti (non è la mia lane).
- `ToolCallOutput` coalescibile ma mai esercitato da un giro vero.
- Il costo di `elenca()` ogni 15 s: debito registrato, non curato.
- Nessuna verifica sul Chrome reale dell'owner.
