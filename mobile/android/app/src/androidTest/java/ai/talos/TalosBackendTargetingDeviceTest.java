package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import ai.talos.research.TalosBackendInventory;

/**
 * ⛔ SOLO RICERCA — il bersaglio dell'offload si NOMINA, e chi sbaglia nome lo sa.
 *
 * `nativeOpenTargeted` esiste per una ragione sola: con due acceleratori
 * caricati insieme, «usa la GPU» è una lotteria decisa dall'ordine con cui le
 * librerie native si sono caricate. Questo test prova che la lotteria non c'è
 * più — e la prova **nei due versi**, perché metà del valore sta nel verso che
 * fallisce:
 *
 * <ul>
 *   <li>una richiesta vuota apre come ha sempre aperto;</li>
 *   <li>{@code none} apre sulla CPU per DECISIONE, non per ripiego;</li>
 *   <li>un dispositivo che non esiste <b>fallisce</b>, e non ripiega di
 *       nascosto sulla CPU — che è il difetto vero: un backend «richiesto» che
 *       non c'è, una corsa che gira comunque, e un numero attribuito a un
 *       acceleratore che non ha mai eseguito niente;</li>
 *   <li>un registry assente <b>fallisce</b> allo stesso modo;</li>
 *   <li>la CPU nominata come bersaglio <b>viene rifiutata</b>, come fa upstream;</li>
 *   <li>una Flash Attention scritta male <b>fallisce</b> invece di essere
 *       ignorata in silenzio.</li>
 * </ul>
 *
 * ⛔⛔ NON con {@code ./gradlew connectedDebugAndroidTest}: quel task
 * disinstalla l'app alla fine e si porta via i modelli. Si lancia con
 * {@code node scripts/research/run-device-tests.mjs}. Vedi la nota in testa a
 * {@link TalosBackendQualificationDeviceTest}.
 */
@RunWith(AndroidJUnit4.class)
public class TalosBackendTargetingDeviceTest {

    private static final String TAG = "TalosBackendTarget";

    /** Piccolo di proposito: qui si misura una DECISIONE, non una velocità. */
    private static final int CONTESTO = 512;
    private static final int THREAD = 4;

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    /**
     * Il modello con cui aprire.
     *
     * ⛔ Non è una scelta di backend, è una fixture: se l'argomento
     * {@code talosModelPath} c'è si usa quello, altrimenti si prende il primo
     * GGUF sotto {@code models/} e si SCRIVE quale, perché un test che non dice
     * su cosa ha misurato non è ripetibile.
     */
    private static File modello() {
        String indicato = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        if (indicato != null && !indicato.isEmpty()) return new File(indicato);
        File root = context().getExternalFilesDir(null);
        if (root == null) return null;
        List<File> trovati = new ArrayList<>();
        raccogli(new File(root, "models"), trovati);
        return trovati.isEmpty() ? null : trovati.get(0);
    }

    /** Il motivo per cui la ricerca non ha trovato niente, quando c'è. */
    private static final List<String> ostacoli = new ArrayList<>();

    /**
     * ⛔ `java.nio`, non `listFiles()`, e per il motivo che
     * {@code TalosModelStore} scrive nel proprio commento: {@code listFiles()}
     * risponde {@code null} a «non è una cartella», a «permesso negato» e a un
     * errore di I/O allo stesso modo, e chi chiama non può distinguerli da una
     * cartella vuota.
     *
     * MISURATO il 2026-08-20: un GGUF spinto con `adb push` era su disco e
     * invisibile all'app — le cartelle create da `adb shell mkdir`
     * appartengono a `shell` con modo 0770, l'app è un altro UID. Con
     * {@code listFiles()} il test si limitava a saltare dicendo «nessun GGUF»,
     * cioè la frase sbagliata: il file c'era.
     */
    private static void raccogli(File directory, List<File> into) {
        try (java.nio.file.DirectoryStream<java.nio.file.Path> stream =
                     java.nio.file.Files.newDirectoryStream(directory.toPath())) {
            for (java.nio.file.Path entry : stream) {
                File file = entry.toFile();
                if (file.isDirectory()) raccogli(file, into);
                else if (file.getName().endsWith(".gguf")) into.add(file);
            }
        } catch (java.nio.file.NoSuchFileException assente) {
            // Vuoto è un esito, non un guasto.
        } catch (Exception impedito) {
            ostacoli.add(directory.getAbsolutePath() + " → "
                    + impedito.getClass().getSimpleName()
                    + (impedito.getMessage() == null ? "" : ": " + impedito.getMessage()));
        }
    }

