package ai.talos;

/**
 * La superficie grezza verso llama.cpp. Nient'altro.
 *
 * Deliberatamente senza politiche: non decide quale backend usare, non giudica
 * una misura, non sa cosa sia una prova. Quelle regole vivono in
 * {@link TalosBackendChoice} e {@link TalosBenchmarkHarness}, dove sono
 * dimostrabili sulla JVM senza un telefono. Qui c'è solo il confine.
 *
 * I metodi sono {@code static native} e prendono un handle: un oggetto Java che
 * possiede memoria nativa invita il raccoglitore a liberarla quando gli pare, e
 * un modello da qualche gigabyte non è una cosa da liberare quando pare a
 * qualcuno.
 */
final class TalosLlamaNative {

    /** Vero se la libreria nativa è a bordo di questa build. */
    static final boolean AVAILABLE;

    static {
        boolean loaded;
        try {
            System.loadLibrary("talos_llama");
            loaded = true;
        } catch (UnsatisfiedLinkError missing) {
            // Non è un guasto da propagare: una build senza motore nativo deve
            // continuare a funzionare con i provider remoti. Chi chiede il
            // locale riceve un rifiuto onesto, non un crash all'avvio.
            loaded = false;
        }
        AVAILABLE = loaded;
    }

    private static boolean prepared;

    private TalosLlamaNative() {}

    /**
     * Dice a ggml dove Android tiene le librerie di QUESTA applicazione.
     *
     * Non è una formalità: ggml cerca i suoi backend elencando una cartella, e
     * i percorsi che deduce da solo — quello dell'eseguibile, quello corrente —
     * su Android sono `/system/bin` e `/`. Senza questa chiamata il registro
     * resta vuoto e ogni modello «non si apre», con un messaggio che manda a
     * cercare la causa altrove.
     *
     * ⛔ P0-1 — passa giù ANCHE una cartella per la cache dei binari OpenCL
     * compilati. `getCodeCacheDir()`, non `getCacheDir()`: la documentazione
     * Android la descrive esplicitamente per "codice compilato/ottimizzato
     * generato a runtime" — esattamente cosa sono questi `.clbin` — e viene
     * ripulita da sola ad ogni aggiornamento di app o piattaforma, il momento
     * in cui un pin diverso di llama.cpp potrebbe cambiare i kernel sorgente e
     * lasciare orfani i vecchi binari. Il nativo la crea se manca
     * (`cl-program-cache.cpp`, upstream); qui basta il percorso.
     */
    static synchronized void ensureReady(android.content.Context context) {
        if (prepared || !AVAILABLE) return;
        String directory = context == null ? "" : context.getApplicationInfo().nativeLibraryDir;
        String openClCacheDir = context == null ? ""
                : new java.io.File(context.getCodeCacheDir(), "ggml-opencl-cache").getAbsolutePath();
        nativeInit(directory == null ? "" : directory, openClCacheDir);
        prepared = true;
    }

    private static native void nativeInit(String nativeLibraryDir, String openClCacheDir);

    /**
     * ⛔ SOLO RICERCA — accende il trace HIT/MISS/SAVE della cache P0-1 su
     * logcat (tag TalosLlama, verificato: NON "TALOS"). Un log per kernel
     * compilato non è per la produzione. Va chiamata dopo {@link #ensureReady}
     * e prima di aprire un modello con offload: la cache legge la variabile
     * una volta sola, alla prima allocazione sul backend OpenCL.
     */
    static native void nativeEnableOpenClCacheDebugTraceForResearch();

    /**
     * ⛔ SOLO RICERCA — il CONTROLLO dell'esperimento cache: spegne
     * esplicitamente {@code GGML_OPENCL_KERNEL_CACHE_DIR} per QUESTO
     * processo, sovrascrivendo quanto {@link #ensureReady} ha già impostato.
     * Ogni kernel ricompila sempre, senza eccezioni — la controprova che i
     * guadagni misurati a cache accesa vengono davvero da lei.
     */
    static native void nativeDisableOpenClCacheForResearch();

