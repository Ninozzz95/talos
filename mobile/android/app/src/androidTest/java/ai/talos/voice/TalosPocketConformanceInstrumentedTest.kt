package ai.talos.voice

import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.talos.voice.pocket.TalosPocketBundle
import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketCancellation
import ai.talos.voice.pocket.TalosPocketConditioning
import ai.talos.voice.pocket.TalosPocketConfig
import ai.talos.voice.pocket.TalosPocketFrame
import ai.talos.voice.pocket.TalosPocketNpy
import ai.talos.voice.pocket.TalosPocketOrtRuntime
import ai.talos.voice.pocket.TalosPocketPipelineTerminal
import ai.talos.voice.pocket.TalosPocketStateSpec
import ai.talos.voice.pocket.TalosPocketStageMetric
import ai.talos.voice.pocket.TalosPocketTensorData
import ai.talos.voice.pocket.TalosPocketTextPlanner
import ai.talos.voice.pocket.TalosPocketTokenizer
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.Closeable
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.Collections
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith


@RunWith(AndroidJUnit4::class)
class TalosPocketConformanceInstrumentedTest {
    @Test
    fun temperatureZeroProductionPathConformsToPinnedHostBoundariesOnArm64() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = TalosPocketModelManager.modelRoot(requireNotNull(context.getExternalFilesDir(null)))
        val manifest = TalosPocketModelManifest.fromJson(
            JSONObject(context.assets.open(MANIFEST_ASSET).bufferedReader().use { it.readText() }),
        ).requirePinnedBundle()
        val status = TalosPocketModelManager.validate(root, manifest)
        assertTrue("Pocket model must be hash-verified before conformance: $status", status is TalosPocketModelStatus.Ready)
        val bundle = TalosPocketBundle.fromJson(JSONObject(File(root, "bundle.json").readText(Charsets.UTF_8)))
        val conditioningValues = readPinnedFloats(
            File(root, ORACLE_CONDITIONING),
            EXPECTED_CONDITIONING_FLOATS,
            EXPECTED_CONDITIONING_SHA256,
        )
        val expectedLatents = readPinnedFloats(
            File(root, ORACLE_LATENTS),
            EXPECTED_LATENT_FLOATS,
            EXPECTED_LATENT_SHA256,
        )
        val expectedPcm = readPinnedFloats(
            File(root, ORACLE_PCM),
            EXPECTED_PCM_FLOATS,
            EXPECTED_PCM_SHA256,
        )
        val plannedSentence = TalosPocketTokenizer.open(File(root, bundle.tokenizerFile)).use { tokenizer ->
            TalosPocketTextPlanner(
                tokenizer = tokenizer,
                maxTokens = bundle.maxTokenPerChunk,
                padWithSpacesForShortInputs = bundle.padWithSpacesForShortInputs,
                removeSemicolons = bundle.removeSemicolons,
                recommendedFramesAfterEos = bundle.modelRecommendedFramesAfterEos,
            ).plan(PUBLIC_SMOKE_TEXT).single()
        }
        val tokenIds = plannedSentence.tokenIds
        val conditioning = TalosPocketConditioning.create(
            longArrayOf(1, EXPECTED_CONDITIONING_FRAMES.toLong(), 1_024),
            conditioningValues,
        )
        val actualChunks = Collections.synchronizedList(mutableListOf<FloatArray>())
        val replicaChunks = Collections.synchronizedList(mutableListOf<FloatArray>())
        val stages = Collections.synchronizedList(mutableListOf<TalosPocketStageMetric>())
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = root,
            cpuThreads = 4,
            config = TalosPocketConfig(
                temperature = 0f,
                lsdSteps = 1,
                queueCapacityFrames = 24,
                firstDecodeFrames = 15,
                regularDecodeFrames = 15,
                hardMaxFramesPerSentence = 24,
                stabilizeOnset = false,
            ),
        )
        try {
            val result = runtime.synthesize(
                source = PUBLIC_SMOKE_TEXT,
                conditioning = conditioning,
                maxFramesPerSentence = 24,
                seed = 19L,
                cancellation = TalosPocketCancellation(),
                callback = object : TalosPocketCallback {
                    override fun onStage(metric: TalosPocketStageMetric) {
                        stages += metric
                    }

                    override fun onPcm(frame: TalosPocketFrame): Boolean {
                        actualChunks += frame.pcmFloatMono.copyOf()
                        return true
                    }
                },
            )
            val replicaResult = runtime.synthesize(
                source = PUBLIC_SMOKE_TEXT,
                conditioning = conditioning,
                maxFramesPerSentence = 24,
                seed = 19L,
                cancellation = TalosPocketCancellation(),
                callback = object : TalosPocketCallback {
                    override fun onStage(metric: TalosPocketStageMetric) = Unit

                    override fun onPcm(frame: TalosPocketFrame): Boolean {
                        replicaChunks += frame.pcmFloatMono.copyOf()
                        return true
                    }
                },
            )
            val actualPcm = concatenatePcm(actualChunks)
            val replicaPcm = concatenatePcm(replicaChunks)
            runtime.close()
            val defaultFlow = generatePinnedLatentsDirect(
                root = root,
                bundle = bundle,
                conditioningValues = conditioningValues,
                tokenIds = tokenIds,
                framesAfterEos = plannedSentence.framesAfterEos,
                disableKleidiAi = false,
            )
            val genericMlasFlow = generatePinnedLatentsDirect(
                root = root,
                bundle = bundle,
                conditioningValues = conditioningValues,
                tokenIds = tokenIds,
                framesAfterEos = plannedSentence.framesAfterEos,
                disableKleidiAi = true,
            )
            val defaultDecoder = decodePinnedLatents(
                root = root,
                bundle = bundle,
                latents = expectedLatents,
                disableKleidiAi = false,
            )
            val genericMlasDecoder = decodePinnedLatents(
                root = root,
                bundle = bundle,
                latents = expectedLatents,
                disableKleidiAi = true,
            )
            val defaultFlowPcm = decodePinnedLatents(
                root = root,
                bundle = bundle,
                latents = defaultFlow.latents,
                disableKleidiAi = false,
            )
            val genericMlasFlowPcm = decodePinnedLatents(
                root = root,
                bundle = bundle,
                latents = genericMlasFlow.latents,
                disableKleidiAi = true,
            )
            val hostVsProduction = compareFloats(expectedPcm, actualPcm)
            val hostVsDefaultDecoder = compareFloats(expectedPcm, defaultDecoder.first)
            val hostVsGenericMlasDecoder = compareFloats(expectedPcm, genericMlasDecoder.first)
            val productionVsDefaultDecoder = compareFloats(actualPcm, defaultDecoder.first)
            val defaultVsGenericMlasDecoder = compareFloats(defaultDecoder.first, genericMlasDecoder.first)
            val hostVsDefaultFlowLatents = compareFloats(expectedLatents, defaultFlow.latents)
            val hostVsGenericMlasFlowLatents = compareFloats(expectedLatents, genericMlasFlow.latents)
            val defaultVsGenericMlasFlowLatents = compareFloats(defaultFlow.latents, genericMlasFlow.latents)
            val productionVsDefaultFlowPcm = compareFloats(actualPcm, defaultFlowPcm.first)
            val productionVsGenericMlasFlowPcm = compareFloats(actualPcm, genericMlasFlowPcm.first)
            val productionVsReplica = compareFloats(actualPcm, replicaPcm)
            val hostVsFirstDefaultFlowLatent = compareFloats(
                expectedLatents.copyOfRange(0, bundle.latentDim),
                defaultFlow.latents.copyOfRange(0, bundle.latentDim),
            )
            val boundaryComparison = hostBoundaryComparison(defaultFlow)
            val boundaryMatches = boundaryComparison.getJSONObject("matches")
            val finiteOutputs = actualPcm.all(Float::isFinite) &&
                replicaPcm.all(Float::isFinite) &&
                defaultFlow.latents.all(Float::isFinite) &&
                defaultDecoder.first.all(Float::isFinite)
            val crossArchitecturePassed = tokenIds.contentEquals(EXPECTED_TOKEN_IDS) &&
                boundaryMatches.getBoolean("preparedVoiceEmbeddings") &&
                boundaryMatches.getBoolean("textEmbeddings") &&
                hostVsFirstDefaultFlowLatent.firstBitwiseDifference == null &&
                productionVsReplica.firstBitwiseDifference == null &&
                productionVsDefaultFlowPcm.firstBitwiseDifference == null &&
                hostVsDefaultFlowLatents.correlation >= MIN_HOST_LATENT_CORRELATION &&
                hostVsDefaultDecoder.maxAbsoluteError <= MAX_DECODER_ABSOLUTE_ERROR &&
                hostVsDefaultDecoder.rootMeanSquareError <= MAX_DECODER_RMSE &&
                hostVsDefaultDecoder.correlation >= MIN_DECODER_CORRELATION &&
                finiteOutputs
            val stageSnapshot = synchronized(stages) { stages.toList() }
            val evidence = JSONObject()
                .put("schemaVersion", 5)
                .put("modelRevision", TalosPocketModelManifest.REVISION)
                .put("fixtureId", "smoke-short")
                .put("temperature", 0.0)
                .put("seed", 19)
                .put("runtime", JSONObject()
                    .put("onnxRuntime", OrtEnvironment.getEnvironment("talos-pocket-conformance").version)
                    .put("abis", JSONArray(Build.SUPPORTED_ABIS.toList()))
                    .put("manufacturer", Build.MANUFACTURER)
                    .put("model", Build.MODEL)
                    .put("fingerprintSha256", sha256(Build.FINGERPRINT.toByteArray(Charsets.UTF_8))))
                .put("tokenCount", tokenIds.size)
                .put("tokenIdsSha256", sha256(tokenIds))
                .put("tokenIdsInt64Sha256", sha256(LongArray(tokenIds.size) { tokenIds[it].toLong() }))
                .put("tokenIdsMatchHost", tokenIds.contentEquals(EXPECTED_TOKEN_IDS))
                .put("conditioningSha256", EXPECTED_CONDITIONING_SHA256)
                .put("expectedLatentSha256", EXPECTED_LATENT_SHA256)
                .put("expectedPcmSha256", EXPECTED_PCM_SHA256)
                .put("actualPcmSha256", sha256(actualPcm))
                .put("replicaPcmSha256", sha256(replicaPcm))
                .put("defaultDecoderPcmSha256", sha256(defaultDecoder.first))
                .put("genericMlasDecoderPcmSha256", sha256(genericMlasDecoder.first))
                .put("defaultFlowLatentSha256", sha256(defaultFlow.latents))
                .put("genericMlasFlowLatentSha256", sha256(genericMlasFlow.latents))
                .put("defaultFlowPcmSha256", sha256(defaultFlowPcm.first))
                .put("genericMlasFlowPcmSha256", sha256(genericMlasFlowPcm.first))
                .put("sampleCount", actualPcm.size)
                .put("generatedFrames", result.generatedFrames)
                .put("replicaGeneratedFrames", replicaResult.generatedFrames)
                .put("rtf", result.rtf)
                .put("replicaRtf", replicaResult.rtf)
                .put("decoderProbeDurationNs", JSONObject()
                    .put("default", defaultDecoder.second)
                    .put("mlasDisableKleidiAi", genericMlasDecoder.second)
                    .put("defaultFlowLatents", defaultFlowPcm.second)
                    .put("mlasDisableKleidiAiFlowLatents", genericMlasFlowPcm.second))
                .put("directFlow", JSONObject()
                    .put("default", defaultFlow.toJson())
                    .put("mlasDisableKleidiAi", genericMlasFlow.toJson()))
                .put("hostBoundaryOracle", boundaryComparison)
                .put("crossArchitectureGate", JSONObject()
                    .put("rawPcmBitExactRequired", false)
                    .put("passed", crossArchitecturePassed)
                    .put("finiteOutputs", finiteOutputs)
                    .put("thresholds", JSONObject()
                        .put("minimumHostLatentCorrelation", MIN_HOST_LATENT_CORRELATION)
                        .put("maximumDecoderAbsoluteError", MAX_DECODER_ABSOLUTE_ERROR)
                        .put("maximumDecoderRmse", MAX_DECODER_RMSE)
                        .put("minimumDecoderCorrelation", MIN_DECODER_CORRELATION))
                    .put("exactContracts", JSONObject()
                        .put("tokenIds", tokenIds.contentEquals(EXPECTED_TOKEN_IDS))
                        .put("preparedVoiceEmbeddings", boundaryMatches.getBoolean("preparedVoiceEmbeddings"))
                        .put("textEmbeddings", boundaryMatches.getBoolean("textEmbeddings"))
                        .put("firstLatent", hostVsFirstDefaultFlowLatent.firstBitwiseDifference == null)
                        .put("sameDeviceProductionReplica", productionVsReplica.firstBitwiseDifference == null)
                        .put("productionVsDirectFlow", productionVsDefaultFlowPcm.firstBitwiseDifference == null)))
                .put("comparisons", JSONObject()
                    .put("hostVsProduction", hostVsProduction.toJson())
                    .put("hostVsDefaultDecoder", hostVsDefaultDecoder.toJson())
                    .put("hostVsGenericMlasDecoder", hostVsGenericMlasDecoder.toJson())
                    .put("productionVsDefaultDecoder", productionVsDefaultDecoder.toJson())
                    .put("defaultVsGenericMlasDecoder", defaultVsGenericMlasDecoder.toJson())
                    .put("hostVsDefaultFlowLatents", hostVsDefaultFlowLatents.toJson())
                    .put("hostVsGenericMlasFlowLatents", hostVsGenericMlasFlowLatents.toJson())
                    .put("defaultVsGenericMlasFlowLatents", defaultVsGenericMlasFlowLatents.toJson())
                    .put("productionVsDefaultFlowPcm", productionVsDefaultFlowPcm.toJson())
                    .put("productionVsGenericMlasFlowPcm", productionVsGenericMlasFlowPcm.toJson())
                    .put("productionVsReplica", productionVsReplica.toJson())
                    .put("hostVsFirstDefaultFlowLatent", hostVsFirstDefaultFlowLatent.toJson()))
                .put("decoderBatches", JSONArray().also { batches ->
                    var firstSample = 0
                    listOf(15, 9).forEach { frames ->
                        val lastSample = firstSample + frames * SAMPLES_PER_FRAME
                        batches.put(JSONObject()
                            .put("firstFrame", firstSample / SAMPLES_PER_FRAME)
                            .put("frameCount", frames)
                            .put("hostVsProduction", compareFloats(
                                expectedPcm.copyOfRange(firstSample, lastSample),
                                actualPcm.copyOfRange(firstSample, lastSample),
                            ).toJson())
                            .put("hostVsDefaultDecoder", compareFloats(
                                expectedPcm.copyOfRange(firstSample, lastSample),
                                defaultDecoder.first.copyOfRange(firstSample, lastSample),
                            ).toJson()))
                        firstSample = lastSample
                    }
                })
                .put("flowFrames", JSONArray().also { frames ->
                    defaultFlow.frames.take(minOf(defaultFlow.frames.size, genericMlasFlow.frames.size)).forEachIndexed { index, defaultFrame ->
                        val genericFrame = genericMlasFlow.frames[index]
                        val firstLatent = index * bundle.latentDim
                        frames.put(JSONObject()
                            .put("frameIndex", index)
                            .put("default", defaultFrame.toJson())
                            .put("mlasDisableKleidiAi", genericFrame.toJson())
                            .put("hostVsDefaultLatent", compareFloats(
                                expectedLatents.copyOfRange(firstLatent, firstLatent + bundle.latentDim),
                                defaultFlow.latents.copyOfRange(firstLatent, firstLatent + bundle.latentDim),
                            ).toJson())
                            .put("defaultVsGenericMlasLatent", compareFloats(
                                defaultFlow.latents.copyOfRange(firstLatent, firstLatent + bundle.latentDim),
                                genericMlasFlow.latents.copyOfRange(firstLatent, firstLatent + bundle.latentDim),
                            ).toJson()))
                    }
                })
                .put("stages", JSONArray().also { stageArray ->
                    stageSnapshot.forEach { metric ->
                        stageArray.put(JSONObject()
                            .put("runIndex", metric.runIndex)
                            .put("stage", metric.stage)
                            .put("startedAtNs", metric.startedAtNs)
                            .put("durationNs", metric.durationNs)
                            .put("thread", metric.threadName)
                            .put("sentenceIndex", metric.sentenceIndex ?: JSONObject.NULL)
                            .put("frameIndex", metric.frameIndex ?: JSONObject.NULL)
                            .put("inputFrames", metric.inputFrames ?: JSONObject.NULL)
                            .put("outputSamples", metric.outputSamples ?: JSONObject.NULL)
                            .put("residentStateBytes", metric.residentStateBytes ?: JSONObject.NULL))
                    }
                })
            writeEvidence(
                File(requireNotNull(context.getExternalFilesDir(null)), "research/voice/pocket-conformance.json"),
                evidence,
            )

            assertEquals("host and Android must tokenize the public fixture identically", EXPECTED_TOKEN_IDS.toList(), tokenIds.toList())
            assertEquals("the APK must run the pinned ORT", PINNED_ORT_VERSION, evidence.getJSONObject("runtime").getString("onnxRuntime"))
            assertEquals(TalosPocketPipelineTerminal.DONE, result.terminal)
            assertEquals(TalosPocketPipelineTerminal.DONE, replicaResult.terminal)
            assertEquals(24, result.generatedFrames)
            assertEquals(24, replicaResult.generatedFrames)
            assertEquals(expectedPcm.size, actualPcm.size)
            assertEquals(expectedPcm.size, replicaPcm.size)
            assertEquals("direct Flow must emit the same frame count as production", expectedLatents.size, defaultFlow.latents.size)
            assertEquals("generic MLAS Flow must emit the same frame count as production", expectedLatents.size, genericMlasFlow.latents.size)
            assertTrue(
                "Pocket outputs must remain finite; inspect pocket-conformance.json",
                finiteOutputs,
            )
            assertTrue(
                "prepared voice embeddings must match the pinned host input",
                boundaryMatches.getBoolean("preparedVoiceEmbeddings"),
            )
            assertTrue(
                "text embeddings must match the pinned host graph output",
                boundaryMatches.getBoolean("textEmbeddings"),
            )
            assertTrue(
                "the first latent must match the pinned host before recurrence amplifies CPU drift",
                hostVsFirstDefaultFlowLatent.firstBitwiseDifference == null,
            )
            assertTrue(
                "same-device production replay must be bit-identical",
                productionVsReplica.firstBitwiseDifference == null,
            )
            assertTrue(
                "direct Flow orchestration must reproduce production bit-identically",
                productionVsDefaultFlowPcm.firstBitwiseDifference == null,
            )
            assertTrue(
                "host/device latent correlation ${hostVsDefaultFlowLatents.correlation} is below $MIN_HOST_LATENT_CORRELATION",
                hostVsDefaultFlowLatents.correlation >= MIN_HOST_LATENT_CORRELATION,
            )
            assertTrue(
                "isolated Mimi maximum error ${hostVsDefaultDecoder.maxAbsoluteError} exceeds $MAX_DECODER_ABSOLUTE_ERROR",
                hostVsDefaultDecoder.maxAbsoluteError <= MAX_DECODER_ABSOLUTE_ERROR,
            )
            assertTrue(
                "isolated Mimi RMSE ${hostVsDefaultDecoder.rootMeanSquareError} exceeds $MAX_DECODER_RMSE",
                hostVsDefaultDecoder.rootMeanSquareError <= MAX_DECODER_RMSE,
            )
            assertTrue(
                "isolated Mimi correlation ${hostVsDefaultDecoder.correlation} is below $MIN_DECODER_CORRELATION",
                hostVsDefaultDecoder.correlation >= MIN_DECODER_CORRELATION,
            )
            assertEquals(listOf(15, 9), actualChunks.map { it.size / 1_920 })
            assertEquals(listOf(15, 9), replicaChunks.map { it.size / 1_920 })
            assertTrue(stages.any { it.stage == "flow_main_ar" })
            assertTrue(stages.any { it.stage == "mimi_decoder" && it.inputFrames == 15 })
            assertTrue(stages.any { it.stage == "mimi_decoder" && it.inputFrames == 9 })
        } finally {
            runtime.close()
        }
    }

    private data class FloatComparison(
        val maxAbsoluteError: Double,
        val rootMeanSquareError: Double,
        val meanAbsoluteError: Double,
        val correlation: Double,
        val firstBitwiseDifference: Int?,
        val maxErrorSampleIndex: Int,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("maxAbsoluteError", maxAbsoluteError)
            .put("rootMeanSquareError", rootMeanSquareError)
            .put("meanAbsoluteError", meanAbsoluteError)
            .put("correlation", correlation)
            .put("firstBitwiseDifference", firstBitwiseDifference ?: JSONObject.NULL)
            .put("maxErrorSampleIndex", maxErrorSampleIndex)
    }

    private fun concatenatePcm(chunks: List<FloatArray>): FloatArray {
        val snapshot = synchronized(chunks) { chunks.toList() }
        val output = FloatArray(snapshot.sumOf(FloatArray::size))
        var cursor = 0
        snapshot.forEach { chunk ->
            chunk.copyInto(output, cursor)
            cursor += chunk.size
        }
        return output
    }

    private fun compareFloats(expected: FloatArray, actual: FloatArray): FloatComparison {
        require(expected.size == actual.size && expected.isNotEmpty()) { "float comparison sizes differ or are empty" }
        var maxAbsoluteError = -1.0
        var maxErrorSampleIndex = -1
        var absoluteError = 0.0
        var squareError = 0.0
        var expectedSum = 0.0
        var actualSum = 0.0
        var firstBitwiseDifference: Int? = null
        for (index in expected.indices) {
            val expectedValue = expected[index].toDouble()
            val actualValue = actual[index].toDouble()
            val error = kotlin.math.abs(expectedValue - actualValue)
            if (error > maxAbsoluteError) {
                maxAbsoluteError = error
                maxErrorSampleIndex = index
            }
            absoluteError += error
            squareError += error * error
            expectedSum += expectedValue
            actualSum += actualValue
            if (firstBitwiseDifference == null &&
                expected[index].toRawBits() != actual[index].toRawBits()
            ) {
                firstBitwiseDifference = index
            }
        }
        val expectedMean = expectedSum / expected.size
        val actualMean = actualSum / actual.size
        var covariance = 0.0
        var expectedVariance = 0.0
        var actualVariance = 0.0
        for (index in expected.indices) {
            val expectedCentered = expected[index] - expectedMean
            val actualCentered = actual[index] - actualMean
            covariance += expectedCentered * actualCentered
            expectedVariance += expectedCentered * expectedCentered
            actualVariance += actualCentered * actualCentered
        }
        val denominator = kotlin.math.sqrt(expectedVariance * actualVariance)
        return FloatComparison(
            maxAbsoluteError = maxAbsoluteError,
            rootMeanSquareError = kotlin.math.sqrt(squareError / expected.size),
            meanAbsoluteError = absoluteError / expected.size,
            correlation = if (denominator == 0.0) 0.0 else covariance / denominator,
            firstBitwiseDifference = firstBitwiseDifference,
            maxErrorSampleIndex = maxErrorSampleIndex,
        )
    }

    private data class FlowFrameProbe(
        val frameIndex: Int,
        val eosLogit: Float,
        val arStateSha256: String?,
        val conditioningSha256: String,
        val flowDirectionSha256: String,
        val latentSha256: String,
        val flowMainDurationNs: Long,
        val flowStepDurationNs: Long,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("frameIndex", frameIndex)
            .put("eosLogit", eosLogit.toDouble())
            .put("arStateSha256", arStateSha256 ?: JSONObject.NULL)
            .put("conditioningSha256", conditioningSha256)
            .put("flowDirectionSha256", flowDirectionSha256)
            .put("latentSha256", latentSha256)
            .put("flowMainDurationNs", flowMainDurationNs)
            .put("flowStepDurationNs", flowStepDurationNs)
    }

    private data class FlowProbe(
        val disableKleidiAi: Boolean,
        val latents: FloatArray,
        val latentSha256: String,
        val totalDurationNs: Long,
        val textConditionerDurationNs: Long,
        val voicePrefillDurationNs: Long,
        val textPrefillDurationNs: Long,
        val preparedVoiceEmbeddingsSha256: String,
        val textEmbeddingsSha256: String,
        val voicePrefillStateSha256: String,
        val textPrefillStateSha256: String,
        val frames: List<FlowFrameProbe>,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("mlasKleidiAi", if (disableKleidiAi) "disabled" else "default")
            .put("sessionConfigEntryApplied", disableKleidiAi)
            .put("frameCount", frames.size)
            .put("latentSha256", latentSha256)
            .put("totalDurationNs", totalDurationNs)
            .put("textConditionerDurationNs", textConditionerDurationNs)
            .put("voicePrefillDurationNs", voicePrefillDurationNs)
            .put("textPrefillDurationNs", textPrefillDurationNs)
            .put("preparedVoiceEmbeddingsSha256", preparedVoiceEmbeddingsSha256)
            .put("textEmbeddingsSha256", textEmbeddingsSha256)
            .put("voicePrefillStateSha256", voicePrefillStateSha256)
            .put("textPrefillStateSha256", textPrefillStateSha256)
    }

    private fun hostBoundaryComparison(flow: FlowProbe): JSONObject {
        val first = flow.frames.getOrNull(0)
        val second = flow.frames.getOrNull(1)
        val matches = JSONObject()
            .put("preparedVoiceEmbeddings", flow.preparedVoiceEmbeddingsSha256 == EXPECTED_PREPARED_VOICE_SHA256)
            .put("voicePrefillState", flow.voicePrefillStateSha256 == EXPECTED_VOICE_PREFILL_STATE_SHA256)
            .put("textEmbeddings", flow.textEmbeddingsSha256 == EXPECTED_TEXT_EMBEDDINGS_SHA256)
            .put("textPrefillState", flow.textPrefillStateSha256 == EXPECTED_TEXT_PREFILL_STATE_SHA256)
            .put("frame0ArState", first?.arStateSha256 == EXPECTED_FRAME_0_AR_STATE_SHA256)
            .put("frame0Conditioning", first?.conditioningSha256 == EXPECTED_FRAME_0_CONDITIONING_SHA256)
            .put("frame0FlowDirection", first?.flowDirectionSha256 == EXPECTED_FRAME_0_FLOW_DIRECTION_SHA256)
            .put("frame0Latent", first?.latentSha256 == EXPECTED_FRAME_0_LATENT_SHA256)
            .put("frame1ArState", second?.arStateSha256 == EXPECTED_FRAME_1_AR_STATE_SHA256)
            .put("frame1Conditioning", second?.conditioningSha256 == EXPECTED_FRAME_1_CONDITIONING_SHA256)
            .put("frame1FlowDirection", second?.flowDirectionSha256 == EXPECTED_FRAME_1_FLOW_DIRECTION_SHA256)
            .put("frame1Latent", second?.latentSha256 == EXPECTED_FRAME_1_LATENT_SHA256)
        val firstBitwiseDivergence = when {
            !matches.getBoolean("preparedVoiceEmbeddings") -> "prepared_voice_embeddings"
            !matches.getBoolean("voicePrefillState") -> "flow_main_voice_prefill_state"
            !matches.getBoolean("textEmbeddings") -> "text_conditioner_embeddings"
            !matches.getBoolean("textPrefillState") -> "flow_main_text_prefill_state"
            !matches.getBoolean("frame0ArState") -> "flow_main_ar_state_frame_0"
            !matches.getBoolean("frame0Conditioning") -> "flow_main_conditioning_frame_0"
            !matches.getBoolean("frame0FlowDirection") -> "flow_step_frame_0"
            !matches.getBoolean("frame0Latent") -> "latent_frame_0"
            !matches.getBoolean("frame1ArState") -> "flow_main_ar_state_frame_1"
            !matches.getBoolean("frame1Conditioning") -> "flow_main_conditioning_frame_1"
            !matches.getBoolean("frame1FlowDirection") -> "flow_step_frame_1"
            !matches.getBoolean("frame1Latent") -> "latent_frame_1"
            else -> null
        }
        return JSONObject()
            .put("hostRuntime", "onnxruntime=1.29.0;system=Windows;machine=AMD64")
            .put("firstBitwiseDivergence", firstBitwiseDivergence ?: JSONObject.NULL)
            .put("matches", matches)
            .put("frame0EosAbsoluteError", first?.let { kotlin.math.abs(it.eosLogit - EXPECTED_FRAME_0_EOS_LOGIT).toDouble() }
                ?: JSONObject.NULL)
            .put("frame1EosAbsoluteError", second?.let { kotlin.math.abs(it.eosLogit - EXPECTED_FRAME_1_EOS_LOGIT).toDouble() }
                ?: JSONObject.NULL)
    }

    private inner class DirectOrtStateChain(
        private val specs: List<TalosPocketStateSpec>,
        initialState: LinkedHashMap<String, OnnxTensor>,
    ) : Closeable {
        private var state = LinkedHashMap(initialState)
        private var initialOwned: List<OnnxTensor> = initialState.values.toList()
        private var owner: OrtSession.Result? = null
        private var closed = false

        fun <T> advance(
            session: OrtSession,
            transientInputs: Map<String, OnnxTensor>,
            inspect: (OrtSession.Result) -> T,
        ): Pair<T, Long> {
            check(!closed) { "direct ORT state chain is closed" }
            require(transientInputs.keys.none(state::containsKey)) { "direct input shadows state" }
            val feeds = LinkedHashMap<String, OnnxTensor>(transientInputs.size + state.size)
            feeds.putAll(transientInputs)
            feeds.putAll(state)
            val startedAtNs = System.nanoTime()
            val next = session.run(feeds)
            val durationNs = System.nanoTime() - startedAtNs
            val inspected: T
            val nextState = LinkedHashMap<String, OnnxTensor>(specs.size)
            try {
                inspected = inspect(next)
                specs.forEach { spec -> nextState[spec.inputName] = requiredTensor(next, spec.outputName) }
            } catch (error: Throwable) {
                next.close()
                throw error
            }
            val previousOwner = owner
            val previousInitial = initialOwned
            state = nextState
            owner = next
            initialOwned = emptyList()
            if (previousOwner == null) {
                previousInitial.asReversed().forEach(OnnxTensor::close)
            } else {
                previousOwner.close()
            }
            return inspected to durationNs
        }

        fun stateSha256(): String {
            check(!closed) { "direct ORT state chain is closed" }
            val digest = MessageDigest.getInstance("SHA-256")
            specs.forEach { spec ->
                val header = buildString {
                    append(spec.inputName)
                    append('\u0000')
                    append(spec.outputName)
                    append('\u0000')
                    append(spec.dtype.wireName)
                    append('\u0000')
                    append(spec.shape.joinToString(","))
                    append('\u0000')
                }
                digest.update(header.toByteArray(Charsets.UTF_8))
                digest.update(requireNotNull(state[spec.inputName]).byteBuffer)
            }
            return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }

        override fun close() {
            if (closed) return
            closed = true
            val currentOwner = owner
            owner = null
            if (currentOwner == null) {
                initialOwned.asReversed().forEach { runCatching(it::close) }
            } else {
                currentOwner.close()
            }
            initialOwned = emptyList()
            state.clear()
        }
    }

    private fun generatePinnedLatentsDirect(
        root: File,
        bundle: TalosPocketBundle,
        conditioningValues: FloatArray,
        tokenIds: IntArray,
        framesAfterEos: Int,
        disableKleidiAi: Boolean,
    ): FlowProbe {
        require(conditioningValues.size == EXPECTED_CONDITIONING_FLOATS) { "direct Flow conditioning size differs" }
        require(tokenIds.isNotEmpty()) { "direct Flow token ids are empty" }
        require(framesAfterEos > 0) { "direct Flow framesAfterEos must be positive" }
        val environment = OrtEnvironment.getEnvironment("talos-pocket-conformance")
        val options = OrtSession.SessionOptions().apply {
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            setIntraOpNumThreads(4)
            setInterOpNumThreads(1)
            if (disableKleidiAi) addConfigEntry("mlas.disable_kleidiai", "1")
        }
        val sessions = ArrayList<OrtSession>(3)
        var state: DirectOrtStateChain? = null
        val totalStartedAtNs = System.nanoTime()
        try {
            fun open(name: String): OrtSession = environment.createSession(File(root, name).absolutePath, options)
                .also(sessions::add)

            val textConditioner = open("text_conditioner.onnx")
            val flowMain = open("flow_lm_main_int8.onnx")
            val flow = open("flow_lm_flow_int8.onnx")
            val initialState = linkedMapOf<String, OnnxTensor>()
            bundle.flowStates.forEach { spec -> initialState[spec.inputName] = createStateTensor(environment, spec) }
            val directState = DirectOrtStateChain(bundle.flowStates, initialState)
            state = directState

            val bos = TalosPocketNpy.readFloat32(File(root, bundle.bosBeforeVoiceFile))
            require(bos.shape.contentEquals(longArrayOf(1, 1, bundle.conditioningDim.toLong()))) {
                "direct Flow BOS shape differs"
            }
            val voiceValues = FloatArray(bos.values.size + conditioningValues.size)
            bos.values.copyInto(voiceValues)
            conditioningValues.copyInto(voiceValues, bos.values.size)
            val voicePrefill = withOwnedTensors(
                linkedMapOf(
                    "sequence" to createFloatTensor(environment, longArrayOf(1, 0, bundle.latentDim.toLong()), FloatArray(0)),
                    "text_embeddings" to createFloatTensor(
                        environment,
                        longArrayOf(1, 1L + EXPECTED_CONDITIONING_FRAMES, bundle.conditioningDim.toLong()),
                        voiceValues,
                    ),
                ),
            ) { inputs -> directState.advance(flowMain, inputs) { Unit } }
            val voicePrefillStateSha256 = directState.stateSha256()

            val textConditionerStartedAtNs = System.nanoTime()
            val textEmbeddings = withOwnedTensors(
                linkedMapOf(
                    "token_ids" to createLongTensor(
                        environment,
                        longArrayOf(1, tokenIds.size.toLong()),
                        LongArray(tokenIds.size) { tokenIds[it].toLong() },
                    ),
                ),
            ) { inputs ->
                textConditioner.run(inputs).use { result -> copyFloatValues(result, "embeddings") }
            }
            val textConditionerDurationNs = System.nanoTime() - textConditionerStartedAtNs
            require(textEmbeddings.size == tokenIds.size * bundle.conditioningDim) {
                "direct text conditioner output size differs"
            }

            val textPrefill = withOwnedTensors(
                linkedMapOf(
                    "sequence" to createFloatTensor(environment, longArrayOf(1, 0, bundle.latentDim.toLong()), FloatArray(0)),
                    "text_embeddings" to createFloatTensor(
                        environment,
                        longArrayOf(1, tokenIds.size.toLong(), bundle.conditioningDim.toLong()),
                        textEmbeddings,
                    ),
                ),
            ) { inputs -> directState.advance(flowMain, inputs) { Unit } }
            val textPrefillStateSha256 = directState.stateSha256()

            var current = FloatArray(bundle.latentDim) { Float.NaN }
            var eosStep: Int? = null
            val generated = ArrayList<FloatArray>(EXPECTED_LATENT_FLOATS / bundle.latentDim)
            val frameProbes = ArrayList<FlowFrameProbe>(EXPECTED_LATENT_FLOATS / bundle.latentDim)
            for (frameIndex in 0 until EXPECTED_LATENT_FLOATS / bundle.latentDim) {
                val main = withOwnedTensors(
                    linkedMapOf(
                        "sequence" to createFloatTensor(
                            environment,
                            longArrayOf(1, 1, bundle.latentDim.toLong()),
                            current,
                        ),
                        "text_embeddings" to createFloatTensor(
                            environment,
                            longArrayOf(1, 0, bundle.conditioningDim.toLong()),
                            FloatArray(0),
                        ),
                    ),
                ) { inputs ->
                    directState.advance(flowMain, inputs) { result ->
                        copyFloatValues(result, "conditioning") to copyFloatValues(result, "eos_logit")
                    }
                }
                val conditioning = main.first.first
                val eos = main.first.second
                require(conditioning.size == bundle.conditioningDim) { "direct Flow conditioning output size differs" }
                require(eos.size == 1) { "direct Flow EOS output size differs" }
                if (eos[0] > -4f && eosStep == null) eosStep = frameIndex
                val detectedEosStep = eosStep
                if (detectedEosStep != null && frameIndex >= detectedEosStep + framesAfterEos) break
                val arStateSha256 = if (frameIndex < 2) directState.stateSha256() else null

                val flowStartedAtNs = System.nanoTime()
                val flowDirection = withOwnedTensors(
                    linkedMapOf(
                        "c" to createFloatTensor(
                            environment,
                            longArrayOf(1, bundle.conditioningDim.toLong()),
                            conditioning,
                        ),
                        "s" to createFloatTensor(environment, longArrayOf(1, 1), floatArrayOf(0f)),
                        "t" to createFloatTensor(environment, longArrayOf(1, 1), floatArrayOf(1f)),
                        "x" to createFloatTensor(
                            environment,
                            longArrayOf(1, bundle.latentDim.toLong()),
                            FloatArray(bundle.latentDim),
                        ),
                    ),
                ) { inputs -> flow.run(inputs).use { result -> copyFloatValues(result, "flow_dir") } }
                val flowDurationNs = System.nanoTime() - flowStartedAtNs
                require(flowDirection.size == bundle.latentDim) { "direct Flow direction size differs" }
                current = flowDirection.copyOf()
                generated += current
                frameProbes += FlowFrameProbe(
                    frameIndex = frameIndex,
                    eosLogit = eos[0],
                    arStateSha256 = arStateSha256,
                    conditioningSha256 = sha256(conditioning),
                    flowDirectionSha256 = sha256(flowDirection),
                    latentSha256 = sha256(current),
                    flowMainDurationNs = main.second,
                    flowStepDurationNs = flowDurationNs,
                )
            }
            val latents = FloatArray(generated.size * bundle.latentDim)
            generated.forEachIndexed { index, values -> values.copyInto(latents, index * bundle.latentDim) }
            return FlowProbe(
                disableKleidiAi = disableKleidiAi,
                latents = latents,
                latentSha256 = sha256(latents),
                totalDurationNs = System.nanoTime() - totalStartedAtNs,
                textConditionerDurationNs = textConditionerDurationNs,
                voicePrefillDurationNs = voicePrefill.second,
                textPrefillDurationNs = textPrefill.second,
                preparedVoiceEmbeddingsSha256 = sha256(voiceValues),
                textEmbeddingsSha256 = sha256(textEmbeddings),
                voicePrefillStateSha256 = voicePrefillStateSha256,
                textPrefillStateSha256 = textPrefillStateSha256,
                frames = frameProbes,
            )
        } finally {
            state?.close()
            sessions.asReversed().forEach { runCatching(it::close) }
            options.close()
        }
    }

    private inline fun <T> withOwnedTensors(
        tensors: LinkedHashMap<String, OnnxTensor>,
        block: (Map<String, OnnxTensor>) -> T,
    ): T = try {
        block(tensors)
    } finally {
        tensors.values.toList().asReversed().forEach { runCatching(it::close) }
    }

    private fun copyFloatValues(result: OrtSession.Result, name: String): FloatArray {
        val source = requiredTensor(result, name).floatBuffer
        return FloatArray(source.remaining()).also(source::get)
    }

    private fun decodePinnedLatents(
        root: File,
        bundle: TalosPocketBundle,
        latents: FloatArray,
        disableKleidiAi: Boolean,
    ): Pair<FloatArray, Long> {
        require(latents.size % bundle.latentDim == 0) { "host latent count does not match the bundle" }
        val environment = OrtEnvironment.getEnvironment("talos-pocket-conformance")
        val options = OrtSession.SessionOptions().apply {
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            setIntraOpNumThreads(4)
            setInterOpNumThreads(1)
            if (disableKleidiAi) addConfigEntry("mlas.disable_kleidiai", "1")
        }
        val session = environment.createSession(File(root, "mimi_decoder_int8.onnx").absolutePath, options)
        val initialState = linkedMapOf<String, OnnxTensor>()
        var initialStateClosed = false
        var previous: OrtSession.Result? = null
        val output = FloatArray(latents.size / bundle.latentDim * bundle.samplesPerFrame)
        var outputCursor = 0
        val startedAtNs = System.nanoTime()
        try {
            bundle.mimiStates.forEach { spec -> initialState[spec.inputName] = createStateTensor(environment, spec) }
            var firstFrame = 0
            while (firstFrame * bundle.latentDim < latents.size) {
                val frameCount = minOf(DECODER_BATCH_FRAMES, latents.size / bundle.latentDim - firstFrame)
                val firstLatent = firstFrame * bundle.latentDim
                val latentValues = latents.copyOfRange(firstLatent, firstLatent + frameCount * bundle.latentDim)
                val latentTensor = createFloatTensor(
                    environment,
                    longArrayOf(1, frameCount.toLong(), bundle.latentDim.toLong()),
                    latentValues,
                )
                val feeds = linkedMapOf<String, OnnxTensor>("latent" to latentTensor)
                val currentOwner = previous
                if (currentOwner == null) {
                    feeds.putAll(initialState)
                } else {
                    bundle.mimiStates.forEach { spec ->
                        feeds[spec.inputName] = requiredTensor(currentOwner, spec.outputName)
                    }
                }
                val next = try {
                    session.run(feeds)
                } finally {
                    latentTensor.close()
                }
                if (currentOwner == null) {
                    initialState.values.toList().asReversed().forEach(OnnxTensor::close)
                    initialStateClosed = true
                } else {
                    currentOwner.close()
                }
                previous = next
                val pcm = requiredTensor(next, "audio_frame").floatBuffer
                val count = pcm.remaining()
                require(count == frameCount * bundle.samplesPerFrame) {
                    "isolated Mimi decoder returned $count samples for $frameCount frames"
                }
                pcm.get(output, outputCursor, count)
                outputCursor += count
                firstFrame += frameCount
            }
            require(outputCursor == output.size) { "isolated Mimi decoder did not fill its output" }
            return output to (System.nanoTime() - startedAtNs)
        } finally {
            previous?.close()
            if (!initialStateClosed) initialState.values.toList().asReversed().forEach { runCatching(it::close) }
            session.close()
            options.close()
        }
    }

    private fun requiredTensor(result: OrtSession.Result, name: String): OnnxTensor {
        val value = result.get(name).orElseThrow { IllegalArgumentException("missing decoder output: $name") }
        require(value is OnnxTensor) { "decoder output is not a tensor: $name" }
        return value
    }

    private fun createStateTensor(environment: OrtEnvironment, spec: TalosPocketStateSpec): OnnxTensor =
        when (val value = spec.initialValue()) {
            is TalosPocketTensorData.Float32 -> createFloatTensor(environment, value.shape, value.values)
            is TalosPocketTensorData.Float16 -> {
                val buffer = directBytes(value.values.size * Short.SIZE_BYTES).asShortBuffer()
                buffer.put(value.values)
                buffer.flip()
                OnnxTensor.createTensor(environment, buffer, value.shape, OnnxJavaType.FLOAT16)
            }
            is TalosPocketTensorData.Int64 -> {
                val buffer = directBytes(value.values.size * Long.SIZE_BYTES).asLongBuffer()
                buffer.put(value.values)
                buffer.flip()
                OnnxTensor.createTensor(environment, buffer, value.shape)
            }
            is TalosPocketTensorData.Bool -> {
                val buffer = directBytes(value.values.size)
                value.values.forEach { item -> buffer.put(if (item) 1.toByte() else 0.toByte()) }
                buffer.flip()
                OnnxTensor.createTensor(environment, buffer, value.shape, OnnxJavaType.BOOL)
            }
        }

    private fun createFloatTensor(
        environment: OrtEnvironment,
        shape: LongArray,
        values: FloatArray,
    ): OnnxTensor {
        val buffer = directBytes(values.size * Float.SIZE_BYTES).asFloatBuffer()
        buffer.put(values)
        buffer.flip()
        return OnnxTensor.createTensor(environment, buffer, shape)
    }

    private fun createLongTensor(
        environment: OrtEnvironment,
        shape: LongArray,
        values: LongArray,
    ): OnnxTensor {
        val buffer = directBytes(values.size * Long.SIZE_BYTES).asLongBuffer()
        buffer.put(values)
        buffer.flip()
        return OnnxTensor.createTensor(environment, buffer, shape)
    }

    private fun directBytes(size: Int): ByteBuffer = ByteBuffer.allocateDirect(size).order(ByteOrder.nativeOrder())

    private fun readPinnedFloats(file: File, expectedCount: Int, expectedSha256: String): FloatArray {
        require(file.isFile) { "missing Pocket oracle file: ${file.name}" }
        val bytes = file.readBytes()
        require(bytes.size == expectedCount * Float.SIZE_BYTES) { "Pocket oracle size differs: ${file.name}" }
        require(sha256(bytes) == expectedSha256) { "Pocket oracle sha256 differs: ${file.name}" }
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
        return FloatArray(expectedCount).also(buffer::get).also { values ->
            require(values.all(Float::isFinite)) { "Pocket oracle contains non-finite values: ${file.name}" }
        }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private fun sha256(values: FloatArray): String {
        val bytes = ByteBuffer.allocate(values.size * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        bytes.asFloatBuffer().put(values)
        return sha256(bytes.array())
    }

    private fun sha256(values: IntArray): String {
        val bytes = ByteBuffer.allocate(values.size * Int.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        bytes.asIntBuffer().put(values)
        return sha256(bytes.array())
    }

    private fun sha256(values: LongArray): String {
        val bytes = ByteBuffer.allocate(values.size * Long.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
        bytes.asLongBuffer().put(values)
        return sha256(bytes.array())
    }

    private fun writeEvidence(file: File, value: JSONObject) {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, ".${file.name}.${System.nanoTime()}.tmp")
        temporary.writeText(value.toString(2) + "\n", Charsets.UTF_8)
        check(temporary.renameTo(file)) { "could not commit Pocket conformance evidence" }
    }

    private companion object {
        const val MANIFEST_ASSET = "voice/pocket-model-manifest.json"
        const val ORACLE_CONDITIONING = "oracle-conditioning-temp0.f32le"
        const val ORACLE_LATENTS = "oracle-latents-temp0.f32le"
        const val ORACLE_PCM = "oracle-pcm-temp0.f32le"
        const val EXPECTED_CONDITIONING_FRAMES = 112
        const val EXPECTED_CONDITIONING_FLOATS = EXPECTED_CONDITIONING_FRAMES * 1_024
        const val EXPECTED_LATENT_FLOATS = 24 * 32
        const val SAMPLES_PER_FRAME = 1_920
        const val DECODER_BATCH_FRAMES = 15
        const val EXPECTED_PCM_FLOATS = 24 * SAMPLES_PER_FRAME
        const val EXPECTED_CONDITIONING_SHA256 = "a9d6f8507dca70928d521e4aad7ac1ae426c78442e24c0e21337586e815f3b6e"
        const val EXPECTED_LATENT_SHA256 = "4d6f83fb633f305388b9a1bb109f48c85d155b47e58296d3de1f164c47749903"
        const val EXPECTED_PCM_SHA256 = "ec8e6b4a01566b6c219d8499c1c7bbdb99ae7075728c717a663f23e04930f5cb"
        const val EXPECTED_PREPARED_VOICE_SHA256 = "afa04c711975e53afd7037149b5fe5ec439ffc29882bdea7d5ea9ad582196d80"
        const val EXPECTED_VOICE_PREFILL_STATE_SHA256 = "a3353b3b432079e4d7986f8e053d45b341fd427b5ca2db8cf044e76e1e173167"
        const val EXPECTED_TEXT_EMBEDDINGS_SHA256 = "1fd5e63ccf8c42cc86e1fa738e218b044bc41cd29cf9aeca505722dd07f35f9d"
        const val EXPECTED_TEXT_PREFILL_STATE_SHA256 = "6dcc5834ac1b3651655c9a67294fb897c723e26abcb580ac9e9fbdf8b5972df7"
        const val EXPECTED_FRAME_0_AR_STATE_SHA256 = "69e6b67b3baa3c2617c40d9b467cb77ca9279de7b7845327db4e2c92dcebc209"
        const val EXPECTED_FRAME_0_CONDITIONING_SHA256 = "ab8ee11fea7fd3eeeab696a9bc5034dc8e11eb9b1c9de1aeb605fda457ebbae2"
        const val EXPECTED_FRAME_0_FLOW_DIRECTION_SHA256 = "50b90a00de967010542a6fa3af61c00614bd8a7e8b897e150f190f02649d8906"
        const val EXPECTED_FRAME_0_LATENT_SHA256 = EXPECTED_FRAME_0_FLOW_DIRECTION_SHA256
        const val EXPECTED_FRAME_1_AR_STATE_SHA256 = "061f0c82d91d367eb34dec69cfc280e7468c40798da1eaabb9ffdfd8a4ada78b"
        const val EXPECTED_FRAME_1_CONDITIONING_SHA256 = "a0985893bb835bca81751186c30107f9d6fd161ae6fc1d197eaebbe1af278aa1"
        const val EXPECTED_FRAME_1_FLOW_DIRECTION_SHA256 = "c870afcd757debe46830827baa481fafbcfc917be80b7eebb6ea8419bd4fa446"
        const val EXPECTED_FRAME_1_LATENT_SHA256 = EXPECTED_FRAME_1_FLOW_DIRECTION_SHA256
        const val EXPECTED_FRAME_0_EOS_LOGIT = -6.910767555236816f
        const val EXPECTED_FRAME_1_EOS_LOGIT = -8.473944664001465f
        const val PINNED_ORT_VERSION = "1.29.0"
        const val PUBLIC_SMOKE_TEXT = "Buongiorno, questa è la voce italiana di TALOS."
        const val MIN_HOST_LATENT_CORRELATION = 0.98
        const val MAX_DECODER_ABSOLUTE_ERROR = 0.0005
        const val MAX_DECODER_RMSE = 0.00002
        const val MIN_DECODER_CORRELATION = 0.99999

        val EXPECTED_TOKEN_IDS = intArrayOf(
            3319, 636, 261, 260, 326, 271, 272, 1336, 260, 664,
            305, 262, 260, 926, 621, 1905, 1044, 945, 263,
        )
    }
}
