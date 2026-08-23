package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketCancellation
import ai.talos.voice.pocket.TalosPocketConditioning
import ai.talos.voice.pocket.TalosPocketConfig
import ai.talos.voice.pocket.TalosPocketFrame
import ai.talos.voice.pocket.TalosPocketOrtRuntime
import ai.talos.voice.pocket.TalosPocketPipelineTerminal
import ai.talos.voice.pocket.TalosPocketStageMetric
import android.os.Build
import android.os.SystemClock
import android.system.Os
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.log10
import kotlin.math.sqrt
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Silent quality matrix over the verified public Pocket fixture. Exact PCM is
 * persisted only for this research class so a pinned host ASR can qualify the
 * same samples whose graph timing and level evidence are recorded here.
 */
@RunWith(AndroidJUnit4::class)
class TalosPocketItalianQualitySweepInstrumentedTest {
    @Test
    fun italian24LayerControlPersistsExactPublicPcmWithTimingAndLevelEvidence() {
        runItalian24LayerControl()
    }

    @Test
    fun seedSweepAtProductionConfigurationPersistsExactPublicPcmWithTimingAndLevelEvidence() {
        runSeedSweep()
    }

    @Test
    fun decoderBatchSweepAtMeasuredTemperaturePersistsExactPublicPcmWithTimingAndLevelEvidence() {
        runBatchSweep()
    }

    @Test
    fun temperatureSweepPersistsExactPublicPcmWithTimingAndLevelEvidence() {
        val fixture = Fixture.open()
        val measured = TEMPERATURES.flatMap { temperature ->
            val candidateId = "temp-${temperature.toString().replace('.', 'p')}"
            val configuration = CandidateConfiguration(
                temperature = temperature,
                lsdSteps = LSD_STEPS,
                firstDecodeFrames = FIRST_DECODE_FRAMES,
                regularDecodeFrames = REGULAR_DECODE_FRAMES,
            )
            val runtime = TalosPocketOrtRuntime.open(
                bundleRoot = fixture.modelRoot,
                cpuThreads = CPU_THREADS,
                config = TalosPocketConfig(
                    temperature = temperature,
                    lsdSteps = LSD_STEPS,
                    queueCapacityFrames = QUEUE_CAPACITY_FRAMES,
                    firstDecodeFrames = FIRST_DECODE_FRAMES,
                    regularDecodeFrames = REGULAR_DECODE_FRAMES,
                    hardMaxFramesPerSentence = MAX_FRAMES,
                    stabilizeOnset = false,
                ),
            )
            try {
                TEXTS.mapIndexed { textIndex, text ->
                    measureCandidate(
                        runtime = runtime,
                        fixture = fixture,
                        candidateId = candidateId,
                        configuration = configuration,
                        textIndex = textIndex,
                        text = text,
                        seed = SEED + textIndex,
                    )
                }
            } finally {
                runtime.close()
            }
        }
        val cases = JSONArray(measured.map(CandidateCase::toJson))
        val manifest = JSONObject()
            .put("schemaVersion", 1)
            .put("runId", fixture.runId)
            .put("sampleRate", SAMPLE_RATE)
            .put("channels", 1)
            .put("encoding", "float32le")
            .put("locale", LOCALE)
            .put("model", ASR_MODEL)
            .put("modelRevision", ASR_MODEL_REVISION)
            .put("cases", cases)
        val manifestFile = File(fixture.outputDirectory, "${fixture.runId}-temperature-asr-manifest.json")
        writeJsonAtomic(manifestFile, manifest)
        val evidence = JSONObject()
            .put("schemaVersion", 1)
            .put("gate", "POCKET-ITALIAN-QUALITY-SWEEP-01")
            .put("runId", fixture.runId)
            .put("generatedAtElapsedRealtimeNs", SystemClock.elapsedRealtimeNanos())
            .put("candidateCount", TEMPERATURES.size)
            .put("casesPerCandidate", TEXTS.size)
            .put("manifest", manifestFile.name)
            .put("manifestSha256", sha256(manifestFile))
            .put("cases", cases)
            .put("provenance", fixture.provenance())
        writeJsonAtomic(
            File(fixture.outputDirectory, "${fixture.runId}-temperature-summary.json"),
            evidence,
        )

        assertEquals(TEMPERATURES.size * TEXTS.size, measured.size)
        measured.forEach { candidate ->
            assertEquals(TalosPocketPipelineTerminal.DONE, candidate.terminal)
            assertTrue(
                "${candidate.id} hit the safety cap instead of Pocket EOS: ${candidate.generatedFrames}/$MAX_FRAMES",
                candidate.generatedFrames < MAX_FRAMES,
            )
            assertEquals(candidate.generatedFrames * SAMPLES_PER_FRAME, candidate.pcmSamples)
            assertEquals(candidate.pcmSamples, candidate.emittedSamples)
            assertEquals(0L, candidate.levels.nonFiniteSamples)
            assertTrue("${candidate.id} produced no finite PCM", candidate.pcmSamples > 0)
            assertTrue("${candidate.id} has invalid level evidence", candidate.levels.rmsDbfs.isFinite())
            assertTrue("${candidate.id} has no measured stages", candidate.stageSummary.length() > 0)
        }
    }

