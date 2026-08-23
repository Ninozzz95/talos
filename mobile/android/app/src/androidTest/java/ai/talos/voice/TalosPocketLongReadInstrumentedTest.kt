package ai.talos.voice

import ai.talos.voice.research.TalosVoiceDiagnosticConfig
import ai.talos.voice.research.TalosVoiceDiagnosticProbe
import ai.talos.voice.research.TalosVoiceDiagnosticRoute
import ai.talos.voice.research.TalosVoiceDiagnosticSession
import android.content.Context
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.system.Os
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.ceil
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Production Pocket playback gates. Every run enters through the singleton
 * host, the same V2 route used by the Capacitor plugin, and writes evidence
 * before asserting so a RED remains diagnosable off-device.
 */
@RunWith(AndroidJUnit4::class)
class TalosPocketLongReadInstrumentedTest {
    @Test
    fun shortPocketProductionClipPrimesAndDrainsTheRealAudioTrack() {
        val fixture = Fixture.open("short")
        TalosVoiceHost.resetForTests()
        val session = fixture.session("short", source = "manual")
        val result: TalosVoiceStreamResult
        try {
            TalosVoiceDiagnosticProbe.armNextProductionRun(session)
            result = TalosVoiceHost.get(fixture.context).speakStreamingWithProfileBlocking(
                text = SHORT_TEXT,
                locale = LOCALE,
                profile = fixture.profile,
                maxFrames = SHORT_FRAMES,
                seed = SEED,
                diagnosticRoute = session.config.route,
            )
        } finally {
            TalosVoiceDiagnosticProbe.disarm()
            TalosVoiceHost.resetForTests()
        }

        val raw = fixture.requireArtifact(session)
        val drainEnd = raw.events("DRAIN_END").single()
        fixture.writeSummary(
            gate = "POCKET-PLAYBACK-01",
            suffix = "short",
            value = JSONObject()
                .put("result", result.toJson())
                .put("firstWriteAtNs", raw.events("AUDIO_WRITE").first().getLong("atElapsedRealtimeNs"))
                .put("drainEndPlaybackHeadFrames", drainEnd.getLong("playbackHeadFrames"))
                .put("drainEndQueueDepthFrames", drainEnd.getLong("queueDepthFrames"))
                .put("rawArtifactSha256", sha256(session.artifactFileOrNull()!!)),
        )

        assertExactPocketRoute(result, fixture.profile.header.profileId)
        assertFalse(result.cancelled)
        assertEquals(0, result.hardwareUnderruns)
        assertTrue(
            "short Pocket PCM was written but playback head never advanced",
            drainEnd.getLong("playbackHeadFrames") > 0L,
        )
        assertTrue("short Pocket playback did not drain", result.drainedWithinTimeout)
        assertEquals(0L, drainEnd.getLong("queueDepthFrames"))
    }

