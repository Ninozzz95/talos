package ai.talos.voice

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosNeuralVoiceEngineTest {
    @Test
    fun `verified Italian Pocket payload wins and keeps the exact model root`() {
        val profile = profileWithBothBackends()
        val root = File("verified-pocket-root")

        val route = TalosVoiceEngineRouter.select(
            profile = profile,
            requestedLocale = "it-IT",
            pocketStatus = TalosPocketModelStatus.Ready(root, 8),
            mossCompatible = true,
        )

        assertEquals(TalosPocketConditioningPayload.BACKEND, route.backend)
        assertSame(profile.pocketPayload(), route.payload)
        assertEquals(root, route.pocketModelRoot)
        assertNull(route.fallbackReason)
    }

    @Test
    fun `missing Pocket bundle falls back to MOSS with an observable reason`() {
        val profile = profileWithBothBackends()

        val route = TalosVoiceEngineRouter.select(
            profile,
            "it-IT",
            TalosPocketModelStatus.Missing("flow_lm_main_int8.onnx"),
            mossCompatible = true,
        )

        assertEquals(TalosMossPromptPayload.BACKEND, route.backend)
        assertSame(profile.mossPayload(), route.payload)
        assertEquals("pocketModelMissing:flow_lm_main_int8.onnx", route.fallbackReason)
    }

    @Test
    fun `corrupt Pocket bundle falls back to MOSS with an observable reason`() {
        val route = TalosVoiceEngineRouter.select(
            profileWithBothBackends(),
            "it",
            TalosPocketModelStatus.Corrupt("bundle.json", "sha256"),
            mossCompatible = true,
        )

        assertEquals(TalosMossPromptPayload.BACKEND, route.backend)
        assertEquals("pocketModelCorrupt:bundle.json:sha256", route.fallbackReason)
    }

    @Test
    fun `non Italian request falls back before opening Pocket`() {
        val route = TalosVoiceEngineRouter.select(
            profileWithBothBackends(),
            "en-US",
            TalosPocketModelStatus.Ready(File("unused"), 8),
            mossCompatible = true,
        )

        assertEquals(TalosMossPromptPayload.BACKEND, route.backend)
        assertEquals("pocketLocaleUnsupported:en-US", route.fallbackReason)
        assertNull(route.pocketModelRoot)
    }

    @Test(expected = IllegalStateException::class)
    fun `no verified backend fails closed`() {
        TalosVoiceEngineRouter.select(
            profileWithBothBackends(),
            "it-IT",
            TalosPocketModelStatus.Missing("bundle.json"),
            mossCompatible = false,
        )
    }

    @Test
    fun `MOSS adapter streams bounded batches and reports locale as unknown`() {
        val runtime = FakeMossRuntime()
        val tokenizer = FakeTokenizer()
        val engine = TalosMossVoiceEngine(runtime, tokenizer)
        val frames = mutableListOf<TalosVoiceEngineFrame>()
        val stages = mutableListOf<TalosVoiceEngineStageMetric>()
        val request = TalosVoiceEngineRequest(
            text = "Una lettura italiana abbastanza lunga.",
            locale = "it-IT",
            profileId = "profile-1",
            payload = profileWithBothBackends().mossPayload(),
            maxFramesPerSentence = 32,
            seed = 73L,
        )

        val result = engine.synthesize(
            request,
            TalosVoiceEngineCancellation { false },
            object : TalosVoiceEngineCallback {
                override fun onStage(metric: TalosVoiceEngineStageMetric) {
                    stages += metric
                }

                override fun onPcm(frame: TalosVoiceEngineFrame): Boolean {
                    frames += frame
                    return true
                }
            },
        )

        assertEquals(intArrayOf(11, 12).toList(), runtime.textTokenIds.toList())
        assertEquals(73L, runtime.seed)
        assertEquals(32, runtime.maxFrames)
        assertEquals(listOf(1, 2), runtime.codec.batchSizes)
        assertEquals(2, frames.size)
        assertTrue(frames.all { it.profileId == "profile-1" && it.locale == "und" })
        assertEquals(TalosMossPromptPayload.BACKEND, result.backend)
        assertEquals("und", result.locale)
        assertEquals(3, result.generatedFrames)
        assertEquals(3, result.emittedSamples)
        assertTrue(stages.any { it.stage == "moss_tokenize" })
        assertTrue(stages.any { it.stage == "moss_codec_decode" })
    }

    private class FakeTokenizer : TalosVoiceTokenizer {
        override fun encode(text: String): IntArray = intArrayOf(11, 12)
        override fun count(text: String): Int = 2
        override fun close() = Unit
    }

    private class FakeMossRuntime : TalosMossVoiceRuntimeContract {
        override val sampleRate: Int = 48_000
        override val channels: Int = 1
        val codec = FakeMossCodec()
        lateinit var textTokenIds: IntArray
        var maxFrames: Int = -1
        var seed: Long = -1

        override fun openCodecStream(): TalosMossVoiceCodecContract = codec

        override fun generateWithReference(
            textTokenIds: IntArray,
            promptAudioCodes: List<IntArray>,
            maxFrames: Int,
            seed: Long,
            isCancelled: () -> Boolean,
            onFrame: (IntArray) -> Unit,
        ): Pair<List<IntArray>, Boolean> {
            this.textTokenIds = textTokenIds.copyOf()
            this.maxFrames = maxFrames
            this.seed = seed
            val generated = listOf(intArrayOf(1), intArrayOf(2), intArrayOf(3))
            generated.forEach(onFrame)
            return generated to false
        }
    }

    private class FakeMossCodec : TalosMossVoiceCodecContract {
        val batchSizes = mutableListOf<Int>()
        override fun runFrames(frameRows: List<IntArray>): TalosMossCodecFrames {
            batchSizes += frameRows.size
            return TalosMossCodecFrames(FloatArray(frameRows.size) { it / 10f }, frameRows.size)
        }

        override fun close() = Unit
    }

    private fun profileWithBothBackends(): TalosVoiceProfileV2 {
        val moss = TalosMossPromptPayload(
            codecFingerprint = "aa".repeat(32),
            promptSchemaFingerprint = "bb".repeat(32),
            frameRateMilliHz = 12_500,
            quantizerCount = 1,
            codebookSize = 1_024,
            promptAudioCodes = listOf(intArrayOf(1), intArrayOf(2)),
        )
        val pocket = TalosPocketConditioningPayload(
            repository = TalosPocketConditioningPayload.REPOSITORY,
            revision = TalosPocketConditioningPayload.REVISION,
            sampleRate = 24_000,
            shape = longArrayOf(1, 1, 1_024),
            values = FloatArray(1_024) { it / 1_024f },
        )
        return TalosVoiceProfileV2(
            header = TalosVoiceProfileHeaderV2(
                schemaVersion = 2,
                profileId = "profile-1",
                displayName = "Voce italiana",
                language = "it-IT",
                style = "neutral",
                preferredBackend = TalosPocketConditioningPayload.BACKEND,
                createdAtEpochMs = 1L,
                enrollmentDurationMs = 4_000,
                consentVersion = 1,
                migratedFromSchemaVersion = 1,
            ),
            qualityMetrics = TalosVoiceQualityMetrics(
                durationMs = 4_000,
                speechRatio = 0.8,
                peakAbs = 0.5,
                rmsDbfs = -18.0,
                clippedSampleRatio = 0.0,
                dcOffset = 0.0,
                noiseFloorDbfs = -50.0,
                snrEstimateDb = 30.0,
                longestSilenceMs = 100,
                zeroFrameRatio = 0.01,
                droppedReadCount = 0,
                clientSilencedObserved = false,
            ),
            backendPayloads = listOf(moss, pocket),
        )
    }
}
