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
 */
public class TalosBackendChoiceTest {

    private static final String DRIVER = "Adreno (TM) 740/512.744.0";
    private static final String OTHER_DRIVER = "Adreno (TM) 740/512.801.0";

    private static TalosBackendChoice.Evidence proven(
            String backend, String driver, double tokensPerSecond) {
        return new TalosBackendChoice.Evidence(
                backend, driver, TalosBackendChoice.Outcome.CORRECT, tokensPerSecond);
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
                    proven(TalosBackendChoice.CPU, DRIVER, 8.0),
                    proven(TalosBackendChoice.VULKAN, DRIVER, 22.0),
                });

        assertEquals(TalosBackendChoice.VULKAN, decision.backend);
        assertEquals("faster", decision.reason);
    }

    /**
     * THE rule the research produced. A GPU backend that is barely ahead is not
     * worth taking: on Android the same driver that gives 5% also gives the load
     * failures and the wrong answers, and CPU is the path that always works.
     * Speed is only a reason when it is a real one.
     */
    @Test
    public void refusesAGpuThatIsOnlyMarginallyFaster() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "none",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 10.0),
                    proven(TalosBackendChoice.VULKAN, DRIVER, 11.0),
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
                    proven(TalosBackendChoice.CPU, DRIVER, 8.0),
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
            proven(TalosBackendChoice.CPU, DRIVER, 8.0),
            proven(TalosBackendChoice.VULKAN, DRIVER, 22.0),
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
            proven(TalosBackendChoice.CPU, DRIVER, 8.0),
            proven(TalosBackendChoice.VULKAN, DRIVER, 22.0),
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

    /** Of two proven GPU backends, the faster — OpenCL is the Adreno answer. */
    @Test
    public void picksTheFastestAmongProvenBackends() {
        TalosBackendChoice.Decision decision = TalosBackendChoice.choose(DRIVER, "none",
                new TalosBackendChoice.Evidence[] {
                    proven(TalosBackendChoice.CPU, DRIVER, 8.0),
                    proven(TalosBackendChoice.VULKAN, DRIVER, 14.0),
                    proven(TalosBackendChoice.OPENCL, DRIVER, 26.0),
                });

        assertEquals(TalosBackendChoice.OPENCL, decision.backend);
    }
}
