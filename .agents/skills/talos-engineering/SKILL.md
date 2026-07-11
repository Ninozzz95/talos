---
name: talos-engineering
description: Use when Codex works on AVM, KADMOS, TALOS, the PHP core, Node validator, Laravel control-plane, Vue UI, benchmarks, trace replay, execution policy, file ingestion, agent tooling, or project architecture in this repository.
---

# TALOS Engineering

## Core Principle

Build AVM as a deterministic, inspectable execution system. Chat and UI are product surfaces; the real value is typed planning, validation, DAG execution, failure isolation, benchmark evidence, and replay.

## Required Boundaries

- Core PHP remains framework-free. It owns DAG execution, node state, workers, benchmark semantics, CLI primitives, and evidence rendering.
- Validator Node.js remains stateless. It owns Zod/JMP validation and compatibility telemetry only.
- Laravel control-plane owns product state: sessions, messages, files, runs, trace events, users, APIs, reports, queues, and UI delivery.
- TALOS UI must call real Laravel/control-plane APIs or clearly label demo data.
- Kadmos CLI must remain beginner-usable while keeping expert commands.

## Before Any Change

1. Identify the owner: `core`, `validator`, `control-plane`, `TALOS UI`, `docs`, `benchmarks`, or `security`.
2. Read the smallest relevant files and tests.
3. For behavior changes, write or update the failing test first.
4. Keep the edit inside the owner boundary unless the task explicitly crosses layers.
5. Do not commit. Never commit on behalf of the user.

## No fake feature rule

Every user-visible feature must be backed by real behavior or clearly labeled as demo/mock.

- Chat must call a real chat endpoint.
- Benchmark panels must call benchmark APIs or show a controlled unavailable state. Do not show hardcoded AVM win percentages in production components.
- File ingestion must upload/index or be hidden/disabled with a clear reason. Do not show fake indexed file lists or fake context coverage.
- Trace/replay UI must consume real trace events or explain that none exist. Do not render static execution timelines as if they are live.
- Connector/tool UI must show real capability, health, or setup state.
- Buttons without real handlers must not appear as active controls. Represent future actions through the command registry as disabled commands with `disabledReason`.
- Browser-stored provider keys are development-only fallback. Production model calls should use server-side `talos_model_profiles`; the browser sends `model_profile_id`, not raw provider secrets.

## TALOS UI Rules

