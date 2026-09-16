# BC-13 — Il motore locale: ricerca, banco, cure

**Data:** 12/09/2026 · **Ramo:** `lane/harness-desktop` · **Macchina:** Windows 11 Pro
26200, Ryzen 7 7800X3D (8c/16t), 31,6 GB RAM, **AMD Radeon RX 9070 XT** (16.304 MiB,
15.416 MiB liberi secondo il binario stesso — `Win32_VideoController` dichiara 4.293 MB
perché tronca a 32 bit, ed è un numero da non credere).

**Ordine dell'owner (parole sue, 12/09/2026):** «BC-13 importante, bisogna fare una ricerca
delle ultime tecnologie e metodi all'avanguardia, dobbiamo rendere il motore di llm locale
estremamente rapido e meglio dei competitor».

**Vincolo che governa tutto il resto (owner, 11/09):** «NESSUN MODELLO PREDEFINITO: motore
ottimizzato a livello UNIVERSALE, non forziamo nulla, sarà l'utente a decidere». ⇒ Nessuna
delle leve adottate nomina un modello, una scheda o un numero magico: **ognuna fa una
domanda al binario che l'utente ha** e usa la risposta.

---

## (a) La ricerca — fonte e data per ogni affermazione

### Il nostro motore oggi

`harness-ui/src/llama-server-supervisor.mjs` supervisiona un `llama-server.exe` di
llama.cpp **b10517**, pubblicata il **2026-08-20T17:43:32Z**
(`api.github.com/repos/ggml-org/llama.cpp/releases/tags/b10517`, letta il 12/09/2026; il
commit che dà il nome alla build è «vulkan : dequant q8_0 KV once in coopmat1 (#25494)»).
L'ultima build al momento della ricerca è **b10921**, pubblicata il **2026-09-12T08:04:36Z**
(stesso endpoint, `?per_page=8`): siamo **23 giorni** indietro. ⛔ Non ho misurato che cosa
porti l'aggiornamento — vedi §(e).

### Che cosa offre b10517 — letto dal `--help` del binario vero, non dalla documentazione

Sorgente primaria 1: `harness-ui/.local-runtime/b10517-vulkan/llama-server.exe --help`
(eseguito il 12/09/2026, 701 righe). Sorgente primaria 2:
`raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md`, letta il
12/09/2026. Le due concordano.

| Leva | Predefinito del binario | Stato da noi, prima di oggi |
|---|---|---|
| `--cache-prompt` (riuso del prefisso) | **abilitato** | già acceso, mai passato — e **funziona**: misurato `cache_n` 11.140 su 11.157 al secondo turno |
| `--cache-reuse N` (riuso via KV shifting dopo una divergenza) | **0 = spento** | spento |
| `-cram, --cache-ram N` | 8192 MiB | predefinito |
| `--cache-idle-slots` | abilitato (richiede cache-ram) | predefinito |
| `-ctxcp, --ctx-checkpoints` | 32 per slot | predefinito |
| `-cms, --checkpoint-min-step` | 8192 token | predefinito |
| `-fa, --flash-attn` | **auto** | passavamo `-fa 1` esplicito (ridondante ma innocuo) |
| `-ctk/-ctv` (tipo KV cache) | **f16** | passavamo **sempre `q8_0`** ⇒ vedi §(c), è il difetto principale |
| `-b / -ub` | 2048 / 512 | predefiniti |
| `-np, --parallel` | −1 = auto (qui: 4 slot, `kv_unified=true`) | predefinito |
| `-cb, --cont-batching` | abilitato | predefinito |
| `-ngl` | **auto**, con `--fit on` | passiamo **`99` esplicito**, che **disattiva `--fit`** |
| `--context-shift` | **disabilitato** | predefinito |
| `--slot-save-path` | disabilitato | predefinito |
| `--spec-draft-model` + `--spec-type draft-*` | nessuno | mai usato |
| **`--spec-type ngram-simple / ngram-map-k / ngram-map-k4v / ngram-mod / ngram-cache`** | `none` | **mai usato — è la leva nuova** |
| `--jinja` | **abilitato** | lo passiamo (ridondante, innocuo) |
| `--props` | disabilitato — **abilita la POST** `/props`, non la GET | **lo passiamo, e non ci serve** (§(e)) |
| `--metrics` | disabilitato | lo passiamo, serve |

⭐ **Il fatto che cambia tutto:** le varianti `ngram-*` di `--spec-type` fanno decodifica
speculativa **senza un secondo modello**. Pescano i candidati dal contesto già presente.
È l'unica forma di speculativa compatibile col vincolo «nessun modello predefinito».

⛔ **Rischio noto e aperto a monte**, trovato cercando e non dedotto:
`api.github.com/search/issues?q=repo:ggml-org/llama.cpp+ngram-mod+in:title`, letta il
12/09/2026 — **#25819 «server : add stuck-loop escape for ngram-mod (WIP)», aperta il
17/07/2026 e ancora aperta**: un ciclo che non esce quando la verifica dei candidati
fallisce ripetutamente. Chiuse invece #23929 (crash con `-sm tensor` + MTP + ngram-mod,
31/05/2026) e #23562/#23458 (sostituzione del contatore secco con accettazione a media
mobile, 21-23/05/2026). ⇒ Per questo la leva ha **un interruttore in un posto solo** (§(d)).

