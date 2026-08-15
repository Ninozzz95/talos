# TALOS — Parte 2 aggiornata
## Source audit di DeepSeek Harness e piano tecnico per pareggiarlo e superarlo

**Stato:** architecture blueprint / competitive source audit  
**Data:** 15 agosto 2026  
**DeepSeek Harness auditato:** `deepseek-ai/deepseek-harness`  
**Commit congelato:** `47f943859bef60e4160492346772ded9b24f765a`  
**Release:** `@deepseek-ai/dsh-root 0.1.0-rc.5`  
**Data commit release:** 13 agosto 2026  
**Baseline TALOS:** `lane/talos-mobile` @ `85203e76ffb15efafb83285eba000cd8c420a2a8`

---

# 0. Executive conclusion

Il source audit cambia significativamente la valutazione precedente.

DeepSeek Harness non è un piccolo wrapper attorno a DeepSeek V4.

È già una **piattaforma agentica modulare completa** con:

- loop agentico swappable;
- runtime “everything is a plugin” basato su Cordis;
- tool registry con policy pipeline;
- native function calling;
- Code Mode;
- runtime TypeScript in worker thread;
- shell;
- subprocess;
- persistent PTY;
- filesystem;
- LSP;
- sandbox multipiattaforma;
- skill;
- compaction;
- context contributors;
- subagent;
- Codex subagent;
- Claude Code subagent;
- ACP subagent;
- background jobs;
- dynamic workflows;
- session persistence JSONL/SQLite;
- projections;
- session query / FTS;
- attachment store content-addressed;
- spill storage;
- approvals;
- permission presets;
- human questions;
- web UI;
- SDK JSON-RPC;
- ACP;
- runtime self-inspection;
- model-written dynamic plugins;
- plugin mount/unmount live;
- telemetry;
- provider-independent capability seams;
- extensive CI architecture gates.

La conclusione deve quindi essere molto più severa:

> **Per la parte “piattaforma agentica”, pareggiare Claude Code o Hermes non è più sufficiente. TALOS deve raggiungere almeno il livello di composabilità, runtime separation, persistence e execution capability di DeepSeek Harness.**

Ma il source rivela anche limiti strutturali molto chiari che TALOS può usare come spazio di superamento.

In particolare DeepSeek dichiara esplicitamente che:

1. **Code Mode worker isolation non è una security boundary.**
2. **Workflow worker isolation non è una security boundary.**
3. **Il runtime self-modifying Cordis è da trattare come bash access.**
4. Il tool restriction mechanism agent-scoped è esplicitamente **non una authority boundary**.
5. Le dynamic packages del Creator-like system sono **process-local, non persistenti**, non promuovibili automaticamente.
6. Il sandbox locale ha enforcement diverso e in alcuni casi parziale tra Linux/macOS/Windows.
7. La permission UX principale comprime oggi soprattutto **sandbox mode + approval policy**, non una capability algebra fine-grained.
8. Worker-thread code può creare processi che sopravvivono alla terminazione del worker.
9. Il workflow runtime può orchestrare fino a centinaia/migliaia di child agent, ma il codice del workflow ha un trust model sostanzialmente bash-equivalent.
10. Il sistema è desktop/server Node-first; Android non è il suo control plane naturale.

Questi non sono “bug” casuali.

Sono trade-off architetturali dichiarati.

La strategia TALOS non deve essere:

```text
copy DeepSeek Harness
```

ma:

```text
DeepSeek-level composability
+
TALOS capability authority
+
TALOS durable operation state
+
verified side effects
+
reversibility
+
mobile human control plane
+
harness benchmarking/evolution
+
backend independence
```

---

# 1. Cosa è stato realmente verificato nel sorgente

Repository:

```text
deepseek-ai/deepseek-harness
```

Default branch:

```text
master
```

Commit:

```text
47f943859bef60e4160492346772ded9b24f765a
```

Commit message:

```text
release: dsh@0.1.0-rc.5 & publish the dsh family publicly
```

Il root `package.json` dichiara:

```text
name: @deepseek-ai/dsh-root
version: 0.1.0-rc.5
package manager: pnpm 11.7.0
Node: ^22.19.0 || >=24
TypeScript 6.0.3
Vitest 4.1.8
```

Workspace roots:

```text
vendor/*
packages/*/*
native/landlock-run
native/landlock-run/packages/*
apps/*
website
```

Il monorepo contiene **centinaia di package**; lo script di release parla esplicitamente di oltre 200 package release-member.

Questo è già un segnale importante:

> DeepSeek Harness ha scelto una modularizzazione estrema, con capability seams separate e package molto piccoli.

---

# 2. Architettura reale: “everything is a plugin”

Il root README dice esplicitamente:

> DeepSeek Harness uses an architecture where **everything is a plugin**, powered by Cordis.

La package documentation precisa che:

```text
Cordis Service subclasses
+
function plugins
```

contribuiscono tramite:

```text
ctx.effect()
ctx.on()
ctx.waterfall()
```

La regola di dipendenza fondamentale è:

> extension plugins depend on Service Definitions, never concrete providers.

Questo è un punto architetturale molto forte.

DeepSeek separa sistematicamente:

```text
Service Definition
Service Provider
Consumer
```

quando una capability ha più implementazioni.

Esempio:

```text
sandbox/
    sandbox            definition
    sandbox-local      provider
    sandbox-policy     policy

code-runtime/
    code-runtime                 definition
    code-runtime-worker-thread   provider
    tools                        consumer

subagent/
    subagent
    subagent-spawn-in-process
    subagent-fork-in-process
    subagent-acp
    subagent-codex
    subagent-claude-code
    subagent-dsh-sdk
    tool-subagent
```

La lezione per TALOS è netta:

> le future capability coding non devono entrare tutte dentro `executor.ts`, `agentLoop.ts` o un singolo catalogo monolitico.

---

# 3. Il core agentico è volutamente indipendente dal loop

`packages/core/agent/README.md`:

> every plugin programs against the `Agent` handle defined here — it has zero loop dependency, so the loop is swappable.

Questo è probabilmente uno dei finding più importanti.

DeepSeek distingue:

```text
Agent interface
AgentRegistry
AgentFactory
concrete AgentLoop
```

I consumer non importano il loop concreto.

L’Agent registry offre:

```text
create()
resume()
get()
list()
roots()
```

e ownership strutturata.

Il loop concreto viene registrato via:

```text
setFactory(factory)
```

Quindi è possibile sostituire il loop mantenendo:

```text
UI
hooks
orchestrators
subagents
session
```

---

# 3.1 Agent scope

Ogni `Agent` ha:

```text
agent.ctx
```

un Cordis scope dedicato.

In quello scope si possono registrare:

```text
tools
prompt sections
variables
listeners
```

che spariscono quando l’agent viene disposed.

Questo permette agent runtime differenti nello stesso processo.

---

# 3.2 Initiator scope

DeepSeek usa `AsyncLocalStorage` per portare l’identità dell’agent che ha iniziato un’operazione attraverso async continuations.

Ma la documentazione precisa:

> Ambient presence is neither liveness proof nor authorization.

Questa distinzione è molto sana:

```text
ambient identity
≠
authority
```

TALOS dovrebbe mantenere lo stesso principio.

---

# 3.3 Agent inbox

L’agent ha una inbox durable/proiettata con:

```text
followup
steer
inject
cancel
whenIdle
```

e primitive:

```text
append
prepend
replace
remove
clear
splice
claim
```

La gestione di input e steering è quindi una primitive first-class, non un semplice append al transcript.

---

# 4. Session: DeepSeek ha già un data plane durabile

La precedente Parte 2 sottostimava questo punto.

