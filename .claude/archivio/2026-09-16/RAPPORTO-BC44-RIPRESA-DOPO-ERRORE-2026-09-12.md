# BC-44 — una ricerca fermata dal FORNITORE si riprende (12/09/2026)

> Lane `lane/harness-desktop`. Nessun `git`, nessun tocco al 4174, nessun POST verso la 4174.
> Il giro vero è girato su un **banco mio** (porte 4181 e 4182), con una **copia** dello store e
> della cartella della ricerca. Modello a pagamento: **solo `z-ai/glm-5.3-flash`**.

---

## 1. Il difetto, misurato — e il pezzo che mancava

Giro vero L9 del 12/09, ricerca `dec896c0-12ae-4f1d-9f82-d03ccc428fdf` (madre `78247740`). Il motore
ha lavorato: **16 giri, 32 attrezzi, 26 passi nel giornale, 67 testi tenuti in `fonti/`, 134.464
token dalla cache**. Poi, a un passo dal deposito:

```
{"type":"RunError","message":"Upstream idle timeout exceeded","code":"internal-error","_sequenza":14758}
```

⇒ `meta.json` → `terminata: "failed"`, `motivo` «La ricerca non è arrivata in fondo.», e
`POST /api/v1/sessions/:madre/research/:id/ripresa` → **409 `RESEARCH_CONFLICT`**.

**La catena esatta, letta e non dedotta:**

| dove | cosa succedeva |
|---|---|
| `agent-service.mjs` (catch di `avviaSessione`) | tornava `{ok:false, esito:null, erroreInterno:"Upstream idle timeout exceeded"}` — **senza il `code`**, che finiva solo nell'evento `RunError` |
| `research-orchestrator.onConclusioneRicerca` | nessun rapporto, nessun `REFUSED`, `comeFinita` assente ⇒ ramo finale `terminata:'failed'`, **muto sulla causa** |
| `riprendi()` | `voce.messaggiFinali` è `null` ⇒ via B (giornale). Giornale non terminale, non in pausa; `voce.interrotta` è **`undefined`** (lo scrive solo `ripristina()`, cioè solo dopo un riavvio) ⇒ **«That research is still running: nothing to resume»** |
| la rotta | `!esito.ok` ⇒ `RESEARCH_CONFLICT` ⇒ **409** |

⛔ La frase del rifiuto era **falsa due volte**: non stava girando, ed era caduta un minuto prima.

⛔ **Quello che il codice diceva e che va detto:** `chiamaConRitenta` nel kernel ritenta già
(429/408/5xx, quattro tentativi, backoff con jitter) — e **non poteva servire qui**, per una ragione
documentata dal fornitore (§2, S1): quando l'errore arriva *dopo* il `200 OK`, lo stato HTTP resta
200 e nessuna guardia sullo stato lo vede. ⇒ La cura non poteva stare nella chiamata: doveva stare
al livello della **ricerca**, dove c'è il giornale.

⛔ **Cosa NON ho stabilito**: quale riga esatta abbia lanciato l'eccezione. La stringa «Upstream idle
timeout exceeded» non esiste in nessun file di `harness-ui/src/` (verificato con un grep sull'intero
repo: compare solo nel `.jsonl` della sessione e nel ledger), quindi arriva **verbatim dal fornitore**
attraverso un `Error` che `agent-service.mjs` marca col suo default `internal-error`. Il `code` del
kernel (`e.stato`, `e.limitatoDalFornitore`) non c'era: non è il ramo di `chiamaConRitenta`, che
avrebbe scritto «HTTP … dopo 4 tentativi: …». **Dichiarato come non verificato**, e la cura è
costruita per non dipenderne (§3).

---

## 2. Ricerca web PRIMA di scrivere — fonti e date

⚠️ `WebSearch` esaurito per questa sessione ⇒ fonti primarie via `WebFetch` + lettura diretta del
**codice** del concorrente clonato. Tutte lette il **12/09/2026**.

