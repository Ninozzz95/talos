package ai.talos.voice.pocket

import kotlin.math.abs

data class TalosPocketOnsetConfig(
    val sampleRate: Int,
    val thresholdRatio: Float = 0.02f,
    val minPrefixMs: Int = 150,
    val maxPrefixMs: Int = 1_000,
    val silenceGapMs: Int = 80,
    val leadingSilenceMs: Int = 50,
    val analysisWindowMs: Int = 10,
    val resumeSpeechMs: Int = 20,
    val maxOnsetMs: Int = 3_000,
) {
    val minPrefixSamples: Int = durationSamples(minPrefixMs)
    val maxPrefixSamples: Int = durationSamples(maxPrefixMs)
    val silenceGapSamples: Int = durationSamples(silenceGapMs)
    val leadingSilenceSamples: Int = durationSamples(leadingSilenceMs)
    val analysisWindowSamples: Int = durationSamples(analysisWindowMs)
    val resumeSpeechSamples: Int = durationSamples(resumeSpeechMs)
    val maxOnsetSamples: Int = durationSamples(maxOnsetMs)

    init {
        require(sampleRate > 0) { "Pocket onset sample rate must be positive" }
        require(thresholdRatio.isFinite() && thresholdRatio > 0f && thresholdRatio < 1f) {
            "Pocket onset threshold ratio must be in (0, 1)"
        }
        require(minPrefixMs >= 0 && maxPrefixMs > minPrefixMs) { "Pocket onset prefix window is invalid" }
        require(silenceGapMs > 0 && leadingSilenceMs in 0..silenceGapMs) {
            "Pocket onset silence window is invalid"
        }
        require(analysisWindowMs > 0 && analysisWindowMs <= silenceGapMs) {
            "Pocket onset analysis window is invalid"
        }
        require(resumeSpeechMs > 0 && maxOnsetMs > maxPrefixMs) {
            "Pocket onset resume window is invalid"
        }
    }

    private fun durationSamples(milliseconds: Int): Int =
        ((sampleRate.toLong() * milliseconds + 999L) / 1_000L).toInt()
}

data class TalosPocketOnsetResult(
    val discardedSamples: Int,
    val leadingSilenceSamples: Int,
    val boundaryThreshold: Float,
    val boundarySource: String,
    val gapStartSamples: Int,
    val gapEndSamples: Int,
    val resumeStartSamples: Int,
    val analysisWindowSamples: Int,
)

data class TalosPocketOnsetCompletion(
    val pcmFloatMono: FloatArray,
    val result: TalosPocketOnsetResult,
)

/**
 * Streaming adaptation of the pinned Pocket TTS sacrificial-prefix remedy.
 * Audio is held until the first complete silence gap after the prefix; no
 * sacrificial sample can escape when the boundary is absent or cancellation
 * wins. Once released, subsequent decoder chunks pass through unchanged.
 */
