package ai.talos.voice

import java.util.UUID

internal fun interface TalosPocketEnrollmentReferenceEncoder {
    fun encode(
        pcmFloatMono: FloatArray,
        sampleRate: Int,
        onStage: (TalosVoiceEnrollmentStageMetric) -> Unit,
    ): TalosPocketConditioningPayload
}

internal fun interface TalosVoiceEnrollmentCancellation {
    fun isCancelled(): Boolean
}

internal class TalosVoiceEnrollmentCancelledException : RuntimeException("voice enrollment cancelled")

internal data class TalosVoiceEnrollmentStageMetric(
    val stage: String,
    val startedAtNs: Long,
    val durationNs: Long,
    val threadName: String,
    val inputFrames: Int? = null,
    val outputSamples: Int? = null,
) {
    init {
        require(STAGE.matches(stage)) { "voice enrollment stage is invalid" }
        require(startedAtNs > 0L) { "voice enrollment stage start is invalid" }
        require(durationNs >= 0L) { "voice enrollment stage duration is invalid" }
        require(threadName.isNotBlank()) { "voice enrollment stage thread is blank" }
        require(inputFrames == null || inputFrames >= 0) { "voice enrollment stage input count is invalid" }
        require(outputSamples == null || outputSamples >= 0) { "voice enrollment stage output count is invalid" }
    }

    private companion object {
        val STAGE = Regex("^[a-z][a-z0-9_]{0,95}$")
    }
}

internal data class TalosVoiceEnrollmentBuildResult(
    val profile: TalosVoiceProfileV2,
    val sourceSampleRate: Int,
    val sourceSamples: Int,
    val referenceSamples: Int,
    val stageMetrics: List<TalosVoiceEnrollmentStageMetric>,
) {
    init {
        require(sourceSampleRate in 8_000..192_000) { "voice enrollment source sample rate is invalid" }
        require(sourceSamples > 0) { "voice enrollment source sample count is invalid" }
        require(referenceSamples in 1..sourceSamples) { "voice enrollment reference sample count is invalid" }
        require(stageMetrics.isNotEmpty()) { "voice enrollment stage metrics are empty" }
    }

    val referenceDurationMs: Long
        get() = referenceSamples.toLong() * 1_000L / sourceSampleRate

    val conditioningFrames: Int
        get() = profile.pocketPayload().shape[1].toInt()

    val conditioningDimension: Int
        get() = profile.pocketPayload().shape[2].toInt()
}

/**
 * Pure capture-to-profile boundary. Android recording, ORT ownership and
 * encrypted persistence stay outside; this class owns the ordering and the
 * transient PCM lifetime shared by all of those adapters.
 */