    /**
     * ⛔ SOLO RICERCA — P2-4/CR-03: accende il log per-nodo dello scheduler
     * upstream ({@code GGML_SCHED_DEBUG}, {@code livello=2} per il dettaglio
     * completo). Legge la variabile una volta sola, alla creazione dello
     * scheduler: va chiamata prima della prima apertura di un modello in
     * questo processo.
     */
    static native void nativeSetSchedDebugForResearch(int livello);

    /** I backend ggml registrati, separati da virgola. Vuoto se nessuno. */
    static native String nativeBackends();

    /**
     * L'inventario dei backend e dei loro DISPOSITIVI, in JSON.
     *
     * ⛔ Non è una versione più bella di {@link #nativeBackends()}: risponde a
     * un'altra domanda. Quella dice quali registry si sono registrati; questa
     * dice quali dispositivi ciascuno espone, con il NOME CANONICO che serve a
     * chiederne uno per nome — e senza il nome canonico, «usa la GPU» lo decide
     * l'ordine di caricamento delle librerie, non noi.
     *
     * Forma: {@code {"registries":[{"name":"...","devices":[{"name":"...",
     * "description":"...","type":"CPU|GPU|IGPU|ACCEL|META","deviceId":null,
     * "memoryFree":0,"memoryTotal":0,"caps":{...}}]}]}}
     *
     * Diagnostico: non apre niente e non alloca niente. Si può chiamare prima
     * che un modello esista.
     */
    static native String nativeBackendInventory();

    /**
     * P1-1 — la topologia CPU VERA, letta dal processo nativo, non un nome
     * di chip scritto a mano (piano sorgente, §9.4: "Do not hardcode 'cores
     * 6 and 7 are big'").
     *
     * Forma: {@code {"cores":[{"index":0,"online":true,"capacity":446,
     * "allowed":true},...],"affinityReadable":true}}.
     *
     * ⛔ {@code capacity=-1} è "questo kernel non lo espone", non zero core.
     * {@code allowed=null} (non {@code false}) è "sched_getaffinity non ha
     * risposto per il processo intero", diverso da "questo core specifico è
     * escluso" — non confondere le due assenze.
     *
     * Diagnostico puro: non crea nessun thread pool, non tocca nessuna
     * sessione. Il lifecycle dei pool nativi (CR-07 del piano sorgente:
     * rischio reale di use-after-free/deadlock) resta un blocco separato.
     */
    static native String nativeCpuTopology();

    /**
     * ⛔⛔ SOLO RICERCA — P2-2, le feature CPU vere (NEON/dotprod/matmulInt8/
     * SVE/SME/SME2) dalle API ggml, mai dedotte dal nome del SoC. Vedi il
     * commento nel JNI per cosa NON c'è ancora (`kleidiBackendRegistered`).
     */
    static native String nativeCpuFeaturesForResearch();

    /**
     * ⛔⛔ SOLO RICERCA — P2-1 blocco A. Costruisce lo speculatore
     * {@code ngram-mod} su una sessione GIA' APERTA da {@code handle}.
     * Nessuna chiamata da {@link #nativeOpen} lo fa mai — questo metodo è
     * l'UNICA porta, e costruisce soltanto: nessun effetto sul testo che
     * quella sessione genera (il blocco B collega la decodifica vera).
     *
     * @return true se lo speculatore è pronto; false se l'handle non è
     *     valido o la costruzione nativa è fallita.
     */
    static native boolean nativeConstructSpeculatorForResearch(long handle, int nMatch, int nMax);

