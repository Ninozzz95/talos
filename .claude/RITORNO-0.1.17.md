# RITORNO — 0.1.17 (motore su GPU)

> Documento di ritorno verso la sessione principale e l'owner, come chiede
> `.claude/CONSEGNA-0.1.17-0.1.18.md` §11. **Aperto il 2026-08-20**, in corso.
> Ramo `lane/motore-gpu`, da `lane/talos-mobile` a `7707ed93`.

---

## ⛔ L'INCIDENTE DEL 20/8 — chiuso, e cosa è costato

Per eseguire il primo test strumentato ho lanciato il task standard:

```
./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=…
```

Verde: «Starting 2 tests on OPD2415 - 16», «Finished 2 tests», `BUILD SUCCESSFUL`.
Subito dopo, sul Pad:

```
pm path ai.talos                                   → (vuoto)
cmd package list packages -u | grep talos          → (nemmeno dati residui)
ls /data/data/ai.talos                             → No such file or directory
find /storage/emulated/0 -iname '*.gguf'           → nessun risultato
```

**Comportamento documentato del plugin Android di Gradle**, non un guasto:
`connectedAndroidTest` installa app e test, esegue, e alla fine **disinstalla
entrambi**. Con l'app se ne va la cartella privata.

⛔ Non l'avevo previsto e non l'ho chiesto prima. La consegna §7 autorizzava
`adb install -r`, che **sostituisce tenendo i dati**; il task di Gradle è
un'altra strada, e l'ho presa io.

### Cosa è andato, e cosa è stato rimesso

| | esito |
|---|---|
| installazione `ai.talos` + dati | perduta · **rimessa** il 20/8 con una build fresca (`npm run build` → `cap copy` → `assembleDebug` → `install -r`), verificata con `pm path` |
| GGUF nella cartella privata | perduti — Gemma `2.489.758.112` B e Qwen3 `1.673.007.232` B |
| modello per misurare | **rimesso**: `Llama-3.2-3B-Instruct-Q4_K_M.gguf`, `2.019.377.696` B, SHA-256 `6c1a2b41…c728ff` identico fra computer e telefono |
| chat, chiavi, impostazioni | ⛔ **non ripristinati** — vedi sotto |

⛔ Nota: i `2.019.377.696` byte del Llama coincidono col `talos-fixture.gguf`
che il taccuino registrava come «residuo di campagna». Era lo stesso file.

### ⛔ Il backup: il più recente NON è il migliore

Owner 20/8: «ripristina il backup più recente». Aperti tutti e due, non sono
confrontabili — e il più recente è il più povero:

| | 10 ago 01:17 · 18.892 B | 7 ago 12:19 · 15.064.189 B |
|---|---:|---:|
| sessioni / messaggi | 1 / 9 | **5 / 46** |
| allegati | 1 | **5** |
| file in cassaforte | 1 | **76** |
| note / attività | 0 / 0 | **4 / 3** |
| ricerche | 0 | **28** |
| memorie | 1 | 2 |
| **chiavi dei provider** | **nessuna** (`containsSecrets:false`) | **4** (`containsSecrets:true`) |

⛔ **E sono cifrati** — `argon2id` (19.456 KiB, 2 iterazioni) + `AES-256-GCM`, il
corpo è testo cifrato. Il ripristino **richiede la password dell'owner**,
digitata da lui nell'app. Non è una cosa che posso fare io, e non deve passare
da me. ⇒ **Resta aperto**, ed è l'unica cosa che aspetta.

### Cosa ho fatto perché non si ripeta

`mobile/scripts/research/run-device-tests.mjs` fa i due passi che Gradle
nasconde e **non** il terzo: `adb install -r`, `am instrument -w -r`, porta via
gli artifact, e non disinstalla mai. Se la firma non combacia lo dice e si
ferma. L'avvertimento è anche nel javadoc dei test.

⇒ In memoria: [[connectedandroidtest-disinstalla-e-porta-via-i-modelli]].

---

## Cosa è chiuso, e con quale misura

### La baseline, letta e non ricordata

| fatto | misura |
|---|---|
| sottomodulo llama.cpp | `d2f83055…` (b10354) — **esattamente** la baseline congelata del brief |
| flag nativi attuali | `GGML_BACKEND_DL=ON`, `GGML_CPU_ALL_VARIANTS=ON`, `GGML_NATIVE=OFF`, `GGML_LLAMAFILE=OFF`; **nessun** `GGML_OPENCL`/`GGML_VULKAN`/`GGML_HEXAGON` |
| apertura nativa | `talos_llama_jni.cpp:676` — solo `n_gpu_layers`, nessun `devices` |
| dispositivo | OnePlus `OPD2415`, SoC `SM8750P`, Android 16 / SDK 36 |
| GPU, **chiesta al telefono** | `Adreno (TM) 830`, driver `V@0800.74 (GIT@a97e8c1cc4)` del 05/08/26 |
| ICD OpenCL sul dispositivo | `/vendor/lib64/libOpenCL.so`, 87.504 B — **presente** |
| driver Vulkan | `/vendor/lib64/hw/vulkan.adreno.so` — **presente** |

⇒ L'Adreno 830 è nella tabella dei **verificati** di `docs/backend/OPENCL.md`
(«Adreno 830 (Snapdragon 8 Elite) | Support»), e la riga sistema operativo
elenca Android/Snapdragon 8 Elite. Entrambe le corsie sono fisicamente
percorribili su questo telefono.

### Q1 — «TALOS può legare un modello a UN acceleratore?» → **CONFIRMED**

E qui il brief è **più pessimista della realtà**, il che cambia l'ordine delle
fasi in meglio.

Il brief §1.3 dice che `ggml_backend_dev_t * devices` è esposto «at the newer
upstream candidate». **Misurato: c'è già nella baseline congelata**, in
`include/llama.h:308` di `d2f83055`. Con lui c'è tutta l'API che serve, nello
stesso pin:

```
ggml-backend.h:179-184  dev_name / dev_description / dev_memory / dev_type /
                        dev_get_props / dev_backend_reg
ggml-backend.h:198-200  reg_name / reg_dev_count / reg_dev_get
ggml-backend.h:234-241  reg_count / dev_count / dev_get / dev_by_name
```

⇒ **Il targeting esplicito non richiede il forward pin.** La Fase 2 si può
costruire sulla baseline congelata, senza toccare il motore e quindi senza
esporsi alla deriva semantica che la Fase 1 deve ancora qualificare.

E il contratto, letto nella sorgente che spediamo — non dedotto:

- `common/arg.cpp:1058-1078` — la lista è **NULL-terminata**, e un nome che
  risolve a un dispositivo di **tipo CPU viene rifiutato** con «invalid
  device». La CPU resta allo scheduler come ripiego; semplicemente non si
  nomina.
- `common/arg.cpp:1064-1066` — `--device none` produce una lista col solo
  `nullptr`: è il modo esplicito di dire «non fare offload», diverso da
  `devices == NULL` che significa «usa tutto».
- `src/llama.cpp:150-176` — con `params.devices` impostato, llama.cpp **logga
  da solo** ogni dispositivo scelto (`- device %zu: %s`). La prova del
  targeting c'è già, senza strumentazione nostra.

### Q2 — «la politica di scelta del backend è cablata in produzione?» → **CONFIRMED, è un buco**

Il brief lo chiamava «verification gap». Misurato, con grep sul solo `main/`:

```
TalosBackendChoice.choose(…)   0 chiamanti in produzione (solo il suo test)
shouldProbe / shouldProbeNow   0 chiamanti, in tutto il repo
TalosLlamaProbe.evidenceOf     0 chiamanti in produzione
TalosBenchmarkHarness          usato in produzione, ma solo la metà che
                               CAMPIONA (TalosLlamaEngine.java:603-647);
                               outcomeOf / Evidence / choose mai
gpuLayers (TypeScript)         dichiarato in localEngine.ts:143 e :339,
                               impostato da NESSUNO
TalosLlamaPlugin.java:253      call.getInt("gpuLayers", 0) → sempre 0
```

⇒ Il grafo che il brief chiede di ricostruire **non esiste**: la catena si
interrompe fra il campionamento e la decisione. Oggi ogni apertura è CPU pura
per costruzione, e la politica di scelta è codice provato e mai eseguito — la
forma esatta di [[funzione-con-i-test-e-nessun-chiamante]].

### L'inventario strutturato (§6.1) — fatto e misurato sul Pad

`nativeBackendInventory()`, commit `560d1d02`. Sul Pad, build CPU:

```json
{"registries":[{"name":"CPU","devices":[{"name":"CPU","description":"CPU",
"type":"CPU","deviceId":null,"memoryFree":11998535680,
"memoryTotal":11998535680,"caps":{"async":false,"hostBuffer":false,
"bufferFromHostPtr":true,"events":false}}]}]}
```

Un registry, un dispositivo, **zero bersagli di offload**. È il pavimento C0.

### Fase 2 — il targeting esplicito: **FATTO e provato sul dispositivo**

`nativeOpenTargeted(…, backendName, deviceName, flashAttentionMode)`, commit
`9a7d2d0a`. Il contratto è quello di upstream, letto in `common/arg.cpp` e in
`tools/llama-bench/llama-bench.cpp` della sorgente che spediamo.

⛔ **Non esiste «prendi la prima GPU».** O si nomina il dispositivo, o si nomina
un registry che ne espone **uno solo**; un registry con due dispositivi e nessun
nome fallisce **elencandoli**.

⛔ **La produzione è intatta per costruzione**: `nativeOpen` passa richieste
vuote e non ha una strada per raggiungere né la lista dei dispositivi né la
Flash Attention.

Provato sul Pad, **8 test in 26,4 s** — cinque che devono aprire, **tre che
devono fallire**:

| caso | atteso | esito |
|---|---|---|
| richiesta vuota | apre come sempre | ✅ |
| `none` e `cpu` | apre, CPU per decisione | ✅ |
| Flash Attention `default`/`off`/`auto`/`on` | aprono tutte e quattro | ✅ |
| dispositivo inesistente | **fallisce**, `backend-target` | ✅ |
| registry assente (`Vulkan`) | **fallisce**, `backend-target` | ✅ |
| la CPU nominata come bersaglio | **rifiutata** | ✅ |
| `none` + un dispositivo | si contraddice, fallisce | ✅ |
| Flash Attention inventata | **fallisce**, `flash-attn-mode` | ✅ |

⇒ Il caso che conta è il quarto: un dispositivo che non c'è **non ripiega in
silenzio sulla CPU**. Il ripiego silenzioso avvelena una campagna intera — la
corsa parte, produce token, finisce, e il numero finisce attribuito a un
acceleratore che non ha mai eseguito niente.

### Il pavimento C0 — misurato sul Pad

Llama 3.2 3B Q4_K_M (`6c1a2b41…`), 4 thread, CPU per decisione (`none`),
KV f16, contesto 8192, `reusePrefix=false` (e ogni riga registra
`reusedTokens: 0`, così che si possa verificare).

**Carico**

| | ms |
|---|---:|
| L0 — processo nuovo, modello freddo | **3.568** |
| L1 — riapertura, cache di pagina calda | **3.192** |

**Stop** — misurato da quando si chiede a quando `nativeGenerate` **ritorna
davvero**, non dal segnale.

| fase | p50 | p95 | max | giri |
|---|---:|---:|---:|---:|
| durante il **prefill** | 20 ms | 27 ms | 27 ms | 5 |
| durante la **decodifica** (a 16 token) | 0 ms | 0 ms | 0 ms | 5 |

⇒ Su CPU lo Stop è **immediato**. È il pavimento contro cui misurare la GPU,
dove l'header di llama.cpp avverte che la callback di abort «currently works
only with CPU execution».

**Prefill, primo token e decodifica** — campagna pulita (`--fresh`), 1 giro di
riscaldamento scartato + **9 misurati**, mediana e MAD. ⛔ Ogni riga porta
`reusedTokens: 0`, termico stabile a `none`.

| configurazione | prompt tok/s | decode tok/s | TTFT | muro | dispersione |
|---|---:|---:|---:|---:|---:|
| **PP512** | 43,82 ±0,6 | 13,36 | 11.661 ms | 12.260 ms | ±6,2% |
| **PP2048** | 36,78 ±0,15 | 7,71 | 55.682 ms | 56.694 ms | ±4,8% |
| **TG256** | 39,14 ±0,53 | **14,68** ±0,03 | **793 ms** | 18.225 ms | ±1,8% |

⛔ **Perché 9 giri e non 5, e cosa è cambiato.** La corsa a 5 dava PP512 a 52,94
tok/s. A 9 giri la mediana scende a **43,82** — il 17% in meno. La MAD era
minuscola già a 5 giri (0,18) mentre il range era largo: **un solo giro fuori
riga**, il primo misurato, il più veloce. Il telefono è più rapido da freddo e
rallenta appena si scalda, pur restando `thermal: none`. ⇒ I numeri a 5 giri
erano ottimistici; questi sono quelli da usare. È esattamente il motivo per cui
§9.4 prescrive nove giri.

⇒ Due cose che un numero solo avrebbe nascosto, ed è la Q3 del brief:

1. **Il prefill non scala.** Da 512 a 2048 token il tasso scende da 43,8 a 36,8
   tok/s. Ma il dato più duro è il TTFT: **da 11,7 a 55,7 secondi**.
2. **TTFT e decodifica sono grandezze diverse.** Con prompt corto il primo token
   arriva in **793 ms**; con 2048 token ci mette **55 secondi**. Un backend
   scelto sul solo `tokensPerSecond` di decodifica potrebbe vincere la misura e
   far aspettare la persona quasi un minuto. ⇒ La `Evidence` a un solo numero di
   `TalosBackendChoice` **non basta**, e ora c'è il dato che lo dice.
3. E la decodifica **dipende da quanto prefill l'ha preceduta**: 14,68 tok/s
   dopo un prompt corto, 13,36 dopo 512 token, 7,71 dopo 2048. La KV che cresce
   si paga a ogni token.

**Carico** — L0 3.249 ms · L1 2.949 ms.

**Stop** — dalla richiesta al ritorno vero di `nativeGenerate`, 9 giri:

| fase | p50 | p95 | max | dispersione |
|---|---:|---:|---:|---:|
| durante il **prefill** | 5 ms | — | 21 ms | ⚠ ±380% [2 … 21] |
| durante la **decodifica** (a 16 token) | **0 ms** | 0 ms | 0 ms | ±0% |

⛔ La dispersione dello Stop in prefill resta larga **anche con nove giri**: non
è un difetto da correggere con altri giri, è una proprietà della misura — lo
stop cade fra due chunk di prefill, e quanto manca al prossimo dipende da dove
si è. Si riporta così, non si liscia.

⇒ Su CPU lo Stop è **immediato**. È il pavimento contro cui misurare la GPU,
dove l'header di llama.cpp avverte che la callback di abort «currently works
only with CPU execution».

