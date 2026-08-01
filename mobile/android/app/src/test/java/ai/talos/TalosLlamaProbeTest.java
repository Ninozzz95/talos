package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * La regola che decide se un backend ha dato la risposta giusta, provata dove
 * si può provare: sulla JVM, senza telefono.
 *
 * Ogni test qui esiste per un modo concreto in cui un driver GPU rotto su
 * Android si comporta — non per completezza formale.
 */
public class TalosLlamaProbeTest {

    private static String longEnough(String seed) {
        StringBuilder text = new StringBuilder(seed);
        while (text.length() < TalosLlamaProbe.COMPARED_PREFIX * 2) text.append(seed);
        return text.toString();
    }

    @Test
    public void identicalOutputAgrees() {
        String text = longEnough("uno due tre quattro cinque ");
        assertTrue(TalosLlamaProbe.agreesWithReference(text, text));
    }

    @Test
    public void divergenceInsideThePrefixIsRejected() {
        String reference = longEnough("uno due tre quattro cinque ");
        String candidate = "X" + reference.substring(1);
        assertFalse("un backend che sbaglia il primo carattere e' rotto",
                TalosLlamaProbe.agreesWithReference(reference, candidate));
    }

    /**
     * Il caso che rende utile la regola: due esecuzioni entrambe corrette
     * divergono comunque, perche' backend diversi sommano in ordine diverso.
     * Se questo test fallisse, la regola scarterebbe hardware sano.
     */
    @Test
    public void divergenceAfterThePrefixIsTolerated() {
        String head = longEnough("uno due tre quattro cinque ");
        String reference = head + " e poi il riferimento continua cosi";
        String candidate = head + " e poi il candidato prende un'altra strada";
        assertTrue(TalosLlamaProbe.agreesWithReference(reference, candidate));
    }

    @Test
    public void silenceNeverAgrees() {
        String text = longEnough("uno due tre ");
        assertFalse(TalosLlamaProbe.agreesWithReference(text, ""));
        assertFalse(TalosLlamaProbe.agreesWithReference(text, "   "));
        assertFalse(TalosLlamaProbe.agreesWithReference(text, null));
        assertFalse("due silenzi non sono un accordo",
                TalosLlamaProbe.agreesWithReference("", ""));
    }

    /**
     * Un backend che si ferma dopo tre caratteri non ha "concordato sui primi
     * tre": si e' fermato. Senza questa regola un troncamento precoce passerebbe.
     */
    @Test
    public void aTruncatedAnswerIsNotAnAgreement() {
        String reference = longEnough("uno due tre quattro ");
        assertFalse(TalosLlamaProbe.agreesWithReference(reference, "uno"));
    }

    @Test
    public void theFloorOnlyHasToSaySomething() {
        assertTrue(TalosLlamaProbe.referenceIsUsable("uno"));
        assertFalse(TalosLlamaProbe.referenceIsUsable(""));
        assertFalse(TalosLlamaProbe.referenceIsUsable("  \n "));
        assertFalse(TalosLlamaProbe.referenceIsUsable(null));
    }

    /** Una misura rifiutata diventa un backend rifiutato, mai uno lento. */
    @Test
    public void aRejectedMeasurementBecomesFailedEvidence() {
        TalosBenchmarkHarness.Result rejected = TalosBenchmarkHarness.judge(
                new TalosBenchmarkHarness.Sample[0], false);
        TalosBackendChoice.Evidence evidence =
                TalosLlamaProbe.evidenceOf(TalosBackendChoice.VULKAN, "mali-g715/32.1", rejected);

        assertEquals(TalosBackendChoice.Outcome.FAILED, evidence.outcome);
        assertEquals(0.0, evidence.tokensPerSecond, 0.0001);
        assertEquals("mali-g715/32.1", evidence.driver);
    }

    /** E una accettata porta il ritmo mediano, non quello di punta. */
    @Test
    public void anAcceptedMeasurementCarriesItsRate() {
        TalosBenchmarkHarness.Sample[] samples = {
                new TalosBenchmarkHarness.Sample(0, 0, "none"),
                new TalosBenchmarkHarness.Sample(1000, 20, "none"),
                new TalosBenchmarkHarness.Sample(2000, 40, "none"),
                new TalosBenchmarkHarness.Sample(3000, 60, "none"),
        };
        TalosBenchmarkHarness.Result accepted = TalosBenchmarkHarness.judge(samples, true);
        assertEquals(TalosBenchmarkHarness.Verdict.VALID, accepted.verdict);

        TalosBackendChoice.Evidence evidence =
                TalosLlamaProbe.evidenceOf(TalosBackendChoice.CPU, "cpu", accepted);
        assertEquals(TalosBackendChoice.Outcome.CORRECT, evidence.outcome);
        assertEquals(20.0, evidence.tokensPerSecond, 0.0001);
    }
}