### Fonte ereditata, confermata: `llama-fit-params`

Accanto a `llama-server.exe` la stessa build spedisce **`llama-fit-params.exe`**: è il
fitter ufficiale di llama.cpp (lo stesso codice di `--fit on`) e **stampa su stdout gli
argomenti che entrano nella memoria del dispositivo** — `-c 16384 -ngl -1` quando ci sta
tutto, `-c 16384 -ngl 56` quando no. Misurato il 12/09: risponde in **0,34 s** su un GGUF da
2,3 GB e in **3,9 s** su uno da 15,3 GB, **senza caricare il modello**. È il cancello
universale su cui poggiano le cure.

---

## (b) I concorrenti — leva per leva

**Hermes Agent (Nous Research) per primo, come vuole l'obbligo dell'owner del 28/8.**

| | Motore locale proprio | Cache del prefisso | Speculativa **senza** draft model | Quantizzazione KV | Scelta automatica dei layer |
|---|---|---|---|---|---|
| **Hermes Agent** (Nous Research) | **NO** — è model-agnostic | non dichiarata | **no** | n/d | n/d |
| **TALOS, prima di oggi** | sì (llama.cpp b10517) | sì (predefinito del binario) | no | **sempre q8_0** | no (`-ngl 99` fisso) |
| **TALOS, dopo oggi** | sì | sì | **sì (`ngram-mod`)** | **decisa dal fitter** | parziale (la KV sì, `-ngl` no) |
| **LM Studio** | sì (llama.cpp) | sì | **no — vuole due modelli** | sì (configurabile) | sì (stima prima di caricare) |
| **Ollama** | sì (llama.cpp) | sì | **no — non la offre** | sì (`OLLAMA_KV_CACHE_TYPE`, default `f16`) | sì |
| **KoboldCpp** | sì (llama.cpp) | sì | non documentata nel README | non documentata nel README | `--gpulayers` manuale |

Citazioni e date:

- **Hermes Agent** — `raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md`,
  letta il 12/09/2026: «Use any model you want — Nous Portal, OpenRouter, OpenAI, your own
  endpoint, and many others». Non spedisce un motore di inferenza: dichiara «streaming tool
  output», «seven terminal backends», «spawn isolated subagents for parallel workstreams».
  Nessun numero di velocità, nessuna menzione di prompt caching per l'inferenza (il
  «batching» che nomina è «batch trajectory generation» per l'addestramento).
  ⇒ **Sul motore locale Hermes non è un concorrente: è assente.** Il confronto con lui
  resta sulla catena dell'agente, non su questo strato.
- **LM Studio** — `lmstudio.ai/docs/app/advanced/speculative-decoding`, letta il 12/09/2026:
  la tecnica «relies on the collaboration of two models: A larger, "main" model» e «A
  smaller, faster "draft" model». **Nessuna variante n-gram, nessun numero dichiarato.**
- **Ollama** — `docs.ollama.com/faq`, letta il 12/09/2026: `OLLAMA_FLASH_ATTENTION`
  (auto), `OLLAMA_KV_CACHE_TYPE` con default **`f16`** e alternative `q8_0` («uses
  approximately 1/2 the memory of f16») e `q4_0`, `OLLAMA_NUM_PARALLEL` (1),
  `OLLAMA_CONTEXT_LENGTH` (4096), `keep_alive` (5 min). **Nessuna decodifica speculativa.**
