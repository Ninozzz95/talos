package ai.talos.voice

import org.json.JSONArray
import org.json.JSONObject

/**
 * Blueprint §6.1: a profile stores conditioning, not TTS weights - the
 * plaintext AEAD-wraps (via [TalosVoiceProfileCipher]) is exactly this
 * header plus the prompt audio codes plus quality metrics, JSON-serialized
 * (this codebase already reads/writes every other structured file - the
 * manifests, the golden corpus - as JSON; the blueprint's box diagram lists
 * FIELDS, not a binary layout, so JSON inside the AEAD envelope satisfies
 * it without inventing a new binary format for a payload this small - §6.3
 * says ~12 KB of raw codes before encryption, illustrative not a hard cap).
 */
internal data class TalosVoiceProfileHeaderV1(
    val schemaVersion: Int,
    val profileId: String,
    val displayName: String,
    val language: String,
    val style: String,
    val backend: String,
    /** §6.1's "critical compatibility rule": SHA-256 over the codec manifest/graphs/config, NOT the TTS model version - see [TalosVoiceProfileCompatibility]. */
    val codecFingerprint: String,
    val promptSchemaFingerprint: String,
    val frameRateMilliHz: Int,
    val quantizerCount: Int,
    val codebookSize: Int,
    val frameCount: Int,
    val createdAtEpochMs: Long,
    val enrollmentDurationMs: Int,
    val consentVersion: Int,
)

internal data class TalosVoiceProfileV1(
    val header: TalosVoiceProfileHeaderV1,
    val qualityMetrics: TalosVoiceQualityMetrics,
    /** `[frame][quantizer]` - the exact shape [TalosMossRuntime.generateAudioTokensWithReference] and every builtin voice already consume. */
    val promptAudioCodes: List<IntArray>,
) {
    fun toJson(): JSONObject {
        val h = header
        val header = JSONObject()
            .put("schemaVersion", h.schemaVersion)
            .put("profileId", h.profileId)
            .put("displayName", h.displayName)
            .put("language", h.language)
            .put("style", h.style)
            .put("backend", h.backend)
            .put("codecFingerprint", h.codecFingerprint)
            .put("promptSchemaFingerprint", h.promptSchemaFingerprint)
            .put("frameRateMilliHz", h.frameRateMilliHz)
            .put("quantizerCount", h.quantizerCount)
            .put("codebookSize", h.codebookSize)
            .put("frameCount", h.frameCount)
            .put("createdAtEpochMs", h.createdAtEpochMs)
            .put("enrollmentDurationMs", h.enrollmentDurationMs)
            .put("consentVersion", h.consentVersion)

        val m = qualityMetrics
        val metrics = JSONObject()
            .put("durationMs", m.durationMs)
            .put("speechRatio", m.speechRatio)
            .put("peakAbs", m.peakAbs)
            .put("rmsDbfs", m.rmsDbfs)
            .put("clippedSampleRatio", m.clippedSampleRatio)
            .put("dcOffset", m.dcOffset)
            .put("noiseFloorDbfs", m.noiseFloorDbfs)
            .put("snrEstimateDb", m.snrEstimateDb)
            .put("longestSilenceMs", m.longestSilenceMs)
            .put("zeroFrameRatio", m.zeroFrameRatio)
            .put("droppedReadCount", m.droppedReadCount)
            .put("clientSilencedObserved", m.clientSilencedObserved)

        val codes = JSONArray()
        for (frame in promptAudioCodes) {
            val row = JSONArray()
            for (code in frame) row.put(code)
            codes.put(row)
        }

        return JSONObject()
            .put("header", header)
            .put("qualityMetrics", metrics)
            .put("promptAudioCodes", codes)
    }

    companion object {
        fun fromJson(json: JSONObject): TalosVoiceProfileV1 {
            val h = json.getJSONObject("header")
            val header = TalosVoiceProfileHeaderV1(
                schemaVersion = h.getInt("schemaVersion"),
                profileId = h.getString("profileId"),
                displayName = h.getString("displayName"),
                language = h.getString("language"),
                style = h.getString("style"),
                backend = h.getString("backend"),
                codecFingerprint = h.getString("codecFingerprint"),
                promptSchemaFingerprint = h.getString("promptSchemaFingerprint"),
                frameRateMilliHz = h.getInt("frameRateMilliHz"),
                quantizerCount = h.getInt("quantizerCount"),
                codebookSize = h.getInt("codebookSize"),
                frameCount = h.getInt("frameCount"),
                createdAtEpochMs = h.getLong("createdAtEpochMs"),
                enrollmentDurationMs = h.getInt("enrollmentDurationMs"),
                consentVersion = h.getInt("consentVersion"),
            )

            val m = json.getJSONObject("qualityMetrics")
            val metrics = TalosVoiceQualityMetrics(
                durationMs = m.getLong("durationMs"),
                speechRatio = m.getDouble("speechRatio"),
                peakAbs = m.getDouble("peakAbs"),
                rmsDbfs = m.getDouble("rmsDbfs"),
                clippedSampleRatio = m.getDouble("clippedSampleRatio"),
                dcOffset = m.getDouble("dcOffset"),
                noiseFloorDbfs = m.getDouble("noiseFloorDbfs"),
                snrEstimateDb = m.getDouble("snrEstimateDb"),
                longestSilenceMs = m.getLong("longestSilenceMs"),
                zeroFrameRatio = m.getDouble("zeroFrameRatio"),
                droppedReadCount = m.getInt("droppedReadCount"),
                clientSilencedObserved = m.getBoolean("clientSilencedObserved"),
            )

            val codesArray = json.getJSONArray("promptAudioCodes")
            val codes = List(codesArray.length()) { frameIndex ->
                val row = codesArray.getJSONArray(frameIndex)
                IntArray(row.length()) { q -> row.getInt(q) }
            }

            return TalosVoiceProfileV1(header, metrics, codes)
        }
    }
}
