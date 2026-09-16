# RICERCA — Fase 2: accodare contro reindirizzare, lo stato dell'arte letto nel codice

**Data:** 13/09/2026 · **Perimetro:** la persona scrive MENTRE il modello lavora; deve poter
scegliere fra **accodare** (lo leggerà dopo) e **reindirizzare** (fermalo e cambia direzione).

---

## ⛔ Avvertenza sul metodo, in testa come richiesto

**Il motore di ricerca web era ESAURITO** (200 su 200) prima che questa ricerca cominciasse. Un
solo tentativo per accertarmene, e il rifiuto è testuale: *«Web search was not performed: this
session has used its web search budget (200 of 200 WebSearch calls)»*. Tutto il resto è stato
fatto per **indirizzo diretto** (WebFetch) e — soprattutto — sui **cloni dei concorrenti già sul
disco**, a commit fissato.

**Fonti raggiunte: 22** (8 basi di codice lette a commit fissato, 8 pagine di documentazione o
changelog aperte per indirizzo, 2 dossier interni, 4 file del nostro prodotto). **Non raggiunte: 2**,
elencate con il motivo. Nessuna fonte è stata gonfiata: dove una pagina non diceva nulla sul tema,
è scritto **«nulla sul tema»** invece di dedurre un comportamento.

⛔ **Una correzione al mandato, trovata strada facendo.** Il brief suggeriva come «+1» la
*ricevuta di lettura*, sul presupposto che «nessuno lo prova». Il presupposto è **per metà già
superato da noi**: TALOS emette già `QueuedMessageDelivered` nel momento esatto in cui la coda
viene drenata, e `RunRedirectApplied` nel momento esatto in cui la correzione riparte. Questo è già
più di quanto faccia Hermes. Il capitolo «+1» qui sotto è quindi riscritto su ciò che **davvero**
non esiste da nessuna parte, non su ciò che avevamo già. Dettaglio nel §5.

---

## §1 Tabella delle fonti

### 1a. Codice letto direttamente (cloni su disco, commit fissato)

Tutti in `C:\Users\Antonino\AppData\Local\Temp\talos-competitor\`, consultati il **13/09/2026**.
Il commit di Hermes è stato **riverificato** con `git log -1`: `365e2835d490a053…` del 2/9/2026,
cioè esattamente il `365e283` del dossier.

| # | Progetto | Commit | File letti | Tipo |
|---|---|---|---|---|
| 1 | **Hermes Agent** (NousResearch) | `365e283` (2/9/2026) | `tools/delegate_tool.py` (5.387 righe), `agent/agent_init.py`, `agent/conversation_loop.py`, `agent/agent_runtime_helpers.py`, `agent/turn_finalizer.py`, `agent/prompt_builder.py`, `agent/interrupt_compat.py`, `agent/chat_completion_helpers.py`, `run_agent.py`, `gateway/run.py` | codice |
| 2 | **Codex** (OpenAI) | `728cb12` (3/9/2026) | `codex-rs/core/src/codex_thread.rs`, `codex-rs/analytics/src/facts.rs`, `analytics/src/events.rs`, `app-server/src/message_processor.rs` | codice |
| 3 | **Cline** | `5de79a7` (2/9/2026) | `apps/cli/src/runtime/run-interactive.ts`, `runtime/interactive/session-runtime.ts`, `tui/components/chat-entry.tsx`, `tui/components/dialogs/help-dialog.tsx`, `connectors/connector-host.ts` | codice |
| 4 | **OpenCode** | `b578b72` (2/9/2026) | `packages/app/src/context/settings.tsx`, `packages/app/src/i18n/en.ts`, `packages/app/src/components/prompt-input/submit.ts` | codice |
| 5 | **Pi** (`pi-mono`) | `4e69b0c` (2/9/2026) | `packages/agent/src/agent.ts`, `packages/agent/src/agent-loop.ts` | codice |
| 6 | **Goose** (Block) | `9eb6ef0` (3/9/2026) | `crates/goose/src/acp/server.rs`, `acp/server/message_meta.rs`, `acp/server/custom_dispatch.rs` | codice |
| 7 | **OpenHands / Agent Canvas** | `a4aca99` (2/9/2026) | `src/contexts/conversation-websocket-context.tsx`, `src/components/features/chat/chat-interface.tsx`, `goal-status-content.tsx` | codice |
| 8 | **Aider** | `5dc9490` (22/5/2026) | `aider/coders/base_coder.py` | codice |

### 1b. Documentazione e changelog aperti per indirizzo (13/09/2026)

| # | Indirizzo | Esito | Tipo |
|---|---|---|---|
| 9 | `https://code.claude.com/docs/en/interactive-mode` | **aperta** (via redirect 301 da `docs.claude.com`) — sezione «Queue messages while Claude works» completa | documentazione |
| 10 | `https://code.claude.com/docs/en/checkpointing` | **aperta** — sezione «Messages sent mid-turn not checkpointed» | documentazione |
| 11 | `https://agentclientprotocol.com/protocol/prompt-turn` | **aperta** — obblighi di `session/cancel` | documentazione (specifica) |
| 12 | `https://agentclientprotocol.com/protocol/schema` | **aperta** — conferma che lo steering **non** è nella specifica; `_meta` è il punto d'estensione | documentazione (specifica) |
| 13 | `https://github.com/NousResearch/hermes-agent/releases` | **aperta** — v0.21.0 e la frase che annuncia lo steering | changelog |
| 14 | `https://learn.chatgpt.com/docs/changelog` | **aperta** (via redirect 308 da `developers.openai.com/codex/changelog`) — CLI 0.153.0 e 0.154.0 | changelog |
| 15 | `https://opencode.ai/docs/tui/` | **aperta**, ma **nulla sul tema**: non documenta né interruzione né coda | documentazione |
| 16 | `https://opencode.ai/docs/` | **aperta**, ma **nulla sul tema** | documentazione |
| 17 | `https://aider.chat/docs/usage.html` | **aperta**, ma **nulla sul tema**: non parla di Ctrl-C né di interruzione | documentazione |

