# Talos Accelerator Backend
## Specifica tecnica e piano pratico per un runtime LLM on-device accelerato su Qualcomm Hexagon / HTP

**Stato:** Technical Design Proposal  
**Target primario:** Android / Snapdragon 8 Elite-class, chat AI locale, WebView/Capacitor come UI  
**Obiettivo:** progettare un backend di accelerazione proprietario per Talos che sfrutti Qualcomm HTP/Hexagon tramite QAIRT/QNN senza legare l'architettura core del runtime a una singola generazione di SoC o SDK.

---

## 0. Executive summary

L'obiettivo corretto non è "costruire un NPU software". L'obiettivo è costruire un **runtime Talos hardware-aware** che:

1. possieda il ciclo di vita completo dell'inferenza;
2. abbia una propria IR;
3. separi `prefill` e `decode`;
4. possieda nativamente KV cache e prefix cache;
5. compili sottografi per HTP;
6. gestisca shape statiche e bucket;
7. minimizzi i passaggi HTP ↔ CPU;
8. preallochi la memoria;
9. serializzi gli artifact compilati;
10. abbia fallback CPU/GPU controllato;
11. misuri TTFT, inter-token latency, energia e jank UI;
12. moduli aggressività e threading in base a pressione termica e UI.

La forma architetturale consigliata è:

```text
┌─────────────────────────────────────────────────────────────┐
│                          TALOS UI                           │
│            Vue / Capacitor / Android WebView               │
└───────────────────────┬─────────────────────────────────────┘
                        │ control plane soltanto
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                   TALOS ANDROID HOST                        │
│ JNI | lifecycle | thermal | performance hints | persistence │
└───────────────────────┬─────────────────────────────────────┘
                        │ native ABI
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    TALOS RUNTIME CORE                       │
│ scheduler | tokenizer | sampler | KV | cache | profiler    │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                         TALOS IR                            │
│ graph | tensor | quant metadata | aliases | lifetime       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                 compile / partition
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
┌───────────────┐ ┌──────────────┐ ┌───────────────┐
│ Talos QNN/HTP │ │ Talos Vulkan │ │ Talos CPU/NEON│
│ primary       │ │ optional     │ │ fallback/ref  │
└───────┬───────┘ └──────────────┘ └───────────────┘
        ▼
 Qualcomm QAIRT / QNN
        ▼
 Hexagon / HTP
```

Il vantaggio competitivo di Talos non dovrebbe dipendere dal numero di custom kernel scritti. Dovrebbe derivare da una **politica end-to-end** che un runtime general purpose non può conoscere:

> massimizzare qualità e token/s sostenibili mantenendo basso TTFT, inter-token jitter, temperatura e jank della UI.

---

# 1. Obiettivi e non-obiettivi

## 1.1 Obiettivi

Il backend deve consentire:

- LLM autoregressivi con batch interattivo tipicamente `1`;
- prompt lunghi con prefill accelerato;
- decode a bassa latenza;
- quantizzazione mista;
- KV cache persistente per sessione;
- rewind della conversazione;
- prefix caching;
- LoRA/adapters in una fase successiva;
- speculative decoding in una fase successiva;
- supporto a più backend;
- compilazione AOT quando possibile;
- profilazione riproducibile;
- recovery da errori del backend;
- funzionamento completamente offline;
- UI fluida anche durante inferenza pesante.

## 1.2 Non-obiettivi iniziali

Nella prima versione **non** tentare di:

- creare un compiler generale equivalente a TVM/MLIR;
- supportare ogni architettura Transformer esistente;
- compilare shape arbitrariamente dinamiche;
- scrivere subito una libreria completa di kernel Hexagon;
- ottimizzare multi-user batching server-style;
- usare il bridge Capacitor per tensor o grandi buffer;
- nascondere il fallback CPU durante lo sviluppo.

---

# 2. Vincolo fondamentale: QNN è un adapter, non l'architettura

Qualcomm AI Engine Direct/QNN fornisce accesso a backend CPU, GPU e HTP; l'integrazione ExecuTorch corrente delega a Hexagon/Adreno attraverso tale stack [S1][S3].

Il core Talos non deve contenere tipi QNN.

## 2.1 Anti-pattern

```cpp
// NO: QNN leak nel core.
class TransformerBlock {
    Qnn_GraphHandle_t graph;
    Qnn_Tensor_t input;
};
```

Questo rende:

- test unitari difficili;
- upgrade SDK invasivi;
- fallback hardware complesso;
- porting su altri SoC quasi impossibile.

## 2.2 Boundary corretto

```cpp
namespace talos {

enum class BackendKind {
    Reference,
    Cpu,
    Vulkan,
    QnnHtp,
    QnnGpu
};

struct BackendCapabilities {
    bool supports_fp16;
    bool supports_int8;
    bool supports_int4_weights;
    bool supports_async;
    bool supports_shared_memory;
    bool supports_context_cache;
    bool supports_custom_ops;
};

class CompiledProgram;
class ExecutionContext;

class Backend {
public:
    virtual ~Backend() = default;

    virtual BackendKind kind() const noexcept = 0;
    virtual BackendCapabilities capabilities() const noexcept = 0;

    virtual Result<CompiledProgram> compile(
        const Graph& graph,
        const CompileOptions& options
    ) = 0;

    virtual Result<std::unique_ptr<ExecutionContext>> createExecutionContext(
        const CompiledProgram& program
    ) = 0;

    virtual Status execute(
        ExecutionContext& context,
        std::span<const TensorView> inputs,
        std::span<TensorView> outputs
    ) = 0;

    virtual Status cancel(ExecutionContext& context) = 0;
};

}
```

### Regola

Tutto ciò che contiene:

```text
Qnn*
Qairt*
HTP*
VTCM*
RPC*
soc_model
htp_arch
```

deve stare sotto:

```text
backends/qnn/
```

---

# 3. Repository consigliato

```text
talos-runtime/
├── CMakeLists.txt
├── cmake/
│   ├── TalosOptions.cmake
│   └── QualcommQnn.cmake
│
├── include/talos/
│   ├── runtime.h
│   ├── session.h
│   ├── model.h
│   └── metrics.h
│
├── core/
│   ├── runtime.cpp
│   ├── session.cpp
│   ├── scheduler.cpp
│   ├── tokenizer/
│   ├── sampler/
│   ├── kv/
│   │   ├── kv_cache.cpp
│   │   ├── kv_layout.cpp
│   │   ├── prefix_cache.cpp
│   │   └── kv_rewind.cpp
│   ├── memory/
│   │   ├── arena.cpp
│   │   ├── lifetime.cpp
│   │   └── shared_buffer.cpp
│   └── profiling/
│
├── ir/
│   ├── graph.h
│   ├── node.h
│   ├── tensor.h
│   ├── dtype.h
│   ├── shape.h
│   ├── quant.h
│   ├── opcodes.h
│   └── passes/
│       ├── constant_fold.cpp
│       ├── canonicalize.cpp
│       ├── fuse_rmsnorm.cpp
│       ├── fuse_rope.cpp
│       ├── fuse_mlp.cpp
│       ├── partition.cpp
│       ├── shape_specialize.cpp
│       └── memory_plan.cpp
│
├── backends/
│   ├── reference/
│   ├── cpu/
│   ├── vulkan/
│   └── qnn/
│       ├── qnn_backend.cpp
│       ├── qnn_loader.cpp
│       ├── qnn_graph_builder.cpp
│       ├── qnn_tensor_map.cpp
│       ├── qnn_memory.cpp
│       ├── qnn_context_cache.cpp
│       ├── qnn_profile.cpp
│       ├── qnn_errors.cpp
│       └── op_packages/
│
├── compiler/
│   ├── compiler.cpp
│   ├── partitioner.cpp
│   ├── artifact.cpp
│   └── manifest.cpp
│
├── android/
│   ├── jni/
│   │   └── talos_jni.cpp
│   ├── thermal/
│   ├── adpf/
│   └── lifecycle/
│
├── tools/
│   ├── talos-compile/
│   ├── talos-bench/
│   ├── talos-inspect/
│   └── talos-diff/
│
└── tests/
```

---

# 4. Talos IR

## 4.1 Perché una IR propria

Una IR minimale serve a disaccoppiare:

```text
formato modello
    ↓
semantica Talos
    ↓
hardware
```

Non deve diventare un linguaggio general purpose.

Per un MVP LLM è sufficiente rappresentare:

- tensor;
- costanti;
- MatMul;
- elementwise;
- normalization;
- reshape/view;
- transpose;
- RoPE;
- attention;
- concat/slice;
- embedding;
- softmax;
- top-k opzionale;
- read/write KV.

## 4.2 Tipi

```cpp
enum class DType : uint8_t {
    F32,
    F16,
    BF16,
    I32,
    U8,
    I8,
    U16,
    I16,

    // Formati logici dei pesi.
    Q4_0,
    Q4_K,
    Q6_K
};
```

Non confondere il **formato sorgente** del file con la precisione con cui il backend lo esegue.

Esempio:

```text
GGUF Q4_K
    ↓ importer
Talos WeightTensor
    ↓ lowering
QNN weight encoding / packed layout
```

## 4.3 Shape

```cpp
struct Dim {
    enum class Kind { Static, Symbolic };
    Kind kind;
    int64_t value;
    SymbolId symbol;
};

struct Shape {
    SmallVector<Dim, 4> dims;
};
```

La IR può avere shape simboliche **prima** della specializzazione.

Il graph QNN/HTP finale deve invece ricevere le shape concrete richieste dal backend. L'ONNX Runtime QNN EP documenta esplicitamente che i modelli con dynamic shape devono essere fissati a valori specifici [S2].

## 4.4 Tensor descriptor

```cpp
struct TensorDesc {
    TensorId id;
    std::string name;

    DType dtype;
    Shape shape;

    Layout layout;
    MemoryClass memory_class;

    std::optional<QuantParams> quant;

    bool constant;
    bool external;
    bool persistent;
};
```

## 4.5 Quant metadata

```cpp
struct AffineQuant {
    float scale;
    int32_t zero_point;
};

struct PerChannelQuant {
    std::vector<float> scales;
    std::vector<int32_t> zero_points;
    int32_t axis;
};

struct BlockQuant {
    uint32_t block_size;
    std::vector<float> scales;
};

using QuantParams = std::variant<
    AffineQuant,
    PerChannelQuant,
    BlockQuant
>;
```

