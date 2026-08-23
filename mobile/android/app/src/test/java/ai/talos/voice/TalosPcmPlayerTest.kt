package ai.talos.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPcmPlayerTest {
    @Test
    fun `production AudioTrack capacity reserves one measured Pocket decoder batch beyond the previous buffer`() {
        val platformMinimumBytes = 5_784

        assertEquals(57_840, talosAudioTrackBufferBytes(platformMinimumBytes))
    }

    @Test
    fun `new track starts only after its complete first block primes playback`() {
        val track = FakeTrack(3)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))

        assertTrue(player.write(floatArrayOf(0.1f, 0.2f, 0.3f)))

        assertEquals(listOf("write:0:3", "play"), track.events)
        assertTrue(player.isPlaying())
    }

    @Test
    fun `flush leaves an empty track paused until the next complete block primes it again`() {
        val track = FakeTrack(2, 2)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))
        assertTrue(player.write(floatArrayOf(0.1f, 0.2f)))
        track.events.clear()

        player.flush()

        assertEquals(listOf("pause", "flush"), track.events)
        assertFalse(player.isPlaying())
        track.events.clear()

        assertTrue(player.write(floatArrayOf(0.3f, 0.4f)))
        assertEquals(listOf("write:0:2", "play"), track.events)
        assertTrue(player.isPlaying())
    }

    @Test
    fun `player exposes the exact buffer capacity and start threshold owned by the track`() {
        val track = FakeTrack(2, bufferCapacityFrames = 23_040, startThresholdFrames = 2_880)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))

        assertTrue(player.write(floatArrayOf(0.1f, 0.2f)))

        assertEquals(23_040, player.bufferCapacityFrames())
        assertEquals(2_880, player.startThresholdFrames())
    }

    @Test
    fun `player waits for an exact utterance boundary rather than the shared track drain`() {
        val track = FakeTrack(4)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))
        assertTrue(player.write(floatArrayOf(0.1f, 0.2f, 0.3f, 0.4f)))
        track.currentPlaybackHeadPosition = 3

        assertTrue(player.awaitPlaybackBoundary(targetFrames = 3, timeoutMs = 10))
        assertEquals(4L, player.framesWritten())
    }

    @Test
    fun `boundary wait acknowledges cancellation without claiming drain`() {
        val track = FakeTrack(4)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))
        assertTrue(player.write(floatArrayOf(0.1f, 0.2f, 0.3f, 0.4f)))

        assertFalse(
            player.awaitPlaybackBoundary(
                targetFrames = 4,
                timeoutMs = 10,
                isCancelled = { true },
            ),
        )
        assertEquals(0, track.currentPlaybackHeadPosition)
    }

    @Test
    fun `terminal boundary declares stream end before the final buffer can underflow`() {
        val clock = FakeNanoClock()
        val track = FakeTrack(8)
        val player = TalosPcmPlayer(
            sampleRate = 24_000,
            channels = 1,
            trackFactory = SingleTrackFactory(track),
            nanoTime = clock::read,
            sleepNanos = clock::advance,
        )
        assertTrue(player.write(FloatArray(8) { 0.1f }))
        track.currentPlaybackHeadPosition = 2

        val boundary = player.sealTerminalBoundary()

        assertEquals(listOf("write:0:8", "play", "stop"), track.events)
        assertEquals(8L, boundary.boundaryFrames)
        assertEquals(2L, boundary.headFramesAtSeal)
        assertEquals(6L, boundary.remainingFramesAtSeal)
        assertEquals(250_000L, boundary.expectedDrainNs)
        val drained = boundary.awaitDrain(timeoutMs = 10)
        assertTrue(drained.reached)
        assertEquals(250_000L, drained.completedAtNs)
        assertEquals(0, drained.underrunCount)
        assertEquals(250_000L, clock.read())
    }

    @Test
    fun `terminal seal rejects a changed boundary before stopping AudioTrack`() {
        val track = FakeTrack(4)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))
        assertTrue(player.write(FloatArray(4) { 0.1f }))

        assertThrows(IllegalStateException::class.java) {
            player.sealTerminalBoundary(expectedBoundaryFrames = 3L)
        }

        assertFalse(track.events.contains("stop"))
        assertTrue(player.isPlaying())
    }

    @Test
    fun `repeated terminal seal still rejects a changed expected boundary`() {
        val track = FakeTrack(4)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))
        assertTrue(player.write(FloatArray(4) { 0.1f }))
        player.sealTerminalBoundary(expectedBoundaryFrames = 4L)

        assertThrows(IllegalStateException::class.java) {
            player.sealTerminalBoundary(expectedBoundaryFrames = 5L)
        }

        assertEquals(1, track.events.count { it == "stop" })
    }

    @Test
    fun `next write waits for the sealed terminal drain before re-priming`() {
        val clock = FakeNanoClock()
        val track = FakeTrack(4, 2)
        val player = TalosPcmPlayer(
            sampleRate = 24_000,
            channels = 1,
            trackFactory = SingleTrackFactory(track),
            nanoTime = clock::read,
            sleepNanos = clock::advance,
        )
        assertTrue(player.write(FloatArray(4) { 0.1f }))
        track.currentPlaybackHeadPosition = 2
        val boundary = player.sealTerminalBoundary()
        track.events.clear()

        assertTrue(player.write(floatArrayOf(0.2f, 0.3f)))

        assertEquals(boundary.expectedDrainNs, clock.read())
        assertEquals(listOf("write:0:2", "play"), track.events)
        assertEquals(2L, player.framesWritten())
        assertTrue(boundary.awaitDrain(timeoutMs = 10).reached)
    }

    @Test
    fun `positive short write consumes every remaining sample exactly once`() {
        val track = FakeTrack(2, 3)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))

        assertTrue(player.write(floatArrayOf(-1f, -0.5f, 0.5f, 1f, 0f)))

        assertEquals(listOf(WriteCall(0, 5), WriteCall(2, 3)), track.writes)
        assertEquals(5L, player.framesWritten())
    }

    @Test
    fun `zero progress fails closed instead of spinning`() {
        val track = FakeTrack(0)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))

        assertFalse(player.write(floatArrayOf(0.1f, 0.2f)))

        assertEquals(listOf(WriteCall(0, 2)), track.writes)
        assertTrue(player.isDead)
        assertEquals(0L, player.framesWritten())
        assertFalse(track.events.contains("play"))
    }

    @Test
    fun `negative write recreates once and writes only the remaining suffix`() {
        val first = FakeTrack(2, -2)
        val second = FakeTrack(2)
        val factory = SequenceTrackFactory(first, second)
        val player = TalosPcmPlayer(24_000, 1, factory)

        assertTrue(player.write(floatArrayOf(0.1f, 0.2f, 0.3f, 0.4f)))

        assertEquals(listOf(WriteCall(0, 4), WriteCall(2, 2)), first.writes)
        assertEquals(listOf(WriteCall(2, 2)), second.writes)
        assertEquals(4L, player.framesWritten())
        assertFalse(player.isDead)
        assertTrue(first.released)
    }

    @Test
    fun `second negative write marks the player dead`() {
        val first = FakeTrack(-2)
        val second = FakeTrack(-2)
        val player = TalosPcmPlayer(24_000, 1, SequenceTrackFactory(first, second))

        assertFalse(player.write(floatArrayOf(0.1f, 0.2f)))

        assertTrue(player.isDead)
        assertEquals(0L, player.framesWritten())
        assertEquals(1, first.writes.size)
        assertEquals(1, second.writes.size)
    }

    @Test
    fun `cancellation between short writes stops before the next suffix`() {
        val track = FakeTrack(2, 2)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))

        assertFalse(player.write(floatArrayOf(0.1f, 0.2f, 0.3f, 0.4f)) { track.writes.isNotEmpty() })

        assertEquals(listOf(WriteCall(0, 4)), track.writes)
        assertEquals(2L, player.framesWritten())
        assertFalse(player.isDead)
        assertFalse(track.events.contains("play"))
    }

    @Test
    fun `accepted diagnostic PCM is the exact post-level AudioTrack payload`() {
        val track = FakeTrack(2)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))
        var observed: FloatArray? = null

        assertTrue(
            player.write(
                interleavedPcm = floatArrayOf(0.05f, -0.1f),
                levelProfile = TalosPcmLevelProfile.POCKET_SPEECH,
                onAcceptedOutput = { observed = it },
            ),
        )

        val physical = track.acceptedPcm16.toShortArray()
        assertArrayEquals(physical, requireNotNull(observed).map { (it * 32_767f).toInt().toShort() }.toShortArray())
        assertEquals(12.0, requireNotNull(player.lastWriteLevelStats()).gainDb, 0.0)
    }

    @Test
    fun `non finite PCM fails before AudioTrack receives bytes`() {
        val track = FakeTrack(2)
        val player = TalosPcmPlayer(24_000, 1, SingleTrackFactory(track))

        assertThrows(IllegalArgumentException::class.java) {
            player.write(floatArrayOf(0.1f, Float.POSITIVE_INFINITY))
        }

        assertTrue(track.writes.isEmpty())
        assertTrue(track.acceptedPcm16.isEmpty())
    }

    @Test
    fun `flush resets limiter state`() {
        val reusedTrack = FakeTrack(1, 1)
        val reused = TalosPcmPlayer(24_000, 1, SingleTrackFactory(reusedTrack))
        assertTrue(reused.write(floatArrayOf(0.9f), TalosPcmLevelProfile.POCKET_SPEECH))
        reused.flush()
        assertTrue(reused.write(floatArrayOf(0.05f), TalosPcmLevelProfile.POCKET_SPEECH))

        val freshTrack = FakeTrack(1)
        val fresh = TalosPcmPlayer(24_000, 1, SingleTrackFactory(freshTrack))
        assertTrue(fresh.write(floatArrayOf(0.05f), TalosPcmLevelProfile.POCKET_SPEECH))

        assertEquals(freshTrack.acceptedPcm16.single(), reusedTrack.acceptedPcm16.last())
    }

    private data class WriteCall(val offset: Int, val size: Int)

    private class FakeNanoClock {
        private var nowNs = 0L

        fun read(): Long = nowNs

        fun advance(durationNs: Long) {
            require(durationNs >= 0L)
            nowNs += durationNs
        }
    }

    private class FakeTrack(
        vararg results: Int,
        override val bufferCapacityFrames: Int = 8_192,
        override var startThresholdFrames: Int = 1,
    ) : TalosAudioTrackFacade {
        private val results = ArrayDeque(results.toList())
        val writes = mutableListOf<WriteCall>()
        val acceptedPcm16 = mutableListOf<Short>()
        val events = mutableListOf<String>()
        var released = false
        private var currentPlayState = 1

        override val playState: Int get() = currentPlayState
        override val underrunCount: Int = 0
        var currentPlaybackHeadPosition: Int = 0
        override val playbackHeadPosition: Int get() = currentPlaybackHeadPosition

        override fun setStartThresholdFrames(frames: Int): Int {
            startThresholdFrames = frames
            events += "threshold:$frames"
            return frames
        }

        override fun write(pcm16: ShortArray, offset: Int, size: Int): Int {
            writes += WriteCall(offset, size)
            events += "write:$offset:$size"
            return results.removeFirst().also { written ->
                if (written > 0 && written <= size) {
                    for (index in offset until offset + written) acceptedPcm16 += pcm16[index]
                }
            }
        }

        override fun play() {
            events += "play"
            currentPlayState = 3
        }
        override fun pause() {
            events += "pause"
            currentPlayState = 2
        }
        override fun flush() {
            events += "flush"
        }
        override fun stop() {
            events += "stop"
            currentPlayState = 1
        }
        override fun release() {
            events += "release"
            released = true
        }
    }

    private class SingleTrackFactory(private val track: TalosAudioTrackFacade) : TalosAudioTrackFactory {
        override fun create(sampleRate: Int, channels: Int): TalosAudioTrackFacade = track
    }

    private class SequenceTrackFactory(vararg tracks: TalosAudioTrackFacade) : TalosAudioTrackFactory {
        private val tracks = ArrayDeque(tracks.toList())
        override fun create(sampleRate: Int, channels: Int): TalosAudioTrackFacade = tracks.removeFirst()
    }
}
