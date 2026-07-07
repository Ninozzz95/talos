# Odysseus To TALOS Feature Gap Audit

Date: 2026-07-07

Purpose: use Odysseus as a competitor benchmark for TALOS without copying its AGPL code or assets. The output of this document is a product and architecture map: every relevant Odysseus capability is translated into a TALOS/AVM-native version with stronger evidence, replay, benchmark, security, and enterprise behavior.

## Sources Reviewed

- Official Odysseus repository: https://github.com/pewdiepie-archdaemon/odysseus
- Official landing page: https://pewdiepie-archdaemon.github.io/odysseus/
- Official roadmap: https://github.com/pewdiepie-archdaemon/odysseus/blob/dev/ROADMAP.md
- Official threat model: https://github.com/pewdiepie-archdaemon/odysseus/blob/dev/THREAT_MODEL.md
- Local read-only analysis clone: `C:\Users\ninox\AppData\Local\Temp\2\odysseus-analysis-20260707190824`
- Current TALOS control plane files:
  - `control-plane/resources/js/components/TalosShell.vue`
  - `control-plane/resources/css/app.css`
  - `control-plane/routes/web.php`
  - `control-plane/routes/api.php`
- Current AVM core and benchmark files:
  - `core/src/ASTOrchestrator.php`
  - `core/src/Benchmark/`
  - `core/tests/benchmarks/`
  - `core/src/Security/`
  - `validator/src/server.ts`

## Executive Finding

Odysseus is strong because it feels like a complete personal AI operating system: chat, agents, files, memory, skills, model management, research, compare, documents, email, tasks, calendar, gallery, settings, theming, backup, and admin tools all sit in one self-hosted workspace.

TALOS should not compete by copying the surface area blindly. TALOS can win by making the workspace deterministic, inspectable, replayable, and benchmarked. Odysseus exposes many tools; TALOS must expose tool execution as a typed AVM graph with proof:

```text
User task or uploaded files
  -> model proposes a typed action plan
  -> validator accepts/rejects JMP
  -> AVM builds/schedules DAG nodes
  -> workers execute bounded actions
  -> failures are isolated and recoverable
  -> AVM ON/OFF benchmark shows the difference
  -> trace replay proves what happened
```

The "wow" factor for non-technical users should not be decoration. It should be a visible guarantee:

- "I can see why the AI did this."
- "I can see which file or source supports this answer."
- "I can replay the run."
- "I can compare the same task with AVM off."
- "I can fix a failed step without losing the whole session."

## Legal And Product Boundary

Odysseus is AGPL-3.0-or-later. TALOS must not copy Odysseus source code, CSS, assets, SVGs, markup, or implementation structure. We can use it as a competitive reference and recreate feature concepts using our own architecture, design system, code, copy, and data model.

The implementation target is not "Odysseus inside TALOS". The target is:

```text
Odysseus feature coverage
+ AVM deterministic execution
+ enterprise policy
+ benchmark evidence
+ replayable traces
+ Vue/shadcn-vue component system
+ Laravel control-plane persistence
```

## Current Odysseus Shape

Local clone inspection found:

- 1276 tracked files.
- FastAPI backend with many routers registered in `app.py`.
- Large single-page frontend centered around `static/index.html`, `static/style.css`, and many `static/js/*` modules.
- Approximately 150+ frontend JS modules under `static/js`.
- A broad test suite with hundreds of tests.
- Router domains include auth, upload, emoji, sessions, admin wipe, memory, skills, chat, research, history, search, presets, diagnostics, cleanup, personal documents, embedding, model discovery, copilot, ChatGPT subscription, TTS, STT, documents, signatures, gallery, editor drafts, tasks, assistant, calendar, shell, cookbook, workspace, hardware fit, compare, preferences, backup, fonts, MCP, webhooks, API tokens, notes, email, Codex, Claude, vault, contacts, and companion.

This is a wide workspace, but Odysseus itself declares important gaps in its roadmap:

- Fresh install smoke tests across OSes.
- Integration audit for what actually works.
- Cookbook reliability across machines, GPUs, drivers, shells, Python environments.
- SGLang support across platforms.
- Better model ranking by hardware fit.
- Better cookbook error feedback and copyable logs.
- Agent prompt and context bloat.
- Prompt-injection audit for skills, notes, documents, fetched pages, and memories.
- Better degraded-state reporting.
- Email performance audit.
- Provider probing audit.
- CSS cleanup.
- Tour helper cleanup.
- Modal/window positioning cleanup.
- Accessibility, empty states, fresh install hints, first-run tours.
- Security hardening around admin-only tools.

