package ai.talos;

import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.Test;

/**
 * GRAM-01 (Pad, 02/10/2026, Spark-X2.5-4B, banco del punto 4): la grammatica di llama.cpp che vincola le chiamate agli
 * attrezzi ha lanciato {@code std::runtime_error("Unexpected empty grammar stack after accepting piece: ><")} da
 * {@code common_sampler_accept}; nessuno la catturava e l'app è morta con SIGABRT. A monte non si corregge
 * (ggml-org/llama.cpp#29715, chiusa «not planned»). Owner: «Curarlo ora». La cura sta nel nostro JNI: l'eccezione
 * diventa un'eccezione Java, che il plugin già trasforma in TALOS_LLAMA_GENERATION_FAILED (errore onesto con Riprendi).
 */
public class TalosGrammarCrashGuardTest {

    private static String leggi(String percorso) throws java.io.IOException {
        return new String(Files.readAllBytes(new File(percorso).toPath()), StandardCharsets.UTF_8);
    }

    @Test
    public void gram01IlCampionatoreNonFaPiuCadereLApp() throws java.io.IOException {
        String jni = leggi("src/main/cpp/talos_llama_jni.cpp");
        int inizio = jni.indexOf("Java_ai_talos_TalosLlamaNative_nativeGenerate(");
        String generate = jni.substring(inizio, jni.indexOf("\n}\n", inizio));
        int campiona = generate.indexOf("common_sampler_sample(session->sampler");
        assertTrue("manca il campionamento", campiona > 0);
        String attorno = generate.substring(Math.max(0, campiona - 600), Math.min(generate.length(), campiona + 1200));
        assertTrue("il campionamento non è protetto", attorno.contains("try {"));
        assertTrue("l'eccezione della grammatica non è catturata", attorno.contains("catch (const std::exception & grammatica)"));
        assertTrue("l'errore non arriva a Java", generate.contains("TALOS_LLAMA_GRAMMAR_FAILED"));
        assertTrue(generate.contains("ThrowNew("));

        // Anche il percorso speculativo (solo ricerca) accetta token sulla stessa grammatica.
        int spec = jni.indexOf("common_sampler_sample_and_accept_n(");
        String specAttorno = jni.substring(Math.max(0, spec - 400), spec + 400);
        assertTrue("percorso speculativo non protetto", specAttorno.contains("try {"));

        // Il thread della misura (TalosLlamaEngine.run) non deve lasciar scappare l'eccezione Java.
        String motore = leggi("src/main/java/ai/talos/TalosLlamaEngine.java");
        int run = motore.indexOf("\"talos-llama-run\"");
        assertTrue(motore.substring(Math.max(0, run - 500), run).contains("catch (IllegalStateException grammatica)"));
    }
}
