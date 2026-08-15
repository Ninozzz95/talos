package ai.talos;

/**
 * Which engine runs the model, and what earns it the right.
 *
 * On Android a GPU backend is a lottery, and that is measured rather than
 * feared. With llama.cpp's Vulkan backend, Adreno devices frequently fail to
 * load a model at all and Mali loads it and runs slowly; the outcome turns on
 * the DRIVER BUILD rather than the chip, which is why the community answer for
 * Adreno is a different backend entirely. Every competitor ships an "enable
 * GPU" switch and lets the user discover which kind of phone they own.
 *
 * So this encodes Zethos's third principle — evidence before claims — as
 * something executable: a backend is offered ONLY after it has produced a
 * correct answer on THIS device under THIS driver. CPU is the floor and needs
 * no proof, because it is the reference every other backend is measured
 * against, and because an app that concludes nothing works is an app that does
 * nothing.
 *
 * Pure: no JNI, no Android. The rules are provable before a single line of
 * native code exists, which is the point — they are what the native layer will
 * be asked to obey.
 */
public final class TalosBackendChoice {

    public static final String CPU = "cpu";
    public static final String VULKAN = "vulkan";
    public static final String OPENCL = "opencl";

    /**
     * How much faster a GPU has to be before it is worth the risk.
     *
     * Not a performance tuning number — a risk one. The same driver that gives
     * a 5% gain is the driver that gives the load failures and the wrong
     * answers, and the CPU path always works. Speed only counts as a reason
     * when it is a real one.
     */
    static final double WORTHWHILE_MARGIN = 1.25;

    private TalosBackendChoice() {}

    public enum Outcome {
        /** Ran and produced the answer the harness expected. */
        CORRECT,
        /** Failed to load, crashed, or produced the wrong answer. All the same. */
        FAILED,
    }

    /** What was observed, on one device, under one driver. */
    public static final class Evidence {
        public final String backend;
        /**
         * Driver and version together.
         *
         * The identity that matters is the driver BUILD, not the GPU model: the
         * same chip passes under one and fails under the next, which is exactly
         * why evidence has to be scoped to it.
         */
        public final String driver;
        public final Outcome outcome;
        public final double tokensPerSecond;

        public Evidence(String backend, String driver, Outcome outcome, double tokensPerSecond) {
            this.backend = backend;
            this.driver = driver;
            this.outcome = outcome;
            this.tokensPerSecond = tokensPerSecond;
        }
    }

    public static final class Decision {
        public final String backend;
        /**
         * Why, in a word the interface can explain: `faster`, `margin`,
         * `unproven`, `hot`. A backend chosen for reasons nobody can state is a
         * backend nobody can debug.
         */
        public final String reason;

        Decision(String backend, String reason) {
            this.backend = backend;
            this.reason = reason;
        }
    }

    /** Heat is where GPU drivers fail, so a struggling phone goes to the floor. */
    private static boolean struggling(String thermal) {
        return "severe".equals(thermal) || "critical".equals(thermal);
    }

    private static Evidence find(Evidence[] evidence, String backend, String driver) {
        for (Evidence candidate : evidence) {
            // Evidence from another driver is evidence about another machine.
            if (candidate.backend.equals(backend) && candidate.driver.equals(driver)) return candidate;
        }
        return null;
    }

    /**
     * Choose, with a reason.
     *
     * @param driver the driver fingerprint this phone is running RIGHT NOW.
     *     Evidence gathered under any other is ignored in both directions: a
     *     backend that passed must earn its place again, and one that failed
     *     deserves another chance.
     */
    public static Decision choose(String driver, String thermal, Evidence[] evidence) {
        if (struggling(thermal)) return new Decision(CPU, "hot");

        Evidence reference = find(evidence, CPU, driver);
        double baseline = reference != null && reference.outcome == Outcome.CORRECT
                ? reference.tokensPerSecond
                : 0;

        Evidence best = null;
        for (String backend : new String[] { VULKAN, OPENCL }) {
            Evidence candidate = find(evidence, backend, driver);
            if (candidate == null || candidate.outcome != Outcome.CORRECT) continue;
            if (best == null || candidate.tokensPerSecond > best.tokensPerSecond) best = candidate;
        }

        if (best == null) return new Decision(CPU, "unproven");
        // With no measured reference there is nothing to be faster THAN, so the
        // margin cannot be judged and the floor wins.
        if (baseline <= 0) return new Decision(CPU, "unproven");
        if (best.tokensPerSecond < baseline * WORTHWHILE_MARGIN) return new Decision(CPU, "margin");
        return new Decision(best.backend, "faster");
    }

    /**
     * Whether this backend is worth proving on this device.
     *
     * A backend that failed here is not tried again: the user whose phone froze
     * once does not get to discover it a second time. A driver update lifts
     * that, because it is a different machine.
     */
    public static boolean shouldProbe(String backend, String driver, Evidence[] evidence) {
        return find(evidence, backend, driver) == null;
    }

    /**
     * And a phone already in trouble is not probed at all.
     *
     * Proving costs a real generation — the whole point is that it is real —
     * and the worst moment to spend one is on a device that is already hot.
     */
    public static boolean shouldProbeNow(String thermal) {
        return !struggling(thermal);
    }
}