| # | fonte | citazione verbatim | cosa ha cambiato nel codice |
|---|---|---|---|
| **S0** | **Hermes Agent v0.21 (Nous Research)** — clone a commit fissato in `%LOCALAPPDATA%\Temp\talos-competitor\hermes-agent-v21`, file `agent/error_classifier.py` e `docs/session-lifecycle.md` | `error_classifier.py`, docstring: «Provides a structured taxonomy of API errors and a **priority-ordered** classification pipeline that determines the correct recovery action … **Replaces scattered inline string-matching** with a centralized classifier». `ClassifiedError.retryable: bool`. E `session-lifecycle.md`: `resume_pending` = «**Soft recovery marker** … preserves the existing `session_id` — the user continues on the same transcript», con `resume_reason` («Why resume was marked»), **tenuto distinto** da `suspended` = «**Hard force-wipe signal**» | ⇒ **La forma della cura è questa**: un classificatore **unico** con un campo esplicito (`transitorio`), un **ordine di precedenza dichiarato**, e un `failed` transitorio trattato come *soft recovery* (riprendibile, **con il motivo scritto**) mentre il `failed` vero resta quello che era. `motivoErrore.classe` **è** il `resume_reason` |
| **S0-bis** | stesso file, righe ~1174-1190 | sul disconnect di un modello che ragiona: «the upstream proxy **idle-killing a long thinking stream**», e la cura sbagliata (comprimere) «silently delete[s] conversation history on a **phantom context-length error**» | ⇒ è **il nostro caso alla lettera** (`primoTokenMs: 37.355`, cioè trentasette secondi di ragionamento), e ⇒ la classe `contesto` qui **non è transitoria**: ritentarla identica non la cura, e l'unica «cura» disponibile distruggerebbe la conversazione |
| **S1** | **OpenRouter, «Errors»** — <https://openrouter.ai/docs/api-reference/errors> | «If an attempt fails before any tokens reach you, OpenRouter automatically tries a backup provider. **The `200 OK` has already been sent by then, so the status stays `200` even when every provider fails.**» · per il non-streaming: «a `200 OK` whose JSON body holds only an `error` object and no `choices`; **check the body for an `error` field even on a `200`**» · per lo streaming: gli errori arrivano dentro gli SSE con `finish_reason: "error"` | ⛔ **Il vincolo che non conoscevo, e che ha deciso dove va la cura.** Il ritentativo del kernel decide su `siRitenta(r.status)`: con lo stato a **200** non scatta mai. ⇒ niente da «aggiustare» nel kernel (che per giunta è condiviso col mobile e fuori dal mio perimetro): la ripresa va al livello della ricerca. Codici che il fornitore dichiara: 400/401/402/403/408/429/502/503/504 — con 429/502/503/504 come i ritentabili, e i timeout di connessione accanto |
| **S2** | **Anthropic, «How we built our multi-agent research system»** — <https://www.anthropic.com/engineering/built-multi-agent-research-system> | «Agents can run for long periods of time, maintaining state across many tool calls. This means we need to **durably execute code and handle errors** along the way.» · «When errors occur, **we can't just restart from the beginning: restarts are expensive and frustrating for users.** Instead, we built systems that can **resume from where the agent was when the errors occurred**.» · «We combine the adaptability of AI agents … with **deterministic safeguards like retry logic and regular checkpoints**.» | ⇒ il checkpoint **esisteva già** (il giornale di L4/L9: piano, passi, spesa, `fonti/<sha256>`): mancava solo il permesso di rientrarci, e mancava del tutto il «retry logic». Da qui la ripresa automatica **una volta** (§3.4) |

⭐ **E prima ancora, dentro il proprio codebase** (lezione 06/09): il pezzo che mancava non era una
struttura nuova. `talosResearchReplay`/`Recover`/`NextStep`/`WorkLeft`/`Spent` e `consegnaDiRipresa()`
c'erano già e sono **provati**; `elencaFonti`, `ripristinaCacheFetch` pure. BC-44 non aggiunge un
motore: **apre un cancello** e scrive perché.

---

## 3. La cura — file per file, con le righe

### 3.1 La tabella transitorio / non transitorio (`src/research-orchestrator.mjs`)

`classificaErroreDiCorsa({codice, messaggio}) → {classe, transitorio}`, **funzione pura esportata**
(un test la morde da sola).

| classe | transitorio | come si riconosce |
|---|---|---|
| `timeout-fornitore` | **sì** | `idle timeout`, `timeout`, `timed out`, `deadline exceeded`, `http 408/504/524` — **è la classe del 12/09** |
| `traffico` | **sì** | `rate limit`, `too many requests`, `http 429` |
| `guasto-fornitore` | **sì** | `bad gateway`, `service unavailable`, `gateway timeout`, `overloaded`, `at capacity`, `internal server error`, `http 500/502/503` |
| `rete` | **sì** | `ECONNRESET`, `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`, `EAI_AGAIN`, `fetch failed`, `socket hang up`, `connection reset`, `terminated` |
| `flusso-interrotto` | **sì** | `flusso sse`, `unexpected eof`, `premature close`, `stream ended` |
| `credito` | no | `insufficient credits/balance/quota`, `payment required`, `out of funds`, `billing` |
| `credenziale` | no | `unauthorized`, `invalid api key`, `no auth credentials`, `forbidden`, `http 401/403` |
| `contesto` | no | ogni `code` che comincia per `CTX_`, oppure `context length`, `maximum context`, `too many tokens` |
| `richiesta-non-valida` | no | `invalid request`, `bad request`, `model not found`, `no endpoints found`, `http 400/404` |
| `fermato` · `giri-esauriti` · `premesse-negate` | no | il `code` è l'esito del TASK (o la firma «fermato su richiesta» nel messaggio) |
| `ignoto` | **no** | tutto il resto |

⛔ **L'ordine è la cura, non l'elenco.** Le famiglie NON transitorie (`credito`, `credenziale`,
`contesto`, `richiesta-non-valida`) si guardano **prima** delle transitorie, perché le loro frasi
contengono le parole delle altre: *«insufficient credits: you have been **rate limited** until you
top up»* finirebbe fra i ritentabili e farebbe ripartire una corsa su un conto vuoto. È la stessa
precedenza di Hermes (billing prima di rate_limit). **Due test mordono esattamente questo.**

⛔ **Il `code` da solo non basta**: `agent-service.mjs` marca `internal-error` **ogni** guasto del
servizio, il nostro compreso. Il codice decide solo quando dice qualcosa (`CTX_*`, gli esiti del
task); per il resto decide il **messaggio**, che è l'unica cosa che il fornitore ha davvero detto.

⛔ **`ignoto` NON è transitorio, e diverge da Hermes apposta** (là `unknown → retryable=True`): là si
ritenta **una chiamata**, qui si riaprirebbe **una corsa da venti minuti**. Costi diversi, default
diversi. ⇒ *si riprende solo ciò che si è riconosciuto*, e tutto il resto si comporta come ieri —
**nessuna regressione è possibile da questa riga**.

### 3.2 Il server

