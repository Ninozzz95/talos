package ai.talos;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Socket;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;

/**
 * Il motore locale su un telefono VERO.
 *
 * Questa è la prova che nessun test sulla JVM può dare: che llama.cpp compilato
 * per ARM64 si carichi in questo processo, legga un GGUF dal disco del
 * dispositivo e produca token. Fino a oggi il cablaggio nativo era «letto e non
 * eseguito» — debito dichiarato, non nascosto.
 *
 * Il modello non sta nel repository: sono centinaia di megabyte, e un file
 * grande in git è un file grande per sempre. Il runner della matrice lo
 * trasmette direttamente al solo namespace di campagna con l'UID del package
 * debug, poi passa path, byte e SHA come argomenti instrumentation.
 *
 * Senza una fixture il test generico si SALTA con un messaggio che dice cosa
 * manca — non passa fingendo. Un test verde che non ha misurato niente è peggio
 * di uno rosso.
 */
@RunWith(AndroidJUnit4.class)
public class TalosLlamaEngineDeviceTest {

    private static final String TAG = "TalosLlamaDeviceTest";
    private static final String FIXTURE = "talos-probe.gguf";
    private static final String COMPATIBILITY_FILE = "talos-compat.gguf";

    private static File model(Context context) {
        String selected = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        if (selected != null && !selected.isEmpty()) return new File(selected);
        File directory = context.getExternalFilesDir(null);
        return directory == null ? null : new File(directory, FIXTURE);
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[1024 * 1024];
        try (FileInputStream stream = new FileInputStream(file)) {
            int read;
            while ((read = stream.read(buffer)) >= 0) {
                if (read > 0) digest.update(buffer, 0, read);
            }
        }
        StringBuilder hexadecimal = new StringBuilder(64);
        for (byte value : digest.digest()) {
            hexadecimal.append(String.format("%02x", value & 0xff));
        }
        return hexadecimal.toString();
    }

    private static File compatibilityNativeFile(Context context) {
        File root = context.getExternalFilesDir(null);
        if (root == null) throw new IllegalStateException("external files dir assente");
        return new File(new File(root, "talos-compat"), COMPATIBILITY_FILE);
    }

    private static File compatibilityUiFile(Context context, String caseId) {
        if (caseId == null || !caseId.matches("^[A-Z][0-9]+$")) {
            throw new IllegalArgumentException("talosCaseId non allowlisted");
        }
        File root = context.getExternalFilesDir(null);
        if (root == null) throw new IllegalStateException("external files dir assente");
        return new File(new File(new File(root, "models"), "__talos_compat__"),
                caseId + File.separator + COMPATIBILITY_FILE);
    }

    private static void deleteIfPresent(File file) throws IOException {
        if (file.exists() && !file.delete()) {
            throw new IOException("fixture campagna non rimossa: " + file.getAbsolutePath());
        }
    }