⛔ **Non raggiunte** (due, dichiarate invece che aggirate):

| Indirizzo | Esito | Conseguenza |
|---|---|---|
| `https://aider.chat/docs/usage/interrupt.html` | **HTTP 404** | La riga di Aider nella tabella §4 viene **dal codice** (`base_coder.py`), non dalla documentazione |
| `https://block.github.io/goose/docs/guides/managing-goose-sessions` | **HTTP 404** | La riga di Goose viene **solo dal codice** (`acp/server.rs`); non ho una fonte documentale su come Goose *chiami* la cosa nella sua interfaccia |

### 1c. Fonti interne

| # | File | Uso |
|---|---|---|
| 18 | `.claude/DOSSIER-COMPETITOR-FUNZIONI-DISTINTIVE-2026-09-03.md` §1 (riga H1) | punto di partenza, **line number verificati uno per uno** |
| 19 | `.claude/DOSSIER-COMPETITOR-ESTRATTI-CODICE-2026-09-03.md` §1 H1 | codice verbatim commentato |
| 20-22 | `harness-ui/src/session-registry.mjs`, `harness-ui/src/agui-events.mjs`, `harness-ui/src/http-app.mjs`, `harness-ui/public/app.js` | stato reale di TALOS oggi |

### 1d. Verifica dei numeri di riga del dossier (03/09) contro il codice di oggi

Il coordinatore ha chiesto di non fidarsi dei numeri del 3 settembre. Li ho ricontrollati tutti:
**combaciano tutti e sei**, il clone non si è mosso.

| Simbolo | Dossier | Verificato | Esito |
|---|---|---|---|
| `_DEFAULT_MAX_CONCURRENT_CHILDREN = 10` | r. 122 | r. **122** | ✅ |
| `steer_subagent` | r. 347 | r. **347** | ✅ |
| `list_active_subagents` | r. 413 | r. **413** | ✅ |
| `_owns_subagent_record` | r. 483 | r. **483** | ✅ |
| commento «invisible/unsteerable» | r. 502 | r. **502** | ✅ |
| `_handle_control_action` | r. 523 | r. **523** | ✅ |

---

## §2 Hermes, codice per codice — la catena del reindirizzamento

⛔ **La scoperta principale, e il dossier del 3/9 non la conteneva:** Hermes non ha *un*
meccanismo, ne ha **due**, e la differenza fra i due è **esattamente** la distinzione
accodare/reindirizzare che la Fase 2 deve costruire.

```
agent._pending_steer      → accodare    (non taglia MAI niente, arriva al prossimo confine)
agent._pending_redirect   → reindirizzare (annulla la richiesta al modello in volo, conserva il turno)
```

Entrambi nascono nello stesso punto, `agent/agent_init.py` r. **917-925**, con due lock distinti, e
il commento del codice dichiara la differenza meglio di qualunque parafrasi:

> «/steer mechanism — inject a user note into the next tool result **without interrupting** the
> agent. Unlike interrupt(), steer() does **NOT** set `_interrupt_requested`; it waits for the
> current tool batch to finish naturally…»
>
> «Active-turn redirect mechanism. A regular follow-up sent while the model is generating is
> **different from a hard /stop**: preserve the valid turn prefix, **cancel only the in-flight
> model request**, and rebuild its tail with the correction.»

E alla r. **908**: `agent._supports_active_turn_redirect = True` — una capability che il gateway
interroga prima di scegliere la strada.

### 2a. La catena dell'accodamento (steer) — dal genitore al figlio, in ordine

| Ordine | Funzione | Riga | Cosa fa |
|---|---|---|---|
| 1 | `_register_subagent` | 268 | Registra il figlio; **r. 272** `record.setdefault("accepting_steer", True)` — un figlio nasce steerabile |
| 2 | `_handle_control_action` | 523 | Il piano di controllo sincrono `list` / `steer` / `stop`. Il docstring: *«Runs in-turn (never backgrounded) and only over subagents descended from parent_agent»* |
| 3 | `_owns_subagent_record` | 483 | Cancello di proprietà a due livelli (vedi 2c) |
| 4 | `steer_subagent` | 347 | Sotto `_active_subagents_lock`: se `accepting_steer` è `False` → ritorna `False`; altrimenti `agent.steer(text)` |
| 5 | `apply_pending_steer_to_tool_results` | `agent_runtime_helpers.py` 5182 | **Il punto di consegna**: appende il testo all'**ultimo messaggio `role:"tool"`** del batch |
| 6 | `format_steer_marker` | `prompt_builder.py` 732 | Avvolge il testo in un marcatore che dichiara la propria provenienza |
| 7 | `_close_subagent_steering` | 299 | A fine corsa, **atomicamente**: `accepting_steer = False` + drena ciò che resta |
| 8 | `_finalize_child_results` | 3729 → **3478** | Ciò che non è stato consegnato diventa `missed_steer` |

**Il punto 5 è la scelta di ingegneria più interessante di tutto Hermes**, e va capita bene:
il testo dell'utente **non diventa un messaggio utente**. Viene *appeso al contenuto di un
tool result già esistente*. Il docstring dice perché:

