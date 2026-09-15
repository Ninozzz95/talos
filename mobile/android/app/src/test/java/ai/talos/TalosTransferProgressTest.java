package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * What makes a download bar feel honest or feel broken.
 *
 * The percentage is the easy half. The remaining time is the half everyone gets
 * wrong: computed from the instantaneous rate it swings between four minutes
 * and four hours twice a second, and a number that behaves like that is worse
 * than no number, because the user stops believing the screen.
 */
public class TalosTransferProgressTest {

    private static final long MIB = 1024L * 1024L;

    @Test
    public void reportsPercentWithoutEverLying() {
        TalosTransferProgress progress = new TalosTransferProgress();

        assertEquals(0, progress.percent(0, 100));
        assertEquals(50, progress.percent(50, 100));
        assertEquals(100, progress.percent(100, 100));
        assertEquals("a file of unknown size is not 100% done", 0, progress.percent(0, 0));
        assertEquals("nor is it ever over 100", 100, progress.percent(120, 100));
    }

    /** Nothing is claimed until there is enough to claim it from. */
    @Test
    public void saysNothingRatherThanGuessAtTheStart() {
        TalosTransferProgress progress = new TalosTransferProgress();
        progress.sample(0, 1000);

        assertEquals(TalosTransferProgress.UNKNOWN, progress.secondsRemaining(0, 4000 * MIB));

        progress.sample(2 * MIB, 2000);
        assertEquals("one second of evidence is not evidence",
                TalosTransferProgress.UNKNOWN, progress.secondsRemaining(2 * MIB, 4000 * MIB));
    }

    @Test
    public void tellsTheTruthOnASteadyLink() {
        TalosTransferProgress progress = new TalosTransferProgress();
        long clock = 0;
        long have = 0;
        for (int second = 0; second < 20; second += 1) {
            clock += 1000;
            have += 10 * MIB;
            progress.sample(have, clock);
        }

        // 800 MiB left at 10 MiB/s.
        long remaining = progress.secondsRemaining(have, have + 800 * MIB);

        assertTrue("expected about 80s, got " + remaining, remaining >= 76 && remaining <= 84);
    }

    /**
     * THE reason this class exists. A link that stutters — a lift, a tunnel, a
     * cell handover — must not make the estimate jump around. Real numbers from
     * a real commute: ten seconds at 10 MiB/s, one second at 200 KiB/s, back to
     * normal. The instantaneous rate says four hours. The bar must not.
     */
    @Test
    public void doesNotLurchWhenTheLinkStutters() {
        TalosTransferProgress progress = new TalosTransferProgress();
        long clock = 0;
        long have = 0;
        for (int second = 0; second < 10; second += 1) {
            clock += 1000;
            have += 10 * MIB;
            progress.sample(have, clock);
        }
        long before = progress.secondsRemaining(have, have + 1000 * MIB);

        clock += 1000;
        have += 200 * 1024;
        progress.sample(have, clock);
        long during = progress.secondsRemaining(have, have + 1000 * MIB);

        assertTrue("estimate went from " + before + "s to " + during + "s on one bad second",
                during < before * 2);
    }

    /**
     * And it must still notice when the link genuinely gets slower — smoothing
     * that never moves is just a lie told calmly.
     */
    @Test
    public void followsTheLinkDownWhenItReallyDoesGetSlower() {
        TalosTransferProgress progress = new TalosTransferProgress();
        long clock = 0;
        long have = 0;
        for (int second = 0; second < 10; second += 1) {
            clock += 1000;
            have += 10 * MIB;
            progress.sample(have, clock);
        }
        long fast = progress.secondsRemaining(have, have + 1000 * MIB);

        for (int second = 0; second < 30; second += 1) {
            clock += 1000;
            have += 1 * MIB;
            progress.sample(have, clock);
        }
        long slow = progress.secondsRemaining(have, have + 1000 * MIB);

        assertTrue("smoothing must not outlive the truth: " + fast + "s then " + slow + "s",
                slow > fast * 3);
    }

    /** A dead link must not report a remaining time at all. */
    @Test
    public void refusesToEstimateWhenNothingIsArriving() {
        TalosTransferProgress progress = new TalosTransferProgress();
        long clock = 0;
        for (int second = 0; second < 30; second += 1) {
            clock += 1000;
            progress.sample(0, clock);
        }

        assertEquals(TalosTransferProgress.UNKNOWN, progress.secondsRemaining(0, 4000 * MIB));
    }

    /**
     * Deep sleep is not a transfer rate. The phone spends most of a long
     * download asleep, and counting those hours as slow transfer would drag the
     * estimate towards nonsense every time the screen comes back on.
     */
    @Test
    public void ignoresAGapItSleptThrough() {
        TalosTransferProgress progress = new TalosTransferProgress();
        long clock = 0;
        long have = 0;
        for (int second = 0; second < 10; second += 1) {
            clock += 1000;
            have += 10 * MIB;
            progress.sample(have, clock);
        }
        long before = progress.secondsRemaining(have, have + 1000 * MIB);

        // Six hours asleep, then the loop reports in again.
        clock += 6 * 60 * 60 * 1000L;
        progress.sample(have, clock);
        long after = progress.secondsRemaining(have, have + 1000 * MIB);

        assertTrue("sleeping changed the estimate from " + before + "s to " + after + "s",
                Math.abs(after - before) <= before / 10);
    }
}
