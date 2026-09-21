package ai.talos;

import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * La metà che ESEGUE.
 *
 * {@link TalosBackendChoice} decide quale motore ha il diritto di girare e
 * {@link TalosBenchmarkHarness} decide cosa conta come misura; entrambe erano
 * scritte e provate prima che esistesse una riga di codice nativo, apposta —
 * sono le regole a cui questo strato deve obbedire, non il contrario. Qui la
 * generazione avviene davvero, e mentre avviene si misura.
 *
 * Il campionamento è su un thread separato che INTERROGA un contatore atomico,
 * non su una callback per token: la finestra di misura e la temperatura vanno
 * prese nello stesso istante, ed è la forma che l'harness pretende.
 */
public final class TalosLlamaEngine implements AutoCloseable {

    public enum FailureStage {
        PATH("path"),
        MODEL_LOAD("model-load"),
        CONTEXT("context"),
        SAMPLER("sampler"),
        TEMPLATE("template"),
        GENERATION("generation"),
        UNKNOWN("unknown");

        private final String wire;

        FailureStage(String wire) {
            this.wire = wire;
        }

        String wireValue() {
            return wire;
        }

        static FailureStage fromWire(String wire) {
            if (wire == null) return UNKNOWN;
            for (FailureStage stage : values()) {
                if (stage.wire.equals(wire)) return stage;
            }
            return UNKNOWN;
        }
    }

    public static final class OpenAttempt {
        private final TalosLlamaEngine engine;
        private final FailureStage failureStage;

        private OpenAttempt(TalosLlamaEngine engine, FailureStage failureStage) {
            this.engine = engine;
            this.failureStage = failureStage;
        }

        static OpenAttempt success(TalosLlamaEngine engine) {
            return new OpenAttempt(engine, null);
        }

        static OpenAttempt failure(FailureStage stage) {
            return new OpenAttempt(null, stage == null ? FailureStage.UNKNOWN : stage);
        }

        public TalosLlamaEngine engine() {
            return engine;
        }

        public FailureStage failureStage() {
            return failureStage;
        }
    }

    /** Ogni mezzo secondo: sotto il massimo intervallo che l'harness accetta (1,5 s). */
    static final long SAMPLE_INTERVAL_MS = 500L;

    /** Oltre questo la prova si interrompe: un telefono non ci mette due minuti. */
    static final long RUN_TIMEOUT_MS = 120_000L;

    /**
     * Quanto deve durare una generazione prima che valga la pena giudicarla.
     *
     * Serve perché il numero di token NON è una durata. Un modello da 135
     * milioni di parametri su un telefono di punta produce novantasei token in
     * poco più di un secondo, e l'harness — giustamente — rifiuta un secondo
     * come misura: sotto i due secondi non c'è un ritmo, c'è rumore travestito.
     * Chiedere «più token» risolverebbe su QUESTO telefono e romperebbe su uno
     * lento, dove gli stessi token costano un minuto.
     *
     * Quindi la prova non si ferma a un conteggio ma a un tempo, e il conteggio
     * è solo il tetto. Su un telefono veloce si ferma presto con molti token, su
     * uno lento con pochi: in entrambi i casi ha misurato la stessa finestra.
     */
    static final long MEASURE_FLOOR_MS = 4_000L;

    /** Da dove viene la temperatura. Iniettabile, così la prova non pretende Android. */
    public interface ThermalSource {
        String now();
    }

    /** Un'esecuzione: il testo prodotto e le finestre con cui è stata misurata. */
    public static final class Run {
        public final String text;
        public final TalosBenchmarkHarness.Sample[] samples;
        /**
         * Dalla chiamata al PRIMO token, in millisecondi — quello che una
         * persona aspetta prima della prima parola. È già misurato qui sotto
         * per aprire la prima finestra di decodifica al momento giusto; questo
         * campo lo fa uscire, perché {@link TalosBackendChoice} decide su
         * questo, non sulla velocità di decodifica.
         */
        public final long ttftMs;

        Run(String text, TalosBenchmarkHarness.Sample[] samples, long ttftMs) {
            this.text = text;
            this.samples = samples;
            this.ttftMs = ttftMs;
        }
    }

    private final long handle;
    private boolean closed;

