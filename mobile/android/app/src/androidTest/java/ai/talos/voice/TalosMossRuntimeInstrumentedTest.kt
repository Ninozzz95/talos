package ai.talos.voice

import ai.talos.voice.research.TalosMossDemoEngine
import android.app.ActivityManager
import android.content.Context
import android.os.Debug
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Fase 1 exit gate (blueprint §39): "same output structure as upstream
 * Android example, with TALOS ownership/lifecycle discipline." Three things
 * this proves, none of them provable off-device:
 *
 *  1. [TalosMossRuntime] through [TalosVoiceHost] - the real door, not the
 *     runtime constructed directly - produces byte-identical audio to the
 *     already-measured Phase 0 engine, given the same token ids, voice, and
 *     seed. The productionization (§15.4's state split, the owner-lane
 *     wrapping) changed structure, not output.
 *  2. Text now goes through [TalosVoiceTokenizer], the P0 gap Phase 0 left
 *     open on purpose - end to end, a caller hands over a Kotlin `String`,
 *     not pre-tokenized ids.
 *  3. Cancelling mid-generation (§14) unwinds that one generation and
 *     leaves the model sessions alive - proven by successfully speaking
 *     again right after, on the same host.
 *
 * ⛔ Needs the real MOSS artifacts pushed to `externalFilesDir/moss/…` -
 * absent means skipped, named, same `assumeTrue` convention as
 * `TalosMossPhase0SmokeTest`. Run via
 * `node scripts/research/run-device-tests.mjs`, never
 * `connectedDebugAndroidTest` - see `connectedandroidtest-disinstalla-e-porta-via-i-modelli`.
 */
@RunWith(AndroidJUnit4::class)
class TalosMossRuntimeInstrumentedTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    private fun outputDir(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return File(context.getExternalFilesDir(null), "moss-research-output")
    }

    @Test
    fun productionRuntimeMatchesPhase0EngineByteForByteOnTheSameInputs() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val out = outputDir()

        // Real end-to-end tokenization, not the Phase 0 demo's hardcoded ids -
        // this is the actual new thing Fase 1 adds, exercised here rather
        // than only in the tokenizer's own test.
        val tokenizerModel = TalosSentencePieceModel.parse(File(root, "MOSS-TTS-Nano-100M-ONNX/tokenizer.model").readBytes())
        val tokenizer = TalosVoiceBpeTokenizer(tokenizerModel)
        val textTokenIds = tokenizer.encode("Ciao, questo e' un test del motore di sintesi vocale.")
        assertTrue("tokenizer produced no ids", textTokenIds.isNotEmpty())

        val am = InstrumentationRegistry.getInstrumentation().targetContext
            .getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val pssBeforeKb = Debug.MemoryInfo().also { Debug.getMemoryInfo(it) }.totalPss

        // Phase 0's own engine, called directly - the already-measured baseline.
        val phase0Engine = TalosMossDemoEngine(root, out, cpuThreads = 4)
        val phase0Result = try {
            phase0Engine.synthesize(
                textTokenIds,
                outputFile = File(out, "fase1_vs_fase0_baseline.wav"),
                voice = "Junhao",
                maxFrames = 96,
                seed = 4242L,
            )
        } finally {
            phase0Engine.close()
        }

        // The production door: TalosVoiceHost -> TalosMossRuntime, same inputs.
        val host = TalosVoiceHost(root, cpuThreads = 4)
        val productionResult: TalosMossSynthesisResult
        try {
            productionResult = host.speakBlocking(
                text = "Ciao, questo e' un test del motore di sintesi vocale.",
                voice = "Junhao",
                outputFile = File(out, "fase1_production.wav"),
                maxFrames = 96,
                seed = 4242L,
            )
        } finally {
            host.close()
        }

        val pssAfterKb = Debug.MemoryInfo().also { Debug.getMemoryInfo(it) }.totalPss

        assertFalse("production run should not report cancelled", productionResult.cancelled)
        assertEquals("same seed, same frame count", phase0Result.generatedFrames, productionResult.generatedFrames)
        assertEquals("sample rate must come from the manifest for both", phase0Result.sampleRate, productionResult.sampleRate)

        val phase0Bytes = phase0Result.outputFile.readBytes()
        val productionBytes = productionResult.outputFile.readBytes()
        assertTrue(
            "production runtime WAV (${productionBytes.size} B) must byte-match the Phase 0 baseline (${phase0Bytes.size} B)",
            phase0Bytes.contentEquals(productionBytes),
        )

        android.util.Log.i(
            "TalosMossRuntimeFase1",
            "OK frames=${productionResult.generatedFrames} durata=${productionResult.durationMs}ms " +
                "tempo=${productionResult.elapsedMs}ms rtf=${
                    if (productionResult.durationMs > 0) "%.3f".format(productionResult.elapsedMs.toDouble() / productionResult.durationMs) else "n/a"
                } pss_prima=${pssBeforeKb}KB pss_dopo=${pssAfterKb}KB wav=${productionResult.outputFile.absolutePath}",
        )
    }

    /** The contrary case of the byte-match test above: a different seed must not collapse to the same audio. */
    @Test
    fun differentSeedsThroughTheHostProduceDifferentAudio() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val out = outputDir()
        val host = TalosVoiceHost(root, cpuThreads = 4)
        try {
            val a = host.speakBlocking("Un due tre quattro cinque.", "Junhao", File(out, "seed_a.wav"), maxFrames = 48, seed = 1L)
            val b = host.speakBlocking("Un due tre quattro cinque.", "Junhao", File(out, "seed_b.wav"), maxFrames = 48, seed = 2L)
            assertFalse(a.outputFile.readBytes().contentEquals(b.outputFile.readBytes()))
        } finally {
            host.close()
        }
    }

    /**
     * §14's guarantee, proven from the outside: cancelling a generation must
     * not close the model. If it did, the second `speakBlocking` call below
     * would throw (sessions closed) instead of producing real audio.
     */
    @Test
    fun cancelMidGenerationLeavesTheModelUsableForTheNextRequest() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val out = outputDir()
        val host = TalosVoiceHost(root, cpuThreads = 4)
        try {
            val cancelledResult = java.util.concurrent.CompletableFuture<TalosMossSynthesisResult>()
            host.submitSpeak(
                text = "Questa e' una frase abbastanza lunga da lasciare il tempo di annullarla a meta'.",
                voice = "Junhao",
                outputFile = File(out, "cancel_target.wav"),
                maxFrames = 375, // deliberately large, so cancel() below wins the race
                seed = 99L,
            ) { result ->
                result.fold(
                    onSuccess = { cancelledResult.complete(it) },
                    onFailure = { cancelledResult.completeExceptionally(it) },
                )
            }
            host.cancel()
            val result = cancelledResult.get(30, java.util.concurrent.TimeUnit.SECONDS)
            assertTrue("expected the generation to report cancelled=true", result.cancelled)

            // The real proof: sessions are still alive and usable.
            val afterCancel = host.speakBlocking(
                text = "Ciao.",
                voice = "Junhao",
                outputFile = File(out, "after_cancel.wav"),
                maxFrames = 32,
                seed = 5L,
            )
            assertTrue("model must still produce real audio after a cancel", afterCancel.outputFile.length() > 44)
            assertTrue(afterCancel.generatedFrames > 0)
        } finally {
            host.close()
        }
    }
}