### ⛔⛔ UN DIFETTO DI PRODUZIONE, trovato per strada

**Uno Stop chiesto un istante troppo presto viene INGHIOTTITO.**

`nativeGenerate` azzera `cancelled` al proprio ingresso (`talos_llama_jni.cpp`,
riga ~2117), e la ragione è buona: un flag rimasto acceso dalla corsa precedente
ucciderebbe subito quella nuova. Ma la conseguenza è che un cancel che cade
nella finestra fra «la persona preme» e «la generazione entra» **sparisce senza
lasciare traccia** — nessun errore, nessun log, e la risposta continua ad
arrivare.

Misurato (`STOP-early`):

```
token prodotti  64 / 64 chiesti
stopHonoured    false
latenza         5.022 ms  (cioè: la generazione intera)
```

⛔ Non è teoria: è ciò che fa una persona che si accorge di aver mandato il
messaggio sbagliato e preme Stop subito.

⇒ **Proposta, non applicata.** La cura tocca il comportamento di produzione, e
non è una decisione mia. La forma più piccola che regge: distinguere «annulla la
corsa in volo» da «annulla la prossima», per esempio con un numero di
generazione — `cancel(n)` vale per la corsa `n`, e una corsa che entra con un
cancel già in attesa per il proprio numero si ferma subito invece di azzerarlo.
Il test `c0StopChiestoPrimaCheLaGenerazioneEntri` documenta il comportamento di
oggi con un numero, e diventerà il RED della cura.

### I quattro commit upstream — verificati alla fonte

| commit | cosa è | esito |
|---|---|---|
| `60addddf` | PR #26434, barriera di memoria locale sotto `#if WG_SIZE > FA_SG` in `flash_attn_f16.cl`/`f32.cl` | **come dice il brief** — e la motivazione upstream cita proprio Adreno |
| `98d1e92` | PR #26585, transpose a tile per `CONT(PERMUTE 2,1,0,3)` | confermato; +84% su **RADV gfx1151**, numero da non proiettare su Adreno |
| `dc72703` | PR #25494, dequant Q8_0 KV una volta sola | confermato |
| `3e734467` | revert dei threadpool condivisi | confermato dal codice: i pool restano separati |

⛔ **Rilievo su `dc72703`, da verificare sul dispositivo:** il percorso
ottimizzato è **coopmat1** ed è escluso sui device coopmat2. Adreno non espone
cooperative matrix nel modo in cui la intende quel percorso. Se VK-0 conferma
che il coopmat1 non c'è, allora `dc72703` è **NOT RELEVANT** per noi — e con
lui metà della motivazione della corsia Vulkan. Da chiudere in VK-0/VK-3 prima
di spendere tempo sui benchmark Vulkan.

### Ciò che il brief chiede e che **esisteva già**

`nativeLastTimings()` emette già, per ogni generazione:

```
tokenizeMs, prefixMs, prefillMs, firstTokenMs, totalMs,
promptTokens, reusedTokens, newTokens, producedTokens, reusedContext
```

Sono esattamente i campi che §14 pretende in ogni record di benchmark, con gli
stessi nomi interni (`prefill_ms`, `primo_token_ms`, `token_riusati`). ⇒ **PP,
TG e TTFT sono derivabili senza toccare il motore**, e `nativeGenerate` ha già
`reusePrefix` per tenere fermo lo stato del prefisso fra due backend.

---

### La suite golden semantica (§8, S1-S7) — **7 verdi in 25,3 s**

Dialetto rilevato dal modello, non assunto: **LLAMA3**.

| caso | esito |
|---|---|
| S1 chat senza ragionamento | ✅ contenuto pieno, nessuna chiamata fantasma, 48 token di prompt |
| S2 ragionamento | **non applicabile** — Llama 3.2 non dichiara un canale di ragionamento. Registrato `applicable:false`, non saltato |
| S3 un attrezzo | ✅ arriva al template e la chiamata torna col nome `meteo` e gli argomenti `{"citta":"Catania"}` intatti |
| S4 insieme grande | misura, sotto |
| S5 prosa prima della chiamata | ✅ la chiamata sopravvive, la prosa resta contenuto |
| S6 attrezzi malformati | ✅ motore vivo dopo tutti e cinque |
| S7 testo parziale | misura, sotto |

⛔⛔ **S4 — il numero che pesa davvero:**

| attrezzi | JSON | prompt | **token** |
|---:|---:|---:|---:|
| 1 | 212 B | 969 car | 200 |
| 8 | 1.689 B | 4.000 car | 865 |
| 24 | 5.093 B | 10.956 car | 2.385 |
| **46** | **9.779 B** | **20.526 car** | **4.475** |

⇒ **Con 46 attrezzi il prompt costa 4.475 token prima che la persona abbia
detto qualcosa** — più di quanto ne contenga un contesto da 4096, e al tasso di
prefill misurato su questo telefono sono **circa 100 secondi** solo per
descrivere gli attrezzi. Il template li supporta
(`supportsTools:true, supportsToolCalls:true`): il costo non è il permesso, è la
lunghezza. Si lega direttamente a
[[il-difetto-e-che-non-li-chiamano]] e al prefisso congelato.

⛔ **S6, un rilievo**: tutti e cinque i payload malformati hanno comunque reso un
prompt (`rendered:true`). Il processo sopravvive — che è ciò che il brief
chiede — ma attrezzi rotti vengono **ignorati in silenzio** invece che
segnalati.

⛔ **S7, e il confine di ciò che ho verificato**: su una risposta parziale il
parser restituisce il JSON grezzo che cresce **come contenuto visibile**
(`{`, `{"name":`, `{"name": "meteo`…). Per un modello di famiglia Llama la
chiamata è JSON nudo, quindi non c'è un marcatore che la nasconda finché non è
completa. **Se questo arrivi allo schermo dipende dal percorso di streaming
dell'interfaccia, che NON ho verificato**: lo registro come misura del parser,
non come difetto a schermo. Va guardato sul dispositivo con un modello Llama e
un attrezzo offerto.

### ⛔⛔ La grammatica: era VUOTA, ed è la risposta giusta

S4 chiedeva byte della GBNF, `grammar_lazy`, inneschi e token preservati.
Nessuna API li esponeva: vivevano solo in logcat. `nativeGrammarDiagnostics` li
rende una risposta ripetibile, e **`compiles` è PROVATO** — costruisce un
campionatore di prova e lo libera, perché `common_sampler_init` non segnala una
GBNF incompilabile con `nullptr`: lancia.

La prima lettura sembrava grave — GBNF **vuota** a 1, 8, 24 e 46 attrezzi,
quindi nessun vincolo. **Non è un difetto**, e il campo che lo dice è quello che
alla diagnostica mancava:

| attrezzi | prompt token | GBNF | formato | parser byte | pensiero | compila |
|---:|---:|---:|---|---:|---|---|
| 1 | 200 | 0 | `peg-native` | 8.164 | false | ✅ |
| 8 | 865 | 0 | `peg-native` | 28.919 | false | ✅ |
| 24 | 2.385 | 0 | `peg-native` | 78.913 | false | ✅ |
| **46** | **4.475** | 0 | `peg-native` | **150.864** | false | ✅ |

⇒ **A questo pin il vincolo lo fa un parser PEG, non una GBNF per famiglia.**
«Grammatica vuota» si legge solo ACCANTO al formato scelto: con un formato PEG è
la risposta giusta; con un formato che la grammatica ce l'ha, sarebbe un
difetto.

⛔⛔ **E questo DATA il numero del taccuino.** I 55.871 byte di GBNF rifiutati
dal parser (8 agosto) appartengono al percorso vecchio, non al motore che
spediamo oggi. Anche la nota «grammatica pigra, 1 solo innesco / Grammar still
awaiting trigger» va riletta con questo in mano: su `peg-native` non ci sono né
inneschi né pigrizia. ⇒ Chi riapre
[[il-difetto-e-che-non-li-chiamano]] deve rimisurare, non ripartire da quei
numeri.

⛔ Il parser PEG si **misura**, non si copia: con 46 attrezzi è un albero JSON da
**150.864 byte**. Metterlo in un artifact lo renderebbe illeggibile proprio dove
serve leggerlo.

⛔ `supportsThinking` ha sostituito un'euristica mia: S2 indovinava cercando
`<think>` nel prompt reso, e avrebbe risposto «no» a qualunque famiglia che
marca il ragionamento in un altro modo. Il motore lo dichiara.

---

### Le build di ricerca (§5.2) — la manopola c'è, e dice cosa manca

`-PtalosResearchBackend=cpu|opencl|vulkan`, commit `8d5368bd`. Senza la
proprietà **non cambia una virgola**: verificato che `assembleDebug` nudo resta
identico.

Provata nei due versi: `cpu` compila e si dichiara; `hexagon` viene rifiutata
elencando le tre valide; `opencl` senza la sua cartella si ferma dicendo quale.

**Cosa c'è già su questa macchina, misurato:**

| pezzo | esito |
|---|---|
| header Vulkan + `libvulkan.so` **1.3.275** | ✅ nell'NDK |
| `glslc` | ✅ `ndk/shader-tools/windows-x86_64/glslc.exe` — ⛔ `find_package(Vulkan COMPONENTS glslc)` **non ci guarda**, va indicato a mano |
| header OpenCL | ❌ `sysroot/usr/include/CL/` non esiste |
| `SPIRV-Headers` | ❌ assenti |
| compilatore C++ **host** | ❌ `cl`, `gcc`, `clang`, `g++` tutti assenti dal PATH; la cartella di Visual Studio 18 è **vuota**; `vswhere` non c'è |

### ⛔ C2 (Vulkan) — **BLOCKED**, e non dal progetto

Due prerequisiti di questa macchina, e la manopola li nomina entrambi in un
colpo solo invece di farli scoprire uno per compilazione:

1. **SPIRV-Headers** — soli header, download piccolo.
2. **Un compilatore C++ per questo computer** — ed è quello che pesa.
   `vulkan-shaders-gen` gira **qui** e genera gli shader; `ggml-vulkan` viene
   compilato **per il telefono**. Upstream cerca l'host con
   `find_program(NAMES cl gcc clang)` e si ferma con «Host compiler not found»
   (`ggml/src/ggml-vulkan/CMakeLists.txt:157-158`).

⇒ **Serve una decisione tua**: installare gli strumenti di compilazione C++
(MSVC Build Tools, alcuni GB di disco) è l'unica strada per la corsia Vulkan su
questa macchina. Non lo faccio senza il tuo sì.

⛔ E ricordo che la corsia Vulkan ha comunque un secondo ostacolo, già
registrato sopra: il percorso `dc72703` è **coopmat1**, escluso sui device
coopmat2 — e su Adreno va verificato che esista prima di spenderci tempo.

### C1 (OpenCL) — non è bloccata dallo stesso muro

⛔ **Non richiede un compilatore host**: OpenCL si compila solo per il telefono.
I due pezzi che mancavano si sono trovati senza chiedere niente a nessuno:

- gli header Khronos (`OpenCL-Headers`, `15b536b`), soli file;
- `libOpenCL.so` **presa dal telefono** (`/vendor/lib64/`, 87.504 B, 236 simboli
  dinamici) — cioè esattamente la libreria che l'app userà a runtime, invece di
  un ICD loader costruito a parte.

⛔⛔ **Ma attenzione a cosa NON è.** Una build OpenCL sul nostro pin
`d2f83055` **non è il candidato C1 del brief**: C1 richiede
`llama.cpp >= 60addddf`, la correzione della race WAR nei kernel Flash
Attention, e il nostro pin non ce l'ha. ⇒ Qualunque misura di **Flash Attention
su OpenCL** presa qui sarebbe vietata dal brief e non va usata. Quello che una
build così può dare, legittimamente, è **l'uscita della Fase 2**.

### ⛔⛔ FASE 2 — CHIUSA, con la prova del motore stesso

Non «il backend si è registrato». I log di allocazione di llama.cpp:

```
llama_prepare_model_devices: using device GPUOpenCL (QUALCOMM Adreno(TM) 830) - 4697 MiB free
load_tensors: offloading output layer to GPU
load_tensors: offloading 27 repeating layers to GPU
load_tensors: offloaded 29/29 layers to GPU
load_tensors:   CPU_Mapped model buffer size =   308.23 MiB
load_tensors:       OpenCL model buffer size =  1918.45 MiB
llama_kv_cache:     OpenCL KV buffer size =    56.00 MiB
sched_reserve:     OpenCL compute buffer size =   128.25 MiB
ggml_opencl: device FP16 support: true
```

E ha **generato davvero**: 8 token, «! Welcome to my little corner of the».
⇒ **Rischio R3 chiuso** per questa corsia: un `.so` che si carica non è un
backend che esegue, e la differenza non si vede in nessun numero di velocità —
si vede solo qui.

L'inventario, ora:

```json
{"registries":[
  {"name":"OpenCL","devices":[{"name":"GPUOpenCL",
    "description":"QUALCOMM Adreno(TM) 830","type":"GPU","deviceId":null,
    "memoryFree":4925526016,"memoryTotal":5999267840, …}]},
  {"name":"CPU","devices":[{"name":"CPU", …}]}]}
```

### ⛔⛔⛔ I TRE SILENZI che sono costati il pomeriggio

Nessuno dei tre dava un errore. Meritano di stare scritti perché sono la stessa
famiglia di difetto: **una cosa che fallisce senza dirlo.**

**1. La `libOpenCL.so` del vendor, spedita dentro l'APK.** CMake la copia nella
cartella di uscita e AGP la impacchetta. Sul telefono oscura quella di sistema e
non si apre, perché dipende da `libcutils.so` e `libc++.so` — che vivono nello
spazio dei nomi del vendor e un'app **non può** raggiungere. ⇒ Esclusa dal
pacchetto.

**2. `ggml_backend_load_all_from_path` TACE, per costruzione.**

```c
#ifdef NDEBUG
    bool silent = true;
```

e la nostra build è `Release`. Con `libggml-opencl.so` da **3.198.104 byte**
presente nella cartella nativa, il registro conteneva **un solo** backend e
nessuna riga diceva perché. ⇒ Aggiunta `nativeProbeBackendLoad`, che ripercorre
la stessa cartella con `ggml_backend_load()` — la stessa strada con
`silent = false`. Il motivo è comparso subito:

```
dlopen failed: library "libOpenCL.so" not found:
  needed by …/libggml-opencl.so in namespace clns-9
```

**3. Da Android 12 una libreria del produttore va DICHIARATA.** Il sistema la
elenca pubblica (`InitVendorPublicLibraries: … libOpenCL.so …`) e non basta:
con `targetSdk 36` serve

```xml
<uses-native-library android:name="libOpenCL.so" android:required="false" />
```