Those gaps are TALOS opportunities.

## Current TALOS Shape

TALOS today is much narrower:

- A Laravel/Vite/Vue shell under `control-plane`.
- A single `TalosShell.vue` surface with chat, context, evidence, and sessions tabs.
- Basic design tokens in `control-plane/resources/css/app.css`.
- Some local UI primitives in `control-plane/resources/js/components/ui`.
- AVM core in PHP with DAG/state concepts and benchmark files.
- Node validator as stateless Fastify/Zod service.
- Trace replay and fault explainer API work has started.

The current weakness is not the lack of one more visual panel. The weakness is that TALOS does not yet have a complete, persistent product loop:

```text
new session -> ingest files -> ask -> plan -> execute graph -> inspect nodes
-> recover faults -> compare AVM on/off -> save/export report -> reopen/replay
```

Every imported Odysseus-inspired feature must plug into that loop.

## Target TALOS Information Architecture

TALOS should become one unified route, not scattered dashboards:

```text
/dashboard
  App shell
    Left rail
      New run
      Chat
      Files
      Runs
      Benchmarks
      Tools
      Settings
    Session sidebar
      Recent sessions
      Uploaded context
      Saved benchmark packs
      Filters by status
    Main workspace
      Chat thread
      Composer
      Live execution stream
    Right inspector
      Selected node
      Context provenance
      Validation faults
      Recovery controls
      Benchmark evidence
    Bottom/overlay tool windows
      Compare
      Deep Research
      Documents
      Memory
      Models
      Logs
```

Odysseus uses many modals and tool windows. TALOS should use a stricter workspace model:

- One primary chat/execution surface always visible.
- Tool windows are docked, pinnable, minimizable, and resumable.
- The inspector is always the explanation layer.
- The DAG trace is always tied to the current message/run.
- The route stays `/dashboard`; internal panels are URL-query or hash state, not separate disconnected pages.

## UI Design Direction

TALOS should feel like an enterprise execution cockpit, not a toy chatbot and not a decorative landing page.

Visual direction:

- Dense but calm.
- Strong hierarchy.
- No full-page marketing hero.
- Chat stays central.
- Evidence and graph state stay visible.
- Color is functional: success, warning, failed, blocked, validation, retrying.
- Motion explains state transitions, not decoration.
- Every empty/error/loading state tells the user what to do next.

Design system:

- Keep Vue.
- Adopt `shadcn-vue` as the component source model, not a black-box dependency.
- Use copied/owned components where useful: Button, Dialog, Sheet, Tabs, DropdownMenu, Tooltip, Command, ScrollArea, Resizable, Badge, Input, Textarea, Select, Switch, Table, Toast, Progress, Separator.
- Keep `lucide-vue` for icons.
- Use Tailwind 4 tokens already present in the Laravel app.
- Add AVM-specific components rather than generic dashboard cards.

Reasoning:

- `shadcn-vue` is built as copyable components on top of Reka UI and Tailwind, so TALOS can own the source and tune it for enterprise controls.
- This avoids locking TALOS into a heavy vendor component library.
- This matches the user's request to use shadcn as the Vue UI base while preserving full control over the product identity.

## Feature Matrix

### 1. Chat Workspace

Odysseus capability:

- Multi-turn chat.
- Session list.
- New chat.
- Rename/copy/export chat.
- Prompt presets.
- Model selector.
- Attach files.
- RAG/workspace toggles.
- Agent/chat mode toggle.
- TTS mode and voice controls.

Odysseus gaps:

- Agent context can become too large for smaller local models.
- The user sees many toggles but not always why a toggle changes execution quality.
- Chat output is not primarily a deterministic trace.
- Export is useful, but not enough as execution proof.

TALOS better version:

- Chat is the top-level control surface.
- Every assistant answer can expand into "Plan", "Validated actions", "DAG run", "Evidence", "Benchmark", and "Replay".
- Prompt presets become "Run templates" with typed expected outputs and benchmark thresholds.
- Model selector includes policy labels: local, cloud, approved, experimental, blocked.
- Composer supports normal language, slash commands, file drops, and guided onboarding.
- Agent/chat toggle becomes "Answer only" vs "Verified execution".

Required UI:

- `TalosShell.vue` decomposed into:
  - `TalosAppShell.vue`
  - `TalosSessionSidebar.vue`
  - `TalosChatThread.vue`
  - `TalosComposer.vue`
  - `TalosRunInspector.vue`
  - `TalosToolDock.vue`
- Composer chips for files, tools, model, AVM mode, benchmark mode.
- Message-level actions: copy, export, replay, compare, inspect nodes.

Required backend:

- `talos_sessions`
- `talos_messages`
- `talos_runs`
- `talos_run_events`
- `talos_run_artifacts`
- API endpoints:
  - `POST /api/talos/sessions`
  - `GET /api/talos/sessions`
  - `GET /api/talos/sessions/{session}`
  - `POST /api/talos/sessions/{session}/messages`
  - `POST /api/talos/runs/{run}/replay`
  - `GET /api/talos/runs/{run}/events`

Tests:

- Feature test: session creation persists.
- Feature test: message creates run shell.
- Vue test: chat is always visible on `/dashboard`.
- E2E test: user can create a session, submit a prompt, see streamed run events.

### 2. Slash Commands And Guided UX

Odysseus capability:

- Slash command autocomplete.
- Keyboard shortcuts.
- Search and quick actions.
- Tour hints.
- Composer recall.

Odysseus gaps:

- Tours and hints are declared as needing cleanup.
- Beginner onboarding and expert shortcuts can collide.
- Command behavior can be discoverable only if the user already understands shells.

TALOS better version:

- Beginner mode is default: guided command palette, natural labels, safe defaults.
- Expert mode exposes slash commands and keyboard shortcuts.
- The command palette uses the same action registry as the UI buttons.
- Every command has:
  - label
  - description
  - required capability
  - risk level
  - API action
  - telemetry category
  - undo/recovery behavior if possible

