package ai.talos.voice

import java.io.Closeable
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * The single owner of TALOS's mutable neural voice state (blueprint §14).
 * Model session creation, tokenizer loading, prefill/decode, and runtime
 * close all happen on one dedicated thread — never on a caller's thread,
 * never concurrently with each other. `AudioTrack` writing (Phase 2) may get
 * its own writer thread, but ownership and completion still route through
 * here.
 *
 * Invariant §6: both the tokenizer and the runtime are opened lazily, on
 * first use, on the owner lane — not in this constructor. Nothing neural
 * loads just because a [TalosVoiceHost] exists.
 */
internal class TalosVoiceHost(
    private val modelRoot: File,
    private val cpuThreads: Int = 2,
) : Closeable {
    private val owner = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "talos-voice-owner").apply { priority = Thread.NORM_PRIORITY }
    }

    private val generationCounter = AtomicLong(0)
    @Volatile private var activeGeneration = 0L

    // Owner-lane only past this point - never read or written from any other thread -
    // EXCEPT player, which cancel() below reads from the calling thread on purpose.
    private var runtime: TalosMossRuntime? = null
    private var tokenizer: TalosVoiceTokenizer? = null
    @Volatile private var player: TalosPcmPlayer? = null

    /**
     * Starts a synthesis on the owner lane and returns immediately with the
     * generation id that now owns "active". `onComplete` runs on the owner
     * lane too, after the generation either finishes or is cancelled -
     * [TalosMossSynthesisResult.cancelled] tells the two apart. A stale
     * generation invalidated by a later [submitSpeak] or [cancel] call still
     * runs onComplete; it does not get silently dropped.
     */
    fun submitSpeak(
        text: String,
        voice: String,
        outputFile: File,
        maxFrames: Int? = null,
        seed: Long? = null,
        onComplete: (Result<TalosMossSynthesisResult>) -> Unit = {},
    ): Long {
        val id = generationCounter.incrementAndGet()
        activeGeneration = id
        owner.execute {
            val result = runCatching { runSpeak(id, text, voice, outputFile, maxFrames, seed) }
            onComplete(result)
        }
        return id
    }

    /** Convenience for tests and for any caller that has nothing else to do while it waits. */
    fun speakBlocking(
        text: String,
        voice: String,
        outputFile: File,
        maxFrames: Int? = null,
        seed: Long? = null,
    ): TalosMossSynthesisResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosMossSynthesisResult>? = null
        submitSpeak(text, voice, outputFile, maxFrames, seed) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Fase 2's real path: text in, spoken audio out through [TalosPcmPlayer]
     * as it becomes available - §16.1's loop end to end. `onComplete`
     * carries [TalosVoiceStreamResult.cancelled] and
     * [TalosVoiceStreamResult.ttfaMs] (submit-to-first-`write()`, not
     * confirmed-audible - see the field doc).
     */
    fun submitSpeakStreaming(
        text: String,
        voice: String,
        maxFrames: Int? = null,
        seed: Long? = null,
        onComplete: (Result<TalosVoiceStreamResult>) -> Unit = {},
    ): Long {
        val id = generationCounter.incrementAndGet()
        activeGeneration = id
        owner.execute {
            val result = runCatching { runSpeakStreaming(id, text, voice, maxFrames, seed) }
            onComplete(result)
        }
        return id
    }

    /** Convenience for tests: blocks until the utterance has both finished generating and finished playing. */
    fun speakStreamingBlocking(
        text: String,
        voice: String,
        maxFrames: Int? = null,
        seed: Long? = null,
    ): TalosVoiceStreamResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceStreamResult>? = null
        submitSpeakStreaming(text, voice, maxFrames, seed) { result ->
            outcome = result
            latch.countDown()
        }
        latch.await()
        return outcome!!.getOrThrow()
    }

    /**
     * Invalidates whatever generation is active AND silences whatever is
     * playing right now (§23.2 `flush`) - a cancel that only stopped future
     * TTS frames but let already-decoded audio keep playing out would not be
     * a cancel a person could feel.
     *
     * ⛔ `player.flush()` is called from THIS thread, not queued onto the
     * owner lane: the owner lane is exactly where a long-running generation
     * is busy blocking on ONNX/`AudioTrack.write()` calls, so a queued flush
     * would sit behind the whole utterance instead of interrupting it -
     * §23.4's "cancel p95 < 150ms" is not reachable if cancel has to wait
     * its turn. `AudioTrack`'s control calls (`pause`/`flush`/`play`) are
     * documented-safe to call from a different thread than the one blocked
     * in `write()`; `player` is `@Volatile` so this thread sees the current
     * instance. Everything that actually touches ORT state - the generation
     * itself - still only ever unwinds on the owner lane, via the
     * invalidated `activeGeneration` id, exactly as §14 requires.
     *
     * ⛔ Measured on the OnePlus Pad 3, warm (host already spoke once):
     * cancel-to-result **60 ms**, comfortably under §23.4's 150 ms p95 -
     * `isCancelled()` at the top of every autoregressive frame is enough,
     * no extra pre-write check needed. ⛔ The FIRST call on a fresh host is
     * a different number entirely: cold `TalosMossRuntime.open()` (five ONNX
     * sessions off storage) took 6-7 s on this device, and a cancel issued
     * during that window can only take effect once loading finishes - there
     * is no loop to interrupt yet. That is cold-model-load cost wearing the
     * wrong label, not a cancellation defect; §23.4's number, like the TTFA
     * gate's "a caldo", is a warm-generation measurement.
     */
    fun cancel(): Long {
        val invalidated = generationCounter.incrementAndGet()
        activeGeneration = invalidated
        player?.flush()
        return invalidated
    }

    private fun runSpeak(id: Long, text: String, voice: String, outputFile: File, maxFrames: Int?, seed: Long?): TalosMossSynthesisResult {
        val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
        val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
        val textTokenIds = activeTokenizer.encode(text)
        require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for non-empty text: \"$text\"" }
        return activeRuntime.synthesizePcm16ToFile(
            textTokenIds = textTokenIds,
            outputFile = outputFile,
            voice = voice,
            maxFrames = maxFrames ?: DEFAULT_MAX_FRAMES,
            seed = seed ?: System.nanoTime(),
            isCancelled = { activeGeneration != id },
        )
    }

    /**
     * §16.1's loop, driven by [TalosMossRuntime.generateAudioTokens]'s
     * `onFrame` hook: every generated TTS frame is queued, then handed to
     * [TalosMossCodecStream] in the batch size §16.2's backpressure policy
     * currently allows, and the decoded PCM is written to [TalosPcmPlayer]
     * immediately. Batch size grows (1→2→4→8 frames, [resolveFrameBudget])
     * as the player's own measured lead grows - real buffered-ahead time
     * read off `TalosPcmPlayer`, not upstream `ort_cpu_runtime.py`'s
     * wall-clock proxy (that proxy exists because the Python reference has
     * no real audio device to measure against; this one does).
     */
    private fun runSpeakStreaming(id: Long, text: String, voice: String, maxFrames: Int?, seed: Long?): TalosVoiceStreamResult {
        val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
        val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
        val activePlayer = player ?: TalosPcmPlayer(activeRuntime.sampleRate, activeRuntime.channels).also { player = it }
        val textTokenIds = activeTokenizer.encode(text)
        require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for non-empty text: \"$text\"" }

        val codecStream = activeRuntime.openCodecStream()
        val startedAtNanos = System.nanoTime()
        var ttfaMs: Long? = null
        var underruns = 0
        val pending = ArrayList<IntArray>()

        fun decodePending(force: Boolean) {
            if (pending.isEmpty()) return
            val bufferedFrames = activePlayer.framesWritten() - activePlayer.playbackHeadFrames()
            val leadSeconds = if (ttfaMs == null) 0.0 else bufferedFrames.toDouble() / activeRuntime.sampleRate
            val budget = resolveFrameBudget(leadSeconds, hasEmittedAudio = ttfaMs != null)
            if (!force && pending.size < budget) return
            val take = if (force) pending.size else minOf(pending.size, budget)
            val batch = ArrayList(pending.subList(0, take))
            repeat(take) { pending.removeAt(0) }

            val decoded = codecStream.runFrames(batch) ?: return
            if (ttfaMs == null) {
                ttfaMs = (System.nanoTime() - startedAtNanos) / 1_000_000
            }
            if (!activePlayer.write(decoded.interleavedPcm)) {
                underruns++
            }
        }

        val cancelled: Boolean
        try {
            val (_, wasCancelled) = activeRuntime.generateAudioTokens(
                textTokenIds = textTokenIds,
                voice = voice,
                maxFrames = maxFrames ?: DEFAULT_MAX_FRAMES,
                seed = seed ?: System.nanoTime(),
                isCancelled = { activeGeneration != id },
                onFrame = { frame ->
                    pending.add(frame)
                    decodePending(force = false)
                },
            )
            decodePending(force = true)
            cancelled = wasCancelled || activeGeneration != id
        } finally {
            codecStream.close()
        }

        val drained = if (!cancelled) activePlayer.awaitDrain(timeoutMs = DRAIN_TIMEOUT_MS) else true
        return TalosVoiceStreamResult(
            cancelled = cancelled,
            ttfaMs = ttfaMs,
            underruns = underruns,
            drainedWithinTimeout = drained,
            elapsedMs = (System.nanoTime() - startedAtNanos) / 1_000_000,
        )
    }

    private fun openTokenizer(): TalosVoiceTokenizer {
        val manifestPath = TalosMossManifest.resolveManifestPath(modelRoot)
        val manifestDir = manifestPath.parentFile ?: modelRoot
        val tokenizerModelFile = File(manifestDir, "tokenizer.model")
        require(tokenizerModelFile.isFile) { "Missing tokenizer.model: ${tokenizerModelFile.absolutePath}" }
        return TalosVoiceBpeTokenizer(TalosSentencePieceModel.parse(tokenizerModelFile.readBytes()))
    }

    /** Blocks until the owner lane has actually closed model state - deterministic teardown for tests. */
    override fun close() {
        val closed = CountDownLatch(1)
        owner.execute {
            runtime?.close()
            tokenizer?.close()
            player?.close()
            runtime = null
            tokenizer = null
            player = null
            closed.countDown()
        }
        closed.await(30, TimeUnit.SECONDS)
        owner.shutdown()
    }

    companion object {
        private const val DEFAULT_MAX_FRAMES = 375
        private const val DRAIN_TIMEOUT_MS = 10_000L
    }
}

