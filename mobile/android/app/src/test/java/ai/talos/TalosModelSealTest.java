package ai.talos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * Il sigillo del modello (01/10/2026): l'impronta di un GGUF si calcola UNA volta,
 * quando il file entra, e all'apertura si confrontano solo i dati di `stat` —
 * come fa git con l'indice (racy-git). Prima: 24-29 s di lettura a ogni apertura.
 */
public class TalosModelSealTest {

    private static final long MODIFICATO = 1_790_000_000_000L;

    private static TalosModelSeal.Stat stat(long bytes, long mtimeMs, long inode) {
        return new TalosModelSeal.Stat(bytes, mtimeMs, inode, 66L);
    }

    private static TalosModelSeal.Seal sigillo(TalosModelSeal.Stat stat, long sealedAtMs) {
        return new TalosModelSeal.Seal("a1b2c3", stat, "download", sealedAtMs);
    }

    /** SEAL-01 — lo stesso file, sigillato dopo l'ultima modifica: si usa l'impronta salvata. */
    @Test
    public void seal01IlFileIntattoUsaLImprontaSalvata() {
        TalosModelSeal.Stat s = stat(2_497_281_312L, MODIFICATO, 4242L);
        assertTrue(TalosModelSeal.stillValid(sigillo(s, MODIFICATO + 60_000L), s));
    }

    /** SEAL-02 — dimensione diversa: è un altro file. */
    @Test
    public void seal02DimensioneDiversaNonVale() {
        TalosModelSeal.Stat s = stat(2_497_281_312L, MODIFICATO, 4242L);
        assertFalse(TalosModelSeal.stillValid(sigillo(s, MODIFICATO + 60_000L), stat(2_497_281_313L, MODIFICATO, 4242L)));
    }

    /** SEAL-03 — data di modifica diversa: qualcuno l'ha toccato. */
    @Test
    public void seal03DataDiversaNonVale() {
        TalosModelSeal.Stat s = stat(2_497_281_312L, MODIFICATO, 4242L);
        assertFalse(TalosModelSeal.stillValid(sigillo(s, MODIFICATO + 60_000L), stat(2_497_281_312L, MODIFICATO + 1_000L, 4242L)));
    }

    /** SEAL-04 — inode diverso: il file è stato sostituito da un altro con lo stesso nome. */
    @Test
    public void seal04InodeDiversoNonVale() {
        TalosModelSeal.Stat s = stat(2_497_281_312L, MODIFICATO, 4242L);
        assertFalse(TalosModelSeal.stillValid(sigillo(s, MODIFICATO + 60_000L), stat(2_497_281_312L, MODIFICATO, 4243L)));
    }

    /**
     * SEAL-05 — la regola racy-git: un file modificato nello stesso secondo in cui
     * è stato sigillato potrebbe essere cambiato DOPO il calcolo senza che la data
     * lo dica. Non ci si fida: si ricalcola.
     */
    @Test
    public void seal05ModificatoNelloStessoSecondoNonCiSiFida() {
        TalosModelSeal.Stat s = stat(2_497_281_312L, MODIFICATO, 4242L);
        assertFalse(TalosModelSeal.stillValid(sigillo(s, MODIFICATO + 400L), s));
        assertFalse(TalosModelSeal.stillValid(null, s));
        assertFalse("sigillo senza impronta", TalosModelSeal.stillValid(
                new TalosModelSeal.Seal("", s, "download", MODIFICATO + 60_000L), s));
    }

    /** SEAL-06 — il cablaggio: niente lettura piena all'apertura; download e importazione sigillano. */
    @Test
    public void seal06AperturaSenzaLetturaPienaEdEntrataSigillata() throws java.io.IOException {
        String ponte = leggi("src/main/java/ai/talos/TalosLlamaPlugin.java");
        int inizio = ponte.indexOf("public void localPerformanceProfiles(PluginCall call)");
        int fine = ponte.indexOf("@PluginMethod", inizio + 10);
        String profili = ponte.substring(inizio, fine);
        assertFalse("i profili non devono rileggere tutto il file", profili.contains("sha256Del("));
        assertTrue(profili.contains("TalosModelSeal.sealedSha256("));
        assertTrue(leggi("src/main/java/ai/talos/TalosTransferSession.java").contains("TalosModelSeal.seal("));
        assertTrue(leggi("src/main/java/ai/talos/TalosModelImportPlugin.java").contains("TalosModelSeal.seal("));
    }

    private static String leggi(String percorso) throws java.io.IOException {
        return new String(java.nio.file.Files.readAllBytes(new java.io.File(percorso).toPath()),
                java.nio.charset.StandardCharsets.UTF_8);
    }
}
