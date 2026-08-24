# RITORNO — decisione 3, la rimisura, e Fase 7 chiusa nei tre passi

> Continua da `.claude/DECISIONE-0.1.17.md` dopo le tue due risposte (decisioni
> 1-3 approvate, poi 192 vs 512). **Nessun push** — sei tu a deciderlo, come
> sempre. Sei commit nuovi in due rami, nessuno spinto.

---

## 1. Dove sta il lavoro

| ramo | HEAD locale | HEAD su origin | commit miei non spinti |
|---|---|---|---|
| `lane/motore-gpu` | `99b33bd4` | `7e2f94ce` (il tuo) | 5 — vedi §2 |
| `lane/sicurezza-review` | `0dd9674e` | `13b0a799` | 1 — la guardia `sh` |

Albero pulito su entrambi (solo il puntatore del submodule llama.cpp, mai
committato — DEC-3).

---

## 2. `lane/motore-gpu` — sei commit, in ordine

| commit | cosa | prova |
|---|---|---|
| `b3f327f9` | **decisione 3 eseguita**: la cura dell'abort in `ggml-opencl`, patch locale (submodule punta a upstream, non committabile lì) | Stop nel prefill **1425-1440 ms → 32/36/36 ms** (9 giri, microbatch 512). Decodifica **invariata** (16,43→16,43 · 19,49→19,59 tok/s). La specifica letterale del documento (un controllo passivo) **non funzionava** — misurato, poi corretto con un drain ogni 16 nodi acceso solo sui grafi multi-token (`nodes[0]->ne[1] > 1`), non su ogni grafo |
| `559e9893` | **rimisura chiusa**, con le tue due tabelle (a freddo / a caldo dopo G5) invece di una fusa | Stop e PP512 robusti al caldo; G5 riconfermato: 19,84↔14,17 tok/s, 10 salti, 34,6% in basso; PP8192 a caldo **73,4 s**, +40% contro i 52,6 s a freddo — registrato come scoperta, non tolto. Stop in decodifica portato da 5 a 9 giri (p50 42 · p95 50 ms) |
| `3ed4432e` | **ricognizione Fase 7**, non ancora implementazione | tre fatti verificati sul codice: nessun workflow passa mai i flag OpenCL; `choose()` aveva zero chiamanti; `gpuLayers` non veniva mai assegnato in TS |
| `3d86e58d` | **Fase 7(a)** — la build di rilascio spedisce OpenCL | `libggml-opencl.so` nell'APK vero, `libOpenCL.so` escluso (verificato con `aapt list`), **75/75 librerie a 16 KB** (`llvm-readobj`, non un cancello preso in prestito — quello vive solo su `sicurezza-review` e non ho fuso i rami). ICD loader Khronos vendorizzato come submodule (`v2024.10.24`) + header (`v2026.05.29`), compilati da sorgente con lo stesso NDK di llama.cpp: niente binario nel repo |
| `99b33bd4` | **Fase 7(b)+(c)** — la politica decide sul TTFT, `gpuLayers` collegato | `TalosBackendChoice` riscritta: margine 2,0× calibrato sulla tua stessa misura (43,2 s CPU / 11,0 s GPU-con-cura nel caso peggiore). `TalosLlamaEngine`/`TalosBenchmarkHarness` ora portano il TTFT fino a `Evidence`. Nuova `TalosBackendEvidenceStore` (non cifrata: niente contenuto personale) provata su dispositivo con `Context`/`SharedPreferences` veri, 6/6. `TalosLlamaPlugin.open()` chiama `choose()` **solo se il chiamante non passa `gpuLayers` esplicito** |

⛔ **Cosa Fase 7(c) NON fa, dichiarato nel commit stesso**: nessun codice
decide *quando* far girare una generazione vera contro un backend candidato
per riempire lo store di evidenza. Costa batteria e tempo reale, e non deve
interrompere una chat in corso — è una scelta di prodotto, non tecnica.
Finché nessuno chiama `TalosBackendEvidenceStore.record()`, lo store resta
vuoto, `choose()` torna sempre "unproven", e `gpuLayers` resta 0: **il
comportamento di oggi, invariato**. La politica e il suo impianto sono
pronti a ricevere quel sondaggio quando lo deciderai.

**Cancelli, sull'ultima build**: `npm run typecheck` verde · `npx vitest run`
5.880 test verdi, 10 saltati · `:app:testDebugUnitTest` verde (le nuove classi
comprese) · `assembleDebug` verde, **nessun** OpenCL (confermato: la manopola
resta per-rilascio) · `assembleRelease` verde, 75/75 a 16 KB.

---

## 3. `lane/sicurezza-review` — un commit

| commit | cosa | prova |
|---|---|---|
| `0dd9674e` | la guardia che avevi chiesto su `sh` | test che fallisce se `sh` compare nel catalogo altrove che in `TalosDitoVero.COMANDO`, o se quella costante smette di essere letterale. Provato **anche al contrario**: due mutazioni (sh in un'altra op, un'interpolazione in più nella costante) fanno fallire il test prima di essere annullate |

---

## 4. Cosa serve da te

1. **Il push**, su entrambi i rami — separati, non li ho fusi (decisione tua,
   presa stamattina: «le due fusioni si fanno a valle, una alla volta»).
2. **Nessuna verifica su dispositivo pendente** questa volta: tutto quello che
   ho dichiarato sopra l'ho misurato io stesso sul Pad, non solo in JVM.
3. **Quando vuoi**, la decisione su *chi* e *quando* fa girare il sondaggio
   che riempie `TalosBackendEvidenceStore` — l'unico pezzo mancante perché la
   Fase 7 smetta di essere "pronta" e diventi "viva".

⇒ Poi, come hai detto, **la 0.1.18** — fermo, in attesa del tuo segnale.
