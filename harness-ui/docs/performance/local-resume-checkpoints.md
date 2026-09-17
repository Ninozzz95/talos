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

## Later checkpoint index (CP5 addition)

- CP1: `eb52976adee856bee2dae02092e0b8e2cff2d304`.
- CP2: `6ed0b757aa30b59384cc92022479e6059997298c`; explicit writer gates, nine-test TAP, initial Windows timeout retained in `local-resume-cp2.md`.
- CP3: `22779f8534bc7d9a54eb94fed395d55a6209ec02`; 61 paired measurements per scenario, full raw Brotli JSON and hashes in `local-resume-cp3.md`.
- CP4: `34e714744ccffe2a439f7005ab7218535d5d1138`; three BC09 cleanup ownership declarations, no runtime change.
- CP5: this documentation commit; `local-resume-cp5.md`, capture protocol and evidence manifest. Fresh complete-source 60/60 and combined PR28/30/31 127/127 tests. The separate PR29 bound-request coverage test FAILS and is retained in the reviewer ZIP.

The original CP1 missing-evidence statement above is preserved as history. New executions are labelled separately. The next engineering block is the PR29 integration and real-model qualification described in CP5, not an automatic merge or release.