class TalosPocketOnsetStabilizer(
    private val config: TalosPocketOnsetConfig,
) {
    private var buffered = FloatArray(0)
    private var result: TalosPocketOnsetResult? = null
    private var cancelled = false
    private var boundaryImpossible = false

    fun accept(pcmFloatMono: FloatArray): FloatArray {
        check(!cancelled) { "Pocket onset stabilizer is cancelled" }
        check(!boundaryImpossible) { "Pocket onset boundary was not found" }
        require(pcmFloatMono.all(Float::isFinite)) { "Pocket onset PCM contains non-finite samples" }
        if (pcmFloatMono.isEmpty()) return pcmFloatMono
        if (result != null) return pcmFloatMono

        val joined = FloatArray(buffered.size + pcmFloatMono.size)
        buffered.copyInto(joined)
        pcmFloatMono.copyInto(joined, buffered.size)
        buffered.fill(0f)
        buffered = joined

        val boundary = findBoundary(requireCompleteSearchWindow = true) ?: run {
            if (buffered.size > config.maxOnsetSamples) {
                boundaryImpossible = true
                clearBuffer()
            }
            return FloatArray(0)
        }
        return release(boundary).pcmFloatMono
    }

    fun complete(): TalosPocketOnsetCompletion {
        check(!cancelled) { "Pocket onset stabilizer is cancelled" }
        check(!boundaryImpossible) { "Pocket onset boundary was not found" }
        result?.let { return TalosPocketOnsetCompletion(FloatArray(0), it) }
        val boundary = findBoundary(requireCompleteSearchWindow = false)
            ?: run {
                boundaryImpossible = true
                clearBuffer()
                error("Pocket onset boundary was not found")
            }
        return release(boundary)
    }

    private fun release(boundary: Boundary): TalosPocketOnsetCompletion {
        val outputStart = (boundary.resumeStart - config.leadingSilenceSamples)
            .coerceAtLeast(boundary.gapStart)
        val output = buffered.copyOfRange(outputStart, buffered.size)
        val measured = TalosPocketOnsetResult(
            discardedSamples = outputStart,
            leadingSilenceSamples = boundary.resumeStart - outputStart,
            boundaryThreshold = boundary.threshold,
            boundarySource = BOUNDARY_SOURCE,
            gapStartSamples = boundary.gapStart,
            gapEndSamples = boundary.gapEnd,
            resumeStartSamples = boundary.resumeStart,
            analysisWindowSamples = config.analysisWindowSamples,
        )
        result = measured
        clearBuffer()
        return TalosPocketOnsetCompletion(output, measured)
    }

    fun finish(): TalosPocketOnsetResult {
        check(!cancelled) { "Pocket onset stabilizer is cancelled" }
        return checkNotNull(result) { "Pocket onset boundary was not found" }
    }

    fun cancel() {
        cancelled = true
        clearBuffer()
    }

    internal fun bufferedSamples(): Int = buffered.size

    private fun findBoundary(requireCompleteSearchWindow: Boolean): Boundary? {
        val windowSamples = config.analysisWindowSamples
        val completeWindows = buffered.size / windowSamples
        if (requireCompleteSearchWindow && buffered.size < config.maxPrefixSamples) return null
        val searchStartWindow = ceilDiv(config.minPrefixSamples, windowSamples)
        val searchEndWindow = minOf(completeWindows, config.maxPrefixSamples / windowSamples)
        val silenceWindows = ceilDiv(config.silenceGapSamples, windowSamples)
        val resumeWindows = ceilDiv(config.resumeSpeechSamples, windowSamples)
        if (searchEndWindow - searchStartWindow < silenceWindows || completeWindows < resumeWindows) return null
        var peak = 0f
        for (index in 0 until minOf(buffered.size, config.maxPrefixSamples)) {
            peak = maxOf(peak, abs(buffered[index]))
        }
        if (peak == 0f) return null
        val threshold = peak * config.thresholdRatio
        val thresholdSquared = threshold.toDouble() * threshold
        val quiet = BooleanArray(completeWindows) { window ->
            val start = window * windowSamples
            var sumSquares = 0.0
            for (index in start until start + windowSamples) {
                val value = buffered[index].toDouble()
                sumSquares += value * value
            }
            sumSquares / windowSamples < thresholdSquared
        }
        var longestGapStartWindow = -1
        var longestGapEndWindow = -1
        var cursor = searchStartWindow
        while (cursor < searchEndWindow) {
            if (!quiet[cursor]) {
                cursor += 1
                continue
            }
            val gapStart = cursor
            while (cursor < searchEndWindow && quiet[cursor]) cursor += 1
            if (cursor - gapStart > longestGapEndWindow - longestGapStartWindow) {
                longestGapStartWindow = gapStart
                longestGapEndWindow = cursor
            }
        }
        if (longestGapEndWindow - longestGapStartWindow < silenceWindows) return null
        for (resumeWindow in longestGapEndWindow..(completeWindows - resumeWindows)) {
            if ((resumeWindow until resumeWindow + resumeWindows).all { !quiet[it] }) {
                return Boundary(
                    gapStart = longestGapStartWindow * windowSamples,
                    gapEnd = longestGapEndWindow * windowSamples,
                    resumeStart = resumeWindow * windowSamples,
                    threshold = threshold,
                )
            }
        }
        return null
    }

    private fun ceilDiv(value: Int, divisor: Int): Int = (value + divisor - 1) / divisor

    private fun clearBuffer() {
        buffered.fill(0f)
        buffered = FloatArray(0)
    }

    private data class Boundary(
        val gapStart: Int,
        val gapEnd: Int,
        val resumeStart: Int,
        val threshold: Float,
    )

    companion object {
        const val SACRIFICIAL_PREFIX = "Quattro. "
        const val BOUNDARY_SOURCE = "MEASURED_ITALIAN_PREFIX_WINDOWED_RMS_LONGEST_GAP"
    }
}
