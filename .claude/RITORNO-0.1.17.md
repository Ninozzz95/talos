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

1. 🔑 **Il ripristino del backup** — richiede la password dell'owner. Unica cosa
   che aspetta lui.
2. ⛔ **La cura dello Stop anticipato** — proposta sopra, non applicata perché
   tocca la produzione.
3. **Fase 1: il forward pin** — non cominciata. La suite golden è lo strumento
   con cui si qualificherà.
4. **S4 completo** — serve una diagnostica nativa della grammatica.
5. **PP8192** — non misurato: con contesto 8192 il tetto prudente è metà, quindi
   restano 512 e 2048. Serve una corsa con contesto più largo.
6. **Fasi 3-6 (OpenCL, Vulkan)** — non cominciate. Servono le build con
   `GGML_OPENCL=ON` / `GGML_VULKAN=ON` e la toolchain relativa.
7. **I modelli sul Pad**: uno su quattro autorizzati. Gemma e Qwen3 vanno
   riscaricati se si vogliono riprodurre le misure precedenti.

---

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
| `npx vitest run` | **5.858** passati, 10 saltati, 643 file — identico alla baseline |
| `:app:testDebugUnitTest` | **290** test, 0 falliti (10 nuovi) |
| `:app:lintDebug` | verde |
| `npm run build` | verde, tetto del chunk d'avvio rispettato |
| `npx cap copy android` | eseguito prima dell'APK installato sul Pad |
| dispositivo — targeting | **8** test verdi, 26,4 s |
| dispositivo — inventario | **2** test verdi |
| dispositivo — C0 carico/Stop | **3** test verdi, misure in `runs.jsonl` |
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
```

⛔ Sono **fuori dall'indice di git** di proposito: descrivono il dispositivo
dell'owner, e la regola del repo è che quel materiale non entra.

---

## Cosa serve dall'owner per il push

1. Una code review di questo ramo.
2. La decisione sulla cura dello Stop anticipato (§ difetto di produzione).
3. Il `git push`, che non faccio io.