    @Test
    fun queuedPocketSentencesKeepAudioAcrossFlushAddBoundaries() {
        val fixture = Fixture.open("queue")
        TalosVoiceHost.resetForTests()
        val host = TalosVoiceHost.get(fixture.context)
        val warmup = host.speakStreamingWithProfileBlocking(
            text = WARMUP_TEXT,
            locale = LOCALE,
            profile = fixture.profile,
            maxFrames = WARMUP_FRAMES,
            seed = SEED,
        )
        val sessions = QUEUED_TEXTS.indices.map { index ->
            fixture.session("queue-$index", source = "chat")
        }
        val results = arrayOfNulls<TalosVoiceStreamResult>(QUEUED_TEXTS.size)
        val failures = arrayOfNulls<String>(QUEUED_TEXTS.size)
        val completedAtNs = LongArray(QUEUED_TEXTS.size)
        val latch = CountDownLatch(QUEUED_TEXTS.size)

        try {
            TalosVoiceDiagnosticProbe.armNextProductionRun(sessions.first())
            QUEUED_TEXTS.forEachIndexed { index, text ->
                host.submitSpeakStreamingWithProfile(
                    text = text,
                    locale = LOCALE,
                    profile = fixture.profile,
                    maxFrames = QUEUED_FRAMES,
                    seed = SEED + index,
                    diagnosticRoute = sessions[index].config.route,
                    queueMode = if (index == 0) TalosVoiceQueueMode.FLUSH else TalosVoiceQueueMode.ADD,
                ) { outcome ->
                    outcome.fold(
                        onSuccess = { results[index] = it },
                        onFailure = { failures[index] = "${it.javaClass.simpleName}:${it.message}" },
                    )
                    completedAtNs[index] = SystemClock.elapsedRealtimeNanos()
                    if (index + 1 < sessions.size) {
                        TalosVoiceDiagnosticProbe.armNextProductionRun(sessions[index + 1])
                    }
                    latch.countDown()
                }
            }
            assertTrue("queued Pocket production calls timed out", latch.await(180, TimeUnit.SECONDS))
        } finally {
            TalosVoiceDiagnosticProbe.disarm()
            TalosVoiceHost.resetForTests()
        }

        val raw = sessions.mapNotNull { session ->
            session.artifactFileOrNull()?.takeIf(File::isFile)?.let { JSONObject(it.readText(Charsets.UTF_8)) }
        }
        val gapsMs = if (raw.size == sessions.size) {
            (1 until raw.size).map { index ->
                val previousDrainEnd = raw[index - 1].events("DRAIN_END").single().getLong("atElapsedRealtimeNs")
                val nextFirstWrite = raw[index].events("AUDIO_WRITE").first().getLong("atElapsedRealtimeNs")
                (nextFirstWrite - previousDrainEnd) / 1_000_000.0
            }
        } else {
            emptyList()
        }
        fixture.writeSummary(
            gate = "POCKET-QUEUE-01",
            suffix = "queue",
            value = JSONObject()
                .put("warmup", warmup.toJson())
                .put("results", JSONArray(results.map { it?.toJson() ?: JSONObject.NULL }))
                .put("failures", JSONArray(failures.map { it ?: JSONObject.NULL }))
                .put("completionAtNs", JSONArray(completedAtNs.toList()))
                .put("drainToNextWriteGapMs", JSONArray(gapsMs))
                .put(
                    "rawArtifactSha256",
                    JSONArray(sessions.map { it.artifactFileOrNull()?.takeIf(File::isFile)?.let(::sha256) ?: JSONObject.NULL }),
                ),
        )

        assertTrue("Pocket warm-up must really drain before the measured hot sequence", warmup.drainedWithinTimeout)
        assertTrue("queued Pocket run failed: ${failures.toList()}", failures.all { it == null })
        val completed = results.map { requireNotNull(it) }
        completed.forEach { result ->
            assertExactPocketRoute(result, fixture.profile.header.profileId)
            assertFalse(result.cancelled)
            assertTrue(result.drainedWithinTimeout)
            assertEquals(0, result.hardwareUnderruns)
        }
        assertEquals(QUEUED_TEXTS.size - 1, gapsMs.size)
        assertTrue("a drain-to-next-write gap became negative: $gapsMs", gapsMs.all { it >= 0.0 })
        assertTrue(
            "queued sentence boundary exceeded one 80 ms Pocket frame: $gapsMs",
            gapsMs.all { it <= MAX_BOUNDARY_GAP_MS },
        )
    }

