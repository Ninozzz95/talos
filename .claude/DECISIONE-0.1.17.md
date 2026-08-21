# DECISIONE — 0.1.17, il motore locale su GPU

> **Cosa è questo documento.** Le misure per esteso stanno in
> [`RITORNO-0.1.17.md`](RITORNO-0.1.17.md). Questo serve a **decidere**: quattro
> decisioni, ognuna col suo prezzo misurato, la sua raccomandazione e cosa
> succede dopo.
>
> Data: **2026-08-20**. Ramo `lane/motore-gpu`, **81 commit**, albero pulito,
> **non spinto**. Dispositivo: OnePlus Pad 3 (Adreno 830, Android 16), motore
> `llama.cpp` al pin `dc72703` (b419).

---

## ✅ RISPOSTA DELLA SESSIONE PRINCIPALE — 2026-08-21

> **Non è un fantasma: sono state applicate da noi, su ordine esplicito
> dell'owner.** Il 21/8 ha letto questo documento e ha risposto «si a tutto»:
> le decisioni 1, 2 e 3 sono approvate, e le prime due erano già nel ramo
> perché le ho scritte io mentre tu consegnavi.
>
> ⛔ **È stato un mio passo nel tuo cortile**, e la consegna dice chiaramente
> che `mobile/android/**` e `mobile/src/lib/models/**` sono tuoi. La prossima
> volta si chiede prima. Il ramo `lane/motore-gpu` è stato **spinto**.
>
> Cosa resta a te, nell'ordine:
>
> 1. ⛔ **Rifare tutte le misure di riferimento** nella configurazione nuova —
>    lo dici tu stesso al punto 9, ed è il motivo per cui era giusto decidere
>    prima di accumulare altri numeri.
> 2. **La cura dell'abort dentro `ggml-opencl`** (decisione 3, approvata):
>    ~30 righe, costo zero, e va proposta a monte.
> 3. **La Fase 7 nei tre passi** che elenchi: spedire una libreria GPU nella
>    build di rilascio, collegare la politica correggendone la **grandezza**
>    (si decide sul TTFT, non sui tok/s), passare `gpuLayers`.
> 4. Poi la **0.1.18, la voce personale**.
>
> ⛔ Il difetto di **Gemma 3 senza attrezzi** che hai trovato per strada resta
> aperto ed è indipendente: va detto nella scheda del modello. La sessione
> principale ne ha misurato un secondo, dello stesso ceppo: dopo un turno con
> attrezzi, il **secondo messaggio** fallisce con `Conversation roles must
> alternate` — il template di Gemma non sa rappresentare il turno di un tool
> nella storia. Riproducibile 3 volte su 3.

---

## ✅ SECONDA RISPOSTA — il microbatch, 2026-08-21

> Tu chiedi: **192 o 512**, prima di spendere ore a rifare le misure.
> **512.** Ma non per la ragione che hai dato — quella non regge, e va detta.

### ⛔ Il confronto era contro una build che non spedisce

Hai scritto: *«a microbatch 512 il prefill va meglio (298→291-312 tok/s a
seconda del confronto)»*. Ho messo in fila i numeri dei tuoi due documenti:

| configurazione | prefill 512 | prefill 2048 | Stop | da dove |
|---|---:|---:|---:|---|
| `on / 512` — la produzione di **ieri** | 314,3 | 259,6 | 5.926 ms | dec. 2 |
| `off / 192` — la produzione di **oggi**, senza cura | **298,1** | 257,6 | ~460 ms | dec. 2 |
| `off / 512` **senza cura** — ⛔ non spedirà mai | 311,8 | 265,4 | 1.425-1.440 | dec. 3 |
| `off / 512` **con la cura** — candidata | **290,7** | **249,5** | **32/36/36** | dec. 3 |
| `off / 192` **con la cura** — l'altra candidata | ⛔ **mai misurata** | ⛔ | ⛔ | — |

Il **312** è la riga «senza cura»: è il riferimento giusto per misurare **il
prezzo della cura**, e lì l'hai usato bene. ⛔ Ma nel confronto fra microbatch
diventa un fantasma: quella build non esce. Le candidate vere sono le ultime
due, e fra loro **512 sta a 290,7 contro i 298,1 di 192**.

⇒ **Sui numeri che hai, 192 è più veloce di 512, non più lento.** E la riga che
deciderebbe — `off / 192` **con la cura** — non l'ha mai misurata nessuno.

### ⭐ Perché la risposta resta 512, per una ragione più forte

Il costo della cura è **per grafo**, non per token: il drain scatta ogni 16
nodi, e ogni microbatch è **un grafo**. ⇒ Dimezzare il microbatch **moltiplica**
il prezzo della cura, perché moltiplica i grafi.

Il numero si ricava dai tuoi stessi dati, **e torna due volte**:

| prompt | grafi a 512 | tempo senza cura | tempo con cura | costo **per grafo** |
|---:|---:|---:|---:|---:|
| 512 token | 1 | 1,642 s | 1,762 s | **0,1193 s** |
| 2.048 token | 4 | 7,716 s | 8,209 s | **0,1233 s** |

⭐ Ricavato da due prompt diversi, lo stesso numero al **3%**. Il modello «costa
per grafo» non è un'ipotesi: i tuoi dati lo confermano da soli.

⇒ **Previsione falsificabile** per `off / 192` con la cura:

| | 192 + cura (previsto) | 512 + cura (misurato) |
|---|---:|---:|
| prefill 512 (3 grafi invece di 1) | **≈ 247 tok/s** | 290,7 |
| prefill 2048 (11 grafi invece di 4) | **≈ 220 tok/s** | 249,5 |

⇒ 512 vince del **17%** e del **13%**. ⛔ Ma è **una previsione, non una
misura**: la regola di casa dice che si strumenta sempre.

### ⇒ COSA FARE, nell'ordine

**1 · Misura `192 + cura`. UNA configurazione, ~20 minuti.** Non ore.
Se il prefill cade verso 247/220, 512 è deciso **da una misura** e non da un
argomento. Se invece resta sopra 290, la mia previsione è sbagliata, il modello
«per grafo» va buttato, e ne riparliamo con i numeri in mano.
⛔ È il passo che va **prima** della rimisura completa: rifare la matrice C0
nella configurazione sbagliata è precisamente l'errore che il tuo §9 voleva
evitare.

**2 · Poi la rimisura completa**, nella vincitrice.

### ⛔ Le due ragioni per tenere 192 non reggono

**«TTFT».** TTFT è prefill intero + primo token. Un microbatch più piccolo non
accorcia il prefill — con la cura lo **allunga**. I **−4,5 s sul primo
messaggio** della decisione 2 sono della **Flash Attention spenta**, non del
microbatch: misurati da soli, valgono −4,7…−6,6 s, e restano in tutti e due i
casi. ⇒ Su TTFT, 192 **peggiora**.

**«Lo Stop».** Era l'unica ragione per cui 192 esisteva, e la tua decisione 3
l'ha risolta a 512: **32/36/36 ms**, identico al pavimento CPU. Un'eccezione
comprata per un problema che adesso ha una cura migliore **si restituisce**.

### ⭐ E una ragione in più, che nessuno ha citato

`const microBatch = 192` è **una costante scritta a mano**. Quello che ha
sostituito, `core >= 6 ? 512 : 256`, **si adattava al telefono** — e i telefoni
deboli prendevano 256, non 512. Il 192 piatto li ha peggiorati tutti insieme.
⇒ Tornare alla formula non è «tornare indietro»: è tornare a qualcosa che
**misura il dispositivo** invece di indovinarlo. La regola di casa è
`nothing-hardcoded-must-adapt`.

⛔ L'unico asse su cui 192 potrebbe vincere davvero è la **memoria**: il
microbatch dimensiona il compute buffer. Si legge **gratis** dal log di
caricamento del modello, due volte. Se a 512 il buffer stringe i telefoni
piccoli, la formula lo gestisce già da sé — e la risposta resta la formula, non
il 192 piatto.

---

## ⛔⛔ E il metro che manca alla rimisura — prima di spendere le ore

La tua forbice **291-312** non è rumore di misura: è **il chip che oscilla**.
È già in memoria, misurato: *«Sotto carico non CALA: OSCILLA — 19,3 ↔ 13,6
tok/s, 9 salti in 10 minuti, 55,7% in basso. Né `thermal` né la batteria lo
vedono.»* Un'escursione del ±17% sulla decodifica: una forbice del 3,5% sul
prefill ci sta **dentro tutta**.

⇒ Se rifai la matrice C0 senza registrare lo stato termico, i numeri diranno
**quando** hai misurato, non **cosa**. E sono ore.

**Il segnale c'è, ed è leggibile.** Misurato oggi sul Pad: **121 zone termiche**,
di cui **otto per la GPU** (`gpuss-0…7`) e i cluster CPU (`cpuss-*`). A riposo
la GPU sta a **37,4 °C**, piatta.

⭐ **Lo strumento è già scritto e provato**, host-side, orologio monotono, uscita
TSV da incollare accanto ai tok/s:

```
.claude/strumenti/termica.mjs   node .claude/strumenti/termica.mjs [secondi] [passo-ms]
ms   gpu_max  gpu_med  cpu_max   + una colonna per zona
```

⛔ Un fatto misurato che va saputo: **ogni campione costa ~2,3 s** di andata e
ritorno `adb`, non il passo richiesto. Per nove salti in dieci minuti basta e
avanza; per finestre più fini no.

⇒ Fallo girare **accanto** alla rimisura e stratifica per banda. Ore che
producono numeri difendibili, invece di ore che producono una media.