`packages/session/README.md` mostra:

```text
session-persistence
session-checkpoint-policy
session-persistence-jsonl
session-persistence-sqlite
session-projection
session-projection-cache
session-stats
session-title
session-telemetry
```

Questo significa che DeepSeek Harness ha già:

```text
live session
+
durable log
+
semantic checkpoint
+
projection
+
projection cache
```

Quindi “aggiungiamo SQLite e resume” **non è un one-up**.

È parità minima.

---

# 4.1 Durable session events

Il core agent README conferma che:

```text
turn/*
step/*
assistant/chunk
```

sono session events durabili.

Il sistema legge il log per ricostruire perfino:

```text
which work was consumed
whether accepted work was later cancelled
```

DeepSeek tratta quindi il log come source importante di lifecycle truth.

TALOS deve andare oltre:

```text
session event log
→ semantic operation ledger
```

che vedremo più avanti.

---

# 5. Tool runtime: molto più sofisticato di una registry map

`packages/core/tools/README.md` descrive la pipeline reale:

```text
tools/pre-execute
↓
monotonic registered guards
↓
tools/execute
↓
tool body
↓
tools/post-execute
↓
definition.finalizeContent
↓
tools/result
```

Questa pipeline ha:

- allow / deny / ask;
- monotonic guards;
- timeout/retry/metrics wrappers;
- result transformation;
- deferred contexts;
- output schema validation;
- cancellation;
- immutable execution token;
- concurrency classification;
- tool-owned UI rendering.

---

# 5.1 Tool Guard

Importante:

```text
ctx.tools.guard()
```

è monotonic.

Una denial del guard non può essere trasformata successivamente in allow da waterfall listener.

È una proprietà che TALOS dovrebbe imitare.

---

# 5.2 Tool restriction NON è security

Il source DeepSeek dice esplicitamente:

> `ctx.tools.restrict(filter)` ... is live visibility composition, **not an authority boundary**.

Questo è un punto cruciale.

DeepSeek distingue correttamente:

```text
tool visibility
```

da:

```text
authorization
```

TALOS deve farlo ancora più rigorosamente.

---

# 5.3 Output schema

Ogni first-party tool dichiara:

```text
input schema
output schema
renderer
```

Il runtime:

1. valida input;
2. esegue;
3. snapshotta JSON;
4. valida output;
5. renderizza.

Un tool non può restituire arbitrariamente una struttura non dichiarata.

Questo rende i tool più affidabili e composabili.

TALOS oggi ha Zod sugli input.

**Parità necessaria:** schema canonico anche per output.

---

# 5.4 Concurrency safety

Ogni tool può dichiarare:

```text
isConcurrencySafe(args)
```

Solo se ritorna esattamente `true`, la chiamata può essere parallelizzata.

Default:

```text
exclusive
```

Questa è una politica migliore di:

```text
parallel max = 4
```

globale.

TALOS dovrebbe adottarla.

---

# 6. Code Mode reale

Il finding più importante del nuovo Harness.

Tool runtime config:

```yaml
tools:
  mode: native
```

Valori:

```text
native
code
both
```

---

# 6.1 Native mode

Tool normali:

```text
function definitions
```

---

# 6.2 Code mode

Il modello vede:

```text
run_code
+
generated tools:sdk section
```

Gli altri tool non possono essere chiamati direttamente.

Il runtime rifiuta un direct tool call non `run_code` come:

```text
UNKNOWN_TOOL
```

prima della policy.

Quindi Code Mode non è soltanto prompt convention.

È enforced dal tool runtime.

---

# 6.3 Both mode

Il modello può usare:

```text
native tool calls
+
run_code
```

---

# 6.4 SDK generator

Il runtime genera un SDK del toolset per il linguaggio del code runtime.

TypeScript è first-party.

È prevista anche una renderer Python.

Questa è una direzione molto potente:

```text
tools
→ typed SDK
→ model-written orchestration program
```

---

# 7. Code Runtime worker: cosa fa davvero

`packages/code-runtime/code-runtime-worker-thread/README.md`.

Ogni programma gira in:

```text
ONE fresh Node worker_threads.Worker
```

Nessun pooling.

Per ogni run:

```text
fresh worker
empty environment
heap cap
hard termination
```

Il programma TypeScript viene:

```text
type-stripped
wrapped in AsyncFunction
executed in worker
```

---

# 7.1 Budget

Default:

```text
computeMs                  60,000
maxWallMs                 600,000
maxOutputBytes             64 MiB
maxOldGenerationSizeMb     512
```

Il runtime distingue:

```text
compute busy-time
```

da:

```text
wall time
```

Ottima scelta.

Un programma in attesa di tool lento non brucia compute budget, ma resta coperto dal wall timeout.

---

# 7.2 Hostile-peer hardening

Il worker protocol assume che model-written code sia ostile.

Vengono difesi:

```text
forged messages
prototype traversal
constructor key
malformed JSON
post-settlement replies
output byte limits
prototype mutation
```

Gli input/output sono ricostruiti come plain data.

Questo non è un semplice `eval()`.

---

# 7.3 Empty environment

Il worker parte con:

```text
env: {}
execArgv: []
```

Quindi nessuna credenziale ambientale via `process.env`.

---

# 7.4 Ma il trust stance è esplicito

DeepSeek dice chiaramente:

> containment, **not a security boundary**

e:

> trust posture is bash-equivalent by design.

Questa è un’enorme opportunità TALOS.

---

# 7.5 Limite serio

La documentazione dichiara:

> OS processes a program spawns survive termination.

Quindi:

```text
worker.terminate()
```

non equivale a:

```text
kill process tree
```

TALOS può superarlo se lega ogni Action Program a un execution backend con process-tree ownership.

---

# 8. Workflow runtime reale

DeepSeek non ha soltanto “workflow”.

Ha:

```text
workflow service
workflow worker-thread engine
workflow tool
ralph fixed-policy workflow
```

Il workflow script è model-authored.

Hook:

```text
agent()
parallel()
pipeline()
phase()
log()
```

I child agent rimangono host-side.

Il worker parla con loro tramite protocollo typed.

---

# 8.1 Parallelism e caps

Default:

```text
maxConcurrentAgents = CPU parallelism
maxTotalAgents      = 1000
maxItemsPerCall     = 4096
syncTimeoutMs       = 5000
disposeGraceMs      = 5000
```

Questo è già un orchestratore serio.

---

# 8.2 Strong lifecycle cleanup

DeepSeek traccia separatamente:

```text
pending provider starts
published children
child disposal
worker death
```

e garantisce pairing degli eventi `workflow/agent-start` / `workflow/agent-end`.

Questo mostra grande attenzione al lifecycle.

---

# 8.3 Ma, di nuovo, nessuna security boundary

Il README dice:

> workflow scripts are model-written and have the same trust premise as existing bash access.

e:

> node:vm inside a worker is an API-shaping mechanism, not a security boundary.

Quindi:

```text
Workflow programmability
```

è molto avanzata.

Ma:

```text
Workflow authority containment
```

resta un’area per TALOS.

---

# 9. Subagent runtime: DeepSeek è già supervisor multi-agent

Questo finding invalida una parte della precedente roadmap come “differenziatore”.

DeepSeek ha adapter first-party per:

```text
fresh in-process child
forked in-process child
ACP
Codex
Claude Code
DSH SDK
```

Quindi DeepSeek Harness può già usare:

```text
Codex
Claude Code
external Harness
```

come subagent.

---

# 9.1 Continuable background children

Il sistema supporta child continuabili e background.

Tool separati:

```text
tool-subagent
tool-subagent-control
tool-subagent-report
```

Quindi:

```text
spawn
control
report
```

sono first-class.

---

# 9.2 Conseguenza strategica

La vecchia idea:

> “TALOS può diventare supervisor di Codex/Claude/Hermes”

resta valida, ma **non è più un moat da sola**.

DeepSeek lo sta già facendo.

Il TALOS one-up deve essere:

```text
supervisor
+
authority attenuation
+
proof
+
ChangeSet
+
mobile decisions
+
cost/eval router
```

---

# 10. Sandbox: DeepSeek ha già fatto il lavoro serio

`packages/sandbox/sandbox-local/README.md`.

Backend:

### Linux

Preferenza:

```text
bwrap
↓ fallback
Landlock
```

### macOS

```text
Seatbelt / sandbox-exec
```

### Windows

```text
ACL restricted-token runner
```

---

# 10.1 Fail closed

DeepSeek dichiara:

> unsupported platforms and unusable runners fail closed with `SANDBOX_UNAVAILABLE`; execution never silently falls through unconfined.

Questa è una proprietà che TALOS deve assolutamente mantenere.

---

# 10.2 Enforcement completeness

Ogni wrap riporta:

```text
enforcement completeness
```

quindi il sistema distingue:

```text
full
partial
```

invece di fingere isolamento perfetto.

Questo è eccellente.

---

# 10.3 Windows limitation

DeepSeek dichiara:

> Windows ACL enforcement is partial.

Perché:

- restricted token deve mantenere Everyone per inizializzazione;
- oggetti esterni con Everyone write possono restare scrivibili;
- NTFS hard link possono aliasare file esterni.

Quindi Windows non è presentato come equivalente a Linux.

---

# 10.4 Landlock limitation

Kernel più vecchi possono applicare solo parte delle access class.

Il provider riporta:

```text
partial
```

---

# 10.5 macOS limitation

`sandbox-exec` è deprecated da Apple.

DeepSeek continua a usarlo ma fa functional probe e fail-closed.

---

# 10.6 Questo corregge una nostra ipotesi

La precedente Parte 2 trattava il Runner+sandbox come area quasi nuova.

DeepSeek dimostra che:

```text
cross-platform local process confinement
```

è già implementabile e in produzione preview.

TALOS deve quindi evitare di reinventarlo senza motivo.

Possibili strategie:

```text
adottare concetti equivalenti
riusare mature OS primitives
eventuale dedicated Runner backend
```

---

# 11. Permission presets: dove DeepSeek è più semplice di TALOS

DeepSeek user-facing preset:

```text
workspace-write
danger-full-access
```

Ogni preset combina:

```text
sandbox/mode
approval/policy
```

Default:

```text
workspace-write:
  sandbox = workspace-write
  approval = ask

danger-full-access:
  sandbox = danger-full-access
  approval = never
```

---

# 11.1 Differenza con TALOS

TALOS ha già:

```text
read
write
outbound

allow
ask
deny
```

Questo è, concettualmente, un modello più generale e più leggibile.

Non va sacrificato per copiare DeepSeek.

---

# 11.2 Strategia

Mappare:

```text
TALOS high-level power policy
```

verso:

```text
backend mechanism policy
```

Esempio:

```text
read: allow
write: ask
outbound: deny
```

compilato in:

```text
filesystem mode
network mode
approval gates
tool visibility
```

Il vantaggio TALOS può essere:

> una grammatica utente stabile mentre l’enforcement backend cambia.

---

# 12. Runtime self-modification: molto più avanzato del previsto

DeepSeek `extensions/` permette al modello di ispezionare il proprio runtime.

Tool:

```text
cordis_inspect
cordis_define
cordis_run
cordis_stop
cordis_undefine
```

---

# 12.1 cordis_inspect

Può ispezionare:

```text
services
live plugin fibers
registered tools
dynamic packages
API
events
client slot surfaces
```

Quindi l’agent possiede una descrizione machine-readable del proprio harness.

---

# 12.2 cordis_define

Il modello può definire:

```text
host code
browser client code
purpose
name
```

Il codice viene syntax-checked prima di ricevere ID.

Non parte automaticamente.

---

# 12.3 cordis_run

Esegue il package live.

Può:

```text
register tools
prompt contributions
listeners
UI
```

---

# 12.4 Browser half

Un dynamic package può addirittura aggiungere UI nel Web client.

Quindi DeepSeek possiede già una forma concreta di:

```text
generative UI + generative runtime extension
```

---

# 12.5 Però non è persistente

DeepSeek è molto chiaro:

```text
dynamic packages live only in process memory
```

Non:

```text
write plugin file
install package
change cordis.yml
survive restart
auto-promote
```

Questo è importante.

La self-evolution DeepSeek è:

```text
ephemeral experimentation
```

non:

```text
verified persistent self-improvement
```

Questo resta spazio TALOS.

---

# 12.6 Trust stance

DeepSeek dice:

> treat this toolset like bash access.

E:

> the sandbox isolates globals but is not a security boundary.

Il modello può raggiungere servizi live come:

```text
ctx.fs
ctx.web
ctx.bash
```

dentro il trust premise.

Questo è probabilmente **il più grande spazio architetturale per TALOS**.

---

# 13. DeepSeek Creator-like system: il vero one-up possibile

Non dobbiamo inventare “Creator Mode”.

DeepSeek possiede già:

```text
self-inspection
ephemeral dynamic packages
run/stop/undefine
browser UI injection
```

TALOS deve andare oltre:

```text
candidate runtime
→ static capability analysis
→ sandbox
→ replay
→ benchmarks
→ security regression
→ shadow
→ human promotion
→ versioned persistent plugin/workflow
→ rollback
```

Questa pipeline non emerge nel DeepSeek snapshot attuale.

---

# 14. DeepSeek Code Mode vs TALOS Action Programs

Ora possiamo confrontare seriamente.

DeepSeek:

```text
model
↓
run_code
↓
TypeScript SDK
↓
Worker
↓
bindings
```

TALOS one-up proposto:

```text
model
↓
Action Program
↓
static effect inference
↓
authority preview
↓
approval bound to program hash
↓
sandbox/backend admission
↓
operation receipts
↓
ChangeSet
↓
proof
```

---

# 14.1 Non serve necessariamente una DSL completamente custom

Dopo aver visto quanto DeepSeek ha hardenizzato il Worker protocol, la precedente raccomandazione “custom IR per sicurezza” va rivalutata.

Opzioni:

### A — TypeScript subset → IR

Massimo controllo.

### B — Worker JS/TS + capability bindings + external sandbox

Più vicino a DeepSeek, meno compiler da mantenere.

### C — WASM guest

Più isolamento ma più complessità.

Nuova raccomandazione:

> **Non decidere il linguaggio prima di decidere la security boundary.**

Se il programma gira in:

```text
real isolated process/container
```

TypeScript diventa molto più accettabile.

Se gira nel WebView:

```text
restricted IR
```

è preferibile.

---

# 15. Il vero problema non è Code Mode: è authority propagation

DeepSeek Code Mode protegge bene:

```text
transport
worker lifecycle
memory
output
```

ma dichiara trust posture bash-equivalent.

TALOS deve introdurre:

```text
Program Authority Manifest
```

Esempio:

```yaml
program:
  hash: sha256:...

requires:

  read:
    workspace:
      - src/**
      - package.json

  write:
    workspace:
      - src/chat/**

  outbound:
    hosts:
      - registry.npmjs.org

limits:
  operations: 20
  wall: 60s

irreversible:
  none
```

---

# 15.1 Static over-approximation

Per sicurezza:

```text
actual effects ⊆ predicted effects
```

False positive:

```text
OK
```

False negative:

```text
security failure
```

---

# 15.2 Dynamic path

Se programma calcola:

```text
path = userGenerated()
```

static analysis può classificare:

```text
workspace any-path
```

oppure rifiutare.

Mai inventare un path scope più stretto.

---

# 16. Universal Undo è ancora differenziante

DeepSeek ha molti elementi utili:

- tool output;
- hunk diffs;
- sandbox;
- session log.

Ma nel source audit non emerge un **cross-capability transactional ChangeSet** generale.

Questa resta una forte TALOS bet.

---

# 16.1 Ogni mutating plugin deve fornire EffectContract

```ts
interface EffectContract {
    powers: TalosToolAction[]

    preState:
        | 'required'
        | 'optional'
        | 'not-capturable'

    reversibility:
        | 'pure-read'
        | 'reversible'
        | 'conflict-sensitive'
        | 'compensatable'
        | 'irreversible'

    verify(result): Promise<Evidence>

    reverse?(receipt): Promise<ReversePlan>

    compensate?(receipt): Promise<CompensationPlan>
}
```

---

# 16.2 DeepSeek parity first

Non costruire Universal Undo prima di:

```text
OperationReceipt
```

per tutte le write/outbound TALOS.

---

# 17. Harness Microkernel TALOS: come copiarne il concetto senza copiare Cordis ciecamente

DeepSeek Cordis architecture è forte.

Ma TALOS Android ha vincoli diversi.

Quindi prima ADR:

```text
ADR-H-001:
Cordis directly
vs
Talos-native microkernel
```

---

# 17.1 Criteri

Misurare:

```text
bundle size
WebView compatibility
tree shaking
worker usage
lifecycle
typing
service dependency injection
plugin unload semantics
dynamic import
security membrane
```

---

# 17.2 TALOS Runtime Plugin contract

```ts
interface TalosPlugin {
    manifest: TalosPluginManifest

    activate(
        ctx: TalosPluginContext
    ): Promise<Disposable>
}
```

Manifest:

```ts
interface TalosPluginManifest {
    id: string
    version: string

    contributions: {
        tools?: ToolContribution[]
        context?: ContextContribution[]
        workflows?: WorkflowContribution[]
        skills?: SkillContribution[]
        evaluators?: EvaluatorContribution[]
        screens?: ScreenContribution[]
        agentWorkers?: AgentWorkerContribution[]
    }

    authority: {
        powers: TalosToolAction[]
        capabilities: CapabilityRequirement[]
    }

    target:
        | 'web-worker'
        | 'android-native'
        | 'execution-backend'
}
```

---

# 17.3 No ambient authority

Questo deve essere più forte di DeepSeek dynamic package posture.

Logic plugin:

```text
NO fetch
NO Capacitor direct
NO unrestricted filesystem
NO arbitrary Node
```

Accesso solo via:

```text
ctx.capabilities.*
```

---

# 18. Trusted Computing Base

DeepSeek mette molta logica nel Cordis runtime.

TALOS deve esplicitare una piccola parte **non pluggable**:

```text
permission evaluator
capability lease validator
operation ledger
receipt store
proof verifier
plugin integrity
runtime assembler invariants
```

Tutto il resto può essere plugin.

---

# 18.1 Regola fondamentale

> L’agente può cambiare **come lavora**; non può cambiare **che cosa gli è permesso fare**.

---

# 19. Harness profiles

DeepSeek possiede composizione via preset/bundle/Cordis.

TALOS deve avere profili espliciti.

```text
assistant.standard
coding.standard
coding.minimal
coding.program
creator.quarantine
offline.local
```

---

# 19.1 Profile fingerprint

```ts
interface HarnessFingerprint {
    profileHash: string
    pluginHashes: string[]
    toolSchemaHash: string
    contextPolicyHash: string
    modelPolicyHash: string
}
```

Ogni run salva il fingerprint.

---

# 20. Minimal harness: ora è obbligatorio

DeepSeek usa esplicitamente minimal harness anche per benchmark.

Per TALOS il motivo è ancora più forte perché abbiamo un dato reale:

```text
46 tool
→ GBNF 55,871 B
→ parser reject
```

e:

```text
52 tool
~9K prompt tokens
local model
>20 min
```

---

# 20.1 Tool Profile Compiler

```ts
interface ToolProfileCompiler {
    compile(
        task: Goal,
        phase: TaskPhase,
        model: ModelProfile,
        authority: AuthoritySnapshot,
        backend: BackendCapabilities
    ): CompiledToolProfile
}
```

---

# 20.2 Output report

```text
tool count
schema bytes
GBNF bytes
estimated tokens
powers
profile hash
```

---

# 20.3 Dynamic discovery

Se ecosystem cresce a 200 tool:

non mandare 200 schema.

Usare:

```text
capability.search
```

come small discovery primitive.

Poi:

```text
activate subset
```

---

# 21. DeepSeek tool UX: tool-owned presentation

DeepSeek tool definition può possedere:

```text
presentCall
presentResult
```

Card types:

```text
generic
terminal
diff
search
read
```

Questo evita UI con:

```text
if toolName === ...
```

sparsi.

TALOS deve adottare lo stesso pattern.

---

# 21.1 TALOS extension

Ogni tool dovrebbe avere:

```text
chat presentation
screen route
```

mappati sulla **stessa operation**.

Rispetta il vincolo owner:

> ogni funzione parte dalla chat e ha anche la sua schermata.

---

# 22. LSP è baseline, non luxury

DeepSeek ha LSP come capability family.

TALOS coding deve quindi includere almeno:

```text
definition
references
implementations
symbols
workspaceSymbols
diagnostics
hover
rename plan
```

Non affidarsi soltanto a:

```text
grep
read
```

---

# 22.1 Revision binding

Ogni risultato LSP:

```text
workspace revision
```

Se workspace cambia:

```text
invalidate
```

---

# 23. Process, shell e terminal devono restare distinti

DeepSeek fa bene a separare:

```text
subprocess
shell
terminal
```

TALOS deve fare uguale.

---

# 23.1 Process

```text
executable + argv
```

Default agent API.

---

# 23.2 Shell

```text
shell string
```

più pericolosa.

---

# 23.3 Terminal

Persistent PTY.

Primariamente human-facing.

---

# 24. Runner discussion aggiornata

DeepSeek dimostra che un local harness desktop cross-platform è fattibile, ma anche costoso:

- bwrap;
- Landlock native addon;
- Seatbelt;
- Windows ACL runner;
- process-tree semantics;
- shell;
- PTY;
- LSP;
- Node distribution;
- updates.

Questo rafforza l’osservazione owner:

> **Runner è un secondo prodotto.**

DeepSeek Harness è essenzialmente la prova empirica.

---

# 24.1 Non è gratis

La loro package surface mostra quanta infrastruttura serve.

Quindi BYOR non va considerato default “semplice”.

Resta:

```text
candidate backend
```

da confrontare con provider esterni.

---

# 25. ExecutionBackend deve restare separato dall’Harness

DeepSeek è molto Node/local-oriented.

TALOS ha l’opportunità di fare meglio separando:

```text
Harness
```

da:

```text
ExecutionBackend
```

---

# 25.1 Harness requirements

```yaml
requires:
  filesystem: true
  process: true
  lsp: true

security:
  filesystemIsolation: required
  networkIsolation: deny

compute:
  memory: 8GB
```

Broker sceglie:

```text
Android
Runner
user VM
provider sandbox
future TALOS compute
```

---

# 26. Subagent authority attenuation: vero one-up

DeepSeek subagent architecture è forte.

Ma TALOS deve aggiungere come requisito first-class:

```text
child authority ⊆ parent authority
```

