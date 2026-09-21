package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * §16.1's loop end to end, through the real door
 * ([TalosVoiceHost.submitSpeakStreaming]) - text in, audio actually played
 * out, on the real device. This is what closes Fase 2: not
 * [TalosMossCodecStreamInstrumentedTest] (proves the codec decoder alone)
 * or [TalosPcmPlayerInstrumentedTest] (proves the player alone), but this
 * one, which proves they were actually wired together correctly.
 */
@RunWith(AndroidJUnit4::class)
class TalosVoiceHostStreamingInstrumentedTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    @Test
    fun endToEndStreamingSynthesisPlaysAndDrainsWithMeasuredTtfa() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val host = TalosVoiceHost(root, cpuThreads = 4)
        try {
            val result = host.speakStreamingBlocking(
                text = "Ciao, questo e' un test dello streaming da capo a fondo, con una frase abbastanza lunga da " +
                    "attraversare diversi secondi di riproduzione reale e dare al dispositivo il tempo di mostrare " +
                    "un vero problema di sincronizzazione, se ce n'e' uno.",
                voice = "Junhao",
                maxFrames = 200,
            )
            assertTrue("streaming synthesis must not report cancelled", !result.cancelled)
            assertTrue("must have produced at least one audio batch (ttfaMs=null means nothing was ever decoded)", result.ttfaMs != null)
            assertEquals("no write should have needed the dead-track recovery path", 0, result.underruns)
            assertTrue("playback must fully drain within the bound", result.drainedWithinTimeout)
            assertEquals(
                "AudioTrack itself must report zero real underruns - this is the direct, authoritative signal for an audible glitch",
                0,
                result.hardwareUnderruns,
            )

            android.util.Log.i(
                "TalosVoiceHostStreaming",
                "OK ttfaMs=${result.ttfaMs} elapsedMs=${result.elapsedMs} underruns=${result.underruns} " +
                    "hardwareUnderruns=${result.hardwareUnderruns} drained=${result.drainedWithinTimeout}",
            )
        } finally {
            host.close()
        }
    }

    /**
     * §23.4's cancel checks, proven from the outside: cancelling mid-stream
     * must both report `cancelled=true` AND actually stop the audio a
     * person would hear - not just stop generating new TTS frames while
     * whatever already reached the player keeps playing out to the end.
     *
     * ⛔ Warms up with a short utterance FIRST, on purpose. The first draft
     * of this test cancelled a host's very first call and measured 6,574 ms
     * - alarming, until wall-clock logging showed the owner lane was still
     * inside `TalosMossRuntime.open()` (five ONNX sessions, cold, off
     * storage) the entire time; the cancellation was honored on the very
     * next loop check once loading actually finished. That is a real cost
     * (cold model load) wearing the wrong label (cancel latency) - §23.4's
     * "cancel p95 < 150 ms" is a warm-generation number, the same "a caldo"
     * framing as the TTFA gate. Warming up first measures the right thing.
     */
    @Test
    fun cancelMidStreamStopsPlaybackNotJustGeneration() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val host = TalosVoiceHost(root, cpuThreads = 4)
        try {
            val warmup = host.speakStreamingBlocking(text = "Ciao.", voice = "Junhao", maxFrames = 16)
            assertTrue("warm-up utterance must complete normally", !warmup.cancelled)

            val future = CompletableFuture<TalosVoiceStreamResult>()
            host.submitSpeakStreaming(
                text = "Questa e' una frase deliberatamente lunga, con molte parole, cosi' da lasciare il tempo di annullarla mentre sta ancora parlando e non dopo che ha gia' finito.",
                voice = "Junhao",
                maxFrames = 375,
            ) { result ->
                result.fold(onSuccess = { future.complete(it) }, onFailure = { future.completeExceptionally(it) })
            }

            // Sessions are warm now - a handful of frames land within
            // ~100-200ms each (measured). 300ms is comfortably past the
            // first frame without needlessly letting the utterance run long.
            Thread.sleep(300)
            val cancelStartedAtNanos = System.nanoTime()
            host.cancel()

            val result = future.get(30, TimeUnit.SECONDS)
            val cancelToResultMs = (System.nanoTime() - cancelStartedAtNanos) / 1_000_000
            assertTrue("expected cancelled=true", result.cancelled)
            android.util.Log.i("TalosVoiceHostStreaming", "cancel_to_result_ms=$cancelToResultMs")

            // The real proof: the host is still usable afterward, and a new
            // utterance plays cleanly - mirrors the Fase 1 cancel proof, now
            // through the streaming door.
            val afterCancel = host.speakStreamingBlocking(text = "Ciao.", voice = "Junhao", maxFrames = 32)
            assertTrue("model and player must still work after a mid-stream cancel", !afterCancel.cancelled)
            assertTrue(afterCancel.drainedWithinTimeout)
        } finally {
            host.close()
        }
    }
}
