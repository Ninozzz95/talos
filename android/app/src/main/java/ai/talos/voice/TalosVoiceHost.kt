package ai.talos.voice

import android.content.Context
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
     * Fase 4's door for the plugin: same streaming path as
     * [submitSpeakStreaming], with an enrolled personal profile's
     * `promptAudioCodes` (§15.1's `generateAudioTokensWithReference`)
     * standing in for a builtin voice name. The caller (the plugin) owns
     * loading the profile from disk - this class stays unaware of
     * [TalosVoiceProfileStore]/`Context`, same separation of concerns
     * [TalosMossRuntime.generateAudioTokensWithReference] already keeps one
     * level down: audio codes in, no knowledge of where they came from.
     */
    fun submitSpeakStreamingWithReference(
        text: String,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int? = null,
        seed: Long? = null,
        onComplete: (Result<TalosVoiceStreamResult>) -> Unit = {},
    ): Long {
        val id = generationCounter.incrementAndGet()
        activeGeneration = id
        owner.execute {
            val result = runCatching { runSpeakStreamingWithReference(id, text, promptAudioCodes, maxFrames, seed) }
            onComplete(result)
        }
        return id
    }

    /** Convenience for tests, same shape as [speakStreamingBlocking]. */
    fun speakStreamingWithReferenceBlocking(
        text: String,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int? = null,
        seed: Long? = null,
    ): TalosVoiceStreamResult {
        val latch = CountDownLatch(1)
        var outcome: Result<TalosVoiceStreamResult>? = null
        submitSpeakStreamingWithReference(text, promptAudioCodes, maxFrames, seed) { result ->
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

    private fun runSpeakStreaming(id: Long, text: String, voice: String, maxFrames: Int?, seed: Long?): TalosVoiceStreamResult {
        val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
        val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
        val activePlayer = player ?: TalosPcmPlayer(activeRuntime.sampleRate, activeRuntime.channels).also { player = it }
        val textTokenIds = activeTokenizer.encode(text)
        require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for non-empty text: \"$text\"" }

        return driveStreamingSynthesis(id, activeRuntime, activePlayer) { onFrame ->
            activeRuntime.generateAudioTokens(
                textTokenIds = textTokenIds,
                voice = voice,
                maxFrames = maxFrames ?: DEFAULT_MAX_FRAMES,
                seed = seed ?: System.nanoTime(),
                isCancelled = { activeGeneration != id },
                onFrame = onFrame,
            )
        }
    }

    /** Same as [runSpeakStreaming], an enrolled profile's reference codes instead of a builtin voice name - see [submitSpeakStreamingWithReference]. */
    private fun runSpeakStreamingWithReference(id: Long, text: String, promptAudioCodes: List<IntArray>, maxFrames: Int?, seed: Long?): TalosVoiceStreamResult {
        val activeTokenizer = tokenizer ?: openTokenizer().also { tokenizer = it }
        val activeRuntime = runtime ?: TalosMossRuntime.open(modelRoot, cpuThreads).also { runtime = it }
        val activePlayer = player ?: TalosPcmPlayer(activeRuntime.sampleRate, activeRuntime.channels).also { player = it }
        val textTokenIds = activeTokenizer.encode(text)
        require(textTokenIds.isNotEmpty()) { "tokenizer produced no ids for non-empty text: \"$text\"" }

        return driveStreamingSynthesis(id, activeRuntime, activePlayer) { onFrame ->
            activeRuntime.generateAudioTokensWithReference(
                textTokenIds = textTokenIds,
                promptAudioCodes = promptAudioCodes,
                maxFrames = maxFrames ?: DEFAULT_MAX_FRAMES,
                seed = seed ?: System.nanoTime(),
                isCancelled = { activeGeneration != id },
                onFrame = onFrame,
            )
        }
    }

    /**
     * §16.1's loop, factored out of [runSpeakStreaming] so
     * [runSpeakStreamingWithReference] runs through the exact same decode/
     * backpressure/underrun-accounting code - not a second copy that could
     * quietly drift from the measured-safe one. `generate` is the one thing
     * that legitimately differs between a builtin voice and a personal
     * profile: which `TalosMossRuntime` generation method gets called, and
     * with what reference. Everything after "a frame arrived" is identical:
     * every generated TTS frame is queued, then handed to
     * [TalosMossCodecStream] in the batch size §16.2's backpressure policy
     * currently allows, and the decoded PCM is written to [TalosPcmPlayer]
     * immediately. Batch size jumps from 1 (first chunk only, for TTFA) to a
     * measured-safe floor of 8 for everything after ([resolveFrameBudget] -
     * see its doc for why, and for why this is not upstream's 1→2→4→8).
     */
    private fun driveStreamingSynthesis(
        id: Long,
        activeRuntime: TalosMossRuntime,
        activePlayer: TalosPcmPlayer,
        generate: (onFrame: (IntArray) -> Unit) -> Pair<List<IntArray>, Boolean>,
    ): TalosVoiceStreamResult {
        val codecStream = activeRuntime.openCodecStream()
        val startedAtNanos = System.nanoTime()
        val underrunCountBefore = activePlayer.underrunCount()
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
            val (_, wasCancelled) = generate { frame ->
                pending.add(frame)
                decodePending(force = false)
            }
            decodePending(force = true)
            cancelled = wasCancelled || activeGeneration != id
        } finally {
            codecStream.close()
        }

        val drained = if (!cancelled) activePlayer.awaitDrain(timeoutMs = DRAIN_TIMEOUT_MS) else true
        val hardwareUnderruns = activePlayer.underrunCount() - underrunCountBefore
        return TalosVoiceStreamResult(
            cancelled = cancelled,
            ttfaMs = ttfaMs,
            underruns = underruns,
            hardwareUnderruns = hardwareUnderruns,
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

        @Volatile private var instance: TalosVoiceHost? = null

        /**
         * Blueprint §41's `TalosVoiceHost.get(context.applicationContext)` -
         * one host per process, not one per [android.app.Activity] or per
         * Capacitor `Plugin` instance. Matters concretely: a WebView reload
         * destroys and recreates the plugin, but §41's own skeleton warns
         * against treating that as a reason to close model sessions
         * ("Client/UI destruction is not equivalent to destroying the
         * process-scoped voice runtime") - a second [TalosVoiceHost] on the
         * same [modelRoot] would mean two owner threads racing to open the
         * same ONNX sessions, which §14's whole design exists to rule out.
         */
        fun get(context: Context): TalosVoiceHost {
            instance?.let { return it }
            synchronized(this) {
                instance?.let { return it }
                val modelRoot = TalosVoiceModelManager.modelRoot(context.applicationContext.getExternalFilesDir(null)!!)
                val created = TalosVoiceHost(modelRoot)
                instance = created
                return created
            }
        }

        /** Test-only: lets an instrumented test start from a clean singleton instead of leaking state across test classes. */
        internal fun resetForTests() {
            synchronized(this) {
                instance?.close()
                instance = null
            }
        }
    }
}

/**
 * §16.2's adaptive backpressure. NOT upstream `ort_cpu_runtime.py`'s
 * `_resolve_stream_decode_frame_budget` thresholds (1/2/4/8 at 0.20/0.55/
 * 1.10s lead) - those were measured on a different platform, and a real
 * measurement here showed they do not hold on the OnePlus Pad 3.
 *
 * ⛔⛔ **`decode_step` at batch=1 measures RTF 0.939 on its own** - the codec
 * decode ALONE, with no TTS generation cost added on top yet, already
 * spends 94% of the real-time budget for the audio it produces
 * (`TalosMossCodecStreamBatchSizeDiagnosticTest`: 127 frames, batch=1,
 * elapsedMs=9538 for audioMs=10160). TTS generation for those same frames
 * runs at RTF ~0.53-0.69 on its own (measured in Fase 1). Serialized, as
 * this pipeline runs them, that is a combined RTF over 1.5 at batch=1 -
 * not jitter, a SUSTAINED deficit. A bigger `TalosPcmPlayer` buffer only
 * delays the first underrun it cannot prevent: measured 103 real
 * `AudioTrack.getUnderrunCount()` events at the original buffer, 91 at 4x
 * the buffer - barely moved, because the buffer was never the bottleneck.
 * Upstream's own thresholds assume batch=1 is cheap enough to be a safe
 * starting point and bigger batches are a pure efficiency optimization;
 * that assumption does not hold on this hardware for this model.
 *
 * The fix measured to actually leave headroom: batch=1 ONLY for the very
 * first chunk (keeps TTFA low - measured 353-355ms, still under the 500ms
 * target), then straight to a floor of 8 for everything after, growing to
 * 16 once lead is generous. At batch=8 codec-alone RTF measures 0.204;
 * combined with ~0.6 for TTS generation, combined RTF is comfortably under
 * 1.0 with real margin for write()/scheduling overhead, unlike batch=1's
 * 1.5+. `leadSeconds` is real here (buffered-minus-played frames off
 * [TalosPcmPlayer]), not upstream's wall-clock proxy.
 */
private fun resolveFrameBudget(leadSeconds: Double, hasEmittedAudio: Boolean): Int = when {
    !hasEmittedAudio -> 1
    else -> 8
}

internal data class TalosVoiceStreamResult(
    val cancelled: Boolean,
    /** Submit-to-first-`AudioTrack.write()` time. Not confirmed-audible TTFA - the device quirk documented on [TalosPcmPlayer.write] means playback-head confirmation needs more than one write to be reliable on some hardware. */
    val ttfaMs: Long?,
    /** Times a player write failed and needed the §17.4 recreate path - not necessarily audible glitches, but never expected to be nonzero either. */
    val underruns: Int,
    /** `AudioTrack.getUnderrunCount()` delta for this utterance - the HAL's own count of real buffer underruns, i.e. the authoritative signal for an audible glitch. Nonzero here means the device actually ran the output buffer dry, not an inference from timing. */
    val hardwareUnderruns: Int,
    val drainedWithinTimeout: Boolean,
    val elapsedMs: Long,
)
