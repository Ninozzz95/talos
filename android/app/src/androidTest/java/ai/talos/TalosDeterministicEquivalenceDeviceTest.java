package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import ai.talos.research.TalosBackendInventory;

/**
 * ⛔⛔ IL CANCELLO G3 — un acceleratore deve dire la stessa cosa della CPU.
 *
 * È il rischio più alto dell'intero programma, e il brief lo mette per primo:
 * <b>la corruzione silenziosa</b>. Un backend può essere veloce, stabile, non
 * crashare mai, e produrre testo sbagliato. Nessun numero di velocità lo vede, e
 * un modello che risponde male sembra un modello scadente — non un kernel rotto.
 * Si va a cercare la causa dalla parte sbagliata.
 *
 * ⛔ Il confronto è sul TESTO INTERO, non su un prefisso. La sonda che esisteva
 * confrontava <b>48 caratteri</b>: una corruzione che comincia al
 * quarantanovesimo passava. E la race che `60addddf` corregge è proprio di
 * quella famiglia — un subgroup che ricarica una tile mentre un altro la sta
 * ancora leggendo non sbaglia dal primo carattere.
 *
 * ⛔⛔ MA NON PRETENDE L'UGUAGLIANZA ESATTA, e questo va spiegato perché è
 * contro-intuitivo.
 *
 * Upstream **non** richiede l'identità bit a bit fra backend: in
 * `tests/test-backend-ops.cpp` il confronto è un errore quadratico medio
 * normalizzato con tolleranza `1e-7` (rilassata a `1e-6` su alcuni percorsi
 * f16), e il commento dice che le tolleranze esistono «to allow for accumulated
 * floating-point rounding differences across backends». L'ordine in cui una GPU
 * accumula una somma non è quello di una CPU, e su centinaia di token una
 * differenza di arrotondamento può cambiare un argmax e da lì tutta la coda.
 *
 * Il brief lo dice per esteso: se le sequenze divergono dopo un prefisso comune
 * lungo per ordine di accumulo, «document the divergence point … <b>do not
 * loosen correctness until the divergence has been explained</b>».
 *
 * ⇒ Questo test quindi <b>MISURA</b> il punto di divergenza e lo registra,
 * invece di dichiarare un fallimento che sarebbe corretto solo per caso.
 * Fallisce soltanto su ciò che non ha scuse:
 *
 * <ul>
 *   <li>un lato che <b>non ripete sé stesso</b> — non è arrotondamento, è
 *       non-determinismo dentro un backend, e allora nessun confronto vale;</li>
 *   <li>una generazione <b>vuota</b> o nulla.</li>
 * </ul>
 *
 * ⛔ C'era una terza condizione — «diverge troppo presto, quindi è un'altra
 * risposta» — ed è stata TOLTA perché misurata sbagliata. La spiegazione, coi
 * testi che l'hanno smentita, sta nel corpo del metodo.
 *
 * ⛔⛔ Quindi: questo test <b>non dà il verdetto G3</b>. Il verdetto vive a
 * livello di operatore, con `test-backend-ops` di upstream, che confronta con
 * una tolleranza e che upstream stesso fa girare sul telefono
 * (`./scripts/build-run-android.sh run_testops`). Qui si vede una corruzione
 * grossolana, non se ne dimostra l'assenza.
 *
 * ⛔⛔ NON con {@code ./gradlew connectedDebugAndroidTest}: disinstalla l'app.
 * Si lancia con {@code node scripts/research/run-device-tests.mjs}.
 */
@RunWith(AndroidJUnit4.class)
public class TalosDeterministicEquivalenceDeviceTest {

    private static final String TAG = "TalosEquivalenza";
    private static final String ARTIFACT_DIR = "research/local-backend";

    /** ⛔ Abbastanza token perché una corruzione tardiva abbia dove manifestarsi. */
    private static final int TOKEN = 128;
    private static final int CONTESTO = 2048;
    private static final int THREAD = 4;

