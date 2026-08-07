# Talos vs un agente di terze parti
## Analisi tecnica della piattaforma Hermes e piano di parità/sorpasso per Talos

**Tipo documento:** Competitive technical teardown + product/system architecture plan  
**Snapshot delle fonti:** 2026-08-07  
**Target Talos assunto:** Android-first, Capacitor 8 + Vue 3 + Tailwind 4, WebView Chromium, supporto a modelli locali, evoluzione verso runtime nativo/Qualcomm HTP-NPU, offline-first  
**Ambito:** parità tecnica, visiva e funzionale con un agente di terze parti; identificazione dei punti di forza da replicare come capability e dei punti deboli da evitare/superare  
**Nota metodologica:** questo documento analizza documentazione ufficiale, repository `NousResearch/hermes-agent` su `main`, guide di engineering presenti nel repository e una selezione di issue GitHub. Le issue sono trattate come *field report*, non come prova che un difetto affligga ogni installazione.

---

# 0. Executive summary

un agente di terze parti non è semplicemente una chat con tool calling. È diventato un **agent operating environment** composto da:

- core agentico multi-provider;
- registry di circa 82 tool built-in più tool MCP dinamici;
- skill system modificabile dall'agente;
- memoria persistente e provider di memoria esterni;
- sessioni ricercabili e riassumibili;
- compressione del contesto;
- terminale, file editing e LSP;
- browser automation e computer use;
- cron, persistent goals, hooks, batch e code execution;
- delegazione e Kanban multi-agent;
- messaging gateway con oltre venti adapter/superfici;
- provider routing, fallback e credential pools;
- Mixture of Agents;
- voice/STT/TTS, vision, image/video generation;
- MCP e ACP;
- API HTTP OpenAI-compatible;
- CLI, TUI, dashboard web ed Electron Desktop;
- progetti, profili, worktree, checkpoint/rollback;
- plugin e context-engine extensibility.

La minaccia competitiva è quindi la **larghezza della piattaforma**, non una singola UX feature.

Talos non deve rispondere copiando feature una alla volta. Deve costruire una base più coerente che renda economico aggiungerle. La tesi di questo documento è:

> Hermes ottiene breadth attraverso un runtime Python molto esteso e un ecosistema di processi/adapter. Talos può raggiungere la parità costruendo una piattaforma capability-oriented ed event-sourced, e può superarlo sfruttando ciò che Hermes non può ottimizzare facilmente senza ristrutturazione: mobile-native execution, NPU locale, memoria lossless/retrieval-first, permissions a capability, tool scoping forte, orchestration leggera, UX unificata e budget-aware scheduling.

Il vantaggio più difendibile per Talos non sarebbe avere “più tool”, ma offrire simultaneamente:

1. **on-device local-first reale**;
2. **NPU/HTP aware inference**;
3. **offline completo**, non solo endpoint locale opzionale;
4. **memoria strutturata, versionata e interrogabile**, non una stringa bounded nel prompt;
5. **contesto lossless/event-sourced** con materializzazione selettiva invece di distruzione tramite summarization;
6. **tool registry project-scoped e capability-scoped**;
7. **plugin isolati e permissioned** invece di codice Python in-process full-trust;
8. **multi-agent actor-based**, non un OS process per worker come primitive principale;
9. **UI tablet/mobile first** che mantiene chat, artifacts, files, tasks e agent activity utilizzabili mentre il modello satura CPU/NPU;
10. **scheduler condiviso tra inference, agent tools e renderer**, così la responsività UI diventa un KPI del runtime.

Il piano consigliato è composto da tre livelli:

```text
PARITÀ FONDAMENTALE
sessions + projects + tools + skills + memory + providers + MCP
+ file/terminal + browser + automation + desktop/tablet workbench

          ↓

PARITÀ AGENTICA
context engine + delegation + goals + cron + checkpoints
+ LSP + code execution + messaging + provider resilience

          ↓

SORPASSO
local NPU + lossless context + structured memory ledger
+ semantic capability routing + secure plugin sandbox
+ event-sourced orchestration + adaptive mobile QoS
+ explainable provenance + local multimodal pipeline
```

---

# 1. Metodo di analisi e livelli di evidenza

Ogni finding viene classificato implicitamente in uno dei seguenti livelli.

| Livello | Significato |
|---|---|
| **D — Documented** | comportamento dichiarato nella documentazione ufficiale Hermes |
| **R — Repository verified** | struttura, contratto o dimensione verificabile nel repository pubblico |
| **I — Issue report** | comportamento riportato in una issue; non necessariamente generale |
| **A — Architectural inference** | rischio/opportunità dedotta da struttura e trade-off osservabili |
| **T — Talos proposal** | proposta progettuale per Talos |

Regola importante: una issue aperta non viene descritta come vulnerabilità o bug universale. È una sorgente utile per individuare classi di failure che un concorrente può progettare diversamente.

---

# 2. Snapshot di Hermes: quanto è grande realmente la superficie

## 2.1 Entry point

La documentazione di architettura Hermes mostra più entry point che convergono nello stesso `AIAgent`:

```text
CLI
Gateway
ACP
Batch Runner
API Server
Python Library
     │
     └──────► AIAgent (run_agent.py)
```

Il core poi coordina:

- prompt builder;
- provider resolution;
- tool dispatch;
- compression/caching;
- tre famiglie principali di API/model runtime;
- registry tool;
- session state.

**Finding R:** la pagina GitHub di `run_agent.py` su `main` riporta **8.167 righe, 7.368 LOC, 365 KB**. La documentazione ufficiale lo identifica ancora come nodo centrale di `AIAgent`.

Questo non prova scarsa qualità del codice. Dimostra però un'importante proprietà competitiva: Hermes ha un **centro gravitazionale molto grande**. La complessità di integrazione di provider, loop, context, strumenti e sessioni tende quindi a convergere in un componente ad alto blast radius.

### Opportunità Talos

Talos dovrebbe imporre fin dalla prima architettura un limite strutturale:

```text
AgentKernel
 ├─ Planner/Loop
 ├─ ContextMaterializer
 ├─ ToolRouter
 ├─ ProviderRouter
 ├─ SessionLedger
 └─ Scheduler
```

Nessuno di questi moduli dovrebbe conoscere direttamente UI, Android, QNN, MCP o storage concreto.

---

# 3. Feature map completa di Hermes

La seguente mappa è l'inventario competitivo da usare come backlog di parità.

## 3.1 Core conversational/agent

- streaming response;
- reasoning visibility/configuration;
- model switching in-session;
- retry;
- undo;
- stop/cancel;
- session status;
- usage/tokens/cost insights;
- auto-title delle sessioni;
- session resume;
- session lineage;
- full history persistence;
- cross-session search FTS5;
- context compression;
- prompt caching;
- project context files;
- SOUL/personality;
- persistent memory;
- external memory providers;
- skill progressive disclosure;
- tool progressive disclosure;
- goal continuation;
- subagent delegation;
- Mixture of Agents.

## 3.2 Developer-agent surface

- terminal execution;
- background processes;
- PTY;
- local/Docker/SSH/Singularity/Modal/Daytona/Vercel sandbox backends;
- file read/write/search/patch;
- diff output;
- syntax checks;
- LSP diagnostics;
- git worktrees;
- project workspaces;
- checkpoint/rollback;
- browser automation;
- browser console/CDP;
- computer use;
- code execution that invokes tools programmatically;
- artifacts/file previews;
- terminal pane;
- review pane;
- file browser.

## 3.3 Automation/orchestration

- cron;
- no-agent script cron mode;
- persistent goals;
- background prompts;
- delegate_task;
- parallel delegates;
- Kanban durable multi-agent dispatcher;
- dependencies/blocked tasks;
- task comments;
- attachments;
- heartbeats;
- event hooks;
- batch processing;
- outbound webhooks.

## 3.4 Extensibility

- built-in tools;
- toolsets;
- MCP stdio;
- MCP HTTP;
- OAuth MCP;
- MCP mTLS;
- tool include/exclude filtering;
- dynamic MCP tool-list refresh;
- deferred tool search;
- plugins;
- provider plugins;
- memory provider plugins;
- context engine plugins;
- image/video backend plugins;
- skills;
- skill hub;
- skill self-creation;
- skill curator;
- ACP server;
- OpenAI-compatible API server;
- Python library.

## 3.5 Messaging/distribution

Hermes documenta supporto/adapters per una superficie che include:

- Telegram;
- Discord;
- Slack;
- Google Chat;
- WhatsApp;
- WhatsApp Cloud API;
- Signal;
- SMS;
- Email;
- Home Assistant;
- Mattermost;
- Matrix;
- DingTalk;
- Feishu/Lark;
- WeCom;
- Weixin;
- BlueBubbles/iMessage;
- Photon/iMessage;
- QQ;
- Yuanbao;
- Microsoft Teams;
- LINE;
- ntfy;
- Raft;
- IRC;
- Buzz;
- SimpleX;
- webhook/browser/API/ACP surfaces.

Le capability per adapter variano: voce, immagini, file, thread, reactions, typing e progressive streaming.

## 3.6 Multimodal/media

- clipboard image paste;
- vision native o auxiliary model fallback;
- browser screenshots + vision;
- image generation;
- image editing depending on provider;
- video generation;
- video edit/extend provider-specific;
- video analysis;
- microphone mode;
- voice activity/silence detection;
- local/cloud STT;
- TTS multiprovider;
- Telegram/Discord voice messages;
- Discord voice channel full loop;
- wake word;
- media delivery to messaging platforms.

## 3.7 Provider/fault tolerance

- large model-provider matrix;
- direct providers;
- OpenRouter/Nous routing;
- sort by price/throughput/latency;
- allow/deny provider list;
- parameter support enforcement;
- provider data-collection preference;
- fallback chain;
- per-turn fallback;
- auxiliary provider routing;
- credential pools;
- custom OpenAI-compatible endpoints;
- local LM Studio/custom endpoint;
- provider-specific auth/OAuth;
- MoA with reference models + aggregator.

## 3.8 Management surfaces

- CLI;
- TUI;
- web dashboard;
- Electron Desktop;
- onboarding/setup;
- model picker;
- profiles;
- project switcher;
- sessions;
- skills manager/editor;
- messaging manager;
- cron manager;
- MCP manager;
- plugins manager;
- config/env views;
- files;
- logs;
- analytics/insights;
- system view;
- webhooks;
- command center;
- agents/starmap surfaces in Desktop design vocabulary.

---

# 4. Hermes Desktop: perché è un benchmark visuale serio

Hermes Desktop non è una WebView del dashboard. Il repository lo descrive come una surface separata:

```text
Electron = machine authority
React renderer = experience authority
Agent backend = agent/session/tool authority
```

Il backend headless comunica via gateway/JSON-RPC/WebSocket; il renderer non dovrebbe accedere direttamente a Node/Electron. Questa separazione è buona e va replicata concettualmente in Talos.

## 4.1 Principi di design Hermes verificati nel repository

`apps/desktop/DESIGN.md` definisce:

- **flat, not boxed**;
- niente card dentro card;
- elevation borderless con shadow/hairline;
- un primitive per concern;
- design token invece di literal;
- intent before automation;
- feedback immediato, persistence dopo;
- Chat come home;
- Skills, Messaging, Artifacts come pagine durevoli;
- Settings/Command Center/Cron/Profiles/Agents/Starmap come route overlay;
- Preview/files/review/terminal come pane di lavoro;
- project come authority del cwd;
- background events non devono spostare focus;
- motion funzionale circa 100 ms;
- `prefers-reduced-motion` rispettato;
- niente `transition-all` su hot interaction;
- niente `backdrop-filter` come cerotto prestazionale;
- hot state locale/narrow;
- pointer work coalesced per frame;
- expensive stateful surfaces possono rimanere mounted se nascoste;
- keyboard ownership per focus;
- `Esc` = una sola azione;
- i18n almeno en/ja/zh/zh-hant;
- shared state tramite nanostore stretti;
- reference identity preservata.

Questa è una delle aree più mature di Hermes. Talos non deve banalizzarla come “fare una sidebar simile”.

## 4.2 Talos: parità visuale senza clonare Hermes

Talos dovrebbe adottare gli stessi **principi di product ergonomics**, ma una grammatica propria.

### Information architecture Talos consigliata

```text
┌────────────────────────────────────────────────────────────────────┐
│ Talos top chrome: workspace · model · device · thermal · actions   │
├──────────┬────────────────────────────────────┬────────────────────┤
│ Nav rail │              Chat                  │ Workbench          │
│          │                                    │                    │
│ Chats    │  transcript                        │ Artifact           │
│ Projects │  reasoning                         │ Files              │
│ Tasks    │  tools                             │ Browser            │
│ Skills   │                                    │ Terminal           │
│ Memory   │                                    │ Diff/Review        │
│ Connect  │                                    │ Agent activity     │
│          │  composer                          │                    │
├──────────┴────────────────────────────────────┴────────────────────┤
│ status: backend / tok/s / context / memory / offline / thermal    │
└────────────────────────────────────────────────────────────────────┘
```

### Responsive tablet/mobile

```text
>= 1200dp: rail + chat + workbench
840–1199dp: collapsible rail + chat + optional workbench
600–839dp: chat + slide-over workbench
< 600dp: single surface; workbench is route, not simultaneous pane
```

Talos ha un vantaggio: può progettare questa IA per touch fin dall'inizio, mentre Hermes Desktop è desktop-first e Termux è un percorso Android Tier 2.

---

# 5. Chat surface: requisito di parità

## 5.1 Transcript

Deve supportare nativamente:

- user/assistant/system/tool event;
- reasoning collapsibile;
- streaming;
- tool activity inline;
- tool progress;
- approval cards;
- clarify cards;
- attachments;
- artifacts;
- code block actions;
- citations;
- status/usage;
- retry/branch;
- undo;
- reaction opzionale;
- stop.

### Talos: evitare transcript come array di stringhe

Definire un event model tipizzato:

```ts
export type ConversationEvent =
  | UserMessageEvent
  | AssistantTextEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolResultEvent
  | ApprovalEvent
  | ArtifactEvent
  | CheckpointEvent
  | ContextCompactionEvent
  | AgentDelegationEvent
  | UsageEvent
  | ErrorEvent;
```

Il transcript visuale è una **projection** dell'event log, non la sorgente di verità.

Questo permette:

- rollback visuale;
- audit;
- export;
- replay;
- recovery;
- branching;
- context materialization differente dalla UI.

Hermes memorizza full message history e tool calls in SQLite; Talos deve fare un passo ulteriore e rendere gli eventi first-class, non solo messaggi OpenAI-shaped.

---

# 6. Composer: parità e sorpasso

## Hermes-like parity

- multiline;
- slash commands;
- model picker;
- reasoning selector;
- attachments;
- image paste;
- voice input;
- stop/retry;
- skill invocation;
- project context.

## Talos overtake

Aggiungere una **Context Bar** esplicita prima dell'invio:

```text
[Model: Qwen-local] [Project: talos] [3 files] [2 memories] [Skill: review]
[Offline] [NPU] [Context 41%]
```

Tap apre la materializzazione reale che il modello vedrà.

Questo risolve un problema tipico degli agenti: il sistema è potente ma il user non sa **quale contesto e quali authority** verranno applicati.

### Context preview

```json
{
  "identity": ["persona:default"],
  "project_rules": ["AGENTS.md"],
  "selected_files": ["src/foo.ts"],
  "retrieved_memory": ["mem_271", "mem_341"],
  "active_skills": ["code-review@4"],
  "tools": ["file.read", "file.patch", "terminal.exec"],
  "model": "local:qwen",
  "estimated_tokens": 13214
}
```

Questo è un vantaggio UX e di debug.

---

# 7. Tool system Hermes

La reference ufficiale documenta circa **82 built-in tools**, oltre agli MCP tool dinamici.

Categorie principali:

- browser: 10 core + 2 CDP gated;
- file: 4;
- terminal/process: 2;
- Home Assistant: 4;
- desktop UI: 6;
- web: 2;
- Feishu: 5;
- Spotify: 7 via plugin;
- Yuanbao: 5;
- Kanban: 12;
- project: 3;
- Discord: 2 superfici principali;
- video generation: 3;
- tool standalone: memory, clarify, delegate, execute_code, cron, session_search, skills, TTS, image, vision, video analysis, todo, computer_use, X search.

## 7.1 Toolsets

Hermes usa toolsets per evitare di presentare ogni tool a ogni surface. I toolset possono essere platform-specific e possono includere MCP dinamici.

Questa è una scelta corretta.

## 7.2 Tool Search

Hermes ha introdotto progressive disclosure per MCP/plugin tools:

```text
Tier 0: catalogo piccolo → eager
Tier 1: manifest nomi/descrizioni entro budget
Tier 2: catalogo enorme → server summary + search
```

Bridge:

```text
tool_search(query)
tool_describe(name)
tool_call(name,args)
```

La ricerca usa BM25 su nomi/descrizioni/parameter names con substring fallback; la documentazione descrive budget di listing con default circa 5% context e cap 4.000 token.

### Punti forti

- riduce tool-schema tax;
- adatto a MCP enormi;
- evita invio di migliaia di schema completi;
- tool search resta provider-independent.

### Punti deboli/opportunità

1. **Core tools eager.** La progressive disclosure non elimina il costo dei tool considerati core.
2. **BM25 non comprende realmente intent/capability.** È rapido e locale, ma semantica e policy restano separate.
3. **Cold tool = round trip addizionale.** Il modello cerca, descrive e poi invoca.
4. **Modelli piccoli possono scegliere peggio.** Lo ammette la stessa documentazione.
5. **Toolset mutation può invalidare prompt cache.** Ogni variazione della superficie può modificare il prefisso.
6. **Project scoping MCP non è pienamente risolto.** Una issue aperta del 2026 chiede explicit project-scoped MCP perché tool globali possono comparire in progetti non pertinenti.