## ⛔⛔ AVVISO — le decisioni 1 e 2 RISULTANO GIÀ APPLICATE nel ramo

Scritto il **2026-08-21 alle 00:05**, dopo aver consegnato questo documento.

Nel commit `833f6687` sono comparse modifiche a **codice di produzione** che
**io non ho scritto** in questa sessione, e che il mio `git add -A` ha raccolto
sotto un messaggio che parlava d'altro:

| file | cosa fa |
|---|---|
| `talos_llama_jni.cpp` (+85) | aggiunge `talos_bersaglio_e_opencl()` e, quando la modalità è `default`, **spegne la Flash Attention se il bersaglio è OpenCL** ⇒ **decisione 1** |
| `src/lib/models/engineTuning.ts` | `const microBatch = 192` al posto di `core >= 6 ? 512 : 256` ⇒ **decisione 2** |
| `src/services/localEngineDoctor.ts` (+45), `i18n/*` | lo espongono nel dottore |
| `tests/unit/models/engineTuning.test.ts` | test aggiornati |

⇒ **Le due decisioni di questo documento risultano già prese e implementate.**

⛔ **Quello che posso dire e quello che non posso.** Il ramo con dentro quelle
modifiche è **verde**: `npm run typecheck` passa, i 43 test dei due gruppi
toccati passano, e la build nativa con OpenCL compila. ⛔ **Ma non le ho scritte
io e non le ho riviste**: non so se siano complete, e nessuna corsa sul
dispositivo è stata fatta **dopo** di esse.

⇒ Il resto del documento resta valido come **motivazione** e come **prezzo
misurato**; va letto sapendo che dove dice «proposta, non applicata» il codice
dice il contrario.

---

## 0. Il fatto che riordina tutto il resto

⛔ **Oggi il motore locale di TALOS gira SOLO SU CPU.** Verificato sul codice,
non dedotto:

| domanda | risposta |
|---|---|
| L'APK di **rilascio** porta un backend GPU? | ⛔ **No.** `libggml-base`, `libggml` e **sette varianti CPU**. Nessun `libggml-opencl`, nessun `libggml-vulkan`. |
| Quanti strati vanno sulla GPU? | ⛔ **Zero.** `TalosLlamaPlugin` legge `call.getInt("gpuLayers", 0)` e **nessun chiamante** in `src/` passa quel campo. |
| Chi chiama `TalosBackendChoice.choose()`? | ⛔ **Nessuno.** L'unico chiamante nel repo è il suo test. |

⇒ Le decisioni **1** e **2** non curano un difetto che le persone vivono oggi:
sono il **prerequisito** del giorno in cui la GPU verrà spedita. Vanno prese
**prima** di quel giorno, non dopo.

---

## 1. DECISIONE — Flash Attention: spenta sui bersagli OpenCL?

### Lo stato di fatto

`llama_context_default_params()` mette `LLAMA_FLASH_ATTN_TYPE_AUTO`
(`llama-context.cpp:3528`), TALOS non lo sovrascrive mai, e su Adreno 830 `AUTO`
**risolve in acceso**. Nessuno l'ha scelto: è il default della libreria.

⭐ `auto` e `on` sono **la stessa cosa** qui — confrontate mediana per mediana
distano **0,07-2,4%**, cioè rumore:

```
PP512    pp  307,28 vs 306,72  (−0,18%)   ttft  1.665 vs  1.667  (+0,12%)
PP2048   pp  193,50 vs 193,37  (−0,07%)   ttft 10.585 vs 10.593  (+0,08%)
TG256    pp  149,04 vs 146,23  (−1,89%)   ttft    209 vs    214  (+2,39%)
```

### Cosa costa tenerla accesa

Cinque giri per configurazione più uno di riscaldamento, telefono **freddo a ogni
blocco**:

| | **off** | auto | on |
|---|---:|---:|---:|
| primo inferire del processo (TTFT) | **1.646 ms** | 8.230 ms | 8.031 ms |
| prefill 512 | **312 tok/s** | 307 | 307 |
| prefill 2048 | **268 tok/s** | 256 | 256 |
| **decodifica dopo 2048 token** | **15,9 tok/s** | **8,1** | **8,1** |
| decodifica dopo 31 token | 19,5 | 19,3 | 19,2 |

⛔ Il costo della FA **cresce con la lunghezza della KV**: su un prompt corto le
due configurazioni sono indistinguibili, su 2.048 token la differenza è **due
volte**.

### Perché il primo messaggio costa 5-6 secondi

Il motore lo dice da solo: fra la prima riga di compilazione e il primo prompt
passano **5.845 ms**, in sette compilazioni.

```
ggml_opencl: lazy-compiling flash_attn prepass for DK=128 DV=128
ggml_opencl: compiling fa prepass f16
ggml_opencl: compiling fa f32_f16
ggml_opencl: compiling fa f32_f16 MQ_GQA=8
ggml_opencl: compiling fa f32_f16 c8 NSG2
ggml_opencl: compiling fa f32_f16 c8 g8 NSG2
ggml_opencl: compiling fa f32_f16 split
```

