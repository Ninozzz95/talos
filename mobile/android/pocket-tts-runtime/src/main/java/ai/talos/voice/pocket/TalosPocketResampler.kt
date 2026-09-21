package ai.talos.voice.pocket

import kotlin.math.abs
import kotlin.math.roundToInt


internal interface TalosPocketResamplerNativeBridge {
    fun resampleMono(source: FloatArray, inputRate: Int, outputRate: Int): FloatArray
}

private object TalosPocketResamplerJni : TalosPocketResamplerNativeBridge {
    init {
        System.loadLibrary("talos_pocket_sentencepiece")
    }

    external override fun resampleMono(source: FloatArray, inputRate: Int, outputRate: Int): FloatArray
}

class TalosPocketResampler private constructor(
    private val bridge: TalosPocketResamplerNativeBridge,
) {
    fun resampleMono(source: FloatArray, inputRate: Int, outputRate: Int): FloatArray {
        require(inputRate in MIN_SAMPLE_RATE..MAX_SAMPLE_RATE) {
            "Pocket input sample rate must be in [$MIN_SAMPLE_RATE, $MAX_SAMPLE_RATE] Hz"
        }
        require(outputRate in MIN_SAMPLE_RATE..MAX_SAMPLE_RATE) {
            "Pocket output sample rate must be in [$MIN_SAMPLE_RATE, $MAX_SAMPLE_RATE] Hz"
        }
        require(source.isNotEmpty()) { "Pocket reference PCM must not be empty" }
        require(source.size <= inputRate * MAX_REFERENCE_SECONDS) {
            "Pocket reference PCM must not exceed $MAX_REFERENCE_SECONDS seconds"
        }
        require(source.all(Float::isFinite)) { "Pocket reference PCM contains non-finite samples" }

        if (inputRate == outputRate) return source.copyOf()

        val expectedFrames = (source.size.toDouble() * outputRate / inputRate).roundToInt()
        val output = bridge.resampleMono(source, inputRate, outputRate)
        check(output.isNotEmpty()) { "libsamplerate returned empty PCM" }
        check(abs(output.size - expectedFrames) <= MAX_FRAME_COUNT_DRIFT) {
            "libsamplerate returned ${output.size} frames; expected $expectedFrames"
        }
        check(output.all(Float::isFinite)) { "libsamplerate returned non-finite PCM" }
        return output
    }

    companion object {
        private const val MIN_SAMPLE_RATE = 8_000
        private const val MAX_SAMPLE_RATE = 192_000
        private const val MAX_REFERENCE_SECONDS = 20
        private const val MAX_FRAME_COUNT_DRIFT = 1

        val production: TalosPocketResampler by lazy { TalosPocketResampler(TalosPocketResamplerJni) }

        internal fun forTesting(bridge: TalosPocketResamplerNativeBridge): TalosPocketResampler =
            TalosPocketResampler(bridge)
    }
}
