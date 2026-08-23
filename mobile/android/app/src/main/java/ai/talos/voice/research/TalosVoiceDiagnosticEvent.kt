package ai.talos.voice.research

import android.os.Debug
import android.os.SystemClock

internal enum class TalosVoiceDiagnosticEventKind {
    ROUTE_ARMED,
    PRODUCTION_DOOR_ENTERED,
    SAMPLING_CONFIG,
    ROUTE_RESOLVED,
    ENGINE_STAGE,
    ONSET_STABILIZED,
    TOKENIZE,
    TEXT_CONDITIONER,
    FLOW_MAIN,
    FLOW_STEP,
    CODEC_DECODE,
    QUEUE_WAIT,
    PREROLL_READY,
    AUDIO_WRITE,
    AUDIO_TIMESTAMP,
    UNDERRUN_OBSERVED,
    PLAYBACK_BOUNDARY_ARMED,
    TERMINAL_DRAIN_ARMED,
    PLAYBACK_BOUNDARY_REACHED,
    DRAIN_BEGIN,
    DRAIN_END,
    CANCEL_REQUESTED,
    CANCEL_ACKNOWLEDGED,
    STALE_CALLBACK_DROPPED,
    COMPLETED,
    FAILED,
}

/**
 * Primitive-only event contract. There is deliberately no free-form text,
 * PCM, token value, tensor value or profile id field that a caller could
 * accidentally persist.
 */
internal data class TalosVoiceDiagnosticEvent(
    val kind: TalosVoiceDiagnosticEventKind,
    val stage: String,
    val atElapsedRealtimeNs: Long = SystemClock.elapsedRealtimeNanos(),
    val sequence: Int = 0,
    val threadName: String = Thread.currentThread().name,
    val durationNs: Long? = null,
    val sentenceIndex: Int? = null,
    val frameIndex: Int? = null,
    val tokenPosition: Int? = null,
    val requestedFrames: Int? = null,
    val writtenFrames: Int? = null,
    val queueDepthFrames: Long? = null,
    val queueCapacityFrames: Long? = null,
    val startThresholdFrames: Long? = null,
    val playbackHeadFrames: Long? = null,
    val playbackBoundaryFrames: Long? = null,
    val playbackCompletionSource: String? = null,
    val terminalDrainRemainingFrames: Long? = null,
    val terminalDrainExpectedNs: Long? = null,
    val underrunCount: Int? = null,
    val cancellationGeneration: Long? = null,
    val samplingSeed: Long? = null,
    val levelGainDb: Double? = null,
    val limiterCeilingDbfs: Double? = null,
    val inputPeakAbs: Double? = null,
    val outputPeakAbs: Double? = null,
    val limitedSampleFrames: Int? = null,
    val limiterGainReductionDb: Double? = null,
    val onsetDiscardedSamples: Int? = null,
    val onsetLeadingSilenceSamples: Int? = null,
    val onsetGapStartSamples: Int? = null,
    val onsetGapEndSamples: Int? = null,
    val onsetResumeStartSamples: Int? = null,
    val onsetAnalysisWindowSamples: Int? = null,
    val onsetBoundaryThreshold: Double? = null,
    val onsetBoundarySource: String? = null,
    val thermalStatus: Int? = null,
    val javaHeapBytes: Long = Runtime.getRuntime().totalMemory() - Runtime.getRuntime().freeMemory(),
    val nativeHeapBytes: Long = Debug.getNativeHeapAllocatedSize(),
) {
    init {
        require(stage.matches(SAFE_STAGE)) { "diagnostic stage is not a safe identifier: $stage" }
        require(atElapsedRealtimeNs >= 0L) { "event time must not be negative" }
        require(sequence >= 0) { "event sequence must not be negative" }
        require(durationNs == null || durationNs >= 0L) { "duration must not be negative" }
        require(requestedFrames == null || requestedFrames >= 0) { "requestedFrames must not be negative" }
        require(writtenFrames == null || writtenFrames >= 0) { "writtenFrames must not be negative" }
        require(startThresholdFrames == null || startThresholdFrames >= 0L) { "startThresholdFrames must not be negative" }
        require(playbackBoundaryFrames == null || playbackBoundaryFrames >= 0L) {
            "playbackBoundaryFrames must not be negative"
        }
        require(playbackCompletionSource == null || playbackCompletionSource.matches(SAFE_STAGE)) {
            "playbackCompletionSource is not a safe identifier: $playbackCompletionSource"
        }
        require(terminalDrainRemainingFrames == null || terminalDrainRemainingFrames >= 0L) {
            "terminalDrainRemainingFrames must not be negative"
        }
        require(terminalDrainExpectedNs == null || terminalDrainExpectedNs >= 0L) {
            "terminalDrainExpectedNs must not be negative"
        }
        require(levelGainDb == null || levelGainDb.isFinite()) { "levelGainDb must be finite" }
        require(limiterCeilingDbfs == null || limiterCeilingDbfs.isFinite()) {
            "limiterCeilingDbfs must be finite"
        }
        require(inputPeakAbs == null || inputPeakAbs.isFinite() && inputPeakAbs >= 0.0) {
            "inputPeakAbs must be finite and non-negative"
        }
        require(outputPeakAbs == null || outputPeakAbs.isFinite() && outputPeakAbs >= 0.0) {
            "outputPeakAbs must be finite and non-negative"
        }
        require(limitedSampleFrames == null || limitedSampleFrames >= 0) {
            "limitedSampleFrames must not be negative"
        }
        require(limiterGainReductionDb == null || limiterGainReductionDb.isFinite() && limiterGainReductionDb >= 0.0) {
            "limiterGainReductionDb must be finite and non-negative"
        }
        require(onsetDiscardedSamples == null || onsetDiscardedSamples >= 0) {
            "onsetDiscardedSamples must not be negative"
        }
        require(onsetLeadingSilenceSamples == null || onsetLeadingSilenceSamples >= 0) {
            "onsetLeadingSilenceSamples must not be negative"
        }
        require(onsetGapStartSamples == null || onsetGapStartSamples >= 0) {
            "onsetGapStartSamples must not be negative"
        }
        require(onsetGapEndSamples == null || onsetGapEndSamples >= 0) {
            "onsetGapEndSamples must not be negative"
        }
        require(onsetResumeStartSamples == null || onsetResumeStartSamples >= 0) {
            "onsetResumeStartSamples must not be negative"
        }
        require(onsetAnalysisWindowSamples == null || onsetAnalysisWindowSamples > 0) {
            "onsetAnalysisWindowSamples must be positive"
        }
        require(onsetBoundaryThreshold == null || onsetBoundaryThreshold.isFinite() && onsetBoundaryThreshold > 0.0) {
            "onsetBoundaryThreshold must be finite and positive"
        }
        require(onsetBoundarySource == null || onsetBoundarySource.matches(SAFE_STAGE)) {
            "onsetBoundarySource is not a safe identifier: $onsetBoundarySource"
        }
    }

    private companion object {
        val SAFE_STAGE = Regex("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")
    }
}
