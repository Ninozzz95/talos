package ai.talos;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;

/**
 * ⛔ SOLO RICERCA — prepara la cartella dei modelli, e la prepara <b>l'app</b>.
 *
 * ⛔⛔ IL DIFETTO CHE CHIUDE, misurato il 2026-08-20 sul Pad.
 *
 * Un GGUF da 1,9 GB spinto con `adb push` era su disco, con l'impronta giusta,
 * e <b>invisibile all'app</b>. Non un permesso mancante dell'app sui propri
 * dati: le cartelle. Su questo Android
 *
 * <pre>
 *   adb shell mkdir -p .../files/models/x   → drwxrws--- shell ext_data_rw
 *   adb push file .../files/models/x/f      → idem, le crea comunque `shell`
 * </pre>
 *
 * mentre l'app è un altro UID (`u0_a436`). Il file esce `-rw-rw-rw-` e sarebbe
 * leggibile — ma per arrivarci bisogna ATTRAVERSARE cartelle 0770 che
 * appartengono a `shell`, e l'app non può. Misurato dall'interno del processo
 * dell'app: `File.isFile()` risponde falso su un percorso assoluto esatto.
 *
 * ⇒ La cartella la crea chi la deve leggere. `files/` appartiene già all'app, e
 * `shell` ci scrive dentro perché il gruppo `ext_data_rw` glielo permette:
 * quindi una cartella creata QUI resta dell'app e `adb push` ci può comunque
 * depositare i file. È l'unico ordine dei fattori che funziona.
 *
 * ⛔ Non è un test: è provvista. Sta fra i test perché è l'unico modo di
 * eseguire codice con l'UID dell'app senza aggiungere alla produzione una
 * funzione che serve solo a noi.
 */
@RunWith(AndroidJUnit4.class)
public class TalosResearchFixtureDeviceTest {

    private static final String TAG = "TalosResearchFixture";

    /**
     * Crea `files/models` e, se l'argomento c'è, il ramo indicato sotto di essa.
     *
     * @implNote l'argomento {@code talosFixtureDir} è un percorso RELATIVO a
     *     `files/models` — per esempio {@code local/Llama-3.2-3B-Instruct-GGUF}.
     */
    @Test
    public void preparaLaCartellaDeiModelli() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File root = context.getExternalFilesDir(null);
        assertNotNull("external files dir assente", root);

        File models = new File(root, "models");
        String ramo = InstrumentationRegistry.getArguments().getString("talosFixtureDir", "");
        File target = ramo == null || ramo.isEmpty() ? models : new File(models, ramo);

        if (!target.exists() && !target.mkdirs()) {
            throw new IllegalStateException("cartella non creata: " + target.getAbsolutePath());
        }

        // ⛔ Esistere non è essere scrivibile, e non è essere leggibile. Le tre
        // domande si fanno separate, perché è esattamente la differenza fra
        // loro che ha nascosto il difetto per un giro intero.
        assertTrue("non è una cartella: " + target, target.isDirectory());
        assertTrue("l'app non può leggerla: " + target, target.canRead());
        assertTrue("l'app non può scriverci: " + target, target.canWrite());

        Log.i(TAG, "pronta: " + target.getAbsolutePath());
    }

    /**
     * Dice cosa l'app VEDE davvero sotto `files/models`, con i byte.
     *
     * Serve dopo una spinta: `adb shell ls` risponde a una domanda diversa —
     * quella di `shell` — e le due risposte sono già state diverse una volta.
     * Vedi [[due-domande-diverse-allo-stesso-telefono]].
     */
    @Test
    public void elencaCioCheLAppVede() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File root = context.getExternalFilesDir(null);
        assertNotNull("external files dir assente", root);

        File models = new File(root, "models");
        if (!models.isDirectory()) {
            Log.i(TAG, "files/models non esiste ancora");
            return;
        }
        descrivi(models, 0);
    }

    private static void descrivi(File directory, int livello) {
        try (java.nio.file.DirectoryStream<java.nio.file.Path> stream =
                     java.nio.file.Files.newDirectoryStream(directory.toPath())) {
            for (java.nio.file.Path entry : stream) {
                File file = entry.toFile();
                StringBuilder rientro = new StringBuilder();
                for (int i = 0; i < livello; i += 1) rientro.append("  ");
                if (file.isDirectory()) {
                    Log.i(TAG, rientro + file.getName() + "/");
                    descrivi(file, livello + 1);
                } else {
                    Log.i(TAG, rientro + file.getName() + "  " + file.length() + " byte"
                            + (file.canRead() ? "" : "  ⛔ NON LEGGIBILE"));
                }
            }
        } catch (Exception impedito) {
            Log.w(TAG, "non leggibile: " + directory + " → " + impedito);
        }
    }
}
