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
        // ⛔ 22/10/2026 (PROB-07): si giudica la RISPOSTA letta dal parser del template, non il testo grezzo.
        assertTrue(sorgente.contains("TalosLlamaProbe.compitoSvolto(gpuRun.lettura)"));
        assertTrue(sorgente.contains("TalosLlamaProbe.compitoSvolto(npuRun.lettura)"));
    }

    /*
     * ⭐ PROB-07…12 (22/10/2026) — i modelli che RAGIONANO. Sul Pad, llama.cpp
     * v0.7.0: Qwen3.5-2B (Q4_0/Q4_K_M/Q8_0), Granite 4.2 3B e LFM2.5-2.6B Q8_0
     * uscivano WRONG_ANSWER tps 0.0 su TUTTI i motori, CPU compresa. I binari
     * ufficiali (b11312 e v0.7.0, CPU e HTP0) col prompt esatto della prova
     * scrivono lo stesso testo: il ragionamento, mai il conteggio, dentro la
     * finestra misurata. Non era il motore: era la prova.
     */

    /** Il testo esatto letto sul Pad da `llama-completion` col prompt della prova. */
    private static final String QWEN35_GREZZO =
            "<think> Thinking Process: 1. **Analyze the Request:** * Input: A list of 16 notes "
            + "about stations, temperatures, wind speeds. * Task: Ignore the notes ab";

    private static String letturaJson(String contenuto, String ragionamento) {
        try {
            return new org.json.JSONObject()
                    .put("content", contenuto)
                    .put("reasoning", ragionamento)
                    .put("toolCalls", new org.json.JSONArray())
                    .toString();
        } catch (org.json.JSONException nonPuoAccadereConChiaviCostanti) {
            // ⛔ Sul classpath Android `put` dichiara l'eccezione: con chiavi costanti non scatta mai.
            throw new IllegalStateException(nonPuoAccadereConChiaviCostanti);
        }
    }

    /**
     * PROB-07 — un modello che sta ancora RAGIONANDO non ha risposto: la misura
     * non si chiude alla soglia dei quattro secondi, si aspetta la risposta.
     */
    @Test
    public void prob07IlRagionamentoNonChiudeLaMisura() {
        TalosLlamaProbe.Lettura lettura = TalosLlamaProbe.Lettura.dalParser(QWEN35_GREZZO,
                letturaJson("", QWEN35_GREZZO.substring("<think> ".length())));
        assertTrue(lettura.staAncoraPensando());
        assertEquals("", lettura.risposta());
        assertFalse("ragiona ancora: chiudere qui e' il WRONG_ANSWER del Pad",
                TalosLlamaProbe.rispostaGiudicabile(lettura));
        assertFalse(TalosLlamaProbe.compitoSvolto(lettura));
    }

    /**
     * PROB-07b — e il motore la chiede DAVVERO a finestra piena. Letto dal
     * sorgente: `run` non si prova sulla JVM (JNI).
     */
    @Test
    public void prob07bIlMotoreAspettaUnaRispostaGiudicabile() throws java.io.IOException {
        String motore = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaEngine.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(motore.contains("if (measuredEnough && lettore != null) {"));
        assertTrue(motore.contains("measuredEnough = TalosLlamaProbe.rispostaGiudicabile("));
        String plugin = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaPlugin.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(plugin.contains("TalosLlamaProbe.Lettura.dalParser(testo, engine.parseReplyPartial(testo))"));
    }

    /**
     * PROB-08 — si giudica la RISPOSTA, mai il ragionamento. Un ragionamento a
     * passi numerati «1. 2. 3. 4. 5.» non e' il compito svolto; il conteggio
     * dopo il ragionamento si'.
     */
    @Test
    public void prob08SiGiudicaLaRispostaDopoIlRagionamento() {
        String passi = "1. Analyze. 2. Plan. 3. Check. 4. Draft. 5. Answer.";
        TalosLlamaProbe.Lettura conta = TalosLlamaProbe.Lettura.dalParser(
                "<think>" + passi + "</think>1\n2\n3\n4\n5\n6", letturaJson("1\n2\n3\n4\n5\n6", passi));
        assertFalse(conta.staAncoraPensando());
        assertTrue(TalosLlamaProbe.rispostaGiudicabile(conta));
        assertTrue(TalosLlamaProbe.compitoSvolto(conta));

        String chiacchiera = "Sure! I can definitely help you with that request, here it comes right away. "
                + "Let me know if there is anything else you would like me to do for you today.";
        TalosLlamaProbe.Lettura sbaglia = TalosLlamaProbe.Lettura.dalParser(
                "<think>" + passi + "</think>" + chiacchiera, letturaJson(chiacchiera, passi));
        assertTrue("una risposta lunga che non conta si giudica (e si boccia)",
                TalosLlamaProbe.rispostaGiudicabile(sbaglia));
        assertFalse("i passi numerati del ragionamento non sono il compito",
                TalosLlamaProbe.compitoSvolto(sbaglia));
    }

    /**
     * PROB-09 — la risposta e' appena cominciata («1\n»): non si chiude ancora,
     * altrimenti si boccia un modello che stava contando.
     */
    @Test
    public void prob09UnaRispostaAppenaIniziataNonSiGiudica() {
        TalosLlamaProbe.Lettura appena = TalosLlamaProbe.Lettura.dalParser(
                "<think>ok</think>1\n", letturaJson("1\n", "ok"));
        assertFalse(TalosLlamaProbe.rispostaGiudicabile(appena));
    }

    /**
     * PROB-10 — senza parser (GGUF senza template, lettura non riuscita: il JNI
     * restituisce due stringhe vuote) vale il testo grezzo, come prima: le
     * corse che oggi si qualificano non cambiano verdetto.
     */
    @Test
    public void prob10SenzaParserValeIlTestoGrezzo() {
        String grezzo = "1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n20\n";
        TalosLlamaProbe.Lettura vuota = TalosLlamaProbe.Lettura.dalParser(grezzo, letturaJson("", ""));
        assertFalse(vuota.staAncoraPensando());
        assertTrue(TalosLlamaProbe.compitoSvolto(vuota));
        assertTrue(TalosLlamaProbe.rispostaGiudicabile(vuota));
        TalosLlamaProbe.Lettura illeggibile = TalosLlamaProbe.Lettura.dalParser(grezzo, null);
        assertTrue(TalosLlamaProbe.compitoSvolto(illeggibile));
        assertTrue(TalosLlamaProbe.compitoSvolto(TalosLlamaProbe.Lettura.dalParser(grezzo, "{non json")));
        String coreano = "model 원: ? 어 (Translation **Model 어 원: ? 어 (Translation **Model 어 원: ? 어 "
                + "(Translation **Model 어 원: ? 어 (Translation **Model 어 원: ? 어 (Translation **Model 어";
        TalosLlamaProbe.Lettura guasta = TalosLlamaProbe.Lettura.dalParser(coreano, letturaJson("", ""));
        assertTrue(TalosLlamaProbe.rispostaGiudicabile(guasta));
        assertFalse("un motore rotto resta bocciato", TalosLlamaProbe.compitoSvolto(guasta));
    }

    /**
     * PROB-11 — la prova parla al modello col SUO template e col ragionamento
     * spento (come `llama-server` con `chat_template_kwargs.enable_thinking =
     * false`); un GGUF senza template riceve il prompt grezzo di prima.
     */
    @Test
    public void prob11IlPromptPassaDalTemplateColRagionamentoSpento() throws java.io.IOException {
        String reso = "<|im_start|>user\n" + TalosLlamaProbe.PROMPT
                + "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n";
        assertEquals(reso, TalosLlamaProbe.promptDellaProva(reso));
        assertEquals(TalosLlamaProbe.PROMPT, TalosLlamaProbe.promptDellaProva(""));
        assertEquals(TalosLlamaProbe.PROMPT, TalosLlamaProbe.promptDellaProva(null));

        String sorgente = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaPlugin.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(sorgente.contains("new String[] {TalosLlamaProbe.PROMPT}, null, false)"));
        assertFalse("nessuna corsa della prova col prompt grezzo",
                sorgente.contains("TalosLlamaProbe.PROMPT, TalosLlamaProbe.TOKENS"));
    }

    /**
     * PROB-12 — cambiato il metro, i verdetti NEGATIVI del metro vecchio non
     * contano come «gia' misurato»: senza, Qwen3.5 restava FAILED per sempre
     * anche dopo la cura. Le misure buone restano buone: i tempi non cambiano.
     */
    @Test
    public void prob12UnaBocciaturaDelMetroVecchioSiRimisura() {
        TalosLocalProfileIdentity id = new TalosLocalProfileIdentity("v0.7.0", "abc", 1_280_000_000L, 35, "fp");
        TalosLocalProfile bocciatoPrima = new TalosLocalProfile(id, "cpu", null,
                TalosBackendChoice.Outcome.FAILED, 1_200L, 1L, TalosLocalProfile.Level.Q1, 0, 52.0, 3_000L);
        TalosLocalProfile bocciatoOra = new TalosLocalProfile(id, "cpu", null,
                TalosBackendChoice.Outcome.FAILED, 1_200L, 1L, TalosLocalProfile.Level.Q1, 0, 52.0, 3_000L,
                TalosLlamaProbe.metroId());
        TalosLocalProfile buonoPrima = new TalosLocalProfile(id, "cpu", null,
                TalosBackendChoice.Outcome.CORRECT, 900L, 1L, TalosLocalProfile.Level.Q1, 9.0, 52.0, 3_000L);
        assertEquals("", bocciatoPrima.metro);
        assertTrue(TalosLlamaProbe.profileMissingFor(java.util.Collections.singletonList(bocciatoPrima), 1_280_000_000L));
        assertFalse(TalosLlamaProbe.profileMissingFor(java.util.Collections.singletonList(bocciatoOra), 1_280_000_000L));
        assertFalse(TalosLlamaProbe.profileMissingFor(java.util.Collections.singletonList(buonoPrima), 1_280_000_000L));
    }

    /**
     * PROB-13 — il caso del Pad, 22/10/2026 15:44-15:55: LFM2.5-2.6B Q4_K_M con
     * i profili del metro vecchio (giro 1, 12:13) cpu VALID, opencl e hexagon
     * WRONG_ANSWER. `qualifyBackend` rispondeva `already-proven`: il profilo
     * cpu valido bastava a dire «il modello ha un profilo», e le evidenze per
     * dispositivo avevano gia' GPU e NPU. Le due bocciature vecchie non si
     * rimisuravano mai e «Automatico» restava sulla CPU per sempre.
     *
     * ⇒ La domanda e' PER MOTORE: si rimisura solo quello la cui bocciatura,
     * per QUESTO file, viene da un altro metro; la CPU valida resta com'e'.
     */
    @Test
    public void prob13SiRimisuraSoloIlMotoreBocciatoDalMetroVecchio() throws java.io.IOException {
        long byteLfm = 1_620_000_000L;
        TalosLocalProfileIdentity id = new TalosLocalProfileIdentity("v0.7.0", "lfm", byteLfm, 35, "fp");
        TalosLocalProfile cpuValida = new TalosLocalProfile(id, "cpu", null,
                TalosBackendChoice.Outcome.CORRECT, 1_100L, 1L, TalosLocalProfile.Level.Q1, 11.0, 70.0, 2_000L);
        TalosLocalProfile gpuBocciata = new TalosLocalProfile(id, "opencl", "GPUOpenCL",
                TalosBackendChoice.Outcome.FAILED, 900L, 1L, TalosLocalProfile.Level.Q1, 0, 300.0, 20_000L);
        TalosLocalProfile npuBocciata = new TalosLocalProfile(id, "hexagon", "HTP0",
                TalosBackendChoice.Outcome.FAILED, 600L, 1L, TalosLocalProfile.Level.Q1, 0, 1_100.0, 3_000L);
        java.util.List<TalosLocalProfile> pad = java.util.Arrays.asList(cpuValida, gpuBocciata, npuBocciata);

        assertFalse("il modello ha un profilo: e' il ramo che diceva already-proven",
                TalosLlamaProbe.profileMissingFor(pad, byteLfm));
        assertFalse("la CPU valida non si rimisura",
                TalosLlamaProbe.bocciaturaDaRimisurare(pad, byteLfm, TalosBackendChoice.CPU));
        assertTrue(TalosLlamaProbe.bocciaturaDaRimisurare(pad, byteLfm, TalosBackendChoice.OPENCL));
        assertTrue(TalosLlamaProbe.bocciaturaDaRimisurare(pad, byteLfm, TalosBackendChoice.HEXAGON));
        assertFalse("un altro file non c'entra",
                TalosLlamaProbe.bocciaturaDaRimisurare(pad, 1L, TalosBackendChoice.HEXAGON));
        TalosLocalProfile senzaDimensione = new TalosLocalProfile(
                new TalosLocalProfileIdentity("v0.7.0", "lfm", 0L, 35, "fp"), "hexagon", "HTP0",
                TalosBackendChoice.Outcome.FAILED, 600L, 1L, TalosLocalProfile.Level.Q1, 0, 1_100.0, 3_000L);
        assertFalse("dimensione ignota: nel dubbio non si riparte",
                TalosLlamaProbe.bocciaturaDaRimisurare(
                        java.util.Collections.singletonList(senzaDimensione), 0L, TalosBackendChoice.HEXAGON));

        // Rimisurata col metro di oggi: una bocciatura onesta resta duratura, niente giri all'infinito.
        TalosLocalProfile npuBocciataOra = new TalosLocalProfile(id, "hexagon", "HTP0",
                TalosBackendChoice.Outcome.FAILED, 600L, 2L, TalosLocalProfile.Level.Q1, 0, 1_100.0, 3_000L,
                TalosLlamaProbe.metroId());
        assertFalse(TalosLlamaProbe.bocciaturaDaRimisurare(
                java.util.Arrays.asList(cpuValida, npuBocciataOra), byteLfm, TalosBackendChoice.HEXAGON));
        // E se la riga nuova ha un dispositivo diverso la vecchia resta accanto: conta la nuova.
        TalosLocalProfile gpuPromossaOra = new TalosLocalProfile(id, "opencl", "GPUOpenCL-2",
                TalosBackendChoice.Outcome.CORRECT, 700L, 2L, TalosLocalProfile.Level.Q1, 20.0, 300.0, 20_000L,
                TalosLlamaProbe.metroId());
        assertFalse(TalosLlamaProbe.bocciaturaDaRimisurare(
                java.util.Arrays.asList(gpuBocciata, gpuPromossaOra), byteLfm, TalosBackendChoice.OPENCL));

        String sorgente = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaPlugin.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(sorgente.contains("gpuWanted = gpuWanted || gpuDaRimisurare;"));
        assertTrue(sorgente.contains("npuWanted = npuWanted || npuDaRimisurare;"));
        assertTrue(sorgente.contains("cpuNeeded = cpuNeeded || cpuDaRimisurare;"));
        // Il cancello si decide DOPO la rimisura: altrimenti `already-proven` esce prima.
        assertTrue(sorgente.indexOf("npuWanted = npuWanted || npuDaRimisurare;")
                < sorgente.indexOf("return result.put(\"reason\", \"already-proven\");"));
        assertTrue("la CPU valida non rigira per rimisurare solo un acceleratore",
                sorgente.contains("attempt < MAX_PROBE_ATTEMPTS && cpuNeeded && !cpuRecorded"));
    }

    /**
     * PROB-14 — revisione avversaria del 22/10/2026, rilievo 10. La CPU girava
     * solo con {@code cpuNeeded}, che guarda le evidenze del DISPOSITIVO: un
     * modello con un profilo GPU o NPU ma senza il suo profilo CPU (la CPU era
     * uscita INCONCLUSIVE, calore o tempo, e non aveva scritto righe) restava
     * senza riferimento CPU per sempre, perche' le evidenze CPU di un ALTRO
     * modello bastavano a dire «gia' misurata». ⇒ La CPU gira se manca il
     * profilo CPU di QUESTO modello.
     */
    @Test
    public void prob14LaCpuGiraSeMancaIlProfiloCpuDiQuestoModello() throws java.io.IOException {
        long byteLfm = 1_620_000_000L;
        TalosLocalProfileIdentity id = new TalosLocalProfileIdentity("v0.7.0", "lfm", byteLfm, 35, "fp");
        TalosLocalProfile gpuValida = new TalosLocalProfile(id, "opencl", "GPUOpenCL",
                TalosBackendChoice.Outcome.CORRECT, 700L, 1L, TalosLocalProfile.Level.Q1, 20.0, 300.0, 20_000L,
                TalosLlamaProbe.metroId());
        TalosLocalProfile cpuValida = new TalosLocalProfile(id, "cpu", null,
                TalosBackendChoice.Outcome.CORRECT, 1_100L, 1L, TalosLocalProfile.Level.Q1, 11.0, 70.0, 2_000L,
                TalosLlamaProbe.metroId());

        assertFalse("il modello ha un profilo: il ramo `profiloMancante` non scatta",
                TalosLlamaProbe.profileMissingFor(java.util.Collections.singletonList(gpuValida), byteLfm));
        assertTrue("ma il suo profilo CPU manca",
                TalosLlamaProbe.profiloDelMotoreMancante(
                        java.util.Collections.singletonList(gpuValida), byteLfm, TalosBackendChoice.CPU));
        assertFalse("AL CONTRARIO — con la CPU di questo modello misurata non rigira",
                TalosLlamaProbe.profiloDelMotoreMancante(
                        java.util.Arrays.asList(gpuValida, cpuValida), byteLfm, TalosBackendChoice.CPU));
        assertFalse("dimensione ignota: nel dubbio non si riparte",
                TalosLlamaProbe.profiloDelMotoreMancante(java.util.Collections.emptyList(), 0L, TalosBackendChoice.CPU));

        String sorgente = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaPlugin.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(sorgente.contains("cpuNeeded = cpuNeeded || cpuSenzaProfilo;"));
        assertTrue("prima del cancello `already-proven`",
                sorgente.indexOf("cpuNeeded = cpuNeeded || cpuSenzaProfilo;")
                        < sorgente.indexOf("return result.put(\"reason\", \"already-proven\");"));
    }

    /**
     * PROB-15 — revisione avversaria del 22/10/2026, rilievo 11. Una rimisura
     * che esce INCONCLUSIVE (calore, tempo) o che non apre non scrive righe:
     * la bocciatura del metro vecchio restava, e la qualificazione la
     * rimisurava a OGNI giro — compilazione OpenCL compresa. ⇒ Un tentativo
     * per metro, per file, per motore: si segna quando la rimisura e' girata
     * davvero (non interrotta dalla persona), e il segno porta il metro dentro
     * la chiave, cosi' un metro nuovo riapre la domanda.
     */
    @Test
    public void prob15LaRimisuraSiTentaUnaVoltaPerMetro() throws java.io.IOException {
        long byteLfm = 1_620_000_000L;
        TalosLocalProfileIdentity id = new TalosLocalProfileIdentity("v0.7.0", "lfm", byteLfm, 35, "fp");
        TalosLocalProfile gpuBocciata = new TalosLocalProfile(id, "opencl", "GPUOpenCL",
                TalosBackendChoice.Outcome.FAILED, 900L, 1L, TalosLocalProfile.Level.Q1, 0, 300.0, 20_000L);
        java.util.List<TalosLocalProfile> pad = java.util.Collections.singletonList(gpuBocciata);
        java.util.Set<String> nessuna = java.util.Collections.emptySet();
        java.util.Set<String> giaTentata = java.util.Collections.singleton(
                TalosLlamaProbe.chiaveDellaRimisura(byteLfm, TalosBackendChoice.OPENCL));

        assertTrue(TalosLlamaProbe.bocciaturaDaRimisurare(pad, byteLfm, TalosBackendChoice.OPENCL, nessuna));
        assertFalse("gia' tentata con questo metro: non si rimisura a ogni qualificazione",
                TalosLlamaProbe.bocciaturaDaRimisurare(pad, byteLfm, TalosBackendChoice.OPENCL, giaTentata));
        assertTrue("il segno e' per motore: l'NPU dello stesso file ha il suo",
                TalosLlamaProbe.chiaveDellaRimisura(byteLfm, TalosBackendChoice.HEXAGON)
                        .equals(TalosLlamaProbe.chiaveDellaRimisura(byteLfm, TalosBackendChoice.HEXAGON))
                        && !giaTentata.contains(TalosLlamaProbe.chiaveDellaRimisura(byteLfm, TalosBackendChoice.HEXAGON)));
        assertTrue("il metro sta nella chiave: un metro nuovo riapre la domanda",
                TalosLlamaProbe.chiaveDellaRimisura(byteLfm, TalosBackendChoice.OPENCL).contains(TalosLlamaProbe.metroId()));

        String sorgente = new String(java.nio.file.Files.readAllBytes(
                new java.io.File("src/main/java/ai/talos/TalosLlamaPlugin.java").toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
        // Le tre domande leggono i tentativi gia' fatti...
        assertTrue(sorgente.contains("profiliSalvati, byteDelFile, TalosBackendChoice.CPU, rimisureTentate)"));
        assertTrue(sorgente.contains("profiliSalvati, byteDelFile, TalosBackendChoice.OPENCL, rimisureTentate)"));
        assertTrue(sorgente.contains("profiliSalvati, byteDelFile, TalosBackendChoice.HEXAGON, rimisureTentate)"));
        // ...e ogni rimisura girata davvero si segna, mai quella interrotta dalla persona.
        assertTrue(sorgente.contains("if (cpuDaRimisurare && !qualificationCancelled.get()) segnaRimisura(context, byteDelFile, TalosBackendChoice.CPU);"));
        assertTrue(sorgente.contains("if (gpuDaRimisurare && !qualificationCancelled.get()) segnaRimisura(context, byteDelFile, TalosBackendChoice.OPENCL);"));
        assertTrue(sorgente.contains("if (npuDaRimisurare && npuWanted && !qualificationCancelled.get()) segnaRimisura(context, byteDelFile, TalosBackendChoice.HEXAGON);"));
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
