package ai.talos;

import java.util.Arrays;

/**
 * What counts as a measurement, and what is merely a number.
 *
 * Zethos states it as a rule: no benchmark is repository truth until the
 * harness reproduces it with raw artifacts. This is that rule as code — the
 * thing that stands between "the GPU did 40 tokens a second once" and "this
 * backend is proven on this phone".
 *
 * A phone makes that harder than a desktop does, and every rejection below is
 * one of the ways it does. The device throttles while you measure it, the
 * scheduler hands the core to something else, the first tokens are really the
 * model loading, and a backend that produces the wrong answer quickly is not a
 * fast backend — it is a broken one. On Android that last case is not
 * hypothetical: the same GPU drivers that fail to load a model also return
 * plausible garbage.
 *
 * Pure arithmetic over samples, so the rules are provable without a device —
 * which matters, because they are the rules the device will be judged by.
 */
public final class TalosBenchmarkHarness {

    /** Below this there is no rate, only noise wearing one as a costume. */
    static final int MIN_TOKENS = 32;
    static final long MIN_DURATION_MS = 2_000L;

    /** A silence longer than this is something else running, not this. */
    static final long MAX_GAP_MS = 1_500L;

    /**
     * How much the windows may disagree before the answer is not a number.
     *
     * Generous on purpose: a phone is a noisy machine and demanding laboratory
     * stability would reject every honest run. This catches the case where the
     * measurement means nothing, not the case where it is merely imperfect.
     */
    static final double MAX_RELATIVE_SPREAD = 0.60;

    private TalosBenchmarkHarness() {}

    /** One window: the clock, the tokens produced so far, the heat right then. */
    public static final class Sample {
        public final long atMs;
        public final int tokens;
        public final String thermal;

        public Sample(long atMs, int tokens, String thermal) {
            this.atMs = atMs;
            this.tokens = tokens;
            this.thermal = thermal;
        }
    }

    public enum Verdict {
        VALID,
        /** Not enough tokens or not enough time to mean anything. */
        TOO_SHORT,
        /** The phone got hot DURING the run: this measured throttling, not it. */
        THERMAL_DRIFT,
        /** The windows disagree so much that no single number represents them. */
        UNSTABLE,
        /** Something else had the machine. */
        INTERRUPTED,
        /** Fast and wrong. The worst outcome, and the one that must never pass. */
        WRONG_ANSWER,
    }

    public static final class Result {
        public final Verdict verdict;
        /** Only meaningful when VALID; zero otherwise, never a partial number. */
        public final double tokensPerSecond;

        Result(Verdict verdict, double tokensPerSecond) {
            this.verdict = verdict;
            this.tokensPerSecond = tokensPerSecond;
        }
    }

    private static int heat(String thermal) {
        if ("critical".equals(thermal)) return 4;
        if ("severe".equals(thermal)) return 3;
        if ("moderate".equals(thermal)) return 2;
        if ("light".equals(thermal)) return 1;
        return 0;
    }

    /**
     * Judge one run.
     *
     * @param answerCorrect whether the generation matched what the harness
     *     asked for. Checked FIRST and on its own: a backend that is quick and
     *     wrong is not a quick backend, and no amount of stable timing redeems
     *     it. This is what earns a backend the right to be offered at all.
     */
    public static Result judge(Sample[] samples, boolean answerCorrect) {
        if (!answerCorrect) return new Result(Verdict.WRONG_ANSWER, 0);
        if (samples.length < 3) return new Result(Verdict.TOO_SHORT, 0);

        Sample first = samples[0];
        Sample last = samples[samples.length - 1];

        long duration = last.atMs - first.atMs;
        int tokens = last.tokens - first.tokens;
        if (duration < MIN_DURATION_MS || tokens < MIN_TOKENS) {
            return new Result(Verdict.TOO_SHORT, 0);
        }

        // The phone that ends hotter than it started was measured while it was
        // changing. Reporting that as its speed would promise a rate it can
        // hold for exactly as long as the benchmark ran.
        if (heat(last.thermal) > heat(first.thermal)) {
            return new Result(Verdict.THERMAL_DRIFT, 0);
        }

        double[] rates = new double[samples.length - 1];
        for (int index = 1; index < samples.length; index += 1) {
            long window = samples[index].atMs - samples[index - 1].atMs;
            if (window <= 0 || window > MAX_GAP_MS) return new Result(Verdict.INTERRUPTED, 0);
            int produced = samples[index].tokens - samples[index - 1].tokens;
            if (produced < 0) return new Result(Verdict.INTERRUPTED, 0);
            rates[index - 1] = produced * 1000.0 / window;
        }

        double[] sorted = rates.clone();
        Arrays.sort(sorted);
        double median = sorted.length % 2 == 1
                ? sorted[sorted.length / 2]
                : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
        if (median <= 0) return new Result(Verdict.TOO_SHORT, 0);

        // Spread against the MEDIAN, not the mean: one stolen window should not
        // be able to widen the very figure used to decide whether it counts.
        double spread = (sorted[sorted.length - 1] - sorted[0]) / median;
        if (spread > MAX_RELATIVE_SPREAD) return new Result(Verdict.UNSTABLE, 0);

        return new Result(Verdict.VALID, median);
    }

    /** A rejected run is a rejected backend — never a slow one. */
    public static TalosBackendChoice.Outcome outcomeOf(Result result) {
        return result.verdict == Verdict.VALID
                ? TalosBackendChoice.Outcome.CORRECT
                : TalosBackendChoice.Outcome.FAILED;
    }
}
