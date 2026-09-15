package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 91-103 real `AudioTrack` underruns on a multi-second streamed utterance
 * survived a 4x bigger player buffer almost unchanged (103->91) - a buffer
 * only delays a one-time startup shortfall, it cannot fix a SUSTAINED one.
 * That pointed at `decode_step`'s own per-frame cost at batch=1, not the
 * player: measured RTF 0.939 for the codec ALONE at batch=1, before adding
 * TTS generation's own ~0.6 on top - a combined RTF over 1.5, not jitter, a
 * sustained deficit. This is what led to [TalosVoiceHost]'s batch floor of 8
 * (`resolveFrameBudget`) and the player's 8x buffer - both chosen from these
 * numbers, not guessed.
 *
 * Kept as a regression guard, not just a one-time measurement: if a future
 * model/runtime change makes batch=8 as slow as batch=1 measured here, the
 * assertion below catches it before it reaches a real underrun count.
 */
@RunWith(AndroidJUnit4::class)
class TalosMossCodecStreamBatchSizeDiagnosticTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    @Test
    fun measureRealTimeFactorAtSeveralBatchSizes() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))

        val tokenizerModel = TalosSentencePieceModel.parse(File(root, "MOSS-TTS-Nano-100M-ONNX/tokenizer.model").readBytes())
        val tokenizer = TalosVoiceBpeTokenizer(tokenizerModel)
        val textTokenIds = tokenizer.encode(
            "Ciao, questo e' un test abbastanza lungo per generare molti frame audio e misurare con precisione " +
                "quanto costa decodificare il codec a diverse dimensioni di gruppo.",
        )

        val runtime = TalosMossRuntime.open(root, cpuThreads = 4)
        try {
            val (audioTokens, cancelled) = runtime.generateAudioTokens(textTokenIds, voice = "Junhao", maxFrames = 160)
            require(!cancelled && audioTokens.size >= 32) { "need enough frames to test batch=16, got ${audioTokens.size}" }

            for (batchSize in listOf(1, 2, 4, 8, 16)) {
                val stream = runtime.openCodecStream()
                var totalSamples = 0
                val startNanos = System.nanoTime()
                try {
                    var i = 0
                    while (i < audioTokens.size) {
                        val batch = audioTokens.subList(i, minOf(i + batchSize, audioTokens.size))
                        val decoded = stream.runFrames(batch)
                        if (decoded != null) totalSamples += decoded.samples
                        i += batchSize
                    }
                } finally {
                    stream.close()
                }
                val elapsedMs = (System.nanoTime() - startNanos) / 1_000_000
                val audioMs = totalSamples.toDouble() / runtime.sampleRate * 1000.0
                val rtf = elapsedMs / audioMs
                android.util.Log.i(
                    "TalosBatchSizeDiag",
                    "batchSize=$batchSize frames=${audioTokens.size} elapsedMs=$elapsedMs audioMs=${"%.1f".format(audioMs)} rtf=${"%.3f".format(rtf)}",
                )
                if (batchSize == 8) {
                    // TalosVoiceHost.resolveFrameBudget's steady-state floor.
                    // Combined with TTS generation's own ~0.6 RTF this leaves
                    // real margin under 1.0; 0.5 is a loose ceiling that
                    // would still catch a real regression (measured 0.204).
                    assertTrue("codec decode_step at batch=8 must stay well under real-time (measured 0.204, ceiling 0.5), got $rtf", rtf < 0.5)
                }
            }
        } finally {
            runtime.close()
        }
    }
}
