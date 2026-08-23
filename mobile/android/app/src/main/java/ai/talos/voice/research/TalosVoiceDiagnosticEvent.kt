package ai.talos.voice.research

import android.os.Debug
import android.os.SystemClock

internal enum class TalosVoiceDiagnosticEventKind {
    ROUTE_ARMED,
    PRODUCTION_DOOR_ENTERED,
    ROUTE_RESOLVED,
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
    val playbackHeadFrames: Long? = null,
    val underrunCount: Int? = null,
    val cancellationGeneration: Long? = null,
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
    }

    private companion object {
        val SAFE_STAGE = Regex("[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}")
    }
}

