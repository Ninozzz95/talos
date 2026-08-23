package ai.talos.voice.pocket

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosPocketFramePipelineTest {
    @Test
    fun `first decodable batch is a handoff barrier until PCM is consumed`() {
        val decodeEntered = CountDownLatch(1)
        val releaseDecode = CountDownLatch(1)
        val firstEmitReturned = CountDownLatch(1)
        val returnedBeforeDecode = AtomicBoolean(false)
        val coordinator = thread(start = true, isDaemon = true) {
            check(decodeEntered.await(1, TimeUnit.SECONDS))
            returnedBeforeDecode.set(firstEmitReturned.await(200, TimeUnit.MILLISECONDS))
            releaseDecode.countDown()
        }
        val pipeline = TalosPocketFramePipeline(
            capacityFrames = 4,
            firstDecodeFrames = 1,
            regularDecodeFrames = 4,
            cancellation = TalosPocketCancellation(),
        )

        val metrics = pipeline.run(
            produce = { emit ->
                emit(floatArrayOf(1f))
                firstEmitReturned.countDown()
                emit(floatArrayOf(2f))
            },
            decode = { batch ->
                decodeEntered.countDown()
                check(releaseDecode.await(1, TimeUnit.SECONDS))
                batch.flatMap(FloatArray::toList).toFloatArray()
            },
            consume = { true },
        )
        coordinator.join()

        assertFalse("producer crossed first-batch handoff before PCM consumption", returnedBeforeDecode.get())
        assertEquals(2, metrics.producedFrames)
        assertTrue(metrics.producerBlockedNs > 0L)
    }

    @Test
    fun `a fast producer remains bounded and every frame is decoded once`() {
        val cancellation = TalosPocketCancellation()
        val decoded = mutableListOf<Float>()
        val pipeline = TalosPocketFramePipeline(
            capacityFrames = 4,
            firstDecodeFrames = 2,
            regularDecodeFrames = 3,
            cancellation = cancellation,
        )
        val metrics = pipeline.run(
            produce = { emit -> repeat(100) { emit(floatArrayOf(it.toFloat())) } },
            decode = { batch ->
                Thread.sleep(1)
                batch.flatMap { it.toList() }.toFloatArray()
            },
            consume = { pcm -> decoded += pcm.toList(); true },
        )

        assertEquals((0 until 100).map { it.toFloat() }, decoded)
        assertTrue(metrics.highWatermarkFrames <= 4)
        assertEquals(100, metrics.producedFrames)
        assertEquals(100, metrics.decodedFrames)
        assertEquals(TalosPocketPipelineTerminal.DONE, metrics.terminal)
    }

    @Test
    fun `cancellation stops production and no callback follows the rejecting consumer`() {
        val cancellation = TalosPocketCancellation()
        val callbacks = AtomicInteger(0)
        val pipeline = TalosPocketFramePipeline(
            capacityFrames = 3,
            firstDecodeFrames = 1,
            regularDecodeFrames = 1,
            cancellation = cancellation,
        )
        val metrics = pipeline.run(
            produce = { emit ->
                for (index in 0 until 1_000) {
                    if (!emit(floatArrayOf(index.toFloat()))) break
                }
            },
            decode = { batch -> batch.single() },
            consume = {
                val accepted = callbacks.incrementAndGet() < 3
                if (!accepted) cancellation.cancel()
                accepted
            },
        )

        assertEquals(3, callbacks.get())
        assertEquals(TalosPocketPipelineTerminal.CANCELLED, metrics.terminal)
        assertTrue(metrics.producedFrames < 1_000)
    }
}