| file | cosa |
|---|---|
| `src/research-orchestrator.mjs` | **`ATTESA_RIPRESA_AUTOMATICA_MS = 20_000`** (esportata) e il blocco di testa che cita le tre fonti · **`classificaErroreDiCorsa()`** esportata (tabella §3.1) · **`ultimaCadutaDegliEventi()`** e **`causaDellaCaduta()`** (§3.3) · `motivoDelloStato(stato, dettaglio, motivoErrore)` — terzo argomento: su un `failed` transitorio la frase cambia e dice **chi** è caduto e che **si riprende** · `onConclusioneRicerca`: il ramo finale calcola la classe e scrive `motivoErrore {classe, transitorio, codice, messaggio}`; `motivoErrore: null` entra in `comune`, cioè **si azzera su ogni conclusione che non sia un `failed`** · **`riprendiDaSolaUnaVolta()`** (§3.4) · `riapriLaMetadata()` — `terminata:null` + `motivoErrore:null`, su **entrambe** le vie di ripresa · `riprendi({id, automatica})`: cancello nuovo prima dei due vecchi, e la guardia «still running» diventa `!inPausa && !voce.interrotta && !cadutaRiprendibile` · `voceEsposta`: **due campi nuovi**, `riprendibile` e `motivoErrore` |
| `src/research-store.mjs` | `aggiornaRicerca` accetta `motivoErrore` (stessa disciplina: `undefined` = non toccarlo, `null` = azzeralo); `creaRicerca` lo nasce `null`. ⛔ Lo store **non classifica e non valida**: scrive ciò che il chiamante decide, come per `terminata` |
| `src/agent-service.mjs` | **una riga**: il ritorno del catch porta anche `codiceErrore: code`. Il codice viaggiava **solo** dentro l'evento `RunError`, e chi riceve la conclusione legge il **valore di ritorno**: due file, nessun ponte |
| `src/session-registry.mjs` | **una riga**, dichiarata: lo stesso `codiceErrore` sul ramo raro (`.catch` di `esecuzione`), perché la forma sia una sola |
| `src/http-app.mjs` | **nessuna modifica necessaria**, e l'ho verificato invece di supporlo: la rotta rispondeva 409 perché `riprendi()` rispondeva `ok:false`. Curato l'orchestratore, la stessa rotta risponde **200 con la voce riletta** (§5.2). I codici, l'inventario e i messaggi restano quelli di L5 |

**Il contratto cresce da 16 a 18 campi, additivi** (nessuno dei 16 cambia nome, tipo o significato):

- `riprendibile` (booleano) — *«se premo Riprendi adesso, il server accetta?»*. La risposta la dà il
  **server**, con la stessa condizione che il cancello fa rispettare;
- `motivoErrore` — `{classe, transitorio}` oppure `null`. ⛔ Il **messaggio grezzo** del fornitore e
  il suo **codice** restano su `meta.json` per la diagnosi e **non escono**: a schermo sarebbero nomi
  tecnici. La frase per una persona è in `motivo`, composta in un posto solo.

⛔ **I due `failed` non sono lo stesso stato**, e la distinzione è tutta in `terminata`: se è assente
ed è `statoVivo` ad aver *dedotto* `failed` (riavvio del server), la ripresa dal giornale c'era già e
resta; se vale `'failed'`, la corsa è finita davvero e decide la **causa**.

⛔ **Fuori dal perimetro, dichiarato**: `bloccata-dal-permesso` e `giri-esauriti` il giornale li tiene
riprendibili apposta, ma `riprendi()` non li accetta nemmeno oggi. Aprirli è una riga a parte, con la
sua verifica — non l'ho fatto.

### 3.3 ⭐⭐⭐⭐ La prova c'era già, e nessuno la leggeva

La cura di §3.2 vale **da oggi in avanti**. Ogni ricerca caduta **prima** — compresa `dec896c0`, cioè
il caso che ha fatto scrivere BC-44 — avrebbe avuto `motivoErrore: null` per sempre e sarebbe rimasta
non riprendibile: **una cura che non cura il caso che l'ha prodotta**.

Ma il fatto è registrato lo stesso, e lo era da sempre: il `RunError` sta nel `.jsonl` della
**sessione**, e `ripristina()` rimette quegli eventi in `voce.eventi` a ogni avvio del server. ⇒
`causaDellaCaduta(record, voceSessione)` usa la causa **registrata** se c'è, altrimenti la **deduce**
da lì. Nessun file nuovo da leggere, nessuna scrittura sul disco: la deduzione vive nella **lettura**,
come la correzione degli stati di `elenca()`.

⛔ Si scandisce **all'indietro** e ci si ferma al primo `RunStarted`/`RunFinished`: un `RunError` di
tre giri fa non dice niente sul giro appena caduto. Un test morde esattamente quello.

### 3.4 La ripresa automatica — **sì, con quattro cancelli e un tetto**

Il brief chiedeva di valutarla. **L'ho fatta**, perché senza di lei il difetto resta metà curato:
l'owner scopre la caduta solo quando torna a guardare, e nel frattempo venti minuti pagati stanno
fermi. La fonte (S2) chiede esattamente questo: *retry logic* accanto ai *checkpoint*.

Ma riprendere **costa**, e non è ritentare una chiamata. Quindi:

1. **transitoria** (altrimenti si ripeterebbe identica);
2. **c'è lavoro da salvare** — almeno un `step_finished` nel giornale: una corsa caduta al primo
   respiro non salverebbe nulla e spenderebbe il doppio;
