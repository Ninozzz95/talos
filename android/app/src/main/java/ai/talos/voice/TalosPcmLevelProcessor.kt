package ai.talos.voice

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.log10
import kotlin.math.pow

internal enum class TalosPcmLevelProfile(
    val gainDb: Double,
    val limiterCeilingDbfs: Double?,
) {
    PASSTHROUGH(0.0, null),
    POCKET_SPEECH(12.0, -1.0),
}

internal data class TalosPcmLevelStats(
    val profile: TalosPcmLevelProfile,
    val gainDb: Double,
    val limiterCeilingDbfs: Double?,
    val inputPeakAbs: Double,
    val outputPeakAbs: Double,
    val limitedSampleFrames: Int,
    val limiterGainReductionDb: Double,
)

internal data class TalosPcmLevelOutput(
    val pcm16: ShortArray,
    val stats: TalosPcmLevelStats,
)

/**
 * Deterministic final PCM level stage. Pocket output receives the gain
 * calibrated on the exact ARM64 production corpus. A linked, zero-lookahead
 * peak envelope protects every channel without clipping either side
 * independently; the release is evaluated once per sample frame, so callback
 * boundaries cannot change the bytes sent to AudioTrack.
 */
internal class TalosPcmLevelProcessor(
    private val sampleRate: Int,
    private val channels: Int,
    releaseMs: Double = 100.0,
) {
    init {
        require(sampleRate > 0) { "sampleRate must be positive" }
        require(channels == 1 || channels == 2) { "level processor supports mono or stereo only" }
        require(releaseMs > 0.0 && releaseMs.isFinite()) { "releaseMs must be finite and positive" }
    }

    private val releaseCoefficient = exp(-1.0 / (sampleRate * releaseMs / 1_000.0))
    private var limiterScale = 1.0

    fun processToPcm16(
        interleavedPcm: FloatArray,
        profile: TalosPcmLevelProfile,
    ): TalosPcmLevelOutput {
        require(interleavedPcm.size % channels == 0) {
            "interleaved PCM size ${interleavedPcm.size} is not divisible by $channels channels"
        }
        interleavedPcm.forEachIndexed { index, sample ->
            require(sample.isFinite()) { "PCM sample $index is not finite" }
        }

        val gain = 10.0.pow(profile.gainDb / 20.0)
        val ceiling = profile.limiterCeilingDbfs?.let { 10.0.pow(it / 20.0) }
        val pcm16 = ShortArray(interleavedPcm.size)
        var inputPeak = 0.0
        var outputPeak = 0.0
        var limitedFrames = 0
        var minimumLimiterScale = 1.0

        var frameOffset = 0
        while (frameOffset < interleavedPcm.size) {
            var nominalFramePeak = 0.0
            for (channel in 0 until channels) {
                val input = interleavedPcm[frameOffset + channel].toDouble()
                inputPeak = maxOf(inputPeak, abs(input))
                nominalFramePeak = maxOf(nominalFramePeak, abs(input * gain))
            }

            val frameLimiterScale = if (ceiling == null) {
                1.0
            } else {
                val requiredScale = if (nominalFramePeak > ceiling) ceiling / nominalFramePeak else 1.0
                val releasedScale = 1.0 - (1.0 - limiterScale) * releaseCoefficient
                minOf(requiredScale, releasedScale)
            }
            limiterScale = frameLimiterScale
            minimumLimiterScale = minOf(minimumLimiterScale, frameLimiterScale)
            if (frameLimiterScale < LIMITER_INACTIVE_SCALE) limitedFrames += 1

            for (channel in 0 until channels) {
                val output = interleavedPcm[frameOffset + channel].toDouble() * gain * frameLimiterScale
                outputPeak = maxOf(outputPeak, abs(output))
                pcm16[frameOffset + channel] = (output.coerceIn(-1.0, 1.0) * PCM16_MAX).toInt().toShort()
            }
            frameOffset += channels
        }

        val reductionDb = if (minimumLimiterScale < 1.0) {
            -20.0 * log10(minimumLimiterScale)
        } else {
            0.0
        }
        return TalosPcmLevelOutput(
            pcm16 = pcm16,
            stats = TalosPcmLevelStats(
                profile = profile,
                gainDb = profile.gainDb,
                limiterCeilingDbfs = profile.limiterCeilingDbfs,
                inputPeakAbs = inputPeak,
                outputPeakAbs = outputPeak,
                limitedSampleFrames = limitedFrames,
                limiterGainReductionDb = reductionDb,
            ),
        )
    }

    fun reset() {
        limiterScale = 1.0
    }

    private companion object {
        const val PCM16_MAX = 32_767.0
        const val LIMITER_INACTIVE_SCALE = 0.999_999
    }
}