- `/chat` is the dedicated low-noise chat surface.
- `/dashboard` is the control-plane/cockpit surface.
- Do not put cockpit noise into `/chat`.
- `/chat` now has persistent sessions/messages through Laravel APIs. Do not regress it to local-only message state.
- `/chat` now loads server-side model profiles and should prefer `model_profile_id`. Keep the raw API-key path visibly marked dev-only.
- `/chat` now loads Context Vault sets and can send `context_set_id`. Uploaded content must be injected server-side as bounded, untrusted grounding data.
- `/chat` must persist and render `used_context` source provenance when server-side grounding data is used. Do not expose storage paths or full extracted content in chat disclosures.
- `/dashboard` must not contain a second local chat/composer, browser API-key path, or locally parsed "DAG from chat" surface. The cockpit links to `/chat` for persistent chat.
- `/dashboard` now mounts `TalosModelCenter.vue` for real provider-profile CRUD/probe operations. Do not replace it with static provider cards.
- `/dashboard` now mounts `TalosContextVault.vue` for real uploads, file status, chunk inspection, and context-set creation. Do not show fake indexed files or fake coverage metrics.
- `/dashboard` now mounts `TalosRunTimeline.vue`, `TalosNodeGraph.vue`, and `TalosNodeInspector.vue` backed by `/api/talos/runs`. Do not reintroduce static run timelines.
- `/dashboard` now mounts `TalosTraceReplay.vue` and `TalosRecoveryPanel.vue` inside the run timeline. These panels must call `/api/talos/runs/{run}/replay` and `/api/talos/runs/{run}/recover`; do not move them into `/chat`.
- `/dashboard` now mounts `TalosBenchmarkWorkbench.vue` backed by `/api/benchmarks/compare` and `/api/talos/benchmark-groups`. Do not reintroduce "benchmark unavailable" placeholders where persisted groups/results can be loaded.
- `/dashboard` now mounts `TalosToolRegistry.vue` backed by `/api/talos/connectors`, `/api/talos/tools`, and `/api/talos/tools/planning-context`. Do not hardcode tool cards, connector health, or fake online states.
- `/dashboard` now mounts `TalosMemoryManager.vue`, `TalosSkillRegistry.vue`, and `TalosSkillAudit.vue` backed by `/api/talos/memories` and `/api/talos/skills`. Do not mount these cockpit panels in `/chat`.
- `/dashboard` now mounts `TalosResearchWorkbench.vue`, `TalosDocuments.vue`, and `TalosArtifactGallery.vue` backed by `/api/talos/research-reports`, `/api/talos/documents`, and `/api/talos/artifacts`. Do not mount these cockpit panels in `/chat`.
- `/dashboard` now mounts `TalosNotes.vue`, `TalosTasks.vue`, `TalosCalendar.vue`, and `TalosEmailTriage.vue` backed by productivity/email APIs. Do not mount these cockpit panels in `/chat`.
- `/dashboard` now mounts `TalosDoctorPanel.vue`, `TalosAuditLog.vue`, `TalosPolicyPanel.vue`, and `TalosBackupPanel.vue` backed by `/api/talos/admin/*`. Do not mount admin cockpit panels in `/chat`.
- Model Lab now includes Cookbook V1 backed by `/api/talos/cookbook/*`. Cookbook V1 may scan, score, show runtime readiness, and preview commands, but must not install dependencies, download models, serve models, or execute host commands.
- Google Workspace UI is server-side only: Vue may show connected account metadata, Drive file metadata, Calendar sync state, and gated publish controls, but must never receive access tokens, refresh tokens, encrypted tokens, or provider OAuth secrets.
- Google Drive imports must pass through Laravel ingestion, mark content as untrusted, and preserve provider/file provenance. Do not inject Drive content directly into chat from the browser.
- Google Calendar external writes stay disabled unless backend scope, explicit HMI confirmation, validation, connector policy, and audit events all pass.
- `TalosWorkspace.vue` should remain an orchestrator. Keep header, mobile rail, chat surface, composer dock, and floating window layer in focused components instead of re-growing the workspace monolith.
- Use compact enterprise UI patterns; avoid toy dashboards and decorative-only visuals.
- Prefer shadcn-vue style primitives with owned Vue components.
- A visual must clarify state, evidence, execution, or user action.
- Theme presets are product behavior, not decorative skins. Keep preset IDs centralized in `resources/js/lib/talosThemes.ts`, normalize legacy `dark/light`, persist through `/api/talos/settings`, and make presets change palette, typography, radius, density, and motion tokens.
- Theme import is a fail-closed boundary. Validate the raw versioned envelope and every nested key/value before any permissive sanitizer; sanitizers are for legacy reads, not for accepting imported data.
- Validate theme contrast against rendered surfaces, including window chrome and transparent/outline button parent backgrounds. Advanced area variables must remain scoped to their owned surface and every persisted token must be consumed by production UI.
- Treat `motion off`, background motion off, procedural background off, and OS reduced motion as separate tested contracts. Animation code uses semantic intents and transform/opacity only; recurring canvas work caches geometry/palette outside the frame loop.
- A theme slice is not complete until all presets pass forced light/dark desktop/mobile checks, persistence/reload, 320px reachability, and a headless visual matrix. Keep generated Playwright evidence out of source control.
- Theme edit forms may display preset fallback values, but persistence and live workspace preview must emit only the delta from the active preset. Never turn display defaults into color overrides when a user changes an unrelated field such as font.
- Optimistic theme/motion controls must roll back to the last server-backed snapshot on a failed PATCH. Browser gates must verify switch state, persisted payload, canvas telemetry, changing frame pixels, and reload behavior together.
- `Reset customization` is narrow; `Reset to preset` is destructive across area, mode, motion, animation, and layout overrides. Keep the commands and confirmation copy distinct.
- Settings Center must map Odysseus-like categories to TALOS-owned behavior: model profiles, context sets, connectors/tools, email/tasks, reminders, appearance, account, agent tools, doctor/backup/audit. If a category has no endpoint, store only safe non-secret preferences or open a real module; do not show active controls for missing backend actions.
- TALOS settings preferences must never store provider secrets, registry/admin tokens, passwords, OAuth material, or API keys. Keys that look secret-like must be stripped on both client and server, but legitimate budget fields such as `max_tokens` are not secrets.
- Floating tool windows must stay reachable above the fixed composer on mobile and desktop. Large panels must scroll internally rather than extending behind the composer.
- Dashboard sidebars must not contain fake session history, fake benchmark scores, fake validator-online badges, or fake file indexing status.
- A command palette entry is acceptable before a backend exists only when it is disabled and names the missing dependency.

