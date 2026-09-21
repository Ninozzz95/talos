package ai.talos.voice.research

import android.os.SystemClock
import java.nio.ByteBuffer
import java.security.MessageDigest
import kotlin.math.max

/**
 * Opt-in B0 recorder. The autoregressive loop writes primitives only; the
 * immutable trace objects are materialized after the timed run finishes.
 */
internal class TalosVoiceTraceRecorder(
    val utteranceId: Long,
    val mode: TalosVoiceRunMode,
    val audioFrameDurationNs: Long = AUDIO_FRAME_DURATION_NS,
) {
    private val startedAtElapsedRealtimeNs = SystemClock.elapsedRealtimeNanos()
    private var size = 0
    private var capacity = INITIAL_CAPACITY

    private var frameIndexes = IntArray(capacity)
    private var pastValidLengths = IntArray(capacity)
    private var localSampleTimes = LongArray(capacity)
    private var localOrtRunTimes = LongArray(capacity)
    private var callbackTimes = LongArray(capacity)
    private var globalInputPrepTimes = LongArray(capacity)
    private var globalDecodeTimes = LongArray(capacity)
    private var kvTransitionTimes = LongArray(capacity)
    private var totalStepTimes = LongArray(capacity)
    private var javaHeapSizes = LongArray(capacity)
    private var nativeHeapSizes = LongArray(capacity)
    private var gcCounts = LongArray(capacity) { GC_COUNT_MISSING }

    private val codecBatches = ArrayList<TalosVoiceCodecBatchTrace>()
    private val underruns = ArrayList<TalosVoiceUnderrunTrace>()
    private var lastUnderrunCounter: Int? = null
    private var lastUnderrunLeadFrames = 0L
    private var nextUnderrunOrdinal = 1

    fun recordStep(
        frameIndex: Int,
        pastValidLength: Int,
        localSampleNs: Long,
        localOrtRunNs: Long,
        callbackNs: Long,
        globalInputPrepNs: Long,
        globalDecodeNs: Long,
        kvTransitionNs: Long,
        totalStepNs: Long,
        javaHeapBytes: Long,
        nativeHeapBytes: Long,
        gcCount: Long?,
    ) {
        ensureCapacity(size + 1)
        frameIndexes[size] = frameIndex
        pastValidLengths[size] = pastValidLength
        localSampleTimes[size] = localSampleNs
        localOrtRunTimes[size] = localOrtRunNs
        callbackTimes[size] = callbackNs
        globalInputPrepTimes[size] = globalInputPrepNs
        globalDecodeTimes[size] = globalDecodeNs
        kvTransitionTimes[size] = kvTransitionNs
        totalStepTimes[size] = totalStepNs
        javaHeapSizes[size] = javaHeapBytes
        nativeHeapSizes[size] = nativeHeapBytes
        gcCounts[size] = gcCount ?: GC_COUNT_MISSING
        size += 1
    }

    fun recordCodecBatch(
        batchIndex: Int,
        firstFrameIndex: Int,
        frameCount: Int,
        codecDecodeNs: Long,
        audioWriteNs: Long,
        bufferLeadFramesBefore: Long,
        bufferLeadFramesAfter: Long,
        underrunCountBefore: Int,
        underrunCountAfter: Int,
    ) {
        codecBatches += TalosVoiceCodecBatchTrace(
            utteranceId = utteranceId,
            batchIndex = batchIndex,
            firstFrameIndex = firstFrameIndex,
            frameCount = frameCount,
            codecDecodeNs = codecDecodeNs,
            audioWriteNs = audioWriteNs,
            bufferLeadFramesBefore = bufferLeadFramesBefore,
            bufferLeadFramesAfter = bufferLeadFramesAfter,
            underrunCountBefore = underrunCountBefore,
            underrunCountAfter = underrunCountAfter,
        )
    }

    /**
     * AudioTrack exposes only a cumulative count. This records the phase
     * interval in which an increment became observable, but deliberately
     * marks causal attribution UNKNOWN.
     */
    fun checkpointUnderruns(
        phase: TalosVoicePhase,
        observedAtNs: Long,
        frameIndex: Int?,
        batchIndex: Int?,
        counter: Int,
        bufferLeadFrames: Long,
    ) {
        val previous = lastUnderrunCounter
        if (previous == null || counter < previous) {
            lastUnderrunCounter = counter
            lastUnderrunLeadFrames = bufferLeadFrames
            return
        }
        if (counter > previous) {
            for (observedCounter in (previous + 1)..counter) {
                underruns += TalosVoiceUnderrunTrace(
                    ordinal = nextUnderrunOrdinal++,
                    observedAtNs = observedAtNs,
                    observedDuringPhase = phase,
                    frameIndex = frameIndex,
                    batchIndex = batchIndex,
                    counterBefore = observedCounter - 1,
                    counterAfter = observedCounter,
                    bufferLeadFramesBefore = lastUnderrunLeadFrames,
                    bufferLeadFramesAfter = bufferLeadFrames,
                    attribution = TalosVoiceUnderrunAttribution.UNKNOWN,
                )
            }
        }
        lastUnderrunCounter = counter
        lastUnderrunLeadFrames = bufferLeadFrames
    }

    fun finish(
        finishedAtElapsedRealtimeNs: Long,
        generatedFrames: List<IntArray>,
        cancelled: Boolean,
        diagnosticsEnabled: Boolean,
        qualificationOnly: Boolean,
        ortProfiles: TalosVoiceOrtProfileFiles? = null,
    ): TalosVoiceRunTrace = TalosVoiceRunTrace(
        utteranceId = utteranceId,
        mode = mode,
        startedAtElapsedRealtimeNs = startedAtElapsedRealtimeNs,
        finishedAtElapsedRealtimeNs = finishedAtElapsedRealtimeNs,
        wallNs = max(0L, finishedAtElapsedRealtimeNs - startedAtElapsedRealtimeNs),
        audioDurationNs = generatedFrames.size.toLong() * audioFrameDurationNs,
        generatedFrameCount = generatedFrames.size,
        frameSha256 = hashFrames(generatedFrames),
        cancelled = cancelled,
        diagnosticsEnabled = diagnosticsEnabled,
        qualificationOnly = qualificationOnly,
        steps = materializeSteps(),
        codecBatches = codecBatches.toList(),
        underruns = underruns.toList(),
        ortProfiles = ortProfiles,
    )

    private fun materializeSteps(): List<TalosVoiceStepTrace> {
        var rollingTotalNs = 0L
        return List(size) { index ->
            rollingTotalNs += totalStepTimes[index]
            if (index >= ROLLING_WINDOW) rollingTotalNs -= totalStepTimes[index - ROLLING_WINDOW]
            val rollingFrames = minOf(index + 1, ROLLING_WINDOW)
            val namedPhaseNs = localSampleTimes[index] + callbackTimes[index] + globalInputPrepTimes[index] +
                globalDecodeTimes[index] + kvTransitionTimes[index]
            TalosVoiceStepTrace(
                utteranceId = utteranceId,
                frameIndex = frameIndexes[index],
                pastValidLength = pastValidLengths[index],
                localSampleNs = localSampleTimes[index],
                localOrtRunNs = localOrtRunTimes[index],
                callbackNs = callbackTimes[index],
                globalInputPrepNs = globalInputPrepTimes[index],
                globalDecodeNs = globalDecodeTimes[index],
                kvTransitionNs = kvTransitionTimes[index],
                totalStepNs = totalStepTimes[index],
                residualNs = totalStepTimes[index] - namedPhaseNs,
                rollingRtf16 = rollingTotalNs.toDouble() / (rollingFrames.toDouble() * audioFrameDurationNs),
                javaHeapBytes = javaHeapSizes[index],
                nativeHeapBytes = nativeHeapSizes[index],
                gcCount = gcCounts[index].takeUnless { it == GC_COUNT_MISSING },
            )
        }
    }

    private fun ensureCapacity(required: Int) {
        if (required <= capacity) return
        capacity = max(required, capacity * 2)
        frameIndexes = frameIndexes.copyOf(capacity)
        pastValidLengths = pastValidLengths.copyOf(capacity)
        localSampleTimes = localSampleTimes.copyOf(capacity)
        localOrtRunTimes = localOrtRunTimes.copyOf(capacity)
        callbackTimes = callbackTimes.copyOf(capacity)
        globalInputPrepTimes = globalInputPrepTimes.copyOf(capacity)
        globalDecodeTimes = globalDecodeTimes.copyOf(capacity)
        kvTransitionTimes = kvTransitionTimes.copyOf(capacity)
        totalStepTimes = totalStepTimes.copyOf(capacity)
        javaHeapSizes = javaHeapSizes.copyOf(capacity)
        nativeHeapSizes = nativeHeapSizes.copyOf(capacity)
        gcCounts = gcCounts.copyOf(capacity).also { expanded ->
            for (index in size until expanded.size) expanded[index] = GC_COUNT_MISSING
        }
    }

    private fun hashFrames(frames: List<IntArray>): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val integer = ByteBuffer.allocate(Int.SIZE_BYTES)
        fun update(value: Int) {
            integer.clear()
            integer.putInt(value)
            digest.update(integer.array())
        }
        update(frames.size)
        frames.forEach { frame ->
            update(frame.size)
            frame.forEach(::update)
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private companion object {
        const val INITIAL_CAPACITY = 64
        const val ROLLING_WINDOW = 16
        const val AUDIO_FRAME_DURATION_NS = 80_000_000L
        const val GC_COUNT_MISSING = Long.MIN_VALUE
    }
}
