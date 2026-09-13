package ai.talos.voice.pocket


data class TalosPocketConfig(
    val temperature: Float = 0.3f,
    val lsdSteps: Int = 1,
    val queueCapacityFrames: Int = 24,
    val firstDecodeFrames: Int = 2,
    val regularDecodeFrames: Int = 3,
    val hardMaxFramesPerSentence: Int = 720,
    val stabilizeOnset: Boolean = true,
    val prependOnsetPrefix: Boolean = stabilizeOnset,
) {
    init {
        require(temperature.isFinite() && temperature >= 0f) { "temperature must be finite and non-negative" }
        require(lsdSteps in 1..8) { "lsdSteps must be in [1, 8]" }
        require(queueCapacityFrames in 1..256) { "queueCapacityFrames must be in [1, 256]" }
        require(firstDecodeFrames in 1..queueCapacityFrames) { "firstDecodeFrames exceeds queue capacity" }
        require(regularDecodeFrames in 1..queueCapacityFrames) { "regularDecodeFrames exceeds queue capacity" }
        require(hardMaxFramesPerSentence in 1..10_000) { "hardMaxFramesPerSentence is invalid" }
    }
}

class TalosPocketConditioning private constructor(
    shape: LongArray,
    values: FloatArray,
) {
    val shape: LongArray = shape.copyOf()
    private val values: FloatArray = values.copyOf()

    init {
        require(this.shape.size == 3 && this.shape[0] == 1L && this.shape[1] in 1..256 && this.shape[2] == 1_024L) {
            "Pocket conditioning shape must be [1, 1..256, 1024]"
        }
        require(elementCount(this.shape) == this.values.size) { "Pocket conditioning shape does not match its values" }
        require(this.values.all(Float::isFinite)) { "Pocket conditioning contains non-finite values" }
    }

    fun valuesCopy(): FloatArray = values.copyOf()
    internal fun valuesUnsafe(): FloatArray = values

    companion object {
        fun create(shape: LongArray, values: FloatArray): TalosPocketConditioning = TalosPocketConditioning(shape, values)
    }
}

data class TalosPocketStageMetric(
    val runIndex: Long,
    val stage: String,
    val startedAtNs: Long,
    val durationNs: Long,
    val threadName: String,
    val sentenceIndex: Int? = null,
    val frameIndex: Int? = null,
    val inputFrames: Int? = null,
    val outputSamples: Int? = null,
    val residentStateBytes: Long? = null,
    val onsetDiscardedSamples: Int? = null,
    val onsetLeadingSilenceSamples: Int? = null,
    val onsetGapStartSamples: Int? = null,
    val onsetGapEndSamples: Int? = null,
    val onsetResumeStartSamples: Int? = null,
    val onsetAnalysisWindowSamples: Int? = null,
    val onsetBoundaryThreshold: Float? = null,
    val onsetBoundarySource: String? = null,
)

data class TalosPocketFrame(
    val sentenceIndex: Int,
    val firstFrameIndex: Int,
    val frameCount: Int,
    val sampleRate: Int,
    val pcmFloatMono: FloatArray,
)

interface TalosPocketCallback {
    fun onStage(metric: TalosPocketStageMetric)
    fun onPcm(frame: TalosPocketFrame): Boolean
}

data class TalosPocketSynthesisResult(
    val terminal: TalosPocketPipelineTerminal,
    val sentenceCount: Int,
    val generatedFrames: Int,
    val emittedSamples: Int,
    val onsetDiscardedSamples: Int = 0,
    val elapsedNs: Long,
    val producerBlockedNs: Long,
    val decoderNs: Long,
    val queueHighWatermarkFrames: Int,
) {
    val audioDurationMs: Double get() = emittedSamples * 1_000.0 / 24_000.0
    val rtf: Double? get() = audioDurationMs.takeIf { it > 0.0 }?.let { elapsedNs / 1_000_000.0 / it }
}

class TalosPocketError(message: String, cause: Throwable? = null) : RuntimeException(message, cause)

internal fun elementCount(shape: LongArray): Int {
    require(shape.all { it >= 0L }) { "tensor shape contains a negative dimension" }
    val count = shape.fold(1L) { current, dimension -> Math.multiplyExact(current, dimension) }
    require(count <= Int.MAX_VALUE) { "tensor shape exceeds the Java addressable element count" }
    return count.toInt()
}
