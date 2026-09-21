# Benchmark Methodology

## Problem

Benchmark claims are weak unless the same task is compared across AVM ON, direct LLM, and tool-agent baselines with reproducible logs.

## Design

Kadmos benchmark reports compare:

- `avm_on`: validated DAG execution.
- `avm_off_direct`: direct model baseline without durable execution state.
- `tool_agent`: structured tool baseline without AVM failure cascade.

Primary metrics:

- completion rate
- contract violation count
- recovery score
- determinism score
- enterprise risk score

## What Is Not Claimed

Kadmos does not make the model deterministic. Kadmos makes the execution boundary deterministic.

## Failure Mode

Mock scenarios are regression tests, not public performance proof. Live benchmarks must record model, prompt, evaluator, scenario, latency, token usage, and raw report.

## Test Evidence

- `core/tests/BenchmarkComparisonRunnerTest.php`
- `core/tests/BenchmarkThresholdTest.php`
- `control-plane/tests/Feature/BenchmarkComparisonApiTest.php`
