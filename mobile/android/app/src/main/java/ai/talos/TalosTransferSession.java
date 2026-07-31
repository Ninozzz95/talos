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

    /**
     * What to fetch: a SET of files, not one.
     *
     * A large GGUF is published in pieces — `…-00001-of-00003.gguf` and its
     * siblings are one model, and any two of the three are nothing. This used to
     * carry a single path with the byte count of the whole set, so the job
     * downloaded the first shard, asked for a window past its end, got a 416,
     * read that as "the file changed upstream" and DELETED EVERY BYTE it had
     * downloaded. Gigabytes of someone's data allowance, spent to arrive at an
     * empty folder. Found by an adversarial review, 2026-08-01 — in the same
     * commit that had just taught the interface to treat a set as one model.
     *
     * Never a token; see `resolve` below.
     */
    public static final class Request {
        public final String repo;
        public final String revision;
        public final String[] paths;
        /** Each piece's own length. The job asks for one file at a time. */
        public final long[] sizes;
        /** Each piece's own sha256, or null where the repository published none. */
        public final String[] hashes;
        public final String modelName;
        /** The sum, which is what the phone must find room for and the bar shows. */
        public final long totalBytes;

        public Request(String repo, String revision, String[] paths, long[] sizes,
                String[] hashes, String modelName) {
            this.repo = repo;
            this.revision = revision;
            this.paths = paths;
            this.sizes = sizes;
            this.hashes = hashes;
            this.modelName = modelName;
            long sum = 0;
            for (long size : sizes) sum += size;
            this.totalBytes = sum;
        }
    }

    private static final AtomicBoolean STOPPING = new AtomicBoolean(false);
    private static volatile Request active;
    private static volatile long lastHave;
    private static volatile long lastTotal;

    private TalosTransferSession() {}

    public static void begin(Request request) {
        active = request;
        // Reset, or the download centre shows the PREVIOUS transfer's byte count
        // against this model's total until the first chunk lands — a bar that
        // starts at 61% of the wrong thing.
        lastHave = 0;
        lastTotal = request.totalBytes;
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
        lastHave = 0;
        lastTotal = 0;
        STOPPING.set(false);
    }

    /**
     * Ready to be picked up again, with the request left in place.
     *
     * The system stopping a job is not the user cancelling one: `onStopJob`
     * returns true to ask for the job back, and the request has to still be
     * here when it comes. Clearing the stop flag without clearing the request
     * is the difference between resuming and abandoning.
     */
    public static void clearStopRequest() {
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
        TalosTransferProgress progress = new TalosTransferProgress();
        lastTotal = request.totalBytes;

        // One piece at a time, in order, with the bar reporting the WHOLE set:
        // the user chose a model, not a file, and a bar that restarts at zero
        // three times is a bar that is lying about what is happening.
        long done = 0;
        for (int index = 0; index < request.paths.length; index += 1) {
            final long already = done;
            final long size = request.sizes[index];

            TalosModelStore.Slot slot;
            try {
                slot = store.slot(request.repo, request.revision, request.paths[index]);
            } catch (IllegalArgumentException hostile) {
                // A path from a repository anyone in the world can publish to.
                report.finished("bad-path");
                return;
            }

            // A piece already whole is skipped, which is what makes a set of
            // three survive being interrupted between two of them.
            if (slot.finished.isFile() && slot.finished.length() == size) {
                done += size;
                lastHave = done;
                report.progress(done, request.totalBytes, progress);
                continue;
            }

            try {
                slot.prepare(size, new TalosStorageReservation(context));
            } catch (IOException noRoom) {
                report.finished("no-space");
                return;
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
                            lastHave = already + haveBytes;
                            lastTotal = request.totalBytes;
                            progress.sample(lastHave, SystemClock.elapsedRealtime());
                            report.progress(lastHave, request.totalBytes, progress);
                        }

                        @Override
                        public void onFinished(String reason) {
                            // Swallowed on purpose: only the LAST piece may end
                            // the transfer. Reporting here would tell the host
                            // the download was over after the first shard.
                            ended[0] = true;
                            failure[0] = reason;
                        }

                        @Override
                        public boolean stopRequested() {
                            return STOPPING.get();
                        }
                    }).run();

            if (!ended[0] || failure[0] != null) {
                report.finished(failure[0] != null ? failure[0] : "interrupted");
                return;
            }
            done += size;
        }

        lastHave = request.totalBytes;
        report.finished(null);
    }

    /**
     * Ask the Hub where the bytes actually are.
     *
     * `/resolve/` answers with a redirect to a signed CDN address, and the
     * redirect is followed BY HAND: swallowing it would hide the address whose
     * signature is about to expire, and the expiry is the single most common
     * thing that happens during a download this size.
     *
     * The token is FETCHED HERE, from the app's own Keystore, and never carried
     * in the job's extras — the system persists those in the clear and this app
     * will be distributed, so a credential must not sit anywhere a backup can
     * reach. It is also not held in memory between resolves: the job may live
     * for hours, and a token that exists only for the length of one request is
     * a token a heap dump cannot find.
     */
    private static TalosTransferRunner.Resolved resolveOn(
            Context context, Network network, Request request, String path) throws IOException {
        String address = "https://huggingface.co/" + request.repo + "/resolve/"
                + encode(request.revision) + "/" + encodePath(path);
        URL url = new URL(address);
        HttpURLConnection connection = (HttpURLConnection) (network == null
                ? url.openConnection()
                : network.openConnection(url));
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(15_000);
            connection.setRequestMethod("HEAD");

            // Absent is the ordinary case and not a failure: most repositories
            // are public. It is still worth having for an open one — anonymous
            // Hub limits are per IP, and a carrier puts thousands of subscribers
            // behind a single address, so without a token a user is throttled
            // for traffic that was never theirs.
            String token = TalosSecretReader.providerKey(context, "huggingface");
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);

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
