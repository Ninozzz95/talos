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
    val playbackEpoch: Long,
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
    private val playbackEpoch = AtomicLong(0L)

    @Synchronized
    fun submit(mode: TalosVoiceQueueMode): TalosVoiceQueueTicket {
        val id = counter.incrementAndGet()
        if (mode == TalosVoiceQueueMode.FLUSH) {
            active.set(id)
            playbackEpoch.incrementAndGet()
        }
        val ticket = TalosVoiceQueueTicket(id, mode, playbackEpoch.get())
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

    @Synchronized
    fun cancel(): Long {
        val invalidated = counter.incrementAndGet()
        active.set(invalidated)
        playbackEpoch.incrementAndGet()
        return invalidated
    }

    fun isActive(id: Long): Boolean = active.get() == id

    fun activeId(): Long = active.get()

    /** True only when a later ADD is waiting; FLUSH/cancel already changed [active]. */
    fun hasQueuedAfter(id: Long): Boolean = active.get() == id && counter.get() > id

    /**
     * True while any later ticket belongs to the same uninterrupted playback
     * epoch, whether it is only reserved or already claimed by the owner lane.
     */
    fun hasPlaybackQueuedAfter(id: Long, epoch: Long): Boolean =
        playbackEpoch.get() == epoch && counter.get() > id

    /**
     * Runs a short end-of-stream mutation only while [id] is still the last
     * ticket in [epoch]. Holding the same monitor as [submit] closes the race
     * between observing an empty queue and publishing the sealed AudioTrack.
     */
    @Synchronized
    fun <T : Any> runIfPlaybackTerminal(id: Long, epoch: Long, action: () -> T): T? {
        if (playbackEpoch.get() != epoch || counter.get() > id) return null
        return action()
    }

    /** ADD advances the active utterance but never invalidates PCM already accepted by the shared track. */
    fun isPlaybackEpochActive(epoch: Long): Boolean = playbackEpoch.get() == epoch
}
