package ai.talos.voice

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.io.Closeable

/**
 * Production `AudioTrack` (blueprint §17). No PCM crosses the Capacitor
 * bridge - this class is the only thing that touches `AudioTrack`, and
 * everything upstream of it deals in interleaved float PCM.
 *
 * §17.1: kept stereo when the codec is stereo - MOSS's codec is 48 kHz
 * stereo (`TalosMossCodecMeta.channels`), and averaging to mono is exactly
 * the upstream smoke sample's shortcut blueprint R4 says not to copy.
 *
 * `AudioAttributes` match `TalosSpeechPlugin`'s system-TTS path exactly
 * (`USAGE_ASSISTANCE_ACCESSIBILITY` + `CONTENT_TYPE_SPEECH`) on purpose: that
 * choice routes to `STREAM_ACCESSIBILITY`, which the owner specifically
 * wanted because it is never silenced by the ringer profile - invariant §7
 * ("system TTS remains first-class") means the personal voice engine must
 * behave the same way here, not pick its own default.
 */
internal class TalosPcmPlayer(
    private val sampleRate: Int,
    private val channels: Int,
) : Closeable {
    init {
        require(channels == 1 || channels == 2) { "TalosPcmPlayer supports mono or stereo only, got $channels channels" }
    }

    private val channelMask = if (channels == 2) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
    private var track: AudioTrack? = null
    private var framesWritten: Long = 0
    private var recreateAttempted = false

    /** True once a write failed twice in a row (recreate already attempted and also failed) - caller must fall back to system TTS. */
    var isDead: Boolean = false
        private set

    /**
     * Converts interleaved float PCM (`[-1,1]`, channel-minor - `[l0,r0,l1,r1,...]`
     * for stereo, the same layout [TalosMossCodecStream.runFrames] returns)
     * to PCM16 and writes it blocking. Returns false if the track could not
     * accept the data even after one recreate attempt (§17.4) - the caller's
     * cue to fail this utterance over to system TTS rather than loop forever
     * recreating a broken output path.
     *
     * ⛔ Call this once per small batch as audio becomes available - never
     * once with a whole utterance. Measured on the OnePlus Pad 3: a single
     * `write()` of an entire clip followed only by polling
     * `getPlaybackHeadPosition()`/`getTimestamp()` can report a stuck 0
     * indefinitely on this device's audio HAL; the same audio written as a
     * sequence of small chunks (exactly what real streaming does, and what
     * every caller of this method in this codebase does) tracks and drains
     * correctly, including the post-write drain tail. This is the actual
     * production shape - [TalosMossCodecStream] hands over one decoded batch
     * at a time - not a workaround bolted on for a device quirk.
     */
    fun write(interleavedPcm: FloatArray): Boolean {
        if (interleavedPcm.isEmpty()) return true
        if (isDead) return false
        val pcm16 = ShortArray(interleavedPcm.size) { index ->
            (interleavedPcm[index].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
        }
        val activeTrack = track ?: createTrack().also { track = it }
        val written = activeTrack.write(pcm16, 0, pcm16.size, AudioTrack.WRITE_BLOCKING)
        if (written < 0) {
            return recoverFromWriteError(pcm16)
        }
        framesWritten += (written / channels)
        return true
    }

    /** Number of frames (per-channel samples) actually written so far - the numerator for drain progress. */
    fun framesWritten(): Long = framesWritten

    /** True only if the underlying track exists and its play state is actually `PLAYSTATE_PLAYING` - not just "not released". */
    fun isPlaying(): Boolean = track?.playState == AudioTrack.PLAYSTATE_PLAYING

    /** The HAL's own count of real underrun events on the current track - the authoritative signal for an audible glitch, not an inference from timing. */
    fun underrunCount(): Int = track?.underrunCount ?: 0

    /** Frames the device has actually played, per `AudioTrack`'s own head position - the denominator side never lies about buffering. */
    fun playbackHeadFrames(): Long {
        val activeTrack = track ?: return 0
        // getPlaybackHeadPosition() is a 32-bit frame counter that CAN wrap on
        // very long playback; treat a negative read (post-wrap, reinterpreted
        // as signed) as "caught up" rather than as a nonsensical deficit.
        val head = activeTrack.playbackHeadPosition
        return if (head < 0) framesWritten else head.toLong()
    }

    /**
     * §17.3's `DRAINING_AUDIO -> PLAYBACK_DONE`: blocks (bounded) until the
     * device has actually played everything written, not just until the
     * last `write()` returned. Returns false only if the bound expired first
     * - a bounded tail timeout, not an infinite wait on a track that will
     * never catch up.
     */
    fun awaitDrain(timeoutMs: Long, pollIntervalMs: Long = 20): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (playbackHeadFrames() < framesWritten) {
            if (System.currentTimeMillis() >= deadline) return false
            Thread.sleep(pollIntervalMs.coerceAtLeast(1))
        }
        return true
    }

    /**
     * §23.2 `flush`: discard whatever is still buffered, forget how much was
     * written, leave the track ready to play the NEXT utterance immediately -
     * a new utterance starts clean, not silent.
     *
     * ⛔ Real AOSP `AudioTrack` behavior, read from source before writing this
     * (`stop()`'s own javadoc: "For an immediate stop, use pause(), followed
     * by flush()" - `stop()` itself is NOT part of that idiom): calling
     * `stop()` after `pause()+flush()` would leave the track in `STOPPED`
     * state, and per `play()`'s javadoc, resuming from `STOPPED` needs an
     * explicit `play()` call again - `write()` alone would silently buffer
     * data that never gets played. The first draft of this method called
     * `stop()` here; that bug never reached a device because `getPlaybackHeadPosition()`'s
     * own javadoc ("reset to zero by flush(), reloadStaticData(), and stop()")
     * is what led back to `play()`'s and caught it in review.
     */
    fun flush() {
        track?.let {
            runCatching { it.pause() }
            runCatching { it.flush() }
            runCatching { it.play() }
        }
        framesWritten = 0
    }

    override fun close() {
        track?.let {
            runCatching { it.stop() }
            runCatching { it.release() }
        }
        track = null
        framesWritten = 0
    }

    /** §17.4: one recreate attempt, then give up - never loop forever on a broken output path. */
    private fun recoverFromWriteError(pendingPcm16: ShortArray): Boolean {
        track?.let { runCatching { it.release() } }
        track = null
        if (recreateAttempted) {
            isDead = true
            return false
        }
        recreateAttempted = true
        return try {
            val recreated = createTrack()
            track = recreated
            val written = recreated.write(pendingPcm16, 0, pendingPcm16.size, AudioTrack.WRITE_BLOCKING)
            if (written < 0) {
                isDead = true
                false
            } else {
                framesWritten += (written / channels)
                true
            }
        } catch (error: Exception) {
            isDead = true
            false
        }
    }

    private fun createTrack(): AudioTrack {
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(sampleRate)
            .setChannelMask(channelMask)
            .build()
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        val minBufferBytes = AudioTrack.getMinBufferSize(sampleRate, channelMask, AudioFormat.ENCODING_PCM_16BIT)
        require(minBufferBytes > 0) { "AudioTrack.getMinBufferSize returned $minBufferBytes for sampleRate=$sampleRate channelMask=$channelMask" }
        // ⛔⛔ Two real, opposite failures measured on the OnePlus Pad 3, and
        // the buffer size is the one variable that explains both:
        //
        // 1. Too LARGE (first draft: minBufferBytes*3, ~360ms) - a short
        //    clip that fits entirely inside an oversized buffer never forces
        //    a write() to actually block waiting for device drain, and on
        //    this HAL that means getPlaybackHeadPosition()/getTimestamp()
        //    both report a stuck 0 indefinitely (confirmed with three probes,
        //    buffer size the only variable changed).
        // 2. Too SMALL (second draft: minBufferBytes, ~120ms) - fixed #1, but
        //    a real multi-second streamed utterance measured **103 real
        //    AudioTrack.getUnderrunCount() events**: the owner heard this as
        //    audible micro-stutter, and it was real, not a false alarm - a
        //    ~120ms cushion is not enough to absorb ordinary scheduling
        //    jitter between one decode+write cycle and the next.
        //
        // A buffer sized for realistic jitter headroom (§16.2's spirit, at
        // the AudioTrack level this time) fixes #2 without reintroducing #1:
        // any conversational utterance runs many seconds, so a buffer of a
        // few hundred ms is still far smaller than what gets written overall,
        // and write() still blocks regularly - the failure mode in #1 was
        // specifically a clip SHORTER than the buffer, not "any buffer above
        // the minimum". See TalosPcmPlayerInstrumentedTest and
        // TalosVoiceHostStreamingInstrumentedTest for the numbers this was
        // re-measured against after changing it.
        val bufferBytes = minBufferBytes * 8
        val newTrack = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(format)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(bufferBytes)
            .build()
        newTrack.play()
        return newTrack
    }
}
