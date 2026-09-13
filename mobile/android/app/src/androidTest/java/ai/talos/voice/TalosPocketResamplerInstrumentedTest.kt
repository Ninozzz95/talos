package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketResampler
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.sqrt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith


@RunWith(AndroidJUnit4::class)
class TalosPocketResamplerInstrumentedTest {
    @Test
    fun nativeBestQualitySincPreservesSpeechBandAndRejectsAboveNyquistAlias() {
        val resampler = TalosPocketResampler.production
        val passband = sine(frequencyHz = 1_000.0, sampleRate = 48_000, frames = 48_000)
        val stopband = sine(frequencyHz = 18_000.0, sampleRate = 48_000, frames = 48_000)

        val convertedPassband = resampler.resampleMono(passband, 48_000, 24_000)
        val convertedStopband = resampler.resampleMono(stopband, 48_000, 24_000)

        assertEquals(24_000, convertedPassband.size)
        assertEquals(24_000, convertedStopband.size)
        val passbandRms = rms(convertedPassband, trimFrames = 1_024)
        val stopbandRms = rms(convertedStopband, trimFrames = 1_024)
        assertTrue("1 kHz RMS must be preserved, got $passbandRms", passbandRms in 0.54..0.59)
        assertTrue("18 kHz must not alias into speech band, got RMS $stopbandRms", stopbandRms < 0.01)
        assertTrue(
            "stopband rejection must exceed 34 dB",
            passbandRms / stopbandRms.coerceAtLeast(1e-9) > 50.0,
        )
    }

    @Test
    fun nativeConversionProducesTheExactMimiFrameCountAtSixteenKilohertz() {
        val converted = TalosPocketResampler.production.resampleMono(
            sine(frequencyHz = 440.0, sampleRate = 16_000, frames = 16_000),
            inputRate = 16_000,
            outputRate = 24_000,
        )

        assertEquals(24_000, converted.size)
        assertTrue(converted.all(Float::isFinite))
    }

    private fun sine(frequencyHz: Double, sampleRate: Int, frames: Int): FloatArray =
        FloatArray(frames) { index ->
            (0.8 * sin(2.0 * PI * frequencyHz * index / sampleRate)).toFloat()
        }

    private fun rms(source: FloatArray, trimFrames: Int): Double {
        require(source.size > trimFrames * 2)
        var energy = 0.0
        for (index in trimFrames until source.size - trimFrames) {
            energy += source[index] * source[index]
        }
        return sqrt(energy / (source.size - trimFrames * 2))
    }
}
