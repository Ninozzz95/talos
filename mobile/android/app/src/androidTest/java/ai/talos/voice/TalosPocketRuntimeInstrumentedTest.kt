package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketCancellation
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
import java.util.Collections
import java.util.concurrent.atomic.AtomicInteger
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith


@RunWith(AndroidJUnit4::class)
class TalosPocketRuntimeInstrumentedTest {
    @Test
    fun realBundleResamplesPublicVoiceAndEmitsPcmBeforeAutoregressiveCompletion() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val manifest = loadPinnedManifest(context.assets.open(MANIFEST_ASSET).bufferedReader().use { it.readText() })
        val root = TalosPocketModelManager.modelRoot(requireNotNull(context.getExternalFilesDir(null)))
        val status = TalosPocketModelManager.validate(root, manifest)
        assertTrue("Pocket model must be hash-verified before ORT opens: $status", status is TalosPocketModelStatus.Ready)
        val reference = File(root, PUBLIC_REFERENCE)
        assertEquals(PUBLIC_REFERENCE_SHA256, sha256(reference))
        val wav = readMonoPcm16Wav(reference)
        assertEquals(16_000, wav.sampleRate)

        val metrics = Collections.synchronizedList(mutableListOf<TalosPocketStageMetric>())
        val pcmFrames = Collections.synchronizedList(mutableListOf<TalosPocketFrame>())
        val autoregressiveRuns = AtomicInteger(0)
        val firstPcmArCount = AtomicInteger(Int.MAX_VALUE)
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = root,
            cpuThreads = 4,
            config = TalosPocketConfig(
                temperature = 0f,
                lsdSteps = 1,
                queueCapacityFrames = 2,
                firstDecodeFrames = 1,
                regularDecodeFrames = 1,
                hardMaxFramesPerSentence = SMOKE_FRAMES,
                stabilizeOnset = false,
            ),
        )
        try {
            val callback = object : TalosPocketCallback {
                override fun onStage(metric: TalosPocketStageMetric) {
                    metrics += metric
                    if (metric.stage == "flow_main_ar") autoregressiveRuns.incrementAndGet()
                }

                override fun onPcm(frame: TalosPocketFrame): Boolean {
                    firstPcmArCount.compareAndSet(Int.MAX_VALUE, autoregressiveRuns.get())
                    pcmFrames += frame
                    return true
                }
            }
            val conditioning = runtime.encodeReference(wav.samples, wav.sampleRate, callback)
            val result = runtime.synthesize(
                source = PUBLIC_SMOKE_TEXT,
                conditioning = conditioning,
                maxFramesPerSentence = SMOKE_FRAMES,
                seed = 19L,
                cancellation = TalosPocketCancellation(),
                callback = callback,
            )

            assertEquals(TalosPocketPipelineTerminal.DONE, result.terminal)
            assertEquals(SMOKE_FRAMES, result.generatedFrames)
            assertEquals(SMOKE_FRAMES * 1_920, result.emittedSamples)
            assertEquals(result.emittedSamples, pcmFrames.sumOf { it.pcmFloatMono.size })
            assertTrue(pcmFrames.flatMap { it.pcmFloatMono.asIterable() }.all(Float::isFinite))
            assertTrue(
                "bounded queue must expose PCM before all $SMOKE_FRAMES AR frames complete; first PCM saw ${firstPcmArCount.get()}",
                firstPcmArCount.get() < SMOKE_FRAMES,
            )
            val stageNames = metrics.mapTo(linkedSetOf(), TalosPocketStageMetric::stage)
            assertTrue(stageNames.containsAll(REQUIRED_STAGES))
            assertTrue(metrics.all { it.durationNs >= 0L && it.startedAtNs > 0L && it.threadName.isNotBlank() })
            writeEvidence(
                File(requireNotNull(context.getExternalFilesDir(null)), "research/voice/pocket-runtime-smoke.json"),
                JSONObject()
                    .put("schemaVersion", 1)
                    .put("modelRevision", TalosPocketModelManifest.REVISION)
                    .put("referenceSha256", PUBLIC_REFERENCE_SHA256)
                    .put("referenceInputRate", wav.sampleRate)
                    .put("conditioningFrames", conditioning.shape[1])
                    .put("generatedFrames", result.generatedFrames)
                    .put("emittedSamples", result.emittedSamples)
                    .put("rtf", result.rtf)
                    .put("firstPcmAfterArRuns", firstPcmArCount.get())
                    .put("stages", JSONArray(stageNames.toList())),
            )
        } finally {
            runtime.close()
        }
    }

    private data class Wav(val sampleRate: Int, val samples: FloatArray)

    private fun readMonoPcm16Wav(file: File): Wav {
        val bytes = file.readBytes()
        require(bytes.size >= 44 && ascii(bytes, 0, 4) == "RIFF" && ascii(bytes, 8, 4) == "WAVE") {
            "public reference is not RIFF/WAVE"
        }
        var cursor = 12
        var channels = 0
        var sampleRate = 0
        var bitsPerSample = 0
        var audioFormat = 0
        var dataOffset = -1
        var dataSize = -1
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        while (cursor + 8 <= bytes.size) {
            val id = ascii(bytes, cursor, 4)
            val size = buffer.getInt(cursor + 4)
            require(size >= 0 && cursor + 8L + size <= bytes.size.toLong()) { "invalid WAV chunk $id" }
            if (id == "fmt ") {
                require(size >= 16) { "WAV fmt chunk is truncated" }
                audioFormat = buffer.getShort(cursor + 8).toInt() and 0xffff
                channels = buffer.getShort(cursor + 10).toInt() and 0xffff
                sampleRate = buffer.getInt(cursor + 12)
                bitsPerSample = buffer.getShort(cursor + 22).toInt() and 0xffff
            } else if (id == "data") {
                dataOffset = cursor + 8
                dataSize = size
                break
            }
            cursor += 8 + size + (size and 1)
        }
        require(audioFormat == 1 && channels == 1 && bitsPerSample == 16 && sampleRate in 8_000..192_000) {
            "public reference must be mono PCM16"
        }
        require(dataOffset >= 0 && dataSize > 0 && dataSize % 2 == 0) { "WAV data chunk is invalid" }
        val samples = FloatArray(dataSize / 2) { index ->
            buffer.getShort(dataOffset + index * 2) / 32768f
        }
        return Wav(sampleRate, samples)
    }

    private fun ascii(bytes: ByteArray, offset: Int, length: Int): String =
        bytes.copyOfRange(offset, offset + length).toString(Charsets.US_ASCII)

    private fun loadPinnedManifest(source: String): TalosPocketModelManifest =
        TalosPocketModelManifest.fromJson(JSONObject(source)).requirePinnedBundle()

    private fun sha256(file: File): String = MessageDigest.getInstance("SHA-256")
        .digest(file.readBytes())
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private fun writeEvidence(file: File, value: JSONObject) {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, ".${file.name}.${System.nanoTime()}.tmp")
        temporary.outputStream().buffered().use { output ->
            output.write((value.toString(2) + "\n").toByteArray(Charsets.UTF_8))
        }
        check(temporary.renameTo(file)) { "could not commit Pocket runtime evidence" }
    }

    private companion object {
        const val MANIFEST_ASSET = "voice/pocket-model-manifest.json"
        const val PUBLIC_REFERENCE = "reference_sample.wav"
        const val PUBLIC_REFERENCE_SHA256 = "88fbb0d31ec26674e97e531a71758cabe4e0e4e5b5a18dafa783021a7f5c9366"
        const val PUBLIC_SMOKE_TEXT = "Buongiorno, questa è la voce italiana di TALOS."
        const val SMOKE_FRAMES = 4

        val REQUIRED_STAGES = setOf(
            "reference_resample",
            "mimi_encoder",
            "tokenize_and_plan",
            "flow_main_voice_prefill",
            "text_conditioner",
            "flow_main_text_prefill",
            "flow_main_ar",
            "flow_step",
            "mimi_decoder",
        )
    }
}
