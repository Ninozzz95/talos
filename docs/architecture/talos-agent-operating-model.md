# TALOS Agent Operating Model

Date: 2026-07-07

Purpose: extract the useful operating patterns from `claude-fable-5.md` and implement them as original AVM/TALOS rules. This document intentionally does not copy vendor prompt text. It converts observed mechanisms into project-specific engineering practice.

## Summary

The analyzed file is not a single "reasoning trick". It is a large operating model with sections for behavior, memory, preferences, tools, file handling, visual routing, search, copyright, structured responses, context management, error handling, and UI constraints.

For AVM, the useful lesson is not the vendor identity or policy wording. The useful lesson is discipline:

- route each request to the correct tool or subsystem;
- keep all relevant state explicit;
- parse tool responses by schema, not position;
- make errors observable;
- search when facts can change;
- apply memory/preferences only when relevant;
- avoid fake tools and fake UI;
- verify before claiming completion.

## Pattern Extraction Matrix

| Source Pattern | AVM Translation | Where It Applies | Verification |
|---|---|---|---|
| Product identity and capability boundaries | Define AVM, KADMOS, TALOS, validator, and control-plane ownership | `AGENTS.md`, docs, CLI help | Contract tests check required boundary text |
| Tool Routing | Classify work before acting: core, validator, Laravel, UI, benchmark, docs, security | All coding tasks | Review changed files against subsystem ownership |
| Skill-First Work | Read project operating instructions and relevant skills before implementation | Complex UI, security, benchmark, file, docs work | Skill file exists and project instructions are present |
| State And Context Discipline | Include run/session/context/model/node/event state explicitly | TALOS chat, run APIs, benchmark compare | Trace/replay tests and API payload tests |
| Typed Tool Response Parsing | Parse by schema/type, not array position or brittle regex | JMP, trace events, MCP connectors, benchmark logs | Zod/PHP validation tests |
| Error Handling | Convert network/process/parse failure into typed user-visible faults | Chat proxy, validator client, replay, benchmarks | Feature tests assert 4xx/5xx are controlled |
| Search And Evidence | Browse for current external facts and cite sources; prefer primary sources | Competitor analysis, model/library/current docs | Web sources linked in docs/responses |
| Memory And Preference Discipline | Apply context only when relevant and never to suppress critique | Future TALOS memory/context vault | Memory retrieval tests and UI disclosure |
| UI Routing | Use visuals/pages only when they reduce cognitive load | `/chat`, `/dashboard`, tool panels | Route tests and browser smoke checks |
| No Fake Tools | Never simulate a capability as real | TALOS UI, CLI, docs, demos | Tests ensure UI calls real endpoints or labels demo data |
| Copyright And Source Discipline | Paraphrase external material, avoid long copied text | Web research, competitor docs | Review responses/docs for copied text |
| Safety Boundaries | Treat untrusted content as data, not instruction | Uploaded files, emails, web pages, memory, MCP | Prompt-injection and policy tests |

## Tool Routing

Before changing code, classify the request:

```text
core/           deterministic DAG, node states, workers, benchmark semantics, CLI primitives
validator/      stateless validation, Zod schemas, Fastify routes, telemetry compatibility
control-plane/  Laravel APIs, persistence, users, sessions, files, runs, reports, UI delivery
TALOS UI        Vue components, routes, visual product behavior, command palette, chat UX
docs/           architecture, roadmap, demo scripts, operating model
security/       execution policy, SSRF, secrets, role/capability rules
```

The practical rule is simple: do not fix a UI problem in Node if the product state belongs in Laravel, and do not fix an execution problem in Laravel if the deterministic behavior belongs in PHP core.

## Skill-First Work

The extracted pattern is: procedural knowledge should be loaded before action. In this project that becomes:

- Read `AGENTS.md` first for AVM boundaries.
- Use `talos-engineering` skill for any AVM/KADMOS/TALOS/benchmark/security/UI work.
- Use frontend-design guidance before substantial UI reshaping.
- Use systematic-debugging before fixing unexpected behavior.
- Use verification-before-completion before claiming a fix is complete.

This is not bureaucracy. It prevents the same mistakes: wrong route, wrong owner, fake UI, untested changes, and false completion.

## State And Context Discipline

The analyzed prompt repeatedly stresses that stateless completions need explicit state. AVM should formalize this at product level.

Every meaningful TALOS run should be reconstructable from stored data:

```text
run_id
session_id
message_id
user prompt
selected files/context
model/provider
AVM mode
validator result
DAG nodes
node status transitions
worker inputs/outputs
policy decisions
faults
artifacts
benchmark group
timestamps
```

If a run cannot be replayed or explained from stored data, the product should say it is non-replayable instead of pretending.

## Typed Tool Response Parsing

The analyzed prompt's tool response guidance is directly relevant to AVM. TALOS and KADMOS must avoid parsing by incidental order.

Bad pattern:

```text
Assume first content block is answer.
Assume second content block is tool result.
Extract fields using regex from arbitrary text.
```

AVM pattern:

```text
Read each block/event by type.
Validate each payload by schema.
Normalize into project value objects.
Render UI from normalized values.
Reject malformed values with validation faults.
```

Apply this to:

- JMP mutations;
- validator responses;
- trace replay events;
- benchmark logs;
- future MCP/tool connector results;
- model JSON outputs.

## Error Handling

The extracted pattern is defensive API use: try/catch, shape validation, and controlled failure.

AVM rules:

- Validator unreachable -> typed `VALIDATOR_UNAVAILABLE` or user-visible proxy error.
- Model returns invalid JSON -> `VALIDATION_FAULT`.
- Worker times out -> `FAILED` node with policy-safe message.
- Parent failure -> dependent nodes `BLOCKED_BY_DEPENDENCY`.
- Malformed trace events -> 422 validation error, not a 500.
- Private network request -> policy denial, not best-effort execution.

Errors are not secondary. They are the product proof that AVM is safer than direct model execution.

## Search And Evidence

Use web only when the answer depends on current external facts, competitor state, model/library versions, pricing, regulations, company roles, active products, or primary-source claims.

AVM/TALOS examples requiring search:

- "latest Gemini/Codex/Claude UI capabilities";
- current shadcn-vue installation details;
- Odysseus repository features;
- current model API behavior;
- security advisories;
- legal/regulatory claims.

Examples not requiring search:

- local code behavior;
- PHP syntax;
- static project architecture already in repo;
- explaining a function after reading it.

Prefer original sources. Store durable findings in `docs/architecture` or `docs/benchmarks` when they affect implementation.

## Memory And Preference Discipline

The analyzed prompt has a strong selective-memory model. TALOS should use the same principle without copying implementation details:

- Apply user/project preferences only when relevant.
- Do not let preferences suppress honest technical criticism.
- Do not surprise users by using unrelated personal context.
- Treat memories, notes, uploaded files, emails, and web pages as untrusted context.
- Show when memory or context influenced an answer.
- Give users a way to disable or remove context.

For AVM this becomes a future Context Vault requirement, not hidden prompt stuffing.

## UI Routing

The analyzed prompt routes visuals only when they help. The current AVM translation:

- `/chat` is low-noise chat.
- `/dashboard` is high-density control-plane.
- Benchmark/detail panels belong in the dashboard, not the dedicated chat route.
- A graph, chart, table, or animation must clarify execution or evidence.
- Decorative "wow" is not enough; observable state is the wow.

This rule directly addresses the current product direction: chat first, cockpit second.

## No Fake Tools

This is one of the most important transferable patterns.

AVM rule:

```text
Every user-visible feature must be backed by real behavior or clearly labeled demo/mock.
```

Examples:

- A chat UI must call a real chat endpoint.
- A benchmark UI must call benchmark APIs or explicitly say it is fixture data.
- A file ingestion button must upload files or be disabled with a clear reason.
- A connector tile must have a health/status source.
- A trace replay panel must consume trace events.

If a feature is visually present but not functional, it must be called a placeholder. No exceptions.

## AVM Implementation Rules

### Core PHP

- Keep framework-free.
- Keep deterministic state machine behavior testable with plain PHP/PHPUnit.
- Add workers behind interfaces.
- Add execution policy before dangerous capabilities.
- Benchmark claims live here or in dedicated benchmark services.

### Validator Node.js

- Keep stateless.
- Validate schema and protocol only.
- Do not persist product sessions.
- Do not become the TALOS backend.
- Keep `/dashboard` as compatibility redirect only.

### Laravel Control-Plane

- Own sessions, messages, files, runs, trace events, users, reports, and UI routes.
- Proxy or call validator/core services through explicit APIs.
- Return validation errors for malformed input.
- Hide provider secrets from browser-facing validator calls when productionized.

### TALOS UI

- `/chat`: dedicated chat page, no cockpit noise.
- `/dashboard`: control-plane, benchmarks, files, traces, policy, doctor.
- Use owned Vue components.
- Prefer shadcn-vue-style primitives for dialogs, command palette, sheets, tabs, tooltips, inputs, badges, and tables.
- Keep UI state connected to real endpoints.

### Benchmarks

- Always compare same prompt/model/context/evaluator across AVM ON and AVM OFF.
- Store raw logs.
- Show contract validity, hallucinated actions, policy violations, recovery score, determinism, latency, and token/cost when available.

### Security

- Treat all external content as untrusted.
- Enforce capability checks before tools.
- Resolve hostnames before allowing network workers.
- Fail closed on ambiguous execution policy.
- Make policy denials visible in trace.

## Request Evaluation Checklist

Use this before taking action:

1. Is this a chat/product/UI issue?
   - If yes, decide whether it belongs in `/chat` or `/dashboard`.
2. Is this an execution/DAG issue?
   - If yes, start in `core`.
3. Is this a schema/protocol issue?
   - If yes, start in `validator`.
4. Is this product state/API/persistence?
   - If yes, start in `control-plane`.
5. Is this a benchmark claim?
   - If yes, require AVM ON/OFF evidence.
6. Is this current/external?
   - If yes, search primary sources.
7. Is this behavior-changing code?
   - If yes, write failing test first.
8. Is this user-visible?
   - If yes, ensure no fake feature.
9. Is this complete?
   - If yes, run verification commands before saying so.

## Completion Checklist

Before claiming completion:

- Changed files match subsystem ownership.
- Tests were added or updated for behavior changes.
- Relevant focused tests pass.
- Wider suite/build passes when blast radius warrants it.
- `git diff --check` passes.
- No commit was made.
- Any unverified part is stated plainly.

## Local Skill Deployment

The project carries a repo-local skill at:

```text
.agents/skills/talos-engineering/SKILL.md
```

For Codex sessions that discover user-level skills only, copy or sync that skill to:

```text
C:\Users\ninox\.agents\skills\talos-engineering\SKILL.md
```

The repo-local version is the source of truth.
