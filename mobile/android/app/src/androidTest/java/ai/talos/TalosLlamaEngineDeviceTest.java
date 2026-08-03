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
 * Il motore locale su un telefono VERO.
 *
 * Questa è la prova che nessun test sulla JVM può dare: che llama.cpp compilato
 * per ARM64 si carichi in questo processo, legga un GGUF dal disco del
 * dispositivo e produca token. Fino a oggi il cablaggio nativo era «letto e non
 * eseguito» — debito dichiarato, non nascosto.
 *
 * Il modello non sta nel repository: sono centinaia di megabyte, e un file
 * grande in git è un file grande per sempre. Va spinto prima di eseguire:
 *
 * <pre>
 * adb push modello.gguf /sdcard/Android/data/&lt;pacchetto&gt;/files/talos-probe.gguf
 * </pre>
 *
 * Senza, il test si SALTA con un messaggio che dice cosa manca — non passa
 * fingendo. Un test verde che non ha misurato niente è peggio di uno rosso.
 */
@RunWith(AndroidJUnit4.class)
public class TalosLlamaEngineDeviceTest {

    private static final String TAG = "TalosLlamaDeviceTest";
    private static final String FIXTURE = "talos-probe.gguf";

    private static File model(Context context) {
        File directory = context.getExternalFilesDir(null);
        return directory == null ? null : new File(directory, FIXTURE);
    }

    @Test
    public void theNativeLibraryIsOnBoard() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        String backends = TalosLlamaEngine.backends(context);
        Log.i(TAG, "backend ggml registrati: " + backends);
        assertTrue("nessun backend ggml registrato: ggml_backend_load_all non ha trovato nulla",
                backends != null && !backends.isEmpty());
    }

    /**
     * Un prompt più lungo della batch, che è la crepa che ha ucciso l'app.
     *
     * `n_ctx` e `n_batch` sono due tetti diversi: il contesto qui è 2048, la
     * batch che il motore usa dentro è 512. Un prompt che sta comodamente nel
     * primo e sfonda la seconda veniva consegnato a `llama_decode` in un colpo
     * solo, e llama.cpp in quel caso non restituisce un errore — chiama
     * `abort()`. Il processo dell'applicazione se ne andava con lui.
     *
     * Non era un caso limite: il prompt di sistema di TALOS misura 649 token
     * misurati sul dispositivo, quindi OGNI invio in chat crashava. Nessun test
     * sulla JVM poteva vederlo, perché è llama.cpp vero a decidere di abortire.
     *
     * Questo test non asserisce il testo: un modello piccolo dice quel che
     * vuole. Asserisce che la generazione TORNA — cioè che il processo è ancora
     * vivo per rispondere. Contro il codice di prima, il segnale non è rosso: è
     * l'intero strumento di test che muore, e va letto come tale.
     */
    @Test
    public void survivesAPromptLongerThanOneBatch() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        TalosLlamaEngine engine = TalosLlamaEngine.open(context, file.getAbsolutePath(), 4, 2048, 0, true);
        assertNotNull("il modello non si è aperto — guarda logcat, tag TalosLlama", engine);

        try {
            // Ogni ripetizione è almeno un token, quindi il conto sta sopra i
            // 512 della batch qualunque sia il vocabolario, e sotto i 2048 del
            // contesto. Il margine è voluto: il test deve provare la batch, non
            // inciampare nel contesto e passare per il motivo sbagliato.
            StringBuilder longPrompt = new StringBuilder(6_000);
            for (int index = 0; index < 900; index += 1) longPrompt.append("parola ");

            String answer = engine.generateBlocking(longPrompt.toString(), 8, false);

            assertNotNull("la generazione non è tornata: il prompt oltre la batch è di nuovo fatale",
                    answer);
            Log.i(TAG, "prompt lungo superato, token prodotti: " + engine.tokensProduced());
        } finally {
            engine.close();
        }
    }

    @Test
    public void generatesTokensOnThisPhone() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        // Tutto su CPU: è il pavimento, quello che deve funzionare ovunque e
        // contro cui ogni altro backend viene misurato.
        // Contesto largo abbastanza da contenere il tetto della prova: è il
        // tempo a fermarla, e su un telefono veloce quel tempo sono molti token.
        TalosLlamaEngine engine = TalosLlamaEngine.open(context, file.getAbsolutePath(), 4, 2048, 0, true);
        assertNotNull("il modello non si è aperto — guarda logcat, tag TalosLlama", engine);

        try {
            Log.i(TAG, "contesto: " + engine.contextTokens() + " token");
            TalosLlamaEngine.Run run = engine.run(
                    TalosLlamaProbe.PROMPT,
                    TalosLlamaProbe.TOKENS,
                    () -> TalosThermal.read(context));

            assertNotNull("la generazione è fallita", run);
            Log.i(TAG, "testo prodotto: " + run.text);
            Log.i(TAG, "finestre di misura: " + run.samples.length);

            assertTrue("il pavimento deve almeno dire qualcosa",
                    TalosLlamaProbe.referenceIsUsable(run.text));
            assertTrue("servono almeno tre finestre perché l'harness possa giudicare",
                    run.samples.length >= 3);

            TalosBenchmarkHarness.Result result =
                    TalosBenchmarkHarness.judge(run.samples, TalosLlamaProbe.referenceIsUsable(run.text));
            TalosBackendChoice.Evidence evidence =
                    TalosLlamaProbe.evidenceOf(TalosBackendChoice.CPU, "cpu", result);
            Log.i(TAG, "verdetto: " + result.verdict + "  ritmo: " + result.tokensPerSecond + " t/s"
                    + "  esito: " + evidence.outcome);

            // Il verdetto NON è asserito: su un telefono che scalda,
            // THERMAL_DRIFT è una risposta corretta dell'harness, non un guasto
            // del motore. Quello che si asserisce è che il motore ha generato.
            int produced = run.samples[run.samples.length - 1].tokens;
            assertTrue("nessun token prodotto", produced > 0);
        } finally {
            engine.close();
        }
    }
}
