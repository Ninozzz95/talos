# Local engine: asynchronous preflight and startup ownership

Date: 2026-09-17. Draft implementation increment; not merge-ready.

## Scope and relation to the approved plan

Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2`.
Branch: `perf/local-engine-async-preflight`, separate from PR #28.
llama.cpp before/after: `b10517` / `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`, unchanged.

This implements the asynchronous supervisor preflight portion of WP03/F17 and its necessary startup/cancellation ownership contract. It does NOT complete WP00, WP01, the 32-function plan, or the end-to-end optimization mission. No modifications to the kernel, local adapter/parser from PR #28, session registry, mobile, context-engine, prompts, model settings, packaging or dependencies. Only `llama-server-supervisor.mjs` and the new `llama-binary-probe.mjs` change production behavior.

### Architecture correction established before patching

There are TWO local paths, not one universally broken local agent:

- `session-registry.mjs`, `providerEffettivo === 'local'`: invokes `eseguiRuntimeLocale`; the inspected function emits tool Start/Args but does not execute tools or request continuation.
- The shared kernel path through `createOwnerRuntimeAdapter`/`creaFetchInstradata` already recognizes `local:` models, auto-starts through `avviaLocale`, and invokes authenticated `chiamaLocale` through the supervisor. The factory defaults to the versioned kernel when the explicit owner module is absent. The introductory external-module comment alone is incomplete evidence.

The supervisor is relevant to both paths. UI selection-to-provider mapping, full context construction, real kernel permission/executor roundtrips and frontend drain have NOT been traced or executed completely here. No new executor or unverified route replacement is introduced. A future WP01 change must establish which entry paths need conversion, and prove permissions/results/continuation, without treating this preflight work as completion of that prerequisite.

```mermaid
sequenceDiagram
  participant C as Desktop backend caller
  participant S as Supervisor / one startup owner
  participant P as Direct probe child
  participant L as llama-server
  participant H as Independent HTTP client
  C->>S: start(model, context, optional signal)
  S->>S: reserve owner before port/lock await
  S->>P: async fit f16; q8 only if needed; help
  H->>S: unrelated HTTP work on same Node loop
  S-->>H: handled while probe runs
  P-->>S: close + bounded complete output
  S->>S: check owner, cache result, preserve launch policy
  S->>L: spawn via existing process policy
  S->>L: authenticated health with abort/deadline
  L-->>S: ready
  S-->>C: runtime status (no bearer key)
  Note over S,P: stop aborts probe and drains startup owner before another start
