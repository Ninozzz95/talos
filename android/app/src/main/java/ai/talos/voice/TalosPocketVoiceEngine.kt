package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketCancellation
import ai.talos.voice.pocket.TalosPocketConditioning
import ai.talos.voice.pocket.TalosPocketFrame
import ai.talos.voice.pocket.TalosPocketOrtRuntime
import ai.talos.voice.pocket.TalosPocketPipelineTerminal
import ai.talos.voice.pocket.TalosPocketStageMetric
import ai.talos.voice.pocket.TalosPocketSynthesisResult
import java.io.Closeable

internal interface TalosPocketRuntimeContract {
    fun synthesize(
        source: String,
        conditioning: TalosPocketConditioning,
        maxFramesPerSentence: Int?,
        seed: Long,
        cancellation: TalosPocketCancellation,
        callback: TalosPocketCallback,
    ): TalosPocketSynthesisResult
}

/** Host-owned superset: production keeps one adapter for both enrollment and synthesis. */
internal interface TalosPocketHostRuntimeContract : TalosPocketRuntimeContract, Closeable {
    fun encodeReference(
        pcmFloatMono: FloatArray,
        sampleRate: Int,
        callback: TalosPocketCallback? = null,
    ): TalosPocketConditioning
}

internal class TalosPocketOrtRuntimeAdapter(
    private val runtime: TalosPocketOrtRuntime,
) : TalosPocketHostRuntimeContract {
    override fun encodeReference(
        pcmFloatMono: FloatArray,
        sampleRate: Int,
        callback: TalosPocketCallback?,
    ): TalosPocketConditioning = runtime.encodeReference(pcmFloatMono, sampleRate, callback)

    override fun synthesize(
        source: String,
        conditioning: TalosPocketConditioning,
        maxFramesPerSentence: Int?,
        seed: Long,
        cancellation: TalosPocketCancellation,
        callback: TalosPocketCallback,
    ): TalosPocketSynthesisResult = runtime.synthesize(
        source = source,
        conditioning = conditioning,
        maxFramesPerSentence = maxFramesPerSentence,
        seed = seed,
        cancellation = cancellation,
        callback = callback,
    )

    override fun close() = runtime.close()
}

internal class TalosPocketVoiceEngine(
    private val runtime: TalosPocketRuntimeContract,
) : TalosNeuralVoiceEngine {
    override val backend: String = TalosPocketConditioningPayload.BACKEND

    override fun synthesize(
        request: TalosVoiceEngineRequest,
        cancellation: TalosVoiceEngineCancellation,
        callback: TalosVoiceEngineCallback,
    ): TalosVoiceEngineResult {
        val payload = request.payload as? TalosPocketConditioningPayload
            ?: throw IllegalArgumentException("Pocket engine requires a Pocket conditioning payload")
        val pocketCancellation = TalosPocketCancellation()

        fun synchronizeCancellation() {
            if (cancellation.isCancelled()) pocketCancellation.cancel()
        }

        synchronizeCancellation()
        val result = runtime.synthesize(
            source = request.text,
            conditioning = TalosPocketConditioning.create(payload.shape, payload.valuesCopy()),
            maxFramesPerSentence = request.maxFramesPerSentence,
            seed = request.seed,
            cancellation = pocketCancellation,
            callback = object : TalosPocketCallback {
                override fun onStage(metric: TalosPocketStageMetric) {
                    synchronizeCancellation()
                    callback.onStage(metric.toEngineMetric())
                }

                override fun onPcm(frame: TalosPocketFrame): Boolean {
                    synchronizeCancellation()
                    if (pocketCancellation.isCancelled()) return false
                    val accepted = callback.onPcm(
                        TalosVoiceEngineFrame(
                            backend = backend,
                            profileId = request.profileId,
                            locale = request.locale,
                            sentenceIndex = frame.sentenceIndex,
                            firstFrameIndex = frame.firstFrameIndex,
                            frameCount = frame.frameCount,
                            sampleRate = frame.sampleRate,
                            channels = 1,
                            pcmFloat = frame.pcmFloatMono,
                        ),
                    )
                    if (!accepted) pocketCancellation.cancel()
                    return accepted
                }
            },
        )
        return TalosVoiceEngineResult(
            backend = backend,
            profileId = request.profileId,
            locale = request.locale,
            terminal = if (result.terminal == TalosPocketPipelineTerminal.CANCELLED) {
                TalosVoiceEngineTerminal.CANCELLED
            } else {
                TalosVoiceEngineTerminal.DONE
            },
            sentenceCount = result.sentenceCount,
            generatedFrames = result.generatedFrames,
            emittedSamples = result.emittedSamples,
            onsetDiscardedSamples = result.onsetDiscardedSamples,
            elapsedNs = result.elapsedNs,
            producerBlockedNs = result.producerBlockedNs,
            decoderNs = result.decoderNs,
            queueHighWatermarkFrames = result.queueHighWatermarkFrames,
        )
    }

    private fun TalosPocketStageMetric.toEngineMetric() = TalosVoiceEngineStageMetric(
        backend = backend,
        stage = stage,
        startedAtNs = startedAtNs,
        durationNs = durationNs,
        threadName = threadName,
        sentenceIndex = sentenceIndex,
        frameIndex = frameIndex,
        inputFrames = inputFrames,
        outputSamples = outputSamples,
        residentStateBytes = residentStateBytes,
        onsetDiscardedSamples = onsetDiscardedSamples,
        onsetLeadingSilenceSamples = onsetLeadingSilenceSamples,
        onsetGapStartSamples = onsetGapStartSamples,
        onsetGapEndSamples = onsetGapEndSamples,
        onsetResumeStartSamples = onsetResumeStartSamples,
        onsetAnalysisWindowSamples = onsetAnalysisWindowSamples,
        onsetBoundaryThreshold = onsetBoundaryThreshold,
        onsetBoundarySource = onsetBoundarySource,
    )
}
