# Local patches on the pinned llama.cpp

`mobile/third_party/llama.cpp` is a submodule whose `origin` is the real
upstream (`ggml-org/llama.cpp`) — there is no TALOS-controlled fork to push a
commit to, so a patch here is not committed *inside* the submodule (it would
be an unreachable commit on a fresh clone). It is applied as a plain diff on
top of the pinned SHA instead, exactly as anticipated in
`.claude/DECISIONE-0.1.17.md` §3: "come patch locale sul nostro pin funziona
identica, al costo di riapplicarla a ogni aggiornamento del motore."

## Applying

From `mobile/third_party/llama.cpp`, after `git submodule update`:

```bash
git apply ../patches/0001-opencl-abort-callback.patch
```

`git apply --check` first if you only want to confirm it still applies
cleanly against the current pin.

## What's here

- **`0001-opencl-abort-callback.patch`** — F-15 / decision 3 from
  `DECISIONE-0.1.17.md`: wires `ggml_backend_set_abort_callback` for the
  OpenCL backend (Metal already has it; OpenCL's `get_proc_address` was
  `NULL`). See that document's decision-3 section for the measured numbers
  and why the check is gated on the batch being multi-token.

⛔ **Reapply after any submodule bump.** This is not tracked by the pin
itself — if `mobile/third_party/llama.cpp` moves to a new SHA, re-run
`git apply --check` and hand-port anything that no longer matches.