## KADMOS CLI Rules

- `core/kadmos` help must come from `Kadmos\Cli\CommandRegistry`; do not reintroduce separate hardcoded help lists.
- Beginner flow starts with the boot animation and leaves the user in a usable shell after the first default `kadmos` command.
- Expert commands must expose real handlers or fail closed with structured JSON; do not print fake success for backend-dependent trace, fault, recovery, ingestion, or export actions.
- JSON mode is an API contract: stable `schema_version`, command name, explicit error code, and stable exit code.
- `trace replay <trace.json>` can replay local fixtures; persisted run replay must call the TALOS control-plane and fail closed when unavailable.
- `files ingest <path> --dry-run` may hash and inspect the real file locally, but non-dry-run ingestion must call the control-plane and never pretend upload success.
- `export benchmark <benchmark-group-id>` must call `/api/talos/benchmark-groups/{id}/export`, require the `talos_benchmark_export` v1 schema with `export_status=complete`, and fail closed on invalid 2xx responses.
- Non-dry-run `files ingest` must require a control-plane response whose `data.status` is `available`; failed ingestion is not a successful CLI upload.
- Guided and chat REPL modes are `ask`, `semi`, `auto`, `lab`, and `enterprise`. Guarded modes auto-allow only safe read/search operations; dangerous operations still prompt unless `auto` is explicitly selected.
- `doctor --json` can return `ok=false` while still being a successful diagnostic command. Treat missing provider credentials as degraded readiness, not a CLI crash.

## Browser E2E Rules

- Playwright lives under `control-plane/tests/e2e` and must use deterministic test-only API mocks unless a real local service is explicitly part of the test.
- E2E mocks must be strict: unhandled TALOS API routes should fail the test instead of returning silent empty data.
- E2E must never require live provider keys, live external model calls, or private network access.
- Start Laravel E2E with the repo-local `.tools` PHP binary; global PHP may be incompatible with Composer platform requirements.
- On Windows, avoid `php artisan serve` as a long-running Playwright web server: Laravel's ServeCommand can crash while parsing built-in server output. Use repo-local PHP with `php -S 127.0.0.1:<port> -t public tests/e2e/php-router.php` or an equivalent stable router.
- Playwright must wait for both Laravel and Vite. Use the real Vite app entry (`resources/js/app.js`) as the Vite readiness URL so tests do not start before TALOS modules are transformed.
- When direct Playwright reuse targets Laravel without `public/hot`, run a fresh production build after the latest UI edit; otherwise the browser may validate an older bundle. Prefer `npm run test:e2e`, which builds before Playwright.
- Browser tests should prove user-visible flows: `/chat`, `/dashboard`, command palette, persisted-turn UI, file-context source provenance, replay fault filtering, benchmark compare/export, degraded readiness, responsive overflow, and screenshot evidence.
- Generated Playwright reports and `test-results` are artifacts, not source.

## Browser Command Contracts

- Bare HTTP/HTTPS input may be normalized into server-owned `navigate` plus `snapshot` commands; model output never supplies run or session authority.
- An unambiguous screenshot-only prompt must execute as a server-owned `screenshot` command and return persisted evidence without asking the model to decide whether the permitted capture is allowed. Keep the matcher narrow so capability questions, negations, and compound tasks still go through normal planning.
- A short affirmative may confirm a screenshot only when the immediately preceding conversational turn is an explicit screenshot offer. Never reuse a stale offer across an intervening user turn.
- PHP must encode empty `snapshot` and `screenshot` arguments as JSON objects (`{}`), not lists (`[]`), before calling the Node validator.
- Snapshot observations returned to the planner must include the server-owned `evidence_hash` required by a later `read` command.
- Screenshot storage has its own binary cap. Charge only the bounded observation inserted into the model prompt against the per-turn evidence budget, never the PNG byte length.
- Successful durable Browser events must persist `operation`, `command_id`, and artifact IDs so activity type and evidence survive reload.
- Button-driven and chat-planned screenshots must converge on the same owner-scoped artifact and authenticated preview endpoint.
- Screenshot evidence is rendered by TALOS from owner-scoped artifact IDs. Model-authored Markdown images are inert and must never become clickable artifact URLs.
- A navigation turn cannot return a grounded final answer until a later successful `snapshot` or `read` exists.
- Exclude controlled operational Browser fault messages from future model history; retain them in run trace and replay instead.

