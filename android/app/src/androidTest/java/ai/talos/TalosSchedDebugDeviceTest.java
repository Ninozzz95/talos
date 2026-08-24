package ai.talos;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;

/**
 * ⛔⛔ SOLO RICERCA — P2-4, la sonda per CR-03 (piazzamento nodi per
 * backend). Non prova un'ottimizzazione: prova se
 * {@code GGML_SCHED_DEBUG=2} basta a rispondere "quali nodi finiscono
 * davvero su CPU e quali sul backend d'offload", senza instrumentation
 * nativa nuova — la domanda che decide lo sforzo reale di P2-4.
 *
 * ⛔ Nessuna asserzione sul CONTENUTO del log qui dentro: il segnale vero
 * si legge da logcat dopo la corsa (tag TalosLlama), la stessa disciplina
 * già in uso per il trace HIT/MISS/SAVE della cache OpenCL (P0-1). Questo
 * test garantisce solo che la sonda sia armata PRIMA dell'apertura (il
 * solo momento in cui {@code getenv("GGML_SCHED_DEBUG")} viene letto) e
 * che almeno un grafo di prefill e uno di decode vengano davvero
 * costruiti, sulla CPU per non introdurre l'OpenCL come variabile in più.
 */
@RunWith(AndroidJUnit4.class)
public class TalosSchedDebugDeviceTest {

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static void pronta() {
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        TalosLlamaNative.ensureReady(context());
    }

    private static void raccogli(File directory, List<File> into) {
        try (java.nio.file.DirectoryStream<java.nio.file.Path> stream =
                     Files.newDirectoryStream(directory.toPath())) {
            for (java.nio.file.Path entry : stream) {
                File file = entry.toFile();
                if (file.isDirectory()) raccogli(file, into);
                else if (file.getName().endsWith(".gguf")) into.add(file);
            }
        } catch (java.nio.file.NoSuchFileException assente) {
            // Vuoto è un esito, non un guasto.
        } catch (Exception ignorato) {
            // Stessa tolleranza di TalosLocalBaselineDeviceTest.fixture().
        }
    }

    private static File modello() {
        String indicato = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        File model;
        if (indicato != null && !indicato.isEmpty()) {
            model = new File(indicato);
        } else {
            File root = context().getExternalFilesDir(null);
            List<File> trovati = new ArrayList<>();
            if (root != null) raccogli(new File(root, "models"), trovati);
            model = trovati.isEmpty() ? null : trovati.get(0);
        }
        Assume.assumeTrue("nessun GGUF leggibile sotto files/models", model != null && model.isFile());
        return model;
    }

    /** CPU pura, come `apriCpu` di TalosLocalBaselineDeviceTest — stesso motivo: zero variabili in più. */
    private static long apriCpu(File model) {
        return TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), 4, 4096, 0, false, 4, 0,
                "f16", "none", "", "default");
    }

    /**
     * ⛔⛔ La domanda VERA di CR-03/P2-4: con l'offload PARZIALE, la sonda
     * distingue davvero i nodi rimasti su CPU da quelli passati
     * all'acceleratore, o dice sempre e solo "CPU" per qualche motivo che
     * la lettura del sorgente non avrebbe previsto? Solo un grafo misto
     * risponde — il test CPU-puro sopra non può, per costruzione.
     */
    private static long apriOpenClParziale(File model, int gpuLayers) {
        return TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), 4, 4096, gpuLayers, false, 4, 512,
                "f16", "OpenCL", "", "off");
    }

    /**
     * ⛔ Build debug normale: `GGML_OPENCL` è ON solo in RILASCIO o con
     * `-PtalosResearchBackend=opencl` esplicito (`app/build.gradle`, "il
     * debug resta come prima") — MISURATO qui il 24/8, non presunto: senza
     * quel flag il registro porta solo CPU (verificato via
     * `nativeBackendInventory()`, `backend registrati: 1`). Salta, non
     * fallisce: l'assenza di OpenCL su QUESTA build è la configurazione
     * attesa, non un guasto di questo test.
     */
    @Test
    public void assegnazioniPerNodoConOffloadParziale() {
        pronta();
        Assume.assumeTrue("OpenCL non registrato su questa build (serve -PtalosResearchBackend=opencl "
                        + "o una build di rilascio): " + TalosLlamaNative.nativeBackends(),
                TalosLlamaNative.nativeBackends().contains("OpenCL"));
        TalosLlamaNative.nativeSetSchedDebugForResearch(2);
        File model = modello();
        long handle = apriOpenClParziale(model, 14);
        assertTrue("apertura fallita: " + TalosLlamaNative.nativeLastOpenError(), handle != 0);
        try {
            android.util.Log.i("TalosSchedDebug", "P2-4: offload parziale, inizio generazione");
            String testo = TalosLlamaNative.nativeGenerate(
                    handle, "The capital of France is", 8, false, false);
            android.util.Log.i("TalosSchedDebug", "P2-4: generazione conclusa: " + testo);
            assertNotNull("generazione fallita", testo);
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    /**
     * Un giro di prefill (il prompt) e un giro di decode (i token generati)
     * sono due grafi DIVERSI — la sonda deve mostrarli entrambi, non solo
     * il primo.
     */
    @Test
    public void assegnazioniPerNodoSuPrefillEDecode() {
        pronta();
        TalosLlamaNative.nativeSetSchedDebugForResearch(2);
        File model = modello();
        long handle = apriCpu(model);
        assertTrue("apertura fallita: " + TalosLlamaNative.nativeLastOpenError(), handle != 0);
        try {
            android.util.Log.i("TalosSchedDebug", "P2-4: inizio generazione con GGML_SCHED_DEBUG=2 armato");
            String testo = TalosLlamaNative.nativeGenerate(
                    handle, "The capital of France is", 8, false, false);
            android.util.Log.i("TalosSchedDebug", "P2-4: generazione conclusa: " + testo);
            assertNotNull("generazione fallita", testo);
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }
}
