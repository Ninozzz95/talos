# Claude Tooling Matrix — Proprietario, Open Source e Alternative Model-Agnostic

**Formato:** Technical Reference  
**Lingua:** Italiano  
**Ambito:** Claude API, Claude Code, Claude Chat, Research, file generation, computer use, MCP, artifact runtime  
**Obiettivo:** documentare in modo compatto ma tecnico i tool usati o esposti dall'ecosistema Claude, classificandoli per disponibilità, portabilità e controparte open source.

---

## 1. Scopo del documento

Questo documento risponde a quattro domande:

1. Quali tool può chiamare Claude?
2. Quali tool sono proprietari Anthropic?
3. Quali tool sono open source o costruibili in modo indipendente?
4. Quale controparte open source può essere usata con altri modelli come GPT, Gemini, Mistral, Llama o modelli locali?

> **Nota importante**
>
> Claude non dispone di un catalogo universale e chiuso di tool.
>
> Il modello può chiamare:
>
> - tool server-side forniti da Anthropic;
> - tool client-side implementati dallo sviluppatore;
> - tool built-in di Claude Code;
> - custom tools definiti tramite JSON Schema;
> - tool esposti da server MCP;
> - connettori proprietari o custom;
> - strumenti applicativi incorporati nelle superfici Claude.

Di conseguenza, l'elenco dei tool esterni è teoricamente illimitato.

---

# 2. Legenda

| Etichetta | Significato |
|---|---|
| **Proprietario** | Implementazione o servizio controllato da Anthropic |
| **Schema pubblico** | Il contratto input/output è pubblico, ma non necessariamente l'implementazione |
| **OSS** | Open source con licenza consultabile |
| **Model-agnostic** | Utilizzabile con modelli diversi da Claude |
| **Adapter richiesto** | Riutilizzabile con altri modelli dopo una trasformazione del protocollo o dell'API |
| **Drop-in** | Sostituzione diretta senza modifiche rilevanti |
| **Equivalente funzionale** | Offre capacità simili, ma non è compatibile al 100% |
| **Self-hostable** | Può essere eseguito su infrastruttura propria |

---

# 3. Matrice principale: Claude API e Claude Chat