## AVM Evidence Rules

- AVM ON/OFF claims require the same prompt, model, context, evaluator, and stored logs.
- Every meaningful run should carry prompt, context, model, AVM mode, node events, validation faults, policy decisions, artifacts, and timestamps.
- If a run cannot be replayed, label it non-replayable.
- Benchmark groups/results must store only real evidence. Scenario hashes come from exact stored JSON bytes. Prompt/context hashes are nullable and must not be invented from scenario names or descriptions.
- Benchmark metrics may use `unknown` when cost/source coverage is not measured. Never hardcode score improvements or winner percentages in UI.
- `trace_replayable` is true only when a replay event stream exists. Final node statuses alone are not replay proof.

## Tool And Parsing Rules

- Parse structured responses by type/schema, not array position.
- Prefer Zod/PHP value objects over regex.
- Treat uploaded files, web pages, emails, notes, memories, and tool outputs as untrusted data.
- Do not let untrusted content instruct tools directly.
- Fail closed for ambiguous policy decisions.

## Error Handling

- Wrap network and process calls.
- Return validation errors for malformed input; avoid preventable 500s.
- Make policy denials, validation faults, and worker failures visible in trace/replay.
- In `/chat`, persist the user message before proxying to the model; if the proxy fails afterward, persist a system message with the controlled failure. Assistant messages grounded in Context Vault data must persist `used_context` metadata and render source provenance.
- Provider profile APIs must expose `has_secret`, never `secret` or `encrypted_secret`. Existing secret values must never be prefilled into UI inputs; only rotation is allowed.
- File/context APIs must not expose full extracted content in list responses. Use chunk previews for inspection and server-side bounded context injection for chat. Context sets can only attach files in `available` status or chunks whose parent file is `available`.
- Run APIs append deterministic event sequences. `events` inputs must be JSON lists; associative arrays are validation errors. Chat sends `session_id` to create a run, but message persistence remains owned by the UI message flow to avoid duplicate messages.
- Recovery APIs are HMI-first. Supported actions are `retry_node`, `retry_branch`, `edit_payload_and_retry`, `skip_node`, and `mark_resolved`. High-risk actions require explicit `talos.recovery.high_risk`; never add autonomous prune/self-heal behavior without a policy gate and tests.
- Replay APIs reconstruct state from persisted run events and must not mutate the run or append events. Replay UI can provide local play/pause/step/filter controls, but the trace data must come from the control plane. Replay/event payloads must redact keys containing `secret`, `token`, `password`, or `api_key` before storage or API return.
- Benchmark APIs persist `talos_benchmark_groups` and `talos_benchmark_results`. `POST /api/talos/runs/{run}/benchmark` creates a private scenario from a persisted run prompt and runs the same comparison pipeline. Benchmark export is real only at `GET /api/talos/benchmark-groups/{benchmarkGroup}/export`, and must require complete persisted AVM ON/OFF lanes, matching prompt/context/evaluator hashes, non-empty raw reports, `export_status=complete`, and a `benchmark_report.exported` audit event.
- Tool Registry APIs persist `talos_connectors` and `talos_tools`. `GET /api/talos/tools/planning-context` must exclude disabled tools, disabled connectors, and non-healthy connectors. `/api/talos/chat` sends this filtered context to the validator; validator `/chat` forwards it to the PHP core. Do not trust browser-side filtering for tool availability.
- Registry write routes require `TALOS_REGISTRY_WRITE_TOKEN`. Do not add unauthenticated create/update/delete routes for connectors or tools.
- Registry filtering must be enforced. Validator `/validate` supports `allowed_node_types`, and PHP core chat rejects unlisted `SPAWN_NODE` types before execution.
- Tool Registry UI is read/inspect first. Do not expose probe, enable, disable, run-tool, or export controls until a real backend endpoint, capability gate, and tests exist.
- Core `ExecutionPolicy` must resolve hostnames before allowing HTTP requests, block localhost/private/metadata IPs by default, cap timeouts, return structured audit metadata, and fail closed when DNS resolution is empty or invalid. `HttpRequestWorker` must pin vetted DNS results and fail closed on primary-IP mismatch.
- Provider model `base_url` values must pass public URL policy before storage, probe, chat forwarding, or direct core client use. Never send provider bearer tokens to private/local/custom endpoints unless an explicit allowlist and tests exist.
- Memory APIs persist `talos_memories`; retrieval must exclude disabled, rejected, and quarantined memories, respect scope, and mark memory as untrusted. Chat must not inject memory unless a request explicitly provides memory scope, and must return `used_memories` disclosure when memory is used.
- Skill APIs persist `talos_skills`; planning context includes only enabled, approved, eval-passed skills. Skill write/evaluation routes require `TALOS_REGISTRY_WRITE_TOKEN`; imported skills cannot modify policy or capabilities.
- Research APIs persist `talos_research_reports`, sources, claims, and claim-source mappings. A verified claim must reference at least one source, failed sources block only dependent claims, and research creation must emit persisted run events plus a `research_report` run artifact. Manual dashboard research input must start as `planned` sources and `pending` claims unless a real fetch/verification process produced evidence; draft pipeline steps must be marked `SKIPPED`, not successful.
- Document APIs persist `talos_documents`; list responses expose previews while export responses include full content and run/artifact provenance.
- Artifact APIs read `talos_run_artifacts`; previews must use persisted TALOS data only and fall back to download for unsupported artifact types. Never dereference arbitrary artifact URIs from the browser or server without a separate allowlist and tests.
- Productivity APIs persist `talos_notes`, `talos_tasks`, and `talos_calendar_drafts`. Notes are untrusted context, tasks preserve `run_id` provenance, and calendar creates are draft-only until an audited confirmation/write flow exists.
- Email APIs persist `talos_email_messages` and `talos_email_drafts`. Email bodies are untrusted context, connector status defaults to degraded/read-only/send-disabled when unconfigured, and `POST /api/talos/email/drafts/{draft}/send` must remain `EMAIL_SEND_DISABLED` until HMI confirmation, capability checks, audit events, and a real connector policy exist.
- Admin APIs persist `talos_api_tokens` and require `X-Talos-Api-Token` with the exact scope. Missing, invalid, expired, disabled, or under-scoped tokens fail closed with controlled 403 JSON. `talos.admin.all` grants all admin scopes.
- Audit APIs persist `talos_audit_events`; payloads must redact keys containing secret, token, password, or api_key before storage. Provider profile changes, file uploads, HMI recovery, registry write denials, calendar confirmation, and email send denials must write audit rows.
- Doctor APIs report real readiness only. `TALOS_VALIDATOR_HEALTH_URL` controls validator health; missing config is degraded, not healthy.
- Backup APIs expose a manifest and restore validation only. Restore validation is dry-run only, rejects incompatible schema versions and incomplete domain manifests, and must not perform destructive restore until a separate capability, audit event, and rollback policy exist.

## Verification

Run verification before claiming completion:

- Load `.tools\env.ps1` before PHP verification on this Windows workspace. Direct `php` may resolve to PHP 8.3 and fail Composer platform checks.
- Laravel tests that write to the `local` disk should use an isolated storage root instead of `Storage::fake('local')` when Windows filesystem artifacts are involved. Stale `storage/framework/testing/disks/local` directories can become unreadable and poison unrelated tests.
- Core PHP: relevant `core/tests/*.php`; wider core tests if shared behavior changed.
- Validator: `npm test` and `npm run build` in `validator`.
- Laravel/backend: `php artisan test` in `control-plane`.
- TALOS UI: `npm run build` in `control-plane`, plus route checks when a server is running.
- Cross-cutting: `git diff --check`.

Report failures plainly. Do not say work is complete without fresh evidence.

## Reference

For the full extraction and adaptation rationale, read:

```text
docs/architecture/talos-agent-operating-model.md
```
