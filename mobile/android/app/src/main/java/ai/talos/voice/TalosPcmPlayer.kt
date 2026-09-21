package ai.talos.voice

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import java.io.Closeable

internal interface TalosAudioTrackFacade {
    val playState: Int
    val underrunCount: Int
    val playbackHeadPosition: Int
    val bufferCapacityFrames: Int
    val startThresholdFrames: Int

    fun write(pcm16: ShortArray, offset: Int, size: Int): Int
    fun setStartThresholdFrames(frames: Int): Int
    fun play()
    fun pause()
    fun flush()
    fun stop()
    fun release()
}

internal fun interface TalosAudioTrackFactory {
    fun create(sampleRate: Int, channels: Int): TalosAudioTrackFacade
}

internal fun talosAudioTrackBufferBytes(minBufferBytes: Int): Int {
    require(minBufferBytes > 0) { "AudioTrack minimum buffer bytes must be positive" }
    return Math.multiplyExact(minBufferBytes, 10)
}

private class TalosAndroidAudioTrackFacade(
    private val track: AudioTrack,
) : TalosAudioTrackFacade {
    override val playState: Int get() = track.playState
    override val underrunCount: Int get() = track.underrunCount
    override val playbackHeadPosition: Int get() = track.playbackHeadPosition
    override val bufferCapacityFrames: Int get() = track.bufferCapacityInFrames
    override val startThresholdFrames: Int
        get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) track.startThresholdInFrames else 0

    override fun write(pcm16: ShortArray, offset: Int, size: Int): Int =
        track.write(pcm16, offset, size, AudioTrack.WRITE_BLOCKING)

    override fun setStartThresholdFrames(frames: Int): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) track.setStartThresholdInFrames(frames) else 0

    override fun play() = track.play()
    override fun pause() = track.pause()
    override fun flush() = track.flush()
    override fun stop() = track.stop()
    override fun release() = track.release()
}

private object TalosAndroidAudioTrackFactory : TalosAudioTrackFactory {
    override fun create(sampleRate: Int, channels: Int): TalosAudioTrackFacade {
        val channelMask = if (channels == 2) AudioFormat.CHANNEL_OUT_STEREO else AudioFormat.CHANNEL_OUT_MONO
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
        require(minBufferBytes > 0) {
            "AudioTrack.getMinBufferSize returned $minBufferBytes for sampleRate=$sampleRate channelMask=$channelMask"
        }
        val newTrack = AudioTrack.Builder()
            .setAudioAttributes(attributes)
            .setAudioFormat(format)
            .setTransferMode(AudioTrack.MODE_STREAM)
            .setBufferSizeInBytes(talosAudioTrackBufferBytes(minBufferBytes))
            .build()
        val facade = TalosAndroidAudioTrackFacade(newTrack)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val bytesPerFrame = channels * Short.SIZE_BYTES
            val minimumFrames = (minBufferBytes / bytesPerFrame).coerceAtLeast(1)
            require(minimumFrames <= facade.bufferCapacityFrames) {
                "AudioTrack minimum $minimumFrames exceeds capacity ${facade.bufferCapacityFrames}"
            }
            val applied = facade.setStartThresholdFrames(minimumFrames)
            require(applied == minimumFrames && facade.startThresholdFrames == minimumFrames) {
                "AudioTrack start threshold rejected: requested=$minimumFrames applied=$applied read=${facade.startThresholdFrames}"
            }
        }
        return facade
    }
}

internal data class TalosPcmTerminalDrainResult(
    val reached: Boolean,
    val completedAtNs: Long,
    val underrunCount: Int,
)

/**
 * Immutable evidence for one `MODE_STREAM` end-of-stream declaration.
 *
 * Android deliberately resets `getPlaybackHeadPosition()` when [AudioTrack.stop]
 * is called and AOSP documents that stop itself is asynchronous. Consequently
 * this object never manufactures a post-stop head value. It preserves the last
 * head observed while the track was playing and waits only for the exact amount
 * of accepted PCM that remained at that instant. Completion is explicitly
 * sourced from Android's streaming-stop drain contract.
 */
