package ai.talos;

import android.content.Context;
import android.net.Network;
import android.os.SystemClock;

import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Process-local workers keyed by the durable transfer id.
 *
 * The map is a cache shared by JobService, foreground service and notification
 * receiver. Authority remains the atomic journal plus each slot sidecar. No
 * stop flag, progress counter or worker reference can cross transfer ids.
 */
public final class TalosTransferSession {

    /** One model request may contain several GGUF shards; it is still one row. */
    public static final class Request {
        public final String repo;
        public final String revision;
        public final String[] paths;
        public final long[] sizes;
        public final String[] hashes;
        public final String modelName;
        public final long totalBytes;

        public Request(String repo, String revision, String[] paths, long[] sizes,
                String[] hashes, String modelName) {
            this.repo = repo;
            this.revision = revision;
            this.paths = paths.clone();
            this.sizes = sizes.clone();
            this.hashes = hashes.clone();
            this.modelName = modelName;
            long sum = 0;
            for (long size : sizes) sum = Math.addExact(sum, size);
            this.totalBytes = sum;
        }
    }

    public enum StopCause {
        NONE,
        SYSTEM_STOP,
        USER_PAUSE,
        USER_CANCEL
    }

    static final class Completion {
        final TalosTransferJournal.Phase phase;
        final boolean retry;
        final boolean clear;

        Completion(TalosTransferJournal.Phase phase, boolean retry, boolean clear) {
            this.phase = phase;
            this.retry = retry;
            this.clear = clear;
        }
    }

    private static final class State {
        final Request request;
        final AtomicReference<StopCause> stopCause =
                new AtomicReference<>(StopCause.NONE);
        volatile long lastHave;
        volatile long lastTotal;
        volatile boolean workerRunning;
        volatile TalosTransferPlan.Runner runner;
        volatile boolean networkBound;

        State(
                Request request,
                TalosTransferPlan.Runner runner,
                boolean networkBound,
                long haveBytes) {
            this.request = request;
            this.runner = runner;
            this.networkBound = networkBound;
            this.lastHave = Math.max(0L, Math.min(request.totalBytes, haveBytes));
            this.lastTotal = request.totalBytes;
        }
    }

    private static final Object STATE_LOCK = new Object();
    private static final ConcurrentHashMap<String, State> STATES = new ConcurrentHashMap<>();

    private TalosTransferSession() {}

    /** JVM-test/legacy cache install; durable starts use the Context overload. */
    public static String begin(Request request) {
        String id = TalosTransferJournal.idFor(request);
        synchronized (STATE_LOCK) {
            install(id, request, null, false, 0L);
        }
        return id;
    }

    /** Persist ownership before asking Android to start work. */
    public static TalosTransferJournal.Snapshot begin(
            Context context,
            Request request,
            TalosTransferPlan.Runner runner,
            boolean networkBound) {
        synchronized (STATE_LOCK) {
            TalosTransferJournal.Snapshot snapshot = TalosTransferJournal.forContext(context)
                    .begin(request, runner, networkBound);
            install(snapshot.id, request, runner, networkBound,
                    progressFromDisk(rootFor(context), request));
            return snapshot;
        }
    }

    /** Restore every record independently; active foreground orphans wait. */
    public static List<TalosTransferJournal.Snapshot> restoreAll(Context context) {
        synchronized (STATE_LOCK) {
            TalosTransferJournal journal = TalosTransferJournal.forContext(context);
            List<TalosTransferJournal.Snapshot> records = journal.list();
            List<TalosTransferJournal.Snapshot> restored = new ArrayList<>();
            Set<String> durableIds = new HashSet<>();

            for (TalosTransferJournal.Snapshot original : records) {
                TalosTransferJournal.Snapshot snapshot = original;
                durableIds.add(snapshot.id);
                State existing = STATES.get(snapshot.id);
                if (existing == null && isMoving(snapshot.phase)) {
                    // A record occupies a slot only while Android still owns
                    // its job. Foreground services never survive this process.
                    TalosTransferJournal.Phase recovered =
                            TalosTransferDispatcher.recoveredPhase(
                                    snapshot.runner,
                                    TalosTransferDispatcher.hasHost(context, snapshot));
                    snapshot = journal.transition(snapshot.id, recovered, null);
                }
                if (snapshot == null) continue;
                State state = STATES.get(snapshot.id);
                if (state == null) {
                    Request request = snapshot.request();
                    install(snapshot.id, request, snapshot.runner, snapshot.networkBound,
                            progressFromDisk(rootFor(context), request));
                } else {
                    state.lastHave = progressFromDisk(rootFor(context), state.request);
                    state.lastTotal = state.request.totalBytes;
                    state.runner = snapshot.runner;
                    state.networkBound = snapshot.networkBound;
                }
                restored.add(snapshot);
            }

            for (String id : new HashSet<>(STATES.keySet())) {
                State state = STATES.get(id);
                if (!durableIds.contains(id) && state != null && !state.workerRunning) {
                    STATES.remove(id, state);
                }
            }
            return restored;
        }
    }

