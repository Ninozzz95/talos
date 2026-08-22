package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Fase 4 block 2: [TalosVoiceHost.submitSpeakStreamingWithReference], the
 * door [TalosNeuralVoicePlugin.speak]/`previewEnrollmentProfile` actually
 * call for a personal profile - and [TalosVoiceHost.get], the process-wide
 * singleton the plugin uses instead of constructing its own instance.
 *
 * The streaming path itself was factored out of the already-verified
 * builtin-voice path ([TalosVoiceHostStreamingInstrumentedTest]) into a
 * shared `driveStreamingSynthesis` - this class is the proof that the
 * refactor produced a second working caller, not a proof that the first
 * caller still works (that is what re-running the existing suite alongside
 * this one is for).
 */
@RunWith(AndroidJUnit4::class)
class TalosVoiceHostReferenceStreamingInstrumentedTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    /** Same technique as [TalosVoiceEnrollmentInstrumentedTest]: decode a builtin voice's own reference, re-encode it - no live human voice needed to exercise the reference-based path honestly. */
    private fun realPromptAudioCodes(root: File, runtime: TalosMossRuntime): List<IntArray> {
        val manifest = TalosMossManifest.fromJson(TalosMossManifest.readJson(TalosMossManifest.resolveManifestPath(root)))
        val builtin = manifest.builtinVoices.firstOrNull { it.promptAudioCodes.isNotEmpty() }
            ?: error("no builtin voice with prompt_audio_codes in the manifest - cannot run this test")
        val stream = runtime.openCodecStream()
        val decoded = try {
            stream.runFrames(builtin.promptAudioCodes) ?: error("decode of builtin reference produced no audio")
        } finally {
            stream.close()
        }
        val channels = runtime.channels
        val mono = FloatArray(decoded.samples) { i ->
            var sum = 0f
            for (c in 0 until channels) sum += decoded.interleavedPcm[i * channels + c]
            sum / channels
        }
        return runtime.encodeReferenceAudio(mono, runtime.sampleRate)
    }

    @Test
    fun endToEndReferenceStreamingPlaysAndDrainsWithZeroUnderruns() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val host = TalosVoiceHost(root, cpuThreads = 4)
        try {
            val warmupRuntime = TalosMossRuntime.open(root, cpuThreads = 4)
            val promptAudioCodes = try {
                realPromptAudioCodes(root, warmupRuntime)
            } finally {
                warmupRuntime.close()
            }

            val result = host.speakStreamingWithReferenceBlocking(
                text = "Ciao, questo e' un test dello streaming con un riferimento vocale invece che con una voce incorporata per nome, con una frase abbastanza lunga da attraversare diversi secondi di riproduzione reale.",
                promptAudioCodes = promptAudioCodes,
                maxFrames = 200,
            )
            assertTrue("streaming synthesis with a reference must not report cancelled", !result.cancelled)
            assertTrue("must have produced at least one audio batch", result.ttfaMs != null)
            assertEquals("no write should have needed the dead-track recovery path", 0, result.underruns)
            assertTrue("playback must fully drain within the bound", result.drainedWithinTimeout)
            assertEquals(
                "AudioTrack itself must report zero real underruns for the reference path too",
                0,
                result.hardwareUnderruns,
            )
        } finally {
            host.close()
        }
    }

    /** Mirrors [TalosVoiceHostStreamingInstrumentedTest.cancelMidStreamStopsPlaybackNotJustGeneration] for the reference path - the shared `driveStreamingSynthesis` code must honor cancel the same way regardless of which generation method fed it frames. */
    @Test
    fun cancelMidReferenceStreamStopsPlaybackAndHostStaysUsable() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val host = TalosVoiceHost(root, cpuThreads = 4)
        try {
            val warmupRuntime = TalosMossRuntime.open(root, cpuThreads = 4)
            val promptAudioCodes = try {
                realPromptAudioCodes(root, warmupRuntime)
            } finally {
                warmupRuntime.close()
            }

            val warmup = host.speakStreamingWithReferenceBlocking(text = "Ciao.", promptAudioCodes = promptAudioCodes, maxFrames = 16)
            assertTrue("warm-up utterance must complete normally", !warmup.cancelled)

            val future = CompletableFuture<TalosVoiceStreamResult>()
            host.submitSpeakStreamingWithReference(
                text = "Questa e' una frase deliberatamente lunga, con molte parole, cosi' da lasciare il tempo di annullarla mentre sta ancora parlando e non dopo che ha gia' finito.",
                promptAudioCodes = promptAudioCodes,
                maxFrames = 375,
            ) { result ->
                result.fold(onSuccess = { future.complete(it) }, onFailure = { future.completeExceptionally(it) })
            }

            Thread.sleep(300)
            host.cancel()
            val result = future.get(30, TimeUnit.SECONDS)
            assertTrue("expected cancelled=true", result.cancelled)

            val afterCancel = host.speakStreamingWithReferenceBlocking(text = "Ciao.", promptAudioCodes = promptAudioCodes, maxFrames = 32)
            assertFalse("model and player must still work after a mid-stream cancel", afterCancel.cancelled)
            assertTrue(afterCancel.drainedWithinTimeout)
        } finally {
            host.close()
        }
    }

    @Test
    fun getReturnsTheSameProcessWideInstanceAcrossCalls() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        TalosVoiceHost.resetForTests()
        try {
            val first = TalosVoiceHost.get(context)
            val second = TalosVoiceHost.get(context)
            assertSame("get() must return the same instance, not a new host per call", first, second)
            assertNotNull(first)
        } finally {
            TalosVoiceHost.resetForTests()
        }
    }
}
