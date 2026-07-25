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

## Results — round 2 (same device, chunks 800/150, best-chunk scoring)

| arm | backend | MB | cold / warm start | index (long) | chars/s | query | R@1 short | R@1 long | R@1 hybrid |
|---|---|---|---|---|---|---|---|---|---|
| keyword (today) — short | — | 0 | — | — | — | 0.4 ms | **0.46** | — | — |
| keyword (today) — long | — | 0 | — | — | — | 0.2 ms | — | **0.50** | — |
| **e5-small q8** | webgpu | 118 | 2.6 s / **1.35 s** | 11.7 s | 1518 | 111 ms | 0.83 | **0.83** | 0.72 |
| **gte-base q8 (CLS)** | webgpu | 340 | 2.0 s / **1.43 s** | 41.6 s | 427 | 272 ms | 0.96 | **1.00** | 0.78 |
| EmbeddingGemma q4 (CPU) | wasm | — | — | — | — | — | — | — | **FAILED** |
| Qwen3-0.6B q4 | wasm | — | — | — | — | — | — | — | **FAILED** |
| e5-large q8 | wasm | — | — | — | — | — | — | — | **FAILED (harness fault)** |

### What round 2 settled

1. **The per-launch cost is 1.35 s, not 29 s.** Round 1's load time was almost
   entirely download. Warm start is what the user actually pays, and it is
   acceptable.
2. **Round 1 was unfair to gte, and it was my fault.** Pooled with CLS as its
   family requires, gte goes from 0.75 to 0.96 on short documents and **1.00 on
   page-length ones**. The round-1 number must never be quoted again.
3. **Chunking works, and long documents are EASIER than short notes** for the
   semantic ranker: e5-small indexes long documents at 1518 chars/s versus 809
   on notes (longer sequences amortise the per-call overhead), and best-chunk
   scoring keeps the answering paragraph from being diluted.
4. **Naive hybrid fusion makes things WORSE, and this is the round's most
   valuable finding.** Reciprocal rank fusion with equal weights drags a strong
   semantic ranking down towards a weak keyword one: e5-small 0.83 → 0.72 on
   long documents (0.83 → 0.54 on short), gte 1.00 → 0.78. Textbook advice says
   "always hybrid"; on a corpus where the keyword ranker is near-random, equal
   weighting is actively harmful. Note the nuance: hybrid *improves* recall@3
   (0.89 → 0.94 for e5-small) while damaging position 1 — keyword finds the
   document but pollutes the top slot. Any fusion we ship must be weighted in
   favour of semantics, or gated on keyword confidence, and it must be measured
   before it is believed.

### Harness fault to fix before round 3

The last three arms all failed with the SAME message — `GatherBlockQuantized`
missing for a `Gather_Q4` node — including **e5-large q8, which has no q4 node
at all**. Two conclusions, of different weight:

- Genuine: `GatherBlockQuantized` is not implemented in this ORT WASM build, so
  the **q4** exports of EmbeddingGemma and Qwen3 cannot run on CPU here. Their
  q8 exports remain untested.
- My bug: after a failed session the ONNX runtime state in the page is
  poisoned, and every later arm inherits the previous error. **e5-large was not
  measured; its round-1 numbers stand and its round-2 "failure" is meaningless.**
  Round 3 must run each arm in a pristine page.

## Round 3 — the last measurement before the decision

1. Run every arm in a **fresh page** (state poisoning killed three arms).
2. **EmbeddingGemma q8 and Qwen3 q8 on CPU** — the q4 path is dead on this
   device, the q8 path is untested.
3. **Weighted fusion sweep** (semantic:keyword at 1:1, 2:1, 3:1, 5:1) computed
   from vectors already in memory — nearly free, and it decides whether hybrid
   ships at all.
4. **Scale test**: ~100 documents instead of 32, to see whether accuracy holds
   and how ranking time grows when the index is realistic.

## Results — round 3 (116 documents / 136 chunks, pristine page per arm)

Scale corpus = 8 page-length documents + 24 notes + 84 distractors in the same
register; the 18 long-document questions must now beat 90 neighbours.