    private fun runBatchSweep() {
        val fixture = Fixture.open()
        val measured = REGULAR_DECODE_BATCHES.flatMap { regularDecodeFrames ->
            val candidateId = "batch-$regularDecodeFrames"
            val configuration = CandidateConfiguration(
                temperature = MEASURED_TEMPERATURE,
                lsdSteps = LSD_STEPS,
                firstDecodeFrames = FIRST_DECODE_FRAMES,
                regularDecodeFrames = regularDecodeFrames,
            )
            val runtime = TalosPocketOrtRuntime.open(
                bundleRoot = fixture.modelRoot,
                cpuThreads = CPU_THREADS,
                config = TalosPocketConfig(
                    temperature = MEASURED_TEMPERATURE,
                    lsdSteps = LSD_STEPS,
                    queueCapacityFrames = QUEUE_CAPACITY_FRAMES,
                    firstDecodeFrames = FIRST_DECODE_FRAMES,
                    regularDecodeFrames = regularDecodeFrames,
                    hardMaxFramesPerSentence = MAX_FRAMES,
                    stabilizeOnset = false,
                ),
            )
            try {
                TEXTS.mapIndexed { textIndex, text ->
                    measureCandidate(
                        runtime = runtime,
                        fixture = fixture,
                        candidateId = candidateId,
                        configuration = configuration,
                        textIndex = textIndex,
                        text = text,
                        seed = SEED + textIndex,
                    )
                }
            } finally {
                runtime.close()
            }
        }
        val cases = JSONArray(measured.map(CandidateCase::toJson))
        val manifest = JSONObject()
            .put("schemaVersion", 1)
            .put("runId", fixture.runId)
            .put("sampleRate", SAMPLE_RATE)
            .put("channels", 1)
            .put("encoding", "float32le")
            .put("locale", LOCALE)
            .put("model", ASR_MODEL)
            .put("modelRevision", ASR_MODEL_REVISION)
            .put("cases", cases)
        val manifestFile = File(fixture.outputDirectory, "${fixture.runId}-batch-asr-manifest.json")
        writeJsonAtomic(manifestFile, manifest)
        val evidence = JSONObject()
            .put("schemaVersion", 1)
            .put("gate", "POCKET-ITALIAN-QUALITY-SWEEP-01/B")
            .put("runId", fixture.runId)
            .put("generatedAtElapsedRealtimeNs", SystemClock.elapsedRealtimeNanos())
            .put("candidateCount", REGULAR_DECODE_BATCHES.size)
            .put("casesPerCandidate", TEXTS.size)
            .put("measuredTemperature", MEASURED_TEMPERATURE.toDouble())
            .put("manifest", manifestFile.name)
            .put("manifestSha256", sha256(manifestFile))
            .put("cases", cases)
            .put("provenance", fixture.provenance())
        writeJsonAtomic(
            File(fixture.outputDirectory, "${fixture.runId}-batch-summary.json"),
            evidence,
        )

        assertEquals(REGULAR_DECODE_BATCHES.size * TEXTS.size, measured.size)
        measured.forEach { candidate ->
            assertEquals(TalosPocketPipelineTerminal.DONE, candidate.terminal)
            assertTrue(
                "${candidate.id} hit the safety cap instead of Pocket EOS: ${candidate.generatedFrames}/$MAX_FRAMES",
                candidate.generatedFrames < MAX_FRAMES,
            )
            assertEquals(candidate.generatedFrames * SAMPLES_PER_FRAME, candidate.pcmSamples)
            assertEquals(candidate.pcmSamples, candidate.emittedSamples)
            assertEquals(0L, candidate.levels.nonFiniteSamples)
            assertTrue("${candidate.id} produced no finite PCM", candidate.pcmSamples > 0)
            assertTrue("${candidate.id} has invalid level evidence", candidate.levels.rmsDbfs.isFinite())
            assertTrue("${candidate.id} has no measured stages", candidate.stageSummary.length() > 0)
        }
    }

