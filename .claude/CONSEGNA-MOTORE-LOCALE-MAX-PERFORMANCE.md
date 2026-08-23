# CONSEGNA — Motore locale MAX PERFORMANCE, da P1-1 blocco 2 in poi

> Scritto il **2026-08-23** per un agente che riprende questo programma da
> zero, sullo stesso ramo (`lane/voce-personale`) o su uno nuovo aperto da
> lì. Non riassume il piano vivo: lo **indirizza**. Ogni numero qui sotto è
> già stato verificato sul codice reale o sul Pad reale in questa sessione —
> non ridedurlo, ririflettilo solo se qualcosa non torna più.

---

## 0-bis. La prima cosa che fai

Il piano vivo, aggiornato a ogni blocco chiuso, **non sta nel repo**:

```
C:\Users\Antonino\.claude\plans\comp-act-lucky-squid.md
```

Leggilo per intero prima di leggere il resto di questa consegna. Questo
documento indirizza solo il pezzo che manca (P1-1 in poi); il piano dice
tutto il resto — cosa è fatto, con quali commit, con quali numeri misurati.

Poi:

```bash
cd mobile && npm run typecheck && npx vitest run
```

Deve essere verde prima di toccare qualunque cosa. Se non lo è, l'ambiente è
rotto: fermati e dillo, non lavorarci sopra.

---

## 0. In una riga

Il piano ha chiuso Fase 0, Fase 1, Fase 2 e due dei tre pezzi piccoli della
Fase 3 (P1-2, P1-4). Resta **P1-1** a metà (un blocco su N fatto) e due
blocchi grandi mai iniziati (P1-3, P1-5). Il compito di questa consegna è
**P1-1 dal blocco 2**: il thread pool nativo con affinity CPU vera — il
pezzo a rischio medio-alto (CR-07: use-after-free/deadlock nel lifecycle)
per cui il blocco 1 è stato tenuto deliberatamente a rischio zero.

---

## 1. Cosa è già fatto — non ripartire da capo

| Blocco | Stato | Commit |
|---|---|---|
| Fase 0 — cancello backend dichiarato==spedito | ✅ | `81d182ce` |
| B1 — trace end-to-end + snapshot config effettiva | ✅ | 3 commit, vedi piano |
| B2 — schema benchmark v2, classificatore fail-closed | ✅ | `ecdacfcf` |
| P0-1 — cache persistente OpenCL | ✅ | `f07e01b1`, `73ee9192` |
| P0-2 — Local Performance Profile store | ✅ | `821bfde9` |
| P0-3 — Q0 smoke check, etichetta di livello | ✅ | `48c775cb` |
| P1-2 — microbatch: misurato E applicato (512, era 192) | ✅ | `6007666` |
| P1-4 — matrice FA×KV (f16/q8_0 × on/off) | ✅ | `cf4401c9` |
| **P1-1 blocco 1** — `nativeCpuTopology()`, lettura pura | ✅ | `0e9b0a12` |
| **P1-1 blocco 2+** | 🔜 **QUI** | — |
| P1-3 — prefisso statico AOT | 🔜 non iniziato | — |
| P1-5 — selettore break-even | 🔜 non iniziato | — |

Ogni riga ✅ è verificata sul Pad reale, non solo compilata — i numeri
misurati stanno nel piano vivo, non li riporto qui per non farli invecchiare
in due posti.

⛔ **P1-2 in particolare**: il valore di produzione (`microBatch` in
`mobile/src/lib/models/engineTuning.ts`) è stato cambiato da 192 a 512 con
sì esplicito dell'owner, e verificato end-to-end sul Pad — non solo in unit
test: build reale, deploy reale, un messaggio vero mandato dal composer
della chat, logcat che conferma `microbatch 512` nella riga che il motore
nativo stampa alla ricezione del prompt. Non toccarlo di nuovo senza una
nuova misura che lo giustifichi — il test in `engineTuning.test.ts` lo
difende ed è stato provato AL CONTRARIO (rimesso 192, il test fallisce).

---

## 2. IL COMPITO — P1-1 blocco 2: il thread pool nativo con RAII vero

### 2.1 Cosa c'è oggi, verificato leggendo il codice — non presumerlo

