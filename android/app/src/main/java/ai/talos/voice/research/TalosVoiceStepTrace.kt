package ai.talos.voice.research

import java.io.File

internal enum class TalosVoiceRunMode {
    T0,
    T0_DIAGNOSTICS_OFF,
    T1,
    T2,
    T3,
}

internal enum class TalosVoicePhase {
    LOCAL_SAMPLE,
    CALLBACK,
    GLOBAL_INPUT_PREP,
    GLOBAL_DECODE,
    KV_TRANSITION,
    CODEC_DECODE,
    AUDIO_WRITE,
    AUDIO_DRAIN,
    UNKNOWN,
}

internal enum class TalosVoiceUnderrunAttribution {
    OBSERVED_DURING_PHASE,
    UNKNOWN,
}

internal data class TalosVoiceStepTrace(
    val utteranceId: Long,
    val frameIndex: Int,
    val pastValidLength: Int,
    val localSampleNs: Long,
    val localOrtRunNs: Long,
    val callbackNs: Long,
    val globalInputPrepNs: Long,
    val globalDecodeNs: Long,
    val kvTransitionNs: Long,
    val totalStepNs: Long,
    val residualNs: Long,
    val rollingRtf16: Double,
    val javaHeapBytes: Long,
    val nativeHeapBytes: Long,
    val gcCount: Long?,
)

internal data class TalosVoiceCodecBatchTrace(
    val utteranceId: Long,
    val batchIndex: Int,
    val firstFrameIndex: Int,
    val frameCount: Int,
    val codecDecodeNs: Long,
    val audioWriteNs: Long,
    val bufferLeadFramesBefore: Long,
    val bufferLeadFramesAfter: Long,
    val underrunCountBefore: Int,
    val underrunCountAfter: Int,
)

internal data class TalosVoiceUnderrunTrace(
    val ordinal: Int,
    val observedAtNs: Long,
    val observedDuringPhase: TalosVoicePhase,
    val frameIndex: Int?,
    val batchIndex: Int?,
    val counterBefore: Int,
    val counterAfter: Int,
    val bufferLeadFramesBefore: Long,
    val bufferLeadFramesAfter: Long,
    val attribution: TalosVoiceUnderrunAttribution,
)

internal data class TalosVoiceOrtProfileFiles(
    val prefill: File,
    val decodeStep: File,
    val localFixedSampledFrame: File,
)

internal data class TalosVoiceRunTrace(
    val utteranceId: Long,
    val mode: TalosVoiceRunMode,
    val startedAtElapsedRealtimeNs: Long,
    val finishedAtElapsedRealtimeNs: Long,
    val wallNs: Long,
    val audioDurationNs: Long,
    val generatedFrameCount: Int,
    val frameSha256: String,
    val cancelled: Boolean,
    val diagnosticsEnabled: Boolean,
    val qualificationOnly: Boolean,
    val steps: List<TalosVoiceStepTrace>,
    val codecBatches: List<TalosVoiceCodecBatchTrace>,
    val underruns: List<TalosVoiceUnderrunTrace>,
    val ortProfiles: TalosVoiceOrtProfileFiles?,
)

internal data class DominantGraphAnswer(
    val graph: String?,
    val medianMsPerFrame: Double?,
    val runnerUpMsPerFrame: Double?,
    val evidence: String,
    val status: String,
)

internal data class DecodeSlopeAnswer(
    val growsWithCache: Boolean?,
    val slopeMsPerCacheToken: Double?,
    val rSquared: Double?,
    val firstQuartileMedianMs: Double?,
    val lastQuartileMedianMs: Double?,
    val status: String,
)

internal data class OutsideOrtAnswer(
    val medianMsPerFrame: Double?,
    val p95MsPerFrame: Double?,
    val sharePercent: Double?,
    val componentMedianMs: Map<String, Double>,
    val status: String,
)

internal data class ArOnlyRtfAnswer(
    val rtf: Double?,
    val wallMs: Double?,
    val audioMs: Double?,
    val generatedFrames: Int?,
    val status: String,
)

internal data class UnderrunAnswer(
    val total: Int,
    val unknownCount: Int,
    val events: List<TalosVoiceUnderrunTrace>,
    val status: String,
)

internal data class TalosVoiceB0Answers(
    val dominantGraphPerFrame: DominantGraphAnswer,
    val decodeStepCacheSlope: DecodeSlopeAnswer,
    val outsideOrtSessionRun: OutsideOrtAnswer,
    val arOnlyLongTextRtf: ArOnlyRtfAnswer,
    val underrunsByEvent: UnderrunAnswer,
)

internal data class TalosVoiceTraceProvenance(
    val runId: String,
    val appCommit: String,
    val sourcePatchSha256: String?,
    val apkSha256: String,
    val modelDecodeStepSha256: String,
    val ortVersion: String,
    val deviceFingerprint: String,
    val textSha256: String,
    val textWordCount: Int,
    val voice: String,
    val seed: Long,
    val requestedMaxFrames: Int,
)

internal data class TalosVoiceOrderedBlock(
    val rank: Int,
    val block: String,
    val ownedMedianMs: Double,
    val ownedP95Ms: Double,
    val sharePercent: Double,
    val falsifier: String,
    val closedWithoutOwnership: Boolean,
)

internal data class TalosVoiceB9Limit(
    val statement: String,
    val appliesRegardlessOfLever: Boolean,
)

internal data class TalosVoiceTraceArtifact(
    val schemaVersion: Int,
    val generatedAtUtc: String,
    val phaseAccountingToleranceNs: Long,
    val provenance: TalosVoiceTraceProvenance,
    val runs: List<TalosVoiceRunTrace>,
    val orderedBlocks: List<TalosVoiceOrderedBlock>,
    val b9: TalosVoiceB9Limit,
    val answers: TalosVoiceB0Answers?,
)
