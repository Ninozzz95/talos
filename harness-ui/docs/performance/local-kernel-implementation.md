# Local kernel implementation — WP00 / first WP01 tranche

## Status and reproducibility

**Draft only. Default off. Not merge-ready. No real-model speedup is established.**

Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2` (main checked 2026-09-17).
Branch: `feat/desktop-local-kernel-pipeline`; PR #29, independent from #28.
Production commit: `e84f46223ce15a9864f069dc1f85ff9122310df5`.
llama.cpp before/after: **b10517 / dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe**, unchanged.

This implements the first correctness tranche, not the 32-function plan. It connects explicitly enabled llama.cpp sessions to the existing desktop agent kernel. No new agent executor, prompt shortening, model substitution, quantization change, launch tuning or speculative algorithm is introduced. No changes to `mobile/` or `context-engine/`.

The sandbox could not resolve GitHub DNS. A verified CI Git bundle and the lock-installed backend/context dependencies supplied a complete offline checkout and Node 24.20.0. The 13-file production patch was transferred with exact preimage/postimage SHA-256 checks, rerun in CI, and committed only to the feature branch. The one-use publication workflow and its payload are removed in the following commit. The retained workflow is read-only. No history was rewritten.

Production patch SHA-256: `73dba26f95c08ded970df8c2017bca4beef72d1605f2019615dbd1b26c1571c6`.
Unchanged canonical kernel SHA-256: `555d9c6190e671b81352aab0b51aa1ecf0cb2e82e021dbaa24f107320863e039`.
Unchanged desktop-hotfix kernel SHA-256: `864432fa844f949d0addfbfb502ab61a095bee56c55838b1e51c7ebbd31161dc`.

## Architecture found and connected

```text
server configuration: TALOS_LOCAL_AGENT_KERNEL=1
  -> session-registry: same shared session options, approvals, hooks and event sink
  -> createLocalKernelRunner
       -> bindModel(modelId): exact ready process entry and lifetime signal
       -> authenticated /props: explicit native-tool/template capability gate
  -> agent-service -> owner adapter -> existing desktop-hotfix/shared kernel
  -> injected localInference.fetch -> authenticated supervisor /v1/chat/completions
  <- bounded protocol guard: stream text/reasoning; withhold native calls until terminal
  -> shared permission/hook/executor -> correlated tool result -> next model request
  -> existing AG-UI/persistence -> final outcome
