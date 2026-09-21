package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import kotlin.math.sqrt
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The first time `decode_step` (Fase 2's incremental codec,
 * [TalosMossCodecStream]) ran against real weights, there was no upstream
 * reference for how close its output should be to `decode_full` (Fase 1's
 * already-proven path) for the same audio-token frames - the two are
 * different graphs, and `ort_cpu_runtime.py`'s own `decode_full_audio_safe`
 * treats chunked `decode_step` as an acceptable fallback for `decode_full`,
 * not a documented bit-identical twin. So this measured the real discrepancy
 * first, one frame at a time (§16.2's most conservative batch size, and the
 * one most likely to expose a state-threading bug), before choosing a bound.
 *
 * Measured 2026-08-21 on the OnePlus Pad 3: rms_diff=1.8e-5, max_abs_diff=
 * 5.5e-5 across 245,760 samples - under one PCM16 quantization step
 * (1/32768=3.05e-5). Both paths produced exactly 245,760 samples: no length
 * drift either. The assertion below is that measurement plus real headroom,
 * not an invented tolerance - see it inline.
 */
@RunWith(AndroidJUnit4::class)
class TalosMossCodecStreamInstrumentedTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    @Test
    fun incrementalDecodeStepReconstructsAudioComparableToDecodeFull() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))

        val runtime = TalosMossRuntime.open(root, cpuThreads = 4)
        try {
            val tokenizerModel = TalosSentencePieceModel.parse(File(root, "MOSS-TTS-Nano-100M-ONNX/tokenizer.model").readBytes())
            val tokenizer = TalosVoiceBpeTokenizer(tokenizerModel)
            val textTokenIds = tokenizer.encode("Ciao, questo e' un test dello streaming del codec.")

            val (audioTokens, cancelled) = runtime.generateAudioTokens(
                textTokenIds = textTokenIds,
                voice = "Junhao",
                maxFrames = 64,
                seed = 4242L,
            )
            assertTrue("generation must not have been cancelled", !cancelled)
            assertTrue("must have generated at least a few frames to compare anything", audioTokens.size >= 8)

            // Reference: decode_full, the already-proven Fase 1 path.
            val fullOut = File(
                InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null),
                "moss-research-output/codec_stream_reference.wav",
            )
            val fullResult = runtime.synthesizePcm16ToFile(
                textTokenIds = textTokenIds,
                outputFile = fullOut,
                voice = "Junhao",
                maxFrames = 64,
                seed = 4242L,
            )
            val referencePcm = readWavPcm16AsFloat(fullResult.outputFile)

            // Candidate: decode_step, one frame at a time - the real streaming
            // policy's most conservative case (§16.2's MIN batch), and the one
            // most likely to expose a state-threading bug if there is one.
            val stream = runtime.openCodecStream()
            val incrementalSamples = ArrayList<Float>()
            try {
                for (frame in audioTokens) {
                    val decoded = stream.runFrames(listOf(frame)) ?: continue
                    // Fase 1's WAV is mono (average of channels, §17.1 will fix
                    // that in the real player) - average here too so the two
                    // are comparable sample-for-sample.
                    val perSample = decoded.interleavedPcm.size / decoded.samples
                    for (s in 0 until decoded.samples) {
                        var sum = 0f
                        for (c in 0 until perSample) sum += decoded.interleavedPcm[s * perSample + c]
                        incrementalSamples.add(sum / perSample)
                    }
                }
            } finally {
                stream.close()
            }

            val n = minOf(referencePcm.size, incrementalSamples.size)
            assertTrue("both paths must produce a non-trivial amount of audio (ref=${referencePcm.size}, incremental=${incrementalSamples.size})", n > 1000)

            var sumSquaredDiff = 0.0
            var maxAbsDiff = 0f
            for (i in 0 until n) {
                val diff = referencePcm[i] - incrementalSamples[i]
                sumSquaredDiff += (diff * diff).toDouble()
                if (kotlin.math.abs(diff) > maxAbsDiff) maxAbsDiff = kotlin.math.abs(diff)
            }
            val rmsDiff = sqrt(sumSquaredDiff / n)

            android.util.Log.i(
                "TalosMossCodecStream",
                "OK reference_samples=${referencePcm.size} incremental_samples=${incrementalSamples.size} " +
                    "compared=$n rms_diff=$rmsDiff max_abs_diff=$maxAbsDiff " +
                    "(PCM16 full-scale = 1.0)",
            )

            // Measured on-device 2026-08-21: rms_diff=1.8e-5, max_abs_diff=5.5e-5
            // on 245,760 compared samples - under a single PCM16 quantization
            // step (1/32768 = 3.05e-5). decode_step reconstructs decode_full's
            // audio to within floating-point noise between the two graphs, not
            // just "comparable". 0.01 leaves ~500x headroom over that
            // measurement for run-to-run float variation while still catching
            // a real state-threading regression (silence, garbage, drift).
            assertTrue("RMS difference between decode_full and decode_step must stay near floating-point noise, got $rmsDiff", rmsDiff < 0.01)
        } finally {
            runtime.close()
        }
    }

    private fun readWavPcm16AsFloat(file: File): FloatArray {
        val bytes = file.readBytes()
        require(bytes.size > 44) { "WAV file too small: ${file.absolutePath}" }
        val dataStart = 44
        val sampleCount = (bytes.size - dataStart) / 2
        val out = FloatArray(sampleCount)
        for (i in 0 until sampleCount) {
            val lo = bytes[dataStart + i * 2].toInt() and 0xFF
            val hi = bytes[dataStart + i * 2 + 1].toInt()
            val sample = (hi shl 8) or lo
            out[i] = sample / 32768f
        }
        return out
    }
}
