package ai.talos;

import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * P0-3 — il cancello per CR-06 (piano sorgente, BLOCCANTE): "la distinzione
 * Q0/Q1/Q2 è mandatory... nessun 9-run/sustained sweep automatico al primo
 * 'ciao'".
 *
 * ⛔ Non un principio da ricordare a memoria: una riga che si rompe se
 * qualcuno alza {@link TalosLlamaPlugin#MAX_PROBE_ATTEMPTS} (Q1, dietro
 * consenso ma comunque il percorso più vicino a "il primo ciao") verso la
 * soglia da laboratorio — nove giri, lo stesso numero che
 * {@code TalosLocalBaselineDeviceTest} usa per Q2, che resta strutturalmente
 * irraggiungibile da un APK di produzione perché vive sotto
 * {@code androidTest}.
 *
 * Verificato PRIMA di scrivere questo test, sul codice reale: oggi
 * `MAX_PROBE_ATTEMPTS = 4`. Questo file non lo cambia — lo tiene onesto.
 */
public class TalosLlamaPluginQualificationBudgetTest {

    /**
     * ⛔⛔ Il numero esatto della violazione che CR-06 vieta: un giro Q1 non
     * deve MAI avvicinarsi ai nove tentativi che segnano Q2 — nemmeno nel
     * caso peggiore (ogni tentativo instabile, il ramo che consuma
     * davvero {@code MAX_PROBE_ATTEMPTS}).
     */
    private static final int Q2_DEEP_LAB_RUN_COUNT = 9;

    @Test
    public void unGiroQ1NonSiAvvicinaAlNumeroDiCorseDiQ2() {
        assertTrue(
                "MAX_PROBE_ATTEMPTS=" + TalosLlamaPlugin.MAX_PROBE_ATTEMPTS
                        + " si avvicina troppo alle " + Q2_DEEP_LAB_RUN_COUNT
                        + " corse di Q2 (deep lab, manuale) — CR-06 vieta esplicitamente"
                        + " che un sondaggio dietro consenso ordinario si comporti come"
                        + " un banco di laboratorio",
                TalosLlamaPlugin.MAX_PROBE_ATTEMPTS < Q2_DEEP_LAB_RUN_COUNT);
    }

    /**
     * AL CONTRARIO: il numero deve restare positivo e piccolo — zero
     * tentativi romperebbe la qualificazione allo stesso modo di nove,
     * lasciando Q1 senza nessuna possibilità di convergere su una CPU
     * fredda instabile (la ragione per cui questo numero è 4, non 1).
     */
    @Test
    public void unGiroQ1DeveAvereAlmenoUnTentativo() {
        assertTrue("zero tentativi non lascia a Q1 nessuna possibilità di convergere",
                TalosLlamaPlugin.MAX_PROBE_ATTEMPTS >= 1);
    }
}
