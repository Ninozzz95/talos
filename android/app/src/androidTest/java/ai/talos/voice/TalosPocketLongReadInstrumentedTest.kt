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
import java.io.FileOutputStream
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
        val playbackBoundary = raw.events("PLAYBACK_BOUNDARY_REACHED").single()
        val onsetEvents = raw.events("ONSET_STABILIZED")
        fixture.writeSummary(
            gate = "POCKET-PLAYBACK-01",
            suffix = "short",
            value = JSONObject()
                .put("result", result.toJson())
                .put("firstWriteAtNs", raw.events("AUDIO_WRITE").first().getLong("atElapsedRealtimeNs"))
                .put("playbackBoundaryFrames", playbackBoundary.getLong("playbackBoundaryFrames"))
                .put("playbackBoundaryHeadFrames", playbackBoundary.getLong("playbackHeadFrames"))
                .put("playbackBoundaryQueueDepthFrames", playbackBoundary.getLong("queueDepthFrames"))
                .put("playbackCompletionSource", playbackBoundary.getString("playbackCompletionSource"))
                .put("terminalDrainRemainingFrames", playbackBoundary.getLong("terminalDrainRemainingFrames"))
                .put("terminalDrainExpectedNs", playbackBoundary.getLong("terminalDrainExpectedNs"))
                .put("onsetEvents", JSONArray(onsetEvents))
                .put("rawArtifactSha256", sha256(session.artifactFileOrNull()!!)),
        )

        assertExactPocketRoute(result, fixture.profile.header.profileId)
        assertFalse(result.cancelled)
        assertEquals(0, result.hardwareUnderruns)
        assertTrue("short Pocket clip hit the harness hard cap", result.generatedFrames < SHORT_FRAMES)
        assertOnsetEvidence(result, raw)
        assertTrue(
            "short Pocket PCM was written but playback head never advanced",
            playbackBoundary.getLong("playbackHeadFrames") > 0L,
        )
        assertTrue("short Pocket playback did not drain", result.drainedWithinTimeout)
        assertTerminalDrainEvidence(playbackBoundary)
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
        val captures = QUEUED_TEXTS.indices.map { PublicPcmCapture() }
        val sessions = QUEUED_TEXTS.indices.map { index ->
            fixture.session(
                suffix = "queue-$index",
                source = "chat",
                acceptedPcmObserver = captures[index]::accept,
            )
        }
        val results = arrayOfNulls<TalosVoiceStreamResult>(QUEUED_TEXTS.size)
        val failures = arrayOfNulls<String>(QUEUED_TEXTS.size)
        val completedAtNs = LongArray(QUEUED_TEXTS.size)
        val latch = CountDownLatch(QUEUED_TEXTS.size)

        try {
            sessions.forEach(TalosVoiceDiagnosticProbe::armNextProductionRun)
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
                    latch.countDown()
                }
            }
            assertTrue("queued Pocket production calls timed out", latch.await(180, TimeUnit.SECONDS))
        } finally {
            while (TalosVoiceDiagnosticProbe.disarm() != null) Unit
            TalosVoiceHost.resetForTests()
        }

        val isolatedCaptures = QUEUED_TEXTS.indices.map { PublicPcmCapture() }
        val isolatedSessions = QUEUED_TEXTS.indices.map { index ->
            fixture.session(
                suffix = "isolated-$index",
                source = "chat",
                acceptedPcmObserver = isolatedCaptures[index]::accept,
            )
        }
        val isolatedResults = arrayOfNulls<TalosVoiceStreamResult>(QUEUED_TEXTS.size)
        TalosVoiceHost.resetForTests()
        val isolatedHost = TalosVoiceHost.get(fixture.context)
        try {
            QUEUED_TEXTS.forEachIndexed { index, text ->
                TalosVoiceDiagnosticProbe.armNextProductionRun(isolatedSessions[index])
                isolatedResults[index] = isolatedHost.speakStreamingWithProfileBlocking(
                    text = text,
                    locale = LOCALE,
                    profile = fixture.profile,
                    maxFrames = QUEUED_FRAMES,
                    seed = SEED + index,
                    diagnosticRoute = isolatedSessions[index].config.route,
                )
            }
        } finally {
            while (TalosVoiceDiagnosticProbe.disarm() != null) Unit
            TalosVoiceHost.resetForTests()
        }

        val raw = sessions.mapNotNull { session ->
            session.artifactFileOrNull()?.takeIf(File::isFile)?.let { JSONObject(it.readText(Charsets.UTF_8)) }
        }
        fun writePcmCase(
            mode: String,
            index: Int,
            capture: PublicPcmCapture,
            result: TalosVoiceStreamResult,
        ): JSONObject {
            val file = File(fixture.outputDirectory, "${fixture.runId}-$mode-$index-accepted.f32le")
            val capturedSamples = capture.writeAndClear(file)
            assertEquals(
                "accepted PCM does not cover every generated Pocket frame",
                result.generatedFrames * POCKET_FRAME_SAMPLES,
                capturedSamples + result.onsetDiscardedSamples,
            )
            return JSONObject()
                .put("id", "$mode-$index")
                .put("mode", mode)
                .put("comparisonGroup", index)
                .put("expectedText", QUEUED_TEXTS[index])
                .put("pcmFile", file.name)
                .put("pcmSha256", sha256(file))
                .put("pcmSamples", capturedSamples)
                .put("onsetDiscardedSamples", result.onsetDiscardedSamples)
        }
        val pcmCases = captures.mapIndexed { index, capture ->
            writePcmCase("queue", index, capture, requireNotNull(results[index]))
        } + isolatedCaptures.mapIndexed { index, capture ->
            writePcmCase("isolated", index, capture, requireNotNull(isolatedResults[index]))
        }
        val asrManifest = fixture.writeAsrManifest(pcmCases)
        val bufferedLeadAtNextWriteMs = if (raw.size == sessions.size) {
            (1 until raw.size).map { index ->
                val previousBoundary = raw[index - 1].events("PLAYBACK_BOUNDARY_REACHED").single()
                    .getLong("atElapsedRealtimeNs")
                val nextFirstWrite = raw[index].events("AUDIO_WRITE").first().getLong("atElapsedRealtimeNs")
                (previousBoundary - nextFirstWrite) / 1_000_000.0
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
                .put("bufferedLeadAtNextWriteMs", JSONArray(bufferedLeadAtNextWriteMs))
                .put("hardCapFrames", QUEUED_FRAMES)
                .put("generatedFrames", JSONArray(results.map { it?.generatedFrames ?: JSONObject.NULL }))
                .put("isolatedResults", JSONArray(isolatedResults.map { it?.toJson() ?: JSONObject.NULL }))
                .put("endedBeforeHardCap", JSONArray(results.map { it?.generatedFrames?.let { frames -> frames < QUEUED_FRAMES } ?: false }))
                .put(
                    "queueMatchesIsolatedPcm",
                    JSONArray(QUEUED_TEXTS.indices.map { index ->
                        pcmCases[index].getString("pcmSha256") ==
                            pcmCases[index + QUEUED_TEXTS.size].getString("pcmSha256")
                    }),
                )
                .put("asrManifest", asrManifest.name)
                .put("asrManifestSha256", sha256(asrManifest))
                .put(
                    "rawArtifactSha256",
                    JSONArray(sessions.map { it.artifactFileOrNull()?.takeIf(File::isFile)?.let(::sha256) ?: JSONObject.NULL }),
                ),
        )

        assertTrue("Pocket warm-up must really drain before the measured hot sequence", warmup.drainedWithinTimeout)
        assertTrue(
            "Pocket warm-up hit the harness hard cap instead of ending semantically: ${warmup.generatedFrames}/$WARMUP_FRAMES",
            warmup.generatedFrames < WARMUP_FRAMES,
        )
        assertTrue("queued Pocket run failed: ${failures.toList()}", failures.all { it == null })
        val completed = results.map { requireNotNull(it) }
        val isolatedCompleted = isolatedResults.map { requireNotNull(it) }
        completed.forEach { result ->
            assertExactPocketRoute(result, fixture.profile.header.profileId)
            assertFalse(result.cancelled)
            assertTrue(result.drainedWithinTimeout)
            assertEquals(0, result.hardwareUnderruns)
            assertTrue(
                "queued Pocket sentence hit the harness hard cap instead of ending semantically: ${result.generatedFrames}/$QUEUED_FRAMES",
                result.generatedFrames < QUEUED_FRAMES,
            )
        }
        isolatedCompleted.forEach { result ->
            assertExactPocketRoute(result, fixture.profile.header.profileId)
            assertFalse(result.cancelled)
            assertTrue(result.drainedWithinTimeout)
            assertEquals(0, result.hardwareUnderruns)
            assertTrue(result.generatedFrames < QUEUED_FRAMES)
        }
        QUEUED_TEXTS.indices.forEach { index ->
            assertEquals(
                "queue state changed deterministic Pocket PCM for comparison group $index",
                pcmCases[index].getString("pcmSha256"),
                pcmCases[index + QUEUED_TEXTS.size].getString("pcmSha256"),
            )
        }
        assertEquals(QUEUED_TEXTS.size - 1, bufferedLeadAtNextWriteMs.size)
        assertTrue(
            "the next sentence was not written while the previous sentence still owned buffered audio: $bufferedLeadAtNextWriteMs",
            bufferedLeadAtNextWriteMs.all { it >= MIN_BUFFERED_LEAD_MS },
        )
        raw.forEachIndexed { index, artifact ->
            assertOnsetEvidence(requireNotNull(results[index]), artifact)
            val reached = artifact.events("PLAYBACK_BOUNDARY_REACHED").single()
            if (index == raw.lastIndex) {
                assertTerminalDrainEvidence(reached)
            } else {
                assertEquals("PLAYBACK_HEAD", reached.getString("playbackCompletionSource"))
                assertTrue(
                    "playback head did not reach queued callback boundary",
                    reached.getLong("playbackHeadFrames") >= reached.getLong("playbackBoundaryFrames"),
                )
            }
            assertTrue(
                "callback $index fired before its physical playback boundary",
                completedAtNs[index] >= reached.getLong("atElapsedRealtimeNs"),
            )
        }
        isolatedSessions.map(fixture::requireArtifact).forEachIndexed { index, artifact ->
            assertOnsetEvidence(requireNotNull(isolatedResults[index]), artifact)
            assertTerminalDrainEvidence(artifact.events("PLAYBACK_BOUNDARY_REACHED").single())
        }
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
        val capture = PublicPcmCapture()
        val session = fixture.session(
            suffix = "long",
            source = "assistant",
            acceptedPcmObserver = capture::accept,
        )
        val thermalBefore = fixture.thermalSnapshot()
        val result: TalosVoiceStreamResult
        try {
            TalosVoiceDiagnosticProbe.armNextProductionRun(session)
            result = host.speakStreamingWithProfileBlocking(
                text = LONG_TEXT,
                locale = LOCALE,
                profile = fixture.profile,
                maxFrames = LONG_MAX_FRAMES_PER_SENTENCE,
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
        val onsetEvents = raw.events("ONSET_STABILIZED")
        val firstOnsetResumeSamples = onsetEvents.first().getInt("onsetResumeStartSamples")
        val firstOnsetResumeAudioMs = firstOnsetResumeSamples * 1_000.0 /
            TalosPocketConditioningPayload.SAMPLE_RATE
        val resolvedProductionSeed = raw.events("SAMPLING_CONFIG").single().getLong("samplingSeed")
        val firstWriteAtNs = writes.first().getLong("atElapsedRealtimeNs")
        val playbackBoundaryAtNs = raw.events("PLAYBACK_BOUNDARY_REACHED").single()
            .getLong("atElapsedRealtimeNs")
        val terminalDrain = raw.events("PLAYBACK_BOUNDARY_REACHED").single()
        val playbackSpanMs = (playbackBoundaryAtNs - firstWriteAtNs) / 1_000_000.0
        val emittedSamples = result.generatedFrames * POCKET_FRAME_SAMPLES - result.onsetDiscardedSamples
        val audioDurationMs = emittedSamples * 1_000.0 / TalosPocketConditioningPayload.SAMPLE_RATE
        val maxLeadFrames = writes.maxOf { it.getLong("queueDepthFrames") }
        val limitedSampleFrames = writes.sumOf { it.getInt("limitedSampleFrames") }
        val outputPeakAbs = writes.maxOf { it.getDouble("outputPeakAbs") }
        val limiterGainReductionDb = writes.maxOf { it.getDouble("limiterGainReductionDb") }
        val pcmFile = File(fixture.outputDirectory, "${fixture.runId}-long-accepted.f32le")
        val capturedSamples = capture.writeAndClear(pcmFile)

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
                .put("resolvedProductionSeed", resolvedProductionSeed)
                .put("playbackCompletionSource", terminalDrain.getString("playbackCompletionSource"))
                .put("terminalDrainRemainingFrames", terminalDrain.getLong("terminalDrainRemainingFrames"))
                .put("terminalDrainExpectedNs", terminalDrain.getLong("terminalDrainExpectedNs"))
                .put("outputGainDb", writes.first().getDouble("levelGainDb"))
                .put("limiterCeilingDbfs", writes.first().getDouble("limiterCeilingDbfs"))
                .put("outputPeakAbs", outputPeakAbs)
                .put("limitedSampleFrames", limitedSampleFrames)
                .put("limiterGainReductionDb", limiterGainReductionDb)
                .put("onsetDiscardedSamples", result.onsetDiscardedSamples)
                .put("firstOnsetResumeSamples", firstOnsetResumeSamples)
                .put("firstOnsetResumeAudioMs", firstOnsetResumeAudioMs)
                .put("hotTtfaBudgetMs", HOT_TTFA_MAX_MS)
                .put("onsetEvents", JSONArray(onsetEvents))
                .put("pcmFile", pcmFile.name)
                .put("pcmSha256", sha256(pcmFile))
                .put("pcmSamples", capturedSamples)
                .put("rawArtifactSha256", sha256(session.artifactFileOrNull()!!)),
        )

        assertTrue("Pocket warm-up must drain before hot TTFA is measured", warmup.drainedWithinTimeout)
        assertTrue(
            "Pocket warm-up hit the harness hard cap instead of ending semantically: ${warmup.generatedFrames}/$WARMUP_FRAMES",
            warmup.generatedFrames < WARMUP_FRAMES,
        )
        assertExactPocketRoute(result, fixture.profile.header.profileId)
        assertFalse(result.cancelled)
        assertTrue("long Pocket playback did not drain", result.drainedWithinTimeout)
        assertEquals("long Pocket playback had real AudioTrack underruns", 0, result.hardwareUnderruns)
        assertTrue(
            "hot TTFA exceeded the measured onset budget $HOT_TTFA_MAX_MS ms: ${result.ttfaMs}",
            requireNotNull(result.ttfaMs) <= HOT_TTFA_MAX_MS,
        )
        assertTrue("no Pocket AR frames were measured", perFrameCoreRtf.isNotEmpty())
        assertEquals(
            "long production PCM does not cover every accepted generated frame",
            result.generatedFrames * POCKET_FRAME_SAMPLES,
            capturedSamples + result.onsetDiscardedSamples,
        )
        assertOnsetEvidence(result, raw)
        assertTrue("Pocket core p95 RTF $p95CoreRtf exceeded $CORE_RTF_P95_MAX", p95CoreRtf <= CORE_RTF_P95_MAX)
        assertTrue("Pocket core max RTF $maxCoreRtf exceeded $CORE_RTF_MAX", maxCoreRtf <= CORE_RTF_MAX)
        assertTrue(
            "playback span $playbackSpanMs ms exceeded $audioDurationMs ms of audio plus drain tolerance",
            playbackSpanMs <= audioDurationMs + PLAYBACK_TOLERANCE_MS,
        )
        assertTrue("AudioTrack lead became negative", writes.all { it.getLong("queueDepthFrames") >= 0L })
        assertTrue("an AUDIO_WRITE event reported no accepted PCM", writes.all { it.getInt("writtenFrames") > 0 })
        assertTrue("AudioTrack lead exceeded two seconds: $maxLeadFrames", maxLeadFrames <= MAX_AUDIO_LEAD_FRAMES)
        assertTrue("Pocket output gain was not +12 dB", writes.all { it.getDouble("levelGainDb") == 12.0 })
        assertTrue("Pocket output crossed the -1 dBFS sample ceiling: $outputPeakAbs", outputPeakAbs <= 0.891_251)
        assertEquals("production did not use the measured default seed", 42L, resolvedProductionSeed)
        assertTrue("terminal playback emitted an underrun event", raw.events("UNDERRUN_OBSERVED").isEmpty())
        assertTerminalDrainEvidence(terminalDrain)
    }

    private fun assertTerminalDrainEvidence(event: JSONObject) {
        assertEquals(TalosPcmTerminalBoundary.COMPLETION_SOURCE, event.getString("playbackCompletionSource"))
        val head = event.getLong("playbackHeadFrames")
        val boundary = event.getLong("playbackBoundaryFrames")
        val remaining = event.getLong("terminalDrainRemainingFrames")
        assertTrue("terminal drain observed a head beyond its boundary", head <= boundary)
        assertEquals("terminal drain remaining frames do not match the observed pre-stop head", boundary - head, remaining)
        val sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE.toLong()
        val expectedNs = (remaining * 1_000_000_000L + sampleRate - 1L) / sampleRate
        assertEquals("terminal drain duration was not derived from exact PCM frames", expectedNs, event.getLong("terminalDrainExpectedNs"))
    }

    private fun assertOnsetEvidence(result: TalosVoiceStreamResult, artifact: JSONObject) {
        val onsetEvents = artifact.events("ONSET_STABILIZED")
        assertTrue("Pocket production emitted no measured onset boundary", onsetEvents.isNotEmpty())
        assertEquals(
            "stream result discarded-sample count differs from diagnostic onset events",
            result.onsetDiscardedSamples,
            onsetEvents.sumOf { it.getInt("onsetDiscardedSamples") },
        )
        onsetEvents.forEach { event ->
            val gapStart = event.getInt("onsetGapStartSamples")
            val gapEnd = event.getInt("onsetGapEndSamples")
            val resumeStart = event.getInt("onsetResumeStartSamples")
            assertTrue("measured onset quiet gap is empty", gapStart < gapEnd)
            assertTrue("onset resume precedes the measured quiet gap end", gapEnd <= resumeStart)
            assertEquals(ONSET_ANALYSIS_WINDOW_SAMPLES, event.getInt("onsetAnalysisWindowSamples"))
            assertTrue(event.getDouble("onsetBoundaryThreshold") > 0.0)
            assertEquals(
                ai.talos.voice.pocket.TalosPocketOnsetStabilizer.BOUNDARY_SOURCE,
                event.getString("onsetBoundarySource"),
            )
        }
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
        fun session(
            suffix: String,
            source: String,
            acceptedPcmObserver: ((FloatArray, Int, Int) -> Unit)? = null,
        ): TalosVoiceDiagnosticSession {
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
                config = TalosVoiceDiagnosticConfig(
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
                acceptedPcmObserver = acceptedPcmObserver,
            )
        }

        fun writeAsrManifest(cases: List<JSONObject>): File {
            val manifest = JSONObject()
                .put("schemaVersion", 1)
                .put("runId", runId)
                .put("sampleRate", TalosPocketConditioningPayload.SAMPLE_RATE)
                .put("channels", 1)
                .put("encoding", "float32le")
                .put("locale", LOCALE)
                .put("model", ASR_MODEL)
                .put("modelRevision", ASR_MODEL_REVISION)
                .put("cases", JSONArray(cases))
            val file = File(outputDirectory, "$runId-queue-asr-manifest.json")
            val temporary = File(outputDirectory, ".${file.name}.${System.nanoTime()}.tmp")
            temporary.writeText(manifest.toString(2) + "\n", Charsets.UTF_8)
            try {
                Os.rename(temporary.absolutePath, file.absolutePath)
            } finally {
                if (temporary.exists()) temporary.delete()
            }
            return file
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

    private class PublicPcmCapture {
        private val chunks = ArrayList<FloatArray>()
        private var sampleRate: Int? = null
        private var channels: Int? = null

        @Synchronized
        fun accept(pcm: FloatArray, sampleRate: Int, channels: Int) {
            require(sampleRate == TalosPocketConditioningPayload.SAMPLE_RATE) {
                "unexpected Pocket PCM sample rate: $sampleRate"
            }
            require(channels == 1) { "expected mono Pocket PCM, received $channels channels" }
            require(this.sampleRate == null || this.sampleRate == sampleRate) { "PCM sample rate changed mid-run" }
            require(this.channels == null || this.channels == channels) { "PCM channels changed mid-run" }
            this.sampleRate = sampleRate
            this.channels = channels
            chunks += pcm
        }

        @Synchronized
        fun writeAndClear(file: File): Int {
            require(chunks.isNotEmpty()) { "no accepted Pocket PCM was captured" }
            var samples = 0
            try {
                FileOutputStream(file).buffered().use { output ->
                    chunks.forEach { pcm ->
                        val bytes = ByteBuffer.allocate(pcm.size * Float.SIZE_BYTES)
                            .order(ByteOrder.LITTLE_ENDIAN)
                        pcm.forEach(bytes::putFloat)
                        output.write(bytes.array())
                        samples += pcm.size
                    }
                }
                return samples
            } finally {
                chunks.forEach { it.fill(0f) }
                chunks.clear()
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
        .put("onsetDiscardedSamples", onsetDiscardedSamples)
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
        const val SHORT_FRAMES = 96
        const val WARMUP_TEXT = "Buongiorno, questa è una breve prova italiana per scaldare il motore."
        const val WARMUP_FRAMES = 96
        const val QUEUED_FRAMES = 96
        const val LONG_MAX_FRAMES_PER_SENTENCE = 120
        const val FRAME_DURATION_MS = 80L
        const val FRAME_NS = 80_000_000L
        const val POCKET_FRAME_SAMPLES = 1_920
        const val ONSET_ANALYSIS_WINDOW_SAMPLES = 240
        const val MIN_BUFFERED_LEAD_MS = 1.0
        const val HOT_TTFA_MAX_MS = 600L
        const val CORE_RTF_P95_MAX = 0.65
        const val CORE_RTF_MAX = 0.85
        const val PLAYBACK_TOLERANCE_MS = 250.0
        const val MAX_AUDIO_LEAD_FRAMES = 48_000L
        const val ASR_MODEL = "openai/whisper-large-v3-turbo"
        const val ASR_MODEL_REVISION = "cf7667b3865845227378e06c611d63789cbcdcce"

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
