# GUIDA PROPOSTE — le 18 righe dal dossier competitor (56,5 giorni), passo per passo

> Compagna di `LEDGER-ROADMAP-DESKTOP-2026-09-03.md` (sezione PROPOSTE del §3) e del
> `DOSSIER-COMPETITOR-FUNZIONI-DISTINTIVE-2026-09-03.md` (§14 e capitoli; gli estratti di
> codice dei concorrenti stanno in `DOSSIER-COMPETITOR-ESTRATTI-CODICE-2026-09-03.md`).
> Percorsi relativi a `harness-ui/`. Ancore per **nome di funzione / export**, verificate
> sul disco il 03/09 (`session-registry.mjs`: `broadcast`, `richiediApprovazione`,
> `negaApprovazionePendente`, `usageDaEventi`, `ultimoEsitoDaEventi`, `forka`, `avviaESegui`,
> `costruisciHookFn`; `agui-events.mjs`: `approvalRequested`, `approvalResolved`,
> `queuedMessageDelivered`, `hookInvoked`, `toolCallResult`, `stateDelta`, `eventoPerUsage`;
> `hook-registry.mjs`: `EVENTI_VALIDI`, `caricaHooks`, `verificaTrust`, `fidaHook`, `eseguiHook`;
> `automation-store.mjs`: `createAutomationStore`, `INTERVALLO_MINIMO_MINUTI`,
> `LIMITE_MASSIMO_AL_GIORNO`; `automation-scheduler.mjs`: `createAutomationScheduler` (`unTick`);
> `memory-store.mjs`: `creaMemoria`, `aggiornaMemoria`, `eliminaMemoria`, `cercaMemorie`;
> `skill-registry.mjs`: `caricaSkill`; `workspace-watcher.mjs`: `creaGestoreWorkspaceWatcher`;
> `runtime-owner-adapter.mjs`: `creaFetchMultiProvider`, `creaFetchOpenRouterResiliente`,
> `createOwnerRuntimeAdapter`; `model-catalog.mjs`: `createModelCatalog`; `doctor.mjs`:
> `diagnosi`; `harness-receipt-keypair.mjs`; `subagent-orchestrator.mjs`:
> `creaSubagentOrchestrator`, `esitoDelegaDaEventi`, `analizzaEvidenzaDelega`;
> `public/app.js`: `handleRealEvent`, `setInspectorTab`, `renderAutomationsReali`,
> `caricaPannelloMemoria`, `caricaPannelloAttivita`, `apriFileAlbero`, `passaASessione`,
> `aggiornaElencoSessioniReali`, `creaRigaSessioneBoard`, `refreshDoctorBadge`, `eseguiDoctor`,
> `appendStatusNote`, `setView`).
>
> ⛔ Stato `PROPOSTA`: nessuna riga si implementa senza il sì dell'owner. Una riga per commit.
> Ordine (owner 03/09, dalle più critiche alle più lunghe/opzionali):
> P-03 → P-11 → P-13 → P-01 → P-07 → P-16 → P-05 → P-06 → P-02 → P-04 → P-08 → P-14 → P-12 → P-09 → P-17 → P-15 → P-18 → P-10.
> Valgono le convenzioni backend e UI di `GUIDA-WAVE-1-2026-09-03.md` (rotte copiate da
> `childrenMatch`/`stopMatch`, `API_ERROR_CODES`, `apiGet/apiPost`, fixture legacy rigenerata,
> scenario in `SCENARI` di `scripts/qa-visual-pipeline.mjs`, screenshot 2 temi × 2 viewport).

---

## P-03 — Evidence ledger per sessione + guardia «codice scritto senza prova» (2,5 gg; kernel K-07)

**File**: `src/session-registry.mjs` (nuova `evidenzaDaEventi`, accanto a `usageDaEventi`), `src/agui-events.mjs` (`toolCallResult` porta già l'esito; nessun evento nuovo), `src/http-app.mjs` (`GET /sessions/:id/evidence`, pattern `childrenMatch`), `public/app.js` (badge sul giro in `handleRealEvent`, colonna nell'inspector), `tests/session-registry.test.mjs`, `tests/http-routes-sessions.test.mjs`.