    public static TalosTransferJournal.Snapshot restore(Context context, String id) {
        for (TalosTransferJournal.Snapshot snapshot : restoreAll(context)) {
            if (snapshot.id.equals(id)) return snapshot;
        }
        return null;
    }

    /** Compatibility view, intentionally null when more than one record exists. */
    public static TalosTransferJournal.Snapshot restore(Context context) {
        List<TalosTransferJournal.Snapshot> records = restoreAll(context);
        return records.size() == 1 ? records.get(0) : null;
    }

    public static Request active(String id) {
        State state = STATES.get(id);
        return state == null ? null : state.request;
    }

    public static Request active() {
        State state = soleState();
        return state == null ? null : state.request;
    }

    public static void requestStop() {
        String id = soleId();
        if (id != null) requestStop(id, StopCause.USER_PAUSE);
    }

    public static void requestStop(StopCause cause) {
        String id = soleId();
        if (id != null) requestStop(id, cause);
    }

    public static void requestStop(String id, StopCause cause) {
        State state = STATES.get(id);
        if (state == null || cause == null || cause == StopCause.NONE) return;
        while (true) {
            StopCause current = state.stopCause.get();
            if (priority(current) >= priority(cause)) return;
            if (state.stopCause.compareAndSet(current, cause)) return;
        }
    }

    public static boolean stopRequested(String id) {
        return stopCause(id) != StopCause.NONE;
    }

    public static boolean stopRequested() {
        String id = soleId();
        return id != null && stopRequested(id);
    }

    public static StopCause stopCause(String id) {
        State state = STATES.get(id);
        return state == null ? StopCause.NONE : state.stopCause.get();
    }

    public static StopCause stopCause() {
        String id = soleId();
        return id == null ? StopCause.NONE : stopCause(id);
    }

    public static void end(String id) {
        if (id != null) STATES.remove(id);
    }

    public static void end() {
        STATES.clear();
    }

    public static void end(Context context, String id) {
        synchronized (STATE_LOCK) {
            TalosTransferJournal.forContext(context).remove(id);
            STATES.remove(id);
        }
    }

    /** Legacy all-clear; no multi-transfer production path calls this. */
    public static void end(Context context) {
        synchronized (STATE_LOCK) {
            TalosTransferJournal.forContext(context).clear();
            STATES.clear();
        }
    }

    public static void clearStopRequest(String id) {
        State state = STATES.get(id);
        if (state != null) state.stopCause.set(StopCause.NONE);
    }

    public static void clearStopRequest() {
        String id = soleId();
        if (id != null) clearStopRequest(id);
    }

    public static long haveBytes(String id) {
        State state = STATES.get(id);
        return state == null ? 0L : state.lastHave;
    }

    public static long haveBytes() {
        String id = soleId();
        return id == null ? 0L : haveBytes(id);
    }

    public static long totalBytes(String id) {
        State state = STATES.get(id);
        return state == null ? 0L : state.lastTotal;
    }

    public static long totalBytes() {
        String id = soleId();
        return id == null ? 0L : totalBytes(id);
    }

    public static boolean workerRunning(String id) {
        State state = STATES.get(id);
        return state != null && state.workerRunning;
    }

    public static boolean workerRunning() {
        String id = soleId();
        return id != null && workerRunning(id);
    }

    public static TalosTransferPlan.Runner runner(String id) {
        State state = STATES.get(id);
        return state == null ? null : state.runner;
    }

