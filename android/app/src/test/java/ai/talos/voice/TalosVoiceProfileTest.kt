package ai.talos.voice

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** JSON round trip is pure - no Keystore, no filesystem, no device needed for this half of the profile. */
class TalosVoiceProfileTest {

    private fun sampleProfile(): TalosVoiceProfileV1 {
        val header = TalosVoiceProfileHeaderV1(
            schemaVersion = 1,
            profileId = "a1b2c3d4-0000-0000-0000-000000000000",
            displayName = "La mia voce",
            language = "it-IT",
            style = "neutral",
            backend = "moss-tts-nano",
            codecFingerprint = "aa".repeat(32),
            promptSchemaFingerprint = "bb".repeat(32),
            frameRateMilliHz = 12500,
            quantizerCount = 16,
            codebookSize = 1024,
            frameCount = 250,
            createdAtEpochMs = 1787160000000L,
            enrollmentDurationMs = 24000,
            consentVersion = 1,
        )
        val metrics = TalosVoiceQualityMetrics(
            durationMs = 24000,
            speechRatio = 0.72,
            peakAbs = 0.61,
            rmsDbfs = -18.4,
            clippedSampleRatio = 0.0,
            dcOffset = 0.001,
            noiseFloorDbfs = -52.0,
            snrEstimateDb = 28.3,
            longestSilenceMs = 340,
            zeroFrameRatio = 0.02,
            droppedReadCount = 0,
            clientSilencedObserved = false,
        )
        val codes = List(250) { frame -> IntArray(16) { q -> (frame * 16 + q) % 1024 } }
        return TalosVoiceProfileV1(header, metrics, codes)
    }

    @Test
    fun jsonRoundTripPreservesEveryField() {
        val original = sampleProfile()
        val restored = TalosVoiceProfileV1.fromJson(original.toJson())

        assertEquals(original.header, restored.header)
        assertEquals(original.qualityMetrics, restored.qualityMetrics)
        assertEquals(original.promptAudioCodes.size, restored.promptAudioCodes.size)
        for (i in original.promptAudioCodes.indices) {
            assertTrue(
                "frame $i codes must round-trip exactly",
                original.promptAudioCodes[i].contentEquals(restored.promptAudioCodes[i]),
            )
        }
    }

    /** The contrary case: two profiles built with one field different must NOT compare equal - proves the equality check above actually discriminates. */
    @Test
    fun profilesWithDifferentDisplayNamesAreNotEqual() {
        val a = sampleProfile()
        val b = a.copy(header = a.header.copy(displayName = "Un'altra voce"))
        assertTrue(a.header != b.header)
    }

    @Test
    fun toJsonProducesTheExpectedShape() {
        val json: JSONObject = sampleProfile().toJson()
        assertTrue(json.has("header"))
        assertTrue(json.has("qualityMetrics"))
        assertTrue(json.has("promptAudioCodes"))
        assertEquals("La mia voce", json.getJSONObject("header").getString("displayName"))
        assertEquals(250, json.getJSONArray("promptAudioCodes").length())
        assertEquals(16, json.getJSONArray("promptAudioCodes").getJSONArray(0).length())
    }
}
