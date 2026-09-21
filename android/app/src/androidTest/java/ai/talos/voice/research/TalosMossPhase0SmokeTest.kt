package ai.talos.voice.research

import android.app.ActivityManager
import android.content.Context
import android.os.Debug
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * ⛔⛔ FASE 0, 0.1.18 — «riprodurre l'esempio ufficiale sui NOSTRI dispositivi,
 * compilare la logica dell'esempio contro ORT 1.29.0, raccogliere una
 * baseline CPU/memoria». Cancello d'uscita del blueprint §39: «la sintesi
 * Kotlin è deterministica/riproducibile e non serve Python a runtime».
 *
 * ⛔ SOLO RICERCA — non è `TalosMossRuntime` (Fase 1). Nessun modello viene
 * spedito da questo test: legge dai file già pushati a mano sotto
 * `getExternalFilesDir()/moss/`, con
 *
 *     adb push MOSS-TTS-Nano-100M-ONNX/          .../files/moss/MOSS-TTS-Nano-100M-ONNX/
 *     adb push MOSS-Audio-Tokenizer-Nano-ONNX/   .../files/moss/MOSS-Audio-Tokenizer-Nano-ONNX/
 *
 * Se assenti, il test si salta con `assumeTrue` — un salto non è un verde,
 * e lo dice per nome (stessa regola già in
 * `TalosLlamaEngineDeviceTest`/`talos-probe.gguf`).
 */
@RunWith(AndroidJUnit4::class)
class TalosMossPhase0SmokeTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return File(context.getExternalFilesDir(null), "moss")
    }

    private fun modelsPresent(): Boolean {
        val root = modelRoot()
        return File(root, "MOSS-TTS-Nano-100M-ONNX/browser_poc_manifest.json").isFile &&
            File(root, "MOSS-Audio-Tokenizer-Nano-ONNX/codec_browser_onnx_meta.json").isFile
    }

    @Test
    fun theOfficialSampleAlgorithmProducesRealAudioOnOrt1_29() {
        assumeTrue(
            "modelli MOSS assenti: spingili in ${modelRoot().absolutePath}",
            modelsPresent(),
        )
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val outputDir = File(context.getExternalFilesDir(null), "moss-research-output")

        // Baseline di memoria PRIMA di caricare quattro sessioni ORT — Fase 0
        // chiede una baseline CPU/memoria, non solo "gira".
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memBefore = Debug.MemoryInfo().also { Debug.getMemoryInfo(it) }
        val pssBeforeKb = memBefore.totalPss

        val engine = TalosMossDemoEngine(modelRoot(), outputDir, cpuThreads = 4)
        val result = try {
            engine.synthesize(DemoTokenIds.ENGLISH, voice = "Junhao", maxFrames = 160, seed = 1234L)
        } finally {
            // Nessuna sessione chiusa mentre `run()` è attivo: qui non lo è
            // (il synthesize è già tornato), quindi close() è sicura — la
            // stessa regola R7 del blueprint, verificata dal lato "quando".
        }

        val memAfter = Debug.MemoryInfo().also { Debug.getMemoryInfo(it) }
        engine.close()

        assertTrue("il file WAV deve esistere", result.outputFile.isFile)
        assertTrue("il WAV deve pesare più della sola intestazione (44 byte)", result.outputFile.length() > 44)
        assertTrue("deve aver generato almeno un frame audio", result.generatedFrames > 0)
        assertEquals("la frequenza di campionamento viene dal manifest, non da una costante scritta a mano",
            48000, result.sampleRate)
        assertTrue("la sintesi deve produrre una durata udibile", result.durationMs > 0)

        android.util.Log.i(
            "TalosMossPhase0",
            "OK — frame=${result.generatedFrames} durata=${result.durationMs}ms " +
                "tempo=${result.elapsedMs}ms pss_prima=${pssBeforeKb}KB pss_dopo=${memAfter.totalPss}KB " +
                "wav=${result.outputFile.absolutePath}",
        )
    }

    /**
     * ⛔⛔ Cancello del blueprint: «deterministica/riproducibile». Non basta che
     * generi audio — deve generare LO STESSO audio a parità di seme. Provato
     * anche al contrario più sotto: semi diversi devono differire.
     */
    @Test
    fun sameSeedProducesByteIdenticalAudio() {
        assumeTrue(
            "modelli MOSS assenti: spingili in ${modelRoot().absolutePath}",
            modelsPresent(),
        )
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val outputDir = File(context.getExternalFilesDir(null), "moss-research-output")

        val engine = TalosMossDemoEngine(modelRoot(), outputDir, cpuThreads = 4)
        val first: SynthesisResult
        val second: SynthesisResult
        try {
            first = engine.synthesize(
                DemoTokenIds.ENGLISH,
                outputFile = File(outputDir, "determinism_a.wav"),
                maxFrames = 48,
                seed = 777L,
            )
            second = engine.synthesize(
                DemoTokenIds.ENGLISH,
                outputFile = File(outputDir, "determinism_b.wav"),
                maxFrames = 48,
                seed = 777L,
            )
        } finally {
            engine.close()
        }

        assertEquals("stesso seme, stesso numero di frame", first.generatedFrames, second.generatedFrames)
        val bytesA = first.outputFile.readBytes()
        val bytesB = second.outputFile.readBytes()
        assertTrue("stesso seme deve produrre byte IDENTICI, non solo simili",
            bytesA.contentEquals(bytesB))
    }

    /**
     * ⛔ Il verso contrario del test sopra: se DUE semi diversi producessero
     * comunque lo stesso audio, la determinismo del test precedente sarebbe
     * un artefatto (per esempio un seme mai davvero usato), non una prova.
     */
    @Test
    fun differentSeedsProduceDifferentAudio() {
        assumeTrue(
            "modelli MOSS assenti: spingili in ${modelRoot().absolutePath}",
            modelsPresent(),
        )
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val outputDir = File(context.getExternalFilesDir(null), "moss-research-output")

        val engine = TalosMossDemoEngine(modelRoot(), outputDir, cpuThreads = 4)
        val first: SynthesisResult
        val second: SynthesisResult
        try {
            first = engine.synthesize(
                DemoTokenIds.ENGLISH,
                outputFile = File(outputDir, "seed_a.wav"),
                maxFrames = 48,
                seed = 1L,
            )
            second = engine.synthesize(
                DemoTokenIds.ENGLISH,
                outputFile = File(outputDir, "seed_b.wav"),
                maxFrames = 48,
                seed = 2L,
            )
        } finally {
            engine.close()
        }

        val bytesA = first.outputFile.readBytes()
        val bytesB = second.outputFile.readBytes()
        assertTrue("semi diversi devono produrre audio diverso — altrimenti il test di determinismo non prova niente",
            !bytesA.contentEquals(bytesB))
    }
}

/** "Welcome to the Android ONNX Runtime demo." — dal demo ufficiale, DemoPrompts.kt. */
private object DemoTokenIds {
    val ENGLISH = intArrayOf(
        5322, 300, 280, 351, 391, 373, 543, 10505,
        10505, 11543, 562, 4723, 578, 2140, 10360, 10380,
    )
}