- **KoboldCpp** — `raw.githubusercontent.com/LostRuins/koboldcpp/concedo/README.md`, letta
  il 12/09/2026: il README parla solo di `--gpulayers` e `--contextsize`; **ContextShift,
  SmartContext, quantizzazione KV e flash attention non compaiono**, quindi non le attribuisco.

⇒ **Il nostro +1 misurabile sui due concorrenti veri (LM Studio, Ollama): la decodifica
speculativa che non chiede all'utente un secondo modello.** Misurata ×2,9 in generazione
sul compito d'agente, uscita identica byte per byte.

⛔ Ricerca non fatta per esaurimento della quota: `WebSearch` era già a 200/200 chiamate a
inizio sessione. Tutta la ricerca qui sopra è su **fonti primarie via WebFetch** (repo,
documentazione ufficiale, API GitHub) e sul `--help` del binario reale. Jan, llamafile,
Open WebUI e PocketPal **non** li ho guardati: restano aperti in §(e).

---

## (c) Le misure — banco, prima e dopo

**Strumento:** `scratchpad/banco-motore-locale.mjs` e `scratchpad/banco-cache-reuse.mjs`
(nella cartella temporanea della sessione, non nel repo).
⛔ I tempi **non li cronometro io**: li legge dal campo `timings` che il server mette in ogni
risposta (`prompt_ms`, `predicted_per_second`, `prompt_n`, `cache_n`), più `/metrics` e
`/props`. Porta allocata dal sistema, **mai la 4174**.

**Banco:** Qwen3-4B-Q4_K_M (2,33 GB, `%TEMP%\qw3-4b-q4km.gguf`), `-c 16384`, `-ngl 99`,
preambolo **11.022 token** calibrato sul tokenizzatore del modello stesso (non stimato dai
caratteri), 3 ripetizioni, **mediane**. Ogni ripetizione ha un marcatore unico in testa, così
il giro «freddo» rielabora davvero tutti gli 11.000 token (`cache_n = 0`, verificato).

Due compiti, perché misurano cose diverse:
- **`riassumi`** — testo nuovo: niente da pescare dal contesto.
- **`cita`** — ricopiare alla lettera un passaggio del contesto. È il lavoro vero di un
  agente: rimettere fuori un risultato d'attrezzo, riscrivere un file appena letto.

### Linea di base (la riga di ieri: `-ngl 99 -fa 1 -ctk q8_0 -ctv q8_0`)

| compito | prompt freddo | gen freddo | prompt caldo | gen caldo | RSS picco | caricamento |
|---|---|---|---|---|---|---|
| riassumi | **3.964 ms** | 127,6 t/s | 38 ms | 128,4 t/s | 4.221 MB | 2.044 ms |
| cita | **4.212 ms** | 123,5 t/s | 289 ms | 122,8 t/s | 4.378 MB | 2.253 ms |

⭐ Da notare subito: **la cache del prefisso funziona già** — al secondo turno il server
riusa 11.140 token su 11.157 e il prompt passa da 3.964 ms a **38 ms**. Non c'era niente da
aggiungere lì, e dirlo è parte del lavoro.

### Leva per leva, una alla volta, stesso banco

| configurazione | compito | prompt freddo | gen | verdetto |
|---|---|---|---|---|
| base (q8_0) | riassumi | 3.964 ms | 127,6 t/s | riferimento |
| `-ub 1024` | riassumi | 3.904 ms (−1,5%) | 128,1 t/s | **scartata**: rumore |
| `-b 4096 -ub 2048` | riassumi | 3.897 ms (−1,7%) | 127,8 t/s | **scartata**: rumore |
| **`-ctk f16 -ctv f16`** | riassumi | **2.849 ms (−28,1%)** | 117,5 t/s (−7,9%) | **adottata**, condizionata |
| **`-ctk f16 -ctv f16`** | cita | **2.969 ms (−29,5%)**, caldo 179 ms (−38,1%) | 115,4 t/s (−6,6%) | **adottata**, condizionata |
| `--spec-type ngram-simple` | cita | 4.250 ms | 158,4 t/s (+28%) | scartata: ce n'è una migliore |
| `--spec-type ngram-cache` | cita | 4.237 ms | 202,3 t/s (+64%) | scartata: ce n'è una migliore |
| **`--spec-type ngram-mod`** | cita | 4.254 ms | **353,2 t/s (+186%, ×2,86)** | **adottata** |
| `--spec-type ngram-cache` | riassumi | 4.060 ms | 117,3 t/s (−8%) | conferma che è la peggiore delle tre |
| **f16 + ngram-mod** | cita | **2.991 ms** | **445,5 t/s** | configurazione adottata |
| **f16 + ngram-mod** | riassumi | **2.852 ms** | **243,9 t/s** | configurazione adottata |