    private fun runSeedSweep() {
        val fixture = Fixture.open()
        val configuration = CandidateConfiguration(
            temperature = MEASURED_TEMPERATURE,
            lsdSteps = LSD_STEPS,
            firstDecodeFrames = FIRST_DECODE_FRAMES,
            regularDecodeFrames = PRODUCTION_REGULAR_DECODE_FRAMES,
        )
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = fixture.modelRoot,
            cpuThreads = CPU_THREADS,
            config = TalosPocketConfig(
                temperature = MEASURED_TEMPERATURE,
                lsdSteps = LSD_STEPS,
                queueCapacityFrames = QUEUE_CAPACITY_FRAMES,
                firstDecodeFrames = FIRST_DECODE_FRAMES,
                regularDecodeFrames = PRODUCTION_REGULAR_DECODE_FRAMES,
                hardMaxFramesPerSentence = MAX_FRAMES,
                stabilizeOnset = false,
            ),
        )
        val measured = try {
            QUALITY_SEEDS.flatMap { seed ->
                val candidateId = "seed-$seed"
                SEED_TEXTS.mapIndexed { textIndex, text ->
                    measureCandidate(
                        runtime = runtime,
                        fixture = fixture,
                        candidateId = candidateId,
                        configuration = configuration,
                        textIndex = textIndex,
                        text = text,
                        seed = seed,
                    )
                }
            }
        } finally {
            runtime.close()
        }
        val cases = JSONArray(measured.map(CandidateCase::toJson))
        val manifest = JSONObject()
            .put("schemaVersion", 1)
            .put("runId", fixture.runId)
            .put("sampleRate", SAMPLE_RATE)
            .put("channels", 1)
            .put("encoding", "float32le")
            .put("locale", LOCALE)
            .put("model", ASR_MODEL)
            .put("modelRevision", ASR_MODEL_REVISION)
            .put("cases", cases)
        val manifestFile = File(fixture.outputDirectory, "${fixture.runId}-seed-asr-manifest.json")
        writeJsonAtomic(manifestFile, manifest)
        val evidence = JSONObject()
            .put("schemaVersion", 1)
            .put("gate", "POCKET-ITALIAN-SEED-SWEEP-01")
            .put("runId", fixture.runId)
            .put("generatedAtElapsedRealtimeNs", SystemClock.elapsedRealtimeNanos())
            .put("candidateCount", QUALITY_SEEDS.size)
            .put("casesPerCandidate", SEED_TEXTS.size)
            .put("temperature", MEASURED_TEMPERATURE.toDouble())
            .put("firstDecodeFrames", FIRST_DECODE_FRAMES)
            .put("regularDecodeFrames", PRODUCTION_REGULAR_DECODE_FRAMES)
            .put("manifest", manifestFile.name)
            .put("manifestSha256", sha256(manifestFile))
            .put("cases", cases)
            .put("provenance", fixture.provenance())
        writeJsonAtomic(
            File(fixture.outputDirectory, "${fixture.runId}-seed-summary.json"),
            evidence,
        )

