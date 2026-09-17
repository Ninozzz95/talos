# Local kernel implementation ledger

Base: `13f65c15cdeaf8986b882993a0773cdeafb867d2`, checked on 2026-09-17.
Scope: the desktop local-agent path. Draft only; do not merge, release, tag or enable auto-merge. PR #28 is independent and untouched.

## WP00: establish the actual boundary

`runtime-owner-adapter.mjs` already passes an injected `fetchDiRete` to `talosLavora`. `model-destination.mjs` resolves `local:` through the authenticated supervisor request, without copying its secret. The existing local session path must be connected to that shared kernel rather than adding another executor. This is source evidence, not proof that the complete agent path works.

The first commit adds a read-only provenance command, tests, and a scoped CI job. The provenance report hashes the seven critical source files, uses Git blob framing with UTF-8 byte length, records the Node/platform environment, and marks `realInference: false`. Missing source files fail instead of producing a misleading complete snapshot. No model, prompt, credential or environment-variable dump is collected.

Local bootstrap validation: Node 22.16.0, three new provenance tests and five unchanged adapter tests passed (8/8). The local checkout is initially a partial, previously hash-verified source snapshot because this environment cannot resolve GitHub DNS. CI preserves its exact tracked source and TAP output as a reproducibility artifact; source-export success is not an application test result.

## Implementation sequence

1. Inspect the actual registry/service/owner/kernel call chain and establish the baseline.
2. Route local sessions through the existing provider-neutral kernel, preserving approval, hooks, stop and tool-result continuation.
3. Add integration tests with a deterministic loopback provider and real temporary filesystem effects; label them as fixture inference.
4. Measure orchestration separately from model inference, and retain raw evidence.
5. Keep the PR draft until application and real-model/hardware gates are satisfied.

## Not yet delivered by the bootstrap commit

No production routing change, no real-model benchmark, no inference speedup, no new speculative algorithm, no changed llama.cpp pin, no CPU/Vulkan qualification, and no packaging validation. Subsequent commits update this ledger with actual results.