### Prima / dopo, sulla stessa chiamata intera (256 token in uscita)

| | PRIMA (q8_0) | DOPO (f16 + ngram-mod) | |
|---|---|---|---|
| `cita`, primo turno | 4.212 + 2.073 = **6.285 ms** | 2.991 + 575 = **3.566 ms** | **−43,3%** |
| `cita`, turno successivo (cache calda) | 289 + 2.085 = **2.374 ms** | 176 + 534 = **710 ms** | **−70,1%** |
| `riassumi`, primo turno | 3.964 + 2.006 = **5.970 ms** | 2.852 + 1.050 = **3.902 ms** | **−34,6%** |
| memoria di picco | 4.378 MB | 6.060 MB | **+1.682 MB** |
| costo delle sonde all'avvio | 0 ms | **452 ms** (misurato) | una volta per modello+contesto |

⛔ **Il verso contrario, misurato e non supposto.** La speculativa **costa** quando nel
contesto non c'è niente da pescare: prima chiamata di un server appena acceso, caso peggiore
osservato **110,7 t/s contro 123,7 (−10,5%)** sul compito `cita`, e **124,7 contro 127,6
(−2,3%)** su `riassumi`. Il costo si paga una volta e si ripaga dalla seconda chiamata in
poi — un harness fa decine di chiamate per giro, non una. La mediana sulle 3 chiamate è già
+186%.

⛔ **La correttezza è stata verificata prima di fidarsi dei numeri.** Stesso modello, stessa
`seed`, `temperature 0`, tre domande diverse (elenco strutturato, codice, ripetizione
letterale), con e senza `--spec-type ngram-mod`: **3 su 3 identiche byte per byte** (stesso
sha256, stessa lunghezza). È ciò che la decodifica speculativa promette — i candidati sono
verificati dal modello vero — ed è stato provato, non creduto.

### Le due leve che NON hanno passato la misura

**`--cache-reuse 256`** — banco dedicato (`banco-cache-reuse.mjs`): conversazione con
preambolo stabile da ~11.000 token, un blocco «risultato attrezzo» da ~3.000 token che viene
**riscritto**, e ~3.500 token identici dopo il punto di divergenza. È il caso in cui la leva
dovrebbe mordere (compattazione della storia).

| | prompt della richiesta divergente | token rielaborati | token dalla cache |
|---|---|---|---|
| `--cache-reuse 0` (predefinito) | 6.873 ms | 8.626 | 14.301 |
| `--cache-reuse 256` | 6.906 ms (+0,5%) | 8.626 | 14.302 |

⇒ **Identico. Non adottata.** Una leva che non si vede muovere non si accende «perché la
documentazione dice che aiuta». ⛔ È **uno** scenario: potrebbe mordere in un altro.

**`-b` / `-ub`** — ±1,7%, dentro il rumore. Non adottata.

### Il modello vero dell'owner: non è entrato nel banco, e ha trovato un difetto

Il 27B dell'owner (`Qwen3.8-27B-UD-Q4_K_M.gguf`, 15,33 GB) **non si carica su questa
macchina oggi**, in nessuna delle quattro configurazioni provate — `-ngl 99 -c 16384`,
`-ngl 56 -c 16384` (il numero che dice il fitter), `-ngl 99 -c 4096`, e **senza `-ngl` del
tutto** (fit automatico). Sempre lo stesso errore, sempre in **4,5-7 secondi**:

```
ggml_vulkan: Device memory allocation of size 1062312576 failed.
ggml_vulkan: vk::Device::allocateMemory: ErrorOutOfDeviceMemory
```

