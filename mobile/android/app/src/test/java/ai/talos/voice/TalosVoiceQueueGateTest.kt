package ai.talos.voice

import org.junit.Assert.assertFalse
import org.junit.Assert.assertEquals
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
