package ai.talos.voice.pocket

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPocketConfigTest {
    @Test
    fun `production defaults use the measured Italian temperature and scheduler`() {
        val config = TalosPocketConfig()

        assertEquals(0.3f, config.temperature)
        assertEquals(2, config.firstDecodeFrames)
        assertEquals(3, config.regularDecodeFrames)
        assertTrue(config.stabilizeOnset)
    }

    @Test
    fun `raw research mode prepends the measured onset prefix without enabling trimming`() {
        val config = TalosPocketConfig(
            stabilizeOnset = false,
            prependOnsetPrefix = true,
        )

        assertTrue(config.prependOnsetPrefix)
        assertEquals(false, config.stabilizeOnset)
    }
}
