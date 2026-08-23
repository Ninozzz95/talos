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
                usbTransportProof = "USB\\VID_22D9&PID_2769\\2ea6573c",
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
                kind = TalosVoiceDiagnosticEventKind.AUDIO_WRITE,
                stage = "AudioTrack.write",
                durationNs = 120_000,
                requestedFrames = 960,
                writtenFrames = 960,
                underrunCount = 0,
            ),
        )
        val file = session.finish(
            TalosVoiceDiagnosticOutcome(
                termination = "DONE",
                resolvedEngine = "personal",
                resolvedLocale = "it-IT",
                resolvedProfileId = rawProfileId,
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
        assertEquals(1, root.getInt("schemaVersion"))
        assertEquals(3, root.getJSONArray("events").length())
        assertEquals(64, root.getJSONObject("route").getString("requestedProfileIdSha256").length)
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
