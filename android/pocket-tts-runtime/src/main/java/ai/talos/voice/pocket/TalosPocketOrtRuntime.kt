package ai.talos.voice.pocket

import org.json.JSONObject
import java.io.File
import java.io.Closeable
import java.util.Random
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.ceil
import kotlin.math.sqrt


class TalosPocketOrtRuntime private constructor(
    private val bundle: TalosPocketBundle,
    private val tokenizer: TalosPocketTokenizerContract,
    private val bosBeforeVoice: TalosPocketFloatTensor,
    private val graphs: TalosPocketOrtGraphs,
    private val config: TalosPocketConfig,
    private val resampler: TalosPocketResampler,
) : Closeable {
    private val busy = AtomicBoolean(false)
    private val closed = AtomicBoolean(false)
    private val runCounter = AtomicLong(0)
    private val planner = TalosPocketTextPlanner(
        tokenizer = tokenizer,
        maxTokens = bundle.maxTokenPerChunk,
        padWithSpacesForShortInputs = bundle.padWithSpacesForShortInputs,
        removeSemicolons = bundle.removeSemicolons,
        recommendedFramesAfterEos = bundle.modelRecommendedFramesAfterEos,
        sacrificialPrefix = TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX.takeIf { config.prependOnsetPrefix },
    )
    private val flowStateBytes = stateBytes(bundle.flowStates)
    private val mimiStateBytes = stateBytes(bundle.mimiStates)

    init {
        require(bosBeforeVoice.shape.contentEquals(longArrayOf(1, 1, bundle.conditioningDim.toLong()))) {
            "Pocket BOS shape must be [1, 1, ${bundle.conditioningDim}]"
        }
        require(bosBeforeVoice.values.size == bundle.conditioningDim) { "Pocket BOS value count is invalid" }
        require(bosBeforeVoice.values.all(Float::isFinite)) { "Pocket BOS contains non-finite values" }
        validateGraphContracts()
    }

    fun encodeReference(
        pcmFloatMono: FloatArray,
        sampleRate: Int,
        callback: TalosPocketCallback? = null,
    ): TalosPocketConditioning = exclusive {
        val resampleStartedAtNs = System.nanoTime()
        val normalizedPcm = resampler.resampleMono(pcmFloatMono, sampleRate, bundle.sampleRate)
        callback?.onStage(
            metric(
                stage = "reference_resample",
                startedAtNs = resampleStartedAtNs,
                durationNs = System.nanoTime() - resampleStartedAtNs,
                inputFrames = pcmFloatMono.size,
                outputSamples = normalizedPcm.size,
            ),
        )
        require(normalizedPcm.size in bundle.samplesPerFrame..(bundle.sampleRate * 20)) {
            "Pocket reference duration must be in [80 ms, 20 s]"
        }
        val output = runStandalone(
            session = graphs.mimiEncoder,
            stage = "mimi_encoder",
            inputs = mapOf(
                "audio" to graphs.tensors.float32(
                    longArrayOf(1, 1, normalizedPcm.size.toLong()),
                    normalizedPcm,
                ),
            ),
            callback = callback,
            sentenceIndex = null,
            frameIndex = null,
            stateBytes = 0L,
        ) { result -> result.floatValues("latents") }
        require(output.shape.size == 3 && output.shape[0] == 1L && output.shape[1] in 1..256 && output.shape[2] == bundle.conditioningDim.toLong()) {
            "Pocket Mimi encoder returned an invalid conditioning shape: ${output.shape.contentToString()}"
        }
        TalosPocketConditioning.create(output.shape, output.values)
    }

    fun synthesize(
        source: String,
        conditioning: TalosPocketConditioning,
        maxFramesPerSentence: Int? = null,
        seed: Long,
        cancellation: TalosPocketCancellation,
        callback: TalosPocketCallback,
    ): TalosPocketSynthesisResult = exclusive {
        require(maxFramesPerSentence == null || maxFramesPerSentence in 1..config.hardMaxFramesPerSentence) {
            "maxFramesPerSentence exceeds the configured hard limit"
        }
        val startedAtNs = System.nanoTime()
        val planStartedAtNs = System.nanoTime()
        val sentences = planner.plan(source)
        callback.onStage(
            metric(
                stage = "tokenize_and_plan",
                startedAtNs = planStartedAtNs,
                durationNs = System.nanoTime() - planStartedAtNs,
            ),
        )
        val random = Random(seed)
        var generatedFrames = 0
        var emittedSamples = 0
        var onsetDiscardedSamples = 0
        var producerBlockedNs = 0L
        var decoderNs = 0L
        var highWatermark = 0
        var terminal = TalosPocketPipelineTerminal.DONE

        val baseState = TalosPocketOrtStateChain.initialized(bundle.flowStates, graphs.tensors)
        try {
            val voiceValues = concatenateVoice(conditioning)
            withOwnedInputs(
                mapOf(
                    "sequence" to graphs.tensors.float32(longArrayOf(1, 0, bundle.latentDim.toLong()), FloatArray(0)),
                    "text_embeddings" to graphs.tensors.float32(
                        longArrayOf(1, 1L + conditioning.shape[1], bundle.conditioningDim.toLong()),
                        voiceValues,
                    ),
                ),
            ) { inputs ->
                advanceState(
                    chain = baseState,
                    session = graphs.flowMain,
                    stage = "flow_main_voice_prefill",
                    inputs = inputs,
                    callback = callback,
                    sentenceIndex = null,
                    frameIndex = null,
                    stateBytes = flowStateBytes,
                )
            }

            sentenceLoop@ for (sentence in sentences) {
                if (cancellation.isCancelled()) {
                    terminal = TalosPocketPipelineTerminal.CANCELLED
                    break
                }
                val textEmbeddings = runStandalone(
                    session = graphs.textConditioner,
                    stage = "text_conditioner",
                    inputs = mapOf(
                        "token_ids" to graphs.tensors.int64(
                            longArrayOf(1, sentence.tokenIds.size.toLong()),
                            LongArray(sentence.tokenIds.size) { sentence.tokenIds[it].toLong() },
                        ),
                    ),
                    callback = callback,
                    sentenceIndex = sentence.index,
                    frameIndex = null,
                    stateBytes = 0L,
                ) { result -> result.floatValues("embeddings") }
                require(textEmbeddings.shape.contentEquals(longArrayOf(1, sentence.tokenIds.size.toLong(), bundle.conditioningDim.toLong()))) {
                    "Pocket text conditioner returned an invalid shape"
                }

                val sentenceState = TalosPocketOrtStateChain.borrowing(bundle.flowStates, baseState.borrowedState())
                try {
                    withOwnedInputs(
                        mapOf(
                            "sequence" to graphs.tensors.float32(longArrayOf(1, 0, bundle.latentDim.toLong()), FloatArray(0)),
                            "text_embeddings" to graphs.tensors.float32(textEmbeddings.shape, textEmbeddings.values),
                        ),
                    ) { inputs ->
                        advanceState(
                            chain = sentenceState,
                            session = graphs.flowMain,
                            stage = "flow_main_text_prefill",
                            inputs = inputs,
                            callback = callback,
                            sentenceIndex = sentence.index,
                            frameIndex = null,
                            stateBytes = flowStateBytes,
                        )
                    }

                    val decoderState = TalosPocketOrtStateChain.initialized(bundle.mimiStates, graphs.tensors)
                    try {
                        var decodedFirstFrame = 0
                        var decodedBatchFrames = 0
                        var onsetMetricEmitted = false
                        val onsetStabilizer = if (config.stabilizeOnset) {
                            TalosPocketOnsetStabilizer(TalosPocketOnsetConfig(bundle.sampleRate))
                        } else {
                            null
                        }
                        fun emitOnsetMetric(
                            onset: TalosPocketOnsetResult,
                            startedAtNs: Long,
                            frameIndex: Int,
                            outputSamples: Int,
                        ) {
                            onsetDiscardedSamples += onset.discardedSamples
                            callback.onStage(
                                metric(
                                    stage = "onset_stabilized",
                                    startedAtNs = startedAtNs,
                                    durationNs = System.nanoTime() - startedAtNs,
                                    sentenceIndex = sentence.index,
                                    frameIndex = frameIndex,
                                    outputSamples = outputSamples,
                                    onsetDiscardedSamples = onset.discardedSamples,
                                    onsetLeadingSilenceSamples = onset.leadingSilenceSamples,
                                    onsetGapStartSamples = onset.gapStartSamples,
                                    onsetGapEndSamples = onset.gapEndSamples,
                                    onsetResumeStartSamples = onset.resumeStartSamples,
                                    onsetAnalysisWindowSamples = onset.analysisWindowSamples,
                                    onsetBoundaryThreshold = onset.boundaryThreshold,
                                    onsetBoundarySource = onset.boundarySource,
                                ),
                            )
                            onsetMetricEmitted = true
                        }
                        val pipeline = TalosPocketFramePipeline(
                            capacityFrames = config.queueCapacityFrames,
                            firstDecodeFrames = config.firstDecodeFrames,
                            regularDecodeFrames = config.regularDecodeFrames,
                            cancellation = cancellation,
                        )
                        val frameLimit = maxFramesPerSentence ?: estimateFrameLimit(sentence.tokenIds.size)
                        val pipelineMetrics = pipeline.run(
                            produce = { emit ->
                                generateSentenceLatents(
                                    sentence = sentence,
                                    state = sentenceState,
                                    frameLimit = frameLimit,
                                    random = random,
                                    cancellation = cancellation,
                                    callback = callback,
                                    emit = emit,
                                )
                            },
                            decode = { batch ->
                                decodedBatchFrames = batch.size
                                val latents = FloatArray(batch.size * bundle.latentDim)
                                batch.forEachIndexed { index, frame ->
                                    require(frame.size == bundle.latentDim) { "Pocket latent frame has an invalid width" }
                                    frame.copyInto(latents, index * bundle.latentDim)
                                }
                                val pcm = withOwnedInputs(
                                    mapOf(
                                        "latent" to graphs.tensors.float32(
                                            longArrayOf(1, batch.size.toLong(), bundle.latentDim.toLong()),
                                            latents,
                                        ),
                                    ),
                                ) { inputs ->
                                    advanceState(
                                        chain = decoderState,
                                        session = graphs.mimiDecoder,
                                        stage = "mimi_decoder",
                                        inputs = inputs,
                                        callback = callback,
                                        sentenceIndex = sentence.index,
                                        frameIndex = decodedFirstFrame,
                                        inputFrames = batch.size,
                                        stateBytes = mimiStateBytes,
                                    ) { result -> result.floatValues("audio_frame") }
                                }
                                require(pcm.values.size == batch.size * bundle.samplesPerFrame) {
                                    "Pocket Mimi decoder returned ${pcm.values.size} samples for ${batch.size} frames"
                                }
                                pcm.values
                            },
                            consume = { pcm ->
                                val onsetStartedAtNs = System.nanoTime()
                                val userPcm = onsetStabilizer?.accept(pcm) ?: pcm
                                val releasesOnset = onsetStabilizer != null && userPcm.isNotEmpty() && !onsetMetricEmitted
                                if (releasesOnset) {
                                    val onset = onsetStabilizer.finish()
                                    emitOnsetMetric(
                                        onset = onset,
                                        startedAtNs = onsetStartedAtNs,
                                        frameIndex = 0,
                                        outputSamples = userPcm.size,
                                    )
                                }
                                val frame = TalosPocketFrame(
                                    sentenceIndex = sentence.index,
                                    firstFrameIndex = if (releasesOnset) 0 else decodedFirstFrame,
                                    frameCount = if (releasesOnset) {
                                        decodedFirstFrame + decodedBatchFrames
                                    } else {
                                        decodedBatchFrames
                                    },
                                    sampleRate = bundle.sampleRate,
                                    pcmFloatMono = userPcm,
                                )
                                decodedFirstFrame += decodedBatchFrames
                                if (userPcm.isEmpty()) {
                                    true
                                } else {
                                    emittedSamples += userPcm.size
                                    callback.onPcm(frame)
                                }
                            },
                        )
                        var completionRejected = false
                        if (pipelineMetrics.terminal == TalosPocketPipelineTerminal.CANCELLED) {
                            onsetStabilizer?.cancel()
                        } else if (onsetStabilizer != null && !onsetMetricEmitted) {
                            val onsetStartedAtNs = System.nanoTime()
                            val completion = onsetStabilizer.complete()
                            emitOnsetMetric(
                                onset = completion.result,
                                startedAtNs = onsetStartedAtNs,
                                frameIndex = 0,
                                outputSamples = completion.pcmFloatMono.size,
                            )
                            emittedSamples += completion.pcmFloatMono.size
                            completionRejected = !callback.onPcm(
                                TalosPocketFrame(
                                    sentenceIndex = sentence.index,
                                    firstFrameIndex = 0,
                                    frameCount = decodedFirstFrame,
                                    sampleRate = bundle.sampleRate,
                                    pcmFloatMono = completion.pcmFloatMono,
                                ),
                            )
                            if (completionRejected) cancellation.cancel()
                        }
                        generatedFrames += pipelineMetrics.producedFrames
                        producerBlockedNs += pipelineMetrics.producerBlockedNs
                        decoderNs += pipelineMetrics.decodeNs
                        highWatermark = maxOf(highWatermark, pipelineMetrics.highWatermarkFrames)
                        if (pipelineMetrics.terminal == TalosPocketPipelineTerminal.CANCELLED || completionRejected) {
                            terminal = TalosPocketPipelineTerminal.CANCELLED
                            break@sentenceLoop
                        }
                    } finally {
                        decoderState.close()
                    }
                } finally {
                    sentenceState.close()
                }
            }
        } finally {
            baseState.close()
        }
        TalosPocketSynthesisResult(
            terminal = terminal,
            sentenceCount = sentences.size,
            generatedFrames = generatedFrames,
            emittedSamples = emittedSamples,
            onsetDiscardedSamples = onsetDiscardedSamples,
            elapsedNs = System.nanoTime() - startedAtNs,
            producerBlockedNs = producerBlockedNs,
            decoderNs = decoderNs,
            queueHighWatermarkFrames = highWatermark,
        )
    }

    private fun generateSentenceLatents(
        sentence: TalosPocketPlannedSentence,
        state: TalosPocketOrtStateChain,
        frameLimit: Int,
        random: Random,
        cancellation: TalosPocketCancellation,
        callback: TalosPocketCallback,
        emit: (FloatArray) -> Boolean,
    ) {
        var current = FloatArray(bundle.latentDim) { Float.NaN }
        var eosStep: Int? = null
        val emptyText = FloatArray(0)
        val standardDeviation = sqrt(config.temperature)
        val dt = 1f / config.lsdSteps

        for (frameIndex in 0 until frameLimit) {
            if (cancellation.isCancelled()) return
            val main = withOwnedInputs(
                mapOf(
                    "sequence" to graphs.tensors.float32(
                        longArrayOf(1, 1, bundle.latentDim.toLong()),
                        current,
                    ),
                    "text_embeddings" to graphs.tensors.float32(
                        longArrayOf(1, 0, bundle.conditioningDim.toLong()),
                        emptyText,
                    ),
                ),
            ) { inputs ->
                advanceState(
                    chain = state,
                    session = graphs.flowMain,
                    stage = "flow_main_ar",
                    inputs = inputs,
                    callback = callback,
                    sentenceIndex = sentence.index,
                    frameIndex = frameIndex,
                    inputFrames = 1,
                    stateBytes = flowStateBytes,
                ) { result ->
                    result.floatValues("conditioning") to result.floatValues("eos_logit")
                }
            }
            val conditioning = main.first
            val eos = main.second
            require(conditioning.shape.contentEquals(longArrayOf(1, bundle.conditioningDim.toLong()))) {
                "Pocket flow main returned an invalid conditioning shape"
            }
            require(eos.values.size == 1) { "Pocket flow main returned an invalid EOS shape" }
            if (eos.values[0] > -4f && eosStep == null) eosStep = frameIndex
            val detectedEosStep = eosStep
            if (detectedEosStep != null && frameIndex >= detectedEosStep + sentence.framesAfterEos) return
            if (cancellation.isCancelled()) return

            val x = FloatArray(bundle.latentDim) { index ->
                if (standardDeviation == 0f) 0f else (random.nextGaussian() * standardDeviation).toFloat()
            }
            repeat(config.lsdSteps) { lsdStep ->
                if (cancellation.isCancelled()) return
                val s = lsdStep.toFloat() / config.lsdSteps
                val t = s + dt
                val flowDirection = runStandalone(
                    session = graphs.flow,
                    stage = "flow_step",
                    inputs = mapOf(
                        "c" to graphs.tensors.float32(conditioning.shape, conditioning.values),
                        "s" to graphs.tensors.float32(longArrayOf(1, 1), floatArrayOf(s)),
                        "t" to graphs.tensors.float32(longArrayOf(1, 1), floatArrayOf(t)),
                        "x" to graphs.tensors.float32(longArrayOf(1, bundle.latentDim.toLong()), x),
                    ),
                    callback = callback,
                    sentenceIndex = sentence.index,
                    frameIndex = frameIndex,
                    stateBytes = 0L,
                ) { result -> result.floatValues("flow_dir") }
                require(flowDirection.shape.contentEquals(longArrayOf(1, bundle.latentDim.toLong()))) {
                    "Pocket flow graph returned an invalid direction shape"
                }
                for (index in x.indices) x[index] += flowDirection.values[index] * dt
            }
            current = x
            if (!emit(x.copyOf())) return
        }
    }

    private fun concatenateVoice(conditioning: TalosPocketConditioning): FloatArray {
        require(conditioning.shape[2] == bundle.conditioningDim.toLong()) { "Pocket conditioning dimension differs from bundle" }
        val result = FloatArray(bosBeforeVoice.values.size + conditioning.valuesUnsafe().size)
        bosBeforeVoice.values.copyInto(result)
        conditioning.valuesUnsafe().copyInto(result, bosBeforeVoice.values.size)
        return result
    }

    private fun estimateFrameLimit(tokenCount: Int): Int = ceil(
        (tokenCount / TOKENS_PER_SECOND_ESTIMATE + GENERATION_PADDING_SECONDS) * bundle.frameRate,
    ).toInt().coerceIn(1, config.hardMaxFramesPerSentence)

    private fun metric(
        stage: String,
        startedAtNs: Long,
        durationNs: Long,
        sentenceIndex: Int? = null,
        frameIndex: Int? = null,
        inputFrames: Int? = null,
        outputSamples: Int? = null,
        stateBytes: Long? = null,
        onsetDiscardedSamples: Int? = null,
        onsetLeadingSilenceSamples: Int? = null,
        onsetGapStartSamples: Int? = null,
        onsetGapEndSamples: Int? = null,
        onsetResumeStartSamples: Int? = null,
        onsetAnalysisWindowSamples: Int? = null,
        onsetBoundaryThreshold: Float? = null,
        onsetBoundarySource: String? = null,
    ) = TalosPocketStageMetric(
        runIndex = runCounter.incrementAndGet(),
        stage = stage,
        startedAtNs = startedAtNs,
        durationNs = durationNs,
        threadName = Thread.currentThread().name,
        sentenceIndex = sentenceIndex,
        frameIndex = frameIndex,
        inputFrames = inputFrames,
        outputSamples = outputSamples,
        residentStateBytes = stateBytes,
        onsetDiscardedSamples = onsetDiscardedSamples,
        onsetLeadingSilenceSamples = onsetLeadingSilenceSamples,
        onsetGapStartSamples = onsetGapStartSamples,
        onsetGapEndSamples = onsetGapEndSamples,
        onsetResumeStartSamples = onsetResumeStartSamples,
        onsetAnalysisWindowSamples = onsetAnalysisWindowSamples,
        onsetBoundaryThreshold = onsetBoundaryThreshold,
        onsetBoundarySource = onsetBoundarySource,
    )

    private fun <T> advanceState(
        chain: TalosPocketOrtStateChain,
        session: TalosPocketOrtSession,
        stage: String,
        inputs: Map<String, TalosPocketOrtValue>,
        callback: TalosPocketCallback,
        sentenceIndex: Int?,
        frameIndex: Int?,
        inputFrames: Int? = null,
        stateBytes: Long,
        inspect: (TalosPocketOrtResult) -> T,
    ): T {
        val startedAtNs = System.nanoTime()
        var runDurationNs = 0L
        val value = chain.advance(
            session = session,
            transientInputs = inputs,
            onRunDuration = { runDurationNs = it },
            inspect = inspect,
        )
        callback.onStage(
            metric(
                stage = stage,
                startedAtNs = startedAtNs,
                durationNs = runDurationNs,
                sentenceIndex = sentenceIndex,
                frameIndex = frameIndex,
                inputFrames = inputFrames,
                stateBytes = stateBytes,
            ),
        )
        return value
    }

    private fun advanceState(
        chain: TalosPocketOrtStateChain,
        session: TalosPocketOrtSession,
        stage: String,
        inputs: Map<String, TalosPocketOrtValue>,
        callback: TalosPocketCallback,
        sentenceIndex: Int?,
        frameIndex: Int?,
        inputFrames: Int? = null,
        stateBytes: Long,
    ) {
        advanceState(
            chain,
            session,
            stage,
            inputs,
            callback,
            sentenceIndex,
            frameIndex,
            inputFrames,
            stateBytes,
        ) { Unit }
    }

    private fun <T> runStandalone(
        session: TalosPocketOrtSession,
        stage: String,
        inputs: Map<String, TalosPocketOwnedOrtValue>,
        callback: TalosPocketCallback?,
        sentenceIndex: Int?,
        frameIndex: Int?,
        stateBytes: Long,
        inspect: (TalosPocketOrtResult) -> T,
    ): T = withOwnedInputs(inputs) { borrowed ->
        val startedAtNs = System.nanoTime()
        session.run(borrowed).use { result ->
            val durationNs = System.nanoTime() - startedAtNs
            val inspected = inspect(result)
            callback?.onStage(
                metric(
                    stage = stage,
                    startedAtNs = startedAtNs,
                    durationNs = durationNs,
                    sentenceIndex = sentenceIndex,
                    frameIndex = frameIndex,
                    stateBytes = stateBytes,
                ),
            )
            inspected
        }
    }

    private inline fun <T> withOwnedInputs(
        inputs: Map<String, TalosPocketOwnedOrtValue>,
        block: (Map<String, TalosPocketOrtValue>) -> T,
    ): T = try {
        block(inputs)
    } finally {
        inputs.values.toList().asReversed().forEach { runCatching(it::close) }
    }

    private fun validateGraphContracts() {
        validateSimpleGraph(graphs.mimiEncoder, setOf("audio"), setOf("latents"))
        validateSimpleGraph(graphs.textConditioner, setOf("token_ids"), setOf("embeddings"))
        validateSimpleGraph(
            graphs.flowMain,
            setOf("sequence", "text_embeddings") + bundle.flowStates.map(TalosPocketStateSpec::inputName),
            setOf("conditioning", "eos_logit") + bundle.flowStates.map(TalosPocketStateSpec::outputName),
        )
        validateSimpleGraph(graphs.flow, setOf("c", "s", "t", "x"), setOf("flow_dir"))
        validateSimpleGraph(
            graphs.mimiDecoder,
            setOf("latent") + bundle.mimiStates.map(TalosPocketStateSpec::inputName),
            setOf("audio_frame") + bundle.mimiStates.map(TalosPocketStateSpec::outputName),
        )
        validateStateContracts(graphs.flowMain, bundle.flowStates)
        validateStateContracts(graphs.mimiDecoder, bundle.mimiStates)
    }

    private fun validateSimpleGraph(
        session: TalosPocketOrtSession,
        expectedInputs: Set<String>,
        expectedOutputs: Set<String>,
    ) {
        if (session.inputContracts.isEmpty() && session.outputContracts.isEmpty()) return
        require(session.inputContracts.keys == expectedInputs) {
            "Pocket graph inputs differ: expected $expectedInputs, found ${session.inputContracts.keys}"
        }
        require(session.outputContracts.keys == expectedOutputs) {
            "Pocket graph outputs differ: expected $expectedOutputs, found ${session.outputContracts.keys}"
        }
    }

    private fun validateStateContracts(session: TalosPocketOrtSession, specs: List<TalosPocketStateSpec>) {
        if (session.inputContracts.isEmpty()) return
        specs.forEach { spec ->
            val input = session.inputContracts.getValue(spec.inputName)
            val output = session.outputContracts.getValue(spec.outputName)
            require(input.dtype == spec.dtype && output.dtype == spec.dtype) { "Pocket state ${spec.inputName} dtype differs" }
            require(input.shape.contentEquals(spec.shape)) { "Pocket state ${spec.inputName} input shape differs" }
            require(shapesCompatible(output.shape, spec.shape)) { "Pocket state ${spec.outputName} output shape differs" }
        }
    }

    private fun shapesCompatible(actual: LongArray, expected: LongArray): Boolean =
        actual.size == expected.size && actual.indices.all { index -> actual[index] < 0L || actual[index] == expected[index] }

    private inline fun <T> exclusive(block: () -> T): T {
        check(!closed.get()) { "Pocket runtime is closed" }
        check(busy.compareAndSet(false, true)) { "Pocket runtime is already in use" }
        return try {
            block()
        } finally {
            busy.set(false)
        }
    }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        check(!busy.get()) { "cannot close Pocket runtime during inference" }
        var failure: Throwable? = null
        try {
            graphs.close()
        } catch (error: Throwable) {
            failure = error
        }
        if (tokenizer is AutoCloseable) {
            try {
                tokenizer.close()
            } catch (error: Throwable) {
                if (failure == null) failure = error else failure.addSuppressed(error)
            }
        }
        failure?.let { throw it }
    }

    companion object {
        private const val TOKENS_PER_SECOND_ESTIMATE = 3.0
        private const val GENERATION_PADDING_SECONDS = 2.0

        fun open(bundleRoot: File, cpuThreads: Int, config: TalosPocketConfig = TalosPocketConfig()): TalosPocketOrtRuntime {
            val root = bundleRoot.canonicalFile
            require(root.isDirectory) { "Pocket bundle root is missing: ${root.absolutePath}" }
            val bundleFile = childFile(root, "bundle.json")
            require(bundleFile.length() in 1..(1024L * 1024L)) { "Pocket bundle.json size is invalid" }
            val bundle = TalosPocketBundle.fromJson(JSONObject(bundleFile.readText(Charsets.UTF_8)))
            bundle.requireSupportedStateLayout()
            val tokenizer = TalosPocketTokenizer.open(childFile(root, bundle.tokenizerFile))
            var graphs: TalosPocketJavaOrtGraphs? = null
            try {
                val bos = TalosPocketNpy.readFloat32(childFile(root, bundle.bosBeforeVoiceFile))
                graphs = TalosPocketJavaOrtGraphs.open(root, cpuThreads)
                return TalosPocketOrtRuntime(
                    bundle,
                    tokenizer,
                    bos,
                    graphs,
                    config,
                    TalosPocketResampler.production,
                )
            } catch (error: Throwable) {
                runCatching { graphs?.close() }
                runCatching(tokenizer::close)
                throw TalosPocketError("Pocket runtime open failed", error)
            }
        }

        internal fun forTesting(
            bundle: TalosPocketBundle,
            tokenizer: TalosPocketTokenizerContract,
            bosBeforeVoice: TalosPocketFloatTensor,
            graphs: TalosPocketOrtGraphs,
            config: TalosPocketConfig,
            resampler: TalosPocketResampler,
        ): TalosPocketOrtRuntime = TalosPocketOrtRuntime(
            bundle,
            tokenizer,
            bosBeforeVoice,
            graphs,
            config,
            resampler,
        )

        private fun childFile(root: File, relative: String): File {
            require(relative.isNotBlank() && !File(relative).isAbsolute && !relative.contains('/') && !relative.contains('\\')) {
                "Pocket bundle path is unsafe: $relative"
            }
            val child = File(root, relative).canonicalFile
            require(child.parentFile == root && child.isFile) { "Pocket bundle file is missing or escapes root: $relative" }
            return child
        }

        private fun stateBytes(specs: List<TalosPocketStateSpec>): Long = specs.sumOf { spec ->
            val bytesPerElement = when (spec.dtype) {
                TalosPocketDType.FLOAT32 -> Float.SIZE_BYTES
                TalosPocketDType.FLOAT16 -> Short.SIZE_BYTES
                TalosPocketDType.INT64 -> Long.SIZE_BYTES
                TalosPocketDType.BOOL -> 1
            }
            elementCount(spec.shape).toLong() * bytesPerElement
        }
    }
}