    public static TalosTransferPlan.Runner runner() {
        String id = soleId();
        return id == null ? null : runner(id);
    }

    public static boolean networkBound(String id) {
        State state = STATES.get(id);
        return state != null && state.networkBound;
    }

    public static boolean networkBound() {
        String id = soleId();
        return id != null && networkBound(id);
    }

    /**
     * I modelli arrivati e non ancora raccontati.
     *
     * ## Perché una lista e non un evento
     *
     * Perché chi deve ascoltare può non esserci. La WebView si ricarica, la
     * schermata si smonta, l'app va in secondo piano: un evento sparato in quel
     * momento non lo raccoglie nessuno, ed è esattamente il modo in cui il
     * difetto si presentava. Una lista invece **aspetta**, e chi arriva la
     * trova.
     *
     * Limitata a poche voci: è un passaggio di consegne, non un archivio. Chi
     * vuole la storia dei download ha il registro delle notifiche.
     *
     * ⚠️ Vive in memoria, quindi non sopravvive alla morte del processo. È un
     * limite accettato e non nascosto: chi mostra i modelli li rilegge comunque
     * quando l'app torna in primo piano, che è il caso in cui il processo era
     * morto.
     */
    private static final int MAX_ARRIVI = 16;
    private static final java.util.ArrayDeque<String[]> ARRIVI = new java.util.ArrayDeque<>();

    private static void ricordaArrivo(String id, String modelName) {
        synchronized (ARRIVI) {
            while (ARRIVI.size() >= MAX_ARRIVI) ARRIVI.pollFirst();
            ARRIVI.addLast(new String[] { id, modelName == null ? "" : modelName });
        }
    }

    /**
     * Gli arrivi da raccontare. Leggerli NON li consuma.
     *
     * ## Perché non si svuota qui
     *
     * La prima versione svuotava nel leggere, e sembrava elegante: consegnati
     * una volta, raccontati una volta. Ma legava la correttezza a un fatto
     * fragile — «esiste un solo lettore» — e bastava che qualcuno chiedesse lo
     * stato per un altro motivo per rubare la notizia a chi doveva riceverla.
     *
     * ⛔ Non è un rischio teorico: mi è successo mentre PROVAVO questa funzione
     * sul Pad il 2026-08-06. Una lettura diagnostica dello stato ha consumato
     * l'arrivo, e per qualche minuto è sembrato che la correzione non
     * funzionasse. Se inganna chi l'ha appena scritta, ingannerà chiunque.
     *
     * Ora leggere è innocuo e togliere è esplicito: chi ha fatto qualcosa della
     * notizia lo dichiara con {@link #acknowledgeArrivals}.
     */
    public static List<String[]> arrivals() {
        synchronized (ARRIVI) {
            return new ArrayList<>(ARRIVI);
        }
    }

    /** Questi arrivi sono stati raccontati: si possono dimenticare. */
    public static void acknowledgeArrivals(Set<String> ids) {
        if (ids == null || ids.isEmpty()) return;
        synchronized (ARRIVI) {
            ARRIVI.removeIf((voce) -> ids.contains(voce[0]));
        }
    }

    static Completion completionFor(String reason, StopCause cause) {
        StopCause effective = cause == null ? StopCause.NONE : cause;
        if (effective == StopCause.USER_CANCEL) {
            return new Completion(TalosTransferJournal.Phase.IDLE, false, true);
        }
        if (effective == StopCause.USER_PAUSE) {
            return new Completion(TalosTransferJournal.Phase.PAUSED, false, false);
        }
        if (effective == StopCause.SYSTEM_STOP) {
            return new Completion(TalosTransferJournal.Phase.QUEUED, true, false);
        }
        if (reason == null) {
            return new Completion(TalosTransferJournal.Phase.IDLE, false, true);
        }
        if ("stopped".equals(reason) || "interrupted".equals(reason)) {
            return new Completion(TalosTransferJournal.Phase.QUEUED, true, false);
        }
        return new Completion(TalosTransferJournal.Phase.FAILED, false, false);
    }

