# MAPPA — Harness Desktop, struttura completa al 02/09/2026

> Scritta in attesa della zip di proposta «massimizzazione dell'harness».
> È la base del confronto: ogni funzione della zip verrà cercata QUI prima
> di dichiararla «nuova», «a metà» o «già fatta». Tutto misurato sul disco
> del worktree `lane/harness-desktop` (commit `4910b4a5`), niente ricordato.

## 0 — I numeri

| Cosa | Misura |
|---|---|
| Backend `harness-ui/src/*.mjs` | 70 moduli, 17.600 righe |
| Server d'ingresso `harness-ui/server.mjs` | 19,8 KB |
| Frontend in produzione `public/app.js` | 11.120 righe, 379 funzioni, 593 KB, IIFE vanilla |
| `public/styles.css` | 2.452 righe, 79 custom property, 12 media/container query |
| `public/index.html` | 68 KB, 245 elementi con id |
| Frontend modulare `harness-ui/frontend/src` | 2.767 righe (non in produzione) |
| Test backend `harness-ui/tests` | 82 file, 19.729 righe, ultimo giro 1.343/1.343 |
| Test frontend modulare | 4.152 righe, unit + contract + Playwright, 200/200 |
| Pipeline QA visiva `scripts/qa-visual-pipeline.mjs` | 5.011 righe |
| Rotte HTTP `/api/v1/*` | 27 fisse + 47 parametrizzate |
| Eventi AG-UI | 22 tipi |
| Attrezzi dell'agente (kernel) | 7 base + 35 estesi + dinamici (`forge_*`, MCP, skill) |
| Commit su `harness-ui/` in questo ramo | 115, dal 26/08 |
| Sessioni su disco `.sessions-store` | 40 file JSONL, 11,7 MB |
| Documenti in `.claude/` su questo sottosistema | ~120 fra piani, dossier, ledger, consegne |

## 1 — Albero delle cartelle

```
AVM-harness-desktop/                 repo (worktree della lane desktop)
├── harness-ui/                      ⇐ TUTTO l'harness desktop vive qui
│   ├── server.mjs                   bootstrap: config, keyring, catalogo, runtime owner, HTTP+WS
│   ├── src/                         70 moduli backend (vedi §2)
│   ├── public/                      UI servita a http://127.0.0.1:4174/ (monolite)
│   │   ├── app.js · styles.css · index.html
│   │   ├── vendor/xterm/            xterm.js + addon fit/webgl (terminale reale)
│   │   ├── fonts/                   Instrument Sans + JetBrains Mono (10 woff2)
│   │   └── talos/brand/logo-short.svg
│   ├── frontend/                    nuova toolchain modulare (esbuild, Playwright) — Fase 1-2 chiuse, 3 in corso
│   │   ├── src/{app,contracts,design-system,state,ui,styles}
│   │   ├── lab/                     laboratorio isolato (routes: lifecycle, design-system, focus, virtual-list)
│   │   ├── tests/{unit,contract,component,integration,browser}
│   │   ├── artifacts/               screenshot e report per fase (phase-01..03, lag, review 02/09, gate Qwen)
│   │   └── dist/ · dist-lab/        build deterministiche
│   ├── dist/                        bundle canonico per il mobile (build-ui.mjs + manifest.json)
│   ├── mockup-originale/            il mockup di partenza (24/8) + preview png + RESEARCH/UI_REVIEW
│   ├── contracts/                   runtime-bootstrap-v1 / runtime-event-v1 (JSON schema)
│   ├── scripts/                     qa-visual-pipeline, build-ui, verify-ui-manifest, audit-harness-findings,
│   │                                windows/{register-,}open-with-talos.ps1
│   ├── tests/                       82 file node --test
│   └── .sessions-store · .automations · .hooks-trust · .local-models · .local-runtime
│       .memory-store · .notes-store · .tasks-store · .tool-forge-store · .qa-runs (227 corse)
├── mobile/                          lane mobile (NON di mia ownership) — 15.183 file
├── core/ control-plane/ browser-worker/ ocr-worker/ validator/ docker/ deploy/ docs/ scripts/ storage/
│                                    resto della piattaforma AVM, non toccato dall'harness desktop
└── .claude/                         piani, dossier, ledger, consegne, hook di sessione (vedi §9)
```

