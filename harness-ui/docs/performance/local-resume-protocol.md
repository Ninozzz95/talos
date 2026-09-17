# Local resume diagnostic protocol

Scope: Draft PR31 on the current main route, with optional PR28/30 component changes. PR29's bound kernel transport is not covered until the integration blocker in CP5 is fixed. This protocol does not enable a new executor, change inference options or qualify a model.

## Activation and privacy

Use an isolated, private absolute directory outside the repository and cloud-synced workspaces. Use the existing development launch procedure with a compatible Node/runtime environment; the stable installed application is not silently patched by this PR. Record exact TALOS commit, binary/model hashes, existing flags, context length, backend/driver, process generation and session before collecting evidence. Do not download or substitute a model for this experiment.

PowerShell example for metadata-only capture; replace the session ID with the existing selected session:

```powershell
$env:TALOS_RESUME_DIAGNOSTICS_DIR = Join-Path $env:LOCALAPPDATA 'TALOS-Resume-Diagnostics'
$env:TALOS_RESUME_DIAGNOSTICS_SESSION = '<existing-session-id>'
Remove-Item Env:TALOS_RESUME_CAPTURE_RAW -ErrorAction SilentlyContinue
```

The exact raw opt-in variable is **TALOS_RESUME_CAPTURE_RAW**, not TALOS_RESUME_DIAGNOSTICS_CAPTURE_RAW. Set it to `1` only with explicit operator consent and the exact session selection above. Restart the development backend so it inherits the environment. A raw flag without an exact selected session must not create a private request capture.

The recorder creates `run-* / events.jsonl` and a `private/` subdirectory. Private request JSON contains the actual complete conversation/tool schema and may contain secrets from source text. **Do not publish the private directory or .resume-key.** Metadata uses keyed identities, not encrypted conversation storage. POSIX modes do not certify Windows ACLs; verify access on the owner's machine. Metadata-only operation can still retain a bounded selected body in process memory for comparison; it is not a promise that plaintext never enters memory.

Current recorder bounds: 4 MiB/request body, four previous entries / 16 MiB previous-body bytes, 8 MiB queued writes, 128 MiB reserved disk bytes, 256 observed requests, 32 stream milestones/request. These are capture bounds, not a measurement of total peak heap. Dropped/error counters and unsupported/over-limit captures must remain visible; they do not block inference.

## Controlled cases

Record a baseline without the recorder, a normal next turn, a resumed turn using unchanged history and the same live model, a user stop followed by resume, and a process restart followed by resume. Separate these cases explicitly. A restarted process is not proof of a cold OS file cache. Never overwrite the user's real session/history to manufacture an identical baseline; use an explicitly approved isolated copy.

Keep model, quantization, prompt/messages/tool ordering, context/output budget and existing cache/speculation settings fixed. Include original failed/aborted trials. Pair comparable starting states, alternate A/B and B/A, separate warmups and retain every completed sample. Recorder-on versus recorder-off is an overhead comparison; it is not evidence that model inference became faster. Do not subtract a synthetic average recorder cost to invent an owner latency.

The measured record covers backend operation entry, supervisor call/send, response headers, observed stream milestones, consumer completion and process lifecycle where instrumented. Operation-entry-to-transport includes orchestration/context/readiness and must not be relabelled pure prompt construction. Backend content arrival is not browser paint. Consumer cancel may be adapter cleanup after DONE, not a user stop. Process stop return is not process close acknowledgement.

## Redacted report and offline prefix comparison

After orderly shutdown/flush, produce a new output file from exactly one run directory. Do not concatenate process boots or subtract their independent monotonic clocks.

```sh
node scripts/report-local-resume.mjs "ABSOLUTE_RUN_DIRECTORY" "NEW_REPORT.json"
node scripts/compare-local-resume.mjs "BEFORE.request.json" "AFTER.request.json" "NEW_PREFIX_REPORT.json"
```

The second command is offline by default and exports byte counts/first differences, not source text. First divergent wire JSON bytes, changed message content and changed tool/template fields are separate facts. A long byte prefix is not a tokenizer prefix and is not a historical KV hit.

Optional reconstruction accepts a literal loopback server URL and an explicit `true|false` add-special choice after the output path. It uses `/props`, `/v1/models`, `/apply-template` and `/tokenize`, not generation. Only use a deliberately authorized local endpoint with the same model/template/tokenizer identity; never extract or print an internally owned supervisor key. An explicitly supplied key is read from TALOS_DIAG_LLAMA_KEY, not a CLI argument. Leave this option unused when authorized identity/key evidence is unavailable; byte comparison still works.

Reconstruction happens now. It cannot establish historical tokens, actual cached-prefix reuse or identical implicit template date/time. Preserve `capturedRuntimeIdentityVerified:false` until external capture identity is reconciled. Multimodal inputs are refused rather than passed off as text-token equivalence. Native metrics remain under their source names; absent prefill/queue/KV/frontend values remain null, never zero or guessed values.

## Synthetic overhead reproduction

From harness-ui, with no model or provider credentials required:

```sh
node scripts/bench-local-resume.mjs "NEW_OVERHEAD.json" 61
```

This uses actual localhost HTTP, queued filesystem writes and the production adapter with deterministic synthetic SSE. It includes five warmup pairs separately and 61 measured pairs per scenario, alternating order and paired bootstrap. It is not a GGUF/GPU benchmark. Output/byte equivalence and write health are checked. End-of-run memory snapshots do not establish independent peak memory.

## Reviewer acceptance and rollback

Require source identities, byte/auth/signal/cancel parity, complete applicable CI, no hidden dropped writes, explicit overhead/memory review, approved real-model trials and real frontend timing before claiming the 86-second case solved. Reconcile PR29's bound-request path and the server/supervisor overlaps before combining all four PRs. No merge readiness follows from fixture success alone.

Disable by unsetting TALOS_RESUME_DIAGNOSTICS_DIR, TALOS_RESUME_DIAGNOSTICS_SESSION and TALOS_RESUME_CAPTURE_RAW and restarting. Remove TALOS_DIAG_LLAMA_KEY after any authorized reconstruction. Capture files remain on disk and require deliberate owner-controlled retention/deletion; disabling does not erase evidence. Full rollback reverts the diagnostic additions and server wiring. There is no data migration, model rewrite or inference-policy rollback.
