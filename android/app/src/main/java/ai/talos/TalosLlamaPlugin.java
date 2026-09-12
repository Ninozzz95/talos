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
import java.util.concurrent.atomic.AtomicLong;
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

    /**
     * ⭐⭐⭐ CON QUALI MANOPOLE DI CARICAMENTO è aperto il modello che c'è ora.
     *
     * ⛔ Non è contabilità: senza questi due, chiedere un {@code loadMode}
     * diverso sullo STESSO file finirebbe nella strada veloce qui sotto — che
     * riusa i pesi già in memoria apposta per non ripagare i gigabyte — e la
     * manopola non avrebbe alcun effetto, in silenzio, mentre chi misura crede
     * di aver misurato. È lo stesso avviso che PocketPal mette sotto i suoi
     * interruttori («Model reload needed for changes to take effect»), con la
     * differenza che qui non lo si chiede all'utente: lo si applica.
     */
    private final AtomicReference<String> openLoadMode = new AtomicReference<>("default");
    private volatile int openWeightRepack = -1;

    /**
     * ⭐⭐⭐ SU QUALE MOTORE sono stati caricati i pesi che ci sono ora.
     *
     * ⛔ Stessa ragione dei due qui sopra, e la stessa trappola: il bersaglio
     * di offload vive in {@code llama_model_params.devices}, cioè in DOVE i
     * tensori sono stati allocati. {@link TalosLlamaEngine#reopenContext}
     * rifà il contesto e riusa i pesi apposta — quindi passare da CPU a GPU
     * senza questo confronto tornerebbe {@code ok} e lascerebbe tutto dov'era.
     *
     * ⇒ È esattamente «backend selezionabile ≠ backend realmente utilizzato»,
     * il difetto che l'owner ha chiesto di non ereditare (2026-09-10). Qui non
     * lo si scrive in un avviso: lo si rende impossibile.
     */
    private final AtomicReference<String> openBackend = new AtomicReference<>("");
    private final AtomicReference<String> openDevice = new AtomicReference<>("");
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
        /*
         * ⛔⛔⛔ `open()` crea il motore sul worker single-thread, mentre questa
         * entrypoint nasce dal bridge Capacitor e parte su `CapacitorPlugins`.
         * Anche le letture apparentemente innocue (`modelShape`, cache,
         * contesto e runtime) sono proprietà del contesto nativo posseduto dal
         * worker. Sul Pad questo varco terminava con
         * `TALOS_LLAMA_FUORI_DALL_ATTORE` prima del primo token locale.
         *
         * Il ritratto viene quindi costruito sullo stesso attore che possiede il
         * motore. La risposta al bridge può arrivare da quel worker; è il
         * contratto già usato dalle altre operazioni native del plugin.
         */
        worker.execute(() -> {
            try {
                availableOnActor(call);
            } catch (Exception errore) {
                call.reject(
                    "TALOS_LLAMA_AVAILABLE_FAILED: " + String.valueOf(errore.getMessage()),
                    "TALOS_LLAMA_AVAILABLE_FAILED",
                    errore
                );
            }
        });
    }

    /** Builds the availability snapshot on the executor that owns the engine. */
    private void availableOnActor(PluginCall call) {
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
         * B1 — la snapshot unica, letta con UNA chiamata nativa invece di
         * tre separate (kvCacheType/contextTokens/runtimeConfig prima).
         * Ogni campo qui è ciò che il motore ha DAVVERO applicato, non ciò
         * che qualcuno gli aveva chiesto — stessa disciplina di prima, un
         * varco nativo solo invece di tre.
         *
         * ⛔ Un JSON malformato/mancante non è un "no" silenzioso qui
         * nemmeno lui: `available` resta vero, gli altri campi restano
         * quelli che si sono già scritti sopra, e nessuno di questi campi
         * compare — la stessa regola di `deviceOffersOpenCl()`, "un dubbio
         * non offre, non inventa".
         */
        if (aperto != null) {
            String snapshotJson = aperto.runtimeSnapshot();
            if (snapshotJson != null) {
                try {
                    JSONObject snapshot = new JSONObject(snapshotJson);
                    result.put("kvCacheType", snapshot.getString("kvCacheType"));
                    result.put("contextTokens", snapshot.getInt("contextTokens"));
                    result.put("threads", snapshot.getInt("threads"));
                    result.put("threadsBatch", snapshot.getInt("threadsBatch"));
                    result.put("microBatch", snapshot.getInt("microBatch"));
                    result.put("gpuLayersEffective", snapshot.getInt("gpuLayersEffective"));
                    result.put("flashAttnEffective", snapshot.getString("flashAttnEffective"));
                    // Le manopole di caricamento, dallo schema 2 in poi.
                    // ⛔ Si CHIEDE se il campo c'è invece di leggerlo con un
                    // ripiego: una snapshot di schema 1 non ha `weightRepack`,
                    // e un ripiego lo farebbe comparire come `false` — cioè
                    // una risposta, e sbagliata. Non comparire affatto è la
                    // sola cosa vera che si possa dire.
                    if (snapshot.has("loadMode")) {
                        result.put("loadMode", snapshot.getString("loadMode"));
                        result.put("weightRepack", snapshot.getBoolean("weightRepack"));
                        result.put("mmapSupported", snapshot.getBoolean("mmapSupported"));
                        result.put("mlockSupported", snapshot.getBoolean("mlockSupported"));
                    }
                    if (!snapshot.isNull("backendDevice")) {
                        result.put("backendDevice", snapshot.getString("backendDevice"));
                    }
                    /*
                     * ⛔⛔ I due fatti che permettono di distinguere «gira su
                     * CPU» da «non so dove gira». Schema 3 in poi, e si CHIEDE
                     * se il campo c'è: un ripiego li farebbe comparire come 0
                     * e false, cioè come due risposte, e sbagliate.
                     *
                     * {@code offloadDevices == 0} è l'unico modo per dire con
                     * certezza che una richiesta di GPU non poteva essere
                     * onorata in questa build — che è, oggi, il caso di ogni
                     * build di DEBUG: in {@code app/build.gradle} GGML_OPENCL
                     * entra solo nel blocco {@code release}.
                     */
                    if (snapshot.has("offloadDevices")) {
                        result.put("offloadDevices", snapshot.getInt("offloadDevices"));
                        result.put("threadPoolSplit", snapshot.getBoolean("threadPoolSplit"));
                    }
                } catch (JSONException malformed) {
                    android.util.Log.w("TalosLlama", "runtimeSnapshot malformata", malformed);
                }
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
        /*
         * ⛔⛔ FASE 7(c) — il campo che era SEMPRE zero, mai passato da nessun
         * chiamante in `src/`. Ora: se chi chiama lo chiede esplicitamente,
         * vince la sua richiesta — invariato. Se non lo chiede, la richiesta
         * la fa {@link TalosBackendChoice}, sull'evidenza registrata per
         * questo driver ({@link TalosBackendEvidenceStore}).
         *
         * ⛔ Quello che questo NON fa: nessun sondaggio parte da qui. Se
         * nessuno ha mai registrato un'evidenza per il driver di oggi
         * (`Build.FINGERPRINT` — cambia a ogni aggiornamento di sistema, più
         * prudente che preciso: un aggiornamento che non tocca il driver GPU
         * fa comunque ripartire la prova, mai il contrario), `choose()`
         * torna "unproven" e il comportamento è quello di sempre: CPU, zero
         * strati. Decidere QUANDO far girare una prova reale — costa una
         * generazione vera, tempo e batteria — è una scelta di prodotto che
         * questa consegna non include.
         */
        /*
         * ⭐⭐⭐ L'ARBITRO ADESSO CONOSCE L'NPU, e sa su quale FILE sta decidendo.
         *
         * ⛔ Il permesso si legge dall'intestazione di QUESTO modello, non dal
         * telefono: l'evidenza vive per driver, il formato dei pesi cambia a
         * ogni modello. Costa un `open` e qualche kilobyte (`no_alloc`), e si
         * paga prima di aprire — aprire per sapere dove aprire vorrebbe dire
         * pagare i pesi due volte.
         */
        final TalosBackendChoice.Decision arbitro = TalosBackendChoice.choose(
                android.os.Build.FINGERPRINT,
                TalosThermal.read(getContext()),
                TalosBackendEvidenceStore.load(getContext()),
                formatoPerNpu(path));
        final int gpuLayers = call.getData().has("gpuLayers")
                ? call.getInt("gpuLayers", 0)
                : TalosBackendChoice.gpuLayers(arbitro);
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
        /*
         * ⭐⭐⭐ COME i pesi entrano in memoria — mmap, mlock, ripacchettamento.
         *
         * ⛔⛔ IL PREDEFINITO È «COME OGGI», E RESTA TALE FINCHÉ NON C'È LA
         * MISURA. `"default"` vuol dire che nessuno tocca
         * `llama_model_params.load_mode`, quindi vale il predefinito di
         * llama.cpp — `LLAMA_LOAD_MODE_AUTO` — che è esattamente ciò che TALOS
         * ha sempre fatto. La manopola diventa raggiungibile; il comportamento
         * non cambia di un millesimo.
         *
         * ⇒ ⛔ QUANDO ARRIVA LA MISURA, LA RIGA DA CAMBIARE È QUESTA QUI SOTTO,
         * e nessun'altra: il secondo argomento di `call.getString("loadMode", …)`.
         * La matrice `auto/none/mmap/mmap+mlock` × CPU/GPU × Q4_0/Q4_K_M sul Pad
         * vero sta girando adesso e finisce in
         * `.claude/TACCUINO-VELOCITA-LOCALE-2026-09-10.md`.
         *
         * ⛔ E il valore giusto potrebbe non essere una costante. Un dispositivo
         * con poca RAM libera e un modello grande non vuole lo stesso `mlock` di
         * un tablet da 12 GB, e questo progetto ha già pagato una volta un numero
         * unico per ogni dispositivo (vedi il commento su
         * `TALOS_LOCAL_MAX_CONTEXT_TOKENS` in `src/lib/models/localContextPolicy.ts`,
         * owner 2026-08-05: «TALOS è dinamico e adattabile a ogni modello — una
         * cosa scritta a mano non potrebbe mai esistere»). Il posto dove quella
         * scelta diventerà una FUNZIONE della RAM e della taglia del modello è il
         * chiamante — `talosLocalEngineOpen` in TypeScript, che quei numeri già li
         * ha. ⛔ Ma non si inventa una soglia senza un dato: oggi il buco è
         * dichiarato, non riempito.
         */
        /*
         * ⭐⭐⭐ DOVE far girare il modello — la scelta dell'utente, 2026-09-10.
         *
         * Owner: «LA SCELTA RESTA ALL UTENTE, SCEGLIE SEMPRE LUI, CPU GPU O
         * HEXAGON, DI DEFAULT SCEGLIAMO QUELLO PIU VELOCE (DI SOLITO GPU)».
         *
         * ⛔ Vuoto = nessuna richiesta = come si è sempre fatto: llama.cpp
         * sceglie da sé e {@link TalosBackendChoice} decide solo QUANTI strati.
         * Il predefinito non cambia di un millesimo finché il chiamante non
         * nomina qualcosa.
         *
         * ⛔ E chi nomina qualcosa lo ottiene o lo sa: un registry che non si
         * risolve fa fallire l'apertura invece di ripiegare in silenzio sulla
         * CPU. La differenza fra «l'ho scelto» e «sta girando» è tutta qui.
         */
        /*
         * ⛔⛔ E SE NESSUNO NOMINA NIENTE, LO NOMINA L'ARBITRO.
         *
         * Con OpenCL e HTP entrambi registrati — da oggi, su questo Pad —
         * `gpuLayers = -1` senza un nome lascia scegliere all'ordine di
         * caricamento delle librerie. La chat chiederebbe «tutti gli strati» e
         * finirebbe su uno dei due a sorte, con la misura dell'altro in mano.
         *
         * ⛔ Chi nomina qualcosa continua a vincere, invariato: questo entra
         * solo nel caso «nessuna richiesta», dove prima c'era il sorteggio.
         * E quando l'arbitro sceglie la CPU la stringa resta vuota, perche'
         * con zero strati non c'e' niente da nominare.
         */
        final String backendChiesto = call.getString("backend", "");
        final String backendName = !backendChiesto.isEmpty()
                ? backendChiesto
                : (call.getData().has("gpuLayers")
                        ? "" : TalosBackendChoice.registryOf(arbitro));
        final String deviceName = call.getString("device", "");
        final String loadMode = call.getString("loadMode", "default");
        final Boolean repackChiesto = call.getBoolean("weightRepack", null);
        // Tri-stato: assente NON è «acceso». Solo così il predefinito resta
        // quello di upstream anche il giorno in cui upstream lo cambia.
        final int weightRepack = repackChiesto == null ? -1 : (repackChiesto ? 1 : 0);
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
            /*
             * ⛔⛔ LA STRADA VELOCE NON PUÒ INGHIOTTIRE UNA MANOPOLA DI
             * CARICAMENTO. `reopenContext` rifà il contesto e RIUSA i pesi già
             * in memoria — è tutto il suo valore, 111 s contro 195 ms —, ma
             * `load_mode` e `use_extra_bufts` stanno in `llama_model_params`,
             * cioè in come quei pesi sono stati LETTI dal disco. Riusarli vuol
             * dire tenersi la vecchia modalità.
             *
             * Senza questo confronto la manopola sarebbe stata raggiungibile e
             * inefficace insieme: il chiamante chiede `mmap+mlock`, la risposta
             * torna `ok`, e i pesi sono ancora quelli caricati in `auto`. È il
             * difetto peggiore di tutti — quello che non dà errore — e questo
             * file ne ha già visti abbastanza.
             */
            /*
             * ⛔ Il bersaglio entra in QUESTA guardia e non in una sua: è una
             * proprietà di come i pesi sono stati allocati, esattamente come
             * `load_mode` e `use_extra_bufts`. Un confronto separato sarebbe
             * due guardie che possono divergere; una sola non può.
             */
            final boolean stesseManopoleDiCarico =
                    loadMode.equals(openLoadMode.get()) && weightRepack == openWeightRepack
                    && backendName.equals(openBackend.get())
                    && deviceName.equals(openDevice.get());
            if (aperto != null && path.equals(openPath.get()) && stesseManopoleDiCarico) {
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
                    threadsBatch, microBatch, kvType, loadMode, weightRepack,
                    backendName, deviceName);
            TalosLlamaEngine engine = attempt.engine();
            if (engine == null) {
                JSObject failure = new JSObject();
                failure.put("stage", attempt.failureStage().wireValue());
                call.reject("TALOS_LLAMA_OPEN_FAILED", "TALOS_LLAMA_OPEN_FAILED", failure);
                return;
            }
            openEngine.set(engine);
            /*
             * ⛔ L'uso locale e' tornato: un contratto a tempo pendente si
             * annulla. Senza, il modello appena aperto potrebbe sparire fra un
             * secondo perche' una vecchia finestra stava per scadere — cioe' il
             * peggior momento possibile, subito dopo aver pagato l'apertura.
             */
            contrattoCaldo.ripreso();
            openPath.set(path);
            // Con che cosa sono stati letti QUESTI pesi: è la domanda a cui il
            // giro successivo deve poter rispondere prima di riusarli.
            openLoadMode.set(loadMode);
            openWeightRepack = weightRepack;
            openBackend.set(backendName);
            openDevice.set(deviceName);
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
     * ⭐⭐⭐ QUALI MOTORI ENTRANO DAVVERO, e per gli altri PERCHÉ no.
     *
     * ## Perché serve, misurato sul Pad il 2026-09-10
     *
     * Trenta strati su trenta assegnati alla CPU, e nel pacchetto installato
     * c'erano **3,2 MB** di `libggml-opencl.so` che nessuno eseguiva. Il driver
     * di sistema c'è (`/vendor/lib64/libOpenCL.so`) ed è nell'elenco delle
     * librerie **pubbliche**, quindi un'app può caricarlo; la nostra libreria lo
     * cerca davvero (`clGetPlatformIDs` fra i suoi simboli). Eppure nel logcat
     * di un caricamento vero non c'era **nessuna** riga di registrazione.
     *
     * ⛔ E non poteva esserci: `ggml_backend_load_all_from_path` sceglie
     * `silent = true` sotto `NDEBUG`, e la nostra è una build di rilascio. Un
     * fallimento di caricamento è **muto per costruzione**. È un problema noto
     * upstream con `GGML_BACKEND_DL`, dove «no backends are loaded» pur essendo
     * i file al loro posto —
     * https://github.com/ggml-org/llama.cpp/issues/22547 e
     * https://github.com/ggml-org/llama.cpp/discussions/12821 (letti il
     * 2026-09-10).
     *
     * ## Perché un metodo a parte e non l'inventario
     *
     * {@link TalosLlamaNative#nativeBackendInventory()} dice **chi c'è**.
     * Questa dice **perché qualcuno manca**: prova ogni `libggml-*.so` della
     * cartella una per una, con `silent = false`, e per ognuna riporta se è
     * entrata. Sono le due metà della stessa domanda, e finora ne avevamo una.
     *
     * ⛔ Il nativo esisteva già, completo, dal giorno in cui è stato scritto —
     * e **nessuno lo chiamava**: una sola riga in tutto il progetto, la
     * dichiarazione `native`. Questo metodo è quella chiamata.
     *
     * ⛔ NON si esegue da sola all'avvio: caricare ogni libreria ha effetti
     * (registra backend), e un effetto che nessuno ha chiesto non appartiene a
     * un percorso automatico. È un'azione esplicita, come il sondaggio della
     * GPU.
     */
    @PluginMethod
    public void probeBackendLoad(PluginCall call) {
        android.content.Context context = getContext();
        String cartella = context == null ? "" : context.getApplicationInfo().nativeLibraryDir;
        worker.execute(() -> {
            long inizio = System.nanoTime();
            TalosLlamaNative.ensureReady(context);
            String report = TalosLlamaNative.nativeProbeBackendLoad(cartella);
            JSObject result = new JSObject();
            result.put("report", report == null ? "" : report);
            result.put("ms", (System.nanoTime() - inizio) / 1_000_000L);
            call.resolve(result);
        });
    }

    /**
     * ⭐⭐⭐ IL FORMATO DEI PESI, letto dal file PRIMA di aprirlo.
     *
     * Misurato sul Pad l'11/09/2026 — stesso modello, stesso giorno, cambia
     * solo il formato:
     *
     * <pre>
     *   Qwen3-4B  Q4_0     NPU  lettura 1126 t/s   scrittura 14,0
     *   Qwen3-4B  Q4_K_M   NPU  lettura   55,7     scrittura  5,0
     *                      GPU  lettura  206       scrittura 16,7
     * </pre>
     *
     * ⛔ **Venti volte piu' lenta**, e quattro volte sotto la GPU: accendere
     * l'NPU su un Q4_K_M rende l'app peggiore di non averla. E il catalogo e'
     * 14 Q4_K_M contro 7 Q4_0.
     *
     * ⛔ PRIMA di aprire, non dopo: la scelta del motore si fa prima
     * dell'apertura, e aprire per sapere dove aprire vorrebbe dire pagare i
     * pesi due volte — difetto che questo progetto ha gia' pagato una volta.
     *
     * ⛔ Legge solo l'intestazione GGUF (`no_alloc`), non i pesi: costa un
     * `open` e qualche kilobyte.
     *
     * ⛔ `fileType = -1` significa **non dichiarato**, e non e' `0` — che e'
     * `F32`, un formato vero. Chi legge deve distinguere i due.
     */
    @PluginMethod
    public void modelFormat(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        worker.execute(() -> {
            TalosLlamaNative.ensureReady(getContext());
            String json = TalosLlamaNative.AVAILABLE
                    ? TalosLlamaNative.nativeArchitectureOf(path)
                    : null;
            call.resolve(new JSObject().put("format", json == null ? "" : json));
        });
    }

    /**
     * ⭐⭐⭐ A CHE PUNTO E' IL CARICAMENTO — la meta' dell'attesa che finora
     * nessun numero dichiarava.
     *
     * Misurato sul Pad il 10/09 (ledger §44): aprire `gemma-4-E2B-it-Q4_0`
     * sulla GPU costa **50 secondi** di soli tensori, su 76 totali fino alla
     * prima parola. La riga sotto la risposta ne dichiarava **24,2**, perche'
     * il suo orologio parte a modello gia' aperto.
     *
     * ⛔ NON e' un evento che arriva da solo: si chiede. Il nativo tiene un
     * contatore atomico e questa lo legge — stesso schema di
     * {@code nativeTokensProduced}, e per lo stesso motivo scritto in testa al
     * JNI: una callback per tensore attraverserebbe il confine 601 volte.
     *
     * ⛔ {@code permille == -1} vuol dire **«non sta caricando»**, e chi disegna
     * la barra deve distinguerlo da {@code 0}. Il campo {@code loading} lo dice
     * a parole, cosi' il lato JS non deve conoscere la convenzione del -1.
     *
     * ⛔ FUORI dal {@code worker}, apposta: e' la lettura di un intero atomico e
     * viene chiesta ogni poche centinaia di millisecondi MENTRE il worker e'
     * fermo dentro il caricamento. Metterla in coda sullo stesso executor
     * significherebbe riceverne la risposta quando il caricamento e' finito —
     * cioe' mai quando serve.
     */
    @PluginMethod
    public void loadProgress(PluginCall call) {
        int permille = TalosLlamaNative.nativeLoadProgressPermille();
        // ⛔ Solo mentre carica DAVVERO: a -1 questa riga uscirebbe due volte al
        // secondo per tutta la durata di qualunque attesa, e seppellirebbe il
        // log proprio quando serve. La riga esiste perche' e' quella che ha
        // provato che la catena funziona (ledger §46): il contatore passa da
        // -1 a 0 quando il caricamento parte, e risale 0 → 70 → 566 → 951.
        if (permille >= 0) {
            android.util.Log.i("TalosCarico", "loadProgress: permille=" + permille);
        }
        JSObject result = new JSObject();
        result.put("permille", permille);
        result.put("loading", permille >= 0);
        call.resolve(result);
    }

    /**
     * Ferma il caricamento in corso — il pulsante «annulla» accanto alla barra.
     *
     * ⛔ Non e' un errore chiamarlo quando non sta caricando niente: il nativo
     * azzera il flag all'inizio di ogni apertura, quindi una pressione fuori
     * tempo non puo' uccidere il caricamento successivo.
     *
     * ⛔ Chi stava aprendo riceve {@code 0} da {@code nativeOpen} esattamente
     * come per un errore: la differenza si legge in
     * {@code nativeLastOpenError}, che dice {@code load-cancelled}. A schermo
     * devono restare due frasi diverse — «l'hai fermato tu» non e' «non ce l'ha
     * fatta».
     */
    @PluginMethod
    public void cancelLoad(PluginCall call) {
        TalosLlamaNative.nativeCancelLoad();
        call.resolve(new JSObject().put("ok", true));
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
                Thread watcher = new Thread(() -> {
                    while (!done.get()) {
                        try {
                            emitDelta(engine);
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
                    emitDelta(engine);
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

    /**
     * Emette il testo NUOVO da consegnare a Vue.
     *
     * ⛔ Il delta lo calcola il NATIVO: `drainText` torna solo i byte mai
     * consegnati, tagliati all'ultimo carattere completo. Prima il taglio era in
     * Java (`substring(sent)`) e il nativo copiava TUTTA la risposta a ogni
     * sguardo — quadratico sulla lunghezza. Il parametro `sent` sparisce:
     * il puntatore vive nel nativo, e due contatori sarebbero due modi di
     * dissentire su quanto e' stato mandato.
     */
    private void emitDelta(TalosLlamaEngine engine) {
        String delta = engine.drainText();
        if (delta == null || delta.isEmpty()) return;
        JSObject event = new JSObject();
        event.put("delta", delta);
        notifyListeners("token", event);
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
        final String messagesJson = turns.toString();
        worker.execute(() -> {
        // ⛔ Il ragionamento si CHIEDE. `enable_thinking` nasce acceso in
        // llama.cpp e non lo toccavamo: TALOS domandava a Qwen3 di ragionare
        // anche per «ciao», ignorando l'impostazione della persona. Il
        // predefinito qui è ACCESO — chi non manda il campo ha il
        // comportamento di prima, e nessun invio cambia senza dirlo.
        boolean pensa = !Boolean.FALSE.equals(call.getBoolean("thinking", Boolean.TRUE));
            String json = TalosLlamaEngine.planPrompt(path, messagesJson, toolsJson, pensa);
            if (json == null) {
                call.reject("TALOS_LLAMA_PLAN_FAILED");
                return;
            }
            JSObject result = new JSObject();
            result.put("plan", json);
            call.resolve(result);
        });
    }

    /**
     * Espone solo i capability bit del Jinja incorporato nel GGUF. Il modello
     * viene aperto vocab-only dal nativo: nessun tensore, prompt o template
     * sorgente attraversa questo confine.
     */
    @PluginMethod
    public void templateCapabilities(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        worker.execute(() -> {
            String capabilities = TalosLlamaEngine.templateCapabilities(path);
            if (capabilities == null || capabilities.isEmpty()) {
                call.reject("TALOS_LLAMA_TEMPLATE_CAPABILITIES_FAILED");
                return;
            }
            JSObject result = new JSObject();
            result.put("capabilities", capabilities);
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
        final String messagesJson = turns.toString();
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
            String prompt = attivo.chatPrompt(messagesJson, toolsJson, pensa);
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

    /**
     * ⛔⛔ SOLO RICERCA — imposta la famiglia di affinity CPU per il PROSSIMO
     * open/reopen. Bypassa `TalosLlamaEngine`: chiama il nativo direttamente,
     * lo stesso pattern degli altri export "SOLO RICERCA" (cache OpenCL, FA
     * override) — non fa parte del percorso di produzione, esiste solo per
     * la campagna di misura di P1-1.
     */
    @PluginMethod
    public void setAffinityFamilyForResearch(PluginCall call) {
        final int famigliaDecode = call.getInt("familyDecode", 0);
        final int famigliaPrefill = call.getInt("familyPrefill", 0);
        TalosLlamaNative.nativeSetAffinityFamilyForResearch(famigliaDecode, famigliaPrefill);
        call.resolve();
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
        // Insieme al percorso: un modello chiuso non è aperto «in default», è
        // proprio non aperto, e il giro dopo non deve confrontarsi con residui.
        openLoadMode.set("default");
        openWeightRepack = -1;
        openBackend.set("");
        openDevice.set("");
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
    private final TalosContrattoCaldo contrattoCaldo = new TalosContrattoCaldo();

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
        /*
         * ⛔ La decisione la prende `TalosContrattoCaldo`, provata a tavolino con
         * una tabella di casi. Qui restano solo gli effetti: chiedere, e chiudere
         * dentro l'attore. Prima questa riga scaricava a OGNI UI_HIDDEN — anche
         * col telefono pieno di memoria — e riaprire costa 4 secondi caldi,
         * misurati sul Pad.
         */
        if (contrattoCaldo.vaScaricato(level, android.os.SystemClock.uptimeMillis())) {
            worker.execute(this::closeOpenModel);
        }
    }

    /**
     * Le soglie di {@link android.content.ComponentCallbacks2}, dichiarate qui
     * perché il plugin non estende una Activity e i nomi valgono più dei numeri.
     */
    private static final int TRIM_MEMORY_RUNNING_LOW = 10;
    private static final int TRIM_MEMORY_UI_HIDDEN = 20;

    /**
     * ⛔⛔ FASE 0.1.17, §1-bis della consegna 0.1.18 — l'ULTIMO pezzo, quello
     * che l'agente aveva dichiarato mancante da sé: nessun codice decideva
     * QUANDO far girare il sondaggio che riempie
     * {@link TalosBackendEvidenceStore}. Prima di questo metodo, la GPU
     * spedita nella build di rilascio non si accendeva su nessun telefono —
     * `choose()` tornava sempre "unproven" perché lo store era sempre vuoto.
     *
     * ⛔ Esecutore SEPARATO da {@link #worker}: il sondaggio apre due motori
     * indipendenti (CPU e, se compilata, OpenCL) e può costare decine di
     * secondi. Se girasse sulla stessa coda di {@link #open}/{@link #run},
     * una persona che ha appena detto sì al sondaggio vedrebbe il primo
     * messaggio della chat aspettare la sua fine — esattamente quello che
     * §1-bis vieta: «non blocca la chat».
     */
    private final ExecutorService qualificationWorker = Executors.newSingleThreadExecutor();

    /**
     * Misurato il 21/8: la prima corsa sulla CPU fredda di questo Pad usciva
     * `UNSTABLE` tre volte di fila — il governor di frequenza rampa dentro la
     * finestra di misura. Ogni tentativo scalda il chip un po' di più, quindi
     * pochi tentativi bastano; non è un numero a caso, è quanti ne sono
     * serviti a convergere qui.
     *
     * ⛔ Package-private, non `private`: P0-3/CR-06 vieta esplicitamente "un
     * 9-run/sustained sweep automatico al primo 'ciao'" — questa è la riga
     * che lo rispetta o lo rompe, e {@link TalosLlamaPluginQualificationBudgetTest}
     * deve poterla leggere per accorgersi se qualcuno la alza verso la
     * soglia da laboratorio (9, il numero di Q2) senza passare da un
     * cancello esplicito.
     */
    static final int MAX_PROBE_ATTEMPTS = 4;

    /**
     * Fa girare il sondaggio, se e quanto serve davvero, e restituisce cosa
     * ha fatto — mai un «fatto» muto: la scheda ha bisogno di sapere se ha
     * girato, e su cosa.
     */
    @PluginMethod
    public void qualifyBackend(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty() || !new File(path).isFile()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        if (!TalosLlamaNative.AVAILABLE) {
            call.reject("TALOS_LLAMA_UNAVAILABLE");
            return;
        }
        qualificationWorker.execute(() -> call.resolve(runQualification(path)));
    }

    /**
     * P1-5 — i profili misurati per QUESTO modello, sull'identità di ADESSO
     * (engine/model/driver): il primo consumatore reale di
     * {@link TalosLocalProfileStore}, scritto in P0-2 e mai letto da
     * nessuno finché questo blocco non arriva.
     *
     * ⛔ `loadValid`, non `load`: un profilo misurato con un engine build
     * diverso da quello di adesso non è "incompleto", è per un motore che
     * non esiste più su questo telefono — non deve mai finire nel calcolo
     * del selettore. Nessuna qualificazione parte da qui: sola lettura di
     * ciò che è già stato misurato altrove (`qualifyBackend`).
     */
    @PluginMethod
    public void localPerformanceProfiles(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty() || !new File(path).isFile()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        qualificationWorker.execute(() -> {
            android.content.Context context = getContext();
            String modelSha256 = sha256Del(path);
            if (modelSha256 == null) {
                call.resolve(new JSObject().put("profiles", new JSArray()));
                return;
            }
            TalosLocalProfileIdentity identita =
                    TalosLocalProfileIdentity.current(modelSha256, new File(path).length());
            JSArray profiles = new JSArray();
            for (TalosLocalProfile profilo : TalosLocalProfileStore.loadValid(context, identita)) {
                JSObject row = new JSObject();
                row.put("backendRegistry", profilo.backendRegistry);
                row.put("backendDevice", profilo.backendDevice == null ? JSObject.NULL : profilo.backendDevice);
                row.put("outcome", profilo.outcome == TalosBackendChoice.Outcome.CORRECT ? "CORRECT" : "FAILED");
                row.put("ttftMs", profilo.ttftMs);
                row.put("decodeTokPerSec", profilo.decodeTokPerSec);
                row.put("prefillTokPerSec", profilo.prefillTokPerSec);
                row.put("openMs", profilo.openMs);
                row.put("qualificationLevel", profilo.qualificationLevel.name());
                row.put("measuredAtMs", profilo.measuredAtMs);
                profiles.put(row);
            }
            call.resolve(new JSObject().put("profiles", profiles));
        });
    }

    /**
     * P2-3 blocco 2 — {@link TalosPerformanceSignals#sample}, raggiungibile
     * da JS. Girato su {@code qualificationWorker}, non su {@code worker}:
     * stessa ragione di {@code localPerformanceProfiles} sopra — legge
     * segnali del sistema, zero relazione con lo stato del motore nativo
     * che {@code worker} possiede — e le API headroom fanno Binder
     * sincrono (>1 ms documentato da Android) che non deve mai contendere
     * col thread che genera token.
     *
     * ⛔ NaN → {@code null} al confine JSON: {@code org.json.JSONObject.
     * put(String, double)} lancia un'eccezione sui valori non finiti, e
     * NaN è esattamente l'esito documentato "non disponibile ora" delle
     * API headroom (vedi {@link TalosPerformanceSignals}) — {@code null}
     * è lo stesso vocabolario che questo ponte usa già per "non misurato"
     * ({@code backendDevice} sopra), non un'invenzione nuova qui.
     */
    @PluginMethod
    public void performanceSignals(PluginCall call) {
        qualificationWorker.execute(() -> {
            TalosPerformanceSignals segnali = TalosPerformanceSignals.sample(getContext());
            JSObject result = new JSObject();
            result.put("cpuHeadroom", finitoONullo(segnali.cpuHeadroom));
            result.put("gpuHeadroom", finitoONullo(segnali.gpuHeadroom));
            result.put("thermalHeadroom", finitoONullo(segnali.thermalHeadroom));
            result.put("thermalForecast", finitoONullo(segnali.thermalForecast));
            result.put("thermalStatus", segnali.thermalStatus == null ? JSObject.NULL : segnali.thermalStatus);
            result.put("sampledAtElapsedMs", segnali.sampledAtElapsedMs);
            call.resolve(result);
        });
    }

    /** NaN → {@link JSObject#NULL}: org.json rifiuta i valori non finiti nel JSON. */
    private static Object finitoONullo(float valore) {
        return Float.isNaN(valore) ? JSObject.NULL : (double) valore;
    }

    /**
     * ⛔⛔ SOLO RICERCA — P2-2, il primo lettore reale di
     * {@code nativeCpuFeaturesForResearch()}: bug gia' chiuso una volta in
     * questo stesso file (P1-1 blocco 3, export nativo senza
     * {@code @PluginMethod} corrispondente, irraggiungibile da JS) —
     * collegato SUBITO qui, non lasciato scritto e non chiamato.
     *
     * Girato su {@code qualificationWorker}, non su {@code worker}: legge
     * feature statiche della CPU, zero relazione con lo stato del motore
     * nativo che {@code worker} possiede — lo stesso motivo per cui
     * {@code localPerformanceProfiles} sopra usa lo stesso executor.
     */
    @PluginMethod
    public void cpuFeaturesForResearch(PluginCall call) {
        qualificationWorker.execute(() -> {
            try {
                call.resolve(new JSObject(TalosLlamaNative.nativeCpuFeaturesForResearch()));
            } catch (org.json.JSONException malformato) {
                call.reject("TALOS_LLAMA_CPU_FEATURES_MALFORMED: " + malformato.getMessage());
            }
        });
    }

    /**
     * P0-3 — Q0: "il motore si apre e risponde", senza il costo di
     * {@link #qualifyBackend}. Nessuno store viene toccato — vedi
     * {@link TalosLocalSmokeCheck}, che spiega perché: un verdetto PASSED
     * qui non è una qualificazione, è l'assenza di un guasto grossolano.
     */
    @PluginMethod
    public void smokeCheckLocalBackend(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty() || !new File(path).isFile()) {
            call.reject("TALOS_LLAMA_PATH_REQUIRED");
            return;
        }
        if (!TalosLlamaNative.AVAILABLE) {
            call.reject("TALOS_LLAMA_UNAVAILABLE");
            return;
        }
        qualificationWorker.execute(() -> call.resolve(runSmokeCheck(path)));
    }

    /**
     * L'orchestrazione di Q0: apre col backend che la chat userebbe DAVVERO
     * in questo momento (stessa {@link TalosBackendChoice#choose} del
     * percorso `open()` normale, non un nuovo criterio inventato qui), poi
     * DUE giri sullo stesso motore — il golden completo, mai troncato, e lo
     * Stop, in un secondo giro dedicato — e lascia a
     * {@link TalosLocalSmokeCheck#judge} l'intera decisione.
     *
     * ⛔⛔⛔ MISURATO sul Pad, due volte, non dedotto:
     *
     * 1. Il primo tentativo creava un thread apposito per chiamare
     *    {@code engine.run(...)}, con l'idea che il thread di questo metodo
     *    restasse libero di chiamare {@code engine.cancel()} dopo un delay.
     *    È esploso al primo giro reale — `TALOS_LLAMA_FUORI_DALL_ATTORE`,
     *    `TalosLlamaEngine` impone che OGNI chiamata (tranne le vedette
     *    elencate al campo {@code attore}: cancel, tokensProduced,
     *    textSoFar, lastTimings) avvenga sul thread che ha aperto il
     *    motore. La cura: {@code run()} resta sul thread CORRENTE; il
     *    thread nuovo fa SOLO il delay e chiama {@code cancel()}.
     * 2. Il secondo tentativo faceva golden e Stop nello STESSO giro —
     *    genera, e a metà chiede il cancel. Un giro reale con questo prompt
     *    di otto token ha prodotto GOLDEN_MISMATCH: il cancel non era
     *    caduto durante il prefill come con il prompt più lungo di Q1, ma
     *    DOPO che qualche token era già uscito — il verdetto sembrava dire
     *    "il modello ha sbagliato" quando la verità era "l'ho interrotto
     *    prima che finisse". La cura: due giri separati, vedi
     *    {@link #misuraLatenzaStop}.
     */
    private JSObject runSmokeCheck(String path) {
        android.content.Context context = getContext();
        // ⛔ Stessa domanda di `open()`, stessa risposta — compreso il
        // permesso per l'NPU. Un fumo che apre su un motore diverso da quello
        // della chat non sta provando la chat.
        int gpuLayers = TalosBackendChoice.gpuLayers(TalosBackendChoice.choose(
                android.os.Build.FINGERPRINT, TalosThermal.read(context),
                TalosBackendEvidenceStore.load(context), formatoPerNpu(path)));

        TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                context, path, 4, 4096, gpuLayers, true);
        TalosLlamaEngine engine = attempt.engine();
        if (engine == null) {
            return esitoSmoke(TalosLocalSmokeCheck.Verdict.OPEN_FAILED, 0, null);
        }
        try {
            // Fase 1 — il golden: un giro COMPLETO, mai troncato dal cancel.
            TalosLlamaEngine.Run golden;
            try {
                golden = engine.run(
                        TalosLocalSmokeCheck.PROMPT, TalosLocalSmokeCheck.MAX_TOKENS,
                        () -> TalosThermal.read(context), TalosLlamaEngine.Mode.BENCHMARK);
            } catch (InterruptedException interrottaDurantelaGenerazione) {
                Thread.currentThread().interrupt();
                golden = null;
            }
            String testo = golden == null ? null : golden.text;

            // Fase 2 — lo Stop: un secondo giro, dedicato. Cosa produce non
            // conta qui, solo quanto ci mette il motore a tornare.
            long latenzaStopMs = misuraLatenzaStop(engine, context);

            return esitoSmoke(TalosLocalSmokeCheck.judge(testo, latenzaStopMs), latenzaStopMs, testo);
        } finally {
            engine.close();
        }
    }

    /**
     * Chiede lo Stop a metà di un secondo giro e misura quanto ci mette il
     * motore a tornare. {@code STOP_BUDGET_MS + 1} — sopra soglia per
     * costruzione — se il cancellatore stesso non è mai tornato: un guasto
     * diverso da "lento", ma {@link TalosLocalSmokeCheck#judge} lo vede
     * comunque come "non ce l'ha fatta", non come un falso PASSED silenzioso.
     */
    private static long misuraLatenzaStop(TalosLlamaEngine engine, android.content.Context context) {
        AtomicLong chiestoA = new AtomicLong(0);
        Thread cancellatore = new Thread(() -> {
            try {
                Thread.sleep(TalosLocalSmokeCheck.STOP_DELAY_MS);
            } catch (InterruptedException interrottoPrimaDelDelay) {
                Thread.currentThread().interrupt();
                return;
            }
            chiestoA.set(System.currentTimeMillis());
            engine.cancel();
        }, "talos-smoke-stop");
        cancellatore.start();
        try {
            // Sul thread CORRENTE — stesso motivo della fase 1.
            engine.run(TalosLocalSmokeCheck.PROMPT, TalosLocalSmokeCheck.MAX_TOKENS,
                    () -> TalosThermal.read(context), TalosLlamaEngine.Mode.BENCHMARK);
        } catch (InterruptedException interrottaDurantelaGenerazione) {
            Thread.currentThread().interrupt();
        }
        try {
            cancellatore.join(TalosLocalSmokeCheck.STOP_BUDGET_MS + 5_000);
        } catch (InterruptedException interrottaDurantelAttesa) {
            Thread.currentThread().interrupt();
        }
        if (cancellatore.isAlive() || chiestoA.get() == 0) {
            return TalosLocalSmokeCheck.STOP_BUDGET_MS + 1;
        }
        return System.currentTimeMillis() - chiestoA.get();
    }

    private static JSObject esitoSmoke(
            TalosLocalSmokeCheck.Verdict verdetto, long stopLatencyMs, String golden) {
        return new JSObject()
                .put("verdict", verdetto.name())
                .put("passed", verdetto == TalosLocalSmokeCheck.Verdict.PASSED)
                .put("stopLatencyMs", stopLatencyMs)
                // ⛔ Diagnostico, non decorativo: un GOLDEN_MISMATCH senza
                // dire COSA ha risposto il modello lascia a chi legge la
                // scheda solo un "no" senza il perché — misurato qui
                // stesso, dove senza questo campo ho dovuto rileggere il
                // logcat a mano per scoprire che il primo PROMPT (non il
                // motore) era il problema: vedi il commento su
                // TalosLocalSmokeCheck.PROMPT.
                .put("goldenText", golden == null ? JSONObject.NULL : golden);
    }

    private JSObject runQualification(String path) {
        android.content.Context context = getContext();
        String driver = android.os.Build.FINGERPRINT;
        String thermal = TalosThermal.read(context);
        JSObject result = new JSObject().put("ran", false);

        if (!TalosBackendChoice.shouldProbeNow(thermal)) {
            return result.put("reason", "hot");
        }

        TalosLlamaNative.ensureReady(context);
        TalosBackendChoice.Evidence[] existing = TalosBackendEvidenceStore.load(context);
        boolean cpuNeeded = TalosBackendChoice.shouldProbe(TalosBackendChoice.CPU, driver, existing);
        boolean openclCompiled = deviceOffersOpenCl();
        boolean gpuWanted = openclCompiled
                && TalosBackendChoice.shouldProbe(TalosBackendChoice.OPENCL, driver, existing);

        /*
         * ⭐⭐⭐ E L'NPU, dall'11/09/2026 — owner: «con automatico dovrebbe farlo
         * automaticamente».
         *
         * ## Perche' «Automatico» non faceva niente
         *
         * `talosDecideLocalBackend` sceglie **il piu' veloce MISURATO**. Il
         * sondaggio pero' misurava solo CPU e GPU: l'NPU non aveva un profilo,
         * quindi non poteva vincere, quindi non veniva mai scelta. Non era una
         * decisione — era un'assenza.
         *
         * ⛔ La cura NON e' una preferenza scritta a mano per l'NPU. Sarebbe
         * sbagliata **per costruzione**: col numero di token in uscita che
         * l'app si aspetta (1024) e un prompt da 2.900, l'aritmetica gia'
         * scritta in `talosSelectBestProfile` dice che vince la GPU —
         * 2900/361 + 1024/21,0 = 56,8 s contro 2900/1475 + 1024/16,8 = 63,0 s.
         * L'NPU vince solo sotto ~510 token di risposta. ⇒ Chi deve decidere e'
         * quella formula, e le serve **il terzo numero**.
         *
         * ## Le due condizioni, e sono entrambe misurate
         *
         * Il registry c'e' **e** il formato dei pesi e' uno dei tre che l'NPU
         * mangia. Sul Q4_K_M misurato sul Pad: 55,7 t/s contro i 206 della GPU,
         * venti volte sotto il Q4_0 dello stesso modello. Sondarla li' sarebbe
         * spendere una generazione vera per registrare una sconfitta certa.
         */
        boolean hexagonCompiled = deviceOffersHexagon();
        boolean npuWanted = hexagonCompiled
                && formatoPerNpu(path)
                && TalosBackendChoice.shouldProbe(TalosBackendChoice.HEXAGON, driver, existing);

        /*
         * ⛔⛔⛔ DUE ARCHIVI PER LA STESSA DOMANDA — e per questo la GPU non
         * girava mai. Misurato sul Pad il 2026-09-10.
         *
         * ## La contraddizione, vista a schermo nello stesso minuto
         *
         * Premuto «Fallo girare ora» alle 16:13, questo metodo rispondeva
         * **«già misurato su questo telefono»** — mentre la scelta del backend
         * cadeva su `reason: 'unmeasured'` e prendeva la CPU. Due componenti
         * che dicevano il contrario l'uno dell'altro.
         *
         * Perché: {@link TalosBackendEvidenceStore} è indicizzato sul
         * **DISPOSITIVO** (`Build.FINGERPRINT`), mentre `talosDecideLocalBackend`
         * legge i profili di {@link TalosLocalProfileStore}, indicizzati sul
         * **MODELLO**. L'evidenza esisteva per il telefono; il profilo non
         * esisteva per quel modello. ⇒ Per **ogni modello nuovo** la GPU era
         * esclusa in partenza, e il sondaggio si rifiutava di rimediare.
         *
         * ## La cura, e perché sulla DIMENSIONE e non sull'hash
         *
         * Serve sapere «questo modello ha già un profilo?» **prima** del
         * cancello. L'identità vera è lo sha256, ma calcolarlo qui vorrebbe
         * dire leggere un gigabyte e mezzo **anche quando si sta per saltare** —
         * il costo che P0-2 esiste per evitare, e che PocketPal evita a sua
         * volta (`utils/index.ts:564`: *«Hash doesn't seem to be reliable, and
         * expensive»*, controllano la dimensione con `stat`).
         *
         * La dimensione in byte è uno `stat`, e distingue due modelli
         * praticamente sempre. ⛔ E sbaglia dalla parte giusta: due file della
         * stessa identica lunghezza farebbero **saltare** un sondaggio che si
         * poteva fare — si resta lenti, non si sbaglia. L'identità vera resta
         * lo sha256 al momento di REGISTRARE, che è dove conta.
         *
         * ## ⛔ E non si accende la GPU per il fatto che esiste
         *
         * Il sondaggio misura, non presume. La ricerca è esplicita che su
         * telefono la GPU **non è sempre più veloce** —
         * https://arxiv.org/pdf/2505.06461 («Challenging GPU Dominance: When
         * CPUs Outperform for On-Device LLM Inference», letto il 2026-09-10).
         * ⇒ Il predefinito resta «il più veloce MISURATO», che è l'ordine
         * dell'owner, non «la GPU perché c'è».
         */
        boolean profiloMancante = profiloAssentePerQuestoModello(context, path);
        // ⛔ Una riga sola, e dice TUTTO cio' che decide: senza, «gia' misurato»
        // e' un verdetto senza premesse — e per scoprire perche' non girava
        // sarebbe servito indovinare.
        android.util.Log.i("TalosQualify", "cancello: path=" + path
                + " byte=" + (path == null ? -1L : new java.io.File(path).length())
                + " cpuNeeded=" + cpuNeeded + " gpuWanted=" + gpuWanted
                + " openclCompiled=" + openclCompiled
                + " npuWanted=" + npuWanted + " hexagonCompiled=" + hexagonCompiled
                + " profiloMancante=" + profiloMancante);

        if (!cpuNeeded && !gpuWanted && !npuWanted && !profiloMancante) {
            return result.put("reason", "already-proven");
        }
        if (profiloMancante) {
            // Il profilo di QUESTO modello non c'è: si misura, anche se il
            // telefono era già stato qualificato con un altro modello. È
            // limitato per costruzione — appena il sondaggio gira, il profilo
            // nasce e questa condizione diventa falsa.
            cpuNeeded = true;
            gpuWanted = openclCompiled;
            // ⛔ Stessa logica: un modello senza profilo va misurato su TUTTI i
            // motori che hanno senso per lui, non solo sui due di prima.
            npuWanted = hexagonCompiled && formatoPerNpu(path);
        }

        // P0-2: UNA sola lettura del file per l'intera qualificazione — CPU e
        // GPU condividono lo stesso modello, e ricalcolare l'hash due volte
        // sarebbe leggere lo stesso gigabyte due volte per lo stesso numero.
        // Null propaga silenziosamente a entrambe le chiamate sotto: la
        // qualificazione classica (TalosBackendEvidenceStore) non dipende da
        // questo e continua comunque.
        TalosLocalProfileIdentity identitaCorrente = null;
        String modelSha256 = sha256Del(path);
        if (modelSha256 != null) {
            identitaCorrente = TalosLocalProfileIdentity.current(modelSha256, new File(path).length());
        }

        // Il riferimento per giudicare la GPU è il testo della CPU di QUESTA
        // stessa chiamata, non uno vecchio: due corse a distanza di giorni
        // potrebbero cadere su prompt diversi se mai lo diventasse.
        //
        // ⛔⛔ MISURATO il 21/8: la CPU di questo Pad parte FREDDA — governor
        // di frequenza non ancora salito — e le prime corse escono `UNSTABLE`
        // per davvero, non per un difetto qui: TTFT costante (~500 ms) ma lo
        // spread delle finestre di decodifica supera il 60% mentre la
        // frequenza rampa DENTRO la finestra di misura. Tre corse di fila
        // instabili sullo stesso telefono, stesso giorno. ⇒ pochi tentativi
        // interni, non uno solo: ogni corsa scalda il chip un po' di più.
        ProbeRun cpuRun = null;
        String cpuText = null;
        boolean cpuRecorded = false;
        boolean cpuInconclusive = false;
        for (int attempt = 0; attempt < MAX_PROBE_ATTEMPTS && !cpuRecorded; attempt += 1) {
            cpuRun = runOne(path, 0);
            if (cpuRun == null) break;
            cpuText = cpuRun.text;
            boolean cpuOk = TalosLlamaProbe.referenceIsUsable(cpuText);
            cpuRecorded = recordIfConclusive(
                    context, TalosBackendChoice.CPU, driver, cpuRun, cpuOk, identitaCorrente);
            cpuInconclusive = !cpuRecorded;
        }
        result.put("probedCpu", cpuRecorded);
        result.put("cpuInconclusive", cpuInconclusive);

        /*
         * ⛔⛔⛔ IL BERSAGLIO SI NOMINA ANCHE QUI — difetto trovato l'11/09/2026
         * leggendo il codice accanto a quello che stavo curando.
         *
         * Questo braccio chiamava `runOne(path, -1)`, cioe' «tutti gli strati,
         * dove ti pare». Finche' OpenCL era l'unico acceleratore spedito, dove
         * gli pareva era OpenCL. Da quando HTP e' nell'APK **non e' piu' vero**:
         * la riga registrata sotto il nome `opencl` poteva essere una misura
         * dell'NPU, e l'automatico avrebbe scelto un motore leggendo il tempo
         * di un altro.
         *
         * ⛔ Tre righe piu' sotto il braccio dell'NPU dichiarava gia' il
         * problema («con OpenCL e HTP entrambi registrati, gpuLayers = -1
         * lascia scegliere llama.cpp») e nominava `HTP`. La stessa frase valeva
         * per la GPU, e nessuno l'aveva riletta guardando in su.
         */
        boolean gpuRecorded = false;
        boolean gpuInconclusive = false;
        if (gpuWanted && cpuRecorded && TalosLlamaProbe.referenceIsUsable(cpuText)) {
            for (int attempt = 0; attempt < MAX_PROBE_ATTEMPTS && !gpuRecorded; attempt += 1) {
                ProbeRun gpuRun = runOneTargeted(path, "OpenCL");
                if (gpuRun == null) break;
                boolean gpuOk = TalosLlamaProbe.agreesWithReference(cpuText, gpuRun.text);
                gpuRecorded = recordIfConclusive(
                        context, TalosBackendChoice.OPENCL, driver, gpuRun, gpuOk, identitaCorrente);
                gpuInconclusive = !gpuRecorded;
            }
        }
        result.put("probedGpu", gpuRecorded);
        result.put("gpuInconclusive", gpuInconclusive);

        /*
         * ⛔ Stessa forma della GPU, e per le stesse ragioni: si misura solo se
         * la CPU ha prodotto un testo di riferimento usabile, e la risposta
         * dell'NPU deve ACCORDARSI con quella — una misura velocissima di una
         * risposta sbagliata non e' una vittoria. E' il cancello che l'11/09 ha
         * evitato di spedire un riuso della KV che rispondeva in coreano.
         *
         * ⛔ Il bersaglio si NOMINA (`HTP`): con OpenCL e HTP entrambi
         * registrati, `gpuLayers = -1` lascia scegliere llama.cpp, e
         * misureremmo «uno dei due» senza sapere quale.
         */
        boolean npuRecorded = false;
        boolean npuInconclusive = false;
        if (npuWanted && cpuRecorded && TalosLlamaProbe.referenceIsUsable(cpuText)) {
            for (int attempt = 0; attempt < MAX_PROBE_ATTEMPTS && !npuRecorded; attempt += 1) {
                ProbeRun npuRun = runOneTargeted(path, "HTP");
                if (npuRun == null) break;
                boolean npuOk = TalosLlamaProbe.agreesWithReference(cpuText, npuRun.text);
                npuRecorded = recordIfConclusive(
                        context, TalosBackendChoice.HEXAGON, driver, npuRun, npuOk, identitaCorrente);
                npuInconclusive = !npuRecorded;
            }
        }
        result.put("probedNpu", npuRecorded);
        result.put("npuInconclusive", npuInconclusive);

        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(
                driver, thermal, TalosBackendEvidenceStore.load(context),
                formatoPerNpu(path));
        return result.put("ran", true)
                .put("decisionBackend", decision.backend)
                .put("decisionReason", decision.reason);
    }

    /**
     * Vero quando NESSUN profilo registrato corrisponde alla dimensione di
     * questo file.
     *
     * ⛔ `false` in caso di dubbio, sempre: un file che non si riesce a
     * misurare (`length() == 0`) non deve far ripartire il sondaggio a ogni
     * tocco. Un dubbio non è un «manca».
     */
    private static boolean profiloAssentePerQuestoModello(
            android.content.Context context, String path) {
        long dimensione = path == null ? 0L : new java.io.File(path).length();
        if (dimensione <= 0L) return false;
        for (TalosLocalProfile profilo : TalosLocalProfileStore.load(context)) {
            if (profilo.identity == null || profilo.identity.modelBytes != dimensione) continue;
            /*
             * D-53 — un profilo SENZA la velocita' di lettura non basta piu'.
             * Il selettore decide con tre termini (apertura + lettura +
             * scrittura); un profilo scritto prima dell'11/09/2026 ne ha uno
             * solo, e con quello sceglierebbe come prima. Non si cancella —
             * vale ancora come prova di correttezza — ma conta come «manca»,
             * cosi' il sondaggio lo rifa' e lo completa.
             */
            if (profilo.prefillTokPerSec > 0) return false;
        }
        return true;
    }

    /** Vero solo se QUESTA build ha davvero un dispositivo GPU registrato — mai dedotto dal nome del pacchetto. */
    private boolean deviceOffersOpenCl() {
        try {
            String json = TalosLlamaNative.nativeBackendInventory();
            for (ai.talos.research.TalosBackendInventory.Device device
                    : ai.talos.research.TalosBackendInventory.parse(json).devices()) {
                if (device.canOffload()) return true;
            }
        } catch (RuntimeException malformedOrMissing) {
            // Un inventario illeggibile non è un "no" silenzioso: è "non lo so",
            // e la regola su un dubbio è non offrire — mai inventare un sì.
        }
        return false;
    }

    /**
     * Vero solo se QUESTA build ha davvero registrato l'NPU — mai dedotto dal
     * nome del chip.
     *
     * ⛔ E' esattamente cio' che PocketPal sbaglia: sceglie il backend con una
     * regex su {@code Build.SOC_MODEL}, e quando la regex manca si perde anche
     * la GPU, in silenzio. Qui si CHIEDE al motore quali registry ha caricato.
     *
     * ⛔ Il registry si chiama {@code HTP}; i dispositivi {@code HTP0},
     * {@code HTP1}. Il confronto e' sul PREFISSO perche' l'inventario elenca i
     * dispositivi, non i registry — e un telefono con due NPU ne ha due.
     */
    private boolean deviceOffersHexagon() {
        try {
            String json = TalosLlamaNative.nativeBackendInventory();
            for (ai.talos.research.TalosBackendInventory.Device device
                    : ai.talos.research.TalosBackendInventory.parse(json).devices()) {
                // ⛔ Il REGISTRY, non il nome del dispositivo: il registry e'
                // `HTP` e non cambia, il nome del dispositivo e' `HTP0`/`HTP1`
                // e dipende da quante NPU ha il chip.
                String reg = device.registry == null ? "" : device.registry;
                if (reg.toUpperCase(java.util.Locale.ROOT).startsWith("HTP")) return true;
            }
        } catch (RuntimeException illeggibile) {
            // Stessa regola della GPU: un inventario che non si legge e' «non lo
            // so», e su un dubbio non si offre.
        }
        return false;
    }

    /**
     * ⛔⛔ Se i pesi di questo modello sono in un formato che l'NPU MANGIA.
     *
     * Misurato sul Pad l'11/09/2026, stesso modello e stesso giorno — cambia
     * solo questo:
     *
     * <pre>
     *   Qwen3-4B  Q4_0     NPU  lettura 1126 t/s
     *   Qwen3-4B  Q4_K_M   NPU  lettura   55,7      ← venti volte piu' piano
     *                      GPU  lettura  206
     * </pre>
     *
     * ⛔ I numeri sono i valori di {@code general.file_type} nel GGUF, non
     * nomi: 2 = Q4_0, 7 = Q8_0, 39 = MXFP4. Leggerli come numeri evita di
     * dipendere da una tabella di stringhe che vive da un'altra parte.
     *
     * ⛔ In dubbio, NO: un file che non dichiara il formato, un'intestazione
     * illeggibile, un motore assente — tutti no. Sbagliare in un verso spende
     * una generazione vera per registrare una sconfitta; nell'altro verso non
     * si misura un motore che avrebbe potuto vincere, e il sondaggio si puo'
     * rifare.
     */
    private static boolean formatoPerNpu(String path) {
        if (path == null || path.isEmpty() || !TalosLlamaNative.AVAILABLE) return false;
        try {
            String json = TalosLlamaNative.nativeArchitectureOf(path);
            if (json == null) return false;
            int ftype = new JSONObject(json).optInt("fileType", -1);
            return ftype == 2 || ftype == 7 || ftype == 39;
        } catch (JSONException illeggibile) {
            return false;
        }
    }

    /**
     * Una corsa di sondaggio su un bersaglio NOMINATO.
     *
     * ⛔ Esiste perche' {@code gpuLayers = -1} non basta piu': con OpenCL e HTP
     * entrambi registrati, llama.cpp sceglie da se' e misureremmo «uno dei
     * due» senza sapere quale. Il nome del registry toglie l'ambiguita', e un
     * nome che non si risolve fa FALLIRE l'apertura invece di ripiegare in
     * silenzio — che e' esattamente la garanzia che serve a una misura.
     */
    private ProbeRun runOneTargeted(String path, String backendName) {
        final long inizioApertura = System.nanoTime();
        TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                getContext(), path, 4, 4096, -1, true, 0, 0, "f16",
                "default", 0, backendName, "");
        final long openMs = (System.nanoTime() - inizioApertura) / 1_000_000L;
        TalosLlamaEngine engine = attempt.engine();
        if (engine == null) return null;
        try {
            TalosLlamaEngine.Run run = engine.run(
                    TalosLlamaProbe.PROMPT, TalosLlamaProbe.TOKENS,
                    () -> TalosThermal.read(getContext()), TalosLlamaEngine.Mode.BENCHMARK);
            if (run == null) return null;
            return new ProbeRun(run.text, run.samples, run.ttftMs,
                    backendDeviceDi(engine), engine.engineAborted(),
                    openMs, velocitaDiLettura(engine));
        } catch (InterruptedException interrotta) {
            Thread.currentThread().interrupt();
            return null;
        } finally {
            engine.close();
        }
    }

    /**
     * ⛔⛔ MISURATO il 21/8: la prima corsa a freddo sulla CPU di questo Pad è
     * uscita `UNSTABLE` — dieci finestre, spread oltre il 60% che
     * {@link TalosBenchmarkHarness#MAX_RELATIVE_SPREAD} rifiuta — non
     * `WRONG_ANSWER`. Il testo era corretto, l'harness ha solo detto «questa
     * misura non è abbastanza stabile per fidarcene», che è esattamente il suo
     * lavoro.
     *
     * ⛔ Ma registrarla comunque come evidenza sarebbe stato un difetto SERIO
     * per una ragione che non è ovvia: {@link TalosBackendChoice#shouldProbe}
     * non riprova un'evidenza già scritta, quindi un `FAILED` da una CORSA
     * RUMOROSA diventerebbe permanente — e {@link TalosBackendChoice#choose}
     * ha bisogno esattamente di una CPU `CORRECT` per calcolare una base di
     * confronto: senza, resta "unproven" per SEMPRE su questo driver, anche
     * se la GPU funziona benissimo.
     *
     * ⇒ Solo {@code VALID} e {@code WRONG_ANSWER} sono giudizi DURATURI su
     * questo backend — il secondo è correttezza, la prima è una misura
     * fidata. I tre rifiuti restanti ({@code TOO_SHORT}, {@code
     * THERMAL_DRIFT}, {@code UNSTABLE}, {@code INTERRUPTED}) dicono «questa
     * corsa non conta», non «questo backend è rotto»: non si registra niente,
     * cosi' un prossimo sondaggio — automatico o dal comando manuale — parte
     * libero di riprovare.
     *
     * @return vero se un verdetto duraturo è stato scritto.
     */
    private boolean recordIfConclusive(
            android.content.Context context, String backend, String driver,
            ProbeRun run, boolean answerCorrect, TalosLocalProfileIdentity identitaCorrente) {
        TalosBenchmarkHarness.Result measured =
                TalosBenchmarkHarness.judge(run.samples, answerCorrect, run.ttftMs);
        /*
         * ⛔⛔⛔ UNA CORSA CHE IL MOTORE HA MOLLATO NON E' UNA PROVA — 11/09/2026.
         *
         * Sul Pad, sondando l'NPU: `graph_compute … failed with error 1` →
         * `llama_decode: failed to decode, ret = 2`, e verdetto **VALID**.
         *
         * ⛔ Rimisurato con lo strumento acceso, quel particolare `2` era **lo
         * stop del banco a fine corsa** — compare anche sulla CPU. Ma il
         * cancello resta, e non e' teorico: finche' le due interruzioni si
         * somigliano, una corsa che il motore abbandona si registra da sola
         * come prova che quel motore funziona.
         *
         * ⛔ Non si registra come FALLITO: `shouldProbe` non riprova
         * un'evidenza gia' scritta, e un guasto occasionale diventerebbe
         * permanente. Si tratta come una corsa INSTABILE — non conclusiva, si
         * ritenta — che e' esattamente cio' che e'.
         */
        boolean conclusive = measured.verdict == TalosBenchmarkHarness.Verdict.VALID
                || measured.verdict == TalosBenchmarkHarness.Verdict.WRONG_ANSWER;
        if (run.abortitaDalMotore) conclusive = false;
        // ⛔ Il dump di OGNI campione va in logcat SOLO quando il verdetto non
        // è duraturo: è la corsa strumentata il 21/8 che ha trovato il divario
        // di tempo zero in TalosLlamaEngine — sul percorso felice (VALID sul
        // primo tentativo, com'è ora) la riga sola basta, e sul telefono di
        // ogni persona non serve stampare un array a ogni sondaggio riuscito.
        String samplesDump = conclusive ? "" : dumpSamples(run.samples);
        android.util.Log.i("TalosQualify", backend + ": verdetto=" + measured.verdict
                + " tps=" + measured.tokensPerSecond + " ttft=" + run.ttftMs
                + (run.abortitaDalMotore ? " ABORTITA-DAL-MOTORE" : "")
                + " pp=" + String.format(java.util.Locale.ROOT, "%.1f", run.prefillTokPerSec)
                + " open=" + run.openMs
                + " registrato=" + conclusive
                + (conclusive ? "" : " campioni=" + samplesDump));
        if (!conclusive) return false;
        TalosBackendEvidenceStore.record(context, TalosLlamaProbe.evidenceOf(backend, driver, measured));
        // P0-2: layer PARALLELO, non un sostituto — TalosBackendChoice.choose
        // continua a leggere solo lo store sopra, invariato. Null quando
        // l'hash del modello non si è calcolato (vedi sha256Del): un profilo
        // scritto con un'identità che non si può fidare sarebbe peggio di
        // nessun profilo.
        if (identitaCorrente != null) {
            // Q1: questo È runQualification, il probe bounded dietro
            // consenso — vedi TalosLlamaPluginQualificationBudgetTest per
            // il cancello che tiene MAX_PROBE_ATTEMPTS lontano dai nove
            // giri di Q2.
            TalosLocalProfileStore.record(context, new TalosLocalProfile(
                    identitaCorrente, backend, run.backendDevice,
                    TalosBenchmarkHarness.outcomeOf(measured), run.ttftMs,
                    System.currentTimeMillis(), TalosLocalProfile.Level.Q1,
                    // P1-5: già calcolato da judge() poche righe sopra, solo
                    // loggato finora — mai una seconda misura per questo.
                    measured.tokensPerSecond,
                    // D-53: lettura come velocita', e costo dell'apertura.
                    run.prefillTokPerSec, run.openMs));
        }
        return true;
    }

    /**
     * P0-2 — l'hash che dà a un modello un'identità che non è il suo nome
     * file. Null se il file non si legge: un profilo con un'identità
     * indovinata sarebbe peggio di nessun profilo, e la qualificazione
     * classica ({@link TalosBackendEvidenceStore}) continua comunque — solo
     * il layer nuovo resta senza questa riga.
     *
     * ⛔ Riusa {@link TalosResumableSha256}, non un secondo hash: è già
     * l'implementazione con cui questo repo verifica un GGUF scaricato, e
     * l'esadecimale minuscolo che produce è la stessa forma con cui
     * HuggingFace pubblica `lfs.oid`.
     */
    private static String sha256Del(String path) {
        TalosResumableSha256 digest = new TalosResumableSha256();
        byte[] buffer = new byte[64 * 1024];
        try (java.io.FileInputStream in = new java.io.FileInputStream(path)) {
            int letti;
            while ((letti = in.read(buffer)) >= 0) {
                if (letti > 0) digest.update(buffer, 0, letti);
            }
            return digest.hex();
        } catch (java.io.IOException illeggibile) {
            return null;
        }
    }

    /** Un campione per riga, per leggere a occhio dove il divario di tempo o di token si è rotto. */
    private static String dumpSamples(TalosBenchmarkHarness.Sample[] samples) {
        StringBuilder dump = new StringBuilder();
        for (TalosBenchmarkHarness.Sample sample : samples) {
            dump.append('[').append(sample.atMs).append(',').append(sample.tokens)
                    .append(',').append(sample.thermal).append(']');
        }
        return dump.toString();
    }

    /** Una corsa del sondaggio: il testo prodotto e le finestre con cui misurarlo. Null se il motore non si è aperto. */
    /**
     * D-53 — la velocita' di LETTURA di questa corsa, dai tempi che il motore
     * espone gia' (`nativeLastTimings`: `prefillMs`, `newTokens`). Il sondaggio
     * parte sempre a KV vuota, quindi `newTokens` e' l'intero prompt.
     *
     * ⛔ -1 in ogni dubbio: un JSON che non si legge, zero token, zero
     * millisecondi. Una velocita' inventata sarebbe peggio di nessuna.
     */
    private static double velocitaDiLettura(TalosLlamaEngine engine) {
        try {
            JSONObject tempi = new JSONObject(engine.lastTimings());
            long prefillMs = tempi.optLong("prefillMs", -1);
            long nuovi = tempi.optLong("newTokens", -1);
            if (prefillMs <= 0 || nuovi <= 0) return -1;
            return nuovi * 1000.0 / prefillMs;
        } catch (JSONException | RuntimeException illeggibile) {
            return -1;
        }
    }

    private ProbeRun runOne(String path, int gpuLayers) {
        final long inizioApertura = System.nanoTime();
        TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                getContext(), path, 4, 4096, gpuLayers, true);
        final long openMs = (System.nanoTime() - inizioApertura) / 1_000_000L;
        TalosLlamaEngine engine = attempt.engine();
        if (engine == null) return null;
        try {
            TalosLlamaEngine.Run run = engine.run(
                    TalosLlamaProbe.PROMPT, TalosLlamaProbe.TOKENS,
                    () -> TalosThermal.read(getContext()), TalosLlamaEngine.Mode.BENCHMARK);
            if (run == null) return null;
            // P0-2: va letto ORA — l'handle nativo muore nel finally qui
            // sotto, e uno snapshot chiesto dopo troverebbe solo un motore
            // già chiuso.
            return new ProbeRun(run.text, run.samples, run.ttftMs,
                    backendDeviceDi(engine), engine.engineAborted(),
                    openMs, velocitaDiLettura(engine));
        } catch (InterruptedException interrotta) {
            Thread.currentThread().interrupt();
            return null;
        } finally {
            engine.close();
        }
    }

    /**
     * P0-2 — quale dispositivo di offload il motore ha DAVVERO usato in
     * questa corsa, dalla snapshot unificata di B1. Non lo stesso dato che
     * {@link #deviceOffersOpenCl} guarda: quello dice se un acceleratore
     * ESISTE su questa build, questo dice se QUESTA apertura lo ha usato.
     * Null se il motore è CPU pura o se la snapshot non si legge — "non lo
     * so" resta null, mai una stringa inventata.
     */
    private static String backendDeviceDi(TalosLlamaEngine engine) {
        try {
            String snapshot = engine.runtimeSnapshot();
            if (snapshot == null) return null;
            JSONObject o = new JSONObject(snapshot);
            return o.isNull("backendDevice") ? null : o.getString("backendDevice");
        } catch (JSONException snapshotMalformata) {
            return null;
        }
    }

    private static final class ProbeRun {
        final String text;
        final TalosBenchmarkHarness.Sample[] samples;
        final long ttftMs;
        final String backendDevice;
        /**
         * ⛔⛔ Il motore ha mollato a meta' corsa, senza che nessuno glielo
         * chiedesse. Vedi {@link TalosLlamaEngine#engineAborted()}.
         */
        final boolean abortitaDalMotore;
        /** D-53: quanto e' costato aprire, e a che velocita' ha letto il prompt. -1 = non misurato. */
        final long openMs;
        final double prefillTokPerSec;

        ProbeRun(String text, TalosBenchmarkHarness.Sample[] samples, long ttftMs,
                 String backendDevice, boolean abortitaDalMotore,
                 long openMs, double prefillTokPerSec) {
            this.text = text;
            this.samples = samples;
            this.ttftMs = ttftMs;
            this.backendDevice = backendDevice;
            this.abortitaDalMotore = abortitaDalMotore;
            this.openMs = openMs;
            this.prefillTokPerSec = prefillTokPerSec;
        }
    }
}