Il **kernel dell'agente** non sta in questo repo: è
`C:\Users\Antonino\Desktop\projects\AVM-harness\mobile\scripts\harness-talos\talosHarness.mjs`
(6.226 righe, 348 KB, test 354 KB), caricato SOLO se `TALOS_OWNER_RUNTIME_MODULE`
punta a quel percorso assoluto (`runtime-owner-adapter.mjs`).

## 2 — Backend: i 70 moduli per area

### 2.1 Ciclo di vita di una sessione (il cuore)

| Modulo | Righe | Ruolo |
|---|---:|---|
| `session-registry.mjs` | 2.575 | sessioni vive in memoria + buffer eventi + persistenza JSONL. Metodi: `avvia`, `avviaLibero`, `ferma`, `reindirizza`, `forka`, `resume`, `compatta`, `accodaMessaggio`/`svuotaCoda`, `rispondiApprovazione`, `shell`, `rinomina`, `elimina`, `aggiornaImpostazioni`, `esporta`, `ripristina`, `iscriviti`, albero/file (`albero`, `anteprimaAlbero`, `apriFile`, `rinominaFile`, `eliminaFile`, `spostaFile`, `copiaFile`, `creaVoceWorkspace`, `rivelaFile`), i sei sistemi (`elencaLibreria/Note/Attivita/Memorie/Ricerche/ToolForgiati`), estensibilità (`elencaHooks/ServerMcp/Skill/Plugin`, `fidaHook/ServerMcp/Plugin`, `abilitaToolForgiato`), `elencaFigli`, `cartellePiuUsate`, `statoPersistenza` |
| `agent-service.mjs` | 1.399 | espone `talosLavora` come servizio: `avviaSessione`, `compattaSessione`, `eseguiComandoDiretto`; unico punto dove i dati grezzi del kernel diventano eventi AG-UI; monta gli store dei sei sistemi, artefatti, documenti, immagini, MCP, skill, forge |
| `runtime-owner-adapter.mjs` | 521 | carica il kernel da `TALOS_OWNER_RUNTIME_MODULE`; fetch OpenRouter resiliente (timeout di inattività, ritenta pre-output, hot-swap modello/reasoning); `compattaConversazione`, `eseguiFlowForge`, `taskCatalogProvider` |
| `agui-events.mjs` | 335 | traduttori puri verso i 22 eventi AG-UI (vedi §4) |
| `session-store.mjs` | 169 | scrittura/lettura JSONL per sessione (Fase L, 30/8) |
| `custom-task.mjs` · `task-catalog.mjs` | 145 · 65 | sessione libera su cartella + catalogo task preset (degradazione onesta se il provider manca) |
| `subagent-orchestrator.mjs` | 235 | sub-agenti (`delega_sottotask`, Fase C) |
| `stream-partition.mjs` | 123 | separa testo/ragionamento del provider prima della UI |
| `process-policy.mjs` | 334 | confine di policy per OGNI processo host avviato dall'harness |
| `path-policy.mjs` | 96 | radici, junction/symlink, cartelle protette |
| `harness-receipt-keypair.mjs` | 207 | chiave Ed25519 che firma le ricevute delle operazioni |
| `config.mjs` | 408 | env, allowlist modelli (`z-ai/glm-4.7-flash`, `qwen/qwen3.7-flash`), grammatica permessi |

### 2.2 HTTP, SSE, WebSocket, statici

`http-app.mjs` (2.534, tutte le rotte di §3), `http-lifecycle.mjs` (SSE con battito ogni 15 s, shutdown), `static-files.mjs`, `public-problem.mjs` (errori pubblici, 40 codici `API_ERROR_CODES`), `terminal-ws.mjs` + `pty-terminal.mjs` (PTY reale via `node-pty`, chiusura orfane a minuti).

### 2.3 Workspace e file

