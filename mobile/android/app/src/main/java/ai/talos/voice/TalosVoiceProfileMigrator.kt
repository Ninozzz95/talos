package ai.talos.voice

internal data class TalosDecodedVoiceReference(
    val pcmFloatMono: FloatArray,
    val sampleRate: Int,
)

internal fun interface TalosLegacyReferenceDecoder {
    fun decode(promptAudioCodes: List<IntArray>): TalosDecodedVoiceReference
}

internal fun interface TalosPocketReferenceEncoder {
    fun encode(pcmFloatMono: FloatArray, sampleRate: Int): TalosPocketConditioningPayload
}

internal fun interface TalosVoiceProfileMigrationCancellation {
    fun isCancelled(): Boolean
}

internal fun interface TalosVoiceProfileMigrationCommitter {
    fun commit(expectedLegacy: TalosVoiceProfileV1, candidate: TalosVoiceProfileV2): TalosVoiceProfileV2
}

internal data class TalosVoiceProfileMigrationMetric(
    val stage: String,
    val durationNs: Long,
) {
    init {
        require(STAGE.matches(stage)) { "voice profile migration stage is invalid" }
        require(durationNs >= 0L) { "voice profile migration duration is invalid" }
    }

    private companion object {
        val STAGE = Regex("^[a-z][a-z0-9_]{0,95}$")
    }
}

internal data class TalosVoiceProfilePreview(
    val cancelled: Boolean,
    val resolvedEngine: String?,
    val resolvedLocale: String?,
    val resolvedProfileId: String?,
    val fallbackReason: String?,
)

internal data class TalosVoiceProfileMigrationOutcome(
    val profile: TalosVoiceProfileV2,
    val preview: TalosVoiceProfilePreview,
)

internal class TalosVoiceProfileMigrationCancelledException : RuntimeException("voice profile migration cancelled")

/**
 * Converts an immutable V1 snapshot without knowing about Android, ORT or
 * profile files. Production supplies the already-pinned MOSS decoder,
 * Pocket Mimi encoder and AtomicFile committer. This boundary owns the
 * ordering that must not drift: decode -> encode -> zero transient PCM ->
 * exact Pocket preview -> atomic commit.
 */
internal class TalosVoiceProfileMigrator(
    private val decoder: TalosLegacyReferenceDecoder,
    private val encoder: TalosPocketReferenceEncoder,
) {
    fun migrate(
        legacy: TalosVoiceProfileV1,
        requestedLocale: String,
        cancellation: TalosVoiceProfileMigrationCancellation,
        preview: (TalosVoiceProfileV2) -> TalosVoiceProfilePreview,
        commit: TalosVoiceProfileMigrationCommitter,
        onMetric: (TalosVoiceProfileMigrationMetric) -> Unit = {},
    ): TalosVoiceProfileMigrationOutcome {
        require(requestedLocale.isNotBlank()) { "voice profile migration locale is blank" }
        ensureActive(cancellation)
        val decoded = timed("moss_reference_decode", onMetric) {
            decoder.decode(legacy.promptAudioCodes.map(IntArray::copyOf))
        }
        val pocket = try {
            require(decoded.sampleRate in 8_000..192_000) { "decoded V1 reference sample rate is invalid" }
            require(decoded.pcmFloatMono.isNotEmpty()) { "decoded V1 reference is empty" }
            require(decoded.pcmFloatMono.size <= decoded.sampleRate * MAX_REFERENCE_SECONDS) {
                "decoded V1 reference exceeds Pocket's duration limit"
            }
            require(decoded.pcmFloatMono.all(Float::isFinite)) { "decoded V1 reference contains non-finite PCM" }
            ensureActive(cancellation)
            timed("pocket_reference_encode", onMetric) {
                encoder.encode(decoded.pcmFloatMono, decoded.sampleRate)
            }
        } finally {
            val zeroStartedAtNs = System.nanoTime()
            decoded.pcmFloatMono.fill(0f)
            onMetric(
                TalosVoiceProfileMigrationMetric(
                    stage = "profile_migration_pcm_zeroed",
                    durationNs = System.nanoTime() - zeroStartedAtNs,
                ),
            )
        }

        ensureActive(cancellation)
        val candidate = TalosVoiceProfileV2.migratedFrom(legacy, pocket)
        val observedPreview = timed("profile_migration_preview", onMetric) { preview(candidate) }
        if (observedPreview.cancelled || cancellation.isCancelled()) {
            throw TalosVoiceProfileMigrationCancelledException()
        }
        check(observedPreview.resolvedEngine == TalosPocketConditioningPayload.BACKEND) {
            "voice profile migration preview did not use Pocket"
        }
        check(observedPreview.resolvedLocale == requestedLocale) {
            "voice profile migration preview changed the selected locale"
        }
        check(observedPreview.resolvedProfileId == legacy.header.profileId) {
            "voice profile migration preview changed the selected profile"
        }
        check(observedPreview.fallbackReason == null) {
            "voice profile migration preview used a fallback"
        }

        ensureActive(cancellation)
        val committed = timed("profile_migration_commit", onMetric) {
            commit.commit(legacy, candidate)
        }
        check(committed == candidate) { "voice profile migration committer returned a different profile" }
        return TalosVoiceProfileMigrationOutcome(committed, observedPreview)
    }

    private fun ensureActive(cancellation: TalosVoiceProfileMigrationCancellation) {
        if (cancellation.isCancelled()) throw TalosVoiceProfileMigrationCancelledException()
    }

    private inline fun <T> timed(
        stage: String,
        onMetric: (TalosVoiceProfileMigrationMetric) -> Unit,
        block: () -> T,
    ): T {
        val startedAtNs = System.nanoTime()
        return try {
            block()
        } finally {
            onMetric(TalosVoiceProfileMigrationMetric(stage, System.nanoTime() - startedAtNs))
        }
    }

    private companion object {
        const val MAX_REFERENCE_SECONDS = 20
    }
}