Initial commands:

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
/docs
/research
/settings
/doctor
```

Required UI:

- `TalosCommandPalette.vue`
- `TalosOnboardingChecklist.vue`
- `TalosGuidedAction.vue`
- `TalosShortcutHelp.vue`

Tests:

- Command registry has no duplicate IDs.
- Every visible toolbar action has a command equivalent.
- Palette filters by user role/capability.
- Beginner mode hides destructive commands unless explicitly unlocked.

### 3. Agent Mode And Tool Execution

Odysseus capability:

- Agent mode can use shell, files, web, memory, skills, MCP, and model tools.
- Admin users have privileged local tools.
- Non-admin users are restricted.

Odysseus gaps:

- Threat model acknowledges no shell/filesystem sandbox.
- Prompt injection remains a high-priority audit area.
- Token scopes are coarse.
- Agent context bloat affects smaller models.

TALOS better version:

- Tools are not direct magic. Tools are AVM workers behind typed nodes.
- Every tool call is:
  - validated by JMP/Zod
  - scheduled by AVM
  - checked by execution policy
  - logged as an event
  - replayable if deterministic
  - blocked or downgraded if policy fails
- No arbitrary shell in enterprise default mode.
- File/network/email/calendar/model actions are separate capabilities.
- Prompt-injected tool requests must pass a policy boundary and show provenance.

Required workers:

- `HttpRequestWorker`
- `FileReadWorker`
- `FileWriteWorker`
- `DocumentSearchWorker`
- `EmailDraftWorker`
- `CalendarEventWorker`
- `TaskCreateWorker`
- `MemorySearchWorker`
- `ResearchSearchWorker`
- `ModelProbeWorker`

Required UI:

- Tool permissions panel.
- "Why blocked?" explanation.
- Node inspector with policy decision.
- Safe retry controls.

Tests:

- Prompt-injected instruction inside uploaded file cannot invoke admin tool.
- Non-admin cannot run privileged worker.
- Private network/localhost SSRF is blocked after DNS resolution.
- Every failed policy decision appears in trace replay.

### 4. File Uploads, Documents, RAG, And Context Vault

Odysseus capability:

- File upload.
- Personal documents.
- RAG toggle.
- Document library/editor.
- Markdown, HTML, CSV, syntax highlighting.
- Attachments in chat.

Odysseus gaps:

- Integration reliability needs audit.
- Untrusted uploaded data is a prompt-injection surface.
- Users need better feedback on indexing/degraded state.

TALOS better version:

- Files enter a "Context Vault" with explicit states:
  - uploaded
  - scanned
  - parsed
  - chunked
  - embedded
  - available
  - quarantined
  - failed
- Every answer shows source provenance.
- Context can be selected per-run.
- Enterprise policies define file type, size, retention, and allowed extraction methods.
- AVM OFF comparison uses the exact same files and prompt so differences are fair.

Required UI:

- Context Vault panel.
- File cards with parsing state and source count.
- Upload dropzone inside composer.
- "Used in answer" citations drawer.
- Quarantine/error state.

Required backend:

- `talos_files`
- `talos_file_chunks`
- `talos_context_sets`
- `talos_run_context_sources`
- API:
  - `POST /api/talos/files`
  - `GET /api/talos/files`
  - `POST /api/talos/context-sets`
  - `POST /api/talos/runs/{run}/context`

Tests:

- Unsupported file type rejected.
- Oversized file rejected.
- Malformed text file produces friendly parse error.
- Source provenance required when answer claims file-derived fact.

### 5. Memory And Skills

Odysseus capability:

- Persistent memory.
- Skills management.
- Import skills.
- Skill audit/auto-fix concepts.
- Memory categories, search, bulk actions.

Odysseus gaps:

- User-editable skills and memories are prompt-injection surfaces.
- Skill quality can drift.
- Context bloat can harm local models.

TALOS better version:

- Memory is split into:
  - user preferences
  - project facts
  - learned procedures
  - enterprise policy notes
  - rejected/untrusted memories
- Skills are not just text. A TALOS skill has:
  - typed trigger
  - required input contract
  - allowed tools
  - expected output shape
  - benchmark pack
  - risk level
  - review status
- Skills must pass AVM validation and a small eval before promotion.

Required UI:

- Memory manager.
- Skill registry.
- Skill audit result.
- "Used memory" disclosure per response.
- One-click disable for a memory or skill used in a bad answer.

Tests:

- Untrusted memory cannot override system/developer policy.
- Skill without allowed tools cannot invoke workers.
- Skill promotion requires passing benchmark.
- Memory retrieval respects session/project scope.

### 6. Deep Research

Odysseus capability:

- Multi-step research.
- Source search and reading.
- Report generation.
- Research jobs/panel.
- Model presets requested by roadmap.

Odysseus gaps:

- Needs hardware-specific model presets.
- Needs better degraded state reporting.
- Research quality depends on source handling and model context.

TALOS better version:

- Deep Research is an AVM run template:
  - plan queries
  - search
  - fetch sources
  - extract claims
  - deduplicate evidence
  - synthesize report
  - verify citations
  - compare AVM off
- Every claim in final report maps to a source event.
- Research can pause if sources conflict.
- Research jobs are resumable and replayable.

Required UI:

- Research tool window.
- Query plan timeline.
- Source table with trust/provenance.
- Claim verifier drawer.
- Report export.

Tests:

- Report cannot mark claim verified without source.
- Failed fetch blocks only dependent branch.
- Replay reconstructs source sequence.
- AVM ON/OFF report shows claim drift.

### 7. Model Compare

Odysseus capability:

- Side-by-side model compare.
- Blind evaluation.
- Parallel/sequential modes.
- Votes and scoreboard.
- Synthesis.

Odysseus gaps:

- Good user-facing feature, but not inherently tied to deterministic execution.
- Comparison can become subjective if evaluator criteria are vague.

TALOS better version:

- Compare has two modes:
  - human preference compare
  - AVM contract compare
- Contract compare evaluates:
  - schema validity
  - tool-call validity
  - task completion
  - trace completeness
  - hallucinated action count
  - recoverability
  - token and latency cost
  - deterministic replay score
- AVM ON/OFF is first-class, not a secondary metric.

Required UI:

- Compare workbench.
- Three lanes by default:
  - AVM ON
  - AVM OFF Direct
  - Agent baseline
- Scorecards for each lane.
- Diff viewer for outputs and traces.

Tests:

- Same prompt/context/model configuration is used across lanes.
- AVM OFF cannot access hidden extra context.
- Results store raw logs and summary metrics.
- Threshold failures fail CI benchmark tests.

### 8. Cookbook, Model Management, And Hardware Fit

Odysseus capability:

- Hardware-aware model recommendations.
- Downloads.
- Serving workflows.
- Model provider setup/probing.
- Local model backends.

Odysseus gaps:

- Cookbook reliability is explicitly high priority.
- Platform variance is hard.
- Error logs and next steps need improvement.
- Model ranking needs better scoring.

TALOS better version:

- Model setup is a guided provider lab:
  - detect installed runtimes
  - probe endpoints
  - run tiny health prompt
  - run structured-output prompt
  - run tool-call/JMP prompt
  - classify model as supported/degraded/unsupported
- Hardware fit is shown as practical capability:
  - chat only
  - RAG small
  - tool planning
  - deep research
  - benchmark reliable
- Every model gets a compatibility profile.

Required UI:

- Model center.
- Provider cards.
- Probe logs.
- Compatibility badges.
- "Use this for AVM benchmark" action.

Tests:

- Provider probe handles timeout.
- Bad endpoint gives actionable error.
- Model missing structured-output ability is marked degraded.
- Probe result is cached with expiration.

### 9. Email Assistant

Odysseus capability:

- IMAP/SMTP.
- Triage.
- Tags.
- Summaries.
- Reminders.
- Reply drafts.

Odysseus gaps:

- Email performance audit is called out.
- Email is a high-risk prompt-injection source.
- Multi-account state/caching can be tricky.

TALOS better version:

- Email is an enterprise tool connector, not enabled by default.
- Read-only mode first.
- Draft-only mode before send.
- Send requires explicit HMI confirmation.
- Email content is always untrusted context.
- Every suggested reply shows source messages and policy warnings.

Required UI:

- Email connector setup.
- Inbox triage panel.
- Draft review modal.
- "Why this reply?" source drawer.

Tests:

- AI cannot send email without explicit send action.
- Malicious email body cannot alter tool permissions.
- IMAP failure appears as degraded connector, not broken dashboard.
- Draft generation logs referenced message IDs.

### 10. Notes, Tasks, Calendar, Reminders

Odysseus capability:

- Notes.
- Todos.
- Scheduled agent tasks.
- CalDAV sync.
- Reminders.

Odysseus gaps:

- Notes/todos need better AI integration.
- Scheduler visibility/defaults need improvement.
- Calendar is privileged user data.

TALOS better version:

- Productivity features become contextual evidence and action targets.
- Tasks can be generated from AVM run conclusions.
- Calendar writes require confirmation.
- Notes can be linked to runs and sources.
- Scheduled agent tasks run through AVM policies.

Required UI:

- Tasks panel.
- Calendar connector.
- Notes panel.
- "Create task from run" action.
- Scheduled run list.

Tests:

- Task created from run contains source run ID.
- Calendar write requires permission.
- Scheduled task logs an AVM trace.
- Failed scheduled action is visible in dashboard.

### 11. Gallery And Image Editor

Odysseus capability:

- Gallery.
- Image editor.
- Inpaint/background/remove tools.
- Media management.

Odysseus gaps:

- Mobile/editor polish is roadmap work.
- Model setup for image tools can be unclear.
- This is broad and can distract from AVM's core proof.

TALOS better version:

- Treat image features as an optional tool pack.
- Initial focus:
  - attach image to chat
  - inspect image metadata
  - generate image if provider configured
  - store outputs as run artifacts
- Full editor comes later, after core chat/execution is credible.

Required UI:

- Artifact gallery.
- Image preview drawer.
- Artifact download/export.
- Optional editor route/window after core.

Tests:

- Generated image artifact links to prompt/run/model.
- Missing image provider shows setup action.
- Unsupported image operation is disabled by capability.

### 12. Themes, Appearance, Accessibility, Shortcuts

Odysseus capability:

- Theme editor.
- Custom colors, fonts, density, effects.
- Keyboard shortcuts.
- Accessibility helper.
- Mobile route icons/favicons.

Odysseus gaps:

- Roadmap asks for accessibility pass.
- CSS cleanup needed.
- Too many theme options can distract from product value.

TALOS better version:

- Enterprise theme system:
  - light/dark
  - density: comfortable/compact
  - reduced motion
  - high contrast
  - brand accent
  - code/data theme
- No decorative effects by default.
- Shortcuts documented in command palette.
- Accessibility is a test gate, not polish.

Required UI:

- Appearance settings.
- Shortcut command palette.
- Responsive sidebar behavior.
- Focus trap for dialogs/sheets.

Tests:

- Keyboard navigation reaches chat, composer, rail, inspector.
- Reduced motion disables nonessential animations.
- Text remains readable at mobile widths.
- Color contrast checked for semantic states.

### 13. Auth, Users, Admin, Tokens, Security

Odysseus capability:

- Auth.
- 2FA.
- Admin/non-admin capability split.
- API tokens.
- Webhooks.
- Vault.
- Security headers.

Odysseus gaps:

- Coarse token scopes.
- Known SSRF and sandbox gaps in threat model.
- Admin console framing is acceptable for self-hosted but not enough for enterprise.

TALOS better version:

- Enterprise capability model:
  - view chat
  - run AVM
  - upload files
  - use network worker
  - use filesystem worker
  - use email read
  - use email send
  - manage models
  - manage users
  - manage policies
  - export reports
- Tokens are scoped and expiring.
- Worker policies are explicit.
- Every policy denial is user-visible and trace-visible.
- Provider keys are server-side only.

Required UI:

- Admin security panel.
- Role editor.
- Token manager.
- Policy event log.

Tests:

- Non-admin cannot access privileged endpoints.
- Expired token rejected.
- Token without scope cannot run worker.
- Security headers present.

### 14. Backup, Restore, Diagnostics, Ready State

Odysseus capability:

- Backup routes.
- Diagnostics routes.
- Health/ready/runtime.
- Client performance endpoint.

Odysseus gaps:

- Backup/restore guide and helper flow need work.
- Degraded-state reporting needs work.

TALOS better version:

- System Doctor is part of TALOS, not hidden.
- Show:
  - core PHP version
  - validator health
  - Laravel queue health
  - database health
  - provider probes
  - model probes
  - file indexer health
  - benchmark threshold status
- Backup/restore has dry run and manifest.

Required UI:

- Doctor panel.
- Readiness checklist.
- Export backup.
- Restore validation.

Tests:

- Degraded validator appears in UI.
- Backup manifest includes expected domains.
- Restore rejects incompatible schema version.

### 15. MCP, Webhooks, Codex/Claude/Companion Integrations

Odysseus capability:

- MCP routes.
- Webhooks.
- Codex routes.
- Claude routes.
- Companion/mobile token flow.

Odysseus gaps:

- Tool scopes and admin boundaries need care.
- Integrations need audit.

TALOS better version:

- Integrations are registered as connectors with:
  - capability map
  - risk level
  - health probe
  - policy requirements
  - audit event stream
- MCP tools become AVM workers, not unrestricted direct calls.
- Codex/Claude-style coding agents become benchmark baselines or external executors through controlled bridges.

Required UI:

- Connectors panel.
- Connector health list.
- Tool schema viewer.
- Audit stream.

Tests:

- Connector cannot register duplicate tool names.
- Disabled connector tool is unavailable to LLM plan.
- Webhook signature validation required.
- MCP tool output is untrusted context.

## TALOS Differentiators To Add To Every Feature

Every Odysseus-inspired feature should gain these TALOS-specific guarantees.

### Typed Action Layer

All model actions must become typed JMP mutations or typed worker requests before they can affect state.

Non-negotiable:

- No raw model text mutates application state.
- No raw model text invokes a worker.
- No uploaded/user/external content is treated as trusted instruction.

### AVM Trace

Every meaningful task gets:

- `run_id`
- nodes
- dependencies
- statuses
- validation events
- worker events
- policy decisions
- artifacts
- summary

### AVM ON/OFF Benchmark

Every demo-worthy flow must support:

- AVM ON
- AVM OFF Direct
- Agent baseline when available

Metrics:

- task completion
- contract validity
- hallucinated actions
- policy violations caught
- recoverable faults
- latency
- token usage
- cost
- replayability
- source coverage

### Failure Policy And Recovery

Every tool-run feature uses:

- `PENDING`
- `VALIDATED`
- `RUNNING`
- `SUCCESS`
- `FAILED`
- `BLOCKED_BY_DEPENDENCY`
- `RETRYING`
- `SKIPPED`
- `PRUNED`

User-facing recovery:

- explain fault
- edit payload
- retry node
- retry branch
- skip branch when policy permits
- export report

### Enterprise Controls

Every connector/tool feature needs:

- role/capability check
- execution policy
- audit log
- redaction policy
- retention policy
- error state
- test coverage

## Unified Data Model Proposal

Initial Laravel tables:

```text
talos_sessions
  id
  user_id
  title
  mode
  created_at
  updated_at