⛔ E **quattro dei sette kernel prodotti vengono buttati subito**, perché la GPU
non li regge: `per-kernel max 128 < required 192; skipping registration`.

⛔⛔ E nessuno finisce nella cache su disco. **Non è un caso a runtime, è
strutturale:**

| funzione | consulta la cache | salva nella cache |
|---|---|---|
| `build_program_from_source` | ✅ `cl_program_cache_try_load` | ✅ `cl_program_cache_try_save` |
| `build_program_from_source_ex` | ❌ | ❌ |

e **tutti e quattordici** i punti di compilazione della Flash Attention passano da
`_ex`. ⇒ I `.clbin` restano 181 prima e dopo, e **ogni processo ripaga i 5,8
secondi**.

### Il verso contrario, perché l'ordine era un sospetto legittimo

La prima campagna aveva girato `off` → `auto` → `on`, e `off` era stato il blocco
**più freddo**. Rifatta invertendo l'ordine — `on` per primo e da freddo, **stessa
APK**, raffreddamento completo fra i blocchi:

```
off (secondo, in salita termica)  PP2048   267,6  265,7  262,8 | 222,1  198,8  198,9
                                  decodif.  15,9   15,5   15,7 |  11,3   11,3   11,0
on  (primo, da freddo)            PP2048   256,5  255,8  255,7 | 232,5  193,2
                                  decodif.   8,2    8,2    8,3 |   7,6    7,5
```

⇒ Anche **strozzata** dal calore, la decodifica di `off` (11,0-11,3) resta sopra
quella di `on` **da freddo** (8,1-8,3). Non era l'ordine, e non era il calore.

### E le parole non cambiano

Suite golden sul dispositivo, campionamento deterministico, **GPU davvero in uso
(29 strati su 29)**, produzione di oggi contro il candidato:

| modello | esito |
|---|---|
| Llama 3.2 3B | **7 su 7 identici** |
| Gemma 3 4B | **6 su 6 identici** — S3 saltato: il modello non ha attrezzi |
| Qwen3 1.7B | **7 su 7 identici**, **incluso** il caso dell'attrezzo |

⛔ **Onestà su cosa prova.** Tre dei sette casi contengono testo generato davvero;
gli altri descrivono template e grammatica. È una prova **stretta** — poche
risposte per modello, non un'equivalenza universale — ma è lo stesso metro con cui
abbiamo qualificato il forward pin, applicato tre volte invece di una.

⛔⛔ **E la prima volta questa prova era FALSA, per un difetto mio.**
`TalosSemanticGoldenDeviceTest` apriva con `gpuLayers = 0` scritto a mano:
dichiarava il bersaglio OpenCL e **calcolava sulla CPU**. Corretto e rifatto.

### ⇒ RACCOMANDAZIONE

**Spegnerla sui bersagli OpenCL.** Non è un compromesso: vince su ogni asse
misurato, su tre architetture, e non cambia una parola.

⛔ **Non generalizzare oltre questo backend.** `docs/backend/OPENCL.md` di
upstream elenca «Flash attention does not always improve performance» fra i
difetti noti e «Improve flash attention» fra i TODO. È una proprietà di *questo*
backend su *questa* GPU **oggi**: altrove **si rimisura**, e la manopola
`talosFlashAttn` esiste apposta.

**Dove si tocca:** `talos_apri_modello` in
`mobile/android/app/src/main/cpp/talos_llama_jni.cpp`.

---

## 2. DECISIONE — il microbatch: quale valore?

### Lo stato di fatto, e una mia correzione

⛔ **Il valore di produzione NON è il 256 del JNI**, che è un ripiego. La
produzione manda un valore esplicito da `mobile/src/lib/models/engineTuning.ts`:

```ts
const microBatch = core >= 6 ? 512 : 256
```

Il Pad ha **8 core** ⇒ la produzione apre a **512**. ⇒ La cura è **una riga di
TypeScript**, non di C++.

⭐ Va detto a favore di chi l'ha scritta: il commento sopra quella riga **aveva
già capito il compromesso** — «l'attesa massima dello Stop è un microbatch
intero». Il ragionamento era giusto e non era mai stato **verificato su una GPU**.

### La misura, e dove sta il salto

Prompt da 2.048 token, Stop premuto dopo 200 ms, Flash Attention spenta. Il motore
registra dove si ferma (`prefill interrotto a N/2048`):

| microbatch | latenza | si ferma a |
|---:|---:|---|
| 512 (**produzione**) | 1.443 ms | **512**/2048 — pezzo intero completato |
| 256 | 1.446 ms | **512**/2048 — idem |
| **192** | **~460 ms** | **0**/2048 — morde a metà, non tiene niente |
| 160 | ~370 ms | 0/2048 |
| 144 | ~324 ms | 0/2048 |
| 128 | ~290 ms | 0/2048 |

