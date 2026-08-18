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
     */
    static synchronized void ensureReady(android.content.Context context) {
        if (prepared || !AVAILABLE) return;
        String directory = context == null ? "" : context.getApplicationInfo().nativeLibraryDir;
        nativeInit(directory == null ? "" : directory);
        prepared = true;
    }

    private static native void nativeInit(String nativeLibraryDir);

    /** I backend ggml registrati, separati da virgola. Vuoto se nessuno. */
    static native String nativeBackends();

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

    /** La cache creata DAVVERO: {@code "q8_0"} oppure {@code "f16"}. */
    static native String nativeKvCacheType(long handle);

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
    static native String nativePlanPrompt(String modelPath, String[] roles, String[] contents,
                                          String toolsJson, boolean pensa);

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
    static native String nativeApplyChatTemplate(long handle, String[] roles, String[] contents,
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