> «Role alternation is preserved — **nothing new is inserted**, we only modify existing content.»

Cioè: nessuna riga nuova nella conversazione ⇒ **il prefisso di cache non si rompe**. È la stessa
lezione che noi abbiamo pagato il 22/8 (`comprimere-l-ingresso-rompe-la-cache`): un messaggio nuovo
in mezzo invaliderebbe la cache a monte; appendere in coda all'ultimo elemento no.

⭐ E c'è una storia dentro il commento di `format_steer_marker` (r. 737-744) che vale da sola:
il marcatore all'inizio era nudo, e **i modelli rifiutavano gli steer scambiandoli per prompt
injection** (*«models refused steers as prompt injection (screenshot-verified)»*, issue #40240).
Oggi il marcatore **si autodescrive**: dichiara di essere «un messaggio diretto dall'utente» e
dichiara la propria regola di replay («non è una consegna nuova quando viene rigiocato dalla
cronologia»). ⛔ **Lezione diretta per noi:** un testo iniettato a metà turno che non dichiara la
propria provenienza viene rifiutato dal modello stesso.

**Il secondo punto di consegna**, spesso dimenticato: `conversation_loop.py` r. **2387**. Se lo
steer arriva *mentre il modello sta pensando*, aspettare il prossimo batch di attrezzi può non
bastare — il modello potrebbe rispondere e basta. Quindi c'è un drenaggio **prima** della chiamata
API, che cerca all'indietro l'ultimo messaggio `tool`. Il commento è esplicito:

> «Without this, steers sent during an API call only land after the NEXT tool batch, **which may
> never come** if the model returns a final response.»

Se non c'è nessun messaggio `tool` in cui infilarsi (primo giro, nessun attrezzo ancora usato), il
testo **viene rimesso in coda** invece di essere perso — sia qui sia in `agent_runtime_helpers.py`.
Questo è un dettaglio che i loro autori hanno curato in **tre punti diversi**, e resta comunque
insufficiente: vedi il buco in 2d.

### 2b. La catena del reindirizzamento (redirect) — quella che il dossier non aveva

`run_agent.py` r. **3944**, `def redirect(self, text)`. Il docstring è la definizione più precisa
di «reindirizzare» che ho trovato in tutto lo stato dell'arte:

> «Redirect the active turn **without converting it into a new task**. During a normal Hermes model
> request this **cancels only that request**; the conversation loop **retains completed
> messages/tool results**, records the displayed partial reasoning as plain assistant context,
> appends the correction as a real user message, and retries. **During tool execution it degrades
> to `steer()`** so the tool can finish at a safe boundary.»

Quindi il comportamento è una **scala a tre gradini**, decisa dallo stato in cui si trova il giro:

| Stato del giro | Cosa fa `redirect()` | Riga |
|---|---|---|
| Il backend è Codex app-server | Usa il `turn/steer` **nativo** di Codex, non interrompe niente | 3966-3975 |
| **Sta eseguendo un attrezzo** (`_executing_tools`) | **Degrada ad accodamento**: *«Never kill a tool merely to deliver conversational guidance»* | 3982-3984 |
| Sta generando (richiesta al modello attiva) | Annulla **solo quella richiesta**, conserva il prefisso, riparte | 3986+ |

⭐ La riga di mezzo è una regola di prodotto, non un'ottimizzazione: **non si uccide un attrezzo a
metà per consegnare un consiglio.** È la risposta diretta alla domanda 1 del mandato.

L'applicazione vera è `_apply_active_turn_redirect`, `conversation_loop.py` r. **437**, drenata in
cima al ciclo a r. **2290**. Il docstring contiene **due INVARIANTI** scritti in maiuscolo, ed
entrambi sono cicatrici di incidenti veri:

> **INVARIANT** — «raw chain-of-thought must never be serialized into replayable message content…
> An assistant turn whose content inlines its own chain-of-thought reads to Anthropic's output
> classifier as reasoning-injection/prefill jailbreak, and because the poisoned checkpoint is
> persisted and replayed on every subsequent call, **the session dies permanently** with
> deterministic "Provider returned an empty response" storms that no retry, nudge, or empty-recovery
> branch can escape (July 2026: **four sessions bricked this way**; 20/20 blocked with
> assistant-exposed CoT vs 0/20 without).»

> **INVARIANT** — «the scaffolding is provider-replay text, not transcript text… Persisting them
> into an assistant row's `content` made the model treat the scaffold as *its own previous reply*,
> echo it, and **self-replicate ghost rows** across turns (#81841).»

⛔ **Due trappole misurate che erediteremmo gratis se copiassimo senza leggere:** (a) il
ragionamento parziale interrotto **non** si rimette nella conversazione — si conserva solo il
testo **visibile**, declassato a testo normale; (b) l'impalcatura che spiega al modello «sei stato
interrotto» va nel **sidecar** `api_content` della correzione utente, **mai** in una riga
assistente, altrimenti il modello la ripete come fosse roba sua.

E c'è una condizione di corsa che hanno dovuto chiudere, r. **3703**: `_redirect_crossed_response`.
La risposta del modello e il redirect possono incrociarsi su thread diversi; se succede, Hermes
**butta la risposta ormai stantia** e ricostruisce dalla correzione — *«rather than silently losing
it»*.

**Chi sceglie fra i due?** `gateway/run.py` r. **11504**: se la modalità è `interrupt`, il messaggio
è **solo testo** (niente media), e l'agente dichiara `_supports_active_turn_redirect`, allora
`redirect()`. Se lo steer fallisce, r. **11497**: `effective_mode = "queue"` — **ripiega
sull'accodamento**. E il commento sotto registra un bug già pagato (#43066): il ripiego deve passare
per la FIFO vera, perché la fusione grezza *«newline-joins consecutive TEXT follow-ups into a
SINGLE pending turn, destroying message boundaries»* — due messaggi separati arrivavano
**appiccicati in uno solo**.

### 2c. Il cancello di proprietà, e il buco che loro stessi hanno scritto

`_owns_subagent_record` r. **483** decide chi può pilotare chi, a due livelli: (1) identità
d'oggetto attraverso una catena di weakref `_delegate_parent_ref` (`_is_descendant_of`, r. 437,
**massimo 8 salti**); (2) discendenza di conversazione durevole per `owner_agent_session_id`.

⭐ **Il commento alla riga 502 — il buco dichiarato da loro stessi**, verbatim:

> «Tier 2 exists because the identity chain is **BRITTLE** across parent-agent rebuilds: the CLI
> sets `self.agent = None` mid-session (route-signature change, credential refresh, /model, MoA
> one-shots) and constructs a NEW AIAgent for the next turn while the child keeps running with a
> weakref to the old object. The delivery path always survived this (it routes by durable session
> id); the control path must use the same durable spine or **running children go
> invisible/unsteerable** (observed live: `deleg_88454b70` / `sa-0-dc0100f4`, **2026-08-17**).»

Da leggere così: cambiare modello con `/model` a metà sessione **faceva sparire i figli vivi dal
pannello di controllo**. Non morivano — continuavano a lavorare e a consegnare; semplicemente
diventavano **impilotabili e invisibili**. Il secondo livello è la toppa, nata da un caso vivo
datato. ⛔ La lezione strutturale: **il piano di controllo e il piano di consegna devono viaggiare
sulla stessa spina dorsale durevole.** Se la consegna usa l'id di sessione e il controllo usa un
puntatore in memoria, il secondo si rompe da solo e nessuno se ne accorge.

⚠️ Un dettaglio che ho notato leggendo, **non segnalato da loro**: `list_active_subagents` (r. 413)
**esclude** `accepting_steer` dai campi che restituisce (r. 430). Il ramo `list` di
`_handle_control_action` se lo ricalcola a mano a r. **556**. Chiunque usi la funzione pubblica
invece del piano di controllo **non vede se un figlio è ancora steerabile**. Non ho verificato se
esiste un chiamante che ne soffre: lo marco **non verificato**.

### 2d. Dove sta il buco vero: `missed_steer`

`steer_subagent` ritorna `True` e il piano di controllo risponde `status: "queued"`. Poi:

- `_close_subagent_steering` (r. 299) chiude l'accettazione **atomicamente** — o vince
  l'accettazione e il drenaggio vede il testo, o vince la chiusura e il chiamante è respinto;
- `turn_finalizer.py` r. **779**: ciò che resta esce come `result["pending_steer"]`;
- `delegate_tool.py` r. **3478**: diventa `entry["missed_steer"]`, e il commento è un'ammissione
  netta:

> «retain it here so the parent sees the steer was **MISSED** rather than silently absorbed —
> `steer_subagent()` returning True means "**queued**", and this is where a queued-but-never-delivered
> steer gets named.»

⛔ **Il difetto non è che lo steer possa arrivare tardi: è che `queued` è tutto ciò che il genitore
sa, e la verità arriva solo alla FINE, nella ricevuta del figlio.** Fra il `queued` e la
conclusione — che può essere minuti — il genitore (e la persona) **credono** che la correzione sia
arrivata. Non c'è nessun evento, in nessun punto, che dica «letta al giro N».

E i punti in cui `missed_steer` viene scritto sono **tre** (r. 3129, 3478, 3611: errore, successo,
timeout), il che dice quanto il caso sia frequente, non quanto sia raro.

---

## §3 Dove un agente si può interrompere senza lasciare stato incoerente

Domanda 1 del mandato. Dallo stato dell'arte emergono **quattro confini**, in ordine di sicurezza
decrescente:

| Confine | Sicuro? | Chi lo usa | Prova |
|---|---|---|---|
| **Fra un giro e l'altro** (iteration boundary) | ✅ il più sicuro | Hermes (`interrupt_subagent` r. 323), ACP | *«stops at its next iteration boundary»* |
| **Fine di un batch di attrezzi**, prima della chiamata al modello | ✅ sicuro, e **non rompe la cache** | Hermes (consegna dello steer, r. 5182) | *«nothing new is inserted»* |
| **Durante la generazione** (richiesta al modello in volo) | ⚠️ sicuro **solo** se si butta il ragionamento parziale | Hermes `redirect()`, Codex `steer_turn` | i due INVARIANTI di r. 437 |
| **A metà di una chiamata a un attrezzo** | ❌ **mai** | nessuno lo fa per uno steer | *«Never kill a tool merely to deliver conversational guidance»* |

⭐ Il consenso è netto e va detto chiaro: **nessuno dei sette interrompe un attrezzo a metà per
consegnare un messaggio.** Hermes degrada ad accodamento; ACP chiede di fermare *«as soon as
possible»* ma obbliga il client a marcare `cancelled` le chiamate non finite — cioè lo stato
incoerente viene **dichiarato**, non evitato. Anche uno `stop` esplicito, in Hermes, *chiede*
all'attrezzo di annullarsi (`in-flight tool calls are asked to cancel`) invece di ucciderlo, e
Python non potrebbe comunque: *«Does not hard-kill the worker thread (Python can't)»* (r. 323).

**Cosa si conserva.** Sia Hermes sia Claude Code sia OpenHands tengono il lavoro fatto:
- Hermes `stop`: *«Its partial result still re-enters the conversation as a completion message»*;
- Claude Code, Esc: *«Stop the current response or tool call mid-turn so you can redirect. **Claude
  keeps the work done so far.**»*;
- Aider (`base_coder.py` r. 1489): `KeyboardInterrupt` → `interrupted = True` e **`break`**, non
  un'eccezione che risale: la risposta parziale resta.

---

## §4 Cosa fa ognuno — le cinque domande

Legenda: **A** = accodare · **R** = reindirizzare a caldo.

| | Hermes `365e283` | Claude Code (docs) | Codex `728cb12` | Cline `5de79a7` | OpenCode `b578b72` | Goose `9eb6ef0` | Pi `4e69b0c` | Aider `5dc9490` | OpenHands `a4aca99` |
|---|---|---|---|---|---|---|---|---|---|
| **1. Interruzione a caldo** | ✅ due vie: `steer()` non taglia, `redirect()` annulla la richiesta al modello; su attrezzo **degrada** | ✅ `Esc` — *«Stop the current response or tool call mid-turn so you can redirect»* | ✅ `turn/steer` **nativo**, + `TurnInterrupt` separato | ✅ `Ctrl+S` = steer su sessione viva | ✅ `session.interrupt()` (`submit.ts` r. 276) | ✅ `session/steer` via ACP `_meta` | ⚠️ coda drenata ai confini, nessuna cancellazione della richiesta in volo | ✅ `Ctrl-C`; **due volte in 2 s = esce** (r. 986-1000) | ✅ Stop ferma il loop **e** interrompe la conversazione |
| **2. A vs R distinti?** | ✅ **due campi diversi** (`_pending_steer` / `_pending_redirect`) | ⚠️ uno solo: si accoda con `Enter`, si interrompe con `Esc` — l'accodato **parte subito** dopo l'Esc | ✅ `StartOrSteer` / `StartIfIdle` / `Steer{expected_turn_id}` | ✅ **letterale**: `delivery: "queue" \| "steer"` | ✅ impostazione `followup: "queue" \| "steer"`… **ma vedi nota** | ⚠️ solo steer | ✅ due code: `steeringQueue` e follow-up | ❌ nessuna coda | ⚠️ coda ottimistica lato client |
| **Dove finisce il testo** | appeso all'**ultimo tool result** (mai un messaggio nuovo) | *«passes it to Claude as soon as those tool calls finish, within the same turn»* | input del turno attivo | prompt sulla sessione viva | prompt immediato | messaggio con id `steer_<uuid>` | messaggio iniettato prima della risposta | — | evento utente sul server |
| **3. Come fa la persona a saperlo** | ⚠️ risposta JSON `status:"queued"` **al modello**, non alla persona | ✅ elenco sopra la casella di testo; `Up` per riprendersi la coda | ✅ `TurnSteerResult{Accepted,Rejected}` + **6 motivi tipizzati** di rifiuto | ✅ etichette a schermo `[steer]` gialla / `[queued]` grigia | ✅ «followup dock»: *«{count} queued messages»*, «Send now», «Edit» | ✅ notifica `queuedSteer{messageId,runId}` | ⚠️ nessuna superficie | — | ✅ messaggi in attesa sbiaditi, drenati FIFO all'eco |
| **4. Prova di LETTURA** | ❌ **no** — `missed_steer` è l'ammissione del contrario | ❌ no | ❌ no (prova l'**accettazione**, non la lettura) | ❌ no | ❌ no | ❌ no (prova l'**accodamento**) | ❌ no | — | ❌ no |
| **5. Riscontro immediato** | — (niente TUI misurabile da qui) | elenco locale, istantaneo | risposta JSON-RPC sincrona | etichetta locale, istantanea | riga locale nel dock | notifica dal server | — | `^C again to exit` | «sending» sbiadito **prima** della conferma |

### Note per riga, con la prova

**Hermes.** Unico ad avere davvero **due meccanismi separati** con due lock separati. Ed è anche
l'unico che dichiara nel changelog di v0.21.0 (letto il 13/09 su GitHub):
> *«**Steer your subagents while they run** — `delegate_task` gained live orchestration: list
> running children, steer one mid-flight with a course correction, or stop it early and keep the
> partial result.»*

**Claude Code.** La documentazione è la più chiara del lotto sul *quando* arriva la cosa accodata,
ed è una regola a due rami che vale la pena copiare come **comportamento**, non come codice:
> «if you queue a message while Claude is running tool calls, Claude Code passes it to Claude **as
> soon as those tool calls finish, within the same turn**. When the turn ends with messages still
> queued, Claude Code sends **only the oldest** as the next turn.»

E l'Esc unisce le due cose: *«If you have messages queued, Claude Code sends them next»* /
*«Claude Code keeps what you queued and sends it right away»*. ⭐ Si può **riprendersi la coda**:
*«Press `Up` from the first line of the input box to take back the queued messages»*.

⛔ **E c'è un debito che dichiarano loro stessi**, da `checkpointing`: *«Messages sent mid-turn not
checkpointed… The message appears in the conversation, but Claude Code doesn't create a checkpoint
for it, and the rewind menu doesn't list it.»* Cioè: **un messaggio accodato che si unisce al turno
in corso non è ripristinabile.** Per annullarlo bisogna riavvolgere **tutto il turno**, perdendo
anche il lavoro fatto prima.

**Codex.** Il migliore del lotto sul **rifiuto**. `codex_thread.rs` r. 442: `steer_turn` accetta
*«only if `expected_turn_id` is still the active regular turn»* — la persona dice a quale giro sta
parlando, e se il giro è cambiato lo steer viene respinto invece di finire nel posto sbagliato.
E `analytics/facts.rs` r. 299-313 tipizza **sei** motivi:
`NoActiveTurn · ExpectedTurnMismatch · NonSteerableReview · NonSteerableCompact · EmptyInput · InputTooLarge`.
⭐ Due di questi dicono una cosa che nessun altro dice: **ci sono fasi non steerabili per natura**
(una review, una compattazione). Il changelog (13/09) conferma la direzione nella CLI 0.154.0 del
9/9: *«Answer questions inline while Codex continues working, using suggested choices or custom
text **without losing your main draft**»*.

**Cline.** L'implementazione più leggibile della distinzione: un campo `delivery: "queue" | "steer"`
che attraversa tutto (`run-interactive.ts` r. 471-481, `session-runtime.ts` r. 587-590), il tasto
`Ctrl+S` documentato nell'aiuto come *«Steer (send while agent is running)»*, e **due etichette
diverse a schermo** (`chat-entry.tsx` r. 629-630). ⭐ E un ripiego onesto in
`connector-host.ts` r. 1051: se la sessione da pilotare non è più utilizzabile, toglie **solo**
quella voce e instrada per la coda normale, *«instead of creating independent replacement sessions»*.

**OpenCode.** ⛔ **Attenzione, qui c'è un fatto controintuitivo che va riportato per intero.** Le
stringhe inglesi hanno ancora le due opzioni — *«Follow-up behavior / Choose whether follow-up
prompts steer immediately or wait in a queue»*, opzioni «Queue» e «Steer» (`i18n/en.ts` r. 926-929).
Ma il codice **ha disattivato la coda**: `settings.tsx` r. 354-356 contiene un effetto che
riscrive `queue` in `steer`, e sia il getter (r. 373) sia il setter (r. 377) lo rimappano. Cioè
**chiunque scelga «Queue» ottiene «Steer»**, e l'impostazione predefinita è `followup: "steer"`
(r. 187). ⭐ È un dato prezioso per noi: un concorrente che aveva le due modalità **è tornato
indietro a una sola**. Non so *perché* (non ho trovato il commit che lo spiega: **non verificato**),
ma il fatto è nel codice. La documentazione pubblica, aperta due volte, **non dice nulla** in
proposito.

**Goose.** Passa per ACP con un metodo **fuori specifica**: `SteerSessionRequest` via
`custom_dispatch.rs` r. 128. Due cose da rubare concettualmente:
1. `require_active_run` (r. 1970) pretende un `expected_run_id` e, se non combacia, restituisce un
   errore che **contiene tutti e due gli id**: `{"expectedRunId": …, "actualRunId": …}`. Stessa
   idea di Codex, implementata meglio come messaggio.
2. Instrada verso *«the agent that owns the run, not this connection's agent»* (r. 2363), perché
   chi pilota può essere un client diverso da chi ha avviato. **È lo stesso problema della spina
   dorsale durevole di Hermes**, risolto bene la prima volta.
3. `send_queued_steer_update` (r. 2026) notifica `queuedSteer{messageId, runId}` — ⛔ nome
   onesto: dice **accodato**, non letto. E ogni messaggio porta `steer: bool` nei propri metadati
   (`message_meta.rs`), quindi a posteriori si sa **quali** messaggi erano steer.

**Pi.** Una `PendingMessageQueue` (`agent.ts` r. 125) con una modalità che vale la pena notare:
`"one-at-a-time"` è il **default** (r. 231), e `drain()` restituisce **un solo messaggio** invece
di svuotare tutto. ⭐ E `agent-loop.ts` r. 191-195 ha una gentilezza rara: dopo un'operazione lunga
(la compattazione) ricontrolla la coda, ma *«Only poll again if the earlier poll returned nothing;
otherwise one-at-a-time mode would deliver two messages in this turn»*.

**Aider.** Nessuna coda, nessuno steer: solo `Ctrl-C`. `base_coder.py` r. 986: il primo avviso è
*«^C again to exit»*, e due entro **2 secondi** escono davvero. Fermo dal 22/5/2026.

**OpenHands.** La coda è **ottimistica e lato client**: i messaggi appena inviati compaiono subito
sbiaditi e si drenano FIFO quando l'eco reale torna dal WebSocket (`chat-interface.tsx` r. 578-585).
Il server risponde `{queued: true}` con il commento *«Message queued successfully - it will be
delivered when ready»* (r. 1156). ⛔ È esattamente il modello che **non** vogliamo copiare alla
lettera: bello da vedere, ma ciò che la persona vede è una **promessa del client**, non un fatto del
server.

**ACP (la specifica).** Non ha lo steering. Ha `session/cancel`, e obblighi precisi: il client
*«SHOULD preemptively mark all non-finished tool calls… as `cancelled`»* e *«MUST respond to all
pending `session/request_permission` requests with the `cancelled` outcome»*; l'agente *«SHOULD stop
all language model requests and all tool call invocations as soon as possible»* e **deve** chiudere
la `session/prompt` originale con `cancelled`. Sui prompt concorrenti è netta: *«Once a prompt turn
completes, the Client may send another `session/prompt`»*. ⇒ **Lo steering è oggi un'estensione
proprietaria di ognuno**, appoggiata su `_meta` (che lo schema riserva proprio a questo). Per noi
conta due volte: non c'è uno standard da rispettare, e W4-07 (adapter ACP) dovrà comunque
dichiarare la propria estensione.

---

## §5 ⭐ Il +1 che ci fa vincere

### 5a. Prima l'onestà: cosa TALOS ha GIÀ (e il brief non lo sapeva)

Verificato nel codice oggi, non dedotto:

| Cosa | Dove | Stato |
|---|---|---|
| Coda FIFO per messaggio | `session-registry.mjs` r. 3428 `accodaMessaggio`, drenata da `codaMessaggiFn` r. 2804 | ✅ vivo |
| **Ricevuta di CONSEGNA** | r. 2810: `broadcast(QueuedMessageDelivered)` **dentro** lo `shift()` riuscito | ✅ vivo |
| Reindirizzamento a caldo | r. 4932 `reindirizza()` | ✅ vivo |
| **Ricevuta di APPLICAZIONE** | r. 3078: `RunRedirectApplied` emesso subito prima del riavvio | ✅ vivo |
| Ciclo di vita completo del redirect | `agui-events.mjs` r. 65-80: `Requested` / `Applied` / `Cancelled` / `Failed`, correlati da `redirectId` | ✅ vivo |
| Annulla l'ultimo accodato | r. 3456 `svuotaCoda` (fa `pop()`, non azzera) | ✅ vivo |
| Rotte | `POST …/queue`, `…/queue/annulla`, `…/redirect`, `…/stop` | ✅ vive |
| Le parole a schermo | `app.js` r. 26136: *«Invio indirizza il giro in corso, Ctrl+Invio accoda»* | ✅ vivo |

⭐ E il commento di `agui-events.mjs` r. 58-64 dice già la cosa giusta: `redirectId` *«correla
richiesta ed esito senza affidarsi alla posizione nel buffer»*.

⇒ **Su accodare/reindirizzare per l'agente principale non siamo indietro: siamo avanti a Hermes**,
perché loro rispondono `status:"queued"` al modello e noi emettiamo un evento nel momento reale
della consegna. La riga H1 del dossier («TALOS PARZIALE») era vera il 3/9 ma **sottostima lo stato
di oggi** su questo punto.

### 5b. Il +1 vero, in tre pezzi, tutti misurabili

Poiché la ricevuta di consegna esiste già, il differenziatore va spostato più in là. Tre cose che
**nessuno dei nove fa**, in ordine di forza:

**① La ricevuta dice a QUALE GIRO il testo è stato letto.**
Oggi tutti danno al massimo un `queued`/`Accepted` al momento dell'invio. Nessuno collega il testo
al **giro in cui il modello l'ha effettivamente visto**. La ricevuta del giro porta:
```
steerRicevuti: n · steerApplicati: n · perGiro: [{ redirectId, giro, modo: 'accodato'|'reindirizzato' }]
```
Misura di chiusura: per ogni testo inviato a giro vivo esiste **una** riga con un numero di giro, e
`steerRicevuti === steerApplicati` a sessione chiusa. **Prova al verso contrario** (regola di casa):
un testo inviato a un figlio che finisce nello stesso istante deve produrre un `non consegnato`
esplicito, mai un silenzio — è la nostra risposta a `missed_steer`.

**② Lo stesso contratto per i FIGLI, non solo per il genitore.**
È qui che Hermes è scoperto: la loro coda dei figli non ha ricevuta, e il commento a r. 502
dimostra che i figli possono diventare **invisibili** senza che nessuno protesti. Noi abbiamo già
`subagentOrchestrator.elencaFigli` (r. 3415) e `RunRedirectApplied`: manca legare i due.
⛔ **E qui la lezione di Hermes va presa alla lettera**: il piano di controllo deve usare la
**stessa spina dorsale durevole** della consegna (per noi il `sessionId` del registro), **mai** un
riferimento in memoria — altrimenti riproduciamo il loro difetto del 17/8 invece di evitarlo.

**③ «Non consegnato» è un esito tipizzato, non un'assenza.**
Rubando l'idea a Codex (`TurnSteerRejectionReason`) e a Goose (`expectedRunId`/`actualRunId`), il
rifiuto **dice perché**: `giroGiàConcluso · giroCambiato · faseNonReindirizzabile · testoVuoto`.
Oggi noi abbiamo già `RunRedirectFailed` con `code`: **è il posto giusto, va solo popolato con una
tassonomia** invece che con il codice d'errore generico.

⭐ **Perché questo è un +1 e non una comodità:** è l'unica cosa in tutta la Fase 2 che rende
**strutturalmente impossibile** il difetto che Hermes ha dovuto nominare. `missed_steer` esiste
perché *si può* perdere uno steer in silenzio. Una ricevuta che deve chiudersi per ogni id rende la
perdita **un rosso**, non un dato che compare a fine corsa.

### 5c. Cose piccole da pareggiare (misurate negli altri, assenti da noi)

| Cosa | Chi ce l'ha | Perché conta |
|---|---|---|
| **Il marcatore si autodescrive** | Hermes `format_steer_marker` | Senza, **il modello rifiuta lo steer come prompt injection** — misurato da loro, #40240 |
| **Riprendersi la coda** | Claude Code (`Up`) | Noi abbiamo solo `pop()` dell'ultimo; loro rimettono il testo nella casella per modificarlo |
| **Due etichette distinte a schermo** | Cline `[steer]` / `[queued]` | Risponde alla domanda 3 del mandato **senza leggere gli eventi** |
| **Fasi non reindirizzabili** | Codex (`NonSteerableReview`, `NonSteerableCompact`) | Noi compattiamo: una correzione durante la compattazione va **respinta con un perché** |
| **Uno alla volta** | Pi (`"one-at-a-time"` di default) | Evita di scaricare cinque messaggi in un turno solo |

### 5d. Sulla fluidità percepita (domanda 4) — ⛔ quello che NON ho potuto misurare

⛔ **Non ho un numero di latenza da nessuna fonte.** Nessuna delle 17 fonti pubblica una misura
«millisecondi fra il clic e il segno a schermo» per un'interruzione, e **non ho fatto misure mie**
(il mandato è di sola lettura e vieta di toccare il 4174). Qualunque cifra qui sarebbe inventata.

Quello che si può dire **con la fonte in mano** è l'**architettura** del riscontro, e le tre scuole
sono distinte:

1. **Riscontro locale immediato, verità dopo** — Claude Code (l'elenco compare nella casella prima
   che Claude ne sappia niente), Cline (l'etichetta è locale), OpenHands (*«with a faded "sending"
   treatment" even before any real conversation event has come back from the server»*).
2. **Riscontro sincrono dal server** — Codex: la risposta JSON-RPC **è** l'esito, con il motivo del
   rifiuto.
3. **Riscontro per notifica** — Goose: `queuedSteer` arriva come `SessionInfoUpdate`.

⭐ **La lettura utile per noi**, e questa è mia, marcata come inferenza e non come fonte: TALOS oggi
sta nel gruppo 2-3 (l'evento nasce dal server, nel momento vero). È la scelta **più onesta** e la
**meno reattiva**. La combinazione che nessuno ha è: **segno locale subito** (gruppo 1) **che poi si
conferma o si smentisce** con l'evento vero (gruppi 2-3) — cioè lo stato «in volo» distinto da
«consegnato», invece di una promessa che non si corregge mai. ⛔ Da provare con una misura vera
prima di dichiararla, non da dare per buona qui.

---

## §6 ⛔ Cosa NON si copia, e perché

| Cosa | Chi | Prova | Perché no |
|---|---|---|---|
| **Il ragionamento parziale rimesso nella conversazione** | — (trappola che Hermes ha già pagato) | `conversation_loop.py` r. 437, INVARIANT: *«four sessions bricked this way»*, 20/20 contro 0/20 | Uccide la sessione **per sempre**: il checkpoint avvelenato viene rigiocato a ogni chiamata |
| **L'impalcatura «sei stato interrotto» dentro una riga assistente** | — (stesso INVARIANT, #81841) | *«echo it, and self-replicate ghost rows»* | Il modello la ripete come sua; va nel sidecar della correzione utente |
| **`status: "queued"` come unica risposta** | Hermes | `delegate_tool.py` r. 628 + `missed_steer` r. 3478 | È la promessa che il loro stesso codice deve poi smentire: è il difetto da battere, non da imitare |
| **Fusione dei follow-up consecutivi in un turno solo** | Hermes (bug già curato) | `gateway/run.py`: *«destroying message boundaries»* (#43066) | Due messaggi della persona sono **due**; noi già spingiamo oggetti distinti in `codaMessaggi` |
| **La catena di weakref come piano di controllo** | Hermes | il commento a r. 502, caso vivo del 17/8 | Si rompe a ogni ricostruzione dell'agente e i figli spariscono **in silenzio** |
| **Coda solo ottimistica lato client** | OpenHands | `conversation-websocket-context.tsx` r. 1156 | Mostra una promessa del client come fosse un fatto: contro la regola di casa «consegnato ≠ visto ≠ provato» |
| **Togliere la modalità coda** | OpenCode | `settings.tsx` r. 354-356, 373-377: `queue` riscritto in `steer` | L'owner ha chiesto **le due strade**; e le stringhe restano a promettere un'opzione che il codice nega — una UI che mente |
| **Doppio Ctrl-C che esce dall'applicazione** | Aider | `base_coder.py` r. 993-997 | Interrompere un giro e chiudere il programma non devono essere lo stesso gesto a 2 secondi di distanza |
| **Uccidere un attrezzo per consegnare un messaggio** | nessuno lo fa | *«Never kill a tool merely to deliver conversational guidance»* | Lascia il disco a metà: il confine è la fine dell'attrezzo |
| **Messaggio a metà turno non ripristinabile** | Claude Code | docs `checkpointing` | Lo dichiarano come limite; per annullarlo bisogna riavvolgere **tutto il turno** |

---

## §7 Verifica — cosa ho fatto e cosa no

**Eseguito:** lettura di 8 basi di codice già clonate (nessun `git clone` nuovo, nessuna rete per il
codice); verifica di 6 numeri di riga del dossier contro il file vero, tutti confermati; 9 recuperi
per indirizzo diretto, di cui 2 falliti con 404 e dichiarati; lettura di 4 file del prodotto TALOS.

**Non eseguito, e quindi non affermato:**
- **nessuna misura di latenza** — il §5d lo dice apertamente invece di riempire la casella;
- **nessun giro** sul 4174, nessuna modifica al prodotto, nessun commit (mandato di sola lettura);
- **non verificato**: perché OpenCode abbia disattivato la modalità «queue» (il fatto è nel codice,
  la ragione no);
- **non verificato**: se qualche chiamante di `list_active_subagents` (Hermes) soffra davvero
  dell'assenza di `accepting_steer` nell'uscita;
- **non verificato**: come Goose chiami la funzione nella propria interfaccia utente — la pagina di
  documentazione è 404 e ho solo il codice ACP.

**Fonti totali raggiunte: 22** (8 codebase + 8 pagine + 2 dossier + 4 file di prodotto).
**Non raggiunte: 2**, entrambe elencate in §1b con l'indirizzo e il codice HTTP.