⇒ **Il salto sta fra 256 e 192**, e vale un fattore tre. Sotto la soglia la
latenza è semplicemente **una lunghezza di microbatch**, con curva lineare.

### Il prezzo, misurato

Il candidato `flash-attn off` + microbatch **192**, contro la produzione di oggi
(`on` / 512), telefono freddo, mediane su cinque giri:

| | oggi | `off / 192` | |
|---|---:|---:|---|
| prefill 512 | 314,3 tok/s | 298,1 | **−5,2%** |
| prefill 2048 | 259,6 tok/s | 257,6 | **−0,8%** |
| **decodifica dopo 2048 token** | 8,07 tok/s | **15,9** | **+97%** |
| decodifica (prompt corto) | 18,8 tok/s | 19,6 | **+4%** |
| **primo messaggio del processo** | 6.233 ms | **1.707** | **−4,5 s** |
| **Stop nel prefill** | **5.926 ms** | **~460** | **13×** |

### E su tre architetture il segno non cambia mai

| | Llama 3.2 3B | Gemma 3 4B | Qwen3 1.7B |
|---|---:|---:|---:|
| prefill 512 | −5,2% | −0,4% | −8,2% |
| prefill 2048 | −0,8% | ⭐ **+14,4%** | −3,4% |
| **decodifica dopo 2048** | ⭐ **+97%** | **+18%** | ⭐ **+85%** |
| decodifica (prompt corto) | +4% | −0,7% | −0,4% |
| **primo messaggio** | **−4,5 s** | **−4,9 s** | **−4,1 s** |

⇒ Costa fra **zero e otto per cento** di prefill e restituisce **ogni volta** le
stesse tre cose. Col modello cambia la **grandezza** del guadagno, non la
**direzione** — su Gemma il prefill lungo addirittura **migliora**.

### ⛔ Il cancello G4, e perché non lo inseguirei

G4 chiede due cose: nessuna latenza sopra **1.500 ms** *e* p95 non oltre **250 ms
peggio della CPU**. Il riferimento CPU con la stessa attesa è **p95 36 ms** ⇒ il
tetto vero è **286 ms**, non 1.500.

| flash-attn / microbatch | giro 0 | p50 | **p95** | ≤ 1.500 | **≤ 286** |
|---|---:|---:|---:|:---:|:---:|
| **on / 512 — com'è oggi** | **5.926** | **1.412** | **5.926** | ⛔ | ⛔ |
| on / 256 | 4.095 | 1.460 | 4.095 | ⛔ | ⛔ |
| off / 512 | 1.444 | 1.430 | 1.444 | ✅ | ⛔ |
| off / 192 | ~460 | ~460 | ~479 | ✅ | ⛔ |
| off / 128 | 300 | 275 | 300 | ✅ | ⛔ **per 14 ms** |
| **off / 64** | **128** | **102** | **128** | ✅ | ✅ |

⇒ **Il cancello lo passa solo il 64**, al prezzo del **28%** di prefill.
⛔ Ma quel cancello misura una cosa che la **cura vera** (decisione 3) porterebbe
a millisecondi **senza pagare niente**. Scegliere il 64 per far diventare verde un
numero sarebbe **ottimizzare il cancello invece della persona**.

### ⇒ RACCOMANDAZIONE

**192.** Sta appena sotto il salto: compra lo Stop pronto al prezzo più basso
possibile. ⛔ Con la dichiarazione esplicita che **G4 resta rosso** finché non
arriva la decisione 3, e il motivo scritto.

**Dove si tocca:** `mobile/src/lib/models/engineTuning.ts`, riga
`core >= 6 ? 512 : 256`.

---

## 3. DECISIONE — l'abort su GPU: a monte, patch locale, o niente?

### Il meccanismo è DIMOSTRATO, non ipotizzato

`GGML_OPENCL_OPFILTER` è una regex delle operazioni che OpenCL **non deve
reclamare**: quelle che combaciano finiscono sulla **CPU**, e il grafo acquista
uno spezzone CPU. Forzando **una sola** operazione (`RMS_NORM`) a microbatch
**512**, dove lo Stop non mordeva affatto:

```
opfilter regex = "RMS_NORM"          ← confermato applicato
stop:  7   22   22 ms                ← senza filtro erano 1.443 ms
prefill interrotto a 0/2048          ← senza filtro era 512/2048
```

⇒ ⭐ **Un fattore cento, a microbatch pieno.** **L'abort viene consultato SOLO
dove il grafo passa dalla CPU.** Con tutti i 29 strati su OpenCL non esiste nessun
punto in cui guardare, e lo Stop può solo aspettare la fine del pezzo.
⇒ Spiega anche la soglia fra 256 e 192.

### Perché manca, e quanto è piccola la cura