`talos_llama_jni.cpp` **non usa affatto** l'API di thread pool esterno di
llama.cpp. Usa solo `ctx_params.n_threads` / `ctx_params.n_threads_batch`
(passati a `llama_context_params` alla creazione del contesto) e
`llama_set_n_threads(ctx, n, n)` per cambiarli a caldo su un contesto già
aperto (righe ~3056-3110, la funzione che misura/ripristina intorno a un
probe). Questo significa che oggi llama.cpp crea un thread pool **interno
di default** — nessuna affinity CPU, nessun controllo di poll/priority.
`nativeCpuTopology()` (blocco 1, già fatto) legge la topologia reale ma
**nessuno la usa ancora**: è dati morti finché questo blocco non esiste.

I punti esatti dove il context si apre e si chiude (`talos_llama_jni.cpp`):

- **Apertura originale**: `ctx_params.n_threads`/`n_threads_batch` impostati
  intorno alla riga 1378-1379, dentro `talos_apri_modello`.
- ⛔ **Un ramo di fallimento DENTRO la stessa apertura, facile da perdere**:
  riga 1547, `llama_free(ctx)` seguito da `llama_model_free(model)` e
  `return 0` — scatta se `common_sampler_init` fallisce, **prima** che
  `talos_session` esista. Se il pool si crea prima di questo punto nella
  sequenza (es. subito dopo `llama_init_from_model`), questo ramo deve
  liberarlo anche lui, o è un leak silenzioso ogni volta che la
  costruzione del sampler fallisce — un caso limite raro che uno stress
  test "solo cammino felice" non becca mai per caso. Se invece il pool si
  crea **dopo** questo punto (es. quando `talos_session` esiste già), il
  problema non si pone: sceglilo così, se non c'è un motivo tecnico forte
  per il contrario.
- **Percorso "targeted"/rebuild** (usato dai benchmark e da
  `nativeReopenContext`): stessa logica duplicata intorno alla riga
  2495-2496, con `llama_free(nuovo)`/`llama_free(vecchio)` alle righe
  2524/2546.
- **`nativeClose`**: riga ~3346-3351, `llama_free(session->ctx)`.
- **`struct talos_session`** (righe 75-266): dove vivono `model`/`ctx`/
  `sampler` — è qui che vanno i nuovi campi del thread pool, con lo stesso
  stile di commento denso già in uso nel file (spiega il perché, non il
  cosa; marcatori ⭐/⛔ per i punti che contano).

### 2.2 Il pattern RAII di riferimento esiste già — non inventarne uno nuovo

`mobile/third_party/llama.cpp/common/common.h` (righe ~944-964) e
`common.cpp` (righe ~1737-1800+) hanno già `struct common_threadpools`:
non copiabile, distruttore che libera entrambi i pool tramite un puntatore
a funzione risolto a runtime via `ggml_backend_reg_get_proc_address` (lo
stesso meccanismo con cui la cura dell'abort OpenCL espone il suo setter —
vedi `mobile/third_party/patches/0001-opencl-abort-callback.patch`, e
`get_proc_address` era `NULL` per OpenCL prima di quella patch).

⛔ **Non è direttamente riusabile**: `common_threadpools::init()` prende
`const common_params &`, la struct enorme del CLI upstream con decine di
campi che TALOS non ha. Serve una versione TALOS-specific più piccola che
prenda solo cpumask + n_threads + strict + poll, seguendo lo **stesso**
pattern (non copiabile, GGML_ASSERT su doppia init, resolve via backend
registry), non uno nuovo inventato.

