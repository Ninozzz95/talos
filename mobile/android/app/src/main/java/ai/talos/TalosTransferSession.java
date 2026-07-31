package ai.talos;

import android.content.Context;
import android.net.Network;
import android.os.SystemClock;

import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * The one transfer in flight, and everything both hosts need to run it.
 *
 * One at a time on purpose. Two four-gigabyte downloads on a phone share a link
 * and a disk and finish later than they would in sequence, while doubling the
 * chance of running out of space — and the queue that results is honest to show.
 *
 * Held statically because a `JobService` and a `Service` are two different
 * objects that must not both be transferring, and because the stop button on
 * the notification arrives at a third — a `BroadcastReceiver`. Nothing durable
 * lives here: the state that matters is on disk after every checkpoint, which
 * is what makes the Task Manager killing the process survivable.
 */
public final class TalosTransferSession {

    /** What to fetch. Never a token — see `resolve` below. */
    public static final class Request {
        public final String repo;
        public final String revision;
        public final String path;
        public final String modelName;
        public final long totalBytes;
        public final String sha256;

        public Request(String repo, String revision, String path, String modelName,
                long totalBytes, String sha256) {
            this.repo = repo;
            this.revision = revision;
            this.path = path;
            this.modelName = modelName;
            this.totalBytes = totalBytes;
            this.sha256 = sha256;
        }
    }

    private static final AtomicBoolean STOPPING = new AtomicBoolean(false);
    private static volatile Request active;
    private static volatile long lastHave;
    private static volatile long lastTotal;

    private TalosTransferSession() {}

    public static void begin(Request request) {
        active = request;
        STOPPING.set(false);
    }

    public static Request active() {
        return active;
    }

    public static void requestStop() {
        STOPPING.set(true);
    }

    public static boolean stopRequested() {
        return STOPPING.get();
    }

    public static void end() {
        active = null;
        STOPPING.set(false);
    }

    public static long haveBytes() {
        return lastHave;
    }

    public static long totalBytes() {
        return lastTotal;
    }

    /** Told what happened, so the host can update or clear its notification. */
    public interface Report {
        void progress(long haveBytes, long totalBytes, TalosTransferProgress progress);
        void finished(String reason);
    }

    /**
     * Where the models live: app-private external storage.
     *
     * Not the internal data directory, which on many phones is a smaller
     * partition that four gigabytes will not fit on. Not shared storage either
     * — a model in Downloads is a model any other app can read or corrupt, and
     * one the user will eventually delete by accident. App-private external is
     * removed cleanly on uninstall, which is the honest contract for something
     * this large.
     */
    public static File rootFor(Context context) {
        File external = context.getExternalFilesDir(null);
        return external != null ? external : context.getFilesDir();
    }

    /**
     * Run to completion on the calling thread.
     *
     * The network is the one the host was granted — every socket goes through
     * it, so a transfer started on Wi-Fi does not silently continue on the
     * user's data allowance when the Wi-Fi drops.
     */
    public static void run(Context context, Request request, Network network, Report report) {
        TalosModelStore store = new TalosModelStore(rootFor(context));
        TalosModelStore.Slot slot;
        try {
            slot = store.slot(request.repo, request.revision, request.path);
        } catch (IllegalArgumentException hostile) {
            // A path from a repository anyone in the world can publish to.
            report.finished("bad-path");
            return;
        }

        TalosTransferProgress progress = new TalosTransferProgress();
        lastTotal = request.totalBytes;

        try {
            slot.prepare(request.totalBytes, new TalosStorageReservation(context));
        } catch (IOException noRoom) {
            report.finished("no-space");
            return;
        }

        new TalosTransferRunner(slot, request.totalBytes, request.sha256, network,
                new TalosTransferRunner.Host() {
                    @Override
                    public TalosTransferRunner.Resolved resolve() throws IOException {
                        return resolveOn(network, request);
                    }

                    @Override
                    public void onProgress(long haveBytes, long totalBytes) {
                        lastHave = haveBytes;
                        lastTotal = totalBytes;
                        progress.sample(haveBytes, SystemClock.elapsedRealtime());
                        report.progress(haveBytes, totalBytes, progress);
                    }

                    @Override
                    public void onFinished(String reason) {
                        report.finished(reason);
                    }

                    @Override
                    public boolean stopRequested() {
                        return STOPPING.get();
                    }
                }).run();
    }

    /**
     * Ask the Hub where the bytes actually are.
     *
     * `/resolve/` answers with a redirect to a signed CDN address, and the
     * redirect is followed BY HAND: swallowing it would hide the address whose
     * signature is about to expire, and the expiry is the single most common
     * thing that happens during a download this size.
     *
     * ANONYMOUS. No token is read here and none is carried in the job's extras
     * — extras are persisted by the system in the clear, and this app will be
     * distributed, so a credential must never be somewhere a backup can reach.
     * Gated repositories therefore cannot be fetched in the background yet;
     * that needs a native secret store and is named as owed work rather than
     * half-built here.
     */
    private static TalosTransferRunner.Resolved resolveOn(Network network, Request request)
            throws IOException {
        String address = "https://huggingface.co/" + request.repo + "/resolve/"
                + encode(request.revision) + "/" + encodePath(request.path);
        URL url = new URL(address);
        HttpURLConnection connection = (HttpURLConnection) (network == null
                ? url.openConnection()
                : network.openConnection(url));
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(15_000);
            connection.setRequestMethod("HEAD");

            int status = connection.getResponseCode();
            String location = connection.getHeaderField("Location");
            String signed = (status >= 300 && status < 400 && location != null) ? location : address;

            return new TalosTransferRunner.Resolved(signed, deadlineOf(connection, signed));
        } finally {
            connection.disconnect();
        }
    }

    /**
     * When the signature dies, as a MONOTONIC instant.
     *
     * Measured against the server's own `Date` rather than the phone's clock:
     * the phone with the wrong clock is disproportionately the cheap phone this
     * feature exists for, and a download that spans a night must not be
     * confused by an NTP correction arriving in the middle of it.
     *
     * The same arithmetic exists in `huggingFace.ts`, and is deliberately NOT
     * shared: if the two ever drift, the cost is one wasted request, because
     * the 403 path re-resolves and keeps every byte. Returning "unknown" here
     * simply means always taking that path.
     */
    private static long deadlineOf(HttpURLConnection connection, String signed) {
        long expires = numberInQuery(signed, "Expires");
        if (expires <= 0) return Long.MIN_VALUE;
        long serverNow = connection.getHeaderFieldDate("Date", 0L) / 1000L;
        if (serverNow <= 0) return Long.MIN_VALUE;
        long lives = expires - serverNow;
        if (lives <= 0) return Long.MIN_VALUE;
        return SystemClock.elapsedRealtime() + lives * 1000L;
    }

    /**
     * Package-private so the two pure pieces of resolving can be proved without
     * a device. Both fail silently when wrong — a bad encoding is a 404 that
     * looks like a broken repository, and a misread expiry re-resolves an
     * address that was alive, into the Hub's rate limiter.
     */
    static long numberInQuery(String url, String key) {
        int at = -1;
        int from = 0;
        while (true) {
            int found = url.indexOf(key + "=", from);
            if (found < 0) break;
            // A parameter that merely ENDS with this name is a different
            // parameter, and reading its number as the deadline would put the
            // download on a schedule nothing agreed to.
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
}
