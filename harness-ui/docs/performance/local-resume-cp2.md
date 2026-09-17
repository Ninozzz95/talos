# CP2 — explicit writer synchronization

Parent checkpoint: `eb52976adee856bee2dae02092e0b8e2cff2d304` (CP1). Draft PR #31; no production behavior changes in this block.

## Observed failure

Windows CI run [35258343242](https://github.com/Ninozzz95/talos/actions/runs/35258343242), job [105327501662](https://github.com/Ninozzz95/talos/actions/runs/35258343242/job/105327501662), reported one backend test timeout: `bounded sink reserves queued bytes synchronously and reports dropped writes`, 5027.998 ms, 5000 ms test timeout. Reported backend totals: 1395 tests, 1394 passed, 1 failed, 0 skipped. Kernel step was skipped after that failure. Other eight jobs succeeded. This is a recorded failed run, not replaced with the earlier local green result.

The exact Windows scheduling cause is not established. The old test used `setImmediate` before calling a release callback installed by a mock writer. CP2 removes that timing assumption: gates exist before enqueue, writer-start is explicitly acknowledged, `flush()` is asserted pending, and `finally` always releases the writer. The timeout is NOT increased and no assertion is removed.

## Fresh local checks

Node v22.16.0, Linux x64, using hash-verified recorder/observer/prefix and archived baseline adapter sources. Command from harness-ui:

```sh
node --test tests/local-resume-sink.test.mjs tests/local-runtime-llama-server.test.mjs
```

9 tests passed, 0 failed, 0 skipped. One test performs 100 deterministic writer-gate repetitions. Other tests cover serialization, disk reservation after writes complete, contained write failure, actual filesystem byte equality, plus five existing adapter tests. The TAP is committed as `local-resume-cp2.tap`.

The changed original integration test was syntax-checked locally. Its complete dependency graph and the full Windows suite are not represented by the isolated nine-test run: the new CI must verify those separately. No GGUF/GPU inference or 86-second reproduction is claimed.

## Next bounded block

Restore the existing benchmark from its uploaded Git blob, produce fresh raw paired measurements, and commit the evidence immediately. Keep historical missing raw files marked unavailable; never reconstruct them as original evidence. Then re-read CI and update the main checkpoint index and protocol. No merge/release/tag/history rewrite.
