package ai.talos.voice.research

import ai.onnxruntime.OrtEnvironment
import android.system.Os
import java.io.File
import java.security.MessageDigest
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

internal data class TalosVoiceB0CampaignConfig(
    val outputDirectory: File,
    val runId: String,
    val appCommit: String,
    val sourcePatchSha256: String?,
    val apkSha256: String,
    val modelDecodeStepSha256: String,
    val deviceFingerprint: String,
    val text: String,
    val voice: String,
    val seed: Long,
    val maxFrames: Int,
) {
    val rawArtifactFile: File get() = File(outputDirectory, RAW_ARTIFACT_NAME)

    init {
        require(runId.isNotBlank()) { "runId must not be blank" }
        require(appCommit.matches(GIT_COMMIT_PATTERN)) { "appCommit must be a full lowercase Git object id" }
        require(sourcePatchSha256 == null || sourcePatchSha256.matches(SHA256_PATTERN)) {
            "sourcePatchSha256 must be null or lowercase SHA-256"
        }
        require(apkSha256.matches(SHA256_PATTERN)) { "apkSha256 must be lowercase SHA-256" }
        require(modelDecodeStepSha256.matches(SHA256_PATTERN)) { "modelDecodeStepSha256 must be lowercase SHA-256" }
        require(text.isNotBlank()) { "text must not be blank" }
        require(voice.isNotBlank()) { "voice must not be blank" }
        require(maxFrames > 0) { "maxFrames must be positive" }
    }

    private companion object {
        const val RAW_ARTIFACT_NAME = "voice-step-trace.raw.json"
        val GIT_COMMIT_PATTERN = Regex("[0-9a-f]{40,64}")
        val SHA256_PATTERN = Regex("[0-9a-f]{64}")
    }
}

internal data class TalosVoiceOrtProfiling(
    val outputDirectory: File,
    val runId: String,
)

internal data class TalosVoiceProductionTrace(
    val session: TalosVoiceB0Session,
    val mode: TalosVoiceRunMode,
    val recorder: TalosVoiceTraceRecorder,
) {
    val diagnosticsEnabled: Boolean get() = mode != TalosVoiceRunMode.T0_DIAGNOSTICS_OFF
}

internal class TalosVoiceB0Session(val config: TalosVoiceB0CampaignConfig) {
    private val runs = ArrayList<TalosVoiceRunTrace>()

    @Synchronized
    fun recordCompletedRun(run: TalosVoiceRunTrace) {
        require(runs.none { it.mode == run.mode }) { "B0 mode already recorded: ${run.mode}" }
        runs += run
        writeRawArtifact()
    }

    @Synchronized
    fun writeRawArtifact(): File = TalosVoiceTraceArtifactWriter.writeAtomic(config.rawArtifactFile, snapshot())

    @Synchronized
    fun snapshot(): TalosVoiceTraceArtifact = TalosVoiceTraceArtifact(
        schemaVersion = SCHEMA_VERSION,
        generatedAtUtc = Instant.now().toString(),
        phaseAccountingToleranceNs = PHASE_ACCOUNTING_TOLERANCE_NS,
        provenance = TalosVoiceTraceProvenance(
            runId = config.runId,
            appCommit = config.appCommit,
            sourcePatchSha256 = config.sourcePatchSha256,
            apkSha256 = config.apkSha256,
            modelDecodeStepSha256 = config.modelDecodeStepSha256,
            ortVersion = OrtEnvironment.getEnvironment().version,
            deviceFingerprint = config.deviceFingerprint,
            textSha256 = sha256(config.text.toByteArray(Charsets.UTF_8)),
            textWordCount = config.text.trim().split(Regex("\\s+")).size,
            voice = config.voice,
            seed = config.seed,
            requestedMaxFrames = config.maxFrames,
        ),
        runs = runs.toList(),
        orderedBlocks = emptyList(),
        b9 = TalosVoiceB9Limit(
            statement = "B9 is the honest device/model limit and ships regardless of which measured lever owns the budget.",
            appliesRegardlessOfLever = true,
        ),
        answers = null,
    )

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }

    private companion object {
        const val SCHEMA_VERSION = 1
        const val PHASE_ACCOUNTING_TOLERANCE_NS = 1_000_000L
    }
}

