package ai.talos.voice.pocket

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosPocketOrtRuntimeTest {
    @Test
    fun `reference conditioning resamples to the bundle rate and traces both boundaries`() {
        val factory = FakeFactory()
        val graphs = FakeGraphs(factory, AtomicInteger(), CountDownLatch(0))
        val bridge = RecordingResamplerBridge(FloatArray(24_000))
        val runtime = TalosPocketOrtRuntime.forTesting(
            bundle = bundle(),
            tokenizer = FakeTokenizer,
            bosBeforeVoice = TalosPocketFloatTensor(longArrayOf(1, 1, 1_024), FloatArray(1_024)),
            graphs = graphs,
            config = TalosPocketConfig(),
            resampler = TalosPocketResampler.forTesting(bridge),
        )
        val stages = mutableListOf<String>()

        runtime.encodeReference(
            pcmFloatMono = FloatArray(16_000),
            sampleRate = 16_000,
            callback = object : TalosPocketCallback {
                override fun onStage(metric: TalosPocketStageMetric) {
                    stages += metric.stage
                }

                override fun onPcm(frame: TalosPocketFrame) = true
            },
        )

        assertEquals(1, bridge.calls)
        assertEquals(16_000, bridge.lastInputRate)
        assertEquals(24_000, bridge.lastOutputRate)
        assertEquals(24_000L, graphs.lastMimiInputFrames)
        assertEquals(listOf("reference_resample", "mimi_encoder"), stages)
        runtime.close()
    }

    @Test
    fun `runtime emits decoded PCM before autoregressive completion`() {
        val callbackReached = CountDownLatch(1)
        val arRuns = AtomicInteger(0)
        val factory = FakeFactory()
        val graphs = FakeGraphs(factory, arRuns, callbackReached)
        val runtime = TalosPocketOrtRuntime.forTesting(
            bundle = bundle(),
            tokenizer = FakeTokenizer,
            bosBeforeVoice = TalosPocketFloatTensor(longArrayOf(1, 1, 1_024), FloatArray(1_024)),
            graphs = graphs,
            config = TalosPocketConfig(
                temperature = 0f,
                lsdSteps = 1,
                queueCapacityFrames = 4,
                firstDecodeFrames = 2,
                regularDecodeFrames = 2,
                hardMaxFramesPerSentence = 8,
                stabilizeOnset = false,
            ),
            resampler = TalosPocketResampler.forTesting(
                RecordingResamplerBridge(FloatArray(0)),
            ),
        )
        val emitted = mutableListOf<TalosPocketFrame>()

        val result = runtime.synthesize(
            source = "Prova italiana.",
            conditioning = TalosPocketConditioning.create(
                longArrayOf(1, 1, 1_024),
                FloatArray(1_024),
            ),
            maxFramesPerSentence = 3,
            seed = 19L,
            cancellation = TalosPocketCancellation(),
            callback = object : TalosPocketCallback {
                override fun onStage(metric: TalosPocketStageMetric) = Unit
                override fun onPcm(frame: TalosPocketFrame): Boolean {
                    emitted += frame
                    callbackReached.countDown()
                    return true
                }
            },
        )

        assertEquals(TalosPocketPipelineTerminal.DONE, result.terminal)
        assertEquals(3, result.generatedFrames)
        assertEquals(3 * 1_920, result.emittedSamples)
        assertEquals(2, emitted.size)
        assertTrue(graphs.thirdArRunObservedCallback)
        runtime.close()
    }

    @Test
    fun `runtime counts only emitted user PCM and reports the measured onset boundary`() {
        val rawPcm = FloatArray(5 * 1_920) { sample ->
            when (sample) {
                in 0 until 4_800 -> 0.5f
                in 4_800 until 7_200 -> 0f
                else -> 0.25f
            }
        }
        val factory = FakeFactory()
        val graphs = FakeGraphs(
            tensors = factory,
            arRuns = AtomicInteger(),
            callbackReached = CountDownLatch(0),
            decoderPcm = rawPcm,
        )
        val runtime = TalosPocketOrtRuntime.forTesting(
            bundle = bundle(),
            tokenizer = FakeTokenizer,
            bosBeforeVoice = TalosPocketFloatTensor(longArrayOf(1, 1, 1_024), FloatArray(1_024)),
            graphs = graphs,
            config = TalosPocketConfig(
                temperature = 0f,
                queueCapacityFrames = 6,
                firstDecodeFrames = 2,
                regularDecodeFrames = 3,
                hardMaxFramesPerSentence = 5,
                stabilizeOnset = true,
            ),
            resampler = TalosPocketResampler.forTesting(RecordingResamplerBridge(FloatArray(0))),
        )
        val emitted = mutableListOf<FloatArray>()
        val stages = mutableListOf<TalosPocketStageMetric>()

        val result = runtime.synthesize(
            source = "La terza frase chiude la verifica italiana.",
            conditioning = TalosPocketConditioning.create(longArrayOf(1, 1, 1_024), FloatArray(1_024)),
            maxFramesPerSentence = 5,
            seed = 42L,
            cancellation = TalosPocketCancellation(),
            callback = object : TalosPocketCallback {
                override fun onStage(metric: TalosPocketStageMetric) {
                    stages += metric
                }

                override fun onPcm(frame: TalosPocketFrame): Boolean {
                    emitted += frame.pcmFloatMono
                    return true
                }
            },
        )

        val onset = stages.single { it.stage == "onset_stabilized" }
        assertEquals(5, result.generatedFrames)
        assertEquals(6_000, result.onsetDiscardedSamples)
        assertEquals(3_600, result.emittedSamples)
        assertEquals(5 * 1_920, result.onsetDiscardedSamples + result.emittedSamples)
        assertEquals(6_000, onset.onsetDiscardedSamples)
        assertEquals(1_200, onset.onsetLeadingSilenceSamples)
        assertEquals(4_800, onset.onsetGapStartSamples)
        assertEquals(7_200, onset.onsetGapEndSamples)
        assertEquals(7_200, onset.onsetResumeStartSamples)
        assertEquals(240, onset.onsetAnalysisWindowSamples)
        assertEquals(TalosPocketOnsetStabilizer.BOUNDARY_SOURCE, onset.onsetBoundarySource)
        val emittedPcm = emitted.fold(FloatArray(0)) { joined, chunk -> joined + chunk }
        assertArrayEquals(FloatArray(1_200), emittedPcm.copyOfRange(0, 1_200), 0f)
        assertArrayEquals(FloatArray(2_400) { 0.25f }, emittedPcm.copyOfRange(1_200, 3_600), 0f)
        runtime.close()
    }

    private fun bundle() = TalosPocketBundle(
        language = "italian",
        sampleRate = 24_000,
        frameRate = 12.5,
        samplesPerFrame = 1_920,
        latentDim = 32,
        conditioningDim = 1_024,
        maxTokenPerChunk = 50,
        insertBosBeforeVoice = true,
        tokenizerFile = "tokenizer.model",
        bosBeforeVoiceFile = "bos_before_voice.npy",
        padWithSpacesForShortInputs = false,
        removeSemicolons = false,
        modelRecommendedFramesAfterEos = 3,
        flowStates = emptyList(),
        mimiStates = emptyList(),
    )

    private object FakeTokenizer : TalosPocketTokenizerContract {
        override val vocabSize = 4_000
        override fun encode(source: String) = intArrayOf(10, 11)
        override fun decode(ids: IntArray) = "Prova italiana."
    }

    private open class FakeValue(
        val shape: LongArray,
        val floats: FloatArray = FloatArray(0),
        val longs: LongArray = LongArray(0),
    ) : TalosPocketOrtValue

    private class FakeOwnedValue(
        shape: LongArray,
        floats: FloatArray = FloatArray(0),
        longs: LongArray = LongArray(0),
    ) : FakeValue(shape, floats, longs), TalosPocketOwnedOrtValue {
        override fun close() = Unit
    }

    private class FakeResult(private val outputs: Map<String, FakeValue>) : TalosPocketOrtResult {
        override fun value(name: String): TalosPocketOrtValue = outputs.getValue(name)
        override fun floatValues(name: String): TalosPocketFloatTensor {
            val output = outputs.getValue(name)
            return TalosPocketFloatTensor(output.shape, output.floats)
        }
        override fun close() = Unit
    }

    private class FakeFactory : TalosPocketOrtTensorFactory {
        override fun state(spec: TalosPocketStateSpec) = FakeOwnedValue(spec.shape)
        override fun float32(shape: LongArray, values: FloatArray) = FakeOwnedValue(shape, floats = values.copyOf())
        override fun int64(shape: LongArray, values: LongArray) = FakeOwnedValue(shape, longs = values.copyOf())
    }

    private class LambdaSession(
        private val block: (Map<String, TalosPocketOrtValue>) -> FakeResult,
    ) : TalosPocketOrtSession {
        override fun run(inputs: Map<String, TalosPocketOrtValue>): TalosPocketOrtResult = block(inputs)
        override fun close() = Unit
    }

    private class FakeGraphs(
        override val tensors: FakeFactory,
        private val arRuns: AtomicInteger,
        private val callbackReached: CountDownLatch,
        private val decoderPcm: FloatArray? = null,
    ) : TalosPocketOrtGraphs {
        private val decodedSamples = AtomicInteger()
        @Volatile var thirdArRunObservedCallback = false
        var lastMimiInputFrames = 0L

        override val mimiEncoder = LambdaSession { inputs ->
            lastMimiInputFrames = (inputs.getValue("audio") as FakeValue).shape[2]
            FakeResult(mapOf("latents" to FakeValue(longArrayOf(1, 1, 1_024), FloatArray(1_024))))
        }
        override val textConditioner = LambdaSession { inputs ->
            val tokenIds = inputs.getValue("token_ids") as FakeValue
            val tokenCount = tokenIds.shape[1]
            FakeResult(mapOf("embeddings" to FakeValue(longArrayOf(1, tokenCount, 1_024), FloatArray(tokenCount.toInt() * 1_024))))
        }
        override val flowMain = LambdaSession { inputs ->
            val sequence = inputs.getValue("sequence") as FakeValue
            if (sequence.shape[1] == 1L) {
                val run = arRuns.incrementAndGet()
                if (run == 3) {
                    thirdArRunObservedCallback = callbackReached.await(1, TimeUnit.SECONDS)
                }
            }
            FakeResult(
                mapOf(
                    "conditioning" to FakeValue(longArrayOf(1, 1_024), FloatArray(1_024)),
                    "eos_logit" to FakeValue(longArrayOf(1, 1), floatArrayOf(-10f)),
                ),
            )
        }
        override val flow = LambdaSession {
            FakeResult(mapOf("flow_dir" to FakeValue(longArrayOf(1, 32), FloatArray(32))))
        }
        override val mimiDecoder = LambdaSession { inputs ->
            val latent = inputs.getValue("latent") as FakeValue
            val frames = latent.shape[1].toInt()
            val sampleCount = frames * 1_920
            val pcm = decoderPcm?.let { source ->
                val start = decodedSamples.getAndAdd(sampleCount)
                source.copyOfRange(start, start + sampleCount)
            } ?: FloatArray(sampleCount)
            FakeResult(mapOf("audio_frame" to FakeValue(longArrayOf(1, 1, sampleCount.toLong()), pcm)))
        }
        override fun close() = Unit
    }

    private class RecordingResamplerBridge(private val output: FloatArray) : TalosPocketResamplerNativeBridge {
        var calls = 0
        var lastInputRate = 0
        var lastOutputRate = 0

        override fun resampleMono(source: FloatArray, inputRate: Int, outputRate: Int): FloatArray {
            calls += 1
            lastInputRate = inputRate
            lastOutputRate = outputRate
            return output.copyOf()
        }
    }
}
