# CP3 — retained raw diagnostic-overhead measurements

Parent: `6ed0b757aa30b59384cc92022479e6059997298c`. Draft PR #31. No production change in this checkpoint.

## Evidence identity

Fresh run after the transient directory reset, generated 2026-09-17T18:36:13.377Z. This is not a reconstruction of the unavailable older raw reports.

- Benchmark Git blob: `80be8f974df9cb6869e1ebbb7b86db6425f2a171`.
- Compressed report: `local-resume-cp3.raw.json.br`, 20,305 bytes, SHA-256 `f8cc4e0dac4917bf771d8203cec302b7daf9795f5268ccc634cf52490d8e6d9c`.
- Decompressed JSON: 284,941 bytes, SHA-256 `8756e515e21710d8d9324bec67e6c5d46c110df56ab9cc2bf86ab6b1f2b17e11`.
- Linux x64, Node v22.16.0, AMD EPYC 9V74, five logical CPUs exposed, 6,236,913,664 bytes RAM.

The JSON preserves every measurement, source hash and scenario. Decode from this directory with Node's built-in zlib:

```sh
node --input-type=module -e "import{readFileSync,writeFileSync}from'node:fs';import{brotliDecompressSync}from'node:zlib';writeFileSync('local-resume-cp3.raw.json',brotliDecompressSync(readFileSync('local-resume-cp3.raw.json.br')))"
```

## Protocol and results

61 measured pairs per scenario; five excluded warmup pairs; alternating AB/BA; 2,000 paired bootstrap resamples. Real localhost HTTP, actual runtime adapter and queued filesystem writes; deterministic synthetic SSE, NO model inference. Directory creation excluded; stream latency and final flush are reported separately. End-memory snapshots are NOT independent peak memory.

| Scenario | Baseline median ms | Recorder median ms | Paired ratio 95% interval | Recorder including flush median ms |
|---|---:|---:|---|---:|
| 1,024-frame stream, metadata | 9.632632 | 14.503934 | 1.4761–1.5554 | 15.846313 |
| 128 KiB history, metadata | 1.836711 | 5.616824 | 2.8768–3.0858 | 6.832481 |
| 1 MiB history, private capture | 5.872676 | 27.033352 | 4.3754–4.6471 | 28.705626 |
| Identical disabled A/A stream | 10.747140 | 10.623363 | 0.9688–1.0125 | 10.625076 |

This recorder has measurable overhead: approximately +4.87 ms for the stream and +21.16 ms for the large captured request in these fixtures. It is kept default-off for diagnosis, NOT promoted as a performance optimization. Real-model TTFT, prefill, cached tokens, frontend paint and peak VRAM remain unavailable. No claim resolves the owner's 86-second case.

## CI correction and next block

The complete CP2 desktop-core log (run 35259741450, job 105332171207) reports 3,101 tests: 3,062 pass, one fail, 38 skip. All diagnostic tests including the writer gates pass. The failing test is BC09 cleanup classification, identifying diagnostics/report/sink test files. The earlier conversation attribution to sendMessage/resume was incorrect and is withdrawn; no production patch is justified by that attribution.

Next checkpoint classifies the cleanup sites according to the existing repository policy, preserving lifecycle-failure visibility, then verifies current CI separately. Mobile also failed in that run and requires inspection, not an unsupported claim that this desktop change caused it. No mobile changes, merge, release, tag, auto-merge or history rewrite.