Causa **non** nostra: il binario dichiara 15.416 MiB liberi, ma il contatore
`\GPU Process Memory(*)\Dedicated Usage` attribuisce **34.293 MB** a `dwm.exe` (PID 27840,
avviato l'11/09 alle 17:00) e altri ~1,9 GB a tre processi Chrome, fra cui un Chrome
**headless** con `--user-data-dir=…\talos-browser-…` (cioè una pipeline visiva di qualcun
altro). ⛔ **Non ho ucciso niente**: nessuno di quei processi è mio, e la regola dice di
risalire la catena prima di `taskkill`.

⭐ **Ma la corsa fallita ha trovato un difetto vero nel nostro codice.** Il ciclo di attesa
della salute guardava solo `entry.failure`, che si popola **solo se lo spawn fallisce**, non
se il processo esce da solo. Quindi: il motore muore in **4,9 secondi** avendo già scritto
esattamente cosa non andava, e il supervisore continua a bussare a una porta chiusa per
`15 s + 15 s/GB` = **245 secondi**, per poi dire «non è diventato pronto entro 245 s (modello
di 15,3 GB)». **Quattro minuti di attesa e un messaggio che manda a cercare un modello
"troppo grande" o un'attesa "troppo corta"**, mentre la causa era scritta nero su bianco.
Curato in §(d).

---

## (d) Che cosa ho cambiato, file per file

### `harness-ui/src/llama-server-supervisor.mjs`

**1. Nuove esportazioni pure (righe ~37-180), con i numeri del banco nei commenti:**

- `leggiNglDalFitter(stdout)` — legge l'uscita di `llama-fit-params` e distingue **«ci sta
  tutto»** (`-ngl -1` o `all`) da un offload **parziale** (un numero). `null` = non lo so.
- `decidiTipoKvCache({nglConF16, nglConQ8})` — la regola universale:
  **f16 se con f16 entra tutto; altrimenti q8_0; se il fitter non risponde, q8_0** (cioè
  esattamente il comportamento di ieri). Ogni esito porta il suo `perche` in italiano.
- `supportaSpeculativaNgram(testoAiuto)` — cerca `ngram-mod` nella riga `--spec-type` del
  `--help`. Un binario più vecchio **morirebbe all'avvio** con «unknown argument», e un
  motore che non parte è infinitamente più lento di uno lento.
- `percorsoFitter(binaryPath)` — `llama-fit-params` accanto a `llama-server`, stessa
  estensione. `null` se il nome non combacia.
- `creaSondaBinario(spawnSyncImpl)` — sonda sincrona, niente shell, tetto di 30 s,
  `catch` che restituisce `null` = «non lo so».

**2. Nuove opzioni della fabbrica (righe ~208-260):**

- `sondaBinario` — iniettabile, così nessun test avvia un processo vero e la prova al verso
  contrario («il binario NON offre la leva») si scrive senza procurarsi un binario vecchio.
- `speculativaNgram: 'auto' | 'off'` — l'interruttore, che esiste per il difetto **aperto**
  ggml-org/llama.cpp#25819.
- `speculativaDisponibile()` e `leveVelocita(modelPath, contextLength)` — le domande al
  binario, **memorizzate per coppia (modello, contesto)**: il secondo avvio non ri-sonda.

**3. Nella `start()`:**

- Le leve si calcolano **prima** dello spawn e si **dichiarano** su `stderr`:
  `[talos] KV cache f16 — con KV f16 il fitter del binario dichiara che TUTTI i livelli
  entrano nel dispositivo` e `[talos] decodifica speculativa a n-grammi: accesa
  (--spec-type ngram-mod)`. ⛔ Una leva accesa in silenzio è una leva che nessuno può
  smentire.
- `'--cache-type-k', 'q8_0'` fisso → `'--cache-type-k', leve.kv.tipo` (idem per `-ctv`).
  `-fa 1` resta sempre, e K e V restano **simmetrici**.
- Aggiunto `...(leve.speculativa ? ['--spec-type', 'ngram-mod'] : [])`.
- `attachProcess` ora **conserva** le ultime 12 righe di `stderr` in `entry.ultimeRighe`
  (oltre a trasmetterle agli iscritti).
- Il ciclo di attesa controlla **anche `entry.closed`** e fallisce subito con
  `RUNTIME_PROCESS_FAILED`, portando le ultime 4 righe del motore:
  «llama-server si è chiuso dopo 5 s senza mai diventare pronto: ggml_vulkan: … | …».

**Comportamento verificato sul binario e sui modelli veri** (`-ngl 99`, sonde reali):

| modello / contesto | decisione | argomenti | costo sonde |
|---|---|---|---|
| Qwen3-4B, `-c 16384` | **f16** — entra tutto | `-fa 1 -ctk f16 -ctv f16 --spec-type ngram-mod` | 452 ms |
| Qwen3-4B, `-c 131072` | **q8_0** — con f16 entrerebbero solo 24 livelli, con q8_0 tutti | `-fa 1 -ctk q8_0 -ctv q8_0 --spec-type ngram-mod` | 1.550 ms |
| Qwen3.8-27B, `-c 16384` | **q8_0** — con f16 entrerebbero solo 56 livelli | `-fa 1 -ctk q8_0 -ctv q8_0 --spec-type ngram-mod` | 4.468 ms |

⇒ Tre modelli, tre esiti diversi, ognuno spiegato. **È una misura, non una preferenza.**

### `harness-ui/tests/llama-server-supervisor.test.mjs`

Un test esistente aggiornato (ora asserisce anche le due righe di dichiarazione) e **otto
nuovi**, tutti **nei due versi**:

1. `leggiNglDalFitter` — «tutto» / parziale / **e un'uscita che non parla di livelli non è «tutto»**.
2. `decidiTipoKvCache` — f16 quando entra tutto, **e q8_0 in tre casi contrari** (con f16 no
   ma con q8_0 sì; con nessuno dei due; fitter muto).
3. `supportaSpeculativaNgram` — vero sull'help di b10517, **falso** su un help più vecchio
   che ha solo `--model-draft`.
4. `percorsoFitter` — accanto al server, `null` su un nome che non combacia.
5. Integrazione «binario moderno» → argv con **f16 + `--spec-type ngram-mod`**, e verifica
   che il fitter sia interrogato **sul modello e sul contesto veri**.
6. Integrazione al contrario: binario senza `--spec-type` e modello che non entra → argv con
   **q8_0 e nessun `--spec-type`**.
7. Memorizzazione: il secondo avvio **non ri-sonda**.
8. **Il motore che si chiude da solo viene dichiarato subito**, con `healthTimeoutMs` di
   un'ora: se il difetto tornasse, questo test impiegherebbe un'ora invece di 20 ms.
9. `speculativaNgram: 'off'` spegne **solo** quella leva.

**Esito:** `node --test tests/llama-server-supervisor.test.mjs` → **17 test, 17 passati**.
`node --test tests/local-runtime-llama-server.test.mjs tests/local-runtime-conformance.test.mjs
tests/local-runtime-contract.test.mjs tests/local-runtime-events.test.mjs
tests/local-runtime-probe.test.mjs tests/runtime-build-manifest.test.mjs` → **52 test, 52
passati**. Non ho lanciato l'intera suite.

### File NON toccati

`config.mjs` non aveva bisogno di niente: le leve si accendono da sole e non vogliono
configurazione. `server.mjs` nemmeno. `openai-compatible-runtime.mjs` nemmeno: il riuso
della cache del prefisso, che è ciò che il tratto locale poteva influenzare, **è già attivo
e già efficace** (misurato: 11.140 token su 11.157 riusati al secondo turno). E non ho
toccato `research*.mjs`, `research/`, `http-app.mjs`, `session-registry.mjs`, `frontend/`,
`mobile/`, `control-plane/`, `core/`, `docs/`.

**Diff proposto per `server.mjs`, da applicare SOLO se l'owner vuole l'interruttore
raggiungibile da fuori** (una riga; io non l'ho applicato perché `server.mjs` è il file che
accende il 4174 e non lo tocco mentre gira):

```diff
-    const supervisor = createLlamaServerSupervisor({ binaryPath: config.llamaServerPath, modelStore: localModelStore, gpuLayers });
+    const supervisor = createLlamaServerSupervisor({ binaryPath: config.llamaServerPath, modelStore: localModelStore, gpuLayers, speculativaNgram: process.env.TALOS_LLAMA_SPEC_NGRAM === 'off' ? 'off' : 'auto' });
```

---

## (e) Che cosa NON ho verificato

1. **Il 27B dell'owner.** Non si carica su questa macchina oggi (memoria grafica occupata da
   `dwm.exe` e da Chrome di altri, §(c)). ⇒ **Nessun prima/dopo sul modello vero**, solo la
   decisione delle leve (q8_0 + ngram-mod), che è verificata ma non misurata in velocità.
