package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketCancellation
import ai.talos.voice.pocket.TalosPocketConditioning
import ai.talos.voice.pocket.TalosPocketFrame
import ai.talos.voice.pocket.TalosPocketPipelineTerminal
import ai.talos.voice.pocket.TalosPocketStageMetric
import ai.talos.voice.pocket.TalosPocketSynthesisResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPocketVoiceEngineTest {
    @Test
    fun `Pocket adapter propagates text profile locale seed bounds stages and PCM`() {
        val runtime = FakePocketRuntime()
        val engine = TalosPocketVoiceEngine(runtime)
        val stages = mutableListOf<TalosVoiceEngineStageMetric>()
        val frames = mutableListOf<TalosVoiceEngineFrame>()

        val result = engine.synthesize(
            request(),
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

        assertEquals("Ciao, questa è una prova lunga.", runtime.source)
        assertEquals(64, runtime.maxFramesPerSentence)
        assertEquals(991L, runtime.seed)
        assertEquals(1_024, runtime.conditioning.valuesCopy().size)
        assertEquals(listOf("flow_main_ar"), stages.map { it.stage })
        assertEquals(480, stages.single().onsetDiscardedSamples)
        assertEquals(240, stages.single().onsetLeadingSilenceSamples)
        assertEquals(360, stages.single().onsetGapStartSamples)
        assertEquals(600, stages.single().onsetGapEndSamples)
        assertEquals(720, stages.single().onsetResumeStartSamples)
        assertEquals(240, stages.single().onsetAnalysisWindowSamples)
        assertEquals(0.01f, stages.single().onsetBoundaryThreshold)
        assertEquals("PINNED_SACRIFICIAL_PREFIX_SILENCE", stages.single().onsetBoundarySource)
        assertEquals(1, frames.size)
        assertEquals("profile-pocket", frames.single().profileId)
        assertEquals("it-IT", frames.single().locale)
        assertEquals(24_000, frames.single().sampleRate)
        assertEquals(2, frames.single().pcmFloat.size)
        assertEquals(TalosPocketConditioningPayload.BACKEND, result.backend)
        assertEquals("profile-pocket", result.profileId)
        assertEquals("it-IT", result.locale)
        assertEquals(TalosVoiceEngineTerminal.DONE, result.terminal)
        assertEquals(480, result.onsetDiscardedSamples)
    }

    @Test
    fun `generic cancellation reaches Pocket before the next graph boundary`() {
        val runtime = FakePocketRuntime()
        runtime.requestCancellationBeforeStage = true
        val result = TalosPocketVoiceEngine(runtime).synthesize(
            request(),
            TalosVoiceEngineCancellation { runtime.cancelRequested },
            acceptingCallback(),
        )

        assertTrue(runtime.cancelledAfterStage)
        assertEquals(TalosVoiceEngineTerminal.CANCELLED, result.terminal)
    }

    @Test
    fun `rejected PCM callback cancels the Pocket pipeline`() {
        val runtime = FakePocketRuntime()
        val result = TalosPocketVoiceEngine(runtime).synthesize(
            request(),
            TalosVoiceEngineCancellation { false },
            object : TalosVoiceEngineCallback {
                override fun onStage(metric: TalosVoiceEngineStageMetric) = Unit
                override fun onPcm(frame: TalosVoiceEngineFrame): Boolean = false
            },
        )

        assertFalse(runtime.pcmAccepted)
        assertTrue(runtime.cancelledAfterPcm)
        assertEquals(TalosVoiceEngineTerminal.CANCELLED, result.terminal)
    }

    private class FakePocketRuntime : TalosPocketRuntimeContract {
        lateinit var source: String
        lateinit var conditioning: TalosPocketConditioning
        var maxFramesPerSentence: Int? = null
        var seed: Long = -1L
        var cancelledAfterStage = false
        var cancelledAfterPcm = false
        var pcmAccepted = true
        var requestCancellationBeforeStage = false
        var cancelRequested = false

        override fun synthesize(
            source: String,
            conditioning: TalosPocketConditioning,
            maxFramesPerSentence: Int?,
            seed: Long,
            cancellation: TalosPocketCancellation,
            callback: TalosPocketCallback,
        ): TalosPocketSynthesisResult {
            this.source = source
            this.conditioning = conditioning
            this.maxFramesPerSentence = maxFramesPerSentence
            this.seed = seed
            if (requestCancellationBeforeStage) cancelRequested = true
            callback.onStage(
                TalosPocketStageMetric(
                    runIndex = 1,
                    stage = "flow_main_ar",
                    startedAtNs = 10,
                    durationNs = 20,
                    threadName = "fake-pocket",
                    sentenceIndex = 0,
                    frameIndex = 0,
                    inputFrames = 1,
                    outputSamples = null,
                    residentStateBytes = 128,
                    onsetDiscardedSamples = 480,
                    onsetLeadingSilenceSamples = 240,
                    onsetGapStartSamples = 360,
                    onsetGapEndSamples = 600,
                    onsetResumeStartSamples = 720,
                    onsetAnalysisWindowSamples = 240,
                    onsetBoundaryThreshold = 0.01f,
                    onsetBoundarySource = "PINNED_SACRIFICIAL_PREFIX_SILENCE",
                ),
            )
            cancelledAfterStage = cancellation.isCancelled()
            if (!cancelledAfterStage) {
                pcmAccepted = callback.onPcm(
                    TalosPocketFrame(
                        sentenceIndex = 0,
                        firstFrameIndex = 0,
                        frameCount = 1,
                        sampleRate = 24_000,
                        pcmFloatMono = floatArrayOf(0.1f, -0.1f),
                    ),
                )
                if (!pcmAccepted) cancellation.cancel()
            }
            cancelledAfterPcm = cancellation.isCancelled()
            val terminal = if (cancellation.isCancelled()) {
                TalosPocketPipelineTerminal.CANCELLED
            } else {
                TalosPocketPipelineTerminal.DONE
            }
            return TalosPocketSynthesisResult(
                terminal = terminal,
                sentenceCount = 1,
                generatedFrames = if (cancelledAfterStage) 0 else 1,
                emittedSamples = if (cancelledAfterStage) 0 else 2,
                onsetDiscardedSamples = if (cancelledAfterStage) 0 else 480,
                elapsedNs = 100,
                producerBlockedNs = 5,
                decoderNs = 25,
                queueHighWatermarkFrames = 1,
            )
        }
    }

    private fun request() = TalosVoiceEngineRequest(
        text = "Ciao, questa è una prova lunga.",
        locale = "it-IT",
        profileId = "profile-pocket",
        payload = TalosPocketConditioningPayload(
            repository = TalosPocketConditioningPayload.REPOSITORY,
            revision = TalosPocketConditioningPayload.REVISION,
            sampleRate = 24_000,
            shape = longArrayOf(1, 1, 1_024),
            values = FloatArray(1_024) { it / 1_024f },
        ),
        maxFramesPerSentence = 64,
        seed = 991L,
    )

    private fun acceptingCallback() = object : TalosVoiceEngineCallback {
        override fun onStage(metric: TalosVoiceEngineStageMetric) = Unit
        override fun onPcm(frame: TalosVoiceEngineFrame): Boolean = true
    }
}
