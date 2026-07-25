# Semantic retrieval probe — on-device measurement

**Status: harness shipped, awaiting device numbers.** Owner gave the go on
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

## Results

_Pending: the owner runs the probe on the device and pastes the JSON back._

| arm | MB | load ms | index ms | query p50 | recall@1 | recall@3 | heap MB |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Decision (to be written with the numbers in hand)

The recommendation must answer four things explicitly:
1. which model ships (or that none does, and why),
2. whether WebGPU was available or the WASM path is what we must design for,
3. chunk size and whether the hybrid keyword+semantic fusion is worth it,
4. what the download consent screen must say — the owner chose "downloaded on
   first use, with explicit consent and the size stated".
