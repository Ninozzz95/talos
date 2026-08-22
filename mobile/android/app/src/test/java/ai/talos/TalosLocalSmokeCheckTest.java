package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * P0-3 — Q0 è "il modello funziona affatto", provato senza un telefono:
 * stesso principio di {@link TalosBackendChoiceTest} e
 * {@link TalosLlamaProbeTest} — il verdetto si dimostra sulla JVM prima di
 * chiedere a un device di applicarlo.
 */
public class TalosLocalSmokeCheckTest {

    @Test
    public void unTestoVuotoNonPassaMaiIndipendentementeDalloStop() {
        assertEquals(TalosLocalSmokeCheck.Verdict.EMPTY_OUTPUT,
                TalosLocalSmokeCheck.judge("", 10));
        assertEquals(TalosLocalSmokeCheck.Verdict.EMPTY_OUTPUT,
                TalosLocalSmokeCheck.judge("   ", 10));
        assertEquals(TalosLocalSmokeCheck.Verdict.EMPTY_OUTPUT,
                TalosLocalSmokeCheck.judge(null, 10));
    }

    @Test
    public void unCompletamentoCorrettoConStopVeloceEPassato() {
        assertEquals(TalosLocalSmokeCheck.Verdict.PASSED,
                TalosLocalSmokeCheck.judge("Paris.", 50));
    }

    /** AL CONTRARIO: la stessa lunghezza di risposta, ma senza il fatto atteso, non passa. */
    @Test
    public void laStessaLunghezzaSenzaIlFattoAttesoNonPassa() {
        assertEquals(TalosLocalSmokeCheck.Verdict.GOLDEN_MISMATCH,
                TalosLocalSmokeCheck.judge("a lovely city.", 50));
    }

    @Test
    public void laToleranzaDiFormatoAccettaMaiuscoleEContinuazioni() {
        assertTrue(TalosLocalSmokeCheck.goldenMatches("Paris."));
        assertTrue(TalosLocalSmokeCheck.goldenMatches("paris"));
        assertTrue(TalosLocalSmokeCheck.goldenMatches("Paris, the city of lights."));
        assertTrue(TalosLocalSmokeCheck.goldenMatches("PARIS!"));
    }

    /**
     * MISURATO sul Pad: il primo golden ("Reply with exactly one word: OK.")
     * chiedeva instruction-following a un motore che genera in modalità
     * completamento grezzo — il modello lo ha CONTINUATO come narrativa
     * invece di obbedirgli, un mismatch che non diceva niente sulla salute
     * del backend. Questo test fissa il caso REALE osservato, non uno
     * inventato: senza un chat template, un fatto elementare resta l'unico
     * golden onesto.
     */
    @Test
    public void unaContinuazioneNarrativaNonCorrelataEUnVeroMismatch() {
        assertFalse(TalosLocalSmokeCheck.goldenMatches(
                " \n\nIf the user says \"I need to find a way to improve my English"));
    }

    @Test
    public void nessunaCoincidenzaAccidentaleSuCittaSimili() {
        // "Lyon" o "Rome" non contengono "paris" — un vero mismatch, non un
        // falso negativo da correggere.
        assertFalse(TalosLocalSmokeCheck.goldenMatches("Lyon, a city in France."));
        assertFalse(TalosLocalSmokeCheck.goldenMatches("Rome, the capital of Italy."));
    }

    /** AL CONTRARIO: un fatto giusto ma uno Stop troppo lento non passa comunque. */
    @Test
    public void unGoldenGiustoConStopTroppoLentoNonPassa() {
        assertEquals(TalosLocalSmokeCheck.Verdict.STOP_TOO_SLOW,
                TalosLocalSmokeCheck.judge("Paris.", TalosLocalSmokeCheck.STOP_BUDGET_MS + 1));
    }

    /** Il confine esatto: al budget, non oltre, ancora PASSED. */
    @Test
    public void alBordoDelBudgetDiStopVaBene() {
        assertEquals(TalosLocalSmokeCheck.Verdict.PASSED,
                TalosLocalSmokeCheck.judge("Paris.", TalosLocalSmokeCheck.STOP_BUDGET_MS));
    }

    /**
     * L'ordine dei due controlli quando ENTRAMBI fallirebbero — MISURATO sul
     * Pad il motivo per cui `text` e `stopLatencyMs` vengono oggi da due giri
     * separati (vedi il commento su {@link TalosLocalSmokeCheck#STOP_DELAY_MS}):
     * confondere i due controlli in un solo tentativo troncato dal cancel
     * produceva un GOLDEN_MISMATCH che in realtà era colpa dello Stop, non
     * del modello. Con i giri separati la domanda "quale vince" ha ancora
     * una risposta: la correttezza della risposta viene prima della velocità
     * dello Stop, coerente con l'ordine correctness > cancelability del
     * piano sorgente (design.md §25.3).
     */
    @Test
    public void goldenSbagliatoVinceSuStopLento() {
        assertEquals(TalosLocalSmokeCheck.Verdict.GOLDEN_MISMATCH,
                TalosLocalSmokeCheck.judge("a lovely city.", TalosLocalSmokeCheck.STOP_BUDGET_MS + 1));
    }

    /**
     * Ordine dei controlli, non solo il risultato finale: un testo vuoto
     * vince su tutto — un motore che non produce niente non ha "seguito lo
     * Stop bene" solo perché è tornato in fretta.
     */
    @Test
    public void testoVuotoVinceAncheConUnoStopVeloce() {
        assertEquals(TalosLocalSmokeCheck.Verdict.EMPTY_OUTPUT,
                TalosLocalSmokeCheck.judge("", 1));
    }
}
