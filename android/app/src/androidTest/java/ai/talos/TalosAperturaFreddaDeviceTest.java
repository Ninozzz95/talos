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
 * ⭐⭐⭐ QUANTO COSTA RIAPRIRE — il numero che decide il contratto a tempo.
 *
 * Oggi TALOS, quando l'app va in secondo piano, SCARICA il modello — anche se il
 * telefono aveva memoria da vendere. Quando la persona torna, paga di nuovo
 * l'apertura a freddo: caricare i pesi dal disco, costruire il contesto, arrivare
 * al primo token.
 *
 * Il rilievo P1-5 propone di tenerlo per un po' — un «contratto a tempo» — invece
 * di buttarlo alla prima occasione. Ma vale la pena SOLO se l'apertura a freddo
 * costa davvero: se fossero cento millisecondi, tenere in memoria gigabyte
 * sarebbe uno scambio perdente.
 *
 * ⛔ Quindi prima si MISURA. Questo test apre il modello e cronometra fino al
 * primo token, tre volte, chiudendo ogni volta — cioe' riproduce esattamente il
 * costo che paga chi torna dopo uno scarico.
 *
 * ⛔ Non asserisce una soglia: quale numero giustifichi il contratto e' una
 * decisione, e dipende dal modello e dal telefono. Il test garantisce che il
 * numero SI POSSA leggere su ferro vero; il valore sta in logcat.
 */
@RunWith(AndroidJUnit4.class)
public class TalosAperturaFreddaDeviceTest {

    private static final String TAG = "TalosApertura";
    private static final String FIXTURE = "talos-fixture.gguf";
    private static final int GIRI = 3;

    private static File model(Context context) {
        String selected = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        if (selected != null && !selected.isEmpty()) return new File(selected);
        File directory = context.getExternalFilesDir(null);
        return directory == null ? null : new File(directory, FIXTURE);
    }

    @Test
    public void quantoCostaAprireAFreddo() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        for (int giro = 1; giro <= GIRI; giro += 1) {
            long primaDiAprire = System.currentTimeMillis();
            TalosLlamaEngine engine =
                    TalosLlamaEngine.open(context, file.getAbsolutePath(), 4, 2048, 0, true);
            long apertura = System.currentTimeMillis() - primaDiAprire;
            assertNotNull("il modello non si e aperto al giro " + giro, engine);
            try {
                long primaDelToken = System.currentTimeMillis();
                String prodotto =
                        engine.generateBlocking("Ciao.", 8, TalosLlamaEngine.Mode.CHAT);
                long alPrimoUso = System.currentTimeMillis() - primaDelToken;
                assertTrue("niente prodotto al giro " + giro, prodotto != null && !prodotto.isEmpty());
                /*
                 * ⛔ Due numeri separati: l'apertura (leggere i pesi, costruire
                 * il contesto) e il primo uso (arrivare a un token). Il freddo
                 * che pesa alla persona e la SOMMA — apre e subito prova a
                 * parlare — ma tenerli distinti dice DOVE va speso il lavoro se
                 * il totale e alto.
                 *
                 * ⭐ E l'apertura da sola dice anche un'altra cosa: se e' bassa,
                 * i pesi sono gia' mappati in memoria (mmap) e il kernel li
                 * pagina da solo sotto pressione, invece di uccidere il
                 * processo. Il contratto a tempo diventa una scelta diversa se i
                 * pesi sono mappati o copiati.
                 */
                Log.i(TAG, "giro " + giro
                        + ": apertura=" + apertura + "ms"
                        + " primoUso=" + alPrimoUso + "ms"
                        + " freddo_totale=" + (apertura + alPrimoUso) + "ms");
            } finally {
                engine.close();
            }
        }
    }
}