3. **una sola volta, per RICERCA** (non per giro): si guarda **tutto** il giornale. È la lettura più
   stretta delle due, scelta apposta — se due riprese automatiche non bastano, la terza la decide una
   persona. Il tetto vale per il timer, **non** per la persona: «Riprendi» resta nel menu;
4. **lo stato si rilegge DOPO l'attesa**: in quei secondi qualcuno può aver annullato, eliminato o
   ripreso a mano, e scriverci sopra sarebbe passare addosso a una scelta appena presa.

⛔ **L'ordine non è di comodo**: lo stato onesto (`failed` + causa) si scrive **prima** di aspettare.
Se il processo muore durante l'attesa, sul disco resta una ricerca riprendibile a mano; aspettando
prima, resterebbe una ricerca senza stato e senza motivo.

⛔ Nel giornale la riga è `run_resumed {auto:true, causa:'<classe>'}`. Senza `auto`, un giornale
rigiocato attribuirebbe a una persona una spesa decisa da un timer — e il cancello (3), che legge
proprio quella riga, non avrebbe più nessun tetto da far rispettare. Una ripresa **chiesta** non si
marca.

**I venti secondi sono aritmetica, non una misura** (e lo dice il commento accanto alla costante):
l'ultimo tentativo del backoff del kernel cade intorno ai 4 s dal primo (0,5+1+2 più jitter), quindi
un'attesa più corta ripartirebbe dentro la stessa finestra che ha appena fallito quattro volte. Non
è tarata su guasti veri: il dato da raccogliere sarebbe la **durata** dei guasti del fornitore.

⛔ **Debito dichiarato**: `ripresaAutomatica` e `dormiFn` sono iniettabili nell'orchestratore ma
`session-registry.mjs` **non li espone**, quindi oggi il 4174 non ha un interruttore per spegnerla.
Non l'ho aggiunto per non allargare le modifiche a un file su cui lavora un altro agente.

### 3.5 Il frontend

⛔ Caricata la skill `frontend-design` prima di disegnare; **nessun pulsante affiancato**: l'azione
sta nel menu **⋯** che c'era già.

| file | cosa |
|---|---|
| `frontend/src/components/ricerca-dettaglio.js` | **`INTERROTTA_DAL_FORNITORE`** (parola, tono `warning`, «cosa fare») e **`statoDellaVoce(voce)`**, che la sceglie quando `motivoErrore.transitorio` è vero · `frasiVoce` usa `statoDellaVoce` (la frase precisa arriva comunque dal server in `motivo`, come per ogni altro stato) · **`puoRiprendere`** onora `voce.riprendibile` quando c'è, e ricade sulla regola di ieri quando non c'è |
| `frontend/src/components/ricerca.js` | `statoRicerca()` accetta la **voce** oltre alla stringa, così la **riga dell'elenco** e la **scheda** dicono la stessa parola. ⛔ La tabella resta **una sola**, in `ricerca-dettaglio.js` |

⛔ **`frontend/src/legacy/app.js` NON è stato toccato** (ci lavora un altro agente) e **non serve un
aggancio**: la sezione Ricerca passa da `sezioni-adattatori.js` → `frasiVoce`/`vociMenuRicerca`, e le
foto di §5.3 lo provano dal vivo. **Nessun diff da consegnare.**

⛔ **`public/` NON è stato ricostruito**: `npm run build:ui` bundlerebbe anche il lavoro a metà di
altri due agenti. Le foto sono state prese servendo `frontend/dist` (costruita da me) con
`TALOS_HARNESS_UI_PUBLIC_DIR`. La consegna a `public/` è del coordinatore.

---

## 4. Le prove automatiche — nei due versi

**Nuovi: 12 test** (10 sul motore/rotte, 2 sul frontend).

`tests/ricerca-giornale-e-ripresa.test.mjs` (+10)
- **la tabella** §3.1, col caso vero verbatim, e **le due righe di precedenza** che morderebbero se
  l'ordine si invertisse;
- `ignoto` → non transitorio, **con scritto perché divergo da Hermes**;
- una caduta del fornitore **registra** la causa, la dice in italiano, e la voce si dichiara
  riprendibile — con `assert.doesNotMatch(/Upstream|timeout|internal-error/)` sulla frase a schermo;
- **la ripresa accetta** e **non ripaga i passi già fatti**: `talosResearchSpent` identico prima e
  dopo, consegna con «4213 tokens, 3 searches, 5 pages» e «Steps already completed»;
- ⛔ **verso contrario**: caduta non transitoria ⇒ rifiuto e **nessun avvio**;
- ⛔ **verso contrario**: ricerca caduta **prima** di oggi senza `motivoErrore` e **senza eventi** ⇒
  come ieri;
- ⛔ **verso contrario**: ricerca **consegnata** (`done`) non riparte **nemmeno dalla via A** — buco
  preesistente chiuso qui;
- **ripresa automatica**: una volta, `run_resumed {auto:true, causa}` nel giornale, e alla seconda
  caduta **non si aspetta nemmeno**;
- ⛔ **verso contrario**: non scatta senza `step_finished`, né su `credito`;
- **la causa dedotta** dagli eventi della sessione (la forma esatta di `dec896c0`), e il verso
  contrario: il `RunError` di un **giro precedente** non conta.

`tests/http-routes-research.test.mjs` (+2) — server vero, registro vero, store su disco temporaneo:
- caduta del fornitore ⇒ la voce dice `riprendibile:true` **prima**, e `POST …/ripresa` risponde
  **200** (era 409), con la voce riletta a `running` e `motivoErrore:null`;
