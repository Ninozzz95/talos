package ai.talos.voice.pocket

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPocketOnsetStabilizerTest {
    @Test
    fun `Italian sacrificial prefix is the single measured boundary winner`() {
        // 12/09: virgola, non punto — dopo un punto la voce dell'owner taceva 2,5 s.
        assertEquals("Quattro, ", TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX)
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

    /*
     * 12/09/2026: prima «fail closed» — nessuna pausa qualificante ⇒ lettura
     * intera muta (misurato sul Pad con una risposta italiana fluente). Ora si
     * ripiega sulla finestra piu' silenziosa del prefisso: il prefisso
     * sacrificale prima del taglio non esce comunque.
     */
    @Test
    fun `missing silence fails OPEN at EOS - cut at the quietest prefix window, nothing before it leaks`() {
        val stabilizer = TalosPocketOnsetStabilizer(config)
        val pcm = FloatArray(1_100) { index -> if (index in 200 until 210) 0.05f else 0.5f }

        assertEquals(0, stabilizer.accept(pcm).size)
        val completion = stabilizer.complete()

        assertEquals(TalosPocketOnsetStabilizer.BOUNDARY_SOURCE_FALLBACK, completion.result.boundarySource)
        // la finestra quieta (200-210) e' il taglio; la ripresa e' subito dopo,
        // con i 50 ms di silenzio iniziale conservati (dentro il taglio stesso).
        assertEquals(200, completion.result.discardedSamples)
        assertEquals(10, completion.result.leadingSilenceSamples)
        assertArrayEquals(pcm.copyOfRange(200, pcm.size), completion.pcmFloatMono, 0f)
        assertEquals(completion.result, stabilizer.finish())
    }

    /*
     * Owner 12/09: la pausa dopo la virgola. Una voce registrata al microfono ha
     * un rumore di fondo sopra il 2 % del picco: la pausa dopo il prefisso c'e'
     * ma nessuna finestra e' «quieta» alla soglia pinned. Si prova al 5 % e al
     * 10 % prima di ripiegare, e la pausa viene tagliata come quella misurata.
     */
    @Test
    fun `a noisy floor above two percent still finds the prefix gap with a relaxed threshold`() {
        val stabilizer = TalosPocketOnsetStabilizer(config)
        val pcm = FloatArray(1_100) { index -> if (index in 160 until 260) 0.03f else 0.5f }

        // la pausa si vede gia' in streaming (finestra di ricerca completa): esce subito dal taglio in poi
        val released = stabilizer.accept(pcm)
        val result = stabilizer.finish()

        assertEquals(1_100 - 210, released.size)
        assertEquals("${TalosPocketOnsetStabilizer.BOUNDARY_SOURCE_RELAXED}_10PCT", result.boundarySource)
        assertEquals(160, result.gapStartSamples)
        assertEquals(260, result.gapEndSamples)
        assertEquals(260, result.resumeStartSamples)
        assertEquals(210, result.discardedSamples)
        assertEquals(50, result.leadingSilenceSamples)
    }

    @Test
    fun `missing silence fails OPEN while streaming - after the onset window the audio is released at the quietest prefix window`() {
        val stabilizer = TalosPocketOnsetStabilizer(config)
        // la finestra d'attacco e' 6 s (12/09): il ripiego scatta oltre i 6.000 campioni a 1 kHz
        val pcm = FloatArray(6_100) { 0.5f }

        val released = stabilizer.accept(pcm)

        assertEquals(6_100 - config.minPrefixSamples, released.size)
        assertEquals(TalosPocketOnsetStabilizer.BOUNDARY_SOURCE_FALLBACK, stabilizer.finish().boundarySource)
        assertEquals(config.minPrefixSamples, stabilizer.finish().discardedSamples)
        assertArrayEquals(FloatArray(20) { 0.25f }, stabilizer.accept(FloatArray(20) { 0.25f }), 0f)
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
