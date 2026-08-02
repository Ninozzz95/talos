
---

# Parte 2 — Holo-3.1-4B, memoria di picco, e la variante CPU (2026-08-02)

## 7. Holo-3.1-4B Q4_K_M sullo stesso tablet

`Hcompany/Holo-3.1-4B` (Apache 2.0), quantizzazione `prithivMLmods`.
Il caricatore lo riconosce come **`qwen35 4B Q4_K_M · 2,85 GiB · 4,84 miliardi di
parametri`** — è un Qwen3.5-4B addestrato per il controllo di interfacce.

| thread | prefill 512 | prefill 2048 | generazione 128 |
|---:|---:|---:|---:|
| 6 | 61,8 ± 1,2 | 44,7 ± 0,3 | 12,4 ± 0,5 |
| 8 | **65,1 ± 0,7** | **58,3 ± 1,2** | 12,2 ± 0,1 |

**Confronto col Qwen2.5-3B** (88,5 / 68,4 / 14,1 a 8 thread): il prefill regge
bene — 58,3 contro 68,4, **−15%** con un terzo di parametri in più. La
generazione paga di più: 12,2 contro 14,1, **−13%**.

**Il conto per un passo di agente** (2000 token dentro, 100 fuori):
Holo-3.1-4B **43,3 s** contro **35,3 s** del Qwen 3B. Otto secondi in più per un
modello che fa **71,0% su AndroidWorld** contro un generalista che quel compito
non l'ha mai visto.

## 8. Memoria: quello che conta è la parte che NON si può scartare

`llama.cpp` mappa i pesi da file (`mmap`), quindi il picco di RSS **sovrastima**
il fabbisogno: quelle pagine il kernel può buttarle e rileggerle. La misura utile
separa la memoria **anonima** (non scartabile) da quella **su file**.

| modello | anonima (non scartabile) | su file (mmap, scartabile) | picco totale |
|---|---:|---:|---:|
| Qwen2.5-3B (1,79 GiB) | **2.031 MB** | 1.849 MB | 3.869 MB |
| Holo-3.1-4B (2,85 GiB) | **2.776 MB** | 2.925 MB | 4.316 MB |

**Il numero per il «ci sta?» è la colonna anonima.** Sul telefono dell'owner, con
**3,9 GB liberi a caldo**: il 3B lascia 1,9 GB di margine, **Holo-4B ne lascia
1,1**. Stretto ma praticabile — e Android ne vuole una parte.

### 8.1 L'ipotesi che si è rivelata sbagliata

Vedendo memoria anonima ≈ dimensione del modello anche con `mmap`, ho ipotizzato
una **seconda copia** dovuta al riordino ARM dei pesi (repack per i8mm). Ho
provato invece di crederci, rilanciando **senza mmap**:

| Qwen2.5-3B | anonima | su file | totale |
|---|---:|---:|---:|
| con mmap | 2.031 MB | 1.849 MB | 3.880 MB |
| **senza mmap** | **2.219 MB** | 9 MB | **2.228 MB** |

Se ci fosse un raddoppio, senza mmap l'anonima sarebbe ~4 GB. È 2,2. **Ipotesi
falsa.**

Ma la tabella dice una cosa più interessante e vera: **mmap costa 1,65 GB di
memoria totale in più**, e in cambio abbassa di ~190 MB la parte non scartabile.
Cioè: sotto pressione mmap è più sicuro (il processo si stringe a 2,03 GB); a
memoria libera occupa molto di più, ed è la ragione per cui l'app *sembra*
mangiarsi il telefono. **Il default attuale (mmap) è la scelta giusta**, ma ora è
una scelta misurata invece che ereditata — e sotto i 3 GB liberi vale la pena
provare `--load-mode none`.

## 9. La variante CPU a runtime: verificata

La preoccupazione era che TALOS, pur spedendo sette varianti compilate,
ripiegasse a runtime su `armv8.0` — cioè sul percorso lento da 22,7 t/s invece
che sugli 88,5. **Verificata sul dispositivo**, mandando un messaggio vero col
modello locale e leggendo il registro:

```
I TalosLlama: load_backend: loaded CPU backend from
  /data/app/…/ai.talos.dev-…/lib/arm64/libggml-cpu-android_armv8.6_1.so
```

**Carica `armv8.6`.** Il processore dichiara `asimddp`, `i8mm`, `bf16`, e la
selezione fa il suo lavoro. I numeri di questa ricerca **descrivono l'app**, non
solo un benchmark a parte.

## 10. Cosa resta aperto

- Il **thread per fase** (8 in prefill, 6 in decodifica) non è ancora nel motore
  dell'app: è un guadagno gratuito che nessuno sta incassando.
- La **memoria di picco dentro l'app** (non del benchmark) non è misurata:
  l'app ha anche la WebView e SQLCipher in RAM, quindi il margine reale è più
  stretto di quello qui sopra.
- `Holo-3.1-4B.mmproj-q8_0.gguf` (367 MB) è scaricato ma **non provato**: senza
  quello il modello non vede lo schermo, ed è tutto il motivo per cui esiste.