---

# 26.1 Child contract

```ts
interface SubAgentContract {
    goal: GoalContract

    authority: CapabilityLease[]

    budget: {
        tokens?: number
        money?: number
        wallMs?: number
        operations?: number
    }

    completion: CompletionContract

    workspace: WorkspaceView
}
```

---

# 26.2 External worker

Codex/Claude/DeepSeek worker non è trusted.

TALOS importa:

```text
artifacts
patch
claims
logs
```

e poi verifica.

---

# 27. Proof layer: DeepSeek non chiude ancora completamente il gap

DeepSeek ha:

```text
tool output schema
result pipeline
sandbox enforcement facts
session log
```

Ma TALOS può aggiungere un livello più forte:

```text
Claim
→ Evidence
→ Verification
→ Completion Contract
```

---

# 27.1 Example

Agent:

```text
“Bug fixed”
```

TALOS:

```text
claim = bug_fixed
```

Evidence:

```text
patch receipt
regression test
full test
UI check
```

Solo verifier può segnare:

```text
VERIFIED
```

---

# 28. Harness self-evolution: DeepSeek apre la porta, TALOS può chiuderne il loop

DeepSeek dynamic Cordis package:

```text
define
run
inspect
stop
undefine
```

È un ottimo experiment loop.

Ma manca:

```text
persistent promotion pipeline
```

---

# 28.1 TALOS Harness Lab

```text
candidate
↓
static authority diff
↓
schema compilation
↓
historical replay
↓
A/B benchmark
↓
shadow execution
↓
security regression
↓
human promotion
↓
signed/versioned plugin
↓
rollback
```

---

# 28.2 Immutable layers

```text
L0 SECURITY KERNEL
non self-modifiable

L1 HARNESS
experimentable

L2 TASK STRATEGY
freely generated within authority
```

---

# 29. HarnessBench

DeepSeek ha un’enorme quantità di CI gate e benchmark support.

TALOS deve rendere il benchmark del **harness** un prodotto interno.

---

# 29.1 Run identity

```text
model revision
sampling
reasoning effort
harness fingerprint
tool profile
backend image
workspace revision
permission profile
```

---

# 29.2 Metrics

```text
verified completion
wall time
input tokens
cached input
output tokens
model calls
tool calls
duplicate tool calls
duplicate file reads
permission prompts
denials
unsupported claims
policy violations
recovery after kill
duplicate side effects
undo coverage
GBNF bytes
tool schema tokens
```

---

# 29.3 Mobile-specific

```text
WebView memory
frame p95
bridge bytes
battery
thermal
background survival
```

Questa è un’area dove TALOS può generare dati che DeepSeek desktop-first non ha.

---

# 30. Harness Time Machine

DeepSeek ha session persistence.

TALOS può fare un passo ulteriore:

```text
fork task at event E
```

e cambiare:

```text
model
harness
backend
strategy
```

mantenendo:

```text
task state
world snapshot
authority
```

---

# 30.1 Killer test

```text
same task state
same workspace
same model

A: minimal
B: standard
C: program mode
```

Confronto reale.

---

# 31. Workflow Compiler aggiornato

Dopo DeepSeek Code Mode e Workflow, il vecchio “Workflow Compiler” da solo non è rivoluzionario.

Nuova formulazione:

> **successful agent/code trajectories vengono industrializzate in workflow deterministici versionati e verificati.**

---

# 31.1 Pipeline

```text
successful trace
↓
parameter inference
↓
DAG extraction
↓
deterministic/agent boundary inference
↓
replay
↓
shadow
↓
authority analysis
↓
promotion
```

---

# 31.2 Target

Prima:

```text
80% LLM
20% deterministic
```

Dopo maturazione:

```text
10–20% LLM exception handling
80–90% deterministic
```

solo dove empiricamente possibile.

---

# 32. Evolutionary Engineering resta forte

DeepSeek rende più facile implementarla.

Candidate possono variare:

```text
code
prompt
tool profile
runtime profile
subagent topology
workflow
model routing
```

---

# 32.1 Fitness multi-objective

```text
verified success
cost
latency
risk
human attention
bundle
performance
```

---

# 32.2 Invalid candidate

Se:

```text
policy violation
permission bypass
test tampering
evaluator modification
```

candidate:

```text
INVALID
```

non “score basso”.

---

# 33. Evaluator deve essere fuori candidate authority

DeepSeek Creator-like runtime modifica servizi live.

TALOS Harness Lab deve impedire:

```text
candidate edits benchmark
candidate edits evaluator
candidate edits permission kernel
```

Questo è non negoziabile.

---

# 34. Decision Inbox è ancora molto forte

DeepSeek ha Web UI e approval.

Ma TALOS mobile può fare della human attention una primitive principale.

Non:

```text
watch agents
```

Ma:

```text
decisions only
```

---

# 34.1 DecisionPacket

```ts
interface DecisionPacket {
    taskId: string

    reason:
      | 'authority'
      | 'irreversible'
      | 'preference'
      | 'cost'
      | 'uncertainty'
      | 'promotion'

    question: string
    options: Option[]

    recommendation?: OptionId
    evidence: EvidenceRef[]

    blocking: boolean
}
```

---

# 35. Mobile as authority plane

Questo è il più forte differenziatore strategico di TALOS.

DeepSeek Harness parte da:

```text
Node process
Web UI
CLI
```

TALOS può partire da:

```text
personal mobile device
```

che possiede:

```text
biometric auth
hardware-backed keys
notifications
always-with-user
local private model
approval UX
```

---

# 35.1 Non fare del telefono il compute obbligatorio

Ruolo:

```text
authority root
task control
decision inbox
proof viewer
status
local fallback
```

---

# 36. Hardware-rooted capability leases

TALOS può firmare un authorization envelope legato a:

```text
task
operation
power
scope
expiry
program hash
```

usando Android Keystore.

Backend verifica.

Il model/provider non riceve la key.

---

# 37. DeepSeek permission model vs TALOS opportunity

DeepSeek:

```text
sandbox mode
+
approval policy
```

TALOS:

```text
read/write/outbound
×
allow/ask/deny
```

TALOS può essere più coerente cross-domain:

```text
Git
email
calendar
filesystem
web
cloud
```

non soltanto process sandbox.

---

# 38. Universal operation layer

Questa deve diventare la grande differenza.

```ts
interface Operation {
    id: string

    capability: string

    powers:
        Array<'read' | 'write' | 'outbound'>

    inputDigest: string

    authorityLease: string

    preconditions: Predicate[]

    reversibility: ReversibilityClass

    idempotencyKey: string
}
```

---

# 38.1 OperationReceipt

```ts
interface OperationReceipt {
    operationId: string

    backend: string

    startedAt: string
    endedAt: string

    status: string

    outputRefs: string[]

    evidenceRefs: string[]

    preState?: string
    postState?: string
}
```

DeepSeek ha tool execution results.

TALOS deve elevare il concetto a:

```text
cross-backend side-effect receipt
```

---

# 39. Plugin contract TALOS

```ts
interface TalosAgentPluginManifest {
    id: string
    version: string

    target:
      | 'mobile-worker'
      | 'native'
      | 'execution-backend'

    provides: CapabilityId[]

    requires: CapabilityId[]

    authority: {
        powers: TalosToolAction[]
    }

    integrity: {
        sha256: string
        source: string
    }
}
```

---

# 39.1 Plugin runtime

```ts
interface TalosPluginContext {
    tools: ToolContributionRegistry

    context: ContextContributionRegistry

    evaluators: EvaluatorRegistry

    capabilities: ScopedCapabilityProxy

    onDispose(fn: () => void): void
}
```

---

