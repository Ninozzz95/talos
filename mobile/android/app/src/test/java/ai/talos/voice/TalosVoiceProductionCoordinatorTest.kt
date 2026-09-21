package ai.talos.voice

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class TalosVoiceProductionCoordinatorTest {
    @Test
    fun `production coordinator sends exact selected profile and Italian locale through verified Pocket`() {
        val profile = profileWithBothBackends()
        val pocket = RecordingEngine(TalosPocketConditioningPayload.BACKEND)
        val resolvedRoutes = mutableListOf<TalosVoiceEngineRoute>()
        val observedRoutes = mutableListOf<TalosVoiceEngineRoute>()
        val coordinator = TalosVoiceProductionCoordinator(
            TalosVoiceEngineResolver { route ->
                resolvedRoutes += route
                pocket
            },
        )

        val outcome = coordinator.synthesize(
            request(profile),
            TalosVoiceEngineCancellation { false },
            AcceptingCallback,
            observedRoutes::add,
        )

        assertEquals(listOf(TalosPocketConditioningPayload.BACKEND), resolvedRoutes.map { it.backend })
        assertSame(profile.pocketPayload(), pocket.lastRequest?.payload)
        assertEquals("profile-1", pocket.lastRequest?.profileId)
        assertEquals("it-IT", pocket.lastRequest?.locale)
        assertEquals("Una lettura italiana lunga.", pocket.lastRequest?.text)
        assertEquals(TalosPocketConditioningPayload.BACKEND, outcome.route.backend)
        assertEquals(TalosPocketConditioningPayload.BACKEND, outcome.synthesis.backend)
        assertEquals("it-IT", outcome.synthesis.locale)
        assertEquals(listOf(TalosPocketConditioningPayload.BACKEND), observedRoutes.map { it.backend })
    }

    @Test
    fun `Pocket open failure before PCM falls back to MOSS with a stable reason`() {
        val moss = RecordingEngine(TalosMossPromptPayload.BACKEND)
        val resolvedBackends = mutableListOf<String>()
        val coordinator = TalosVoiceProductionCoordinator(
            TalosVoiceEngineResolver { route ->
                resolvedBackends += route.backend
                if (route.backend == TalosPocketConditioningPayload.BACKEND) {
                    error("deliberate Pocket open failure")
                }
                moss
            },
        )

        val outcome = coordinator.synthesize(
            request(profileWithBothBackends()),
            TalosVoiceEngineCancellation { false },
            AcceptingCallback,
        )

        assertEquals(
            listOf(TalosPocketConditioningPayload.BACKEND, TalosMossPromptPayload.BACKEND),
            resolvedBackends,
        )
        assertEquals(TalosMossPromptPayload.BACKEND, outcome.route.backend)
        assertEquals("pocketRuntimeFailure:IllegalStateException", outcome.route.fallbackReason)
        assertEquals("und", outcome.synthesis.locale)
        assertTrue(moss.lastRequest?.payload is TalosMossPromptPayload)
    }

    @Test
    fun `Pocket synthesis failure before PCM falls back without emitting duplicate audio`() {
        val moss = RecordingEngine(TalosMossPromptPayload.BACKEND)
        val resolvedBackends = mutableListOf<String>()
        val coordinator = TalosVoiceProductionCoordinator(
            TalosVoiceEngineResolver { route ->
                resolvedBackends += route.backend
                if (route.backend == TalosPocketConditioningPayload.BACKEND) {
                    RecordingEngine(route.backend, failBeforePcm = true)
                } else {
                    moss
                }
            },
        )

        val outcome = coordinator.synthesize(
            request(profileWithBothBackends()),
            TalosVoiceEngineCancellation { false },
            AcceptingCallback,
        )

        assertEquals(
            listOf(TalosPocketConditioningPayload.BACKEND, TalosMossPromptPayload.BACKEND),
            resolvedBackends,
        )
        assertEquals(TalosMossPromptPayload.BACKEND, outcome.synthesis.backend)
        assertEquals("pocketRuntimeFailure:IllegalStateException", outcome.route.fallbackReason)
    }

    @Test
    fun `Pocket failure after first PCM never restarts the utterance through MOSS`() {
        val resolvedBackends = mutableListOf<String>()
        val pocket = RecordingEngine(
            backend = TalosPocketConditioningPayload.BACKEND,
            failAfterPcm = true,
        )
        val coordinator = TalosVoiceProductionCoordinator(
            TalosVoiceEngineResolver { route ->
                resolvedBackends += route.backend
                if (route.backend == TalosPocketConditioningPayload.BACKEND) pocket
                else RecordingEngine(TalosMossPromptPayload.BACKEND)
            },
        )

        expectFailure<IllegalStateException> {
            coordinator.synthesize(
                request(profileWithBothBackends()),
                TalosVoiceEngineCancellation { false },
                AcceptingCallback,
            )
        }

        assertEquals(listOf(TalosPocketConditioningPayload.BACKEND), resolvedBackends)
    }

    @Test
    fun `cancelled Pocket request never opens fallback`() {
        val resolvedBackends = mutableListOf<String>()
        val coordinator = TalosVoiceProductionCoordinator(
            TalosVoiceEngineResolver { route ->
                resolvedBackends += route.backend
                error("deliberate Pocket open failure")
            },
        )

        expectFailure<IllegalStateException> {
            coordinator.synthesize(
                request(profileWithBothBackends()),
                TalosVoiceEngineCancellation { true },
                AcceptingCallback,
            )
        }

        assertEquals(listOf(TalosPocketConditioningPayload.BACKEND), resolvedBackends)
    }

    @Test
    fun `engine backend mismatch fails closed`() {
        val coordinator = TalosVoiceProductionCoordinator(
            TalosVoiceEngineResolver { RecordingEngine(TalosMossPromptPayload.BACKEND) },
        )

        expectFailure<IllegalStateException> {
            coordinator.synthesize(
                request(profileWithBothBackends()),
                TalosVoiceEngineCancellation { false },
                AcceptingCallback,
            )
        }
    }

    private class RecordingEngine(
        override val backend: String,
        private val failBeforePcm: Boolean = false,
        private val failAfterPcm: Boolean = false,
    ) : TalosNeuralVoiceEngine {
        var lastRequest: TalosVoiceEngineRequest? = null

        override fun synthesize(
            request: TalosVoiceEngineRequest,
            cancellation: TalosVoiceEngineCancellation,
            callback: TalosVoiceEngineCallback,
        ): TalosVoiceEngineResult {
            lastRequest = request
            if (failBeforePcm) error("deliberate failure before PCM")
            val resolvedLocale = if (backend == TalosPocketConditioningPayload.BACKEND) request.locale else "und"
            callback.onPcm(
                TalosVoiceEngineFrame(
                    backend = backend,
                    profileId = request.profileId,
                    locale = resolvedLocale,
                    sentenceIndex = 0,
                    firstFrameIndex = 0,
                    frameCount = 1,
                    sampleRate = if (backend == TalosPocketConditioningPayload.BACKEND) 24_000 else 48_000,
                    channels = 1,
                    pcmFloat = floatArrayOf(0.1f),
                ),
            )
            if (failAfterPcm) error("deliberate failure after audible PCM")
            return TalosVoiceEngineResult(
                backend = backend,
                profileId = request.profileId,
                locale = resolvedLocale,
                terminal = if (cancellation.isCancelled()) {
                    TalosVoiceEngineTerminal.CANCELLED
                } else {
                    TalosVoiceEngineTerminal.DONE
                },
                sentenceCount = 1,
                generatedFrames = 1,
                emittedSamples = 1,
                elapsedNs = 1,
                producerBlockedNs = 0,
                decoderNs = 1,
                queueHighWatermarkFrames = 1,
            )
        }
    }

    private fun request(profile: TalosVoiceProfileV2) = TalosVoiceProductionRequest(
        text = "Una lettura italiana lunga.",
        locale = "it-IT",
        profile = profile,
        maxFramesPerSentence = 64,
        seed = 73L,
        pocketStatus = TalosPocketModelStatus.Ready(File("verified-pocket-root"), 8),
        mossCompatible = true,
    )

    private fun profileWithBothBackends(): TalosVoiceProfileV2 {
        val moss = TalosMossPromptPayload(
            codecFingerprint = "aa".repeat(32),
            promptSchemaFingerprint = "bb".repeat(32),
            frameRateMilliHz = 12_500,
            quantizerCount = 1,
            codebookSize = 1_024,
            promptAudioCodes = listOf(intArrayOf(1)),
        )
        val pocket = TalosPocketConditioningPayload(
            repository = TalosPocketConditioningPayload.REPOSITORY,
            revision = TalosPocketConditioningPayload.REVISION,
            sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
            shape = longArrayOf(1, 1, 1_024),
            values = FloatArray(1_024) { it / 1_024f },
        )
        return TalosVoiceProfileV2(
            header = TalosVoiceProfileHeaderV2(
                schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                profileId = "profile-1",
                displayName = "Voce italiana",
                language = "it-IT",
                style = "neutral",
                preferredBackend = TalosPocketConditioningPayload.BACKEND,
                createdAtEpochMs = 1,
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

    private object AcceptingCallback : TalosVoiceEngineCallback {
        override fun onStage(metric: TalosVoiceEngineStageMetric) = Unit
        override fun onPcm(frame: TalosVoiceEngineFrame): Boolean = true
    }

    private inline fun <reified T : Throwable> expectFailure(block: () -> Unit): T {
        try {
            block()
            fail("expected ${T::class.java.simpleName}")
        } catch (error: Throwable) {
            if (error !is T) throw error
            return error
        }
        error("unreachable")
    }
}