    /**
     * ⛔⛔ SOLO RICERCA — P2-1, decide la forma del blocco B: questo
     * contesto toglie solo un pezzo di sequenza ({@code "part"}/{@code
     * "rs"}) o solo tutta in blocco ({@code "full"}, serve la macchina di
     * checkpoint completa)? Verificato dal motore vero, mai assunto.
     *
     * ⛔⛔⛔ Effetto collaterale reale: la sonda upstream SVUOTA la memoria
     * del contesto. Chiamare solo su una sessione appena aperta, mai su
     * una con una conversazione vera in corso.
     *
     * @return {@code "no"}/{@code "part"}/{@code "full"}/{@code "rs"}, o
     *     stringa vuota se l'handle non è valido.
     */
    static native String nativeContextSeqRmCapabilityForResearch(long handle);

    /**
     * ⛔⛔ SOLO RICERCA — la famiglia di affinity CPU per la PROSSIMA apertura
     * o ricostruzione di contesto. Valori: {@code 0} DEFAULT (nessuna
     * maschera, il comportamento di produzione), {@code 1} tutti i core
     * consentiti, {@code 2} solo i core forti, {@code 3} solo i deboli,
     * {@code 4} tutti tranne il più debole — tradotti in una cpumask vera
     * dalla topologia letta ADESSO, mai una lista scritta a mano.
     *
     * ⛔ Non tocca un contesto già aperto: serve rifarlo (stesso vincolo di
     * {@code microBatch}). Zero effetto su un'apertura normale che non
     * chiama mai questo metodo.
     */
    static native void nativeSetAffinityFamilyForResearch(int famigliaDecode, int famigliaPrefill);

    /**
     * ⛔ SOLO RICERCA — PERCHE' un backend manca dall'inventario.
     *
     * MISURATO il 2026-08-20: con {@code libggml-opencl.so} da 3.198.104 byte
     * presente nella cartella nativa, il registro ne conteneva **uno solo**, e
     * nessuna riga diceva perche'. La causa sta nella sorgente che spediamo:
     * {@code ggml_backend_load_all_from_path} usa {@code silent = true} quando
     * {@code NDEBUG} e' definito — e la nostra build e' Release. ⇒ Ogni
     * fallimento di caricamento e' muto per costruzione.
     *
     * Questa sonda ripercorre la stessa cartella con la strada NON muta e dice,
     * libreria per libreria, se e' entrata. Il motivo lo stampa ggml accanto,
     * su logcat.
     *
     * ⛔ Non e' un doppione di {@link #nativeBackendInventory()}: quello dice
     * CHI c'e', questa perche' qualcuno MANCA.
     */
    static native String nativeProbeBackendLoad(String libraryDir);

    /**
     * La build di llama.cpp, tipo {@code "b10218-<commit>"}.
     *
     * ⛔ Serve all'impronta dei prefissi congelati: cio' che invalida uno stato
     * salvato e' la versione del MOTORE, non quella dell'app. Usare la build
     * dell'app buttava via un gigabyte di lavoro a ogni aggiornamento.
     */
    static native String nativeEngineBuild();

    /**
     * @param gpuLayers quanti strati spingere sulla GPU. 0 = tutto su CPU, che
     *     è il pavimento contro cui ogni altro backend viene misurato.
     * @param deterministic vero solo per MISURARE. La prova di un backend è che
     *     produca lo stesso testo della CPU, quindi il banco chiede l'argmax;
     *     una chat no, e per mesi se l'è preso lo stesso — da lì i token di
     *     altre lingue infilati a metà parola. Il predefinito è la chat, perché
     *     un banco che sbaglia si vede subito nei nostri numeri mentre una chat
     *     che sbaglia si vede solo sul telefono di chi la usa.
     * @return l'handle, oppure 0 se il modello non si è aperto.
     */
    /**
     * @param threadsBatch i thread del PREFILL, che è un carico diverso dalla
     *     generazione: macina matrici e si spalma sui core, mentre generare un
     *     token per volta è legato alla banda di memoria. Erano lo stesso
     *     numero. 0 = usa {@code threads}, che è il comportamento di prima.
     * @param microBatch il batch fisico. Grande fa correre il prefill e gonfia
     *     i buffer; piccolo tiene bassa la memoria e rende Stop più pronto,
     *     perché l'attesa massima per fermarsi è un microbatch intero.
     */
    /**
     * @param kvType {@code "q8_0"} per la cache delle chiavi più leggera, che
     *     su un contesto lungo libera quasi metà della memoria che serve — o
     *     qualunque altra cosa per la f16. ⛔ Chiedere non è ottenere: se il
     *     modello non la regge il contesto si crea in f16 e
     *     {@link #nativeKvCacheType} dice quale ha vinto.
     */
    static native long nativeOpen(String modelPath, int threads, int contextTokens, int gpuLayers,
                                  boolean deterministic, int threadsBatch, int microBatch,
                                  String kvType);

