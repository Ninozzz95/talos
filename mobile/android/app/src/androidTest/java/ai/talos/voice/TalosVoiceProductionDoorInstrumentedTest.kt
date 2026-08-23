package ai.talos.voice

import ai.talos.voice.research.TalosVoiceDiagnosticConfig
import ai.talos.voice.research.TalosVoiceDiagnosticProbe
import ai.talos.voice.research.TalosVoiceDiagnosticRoute
import ai.talos.voice.research.TalosVoiceDiagnosticSession
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TalosVoiceProductionDoorInstrumentedTest {
    @Test
    fun normalHostStreamingCallWritesTheDiagnosticArtifact() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val route = TalosVoiceDiagnosticRoute(
            traceId = "voice-production-door-test",
            readingId = "reading-production-door",
            source = "instrumentation",
            requestedLocale = "it-IT",
            requestedEngine = "personal",
            requestedProfileId = null,
        )
        val session = TalosVoiceDiagnosticSession(
            TalosVoiceDiagnosticConfig(
                outputDirectory = File(context.getExternalFilesDir(null), "research/voice/production-door-test"),
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
        TalosVoiceDiagnosticProbe.armNextProductionRun(session)

        val result = TalosVoiceHost.get(context).speakStreamingBlocking(
            text = "Ciao.",
            voice = "Junhao",
            maxFrames = 1,
            seed = 42L,
            diagnosticRoute = route,
        )

        assertFalse(result.cancelled)
        val artifact = session.artifactFileOrNull()
        assertTrue("the normal production host call did not finish its trace", artifact?.isFile == true)
        val root = JSONObject(artifact!!.readText(Charsets.UTF_8))
        val kinds = (0 until root.getJSONArray("events").length()).map { index ->
            root.getJSONArray("events").getJSONObject(index).getString("kind")
        }
        assertTrue(kinds.contains("PRODUCTION_DOOR_ENTERED"))
        assertTrue(kinds.contains("CODEC_DECODE"))
        assertTrue(kinds.contains("AUDIO_WRITE"))
        assertTrue(kinds.contains("COMPLETED"))
    }
}

