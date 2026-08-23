package ai.talos.voice

import ai.talos.voice.research.TalosVoiceDiagnosticConfig
import ai.talos.voice.research.TalosVoiceDiagnosticProbe
import ai.talos.voice.research.TalosVoiceDiagnosticRoute
import ai.talos.voice.research.TalosVoiceDiagnosticSession
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TalosVoiceProductionDoorInstrumentedTest {
    @Test
    fun normalProfileHostCallWritesActualPocketBackendLocaleProfileAndFallbackFields() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        TalosVoiceHost.resetForTests()
        val profileId = "production-door-profile"
        val route = TalosVoiceDiagnosticRoute(
            traceId = "voice-production-door-test",
            readingId = "reading-production-door",
            source = "instrumentation",
            requestedLocale = "it-IT",
            requestedEngine = "personal",
            requestedProfileId = profileId,
        )
        val session = TalosVoiceDiagnosticSession(
            TalosVoiceDiagnosticConfig(
                outputDirectory = File(context.getExternalFilesDir(null), "research/voice/production-door-test"),
                route = route,
                appVersion = "0.1.19",
                appCommit = "0".repeat(40),
                apkSha256 = "1".repeat(64),
                modelRevision = TalosPocketConditioningPayload.REVISION,
                modelSha256 = "2".repeat(64),
                deviceFingerprint = android.os.Build.FINGERPRINT,
                usbTransportProof = "USB\\VID_22D9&PID_2769\\2ea6573c",
            ),
        )
        TalosVoiceDiagnosticProbe.armNextProductionRun(session)

        val pocketRoot = TalosPocketModelManager.modelRoot(requireNotNull(context.getExternalFilesDir(null)))
        val conditioning = readPinnedFloats(
            File(pocketRoot, ORACLE_CONDITIONING),
            EXPECTED_CONDITIONING_FLOATS,
            EXPECTED_CONDITIONING_SHA256,
        )
        val profile = pocketProfile(profileId, conditioning)
        val result = try {
            TalosVoiceHost.get(context).speakStreamingWithProfileBlocking(
                text = "Ciao, questa è una prova italiana.",
                locale = "it-IT",
                profile = profile,
                maxFrames = 2,
                seed = 42L,
                diagnosticRoute = route,
            )
        } finally {
            TalosVoiceHost.resetForTests()
        }

        assertFalse(result.cancelled)
        assertEquals(TalosPocketConditioningPayload.BACKEND, result.resolvedEngine)
        assertEquals("it-IT", result.resolvedLocale)
        assertEquals(profileId, result.resolvedProfileId)
        assertNull(result.fallbackReason)
        val artifact = session.artifactFileOrNull()
        assertTrue("the normal production host call did not finish its trace", artifact?.isFile == true)
        val root = JSONObject(artifact!!.readText(Charsets.UTF_8))
        val kinds = (0 until root.getJSONArray("events").length()).map { index ->
            root.getJSONArray("events").getJSONObject(index).getString("kind")
        }
        assertTrue(kinds.contains("PRODUCTION_DOOR_ENTERED"))
        assertTrue(kinds.contains("ROUTE_RESOLVED"))
        assertTrue(kinds.contains("TEXT_CONDITIONER"))
        assertTrue(kinds.contains("FLOW_MAIN"))
        assertTrue(kinds.contains("CODEC_DECODE"))
        assertTrue(kinds.contains("AUDIO_WRITE"))
        assertTrue(kinds.contains("COMPLETED"))
        val artifactRoute = root.getJSONObject("route")
        assertEquals(TalosPocketConditioningPayload.BACKEND, artifactRoute.getString("resolvedEngine"))
        assertEquals("it-IT", artifactRoute.getString("resolvedLocale"))
        assertTrue(artifactRoute.isNull("fallbackReason"))
        assertTrue(root.getJSONObject("answers").getBoolean("selected_voice_used"))
        assertTrue(root.getJSONObject("answers").getBoolean("selected_locale_used"))
    }

    private fun pocketProfile(profileId: String, conditioning: FloatArray) = TalosVoiceProfileV2(
        header = TalosVoiceProfileHeaderV2(
            schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
            profileId = profileId,
            displayName = "Production door fixture",
            language = "it-IT",
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

    private fun readPinnedFloats(file: File, expectedCount: Int, expectedSha256: String): FloatArray {
        require(file.isFile) { "missing production-door conditioning: ${file.absolutePath}" }
        val bytes = file.readBytes()
        require(sha256(bytes) == expectedSha256) { "production-door conditioning SHA-256 differs" }
        require(bytes.size == expectedCount * Float.SIZE_BYTES) { "production-door conditioning size differs" }
        val source = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asFloatBuffer()
        return FloatArray(expectedCount).also { values ->
            source.get(values)
            require(values.all(Float::isFinite)) { "production-door conditioning contains non-finite values" }
        }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it.toInt() and 0xff) }

    private companion object {
        const val ORACLE_CONDITIONING = "oracle-conditioning-temp0.f32le"
        const val EXPECTED_CONDITIONING_FRAMES = 112
        const val EXPECTED_CONDITIONING_FLOATS = EXPECTED_CONDITIONING_FRAMES * 1_024
        const val EXPECTED_CONDITIONING_SHA256 = "a9d6f8507dca70928d521e4aad7ac1ae426c78442e24c0e21337586e815f3b6e"
    }
}
