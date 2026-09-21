package ai.talos;

/**
 * What the download bar is allowed to claim.
 *
 * The percentage is the easy half. The remaining time is the half everyone gets
 * wrong: taken from the instantaneous rate it swings between four minutes and
 * four hours twice a second, and a number that behaves like that is worse than
 * no number, because the user stops believing the screen and starts watching
 * the transfer instead of forgetting about it.
 *
 * So the rate is smoothed, gaps the phone slept through are not counted as slow
 * transfer, and nothing is claimed until there is enough evidence to claim it
 * from. Saying "calculating" for three seconds is honest; saying "4 hours"
 * because a lift door closed is not.
 */
public final class TalosTransferProgress {

    public static final long UNKNOWN = -1L;

    /**
     * Slow enough that one bad second cannot move the answer much, fast enough
     * that thirty seconds of a genuinely slower link does move it. Smoothing
     * that never moves is just a lie told calmly.
     */
    private static final double ALPHA = 0.2;

    /** Below this, there is no rate — only noise wearing one as a costume. */
    private static final long MIN_OBSERVED_MS = 3_000L;

    /**
     * A longer silence than this is the phone sleeping, the job being stopped,
     * or a resume hours later. None of them are a transfer rate, and counting
     * them as one drags the estimate towards nonsense every time the screen
     * comes back on.
     */
    private static final long MAX_GAP_MS = 30_000L;

    private long lastBytes = -1;
    private long lastAtMs;
    private long observedMs;
    private double bytesPerSecond;

    /** @param nowMs MONOTONIC — `elapsedRealtime`, never the wall clock. */
    public void sample(long haveBytes, long nowMs) {
        if (lastBytes < 0) {
            lastBytes = haveBytes;
            lastAtMs = nowMs;
            return;
        }
        long elapsed = nowMs - lastAtMs;
        long arrived = haveBytes - lastBytes;
        lastBytes = haveBytes;
        lastAtMs = nowMs;

        // A gap or a clock that went backwards tells us nothing about the link.
        if (elapsed <= 0 || elapsed > MAX_GAP_MS || arrived < 0) return;

        double instant = arrived * 1000.0 / elapsed;
        bytesPerSecond = observedMs == 0 ? instant : bytesPerSecond + ALPHA * (instant - bytesPerSecond);
        observedMs += elapsed;
    }

    public int percent(long haveBytes, long totalBytes) {
        if (totalBytes <= 0) return 0;
        long value = haveBytes * 100L / totalBytes;
        if (value < 0) return 0;
        return value > 100 ? 100 : (int) value;
    }

    /** {@link #UNKNOWN} whenever an honest answer is not available yet. */
    public long secondsRemaining(long haveBytes, long totalBytes) {
        if (observedMs < MIN_OBSERVED_MS || bytesPerSecond <= 0) return UNKNOWN;
        long remaining = totalBytes - haveBytes;
        if (remaining <= 0) return 0;
        long seconds = (long) Math.ceil(remaining / bytesPerSecond);
        return seconds < 1 ? 1 : seconds;
    }

    /** For the interface, which shows a speed next to the bar. */
    public long bytesPerSecond() {
        return observedMs < MIN_OBSERVED_MS ? 0 : (long) bytesPerSecond;
    }
}
