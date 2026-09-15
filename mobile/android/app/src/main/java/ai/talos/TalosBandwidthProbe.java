package ai.talos;

import android.os.SystemClock;

import java.util.Arrays;

/**
 * How fast this phone actually moves memory — measured, not looked up.
 *
 * Every app in this category that predicts a speed at all does it from a table
 * of chip names. A table is wrong for the phone that is not in it, wrong for
 * the phone that is throttling, and wrong for every phone released after the
 * table was written — which, for an app that will be distributed and then live
 * on someone's device for two years, is most of them. It is also exactly the
 * kind of list this project has ruled out baking into an APK.
 *
 * What it measures, stated plainly rather than dressed up: the throughput a
 * large managed-memory copy achieves on this device right now. That is a LOWER
 * BOUND on the memory subsystem — it carries the runtime's own overhead — and
 * it is the number that matters, because a lower bound on copy throughput is
 * what a token actually costs when the weights do not fit in cache. It is not
 * a DRAM specification and is never presented as one.
 *
 * The arithmetic lives apart from the measurement so it can be shown to refuse
 * rather than guess: a benchmark that reports a number it did not really
 * observe is worse than a table, because it looks authoritative.
 */
public final class TalosBandwidthProbe {

    private static final long MIB = 1024L * 1024L;

    public static final long UNKNOWN = 0L;

    /** Below this the copy never leaves the caches and measures the wrong thing. */
    public static final long MIN_BUFFER_BYTES = 4 * MIB;

    /**
     * And above this the probe is itself the reason a 3 GB phone starts killing
     * things — on the device this feature exists for, which would be a fine
     * irony and a real bug.
     */
    public static final long MAX_BUFFER_BYTES = 16 * MIB;

    /** Two buffers, and never more than this share of what the phone has spare. */
    private static final long SHARE = 64;

    private static final int PASSES = 5;

    /** No phone does this. A number above it is a broken clock, not a fast chip. */
    private static final long IMPOSSIBLE_BYTES_PER_SECOND = 512L * 1024 * MIB;

    private TalosBandwidthProbe() {}

    public static long bufferBytes(long availableRamBytes) {
        long share = availableRamBytes / SHARE;
        long clamped = Math.max(MIN_BUFFER_BYTES, Math.min(MAX_BUFFER_BYTES, share));
        return (clamped / MIB) * MIB;
    }

    /**
     * Turn timings into a rate, or into an admission that there is none.
     *
     * The first pass is discarded — it is page faults, a cold cache and the JIT,
     * and counting it reports every phone as slower than it is, the slowest ones
     * worst. The rest are taken by MEDIAN, because a phone is not a quiet
     * machine: another app wakes, the scheduler moves the thread, and a mean
     * would carry that into the answer while a minimum would report the one
     * pass that got lucky.
     */
    public static long bytesPerSecond(long[] nanosPerPass, long bytesPerPass) {
        if (bytesPerPass <= 0 || nanosPerPass.length < 3) return UNKNOWN;

        long[] rates = new long[nanosPerPass.length - 1];
        int found = 0;
        for (int i = 1; i < nanosPerPass.length; i += 1) {
            long nanos = nanosPerPass[i];
            if (nanos <= 0) continue;
            rates[found] = (long) (bytesPerPass * 1_000_000_000.0 / nanos);
            found += 1;
        }
        if (found < 2) return UNKNOWN;

        long[] usable = Arrays.copyOf(rates, found);
        Arrays.sort(usable);
        long median = found % 2 == 1
                ? usable[found / 2]
                : (usable[found / 2 - 1] + usable[found / 2]) / 2;

        return median >= IMPOSSIBLE_BYTES_PER_SECOND ? UNKNOWN : median;
    }

    /**
     * Run it. Bounded to a few tens of milliseconds on purpose — this happens
     * while someone is looking at a screen, and a probe that makes the model
     * list feel slow has traded the wrong thing.
     */
    public static long measure(long availableRamBytes) {
        int size = (int) bufferBytes(availableRamBytes);
        byte[] from;
        byte[] to;
        try {
            from = new byte[size];
            to = new byte[size];
        } catch (OutOfMemoryError noRoom) {
            // The one phone where this matters most is the one that cannot
            // spare the buffer. Saying nothing is correct; the fit calculation
            // then predicts no speed rather than a wrong one.
            return UNKNOWN;
        }

        // Touch it first so the pages exist: otherwise the first passes measure
        // the kernel handing out memory, not this phone moving it.
        Arrays.fill(from, (byte) 0x5a);

        long[] nanos = new long[PASSES];
        for (int pass = 0; pass < PASSES; pass += 1) {
            long started = SystemClock.elapsedRealtimeNanos();
            System.arraycopy(from, 0, to, 0, size);
            nanos[pass] = SystemClock.elapsedRealtimeNanos() - started;
        }

        // A copy reads one buffer and writes another: both cross the bus.
        return bytesPerSecond(nanos, 2L * size);
    }
}