        assertEquals(QUALITY_SEEDS.size * SEED_TEXTS.size, measured.size)
        QUALITY_SEEDS.forEach { seed ->
            assertEquals(
                "seed candidate did not cover the entire public Italian corpus: $seed",
                SEED_TEXTS.size,
                measured.count { it.seed == seed },
            )
        }
        measured.forEach { candidate ->
            assertEquals(TalosPocketPipelineTerminal.DONE, candidate.terminal)
            assertTrue(
                "${candidate.id} hit the safety cap instead of Pocket EOS: ${candidate.generatedFrames}/$MAX_FRAMES",
                candidate.generatedFrames < MAX_FRAMES,
            )
            assertEquals(candidate.generatedFrames * SAMPLES_PER_FRAME, candidate.pcmSamples)
            assertEquals(candidate.pcmSamples, candidate.emittedSamples)
            assertEquals(0L, candidate.levels.nonFiniteSamples)
            assertTrue("${candidate.id} produced no finite PCM", candidate.pcmSamples > 0)
            assertTrue("${candidate.id} has invalid level evidence", candidate.levels.rmsDbfs.isFinite())
            assertTrue("${candidate.id} has no measured stages", candidate.stageSummary.length() > 0)
        }
    }

    private fun runItalian24LayerControl() {
        val fixture = Fixture.open()
        val bundleRoot = fixture.requirePinnedResearchBundle()
        val configuration = CandidateConfiguration(
            temperature = MEASURED_TEMPERATURE,
            lsdSteps = LSD_STEPS,
            firstDecodeFrames = FIRST_DECODE_FRAMES,
            regularDecodeFrames = PRODUCTION_REGULAR_DECODE_FRAMES,
        )
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = bundleRoot,
            cpuThreads = CPU_THREADS,
            config = TalosPocketConfig(
                temperature = MEASURED_TEMPERATURE,
                lsdSteps = LSD_STEPS,
                queueCapacityFrames = QUEUE_CAPACITY_FRAMES,
                firstDecodeFrames = FIRST_DECODE_FRAMES,
                regularDecodeFrames = PRODUCTION_REGULAR_DECODE_FRAMES,
                hardMaxFramesPerSentence = MAX_FRAMES,
                stabilizeOnset = false,
            ),
        )
        val measured = try {
            SEED_TEXTS.mapIndexed { textIndex, text ->
                measureCandidate(
                    runtime = runtime,
                    fixture = fixture,
                    candidateId = CONTROL_24L_CANDIDATE_ID,
                    configuration = configuration,
                    textIndex = textIndex,
                    text = text,
                    seed = CONTROL_SEED,
                )
            }
        } finally {
            runtime.close()
        }
        val cases = JSONArray(measured.map(CandidateCase::toJson))
        val manifest = JSONObject()
            .put("schemaVersion", 1)
            .put("runId", fixture.runId)
            .put("sampleRate", SAMPLE_RATE)
            .put("channels", 1)
            .put("encoding", "float32le")
            .put("locale", LOCALE)
            .put("model", ASR_MODEL)
            .put("modelRevision", ASR_MODEL_REVISION)
            .put("cases", cases)
        val manifestFile = File(fixture.outputDirectory, "${fixture.runId}-italian-24l-asr-manifest.json")
        writeJsonAtomic(manifestFile, manifest)
        val evidence = JSONObject()
            .put("schemaVersion", 1)
            .put("gate", "POCKET-ITALIAN-24L-CONTROL-01")
            .put("runId", fixture.runId)
            .put("generatedAtElapsedRealtimeNs", SystemClock.elapsedRealtimeNanos())
            .put("candidateCount", 1)
            .put("casesPerCandidate", SEED_TEXTS.size)
            .put("bundleName", CONTROL_24L_BUNDLE_NAME)
            .put("bundleRevision", TalosPocketConditioningPayload.REVISION)
            .put("bundleFiles", JSONArray(CONTROL_24L_FILES.map(PinnedResearchFile::toJson)))
            .put("seed", CONTROL_SEED)
            .put("temperature", MEASURED_TEMPERATURE.toDouble())
            .put("firstDecodeFrames", FIRST_DECODE_FRAMES)
            .put("regularDecodeFrames", PRODUCTION_REGULAR_DECODE_FRAMES)
            .put("manifest", manifestFile.name)
            .put("manifestSha256", sha256(manifestFile))
            .put("cases", cases)
            .put("provenance", fixture.provenance())
        writeJsonAtomic(
            File(fixture.outputDirectory, "${fixture.runId}-italian-24l-summary.json"),
            evidence,
        )

        assertEquals(SEED_TEXTS.size, measured.size)
        measured.forEach { candidate ->
            assertEquals(TalosPocketPipelineTerminal.DONE, candidate.terminal)
            assertTrue(
                "${candidate.id} hit the safety cap instead of Pocket EOS: ${candidate.generatedFrames}/$MAX_FRAMES",
                candidate.generatedFrames < MAX_FRAMES,
            )
            assertEquals(candidate.generatedFrames * SAMPLES_PER_FRAME, candidate.pcmSamples)
            assertEquals(candidate.pcmSamples, candidate.emittedSamples)
            assertEquals(0L, candidate.levels.nonFiniteSamples)
            assertTrue("${candidate.id} produced no finite PCM", candidate.pcmSamples > 0)
            assertTrue("${candidate.id} has invalid RTF", candidate.rtf.isFinite())
            assertTrue("${candidate.id} has invalid level evidence", candidate.levels.rmsDbfs.isFinite())
            assertTrue("${candidate.id} has no measured stages", candidate.stageSummary.length() > 0)
        }
    }

    private fun measureCandidate(
        runtime: TalosPocketOrtRuntime,
        fixture: Fixture,
        candidateId: String,
        configuration: CandidateConfiguration,
        textIndex: Int,
        text: String,
        seed: Long,
    ): CandidateCase {
        val capture = PcmCapture()
        val arrivals = mutableListOf<Arrival>()
        val stages = mutableListOf<TalosPocketStageMetric>()
        val result = runtime.synthesize(
            source = text,
            conditioning = fixture.conditioning,
            maxFramesPerSentence = MAX_FRAMES,
            seed = seed,
            cancellation = TalosPocketCancellation(),
            callback = object : TalosPocketCallback {
                override fun onStage(metric: TalosPocketStageMetric) {
                    stages += metric
                }

                override fun onPcm(frame: TalosPocketFrame): Boolean {
                    require(frame.sampleRate == SAMPLE_RATE)
                    require(frame.pcmFloatMono.size == frame.frameCount * SAMPLES_PER_FRAME)
                    arrivals += Arrival(
                        observedAtNs = SystemClock.elapsedRealtimeNanos(),
                        sentenceIndex = frame.sentenceIndex,
                        firstFrameIndex = frame.firstFrameIndex,
                        frameCount = frame.frameCount,
                    )
                    capture.accept(frame.pcmFloatMono)
                    return true
                }
            },
        )
        val pcmFile = File(fixture.outputDirectory, "${fixture.runId}-$candidateId-$textIndex.f32le")
        val levels = capture.finishLevels()
        val pcmSamples = capture.writeAndClear(pcmFile)
        return CandidateCase(
            id = "$candidateId-$textIndex",
            candidateId = candidateId,
            configuration = configuration,
            expectedText = text,
            textSha256 = sha256(text.toByteArray(Charsets.UTF_8)),
            seed = seed,
            pcmFile = pcmFile.name,
            pcmSha256 = sha256(pcmFile),
            pcmSamples = pcmSamples,
            terminal = result.terminal,
            generatedFrames = result.generatedFrames,
            emittedSamples = result.emittedSamples,
            elapsedMs = result.elapsedNs / 1_000_000.0,
            rtf = requireNotNull(result.rtf),
            producerBlockedMs = result.producerBlockedNs / 1_000_000.0,
            decoderMs = result.decoderNs / 1_000_000.0,
            queueHighWatermarkFrames = result.queueHighWatermarkFrames,
            arrivals = arrivals,
            levels = levels,
            stageSummary = summarizeStages(stages),
        )
    }

    private data class CandidateConfiguration(
        val temperature: Float,
        val lsdSteps: Int,
        val firstDecodeFrames: Int,
        val regularDecodeFrames: Int,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("temperature", temperature.toDouble())
            .put("lsdSteps", lsdSteps)
            .put("firstDecodeFrames", firstDecodeFrames)
            .put("regularDecodeFrames", regularDecodeFrames)
            .put("queueCapacityFrames", QUEUE_CAPACITY_FRAMES)
            .put("cpuThreads", CPU_THREADS)
            .put("maxFrames", MAX_FRAMES)
    }

    private data class PinnedResearchFile(
        val name: String,
        val sizeBytes: Long,
        val sha256: String,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("name", name)
            .put("sizeBytes", sizeBytes)
            .put("sha256", sha256)
    }

    private data class Arrival(
        val observedAtNs: Long,
        val sentenceIndex: Int,
        val firstFrameIndex: Int,
        val frameCount: Int,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("observedAtNs", observedAtNs)
            .put("sentenceIndex", sentenceIndex)
            .put("firstFrameIndex", firstFrameIndex)
            .put("frameCount", frameCount)
    }

    private data class PcmLevelEvidence(
        val sampleCount: Int,
        val nonFiniteSamples: Long,
        val peakAbs: Double,
        val rmsDbfs: Double,
        val p99Abs: Double,
        val dcOffset: Double,
        val clippedSampleRatio: Double,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("sampleCount", sampleCount)
            .put("nonFiniteSamples", nonFiniteSamples)
            .put("peakAbs", peakAbs)
            .put("rmsDbfs", rmsDbfs)
            .put("p99Abs", p99Abs)
            .put("dcOffset", dcOffset)
            .put("clippedSampleRatio", clippedSampleRatio)
    }

    private data class CandidateCase(
        val id: String,
        val candidateId: String,
        val configuration: CandidateConfiguration,
        val expectedText: String,
        val textSha256: String,
        val seed: Long,
        val pcmFile: String,
        val pcmSha256: String,
        val pcmSamples: Int,
        val terminal: TalosPocketPipelineTerminal,
        val generatedFrames: Int,
        val emittedSamples: Int,
        val elapsedMs: Double,
        val rtf: Double,
        val producerBlockedMs: Double,
        val decoderMs: Double,
        val queueHighWatermarkFrames: Int,
        val arrivals: List<Arrival>,
        val levels: PcmLevelEvidence,
        val stageSummary: JSONObject,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("id", id)
            .put("candidateId", candidateId)
            .put("configuration", configuration.toJson())
            .put("expectedText", expectedText)
            .put("textSha256", textSha256)
            .put("seed", seed)
            .put("pcmFile", pcmFile)
            .put("pcmSha256", pcmSha256)
            .put("pcmSamples", pcmSamples)
            .put("terminal", terminal.name)
            .put("endedBeforeHardCap", generatedFrames < MAX_FRAMES)
            .put("generatedFrames", generatedFrames)
            .put("emittedSamples", emittedSamples)
            .put("elapsedMs", elapsedMs)
            .put("rtf", rtf)
            .put("producerBlockedMs", producerBlockedMs)
            .put("decoderMs", decoderMs)
            .put("queueHighWatermarkFrames", queueHighWatermarkFrames)
            .put("arrivals", JSONArray(arrivals.map(Arrival::toJson)))
            .put("levels", levels.toJson())
            .put("stageSummary", stageSummary)
    }

    private class PcmCapture {
        private val chunks = mutableListOf<FloatArray>()
        private val absoluteValues = mutableListOf<Float>()
        private var finiteSampleCount = 0L
        private var nonFiniteSampleCount = 0L
        private var clippedSampleCount = 0L
        private var sum = 0.0
        private var sumSquares = 0.0
        private var peak = 0.0

        fun accept(values: FloatArray) {
            chunks += values.copyOf()
            values.forEach { raw ->
                if (!raw.isFinite()) {
                    nonFiniteSampleCount += 1
                    return@forEach
                }
                val value = raw.toDouble()
                val magnitude = abs(value)
                finiteSampleCount += 1
                sum += value
                sumSquares += value * value
                peak = maxOf(peak, magnitude)
                if (magnitude >= 0.999) clippedSampleCount += 1
                absoluteValues += magnitude.toFloat()
            }
        }

        fun finishLevels(): PcmLevelEvidence {
            require(finiteSampleCount > 0L) { "Pocket candidate emitted no finite PCM" }
            require(finiteSampleCount <= Int.MAX_VALUE)
            absoluteValues.sort()
            val rms = sqrt(sumSquares / finiteSampleCount)
            val p99Index = (ceil(absoluteValues.size * 0.99).toInt() - 1)
                .coerceIn(0, absoluteValues.lastIndex)
            val evidence = PcmLevelEvidence(
                sampleCount = finiteSampleCount.toInt(),
                nonFiniteSamples = nonFiniteSampleCount,
                peakAbs = peak,
                rmsDbfs = if (rms > 0.0) 20.0 * log10(rms) else Double.NEGATIVE_INFINITY,
                p99Abs = absoluteValues[p99Index].toDouble(),
                dcOffset = sum / finiteSampleCount,
                clippedSampleRatio = clippedSampleCount.toDouble() / finiteSampleCount,
            )
            absoluteValues.fill(0f)
            absoluteValues.clear()
            return evidence
        }

        fun writeAndClear(file: File): Int {
            val totalSamples = chunks.sumOf(FloatArray::size)
            try {
                file.outputStream().buffered().use { output ->
                    chunks.forEach { chunk ->
                        val bytes = ByteBuffer.allocate(chunk.size * Float.SIZE_BYTES)
                            .order(ByteOrder.LITTLE_ENDIAN)
                        bytes.asFloatBuffer().put(chunk)
                        output.write(bytes.array())
                        bytes.array().fill(0)
                    }
                }
            } finally {
                chunks.forEach { it.fill(0f) }
                chunks.clear()
            }
            return totalSamples
        }
    }

    private class Fixture private constructor(
        val runId: String,
        val appCommit: String,
        val appApkSha256: String,
        val testApkSha256: String,
        val usbTransportProof: String,
        val modelManifestSha256: String,
        val packageName: String,
        val modelRoot: File,
        val conditioning: TalosPocketConditioning,
        val outputDirectory: File,
    ) {
        fun provenance(): JSONObject = JSONObject()
            .put("appCommit", appCommit)
            .put("apkSha256", appApkSha256)
            .put("testApkSha256", testApkSha256)
            .put("modelRevision", TalosPocketConditioningPayload.REVISION)
            .put("modelManifestSha256", modelManifestSha256)
            .put("deviceFingerprint", Build.FINGERPRINT)
            .put("usbTransportProof", usbTransportProof)
            .put("packageName", packageName)
            .put("onnxRuntime", "1.29.0")

        fun requirePinnedResearchBundle(): File {
            val modelsRoot = File(requireNotNull(outputDirectory.parentFile), "models").canonicalFile
            val bundleRoot = File(modelsRoot, CONTROL_24L_BUNDLE_NAME).canonicalFile
            require(bundleRoot.parentFile == modelsRoot && bundleRoot.isDirectory) {
                "pinned Pocket control bundle is absent: ${bundleRoot.absolutePath}"
            }
            CONTROL_24L_FILES.forEach { expected ->
                val file = File(bundleRoot, expected.name).canonicalFile
                require(file.parentFile == bundleRoot && file.isFile) {
                    "pinned Pocket control file is absent: ${expected.name}"
                }
                require(file.length() == expected.sizeBytes) {
                    "pinned Pocket control file size differs: ${expected.name}"
                }
                require(sha256(file) == expected.sha256) {
                    "pinned Pocket control file SHA-256 differs: ${expected.name}"
                }
            }
            return bundleRoot
        }

        companion object {
            fun open(): Fixture {
                val instrumentation = InstrumentationRegistry.getInstrumentation()
                val context = instrumentation.targetContext
                val arguments = InstrumentationRegistry.getArguments()
                val runId = requireArgument(arguments, "talosRunId")
                require(runId.matches(Regex("[A-Za-z0-9][A-Za-z0-9_.:-]{0,110}"))) { "runId is unsafe" }
                val appCommit = requireArgument(arguments, "talosAppCommit")
                val expectedAppSha = requireArgument(arguments, "talosApkSha256")
                val expectedTestSha = requireArgument(arguments, "talosTestApkSha256")
                val usbProof = String(
                    Base64.decode(
                        requireArgument(arguments, "talosUsbTransportProofBase64"),
                        Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING,
                    ),
                    Charsets.UTF_8,
                )
                require(usbProof.startsWith("USB\\")) { "decoded USB transport proof is invalid" }
                val actualAppSha = sha256(File(context.applicationInfo.sourceDir))
                val actualTestSha = sha256(File(instrumentation.context.applicationInfo.sourceDir))
                require(actualAppSha == expectedAppSha) { "installed app APK SHA-256 differs from USB runner" }
                require(actualTestSha == expectedTestSha) { "installed test APK SHA-256 differs from USB runner" }

                val manifestBytes = context.assets.open(MANIFEST_ASSET).use { it.readBytes() }
                val manifest = TalosPocketModelManifest.fromJson(JSONObject(String(manifestBytes, Charsets.UTF_8)))
                val modelRoot = TalosPocketModelManager.modelRoot(requireNotNull(context.getExternalFilesDir(null)))
                val status = TalosPocketModelManager.validate(modelRoot, manifest)
                require(status is TalosPocketModelStatus.Ready) {
                    "Pocket model must be verified before quality sweep: $status"
                }
                val values = readPinnedFloats(
                    File(modelRoot, ORACLE_CONDITIONING),
                    EXPECTED_CONDITIONING_FLOATS,
                    EXPECTED_CONDITIONING_SHA256,
                )
                val output = File(
                    requireNotNull(context.getExternalFilesDir(null)),
                    "research/voice/pocket-italian-quality",
                ).apply { mkdirs() }
                return Fixture(
                    runId = runId,
                    appCommit = appCommit,
                    appApkSha256 = actualAppSha,
                    testApkSha256 = actualTestSha,
                    usbTransportProof = usbProof,
                    modelManifestSha256 = sha256(manifestBytes),
                    packageName = context.packageName,
                    modelRoot = modelRoot,
                    conditioning = TalosPocketConditioning.create(
                        longArrayOf(1, EXPECTED_CONDITIONING_FRAMES.toLong(), 1_024),
                        values,
                    ),
                    outputDirectory = output,
                )
            }
        }
    }

    private companion object {
        const val MANIFEST_ASSET = "voice/pocket-model-manifest.json"
        const val ORACLE_CONDITIONING = "oracle-conditioning-temp0.f32le"
        const val EXPECTED_CONDITIONING_FRAMES = 112
        const val EXPECTED_CONDITIONING_FLOATS = EXPECTED_CONDITIONING_FRAMES * 1_024
        const val EXPECTED_CONDITIONING_SHA256 = "a9d6f8507dca70928d521e4aad7ac1ae426c78442e24c0e21337586e815f3b6e"
        const val CPU_THREADS = 4
        const val SAMPLE_RATE = 24_000
        const val SAMPLES_PER_FRAME = 1_920
        const val MAX_FRAMES = 96
        const val QUEUE_CAPACITY_FRAMES = 24
        const val LSD_STEPS = 1
        const val FIRST_DECODE_FRAMES = 2
        const val REGULAR_DECODE_FRAMES = 2
        const val PRODUCTION_REGULAR_DECODE_FRAMES = 3
        const val MEASURED_TEMPERATURE = 0.3f
        const val SEED = 19L
        const val LOCALE = "it-IT"
        const val ASR_MODEL = "openai/whisper-large-v3-turbo"
        const val ASR_MODEL_REVISION = "cf7667b3865845227378e06c611d63789cbcdcce"
        const val CONTROL_24L_BUNDLE_NAME = "italian_24l"
        const val CONTROL_24L_CANDIDATE_ID = "italian-24l-seed-42"
        const val CONTROL_SEED = 42L

        val TEMPERATURES = listOf(0.0f, 0.3f, 0.5f, 0.7f)
        val REGULAR_DECODE_BATCHES = listOf(2, 3, 12)
        val CONTROL_24L_FILES = listOf(
            PinnedResearchFile("bundle.json", 42_241L, "4b7fd6f191cd1f48a8459833a390a1e2ad59bc284fa11e518bcdb64f36fb95d1"),
            PinnedResearchFile("bos_before_voice.npy", 4_224L, "deced13188657a3543766500639e33271fd368b0f324bded9f9e615d42a23407"),
            PinnedResearchFile("flow_lm_main_int8.onnx", 305_144_125L, "8c7b0dc076e6bed28d88fa7ca20e74e63418e9e7ad21b86d2558e48211c811d4"),
            PinnedResearchFile("flow_lm_flow_int8.onnx", 9_962_530L, "21b2bec2f9ae4323fc545a0c7ffb274bdfa925a699fd304ed03aba53e4ca9129"),
            PinnedResearchFile("mimi_decoder_int8.onnx", 22_684_077L, "f120bc5cddca9514c511f128786f5d9e6e6893b067faae5e30f5b2bd5643aa03"),
            PinnedResearchFile("mimi_encoder.onnx", 39_768_446L, "1f436e797ffd8147a1435aae3cf5fc5f17a3fa0bfd7b47438143a2682ba91208"),
            PinnedResearchFile("text_conditioner.onnx", 16_388_344L, "00ff8327e832c8e46a4562cef886b53977c76c1e09bb4448c4a879689bced83d"),
            PinnedResearchFile("tokenizer.model", 60_078L, "6583b974a11b90e14d8a4c8e9c43f06c3861b9ede6e5023a4c27ab5a3a7d4c39"),
        )
        val QUALITY_SEEDS = listOf(
            19L,
            20L,
            42L,
            104_729L,
            20_260_823L,
            1_787_505_299_628L,
            281_474_976_710_655L,
        )
        val TEXTS = listOf(
            "La prima frase attraversa la porta della chat e deve terminare senza svuotare il flusso.",
            "La seconda frase usa la coda aggiuntiva e conserva la stessa voce italiana selezionata.",
            "La terza frase chiude la lettura mantenendo continuità, profilo e locale fino alla fine.",
        )
        val SEED_TEXTS = TEXTS + listOf(
            "Gli gnocchi caldi arrivano insieme agli asparagi e alle cipolle croccanti.",
            "Quell'acqua frizzante è già pronta accanto alla bottiglia di vetro.",
            "Perché la qualità della pronuncia resti chiara, ogni sillaba deve essere completa.",
            "Lo zaino azzurro scivola silenziosamente sulla ghiaia del giardino.",
            "C'erano cinque ciclisti sulla strada stretta quando cominciò a piovere.",
            "Oggi scegliamo una voce naturale, fluida e comprensibile anche nelle letture lunghe.",
        )

        fun requireArgument(arguments: android.os.Bundle, name: String): String =
            requireNotNull(arguments.getString(name)?.takeIf(String::isNotBlank)) {
                "missing required instrumentation argument: $name"
            }

        fun readPinnedFloats(file: File, expectedCount: Int, expectedSha256: String): FloatArray {
            require(file.isFile) { "missing Pocket conditioning fixture: ${file.absolutePath}" }
            val bytes = file.readBytes()
            require(sha256(bytes) == expectedSha256) { "Pocket conditioning fixture SHA-256 differs" }
            require(bytes.size == expectedCount * Float.SIZE_BYTES) { "Pocket conditioning fixture size differs" }
            val source = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
            return FloatArray(expectedCount).also { values ->
                source.get(values)
                require(values.all(Float::isFinite)) { "Pocket conditioning fixture contains non-finite values" }
            }
        }

        fun summarizeStages(metrics: List<TalosPocketStageMetric>): JSONObject {
            val result = JSONObject()
            metrics.groupBy(TalosPocketStageMetric::stage).toSortedMap().forEach { (stage, rows) ->
                val durations = rows.map(TalosPocketStageMetric::durationNs).sorted()
                val p95Index = (ceil(durations.size * 0.95).toInt() - 1).coerceIn(0, durations.lastIndex)
                result.put(
                    stage,
                    JSONObject()
                        .put("count", rows.size)
                        .put("totalMs", durations.sum() / 1_000_000.0)
                        .put("maxMs", durations.last() / 1_000_000.0)
                        .put("p95Ms", durations[p95Index] / 1_000_000.0)
                        .put("firstStartedAtNs", rows.minOf(TalosPocketStageMetric::startedAtNs))
                        .put(
                            "lastFinishedAtNs",
                            rows.maxOf { metric -> metric.startedAtNs + metric.durationNs },
                        )
                        .put(
                            "threads",
                            JSONArray(rows.map(TalosPocketStageMetric::threadName).distinct().sorted()),
                        )
                        .put(
                            "maxResidentStateBytes",
                            rows.mapNotNull(TalosPocketStageMetric::residentStateBytes).maxOrNull()
                                ?: JSONObject.NULL,
                        ),
                )
            }
            return result
        }

        fun writeJsonAtomic(file: File, value: JSONObject) {
            val temporary = File(file.parentFile, ".${file.name}.${System.nanoTime()}.tmp")
            temporary.writeText(value.toString(2) + "\n", Charsets.UTF_8)
            try {
                Os.rename(temporary.absolutePath, file.absolutePath)
            } finally {
                if (temporary.exists()) temporary.delete()
            }
        }

        fun sha256(file: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(1024 * 1024)
            try {
                file.inputStream().buffered().use { input ->
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        digest.update(buffer, 0, read)
                    }
                }
            } finally {
                buffer.fill(0)
            }
            return digest.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }

        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