# 40. Plugin lifecycle invariants

```text
activate
→ registrations visible

dispose
→ zero registrations remain
```

Test:

```text
listener leak
timer leak
tool leak
screen leak
context leak
```

---

# 41. Runtime assembly activation deve essere transazionale

```text
construct candidate assembly
↓
validate dependency graph
↓
validate authority
↓
validate schema budget
↓
activate shadow scope
↓
health check
↓
atomic swap
↓
dispose old
```

Se fallisce:

```text
old runtime remains live
```

---

# 42. Tool output schemas: parità obbligatoria

TALOS ToolDefinition dovrebbe evolvere:

```ts
interface ToolDefinition<I, O> {
    input: Schema<I>
    output: Schema<O>

    run(
        input: I,
        ctx: ToolRunContext
    ): Promise<O>

    verify?(
        input: I,
        output: O
    ): Promise<Verification>
}
```

---

# 43. Tool concurrency classifier

Aggiungere:

```ts
isConcurrencySafe?(
    input
): boolean
```

Default:

```text
false
```

AgentLoop non deve decidere parallelismo solo su conteggio.

---

# 44. Cancellation semantics

DeepSeek è molto rigoroso su cancellation.

TALOS deve formalizzare:

```text
cancel requested
cancel observed
operation quiesced
```

Non:

```text
AbortController → speriamo
```

---

# 44.1 Long-running process

Backend deve possedere:

```text
process tree
```

e confermare:

```text
all children dead
```

prima di `cancelled`.

---

# 45. Spill e artifact store

DeepSeek ha un package `spill` per risultati grandi e attachment content-addressed.

TALOS deve fare lo stesso.

Non inviare:

```text
full compiler log
full file
full trace
```

nel model context.

---

# 45.1 ArtifactRef

```ts
interface ArtifactRef {
    id: string
    sha256: string
    mediaType: string
    bytes: number
    storage: string
}
```

---

# 46. Context compiler

DeepSeek ha package `context` e prompt assembly dinamico.

TALOS deve combinare:

```text
TaskState
Memory
Tool profile
Plugin contributions
Evidence
Authority
```

in context projection.

---

# 46.1 Cache class

```text
global-stable
profile-stable
workspace-stable
task-stable
volatile
```

per sfruttare provider cache.

---

# 47. Compaction

DeepSeek ha capability family `compaction`.

Quindi compaction non è un differentiator.

TALOS one-up:

> compaction non deve essere responsabile dello stato operativo.

State resta in:

```text
Task Ledger
```

Context compaction diventa solo:

```text
view optimization
```

---

# 48. Session Query

DeepSeek ha:

```text
logical corpus
bounded reads
lineage
event relationships
semantic filtering
SQLite FTS
```

TALOS deve almeno pareggiare per task history.

---

# 49. Guard / repeated tool calls

DeepSeek ha già:

```text
repeat-tool-reminder
timeout-policy
```

Quindi il semplice loop detector non è nuovo.

TALOS one-up:

```text
progress fingerprint
+
cost delta
+
state delta
+
automatic strategy switch
```

---

# 50. Security posture matrix

| Area | DeepSeek Harness | TALOS target |
|---|---|---|
| Native tool policy | strong pipeline | match |
| Tool visibility | scoped restriction, non-authority | match + authority compile |
| Process sandbox | strong cross-platform attempt | match/adapter |
| Code Mode worker | containment, bash-equivalent trust | capability-safe + sandbox admission |
| Workflow worker | containment, bash-equivalent trust | attenuated authority |
| Dynamic runtime plugin | bash-equivalent trust | quarantine + capability membrane |
| Permission UX | sandbox+approval preset | read/write/outbound × allow/ask/deny |
| Session durability | JSONL/SQLite + projections | semantic Task Ledger |
| Subagents | many providers incl Codex/Claude | match + authority/evidence |
| Self-modification | ephemeral | verified persistent promotion |
| Undo | not universal | Universal ChangeSet |
| Mobile authority | not core | first-class |
| Proof completion | tool-level outcomes | task-level proof contract |

---

# 51. Parity checklist TALOS

## Agent kernel

```text
[ ] Agent interface independent from loop
[ ] agent scoped runtime
[ ] create/resume
[ ] durable inbox
[ ] cancellation
[ ] ownership
```

---

## Plugin architecture

```text
[ ] plugin lifecycle
[ ] service definition/provider/consumer separation
[ ] scoped contributions
[ ] unload
[ ] runtime profiles
```

---

## Tool runtime

```text
[ ] typed input
[ ] typed output
[ ] allow/ask/deny pipeline
[ ] monotonic guard
[ ] cancellation
[ ] concurrency classification
[ ] tool-owned UI
[ ] deferred context
```

---

## Coding

```text
[ ] filesystem
[ ] search
[ ] process
[ ] shell
[ ] terminal
[ ] Git
[ ] LSP
[ ] diff
[ ] tests
```

---

## Agentic

```text
[ ] subagent
[ ] background job
[ ] workflow
[ ] skill
[ ] compaction
[ ] context contributors
```

---

## Persistence

```text
[ ] session/task log
[ ] checkpoint
[ ] projection
[ ] query
[ ] artifacts
```

---

## Human

```text
[ ] approvals
[ ] questions
[ ] permissions
[ ] decision inbox
```

---

# 52. Superiority checklist TALOS

```text
[ ] program-level authority manifest
[ ] static effect over-approximation
[ ] operation receipts
[ ] capability leases
[ ] child authority attenuation
[ ] Universal ChangeSet
[ ] reversible/compensatable semantics
[ ] Proof-Carrying Completion
[ ] HarnessBench
[ ] runtime profile fingerprint
[ ] harness A/B
[ ] verified self-promotion
[ ] mobile authority root
[ ] backend-independent task
[ ] model-independent task
```

---

# 53. Revised category bets

Dopo il source audit, queste sono le scommesse che restano davvero interessanti.

---

## BET 1 — Capability-Safe Programmable Harness

Non “plugin system”.

DeepSeek lo ha già.

Differenza:

> **ogni programma/plugin/subagent dichiara e riceve soltanto la capability necessaria.**

---

## BET 2 — Universal Undo / ChangeSet

DeepSeek non mostra un equivalente cross-capability.

TALOS può rendere:

```text
AI action
```

versionabile e reversibile.

---

## BET 3 — Verified Harness Evolution

DeepSeek può modificare live il proprio runtime.

TALOS può:

```text
invent
test
benchmark
prove safe
promote
rollback
```

---

## BET 4 — Harness Time Machine

DeepSeek ha durable session.

TALOS può forkare:

```text
same task
different harness/model/backend
```

e confrontare.

---

## BET 5 — Mobile Authority & Decision Plane

Non un Web UI ridotto.

Il telefono diventa:

```text
control plane
authority root
decision queue
proof viewer
```

---

## BET 6 — Model/Harness/Backend market

TALOS sceglie:

```text
which model
which harness
which execution backend
```

come una singola scheduling problem.

---

# 54. La nuova formula TALOS

La precedente formula:

```text
Agent OS
```

è ancora troppo generica.

Dopo DeepSeek Harness:

```text
MODEL
+
HARNESS
=
WORKER
```

TALOS deve stare sopra:

```text
                  TALOS
                    │
         ┌──────────┼──────────┐
         │          │          │
       STATE     AUTHORITY   EVIDENCE
         │          │          │
         └──────────┼──────────┘
                    │
              ORCHESTRATOR
                    │
        ┌───────────┼────────────┐
        ▼           ▼            ▼
     Model A      Model B      Model C
        │           │            │
   Harness A    Harness B    Harness C
        │           │            │
       Backend selection / execution
```