    private static File fixture() {
        ostacoli.clear();
        File model = modello();
        for (String ostacolo : ostacoli) Log.w(TAG, "non leggibile: " + ostacolo);
        // ⛔ Si SALTA dicendo cosa manca — e se qualcosa ha IMPEDITO la
        // lettura, lo si dice invece di chiamarla assenza. «Non c'è» e «non
        // riesco a guardare» sono due frasi diverse, e confonderle manda a
        // cercare il guasto dalla parte sbagliata.
        String indicato = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        final String perche;
        if (indicato != null && !indicato.isEmpty()) {
            // Chi ha passato un percorso a mano deve leggere IL SUO percorso,
            // non una frase sulla cartella dei modelli che non ha usato.
            perche = "il modello indicato non è un file: " + indicato;
        } else if (!ostacoli.isEmpty()) {
            perche = "files/models non è leggibile dall'app: " + ostacoli;
        } else {
            perche = "nessun GGUF sotto files/models — spingine uno e ripeti";
        }
        Assume.assumeTrue(perche, model != null && model.isFile());
        Log.i(TAG, "fixture: " + model.getAbsolutePath() + " (" + model.length() + " byte)");
        return model;
    }

    private static long apri(File model, String backend, String device, String fa) {
        return TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), THREAD, CONTESTO, 0, true, THREAD, 0, "f16",
                backend, device, fa);
    }

    private static void pronta() {
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        TalosLlamaNative.ensureReady(context());
    }

    // ————————————————— il verso che RIESCE —————————————————

    /**
     * Richiesta vuota = come si è sempre aperto. È il controllo che tiene
     * onesto tutto il resto: se questo fallisse, i fallimenti qui sotto non
     * proverebbero niente sul targeting.
     */
    @Test
    public void richiestaVuotaApreComeSempre() {
        pronta();
        File model = fixture();

        long handle = apri(model, "", "", "");
        assertNotEquals("apertura di controllo fallita: " + TalosLlamaNative.nativeLastOpenError(),
                0L, handle);
        TalosLlamaNative.nativeClose(handle);
    }

    /**
     * {@code none}: la CPU come DECISIONE.
     *
     * ⛔ Non è un doppione del test sopra. Sopra la lista dei dispositivi è
     * assente e il motore sceglie; qui la lista esiste e contiene il solo
     * terminatore, che in llama.cpp significa «non spostare niente». Il giorno
     * in cui un acceleratore sarà presente, i due casi divergeranno — e la
     * misura di riferimento dovrà essere questa, non quella.
     */
    @Test
    public void noneApreSullaCpuPerDecisione() {
        pronta();
        File model = fixture();

        long handle = apri(model, "none", "", "");
        assertNotEquals("`none` non ha aperto: " + TalosLlamaNative.nativeLastOpenError(),
                0L, handle);
        TalosLlamaNative.nativeClose(handle);

        long anche = apri(model, "cpu", "", "");
        assertNotEquals("`cpu` non ha aperto: " + TalosLlamaNative.nativeLastOpenError(),
                0L, anche);
        TalosLlamaNative.nativeClose(anche);
    }

    /** I tre casi di Flash Attention che servono a qualificare un backend. */
    @Test
    public void leTreModalitaDiFlashAttentionAprono() {
        pronta();
        File model = fixture();

        for (String modalita : new String[] { "default", "off", "auto", "on" }) {
            long handle = apri(model, "", "", modalita);
            assertNotEquals("Flash Attention `" + modalita + "` non ha aperto: "
                            + TalosLlamaNative.nativeLastOpenError(),
                    0L, handle);
            Log.i(TAG, "Flash Attention `" + modalita + "`: aperta");
            TalosLlamaNative.nativeClose(handle);
        }
    }

    // ————————————————— il verso che DEVE fallire —————————————————

    /**
     * ⛔ IL TEST CHE CONTA. Un dispositivo che non esiste deve far fallire
     * l'apertura, non ripiegare in silenzio sulla CPU.
     *
     * Il ripiego silenzioso è il difetto che avvelena un'intera campagna di
     * misure: la corsa parte, produce token, finisce, e il numero viene
     * attribuito a un acceleratore che non ha mai eseguito una sola
     * operazione. Nessun errore da nessuna parte — vedi
     * [[ok-false-su-un-elenco-fa-inventare]] e [[cieco-non-e-fallito]].
     */
    @Test
    public void unDispositivoCheNonEsisteFallisceInveceDiRipiegare() {
        pronta();
        File model = fixture();

        long handle = apri(model, "", "QuestoDispositivoNonEsiste", "");
        assertEquals("un dispositivo inesistente ha aperto lo stesso", 0L, handle);
        assertEquals("backend-target", TalosLlamaNative.nativeLastOpenError());
    }

    /** Un registry assente: stesso trattamento, e per la stessa ragione. */
    @Test
    public void unRegistryAssenteFallisce() {
        pronta();
        File model = fixture();

        TalosBackendInventory inventory =
                TalosBackendInventory.parse(TalosLlamaNative.nativeBackendInventory());
        Assume.assumeFalse("questa build HA Vulkan: il caso da provare è un altro",
                inventory.hasRegistry("Vulkan"));

        long handle = apri(model, "Vulkan", "", "");
        assertEquals("un registry assente ha aperto lo stesso", 0L, handle);
        assertEquals("backend-target", TalosLlamaNative.nativeLastOpenError());
    }

    /**
     * La CPU nominata come bersaglio viene rifiutata — come fa upstream.
     *
     * `common/arg.cpp` e `llama-bench` rifiutano entrambi con «invalid device»
     * un nome che risolve a un dispositivo di tipo CPU. Se lo accettassimo qui,
     * accetteremmo una lista che il motore poi tratta in un modo che nessuno ha
     * verificato.
     */
    @Test
    public void laCpuNominataComeBersaglioVieneRifiutata() {
        pronta();
        File model = fixture();

        TalosBackendInventory inventory =
                TalosBackendInventory.parse(TalosLlamaNative.nativeBackendInventory());
        TalosBackendInventory.Device cpu = null;
        for (TalosBackendInventory.Device device : inventory.devices()) {
            if (TalosBackendInventory.TYPE_CPU.equals(device.type)) { cpu = device; break; }
        }
        assertNotNull("nessun dispositivo CPU nell'inventario", cpu);

        long handle = apri(model, "", cpu.name, "");
        assertEquals("la CPU è stata accettata come bersaglio di offload", 0L, handle);
        assertEquals("backend-target", TalosLlamaNative.nativeLastOpenError());
    }

    /** `none` con un dispositivo è una richiesta che si contraddice. */
    @Test
    public void noneConUnDispositivoSiContraddice() {
        pronta();
        File model = fixture();

        long handle = apri(model, "none", "QualsiasiCosa", "");
        assertEquals(0L, handle);
        assertEquals("backend-target", TalosLlamaNative.nativeLastOpenError());
    }

    /**
     * Una Flash Attention scritta male fallisce invece di essere ignorata.
     *
     * ⛔ Il verso contrario di [[una-domanda-che-non-accetta-risposte]]: se una
     * parola sconosciuta venisse trattata come «default», una campagna che
     * crede di misurare `on` misurerebbe `auto` — e i due numeri finirebbero
     * nella stessa tabella con etichette diverse.
     */
    @Test
    public void unaFlashAttentionSconosciutaFallisce() {
        pronta();
        File model = fixture();

        long handle = apri(model, "", "", "fortissima");
        assertEquals("una modalità inventata è stata accettata", 0L, handle);
        assertEquals("flash-attn-mode", TalosLlamaNative.nativeLastOpenError());
    }
}
