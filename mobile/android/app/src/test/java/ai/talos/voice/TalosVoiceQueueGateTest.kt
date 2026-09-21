package ai.talos.voice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class TalosVoiceQueueGateTest {
    @Test
    fun wireModesAreFailClosedAndFlushRemainsTheCompatibilityDefault() {
        assertEquals(TalosVoiceQueueMode.FLUSH, TalosVoiceQueueMode.fromWire(null))
        assertEquals(TalosVoiceQueueMode.FLUSH, TalosVoiceQueueMode.fromWire("flush"))
        assertEquals(TalosVoiceQueueMode.ADD, TalosVoiceQueueMode.fromWire("add"))
        assertThrows(IllegalArgumentException::class.java) { TalosVoiceQueueMode.fromWire("replace") }
    }

    @Test
    fun addTicketsClaimInOwnerOrderWithoutCancellingTheCurrentGeneration() {
        val gate = TalosVoiceQueueGate()
        val first = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertTrue(gate.claim(first))

        val second = gate.submit(TalosVoiceQueueMode.ADD)
        val third = gate.submit(TalosVoiceQueueMode.ADD)
        assertTrue("enqueueing ADD must not invalidate the current utterance", gate.isActive(first.id))
        assertTrue(gate.claim(second))
        assertTrue(gate.isActive(second.id))
        assertTrue(gate.claim(third))
        assertTrue(gate.isActive(third.id))
    }

    @Test
    fun `ADD exposes a later queued ticket without invalidating the playback epoch`() {
        val gate = TalosVoiceQueueGate()
        val current = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertTrue(gate.claim(current))

        gate.submit(TalosVoiceQueueMode.ADD)

        assertTrue(gate.hasQueuedAfter(current.id))
        assertTrue(gate.isPlaybackEpochActive(current.playbackEpoch))
    }

    @Test
    fun `playback queued after remains visible after later ADD is claimed`() {
        val gate = TalosVoiceQueueGate()
        val current = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertTrue(gate.claim(current))
        val later = gate.submit(TalosVoiceQueueMode.ADD)

        assertTrue(gate.hasPlaybackQueuedAfter(current.id, current.playbackEpoch))
        assertTrue(gate.claim(later))
        assertTrue(gate.hasPlaybackQueuedAfter(current.id, current.playbackEpoch))
        assertFalse(gate.hasPlaybackQueuedAfter(later.id, later.playbackEpoch))

        gate.submit(TalosVoiceQueueMode.FLUSH)
        assertFalse(gate.hasPlaybackQueuedAfter(current.id, current.playbackEpoch))
    }

    @Test
    fun `terminal playback action runs only for the latest ticket in the same epoch`() {
        val gate = TalosVoiceQueueGate()
        val current = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertTrue(gate.claim(current))
        val later = gate.submit(TalosVoiceQueueMode.ADD)

        assertNull(gate.runIfPlaybackTerminal(current.id, current.playbackEpoch) { "wrong" })
        assertTrue(gate.claim(later))
        assertEquals("sealed", gate.runIfPlaybackTerminal(later.id, later.playbackEpoch) { "sealed" })

        val replacement = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertNull(gate.runIfPlaybackTerminal(later.id, later.playbackEpoch) { "wrong" })
        assertEquals("sealed-new", gate.runIfPlaybackTerminal(replacement.id, replacement.playbackEpoch) { "sealed-new" })
    }

    @Test
    fun `a later FLUSH invalidates a pending playback boundary`() {
        val gate = TalosVoiceQueueGate()
        val current = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertTrue(gate.claim(current))

        gate.submit(TalosVoiceQueueMode.FLUSH)

        assertFalse(gate.isPlaybackEpochActive(current.playbackEpoch))
    }

    @Test
    fun aLaterFlushInvalidatesTheCurrentGenerationAndEveryOlderQueuedTicket() {
        val gate = TalosVoiceQueueGate()
        val current = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertTrue(gate.claim(current))
        val queued = gate.submit(TalosVoiceQueueMode.ADD)
        val replacement = gate.submit(TalosVoiceQueueMode.FLUSH)

        assertFalse(gate.isActive(current.id))
        assertFalse("stale ADD must not open model state before the replacement", gate.claim(queued))
        assertTrue(gate.claim(replacement))
        assertTrue(gate.isActive(replacement.id))
    }

    @Test
    fun cancelInvalidatesBothTheCurrentGenerationAndQueuedAddTickets() {
        val gate = TalosVoiceQueueGate()
        val current = gate.submit(TalosVoiceQueueMode.FLUSH)
        assertTrue(gate.claim(current))
        val queued = gate.submit(TalosVoiceQueueMode.ADD)

        gate.cancel()

        assertFalse(gate.isActive(current.id))
        assertFalse(gate.claim(queued))
    }
}
