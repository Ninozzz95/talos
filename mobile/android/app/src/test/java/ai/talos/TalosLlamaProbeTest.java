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

    /**
     * ⭐ CAMBIATO APPOSTA il 01/10/2026 (owner D9): anche la CPU si giudica sul
     * compito. Prima le bastava «dire qualcosa» («uno» passava).
     */
    @Test
    public void theFloorIsJudgedOnTheTaskToo() {
        assertFalse(TalosLlamaProbe.referenceIsUsable("uno"));
        assertTrue(TalosLlamaProbe.referenceIsUsable("1\n2\n3\n4\n5"));
        assertFalse(TalosLlamaProbe.referenceIsUsable(""));
        assertFalse(TalosLlamaProbe.referenceIsUsable("  \n "));
        assertFalse(TalosLlamaProbe.referenceIsUsable(null));
    }

    /** Una misura rifiutata diventa un backend rifiutato, mai uno lento. */
    @Test
    public void aRejectedMeasurementBecomesFailedEvidence() {
        TalosBenchmarkHarness.Result rejected = TalosBenchmarkHarness.judge(
                new TalosBenchmarkHarness.Sample[0], false, 900L);
        TalosBackendChoice.Evidence evidence =
                TalosLlamaProbe.evidenceOf(TalosBackendChoice.VULKAN, "mali-g715/32.1", rejected);

        assertEquals(TalosBackendChoice.Outcome.FAILED, evidence.outcome);
        assertEquals(0L, evidence.ttftMs);
        assertEquals("mali-g715/32.1", evidence.driver);
    }

    /** E una accettata porta il TTFT misurato, non il ritmo di decodifica. */
    @Test
    public void anAcceptedMeasurementCarriesItsTtft() {
        TalosBenchmarkHarness.Sample[] samples = {
                new TalosBenchmarkHarness.Sample(0, 0, "none"),
                new TalosBenchmarkHarness.Sample(1000, 20, "none"),
                new TalosBenchmarkHarness.Sample(2000, 40, "none"),
                new TalosBenchmarkHarness.Sample(3000, 60, "none"),
        };
        TalosBenchmarkHarness.Result accepted = TalosBenchmarkHarness.judge(samples, true, 1800L);
        assertEquals(TalosBenchmarkHarness.Verdict.VALID, accepted.verdict);

        TalosBackendChoice.Evidence evidence =
                TalosLlamaProbe.evidenceOf(TalosBackendChoice.CPU, "cpu", accepted);
        assertEquals(TalosBackendChoice.Outcome.CORRECT, evidence.outcome);
        assertEquals(1800L, evidence.ttftMs);
    }

    /*
     * ⭐ A3 (01/10/2026) — la prova breve e onesta. Sul Pad, Qwen3-4B Q4_K_M
     * col motore b11312: il prompt da ~2.600 token costava ~122 s di sola
     * lettura sulla CPU, il tetto di 120 s scattava prima del primo token, e la
     * CPU finiva registrata FAILED per sempre — con GPU e NPU mai provate.
     */

    /** PROB-01 — il prompt è corto: la prova deve durare secondi, non minuti. */
    @Test
    public void prob01IlPromptDellaProvaECorto() {
        assertTrue("prompt di " + TalosLlamaProbe.PROMPT.length() + " caratteri",
                TalosLlamaProbe.PROMPT.length() < 2_000);
        assertTrue(TalosLlamaProbe.PROMPT.contains("numbers from 1 to 20"));
    }

    /** PROB-02 — ogni motore, CPU compresa, si giudica sul compito: contare in ordine. */
    @Test
    public void prob02LaRispostaGiustaEContareInOrdine() {
        assertTrue(TalosLlamaProbe.answerIsCorrect("1\n2\n3\n4\n5\n6"));
        assertFalse("vuoto", TalosLlamaProbe.answerIsCorrect(""));
        assertFalse("null", TalosLlamaProbe.answerIsCorrect(null));
        assertFalse("parla ma non conta", TalosLlamaProbe.answerIsCorrect(
                "Okay, let me figure out what the user is asking for here."));
    }

    /**
     * PROB-03 — un tempo scaduto prima del primo token NON è una prova: né
     * giusta né sbagliata. Si riprova, mai FAILED per sempre.
     */
    @Test
    public void prob03SenzaPrimoTokenNonEConclusiva() {
        TalosBenchmarkHarness.Result sbagliata = TalosBenchmarkHarness.judge(
                new TalosBenchmarkHarness.Sample[0], false, 0L);
        assertEquals(TalosBenchmarkHarness.Verdict.WRONG_ANSWER, sbagliata.verdict);
        assertFalse(TalosLlamaProbe.isConclusive(sbagliata, 0L, false));
        // Una risposta davvero sbagliata, con token arrivati, resta conclusiva.
        assertTrue(TalosLlamaProbe.isConclusive(sbagliata, 1_500L, false));
        // E una corsa che il motore ha mollato non lo è mai.
        assertFalse(TalosLlamaProbe.isConclusive(sbagliata, 1_500L, true));
    }

    /**
     * PROB-04 — il profilo lasciato da un tempo scaduto (FAILED, ttft 0,
     * scrittura 0) non conta come «già misurato»: la prova deve poter ripartire.
     */
    @Test
    public void prob04IlProfiloDaTempoScadutoNonContaComeMisura() {
        TalosLocalProfileIdentity id = new TalosLocalProfileIdentity("b11312", "abc", 2_497_281_312L, 35, "fp");
        TalosLocalProfile scaduto = new TalosLocalProfile(id, "cpu", null,
                TalosBackendChoice.Outcome.FAILED, 0L, 1L, TalosLocalProfile.Level.Q1, 0, 21.3, 10_350L);
        TalosLocalProfile vero = new TalosLocalProfile(id, "cpu", null,
                TalosBackendChoice.Outcome.CORRECT, 900L, 1L, TalosLocalProfile.Level.Q1, 5.0, 40.0, 10_350L);
        assertTrue(TalosLlamaProbe.profileMissingFor(java.util.Collections.singletonList(scaduto), 2_497_281_312L));
        assertFalse(TalosLlamaProbe.profileMissingFor(java.util.Arrays.asList(scaduto, vero), 2_497_281_312L));
        assertTrue("altro file", TalosLlamaProbe.profileMissingFor(java.util.Collections.singletonList(vero), 1L));
        assertFalse("dimensione ignota: nel dubbio non si riparte",
                TalosLlamaProbe.profileMissingFor(java.util.Collections.emptyList(), 0L));
    }

    /**
     * PROB-05 — GPU e NPU non aspettano più la CPU. Letto dal sorgente, come
     * FMT-13: il vincolo stava in due righe di `qualifyBackend`.
     */
    @Test
    public void prob05GliAcceleratoriNonAspettanoLaCpu() throws java.io.IOException {
        String sorgente = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaPlugin.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        assertFalse(sorgente.contains("gpuWanted && cpuRecorded"));
        assertFalse(sorgente.contains("npuWanted && cpuRecorded"));
        assertTrue(sorgente.contains("TalosLlamaProbe.answerIsCorrect(gpuRun.text)"));
        assertTrue(sorgente.contains("TalosLlamaProbe.answerIsCorrect(npuRun.text)"));
    }

    /**
     * PROB-06 — D13 (owner, 01/10/2026): «una copia sola». La prova si può
     * interrompere dal ponte quando la persona scrive, e una corsa interrotta
     * non si registra. Sul Pad la seconda copia ha fatto chiudere l'app
     * (LOW_MEMORY, OOM KILL, 11:13:13).
     */
    @Test
    public void prob06LaProvaSiInterrompeENonRegistraLaCorsaInterrotta() throws java.io.IOException {
        String sorgente = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaPlugin.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(sorgente.contains("public void cancelQualification(PluginCall call)"));
        assertTrue(sorgente.contains("qualificationCancelled.set(false);"));
        assertTrue(sorgente.contains("if (qualificationCancelled.get()) return false;"));
        assertTrue(sorgente.contains("result.put(\"cancelled\", qualificationCancelled.get());"));
    }
}
