# Kadmos Benchmark Methodology

1. What is compared: AVM ON, AVM OFF Direct, and Tool Agent modes on the same scenario.
2. What is not claimed: Kadmos does not make the model deterministic. Kadmos makes the execution boundary deterministic.
3. Model versions: every live run must store provider, model, date, prompt template, and temperature.
4. Prompt templates: prompts must be stored with scenario fixtures or report metadata.
5. Scenario fixtures: fixtures live under `core/tests/benchmarks/scenarios`.
6. Evaluator rules: success is measured by final DAG state, contract violations, risk score, and replayable node status evidence.
7. Statistical treatment: repeated runs must report run count, mean latency, token usage, and variance where available.
8. Reproducibility commands: `.\core\kadmos.cmd benchmark compare --scenario=<file> --runs=<n> --json`.
9. Known limitations: mock baselines are regression evidence, not a substitute for live provider comparison.
