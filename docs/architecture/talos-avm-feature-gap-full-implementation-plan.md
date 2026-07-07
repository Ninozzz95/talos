# TALOS AVM Feature Gap Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation. This is the master plan. Each phase must be executed as a tested vertical slice with review gates before the next phase starts. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build TALOS into a complete AVM-native AI workspace where every user-visible function is backed by real backend behavior, deterministic AVM evidence, persistence, security policy, replay, and tests.

**Architecture:** TALOS is the product surface, Laravel is the control plane, PHP core is the deterministic AVM engine, Node/Fastify is the stateless JMP validator, and KADMOS CLI is the terminal surface. Odysseus is used as a feature coverage benchmark, but TALOS must improve every comparable feature with typed plans, validation, DAG execution, policy enforcement, trace replay, and AVM ON/OFF benchmark evidence.

**Tech Stack:** PHP 8.5, Laravel 13, Vue 3, Vite, TypeScript, Tailwind 4, shadcn-vue style primitives, Reka UI, lucide-vue, Node.js 24, Fastify, Zod, SQLite for local dev, PostgreSQL-ready schema, PHPUnit, Laravel feature tests, Vitest/Vue Test Utils when UI unit testing is introduced, Playwright when browser E2E is introduced.

## Global Constraints

- Never commit from an agent session. The user owns commits.
- No production UI feature may be fake. It must call a real endpoint or be hidden until the real endpoint exists.
- Demo fixtures are allowed only when visually labeled as demo data.
- `/chat` remains the dedicated low-noise chat surface.
- `/dashboard` is the cockpit/control-plane surface for files, runs, trace, benchmark, tools, policy, doctor, and admin.
- `core/` remains framework-free PHP and owns deterministic DAG behavior, node state, workers, benchmark semantics, and KADMOS CLI primitives.
- `validator/` remains stateless and owns Zod/JMP validation only.
- `control-plane/` owns product state: sessions, messages, files, runs, trace events, users, provider profiles, reports, queues, and UI delivery.
- Provider secrets stay server-side in production. The browser sends a provider profile id, not raw provider keys.
- AVM ON/OFF comparisons must use the same prompt, model, context, evaluator, and stored logs.
- Uploaded files, web pages, emails, memories, tool outputs, connector outputs, and MCP outputs are untrusted data.
- Dangerous actions fail closed unless an explicit capability and policy decision allows them.
- Every phase ends with relevant focused tests plus `git diff --check`.

---

## 1. Definition Of 100 Percent Functional

A TALOS function is complete only when all required layers are present.

### 1.1 Required Layers

- **Discovery:** the user can find the function from `/chat`, `/dashboard`, the command palette, or KADMOS CLI.
- **UI:** the surface has loading, empty, success, error, permission-denied, and degraded states.
- **API:** the UI calls a Laravel endpoint or a documented internal bridge.
- **Persistence:** state is stored when the user expects it to survive refresh, navigation, or restart.
- **Validation:** external input is validated by Laravel request rules, Zod where protocol-related, and PHP value objects where core-related.
- **AVM integration:** execution-related functions produce or consume AVM nodes, statuses, policy decisions, or trace events.
- **Security:** capability checks, policy checks, and audit events exist for data or tool access.
- **Replay:** execution-related functions can be replayed, or the UI explicitly marks them as non-replayable with a reason.
- **Benchmark:** demo-worthy execution functions can run AVM ON/OFF comparison where meaningful.
- **Observability:** errors are surfaced as controlled faults, not silent failures or preventable 500s.
- **Tests:** backend tests cover API behavior, core tests cover deterministic logic, validator tests cover schema behavior, and UI/browser tests cover user-critical flows.

### 1.2 Completion Gate

Every feature PR or work slice must answer these questions before it is called finished:

- Which exact user action does this enable?
- Which route or command exposes it?
- Which endpoint backs it?
- Which database table or file stores it?
- Which AVM event, node, run, or policy decision does it emit?
- Which tests prove it?
- What happens when the provider is missing, the validator is down, the file is bad, the user lacks permission, or the worker fails?

If any answer is missing, the feature is not finished.

---

## 2. Product North Star

The product claim must be precise:

```text
TALOS does not make LLMs deterministic.
TALOS makes the execution boundary deterministic, inspectable, recoverable, and benchmarkable.
```

The first-run "wow" must be practical:

1. User uploads or selects real context.
2. User asks a natural-language task.
3. TALOS shows the model plan becoming typed JMP.
4. The validator accepts or rejects mutations.
5. AVM builds and schedules a DAG.
6. Policy blocks risky actions before execution.
7. The UI shows what happened in plain language.
8. The user can replay the run.
9. The user can compare AVM ON against AVM OFF.
10. The user can export evidence.

This is stronger than a normal chatbot because the user does not just receive an answer. The user sees proof of controlled execution.

---

## 3. End-To-End AVM Pipeline

Every major TALOS workflow should map to this pipeline.

```text
User action
  -> TALOS UI command
  -> Laravel request validation
  -> session/message/file/run persistence
  -> provider profile resolution
  -> context assembly
  -> LLM proposal
  -> JMP validation through Node/Zod
  -> AVM DAG mutation in PHP core
  -> execution policy check
  -> Kahn scheduler
  -> worker execution
  -> node status transitions
  -> trace events persisted in Laravel
  -> UI live stream or polling render
  -> HMI recovery if needed
  -> replay/export/benchmark
```

### 3.1 Runtime State Objects

The following objects must become stable contracts:

```text
TalosSession
TalosMessage
TalosProviderProfile
TalosContextSet
TalosFile
TalosFileChunk
TalosRun
TalosRunEvent
TalosRunArtifact
TalosBenchmarkGroup
TalosBenchmarkResult
TalosConnector
TalosTool
TalosMemory
TalosSkill
TalosAuditEvent
```

### 3.2 Canonical Run Event Shape

All event-producing systems must normalize into this shape before UI rendering:

```json
{
  "run_id": "uuid",
  "sequence": 42,
  "event_type": "node.status_changed",
  "node_id": "fetch_user_api",
  "severity": "info",
  "payload": {
    "from": "RUNNING",
    "to": "SUCCESS",
    "summary": "HTTP request completed with status 200"
  },
  "created_at": "2026-07-07T10:00:00.000Z"
}
```

### 3.3 Canonical Status Translation

The UI may show friendly language, but the technical state must remain available in the inspector.

| Core status | User-facing copy | Inspector copy |
|---|---|---|
| `PENDING` | Waiting for prerequisites | Node is waiting for parent success |
| `VALIDATED` | Step verified and ready | Payload passed schema validation |
| `RUNNING` | Step is executing | Worker is active |
| `SUCCESS` | Step completed and verified | Worker completed without fault |
| `FAILED` | Step failed safely | Worker or logic failed |
| `BLOCKED_BY_DEPENDENCY` | Waiting for a failed dependency to be resolved | Parent failure blocked this branch |
| `RETRYING` | Retry requested | HMI or policy retry is queued |
| `SKIPPED` | Step skipped by policy | Conditional branch not executed |
| `PRUNED` | Branch removed | Branch was pruned by approved policy |