internal class TalosPcmTerminalBoundary internal constructor(
    val boundaryFrames: Long,
    val headFramesAtSeal: Long,
    val remainingFramesAtSeal: Long,
    val expectedDrainNs: Long,
    val stopRequestedAtNs: Long,
    val bufferCapacityFrames: Int,
    val startThresholdFrames: Int,
    private val track: TalosAudioTrackFacade,
    private val nanoTime: () -> Long,
    private val sleepNanos: (Long) -> Unit,
) {
    @Volatile private var cancelled = false
    @Volatile private var completed: TalosPcmTerminalDrainResult? = null
    private val completionLock = Any()

    fun awaitDrain(
        timeoutMs: Long,
        isCancelled: () -> Boolean = { false },
    ): TalosPcmTerminalDrainResult {
        require(timeoutMs >= 0L) { "timeoutMs must not be negative" }
        completed?.let { return it }
        val startedAtNs = nanoTime()
        val timeoutNs = if (timeoutMs >= Long.MAX_VALUE / NANOS_PER_MILLISECOND) {
            Long.MAX_VALUE
        } else {
            timeoutMs * NANOS_PER_MILLISECOND
        }
        val timeoutAtNs = saturatedAdd(startedAtNs, timeoutNs)
        val drainAtNs = saturatedAdd(stopRequestedAtNs, expectedDrainNs)
        while (true) {
            completed?.let { return it }
            val nowNs = nanoTime()
            if (cancelled || isCancelled()) {
                return TalosPcmTerminalDrainResult(
                    reached = false,
                    completedAtNs = nowNs,
                    underrunCount = track.underrunCount,
                )
            }
            if (nowNs >= drainAtNs) return completeAt(nowNs)
            if (nowNs >= timeoutAtNs) {
                return TalosPcmTerminalDrainResult(
                    reached = false,
                    completedAtNs = nowNs,
                    underrunCount = track.underrunCount,
                )
            }
            val untilDrainNs = drainAtNs - nowNs
            val untilTimeoutNs = timeoutAtNs - nowNs
            sleepNanos(minOf(untilDrainNs, untilTimeoutNs, CANCELLATION_POLL_NS))
        }
    }

    internal fun cancel() {
        cancelled = true
    }

    private fun completeAt(nowNs: Long): TalosPcmTerminalDrainResult {
        completed?.let { return it }
        val observed = TalosPcmTerminalDrainResult(
            reached = true,
            completedAtNs = nowNs,
            underrunCount = track.underrunCount,
        )
        return synchronized(completionLock) {
            completed ?: observed.also { completed = it }
        }
    }

    companion object {
        const val COMPLETION_SOURCE = "AUDIO_TRACK_STREAM_STOP_CONTRACT"
        private const val NANOS_PER_MILLISECOND = 1_000_000L
        private const val CANCELLATION_POLL_NS = 10_000_000L

        private fun saturatedAdd(left: Long, right: Long): Long =
            if (right == Long.MAX_VALUE || left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right
    }
}

private fun sleepPrecisely(durationNs: Long) {
    require(durationNs >= 0L) { "sleep duration must not be negative" }
    val milliseconds = durationNs / 1_000_000L
    val nanoseconds = (durationNs % 1_000_000L).toInt()
    Thread.sleep(milliseconds, nanoseconds)
}

private fun durationForFramesNs(frames: Long, sampleRate: Int): Long {
    require(frames >= 0L) { "frame duration must not be negative" }
    val wholeSeconds = frames / sampleRate
    val remainingFrames = frames % sampleRate
    val wholeNs = Math.multiplyExact(wholeSeconds, 1_000_000_000L)
    val fractionalNumerator = Math.multiplyExact(remainingFrames, 1_000_000_000L)
    val fractionalNs = (fractionalNumerator + sampleRate - 1L) / sampleRate
    return Math.addExact(wholeNs, fractionalNs)
}

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
    private val trackFactory: TalosAudioTrackFactory = TalosAndroidAudioTrackFactory,
    private val nanoTime: () -> Long = System::nanoTime,
    private val sleepNanos: (Long) -> Unit = ::sleepPrecisely,
) : Closeable {
    init {
        require(channels == 1 || channels == 2) { "TalosPcmPlayer supports mono or stereo only, got $channels channels" }
    }

    @Volatile private var track: TalosAudioTrackFacade? = null
    @Volatile private var samplesWritten: Long = 0
    private val levelProcessor = TalosPcmLevelProcessor(sampleRate, channels)
    @Volatile private var lastLevelStats: TalosPcmLevelStats? = null
    @Volatile private var terminalBoundary: TalosPcmTerminalBoundary? = null
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
    fun write(
        interleavedPcm: FloatArray,
        levelProfile: TalosPcmLevelProfile = TalosPcmLevelProfile.PASSTHROUGH,
        onAcceptedOutput: ((FloatArray) -> Unit)? = null,
        isCancelled: () -> Boolean = { false },
    ): Boolean {
        if (interleavedPcm.isEmpty()) return true
        if (isDead) return false
        if (isCancelled()) return false
        if (!prepareForWrite(isCancelled)) return false
        val levelOutput = levelProcessor.processToPcm16(interleavedPcm, levelProfile)
        lastLevelStats = levelOutput.stats
        val pcm16 = levelOutput.pcm16
        val activeTrack = runCatching { track ?: createTrack().also { track = it } }.getOrElse {
            isDead = true
            return false
        }
        if (!writeFully(activeTrack, pcm16, 0, isCancelled)) return false
        onAcceptedOutput?.invoke(FloatArray(pcm16.size) { index -> pcm16[index] / 32_767f })
        if (isCancelled()) return false
        val primedTrack = track ?: return false
        if (primedTrack.playState != AudioTrack.PLAYSTATE_PLAYING) {
            val started = runCatching {
                primedTrack.play()
                primedTrack.playState == AudioTrack.PLAYSTATE_PLAYING
            }.getOrDefault(false)
            if (!started) {
                isDead = true
                return false
            }
        }
        return true
    }

    /** Number of frames (per-channel samples) actually written so far - the numerator for drain progress. */
    fun framesWritten(): Long = samplesWritten / channels

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
        return if (head < 0) framesWritten() else head.toLong()
    }

    /** Effective application buffer capacity reported by the active track. */
    fun bufferCapacityFrames(): Int = track?.bufferCapacityFrames ?: 0

    /** Platform start threshold, or zero on Android versions that do not expose it. */
    fun startThresholdFrames(): Int = track?.startThresholdFrames ?: 0

    /** Statistics for the most recent block processed for this AudioTrack. */
    fun lastWriteLevelStats(): TalosPcmLevelStats? = lastLevelStats

    /**
     * §17.3's `DRAINING_AUDIO -> PLAYBACK_DONE`: blocks (bounded) until the
     * device has actually played everything written, not just until the
     * last `write()` returned. Returns false only if the bound expired first
     * - a bounded tail timeout, not an infinite wait on a track that will
     * never catch up.
     */
    fun awaitDrain(timeoutMs: Long, pollIntervalMs: Long = 20): Boolean {
        return awaitPlaybackBoundary(framesWritten(), timeoutMs, pollIntervalMs)
    }

    /**
     * Waits for one utterance's absolute frame boundary inside a shared
     * streaming track. Later utterances may increase [framesWritten] while
     * this wait is in progress; they do not move [targetFrames].
     */
    fun awaitPlaybackBoundary(
        targetFrames: Long,
        timeoutMs: Long,
        pollIntervalMs: Long = 20,
        isCancelled: () -> Boolean = { false },
    ): Boolean {
        require(targetFrames >= 0L) { "targetFrames must not be negative" }
        val deadline = System.currentTimeMillis() + timeoutMs
        while (playbackHeadFrames() < targetFrames) {
            if (isCancelled()) return false
            if (System.currentTimeMillis() >= deadline) return false
            Thread.sleep(pollIntervalMs.coerceAtLeast(1))
        }
        return !isCancelled()
    }

    /** Makes a stopped terminal stream reusable before callers snapshot write counters. */
    fun prepareForWrite(isCancelled: () -> Boolean = { false }): Boolean =
        prepareForWriteAfterTerminalDrain(isCancelled)

    /**
     * Declares the current accepted PCM as the final `MODE_STREAM` buffer.
     * This must never be called between already queued ADD utterances: their
     * exact boundaries continue to use [awaitPlaybackBoundary] on the shared
     * playing track.
     */
    fun sealTerminalBoundary(expectedBoundaryFrames: Long? = null): TalosPcmTerminalBoundary {
        terminalBoundary?.let { sealed ->
            check(expectedBoundaryFrames == null || expectedBoundaryFrames == sealed.boundaryFrames) {
                "terminal playback boundary changed: expected=$expectedBoundaryFrames actual=${sealed.boundaryFrames}"
            }
            return sealed
        }
        val activeTrack = requireNotNull(track) { "cannot seal a terminal boundary before AudioTrack exists" }
        check(activeTrack.playState == AudioTrack.PLAYSTATE_PLAYING) {
            "cannot seal a terminal boundary while AudioTrack is not playing"
        }
        val boundaryFrames = framesWritten()
        check(expectedBoundaryFrames == null || expectedBoundaryFrames == boundaryFrames) {
            "terminal playback boundary changed: expected=$expectedBoundaryFrames actual=$boundaryFrames"
        }
        val headFrames = playbackHeadFrames().coerceAtMost(boundaryFrames)
        val remainingFrames = (boundaryFrames - headFrames).coerceAtLeast(0L)
        val capacityFrames = activeTrack.bufferCapacityFrames
        val thresholdFrames = activeTrack.startThresholdFrames
        activeTrack.stop()
        val sealed = TalosPcmTerminalBoundary(
            boundaryFrames = boundaryFrames,
            headFramesAtSeal = headFrames,
            remainingFramesAtSeal = remainingFrames,
            expectedDrainNs = durationForFramesNs(remainingFrames, sampleRate),
            stopRequestedAtNs = nanoTime(),
            bufferCapacityFrames = capacityFrames,
            startThresholdFrames = thresholdFrames,
            track = activeTrack,
            nanoTime = nanoTime,
            sleepNanos = sleepNanos,
        )
        terminalBoundary = sealed
        return sealed
    }

    /**
     * §23.2 `flush`: discard whatever is still buffered, forget how much was
     * written, and leave the empty track paused. The next utterance writes a
     * complete first PCM block before [write] starts playback again.
     *
     * ⛔ Real AOSP `AudioTrack` behavior, read from source before writing this
     * (`stop()`'s own javadoc: "For an immediate stop, use pause(), followed
     * by flush()" - `stop()` itself is NOT part of that idiom). Playback is
     * deliberately not restarted while the track is empty: [write] owns the
     * measured `prime -> play` boundary.
     */
    fun flush() {
        terminalBoundary?.cancel()
        track?.let {
            runCatching { it.pause() }
            runCatching { it.flush() }
        }
        terminalBoundary = null
        samplesWritten = 0
        levelProcessor.reset()
        lastLevelStats = null
    }

    override fun close() {
        terminalBoundary?.cancel()
        track?.let {
            runCatching { it.stop() }
            runCatching { it.release() }
        }
        track = null
        terminalBoundary = null
        samplesWritten = 0
        levelProcessor.reset()
        lastLevelStats = null
    }

    /** §17.4: one recreate attempt, then give up - never loop forever on a broken output path. */
    private fun writeFully(
        activeTrack: TalosAudioTrackFacade,
        pcm16: ShortArray,
        initialOffset: Int,
        isCancelled: () -> Boolean,
    ): Boolean {
        var offset = initialOffset
        while (offset < pcm16.size) {
            if (isCancelled()) return false
            val remaining = pcm16.size - offset
            val written = runCatching { activeTrack.write(pcm16, offset, remaining) }.getOrElse { -1 }
            when {
                written < 0 -> return recoverFromWriteError(pcm16, offset, isCancelled)
                written == 0 || written > remaining -> {
                    isDead = true
                    return false
                }
                else -> {
                    offset += written
                    samplesWritten += written
                }
            }
        }
        return true
    }

    private fun recoverFromWriteError(
        pendingPcm16: ShortArray,
        offset: Int,
        isCancelled: () -> Boolean,
    ): Boolean {
        track?.let { runCatching { it.release() } }
        track = null
        if (recreateAttempted) {
            isDead = true
            return false
        }
        recreateAttempted = true
        if (isCancelled()) return false
        return try {
            val recreated = createTrack()
            track = recreated
            writeFully(recreated, pendingPcm16, offset, isCancelled)
        } catch (error: Exception) {
            isDead = true
            false
        }
    }

    private fun prepareForWriteAfterTerminalDrain(isCancelled: () -> Boolean): Boolean {
        val sealed = terminalBoundary ?: return true
        val result = sealed.awaitDrain(timeoutMs = Long.MAX_VALUE, isCancelled = isCancelled)
        if (!result.reached) return false
        if (terminalBoundary === sealed) {
            samplesWritten = 0
            levelProcessor.reset()
            lastLevelStats = null
            terminalBoundary = null
        }
        return true
    }

    private fun createTrack(): TalosAudioTrackFacade {
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
        return trackFactory.create(sampleRate, channels)
    }
}
