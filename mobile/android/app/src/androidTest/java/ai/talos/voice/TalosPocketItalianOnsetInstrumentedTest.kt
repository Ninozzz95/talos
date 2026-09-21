package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketBundle
import ai.talos.voice.pocket.TalosPocketCancellation
import ai.talos.voice.pocket.TalosPocketConditioning
import ai.talos.voice.pocket.TalosPocketConfig
import ai.talos.voice.pocket.TalosPocketFrame
import ai.talos.voice.pocket.TalosPocketOnsetStabilizer
import ai.talos.voice.pocket.TalosPocketOrtRuntime
import ai.talos.voice.pocket.TalosPocketPipelineTerminal
import ai.talos.voice.pocket.TalosPocketStageMetric
import ai.talos.voice.pocket.TalosPocketTextPlanner
import ai.talos.voice.pocket.TalosPocketTokenizer
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
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Real pinned-upstream control/candidate gate for Pocket's measured Italian onset defect. */
@RunWith(AndroidJUnit4::class)
class TalosPocketItalianOnsetInstrumentedTest {
    @Test
    fun sacrificialPrefixProbePersistsExactRawPcmForBoundaryAnalysis() {
        val fixture = Fixture.open()
        val probe = measure(
            fixture = fixture,
            stabilizeOnset = false,
            candidateId = "onset-prefixed-raw",
            source = TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX + PROBLEM_TEXT,
            synthesisPrefix = TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX,
        )
        val manifest = fixture.writeManifest("prefixed-raw", probe)
        fixture.writeSummary(
            "prefixed-raw",
            JSONObject()
                .put("schemaVersion", 1)
                .put("gate", "POCKET-ITALIAN-ONSET-01/RAW-PROBE")
                .put("runId", fixture.runId)
                .put("manifest", manifest.name)
                .put("manifestSha256", sha256(manifest))
                .put("probe", probe.toJson())
                .put("provenance", fixture.provenance()),
        )

        assertEquals(TalosPocketPipelineTerminal.DONE, probe.terminal)
        assertTrue(probe.generatedFrames < MAX_FRAMES)
        assertEquals(probe.generatedFrames * SAMPLES_PER_FRAME, probe.pcmSamples)
        assertEquals(0, probe.nonFiniteSamples)
        assertEquals(0, probe.onsetDiscardedSamples)
    }

    @Test
    fun prefixMatrixPersistsExactRawPcmForOneMeasuredSelection() {
        val fixture = Fixture.open()
        val probes = PREFIX_PROBES.map { probe ->
            measure(
                fixture = fixture,
                stabilizeOnset = false,
                candidateId = probe.id,
                source = probe.prefix + PROBLEM_TEXT,
                synthesisPrefix = probe.prefix,
            )
        }
        val manifest = fixture.writeManifest("prefix-matrix", probes)
        fixture.writeSummary(
            "prefix-matrix",
            JSONObject()
                .put("schemaVersion", 1)
                .put("gate", "POCKET-ITALIAN-ONSET-01/PREFIX-MATRIX")
                .put("runId", fixture.runId)
                .put("manifest", manifest.name)
                .put("manifestSha256", sha256(manifest))
                .put("probes", JSONArray(probes.map(MeasuredCase::toJson)))
                .put("provenance", fixture.provenance()),
        )

        assertEquals(PREFIX_PROBES.size, probes.size)
        probes.forEach { probe ->
            assertEquals(TalosPocketPipelineTerminal.DONE, probe.terminal)
            assertTrue(probe.generatedFrames < MAX_FRAMES)
            assertEquals(probe.generatedFrames * SAMPLES_PER_FRAME, probe.pcmSamples)
            assertEquals(0, probe.nonFiniteSamples)
            assertEquals(0, probe.onsetDiscardedSamples)
        }
    }

