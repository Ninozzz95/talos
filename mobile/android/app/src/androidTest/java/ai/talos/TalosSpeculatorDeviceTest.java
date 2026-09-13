package ai.talos;

import static org.junit.Assert.assertFalse;
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
 * ⛔⛔ SOLO RICERCA — P2-1 blocco A. Prova che il lifecycle
 * dell'involucro RAII attorno a {@code common_speculative_*}
 * (`TalosSpeculator`, `talos_speculator.hpp`) è sicuro col motore REALE,
 * non un mock — costruzione e distruzione, mai ancora begin/process/
 * draft/accept (blocco B, CR-11).
 *
 * ⛔ {@link TalosLlamaNative#nativeConstructSpeculatorForResearch} è
 * l'UNICA porta: {@link TalosLlamaNative#nativeOpen}, il percorso di
 * produzione, non lo chiama mai. Zero effetto su una sessione aperta
 * normalmente da chi non chiama questa classe.
 */
@RunWith(AndroidJUnit4.class)
public class TalosSpeculatorDeviceTest {

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

    private static long apri(File model) {
        return TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), 4, 4096, 0, true, 4, 0,
                "f16", "none", "", "default");
    }

    private static void assertApertoOk(long handle) {
        assertTrue("apertura fallita: " + TalosLlamaNative.nativeLastOpenError(), handle != 0);
    }

    /** Il caso base: costruzione su una sessione vera, poi chiusura pulita. */
    @Test
    public void costruzioneEChiusura() {
        pronta();
        File model = modello();
        long handle = apri(model);
        assertApertoOk(handle);
        try {
            boolean pronto = TalosLlamaNative.nativeConstructSpeculatorForResearch(handle, 24, 64);
            assertTrue("speculatore ngram-mod non pronto", pronto);
        } finally {
            // La distruzione vera è qui dentro, via unique_ptr in `delete
            // session` — se il lifecycle avesse un difetto, l'app
            // morirebbe su questa riga, non su un'asserzione.
            TalosLlamaNative.nativeClose(handle);
        }
    }

    /**
     * ⛔⛔ La domanda che decide la forma del blocco B — quale famiglia di
     * rimozione sequenza espone il contesto di QUESTO modello (non
     * assunta uguale per Llama/Qwen/Gemma). `-e talosModelPath <path>`
     * sceglie il GGUF; lanciata a mano una volta per famiglia.
     */
    @Test
    public void capacitaSeqRm() {
        pronta();
        File model = modello();
        long handle = apri(model);
        assertApertoOk(handle);
        try {
            String capacita = TalosLlamaNative.nativeContextSeqRmCapabilityForResearch(handle);
            android.util.Log.i("TalosSpeculator", "seqRm(" + model.getName() + ") = " + capacita);
            assertTrue("risposta vuota o inattesa: " + capacita,
                    capacita.equals("no") || capacita.equals("part")
                            || capacita.equals("full") || capacita.equals("rs"));
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    /**
     * AL CONTRARIO: un handle inesistente non deve costruire niente, e
     * soprattutto non deve far cadere il processo — `as_session` torna
     * `nullptr` e la funzione nativa esce prima di toccare `unique_ptr`.
     */
    @Test
    public void handleInvalidoNonCostruisceENonCade() {
        pronta();
        boolean pronto = TalosLlamaNative.nativeConstructSpeculatorForResearch(0L, 24, 64);
        assertFalse("un handle 0 non doveva costruire niente", pronto);
    }

    /**
     * ⛔⛔⛔ P2-1 blocco B — la prova che conta di più. CR-11: con
     * campionamento deterministico (greedy), la speculazione deve produrre
     * un testo BYTE-IDENTICO al ramo ordinario — è solo un modo più veloce
     * di calcolare lo STESSO argmax, mai una risposta diversa. `apri()`
     * apre già `deterministic=true` (quinto argomento posizionale).
     * Confermato via ricerca web che è esattamente il criterio riconosciuto
     * fuori da questa sessione ("bit-exact greedy agreement", "confirmed by
     * hashing the generations") — non un'invenzione del banco di prova.
     *
     * Due sessioni separate sullo stesso modello, non una riaperta: la KV
     * di una generazione precedente non deve influenzare il confronto.
     */
    @Test
    public void generazioneSpeculativaEDeterministicaCoincidono() {
        pronta();
        File model = modello();
        final String prompt = "The capital of France is";
        final int maxTokens = 24;

        long handleOrdinario = apri(model);
        assertApertoOk(handleOrdinario);
        String testoOrdinario;
        try {
            testoOrdinario = TalosLlamaNative.nativeGenerate(
                    handleOrdinario, prompt, maxTokens, false, false);
        } finally {
            TalosLlamaNative.nativeClose(handleOrdinario);
        }
        assertTrue("generazione ordinaria fallita", testoOrdinario != null);

        long handleSpeculativo = apri(model);
        assertApertoOk(handleSpeculativo);
        String testoSpeculativo;
        try {
            assertTrue("speculatore non pronto",
                    TalosLlamaNative.nativeConstructSpeculatorForResearch(handleSpeculativo, 24, 64));
            testoSpeculativo = TalosLlamaNative.nativeGenerate(
                    handleSpeculativo, prompt, maxTokens, false, false);
        } finally {
            TalosLlamaNative.nativeClose(handleSpeculativo);
        }
        assertTrue("generazione speculativa fallita", testoSpeculativo != null);

        android.util.Log.i("TalosSpeculator", "ordinario  = " + testoOrdinario);
        android.util.Log.i("TalosSpeculator", "speculativo= " + testoSpeculativo);
        org.junit.Assert.assertEquals(
                "CR-11: deterministico deve essere byte-identico fra i due rami",
                testoOrdinario, testoSpeculativo);
    }

    /**
     * AL CONTRARIO: due costruzioni sulla STESSA sessione. La seconda
     * assegnazione a `session->speculator` distrugge la prima istanza
     * (unique_ptr::operator=) prima di costruire la nuova — esattamente
     * il caso che il piano P1-1 chiama CR-07 (rischio reale di
     * use-after-free) per il thread pool. Qui si prova che vale anche
     * per questo secondo meccanismo RAII, sul motore reale.
     */
    @Test
    public void doppiaCostruzioneSullaStessaSessioneNonCade() {
        pronta();
        File model = modello();
        long handle = apri(model);
        assertApertoOk(handle);
        try {
            assertTrue(TalosLlamaNative.nativeConstructSpeculatorForResearch(handle, 24, 64));
            assertTrue(TalosLlamaNative.nativeConstructSpeculatorForResearch(handle, 12, 32));
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }
}
