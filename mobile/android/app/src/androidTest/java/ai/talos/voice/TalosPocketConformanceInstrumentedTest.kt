package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketCancellation
import ai.talos.voice.pocket.TalosPocketConditioning
import ai.talos.voice.pocket.TalosPocketConfig
import ai.talos.voice.pocket.TalosPocketFrame
import ai.talos.voice.pocket.TalosPocketOrtRuntime
import ai.talos.voice.pocket.TalosPocketPipelineTerminal
import ai.talos.voice.pocket.TalosPocketStageMetric
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith


@RunWith(AndroidJUnit4::class)
class TalosPocketConformanceInstrumentedTest {
    @Test
    fun temperatureZeroPcmMatchesThePinnedHostOracleFromIdenticalConditioning() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = TalosPocketModelManager.modelRoot(requireNotNull(context.getExternalFilesDir(null)))
        val manifest = TalosPocketModelManifest.fromJson(
            JSONObject(context.assets.open(MANIFEST_ASSET).bufferedReader().use { it.readText() }),
        ).requirePinnedBundle()
        val status = TalosPocketModelManager.validate(root, manifest)
        assertTrue("Pocket model must be hash-verified before conformance: $status", status is TalosPocketModelStatus.Ready)
        val conditioningValues = readPinnedFloats(
            File(root, ORACLE_CONDITIONING),
            EXPECTED_CONDITIONING_FLOATS,
            EXPECTED_CONDITIONING_SHA256,
        )
        val expectedPcm = readPinnedFloats(
            File(root, ORACLE_PCM),
            EXPECTED_PCM_FLOATS,
            EXPECTED_PCM_SHA256,
        )
        val actualChunks = mutableListOf<FloatArray>()
        val stages = mutableListOf<TalosPocketStageMetric>()
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = root,
            cpuThreads = 4,
            config = TalosPocketConfig(
                temperature = 0f,
                lsdSteps = 1,
                queueCapacityFrames = 24,
                firstDecodeFrames = 15,
                regularDecodeFrames = 15,
                hardMaxFramesPerSentence = 24,
            ),
        )
        try {
            val result = runtime.synthesize(
                source = PUBLIC_SMOKE_TEXT,
                conditioning = TalosPocketConditioning.create(
                    longArrayOf(1, EXPECTED_CONDITIONING_FRAMES.toLong(), 1_024),
                    conditioningValues,
                ),
                maxFramesPerSentence = 24,
                seed = 19L,
                cancellation = TalosPocketCancellation(),
                callback = object : TalosPocketCallback {
                    override fun onStage(metric: TalosPocketStageMetric) {
                        stages += metric
                    }

                    override fun onPcm(frame: TalosPocketFrame): Boolean {
                        actualChunks += frame.pcmFloatMono.copyOf()
                        return true
                    }
                },
            )
            val actualPcm = FloatArray(actualChunks.sumOf(FloatArray::size))
            var cursor = 0
            actualChunks.forEach { chunk ->
                chunk.copyInto(actualPcm, cursor)
                cursor += chunk.size
            }

            assertEquals(TalosPocketPipelineTerminal.DONE, result.terminal)
            assertEquals(24, result.generatedFrames)
            assertEquals(expectedPcm.size, actualPcm.size)
            var maxAbsoluteError = 0.0
            var squareError = 0.0
            for (index in expectedPcm.indices) {
                val error = kotlin.math.abs(actualPcm[index] - expectedPcm[index]).toDouble()
                maxAbsoluteError = maxOf(maxAbsoluteError, error)
                squareError += error * error
            }
            val rootMeanSquareError = kotlin.math.sqrt(squareError / expectedPcm.size)
            assertTrue(
                "Pocket PCM max error $maxAbsoluteError exceeds $MAX_ABSOLUTE_ERROR",
                maxAbsoluteError <= MAX_ABSOLUTE_ERROR,
            )
            assertTrue(
                "Pocket PCM RMSE $rootMeanSquareError exceeds $MAX_RMSE",
                rootMeanSquareError <= MAX_RMSE,
            )
            assertEquals(listOf(15, 9), actualChunks.map { it.size / 1_920 })
            assertTrue(stages.any { it.stage == "flow_main_ar" })
            assertTrue(stages.any { it.stage == "mimi_decoder" && it.inputFrames == 15 })
            assertTrue(stages.any { it.stage == "mimi_decoder" && it.inputFrames == 9 })
            writeEvidence(
                File(requireNotNull(context.getExternalFilesDir(null)), "research/voice/pocket-conformance.json"),
                JSONObject()
                    .put("schemaVersion", 1)
                    .put("modelRevision", TalosPocketModelManifest.REVISION)
                    .put("fixtureId", "smoke-short")
                    .put("temperature", 0.0)
                    .put("seed", 19)
                    .put("conditioningSha256", EXPECTED_CONDITIONING_SHA256)
                    .put("expectedPcmSha256", EXPECTED_PCM_SHA256)
                    .put("actualPcmSha256", sha256(actualPcm))
                    .put("sampleCount", actualPcm.size)
                    .put("maxAbsoluteError", maxAbsoluteError)
                    .put("rootMeanSquareError", rootMeanSquareError)
                    .put("rtf", result.rtf),
            )
        } finally {
            runtime.close()
        }
    }

    private fun readPinnedFloats(file: File, expectedCount: Int, expectedSha256: String): FloatArray {
        require(file.isFile) { "missing Pocket oracle file: ${file.name}" }
        val bytes = file.readBytes()
        require(bytes.size == expectedCount * Float.SIZE_BYTES) { "Pocket oracle size differs: ${file.name}" }
        require(sha256(bytes) == expectedSha256) { "Pocket oracle sha256 differs: ${file.name}" }
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
        return FloatArray(expectedCount).also(buffer::get).also { values ->
            require(values.all(Float::isFinite)) { "Pocket oracle contains non-finite values: ${file.name}" }
        }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private fun sha256(values: FloatArray): String {
        val bytes = ByteBuffer.allocate(values.size * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        bytes.asFloatBuffer().put(values)
        return sha256(bytes.array())
    }

    private fun writeEvidence(file: File, value: JSONObject) {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, ".${file.name}.${System.nanoTime()}.tmp")
        temporary.writeText(value.toString(2) + "\n", Charsets.UTF_8)
        check(temporary.renameTo(file)) { "could not commit Pocket conformance evidence" }
    }

    private companion object {
        const val MANIFEST_ASSET = "voice/pocket-model-manifest.json"
        const val ORACLE_CONDITIONING = "oracle-conditioning-temp0.f32le"
        const val ORACLE_PCM = "oracle-pcm-temp0.f32le"
        const val EXPECTED_CONDITIONING_FRAMES = 112
        const val EXPECTED_CONDITIONING_FLOATS = EXPECTED_CONDITIONING_FRAMES * 1_024
        const val EXPECTED_PCM_FLOATS = 24 * 1_920
        const val EXPECTED_CONDITIONING_SHA256 = "a9d6f8507dca70928d521e4aad7ac1ae426c78442e24c0e21337586e815f3b6e"
        const val EXPECTED_PCM_SHA256 = "ec8e6b4a01566b6c219d8499c1c7bbdb99ae7075728c717a663f23e04930f5cb"
        const val PUBLIC_SMOKE_TEXT = "Buongiorno, questa è la voce italiana di TALOS."
        const val MAX_ABSOLUTE_ERROR = 0.0001
        const val MAX_RMSE = 0.00002
    }
}