    /**
     * ⛔ SOLO RICERCA — l'apertura che dice DOVE, non solo quanto.
     *
     * {@code gpuLayers} dice quanti strati spostare, non su quale acceleratore.
     * Con OpenCL e Vulkan caricati insieme «la GPU» sarebbe quella che il
     * registry elenca per prima, cioè quella scelta dall'ordine di caricamento
     * delle librerie: un benchmark nato così misura un backend che nessuno ha
     * scelto.
     *
     * ⛔ Non esiste «prendi la prima GPU». O si nomina il dispositivo, o si
     * nomina un registry che ne espone **uno solo**; un registry con due
     * dispositivi e nessun nome fallisce ELENCANDOLI.
     *
     * ⛔ Non la chiama la produzione, e non deve: {@link #nativeOpen} resta la
     * strada dell'app e passa richieste vuote.
     *
     * @param backendName vuoto = come oggi · {@code "none"}/{@code "cpu"} =
     *     nessun offload, detto esplicitamente · altrimenti il nome di un
     *     registry, per esempio {@code "OpenCL"}. I nomi li elenca
     *     {@link #nativeBackendInventory()}.
     * @param deviceName il nome canonico ESATTO del dispositivo, oppure vuoto.
     * @param flashAttentionMode {@code "default"}, {@code "off"},
     *     {@code "auto"} oppure {@code "on"}. ⛔ Una richiesta esplicita vince
     *     sulla {@code AUTO} che la cache q8_0 imposterebbe: è l'unico modo di
     *     misurare i tre casi separati, e upstream dice a chiare lettere che la
     *     Flash Attention non migliora sempre OpenCL.
     * @return l'handle, o 0. In caso di 0, {@link #nativeLastOpenError()} vale
     *     {@code "backend-target"} se il bersaglio non si è risolto e
     *     {@code "flash-attn-mode"} se la parola non era una delle quattro.
     */
    static native long nativeOpenTargeted(String modelPath, int threads, int contextTokens,
                                          int gpuLayers, boolean deterministic, int threadsBatch,
                                          int microBatch, String kvType, String backendName,
                                          String deviceName, String flashAttentionMode);

    /** La cache creata DAVVERO: {@code "q8_0"} oppure {@code "f16"}. */
    static native String nativeKvCacheType(long handle);

    /**
     * B1 — un'unica snapshot versionata di ciò che il motore ha DAVVERO
     * applicato, invece di un metodo nativo per ogni campo (il piano
     * sorgente del programma MAX PERFORMANCE lo chiede esplicitamente).
     *
     * Forma: {@code {"schema":1,"backendDevice":string|null,
     * "gpuLayersEffective":int,"flashAttnEffective":string,
     * "kvCacheType":string,"contextTokens":int,"threads":int,
     * "threadsBatch":int,"microBatch":int}}.
     *
     * ⛔ {@code gpuLayersEffective} NON è un conteggio per-strato reale
     * dell'offload (quello richiede instrumentation del graph placement di
     * ggml, non ancora scritta) - è la richiesta, ma SOLO se un
     * dispositivo acceleratore è stato davvero risolto all'apertura. Zero
     * altrimenti, anche con un {@code gpuLayers} richiesto diverso da
     * zero: il caso che oggi il codice nasconde in silenzio.
     *
     * @return {@code null} se l'handle non è valido o il contesto non è
     *     (più) aperto.
     */
    static native String nativeRuntimeSnapshot(long handle);

