# Local resume diagnostic checkpoints

Date: 2026-09-17. Branch: `diag/local-resume-prefix-trace`.
Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2`.
Draft only. No merge, release, tag, auto-merge, model download or inference policy change.

## CP1 — recorder, integration and correctness

The first checkpoint commits the already-uploaded, hash-verified production wrappers, offline comparison/report commands and three test modules. Only `harness-ui/server.mjs` is changed among pre-existing files. Recorder disabled by default; raw capture requires both explicit opt-in and the exact selected session. No request cache flags or prompt content are modified.

Earlier local execution in this conversation passed 55 tests (including the five original adapter tests) and 122 tests in a separate compatibility snapshot with the archived #28/#30 modules. Those runs are historical evidence, not fresh Windows or model-inference runs. The transient working directory was reset before this checkpoint: uploaded Git blobs remain recoverable, but previous uncommitted raw TAP/benchmark files are not presently mounted. They must not be claimed as attached until recovered or re-run. Previously retained benchmark summaries remain historical, not replacements for missing raw files.

Next bounded block: commit the already-written benchmark/protocol, record any evidence recovery limits, execute fresh reproducible checks where available, and inspect GitHub CI. Final raw reports must be attached and/or committed before claiming a complete evidence bundle.

## Boundaries still open

The owner's 86-second case has not been reproduced here. GGUF/GPU timings, observed prompt reuse, frontend paint and native server queue time remain unavailable, not zero. Token reconstruction is explicitly distinct from historical tokens or actual KV hits. Full Windows/Electron integration and model-level A/B are merge blockers.

Each later checkpoint must identify its commit, exact tests/run, artifacts, failures and next block. Do not rewrite history or silently replace failed or missing evidence.
