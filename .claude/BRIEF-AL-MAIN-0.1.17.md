# BRIEF alla sessione principale — 0.1.17, stato al 2026-08-20

> Una pagina. Il dettaglio con tutte le misure sta in
> [`.claude/RITORNO-0.1.17.md`](RITORNO-0.1.17.md); questo serve a decidere, non
> a rileggere.

---

## In una riga

Ramo **`lane/motore-gpu`**, **29 commit**, albero pulito, **nessun push, nessun
tag** (il push fatto è **tuo**, non mio). Nessuna release. La **0.1.18 non è
stata toccata**: la consegna impone che le due siano sequenziali, e il Pad è uno
solo.

---

## Cosa è chiuso, e cosa no

Il brief dell'owner è un programma a otto fasi.

| fase | esito |
|---|---|
| **0** — riprodurre C0 | ✅ pavimento CPU, suite golden, Stop, inventario, pipeline degli artifact |
| **1** — forward pin | ✅ **`dc72703`, 163 commit, zero rotture di API, golden IDENTICA** |
| **2** — targeting esplicito | ✅ chiusa, con offload provato sul dispositivo |
| **3-4** — OpenCL | ✅ **C1 misurato**: PP/TG/TTFT, Stop (G4), Flash Attention off/auto/on, matrice del microbatch |
| **5-6** — Vulkan | ⛔ **FAILED** su G2 · guasto NOTO a upstream (#8743, #12139) ma la loro soglia del batch **non regge** sull'830 |
| **7** — integrazione | ❌ non cominciata |

⇒ La Definition of Done del brief **non è ancora raggiunta** — manca la Fase 7 —
ma la corsia OpenCL adesso è **misurata fino in fondo**, cancelli compresi, e
quello che resta sono **due decisioni di prodotto** che non prendo io.

---

## I numeri che contano

**1. Il forward pin vale il lavoro.** OpenCL contro il pavimento CPU, stesso
modello, stesso telefono, prefisso freddo:

| | CPU | OpenCL | |
|---|---:|---:|---:|
| prefill 512 | 43,8 tok/s | **303,4** | **6,9×** |
| prefill 2048 | 36,8 tok/s | **246,0** | **6,7×** |
| decodifica | 14,7 tok/s | 19,3 | 1,31× |
| **TTFT su 2048 token** | **55,7 s** | **8,3 s** | |

**2. La politica attuale sbaglierebbe.** `TalosBackendChoice` decide con **un
numero solo**, la velocità di *generazione*. Con quel metro questa GPU vale
1,10-1,31× e la soglia è **1,25×**: su un prompt lungo **rifiuterebbe** un
backend che taglia l'attesa da 55,7 a 8,3 secondi. Il guadagno è tutto nel
prefill, che è quello che la persona aspetta. ⛔ Il brief vieta di toccare la
politica prima di avere PP/TG/TTFT separati: **adesso ci sono**.

**3. Due manopole che nessuno aveva mai provato valgono più del backend.**
Stessa GPU, stesso pin, solo `flash-attn` e `microbatch` diversi:

| | oggi (`on / 256`) | `off / 64` | |
|---|---:|---:|---|
| prefill 512 | 307 tok/s | 227 | −26% |
| decodifica dopo 2.048 token | 8,1 tok/s | **15,9** | **+96%** |
| primo messaggio del processo | ~7.000 ms | **2.253** | **−4,7 s** |
| Stop durante il prefill (p95) | 4.095 ms | **128** | **32×** |
| cancello G4 | ⛔ FAILED | ✅ **PASSED** | |

Le sette voci della suite golden restano **identiche** fra `on` e `off`. ⛔ E il
prefill che si perde non è tutto perduto: la persona aspetta il **TTFT**, che su
512 token peggiora di 593 ms una volta sola — ma su 2.048 peggiora di **2
secondi**, e lì diventa un compromesso vero. Il dettaglio è nel ritorno.

**4. Vulkan è ferma su un crash, non su una lentezza.** Costruisce, si registra,
sposta 29/29 strati — e muore al primo grafo di calcolo, **2 volte su 2**, anche
con contesto 512. Il crash è dentro `vkGetDeviceFaultInfoEXT` **del driver
Adreno**, cioè nella funzione che doveva spiegare il guasto. Un crash è FAILED,
non una misura scarsa: **non esistono numeri Vulkan**.

---

## Cosa aspetta una decisione dell'owner

1. **Code review del ramo, poi il push.** Non lo faccio io.
2. ⛔⛔ **La Flash Attention, spenta o accesa?** Oggi è **accesa** senza che
   nessuno l'abbia scelto: il default di llama.cpp è `AUTO`, e su questo telefono
   `AUTO` risolve in acceso. Spenta, su ogni asse misurato, va **meglio** —
   6,5 secondi in meno sul primo messaggio, decodifica **doppia** dopo un prompt
   lungo, e le sette voci della suite golden **identiche**. Una riga in
   `talos_apri_modello`. ⛔ Vale per *questo* backend su *questa* GPU: upstream
   ha «migliorare la Flash Attention» fra i propri TODO.
3. ⛔ **Il microbatch: 256 com'è, o più piccolo?** È la manopola che decide
   quanto ci mette lo Stop a mordere, perché l'attesa massima è **un
   microbatch**. Con FA spenta: 256 → Stop 1.430 ms · 128 → 275 ms · 64 →
   102 ms, e il prefill scende in proporzione. ⛔ Il cancello G4 lo passa **solo
   il 64**; il 128 lo manca per **14 millisecondi**.
4. ⛔ **Lo Stop anticipato.** Difetto di **produzione** trovato per strada: uno
   Stop premuto nella finestra fra «la persona preme» e «la generazione entra»
   viene **inghiottito** — misurato, 64 token su 64 chiesti, `stopHonoured=false`.
   `nativeGenerate` azzera `cancelled` all'ingresso, e la ragione è buona; la
   conseguenza no. Cura proposta nel ritorno, **non applicata**: tocca la
   produzione.
5. ⛔ **`minSdk` contro Vulkan 1.1.** Il link richiede
   `vkGetPhysicalDeviceFeatures2`, che l'NDK espone **dall'API 28** (verificato
   livello per livello). Il nostro `minSdk` è **26**. Una promozione Vulkan
   romperebbe Android 8 e 8.1: o si alza `minSdk`, o si caricano i simboli
   dinamicamente. Decisione di prodotto.
6. **Le chiavi dei provider.** L'app è ripartita da zero (backup non
   ripristinabile). Per la 0.1.17 non servono; servono per la parity coi modelli
   a chiave. OpenRouter è **PKCE col browser di sistema** ⇒ le credenziali le
   digita l'owner.

