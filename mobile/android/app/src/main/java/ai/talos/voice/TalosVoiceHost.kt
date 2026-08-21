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

    // Owner-lane only past this point - never read or written from any other thread.
    private var runtime: TalosMossRuntime? = null
    private var tokenizer: TalosVoiceTokenizer? = null

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
     * Invalidates whatever generation is active. The generation notices on
     * its next per-frame poll (see [TalosMossRuntime.synthesizePcm16ToFile]'s
     * `isCancelled`) and unwinds on its own — this call does not reach into
     * live ORT state from the calling thread, which is exactly the thing §14
     * says not to do.
     */
    fun cancel(): Long {
        val invalidated = generationCounter.incrementAndGet()
        activeGeneration = invalidated
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
            runtime = null
            tokenizer = null
            closed.countDown()
        }
        closed.await(30, TimeUnit.SECONDS)
        owner.shutdown()
    }

    companion object {
        private const val DEFAULT_MAX_FRAMES = 375
    }
}
