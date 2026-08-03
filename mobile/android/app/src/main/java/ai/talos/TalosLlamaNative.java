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
    static native long nativeOpen(String modelPath, int threads, int contextTokens, int gpuLayers,
                                  boolean deterministic);

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
     * Formatta una conversazione col template che il GGUF si porta dentro.
     *
     * Stringa vuota se il file non ne dichiara uno. È un esito, non un guasto
     * da nascondere: comporre un formato «ragionevole» a mano è ciò che rende
     * un modello locale apparentemente scadente.
     */
    static native String nativeApplyChatTemplate(long handle, String[] roles, String[] contents);

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
     * Il testo generato, oppure {@code null} se la generazione è fallita.
     *
     * @param stopAtEndOfGeneration vero in chat, dove il token di fine è
     *     sacro; falso durante una misura, dove fermarsi quando il modello ha
     *     finito significherebbe misurare quanto è loquace invece di quanto è
     *     veloce il telefono.
     */
    static native String nativeGenerate(long handle, String prompt, int maxTokens,
                                        boolean stopAtEndOfGeneration);

    static native void nativeClose(long handle);
}