`workspace-tree.mjs` (albero reale lazy), `workspace-files.mjs` (rinomina/apri/rivela/elimina/sposta/copia/crea), `workspace-browser.mjs` (browser cartelle pre-sessione, root `C:\`, read-only), `workspace-watcher.mjs` (watcher nativo Node condiviso, posseduto da un run o da un client SSE), `workspace-disk.mjs`, `workspace-context.mjs` (pannello Ambiente), `workspace-launch-store.mjs` + `frequent-dirs.mjs` (launcher Windows «Apri cartella con TALOS», cartelle consigliate).

### 2.4 Estensibilità

`hook-registry.mjs` (Fase A, `.harness-ui-hooks.json`, fiducia in `.hooks-trust/`), `mcp-registry.mjs` + `mcp-client.mjs` + `mcp-session.mjs` (Fase E, stdio, `@modelcontextprotocol/client`), `skill-registry.mjs` (Fase F, `carica_skill`), `plugin-registry.mjs` + `plugin-session.mjs` (Fase G, `.harness-ui-plugins/`), `forge-contract.mjs` + `tool-forge-store.mjs` (Tool Forge, manifest validato, `forge_*`).

### 2.5 I sei grandi sistemi (Fase N, 29-30/8)

`library-store.mjs` + `library-policy-store.mjs` (Libreria), `notes-store.mjs` (Note), `tasks-store.mjs` (Attività), `memory-store.mjs` (Memoria), `research-orchestrator.mjs` + `research-store.mjs` (Ricerca approfondita, «fetta onesta»: senza pianificazione event-sourced e citazioni del mobile), `tool-forge-store.mjs` (Tool Forge). Ognuno ha un attrezzo `*_list/create/update/delete` nel kernel e una rotta GET per sessione.

### 2.6 Model Lab e runtime locale (Fase 5/8B/8C/10)

`model-catalog.mjs` (catalogo OpenRouter vero), `provider-credential-store.mjs` (chiavi nel portachiavi di sistema via `@napi-rs/keyring`), `local-model-store.mjs` + `gguf-header.mjs` (import GGUF, hash, manifest), `hf-hub-client.mjs` + `hf-model-transfer.mjs` + `hf-direct-transfer.mjs` + `hf-image-proxy.mjs` (ricerca, download con pausa/ripresa/annulla), `llama-server-supervisor.mjs` + `local-runtime-llama-server.mjs` + `openai-compatible-runtime.mjs` (llama.cpp, Ollama, LM Studio), `local-runtime-probe.mjs`, `local-runtime-contract.mjs`, `local-runtime-events.mjs`, `machine-capacity.mjs`, `runtime-contract.mjs`, `runtime-owner-contract.mjs`, `runtime-build-manifest.mjs`, `doctor.mjs` (4 controlli veri).

### 2.7 Documenti, immagini, artefatti, automazioni

`document-generator.mjs` + `document-report.mjs` + `document-filename.mjs` (porto dal mobile: docx/pdf/pptx/xlsx), `image-generator.mjs` + `generated-image-store.mjs` (Fase H), `artifact-store.mjs` (HTML di `artifact_create`), `automation-store.mjs` + `automation-scheduler.mjs` (run programmati).

## 3 — API HTTP (loopback, `/api/v1`)

Fisse, GET salvo indicato:

`health` · `tasks` · `projects` · `projects/:id/tree` · `workspace-browser` · `workspace-browser/folders` (POST) · `frequent-dirs` · `workspace-launches` (POST) · `workspace-launches/:id` · `automations` (GET+POST) · `automations/:id/toggle|elimina` (POST) · `runtime` · `runtime/bootstrap` · `runtime/load|unload` (POST) · `local-models` · `local-models/import` (POST) · `local-models/:id/rename|copy-path|delete|fit|qualify` · `huggingface/search|repo|image|downloads` · `huggingface/download` (POST) · `huggingface/downloads/:id/pause|resume|cancel` · `providers` · `providers/:id/key[/remove]` · `providers/:id/runtime[/reset]` · `models` · `model-lab/capacity` · `doctor` · `doctor/doctor-<id>` · `artifacts/:id` · `sessions` (GET+POST) · `sessions/custom` (POST).

Per sessione `sessions/:id/…`:

| POST (azioni) | GET (letture) |
|---|---|
| `stop` · `redirect` · `fork` · `resume` · `compact` · `settings` · `shell` · `approve` · `queue` · `queue/annulla` · `rename` · `delete` | `events` (SSE) · `export` · `children` |
| `tree/rename|delete|reveal|move|copy|create` | `tree` · `tree/file?percorso=` |
| `hooks/:id/trust` · `mcp/:id/trust` · `plugins/:id/trust` · `tool-forge/:id/enable` | `hooks` · `mcp` · `skills` · `plugins` · `library` · `notes` · `tasks` · `memory` · `research` · `tool-forge` |

⛔ Trovato mappando: `annullaProvaRuntimeModelLab` (app.js:2177) chiama `POST sessions/:id/cancel`, rotta che il backend NON serve (esiste solo `/stop`). Il tasto «Annulla» della prova runtime nel Model Lab mostra «Errore» e chiude solo lo stream lato browser: la sessione di prova continua a girare sul server. Non corretto (il codice si tocca solo su ordine), registrato qui e in §10.

Terminale: WebSocket separato (`terminal-ws.mjs`), frame codificati lato client (`codificaFrameClient`).

## 4 — Eventi e persistenza

**22 eventi AG-UI** (stessi nomi in `agui-events.mjs` e nel `switch` di `handleRealEvent` in app.js): `RunStarted` (porta `contesto`: workspace, modello, reasoning, **permessi** dal 02/09), `RunFinished`, `RunError`, `RunRedirectRequested/Applied/Cancelled/Failed`, `TextMessageStart/Content/End`, `ReasoningMessageStart/Content/End`, `ToolCallStart/Args/Result`, `StateDelta`, `ArtifactCreated`, `WorkspaceChanged` (effimero dal 02/09), `ApprovalRequested/Resolved`, `QueuedMessageDelivered`, `HookInvoked`.

**Righe JSONL per sessione** (`.sessions-store/<id>.jsonl`): `intestazione`, `impostazioni-sessione`, `checkpoint-ripresa`, `messaggi-finali`, `nome-sessione` (aggiunta oggi: il nome sopravvive al riavvio). Al riavvio `ripristina()` rilegge tutto; ancora aperto: 16 file su 23 scartati in silenzio (`LEDGER-RESTORE-SILENZIOSO-16-SESSIONI-2026-09-02.md`).

## 5 — L'agente: attrezzi, sicurezza, giri

Kernel `talosHarness.mjs` (repo `AVM-harness`, lettura sola):

- **Base (7):** `elenca`, `cerca`, `leggi`, `scrivi`, `prova`, `shell`, `naviga`.
- **Estesi (35):** `web_search`, `artifact_create`, `document_create`, `time_now`, `delega_sottotask`, `generate_image`, `library_*` (8), `notes_*` (4), `tasks_*` (5), `memory_*` (4), `research_*` (8), `tool_create`.
- **Dinamici:** `carica_skill`, `forge_<nome>` (manifest Tool Forge), tool MCP per sessione, tool dei plugin.
- **`SICUREZZA_PER_ATTREZZO`** su 26 attrezzi che scrivono; catena privato/non-fidato (`avanzaCatena`, `verdettoTrifecta`, `rischioEffettivo`); ricevute firmate per operazione; `postcondizioneDiScrivi`.
- **Giri:** `GIRI_MASSIMI = 24` (32 provato e scartato, Stadio B), compattazione ogni 8 giri o sopra 2.000 token, riflessione ogni 6; `uscitaUtile` taglia a 4.000 caratteri.
- **Permessi di sessione:** `Read only` · `Workspace write` · `On request` · `Full access` + override per attrezzo (Fase B); approvazioni in linea (`ApprovalRequested`).
- Descrizione umana obbligatoria per ogni comando shell (01/09).

## 6 — Frontend in produzione (`public/`)

### 6.1 `app.js` per zone (righe)

| Righe | Zona |
|---|---|
| 1-360 | `ROOT/HOST/API`, `state` (18 chiavi: view, mode, settingsSection, queueMode, permissions, permessiPerAttrezzo, model, sessionSelection, showReasoning, effort, environment, session, running, pendingCustomSession, alberoFileTarget, board, modelLab, realSession) |
| 358-900 | strumentazione (`logStreaming`, latenza), scroll di streaming, ritmo typewriter/fade (`RITMO_STREAMING`), rAF batching, motion enter/exit |
| 900-1340 | navigazione (`setView`), pannelli, dialog ridimensionabili, toast |
| 1340-1660 | markdown incrementale (blocchi stabili + coda volatile), errori, usage, Board sessioni |
| 1660-2460 | Model Lab (provider, runtime, modelli locali, Hugging Face, download, prova runtime), Settings (8 sezioni, riepiloghi reali) |
| 2460-3220 | Doctor, pannelli Hooks/MCP/Skill/Libreria/Note/Attività/Memoria/Ricerca/Forge/Plugin, albero sessione |
| 3220-3600 | picker modello (raggruppato per provider, effort compatibile) ed effort |
| 3600-4320 | board, copia, notifiche (popover), menu azioni sessione, `openSheet` (12 tipi: capabilities, control, createFile, deleteFile, deleteSession, export, fileViewer, permissions, references, rename, renameFile, sessionTree) |
| 4320-4700 | pillole composer (modello, ambiente, usage, permessi), stato run, coda, tastiera virtuale |
| 4700-5800 | conversazione reale: task start/follow-up con etichetta permessi, banner coda, attesa risposta, bolle, batch di tool, note di stato, artefatti, approvazioni, review |
| 5790-6070 | terminale reale (xterm, WS, tema, resize), browser in-app, shell diretta |
| 6070-6560 | diff, trascrizione markdown, export, review reale (simboli dichiarati/spariti) |
| 6560-7630 | impostazioni desktop (aspetto, tema, motion, sfondo animato, preferenze chat, workspaces, localStorage), albero file reale (lazy, menu azioni, drag, filtro, puntini stato) |
| 7631-8130 | `handleRealEvent` (i 22 eventi) |
| 8124-8720 | sessione: `collegaEventiSessione`, start/stop/redirect/fork/resume/queue/compact, impostazioni, selezione multipla, `mantieniFondoDuranteRipristino`, `passaASessione` |
| 8720-9030 | elenco sessioni reali, automazioni (widget + sheet nuova) |
| 9029-9640 | workspace chooser (albero `C:\`, scorciatoie, nuova cartella, tastiera, focus trap) |
| 9637-10150 | nuova sessione (launcher Windows, pendente, `startCustomSession`, `submitPrompt`), export/share |
| 10151-10260 | voce (riconoscimento + lettura ad alta voce) |
| 10261-10760 | command palette (27 comandi: annotate, back, browser, cerca, compact, control, copy, dashboard, elenca, export, fork, forward, leggi, naviga, new, open, permissions, prova, rename, resume, review, scrivi, share, shell, skills, terminal, tree) |
| 10760-11120 | layout host, resize pannelli, badge coda download, ripresa ultima sessione all'avvio |

Viste: `chat`, `dashboard`, `terminal`, `automations`, `settings`, `browser`, `diff`. Inspector: `context`, `files`, `agents`. Debug esposti: `window.talosStreamingLog()`, `talosStreamingLogRiassunto()`, `talosLatenzaRisposta`, `__talosHarnessUiLab/UiRuntime/Destroy`. localStorage: 5 chiavi (impostazioni, sezione settings, notifiche, larghezze pannelli, dimensioni modali).

### 6.2 Settings (8 sezioni, list-detail, full width)

Interfaccia e movimento (Design, Movimento dello sfondo, Animazioni, Chrome desktop) · Modelli, provider e runtime (capacità macchina, runtime locale, provider, catalogo API, installati, Hugging Face, download) · Chat e composer · Strumenti agente e permessi · Privacy e dati locali · File e workspace · Account, Doctor e backup · Comandi TALOS.

### 6.3 `styles.css`

`:host` al posto di `:root` (gira anche in shadow root dentro il mobile), 79 token, tema chiaro/scuro, reduced-motion, breakpoint 1280/1180/1040/780/720/430/360 + container query `settings-detail`, banner di fase (8A Aspetto, V6-V14 QA visiva, FASE J voce, P1 Model Lab, session graph).

## 7 — Frontend modulare (`harness-ui/frontend/`) — NON in produzione

Toolchain: esbuild 0.28.2 (pin), Playwright 1.62.1, axe-core, pixelmatch; dipendenze `@floating-ui/dom`, `@tanstack/virtual-core`. Sorgenti: `app/` (application, bootstrap, effect-scope, route-controller, workspace-layout), `contracts/` (api-client, host-bridge, persistence, routes, session-events, session-stream, terminal-protocol, terminal-transport), `design-system/` (badge, button, menu-button, sheet, switch, tabs, tooltip, token-contract, floating-position), `state/` (store, reducer, actions, selectors, invariants), `ui/` (component, dom, focus-manager, keyed-list, overlay-manager, shortcut-manager, virtual-list, announcement-region), `styles/` (tokens, reset, primitives). Fixture `legacy-contract.snapshot.json` = contratto del monolite (si rigenera a ogni tocco di app.js/styles/index).

Tabella di marcia (piano 01/09): Fase 1 fondazioni ✅ · 2 stato/lifecycle ✅ · **3 design system in corso** · 4 shell · 5 conversazioni · 6 repository/review · 7 terminale/browser/artefatti · 8 management · 9 UI Lab e gate · 10 cutover strangler + installer. Decisione: ESM senza framework, Vue differito, Vite «adapt» sul manifest.

## 8 — Verifica: test e QA

- **Backend:** `node --test harness-ui/tests/*.test.mjs` (82 file; oggi 1.343/1.343).
- **Frontend modulare:** `npm run verify` in `harness-ui/frontend` (unit + contract + build + lab browser; 200/200 oggi).
- **Mobile harness unit:** `npx vitest run tests/unit/harness/` da `mobile/` (richiesto dal prompt del batch, non di mia ownership).
- **QA visiva:** `scripts/qa-visual-pipeline.mjs` — Chrome dedicato via CDP (mai la 9333), scenari `SCENARI` (oggi aggiunti: pillola modello dopo Nuova, scroll sessione e streaming, permessi cambiati da fuori, cursore streaming), flag anti-throttling, report in `.qa-runs/` (227 corse); `qa-chrome.ps1` per i sei stati canonici.
- **Artefatti:** `frontend/artifacts/` per fase (phase-01..03, p0-lag, review 02/09 con e senza GPU, gate Qwen reale).
- **Hook di sessione Claude** (`.claude/hooks`): cancelli, mai-push, mai-perdere-lavoro, non-fermarti, typecheck-vero, verifica-prima-di-chiudere, dopo-la-compattazione (PreToolUse, Stop, SessionStart).

## 9 — Documenti autoritativi (dove guardare prima di decidere)

- **Piano:** `PIANO-COMPLETO-DESKTOP-2026-08-31.md` (601 righe, aggiornato 02/09) e `LEDGER-TABELLA-DI-MARCIA-DESKTOP-2026-08-30.md`.
- **Per fase (28-31/8):** `LEDGER-FASE-A-HOOKS`, `B-PERMESSI`, `C-SUBAGENTI`, `D-CODA`, `0..10` (baseline competitiva, compact/loading, settings, turn-limit, delega, anti-fabbricazione, sessione senza cartella, settings desktop, 8A aspetto, 8B/8C model lab e runtime locale, 9 conformance, 10 HF download), `PROVIDER-API-KEY`, `FULL-ACCESS-ROOT`, `TERMINALE-REALE`, `BOARD-SESSIONI`, `RAGGRUPPAMENTO-TOOL-CALL-DIFF`.
- **01/09:** `FRONTEND-PHASE0/1/2/3`, `WORKSPACE-CHOOSER`, `MODALI-FILE-EXPLORER`, `SESSION-RECOVERY`, `ATTIVITA-RISPOSTA`, `OPENROUTER-RESILIENZA`, `CICLO-RUN`, `BOOT-WATCHER`, `DESCRIZIONI-COMANDI`, `OPEN-WITH-TALOS-WINDOWS`, `LAG-DESKTOP`, `TEMA-CHIARO`, `P0-UX`, `REMEDIATION-ZIP`.
- **02/09:** `CONSEGNA-REVIEW-COMPLESSIVA`, `LEDGER-STREAMING-SCROLL-TERMINALE` (batch di oggi), `LEDGER-RUNTIME-OWNER-MODULE`, `LEDGER-RESTORE-SILENZIOSO-16-SESSIONI`, `LEDGER-BUNDLE-CANONICO-DIVERGENTE`, `DOSSIER-RICERCA-RESILIENZA-SERVER`, `DOSSIER-RICERCA-WATCHER-COMPETITOR`, `REVIEW-ESTERNA-MOBILE`.
- **Baseline competitiva:** `LEDGER-FASE-0-BASELINE-COMPETITIVE-2026-08-30.md` (Claude Code, Codex, Hermes) e `CENSIMENTO-SUPERSET-35-RIGHE.md`.

## 10 — Stato: chiuso e aperto (al 02/09 sera)

**Chiuso e verificato dal vivo** (non si ricostruisce): chat reale con streaming/ragionamento/tool lifecycle, approvazioni, coda e Reindirizza, fork/resume/compact, persistenza sessioni + recupero al riavvio (23 scenari), terminale PTY, review/diff reali, browser in-app, artefatti, documenti e immagini, hook/MCP/skill/plugin, i sei sistemi (thin slice per Ricerca), automazioni, Doctor, Settings 8 sezioni + Aspetto A01-A35, Model Lab completo (provider con segreti server-side, HF, download, GGUF, llama.cpp/Ollama/LM Studio), Full access su `C:\` col watcher sicuro, workspace chooser + modali resize + command bar, «Apri cartella con TALOS», resilienza OpenRouter e hot-swap auditabile, lag (watcher e sfondo), descrizioni comandi, e il batch di oggi (scroll, streaming fluido, cursore/fade, permessi del giro visibili, nomi sessione persistenti).

**Aperto, registrato, in attesa di decisione owner:**
1. Sedici file sessione non ripristinati al riavvio (7/23 caricati).
2. Sonde di altre sessioni sul server vivo 4174 → regola + eventuale validazione ID modello in `/settings`.
3. Frontend modulare: Fase 3 in corso, 4-10 da fare; il monolite resta la UI prodotto.
4. `NAV-CAPABILITY-FIRSTCLASS-01`: Libreria/Memoria/Note/Attività/Ricerca come righe sidebar di prima classe (Fase 4).
5. `RESEARCH-MOBILE-PARITY-01`: Ricerca desktop senza pianificazione event-sourced, verifica indipendente, citazioni.
6. `MESSAGE-ACTIONS-6.3B` (azioni per messaggio, Fase 5).
7. Debiti trasversali: voce Explorer in «Mostra altre opzioni», catalogo task preset col provider owner, warning CSP xterm, gate reale Full access su radice intera, contrasto tema chiaro/header compresso/capability modal, composer rail a 1024×800.
8. Review 02/09: degradare senza GPU (sonda rAF), workspace = Desktop come radice logica, mockup Review/Browser/campanella + 10 difetti visivi in batch, ponte `adb reverse` (DEC-053), bundle mobile stantio.
9. Piccoli: sottotitolo header «premi Nuova» con sessione aperta, riga attiva sidebar su sessione pendente, meta «TALOS · concluso» sulla nota impostazioni, 8 s di finestra nascosta al ripristino di sessione interrotta.
11. **Nuovo, trovato oggi mappando:** «Annulla» della prova runtime nel Model Lab chiama `POST /sessions/:id/cancel`, rotta inesistente (il backend ha solo `/stop`): la prova continua sul server (§3).
10. Differite e condizionate: FreeToken (adapter MoE NVIDIA), Vue.

## 11 — Punti d'innesto per una funzione nuova (per il confronto con la zip)

| Se la zip propone… | Si innesta in… |
|---|---|
| un attrezzo nuovo dell'agente | kernel (`ATTREZZI_ESTESI`, `SICUREZZA_PER_ATTREZZO`) — repo `AVM-harness`, non di mia ownership: si registra, non si scrive |
| un attrezzo lato desktop senza toccare il kernel | `agent-service.mjs` (capacità/forge) + `forge-contract.mjs`, oppure un server MCP |
| un evento nuovo verso la UI | `agui-events.mjs` → `session-registry.mjs` (buffer + JSONL) → `handleRealEvent` in app.js |
| una rotta nuova | `http-app.mjs` (+ `API_ERROR_CODES`) + test `tests/http-routes-*.test.mjs` |
| una vista/pannello nuovo | oggi: `index.html` + `setView`/`openPanel` in app.js + styles; domani: `frontend/src/app/route-controller.js` (Fase 4) |
| una sezione impostazioni | `setSettingsSection`, `renderSettingsRiepiloghi`, id `settings*Panel` |
| un comando | `executeCommand` (palette) + `data-command` in index.html |
| una persistenza per sessione | riga JSONL tipizzata in `session-registry.mjs` + `ripristina()` |
| un provider/runtime | `provider-credential-store.mjs`, `openai-compatible-runtime.mjs`, contratto `local-runtime-contract.mjs` |
| una verifica visiva | scenario in `SCENARI` di `qa-visual-pipeline.mjs` o spec Playwright in `frontend/tests/browser` |