/**
 * §16.2's adaptive backpressure, same thresholds as upstream
 * `ort_cpu_runtime.py`'s `_resolve_stream_decode_frame_budget` (verified
 * against that source, not re-derived): start at the smallest possible
 * batch (one frame) until the first audio has actually gone to the player,
 * then grow the batch as measured lead grows - more buffered-ahead time
 * means it is safe to spend longer per codec call without starving
 * playback. `leadSeconds` is real here (buffered-minus-played frames off
 * [TalosPcmPlayer]), not upstream's wall-clock proxy.
 */
private fun resolveFrameBudget(leadSeconds: Double, hasEmittedAudio: Boolean): Int = when {
    !hasEmittedAudio || leadSeconds < 0.20 -> 1
    leadSeconds < 0.55 -> 2
    leadSeconds < 1.10 -> 4
    else -> 8
}

internal data class TalosVoiceStreamResult(
    val cancelled: Boolean,
    /** Submit-to-first-`AudioTrack.write()` time. Not confirmed-audible TTFA - the device quirk documented on [TalosPcmPlayer.write] means playback-head confirmation needs more than one write to be reliable on some hardware. */
    val ttfaMs: Long?,
    /** Times a player write failed and needed the §17.4 recreate path - not necessarily audible glitches, but never expected to be nonzero either. */
    val underruns: Int,
    val drainedWithinTimeout: Boolean,
    val elapsedMs: Long,
)