---

## 4. Current Gap Summary

### 4.1 What TALOS Already Has

- Clean `/chat` route mounted from Laravel.
- `/dashboard` cockpit route mounted from Laravel.
- Vue components for chat and cockpit prototypes.
- Local UI primitives: `Button`, `Badge`, `Surface`.
- Chat proxy endpoint: `POST /api/talos/chat`.
- File ingestion endpoint: `POST /api/files/ingest`.
- Benchmark comparison endpoint: `POST /api/benchmarks/compare`.
- Fault explainer endpoint: `POST /api/faults/explain`.
- Trace replay endpoint: `POST /api/traces/replay`.
- PHP core with AST orchestration, workers, benchmark runner, security policy, and CLI primitives.
- Node validator with schemas and Fastify routes.
- Existing docs for benchmark, failure policy, security, naming, Odysseus gap, and agent operating model.

### 4.2 Main Product Gaps

- No persistent chat session and message model.
- Browser still carries API key in current dev chat flow.
- `/dashboard` contains useful ideas but still mixes fixture-looking UI with real controls.
- File ingestion is not yet a complete Context Vault with parse, chunk, provenance, and per-run source selection.
- Trace events are not yet the central UI rendering contract.
- Benchmark comparison is not yet a first-class user journey from chat and uploaded files.
- Tool breadth is far below Odysseus and not yet exposed as controlled AVM workers.
- Memory, skills, research, documents, email, tasks, calendar, gallery, connectors, admin, backup, and model center are not yet complete product modules.
- KADMOS CLI has improved, but it needs parity with modern agent terminals through guided mode, command registry, trace/replay, and benchmark commands.

### 4.3 Odysseus Feature Gap Interpreted For TALOS

| Odysseus-style area | TALOS gap today | TALOS improvement target |
|---|---|---|
| Chat workspace | Basic chat proxy, no persistence | Persistent sessions, model profile, files, run trace, replay, AVM compare |
| Agents/tools | Limited worker set | Typed tool registry, AVM workers, policy, audit, replay |
| Uploads/documents | Ingestion service started | Context Vault with scanning, parsing, chunking, source provenance |
| Memory/skills | Not productized | Scoped memory and skill registry with eval and permission model |
| Deep research | Not productized | AVM run template with source trace and claim verification |
| Compare | Endpoint started | Three-lane compare with AVM ON, AVM OFF, agent baseline |
| Model/cookbook | Not productized | Model Center with probes, compatibility profile, hardware fit |
| Email | Not productized | Read-only first, draft-only second, HMI send confirmation |
| Notes/tasks/calendar | Not productized | Run-linked productivity objects with audit and permissions |
| Gallery/media | Media assets exist | Artifact gallery tied to run provenance |
| Themes/accessibility | Basic theme | Enterprise light/dark, density, reduced motion, high contrast |
| Admin/security | Basic Laravel auth exists | Capabilities, scoped tokens, audit, policy UI, provider profiles |
| Backup/diagnostics | Doctor exists mostly in CLI | Web Doctor, backup manifest, restore validation |
| MCP/webhooks/coding agents | Not productized | Connector registry with capability map and policy boundary |

---

## 5. Target Information Architecture

### 5.1 Routes

```text
/chat
  Dedicated chat page. Low-noise. No cockpit panels.
  Includes session sidebar when persistence exists, but no benchmark walls or admin panels.

/dashboard
  Control-plane cockpit. Runs, files, trace, replay, benchmark, tools, models, policy, admin.

/dashboard/runs/:id
  Deep link to one run in cockpit.

/dashboard/benchmarks/:id
  Deep link to one comparison report.

/dashboard/files/:id
  Deep link to one ingested file and its provenance.
```

Laravel can implement deep links as query or SPA state first. Full routing can be introduced after component boundaries are stable.

### 5.2 `/chat` Layout

```text
Top bar
  New chat
  session title
  model/profile state
  settings shortcut

Main column
  message thread
  assistant answers
  compact run proof chips

Composer
  natural prompt
  file chips
  slash commands
  AVM mode selector
  send button
```

No noisy cards. No static benchmark panels. No fake graph. The chat page should feel like a premium AI chat app, but every answer can expand into evidence.

### 5.3 `/dashboard` Layout

```text
Left rail
  Chat
  Runs
  Files
  Benchmarks
  Tools
  Models
  Memory
  Research
  Documents
  Productivity
  Artifacts
  Doctor
  Admin

Secondary sidebar
  Recent sessions
  run filters
  selected context set
  saved benchmark packs

Main workspace
  selected module
  run timeline
  graph
  compare workbench
  file vault

Right inspector
  selected node
  source provenance
  validation faults
  policy decisions
  recovery controls
```

The cockpit can be dense. It should not be playful. It must feel like an operational console for repeated work.

---

## 6. Shared Data Model Plan

Create migrations in `control-plane/database/migrations`.

### 6.1 Session And Message Tables

```text
talos_sessions
  id uuid primary
  user_id nullable foreign
  title string
  mode enum: answer_only, verified_execution
  active_model_profile_id nullable uuid
  metadata json
  created_at
  updated_at

talos_messages
  id uuid primary
  session_id uuid foreign
  role enum: user, assistant, system, tool
  content text
  model_profile_id nullable uuid
  run_id nullable uuid
  metadata json
  created_at
```

### 6.2 Files And Context

```text
talos_files
  id uuid primary
  user_id nullable foreign
  original_name string
  mime_type string
  size_bytes unsignedBigInteger
  checksum string unique
  status enum: uploaded, scanned, parsed, chunked, embedded, available, quarantined, failed
  storage_path string
  parser string nullable
  failure_reason text nullable
  metadata json
  created_at
  updated_at

talos_file_chunks
  id uuid primary
  file_id uuid foreign
  ordinal unsignedInteger
  content text
  content_hash string
  token_estimate unsignedInteger
  embedding_ref string nullable
  metadata json
  created_at

talos_context_sets
  id uuid primary
  session_id uuid nullable foreign
  user_id nullable foreign
  name string
  metadata json
  created_at

talos_context_sources
  id uuid primary
  context_set_id uuid foreign
  file_id uuid nullable foreign
  chunk_id uuid nullable foreign
  selector json
  created_at
```

### 6.3 Runs, Events, Artifacts

```text
talos_runs
  id uuid primary
  session_id uuid nullable foreign
  message_id uuid nullable foreign
  context_set_id uuid nullable foreign
  benchmark_group_id uuid nullable foreign
  mode enum: avm_on, avm_off_direct, tool_agent
  status enum: queued, planning, validating, running, blocked, succeeded, failed, cancelled
  model_profile_id nullable uuid
  prompt_hash string
  context_hash string nullable
  started_at timestamp nullable
  finished_at timestamp nullable
  metadata json
  created_at
  updated_at

talos_run_events
  id uuid primary
  run_id uuid foreign
  sequence unsignedInteger
  event_type string
  node_id string nullable
  severity enum: debug, info, warning, error
  payload json
  created_at

talos_run_artifacts
  id uuid primary
  run_id uuid foreign
  artifact_type enum: text, json, html, csv, image, pdf, markdown, patch, trace, report
  label string
  storage_path string nullable
  inline_payload json nullable
  metadata json
  created_at
```

