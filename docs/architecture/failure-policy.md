# Failure Policy

## Problem

Autonomous retries can turn a local model or worker error into a broader system incident. The MVP needs deterministic failure containment before self-healing.

## Design

Kadmos uses HMI-first failure handling:

- `FAILED`: node execution failed.
- `BLOCKED_BY_DEPENDENCY`: descendant node cannot execute because a parent failed.
- `RETRYING`: operator-initiated recovery state.
- `PRUNED`: future autonomous branch removal state.

The scheduler decrements in-degree only when parents reach `SUCCESS`. Failed or blocked nodes are excluded from the execution queue.

## Example

```text
A -> B -> C
A fails
B and C become BLOCKED_BY_DEPENDENCY
queue becomes empty
```

## Failure Mode

The DAG may pause until an operator fixes the failed payload. This is intentional for MVP safety.

## Test Evidence

- `core/tests/ASTOrchestratorTest.php`
- `core/tests/BenchmarkComparisonRunnerTest.php`
- `core/tests/BenchmarkThresholdTest.php`
