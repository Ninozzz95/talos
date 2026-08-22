package ai.talos;

/**
 * Every decision a four-gigabyte download makes — and no I/O at all.
 *
 * The loop has to run here rather than in JavaScript: Android suspends a
 * backgrounded WebView, which is the entire reason the transfer job exists. So
 * the same policy also exists in TypeScript, for the interface and for tests
 * that need no device.
 *
 * NEITHER copy owns the rules. `src/lib/models/downloadPolicy.cases.json` does,
 * and both test suites execute it. Two implementations of one rule diverge —
 * it has happened three times in this codebase, and the copy that diverges is
 * never the one you are looking at — so a difference between these two fails a
 * test instead of waiting to be discovered on somebody's phone.
 *
 * Every duration is MONOTONIC: `SystemClock.elapsedRealtime()`, which keeps
 * counting through deep sleep. Never the wall clock — the phone with the wrong
 * clock is disproportionately the cheap phone this feature exists for, and a
 * download that spans a night must not be confused by an NTP correction. This
 * class takes the reading as a parameter so it can be tested without a device.
 */
public final class TalosModelDownloadPolicy {

    private static final long MIB = 1024L * 1024L;

    /**
     * The transfer window. Large on purpose: re-resolving costs one unit of a
     * 3000-per-300-seconds bucket, so there is no reason to pay it every few
     * megabytes. A resolve boundary and a checkpoint boundary are NOT the same
     * thing, and fusing them is what produced the livelock the checkpoint rules
     * below exist to prevent.
     */
    public static final long WINDOW_BYTES = 128L * MIB;

    /**
     * Checkpoint on TIME, not on bytes.
     *
     * Checkpointing every 128 MiB means a link that drops every 90 seconds
     * discards everything since the last boundary, so on a commuter route the
     * download makes zero net progress and the bar walks backwards. Time bounds
     * the loss in seconds at any link speed; the byte rule only stops a fast
     * link going five seconds without a durable point.
     */
    public static final long CHECKPOINT_MS = 5_000L;
    public static final long CHECKPOINT_BYTES = 8L * MIB;

    /**
     * A tunnel does not produce an error. It produces a socket that sits there,
     * and without this the interface shows a moving spinner over a dead
     * connection — the indeterminate state this feature forbids.
     */
    public static final long STALL_MS = 8_000L;

    /** Re-resolve this long before the signature dies, so nobody sees the 403. */
    public static final long RESOLVE_MARGIN_MS = 5L * 60_000L;

    /** Past this, retrying is not perseverance — it is a spinner with extra steps. */
    public static final int MAX_FAILURES = 8;

    private TalosModelDownloadPolicy() {}

    /** Mutable because the native loop owns one of these for the whole transfer. */
    public static final class State {
        public long totalBytes;
        /** Bytes durably on disk. Never optimistic: this is what a resume trusts. */
        public long haveBytes;
        public String url;
        /** Monotonic deadline for the signed address; Long.MIN_VALUE for none. */
        public long urlDeadlineMs = Long.MIN_VALUE;
        public int consecutiveFailures;
        public long lastProgressAtMs;
        public long lastCheckpointAtMs;
        public long bytesSinceCheckpoint;

        public boolean hasDeadline() {
            return urlDeadlineMs != Long.MIN_VALUE;
        }
    }

    public enum Kind { RESOLVE, REQUEST, CHECKPOINT, WAIT, STALL, VERIFY, GIVE_UP }

    public static final class Step {
        public final Kind kind;
        public final long rangeFrom;
        /** INCLUSIVE, as HTTP ranges are. One byte wrong per window corrupts a model. */
        public final long rangeTo;
        public final long seconds;
        public final String reason;

        Step(Kind kind, long rangeFrom, long rangeTo, long seconds, String reason) {
            this.kind = kind;
            this.rangeFrom = rangeFrom;
            this.rangeTo = rangeTo;
            this.seconds = seconds;
            this.reason = reason;
        }

        static Step of(Kind kind) {
            return new Step(kind, 0, 0, 0, null);
        }

        static Step request(long from, long to) {
            return new Step(Kind.REQUEST, from, to, 0, null);
        }

        static Step wait(long seconds, String reason) {
            return new Step(Kind.WAIT, 0, 0, seconds, reason);
        }

        static Step giveUp(String reason) {
            return new Step(Kind.GIVE_UP, 0, 0, 0, reason);
        }
    }