    /**
     * ⛔⛔⛔ IL THREAD CHE POSSIEDE QUESTO MOTORE.
     *
     * Il C++ tiene un talos_session* dietro un jlong: un puntatore grezzo, senza
     * conteggio di riferimenti e senza serratura sul campionatore. Due thread che
     * entrano insieme possono liberarlo da una parte e dereferenziarlo dall'altra —
     * che non è una race di valore: è un USE-AFTER-FREE.
     *
     * Nel plugin quasi tutto passa da un executor a thread singolo, cioè un attore.
     * Ma «quasi» non è una garanzia: bastava una entrypoint servita dal thread del
     * plugin per rompere l'invariante, e ce n'era una — chatPrompt, che arriva fino
     * a common_sampler_free().
     *
     * ⇒ L'invariante smette di essere una convenzione e diventa un controllo: il
     * proprietario è IL THREAD CHE HA APERTO IL MOTORE, chiunque sia. In produzione
     * è il worker, in un test è il thread del test. Non c'è niente da configurare, e
     * chi sgarra lo scopre alla prima chiamata invece che dentro un crash nativo
     * senza stack leggibile.
     *
     * ⛔ Le vedette sono ESCLUSE apposta — textSoFar, tokensProduced, cancel,
     * lastTimings. Il loro mestiere è chiedere «a che punto sei?» MENTRE l'attore
     * genera: obbligarle a passare dall'attore le farebbe aspettare la fine, cioè
     * risponderebbero sempre alla domanda sbagliata. Toccano solo atomici e mutex
     * loro, e per questo possono.
     */
    private final Thread attore;

    private TalosLlamaEngine(long handle) {
        this.handle = handle;
        this.attore = Thread.currentThread();
    }

    /**
     * ⛔ Lancia invece di tornare un errore: un'invariante di memoria violata non
     * è una condizione da gestire. Un'eccezione con due nomi di thread dentro dice
     * esattamente chi ha sbagliato; un use-after-free dice «SIGSEGV» e basta.
     */
    private void soloAttore(String cosa) {
        Thread ora = Thread.currentThread();
        if (ora == attore) return;
        throw new IllegalStateException(
            "TALOS_LLAMA_FUORI_DALL_ATTORE: " + cosa + " chiamata dal thread \"" + ora.getName()
            + "\", ma il motore appartiene a \"" + attore.getName() + "\"");
    }
    /**
     * ⛔⛔⛔ E LA SESSIONE DEV'ESSERE ANCORA VIVA.
     *
     * `closed` esisteva già, ma lo leggeva solo `close()` per non chiudere due
     * volte. Nessun altro metodo lo guardava: dopo `close()`, `chatPrompt()`
     * passava lo stesso `handle` al C++ — dove è un talos_session* già distrutto.
     *
     * ⇒ Questo use-after-free non ha bisogno di due thread né di una finestra
     * temporale: basta l'ordine sbagliato delle chiamate, e succede sempre.
     * Era più facile da innescare della race che stavo chiudendo.
     *
     * ⛔ `close()` NON passa di qui, e non è una dimenticanza: chiudere due
     * volte deve restare innocuo, altrimenti un try-with-resources attorno a un
     * `close()` esplicito diventerebbe un'eccezione.
     */
    private void vivo(String cosa) {
        soloAttore(cosa);
        if (closed) {
            throw new IllegalStateException(
                "TALOS_LLAMA_SESSIONE_CHIUSA: " + cosa + " dopo close(); il modello va riaperto");
        }
    }

    /**
     * I backend ggml registrati, o vuoto se la libreria non è a bordo.
     *
     * Vuole il Context perché è da lì che si ricava dove Android tiene le
     * librerie native dell'app — la sola cartella in cui ggml può trovarli.
     */
    public static String backends(android.content.Context context) {
        if (!TalosLlamaNative.AVAILABLE) return "";
        TalosLlamaNative.ensureReady(context);
        return TalosLlamaNative.nativeBackends();
    }

    /**
     * Apre un modello, oppure restituisce null.
     *
     * Null e non un'eccezione: un modello che non si apre è un esito previsto —
     * il file è troncato, la memoria non basta, la quantizzazione non è
     * supportata — e la schermata deve poterlo dire invece di morire.
     */
    public static TalosLlamaEngine open(android.content.Context context, String modelPath,
                                        int threads, int contextTokens, int gpuLayers) {
        return open(context, modelPath, threads, contextTokens, gpuLayers, false);
    }