---

# 5. Import pipeline

Esempio:

```text
model.gguf
   │
   ├── metadata
   ├── tokenizer
   └── weight tensors
          │
          ▼
     GGUF importer
          │
          ▼
       Talos IR
          │
          ├── canonicalization
          ├── shape inference
          ├── constant folding
          ├── fusion
          ├── quant lowering
          ├── partitioning
          └── memory planning
```

## 5.1 Non convertire tutto a FP32

Anti-pattern:

```text
GGUF Q4
  ↓ dequant completa
FP32
  ↓
QNN converter
  ↓ requant
INT8
```

Può:

- moltiplicare RAM temporanea;
- rallentare compilazione;
- perdere informazioni sul grouping originale;
- rendere impossibile una conversione efficiente.

Meglio mantenere il peso compresso il più a lungo possibile e lowering specifico per backend.

---

# 6. Canonical Transformer Block

La IR dovrebbe normalizzare vari modelli in un piccolo numero di pattern.

Per un blocco tipo Llama:

```text
input
  │
  ├──────────── residual ─────────────────────────────┐
  ▼                                                   │
RMSNorm                                               │
  ▼                                                   │
QKV projection                                        │
  ▼                                                   │
RoPE                                                  │
  ▼                                                   │
Attention + KV                                        │
  ▼                                                   │
Output projection                                     │
  ├───────────────────────────────────────────────────┘
  ▼
Add
  │
  ├──────────── residual ─────────────────────────────┐
  ▼                                                   │
RMSNorm                                               │
  ▼                                                   │
Gate projection ── SiLU                               │
         │                │                           │
         └── Up projection┘                           │
                    ▼                                 │
                  Mul                                 │
                    ▼                                 │
               Down projection                       │
                    ├─────────────────────────────────┘
                    ▼
                   Add
```

Il compiler deve riconoscere questo pattern per permettere:

- fusion;
- layout propagation;
- eliminazione transpose;
- memory reuse;
- quantizzazione sensibile per sottoblocco.

---

# 7. Separazione PREFILL / DECODE

È una decisione architetturale obbligatoria.

## 7.1 Prefill

Input tipico:

```text
[batch=1, sequence=N, hidden]
```

Caratteristiche:

- MatMul grandi;
- alto parallelismo;
- creazione iniziale del KV;
- TTFT molto dipendente dal throughput.

## 7.2 Decode

Input tipico:

```text
[batch=1, sequence=1, hidden]
```

Caratteristiche:

- dipendenza seriale fra token;
- accessi a KV crescente;
- operazioni più piccole;
- memoria e synchronization overhead più rilevanti.

## 7.3 Artifact separati

```text
model.talos/
└── qnn/
    ├── prefill_128.ctx
    ├── prefill_256.ctx
    ├── prefill_512.ctx
    ├── prefill_1024.ctx
    ├── prefill_2048.ctx
    ├── prefill_4096.ctx
    └── decode.ctx
```

Non è necessario adottare questi bucket letteralmente. Bisogna derivarli dalla distribuzione dei prompt reali.

## 7.4 Shape specialization

```cpp
CompiledProgram* choosePrefillProgram(size_t promptTokens) {
    if (promptTokens <= 128)  return &prefill128;
    if (promptTokens <= 256)  return &prefill256;
    if (promptTokens <= 512)  return &prefill512;
    if (promptTokens <= 1024) return &prefill1024;
    if (promptTokens <= 2048) return &prefill2048;
    return &prefill4096;
}
```

Il bucket più grande del prompt introduce padding.

Quindi il problema è:

```text
più bucket
→ meno padding
→ più artifact
→ più compile time
→ più storage
```

Misurare il trade-off.

---

# 8. Chunked prefill

Per prompt lunghi, Talos dovrebbe supportare prefill a chunk.

Esempio:

```text
prompt = 3850 token
chunk = 512

512
512
512
512
512
512
512
266
```

Benefici potenziali:

- picco memoria inferiore;
- migliori punti di cancellazione;
- meno monopolizzazione del device;
- possibilità di cedere risorse alla UI;
- scheduling termico più fine.

Pseudo-scheduler:

```cpp
for (size_t offset = 0; offset < prompt.size(); offset += chunk_size) {
    if (cancelled()) {
        return Status::Cancelled;
    }

    const auto chunk = prompt.subspan(
        offset,
        std::min(chunk_size, prompt.size() - offset)
    );

    backend.execute(prefillContext, chunk);

    governor.onPrefillChunkFinished();
}
```

Da benchmarkare contro prefill monolitico: chunk troppo piccoli possono abbassare drasticamente l'efficienza.

---

# 9. KV cache come primitiva first-class

Non trattare KV come un normale output tensor.

## 9.1 API

```cpp
struct KVCacheConfig {
    uint32_t layers;
    uint32_t kv_heads;
    uint32_t head_dim;
    uint32_t capacity_tokens;
    DType dtype;
    KVLayout layout;
};

class KVCache {
public:
    Status reserve(uint32_t token_capacity);

    Status append(
        uint32_t layer,
        TensorView keys,
        TensorView values
    );

    Status rewind(uint32_t token_position);

    Result<KVBranch> fork(uint32_t token_position);

    uint32_t usedTokens() const noexcept;
};
```

## 9.2 Formula memoria

Per un KV tradizionale:

```text
KV bytes =
  layers
× 2                // K + V
× kv_heads
× head_dim
× tokens
× bytes_per_element
```

### Esempio

Ipotizziamo:

```text
layers             = 32
kv_heads           = 8
head_dim           = 128
context            = 8192
dtype              = FP16 = 2 byte
```

Allora:

```text
32 × 2 × 8 × 128 × 8192 × 2
= 1,073,741,824 byte
≈ 1 GiB
```

Il punto è importante: il KV può diventare una quota dominante della RAM anche quando i pesi sono fortemente quantizzati.

Se il KV fosse 8 bit:

```text
≈ 512 MiB
```

prima di overhead e allineamenti.

## 9.3 Layout

Talos deve considerare almeno:

```cpp
enum class KVLayout {
    LayerMajor,
    TokenMajor,
    HeadMajor,
    BackendNative
};
```

Non imporre un layout "elegante" nel core.

Il backend può richiedere una forma ottimale diversa.

## 9.4 Zero-copy KV

Obiettivo ideale:

```text
HTP produce K/V
       │
       ▼
persistent backend-native KV
       │
       ▼
HTP legge K/V al token successivo
```

Anti-pattern:

```text
HTP → CPU RAM → conversione → HTP
```

per ogni token.

---

# 10. Prefix cache

Una chat app ha un'enorme opportunità di riuso:

```text
system prompt
+ tool instructions
+ policy
+ persona
```

possono essere identici fra sessioni.

## 10.1 Struttura

```cpp
struct PrefixKey {
    ModelFingerprint model;
    Hash tokenizer_hash;
    Hash token_sequence_hash;
    QuantProfileId quant_profile;
};

struct PrefixEntry {
    PrefixKey key;
    SharedKVHandle kv;
    uint32_t tokens;
    size_t bytes;
    uint64_t last_used_ns;
};
```

## 10.2 Cache policy

Partire con:

- LRU;
- limite byte assoluto;
- limite percentuale della RAM;
- invalidazione su cambio modello;
- invalidazione su cambio quant profile;
- hash dei token, non del testo UTF-8.

## 10.3 Perché hash dei token

Questi due input possono essere semanticamente uguali ma tokenizzati diversamente se cambia tokenizer/versione.

Quindi la key deve includere:

```text
tokenizer_hash + exact_token_ids
```

---

# 11. Rewind e regenerate

In una chat:

```text
A
B
C
D
```

L'utente rigenera `C`.

Non dovrebbe avvenire:

```text
prefill A+B da zero
```

Se la cache conserva checkpoint:

```text
KV(A+B)
  ↓
nuovo C
  ↓
nuovo D
```

## 11.1 Checkpoint strategy

Non salvare copie complete del KV ad ogni token.

### A. Rewind logico

Il buffer è append-only e `used_tokens` torna indietro.

```cpp
kv.rewind(tokenOffset);
```

### B. Copy-on-write per fork

```text
prefix KV
   │
   ├── branch old
   └── branch regenerate
```

Fino alla divergenza i blocchi sono condivisi.

---

# 12. Memory planner

L'obiettivo è avere:

```text
0 allocazioni heap
```

nel ciclo caldo di decode.

## 12.1 Lifetime analysis

```text
tensor A: [0----------------5]
tensor B:     [1------3]
tensor C:             [3-------6]
tensor D:                         [7--8]
```

Se `A` e `D` non sono live contemporaneamente, possono riutilizzare lo stesso spazio.

## 12.2 Linear scan allocator

Pseudo-algoritmo:

```cpp
for (Tensor t : tensorsSortedByBirth) {
    expireIntervalsBefore(t.birth);

    auto offset = freeList.findBestFit(
        t.size,
        t.alignment
    );

    if (!offset) {
        offset = arena.extend(t.size, t.alignment);
    }

    assign(t, *offset);
    active.insert(t);
}
```

## 12.3 Memory classes

Separare:

```text
WeightsPersistent
KVCachePersistent
BackendPersistent
ActivationArena
Scratch
HostIO
SharedIO
```

Non mischiare tutto nello stesso allocator.

## 12.4 Alignment

Il backend deve poter imporre:

```cpp
size_t requiredAlignment(MemoryClass cls) const;
```

Non hardcodare 64/128/4096 nel core.

---

# 13. Shared memory e copie

Il QNN EP documenta un'opzione per l'HTP shared memory allocator (`enable_htp_shared_memory_allocator`) e richiede la relativa infrastruttura RPC [S2].

Questo è un segnale architetturale utile: Talos deve progettare i buffer come risorse backend-aware.

## 13.1 TensorView

```cpp
struct TensorView {
    void* data;
    size_t bytes;
    TensorDesc desc;

    MemoryDomain domain;
};

enum class MemoryDomain {
    Host,
    HostPinned,
    Shared,
    Backend
};
```

## 13.2 Regola pratica

Una funzione backend non dovrebbe accettare implicitamente qualsiasi pointer.

```cpp
Status execute(TensorView x);
```

deve validare:

```text
dominio memoria
alignment
size
dtype
layout
ownership
```

---

# 14. QNN backend lifecycle