    static Completion completionForHost(
            String reason,
            StopCause cause,
            TalosTransferPlan.Runner runner) {
        Completion completion = completionFor(reason, cause);
        if (cause == StopCause.SYSTEM_STOP
                && runner == TalosTransferPlan.Runner.FOREGROUND_SERVICE) {
            return new Completion(TalosTransferJournal.Phase.WAITING, true, false);
        }
        return completion;
    }

    /** Apply only this worker's outcome to disk before its host finishes. */
    public static Completion finish(Context context, String id, String reason) {
        synchronized (STATE_LOCK) {
            State state = STATES.get(id);
            StopCause cause = state == null ? StopCause.NONE : state.stopCause.get();
            Completion completion = completionForHost(
                    reason,
                    cause,
                    state == null ? null : state.runner);
            if (state != null) {
                state.lastHave = progressFromDisk(rootFor(context), state.request);
                state.lastTotal = state.request.totalBytes;
            }

            TalosTransferJournal journal = TalosTransferJournal.forContext(context);
            if (completion.clear) {
                if (cause == StopCause.USER_CANCEL && state != null) {
                    discardRequest(rootFor(context), state.request);
                } else {
                    /**
                     * ⭐ QUI un modello è arrivato, e finora nessuno lo diceva.
                     *
                     * `clear` è vero in due casi soli — l'utente ha annullato,
                     * oppure il lavoro è finito senza motivo di guasto — e il
                     * ramo sopra ha già preso il primo. Questo è il secondo:
                     * un download riuscito.
                     *
                     * <h3>Perché serviva dichiararlo</h3>
                     *
                     * Un trasferimento riuscito **non ha uno stato**: sparisce
                     * dal registro. Il lato JavaScript deduceva la fine
                     * confrontando due istantanee — «c'era, non c'è più» — e
                     * quella deduzione funziona **solo se qualcuno stava
                     * guardando nell'istante esatto** in cui la riga è sparita.
                     *
                     * MISURATO sul Pad il 2026-08-06: un modello da 214 MB è
                     * arrivato in meno di dodici secondi, la schermata «questo
                     * dispositivo» era aperta e visibile per tutto il tempo, e
                     * ha continuato a dire «3 modelli» mentre sul disco ce
                     * n'erano quattro. L'owner l'aveva segnalato due volte.
                     *
                     * Un fatto non si deduce da chi passava di lì: lo dichiara
                     * chi l'ha compiuto.
                     */
                    ricordaArrivo(id, state == null ? null : state.request.modelName);
                }
                journal.remove(id);
                STATES.remove(id);
            } else {
                journal.transition(
                        id,
                        completion.phase,
                        completion.phase == TalosTransferJournal.Phase.FAILED ? reason : null);
                if (state != null) {
                    state.stopCause.set(StopCause.NONE);
                    state.workerRunning = false;
                }
            }
            return completion;
        }
    }

    public static Completion finish(Context context, String reason) {
        String id = soleId();
        return id == null
                ? completionFor(reason, StopCause.NONE)
                : finish(context, id, reason);
    }

    /** Cancel immediately when this id has no worker owning a socket. */
    public static boolean cancel(Context context, String id) {
        requestStop(id, StopCause.USER_CANCEL);
        synchronized (STATE_LOCK) {
            State state = STATES.get(id);
            if (state != null && state.workerRunning) return false;
            if (state != null) discardRequest(rootFor(context), state.request);
            TalosTransferJournal.forContext(context).remove(id);
            STATES.remove(id);
            return true;
        }
    }

    public static boolean cancel(Context context) {
        String id = soleId();
        return id == null || cancel(context, id);
    }

    /** Progress reconstructed from completed pieces and durable sidecars. */
    public static long progressFromDisk(File root, Request request) {
        if (request == null) return 0L;
        TalosModelStore store = new TalosModelStore(root);
        long have = 0L;
        for (int index = 0; index < request.paths.length; index += 1) {
            try {
                TalosModelStore.Slot slot = store.slot(
                        request.repo, request.revision, request.paths[index]);
                long part = slot.finished.isFile()
                        && slot.finished.length() == request.sizes[index]
                        ? request.sizes[index]
                        : slot.resume(request.sizes[index]).haveBytes;
                have = Math.addExact(have,
                        Math.max(0L, Math.min(request.sizes[index], part)));
            } catch (IllegalArgumentException | ArithmeticException invalid) {
                return 0L;
            }
        }
        return Math.min(have, request.totalBytes);
    }