internal class TalosPocketEnrollmentProfileBuilder(
    private val encoder: TalosPocketEnrollmentReferenceEncoder,
    private val profileIdFactory: () -> String = { UUID.randomUUID().toString() },
    private val currentTimeMillis: () -> Long = System::currentTimeMillis,
    private val monotonicNanos: () -> Long = System::nanoTime,
    private val currentThreadName: () -> String = { Thread.currentThread().name },
    private val pcm16Factory: (Int) -> ShortArray = { ShortArray(it) },
    private val pcmFloatFactory: (Int) -> FloatArray = { FloatArray(it) },
) {
    fun build(
        acceptedPhrases: List<TalosVoiceCaptureResult>,
        displayName: String,
        language: String,
        style: String,
        consentVersion: Int,
        cancellation: TalosVoiceEnrollmentCancellation = TalosVoiceEnrollmentCancellation { false },
        onStage: (TalosVoiceEnrollmentStageMetric) -> Unit = {},
    ): TalosVoiceEnrollmentBuildResult {
        require(acceptedPhrases.isNotEmpty()) { "cannot build a profile from zero accepted phrases" }
        require(isItalianLocale(language)) { "Pocket enrollment requires an Italian locale, got $language" }
        require(acceptedPhrases.none(TalosVoiceCaptureResult::cancelled)) {
            "a cancelled capture cannot be used for voice enrollment"
        }
        val sampleRate = acceptedPhrases.first().sampleRate
        require(sampleRate in 8_000..192_000) { "voice enrollment sample rate is invalid: $sampleRate" }
        require(acceptedPhrases.all { it.sampleRate == sampleRate }) {
            "all accepted phrases must share one sample rate, got ${acceptedPhrases.map { it.sampleRate }}"
        }
        val totalSamplesLong = acceptedPhrases.sumOf { it.pcm16Mono.size.toLong() }
        require(totalSamplesLong in 1..Int.MAX_VALUE.toLong()) { "voice enrollment sample count is invalid" }
        val totalSamples = totalSamplesLong.toInt()
        val referenceSamples = minOf(totalSamples, MAX_REFERENCE_SECONDS * sampleRate)
        val measuredStages = mutableListOf<TalosVoiceEnrollmentStageMetric>()

        fun record(metric: TalosVoiceEnrollmentStageMetric) {
            measuredStages += metric
            onStage(metric)
        }

        fun ensureActive() {
            if (cancellation.isCancelled()) throw TalosVoiceEnrollmentCancelledException()
        }

        var mergedPcm16: ShortArray? = null
        var referencePcmFloat: FloatArray? = null
        var completedProfile: TalosVoiceProfileV2? = null
        try {
            ensureActive()
            measured(
                stage = "enrollment_reference_assemble",
                inputFrames = totalSamples,
                outputSamples = totalSamples,
                record = ::record,
            ) {
                val target = pcm16Factory(totalSamples)
                mergedPcm16 = target
                var offset = 0
                acceptedPhrases.forEach { phrase ->
                    phrase.pcm16Mono.copyInto(target, destinationOffset = offset)
                    offset += phrase.pcm16Mono.size
                }
            }
            ensureActive()

            val mergedQuality = measured(
                stage = "enrollment_quality_gate",
                inputFrames = totalSamples,
                outputSamples = totalSamples,
                record = ::record,
            ) {
                TalosVoiceQuality.evaluate(
                    TalosVoiceCaptureResult(
                        pcm16Mono = requireNotNull(mergedPcm16),
                        sampleRate = sampleRate,
                        clientSilencedObserved = acceptedPhrases.any { it.clientSilencedObserved },
                        droppedReadCount = acceptedPhrases.sumOf { it.droppedReadCount },
                        cancelled = false,
                    ),
                )
            }
            require(mergedQuality.accepted) {
                "merged reference failed quality gate: ${mergedQuality.rejectionReasons}"
            }
            ensureActive()

            measured(
                stage = "enrollment_pcm_convert",
                inputFrames = referenceSamples,
                outputSamples = referenceSamples,
                record = ::record,
            ) {
                val source = requireNotNull(mergedPcm16)
                val target = pcmFloatFactory(referenceSamples)
                referencePcmFloat = target
                for (index in target.indices) target[index] = source[index] / 32768f
            }
            ensureActive()

            val encodeStartedAtNs = monotonicNanos()
            var pocket: TalosPocketConditioningPayload? = null
            try {
                pocket = encoder.encode(requireNotNull(referencePcmFloat), sampleRate, ::record)
                ensureActive()
                completedProfile = TalosVoiceProfileV2(
                    header = TalosVoiceProfileHeaderV2(
                        schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                        profileId = profileIdFactory(),
                        displayName = displayName,
                        language = language,
                        style = style,
                        preferredBackend = TalosPocketConditioningPayload.BACKEND,
                        createdAtEpochMs = currentTimeMillis(),
                        enrollmentDurationMs = Math.toIntExact(mergedQuality.metrics.durationMs),
                        consentVersion = consentVersion,
                        migratedFromSchemaVersion = null,
                    ),
                    qualityMetrics = mergedQuality.metrics,
                    backendPayloads = listOf(pocket),
                )
            } finally {
                record(
                    TalosVoiceEnrollmentStageMetric(
                        stage = "pocket_reference_encode",
                        startedAtNs = encodeStartedAtNs,
                        durationNs = monotonicNanos() - encodeStartedAtNs,
                        threadName = currentThreadName(),
                        inputFrames = referenceSamples,
                        outputSamples = pocket?.shape?.get(1)?.toInt(),
                    ),
                )
            }
        } finally {
            if (mergedPcm16 != null || referencePcmFloat != null) {
                val zeroStartedAtNs = monotonicNanos()
                mergedPcm16?.fill(0)
                referencePcmFloat?.fill(0f)
                record(
                    TalosVoiceEnrollmentStageMetric(
                        stage = "enrollment_pcm_zeroed",
                        startedAtNs = zeroStartedAtNs,
                        durationNs = monotonicNanos() - zeroStartedAtNs,
                        threadName = currentThreadName(),
                        inputFrames = mergedPcm16?.size,
                        outputSamples = referencePcmFloat?.size,
                    ),
                )
            }
        }
        return TalosVoiceEnrollmentBuildResult(
            profile = requireNotNull(completedProfile),
            sourceSampleRate = sampleRate,
            sourceSamples = totalSamples,
            referenceSamples = referenceSamples,
            stageMetrics = measuredStages.sortedBy(TalosVoiceEnrollmentStageMetric::startedAtNs).toList(),
        )
    }

    private inline fun <T> measured(
        stage: String,
        inputFrames: Int?,
        outputSamples: Int?,
        record: (TalosVoiceEnrollmentStageMetric) -> Unit,
        block: () -> T,
    ): T {
        val startedAtNs = monotonicNanos()
        return try {
            block()
        } finally {
            record(
                TalosVoiceEnrollmentStageMetric(
                    stage = stage,
                    startedAtNs = startedAtNs,
                    durationNs = monotonicNanos() - startedAtNs,
                    threadName = currentThreadName(),
                    inputFrames = inputFrames,
                    outputSamples = outputSamples,
                ),
            )
        }
    }

    private fun isItalianLocale(locale: String): Boolean =
        locale.substringBefore('-').equals("it", ignoreCase = true)

    private companion object {
        const val MAX_REFERENCE_SECONDS = 12
    }
}
