package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Which engine actually runs the model, and why we are allowed to say so.
 *
 * On Android a GPU backend is a lottery, and this is measured rather than
 * feared: with llama.cpp's Vulkan backend, Adreno devices frequently fail to
 * load a model at all and Mali loads it and runs slowly, with the outcome
 * turning on the driver build rather than the chip. Every competitor ships an
 * "enable GPU" switch and lets the user find out.
 *
 * So the rule here is the one Zethos states as its third principle — evidence
 * before claims — made executable: a backend is OFFERED ONLY after it has
 * produced a correct answer ON THIS DEVICE, under this driver. CPU is the floor
 * and needs no proof, because it is the reference everything else is compared
 * against.
 *
 * ⛔ Fase 7(b), 2026-08-21: the axis is time to first token, not decode
 * throughput — lower is better here, the opposite direction from the field
 * this replaced. Values below are in milliseconds and shaped like real
 * measurements (a CPU floor in the tens of seconds, a GPU candidate a few
 * times faster), not like the old tokens/second fixtures.
 */
public class TalosBackendChoiceTest {

    private static final String DRIVER = "Adreno (TM) 740/512.744.0";
    private static final String OTHER_DRIVER = "Adreno (TM) 740/512.801.0";

    private static TalosBackendChoice.Evidence proven(String backend, String driver, long ttftMs) {
        return new TalosBackendChoice.Evidence(
                backend, driver, TalosBackendChoice.Outcome.CORRECT, ttftMs);
    }

    private static TalosBackendChoice.Evidence failed(String backend, String driver) {
        return new TalosBackendChoice.Evidence(
                backend, driver, TalosBackendChoice.Outcome.FAILED, 0);
    }

    /**
     * Nothing proved yet: CPU, which is the reference. Not "try the GPU and see"
     * — the seeing is what breaks phones.
     */
    @Test
    public void fallsToTheReferenceWhenNothingHasBeenProved() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(
                DRIVER, "none", new TalosBackendChoice.Evidence[0]);

