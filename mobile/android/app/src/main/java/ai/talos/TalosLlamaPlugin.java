package ai.talos;

import android.content.ComponentCallbacks2;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The local engine, reachable from the app.
 *
 * Until now llama.cpp ran only inside an instrumented test: it could generate,
 * and nothing in TALOS could ask it to. This is the doorway — and it is a
 * doorway, not a second engine. Which backend earns the right to run stays in
 * {@link TalosBackendChoice}, what counts as a measurement stays in
 * {@link TalosBenchmarkHarness}, and the running itself stays in
 * {@link TalosLlamaEngine}. This class therefore never calls
 * {@link TalosLlamaNative} for anything an engine already exposes: a plugin
 * that reached past it would be the fourth place reading the same rules its own
 * way, which is exactly the shape of the defect this project spent a day
 * removing.
 *
 * <h3>Why the tokens are polled and not pushed</h3>
 *
 * Generation runs on the worker and a watcher asks "what have you got so far?"
 * on a timer. It reads like the lazier design and it is the correct one here: a
 * callback per token would cross the JNI boundary and then the Capacitor
 * bridge — two hops, at forty to a hundred and fifty tokens a second — to
 * deliver text the interface repaints at sixty frames anyway. Polling costs one
 * crossing per frame instead of one per token. The benchmark harness already
 * reads its token counter the same way, for the same reason.
 *
 * <h3>One model at a time</h3>
 *
 * Deliberate, not a simplification. A 4 GB model on a phone with 4 GB free is
 * the normal case rather than the extreme one, and two loaded at once is how an
 * app gets killed by the low-memory reaper mid-sentence. Opening a second model
 * closes the first.
 */
@CapacitorPlugin(name = "TalosLlama")
public class TalosLlamaPlugin extends Plugin {

    /** How often the generating thread is asked what it has produced. */
    private static final long POLL_INTERVAL_MS = 90L;

    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    /**
     * ⛔ Quanto si aspetta la chiusura pulita prima di procedere comunque.
     *
     * NON MISURATO sul dispositivo: va tarato guardando quanto ci mette davvero
     * una generazione ad accorgersi dell'annullamento sul Pad. Un secondo e mezzo
     * sta largamente sotto la soglia di ANR e lascia spazio a una decodifica in
     * corso di finire il token che ha per le mani.
     */
    private static final long CHIUSURA_MAX_MS = 1500L;
    private final AtomicReference<TalosLlamaEngine> openEngine = new AtomicReference<>(null);
    private final AtomicReference<String> openPath = new AtomicReference<>(null);
    /** True from the moment a generation is accepted until it has finished. */
    private final AtomicBoolean generating = new AtomicBoolean(false);