2. **Il confronto misurato con LM Studio e Ollama.** LM Studio **è installato**
   (`C:\Users\Antonino\.lmstudio`) ma la sua cartella modelli
   (`downloadsFolder: C:\Users\Antonino\.lmstudio\models`) **non contiene un solo GGUF** —
   solo un modello di embedding di serie — e `lms` non è nel PATH. **Ollama non è
   installato.** ⇒ Il confronto della tabella §(b) è **documentario, non misurato**.
3. **L'aggiornamento b10517 → b10921** (23 giorni, ~400 build). Non scaricato, non misurato.
   Il `--help` di b10517 ha già tutte le leve moderne, quindi non c'è un buco di
   funzionalità noto — ma non posso escludere guadagni di velocità.
4. **Il difetto aperto #25819 (stuck-loop di `ngram-mod`).** Non si è presentato in nessuno
   dei ~30 giri fatti oggi, ma **non l'ho cercato apposta**: non ho provato sessioni lunghe,
   né più slot in parallelo, né generazioni molto lunghe.
5. **`--cache-reuse` in scenari diversi** dall'unico misurato.
6. **Jan, llamafile, Open WebUI, PocketPal**: non guardati (quota `WebSearch` esaurita).
7. **`--props`**: il flag abilita la **POST** `/props`, che nessuno da noi usa (l'unica
   lettura è una GET, in `local-runtime-llama-server.mjs:75`). Toglierlo non cambia la
   velocità — è igiene, e non l'ho fatto per non allargare il diff. Proposta, non fatta.