    /**
     * ⛔ SOLO RICERCA — la grammatica dell'ultimo template applicato, in JSON.
     *
     * ⛔⛔ Perché esiste: i due difetti aperti della grammatica vivevano solo
     * in logcat. La GBNF da 55.871 byte rifiutata dal parser, e la grammatica
     * **pigra con un innesco solo** che non si accende mai — «Grammar still
     * awaiting trigger» per tutta la generazione. Un numero leggibile solo
     * mentre succede non è una misura: non entra in un artifact, non si
     * confronta con quello di ieri, e non può diventare il rosso di una cura.
     *
     * Forma: {@code {"grammarBytes":0,"grammarEmpty":true,"grammarLazy":false,
     * "triggers":[{"type":0,"value":"…"}],"triggerCount":0,
     * "preservedTokensRequested":0,"preservedTokensAtomic":0,
     * "preservedTokensDropped":[],"compiles":true,"compileError":null,
     * "grammarHead":"…"}}
     *
     * ⛔ {@code compiles} è PROVATO, non previsto: costruisce un campionatore di
     * prova e lo libera subito. La sessione non viene toccata — una domanda che
     * cambia la risposta non è una diagnosi.
     *
     * @return {@code null} se nessun template è ancora stato applicato: la
     *     grammatica nasce lì, e prima non c'è una domanda da fare.
     */
    static native String nativeGrammarDiagnostics(long handle);

    /**
     * Quante volte un modello e' stato aperto da quando il processo e' partito.
     *
     * Diagnostico: un invio che ne conta due sta ricaricando gigabyte di pesi
     * gia' in memoria, ed e' cio' che ha reso il primo messaggio cento volte
     * piu' lento dei successivi.
     */
    static native int nativeOpensSinceStart();

    /**
     * {@code [threads, threadsBatch, microBatch]} del contesto aperto, o
     * {@code null}. Chiesti al contesto: fra cio' che si chiede e cio' che si
     * ottiene c'e' un ripiego possibile.
     */
    static native long[] nativeRuntimeConfig(long handle);

    /**
     * Rifa' il CONTESTO tenendo il modello in memoria.
     *
     * ⛔ Allargare il contesto non richiede rileggere gigabyte dal disco: i pesi
     * e la cache sono due cose separate, ed erano i nostri `open()` a liberarle
     * insieme. MISURATO: il primo messaggio costava 111 secondi perche' il
     * modello veniva aperto due volte.
     *
     * @return il contesto ottenuto, o 0 se la ricostruzione e' fallita — nel
     *     qual caso la sessione resta senza contesto e va riaperta tutta.
     */
    static native int nativeReopenContext(long handle, int threads, int contextTokens,
                                          int threadsBatch, int microBatch,
                                          String kvType, boolean deterministic);

    /** Quante volte il contesto e' stato rifatto senza ricaricare il modello. */
    static native int nativeContextRebuilds();

    /**
     * ⭐ IL PREFISSO CONGELATO — scrive su disco la cache di cio' che il
     * contesto ha gia' letto, insieme ai token che l'hanno prodotta.
     *
     * ## Perche' esiste
     *
     * MISURATO il 2026-08-07 sul Pad: per rispondere «ciao» mandiamo **8.410
     * token**, di cui circa 8.250 sono i trentotto schemi dei tool. Calcolarli
     * costa **150 secondi** — l'88% dell'attesa — e sono **identici in ogni
     * conversazione**: stesso modello, stessi tool, stesso testo, ricalcolato
     * da zero ogni volta come se fosse informazione nuova.
     *
     * Si calcolano una volta, si salvano, e ogni chat nuova li **rilegge**.
     * Centocinquanta secondi diventano la lettura di un file.
     *
     * ⛔ Non e' una potatura: al modello arrivano tutti e trentotto gli
     * strumenti, esattamente come prima. Cambia solo chi paga, e quante volte.
     *
     * ## Perche' salva anche i TOKEN
     *
     * `llama_state_seq_save_file` scrive i token accanto alla cache, ed e'
     * esattamente cio' che serve a `session->cached`: al ritorno il prefisso
     * comune di 8A funziona da subito, senza un secondo file da tenere in
     * sincronia — e due file che possono divergere sono un difetto in attesa.
     *
     * @return i byte scritti, 0 se non ha potuto.
     */
    static native long nativeSaveState(long handle, String path);

