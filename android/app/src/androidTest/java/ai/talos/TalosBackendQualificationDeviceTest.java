package ai.talos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.os.Build;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.List;

import ai.talos.research.TalosBackendInventory;

/**
 * ⛔ SOLO RICERCA — la qualificazione dei backend, sul telefono vero.
 *
 * Risponde alla prima domanda del programma sul motore su GPU, e non è una
 * domanda di prestazioni: <b>quali dispositivi esistono davvero su questo
 * telefono, come si chiamano, e quali di loro llama.cpp accetterebbe come
 * bersaglio di offload.</b> Finché quella risposta non è scritta e ripetibile,
 * ogni numero di velocità misura un backend che nessuno ha scelto.
 *
 * ⛔ Non apre modelli e non misura tempi. È il PAVIMENTO: l'inventario di
 * partenza (C0) contro cui si confronta ogni build con un acceleratore acceso.
 * Un backend che compare qui domani e non c'era oggi è una differenza che si
 * vede, invece di essere una sorpresa dentro un benchmark.
 *
 * ⛔ Il file che lascia è la PROVA. Un test che passa e non lascia niente
 * costringe chi rilegge a fidarsi di un riassunto; qui l'inventario grezzo
 * finisce su disco, e l'host se lo porta via con `adb pull`.
 *
 * ⛔⛔⛔ NON LANCIARLO CON {@code ./gradlew connectedDebugAndroidTest}.
 *
 * MISURATO il 2026-08-20, e costato l'app di produzione del Pad: quel task
 * installa app e test, esegue, e alla fine <b>disinstalla entrambi</b>. Con
 * l'app se ne va la sua cartella privata — dati, chiavi e i GGUF che ci stanno
 * dentro — e se ne va anche l'artifact che questo test ha appena scritto. Il
 * task resta VERDE: «Finished 2 tests», e sul telefono non c'è più niente.
 *
 * ⇒ Si lancia con lo script che installa e non disinstalla mai, e che porta via
 * gli artifact prima di finire:
 *
 * <pre>
 *   ./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
 *   node scripts/research/run-device-tests.mjs ai.talos.TalosBackendQualificationDeviceTest
 * </pre>
 *
 * ⛔ Sta nel package {@code ai.talos} e non in {@code ai.talos.research} come
 * proponeva il brief: {@code TalosLlamaNative} tiene i suoi metodi nativi
 * riservati al package, e allargarne la visibilità per comodità di un test di
 * ricerca vorrebbe dire pagare in superficie di produzione una cosa che serve
 * a noi. La classe che LEGGE l'inventario sta in {@code ai.talos.research}, ed
 * è pubblica perché la usa anche l'host.
 */
@RunWith(AndroidJUnit4.class)
public class TalosBackendQualificationDeviceTest {

    private static final String TAG = "TalosBackendQual";

