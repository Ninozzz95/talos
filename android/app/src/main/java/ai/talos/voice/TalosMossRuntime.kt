package ai.talos.voice

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OnnxTensorLike
import ai.onnxruntime.OnnxValue
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.util.Log
import java.io.Closeable
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.IntBuffer
import kotlin.math.min

/**
 * Blueprint §15: "port the official Android example, then productionize it."
 * The graph sequence, input-row construction, and local-fixed-frame sampling
 * here are the SAME algorithm as the Phase 0 research engine
 * (`ai.talos.voice.research.TalosMossDemoEngine`, commit `1efd233e`, which is
 * itself a verbatim port of OpenMOSS's official `MossOnnxDemoEngine.kt`) —
 * this is not a rewrite of the math. What changes for Fase 1:
 *
 *  - §15.4 separates **model lifetime** (the four ORT sessions, opened once
 *    by [open] and closed once by [close]) from **request lifetime**
 *    ([TalosMossGeneration]: KV state, sampling history, the seen-token
 *    masks — created per call, always closed in a `finally`, closing it
 *    never touches the sessions).
 *  - A generation can be **cancelled** between frame steps
 *    (`isCancelled` is polled once per decode iteration) without closing the
 *    sessions — the state this leaves behind is exactly what §14 says a
 *    cancel must not disturb: the model stays loaded, only the in-flight
 *    generation is abandoned.
 *  - Text arrives as `textTokenIds` from [TalosVoiceTokenizer], not
 *    hardcoded demo ids — the P0 tokenization gap Phase 0 explicitly left
 *    open (blueprint §9) is closed by the caller composing tokenizer +
 *    runtime, not by this class knowing about text.
 *
 * Ownership across threads is [TalosVoiceHost]'s job, not this class's: every
 * method here assumes single-threaded, non-reentrant use by its caller.
 */