    /**
     * Come sopra, ma dicendo se serve l'argmax.
     *
     * `deterministic` esiste per il banco di prova: confrontare due backend
     * vuol dire pretendere LO STESSO testo, e un campionamento con temperatura
     * farebbe divergere due esecuzioni entrambe corrette. La chat vuole il
     * contrario, e per mesi ha avuto l'argmax perché il requisito della misura
     * era finito nel percorso di tutti.
     */
    public static TalosLlamaEngine open(android.content.Context context, String modelPath,
                                        int threads, int contextTokens, int gpuLayers,
                                        boolean deterministic) {
        return tryOpen(context, modelPath, threads, contextTokens, gpuLayers, deterministic).engine();
    }

    /**
     * Il vecchio contratto: prefill e generazione con lo STESSO numero di
     * thread, e nessun microbatch dichiarato. Resta perché il banco di prova lo
     * usa e vuole misurare esattamente quella configurazione; per la chat, che
     * i due numeri vuole diversi, c'è la forma sotto.
     */
    public static OpenAttempt tryOpen(android.content.Context context, String modelPath,
                                      int threads, int contextTokens, int gpuLayers,
                                      boolean deterministic) {
        return tryOpen(context, modelPath, threads, contextTokens, gpuLayers, deterministic, 0, 0);
    }

    /** Opens a model while preserving the native stage when construction fails. */
    public static OpenAttempt tryOpen(android.content.Context context, String modelPath,
                                      int threads, int contextTokens, int gpuLayers,
                                      boolean deterministic, int threadsBatch, int microBatch) {
        return tryOpen(context, modelPath, threads, contextTokens, gpuLayers, deterministic,
                       threadsBatch, microBatch, "f16");
    }

    /** Opens a model while preserving the native stage when construction fails. */
    public static OpenAttempt tryOpen(android.content.Context context, String modelPath,
                                      int threads, int contextTokens, int gpuLayers,
                                      boolean deterministic, int threadsBatch, int microBatch,
                                      String kvType) {
        if (!TalosLlamaNative.AVAILABLE) return OpenAttempt.failure(FailureStage.UNKNOWN);
        TalosLlamaNative.ensureReady(context);
        long handle = TalosLlamaNative.nativeOpen(modelPath, threads, contextTokens, gpuLayers,
                                                  deterministic, threadsBatch, microBatch, kvType);
        if (handle == 0) {
            return OpenAttempt.failure(FailureStage.fromWire(TalosLlamaNative.nativeLastOpenError()));
        }
        return OpenAttempt.success(new TalosLlamaEngine(handle));
    }

    /** La cache creata davvero — {@code "q8_0"} o {@code "f16"} —, non quella chiesta. */
    public String kvCacheType() {
        vivo("kvCacheType");
        String type = TalosLlamaNative.nativeKvCacheType(handle);
        return type == null ? "f16" : type;
    }

    /**
     * B1 — la snapshot unica di configurazione effettiva, in JSON grezzo.
     * Vedi {@link TalosLlamaNative#nativeRuntimeSnapshot} per la forma.
     *
     * @return {@code null} se il contesto non è (più) aperto.
     */
    public String runtimeSnapshot() {
        vivo("runtimeSnapshot");
        return TalosLlamaNative.nativeRuntimeSnapshot(handle);
    }

    /**
     * Congela su disco il prefisso già calcolato, coi suoi token.
     *
     * @return i byte scritti, 0 se non c'era niente da salvare o la scrittura
     *     è fallita. Entrambi i casi si trattano allo stesso modo — la volta
     *     dopo si ricalcola — quindi non serve distinguerli qui.
     */
    public long saveState(String path) {
        vivo("saveState");
        return TalosLlamaNative.nativeSaveState(handle, path);
    }

    /**
     * Pota la cache ai primi {@code quanti} token e salva solo quelli.
     *
     * Costa zero calcolo: il prefisso è già in cache dopo il primo messaggio.
     * In cambio, il turno successivo di QUESTA chat riprocessa i suoi token.
     */
    public long trimAndSaveState(String path, String prefisso) {
        vivo("trimAndSaveState");
        return TalosLlamaNative.nativeTrimAndSaveState(handle, path, prefisso);
    }

