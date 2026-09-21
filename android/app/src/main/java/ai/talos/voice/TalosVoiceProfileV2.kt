package ai.talos.voice


internal data class TalosVoiceProfileHeaderV2(
    val schemaVersion: Int,
    val profileId: String,
    val displayName: String,
    val language: String,
    val style: String,
    val preferredBackend: String,
    val createdAtEpochMs: Long,
    val enrollmentDurationMs: Int,
    val consentVersion: Int,
    val migratedFromSchemaVersion: Int?,
) {
    init {
        require(schemaVersion == SCHEMA_VERSION) { "voice profile schemaVersion must be $SCHEMA_VERSION" }
        require(profileId.isNotBlank() && profileId.length <= 128) { "voice profile id is invalid" }
        require(displayName.isNotBlank() && displayName.length <= 160) { "voice profile display name is invalid" }
        require(LOCALE.matches(language)) { "voice profile language is invalid: $language" }
        require(style.isNotBlank() && style.length <= 64) { "voice profile style is invalid" }
        require(preferredBackend in TalosVoiceBackendPayload.SUPPORTED_BACKENDS) {
            "voice profile preferred backend is unsupported: $preferredBackend"
        }
        require(createdAtEpochMs >= 0L) { "voice profile creation time is invalid" }
        require(enrollmentDurationMs > 0) { "voice profile enrollment duration is invalid" }
        require(consentVersion > 0) { "voice profile consent version is invalid" }
        require(migratedFromSchemaVersion == null || migratedFromSchemaVersion in 1 until SCHEMA_VERSION) {
            "voice profile migration origin is invalid"
        }
    }

    companion object {
        const val SCHEMA_VERSION = 2
        private val LOCALE = Regex("^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    }
}


internal sealed interface TalosVoiceBackendPayload {
    val backend: String

    companion object {
        val SUPPORTED_BACKENDS = setOf(TalosMossPromptPayload.BACKEND, TalosPocketConditioningPayload.BACKEND)
    }
}


internal class TalosMossPromptPayload(
    val codecFingerprint: String,
    val promptSchemaFingerprint: String,
    val frameRateMilliHz: Int,
    val quantizerCount: Int,
    val codebookSize: Int,
    promptAudioCodes: List<IntArray>,
) : TalosVoiceBackendPayload {
    override val backend: String = BACKEND
    private val codes = promptAudioCodes.map(IntArray::copyOf)
    val promptAudioCodes: List<IntArray>
        get() = codes.map(IntArray::copyOf)

    init {
        require(SHA256.matches(codecFingerprint)) { "MOSS codec fingerprint is invalid" }
        require(SHA256.matches(promptSchemaFingerprint)) { "MOSS prompt schema fingerprint is invalid" }
        require(frameRateMilliHz == -1 || frameRateMilliHz > 0) { "MOSS frame rate is invalid" }
        require(quantizerCount in 1..64) { "MOSS quantizer count is invalid" }
        require(codebookSize == -1 || codebookSize > 0) { "MOSS codebook size is invalid" }
        require(codes.size in 1..MAX_FRAMES) { "MOSS prompt frame count is invalid" }
        require(codes.all { it.size == quantizerCount }) { "MOSS prompt row width differs from quantizer count" }
        require(codes.all { row -> row.all { code -> code >= 0 && (codebookSize < 0 || code < codebookSize) } }) {
            "MOSS prompt contains an invalid code"
        }
    }

    override fun equals(other: Any?): Boolean = other is TalosMossPromptPayload &&
        codecFingerprint == other.codecFingerprint &&
        promptSchemaFingerprint == other.promptSchemaFingerprint &&
        frameRateMilliHz == other.frameRateMilliHz &&
        quantizerCount == other.quantizerCount &&
        codebookSize == other.codebookSize &&
        codes.size == other.codes.size &&
        codes.indices.all { codes[it].contentEquals(other.codes[it]) }

    override fun hashCode(): Int = codes.fold(
        31 * (31 * codecFingerprint.hashCode() + promptSchemaFingerprint.hashCode()) + quantizerCount,
    ) { hash, row -> 31 * hash + row.contentHashCode() }

    companion object {
        const val BACKEND = "moss-tts-nano"
        const val MAX_FRAMES = 4_000
        private val SHA256 = Regex("^[0-9a-f]{64}$")
    }
}


internal class TalosPocketConditioningPayload(
    val repository: String,
    val revision: String,
    val sampleRate: Int,
    shape: LongArray,
    values: FloatArray,
) : TalosVoiceBackendPayload {
    override val backend: String = BACKEND
    val shape: LongArray = shape.copyOf()
    private val values = values.copyOf()

    init {
        require(repository == REPOSITORY) { "Pocket conditioning repository is not pinned" }
        require(revision == REVISION) { "Pocket conditioning revision is not pinned" }
        require(sampleRate == SAMPLE_RATE) { "Pocket conditioning sample rate is not pinned" }
        require(
            this.shape.size == 3 && this.shape[0] == 1L &&
                this.shape[1] in 1L..MAX_CONDITIONING_FRAMES.toLong() &&
                this.shape[2] == CONDITIONING_DIM.toLong(),
        ) { "Pocket conditioning shape must be [1, 1..$MAX_CONDITIONING_FRAMES, $CONDITIONING_DIM]" }
        val expected = Math.multiplyExact(this.shape[1], this.shape[2]).toInt()
        require(this.values.size == expected) { "Pocket conditioning value count differs from shape" }
        require(this.values.all(Float::isFinite)) { "Pocket conditioning contains non-finite values" }
    }

    fun valuesCopy(): FloatArray = values.copyOf()

    override fun equals(other: Any?): Boolean = other is TalosPocketConditioningPayload &&
        repository == other.repository && revision == other.revision && sampleRate == other.sampleRate &&
        shape.contentEquals(other.shape) && values.contentEquals(other.values)

    override fun hashCode(): Int = 31 * (31 * revision.hashCode() + shape.contentHashCode()) + values.contentHashCode()

    companion object {
        const val BACKEND = "pocket-v2"
        const val REPOSITORY = "KevinAHM/pocket-tts-onnx"
        const val REVISION = "58a6d00cf13d239b6748cb0769f35c580a8f606c"
        const val SAMPLE_RATE = 24_000
        const val CONDITIONING_DIM = 1_024
        const val MAX_CONDITIONING_FRAMES = 256
    }
}


internal data class TalosVoiceProfileV2(
    val header: TalosVoiceProfileHeaderV2,
    val qualityMetrics: TalosVoiceQualityMetrics,
    val backendPayloads: List<TalosVoiceBackendPayload>,
) {
    init {
        require(backendPayloads.isNotEmpty()) { "voice profile V2 requires a backend payload" }
        require(backendPayloads.size <= TalosVoiceBackendPayload.SUPPORTED_BACKENDS.size) {
            "voice profile V2 has too many backend payloads"
        }
        require(backendPayloads.map { it.backend }.toSet().size == backendPayloads.size) {
            "voice profile V2 contains a duplicate backend payload"
        }
        require(backendPayloads.all { it.backend in TalosVoiceBackendPayload.SUPPORTED_BACKENDS }) {
            "voice profile V2 contains an unsupported backend payload"
        }
        require(backendPayloads.any { it.backend == header.preferredBackend }) {
            "voice profile V2 preferred backend payload is missing"
        }
    }

    fun mossPayload(): TalosMossPromptPayload = backendPayloads.filterIsInstance<TalosMossPromptPayload>().single()
    fun pocketPayload(): TalosPocketConditioningPayload = backendPayloads.filterIsInstance<TalosPocketConditioningPayload>().single()

    companion object {
        fun migratedFrom(
            legacy: TalosVoiceProfileV1,
            pocket: TalosPocketConditioningPayload,
        ): TalosVoiceProfileV2 {
            val source = legacy.header
            require(source.schemaVersion == 1) { "only a V1 voice profile can be migrated" }
            require(source.backend == TalosMossPromptPayload.BACKEND) { "legacy voice profile backend is unsupported" }
            require(source.frameCount == legacy.promptAudioCodes.size) { "legacy voice profile frame count differs" }
            val moss = TalosMossPromptPayload(
                codecFingerprint = source.codecFingerprint,
                promptSchemaFingerprint = source.promptSchemaFingerprint,
                frameRateMilliHz = source.frameRateMilliHz,
                quantizerCount = source.quantizerCount,
                codebookSize = source.codebookSize,
                promptAudioCodes = legacy.promptAudioCodes,
            )
            return TalosVoiceProfileV2(
                header = TalosVoiceProfileHeaderV2(
                    schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                    profileId = source.profileId,
                    displayName = source.displayName,
                    language = source.language,
                    style = source.style,
                    preferredBackend = TalosPocketConditioningPayload.BACKEND,
                    createdAtEpochMs = source.createdAtEpochMs,
                    enrollmentDurationMs = source.enrollmentDurationMs,
                    consentVersion = source.consentVersion,
                    migratedFromSchemaVersion = source.schemaVersion,
                ),
                qualityMetrics = legacy.qualityMetrics,
                backendPayloads = listOf(moss, pocket),
            )
        }
    }
}


internal sealed interface TalosStoredVoiceProfile {
    val profileId: String

    data class Legacy(val profile: TalosVoiceProfileV1) : TalosStoredVoiceProfile {
        override val profileId: String get() = profile.header.profileId
    }

    data class Current(val profile: TalosVoiceProfileV2) : TalosStoredVoiceProfile {
        override val profileId: String get() = profile.header.profileId
    }
}