internal class TalosMossRuntime private constructor(
    private val env: OrtEnvironment,
    private val sessionOptions: OrtSession.SessionOptions,
    private val prefillSession: OrtSession,
    private val decodeSession: OrtSession,
    private val localFixedFrameSession: OrtSession,
    private val codecDecodeSession: OrtSession,
    private val codecDecodeStepSession: OrtSession,
    private val codecEncodeSession: OrtSession,
    private val manifest: TalosMossManifest,
    private val ttsMeta: TalosMossTtsMeta,
    private val codecMeta: TalosMossCodecMeta,
    val sampleRate: Int,
) : Closeable {

    /** How many channels [openCodecStream] and [decodeAudioTokens] both produce - from the codec metadata, not assumed. */
    val channels: Int get() = codecMeta.channels

    /**
     * A fresh incremental codec decoder for one utterance (Fase 2 streaming
     * playback). The caller owns it: reset it between utterances that reuse
     * this runtime, close it when done. Independent of [decodeAudioTokens] -
     * both read the same `audio_codes`, through different graphs.
     */
    fun openCodecStream(): TalosMossCodecStream = TalosMossCodecStream(env, codecDecodeStepSession, codecMeta)

    fun synthesizePcm16ToFile(
        textTokenIds: IntArray,
        outputFile: File,
        voice: String,
        maxFrames: Int = manifest.generationDefaults.maxNewFrames,
        seed: Long = System.nanoTime(),
        isCancelled: () -> Boolean = { false },
    ): TalosMossSynthesisResult {
        val startedAt = System.currentTimeMillis()
        val (audioTokens, cancelled) = generateAudioTokens(textTokenIds, voice, maxFrames, seed, isCancelled)
        val pcm = if (audioTokens.isEmpty()) FloatArray(0) else decodeAudioTokens(audioTokens)
        writePcm16MonoWav(pcm, sampleRate, outputFile)
        return TalosMossSynthesisResult(
            outputFile = outputFile,
            generatedFrames = audioTokens.size,
            sampleRate = sampleRate,
            durationMs = (pcm.size.toDouble() / sampleRate * 1000.0).toLong(),
            elapsedMs = System.currentTimeMillis() - startedAt,
            cancelled = cancelled,
        )
    }

    /**
     * The TTS half only - prefill through autoregressive decode, no codec
     * involved. [TalosMossCodecStream] (Fase 2) and [decodeAudioTokens]
     * (Fase 1, whole-utterance) are two different ways to turn the same
     * token frames into audio; this is where both start. `onFrame` fires
     * once per generated frame, in order, before the next one starts -
     * mirrors upstream `ort_cpu_runtime.py`'s own `on_frame` hook, which is
     * how streaming playback there feeds its codec ring buffer.
     */
    fun generateAudioTokens(
        textTokenIds: IntArray,
        voice: String,
        maxFrames: Int = manifest.generationDefaults.maxNewFrames,
        seed: Long = System.nanoTime(),
        isCancelled: () -> Boolean = { false },
        onFrame: (IntArray) -> Unit = {},
    ): Pair<List<IntArray>, Boolean> = generateAudioTokensWithReference(
        textTokenIds, selectBuiltinVoicePromptAudioCodes(voice), maxFrames, seed, isCancelled, onFrame,
    )

    /**
     * Same as [generateAudioTokens], for an enrolled personal voice instead
     * of a builtin one - `promptAudioCodes` is exactly the shape
     * [TalosMossManifest.BuiltinVoice.promptAudioCodes] already has,
     * produced by [encodeReferenceAudio] instead of read from the manifest.
     */
    fun generateAudioTokensWithReference(
        textTokenIds: IntArray,
        promptAudioCodes: List<IntArray>,
        maxFrames: Int = manifest.generationDefaults.maxNewFrames,
        seed: Long = System.nanoTime(),
        isCancelled: () -> Boolean = { false },
        onFrame: (IntArray) -> Unit = {},
    ): Pair<List<IntArray>, Boolean> {
        require(textTokenIds.isNotEmpty()) { "textTokenIds must not be empty" }
        require(promptAudioCodes.isNotEmpty()) { "promptAudioCodes must not be empty" }
        val inputRows = buildInputRows(textTokenIds, promptAudioCodes)
        val generation = TalosMossGeneration(random = java.util.Random(seed), nVq = manifest.ttsConfig.nVq)
        try {
            runPrefill(inputRows, generation)
            val cancelled = runDecode(generation, maxFrames, isCancelled, onFrame)
            return Pair(generation.audioTokens, cancelled)
        } finally {
            generation.close()
        }
    }

    /**
     * Blueprint §15.1: `codecEncodeSession`, enrollment only. Turns a
     * captured reference recording into `prompt_audio_codes` - the same
     * shape [TalosMossManifest.BuiltinVoice.promptAudioCodes] already has,
     * so the result plugs directly into [generateAudioTokensWithReference].
     *
     * §11.8: mono is duplicated into every codec channel (not averaged, not
     * left mono) - the exact conversion `ort_cpu_runtime.py`'s own
     * `_load_reference_audio` does for a mono source against a stereo
     * codec, read from that source rather than guessed.
     */
    fun encodeReferenceAudio(monoPcm: FloatArray, capturedSampleRate: Int): List<IntArray> {
        require(monoPcm.isNotEmpty()) { "monoPcm must not be empty" }
        require(capturedSampleRate == sampleRate) {
            "encodeReferenceAudio expects audio already at the codec's sample rate ($sampleRate), got $capturedSampleRate - resample before calling this"
        }
        Log.i("TalosMossRuntime", "encodeReferenceAudio(): inizio, ${monoPcm.size} campioni (${monoPcm.size.toDouble() / capturedSampleRate}s)")
        val channels = codecMeta.channels
        // "waveform" is (1, channels, samples) - channel-major, matching decode's own audio tensor layout.
        val channelMajor = FloatArray(channels * monoPcm.size)
        for (c in 0 until channels) {
            for (i in monoPcm.indices) channelMajor[c * monoPcm.size + i] = monoPcm[i]
        }

        OnnxTensor.createTensor(env, FloatBuffer.wrap(channelMajor), longArrayOf(1, channels.toLong(), monoPcm.size.toLong()))
            .use { waveformTensor ->
                OnnxTensor.createTensor(env, IntBuffer.wrap(intArrayOf(monoPcm.size)), longArrayOf(1)).use { lengthTensor ->
                    Log.i("TalosMossRuntime", "encodeReferenceAudio(): tensori pronti, chiamo codecEncodeSession.run()")
                    codecEncodeSession.run(
                        mapOf("waveform" to waveformTensor, "input_lengths" to lengthTensor),
                    ).use { outputs ->
                        Log.i("TalosMossRuntime", "encodeReferenceAudio(): run() tornata")
                        val codeLength = outputs.requiredTensor("audio_code_lengths").scalarInt()
                        val numQuantizers = codecMeta.numQuantizers
                        val codesBuffer = outputs.requiredTensor("audio_codes").intBuffer.duplicate().also { it.rewind() }
                        val flat = IntArray(codesBuffer.remaining())
                        codesBuffer.get(flat)
                        return List(codeLength) { frameIndex ->
                            IntArray(numQuantizers) { q -> flat[frameIndex * numQuantizers + q] }
                        }
                    }
                }
            }
    }

    override fun close() {
        codecEncodeSession.close()
        codecDecodeStepSession.close()
        codecDecodeSession.close()
        localFixedFrameSession.close()
        decodeSession.close()
        prefillSession.close()
        sessionOptions.close()
    }

    private fun buildInputRows(textTokenIds: IntArray, promptAudioCodes: List<IntArray>): InputRows {
        val cfg = manifest.ttsConfig
        val rowWidth = cfg.nVq + 1
        val prefixTokens = manifest.promptTemplates.userPromptPrefixTokenIds + cfg.audioStartTokenId
        val suffixTokens = intArrayOf(cfg.audioEndTokenId) +
            manifest.promptTemplates.userPromptAfterReferenceTokenIds +
            textTokenIds +
            manifest.promptTemplates.assistantPromptPrefixTokenIds +
            intArrayOf(cfg.audioStartTokenId)
        val rows = ArrayList<IntArray>()
        rows += textRows(prefixTokens, cfg, rowWidth)
        rows += audioRows(promptAudioCodes, cfg, rowWidth)
        rows += textRows(suffixTokens, cfg, rowWidth)
        return InputRows(rows.toTypedArray(), IntArray(rows.size) { 1 })
    }

    private fun textRows(tokens: IntArray, cfg: TalosMossManifest.TtsConfig, rowWidth: Int): List<IntArray> =
        tokens.map { token -> IntArray(rowWidth) { index -> if (index == 0) token else cfg.audioPadTokenId } }

    private fun audioRows(
        audioCodes: List<IntArray>,
        cfg: TalosMossManifest.TtsConfig,
        rowWidth: Int,
    ): List<IntArray> = audioCodes.map { codeRow ->
        IntArray(rowWidth) { index ->
            when {
                index == 0 -> cfg.audioUserSlotTokenId
                index - 1 < min(codeRow.size, cfg.nVq) -> codeRow[index - 1]
                else -> cfg.audioPadTokenId
            }
        }
    }

    private fun selectBuiltinVoicePromptAudioCodes(voice: String): List<IntArray> {
        val selected = manifest.builtinVoices.firstOrNull { it.voice == voice && it.promptAudioCodes.isNotEmpty() }
            ?: manifest.builtinVoices.firstOrNull { it.promptAudioCodes.isNotEmpty() }
        return selected?.promptAudioCodes ?: error("No builtin voice with prompt_audio_codes in the loaded manifest")
    }

    private fun runPrefill(inputRows: InputRows, generation: TalosMossGeneration) {
        val seqLen = inputRows.inputIds.size
        val rowWidth = inputRows.inputIds[0].size
        val inputIdsFlat = IntArray(seqLen * rowWidth)
        var offset = 0
        for (row in inputRows.inputIds) {
            for (value in row) inputIdsFlat[offset++] = value
        }
        OnnxTensor.createTensor(env, IntBuffer.wrap(inputIdsFlat), longArrayOf(1, seqLen.toLong(), rowWidth.toLong()))
            .use { inputIdsTensor ->
                OnnxTensor.createTensor(env, IntBuffer.wrap(inputRows.attentionMask), longArrayOf(1, seqLen.toLong()))
                    .use { maskTensor ->
                        val outputs = prefillSession.run(
                            mapOf("input_ids" to inputIdsTensor, "attention_mask" to maskTensor),
                        )
                        generation.globalHidden = extractLastHiddenTensor(outputs.requiredTensor("global_hidden"))
                        generation.pastValidLengths = seqLen
                        generation.pastResult = outputs
                    }
            }
    }

    /** Returns true if this generation was cancelled before reaching `should_continue == false` or `maxFrames`. */
    private fun runDecode(
        generation: TalosMossGeneration,
        maxFrames: Int,
        isCancelled: () -> Boolean,
        onFrame: (IntArray) -> Unit = {},
    ): Boolean {
        val cfg = manifest.ttsConfig
        val rowWidth = cfg.nVq + 1
        val cappedMaxFrames = maxFrames.coerceAtMost(manifest.generationDefaults.maxNewFrames)
        val decodePastInputNames = ttsMeta.decodeInputNames.drop(2)
        val decodePresentOutputNames = ttsMeta.decodeOutputNames.drop(1)

        for (step in 0 until cappedMaxFrames) {
            if (isCancelled()) return true
            val frameResult = runLocalFixedSampledFrame(generation)
            if (!frameResult.shouldContinue) break
            val audioRow = IntArray(rowWidth) { index ->
                if (index == 0) cfg.audioAssistantSlotTokenId else cfg.audioPadTokenId
            }
            for (quantizer in 0 until cfg.nVq) {
                val token = frameResult.frame[quantizer]
                audioRow[quantizer + 1] = token
                generation.previousTokenSets[quantizer].add(token)
            }
            generation.audioTokens += frameResult.frame
            onFrame(frameResult.frame)

            OnnxTensor.createTensor(env, IntBuffer.wrap(audioRow), longArrayOf(1, 1, rowWidth.toLong())).use { inputTensor ->
                OnnxTensor.createTensor(env, IntBuffer.wrap(intArrayOf(generation.pastValidLengths)), longArrayOf(1)).use { pastTensor ->
                    val feeds = linkedMapOf<String, OnnxTensorLike>(
                        "input_ids" to inputTensor,
                        "past_valid_lengths" to pastTensor,
                    )
                    val previousPastResult = generation.pastResult ?: error("Missing decode KV cache")
                    for (index in decodePastInputNames.indices) {
                        feeds[decodePastInputNames[index]] = previousPastResult.requiredTensor(decodePresentOutputNames[index])
                    }
                    val outputs = decodeSession.run(feeds)
                    val nextGlobalHidden = extractLastHiddenTensor(outputs.requiredTensor("global_hidden"))
                    generation.globalHidden?.close()
                    previousPastResult.close()
                    generation.pastResult = outputs
                    generation.globalHidden = nextGlobalHidden
                    generation.pastValidLengths += 1
                }
            }
        }
        return false
    }

    private fun runLocalFixedSampledFrame(generation: TalosMossGeneration): LocalFrameResult {
        val cfg = manifest.ttsConfig
        val globalHidden = generation.globalHidden ?: error("No prefill/decode result to sample from")
        val audioCodebookSize = cfg.audioCodebookSizes.firstOrNull() ?: 1024
        val seenMask = IntArray(cfg.nVq * audioCodebookSize)
        for (channelIndex in generation.previousTokenSets.indices) {
            val channelOffset = channelIndex * audioCodebookSize
            for (tokenId in generation.previousTokenSets[channelIndex]) {
                if (tokenId in 0 until audioCodebookSize) seenMask[channelOffset + tokenId] = 1
            }
        }
        val assistantRandom = floatArrayOf(generation.random.nextDouble().coerceIn(1e-6, 1.0 - 1e-6).toFloat())
        val audioRandom = FloatArray(cfg.nVq) { generation.random.nextDouble().coerceIn(1e-6, 1.0 - 1e-6).toFloat() }

        OnnxTensor.createTensor(env, IntBuffer.wrap(seenMask), longArrayOf(1, cfg.nVq.toLong(), audioCodebookSize.toLong())).use { seenTensor ->
            OnnxTensor.createTensor(env, FloatBuffer.wrap(assistantRandom), longArrayOf(1)).use { assistantTensor ->
                OnnxTensor.createTensor(env, FloatBuffer.wrap(audioRandom), longArrayOf(1, cfg.nVq.toLong())).use { audioTensor ->
                    localFixedFrameSession.run(
                        mapOf(
                            "global_hidden" to globalHidden,
                            "repetition_seen_mask" to seenTensor,
                            "assistant_random_u" to assistantTensor,
                            "audio_random_u" to audioTensor,
                        ),
                    ).use {
                        return LocalFrameResult(
                            shouldContinue = it.requiredTensor("should_continue").scalarInt() > 0,
                            frame = it.requiredTensor("frame_token_ids").intArrayValue(),
                        )
                    }
                }
            }
        }
    }

    private fun decodeAudioTokens(audioTokens: List<IntArray>): FloatArray {
        val numFrames = audioTokens.size
        val numQuantizers = manifest.ttsConfig.nVq
        val audioCodesFlat = IntArray(numFrames * numQuantizers)
        var offset = 0
        for (frame in audioTokens) {
            for (quantizer in 0 until numQuantizers) audioCodesFlat[offset++] = frame[quantizer]
        }
        OnnxTensor.createTensor(env, IntBuffer.wrap(audioCodesFlat), longArrayOf(1, numFrames.toLong(), numQuantizers.toLong()))
            .use { codesTensor ->
                OnnxTensor.createTensor(env, IntBuffer.wrap(intArrayOf(numFrames)), longArrayOf(1)).use { lengthsTensor ->
                    codecDecodeSession.run(
                        mapOf("audio_codes" to codesTensor, "audio_code_lengths" to lengthsTensor),
                    ).use { outputs ->
                        @Suppress("UNCHECKED_CAST")
                        val audio = outputs.requiredTensor("audio").value as Array<Array<FloatArray>>
                        val channels = audio[0].toList()
                        val reportedLength = outputs.requiredTensor("audio_lengths").scalarInt()
                        val length = min(reportedLength, channels.minOfOrNull { it.size } ?: 0)
                        return FloatArray(length) { sampleIndex ->
                            channels.sumOf { channel -> channel[sampleIndex].toDouble() }.toFloat() / channels.size
                        }
                    }
                }
            }
    }

    private data class InputRows(val inputIds: Array<IntArray>, val attentionMask: IntArray)
    private data class LocalFrameResult(val shouldContinue: Boolean, val frame: IntArray)

    companion object {
        /**
         * Opens the four MOSS graphs from the manifest under `modelRoot`. Model
         * lifetime starts here; nothing about a specific request is touched.
         */
        fun open(modelRoot: File, cpuThreads: Int): TalosMossRuntime {
            val env = OrtEnvironment.getEnvironment()
            val manifestPath = TalosMossManifest.resolveManifestPath(modelRoot)
            val manifestDir = manifestPath.parentFile ?: modelRoot
            val manifest = TalosMossManifest.fromJson(TalosMossManifest.readJson(manifestPath))
            val ttsMetaPath = TalosMossManifest.resolveManifestRelativePath(manifestDir, manifest.modelFiles.ttsMeta)
            val codecMetaPath = TalosMossManifest.resolveManifestRelativePath(manifestDir, manifest.modelFiles.codecMeta)
            val ttsMeta = TalosMossTtsMeta.fromJson(TalosMossManifest.readJson(ttsMetaPath))
            val codecMeta = TalosMossCodecMeta.fromJson(TalosMossManifest.readJson(codecMetaPath))
            val ttsDir = ttsMetaPath.parentFile ?: manifestDir
            val codecDir = codecMetaPath.parentFile ?: manifestDir

            val sessionOptions = OrtSession.SessionOptions().apply {
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                setIntraOpNumThreads(cpuThreads.coerceAtLeast(1))
                setInterOpNumThreads(1)
                // ⭐⭐⭐ Owner 22/8: misurato sul Pad, non ipotizzato -
                // `lowmemorykiller` ha classificato ai.talos con
                // "process memory is leaking" a ~5,8 GB RSS durante
                // buildEnrollmentProfile(). SEI sessioni ONNX aperte insieme
                // (una sola, codecEncodeSession, serve davvero per quel
                // percorso), ciascuna col proprio arena allocator - un
                // arena CRESCE e in pratica non restituisce mai la memoria
                // al sistema operativo fra una Run() e l'altra, il pattern
                // esatto che un classificatore di leak per crescita
                // continua scambierebbe per una perdita vera. La doc
                // ufficiale ONNX Runtime lo conferma esplicitamente: per
                // modelli piccoli come questi, disattivare l'arena "dà un
                // risparmio di memoria significativo" - a un costo di
                // latenza che qui non è la variabile che conta.
                // ⛔ NON RISOLVE da sola lo spreco delle cinque sessioni
                // inutili per l'encode-only - quella è un tetto più grande
                // (i pesi dei modelli restano residenti comunque), lasciato
                // per un prossimo passo, non dimenticato.
                setCPUArenaAllocator(false)
            }
            fun openSession(file: File): OrtSession {
                require(file.isFile) { "Missing ONNX file: ${file.absolutePath}" }
                return env.createSession(file.absolutePath, sessionOptions)
            }
            // ⭐⭐⭐ Owner 22/8: log temporanei ma non usa-e-getta - il crash
            // OOM riprodotto due volte non ha detto DA SOLO se la crescita
            // sta nell'apertura di queste sei sessioni o nella Run() di
            // encodeReferenceAudio() più sotto. Restano nel codice: la
            // prossima volta che qualcosa si gonfia qui, questi timestamp
            // sono la prima cosa da guardare, non un'ipotesi.
            Log.i("TalosMossRuntime", "open(): inizio apertura sessioni ONNX")
            val prefillSession = openSession(File(ttsDir, ttsMeta.prefillFile))
            Log.i("TalosMossRuntime", "open(): prefillSession aperta")
            val decodeSession = openSession(File(ttsDir, ttsMeta.decodeStepFile))
            Log.i("TalosMossRuntime", "open(): decodeSession aperta")
            val localFixedFrameSession = openSession(File(ttsDir, ttsMeta.localFixedSampledFrameFile))
            Log.i("TalosMossRuntime", "open(): localFixedFrameSession aperta")
            val codecDecodeSession = openSession(File(codecDir, codecMeta.decodeFullFile))
            Log.i("TalosMossRuntime", "open(): codecDecodeSession aperta")
            val codecDecodeStepSession = openSession(File(codecDir, codecMeta.decodeStepFile))
            Log.i("TalosMossRuntime", "open(): codecDecodeStepSession aperta")
            val codecEncodeSession = openSession(File(codecDir, codecMeta.encodeFile))
            Log.i("TalosMossRuntime", "open(): codecEncodeSession aperta, tutte e sei pronte")

            return TalosMossRuntime(
                env = env,
                sessionOptions = sessionOptions,
                prefillSession = prefillSession,
                decodeSession = decodeSession,
                localFixedFrameSession = localFixedFrameSession,
                codecDecodeSession = codecDecodeSession,
                codecDecodeStepSession = codecDecodeStepSession,
                codecEncodeSession = codecEncodeSession,
                manifest = manifest,
                ttsMeta = ttsMeta,
                codecMeta = codecMeta,
                sampleRate = codecMeta.sampleRate,
            )
        }

        private fun extractLastHiddenTensor(tensor: OnnxTensor): OnnxTensor {
            val shape = tensor.info.shape
            val hidden = when (shape.size) {
                2 -> @Suppress("UNCHECKED_CAST") (tensor.value as Array<FloatArray>)[0]
                3 -> {
                    @Suppress("UNCHECKED_CAST")
                    val batch = (tensor.value as Array<Array<FloatArray>>)[0]
                    batch[batch.size - 1]
                }
                else -> error("Unexpected global_hidden rank: ${shape.size}")
            }
            return OnnxTensor.createTensor(OrtEnvironment.getEnvironment(), FloatBuffer.wrap(hidden.copyOf()), longArrayOf(1, hidden.size.toLong()))
        }

        private fun flattenIntTensorValue(raw: Any?): IntArray {
            val values = ArrayList<Int>()
            fun append(value: Any?) {
                when (value) {
                    is Int -> values += value
                    is Long -> values += value.toInt()
                    is Short -> values += value.toInt()
                    is Byte -> values += value.toInt()
                    is IntArray -> values += value.toList()
                    is LongArray -> value.forEach { values += it.toInt() }
                    is ShortArray -> value.forEach { values += it.toInt() }
                    is ByteArray -> value.forEach { values += it.toInt() }
                    is Array<*> -> value.forEach { append(it) }
                    null -> Unit
                    else -> error("Unsupported int tensor value: ${value.javaClass}")
                }
            }
            append(raw)
            return values.toIntArray()
        }

        private fun OrtSession.Result.requiredValue(name: String): OnnxValue =
            get(name).orElseThrow { IllegalStateException("Missing ONNX output: $name") }

        private fun OrtSession.Result.requiredTensor(name: String): OnnxTensor = requiredValue(name) as OnnxTensor

        private fun OnnxTensor.scalarInt(): Int = flattenIntTensorValue(value).firstOrNull() ?: error("Scalar int tensor is empty")

        private fun OnnxTensor.intArrayValue(): IntArray = flattenIntTensorValue(value)

        /**
         * Same 44-byte PCM16 mono WAV header Phase 0 wrote. Streaming output
         * (§16-17, no full-file materialization) is Phase 2 — Fase 1's exit
         * gate only asks for "PCM16 output to a file for tests", which this is.
         */
        private fun writePcm16MonoWav(audioData: FloatArray, sampleRate: Int, outputFile: File) {
            outputFile.parentFile?.mkdirs()
            val channels = 1
            val dataSize = audioData.size * 2
            val fileSize = 44 + dataSize
            val buffer = ByteBuffer.allocate(fileSize).order(ByteOrder.LITTLE_ENDIAN)
            buffer.put("RIFF".toByteArray(Charsets.US_ASCII))
            buffer.putInt(fileSize - 8)
            buffer.put("WAVE".toByteArray(Charsets.US_ASCII))
            buffer.put("fmt ".toByteArray(Charsets.US_ASCII))
            buffer.putInt(16)
            buffer.putShort(1.toShort())
            buffer.putShort(channels.toShort())
            buffer.putInt(sampleRate)
            buffer.putInt(sampleRate * channels * 2)
            buffer.putShort((channels * 2).toShort())
            buffer.putShort(16.toShort())
            buffer.put("data".toByteArray(Charsets.US_ASCII))
            buffer.putInt(dataSize)
            for (sample in audioData) {
                buffer.putShort((sample.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
            }
            outputFile.writeBytes(buffer.array())
        }
    }
}

/**
 * Request-lifetime state (blueprint §15.4): everything a single synthesis
 * call mutates. Never touches the model sessions — closing a generation
 * (cancelled or finished) only ever closes tensors this request itself
 * allocated.
 */
private class TalosMossGeneration(val random: java.util.Random, nVq: Int) : Closeable {
    var pastValidLengths: Int = 0
    var globalHidden: OnnxTensor? = null
    var pastResult: OrtSession.Result? = null
    val previousTokenSets: Array<HashSet<Int>> = Array(nVq) { HashSet() }
    val audioTokens: MutableList<IntArray> = ArrayList()

    override fun close() {
        globalHidden?.close()
        pastResult?.close()
    }
}

internal data class TalosMossSynthesisResult(
    val outputFile: File,
    val generatedFrames: Int,
    val sampleRate: Int,
    val durationMs: Long,
    val elapsedMs: Long,
    val cancelled: Boolean,
)
