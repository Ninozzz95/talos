# Kadmos Architecture Overview

## Problem

LLMs can produce useful plans, but their output is probabilistic and must not directly mutate enterprise systems. The risk is not only wrong final answers; it is unvalidated tool calls, hidden failure cascades, unsafe retries, and non-replayable execution.

## Design

Kadmos separates model intent from execution:

- `core/`: pure PHP AVM engine, DAG state machine, workers, benchmark semantics.
- `validator/`: stateless Fastify/Zod service for JMP validation.
- `control-plane/`: Laravel owner of files, runs, reports, provider profiles, UI, API routing.
- `Talos`: product UI for upload, comparison, fault explanation, DAG inspection, and trace replay.

The LLM proposes JSON Mutation Protocol commands. The validator accepts or rejects them. The core applies accepted mutations to a DAG, schedules only valid nodes, and records state transitions.

## Example

```text
User file -> LLM proposes mutations -> Zod validates JMP -> AVM updates DAG -> worker executes -> report stores trace
```

## Failure Mode

If a model references a nonexistent node, the mutation is rejected before execution. If a node fails during execution, dependent nodes become `BLOCKED_BY_DEPENDENCY` instead of executing against invalid state.

## Test Evidence

- `.\core\kadmos.cmd test`
- `cd validator && npm test && npm run build`
- `cd control-plane && php artisan test`