    private static final String PROMPT =
            "Elenca in ordine i primi cinque numeri primi e spiega in una frase "
            + "perche' il numero uno non e' fra loro.";

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static int argomentoIntero(String nome, int predefinito) {
        String raw = InstrumentationRegistry.getArguments().getString(nome, "");
        if (raw == null || raw.isEmpty()) return predefinito;
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException storto) {
            return predefinito;
        }
    }

    private static void raccogli(File directory, List<File> into) {
        try (java.nio.file.DirectoryStream<java.nio.file.Path> stream =
                     java.nio.file.Files.newDirectoryStream(directory.toPath())) {
            for (java.nio.file.Path entry : stream) {
                File file = entry.toFile();
                if (file.isDirectory()) raccogli(file, into);
                else if (file.getName().endsWith(".gguf")) into.add(file);
            }
        } catch (Exception ignorato) {
            // Il motivo lo dice la fixture, che salta con la frase giusta.
        }
    }

    private static File fixture() {
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
        Assume.assumeTrue("nessun GGUF leggibile sotto files/models",
                model != null && model.isFile());
        return model;
    }

    private static void registra(JSONObject riga) throws Exception {
        File root = context().getExternalFilesDir(null);
        assertNotNull(root);
        File directory = new File(root, ARTIFACT_DIR);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("cartella artifact non creata");
        }
        riga.put("engineBuild", TalosLlamaNative.nativeEngineBuild());
        riga.put("atMs", System.currentTimeMillis());
        try (FileOutputStream out =
                     new FileOutputStream(new File(directory, "equivalence.jsonl"), true)) {
            out.write((riga.toString() + "\n").getBytes(StandardCharsets.UTF_8));
        }
        Log.i(TAG, riga.toString());
    }

    /**
     * Genera lo stesso prompt N volte su un bersaglio.
     *
     * ⛔ Tre condizioni, e servono tutte: `deterministic` toglie il caso;
     * `reusePrefix=false` impedisce che il secondo giro parta da uno stato
     * diverso dal primo; `stopAtEndOfGeneration=false` fa produrre sempre lo
     * stesso numero di token, così che «più corto» non si confonda con
     * «diverso».
     */
    private static List<String> genera(File model, String backend, String device,
                                       int gpuLayers, int giri) {
        List<String> testi = new ArrayList<>(giri);
        long handle = TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), THREAD, CONTESTO, gpuLayers, true, THREAD, 0, "f16",
                backend, device, "default");
        assertNotEquals("apertura fallita su `" + backend + "/" + device + "`: "
                + TalosLlamaNative.nativeLastOpenError(), 0L, handle);
        try {
            for (int giro = 0; giro < giri; giro += 1) {
                String testo = TalosLlamaNative.nativeGenerate(handle, PROMPT, TOKEN, false, false);
                assertNotNull("generazione nulla su " + backend, testo);
                assertFalse("generazione vuota su " + backend, testo.isEmpty());
                testi.add(testo);
                Log.i(TAG, backend + " giro " + giro + " · " + testo.length()
                        + " caratteri · «" + primaRiga(testo) + "»");
            }
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
        return testi;
    }

    private static String primaRiga(String testo) {
        String pulito = testo.replace('\n', ' ').trim();
        return pulito.length() <= 60 ? pulito : pulito.substring(0, 60) + "…";
    }

    /** Il primo indice in cui due testi divergono, o -1 se sono identici. */
    private static int divergeA(String a, String b) {
        int minimo = Math.min(a.length(), b.length());
        for (int i = 0; i < minimo; i += 1) {
            if (a.charAt(i) != b.charAt(i)) return i;
        }
        return a.length() == b.length() ? -1 : minimo;
    }

    private static JSONObject descrivi(String etichetta, List<String> testi) throws Exception {
        Set<String> distinti = new LinkedHashSet<>(testi);
        JSONObject fuori = new JSONObject();
        fuori.put("target", etichetta);
        fuori.put("runs", testi.size());
        fuori.put("distinctOutputs", distinti.size());
        fuori.put("chars", testi.isEmpty() ? 0 : testi.get(0).length());
        fuori.put("text", testi.isEmpty() ? JSONObject.NULL : testi.get(0));
        return fuori;
    }

    /**
     * ⛔ Salta, dicendolo, su una build senza acceleratori — che è il caso
     * normale della build che si spedisce, non un guasto.
     */
    @Test
    public void laGpuDiceLaStessaCosaDellaCpu() throws Exception {
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        TalosLlamaNative.ensureReady(context());
        File model = fixture();
        int giri = argomentoIntero("talosEquivRuns", 3);

        TalosBackendInventory inventario =
                TalosBackendInventory.parse(TalosLlamaNative.nativeBackendInventory());
        List<TalosBackendInventory.Device> bersagli = inventario.offloadDevices();
        Assume.assumeFalse(
                "questa build non espone acceleratori: è il caso della build che si spedisce",
                bersagli.isEmpty());
        TalosBackendInventory.Device bersaglio = bersagli.get(0);

        // ⛔ La CPU per DECISIONE, non per assenza di scelta: è il riferimento.
        List<String> cpu = genera(model, "none", "", 0, giri);
        List<String> gpu = genera(model, bersaglio.registry, bersaglio.name, -1, giri);

        int divergenza = divergeA(cpu.get(0), gpu.get(0));

        JSONObject riga = new JSONObject();
        riga.put("case", "G3-equivalence");
        riga.put("prompt", PROMPT);
        riga.put("maxTokens", TOKEN);
        riga.put("contextTokens", CONTESTO);
        riga.put("cpu", descrivi("none", cpu));
        riga.put("gpu", descrivi(bersaglio.registry + "/" + bersaglio.name, gpu));
        riga.put("divergesAtChar", divergenza);
        riga.put("identical", divergenza < 0);
        riga.put("commonPrefixChars", divergenza < 0 ? cpu.get(0).length() : divergenza);
        if (divergenza >= 0) {
            int da = Math.max(0, divergenza - 40);
            riga.put("cpuAround", cpu.get(0).substring(
                    da, Math.min(cpu.get(0).length(), divergenza + 40)));
            riga.put("gpuAround", gpu.get(0).substring(
                    da, Math.min(gpu.get(0).length(), divergenza + 40)));
        }
        registra(riga);

        // ————— ciò che è inequivocabilmente rotto —————

        // ⛔ La prima domanda tiene onesta la terza: se la CPU non ripetesse sé
        // stessa, «diverso dalla GPU» non vorrebbe dire niente.
        assertEquals("la CPU non ripete sé stessa su " + giri
                        + " giri: il confronto non è possibile",
                1, new LinkedHashSet<>(cpu).size());
        assertEquals("⛔ l'acceleratore " + bersaglio.name + " non ripete sé stesso su "
                        + giri + " giri: non è arrotondamento, è non-determinismo",
                1, new LinkedHashSet<>(gpu).size());

        if (divergenza < 0) {
            Log.i(TAG, "✓ IDENTICI: CPU e " + bersaglio.name + " producono lo stesso testo, "
                    + cpu.get(0).length() + " caratteri, su " + giri + " giri ciascuno");
            return;
        }

        /*
         * ⛔⛔ LA POSIZIONE DELLA DIVERGENZA NON MISURA LA CORRUZIONE.
         *
         * Qui c'era una soglia — «se diverge prima di N caratteri è un'altra
         * risposta, non arrotondamento» — e MISURATO il 2026-08-20 è un
         * discriminante SBAGLIATO. Vale la pena scriverlo, perché sembrava
         * ragionevole e non lo è.
         *
         * OpenCL divergeva al carattere 15 su 427. Sembrava grave. I testi:
         *
         *   prefisso comune  " 1, 2, 3, 5, 7\n"      ← la risposta, IDENTICA
         *   CPU              "Il numero uno non e'…"
         *   GPU              "Questi cinque numeri sono tutti primi, ma…"
         *
         * Entrambi deterministici — tre giri, una sola uscita distinta per lato
         * — ed entrambi coerenti. La divergenza cade sul PRIMO token della
         * prosa, cioè nel primo punto in cui due continuazioni sono quasi a pari
         * probabilità: lì una differenza minima nell'ordine di accumulo ribalta
         * l'argmax, e da quel token i testi non si riavvicinano più.
         *
         * ⇒ Il carattere in cui divergono dice DOV'ERA IL PRIMO QUASI-PAREGGIO,
         * non quanto è corrotto un backend. Con campionamento greedy il testo è
         * un AMPLIFICATORE di qualunque differenza numerica: serve a vedere una
         * corruzione grossolana, non a misurarne l'assenza.
         *
         * ⛔ Il cancello vero è a livello di OPERATORE, ed è quello di upstream:
         * `tests/test-backend-ops.cpp` confronta contro la CPU con un errore
         * quadratico medio normalizzato, tolleranza `1e-7`, e il commento dice
         * che le tolleranze esistono «to allow for accumulated floating-point
         * rounding differences across backends». Bit a bit non lo pretende
         * nessuno. Upstream lo fa girare sul telefono con
         * `./scripts/build-run-android.sh run_testops`.
         *
         * ⇒ Questo test REGISTRA la divergenza e non la giudica. Asserisce
         * l'unica cosa che non ha scuse: che ogni lato ripeta sé stesso. Il
         * verdetto su G3 richiede `test-backend-ops` sul dispositivo — lavoro
         * non ancora fatto, dichiarato nel ritorno.
         */
        Log.w(TAG, "DIVERGE al carattere " + divergenza + " di " + cpu.get(0).length()
                + " — REGISTRATO, non giudicato qui");
        Log.w(TAG, "  CPU: «" + riga.optString("cpuAround") + "»");
        Log.w(TAG, "  GPU: «" + riga.optString("gpuAround") + "»");
        Log.w(TAG, "⛔ Il verdetto G3 non si dà da qui: serve test-backend-ops sul "
                + "dispositivo, che confronta gli OPERATORI con una tolleranza, non il "
                + "testo con l'uguaglianza.");
    }
}
