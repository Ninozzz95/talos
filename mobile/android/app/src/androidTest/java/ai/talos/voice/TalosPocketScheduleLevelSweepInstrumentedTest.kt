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
import kotlin.math.ceil
import kotlin.math.ln
import kotlin.math.sqrt
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Silent, one-variable Pocket scheduler and level sweep. This class never
 * creates an AudioTrack and never persists PCM or conditioning: it measures
 * when the real bundle can hand each decoded batch to the production sink.
 */
@RunWith(AndroidJUnit4::class)
class TalosPocketScheduleLevelSweepInstrumentedTest {
    @Test
    fun realPocketBundleOrdersDecodeSchedulesAndMeasuresPcmLevelWithoutPlayback() {
        val fixture = Fixture.open()
        val scheduleRows = SCHEDULES.map { schedule ->
            measureCandidate(
                root = fixture.modelRoot,
                conditioning = fixture.conditioning,
                firstDecodeFrames = schedule.first,
                regularDecodeFrames = schedule.second,
                lsdSteps = 1,
                repetitions = SCHEDULE_REPETITIONS,
            )
        }
        val eligible = scheduleRows.filter { candidate -> candidate.eligible }
        val schedulerForLsd = eligible.minWithOrNull(
            compareBy<CandidateEvidence> { it.medianRtf }
                .thenByDescending { it.worstLeadBeforeArrivalMs }
                .thenBy { it.regularDecodeFrames },
        )
        val lsdRows = schedulerForLsd?.let { selected ->
            LSD_STEPS.map { steps ->
                measureCandidate(
                    root = fixture.modelRoot,
                    conditioning = fixture.conditioning,
                    firstDecodeFrames = selected.firstDecodeFrames,
                    regularDecodeFrames = selected.regularDecodeFrames,
                    lsdSteps = steps,
                    repetitions = LSD_REPETITIONS,
                )
            }
        }.orEmpty()

        fixture.writeEvidence(
            JSONObject()
                .put("schemaVersion", 1)
                .put("gate", "POCKET-SCHEDULER-LEVEL-SWEEP-01")
                .put("runId", fixture.runId)
                .put("generatedAtElapsedRealtimeNs", SystemClock.elapsedRealtimeNanos())
                .put("textSha256", sha256(TEXT.toByteArray(Charsets.UTF_8)))
                .put("textCodePointCount", TEXT.codePointCount(0, TEXT.length))
                .put("seed", SEED)
                .put("temperature", TEMPERATURE.toDouble())
                .put("maxFrames", MAX_FRAMES)
                .put("scheduleRepetitions", SCHEDULE_REPETITIONS)
                .put("lsdRepetitions", LSD_REPETITIONS)
                .put("scheduleRows", JSONArray(scheduleRows.map(CandidateEvidence::toJson)))
                .put(
                    "selectedSchedulerForLsd",
                    schedulerForLsd?.let {
                        JSONObject()
                            .put("firstDecodeFrames", it.firstDecodeFrames)
                            .put("regularDecodeFrames", it.regularDecodeFrames)
                    } ?: JSONObject.NULL,
                )
                .put("lsdRows", JSONArray(lsdRows.map(CandidateEvidence::toJson)))
                .put("provenance", fixture.provenance()),
        )

        val current = scheduleRows.single { it.firstDecodeFrames == 2 && it.regularDecodeFrames == 12 }
        assertTrue(
            "the measured production schedule no longer reproduces its pre-second-batch starvation: $current",
            current.worstLeadBeforeArrivalMs < 0.0,
        )
        assertTrue("no measured scheduler preserved realtime lead and RTF: $scheduleRows", eligible.isNotEmpty())
        (scheduleRows + lsdRows).forEach { row ->
            assertEquals(TalosPocketPipelineTerminal.DONE, row.terminal)
            assertEquals(MAX_FRAMES, row.generatedFrames)
            assertEquals(0L, row.nonFiniteSamples)
            assertTrue("candidate produced no PCM: $row", row.sampleCount > 0L)
            assertTrue("candidate level is invalid: $row", row.peakAbs.isFinite() && row.rmsDbfs.isFinite())
        }
    }