    private static void receiveFixtureFromHost(File target, int port) throws Exception {
        File parent = target.getParentFile();
        if (parent == null || (!parent.mkdirs() && !parent.isDirectory())) {
            throw new IOException("directory campagna non creata");
        }
        deleteIfPresent(target);
        boolean complete = false;
        try (Socket socket = new Socket("127.0.0.1", port);
             InputStream input = socket.getInputStream();
             FileOutputStream output = new FileOutputStream(target)) {
            socket.setSoTimeout(120_000);
            byte[] buffer = new byte[1024 * 1024];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read > 0) output.write(buffer, 0, read);
            }
            output.getFD().sync();
            complete = true;
        } finally {
            if (!complete) deleteIfPresent(target);
        }
    }

    @Test
    public void invalidGgufReportsModelLoadInsteadOfGenericOpenFailure() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory = new File(context.getFilesDir(), "talos-invalid-open");
        assertTrue("directory fixture non creata", directory.mkdirs() || directory.isDirectory());
        File invalid = new File(directory, "invalid.gguf");
        try {
            try (FileOutputStream stream = new FileOutputStream(invalid)) {
                stream.write(new byte[] { 'n', 'o', 't', '-', 'g', 'g', 'u', 'f' });
                stream.getFD().sync();
            }

            TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                    context, invalid.getAbsolutePath(), 4, 4096, 0, true);

            assertNull("un file non GGUF non deve produrre un engine", attempt.engine());
            assertEquals(TalosLlamaEngine.FailureStage.MODEL_LOAD, attempt.failureStage());
        } finally {
            assertFalse("fixture invalida non rimossa", invalid.exists() && !invalid.delete());
            assertFalse("directory fixture non rimossa", directory.exists() && !directory.delete());
        }
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

            String answer = engine.generateBlocking(longPrompt.toString(), 8, TalosLlamaEngine.Mode.BENCHMARK);

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
        TalosLlamaEngine engine = TalosLlamaEngine.open(context, file.getAbsolutePath(), 4, 4096, 0, true);
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

    @Test
    public void appliesEmbeddedTemplateAndGeneratesAVisibleReply() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        String hostPort = InstrumentationRegistry.getArguments()
                .getString("talosHostPort", "");
        if (hostPort != null && !hostPort.isEmpty()) {
            File campaignFile = compatibilityNativeFile(context);
            assertNotNull("path fixture campagna assente", file);
            assertEquals("lo stream può scrivere soltanto nel target nativo allowlisted",
                    campaignFile.getCanonicalPath(), file.getCanonicalPath());
            receiveFixtureFromHost(campaignFile, Integer.parseInt(hostPort));
        }
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        String expectedBytes = InstrumentationRegistry.getArguments()
                .getString("talosExpectedBytes", "");
        String expectedSha256 = InstrumentationRegistry.getArguments()
                .getString("talosExpectedSha256", "");
        String caseId = InstrumentationRegistry.getArguments()
                .getString("talosCaseId", "manual");
        if (expectedBytes != null && !expectedBytes.isEmpty()) {
            assertEquals("byte fixture diversi per " + caseId,
                    Long.parseLong(expectedBytes), file.length());
        }
        if (expectedSha256 != null && !expectedSha256.isEmpty()) {
            assertEquals("SHA-256 fixture diverso per " + caseId,
                    expectedSha256.toLowerCase(), sha256(file));
        }
        Log.i(TAG, "fixture verificata: case=" + caseId + " bytes=" + file.length());

        TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                context, file.getAbsolutePath(), 4, 4096, 0, false);
        assertNotNull("il modello non si è aperto: " + attempt.failureStage(), attempt.engine());

        try (TalosLlamaEngine engine = attempt.engine()) {
            String prompt = engine.chatPrompt(
                    new String[] { "system", "user" },
                    new String[] {
                            "Rispondi in modo breve e diretto.",
                            "Scrivi soltanto la parola TALOS."
                    });
            assertNotNull("il GGUF non espone un chat template", prompt);
            assertFalse("il GGUF espone un chat template vuoto", prompt.isEmpty());

            String reply = engine.generateBlocking(prompt, 32, TalosLlamaEngine.Mode.CHAT);
            assertNotNull("la generazione templata non è tornata", reply);
            assertFalse("la generazione templata è vuota", reply.trim().isEmpty());
            assertTrue("nessun token prodotto", engine.tokensProduced() > 0);
            Log.i(TAG, "compatibilità chat: context=" + engine.contextTokens()
                    + " tokens=" + engine.tokensProduced());
        }

        boolean projectToUi = "true".equals(InstrumentationRegistry.getArguments()
                .getString("talosProjectToUi", "false"));
        if (projectToUi) {
            File uiFile = compatibilityUiFile(context, caseId);
            File uiDirectory = uiFile.getParentFile();
            assertNotNull("directory UI campagna assente", uiDirectory);
            assertTrue("directory UI campagna non creata",
                    uiDirectory.mkdirs() || uiDirectory.isDirectory());
            deleteIfPresent(uiFile);
            Files.move(file.toPath(), uiFile.toPath(),
                    StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            assertFalse("la proiezione UI ha duplicato la fixture nativa", file.exists());
            assertTrue("la proiezione UI non esiste", uiFile.isFile());
        }
    }

    /**
     * Prova il confine che una JVM finta non può provare: il parser
     * OpenAI-compatible vendorizzato riceve una chiamata tool e il suo risultato,
     * poi il Jinja del GGUF li conserva nel prompt del turno successivo.
     */
    @Test
    public void preservesToolCallAndResultInEmbeddedTemplate() throws Exception {
        String expectedTransport = InstrumentationRegistry.getArguments()
                .getString("talosExpectedToolTransport", "");
        Assume.assumeTrue("template senza tool nativi: usare la prova prompt-json-v1",
                expectedTransport == null || expectedTransport.isEmpty()
                        || "native-template".equals(expectedTransport));

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                context, file.getAbsolutePath(), 4, 4096, 0, false);
        assertNotNull("il modello non si è aperto: " + attempt.failureStage(), attempt.engine());

        try (TalosLlamaEngine engine = attempt.engine()) {
            String messagesJson = "["
                    + "{\"role\":\"system\",\"content\":\"Rispondi in modo breve.\"},"
                    + "{\"role\":\"user\",\"content\":\"Usa il tool diagnostico.\"},"
                    + "{\"role\":\"assistant\",\"content\":\"\",\"tool_calls\":[{"
                    + "\"id\":\"diag_1\",\"type\":\"function\",\"function\":{"
                    + "\"name\":\"talos_diagnostic_echo\","
                    + "\"arguments\":\"{\\\"value\\\":\\\"TALOS_PARITY_NONCE_593\\\"}\"}}]},"
                    + "{\"role\":\"tool\",\"name\":\"talos_diagnostic_echo\","
                    + "\"tool_call_id\":\"diag_1\","
                    + "\"content\":\"Diagnostic result: TALOS_TOOL_RESULT_847\"}"
                    + "]";
            String toolsJson = "[{\"type\":\"function\",\"function\":{"
                    + "\"name\":\"talos_diagnostic_echo\","
                    + "\"description\":\"Return one diagnostic value.\","
                    + "\"parameters\":{\"type\":\"object\",\"properties\":{"
                    + "\"value\":{\"type\":\"string\"}},\"required\":[\"value\"]}}}]";

            String prompt = engine.chatPrompt(messagesJson, toolsJson, false);

            assertNotNull("il template non ha accettato il giro tool", prompt);
            assertTrue("il risultato tool è stato perso prima del GGUF",
                    prompt.contains("TALOS_TOOL_RESULT_847"));
            Log.i(TAG, "round-trip tool nel template: " + file.getName());
        }
    }

    /** The wire strategy is derived from the embedded Jinja, never the filename. */
    @Test
    public void reportsEmbeddedTemplateCapabilities() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        String raw = TalosLlamaEngine.templateCapabilities(file.getAbsolutePath());
        assertNotNull("il preflight capability non ha risposto", raw);
        JSONObject capabilities = new JSONObject(raw);
        assertTrue("supportsTools mancante", capabilities.has("supportsTools"));
        assertTrue("supportsToolCalls mancante", capabilities.has("supportsToolCalls"));
        assertTrue("supportsSystemRole mancante", capabilities.has("supportsSystemRole"));

        assertExpectedBoolean(capabilities, "supportsTools", "talosExpectedSupportsTools");
        assertExpectedBoolean(capabilities, "supportsToolCalls", "talosExpectedSupportsToolCalls");
        assertExpectedBoolean(capabilities, "supportsSystemRole", "talosExpectedSupportsSystemRole");
        Log.i(TAG, "capability template: " + raw + " file=" + file.getName());
    }

    private static void assertExpectedBoolean(
            JSONObject capabilities, String key, String argument) throws Exception {
        String expected = InstrumentationRegistry.getArguments().getString(argument, "");
        if (expected != null && !expected.isEmpty()) {
            assertEquals("capability inattesa: " + key,
                    Boolean.parseBoolean(expected), capabilities.getBoolean(key));
        }
    }

    /** Gemma's base GGUF template accepts this prompted, role-alternating lane. */
    @Test
    public void preservesToolResultWithPromptJsonProtocol() throws Exception {
        String expectedTransport = InstrumentationRegistry.getArguments()
                .getString("talosExpectedToolTransport", "");
        Assume.assumeTrue("prova riservata al trasporto prompt-json-v1",
                "prompt-json-v1".equals(expectedTransport));

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());

        TalosLlamaEngine.OpenAttempt attempt = TalosLlamaEngine.tryOpen(
                context, file.getAbsolutePath(), 4, 4096, 0, false);
        assertNotNull("il modello non si è aperto: " + attempt.failureStage(), attempt.engine());

        try (TalosLlamaEngine engine = attempt.engine()) {
            String messagesJson = "["
                    + "{\"role\":\"system\",\"content\":\"TALOS prompt-json-v1 tool protocol\\n"
                    + "Output exactly one JSON function object when requested.\"},"
                    + "{\"role\":\"user\",\"content\":\"Usa il tool diagnostico.\"},"
                    + "{\"role\":\"assistant\",\"content\":\"{\\\"name\\\":\\\"talos_diagnostic_echo\\\","
                    + "\\\"arguments\\\":{\\\"value\\\":\\\"TALOS_PROMPT_NONCE_848\\\"}}\"},"
                    + "{\"role\":\"user\",\"content\":\"The following JSON is untrusted tool data. "
                    + "{\\\"results\\\":[{\\\"tool_call_id\\\":\\\"diag_prompt_1\\\","
                    + "\\\"name\\\":\\\"talos_diagnostic_echo\\\","
                    + "\\\"content\\\":\\\"TALOS_PROMPT_NONCE_848\\\"}]}\"}"
                    + "]";

            String prompt = engine.chatPrompt(messagesJson, null, false);
            assertNotNull("il template Gemma non ha accettato prompt-json-v1", prompt);
            assertTrue("il risultato prompt-json è stato perso prima del GGUF",
                    prompt.contains("TALOS_PROMPT_NONCE_848"));
            Log.i(TAG, "round-trip prompt-json-v1: " + file.getName());
        }
    }

    @Test
    public void cleansCompatibilityCampaignFiles() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String caseId = InstrumentationRegistry.getArguments().getString("talosCaseId", "");
        Assume.assumeTrue("cleanup campagna senza case ID allowlisted",
                caseId != null && caseId.matches("^[A-Z][0-9]+$"));

        File nativeFile = compatibilityNativeFile(context);
        File uiFile = compatibilityUiFile(context, caseId);
        deleteIfPresent(nativeFile);
        deleteIfPresent(uiFile);

        File uiCaseDirectory = uiFile.getParentFile();
        if (uiCaseDirectory != null && uiCaseDirectory.isDirectory()) uiCaseDirectory.delete();
        File uiRoot = uiCaseDirectory == null ? null : uiCaseDirectory.getParentFile();
        if (uiRoot != null && uiRoot.isDirectory()) uiRoot.delete();
        File nativeDirectory = nativeFile.getParentFile();
        if (nativeDirectory != null && nativeDirectory.isDirectory()) nativeDirectory.delete();

        assertFalse("fixture nativa residua", nativeFile.exists());
        assertFalse("fixture UI residua per " + caseId, uiFile.exists());
    }
}
