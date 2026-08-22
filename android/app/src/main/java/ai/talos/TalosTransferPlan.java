package ai.talos;

/**
 * The decisions taken before a single byte moves.
 *
 * Both answer the same failure from different sides: an app that starts a
 * four-gigabyte download it cannot finish. One runs out of disk at 90% and
 * throws away an evening of somebody's data allowance. The other picks a way of
 * running that Android will stop, so nothing progresses while the screen is off
 * — which the user experiences as "it doesn't work", never as a platform policy.
 *
 * Plain arithmetic and plain rules, deliberately: they are the two decisions
 * most worth proving without a device.
 */
public final class TalosTransferPlan {

    private static final long MIB = 1024L * 1024L;

    /**
     * Space left free AFTER the download finishes.
     *
     * Not for us — for the phone. A transfer that fills the disk to the last
     * byte succeeds and leaves a device that cannot take a photo, and leaves
     * the encrypted database and its journal without room to write.
     *
     * THE SAME NUMBER AS `STORAGE_RESERVE` IN src/lib/models/fit.ts, held in
     * `downloadPolicy.cases.json` and asserted by both suites. It was very
     * nearly the fourth divergence in this codebase: the fit gate kept 1 GiB
     * and this kept 256 MiB, so a user with 700 MiB of slack would have been
     * told the model does not fit by one half of the app and had it downloaded
     * by the other. There is one answer to "will it fit".
     */
    public static final long STORAGE_RESERVE_BYTES = 1024L * MIB;

    /**
     * `setRequiresStorageNotLow` is permitted on these jobs and reads like
     * exactly the right constraint. It is a trap: a four-gigabyte download
     * makes storage low by definition, so the job is stopped by its own effect
     * and the user sees a download that dies near the end for no stated reason.
     *
     * The space check below is the guard instead — taken once, up front, where
     * it can be explained and acted on.
     */
    public static final boolean REQUIRES_STORAGE_NOT_LOW = false;

    private TalosTransferPlan() {}

    public static final class Space {
        public final boolean enough;
        /** Reserved in one call, before starting — never window by window. */
        public final long claimBytes;
        /** Named exactly, so the screen can say how much to free. */
        public final long shortfallBytes;

        Space(boolean enough, long claimBytes, long shortfallBytes) {
            this.enough = enough;
            this.claimBytes = claimBytes;
            this.shortfallBytes = shortfallBytes;
        }
    }

    /**
     * Claim the whole remainder up front.
     *
     * Reserving as you go is how a download gets to 90% and dies: the space was
     * there when it started and something else took it. Asking for all of it at
     * the beginning turns that into a refusal the user can act on — free two
     * gigabytes, or pick a smaller quantisation — instead of a loss.
     *
     * @param allocatableBytes what the platform says it could actually free up,
     *     which on Android is `StorageManager.getAllocatableBytes` and is larger
     *     than the free space, because it counts caches it is willing to drop.
     */
    public static Space space(long totalBytes, long haveBytes, long allocatableBytes) {
        long remaining = Math.max(0L, totalBytes - haveBytes);
        if (remaining == 0L) return new Space(true, 0L, 0L);

        long need = remaining + STORAGE_RESERVE_BYTES;
        if (allocatableBytes >= need) return new Space(true, remaining, 0L);
        return new Space(false, remaining, need - allocatableBytes);
    }

    public enum Runner {
        /** API 34+. No daily budget, and it survives the screen going off. */
        USER_INITIATED_JOB,
        /** API 26-33. Its own service, its own channel — never the run service. */
        FOREGROUND_SERVICE,
        /** Nothing can be started from here; ask the system and wait. */
        DEFERRED_JOB,
    }

    /**
     * From Android 15 a `dataSync` foreground service gets six hours a day and
     * is then killed — a budget a 4 GB download on a slow link can genuinely
     * reach. A user-initiated data transfer job has none, so wherever one
     * exists, it wins.
     *
     * Neither can be started from the background, and they fail differently:
     * a foreground service throws `ForegroundServiceStartNotAllowedException`,
     * while `JobScheduler.schedule` quietly returns `RESULT_FAILURE`. The quiet
     * one is worse — an app that ignores the return value shows a download that
     * simply never starts. Having an activity in the Recents list does NOT
     * count as visible for this.
     *
     * So a resume that fires while the app is not visible asks the system for
     * time instead, and is promoted the next time the app is opened.
     */
    public static Runner runner(int sdkInt, boolean appVisible) {
        if (!appVisible) return Runner.DEFERRED_JOB;
        if (sdkInt >= 34) return Runner.USER_INITIATED_JOB;
        return Runner.FOREGROUND_SERVICE;
    }
}
