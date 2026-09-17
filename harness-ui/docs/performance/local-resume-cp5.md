# CP5 — source recovery, integration checks and reviewer handoff

Date: 2026-09-17. Draft PR #31, branch `diag/local-resume-prefix-trace`.
Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2`. No merge, tag, release, auto-merge, history rewrite, model download or inference tuning.

## Durable checkpoints

| Checkpoint | Commit | Scope |
|---|---|---|
| CP1 | `eb52976adee856bee2dae02092e0b8e2cff2d304` | Default-off recorder, transport/registry wiring, comparison/report and tests |
| CP2 | `6ed0b757aa30b59384cc92022479e6059997298c` | Explicit writer gates; no timeout increase; nine-test TAP retained |
| CP3 | `22779f8534bc7d9a54eb94fed395d55a6209ec02` | Runnable overhead benchmark and every raw sample, with compressed/uncompressed digests |
| CP4 | `34e714744ccffe2a439f7005ab7218535d5d1138` | Three BC09 ownership declarations; production unchanged |
| CP5 | This documentation/evidence commit | Fresh tests, recovery provenance, integration blocker and capture protocol |

CP1's record of missing older transient raw files remains historical and true. CP2/CP3/CP5 are new evidence, not reconstructions passed off as the old runs. The earlier conversation attribution of the CP2 desktop failure to sendMessage/resume was incorrect: the complete log identifies BC09, and that correction is retained in CP3.

## Fresh executable evidence

Linux x64, Node v22.16.0 (not the project's Windows/Node 24 qualification environment). A complete baseline checkout was recovered from PR29's read-only CI artifact, then the exact twelve CP4 source blobs were restored and checked, including server.mjs. No fake composition-root fixture was substituted.

| Execution | Outcome | Boundary |
|---|---|---|
| PR31 CP4: diagnostics, observer, report, sink, original adapter, BC09 | **60 pass / 0 fail / 0 skip** | Complete source checkout; selected suites, not the entire application |
| PR28 + PR30 + PR31 CP4, with all their selected component suites and BC09 | **127 pass / 0 fail / 0 skip** | Does not include the PR29 kernel path or real model inference |
| PR29 bound-request diagnostic coverage probe | **0 pass / 1 fail** | Two fixture requests reach transport; only the ordinary request is recorded |

The first partial-checkout runs produced 58 pass / 1 fail because the complete server.mjs was missing. Those TAP files remain in the delivered archive; the new 60-test run is separately named and does not erase them. The 127-test run repeats many of the 60 tests; these counts must not be added as distinct coverage.

Reproduce the first run from harness-ui:

```sh
node --test tests/local-resume-*.test.mjs tests/local-runtime-llama-server.test.mjs tests/bc09-classificazione-rimozioni.test.mjs
```

Raw output for all three final executions, commands, source identities and the negative probe source are retained in the **conversation reviewer ZIP**, as `cp5-evidence.json` and individual TAP files. They are not embedded in this repository commit. The committed `local-resume-cp5-evidence-manifest.json` records their byte/hash identities and exact test commands. Its `decodedSha256` identifies the full uncompressed JSON. The repository already retains CP3's full compressed raw measurements separately.

A content checksum verifies delivered bytes, not the truth of a measurement or an independent test rerun. The reviewer must retain the ZIP alongside this checkpoint and use the documented commands for fresh execution.

## Verified recovery provenance

PR29 source head: `cb3d9c94d83b3d8e1837ec0e5f164ccbf65d3a4c`. Its complete Git history includes the unchanged baseline above.

- CI run: 35249129327, artifact 10509016503, `local-engine-contract-evidence-ubuntu-latest`.
- Downloaded ZIP SHA-256: `d1678c050ab2b0f777fe2deffe433ce0d7bfe349597c271ead0507fed2a1a4b8`.
- Inner source.bundle SHA-256: `90a5260f3303ff05f16166745e4bf278b4c41bb3d1f4afab9ea265a0b67b7733`; Git bundle verification passed.
- Recovered PR31 server blob: `e0d6357d2b3f13806abe065e439ebd238b3216e0`.
- CP4 classifier blob: `e69bbaec542142c11ca94ac6eaf94de6aa010e30`; reverting precisely its three new declaration lines reproduces base blob `70b3470ba1a15f1fb8433a809f370cbfeaa7ff8c`.

The source bundle is recovery input, not a newly executed Windows test or model benchmark. The compact reviewer archive retains selected source/patch/evidence, not the entire Git bundle or dependencies.

## Cross-PR blocker, not hidden by green component tests

PR29's `bindModel()` returns a bound request method calling the supervisor's lexical request function. PR31 wraps the externally exposed request method. Consequently a bound request bypasses that wrapper. The executable probe uses the actual PR29 supervisor and PR31 recorder with an injected child/HTTP fixture; both requests return the exact fixture bytes, but diagnostic request-start count remains 1 instead of 2. This is a failed coverage test, not a passing negative test or proof of model behavior.

A plain `git apply --check` of PR29 on the combined PR28/30/31 source also fails in `harness-ui/server.mjs` and `harness-ui/src/llama-server-supervisor.mjs`. This establishes a patch integration requirement, not that every possible three-way merge must fail. Resolve both file overlaps and preserve binding/invalidation, async-start ownership and diagnostic coverage before qualifying all four together. No other PR was modified to conceal this blocker.

Suggested limited integration sequence after review: **#28 -> #30 -> #31**. **#29 is a separate blocked integration step**, requiring reconciled code and fresh combined tests first. All four remain Draft. This is not authorization to merge them or to activate either opt-in trial.

## CI observations and remaining gates

At the CP5 evidence snapshot, CP4 run 35262462580 reports desktop-core SUCCESS including server, kernel and kernel-source comparison; browser and mobile SUCCESS; desktop-ui and Android still running. The standalone streaming and prompt-enhance workflows also succeeded. Pending jobs are not counted as passes.

CP2 run 35259741450 remains a recorded failed run: desktop-core reports 3101 tests / 3062 pass / 1 fail / 38 skip, failure BC09. Its mobile log reported a missing tests/runtime-r2.test.mjs after passing Vitest; the path is also absent in the recovered baseline. The later CP4 mobile job reports success without any mobile changes here. This observation does not establish the cause of the differing CI outcomes, and BC09 is not claimed to fix mobile.

PR28 and PR30 each currently have successful gates, streaming and prompt-enhance workflow results on their own pinned heads. PR29 has successful dedicated Linux/Windows kernel contracts, but general gates failure. CI on a later documentation head must be read separately.

The owner's 86-second resumed turn is not reproduced. Real GGUF/CPU/Vulkan/fallback, prefill, historical KV reuse, frontend paint, independent peak RSS/VRAM and installed-app tests remain open. CP3 measures recorder cost, not inference improvement: stream median approximately +4.87 ms; 1 MiB private capture approximately +21.16 ms in those fixtures. Keep diagnostics off by default. See `local-resume-protocol.md` for capture and rollback.