    /**
     * Rilegge un prefisso congelato.
     *
     * ⛔ Chi chiama ha già verificato che il file appartenga a QUESTO modello
     * con QUESTI parametri: qui non è verificabile, e uno stato sbagliato non
     * dà errore — dà risposte sbagliate.
     *
     * @return quanti token sono tornati, 0 se il file non c'era o non
     *     combaciava — la condizione normale la prima volta.
     */
    public int loadState(String path) {
        vivo("loadState");
        return TalosLlamaNative.nativeLoadState(handle, path);
    }

    /**
     * Se questo file è un modello con cui si può PARLARE.
     *
     * Statico e senza aprire niente: legge i metadati del GGUF e chiede se
     * dichiara degli strati. Un proiettore multimodale è un GGUF valido — e
     * non genera un token.
     *
     * ⛔ Nel dubbio dice **sì**. Un modello vero nascosto è un danno che
     * l'utente non può riparare; un file che non parla lo dirà aprendosi, con
     * un errore che almeno si legge.
     */
    /**
     * Quanti token servono per questa conversazione, SENZA caricare i pesi.
     *
     * Statico e senza sessione: usa `vocab_only`, quindi entra in memoria il
     * vocabolario e nient'altro. Serve a decidere il contesto PRIMA di aprire,
     * invece di aprire due volte.
     */
    public static String planPrompt(String modelPath, String[] roles, String[] contents,
                                    String toolsJson, boolean pensa) {
        String messagesJson = messagesJson(roles, contents);
        return messagesJson == null
                ? null
                : planPrompt(modelPath, messagesJson, toolsJson, pensa);
    }

    /** Full OpenAI-compatible messages, including tool calls and results. */
    public static String planPrompt(String modelPath, String messagesJson,
                                    String toolsJson, boolean pensa) {
        return TalosLlamaNative.AVAILABLE
                ? TalosLlamaNative.nativePlanPrompt(modelPath, messagesJson, toolsJson, pensa)
                : null;
    }

    /**
     * Capability misurate dal template che il GGUF porta davvero. Nessun
     * chiamante deve dedurle dal nome della famiglia: due quantizzazioni della
     * stessa base possono avere template diversi.
     */
    public static String templateCapabilities(String modelPath) {
        return TalosLlamaNative.AVAILABLE
                ? TalosLlamaNative.nativeTemplateCapabilities(modelPath)
                : null;
    }

    /** Compatibility projection for native/instrumentation callers without tools. */
    private static String messagesJson(String[] roles, String[] contents) {
        if (roles == null || contents == null || roles.length != contents.length || roles.length == 0) {
            return null;
        }
        try {
            JSONArray messages = new JSONArray();
            for (int index = 0; index < roles.length; index += 1) {
                JSONObject message = new JSONObject();
                message.put("role", roles[index]);
                message.put("content", contents[index]);
                messages.put(message);
            }
            return messages.toString();
        } catch (JSONException malformed) {
            return null;
        }
    }

    public static boolean isConversational(String modelPath) {
        String json = TalosLlamaNative.AVAILABLE
                ? TalosLlamaNative.nativeArchitectureOf(modelPath)
                : null;
        if (json == null) return true;
        try {
            JSONObject read = new JSONObject(json);
            return read.optInt("layers", 0) > 0;
        } catch (JSONException unreadable) {
            return true;
        }
    }

    /**
     * Rifa' il contesto tenendo il modello in memoria.
     *
     * @return il contesto ottenuto, o 0 se e' fallita — e allora questo motore
     *     non e' piu' utilizzabile e va chiuso e riaperto.
     */
    public int reopenContext(int threads, int contextTokens, int threadsBatch,
                             int microBatch, String kvType, boolean deterministic) {
        return TalosLlamaNative.nativeReopenContext(
                handle, threads, contextTokens, threadsBatch, microBatch, kvType, deterministic);
    }

    /**
     * I numeri di esecuzione VERI: thread di generazione, thread di prefill,
     * microbatch. Chiesti al contesto, non ripetuti dalla richiesta.
     */
    public long[] runtimeConfig() {
        vivo("runtimeConfig");
        return TalosLlamaNative.nativeRuntimeConfig(handle);
    }

