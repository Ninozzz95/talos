package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * How fast this phone actually moves memory — measured, not looked up.
 *
 * Every app in this category that predicts a speed at all does it from a table
 * of chip names. A table is wrong for the phone that is not in it, wrong for
 * the phone that is throttling, and wrong for every phone released after the
 * table was written — which, in an app that will be distributed and then sit on
 * someone's device for two years, is most of them.
 *
 * Measuring has its own honesty problem, and it is the reason for this file: a
 * benchmark that reports a number it did not really observe is worse than a
 * table, because it looks authoritative. So the arithmetic that turns timings
 * into a rate lives here, where it can be shown to refuse rather than guess.
 */
public class TalosBandwidthProbeTest {

    private static final long MIB = 1024L * 1024L;

    /**
     * The buffer has to be big enough to leave the caches and small enough not
     * to be the reason a phone starts killing things. Both ends matter: this
     * runs on the 3 GB device the feature exists for.
     */
    @Test
    public void sizesTheBufferToThePhoneItIsOn() {
        assertEquals("a small phone gets the floor, not a proportion of nothing",
                TalosBandwidthProbe.MIN_BUFFER_BYTES, TalosBandwidthProbe.bufferBytes(200 * MIB));

        assertEquals("and a large one gets the ceiling, not a gigabyte",
                TalosBandwidthProbe.MAX_BUFFER_BYTES, TalosBandwidthProbe.bufferBytes(16L * 1024 * MIB));

        long middling = TalosBandwidthProbe.bufferBytes(1024 * MIB);
        assertTrue("between the two, in whole megabytes: " + middling,
                middling >= TalosBandwidthProbe.MIN_BUFFER_BYTES
                        && middling <= TalosBandwidthProbe.MAX_BUFFER_BYTES
                        && middling % MIB == 0);
    }

    @Test
    public void reportsTheRateItActuallySaw() {
        // 8 MiB moved in 4 ms is 2000 MiB/s.
        long[] passes = { 4_000_000L, 4_000_000L, 4_000_000L, 4_000_000L };

        long rate = TalosBandwidthProbe.bytesPerSecond(passes, 8 * MIB);

        assertEquals(2000L * MIB, rate);
    }

    /**
     * The first pass is the page faults, the JIT and a cold cache. Counting it
     * would report every phone as slower than it is, and the slowest phones —
     * where the answer decides whether a model is offered at all — worst.
     */
    @Test
    public void throwsAwayTheColdPass() {
        long[] passes = { 40_000_000L, 4_000_000L, 4_000_000L, 4_000_000L };

        assertEquals(2000L * MIB, TalosBandwidthProbe.bytesPerSecond(passes, 8 * MIB));
    }

    /**
     * A phone is not a quiet machine: another app wakes, the scheduler moves
     * the thread, the screen turns on. The median survives that; a mean does
     * not, and neither does a minimum.
     */
    @Test
    public void survivesOneInterruptedPass() {
        long[] passes = { 4_000_000L, 4_000_000L, 200_000_000L, 4_000_000L, 4_000_000L };

        long rate = TalosBandwidthProbe.bytesPerSecond(passes, 8 * MIB);

        assertTrue("one stolen pass moved the answer to " + rate, rate > 1900L * MIB);
    }

    /**
     * THE refusal. With too little evidence the answer is "unknown", which the
     * fit calculation already handles by predicting no speed at all — a card
     * that says nothing about tokens per second is honest, and one that says
     * the wrong number is not.
     */
    @Test
    public void refusesToAnswerOnTooLittleEvidence() {
        assertEquals(TalosBandwidthProbe.UNKNOWN, TalosBandwidthProbe.bytesPerSecond(new long[0], 8 * MIB));
        assertEquals(TalosBandwidthProbe.UNKNOWN,
                TalosBandwidthProbe.bytesPerSecond(new long[] { 4_000_000L }, 8 * MIB));
        assertEquals(TalosBandwidthProbe.UNKNOWN,
                TalosBandwidthProbe.bytesPerSecond(new long[] { 4_000_000L, 4_000_000L }, 0));
    }

    /** A clock that reported nothing must not become an infinite bandwidth. */
    @Test
    public void refusesAPassThatTookNoTime() {
        long[] passes = { 4_000_000L, 0L, -5L, 0L };

        assertEquals(TalosBandwidthProbe.UNKNOWN, TalosBandwidthProbe.bytesPerSecond(passes, 8 * MIB));
    }

    /**
     * And a number that cannot be true must not be reported as measurement.
     * A phone does not do a terabyte a second; something else happened.
     */
    @Test
    public void refusesARateThatCannotBeReal() {
        long[] passes = { 4_000L, 4_000L, 4_000L, 4_000L };

        assertEquals(TalosBandwidthProbe.UNKNOWN, TalosBandwidthProbe.bytesPerSecond(passes, 8 * MIB));
    }
}