/** One-shot opt-in. Normal production calls see no pending probe and do no B0 work. */
internal object TalosVoiceB0Probe {
    private data class Pending(val session: TalosVoiceB0Session, val mode: TalosVoiceRunMode)

    private var pending: Pending? = null

    @Synchronized
    fun armNextProductionRun(session: TalosVoiceB0Session, mode: TalosVoiceRunMode) {
        require(mode == TalosVoiceRunMode.T0 || mode == TalosVoiceRunMode.T0_DIAGNOSTICS_OFF) {
            "only T0 modes may enter through the production probe: $mode"
        }
        check(pending == null) { "a production B0 probe is already armed" }
        pending = Pending(session, mode)
    }

    @Synchronized
    fun claimProductionRun(utteranceId: Long): TalosVoiceProductionTrace? {
        val claimed = pending ?: return null
        pending = null
        return TalosVoiceProductionTrace(
            session = claimed.session,
            mode = claimed.mode,
            recorder = TalosVoiceTraceRecorder(utteranceId, claimed.mode),
        )
    }

    @Synchronized
    fun disarm() {
        pending = null
    }
}

internal object TalosVoiceTraceArtifactWriter {
    fun writeAtomic(file: File, artifact: TalosVoiceTraceArtifact): File {
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

    fun read(file: File): TalosVoiceTraceArtifact {
        require(file.isFile) { "B0 artifact does not exist: ${file.absolutePath}" }
        val root = JSONObject(file.readText(Charsets.UTF_8))
        require(root.getInt("schemaVersion") == 1) { "unsupported B0 schemaVersion" }
        val provenance = root.getJSONObject("provenance")
        val b9 = root.getJSONObject("b9")
        return TalosVoiceTraceArtifact(
            schemaVersion = root.getInt("schemaVersion"),
            generatedAtUtc = root.requiredString("generatedAtUtc"),
            phaseAccountingToleranceNs = root.getLong("phaseAccountingToleranceNs"),
            provenance = TalosVoiceTraceProvenance(
                runId = provenance.getString("runId"),
                appCommit = provenance.getString("appCommit"),
                sourcePatchSha256 = provenance.nullableString("sourcePatchSha256"),
                apkSha256 = provenance.getString("apkSha256"),
                modelDecodeStepSha256 = provenance.getString("modelDecodeStepSha256"),
                ortVersion = provenance.getString("ortVersion"),
                deviceFingerprint = provenance.getString("deviceFingerprint"),
                textSha256 = provenance.getString("textSha256"),
                textWordCount = provenance.getInt("textWordCount"),
                voice = provenance.getString("voice"),
                seed = provenance.getLong("seed"),
                requestedMaxFrames = provenance.getInt("requestedMaxFrames"),
            ),
            runs = root.getJSONArray("runs").objects(::runFromJson),
            orderedBlocks = root.getJSONArray("orderedBlocks").objects(::orderedBlockFromJson),
            b9 = TalosVoiceB9Limit(
                statement = b9.getString("statement"),
                appliesRegardlessOfLever = b9.getBoolean("appliesRegardlessOfLever"),
            ),
            answers = null,
        )
    }

    private fun toJson(artifact: TalosVoiceTraceArtifact): JSONObject = JSONObject()
        .put("schemaVersion", artifact.schemaVersion)
        .put("generatedAtUtc", artifact.generatedAtUtc)
        .put("phaseAccountingToleranceNs", artifact.phaseAccountingToleranceNs)
        .put("provenance", provenanceToJson(artifact.provenance))
        .put("runs", JSONArray(artifact.runs.map(::runToJson)))
        .put("orderedBlocks", JSONArray(artifact.orderedBlocks.map(::orderedBlockToJson)))
        .put(
            "b9",
            JSONObject()
                .put("statement", artifact.b9.statement)
                .put("appliesRegardlessOfLever", artifact.b9.appliesRegardlessOfLever),
        )
        .put("answers", artifact.answers?.let(::answersToJson) ?: JSONObject.NULL)

    private fun provenanceToJson(value: TalosVoiceTraceProvenance): JSONObject = JSONObject()
        .put("runId", value.runId)
        .put("appCommit", value.appCommit)
        .put("sourcePatchSha256", value.sourcePatchSha256 ?: JSONObject.NULL)
        .put("apkSha256", value.apkSha256)
        .put("modelDecodeStepSha256", value.modelDecodeStepSha256)
        .put("ortVersion", value.ortVersion)
        .put("deviceFingerprint", value.deviceFingerprint)
        .put("textSha256", value.textSha256)
        .put("textWordCount", value.textWordCount)
        .put("voice", value.voice)
        .put("seed", value.seed)
        .put("requestedMaxFrames", value.requestedMaxFrames)

    private fun runToJson(value: TalosVoiceRunTrace): JSONObject = JSONObject()
        .put("utteranceId", value.utteranceId)
        .put("mode", value.mode.name)
        .put("startedAtElapsedRealtimeNs", value.startedAtElapsedRealtimeNs)
        .put("finishedAtElapsedRealtimeNs", value.finishedAtElapsedRealtimeNs)
        .put("wallNs", value.wallNs)
        .put("audioDurationNs", value.audioDurationNs)
        .put("generatedFrameCount", value.generatedFrameCount)
        .put("frameSha256", value.frameSha256)
        .put("cancelled", value.cancelled)
        .put("diagnosticsEnabled", value.diagnosticsEnabled)
        .put("qualificationOnly", value.qualificationOnly)
        .put("steps", JSONArray(value.steps.map(::stepToJson)))
        .put("codecBatches", JSONArray(value.codecBatches.map(::codecBatchToJson)))
        .put("underruns", JSONArray(value.underruns.map(::underrunToJson)))
        .put("ortProfiles", value.ortProfiles?.let(::profilesToJson) ?: JSONObject.NULL)

    private fun stepToJson(value: TalosVoiceStepTrace): JSONObject = JSONObject()
        .put("utteranceId", value.utteranceId)
        .put("frameIndex", value.frameIndex)
        .put("pastValidLength", value.pastValidLength)
        .put("localSampleNs", value.localSampleNs)
        .put("localOrtRunNs", value.localOrtRunNs)
        .put("callbackNs", value.callbackNs)
        .put("globalInputPrepNs", value.globalInputPrepNs)
        .put("globalDecodeNs", value.globalDecodeNs)
        .put("kvTransitionNs", value.kvTransitionNs)
        .put("totalStepNs", value.totalStepNs)
        .put("residualNs", value.residualNs)
        .put("rollingRtf16", value.rollingRtf16)
        .put("javaHeapBytes", value.javaHeapBytes)
        .put("nativeHeapBytes", value.nativeHeapBytes)
        .put("gcCount", value.gcCount ?: JSONObject.NULL)

    private fun codecBatchToJson(value: TalosVoiceCodecBatchTrace): JSONObject = JSONObject()
        .put("utteranceId", value.utteranceId)
        .put("batchIndex", value.batchIndex)
        .put("firstFrameIndex", value.firstFrameIndex)
        .put("frameCount", value.frameCount)
        .put("codecDecodeNs", value.codecDecodeNs)
        .put("audioWriteNs", value.audioWriteNs)
        .put("bufferLeadFramesBefore", value.bufferLeadFramesBefore)
        .put("bufferLeadFramesAfter", value.bufferLeadFramesAfter)
        .put("underrunCountBefore", value.underrunCountBefore)
        .put("underrunCountAfter", value.underrunCountAfter)

    private fun underrunToJson(value: TalosVoiceUnderrunTrace): JSONObject = JSONObject()
        .put("ordinal", value.ordinal)
        .put("observedAtNs", value.observedAtNs)
        .put("observedDuringPhase", value.observedDuringPhase.name)
        .put("frameIndex", value.frameIndex ?: JSONObject.NULL)
        .put("batchIndex", value.batchIndex ?: JSONObject.NULL)
        .put("counterBefore", value.counterBefore)
        .put("counterAfter", value.counterAfter)
        .put("bufferLeadFramesBefore", value.bufferLeadFramesBefore)
        .put("bufferLeadFramesAfter", value.bufferLeadFramesAfter)
        .put("attribution", value.attribution.name)

    private fun profilesToJson(value: TalosVoiceOrtProfileFiles): JSONObject = JSONObject()
        .put("prefill", value.prefill.absolutePath)
        .put("decodeStep", value.decodeStep.absolutePath)
        .put("localFixedSampledFrame", value.localFixedSampledFrame.absolutePath)

    private fun orderedBlockToJson(value: TalosVoiceOrderedBlock): JSONObject = JSONObject()
        .put("rank", value.rank)
        .put("block", value.block)
        .put("ownedMedianMs", value.ownedMedianMs)
        .put("ownedP95Ms", value.ownedP95Ms)
        .put("sharePercent", value.sharePercent)
        .put("falsifier", value.falsifier)
        .put("closedWithoutOwnership", value.closedWithoutOwnership)

    private fun answersToJson(value: TalosVoiceB0Answers): JSONObject = JSONObject()
        .put(
            "dominantGraphPerFrame",
            JSONObject()
                .put("graph", value.dominantGraphPerFrame.graph ?: JSONObject.NULL)
                .put("medianMsPerFrame", value.dominantGraphPerFrame.medianMsPerFrame ?: JSONObject.NULL)
                .put("runnerUpMsPerFrame", value.dominantGraphPerFrame.runnerUpMsPerFrame ?: JSONObject.NULL)
                .put("evidence", value.dominantGraphPerFrame.evidence)
                .put("status", value.dominantGraphPerFrame.status),
        )
        .put(
            "decodeStepCacheSlope",
            JSONObject()
                .put("growsWithCache", value.decodeStepCacheSlope.growsWithCache ?: JSONObject.NULL)
                .put("slopeMsPerCacheToken", value.decodeStepCacheSlope.slopeMsPerCacheToken ?: JSONObject.NULL)
                .put("rSquared", value.decodeStepCacheSlope.rSquared ?: JSONObject.NULL)
                .put("firstQuartileMedianMs", value.decodeStepCacheSlope.firstQuartileMedianMs ?: JSONObject.NULL)
                .put("lastQuartileMedianMs", value.decodeStepCacheSlope.lastQuartileMedianMs ?: JSONObject.NULL)
                .put("status", value.decodeStepCacheSlope.status),
        )
        .put(
            "outsideOrtSessionRun",
            JSONObject()
                .put("medianMsPerFrame", value.outsideOrtSessionRun.medianMsPerFrame ?: JSONObject.NULL)
                .put("p95MsPerFrame", value.outsideOrtSessionRun.p95MsPerFrame ?: JSONObject.NULL)
                .put("sharePercent", value.outsideOrtSessionRun.sharePercent ?: JSONObject.NULL)
                .put("componentMedianMs", JSONObject(value.outsideOrtSessionRun.componentMedianMs))
                .put("status", value.outsideOrtSessionRun.status),
        )
        .put(
            "arOnlyLongTextRtf",
            JSONObject()
                .put("rtf", value.arOnlyLongTextRtf.rtf ?: JSONObject.NULL)
                .put("wallMs", value.arOnlyLongTextRtf.wallMs ?: JSONObject.NULL)
                .put("audioMs", value.arOnlyLongTextRtf.audioMs ?: JSONObject.NULL)
                .put("generatedFrames", value.arOnlyLongTextRtf.generatedFrames ?: JSONObject.NULL)
                .put("status", value.arOnlyLongTextRtf.status),
        )
        .put(
            "underrunsByEvent",
            JSONObject()
                .put("total", value.underrunsByEvent.total)
                .put("unknownCount", value.underrunsByEvent.unknownCount)
                .put("events", JSONArray(value.underrunsByEvent.events.map(::underrunToJson)))
                .put("status", value.underrunsByEvent.status),
        )

    private fun runFromJson(value: JSONObject): TalosVoiceRunTrace = TalosVoiceRunTrace(
        utteranceId = value.getLong("utteranceId"),
        mode = TalosVoiceRunMode.valueOf(value.getString("mode")),
        startedAtElapsedRealtimeNs = value.getLong("startedAtElapsedRealtimeNs"),
        finishedAtElapsedRealtimeNs = value.getLong("finishedAtElapsedRealtimeNs"),
        wallNs = value.getLong("wallNs"),
        audioDurationNs = value.getLong("audioDurationNs"),
        generatedFrameCount = value.getInt("generatedFrameCount"),
        frameSha256 = value.getString("frameSha256"),
        cancelled = value.getBoolean("cancelled"),
        diagnosticsEnabled = value.getBoolean("diagnosticsEnabled"),
        qualificationOnly = value.getBoolean("qualificationOnly"),
        steps = value.getJSONArray("steps").objects(::stepFromJson),
        codecBatches = value.getJSONArray("codecBatches").objects(::codecBatchFromJson),
        underruns = value.getJSONArray("underruns").objects(::underrunFromJson),
        ortProfiles = value.optJSONObject("ortProfiles")?.let(::profilesFromJson),
    )

    private fun stepFromJson(value: JSONObject): TalosVoiceStepTrace = TalosVoiceStepTrace(
        utteranceId = value.getLong("utteranceId"),
        frameIndex = value.getInt("frameIndex"),
        pastValidLength = value.getInt("pastValidLength"),
        localSampleNs = value.getLong("localSampleNs"),
        localOrtRunNs = value.getLong("localOrtRunNs"),
        callbackNs = value.getLong("callbackNs"),
        globalInputPrepNs = value.getLong("globalInputPrepNs"),
        globalDecodeNs = value.getLong("globalDecodeNs"),
        kvTransitionNs = value.getLong("kvTransitionNs"),
        totalStepNs = value.getLong("totalStepNs"),
        residualNs = value.getLong("residualNs"),
        rollingRtf16 = value.getDouble("rollingRtf16"),
        javaHeapBytes = value.getLong("javaHeapBytes"),
        nativeHeapBytes = value.getLong("nativeHeapBytes"),
        gcCount = value.nullableLong("gcCount"),
    )

    private fun codecBatchFromJson(value: JSONObject): TalosVoiceCodecBatchTrace = TalosVoiceCodecBatchTrace(
        utteranceId = value.getLong("utteranceId"),
        batchIndex = value.getInt("batchIndex"),
        firstFrameIndex = value.getInt("firstFrameIndex"),
        frameCount = value.getInt("frameCount"),
        codecDecodeNs = value.getLong("codecDecodeNs"),
        audioWriteNs = value.getLong("audioWriteNs"),
        bufferLeadFramesBefore = value.getLong("bufferLeadFramesBefore"),
        bufferLeadFramesAfter = value.getLong("bufferLeadFramesAfter"),
        underrunCountBefore = value.getInt("underrunCountBefore"),
        underrunCountAfter = value.getInt("underrunCountAfter"),
    )

    private fun underrunFromJson(value: JSONObject): TalosVoiceUnderrunTrace = TalosVoiceUnderrunTrace(
        ordinal = value.getInt("ordinal"),
        observedAtNs = value.getLong("observedAtNs"),
        observedDuringPhase = TalosVoicePhase.valueOf(value.getString("observedDuringPhase")),
        frameIndex = value.nullableInt("frameIndex"),
        batchIndex = value.nullableInt("batchIndex"),
        counterBefore = value.getInt("counterBefore"),
        counterAfter = value.getInt("counterAfter"),
        bufferLeadFramesBefore = value.getLong("bufferLeadFramesBefore"),
        bufferLeadFramesAfter = value.getLong("bufferLeadFramesAfter"),
        attribution = TalosVoiceUnderrunAttribution.valueOf(value.getString("attribution")),
    )

    private fun profilesFromJson(value: JSONObject): TalosVoiceOrtProfileFiles = TalosVoiceOrtProfileFiles(
        prefill = File(value.getString("prefill")),
        decodeStep = File(value.getString("decodeStep")),
        localFixedSampledFrame = File(value.getString("localFixedSampledFrame")),
    )

    private fun orderedBlockFromJson(value: JSONObject): TalosVoiceOrderedBlock = TalosVoiceOrderedBlock(
        rank = value.getInt("rank"),
        block = value.getString("block"),
        ownedMedianMs = value.getDouble("ownedMedianMs"),
        ownedP95Ms = value.getDouble("ownedP95Ms"),
        sharePercent = value.getDouble("sharePercent"),
        falsifier = value.getString("falsifier"),
        closedWithoutOwnership = value.getBoolean("closedWithoutOwnership"),
    )

    private fun JSONObject.nullableString(name: String): String? = if (isNull(name)) null else getString(name)
    private fun JSONObject.requiredString(name: String): String {
        val value = get(name)
        require(value is String && value.isNotBlank()) { "$name must be a non-empty string" }
        return value
    }
    private fun JSONObject.nullableLong(name: String): Long? = if (isNull(name)) null else getLong(name)
    private fun JSONObject.nullableInt(name: String): Int? = if (isNull(name)) null else getInt(name)

    private fun <T> JSONArray.objects(transform: (JSONObject) -> T): List<T> =
        List(length()) { index -> transform(getJSONObject(index)) }
}
