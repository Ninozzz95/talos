package ai.talos.voice

import org.junit.Assert.assertEquals
import org.junit.Test

class TalosVoiceProductionSeedTest {
    @Test
    fun `null production seed resolves to the measured Italian winner`() {
        assertEquals(42L, resolveTalosVoiceProductionSeed(null))
    }

    @Test
    fun `explicit production seed remains unchanged`() {
        listOf(Long.MIN_VALUE, -1L, 0L, 73L, Long.MAX_VALUE).forEach { explicit ->
            assertEquals(explicit, resolveTalosVoiceProductionSeed(explicit))
        }
    }
}
