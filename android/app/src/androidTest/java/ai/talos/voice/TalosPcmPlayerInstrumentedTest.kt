package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlin.math.sin
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * `AudioTrack` only means something proven on a real device: there is no
 * host-JVM audio HAL to fake it against. Three real things this proved on
 * the OnePlus Pad 3, none of which a code read alone would have caught:
 *
 *  1. A real bug the first draft of [TalosPcmPlayer.flush] had - see the
 *     comment on `flush()` for the AOSP javadoc trail that caught it.
 *  2. A real device quirk: writing an ENTIRE utterance in one single
 *     `AudioTrack.write()` call and then only polling
 *     `getPlaybackHeadPosition()` (no further writes) can report a stuck 0
 *     on this device/HAL - confirmed with `getTimestamp()` too, so it is not
 *     a `getPlaybackHeadPosition()`-specific bug. Writing in small chunks in
 *     a loop, exactly how [TalosMossCodecStream]'s per-batch output will
 *     always be fed to this player, tracks correctly and drains correctly.
 *  3. Chasing #2 with too small a buffer (the platform minimum) traded a
 *     tracking bug for a real one: 103 measured `getUnderrunCount()` events
 *     - audible micro-stutter the owner heard and reported - on a realistic
 *     multi-second streamed utterance. See the buffer-size comment on
 *     `createTrack()` for both numbers and why `minBufferBytes*4` fixes #3
 *     without reopening #2 (the clips here are all comfortably longer than
 *     that buffer, matching any real conversational utterance).
 *
 * These tests write in chunks throughout for the reason in #2 - it is what
 * real usage does, not a workaround chosen to dodge a quirk.
 */
@RunWith(AndroidJUnit4::class)
class TalosPcmPlayerInstrumentedTest {

    private fun sineToneStereo(sampleRate: Int, seconds: Double, hz: Double, amplitude: Float): FloatArray {
        val frames = (sampleRate * seconds).toInt()
        val pcm = FloatArray(frames * 2)
        for (i in 0 until frames) {
            val sample = (amplitude * sin(2.0 * Math.PI * hz * i / sampleRate)).toFloat()
            pcm[i * 2] = sample
            pcm[i * 2 + 1] = sample
        }
        return pcm
    }

    /** Feeds a player the way [TalosVoiceHost]'s real streaming loop will: one small batch at a time. */
    private fun writeInChunks(player: TalosPcmPlayer, pcm: FloatArray, chunkFrames: Int = 4800): Boolean {
        var offset = 0
        val frameSize = 2 // stereo
        while (offset < pcm.size) {
            val end = minOf(offset + chunkFrames * frameSize, pcm.size)
            if (!player.write(pcm.copyOfRange(offset, end))) return false
            offset = end
        }
        return true
    }

    @Test
    fun writtenAudioActuallyDrainsThroughTheDevice() {
        val sampleRate = 48000
        val player = TalosPcmPlayer(sampleRate, channels = 2)
        try {
            // 2.5s: comfortably longer than the ~960ms AudioTrack buffer, so
            // writeInChunks is guaranteed to hit at least one real blocking
            // write - the same condition that must hold for any real
            // conversational utterance.
            val tone = sineToneStereo(sampleRate, seconds = 2.5, hz = 440.0, amplitude = 0.2f)
            val underrunsBefore = player.underrunCount()
            assertTrue(writeInChunks(player, tone))
            assertTrue("player must report PLAYSTATE_PLAYING after a successful write", player.isPlaying())
            assertTrue("framesWritten must match what was actually written", player.framesWritten() == (tone.size / 2).toLong())
            assertTrue(
                "1.5s of audio written in chunks must drain well within a 3s bound (head=${player.playbackHeadFrames()} written=${player.framesWritten()})",
                player.awaitDrain(timeoutMs = 3000),
            )
            assertTrue(
                "no real hardware underrun expected for a clean, continuous chunked write",
                player.underrunCount() == underrunsBefore,
            )
        } finally {
            player.close()
        }
    }

    @Test
    fun terminalStreamStopDrainsExactAcceptedAudioWithoutAPostEosUnderrun() {
        val sampleRate = 48000
        val player = TalosPcmPlayer(sampleRate, channels = 2)
        try {
            val tone = sineToneStereo(sampleRate, seconds = 2.5, hz = 440.0, amplitude = 0.2f)
            val underrunsBefore = player.underrunCount()
            assertTrue(writeInChunks(player, tone))

            val boundary = player.sealTerminalBoundary()
            val drained = boundary.awaitDrain(timeoutMs = 3000)

            assertTrue("AudioTrack streaming stop did not drain its exact accepted tail", drained.reached)
            assertTrue("terminal boundary changed the accepted frame count", boundary.boundaryFrames == (tone.size / 2).toLong())
            assertTrue("terminal boundary observed an impossible negative tail", boundary.remainingFramesAtSeal >= 0L)
            assertTrue(
                "terminal stream stop produced a hardware underrun after EOS",
                drained.underrunCount == underrunsBefore,
            )
            assertTrue("sealed AudioTrack must no longer report PLAYSTATE_PLAYING", !player.isPlaying())
        } finally {
            player.close()
        }
    }

    /**
     * The contrary case that caught the `flush()` bug: after `flush()`, the
     * player must still be in `PLAYSTATE_PLAYING` and must actually advance
     * its playback head once new audio is written - not just "not throw". A
     * `flush()` that left the track `STOPPED` (the first draft: `pause()` +
     * `flush()` + `stop()`, following `stop()`'s own recommended
     * "pause-then-flush" idiom one call too far) would pass a test that only
     * checked "no exception", and would go silent on the very next
     * utterance - forever, on a real phone, with no error anywhere.
     */
    @Test
    fun flushMidPlaybackLeavesTheTrackReadyForTheNextUtteranceNotSilentlyStopped() {
        val sampleRate = 48000
        val player = TalosPcmPlayer(sampleRate, channels = 2)
        try {
            val firstTone = sineToneStereo(sampleRate, seconds = 2.0, hz = 440.0, amplitude = 0.2f)
            assertTrue(writeInChunks(player, firstTone))
            // Let real playback actually begin before cutting it off - flushing
            // an empty buffer would prove nothing about resuming afterward.
            val started = System.currentTimeMillis()
            while (player.playbackHeadFrames() == 0L && System.currentTimeMillis() - started < 1000) {
                Thread.sleep(10)
            }
            assertTrue("playback must have actually started before this test flushes it", player.playbackHeadFrames() > 0)

            player.flush()
            assertTrue("flush() must leave an empty track paused for the next preroll", !player.isPlaying())
            assertTrue("flush() must reset framesWritten to zero for the new utterance", player.framesWritten() == 0L)

            val secondTone = sineToneStereo(sampleRate, seconds = 1.5, hz = 880.0, amplitude = 0.2f)
            assertTrue(writeInChunks(player, secondTone))
            assertTrue("the first complete block after flush must restart playback", player.isPlaying())
            assertTrue(
                "audio written after flush() must actually drain, not sit silently buffered on a stopped track",
                player.awaitDrain(timeoutMs = 2000),
            )
            assertTrue(player.framesWritten() == (secondTone.size / 2).toLong())
        } finally {
            player.close()
        }
    }

    @Test
    fun closeReleasesTheTrackAndIsPlayingReportsFalse() {
        val player = TalosPcmPlayer(48000, channels = 2)
        writeInChunks(player, sineToneStereo(48000, seconds = 0.05, hz = 440.0, amplitude = 0.1f))
        player.close()
        assertTrue("isPlaying() must be false once the player is closed", !player.isPlaying())
    }
}