    /**
     * ⭐⭐ Tiene i primi {@code quanti} token e salva SOLO quelli.
     *
     * Il prefisso da congelare e' un PREFISSO di cio' che la cache contiene
     * gia' dopo il primo messaggio: potarlo e salvarlo costa **zero calcolo**,
     * mentre un riscaldamento a parte lo rifarebbe da capo — altri 150 secondi
     * e un altro gigabyte letto dal disco.
     *
     * ⛔ Il prezzo: dopo la potatura il messaggio SUCCESSIVO di questa stessa
     * chat riprocessa i suoi turni. Qualche centinaio di token contro gli
     * ottomila risparmiati a ogni chat nuova — conviene, ma e' un baratto.
     * Si chiama a risposta CONSEGNATA, mai prima.
     *
     * @return i byte scritti, 0 se non ha potuto.
     */
    static native long nativeTrimAndSaveState(long handle, String path, String prefisso);

    /**
     * Rilegge un prefisso congelato dentro il contesto aperto.
     *
     * ⛔ Chi chiama DEVE aver gia' verificato che il file appartenga a questo
     * modello e a questi parametri. Qui non si puo' controllare: il formato di
     * llama.cpp non porta l'impronta del nostro prompt, e uno stato caricato
     * su un modello diverso non da' errore — da' risposte sbagliate, che e'
     * il modo peggiore di fallire.
     *
     * @return quanti token sono stati ripristinati, 0 se non ha potuto.
     */
    static native int nativeLoadState(long handle, String path);

    /**
     * Quanti token servono per questa conversazione — chiesto PRIMA di caricare
     * i pesi, con {@code vocab_only}.
     *
     * ⛔ Spezza il cerchio che costava una doppia apertura: il contesto giusto
     * si conosce solo dopo aver applicato il template, e applicarlo richiedeva
     * un modello aperto. Il vocabolario da solo basta, e sono megabyte invece
     * di gigabyte.
     *
     * @return JSON {@code {promptTokens, trainedContext}}, oppure null.
     */
    static native String nativePlanPrompt(String modelPath, String messagesJson,
                                          String toolsJson, boolean pensa);

    /**
     * Capability del Jinja incorporato nel GGUF, lette con un'apertura
     * vocab-only. Il JSON contiene solo booleani, mai il template sorgente.
     */
    static native String nativeTemplateCapabilities(String modelPath);

    /**
     * L'architettura dichiarata dal file e quanti strati ha, in JSON — oppure
     * {@code null} se non è nemmeno un GGUF leggibile.
     *
     * Legge SOLO i metadati: nessun tensore entra in memoria. Serve a
     * distinguere un modello di linguaggio da un proiettore multimodale, che è
     * un GGUF valido con cui però non si può parlare.
     */
    static native String nativeArchitectureOf(String modelPath);

    /**
     * Prova i candidati sul contesto aperto e dice quali hanno vinto, in JSON.
     *
     * ⛔ Azzera la conversazione in memoria: è un banco di prova, e come ogni
     * banco parte da zero. Si tara PRIMA di parlare, non in mezzo a una chat.
     */
    static native String nativeTuneThreads(long handle, int[] candidates, int probeTokens);

