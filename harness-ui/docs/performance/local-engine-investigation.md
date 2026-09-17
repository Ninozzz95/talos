# Desktop local engine investigation — partial delivery, not merge-ready

Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2`. Branch: `perf/desktop-local-llm-engine`.
The remote branch is based on that exact commit. Local execution uses a **partial, byte-verified source snapshot**, not a full clone: sandbox DNS prevents Git cloning and package installation. The four adapter dependency files match their GitHub blob SHA-1s. No model or GPU is available in this environment.

## Architecture note (written before the production patch)

Verified sources at the base: `src/local-runtime-llama-server.mjs` (entire file), `src/local-runtime-events.mjs`, `src/local-runtime-contract.mjs`, `src/stream-partition.mjs`; `src/session-registry.mjs` around lines 2450–2510; `src/llama-server-supervisor.mjs` lines 1–330; `server.mjs` registration via repository code search. Paths are relative to `harness-ui`.

```mermaid
sequenceDiagram
    participant UI as Desktop UI (entry/drain not profiled)
    participant S as Backend / session registry
    participant R as Local llama.cpp adapter
    participant P as llama-server supervisor
    participant L as llama-server process
    UI->>S: submit (entry details not independently traced)
    Note over S: eseguiRuntimeLocale: initial messages or task.consegna
    S->>R: generateStream(messages, reasoning, signal, requestId)
    R->>P: request(/v1/chat/completions, JSON.stringify(body))
    P->>L: loopback HTTP (real process unavailable here)
    L-->>R: SSE response
    Note over R: TextDecoder → line splitting → JSON.parse
    Note over R: reasoning/text partition; native tool assembly
    R-->>S: validated, cloned runtime event envelopes
    S-->>UI: AG-UI broadcast
    Note over S: tool_call → ToolCallStart + ToolCallArgs ONLY
    Note over S: No tool executor, result message or continuation in this function