I nomi API diretti cambiano nel tempo fra generazioni QNN/QAIRT; per questo il seguente codice è **strutturale/pseudocode**, non un frammento da copiare senza verificare gli header della versione fissata.

## 14.1 Oggetti lifetime

```text
Dynamic loader
   ↓
Backend
   ↓
Device
   ↓
Context
   ↓
Graph
   ↓ finalize
Execution context
```

## 14.2 Wrapper RAII

```cpp
class QnnBackendHandle {
public:
    QnnBackendHandle();
    ~QnnBackendHandle();

    QnnBackendHandle(const QnnBackendHandle&) = delete;
    QnnBackendHandle& operator=(const QnnBackendHandle&) = delete;

private:
    void* handle_ = nullptr;
};
```

Replicare il pattern per:

```text
Backend
Device
Context
Graph
Profile
Memory registration
Signal
```

## 14.3 Mai esporre handle raw al runtime

Il core riceve:

```cpp
CompiledProgram
```

Il backend conserva:

```cpp
struct QnnCompiledProgramImpl {
    QnnContext context;
    std::vector<QnnGraph> graphs;
    QnnMemoryPlan memory;
};
```

via PImpl.

---

# 15. Graph partitioning

## 15.1 Obiettivo

Minimizzare:

```text
HTP → CPU → HTP → CPU
```

Non massimizzare semplicemente il numero di singoli operatori delegati.

## 15.2 Cost function

Un modello semplice:

```text
cost(partition) =
    compute_cost
  + transfer_cost
  + synchronization_cost
  + layout_conversion_cost
  + quantize_dequantize_cost
```

La decisione:

```text
op X è 15% più rapido su CPU
```

non basta.

Se eseguirlo su CPU causa due crossing del boundary, può peggiorare il sistema.

## 15.3 Development mode

Durante bring-up usare modalità strict:

```cpp
CompileOptions options;
options.allow_cpu_fallback = false;
```

L'ONNX Runtime QNN EP offre un'opzione analoga (`session.disable_cpu_ep_fallback`) proprio per verificare che il graph previsto venga interamente accettato dal backend HTP [S2].

## 15.4 Production mode

In produzione:

```text
strict = false
```

ma ogni fallback deve generare telemetria locale:

```json
{
  "event": "backend_fallback",
  "graph": "decode",
  "op": "SomeUnsupportedOp",
  "from": "qnn_htp",
  "to": "cpu"
}
```

---

# 16. Fusion

Ordine consigliato:

1. canonicalizzare;
2. propagare shape;
3. eliminare view inutili;
4. propagare layout;
5. fusion ad alto livello;
6. quant lowering;
7. backend lowering.

## 16.1 Pattern: RMSNorm

Sorgente:

```text
x
├── square
├── reduce_mean
├── add epsilon
├── rsqrt
├── mul x
└── mul weight
```

Talos IR:

```text
RMSNorm(x, weight, epsilon)
```

Il backend decide se:

- abbassarlo in primitive QNN;
- usare una fusion supportata;
- usare custom op;
- fallback.

## 16.2 Pattern: SwiGLU

```text
gate = SiLU(x @ Wgate)
up   = x @ Wup
out  = gate * up
```

Talos:

```text
SwiGLU(x, Wgate, Wup)
```

## 16.3 Principio

Non fondere troppo presto.

Una fusion IR deve preservare abbastanza informazione per consentire:

- quantizzazione diversa delle proiezioni;
- decomposizione su backend che non la supportano.

---

# 17. Custom HTP Op Package

Qualcomm documenta Op Packages HTP, optimization grammar, scratch buffers, scheduling/allocation, tensor layout, VTCM e linee guida specifiche per operatori custom [S1].

## 17.1 Quando scriverne uno

Solo se vale almeno una delle condizioni:

1. elimina un boundary HTP↔CPU;
2. fonde una catena significativa;
3. riduce fortemente traffico memoria;
4. migliora end-to-end ≥ ~5% in un workload reale;
5. abilita un modello altrimenti non delegabile.

La soglia `5%` è una policy Talos suggerita, non un limite Qualcomm.

## 17.2 Quando NON farlo

Non scrivere un custom op perché:

```text
microbenchmark kernel:
0.18 ms → 0.11 ms
```

se l'intero token richiede 20 ms.

Il miglioramento teorico è:

```text
0.07 / 20 = 0.35%
```

prima di overhead.

## 17.3 Processo

```text
profiling
   ↓
identify hotspot
   ↓
confirm graph boundary
   ↓
prototype decomposition
   ↓
custom op
   ↓
numerical diff
   ↓
op benchmark
   ↓
end-to-end benchmark
   ↓
thermal benchmark
```

---

# 18. VTCM

La documentazione Qualcomm espone tuning VTCM, sharing e windowing per HTP [S1]; ONNX Runtime QNN EP espone anche `vtcm_mb` come provider option [S2].

Trattare VTCM come risorsa scarsa.

## 18.1 Non hardcodare "massimo"

Più VTCM richiesto non implica automaticamente prestazioni migliori.

Può:

- impedire coesistenza;
- aumentare pressione su altri graph;
- non migliorare un kernel memory-bound altrove.

## 18.2 Talos profile

```cpp
struct QnnTuningProfile {
    uint32_t vtcm_mb;
    PerformanceMode mode;
    int graph_finalization_level;
    int rpc_control_latency_us;
};
```

Il profilo deve essere derivato da benchmark per SoC/model pair.

---

# 19. Quantizzazione

La quantizzazione deve essere un prodotto del compiler, non una proprietà globale tipo:

```text
"questo modello è Q4"
```

## 19.1 Precision policy

```cpp
struct PrecisionPolicy {
    Precision embedding;
    Precision attention_proj;
    Precision attention_accum;
    Precision mlp_proj;
    Precision norm;
    Precision lm_head;
    Precision kv_cache;
};
```

## 19.2 Candidate space

```text
weights:
W4
W8
FP16

activations:
A8
A16
FP16

KV:
KV8
KV16
FP16
```

ExecuTorch Qualcomm documenta attualmente schemi inclusi `8a8w`, `16a16w`, `16a8w`, `16a4w` e `16a4w_block`, oltre a configurazione per-modulo e per-node [S3].

## 19.3 Sensitivity analysis

Per ogni layer:

1. eseguire baseline reference;
2. quantizzare solo il layer;
3. misurare errore;
4. misurare latency;
5. assegnare sensitivity score.

Esempio:

```text
layer  precision   ΔPPL    latency
0      W4A8        +0.01   0.62 ms
1      W4A8        +0.02   0.61 ms
...
17     W4A8        +0.41   0.60 ms   ← sensibile
17     W8A16       +0.03   0.77 ms
...
lm     W4A8        +0.35
lm     W8A16       +0.02
```

Policy risultante:

```text
most layers → W4A8
layer 17    → W8A16
lm_head     → W8A16
```

## 19.4 Calibration corpus

Non usare random input.

Il corpus deve rappresentare Talos:

- conversazioni brevi;
- conversazioni lunghe;
- codice;
- italiano/inglese;
- system prompt reali;
- tool-style JSON se usato;
- documenti Markdown;
- prompt con token rari.

ONNX Runtime QNN sottolinea che la calibrazione deve usare dati rappresentativi [S2].

---

# 20. Validation numerica

Ogni compilazione produce un report.

```json
{
  "model": "talos-model-x",
  "quant_profile": "w4a8_mixed_v3",
  "reference": "fp16_cpu",
  "tests": {
    "max_abs_error": 0.031,
    "mean_abs_error": 0.0021,
    "cosine_similarity": 0.9996,
    "token_top1_agreement": 0.987
  }
}
```

## 20.1 Livelli

### Tensor-level

- max absolute error;
- mean absolute error;
- cosine similarity;
- percentile error.

### Logit-level

- KL divergence;
- top-1 agreement;
- top-k overlap.

### Model-level

- perplexity;
- benchmark task;
- generation regression;
- long-context quality.

### Product-level

- output validity;
- hallucination regressions;
- tool-call JSON correctness.

---

# 21. Backend reference

Non opzionale.

```text
Talos Reference Backend
```

deve essere:

- semplice;
- leggibile;
- lento;
- deterministicamente verificabile;
- con precisione alta.

Serve come oracle per:

```text
IR passes
fusion
quantization
memory aliasing
backend HTP
custom ops
```

---

# 22. Context binary / AOT compilation

La compilazione accelerator-specific può essere molto costosa; il design EP Context di ONNX Runtime cita esplicitamente LLM per cui conversione/compilazione può arrivare a decine di minuti e giustifica la persistenza dei context compilati [S4].

QNN supporta serializzazione del contesto compilato e il QNN EP espone context binary cache [S2].

## 22.1 Artifact Talos

```text
my-model.talos/
├── manifest.json
├── tokenizer/
│   └── tokenizer.model
├── source/
│   └── model.gguf
├── qnn/
│   ├── target.json
│   ├── prefill_128.bin
│   ├── prefill_512.bin
│   ├── prefill_2048.bin
│   └── decode.bin
├── calibration/
│   └── report.json
└── checksums.json
```

## 22.2 Manifest

```json
{
  "format": 1,
  "talos_ir": 7,
  "model_id": "sha256:...",
  "tokenizer_id": "sha256:...",
  "backend": "qnn-htp",
  "sdk": {
    "family": "QAIRT/QNN",
    "version": "PINNED_AT_BUILD"
  },
  "target": {
    "soc": "DEVICE_CLASS",
    "htp_arch": "BACKEND_DETECTED"
  },
  "quant_profile": "w4a8-mixed-v3",
  "graphs": [
    {
      "name": "prefill",
      "bucket": 512,
      "file": "qnn/prefill_512.bin"
    },
    {
      "name": "decode",
      "bucket": 1,
      "file": "qnn/decode.bin"
    }
  ]
}
```

## 22.3 Cache key

```text
artifact_key = SHA256(
    model_hash
  || tokenizer_hash
  || talos_ir_version
  || compiler_version
  || backend_abi_version
  || qnn_sdk_version
  || soc_id
  || htp_arch
  || quant_profile
  || custom_op_package_hash
)
```

Mai riusare un artifact se uno di questi elementi critici cambia.

---

# 23. Compile pipeline