- ⛔ verso contrario: `HTTP 401` ⇒ **ancora 409 `RESEARCH_CONFLICT`**, e **niente è ripartito**.

`frontend/tests/unit/ricerca-azioni.test.mjs` (+2) — la parola nuova e il pulsante che esiste solo se
il server dice di sì; verso contrario su entrambi.

**Esiti misurati**

| comando | esito |
|---|---|
| `node --test tests/ricerca-giornale-e-ripresa.test.mjs tests/http-routes-research.test.mjs tests/research-orchestrator.test.mjs tests/ricerca-motore-nella-corsa.test.mjs tests/research-store.test.mjs` | **139/139 verdi** |
| `node --test tests/*.test.mjs tests/research/*.test.mjs` (suite server intera) | **2939/2940 verdi** |
| `npm --prefix frontend run test:unit` | **980/980 verdi** |

⛔ **L'unico rosso NON è mio**: `tests/bc40-mappa-minima.test.mjs` non carica
(`SyntaxError: does not provide an export named 'elencaDaCartella'`). È il lotto **BC-40** di un altro
agente, dentro `src/kernel/` — che non ho toccato e che il brief mi vieta. Era rosso anche prima delle
mie modifiche.

⛔ **I due test del contratto sono stati aggiornati a mano** (16 → 18 chiavi), ed è voluto: una
crescita del contratto deve costare una riga a chi la fa, così si vede invece di scivolare dentro.

---

## 5. La prova vera — la ricerca `dec896c0` ripresa davvero

### 5.1 Il banco (mai la 4174)

- `banco-bc44/progetto/.harness-ui-research/dec896c0-…/` = **copia** della cartella vera (67 fonti,
  `giornale.jsonl` 55 righe, `piano.json`, `indice-fonti.json`, `cache.json` 2,4 MB, `meta.json` con
  `terminata:"failed"`);
- `banco-bc44/store/` = **copia** dei due `.jsonl` (madre `78247740`, figlia `dec896c0`), con la sola
  `cartella` dell'intestazione riscritta sul banco;
- server su **porta 4181** (`TALOS_HARNESS_UI_PORT/SESSIONS_DIR/PROJECT_DIRS`), chiave dal portachiavi
  come il 4174, modello della sessione ripristinato dall'intestazione: **`z-ai/glm-5.3-flash`**;
- un secondo banco **di sola lettura** su **4182** (`banco-bc44-foto`, stato congelato a `failed`) per
  le foto.

### 5.2 Prima della ripresa — la voce, dalla rotta vera

```
GET /api/v1/sessions/78247740-…/research/dec896c0-…
{ "stato": "failed",
  "riprendibile": true,
  "motivoErrore": { "classe": "timeout-fornitore", "transitorio": true },
  "motivo": "La ricerca si è interrotta a metà: il fornitore del modello ha chiuso la connessione
             mentre lavorava. Il lavoro già fatto è conservato e può riprendere da lì.",
  "modello": "z-ai/glm-5.3-flash", "modelloGiudice": "z-ai/glm-4.7-flash",
  "spesa": { "tokens": 30706, "searches": 12, "pages": 13 },
  "passi": 26, "giornale": { "eventi": 55, "righeSaltate": 0, "stato": "collecting" } }
```

⛔ Questa voce **non ha `motivoErrore` sul disco**: `meta.json` è quello di stamattina, scritto prima
che la cura esistesse. La classe viene **dedotta** dal `RunError` vero degli eventi della sessione
(§3.3) — cioè la prova che il pezzo di §3.3 è quello che fa funzionare la cura sul caso reale.

```
POST /api/v1/sessions/78247740-…/research/dec896c0-…/ripresa   →   HTTP 200        (era 409)
{ "stato": "running", "riprendibile": false, "motivoErrore": null, "motivo": null }
```

### 5.3 Le foto — `.claude/foto-bc44-2026-09-12/`

Tema **scuro** e tema **chiaro**, viewport **desktop 1440×900**; più **laptop 1024×800** in scuro
(dove le colonne si stringono per prime).

| file | cosa mostra |
|---|---|
| `01-elenco-{desktop,laptop}-{dark,light}.png` | la carta con il timbro **«Interrotta dal fornitore»** e la frase italiana |
| `03-dettaglio-…png` | la scheda: `Stato: Interrotta dal fornitore` · `Durata 27 min 43 s` · `Speso 30,7k token · 12 ricerche sul web · 13 pagine aperte` · `Giornale di bordo 55 passaggi registrati` |
| `04-menu-dettaglio-desktop-{dark,light}.png` | il menu **⋯** aperto: **«Apri la conversazione · Riprendi · Elimina la ricerca»** |

Errori a runtime letti dalla console in ogni giro: **nessun `pageerror`**. Restano due righe
preesistenti e non mie (un `503` di una risorsa e il rifiuto di incorniciare `anthropic.com` per
`frame-ancestors`), entrambe della scheda Browser ripristinata dalla sessione.

⛔ **Trovato guardando le foto, non mio e non toccato**: nella barra laterale la stessa sessione porta
il timbro **«errore · glm-5.3-flash»** mentre la sezione dice «Interrotta dal fornitore». Sono due
lettori diversi dello stesso fatto (la riga di sessione vive in `session-item.js`, che il brief mi
vieta). **Registrato, non corretto.**

### 5.4 L'esito della corsa ripresa — e il difetto che ha trovato

**Il giro 2 (la ripresa che ho chiesto io dalla rotta), misurato dal record `tempi-giro` della
sessione:**

