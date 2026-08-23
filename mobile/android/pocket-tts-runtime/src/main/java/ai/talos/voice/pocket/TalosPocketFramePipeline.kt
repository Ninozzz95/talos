package ai.talos.voice.pocket

import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread


class TalosPocketCancellation {
    private val cancelled = AtomicBoolean(false)
    fun cancel(): Boolean = cancelled.compareAndSet(false, true)
    fun isCancelled(): Boolean = cancelled.get()
}

enum class TalosPocketPipelineTerminal { DONE, CANCELLED }

data class TalosPocketPipelineMetrics(
    val capacityFrames: Int,
    val producedFrames: Int,
    val decodedFrames: Int,
    val emittedChunks: Int,
    val highWatermarkFrames: Int,
    val producerBlockedNs: Long,
    val decodeNs: Long,
    val terminal: TalosPocketPipelineTerminal,
)

class TalosPocketFramePipeline(
    private val capacityFrames: Int,
    private val firstDecodeFrames: Int,
    private val regularDecodeFrames: Int,
    private val cancellation: TalosPocketCancellation,
) {
    init {
        require(capacityFrames > 0) { "capacityFrames must be positive" }
        require(firstDecodeFrames in 1..capacityFrames) { "firstDecodeFrames exceeds capacity" }
        require(regularDecodeFrames in 1..capacityFrames) { "regularDecodeFrames exceeds capacity" }
    }

    private sealed interface Item {
        data class Frame(val values: FloatArray) : Item
        data object End : Item
    }

    fun run(
        produce: ((FloatArray) -> Boolean) -> Unit,
        decode: (List<FloatArray>) -> FloatArray,
        consume: (FloatArray) -> Boolean,
    ): TalosPocketPipelineMetrics {
        val queue = ArrayBlockingQueue<Item>(capacityFrames)
        val produced = AtomicInteger(0)
        val decoded = AtomicInteger(0)
        val emitted = AtomicInteger(0)
        val highWatermark = AtomicInteger(0)
        val blockedNs = AtomicLong(0)
        val decodeNs = AtomicLong(0)
        val failure = AtomicReference<Throwable?>()
        val firstPcmConsumed = CountDownLatch(1)

        val decoder = thread(start = true, name = "talos-pocket-decoder", isDaemon = true) {
            val batch = ArrayList<FloatArray>(regularDecodeFrames)
            var target = firstDecodeFrames
            var ended = false
            try {
                while (!ended && !cancellation.isCancelled()) {
                    val item = queue.poll(50, TimeUnit.MILLISECONDS) ?: continue
                    when (item) {
                        is Item.Frame -> batch += item.values
                        Item.End -> ended = true
                    }
                    if (batch.size >= target || ended && batch.isNotEmpty()) {
                        val started = System.nanoTime()
                        val pcm = decode(batch.toList())
                        decodeNs.addAndGet(System.nanoTime() - started)
                        decoded.addAndGet(batch.size)
                        batch.clear()
                        target = regularDecodeFrames
                        if (!cancellation.isCancelled()) {
                            emitted.incrementAndGet()
                            val accepted = consume(pcm)
                            firstPcmConsumed.countDown()
                            if (!accepted) cancellation.cancel()
                        }
                    }
                }
            } catch (error: Throwable) {
                failure.compareAndSet(null, error)
                cancellation.cancel()
            } finally {
                // Release a producer waiting at the first-batch handoff on
                // cancellation or decoder failure as well as normal success.
                firstPcmConsumed.countDown()
            }
        }

        try {
            produce { frame ->
                if (cancellation.isCancelled() || failure.get() != null) return@produce false
                var accepted = false
                while (!accepted && !cancellation.isCancelled() && failure.get() == null) {
                    val started = System.nanoTime()
                    accepted = queue.offer(Item.Frame(frame), 50, TimeUnit.MILLISECONDS)
                    blockedNs.addAndGet(System.nanoTime() - started)
                }
                if (accepted) {
                    val producedCount = produced.incrementAndGet()
                    highWatermark.accumulateAndGet(queue.size, ::maxOf)
                    if (producedCount == firstDecodeFrames) {
                        while (
                            firstPcmConsumed.count > 0L &&
                            !cancellation.isCancelled() &&
                            failure.get() == null
                        ) {
                            val started = System.nanoTime()
                            firstPcmConsumed.await(50, TimeUnit.MILLISECONDS)
                            blockedNs.addAndGet(System.nanoTime() - started)
                        }
                    }
                }
                accepted && !cancellation.isCancelled() && failure.get() == null
            }
        } catch (error: Throwable) {
            failure.compareAndSet(null, error)
            cancellation.cancel()
        } finally {
            while (!cancellation.isCancelled() && failure.get() == null && !queue.offer(Item.End, 50, TimeUnit.MILLISECONDS)) {
                // Backpressure is intentional; the decoder drains the bounded queue.
            }
            decoder.join()
        }

        failure.get()?.let { throw IllegalStateException("Pocket frame pipeline failed", it) }
        return TalosPocketPipelineMetrics(
            capacityFrames = capacityFrames,
            producedFrames = produced.get(),
            decodedFrames = decoded.get(),
            emittedChunks = emitted.get(),
            highWatermarkFrames = highWatermark.get(),
            producerBlockedNs = blockedNs.get(),
            decodeNs = decodeNs.get(),
            terminal = if (cancellation.isCancelled()) TalosPocketPipelineTerminal.CANCELLED else TalosPocketPipelineTerminal.DONE,
        )
    }
}
