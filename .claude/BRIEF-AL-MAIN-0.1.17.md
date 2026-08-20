# BRIEF alla sessione principale — 0.1.17, stato al 2026-08-20

> Una pagina. Il dettaglio con tutte le misure sta in
> [`.claude/RITORNO-0.1.17.md`](RITORNO-0.1.17.md); questo serve a decidere, non
> a rileggere.

---

## In una riga

Ramo **`lane/motore-gpu`**, 21 commit, albero pulito, **nessun push, nessun
tag**. Nessuna release. La **0.1.18 non è stata toccata**: la consegna impone
che le due siano sequenziali, e il Pad è uno solo.

---

## Cosa è chiuso, e cosa no

Il brief dell'owner è un programma a otto fasi.

| fase | esito |
|---|---|
| **0** — riprodurre C0 | ✅ pavimento CPU, suite golden, Stop, inventario, pipeline degli artifact |
| **1** — forward pin | ✅ **`dc72703`, 163 commit, zero rotture di API, golden IDENTICA** |
| **2** — targeting esplicito | ✅ chiusa, con offload provato sul dispositivo |
| **3-4** — OpenCL | 🔄 ora è **C1 vero** (il pin contiene `60addddf`): costruito, offload provato, misure in corso |
| **5-6** — Vulkan | ⛔ **FAILED** su G2 · guasto NOTO a upstream (#8743, #12139) ma la loro soglia del batch **non regge** sull'830 |
| **7** — integrazione | ❌ non cominciata |

⇒ La Definition of Done del brief **non è ancora raggiunta**, ma il collo di
bottiglia è caduto: il forward pin è **semanticamente sicuro**, e con lui C1 —
OpenCL con la correzione della race — è diventato raggiungibile.

---

## I tre numeri che contano

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

**3. Vulkan è ferma su un crash, non su una lentezza.** Costruisce, si registra,
sposta 29/29 strati — e muore al primo grafo di calcolo, **2 volte su 2**, anche
con contesto 512. Il crash è dentro `vkGetDeviceFaultInfoEXT` **del driver
Adreno**, cioè nella funzione che doveva spiegare il guasto. Un crash è FAILED,
non una misura scarsa: **non esistono numeri Vulkan**.

---

## Cosa aspetta una decisione dell'owner

1. **Code review del ramo, poi il push.** Non lo faccio io.
2. ⛔ **Lo Stop anticipato.** Difetto di **produzione** trovato per strada: uno
   Stop premuto nella finestra fra «la persona preme» e «la generazione entra»
   viene **inghiottito** — misurato, 64 token su 64 chiesti, `stopHonoured=false`.
   `nativeGenerate` azzera `cancelled` all'ingresso, e la ragione è buona; la
   conseguenza no. Cura proposta nel ritorno, **non applicata**: tocca la
   produzione.
3. ⛔ **`minSdk` contro Vulkan 1.1.** Il link richiede
   `vkGetPhysicalDeviceFeatures2`, che l'NDK espone **dall'API 28** (verificato
   livello per livello). Il nostro `minSdk` è **26**. Una promozione Vulkan
   romperebbe Android 8 e 8.1: o si alza `minSdk`, o si caricano i simboli
   dinamicamente. Decisione di prodotto.
4. **Le chiavi dei provider.** L'app è ripartita da zero (backup non
   ripristinabile). Per la 0.1.17 non servono; servono per la parity coi modelli
   a chiave. OpenRouter è **PKCE col browser di sistema** ⇒ le credenziali le
   digita l'owner.

---

## Da dove riparte chi prende in mano la 0.1.17

In quest'ordine, e la ragione è che ogni passo sblocca il successivo:

1. ~~Fase 1, il forward pin~~ — ✅ **fatta**: `dc72703`, zero rotture di API,
   golden identica.
2. **OpenCL come C1 vero** — 🔄 in corso. La build c'è, l'offload è provato, e le
   prime misure sono state **scartate per deriva termica**: C0 era freddo e C1
   caldo, quindi il confronto non valeva. Si rifà da freddo.
3. **Flash Attention off/auto/on su OpenCL** — adesso è LECITO, perché il pin
   contiene `60addddf`. Non ancora fatto.
4. **La tenuta nel tempo.** Nessun test da 10 minuti, nessuna deriva termica
   sotto carico prolungato: le corse di oggi sono brevi.
5. **PP8192** — serve una corsa con contesto più largo.
6. **La politica a un numero solo** — i dati per rifarla ci sono.

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
lane/motore-gpu                          21 commit, spinto su origin (privato)
.claude/RITORNO-0.1.17.md                il dettaglio, con tutte le misure
mobile/scripts/research/README.md        come si riproduce, dall'inizio
mobile/.tmp-research/                    artifact grezzi (fuori da git di proposito)
C:\Users\Antonino\toolchains\            gcc, SPIRV-Headers, Vulkan-Headers (~300 MB)
```

**Sul Pad**: app installata da zero, build **senza acceleratori**, e tre modelli
`ggml-org` con impronta verificata — Llama 3.2 3B, Qwen3 1.7B, Gemma 3 4B. Il
quarto posto concesso dall'owner è libero.