| | giro 1 (stamattina, caduto) | giro 2 (ripreso alle 11:31) |
|---|---|---|
| giri del modello | 16 | **20** |
| token in ingresso | 260.485 | 379.518 |
| token in uscita | 21.725 | 49.285 |
| token dalla cache | 134.464 (51,6 %) | **256.320 (67,5 %)** |
| primo token | 37.355 ms | **5.117 ms** |

⛔ **I 26 passi del giornale NON sono stati ripagati**: la ripresa è partita dal passo dopo l'ultimo
committato, con la consegna che dice al modello «Already spent before the interruption: 30706 tokens,
12 searches, 13 pages … Steps already completed: …». Alla fine del giro 2 il giornale conta **30
passi** (26 riusati + 4 nuovi) e **38.322 token** di spesa del collettore: i 30.706 di prima più
7.616 di lavoro nuovo. Cioè **l'80 % del lavoro raccolto è stato riusato invece che ripagato**, e la
cache del fornitore ha coperto i due terzi del prefisso.

**⛔⛔ E poi è caduta di nuovo — nello STESSO PUNTO.**

Alle **11:46:45** il giro 2 è morto con la stessa riga: `RunError {"message":"Upstream idle timeout
exceeded","code":"internal-error"}`. Ho guardato che cosa c'era **subito prima**, in entrambe le
cadute, e sono identiche:

```
… delta:"). Deposito il"   delta:" report."      ← l'ultima cosa che il modello scrive
{"type":"RunError","message":"Upstream idle timeout exceeded", …}
```

⇒ Il fornitore chiude la connessione **mentre il modello genera l'argomento di `research_deposit`**,
cioè il rapporto intero in una sola chiamata di attrezzo: la generazione ininterrotta più lunga di
tutta la corsa, subito dopo la fase di ragionamento più lunga (giro 3: **189 secondi** fra il primo
token e il primo token *visibile*). È **esattamente** ciò che Hermes descrive (S0-bis): *«the
upstream proxy idle-killing a long thinking stream»*.

⇒ **Riga nuova, trovata per strada e NON curata qui** (è un'altra cosa da BC-44, e vuole il suo sì):
*il deposito del rapporto passa da un'unica generazione enorme*, ed è lì che il fornitore ha chiuso
**due volte su tre tentativi** (la terza è passata: 77.175 byte di `rapporto.md`). Non è una legge,
è una probabilità alta — e la cura di BC-44 rende quella caduta **recuperabile**, non **immune**.
⛔ Il numero da misurare, prima di proporre una cura, è **quanto è grande davvero** quell'argomento.

**⭐⭐⭐⭐ La ripresa automatica è scattata da sola, su un guasto VERO.** Questa volta la causa l'ha
scritta la cura (non dedotta), e venti secondi dopo il giornale porta:

```
{"at":"2026-09-12T11:46:45…","kind":"…"}                                     ← caduta, terminata:'failed'
{"at":"2026-09-12T11:47:05.224Z","kind":"run_resumed","auto":true,"causa":"timeout-fornitore"}
```

e `meta.json` torna `terminata: null`. **Nessuno ha toccato niente**: il giro 3 è partito da solo,
dal giornale, dal passo dopo l'ultimo committato.

### 5.5 ⭐⭐⭐⭐ L'esito: `done`, col rapporto e col giudice vero

Alle **12:13:39** — tre ore e quattordici minuti dopo l'avvio di stamattina, e **senza che nessuno
la riavviasse da capo** — la ricerca `dec896c0` è arrivata a `done`.

```
"terminata": "done",
"reportLibraryId": "lib-514e1e85-8f68-4b57-a599-c5f352f7e398",
"conclusaAlle": "2026-09-12T12:13:39.241Z",
"motivoErrore": null
```

| | valore |
|---|---|
| **rapporto** | `rapporto.md`, **77.175 byte**, depositato e in Libreria |
| **bilancio** | **31 affermazioni** — 11 sostenute · 4 in parte · **6 non sostenute** · 0 contese · 10 non verificate |
| **giudice** | **`z-ai/glm-4.7-flash`** — cioè il giudice L9 **ha girato dal vivo per la prima volta** |
| **prove distinte** | 14, su 19 indirizzi |
| **passo di verifica** | `verifica:verify`, **12 min 59 s**, 8.497 token |
| **giornale** | **80 eventi**, 0 righe saltate, stato `done`; 36 `step_finished`, 2 `run_resumed` (1 chiesta + 1 **automatica**), 1 `run_finished` |
| **spesa del collettore** | 51.038 token · 13 ricerche · 19 pagine |
| **testi tenuti** | **90** (erano 67) |
| **modello** | `z-ai/glm-5.3-flash` per tutti e tre i giri, come la sessione originale |

**Quanto è stato RIUSATO invece che ripagato** — la domanda del brief:

| | al momento della caduta | alla fine |
|---|---|---|
| passi `step_finished` nel giornale | **26** | 36 |
| spesa del collettore | **30.706 token · 12 ricerche · 13 pagine** | 51.038 · 13 · 19 |

⇒ **26 passi su 36 (72 %) e 30.706 token su 51.038 (60 %) della spesa di raccolta sono stati
ereditati dal giornale e mai ripagati.** È ciò che sarebbe andato perduto riavviando da capo, ed è la
cosa che il 409 rendeva impossibile recuperare.

**Il conto del modello, per giro** (record `tempi-giro`, misurato, non stimato):

| giro | giri del modello | token dentro | token fuori | dalla cache | primo token |
|---|---|---|---|---|---|
| 1 — stamattina, caduto | 16 | 260.485 | 21.725 | 134.464 (51,6 %) | 37.355 ms |
| 2 — ripreso a mano, caduto | 20 | 379.518 | 49.285 | 256.320 (67,5 %) | 5.117 ms |
| 3 — ripreso **da solo**, `done` | 16 | 373.040 | 42.822 | 170.368 (45,7 %) | 1.051 ms |
| **totale** | **52** | **1.013.043** | **113.832** | **561.152** | — |

⛔ **Il denaro non lo dico**, e non è pudore: in questa corsa nessun prezzo pubblicato è stato
ottenuto, e la regola di L9 è «lavoro sempre, denaro **solo** con un prezzo pubblicato». I token
sopra sono misurati; un dollaro qui sarebbe un numero inventato.

⛔ **E il verso contrario, visto dal vivo**: sulla ricerca `done` il menu **⋯** adesso porta «Apri la
conversazione · Copia il rapporto · Esporta… · Controlla se le fonti dicono ancora questo · Elimina
la ricerca» — e **«Riprendi» non c'è più**. Foto
`04-menu-dettaglio-conclusa-desktop-{dark,light}.png`.

⭐ **Effetto collaterale che chiude una riga di L9**: il rapporto L9 elencava fra i «non verificati»
il punto 2, *«Il giudice vero: `chiediAlModelloUnaVolta` non è mai stata eseguita contro
OpenRouter»*. Adesso lo è: 31 affermazioni giudicate da `glm-4.7-flash`, **e sei dichiarate non
sostenute** — cioè il cancello non si limita a timbrare, morde.

---

## 6. Cosa NON ho verificato — per nome

1. **Quale riga abbia lanciato** l'errore del 12/09 (§1, ultimo capoverso). La cura non ne dipende,
   ma resta un buco nella diagnosi: non c'è oggi nessun posto che registri `e.stato` /
   `e.limitatoDalFornitore` del kernel accanto alla conclusione.
2. **La classificazione su guasti veri diversi da questo.** La tabella è provata su **stringhe** (le
   nostre e quelle documentate dai fornitori), non su altri guasti osservati dal vivo. Una frase di
   fornitore che non contenga nessuno dei segni finisce in `ignoto` ⇒ **non riprendibile** ⇒ come
   ieri: sbaglia nel verso prudente, mai in quello che spende.
3. **La ripresa automatica non è mai scattata su un guasto VERO**: è provata con deps iniettate. Sul
   banco la ripresa l'ho chiesta io dalla rotta.
4. **`bloccata-dal-permesso` e `giri-esauriti` restano non riprendibili** da `riprendi()` (§3.2).
5. **Nessun interruttore per la ripresa automatica sul 4174** (§3.4): iniettabile nell'orchestratore,
   non esposto da `session-registry.mjs`.
6. **`public/` non ricostruita** (§3.5): quello che il 4174 servirà dipende dalla consegna del
   coordinatore, non da queste foto.
7. **Il rosso `bc40-mappa-minima`** (§4) è di un altro lotto, in `src/kernel/`: non l'ho toccato.
8. **Un limite dichiarato della deduzione**: se una sessione **non viene ripristinata** (il registro
   non ha la voce, per esempio perché il `.jsonl` è stato eliminato), `voce.eventi` non esiste e una
   ricerca caduta prima di oggi resta non riprendibile. Con la cura attiva il caso sparisce da solo:
   da qui in poi la causa è sul disco della ricerca.
9. **Il rapporto non l'ho letto riga per riga**: ho misurato il bilancio (31 affermazioni, 6 non
   sostenute) e la sua taglia, non la qualità della prosa.
