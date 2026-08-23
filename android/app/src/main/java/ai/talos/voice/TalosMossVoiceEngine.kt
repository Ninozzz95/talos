package ai.talos.voice

import kotlin.math.max

internal interface TalosMossVoiceCodecContract : AutoCloseable {
    fun runFrames(frameRows: List<IntArray>): TalosMossCodecFrames?
}

internal interface TalosMossVoiceRuntimeContract {
    val sampleRate: Int
    val channels: Int

    fun openCodecStream(): TalosMossVoiceCodecContract

    fun generateWithReference(
        textTokenIds: IntArray,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int,
        seed: Long,
        isCancelled: () -> Boolean,
        onFrame: (IntArray) -> Unit,
    ): Pair<List<IntArray>, Boolean>
}

internal class TalosMossCodecAdapter(
    private val codec: TalosMossCodecStream,
) : TalosMossVoiceCodecContract {
    override fun runFrames(frameRows: List<IntArray>): TalosMossCodecFrames? = codec.runFrames(frameRows)
    override fun close() = codec.close()
}

internal class TalosMossRuntimeAdapter(
    private val runtime: TalosMossRuntime,
) : TalosMossVoiceRuntimeContract {
    override val sampleRate: Int get() = runtime.sampleRate
    override val channels: Int get() = runtime.channels

    override fun openCodecStream(): TalosMossVoiceCodecContract = TalosMossCodecAdapter(runtime.openCodecStream())

    override fun generateWithReference(
        textTokenIds: IntArray,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int,
        seed: Long,
        isCancelled: () -> Boolean,
        onFrame: (IntArray) -> Unit,
    ): Pair<List<IntArray>, Boolean> = runtime.generateAudioTokensWithReference(
        textTokenIds = textTokenIds,
        promptAudioCodes = promptAudioCodes,
        maxFrames = maxFrames,
        seed = seed,
        isCancelled = isCancelled,
        onFrame = onFrame,
    )
}

internal class TalosMossVoiceEngine(
    private val runtime: TalosMossVoiceRuntimeContract,
    private val tokenizer: TalosVoiceTokenizer,
) : TalosNeuralVoiceEngine {
    override val backend: String = TalosMossPromptPayload.BACKEND

    override fun synthesize(
        request: TalosVoiceEngineRequest,
        cancellation: TalosVoiceEngineCancellation,
        callback: TalosVoiceEngineCallback,
    ): TalosVoiceEngineResult {
        val payload = request.payload as? TalosMossPromptPayload
            ?: throw IllegalArgumentException("MOSS engine requires a MOSS prompt payload")
        val startedAtNs = System.nanoTime()
        val tokenizeStartedAtNs = System.nanoTime()
        val textTokenIds = tokenizer.encode(request.text)
        callback.onStage(
            TalosVoiceEngineStageMetric(
                backend = backend,
                stage = "moss_tokenize",
                startedAtNs = tokenizeStartedAtNs,
                durationNs = System.nanoTime() - tokenizeStartedAtNs,
                threadName = Thread.currentThread().name,
            ),
        )
        require(textTokenIds.isNotEmpty()) { "MOSS tokenizer produced no ids for non-empty text" }

        val codec = runtime.openCodecStream()
        val pending = ArrayList<IntArray>()
        var emittedSamples = 0
        var decoderNs = 0L
        var queueHighWatermarkFrames = 0
        var nextFrameIndex = 0
        var emittedChunks = 0
        var consumerStopped = false

        fun decodePending(force: Boolean) {
            if (pending.isEmpty() || consumerStopped || cancellation.isCancelled()) return
            val target = if (emittedChunks == 0) 1 else REGULAR_DECODE_FRAMES
            if (!force && pending.size < target) return
            val take = if (force) pending.size else target
            val batch = pending.subList(0, take).map(IntArray::copyOf)
            repeat(take) { pending.removeAt(0) }
            val firstFrameIndex = nextFrameIndex
            nextFrameIndex += take
            val decodeStartedAtNs = System.nanoTime()
            val decoded = codec.runFrames(batch)
            val durationNs = System.nanoTime() - decodeStartedAtNs
            decoderNs += durationNs
            callback.onStage(
                TalosVoiceEngineStageMetric(
                    backend = backend,
                    stage = "moss_codec_decode",
                    startedAtNs = decodeStartedAtNs,
                    durationNs = durationNs,
                    threadName = Thread.currentThread().name,
                    sentenceIndex = 0,
                    frameIndex = firstFrameIndex,
                    inputFrames = take,
                    outputSamples = decoded?.samples,
                ),
            )
            if (decoded == null) return
            emittedChunks += 1
            emittedSamples += decoded.samples
            consumerStopped = !callback.onPcm(
                TalosVoiceEngineFrame(
                    backend = backend,
                    profileId = request.profileId,
                    locale = RESOLVED_LOCALE,
                    sentenceIndex = 0,
                    firstFrameIndex = firstFrameIndex,
                    frameCount = take,
                    sampleRate = runtime.sampleRate,
                    channels = runtime.channels,
                    pcmFloat = decoded.interleavedPcm,
                ),
            )
        }

        val generated: List<IntArray>
        val runtimeCancelled: Boolean
        try {
            val outcome = runtime.generateWithReference(
                textTokenIds = textTokenIds,
                promptAudioCodes = payload.promptAudioCodes,
                maxFrames = request.maxFramesPerSentence ?: DEFAULT_MAX_FRAMES,
                seed = request.seed,
                isCancelled = { consumerStopped || cancellation.isCancelled() },
                onFrame = { frame ->
                    if (!consumerStopped && !cancellation.isCancelled()) {
                        pending += frame.copyOf()
                        queueHighWatermarkFrames = max(queueHighWatermarkFrames, pending.size)
                        decodePending(force = false)
                    }
                },
            )
            generated = outcome.first
            runtimeCancelled = outcome.second
            decodePending(force = true)
        } finally {
            codec.close()
        }
        val terminal = if (runtimeCancelled || consumerStopped || cancellation.isCancelled()) {
            TalosVoiceEngineTerminal.CANCELLED
        } else {
            TalosVoiceEngineTerminal.DONE
        }
        return TalosVoiceEngineResult(
            backend = backend,
            profileId = request.profileId,
            locale = RESOLVED_LOCALE,
            terminal = terminal,
            sentenceCount = 1,
            generatedFrames = generated.size,
            emittedSamples = emittedSamples,
            elapsedNs = System.nanoTime() - startedAtNs,
            producerBlockedNs = 0L,
            decoderNs = decoderNs,
            queueHighWatermarkFrames = queueHighWatermarkFrames,
        )
    }

    companion object {
        private const val DEFAULT_MAX_FRAMES = 375
        private const val REGULAR_DECODE_FRAMES = 8
        private const val RESOLVED_LOCALE = "und"
    }
}