⛔ `required="false"`: con `true` l'installazione verrebbe **rifiutata** su ogni
telefono che non ha quella libreria — cioè si romperebbe l'app per tutti pur di
far funzionare una prova. E sta nel source set `debug`: la build che si spedisce
non porta `libggml-opencl.so`, quindi non ha niente da chiedere.

⇒ Verificato che la produzione è intatta: `assembleDebug` nudo impacchetta
**zero** librerie OpenCL.

### ✅ FASE 1 — IL FORWARD PIN: uscita RAGGIUNTA

Candidato **`dc72703`**, quello che il brief stesso indicava. Verificato con
git — non con una tabella — che contiene tutto ciò che serve:

```
60addddf (race FA OpenCL)   È dentro dc72703   ✓
98d1e92  (transpose Vulkan) È dentro dc72703   ✓
d2f83055 (il nostro pin)    È dentro dc72703   ✓   ⇒ avanzamento pulito
```

**163 commit**, dal 10 al 19 agosto. `engineBuild`: `b137-d2f8305` →
**`b419-dc72703`**.

**Domanda 1 — compila?** ✅ **Zero rotture di API.** `llama-common`, Jinja,
campionamento e parser attraversano 163 commit senza una riga da cambiare in
`talos_llama_jni.cpp`. Era il rischio R2 del brief («a pin that accelerates
kernels may alter tool formatting/parsing»): non si è materializzato.

**Domanda 2 — la semantica tiene?** ✅ La suite golden è **verde, e identica**.
Non «passa»: **non si muove**.

