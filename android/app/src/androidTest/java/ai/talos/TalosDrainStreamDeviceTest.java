package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;

/**
 * ⛔⛔⛔ IL DRAIN RICOSTRUISCE ESATTAMENTE IL TESTO — su ferro, mentre genera.
 *
 * `nativeDrainText` torna solo i byte nuovi. La prova che conta: la SOMMA dei
 * drain, presi mentre il modello genera, deve dare lo stesso testo di
 * `textSoFar` alla fine. Nemmeno un byte perso, nemmeno un carattere doppio.
 */
@RunWith(AndroidJUnit4.class)
public class TalosDrainStreamDeviceTest {

    private static final String FIXTURE = "talos-fixture.gguf";

    private static File model(Context c) {
        String sel = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        if (sel != null && !sel.isEmpty()) return new File(sel);
        File d = c.getExternalFilesDir(null);
        return d == null ? null : new File(d, FIXTURE);
    }

    @Test
    public void laSommaDeiDrainEIlTestoIntero() throws Exception {
        Context ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File f = model(ctx);
        Assume.assumeTrue("modello assente", f != null && f.isFile());

        TalosLlamaEngine engine = TalosLlamaEngine.open(ctx, f.getAbsolutePath(), 4, 2048, 0, true);
        assertNotNull(engine);
        try {
            final StringBuilder raccolto = new StringBuilder();
            // un watcher che DRENA mentre l'attore genera
            Thread spia = new Thread(() -> {
                while (!Thread.currentThread().isInterrupted()) {
                    String d = engine.drainText();
                    if (d != null) raccolto.append(d);
                    try { Thread.sleep(20); } catch (InterruptedException e) { break; }
                }
            }, "drain-spia");
            spia.start();

            // una risposta abbastanza lunga da attraversare piu' chunk
            String intero = engine.generateBlocking("Racconta una storia lunga.", 96,
                    TalosLlamaEngine.Mode.CHAT);
            spia.interrupt();
            spia.join(2000);
            // un ultimo drain per la coda dopo l'ultimo sonno della spia
            String coda = engine.drainText();
            if (coda != null) raccolto.append(coda);

            assertNotNull(intero);
            assertTrue("niente generato", intero.length() > 0);
            // ⛔ La prova: drain sommati == testo intero. Byte per byte.
            assertEquals("il drain ha perso o duplicato del testo",
                    intero, raccolto.toString());
        } finally {
            engine.close();
        }
    }
}
