package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * What counts as a measurement, and what is merely a number.
 *
 * Zethos states it as a rule: no benchmark is repository truth until the
 * harness reproduces it with raw artifacts. This is that rule as code — what
 * stands between "the GPU did 40 tokens a second once" and "this backend is
 * proven on this phone", which is what `TalosBackendChoice` will not offer a
 * backend without.
 *
 * Every rejection here is a way a phone differs from a desktop: it throttles
 * while you measure it, the scheduler hands the core away, and — on Android
 * specifically, where the same GPU drivers that fail to load a model also
 * return plausible garbage — it can be fast and wrong.
 */
public class TalosBenchmarkHarnessTest {

    /** A steady run: one window per second, twelve tokens each. */
    private static TalosBenchmarkHarness.Sample[] steady() {
        TalosBenchmarkHarness.Sample[] samples = new TalosBenchmarkHarness.Sample[6];
        for (int index = 0; index < samples.length; index += 1) {
            samples[index] = new TalosBenchmarkHarness.Sample(index * 1000L, index * 12, "none");
        }
        return samples;
    }

    @Test
    public void acceptsASteadyRunAndReportsWhatItSaw() {
        TalosBenchmarkHarness.Result result = TalosBenchmarkHarness.judge(steady(), true);

        assertEquals(TalosBenchmarkHarness.Verdict.VALID, result.verdict);
        assertEquals(12.0, result.tokensPerSecond, 0.01);
    }

    /**
     * THE rejection that matters most, and it is checked before anything else.
     *
     * A backend that is quick and wrong is not a quick backend. No amount of
     * stable timing redeems it, and on Android this is not hypothetical — the
     * drivers that fail to load a model also return plausible garbage.
     */
    @Test
    public void refusesAFastWrongAnswerBeforeItLooksAtTheTiming() {
        TalosBenchmarkHarness.Result result = TalosBenchmarkHarness.judge(steady(), false);

        assertEquals(TalosBenchmarkHarness.Verdict.WRONG_ANSWER, result.verdict);
        assertEquals(0.0, result.tokensPerSecond, 0.0001);
    }

    /** Too few tokens, or too little time, is noise wearing a rate as a costume. */
    @Test
    public void refusesARunTooShortToMeanAnything() {
        TalosBenchmarkHarness.Sample[] brief = {
            new TalosBenchmarkHarness.Sample(0, 0, "none"),
            new TalosBenchmarkHarness.Sample(400, 5, "none"),
            new TalosBenchmarkHarness.Sample(800, 10, "none"),
        };

        assertEquals(TalosBenchmarkHarness.Verdict.TOO_SHORT,
                TalosBenchmarkHarness.judge(brief, true).verdict);
        assertEquals(TalosBenchmarkHarness.Verdict.TOO_SHORT,
                TalosBenchmarkHarness.judge(new TalosBenchmarkHarness.Sample[] {
                    new TalosBenchmarkHarness.Sample(0, 0, "none"),
                }, true).verdict);
    }

    /**
     * A phone that ends hotter than it started was measured while it was
     * changing. Reporting that as its speed promises a rate it can hold for
     * exactly as long as the benchmark ran.
     */
    @Test
    public void refusesARunThatHeatedThePhoneWhileMeasuringIt() {
        TalosBenchmarkHarness.Sample[] warming = steady();
        warming[warming.length - 1] = new TalosBenchmarkHarness.Sample(5000, 60, "severe");

        assertEquals(TalosBenchmarkHarness.Verdict.THERMAL_DRIFT,
                TalosBenchmarkHarness.judge(warming, true).verdict);
    }

    /** Cooling down during a run is not a reason to throw it away. */
    @Test
    public void acceptsARunOnAPhoneThatCooledDown() {
        TalosBenchmarkHarness.Sample[] cooling = steady();
        cooling[0] = new TalosBenchmarkHarness.Sample(0, 0, "moderate");

        assertEquals(TalosBenchmarkHarness.Verdict.VALID,
                TalosBenchmarkHarness.judge(cooling, true).verdict);
    }

    /** A silence in the middle is something else having the machine. */
    @Test
    public void refusesARunSomethingElseInterrupted() {
        TalosBenchmarkHarness.Sample[] stolen = {
            new TalosBenchmarkHarness.Sample(0, 0, "none"),
            new TalosBenchmarkHarness.Sample(1000, 12, "none"),
            new TalosBenchmarkHarness.Sample(9000, 24, "none"),
            new TalosBenchmarkHarness.Sample(10_000, 36, "none"),
            new TalosBenchmarkHarness.Sample(11_000, 48, "none"),
        };

        assertEquals(TalosBenchmarkHarness.Verdict.INTERRUPTED,
                TalosBenchmarkHarness.judge(stolen, true).verdict);
    }

    /** Tokens do not un-produce themselves; a counter going backwards is a bug. */
    @Test
    public void refusesACounterThatWentBackwards() {
        TalosBenchmarkHarness.Sample[] impossible = steady();
        impossible[3] = new TalosBenchmarkHarness.Sample(3000, 10, "none");

        assertEquals(TalosBenchmarkHarness.Verdict.INTERRUPTED,
                TalosBenchmarkHarness.judge(impossible, true).verdict);
    }

    /**
     * Windows that disagree wildly do not have a single number that represents
     * them, and picking one anyway is inventing the answer.
     */
    @Test
    public void refusesARunTooUnstableToHaveARate() {
        TalosBenchmarkHarness.Sample[] erratic = {
            new TalosBenchmarkHarness.Sample(0, 0, "none"),
            new TalosBenchmarkHarness.Sample(1000, 40, "none"),
            new TalosBenchmarkHarness.Sample(2000, 42, "none"),
            new TalosBenchmarkHarness.Sample(3000, 90, "none"),
            new TalosBenchmarkHarness.Sample(4000, 92, "none"),
        };

        assertEquals(TalosBenchmarkHarness.Verdict.UNSTABLE,
                TalosBenchmarkHarness.judge(erratic, true).verdict);
    }

    /**
     * But an ordinary wobble is accepted: a phone is a noisy machine, and
     * demanding laboratory stability would reject every honest run.
     */
    @Test
    public void acceptsTheOrdinaryWobbleOfARealPhone() {
        TalosBenchmarkHarness.Sample[] wobbly = {
            new TalosBenchmarkHarness.Sample(0, 0, "none"),
            new TalosBenchmarkHarness.Sample(1000, 12, "none"),
            new TalosBenchmarkHarness.Sample(2000, 22, "none"),
            new TalosBenchmarkHarness.Sample(3000, 35, "none"),
            new TalosBenchmarkHarness.Sample(4000, 46, "none"),
        };

        TalosBenchmarkHarness.Result result = TalosBenchmarkHarness.judge(wobbly, true);

        assertEquals(TalosBenchmarkHarness.Verdict.VALID, result.verdict);
        assertTrue("expected about 11-12 t/s, got " + result.tokensPerSecond,
                result.tokensPerSecond > 10 && result.tokensPerSecond < 13);
    }

    /**
     * And a rejected run is a rejected BACKEND, never a slow one — which is
     * what stops a phone that throttled once from being offered a GPU path
     * because the number looked plausible.
     */
    @Test
    public void turnsEveryRejectionIntoARefusedBackend() {
        assertEquals(TalosBackendChoice.Outcome.CORRECT, TalosBenchmarkHarness.outcomeOf(
                TalosBenchmarkHarness.judge(steady(), true)));
        assertEquals(TalosBackendChoice.Outcome.FAILED, TalosBenchmarkHarness.outcomeOf(
                TalosBenchmarkHarness.judge(steady(), false)));
    }
}