1. RED — `evidenzaDaEventi(eventi)` su eventi sintetici: (a) `scrivi` su `a.ts` + `prova` verde ⇒ `{ prove:1, verdi:1, fileCoperti:['a.ts'], senzaProva:[] }`; (b) `scrivi` su `a.ts` senza `prova`/`shell` ⇒ `senzaProva:['a.ts']`; (c) solo `.md` ⇒ `senzaProva:[]` (come Hermes `_NON_CODE_VERIFY_EXTENSIONS`); (d) `shell` con `npm test` exit 1 ⇒ `prove:1, verdi:0`.
2. GREEN — proiezione pura: `ToolCallStart`/`ToolCallResult` accoppiati per `toolCallId`; classificazione del comando `shell` in `test/lint/build/altro` per prefisso (`npm test`, `vitest`, `node --test`, `eslint`, `tsc`, `gradlew`), esito da `codice` nel risultato; i file coperti sono quelli scritti dopo l'ultima prova verde della stessa radice.
3. Rotta `GET /sessions/:id/evidence` → `{ data: evidenza }`; la stessa proiezione entra in `elenca()` per la Board.
4. UI: in `handleRealEvent` al `RunFinished` chiedere l'evidenza e mostrare un badge sul giro: «prove 2/2» verde, «1 file senza prova» ambra; click ⇒ elenco dei file e dei comandi con exit code. Tab Context dell'inspector (`setInspectorTab`) con la tabella.
5. Verso contrario: un `ToolCallResult` orfano non fa crashare la proiezione (test).
6. K-07 (kernel, PENDING): finché non c'è, la guardia è **solo informativa** (badge); quando il kernel emette `evidenza` nella risposta finale, la UI la confronta con la proiezione e segnala la discrepanza (fabbricazione).
7. Scenario `qa-evidenza-giro`: task che scrive un file e lancia `node --test`; screenshot del badge; task che scrive senza provare ⇒ badge ambra. Misura sul banco: task-trappola con `evidenza` nel rapporto.
8. Commit `feat(evidence): proiezione delle prove per sessione e badge del giro (P-03)`.

## P-11 — Checkpoint del workspace per giro e «Ripristina codice», anche per `shell` (4 gg)

**File**: `src/workspace-checkpoint.mjs` (nuovo), `src/session-registry.mjs` (`avviaESegui`: checkpoint prima del giro; `broadcast`: percorsi da `WorkspaceChanged` durante `shell`), `src/http-app.mjs` (`GET /sessions/:id/checkpoints`, `POST /sessions/:id/checkpoints/:n/restore`), `public/app.js` (riga del giro), `tests/workspace-checkpoint.test.mjs`, `tests/http-routes-sessions.test.mjs`.

