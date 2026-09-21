package ai.talos.voice

import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Blueprint §12.1's required metrics, computed once per captured phrase. */
internal data class TalosVoiceQualityMetrics(
    val durationMs: Long,
    val speechRatio: Double,
    val peakAbs: Double,
    val rmsDbfs: Double,
    val clippedSampleRatio: Double,
    val dcOffset: Double,
    val noiseFloorDbfs: Double,
    val snrEstimateDb: Double,
    val longestSilenceMs: Long,
    val zeroFrameRatio: Double,
    val droppedReadCount: Int,
    val clientSilencedObserved: Boolean,
)

internal data class TalosVoiceQualityVerdict(
    val accepted: Boolean,
    /** Empty iff accepted - each entry names one §12.2 hard-rejection condition that actually fired, not a generic "rejected". */
    val rejectionReasons: List<String>,
    val metrics: TalosVoiceQualityMetrics,
)

/**
 * Blueprint §12: "do not encode every recording simply because AudioRecord
 * returned bytes." §12.2's rejections are gates on conditions that need no
 * per-device calibration - near silence, gross clipping, a broken capture
 * path. §12.3: measure and reject, do not enhance a bad sample and hope -
 * V1 has no denoising path here at all, on purpose.
 *
 * ⛔ NON VERIFICATO: `snrEstimateDb`/`noiseFloorDbfs` are computed and
 * returned for every capture, but neither gates rejection. Blueprint §12.2
 * itself: "do not invent a single universal dB threshold and ship it
 * unmeasured" - these need calibration against real enrollment recordings
 * on real TALOS devices, which this pass has not done. Surfaced as data,
 * not silently thresholded.
 */
internal object TalosVoiceQuality {
    // Hard-rejection thresholds: only the ones blueprint §12.2 calls
    // non-negotiable and that hold regardless of device/room - not tuned
    // per hardware, so safe to ship without device-specific calibration.
    private const val MIN_DURATION_MS = 500L
    private const val NEAR_ZERO_PEAK = 0.001
    private const val GROSS_CLIP_RATIO = 0.05
    private const val SEVERE_DC_OFFSET = 0.30
    private const val EXCESSIVE_SILENCE_RATIO = 0.90

    fun evaluate(capture: TalosVoiceCaptureResult, frameMs: Int = 20): TalosVoiceQualityVerdict {
        val metrics = computeMetrics(capture, frameMs)
        val reasons = ArrayList<String>()

        if (capture.clientSilencedObserved) reasons += "clientSilencedObserved"
        if (capture.pcm16Mono.isEmpty()) reasons += "emptyCapture"
        if (metrics.durationMs < MIN_DURATION_MS) reasons += "durationBelowMinimum(${metrics.durationMs}ms < ${MIN_DURATION_MS}ms)"
        if (metrics.peakAbs < NEAR_ZERO_PEAK) reasons += "nearZeroSignal(peak=${metrics.peakAbs})"
        if (metrics.clippedSampleRatio > GROSS_CLIP_RATIO) reasons += "grossClipping(${metrics.clippedSampleRatio})"
        if (kotlin.math.abs(metrics.dcOffset) > SEVERE_DC_OFFSET) reasons += "severeDcOffset(${metrics.dcOffset})"
        if (metrics.zeroFrameRatio > EXCESSIVE_SILENCE_RATIO) reasons += "excessiveSilence(zeroFrameRatio=${metrics.zeroFrameRatio})"
        if (capture.droppedReadCount > 0 && capture.pcm16Mono.isEmpty()) reasons += "corruptedFrameCount(droppedReadCount=${capture.droppedReadCount}, samples=0)"

        return TalosVoiceQualityVerdict(accepted = reasons.isEmpty(), rejectionReasons = reasons, metrics = metrics)
    }