```

The ordinary owner path already accepted injected transport and routed `local:` through the supervisor. The old `provider: local` registry branch nevertheless used a one-request runtime adapter that displayed tool activity without executing tools or continuing. The fix connects that entry to the existing kernel rather than duplicating its tools.

## Retained code

### Process binding

`llama-server-supervisor.mjs:bindModel` captures the exact ready process entry, not only its alias/port. It owns a lifetime abort signal and exposes authenticated request/assertReady/release. Stop, exit and process errors invalidate bindings. Reusing the same alias and port after restart does not revive an old binding. Release is idempotent. This is not a memory scheduler, persistent KV handle or complete admission-control implementation.

### Native protocol boundary

`local-kernel-stream.mjs` uses the already locked eventsource-parser. Native arguments are accumulated by stable index with unique IDs and validated at completion. Syntactically valid prefixes do not execute. Tools are released only after a compatible `finish_reason` **and** `[DONE]`; EOF is not success on the new route. Invalid JSON/UTF-8, conflicting identities, limits and terminal inconsistencies fail closed. Text/reasoning remain streaming. CRLF and multiline SSE data are normalized for the unchanged kernel. Complete JSON responses and a bounded complete-message SSE form are supported. Abort/cancel releases the reader, including abort before the first pull.

Bounds: 1 MiB event text, 4 MiB accumulated tool text, 128 calls, 8 MiB complete JSON body. These protocol resource limits are not model output-token limits.

### Shared session bridge

`local-kernel-session.mjs` accepts only the selected `local:modelId`, keeps native tool schemas/choice, sampling and token budgets, and translates only supported reasoning preferences. It removes transport-only annotations without mutating canonical history. The supervisor, not the adapter or browser, owns the secret. The runtime instance is checked around requests and tool hooks. Invalidating the runtime also cancels the registry's original controller and pending approvals.

`agent-service.mjs` forwards a trusted local transport to the owner adapter. The owner skips multi-provider/fallback routing for that transport, while retaining existing description, image resolution and project-context boundaries. It does not query a remote model-capability catalog for this local trial. `server.mjs` and `config.mjs` expose the opt-in; default behavior remains unchanged.

### Explicit current exclusions

The trial refuses cloud fallback consent/provider lists, a different planner model, and external context-engine trial hooks. Delegation and Deep Research start return a typed unsupported result instead of silently creating another provider session. Unsupported or unknown template capabilities fail before generation. Multimodal quality is not qualified. This is therefore **not full feature parity** and is not ready as the default local mode.

Inference does not fall back to the cloud. This does **not** mean every tool is offline: explicitly configured network tools still have their existing behavior and policy. Existing filesystem/process controls are reused, not replaced with a new sandbox. Complete process-tree termination, crash recovery and exactly-once effects are not claimed.

## Tests executed

Local runtime: Linux x64, Node 24.20.0 from the verified CI environment.

| Scope | Observed result |
|---|---|
| New local-kernel stream/session/integration tests | **65 passed, zero failed** |
| Five selected existing shared-kernel suites | **589 passed, zero failed, one skipped** (590 total) |
| Provenance + unchanged local adapter tests | **8 passed** |
| Expanded selection including config.test on base and candidate | Same **625 passed, one failed, one skipped** on both |
| Desktop pure suite in incomplete desktop dependency environment | 51 passed, one failed, seven skipped; missing `js-yaml` |

The shared regression suites are session-registry, agent-service, model-destination, runtime-owner-adapter-fallback, and kernel-loop-locale-e-stop. The expanded selection's common failure is the existing Windows-path discovery assertion in config.test on Linux. It was reproduced on unchanged base; it is not hidden as a passing full suite. The desktop failure is a missing dependency because desktop dependencies were not installed in this offline environment; Electron/installer validation remains outstanding.

The new tests include a deterministic LLM fixture on real authenticated HTTP loopback through the actual registry, service, owner and desktop-hotfix kernel. Actual tools read a temporary file, request and receive approval, fix its contents, run an actual Node test subprocess, return tool results and produce the final response. Additional tests cover denial, control-file protection, fragmented native tools, stopped/malformed streams, cancellation during approval, model unload/restart binding, request identity, conversation continuation and default-off behavior. The fixture's subprocess removes inherited NODE_TEST_CONTEXT and asserts the real nested test output, avoiding a false green from a test runner that did not execute the verification.

Publication CI run **35248058718** reran the new/provenance/adapter tests and the selected shared suites, checked all source hashes, and successfully published the code. The final read-only workflow reruns contracts on Linux and Windows; inspect the checks for its actual conclusions rather than inferring them from this ledger.

`kernel:controlla` exited 0 on base and candidate in CI mode but reported that the external owner source was unreachable. This is not proof of equality with that unavailable worktree. The tracked canonical and desktop-hotfix kernel hashes are unchanged.

## Reproducible fixture A/B

```bash
# In a checkout with the unchanged locked backend/context dependencies installed:
node --test harness-ui/tests/local-kernel-*.test.mjs
node harness-ui/scripts/bench-local-kernel-loop.mjs \
  --baseline-root /path/to/unchanged-base-checkout \
  --iterations 31 --warmup 3 --out fixture-benchmark.json