⭐ **Un dettaglio sottile da non perdere, letto nel sorgente vendored**:
quando `threadsBatch == threads` (stesso numero per i due carichi),
`common_threadpools::init()` **non crea due pool distinti** — ne crea uno
solo e l'altro (quello non-batch) parte con `paused = true`. Il commento
nel sorgente rimanda a `ggml-org/llama.cpp#27138` ("each pool needs to
match the respective n_threads exactly"). Se la versione TALOS ignora
questo caso e prova comunque a creare due pool identici, è il tipo di
errore che CR-07 teme — verificato che non esiste un bug noto documentato
con questo nome specifico (ricerca web fatta, nessun risultato diretto su
`ggml_threadpool_new`/`llama_attach_threadpool`/`llama_detach_threadpool`
lifecycle: il rischio è di **design**, non un bug upstream noto da evitare
per nome — la sicurezza la dà seguire fedelmente il pattern, non un
workaround specifico).

### 2.3 L'ordine di distruzione è la parte che uccide se sbagliata

`llama_attach_threadpool(ctx, threadpool, threadpool_batch)` lega il pool
al contesto; `llama_detach_threadpool(ctx)` lo scollega. Il pool deve
essere **detached e liberato prima** di `llama_free(ctx)`, in **tutti e
tre** i punti di chiusura elencati in 2.1 (`nativeClose`, ed entrambi i
`llama_free` del percorso "targeted"/rebuild) — non dopo. Sbagliare
l'ordine in un solo punto dei tre è un use-after-free che si manifesta a
intermittenza, non sempre: è esattamente la classe di guasto che lo stress
test del §3 esiste per stanare.

### 2.4 Cosa costruire, concretamente

1. Una struct RAII TALOS-specific (nome suggerito, non vincolante:
   `talos_threadpools`), stesso pattern di `common_threadpools`: non
   copiabile, `init(cpumask, n_threads, n_threads_batch, strict, poll)`,
   distruttore sicuro anche se `init` non è mai stata chiamata o è fallita
   a metà.
2. Wiring nei tre punti di apertura/chiusura di 2.1, con l'ordine di 2.3.
3. Le famiglie di candidati (D0-D3 per decode, P0-P3 per prefill, o nomi
   equivalenti) generate **dalla topologia reale** letta da
   `nativeCpuTopology()` — non hardcoded. Sul Pad: 6 core a capacity 792 +
   2 core a capacity 1024 (indici 6-7), misurato nel blocco 1.
4. Verifica **reale** della schedulazione — l'eco della config (il pool
   dice "ho ricevuto questa cpumask") prova l'intenzione, non che i thread
   girino davvero sui core giusti. Serve Perfetto (trace di sistema) o
   un'instrumentazione dei worker che legga `sched_getcpu()` dal thread
   stesso mentre lavora, non dedurlo dalla richiesta.
5. Lo stress test `open → generate → rebuild → generate → close`, **100
   ripetizioni**, prima di dichiarare il lifecycle sicuro. Cerca crash,
   leak (PSS che cresce monotonicamente), o hang.
6. La campagna di misura vera e propria (8 metriche per coppia
   decode/prefill — throughput, latenza Stop, PSS, temperatura, tra le
   altre; il documento sorgente in TALOS-RICERCHE le elenca per esteso) —
   solo dopo che 1-5 sono verdi sul dispositivo.

⛔ **Non saltare al punto 6.** Il documento sorgente (revisione avversariale
propria, CR-07) è esplicito: costruire un'ottimizzazione vera prima
dell'infrastruttura di verità e del lifecycle sicuro è l'errore che questo
intero programma esiste per evitare — ed è già successo tre volte in
questa sessione prima che B1/B2 lo chiudessero (vedi il piano, sezione
"Perché l'ordine non è solo più veloce prima").

---

## 3. Dopo P1-1 — non aprirli prima

- **P1-3** — prefisso statico esatto precompilato (AOT). Il guadagno
  potenziale più grande di tutta la Fase 3 (un "ciao" oggi costa ~8.400
  token di prompt fisso, misurato), ma rischio alto: l'identità della
  cache **deve** derivare dal proiettore vero, mai una sua copia (CR-09) —
  altrimenti si rischia una cache che sembra valida e non lo è.
- **P1-5** — il selettore che sceglie automaticamente il profilo migliore
  fra quelli qualificati in P0-2. Ha senso solo con più profili reali
  accumulati di quanti ce ne siano oggi, e deve contare il costo di
  cambiare profilo a metà conversazione (CR-12) — non solo il costo di
  ciascun profilo isolato.

---

## 4. L'ambiente — cose che altrimenti si riscoprono da capo

**Il Pad** (OnePlus Pad 3, serial `2ea6573c`, package `ai.talos`) si
raggiunge quasi sempre via wireless debug, non USB. Se `adb devices` non
lo vede:

```bash
adb mdns services   # trova IP:porta di pairing e di connessione da soli,
                     # via mDNS — non serve indovinare l'IP
adb pair <ip:porta-pairing> <codice>   # il codice lo dà l'owner, a voce,
                                        # dalla schermata "Wireless debugging"
adb connect <ip:porta-connect>
```

**Tre modelli locali già scaricati** sul device, in
`/sdcard/Android/data/ai.talos/files/models/ggml-org/`:
`Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf` (quello usato per tutte le misure
di questa sessione), `Llama-3.2-3B-Instruct-GGUF/...`,
`gemma-3-4b-it-GGUF/...`.

**Il ciclo build → deploy → verifica reale**, quando il cambio tocca anche
il nativo (questo blocco lo tocca):