### 6.4 Benchmarks

```text
talos_benchmark_groups
  id uuid primary
  session_id uuid nullable foreign
  source_run_id uuid nullable foreign
  name string
  prompt_hash string
  context_hash string nullable
  evaluator_version string
  created_at

talos_benchmark_results
  id uuid primary
  benchmark_group_id uuid foreign
  run_id uuid foreign
  mode enum: avm_on, avm_off_direct, tool_agent
  score json
  raw_log_path string nullable
  created_at
```

### 6.5 Tools, Connectors, Model Profiles

```text
talos_model_profiles
  id uuid primary
  user_id nullable foreign
  provider string
  model string
  display_name string
  secret_ref string nullable
  base_url string nullable
  status enum: untested, healthy, degraded, failed, disabled
  capabilities json
  probe_result json
  created_at
  updated_at

talos_connectors
  id uuid primary
  name string
  kind enum: web, file, database, email, calendar, mcp, webhook, model, local_runtime
  status enum: disabled, setup_required, healthy, degraded, failed
  capabilities json
  config json
  created_at
  updated_at

talos_tools
  id uuid primary
  connector_id uuid nullable foreign
  name string unique
  worker_type string
  risk enum: low, medium, high, critical
  input_schema json
  output_schema json
  enabled boolean
  policy json
  created_at
  updated_at
```

### 6.6 Memory, Skills, Productivity, Audit

```text
talos_memories
  id uuid primary
  user_id nullable foreign
  project_key string nullable
  kind enum: preference, project_fact, procedure, policy_note, rejected
  content text
  trust enum: user_confirmed, inferred, imported, quarantined
  enabled boolean
  metadata json
  created_at
  updated_at

talos_skills
  id uuid primary
  name string unique
  trigger json
  input_schema json
  allowed_tools json
  output_schema json
  risk enum: low, medium, high, critical
  review_status enum: draft, testing, approved, disabled
  benchmark_pack_ref string nullable
  created_at
  updated_at

talos_audit_events
  id uuid primary
  actor_type string
  actor_id string nullable
  event_type string
  resource_type string nullable
  resource_id string nullable
  severity enum: info, warning, error, security
  payload json
  created_at
```

---

## 7. Shared API Surface Plan

All endpoints live under `control-plane/routes/api.php`.

### 7.1 Chat And Sessions

```text
GET    /api/talos/sessions
POST   /api/talos/sessions
GET    /api/talos/sessions/{session}
PATCH  /api/talos/sessions/{session}
DELETE /api/talos/sessions/{session}
POST   /api/talos/sessions/{session}/messages
POST   /api/talos/chat
```

`POST /api/talos/chat` can remain as a compatibility endpoint, but the durable path is `POST /api/talos/sessions/{session}/messages`.

### 7.2 Files And Context

```text
POST   /api/talos/files
GET    /api/talos/files
GET    /api/talos/files/{file}
POST   /api/talos/files/{file}/ingest
POST   /api/talos/context-sets
GET    /api/talos/context-sets/{contextSet}
PATCH  /api/talos/context-sets/{contextSet}
```

Keep existing `POST /api/files/ingest` as compatibility until UI migrates.

### 7.3 Runs And Replay

```text
GET    /api/talos/runs
GET    /api/talos/runs/{run}
GET    /api/talos/runs/{run}/events
POST   /api/talos/runs/{run}/replay
POST   /api/talos/runs/{run}/recover
POST   /api/talos/runs/{run}/cancel
GET    /api/talos/runs/{run}/artifacts
```

### 7.4 Benchmarks

```text
GET    /api/talos/benchmark-scenarios
POST   /api/talos/benchmarks
GET    /api/talos/benchmarks/{benchmarkGroup}
POST   /api/talos/benchmarks/{benchmarkGroup}/export
POST   /api/benchmarks/compare
```

Keep existing `POST /api/benchmarks/compare` as compatibility until persisted benchmark groups exist.

### 7.5 Tools, Models, Connectors

```text
GET    /api/talos/model-profiles
POST   /api/talos/model-profiles
POST   /api/talos/model-profiles/{profile}/probe
GET    /api/talos/connectors
POST   /api/talos/connectors/{connector}/probe
GET    /api/talos/tools
PATCH  /api/talos/tools/{tool}
```

### 7.6 Memory, Skills, Research, Productivity

```text
GET    /api/talos/memories
POST   /api/talos/memories
PATCH  /api/talos/memories/{memory}
GET    /api/talos/skills
POST   /api/talos/skills
POST   /api/talos/skills/{skill}/evaluate
POST   /api/talos/research
GET    /api/talos/research/{run}
GET    /api/talos/documents
GET    /api/talos/tasks
GET    /api/talos/notes
GET    /api/talos/calendar-events
```

### 7.7 Admin, Doctor, Audit, Backup

```text
GET    /api/talos/doctor
GET    /api/talos/audit-events
GET    /api/talos/policies
PATCH  /api/talos/policies/{policy}
GET    /api/talos/capabilities
POST   /api/talos/backups
POST   /api/talos/backups/validate
```

---

## 8. Frontend Architecture Plan

### 8.1 Target File Tree

```text
control-plane/resources/js/
  app.js
  lib/
    api.ts
    talosTypes.ts
    statusCopy.ts
    statusTone.ts
    commandRegistry.ts
    featureFlags.ts
  composables/
    useTalosApi.ts
    useTalosSessions.ts
    useTalosChat.ts
    useTalosRuns.ts
    useTalosFiles.ts
    useTalosBenchmarks.ts
    useTalosCommandPalette.ts
    useTalosTheme.ts
    useTalosToasts.ts
  components/
    ui/
      Button.vue
      Badge.vue
      Surface.vue
      Dialog.vue
      Sheet.vue
      Tabs.vue
      Tooltip.vue
      DropdownMenu.vue
      Command.vue
      ScrollArea.vue
      Progress.vue
      Table.vue
      Toast.vue
    talos/
      chat/
        TalosChatPage.vue
        TalosChatThread.vue
        TalosComposer.vue
        TalosMessage.vue
        TalosSessionSidebar.vue
      shell/
        TalosDashboardShell.vue
        TalosLeftRail.vue
        TalosInspector.vue
        TalosCommandPalette.vue
      runs/
        TalosRunTimeline.vue
        TalosNodeGraph.vue
        TalosNodeInspector.vue
        TalosTraceReplay.vue
        TalosRecoveryPanel.vue
      files/
        TalosContextVault.vue
        TalosFileDropzone.vue
        TalosFileStatusList.vue
        TalosSourceDrawer.vue
      benchmarks/
        TalosBenchmarkWorkbench.vue
        TalosBenchmarkLane.vue
        TalosMetricCard.vue
        TalosDiffViewer.vue
      tools/
        TalosToolRegistry.vue
        TalosConnectorHealth.vue
      models/
        TalosModelCenter.vue
        TalosModelProbeLog.vue
      admin/
        TalosDoctorPanel.vue
        TalosAuditLog.vue
        TalosPolicyPanel.vue
```