1. Disegno: un repo Git **ombra** per sessione in `.sessions/<id>/checkpoint.git` (Cline: «shadow Git repository separate from your project's actual Git history»), `git --git-dir=<ombra> --work-tree=<cartella>` sotto `createProcessPolicy({ allowedExecutables:['git'] })` (W1-05 espone già il servizio; se W1-05 non è ancora chiusa, questo modulo porta la propria policy limitata a `add/commit/diff/checkout`). `.gitignore` del progetto rispettato; store interni esclusi (`IGNORATI` di `workspace-watcher.mjs`).
2. RED — `tests/workspace-checkpoint.test.mjs` con `exec` iniettato (pattern `workspace-context.test.mjs`): `scatta(sessione, giro)` ⇒ commit con messaggio `giro N`; `ripristina(sessione, n)` ⇒ `checkout` dei file del commit; `ripristina` con un commit del **repo vero** più recente del checkpoint ⇒ errore `CHECKPOINT_STALE` con motivo (parità con Cline 4.1.17); simulazione `shell: rm file` ⇒ il file torna.
3. GREEN — `scatta` è chiamata in `avviaESegui` prima del primo giro e dopo ogni `RunFinished`; costo misurato (ms) nel `RunStarted.contesto`.
4. Rotte: lista `{ n, giro, ora, file: k, byte }` e restore (negato in `Read only`? no: il ripristino è un'azione dell'utente, ammessa sempre, ma registra una ricevuta firmata `ripristino`).
5. UI: sulla riga del giro «Ripristina codice» con i byte e i file che cambierebbero (dal `diff` prima di eseguire), tre scelte come Claude Code (`codice`, `conversazione` = tronca la vista al giro senza riscrivere il JSONL, `entrambi`); symlink saltati e dichiarati.
6. Verso contrario: ripristino su sessione con giro vivo ⇒ rifiutato con motivo.
7. Scenario `qa-ripristina-codice`: task che scrive e cancella, ripristino, screenshot prima/durante/dopo.
8. Commit `feat(checkpoint): repo ombra per giro e ripristino del codice anche dopo shell (P-11)`.

## P-13 — Repo map: indice dei simboli con ranking e budget di token (5 gg adapter; kernel K-10)

**File**: `src/repo-map.mjs` (nuovo), `src/workspace-watcher.mjs` (invalidazione per file), `src/runtime-owner-adapter.mjs` (iniezione nel contesto quando K-10 non c'è: come blocco di sistema del task), `src/http-app.mjs` (`GET /sessions/:id/repo-map?budget=`), `tests/repo-map.test.mjs`.

1. Algoritmo (Aider `repomap.py`, letto negli estratti D1): per ogni file **definizioni** e **riferimenti** di identificatori; grafo file→file pesato per identificatore (`√(riferimenti)`, ×50 se il referente è fra i file del task); PageRank personalizzato sui file del task e sulle menzioni nel prompt; rank ridistribuito sugli archi e sommato per (file, identificatore); riempimento del budget con le definizioni più alte, in forma di firme (una riga per definizione).
2. Estrazione dei simboli senza dipendenze native: per `.ts/.js/.mjs` regex su `function|class|const|export`; per altri linguaggi `ctags`-like minimale dichiarato (il kernel K-10 potrà usare tree-sitter WASM); niente parser completo in questa riga.
3. RED — corpus di 20 file finti con riferimenti incrociati: (a) il file più referenziato è primo; (b) con `fileDelTask=['b.ts']` il vicinato di `b.ts` sale; (c) budget 300 token ⇒ output ≤ 300 token misurati con lo stesso stimatore del kernel; (d) cambiando un file solo quello viene rianalizzato (contatore di analisi).
4. GREEN — `creaRepoMap({ cartella, ignorati })` con cache in memoria per file (hash contenuto) e invalidazione da `WorkspaceChanged` (`creaGestoreWorkspaceWatcher`).
5. Iniezione: finché K-10 è PENDING, `createOwnerRuntimeAdapter` aggiunge al task un blocco «Mappa del repository (N token)» quando il workspace ha più di 30 file; la ricevuta del giro porta `mappa:{ token, file }`.
6. Misura: TALOS-BANCO corpus `storia` prima/dopo (oggi 0/35 perché non vede i file a profondità 4-6); token della mappa per giro nel rapporto.
7. Commit `feat(repo-map): indice dei simboli con PageRank e budget di token (P-13)`.

## P-01 — Sotto-agenti pilotabili: `list/steer/stop`, approvazioni inoltrate, ripresa da JSONL (3 gg)

**File**: `src/subagent-orchestrator.mjs`, `src/session-registry.mjs` (la coda `voce.codaMessaggi` esiste; `richiediApprovazione`), `src/agui-events.mjs` (`approvalRequested` con `childId`), `src/http-app.mjs` (`GET /sessions/:id/children` esiste come `childrenMatch`; nuove `POST /sessions/:id/children/:cid/steer`, `…/stop`), `public/app.js` (inspector Agenti via `setInspectorTab`), test.

1. RED — orchestrator: `steer(childId, testo)` accoda nella `codaMessaggi` del figlio; il figlio la legge al confine del giro (già il comportamento del genitore); l'evento `QueuedMessageDelivered` del figlio porta `giro`; `stop(childId)` ⇒ il figlio chiude al confine del giro e `esitoDelegaDaEventi` restituisce `parziale:true` con l'artefatto (`analizzaEvidenzaDelega`).
2. RED — approvazione del figlio: `richiediApprovazione(voceFiglio, azione)` inoltra al genitore un `ApprovalRequested` con `childId`; la risposta del genitore risolve il figlio (`approvalResolved` con `childId`).
3. GREEN — rotte `steer`/`stop` (pattern `stopMatch`), `403` se la sessione figlia non appartiene alla sessione padre (proprietà: `voce.genitore`).
4. Ripresa: una delega fallita lascia `handleRipresa = { childId }` nell'esito; `POST …/children/:cid/resume` riusa il JSONL del figlio (`resume` esistente) invece di ricreare la sessione; la ricevuta riporta i token risparmiati.
5. UI: inspector Agenti con figli vivi (goal, modello, secondi, `accettaSteer`), campo steer, bottone stop, card di approvazione con «chiesto dal figlio X».
6. Verso contrario: steer a figlio finito ⇒ `409` con motivo; stop due volte ⇒ idempotente.
7. Scenario `qa-figli-pilotabili`: delega lunga, steer, stop, screenshot dell'inspector e della ricevuta con `steerRicevuti/steerApplicati`.
8. Commit `feat(subagents): steer, stop, approvazioni inoltrate e ripresa dei figli (P-01)`.

## P-07 — Hooks: eventi di ciclo di vita, tipo `http`, `seFallisce` fail-closed, prima/dopo nel JSONL (2,5 gg)

**File**: `src/hook-registry.mjs` (`EVENTI_VALIDI`, `eseguiHook`), `src/session-registry.mjs` (`costruisciHookFn`, `broadcast`), `src/agui-events.mjs` (`hookInvoked` porta `input`/`output` prima e dopo), `tests/hook-registry.test.mjs`, `tests/session-registry.test.mjs`.

1. RED — `EVENTI_VALIDI` accetta `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Interrupt`, `PermissionDenied` oltre agli attuali; un hook con `tipo:'http'` (`url`, `timeoutMs`, header dal Secret Broker W2-04 quando esiste, altrimenti nessun segreto) riceve il JSON e risponde `{ decisione, inputAggiornato?, contesto? }`; `seFallisce:'blocca'|'ignora'`, default `blocca`: hook che lancia o scade ⇒ azione bloccata con motivo.
2. GREEN — `eseguiHook` con i due tipi; `costruisciHookFn` chiama gli eventi nuovi nei punti giusti (`compattaSessione` prima/dopo, `creaSubagentOrchestrator` avvio/fine, stop del giro, approvazione negata).
3. JSONL: `HookInvoked` conserva `inputPrima` e `inputDopo` quando l'hook riscrive; il replay li mostra entrambi (Codex e Claude Code mostrano solo il dopo).
4. Process Ledger (W1-02): ogni hook è una riga con durata ed esito.
5. Verso contrario: hook `http` verso host non in allowlist ⇒ rifiutato al caricamento; hook non fidato ⇒ non gira (trust sha256 esistente).
6. Commit `feat(hooks): eventi di ciclo di vita, hook http, fail-closed e prima/dopo nel JSONL (P-07)`.

## P-16 — Fallback di modello a due stadi con evento `ModelSwitched` e rotazione dell'id di routing (2 gg)

**File**: `src/runtime-owner-adapter.mjs` (`creaFetchMultiProvider`, `creaFetchOpenRouterResiliente`), `src/agui-events.mjs` (nuovo `modelSwitched`), `src/config.mjs` (`MODELLI_AMMESSI`: i fallback devono starci), `src/session-registry.mjs` (proiezione), `public/app.js` (pillola modello), test.

1. RED — con `fallback:['b','c']` e il provider che risponde 429/5xx/timeout su `a` per N tentativi: primo stadio = **stesso modello, altro profilo/provider** (già la rotazione OpenRouter), secondo stadio = modello successivo; evento `ModelSwitched { da, a, motivo, tentativi }`; la richiesta successiva porta un nuovo `routingId` (Gemini CLI v0.54: rotazione dell'id di sessione al fallback; Pi: id fresco per compattazione). Modello fuori `MODELLI_AMMESSI` ⇒ mai usato, anche se in lista.
2. GREEN — lista di fallback per sessione (`avvia` accetta `fallback`), letta da `createOwnerRuntimeAdapter`.
3. UI: la pillola modello mostra il modello **effettivo** dell'ultima risposta e una nota «passato a b: 429 ×3»; la ricevuta del giro porta `modelloEffettivo`.
4. Verso contrario: errore non transitorio (401) ⇒ nessun fallback, errore onesto.
5. Commit `feat(runtime): fallback a due stadi con evento e modello effettivo nella ricevuta (P-16)`.

## P-05 — Attrezzo `chiedi` + `schemaUscita` sulla delega (2 gg adapter; kernel K-09)

**File**: `src/agui-events.mjs` (`clarifyRequested`, `clarifyResolved`, modello `approvalRequested`/`approvalResolved`), `src/session-registry.mjs` (record `tipo:'risposta-utente'`, funzione `rispondiChiarimento` accanto a `richiediApprovazione`), `src/http-app.mjs` (`POST /sessions/:id/clarify/:rid`), `public/app.js` (scheda domande nel composer), test.

1. Contratto: `ClarifyRequested { requestId, domande:[{ id, testo, opzioni?:[…], multipla?:bool }] }` (Hermes: più domande indipendenti in una chiamata; OpenCode `question`), risposta `{ requestId, risposte:{ id: valore } }` registrata nel JSONL come record proprio (rigiocabile).
2. RED — rotta e registrazione; risposta a `requestId` sconosciuto ⇒ `404`; risposta doppia ⇒ `409`.
3. GREEN — adapter pronto; finché K-09 è PENDING l'evento non viene mai emesso dal kernel (test che lo prova: nessun `ClarifyRequested` nelle corse di oggi).
4. Delega: `schemaUscita` nella richiesta di delega passa al kernel (K-09) e la ricevuta del figlio porta `schemaValido, retry`; validazione **obbligatoria** (Hermes accetta tutto senza `jsonschema`: qui no).
5. UI: scheda con le domande (radio/checkbox/testo), invio unico; screenshot.
6. Commit `feat(clarify): evento, rotta, record JSONL e scheda domande (P-05, adapter)`.

## P-06 — Revisore automatico delle approvazioni (5 gg)

**File**: `src/approval-reviewer.mjs` (nuovo), `src/session-registry.mjs` (`richiediApprovazione`: prima deny/ask deterministici, poi revisore, poi umano), `src/agui-events.mjs` (`approvalResolved` con `da:'revisore'|'utente'` e `visto:[_sequenza]`), `public/app.js` (badge «approvato da»), `tests/approval-reviewer.test.mjs`.

1. Regole prima del codice (Codex Guardian + Claude Code auto mode, estratti C1/A1): (a) `permissions.deny` e `ask` deterministici **prima** del revisore e mai scavalcabili; (b) il revisore vede **solo** eventi ritenuti (intento utente, tool recenti, l'azione esatta), mai il ragionamento; (c) risposta su schema `{ decisione:'consenti'|'nega', motivo, rischio }`; (d) fail-closed: timeout, JSON malformato, errore ⇒ `nega` con tipo distinto (`Timeout`, `Parse`, `Sessione`); (e) circuit breaker per giro: 3 dinieghi consecutivi o 10 su 50 ⇒ giro interrotto con avviso; (f) modello del revisore dalla policy (W2-09), fascia flash, mai fuori allowlist.
2. RED — tutti i rami di (d) e (e); un caso «consenti» e uno «nega» con transcript finto; il verdetto è una ricevuta firmata con `visto`.
3. GREEN — `creaRevisore({ chiamaModello, policy })`; `richiediApprovazione` lo interpella solo in livello `On request` con preferenza accesa.
4. UI: preferenza «Revisore automatico (sperimentale)» spenta di default in Settings; badge sul giro; «Recently denied» con retry (Claude Code): elenco dei dinieghi con bottone «riprova con approvazione umana».
5. Misura obbligatoria: banco TALOS-BANCO con e senza revisore: approvazioni umane evitate, dinieghi corretti/errati sui task-trappola (controllo negativo). Senza questa misura la riga non si chiude.
6. Commit `feat(approvals): revisore automatico fail-closed con ricevuta e breaker (P-06)`.

## P-02 — Automazioni: trigger a evento, monitor-mode, continuità, notepad, «costo evitato» (4 gg)

**File**: `src/automation-store.mjs` (`createAutomationStore`: campi `trigger`, `monitor`, `continuita`, `notepad`), `src/automation-scheduler.mjs` (`unTick`), `src/agui-events.mjs` (predicato), `src/http-app.mjs` (rotte `automations/:id/runs` di W2-02, `…/notepad`), `public/app.js` (`renderAutomationsReali`, `caricaPannelloAttivita`), test.

1. Contratto: `trigger: { tipo:'orario'|'evento', evento?: { tipo:'WorkspaceChanged'|'RunFinished'|'ApprovalRequested', filtro:{ percorso?, sessione?, esito? } } }`; `monitor: { comando?|url?, ignoraRighe:[regex] }`; `continuita: true` ⇒ l'ultima ricevuta (dati, non prosa) entra nel contesto della corsa; `notepad: { tetti: { valore: 16384, totale: 65536 } }` scritto dal modello via `tasks`/`notes` esistenti? no: via un attrezzo dedicato solo in questa automazione, o via CLI come Hermes — scelta: **rotta** `PUT /automations/:id/notepad/:chiave` chiamata dall'automazione con `shell` (nessun attrezzo nuovo al kernel).
2. RED — `unTick` con `monitor` e sorgente invariata ⇒ nessuna corsa, riga `noChange` nella storia (W2-02); righe che combaciano con `ignoraRighe` non contano; errore della sorgente ⇒ `errore`, mai `cambiato`; trigger a evento: il predicato è una funzione pura su un evento AG-UI (test con eventi sintetici); `LIMITE_MASSIMO_AL_GIORNO` vale anche per i trigger a evento.
3. GREEN — hash sha256 dell'output normalizzato + diff unificato (cap 4.000 caratteri) nel contesto della corsa (Hermes `cron/monitor.py`).
4. Storia: per automazione «tick saltati N, corse M, costo evitato ≈ (N × costo medio corsa)» con etichetta «stima».
5. UI: form dell'automazione con trigger, monitor, continuità; vista Attività con la storia e i numeri.
6. Commit `feat(automations): trigger a evento, monitor-mode, continuità e costo evitato (P-02)`.

## P-04 — Ledger firmato delle mutazioni di skill e memoria con rollback (2 gg)

**File**: `src/mutation-ledger.mjs` (nuovo, JSONL append-only `.memory-store/ledger.jsonl` e `.harness-ui-skills/ledger.jsonl` per workspace), `src/memory-store.mjs` (`creaMemoria`, `aggiornaMemoria`, `eliminaMemoria`), `src/skill-registry.mjs` (le scritture di skill quando esisteranno; oggi `caricaSkill` è sola lettura), `src/harness-receipt-keypair.mjs` (firma), `src/http-app.mjs` (`GET …/ledger`, `POST …/ledger/:id/rollback`), `public/app.js` (`caricaPannelloMemoria`), test.

1. Riga: `{ id, ts, attore:'utente'|'agente'|'automazione', azione, oggetto, prima:{ sha256, contenuto? }, dopo:{ sha256 }, firma }` (Hermes `skill_ledger.append_entry` + firma Ed25519).
2. RED — ogni mutazione scrive una riga **prima** di applicarsi; se il ledger non scrive, la mutazione fallisce (fail-closed, contrario di Hermes «never blocks the mutation»); rollback di una riga ripristina il contenuto con sha256 identico; rollback di una riga già annullata ⇒ `409`.
3. UI: vista Memoria con «chi ha scritto cosa» e «Annulla» per riga.
4. Commit `feat(ledger): mutazioni di memoria e skill firmate con rollback (P-04)`.

## P-08 — Memoria: candidate con citazione obbligatoria, tetto visibile, oblio verificabile (4 gg)

**File**: `src/memory-candidates.mjs` (nuovo), `src/memory-store.mjs`, `src/session-registry.mjs` (sessioni chiuse ⇒ candidate), `src/http-app.mjs` (`GET /memory/candidates`, `POST …/accept|reject`, `POST /memory/forget`), `public/app.js` (`caricaPannelloMemoria`), test.

1. Regole (Codex C5 «minimum signal gate», OpenClaw Dreaming a operazioni, Claude Code tetto dichiarato): una candidata nasce **solo** da una sessione chiusa, con `citazione:{ sessionId, sequenze:[…] }`; senza citazione è respinta dal codice, non dal prompt; il modello restituisce **operazioni** (`aggiunta|unita|sostituita` con `precedente` esatto), mai prosa libera; no-op ammesso e preferito.
2. RED — candidata senza citazione ⇒ `400`; accettazione ⇒ `creaMemoria` con la citazione nel corpo e riga nel ledger (P-04); `forget(sessionId)` ⇒ memorie derivate rimosse, sessione marcata `dimenticata`, e una nuova estrazione dalla stessa sessione **non** ripristina (OpenClaw `memory forget`).
3. Tetto: `memory-store.mjs` espone `{ byte, tetto }` dell'indice; la scrittura che supera il tetto è rifiutata **prima** con messaggio (M5 della ricognizione 2/9), mai tagliata in silenzio.
4. UI: elenco candidate con «Accetta / Rifiuta», indicatore byte/tetto, «Dimentica questa sessione»; % di candidate accettate come misura.
5. Commit `feat(memory): candidate con citazione obbligatoria, tetto visibile e oblio (P-08)`.

## P-14 — Lint per linguaggio sui file toccati dopo `scrivi` (2 gg)

**File**: `src/linter.mjs` (nuovo, sotto `createProcessPolicy`), `src/doctor.mjs` (`diagnosi`: rilevamento di `eslint`, `tsc`, `ruff`, `gradlew lint` nel workspace), `src/session-registry.mjs` (`broadcast`: dopo un `ToolCallResult` di `scrivi`), `src/agui-events.mjs` (esito come `StateDelta /lint` o `ToolCallResult` sintetico? scelta: `StateDelta` path `/lint/<file>`), test.

1. RED — con `exec` iniettato: file `.ts` scritto ⇒ `tsc --noEmit` sul progetto (o `eslint <file>`) e `{ file, errori:n, righe:[…] }`; nessun linter ⇒ `{ stato:'n/d' }` mai zero; timeout dichiarato.
2. GREEN — il risultato entra nel contesto del giro successivo come blocco «Lint: 2 errori in a.ts (righe…)» e il prompt dice che il lint **è già girato** (Aider `auto_lint`: «don't suggest running them»).
3. Misura: task risolti sul banco prima/dopo.
4. Commit `feat(lint): lint per linguaggio dopo ogni scrittura, esito nella ricevuta (P-14)`.

## P-12 — Sessioni ad albero nello stesso JSONL con costo per ramo (3,5 gg)

**File**: `src/session-store.mjs`, `src/session-registry.mjs` (`forka` oggi crea un'altra sessione; nuova `ramifica(sessionId, daSequenza)`), `src/http-app.mjs` (`POST /sessions/:id/branch`, `GET …/tree`), `public/app.js` (albero nella vista sessione), test.

1. Schema (W0-02 `schema: 2`): ogni record porta `parentId` (= `_sequenza` del genitore) e la sessione ha un record `ramoAttivo { foglia }` esplicito (Pi usa «l'ultima riga» come foglia: qui no); il replay costruisce il cammino foglia→radice (Pi `buildSessionPath`).
2. RED — migrazione 1→2 in lettura (catena lineare); ramifica da `_sequenza` 12 ⇒ nuovi record con `parentId:12`; `usageDaEventi` per sottoalbero; ramo abbandonato ⇒ ricevuta di riassunto (K-04 quando c'è; prima: solo il marcatore).
3. UI: albero con costo per ramo, click per cambiare foglia; il ramo attivo è quello che continua.
4. Commit `feat(sessions): albero nella stessa sessione con foglia esplicita e costo per ramo (P-12)`.

## P-09 — `@sessione` nel composer e messaggi fra sessioni con ricevuta di consegna (2,5 gg)

**File**: `src/session-registry.mjs` (nuova `recapita(daSessione, aSessione, { sequenze })`), `src/agui-events.mjs` (`sessionMessage`), `src/http-app.mjs` (`POST /sessions/:id/messages/from/:src`, `GET /sessions?vive=1`), `public/app.js` (composer: menzione `@` con autocompletamento dalle sessioni vive; `submitPrompt(text)`, che chiama `apiPost` su `/sessions/:id/queue` quando un giro è vivo e crea la sessione altrimenti), test.

1. Contratto: l'allegato è un insieme di `_sequenza` della sessione sorgente (Claude Code/Codex allegano testo: qui il replay è la fonte), reso come blocco «Da sessione X: …» nel contesto; il recapito produce un evento con `consegnatoA` e, se la destinazione è ferma, viene consegnato al `resume` (test).
2. RED — menzione di sessione inesistente ⇒ `404`; allegato = replay identico (confronto degli eventi).
3. Commit `feat(sessions): menzioni e messaggi fra sessioni con ricevuta di consegna (P-09)`.

## P-17 — Interrogazione del piano (`/grill`) (2 gg; kernel K-01)

**File**: `src/plan-interrogation.mjs` (nuovo), `src/session-registry.mjs` (record `tipo:'obiezione'`), `src/http-app.mjs` (`POST /sessions/:id/plan/objections`), `public/app.js` (inspector Context, sotto il piano di W2-01), test.

1. Con il piano persistito (W2-01/K-01): l'utente o un revisore (modello, fascia flash) pone obiezioni al piano; ogni obiezione ha una risposta nel JSONL; `Act` è ammesso solo con `obiezioniAperte === 0` (Muse Code `/grill`).
2. RED — piano con 3 obiezioni ⇒ approvazione rifiutata finché una è aperta; risposta ⇒ chiusa.
3. Commit `feat(plan): obiezioni al piano e blocco dell'esecuzione finché restano aperte (P-17)`.

## P-15 — Marcatori `TALOS!`/`TALOS?` nei file salvati aprono un giro (1,5 gg)

**File**: `src/workspace-watcher.mjs` (`creaGestoreWorkspaceWatcher`: su `WorkspaceChanged` di un file di testo, cerca il marcatore nelle righe cambiate), `src/session-registry.mjs` (`avvia` con `contesto.origine:'marcatore'`), `public/app.js` (interruttore in Settings, spento di default), test.

1. RED — file con `// fix this TALOS!` ⇒ giro aperto sulla sessione del workspace con il file e la riga nel contesto; `TALOS?` ⇒ giro in modalità lettura; marcatore rimosso solo a esito verde (`RunFinished` con evidenza, P-03); file ignorati (`IGNORATI`) ⇒ nessun giro.
2. Commit `feat(watcher): marcatori nel codice che aprono un giro (P-15)`.

## P-18 — Best-of-n in worktree (3 gg)

**File**: `src/best-of-n.mjs` (nuovo), `src/git-service.mjs` (W1-05) e worktree (W2-11), `public/app.js` (vista di confronto), test.

1. `n` corse dello stesso task in `n` worktree (`git worktree add`), ognuna una sessione con la stessa intestazione; alla fine confronto di diff **e** ricevute (prove eseguite, evidenza P-03): il vincitore si sceglie sulla prova, mai sul testo; costo totale mostrato **prima** di partire (n × stima W1-08).
2. RED — `n=3` con runner finto; classifica per `verdi` poi per `byte del diff`; worktree rimossi con snapshot (W2-11).
3. Commit `feat(best-of-n): n corse in worktree e scelta sulle ricevute (P-18)`.

## P-10 — PlanVM (6 gg; kernel K-02, K-05)

**File**: `src/planvm.mjs` (nuovo), `src/subagent-orchestrator.mjs`, `src/http-app.mjs` (`POST /sessions/:id/planvm/preview`, `…/run`), `public/app.js` (inspector Context), test.

1. Solo dopo K-05 (contratto per attrezzo con `effetti`, `idempotente`) e K-02 (esecutore iniettabile). DSL dichiarativa (JSON, non JavaScript: OpenCode e Codex eseguono programmi; qui il piano è dati): `{ passi:[{ id, attrezzo, argomenti, dipendeDa:[…] }], figli:[{ id, task, budget }] }`.
2. Preventivo statico prima di eseguire: chiamate massime, attrezzi con `canTransmit`, figli e budget totale; il piano è approvabile (W2-01) e limitato per costruzione (spawn loop impossibile: i figli sono un elenco finito).
3. RED — piano che supera il budget ⇒ respinto prima di partire; passo con attrezzo non permesso ⇒ respinto; esecuzione ⇒ un `ToolCall*` per passo nel JSONL (replay identico).
4. Misura: giri e token sul banco contro il loop classico.
5. Commit `feat(planvm): piani dichiarativi con preventivo e limiti per costruzione (P-10)`.