    @Test
    fun longItalianPocketProductionReadIsRealtimeBoundedAndUnderrunFree() {
        val fixture = Fixture.open("long")
        TalosVoiceHost.resetForTests()
        val host = TalosVoiceHost.get(fixture.context)
        val warmup = host.speakStreamingWithProfileBlocking(
            text = WARMUP_TEXT,
            locale = LOCALE,
            profile = fixture.profile,
            maxFrames = WARMUP_FRAMES,
            seed = SEED,
        )
        val session = fixture.session("long", source = "assistant")
        val thermalBefore = fixture.thermalSnapshot()
        val result: TalosVoiceStreamResult
        try {
            TalosVoiceDiagnosticProbe.armNextProductionRun(session)
            result = host.speakStreamingWithProfileBlocking(
                text = LONG_TEXT,
                locale = LOCALE,
                profile = fixture.profile,
                maxFrames = LONG_MAX_FRAMES_PER_SENTENCE,
                seed = SEED,
                diagnosticRoute = session.config.route,
            )
        } finally {
            TalosVoiceDiagnosticProbe.disarm()
            TalosVoiceHost.resetForTests()
        }
        val thermalAfter = fixture.thermalSnapshot()
        val raw = fixture.requireArtifact(session)
        val perFrameCoreRtf = raw.perFrameCoreRtf()
        val p95CoreRtf = percentile(perFrameCoreRtf, 0.95)
        val maxCoreRtf = perFrameCoreRtf.maxOrNull() ?: Double.POSITIVE_INFINITY
        val writes = raw.events("AUDIO_WRITE")
        val firstWriteAtNs = writes.first().getLong("atElapsedRealtimeNs")
        val drainEndAtNs = raw.events("DRAIN_END").single().getLong("atElapsedRealtimeNs")
        val playbackSpanMs = (drainEndAtNs - firstWriteAtNs) / 1_000_000.0
        val audioDurationMs = result.generatedFrames * FRAME_DURATION_MS
        val maxLeadFrames = writes.maxOf { it.getLong("queueDepthFrames") }

        fixture.writeSummary(
            gate = "POCKET-LONG-01",
            suffix = "long",
            value = JSONObject()
                .put("fixtureId", "issue-221-long-narration")
                .put("fixtureTextSha256", sha256(LONG_TEXT.toByteArray(Charsets.UTF_8)))
                .put("warmup", warmup.toJson())
                .put("result", result.toJson())
                .put("thermalBefore", thermalBefore)
                .put("thermalAfter", thermalAfter)
                .put("audioDurationMs", audioDurationMs)
                .put("playbackSpanMs", playbackSpanMs)
                .put("coreRtfP95", p95CoreRtf)
                .put("coreRtfMax", maxCoreRtf)
                .put("measuredCoreFrames", perFrameCoreRtf.size)
                .put("maxAudioTrackLeadFrames", maxLeadFrames)
                .put("rawArtifactSha256", sha256(session.artifactFileOrNull()!!)),
        )

        assertTrue("Pocket warm-up must drain before hot TTFA is measured", warmup.drainedWithinTimeout)
        assertExactPocketRoute(result, fixture.profile.header.profileId)
        assertFalse(result.cancelled)
        assertTrue("long Pocket playback did not drain", result.drainedWithinTimeout)
        assertEquals("long Pocket playback had real AudioTrack underruns", 0, result.hardwareUnderruns)
        assertTrue("hot TTFA exceeded 250 ms: ${result.ttfaMs}", requireNotNull(result.ttfaMs) <= HOT_TTFA_MAX_MS)
        assertTrue("no Pocket AR frames were measured", perFrameCoreRtf.isNotEmpty())
        assertTrue("Pocket core p95 RTF $p95CoreRtf exceeded $CORE_RTF_P95_MAX", p95CoreRtf <= CORE_RTF_P95_MAX)
        assertTrue("Pocket core max RTF $maxCoreRtf exceeded $CORE_RTF_MAX", maxCoreRtf <= CORE_RTF_MAX)
        assertTrue(
            "playback span $playbackSpanMs ms exceeded $audioDurationMs ms of audio plus drain tolerance",
            playbackSpanMs <= audioDurationMs + PLAYBACK_TOLERANCE_MS,
        )
        assertTrue("AudioTrack lead became negative", writes.all { it.getLong("queueDepthFrames") >= 0L })
        assertTrue("AudioTrack lead exceeded two seconds: $maxLeadFrames", maxLeadFrames <= MAX_AUDIO_LEAD_FRAMES)
    }