### 8.2 shadcn-vue Adoption

Use shadcn-vue style components as owned source, not a black-box theme. Initial primitives:

```text
Button
Badge
Dialog
Sheet
Tabs
Tooltip
DropdownMenu
Command
ScrollArea
Progress
Table
Toast
Separator
Input
Textarea
Select
Switch
```

Rules:

- Do not make the UI look like a generic shadcn demo.
- Cards are for repeated items, inspectors, and modals; not every section.
- Icons use `lucide-vue`.
- Every icon-only button has tooltip and accessible label.
- Button text must fit at mobile and desktop widths.
- Reduced motion must disable nonessential animation.

### 8.3 API Client Contract

Create `control-plane/resources/js/lib/api.ts`.

Required behavior:

- Centralize `fetch`.
- Add `Accept: application/json`.
- Parse JSON only when response is JSON.
- Convert non-2xx into typed `TalosApiError`.
- Preserve validation error bags.
- Never swallow network errors.

### 8.4 Command Registry

Create `control-plane/resources/js/lib/commandRegistry.ts`.

Every action appears once and is rendered in the command palette, toolbar, or shortcut help:

```text
new_session
send_message
attach_file
open_context_vault
run_avm_compare
open_trace_replay
recover_failed_node
open_benchmark_workbench
open_model_center
open_doctor
export_report
```

Each command stores:

```text
id
label
description
category
defaultShortcut
capability
risk
handler
visibleWhen
disabledReason
```

---

## 9. Feature Modules

Each module below must be implemented as a vertical slice: UI, API, persistence, AVM/evidence integration, tests, and acceptance criteria.

### Module 1: Dedicated Chat Workspace

**User value:** TALOS feels as simple as ChatGPT or Claude for normal users, but every answer can expand into evidence.

**AVM role:** User messages create run shells. Verified execution messages attach to AVM runs, events, artifacts, and benchmark groups.

**UI surfaces:**

- `/chat`
- `TalosChatPage.vue`
- `TalosChatThread.vue`
- `TalosComposer.vue`
- `TalosMessage.vue`
- `TalosSessionSidebar.vue`

**Backend work:**

- Add session/message migrations and models.
- Add `TalosSessionController`.
- Add `TalosMessageController`.
- Keep `TalosChatController` as compatibility proxy.
- Create `TalosRunFactory` to create a run shell when a message enters verified execution mode.

**Tests:**

- `control-plane/tests/Feature/TalosSessionApiTest.php`
- `control-plane/tests/Feature/TalosMessageApiTest.php`
- Existing `TalosChatApiTest` remains.
- UI build test through `npm run build`.

**Acceptance:**

- User can create, rename, open, and delete a session.
- User can send a message and refresh the page without losing it.
- Empty state, loading state, error state, and missing provider state are visible.
- No raw API key is required in the composer after provider profiles exist.
- Assistant message can show compact chips: `Validated`, `Trace`, `Compare`, `Replay`.

### Module 2: Guided Onboarding And Slash Commands

**User value:** A non-shell user can operate TALOS, while expert users keep fast slash commands.

**AVM role:** Commands become typed user intents that call real TALOS APIs.

**UI surfaces:**

- `TalosCommandPalette.vue`
- `TalosOnboardingChecklist.vue`
- `TalosShortcutHelp.vue`

**Command set:**

```text
/new
/ingest
/compare
/replay
/explain
/recover
/bench
/model
/memory
/research
/docs
/doctor
/settings
```

**Tests:**

- Command registry has unique IDs.
- Every command has a visible label and disabled reason.
- Toolbar actions map to command IDs.
- Beginner mode hides high-risk commands until a capability unlocks them.

**Acceptance:**

- First-run user can complete: create session -> add provider -> send prompt -> inspect proof.
- Expert user can run `/compare` from the composer.
- Disabled commands explain exactly what dependency is missing.

### Module 3: Context Vault And File Ingestion

**User value:** Users test TALOS on their own files, not canned demos.

**AVM role:** Files become scoped context sources. Answers and runs cite exact file chunks and show provenance.

**UI surfaces:**

- `TalosContextVault.vue`
- `TalosFileDropzone.vue`
- `TalosFileStatusList.vue`
- `TalosSourceDrawer.vue`
- Composer file chips on `/chat`

**Backend work:**

- Add file/context migrations.
- Extend `FileIngestionService` into staged pipeline.
- Store original file metadata and checksum.
- Implement parser dispatch by MIME type.
- Add quarantine state for unsafe or unsupported files.
- Add `ContextSetController`.

**Pipeline states:**

```text
uploaded -> scanned -> parsed -> chunked -> embedded -> available
uploaded -> quarantined
uploaded -> failed
```

**Tests:**

- Unsupported MIME returns 422.
- Oversized file returns 422 with clear message.
- Duplicate checksum reuses metadata or creates a new reference.
- Bad parse creates `failed` state and visible reason.
- Prompt-injection text in a file is treated as data, not tool instruction.

**Acceptance:**

- User can upload a file and see each ingestion stage.
- User can attach selected files to a chat run.
- Assistant answer shows which files/chunks were used.
- AVM ON/OFF benchmark can use the exact same context set.

### Module 4: AVM Run Bridge And Event Stream

**User value:** Users see the system working step by step.

**AVM role:** PHP core run events become normalized Laravel `talos_run_events`.

**UI surfaces:**

- `TalosRunTimeline.vue`
- `TalosNodeGraph.vue`
- `TalosNodeInspector.vue`

**Backend work:**

- Add `TalosRunController`.
- Add `RunEventNormalizer`.
- Add bridge service for core benchmark/run logs into `talos_run_events`.
- Add polling endpoint first; SSE/WebSocket can follow after stable event schema.

**Tests:**

- Events are ordered by sequence.
- Unknown event types render as generic events, not crashes.
- Malformed-but-validating JSON returns 422, not 500.
- Node status transition events appear in replay.

**Acceptance:**

- A run has timeline events visible in UI.
- Selecting a node opens inspector details.
- Policy decisions and validation faults are visible.
- A run with no events shows a controlled empty state.

### Module 5: Failure Policy And HMI Recovery

**User value:** A failed branch can be fixed without losing the whole run.

**AVM role:** Existing state machine rules become user-visible recovery controls.

**UI surfaces:**

- `TalosRecoveryPanel.vue`
- `TalosFaultExplainer.vue`
- Node inspector recovery actions

**Backend work:**

- Add `POST /api/talos/runs/{run}/recover`.
- Add request types:
  - `retry_node`
  - `retry_branch`
  - `edit_payload_and_retry`
  - `skip_node`
  - `mark_resolved`
- Map HMI actions to core transitions:
  - `FAILED -> RETRYING -> RUNNING`
  - `BLOCKED_BY_DEPENDENCY -> PENDING` when parents succeed

**Tests:**