```

## Evidence and hypothesis

The baseline default helper calls `spawnSync` for fitter/help in the backend JS thread. Node's version-pinned documentation states that synchronous child-process methods block that event loop, whereas `spawn` returns asynchronously. Sources: [Node 22.16 child_process](https://nodejs.org/download/release/v22.16.0/docs/api/child_process.html), [Node 22.16 perf_hooks](https://nodejs.org/download/release/v22.16.0/docs/api/perf_hooks.html).

Hypothesis: asynchronous probes let unrelated HTTP work and cancellation progress during preflight, without making the underlying fitter or inference faster. Adding await boundaries requires explicit ownership to prevent late spawn/ready and duplicated model locks.

The full clone failed because sandbox DNS could not resolve GitHub. Local execution uses a partial source snapshot, not a clone. Exact baseline bytes were verified with Git blob hashes:

- supervisor: `0907926d68b9aaade9c56b0a8c24dc547e319b00`;
- unchanged process-policy dependency: `e0d24aa8fa3e0f8bc533dff751fa4d435fc97a3e`.

The remote commit builds on the COMPLETE base tree, not this partial local directory. No usable GGUF/llama-server or GPU device was found in the inspected sandbox locations; no model was downloaded to manufacture a hardware matrix.

## Implemented behavior

1. `createLlamaBinaryProbe` uses asynchronous spawn, no shell, inherited environment as before, separate Buffer arrays decoded at close, a combined 4 MiB stdout/stderr budget, and bounded timeout. Nonzero exit, truncation, timeout or spawn failure returns unknown (`null`). Cancellation kills the DIRECT probe with SIGKILL, destroys capture pipes, waits for close, then rejects. This is not a general process-tree sandbox.
2. Optional metadata-only observations report kind/outcome/duration/bytes/exit code, never paths, arguments, output, environment or credentials. Observer exceptions and rejected promises are isolated. Custom injected probes own their own observations. No second persistent telemetry database is added.
3. Legacy synchronous injection and Promise-returning probes both work. Fit f16, optional fit q8, and help remain sequential. Successful outputs yield the same GPU/context/KV/speculative launch arguments. Cancelled late output cannot populate the caches or start the server.
4. Startup reservation precedes port allocation and model lock acquisition. A single operation owns cancellation and lock release. Stop drains it before another start, including pending lock/unlock. Health and polling during startup honor abort; late health success cannot publish ready after stop. A stale process error cannot overwrite a later process's global state.
5. A previously failed ready process has its old acquired model lock released before a fresh start. Existing driver/device-loss CPU fallback signatures and OOM-only proposal remain; cancellation is never a reason to start a CPU fallback.

The default baseline helper accepted successful-looking stdout even on a nonzero exit. The new helper deliberately rejects it as evidence. Output cap is combined rather than treating each pipe as an independent full budget. These are explicit fail-closed compatibility changes, not claimed byte-equivalence for failed probes.

## A/B protocol

Runnable code: `scripts/bench-llama-preflight.mjs`. Compact committed evidence: `local-preflight-results.json`. Full original reports, individual CPU/end-memory observations, TAP logs, source snapshots and checksums are in the delivered evidence archive. Compact evidence preserves every paired elapsed sample and identifies originals by SHA-256.

All runs use real OS probe children, an independent forked HTTP client, and an actual Node loopback HTTP sentinel service. Inference server spawn and health are FIXTURES. For fit cases, both variants execute identical Node programs that wait 50 ms then return deterministic fitter/help text through the injected probe boundary. The baseline wrapper matches the inspected spawnSync helper; candidate uses the actual new async helper. This controlled delay is not a measured llama-fit-params duration. `native-node-help` exercises each supervisor's DEFAULT probe path with the actual Node executable and its real `--help`, with no artificial delay.

Three warmup pairs are excluded. Runs alternate AB/BA; each pair asserts identical successful launch argv (bearer key redacted) and lock/unlock behavior. Client RTT is measured in the separate child clock; main-thread heartbeat gaps use monotonic time. No subtraction between unrelated process clocks. Bootstrap resamples complete A/B pairs (2,000 resamples, fixed seed). The p95 values are empirical diagnostics, not high-confidence tail guarantees. Parent CPU excludes child CPU; endpoint RSS is NOT peak memory and is affected by both variants sharing a parent process. Missing metrics remain unavailable, not zero.

| Scenario | Pairs | HTTP median ms, base → candidate | HTTP median-ratio 95% CI | Fixture ready median ms, base → candidate | Ready median-ratio 95% CI |
|---|---:|---:|---:|---:|---:|
| Three probes, 50 ms controlled delay each | 31 | 222.091 → 5.478 | 0.024–0.027 | 225.137 → 226.673 | 0.998–1.016 |
| Default probe, actual `node --help` | 61 | 29.903 → 5.211 | 0.170–0.178 | 33.668 → 34.695 | 1.016–1.055 |
| Warm existing probe cache | 31 | 5.102 → 5.039 | 0.950–1.039 | 0.497 → 0.532 | 0.864–1.161 |
| Identical baseline A/A warm control | 31 | 5.038 → 5.155 | 0.980–1.063 | 0.464 → 0.456 | 0.828–1.059 |

**Tradeoff:** actual node-help preflight is about 1.027 ms / 3.1% slower in median; its interval allows 5.5% slower readiness. Parent user CPU for three probes rises from 3.565 to 7.714 ms; for native help, 2.180 to 2.775 ms. The three-probe heartbeat gap falls from 225.224 to 2.798 ms. This patch buys responsiveness, not faster computation. Warm-ready ratios are noise-sensitive; no warm speedup or universal absence of regression is claimed. No independent peak RSS/VRAM comparison was performed.

Initial reports remain in the evidence and compact summary. The initial native-help run (31 pairs) was extended to 61 pairs to examine readiness regression; the latter supports a small slowdown, not an inference improvement. Reporting was revised to represent CPU ratio CIs with zero denominators as null rather than non-finite numbers; the elapsed calculation was unchanged. A combined multi-scenario sandbox invocation timed out before writing one A/A report; that incomplete invocation is not included as a sample or represented as a completed result. A/A was rerun completely.

### Reproduction from complete checkouts

```bash
git worktree add --detach ../talos-preflight-base 13f65c15cdeaf8986b882993a0773cdeafb867d2
cd harness-ui
node --test tests/llama-binary-probe.test.mjs tests/llama-server-preflight.test.mjs tests/local-runtime-llama-server.test.mjs
node scripts/bench-llama-preflight.mjs --baseline ../../talos-preflight-base/harness-ui --output preflight-fit.json --scenario fit-q8 --iterations 31
node scripts/bench-llama-preflight.mjs --baseline ../../talos-preflight-base/harness-ui --output preflight-help.json --scenario native-node-help --iterations 61
node scripts/bench-llama-preflight.mjs --baseline ../../talos-preflight-base/harness-ui --output preflight-warm.json --scenario warm-cache --iterations 31
node scripts/bench-llama-preflight.mjs --baseline ../../talos-preflight-base/harness-ui --output preflight-aa.json --scenario warm-cache --iterations 31 --control
```

Adjust the baseline directory to the actual worktree location. Benchmark scripts make no cloud calls and download no models; they create local child processes and a loopback listener. A live Electron UI is not part of this harness.

## Correctness

Node 22.16.0 Linux x64: **52 passed / 0 failed / 0 skipped**: 20 direct-probe tests, 27 supervisor/preflight tests, and the five unchanged main adapter tests. Direct-probe tests actually spawn Node processes. Supervisor server processes, model locks and health endpoints are controlled doubles. Coverage includes split UTF-8, exact/combined output limits, nonzero exits, ENOENT, timeout with SIGTERM ignored, cancellation after direct-child close, listener cleanup, reentrancy, concurrent port allocation, pending lock/unlock, late probes/health/error, authenticated transport, driver/device-loss fallback, OOM proposal, and 100 start/stop cycles.

An explicitly selected non-hanging subset of eight new supervisor tests was also executed on the exact unchanged baseline: **3 passed / 5 failed**, with failures for Promise-valued fit probes, pre-aborted start, stop from a log listener, async fit-cache expectations, and failed-ready lock ownership. This does not mean all five are preexisting production failures: Promise-valued probes and start-signal support are new contracts. The other new tests were not run against baseline because some intentionally wait for cancellation contracts it does not implement.

Full backend `npm run verify:all`, original Windows-oriented supervisor suite, kernel suite, desktop `npm test`, Electron/native addons, installer and real CPU/Vulkan/GGUF tests were NOT run locally in the partial snapshot. Any CI results are reported separately on the PR and do not turn fixture inference into real-model evidence.

## Decisions, limitations and rollback

KEEP the async probe/start-ownership change IN DRAFT based on responsiveness and correctness evidence, pending broader gates. No production optimization was implemented and then reverted. Do not manufacture a rejected experiment. Not a measured GGUF startup, TTFT/TTFV, prefill, decode, tool-loop or frontend speedup.

The existing path-keyed help/fit caches remain unchanged: binary replacement, model replacement, driver and memory-pressure invalidation are unresolved. Unknown help may remain cached as before. No persistent capabilities cache, bounded model pool, KV reuse strategy, suffix decoder, MTP/DFlash integration or TurboQuant implementation is delivered. Stop waits for injected non-cooperative probes, port allocators and model-store operations to settle; those dependencies have no new universal cancellation deadline. Ready SERVER shutdown still uses the existing SIGTERM/non-close-acknowledged behavior, unlike the direct probe helper: general process-tree teardown is not solved. The optional caller signal ends its ownership when startup completes; it is not a lifetime signal for a ready model.

Rollback: revert the two production-file changes together; test/benchmark/docs can remain as evidence, though new-contract tests will fail on baseline. No migration, model edit, persistent format change, dependencies, release or tag. Merge gates include full affected suites, Windows/Electron and real-binary cancellation behavior, representative CPU/Vulkan/fallback, independent memory/CPU tradeoff review, actual desktop HTTP responsiveness and startup timing, and the unfinished shared-kernel local tools/continuation work.

## Original mission: twenty review answers for this increment

1. Fitter: existing f16 pass, q8 only unless all layers fit; no fitter-count reduction claimed.
2. Synchronous blocking: reproduced in controlled OS-child preflight; removed from supervisor default probes.
3. Fit/actual-context agreement: unchanged, not qualified on a real model here.
4. GPU context choice: unchanged; no new justification claimed.
5. NGL optimum: not established; successful argv preserved.
6. More fitter outputs: not implemented.
7. Second-turn reused token fraction: unavailable.
8. Explicit cache request: unchanged; no cache hit claims.
9. First-turn n-gram penalty: unavailable.
10. Speculation acceptance/speedup: unavailable.
11. Dynamic speculation: unchanged; currently launch-static policy.
12. Parser share of inference CPU: unavailable; PR #28 is independent.
13. Fragment parsing complexity: not changed by this PR.
14. Tool schemas: shared-kernel `local:` transport exists; legacy one-shot path differs. Full production entry mapping remains open.
15. Agent orchestration overhead: unavailable; HTTP sentinel is NOT a tool roundtrip.
16. Same-model server-state reuse: not implemented/benchmarked; warm case reuses probe caches only.
17. Reload causes: existing lifecycle; start rejects while active. No new residency policy.
18. Model-switch latency: unavailable.
19. CPU fallback: controlled signatures/flags/lock semantics tested; actual GPU/CPU correctness not verified.
20. Largest proven impact HERE: independent HTTP responsiveness during preflight, paid with extra parent CPU and a small node-help readiness slowdown. Ranking all engine opportunities requires real-model profiling.
