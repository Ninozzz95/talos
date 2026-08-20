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

**Prefill, primo token e decodifica** — 1 giro di riscaldamento scartato + 5
misurati, mediana e MAD. ⛔ Ogni riga porta `reusedTokens: 0`.

| configurazione | prompt tok/s | decode tok/s | TTFT | muro |
|---|---:|---:|---:|---:|
| **PP512** | 52,94 | 16,88 | 9.652 ms | 10.126 ms |
| **PP2048** | 36,35 | 7,71 | 56.338 ms | 57.387 ms |
| **TG256** | 39,09 | 15,59 | **793 ms** | 17.218 ms |

⇒ Due cose che un numero solo avrebbe nascosto, ed è esattamente la Q3 del brief:

1. **Il prefill non scala.** Da 512 a 2048 token il tasso cade da 52,9 a 36,4
   tok/s — **−31%**. Quadruplicare il prompt costa 5,6 volte il tempo, non 4.
2. **TTFT e decodifica sono grandezze diverse.** Con un prompt corto il primo
   token arriva in 793 ms; con 2048 token di prompt ci mette **56 secondi**. Un
   backend scelto sul solo `tokensPerSecond` di decodifica potrebbe vincere la
   misura e far aspettare la persona un minuto.

⛔ **PP8192 non misurato**: con contesto 8192 il tetto prudente è metà. Serve
una corsa con contesto più largo.

⛔ **Dispersione oltre il 10% su 4 configurazioni**, e la forma dice cosa
succede: la MAD è minuscola (0,11-0,44) mentre il range è largo. È **un solo
giro fuori riga**, e guardando i minimi è il **primo misurato** a essere il più
veloce — 8.637 ms contro 10.126 di mediana su PP512. Il telefono è più rapido da
freddo e rallenta appena si scalda, pur restando `thermal: none`. ⇒ Corsa a 9
giri lanciata, come prescrive §9.4.

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

⛔ **Cosa S4 non copre**, e lo dico invece di sottintenderlo: byte della
grammatica, `grammar_lazy`, numero di inneschi e token preservati **non sono
esposti da nessuna API**. Il taccuino porta già il numero che fa male — 46
attrezzi → 55.871 byte di GBNF, rifiutati dal parser — ma quel dato oggi si
ottiene solo dai log, non da una misura ripetibile. Serve una diagnostica
nativa dedicata.

---

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
