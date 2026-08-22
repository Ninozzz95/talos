package ai.talos;

import android.net.Network;
import android.os.SystemClock;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The loop. Every decision it takes belongs to a class that is proved on the
 * JVM; what is left here is the I/O those decisions are about.
 *
 * It runs natively because Android suspends a backgrounded WebView — a download
 * driven from JavaScript stops the moment the user leaves the app, which is
 * most of the hours a four-gigabyte transfer takes.
 *
 * Two details are not decoration. Every socket is opened through the `Network`
 * the job was granted, so the transfer stays on the connection the system
 * chose and does not silently move onto metered data when Wi-Fi drops. And
 * every duration is `elapsedRealtime`, which counts through deep sleep and is
 * unmoved by an NTP correction arriving in the middle of the night — the phone
 * with the wrong clock is disproportionately the cheap phone this feature is
 * for.
 */
public final class TalosTransferRunner {

    private static final String TAG = "TalosTransfer";

    /** What the loop cannot decide for itself, supplied by whoever hosts it. */
    public interface Host {
        /**
         * A fresh signed address for the file, or null if one cannot be had.
         *
         * Signed CDN addresses expire, which is the expected end of every one of
         * them on a file this size — not an error, and never surfaced as one.
         */
        Resolved resolve() throws IOException;

        /** Bytes and the current step, for the notification and the interface. */
        void onProgress(long haveBytes, long totalBytes);

        /** Called once. `reason` is null when the file is downloaded and verified. */
        void onFinished(String reason);

        /** True once the user or the system has asked this to stop. */
        boolean stopRequested();
    }

    public static final class Resolved {
        public final String url;
        /** Monotonic deadline, or Long.MIN_VALUE when the server did not say. */
        public final long deadlineMs;

        public Resolved(String url, long deadlineMs) {
            this.url = url;
            this.deadlineMs = deadlineMs;
        }
    }

    private static final int BUFFER = 64 * 1024;
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    /** Shorter than the policy's stall window so the read gives up first. */
    private static final int READ_TIMEOUT_MS = (int) TalosModelDownloadPolicy.STALL_MS;

    private final TalosModelStore.Slot slot;
    private final long totalBytes;
    private final String expectedSha256;
    private final Network network;
    private final Host host;

    public TalosTransferRunner(
            TalosModelStore.Slot slot,
            long totalBytes,
            String expectedSha256,
            Network network,
            Host host) {
        this.slot = slot;
        this.totalBytes = totalBytes;
        this.expectedSha256 = expectedSha256;
        this.network = network;
        this.host = host;
    }

    /**
     * Run until the file is whole, the host asks to stop, or the policy gives
     * up. Blocking on purpose: the host owns the thread.
     */
    public void run() {
        TalosModelStore.Resume resume = slot.resume(totalBytes);
        TalosResumableSha256 digest = resume.hashState == null
                ? null
                : TalosResumableSha256.restore(resume.hashState);

        TalosModelDownloadPolicy.State state = new TalosModelDownloadPolicy.State();
        state.totalBytes = totalBytes;
        // A hash state that could not be restored means the bytes on disk are
        // no longer provable, so they are not claimed either. Rare, and paid for
        // once, rather than a hash that is confidently wrong.
        state.haveBytes = digest == null ? 0 : resume.haveBytes;
        if (digest == null) digest = new TalosResumableSha256();
        long now = SystemClock.elapsedRealtime();
        state.lastProgressAtMs = now;
        state.lastCheckpointAtMs = now;

        try (RandomAccessFile file = new RandomAccessFile(slot.partial, "rw")) {
            drive(state, digest, file);
        } catch (IOException failed) {
            host.onFinished("io");
        }
    }

