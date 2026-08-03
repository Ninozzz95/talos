package ai.talos;

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

        Run(String text, TalosBenchmarkHarness.Sample[] samples) {
            this.text = text;
            this.samples = samples;
        }
    }

    private final long handle;
    private boolean closed;

    private TalosLlamaEngine(long handle) {
        this.handle = handle;
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
        if (!TalosLlamaNative.AVAILABLE) return null;
        TalosLlamaNative.ensureReady(context);
        long handle = TalosLlamaNative.nativeOpen(modelPath, threads, contextTokens, gpuLayers,
                                                  deterministic);
        return handle == 0 ? null : new TalosLlamaEngine(handle);
    }

    public int contextTokens() {
        return TalosLlamaNative.nativeContextTokens(handle);
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
        return chatPrompt(roles, contents, null);
    }

    /**
     * Come sopra, ma offrendo dei tool al modello.
     *
     * {@code toolsJson} e un array in forma OpenAI — la stessa che il registro
     * produce gia per gli altri provider. Il template del GGUF lo rende nella
     * sintassi che QUESTO modello e stato addestrato a produrre, e restituisce
     * anche la grammatica che rende la chiamata valida per costruzione.
     */
    public String chatPrompt(String[] roles, String[] contents, String toolsJson) {
        return TalosLlamaNative.nativeApplyChatTemplate(handle, roles, contents, toolsJson);
    }

    /**
     * Ciò che il modello ha pensato, separato da ciò che ha detto.
     *
     * JSON, e va letto DOPO `chatPrompt`, perché è quella chiamata a stabilire
     * con che formato questo modello parla. Senza formato la risposta torna
     * intera nel contenuto: si perde la separazione, mai il testo.
     */
    public String parseReply(String reply) {
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
    public String generateBlocking(String prompt, int maxTokens, boolean stopAtEndOfGeneration) {
        return TalosLlamaNative.nativeGenerate(handle, prompt, maxTokens, stopAtEndOfGeneration);
    }

    /**
     * Genera, e misura mentre genera.
     *
     * @return il testo e le finestre, oppure null se la generazione è fallita.
     *     Le finestre sono utili solo se la generazione è arrivata in fondo:
     *     misurare un'esecuzione fallita significa misurare il fallimento.
     */
    public Run run(String prompt, int maxTokens, ThermalSource thermal) throws InterruptedException {
        return run(prompt, maxTokens, thermal, false);
    }

    /**
     * @param stopAtEndOfGeneration vero per una risposta vera, falso per una
     *     misura. Vedi {@link #MEASURE_FLOOR_MS}: un modello che smette di
     *     parlare dopo un secondo non ha reso lento il telefono.
     */
    public Run run(String prompt, int maxTokens, ThermalSource thermal,
                   boolean stopAtEndOfGeneration) throws InterruptedException {
        AtomicReference<String> produced = new AtomicReference<>(null);
        Thread worker = new Thread(
                () -> produced.set(TalosLlamaNative.nativeGenerate(
                        handle, prompt, maxTokens, stopAtEndOfGeneration)),
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

        // Una finestra di chiusura col conteggio finale: senza, l'ultimo tratto
        // di generazione non è misurato da nessuna finestra.
        samples.add(new TalosBenchmarkHarness.Sample(
                System.currentTimeMillis(), TalosLlamaNative.nativeTokensProduced(handle), thermal.now()));

        return new Run(text, samples.toArray(new TalosBenchmarkHarness.Sample[0]));
    }

    @Override
    public void close() {
        if (closed) return;
        closed = true;
        TalosLlamaNative.nativeClose(handle);
    }
}