- Linear graph A -> B -> C blocks B and C when A fails.
- Diamond graph blocks child when one parent fails.
- HMI retry of parent restores eligible children.
- Unauthorized user cannot recover a high-risk node.
- Recovery action is audit logged.

**Acceptance:**

- User can inspect why a branch is blocked.
- User can edit a safe payload and retry.
- UI shows which children were unblocked.
- Trace replay includes the recovery action.

### Module 6: Benchmark Workbench AVM ON/OFF

**User value:** TALOS proves its value against direct LLM usage.

**AVM role:** The benchmark workbench is the public proof layer.

**UI surfaces:**

- `TalosBenchmarkWorkbench.vue`
- `TalosBenchmarkLane.vue`
- `TalosMetricCard.vue`
- `TalosDiffViewer.vue`

**Backend work:**

- Persist benchmark groups and results.
- Use existing `BenchmarkComparisonService` as the first adapter.
- Store prompt hash, context hash, evaluator version, raw logs.
- Add export to JSON and Markdown.

**Required lanes:**

```text
AVM ON
AVM OFF Direct
Tool Agent baseline
```

The third lane may be hidden until a real tool-agent baseline exists. It must not be shown as real with fake numbers.

**Metrics:**

```text
task_completion
schema_validity
invalid_actions_proposed
invalid_actions_executed
policy_violations_blocked
recoverable_faults
source_coverage
trace_replayability
latency_ms
token_estimate
cost_estimate
```

**Tests:**

- Same prompt hash across lanes.
- Same context hash across lanes.
- Missing raw logs fails benchmark persistence.
- Threshold failure is visible and returns non-success status.
- UI renders degraded baseline state instead of fake lane.

**Acceptance:**

- User can run compare from `/chat` message or `/dashboard`.
- Report shows fair inputs.
- Report explains what AVM caught.
- Export includes raw references and summary metrics.

### Module 7: Trace Replay And Evidence Report

**User value:** Runs are explainable after the fact.

**AVM role:** Replay is the evidence layer for deterministic execution.

**UI surfaces:**

- `TalosTraceReplay.vue`
- `TalosEvidenceReport.vue`

**Backend work:**

- Harden `TraceReplayService`.
- Add persisted replay from `talos_run_events`.
- Add report generation service.

**Replay controls:**

```text
play
pause
step_forward
step_backward
speed_0_5x
speed_1x
speed_2x
show_faults_only
show_policy_only
show_worker_only
```

**Tests:**

- Replay rejects non-list events.
- Replay handles unknown node ids.
- Replay reconstructs final node states.
- Report export includes run id, model, prompt hash, context hash, event count.

**Acceptance:**

- User can replay a run without rerunning the model.
- User can filter faults and policy decisions.
- Exported report is understandable without UI access.

### Module 8: Tool Registry And Connectors

**User value:** TALOS can operate beyond chat: HTTP, files, databases, email, calendars, research, MCP, webhooks.

**AVM role:** Every tool is an AVM worker behind schema and policy.

**UI surfaces:**

- `TalosToolRegistry.vue`
- `TalosConnectorHealth.vue`
- `TalosToolSchemaViewer.vue`

**Backend work:**

- Add connector/tool migrations.
- Add `ConnectorRegistry`.
- Add `ToolRegistry`.
- Add capabilities and risk levels.
- Map enabled tools into system prompt/tool planning context.

**Initial tool classes:**

```text
HTTP_REQUEST
FILE_READ
FILE_WRITE
DOCUMENT_SEARCH
DATABASE_QUERY
EMAIL_DRAFT
CALENDAR_CREATE_DRAFT
TASK_CREATE
MEMORY_SEARCH
RESEARCH_SEARCH
MODEL_PROBE
WEBHOOK_CALL
```

**Tests:**

- Disabled connector tools are unavailable.
- Duplicate tool names are rejected.
- High-risk tool requires explicit capability.
- Tool output is untrusted context.
- SSRF/private network guard blocks resolved private hosts.

**Acceptance:**

- UI shows real connector health.
- Tool can be enabled/disabled.
- Worker execution logs policy decisions.
- LLM cannot call a tool not in registry.

### Module 9: Model Center And Provider Profiles

**User value:** Users can configure models without thinking about shell setup.

**AVM role:** Model capability determines whether a model can plan, validate, use tools, or benchmark reliably.

**UI surfaces:**

- `TalosModelCenter.vue`
- `TalosProviderProfileForm.vue`
- `TalosModelProbeLog.vue`

**Backend work:**

- Add encrypted provider profile storage.
- Add model probe service.
- Add compatibility classifier.

**Probe steps:**

```text
connectivity
simple_completion
structured_json
jmp_generation
tool_plan_stability
context_window_estimate
latency_sample
```

**Tests:**

- Bad endpoint gives actionable error.
- Timeout creates degraded status.
- Missing structured output marks model unsupported for AVM planning.
- Browser never receives decrypted provider key.

**Acceptance:**

- User can add provider profile.
- User can probe provider.
- Chat can select a healthy profile.
- Benchmark report records exact profile and model.

### Module 10: Memory And Skill Registry

**User value:** TALOS learns project preferences without turning memories into hidden prompt injection.

**AVM role:** Memories and skills become typed, scoped, inspectable context.

**UI surfaces:**

- `TalosMemoryManager.vue`
- `TalosSkillRegistry.vue`
- `TalosSkillAudit.vue`

**Backend work:**

- Add memory/skill migrations.
- Add retrieval service with scope controls.
- Add skill evaluation hook.
- Add "used memory" disclosure per run.

**Tests:**

- Untrusted memory cannot override system or policy rules.
- Disabled memory is not retrieved.
- Skill without allowed tools cannot invoke workers.
- Skill promotion requires benchmark/eval pass.

**Acceptance:**

- User can see, disable, edit, and delete memories.
- Assistant message shows memory used when relevant.
- Skill registry shows risk and allowed tools.
- Bad skill can be quarantined.

### Module 11: Deep Research

**User value:** TALOS can produce sourced reports, not just chat answers.

**AVM role:** Research is a DAG template with search, fetch, extract, verify, synthesize, cite.

**UI surfaces:**

- `TalosResearchWorkbench.vue`
- `TalosSourceTable.vue`
- `TalosClaimVerifier.vue`

**Backend work:**

- Add research run template.
- Add source extraction events.
- Add claim/source linkage artifacts.

**Required pipeline:**

```text
plan_queries
search_sources
fetch_sources
extract_claims
deduplicate_claims
verify_claims
synthesize_report
export_report
```

**Tests:**

- Claim cannot be marked verified without a source.
- Failed fetch blocks only dependent branch.
- Replay shows source sequence.
- Report export includes citations.

**Acceptance:**

- User can run research from chat or dashboard.
- Report has claim-source mapping.
- Conflicting sources are visible.
- AVM ON/OFF can compare claim drift.

### Module 12: Documents, Notes, Tasks, Calendar

**User value:** TALOS becomes a workspace, not only a demo.

**AVM role:** Productivity objects are artifacts or controlled tool targets.

**UI surfaces:**

