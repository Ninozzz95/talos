package ai.talos.voice.research

import ai.onnxruntime.OrtEnvironment
import android.system.Os
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

internal data class TalosVoiceDiagnosticRoute(
    val traceId: String,
    val readingId: String,
    val source: String,
    val requestedLocale: String,
    val requestedEngine: String,
    val requestedProfileId: String?,
) {
    init {
        require(traceId.matches(SAFE_ID)) { "traceId is not a safe diagnostic identifier" }
        require(readingId.matches(SAFE_ID)) { "readingId is not a safe diagnostic identifier" }
        require(source in SOURCES) { "unsupported diagnostic source: $source" }
        require(requestedLocale.matches(LOCALE)) { "invalid requested locale: $requestedLocale" }
        require(requestedEngine == "system" || requestedEngine == "personal") {
            "invalid requested engine: $requestedEngine"
        }
    }

    private companion object {
        val SAFE_ID = Regex("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")
        val LOCALE = Regex("[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*")
        val SOURCES = setOf("chat", "assistant", "manual", "preview", "instrumentation")
    }
}

internal data class TalosVoiceDiagnosticConfig(
    val outputDirectory: File,
    val route: TalosVoiceDiagnosticRoute,
    val appVersion: String,
    val appCommit: String,
    val apkSha256: String,
    val modelRevision: String,
    val modelSha256: String,
    val deviceFingerprint: String,
    val usbTransportProof: String,
) {
    init {
        require(appVersion.isNotBlank()) { "appVersion must not be blank" }
        require(appCommit.matches(GIT_OBJECT)) { "appCommit must be a full lowercase Git object id" }
        require(apkSha256.matches(SHA256)) { "apkSha256 must be lowercase SHA-256" }
        require(modelRevision.isNotBlank()) { "modelRevision must not be blank" }
        require(modelSha256.matches(SHA256)) { "modelSha256 must be lowercase SHA-256" }
        require(deviceFingerprint.isNotBlank()) { "deviceFingerprint must not be blank" }
        require(usbTransportProof.startsWith("USB\\", ignoreCase = true)) {
            "usbTransportProof must be a positive host USB instance"
        }
    }

    val artifactFile: File get() = File(outputDirectory, "${route.traceId}.json")

    private companion object {
        val GIT_OBJECT = Regex("[0-9a-f]{40,64}")
        val SHA256 = Regex("[0-9a-f]{64}")
    }
}

internal data class TalosVoiceDiagnosticAnswers(
    val dominantGraph: String,
    val decodeCacheSlope: String,
    val outsideOrt: String,
    val arOnlyRtf: String,
    val underrunCause: String,
    val selectedVoiceUsed: Boolean?,
    val selectedLocaleUsed: Boolean?,
    val italianSemanticsPreserved: Boolean?,
    val cancelTailMs: Double?,
    val longReadRealtime: Boolean?,
)

internal data class TalosVoiceDiagnosticOutcome(
    val termination: String,
    val resolvedEngine: String,
    val resolvedLocale: String,
    val resolvedProfileId: String?,
    val fallbackReason: String? = null,
    val eventCount: Int,
    val answers: TalosVoiceDiagnosticAnswers,
    val resolvedProfileSchemaVersion: Int? = null,
    val profileMigrationCommitted: Boolean? = null,
)

internal data class TalosVoiceDiagnosticArtifact(
    val schemaVersion: Int,
    val generatedAtUtc: String,
    val startedAtElapsedRealtimeNs: Long,
    val finishedAtElapsedRealtimeNs: Long,
    val config: TalosVoiceDiagnosticConfig,
    val events: List<TalosVoiceDiagnosticEvent>,
    val outcome: TalosVoiceDiagnosticOutcome,
)

