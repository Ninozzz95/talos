package ai.talos.voice.pocket

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test


class TalosPocketResamplerTest {
    @Test
    fun `validated conversion delegates once and preserves the exact expected frame count`() {
        val bridge = RecordingBridge(FloatArray(24_000) { it / 24_000f })
        val resampler = TalosPocketResampler.forTesting(bridge)

        val output = resampler.resampleMono(FloatArray(16_000), 16_000, 24_000)

        assertEquals(1, bridge.calls)
        assertEquals(16_000, bridge.lastInputRate)
        assertEquals(24_000, bridge.lastOutputRate)
        assertEquals(24_000, output.size)
    }

    @Test
    fun `same rate returns a defensive copy without entering native code`() {
        val bridge = RecordingBridge(FloatArray(0))
        val source = floatArrayOf(-1f, 0f, 1f)
        val output = TalosPocketResampler.forTesting(bridge).resampleMono(source, 24_000, 24_000)

        assertArrayEquals(source, output, 0f)
        source[0] = 0f
        assertEquals(-1f, output[0])
        assertEquals(0, bridge.calls)
    }

    @Test
    fun `invalid PCM rates duration and native output fail closed`() {
        val resampler = TalosPocketResampler.forTesting(RecordingBridge(FloatArray(1)))
        assertThrows(IllegalArgumentException::class.java) {
            resampler.resampleMono(floatArrayOf(Float.NaN), 24_000, 24_000)
        }
        assertThrows(IllegalArgumentException::class.java) {
            resampler.resampleMono(FloatArray(1), 7_999, 24_000)
        }
        assertThrows(IllegalArgumentException::class.java) {
            resampler.resampleMono(FloatArray(24_000 * 21), 24_000, 16_000)
        }
        assertThrows(IllegalStateException::class.java) {
            resampler.resampleMono(FloatArray(16_000), 16_000, 24_000)
        }
    }

    private class RecordingBridge(private val output: FloatArray) : TalosPocketResamplerNativeBridge {
        var calls = 0
        var lastInputRate = 0
        var lastOutputRate = 0

        override fun resampleMono(source: FloatArray, inputRate: Int, outputRate: Int): FloatArray {
            calls += 1
            lastInputRate = inputRate
            lastOutputRate = outputRate
            return output.copyOf()
        }
    }
}