```text
talos-compile model.gguf
        │
        ▼
validate source
        │
        ▼
import → Talos IR
        │
        ▼
reference shape inference
        │
        ▼
canonical passes
        │
        ▼
quantization plan
        │
        ▼
specialize:
  prefill buckets
  decode
        │
        ▼
partition QNN / CPU
        │
        ▼
strict validation
        │
        ▼
QNN compile/finalize
        │
        ▼
context serialization
        │
        ▼
numerical validation
        │
        ▼
benchmark smoke test
        │
        ▼
artifact manifest
```

## 23.1 CLI

```bash
talos-compile \
  --model ./model.gguf \
  --backend qnn-htp \
  --target auto \
  --prefill-buckets 128,512,2048 \
  --quant-profile configs/w4a8-mixed.json \
  --strict-fallback \
  --output ./model.talos
```

---

# 24. QNN tuning surface

Il QNN EP documenta fra le opzioni HTP:

- performance mode;
- context priority;
- VTCM;
- graph finalization optimization;
- shared-memory allocator;
- profiling;
- SoC/HTP architecture [S2].

Non copiarle 1:1 nell'API pubblica Talos.

## 24.1 API Talos

```cpp
enum class PowerPolicy {
    Interactive,
    Balanced,
    Sustained,
    Benchmark
};
```

Adapter:

```text
Interactive
    ↓
QNN tuning profile A

Balanced
    ↓
QNN tuning profile B
```

Questo evita che la UI sappia cosa sia `vtcm_mb`.

---

# 25. QoS e thermal governor

Android espone Performance Hint Manager a partire da API 31 e consente di raggruppare thread interrelati in una hint session [S5]. La Thermal API consente di adattare il workload alla condizione termica; Android raccomanda di raggiungere i target evitando di superare la capacità termica sostenibile [S6].

## 25.1 Stato Talos

```cpp
enum class ThermalBand {
    Cool,
    Warm,
    Hot,
    Critical
};

struct RuntimePressure {
    ThermalBand thermal;
    float thermal_headroom;
    float ui_jank_ratio;
    float cpu_utilization;
    float decode_p99_ms;
};
```

## 25.2 Governor

```cpp
RuntimePolicy Governor::decide(const RuntimePressure& p) {
    RuntimePolicy out = current_;

    if (p.thermal == ThermalBand::Critical) {
        out.cpu_workers = 1;
        out.speculative = false;
        out.prefill_chunk = 256;
        out.ui_batch_ms = 100;
        out.performance = PowerPolicy::Balanced;
        return out;
    }

    if (p.ui_jank_ratio > 0.05f) {
        out.cpu_workers = std::max(1, out.cpu_workers - 1);
        out.ui_batch_ms = std::max(out.ui_batch_ms, 66);
    }

    if (p.thermal == ThermalBand::Cool && p.ui_jank_ratio < 0.01f) {
        out.prefill_chunk = 1024;
    }

    return out;
}
```

Le soglie sopra sono esempi iniziali da calibrare.

---

# 26. Reserve UI budget

Talos non dovrebbe usare automaticamente tutti i core disponibili.

## 26.1 Esperimento iniziale

Con CPU fallback/sampling:

```text
workers = logical_cpu_count - 1
```

confrontato contro:

```text
workers = logical_cpu_count
```

Misurare:

- tok/s;
- TTFT;
- inter-token p99;
- `Runnable` time del main thread WebView;
- jank FrameTimeline;
- thermal headroom.

Se perdi, ad esempio:

```text
3% tok/s
```

ma dimezzi:

```text
UI p99 latency
```

il trade-off può essere corretto per una chat.

---

# 27. Performance Hint Session

Un possibile wrapper NDK:

```cpp
class AndroidPerformanceSession {
public:
    void begin(
        std::span<const pid_t> thread_ids,
        std::chrono::nanoseconds target
    );

    void report(std::chrono::nanoseconds actual);

    void setTarget(std::chrono::nanoseconds target);

private:
    void* manager_ = nullptr;
    void* session_ = nullptr;
};
```

La API NDK Performance Hint è pensata per workload periodici e consente di riportare target duration e durata effettiva [S5].

Usarla come hint, non come garanzia di scheduling.

---

# 28. JNI boundary

La WebView non deve conoscere tensor, pointer, QNN o KV.

## 28.1 API pubblica

```kotlin
interface TalosNativeRuntime {
    fun loadModel(path: String): ModelHandle
    fun startGeneration(req: GenerationRequest): GenerationHandle
    fun cancel(handle: GenerationHandle)
    fun unloadModel(handle: ModelHandle)
}
```

Eventi:

```kotlin
sealed class TalosEvent {
    data class TokenBatch(
        val generationId: Long,
        val text: String,
        val tokenCount: Int
    ) : TalosEvent()

    data class Metrics(
        val generationId: Long,
        val decodeTokPerSec: Double,
        val thermalHeadroom: Double
    ) : TalosEvent()

    data class Completed(
        val generationId: Long
    ) : TalosEvent()
}
```

## 28.2 Nessun token event per token

Native:

```cpp
TokenBatcher batcher{
    .max_latency = 50ms,
    .max_bytes = 1024
};

while (decodeNext(token)) {
    batcher.push(tokenText);

    if (batcher.ready()) {
        emitToJava(batcher.take());
    }
}
```

Il backend di inferenza e il frontend devono essere progettati insieme.

---

# 29. Thread model

Possibile layout:

```text
Android Main/UI
    │
WebView renderer process
    │
Capacitor callbacks
────────────────────────────────
Native Talos process / app native
    │
    ├── Talos control thread
    ├── generation scheduler
    ├── sampler worker
    ├── background I/O
    └── QNN RPC / backend threads
```

## 29.1 Evitare

```text
UI thread
  ↓ JNI sync
Talos decode
  ↓
wait 30 ms
```

Ogni comando lungo deve essere asincrono.

## 29.2 Cancellazione

Cancellare a più livelli:

```text
UI
 ↓
GenerationToken.cancelled = true
 ↓
scheduler non lancia nuovo decode
 ↓
backend cancel se supportato
 ↓
rilascio lease
```

Non distruggere immediatamente l'intero model context per annullare una singola risposta.

---

# 30. Scheduler

## 30.1 Stato

```cpp
enum class GenerationState {
    Queued,
    Prefilling,
    Decoding,
    Paused,
    Cancelling,
    Finished,
    Failed
};
```

## 30.2 Loop

```cpp
while (!shutdown) {
    auto job = queue.next();

    if (!job) {
        wait();
        continue;
    }

    switch (job->state) {
        case GenerationState::Prefilling:
            runPrefillSlice(*job);
            break;

        case GenerationState::Decoding:
            runDecodeStep(*job);
            break;

        default:
            break;
    }

    governor.observe(*job);
}
```

---

# 31. Async execution

Qualcomm documenta asynchronous graph execution, HTP yielding e parallel graph execution [S1].

Non significa che il decode di un singolo stream diventi automaticamente parallelo.

La catena resta:

```text
token N
  ↓
decode
  ↓
logits
  ↓
sample token N+1
  ↓
decode
```

L'async è utile per:

- evitare blocco del control thread;
- overlap di bookkeeping;
- overlap di UI batching;
- retrieval/embedding concorrente;
- speculative decoding;
- multi-engine.

---

# 32. Sampling

Profilare il sampler separatamente.

## 32.1 Pipeline

```text
HTP
 ↓
LM head
 ↓
logits
 ↓
host-visible buffer
 ↓
penalties
 ↓
temperature
 ↓
top-k
 ↓
top-p
 ↓
sample
```

## 32.2 Obiettivo

Una sola materializzazione utile dei logits.

Evita:

```text
HTP logits
  ↓ copy
CPU full logits
  ↓ transform
GPU
  ↓ copy
CPU sample
```

Se il vocabolario è grande e il trasferimento domina, valutare in futuro:

- TopK backend-side;
- partial logits processing;
- fused sampling custom path.

Solo dopo profiling.

---

# 33. Speculative decoding

Da progettare nell'ABI già oggi, implementare dopo.

## 33.1 Engine

```cpp
class GenerationEngine {
public:
    virtual Result<TokenBatch> propose(...);
    virtual Result<VerificationResult> verify(...);
};
```

## 33.2 Schema

```text
Draft small model:
 d1 d2 d3 d4
      │
      ▼
Target model verification
      │
  accepted: d1 d2 d3
  rejected: d4
```

## 33.3 Metriche

Non guardare solo speedup.

Misurare:

```text
acceptance rate
draft cost
verification cost
KV synchronization cost
memory overhead
energy/token
```

Su mobile un draft model aggiuntivo può peggiorare pressione memoria/termica.

---

# 34. Multi-backend routing

Non assumere che HTP sia sempre il migliore per ogni fase.

## 34.1 Backend matrix

```text
                      Prefill     Decode      Small ops
QNN HTP                 ✓           ✓            ?
QNN GPU                 test        test         ?
CPU NEON                 ?           ?           ✓
```

## 34.2 Autotuning

Alla prima installazione o in laboratorio:

```text
model + device
   ↓
benchmark candidates
   ↓
device profile
```

Esempio:

```json
{
  "device_class": "snapdragon_target_A",
  "model": "model_x",
  "route": {
    "prefill": "qnn_htp",
    "decode": "qnn_htp",
    "sampler": "cpu"
  }
}
```

Non eseguire un benchmark pesante a ogni startup.

---

# 35. Runtime fallback

Fallback deve essere granulare e controllato.

## 35.1 Policy

```cpp
struct FallbackPolicy {
    bool allow_compile_fallback;
    bool allow_runtime_recovery;
    BackendKind recovery_backend;
};
```

## 35.2 Caso

```text
HTP execution failure
   ↓
mark context unhealthy
   ↓
stop accepting work
   ↓
persist conversation state
   ↓
recreate context
   ↓
retry only if operation idempotent
```

Non rieseguire ciecamente un token se lo stato KV potrebbe essere già mutato.

---

# 36. Transactional decode

Per evitare corruzione dopo errori:

```text
KV used = N
  ↓
begin token transaction
  ↓
write provisional N+1
  ↓
backend success?
   ├─ yes → commit used=N+1
   └─ no  → rollback used=N
```

API:

```cpp
auto txn = kv.beginAppend();

auto status = decode(..., txn.writeView());

if (status.ok()) {
    txn.commit();
} else {
    txn.rollback();
}
```

Questo facilita:

- cancellation;
- retry;
- backend reset;
- speculative verification.

---

# 37. Error taxonomy

```cpp
enum class BackendError {
    UnsupportedOp,
    UnsupportedShape,
    OutOfMemory,
    DeviceUnavailable,
    ContextInvalid,
    Timeout,
    Cancelled,
    BackendReset,
    ArtifactIncompatible,
    NumericalValidationFailed,
    Unknown
};
```

Non propagare stringhe QNN fino alla UI.

Conservare:

```text
Talos error
backend native code
human readable native message
graph name
op name
device info
```

nel log diagnostico.

---

# 38. SSR / accelerator reset

Lo stack QNN documenta handling di HTP SubSystem Restart nel QNN EP [S2].

Talos deve assumere che l'acceleratore possa diventare non disponibile.

## Recovery design

```text
failure
 ↓
stop scheduler
 ↓
invalidate execution contexts
 ↓
do NOT discard user conversation
 ↓
reinitialize backend
 ↓
reload context binary
 ↓
restore KV if persistibile
 or re-prefill last safe checkpoint
 ↓
resume
```

La UI deve ricevere:

```text
accelerator_recovering
```

non un crash nativo.

---

# 39. Persistenza

Persistenza separata:

```text
Conversation state
Model state
Runtime artifact
KV cache checkpoint
```

## 39.1 Non persistere sempre KV

Il KV può essere enorme.

Policy:

- conversazione testuale: sempre;
- token IDs: sempre o facilmente ricostruibili;
- KV: opzionale;
- prefix KV ad alto riuso: eventualmente;
- transient decode KV: in RAM.

---

# 40. Modello dati generation

```cpp
struct GenerationRequest {
    SessionId session;
    std::span<const TokenId> prompt;

    uint32_t max_new_tokens;

    float temperature;
    float top_p;
    uint32_t top_k;

    uint64_t seed;

    QoSClass qos;
};

struct GenerationMetrics {
    double load_ms;
    double prefill_ms;
    double ttft_ms;

    double prefill_tok_s;
    double decode_tok_s;

    double inter_token_p50_ms;
    double inter_token_p95_ms;
    double inter_token_p99_ms;

    uint64_t peak_rss_bytes;
    uint64_t kv_bytes;

    double thermal_headroom_min;

    uint32_t fallback_ops;
};
```

---

# 41. KPI: non usare solo token/s

Per Talos:

## Responsività

- TTFT p50/p95;
- inter-token p50/p95/p99;
- cancel latency;
- UI input latency;
- janky frame ratio.

## Throughput

- prefill token/s;
- decode token/s.

## Memoria

- model mapped bytes;
- runtime RSS;
- peak RSS;
- KV bytes/token;
- context binary bytes.

## Power / thermal

- thermal headroom;
- tempo fino al throttling;
- throughput sostenuto a 5/10 minuti;
- energia/token se misurabile.

## Qualità

- perplexity delta;
- token agreement;
- task quality.

---

# 42. Sustained benchmark

Mai valutare solo primi 10 secondi.

## Protocollo

```text
T0
 ↓
cold model load
 ↓
prompt standard
 ↓
generate 512 token
 ↓
short idle
 ↓
repeat per 10 minuti
```

Registrare ogni 5 s:

```text
tok/s
temperature/thermal headroom
CPU frequency
scheduler state
RSS
jank
```

Grafico ideale:

```text
tok/s
 │ ─────────────────────
 │
 │
 └────────────────────── time
```

Grafico problematico:

```text
tok/s
 │ ─────────
 │          \
 │           \______
 └────────────────── time
```

---

# 43. QNN performance modes

Il QNN EP espone modalità come `burst`, `balanced`, `high_performance`, `sustained_high_performance`, power saver, ecc. [S2].

Talos dovrebbe tradurle in intenti.

```text
Talos Benchmark
 → burst/high-performance candidate

Talos Interactive
 → profile misurato per TTFT + UI

Talos Sustained
 → sustained mode candidate

Talos Battery
 → power-saving candidate
```

Mai assumere universalmente che `burst` sia la scelta migliore per una chat lunga.

---

# 44. Graph finalization

Il QNN EP espone livelli di ottimizzazione della finalizzazione del graph: livelli più alti possono aumentare il tempo di preparazione cercando graph più ottimali [S2].

Questo rinforza la scelta:

```text
compile AOT
```

anziché:

```text
compile pesante all'apertura chat
```

Per un artifact distributivo:

```text
offline compile → high optimization
runtime → load cached context
```

---

# 45. Version pinning

La toolchain mobile AI cambia rapidamente.

ExecuTorch 1.3, nella documentazione corrente, indica QNN 2.37.0 come versione verificata/raccomandata nel relativo tutorial, pur segnalando che possono esistere release più nuove [S3]. Il QNN EP di ONNX Runtime documenta `optrace` con QAIRT 2.39+ [S2].

Conclusione:

- non usare "latest" automaticamente;
- pin SDK;
- pin NDK;
- pin compiler host;
- pin firmware/device test;
- mantenere una matrice di compatibilità.

```yaml
toolchain:
  android_ndk: "PIN"
  qnn_sdk: "PIN"
  cmake: "PIN"
  clang: "PIN"

targets:
  - device: "reference_tablet"
    os_build: "PIN"
    firmware: "PIN"
```

---

# 46. CMake boundary

Esempio schematico:

```cmake
option(TALOS_ENABLE_QNN "Build Qualcomm QNN backend" ON)

add_library(talos_core STATIC
    core/runtime.cpp
    core/scheduler.cpp
    core/kv/kv_cache.cpp
    ir/graph.cpp
)

if(TALOS_ENABLE_QNN)
    add_library(talos_qnn STATIC
        backends/qnn/qnn_backend.cpp
        backends/qnn/qnn_loader.cpp
        backends/qnn/qnn_graph_builder.cpp
        backends/qnn/qnn_memory.cpp
    )

    target_include_directories(talos_qnn PRIVATE
        "${QNN_SDK_ROOT}/include"
    )

    target_link_libraries(talos_qnn PRIVATE
        talos_core
        dl
        log
    )
endif()
```

Preferire dynamic loading delle librerie backend quando utile a compatibilità/package strategy.

---

# 47. Backend loader

```cpp
Result<std::unique_ptr<Backend>> createBestBackend(
    const DeviceInfo& device
) {
    if (device.hasQnnHtp()) {
        auto qnn = tryCreateQnnHtpBackend(device);

        if (qnn) {
            return qnn;
        }
    }

    if (device.supportsVulkanCompute()) {
        auto gpu = tryCreateVulkanBackend(device);

        if (gpu) {
            return gpu;
        }
    }

    return createCpuBackend(device);
}
```

Per debugging:

```text
TALOS_BACKEND=qnn
TALOS_BACKEND=cpu
TALOS_BACKEND=reference
```

deve poter forzare il backend.

---

# 48. Device capability database

Non affidarsi soltanto al marketing name.

```cpp
struct DeviceInfo {
    std::string manufacturer;
    std::string soc;
    std::string android_build;

    int android_api;

    std::optional<int> qnn_soc_id;
    std::optional<int> htp_arch;

    uint64_t ram_bytes;
};
```

Mantenere capabilities rilevate runtime + overrides testati.

---

# 49. Manifest compatibility

```cpp
bool Artifact::compatible(const DeviceInfo& d) const {
    if (manifest.talos_ir != TALOS_IR_VERSION)
        return false;

    if (manifest.backend_abi != TALOS_QNN_ABI)
        return false;

    if (!manifest.target.matches(d))
        return false;

    return verifyChecksums();
}
```

Se incompatibile:

```text
non provare "comunque"
```

Fallback a:

- ricompilazione;
- artifact alternativo;
- CPU.

---

# 50. Security

Il backend carica:

- model file;
- context binary;
- tokenizer;
- quant metadata;
- eventualmente custom op package.

Sono input ad alto privilegio per codice nativo.

## 50.1 Regole

- manifest firmato o almeno hash verificato;
- limiti dimensionali prima delle allocazioni;
- integer overflow checks;
- bounds checks;
- no path traversal;
- no `dlopen` di una libreria indicata liberamente dal modello;
- custom op package solo distribuito con Talos;
- mai eseguire codice proveniente dalla model card;
- fuzz dell'importer.

## 50.2 Separare dati e codice

Un modello scaricato non deve poter dichiarare:

```json
{
  "op_package": "/sdcard/Download/evil.so"
}
```

Il runtime deve mappare un ID noto:

```json
{
  "required_op_package": "talos_htp_ops_v3"
}
```

su una libreria interna firmata nell'app.

---

# 51. Model validation prima di allocare

```cpp
Status validateTensorHeader(const Header& h) {
    if (h.rank > 8)
        return BadModel;

    uint64_t elements = 1;

    for (auto dim : h.dims) {
        if (dim <= 0)
            return BadModel;

        if (mul_overflow(elements, uint64_t(dim), &elements))
            return BadModel;
    }

    uint64_t bytes;

    if (mul_overflow(elements, bytesPerElement(h.dtype), &bytes))
        return BadModel;

    if (bytes > MAX_SINGLE_TENSOR_BYTES)
        return BadModel;

    return Ok;
}
```

---

# 52. Observability

Ogni generazione riceve un trace ID:

```text
generation_id = 0x7fa3...
```

Marker:

```text
Talos.LoadModel
Talos.LoadArtifact
Talos.Prefill
Talos.PrefillChunk
Talos.Decode
Talos.QnnExecute
Talos.Sample
Talos.KVAppend
Talos.NativeTokenBatch
Talos.CapacitorDispatch
```

---

# 53. Perfetto

Android raccomanda Perfetto per system tracing moderno; FrameTimeline permette di identificare jank confrontando timeline attesa ed effettiva [S7][S8].

CPU scheduling tracing permette di vedere:

- su quale core gira un thread;
- quando è stato deschedulato;
- perché;
- quanto è rimasto runnable senza ricevere CPU [S9].

Questo è essenziale per capire:

```text
"la WebView è lenta"
```

contro:

```text
"il main thread è runnable ma l'inferenza satura i core"
```

## 53.1 Marker C++

Su Android:

```cpp
#include <android/trace.h>

class TraceScope {
public:
    explicit TraceScope(const char* name) {
        ATrace_beginSection(name);
    }

    ~TraceScope() {
        ATrace_endSection();
    }
};

void decodeStep() {
    TraceScope trace("Talos.Decode");
    // ...
}
```