- `TalosDocuments.vue`
- `TalosNotes.vue`
- `TalosTasks.vue`
- `TalosCalendar.vue`

**Backend work:**

- Add tables for documents, notes, tasks, calendar event drafts.
- Create run-linked artifact creation.
- Calendar writes require confirmation.

**Tests:**

- Task created from run stores source run id.
- Calendar event write requires explicit confirmation.
- Note content is untrusted context when retrieved.
- Document export preserves artifact metadata.

**Acceptance:**

- User can create a task from a run result.
- User can save a generated report as a document.
- User can attach notes as context with visible provenance.
- Calendar actions are drafts until approved.

### Module 13: Email Assistant

**User value:** TALOS can triage and draft email while staying safe.

**AVM role:** Email bodies are untrusted context. Sending is a high-risk worker requiring HMI confirmation.

**UI surfaces:**

- `TalosEmailConnector.vue`
- `TalosEmailTriage.vue`
- `TalosEmailDraftReview.vue`

**Backend work:**

- Add connector for email read.
- Add draft-only worker first.
- Add send worker only after HMI confirmation and audit.

**Tests:**

- AI cannot send email without explicit send action.
- Malicious email body cannot change tool policy.
- Connector failure appears as degraded state.
- Draft records referenced message ids.

**Acceptance:**

- Read-only email connector can be configured.
- TALOS can summarize selected messages.
- TALOS can draft reply.
- Send button is manual and audited.

### Module 14: Artifact Gallery And Media

**User value:** Outputs are easy to inspect, reuse, and export.

**AVM role:** Artifacts are tied to run provenance.

**UI surfaces:**

- `TalosArtifactGallery.vue`
- `TalosArtifactPreview.vue`
- `TalosImageArtifact.vue`

**Backend work:**

- Store artifacts from runs.
- Add artifact preview endpoint.
- Add download/export.

**Tests:**

- Artifact links to run id, prompt hash, model profile.
- Unsupported preview falls back to download.
- Missing provider disables generation controls.

**Acceptance:**

- User can open artifacts from chat, run, or dashboard.
- Artifact provenance is visible.
- Download works.
- No orphan artifact is shown as trusted output.

### Module 15: Admin, Security, Audit, Doctor, Backup

**User value:** TALOS is credible for enterprise evaluation.

**AVM role:** Security state becomes part of execution evidence.

**UI surfaces:**

- `TalosDoctorPanel.vue`
- `TalosAuditLog.vue`
- `TalosPolicyPanel.vue`
- `TalosBackupPanel.vue`

**Backend work:**

- Add capabilities and roles.
- Add scoped API tokens.
- Add audit events.
- Add doctor endpoint.
- Add backup manifest/export.
- Add restore validation.

**Doctor checks:**

```text
php_version
composer_install
core_tests_last_status
validator_health
validator_build_version
laravel_queue
database
storage_writable
provider_profiles
model_probe_status
file_ingestion_worker
benchmark_thresholds
ssl_verification
execution_policy
```

**Tests:**

- Non-admin cannot access admin endpoints.
- Token without scope cannot run worker.
- Doctor shows degraded validator.
- Backup manifest includes sessions, runs, files, artifacts, policies.
- Restore rejects incompatible schema version.

**Acceptance:**

- Admin can inspect health.
- Audit log shows policy denials and HMI overrides.
- Backup can be generated and validated.
- Security panel shows real policy state.

### Module 16: KADMOS CLI Parity

**User value:** Power users can operate TALOS from terminal with modern agent ergonomics.

**AVM role:** CLI exposes validation, DAG, benchmark, trace, recovery, and doctor primitives.

**Files:**

- `core/kadmos`
- `core/kadmos.cmd`
- `core/src/Cli/*`
- `core/tests/Cli*Test.php`

**Commands:**

```text
kadmos chat
kadmos doctor
kadmos validate <file>
kadmos run <scenario.json> --mode=avm-on
kadmos compare <scenario.json> --modes=avm-on,avm-off-direct,tool-agent
kadmos trace replay <run-id>
kadmos fault explain <run-id> --node=<node-id>
kadmos recover <run-id> --node=<node-id>
kadmos files ingest <path>
kadmos dashboard
```

**Shell slash commands:**

```text
/help
/mode ask|semi|auto|lab|enterprise
/read <path>
/search <pattern>
/validate <file>
/execute <file>
/compare <scenario>
/trace <run-id>
/fault <run-id> <node-id>
/doctor
/export
/exit
```

**Tests:**

- Boot animation starts once per first shell command and returns to shell.
- `--json` output is valid JSON.
- Missing validator fails closed in live mode.
- CLI can replay a trace fixture.
- CLI can compare one benchmark scenario.

**Acceptance:**

- Beginner can type `kadmos chat` and follow guided prompts.
- Expert can run commands directly.
- Every command has stable exit code.
- No live mode silently uses mock validation.

---

## 10. Implementation Phases

### Phase 0: Contracts And Design System Foundation

**Purpose:** Stop architecture drift before adding breadth.

**Files:**

- Modify: `control-plane/resources/js/app.js`
- Create: `control-plane/resources/js/lib/api.ts`
- Create: `control-plane/resources/js/lib/talosTypes.ts`
- Create: `control-plane/resources/js/lib/statusCopy.ts`
- Create: `control-plane/resources/js/lib/commandRegistry.ts`
- Create: shadcn-vue style UI primitives under `control-plane/resources/js/components/ui`
- Create: `control-plane/tests/Feature/TalosRouteContractTest.php`

**Work:**

- [ ] Lock `/chat` as clean route and `/dashboard` as cockpit route.
- [ ] Centralize API calls in `lib/api.ts`.
- [ ] Add shared TypeScript types for sessions, messages, runs, events, files, benchmarks.
- [ ] Add status copy/tone mapping.
- [ ] Add command registry.
- [ ] Expand UI primitive set without changing product behavior.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=Talos
npm run build
cd ..
git diff --check
```

### Phase 1: Persistent Chat Sessions

**Purpose:** Make `/chat` real and durable.

**Files:**

- Create migrations for `talos_sessions`, `talos_messages`.
- Create `control-plane/app/Models/TalosSession.php`.
- Create `control-plane/app/Models/TalosMessage.php`.
- Create `control-plane/app/Http/Controllers/TalosSessionController.php`.
- Create `control-plane/app/Http/Controllers/TalosMessageController.php`.
- Split `TalosChatPage.vue` into chat components.

**Work:**

- [ ] Add migrations and models.
- [ ] Add API endpoints.
- [ ] Move local message state into `useTalosSessions.ts` and `useTalosChat.ts`.
- [ ] Preserve current chat proxy behavior while storing messages.
- [ ] Add session sidebar with empty/loading/error states.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=TalosSession
php artisan test --filter=TalosMessage
npm run build
```

### Phase 2: Provider Profiles

**Purpose:** Remove raw browser key dependency from production flow.

**Files:**

- Create migration `talos_model_profiles`.
- Create `TalosModelProfile` model.
- Create `TalosModelProfileController`.
- Create `TalosModelProbeService`.
- Create `TalosModelCenter.vue`.

