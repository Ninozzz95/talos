package ai.talos;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * ⛔⛔ SOLO RICERCA — P3-3, l'esperimento che il documento chiama "candidato,
 * non vittoria presunta" (design.md §33).
 *
 * ## La domanda, e perché non si può rispondere a occhio
 *
 * P3-1 ha già misurato che l'apertura costa 2,9-3,6 secondi (campagna C0,
 * Llama-3.2-3B su CPU) — un bottleneck reale. La domanda che RESTA è se
 * spostare il file in storage interno (`noBackupFilesDir`) lo riduce, o se
 * — come il documento avverte esplicitamente — l'external storage
 * app-specific su Android è spesso emulato sullo stesso partition fisico
 * dell'internal, nel qual caso la copia non cambierebbe nulla e
 * costerebbe solo un doppione da un gigabyte in più.
 *
 * ⛔⛔⛔ Il falsificatore è scritto PRIMA di misurare, non dopo: se un A/B
 * ripetuto a processo freddo non mostra un guadagno significativo, il
 * progetto si cancella — non si costruisce comunque "perché sembra ovvio".
 *
 * ## Perché "a processo freddo" significa DUE test, non uno
 *
 * Un solo metodo che apre prima dall'esterno poi dall'interno misurerebbe
 * l'effetto della cache pagina del sistema operativo (scaldata dalla prima
 * lettura), non la differenza fra i due storage. Ogni misura qui è UN
 * giro, UN processo — orchestrato dall'esterno con `am instrument` diretto
 * per fase, esattamente come l'esperimento A/B/C di P0-1
 * (`verify-opencl-kernel-cache.mjs`). ⛔⛔ MAI con
 * `./gradlew connectedDebugAndroidTest`: disinstalla l'app e si porta via
 * i modelli, la stessa lezione già scritta in
 * {@link TalosLocalBaselineDeviceTest}.
 */
@RunWith(AndroidJUnit4.class)
public class TalosLocalHotStagingDeviceTest {

    private static final String TAG = "TalosHotStaging";
    private static final String ARTIFACT_DIR = "research/local-hot-staging";
    private static final String STAGING_SUBDIR = "local-model-hot";

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    /**
     * ⛔ Dimenticata al primo giro, e l'apertura falliva con handle 0 senza
     * dire perché: senza questa chiamata `TalosLlamaNative` non è pronta,
     * esattamente come `TalosLocalBaselineDeviceTest.pronta()` — stesso
     * nome, stessa ragione, copiato dopo aver letto l'errore reale sul
     * device, non prima.
     */
    private static void pronta() {
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        TalosLlamaNative.ensureReady(context());
    }