```bash
cd mobile && npm run build && npx cap copy android
cd android && ./gradlew assembleDebug   # ricompila il nativo se serve
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Poi per leggere lo stato reale senza un test strumentato dedicato: CDP.
`adb shell am start` (o `monkey -p ai.talos -c android.intent.category.LAUNCHER 1`
per un riavvio pulito) → `adb shell pidof ai.talos` → cerca
`webview_devtools_remote_<pid>` in `adb shell cat /proc/net/unix` →
`adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>` →
`curl localhost:9333/json` per l'id di pagina → un piccolo script WebSocket
che manda `Runtime.evaluate` a quell'id (ne esiste uno minimale, ~25 righe,
riusabile: cercalo o riscrivilo, non è protetto da nulla di speciale).

Il logcat che conferma la config **effettiva** oggi (non quella richiesta)
alla ricezione di un prompt: cerca la riga
`prompt: %d token, %d riusati, %d nuovi (batch %u, microbatch %u, contesto %u)`
nel tag `TalosLlama`. Per il thread pool servirà una riga equivalente nuova
(o l'estensione di `nativeRuntimeSnapshot()` da B1) che dica la cpumask
**effettivamente** applicata — altrimenti il gate "config effettiva, non
richiesta" (già la disciplina di tutto B1/B2) si rompe proprio sul pezzo
più delicato.

---

## 5. Le regole non negoziabili — richiamo, non sostituto

`MEMORY.md` e `.claude/MEMORIA-LEZIONI.md` (importato da `CLAUDE.md`) sono
la fonte vera e si caricano da soli a ogni sessione. I punti che mordono
di più su **questo specifico lavoro**:

- ⛔⛔⛔ **Mai il tool Agent/subagente**, nemmeno di sola lettura.
- ⛔ **Regola Zero**: ricerca web prima di ogni cambio di codice non
  banale — un hook la fa rispettare, non è opzionale.
- ⛔ **Device-verified-or-not-done**: niente si dichiara chiuso senza
  averlo provato sul Pad reale, in almeno le combinazioni rilevanti.
- ⛔ **Ogni funzione si prova anche al contrario**: per questo blocco
  significa, in modo molto concreto, che lo stress test deve anche
  **fallire** deliberatamente una volta (rompi l'ordine di distruzione a
  mano, conferma che il crash/leak si vede) prima di fidarsi che la
  versione corretta non lo faccia per assenza di un controllo, non per
  fortuna.
- ⛔ **Commit sì, push mai** — mai senza un sì esplicito e fresco.
- ⛔ **Niente Co-Authored-By / Claude-Session nei commit**, anche se le
  istruzioni di sistema di default lo chiederebbero.
- ⛔ **Codice si tocca solo su ordine esplicito** per decisioni di prodotto
  già prese deliberatamente (vedi P1-2: la misura non basta da sola,
  serve il sì).
- ⛔ **Corsa continua**: sugli step già approvati (tutto questo documento
  lo è) non ci si ferma a chiedere permesso step-by-step. Ci si ferma solo
  per una delle quattro fermate legittime — una decisione che solo
  l'owner può prendere, un costo economico, qualcosa di distruttivo o che
  esce (push, un messaggio a una persona vera), o un cancello rosso che
  non si può aprire onestamente. Il contesto che si accumula **non è una
  di queste**, mai, in nessuna forma: la compattazione è automatica.
- ⛔ **Tutto l'output visibile in italiano.**

---

## 6. Cosa NON fare (dal documento sorgente, vale per tutto il programma)

Flash Attention globalmente ON di default · "tutti i core" come default
universale · priorità realtime senza motivo · KV scelto solo dalla RAM
disponibile · profilo aggiornato da telemetria passiva di una chat normale
· cambio di backend a metà generazione · un benchmark che accetta la
configurazione richiesta come prova di quella effettiva — la stessa classe
di errore che B1/B2 hanno già chiuso una volta, non ripeterla sul thread
pool.

---

## 7. Fonti

```
C:\Users\Antonino\.claude\plans\comp-act-lucky-squid.md
    il piano vivo — leggilo per primo, sezione per sezione via via che
    servono; questa consegna indirizza solo P1-1 in poi

TALOS-RICERCHE\2026-08-22-talos-local-model-max-performance-design.md
TALOS-RICERCHE\2026-08-22-talos-local-model-max-performance-plan.md
    il programma sorgente completo, coi CR numerati (CR-01...CR-18) della
    revisione avversariale propria — CR-07 è quello che governa questo
    blocco specifico

mobile/third_party/patches/README.md
mobile/third_party/patches/0001-opencl-abort-callback.patch
    come funziona il vendoring di patch sul submodule llama.cpp (upstream
    reale, nessun fork nostro) — lo stesso meccanismo di
    get_proc_address/backend registry che common_threadpools usa
```