| arm | backend | MB | warm start | index 136 chunks | chars/s | query | R@1 semantic (8 docs → 116 docs) | **R@1 hybrid 3:1 @116** |
|---|---|---|---|---|---|---|---|---|
| keyword (today) | — | 0 | — | — | — | 0.4 ms | 0.50 → **0.50** | — |
| e5-small q8 | webgpu | 118 | 1.35 s | 38 s | 1125 | 196 ms | 0.83 → **0.83** | 0.83 (R@3 0.94) |
| gte-base q8 (CLS) | webgpu | 340 | 1.56 s | 122 s | 353 | 277 ms | 1.00 → 0.78 | **1.00** |
| EmbeddingGemma q8 | **wasm (CPU)** | 309 | 1.92 s | 138 s | 312 | 291 ms | 1.00 → 0.89 | **1.00** |
| Qwen3-0.6B q8 | wasm | — | — | — | — | — | — | **freezes the WebView** |

### The two findings that decide the design

1. **Round 2's "hybrid hurts" was an artefact of equal weighting.** Swept
   properly, fusion is the best configuration everywhere, and at scale it is
   decisive: gte goes 0.78 → **1.00** and EmbeddingGemma 0.89 → **1.00** once
   the semantic ranker is weighted 2–3× the keyword one. At 1:1 it still hurts.
   Shipping the textbook default would have cost 22 points of accuracy; so
   would have believing round 2 and dropping hybrid altogether.
2. **Scale hurts dense retrieval and the keyword ranker fixes exactly that.**
   Semantic-only degrades as distractors grow (gte 1.00 → 0.78, Gemma
   1.00 → 0.89) because near-neighbours crowd the top. The keyword signal —
   worthless alone at 0.50 — supplies the literal disambiguation dense vectors
   lose, and the fusion lands on 1.00. Neither half gets there by itself.

### Other measurements worth keeping

- **EmbeddingGemma runs on this device after all** — on CPU, with the q8
  export. Its q4 export is dead here (`GatherBlockQuantized` has no CPU kernel)
  and its WebGPU path is dead too (65,536-byte workgroup request against a
  32,768 limit). Best-in-class accuracy is reachable, on the slow path.
- **Qwen3-0.6B q8 freezes the WebView.** 0.6B parameters on WASM is past what
  an Android WebView tolerates. Not viable, at any quality.
- Warm start is 1.3–1.9 s for every candidate: not a differentiator.
- Query latency 196–291 ms at 116 documents: not a differentiator either.
- **Indexing throughput is the only real cost difference**, and it is 3×
  between e5-small and the two big models.

### Honesty about the sample

18 queries. "1.00" means *no failure observed in 18 attempts*, not proof of
perfection — the difference between gte+hybrid and Gemma+hybrid is inside the
noise of this sample. What is well outside the noise is the gap to the current
keyword search (0.50) and to semantic-only at scale.

## Decision

**Ship `onnx-community/gte-multilingual-base` q8 with CLS pooling, on WebGPU,
fused with the existing keyword ranker by weighted reciprocal rank fusion at
3:1 in favour of the semantic side (k = 60). Chunk at 800 characters with 150
of overlap; a document scores as its best chunk.**

Why this one over the alternatives:

- vs **semantic-only**: 0.78 → 1.00 at realistic corpus size. The keyword
  ranker already exists, so fusion costs nothing to run.
- vs **EmbeddingGemma** (equal accuracy): Gemma is CPU-only on this hardware.
  It would compete with the UI thread for the whole indexing pass and it is
  slightly larger to download. Keep it as the **fallback when WebGPU is
  absent** — it is the only candidate proven to work without a GPU.
- vs **e5-small** (0.83 vs 1.00): the gap is one missed document in five.
  Keep it as the **light profile** for storage-constrained devices: 118 MB
  instead of 340, 3× faster indexing, 384-dimension vectors (half the storage).
- vs **Qwen3 / e5-large**: not viable on device.

### What this means for the product

- **First-use download: 340 MB**, with explicit consent and the size stated —
  as the owner decided. The consent screen must also say it works offline
  afterwards and can be removed.
- **Indexing is a background job with a progress bar**, incremental and
  resumable: at 353 chars/s a 200 KB library takes ~9 minutes once. New
  documents are indexed as they arrive, so the wait happens exactly once.
- **Vector storage**: 768 dimensions × 4 bytes ≈ 3 KB per chunk, ~1.4 MB for a
  200 KB library. Negligible; int8 quantisation is available if it ever isn't.
- **Search stays instant when the index is missing**: the keyword ranker is the
  fallback, not an error state.