talos_messages
  id
  session_id
  role
  content
  model_id
  metadata_json
  created_at

talos_files
  id
  user_id
  original_name
  mime_type
  size_bytes
  status
  storage_path
  checksum
  metadata_json
  created_at

talos_context_sets
  id
  session_id
  name
  created_at

talos_context_sources
  id
  context_set_id
  file_id
  selector_json

talos_runs
  id
  session_id
  message_id
  mode
  status
  model_id
  benchmark_group_id
  started_at
  finished_at

talos_run_events
  id
  run_id
  sequence
  event_type
  node_id
  severity
  payload_json
  created_at

talos_run_artifacts
  id
  run_id
  artifact_type
  label
  storage_path
  metadata_json
  created_at

talos_benchmark_groups
  id
  session_id
  prompt_hash
  context_hash
  created_at

talos_benchmark_results
  id
  benchmark_group_id
  mode
  score_json
  log_path
  created_at
```

## Frontend Architecture Proposal

Create a clear Vue structure:

```text
control-plane/resources/js/
  app.js
  components/
    talos/
      TalosAppShell.vue
      TalosLeftRail.vue
      TalosSessionSidebar.vue
      TalosChatThread.vue
      TalosMessage.vue
      TalosComposer.vue
      TalosInspector.vue
      TalosExecutionTimeline.vue
      TalosNodeGraph.vue
      TalosBenchmarkCompare.vue
      TalosContextVault.vue
      TalosToolDock.vue
      TalosCommandPalette.vue
      TalosOnboarding.vue
      TalosSettingsPanel.vue
    ui/
      button/
      badge/
      dialog/
      sheet/
      tabs/
      tooltip/
      dropdown-menu/
      command/
      scroll-area/
      resizable/
  composables/
    useTalosSessions.ts
    useTalosChat.ts
    useTalosRuns.ts
    useTalosFiles.ts
    useTalosCommandRegistry.ts
    useTalosToolWindows.ts
    useTalosBenchmarkCompare.ts
    useTalosTheme.ts
  lib/
    api.ts
    talosTypes.ts
    statusTone.ts