## 7.3 Talos Tool Graph

Talos dovrebbe usare un registry più ricco:

```rust
struct ToolDescriptor {
    id: ToolId,
    version: SemVer,
    capabilities: Vec<Capability>,
    scopes: Vec<Scope>,
    risk: RiskClass,
    latency: LatencyClass,
    cost: CostClass,
    offline: bool,
    schemas: SchemaRef,
    embedding: Option<VectorRef>,
}
```

Tool discovery a due stadi:

```text
1. deterministic capability filter
   project + permissions + offline + platform + risk

2. retrieval rank
   lexical BM25 + local embedding + historical success
```

Quindi il modello **non vede mai** un tool che non dovrebbe poter usare.

Questo è superiore a:

```text
retrieval → poi policy
```

perché riduce sia token sia attack surface.

---

# 8. Tool permission model Talos

Definire capability concrete:

```text
fs.read:project
fs.write:project
fs.read:user-selected
shell.exec:sandbox
shell.exec:host
network:https:github.com
network:any
browser.local
browser.remote
secret.read:github
calendar.write
message.send:telegram
```

Ogni tool dichiara requirement.

```json
{
  "tool": "terminal.exec",
  "requires": [
    "shell.exec:sandbox",
    "fs.write:workspace"
  ]
}
```

Ogni sessione possiede un capability lease:

```json
{
  "session": "s_123",
  "grants": [
    {"cap":"fs.read:project", "mode":"allow"},
    {"cap":"fs.write:project", "mode":"ask"},
    {"cap":"network:any", "mode":"deny"}
  ]
}
```

### Sorpasso rispetto al trust model plugin Hermes

La SECURITY policy Hermes dichiara esplicitamente che i plugin girano **nel processo dell'agente con privilegi completi**, possono leggere le stesse credenziali, registrare hook e importare moduli; il boundary è l'operator review.

Talos dovrebbe invece fare:

```text
plugin package
     ↓ signature/hash
WASM / isolated native service
     ↓ capability broker
Talos Tool RPC
```

Nessun plugin third-party dovrebbe ricevere implicitamente tutte le credenziali del processo.

---

# 9. File editing e coding ergonomics

Hermes offre:

- `read_file` con line numbers/pagination;
- `search_files` ripgrep-backed;
- `write_file`;
- `patch` fuzzy con diff;
- syntax check automatico;
- LSP post-write;
- terminal/process;
- checkpoint optional;
- worktrees;
- preview/review/terminal pane.

## 9.1 LSP Hermes

La documentazione LSP descrive:

- pyright;
- TypeScript/JavaScript;
- Vue;
- Svelte;
- Astro;
- gopls;
- rust-analyzer;
- clangd;
- bash;
- YAML;
- Lua;
- PHP e altri;
- baseline diagnostics prima della scrittura;
- re-query dopo edit;
- visualizzazione dei soli nuovi errori;
- failure del language server non blocca la scrittura;
- auto-install di server noti;
- attivazione focalizzata sui git repo.

### Hermes strength

Il pattern “new diagnostics only” è ottimo: evita di attribuire all'agente debito tecnico preesistente.

### Talos parity

Implementare un `CodeIntelligenceService` separato:

```text
FileMutation
   │
   ├─ parse/syntax gate
   ├─ baseline diagnostic snapshot
   ├─ write transaction
   ├─ LSP incremental update
   └─ diagnostic delta
```

### Talos overtake

Usare il delta LSP come **commit gate configurabile**:

```yaml
code_policy:
  new_errors: block
  new_warnings: warn
  typecheck_timeout_ms: 3000
```

Hermes tende a non bloccare su LSP flaky. Talos può mantenere quel comportamento come default, ma consentire policy forti per progetti CI-critical.

---

# 10. Terminal execution

Hermes ha una superficie molto matura:

```text
local
docker
ssh
singularity
modal
daytona
vercel_sandbox
```

con process management background e PTY.

## Talos: mobile-first terminal architecture

Android non deve tentare di replicare Docker localmente come requisito base.

Separare:

```text
ExecutionTarget
 ├─ AndroidLocalRestricted
 ├─ AndroidProotOptional
 ├─ SSHRemote
 ├─ ContainerRemote
 ├─ CloudSandbox
 └─ DesktopCompanion
```

### API

```ts
interface ExecutionTarget {
  id: string
  capabilities: ExecutionCapabilities
  exec(req: ExecRequest): Promise<ProcessHandle>
  readFile(req: ReadRequest): Promise<Uint8Array>
  writeFile(req: WriteRequest): Promise<void>
}
```

La UI e l'agent loop non devono distinguere SSH da local.

### Advantage Talos

Su tablet, un **desktop companion daemon** permette:

```text
Talos Android
   │ encrypted local/remote RPC
   ▼
Talos Host Daemon (Mac/Linux/Windows)
   ├─ git
   ├─ Docker
   ├─ full filesystem
   ├─ LSP
   └─ browser
```

Quindi Talos mantiene UX mobile senza fingere che Android sia un workstation Unix completo.

---

# 11. Browser automation

Hermes supporta più strategie:

- Browserbase cloud;
- Browser Use cloud;
- Firecrawl;
- Camofox locale;
- Chromium-family CDP;
- agent-browser locale;
- accessibility-tree snapshot;
- click/type/press/scroll/back;
- screenshots e vision;
- console;
- raw CDP escape hatch;
- dialog handling;
- session isolation e cleanup;
- hybrid routing public cloud/private local.

È una feature molto forte.

## 11.1 Weakness classes

### Dependency breadth

Ogni backend porta dipendenze e failure mode propri.

Esempio documentato: l'ACP browser bootstrap può installare Node e browser tooling e chiedere un download nell'ordine di centinaia di MB.

### Configuration complexity

La documentazione Camofox mostra casi in cui una configurazione al path YAML sbagliato viene ignorata e la sessione torna ephemeral. Questo è un esempio di **configuration-shaped failure**.

### Desktop assumptions

Il flusso locale browser/CDP è naturalmente più semplice su desktop rispetto ad Android.

## 11.2 Talos Browser Service

Usare un protocollo unico:

```protobuf
service BrowserAgent {
  rpc Navigate(NavigateRequest) returns (PageState);
  rpc Snapshot(SnapshotRequest) returns (AccessibilitySnapshot);
  rpc Act(ActionRequest) returns (ActionResult);
  rpc Screenshot(ScreenshotRequest) returns (ImageRef);
  rpc Evaluate(EvaluateRequest) returns (JsonValue);
}
```

Backend:

```text
Android Custom Tab / isolated WebView automation
Remote Chrome CDP
Desktop companion CDP
Cloud browser provider
```

### Sicurezza

Non usare la WebView privilegiata di Talos come browser agentico per pagine ostili.

Creare una surface separata con:

- nessun Capacitor bridge;
- storage/profile isolato;
- network policy;
- no file URLs;
- no app-native privileged JS interface.

---

# 12. Computer Use

Hermes espone `computer_use` tramite `cua-driver` con screenshot/vision/AX, click, drag, scroll, type e app focus, con l'obiettivo di non rubare cursor/focus.

## Talos parity

Su Android, non tentare una falsa equivalenza desktop.

Definire:

```text
DeviceAutomationBackend
```

con adapter:

- Android Accessibility Service **solo con opt-in forte**;
- desktop companion;
- remote VM/sandbox;
- browser-only safe mode.

### Capability boundary

```text
ui.observe
ui.click
ui.type
ui.open_app
ui.system_navigation
```

Ogni categoria deve poter essere negata separatamente.

---

# 13. Skills: uno dei moat principali di Hermes

Hermes usa `~/.hermes/skills/` come source of truth e formato Agent Skills compatibile.

Capability:

- bundled skills;
- optional/hub skills;
- skill-created-by-agent;
- skill editing/delete;
- `skills_list` metadata;
- `skill_view` progressive loading;
- file/reference/script associati;
- slash command per skill;
- stack di più skill;
- conditional activation/toolset requirement;
- `/learn` da directory, URL, workflow, note, libri/paper;
- distillazione di fonti grandi in SKILL.md + references.

## 13.1 Punto di forza

La distinzione:

```text
skill catalog metadata
       ↓ only if relevant
skill full body
       ↓ only if needed
reference files
```

è corretta per context economy.

## 13.2 Punti deboli strutturali

### Mutable procedural memory

Se l'agente può modificare skill nel tempo, esiste il rischio di:

- drift;
- regression;
- instruction accretion;
- comportamento non riproducibile;
- conflitto tra skill;
- perdita di provenance.

Hermes ha Curator e backup per gestire parte di questo problema, ma il problema fondamentale resta: una procedura è sia **knowledge** sia **executable policy**.

### Trust

La security policy Hermes chiarisce che skill/scripts di terze parti possono eseguire codice e richiedono operator review.

## 13.3 Talos Skill Package v1

Non usare una directory libera come unità logica primaria.

```text
skill.talos/
├── manifest.json
├── instructions.md
├── references/
├── templates/
├── scripts/
└── signature.json
```

Manifest:

```json
{
  "id": "com.talos.skill.code-review",
  "version": "3.2.1",
  "title": "Code Review",
  "requires": ["fs.read:project"],
  "optional": ["shell.exec:sandbox"],
  "network": [],
  "entry": "instructions.md",
  "immutable_revision": "sha256:...",
  "origin": {
    "type": "builtin",
    "source": "talos"
  }
}
```

### Mutazione

L'agente non modifica direttamente revisioni attive.

Fa:

```text
propose patch
   ↓
new revision
   ↓
diff
   ↓
approve / auto-policy
   ↓
activate
```

Questo rende le skill Git-like.

---

# 14. Skill learning e Curator

Hermes Curator gestisce skill agent-created con stati active/stale/archived. La documentazione indica default come controllo settimanale, idle minimo e finestre stale/archive; la consolidazione LLM è opt-in ed è descritta come potenzialmente costosa, anche decine di chiamate.

## Talos overtake: Skill Evolution Ledger

Ogni skill ha metriche:

```json
{
  "invocations": 81,
  "success": 64,
  "user_corrections": 7,
  "abort": 3,
  "mean_tool_calls": 5.2,
  "last_used": "...",
  "models": {
    "local:qwen": {"success": 0.79}
  }
}
```

Il curator non deve “riscrivere perché vecchia”. Deve proporre mutazioni in base a segnali:

- failure clusters;
- user correction;
- repeated manual workaround;
- deprecated tool ID;
- permission mismatch;
- provider/model incompatibility.

### Offline curator

Talos può usare un modello locale piccolo a bassa priorità quando device:

```text
charging && idle && thermal cool
```

oppure fare solo deterministic maintenance senza LLM.

---

# 15. Memory Hermes

Il built-in memory model è volutamente piccolo:

- `MEMORY.md` bounded a circa 2.200 caratteri;
- `USER.md` bounded a circa 1.375 caratteri;
- snapshot inserito nel system prompt;
- agent tool per add/replace/remove;
- nessun auto-compact oltre il limite; serve consolidazione;
- un Hermes home non dovrebbe avere due writer contemporanei;
- external memory provider opzionali.

La documentazione dei profili avverte esplicitamente di non puntare due processi allo stesso home perché le scritture di memoria possono comporsi.

## 15.1 Perché è un punto attaccabile da Talos

Il design bounded-text è semplice e token-efficient, ma mescola:

```text
storage
retrieval
prompt materialization
```

nella stessa cosa.

Un fatto che non entra nei 1.375/2.200 caratteri non è necessariamente irrilevante; può essere rilevante solo in certi task.

## 15.2 Talos Memory Ledger

Separare:

```text
Durable Store
   ↓
Retrieval
   ↓
Context Materialization
```

Schema:

```sql
memory_item(
  id TEXT PRIMARY KEY,
  kind TEXT,
  subject TEXT,
  predicate TEXT,
  object_json TEXT,
  source_event TEXT,
  confidence REAL,
  valid_from INTEGER,
  valid_to INTEGER,
  created_at INTEGER,
  revised_by TEXT,
  sensitivity INTEGER,
  project_scope TEXT,
  user_scope TEXT
)
```

FTS + embedding locale:

```text
query intent
  ├─ exact structured lookup
  ├─ FTS lexical
  └─ vector ANN
        ↓
re-rank
        ↓
policy/scope filter
        ↓
context snippets
```

### Memory revision, non overwrite

```text
mem_14 v1: editor = vim
mem_14 v2: editor = neovim
```

Non cancellare silenziosamente v1: marcarlo superseded.

### Contradiction detection

```text
new fact
  ↓
retrieve same subject/predicate
  ↓
conflict?
  ├ no → insert
  └ yes → ask / confidence rule / version
```

---

# 16. External memory providers Hermes

Hermes supporta diversi provider esterni, fra cui Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover, Supermemory. Il built-in resta attivo e un external provider può aggiungere context/retrieval/tools.

## Punto debole

La potenza aumenta, ma anche:

- dipendenza cloud/vendor per alcuni provider;
- doppio livello di memoria;
- possibilità di duplicati/contraddizioni;
- privacy boundary aggiuntivo;
- sync lifecycle;
- solo un provider esterno attivo alla volta nel modello documentato.

## Talos

Definire un `MemoryFederationLayer`:

```text
local durable memory  ← authority default
        │
        ├─ remote enterprise memory
        ├─ project knowledge
        └─ personal cloud sync
```

Ogni result conserva provenance:

```json
{
  "value": "...",
  "source": "local|remote|project",
  "trust": 0.94,
  "timestamp": 1786090000
}
```

Il materializer può preferire local/private e consultare remoto solo se consentito.

---

# 17. Sessioni Hermes

Hermes salva ogni conversazione in SQLite `state.db` con:

- ID;
- source platform;
- user ID;
- titolo;
- model/config;
- system prompt snapshot;
- full message history;
- tool calls/results;
- token counts;
- timestamp;
- parent lineage.

FTS5 supporta session search.

Supporta inoltre:

- resume last/by id/by title;
- cwd restore;
- workspace filtering;
- compact recap;
- cross-platform handoff;
- auto-title 3–7 parole tramite auxiliary model;
- export JSONL;
- Markdown/QMD;
- self-contained HTML;
- trace format;
- redaction;
- pruning;
- DB optimize.

Questa è una feature set da considerare **parità P0/P1**, non nice-to-have.

## Talos Session Ledger

Usare:

```sql
session
conversation_event
artifact
branch
checkpoint
usage_sample
context_materialization
```

Non salvare soltanto un JSON messages array.

### Branching

```text
S0
 ├─ branch A
 │    └─ regenerate
 └─ branch B
```

Ogni branch punta a event parent.

### Cross-device

Event IDs devono poter diventare globalmente unici:

```text
ULID / UUIDv7
```

per consentire sync futura senza riscrittura.

---

# 18. Context management Hermes

Hermes documenta un sistema duale:

- Gateway hygiene come safety net ad alta occupazione;
- Agent ContextCompressor come sistema normale;
- pruning di old tool results;
- preserved head/tail;
- summary strutturato del middle;
- context-engine plugin sostituibile;
- prompt caching.

La documentazione attuale descrive default e override model-specific e differenze per runtime Codex.

## 18.1 Weakness critica: lossy compression failure semantics

La documentazione ufficiale afferma che, se il modello di summarization non ha contesto sufficiente o la generazione fallisce, `_generate_summary()` può restituire `None`; il compressor può quindi rimuovere middle turns senza un summary utile.

Issue storiche/recenti riportano precisamente failure di questa classe, inclusi context loss e casi di long session che esauriscono comunque la finestra.

Questa è una **opportunità enorme per Talos**.

## 18.2 Talos non deve comprimere lo storage

Principio:

> Il context window è una cache/materialized view. Non è il database.

Il raw event log resta immutabile.

```text
Event Ledger (lossless)
        │
        ▼
Context Planner
   ├─ latest raw turns
   ├─ exact referenced events
   ├─ structured task state
   ├─ memory retrieval
   ├─ tool-result digest
   └─ summaries
        │
        ▼
Model Context
```

Se un summary fallisce:

```text
NON cancellare nulla
```

Ridurre invece la materializzazione:

1. prune derived/display-only data;
2. sostituire tool payload con artifact pointer;
3. retrieval delle sole parti rilevanti;
4. segment summaries già cached;
5. se ancora troppo grande, richiedere nuova compaction;
6. se compaction fallisce, fermarsi con errore recuperabile.

## 18.3 Hierarchical context index

Per ogni sessione:

```text
raw events
  ↓
turn chunks
  ↓
chunk summaries
  ↓
episode summaries
  ↓
session map
```

Summary contiene references:

```json
{
  "summary": "Implemented authentication migration...",
  "covers": ["evt_101", "evt_188"],
  "facts": ["..."],
  "artifacts": ["file://..."],
  "decisions": ["dec_17"]
}
```

Un modello può chiedere di espandere una regione.

---

# 19. Prompt assembly

Hermes separa layer stable/context/volatile e ordina identity, tool/model guidance, skills, caller context, project files, memory/profile e runtime metadata per favorire prompt caching.

Questo è un buon pattern.

## Talos Prompt DAG

Evolvere da lista ordinata a dependency graph:

```text
Identity
 ├─ Persona
 └─ Safety

Project
 ├─ AGENTS
 ├─ Repo policy
 └─ Selected files

User State
 ├─ Memory retrieval
 └─ Preferences

Task
 ├─ Skill
 ├─ Tool manifest
 └─ Goal state
```

Ogni fragment ha:

```cpp
struct PromptFragment {
  FragmentId id;
  Scope scope;
  Stability stability;
  int priority;
  TokenEstimate size;
  Hash content_hash;
};
```

Il planner ottimizza:

```text
utility / token
```

mantenendo invarianti non eliminabili.

---

# 20. Checkpoints e rollback Hermes