    /**
     * ⛔ IL TERZO CRONOMETRO: quanto è costata l'ultima apertura.
     *
     * Owner 2026-08-07, sul suo OnePlus 13 con un 1,7B quantizzato a 4-5: «prima
     * di ricevere una risposta a un prompt semplicissimo tipo "ciao" ho aspettato
     * DUE MINUTI». Quel numero contraddice le nostre misure — dopo 8A/8B/8C il
     * primo token era a 126 ms — e la contraddizione si spiega da sé: le nostre
     * erano tutte a **modello già caricato**.
     *
     * Il motore cronometrava tokenizzazione, prefisso, prefill e primo token.
     * Non cronometrava l'unica cosa che può valere due minuti: leggere un
     * gigabyte dal disco e mapparlo. Contava le aperture (`opensSinceStart`) ma
     * non quanto costano — cioè sapeva DIRE «è successo due volte» e non «è
     * costato cento secondi».
     *
     * Senza questa misura, progettare un acceleratore è tirare a indovinare su
     * quale metà del tempo si sta ottimizzando.
     *
     * `volatile` e non atomico: sono due scritture indipendenti fatte da un
     * worker solo, e chi legge vuole l'ultimo valore, non una coppia coerente.
     */
    private volatile long lastOpenMs = -1L;
    /** True quando i pesi erano già in memoria: costa millisecondi, non secondi. */
    private volatile boolean lastOpenReusedWeights = false;

    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", TalosLlamaNative.AVAILABLE);
        // The registered ggml backends, verbatim. The interface may show them;
        // nothing here concludes anything from them — that is the arbiter's job.
        result.put("backends", TalosLlamaEngine.backends(getContext()));
        // La build del MOTORE: e' cio' che invalida un prefisso congelato, e
        // non cambia quando cambia l'app.
        if (TalosLlamaNative.AVAILABLE) {
            result.put("engineBuild", TalosLlamaNative.nativeEngineBuild());
        }
        result.put("loadedPath", openPath.get());
        /**
         * La forma del modello caricato viaggia con lo STATO, non su una porta
         * sua.
         *
         * Perché è la stessa domanda: «cosa c'è in memoria adesso». Chi manda un
         * messaggio interroga già lo stato per sapere se deve ricaricare, quindi
         * la forma arriva senza un secondo passaggio sul ponte — e soprattutto
         * arriva anche quando il modello era GIÀ aperto, che è il caso in cui una
         * risposta legata al solo `open` non ci sarebbe mai.
         */
        TalosLlamaEngine aperto = openEngine.get();
        JSObject shape = shapeOf(aperto);
        if (shape != null) result.put("shape", shape);
        // Il tipo di cache viaggia con lo stato per la stessa ragione della
        // forma: chi calcola quanto contesto ci sta lo chiede insieme al resto,
        // e deve leggere quello CREATO, non quello chiesto.
        if (aperto != null) result.put("kvCacheType", aperto.kvCacheType());
        // Quante aperture da quando il processo e' partito: due in un invio solo
        // vogliono dire che si stanno ricaricando pesi gia' in memoria.
        if (TalosLlamaNative.AVAILABLE) {
            result.put("opensSinceStart", TalosLlamaNative.nativeOpensSinceStart());
            // Distinto dalle aperture: un contesto rifatto costa millisecondi,
            // un modello riaperto costa i gigabyte. Sommarli nasconderebbe
            // proprio la differenza che questo lavoro esiste per creare.
            result.put("contextRebuilds", TalosLlamaNative.nativeContextRebuilds());
        }
        /*
         * Quanto e' costata l'ULTIMA apertura, e se i pesi erano gia' in
         * memoria. Le due cose viaggiano insieme perche' separate non
         * significano niente: «800 ms» e' ottimo per una rilettura dal disco e
         * pessimo per un contesto rifatto, e senza il secondo campo chi legge
         * non sa quale delle due sta guardando.
         */
        if (lastOpenMs >= 0L) {
            result.put("lastOpenMs", lastOpenMs);
            result.put("lastOpenReusedWeights", lastOpenReusedWeights);
        }
        /*
         * I numeri con cui il modello sta girando DAVVERO.
         *
         * Chiesti al contesto e non ripetuti da ciò che era stato chiesto: fra
         * la richiesta e la realtà c'è un ripiego possibile — un contesto che non
         * si alloca, una cache che il modello non regge — e una diagnostica che
         * mostra la richiesta invece del risultato racconta la stessa bugia che
         * esiste per scoprire.
         */
        if (aperto != null) {
            result.put("contextTokens", aperto.contextTokens());
            long[] runtime = aperto.runtimeConfig();
            if (runtime != null && runtime.length >= 3) {
                result.put("threads", runtime[0]);
                result.put("threadsBatch", runtime[1]);
                result.put("microBatch", runtime[2]);
            }
        }
        call.resolve(result);
    }

    /**
     * Traduce la forma nativa in campi con un nome, o null se non è misurabile.
     *
     * Un array di cinque numeri attraversa JNI a costo quasi nullo ma sarebbe
     * illeggibile qui: al di là di questo confine ogni valore ha un nome, così
     * uno scambio fra `kvHeads` e `headDim` diventa un errore che si vede invece
     * di un tetto di contesto sbagliato di un fattore.
     *
     * Ogni misura non plausibile fa scartare l'intera forma. Metà forma sarebbe
     * peggio di nessuna: chi legge la userebbe per un calcolo, e un `headDim` a
     * zero è esattamente il valore che trasformerebbe il tetto in infinito.
     */
    private static JSObject shapeOf(TalosLlamaEngine engine) {
        if (engine == null) return null;
        long[] values = engine.modelShape();
        if (values == null || values.length < 5) return null;
        for (long value : values) {
            if (value <= 0L) return null;
        }
        JSObject shape = new JSObject();
        shape.put("layers", values[0]);
        shape.put("kvHeads", values[1]);
        shape.put("headDim", values[2]);
        shape.put("trainedContext", values[3]);
        shape.put("weightBytes", values[4]);
        return shape;
    }

    /**
     * Opens a model, closing whichever one was open.
     *
     * Rejects rather than resolving with an empty handle: "it did not open" is
     * an outcome the caller has to handle, and an object that is half a session
     * is how a failure survives past the point where it happened.
     */
    @PluginMethod
    public void open(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        if (!new File(path).isFile()) {
            // Named, because a missing model file is the commonest failure here
            // and the one an opaque error explains worst.
            call.reject("TALOS_LLAMA_MODEL_MISSING");
            return;
        }
        if (!TalosLlamaNative.AVAILABLE) {
            call.reject("TALOS_LLAMA_UNAVAILABLE");
            return;
        }

        final int threads = call.getInt("threads", 4);
        final int contextTokens = call.getInt("contextTokens", 4096);
        final int gpuLayers = call.getInt("gpuLayers", 0);
        // Zero significa «come prima»: stesso numero di thread per prefill e
        // generazione, microbatch implicito. Chi ha letto la forma della CPU
        // manda due numeri veri; il banco di prova continua a non mandarli,
        // perché misura apposta la configurazione di riferimento.
        final int threadsBatch = call.getInt("threadsBatch", 0);
        final int microBatch = call.getInt("microBatch", 0);
        // La cache leggera si CHIEDE; se il modello non la regge, il contesto
        // nasce in f16 e la risposta lo dice. Il predefinito resta f16 perché
        // è la combinazione che regge sempre, e una chat che parte è meglio di
        // una che ha più contesto e non si apre.
        final String kvType = call.getString("kvCacheType", "f16");
        // Chiedibile, e falso per difetto: la chat vuole un campionamento vero,
        // il banco di prova vuole l'argmax perché confronta due backend e
        // pretende lo stesso testo da entrambi. Erano la stessa cosa, ed è da
        // lì che venivano i token di altre lingue a metà parola.
        final boolean deterministic = Boolean.TRUE.equals(call.getBoolean("deterministic", false));

        worker.execute(() -> {
            // Il cronometro parte QUI, non prima della coda: chi legge vuole
            // sapere quanto costa aprire, non quanto ha aspettato il suo turno.
            final long inizioApertura = System.nanoTime();
            /**
             * ⭐ STESSO MODELLO: si rifà il contesto, non si ricarica il file.
             *
             * MISURATO dal registro dell'owner il 2026-08-06: **111 secondi**
             * prima della prima parola al primo messaggio, e **195
             * millisecondi** ai giri successivi dello stesso invio. La causa non
             * era il prefill — era che il modello veniva aperto **due volte**.
             *
             * Succede per una ragione onesta: il contesto che serve si conosce
             * solo dopo aver applicato il template del modello, e applicarlo
             * richiede un modello già aperto. Quindi si apre col predefinito, si
             * scopre che serve di più, e si riapre.
             *
             * ⛔ Ma «riaprire» non doveva voler dire rileggere due gigabyte dal
             * disco. `llama_model` e `llama_context` sono separati: i pesi da una
             * parte, la cache dall'altra. Erano i nostri `open()` a liberarli
             * insieme, non llama.cpp a pretenderlo.
             *
             * Se la ricostruzione fallisce si torna alla strada intera: lenta,
             * ma è quella che c'era prima e funziona.
             */
            TalosLlamaEngine aperto = openEngine.get();
            if (aperto != null && path.equals(openPath.get())) {
                int ottenuto = aperto.reopenContext(
                        threads, contextTokens, threadsBatch, microBatch, kvType, deterministic);
                if (ottenuto > 0) {
                    lastOpenMs = (System.nanoTime() - inizioApertura) / 1_000_000L;
                    lastOpenReusedWeights = true;
                    JSObject rifatto = new JSObject();
                    rifatto.put("contextTokens", ottenuto);
                    rifatto.put("kvCacheType", aperto.kvCacheType());
                    // La stessa misura torna anche a chi ha chiamato, non solo
                    // al doctor: chi manda un messaggio puo' dire «sto
                    // caricando» invece di lasciare uno schermo fermo.
                    rifatto.put("openMs", lastOpenMs);
                    rifatto.put("reusedWeights", true);
                    call.resolve(rifatto);
                    return;
                }
                // Fallita: la sessione è rimasta senza contesto e non si può
                // usare. Si chiude e si riapre tutto, sotto.
            }
            closeOpenModel();
            TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                    getContext(), path, threads, contextTokens, gpuLayers, deterministic,
                    threadsBatch, microBatch, kvType);
            TalosLlamaEngine engine = attempt.engine();
            if (engine == null) {
                JSObject failure = new JSObject();
                failure.put("stage", attempt.failureStage().wireValue());
                call.reject("TALOS_LLAMA_OPEN_FAILED", "TALOS_LLAMA_OPEN_FAILED", failure);
                return;
            }
            openEngine.set(engine);
            openPath.set(path);
            lastOpenMs = (System.nanoTime() - inizioApertura) / 1_000_000L;
            lastOpenReusedWeights = false;
            JSObject result = new JSObject();
            result.put("openMs", lastOpenMs);
            result.put("reusedWeights", false);
            result.put("contextTokens", engine.contextTokens());
            // Quale cache ha VINTO, non quale era stata chiesta: il tetto di
            // contesto si calcola su questo.
            result.put("kvCacheType", engine.kvCacheType());
            call.resolve(result);
        });
    }

    /**
     * ⭐ Congela il prefisso: scrive su disco la cache di ciò che il contesto
     * ha già letto.
     *
     * ⛔ L'IMPRONTA È DI CHI CHIAMA, e non è pignoleria: uno stato caricato sul
     * modello sbagliato **non dà errore** — dà risposte sbagliate, e nessuno va
     * a cercare la causa in un file di cache. Il nome del file deve quindi
     * portare tutto ciò che lo rende valido: modello, contesto, tipo di cache,
     * build del motore, e il testo esatto del prefisso.
     */
    @PluginMethod
    public void saveState(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        TalosLlamaEngine engine = openEngine.get();
        if (engine == null) {
            call.reject("TALOS_LLAMA_NO_MODEL");
            return;
        }
        // `keepTokens` assente = salva tutto cio' che c'e'. Presente = pota
        // prima, che e' la strada normale: il prefisso da congelare e' un
        // pezzo iniziale di cio' che la cache contiene dopo il primo messaggio.
        // Il TESTO del prefisso, non un conteggio: il template mette il
        // marcatore dell'assistente in fondo, quindi il rendering del solo
        // sistema NON e' un prefisso di quello completo, e un numero ricavato
        // da li' taglierebbe dentro il turno dell'utente. Il confine lo trova
        // il tokenizzatore, dall'altra parte del ponte.
        String prefisso = call.getString("prefixPrompt");
        worker.execute(() -> {
            long inizio = System.nanoTime();
            long byteScritti = prefisso == null || prefisso.isEmpty()
                    ? engine.saveState(path)
                    : engine.trimAndSaveState(path, prefisso);
            JSObject result = new JSObject();
            result.put("bytes", byteScritti);
            result.put("saved", byteScritti > 0);
            result.put("ms", (System.nanoTime() - inizio) / 1_000_000L);
            call.resolve(result);
        });
    }

    /**
     * Rilegge un prefisso congelato dentro il contesto aperto.
     *
     * `restored: 0` non è un guasto: la prima volta, e dopo ogni cambio di
     * modello o di parametri, il file non c'è o non combacia. Si torna a
     * calcolare — cioè a fare quello che si faceva prima.
     */
    @PluginMethod
    public void loadState(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        TalosLlamaEngine engine = openEngine.get();
        if (engine == null) {
            call.reject("TALOS_LLAMA_NO_MODEL");
            return;
        }
        worker.execute(() -> {
            long inizio = System.nanoTime();
            int token = engine.loadState(path);
            if (token > 0) {
                /*
                 * ⛔ La data diventa quella di ULTIMO USO.
                 *
                 * Senza, lo sfratto potrebbe solo togliere il piu' VECCHIO — e
                 * il piu' vecchio e' spesso quello che si usa ogni giorno,
                 * mentre quello nato ieri da una prova non lo riaprira'
                 * nessuno. Un tocco alla data trasforma «il piu' antico» in
                 * «il meno utile», che e' la domanda giusta.
                 */
                new File(path).setLastModified(System.currentTimeMillis());
            }
            JSObject result = new JSObject();
            result.put("restoredTokens", token);
            result.put("ms", (System.nanoTime() - inizio) / 1_000_000L);
            call.resolve(result);
        });
    }

    /**
     * I prefissi congelati sul disco, con quanto occupano e quando sono stati
     * usati l'ultima volta.
     *
     * ⛔ Esiste perché nessuno li cancellava. Ne nasce uno per ogni
     * combinazione di modello, contesto, tipo di cache e interruttore del
     * ragionamento, e a `f16` pesano quasi un gigabyte l'uno.
     *
     * `modifiedAt` è la data di ULTIMO USO, non di creazione: `loadState` la
     * aggiorna a ogni rilettura riuscita. È la differenza fra sfrattare il meno
     * utile e sfrattare il più vecchio — e il più vecchio può benissimo essere
     * quello che si usa ogni giorno.
     */
    @PluginMethod
    public void prefixCaches(PluginCall call) {
        TalosModelStore store = new TalosModelStore(TalosTransferSession.rootFor(getContext()));
        JSArray caches = new JSArray();
        long totale = 0;
        for (TalosModelStore.Leftover entry : store.prefixCaches().entries) {
            JSObject row = new JSObject();
            row.put("path", entry.path);
            row.put("bytes", entry.bytes);
            row.put("modifiedAt", new File(entry.path).lastModified());
            caches.put(row);
            totale += entry.bytes;
        }
        JSObject result = new JSObject();
        result.put("caches", caches);
        result.put("totalBytes", totale);
        call.resolve(result);
    }

    /**
     * Generates, emitting the answer as it grows.
     *
     * The listener receives only what is NEW since the last emission. Sending
     * the whole answer every tick would be quadratic in the length of the
     * reply — harmless for a haiku and ruinous for the long answers this app
     * exists to produce.
     */
    @PluginMethod
    public void generate(PluginCall call) {
        TalosLlamaEngine engine = openEngine.get();
        if (engine == null) {
            call.reject("TALOS_LLAMA_NO_MODEL");
            return;
        }
        String prompt = call.getString("prompt");
        if (prompt == null) {
            call.reject("TALOS_LLAMA_PROMPT_REQUIRED");
            return;
        }
        final int maxTokens = call.getInt("maxTokens", 512);
        // Chat wants the model to stop when it has finished speaking; the
        // benchmark wants it to carry on regardless. Same engine, opposite
        // needs, so the caller says which of the two it is instead of one of
        // them quietly getting the other's behaviour.
        //
        // Le due esigenze sono UNA scelta, non due booleani che devono essere
        // d'accordo: chi misura vuole anche un contesto azzerato, chi chatta
        // vuole anche il prefisso riusato. Tenerli separati significava poter
        // chiedere «fermati alla fine ma ricomincia da zero», che non è
        // nessuna delle due cose.
        final TalosLlamaEngine.Mode mode = call.getData().has("stopAtEndOfGeneration")
                && !Boolean.TRUE.equals(call.getBoolean("stopAtEndOfGeneration"))
                ? TalosLlamaEngine.Mode.BENCHMARK
                : TalosLlamaEngine.Mode.CHAT;

        // One generation at a time, refused rather than queued.
        //
        // llama.cpp allows many contexts and one thread each; it does not allow
        // two decodes on the SAME context, and this plugin deliberately holds
        // one model. Queueing would be worse than refusing: the second caller
        // would wait minutes behind the first with nothing to show, and the
        // interface has no way to say so. `TALOS_LLAMA_BUSY` is something a
        // caller can act on.
        if (!generating.compareAndSet(false, true)) {
            call.reject("TALOS_LLAMA_BUSY");
            return;
        }

        worker.execute(() -> {
            try {
                final int promptTokens = engine.promptTokens(prompt);
                final int contextTokens = engine.contextTokens();
                final int completionTokens = maxTokens > 0 ? maxTokens : 64;
                if (promptTokens <= 0) {
                    JSObject failure = new JSObject();
                    failure.put("stage", "generation");
                    call.reject("TALOS_LLAMA_PROMPT_TOKENIZATION_FAILED",
                            "TALOS_LLAMA_PROMPT_TOKENIZATION_FAILED", failure);
                    return;
                }
                if (TalosLocalContextBudget.requiresLargerContext(
                        promptTokens, completionTokens, contextTokens)) {
                    JSObject failure = new JSObject();
                    failure.put("stage", "context-required");
                    failure.put("promptTokens", promptTokens);
                    failure.put("contextTokens", contextTokens);
                    failure.put("requiredContextTokens",
                            TalosLocalContextBudget.requiredTokens(promptTokens, completionTokens));
                    call.reject("TALOS_LLAMA_CONTEXT_REQUIRED",
                            "TALOS_LLAMA_CONTEXT_REQUIRED", failure);
                    return;
                }

                // THE DECODE RUNS HERE, on the thread that owns the engine.
                // Watching is the only thing outside it: it reads already
                // published text under the lock that published it.
                final AtomicBoolean done = new AtomicBoolean(false);
                final AtomicInteger sent = new AtomicInteger(0);
                Thread watcher = new Thread(() -> {
                    while (!done.get()) {
                        try {
                            sent.set(emitDelta(engine, sent.get()));
                            Thread.sleep(POLL_INTERVAL_MS);
                        } catch (InterruptedException interrupted) {
                            Thread.currentThread().interrupt();
                            return;
                        } catch (RuntimeException bridgeFailure) {
                            // A listener disappearing must not become a second
                            // uncaught-exception path beside the worker below.
                            return;
                        }
                    }
                }, "talos-llama-watch");
                watcher.start();

                try {
                    engine.generateBlocking(prompt, maxTokens, mode);
                } finally {
                    done.set(true);
                    watcher.interrupt();
                    try {
                        watcher.join(1_000L);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                    }
                    // One last read AFTER the generation has finished. The final
                    // tokens land between the last poll and the end.
                    emitDelta(engine, sent.get());
                }

                /**
                 * Il testo grezzo viene separato qui, dallo stesso template che
                 * sa dove finiscono ragionamento e tool call. Durante lo stream
                 * resta grezzo: decidere prima della chiusura dei marker
                 * richiederebbe indovinare.
                 */
                final String raw = engine.textSoFar();
                JSObject result = new JSObject();
                result.put("text", raw);
                result.put("reasoning", "");
                try {
                    JSONObject split = new JSONObject(engine.parseReply(raw));
                    final String content = split.optString("content", "");
                    JSONArray calls = split.optJSONArray("toolCalls");
                    final boolean called = calls != null && calls.length() > 0;
                    if (!content.isEmpty() || called) result.put("text", content);
                    result.put("reasoning", split.optString("reasoning", ""));
                    if (called) result.put("toolCalls", calls);
                } catch (JSONException malformed) {
                    android.util.Log.w("TalosLlama", "risposta non separabile", malformed);
                }
                result.put("tokens", engine.tokensProduced());
                call.resolve(result);
            } catch (RuntimeException failure) {
                JSObject details = new JSObject();
                details.put("stage", "generation");
                call.reject("TALOS_LLAMA_GENERATION_FAILED",
                        "TALOS_LLAMA_GENERATION_FAILED", details);
            } finally {
                generating.set(false);
            }
        });
    }

    /** Emits what is new since `sent`, and returns the new watermark. */
    private int emitDelta(TalosLlamaEngine engine, int sent) {
        String text = engine.textSoFar();
        if (text == null || text.length() <= sent) return sent;
        JSObject event = new JSObject();
        event.put("delta", text.substring(sent));
        notifyListeners("token", event);
        return text.length();
    }

    /**
     * The models on this device that can actually be opened.
     *
     * Asked of the disk every time rather than remembered. A model can be
     * deleted by the system reclaiming space, or by the user through Android's
     * own storage screen, and a cached list would keep offering something that
     * is no longer there — which fails at the worst moment, halfway into
     * loading, instead of at the moment of choosing.
     */
    @PluginMethod
    /**
     * Cancella un modello scaricato — il file e il suo sidecar.
     *
     * Owner 2026-08-04: «non e' possibile fare CRUD sui modelli locali». Non lo
     * era davvero: si potevano scaricare e mai togliere dall'app, solo dalle
     * impostazioni di sistema — cioe' uscendo da TALOS per rimediare a una cosa
     * fatta dentro TALOS.
     *
     * Il percorso viene VERIFICATO contro la radice dei modelli invece di
     * essere cancellato com'e' arrivato: un percorso e' una stringa che passa
     * dalla WebView, e questo metodo cancella file. Fuori dalla radice si
     * rifiuta, e lo dice.
     */
    public void deleteInstalled(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("TALOS_LOCAL_MODEL_PATH_REQUIRED");
            return;
        }
        try {
            File root = TalosTransferSession.rootFor(getContext());
            File target = new File(path).getCanonicalFile();
            if (!target.getPath().startsWith(root.getCanonicalFile().getPath() + File.separator)) {
                call.reject("TALOS_LOCAL_MODEL_OUTSIDE_ROOT");
                return;
            }
            if (!target.exists()) {
                // Gia' sparito: l'esito che l'utente voleva. Un errore qui
                // manderebbe a cercare un guasto che non c'e'.
                JSObject done = new JSObject();
                done.put("deleted", false);
                call.resolve(done);
                return;
            }
            boolean removed = target.delete();
            // Il sidecar accanto al file: senza, resta un residuo che il
            // downloader potrebbe leggere come un trasferimento a meta'.
            new File(target.getPath() + ".talos").delete();
            if (!removed) {
                call.reject("TALOS_LOCAL_MODEL_DELETE_FAILED");
                return;
            }
            JSObject done = new JSObject();
            done.put("deleted", true);
            call.resolve(done);
        } catch (Exception failure) {
            call.reject("TALOS_LOCAL_MODEL_DELETE_FAILED", failure);
        }
    }

    /**
     * Quanto contesto serve, chiesto PRIMA di caricare i pesi.
     *
     * ⛔ Non richiede un modello aperto — è proprio il punto. Il contesto giusto
     * si conosce solo dopo aver applicato il template, applicarlo richiedeva un
     * modello aperto, e aprirlo richiede sapere il contesto: un cerchio che
     * costava DUE aperture per messaggio.
     */
    @PluginMethod
    public void planPrompt(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        JSArray turns = call.getArray("turns");
        if (turns == null || turns.length() == 0) {
            call.reject("TALOS_LLAMA_TURNS_REQUIRED");
            return;
        }
        JSArray tools = call.getArray("tools");
        final String toolsJson = tools == null || tools.length() == 0 ? null : tools.toString();
        worker.execute(() -> {
            String[] roles = new String[turns.length()];
            String[] contents = new String[turns.length()];
            try {
                for (int index = 0; index < turns.length(); index += 1) {
                    JSONObject turn = turns.getJSONObject(index);
                    roles[index] = turn.optString("role", "user");
                    contents[index] = turn.optString("content", "");
                }
            } catch (JSONException malformed) {
                call.reject("TALOS_LLAMA_TURNS_INVALID");
                return;
            }
        // ⛔ Il ragionamento si CHIEDE. `enable_thinking` nasce acceso in
        // llama.cpp e non lo toccavamo: TALOS domandava a Qwen3 di ragionare
        // anche per «ciao», ignorando l'impostazione della persona. Il
        // predefinito qui è ACCESO — chi non manda il campo ha il
        // comportamento di prima, e nessun invio cambia senza dirlo.
        boolean pensa = !Boolean.FALSE.equals(call.getBoolean("thinking", Boolean.TRUE));
            String json = TalosLlamaEngine.planPrompt(path, roles, contents, toolsJson, pensa);
            if (json == null) {
                call.reject("TALOS_LLAMA_PLAN_FAILED");
                return;
            }
            JSObject result = new JSObject();
            result.put("plan", json);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void installed(PluginCall call) {
        // The SAME root the downloader writes to. Asking for `getFilesDir()`
        // instead would compile, run, and return an empty list forever — the
        // failure would look like "no models downloaded" rather than like
        // looking in the wrong drawer.
        TalosModelStore store = new TalosModelStore(TalosTransferSession.rootFor(getContext()));
        TalosModelStore.Listing listing = store.finished();
        JSArray models = new JSArray();
        for (TalosModelStore.Leftover entry : listing.entries) {
            JSObject row = new JSObject();
            row.put("path", entry.path);
            row.put("bytes", entry.bytes);
            row.put("name", new File(entry.path).getName());
            // WHEN it arrived. Without it the list can only be sorted by
            // name or size, and the question a person actually asks after a
            // download is "which one did I just get" — owner 2026-08-03:
            // «ho appena scaricato un modello ma non ho idea di dove sia».
            row.put("modifiedAt", new File(entry.path).lastModified());
            /**
             * ⭐ Se con questo file si può PARLARE.
             *
             * Owner 2026-08-06: nel selettore compariva `mmproj-F16.gguf` — il
             * proiettore che accompagna un modello visivo — e sceglierlo dava
             * «questo file non può essere aperto come modello GGUF
             * compatibile». Su un'app appena installata veniva perfino scelto
             * da solo.
             *
             * Resta nella lista, perché occupa 672 MB e chi vuole liberarli
             * deve poterlo trovare ed eliminare. Ma la chat non deve offrirlo:
             * un modello che non può rispondere non è una scelta, è una
             * trappola.
             *
             * La domanda la fa il FILE, non il suo nome: dichiara degli strati
             * o no. Filtrare «mmproj» sarebbe una stringa scritta a mano che
             * lascia passare il prossimo proiettore chiamato altrimenti.
             */
            row.put("conversational", TalosLlamaEngine.isConversational(entry.path));
            models.put(row);
        }
        JSObject result = new JSObject();
        result.put("models", models);
        // What the walk could NOT look at, carried alongside what it found.
        //
        // Without this the caller receives an empty list and has no way to know
        // whether the phone holds no models or whether a folder refused to open
        // — and it used to say the first thing while the second was true. One
        // sends the user to download something; the other means downloading
        // again will change nothing.
        result.put("unreadable", unreadableOf(listing));
        call.resolve(result);
    }

    private static JSArray unreadableOf(TalosModelStore.Listing listing) {
        JSArray refused = new JSArray();
        for (TalosModelStore.Unreadable entry : listing.unreadable) {
            JSObject row = new JSObject();
            row.put("path", entry.path);
            row.put("reason", entry.reason);
            refused.put(row);
        }
        return refused;
    }

    /**
     * Turns a conversation into the prompt this model expects.
     *
     * Kept as its own call rather than folded into `generate` so the caller can
     * see what will be sent — and because a refusal ("this GGUF declares no
     * template") has to be answerable before a generation starts, not halfway
     * through one.
     */
    @PluginMethod
    public void chatPrompt(PluginCall call) {
        if (openEngine.get() == null) {
            call.reject("TALOS_LLAMA_NO_MODEL");
            return;
        }
        JSArray turns = call.getArray("turns");
        if (turns == null || turns.length() == 0) {
            call.reject("TALOS_LLAMA_TURNS_REQUIRED");
            return;
        }
        String[] roles = new String[turns.length()];
        String[] contents = new String[turns.length()];
        try {
            for (int index = 0; index < turns.length(); index += 1) {
                JSONObject turn = turns.getJSONObject(index);
                roles[index] = turn.optString("role", "user");
                contents[index] = turn.optString("content", "");
            }
        } catch (JSONException malformed) {
            call.reject("TALOS_LLAMA_TURNS_INVALID");
            return;
        }
        /**
         * I tool, se ce ne sono, nella forma OpenAI che il registro produce gia'
         * per gli altri provider.
         *
         * Owner 2026-08-03: «i locali devono avere le stesse possibilita' dei
         * key». Passati al TEMPLATE e non descritti a parole nel prompt: ogni
         * famiglia annuncia una chiamata a modo suo, e quel formato lo conosce
         * il GGUF, non noi.
         */
        JSArray tools = call.getArray("tools");
        String toolsJson = tools == null || tools.length() == 0 ? null : tools.toString();
        // ⛔ Il ragionamento si CHIEDE. `enable_thinking` nasce acceso in
        // llama.cpp e non lo toccavamo: TALOS domandava a Qwen3 di ragionare
        // anche per «ciao», ignorando l'impostazione della persona. Il
        // predefinito qui è ACCESO — chi non manda il campo ha il
        // comportamento di prima, e nessun invio cambia senza dirlo.
        boolean pensa = !Boolean.FALSE.equals(call.getBoolean("thinking", Boolean.TRUE));
        /*
         * ⛔⛔⛔ DA QUI IN GIÙ SI PASSA DALL'ATTORE, e non è una rifinitura.
         *
         * Questa chiamata arriva fino a common_sampler_free() nel C++, dove il
         * campionatore viene liberato e sostituito. Servita dal thread del plugin
         * mentre nativeGenerate() campiona sullo stesso puntatore, apriva una
         * finestra di USE-AFTER-FREE: non una race di valore, memoria liberata e
         * poi letta.
         *
         * ⛔ La lettura degli argomenti resta fuori apposta: un rifiuto per un
         * campo mancante non deve mettersi in fila dietro una generazione lunga.
         * Dentro l'attore ci va solo ciò che tocca il motore.
         *
         * ⛔ E il motore si rilegge QUI: fra la richiesta e il turno dell'attore
         * la persona può aver chiuso il modello, e l'oggetto di prima sarebbe un
         * manico verso una sessione distrutta.
         */
        worker.execute(() -> {
            TalosLlamaEngine attivo = openEngine.get();
            if (attivo == null) {
                call.reject("TALOS_LLAMA_NO_MODEL");
                return;
            }
            String prompt = attivo.chatPrompt(roles, contents, toolsJson, pensa);
            if (prompt == null || prompt.isEmpty()) {
                // Named, so the interface can say WHY instead of producing a worse
                // answer that looks like the model's fault.
                call.reject("TALOS_LLAMA_NO_CHAT_TEMPLATE");
                return;
            }
            int promptTokens = attivo.promptTokens(prompt);
            if (promptTokens <= 0) {
                call.reject("TALOS_LLAMA_PROMPT_TOKENIZATION_FAILED");
                return;
            }
            JSObject result = new JSObject();
            result.put("prompt", prompt);
            result.put("promptTokens", promptTokens);
            result.put("contextTokens", attivo.contextTokens());
            call.resolve(result);
        });
    }

    /**
     * Gli stadi dell'ultima generazione.
     *
     * «Nove secondi prima della prima parola» non è una diagnosi: è la somma di
     * tokenizzazione, prefisso, prefill, prima decodifica e ponte, e le cinque
     * si riparano in modi diversi. Questo metodo è come si scopre quale delle
     * cinque li ha presi, senza collegare un profiler.
     */
    @PluginMethod
    public void lastTimings(PluginCall call) {
        TalosLlamaEngine engine = openEngine.get();
        if (engine == null) {
            call.reject("TALOS_LLAMA_NOT_OPEN");
            return;
        }
        String json = engine.lastTimings();
        JSObject payload = new JSObject();
        payload.put("timings", json == null ? "" : json);
        call.resolve(payload);
    }

    /**
     * Tara i thread misurandoli, invece di ereditare una costante.
     *
     * ⛔ Azzera la conversazione in memoria e occupa il motore: si chiama prima
     * di parlare, e non mentre una generazione è in corso.
     */
    @PluginMethod
    public void tuneThreads(PluginCall call) {
        TalosLlamaEngine engine = openEngine.get();
        if (engine == null) {
            call.reject("TALOS_LLAMA_NOT_OPEN");
            return;
        }
        if (generating.get()) {
            call.reject("TALOS_LLAMA_BUSY");
            return;
        }
        JSArray raw = call.getArray("candidates");
        if (raw == null || raw.length() == 0) {
            call.reject("TALOS_LLAMA_CANDIDATES_REQUIRED");
            return;
        }
        final int probeTokens = call.getInt("probeTokens", 256);
        final int[] candidates = new int[raw.length()];
        for (int index = 0; index < raw.length(); index++) {
            candidates[index] = raw.optInt(index, 0);
        }
        worker.execute(() -> {
            String json = engine.tuneThreads(candidates, probeTokens);
            if (json == null) {
                call.reject("TALOS_LLAMA_TUNE_FAILED");
                return;
            }
            JSObject payload = new JSObject();
            payload.put("tuning", json);
            call.resolve(payload);
        });
    }

    /** Stops the current generation. What was produced so far still stands. */
    @PluginMethod
    public void cancel(PluginCall call) {
        TalosLlamaEngine engine = openEngine.get();
        if (engine != null) engine.cancel();
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        worker.execute(() -> {
            closeOpenModel();
            call.resolve();
        });
    }

    private void closeOpenModel() {
        TalosLlamaEngine engine = openEngine.getAndSet(null);
        openPath.set(null);
        if (engine != null) engine.close();
    }

    @Override
    protected void handleOnDestroy() {
        // Gigabytes do not free themselves when the activity goes away.
        if (pressioneMemoria != null) {
            getContext().getApplicationContext().unregisterComponentCallbacks(pressioneMemoria);
            pressioneMemoria = null;
        }
        /*
         * ⛔⛔ PRIMA SI ANNULLA, POI SI CHIUDE — e la chiusura passa dall'attore.
         *
         * Chiudere qui, dal thread principale, mentre l'attore sta generando
         * significa distruggere la sessione sotto i piedi di chi la sta usando.
         * L'ordine delle chiamate in Java non è una garanzia in C++: un
         * entrypoint nativo già entrato continua a lavorare su memoria che nel
         * frattempo qualcuno ha liberato.
         *
         * ⛔ `cancel` è atomico e deve restare FUORI dall'attore: metterlo in
         * fila dietro la generazione che deve fermare sarebbe un girotondo.
         * Serve proprio a farla finire presto, così la chiusura non aspetta.
         *
         * ⛔ E l'attesa è LIMITATA: bloccare il thread principale senza tetto
         * durante la distruzione dell'Activity è un ANR. Se il tempo scade si
         * procede comunque — il processo sta morendo, e un modello non chiuso
         * costa meno di un'app che si pianta chiudendosi.
         *
         * ⇒ La stessa forma che il codice usava già per la pressione di memoria,
         * sessanta righe più in basso: `worker.execute(this::closeOpenModel)`.
         * Il difetto era che la stessa operazione passava dall'attore in un
         * punto e lo scavalcava nell'altro.
         */
        TalosLlamaEngine vivo = openEngine.get();
        if (vivo != null) vivo.cancel();
        worker.execute(this::closeOpenModel);
        worker.shutdown();
        try {
            if (!worker.awaitTermination(CHIUSURA_MAX_MS, java.util.concurrent.TimeUnit.MILLISECONDS)) {
                worker.shutdownNow();
            }
        } catch (InterruptedException interrotto) {
            worker.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    /**
     * ⭐ Quando Android chiede spazio, il modello lo restituisce.
     *
     * <h3>Il problema</h3>
     *
     * Un modello aperto sono due gigabyte di pesi più la cache. Restano lì
     * finché qualcuno non chiude — e nessuno chiudeva. Il sistema, quando la
     * memoria stringe, non chiede il permesso: uccide il processo, e con lui se
     * ne va la risposta a metà. Meglio restituire noi ciò che possiamo, prima
     * che ce lo prendano tutto.
     *
     * <h3>Perché due soglie e non una</h3>
     *
     * {@code TRIM_MEMORY_UI_HIDDEN} vuol dire «l'app non è più sullo schermo»:
     * non è pressione di memoria, è un'occasione. A quel punto il modello non
     * serve a nessuno e tenerlo è solo un motivo in più per essere uccisi.
     * {@code TRIM_MEMORY_RUNNING_LOW} e peggio vogliono dire pressione vera
     * mentre siamo ancora davanti: lì si lascia andare comunque, perché
     * l'alternativa è che decida il sistema.
     *
     * ⛔ Ma MAI durante una generazione: liberare il contesto sotto i piedi di
     * chi sta decodificando è un crash nativo, non un risparmio. Chi sta
     * aspettando una risposta aspetta anche il rischio.
     *
     * ⚠️ Misurato dalla documentazione, non supposto: {@code onLowMemory} non
     * viene più chiamato dall'API 34, e {@code TRIM_MEMORY_RUNNING_CRITICAL}
     * non viene più recapitato. Una politica appesa a quei due sarebbe stata
     * scritta e mai eseguita.
     */
    private ComponentCallbacks2 pressioneMemoria;

    @Override
    public void load() {
        // Capacitor non ha un aggancio per la pressione di memoria: si ascolta
        // il sistema direttamente, e ci si stacca quando l'Activity se ne va.
        pressioneMemoria = new ComponentCallbacks2() {
            @Override public void onTrimMemory(int level) { rilasciaSePossibile(level); }
            @Override public void onLowMemory() { rilasciaSePossibile(TRIM_MEMORY_UI_HIDDEN); }
            @Override public void onConfigurationChanged(android.content.res.Configuration c) { }
        };
        getContext().getApplicationContext().registerComponentCallbacks(pressioneMemoria);
    }

    private void rilasciaSePossibile(int level) {
        if (openEngine.get() == null) return;
        if (generating.get()) {
            // Non è un rifiuto: è un rinvio. Alla fine della generazione il
            // prossimo segnale ci ritroverà liberi.
            return;
        }
        final boolean fuoriDallaVista = level >= TRIM_MEMORY_UI_HIDDEN;
        final boolean sottoPressione = level >= TRIM_MEMORY_RUNNING_LOW;
        if (!fuoriDallaVista && !sottoPressione) return;
        worker.execute(this::closeOpenModel);
    }

    /**
     * Le soglie di {@link android.content.ComponentCallbacks2}, dichiarate qui
     * perché il plugin non estende una Activity e i nomi valgono più dei numeri.
     */
    private static final int TRIM_MEMORY_RUNNING_LOW = 10;
    private static final int TRIM_MEMORY_UI_HIDDEN = 20;
}