10. **Il «due su tre» del deposito** (§5.4) è un conteggio su **tre tentativi**, non una misura di
   probabilità: per dire quanto è fragile davvero servirebbero più corse.

---

## 7. Proposta di messaggio di commit

```
feat(ricerca): una corsa fermata dal FORNITORE non è una ricerca fallita — si riprende dal giornale

Giro vero del 12/09 (dec896c0): 16 giri, 32 attrezzi, 67 testi tenuti, 26 passi nel giornale, e
poi «Upstream idle timeout exceeded» ⇒ failed, e POST .../ripresa rispondeva 409 «non è nello stato
giusto». Venti minuti pagati che il giornale conserva per intero e che nessuno poteva riprendere.

- classificaErroreDiCorsa(): tabella unica transitorio/non transitorio, con l'ordine di precedenza
  dichiarato (credito e credenziale PRIMA di traffico: le loro frasi contengono le parole delle
  altre). `ignoto` NON è transitorio — qui si riapre una corsa, non si ritenta una chiamata.
- la conclusione registra `motivoErrore {classe, transitorio, codice, messaggio}` su meta.json;
  la ripresa lo accetta quando è transitorio, riapre la metadata e riparte dal giornale.
- la causa si DEDUCE dal RunError già presente negli eventi della sessione quando manca sul disco:
  senza, la cura non avrebbe curato nessuna delle ricerche già cadute, compresa quella che l'ha
  fatta scrivere.
- ripresa automatica UNA volta per ricerca, dopo 20 s, solo se c'è lavoro da salvare e solo se lo
  stato riletto dopo l'attesa è ancora quello: nel giornale come run_resumed {auto, causa}.
- contratto additivo 16 → 18 campi: `riprendibile` e `motivoErrore {classe, transitorio}`. Il
  messaggio grezzo del fornitore resta sul disco, mai a schermo.
- sezione: «Interrotta dal fornitore» con la frase italiana, e «Riprendi» nel menu ⋯ solo quando il
  server dice che si può (fino a ieri compariva sempre e la rotta rispondeva 409).
- chiuso per strada: una ricerca già CONSEGNATA poteva ripartire dalla via A (conversazione in
  memoria), che non guardava lo stato.

Ricerca 12/09: Hermes v0.21 agent/error_classifier.py + docs/session-lifecycle.md (classificatore
unico con `retryable`, resume_pending/resume_reason distinti da suspended); OpenRouter «Errors»
(«the status stays 200 even when every provider fails» ⇒ il retry del kernel non poteva vederlo);
Anthropic «How we built our multi-agent research system» («resume from where the agent was»).

Prove: 12 test nuovi nei due versi; 139/139 sui file toccati, 2939/2940 sulla suite server
(l'unico rosso è bc40-mappa-minima, di un altro lotto, in src/kernel/), 980/980 sul frontend.
Giro vero sul banco (porte 4181/4182, copia dello store): 409 → 200 sulla ricerca dec896c0 vera.
```