internal object TalosVoiceDiagnosticArtifactWriter {
    fun writeAtomic(file: File, artifact: TalosVoiceDiagnosticArtifact): File {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, ".${file.name}.${System.nanoTime()}.tmp")
        try {
            temporary.writeText(toJson(artifact).toString(2), Charsets.UTF_8)
            Os.rename(temporary.absolutePath, file.absolutePath)
            return file
        } finally {
            if (temporary.exists()) temporary.delete()
        }
    }

    private fun toJson(value: TalosVoiceDiagnosticArtifact): JSONObject = JSONObject()
        .put("schemaVersion", value.schemaVersion)
        .put("generatedAtUtc", value.generatedAtUtc)
        .put("startedAtElapsedRealtimeNs", value.startedAtElapsedRealtimeNs)
        .put("finishedAtElapsedRealtimeNs", value.finishedAtElapsedRealtimeNs)
        .put("wallNs", (value.finishedAtElapsedRealtimeNs - value.startedAtElapsedRealtimeNs).coerceAtLeast(0L))
        .put("provenance", provenanceToJson(value.config))
        .put("route", routeToJson(value.config.route, value.outcome))
        .put("events", JSONArray(value.events.map(::eventToJson)))
        .put("outcome", outcomeToJson(value.outcome))
        .put("answers", answersToJson(value.outcome.answers))

    private fun provenanceToJson(value: TalosVoiceDiagnosticConfig): JSONObject = JSONObject()
        .put("appVersion", value.appVersion)
        .put("appCommit", value.appCommit)
        .put("apkSha256", value.apkSha256)
        .put("modelRevision", value.modelRevision)
        .put("modelSha256", value.modelSha256)
        .put("ortVersion", OrtEnvironment.getEnvironment().version)
        .put("deviceFingerprint", value.deviceFingerprint)
        .put("usbTransportProof", value.usbTransportProof)

    private fun routeToJson(
        route: TalosVoiceDiagnosticRoute,
        outcome: TalosVoiceDiagnosticOutcome,
    ): JSONObject = JSONObject()
        .put("traceId", route.traceId)
        .put("readingId", route.readingId)
        .put("source", route.source)
        .put("requestedLocale", route.requestedLocale)
        .put("requestedEngine", route.requestedEngine)
        .put("requestedProfileIdSha256", hashNullable(route.requestedProfileId))
        .put("resolvedLocale", outcome.resolvedLocale)
        .put("resolvedEngine", outcome.resolvedEngine)
        .put("resolvedProfileIdSha256", hashNullable(outcome.resolvedProfileId))
        .putNullable("fallbackReason", outcome.fallbackReason)
        .putNullable("resolvedProfileSchemaVersion", outcome.resolvedProfileSchemaVersion)
        .putNullable("profileMigrationCommitted", outcome.profileMigrationCommitted)

    private fun eventToJson(value: TalosVoiceDiagnosticEvent): JSONObject = JSONObject()
        .put("sequence", value.sequence)
        .put("kind", value.kind.name)
        .put("stage", value.stage)
        .put("atElapsedRealtimeNs", value.atElapsedRealtimeNs)
        .put("threadName", value.threadName)
        .putNullable("durationNs", value.durationNs)
        .putNullable("sentenceIndex", value.sentenceIndex)
        .putNullable("frameIndex", value.frameIndex)
        .putNullable("tokenPosition", value.tokenPosition)
        .putNullable("requestedFrames", value.requestedFrames)
        .putNullable("writtenFrames", value.writtenFrames)
        .putNullable("queueDepthFrames", value.queueDepthFrames)
        .putNullable("queueCapacityFrames", value.queueCapacityFrames)
        .putNullable("startThresholdFrames", value.startThresholdFrames)
        .putNullable("playbackHeadFrames", value.playbackHeadFrames)
        .putNullable("playbackBoundaryFrames", value.playbackBoundaryFrames)
        .putNullable("playbackCompletionSource", value.playbackCompletionSource)
        .putNullable("terminalDrainRemainingFrames", value.terminalDrainRemainingFrames)
        .putNullable("terminalDrainExpectedNs", value.terminalDrainExpectedNs)
        .putNullable("underrunCount", value.underrunCount)
        .putNullable("cancellationGeneration", value.cancellationGeneration)
        .putNullable("samplingSeed", value.samplingSeed)
        .putNullable("levelGainDb", value.levelGainDb)
        .putNullable("limiterCeilingDbfs", value.limiterCeilingDbfs)
        .putNullable("inputPeakAbs", value.inputPeakAbs)
        .putNullable("outputPeakAbs", value.outputPeakAbs)
        .putNullable("limitedSampleFrames", value.limitedSampleFrames)
        .putNullable("limiterGainReductionDb", value.limiterGainReductionDb)
        .putNullable("onsetDiscardedSamples", value.onsetDiscardedSamples)
        .putNullable("onsetLeadingSilenceSamples", value.onsetLeadingSilenceSamples)
        .putNullable("onsetGapStartSamples", value.onsetGapStartSamples)
        .putNullable("onsetGapEndSamples", value.onsetGapEndSamples)
        .putNullable("onsetResumeStartSamples", value.onsetResumeStartSamples)
        .putNullable("onsetAnalysisWindowSamples", value.onsetAnalysisWindowSamples)
        .putNullable("onsetBoundaryThreshold", value.onsetBoundaryThreshold)
        .putNullable("onsetBoundarySource", value.onsetBoundarySource)
        .putNullable("thermalStatus", value.thermalStatus)
        .put("javaHeapBytes", value.javaHeapBytes)
        .put("nativeHeapBytes", value.nativeHeapBytes)

    private fun outcomeToJson(value: TalosVoiceDiagnosticOutcome): JSONObject = JSONObject()
        .put("termination", value.termination)
        .put("eventCount", value.eventCount)
        .putNullable("resolvedProfileSchemaVersion", value.resolvedProfileSchemaVersion)
        .putNullable("profileMigrationCommitted", value.profileMigrationCommitted)

    private fun answersToJson(value: TalosVoiceDiagnosticAnswers): JSONObject = JSONObject()
        .put("dominant_graph", value.dominantGraph)
        .put("decode_cache_slope", value.decodeCacheSlope)
        .put("outside_ort", value.outsideOrt)
        .put("ar_only_rtf", value.arOnlyRtf)
        .put("underrun_cause", value.underrunCause)
        .putNullable("selected_voice_used", value.selectedVoiceUsed)
        .putNullable("selected_locale_used", value.selectedLocaleUsed)
        .putNullable("italian_semantics_preserved", value.italianSemanticsPreserved)
        .putNullable("cancel_tail_ms", value.cancelTailMs)
        .putNullable("long_read_realtime", value.longReadRealtime)

    private fun hashNullable(value: String?): Any = value?.let(::sha256) ?: JSONObject.NULL

    private fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    private fun JSONObject.putNullable(name: String, value: Any?): JSONObject =
        put(name, value ?: JSONObject.NULL)
}