8. **`-ngl 99`**: **non l'ho toccato**, per rispetto della misura A/B del 03/09 che aveva
   trovato `99` migliore di `auto` sul 27B (13,28 contro 11,12 t/s). Oggi non ho potuto
   ri-misurarla (punto 1), quindi la lascio come sta: una misura non si ribalta con un'idea.
9. **Nessuna verifica visiva sul 4174**: questo lavoro non tocca nessuna superficie.

---

## (f) Testo di commit proposto

```
perf(motore-locale): il tipo della KV cache lo decide il fitter, e la speculativa non vuole un secondo modello

Owner 12/09: «dobbiamo rendere il motore di llm locale estremamente rapido e
meglio dei competitor». Tre cure, tutte misurate sul banco prima e dopo
(Qwen3-4B-Q4_K_M, RX 9070 XT Vulkan, preambolo 11.022 token, 3 ripetizioni,
mediane, tempi letti dal campo `timings` del server e non cronometrati).

1) KV CACHE — passavamo SEMPRE `q8_0`. Misurato su un modello vero costa il
   39% del tempo al primo token: 3.964 ms contro 2.849 ms con f16, e sul
   compito «ricopia» 4.212 contro 2.969 (-29,5%), turno caldo 289 contro 179
   (-38,1%). La misura del 03/09 che aveva introdotto q8_0 era stata presa sul
   modello giocattolo da 0,6B Q2_K, dove la KV cache è minuscola: su un modello
   vero il verso si rovescia. Ma q8_0 non è inutile — sullo stesso 4B a 131.072
   token il fitter dice `-ngl 24` con f16 e `-ngl -1` con q8_0. Quindi non si
   sceglie: si CHIEDE a `llama-fit-params` (spedito nella stessa build, risponde
   in 0,34-3,9 s senza caricare il modello) se con f16 entrano tutti i livelli.
   Sì -> f16. No -> q8_0. Non risponde -> q8_0, cioè il comportamento di ieri.
   Verificato su tre casi reali: 4B/16k -> f16, 4B/128k -> q8_0, 27B/16k -> q8_0.

2) DECODIFICA SPECULATIVA A N-GRAMMI — `--spec-type ngram-mod`, che non vuole
   nessun modello draft (LM Studio la offre solo con due modelli:
   lmstudio.ai/docs/app/advanced/speculative-decoding, 12/09/2026; Ollama non la
   offre affatto: docs.ollama.com/faq, 12/09/2026). Sul compito d'agente vero
   «ricopia un passaggio del contesto»: 123,5 -> 353,2 token/s (+186%), e 445,5
   insieme a f16. Verso contrario misurato: quando non c'è niente da pescare
   costa, caso peggiore -10,5% sulla prima chiamata del server. Uscita IDENTICA
   byte per byte alla riga senza speculativa, 3 domande su 3 (temperature 0,
   stessa seed) — verificato prima di fidarsi del numero. Si accende solo se il
   `--help` del binario elenca `ngram-mod`, e ha un interruttore in un posto
   solo perché a monte resta aperto ggml-org/llama.cpp#25819 «stuck-loop escape
   for ngram-mod (WIP)» (17/07/2026, ancora aperta al 12/09/2026).

3) UN MOTORE GIÀ MORTO NON DIVENTA PRONTO. Il ciclo di attesa guardava solo
   `entry.failure`, che si popola solo se fallisce lo SPAWN. Misurato: il 27B
   dell'owner muore in 4,9 s con «ErrorOutOfDeviceMemory» e il supervisore
   bussava a una porta chiusa per 245 s (15 s + 15 s/GB) prima di dire
   «timeout» — quattro minuti, e un messaggio che manda a cercare un modello
   troppo grande invece del motivo vero, che il motore aveva già scritto. Ora si
   guarda anche `closed` e l'errore porta le ultime righe di stderr.

Scartate perché misurate e non convincenti: `-b/-ub` (±1,7%, rumore) e
`--cache-reuse 256` (banco dedicato sulla divergenza a metà conversazione:
6.873 ms contro 6.906, stessi token rielaborati - zero guadagno).

Fonti primarie (tutte lette il 12/09/2026): `--help` del binario b10517 in
`.local-runtime/b10517-vulkan/`; tools/server/README.md di ggml-org/llama.cpp;
api.github.com/repos/ggml-org/llama.cpp/releases (b10517 = 2026-08-20, ultima
b10921 = 2026-09-12); api.github.com/search/issues per #25819/#23929/#23562;
lmstudio.ai/docs/app/advanced/speculative-decoding; docs.ollama.com/faq;
raw.githubusercontent.com/NousResearch/hermes-agent/main/README.md (Hermes non
spedisce un motore locale: «Use any model you want»).

Test: 17/17 in tests/llama-server-supervisor.test.mjs (8 nuovi, tutti nei due
versi), 52/52 nei sei test vicini del runtime locale.
```