    static void discardRequest(File root, Request request) {
        TalosModelStore store = new TalosModelStore(root);
        for (String path : request.paths) {
            try {
                TalosModelStore.Slot slot = store.slot(request.repo, request.revision, path);
                slot.discard();
                slot.finished.delete();
            } catch (IllegalArgumentException hostile) {
                // A legacy request still cannot escape the model root.
            }
        }
    }

    public interface Report {
        void progress(long haveBytes, long totalBytes, TalosTransferProgress progress);
        void finished(String reason);
    }

    public static File rootFor(Context context) {
        File external = context.getExternalFilesDir(null);
        return external != null ? external : context.getFilesDir();
    }

    public static void run(
            Context context,
            String id,
            Request request,
            Network network,
            Report report) {
        State state = STATES.get(id);
        if (state == null) {
            install(id, request, null, false, progressFromDisk(rootFor(context), request));
            state = STATES.get(id);
        }
        final State owned = state;
        owned.workerRunning = true;
        TalosTransferJournal.forContext(context).transition(
                id, TalosTransferJournal.Phase.RUNNING, null);
        try {
            runOwned(context, id, request, network, report, owned);
        } finally {
            owned.workerRunning = false;
        }
    }

    public static void run(Context context, Request request, Network network, Report report) {
        String id = soleId();
        if (id == null) id = begin(request);
        run(context, id, request, network, report);
    }

    private static void runOwned(
            Context context,
            String id,
            Request request,
            Network network,
            Report report,
            State state) {
        TalosModelStore store = new TalosModelStore(rootFor(context));
        TalosTransferProgress progress = new TalosTransferProgress();
        state.lastTotal = request.totalBytes;

        try {
            TalosStorageReservation.reserveAll(context, store, request);
        } catch (IllegalArgumentException hostile) {
            report.finished("bad-path");
            return;
        } catch (IOException noRoom) {
            report.finished("no-space");
            return;
        }

        long done = 0;
        for (int index = 0; index < request.paths.length; index += 1) {
            final long already = done;
            final long size = request.sizes[index];
            TalosModelStore.Slot slot;
            try {
                slot = store.slot(request.repo, request.revision, request.paths[index]);
            } catch (IllegalArgumentException hostile) {
                report.finished("bad-path");
                return;
            }

            if (slot.finished.isFile() && slot.finished.length() == size) {
                done += size;
                state.lastHave = done;
                report.progress(done, request.totalBytes, progress);
                continue;
            }

            final String path = request.paths[index];
            final String[] failure = { null };
            final boolean[] ended = { false };

            new TalosTransferRunner(slot, size, request.hashes[index], network,
                    new TalosTransferRunner.Host() {
                        @Override
                        public TalosTransferRunner.Resolved resolve() throws IOException {
                            return resolveOn(context, network, request, path);
                        }

                        @Override
                        public void onProgress(long haveBytes, long totalBytes) {
                            state.lastHave = already + haveBytes;
                            state.lastTotal = request.totalBytes;
                            progress.sample(state.lastHave, SystemClock.elapsedRealtime());
                            report.progress(state.lastHave, request.totalBytes, progress);
                        }

                        @Override
                        public void onFinished(String reason) {
                            ended[0] = true;
                            failure[0] = reason;
                        }

                        @Override
                        public boolean stopRequested() {
                            return TalosTransferSession.stopRequested(id);
                        }
                    }).run();

            if (!ended[0] || failure[0] != null) {
                report.finished(failure[0] != null ? failure[0] : "interrupted");
                return;
            }
            done += size;
        }

        state.lastHave = request.totalBytes;
        report.finished(null);
    }

    /**
     * The Hub does not always redirect straight to the signed CDN address: it
     * can answer with a same-origin, RELATIVE Location first (seen live as
     * "/api/resolve-cache/models/..."), a hop huggingface_hub's own client
     * follows by hand (`_httpx_follow_relative_redirects_with_backoff`) rather
     * than treating as the final URL. `new URL(base, location)` resolves a
     * relative Location the same way; only a Location that leaves the Hub's
     * host ends the chain, since that is the actual CDN address.
     */
    private static final int MAX_RESOLVE_HOPS = 5;

