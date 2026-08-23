package ai.talos.voice

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import ai.talos.voice.research.TalosVoiceDiagnosticAnswers
import ai.talos.voice.research.TalosVoiceDiagnosticConfig
import ai.talos.voice.research.TalosVoiceDiagnosticEvent
import ai.talos.voice.research.TalosVoiceDiagnosticEventKind
import ai.talos.voice.research.TalosVoiceDiagnosticOutcome
import ai.talos.voice.research.TalosVoiceDiagnosticRoute
import ai.talos.voice.research.TalosVoiceDiagnosticSession
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TalosVoiceDiagnosticArtifactInstrumentedTest {
    @Test
    fun artifactNamesProductAnswersAndNeverPersistsRawProfileIdentity() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val output = File(context.getExternalFilesDir(null), "research/voice/diagnostic-contract-test")
        output.mkdirs()
        val rawProfileId = "owner-profile-must-not-appear"
        val route = TalosVoiceDiagnosticRoute(
            traceId = "voice-contract-test",
            readingId = "reading-42",
            source = "chat",
            requestedLocale = "it-IT",
            requestedEngine = "personal",
            requestedProfileId = rawProfileId,
        )
        val session = TalosVoiceDiagnosticSession(
            TalosVoiceDiagnosticConfig(
                outputDirectory = output,
                route = route,
                appVersion = "0.1.19",
                appCommit = "0".repeat(40),
                apkSha256 = "1".repeat(64),
                modelRevision = "moss-rollback",
                modelSha256 = "2".repeat(64),
                deviceFingerprint = android.os.Build.FINGERPRINT,
                usbTransportProof = "USB\\VID_22D9&PID_2769\\deadbeef",
            ),
        )
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.SAMPLING_CONFIG,
                stage = "sampling.seed",
                samplingSeed = 42L,
            ),
        )
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.PRODUCTION_DOOR_ENTERED,
                stage = "TalosVoiceHost.get.speak",
            ),
        )
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.ONSET_STABILIZED,
                stage = "onset_stabilized",
                sentenceIndex = 2,
                onsetDiscardedSamples = 6_000,
                onsetLeadingSilenceSamples = 1_200,
                onsetGapStartSamples = 4_800,
                onsetGapEndSamples = 7_200,
                onsetResumeStartSamples = 7_200,
                onsetAnalysisWindowSamples = 240,
                onsetBoundaryThreshold = 0.005,
                onsetBoundarySource = "PINNED_SACRIFICIAL_PREFIX_SILENCE",
            ),
        )
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.AUDIO_WRITE,
                stage = "AudioTrack.write",
                durationNs = 120_000,
                requestedFrames = 960,
                writtenFrames = 960,
                queueCapacityFrames = 23_040,
                startThresholdFrames = 2_880,
                underrunCount = 0,
                levelGainDb = 12.0,
                limiterCeilingDbfs = -1.0,
                inputPeakAbs = 0.2,
                outputPeakAbs = 0.796,
                limitedSampleFrames = 0,
                limiterGainReductionDb = 0.0,
            ),
        )
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.PLAYBACK_BOUNDARY_ARMED,
                stage = "TalosPcmPlayer.awaitPlaybackBoundary",
                playbackBoundaryFrames = 12_000,
                playbackHeadFrames = 9_120,
                queueDepthFrames = 2_880,
            ),
        )
        session.record(
            TalosVoiceDiagnosticEvent(
                kind = TalosVoiceDiagnosticEventKind.PLAYBACK_BOUNDARY_REACHED,
                stage = "TalosPcmTerminalBoundary.awaitDrain",
                playbackBoundaryFrames = 12_000,
                playbackHeadFrames = 9_120,
                queueDepthFrames = 2_880,
                playbackCompletionSource = TalosPcmTerminalBoundary.COMPLETION_SOURCE,
                terminalDrainRemainingFrames = 2_880,
                terminalDrainExpectedNs = 120_000_000,
            ),
        )
        val file = session.finish(
            TalosVoiceDiagnosticOutcome(
                termination = "DONE",
                resolvedEngine = TalosPocketConditioningPayload.BACKEND,
                resolvedLocale = "it-IT",
                resolvedProfileId = rawProfileId,
                fallbackReason = null,
                resolvedProfileSchemaVersion = 2,
                profileMigrationCommitted = true,
                eventCount = session.eventCount(),
                answers = TalosVoiceDiagnosticAnswers(
                    dominantGraph = "UNKNOWN_NOT_PROFILED",
                    decodeCacheSlope = "UNKNOWN_NOT_PROFILED",
                    outsideOrt = "UNKNOWN_NOT_PROFILED",
                    arOnlyRtf = "UNKNOWN_NOT_PROFILED",
                    underrunCause = "UNKNOWN_ANDROID_CUMULATIVE_COUNTER",
                    selectedVoiceUsed = true,
                    selectedLocaleUsed = true,
                    italianSemanticsPreserved = null,
                    cancelTailMs = null,
                    longReadRealtime = null,
                ),
            ),
        )

        val serialized = file.readText(Charsets.UTF_8)
        assertFalse(serialized.contains(rawProfileId))
        assertFalse(serialized.contains("owner-profile"))
        val root = JSONObject(serialized)
        val events = root.getJSONArray("events")
        fun singleEvent(kind: String): JSONObject =
            (0 until events.length())
                .map { index -> events.getJSONObject(index) }
                .single { event -> event.getString("kind") == kind }
        assertEquals(1, root.getInt("schemaVersion"))
        assertEquals(7, events.length())
        assertEquals(64, root.getJSONObject("route").getString("requestedProfileIdSha256").length)
        assertTrue(root.getJSONObject("route").has("fallbackReason"))
        assertTrue(root.getJSONObject("route").isNull("fallbackReason"))
        assertEquals(2, root.getJSONObject("route").getInt("resolvedProfileSchemaVersion"))
        assertTrue(root.getJSONObject("route").getBoolean("profileMigrationCommitted"))
        val sampling = singleEvent("SAMPLING_CONFIG")
        assertEquals("SAMPLING_CONFIG", sampling.getString("kind"))
        assertEquals(42L, sampling.getLong("samplingSeed"))
        val onset = singleEvent("ONSET_STABILIZED")
        assertEquals(6_000, onset.getInt("onsetDiscardedSamples"))
        assertEquals(1_200, onset.getInt("onsetLeadingSilenceSamples"))
        assertEquals(4_800, onset.getInt("onsetGapStartSamples"))
        assertEquals(7_200, onset.getInt("onsetGapEndSamples"))
        assertEquals(7_200, onset.getInt("onsetResumeStartSamples"))
        assertEquals(240, onset.getInt("onsetAnalysisWindowSamples"))
        assertEquals(0.005, onset.getDouble("onsetBoundaryThreshold"), 0.0)
        assertEquals("PINNED_SACRIFICIAL_PREFIX_SILENCE", onset.getString("onsetBoundarySource"))
        val audioWrite = singleEvent("AUDIO_WRITE")
        assertEquals(23_040L, audioWrite.getLong("queueCapacityFrames"))
        assertEquals(2_880L, audioWrite.getLong("startThresholdFrames"))
        assertEquals(12.0, audioWrite.getDouble("levelGainDb"), 0.0)
        assertEquals(-1.0, audioWrite.getDouble("limiterCeilingDbfs"), 0.0)
        assertEquals(0.2, audioWrite.getDouble("inputPeakAbs"), 0.0)
        assertEquals(0.796, audioWrite.getDouble("outputPeakAbs"), 0.0)
        assertEquals(0, audioWrite.getInt("limitedSampleFrames"))
        assertEquals(0.0, audioWrite.getDouble("limiterGainReductionDb"), 0.0)
        val boundary = singleEvent("PLAYBACK_BOUNDARY_ARMED")
        assertEquals(12_000L, boundary.getLong("playbackBoundaryFrames"))
        val terminalDrain = singleEvent("PLAYBACK_BOUNDARY_REACHED")
        assertEquals("PLAYBACK_BOUNDARY_REACHED", terminalDrain.getString("kind"))
        assertEquals(TalosPcmTerminalBoundary.COMPLETION_SOURCE, terminalDrain.getString("playbackCompletionSource"))
        assertEquals(2_880L, terminalDrain.getLong("terminalDrainRemainingFrames"))
        assertEquals(120_000_000L, terminalDrain.getLong("terminalDrainExpectedNs"))
        assertEquals(9_120L, terminalDrain.getLong("playbackHeadFrames"))
        val answers = root.getJSONObject("answers")
        listOf(
            "dominant_graph",
            "decode_cache_slope",
            "outside_ort",
            "ar_only_rtf",
            "underrun_cause",
            "selected_voice_used",
            "selected_locale_used",
            "italian_semantics_preserved",
            "cancel_tail_ms",
            "long_read_realtime",
        ).forEach { name -> assertTrue("missing named answer $name", answers.has(name)) }
        assertTrue(answers.getBoolean("selected_voice_used"))
        assertTrue(answers.getBoolean("selected_locale_used"))
    }
}