---

# 55. TALOS should own the meta-layer

Il moat non è:

```text
best model
```

né:

```text
best harness
```

Perché entrambi cambiano rapidamente.

Il moat può essere:

```text
persistent personal task state
+
authority
+
harness selection
+
worker evaluation
+
proof
+
human decisions
+
learning from historical outcomes
```

---

# 56. P0 dependency graph

Non calendario.

---

## P0.1 — Tool output contracts

Prerequisito per composability.

---

## P0.2 — OperationReceipt

Prerequisito per:

```text
proof
undo
replay
cost
```

---

## P0.3 — RuntimeProfile

Lo stesso current agent loop deve accettare:

```text
different tool/context composition
```

---

## P0.4 — Minimal profile

Misurare subito con:

```text
cloud
local GGUF
```

---

## P0.5 — Harness fingerprint

Ogni run riproducibile.

---

# 57. P1 — Coding parity

```text
workspace
Git
process
shell
PTY
LSP
test parser
diff
```

con plugin boundaries.

---

# 58. P2 — Agentic parity

```text
subagents
background jobs
workflow
skill runtime
context contributors
compaction
artifact spill
```

---

# 59. P3 — DeepSeek parity advanced

```text
Code Mode
runtime self-inspection
dynamic candidate plugin
Web UI/plugin presentation
external Codex/Claude worker
```

---

# 60. P4 — TALOS superiority

```text
capability-safe programs
Universal ChangeSet
proof completion
HarnessBench
verified promotion
harness Time Machine
Decision Inbox
hardware-rooted authority
```

---

# 61. First prototype that actually matters

Non iniziare da Creator.

Vertical slice:

```text
coding.minimal
```

Tool:

```text
workspace.search
workspace.read
workspace.patch
process.run
git.diff
```

---

# 61.1 Gate

Misurare:

```text
tool schema bytes
GBNF bytes
prefill
TTFT
tool accuracy
task success
permission prompts
```

con:

```text
local model
DeepSeek V4
OpenAI
Claude
```

---

# 62. Second prototype — Code Mode read-only

Bindings:

```text
workspace.search
workspace.read
git.status
git.diff
```

Nessuna write.

Model genera multi-step program.

Confrontare con native loop.

---

# 62.1 Success criterion

```text
same verified answer
lower model turns
lower input tokens
no permission regression
```

---

# 63. Third prototype — Operation + ChangeSet

Abilitare:

```text
workspace.patch
```

con:

```text
pre-state
hash
receipt
undo
```

---

# 64. Fourth prototype — Subagent worker

Prima:

```text
TALOS local child
```

Poi adapter:

```text
Codex / Claude Code / DeepSeek Harness
```

secondo backend availability.

---

# 65. Fifth prototype — Harness Lab

Solo dopo:

```text
fingerprints
bench
receipts
security gates
```

Altrimenti self-modification non è controllabile.

---

# 66. Killer demo aggiornata

Prompt:

> Riduci il bundle iniziale AVM sotto 570 KB senza regressioni.

TALOS:

1. compila `coding.minimal`;
2. misura baseline;
3. lancia 4 worker:
   - DeepSeek Harness worker;
   - Claude Code;
   - Codex;
   - TALOS native;
4. ogni worker opera su isolated workspace;
5. ogni patch entra in ChangeSet;
6. evaluator esegue:
   - tests;
   - build;
   - bundle;
   - startup;
7. scarta patch che modifica evaluator;
8. prova due Harness profile diversi sui candidate migliori;
9. presenta sul telefono:

```text
4 worker
17 candidate
8 valid
3 Pareto-optimal

WINNER
Worker: DeepSeek Harness
Harness: minimal-program
JS: 563,214 B
Tests: 482/482
Startup: -2.8%
Authority used:
  read ✓
  write ✓
  outbound ✗

Undo:
100% reversible
```

10. utente approva;
11. TALOS applica;
12. proof bundle;
13. undo disponibile.

La demo comunica:

> TALOS non deve battere DeepSeek Harness come worker. Deve sapere quando usarlo, contenerlo, verificarlo e renderne reversibile il lavoro.

---

# 67. Second killer demo — harness evolution

Task campione ripetuto 50 volte.

Baseline:

```text
coding.standard
```

Harness Lab genera:

```text
candidate H1..H8
```

Misura:

```text
verified success
tokens
latency
permission prompts
GBNF
```

Una candidate:

```text
+9 pp success
-28% input tokens
-43% tool calls
same authority
```

TALOS propone:

```text
PROMOTE?
```

Non auto-promuove.

---

# 68. Third killer demo — Code Mode authority

Model programma:

```text
search files
read relevant files
patch 3 files
run tests
```

Prima dell’esecuzione, telefono:

```text
PROGRAMMA PROPOSTO

READ
AVM/src/**

WRITE
AVM/src/chat/**
AVM/tests/chat/**

OUTBOUND
NO

Max:
22 operazioni
60s

All writes:
reversible

[APPROVA]
[VEDI PROGRAMMA]
```

DeepSeek-level programmability, ma con TALOS authority semantics.

---

# 69. Riesame delle idee precedenti

## Durable Runtime

Non è rivoluzionario.

DeepSeek ha già una session data plane durabile.

TALOS deve farlo meglio a livello operation/task.

---

## Proof

Resta forte.

---

## Authority

Diventa ancora più importante dopo aver visto la trust posture DeepSeek.

---

## Execution Fabric

Resta strategica.

---

## Workflow Compiler

Non è moat da solo.

DeepSeek ha Code Mode + workflow.

Deve diventare:

```text
successful program
→ verified deterministic automation
```

---

## Evolutionary Engineering

Resta forte e ora è più implementabile.

---

## Agent Supervisor

Non è moat da solo: DeepSeek ha Codex/Claude adapters.

Deve diventare:

```text
measured supervisor with authority/proof
```

---

## Time Machine

Resta molto differenziante se include harness/backend fork.

---

## Universal Undo

Resta una delle migliori scommesse.

---

# 70. Dove TALOS può realisticamente essere migliore

Non in:

```text
number of packages
```

DeepSeek ha già enorme breadth.

Non in:

```text
desktop execution today
```

DeepSeek è avanti.

Non in:

```text
plugin composability today
```

DeepSeek è avanti.

Non in:

```text
subagent provider count today
```

DeepSeek è avanti.

---

# 70.1 TALOS potential advantages

### A — Permission grammar

Già migliore come modello mentale cross-domain:

```text
read/write/outbound
```

---

### B — Mobile authority

DeepSeek non nasce mobile-first.

---

### C — Local model integration

TALOS possiede già GGUF Android.

---

### D — Operation provenance

TALOS ha già authorization input digests e chain security.

---

### E — Product convergence

Chat + device + personal agent + coding nello stesso control plane.

---

# 71. Biggest architectural mistake to avoid

Copiare DeepSeek package-per-capability senza capirne il costo.

DeepSeek può tollerare:

```text
Node >=22
pnpm monorepo
hundreds of packages
desktop/server runtime
```

TALOS Android non può caricare centinaia di plugin nel initial bundle.

---

# 71.1 TALOS rule

```text
logical modularity
≠
eager runtime modularity
```

Manifest lightweight.

Implementation lazy.

---

# 72. Bundle gate

TALOS current snapshot:

```text
JS initial ~597,770 B
limit      600,000 B
```

Quindi prima di Harness UI:

```text
route lazy
dynamic import
worker chunk
```

obbligatori.

---

# 73. Native vs JS capability

DeepSeek è Node-centric.

TALOS dovrebbe classificare:

```text
mobile-js
android-native
execution-backend
remote-worker
```

