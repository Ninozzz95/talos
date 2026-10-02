package ai.talos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * ⛔ PKLA Qualcomm 2.1 b (owner, 01/10/2026): il software Qualcomm si distribuisce
 * dentro TALOS solo con un accordo vincolante per chi lo usa. ⇒ Senza le
 * condizioni accettate, l'NPU non si carica, non si prova e non si apre.
 */
public class TalosNpuTermsTest {

    private static TalosNpuTerms.Record accettate(String versione) {
        return new TalosNpuTerms.Record(versione, "abc123", "it", "0.1.39", 1_790_000_000_000L);
    }

    /** NPU-T-01 — nessuna accettazione registrata: l'NPU resta spenta. */
    @Test
    public void npuT01SenzaAccettazioneLaNpuResitaSpenta() {
        assertFalse(TalosNpuTerms.allowsNpu(null, TalosNpuTerms.VERSION));
    }

    /** NPU-T-02 — condizioni cambiate: serve una nuova accettazione. */
    @Test
    public void npuT02UnaVersioneVecchiaNonBasta() {
        assertFalse(TalosNpuTerms.allowsNpu(accettate("npu-qualcomm-v0"), TalosNpuTerms.VERSION));
    }

    /** NPU-T-03 — accettata la versione in vigore: l'NPU si può usare. */
    @Test
    public void npuT03LaVersioneInVigoreAccende() {
        assertTrue(TalosNpuTerms.allowsNpu(accettate(TalosNpuTerms.VERSION), TalosNpuTerms.VERSION));
    }

    /** NPU-T-04 — un record senza impronta del testo non è una prova: non vale. */
    @Test
    public void npuT04SenzaImprontaDelTestoNonVale() {
        TalosNpuTerms.Record monco = new TalosNpuTerms.Record(
                TalosNpuTerms.VERSION, "", "it", "0.1.39", 1_790_000_000_000L);
        assertFalse(TalosNpuTerms.allowsNpu(monco, TalosNpuTerms.VERSION));
    }

    /**
     * NPU-T-05 — i tre punti in cui il motore toccherebbe l'NPU consultano tutti
     * la regola. Letto dal sorgente, come PROB-05: il vincolo sta nel cablaggio.
     */
    @Test
    public void npuT05OgniStradaVersoLaNpuPassaDallaRegola() throws java.io.IOException {
        String nativo = leggi("src/main/java/ai/talos/TalosLlamaNative.java");
        String ponte = leggi("src/main/java/ai/talos/TalosLlamaPlugin.java");
        String build = leggi("build.gradle");
        assertTrue("caricamento del modulo", nativo.contains("TalosNpuTerms.allowsNpu("));
        assertTrue("il modulo ha un nome che il caricamento automatico ignora",
                nativo.contains("\"libtalos-npu-hexagon.so\""));
        assertTrue("prova dei motori", ponte.contains("npuWanted = npuWanted && npuConsentita"));
        assertTrue("apertura", ponte.contains("TALOS_NPU_TERMS_REQUIRED"));
        assertTrue("impacchettamento col nome nuovo", build.contains("libtalos-npu-hexagon.so"));
        assertTrue("niente strip dei file NPU (PKLA 3.9)", build.contains("keepDebugSymbols"));
    }

    private static String leggi(String percorso) throws java.io.IOException {
        return new String(java.nio.file.Files.readAllBytes(new java.io.File(percorso).toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
    }
}