```

State rules:

- Session state belongs in composables.
- API clients belong in `lib/api.ts`.
- UI-only open/close state belongs in the component or `useTalosToolWindows`.
- No hard-coded benchmark data in production components after Phase 1.
- Demo fixtures live in a named fixture module and are visibly labeled.

## Implementation Phases

### Phase 0: Design System And Shell Stabilization

Goal: stop adding more UI to one large file.

Deliverables:

- Add shadcn-vue-compatible component setup.
- Split `TalosShell.vue`.
- Preserve chat as primary surface.
- Add command registry.
- Add dock/inspector layout.
- No backend behavior change yet.

Tests:

- Vue build passes.
- Laravel feature test confirms `/dashboard` loads TALOS.
- Static test confirms chat thread/composer are present.
- Accessibility smoke test for focusable command palette.

### Phase 1: Persistent Sessions And Messages

Goal: real chat sessions instead of static fixture UI.

Deliverables:

- Laravel migrations/models/controllers for sessions and messages.
- API client in Vue.
- Session sidebar loads data.
- New chat works.
- Message submission creates a pending run shell.

Tests:

- API feature tests.
- Vue unit tests for empty/loading/error states.
- Browser smoke test for create session -> send message.

### Phase 2: Context Vault

Goal: users can ingest files and see their status.

Deliverables:

- Upload API.
- File metadata persistence.
- Safe parser pipeline placeholder.
- Context source selection.
- Composer file chips.

Tests:

- File validation tests.
- Upload UI tests.
- Security tests for bad file type/size.

### Phase 3: AVM Run Timeline And Inspector

Goal: every run becomes visible execution.

Deliverables:

- Stream or poll run events.
- Timeline component.
- Node inspector.
- Validation fault display.
- Recovery action placeholders wired to policy checks.

Tests:

- Trace event API tests.
- Replay endpoint tests.
- UI test selecting a node shows details.

### Phase 4: Benchmark Compare Workbench

Goal: visible AVM ON/OFF evidence.

Deliverables:

- Create benchmark group from one prompt/context.
- Run AVM ON and AVM OFF.
- Render three-lane comparison.
- Store raw logs and score summary.
- Export benchmark report.

Tests:

- Same input hash across lanes.
- Threshold tests.
- UI diff rendering tests.

### Phase 5: Tools And Connectors

Goal: Odysseus-like tool breadth, but through AVM policies.

Deliverables:

- Connector registry.
- Tool registry.
- Model center.
- Deep research as run template.
- Document library as artifact/context surface.
- Notes/tasks as run-linked objects.

Tests:

- Connector capability tests.
- Policy denial tests.
- Degraded connector UI tests.

### Phase 6: Memory And Skill Registry

Goal: persistent learning without prompt-injection debt.

Deliverables:

- Memory tables and UI.
- Skill registry.
- Skill audit/eval hook.
- "Used memory" disclosure.
- Disable memory/skill action.

Tests:

- Prompt-injection memory tests.
- Skill permission tests.
- Scope retrieval tests.

### Phase 7: Enterprise Admin, Security, Backup, Doctor

Goal: make TALOS credible for serious usage.

Deliverables:

- Role/capability UI.
- Token scopes.
- Audit log.
- System doctor.
- Backup manifest/export.
- Restore validation.

Tests:

- Authz tests.
- Token scope tests.
- Doctor degraded-state tests.
- Backup/restore tests.

### Phase 8: Advanced Productivity And Media

Goal: feature parity where it supports AVM value.

Deliverables:

- Email read/draft connector.
- Calendar/task connector.
- Gallery artifacts.
- Optional image generation artifacts.
- Optional editor after artifact system is stable.

Tests:

- Email send confirmation tests.
- Calendar write permission tests.
- Artifact provenance tests.

## Definition Of Done For "100% Functional"

A feature is not complete when it appears in the sidebar. It is complete only when all of this is true:

- User can discover it without documentation.
- User can run it with safe defaults.
- It has empty/loading/error/degraded states.
- It has API persistence where persistence matters.
- It is connected to chat or an AVM run.
- It has role/capability checks if it touches data or tools.
- It logs trace events.
- It can be replayed or clearly marked non-replayable.
- It can participate in AVM ON/OFF comparison when relevant.
- It has backend tests.
- It has frontend tests or browser smoke coverage.
- It works on desktop and mobile widths.
- It has keyboard focus behavior.
- It has no fake production data unless labeled as demo.

## Immediate Next Build Slice

The next slice should not be email, gallery, or a huge Odysseus clone. The next slice should make TALOS feel real from the first minute:

1. Split the TALOS shell into focused Vue components.
2. Add shadcn-vue component foundation.
3. Keep chat always visible as the primary surface.
4. Add command palette and guided onboarding.
5. Add persistent sessions/messages.
6. Add a run timeline fed by existing trace/fault APIs.
7. Add benchmark compare as the first "wow" panel.

Why this order:

- It fixes the current UI dissatisfaction without building throwaway screens.
- It gives non-technical users a guided path.
- It gives technical users slash commands and inspector depth.
- It makes AVM value visible before we add low-priority tool breadth.
- It creates stable component boundaries for sub-agents.

## Sub-Agent Work Packages

These packages can run mostly in parallel after the shell split contract is accepted.

### Package A: UI Shell And Design System

Owns:

- shadcn-vue setup
- UI primitives
- shell decomposition
- responsive layout
- command palette
- visual consistency

Must not touch:

- core PHP scheduling
- benchmark scoring rules
- validator schemas

### Package B: Laravel TALOS API

Owns:

- migrations
- models
- controllers
- API tests
- session/message/run persistence

Must not touch:

- Vue visual styling except API integration contracts
- core PHP algorithm internals

### Package C: AVM Trace Bridge

Owns:

- mapping core trace logs to control-plane run events
- replay compatibility
- event ordering
- failure/fault normalization

Must not touch:

- UI layout beyond event payload shape

### Package D: Benchmark Compare

Owns:

- AVM ON/OFF compare API
- benchmark group persistence
- score contract
- report export
- threshold tests

Must not touch:

- general chat session UX except compare trigger

### Package E: Security And Policy

Owns:

- capability model
- token scopes
- worker policy integration
- SSRF/private network tests
- prompt-injection tests

Must not touch:

- non-security UI polish

## Risks

### Scope Explosion

Odysseus has many features. Trying to implement all of them at once would create a large, partially fake dashboard. TALOS must build in vertical slices with real data and tests.

### Fake Wow

Animations and panels can impress for five seconds, but they will not sell the technology. The durable wow is "the AI made a mistake and TALOS caught it, blocked the bad branch, and proved the safer output."

### Backend Mismatch

TALOS must not push application logic into the Node validator. Node remains stateless validation. Laravel owns product state. PHP core owns AVM execution.

### Security Debt

Odysseus-style local tools are powerful and risky. TALOS enterprise defaults must be safer than personal self-hosted defaults:

- no arbitrary shell by default
- no network access without policy
- no email send without explicit confirmation
- no hidden provider keys in browser
- no untrusted content as instruction

### UI Debt

If `TalosShell.vue` keeps growing, the project will recreate Odysseus' own CSS/positioning debt. Split early.

## Success Metrics

Product metrics:

- A new user can complete first guided run in under 3 minutes.
- A non-technical user can explain what AVM did after watching one run.
- A technical user can inspect the exact node/payload/fault behind an answer.
- A user can upload files and see which files supported the answer.
- A user can run AVM ON/OFF and understand the difference.

Engineering metrics:

- `php artisan test` passes.
- `npm run build` passes.
- Validator tests pass.
- Core PHPUnit passes.
- Benchmark thresholds pass.
- `git diff --check` passes.
- E2E smoke covers `/dashboard`.
- No production component uses unlabeled mock data.

## Final Product Target

TALOS should eventually cover the same broad workspace categories as Odysseus:

- chat
- agents
- files
- memory
- skills
- research
- compare
- models
- documents
- email
- notes
- tasks
- calendar
- gallery/artifacts
- themes
- shortcuts
- settings
- auth/admin
- diagnostics
- backup
- integrations

But TALOS must make each one AVM-native:

```text
Odysseus: "The AI can use this tool."
TALOS:    "The AI can propose this tool, the validator can prove the shape,
           AVM can schedule it, policy can allow or block it, the user can
           inspect it, benchmarks can compare it, and the trace can replay it."
```

That is the realistic route to a technology that feels different from normal LLM chat instead of merely larger.
