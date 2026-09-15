package ai.talos.voice

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.Base64
import org.json.JSONArray
import org.json.JSONObject


internal object TalosVoiceProfilePayloadCodec {
    private const val MAX_ENCODED_BYTES = 4 * 1024 * 1024
    private const val INT32_LE = "int32-le"
    private const val FLOAT32_LE = "float32-le"
    private val SHA256 = Regex("^[0-9a-f]{64}$")

    fun encode(profile: TalosVoiceProfileV2): ByteArray {
        val json = JSONObject()
            .put("header", encodeHeader(profile.header))
            .put("qualityMetrics", encodeMetrics(profile.qualityMetrics))
            .put("payloads", JSONArray().also { payloads ->
                profile.backendPayloads.forEach { payload ->
                    payloads.put(
                        when (payload) {
                            is TalosMossPromptPayload -> encodeMoss(payload)
                            is TalosPocketConditioningPayload -> encodePocket(payload)
                        },
                    )
                }
            })
        return json.toString().toByteArray(Charsets.UTF_8).also {
            require(it.size <= MAX_ENCODED_BYTES) { "voice profile V2 exceeds the encoded size limit" }
        }
    }

    fun decode(encoded: ByteArray): TalosVoiceProfileV2 {
        require(encoded.isNotEmpty() && encoded.size <= MAX_ENCODED_BYTES) { "voice profile V2 size is invalid" }
        return try {
            val json = JSONObject(String(encoded, Charsets.UTF_8))
            val payloadsJson = json.getJSONArray("payloads")
            require(payloadsJson.length() in 1..TalosVoiceBackendPayload.SUPPORTED_BACKENDS.size) {
                "voice profile V2 payload count is invalid"
            }
            val payloads = (0 until payloadsJson.length()).map { index ->
                decodePayload(payloadsJson.getJSONObject(index))
            }
            TalosVoiceProfileV2(
                header = decodeHeader(json.getJSONObject("header")),
                qualityMetrics = decodeMetrics(json.getJSONObject("qualityMetrics")),
                backendPayloads = payloads,
            )
        } catch (error: Exception) {
            if (error is IllegalArgumentException && error.message?.startsWith("voice profile V2") == true) throw error
            throw IllegalArgumentException("voice profile V2 decode failed", error)
        }
    }

    private fun encodeHeader(header: TalosVoiceProfileHeaderV2): JSONObject = JSONObject()
        .put("schemaVersion", header.schemaVersion)
        .put("profileId", header.profileId)
        .put("displayName", header.displayName)
        .put("language", header.language)
        .put("style", header.style)
        .put("preferredBackend", header.preferredBackend)
        .put("createdAtEpochMs", header.createdAtEpochMs)
        .put("enrollmentDurationMs", header.enrollmentDurationMs)
        .put("consentVersion", header.consentVersion)
        .put("migratedFromSchemaVersion", header.migratedFromSchemaVersion ?: JSONObject.NULL)

    private fun decodeHeader(json: JSONObject): TalosVoiceProfileHeaderV2 = TalosVoiceProfileHeaderV2(
        schemaVersion = json.getInt("schemaVersion"),
        profileId = json.getString("profileId"),
        displayName = json.getString("displayName"),
        language = json.getString("language"),
        style = json.getString("style"),
        preferredBackend = json.getString("preferredBackend"),
        createdAtEpochMs = json.getLong("createdAtEpochMs"),
        enrollmentDurationMs = json.getInt("enrollmentDurationMs"),
        consentVersion = json.getInt("consentVersion"),
        migratedFromSchemaVersion = if (json.isNull("migratedFromSchemaVersion")) null else json.getInt("migratedFromSchemaVersion"),
    )

    private fun encodeMetrics(metrics: TalosVoiceQualityMetrics): JSONObject = JSONObject()
        .put("durationMs", metrics.durationMs)
        .put("speechRatio", metrics.speechRatio)
        .put("peakAbs", metrics.peakAbs)
        .put("rmsDbfs", metrics.rmsDbfs)
        .put("clippedSampleRatio", metrics.clippedSampleRatio)
        .put("dcOffset", metrics.dcOffset)
        .put("noiseFloorDbfs", metrics.noiseFloorDbfs)
        .put("snrEstimateDb", metrics.snrEstimateDb)
        .put("longestSilenceMs", metrics.longestSilenceMs)
        .put("zeroFrameRatio", metrics.zeroFrameRatio)
        .put("droppedReadCount", metrics.droppedReadCount)
        .put("clientSilencedObserved", metrics.clientSilencedObserved)

    private fun decodeMetrics(json: JSONObject): TalosVoiceQualityMetrics = TalosVoiceQualityMetrics(
        durationMs = json.getLong("durationMs"),
        speechRatio = json.getDouble("speechRatio"),
        peakAbs = json.getDouble("peakAbs"),
        rmsDbfs = json.getDouble("rmsDbfs"),
        clippedSampleRatio = json.getDouble("clippedSampleRatio"),
        dcOffset = json.getDouble("dcOffset"),
        noiseFloorDbfs = json.getDouble("noiseFloorDbfs"),
        snrEstimateDb = json.getDouble("snrEstimateDb"),
        longestSilenceMs = json.getLong("longestSilenceMs"),
        zeroFrameRatio = json.getDouble("zeroFrameRatio"),
        droppedReadCount = json.getInt("droppedReadCount"),
        clientSilencedObserved = json.getBoolean("clientSilencedObserved"),
    )