    public int contextTokens() {
        vivo("contextTokens");
        return TalosLlamaNative.nativeContextTokens(handle);
    }

    /**
     * La forma dichiarata dal modello in memoria, o {@code null} se il motore
     * nativo di questa build non sa ancora rispondere.
     *
     * Null è un esito previsto, non un guasto: una build affiancata più vecchia
     * — che è il modo normale di provare un APK qui — non ha il metodo, e chi
     * chiama deve degradare a «tetto non misurabile» invece di andare in errore.
     */
    public long[] modelShape() {
        vivo("modelShape");
        try {
            return TalosLlamaNative.nativeModelShape(handle);
        } catch (UnsatisfiedLinkError older) {
            return null;
        }
    }

    /** Exact prompt size according to this model, not a byte/character estimate. */
    public int promptTokens(String prompt) {
        vivo("promptTokens");
        return TalosLlamaNative.nativePromptTokens(handle, prompt);
    }

    /**
     * What has been produced so far, askable while generation is running.
     *
     * This is what a chat draws. The token COUNT beside it is what the harness
     * measures; they are deliberately separate, because one is for the user's
     * eyes and the other for a verdict, and conflating them would let a
     * cosmetic change move a measurement.
     */
    public String textSoFar() {
        return TalosLlamaNative.nativeTextSoFar(handle);
    }

    /**
     * ⭐ Solo il testo NUOVO dall'ultima chiamata — il delta, per lo streaming.
     *
     * ⛔ Vedetta come textSoFar: si chiama MENTRE l'attore genera, quindi NON
     * passa da soloAttore. Ma a differenza di textSoFar ha uno stato — il
     * puntatore `drained` nel nativo — quindi va chiamata da un thread SOLO. Il
     * watcher della generazione e' quel thread; nessun altro la usa.
     */
    public String drainText() {
        return TalosLlamaNative.nativeDrainText(handle);
    }

    public int tokensProduced() {
        return TalosLlamaNative.nativeTokensProduced(handle);
    }

    /**
     * A conversation, punctuated the way THIS model was trained to expect.
     *
     * Empty when the GGUF declares no template, and the caller must treat that
     * as a refusal rather than fall back to something plausible. Every model
     * family marks turns differently, and the wrong marks do not raise an
     * error — they lower the quality of every answer, which surfaces as "this
     * local model is poor" and sends someone to change the model instead of the
     * prompt.
     */
    public String chatPrompt(String[] roles, String[] contents) {
        // Senza tool e col ragionamento acceso: e' la forma di prima, e questi
        // due chiamanti non sono la chat — non c'e' un'impostazione da
        // rispettare, e cambiarla in silenzio sarebbe una modifica che nessuno
        // ha chiesto.
        return chatPrompt(roles, contents, null, true);
    }

    /**
     * Come sopra, ma offrendo dei tool al modello.
     *
     * {@code toolsJson} e un array in forma OpenAI — la stessa che il registro
     * produce gia per gli altri provider. Il template del GGUF lo rende nella
     * sintassi che QUESTO modello e stato addestrato a produrre, e restituisce
     * anche la grammatica che rende la chiamata valida per costruzione.
     */
    public String chatPrompt(String[] roles, String[] contents, String toolsJson, boolean pensa) {
        String messagesJson = messagesJson(roles, contents);
        return messagesJson == null ? "" : chatPrompt(messagesJson, toolsJson, pensa);
    }

    /**
     * Full semantic messages. llama.cpp parses this standard shape and lets
     * the GGUF template render the model-specific syntax.
     */
    public String chatPrompt(String messagesJson, String toolsJson, boolean pensa) {
        vivo("chatPrompt");
        return TalosLlamaNative.nativeApplyChatTemplate(handle, messagesJson, toolsJson, pensa);
    }

    /**
     * Ciò che il modello ha pensato, separato da ciò che ha detto.
     *
     * JSON, e va letto DOPO `chatPrompt`, perché è quella chiamata a stabilire
     * con che formato questo modello parla. Senza formato la risposta torna
     * intera nel contenuto: si perde la separazione, mai il testo.
     */
    public String parseReply(String reply) {
        vivo("parseReply");
        return TalosLlamaNative.nativeParseReply(handle, reply);
    }