| backend | callback di abort |
|---|---|
| CPU (`ggml-cpu.c`) | ✅ controllata dentro il ciclo dei thread |
| **Metal** (`ggml-metal-context.m:599`) | ✅ controllata fra i command buffer |
| OpenCL · Vulkan · CUDA | ❌ **nessuna** |

⭐ **Il metodo di Metal è il punto**: non annulla il lavoro in volo, **smette di
consegnarne altro**. Spezza il grafo in `n_cb` command buffer, aspetta il
completamento di uno, e **prima di consegnare il successivo** controlla la
callback; se lo Stop è stato chiesto torna `GGML_STATUS_ABORTED`. Costo a regime:
**zero** — non cambia il lavoro, solo il momento della consegna.

**E l'impianto di llama.cpp è già generico.** `llama-context.cpp:1145` gira su
**ogni** backend registrato e chiede il simbolo
`"ggml_backend_set_abort_callback"`:

| backend | espone il simbolo? |
|---|---|
| CPU | ✅ `ggml-cpu.cpp:663` |
| **Metal** | ❌ **ha la funzione e NON la esporta** ⇒ da llama.cpp non la riceve mai |
| **OpenCL** | ❌ `get_proc_address = NULL`: non espone **niente** |

⇒ La cura per OpenCL: due campi nel contesto, un setter, l'esportazione, e il
controllo dentro il `for (i < cgraph->n_nodes)` che
`ggml_backend_opencl_graph_compute` **ha già**. **Nessuna modifica a llama.cpp,
nessuna a TALOS.**

### È sicuro? Sì, ed è documentato

`include/llama.h`:

> `2 - aborted (processed ubatches will remain in the context's memory)`
> «To handle this correctly, query the memory state using
> `llama_memory_seq_pos_min()` and `llama_memory_seq_pos_max()`»

Non è corruzione: è uno stato **previsto** con un recupero documentato.
⭐ E il nostro JNI **lo gestisce già** — riporta la KV esattamente a
`session->cached` e, se il taglio fallisce, azzera.

### A monte è un buco NOTO e non colmato

`ggml-org/llama.cpp#10509` — «Ability to cancel during prompt processing
(llama_decode)» — chiede esattamente questo ed è **chiuso come stale** senza
implementazione. ⛔ Cercate anche PR che implementino l'abort per Vulkan o CUDA:
**non risultano**.

### Le tre strade, col prezzo

| | Stop | prezzo |
|---|---:|---|
| `off` + microbatch **192** (decisione 2) | ~460 ms | **0-8% di prefill**, decodifica intatta |
| una operazione sulla CPU | ~20 ms | ⛔ **−33% di decodifica** — misurato, **scartata** |
| **l'abort dentro `ggml-opencl`** | **~ms** | **niente** |

⛔ La seconda l'ho misurata e cade: `RMS_NORM` gira due volte per strato, e in
decodifica ogni token paga un viaggio GPU→CPU→GPU — 19,5 → **13,0 tok/s**.

### ⇒ RACCOMANDAZIONE

**Farla, e proporla a monte.** Sono ~30 righe in `ggml-opencl`, il terreno è
libero, il progetto ha già il precedente di Metal, e l'impianto di llama.cpp la
raccoglierebbe da sola.

⛔ **Non è bloccante**: come **patch locale sul nostro pin** funziona identica, al
costo di riapplicarla a ogni aggiornamento del motore. ⇒ La scelta fra le due è di
**manutenzione**, non tecnica.

---

## ✅ ESEGUITA — 2026-08-21, sessione principale

> Fatta come **patch locale sul pin**, non proposta a monte (quello resta
> all'owner: aprire una PR su `ggml-org/llama.cpp` è una comunicazione esterna,
> non mia da avviare). File:
> [`mobile/third_party/patches/0001-opencl-abort-callback.patch`](../mobile/third_party/patches/0001-opencl-abort-callback.patch)
> (50 righe, due file: `ggml-opencl.h` + `ggml-opencl.cpp`), applicata sul
> submodule (non committabile lì: `origin` è l'upstream vero, un commit locale
> sarebbe irraggiungibile a un clone fresco). Round-trip provato: patch
> applicata su un `dc72703` pulito riproduce lo stesso diff, byte per byte.

**⛔ La specifica di questo documento era INCOMPLETA, e l'ho scoperto
misurando, non leggendo.** Il testo sopra dice «il controllo dentro il `for`
che `ggml_backend_opencl_graph_compute` ha già» — un controllo di sola lettura
fra i nodi. Implementato così: **zero effetto**. Stop restava a 1425-1440 ms,
indistinguibile da prima. Causa: i kernel OpenCL si accodano in modo
**asincrono** e l'unica attesa vera è `ggml_backend_opencl_synchronize`, chiamata
**una sola volta dopo l'intero grafo** — un flag letto fra gli accodamenti non
ha niente da interrompere, perché il thread CPU li accoda tutti in pochi
millisecondi e si addormenta nell'attesa finale prima che il cancel arrivi.