    private static TalosTransferRunner.Resolved resolveOn(
            Context context, Network network, Request request, String path) throws IOException {
        String address = "https://huggingface.co/" + request.repo + "/resolve/"
                + encode(request.revision) + "/" + encodePath(path);
        URL origin = new URL(address);
        String token = TalosSecretReader.providerKey(context, "huggingface");

        URL current = origin;
        for (int hop = 0; hop < MAX_RESOLVE_HOPS; hop++) {
            HttpURLConnection connection = (HttpURLConnection) (network == null
                    ? current.openConnection()
                    : network.openConnection(current));
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(15_000);
                connection.setReadTimeout(15_000);
                connection.setRequestMethod("HEAD");
                // The token is for the Hub itself; a CDN host must never see it.
                if (token != null && sameHost(current, origin)) {
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                }

                int status = connection.getResponseCode();
                String location = connection.getHeaderField("Location");
                if (status < 300 || status >= 400 || location == null) {
                    String signed = current.toString();
                    return new TalosTransferRunner.Resolved(signed, deadlineOf(connection, signed));
                }

                URL target = new URL(current, location);
                if (!sameHost(target, origin)) {
                    String signed = target.toString();
                    return new TalosTransferRunner.Resolved(signed, deadlineOf(connection, signed));
                }
                current = target;
            } finally {
                connection.disconnect();
            }
        }
        throw new IOException("too many redirects resolving " + address);
    }

    private static boolean sameHost(URL a, URL b) {
        return a.getProtocol().equals(b.getProtocol())
                && a.getHost().equalsIgnoreCase(b.getHost())
                && a.getPort() == b.getPort();
    }

    private static long deadlineOf(HttpURLConnection connection, String signed) {
        long expires = numberInQuery(signed, "Expires");
        if (expires <= 0) return Long.MIN_VALUE;
        long serverNow = connection.getHeaderFieldDate("Date", 0L) / 1000L;
        if (serverNow <= 0) return Long.MIN_VALUE;
        long lives = expires - serverNow;
        if (lives <= 0) return Long.MIN_VALUE;
        return SystemClock.elapsedRealtime() + lives * 1000L;
    }

    static long numberInQuery(String url, String key) {
        int at = -1;
        int from = 0;
        while (true) {
            int found = url.indexOf(key + "=", from);
            if (found < 0) break;
            char before = found == 0 ? '?' : url.charAt(found - 1);
            if (before == '?' || before == '&') {
                at = found;
                break;
            }
            from = found + 1;
        }
        if (at < 0) return -1;
        from = at + key.length() + 1;
        int to = from;
        while (to < url.length() && Character.isDigit(url.charAt(to))) to += 1;
        if (to == from) return -1;
        try {
            return Long.parseLong(url.substring(from, to));
        } catch (NumberFormatException notANumber) {
            return -1;
        }
    }

    static String encodePath(String path) {
        StringBuilder out = new StringBuilder();
        for (String segment : path.split("/")) {
            if (out.length() > 0) out.append('/');
            out.append(encode(segment));
        }
        return out.toString();
    }

    private static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8").replace("+", "%20");
        } catch (IOException impossible) {
            return value;
        }
    }

    private static void install(
            String id,
            Request request,
            TalosTransferPlan.Runner runner,
            boolean networkBound,
            long haveBytes) {
        STATES.put(id, new State(request, runner, networkBound, haveBytes));
    }

    private static boolean isMoving(TalosTransferJournal.Phase phase) {
        return phase == TalosTransferJournal.Phase.QUEUED
                || phase == TalosTransferJournal.Phase.RUNNING
                || phase == TalosTransferJournal.Phase.PAUSING
                || phase == TalosTransferJournal.Phase.VERIFYING;
    }

    private static String soleId() {
        if (STATES.size() != 1) return null;
        for (String id : STATES.keySet()) return id;
        return null;
    }

    private static State soleState() {
        String id = soleId();
        return id == null ? null : STATES.get(id);
    }

    private static int priority(StopCause cause) {
        switch (cause) {
            case USER_CANCEL: return 3;
            case USER_PAUSE: return 2;
            case SYSTEM_STOP: return 1;
            case NONE:
            default: return 0;
        }
    }
}