    /** Stops the current generation. What was produced so far still stands. */
    public void cancel() {
        TalosLlamaNative.nativeCancel(handle);
    }

    /**
     * Generates on the CALLING thread and returns the whole answer.
     *
     * The blocking shape is on purpose: whoever wants the text as it grows
     * polls {@link #textSoFar()} from another thread, which is the same
     * arrangement {@link #run} already uses to sample its measurement windows.
     * Handing out a callback per token would put the JNI boundary in the
     * hot path for no gain.
     */
    /**
     * Le due modalità in cui si può chiedere di generare.
     *
     * Non sono un dettaglio di implementazione: cambiano cosa il contesto
     * ricorda fra una chiamata e l'altra, e servono due scopi opposti.
     */
    public enum Mode {
        /**
         * Una conversazione. Il contesto tiene ciò che ha già letto, e il turno
         * nuovo rielabora solo i token aggiunti — che è quasi sempre una
         * frazione minuscola di quelli che il modello vede. Il token di fine
         * generazione ferma la risposta.
         */
        CHAT(true, true),
        /**
         * Una misura. Il contesto riparte da zero, perché due giri con stati
         * diversi non sono confrontabili; e il token di fine non ferma niente,
         * perché un modello che tace dopo un secondo non ha reso lento il
         * telefono — misurerebbe la sua loquacità, non la nostra velocità.
         */
        BENCHMARK(false, false);

        final boolean stopAtEndOfGeneration;
        final boolean reusePrefix;

        Mode(boolean stopAtEndOfGeneration, boolean reusePrefix) {
            this.stopAtEndOfGeneration = stopAtEndOfGeneration;
            this.reusePrefix = reusePrefix;
        }
    }

    public String generateBlocking(String prompt, int maxTokens, Mode mode) {
        return TalosLlamaNative.nativeGenerate(
                handle, prompt, maxTokens, mode.stopAtEndOfGeneration, mode.reusePrefix);
    }

    /** Gli stadi dell'ultima generazione, in JSON. Vedi `nativeLastTimings`. */
    public String lastTimings() {
        return TalosLlamaNative.nativeLastTimings(handle);
    }

    /**
     * Misura i candidati sul contesto aperto e dice quali hanno vinto.
     *
     * ⛔ Azzera la conversazione in memoria. Si tara prima di parlare.
     */
    public String tuneThreads(int[] candidates, int probeTokens) {
        return TalosLlamaNative.nativeTuneThreads(handle, candidates, probeTokens);
    }

    /**
     * Genera, e misura mentre genera.
     *
     * @return il testo e le finestre, oppure null se la generazione è fallita.
     *     Le finestre sono utili solo se la generazione è arrivata in fondo:
     *     misurare un'esecuzione fallita significa misurare il fallimento.
     */
    public Run run(String prompt, int maxTokens, ThermalSource thermal) throws InterruptedException {
        return run(prompt, maxTokens, thermal, Mode.BENCHMARK);
    }

