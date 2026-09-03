# Dossier — GPU su tutte le schede, stato dell'arte settembre 2026

> Scritto dalla sessione mobile (`AVM/mobile`, `lane/voce-personale`) su richiesta
> dell'owner, ordine esplicito: *"dopo aver rilasciato la nuova versione mobile,
> dobbiamo fare una ricerca tecnica... su come far girare usando le migliori
> tecnologie all'avanguardia... per fare in modo di far girare al massimo i
> modelli scelti da utente, se ovviamente entrano nella memoria su tutte le GPU
> previste"*.
>
> ⛔ **È RICERCA, NON CODICE.** Questa sessione non implementa: il motore
> locale (`llama-server-supervisor.mjs`, `config.mjs`) vive in questo repo,
> di cui non è la sessione proprietaria — l'implementazione, per la regola
> già scritta in `RIPRESA-SESSIONE.md`, parte solo dall'owner riga per riga
> su una sessione di questo worktree. Aggiunto **solo questo file nuovo**,
> nessun altro toccato — la nota di ripresa avvertiva di modifiche non
> committate di un'altra sessione su `config.mjs`/altri file: non toccate.

## Cosa c'è GIÀ in questo progetto, misurato (non da rifare)

Dalla stessa sessione, prima di oggi: build CPU-only riporta `Available
devices: (none)`; la build **Vulkan** della stessa versione elenca la scheda
con la sua VRAM (`Vulkan0: AMD Radeon RX 9070 XT, 16304 MiB, 15416 MiB
free`) — **Vulkan ≈62 tok/s su quella scheda, contro 48 di vLLM+ROCm** sullo
stesso hardware. `config.mjs` preferisce già `.local-runtime/b10517-vulkan/`
a `.local-runtime/b10517/` quando presente (fix di oggi, non committato al
momento di scrivere questo dossier — vedi sopra).

⇒ **AMD via Vulkan è il caso già coperto e già superiore all'alternativa
"nativa" (ROCm) sullo stesso hardware.** Il buco è negli ALTRI vendor.

## La matrice completa dei backend, settembre 2026

| Vendor | Backend consigliato | Alternativa | Note |
|---|---|---|---|
| **NVIDIA** | CUDA | Vulkan | CUDA resta il più veloce: su RTX 5090, ~14.073 pp512/290 tg128 (CUDA) contro ~10.382/264 (Vulkan) — **+36% prefill, +10% generazione**.¹ |
| **AMD** | Vulkan | ROCm | Il verdetto si INVERTE per compito: ROCm vince il prefill, **Vulkan spesso pareggia o supera in generazione**, gira su Windows (ROCm per llama.cpp è di fatto solo Linux) e non serve installare un toolkit.¹ Combacia col nostro dato: 62 vs 48 tok/s. |
| **Intel Arc/iGPU** | SYCL | Vulkan | SYCL è **nel mainline** llama.cpp (non una fork), supporta Data Center Max, Flex, Arc, iGPU da 11ª gen Core in su. Batte Vulkan di ~150 tok/s in prompt-processing, ~1,5 tok/s più lento in generazione.² ⛔ Da 2026.02 oneAPI ha RIMOSSO il supporto NVIDIA/AMD nel plugin SYCL — SYCL è solo per hardware Intel, non un backend universale.² |
| **Apple Silicon** | Metal | — | Attivo **di default** nella build macOS (niente scelta a runtime come su Windows/Linux) — M4 Max: 1.600 pp tok/s, 75 tg tok/s.¹ Nessuno zip separato da scaricare: `brew install llama.cpp` lo porta già dentro. |
| **Qualcomm Adreno (mobile/ARM)** | OpenCL | — | Esiste una build dedicata `win-opencl-adreno-arm64` nelle release ufficiali — rilevante SOLO se in futuro si guarda a un motore locale su ARM Windows, non per i PC dell'utente medio. |

## Il pattern "un binario, ogni GPU" — la risposta tecnica a LM Studio

LM Studio rileva l'hardware e sceglie da solo il backend: CUDA su NVIDIA,
Vulkan su AMD, MLX su Apple Silicon — **nessun intervento manuale**.³ La
base tecnica che lo rende possibile in llama.cpp stesso, non solo nel
prodotto LM Studio:

- **`GGML_BACKEND_DL`**: opzione di build che compila ogni backend come
  libreria dinamica caricabile a runtime, invece di linkarlo staticamente.
  `ggml_backend_load_all()` cammina l'elenco e li registra tutti; il
  binario risultante gira su hardware diverso **senza ricompilare**.⁴
- A runtime, `--list-devices` elenca l'hardware visto e `--device` sceglie
  quale usare — la stessa build, comportamento diverso per macchina.⁴
- Le release ufficiali di llama.cpp (build `b10621`, verificate oggi)
  pubblicano zip **separati per backend**, non un pacchetto universale:

  ```
  llama-b10621-bin-win-cuda-12.4-x64.zip     (+ cudart-llama-bin-win-cuda-12.4-x64.zip)
  llama-b10621-bin-win-cuda-13.3-x64.zip     (+ il suo cudart)
  llama-b10621-bin-win-vulkan-x64.zip
  llama-b10621-bin-win-rocm-7.14-x64.zip
  llama-b10621-bin-win-sycl-x64.zip
  llama-b10621-bin-win-cpu-x64.zip
  llama-b10621-bin-win-opencl-adreno-arm64.zip
  llama-b10621-bin-win-openvino-2026.3-x64.zip
  ```
  (equivalenti `ubuntu-*.tar.gz` per Linux; macOS non compare — Metal è
  dentro la build unica, non un pacchetto a parte.)