**Work:**

- [ ] Store encrypted provider profile secrets server-side.
- [ ] Add provider profile CRUD.
- [ ] Add model probe.
- [ ] Update chat to send `model_profile_id`.
- [ ] Keep local API key fallback explicitly marked as dev-only.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=TalosModelProfile
npm run build
```

### Phase 3: Context Vault

**Purpose:** Let users test real files safely.

**Files:**

- Create migrations for files, chunks, context sets.
- Extend `FileIngestionService`.
- Create `TalosContextVault.vue`.
- Create `TalosFileDropzone.vue`.
- Create `TalosSourceDrawer.vue`.

**Work:**

- [ ] Add file metadata persistence.
- [ ] Add staged ingestion states.
- [ ] Add context set selection.
- [ ] Add composer file chips.
- [ ] Add source provenance drawer.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=FileIngestion
npm run build
```

### Phase 4: AVM Run Bridge

**Purpose:** Make all execution visible through run events.

**Files:**

- Create migrations for `talos_runs`, `talos_run_events`, `talos_run_artifacts`.
- Create `RunEventNormalizer`.
- Create `TalosRunController`.
- Create `TalosRunTimeline.vue`.
- Create `TalosNodeInspector.vue`.

**Work:**

- [ ] Persist run shells from chat.
- [ ] Normalize core/benchmark events.
- [ ] Add run events endpoint.
- [ ] Render run timeline.
- [ ] Render node inspector.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=TalosRun
npm run build
```

### Phase 5: Recovery And Replay

**Purpose:** Turn faults into controlled HMI workflows.

**Files:**

- Extend `TraceReplayService`.
- Create `TalosRecoveryController`.
- Create `TalosTraceReplay.vue`.
- Create `TalosRecoveryPanel.vue`.
- Extend core tests around failure policy when needed.

**Work:**

- [ ] Replay persisted events.
- [ ] Add recovery request validation.
- [ ] Map recovery to core status transitions.
- [ ] Audit recovery actions.
- [ ] Show replay and recovery controls in UI.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=TraceReplay
php artisan test --filter=Recovery
cd ..\core
php kadmos test
```

### Phase 6: Benchmark Workbench

**Purpose:** Make AVM ON/OFF evidence the center of the product.

**Files:**

- Create benchmark migrations.
- Extend `BenchmarkComparisonService`.
- Create `TalosBenchmarkWorkbench.vue`.
- Create `TalosBenchmarkLane.vue`.
- Create `TalosMetricCard.vue`.
- Create benchmark export service.

**Work:**

- [ ] Persist benchmark groups and results.
- [ ] Store prompt/context hash for fairness.
- [ ] Render two or three lanes depending on real availability.
- [ ] Add report export.
- [ ] Add run-from-chat action.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=Benchmark
npm run build
cd ..\core
php kadmos test
```

### Phase 7: Tools And Connectors

**Purpose:** Expand capability breadth safely.

**Files:**

- Create connector/tool migrations.
- Create registry services.
- Create tool UI.
- Add worker adapters in `core/src/Workers` only where deterministic execution belongs.

**Work:**

- [ ] Define connector capability model.
- [ ] Register initial tools.
- [ ] Enforce tool policy before worker execution.
- [ ] Show connector health.
- [ ] Add policy denial trace events.

**Verification:**

```powershell
cd core
php tests\Security\ExecutionPolicyTest.php
php kadmos test
cd ..\control-plane
php artisan test --filter=Connector
npm run build
```

### Phase 8: Memory And Skills

**Purpose:** Add persistent intelligence without hidden prompt debt.

**Files:**

- Create memory/skill migrations.
- Create services and controllers.
- Create memory and skill UI.

**Work:**

- [ ] Add scoped memory retrieval.
- [ ] Add memory disclosure in run context.
- [ ] Add skill registry.
- [ ] Add skill eval and risk display.
- [ ] Prevent untrusted memory/skill from calling tools directly.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=Memory
php artisan test --filter=Skill
npm run build
```

### Phase 9: Research And Documents

**Purpose:** Deliver report-quality workflows with citations and artifacts.

**Files:**

- Create research services/controllers.
- Create document/artifact UI.
- Extend run artifact system.

**Work:**

- [ ] Add research run template.
- [ ] Add source table and claim verifier.
- [ ] Add document save/export.
- [ ] Link documents to source runs.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=Research
php artisan test --filter=Document
npm run build
```

### Phase 10: Productivity And Email

**Purpose:** Add Odysseus-level workspace breadth with enterprise safety.

**Files:**

- Create notes/tasks/calendar/email tables.
- Create connector controllers.
- Create UI modules.

**Work:**

- [ ] Add tasks from run conclusions.
- [ ] Add notes as context sources.
- [ ] Add calendar draft flow.
- [ ] Add email read and draft flow.
- [ ] Require manual confirmation for send/write operations.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=Task
php artisan test --filter=Calendar
php artisan test --filter=Email
npm run build
```

### Phase 11: Admin, Doctor, Backup, Audit

**Purpose:** Make TALOS enterprise-evaluable.

**Files:**

- Create audit/capability/policy/backups migrations.
- Create admin controllers.
- Create admin UI modules.

**Work:**

- [ ] Add capability checks.
- [ ] Add scoped API tokens.
- [ ] Add audit log.
- [ ] Add system doctor endpoint.
- [ ] Add backup manifest and restore validation.

**Verification:**

```powershell
cd control-plane
php artisan test --filter=Admin
php artisan test --filter=Audit
php artisan test --filter=Doctor
php artisan test --filter=Backup
npm run build
```

### Phase 12: KADMOS CLI Alignment

**Purpose:** Bring terminal UX to the same level as the web product.

**Files:**

- `core/kadmos`
- `core/kadmos.cmd`
- `core/src/Cli/*`
- `core/tests/Cli*Test.php`

**Work:**

- [ ] Add command registry parity with UI.
- [ ] Add guided shell tutorial.
- [ ] Add trace replay command.
- [ ] Add recovery command.
- [ ] Add benchmark compare command.
- [ ] Add stable JSON output.

**Verification:**

```powershell
cd core
php kadmos test
php kadmos doctor --json
php kadmos benchmark compare --help
```

### Phase 13: Browser E2E And Performance Hardening

**Purpose:** Prove the whole user journey.

**Files:**

- Add Playwright config under `control-plane`.
- Add E2E tests under `control-plane/tests/e2e`.
- Add performance budget docs.

**Work:**

- [ ] Add first-run E2E: provider -> chat -> run -> replay.
- [ ] Add file E2E: upload -> context -> chat -> citation.
- [ ] Add benchmark E2E: run compare -> export.
- [ ] Add accessibility pass.
- [ ] Add responsive viewport checks.

**Verification:**

```powershell
cd control-plane
npm run build
npm run e2e
php artisan test
```

---

## 11. Testing Strategy

### 11.1 Core PHP

Use for deterministic behavior:

- DAG scheduling.
- Failure propagation.
- Recovery transitions.
- Worker policy.
- Benchmark scoring.
- CLI output.