---

## 8. Riepilogo

**Cosa devi fare tu**
- Dire **sì/no/dopo** alla **ripresa automatica** così com'è (una volta per ricerca, dopo 20 s, solo
  se c'è lavoro da salvare). È l'unica riga di questo lotto che **spende denaro senza chiedere**.
  Se la vuoi spenta di serie, è un parametro già iniettabile: mi dici e lo esponi `session-registry`.
- Dire **sì/no/dopo** alla riga nuova trovata dalla prova (§5.4): **il deposito del rapporto passa da
  una sola generazione enorme**, ed è il punto in cui il fornitore ha chiuso la connessione **due
  volte su tre tentativi**. BC-44 rende quella caduta recuperabile; non la toglie.
- Decidere se aprire la ripresa anche a **`bloccata-dal-permesso`** e **`giri-esauriti`** (§3.2): il
  giornale li tiene riprendibili apposta, `riprendi()` non li accetta, e non l'ho cambiato.
- Il **commit** e il **push**: i file sono sul disco, elencati qui sotto. Non ho toccato `git`.

**Cosa faccio io**
- Niente in automatico. Se dai il via, consegno a `public/` **solo** insieme agli altri due lotti in
  corso (adesso ricostruire il bundle porterebbe dentro il loro lavoro a metà).
- Se vuoi la riga del deposito, la misuro prima di scriverla: quanto è grande davvero l'argomento di
  `research_deposit` su una corsa vera (il `rapporto.md` di oggi è 77.175 byte), e dove si potrebbe
  spezzare.

**Cosa rimane**
- I nove punti di §6, per nome — in particolare: la ripresa automatica **non ha un interruttore sul
  4174**, la classificazione è provata su stringhe e non su altri guasti veri, e `public/` non è
  ricostruita.
- Il rosso `tests/bc40-mappa-minima.test.mjs`: **non è mio**, è il lotto BC-40 in `src/kernel/`.
- I **due server** del banco: chiusi (§9). Le due cartelle di banco restano nello scratchpad della
  sessione (fuori dal repo): dentro c'è la copia `done` della ricerca, col `rapporto.md` da 77 KB.

**I file toccati** (nessun `git`)

```
harness-ui/src/research-orchestrator.mjs          cura principale (classificazione, causa, ripresa)
harness-ui/src/research-store.mjs                 campo `motivoErrore` su meta.json
harness-ui/src/agent-service.mjs                  una riga: `codiceErrore` nel valore di ritorno
harness-ui/src/session-registry.mjs               una riga: lo stesso sul ramo raro
harness-ui/frontend/src/components/ricerca-dettaglio.js   «Interrotta dal fornitore» + `riprendibile`
harness-ui/frontend/src/components/ricerca.js     la riga dell'elenco dice la stessa parola
harness-ui/tests/ricerca-giornale-e-ripresa.test.mjs      +10 test
harness-ui/tests/http-routes-research.test.mjs            +2 test (e contratto 16 → 18)
harness-ui/tests/research-orchestrator.test.mjs           contratto 16 → 18
harness-ui/frontend/tests/unit/ricerca-azioni.test.mjs    +2 test
.claude/RAPPORTO-BC44-RIPRESA-DOPO-ERRORE-2026-09-12.md   questo rapporto
.claude/foto-bc44-2026-09-12/                             14 foto, chiaro e scuro
```

⛔ `harness-ui/src/http-app.mjs` **non compare**: verificato che non servisse (§3.2).
⛔ `frontend/src/legacy/app.js`, `session-item.js`, `library*.js`, `src/kernel/`,
`contesto-del-progetto.mjs`, `mappa-cartelle.mjs`, `mobile/`, `control-plane/`, `core/`, `docs/`:
**non toccati**.

---

## 9. I server che ho avviato — e la loro fine

| porta | cosa | fine |
|---|---|---|
| 4181 | banco della prova vera (copia dello store e della ricerca) | **chiuso** — PID 14448, individuato per **porta** (`Get-NetTCPConnection -LocalPort 4181`) e non per nome, poi `taskkill /PID`. ⛔ Sulla macchina girano **nove** `node server.mjs`: uccidere «quello di server.mjs» avrebbe potuto essere il 4174 dell'owner |
| 4182 | banco di sola lettura per le foto (stato congelato a `failed`) | **chiuso** — PID 19092, stessa via |

Verificato **dopo** la chiusura: in ascolto resta la sola **4174** (PID 14984), viva e intatta.

⛔ Mai la **4174**: nessuna richiesta, nessun POST, nessuna lettura che la tocchi.
