package ai.talos.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPcmPlayerTest {
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
    }

    private data class WriteCall(val offset: Int, val size: Int)

    private class FakeTrack(vararg results: Int) : TalosAudioTrackFacade {
        private val results = ArrayDeque(results.toList())
        val writes = mutableListOf<WriteCall>()
        var released = false

        override val playState: Int = 3
        override val underrunCount: Int = 0
        override val playbackHeadPosition: Int = 0

        override fun write(pcm16: ShortArray, offset: Int, size: Int): Int {
            writes += WriteCall(offset, size)
            return results.removeFirst()
        }

        override fun play() = Unit
        override fun pause() = Unit
        override fun flush() = Unit
        override fun stop() = Unit
        override fun release() {
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
