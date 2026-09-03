# Local models: the engine, the memory ledger, the measurements

Back to the [README](README.md).

## Local really means local

With a compatible GGUF loaded, inference happens on-device.

The local path includes native llama.cpp integration, an OpenCL GPU backend that is offered only after the device passes a real qualification check (never assumed from a chipset name), device/model-specific runtime tuning, KV-cache selection, persistent prefix-state caching, local tool-schema simplification for constrained grammars and progressive tool disclosure.

Local and cloud models can use different harness settings because they operate under different performance constraints.

### The engine keeps getting faster, and every claim here is a measurement

A persistent OpenCL kernel cache removed a multi-second first-generation recompile that used to run on every app start. Prompt processing moved to a larger microbatch, measured to shorten it rather than assumed to help. The static part of the system prompt is now pre-computed once instead of on every message. A native thread pool replaced manual thread lifecycle management, and CPU core affinity was tested with a paired A/B campaign rather than switched on because it sounded right — it made no measurable difference on the reference hardware, so the default did not change on the strength of a hunch.

That is also the house rule for what does **not** ship by default: Flash Attention is not force-enabled globally, "use every core" is not a universal default, and the KV-cache type is not chosen from free RAM alone. Where a change could not clear that bar, it stayed off — a negative result is still a result.

## Know whether a model fits before downloading it

<img src="docs/immagini/tablet-10-huggingface-list.png" alt="Browsing Hugging Face with the fits-in-memory filter active, twelve matching models">

TALOS can browse Hugging Face from the phone and filter models by what **this device** can actually hold. Each model includes a memory verdict, while publisher, licence, parameter band and popularity help make the choice explicit.

Opening a model splits it into three tabs — quantizations, the full model card, and the raw file list — instead of one long scroll. Every quantization is checked against your device automatically as soon as the page opens.

### Every quantisation, measured against your RAM

<img src="docs/immagini/tablet-8-model-detail.png" alt="Model detail page with Quantizations, Model card and Files tabs, and the runtime configuration panel">

A resource ledger shows exactly where each memory estimate comes from — weights and file size are exact, the KV-cache size is exact once the header is read, compute and runtime overhead are the app's own declared safety margin — instead of a single unexplained number. The KV-cache type can be forced globally (F16 or Q8_0) instead of only reading whatever the file happened to ship with, and the resolved type is always shown, even on Automatic.

Quantisations are shown against the device's actual memory:

```text
Q4_K_M   2.6 GB   Memory: little room · about 6.6 tokens/second
                  Fits in memory: 810 MB of RAM left once it is loaded
                  Checked at 4096 tokens of context
Q5_K_S   2.8 GB   Memory is tight
```

TALOS reports:

- **RAM left after loading**, not just model size;
- the **context length** assumed by the estimate;
- **measured speed** on the device.

> Peak RSS can misrepresent local-model memory because `llama.cpp` maps weights with `mmap`. On one measured 1.79 GiB model, peak RSS was 3,869 MB while only **2,031 MB** could not be dropped. TALOS sizes against the latter.

Hugging Face file warnings are also surfaced before download.

Once loaded, a local model uses the same conversation surface, tools and permission vocabulary as a frontier API model.

## Measured speed

**Measured on a OnePlus Pad 3**, `Holo-3.1-4B Q4_K_M` (4.84B parameters), at 8 threads:

| | tokens/second |
| --- | ---: |
| prefill, 512 tokens | **65.1** ± 0.7 |
| prefill, 2048 tokens | **58.3** ± 1.2 |
| generation, 128 tokens | **12.2** ± 0.1 |

One agent step — 2,000 tokens in, 100 out — takes **43.3 s** on that model and **35.3 s** on a Qwen2.5-3B not trained for device control. The 4B scores **71.0% on AndroidWorld**.

Speculative decoding, an NPU backend and per-phase thread counts remain measured work in progress. Thermal state is part of those measurements.

## The tool surface, measured

TALOS currently exposes **69 typed tools**. With all available tools enabled, 68 definitions are offered to the model — image generation appears only when configured — weighing **45,116 bytes (~12,194 tokens)** per turn.

You can reproduce the measurement:

```bash
npx vitest run tests/unit/tools/pesoDegliSchemi.test.ts
```

```text
                    USER
                      │
                      ▼
               TALOS conversation
                      │
              select model/provider
                      │
                      ▼
            ┌────────────────────┐
            │   AGENT HARNESS    │
            │                    │
            │ tool disclosure    │
            │ permissions        │
            │ dedup / recovery   │
            │ context            │
            │ verification       │
            └─────────┬──────────┘
                      │
              authorized tool call
                      │
                      ▼
          ┌─────────────────────────┐
          │  Library / Web / Phone  │
          │  Models / Personal data │
          └────────────┬────────────┘
                       │
                  observe result
                       │
                       ▼
                 verified outcome
```

### Progressive tool disclosure

When supported, TALOS uses native deferred loading. Otherwise, cloud and local models can receive a **compact catalog** and request full schemas on demand.

With progressive disclosure enabled:

```text
45,116 bytes  (68 tools)
      ↓
 1,868 bytes  (4 tools)
```

That is about a **96% reduction** in persistent tool surface. Revealing a tool costs one additional round trip the first time it is needed.

Besides reducing prompt cost, smaller tool surfaces can help constrained models avoid selecting the wrong capability.