    // ————————————————— la fixture, stesso criterio di TalosLocalBaselineDeviceTest —————————————————

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
            // La stessa tolleranza di TalosLocalBaselineDeviceTest.fixture(): un
            // ostacolo di lettura qui fa fallire l'assunzione sotto, non il test.
        }
    }

    private static File esterna() {
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

    /**
     * La destinazione dell'esperimento — `noBackupFilesDir`, come da
     * design.md §33.1: "internal storage is the appropriate dependency
     * when availability must be guaranteed". Ripiega su `getFilesDir()`
     * solo se `noBackupFilesDir` non è disponibile (caso limite mai
     * osservato su Android moderno, ma onesto dichiararlo).
     */
    private static File cartellaStaging() {
        File base = context().getNoBackupFilesDir();
        if (base == null) base = context().getFilesDir();
        return new File(base, STAGING_SUBDIR);
    }

    // ————————————————— gli artifact —————————————————

    private static File artifact(String name) throws Exception {
        File root = context().getExternalFilesDir(null);
        assertNotNull("external files dir assente", root);
        File directory = new File(root, ARTIFACT_DIR);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("cartella artifact non creata: " + directory);
        }
        return new File(directory, name);
    }

    private static void registra(JSONObject riga) throws Exception {
        File file = artifact("runs.jsonl");
        try (FileOutputStream out = new FileOutputStream(file, true)) {
            out.write((riga.toString() + "\n").getBytes(StandardCharsets.UTF_8));
        }
        android.util.Log.i(TAG, riga.toString());
    }

    // ————————————————— la copia, atomica anche per un esperimento —————————————————

    /**
     * Copia il GGUF esterno in staging interno — SOLO se non c'è già una
     * copia della stessa dimensione. Chiamata una volta sola, prima dei
     * giri "interna": il suo tempo non deve mai finire dentro una misura
     * di apertura.
     *
     * ⛔ Atomica anche qui, non solo nella eventuale produzione futura
     * (design.md §33.2): un file da gigabyte copiato a metà e poi aperto
     * per errore produrrebbe un confronto silenziosamente falso, la stessa
     * classe di guasto che questo intero programma esiste per evitare.
     */
    @Test
    public void preparaStaging() throws Exception {
        pronta();
        File sorgente = esterna();
        File destinazione = new File(cartellaStaging(), sorgente.getName());
        if (destinazione.isFile() && destinazione.length() == sorgente.length()) {
            android.util.Log.i(TAG, "staging già presente e della dimensione attesa: " + destinazione);
            return;
        }
        File cartella = cartellaStaging();
        assertTrue("cartella di staging non creata: " + cartella, cartella.isDirectory() || cartella.mkdirs());
        File tmp = new File(cartella, sorgente.getName() + ".tmp");
        Files.copy(sorgente.toPath(), tmp.toPath(), StandardCopyOption.REPLACE_EXISTING);
        assertTrue(
                "copia incompleta: " + tmp.length() + " contro " + sorgente.length(),
                tmp.length() == sorgente.length());
        assertTrue("rename atomico fallito", tmp.renameTo(destinazione));
        android.util.Log.i(TAG, "staging preparato: " + destinazione + " (" + destinazione.length() + " byte)");
    }

    // ————————————————— le due misure, un processo ciascuna —————————————————

    private static long apri(File model, int contesto, int thread) {
        long handle = TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), thread, contesto, 0, true, thread, 0,
                "f16", "none", "", "default");
        return handle;
    }

    @Test
    public void misuraEsterna() throws Exception {
        pronta();
        File model = esterna();
        int thread = 4;
        long inizio = System.nanoTime();
        long handle = apri(model, 4096, thread);
        long apertoMs = (System.nanoTime() - inizio) / 1_000_000L;
        assertApertoOk(handle);

        JSONObject riga = new JSONObject();
        riga.put("storage", "external");
        riga.put("path", model.getAbsolutePath());
        riga.put("openMs", apertoMs);
        riga.put("modelBytes", model.length());
        riga.put("opensSinceStart", TalosLlamaNative.nativeOpensSinceStart());
        riga.put("atMs", System.currentTimeMillis());
        registra(riga);

        TalosLlamaNative.nativeClose(handle);
    }

    @Test
    public void misuraInterna() throws Exception {
        pronta();
        File esterna = esterna();
        File model = new File(cartellaStaging(), esterna.getName());
        Assume.assumeTrue(
                "staging non preparato — lanciare prima preparaStaging",
                model.isFile() && model.length() == esterna.length());
        int thread = 4;
        long inizio = System.nanoTime();
        long handle = apri(model, 4096, thread);
        long apertoMs = (System.nanoTime() - inizio) / 1_000_000L;
        assertApertoOk(handle);

        JSONObject riga = new JSONObject();
        riga.put("storage", "internal");
        riga.put("path", model.getAbsolutePath());
        riga.put("openMs", apertoMs);
        riga.put("modelBytes", model.length());
        riga.put("opensSinceStart", TalosLlamaNative.nativeOpensSinceStart());
        riga.put("atMs", System.currentTimeMillis());
        registra(riga);

        TalosLlamaNative.nativeClose(handle);
    }

    private static void assertApertoOk(long handle) {
        assertTrue("apertura fallita: " + TalosLlamaNative.nativeLastOpenError(), handle != 0);
    }
}