    /**
     * @param mode {@link Mode#CHAT} per una risposta vera, {@link Mode#BENCHMARK}
     *     per una misura. Vedi {@link #MEASURE_FLOOR_MS}: un modello che smette
     *     di parlare dopo un secondo non ha reso lento il telefono.
     */
    public Run run(String prompt, int maxTokens, ThermalSource thermal,
                   Mode mode) throws InterruptedException {
        vivo("run");
        AtomicReference<String> produced = new AtomicReference<>(null);
        Thread worker = new Thread(
                () -> produced.set(TalosLlamaNative.nativeGenerate(
                        handle, prompt, maxTokens, mode.stopAtEndOfGeneration, mode.reusePrefix)),
                "talos-llama-run");
        worker.start();

        List<TalosBenchmarkHarness.Sample> samples = new ArrayList<>();
        long startedAt = System.currentTimeMillis();
        long firstTokenAt = 0;

        while (worker.isAlive()) {
            long now = System.currentTimeMillis();
            if (now - startedAt > RUN_TIMEOUT_MS) {
                TalosLlamaNative.nativeCancel(handle);
                break;
            }
            int tokens = TalosLlamaNative.nativeTokensProduced(handle);
            // La prima finestra si apre col PRIMO token, non con la chiamata:
            // prima di allora il tempo è la lettura del prompt, e sommarla al
            // ritmo di generazione lo farebbe sembrare più lento di quanto è.
            if (firstTokenAt == 0) {
                if (tokens <= 0) {
                    Thread.sleep(SAMPLE_INTERVAL_MS);
                    continue;
                }
                firstTokenAt = now;
            }
            samples.add(new TalosBenchmarkHarness.Sample(now, tokens, thermal.now()));

            // Misurato abbastanza a lungo e con abbastanza token: si ferma qui,
            // qualunque sia il tetto richiesto. Continuare consumerebbe batteria
            // per rendere più preciso un numero già valido.
            boolean measuredEnough = now - firstTokenAt >= MEASURE_FLOOR_MS
                    && tokens >= TalosBenchmarkHarness.MIN_TOKENS;
            if (measuredEnough) {
                TalosLlamaNative.nativeCancel(handle);
                break;
            }
            Thread.sleep(SAMPLE_INTERVAL_MS);
        }

        worker.join();
        String text = produced.get();
        if (text == null) return null;

        /*
         * ⛔⛔ MISURATO il 21/8 in DUE giri di verifica sul Pad, non uno solo.
         * Primo giro, quattro corse su quattro: con una cancellazione rapida
         * (lo Stop di questa stessa release) il worker si ferma 0-7 ms dopo
         * `nativeCancel` — prima che sarebbe dovuto scattare il campione
         * successivo — e questa finestra di chiusura arrivava con LO STESSO
         * conteggio di token dell'ultima del ciclo: un tasso zero fasullo che,
         * essendo l'ULTIMA voce dell'array, {@link TalosBenchmarkHarness#judge}
         * legge come un dato vero. Prima cura: non aggiungere la finestra di
         * chiusura se il conteggio non è cambiato. Rimessa alla prova con tre
         * corse pulite, quella cura ha retto due corse su tre — la terza ha
         * mostrato un SECONDO caso, diverso dal primo: `join()` e la lettura
         * del conteggio finale sono arrivati nello STESSO millisecondo del-
         * l'ultimo campione del ciclo, ma con un token IN PIÙ (non lo stesso
         * conteggio) — `[…624821,148][…624821,149]`, divario di tempo ZERO
         * con un token vero in mezzo. `judge` (riga 135) respinge QUALSIASI
         * divario ≤ 0 come INTERRUPTED, indipendentemente dal conteggio: un
         * controllo sul solo conteggio non lo intercetta. È l'artefatto noto
         * di un orologio a bassa risoluzione — quando l'intervallo reale è più
         * corto del tick, la differenza letta è spesso zero — e la cura
         * canonica è scartare le finestre a durata zero, non fidarsene: stessa
         * regola con cui vLLM misura la latenza inter-token.
         *
         * ⇒ La finestra di chiusura si aggiunge SOLO se entrambe le condizioni
         * che `judge` userà per accettarla sono vere qui: l'orologio è
         * avanzato rispetto all'ultimo campione (divario > 0) E il conteggio
         * è diverso. Una delle due sole non basta, come appena misurato.
         */
        long closingAt = System.currentTimeMillis();
        int finalTokens = TalosLlamaNative.nativeTokensProduced(handle);
        TalosBenchmarkHarness.Sample lastRecorded = samples.isEmpty() ? null : samples.get(samples.size() - 1);
        boolean closingWindowIsReal = lastRecorded == null
                || (closingAt > lastRecorded.atMs && finalTokens != lastRecorded.tokens);
        if (closingWindowIsReal) {
            samples.add(new TalosBenchmarkHarness.Sample(closingAt, finalTokens, thermal.now()));
        }

        // Zero, mai negativo: se il timeout ha chiuso la corsa prima che un
        // token arrivasse, `firstTokenAt` è rimasto 0 e non c'è un TTFT da
        // riportare — e comunque `judge` respinge questa corsa per pochi token,
        // quindi il numero non arriva mai a decidere niente.
        long ttftMs = firstTokenAt > 0 ? firstTokenAt - startedAt : 0;
        return new Run(text, samples.toArray(new TalosBenchmarkHarness.Sample[0]), ttftMs);
    }

    @Override
    public void close() {
        soloAttore("close");
        if (closed) return;
        closed = true;
        TalosLlamaNative.nativeClose(handle);
    }
}
