package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import kotlin.math.abs
import kotlin.math.sqrt
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Owner reported audible micro-stutter listening to real streaming playback
 * (`TalosVoiceHostStreamingInstrumentedTest`, real device speaker). This
 * quantified it before touching any code - is there really a discontinuity
 * at chunk boundaries (every `downsample_rate`=3840 samples, ~80ms), and how
 * big is it compared to the reference (`decode_full`, no artificial
 * boundaries) at the same point in time. Writes both reconstructions to WAV
 * so they can be pulled and listened to directly, too.
 *
 * The finding: boundary deltas measured SMOOTHER than within-chunk deltas
 * (ratio 0.82), not rougher - the PCM itself has no artificial discontinuity
 * even at batch=1. The real cause turned out to be real `AudioTrack`
 * underruns (`TalosMossCodecStreamBatchSizeDiagnosticTest`,
 * `TalosVoiceHost.resolveFrameBudget`), not a decode-boundary artifact. Kept
 * as a regression guard for the thing it actually measures well: a codec
 * change that DID introduce a boundary click would show up here as a ratio
 * spike, independent of whatever the playback pipeline is doing.
 */
@RunWith(AndroidJUnit4::class)
class TalosMossCodecStreamStutterDiagnosticTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    @Test
    fun measureBoundaryDiscontinuityInBatchOneStreaming() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val out = File(
            InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null),
            "moss-research-output",
        )

        val tokenizerModel = TalosSentencePieceModel.parse(File(root, "MOSS-TTS-Nano-100M-ONNX/tokenizer.model").readBytes())
        val tokenizer = TalosVoiceBpeTokenizer(tokenizerModel)
        val textTokenIds = tokenizer.encode("Ciao, questo e' un test per sentire se ci sono micro interruzioni nella voce.")

        val runtime = TalosMossRuntime.open(root, cpuThreads = 4)
        try {
            val (audioTokens, cancelled) = runtime.generateAudioTokens(textTokenIds, voice = "Junhao", maxFrames = 96)
            require(!cancelled && audioTokens.isNotEmpty())

            // Reference: decode_full, one call, no artificial chunk boundaries.
            val refFile = File(out, "stutter_reference_full.wav")
            runtime.synthesizePcm16ToFile(textTokenIds, refFile, voice = "Junhao", maxFrames = 96, seed = 777L)
            val referenceMono = readWavPcm16AsFloat(refFile)

            // Candidate: batch=1 streaming, exactly what the real player receives per write().
            val stream = runtime.openCodecStream()
            val streamedInterleaved = ArrayList<Float>()
            val boundarySampleIndices = ArrayList<Int>() // index into streamedInterleaved (mono-equivalent sample count) where a new chunk started
            try {
                for (frame in audioTokens) {
                    val decoded = stream.runFrames(listOf(frame)) ?: continue
                    boundarySampleIndices.add(streamedInterleaved.size / 2) // interleaved stereo -> mono sample index
                    for (v in decoded.interleavedPcm) streamedInterleaved.add(v)
                }
            } finally {
                stream.close()
            }
            // Down-mix to mono for boundary analysis and for a comparable WAV.
            val streamedMono = FloatArray(streamedInterleaved.size / 2) { i -> (streamedInterleaved[i * 2] + streamedInterleaved[i * 2 + 1]) / 2f }
            writeWavMono16(streamedMono, runtime.sampleRate, File(out, "stutter_streaming_batch1.wav"))

            // Baseline: typical sample-to-sample delta WITHIN a chunk (excludes the boundary sample itself).
            val withinChunkDeltas = ArrayList<Float>()
            val boundaryDeltas = ArrayList<Float>()
            val boundarySet = boundarySampleIndices.toHashSet()
            for (i in 1 until streamedMono.size) {
                val delta = abs(streamedMono[i] - streamedMono[i - 1])
                if (boundarySet.contains(i)) boundaryDeltas.add(delta) else withinChunkDeltas.add(delta)
            }
            fun rms(xs: List<Float>): Double = if (xs.isEmpty()) 0.0 else sqrt(xs.sumOf { (it * it).toDouble() } / xs.size)
            fun max(xs: List<Float>): Float = xs.maxOrNull() ?: 0f

            val withinRms = rms(withinChunkDeltas)
            val boundaryRms = rms(boundaryDeltas)
            val withinMax = max(withinChunkDeltas)
            val boundaryMax = max(boundaryDeltas)

            // Same analysis on the reference, at the SAME nominal boundary
            // positions (frame count differs slightly if lengths differ, so
            // clamp to the shorter of the two).
            val n = minOf(referenceMono.size, streamedMono.size)
            val refWithin = ArrayList<Float>()
            val refAtBoundaryPositions = ArrayList<Float>()
            for (i in 1 until n) {
                val delta = abs(referenceMono[i] - referenceMono[i - 1])
                if (boundarySet.contains(i)) refAtBoundaryPositions.add(delta) else refWithin.add(delta)
            }

            val boundaryToWithinRatio = if (withinRms > 0) boundaryRms / withinRms else -1.0
            android.util.Log.i(
                "TalosStutterDiag",
                "OK frames=${audioTokens.size} boundaries=${boundarySampleIndices.size} streamedSamples=${streamedMono.size} refSamples=${referenceMono.size} " +
                    "within_rms=$withinRms within_max=$withinMax boundary_rms=$boundaryRms boundary_max=$boundaryMax " +
                    "boundary_to_within_ratio=$boundaryToWithinRatio " +
                    "ref_within_rms=${rms(refWithin)} ref_at_boundary_positions_rms=${rms(refAtBoundaryPositions)} " +
                    "streaming_wav=${File(out, "stutter_streaming_batch1.wav").absolutePath} reference_wav=${refFile.absolutePath}",
            )
            // Measured 0.82 (boundaries slightly SMOOTHER than within-chunk
            // deltas). 2.0 is a loose ceiling - a real per-boundary click
            // would spike this well past "comparable to the rest of the
            // signal", not creep a few percent.
            assertTrue("chunk boundaries must not be measurably rougher than within-chunk audio, got ratio=$boundaryToWithinRatio", boundaryToWithinRatio in 0.0..2.0)
        } finally {
            runtime.close()
        }
    }

    private fun readWavPcm16AsFloat(file: File): FloatArray {
        val bytes = file.readBytes()
        val dataStart = 44
        val sampleCount = (bytes.size - dataStart) / 2
        return FloatArray(sampleCount) { i ->
            val lo = bytes[dataStart + i * 2].toInt() and 0xFF
            val hi = bytes[dataStart + i * 2 + 1].toInt()
            ((hi shl 8) or lo) / 32768f
        }
    }

    private fun writeWavMono16(samples: FloatArray, sampleRate: Int, outputFile: File) {
        outputFile.parentFile?.mkdirs()
        val dataSize = samples.size * 2
        val buffer = java.nio.ByteBuffer.allocate(44 + dataSize).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        buffer.put("RIFF".toByteArray(Charsets.US_ASCII)); buffer.putInt(36 + dataSize)
        buffer.put("WAVE".toByteArray(Charsets.US_ASCII)); buffer.put("fmt ".toByteArray(Charsets.US_ASCII))
        buffer.putInt(16); buffer.putShort(1); buffer.putShort(1)
        buffer.putInt(sampleRate); buffer.putInt(sampleRate * 2); buffer.putShort(2); buffer.putShort(16)
        buffer.put("data".toByteArray(Charsets.US_ASCII)); buffer.putInt(dataSize)
        for (s in samples) buffer.putShort((s.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
        outputFile.writeBytes(buffer.array())
    }
}