```

**Simulated inference; actual HTTP, shared kernel, tools and persistence. Not a model benchmark.**

The baseline is the working original shared-kernel route using a cloud-classified `local:` model and fixture-only dummy key, loaded from actual base-commit source. Comparing with the old local route that omitted tool execution would be invalid. The candidate performs the same work through the bound local route, with no cloud key, a capability probe and terminal validation.

Three separate warmups, 31 measured pairs per scenario, alternating AB/BA, correctness asserted on every run. Measurement covers registry start through completion and persistence drain; fixture setup/load/cleanup are excluded. Each run has a fresh temporary workspace; paths/IDs differ but deterministic provider decisions and expected results do not. Auto-approval wait is included. OS caches are not flushed. Bootstrap uses 5,000 paired resamples, seed 0x13579bdf, for the ratio of medians. Tail numbers with 31 samples are exploratory.

Machine: AMD EPYC 9V74, 5 exposed logical CPUs, 6,236,913,664 bytes RAM, Linux 6.18.44, Node 24.20.0. No usable GGUF/GPU was used.

| Scenario | Base median ms | Candidate median ms | Change | 95% paired ratio interval |
|---|---:|---:|---:|---:|
| Read -> authorized write -> actual test -> final (4 model requests) | 192.834677 | 182.797053 | -5.2053% | 0.8927–1.0184 |
| Read -> final (2 model requests) | 22.376650 | 23.880435 | +6.7203% | 1.0160–1.1578 |

Read/write MAD: 16.609157 -> 10.748440 ms; exploratory p95: 235.028211 -> 246.747267 ms.
Read-only MAD: 0.786640 -> 1.477025 ms; exploratory p95: 28.433057 -> 30.468483 ms.

**Decision: KEEP as a default-off correctness trial; NOT accepted as a performance optimization.** The read/write interval includes no gain and its tail worsens. The read-only case adds 1.503785 ms (+6.72%), crossing the review trigger. The probe and safety boundary are plausible costs, but no isolated profile yet attributes the delta to one component. Default enablement remains blocked. Do not describe this tranche as a speedup.

Raw local report SHA-256: `305743df99ee91fdf3cfda03b37989d20a4a1a90d81d71baddefb5673edbe550`. The companion `local-kernel-fixture-results.json` preserves every paired elapsed value, summary, source identity and raw-report digest. The delivered evidence archive retains full milestones and TAP logs. Independent CI measurements are artifacts, not replacements for these observations.

The original local benchmark's candidate Git HEAD was d04ba87 with the exact production patch in the worktree. Its source hashes match production commit e84f462. The base's dirty marker is from untracked node_modules symlinks only; tracked base source was unchanged. These provenance details remain visible, not relabeled as a clean benchmark at a later commit.

## Review answers and remaining gates

No fitter, launch, KV, context, backend selection, model cache or speculative policy was changed. Fitter repetition/blocking, optimal ngl/context, real prefix reuse, first-turn speculative penalty/acceptance, memory pressure and actual model switching latency remain **unmeasured**. This tranche adds a request-bound process lifetime, not faster model loading or model reuse. CPU/Vulkan numerical behavior is not independently qualified. The existing adapter in PR #28 is untouched.

Native tool schemas now reach the selected local model through the existing kernel; they are not recreated as a second tool catalog here. Actual tool results and continuation are exercised by the fixture. Loopback orchestration timing is available above; real TTFT, TTFV, prefill/decode, inter-token cadence, frontend paint and peak RSS/VRAM remain unavailable. No universal hardware/model claim is supported. No performance experiment was implemented and then reverted; rejected designs and test-fixture repairs are not invented benchmark reverts.

Before broader use: actual b10517 capability/template observations; representative real-model tool/cancel/quality cases; CPU/Vulkan/fallback; default application and Electron gates; local context/delegation contracts; end-to-end latency and peak memory; review of the read-only overhead. Subsequent exact-prefix/residency and speculative work should use this correct tool loop as one workload, not skip these gates.

## Opt-in and rollback

Set `TALOS_LOCAL_AGENT_KERNEL=1` before starting the development backend/app, with a selected llama.cpp model already ready. Missing/0 keeps the old path; other values are rejected. The trial requires affirmative native-system/tools/tool-call template capabilities. It does not download, reload or replace a model to pass qualification.

To disable, unset the variable or set it to 0 and restart. This removes the trial from new sessions without changing model files, persistent formats or package pins. Reverting the production commit also restores the original route; the tests and benchmark may remain. **Do not merge or release this Draft PR.**