Required command:

```powershell
cd core
php kadmos test
```

### 11.2 Validator Node

Use for protocol validity:

- Zod payloads.
- JMP mutations.
- Node schemas.
- Fastify validation routes.
- Compatibility redirects.

Required command:

```powershell
cd validator
npm test
npm run build
```

### 11.3 Laravel Control Plane

Use for product state:

- API validation.
- Persistence.
- auth/capability.
- file ingestion.
- trace replay.
- benchmark persistence.
- admin/doctor/backup.

Required command:

```powershell
cd control-plane
php artisan test
```

### 11.4 Vue UI

Use for user-critical behavior:

- build integrity.
- command registry.
- route rendering.
- composer behavior.
- error states.
- replay and benchmark rendering.

Required initial command:

```powershell
cd control-plane
npm run build
```

Add Vitest when composables/components become stable:

```text
control-plane/tests/js/commandRegistry.test.ts
control-plane/tests/js/useTalosApi.test.ts
control-plane/tests/js/TalosComposer.test.ts
control-plane/tests/js/TalosBenchmarkWorkbench.test.ts
```

### 11.5 E2E

Introduce Playwright when persistent sessions and run events exist.

Required flows:

- first-run guided chat.
- file ingestion and cited answer.
- run timeline and replay.
- AVM ON/OFF compare.
- admin doctor degraded state.

---

## 12. Subagent Work Packages

Use subagents only after Phase 0 contracts are written, because file ownership must be stable.

### Package A: UI Foundation

**Owns:**

- `control-plane/resources/js/lib/*`
- `control-plane/resources/js/components/ui/*`
- shell layout components.

**Avoids:**

- core PHP logic.
- validator schemas.
- Laravel migrations except route tests.

### Package B: Sessions And Chat API

**Owns:**

- session/message migrations.
- Laravel models/controllers.
- chat composables integration.

**Avoids:**

- benchmark scoring.
- file parsers.
- UI visual redesign outside chat components.

### Package C: Context Vault

**Owns:**

- file/context migrations.
- file ingestion service.
- Context Vault UI.
- file tests.

**Avoids:**

- provider profile secrets.
- benchmark internals except context hash contract.

### Package D: Run Events And Replay

**Owns:**

- run/event/artifact migrations.
- normalizer services.
- replay UI.
- recovery API.

**Avoids:**

- visual restyling of unrelated dashboard areas.

### Package E: Benchmark Evidence

**Owns:**

- benchmark persistence.
- compare workbench.
- metric definitions.
- export reports.

**Avoids:**

- chat session internals except trigger integration.

### Package F: Security And Enterprise

**Owns:**

- capabilities.
- policy UI.
- audit log.
- doctor.
- backup.
- token scopes.

**Avoids:**

- feature UI polish outside security surfaces.

---

## 13. Odysseus Gap Improvements TALOS Must Beat

### 13.1 Prompt Injection

Odysseus threat model calls prompt injection across files, notes, pages, skills, and memory. TALOS answer:

- all external content is untrusted.
- content cannot invoke tools directly.
- tool invocation requires JMP validation and policy.
- UI shows which source influenced the answer.
- memory/skill usage is disclosed.

### 13.2 Local Tool Safety

Odysseus exposes powerful local/workspace tools. TALOS answer:

- no arbitrary shell by default.
- each tool has schema, risk, capability, policy, audit.
- high-risk actions require HMI confirmation.
- private network SSRF blocked after hostname resolution.

### 13.3 Integration Reliability

Odysseus roadmap calls out integration audit. TALOS answer:

- connectors have health probes.
- disabled/degraded state visible.
- no fake available connector.
- doctor summarizes system readiness.

### 13.4 UI Complexity

Odysseus has large CSS/window/modal complexity. TALOS answer:

- clean `/chat` route.
- cockpit `/dashboard` with predictable rails and inspector.
- shadcn-vue primitives owned in repo.
- no nested cards as page structure.
- command palette rather than hidden modal sprawl.

### 13.5 Benchmark Evidence

Odysseus has broad features but does not center deterministic proof. TALOS answer:

- every major demo can run AVM ON/OFF.
- raw logs are stored.
- replay is first-class.
- invalid actions and policy blocks are visible.

---

## 14. First Three Implementation Slices

These are the next practical slices after this plan.

### Slice 1: UI/API Contract Foundation

- Build `lib/api.ts`.
- Build `talosTypes.ts`.
- Build `commandRegistry.ts`.
- Split chat components without changing behavior.
- Add route contract tests.

**Why first:** it reduces UI chaos and gives subagents stable contracts.

### Slice 2: Persistent Sessions

- Add session/message migrations.
- Add session/message APIs.
- Wire `/chat` to persisted state.
- Keep `/dashboard` cockpit separate.

**Why second:** users need a real product loop before more panels.

### Slice 3: Run Events And Evidence Chips

- Create run shell from message.
- Persist normalized events.
- Add compact proof chips to chat.
- Add basic run timeline in dashboard.

**Why third:** this makes AVM visible without waiting for every Odysseus feature.

---

## 15. Final Acceptance Checklist

TALOS is ready for serious evaluation when all of these are true:

- [ ] `/chat` is clean, persistent, and production-backed.
- [ ] `/dashboard` is a real cockpit, not a fixture dashboard.
- [ ] Users can upload their own files and use them in a run.
- [ ] Every run has events, status, artifacts, and replay state.
- [ ] Failure policy and HMI recovery are visible and tested.
- [ ] AVM ON/OFF benchmark uses same prompt, model, context, evaluator, and logs.
- [ ] Provider secrets are server-side.
- [ ] Tools are registered, permissioned, policy-checked, and audited.
- [ ] Memory and skills are scoped, inspectable, and disableable.
- [ ] Research reports include source evidence.
- [ ] Email/calendar write actions require manual confirmation.
- [ ] Artifacts have provenance.
- [ ] Doctor reports true system readiness.
- [ ] Backup and restore validation exist.
- [ ] KADMOS CLI can validate, run, compare, replay, recover, and export.
- [ ] Core tests pass.
- [ ] Validator tests pass.
- [ ] Laravel tests pass.
- [ ] Frontend build passes.
- [ ] Browser E2E covers first-run, file, replay, and benchmark flows.
- [ ] `git diff --check` passes.

---

## 16. Self-Review

**Feature coverage:** The plan covers chat, sessions, command UX, files, context, AVM runs, recovery, replay, benchmark, tools, connectors, model center, memory, skills, research, documents, notes, tasks, calendar, email, artifacts, admin, doctor, backup, audit, and KADMOS CLI.

**Boundary check:** Core remains PHP and framework-free. Validator remains stateless. Laravel owns product state. Vue owns UI. KADMOS CLI remains the terminal surface.

**No fake feature rule:** Every module specifies backend, persistence, tests, and acceptance criteria. Features without real backend must be hidden or marked dev-only.

**Immediate implementation path:** Start with Phase 0, then Phase 1, then Phase 4 run events. This sequence fixes the current user-visible dissatisfaction without creating throwaway UI.