| caso | vecchio pin → nuovo |
|---|---|
| S1 chat senza ragionamento | IDENTICO |
| S2 ragionamento | IDENTICO (`applicable:false`, Llama non ce l'ha) |
| S3 un attrezzo | IDENTICO — nome e argomenti sopravvivono |
| S5 prosa prima della chiamata | IDENTICO |
| S6 attrezzi malformati | IDENTICO — motore vivo |
| S4 token di prompt | **200 / 865 / 2.385 / 4.475** — identici |
| S4 formato e grammatica | `peg-native`, GBNF 0, parser 8.164 / 28.919 / 78.913 / **150.864** — identici |

⇒ **Il forward pin è semanticamente sicuro.** È la condizione che il brief pone
prima di qualunque numero di velocità, ed è soddisfatta.

⛔ Una nota di onestà sul confronto: il file golden del vecchio pin è stato
catturato **prima** che aggiungessi la diagnostica della grammatica, quindi quei
campi lì risultano assenti. Non è deriva: è strumentazione che allora non
c'era. I valori del vecchio pin usati per il confronto sono quelli misurati
separatamente e registrati sopra in questo stesso documento.

**Cancelli su questo pin:** typecheck verde · vitest **5.858** · JVM **303**
letti dagli XML con `--rerun-tasks` (non dal «SUCCESSFUL») · lint verde ·
build nativa verde.

### ⛔⛔⛔ LA MISURA CHE RIBALTA UNA DECISIONE

Stessa matrice, stesso modello, stesso telefono, prefisso freddo, termico
stabile. CPU su 9 giri, GPU su 5.

| | CPU pp/s | **GPU pp/s** | | CPU tg/s | **GPU tg/s** | | CPU TTFT | **GPU TTFT** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **PP512** | 43,82 | **303,44** | **6,92×** | 13,36 | 17,43 | 1,30× | 11.661 ms | **1.684 ms** |
| **PP2048** | 36,78 | **245,95** | **6,69×** | 7,71 | 8,50 | **1,10×** | 55.682 ms | **8.329 ms** |
| **TG256** | 39,14 | 151,22 | 3,86× | 14,68 | 19,28 | 1,31× | 793 ms | **206 ms** |

⛔ La dispersione sulla GPU è **strettissima**: ±0,4-1% contro il ±5-7% della
CPU. MAD di 0,15 su 245,95. Non è rumore: è una macchina diversa.

**E qui sta il punto che vale l'intera Q3 del brief.**

`TalosBackendChoice.Evidence` porta **un numero solo**, `tokensPerSecond`, e il
banco che lo produce è centrato sulla generazione. Con quel metro questo
acceleratore vale **1,10×-1,31×**. La soglia di promozione è **1,25×**.

⇒ **Su PP2048 la politica attuale RIFIUTEREBBE questo backend** — un backend che
taglia l'attesa della persona da **55,7 secondi a 8,3**. Non «insufficiente»:
**sbagliata nel verso peggiore**, perché scarterebbe esattamente il caso in cui
serve di più.

Il prefill è dove sta il guadagno (**6,7-6,9×**), la decodifica quasi non si
muove (**1,1-1,3×**), e la persona aspetta il prefill. Un solo numero non può
vedere questa differenza: è la ragione per cui §Q3 chiede di misurarli separati
**prima** di toccare la politica.

⛔⛔ **COSA QUESTA MISURA NON È, e va letto ogni volta che si rilegge la tabella:**

- **Non è C1.** Pin `d2f83055`, senza `60addddf`. `candidate` nelle righe dice
  `C0-explore` apposta.
- **Non qualifica la Flash Attention.** Presa con `flashAttentionMode=default` e
  KV `f16`; il brief **vieta** una qualificazione FA su OpenCL senza quella
  correzione, e nessun numero qui la riguarda.
- **Non è una promozione.** È il segnale che dice se vale la pena spendere il
  lavoro del forward pin. La risposta è **sì**, e adesso è un numero e non
  un'opinione.
- **Cinque giri, non nove.** Basta con dispersione sotto l'1%, e va rifatta a
  nove quando diventerà una qualificazione vera.
- **Non c'è la tenuta nel tempo.** Nessun test da 10 minuti, nessuna deriva
  termica misurata sotto carico prolungato. `thermal` è restato `none`, ma le
  corse sono brevi.

### ⛔⛔ C1 — OpenCL SUL PIN NUOVO: il pavimento si è alzato, e il verdetto si affila

Stesso APK, cambia solo il bersaglio: è il modo più stretto di isolare il
backend. Entrambi gli insiemi coprono lo **stesso arco termico** (`none`→
`light`) — la prima coppia di corse è stata **scartata** perché C0 era freddo e
C1 caldo, e il mio stesso analizzatore l'ha segnalata.

| | C0 pp/s | C1 pp/s | | C0 tg/s | C1 tg/s | | C0 TTFT | C1 TTFT | |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **PP512** | 60,26 | **302,90** | **5,03×** | 17,51 | 16,95 | **0,97×** | 8.480 ms | **1.693 ms** | 5,01× |
| **PP2048** | 46,05 | **253,94** | **5,51×** | 9,58 | 8,01 | **0,84×** | 44.473 ms | **8.070 ms** | 5,51× |
| **TG256** | 42,35 | 146,23 | 3,45× | 15,70 | 19,07 | 1,21× | 732 ms | **214 ms** | 3,42× |

**1. Il forward pin ha reso la CPU molto più veloce.** Confronto pulito, ⛔
entrambi freddi e `thermal: none`:

| | vecchio pin | nuovo pin | |
|---|---:|---:|---:|
| prefill 512 | 43,82 | **60,43** | **+38%** |
| prefill 2048 | 36,78 | **47,79** | **+30%** |
| decodifica TG256 | 14,68 | **18,60** | **+27%** |

⇒ **163 commit di upstream valgono un terzo di velocità sulla CPU, gratis**, con
zero deriva semantica. Il pin si giustifica da solo, anche senza GPU.

**2. E proprio per questo il verdetto sulla GPU si affila.** Il vantaggio in
decodifica è **evaporato**: dove prima era 1,10-1,31× ora è **0,84-1,21×** —
sotto la CPU su due configurazioni su tre. Ma il prefill resta **5,0-5,5×**, e
il TTFT su 2048 token scende da **44,5 a 8,1 secondi**.

⇒ Con la politica attuale — un numero solo, la velocità di generazione —
OpenCL vale **0,84-1,21×** contro una soglia di **1,25×**: verrebbe
**rifiutato in ogni configurazione**. Prima era una decisione discutibile; ora è
una decisione sbagliata in tutti i casi provati.

### ⛔⛔ G3 — la correttezza: il mio primo criterio era SBAGLIATO

Il gate G3 è il rischio R1, il più alto del programma: la corruzione
silenziosa. Ho scritto il test che confronta il testo INTERO — non i 48
caratteri della sonda che c'era — e al primo giro ha dato rosso: «diverge al
carattere 15 su 427».

Guardando i testi, il rosso era **mio**:

```
prefisso comune   " 1, 2, 3, 5, 7\n"          ← la risposta, IDENTICA
CPU               "Il numero uno non e'…"
GPU               "Questi cinque numeri sono tutti primi, ma…"
```

Entrambi **deterministici** — 3 giri, una sola uscita distinta per lato — ed
entrambi coerenti. La divergenza cade sul **primo token della prosa**, cioè nel
primo punto in cui due continuazioni sono quasi a pari probabilità: lì una
differenza minima nell'ordine di accumulo ribalta l'argmax, e da lì i testi non
si riavvicinano più.

⇒ **Il carattere in cui divergono dice dov'era il primo quasi-pareggio, non
quanto è corrotto un backend.** Con campionamento greedy il testo è un
amplificatore di qualunque differenza numerica: serve a vedere una corruzione
grossolana, non a dimostrarne l'assenza. La soglia che avevo messo è stata
tolta, con la spiegazione accanto.

⛔ **E il verdetto G3 resta APERTO.** Il cancello vero è a livello di operatore
ed è quello di upstream: `tests/test-backend-ops.cpp` confronta con un errore
quadratico medio normalizzato, tolleranza `1e-7` — «to allow for accumulated
floating-point rounding differences across backends». Bit a bit non lo pretende
nessuno. Upstream lo fa girare sul telefono con
`./scripts/build-run-android.sh run_testops`. ⇒ **Ed è stato fatto: la sezione
qui sotto è il suo esito.**

⇒ Quello che si poteva dire prima di eseguirlo: nessuna corruzione grossolana,
entrambi i lati deterministici, risposta identica fino al primo quasi-pareggio.
Quello che **non** si poteva dire — che OpenCL sia corretto — lo risponde
`test-backend-ops`, e la risposta è **divisa**.

### ✅⛔ G3 — IL CANCELLO VERO, eseguito: `test-backend-ops` sul telefono

Non più il confronto fra testi, che avevo già dichiarato inadatto: il cancello
di upstream, a livello di **operatore**, con le sue tolleranze. Costruito con
NDK + CMake (lo script `build-run-android.sh` non esiste a questo pin) e
spinto in `/data/local/tmp` con i backend accanto.

⛔ Due inciampi prima di vederlo girare, entrambi da registrare: il binario
cercava `/odm/lib64/libomp.so` e non poteva mapparla («phdr mmap failed:
Permission denied») — risolto mettendogli accanto la `libomp.so` dell'NDK.

**Il verdetto grezzo:**

```
Testing 2 devices
Backend 1/2: GPUOpenCL — QUALCOMM Adreno(TM) 830
Backend 2/2: CPU — Skipping CPU backend   (è il riferimento)
1/2 backends passed
FAIL
```

**330 fallimenti su 12.463 casi**, e la loro distribuzione è tutto:

| operatore | falliti | cos'è | tocca i nostri modelli? |
|---|---:|---|---|
| **MUL_MAT_ID** | **305** | il matmul del routing **Mixture-of-Experts** | ⛔ **no** — i nostri tre sono densi |
| CONV_2D | 12 | convoluzione 2D | no — visione/audio, non il testo |
| MUL | 6 | prodotto elemento per elemento | forme isolate |
| NORM | 5 | LayerNorm, **una sola forma** `[33,5,4,3]`, err ~1,5e-3 contro 1e-7 | no — i nostri usano RMS_NORM |

**E il dato che vale più di tutti — ciò che NON fallisce:**

| operatore del percorso denso | casi | falliti |
|---|---:|---:|
| **FLASH_ATTN_EXT** | 5.145 (2.677 OK, 2.448 non supportati) | **0** |
| MUL_MAT | 1.557 | **0** |
| CPY | 581 | **0** |
| ROPE | 466 | **0** |
| SOFT_MAX | 212 | **0** |
| GET_ROWS | 119 | **0** |
| ADD | 99 | **0** |
| CONT | 78 | **0** |
| RMS_NORM | 51 | **0** |

⇒ ⭐ **La correzione `60addddf` REGGE.** `FLASH_ATTN_EXT` non sbaglia un caso su
2.677 eseguiti, su questa Adreno, con questo driver. Era l'ipotesi che teneva in
piedi metà del brief — la race WAR nei kernel FA generici — ed è verificata sul
dispositivo, non dedotta dal PR.

⇒ **E l'intero percorso di inferenza densa è pulito.** Matmul, attenzione, rope,
normalizzazione RMS, copie, softmax: zero fallimenti.

### ⇒ Il verdetto G3, in due righe diverse

| caso | verdetto |
|---|---|
| **modelli DENSI** (Llama 3.2, Qwen3 1.7B, Gemma 3 4B — i tre sul Pad) | **PASS** — nessun operatore del loro percorso fallisce |
| **modelli Mixture-of-Experts** | ⛔ **REJECTED** — `MUL_MAT_ID` sbaglia in **305** casi, con errori fino a **0,43** contro una tolleranza di 5e-4 |

⛔⛔ E questa seconda riga è un vincolo di **prodotto**, non di ricerca: se TALOS
spedisse un giorno un modello MoE con OpenCL acceso, il backend lo
**corromperebbe in silenzio** — che è esattamente il rischio R1. Chi accende
OpenCL deve accenderlo **per architettura**, non per dispositivo.

⛔ `NORM` fallisce a `1,5e-3` contro `1e-7`: non è arrotondamento, è un difetto
vero, su una forma sola. Non tocca i nostri modelli (usano RMS_NORM, che passa),
ma toccherebbe un'architettura con LayerNorm.

📁 Log completo: `mobile/.tmp-research/testops-opencl.log`, 21.572 righe.

### ⛔⛔⛔ VULKAN — costruito, caricato, e **CRASHA**. Verdetto: FAILED (G2)

Sbloccato scaricando quello che mancava, che l'owner ha autorizzato. Costruisce,
si registra, fa offload — e poi muore.

**Si registra, e dichiara cose diverse da OpenCL:**

```json
{"name":"Vulkan","devices":[{"name":"Vulkan0","description":"Adreno (TM) 830",
  "type":"IGPU","memoryFree":16293498880,"memoryTotal":16293498880,
  "caps":{"async":true,"hostBuffer":true,"bufferFromHostPtr":false,"events":true}}]}
```

| | OpenCL | Vulkan |
|---|---|---|
| tipo | `GPU` | `IGPU` |
| memoria dichiarata | 5.999.267.840 | 16.293.498.880 (unificata) |
| `async` / `events` | false / false | **true / true** |

**E fa offload davvero:**

```
llama_prepare_model_devices: using device Vulkan0 (Adreno (TM) 830) - 15538 MiB free
load_tensors: offloaded 29/29 layers to GPU
load_tensors:      Vulkan0 model buffer size =  1918.35 MiB
llama_kv_cache:    Vulkan0 KV buffer size =   896.00 MiB
sched_reserve: graph nodes = 874 · graph splits = 2
```

**Poi, al primo grafo di calcolo vero, muore:**

```
PP512: prompt da 511 token
signal 11 (SIGSEGV), code 1 (SEGV_MAPERR), fault addr 0x0
  #00 /vendor/lib64/hw/vulkan.adreno.so
        qglinternal::vkGetDeviceFaultInfoEXT(...)+400
  #03 libggml-vulkan.so  vk_queue_handle_synchronized::submit(...)+2284
  #07 libggml-base.so    ggml_backend_sched_graph_compute_async+996
  #08 libllama.so        llama_context::graph_compute+156
```

⛔ **Riprodotto 2 volte su 2**, anche con contesto 512 e generazione da 8 token:
non è una questione di dimensione.

⛔⛔ **E il crash è a DUE strati, che è la parte peggiore.** Un submit alla coda
va storto; ggml chiede al driver i dettagli con `vkGetDeviceFaultInfoEXT`; e **è
il driver Adreno a segmentare dentro la propria funzione di diagnosi**. ⇒ La
causa prima resta nascosta dallo strumento che doveva rivelarla. Stessa famiglia
degli altri silenzi di oggi, un piano più in basso.

⇒ **Verdetto per la corsia Vulkan al pin `d2f83055`: FAILED sul cancello G2
(stabilità nativa).** Non «lento»: il brief è esplicito — un crash è FAILED, non
una misura scarsa. Nessun numero di prestazioni Vulkan esiste, e nessuno può
esistere finché questo non si chiude.

### ⛔ Il crash Vulkan è NOTO A UPSTREAM — e la loro ipotesi qui NON regge

Cercato prima di ipotizzare, come impone la regola nuova. Upstream ha **due
issue aperti** che descrivono lo stesso guasto sulla stessa famiglia di GPU:

| issue | dispositivo | soglia | esito |
|---|---|---|---|
| [#8743](https://github.com/ggml-org/llama.cpp/issues/8743) | Adreno **750**, su un **OnePlus** | batch ≥ 33 | `vk::DeviceLostError` |
| [#12139](https://github.com/ggml-org/llama.cpp/issues/12139) | Adreno **732** | batch > 32 | idem |

Entrambi **open**, **unconfirmed**, **stale**: nessuna causa, nessuna cura,
nessun commit collegato. E il segnalatore di #8743 lascia la frase che rende
l'ipotesi verificabile: «I also tried submitting the operator one by one … and
it succeeded».

⇒ Ipotesi: la soglia è il **batch**, e con un microbatch piccolo Vulkan regge.
Provata sull'830, con calcolo vero (non solo apertura):

| microbatch | esito |
|---:|---|
| 256 | ⛔ CRASH |
| **32** | ⛔ **CRASH** |

⛔ **L'ipotesi è SMENTITA su questo dispositivo.** A 32 — sotto la soglia che
fa passare le altre due Adreno — l'830 muore lo stesso. ⇒ Il nostro guasto è
**più grave** di quello descritto negli issue, non lo stesso con un numero
diverso: qui non esiste un microbatch che lo eviti.

⛔ Nota per chi riprende: la prima sonda che ho usato (`c0Carico`) passava a
**tutti** i valori, perché apre e chiude il modello **senza calcolare**. Il
crash sta nel grafo di calcolo. Una sonda che non calcola avrebbe dichiarato
Vulkan sana.

⛔⛔ Quello che NON ho provato, e perché: il `n_batch` — il batch **logico** —
è fisso a 512 dentro `talos_apri_modello`, e cambiarlo tocca il percorso di
produzione. Gli issue upstream parlano del `-b` di `llama-bench`, che è
proprio `n_batch`. ⇒ Resta l'ultima variabile non esplorata, e richiede una
manopola di ricerca in più. **Non l'ho aggiunta**: il brief di ripresa dice che
Vulkan resta parcheggiata e che la priorità è la Fase 1.

### ⛔ VK-3 — **NOT RELEVANT**, e ora è un fatto

```
ggml_vulkan: 0 = Adreno (TM) 830 (Qualcomm Adreno Vulkan Driver)
  | uma: 1 | fp16: 1 | bf16: 0 | fp4: 0 | warp size: 64
  | shared memory: 32768 | int dot: 0 | matrix cores: none
```

**`matrix cores: none`.** Il percorso di `dc72703` — il dequant Q8_0 della KV —
è **coopmat1** ed è escluso sui device senza cooperative matrix. ⇒ Su questo
telefono quel commit è **NOT RELEVANT**, e con lui cade metà della motivazione
per la corsia Vulkan che il brief costruiva. Era il sospetto di stamattina,
letto dal PR; adesso è misurato sul dispositivo.

### I prerequisiti Vulkan, risolti — e uno resta un vincolo di PRODOTTO

Nessun MSVC da diversi GB: è bastata una toolchain portatile.

| pezzo | dove | nota |
|---|---|---|
| gcc/g++ 16.2.0 | `toolchains/mingw64` | winlibs, zip da 261 MB — non un installatore |
| SPIRV-Headers | `toolchains/spirv-install` | ⛔ il clone NON basta: `find_package` cerca `SPIRV-HeadersConfig.cmake`, che nasce da `cmake --install` |
| Vulkan-Hpp v1.3.275 | `toolchains/Vulkan-Headers` | ⛔ l'NDK porta `vulkan.h`, **non** `vulkan.hpp` |
| radice unica | `toolchains/vulkan-include` | ⛔ ggml include `spirv/unified1/spirv.hpp` **senza linkare il target SPIRV**: dà per scontato che i due set stiano nella stessa radice, come in un Vulkan SDK |

⛔⛔ **E il vincolo che non è di build ma di PRODOTTO.** Il collegamento falliva
con `undefined symbol: vkGetPhysicalDeviceFeatures2`. È Vulkan 1.1, e l'NDK lo
espone **dall'API 28** — verificato livello per livello con `llvm-readelf`:
26 no, 27 no, 28 sì. Il nostro `minSdk` è **26**. ⇒ Una `libggml-vulkan.so`
legata a quei simboli **non si carica su Android 8 e 8.1**. Per la ricerca va
bene (il Pad è Android 16), ma una promozione richiederebbe **o alzare minSdk, o
il carico dinamico dei simboli**: due decisioni di prodotto, non di build.

### ⛔⛔ G4 — LO STOP SOTTO GPU: due guasti diversi, e uno ha già la leva

Il cancello G4 chiede due cose insieme: che il p95 dello Stop non peggiori di
oltre 250 ms rispetto alla CPU, e che **nessuna** latenza superi 1.500 ms.
Misurato su OpenCL, prefill:

```
STOP-prefill (OpenCL, ub 256):  2753  928  166  155  158   → p50 166  max 2753
STOP-prefill (OpenCL, ub 256):  3181  935  163  154  157   → p50 163  max 3181
STOP-decode  (OpenCL, ub 256):    49   53   39   51   39   → p50  49  max   53
CPU di riferimento:             prefill p50 5 max 21 · decodifica p50 0 max 0
```

⇒ **la decodifica passa, il prefill no.** Ma il *perché* non era quello che
avevo scritto, e le due ipotesi sbagliate sono servite a trovarne una giusta.

#### ⛔ La prima ipotesi era falsa: la cache dei kernel era GIÀ accesa

Avevo scritto che dentro TALOS la cache dei kernel OpenCL è disabilitata in
silenzio, perché `default_cache_dir()` torna vuoto quando `TMPDIR` non c'è — il
caso che il commento di upstream nomina («Android app contexts with TMPDIR
unset»). La prova che avevo era `TMPDIR=` vuoto sotto `run-as ai.talos`.

⛔ **Quell'ambiente non è quello del processo dell'app.** La prova vera stava già
sul telefono:

```
/data/data/ai.talos/cache/llama.cpp/cl-cache   181 file .clbin, 4,3 MB, ore 18:38
le corse Stop con l'anomalia da 3.181 ms                            ore 19:47 e 19:49
```

La cache era piena **un'ora prima** delle misure che pretendevo di spiegare con
la sua assenza. Cancellandola e rimisurando, il verso contrario lo conferma:

| cache | primo Stop | durata del test | `.clbin` dopo |
|---|---:|---:|---:|
| calda (181 file) | 2.760 ms | 20 s | 181 |
| **cancellata** | **4.786 ms** | **52 s** | **181, riscritti** |

⇒ La cache funziona, si scrive e vale 32 secondi di avvio. **E non toglie
l'anomalia.** Ipotesi chiusa: non è la compilazione dei kernel.

⛔ Un dettaglio che resta: la riga `ggml_opencl: kernel cache enabled at '…'` —
che è `GGML_LOG_INFO` — **non arriva in logcat**, mentre le altre righe
`ggml_opencl:` ci arrivano. Il comportamento prova che la cache è accesa; il log
no. Piccolo, ma è esattamente il tipo di silenzio che mi ha fatto sbagliare.

#### ⛔ La seconda ipotesi era falsa: non c'è riuso del prefisso

Il sospetto successivo era che i giri 1-4 riusassero la KV del giro precedente,
e che quindi solo il giro 0 misurasse davvero un prefill. Il test registra
`tokensBeforeStop`, e vale **0 in tutti e cinque i giri** — con un'asserzione che
lo pretende. Erano tutti prefill davvero. Ipotesi chiusa.

#### ✅ Quello che succede davvero: lo Stop NON interrompe, si aspetta il grafo

Basta cambiare **quando** si preme. Stesso modello, stesso telefono, freddo:

| quando si preme Stop | latenza a regime | somma |
|---:|---:|---:|
| dopo 1.500 ms | 155 ms | **1.655 ms** |
| dopo **200 ms** | **1.458 ms** | **1.658 ms** |

**Tre millisecondi di differenza su due esperimenti opposti.** La latenza non è
una proprietà dello Stop: è il tempo che *mancava* alla fine del prefill.
`nativeGenerate` torna sempre a ~1.657 ms dall'inizio, qualunque sia il momento
in cui si preme. Il «p50 155 ms» del cancello non misurava la prontezza: era il
residuo di un prefill da 1,7 s in cui avevamo aspettato 1,5 s.

E il verso contrario lo separa dalla CPU in modo netto — stesso test, stessa
attesa di 200 ms:

```
CPU      36   1   0   1   7  ms     ← la callback di abort morde
OpenCL 4095 605 1460 1460 1455 ms   ← si aspetta la fine del grafo
```

⇒ Non è una lentezza: sotto GPU **lo Stop non è onorato dentro il prefill**.
Combacia con la nota nell'header di llama.cpp, che dice che la callback di abort
«currently works only with CPU execution» — e adesso è un numero, non una nota.

#### ✅ La leva c'è già, ed è il MICROBATCH

L'attesa massima per fermarsi è **un microbatch**: è scritto nel commento di
`talos_apri_modello` come intenzione di progetto, e finora non era mai stata
misurata sotto GPU. Il valore predefinito è 256. Provato a 128 e a 64, sempre
premendo Stop dopo 200 ms:

| microbatch | Stop a regime | PP512 | PP2048 | TG | TTFT 512 | TTFT 2048 |
|---:|---:|---:|---:|---:|---:|---:|
| **256** (oggi) | **~1.458 ms** | 307 tok/s | 256 tok/s | 18,9 | 1.665 ms | 8.006 ms |
| **128** | **~258 ms** | 280 (−9%) | 238 (−7%) | ~19 | 1.828 ms | 8.608 ms |
| **64** | **~90 ms** | 225 (−27%) | 197 (−23%) | 19,0 | 2.268 ms | 10.374 ms |

⇒ **Il ginocchio è 128.** Nove per cento di prefill comprano uno Stop **5,6
volte** più pronto; scendere a 64 costa altri tre volte tanto in prefill per un
fattore 2,9. **La decodifica non si tocca**: il microbatch riguarda solo il
prefill, e TG resta ~19 tok/s in tutte e tre le configurazioni.

⛔ **Onestà sulla riga TG a 128**: due giri su cinque hanno dato 13,4 e 15,8
tok/s, e `Thermal Status` è salito a **2** proprio durante quel blocco. I PP
della stessa corsa sono strettissimi (280,0-280,3 e 237,8-238,2), quindi il
guasto è nella coda della corsa, non nella configurazione — ma quella riga **va
rifatta a freddo** prima che qualcuno ci si appoggi.

#### ⛔ E resta il giro 0, che non è dello Stop: è del PROCESSO

Il primo giro resta fuori scala in **ogni** configurazione — 4.095 ms a 256,
6.032 a 128, 4.039 a 64 — e né la cache né il microbatch lo spostano. Non è un
guasto dello Stop: è il **primo inferire di ogni processo**, e la misura di
velocità lo mostrava già, scartandolo come riscaldamento:

```
PP512  giro di riscaldamento   pp  80,7 tok/s   TTFT 6.343 ms
PP512  giri 0-4                pp 307   tok/s   TTFT 1.662 ms
```

⇒ **da +4,7 a +6,6 secondi una volta per processo** — l'intervallo di tre
misure, non un numero solo — che la persona paga sul primo
messaggio dopo aver aperto un modello — e che nessuna delle nostre tabelle
mostrava, perché il giro di riscaldamento viene buttato via per costruzione.
⛔ Non è la cache dei kernel (provato sopra: con cache calda restano 2.760 ms).
Resta da capire cosa sia; è il primo aperto di questa area.

#### ✅ Esito del cancello: G4 SI PUÒ PASSARE, e servono DUE manopole

⛔ **I cancelli sono due, e il secondo è molto più stretto del primo.** G4 chiede
che nessuna latenza superi **1.500 ms** *e* che il p95 non peggiori di oltre
**250 ms** rispetto alla CPU. Il riferimento CPU, misurato con la stessa attesa
di 200 ms, è **p95 36 ms** ⇒ il tetto vero è **286 ms**, non 1.500.

Sei configurazioni, tutte con lo Stop premuto dopo 200 ms, telefono freddo a
ogni corsa:

| flash-attn | microbatch | giro 0 | p50 | **p95** | ≤ 1.500 ms | **≤ 286 ms** |
|---|---:|---:|---:|---:|:---:|:---:|
| **on** | **512 — com'è DAVVERO oggi** | **5.926** | **1.412** | **5.926** | ⛔ | ⛔ |
| on | 256 (il ripiego del JNI) | 4.095 | 1.460 | 4.095 | ⛔ | ⛔ |
| on | 128 | 6.032 | 273 | 6.032 | ⛔ | ⛔ |
| on | 64 | 4.039 | 93 | 4.039 | ⛔ | ⛔ |
| **off** | 256 | 1.444 | 1.430 | 1.444 | ✅ | ⛔ |
| **off** | 128 | 300 | 275 | 300 | ✅ | ⛔ **per 14 ms** |
| **off** | **64** | **128** | **102** | **128** | ✅ | ✅ |

⇒ Le due manopole curano **due guasti diversi**, e serve tutte e due:

- **La Flash Attention spenta toglie il giro 0.** Con `off` la colonna «giro 0»
  smette di esistere come categoria: 1.444, 1.431, 1.429, 1.430, 1.426 — cinque
  giri **piatti**. È la prova finale che quei 4-6 secondi erano la compilazione
  pigra dei kernel FA, e nient'altro.
- **Il microbatch toglie l'attesa a regime**, perché l'attesa massima per
  fermarsi è un microbatch.

⛔ **E il 128 NON basta, per quattordici millisecondi.** Passa il tetto dei
1.500 ms e manca quello vero: p95 300 contro 286. Non lo arrotondo: un cancello
mancato di poco è un cancello mancato, e il numero che conta è il secondo.

⛔ **Nota sul 512, che è il valore vero:** a regime dà **1.412 ms**, cioè
praticamente quanto il 256 (1.458). Non è una sorpresa una volta capito che
l'abort **non morde nemmeno ai confini di microbatch** su questo backend: in
entrambi i casi si aspetta il prefill intero. La differenza fra 512 e 256 la
fanno il **giro 0** (5.926 contro 4.095) e il prefill, non lo Stop a regime.

⇒ **G4 PASSA con `flash-attn off` + `microbatch 64`**, e con nient'altro fra ciò
che ho provato. ⛔ Con la produzione com'è davvero — FA accesa, microbatch **512** — il cancello
è **FAILED** su entrambe le condizioni, e il p95 è **5.926 ms**: venti volte il
tetto.

#### ⛔⛔ E la manopola NON è dove l'avevo cercata — né il valore quello che credevo

Trovato aprendo la Fase 7, e smentisce una mia riga sopra. `n_ubatch = 256` in
`talos_apri_modello` è un **ripiego**, non il valore di produzione: il plugin
riceve un `microBatch` esplicito, e chi glielo manda è TypeScript —
`src/lib/models/engineTuning.ts`:

```ts
const microBatch = core >= 6 ? 512 : 256
```

Il Pad ha **8 core** ⇒ la produzione apre a **512**, non a 256.

⛔ **Tre** conseguenze, e nessuna comoda:

1. **Tutta la matrice qui sopra parte dal valore sbagliato.** 256, 128 e 64 sono
   stati misurati contro il ripiego del JNI, che la produzione non usa mai. Il
   punto di partenza vero è 512, dove lo Stop nel prefill sarà **peggio** di
   1.458 ms — misura in coda sul Pad mentre scrivo.
2. **La cura non è in C++.** Sta in `engineTuning.ts`, ed è una riga di
   TypeScript. Avevo scritto «una riga in `talos_apri_modello`»: sbagliato.
3. ⛔ **E nemmeno il pavimento CPU è quello di produzione.** Tutte le misure C0
   di questo ramo sono state prese con `talosMicroBatch=0`, cioè lo stesso
   ripiego da 256. La CPU di produzione, con 8 core, apre a **512** come la
   GPU. ⇒ Anche il termine di paragone va rimisurato, ed è in coda.

⭐ Va detta anche una cosa a favore di chi l'ha scritta: il commento sopra quella
riga **aveva già capito il compromesso** — «l'attesa massima dello Stop è un
microbatch intero: raddoppiarlo raddoppia il tempo che passa fra il dito e il
silenzio». Il ragionamento era giusto e non era mai stato **verificato su una
GPU**. Adesso lo è, e il numero è più brutto di quanto la prosa lasciasse
immaginare.

#### Il prezzo, scritto accanto

⛔ Raccomandare una configurazione senza misurarne il costo sarebbe la stessa
mezza misura che ho rimproverato altrove. Le tre configurazioni con la Flash
Attention spenta, telefono freddo a ogni corsa:

| flash-attn / microbatch | PP512 | PP2048 | decodifica (dopo 2048) | TTFT 512 | Stop p95 | G4 |
|---|---:|---:|---:|---:|---:|:---:|
| on / 256 — ⛔ **NON è «oggi»**, è il ripiego del JNI | 307 tok/s | 256 tok/s | 8,1 tok/s | 1.663 ms | 4.095 ms | ⛔ |
| **on / 512** — com'è **davvero oggi** | **314** | **260** | **8,07** | **1.628** | **5.926 ms** | ⛔ |
| off / 256 | **312** | **268** | **15,9** | **1.640** | 1.444 ms | ⛔ |
| off / 128 | 284 | 247 | 15,9 | 1.805 | 300 ms | ⛔ (per 14 ms) |
| **off / 64** | 227 | 204 | **15,9** | 2.256 | **128 ms** | ✅ |

⇒ Rispetto a **oggi**, la configurazione che passa il cancello — `off / 64` —
costa **prefill** e regala tutto il resto:

| | **oggi** (`on / 512`) | `off / 64` | |
|---|---:|---:|---|
| prefill 512 | 314 tok/s | 227 | **−28%** |
| prefill 2048 | 260 tok/s | 204 | **−22%** |
| decodifica dopo 2048 token | 8,07 tok/s | **15,9** | **+97%** |
| primo messaggio del processo | 6.233 ms | **1.646-2.253** | **−4,0 … −4,6 s** |
| Stop durante il prefill (p95) | **5.926 ms** | **128** | **46×** |

⛔ **E il prefill non è una perdita netta**, perché la persona non aspetta il
prefill: aspetta il **TTFT**, e su 512 token quello passa da 1.663 a 2.256 ms —
**+593 ms una volta**, contro 4,7-6,6 secondi risparmiati sul primo messaggio e una
decodifica doppia per tutto il resto della conversazione. Su 2.048 token il
conto si inverte: TTFT 8.006 → 10.043 ms, **+2 secondi**, ed è lì che la scelta
diventa un compromesso vero invece che un guadagno secco.

⇒ ⛔ **Per questo la decisione è dell'owner e non mia**: dipende da quanto lungo
è il prompt tipico dell'assistente, che è una domanda di prodotto. Se il prompt
di sistema è lungo, `off / 128` — che manca il cancello per 14 ms — potrebbe
essere il compromesso migliore *nonostante* il cancello.

⛔⛔ **Non ho toccato la produzione**, e nessuna delle due cure è mia da
applicare: vivono entrambe in `talos_apri_modello`, e cambiano la velocità per
tutti. Sono **decisioni di prodotto**, e le porto con il prezzo scritto accanto.

### ✅⛔⛔ OCL-4 — LA FLASH ATTENTION SU ADRENO 830: costa, e non rende

Il brief chiede i tre casi separati — `off`, `auto`, `on` — perché la
documentazione upstream dice che «la Flash Attention non migliora sempre» su
OpenCL. Era una nota; adesso è un numero, e il numero è grosso.

⛔ **Prima di tutto una precisazione, e cambia la lettura di tutto il resto.**
`default` non vuol dire «spenta»: `llama_context_default_params()` mette `AUTO`,
e su questo telefono `AUTO` **risolve in acceso** — le corse `default` hanno
riga per riga i numeri di `on`.

⛔⛔ **Ma NON vuol dire che le persone stiano pagando questo conto oggi**, e
prima l'avevo scritto come se lo pagassero. Verificato sull'APK di rilascio e
sui chiamanti — vedi la sezione sulla Fase 7 qui sotto: la produzione **non
spedisce nessun backend GPU**, `gpuLayers` vale 0 e nessuno lo passa. ⇒ Ciò che
segue descrive il regime in cui l'app girerà **il giorno in cui la GPU verrà
spedita**, non quello di adesso: la compilazione pigra dei kernel e la
decodifica dimezzata sono fenomeni **di OpenCL**, e OpenCL nell'app non c'è.

Cinque giri per configurazione più uno di riscaldamento, telefono **freddo a
ogni blocco** (`Thermal Status: 0` verificato prima di ognuno):

| | **FA off** | FA auto | FA on |
|---|---:|---:|---:|
| primo inferire del processo (TTFT) | **1.646 ms** | 8.230 ms | 8.031 ms |
| PP512 — prefill | **312 tok/s** | 307 | 307 |
| PP512 — decodifica | **18,4 tok/s** | 16,8 | 16,8 |
| PP2048 — prefill | **268 tok/s** | 256 | 256 |
| **PP2048 — decodifica** | **15,9 tok/s** | **8,1** | **8,1** |
| TG256 (prompt da 31 token) — decodifica | 19,5 | 19,3 | 19,2 |

⇒ **`auto` e `on` sono la stessa cosa** su questo dispositivo — e non è una
lettura a occhio della tabella: confrontate mediana per mediana, le due
configurazioni distano **0,07-2,4%**, cioè rumore.

```
PP512    pp  307,28 vs 306,72  (−0,18%)   ttft 1.665 vs 1.667   (+0,12%)
PP2048   pp  193,50 vs 193,37  (−0,07%)   ttft 10.585 vs 10.593 (+0,08%)
TG256    pp  149,04 vs 146,23  (−1,89%)   ttft 209 vs 214       (+2,39%)
```

E `off` vince su **ogni** metrica misurata:

1. **Da 4,7 a 6,6 secondi in meno sul primo messaggio** dopo aver aperto un
   modello — misurato tre volte con FA accesa (6.314, 8.031, 8.230 ms) contro
   1.646 con FA spenta, ed è un **intervallo**, non un valore. Con `off`
   la riga `lazy-compiling flash_attn prepass` non compare affatto, e il giro di
   riscaldamento smette di essere un'anomalia: 1.646 ms contro 1.635 a regime.
2. **La decodifica dopo un prompt lungo RADDOPPIA** — 15,9 contro 8,1 tok/s. E
   il costo **cresce con la lunghezza della KV**: su un prompt da 31 token le
   due configurazioni sono indistinguibili (19,5 contro 19,2), su 2.048 token la
   differenza è due volte.
3. Il prefill migliora anche lui, di poco ma in modo netto: +1,6% su 512 token,
   **+4,7% su 2.048**.

#### ⛔ Il verso contrario, perché l'ordine era un sospetto legittimo

La prima campagna aveva girato `off` → `auto` → `on`, e `off` era stato il
blocco **più freddo di tutti**: `Thermal Status` arriva a 2 in ogni blocco. Un
vantaggio del 100% sulla decodifica poteva essere semplicemente il primo che
corre.

⇒ Rifatta invertendo l'ordine — `on` **per primo e da freddo**, raffreddamento
completo fino a `Thermal Status: 0` fra i due blocchi, **stessa APK** per
entrambi. `on` riproduce sé stesso: riscaldamento TTFT **6.314 ms**, PP512 a
regime 306-308 tok/s, PP2048 255,5-256,5 e decodifica **8,1-8,3 tok/s**.

E `off`, che stavolta è il blocco **svantaggiato**, vince lo stesso:

```
off (secondo, in salita termica)   PP2048  267,6  265,7  262,8 | 222,1  198,8  198,9 tok/s
                                   decodif. 15,9   15,5   15,7 |  11,3   11,3   11,0 tok/s
on  (primo, da freddo)             PP2048  256,5  255,8  255,7 | 232,5  193,2       tok/s
                                   decodif.  8,2    8,2    8,3 |   7,6    7,5       tok/s
```

⛔ Da leggere fino in fondo: dopo la barra il telefono sta **strozzando** in
entrambi i blocchi. E anche strozzata, la decodifica di `off` — 11,0-11,3 tok/s —
resta sopra quella di `on` **da freddo**, 8,1-8,3. ⇒ Non era l'ordine, e non era
il calore.

#### ⛔ Perché il primo inferire costa: la compilazione PIGRA, e la cache che non la copre

Il logcat lo dice con le parole di upstream. Fra la prima riga di compilazione e
il primo prompt passano **5.845 ms**, in sette compilazioni:

```
ggml_opencl: lazy-compiling flash_attn prepass for DK=128 DV=128
ggml_opencl: compiling fa prepass f16
ggml_opencl: compiling fa f32_f16
ggml_opencl: compiling fa f32_f16 MQ_GQA=8
ggml_opencl: compiling fa f32_f16 c8 NSG2
ggml_opencl: compiling fa f32_f16 c8 g8 NSG2
ggml_opencl: compiling fa f32_f16 split
```

⛔ E **quattro dei kernel prodotti vengono buttati subito dopo**, perché la GPU
non li regge:

```
flash_attn_f32_f16_q1_vec_mq (g8) DK=128 DV=128
    per-kernel max 128 < required 192; skipping registration
```

⛔⛔ **E nessuno di quei programmi finisce nella cache su disco.** Non è un caso
a runtime, è **strutturale** — si legge nella sorgente del pin:

| funzione | consulta la cache | salva nella cache |
|---|---|---|
| `build_program_from_source` | ✅ `cl_program_cache_try_load` | ✅ `cl_program_cache_try_save` |
| `build_program_from_source_ex` | ❌ | ❌ |

e **tutti e quattordici** i punti di compilazione della Flash Attention passano
da `_ex`. ⇒ I `.clbin` restano 181 prima e dopo, e **ogni processo ripaga i 5,8
secondi**. È anche la ragione per cui, cancellando la cache e rimisurando, il
primo Stop peggiorava (2.760 → 4.786 ms) ma **non spariva**: la cache copre
tutto il resto, non questo.

#### ✅ E le parole non cambiano — misurato, non assunto

Una proposta «spegniamola, è più veloce» che non porta anche la prova semantica
chiede di fidarsi di metà misura: la Flash Attention non è la stessa aritmetica
scritta più in fretta, è un'altra strada con arrotondamenti diversi.

Suite golden sul dispositivo, stesso modello, campionamento deterministico,
`OpenCL/GPUOpenCL`, una corsa con `on` e una con `off`, telefono freddo a
entrambe:

```
S1 IDENTICO   S2 IDENTICO   S3 IDENTICO   S4 IDENTICO
S5 IDENTICO   S6 IDENTICO   S7 IDENTICO
⇒ tutti e 7 identici
```

⛔⛔ **E c'è di peggio, trovato rileggendo il test il 20/8 a sera: quella corsa
NON usava la GPU.** `TalosSemanticGoldenDeviceTest` apriva con `gpuLayers = 0`
scritto a mano, quindi dichiarava il bersaglio `OpenCL/GPUOpenCL` e poi calcolava
**tutto sulla CPU**. ⇒ Il confronto qui sopra descrive i kernel della **CPU**,
non quelli di OpenCL, ed è la prova sbagliata per la raccomandazione che ne ho
tratto. ⛔ Un bersaglio dichiarato e non usato è peggio di uno mancante: il file
lo registra e la riga sembra una prova. Corretto (`talosGpuLayers`,
`talosMicroBatch`, entrambi scritti in ogni riga) e **rifatto sul serio**: vedi
la sezione qui sotto.

⛔ **Onestà su cosa prova e cosa no.** Tre di questi sette casi contengono testo
generato davvero — S1 («Sto bene, grazie.»), S3 (la chiamata `meteo` con i suoi
argomenti) e S5 (prosa più chiamata, con la chiamata che sopravvive alla prosa).
Gli altri quattro descrivono il template e la grammatica, che la Flash Attention
non tocca. ⇒ È una prova **stretta**: tre risposte identiche, non una
dimostrazione di equivalenza su qualunque prompt. È però la stessa prova che
abbiamo usato per qualificare il forward pin, e lì era il metro accettato.

#### La proposta, che non applico

⛔ **Flash Attention `off` per i bersagli OpenCL su Adreno.** È una riga in
`talos_apri_modello`, tocca la produzione, ed è una **decisione dell'owner**.
Quello che porto è la misura: su questo dispositivo `off` vince su ogni asse,
e il guadagno più grosso — il raddoppio della decodifica su prompt lunghi — è
esattamente il caso d'uso dell'assistente, che lavora con un prompt di sistema
lungo.

⛔ **E non la generalizzo.** Upstream elenca «migliorare la Flash Attention» fra
i propri TODO e «non migliora sempre le prestazioni» fra i propri difetti noti:
è una proprietà di *questo* backend su *questa* GPU oggi, non una legge. Su un
altro dispositivo si rimisura — la manopola `talosFlashAttn` adesso c'è, e il
valore scelto finisce **scritto in ogni riga** di `runs.jsonl` e `golden.jsonl`.

### ⛔⛔ G5 — DIECI MINUTI: non cala, OSCILLA. E i nostri strumenti non lo vedono

Il brief chiede la tenuta nel tempo, e non era mai stata misurata: ogni altra
corsa di questo ramo dura fra i quindici secondi e i tre minuti e parte da un
telefono freddo. ⇒ Descrivevano un telefono che non esiste, quello di chi fa una
domanda sola.

Dieci minuti di carico continuo, **configurazione di produzione com'è oggi**
(Flash Attention `default` = accesa, microbatch 256), OpenCL, prompt corto e
generazione lunga — 71 giri:

```
giro   0    11s   tg 19,5   TTFT 4.786 ms   ← la compilazione pigra della FA
giro  10    80s   tg 19,4   TTFT   208
giro  20   162s   tg 19,2   TTFT   209
giro  30   251s   tg 19,3   TTFT   211
giro  40   337s   tg 13,5   TTFT   270
giro  50   421s   tg 13,5   TTFT   279
giro  60   519s   tg 13,5   TTFT   273
giro  70   601s   tg 13,6   TTFT   275
```

⛔ **Questa tabella mente, ed è la mia.** Un campione ogni dieci giri disegna uno
scalino netto a metà corsa. La serie intera dice un'altra cosa:

```
giro 12 (1,6 min)  19,35 → 14,88        giro 43 (6,0 min)  14,58 → 19,38
giro 17 (2,3 min)  13,90 → 19,30        giro 47 (6,5 min)  19,16 → 13,96
giro 23 (3,1 min)  17,31 → 13,58        giro 62 (8,9 min)  13,56 → 19,23
giro 30 (4,2 min)  13,75 → 19,34        giro 67 (9,5 min)  19,31 → 14,08
giro 35 (4,8 min)  19,45 → 13,70
```

⇒ **Non è una discesa: è un'oscillazione fra due livelli stabili** — 19,3 e
13,6 tok/s, rapporto **1,42×** — con **nove transizioni** in dieci minuti e il
**55,7% del tempo** nello stato basso. La forma è quella di un gradino di
frequenza, non di una rampa termica.

⛔⛔ **E nessuno dei due strumenti che registro lo vede.**

| strumento | cosa dice per tutti i dieci minuti |
|---|---|
| `thermal` (PowerManager) | `moderate` **dal secondo 46**, e non cambia più |
| temperatura della batteria | **33,6-33,7 °C, piatta** |

Il primo satura subito e resta lì; il secondo non si muove di un decimo di grado
mentre la velocità cambia del 42%. ⛔ **La temperatura della batteria l'ho
aggiunta io oggi**, scrivendo che sarebbe stata «il segnale continuo che dice
QUANDO la deriva è cominciata». Non lo è: la batteria non è il SoC, e qui non
partecipa. Lo dico invece di lasciarlo scoprire a qualcun altro.

⇒ **Cosa vede la persona**: dopo circa un minuto e mezzo di uso continuo
l'assistente comincia ad alternare fra due velocità, e passa più della metà del
tempo a **due terzi** della velocità che ha visto all'inizio. Non c'è nessun
avviso, e la nostra diagnostica lo descriverebbe come «moderate» dall'inizio
alla fine.

#### ✅ La stessa corsa sulla CPU: NON è il governor, ed è il backend

Dieci minuti identici, stesso modello, stesso prompt, telefono freddo alla
partenza:

| | **CPU** | **OpenCL** |
|---|---:|---:|
| salti oltre il 15% | **0 su 67 giri** | **9 su 70 giri** |
| decodifica | 15,52 tok/s, [15,17 … 19,12] | oscilla, [13,45 … 19,48] |
| deriva primo terzo → ultimo | **−1,68%** | −16,72% |
| TTFT mediano | 736 ms | 268 ms |

⛔ **«Piatta» va detto con precisione**, perché la CPU non parte piatta: si
assesta, e poi non si muove più.

```
giro 1   14s  19,12        giro 15  139s  15,53
giro 2   22s  17,04        giro 30  274s  15,51
giro 3   31s  15,65        giro 45  409s  15,61
giro 4   40s  15,66        giro 60  543s  15,42
giro 5   49s  15,49        giro 66  597s  15,38
```

⇒ Tutto il calo — **−19%** — sta nei **primi trenta secondi**; i nove minuti e
mezzo successivi stanno dentro **15,17-15,66**. È una discesa a un gradino e poi
un piano, non un'oscillazione.

⇒ ⛔ **Non è il governor del SoC.** Alla stessa temperatura la CPU si assesta e
resta ferma, OpenCL salta avanti e indietro **nove volte** per tutti e dieci i
minuti. Qualunque cosa sia, sta nel percorso GPU — driver, clock della GPU, o la
gestione dei buffer.

⛔ **E più in là di così non arrivo da qui, per un motivo che vale scrivere.**
La cosa da guardare sarebbe la frequenza della GPU, e su Adreno vive in
`/sys/class/kgsl/kgsl-3d0/`. Provato:

```
ls /sys/class/kgsl/            → Permission denied     (anche da `adb shell`, non solo dall'app)
ls /sys/class/devfreq/         → Permission denied
dumpsys gpu                    → memoria per processo, nessuna frequenza
cat .../cpu7/cpufreq/scaling_cur_freq → 1017600        (la CPU invece si legge)
```

⇒ Il clock della GPU **non è osservabile senza root** su questo dispositivo,
mentre quello della CPU lo è. ⛔ Chi riprende non ci riprovi: la strada è
`simpleperf`, una traccia `perfetto` con la sorgente GPU, o un dispositivo con
root.

⛔⛔ **E c'è un secondo numero, più importante del primo.** Sulla media dei dieci
minuti:

```
OpenCL   16,13 tok/s      CPU   15,52 tok/s      ⇒  +3,9%
```

Il vantaggio della GPU sulla **decodifica** — 1,31× su una corsa breve e da
freddo — **sparisce sotto carico prolungato**. Resta il vantaggio sul TTFT
(268 ms contro 736), che è reale e grande. ⇒ Conferma dall'altro lato ciò che la
sezione sulla politica dice: il motivo per accendere la GPU è il **prefill**, non
la generazione, e una politica che decide sulla decodifica sceglierebbe su una
differenza del 4% che dopo dieci minuti non c'è più.

#### ✅ E non è nemmeno la Flash Attention — ma lo stato lento è quello FREDDO

Terza corsa da dieci minuti, OpenCL con `flash-attn off`, telefono freddo alla
partenza:

| | salti | livelli | % nello stato basso | deriva | media 10 min |
|---|---:|---|---:|---:|---:|
| **CPU** | **0** su 67 | — | — | −1,68% | 15,59 tok/s |
| OpenCL, FA **on** | 9 su 70 | 19,31 / 13,57 | 55,7% | −16,72% | 16,13 |
| OpenCL, FA **off** | **11** su 74 | 19,12 / 14,10 | 47,3% | −6,14% | **16,72** |

⇒ **Spegnere la Flash Attention non toglie l'oscillazione**: undici salti invece
di nove. La migliora — meno tempo in basso, livello basso più alto, deriva un
terzo — ma il fenomeno resta. ⛔ Ipotesi chiusa: **è il percorso OpenCL**, non la
FA e non il governor del SoC.

⛔⛔ **E il termometro dice il contrario di quello che uno si aspetta:**

```
SoC nello stato VELOCE   84,1 °C
SoC nello stato LENTO    65,6 °C
```

Lo stato lento è quello **freddo**. Non è «rallenta perché è caldo»: è un anello
di regolazione che **corre finché scalda e poi si ferma a raffreddare**, e la
temperatura misurata è la *conseguenza* della velocità, non la sua causa —
almeno alla granularità con cui la campiono.

⛔ Onestà sul metodo: campione ogni 5 secondi, e il valore è il **massimo fra
tutte le zone termiche**, che possono non essere la zona della GPU. Il segno
della correlazione è netto (19 gradi), la sua interpretazione no.

⛔ **Cosa NON ho ancora misurato**, e serve prima di concludere:

1. ~~La stessa corsa sulla CPU~~ — ✅ **fatta**, ed è la sezione qui sopra.
2. ~~La stessa corsa con `flash-attn off`~~ — ✅ **fatta**, ed è la sezione qui
   sopra: non è la FA.
3. ~~Il segnale giusto~~ — ✅ le zone termiche del SoC si campionano dall'host e
   l'analizzatore le legge con `--zone`.
   ⛔ **Ma la G5 su GPU in configurazione di produzione NON ha campioni**: è
   girata prima che la sonda esistesse. Gli **88 °C** misurati sono della corsa
   **CPU**; il lato OpenCL ha un numero solo dalla corsa con FA spenta. ⇒ Il
   confronto termico fra i due backend, come lo volevo, **non ce l'ho**: si
   rifà la G5 di produzione con `--zone` accanto. Nel frattempo il confronto che
   regge è quello sulla **forma** — 0 salti contro 9 — che non dipende dal
   termometro.

### ⛔⛔⛔ FASE 7 — LA GPU NON È SPEDITA, NON È SCELTA, NON È USATA

Ho aperto la Fase 7 per disegnare l'integrazione, e la prima cosa che ho trovato
non è un disegno: è che **non c'è niente da integrare, perché niente è
collegato**. Tre verifiche, tutte sul codice di oggi:

| domanda | risposta |
|---|---|
| L'APK di **rilascio** porta un backend GPU? | ⛔ **No.** Porta `libggml-base`, `libggml` e **sette varianti CPU**. Nessun `libggml-opencl`, nessun `libggml-vulkan`. |
| Quanti strati va sulla GPU la produzione? | ⛔ **Zero.** `TalosLlamaPlugin` legge `call.getInt("gpuLayers", 0)`, e **nessun chiamante** in `src/` passa quel campo. |
| Chi chiama `TalosBackendChoice.choose()`? | ⛔ **Nessuno.** L'unico chiamante in tutto il repo è il suo test. |

⇒ **Oggi il motore locale di TALOS gira solo su CPU.** La politica che questo
ramo ha discusso per pagine — quella che «decide quale motore ha il diritto di
girare», come dice il javadoc di `TalosLlamaEngine` — **non governa niente**. È
la stessa forma già in memoria: una funzione con i suoi test e nessun chiamante.

⛔ **E questo riordina le priorità di quanto ho trovato oggi.** Le due decisioni
di prodotto — Flash Attention e microbatch — non sono urgenti per chi usa l'app
adesso: sono il **prerequisito** della spedizione della GPU. Vanno prese prima
che il primo utente veda un backend GPU, non dopo.

La Fase 7, in ordine, e ogni passo è inutile senza il precedente:

1. **Spedire una libreria di backend GPU nella build di rilascio.** Oggi
   `-PtalosResearchBackend` è l'unica strada, ed è di proposito. ⛔ Vulkan non è
   candidabile (crasha) e per OpenCL c'è il vincolo dei modelli **densi**.
2. **Collegare la politica** — esiste, è provata, e va corretta nella grandezza
   che guarda (vedi sotto).
3. **Passare `gpuLayers`** dal risultato della decisione, invece del suo zero.

### ⛔ PP8192 — sessanta secondi prima della prima parola

Contesto 16384, così 8192 rientra nel tetto prudente di metà contesto:

| | prefill | TTFT | decodifica dopo |
|---|---:|---:|---:|
| PP512 | 304 tok/s | 1,68 s | 17,2 tok/s |
| PP2048 | 255 tok/s | 8,0 s | 8,1 tok/s |
| **PP8192** | **130-139 tok/s** | **59-64 s** | **3,2-3,4 tok/s** |

⇒ Il tasso di prefill **cade con la lunghezza** — 304 → 255 → 134 — e su 8.192
token la persona aspetta **un minuto** prima della prima parola, poi riceve
tre token al secondo. ⛔ Questo **sulla GPU**: è il numero buono.

#### ✅ E le due cause SONO state separate

La corsa qui sopra arrivava a 8.192 token dopo aver già macinato 512 e 2.048,
cioè col telefono a `moderate`. Rifatta con **quel bersaglio solo, da freddo**
(la manopola `talosPrefillTargets` esiste per questo):

| | prefill | TTFT |
|---|---:|---:|
| PP8192 dopo 512 e 2048 (telefono caldo) | 130-139 tok/s | 59-64 s |
| **PP8192 da solo e da freddo** | **155,6 tok/s** | **52,6 s** |

⇒ Lo strozzamento valeva **circa il 14%**; il resto è **lunghezza**. Il prefill
cala da solo al crescere del prompt — **314 → 260 → 156 tok/s** su 512, 2.048 e
8.192 token, tutti da freddo — ed è la forma attesa di un'attenzione quadratica,
non un difetto.

⛔ **E il numero che conta resta brutto**: su un prompt da 8.192 token la persona
aspetta **52,6 secondi** prima della prima parola **anche partendo da telefono
freddo**. Non era colpa del calore.

### ⭐⛔ IL CONFRONTO VERO — entrambi i lati al microbatch di PRODUZIONE

Tutte le tabelle precedenti confrontano un CPU a 256 con un OpenCL a 256, e
nessuno dei due è ciò che l'app manda. Rifatto con **512 da entrambe le parti**,
telefono freddo, mediane su cinque giri più uno di riscaldamento scartato:

| | CPU | OpenCL | rapporto |
|---|---:|---:|---:|
| prefill 512 | 48,63 tok/s | **314,27** | **6,46×** |
| prefill 2048 | 40,53 tok/s | **259,63** | **6,41×** |
| TTFT su 512 token | 10.508 ms | **1.628** | **6,45×** |
| **TTFT su 2048 token** | **50.536 ms** | **7.890** | **6,41×** |
| decodifica (prompt da 31 token) | 15,17 tok/s | 18,81 | **1,24×** |
| **decodifica dopo 2048 token** | **8,51 tok/s** | **8,07** | ⛔ **0,95×** |

⇒ Il prefill è **sei volte e mezzo**, costante fra 512 e 2.048 token, e la
persona che manda un prompt lungo aspetta **8 secondi invece di 50**.

⛔⛔ **E le ultime due righe demoliscono la politica meglio di qualunque
argomento.**

1. Sulla decodifica dopo un prompt lungo la GPU è **più lenta della CPU** —
   8,07 contro 8,51. Non «meno veloce del previsto»: **peggio**.
2. Sulla decodifica corta il rapporto è **1,24×**, e la soglia di
   `TalosBackendChoice` è **1,25×**.

⇒ Con il metro che la politica usa oggi, e nella configurazione che la
produzione manda davvero, **OpenCL verrebbe RIFIUTATO** — per un centesimo — su
un dispositivo dove taglia l'attesa da cinquanta secondi a otto. ⛔ Non è una
soglia da ritoccare: è la **grandezza sbagliata**, e adesso il rifiuto non è
un'ipotesi ma il risultato che quei numeri producono.

### 🔬⭐ RICERCA — il compromesso dello Stop NON è una legge: è una funzione mancante

Il 20/8 ho presentato all'owner una scelta fra «Stop pronto» e «prefill veloce»,
come se fosse un compromesso inevitabile. **Non lo è.** Sei fatti verificati, in
ordine di quanto cambiano la risposta.

#### 1. La callback di abort la implementano DUE backend su tutti

```
ggml/src/ggml-cpu/ggml-cpu.c          ✅ controllata dentro il ciclo dei thread
ggml/src/ggml-metal/ggml-metal-context.m  ✅ controllata fra i command buffer
ggml-opencl · ggml-vulkan · ggml-cuda     ❌ nessuna
```

⇒ La nota nell'header di llama.cpp — «works only with CPU execution» — descrive
lo stato di fatto, non un limite di principio.

#### 2. Metal dimostra che su GPU si PUÒ, e come

Metal non annulla il lavoro già in volo: **smette di consegnarne altro**. Spezza
il grafo in `n_cb` command buffer, aspetta il completamento di uno
(`waitUntilCompleted`), e **prima di consegnare il successivo** controlla la
callback: se lo Stop è stato chiesto, non lo consegna e torna
`GGML_STATUS_ABORTED`. Il costo a regime è **zero**: non cambia la quantità di
lavoro, solo il momento della consegna.

#### 3. L'impianto di llama.cpp è GIÀ generico — manca solo l'esportazione

`llama-context.cpp:1145` gira su **ogni** backend registrato e gli chiede il
simbolo `"ggml_backend_set_abort_callback"`; se il backend lo espone, la
callback gli viene consegnata. Ma:

| backend | espone il simbolo? |
|---|---|
| CPU | ✅ `ggml-cpu.cpp:663` |
| **Metal** | ❌ **ha la funzione e NON la esporta** ⇒ da llama.cpp non la riceve mai |
| **OpenCL** | ❌ `get_proc_address = NULL`: non espone **niente** |

⇒ Per OpenCL la cura è piccola e localizzata: due campi nel contesto, un setter,
l'esportazione del simbolo, e il controllo dentro il ciclo dei nodi di
`ggml_backend_opencl_graph_compute` (che è già un `for` su `cgraph->n_nodes`).
**Nessuna modifica a llama.cpp, nessuna a TALOS.**

#### 4. Il contratto per un decode abortito è documentato — e noi lo rispettiamo già

`include/llama.h`:

> `2 - aborted (processed ubatches will remain in the context's memory)`
> «To handle this correctly, query the memory state using
> `llama_memory_seq_pos_min()` and `llama_memory_seq_pos_max()`»

Non è corruzione: è uno stato previsto con un recupero documentato. ⭐ E il
nostro JNI **lo gestisce già** — riporta la KV esattamente a `session->cached` e,
se il taglio fallisce, azzera. Il commento che c'è lo dice meglio di me: «perdere
il prefisso costa secondi, tenerne uno falso costa la risposta».

#### 5. A monte è un buco NOTO e non colmato

`ggml-org/llama.cpp#10509` — *«Feature Request: Ability to cancel during prompt
processing (llama_decode)»* — chiede esattamente questo, propone una callback, ed
è stato **chiuso come stale** senza implementazione. ⛔ Cercate anche PR che
implementino l'abort per Vulkan o CUDA: **non risultano**. Il terreno è libero, e
la nostra non sarebbe una stranezza locale.

#### 6. ⛔ E la granularità vera l'ho MISURATA, perché i miei numeri non tornavano

Il motore registra dove si ferma. Prompt da 2.048 token, Stop premuto dopo
200 ms, Flash Attention spenta:

| microbatch | latenza | il motore dice |
|---:|---:|---|
| 512 | 1.443 ms | `prefill interrotto a 512/2048` |
| 256 | 1.446 ms | `prefill interrotto a 512/2048` |
| **128** | **290 ms** | `prefill interrotto a **0**/2048` |

⇒ Sopra la soglia l'abort **non morde dentro la chiamata**: il pezzo da 512
token finisce comunque, e solo dopo si esce. Sotto, morde a metà e **non tiene
niente**.

⛔ **E la soglia NON è a 128: è fra 256 e 192.** Cercata, non dedotta:

| microbatch | latenza | si ferma a |
|---:|---:|---|
| 256 | 1.446 ms | 512/2048 |
| **192** | **~460 ms** | **0**/2048 |
| 160 | ~370 ms | 0/2048 |
| 144 | ~324 ms | 0/2048 |
| 128 | ~290 ms | 0/2048 |

⇒ Sotto la soglia la latenza è **una lunghezza di microbatch**, e la curva è
lineare: 192 → 460, 160 → 370, 144 → 324, 128 → 290. **Cade tutto fra 256 e
192**, e quel salto vale un fattore tre.

⛔ **Perché la soglia stia lì non lo so — ma so cosa NON è.** Quattro
spiegazioni plausibili, tutte verificate e tutte cadute:

| ipotesi | come è caduta |
|---|---|
| la manopola viene ignorata | ⛔ no: il motore stampa `n_batch = 512`, `n_ubatch = 128` |
| viene arrotondata a una potenza | ⛔ no: `llama-context.cpp:247` fa solo `min(n_batch, n_ubatch)` |
| sotto soglia il lavoro ripiega sulla CPU | ⛔ no: le soglie di `use_adreno_kernels` **scelgono kernel**, non spostano lavoro |
| lo scheduler accoda più grafi insieme | ⛔ no: il pipelining vuole `pipeline_parallel`, e con un dispositivo solo non c'è |

⛔ **E un dettaglio che smentisce anche la spiegazione «ai confini di
microbatch»**: a 192 un microbatch dura ~543 ms, ma lo Stop arriva a **~460** —
cioè morde **dentro** un microbatch, non al suo confine. Qualunque sia la causa,
è più fine di così.

⇒ Lo strumento che la chiuderebbe c'è ed è di upstream: `GGML_OPENCL_OPFILTER`,
che permette di escludere singole operazioni dal backend e vedere quale cambia il
comportamento. Non l'ho usato: è un giro di indagine a sé, e la **legge
operativa è già misurata** — che è ciò che serve per decidere.

⭐ **E cambia la raccomandazione**, perché 192 è appena sotto il salto: dà lo
Stop pronto al prezzo più basso possibile, invece dei 64 che avevo proposto.

#### ⇒ Cosa cambia per la decisione

| | oggi | microbatch 64 | con la cura a monte |
|---|---|---|---|
| Stop nel prefill | fino a **5,9 s** | ~130 ms | **millisecondi** |
| prefill | pieno | **−28%** | **pieno** |
| chi tocca il codice | — | una riga in `engineTuning.ts` | ~30 righe in `ggml-opencl` |

⇒ Il microbatch è la cura **che possiamo fare oggi**, e costa il 28% del prefill.
La cura vera costa **zero** in prestazioni, ma vive in una dipendenza: o la
portiamo noi a monte, o la teniamo come patch locale sul nostro pin.

⛔ **Una cosa NOSTRA da correggere comunque**, e non dipende da nessuno: nel
ciclo di prefill del JNI **non controlliamo `cancelled` fra un pezzo e il
successivo** — lo fa solo il ciclo di generazione. Su un prompt da 8.192 token
sono **sedici** chiamate da 512, e oggi lo Stop può essere onorato solo dentro
una di esse. Un controllo fra i pezzi costa **zero** e limita l'attesa a un pezzo
solo.

### ⭐⭐ IL CANDIDATO — e non è più un compromesso

La ricerca ha spostato la raccomandazione da `off / 64` a **`off / 192`**, e il
prezzo cambia di natura. Misurato, telefono freddo, mediane su cinque giri:

| | **oggi** (`on / 512`) | **`off / 192`** | |
|---|---:|---:|---|
| prefill 512 | 314,3 tok/s | 298,1 | **−5,2%** |
| prefill 2048 | 259,6 tok/s | 257,6 | **−0,8%** |
| **decodifica dopo 2048 token** | 8,07 tok/s | **15,9** | **+97%** |
| decodifica (prompt corto) | 18,8 tok/s | 19,6 | **+4%** |
| **primo messaggio del processo** | 6.233 ms | **1.707** | **−4,5 s** |
| **Stop nel prefill** | **5.926 ms** | **~460** | **13×** |

⇒ ⭐ **Non è più «velocità contro reattività».** Il prezzo è il **5%** del
prefill su un prompt corto e **meno dell'1%** su uno lungo; in cambio la
decodifica sui prompt lunghi **raddoppia**, il primo messaggio arriva **4,5
secondi prima**, e lo Stop passa da sei secondi a mezzo.

⛔ Cosa NON risolve: G4 chiede p95 ≤ 286 ms e qui siamo a ~460. Il cancello lo
passa solo il 64 — ma adesso è chiaro che il cancello sta misurando una cosa che
la **cura vera** (l'abort dentro `ggml-opencl`) porterebbe a millisecondi senza
pagare niente. ⇒ Scegliere il 64 per far passare un cancello, sacrificando il
28% del prefill, sarebbe ottimizzare il numero invece della persona.

#### ✅ E la prova semantica, RIFATTA con la GPU davvero in uso

Corretto il difetto (`gpuLayers` era fisso a 0), la golden è stata rifatta sul
confronto che conta davvero — **la produzione di oggi contro il candidato
esatto** — con **tutti e 29 gli strati sulla GPU**:

```
strati su GPU: -1 · microbatch 0   · flash-attn on    ← com'è oggi
strati su GPU: -1 · microbatch 192 · flash-attn off   ← il candidato

S1 IDENTICO   S2 IDENTICO   S3 IDENTICO   S4 IDENTICO
S5 IDENTICO   S6 IDENTICO   S7 IDENTICO
⇒ tutti identici, CON la GPU davvero in uso
```

⇒ Il candidato **non cambia una parola**, e stavolta la prova riguarda i kernel
di OpenCL invece di quelli della CPU. ⛔ Resta stretta come prima — tre dei sette
casi contengono testo generato — ma adesso è la prova **giusta**.

#### ✅ E su una SECONDA ARCHITETTURA il candidato regge — anzi, guadagna

Tutte le misure fin qui sono su un modello solo, e su questo backend
l'architettura conta davvero (i MoE vengono rifiutati). ⇒ Rifatto il confronto su
**Gemma 3 4B**, che usa attenzione a finestra scorrevole — cioè il caso in cui la
Flash Attention si comporta in modo suo:

| | oggi (`on`/512) | candidato (`off`/192) | |
|---|---:|---:|---|
| prefill 512 | 256,8 tok/s | 255,9 | −0,4% |
| **prefill 2048** | 208,6 tok/s | **238,6** | ⭐ **+14,4%** |
| decodifica dopo 2048 | 10,8 tok/s | **12,7** | **+18%** |
| decodifica (prompt corto) | 14,4 tok/s | 14,3 | −0,7% |
| **primo messaggio del processo** | 6.862 ms | **2.006** | **−4,9 s** |

⇒ ⭐ **Su Gemma il candidato non costa niente: guadagna su ogni asse**, e sul
prefill lungo di **oltre il 14%**. Il −5% visto su Llama **non è una legge del
candidato**: è una proprietà di quel modello.

⛔ E una differenza da dire: il guadagno sulla decodifica è **+18% su Gemma**
contro **+97% su Llama**. Coerente con l'architettura — Gemma usa la finestra
scorrevole, quindi la Flash Attention pesa meno — ma è la conferma che la
grandezza del vantaggio **dipende dal modello**, mentre il segno no.

⇒ Su due architetture su due, e sull'asse che la persona sente davvero (il primo
messaggio), il candidato vince: **−4,5 s su Llama, −4,9 s su Gemma**.

### ⛔⛔ TROVATO PER STRADA — con GEMMA 3 l'assistente NON PUÒ chiamare attrezzi

Puntando la suite golden su `gemma-3-4b-it-Q4_K_M` per verificare l'equivalenza
semantica del candidato, il caso S3 è caduto:

> «l'attrezzo non è arrivato al template: il modello non sa che esiste»

⛔ **E non è un guasto nostro: lo dichiara il modello.**
`nativeTemplateCapabilities` risponde

```json
{"supportsTools":false,"supportsToolCalls":false,"supportsSystemRole":true}
```

⇒ Combacia con la documentazione a monte: il chat template di Gemma 3 **non
contiene affatto le strutture per gli attrezzi**. Per farlo chiamare qualcosa
bisognerebbe costruire il formato a mano nel prompt.

⭐ **Fatto di prodotto, e pesa più di qualunque numero di velocità:** se la
persona sceglie Gemma 3, **l'assistente diventa solo chat**. Non è il difetto già
noto «gli attrezzi ce l'hanno e non li chiamano»: qui non gli vengono nemmeno
**offerti**, e nessuna scheda lo dice.

⛔ E il dialetto rilevato è `SCONOSCIUTO`: la nostra rilevazione conosce CHATML e
LLAMA3, non Gemma.

**Corretto anche il test**, perché segnalava le due cose con la stessa riga
rossa: un modello che non dichiara `supportsTools` adesso si **salta e si
nomina**; se lo dichiara e l'attrezzo non arriva lo stesso, l'asserzione resta e
dice che **il guasto è nostro**.

### 📋 La politica a un numero solo — la proposta, non applicata

`TalosBackendChoice.choose()` decide con **un numero**: `tokensPerSecond`. Il
brief vietava di toccarla prima di avere PP/TG/TTFT separati. Adesso ci sono, e
il verdetto è che con quel metro **sbaglierebbe**.

| | CPU | OpenCL | rapporto |
|---|---:|---:|---:|
| prefill 512 | 43,8 tok/s | 303,4 | **6,9×** |
| prefill 2048 | 36,8 tok/s | 246,0 | **6,7×** |
| **decodifica** | 14,7 tok/s | 19,3 | **1,31×** |
| TTFT su 2048 token | **55,7 s** | **8,3 s** | |

⛔ La soglia è **1,25×** e il numero che la politica guarda è **1,31×**. Passa —
ma di sei centesimi, e su un altro esemplare dello stesso telefono
**rifiuterebbe** un backend che porta l'attesa da 55,7 a 8,3 secondi. Non è una
soglia mal tarata: è la **grandezza sbagliata**. La persona non aspetta la
decodifica, aspetta il **primo token**.

⇒ Tre cose da mettere nella politica, in ordine di quanto costa sbagliarle:

1. **Decidere sul TTFT di un prompt rappresentativo**, non sulla decodifica. È
   l'unico numero che corrisponde a ciò che la persona vive, e su questo
   dispositivo cambia il verdetto da «forse» a «ovviamente sì».
2. ⛔ **Escludere le architetture MoE su OpenCL.** Non è una preferenza: `MUL_MAT_ID`
   fallisce **305 volte** in `test-backend-ops` mentre tutto il percorso denso è
   pulito. ⇒ Il permesso si dà **per architettura**, non per dispositivo —
   modelli densi sì, MoE no.
3. **Registrare la CONFIGURAZIONE insieme all'esito.** Una `Evidence` raccolta
   con la Flash Attention accesa non descrive lo stesso backend di una raccolta
   con la Flash Attention spenta: fra le due la decodifica dopo un prompt lungo
   cambia del **96%**. Oggi `Evidence` porta backend, driver, esito e un numero;
   servono anche `flashAttn` e `microBatch`, altrimenti l'evidenza sopravvive a
   una decisione che l'ha invalidata.

⛔ **Non l'ho scritta**: `TalosBackendChoice` è codice di produzione. Questa è la
forma che proporrei, con i numeri che la giustificano.

## Divergenze dal brief, dichiarate

1. **`devices` è già nella baseline** (§1.3 lo dava per «newer upstream»). Non
   indebolisce nessun vincolo: rende la Fase 2 raggiungibile prima e **senza
   forward pin**, quindi senza esporsi alla deriva semantica che la Fase 1 deve
   ancora qualificare.
2. **Le caps sono quattro, non cinque.** Lo schema §6.1 elenca `mmapSupport`;
   `ggml_backend_dev_caps` di `d2f83055` non ce l'ha. Emetto le quattro vere e
   **non** invento la quinta: un `false` inventato in un artifact ha l'aria di
   una misura.
3. **I test strumentati stanno in `ai.talos`**, non in `ai.talos.research` come
   proponeva §18: `TalosLlamaNative` tiene i nativi riservati al package, e
   allargarne la visibilità per un test di ricerca si pagherebbe in superficie
   di produzione. La classe che **legge** l'inventario è in `ai.talos.research`
   ed è pubblica.
4. **`nativeOpenTargeted` accanto a `nativeOpen`**, non `nativeOpen` esteso come
   suggeriva §6.2. Due ingressi separati rendono la promessa «la produzione non
   cambia» **dimostrabile** invece che dichiarata: non esiste una strada per cui
   il codice di ricerca sia raggiungibile dall'app.
5. **S4 è incompleto, e lo dico invece di sottintenderlo.** Il brief chiede byte
   della grammatica, `grammar_lazy`, numero di inneschi e token preservati:
   **nessuna API li espone**. Misuro ciò che si può — conteggio attrezzi, byte
   del JSON, caratteri e token del prompt reso — e il resto richiede una
   diagnostica nativa dedicata, che è lavoro non ancora fatto.

---

## Aperti — cosa manca, in ordine

1. ⛔⛔ **La Flash Attention spenta sui bersagli OpenCL.** Non è più una domanda
   aperta, è una **proposta con la misura sotto**: su questo dispositivo `off`
   vince su ogni asse — da 4,7 a 6,6 secondi in meno sul primo messaggio, decodifica
   **doppia** dopo un prompt lungo, prefill leggermente migliore. E oggi la
   produzione gira **accesa**, perché il default di llama.cpp è `AUTO` e qui
   `AUTO` risolve in acceso. ⛔ Tocca `talos_apri_modello`: decisione
   dell'owner. Vedi OCL-4.
2. ⛔ **Il microbatch predefinito: 256 → 128.** Misurato, non applicato: −9% di
   prefill per uno Stop **5,6 volte** più pronto. Tocca `talos_apri_modello`,
   quindi è una decisione dell'owner. ⛔ La riga TG a 128 va **rifatta a freddo**
   (`Thermal Status` era salito a 2).
3. ⛔ **La cura dello Stop anticipato** — proposta, non applicata: tocca la
   produzione.
4. ⛔⛔ **Vulkan: capire il crash.** Blocca una corsia intera. ⛔ Il forward pin
   è stato fatto e **non l'ha chiusa**; `dc72703` è NOT RELEVANT su questo
   telefono (`matrix cores: none`), quindi la ragione per Vulkan resta la
   copertura dei dispositivi, non la prestazione. ⛔ Ultima variabile mai
   provata: `n_batch` — il batch **logico**, fisso a 512.
5. ~~Flash Attention off/auto/on su OpenCL~~ — ✅ **fatta** (OCL-4), con il
   verso contrario sull'ordine dei blocchi. ⛔ Quello che resta è **a monte**:
   i programmi della Flash Attention non passano dalla cache su disco perché
   sono costruiti con `build_program_from_source_ex`, che non la consulta e non
   la riempie. È un difetto di **upstream**, non nostro, e vale 5,8 secondi per
   processo a chiunque tenga la FA accesa su OpenCL.
6. ~~La tenuta nel tempo~~ — ✅ **fatta** (G5), e ha aperto tre domande nuove:
   la stessa corsa **sulla CPU** (se oscilla anche lì è il governor, non il
   backend), la stessa con `flash-attn off`, e il segnale giusto — le zone
   termiche del SoC, che da `adb` dicono **58 °C** mentre la batteria ne dice
   33. ⛔ Le prime due sono in coda sul Pad mentre scrivo.
7. ~~PP8192~~ — ✅ **fatta** a contesto 16.384: TTFT **59-64 s** e decodifica
   **3,2 tok/s**. ⛔ Lo stato termico era già `moderate`: lunghezza e
   strozzamento **non li ho separati**, e serve una corsa PP8192 sola e da
   freddo.
8. **`minSdk` contro Vulkan 1.1** — decisione di prodotto, vedi sopra.
9. **La politica a un numero solo** — i dati per rifarla ci sono. ⛔ Il brief
   dice di non toccarla prima di avere PP/TG/TTFT separati: adesso ci sono.
10. ⛔ **Fase 7, l'integrazione in produzione** — non cominciata.

## Aperti non miei, incontrati per strada

- ⛔ `./gradlew connectedDebugAndroidTest` (senza `:app:`) **non compila**:
  `:capacitor-cordova-android-plugins:checkDebugAndroidTestDuplicateClasses`
  fallisce con classi duplicate fra `kotlin-stdlib:1.8.22` e
  `kotlin-stdlib-jdk7:1.6.21`. È un modulo generato da Capacitor, non `:app`, e
  **precede** questo ramo. Aggirato con `:app:connectedDebugAndroidTest` e poi
  reso irrilevante dal runner; non l'ho toccato perché sta fuori dal perimetro.

---

## I cancelli, con l'esito

| cancello | esito |
|---|---|
| `npm run typecheck` | verde |
| `npx vitest run` | **5.858** passati, 10 saltati, 643 file — identico alla baseline, **rilanciato dopo ogni tocco al Java** |
| `:app:testDebugUnitTest` | **290** test, 0 falliti (10 nuovi) |
| `:app:lintDebug` | verde |
| `npm run build` | verde, tetto del chunk d'avvio rispettato |
| `npx cap copy android` | eseguito prima dell'APK installato sul Pad |
| dispositivo — targeting | **8** test verdi, 26,4 s |
| dispositivo — inventario | **2** test verdi |
| dispositivo — C0 carico/Stop | **3** test verdi, misure in `runs.jsonl` |
| dispositivo — G4, sei configurazioni | tutte verdi · ⛔ il cancello lo passa **una sola** |
| dispositivo — OCL-4, `off`/`auto`/`on` ×2 ordini | tutte verdi, e il controllo regge |
| dispositivo — golden `on` contro `off` | **7 su 7 identici** |
| dispositivo — G5, dieci minuti ×2 | **GPU e CPU**, 70 e 67 giri, ed è il confronto che risponde |
| dispositivo — PP8192 | eseguito a contesto 16.384 |
| quattro viewport | **non fatte** — questo ramo non tocca nessuna superficie visiva |

⛔ Le quattro viewport non si applicano a questo blocco: non c'è UI. Torneranno
obbligatorie appena si tocca una scheda.

---

## Dove stanno gli artifact

```
mobile/.tmp-research/local-backend/
    backend-inventory.json     l'inventario, come lo vede il motore
    manifest.json              identità di chi ha misurato (engineBuild, driver, build di Android)
    runs.jsonl                 una riga per giro — ⛔ mai solo mediane
    golden.jsonl               le righe della suite semantica
mobile/.tmp-research/backup/   i due .talosbak esaminati

le campagne G4 del 20/8, una per file, gia' separate:
    runs-C1-stop-SENZA-cache.jsonl   ub 256, attesa 1500 ms (le due corse originali)
    runs-stop-cacheCALDA.jsonl       ub 256, attesa 1500 ms, cache 181 .clbin
    runs-stop-ocl-attesa200.jsonl    ub 256, attesa  200 ms  ← la prova che lo Stop non morde
    runs-stop-cpu-attesa200.jsonl    CPU,    attesa  200 ms  ← il verso contrario
    runs-stop-ocl-ub128.jsonl        ub 128, attesa  200 ms
    runs-stop-ocl-ub64.jsonl         ub  64, attesa  200 ms
    runs-pp-ocl-ub128.jsonl          PP/TG a ub 128  ⛔ coda con Thermal Status 2
    runs-pp-ocl-ub64.jsonl           PP/TG a ub  64

le campagne OCL-4 (Flash Attention), ogni riga porta il proprio `flashAttn`:
    runs-pp-ocl-fa-off.jsonl         ordine diretto: off, poi auto, poi on
    runs-pp-ocl-fa-auto.jsonl
    runs-pp-ocl-fa-on.jsonl
    runs-inv-fa-on.jsonl             ordine INVERTITO: on per primo e da freddo
    runs-inv-fa-off.jsonl            ⛔ il controllo — off qui e' il blocco svantaggiato
    primo-inferire-logcat.txt        il logcat con le sette righe di compilazione FA

G4 chiuso e G5:
    runs-g4-faoff-ub256.jsonl        Stop con FA spenta, microbatch 256
    runs-g4-faoff-ub128.jsonl        idem, 128 — manca il cancello per 14 ms
    runs-g4-faoff-ub64.jsonl         idem,  64 — l'unica che lo passa
    runs-pp-faoff-ub128.jsonl        il PREZZO di quelle due configurazioni
    runs-pp-faoff-ub64.jsonl
    runs-g5-produzione.jsonl         10 minuti, configurazione di produzione
    runs-pp8192.jsonl                PP8192, contesto 16384
    g5-*-zone.txt                    le zone termiche del SoC, campionate dall'host

al microbatch 512, cioe' quello di PRODUZIONE:
    runs-stop-ocl-ub512.jsonl        Stop — il pavimento vero di G4, p95 5.926 ms
    runs-cpu-ub512.jsonl             pavimento CPU
    runs-pp-ocl-ub512.jsonl          PP/TG OpenCL — insieme fanno il confronto vero
    runs-g5-cpu.jsonl                G5 su CPU, 0 salti su 67
    runs-g5-ocl-faoff.jsonl          G5 con FA spenta, 11 salti su 74
```

⛔ Sono **fuori dall'indice di git** di proposito: descrivono il dispositivo
dell'owner, e la regola del repo è che quel materiale non entra.

---

## Cosa serve dall'owner

1. Una **code review** di questo ramo, e poi il `git push`, che non faccio io.
2. La **decisione sulla cura dello Stop anticipato**.
3. ⛔ **Il microbatch predefinito: 256 o 128?** Misurato il 20/8 sul Pad:
   128 costa **9% di prefill** (307 → 280 tok/s su 512 token) e rende lo Stop
   **5,6 volte** più pronto (~1.458 → ~258 ms). La decodifica non cambia. È una
   riga sola in `talos_apri_modello`, ma cambia la velocità per tutti: la
   propongo, non la applico.
4. ⛔ **Le chiavi dei provider.** Il backup non è ripristinabile — la password
   non è recuperabile — quindi l'app è ripartita **da zero**, come da tua
   indicazione. Per la 0.1.17 non servono: la ricerca sul motore locale gira
   tutta su GGUF, e i tre modelli sono sul Pad. Servono per la **parity coi
   modelli a chiave**. L'accesso OpenRouter è **PKCE col browser di sistema**:
   le credenziali le digiti tu, non passano da me. Posso aprire l'app sulla
   schermata giusta quando vuoi.

## Lo stato in cui lascio il Pad

- App **installata da zero** (nessun ripristino), build **senza acceleratori** —
  verificato: zero librerie OpenCL/Vulkan nell'APK.
- **Tre modelli**, tutti con impronta verificata fra computer e telefono:

| modello | byte | SHA-256 (inizio) |
|---|---:|---|
| `Llama-3.2-3B-Instruct-Q4_K_M` | 2.019.377.696 | `6c1a2b4116103267` |
| `Qwen3-1.7B-Q4_K_M` | 1.282.439.264 | `d2387ca2dbfee2ff` |
| `gemma-3-4b-it-Q4_K_M` | 2.489.757.856 | `882e8d2db44dc554` |

Tutti da `ggml-org`, cioè l'organizzazione di llama.cpp stessa. ⛔ Il quarto
posto che avevi concesso è **libero**: Qwen3 e Gemma aprono due dialetti che
Llama non ha (ChatML con ragionamento, e Gemma), quindi la suite golden ha
adesso di che lavorare — S2 su Llama era «non applicabile».

- Toolchain scaricata in `C:\Users\Antonino\toolchains\` (~300 MB): gcc/g++,
  SPIRV-Headers, Vulkan-Headers. Serve solo per ricostruire Vulkan; si può
  cancellare senza toccare il repo.
