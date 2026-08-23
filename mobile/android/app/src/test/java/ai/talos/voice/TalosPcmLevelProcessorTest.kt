package ai.talos.voice

import kotlin.math.abs
import kotlin.math.pow
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPcmLevelProcessorTest {
    @Test
    fun `Pocket speech gain is exact below the limiter`() {
        val processor = TalosPcmLevelProcessor(sampleRate = 24_000, channels = 1)
        val input = floatArrayOf(0.05f, -0.1f, 0.2f)

        val output = processor.processToPcm16(input, TalosPcmLevelProfile.POCKET_SPEECH)

        val gain = 10.0.pow(12.0 / 20.0).toFloat()
        val expected = ShortArray(input.size) { index -> (input[index] * gain * 32_767f).toInt().toShort() }
        assertArrayEquals(expected, output.pcm16)
        assertEquals(12.0, output.stats.gainDb, 0.0)
        assertEquals(0, output.stats.limitedSampleFrames)

        val passthrough = processor.processToPcm16(input, TalosPcmLevelProfile.PASSTHROUGH)
        assertArrayEquals(
            ShortArray(input.size) { index -> (input[index] * 32_767f).toInt().toShort() },
            passthrough.pcm16,
        )
    }

    @Test
    fun `limiter never crosses its sample ceiling and is invariant to callback boundaries`() {
        val input = floatArrayOf(0.02f, 0.8f, -0.7f, 0.05f, 0.04f, 0.03f, -0.6f, 0.01f)
        val wholeProcessor = TalosPcmLevelProcessor(sampleRate = 24_000, channels = 1)
        val whole = wholeProcessor.processToPcm16(input, TalosPcmLevelProfile.POCKET_SPEECH)

        val chunkedProcessor = TalosPcmLevelProcessor(sampleRate = 24_000, channels = 1)
        val chunks = listOf(input.copyOfRange(0, 1), input.copyOfRange(1, 5), input.copyOfRange(5, input.size))
            .map { chunk -> chunkedProcessor.processToPcm16(chunk, TalosPcmLevelProfile.POCKET_SPEECH) }
        val chunked = chunks.flatMap { result -> result.pcm16.toList() }.toShortArray()

        assertArrayEquals(whole.pcm16, chunked)
        val ceiling = (10.0.pow(-1.0 / 20.0) * 32_767.0).toInt() + 1
        assertTrue(whole.pcm16.all { sample -> abs(sample.toInt()) <= ceiling })
        assertTrue(whole.stats.limitedSampleFrames > 0)
        assertTrue(chunks.sumOf { it.stats.limitedSampleFrames } > 0)
    }

    @Test
    fun `stereo limiting is linked and preserves channel ratio`() {
        val output = TalosPcmLevelProcessor(sampleRate = 24_000, channels = 2)
            .processToPcm16(floatArrayOf(0.8f, 0.4f), TalosPcmLevelProfile.POCKET_SPEECH)

        assertTrue(output.stats.limitedSampleFrames == 1)
        assertTrue(abs(output.pcm16[0].toInt() - output.pcm16[1].toInt() * 2) <= 2)
    }

    @Test
    fun `non finite PCM fails without contaminating limiter state`() {
        val processor = TalosPcmLevelProcessor(sampleRate = 24_000, channels = 1)
        assertThrows(IllegalArgumentException::class.java) {
            processor.processToPcm16(floatArrayOf(0.8f, Float.NaN), TalosPcmLevelProfile.POCKET_SPEECH)
        }

        val afterFailure = processor.processToPcm16(floatArrayOf(0.05f), TalosPcmLevelProfile.POCKET_SPEECH)
        val fresh = TalosPcmLevelProcessor(sampleRate = 24_000, channels = 1)
            .processToPcm16(floatArrayOf(0.05f), TalosPcmLevelProfile.POCKET_SPEECH)
        assertArrayEquals(fresh.pcm16, afterFailure.pcm16)
    }
}