---

# 54. QNN profiling

Il QNN EP documenta livelli:

```text
off
basic
detailed
optrace
```

con `optrace` collegato a tooling QNN/QHAS nelle versioni QAIRT che lo supportano [S2].

Talos deve poter associare:

```text
QNN op event
```

al:

```text
Talos IR node
```

## 54.1 Mapping

Durante lowering:

```cpp
qnnNode.debugName =
    "talos.layer17.attention.q_proj";
```

Così il profiler non produce:

```text
node_417
```

ma un nome semanticamente utile.

---

# 55. Benchmark harness

CLI:

```bash
talos-bench \
  --model ./model.talos \
  --backend qnn-htp \
  --prompt datasets/prompt_2048.tokens \
  --new-tokens 256 \
  --warmup 3 \
  --runs 20 \
  --trace
```

Output:

```json
{
  "load_ms": {
    "p50": 183.4,
    "p95": 191.2
  },
  "ttft_ms": {
    "p50": 248.2,
    "p95": 273.8
  },
  "prefill_tok_s": {
    "p50": 811.2
  },
  "decode_tok_s": {
    "p50": 42.8
  },
  "inter_token_ms": {
    "p50": 23.3,
    "p95": 26.1,
    "p99": 41.7
  },
  "peak_rss_mb": 4380,
  "kv_mb": 744,
  "jank_ratio": 0.009
}
```

I numeri sono un esempio di formato, non target dichiarati.

---

# 56. Benchmark suite

Minimo:

```text
P0: prompt 32 / output 64
P1: prompt 128 / output 256
P2: prompt 512 / output 256
P3: prompt 2048 / output 256
P4: prompt 4096 / output 256
P5: prompt 8192 / output 128
```

Aggiungere:

```text
cold load
warm load
thermal sustained
cancel test
background/foreground
screen refresh 60/120
UI scrolling durante decode
```

---

# 57. UI-coexistence benchmark

Questo è fondamentale per Talos.

## Scenario

Mentre il modello genera:

1. scroll continuo nella chat;
2. apertura/chiusura reasoning;
3. digitazione nella textarea;
4. cambio tab;
5. rendering model card;
6. infinite scroll risultati.

Misurare:

```text
input latency
FrameTimeline jank
main-thread runnable delay
decode token/s
inter-token p99
thermal
```

L'obiettivo non è vincere un benchmark isolato di inferenza.

---

# 58. Regressione performance in CI

Per hardware reale:

```text
main
  ↓
nightly build
  ↓
device farm / lab device
  ↓
talos-bench
  ↓
compare baseline
```

Fail se, ad esempio:

```text
TTFT p95      > +10%
decode tok/s  < -7%
peak RSS      > +8%
jank ratio    > threshold
```

Le soglie devono essere stabilite dopo aver misurato la varianza dei device.

---

# 59. Test numerici per op

```cpp
TEST(QnnBackend, RmsNormMatchesReference) {
    auto input = randomTensor(...);

    auto ref = reference.rmsNorm(input);
    auto got = qnn.rmsNorm(input);

    EXPECT_LT(maxAbs(ref, got), tolerance);
    EXPECT_GT(cosine(ref, got), 0.999);
}
```

Tolleranze dipendenti dalla precisione.

---

# 60. Differential graph testing

Generare piccoli graph casuali dentro il subset supportato:

```text
Talos IR graph
  ├── reference backend
  └── QNN backend
```

Confrontare output.

Questo trova errori in:

- broadcast;
- stride;
- transpose;
- quant zero-point;
- aliasing;
- reshape.

---

# 61. Fuzzing importer

Target:

```text
GGUF metadata parser
tensor header
manifest parser
tokenizer files
context artifact parser Talos
```

Sanitizer host build:

```bash
-fsanitize=address,undefined,fuzzer
```

prima della compilazione Android.

---

# 62. Performance anti-patterns

## 62.1 Event per token

```text
model token
 → JNI
 → Capacitor
 → JS
```

per ogni token.

**No.**

Batch 32–100 ms in funzione del QoS.

## 62.2 Rebuild graph per generation

**No.**

Graph/context è model-scoped o profile-scoped.

## 62.3 Copiare i pesi a ogni sessione

**No.**

Weights condivisi/immutable.

## 62.4 Allocare KV incrementalmente a ogni token

**No.**

Reserve o block allocator.

## 62.5 Dequantizzare tutto upfront in RAM

**No**, salvo che un backend specifico lo richieda e il benchmark lo giustifichi.

## 62.6 Custom kernel prima del profiling

**No.**

## 62.7 Burst permanente

**No**, finché un sustained test non dimostra che conviene.

## 62.8 Threads = core count sempre

**No.**

UI e thermal devono entrare nella policy.

## 62.9 Un solo graph dinamico universale

Per HTP è rischioso e contrasta con la necessità di shape fisse evidenziata dal QNN EP [S2].

---

# 63. Milestone 0 — Baseline

Prima di costruire Talos-QNN:

- fissare un modello;
- fissare un device;
- ottenere baseline CPU;
- ottenere baseline QNN tramite ExecuTorch o ONNX Runtime;
- verificare operator coverage;
- raccogliere QNN profile;
- raccogliere Perfetto.

Deliverable:

```text
baseline/
├── cpu.json
├── qnn.json
├── qnn_profile.csv
└── system.perfetto-trace
```

---

# 64. Milestone 1 — Backend ABI

Implementare:

```text
Talos IR minimale
ReferenceBackend
QnnBackend stub
```

Definition of done:

- un graph MatMul passa da importer a reference;
- lo stesso graph passa a QNN;
- output confrontabile;
- nessun tipo QNN esposto fuori adapter.

---

# 65. Milestone 2 — Static decode graph

Supportare solo:

```text
batch=1
sequence=1
fixed model
fixed context max
```

Niente prompt lunghi inizialmente.

Obiettivo:

```text
1 token end-to-end
```

con metriche.

---

# 66. Milestone 3 — Prefill buckets

Aggiungere:

```text
128
512
2048
```

e benchmarkare:

```text
compile size
TTFT
padding overhead
```

Eliminare bucket non utili.

---

# 67. Milestone 4 — KV ownership

Spostare completamente la responsabilità KV dentro runtime/backend abstraction.

Definition of done:

- generate;
- cancel;
- rewind;
- regenerate;
- context limit;
- OOM prevedibile.

---

# 68. Milestone 5 — AOT context cache

Artifact:

```text
compile una volta
load molte volte
```

Definition of done:

- cold load misurato;
- incompatibilità rilevata;
- cache invalidata correttamente;
- checksum verificato.

---

# 69. Milestone 6 — Quantization search

Creare almeno:

```text
profile A
profile B
profile C
```

e tracciare Pareto frontier:

```text
quality
latency
RAM
thermal
```

Non scegliere soltanto il profilo più veloce.

---

# 70. Milestone 7 — UI-aware governor

Integrare:

```text
Thermal API
Performance Hint
UI jank metric
```

Policy dinamica.

Definition of done:

- UI benchmark migliora;
- throughput sostenuto non collassa;
- cancel resta rapido.

---

# 71. Milestone 8 — Custom ops

Solo ora.

Prima candidati:

- op che crea fallback;
- fusion con traffico memoria elevato;
- pattern dominante del modello.

Ogni custom op deve avere:

```text
reference test
quant test
fuzz shape test
microbench
end-to-end bench
thermal bench
```

---

# 72. Milestone 9 — Prefix sharing

Implementare:

```text
shared immutable prefix KV
+ branch-specific tail
```

Misurare:

- TTFT nuova chat;
- RAM;
- eviction;
- correctness.

---

# 73. Milestone 10 — Speculative decoding

Solo con baseline stabile.

Definition of done:

```text
speedup sustained > overhead
quality identica entro sampling semantics
RAM sotto limite
UI non degradata
```

---

# 74. Decision log iniziale

| Decisione | Scelta |
|---|---|
| Backend primario | QNN/HTP |
| Core coupling | nessuno verso QNN |
| IR | Talos minimal SSA-like graph |
| Shape policy | symbolic → static specialization |
| Prefill/decode | graph separati |
| KV | first-class resource |
| Allocation decode | preplanned / zero steady-state heap alloc |
| Artifact | AOT cache |
| Fallback development | disabilitato |
| Fallback production | esplicito + telemetry |
| UI bridge | control/events soltanto |
| Profiling | QNN + Perfetto |
| Thermal | adaptive governor |
| Custom ops | post-profiling |
| NNAPI | non target |

NNAPI è deprecata da Android 15 e Android suggerisce percorsi alternativi per workload performance-critical [S10].

---

# 75. Esempio: flusso completo di una richiesta

```text
User preme Send
   │
   ▼
Vue
   │ lightweight IPC
   ▼
Capacitor Android plugin
   │
   ▼
TalosRuntime::generate()
   │
   ├── tokenize
   ├── prefix lookup
   ├── KV allocate/reuse
   │
   ▼
Scheduler
   │
   ├── choose prefill bucket
   ├── choose QNN tuning profile
   │
   ▼
QNN prefill graph
   │
   ▼
KV state
   │
   ▼
decode graph
   │
   ▼
logits
   │
   ▼
sampler
   │
   ├── token text → native batch buffer
   │
   └── token id → next decode
          │
          └── repeat
```

Parallelamente:

```text
Thermal monitor
   ↓
Governor
   ↓
scheduler / worker / batch policy
```

e:

```text
QNN profiler + ATrace
   ↓
Perfetto
```

---

# 76. Esempio: Session API

```cpp
class TalosSession {
public:
    Result<void> load(const ModelArtifact& model);

    GenerationId generate(
        const GenerationRequest& request,
        GenerationListener& listener
    );

    void cancel(GenerationId id);

    Result<void> rewind(
        ConversationId conversation,
        TokenPosition position
    );

private:
    Runtime& runtime_;
    SessionKVStore kv_;
};
```

Listener:

```cpp
class GenerationListener {
public:
    virtual void onTextBatch(
        GenerationId,
        std::string_view utf8
    ) = 0;

    virtual void onMetrics(
        GenerationId,
        const GenerationMetrics&
    ) = 0;

    virtual void onComplete(
        GenerationId
    ) = 0;

    virtual void onError(
        GenerationId,
        const TalosError&
    ) = 0;
};
```