    /**
     * What to do next. The ORDER is the argument: finishing beats
     * checkpointing, a durable point beats fetching more, and naming a stall
     * beats asking for bytes that are not coming.
     */
    public static Step nextStep(State state, long nowMs) {
        if (state.haveBytes >= state.totalBytes) return Step.of(Kind.VERIFY);

        long sinceCheckpoint = nowMs - state.lastCheckpointAtMs;
        if (state.bytesSinceCheckpoint > 0
                && (sinceCheckpoint > CHECKPOINT_MS || state.bytesSinceCheckpoint > CHECKPOINT_BYTES)) {
            return Step.of(Kind.CHECKPOINT);
        }

        long sinceProgress = nowMs - state.lastProgressAtMs;
        if (state.url != null && sinceProgress > STALL_MS) return Step.of(Kind.STALL);

        boolean expiring = state.hasDeadline() && state.urlDeadlineMs - nowMs <= RESOLVE_MARGIN_MS;
        if (state.url == null || expiring) return Step.of(Kind.RESOLVE);

        long from = state.haveBytes;
        long to = Math.min(from + WINDOW_BYTES, state.totalBytes) - 1;
        return Step.request(from, to);
    }

    /** Bounded exponential backoff: growing, never a wait nobody would sit through. */
    static long backoffSeconds(int failures) {
        return Math.min(1L << Math.min(failures, 6), 120L);
    }

    /**
     * Fold an outcome into the state and say what to do next.
     *
     * The two status codes that decide whether this works on a real phone:
     *
     * 403 is the signature expiring, which is the expected end of every signed
     * address on a file this size. Reading it as an error is what makes a
     * download fail at 85% for everyone on mobile data.
     *
     * 416 is a different animal: the range does not exist, so the file is not
     * the file we started. Resuming would splice two files into one that still
     * passes a length check, and only a hash would ever catch it.
     */
    public static Step applyStatus(State state, int status, Long retryAfterSeconds) {
        if (status == 403) {
            state.url = null;
            state.urlDeadlineMs = Long.MIN_VALUE;
            // The failure count is NOT cleared here.
            //
            // It was, and an adversarial review found what that costs: a 403
            // that keeps coming — a gated repo, a revoked token, a signature the
            // server will not issue — reset the count on every attempt and
            // returned RESOLVE, which the runner takes without sleeping. That is
            // an unbounded request loop at full speed against the Hub, on a
            // phone, with no way out. Arriving BYTES clear the count; a status
            // that merely looks recoverable does not.
            state.consecutiveFailures += 1;
            if (state.consecutiveFailures >= MAX_FAILURES) return Step.giveUp("forbidden");
            return Step.of(Kind.RESOLVE);
        }
        if (status == 416) {
            state.haveBytes = 0;
            state.bytesSinceCheckpoint = 0;
            state.url = null;
            state.urlDeadlineMs = Long.MIN_VALUE;
            return Step.giveUp("file-changed");
        }
        if (status == 429) {
            state.url = null;
            state.urlDeadlineMs = Long.MIN_VALUE;
            // Counted, so the wait actually grows.
            //
            // It was not, and the backoff was therefore computed from a number
            // that never moved: a fixed two seconds, forever, which is a client
            // doubling its own request rate against the very limiter it is
            // supposed to be respecting — and never reaching MAX_FAILURES to
            // stop. Found by an adversarial review, 2026-08-01.
            state.consecutiveFailures += 1;
            if (state.consecutiveFailures >= MAX_FAILURES) return Step.giveUp("rate-limited");
            // The Hub sends no Retry-After; when it reported nothing at all,
            // wait a bounded amount rather than inventing a number that
            // pretends to be its answer.
            long seconds = retryAfterSeconds != null
                    ? retryAfterSeconds
                    : Math.min(60L, backoffSeconds(state.consecutiveFailures));
            return Step.wait(seconds, "rate-limited");
        }
        if (status == 404 || status == 410) return Step.giveUp("gone");
        return applyError(state);
    }

    public static Step applyError(State state) {
        state.consecutiveFailures += 1;
        state.url = null;
        state.urlDeadlineMs = Long.MIN_VALUE;
        if (state.consecutiveFailures >= MAX_FAILURES) return Step.giveUp("unreachable");
        return Step.wait(backoffSeconds(state.consecutiveFailures), "backoff");
    }

    /**
     * Arriving bytes are the only proof the link works, so they are what clears
     * the failure count — not the passage of time.
     */
    public static Step applyBytes(State state, long count, long nowMs) {
        state.haveBytes += count;
        state.bytesSinceCheckpoint += count;
        state.lastProgressAtMs = nowMs;
        state.consecutiveFailures = 0;
        return nextStep(state, nowMs);
    }
}