    /** Dove l'host va a prendere gli artifact con `adb pull`. */
    private static final String ARTIFACT_DIR = "research/local-backend";

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static File artifact(String name) throws Exception {
        File root = context().getExternalFilesDir(null);
        assertNotNull("external files dir assente", root);
        File directory = new File(root, ARTIFACT_DIR);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("cartella artifact non creata: " + directory);
        }
        return new File(directory, name);
    }

    private static void write(File file, String content) throws Exception {
        Files.write(file.toPath(), content.getBytes(StandardCharsets.UTF_8));
        Log.i(TAG, "artifact scritto: " + file.getAbsolutePath() + " (" + file.length() + " byte)");
    }

    /**
     * L'inventario strutturato, letto dal motore e lasciato su disco.
     *
     * ⛔ Cosa NON asserisce: che ci sia una GPU. Su una build CPU non c'è, ed è
     * l'esito giusto — asserirla renderebbe rosso il pavimento contro cui si
     * misura tutto il resto. Asserisce che la domanda abbia avuto una risposta
     * LEGGIBILE, e che dentro ci sia almeno il backend CPU: quello c'è sempre,
     * e se manca non è un telefono senza acceleratori — è il nativo che non ha
     * parlato.
     */
    @Test
    public void inventarioDeiBackend() throws Exception {
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        TalosLlamaNative.ensureReady(context());

        String raw = TalosLlamaNative.nativeBackendInventory();
        assertNotNull("il nativo non ha restituito un inventario", raw);
        Log.i(TAG, "inventario grezzo: " + raw);

        TalosBackendInventory inventory = TalosBackendInventory.parse(raw);

        // Il CPU c'è sempre. La sua assenza non è «nessun acceleratore»: è il
        // registro dei backend rimasto vuoto, cioè `nativeInit` che non ha
        // trovato la cartella delle librerie native.
        assertTrue("nessun registry CPU: il registro dei backend è vuoto",
                inventory.hasRegistry("CPU"));
        assertFalse("nessun dispositivo in nessun registry", inventory.devices().isEmpty());

        // Il confronto con l'elenco piatto di prima: due domande diverse allo
        // stesso motore devono raccontare lo stesso telefono.
        String flat = TalosLlamaNative.nativeBackends();
        assertNotNull(flat);
        for (String name : inventory.registryNames()) {
            assertTrue("registry `" + name + "` assente dall'elenco piatto `" + flat + "`",
                    flat.contains(name));
        }

        Log.i(TAG, "dispositivi:\n" + inventory.describe());
        for (TalosBackendInventory.Device device : inventory.offloadDevices()) {
            Log.i(TAG, "bersaglio di offload disponibile: " + device.registry + "/" + device.name);
        }

        /*
         * ⛔⛔ E SE MANCA QUALCUNO, PERCHÉ.
         *
         * MISURATO il 2026-08-20: con `libggml-opencl.so` da 3.198.104 byte
         * nella cartella nativa, il registro ne conteneva **uno solo** e
         * nessuna riga diceva il motivo. `ggml_backend_load_all_from_path`
         * tace per costruzione nelle build Release (`silent = true` sotto
         * NDEBUG). ⇒ L'inventario da solo direbbe «non c'è», che è la frase
         * sbagliata: c'era, e non si apriva.
         */
        String sonda = TalosLlamaNative.nativeProbeBackendLoad(
                context().getApplicationInfo().nativeLibraryDir);
        Log.i(TAG, "sonda di caricamento: " + sonda);

        write(artifact("backend-inventory.json"), raw);
        write(artifact("backend-load-probe.json"), sonda == null ? "{}" : sonda);
        write(artifact("manifest.json"), manifest(inventory).toString(2));
    }

    /**
     * Il manifest della corsa: l'identità di chi ha misurato.
     *
     * ⛔ Senza questo, un JSONL di misure è un file di numeri senza titolare.
     * Il brief lo chiede per una ragione precisa: fra sei mesi «la GPU era più
     * lenta» non vuol dire niente se non si sa su quale driver, con quale
     * motore e su quale build di Android.
     */
    private static JSONObject manifest(TalosBackendInventory inventory) throws Exception {
        JSONObject device = new JSONObject();
        device.put("manufacturer", Build.MANUFACTURER);
        device.put("model", Build.MODEL);
        device.put("android", Build.VERSION.RELEASE);
        device.put("sdk", Build.VERSION.SDK_INT);
        device.put("buildFingerprint", Build.FINGERPRINT);
        device.put("soc", Build.SOC_MODEL);
        device.put("socManufacturer", Build.SOC_MANUFACTURER);

        JSONArray registries = new JSONArray();
        for (String name : inventory.registryNames()) registries.put(name);

        JSONObject manifest = new JSONObject();
        manifest.put("engineBuild", TalosLlamaNative.nativeEngineBuild());
        manifest.put("backendsFlat", TalosLlamaNative.nativeBackends());
        manifest.put("registries", registries);
        manifest.put("offloadDeviceCount", inventory.offloadDevices().size());
        manifest.put("device", device);
        manifest.put("applicationId", context().getPackageName());
        return manifest;
    }

    /**
     * ⛔ IL VERSO CONTRARIO: nessun dispositivo di tipo CPU può finire in una
     * lista di offload.
     *
     * Non è una regola nostra. {@code common/arg.cpp} della sorgente che
     * spediamo rifiuta con «invalid device» qualunque nome che risolva a un
     * dispositivo CPU. Provarlo qui, sull'inventario VERO di questo telefono e
     * non su un JSON scritto a mano, è ciò che impedisce a una futura build di
     * offrirci un bersaglio che il motore poi rifiuta all'apertura — dove il
     * guasto si presenterebbe come «il modello non si apre».
     */
    @Test
    public void nessunBersaglioDiOffloadEUnaCpu() throws Exception {
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        TalosLlamaNative.ensureReady(context());

        TalosBackendInventory inventory =
                TalosBackendInventory.parse(TalosLlamaNative.nativeBackendInventory());

        List<TalosBackendInventory.Device> targets = inventory.offloadDevices();
        for (TalosBackendInventory.Device target : targets) {
            assertFalse("il dispositivo `" + target.name + "` è una CPU offerta come bersaglio",
                    TalosBackendInventory.TYPE_CPU.equals(target.type));
        }
        Log.i(TAG, "bersagli di offload: " + targets.size());
    }
}