per ogni capability.

---

# 74. No giant Capacitor bridge

Non trasferire:

```text
LSP streams
terminal logs
repo contents
large diffs
```

via high-frequency Capacitor message.

Usare:

```text
artifact refs
batch events
native storage
backend streaming
```

---

# 75. Error taxonomy

DeepSeek usa error code stabili.

TALOS deve introdurre:

```text
PLUGIN_UNAVAILABLE
PLUGIN_INTEGRITY
PROFILE_INVALID
TOOL_SCHEMA_BUDGET
CAPABILITY_DENIED
CAPABILITY_SCOPE
BACKEND_INCOMPATIBLE
PROGRAM_TIMEOUT
PROGRAM_OUTPUT_LIMIT
PROGRAM_EFFECT_MISMATCH
WORLD_CONFLICT
UNDO_CONFLICT
PROOF_MISSING
WORKER_UNVERIFIED
```

---

# 76. Source-derived TALOS design rules

## Rule 1

Loop swappable.

---

## Rule 2

Capability definition ≠ provider ≠ consumer.

---

## Rule 3

Tool visibility ≠ authority.

---

## Rule 4

Worker thread ≠ sandbox.

DeepSeek lo dice esplicitamente.

---

## Rule 5

Process sandbox enforcement deve dichiarare completeness.

---

## Rule 6

Self-modification vive sopra immutable security kernel.

---

## Rule 7

Every runtime configuration gets a fingerprint.

---

## Rule 8

Every mutation gets an operation receipt.

---

## Rule 9

Every external worker result is untrusted until verified.

---

## Rule 10

User permission model remains read/write/outbound.

---

# 77. Final target architecture

```text
                         TALOS MOBILE
                             │
                ┌────────────┴────────────┐
                │ AUTHORITY / DECISIONS   │
                │ PROOF / REVIEW / STATUS │
                └────────────┬────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│                     TALOS TASK KERNEL                       │
│                                                              │
│ Task Ledger ─ Authority ─ Operations ─ Evidence ─ Budget     │
│      │            │           │           │                   │
│      └────────────┴──────┬────┴───────────┘                   │
│                          ▼                                   │
│                  HARNESS MICROKERNEL                         │
│                          │                                   │
│                  RuntimeProfile                              │
│                          │                                   │
│   ┌────────┬────────┬────┼─────┬──────────┬───────────┐      │
│   ▼        ▼        ▼    ▼     ▼          ▼           ▼      │
│ Tools   Context    LSP Workflow Skills Subagents   Code VM   │
│   │        │        │    │     │          │           │      │
└───┼────────┼────────┼────┼─────┼──────────┼───────────┼──────┘
    │        │        │    │     │          │           │
    └────────┴────────┴────┴─────┴──────────┴───────────┘
                             │
                             ▼
                    EXECUTION BROKER
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
   Android local       user-owned backend     cloud/provider
                             │
                             ▼
                    external workers
           DeepSeek / Codex / Claude / Hermes / local
```

---

# 78. Strategic sentence

La frase strategica aggiornata è:

> **DeepSeek Harness dimostra che il futuro non è un agente con molti tool, ma un harness programmabile. TALOS deve andare un livello sopra: un sistema che può programmare e cambiare il proprio harness senza mai permettere all’AI di cambiare autonomamente i propri limiti di autorità.**

---

# 79. La vera scommessa

Non:

> “TALOS ha più plugin di DeepSeek.”

Non:

> “TALOS ha un Code Mode migliore.”

Non:

> “TALOS ha più subagent.”

Ma:

> **TALOS può usare, confrontare, modificare e perfino sostituire gli harness, mantenendo sopra di essi lo stesso stato personale, gli stessi permessi, le stesse prove e la stessa capacità di tornare indietro.**

Questa è una posizione architetturale molto più resistente.

---

# 80. Riassunto semplice e non tecnico

DeepSeek Harness è molto più avanzato di quanto sembrasse all’inizio.

Ha già praticamente tutti i pezzi che servono a costruire un agente potente:

- può usare strumenti;
- può programmare;
- può creare altri agenti;
- può usare Codex e Claude;
- può eseguire workflow;
- può isolare processi;
- può ricordare le sessioni;
- può perfino modificare temporaneamente il proprio sistema mentre sta lavorando.

Quindi TALOS non può distinguersi dicendo:

> “Anch’io ho plugin, subagent e coding.”

Deve fare qualcosa di più.

La direzione più forte è questa:

### **DeepSeek permette all’AI di cambiare come lavora. TALOS dovrebbe permetterlo senza mai lasciarle cambiare da sola ciò che è autorizzata a fare.**

E poi aggiungere tre cose molto forti:

### **1. Tutto ciò che TALOS modifica può essere controllato e, quando possibile, annullato.**

### **2. TALOS non si fida del risultato di un agente: lo verifica.**

### **3. TALOS può provare DeepSeek, Claude, Codex o un proprio agente e scegliere quello che ha realmente prodotto il risultato migliore.**

In pratica:

> **Gli altri possono costruire i migliori lavoratori AI. TALOS può diventare il sistema che li dirige, limita, verifica e sceglie.**

---

# 81. Fonti sorgente DeepSeek Harness auditate

Repository:

```text
https://github.com/deepseek-ai/deepseek-harness
```

Commit:

```text
47f943859bef60e4160492346772ded9b24f765a
```

File principali letti:

```text
README.md
package.json

packages/README.md

packages/core/agent/README.md
packages/core/tools/README.md

packages/code-runtime/README.md
packages/code-runtime/code-runtime-worker-thread/README.md

packages/workflow/README.md
packages/workflow/workflow-worker-thread/README.md

packages/subagent/README.md

packages/session/README.md

packages/sandbox/README.md
packages/sandbox/sandbox-local/README.md

packages/interaction/README.md
packages/interaction/permission-presets/README.md

packages/extensions/README.md
packages/extensions/tool-cordis/README.md
packages/extensions/cordis-host-runner/README.md

packages/guard/README.md
```

Altri elementi verificati dal repository tree:

```text
packages/fs
packages/lsp
packages/shell
packages/subprocess
packages/terminal
packages/skill
packages/compaction
packages/context
packages/jobs
packages/web
packages/attachment
packages/spill
packages/plan
packages/preset
packages/bundle
packages/sdk
packages/acp
packages/credentials
packages/storage
packages/workspace
packages/client
packages/host
packages/feedback
packages/goal
packages/schedule
```

---

# 82. Baseline TALOS utilizzata

```text
branch:
lane/talos-mobile

commit:
85203e76ffb15efafb83285eba000cd8c420a2a8
```

File TALOS precedentemente verificati:

```text
mobile/src/lib/tools/permissionTypes.ts
mobile/src/lib/tools/registry.ts
mobile/src/lib/tools/security.ts
mobile/src/lib/tools/toolAuthorizations.ts
mobile/src/lib/tools/toolAuthorizationCheckpoint.ts
mobile/src/lib/tools/agentLoop.ts
mobile/src/lib/tools/executor.ts
mobile/src/lib/tools/toolControlCatalog.ts
mobile/src/lib/tools/toolControls.ts
mobile/src/lib/talosTypes.ts
mobile/src/services/taskRuns.ts
mobile/src/services/longRunKeeper.ts
```

---

# 83. Nota finale di scope

Questo audit è **read-only**.

Nessun file, branch, issue, PR, commento o stato del repository DeepSeek è stato modificato.

La repository è stata interrogata esclusivamente per:

```text
metadata
tree
file reads
source documentation
commit metadata
```

---

**Fine — TALOS Parte 2 aggiornata, DeepSeek Harness source audit.**
