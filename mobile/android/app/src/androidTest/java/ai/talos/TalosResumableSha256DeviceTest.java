package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

/**
 * P0-2 — quanto costa DAVVERO leggere un GGUF intero per il suo hash, sul
 * device vero, non su un numero di throughput generico letto altrove.
 *
 * ⛔ {@link TalosResumableSha256Test} prova la CORRETTEZZA dell'algoritmo
 * sulla JVM, con vettori piccoli — non dice niente sul TEMPO su un file da
 * un gigabyte e passa, su un telefono, con un'implementazione Java pura
 * (nessuna istruzione SHA-NI, nessun acceleratore hardware). Questo file
 * misura quello, perché {@link TalosLlamaPlugin#sha256Del} lo chiama dentro
 * `qualifyBackend` — un'operazione già lenta ed esplicita, mai durante
 * l'apertura normale di una chat, ma comunque un costo REALE che va
 * conosciuto e non presunto.
 */
@RunWith(AndroidJUnit4.class)
public class TalosResumableSha256DeviceTest {

    private static File model(Context context) {
        File esterno = context.getExternalFilesDir(null);
        if (esterno == null) return null;
        return new File(esterno,
                "models/ggml-org/Qwen3-1.7B-GGUF/Qwen3-1.7B-Q4_K_M.gguf");
    }

    @Test
    public void hashDiUnGgufVeroSuQuestoDispositivo() throws IOException {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        long inizio = System.currentTimeMillis();
        TalosResumableSha256 digest = new TalosResumableSha256();
        byte[] buffer = new byte[64 * 1024];
        try (FileInputStream in = new FileInputStream(file)) {
            int letti;
            while ((letti = in.read(buffer)) >= 0) {
                if (letti > 0) digest.update(buffer, 0, letti);
            }
        }
        long durataMs = System.currentTimeMillis() - inizio;
        String hex = digest.hex();

        long megabytesAlSecondo = durataMs > 0
                ? (file.length() / 1024 / 1024) * 1000 / durataMs
                : -1;
        Log.i("TalosSha256Bench", "file=" + file.length() + "B durata=" + durataMs + "ms"
                + " throughput=" + megabytesAlSecondo + "MB/s hash=" + hex);

        assertEquals("un hash SHA-256 è sempre 64 caratteri esadecimali", 64, hex.length());
        assertEquals(digest.bytesHashed(), file.length());
        // ⛔ Non una soglia stretta: solo la guardia contro una regressione
        // grave (un ciclo che rilegge il file più volte per errore, un I/O
        // bloccante inatteso). Il numero VERO va letto nel log qui sopra, non
        // dedotto da questo confine largo.
        assertTrue("più di due minuti per un file di " + (file.length() / 1024 / 1024)
                        + " MB è un segnale di regressione, non solo di lentezza",
                durataMs < 120_000);
    }
}