---

# 77. Esempio: backend compile

Pseudocode:

```cpp
Result<CompiledProgram> QnnBackend::compile(
    const Graph& source,
    const CompileOptions& options
) {
    Graph graph = source;

    TALOS_RETURN_IF_ERROR(validateStaticShapes(graph));

    auto qnnContext = createContext(options);

    auto mapping = QnnGraphBuilder{
        qnnContext,
        options
    }.lower(graph);

    if (!options.allow_cpu_fallback &&
        mapping.hasUnsupportedNodes()) {
        return Error::UnsupportedGraph;
    }

    TALOS_RETURN_IF_ERROR(
        finalizeGraph(mapping)
    );

    return CompiledProgram{
        std::make_shared<QnnCompiledProgramImpl>(
            std::move(qnnContext),
            std::move(mapping)
        )
    };
}
```

---

# 78. Esempio: decode loop robusto

```cpp
Status Generator::run() {
    while (!stopRequested() &&
           generated_ < request_.max_new_tokens) {

        TraceScope trace("Talos.DecodeIteration");

        auto txn = kv_.beginAppend();

        auto logits = backend_.decode(
            decode_ctx_,
            current_token_,
            txn.writeView()
        );

        if (!logits) {
            txn.rollback();
            return recoverOrFail(logits.error());
        }

        auto token = sampler_.sample(*logits);

        txn.commit();

        current_token_ = token.id;
        ++generated_;

        token_batcher_.push(token.text);

        if (token_batcher_.ready()) {
            listener_.onTextBatch(
                id_,
                token_batcher_.take()
            );
        }

        governor_.observeIteration();
    }

    token_batcher_.flush();
    return Status::Ok;
}
```

---

# 79. Esempio: prefix reuse

```cpp
auto prefix = prefixCache.lookup(
    model.fingerprint(),
    tokenizer.hash(),
    prompt.prefixTokens()
);

if (prefix) {
    kv.attachSharedPrefix(prefix->kv);
    prompt = prompt.remove_prefix(prefix->tokens);
}

runPrefill(prompt);
```

---

# 80. Esempio: arena

```cpp
class Arena {
public:
    explicit Arena(size_t capacity)
        : storage_(alignedAlloc(capacity, 4096)),
          capacity_(capacity) {}

    void* at(size_t offset) {
        assert(offset < capacity_);
        return static_cast<std::byte*>(storage_) + offset;
    }

private:
    void* storage_;
    size_t capacity_;
};
```

Plan compilato:

```json
{
  "arena_bytes": 18874368,
  "buffers": {
    "attn_q": 0,
    "attn_k_tmp": 2097152,
    "attn_v_tmp": 4194304,
    "mlp_tmp": 0
  }
}
```

L'alias `mlp_tmp = 0` è valido solo se lifetime analysis prova che non è live insieme ad `attn_q`.

---

# 81. Esempio: power profiles

```json
{
  "interactive": {
    "qnn_mode": "measured-interactive",
    "cpu_workers": 3,
    "prefill_chunk": 512,
    "ui_token_batch_ms": 50
  },
  "balanced": {
    "qnn_mode": "measured-balanced",
    "cpu_workers": 4,
    "prefill_chunk": 1024,
    "ui_token_batch_ms": 66
  },
  "battery": {
    "qnn_mode": "measured-efficient",
    "cpu_workers": 2,
    "prefill_chunk": 256,
    "ui_token_batch_ms": 100
  }
}
```

I nomi QNN concreti restano confinati nell'adapter.

---

# 82. Esempio: test di fallback involontario

In CI:

```text
compile model with:
allow_cpu_fallback = false
```

Se un upgrade cambia operator support:

```text
CI FAIL
```

anziché scoprire mesi dopo che:

```text
layer 18 attention
```

sta girando su CPU.

---

# 83. Esempio: operator coverage report

```text
Graph: decode

Total Talos nodes:            412
Lowered to HTP:               408
CPU fallback:                   4

Fallback:
- layer.0.rope
- layer.1.rope
- layer.2.rope
- layer.3.rope

Boundary count:                 8
Estimated transfer bytes:   12.4 MB/token
```

Questa informazione è più utile di:

```text
99% operatori supportati
```

perché quattro op collocati male possono distruggere le prestazioni.

---

# 84. Esempio: compile-time graph lint

Regole:

```text
WARN if:
- graph boundary > 2
- transpose count > threshold
- quant/dequant pair consecutive
- tensor > configured max
- fallback inside each transformer layer
- activation copied host-side
```

Output:

```text
W102: repeated HTP→CPU→HTP transition
node: layer.*.rope
occurrences: 32
severity: critical
suggestion: backend lowering or custom op
```

---

# 85. Esempio: modello di costo del boundary

Misurare device-specific:

```text
host→HTP fixed overhead
HTP→host fixed overhead
bandwidth effective
sync latency
```

Fit semplice:

```text
transfer_time(bytes) =
  fixed_latency
  + bytes / effective_bandwidth
```

Usarlo nel partitioner.

Non usare costanti prese da datasheet teorici.

---

# 86. Processo di tuning corretto

Ordine:

```text
1 correctness
2 graph coverage
3 boundary removal
4 memory copies
5 AOT caching
6 layout
7 quantization
8 VTCM
9 performance mode
10 custom kernel
```

Molti team iniziano dal punto 10 e lasciano il 3 irrisolto.

---

# 87. Tool `talos-inspect`

```bash
talos-inspect model.talos
```

Output:

```text
Talos artifact v1
Model:          ...
IR version:     7
Backend:        qnn-htp
Quant:          w4a8-mixed-v3

Graphs:
decode          static [1,1,...]
prefill_128     static [1,128,...]
prefill_512     static [1,512,...]

Memory:
weights         2.91 GiB
KV @ 8192       0.74 GiB
activation max  22 MiB

Coverage:
HTP             100%
CPU             0%

Custom ops:
talos_rope_v2
```

---

# 88. Tool `talos-diff`

```bash
talos-diff \
  --reference cpu-fp16 \
  --candidate qnn-htp \
  --dataset calibration.jsonl
```

Output:

```text
samples                    500
max logit abs error        ...
mean cosine                ...
top1 agreement             ...
PPL delta                  ...
first failing layer        17
```

---

# 89. Feature flags

Ogni ottimizzazione complessa deve poter essere disattivata:

```text
TALOS_DISABLE_PREFIX_CACHE
TALOS_DISABLE_CUSTOM_OPS
TALOS_DISABLE_SHARED_MEMORY
TALOS_DISABLE_KV8
TALOS_DISABLE_SPECULATIVE
TALOS_FORCE_QNN_PROFILE
```

Su build production possono essere configurazioni interne.

Questo riduce drasticamente il tempo di root-cause analysis.

---

# 90. Crash resilience

Se il renderer WebView muore, il modello non dovrebbe necessariamente essere ricaricato.

Separare lifecycle:

```text
Activity/WebView lifecycle
      !=
Talos model lifecycle
```

A seconda dell'architettura Android:

- runtime nativo può vivere nel processo app;
- UI può ricrearsi;
- conversazione e generation state vengono riagganciati.

Se invece l'intero processo muore:

- persistence periodica;
- artifact AOT;
- ricostruzione rapida.

---

# 91. Memory pressure

Talos deve avere un memory budget esplicito.

```cpp
struct MemoryBudget {
    uint64_t max_model;
    uint64_t max_kv;
    uint64_t max_prefix_cache;
    uint64_t max_activation;
};
```

Prima di accettare context extension:

```cpp
if (!budget.canGrowKV(next_tokens)) {
    return ContextWouldExceedMemory;
}
```

Meglio un errore controllato prima di un OOM del processo.

---

# 92. Block KV allocator

Per context variabile:

```text
KV block = 64 o 128 token
```

(non prescrittivo: benchmark).

```cpp
struct KVBlock {
    BlockId id;
    uint32_t used;
    void* backend_storage;
};
```

Benefici:

- crescita incrementale;
- prefix sharing;
- COW;
- eviction;
- rewind semplice.

Costo:

- indirection;
- possibile incompatibilità con graph/layout backend.

Prima verificare come il backend preferisce ricevere lo stato.

---

# 93. LoRA

Progettare model identity come:

```text
base model fingerprint
+
adapter fingerprint
```

Se il backend supporta adapter dinamici, non ricompilare tutto inutilmente.

Il QNN EP documenta un percorso LoRAv2 [S2], ma la strategia Talos deve restare astratta:

```cpp
struct AdapterSet {
    std::vector<AdapterId> adapters;
};
```

---

# 94. Model registry

```cpp
struct ModelRecord {
    ModelFingerprint source;
    std::vector<ArtifactRecord> artifacts;
};

struct ArtifactRecord {
    BackendKind backend;
    DeviceClass target;
    QuantProfileId quant;
    Path path;
};
```

Selection:

```text
exact device artifact
 ↓ else
compatible device-class artifact
 ↓ else
compile
 ↓ else
CPU
```

---

# 95. Offline-first

Tutti i seguenti componenti devono essere locali:

- compiler runtime necessario;
- QNN libraries distribuite secondo licenza/package applicabile;
- tokenizer;
- model;
- artifact;
- benchmark metadata;
- op packages;
- fallback kernels.

Nessun passaggio deve richiedere una CDN o un servizio remoto.

---

# 96. Criteri di successo MVP

Un MVP è riuscito quando:

- lo stesso modello genera correttamente su reference e HTP;
- decode ha zero fallback involontari;
- context binario viene riusato;
- decode steady-state non alloca heap in modo significativo;
- cancellazione è affidabile;
- KV rewind funziona;
- il runtime sopravvive a UI navigation;
- è possibile produrre un trace Perfetto leggibile;
- TTFT e decode vengono misurati automaticamente;
- jank UI viene misurato mentre il modello gira.

Non serve ancora un custom op.

---

# 97. Roadmap a tranche

La seguente è una scomposizione tecnica, non una stima temporale contrattuale.

## Tranche A — Ground truth

```text
Baseline ExecuTorch/QNN
Baseline CPU
Perfetto
QNN profiling
```

## Tranche B — Talos Core

```text
IR
Reference backend
Backend ABI
Importer
```

## Tranche C — QNN MVP

```text
static graph
decode
prefill
strict coverage
```

## Tranche D — Runtime