Hermes può creare checkpoint prima di write/patch e comandi distruttivi usando un **shadow git repository** condiviso. La feature è opt-in; la documentazione dichiara che il costo storage nel tempo non è trascurabile.

Default documentati includono limiti di snapshot/store/file e pruning.

## Talos parity

Serve rollback transactionale per coding.

## Talos overtake

Integrare checkpoint con event log:

```text
ToolCall(file.patch)
  ↓
WorkspaceTxn BEGIN
  ↓
content-addressed snapshot
  ↓
patch
  ↓
syntax/LSP/tests
  ↓
COMMIT
```

Se validation fallisce:

```text
user policy:
  keep_and_warn
  auto_rollback
  ask
```

Checkpoint non deve essere una feature separata dalla timeline: il transcript deve mostrare quale edit appartiene a quale transaction.

---

# 21. Projects, profiles, worktrees

## Hermes profiles

Un profile è un Hermes home separato con config, API key, memory, sessions, skills, cron e state DB indipendenti.

È efficace per separare agent identities, ma è una **duplicazione dell'intero home**.

## Talos model

Separare entità:

```text
Identity/Profile
Workspace/Project
Conversation
Agent Role
Provider Policy
Permission Policy
```

Non far coincidere necessariamente profile con directory di storage completa.

Schema:

```sql
profile(id, name, persona_id, memory_space_id)
project(id, name, root_uri, policy_id)
session(id, profile_id, project_id, ...)
```

Questo permette:

- stesso profile su più project;
- stesso project con profile diversi;
- memoria personale separata da memoria project;
- permessi project-scoped.

## Worktrees

Talos Desktop Companion dovrebbe offrire:

```text
Create isolated worktree
Run agent branch
Review diff
Merge/cherry-pick/discard
```

Su Android il filesystem local può non avere git completo; delegare al companion/SSH backend.

---

# 22. Delegation e sub-agent

Hermes espone `delegate_task` come primitive agentica: il parent agent può creare un child agent con contesto isolato, accesso ai tool ereditato e propria sessione terminale. Il child esegue il task e restituisce principalmente un risultato/summary al parent.

Fonte ufficiale: `https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation`

## 22.1 Cosa funziona bene nel modello Hermes

La delegazione risolve quattro problemi reali:

1. riduce la contaminazione del context principale;
2. permette parallelismo fra attività indipendenti;
3. crea un boundary cognitivo fra planner e worker;
4. consente a un worker di usare terminale/tool senza gonfiare direttamente il transcript principale.

Schema concettuale:

```text
Parent Agent
   │
   ├── Task A ──► Child Agent A ──► final result
   │
   ├── Task B ──► Child Agent B ──► final result
   │
   └── Task C ──► Child Agent C ──► final result
```

## 22.2 Limite strutturale da non copiare

Se il parent riceve soltanto il summary finale, perde parte della provenienza operativa:

```text
child transcript
child tool calls
child evidence
child errors/retries
        │
        ▼
    final summary
```

Questo è efficiente in token ma può essere debole per:

- audit;
- debugging;
- re-verifica delle conclusioni;
- merging di risultati conflittuali;
- riuso di evidenze precise;
- rollback di un worker.

Inoltre, l'ereditarietà ampia dei tool è una policy semplice ma non ideale. Un sub-agent che deve solo leggere tre file non dovrebbe ereditare automaticamente terminale, browser, rete e filesystem write.

## 22.3 Talos: delegation con evidence bundle

Talos dovrebbe trattare il risultato di un sub-agent come un oggetto strutturato:

```ts
interface AgentResult {
  taskId: string
  status: 'completed' | 'partial' | 'failed' | 'cancelled'
  summary: string
  claims: Claim[]
  evidenceRefs: EvidenceRef[]
  artifactRefs: ArtifactRef[]
  workspaceChanges: ChangeSetRef[]
  metrics: AgentMetrics
  continuation?: ContinuationState
}
```

Il parent vede una materializzazione concisa, ma il ledger conserva l'intera traiettoria.

```text
Parent context
   │
   └── compact AgentResult
          │
          ├── evidence refs ─────► immutable ledger
          ├── artifacts ─────────► artifact store
          ├── filesystem diff ───► workspace transaction
          └── full trajectory ───► cold storage / trace
```

## 22.4 Capability attenuation

Il child deve ricevere una permission set derivata per **attenuazione**, mai per escalation:

```text
parent:
  fs.read:project
  fs.write:project
  network:https
  terminal:project

child "analyze docs":
  fs.read:project/docs/**
  network:none
  terminal:none
```

Esempio API:

```ts
const child = await agents.spawn({
  role: 'researcher',
  task,
  capabilities: parentCaps.intersect([
    'fs.read:project/docs/**',
    'memory.read:project',
  ]),
  budget: {
    maxTokens: 20_000,
    maxToolCalls: 40,
    wallClockMs: 180_000,
  },
})
```

## 22.5 Resource scheduling mobile

Su Talos Android non bisogna tradurre “parallel agents” in “N processi che saturano tutti i core”. Il runtime deve schedulare agenti logici su un pool limitato:

```text
8 agenti logici
     │
     ▼
Talos Actor Scheduler
     │
     ├── 1 local LLM lane
     ├── 1 I/O lane
     ├── 1 tool lane
     └── optional cloud lane
```

Una buona policy iniziale:

```text
local model generations concurrently = 1
CPU-heavy tools concurrently          = 1
network I/O tools                     = 2..4
background low-priority agents        = cooperative
```

Il target non è massimizzare throughput assoluto; è evitare che orchestrazione e inferenza distruggano la responsività del tablet.

---

# 23. Persistent Goals

Hermes supporta goal persistenti/session-scoped: dopo un turno un evaluator leggero può stabilire se l'obiettivo sia concluso e, in caso contrario, far proseguire autonomamente l'agente.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/goals`

## 23.1 Valore competitivo

La feature trasforma:

```text
chat request/response
```

in:

```text
objective
  ↓
act
  ↓
evaluate
  ↓
continue / finish
```

ed è cruciale per task lunghi.

## 23.2 Failure modes

Un judge basato su LLM introduce:

- chiamate addizionali;
- latenza;
- possibilità di false-completion;
- possibilità di loop;
- difficoltà nel distinguere “non completato” da “bloccato”; 
- consumo non banale su modelli locali.

## 23.3 Talos: goal come state machine esplicita

Non implementare un semplice booleano `goal_done`.

```ts
interface Goal {
  id: GoalId
  objective: string
  successCriteria: Criterion[]
  state: 'active' | 'blocked' | 'waiting' | 'completed' | 'failed'
  maxSteps: number
  maxCost?: Money
  maxRuntimeMs?: number
  evidencePolicy: EvidencePolicy
}
```

Il criterio di terminazione può essere composito:

```text
Deterministic validators
   +
LLM judge only where needed
   +
explicit user approval for irreversible success
```

Esempio per coding:

```yaml
success:
  - command: npm test
    exit_code: 0
  - command: npm run typecheck
    exit_code: 0
  - git_diff_max_unreviewed_files: 10
  - llm_review: no_critical_findings
```

In questo modo Talos può superare Hermes sulla **verificabilità** del lavoro autonomo.

---

# 24. Programmatic tool calling / Code execution

Hermes possiede un meccanismo in cui il modello genera uno script Python che può invocare i tool attraverso `hermes_tools.py` e un RPC locale. Gli output intermedi possono rimanere fuori dal context LLM e soltanto il risultato stampato viene reinserito.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/code-execution`

## 24.1 Perché è una feature molto importante

Considerare 100 file:

```text
approccio tradizionale:
100 tool result → 100 risultati nel context
```

contro:

```text
programmatic execution:
Python loop → 100 tool calls → aggregate locally → 1 compact result
```

Questo riduce drasticamente token replay e context pollution.

## 24.2 Talos: Tool VM

Talos dovrebbe generalizzare il concetto in una **Tool VM** con due target:

1. JavaScript/QuickJS o WASM embedded per mobile;
2. Python opzionale nel Desktop Companion.

API logica:

```ts
const result = await toolvm.execute({
  code: `
    const files = await tools.fs.glob('src/**/*.ts')
    const hits = []
    for (const f of files) {
      const text = await tools.fs.read(f)
      if (text.includes('dangerousPattern')) hits.push(f)
    }
    return { hits }
  `,
  capabilities: ['fs.read:project'],
  cpuMs: 2_000,
  memoryMb: 64,
})
```

## 24.3 Requisiti di sicurezza

Il runtime programmatico deve avere:

- memory limit;
- CPU/fuel limit;
- wall-clock timeout;
- no arbitrary native module import;
- no unrestricted filesystem;
- capability broker per ogni tool call;
- deterministic cancellation;
- output byte cap;
- structured return preferita a `stdout`.

Evita il design:

```text
arbitrary Python
  + same process
  + same credentials
  + unrestricted OS
```

per il core Android.

---

# 25. Cron e automazioni temporali

