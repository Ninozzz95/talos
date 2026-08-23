package ai.talos.voice


internal data class TalosPocketModelStatusSnapshot(
    val status: TalosPocketModelStatus,
    val cacheHit: Boolean,
    val verificationStartedAtNs: Long,
    val verificationDurationNs: Long,
    val verificationThreadName: String,
) {
    init {
        require(verificationStartedAtNs >= 0L) { "Pocket verification start is invalid" }
        require(verificationDurationNs >= 0L) { "Pocket verification duration is invalid" }
        require(verificationThreadName.isNotBlank()) { "Pocket verification thread is missing" }
    }
}


internal data class TalosVoiceModelAvailability(
    val supported: Boolean,
    val installed: Boolean,
    val backend: String,
    val engineBuild: String,
    val modelState: String,
    val verifiedFiles: Int,
    val cacheHit: Boolean,
    val verificationDurationNs: Long,
    val failure: String?,
)


internal data class TalosVoiceProfileAvailability(
    val compatible: Boolean,
    val resolvedBackend: String?,
    val fallbackReason: String?,
    val incompatibilityReason: String?,
)


internal object TalosVoiceAvailabilityResolver {
    fun forModel(snapshot: TalosPocketModelStatusSnapshot): TalosVoiceModelAvailability {
        val status = snapshot.status
        val verifiedFiles = (status as? TalosPocketModelStatus.Ready)?.verifiedFiles ?: 0
        val state = when (status) {
            is TalosPocketModelStatus.Missing -> "missing"
            is TalosPocketModelStatus.Corrupt -> "corrupt"
            is TalosPocketModelStatus.Ready -> if (status.verifiedFiles > 0) "ready" else "unverified"
        }
        val failure = when (status) {
            is TalosPocketModelStatus.Missing -> "Pocket model file is missing: ${status.path}"
            is TalosPocketModelStatus.Corrupt ->
                "Pocket model file is corrupt: ${status.path}:${status.reason}"
            is TalosPocketModelStatus.Ready ->
                if (status.verifiedFiles > 0) null else "Pocket model bundle has no hash-verified files"
        }
        return TalosVoiceModelAvailability(
            supported = true,
            installed = state == "ready",
            backend = TalosPocketConditioningPayload.BACKEND,
            engineBuild = TalosPocketConditioningPayload.REVISION,
            modelState = state,
            verifiedFiles = verifiedFiles,
            cacheHit = snapshot.cacheHit,
            verificationDurationNs = snapshot.verificationDurationNs,
            failure = failure,
        )
    }

    fun forProfile(
        profile: TalosVoiceProfileV2,
        pocketStatus: TalosPocketModelStatus,
        mossCompatible: Boolean,
    ): TalosVoiceProfileAvailability = try {
        val route = TalosVoiceEngineRouter.select(
            profile = profile,
            requestedLocale = profile.header.language,
            pocketStatus = pocketStatus,
            mossCompatible = mossCompatible,
        )
        TalosVoiceProfileAvailability(
            compatible = true,
            resolvedBackend = route.backend,
            fallbackReason = route.fallbackReason,
            incompatibilityReason = null,
        )
    } catch (error: IllegalStateException) {
        TalosVoiceProfileAvailability(
            compatible = false,
            resolvedBackend = null,
            fallbackReason = null,
            incompatibilityReason = error.message ?: "no verified voice backend",
        )
    }
}
