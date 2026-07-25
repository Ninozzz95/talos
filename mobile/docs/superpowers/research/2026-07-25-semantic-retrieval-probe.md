# Semantic retrieval probe — on-device measurement

**Status: round 1 measured on device (OnePlus PJZ110, Android 16, Chrome 146
WebView, WebGPU AVAILABLE). Three arms failed and must be re-run; the chunking
question was not measured at all — round 2 is required before the decision.** Owner gave the go on
2026-07-25 ("VIA AL TEST") as step 1 of the agreed order (probe → the six
defects → tools).

## The question this answers

The Library ranks documents with a keyword scorer (`rankLibraryDocs`,
BM25-lite). It cannot match "ricevuta" to a document that says "fattura". The
question is not *whether* semantic retrieval is better — it is whether it is
**usable inside an Android WebView**: download weight, cold start, indexing
throughput, query latency, memory, and how much accuracy it actually buys on
Italian text. A laptop measurement would answer none of that.

## Method

- Separate Vite build (`vite.probe.config.ts` → `dist/probe/`). The app never
  imports it; initial JS stayed byte-identical at 506,865 B.
- Runtime: `@huggingface/transformers` 4.2.0 (v4 WebGPU runtime, rewritten in
  C++; `onnx-community` is the org the v4 release recommends). WebGPU when the
  WebView exposes it, WASM otherwise — the probe records which one it used.
- Corpus: 24 Italian documents, 24 queries, one known-relevant document each.
  **Adversarial by construction**: every query avoids the words its target
  document uses, and the distractors share vocabulary with the queries. This
  measures keyword search where it fails, not where it flatters itself.
- Each family gets the prompt shape from its own model card (e5
  `query:`/`passage:`, EmbeddingGemma `task:`/`title:`, Qwen3 `Instruct:`).
  A single shared template would rig the comparison.
- Metrics per arm: MB downloaded, load ms, index ms and chars/s over the
  corpus, query p50/p90 ms, recall@1, recall@3, MRR, JS heap.

## Arms

| id | model | why it is in |
|---|---|---|
| baseline | the app's current keyword ranker | the number every other arm must beat |
| e5s | `Xenova/multilingual-e5-small` q8 | the pragmatic pick: small, multilingual, widely deployed |
| e5l | `Xenova/multilingual-e5-large` q8 | how much a 5x bigger model of the same family buys |
| gte | `onnx-community/gte-multilingual-base` q8 | 70+ languages; known risk: transformers.js may reject its model class |
| gemma4 | `onnx-community/embeddinggemma-300m-ONNX` q4 | best open model under 500M on MTEB, compressed |
| gemma8 | same, q8 | what precision costs in time and buys in accuracy |
| qwen3 | `onnx-community/Qwen3-Embedding-0.6B-ONNX` q4 | the heavyweight — the owner has a high-end phone and asked to push the ceiling |
| minilm | `Xenova/all-MiniLM-L6-v2` q8 | English-only speed floor, not a serious candidate for Italian |

**Rejected with reason:** `minishlab/potion-multilingual-128M` — static
embeddings, ~500x faster on CPU and the natural choice for a phone, but the
official ONNX export is 512 MB (`model_type: model2vec`) and there is no
supported JavaScript loader today. Revisit if an int8 export with a JS path
appears; the win on battery would be large.

## Results — round 1 (device: PJZ110, Android 16, WebGPU on)

| arm | MB | load (incl. download) | index 24 docs | chars/s | query p50 | recall@1 | recall@3 | MRR | heap |
|---|---|---|---|---|---|---|---|---|---|
| **keyword (today)** | 0 | — | — | — | 0.5 ms | **0.46** | 0.54 | 0.526 | — |
| **e5-small q8** | 118 | 29.3 s | 6.5 s | 726 | 110 ms | **0.83** | 0.96 | 0.899 | 123 MB |
| **e5-large q8** | 562 | 65.3 s | 41.5 s | 114 | 584 ms | **1.00** | 1.00 | 1.000 | 123 MB |
| **gte-multilingual-base q8** | 340 | 61.6 s | 21.3 s | 223 | 330 ms | 0.75 | 0.92 | 0.846 | 123 MB |
| EmbeddingGemma q4 | — | — | — | — | — | — | — | — | **FAILED** |
| EmbeddingGemma q8 | — | — | — | — | — | — | — | — | **FAILED** |
| Qwen3-Embedding-0.6B q4 | — | — | — | — | — | — | — | — | **network error** |
| all-MiniLM-L6-v2 q8 | — | — | — | — | — | — | — | — | **network error** |

### What the numbers say

1. **The current search fails more often than it succeeds.** On a corpus built
   to expose it, keyword ranking puts the right document first 46% of the time.
   That is the number every design decision here answers to.
2. **e5-small is the value pick**: 0.46 → 0.83 recall@1 and 0.96 in the top
   three, for 118 MB and 110 ms per query, with WebGPU doing the work.
3. **e5-large is the accuracy ceiling and a trap**: perfect recall, but it
   indexes at 114 chars/s. A real 200 KB library would take ~30 minutes of
   grinding — and 562 MB to download first. Query latency (584 ms) is on the
   edge of feeling broken. Not shippable as the default.
4. **Indexing throughput, not query latency, is the binding constraint.** Every
   candidate answers a query fast enough; what separates them is how long the
   phone must chew before the feature exists at all.
5. **EmbeddingGemma is blocked by the device, not by us**: `MultiHeadAttention`
   needs 65,536 bytes of workgroup storage and this GPU allows 32,768. That is
   an ORT WebGPU shader limit — the same model may run on the WASM backend, and
   round 2 must try exactly that before the best-in-class model is written off.
6. **Two arms never ran** (network). No conclusion may be drawn about them.

### Caveats that must not be laundered into conclusions

- `load` includes the download, so it is a FIRST-RUN number. The warm cost —
  what the user pays on every later launch — was not isolated. Round 2 must
  measure it (the models are already in the browser cache).
- The gte result may be my mistake, not the model's: it was pooled with `mean`
  while the gte family uses CLS pooling. Do not conclude "gte is worse".
- Corpus documents are ~200 characters. **Real Library documents are pages
  long**, which is exactly where chunking, overlap and per-chunk scoring
  decide everything — and none of that was measured.
- No hybrid arm: keyword and semantic were compared, never combined. With a
  0.46 baseline and 0.83 semantic, fusion is the obvious next measurement.

## Round 2 — what has to be measured before deciding

1. **Warm start**: re-run e5-small with the model already cached → the real
   per-launch cost.
2. **EmbeddingGemma on WASM** (and gte with CLS pooling): give the two
   strongest models a fair shot on this device.
3. **Long documents + chunking**: 800-character chunks with overlap over
   page-length Italian documents — the shape of the real Library.
4. **Hybrid fusion** (keyword + semantic, reciprocal rank): almost free to
   measure, and it is what production RAG actually ships.
5. Retry Qwen3 and MiniLM.

## Decision (to be written with the numbers in hand)

The recommendation must answer four things explicitly:
1. which model ships (or that none does, and why),
2. whether WebGPU was available or the WASM path is what we must design for,
3. chunk size and whether the hybrid keyword+semantic fusion is worth it,
4. what the download consent screen must say — the owner chose "downloaded on
   first use, with explicit consent and the size stated".
