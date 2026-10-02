package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * Punto 2 (01/10/2026): i programmi della GPU pronti prima del primo uso. Misurato sul Pad: 52 s alla prima
 * apertura GPU dopo ogni aggiornamento, 41 dei quali per compilare; 11 s a cache calda. La cache stava in
 * `code_cache`, che Android svuota a ogni aggiornamento. Ora sta in una cartella persistente, con un timbro che
 * dice «compilata per QUESTO llama.cpp e QUESTO sistema».
 */
public class TalosGpuPreparationTest {

    @Rule
    public TemporaryFolder cartelle = new TemporaryFolder();

    private static final String MOTORE = "b11312-0c1e57098";
    private static final String SISTEMA = "OnePlus/OPD2415/16:user/release-keys";

    /** GPU-01 — cartella nuova: da preparare. */
    @Test
    public void gpu01SenzaTimbroVaPreparata() throws Exception {
        File dir = cartelle.newFolder("cl");
        assertFalse(TalosGpuPreparation.isReady(dir, TalosGpuPreparation.stamp(MOTORE, SISTEMA)));
    }

    /** GPU-02 — timbro uguale: pronta, anche dopo un aggiornamento dell'app con lo stesso llama.cpp. */
    @Test
    public void gpu02TimbroUgualeEPronta() throws Exception {
        File dir = cartelle.newFolder("cl");
        String timbro = TalosGpuPreparation.stamp(MOTORE, SISTEMA);
        TalosGpuPreparation.markReady(dir, timbro);
        assertTrue(TalosGpuPreparation.isReady(dir, timbro));
    }

    /** GPU-03 — il sistema è cambiato (driver nuovo): i binari non valgono più, si ripreparano. */
    @Test
    public void gpu03SistemaDiversoVaRipreparata() throws Exception {
        File dir = cartelle.newFolder("cl");
        TalosGpuPreparation.markReady(dir, TalosGpuPreparation.stamp(MOTORE, SISTEMA));
        assertFalse(TalosGpuPreparation.isReady(dir, TalosGpuPreparation.stamp(MOTORE, SISTEMA + "-nuovo")));
    }

    /** GPU-04 — llama.cpp nuovo: i compilati del pin vecchio sono orfani e se ne vanno; quelli giusti restano. */
    @Test
    public void gpu04PinDiversoTogliIVecchi() throws Exception {
        File dir = cartelle.newFolder("cl");
        TalosGpuPreparation.markReady(dir, TalosGpuPreparation.stamp("b10000-vecchio", SISTEMA));
        Files.write(new File(dir, "aaaa.clbin").toPath(), new byte[] {1, 2, 3});
        TalosGpuPreparation.forgetOtherPins(dir, MOTORE);
        assertFalse(new File(dir, "aaaa.clbin").exists());
        assertFalse(TalosGpuPreparation.isReady(dir, TalosGpuPreparation.stamp(MOTORE, SISTEMA)));

        TalosGpuPreparation.markReady(dir, TalosGpuPreparation.stamp(MOTORE, SISTEMA));
        Files.write(new File(dir, "bbbb.clbin").toPath(), new byte[] {4});
        TalosGpuPreparation.forgetOtherPins(dir, MOTORE);
        assertTrue("stesso pin: niente si cancella", new File(dir, "bbbb.clbin").exists());
    }

    /** GPU-05 — il timbro dice chi l'ha scritto, in chiaro. */
    @Test
    public void gpu05IlTimbroEInChiaro() throws Exception {
        File dir = cartelle.newFolder("cl");
        String timbro = TalosGpuPreparation.stamp(MOTORE, SISTEMA);
        TalosGpuPreparation.markReady(dir, timbro);
        String scritto = new String(Files.readAllBytes(new File(dir, ".talos-pronta").toPath()),
                StandardCharsets.UTF_8);
        assertEquals(MOTORE + "\n" + SISTEMA, scritto);
    }

    /** GPU-11 — i modelli già riscaldati si ricordano; un modello cambiato (dimensione o data) va riscaldato di nuovo. */
    @Test
    public void gpu11IModelliRiscaldatiSiRicordano() throws Exception {
        File dir = cartelle.newFolder("cl");
        File modello = cartelle.newFile("qwen.gguf");
        Files.write(modello.toPath(), new byte[] {1, 2, 3});
        String chiave = TalosGpuPreparation.modelKey(modello);
        assertFalse(TalosGpuPreparation.warmedModels(dir).contains(chiave));
        TalosGpuPreparation.markModelsWarmed(dir, java.util.Collections.singletonList(chiave));
        assertTrue(TalosGpuPreparation.warmedModels(dir).contains(chiave));
        Files.write(modello.toPath(), new byte[] {1, 2, 3, 4});
        assertFalse("cambiato: va riscaldato", TalosGpuPreparation.warmedModels(dir)
                .contains(TalosGpuPreparation.modelKey(modello)));
        // un llama.cpp nuovo dimentica anche i modelli riscaldati
        TalosGpuPreparation.markReady(dir, TalosGpuPreparation.stamp("b10000-vecchio", SISTEMA));
        TalosGpuPreparation.forgetOtherPins(dir, MOTORE);
        assertTrue(TalosGpuPreparation.warmedModels(dir).isEmpty());
    }

