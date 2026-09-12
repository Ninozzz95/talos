# AVM Core PHP — working rules

## Architecture Boundaries

- Core PHP remains framework-free. It owns deterministic DAG execution, node state, workers, benchmark semantics, evidence rendering, and CLI primitives.
- Kadmos CLI is the operator shell. It must stay usable for beginners while preserving expert commands.

## AVM ON/OFF Benchmark Rule

Any claim that AVM improves model behavior must be benchmarked against AVM OFF using the same prompt, model, context, evaluator, and stored logs. A benchmark result without raw evidence is not a product claim.

## Typed Tool Response Parsing

- Parse structured responses by type and schema, not by array position.
- Prefer JSON/Zod/PHP value objects over regex.
- If parsing model JSON, strip code fences defensively, validate shape, and handle parse failure as a validation fault.
- External canonical tool JSON must enter PHP through the shape-preserving `fromJson()` boundary. Never pass `json_decode(..., true)` output directly to a tool contract `fromArray()` method; associative decoding destroys the object/list distinction.
- Tool contract `fromArray()` methods are for server-constructed or already shape-validated canonical values only.

## Verification

Run verification before claiming completion. Choose commands that prove the claim:

- Core PHP changes: relevant `core/tests/*.php`, then wider core suite when risk warrants it.
- Cross-cutting changes: `git diff --check`.