| Capacità Claude | Categoria | Stato | Open source | Portabile su altri modelli | Controparte open source consigliata | Note tecniche |
|---|---|---|---:|---:|---|---|
| **Web Search** | Server tool | Proprietario Anthropic | No | No, non direttamente | [SearXNG](https://github.com/searxng/searxng), adapter verso provider search, OpenSearch custom | Claude riceve risultati citabili; la controparte OSS richiede ranking, deduplica, metadata e citation pipeline |
| **Web Fetch** | Server tool | Proprietario Anthropic | No | No, non direttamente | [Playwright](https://github.com/microsoft/playwright) + [Trafilatura](https://github.com/adbar/trafilatura) | Playwright gestisce rendering JS; Trafilatura estrae contenuto, titolo, autore e data |
| **Code Execution** | Server tool | Proprietario Anthropic | No | No, non direttamente | [gVisor](https://github.com/google/gvisor), [Firecracker](https://github.com/firecracker-microvm/firecracker), container OCI, [Jupyter](https://github.com/jupyter) | La controparte OSS deve implementare sandbox, filesystem, rete, timeout, quote, logging e cleanup |
| **Advisor model** | Server tool | Proprietario Anthropic | No | Sì come pattern | [LangGraph](https://github.com/langchain-ai/langgraph), router custom, multi-model delegation | Pattern “executor + advisor”: un modello economico consulta un modello più potente |
| **Tool Search Regex** | Server tool | Proprietario | No | Sì come pattern | PostgreSQL FTS, ripgrep, OpenSearch, Elasticsearch | Indicizzazione e caricamento differito delle definizioni tool |
| **Tool Search BM25** | Server tool | Proprietario | No | Sì come pattern | OpenSearch, Elasticsearch, Meilisearch, BM25 custom | Utile quando il catalogo contiene centinaia o migliaia di tool |
| **MCP Connector ospitato** | Server tool | Gateway proprietario | No | Sì tramite MCP | [Model Context Protocol](https://github.com/modelcontextprotocol/modelcontextprotocol) | Il gateway Anthropic è proprietario, ma MCP è aperto e model-agnostic |
| **Memory tool** | Client tool | Schema pubblico | Backend a carico dello sviluppatore | Sì | Filesystem, SQLite, PostgreSQL, Redis, [pgvector](https://github.com/pgvector/pgvector), [Qdrant](https://github.com/qdrant/qdrant) | Distinguere memoria operativa, preferenze, knowledge base e long-term memory |
| **Bash tool** | Client tool | Schema pubblico | Implementazione propria | Sì | PTY executor, container OCI, gVisor, Firecracker | Necessari isolamento, timeout, limiti di output, cwd e variabili persistenti |
| **Text Editor tool** | Client tool | Schema pubblico | Implementazione propria | Sì | unified diff, Git apply, [Tree-sitter](https://github.com/tree-sitter/tree-sitter), LSP Workspace Edit | Exact string replace è semplice ma fragile; AST/LSP è preferibile per refactor |
| **Computer Use** | Client tool | Schema pubblico + demo | Parzialmente | Sì con adapter | [Playwright](https://github.com/microsoft/playwright), PyAutoGUI, xdotool, browser VNC | Distinguere browser automation da controllo desktop completo |
| **Custom tools** | Client tool | Contratto JSON Schema | Sì come pattern | Sì | JSON Schema + dispatcher, MCP, OpenAPI adapter | Il modello produce la richiesta; il runtime esegue l'azione |
| **Agent orchestration** | Runtime | Proprietario | No | Sì tramite alternative | LangGraph, [OpenHands](https://github.com/All-Hands-AI/OpenHands), orchestration custom | Include planning, retry, subagent, task graph, stop condition |
| **Durable workflows** | Runtime | Proprietario | No | Sì | [Temporal](https://github.com/temporalio/temporal), Inngest, Celery | Necessari checkpoint, retry, timers, idempotenza e resume |
| **RAG / knowledge base** | Runtime | Proprietario | No | Sì | [Haystack](https://github.com/deepset-ai/haystack), [LlamaIndex](https://github.com/run-llama/llama_index), pgvector, Qdrant | La qualità dipende da chunking, retrieval, reranking, metadata e freshness |
| **DOCX generation** | File generation | Implementazione interna non pubblicata | No | Sì con alternativa | [python-docx](https://github.com/python-openxml/python-docx) | Richiede stili, heading, tabelle, immagini, page break e QA visiva |
| **XLSX generation** | File generation | Implementazione interna non pubblicata | No | Sì con alternativa | [openpyxl](https://pypi.org/project/openpyxl/) | Richiede formule, stili, tabelle, freeze pane, grafici e verifica errori |
| **PPTX generation** | File generation | Implementazione interna non pubblicata | No | Sì con alternativa | [python-pptx](https://github.com/scanny/python-pptx) | Richiede controllo overflow, font, immagini, note, aspect ratio |
| **PDF generation** | File generation | Implementazione interna non pubblicata | No | Sì con alternativa | [WeasyPrint](https://github.com/Kozea/WeasyPrint), ReportLab, pypdf, Pandoc | Preferire pipeline render → verify → repair |
| **Chart e PNG** | Data visualization | Sandbox proprietaria | No | Sì con alternativa | Matplotlib, Plotly, Altair, Vega-Lite, Graphviz | Separare chart quantitativi da diagrammi e illustrazioni |
| **Image synthesis** | Generative media | Non equivalente a un image model dedicato | No | Sì con provider esterno | [ComfyUI](https://github.com/Comfy-Org/ComfyUI), Stable Diffusion ecosystem | Richiede modelli, GPU, safety filter, metadata e workflow |
| **Artifact runtime** | Runtime interattivo | Proprietario Claude | No | Sì con alternativa | [Sandpack](https://github.com/codesandbox/sandpack), iframe sandbox, static hosting | Richiede isolamento origin, CSP, build, versioning, storage e publish |
| **Interactive connectors** | App integration | Proprietario | No | Sì con MCP Apps | [MCP ext-apps](https://github.com/modelcontextprotocol/ext-apps), iframe UI custom | L'interfaccia deve avere permission boundary e capability bridge |
| **Research multi-step** | Research | Proprietario | No | Sì con alternativa | LangGraph/Haystack + SearXNG + Trafilatura + citation engine | Richiede query planning, source scoring, deduplica e claim-source mapping |
| **News research** | Research | Proprietario | No | Sì con alternativa | SearXNG, RSS/Atom, GDELT client, event clustering custom | Distinguere data pubblicazione, data evento e aggiornamenti |
| **Image search** | Search | Servizio gestito | No | Sì con alternativa | SearXNG image search, provider adapter | Attenzione a licenze, hotlinking, attribution e contenuti duplicati |
| **Document analysis** | Content processing | Runtime proprietario | No | Sì con alternativa | Apache Tika, Unstructured, PyMuPDF, pypdf, LibreOffice headless | Necessario OCR solo come fallback |
| **Data analysis** | Compute | Runtime proprietario | No | Sì con alternativa | Jupyter, pandas, DuckDB, Polars | Serve controllo delle dipendenze e riproducibilità |
| **Projects / memory** | Context management | Proprietario | No | Sì con alternativa | PostgreSQL + object storage + vector DB + metadata store | Separare memoria, knowledge base e chat history |
| **Artifact versioning** | Versioning | Proprietario | No | Sì con alternativa | Git, event sourcing, append-only database | Versioni immutabili e rollback |
| **Artifact publishing** | Hosting | Proprietario | No | Sì con alternativa | Static hosting, object storage, signed URL, reverse proxy | Necessari access control, TTL, CSP e audit |
| **Connector catalog** | Integration registry | Proprietario | No | Sì con alternativa | MCP Registry privato o service catalog | Deve includere trust level, owner, versione e permessi |
| **Apps in chat** | Embedded UI | Proprietario | No | Sì con alternativa | MCP Apps + iframe sandbox + Sandpack | Evitare accesso diretto al DOM host e ai token |
| **Structured code review** | Review | Proprietario | No | Sì con alternativa | Semgrep, CodeQL, Ruff, ESLint + schema JSON findings | Separare detection, ranking, deduplica e remediation |
| **Checkpoint / rollback** | State management | Proprietario | No | Sì con alternativa | Git worktree, snapshot filesystem, Temporal checkpoint | Il rollback deve essere esplicito e verificabile |
| **Tool-call audit** | Observability | Proprietario | No | Sì con alternativa | OpenTelemetry + append-only audit log | Separare telemetry tecnica da audit di sicurezza |

---

# 4. Tool built-in di Claude Code

La documentazione pubblica di Claude Code espone una serie di tool built-in usati per orchestrazione, filesystem, shell, ricerca, task, scheduling, MCP, web e output.

> Claude Code non è open source.  
> Il repository è pubblico, ma la licenza mantiene i diritti ad Anthropic.

Repository:

- [anthropics/claude-code](https://github.com/anthropics/claude-code)
- [Claude Code tools reference](https://code.claude.com/docs/en/tools-reference)

---

## 4.1 Orchestrazione e interazione

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `Agent` | Avvia un subagent con contesto separato | Proprietario | LangGraph subgraph, OpenHands agent, worker custom |
| `AskUserQuestion` | Richiede input strutturato all'utente | Proprietario | Interrupt state custom + form UI |
| `EnterPlanMode` | Passa in modalità pianificazione | Proprietario | State machine con stato `planning` |
| `ExitPlanMode` | Presenta piano e richiede approvazione | Proprietario | Human-in-the-loop gate |
| `EndConversation` | Termina intenzionalmente la sessione | Proprietario | Stop condition nel runtime |
| `SendMessage` | Invia messaggi a subagent o team | Proprietario | Message bus, queue, LangGraph channels |
| `Skill` | Carica una procedura riutilizzabile | Formato pubblico, runtime proprietario | Skill package custom, MCP prompt/tool bundle |
| `Workflow` | Esegue un workflow multi-agent | Proprietario | Temporal + LangGraph |

---

## 4.2 File, codice e repository

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `Read` | Legge file, immagini, PDF e contenuti | Proprietario | Filesystem API, Apache Tika, PyMuPDF |
| `Write` | Crea o sovrascrive file | Proprietario | Filesystem API con optimistic locking |
| `Edit` | Applica sostituzioni mirate | Proprietario | unified diff, Git apply, Tree-sitter |
| `NotebookEdit` | Modifica celle notebook | Proprietario | Jupyter APIs, nbformat |
| `Glob` | Cerca file con pattern | Proprietario | glob nativo, fd, find |
| `Grep` | Cerca contenuto nei file | Usa ripgrep | [ripgrep](https://github.com/BurntSushi/ripgrep) |
| `LSP` | Definizioni, riferimenti, diagnostica | Protocollo aperto | [Language Server Protocol](https://github.com/microsoft/language-server-protocol) |

---

## 4.3 Shell, processi e monitoraggio

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `Bash` | Esegue comandi shell | Proprietario | PTY executor + container |
| `PowerShell` | Esegue PowerShell | Proprietario | PowerShell Core + sandbox |
| `Monitor` | Monitora processi e stream | Proprietario | supervisord, systemd-run, tmux, custom event bridge |

### Best practice

Ogni comando deve avere:

- shell dichiarata;
- working directory;
- variabili ambiente;
- timeout;
- exit code;
- stdout/stderr separati;
- output size limit;
- processo padre;
- possibilità di cancellazione;
- policy di rete;
- audit.

---

## 4.4 Git worktree

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `EnterWorktree` | Crea/apre un worktree isolato | Proprietario | `git worktree add` |
| `ExitWorktree` | Torna al workspace originale | Proprietario | `git worktree remove` / wrapper custom |

### Best practice

Usare worktree distinti per:

- task paralleli;
- subagent;
- patch sperimentali;
- review;
- rollback sicuro.

---

## 4.5 Task management

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `TaskCreate` | Crea task | Proprietario | Temporal workflow, PostgreSQL task table |
| `TaskGet` | Legge task | Proprietario | API task custom |
| `TaskList` | Elenca task | Proprietario | Query database |
| `TaskUpdate` | Aggiorna stato e dipendenze | Proprietario | State machine custom |
| `TaskStop` | Arresta task | Proprietario | Cancellation token |
| `TaskOutput` | Recupera output task | Proprietario/deprecato | Event store |
| `TodoWrite` | Checklist legacy | Proprietario | Todo model custom |

### Stato task consigliato

```text
created
queued
running
waiting_approval
waiting_dependency
blocked
completed
failed
cancelled
compensating
rolled_back
```

---

## 4.6 Scheduling e notifiche

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `CronCreate` | Crea attività schedulata | Proprietario | cron, Temporal Schedules |
| `CronDelete` | Elimina schedule | Proprietario | cron/Temporal API |
| `CronList` | Elenca schedule | Proprietario | scheduler registry |
| `ScheduleWakeup` | Pianifica ciclo successivo | Proprietario | durable timer |
| `RemoteTrigger` | Avvia routine remote | Proprietario | webhook, queue, Temporal Signal |
| `PushNotification` | Invia notifica | Proprietario | Web Push, ntfy, Gotify |

Repository utili:

- [Temporal](https://github.com/temporalio/temporal)
- [ntfy](https://github.com/binwiederhier/ntfy)
- [Gotify](https://github.com/gotify/server)

---

## 4.7 MCP e capability discovery

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `ListMcpResourcesTool` | Elenca resource MCP | MCP aperto | MCP client SDK |
| `ReadMcpResourceTool` | Legge resource MCP | MCP aperto | MCP client SDK |
| `ToolSearch` | Cerca tool disponibili | Proprietario | BM25/FTS/vector search |
| `WaitForMcpServers` | Attende server MCP | Proprietario | health check + retry/backoff |
| `Skill` | Carica skill | Formato pubblico | skill registry custom |

Repository:

- [Model Context Protocol](https://github.com/modelcontextprotocol/modelcontextprotocol)
- [MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP ext-apps](https://github.com/modelcontextprotocol/ext-apps)

---

## 4.8 Web

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `WebSearch` | Ricerca web | Proprietario | SearXNG |
| `WebFetch` | Recupera contenuto URL | Proprietario | Playwright + Trafilatura |

### Pipeline OSS consigliata

```text
Query planner
    ↓
SearXNG
    ↓
URL normalization
    ↓
Playwright fetch
    ↓
Trafilatura extraction
    ↓
Metadata parser
    ↓
Deduplication
    ↓
Source scoring
    ↓
Citation mapping
```

---

## 4.9 Output, reporting e artifact

| Tool Claude Code | Funzione | Stato | Controparte OSS |
|---|---|---|---|
| `Artifact` | Pubblica HTML/Markdown | Proprietario | Sandpack, iframe sandbox, static hosting |
| `ReportFindings` | Produce finding strutturati | Proprietario | JSON Schema + Semgrep/CodeQL |
| `SendUserFile` | Consegna file all'utente | Proprietario | Object storage + signed URL |
| `ShareOnboardingGuide` | Pubblica onboarding | Proprietario | Markdown hosting + ACL |

---

# 5. Componenti open source più importanti

## 5.1 Model Context Protocol

**Repository:**  
<https://github.com/modelcontextprotocol/modelcontextprotocol>

**Ruolo:**

- standardizza tool, resource e prompt;
- separa modello, host e server;
- consente connector locali o remoti;
- è model-agnostic;
- può essere usato con Claude, GPT, Gemini, Mistral e modelli locali.

### Architettura

```text
Model
  ↓
Host application
  ↓
MCP client
  ↓
MCP server
  ↓
External service / filesystem / database / API
```

### Best practice

- allowlist tool;
- least privilege;
- OAuth scoped;
- input validation;
- output sanitization;
- audit;
- timeout;
- version pinning;
- trust registry;
- prompt injection defense.

---

## 5.2 ripgrep

**Repository:**  
<https://github.com/BurntSushi/ripgrep>

**Uso:**

- ricerca testuale ad alte prestazioni;
- supporto regex;
- rispetto di `.gitignore`;
- output machine-readable.

### Best practice

- limitare scope directory;
- escludere file binari;
- limitare numero risultati;
- usare output JSON;
- evitare ricerche globali non necessarie.

---

## 5.3 Language Server Protocol

**Repository:**  
<https://github.com/microsoft/language-server-protocol>

**Uso:**

- go to definition;
- find references;
- rename;
- diagnostics;
- symbol search;
- workspace edits.

### Vantaggio rispetto a exact text replacement

LSP opera a livello semantico e riduce errori durante:

- rename;
- modifica import;
- refactor;
- spostamento simboli;
- aggiornamento riferimenti.

---

## 5.4 Tree-sitter

**Repository:**  
<https://github.com/tree-sitter/tree-sitter>

**Uso:**

- parsing incrementale;
- AST;
- query strutturali;
- trasformazioni semantiche;
- code navigation.

### Best practice

Usare Tree-sitter quando:

- il language server non supporta il refactor richiesto;
- serve una trasformazione multipiattaforma;
- si vogliono regole statiche custom.

---

## 5.5 Sandboxing

### gVisor

<https://github.com/google/gvisor>

Adatto a:

- container multi-tenant;
- isolamento syscall;
- workload Linux.

### Firecracker

<https://github.com/firecracker-microvm/firecracker>

Adatto a:

- microVM;
- forte isolamento;
- workload untrusted;
- cold start contenuto.

### Best practice

- filesystem ephemeral;
- rootless;
- no host socket;
- network deny-by-default;
- CPU/memory quota;
- process limit;
- timeout;
- secret broker;
- egress proxy;
- image immutable;
- cleanup garantito.

---

# 6. Stack open source consigliato

```text
Agent orchestration      LangGraph oppure OpenHands
Durable execution        Temporal
Tool protocol            MCP + JSON Schema
Repository search        ripgrep + LSP
Structured editing       unified diff + Tree-sitter + LSP
Sandbox                   gVisor oppure Firecracker
Browser automation       Playwright
Content extraction       Trafilatura
Web search               SearXNG
RAG                      Haystack/LlamaIndex + pgvector/Qdrant
Document generation      python-docx + openpyxl + python-pptx
PDF generation           WeasyPrint + pypdf
Artifact runtime         Sandpack + iframe sandbox + object storage
Image generation         ComfyUI
Observability            OpenTelemetry
Versioning               Git worktree + immutable snapshots
Scheduling               Temporal Schedules
Notifications            ntfy / Gotify / Web Push
```

---

# 7. Architettura model-agnostic consigliata

```text
┌──────────────────────────────────────────────┐
│                 Frontend UI                  │
│ Chat · Tool timeline · Files · Artifacts     │
└──────────────────────┬───────────────────────┘
                       │
┌──────────────────────▼───────────────────────┐
│              Agent Orchestrator              │
│ Planning · Routing · Retry · Subagents       │
└───────────────┬───────────────┬──────────────┘
                │               │
┌───────────────▼───────┐ ┌─────▼──────────────┐
│    Capability Registry│ │     Policy Engine   │
│ Tool · Skill · MCP    │ │ Auth · Risk · ACL  │
└───────────────┬───────┘ └─────┬──────────────┘
                │               │
┌───────────────▼───────────────▼──────────────┐
│                Tool Gateway                  │
│ Validation · Idempotency · Timeout · Audit   │
└───────┬────────┬────────┬────────┬───────────┘
        │        │        │        │
┌───────▼───┐ ┌──▼────┐ ┌─▼─────┐ ┌▼─────────┐
│ Sandbox   │ │ Search│ │ Files │ │ MCP       │
│ Runtime   │ │ Engine│ │ Engine│ │ Gateway   │
└───────────┘ └───────┘ └───────┘ └──────────┘
```

---

# 8. Contratto tool raccomandato

```ts
export interface ToolDefinition<Input, Output> {
  id: string
  version: string
  description: string

  inputSchema: unknown
  outputSchema: unknown

  risk:
    | "read"
    | "write"
    | "execute"
    | "external-write"
    | "destructive"

  idempotency:
    | "idempotent"
    | "conditional"
    | "non-idempotent"

  timeoutMs: number
  maxRetries: number

  capabilities: string[]
  requiredScopes: string[]

  preview?: (
    input: Input,
    context: ToolContext
  ) => Promise<ToolPreview>

  execute: (
    input: Input,
    context: ToolContext
  ) => Promise<ToolResult<Output>>

  compensate?: (
    result: ToolResult<Output>,
    context: ToolContext
  ) => Promise<CompensationResult>
}
```

---

# 9. Event model raccomandato

```text
run.created
run.started
run.completed
run.failed
run.cancelled

task.created
task.started
task.blocked
task.completed
task.failed

tool.requested
tool.authorized
tool.denied
tool.started
tool.progress
tool.completed
tool.failed
tool.retrying
tool.cancelled
tool.compensated

artifact.created
artifact.updated
artifact.validated
artifact.published
artifact.revoked
```

---

# 10. Security checklist

## Tool security

- input JSON Schema validation;
- output schema validation;
- allowlist dei tool;
- scoped permissions;
- timeout;
- retry limit;
- idempotency key;
- audit log;
- secret redaction;
- rate limit;
- payload size limit;
- deny-by-default.

## Web security

- SSRF protection;
- DNS rebinding protection;
- redirect limit;
- protocol allowlist;
- MIME validation;
- size limit;
- malware scanning;
- HTML sanitization;
- source provenance.

## Sandbox security

- rootless;
- filesystem isolato;
- process limit;
- network egress controllato;
- nessun accesso al Docker socket;
- credenziali temporanee;
- cleanup;
- immutable base image;
- per-run namespace.

## MCP security

- server trust registry;
- OAuth scoped;
- prompt injection defense;
- tool description validation;
- package pinning;
- signature verification;
- audit per server;
- rate limit;
- session isolation.

---

# 11. Testing strategy

## Unit test

- validazione schema;
- policy;
- retry;
- timeout;
- adapter;
- parser;
- formatter.

## Contract test

- compatibilità tool schema;
- compatibilità MCP;
- error model;
- version migration.

## Integration test

- sandbox;
- repository;
- search;
- file generation;
- artifact publish.

## E2E

- user prompt → tool plan;
- tool approval;
- execution;
- file delivery;
- rollback;
- resume.

## Security test

- prompt injection;
- SSRF;
- path traversal;
- command injection;
- secret exfiltration;
- sandbox escape;
- permission escalation.

---

# 12. Criteri di scelta delle controparti OSS

Per ogni sostituzione valutare:

| Criterio | Domanda |
|---|---|
| Licenza | È compatibile con uso commerciale? |
| Maturità | Il progetto è attivamente mantenuto? |
| Community | Esistono release, issue e contributor attivi? |
| Security | Ha security policy e CVE management? |
| Portabilità | Funziona su cloud e on-premise? |
| Multi-model | È indipendente dal provider LLM? |
| Observability | Espone log, metriche e tracing? |
| Extensibility | Supporta plugin o adapter? |
| Isolation | Può essere sandboxato? |
| Rollback | La migrazione è reversibile? |
| Costi | Richiede GPU, cluster o servizi esterni? |
| Lock-in | I dati possono essere esportati? |

---

# 13. Conclusione

La parte realmente riutilizzabile dell'ecosistema Claude non è Claude Code in sé, ma il modello architetturale:

```text
Model
  + tool schema
  + capability registry
  + policy engine
  + sandbox
  + MCP
  + repository intelligence
  + search pipeline
  + document pipeline
  + artifact runtime
  + observability
```

La combinazione più solida per un prodotto indipendente è:

- MCP come protocollo;
- JSON Schema come contratto tool;
- LangGraph o runtime custom per orchestrazione;
- Temporal per workflow durevoli;
- ripgrep + LSP + Tree-sitter per coding agent;
- gVisor o Firecracker per sandbox;
- SearXNG + Playwright + Trafilatura per ricerca;
- Haystack/LlamaIndex + pgvector/Qdrant per RAG;
- python-docx, openpyxl, python-pptx e WeasyPrint per file;
- Sandpack o iframe sandbox per artifact;
- OpenTelemetry per observability.

Questa architettura permette di collegare Claude, GPT, Gemini, Mistral, Llama o altri modelli senza costruire l'intero prodotto attorno a un singolo provider.