⇒ **Serve un drain periodico**, non un controllo passivo: ogni tot nodi si
chiama `clFinish` sulla coda (stesso idioma già usato nel file, righe 15126 e
15182) e SOLO DOPO si guarda la callback. Prima versione (stride fisso 16):
Stop crolla a **29 ms** — ma la decodifica (che genera con LO STESSO grafo,
un token alla volta) perde **quasi metà della sua velocità** (16,4 → 7,7
tok/s), perché il drain paga anche quando in coda non c'è niente da aspettare.

Un tentativo di stride **adattivo** (raddoppia se il drain è veloce, torna a
16 se è lento) non bastava: lo stato si resettava a ogni chiamata di
`graph_compute` (una per token in decodifica) e non aveva mai il tempo di
salire abbastanza prima di ripartire da capo — misurato, non solo sospettato,
con un log temporaneo che stampava lo stride a ogni chiamata. Persistendo lo
stato nel contesto il sintomo non cambiava lo stesso: sia in prefill sia in
decodifica il grafo ha **lo stesso numero di nodi** (misurato: 1013 sempre),
quindi il conteggio dei nodi non distingue le due cose — lo stride, per
quanto alto, tocca comunque il tetto ogni ~500 nodi in ENTRAMBI i casi.

**⭐ Il segnale giusto era già nel grafo, non nel tempo.** Il primo nodo
(`RMS_NORM`) porta `ne[1]` = quanti token sta processando: **1** ad ogni
singolo passo di decodifica, **512/511/31** ad ogni pezzo di prefill —
misurato via log, non assunto. ⇒ Il controllo periodico si accende **solo**
quando `cgraph->nodes[0]->ne[1] > 1`: un grafo a un token non lo paga per
niente, un grafo multi-token lo paga con lo stride fisso 16.

### Il prezzo, misurato — Llama 3.2 3B, microbatch **512** (produzione, non 192)

| | senza controllo | **con la cura finale** | costo |
|---|---:|---:|---:|
| **Stop nel prefill** (9 giri) | 1425-1440 ms | **p50 32 · p95 36 · max 36 ms** | **≈40× più veloce** |
| decodifica dopo 2048 token | 16,43 tok/s | **16,43 tok/s** | **zero** |
| decodifica (prompt corto) | 19,49 tok/s | **19,59 tok/s** | **zero** |
| prefill 512 | 311,78 tok/s | 290,67 tok/s | −6,8% |
| prefill 2048 | 265,42 tok/s | 249,48 tok/s | −6,0% |

⇒ Il p95 dello Stop (36 ms) **combacia** con quello del floor CPU citato in
§1 della decisione 2 (36 ms): OpenCL ora è indistinguibile dalla CPU su
questo asse. **Il gate G4 passa al microbatch PIENO di produzione (512)** —
non serve scendere a 192 (decisione 2) né a 64 solo per lo Stop. Il costo sul
prefill (~6-7%) è nello stesso ordine di quello che la decisione 2 aveva già
accettato per un guadagno diverso; la decodifica, il caso più frequente, non
paga niente.

**Verificato anche il verso positivo del gate**: golden suite (7/7, GPU
davvero in uso, 29/29 strati) rilanciata su questa build finale — nessuna
parola cambiata dalla cura.

⛔ **Non ancora fatto**: rimisurare la matrice C0 completa in questa
configurazione (§9 del documento lo chiede), lo stress OpenCL a due sessioni
concorrenti, e la proposta a monte (PR su `ggml-org/llama.cpp`) resta
dell'owner.

---

## 4. DECISIONE — il push

Ramo `lane/motore-gpu`, **81 commit**, albero pulito. **Non l'ho spinto e non lo
spingo senza un sì esplicito.** ⛔ I tag di release vanno **solo** sul repo
pubblico: sul privato non ci sono le chiavi di firma e il workflow fallisce.

---

## 5. Cosa NON si decide qui

- ⛔ **`minSdk` contro Vulkan 1.1.** Il link richiede
  `vkGetPhysicalDeviceFeatures2`, che l'NDK espone **dall'API 28** (verificato
  livello per livello: 26 no, 27 no, 28 sì). Il nostro `minSdk` è **26**: una
  promozione romperebbe Android 8 e 8.1. ⇒ Ma **Vulkan crasha** su questo
  telefono, quindi la decisione non serve ancora.
- ⛔ **Lo Stop anticipato**, premuto fra «la persona preme» e «la generazione
  entra»: difetto di produzione trovato per strada, cura proposta e non applicata.
