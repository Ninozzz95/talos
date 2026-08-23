package ai.talos.voice

import java.util.concurrent.atomic.AtomicLong

/** Wire-compatible queue semantics shared by the Capacitor door and the host owner lane. */
internal enum class TalosVoiceQueueMode {
    FLUSH,
    ADD;

    companion object {
        fun fromWire(value: String?): TalosVoiceQueueMode = when (value) {
            null, "flush" -> FLUSH
            "add" -> ADD
            else -> throw IllegalArgumentException("queue must be flush or add")
        }
    }
}

internal data class TalosVoiceQueueTicket(
    val id: Long,
    val mode: TalosVoiceQueueMode,
)

/**
 * Atomic boundary between concurrent submit/cancel calls and the single ORT owner lane.
 *
 * `FLUSH` publishes its generation immediately, which preserves the old behaviour:
 * the currently running synthesis observes cancellation at its next model boundary.
 * `ADD` only reserves an ordered id. It becomes active when the FIFO owner lane claims
 * it, so enqueueing sentence N+1 cannot invalidate sentence N. A newer flush/cancel
 * always has a larger id; the CAS loop therefore cannot resurrect an older ticket.
 */
internal class TalosVoiceQueueGate(
    private val counter: AtomicLong = AtomicLong(0L),
) {
    private val active = AtomicLong(0L)

    fun submit(mode: TalosVoiceQueueMode): TalosVoiceQueueTicket {
        val ticket = TalosVoiceQueueTicket(counter.incrementAndGet(), mode)
        if (mode == TalosVoiceQueueMode.FLUSH) active.set(ticket.id)
        return ticket
    }

    fun claim(ticket: TalosVoiceQueueTicket): Boolean {
        if (ticket.mode == TalosVoiceQueueMode.FLUSH) return active.get() == ticket.id
        while (true) {
            val observed = active.get()
            if (observed > ticket.id) return false
            if (active.compareAndSet(observed, ticket.id)) return true
        }
    }

    fun cancel(): Long {
        val invalidated = counter.incrementAndGet()
        active.set(invalidated)
        return invalidated
    }

    fun isActive(id: Long): Boolean = active.get() == id

    fun activeId(): Long = active.get()
}
