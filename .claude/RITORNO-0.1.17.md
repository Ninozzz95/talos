# RITORNO — 0.1.17 (motore su GPU)

> Documento di ritorno verso la sessione principale e l'owner, come chiede
> `.claude/CONSEGNA-0.1.17-0.1.18.md` §11. **Aperto il 2026-08-20**, in corso.
> Ramo `lane/motore-gpu`, da `lane/talos-mobile` a `7707ed93`.

---

## ⛔⛔⛔ FERMATA APERTA — il Pad è stato ripulito da un task di test

**Cosa è successo, con le misure.**

Per eseguire il primo test strumentato ho lanciato il task standard:

```
./gradlew connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=…
```

È andato verde: «Starting 2 tests on OPD2415 - 16», «Finished 2 tests»,
`BUILD SUCCESSFUL`. I due test hanno misurato davvero, e il logcat conserva il
risultato. Subito dopo, sul Pad:

```
pm path ai.talos                                  → (vuoto)
cmd package list packages --user 0 -a | grep talos → (nessuno)
cmd package list packages -u | grep talos          → (nessun dato residuo)
ls /data/data/ai.talos                             → No such file or directory
ls /storage/emulated/0/Android/data/ai.talos       → No such file or directory
find /storage/emulated/0 -iname '*.gguf'           → nessun risultato
```

**Non è un guasto: è il comportamento documentato del plugin Android di
Gradle.** `connectedAndroidTest` installa l'APK dell'app e quello dei test,
esegue, e alla fine **disinstalla entrambi**. Con l'app se ne va la sua cartella
privata.

⛔ Non l'avevo previsto e non l'ho chiesto prima. La consegna §7 autorizzava
`adb install -r`, che **sostituisce** tenendo i dati; il task di Gradle è una
strada diversa, e l'ho presa io.

### Cosa è andato

- L'installazione di **`ai.talos`** e tutti i suoi dati: chat, impostazioni,
  chiavi dei provider, cache di tuning e prefissi congelati.
- **Tutti i GGUF che stavano nella cartella privata dell'app.** Il taccuino ne
  registrava due sul Pad — Gemma `2.489.758.112` B e Qwen3 `1.673.007.232` B —
  più il residuo `talos-fixture.gguf` (`2.019.377.696` B). Oggi `find` su tutto
  `/storage/emulated/0` non trova **nessun** file `.gguf`.

### Cosa è rimasto, e da dove si ripara

| cosa | dove | misura |
|---|---|---|
| APK per reinstallare | `/storage/emulated/0/Download/Apk/TALOS.apk` | 46.717.586 B, 2026-08-12 |
| (l'altro) | `/storage/emulated/0/Download/Apk/TALOS (1).apk` | 46.223.650 B, 2026-08-12 |
| backup dati | `Download/TALOS-backup-2026-08-07T111343.talosbak` | 15.047.413 B |
| backup dati | `Download/TALOS-backup-2026-08-07T121906.talosbak` | 15.064.189 B |
| backup dati | `Download/TALOS-backup-2026-08-10T010729.talosbak` | 17.296 B |
| backup dati | `Download/TALOS-backup-2026-08-10T011744.talosbak` | 18.892 B |
| un modello, sul computer | `mobile/.modelli/Llama-3.2-3B-Instruct-Q4_K_M.gguf` | 1,88 GB |

⛔ `Download/TALOS-modelli-locali-cf7dd2d.zip` **non contiene modelli** malgrado
il nome: dentro c'è un solo `app-debug.apk` (31.102.688 B).

⇒ **Gemma e Qwen3 non sono sul computer.** Rimetterli sul Pad vuol dire
riscaricarli, e questo costa banda e tempo a una persona: non lo decido io.

### Cosa ho già fatto perché non si ripeta

`mobile/scripts/research/run-device-tests.mjs` (commit `22152f41`) fa i due
passi che Gradle nasconde e **non** il terzo: `adb install -r` (sostituisce
tenendo i dati), `am instrument`, porta via gli artifact, e non disinstalla mai.
Se la firma non combacia lo dice e si ferma, invece di «risolvere»
disinstallando. L'avvertimento sta anche nel javadoc del test, dove lo legge chi
sta per lanciarlo.

### Cosa serve da te

1. **Reinstallo io** `Download/Apk/TALOS.apk` sul Pad, o preferisci farlo tu?
   (È del 12/8: più vecchio della 0.1.16.)
2. **Ripristino un `.talosbak`?** Se sì, quale dei quattro.
3. **I modelli**: ti va che spinga sul Pad il Llama 3.2 3B che è già sul
   computer (1,88 GB, via `adb push`), o Gemma e Qwen3 li rivuoi come prima e
   quindi vanno riscaricati?

Fino a una tua risposta **non tocco più il dispositivo**.

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

## Divergenze dal brief, dichiarate

1. **`devices` è già nella baseline** (§1.3 lo dava per «newer upstream»). Non
   indebolisce nessun vincolo: rende la Fase 2 raggiungibile prima e senza
   forward pin.
2. **Le caps sono quattro, non cinque.** Lo schema §6.1 elenca `mmapSupport`;
   `ggml_backend_dev_caps` di `d2f83055` non ce l'ha. Emetto le quattro vere e
   **non** invento la quinta: un `false` inventato in un artifact ha l'aria di
   una misura.
3. **Il test strumentato sta in `ai.talos`**, non in `ai.talos.research` come
   proponeva §18: `TalosLlamaNative` tiene i nativi riservati al package, e
   allargarne la visibilità per un test di ricerca si pagherebbe in superficie
   di produzione. La classe che **legge** l'inventario è in `ai.talos.research`
   ed è pubblica.

---

## Aperti non miei, incontrati per strada

- ⛔ `./gradlew connectedDebugAndroidTest` (senza `:app:`) **non compila**:
  `:capacitor-cordova-android-plugins:checkDebugAndroidTestDuplicateClasses`
  fallisce con classi duplicate fra `kotlin-stdlib:1.8.22` e
  `kotlin-stdlib-jdk7:1.6.21`. È un modulo generato da Capacitor, non `:app`, e
  **precede** questo ramo. Aggirato usando `:app:connectedDebugAndroidTest`;
  non l'ho toccato perché sta fuori dal perimetro.

---

## I cancelli, con l'esito

| cancello | esito |
|---|---|
| `npm run typecheck` | verde |
| `npx vitest run` | **5.858** passati, 10 saltati, 643 file — identico alla baseline |
| `:app:testDebugUnitTest` | **290** test, 0 falliti, 1 saltato (10 nuovi) |
| `:app:lintDebug` | verde |
| `:app:assembleDebug` | verde |
| dispositivo | 2 test strumentati verdi su OPD2415 — ⛔ **e la corsa ha ripulito il Pad**, vedi sopra |
| quattro viewport | **non fatte** — non c'è UI in questo blocco, e ora non c'è app sul Pad |

## I commit di questo ramo

```
22152f41  tools(research): connectedAndroidTest went green and left the phone empty
560d1d02  feat(research): the backend list said "CPU,OpenCL" and answered nothing
```

⛔ Nessun push, come da consegna §2.1.