    private class Fixture private constructor(
        val context: Context,
        val runId: String,
        val appCommit: String,
        val appApkSha256: String,
        val testApkSha256: String,
        val usbTransportProof: String,
        val modelManifestSha256: String,
        val profile: TalosVoiceProfileV2,
        val outputDirectory: File,
    ) {
        fun session(suffix: String, source: String): TalosVoiceDiagnosticSession {
            val traceId = "$runId-$suffix"
            val route = TalosVoiceDiagnosticRoute(
                traceId = traceId,
                readingId = "reading-$suffix",
                source = source,
                requestedLocale = LOCALE,
                requestedEngine = "personal",
                requestedProfileId = profile.header.profileId,
            )
            return TalosVoiceDiagnosticSession(
                TalosVoiceDiagnosticConfig(
                    outputDirectory = outputDirectory,
                    route = route,
                    appVersion = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0.1.19",
                    appCommit = appCommit,
                    apkSha256 = appApkSha256,
                    modelRevision = TalosPocketConditioningPayload.REVISION,
                    modelSha256 = modelManifestSha256,
                    deviceFingerprint = Build.FINGERPRINT,
                    usbTransportProof = usbTransportProof,
                ),
            )
        }

        fun requireArtifact(session: TalosVoiceDiagnosticSession): JSONObject {
            val file = session.artifactFileOrNull()
            assertTrue("production diagnostic artifact is absent", file?.isFile == true)
            return JSONObject(file!!.readText(Charsets.UTF_8))
        }

        fun thermalSnapshot(): JSONObject {
            val thermal = context.getSystemService(PowerManager::class.java).currentThermalStatus
            val battery = context.getSystemService(BatteryManager::class.java)
                .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            return JSONObject().put("thermalStatus", thermal).put("batteryPercent", battery)
        }

        fun writeSummary(gate: String, suffix: String, value: JSONObject) {
            val root = JSONObject()
                .put("schemaVersion", 1)
                .put("gate", gate)
                .put("runId", runId)
                .put("generatedAtElapsedRealtimeNs", SystemClock.elapsedRealtimeNanos())
                .put(
                    "provenance",
                    JSONObject()
                        .put("appCommit", appCommit)
                        .put("apkSha256", appApkSha256)
                        .put("testApkSha256", testApkSha256)
                        .put("modelRevision", TalosPocketConditioningPayload.REVISION)
                        .put("modelManifestSha256", modelManifestSha256)
                        .put("deviceFingerprint", Build.FINGERPRINT)
                        .put("usbTransportProof", usbTransportProof),
                )
                .put("measurement", value)
            val file = File(outputDirectory, "$runId-$suffix-summary.json")
            val temporary = File(outputDirectory, ".${file.name}.${System.nanoTime()}.tmp")
            temporary.writeText(root.toString(2) + "\n", Charsets.UTF_8)
            try {
                Os.rename(temporary.absolutePath, file.absolutePath)
            } finally {
                if (temporary.exists()) temporary.delete()
            }
        }

        companion object {
            fun open(suffix: String): Fixture {
                val instrumentation = InstrumentationRegistry.getInstrumentation()
                val context = instrumentation.targetContext
                val arguments = InstrumentationRegistry.getArguments()
                val runId = requireArgument(arguments = arguments, name = "talosRunId") + "-$suffix"
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
                val modelManifestSha = sha256(manifestBytes)
                val pocketRoot = TalosPocketModelManager.modelRoot(requireNotNull(context.getExternalFilesDir(null)))
                val conditioning = readPinnedFloats(
                    File(pocketRoot, ORACLE_CONDITIONING),
                    EXPECTED_CONDITIONING_FLOATS,
                    EXPECTED_CONDITIONING_SHA256,
                )
                val profileId = "pocket-long-read-fixture"
                val output = File(requireNotNull(context.getExternalFilesDir(null)), "research/voice/pocket-long-read")
                    .apply { mkdirs() }
                return Fixture(
                    context = context,
                    runId = runId,
                    appCommit = appCommit,
                    appApkSha256 = actualAppSha,
                    testApkSha256 = actualTestSha,
                    usbTransportProof = usbProof,
                    modelManifestSha256 = modelManifestSha,
                    profile = pocketProfile(profileId, conditioning),
                    outputDirectory = output,
                )
            }
        }
    }