    private fun measureCandidate(
        root: File,
        conditioning: TalosPocketConditioning,
        firstDecodeFrames: Int,
        regularDecodeFrames: Int,
        lsdSteps: Int,
        repetitions: Int,
    ): CandidateEvidence {
        val repetitionsEvidence = ArrayList<RepetitionEvidence>(repetitions)
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = root,
            cpuThreads = CPU_THREADS,
            config = TalosPocketConfig(
                temperature = TEMPERATURE,
                lsdSteps = lsdSteps,
                queueCapacityFrames = QUEUE_CAPACITY_FRAMES,
                firstDecodeFrames = firstDecodeFrames,
                regularDecodeFrames = regularDecodeFrames,
                hardMaxFramesPerSentence = MAX_FRAMES,
                stabilizeOnset = false,
            ),
        )
        try {
            repeat(repetitions) { repetition ->
                val arrivals = mutableListOf<Arrival>()
                val levels = PcmLevels()
                val result = runtime.synthesize(
                    source = TEXT,
                    conditioning = conditioning,
                    maxFramesPerSentence = MAX_FRAMES,
                    seed = SEED,
                    cancellation = TalosPocketCancellation(),
                    callback = object : TalosPocketCallback {
                        override fun onStage(metric: TalosPocketStageMetric) = Unit

                        override fun onPcm(frame: TalosPocketFrame): Boolean {
                            val observedAtNs = SystemClock.elapsedRealtimeNanos()
                            require(frame.sampleRate == SAMPLE_RATE)
                            require(frame.pcmFloatMono.size == frame.frameCount * SAMPLES_PER_FRAME)
                            arrivals += Arrival(
                                observedAtNs = observedAtNs,
                                firstFrameIndex = frame.firstFrameIndex,
                                frameCount = frame.frameCount,
                            )
                            levels.add(frame.pcmFloatMono)
                            return true
                        }
                    },
                )
                val simulation = simulateImmediatePlayback(arrivals)
                repetitionsEvidence += RepetitionEvidence(
                    repetition = repetition,
                    terminal = result.terminal,
                    generatedFrames = result.generatedFrames,
                    emittedSamples = result.emittedSamples,
                    rtf = requireNotNull(result.rtf),
                    producerBlockedMs = result.producerBlockedNs / 1_000_000.0,
                    decoderMs = result.decoderNs / 1_000_000.0,
                    queueHighWatermarkFrames = result.queueHighWatermarkFrames,
                    arrivalIntervalsMs = simulation.arrivalIntervalsMs,
                    leadBeforeArrivalMs = simulation.leadBeforeArrivalMs,
                    levels = levels.finish(),
                )
            }
        } finally {
            runtime.close()
        }
        return CandidateEvidence.from(
            firstDecodeFrames = firstDecodeFrames,
            regularDecodeFrames = regularDecodeFrames,
            lsdSteps = lsdSteps,
            repetitions = repetitionsEvidence,
        )
    }

    private fun simulateImmediatePlayback(arrivals: List<Arrival>): PlaybackSimulation {
        require(arrivals.isNotEmpty()) { "Pocket candidate emitted no callbacks" }
        val firstAtNs = arrivals.first().observedAtNs
        var emittedBeforeMs = 0.0
        var previousAtNs = firstAtNs
        val intervals = ArrayList<Double>(arrivals.size)
        val leads = ArrayList<Double>(arrivals.size)
        arrivals.forEachIndexed { index, arrival ->
            val elapsedMs = (arrival.observedAtNs - firstAtNs) / 1_000_000.0
            intervals += if (index == 0) 0.0 else (arrival.observedAtNs - previousAtNs) / 1_000_000.0
            leads += if (index == 0) 0.0 else emittedBeforeMs - elapsedMs
            emittedBeforeMs += arrival.frameCount * FRAME_DURATION_MS
            previousAtNs = arrival.observedAtNs
        }
        return PlaybackSimulation(intervals, leads)
    }

    private data class Arrival(
        val observedAtNs: Long,
        val firstFrameIndex: Int,
        val frameCount: Int,
    )

    private data class PlaybackSimulation(
        val arrivalIntervalsMs: List<Double>,
        val leadBeforeArrivalMs: List<Double>,
    )

    private data class LevelEvidence(
        val sampleCount: Long,
        val nonFiniteSamples: Long,
        val peakAbs: Double,
        val rmsDbfs: Double,
        val p99Abs: Double,
        val clippedSampleRatio: Double,
    )

    private class PcmLevels {
        private val absolute = ArrayList<Float>(MAX_FRAMES * SAMPLES_PER_FRAME)
        private var sampleCount = 0L
        private var nonFinite = 0L
        private var clipped = 0L
        private var peak = 0.0
        private var sumSquares = 0.0

        fun add(values: FloatArray) {
            values.forEach { raw ->
                if (!raw.isFinite()) {
                    nonFinite += 1
                    return@forEach
                }
                val value = raw.toDouble()
                val magnitude = kotlin.math.abs(value)
                sampleCount += 1
                sumSquares += value * value
                peak = maxOf(peak, magnitude)
                if (magnitude >= 0.999) clipped += 1
                absolute += magnitude.toFloat()
            }
        }

        fun finish(): LevelEvidence {
            require(sampleCount > 0L)
            absolute.sort()
            val rms = sqrt(sumSquares / sampleCount)
            val p99Index = (ceil(absolute.size * 0.99).toInt() - 1).coerceIn(0, absolute.lastIndex)
            return LevelEvidence(
                sampleCount = sampleCount,
                nonFiniteSamples = nonFinite,
                peakAbs = peak,
                rmsDbfs = if (rms > 0.0) 20.0 * ln(rms) / ln(10.0) else Double.NEGATIVE_INFINITY,
                p99Abs = absolute[p99Index].toDouble(),
                clippedSampleRatio = clipped.toDouble() / sampleCount,
            )
        }
    }

    private data class RepetitionEvidence(
        val repetition: Int,
        val terminal: TalosPocketPipelineTerminal,
        val generatedFrames: Int,
        val emittedSamples: Int,
        val rtf: Double,
        val producerBlockedMs: Double,
        val decoderMs: Double,
        val queueHighWatermarkFrames: Int,
        val arrivalIntervalsMs: List<Double>,
        val leadBeforeArrivalMs: List<Double>,
        val levels: LevelEvidence,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("repetition", repetition)
            .put("terminal", terminal.name)
            .put("generatedFrames", generatedFrames)
            .put("emittedSamples", emittedSamples)
            .put("rtf", rtf)
            .put("producerBlockedMs", producerBlockedMs)
            .put("decoderMs", decoderMs)
            .put("queueHighWatermarkFrames", queueHighWatermarkFrames)
            .put("arrivalIntervalsMs", JSONArray(arrivalIntervalsMs))
            .put("leadBeforeArrivalMs", JSONArray(leadBeforeArrivalMs))
            .put("sampleCount", levels.sampleCount)
            .put("nonFiniteSamples", levels.nonFiniteSamples)
            .put("peakAbs", levels.peakAbs)
            .put("rmsDbfs", levels.rmsDbfs)
            .put("p99Abs", levels.p99Abs)
            .put("clippedSampleRatio", levels.clippedSampleRatio)
    }

    private data class CandidateEvidence(
        val firstDecodeFrames: Int,
        val regularDecodeFrames: Int,
        val lsdSteps: Int,
        val terminal: TalosPocketPipelineTerminal,
        val generatedFrames: Int,
        val sampleCount: Long,
        val nonFiniteSamples: Long,
        val peakAbs: Double,
        val rmsDbfs: Double,
        val p99Abs: Double,
        val clippedSampleRatio: Double,
        val medianRtf: Double,
        val worstLeadBeforeArrivalMs: Double,
        val repetitions: List<RepetitionEvidence>,
    ) {
        val eligible: Boolean
            get() = terminal == TalosPocketPipelineTerminal.DONE &&
                generatedFrames == MAX_FRAMES &&
                nonFiniteSamples == 0L &&
                worstLeadBeforeArrivalMs >= 0.0 &&
                medianRtf <= CORE_RTF_P95_MAX

        fun toJson(): JSONObject = JSONObject()
            .put("firstDecodeFrames", firstDecodeFrames)
            .put("regularDecodeFrames", regularDecodeFrames)
            .put("lsdSteps", lsdSteps)
            .put("terminal", terminal.name)
            .put("generatedFrames", generatedFrames)
            .put("sampleCount", sampleCount)
            .put("nonFiniteSamples", nonFiniteSamples)
            .put("peakAbs", peakAbs)
            .put("rmsDbfs", rmsDbfs)
            .put("p99Abs", p99Abs)
            .put("clippedSampleRatio", clippedSampleRatio)
            .put("medianRtf", medianRtf)
            .put("worstLeadBeforeArrivalMs", worstLeadBeforeArrivalMs)
            .put("eligible", eligible)
            .put("repetitions", JSONArray(repetitions.map(RepetitionEvidence::toJson)))

        companion object {
            fun from(
                firstDecodeFrames: Int,
                regularDecodeFrames: Int,
                lsdSteps: Int,
                repetitions: List<RepetitionEvidence>,
            ): CandidateEvidence {
                require(repetitions.isNotEmpty())
                val representative = repetitions.first()
                val sortedRtf = repetitions.map(RepetitionEvidence::rtf).sorted()
                val playbackLeads = repetitions.flatMap { repetition ->
                    repetition.leadBeforeArrivalMs.drop(1)
                }
                val worstLead = playbackLeads.minOrNull()
                    ?: error("candidate emitted no post-first callback")
                return CandidateEvidence(
                    firstDecodeFrames = firstDecodeFrames,
                    regularDecodeFrames = regularDecodeFrames,
                    lsdSteps = lsdSteps,
                    terminal = representative.terminal,
                    generatedFrames = repetitions.minOf(RepetitionEvidence::generatedFrames),
                    sampleCount = representative.levels.sampleCount,
                    nonFiniteSamples = repetitions.sumOf { it.levels.nonFiniteSamples },
                    peakAbs = repetitions.maxOf { it.levels.peakAbs },
                    rmsDbfs = repetitions.map { it.levels.rmsDbfs }.average(),
                    p99Abs = repetitions.maxOf { it.levels.p99Abs },
                    clippedSampleRatio = repetitions.maxOf { it.levels.clippedSampleRatio },
                    medianRtf = sortedRtf[sortedRtf.size / 2],
                    worstLeadBeforeArrivalMs = worstLead,
                    repetitions = repetitions,
                )
            }
        }
    }

    private class Fixture private constructor(
        val contextPackage: String,
        val runId: String,
        val appCommit: String,
        val appApkSha256: String,
        val testApkSha256: String,
        val usbTransportProof: String,
        val modelManifestSha256: String,
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
            .put("packageName", contextPackage)
            .put("onnxRuntime", "1.29.0")

        fun writeEvidence(value: JSONObject) {
            val file = File(outputDirectory, "$runId-scheduler-level-summary.json")
            val temporary = File(outputDirectory, ".${file.name}.${System.nanoTime()}.tmp")
            temporary.writeText(value.toString(2) + "\n", Charsets.UTF_8)
            try {
                Os.rename(temporary.absolutePath, file.absolutePath)
            } finally {
                if (temporary.exists()) temporary.delete()
            }
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
                require(status is TalosPocketModelStatus.Ready) { "Pocket model must be verified before sweep: $status" }
                val values = readPinnedFloats(
                    File(modelRoot, ORACLE_CONDITIONING),
                    EXPECTED_CONDITIONING_FLOATS,
                    EXPECTED_CONDITIONING_SHA256,
                )
                val output = File(requireNotNull(context.getExternalFilesDir(null)), "research/voice/pocket-scheduler-level")
                    .apply { mkdirs() }
                return Fixture(
                    contextPackage = context.packageName,
                    runId = runId,
                    appCommit = appCommit,
                    appApkSha256 = actualAppSha,
                    testApkSha256 = actualTestSha,
                    usbTransportProof = usbProof,
                    modelManifestSha256 = sha256(manifestBytes),
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
        const val FRAME_DURATION_MS = 80.0
        const val MAX_FRAMES = 64
        const val QUEUE_CAPACITY_FRAMES = 24
        const val SCHEDULE_REPETITIONS = 3
        const val LSD_REPETITIONS = 2
        const val CORE_RTF_P95_MAX = 0.65
        const val TEMPERATURE = 0.7f
        const val SEED = 19L
        const val TEXT = "Questa lettura italiana misura con precisione la continuità dei blocchi audio mentre il modello prepara una frase sufficientemente lunga, chiara e completa."

        val SCHEDULES = listOf(2 to 2, 2 to 3, 2 to 4, 2 to 6, 2 to 12)
        val LSD_STEPS = listOf(1, 2, 4)

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

        fun sha256(file: File): String = sha256(file.readBytes())

        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