        assertEquals(TalosBackendChoice.CPU, decision.backend);
        assertEquals("unproven", decision.reason);
    }

    /** A backend that earned its place, by a margin worth the risk. */
    @Test
    public void choosesAGpuThatHasProvedItselfHere() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "none",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 43_200),
                    proven(TalosBackendChoice.VULKAN, DRIVER, 11_000),
                });

        assertEquals(TalosBackendChoice.VULKAN, decision.backend);
        assertEquals("faster", decision.reason);
    }

    /**
     * THE rule the research produced. A GPU backend whose first token arrives
     * only a little sooner is not worth taking: on Android the same driver
     * that shaves a few percent off TTFT also gives the load failures and the
     * wrong answers, and CPU is the path that always works. Speed is only a
     * reason when it is a real one.
     */
    @Test
    public void refusesAGpuThatIsOnlyMarginallyFaster() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "none",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 10_000),
                    proven(TalosBackendChoice.VULKAN, DRIVER, 9_000),
                });

        assertEquals(TalosBackendChoice.CPU, decision.backend);
        assertEquals("margin", decision.reason);
    }

    /**
     * A backend that failed here is not tried again on every launch. The user
     * whose phone froze once does not get to discover it a second time.
     */
    @Test
    public void neverRetriesABackendThatFailedOnThisDevice() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "none",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 43_200),
                    failed(TalosBackendChoice.VULKAN, DRIVER),
                });

        assertEquals(TalosBackendChoice.CPU, decision.backend);
        assertTrue(TalosBackendChoice.shouldProbe(TalosBackendChoice.VULKAN, DRIVER,
                new TalosBackendChoice.Evidence[0]));
        assertFalse("a proven failure is not re-run",
                TalosBackendChoice.shouldProbe(TalosBackendChoice.VULKAN, DRIVER,
                        new TalosBackendChoice.Evidence[] { failed(TalosBackendChoice.VULKAN, DRIVER) }));
    }

    /**
     * But a driver update is a different machine.
     *
     * The outcome on Android turns on the driver build, not the chip, so
     * evidence gathered under one is worth nothing under the next — in both
     * directions: a backend that failed deserves another chance, and one that
     * passed has to earn its place again.
     */
    @Test
    public void treatsADriverUpdateAsANewMachine() {
        TalosBackendChoice.Evidence[] old = {
            proven(TalosBackendChoice.CPU, DRIVER, 43_200),
            proven(TalosBackendChoice.VULKAN, DRIVER, 11_000),
        };

        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(OTHER_DRIVER, "none", old);

        assertEquals(TalosBackendChoice.CPU, decision.backend);
        assertEquals("unproven", decision.reason);
        assertTrue("and the failure from the old driver is not held against the new one",
                TalosBackendChoice.shouldProbe(TalosBackendChoice.VULKAN, OTHER_DRIVER,
                        new TalosBackendChoice.Evidence[] { failed(TalosBackendChoice.VULKAN, DRIVER) }));
    }

    /**
     * A hot phone goes to CPU regardless of what was proved.
     *
     * Not for speed — the GPU throttles hardest and is where the driver failures
     * live, and a device already in trouble is the worst place to find out.
     */
    @Test
    public void retreatsToTheReferenceWhenThePhoneIsInTrouble() {
        TalosBackendChoice.Evidence[] evidence = {
            proven(TalosBackendChoice.CPU, DRIVER, 43_200),
            proven(TalosBackendChoice.VULKAN, DRIVER, 11_000),
        };

        assertEquals(TalosBackendChoice.VULKAN,
                TalosBackendChoice.choose(DRIVER, "light", evidence).backend);
        assertEquals(TalosBackendChoice.CPU,
                TalosBackendChoice.choose(DRIVER, "severe", evidence).backend);
        assertEquals("hot", TalosBackendChoice.choose(DRIVER, "critical", evidence).reason);
    }

    /** And a hot phone is not probed at all: proving costs a real generation. */
    @Test
    public void doesNotProbeAPhoneThatIsAlreadyStruggling() {
        assertFalse(TalosBackendChoice.shouldProbeNow("severe"));
        assertTrue(TalosBackendChoice.shouldProbeNow("none"));
        assertTrue(TalosBackendChoice.shouldProbeNow("light"));
    }

    /**
     * The reference itself is never refused. Whatever the evidence says, there
     * has to be a way to run the model — an app that decides nothing works is
     * an app that does nothing.
     */
    @Test
    public void alwaysLeavesTheReferenceAvailable() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "critical",
                new TalosBackendChoice.Evidence[] { failed(TalosBackendChoice.CPU, DRIVER) });

        assertEquals(TalosBackendChoice.CPU, decision.backend);
    }

    /** Of two proven GPU backends, the one whose first token arrives soonest. */
    @Test
    public void picksTheFastestAmongProvenBackends() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "none",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 43_200),
                    proven(TalosBackendChoice.VULKAN, DRIVER, 15_000),
                    proven(TalosBackendChoice.OPENCL, DRIVER, 11_000),
                });

        assertEquals(TalosBackendChoice.OPENCL, decision.backend);
    }

    /**
     * The exact number this rewrite is built on, so a future change to the
     * margin has to look this measurement in the eye: CPU floor cold (43.2s)
     * against OpenCL with the abort cure in its WORST thermal state, right
     * after ten minutes of sustained load (11.0s) — roughly 4x. The margin
     * asks for 2x, so this passes with real headroom, not by a hair.
     */
    @Test
    public void theMeasurementThisMarginWasCalibratedAgainst() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "moderate",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 43_200),
                    proven(TalosBackendChoice.OPENCL, DRIVER, 11_000),
                });

        assertEquals(TalosBackendChoice.OPENCL, decision.backend);
        assertEquals("faster", decision.reason);
    }

    /**
     * Fase 7(c): the one place a Decision becomes the number the JNI boundary
     * reads. A GPU decision moves every layer; CPU moves none — the same
     * default `nativeOpen` has always had.
     */
    @Test
    public void translatesADecisionIntoTheLayerCountTheEngineReads() {
        TalosBackendChoice.Decision cpu = TalosBackendChoice.choose(
                DRIVER, "none", new TalosBackendChoice.Evidence[0]);
        assertEquals("unproven means CPU means zero, exactly today's default",
                0, TalosBackendChoice.gpuLayers(cpu));

        TalosBackendChoice.Decision gpu = TalosBackendChoice.choose(DRIVER, "none",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 43_200),
                    proven(TalosBackendChoice.OPENCL, DRIVER, 11_000),
                });
        assertEquals("a proven GPU moves every layer, not a partial offload",
                -1, TalosBackendChoice.gpuLayers(gpu));
    }
}