    private fun assertExactPocketRoute(result: TalosVoiceStreamResult, profileId: String) {
        assertEquals(TalosPocketConditioningPayload.BACKEND, result.resolvedEngine)
        assertEquals(LOCALE, result.resolvedLocale)
        assertEquals(profileId, result.resolvedProfileId)
        assertNull(result.fallbackReason)
        assertEquals(TalosVoiceProfileHeaderV2.SCHEMA_VERSION, result.resolvedProfileSchemaVersion)
    }

    private fun TalosVoiceStreamResult.toJson(): JSONObject = JSONObject()
        .put("cancelled", cancelled)
        .put("ttfaMs", ttfaMs ?: JSONObject.NULL)
        .put("writeFailures", underruns)
        .put("hardwareUnderruns", hardwareUnderruns)
        .put("drainedWithinTimeout", drainedWithinTimeout)
        .put("elapsedMs", elapsedMs)
        .put("resolvedEngine", resolvedEngine ?: JSONObject.NULL)
        .put("resolvedLocale", resolvedLocale ?: JSONObject.NULL)
        .put("resolvedProfileIdSha256", resolvedProfileId?.let { sha256(it.toByteArray()) } ?: JSONObject.NULL)
        .put("fallbackReason", fallbackReason ?: JSONObject.NULL)
        .put("generatedFrames", generatedFrames)
        .put("resolvedProfileSchemaVersion", resolvedProfileSchemaVersion ?: JSONObject.NULL)

    private fun JSONObject.events(kind: String): List<JSONObject> {
        val source = getJSONArray("events")
        return (0 until source.length())
            .map(source::getJSONObject)
            .filter { it.getString("kind") == kind }
    }

    private fun JSONObject.perFrameCoreRtf(): List<Double> {
        val frameNs = linkedMapOf<String, Long>()
        val source = getJSONArray("events")
        for (index in 0 until source.length()) {
            val event = source.getJSONObject(index)
            val stage = event.getString("stage")
            if (stage != "flow_main_ar" && stage != "flow_step") continue
            if (event.isNull("sentenceIndex") || event.isNull("frameIndex") || event.isNull("durationNs")) continue
            val key = "${event.getInt("sentenceIndex")}:${event.getInt("frameIndex")}" 
            frameNs[key] = (frameNs[key] ?: 0L) + event.getLong("durationNs")
        }
        return frameNs.values.map { it / FRAME_NS.toDouble() }
    }

    private fun percentile(values: List<Double>, quantile: Double): Double {
        if (values.isEmpty()) return Double.POSITIVE_INFINITY
        val sorted = values.sorted()
        val index = (ceil(sorted.size * quantile).toInt() - 1).coerceIn(0, sorted.lastIndex)
        return sorted[index]
    }