Hermes integra cron one-shot/recurring con create/list/update/pause/resume/run/remove; può associare skill e delivery, creare sessioni fresche e dispone anche di una modalità script/no-agent in cui un job può eseguire senza LLM.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/cron`

## 25.1 Feature da replicare

Talos deve avere almeno:

```text
schedule
condition
action
capabilities
budget
delivery
retry policy
history
```

Schema:

```sql
CREATE TABLE automation (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  trigger_json TEXT NOT NULL,
  action_json TEXT NOT NULL,
  capability_set_id TEXT NOT NULL,
  retry_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE automation_run (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  scheduled_at INTEGER,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT NOT NULL,
  session_id TEXT,
  result_ref TEXT,
  error_json TEXT
);
```

## 25.2 Android-specific design

Hermes nasce principalmente desktop/server/CLI. Talos deve progettare il cron attorno ai vincoli Android:

```text
exact alarm?       → solo se requisito valido e permesso
periodic work      → WorkManager
network condition  → constraints
battery low        → defer
Doze               → best-effort/background semantics
foreground long op → foreground service quando giustificato
```

Non promettere una semantica “cron Unix al secondo” quando Android non può garantirla.

L'UI deve esplicitare:

```text
Exact
Approximate
When device is available
When network is available
```

## 25.3 Zero-LLM automation

Questo è un pattern Hermes molto buono da copiare:

```text
se un task è deterministicamente scriptabile
→ non avviare il modello
```

Esempi Talos:

```text
backup file
HTTP health check
rotate logs
sync directory
run test command
collect system metrics
```

Questo è particolarmente importante sul mobile per energia e thermal budget.

---

# 26. Kanban e orchestrazione multi-agent

Hermes offre una board Kanban persistente SQLite con task, status, dipendenze, comments, attachments, heartbeat e worker. La documentazione descrive worker come processi OS completi.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban`

## 26.1 Parità funzionale richiesta

Talos dovrebbe fornire:

- board;
- backlog;
- ready/in-progress/review/done/blocked;
- dependencies DAG;
- task ownership;
- attempts;
- comments/event log;
- artifact links;
- file diff links;
- heartbeat/lease;
- cancellation;
- retry;
- budgets;
- SLA/priority.

## 26.2 Talos: DAG first, Kanban as projection

Non usare la board visuale come modello dati primario.

```text
Task DAG / Event Store
        │
        ├──► Kanban projection
        ├──► Timeline projection
        ├──► Gantt/dependency projection
        └──► Agent queue projection
```

Schema:

```sql
CREATE TABLE task (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  state TEXT NOT NULL,
  priority INTEGER NOT NULL,
  assigned_agent TEXT,
  lease_until INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE task_edge (
  from_task TEXT NOT NULL,
  to_task TEXT NOT NULL,
  kind TEXT NOT NULL,
  PRIMARY KEY(from_task, to_task, kind)
);

CREATE TABLE task_event (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload BLOB NOT NULL,
  ts INTEGER NOT NULL
);
```

## 26.3 Worker come actor, non processo

Per mobile:

```text
worker = logical actor
```

non:

```text
worker = OS process
```

Il worker acquisisce una lease:

```sql
UPDATE task
SET assigned_agent=?, lease_until=?
WHERE id=? AND (lease_until IS NULL OR lease_until < now());
```

Se il processo viene sospeso o ucciso, la lease scade e il task torna schedulabile.

---

# 27. Hooks, batch e workflow

Hermes espone hook/eventi e un batch runner oltre all'automazione cron.

Fonti:

- `https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/batch-processing`

## 27.1 Talos Event Bus

Ogni evento significativo deve poter essere osservato:

```text
session.created
message.received
agent.started
model.request.started
model.request.completed
tool.requested
tool.approved
tool.completed
artifact.created
workspace.changed
goal.blocked
generation.cancelled
automation.completed
```

Contratto:

```ts
type TalosEvent<T = unknown> = {
  id: string
  type: string
  ts: number
  sessionId?: string
  projectId?: string
  correlationId: string
  causationId?: string
  payload: T
}
```

Hooks user-defined devono consumare una vista filtrata, non necessariamente l'evento raw contenente secret.

## 27.2 Deterministic pipelines

Per operazioni ripetitive Talos dovrebbe consentire workflow espliciti:

```yaml
steps:
  - tool: fs.glob
    with: { pattern: "src/**/*.ts" }
  - map:
      tool: lint.file
  - reduce:
      agent: reviewer
  - gate:
      command: "npm test"
  - agent: summarize
```

La regola strategica:

> usare LLM solo nei nodi che richiedono giudizio semantico.

Questo riduce costi e rende il workflow più debuggabile di un loop agentico interamente opaco.

---

# 28. Provider routing, fallback e credential pools

Hermes offre un sistema maturo di provider/model routing, fallback e pool di credenziali. Il provider routing documenta anche preferenze OpenRouter/Nous per prezzo, throughput, latency, provider allow/deny e policy di data collection.

Fonti:

- `https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools`

## 28.1 Tre livelli da replicare

Hermes distingue utilmente:

```text
credential fallback
model/provider fallback
auxiliary-task fallback
```

Talos dovrebbe ampliare il router a **execution locality**:

```text
local NPU
local CPU/GPU
LAN endpoint
private cloud
public cloud
```

## 28.2 Talos Model Router

Input del router:

```ts
interface RoutingContext {
  task: 'chat' | 'vision' | 'compression' | 'embedding' | 'title' | 'judge'
  privacy: 'device-only' | 'private-network' | 'cloud-ok'
  maxLatencyMs?: number
  maxCostUsd?: number
  minimumContext?: number
  requiresTools?: boolean
  thermalHeadroom?: number
  batteryPercent?: number
  network?: 'offline' | 'metered' | 'unmetered'
}
```

Score candidato:

```text
score =
    w_quality * predictedQuality
  - w_latency * predictedLatency
  - w_cost * cost
  - w_energy * energy
  - w_privacy * privacyPenalty
  - w_thermal * thermalPenalty
```

Con hard constraints prima dello score:

```text
privacy=device-only
→ cloud candidate eliminato, non solo penalizzato
```

## 28.3 Fallback e prompt cache

La documentazione Hermes nota che il fallback fra provider può richiedere rilettura completa della conversazione e perdere benefici di prompt cache.

Talos può ridurre il problema con una `ContextArtifact` provider-neutral:

```ts
interface ContextArtifact {
  canonicalMessages: MessageRef[]
  materializedSummaryRefs: SummaryRef[]
  retrievedMemoryRefs: MemoryRef[]
  toolSchemaDigest: string
  tokenizationProfiles: Map<ModelFamily, TokenizationCache>
}
```

Ogni provider adapter produce la serializzazione finale senza ricostruire semanticamente il contesto da zero.

## 28.4 Circuit breaker

Provider health:

```text
CLOSED
  │ failure threshold
  ▼
OPEN
  │ cool-down
  ▼
HALF_OPEN
  │ success
  └────────► CLOSED
```

Metriche per endpoint:

```text
availability EWMA
TTFT p50/p95
decode rate
429 rate
5xx rate
context rejection rate
price estimate
```

---

# 29. Mixture of Agents

Hermes dispone di Mixture of Agents: modelli reference possono produrre consigli privati, poi un aggregator principale usa tali consigli per rispondere/agire.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/mixture-of-agents`

La documentazione riporta anche benchmark vendor su HermesBench; tali risultati vanno trattati come **vendor-reported**, non come benchmark indipendente.

## 29.1 Punti forti

- diversità di ragionamento;
- ensemble senza esporre ogni reference al tool loop;
- configurazione fan-out;
- possibilità di usare modelli specializzati.

## 29.2 Limiti

Il costo cresce quasi linearmente con il fan-out, almeno per la parte reference:

```text
1 aggregator + N advisors
```

Su local-first/mobile questo può significare:

- RAM addizionale;
- model swaps;
- thermal pressure;
- TTFT più alto;
- cloud cost se i reference sono remoti.

Inoltre, se gli advisor non vedono l'intero system/tool transcript, il loro consiglio può essere meno informato sullo stato reale dell'ambiente.

## 29.3 Talos: Adaptive Deliberation

Talos dovrebbe evitare “MoA sempre acceso”.

```text
query
  ↓
uncertainty/complexity estimator
  ├── easy  → single model
  ├── medium→ critic pass
  └── hard  → multi-agent deliberation
```

Policy:

```ts
interface DeliberationPolicy {
  maxAdvisors: number
  triggerConfidenceBelow: number
  maxExtraLatencyMs: number
  maxExtraCostUsd: number
  allowCloudAdvisors: boolean
}
```

Gli advisor dovrebbero ricevere un **evidence packet** curato, non necessariamente l'intero transcript:

```text
task
constraints
relevant evidence
current plan
failed attempts
```

Questo preserva token e migliora il grounding.

---

# 30. MCP: parità completa e design superiore

Hermes supporta MCP via stdio e HTTP, OAuth 2.1, mTLS, catalog/install flow, filtri include/exclude/glob, resources/prompts, aggiornamento dinamico della lista tool e idle recycle dei server.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp`

La documentazione evidenzia anche un motivo pratico per l'idle recycle: server MCP pesanti come quelli browser possono lasciare processi Chromium che consumano centinaia di MB.

## 30.1 MCP parity checklist

Talos deve implementare:

```text
[ ] stdio transport
[ ] streamable HTTP transport
[ ] OAuth 2.1
[ ] mTLS / custom CA dove applicabile
[ ] server lifecycle
[ ] reconnect/backoff
[ ] list tools
[ ] list resources
[ ] read resource
[ ] list prompts
[ ] get prompt
[ ] notifications tools/list_changed
[ ] include/exclude filters
[ ] project scoping
[ ] permission prompts
[ ] secret injection broker
[ ] process/resource budgets
[ ] idle recycle
[ ] health view UI
[ ] request/response trace
```

## 30.2 Punto debole competitivo: scope globale

Una issue Hermes del 24 giugno 2026 riporta come gap il project-scoping MCP: configurazioni/server visibili globalmente invece di essere naturalmente legati al progetto.

Field report: `https://github.com/NousResearch/hermes-agent/issues/51626`

Non trattare il report come prova che ogni percorso corrente abbia lo stesso difetto; trattarlo come conferma della difficoltà architetturale di aggiungere scoping dopo che l'ecosistema è diventato globale.

## 30.3 Talos: MCP binding per project

```sql
mcp_server(
  id,
  definition_json,
  trust_level,
  installed_at
)

project_mcp_binding(
  project_id,
  mcp_server_id,
  enabled,
  capability_policy_id,
  tool_filter_json
)
```

Uno stesso server può essere:

```text
Project A → enabled read-only
Project B → disabled
Project C → enabled + write approval
```

## 30.4 Secret broker

Non dare al server MCP l'intero ambiente processo.

```text
MCP process
  │ requests credential alias
  ▼
Talos Secret Broker
  │ policy + scope + user grant
  ▼
short-lived secret material
```

Esempio manifest:

```yaml
server: github
capabilities:
  network:
    allow:
      - api.github.com:443
  secrets:
    - github.personal_access_token
  fs:
    read:
      - project/**
    write: []
```

## 30.5 Resource budget

```ts
interface MCPBudget {
  maxRssMb: number
  maxCpuPercent?: number
  idleTimeoutMs: number
  requestTimeoutMs: number
  maxConcurrentRequests: number
}
```

Su Android, server MCP Node/Python arbitrari possono essere impraticabili. Talos deve distinguere:

```text
mobile-compatible MCP
remote MCP
desktop-companion MCP
```

UI:

```text
GitHub MCP
Location: Desktop Companion
Status: connected
Talos Android latency: 18 ms LAN
Permissions: repo read/write
```

---

# 31. ACP e integrazione editor

Hermes espone un server Agent Client Protocol (ACP) via stdio e integrazioni con editor/client come VS Code/Zed/Buzz; gli editor possono renderizzare tool call, diff, terminale, approval e reasoning/stream.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/acp`

## 31.1 Talos ACP server

Talos Desktop Companion dovrebbe esporre ACP senza duplicare l'agent loop:

```text
IDE
 │ ACP
 ▼
Talos ACP Adapter
 │
 ▼
Talos Agent Kernel
```

L'adapter converte:

```text
Talos Event Ledger
→ ACP notifications/content blocks
```

## 31.2 Capability profile per ACP

Hermes usa un toolset ACP curato. Talos dovrebbe renderlo una policy:

```yaml
surface: acp
allow:
  - fs.read:project
  - fs.write:project
  - terminal:project
  - lsp:project
deny:
  - messaging.send
  - automation.create
  - device.contacts
```

Il protocollo/surface non deve accidentalmente ottenere capability che l'utente si aspetta solo dall'app principale.

---

# 32. API server OpenAI-compatible

Hermes offre server HTTP OpenAI-compatible con endpoint Chat Completions stateless e Responses con stato server-side/`previous_response_id`, streaming SSE e progress eventi tool.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server`

## 32.1 Talos parity

Endpoint minimo:

```text
POST /v1/chat/completions
POST /v1/responses
GET  /v1/models
```

Ma internamente:

```text
HTTP adapter
  ↓
API DTO normalization
  ↓
Talos Session/Agent Kernel
```

Non costruire un secondo agent loop specifico per API.

## 32.2 Local security

Per il device Android:

- default bind loopback;
- random bearer token;
- explicit LAN enable;
- origin/CORS deny-by-default;
- certificate/pairing per accesso companion;
- no privileged native bridge esposto via HTTP.

## 32.3 Event streaming Talos

Preferire un event envelope comune:

```json
{
  "type": "tool.progress",
  "session_id": "...",
  "operation_id": "...",
  "seq": 143,
  "payload": {}
}
```

che venga adattato a SSE/WebSocket/ACP/UI.

---

# 33. Messaging gateway

Hermes possiede uno dei suoi maggiori vantaggi di breadth: un gateway di messaggistica che mantiene sessioni per chat e adapter verso numerose piattaforme. La documentazione contiene una capability matrix per piattaforma e descrive un gateway persistente con cron ticker.

Fonti:

- `https://hermes-agent.nousresearch.com/docs/user-guide/messaging`
- `https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram`
- directory messaging nella documentazione ufficiale.

## 33.1 Parità Talos: non implementare 20 adapter prima del core

Ordine raccomandato:

```text
1. Telegram
2. Discord
3. Slack
4. generic webhook
5. email
6. WhatsApp/Matrix/Signal in funzione domanda e fattibilità
```

L'architettura deve però supportare breadth fin dal primo adapter.

```ts
interface MessagingAdapter {
  id: string
  capabilities(): MessagingCapabilities
  connect(ctx: AdapterContext): Promise<void>
  send(message: OutboundMessage): Promise<DeliveryReceipt>
  edit?(...): Promise<void>
  react?(...): Promise<void>
  typing?(...): Promise<void>
}
```

## 33.2 Canonical message

```ts
interface InboundEnvelope {
  adapter: string
  accountId: string
  conversationId: string
  sender: Principal
  text?: string
  attachments: AttachmentRef[]
  replyTo?: ExternalMessageRef
  receivedAt: number
  platformMetadata: Record<string, unknown>
}
```

La sessione Talos viene legata con mapping:

```sql
external_conversation(
  adapter,
  account_id,
  external_conversation_id,
  talos_session_id,
  PRIMARY KEY (...)
)
```

## 33.3 Cross-surface continuation

Hermes già permette session handoff fra superfici. Talos deve renderlo first-class:

```text
Telegram chat
     │
     ▼
Talos Session #A
     │
     ├── Android app
     ├── desktop
     ├── API
     └── ACP
```

La sessione appartiene al ledger, non alla superficie.

## 33.4 Approval remote

Se un tool richiede approvazione mentre l'utente è su Telegram:

```text
Agent requests:
Delete 14 files?

[Approve once]
[Deny]
[Open details]
```

L'approvazione deve essere un oggetto firmato/nonce-bound:

```ts
interface ApprovalRequest {
  id: string
  operationHash: string
  expiresAt: number
  requestedCapabilities: string[]
}
```

Mai interpretare un semplice testo “yes” non correlato come approval per un'operazione diversa.

---

# 34. Voice, STT, TTS, vision e media

Hermes supporta voice mode, STT locale/cloud, TTS multi-provider, voice messaging/Discord, vision da clipboard/file, image/video generation e analisi.

Fonti:

- `https://hermes-agent.nousresearch.com/docs/user-guide/features/voice-mode`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/tts`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/vision`

La guida Termux attuale dichiara che il percorso Android è Tier 2/best effort e che il local `faster-whisper` non è disponibile nel percorso Termux testato.

Fonte: `https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/termux.md`

## 34.1 Talos può sorpassare nettamente su Android

Talos è già un'app nativa-wrapped. Deve usare:

```text
Android audio capture
       │
       ▼
Native VAD
       │
       ├── local STT accelerator
       └── cloud STT fallback
       │
       ▼
Agent
       │
       ▼
local/cloud TTS
       │
       ▼
AudioTrack
```

Non far passare PCM pesante attraverso il bridge Capacitor.

## 34.2 Voice UX

Modalità:

```text
Push-to-talk
Hands-free session
Voice message transcription
Read answer aloud
```

Indicatori obbligatori:

```text
mic active
recording duration
local/cloud badge
stop button
partial transcript
```

## 34.3 Local privacy routing

```text
Voice privacy: Device only
```

implica hard constraint:

```text
no cloud STT
no cloud TTS
```

anche se la rete è disponibile.

## 34.4 Multimodal artifact pipeline

Tutte le immagini/media entrano nell'Artifact Store:

```text
camera/file/share intent
       ↓
Artifact ingestion
       ├── MIME sniff
       ├── hash
       ├── metadata
       ├── thumbnail
       └── permission scope
       ↓
Vision adapter
```

Il transcript contiene `ArtifactRef`, non base64 duplicato in SQLite ad ogni turno.

---

# 35. Browser automation e computer use

Hermes dispone di un browser layer molto ampio: Browserbase, Browser Use, Firecrawl, Camofox, CDP verso browser locali e `agent-browser`; usa accessibility snapshot/reference IDs e supporta screenshot/vision. La documentazione tratta anche SSRF e browser session isolation.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/features/browser`

Il tool reference include inoltre `computer_use` tramite driver dedicato, con screenshot/vision/accessibility e azioni input.

Fonte: `https://hermes-agent.nousresearch.com/docs/reference/tools-reference`

## 35.1 Regola Talos fondamentale

**Non usare la stessa WebView privilegiata di Capacitor come browser controllato dall'agente.**

La WebView Talos contiene un native bridge privilegiato. Navigare pagine arbitrarie dentro lo stesso security context aumenterebbe enormemente il rischio.

Architettura:

```text
Talos App WebView
trusted app origin
native bridge
       │
       │ IPC capability broker
       ▼
Browser Sandbox
unprivileged process / isolated WebView / remote browser
       │
       ▼
untrusted web
```

## 35.2 Browser artifact model

```ts
interface BrowserSnapshot {
  pageId: string
  url: string
  title: string
  capturedAt: number
  accessibilityTreeRef: BlobRef
  screenshotRef?: ArtifactRef
  textIndexRef?: BlobRef
}
```

LLM riceve una vista compressa con IDs stabili:

```text
[12] button "Sign in"
[13] textbox "Email"
[14] textbox "Password"
```

## 35.3 Network policy

Browser agent policy:

```yaml
network:
  public_https: allow
  localhost: deny
  private_lan: deny
  file_scheme: deny
  android_content: deny
```

Con grant esplicito per casi locali.

## 35.4 Computer use mobile

Su Android il computer-use cross-app richiede servizi privilegiati/accessibility e deve essere una capability separata e visibile:

```text
Accessibility control: OFF by default
```

Quando abilitata:

- persistent system indication;
- scoped session;
- denylist per app sensibili opzionale;
- no password-field extraction;
- confirmation per irreversible financial/auth operations.

Per desktop completo, usare Talos Desktop Companion.

---

# 36. Plugins: il più grande spazio per un vantaggio di sicurezza Talos

Hermes supporta plugin Python dinamici. La documentazione `SECURITY.md` del repository chiarisce un punto molto importante: plugin e skill di terze parti sono un trust boundary operativo, non una sandbox forte. I plugin possono essere caricati nel processo dell'agente e possiedono i privilegi del processo; skill possono includere codice Python che richiede review dell'operatore.

Fonte repository: `https://github.com/NousResearch/hermes-agent/blob/main/SECURITY.md`

Fonte feature: `https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins`

Questo è un trade-off legittimo per un framework Python estensibile, ma rappresenta una delle migliori opportunità di differenziazione Talos.

## 36.1 Talos Plugin Package

```text
plugin.talos/
├── manifest.json
├── module.wasm
├── ui/
│   └── optional-ui-chunk.js
├── schemas/
└── signature.ed25519
```

Manifest:

```json
{
  "id": "com.example.github",
  "version": "1.4.0",
  "runtime": "wasm32-wasi",
  "capabilities": {
    "network": ["api.github.com:443"],
    "secrets": ["github.token"],
    "fsRead": ["project/**"],
    "fsWrite": []
  },
  "tools": [
    "github.searchIssues",
    "github.readIssue"
  ]
}
```

## 36.2 Capability broker

Il plugin non accede direttamente a socket/filesystem:

```text
WASM plugin
   │ hostcall
   ▼
Capability Broker
   │ policy
   ├── fs service
   ├── network proxy
   ├── secret broker
   └── artifact service
```

## 36.3 Firma e provenance

Store locale:

```sql
plugin_install(
  plugin_id,
  version,
  publisher_key,
  package_hash,
  signature_valid,
  installed_from,
  installed_at,
  granted_policy_id
)
```

UI:

```text
GitHub Integration 1.4.0
Publisher: Example Inc. ✓
Needs:
  • Network: api.github.com
  • Secret: GitHub token
  • Read project files
Does NOT need:
  • File writes
  • Terminal
  • Contacts
```

Questo rende il permission model comprensibile e auditabile.

---

# 37. Security architecture: da prompt guardrails a capability security

Hermes documenta più strati di sicurezza: allowlist/pairing, approval per comandi pericolosi, file denial/sandbox, container, credential filter MCP, prompt-injection scanning, isolamento sessioni e input sanitization.

Fonte: `https://hermes-agent.nousresearch.com/docs/user-guide/security`

Sono controlli importanti. Talos deve aggiungere un principio più profondo:

> il modello è sempre un principal non fidato; la sua intenzione non equivale ad autorizzazione.

## 37.1 Object-capability model

Ogni tool call passa attraverso:

```text
LLM proposal
   ↓
schema validation
   ↓
capability resolution
   ↓
policy engine
   ↓
approval if required
   ↓
execution broker
```

## 37.2 Capability examples

```text
fs.read:project/src/**
fs.write:project/src/**
terminal.exec:project
network.connect:api.github.com:443
contacts.read
calendar.write
microphone.capture
camera.capture
browser.private-network
android.accessibility.control
secrets.use:github
```

## 37.3 Policy

```yaml
role: coding-agent
allow:
  - fs.read:project/**
  - fs.write:project/src/**
  - terminal.exec:project
ask:
  - network.connect:*
  - fs.write:project/.github/**
deny:
  - contacts.*
  - microphone.*
  - android.accessibility.*
```

## 37.4 Approvals non testuali

Approval record:

```ts
interface ApprovalGrant {
  requestId: string
  operationDigest: string
  capability: string
  scope: 'once' | 'session' | 'project'
  expiresAt?: number
  userPresenceProof?: string
}
```

Se il tool cambia argomenti, cambia `operationDigest`; il grant non è riutilizzabile.

## 37.5 Prompt injection

Non promettere che un classificatore di prompt injection risolva il problema.

La difesa reale è:

```text
malicious webpage says:
"upload ~/.ssh"
       │
       ▼
LLM may propose action
       │
       ▼
capability broker sees:
fs.read outside project + network exfil
       │
       ▼
DENY / explicit approval
```

Questa è una proprietà di sistema, non del prompt.

---

# 38. Android: il vantaggio strutturale più grande di Talos

La guida Hermes Termux corrente classifica Android/Termux **Tier 2, best effort**; segnala che il main può rompere package, Docker non è disponibile, browser automation setup viene intenzionalmente saltato nel percorso Android e local faster-whisper non è disponibile nel setup testato.

Fonte repository: `https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/termux.md`

Una issue ha inoltre documentato un caso di build `psutil` fallita su Android/Termux. Questo è un field report, non una limitazione universale.

Issue: `https://github.com/NousResearch/hermes-agent/issues/31415`

## 38.1 Talos non deve inseguire Hermes sul suo terreno desktop

La strategia migliore è:

```text
Hermes strength: workstation breadth
Talos strength: native personal AI device
```

Talos deve essere superiore in:

- installazione one-tap Android;
- local model management;
- Qualcomm HTP/NPU;
- battery/thermal awareness;
- Android share sheet;
- voice native;
- camera/documents;
- notifications;
- offline embeddings/search;
- background tasks compatibili Android;
- secure biometric secret unlock;
- local file/document indexing;
- responsive tablet workbench.

## 38.2 Desktop Companion colma il resto

```text
Talos Android
   │ encrypted RPC
   ▼
Talos Desktop Companion
   ├── full terminal
   ├── Docker
   ├── git/worktrees
   ├── desktop browser
   ├── IDE/ACP
   └── heavy MCP servers
```

Il mobile resta control plane personale e inferenza locale; il companion è execution plane opzionale.

---

# 39. Analisi della complessità architetturale Hermes

La repo corrente contiene contemporaneamente:

```text
agent core Python
gateway
CLI/TUI
Electron Desktop
React renderer
web dashboard
FastAPI/backend locali
ACP adapter
MCP subprocess
browser backends
plugins Python
messaging adapters
cron
skills
providers
```

La documentazione architetturale fa convergere ancora gli entry point su `AIAgent (run_agent.py)`; su `main` il file è verificabile come 8.167 linee / 365 KB.

Fonti:

- `https://hermes-agent.nousresearch.com/docs/developer-guide/architecture`
- `https://github.com/NousResearch/hermes-agent/blob/main/run_agent.py`

## 39.1 Interpretazione corretta

Non significa “Hermes è scritto male”. Significa:

- il sistema ha raggiunto una breadth enorme;
- molte compatibilità storiche convivono;
- la probabilità di coupling cresce;
- refactor radicali diventano costosi;
- ogni surface aggiunge lifecycle diversi.

Questa è una condizione naturale di un prodotto maturo e veloce a espandersi.

## 39.2 Vantaggio greenfield Talos

Talos può imporre confini fin dall'inizio:

```text
                    TALOS KERNEL
                         │
     ┌───────────────────┼───────────────────┐
     ▼                   ▼                   ▼
Session Ledger      Agent Scheduler      Policy Engine
     │                   │                   │
     └────────────── Event Bus ──────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
Context Engine      Tool Runtime      Provider Router
       │                 │                 │
       ▼                 ▼                 ▼
Storage          Capability Broker    Model Runtime
```

Surface adapters:

```text
Android UI
Desktop UI
CLI
Messaging
API
ACP
```

non devono possedere business logic duplicata.

---

# 40. Weakness register Hermes → opportunità Talos

La tabella seguente separa limiti documentati, field report e inferenze.

| Area | Hermes: segnale osservato | Evidenza | Rischio/limite | Talos counter-design |
|---|---|---:|---|---|
| Core | `AIAgent` centralizzato, `run_agent.py` 8.167 righe | R/D | blast radius, coupling | kernel modulare + ports/adapters |
| Context | compression può perdere middle turns se summary fallisce, come documentato | D | perdita informazione | ledger lossless + summaries referenziali |
| Long context | issue storiche/recenti su exhaustion/compaction | I | sessioni lunghe fragili | hierarchical context + retrieval |
| Memory | built-in bounded flat `MEMORY.md`/`USER.md` | D | capacità/struttura limitata | structured memory DB + vector/FTS |
| Memory concurrency | docs: un writer per Hermes home | D | multi-process coordination | transactional DB/service |
| Skills | agent-editable e possibile codice | D | drift/trust | signed/versioned capability packages |
| Plugins | full agent-process privileges | R/D | plugin compromise = agent compromise | WASM/isolated plugin runtime |
| MCP | project scoping riportato come gap | I | capability visibility troppo globale | binding project-scoped |
| MCP heavy servers | Chromium MCP può occupare centinaia MB | D | resource pressure | process budgets + remote companion |
| Delegation | child final summary al parent | D/A | provenance compressa | evidence bundle + trace refs |
| Kanban | worker OS process | D | pesante su mobile | logical actors + leases |
| MoA | fan-out multi-model | D/A | costo/latency/thermal | adaptive deliberation |
| Provider fallback | prompt cache può saltare | D | reread/costo | canonical context artifact |
| Android | Termux Tier 2/best effort | D | UX/setup/feature gap | native Android first |
| Voice Android | faster-whisper locale non disponibile nel setup Termux | D | local voice gap | native STT pipeline |
| Browser Android | setup automation saltato nel path Termux | D | agent web gap | isolated native/remote browser |
| Desktop performance | field report web search >14 min/stop non responsivo | I | cancellation/backpressure edge | operation lifecycle + hard cancellation |
| Token replay | heavy-user field report elevato replay | I | cost/context overhead | event materialization + caching |
| Checkpoints | opt-in; shadow store ha crescita non banale | D | storage overhead | delta/CAS transactional workspace |
| Profiles | entire Hermes home separation | D/A | coarse scoping | relational identity/project/policy spaces |

Field reports selezionati da conservare come casi di test Talos:

- context drop: `https://github.com/NousResearch/hermes-agent/issues/10719`
- context loss: `https://github.com/NousResearch/hermes-agent/issues/12131`
- long-session exhaustion: `https://github.com/NousResearch/hermes-agent/issues/61932`
- context exhaustion accounting: `https://github.com/NousResearch/hermes-agent/issues/39548`
- desktop long web-search/stop report: `https://github.com/NousResearch/hermes-agent/issues/42360`
- token/context overhead field report: `https://github.com/NousResearch/hermes-agent/issues/5563`
- MCP project-scope request: `https://github.com/NousResearch/hermes-agent/issues/51626`
- Android Termux psutil report: `https://github.com/NousResearch/hermes-agent/issues/31415`

Questi issue ID sono **regression scenarios**, non materiale da usare marketing come “Hermes è rotto”.

---

# 41. Parità visuale: design system Talos implementabile

Raggiungere parità visuale con Hermes non significa clonarne pixel o brand. Significa ottenere la stessa densità informativa, prevedibilità delle interazioni e continuità fra chat e superfici operative.

Il repository Hermes Desktop fornisce un riferimento particolarmente utile:

- `apps/desktop/DESIGN.md`
- `apps/desktop/AGENTS.md`
- `website/docs/user-guide/desktop.md`

Repository:

- `https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/DESIGN.md`
- `https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/AGENTS.md`
- `https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/desktop.md`

## 41.1 Vincolo Talos: 600 KB initial JS

Talos ha un tetto iniziale rigido di circa 600 KB e il budget attuale è quasi completamente consumato. Quindi la parità visuale **non può** essere ottenuta caricando tutte le superfici al boot.

Definire quattro layer di bundle:

```text
BOOT CORE
  router
  shell
  chat current session
  composer
  native bridge client
  minimal markdown/plain stream

INTERACTIVE CHUNKS
  workbench files
  artifacts
  terminal
  diff/review

MANAGEMENT CHUNKS
  skills
  MCP
  automations
  memory explorer
  providers
  analytics

HEAVY OPTIONAL
  markdown renderer/sanitizer
  editor/Monaco-like component
  charts
  browser tooling
  plugin UI
```

Route map:

```ts
const routes = [
  { path: '/chat/:id?', component: () => import('./chat/ChatRoute.vue') },
  { path: '/projects', component: () => import('./projects/ProjectsRoute.vue') },
  { path: '/skills', component: () => import('./skills/SkillsRoute.vue') },
  { path: '/memory', component: () => import('./memory/MemoryRoute.vue') },
  { path: '/automations', component: () => import('./automation/AutomationRoute.vue') },
  { path: '/connectors', component: () => import('./connectors/ConnectorsRoute.vue') },
]
```

Regola CI:

```text
initial JS gzip/brotli budget = hard fail
per-route chunk budget        = warn/fail per surface
```

## 41.2 Design token hierarchy

Non disseminare classi Tailwind arbitrarie come fonte di verità.

```css
@theme {
  --spacing-rail: 4rem;
  --spacing-pane-gap: 0.5rem;

  --radius-control: 0.625rem;
  --radius-surface: 0.875rem;

  --text-xs-ui: 0.75rem;
  --text-sm-ui: 0.8125rem;
  --text-body-ui: 0.9375rem;

  --shadow-float: 0 8px 24px rgb(0 0 0 / 0.14);
}
```

Semantic tokens separati da palette:

```css
:root {
  --talos-bg: var(--color-zinc-50);
  --talos-surface: white;
  --talos-surface-raised: white;
  --talos-border: color-mix(in srgb, black 10%, transparent);
  --talos-text: var(--color-zinc-950);
  --talos-text-muted: var(--color-zinc-500);
  --talos-accent: var(--color-indigo-600);
  --talos-danger: var(--color-red-600);
  --talos-warning: var(--color-amber-600);
}

.dark {
  --talos-bg: var(--color-zinc-950);
  --talos-surface: var(--color-zinc-900);
  --talos-surface-raised: var(--color-zinc-850);
  --talos-border: color-mix(in srgb, white 10%, transparent);
  --talos-text: var(--color-zinc-50);
  --talos-text-muted: var(--color-zinc-400);
}
```

## 41.3 Primitive UI obbligatori

Creare primitive condivise, non componenti route-specific duplicati:

```text
TButton
TIconButton
TTooltip
TPopover
TMenu
TDialog
TSheet
TResizablePane
TSplitView
TCommandMenu
TStatusDot
TBadge
TProgress
TEmptyState
TErrorState
TVirtualList
TTree
TCodeBlock
TArtifactPreview
TApprovalCard
TToolEvent
TAgentActivity
```

Le primitive devono possedere:

- focus ring;
- keyboard semantics;
- touch target ≥ ~44dp dove è principale;
- high-contrast path;
- reduced-motion path;
- disabled/loading state;
- `aria-*` coerenti.

## 41.4 Flat information architecture

Seguire il principio Hermes “flat, not boxed”.

Anti-pattern:

```text
Card
 └ Card
    └ Card
       └ Card
```

Talos:

```text
section boundary via:
spacing + typography + hairline + background shift
```

Una chat agentica ha già molta densità visiva: tool call, diff, artifact, status, reasoning. Card annidate producono rumore.

## 41.5 Pane architecture

Vue state:

```ts
export interface WorkbenchState {
  open: boolean
  widthPx: number
  activeTab: 'artifact' | 'files' | 'browser' | 'terminal' | 'review' | 'agents'
  pinned: boolean
  resource?: ResourceRef
}
```

Layout:

```vue
<TSplitView>
  <ChatPane />
  <WorkbenchPane v-if="layout.workbenchVisible" />
</TSplitView>
```

Su superfici costose con stato importante, non distruggere necessariamente al cambio tab:

```vue
<KeepAlive>
  <component :is="activeWorkbenchComponent" />
</KeepAlive>
```

ma applicare un limite LRU ai pane mantenuti vivi per non gonfiare WebView RAM.

## 41.6 Pane focus rule

Hermes esplicitamente evita che eventi background rubino focus. Talos deve imporre la stessa regola:

```text
agent opens artifact in background
→ show indicator
→ DO NOT focus pane
```

Solo azione user-originated:

```text
user taps artifact
→ open + focus
```

Event:

```ts
interface OpenResourceIntent {
  resource: ResourceRef
  source: 'user' | 'agent' | 'system'
  focus: boolean // true only if policy permits
}
```

## 41.7 Escape ownership

Una sola action per `Esc`:

```text
1. close top modal
2. else close popover
3. else cancel transient selection
4. else collapse workbench overlay
```

Mai più componenti che intercettano tutti `keydown` globali senza ownership.

## 41.8 Motion

Hermes design guide favorisce motion breve/funzionale e `prefers-reduced-motion`.

Talos:

```css
:root {
  --motion-fast: 90ms;
  --motion-normal: 140ms;
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-normal: 0ms;
  }

  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

Non usare `transition-all` su transcript, split pane, resize o streaming.

## 41.9 Workbench pane contents

### Files

```text
project tree
quick filter
changed files badge
open file preview
context add/remove
```

### Artifact

```text
Markdown
image
PDF
HTML sandbox
structured JSON
model output file
```

### Terminal

```text
multiple sessions
status
stdout stream
kill
background process list
```

### Review

```text
diff list
hunks
accept/revert
validation results
agent rationale
```

### Agent Activity

```text
parent task
children
state
capabilities
budget
tool currently executing
stop/pause
```

## 41.10 Status strip superiore/inferiore

Talos ha informazioni che Hermes desktop non possiede allo stesso livello mobile-native:

```text
[Local Qwen 7B] [HTP] [38.4 tok/s] [Context 47%] [Offline]
[Thermal: Warm] [Battery 62%]
```

Non trasformarlo in dashboard rumorosa. Default compact, click/tap → profiler details.

---

# 42. Target architecture Talos per parità + sorpasso

## 42.1 Vista complessiva

```text
┌──────────────────────────────────────────────────────────────┐
│                       TALOS SURFACES                         │
│ Android | Desktop | CLI | Messaging | ACP | HTTP API        │
└──────────────────────────────┬───────────────────────────────┘
                               │ commands / projections
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    TALOS APPLICATION CORE                    │
│ Session Service | Project Service | Agent Orchestrator       │
│ Skill Service   | Memory Service  | Automation Service       │
└───────────────┬────────────────────┬─────────────────────────┘
                │                    │
                ▼                    ▼
┌───────────────────────┐  ┌──────────────────────────────────┐
│ Immutable Event Ledger│  │ Capability / Policy Engine       │
│ + projection workers  │  │ approvals / secrets / sandbox   │
└────────────┬──────────┘  └───────────────┬──────────────────┘
             │                              │
             ▼                              ▼
┌───────────────────────┐  ┌──────────────────────────────────┐
│ Context + Memory      │  │ Tool Runtime                     │
│ FTS/vector/summaries  │  │ built-in/MCP/WASM/companion     │
└────────────┬──────────┘  └───────────────┬──────────────────┘
             │                              │
             └──────────────┬───────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Model Runtime + Router                                       │
│ Local Talos Runtime/QNN HTP | CPU/GPU | LAN | Cloud         │
└──────────────────────────────────────────────────────────────┘
```

## 42.2 Principio CQRS leggero

Separare:

```text
Command path
```

da:

```text
Projection/read path
```

Esempio:

```text
User sends message
  ↓ command
append UserMessage event
  ↓
projection updates chat
context engine receives sequence
agent orchestration begins
```

La UI non deve scrivere direttamente tabelle derivate.

## 42.3 Event ledger

```sql
CREATE TABLE event (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT UNIQUE NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload BLOB NOT NULL,
  correlation_id TEXT NOT NULL,
  causation_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_event_aggregate
ON event(aggregate_type, aggregate_id, seq);
```

Payload consigliato:

- CBOR/MessagePack/Protobuf per native core;
- schema version per evento;
- JSON export adapter per debug.

## 42.4 Idempotenza

Tool/automation/message adapter devono accettare `operation_id`.

```sql
CREATE TABLE operation (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  state TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_ref TEXT,
  updated_at INTEGER NOT NULL
);
```

Retry:

```text
same operation id + same request hash
→ return prior result
```

per le operazioni idempotenti.

## 42.5 Correlation tree

```text
user_msg U1
  └─ agent_run A1
      ├─ model_call M1
      ├─ tool_call T1
      │   └─ MCP request R1
      └─ child_agent C1
          └─ tool_call T2
```

Ogni log/trace/UI item porta correlation refs. Questo rende il sistema debuggabile senza leggere log sparsi.

---

# 43. Storage architecture

## 43.1 SQLite come metadata/ledger core

Su Android SQLite è una scelta naturale per:

- event log;
- session metadata;
- tasks;
- memories;
- policies;
- automation;
- projections.

Usare WAL:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
```

Da benchmarkare sul filesystem target; non applicare PRAGMA senza test di crash/recovery.

## 43.2 Blob store content-addressed

Non mettere grandi tool output/artifact nel payload eventi.

```text
sha256(bytes)
   ↓
blobs/ab/cd/abcdef....blob
```

DB:

```sql
CREATE TABLE blob (
  hash TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  mime TEXT,
  created_at INTEGER NOT NULL,
  ref_count INTEGER NOT NULL DEFAULT 0
);
```

Event:

```json
{
  "artifact_ref": "sha256:abcdef..."
}
```

## 43.3 FTS

Hermes usa FTS5 per session search. Talos deve raggiungere almeno la stessa capacità.

```sql
CREATE VIRTUAL TABLE message_fts USING fts5(
  session_id UNINDEXED,
  event_id UNINDEXED,
  text,
  tokenize='unicode61'
);
```

Per CJK/multilingual può servire tokenizer custom o indice separato; testare lingue target.

## 43.4 Vector index

Per memory/document retrieval:

```text
embedding store
+ ANN index
```

Su Android scegliere in funzione dimensione:

```text
< 50k vectors → brute-force SIMD può essere sufficiente
50k–500k      → HNSW/native ANN
massive       → sharding/companion
```

Non introdurre ANN pesante senza corpus reale.

## 43.5 Encryption

Separare:

```text
DB encryption at rest
secret keystore
artifact encryption
```

Android Keystore conserva key encryption key; i secret provider token non devono essere leggibili dal JS runtime salvo uso esplicito.

---

# 44. Context Engine Talos: area di sorpasso primaria

Hermes ha un context engine pluggable e una strategia di compressione sofisticata, ma la documentazione stessa descrive una failure semantics in cui un summary fallito può portare alla perdita del middle context nella materializzazione.

Fonte: `https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching`

Talos deve separare:

```text
conversation storage
≠
model context window
```

## 44.1 Immutable source

```text
Event Ledger
  never summarized destructively
```

## 44.2 Derived context artifacts

```ts
interface SummaryArtifact {
  id: string
  sourceRange: {
    sessionId: string
    fromSeq: number
    toSeq: number
  }
  sourceDigest: string
  modelId: string
  promptVersion: string
  summary: string
  facts: FactRef[]
  unresolved: string[]
  createdAt: number
}
```

Se summary generation fallisce:

```text
artifact not created
source events remain intact
```

Non esiste un path in cui il fallimento distrugge la sorgente.

## 44.3 Context materialization algorithm

Input:

```text
current objective
recent events
project
selected artifacts
memory
available model context
```

Output:

```text
ordered ContextBlock[]
```

```ts
interface ContextBlock {
  id: string
  kind: 'identity' | 'instruction' | 'memory' | 'summary' | 'message' | 'artifact' | 'tool'
  priority: number
  utilityScore: number
  tokenEstimate: number
  immutable: boolean
  provenance: EvidenceRef[]
}
```

Greedy baseline:

```text
1. hard required blocks
2. latest interaction tail
3. task-specific evidence
4. relevant project memory
5. hierarchical history summaries
6. older raw messages if budget remains
```

## 44.4 Retrieval by intent

Query non solo semantic similarity del messaggio corrente.

```text
retrieval query =
 current user message
 + active goal
 + referenced entities
 + files currently open
 + tool errors
```

## 44.5 Hierarchical history

```text
raw events
  ↓
segment summaries
  ↓
episode summaries
  ↓
session synopsis
```

Ogni livello mantiene source ranges.

Per domande del tipo:

> “perché avevamo scartato Vulkan?”

il retriever può:

1. trovare summary episodio;
2. seguire source refs;
3. recuperare turn originali;
4. presentare evidenza esatta al modello.

Questa è molto più forte di una memoria lossy monolitica.

## 44.6 Context preview UI

Prima/durante run:

```text
Context 24.1k / 64k

Pinned          6.2k
Recent chat    10.4k
Retrieved       2.1k
Project rules   1.7k
Skills          1.2k
Tools schemas   1.8k
Reserve        20.6k
```

Tap su `Retrieved` mostra item + provenance.

---

# 45. Memory Engine Talos: da file bounded a knowledge ledger

Hermes built-in memory usa file bounded (`MEMORY.md`, `USER.md`) e supporta numerosi provider esterni. È pragmatico e semplice, ma dà a Talos spazio per una soluzione local-first più strutturata.

Fonti:

- `https://hermes-agent.nousresearch.com/docs/user-guide/features/memory`
- `https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers`

## 45.1 Memory types

```text
Preference
Fact
ProjectFact
Decision
Procedure
Entity
Relationship
EpisodicSummary
UserConstraint
```

## 45.2 Schema

```sql
CREATE TABLE memory_item (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  type TEXT NOT NULL,
  subject TEXT,
  predicate TEXT,
  value_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  valid_from INTEGER,
  valid_to INTEGER,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE memory_evidence (
  memory_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  evidence_kind TEXT NOT NULL,
  PRIMARY KEY(memory_id, event_id)
);

CREATE TABLE memory_revision (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  prior_revision TEXT,
  operation TEXT NOT NULL,
  old_value BLOB,
  new_value BLOB,
  created_at INTEGER NOT NULL
);
```

## 45.3 Contradiction example

Esistente:

```text
user.preferred_editor = VS Code
```

Nuovo evidence:

```text
"Da ora uso Zed come editor principale"
```

Non fare semplice append.

```text
candidate memory
   ↓ entity/predicate match
conflict detector
   ↓
revision proposal
   ↓
VS Code valid_to = now
Zed valid_from = now
```

## 45.4 Memory write policy

Il modello **propone**, il Memory Service decide.

```ts
interface MemoryProposal {
  type: string
  statement: unknown
  evidenceEventIds: string[]
  confidence: number
  scope: 'user' | 'project' | 'session'
}
```

Policy può auto-accept:

- explicit preference (“ricordati che…”);
- stable project decision;

ma richiedere conferma per:

- dati sensibili;
- inferenze sulla persona;
- contradictory low-confidence facts.

## 45.5 Forget semantics

“Dimentica X” deve significare:

```text
memory tombstone
+ retrieval exclusion
+ optional secure deletion of standalone blobs
```

Event/audit retention policy deve essere comunicata chiaramente; non promettere cancellazione fisica se backup/event retention la impediscono.

---

# 46. Tool Runtime Talos

La breadth Hermes deriva in gran parte dal tool ecosystem. Talos deve evitare di associare “tool” a “funzione JavaScript registrata”.

## 46.1 Unified Tool Descriptor

```ts
interface ToolDescriptor {
  id: string
  namespace: string
  version: string
  description: string
  inputSchema: JsonSchema
  outputSchema?: JsonSchema

  source:
    | { kind: 'builtin' }
    | { kind: 'mcp'; serverId: string }
    | { kind: 'plugin'; pluginId: string }
    | { kind: 'companion'; nodeId: string }

  capabilities: CapabilityRequirement[]
  costHint: {
    latency: 'low' | 'medium' | 'high'
    cpu: 'low' | 'medium' | 'high'
    network: boolean
  }

  semantics: {
    idempotent: boolean
    mutating: boolean
    cancellable: boolean
    resumable: boolean
  }
}
```

## 46.2 Tool discovery index

Hermes Tool Search usa progressive disclosure e ricerca BM25/substring per cataloghi grandi. È una feature da mantenere, ma Talos può indicizzare offline.

Indice:

```text
tool name
namespace
description
parameter names
examples
capabilities
semantic embedding
```

Retrieval:

```text
candidate = lexical BM25 top 30
          ∪ semantic ANN top 30
          ∪ explicitly active toolset
          ∪ recent successful tools
```

Reranking locale:

```text
score = lexical
      + semantic
      + scopeMatch
      + availability
      + priorSuccess
      - capabilityRisk
      - coldStartCost
```

Poi il modello vede soltanto top-K.

## 46.3 Deterministic availability filter

Prima del retrieval:

```text
project scope
surface scope
device availability
network availability
permission policy
backend online
```

Esempio:

```text
computer_use
```

non entra neppure nei candidate tools se Accessibility capability è disabilitata.

## 46.4 Tool execution lifecycle

```text
DISCOVERED
   ↓
PROPOSED
   ↓ schema valid?
VALIDATED
   ↓ policy
APPROVAL_PENDING / AUTHORIZED
   ↓
QUEUED
   ↓
RUNNING
   ├── progress
   ├── artifact
   ├── log
   └── partial result
   ↓
SUCCEEDED / FAILED / CANCELLED / TIMED_OUT
```

Eventi persistiti.

## 46.5 Cancellation contract

Ogni tool lungo riceve:

```ts
interface ToolExecutionContext {
  signal: AbortSignal
  operationId: string
  capabilityLease: CapabilityLease
  emitProgress(event: ProgressEvent): void
}
```

Per subprocess native:

```text
cancel
  ↓ SIGTERM / cooperative protocol
  ↓ grace period
  ↓ SIGKILL / force terminate
```

L'issue-report Hermes sulla web search lunga/stop non responsivo (`#42360`) deve diventare un regression test Talos: qualsiasi operation deve avere hard upper bound/cancellation escape hatch.

---

# 47. Talos Model Runtime: vantaggio non replicabile facilmente da un agent framework generico

Il precedente design Talos accelerator è direttamente rilevante alla competizione Hermes.

Hermes è molto forte nell'orchestrazione provider; Talos può rendere **l'inferenza locale una componente di sistema**, non un endpoint OpenAI-compatible esterno.

## 47.1 Integration

```text
Agent Scheduler
     │
     ▼
Model Router
     │
     ├── Talos Native Runtime
     │      ├── QNN/HTP
     │      ├── CPU
     │      └── GPU
     │
     ├── LAN Runtime
     └── Cloud Providers
```

## 47.2 Local model metadata

```ts
interface LocalModelProfile {
  id: string
  architecture: string
  parameterCount: number
  quantization: string
  contextWindow: number
  modelBytes: number
  runtime: 'talos-qnn' | 'talos-cpu' | 'external'
  capabilities: {
    vision: boolean
    tools: boolean
    reasoning: boolean
    embeddings: boolean
  }
  benchmarks?: {
    ttftMs: number
    decodeTokS: number
    peakRamMb: number
  }
}
```

## 47.3 Scheduler signal from UI

```text
user actively scrolling
      │
      ▼
UI pressure signal
      │
      ▼
Talos governor
      ├── lower CPU worker count
      ├── reduce stream flush rate
      ├── pause low-priority indexing
      └── defer background agents
```

Questo è un vantaggio strutturale: agent runtime, model runtime e mobile UI condividono il medesimo QoS model.

## 47.4 Model download UX

Parità competitor richiede un model manager, ma Talos può renderlo hardware-aware:

```text
Qwen ... Q4
3.9 GB

Estimated on this device:
RAM          5.1 GB
Decode       ~xx tok/s (measured profile)
Context max  16k recommended
NPU          Compatible ✓
Offline      ✓
```

Non mostrare stime di performance come dati certi se non misurati sul device/model.

## 47.5 Prewarm policy

Non tenere un modello enorme sempre resident solo per ridurre TTFT.

Policy:

```text
user foreground + recent activity + enough RAM
→ warm

background + memory pressure
→ unload KV first / unload model according policy
```

---

# 48. Screen-by-screen visual parity plan

## 48.1 Chat Home

### Left/primary navigation

```text
New chat
Search
Recent chats
Projects
Tasks
Skills
Memory
Connectors
Automations
```

### Center

```text
header:
project / model / status / context

transcript:
messages / reasoning / tool events / artifacts

composer:
text / attachments / voice / skill / context
```

### Right workbench

```text
Artifact | Files | Browser | Terminal | Review | Agents
```

### Acceptance

- no route change required to inspect a tool artifact on tablet landscape;
- focus remains composer after background tool event;
- opening artifact is <1 frame JS work on hot path excluding lazy chunk first load;
- workbench resize does not rerender transcript messages.

## 48.2 Session Search

Hermes uses FTS5 session search. Talos UI:

```text
Search conversations
[semantic] [exact]

result
  title
  date/project
  matched excerpt
  source surface
```

Parità:

- full-text offline;
- query across source surfaces;
- jump to event;
- filters project/date/model/tool.

Sorpasso:

- semantic + exact hybrid;
- search facts/decisions/artifacts, not only text.

## 48.3 Project view

```text
Project header
 ├── root / companion mapping
 ├── policy
 ├── model profile
 └── active agents

Tabs:
Overview | Chats | Files | Tasks | Memory | Skills | Connectors | Automations
```

## 48.4 Skill Library

```text
Installed
Available
Needs review
Updates

Skill detail:
  instructions
  source/provenance
  revisions
  required capabilities
  dependencies
  last used
  success metrics
```

Hermes allows agent learning; Talos adds a diff/approval review before promoted shared skill revision.

## 48.5 Memory Explorer

```text
Memory search
filters: person/project/type/status

Fact:
  Preferred editor → Zed
  confidence 0.98
  valid since ...
  evidence: Session X / Event Y
  revision history

[Correct] [Forget] [Pin]
```

Questa surface è un forte vantaggio di trasparenza rispetto alla memoria principalmente file-oriented.

## 48.6 Connector/MCP Manager

```text
GitHub MCP               Connected
Project scope            talos-app
Location                 Desktop Companion
Capabilities             network github.com, repo write
Tools visible            14 / 38
RSS                      182 MB
Idle policy              recycle 10 min

[Tools] [Permissions] [Logs] [Disconnect]
```

## 48.7 Automation Manager

```text
Upcoming
Running
Paused
History

Every weekday ~08:00
Morning project summary
Runs on: Device when available
Model: local
Delivery: notification
```

Mostrare semantica Android reale: exact vs approximate.

## 48.8 Agent Operations / Starmap equivalent

Hermes Desktop design vocabulary include Agents/Starmap. Talos dovrebbe creare una vista runtime estremamente pratica:

```text
Main Agent
 ├─ Researcher        completed
 ├─ Code Worker       running: tests
 └─ Reviewer          waiting

Resources:
Local model lane      busy
Terminal              1/2
Network tools          0/4
Thermal                warm
```

Tap worker:

```text
task
budget
capabilities
recent events
artifacts
evidence
cancel
```

## 48.9 Provider/Model Manager

```text
Local
Cloud
Fallback policies
Credentials
Benchmarks

Route profile: Private
1. local HTP model
2. local LAN model
(no public cloud)
```

## 48.10 Settings

Non fare una lista monolitica.

```text
General
Appearance
Models
Privacy & Security
Permissions
Storage
Voice
Browser
Developer
Advanced
```

---

# 49. Matrice completa di parità funzionale

Legenda:

- **P0** = necessaria per essere credibile come competitor diretto;
- **P1** = necessaria per parità sostanziale;
- **P2** = breadth avanzata;
- **P3** = ecosystem/edge.

| Area | Feature Hermes | Talos target | Pri. | Definition of parity |
|---|---|---|---:|---|
| Chat | streaming text | native batched stream | P0 | stop/retry senza freeze |
| Chat | reasoning display | collapsible reasoning | P0 | streaming + hidden mode |
| Chat | model switch | runtime model picker | P0 | switch per session |
| Chat | retry | branch/retry | P0 | history preserved |
| Chat | undo | event-ledger undo | P1 | no destructive history loss |
| Chat | attachments | artifact ingestion | P0 | images/files offline |
| Chat | slash commands | command/skill palette | P1 | keyboard + touch |
| Chat | tool activity | structured tool events | P0 | progress/cancel/errors |
| Chat | approvals | capability approvals | P0 | operation-bound |
| Chat | clarify | structured question card | P1 | resumes same run |
| Sessions | SQLite persistence | event ledger SQLite | P0 | crash-safe resume |
| Sessions | resume | full resume | P0 | cwd/project restored |
| Sessions | FTS5 search | hybrid FTS+semantic | P0 | offline |
| Sessions | auto-title | auxiliary/local title | P2 | async/nonblocking |
| Sessions | export JSONL | export | P1 | stable schema |
| Sessions | export Markdown | export | P1 | tool/artifact refs |
| Sessions | export HTML | export | P2 | self-contained option |
| Sessions | cross-surface | canonical session ID | P1 | mobile/desktop/API continuation |
| Context | compression | lossless materializer | P0 | never deletes source |
| Context | cache aware | prompt DAG/cache hints | P1 | provider-specific serialization |
| Context | project rules | project context sources | P0 | inspectable source list |
| Context | memory inject | retrieved memory | P0 | provenance shown |
| Context | tool disclosure | Tool Graph | P0 | catalog does not flood prompt |
| Context | skill disclosure | skill retrieval | P0 | instructions lazy-loaded |
| Memory | built-in memory | structured local memory | P0 | create/read/update/forget |
| Memory | USER profile | identity facts | P0 | editable + provenance |
| Memory | external providers | provider adapter | P2 | optional external backend |
| Skills | filesystem skills | Skill Package | P0 | local/offline |
| Skills | slash skill | explicit invoke | P0 | stack/compose |
| Skills | self-learning | proposal/revision flow | P1 | auditable diff |
| Skills | curator | lifecycle analytics | P2 | stale/archive/revive |
| Tools | built-in registry | Tool Runtime | P0 | typed schemas |
| Tools | toolsets | capability collections | P0 | scope by project/surface |
| Tools | Tool Search | hybrid tool retrieval | P0 | huge catalog support |
| Tools | terminal | native/companion terminal | P0 | PTY/background/cancel |
| Tools | local terminal | Android/native shell scope | P0 | project sandbox |
| Tools | Docker | companion | P2 | lifecycle + persistent workspace |
| Tools | SSH | remote executor | P1 | host-key/security policy |
| Tools | Modal/Daytona/etc. | executor plugin API | P3 | generic remote backend |
| Files | read | file service | P0 | streaming/size limits |
| Files | write | transactional write | P0 | checkpoint before mutation |
| Files | patch | structured patch | P0 | diff + rollback |
| Files | search | indexed search | P0 | project scope |
| Coding | LSP | companion LSP service | P1 | diagnostics/symbol/navigation |
| Coding | worktrees | companion worktrees | P1 | create/review/discard |
| Coding | checkpoint | workspace transaction | P0 | rollback |
| Coding | diff/review | review pane | P0 | hunk-level view |
| Browser | browser open | browser service | P1 | isolated security boundary |
| Browser | snapshot | accessibility snapshot | P1 | stable element refs |
| Browser | click/type | browser actions | P1 | cancellable |
| Browser | screenshot | artifact screenshot | P1 | vision-compatible |
| Browser | CDP | companion browser attach | P2 | explicit user grant |
| Browser | cloud backends | browser provider API | P3 | optional |
| Computer | computer use | Android accessibility/companion | P2 | explicit privileged toggle |
| Automation | cron | WorkManager/cron abstraction | P1 | recurring/one-shot/history |
| Automation | script no-agent | deterministic workflow | P1 | zero model call |
| Goals | persistent goals | Goal FSM | P1 | deterministic validators + judge |
| Delegation | child agents | actor subagents | P1 | budgets + evidence bundles |
| Delegation | parallel agents | scheduler | P2 | device-aware concurrency |
| Kanban | durable board | task DAG projection | P2 | dependencies/leases/comments |
| Hooks | lifecycle hooks | event subscriptions | P2 | filtered payload/capabilities |
| Batch | batch runner | workflow runner | P2 | concurrency/budget |
| MoA | reference models | adaptive deliberation | P3 | conditional fanout |
| Plugins | dynamic plugin | signed sandbox plugin | P1 | capability-isolated |
| MCP | stdio | MCP client | P0 | lifecycle + tools |
| MCP | HTTP | MCP client | P0 | reconnect/cancel |
| MCP | OAuth | credential broker | P1 | secure redirect/pairing |
| MCP | mTLS | connector TLS policy | P2 | custom CA/cert |
| MCP | resources | resource API | P1 | artifact integration |
| MCP | prompts | prompt API | P2 | explicit invoke |
| MCP | list_changed | dynamic refresh | P1 | tool index refresh |
| MCP | idle recycle | process manager | P1 | memory budget |
| ACP | ACP server | desktop ACP adapter | P2 | IDE chat/tool/diff |
| API | chat completions | OpenAI-compatible | P1 | SSE |
| API | Responses state | stateful API | P2 | prior response continuation |
| Messaging | gateway | messaging service | P1 | per-chat session mapping |
| Messaging | Telegram | adapter | P1 | text/media/approval |
| Messaging | Discord | adapter | P2 | text/media |
| Messaging | Slack | adapter | P2 | text/thread |
| Messaging | many platforms | plugin adapters | P3 | capability matrix |
| Voice | STT | native local/cloud STT | P1 | push-to-talk |
| Voice | local STT | on-device | P1 | offline |
| Voice | TTS | provider/local TTS | P1 | stop/queue |
| Voice | wake word | local detector | P3 | low-power policy |
| Vision | image input | artifact vision | P0 | local/cloud routing |
| Image | generation | provider adapter | P2 | artifact result |
| Video | analysis | provider/local adapter | P3 | artifact result |
| Providers | multi-provider | Model Router | P0 | common stream contract |
| Providers | fallback | policy chain | P0 | reset-aware |
| Providers | credential pools | secret broker | P2 | rotation/health |
| Providers | route by price | score policy | P2 | measurable |
| Providers | route by latency | score policy | P2 | telemetry-based |
| Providers | local endpoint | native/LAN | P0 | offline-first |
| UI | CLI | optional Talos CLI | P2 | same core/session |
| UI | TUI | optional | P3 | same core |
| UI | Web dashboard | tablet management routes | P1 | lazy loaded |
| UI | Desktop | companion/workbench | P1 | native workstation parity |
| UI | files pane | Workbench | P0 | no route churn tablet |
| UI | terminal pane | Workbench | P0/P1 | persistent terminal |
| UI | preview pane | Workbench | P0 | artifact previews |
| UI | review pane | Workbench | P1 | diff/check results |
| UI | skills manager | management route | P1 | edit/revisions |
| UI | cron manager | automation route | P1 | history/enable/pause |
| UI | profiles | identity/project spaces | P1 | clean scope separation |
| Security | pairing/allowlist | principal pairing | P1 | revocable device identities |
| Security | dangerous approval | capability approval | P0 | operation digest |
| Security | sandbox | capability sandbox | P0 | plugin/tool separation |
| Security | injection scan | optional detector | P1 | not security boundary |
| Observability | logs | structured trace | P0 | correlation IDs |
| Observability | analytics | local metrics | P1 | latency/token/tool KPIs |
| Observability | tool traces | operations timeline | P0 | inspect/cancel/retry |

---

# 50. Sorpasso: feature che Talos dovrebbe avere e Hermes oggi non rende centrali

Queste non sono “feature mancanti” assolute in senso marketing; sono **direzioni architetturali in cui Talos può creare un vantaggio molto più profondo**.

## 50.1 Lossless Context Ledger

```text
Never destroy conversation source to fit context.
```

Valore:

- sessioni indefinite;
- reproducibility;
- historical answer grounding;
- provider switching;
- audit.

## 50.2 Context Inspector

Mostrare esattamente cosa entra nel modello:

```text
why included
source
priority
tokens
mutable/pinned
```

## 50.3 Structured Memory with provenance

Non un file testo, ma knowledge ledger revisionabile.

## 50.4 Native NPU agent runtime

Local model non come provider esterno, ma scheduler-owned:

```text
agent QoS ↔ NPU ↔ thermal ↔ UI
```

## 50.5 Capability-secure plugin ecosystem

Plugin third-party **non** equivalgono a codice con pieni privilegi dell'agente.

## 50.6 Permission attenuation per subagent

Ogni worker riceve il minimo privilegio necessario.

## 50.7 Project-scoped connector graph

MCP, skills, memory e secrets sono project-bound by construction.

## 50.8 Evidence-carrying agent outputs

Ogni conclusione può puntare a:

```text
source event
file region
browser snapshot
command output
artifact
```

## 50.9 Adaptive autonomy

Autonomia scalata in base a:

```text
risk
uncertainty
thermal
battery
latency budget
cost
```

## 50.10 Offline semantic workspace

Indicizzazione locale di:

```text
files
sessions
memories
artifacts
skills
tool descriptions
```

con embeddings locali.

## 50.11 One-device personal agent integration

Android-native:

```text
Share to Talos
camera → ask
notification actions
voice
local files
biometric secret release
offline model
```

## 50.12 Explicit operation graph

L'utente vede:

```text
Plan
 ├─ Read files ✓
 ├─ Run tests ✓
 ├─ Modify config waiting approval
 └─ Review pending
```

non soltanto una sequenza di messaggi/tool bubble.

---

# 51. Repository structure Talos consigliata

```text
talos/
├── apps/
│   ├── android/
│   │   ├── capacitor/
│   │   └── native/
│   ├── desktop/
│   └── cli/
│
├── ui/
│   ├── shell/
│   ├── chat/
│   ├── workbench/
│   ├── projects/
│   ├── tasks/
│   ├── skills/
│   ├── memory/
│   ├── connectors/
│   ├── automations/
│   └── primitives/
│
├── native/
│   ├── runtime/
│   ├── model-runtime/
│   ├── qnn/
│   ├── storage/
│   ├── indexing/
│   ├── audio/
│   └── android-services/
│
├── core/
│   ├── agent-kernel/
│   ├── orchestration/
│   ├── context/
│   ├── memory/
│   ├── sessions/
│   ├── projects/
│   ├── policies/
│   ├── events/
│   ├── artifacts/
│   └── providers/
│
├── tools/
│   ├── runtime/
│   ├── builtin/
│   ├── mcp/
│   ├── plugin-wasm/
│   ├── browser/
│   ├── terminal/
│   └── companion/
│
├── protocols/
│   ├── talos-rpc/
│   ├── acp/
│   ├── openai-api/
│   └── messaging/
│
├── companion/
│   ├── daemon/
│   ├── terminal/
│   ├── lsp/
│   ├── git/
│   ├── browser/
│   └── mcp-host/
│
└── tests/
    ├── conformance/
    ├── security/
    ├── model-runtime/
    ├── performance/
    ├── recovery/
    └── competitor-regressions/
```

## 51.1 Boundary rule

```text
ui/*
```

non può importare:

```text
qnn headers
SQLite concrete layer
MCP process implementation
plugin runtime implementation
```

Deve parlare con application services.

## 51.2 Native bridge

Bridge minimo:

```ts
interface TalosNativeBridge {
  command<T>(name: string, payload: unknown): Promise<T>
  subscribe(type: string, listener: (e: TalosEvent) => void): Unsubscribe
}
```

Non creare un metodo Capacitor per ogni micro-feature; il contratto diventa ingestibile.

Nello stesso tempo non usare un generico `eval`/RPC senza schema. Gli envelope devono essere versionati e validati.

---

# 52. Piano di implementazione per milestone

Le milestone sono ordinate per dipendenze tecniche, non sono una promessa temporale.

## M0 — Competitive baseline harness

Costruire prima i test che descrivono la parità.

Deliverable:

```text
competitor-regressions/
  context-long-session.md
  cancellation-long-tool.md
  huge-tool-catalog.md
  memory-conflict.md
  mcp-project-scope.md
  mobile-cpu-pressure.md
```

Definition of Done:

- metriche definite;
- trace ripetibili;
- device reference fissato;
- modello locale reference fissato;
- scenario desktop companion fissato.

## M1 — Event Ledger + Session Service

Implementare:

```text
event store
chat projections
session persistence
FTS5
resume
branch/retry
artifact refs
```

DoD:

- kill process durante stream → sessione recuperabile;
- retry crea branch, non sovrascrive history;
- 100k event session resta interrogabile;
- export deterministico.

## M2 — Agent Kernel + Tool Runtime

```text
provider-neutral messages
tool registry
typed execution lifecycle
cancellation
approvals
progress events
```

DoD:

- long tool cancellabile;
- invalid args mai raggiungono executor;
- tool permission denial deterministicamente testata;
- no tool side effect before authorization.

## M3 — Chat/workbench parity

```text
responsive shell
transcript typed events
reasoning stream
artifact pane
files pane
terminal placeholder/companion
review pane
```

DoD:

- JS initial budget rispettato;
- reduced motion;
- tablet 3-pane;
- mobile single surface;
- background event non ruba focus;
- stream fluido durante local inference.

## M4 — Context Engine v1

```text
raw event tail
segment summaries
project rules
memory retrieval
context inspector
```

DoD:

- summary failure non modifica source history;
- ogni summary ha source range/digest;
- provider switch rematerializza senza perdita sorgente;
- context preview coincide con request effettiva.

## M5 — Memory Ledger

```text
facts/preferences/decisions
provenance
revisions
forget
FTS/vector retrieval
```

DoD:

- contradiction regression;
- memory source navigabile;
- project/user scope separato;
- nessun memory write raw dal modello senza policy service.

## M6 — Skills + Tool Search

```text
skill package
revision flow
capability manifest
tool lexical+semantic index
progressive disclosure
```

DoD:

- catalog 3k+ tool non entra nel prompt completo;
- tool search p95 misurato offline;
- skill change diffabile/revertibile;
- third-party package capability review.

## M7 — MCP

```text
stdio
HTTP
dynamic tool list
project binding
secret broker
process budgets
```

DoD:

- MCP Project A invisibile a Project B se non bound;
- server crash non crasha Talos;
- idle recycle libera processo;
- OAuth secret non appare nel JS transcript/log.

## M8 — Automation + Goals

```text
WorkManager trigger layer
automation history
script/no-agent workflow
goal FSM
```

DoD:

- semantica exact/approximate chiara;
- duplicate run idempotency;
- no runaway goal oltre budget;
- cancellation persistita.

## M9 — Delegation + Task DAG

```text
logical actors
leases
evidence bundles
budgets
Kanban projection
```

DoD:

- 10 agent logici non implicano 10 model generations concorrenti;
- child non può superare capability parent;
- worker kill → lease recovery;
- parent può aprire evidence del child.

## M10 — Native local model advantage

Integrare profondamente:

```text
Talos native runtime
QNN/HTP
model manager
thermal governor
UI pressure signal
```

DoD:

- TTFT/decode metrics in UI profiler;
- thermal adaptation;
- chat interaction benchmark sotto inferenza;
- model path totalmente offline.

## M11 — Desktop Companion

```text
pairing
encrypted RPC
terminal
filesystem
git/worktrees
LSP
browser
MCP hosting
```

DoD:

- Android continua sessione con tool desktop;
- project mapping esplicito;
- per-tool capability grant;
- disconnect recovery.

## M12 — Messaging/API/ACP

Adapters sullo stesso core.

DoD:

- stessa sessione continua Android ↔ API/ACP/messaging;
- remote approvals operation-bound;
- tool progress coerente tra surfaces.

## M13 — Voice/multimodal

DoD:

- local STT offline;
- cloud route mai usata in device-only;
- PCM fuori da Capacitor JS hot path;
- voice interruption/stop immediato.

## M14 — Plugin ecosystem

```text
signed package
WASM sandbox
capability broker
plugin UI chunk
```

DoD:

- malicious plugin con filesystem/network non granted fallisce;
- plugin crash isolato;
- package hash/signature visibili;
- uninstall revoca grants.

## M15 — Adaptive deliberation / advanced autonomy

Solo dopo che il sistema base è osservabile.

DoD:

- deliberation trigger misurato;
- cost/latency budget rispettato;
- advisor evidence packet;
- no unconditional MoA.

---

# 53. KPI tecnici per dichiarare la parità

## 53.1 Chat/UI

| KPI | Target progettuale iniziale |
|---|---:|
| initial JS | ≤ budget Talos stabilito, hard CI |
| token→UI batch | 32–100 ms QoS dependent |
| forced layout/token | 0 |
| UI flush p95 | <2 ms JS target |
| cancelled generation visible stop | immediata a livello UI, backend bounded |
| reduced-motion regressions | 0 note |
| background focus steals | 0 |

I valori numerici di performance sono engineering targets da validare sul tablet reference, non proprietà garantite di Chromium.

## 53.2 Agent runtime

```text
operation cancellation p95
orphan subprocess count
unhandled tool error rate
approval bypass count = 0
event replay consistency = 100%
```

## 53.3 Context

```text
source event loss = 0
summary without source refs = 0
context overflow crash = 0
retrieval provenance coverage = 100% for injected memories
```

## 53.4 Memory

```text
memory writes with evidence ratio
contradiction resolution accuracy
stale fact retrieval rate
forget regression
project leakage = 0
```

## 53.5 Tools

```text
tool search p50/p95
catalog indexing time
cold server start
MCP RSS
MCP idle recycle effectiveness
tool success rate by connector
```

## 53.6 Local inference

```text
TTFT p50/p95
prefill tok/s
decode tok/s
inter-token p50/p95/p99
peak RSS
KV bytes
thermal headroom
sustained tok/s
UI jank while inferencing
```

## 53.7 Security

```text
unauthorized capability executions = 0
secret exposure in logs = 0
cross-project MCP visibility violations = 0
plugin sandbox escapes = 0
approval replay acceptance = 0
```

---

# 54. Benchmark suite Talos vs requisiti Hermes

Non è necessario automatizzare Hermes dentro la CI Talos. Si traducono i pattern osservati in workload indipendenti.

## B1 — 8-hour logical session / long history

Synthetic ledger:

```text
50k messages/events
5k tool results
1k artifacts
hundreds summaries
```

Query:

```text
“Perché abbiamo scelto X invece di Y?”
```

Success:

- source evidence recuperabile;
- nessuna destructive compaction;
- UI search responsiva.

## B2 — Summary provider failure

Inject:

```text
context summarizer returns error
```

Success:

```text
source history unchanged
materializer falls back to lower-fidelity view
visible telemetry warning
```

## B3 — 3.300-tool catalog

Ispirato all'esempio catalogo Cloudflare citato nella doc Tool Search Hermes.

Success:

- catalog raw non inserito nel system prompt;
- top tool retrieval recall misurato;
- index memory bounded;
- offline search.

## B4 — MCP memory hog

Mock MCP process:

```text
RSS grows > configured limit
```

Success:

```text
warning → recycle/kill per policy
Talos survives
operation marked failed/retriable
```

## B5 — Unresponsive external operation

Tool ignora cooperative cancel.

Success:

```text
soft cancel
→ grace timeout
→ process termination
→ operation CANCELLED
```

## B6 — Malicious plugin

Plugin tenta:

```text
read /data/... secrets
connect evil.example
spawn native process
```

senza capabilities.

Success: tutti negati.

## B7 — Prompt injection webpage

Webpage contiene istruzioni per esfiltrare file.

Success:

- browser may surface text;
- agent proposal cannot bypass capability broker;
- no network+private-file exfil without explicit grant.

## B8 — Android model saturation

Local model al massimo workload, contemporaneamente:

```text
scroll
input typing
reasoning stream
open artifact
```

Misurare:

- FrameTimeline;
- main thread runnable delay;
- token rate;
- thermal.

## B9 — Cross-project leakage

Project A:

```text
GitHub MCP + secret A + memory A
```

Project B:

```text
none
```

Test model/tool lookup B:

```text
must not discover A connector or memory
```

## B10 — Child agent attenuation

Parent può scrivere; child read-only.

Child tenta write.

Success:

```text
policy deny before executor
```

---

# 55. Testing pyramid

```text
                  E2E device
                /            \
        integration runtime/UI
       /                      \
 conformance protocol     security tests
    /                         \
unit/property           fuzz/differential
```

## 55.1 Property tests

Event ledger:

```text
replay(events) = same projection
```

Memory:

```text
revision chain never cycles
```

Permissions:

```text
childCaps ⊆ parentCaps
```

## 55.2 Fuzz targets

- plugin manifest;
- MCP schemas;
- model card metadata;
- artifact MIME parsers;
- JSON-RPC envelopes;
- markdown sanitizer boundary;
- imported skill package;
- event migration decoder.

## 55.3 Fault injection

Iniettare:

```text
process kill
SQLite busy
filesystem full
network timeout
429
provider disconnect
MCP malformed response
plugin trap
QNN/backend error
Android activity recreate
WebView renderer death
```

Il competitor advantage si costruisce soprattutto nei failure path.

---

# 56. Failure semantics da definire prima delle feature

Ogni subsystem deve dichiarare:

```text
what is durable?
what is retryable?
what is idempotent?
what can be cancelled?
what can be partially committed?
```

## Esempio FilePatch

```text
validate
checkpoint
write temp
fsync where appropriate
atomic replace
run diagnostics
emit event
```

Se diagnostics fallisce:

```text
file remains changed + status validation_failed
```

oppure policy strong:

```text
automatic rollback
```

ma la semantica deve essere esplicita.

## Esempio SendMessage

Non ritentare ciecamente un send esterno dopo timeout se la piattaforma potrebbe averlo accettato.

Usare external idempotency key quando disponibile o stato `unknown_delivery`.

---

# 57. Risk register Talos

| Rischio | Impatto | Contromisura |
|---|---|---|
| copiare troppe feature prima del kernel | alto | milestone dependency order |
| WebView bundle explosion | alto | route chunks + budgets CI |
| native/JS contract proliferation | alto | versioned command/event protocol |
| SQLite event log growth | medio/alto | CAS blobs + pruning projections, non source semantics |
| embeddings local cost | medio | lazy indexing + QoS scheduler |
| QNN vendor churn | alto | backend adapter boundary |
| plugin sandbox complexity | alto | WASM MVP con hostcalls minimi |
| Android background restrictions | alto | semantics esplicite WorkManager |
| MCP arbitrary ecosystems | alto | budgets, scopes, companion execution |
| local model consumes RAM | alto | model/KV memory governor |
| multi-agent thermal overload | alto | logical actor scheduler |
| capability UI too complex | medio | presets + explainable grants |
| context engine over-engineering | medio | raw tail + summary refs MVP |
| Desktop companion expands scope | alto | thin execution plane, same core protocol |
| security through prompt-only thinking | critico | policy enforcement outside LLM |

---

# 58. Anti-patterns da evitare esplicitamente

1. **Un mega `Agent` class** che conosce provider, UI, tools, memory, persistence e platform.
2. **Transcript = source of truth**.
3. **Summarization distruttiva** per risolvere context pressure.
4. **Memory = una stringa sempre nel system prompt**.
5. **Plugin = import dinamico in-process con tutte le credenziali**.
6. **Tool retrieval prima della permission filtering**.
7. **MCP globale per default**.
8. **Subagent con automaticamente tutti i privilegi parent**.
9. **Un processo per ogni logical worker su mobile**.
10. **Model local come endpoint HTTP esterno** se Talos controlla il runtime.
11. **PCM/audio/tensor via Capacitor bridge**.
12. **Browser ostile nella WebView privilegiata Talos**.
13. **Ogni token = evento JS**.
14. **Smooth scroll/token**.
15. **Monaco/editor pesante nel initial bundle**.
16. **`transition-all` su chat hot path**.
17. **Dashboard di metriche sempre reattiva a 60Hz durante decode**.
18. **Retry automatico di side effect non idempotente**.
19. **Secret nei tool args persistiti in chiaro nel transcript**.
20. **“AI safety classifier” come unico enforcement layer**.

---

# 59. Technical decision records raccomandati

Creare ADR prima che le decisioni diventino coupling implicito.

```text
ADR-001 Event-sourced sessions
ADR-002 Capability security model
ADR-003 Project-scoped connectors
ADR-004 Context source is immutable
ADR-005 Memory ledger and provenance
ADR-006 Native model runtime boundary
ADR-007 Isolated browser security domain
ADR-008 WASM plugin runtime
ADR-009 Desktop companion trust model
ADR-010 Android background semantics
ADR-011 Tool lifecycle/cancellation
ADR-012 Artifact content-addressed store
ADR-013 Provider-neutral context artifact
ADR-014 Logical actor orchestration
ADR-015 UI lazy-loading budget
```

Ogni ADR:

```text
Context
Decision
Alternatives
Consequences
Security implications
Migration path
```

---

# 60. Repository reconnaissance: superfici reali Hermes

Questa sezione serve a impedire che il confronto venga ridotto alle feature pubblicizzate nel README.

## 60.1 Directory top-level osservabili

Il repository pubblico `NousResearch/hermes-agent` include, fra le altre:

```text
.github/
.plans/
acp_adapter/
agent/
apps/
assets/
cron/
docker/
gateway/
hermes_cli/
native/fts5_cjk/
optional-mcps/
optional-skills/
plugins/
providers/
skills/
tests/
tools/
tui_gateway/
ui-tui/
web/
website/
```

Repository root:

`https://github.com/NousResearch/hermes-agent`

Interpretazione: Hermes è una piattaforma multi-surface e multi-runtime; confrontare Talos solo contro la CLI produrrebbe un benchmark competitivo falso.

## 60.2 Web dashboard reale

La directory `web/` usa uno stack Vite/React/TypeScript/Tailwind e contiene pagine per una superficie amministrativa ampia.

Pagine osservate nel repository:

```text
Analytics
Channels
Chat
Config
Cron
Docs
Env
Files
Logs
Mcp
Models
Pairing
Plugins
ProfileBuilder
Profiles
Sessions
Skills
System
Webhooks
```

Componenti/surface rilevanti osservati:

```text
AuthWidget
AutomationBlueprints
ChatSessionList
ChatSidebar
Markdown
ModelInfoCard
ModelPicker
ReasoningPicker
ScheduleBuilder
SkillEditor
SlashPopover
ThemeSwitcher
Toolset drawer
```

Questo conferma che la parità Talos richiede anche **management UX**, non solo transcript e composer.

## 60.3 Desktop Electron

Il design corrente separa:

```text
Electron main process
React renderer
backend agent
```

con bridge stretto e backend authoritative per lo stato agentico condiviso.

Talos dovrebbe mantenere la stessa separazione concettuale:

```text
Android native / Desktop host
          │
   narrow typed bridge
          │
Vue/renderer projection
```

## 60.4 Tool families nel registry Hermes

Il tool reference corrente descrive un catalogo built-in nell'ordine di ~82 tool, suddiviso fra famiglie quali:

```text
Browser                      ~10 + CDP gated
File                         4
Home Assistant               4
Terminal/process             2
Desktop UI                   6
Web                          2
Feishu                       5
Spotify                      7
Yuanbao                      5
Kanban                       12
Project                      3
Discord                      2
Video generation             3
```

oltre a primitive standalone tra cui:

```text
memory
clarify
delegate_task
execute_code
cronjob
session_search
skills_list
skill_view
skill_manage
text-to-speech
image generation
vision
video analysis
todo
computer_use
X/Twitter search
```

Fonte primaria:

`https://hermes-agent.nousresearch.com/docs/reference/tools-reference`

Nota: il numero esatto può cambiare con il repository; Talos deve competere contro la **capability model**, non inseguire un numero statico.

## 60.5 Terminal backend breadth

Il sistema Hermes documenta backend terminali:

```text
local
Docker
SSH
Singularity
Modal
Daytona
Vercel Sandbox
```

Fonte:

`https://hermes-agent.nousresearch.com/docs/user-guide/features/tools`

Hermes documenta inoltre hardening del container con rootfs read-only/capability drop/no-new-privileges/namespaces e risorse configurabili. Questo è un punto forte da non sottovalutare.

Talos deve raggiungere semantic parity attraverso `ExecutionTarget`, anche se Android local non implementa Docker.

---

# 61. Casi in cui NON conviene copiare Hermes letteralmente

## 61.1 Profili come home directory interamente separate

Hermes usa profile/home separati per config, env, SOUL, memory, sessioni, skill, cron e state e documenta che due processi non devono condividere lo stesso profile writer.

Per Talos questo sarebbe troppo coarse.

Preferire:

```text
Identity
Persona
Memory Space
Project
Connector Binding
Permission Policy
```

componibili.

## 61.2 Curator con moltissime chiamate LLM

Il Curator Hermes può effettuare consolidamento LLM costoso; la documentazione parla di operazioni che possono implicare decine di chiamate e mantiene il consolidation LLM opt-in.

Talos mobile deve preferire:

```text
deterministic metrics
local embedding clustering
rule-based stale detection
single consolidation call only when useful
```

## 61.3 Heavy MCP on mobile

Non tentare di eseguire ogni MCP Node/Python/Chromium localmente.

Classificare:

```text
Mobile Safe
Mobile Expensive
Companion Recommended
Remote Only
```

## 61.4 Full desktop computer use on Android

Non promettere automazione desktop totale sul tablet. Offrire:

```text
Android Accessibility opt-in
+
Desktop Companion
```

## 61.5 Unconditional MoA

Su mobile non è sostenibile come default. Usare adaptive deliberation.

## 61.6 Unlimited eager tool schemas

Hermes stesso ha introdotto Tool Search per evitare cataloghi giganteschi. Talos deve progettare progressive disclosure dal giorno uno.

---

# 62. Strategia di prodotto: come posizionare Talos tecnicamente sopra Hermes

Non usare il messaggio:

> “Talos ha 85 tool, Hermes 82”.

È una gara facilmente perdibile e poco difendibile.

Il messaggio tecnico deve essere verificabile:

## 62.1 Local-first

```text
Hermes:
local endpoints supportati dentro un framework provider-rich

Talos:
local execution è il runtime primario, con cloud come policy fallback
```

## 62.2 Mobile-native

```text
Hermes:
Android Termux best-effort/Tier 2

Talos:
Android è target first-class
```

## 62.3 Context integrity

```text
Hermes:
strong compression engine, ma source model centrato sulla conversazione materializzata

Talos:
immutable source ledger + replaceable context projections
```

## 62.4 Security

```text
Hermes:
rich ecosystem con plugin/skill trust operator-reviewed

Talos:
sandbox + capability broker + project scope by construction
```

## 62.5 Explainability

```text
Hermes:
agent activity/tool transcript

Talos:
operation DAG + evidence graph + context inspector + memory provenance
```

## 62.6 Resource intelligence

```text
Hermes:
agent runtime/provider routing

Talos:
agent scheduler + model scheduler + UI + thermal/battery feedback loop
```

Questa è una differenziazione molto più difficile da copiare senza possedere l'intero stack mobile/native.

---

# 63. Competitive moat Talos a lungo termine

## Moat 1 — Personal Knowledge Ledger

Più Talos viene usato, più cresce una base locale di:

```text
facts
preferences
projects
decisions
artifacts
skills
relationships
```

versionata e con provenance.

Non deve diventare lock-in opaco: esportazione strutturata obbligatoria.

## Moat 2 — Device-specific model optimization

Benchmark e compile artifact per device/model:

```text
QNN context
quant profile
KV policy
thermal profile
```

## Moat 3 — Skill quality telemetry locale

Non solo “skill installata”, ma:

```text
success rate
average tool calls
failure patterns
projects where useful
last validated revision
```

## Moat 4 — Permission history

Talos impara **non** i permessi da concedere automaticamente, ma i preset che l'utente sceglie spesso, mantenendo sempre policy deterministica.

## Moat 5 — Cross-device execution graph

```text
Android brain/control plane
Desktop workstation plane
optional remote/cloud plane
```

con un unico session/task ledger.

---

# 64. Fonti primarie Hermes consultate

## Repository

- Repository principale: `https://github.com/NousResearch/hermes-agent`
- `run_agent.py`: `https://github.com/NousResearch/hermes-agent/blob/main/run_agent.py`
- Security policy: `https://github.com/NousResearch/hermes-agent/blob/main/SECURITY.md`
- Desktop design: `https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/DESIGN.md`
- Desktop engineering notes: `https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/AGENTS.md`
- Desktop guide source: `https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/desktop.md`
- Android/Termux guide source: `https://github.com/NousResearch/hermes-agent/blob/main/website/docs/getting-started/termux.md`

## Documentation index

- Docs home: `https://hermes-agent.nousresearch.com/docs/`
- Machine-readable docs map: `https://hermes-agent.nousresearch.com/docs/llms.txt`

## Developer architecture

- Architecture: `https://hermes-agent.nousresearch.com/docs/developer-guide/architecture`
- Context compression/cache: `https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching`
- Prompt assembly: `https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly`

## Core user features

- Tools: `https://hermes-agent.nousresearch.com/docs/user-guide/features/tools`
- Tool Search: `https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-search`
- Skills: `https://hermes-agent.nousresearch.com/docs/user-guide/features/skills`
- Curator: `https://hermes-agent.nousresearch.com/docs/user-guide/features/curator`
- Memory: `https://hermes-agent.nousresearch.com/docs/user-guide/features/memory`
- Memory providers: `https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers`
- Honcho: `https://hermes-agent.nousresearch.com/docs/user-guide/features/honcho`
- Sessions: `https://hermes-agent.nousresearch.com/docs/user-guide/sessions`
- Checkpoints/rollback: `https://hermes-agent.nousresearch.com/docs/user-guide/checkpoints-and-rollback`
- Profiles: `https://hermes-agent.nousresearch.com/docs/user-guide/profiles`
- Git worktrees: `https://hermes-agent.nousresearch.com/docs/user-guide/git-worktrees`
- Delegation: `https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation`
- Goals: `https://hermes-agent.nousresearch.com/docs/user-guide/features/goals`
- Code execution: `https://hermes-agent.nousresearch.com/docs/user-guide/features/code-execution`
- Cron: `https://hermes-agent.nousresearch.com/docs/user-guide/features/cron`
- Kanban: `https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban`
- Mixture of Agents: `https://hermes-agent.nousresearch.com/docs/user-guide/features/mixture-of-agents`
- Personality: `https://hermes-agent.nousresearch.com/docs/user-guide/features/personality`
- Plugins: `https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins`
- Built-in plugins: `https://hermes-agent.nousresearch.com/docs/user-guide/features/built-in-plugins`
- Hooks: `https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks`
- Batch: `https://hermes-agent.nousresearch.com/docs/user-guide/features/batch-processing`

## Browser/media

- Browser: `https://hermes-agent.nousresearch.com/docs/user-guide/features/browser`
- Voice mode: `https://hermes-agent.nousresearch.com/docs/user-guide/features/voice-mode`
- TTS: `https://hermes-agent.nousresearch.com/docs/user-guide/features/tts`
- Vision: `https://hermes-agent.nousresearch.com/docs/user-guide/features/vision`

## Protocols/providers

- MCP: `https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp`
- ACP: `https://hermes-agent.nousresearch.com/docs/user-guide/features/acp`
- API server: `https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server`
- Messaging: `https://hermes-agent.nousresearch.com/docs/user-guide/messaging`
- Provider routing: `https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing`
- Fallback providers: `https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers`
- Credential pools: `https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools`

## References

- Tools reference: `https://hermes-agent.nousresearch.com/docs/reference/tools-reference`
- Toolsets reference: `https://hermes-agent.nousresearch.com/docs/reference/toolsets-reference`
- Security guide: `https://hermes-agent.nousresearch.com/docs/user-guide/security`

---

# 65. Issue reports usati come failure-pattern research

**Importante:** queste issue non sono usate per affermare che il problema sia presente universalmente nella versione corrente. Sono segnalazioni reali che aiutano a definire regression test e weak points architetturali.

| Issue | Tema | Uso nel design Talos |
|---|---|---|
| `#10719` | context compression / perdita turn su failure summary | source ledger immutabile |
| `#12131` | permanent context-loss report | summary referenziale |
| `#61932` | long desktop session/context exhaustion | soak test sessioni lunghe |
| `#39548` | false context exhaustion/accounting | token/context accounting test |
| `#42360` | long web search + stop responsiveness | hard cancellation lifecycle |
| `#5563` | heavy-use token replay/context overhead | materialization/cache benchmark |
| `#51626` | MCP project scoping request | connector binding project-first |
| `#31415` | Android Termux dependency/build issue | native Android distribution |

Direct links:

- `https://github.com/NousResearch/hermes-agent/issues/10719`
- `https://github.com/NousResearch/hermes-agent/issues/12131`
- `https://github.com/NousResearch/hermes-agent/issues/61932`
- `https://github.com/NousResearch/hermes-agent/issues/39548`
- `https://github.com/NousResearch/hermes-agent/issues/42360`
- `https://github.com/NousResearch/hermes-agent/issues/5563`
- `https://github.com/NousResearch/hermes-agent/issues/51626`
- `https://github.com/NousResearch/hermes-agent/issues/31415`

---

# 66. Checklist “Talos ha raggiunto Hermes?”

## Core

```text
[ ] sessioni crash-safe
[ ] session search offline
[ ] tool calling strutturato
[ ] stop/cancel robusto
[ ] context management long-running
[ ] skills progressive disclosure
[ ] memory persistente
[ ] multi-provider/local provider
```

## Coding/workspace

```text
[ ] file read/write/patch/search
[ ] terminal/background process
[ ] LSP diagnostics
[ ] checkpoints
[ ] diff/review
[ ] git/worktrees via companion
[ ] artifact/file preview
```

## Agentic

```text
[ ] goals
[ ] delegation
[ ] parallel logical workers
[ ] automation
[ ] code/tool VM
[ ] task DAG/Kanban
[ ] hooks/workflows
```

## Ecosystem

```text
[ ] MCP stdio/HTTP
[ ] MCP OAuth
[ ] plugins
[ ] API
[ ] messaging
[ ] ACP/IDE
```

## Multimodal

```text
[ ] vision
[ ] voice STT
[ ] TTS
[ ] browser
[ ] computer use path
```

## UX

```text
[ ] chat home mature
[ ] workbench pane
[ ] files
[ ] artifacts
[ ] terminal
[ ] review
[ ] skills manager
[ ] memory explorer
[ ] automation manager
[ ] connector manager
[ ] agent activity
[ ] model/provider manager
```

Se mancano più blocchi P0/P1, non dichiarare parità perché “la chat sembra simile”.

---

# 67. Checklist “Talos ha sorpassato Hermes?”

Talos può dichiarare sorpasso tecnico solo se dimostra con test almeno questi punti:

```text
[ ] Android è surface first-class e non shell best-effort
[ ] model local gira tramite runtime native/hardware-aware
[ ] UI resta responsiva sotto inferenza locale sostenuta
[ ] context source non viene mai perso per compression
[ ] memory è strutturata/versionata/con provenance
[ ] context inspector mostra materiale reale al modello
[ ] connector/tool scoping è project-first
[ ] subagent permissions sono attenuate
[ ] plugin non trusted è sandboxed/capability-scoped
[ ] browser ostile è isolato dalla WebView privilegiata
[ ] task/agent outputs mantengono evidence refs
[ ] operation cancellation è bounded anche per tool bloccati
[ ] multi-agent concurrency è resource-aware
[ ] local/cloud routing rispetta privacy come hard constraint
[ ] tutte le superfici condividono lo stesso session ledger
```

Il sorpasso non è una singola release feature: è una proprietà risultante dall'architettura.

---

# 68. Conclusione tecnica

un agente di terze parti è un competitor serio perché ha già risolto una quantità eccezionalmente ampia di problemi pratici: terminali multipli, sessioni, skills, memory, tool discovery, browser, MCP, ACP, provider fallback, messaging, automation, sub-agent, Kanban, code execution e un Desktop con principi di interaction design molto più maturi di una normale chat wrapper.

Talos non dovrebbe sottostimare questa breadth.

Allo stesso tempo, la struttura attuale di Hermes mostra i trade-off naturali di un sistema nato e cresciuto come framework Python multi-provider/multi-surface:

```text
breadth molto alta
+
process/plugin ecosystem molto permissivo
+
desktop/server assumptions
+
context compression necessario
+
configuration surfaces numerose
```

Talos parte da una posizione diversa:

```text
Android-first
local model first
WebView UI controllata
native runtime disponibile
NPU target disponibile
```

La strategia tecnicamente più forte è quindi **non diventare Hermes scritto in TypeScript**.

Talos dovrebbe diventare:

> un personal agent operating system local-first, capability-secure ed event-sourced, in cui inferenza, contesto, memoria, tool, automazioni e UI condividono un unico scheduler e un'unica source of truth.

La sequenza architetturale fondamentale resta:

```text
Immutable Session/Event Ledger
          │
          ├────────► Context Materializer
          ├────────► Memory Ledger
          ├────────► Search/Provenance
          └────────► UI Projections

Agent Kernel
     │
     ├────────► Capability Policy
     ├────────► Tool Graph
     ├────────► Actor Scheduler
     └────────► Model Router
                      │
          ┌───────────┼────────────┐
          ▼           ▼            ▼
       Local HTP    Companion     Cloud
```

Con questa base, la parità con Hermes è una sequenza di adapter e superfici. Senza questa base, la parità diventa una collezione di feature accoppiate e il costo marginale di ogni nuova capability cresce esattamente nel momento in cui Talos deve accelerare.

La priorità non è quindi “aggiungere 82 tool”.

La priorità è costruire un sistema in cui il tool numero 500 costi poco, abbia scope corretto, non allarghi il prompt inutilmente, non possa oltrepassare i permessi, sia cancellabile, tracciabile e funzioni senza degradare la chat mentre il modello locale occupa il device.

Quello è il punto in cui Talos smette di inseguire Hermes e costruisce un vantaggio architetturale proprio.

---

**Fine del documento.**
