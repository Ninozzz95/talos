package ai.talos;

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

/**
 * ⭐⭐⭐ QUANTO VALGONO I THREAD SU QUESTO DISPOSITIVO — la misura, non la teoria.
 *
 * Il Pad ha una topologia netta: sei core a 3,53 GHz e due a 4,32. Fino al pin
 * b10354 l'affinita CPU era COMPILATA VIA su Android: la guardia era
 * `#elif defined(__gnu_linux__)`, che Clang non definisce per Android, quindi
 * ogni thread restava su tutti e otto i core comunque.
 *
 * ⛔ Provato A/B sulla stessa macchina, stesso comando:
 *
 *     pin b10218   0 simboli di affinita
 *     pin b10354   sched_setaffinity@LIBC
 *
 * Questo test misura la GRIGLIA che il tuner usa per decidere. E il numero da
 * cui parte ogni discorso su quanti thread dare al prefill e quanti alla
 * generazione — senza, la scelta resta un'opinione.
 *
 * ## ⛔ TRE CORSE, non una
 *
 * Su un telefono una misura sola e rumore: temperatura, un'altra app che si
 * sveglia, lo scheduler che sposta un thread. La metodologia corrente per il
 * confronto fra numeri di thread e ripetere ogni configurazione e prendere la
 * mediana.
 *
 * ⇒ Qui si stampano TUTTE E TRE, non solo la mediana: la dispersione e
 * informazione. Tre corse vicine vogliono dire che il dispositivo e stabile;
 * tre corse lontane vogliono dire che qualunque scelta e provvisoria, ed e una
 * cosa che chi legge deve sapere.
 *
 * ⛔ E NON asserisce quale numero debba vincere. Su un dispositivo diverso vince
 * un altro, ed e tutto il punto di misurare: un test che pretende «8 deve
 * battere 6» sarebbe la stessa presunzione che il rilievo P1-1 ha corretto.
 */
@RunWith(AndroidJUnit4.class)
public class TalosAffinitaMisuraDeviceTest {

    private static final String TAG = "TalosMisura";
    private static final String FIXTURE = "talos-fixture.gguf";
    private static final int CORSE = 3;

    private static File model(Context context) {
        String selected = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        if (selected != null && !selected.isEmpty()) return new File(selected);
        File directory = context.getExternalFilesDir(null);
        return directory == null ? null : new File(directory, FIXTURE);
    }

    @Test
    public void laGrigliaDeiThreadSuQuestoDispositivo() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        int core = Runtime.getRuntime().availableProcessors();
        Log.i(TAG, "core visibili: " + core);

        TalosLlamaEngine engine =
                TalosLlamaEngine.open(context, file.getAbsolutePath(), 4, 2048, 0, true);
        assertNotNull("il modello non si e aperto", engine);
        try {
            /*
             * ⛔ I candidati vengono dal DISPOSITIVO, non da una lista scritta a
             * mano: su un telefono con quattro core, provare otto significa
             * misurare la contesa invece della scala.
             */
            int[] candidati = core >= 8
                    ? new int[] { 2, 4, 6, 8 }
                    : new int[] { 2, Math.max(2, core / 2), core };
            StringBuilder quali = new StringBuilder();
            for (int c : candidati) quali.append(c).append(' ');
            Log.i(TAG, "candidati: " + quali);

            String ultima = null;
            for (int giro = 1; giro <= CORSE; giro += 1) {
                String griglia = engine.tuneThreads(candidati, 64);
                Log.i(TAG, "GRIGLIA giro " + giro + ": " + griglia);
                assertNotNull("il tuner non ha restituito niente al giro " + giro, griglia);
                ultima = griglia;
            }

            assertTrue("il tuner ha restituito una griglia vuota", ultima.length() > 2);
            /*
             * ⛔ I valori si leggono in logcat, non si asseriscono. Questo test
             * garantisce che la misura SI POSSA FARE su ferro vero; quale numero
             * vinca lo decide il dispositivo, ed e' esattamente cio che il tuner
             * deve poter cambiare quando cambia il telefono.
             */
        } finally {
            engine.close();
        }
    }
}
