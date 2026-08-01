package ai.talos;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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
    private final AtomicReference<TalosLlamaEngine> openEngine = new AtomicReference<>(null);
    private final AtomicReference<String> openPath = new AtomicReference<>(null);
    /** True from the moment a generation is accepted until it has finished. */
    private final AtomicBoolean generating = new AtomicBoolean(false);

    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", TalosLlamaNative.AVAILABLE);
        // The registered ggml backends, verbatim. The interface may show them;
        // nothing here concludes anything from them — that is the arbiter's job.
        result.put("backends", TalosLlamaEngine.backends(getContext()));
        result.put("loadedPath", openPath.get());
        call.resolve(result);
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

        worker.execute(() -> {
            closeOpenModel();
            TalosLlamaEngine engine = TalosLlamaEngine.open(
                    getContext(), path, threads, contextTokens, gpuLayers);
            if (engine == null) {
                call.reject("TALOS_LLAMA_OPEN_FAILED");
                return;
            }
            openEngine.set(engine);
            openPath.set(path);
            JSObject result = new JSObject();
            result.put("contextTokens", engine.contextTokens());
            call.resolve(result);
        });
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
        final boolean stopAtEnd = call.getData().has("stopAtEndOfGeneration")
                ? Boolean.TRUE.equals(call.getBoolean("stopAtEndOfGeneration"))
                : true;

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
            // THE DECODE RUNS HERE, on the thread that owns the engine.
            //
            // It used to run on a thread of its own while this one polled it,
            // and that had a hole with teeth: if the poll loop was interrupted,
            // `join()` was skipped, this task returned, and the next task on the
            // worker — an `open`, which begins by closing what is loaded — freed
            // the context out from under a decode still running on the orphan.
            // A use-after-free that would land as a crash report from someone
            // else's phone.
            //
            // The reference implementation in llama.cpp's own Android example
            // does the same thing: a dispatcher of parallelism one, with load,
            // generation and unload all on it — its `cleanUp()` even blocks on
            // that queue rather than racing the generation it wants to stop.
            // Watching is the only thing left outside, because watching touches
            // no context: it reads text that was already published, under the
            // lock that published it.
            final AtomicBoolean done = new AtomicBoolean(false);
            final AtomicInteger sent = new AtomicInteger(0);
            Thread watcher = new Thread(() -> {
                while (!done.get()) {
                    sent.set(emitDelta(engine, sent.get()));
                    try {
                        Thread.sleep(POLL_INTERVAL_MS);
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
            }, "talos-llama-watch");
            watcher.start();

            try {
                engine.generateBlocking(prompt, maxTokens, stopAtEnd);
            } finally {
                done.set(true);
                watcher.interrupt();
                try {
                    watcher.join(1_000L);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
                // One last read AFTER the generation has finished. The final
                // tokens land between the last poll and the end, and dropping
                // them would clip a word or two off every answer — a defect that
                // reads as the model being strange rather than as us losing text.
                emitDelta(engine, sent.get());
                generating.set(false);
            }

            JSObject result = new JSObject();
            result.put("text", engine.textSoFar());
            result.put("tokens", engine.tokensProduced());
            call.resolve(result);
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
        TalosLlamaEngine engine = openEngine.get();
        if (engine == null) {
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
        String prompt = engine.chatPrompt(roles, contents);
        if (prompt == null || prompt.isEmpty()) {
            // Named, so the interface can say WHY instead of producing a worse
            // answer that looks like the model's fault.
            call.reject("TALOS_LLAMA_NO_CHAT_TEMPLATE");
            return;
        }
        JSObject result = new JSObject();
        result.put("prompt", prompt);
        call.resolve(result);
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
        closeOpenModel();
        worker.shutdownNow();
    }
}
