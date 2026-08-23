package ai.talos.voice.pocket

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPocketOnsetStabilizerTest {
    @Test
    fun `Italian sacrificial prefix is the single measured boundary winner`() {
        assertEquals("Quattro. ", TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX)
    }

    private val config = TalosPocketOnsetConfig(sampleRate = 1_000, maxPrefixMs = 300)

    @Test
    fun `streaming onset discards prefix speech and preserves exactly fifty milliseconds before the next phoneme`() {
        val stabilizer = TalosPocketOnsetStabilizer(config)
        val source = FloatArray(200) { 0.5f } + FloatArray(100) + FloatArray(100) { 0.25f }

        val output = stabilizer.accept(source)
        val result = stabilizer.finish()

        assertArrayEquals(FloatArray(50) + FloatArray(100) { 0.25f }, output, 0f)
        assertEquals(250, result.discardedSamples)
        assertEquals(50, result.leadingSilenceSamples)
        assertEquals(0.01f, result.boundaryThreshold, 0f)
        assertEquals(TalosPocketOnsetStabilizer.BOUNDARY_SOURCE, result.boundarySource)
        assertEquals(200, result.gapStartSamples)
        assertEquals(300, result.gapEndSamples)
        assertEquals(300, result.resumeStartSamples)
        assertEquals(10, result.analysisWindowSamples)
    }

    @Test
    fun `peak after the fixed prefix window cannot change the selected boundary threshold`() {
        val source = FloatArray(200) { 0.1f } +
            FloatArray(200) { 0.001f } +
            FloatArray(600) { 0.2f } +
            FloatArray(100) { 1f }
        val whole = TalosPocketOnsetStabilizer(
            TalosPocketOnsetConfig(sampleRate = 1_000, maxOnsetMs = 2_000),
        )
        val wholeOutput = whole.accept(source)
        val chunked = TalosPocketOnsetStabilizer(
            TalosPocketOnsetConfig(sampleRate = 1_000, maxOnsetMs = 2_000),
        )
        val chunkedOutput = chunked.accept(source.copyOfRange(0, 1_000)) +
            chunked.accept(source.copyOfRange(1_000, source.size))

        assertArrayEquals(wholeOutput, chunkedOutput, 0f)
        assertEquals(whole.finish(), chunked.finish())
        val result = whole.finish()
        assertEquals(350, result.discardedSamples)
        assertEquals(200, result.gapStartSamples)
        assertEquals(400, result.gapEndSamples)
        assertEquals(400, result.resumeStartSamples)
        assertEquals(0.004f, result.boundaryThreshold, 0.000001f)
    }

    @Test
    fun `longest quiet gap wins over an earlier qualifying gap`() {
        val stabilizer = TalosPocketOnsetStabilizer(
            TalosPocketOnsetConfig(sampleRate = 1_000),
        )
        val source = FloatArray(150) { 0.1f } +
            FloatArray(80) +
            FloatArray(20) { 0.1f } +
            FloatArray(150) +
            FloatArray(600) { 0.2f }

        val output = stabilizer.accept(source)
        val result = stabilizer.finish()

        assertArrayEquals(FloatArray(50) + FloatArray(600) { 0.2f }, output, 0f)
        assertEquals(350, result.discardedSamples)
        assertEquals(250, result.gapStartSamples)
        assertEquals(400, result.gapEndSamples)
        assertEquals(400, result.resumeStartSamples)
    }

    @Test
    fun `completion finds the measured boundary when EOS arrives before the fixed prefix window`() {
        val stabilizer = TalosPocketOnsetStabilizer(
            TalosPocketOnsetConfig(sampleRate = 1_000),
        )
        val source = FloatArray(200) { 0.5f } + FloatArray(100) + FloatArray(100) { 0.25f }

        assertEquals(0, stabilizer.accept(source).size)
        val completion = stabilizer.complete()

        assertArrayEquals(FloatArray(50) + FloatArray(100) { 0.25f }, completion.pcmFloatMono, 0f)
        assertEquals(250, completion.result.discardedSamples)
        assertEquals(completion.result, stabilizer.finish())
    }

    @Test
    fun `callback chunking cannot change the retained PCM or boundary evidence`() {
        val source = FloatArray(200) { 0.5f } + FloatArray(100) + FloatArray(100) { 0.25f }
        val whole = TalosPocketOnsetStabilizer(config)
        val wholeOutput = whole.accept(source)
        val wholeResult = whole.finish()
        val chunked = TalosPocketOnsetStabilizer(config)
        val chunks = listOf(
            source.copyOfRange(0, 137),
            source.copyOfRange(137, 263),
            source.copyOfRange(263, source.size),
        )
        val chunkedOutput = chunks.flatMap { chunked.accept(it).asList() }.toFloatArray()

        assertArrayEquals(wholeOutput, chunkedOutput, 0f)
        assertEquals(wholeResult, chunked.finish())
    }

    @Test
    fun `missing silence fails closed without leaking sacrificial audio`() {
        val stabilizer = TalosPocketOnsetStabilizer(config)

        assertEquals(0, stabilizer.accept(FloatArray(1_100) { 0.5f }).size)
        val error = assertThrows(IllegalStateException::class.java, stabilizer::finish)

        assertTrue(error.message.orEmpty().contains("boundary", ignoreCase = true))
    }

    @Test
    fun `cancellation clears buffered onset and emits nothing`() {
        val stabilizer = TalosPocketOnsetStabilizer(config)
        assertEquals(0, stabilizer.accept(FloatArray(200) { 0.5f }).size)

        stabilizer.cancel()

        assertEquals(0, stabilizer.bufferedSamples())
        assertThrows(IllegalStateException::class.java, stabilizer::finish)
    }
}