    /**
     * GPU-13 — un riscaldamento che fa cadere l'app (driver) non si ripete al riavvio: il segno «in corso» resta
     * sul disco, e la volta dopo si preparano solo i programmi comuni. Niente ciclo di crash all'avvio.
     */
    @Test
    public void gpu13UnRiscaldamentoCadutoNonSiRipete() throws Exception {
        File dir = cartelle.newFolder("cl");
        assertTrue("prima volta: si riscalda", TalosGpuPreparation.beginWarming(dir));
        // ...l'app cade qui: endWarming non arriva
        assertFalse("dopo una caduta: niente riscaldamento", TalosGpuPreparation.beginWarming(dir));
        TalosGpuPreparation.endWarming(dir);
        assertTrue("finito bene: la volta dopo si riscalda", TalosGpuPreparation.beginWarming(dir));
        TalosGpuPreparation.endWarming(dir);
        // un llama.cpp nuovo riprova da capo
        TalosGpuPreparation.beginWarming(dir);
        TalosGpuPreparation.markReady(dir, TalosGpuPreparation.stamp("b10000-vecchio", SISTEMA));
        TalosGpuPreparation.forgetOtherPins(dir, MOTORE);
        assertTrue(TalosGpuPreparation.beginWarming(dir));
    }

    /** GPU-12 — il riscaldamento dal modello: prepareGpu passa i modelli al nativo, che ne legge i GGUF. */
    @Test
    public void gpu12RiscaldamentoDalModello() throws java.io.IOException {
        assertTrue(leggi("src/main/java/ai/talos/TalosLlamaNative.java")
                .contains("static native long nativePrepareOpenClPrograms(String[] modelPaths)"));
        String ponte = leggi("src/main/java/ai/talos/TalosLlamaPlugin.java");
        int inizio = ponte.indexOf("public void prepareGpu(PluginCall call)");
        String prepara = ponte.substring(inizio, ponte.indexOf("@PluginMethod", inizio + 10));
        assertTrue(prepara.contains("call.getArray(\"models\")"));
        assertTrue(prepara.contains("TalosGpuPreparation.warmedModels("));
        assertTrue("una caduta non si ripete", prepara.contains("TalosGpuPreparation.beginWarming("));
        String jni = leggi("src/main/cpp/talos_llama_jni.cpp");
        int nativo = jni.indexOf("Java_ai_talos_TalosLlamaNative_nativePrepareOpenClPrograms");
        String corpo = jni.substring(nativo, jni.indexOf("\n}", nativo));
        assertTrue(corpo.contains("jobjectArray"));
        assertTrue(jni.contains("gguf_init_from_file"));
        assertTrue(jni.contains("ggml_flash_attn_ext("));
        // la chat apre la cache KV in f16 se ci sta, altrimenti in q8_0: due famiglie di varianti FA
        assertTrue(jni.contains("for (ggml_type tipo_kv : { GGML_TYPE_F16, GGML_TYPE_Q8_0 })"));
    }

    /** GPU-06 — il cablaggio: cartella persistente, preparazione sulla coda dell'apertura, prova che aspetta. */
    @Test
    public void gpu06CablaggioDellaPreparazione() throws java.io.IOException {
        String nativo = leggi("src/main/java/ai/talos/TalosLlamaNative.java");
        assertFalse("code_cache si svuota a ogni aggiornamento", nativo.contains("getCodeCacheDir()"));
        assertTrue(nativo.contains("TalosGpuPreparation.cacheDir("));
        assertTrue(nativo.contains("static native long nativePrepareOpenClPrograms(String[] modelPaths)"));
        assertTrue(leggi("src/main/cpp/talos_llama_jni.cpp")
                .contains("Java_ai_talos_TalosLlamaNative_nativePrepareOpenClPrograms"));

        String ponte = leggi("src/main/java/ai/talos/TalosLlamaPlugin.java");
        int inizio = ponte.indexOf("public void prepareGpu(PluginCall call)");
        assertTrue("manca prepareGpu", inizio > 0);
        String prepara = ponte.substring(inizio, ponte.indexOf("@PluginMethod", inizio + 10));
        assertTrue("sulla coda dell'apertura", prepara.contains("worker.execute("));
        int progresso = ponte.indexOf("public void loadProgress(PluginCall call)");
        assertTrue(ponte.substring(progresso, ponte.indexOf("@PluginMethod", progresso + 10))
                .contains("gpuPreparing"));
        int qualifica = ponte.indexOf("private JSObject runQualification(");
        assertTrue(ponte.substring(qualifica, qualifica + 4000).contains("aspettaLaPreparazioneGpu()"));
    }

    private static String leggi(String percorso) throws java.io.IOException {
        return new String(Files.readAllBytes(new File(percorso).toPath()), StandardCharsets.UTF_8);
    }
}