```

The JavaScript adapter runs on the backend's JavaScript thread. Awaited request/read operations are async boundaries; `JSON.stringify`, `JSON.parse`, string splitting, accumulation and envelope validation/cloning run synchronously. The native server is a separate process behind loopback HTTP. No worker-thread offload is present in the inspected adapter. CPU/GPU tokenization, prefill, decode, IPC startup details, persistence cost and frontend drain are **unmeasured**, not inferred from replay.

### Tool pipeline: correctness blocker

`eseguiRuntimeLocale` makes one `generateStream` call. It sends `messages`, `reasoning`, IDs and cancellation, but no native `tools`, `tool_choice`, or `parseToolCalls`. It emits `ToolCallStart` and `ToolCallArgs`, then eventually `RunFinished`. It does not dispatch a kernel tool, emit a result, append a tool-result message, or submit a continuation. Canonical messages append assistant text only. Thus AG-UI tool activity is **not proof of execution**.

The llama adapter itself accepts `parseToolCalls` (default false) but no `tools` or `tool_choice` parameter; the qualification path explicitly passes false. Tool JSON syntax is validated by `parseLocalRuntimeEvent`, not against a tool-specific schema. Tagged fallbacks are handled independently by `stream-partition.mjs`. No inference is made about template capabilities, MCP/Forge schema regeneration, or the full kernel's behavior: those paths have not been validated in this snapshot. Do not implement a second, unreviewed tool executor that bypasses existing permissions/hooks. Integration into the shared executor and real continuation tests remain blockers for the requested end-to-end mission.

### Startup observations, not measured speed claims

`creaSondaBinario` calls `spawnSync` with bounded timeout/output: when run, it blocks its JavaScript thread. `leveVelocita` probes f16 first and skips q8 only when f16 reports full offload; otherwise it probes q8. Results are cached in memory by binary path, model path and context. Help is cached by binary path. Those keys do not include file identity, driver or memory pressure. Fitter output handling inspected here extracts `-ngl` for KV choice, not a complete launch plan. Actual probe latency and safe cache invalidation changes require real-binary measurements; no startup tuning is retained here. Existing historical code comments are not this investigation's results.

## Pre-patch baseline

`local-stream-baseline.json` records 2 warmups and 7 measured repetitions of dependency-free synthetic SSE replay through the **unchanged production adapter**, including envelope validation and structured cloning. The selected-module field is named `candidate` by the initial CLI; its path and SHA-256 identify the immutable baseline snapshot. At 32-character argument fragments, 64 KiB payload took 104.106 ms median and 256 KiB took 1408.412 ms median. No model ran. This is adapter replay latency, not TTFT, TTFV or real tool roundtrip.

The current loop attempts `JSON.parse(previous.arguments)` on every growing fragment. The harness separately counts argument parse attempts and total argument characters submitted to JSON.parse, outside timed runs. This distinguishes algorithmic work from noisy timing. First-ID-only fragments also split across separate pending entries because the first key is the call ID and subsequent keys use index. A syntactically valid partial scalar can be emitted before later bytes arrive.

## Validation gates

Retain only a bounded parser/assembly patch after A/B replay and targeted regression tests. The full verification command, desktop tests, real-model cold/warm readiness, TTFT/TTFV, throughput, prefix reuse, actual tool execution/continuation, CPU/Vulkan behavior and packaging remain unverified unless separately recorded. Missing metrics are null, never zero or estimated. No universal engine or model-quality claim is supported by fixtures.

## Retained change and final A/B evidence

Only `src/local-runtime-llama-server.mjs` changes production behavior. Native tool fragments are stored in ordered arrays, correlated by stable index with an ID-only fallback, joined at `finish_reason` or ordinary EOF, and validated by the existing envelope validator once. Cancellation is checked before the request, between SSE chunks, at final flush, and between buffered tool emissions. This fixes premature parseable-prefix emission and missing-ID continuation without adding an executor or changing prompts, models, backend flags or dependencies. Memory is proportional to buffered arguments/fragments, not a fixed-capacity cache; peak allocation remains unmeasured.

Final adapter SHA-256: `615ee4af1d843423d98249e6e60b7e821600ed8129b638f2455d195c138f332d`.
Baseline adapter SHA-256: `b417c2ef09788381ee34127329c374bea0b76ad330f440e6b51e38308884b63f`.
Final harness SHA-256: `304bbc1f8d4e4424e7822fa0b2614067be2b4dfa8d24229defe07d0953369841`.

Environment: Linux x64 sandbox, Node 22.16.0, AMD EPYC 9V74 exposed as 5 logical CPUs. Physical topology, thermals, storage and power profile are unavailable. Exact OS/RAM and hashes are in `local-stream-results.json`. No installed GGUF or accessible GPU was found in the inspected locations. No large model downloads were attempted.

### Protocol

Synthetic ASCII native tool arguments: 4/16/64/256 KiB payload, 32-character argument fragments, fixed 4096-byte transport chunks. Both variants use the real adapter, partitioner and envelope validators. Every run checks complete output equivalence outside the timed interval. Timings include adapter replay, not loopback transport, inference, tool execution, AG-UI, disk persistence or UI. Repeated IDs intentionally allow the baseline to complete; first-ID-only streaming is covered separately by correctness tests.

Separate warmups, alternating AB/BA order, forced GC before (not during) each measurement, monotonic `performance.now`, all raw elapsed samples retained. The 95% interval is a paired-ratio bootstrap (4000 resamples, seed 1729), not a confidence interval on the ratio of independent medians. Median, standard deviation, MAD, supplemental mean and p95 are emitted; p95 is null below 20 samples. Same-process memory endpoints are not independent peak-memory measurements. No hardware-independent timing assertions are added.

| Replay scenario | Repetitions per variant | Before median ms | After median ms | Median delta | Paired ratio 95% interval |
|---|---:|---:|---:|---:|---:|
| Tool payload 4 KiB | 31 | 2.399492 | 0.574708 | -76.05% | 0.2294–0.2628 |
| Tool payload 16 KiB | 31 | 11.054108 | 1.559114 | -85.90% | 0.1353–0.1454 |
| Tool payload 64 KiB | 31 | 101.077169 | 5.353742 | -94.70% | 0.05288–0.05437 |
| Tool payload 256 KiB | 15 | 1361.153273 | 24.423760 | -98.21% | 0.01625–0.01953 |
| Text: 1024 frames, final A/B | 121 | 9.818142 | 9.854012 | +0.37% | 0.9863–1.0526 |
| Text: identical baseline A/A | 121 | 9.492531 | 9.446842 | -0.48% | 0.9364–1.0212 |

The initial 31-repetition text control crossed the review trigger: 9.996022 to 10.561486 ms (+5.66%). It is retained in the evidence rather than discarded. The final 121-repetition text run does not demonstrate a clear median regression, but its upper interval still permits about 5.3% paired slowdown; p95 changed from 13.056692 to 13.517988 ms. The A/A run demonstrates noise, not a guarantee of no regression. Keep this uncertainty as a review risk. No text speedup is claimed.

Algorithmic diagnostic, outside timed runs: at 256 KiB, baseline submitted 1,074,397,212 argument characters over 8,194 parse attempts; candidate submitted 262,158 characters in one parse. At 64 KiB the counts were 67,272,732/2,050 versus 65,550/1. This is the strongest evidence for the root cause, independent of wall-time noise. It does not prove the total SSE parser is asymptotically optimal: the line-splitting parser is unchanged.

### Artifacts and reproduction

`local-stream-results.json` contains all elapsed samples for the baseline, final A/B, A/A and initial text review-trigger runs, plus CPU summaries, dispersions, diagnostic counts, machine details, fixture/module hashes and hashes of full source reports. Full original reports additionally contain per-run CPU, first event/tool replay timings and memory endpoints; they are included in the delivered evidence archive. Their names are retained under `sourceArtifact`. These event timings are not model TTFT.

From the candidate repository root in a full checkout, create an isolated baseline worktree, then enter `harness-ui`:

```bash
git worktree add --detach ../talos-local-perf-base 13f65c15cdeaf8986b882993a0773cdeafb867d2
cd harness-ui
BASE=../../talos-local-perf-base/harness-ui/src/local-runtime-llama-server.mjs
node --test tests/local-runtime-llama-server.test.mjs tests/local-runtime-stream-fragments.test.mjs
node --expose-gc scripts/bench-local-runtime-stream.mjs --baseline "$BASE" --base-sha 13f65c15cdeaf8986b882993a0773cdeafb867d2 --scenario tool-4096,tool-16384,tool-65536 --warmups 3 --repetitions 31 --output tools-ab.json
node --expose-gc scripts/bench-local-runtime-stream.mjs --baseline "$BASE" --base-sha 13f65c15cdeaf8986b882993a0773cdeafb867d2 --scenario tool-262144 --warmups 2 --repetitions 15 --output stress-ab.json
node --expose-gc scripts/bench-local-runtime-stream.mjs --baseline "$BASE" --base-sha 13f65c15cdeaf8986b882993a0773cdeafb867d2 --scenario text-1024 --warmups 15 --repetitions 121 --output text-ab.json
node --expose-gc scripts/bench-local-runtime-stream.mjs --baseline "$BASE" --candidate "$BASE" --base-sha 13f65c15cdeaf8986b882993a0773cdeafb867d2 --scenario text-1024 --warmups 15 --repetitions 121 --output text-aa.json
```

These shell commands use POSIX syntax; the JavaScript benchmark has no shell dependency and accepts equivalent absolute paths on Windows. No actual model is started by this harness. Full `npm run verify:all` and desktop `npm test` still need execution with the actual dependency tree and Electron; they were inspected but not run in this partial snapshot.

## Correctness, decisions and rollback

The five unchanged adapter tests pass on baseline. Of twenty new regressions, ten fail and ten pass on baseline; all twenty pass on candidate. Candidate combined suite: **25 passed, zero failed**. Tests cover fragmented identity/names, interleaved calls, ID/index collisions, scalar-prefix correctness, trailing garbage, finish without delta, ordinary EOF, malformed SSE/JSON, one-byte UTF-8, reasoning/tagged fallback, cancellation before/during/between buffered emissions, request cancellation cleanup, sequential reuse, 100 deterministic Unicode fragmentation patterns, and the large-call single-parse complexity contract.

| Experiment | Result | Decision |
|---|---|---|
| Deferred single validation with stable fragment identity | Large-call replay improved; targeted correctness passes | KEEP in draft, pending integration/hardware gates |
| Initial text control | Median +5.66%, noisy interval | REVISE measurement protocol; retain raw data |
| Longer final text A/B and identical A/A | +0.37% median; residual uncertainty remains | Keep as control and risk, not a speedup |
| Broader SSE parser rewrite, async probes, fit/cache policy, speculative tuning, upstream binary upgrade | Not implemented or A/B tested | DEFER; do not call these failed or reverted experiments |

No production experiment was implemented and then reverted; inventing a rejected result would violate the evidence discipline. Upstream reconnaissance and source inspection are not benchmark evidence.

Risks: native calls intentionally emit later, at a completion boundary; ordinary EOF remains a compatibility fallback rather than proof of a successful model stop. Per-fragment arrays may change memory overhead. Conflicting/malformed upstream identities need broader integration coverage. Tagged fallback parsing, SSE framing and old cancellation-listener fallback remain outside this patch. The local session tool execution gap is unresolved. There is no model-quality, backend or end-to-end latency validation.

Rollback: revert the production-file change; benchmark/tests/docs can remain. This restores the baseline assembly defects too. No settings, persistent data formats, model files, package pins or migrations are changed. No feature flag or auto-tuning is introduced.

## Upstream reconnaissance (17 September 2026)

Desktop packaging remains pinned to **b10517 / dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe**, for both CPU and Vulkan. The upstream default-branch head observed through GitHub was **b49650adb31f2e49a0d76113aeb1792134fd8413** (17 September 2026, 11:53:54 UTC). The latest-release page inspected showed v0.4.1 (14 September). Upstream PR [25819](https://github.com/ggml-org/llama.cpp/pull/25819) was still open and draft; its author explicitly describes a mitigation, not a root-cause fix, for ngram-mod's stuck-loop behavior. This makes an unmeasured speculative-policy or binary upgrade inappropriate here. No claim is made that the current pin is optimal or safe in every workload. Complete server/Vulkan/fitter/batching/KV/Windows/packaging gap analysis and an isolated upgrade A/B remain undone.

## Answers to the twenty review questions

1. **Fitter passes:** f16 first, q8 only if f16 is not full offload, then cached; cost and safe reduction unmeasured.
2. **Synchronous probes:** inspected `spawnSync` blocks the backend JavaScript thread when invoked; duration unmeasured.
3. **Context agreement:** not independently validated; no context-policy patch.
4. **Final GPU context rationale:** not independently validated; historical comments are not this run's evidence.
5. **Optimal -ngl:** not measured; no optimality claim.
6. **Fitter output:** inspected code extracts -ngl for KV choice; broader use requires capability/fit measurements.
7. **Second-turn token reuse:** unavailable.
8. **Explicit cache reuse:** inspected llama adapter body does not send a cache-reuse control; server-side reuse unmeasured.
9. **First-turn speculation penalty:** unavailable; code-comment measurements were not reused as new results.
10. **Acceptance/speedup:** unavailable on real models.
11. **Adaptive speculation:** no evidence to change existing static policy; no patch.
12. **Parser CPU relative to inference:** adapter replay CPU measured; inference denominator unavailable.
13. **Fragmented JSON complexity:** confirmed by parse-call/character counts and scaling; patched.
14. **Tool schemas:** inspected local session/adapter send neither native schemas nor tool_choice; complete upstream prompt construction unverified, so prompt encoding cannot be ruled out globally.
15. **Orchestration overhead:** actual tool execution/continuation absent in inspected local function; no roundtrip metric claimed.
16. **Same-model useful state:** not measured; adapter request-local assembly state does not leak across tested sequential calls.
17. **Reload causes:** not fully traced.
18. **Switch cost:** unavailable.
19. **CPU fallback:** unchanged but not independently exercised in this environment.
20. **Largest low-risk gain:** fragmented argument assembly is the only measured retained production bottleneck here; cannot rank it against unmeasured startup/prefill/decode.

## Merge readiness

**Draft only, not merge-ready; the original end-to-end mission is incomplete.** Remaining gates include full backend/desktop/packaging tests; real CPU/Vulkan and fallback runs across representative models/quantizations/contexts; true cold/warm loading, fit probes, TTFT/TTFV, prefill/decode, prefix reuse and memory peaks; shared-kernel local tool dispatch/permission/result/continuation integration; and frontend-visible timing. This patch supplies a measured component improvement, not a claim that TALOS as a whole is faster. Do not merge, tag, release or enable auto-merge.