    @Test
    fun productionCorpusPersistsPerSentenceRawPrefixedPcmForBoundaryFalsification() {
        val fixture = Fixture.open()
        val corpora = listOf(
            measureRawPrefixedCorpus(
                fixture = fixture,
                corpusId = "production-short",
                source = PRODUCTION_SHORT_TEXT,
                seed = PRODUCTION_SHORT_SEED,
                maxFramesPerSentence = MAX_FRAMES,
            ),
            measureRawPrefixedCorpus(
                fixture = fixture,
                corpusId = "production-long",
                source = PRODUCTION_LONG_TEXT,
                seed = SEED,
                maxFramesPerSentence = PRODUCTION_LONG_MAX_FRAMES,
            ),
        )
        fixture.writeSummary(
            "production-corpus-raw",
            JSONObject()
                .put("schemaVersion", 1)
                .put("gate", "POCKET-ITALIAN-ONSET-01/PRODUCTION-CORPUS-RAW")
                .put("runId", fixture.runId)
                .put("prefix", TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX)
                .put(
                    "prefixSha256",
                    sha256(TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX.toByteArray(Charsets.UTF_8)),
                )
                .put("corpora", JSONArray(corpora))
                .put("provenance", fixture.provenance()),
        )

        corpora.forEach { corpus ->
            assertEquals(TalosPocketPipelineTerminal.DONE.name, corpus.getString("terminal"))
            assertEquals(0, corpus.getInt("onsetDiscardedSamples"))
            assertEquals(
                corpus.getInt("generatedFrames") * SAMPLES_PER_FRAME,
                corpus.getInt("pcmSamples"),
            )
            assertTrue(corpus.getJSONArray("sentences").length() > 0)
        }
    }

    @Test
    fun sacrificialPrefixIsRemovedAtMeasuredBoundaryBeforeItalianUserPcmIsEmitted() {
        val fixture = Fixture.open()
        val control = measure(fixture, stabilizeOnset = false, candidateId = "onset-control")
        val candidate = measure(
            fixture,
            stabilizeOnset = true,
            candidateId = "onset-stabilized",
            synthesisPrefix = TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX,
        )
        val controlManifest = fixture.writeManifest("control", control)
        val candidateManifest = fixture.writeManifest("candidate", candidate)
        fixture.writeSummary(
            "candidate",
            JSONObject()
                .put("schemaVersion", 1)
                .put("gate", "POCKET-ITALIAN-ONSET-01")
                .put("runId", fixture.runId)
                .put("generatedAtElapsedRealtimeNs", SystemClock.elapsedRealtimeNanos())
                .put("controlManifest", controlManifest.name)
                .put("controlManifestSha256", sha256(controlManifest))
                .put("candidateManifest", candidateManifest.name)
                .put("candidateManifestSha256", sha256(candidateManifest))
                .put("control", control.toJson())
                .put("candidate", candidate.toJson())
                .put("provenance", fixture.provenance()),
        )

        assertEquals(TalosPocketPipelineTerminal.DONE, control.terminal)
        assertEquals(TalosPocketPipelineTerminal.DONE, candidate.terminal)
        assertTrue(control.generatedFrames < MAX_FRAMES)
        assertTrue(candidate.generatedFrames < MAX_FRAMES)
        assertEquals(control.generatedFrames * SAMPLES_PER_FRAME, control.emittedSamples)
        assertEquals(0, control.onsetDiscardedSamples)
        assertEquals(candidate.generatedFrames * SAMPLES_PER_FRAME, candidate.emittedSamples + candidate.onsetDiscardedSamples)
        assertEquals(candidate.emittedSamples, candidate.pcmSamples)
        assertEquals(1, candidate.onsetMetrics.size)
        val onset = candidate.onsetMetrics.single()
        assertEquals(candidate.onsetDiscardedSamples, onset.onsetDiscardedSamples)
        assertEquals(LEADING_SILENCE_SAMPLES, onset.onsetLeadingSilenceSamples)
        assertTrue(requireNotNull(onset.onsetGapStartSamples) < requireNotNull(onset.onsetGapEndSamples))
        assertTrue(requireNotNull(onset.onsetGapEndSamples) <= requireNotNull(onset.onsetResumeStartSamples))
        assertEquals(ANALYSIS_WINDOW_SAMPLES, onset.onsetAnalysisWindowSamples)
        assertEquals(TalosPocketOnsetStabilizer.BOUNDARY_SOURCE, onset.onsetBoundarySource)
        assertTrue(requireNotNull(onset.onsetBoundaryThreshold) > 0f)
        assertEquals(0, control.nonFiniteSamples)
        assertEquals(0, candidate.nonFiniteSamples)
    }

