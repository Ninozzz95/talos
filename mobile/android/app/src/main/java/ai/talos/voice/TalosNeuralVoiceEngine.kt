package ai.talos.voice

import java.io.File

internal enum class TalosVoiceEngineTerminal { DONE, CANCELLED }

internal data class TalosVoiceEngineRequest(
    val text: String,
    val locale: String,
    val profileId: String,
    val payload: TalosVoiceBackendPayload,
    val maxFramesPerSentence: Int?,
    val seed: Long,
) {
    init {
        require(text.isNotBlank()) { "voice engine text must not be blank" }
        require(profileId.isNotBlank() && profileId.length <= 128) { "voice engine profile id is invalid" }
        require(LOCALE.matches(locale)) { "voice engine locale is invalid: $locale" }
        require(maxFramesPerSentence == null || maxFramesPerSentence in 1..10_000) {
            "voice engine frame limit is invalid"
        }
    }

    companion object {
        private val LOCALE = Regex("^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    }
}

internal data class TalosVoiceEngineFrame(
    val backend: String,
    val profileId: String,
    val locale: String,
    val sentenceIndex: Int,
    val firstFrameIndex: Int,
    val frameCount: Int,
    val sampleRate: Int,
    val channels: Int,
    val pcmFloat: FloatArray,
) {
    init {
        require(backend in TalosVoiceBackendPayload.SUPPORTED_BACKENDS) { "voice frame backend is unsupported" }
        require(profileId.isNotBlank()) { "voice frame profile id is blank" }
        require(locale.isNotBlank()) { "voice frame locale is blank" }
        require(sentenceIndex >= 0 && firstFrameIndex >= 0 && frameCount > 0) { "voice frame position is invalid" }
        require(sampleRate > 0 && channels in 1..2) { "voice frame audio format is invalid" }
        require(pcmFloat.isNotEmpty() && pcmFloat.size % channels == 0) { "voice frame PCM shape is invalid" }
        require(pcmFloat.all(Float::isFinite)) { "voice frame PCM contains non-finite values" }
    }
}

internal data class TalosVoiceEngineStageMetric(
    val backend: String,
    val stage: String,
    val startedAtNs: Long,
    val durationNs: Long,
    val threadName: String,
    val sentenceIndex: Int? = null,
    val frameIndex: Int? = null,
    val inputFrames: Int? = null,
    val outputSamples: Int? = null,
    val residentStateBytes: Long? = null,
    val onsetDiscardedSamples: Int? = null,
    val onsetLeadingSilenceSamples: Int? = null,
    val onsetGapStartSamples: Int? = null,
    val onsetGapEndSamples: Int? = null,
    val onsetResumeStartSamples: Int? = null,
    val onsetAnalysisWindowSamples: Int? = null,
    val onsetBoundaryThreshold: Float? = null,
    val onsetBoundarySource: String? = null,
) {
    init {
        require(backend in TalosVoiceBackendPayload.SUPPORTED_BACKENDS) { "voice metric backend is unsupported" }
        require(stage.isNotBlank()) { "voice metric stage is blank" }
        require(startedAtNs >= 0L && durationNs >= 0L) { "voice metric timing is invalid" }
        require(threadName.isNotBlank()) { "voice metric thread is blank" }
    }
}

internal data class TalosVoiceEngineResult(
    val backend: String,
    val profileId: String,
    val locale: String,
    val terminal: TalosVoiceEngineTerminal,
    val sentenceCount: Int,
    val generatedFrames: Int,
    val emittedSamples: Int,
    val onsetDiscardedSamples: Int = 0,
    val elapsedNs: Long,
    val producerBlockedNs: Long,
    val decoderNs: Long,
    val queueHighWatermarkFrames: Int,
) {
    init {
        require(backend in TalosVoiceBackendPayload.SUPPORTED_BACKENDS) { "voice result backend is unsupported" }
        require(profileId.isNotBlank() && locale.isNotBlank()) { "voice result route is incomplete" }
        require(sentenceCount >= 0 && generatedFrames >= 0 && emittedSamples >= 0 && onsetDiscardedSamples >= 0) {
            "voice result counts are invalid"
        }
        require(elapsedNs >= 0L && producerBlockedNs >= 0L && decoderNs >= 0L) { "voice result timing is invalid" }
        require(queueHighWatermarkFrames >= 0) { "voice result queue watermark is invalid" }
    }
}

internal fun interface TalosVoiceEngineCancellation {
    fun isCancelled(): Boolean
}

internal interface TalosVoiceEngineCallback {
    fun onStage(metric: TalosVoiceEngineStageMetric)
    fun onPcm(frame: TalosVoiceEngineFrame): Boolean
}

internal interface TalosNeuralVoiceEngine {
    val backend: String

    fun synthesize(
        request: TalosVoiceEngineRequest,
        cancellation: TalosVoiceEngineCancellation,
        callback: TalosVoiceEngineCallback,
    ): TalosVoiceEngineResult
}

internal data class TalosVoiceEngineRoute(
    val backend: String,
    val payload: TalosVoiceBackendPayload,
    val pocketModelRoot: File?,
    val fallbackReason: String?,
) {
    init {
        require(backend == payload.backend) { "voice route backend differs from payload" }
        require((backend == TalosPocketConditioningPayload.BACKEND) == (pocketModelRoot != null)) {
            "Pocket model root must exist only for a Pocket route"
        }
        require(fallbackReason == null || backend == TalosMossPromptPayload.BACKEND) {
            "only a fallback route may carry a fallback reason"
        }
    }
}

internal object TalosVoiceEngineRouter {
    fun select(
        profile: TalosVoiceProfileV2,
        requestedLocale: String,
        pocketStatus: TalosPocketModelStatus,
        mossCompatible: Boolean,
    ): TalosVoiceEngineRoute {
        val pocket = profile.backendPayloads.filterIsInstance<TalosPocketConditioningPayload>().singleOrNull()
        val moss = profile.backendPayloads.filterIsInstance<TalosMossPromptPayload>().singleOrNull()
        val pocketFailure = when {
            profile.header.preferredBackend != TalosPocketConditioningPayload.BACKEND -> "pocketNotPreferred"
            !isItalian(requestedLocale) -> "pocketLocaleUnsupported:$requestedLocale"
            !isItalian(profile.header.language) -> "pocketProfileLanguageUnsupported:${profile.header.language}"
            pocket == null -> "pocketPayloadMissing"
            pocketStatus is TalosPocketModelStatus.Missing ->
                "pocketModelMissing:${pocketStatus.path}"
            pocketStatus is TalosPocketModelStatus.Corrupt ->
                "pocketModelCorrupt:${pocketStatus.path}:${pocketStatus.reason}"
            pocketStatus is TalosPocketModelStatus.Ready && pocketStatus.verifiedFiles <= 0 -> "pocketModelUnverified"
            pocketStatus is TalosPocketModelStatus.Ready -> {
                return TalosVoiceEngineRoute(
                    backend = TalosPocketConditioningPayload.BACKEND,
                    payload = pocket,
                    pocketModelRoot = pocketStatus.root,
                    fallbackReason = null,
                )
            }
            else -> "pocketModelUnverified"
        }
        if (moss != null && mossCompatible) {
            return TalosVoiceEngineRoute(
                backend = TalosMossPromptPayload.BACKEND,
                payload = moss,
                pocketModelRoot = null,
                fallbackReason = pocketFailure,
            )
        }
        throw IllegalStateException("no verified voice backend: pocket=$pocketFailure mossCompatible=$mossCompatible")
    }

    private fun isItalian(locale: String): Boolean = locale.substringBefore('-').equals("it", ignoreCase = true)
}
