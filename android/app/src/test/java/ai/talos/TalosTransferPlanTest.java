package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * The decisions taken before a single byte moves.
 *
 * Both exist because of the same failure: an app that starts a four-gigabyte
 * download it cannot finish. One runs out of disk at 90% and throws away an
 * evening of somebody's data allowance; the other picks a way of running that
 * Android will stop, and the download makes no progress while the screen is off
 * — which the user experiences as "it doesn't work" and never as a policy.
 */
public class TalosTransferPlanTest {

    private static final long MIB = 1024L * 1024L;
    private static final long GIB = 1024L * MIB;

    /**
     * The number that decides "will it fit" is the same number on both sides of
     * the app. This very nearly went wrong: the fit gate in `fit.ts` kept 1 GiB
     * free and the native plan kept 256 MiB, so a user with 700 MiB of slack
     * would have been told the model does not fit by one half and had it
     * downloaded by the other.
     */
    @Test
    public void reservesExactlyWhatTheRestOfTheAppReserves() throws Exception {
        JSONObject constants = new JSONObject(new String(Files.readAllBytes(
                Paths.get("..", "..", "src", "lib", "models", "downloadPolicy.cases.json")),
                StandardCharsets.UTF_8)).getJSONObject("constants");

        assertEquals(constants.getLong("storageReserveBytes"),
                TalosTransferPlan.STORAGE_RESERVE_BYTES);
    }

    @Test
    public void claimsEverythingStillMissingUpFront() {
        TalosTransferPlan.Space space = TalosTransferPlan.space(4 * GIB, 1 * GIB, 8 * GIB);

        assertTrue(space.enough);
        assertEquals("the whole remainder, not one window at a time", 3 * GIB, space.claimBytes);
        assertEquals(0L, space.shortfallBytes);
    }

    /**
     * Refusing up front is the entire point. Discovering it at 90% costs the
     * user three and a half gigabytes of mobile data and gives them a failure
     * they cannot act on.
     */
    @Test
    public void refusesBeforeStartingWhenTheSpaceIsNotThere() {
        TalosTransferPlan.Space space = TalosTransferPlan.space(4 * GIB, 0, 2 * GIB);

        assertFalse(space.enough);
        assertEquals("named exactly, so the screen can say how much to free",
                2 * GIB + TalosTransferPlan.STORAGE_RESERVE_BYTES, space.shortfallBytes);
    }

    /**
     * A download that fills the disk to the last byte succeeds and leaves a
     * phone that cannot take a photo. The headroom is not for us.
     */
    @Test
    public void leavesTheSystemRoomToBreathe() {
        long remaining = 4 * GIB;

        assertTrue(TalosTransferPlan.space(remaining, 0, remaining + TalosTransferPlan.STORAGE_RESERVE_BYTES).enough);
        assertFalse("exactly enough for the file is not enough",
                TalosTransferPlan.space(remaining, 0, remaining).enough);
    }

    @Test
    public void aFinishedDownloadNeedsNothingMore() {
        TalosTransferPlan.Space space = TalosTransferPlan.space(4 * GIB, 4 * GIB, 0);

        assertTrue(space.enough);
        assertEquals(0L, space.claimBytes);
    }

    /**
     * From Android 15 a `dataSync` foreground service gets six hours a day and
     * is then killed — which a 4 GB download on a slow link can genuinely reach.
     * A user-initiated data transfer job has no such budget, so on every version
     * that offers one, it wins.
     */
    @Test
    public void prefersTheJobWithNoDailyBudgetWhereverItExists() {
        assertEquals(TalosTransferPlan.Runner.USER_INITIATED_JOB,
                TalosTransferPlan.runner(36, true));
        assertEquals(TalosTransferPlan.Runner.USER_INITIATED_JOB,
                TalosTransferPlan.runner(34, true));
    }

    /** Below 34 there is no such job, so the foreground service is the best there is. */
    @Test
    public void fallsBackToItsOwnForegroundServiceOnOlderPhones() {
        assertEquals(TalosTransferPlan.Runner.FOREGROUND_SERVICE,
                TalosTransferPlan.runner(33, true));
        assertEquals(TalosTransferPlan.Runner.FOREGROUND_SERVICE,
                TalosTransferPlan.runner(26, true));
    }

    /**
     * Neither can be started from the background — Android 12 closed that door
     * for foreground services and 14 for user-initiated jobs. Pretending
     * otherwise throws at the moment of starting, in front of the user.
     *
     * So a resume that fires while the app is not visible asks the system for
     * time instead, and is promoted the next time the app is opened.
     */
    @Test
    public void asksNicelyWhenItCannotStartAnythingItself() {
        assertEquals(TalosTransferPlan.Runner.DEFERRED_JOB, TalosTransferPlan.runner(36, false));
        assertEquals(TalosTransferPlan.Runner.DEFERRED_JOB, TalosTransferPlan.runner(33, false));
    }

    /**
     * `setRequiresStorageNotLow` looks right and is a trap: a four-gigabyte
     * download makes storage low by definition, so the constraint cancels the
     * job it was meant to protect. The space check above is what guards this,
     * once, up front.
     */
    @Test
    public void neverGatesOnStorageBeingLow() {
        assertFalse(TalosTransferPlan.REQUIRES_STORAGE_NOT_LOW);
    }
}