```text
KV
arena
cancellation
AOT artifact
```

## Tranche E — Product integration

```text
JNI
Capacitor batch
thermal governor
UI benchmark
```

## Tranche F — Advanced

```text
mixed quant
prefix sharing
custom op
speculative
```

---

# 98. Domande da rispondere con benchmark, non opinioni

Prima di finalizzare il backend:

1. Quale precisione HTP è migliore per questo modello?
2. Quanto costa un boundary HTP/CPU sul device reale?
3. Quanto VTCM è ottimale?
4. Quale finalization profile conviene se il context è AOT?
5. Prefill monolitico o chunked?
6. Quali bucket minimizzano TTFT senza gonfiare storage?
7. KV8 migliora abbastanza la memoria senza degradare qualità?
8. HTP è migliore anche in decode batch=1?
9. Quanti CPU worker lasciare liberi?
10. Quanto cambia performance dopo 5/10 minuti?
11. Shared memory elimina davvero copie nel percorso attuale?
12. Qual è il p99 inter-token sotto scrolling UI?
13. Quale op crea più boundary?
14. Quale custom fusion produce un guadagno end-to-end misurabile?

---

# 99. Checklist pre-merge di un'ottimizzazione

```text
[ ] numerical regression pass
[ ] reference differential pass
[ ] no new CPU fallback
[ ] no new HTP/CPU boundary
[ ] no unexpected heap allocation
[ ] peak RSS measured
[ ] TTFT measured
[ ] decode p50/p95/p99 measured
[ ] sustained 10-min run measured
[ ] UI jank measured
[ ] thermal trace recorded
[ ] cancellation tested
[ ] old artifact invalidation tested
[ ] feature can be disabled
```

---

# 100. Raccomandazione finale

La prima versione utile di "Talos Accelerator" dovrebbe essere molto meno ambiziosa di un nuovo compiler universale, ma molto più profonda di un semplice wrapper QNN.

Costruire:

```text
Talos Runtime
+
Talos IR
+
QNN/HTP adapter
+
first-class KV
+
AOT context cache
+
memory planner
+
profiler
+
thermal/UI governor
```

Prima di:

```text
custom Hexagon kernels
```

Per il workload chat locale, i guadagni iniziali più probabili arrivano da:

1. graph coverage completo;
2. zero boundary inutili;
3. zero-copy/shared buffers dove realmente supportati;
4. prefill/decode specializzati;
5. context compilation cache;
6. KV ownership e riuso;
7. memory planning;
8. quantizzazione mista;
9. scheduling rispettoso di UI/thermal.

Solo quando questi punti sono misurati ha senso investire pesantemente in custom HTP Op Packages.

---

# Appendice A — Contratto ABI C minimale

Se Talos deve essere consumato da JNI o altri linguaggi, mantenere un'ABI C.

```c
typedef struct talos_runtime talos_runtime_t;
typedef struct talos_model talos_model_t;
typedef struct talos_generation talos_generation_t;

typedef enum {
    TALOS_OK = 0,
    TALOS_CANCELLED,
    TALOS_OOM,
    TALOS_BACKEND_ERROR,
    TALOS_INVALID_MODEL
} talos_status_t;

typedef struct {
    uint32_t max_new_tokens;
    float temperature;
    float top_p;
    uint32_t top_k;
    uint64_t seed;
} talos_generation_config_t;

typedef void (*talos_text_callback)(
    void* userdata,
    const char* utf8,
    size_t len
);

talos_status_t talos_runtime_create(
    talos_runtime_t** out
);

talos_status_t talos_model_load(
    talos_runtime_t* runtime,
    const char* path,
    talos_model_t** out
);

talos_status_t talos_generate_async(
    talos_model_t* model,
    const int32_t* tokens,
    size_t token_count,
    const talos_generation_config_t* config,
    talos_text_callback callback,
    void* userdata,
    talos_generation_t** out
);

void talos_generation_cancel(
    talos_generation_t* generation
);
```

L'ABI C protegge JNI da modifiche C++ ABI.

---

# Appendice B — State machine

```text
                 load
Unloaded ─────────────────> Ready
                              │
                              │ generate
                              ▼
                         Prefilling
                              │
                              ▼
                          Decoding
                         /   |    \
                        /    |     \
                   cancel  error   eos
                     /       |       \
                    ▼        ▼        ▼
                Cancelling  Failed  Finished
                    │
                    ▼
                 Ready
```

Il modello e la generation non devono condividere la stessa state machine.

---

# Appendice C — Cache hierarchy

```text
L0  activation arena
L1  per-generation KV tail
L2  session KV
L3  prefix KV cache
L4  compiled graph context
L5  model weights mmap
```

Ogni livello ha lifetime diverso.

---

# Appendice D — Metric event schema

```json
{
  "schema": 1,
  "ts_ns": 123456789,
  "generation": "abc",
  "event": "decode_iteration",
  "fields": {
    "iteration": 117,
    "backend_ms": 18.2,
    "sample_ms": 0.4,
    "total_ms": 19.1,
    "thermal_headroom": 0.42,
    "kv_tokens": 3217
  }
}
```

Persistenza opzionale e locale.

---

# Appendice E — Threat model rapido

Asset da proteggere:

```text
native process integrity
QNN driver boundary
model files
conversation data
custom op packages
compiled artifact
```

Attaccante controlla potenzialmente:

```text
downloaded model file
metadata
model card
tokenizer file
artifact se non verificato
```

Boundary:

```text
untrusted model data
      │ validate
      ▼
Talos importer
      │ typed IR
      ▼
backend
```

Mai consentire che dati scaricati selezionino direttamente:

```text
.so path
native symbol
arbitrary file path
QNN backend library path
```

---

# Appendice F — Fonti primarie e documentazione tecnica

## [S1] Qualcomm Neural Processing SDK / QAIRT / QNN documentation

Qualcomm documenta nello stack corrente QAIRT, QNN, HTP, Op Packages, optimization grammar, scheduling/allocation, scratch buffers, tensor/memory layout, INT4, VTCM, yielding, parallel graph execution, asynchronous execution, shared buffer e componenti GenAI.

https://docs.qualcomm.com/bundle/publicresource/topics/80-63442-4/developing-apps-qualcomm-neural-processing-sdk.html?product=1601111740010412

## [S2] ONNX Runtime — QNN Execution Provider

Documenta fra l'altro backend CPU/GPU/HTP, HTP performance modes, VTCM option, graph finalization modes, shared-memory allocator, context binary cache, profiling, strict CPU fallback disable, fixed-shape requirement nel percorso documentato, quantized HTP model path, mixed precision e LoRAv2.

https://onnxruntime.ai/docs/execution-providers/QNN-ExecutionProvider.html

## [S3] ExecuTorch — Qualcomm AI Engine Backend

Documenta Qualcomm AI Engine Direct/QNN, delega verso Hexagon e Adreno, AOT lowering, Android integration, HTP emulator, Llama demo, quantization, custom ops e operator support.

https://docs.pytorch.org/executorch/stable/backends-qualcomm.html

## [S4] ONNX Runtime — EP Context Design

Descrive compilazione accelerator/NPU costosa, inclusi casi LLM che possono richiedere decine di minuti, e il modello di context cache/precompiled binary.

https://onnxruntime.ai/docs/execution-providers/EP-Context-Design.html

## [S5] Android — Performance Hint Manager

API Java/NDK per creare sessioni di thread correlati, specificare target duration e riportare actual work duration.

https://developer.android.com/reference/android/os/PerformanceHintManager

https://developer.android.com/ndk/reference/group/a-performance-hint

## [S6] Android — Thermal API / ADPF

Documentazione sull'adattamento del workload allo stato termico e thermal headroom.

https://developer.android.com/games/optimize/adpf/thermal

## [S7] Android — System tracing / Perfetto

Perfetto è lo strumento di system tracing raccomandato sui dispositivi Android moderni.

https://developer.android.com/topic/performance/tracing

## [S8] Perfetto — FrameTimeline

FrameTimeline confronta timeline attesa ed effettiva per identificare jank e include il lavoro GPU nella timeline effettiva.

https://perfetto.dev/docs/data-sources/frametimeline

## [S9] Perfetto — CPU scheduling events

Permette di osservare scheduling, core, descheduling e tempo runnable.

https://perfetto.dev/docs/data-sources/cpu-scheduling

## [S10] Android — NNAPI

NNAPI è deprecata da Android 15; la documentazione Android raccomanda alternative per workload performance-critical.

https://developer.android.com/ndk/guides/neuralnetworks

---

# Appendice G — Principi Talos da mantenere come invarianti

1. **Nessun tipo vendor nel core.**
2. **Nessun tensor attraverso Capacitor.**
3. **Nessun fallback invisibile in development.**
4. **Nessuna allocazione non necessaria nel decode loop.**
5. **KV è stato del runtime, non incidental output.**
6. **Prefill e decode sono workload distinti.**
7. **Static specialization prima di HTP.**
8. **AOT context prima di startup costoso.**
9. **Misurare p99, non solo media.**
10. **Misurare sustained, non solo burst.**
11. **UI latency è un KPI del backend.**
12. **Thermal headroom è un input dello scheduler.**
13. **Custom op solo dopo profiling.**
14. **Ogni ottimizzazione deve essere disattivabile.**
15. **Ogni artifact è versionato e verificato.**
16. **Reference backend sempre disponibile.**
17. **Qualità numerica testata automaticamente.**
18. **Recovery non deve corrompere KV.**
19. **Downloaded data non può caricare codice nativo.**
20. **Il successo si misura end-to-end.**

---

# Appendice H — Primo prototipo raccomandato

Se si vuole iniziare con il minimo codice che produce informazione utile, implementare questo percorso:

```text
Llama-like fixed model
        │
        ▼
Talos importer
        │
        ▼
static Talos IR
        │
        ├──── ReferenceBackend
        │
        └──── QnnBackend
                 │
                 ▼
               HTP
```

Limitazioni deliberate:

```text
batch = 1
context max fisso
no LoRA
no speculative
no custom ops
no GPU
3 prefill buckets
1 decode graph
```

Funzioni necessarie:

```text
load
prefill
decode one token
sample
cancel
rewind
profile
```

Se questo percorso non può essere misurato e reso numericamente affidabile, aggiungere funzionalità avanzate aumenterà soltanto la superficie di debug.

---

**Fine del documento.**