    private void drive(
            TalosModelDownloadPolicy.State state,
            TalosResumableSha256 digest,
            RandomAccessFile file) throws IOException {
        while (!host.stopRequested()) {
            long now = SystemClock.elapsedRealtime();
            TalosModelDownloadPolicy.Step step = TalosModelDownloadPolicy.nextStep(state, now);

            switch (step.kind) {
                case VERIFY:
                    verify(state, digest, file);
                    return;

                case CHECKPOINT:
                    commit(state, digest, file, now);
                    break;

                case RESOLVE: {
                    TalosTransferRunner.Resolved resolved;
                    try {
                        resolved = host.resolve();
                    } catch (IOException unreachable) {
                        Log.w(TAG, "resolve failed: "
                                + unreachable.getClass().getSimpleName() + ": " + unreachable.getMessage());
                        resolved = null;
                    }
                    if (resolved == null) {
                        if (!pause(TalosModelDownloadPolicy.applyError(state))) return;
                        break;
                    }
                    state.url = resolved.url;
                    state.urlDeadlineMs = resolved.deadlineMs;
                    state.lastProgressAtMs = SystemClock.elapsedRealtime();
                    break;
                }

                case STALL:
                    // A tunnel produces no error, only a socket that sits there.
                    // Naming it beats a moving spinner over a dead connection.
                    state.url = null;
                    state.urlDeadlineMs = Long.MIN_VALUE;
                    if (!pause(TalosModelDownloadPolicy.applyError(state))) return;
                    break;

                case WAIT:
                    if (!pause(step)) return;
                    break;

                case GIVE_UP:
                    commit(state, digest, file, now);
                    host.onFinished(step.reason);
                    return;

                case REQUEST:
                default:
                    if (!transfer(state, digest, file, step)) return;
                    break;
            }
        }
        commit(state, digest, file, SystemClock.elapsedRealtime());
        host.onFinished("stopped");
    }

    /** @return false when the loop must end. */
    private boolean transfer(
            TalosModelDownloadPolicy.State state,
            TalosResumableSha256 digest,
            RandomAccessFile file,
            TalosModelDownloadPolicy.Step step) throws IOException {
        HttpURLConnection connection = open(state.url);
        if (connection == null) {
            return pause(TalosModelDownloadPolicy.applyError(state));
        }
        try {
            connection.setRequestProperty(
                    "Range", "bytes=" + step.rangeFrom + "-" + step.rangeTo);
            int status = connection.getResponseCode();

            if (status != 200 && status != 206) {
                TalosModelDownloadPolicy.Step next = TalosModelDownloadPolicy.applyStatus(
                        state, status, retryAfter(connection));
                if (next.kind == TalosModelDownloadPolicy.Kind.GIVE_UP) {
                    if ("file-changed".equals(next.reason)) slot.discard();
                    host.onFinished(next.reason);
                    return false;
                }
                return next.kind != TalosModelDownloadPolicy.Kind.WAIT || pause(next);
            }

            // A 200 to a ranged request means the server ignored the range and
            // is sending the whole file. Writing it at our offset would splice
            // the file into itself.
            if (status == 200 && step.rangeFrom > 0) {
                state.haveBytes = 0;
                slot.discard();
                host.onFinished("file-changed");
                return false;
            }

            file.seek(step.rangeFrom);
            byte[] buffer = new byte[BUFFER];
            long arrived = 0;
            try (InputStream body = connection.getInputStream()) {
                int read;
                while ((read = body.read(buffer)) >= 0) {
                    arrived += read;
                    if (host.stopRequested()) return true;
                    if (read == 0) continue;
                    file.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    long now = SystemClock.elapsedRealtime();
                    TalosModelDownloadPolicy.Step next =
                            TalosModelDownloadPolicy.applyBytes(state, read, now);
                    host.onProgress(state.haveBytes, totalBytes);
                    if (next.kind == TalosModelDownloadPolicy.Kind.CHECKPOINT) {
                        commit(state, digest, file, now);
                    }
                    if (state.haveBytes >= totalBytes) break;
                }
            }
            // A response that delivered nothing is a failure, not a success.
            //
            // It returned true with the state untouched, so the loop reissued
            // the identical request immediately: a tight request loop for the
            // whole eight-second stall window before a single failure was
            // counted. Found by an adversarial review, 2026-08-01.
            if (arrived == 0) return pause(TalosModelDownloadPolicy.applyError(state));
            return true;
        } catch (IOException dropped) {
            Log.w(TAG, "transfer failed: "
                    + dropped.getClass().getSimpleName() + ": " + dropped.getMessage());
            return pause(TalosModelDownloadPolicy.applyError(state));
        } finally {
            connection.disconnect();
        }
    }