    /** Stable failure stage from the immediately preceding open on this thread. */
    static native String nativeLastOpenError();

    /** Token prodotti finora. Interrogabile da un altro thread durante la generazione. */
    static native int nativeTokensProduced(long handle);

    /**
     * Il testo prodotto finora, interrogabile mentre la generazione è in corso.
     *
     * È il gemello del contatore qui sopra, e la ragione è la stessa: chi
     * guarda interroga. Il contatore serve a MISURARE, questo a MOSTRARE — una
     * chat che scrive la risposta solo quando è finita non è una chat, è
     * un'attesa con un risultato in fondo.
     */
    static native String nativeTextSoFar(long handle);

    /**
     * ⭐ Solo i byte MAI restituiti prima — il delta vero, per lo streaming.
     *
     * {@code nativeTextSoFar} copia tutta la risposta a ogni sguardo, e su una
     * risposta lunga i byte attraversati crescono col quadrato. Questa torna solo
     * la coda nuova, tagliata all'ultimo carattere UTF-8 completo, e avanza un
     * puntatore nel nativo: il totale copiato torna lineare.
     */
    static native String nativeDrainText(long handle);

    /**
     * Formatta una conversazione col template che il GGUF si porta dentro.
     *
     * Stringa vuota se il file non ne dichiara uno. È un esito, non un guasto
     * da nascondere: comporre un formato «ragionevole» a mano è ciò che rende
     * un modello locale apparentemente scadente.
     */
    static native String nativeApplyChatTemplate(long handle, String messagesJson,
                                                 String toolsJson, boolean pensa);

    /**
     * Separa il ragionamento dal contenuto, secondo il formato del modello.
     *
     * JSON: `{"content": "...", "reasoning": "..."}`. Attraversare JNI una volta
     * con un oggetto costa meno che tre volte con tre stringhe, e il prossimo
     * passo — le chiamate ai tool — si aggiunge qui senza cambiare la firma.
     */
    static native String nativeParseReply(long handle, String reply);

    static native void nativeCancel(long handle);

    static native int nativeContextTokens(long handle);

    /**
     * La forma del modello aperto, dichiarata da lui:
     * {@code [layers, kvHeads, headDim, trainedContext, weightBytes]}.
     *
     * Serve a calcolare quanto contesto QUESTO telefono può onestamente dare a
     * QUESTO modello, invece del tetto scritto a mano che valeva per tutti. Il
     * calcolo non è qui: sta in {@code fit.ts}, dove regge già la scheda di
     * capienza, e averne una copia in Java vorrebbe dire due risposte alla
     * stessa domanda.
     *
     * {@code null} quando non c'è nessun modello aperto — «non lo so», che non è
     * un tetto di zero.
     */
    static native long[] nativeModelShape(long handle);

    /** Token count produced by the model tokenizer with the generation flags. */
    static native int nativePromptTokens(long handle, String prompt);

    /**
     * Il testo generato, oppure {@code null} se la generazione è fallita.
     *
     * @param stopAtEndOfGeneration vero in chat, dove il token di fine è
     *     sacro; falso durante una misura, dove fermarsi quando il modello ha
     *     finito significherebbe misurare quanto è loquace invece di quanto è
     *     veloce il telefono.
     * @param reusePrefix vero in chat: il contesto tiene ciò che ha già letto e
     *     rielabora solo i token aggiunti. Falso durante una misura, dove due
     *     giri con stati diversi non sono confrontabili — e una misura non
     *     confrontabile non è una misura.
     */
    static native String nativeGenerate(long handle, String prompt, int maxTokens,
                                        boolean stopAtEndOfGeneration, boolean reusePrefix);

    /**
     * Gli stadi dell'ultima generazione, in JSON: quale dei cinque si è preso
     * il tempo. Vale {@code null} se la sessione non esiste più.
     */
    static native String nativeLastTimings(long handle);

    static native void nativeClose(long handle);
}