    private companion object {
        fun pocketProfile(profileId: String, conditioning: FloatArray) = TalosVoiceProfileV2(
        header = TalosVoiceProfileHeaderV2(
            schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
            profileId = profileId,
            displayName = "Pocket long-read public fixture",
            language = LOCALE,
            style = "neutral",
            preferredBackend = TalosPocketConditioningPayload.BACKEND,
            createdAtEpochMs = 1,
            enrollmentDurationMs = 4_000,
            consentVersion = 1,
            migratedFromSchemaVersion = null,
        ),
        qualityMetrics = TalosVoiceQualityMetrics(
            durationMs = 4_000,
            speechRatio = 0.8,
            peakAbs = 0.5,
            rmsDbfs = -18.0,
            clippedSampleRatio = 0.0,
            dcOffset = 0.0,
            noiseFloorDbfs = -50.0,
            snrEstimateDb = 30.0,
            longestSilenceMs = 100,
            zeroFrameRatio = 0.01,
            droppedReadCount = 0,
            clientSilencedObserved = false,
        ),
        backendPayloads = listOf(
            TalosPocketConditioningPayload(
                repository = TalosPocketConditioningPayload.REPOSITORY,
                revision = TalosPocketConditioningPayload.REVISION,
                sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
                shape = longArrayOf(1, EXPECTED_CONDITIONING_FRAMES.toLong(), 1_024),
                values = conditioning,
            ),
        ),
    )

        const val LOCALE = "it-IT"
        const val SEED = 19L
        const val MANIFEST_ASSET = "voice/pocket-model-manifest.json"
        const val ORACLE_CONDITIONING = "oracle-conditioning-temp0.f32le"
        const val EXPECTED_CONDITIONING_FRAMES = 112
        const val EXPECTED_CONDITIONING_FLOATS = EXPECTED_CONDITIONING_FRAMES * 1_024
        const val EXPECTED_CONDITIONING_SHA256 = "a9d6f8507dca70928d521e4aad7ac1ae426c78442e24c0e21337586e815f3b6e"
        const val SHORT_TEXT = "Ciao."
        const val SHORT_FRAMES = 2
        const val WARMUP_TEXT = "Buongiorno, questa è una breve prova italiana per scaldare il motore."
        const val WARMUP_FRAMES = 24
        const val QUEUED_FRAMES = 24
        const val LONG_MAX_FRAMES_PER_SENTENCE = 120
        const val FRAME_DURATION_MS = 80L
        const val FRAME_NS = 80_000_000L
        const val MAX_BOUNDARY_GAP_MS = 80.0
        const val HOT_TTFA_MAX_MS = 250L
        const val CORE_RTF_P95_MAX = 0.65
        const val CORE_RTF_MAX = 0.85
        const val PLAYBACK_TOLERANCE_MS = 250.0
        const val MAX_AUDIO_LEAD_FRAMES = 48_000L

        val QUEUED_TEXTS = listOf(
            "La prima frase attraversa la porta della chat e deve terminare senza svuotare il flusso.",
            "La seconda frase usa la coda aggiuntiva e conserva la stessa voce italiana selezionata.",
            "La terza frase chiude la lettura mantenendo continuità, profilo e locale fino alla fine.",
        )

        val LONG_TEXT = """
            Quando il treno lasciò lentamente la stazione, Marta rimase accanto al finestrino e osservò i tetti bagnati. Non aveva fretta di arrivare: desiderava ascoltare il ritmo regolare delle ruote, seguire i campi che cambiavano colore e ricordare ogni dettaglio del viaggio. Dopo il ponte comparve un paese raccolto intorno a una torre chiara. Un cane attraversò la piazza, il fornaio sollevò la serranda e due bambini corsero verso la scuola. Marta aprì il taccuino, scrisse tre righe e poi si fermò. La storia non chiedeva parole nuove, ma attenzione. Più tardi il cielo si aprì e una lama di sole illuminò il fiume. Nessuna frase doveva sparire, nessuna parola doveva tornare due volte, nessun suono estraneo doveva insinuarsi fra un periodo e il successivo. Quando il controllore annunciò l'ultima fermata, Marta chiuse il taccuino, controllò di avere la valigia e sorrise: il viaggio era terminato esattamente come era cominciato, con calma.
        """.trimIndent().replace('\n', ' ')

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