    private fun encodeMoss(payload: TalosMossPromptPayload): JSONObject {
        val rows = payload.promptAudioCodes
        val raw = ByteBuffer.allocate(Math.multiplyExact(Math.multiplyExact(rows.size, payload.quantizerCount), Int.SIZE_BYTES))
            .order(ByteOrder.LITTLE_ENDIAN)
            .also { buffer -> rows.forEach { row -> row.forEach(buffer::putInt) } }
            .array()
        return encodedPayload(payload.backend, INT32_LE, raw)
            .put("shape", JSONArray().put(rows.size).put(payload.quantizerCount))
            .put("codecFingerprint", payload.codecFingerprint)
            .put("promptSchemaFingerprint", payload.promptSchemaFingerprint)
            .put("frameRateMilliHz", payload.frameRateMilliHz)
            .put("codebookSize", payload.codebookSize)
    }

    private fun encodePocket(payload: TalosPocketConditioningPayload): JSONObject {
        val values = payload.valuesCopy()
        val raw = ByteBuffer.allocate(Math.multiplyExact(values.size, Float.SIZE_BYTES))
            .order(ByteOrder.LITTLE_ENDIAN)
            .also { buffer -> values.forEach(buffer::putFloat) }
            .array()
        return encodedPayload(payload.backend, FLOAT32_LE, raw)
            .put("shape", JSONArray().also { shape -> payload.shape.forEach(shape::put) })
            .put("repository", payload.repository)
            .put("revision", payload.revision)
            .put("sampleRate", payload.sampleRate)
    }

    private fun encodedPayload(backend: String, encoding: String, raw: ByteArray): JSONObject = JSONObject()
        .put("backend", backend)
        .put("encoding", encoding)
        .put("byteLength", raw.size)
        .put("sha256", sha256(raw))
        .put("data", Base64.getEncoder().encodeToString(raw))

    private fun decodePayload(json: JSONObject): TalosVoiceBackendPayload = when (val backend = json.getString("backend")) {
        TalosMossPromptPayload.BACKEND -> decodeMoss(json)
        TalosPocketConditioningPayload.BACKEND -> decodePocket(json)
        else -> throw IllegalArgumentException("voice profile V2 backend is unsupported: $backend")
    }

    private fun decodeMoss(json: JSONObject): TalosMossPromptPayload {
        require(json.getString("encoding") == INT32_LE) { "voice profile V2 MOSS encoding is invalid" }
        val shape = json.getJSONArray("shape")
        require(shape.length() == 2) { "voice profile V2 MOSS shape rank is invalid" }
        val frames = shape.getInt(0)
        val quantizers = shape.getInt(1)
        require(frames in 1..TalosMossPromptPayload.MAX_FRAMES && quantizers in 1..64) {
            "voice profile V2 MOSS shape is invalid"
        }
        val expectedBytes = Math.multiplyExact(Math.multiplyExact(frames, quantizers), Int.SIZE_BYTES)
        val raw = decodePayloadBytes(json, expectedBytes)
        val buffer = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN)
        val rows = List(frames) { IntArray(quantizers) { buffer.int } }
        return TalosMossPromptPayload(
            codecFingerprint = json.getString("codecFingerprint"),
            promptSchemaFingerprint = json.getString("promptSchemaFingerprint"),
            frameRateMilliHz = json.getInt("frameRateMilliHz"),
            quantizerCount = quantizers,
            codebookSize = json.getInt("codebookSize"),
            promptAudioCodes = rows,
        )
    }

    private fun decodePocket(json: JSONObject): TalosPocketConditioningPayload {
        require(json.getString("encoding") == FLOAT32_LE) { "voice profile V2 Pocket encoding is invalid" }
        val shapeJson = json.getJSONArray("shape")
        require(shapeJson.length() == 3) { "voice profile V2 Pocket shape rank is invalid" }
        val shape = LongArray(3) { shapeJson.getLong(it) }
        require(
            shape[0] == 1L && shape[1] in 1L..TalosPocketConditioningPayload.MAX_CONDITIONING_FRAMES.toLong() &&
                shape[2] == TalosPocketConditioningPayload.CONDITIONING_DIM.toLong(),
        ) { "voice profile V2 Pocket shape is invalid" }
        val valuesCount = Math.multiplyExact(shape[1], shape[2]).toInt()
        val raw = decodePayloadBytes(json, Math.multiplyExact(valuesCount, Float.SIZE_BYTES))
        val buffer = ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN)
        val values = FloatArray(valuesCount) { buffer.float }
        return TalosPocketConditioningPayload(
            repository = json.getString("repository"),
            revision = json.getString("revision"),
            sampleRate = json.getInt("sampleRate"),
            shape = shape,
            values = values,
        )
    }

    private fun decodePayloadBytes(json: JSONObject, expectedBytes: Int): ByteArray {
        require(json.getInt("byteLength") == expectedBytes) { "voice profile V2 payload length metadata differs" }
        val expectedSha = json.getString("sha256")
        require(SHA256.matches(expectedSha)) { "voice profile V2 payload SHA-256 is invalid" }
        val raw = Base64.getDecoder().decode(json.getString("data"))
        require(raw.size == expectedBytes) { "voice profile V2 payload byte length differs" }
        require(sha256(raw) == expectedSha) { "voice profile V2 payload SHA-256 mismatch" }
        return raw
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
}