    private fun measure(
        fixture: Fixture,
        stabilizeOnset: Boolean,
        candidateId: String,
        source: String = PROBLEM_TEXT,
        synthesisPrefix: String? = null,
    ): MeasuredCase {
        val stages = mutableListOf<TalosPocketStageMetric>()
        val pcm = PcmCapture()
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = fixture.modelRoot,
            cpuThreads = CPU_THREADS,
            config = TalosPocketConfig(
                temperature = TEMPERATURE,
                lsdSteps = 1,
                queueCapacityFrames = 24,
                firstDecodeFrames = 2,
                regularDecodeFrames = 3,
                hardMaxFramesPerSentence = MAX_FRAMES,
                stabilizeOnset = stabilizeOnset,
            ),
        )
        val result = try {
            runtime.synthesize(
                source = source,
                conditioning = fixture.conditioning,
                maxFramesPerSentence = MAX_FRAMES,
                seed = SEED,
                cancellation = TalosPocketCancellation(),
                callback = object : TalosPocketCallback {
                    override fun onStage(metric: TalosPocketStageMetric) {
                        stages += metric
                    }

                    override fun onPcm(frame: TalosPocketFrame): Boolean {
                        require(frame.sampleRate == SAMPLE_RATE)
                        pcm.accept(frame.pcmFloatMono)
                        return true
                    }
                },
            )
        } finally {
            runtime.close()
        }
        val pcmFile = File(fixture.outputDirectory, "${fixture.runId}-$candidateId.f32le")
        val capture = pcm.writeAndClear(pcmFile)
        return MeasuredCase(
            id = candidateId,
            candidateId = candidateId,
            stabilizeOnset = stabilizeOnset,
            synthesisPrefix = synthesisPrefix,
            pcmFile = pcmFile.name,
            pcmSha256 = sha256(pcmFile),
            pcmSamples = capture.samples,
            nonFiniteSamples = capture.nonFiniteSamples,
            terminal = result.terminal,
            generatedFrames = result.generatedFrames,
            emittedSamples = result.emittedSamples,
            onsetDiscardedSamples = result.onsetDiscardedSamples,
            elapsedMs = result.elapsedNs / 1_000_000.0,
            rtf = requireNotNull(result.rtf),
            onsetMetrics = stages.filter { it.stage == "onset_stabilized" },
        )
    }

    private fun measureRawPrefixedCorpus(
        fixture: Fixture,
        corpusId: String,
        source: String,
        seed: Long,
        maxFramesPerSentence: Int,
    ): JSONObject {
        val captures = linkedMapOf<Int, PcmCapture>()
        val generatedFrames = linkedMapOf<Int, Int>()
        val bundle = TalosPocketBundle.fromJson(
            JSONObject(File(fixture.modelRoot, "bundle.json").readText(Charsets.UTF_8)),
        )
        val planned = TalosPocketTokenizer.open(File(fixture.modelRoot, bundle.tokenizerFile)).use { tokenizer ->
            TalosPocketTextPlanner(
                tokenizer = tokenizer,
                maxTokens = bundle.maxTokenPerChunk,
                padWithSpacesForShortInputs = bundle.padWithSpacesForShortInputs,
                removeSemicolons = bundle.removeSemicolons,
                recommendedFramesAfterEos = bundle.modelRecommendedFramesAfterEos,
                sacrificialPrefix = TalosPocketOnsetStabilizer.SACRIFICIAL_PREFIX,
            ).plan(source)
        }
        val runtime = TalosPocketOrtRuntime.open(
            bundleRoot = fixture.modelRoot,
            cpuThreads = CPU_THREADS,
            config = TalosPocketConfig(
                temperature = TEMPERATURE,
                lsdSteps = 1,
                queueCapacityFrames = 24,
                firstDecodeFrames = 2,
                regularDecodeFrames = 3,
                hardMaxFramesPerSentence = maxFramesPerSentence,
                stabilizeOnset = false,
                prependOnsetPrefix = true,
            ),
        )
        val result = try {
            runtime.synthesize(
                source = source,
                conditioning = fixture.conditioning,
                maxFramesPerSentence = maxFramesPerSentence,
                seed = seed,
                cancellation = TalosPocketCancellation(),
                callback = object : TalosPocketCallback {
                    override fun onStage(metric: TalosPocketStageMetric) = Unit

                    override fun onPcm(frame: TalosPocketFrame): Boolean {
                        require(frame.sampleRate == SAMPLE_RATE)
                        require(frame.pcmFloatMono.size == frame.frameCount * SAMPLES_PER_FRAME)
                        captures.getOrPut(frame.sentenceIndex, ::PcmCapture).accept(frame.pcmFloatMono)
                        generatedFrames[frame.sentenceIndex] =
                            (generatedFrames[frame.sentenceIndex] ?: 0) + frame.frameCount
                        return true
                    }
                },
            )
        } finally {
            runtime.close()
        }
        assertEquals(planned.indices.toList(), captures.keys.toList())
        var totalPcmSamples = 0
        val sentences = captures.map { (sentenceIndex, capture) ->
            val file = File(
                fixture.outputDirectory,
                "${fixture.runId}-$corpusId-sentence-$sentenceIndex-prefixed-raw.f32le",
            )
            val measured = capture.writeAndClear(file)
            val sentenceFrames = requireNotNull(generatedFrames[sentenceIndex])
            assertEquals(sentenceFrames * SAMPLES_PER_FRAME, measured.samples)
            assertEquals(0, measured.nonFiniteSamples)
            totalPcmSamples += measured.samples
            JSONObject()
                .put("sentenceIndex", sentenceIndex)
                .put("expectedText", planned[sentenceIndex].source)
                .put("expectedTextSha256", sha256(planned[sentenceIndex].source.toByteArray(Charsets.UTF_8)))
                .put("generatedFrames", sentenceFrames)
                .put("pcmFile", file.name)
                .put("pcmSha256", sha256(file))
                .put("pcmSamples", measured.samples)
                .put("nonFiniteSamples", measured.nonFiniteSamples)
        }
        return JSONObject()
            .put("corpusId", corpusId)
            .put("sourceSha256", sha256(source.toByteArray(Charsets.UTF_8)))
            .put("seed", seed)
            .put("maxFramesPerSentence", maxFramesPerSentence)
            .put("terminal", result.terminal.name)
            .put("generatedFrames", result.generatedFrames)
            .put("emittedSamples", result.emittedSamples)
            .put("onsetDiscardedSamples", result.onsetDiscardedSamples)
            .put("pcmSamples", totalPcmSamples)
            .put("sentences", JSONArray(sentences))
    }

    private data class MeasuredCase(
        val id: String,
        val candidateId: String,
        val stabilizeOnset: Boolean,
        val synthesisPrefix: String?,
        val pcmFile: String,
        val pcmSha256: String,
        val pcmSamples: Int,
        val nonFiniteSamples: Int,
        val terminal: TalosPocketPipelineTerminal,
        val generatedFrames: Int,
        val emittedSamples: Int,
        val onsetDiscardedSamples: Int,
        val elapsedMs: Double,
        val rtf: Double,
        val onsetMetrics: List<TalosPocketStageMetric>,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("id", id)
            .put("candidateId", candidateId)
            .put("configuration", JSONObject()
                .put("temperature", TEMPERATURE.toDouble())
                .put("lsdSteps", 1)
                .put("firstDecodeFrames", 2)
                .put("regularDecodeFrames", 3)
                .put("stabilizeOnset", stabilizeOnset)
                .put("synthesisPrefix", synthesisPrefix ?: JSONObject.NULL)
                .put(
                    "synthesisPrefixSha256",
                    synthesisPrefix?.let { sha256(it.toByteArray(Charsets.UTF_8)) } ?: JSONObject.NULL,
                ))
            .put("expectedText", PROBLEM_TEXT)
            .put("textSha256", sha256(PROBLEM_TEXT.toByteArray(Charsets.UTF_8)))
            .put("seed", SEED)
            .put("pcmFile", pcmFile)
            .put("pcmSha256", pcmSha256)
            .put("pcmSamples", pcmSamples)
            .put("nonFiniteSamples", nonFiniteSamples)
            .put("terminal", terminal.name)
            .put("generatedFrames", generatedFrames)
            .put("emittedSamples", emittedSamples)
            .put("onsetDiscardedSamples", onsetDiscardedSamples)
            .put("elapsedMs", elapsedMs)
            .put("rtf", rtf)
            .put("onsetMetrics", JSONArray(onsetMetrics.map { metric ->
                JSONObject()
                    .put("sentenceIndex", metric.sentenceIndex)
                    .put("discardedSamples", metric.onsetDiscardedSamples)
                    .put("leadingSilenceSamples", metric.onsetLeadingSilenceSamples)
                    .put("gapStartSamples", metric.onsetGapStartSamples)
                    .put("gapEndSamples", metric.onsetGapEndSamples)
                    .put("resumeStartSamples", metric.onsetResumeStartSamples)
                    .put("analysisWindowSamples", metric.onsetAnalysisWindowSamples)
                    .put("boundaryThreshold", metric.onsetBoundaryThreshold?.toDouble())
                    .put("boundarySource", metric.onsetBoundarySource)
            }))
    }

    private data class CaptureResult(val samples: Int, val nonFiniteSamples: Int)

    private class PcmCapture {
        private val chunks = mutableListOf<FloatArray>()
        private var nonFiniteSamples = 0

        fun accept(values: FloatArray) {
            nonFiniteSamples += values.count { !it.isFinite() }
            chunks += values.copyOf()
        }

        fun writeAndClear(file: File): CaptureResult {
            val sampleCount = chunks.sumOf(FloatArray::size)
            try {
                file.outputStream().buffered().use { output ->
                    chunks.forEach { chunk ->
                        val bytes = ByteBuffer.allocate(chunk.size * Float.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
                        bytes.asFloatBuffer().put(chunk)
                        output.write(bytes.array())
                        bytes.array().fill(0)
                    }
                }
            } finally {
                chunks.forEach { it.fill(0f) }
                chunks.clear()
            }
            return CaptureResult(sampleCount, nonFiniteSamples)
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

        fun writeManifest(suffix: String, measured: MeasuredCase): File =
            writeManifest(suffix, listOf(measured))

        fun writeManifest(suffix: String, measured: List<MeasuredCase>): File =
            File(outputDirectory, "$runId-$suffix-asr-manifest.json").also { file ->
                writeJsonAtomic(
                    file,
                    JSONObject()
                        .put("schemaVersion", 1)
                        .put("runId", runId)
                        .put("sampleRate", SAMPLE_RATE)
                        .put("channels", 1)
                        .put("encoding", "float32le")
                        .put("locale", "it-IT")
                        .put("model", ASR_MODEL)
                        .put("modelRevision", ASR_MODEL_REVISION)
                        .put("cases", JSONArray(measured.map(MeasuredCase::toJson))),
                )
            }

        fun writeSummary(suffix: String, value: JSONObject) {
            writeJsonAtomic(File(outputDirectory, "$runId-$suffix-summary.json"), value)
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
                require(TalosPocketModelManager.validate(modelRoot, manifest) is TalosPocketModelStatus.Ready) {
                    "Pocket model must be verified before onset qualification"
                }
                val conditioningValues = readPinnedFloats(File(modelRoot, ORACLE_CONDITIONING))
                val output = File(
                    requireNotNull(context.getExternalFilesDir(null)),
                    "research/voice/pocket-italian-onset",
                ).apply { mkdirs() }
                return Fixture(
                    runId,
                    appCommit,
                    actualAppSha,
                    actualTestSha,
                    usbProof,
                    sha256(manifestBytes),
                    context.packageName,
                    modelRoot,
                    TalosPocketConditioning.create(
                        longArrayOf(1, EXPECTED_CONDITIONING_FRAMES.toLong(), 1_024),
                        conditioningValues,
                    ),
                    output,
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
        const val LEADING_SILENCE_SAMPLES = 1_200
        const val ANALYSIS_WINDOW_SAMPLES = 240
        const val MAX_FRAMES = 96
        const val TEMPERATURE = 0.3f
        const val SEED = 42L
        const val ASR_MODEL = "openai/whisper-large-v3-turbo"
        const val ASR_MODEL_REVISION = "cf7667b3865845227378e06c611d63789cbcdcce"
        const val PROBLEM_TEXT =
            "La terza frase chiude la lettura mantenendo continuità, profilo e locale fino alla fine."
        const val PRODUCTION_SHORT_TEXT = "Ciao."
        const val PRODUCTION_SHORT_SEED = 19L
        const val PRODUCTION_LONG_MAX_FRAMES = 120
        val PRODUCTION_LONG_TEXT = """
            Quando il treno lasciò lentamente la stazione, Marta rimase accanto al finestrino e osservò i tetti bagnati. Non aveva fretta di arrivare: desiderava ascoltare il ritmo regolare delle ruote, seguire i campi che cambiavano colore e ricordare ogni dettaglio del viaggio. Dopo il ponte comparve un paese raccolto intorno a una torre chiara. Un cane attraversò la piazza, il fornaio sollevò la serranda e due bambini corsero verso la scuola. Marta aprì il taccuino, scrisse tre righe e poi si fermò. La storia non chiedeva parole nuove, ma attenzione. Più tardi il cielo si aprì e una lama di sole illuminò il fiume. Nessuna frase doveva sparire, nessuna parola doveva tornare due volte, nessun suono estraneo doveva insinuarsi fra un periodo e il successivo. Quando il controllore annunciò l'ultima fermata, Marta chiuse il taccuino, controllò di avere la valigia e sorrise: il viaggio era terminato esattamente come era cominciato, con calma.
        """.trimIndent().replace('\n', ' ')

        data class PrefixProbe(val id: String, val prefix: String)

        val PREFIX_PROBES = listOf(
            PrefixProbe("prefix-ellipsis", "... "),
            PrefixProbe("prefix-ecco-period", "Ecco. "),
            PrefixProbe("prefix-bene-period", "Bene. "),
            PrefixProbe("prefix-zero-period", "Zero. "),
            PrefixProbe("prefix-uno-period", "Uno. "),
            PrefixProbe("prefix-due-period", "Due. "),
            PrefixProbe("prefix-tre-period", "Tre. "),
            PrefixProbe("prefix-quattro-period", "Quattro. "),
        )

        fun requireArgument(arguments: android.os.Bundle, name: String): String =
            requireNotNull(arguments.getString(name)?.takeIf(String::isNotBlank)) {
                "missing required instrumentation argument: $name"
            }

        fun readPinnedFloats(file: File): FloatArray {
            val bytes = file.readBytes()
            require(sha256(bytes) == EXPECTED_CONDITIONING_SHA256) { "Pocket conditioning SHA-256 differs" }
            require(bytes.size == EXPECTED_CONDITIONING_FLOATS * Float.SIZE_BYTES) {
                "Pocket conditioning fixture size differs"
            }
            val source = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
            return FloatArray(EXPECTED_CONDITIONING_FLOATS).also { values ->
                source.get(values)
                require(values.all(Float::isFinite)) { "Pocket conditioning contains non-finite values" }
            }
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

        fun sha256(file: File): String = sha256(file.readBytes())

        fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
            .digest(bytes)
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }
}