    /**
     * The order is the whole point: the bytes are on the platter BEFORE the
     * note that claims they are. The other way round is the one failure a
     * resume cannot repair — a checkpoint describing bytes that were never
     * written, and a hash computed over a hole.
     */
    private void commit(
            TalosModelDownloadPolicy.State state,
            TalosResumableSha256 digest,
            RandomAccessFile file,
            long nowMs) throws IOException {
        file.getFD().sync();
        slot.checkpoint(totalBytes, state.haveBytes, digest.exportState());
        state.lastCheckpointAtMs = nowMs;
        state.bytesSinceCheckpoint = 0;
    }

    /**
     * The step nobody else takes. Across nine on-device model apps read at code
     * level, not one verifies a cryptographic hash — and a truncated or
     * corrupted GGUF does not crash, it loads and answers badly.
     */
    private void verify(
            TalosModelDownloadPolicy.State state,
            TalosResumableSha256 digest,
            RandomAccessFile file) throws IOException {
        commit(state, digest, file, SystemClock.elapsedRealtime());
        file.close();

        if (expectedSha256 != null && !expectedSha256.equalsIgnoreCase(digest.hex())) {
            // Keeping it would leave a file that fails silently every time it is
            // loaded, for as long as it sits there.
            slot.discard();
            host.onFinished("hash-mismatch");
            return;
        }
        slot.finish(totalBytes);
        host.onProgress(totalBytes, totalBytes);
        host.onFinished(null);
    }

    private HttpURLConnection open(String address) {
        try {
            URL url = new URL(address);
            HttpURLConnection connection = (HttpURLConnection) (network == null
                    ? url.openConnection()
                    : network.openConnection(url));
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            // Followed by hand: a redirect off the signed address has to be seen
            // to know the signature expired, not swallowed as a success.
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept-Encoding", "identity");
            return connection;
        } catch (IOException | RuntimeException refused) {
            Log.w(TAG, "open failed: "
                    + refused.getClass().getSimpleName() + ": " + refused.getMessage());
            return null;
        }
    }

    /** The Hub sends no Retry-After; other hosts might, so it is read if present. */
    private static Long retryAfter(HttpURLConnection connection) {
        String header = connection.getHeaderField("Retry-After");
        if (header == null) return null;
        try {
            return Long.parseLong(header.trim());
        } catch (NumberFormatException notASecondCount) {
            return null;
        }
    }

    /**
     * Wait, and say whether the loop may continue.
     *
     * THE CONTRACT: false is returned only after `onFinished` has been called.
     *
     * It did not hold, and an adversarial review found the cost. Stopping while
     * the loop sat in a backoff — a pause is where a slow link spends most of
     * its life — returned false without telling anyone, so `drive()` returned
     * silently: the foreground service was never stopped, `jobFinished` was
     * never called, and the session stayed marked active forever. The next
     * download refused with "one at a time" against a transfer that had ended
     * minutes earlier, and the only cure was force-stopping the app.
     */
    private boolean pause(TalosModelDownloadPolicy.Step step) {
        if (step.kind == TalosModelDownloadPolicy.Kind.GIVE_UP) {
            host.onFinished(step.reason);
            return false;
        }
        long until = SystemClock.elapsedRealtime() + step.seconds * 1000L;
        while (SystemClock.elapsedRealtime() < until) {
            if (host.stopRequested()) {
                host.onFinished("stopped");
                return false;
            }
            try {
                Thread.sleep(250L);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                host.onFinished("stopped");
                return false;
            }
        }
        return true;
    }
}