---

## Da dove riparte chi prende in mano la 0.1.17

In quest'ordine, e la ragione è che ogni passo sblocca il successivo:

1. ~~Fase 1, il forward pin~~ — ✅ **fatta**: `dc72703`, zero rotture di API,
   golden identica.
2. ~~OpenCL come C1 vero~~ — ✅ **fatta**, e rifatta **da freddo** dopo che le
   prime misure erano state scartate per deriva termica.
3. ~~Flash Attention off/auto/on~~ — ✅ **fatta**, con il verso contrario
   sull'ordine dei blocchi e la conferma semantica sulla suite golden.
4. **Le due decisioni di prodotto** (FA e microbatch) — sono le prime, perché
   ogni misura successiva va presa nella configurazione che si è scelta. Finché
   restano aperte, ogni numero nuovo nasce già da rifare.
5. **La tenuta nel tempo.** Nessun test da 10 minuti. ⛔ E adesso sappiamo che
   serve: il 20/8 il telefono ha toccato `Thermal Status: 2` **dentro una
   singola campagna da tre blocchi**, e la deriva si vede nei numeri.
6. **PP8192** — serve una corsa con contesto più largo.
7. **La politica a un numero solo** — i dati per rifarla ci sono, e adesso ci
   sono anche le due manopole da scriverci dentro.
8. **La Fase 7, l'integrazione** — non cominciata, ed è ciò che manca alla DoD.

⛔ **Non ripartire da questi due numeri del taccuino**, che oggi sono datati: la
GBNF da 55.871 byte e la «grammatica pigra con un innesco solo». A questo pin il
formato è `peg-native` e il vincolo lo fa un **parser PEG**: GBNF vuota è la
risposta giusta, inneschi zero. Vanno rimisurati, non ereditati.

---

## ⛔ Le trappole che costerebbero tempo anche a te

Sono tutte della stessa famiglia — **una cosa che fallisce senza dirlo** — e
tutte in memoria.

1. **`./gradlew connectedAndroidTest` DISINSTALLA l'app a fine corsa.** Verde in
   faccia, e sul telefono non resta né l'app, né i suoi dati, né i GGUF, né
   l'artifact che il test ha appena scritto. Si usa
   `scripts/research/run-device-tests.mjs`, che installa sostituendo, esegue,
   porta via gli artifact e **non disinstalla mai**.
2. **Una cartella creata da `adb` è invisibile all'app.** `mkdir` o `push`, la
   crea `shell` con modo 0770; l'app è un altro UID e non la attraversa. Il file
   c'è, l'impronta è giusta, e `File.isFile()` risponde falso. La cartella la
   crea **l'app**, poi ci si spinge dentro.
3. **Nelle build Release ggml TACE sui backend che non si caricano.**
   `ggml_backend_load_all_from_path` usa `silent = true` sotto `NDEBUG`. C'è una
   sonda apposta, `nativeProbeBackendLoad`.
4. **Scrivere un file da Python su Windows lo converte tutto in CRLF**, e un
   test che legge il sorgente nativo diventa rosso. `newline='\n'`, sempre.
5. **Un test SALTATO non è un test verde.** JUnit conta un `Assume` fallito come
   OK: otto test «verdi» in 0,037 secondi erano otto salti. Il runner ora li
   conta e li nomina.
6. **Un `assembleDebug` nudo sovrascrive lo stesso `app-debug.apk`** della build
   di ricerca. Una corsa etichettata «OpenCL» può girare su una build che OpenCL
   non ce l'ha.

---

## Dove stanno le cose

```
lane/motore-gpu                          29 commit, spinto su origin (privato) — il push e' TUO
.claude/RITORNO-0.1.17.md                il dettaglio, con tutte le misure
mobile/scripts/research/README.md        come si riproduce, dall'inizio
mobile/.tmp-research/                    artifact grezzi (fuori da git di proposito)
C:\Users\Antonino\toolchains\            gcc, SPIRV-Headers, Vulkan-Headers (~300 MB)
```

**Sul Pad**: app installata da zero, build **senza acceleratori**, e tre modelli
`ggml-org` con impronta verificata — Llama 3.2 3B, Qwen3 1.7B, Gemma 3 4B. Il
quarto posto concesso dall'owner è libero.
