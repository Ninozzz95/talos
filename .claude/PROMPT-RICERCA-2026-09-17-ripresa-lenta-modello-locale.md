# Research prompt — resuming a conversation on a LOCAL model takes far too long (prefill / prefix reuse)

> Written 2026-09-17 by the desktop-lane session for the owner's research agent (the one that produced draft PRs #28 and #30 on
> `Ninozzz95/talos`). Same evidence discipline as those two reports: measured vs read, nulls instead of guesses, no invented
> rejected experiments, a draft PR with a patch only if a change is measured and bounded.

## The symptom (seen by the owner, 2026-09-17, desktop app, live server)

A session on a local GGUF model («GLM 4.7 Flash Q4_K_M», llama-server through TALOS's supervisor), workspace `C:\` with full
access. The owner reopens the conversation and sends a short follow-up («che giochi ho?»). The chat sits on «Ci sta mettendo più
del solito — resta in attesa…» for **86 s and counting** before the first token. The same happens every time a local conversation
is resumed; a fresh short chat on the same model is much faster.

## Working hypothesis (NOT measured on this case — that is your job)

The wait is **prompt prefill**, not decode: on resume the whole conversation is re-sent (TALOS's preamble ≈ 2,900 tokens + the
full history + tool results — here directory listings of `C:\`, which are large), and the local engine re-reads all of it
because the KV/prefix cache is not reused. Possible reasons, each to be confirmed or refuted with a measurement:

1. The adapter never asks the server to reuse the cache. Your own PR #28 report, review answer 8: «inspected llama adapter body
   does not send a cache-reuse control; server-side reuse unmeasured» (`harness-ui/src/local-runtime-llama-server.mjs`, the body
   is `{ model, messages, stream, max_tokens, reasoning_effort?, reasoning_format? }`).
2. The prefix is not byte-stable between turns: if anything early in the prompt changes (a timestamp, the project-context map,
   the tool list order, the permission line, a «resume» note), the common prefix is short and the server discards the rest.
3. The engine was restarted or reloaded between the two turns (model switch, idle stop, app restart), so there is no KV to reuse.
4. A single slot is shared and another request (title, compaction, a probe) evicted it.
5. The context is larger than the configured `-c`, forcing a context shift / re-evaluation.

## What already exists and is measured (do not re-derive)

- 2026-09-10, mobile lane, measured: first token **33.9 s** (LFM2) and **3.1 s** (gemma) with TALOS's **2,877-token** preamble,
  against **351 ms** for PocketPal with a 25-token system prompt; in generation TALOS was 2.2× ahead (21.6 vs 9.69 t/s).
  Owner's binding target: **first token under one second WITH the agent on** — compare at equal prompt; switching the agent off
  to win is changing the product.
- Owner's rule (2026-09-11): **no default or «recommended» model as a cure** — every heuristic must hold for ANY GGUF, read from
  the file and measured on the device.
- There are TWO local paths (your PR #30 report): `session-registry.mjs` → `eseguiRuntimeLocale` (one-shot `generateStream`, no
  tools executed — tracked as BC-76) and the shared kernel path with a `local:<id>` model through `creaFetchInstradata` →
  `chiamaLocale` → supervisor. Establish FIRST which one the owner's resumed session takes, and measure that one.
- The supervisor launches llama-server with `--jinja` (`llama-server-supervisor.mjs:512`), an API key, and the speed levers
  chosen by the fit probes (KV type, speculative). PR #28 and #30 are applied on the desktop lane (`93650914`, `2a0350a9`).
- llama.cpp pin: `b10517 / dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`, CPU and Vulkan.

## Questions to answer, with numbers

A. **Where do the 86 s go?** Split one resumed turn into: request build → HTTP send → server prompt processing (tokens and
   ms, from the server's own `timings` / `prompt_n`, `prompt_ms`, `cache_n` fields or its log) → first token → decode. Report
   prompt tokens evaluated vs prompt tokens reused from cache. If the server exposes them, use them; do not estimate.
B. **Is the prefix stable?** Dump the exact `messages` of turn N and turn N+1 of the same session (and of a session resumed
   after an app restart) and report the length of the common token prefix and the FIRST byte that differs, naming which part of
   the prompt produced it (preamble section, project map, time, tool list, permissions…). This is the most valuable table.
C. **What does llama-server offer today for reuse?** Read the pinned version's `tools/server/README.md` (and the current
   upstream one, dated): `cache_prompt`, `n_cache_reuse` / `--cache-reuse`, slots and `id_slot`, `--slot-save-path` with
   `/slots/{id}?action=save|restore`, `--keep`, context shift, `--parallel`, the prompt-cache RAM option if present. For each:
   default, cost, what it needs from the client, and whether the pinned build has it. Cite source and date.
D. **What would each lever buy?** Measured A/B, smallest first: (1) ask for cache reuse in the request body, (2) make the
   prefix byte-stable (move volatile parts to the END of the prompt or out of it), (3) pin the session to a slot, (4) save and
   restore the slot's KV across engine restarts / session switches, (5) a shorter preamble for local models WITHOUT switching
   the agent off. For each: first-token time before/after on a resumed conversation of realistic length (include a long
   tool-result history), prompt tokens evaluated before/after, memory/disk cost, and the failure mode.
E. **What do the others do?** PocketPal first (it is the owner's benchmark), then llama.cpp's own web UI, LM Studio, Jan,
   Ollama, Open WebUI: how do they keep a resumed chat fast (slot reuse, KV save to disk, prefix caching)? Read code where it is
   open; cite commit and date.
F. **Correctness risks** of reuse: a reused KV after the template or the tool list changed; two sessions on one slot; a
   restored slot for a different model/quantisation/context size; privacy of a KV file on disk (it contains the conversation).

## Constraints

- Desktop lane only: `harness-ui/` (adapter, supervisor, the prompt construction). Do NOT touch `mobile/`, `core/`, the CLI lane,
  or the kernel's tool loop; do not add a second tool executor; do not change prompts' MEANING to win a benchmark.
- No model, quantisation or template is «recommended» as the cure. Any heuristic must be read from the GGUF / the server and
  hold for an arbitrary model.
- If no GGUF or GPU is available in your environment, say so: deliver the instrumented harness and the protocol so the owner's
  machine can produce the numbers (as you did for #28/#30), and mark every real-model metric as unavailable — never zero.
- Missing metrics are null. Fixture timings are not model timings. A retained change needs an A/B with paired samples and a
  declared protocol; text-streaming and tool-call behaviour must be shown unchanged (the suites of #28/#30 are the regression net).
- Draft PR only, not merge-ready, with: the architecture note, the evidence archive, the rollback, the merge gates, and the
  answers to A–F. The desktop lane will re-verify on Windows before applying, as it did for #28 and #30.