⇒ **Due strade, non equivalenti:**
1. **Scaricare lo zip giusto per la macchina rilevata** (quello che questo
   progetto già fa: `.local-runtime/b10517-vulkan/` vs `.../b10517/`) —
   più semplice, meno spazio su disco, ma un download per vendor nuovo.
2. **Un binario `GGML_BACKEND_DL`** con tutti i backend come plugin — più
   grande da distribuire, ma zero re-download al cambio di GPU (utile solo
   se l'app gira su hardware che l'utente cambia spesso, caso raro per un
   desktop).

Per un'app desktop con un solo PC per installazione, **la strada 1 (quella
già scelta) resta la più semplice** — il dossier non trova un motivo tecnico
per cambiarla. Il lavoro che manca è estendere la STESSA logica di rilevamento
già scritta per Vulkan agli altri tre vendor (CUDA, SYCL, Metal è già gratis
su macOS).

## Cosa manca, concretamente, rispetto a oggi

1. **NVIDIA/CUDA**: nessuna build CUDA scaricata né provata in questo
   progetto fino ad oggi (verificato: solo `b10517` e `b10517-vulkan` in
   `.local-runtime/`). Serve lo stesso pattern già fatto per Vulkan:
   rilevare una NVIDIA vera (non un secondo dato falsato come il VRAM a
   32-bit già scoperto per AMD su Windows), scaricare
   `llama-bXXXXX-bin-win-cuda-<versione>-x64.zip` + il suo `cudart-*`
   corrispondente (**due zip, non uno** — CUDA richiede il runtime a
   parte), provare, misurare.
2. **Intel SYCL**: stessa cosa, `llama-bXXXXX-bin-win-sycl-x64.zip` — nessun
   hardware Intel Arc/iGPU provato finora in questo progetto (dichiarato,
   non presunto: nessuna riga lo cita).
3. **Apple Silicon**: fuori scope per un'app Windows-first, ma se il motore
   locale finisse mai su macOS, Metal non richiede logica di selezione —
   è già la build di default.
4. **La regola di rilevamento** dev'essere la stessa disciplina già in uso:
   MAI un dato dichiarato dal sistema operativo preso alla lettera (il VRAM
   a 32-bit di `Win32_VideoController` era falso per l'AMD) — si prova
   lanciando davvero il backend e leggendo `Available devices`, come già
   fatto per Vulkan.

## Fonti

¹ [Performance VULKAN vs CUDA — ggml-org/llama.cpp Discussion #23109](https://github.com/ggml-org/llama.cpp/discussions/23109) · [CUDA vs Vulkan for llama.cpp](https://llmrequirements.com/cuda-vs-vulkan-llama-cpp) · [llama.cpp Benchmarks 2026](https://www.myaihardware.com/llama-cpp-benchmarks/)
² [Performance of llama.cpp on Intel GPU with SYCL — Discussion #23313](https://github.com/ggml-org/llama.cpp/discussions/23313) · [llama.cpp SYCL backend docs](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/SYCL.md) · [Intel: Run LLMs on Intel GPUs using llama.cpp](https://www.intel.com/content/www/us/en/developer/articles/technical/run-llms-on-gpus-using-llama-cpp.html)
³ [LM Studio Accelerates LLM Performance With NVIDIA RTX (NVIDIA blog)](https://blogs.nvidia.com/blog/rtx-ai-garage-lmstudio-llamacpp-blackwell/) · [Run local LLMs with Intel/AMD GPU using LM Studio](https://nagasudhir.blogspot.com/2025/09/run-local-llms-with-intelamd-gpu-using.html)
⁴ [ggml: add support for dynamic loading of backends (PR #10469)](https://github.com/ggml-org/llama.cpp/pull/10469) · [Determine what backends are loaded at runtime — Discussion #12821](https://github.com/ggml-org/llama.cpp/discussions/12821) · [llama.cpp build.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)
⁵ [Release b10621 · ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp/releases/tag/b10621) — elenco asset esatto, letto dal vivo il 03/9/2026
⁶ [Homebrew Formulae: llama.cpp](https://formulae.brew.sh/formula/llama.cpp) — Metal di default su macOS

## Non autorizzato — decide l'owner

Nessuna riga di codice qui dentro. Le prossime mosse (in ordine di costo
crescente):
- 🔜 provare una build CUDA su una macchina NVIDIA vera, misurare, **prima**
  di scrivere qualunque logica di selezione — stessa disciplina già
  applicata a Vulkan
- 🔜 stesso per SYCL su una macchina con GPU Intel
- 🔜 estendere `config.mjs`/il rilevamento hardware con lo stesso pattern
  "prova il backend, leggi `Available devices`, non fidarti del sistema
  operativo" già in uso
