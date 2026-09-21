# Talos And Kadmos Experience Blueprint

This document adapts `C:\Users\ninox\Downloads\refactoring-blueprint.md` to the current Kadmos architecture.

## Decision

The blueprint is adopted as a product-experience target, not as a direct stack replacement.

Kadmos keeps these boundaries:

```text
core/           Pure PHP AVM engine, benchmark semantics, CLI primitives
validator/      Stateless Fastify/Zod validator
control-plane/  Laravel owner of users, files, runs, reports, provider profiles, UI delivery
Talos UI        Product interface for proof, comparison, trace, and recovery
```

Node must not become the production app backend. It should keep `/health` and `/validate` as its stable responsibilities. Any current dashboard or benchmark routes served by Node are transitional demo surfaces.

## Talos UI Target

Talos should become an execution proof lab, not just telemetry.

Required surfaces:

- Session sidebar for runs, uploaded files, benchmark packs, and state filters.
- Main execution feed with prompt, model intent, JMP blocks, validation results, and worker events.
- Inspector panel for selected node payload, lifecycle, dependencies, output, errors, and recovery actions.
- DAG graph view with semantic node state colors.
- AVM ON, AVM OFF Direct, and Tool Agent comparison view.
- Plain-language fault explanations.
- Trace replay with step, filter, export, and report actions.

The UI stack decision is staged:

```text
Now
  Keep improving the current Vue dashboard only where it directly proves AVM value.

Control-plane migration
  Move product APIs, persistence, files, runs, reports, and provider profiles into Laravel.

Production Talos
  Choose Vue or React deliberately:
    Vue track: Vue 3, TypeScript, Vite, Pinia, Headless UI, Vue Flow, CodeMirror.
    React track: React, TypeScript, Vite, Tailwind, shadcn/Radix, React Flow, CodeMirror/Monaco.
```

React Flow and shadcn/Radix are valid if Talos moves to React. Vue Flow and Headless UI are valid if preserving Vue velocity is better. The project should not mix both stacks ad hoc.

## Kadmos CLI Target

The terminal part of the blueprint is adopted more directly.

Primary CLI foundation:

```text
symfony/console
```

Use `laravel/prompts` only inside Laravel/control-plane workflows where Laravel is already booted.

Required CLI capabilities:

- Structured tables for nodes, runs, benchmarks, and checks.
- Semantic status colors.
- Spinners/progress for LLM calls, validator calls, and worker I/O.
- `--json` output for automation.
- Stable exit codes.
- `doctor` command.
- Benchmark comparison command.
- Trace replay command.
- Fault explanation command.
- Interactive HMI retry/override selection.
- Modes: `ask`, `semi`, `auto`, `lab`, `enterprise`.

Initial commands:

```text
kadmos doctor
kadmos benchmark compare --scenario=... --json
kadmos trace replay <run-id>
kadmos fault explain <run-id> --node=<node-id>
```

The CLI must never silently fall back to mock validation in live mode.

## Roadmap Mapping

```text
Phase 3
  Benchmark JSON report becomes the UI data contract.

Phase 4
  File ingestion creates user-owned scenarios.

Phase 5
  Laravel becomes production owner of app APIs and persistence.

Phase 6
  Talos implements sidebar, feed, inspector, graph, comparison, fault explainer, replay.

Phase 7
  Kadmos CLI moves to symfony/console and modern shell output contracts.
```

## Non-Goals For The Immediate Step

- Do not rewrite the current dashboard to React before file ingestion and control-plane ownership are ready.
- Do not move provider secrets into the browser.
- Do not expand the Node validator into the main app server.
- Do not add Tailwind, shadcn, Framer Motion, or graph libraries until the production UI package boundary is defined.

## Acceptance Criteria

- The current dashboard continues to show benchmark proof clearly.
- The roadmap records the adapted blueprint constraints.
- A tracked architecture document exists for review and future planning.
- Next implementation steps remain test-first and incremental.