---

## Chiusura

**Cosa deve fare l'owner**

1. **Il 27B non parte su questa macchina.** Non è colpa degli argomenti: la memoria della
   scheda è occupata da `dwm.exe` e da tre Chrome, uno dei quali è una pipeline visiva
   headless di un'altra sessione. Decidi tu: chiudo quei processi (non l'ho fatto, non sono
   miei), oppure si misura a macchina scarica. **Finché non si riesce a caricarlo, il
   prima/dopo sul tuo modello vero non esiste.**
2. **Aggiorno llama.cpp da b10517 a b10921?** Sono 23 giorni e ~400 build. Sì / no / dopo.
3. **Vuoi l'interruttore della speculativa raggiungibile da fuori?** È una riga in
   `server.mjs`, scritta in §(d); non l'ho applicata perché quel file accende il 4174.
4. **Metto a terra le tre voci scartate?** `-b/-ub` e `--cache-reuse` le ho misurate e non
   valgono; `--props` è igiene, non velocità. Sì / no / dopo.

**Cosa faccio io**

Riprendo da solo, senza chiedere: ri-misuro il 27B appena la scheda è libera e completo la
riga «prima/dopo» sul modello vero; cerco apposta lo stuck-loop di `ngram-mod` con una
sessione lunga e più slot; e allargo il banco a `--cache-reuse` in un secondo scenario di
divergenza prima di dichiararlo chiuso.

**Cosa rimane**

Non verificato, per nome: il **27B dell'owner** (non carica); il **confronto misurato con LM
Studio e Ollama** (LM Studio installato ma senza GGUF, Ollama assente — la tabella §(b) è
documentaria); **b10921** (non scaricata); **lo stuck-loop #25819** (mai visto, mai cercato);
**`--cache-reuse` oltre l'unico scenario**; **Jan, llamafile, Open WebUI, PocketPal** (quota
`WebSearch` esaurita a inizio sessione, 200/200); **`--props`** (proposta, non fatta);
**`-ngl 99`** (lasciato com'è per rispetto della misura A/B del 03/09, non ri-misurabile oggi).
Debito: il banco vive nella cartella temporanea della sessione, non nel repo — se serve
ripetibile va promosso a `harness-ui/benchmarks/`.