    private fun computeMetrics(capture: TalosVoiceCaptureResult, frameMs: Int): TalosVoiceQualityMetrics {
        val samples = capture.pcm16Mono
        val sampleRate = capture.sampleRate.coerceAtLeast(1)
        val durationMs = (samples.size.toLong() * 1000L) / sampleRate

        if (samples.isEmpty()) {
            return TalosVoiceQualityMetrics(
                durationMs = 0,
                speechRatio = 0.0,
                peakAbs = 0.0,
                rmsDbfs = NEGATIVE_INFINITY_DBFS,
                clippedSampleRatio = 0.0,
                dcOffset = 0.0,
                noiseFloorDbfs = NEGATIVE_INFINITY_DBFS,
                snrEstimateDb = 0.0,
                longestSilenceMs = durationMs,
                zeroFrameRatio = 1.0,
                droppedReadCount = capture.droppedReadCount,
                clientSilencedObserved = capture.clientSilencedObserved,
            )
        }

        var sumSquares = 0.0
        var sumValues = 0.0
        var peak = 0.0
        var clippedCount = 0
        for (s in samples) {
            val v = s / 32768.0
            sumSquares += v * v
            sumValues += v
            val a = kotlin.math.abs(v)
            if (a > peak) peak = a
            if (a >= CLIP_THRESHOLD) clippedCount++
        }
        val dcOffset = sumValues / samples.size
        val rms = sqrt(sumSquares / samples.size)
        val rmsDbfs = if (rms > 0) 20.0 * ln(rms) / ln(10.0) else NEGATIVE_INFINITY_DBFS

        // Per-frame RMS, framed at frameMs, for silence/activity/noise-floor analysis.
        val frameSamples = max(1, sampleRate * frameMs / 1000)
        val frameCount = (samples.size + frameSamples - 1) / frameSamples
        val frameRms = DoubleArray(frameCount)
        val frameIsZero = BooleanArray(frameCount)
        for (f in 0 until frameCount) {
            val start = f * frameSamples
            val end = min(samples.size, start + frameSamples)
            var frameSumSquares = 0.0
            var allZero = true
            for (i in start until end) {
                val v = samples[i] / 32768.0
                frameSumSquares += v * v
                if (samples[i] != 0.toShort()) allZero = false
            }
            val count = (end - start).coerceAtLeast(1)
            frameRms[f] = sqrt(frameSumSquares / count)
            frameIsZero[f] = allZero
        }

        val sortedFrameRms = frameRms.sortedArray()
        val noiseFloorRms = percentile(sortedFrameRms, 0.10)
        val activeRms = percentile(sortedFrameRms, 0.90)
        val noiseFloorDbfs = if (noiseFloorRms > 0) 20.0 * ln(noiseFloorRms) / ln(10.0) else NEGATIVE_INFINITY_DBFS
        val activeDbfs = if (activeRms > 0) 20.0 * ln(activeRms) / ln(10.0) else NEGATIVE_INFINITY_DBFS
        val snrEstimateDb = if (noiseFloorDbfs.isFinite() && activeDbfs.isFinite()) activeDbfs - noiseFloorDbfs else 0.0

        val activityThreshold = noiseFloorRms * ACTIVITY_MARGIN_LINEAR
        var activeFrameCount = 0
        var longestSilenceFrames = 0
        var currentSilenceFrames = 0
        for (f in 0 until frameCount) {
            if (frameRms[f] > activityThreshold) {
                activeFrameCount++
                currentSilenceFrames = 0
            } else {
                currentSilenceFrames++
                if (currentSilenceFrames > longestSilenceFrames) longestSilenceFrames = currentSilenceFrames
            }
        }
        val speechRatio = activeFrameCount.toDouble() / frameCount
        val longestSilenceMs = longestSilenceFrames.toLong() * frameMs
        val zeroFrameRatio = frameIsZero.count { it }.toDouble() / frameCount

        return TalosVoiceQualityMetrics(
            durationMs = durationMs,
            speechRatio = speechRatio,
            peakAbs = peak,
            rmsDbfs = rmsDbfs,
            clippedSampleRatio = clippedCount.toDouble() / samples.size,
            dcOffset = dcOffset,
            noiseFloorDbfs = noiseFloorDbfs,
            snrEstimateDb = snrEstimateDb,
            longestSilenceMs = longestSilenceMs,
            zeroFrameRatio = zeroFrameRatio,
            droppedReadCount = capture.droppedReadCount,
            clientSilencedObserved = capture.clientSilencedObserved,
        )
    }

    private fun percentile(sorted: DoubleArray, p: Double): Double {
        if (sorted.isEmpty()) return 0.0
        val index = (p * (sorted.size - 1)).toInt().coerceIn(0, sorted.size - 1)
        return sorted[index]
    }

    private const val CLIP_THRESHOLD = 32760.0 / 32768.0
    private const val ACTIVITY_MARGIN_LINEAR = 3.16 // roughly +10 dB over the noise floor
    private const val NEGATIVE_INFINITY_DBFS = -120.0
}