- ⛔ **La politica `TalosBackendChoice`.** Nella configurazione di produzione il
  suo unico numero vale **1,24×** contro una soglia di **1,25×**: rifiuterebbe
  OpenCL **per un centesimo**, su un dispositivo che porta l'attesa di un prompt
  da 2.048 token da **50,5 a 7,9 secondi**. ⛔ E dopo un prompt lungo la GPU
  decodifica **più lentamente** della CPU (8,07 contro 8,51). Non è una soglia da
  ritoccare: è la **grandezza sbagliata**. Si decide sul **TTFT**.

---

## 6. Trovato per strada — e non è una prestazione

⛔⛔ **Con Gemma 3 4B l'assistente NON PUÒ chiamare attrezzi.**
`nativeTemplateCapabilities` risponde:

```json
{"supportsTools":false,"supportsToolCalls":false,"supportsSystemRole":true}
```

Il chat template di Gemma 3 **non contiene affatto le strutture per gli
attrezzi** — confermato a monte. ⇒ Se la persona sceglie Gemma 3, **l'assistente
diventa solo chat**. Non è il difetto già noto «gli attrezzi ce l'hanno e non li
chiamano»: qui non gli vengono nemmeno **offerti**, e **nessuna scheda lo dice**.

⛔ Il dialetto rilevato è `SCONOSCIUTO`: la nostra rilevazione conosce CHATML e
LLAMA3, non Gemma.

---

## 7. Altri numeri che pesano, per contesto

- **PP8192**: su un prompt da 8.192 token la persona aspetta **52,6 secondi**
  prima della prima parola, **anche da telefono freddo** (misurato isolando quel
  bersaglio: lo strozzamento termico valeva solo ~14%). Il prefill cala con la
  lunghezza — **314 → 260 → 156 tok/s** su 512, 2.048 e 8.192.
- **Sotto carico non cala, OSCILLA**: dieci minuti di uso continuo e la decodifica
  salta fra **19,3 e 13,6 tok/s**, nove volte, il **55,7%** del tempo in basso.
  ⛔ Sulla CPU: **zero salti su 67 giri**. Sta nel percorso GPU. ⛔ E lo stato
  **lento** è quello **freddo** (65,6 °C contro 84,1): è un anello che corre
  finché scalda e poi si ferma a raffreddare.
- **Sulla media dei dieci minuti** OpenCL fa **16,13 tok/s** contro **15,52** della
  CPU: il vantaggio sulla decodifica **sparisce** sotto carico. Resta quello sul
  TTFT (268 ms contro 736).
- **MoE**: `MUL_MAT_ID` fallisce **305 volte** in `test-backend-ops` mentre tutto
  il percorso denso è pulito. ⇒ Il permesso a OpenCL si dà **per architettura**:
  modelli densi sì, MoE no.
- **Vulkan**: costruisce, si registra, sposta 29/29 strati, e **muore al primo
  grafo di calcolo**, 2 volte su 2, dentro `vkGetDeviceFaultInfoEXT` del driver
  Adreno. Un crash è FAILED: **non esistono numeri Vulkan**.

---

## 8. I cancelli, allo stato attuale

| cancello | esito |
|---|---|
| `npm run typecheck` | verde |
| `npx vitest run` | 5.858 passati / 10 saltati / 643 file. ⛔ Dopo gli ultimi tocchi al Java è stato rilanciato il **sottoinsieme che legge i sorgenti** (6 file, 29 test, verde), non la suite intera |
| `:app:testDebugUnitTest` | verde |
| `:app:lintDebug` | verde |
| dispositivo — il candidato su tre modelli | prestazioni **e** golden |
| **G4 (Stop sotto GPU)** | ⛔ **ROSSO** oggi; resta rosso col candidato; verde solo con microbatch 64 |
| **G2 (stabilità Vulkan)** | ⛔ **ROSSO** — crash |
| quattro viewport | non applicabili: questo ramo non tocca nessuna superficie visiva |

---

## 9. Se dici sì a tutto, cosa succede

1. Due righe cambiano (`engineTuning.ts`, `talos_apri_modello`) e la
   configurazione di riferimento diventa il candidato.
2. ⛔ **Tutte le misure di riferimento vanno rifatte in quella configurazione** —
   è per questo che consiglio di decidere **prima** di accumulare altri numeri.
3. La Fase 7 può cominciare davvero, in tre passi e ognuno inutile senza il
   precedente: **(a)** spedire una libreria di backend GPU nella build di
   rilascio; **(b)** collegare la politica, correggendone la grandezza; **(c)**
   passare `gpuLayers` dal risultato invece del suo zero.
4. La cura dell'abort si può portare a monte in parallelo, senza bloccare niente.

---

## 10. Se dici no, cosa resta vero lo stesso

- Il motore locale continua a girare **su CPU**, come oggi, e nessuna delle
  misure di questo ramo tocca ciò che le persone usano adesso.
- Il difetto di **Gemma 3 senza attrezzi** resta, ed è indipendente da tutto il
  resto: è una cosa da dire nella scheda del modello.
- Il ramo resta **non spinto** e nessuna release cambia.
