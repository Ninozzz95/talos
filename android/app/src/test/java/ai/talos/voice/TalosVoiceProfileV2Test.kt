package ai.talos.voice

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosVoiceProfileV2Test {
    @Test
    fun `V2 round trip authenticates both backend payloads`() {
        val original = sampleProfile()

        val restored = TalosVoiceProfilePayloadCodec.decode(
            TalosVoiceProfilePayloadCodec.encode(original),
        )

        assertEquals(original.header, restored.header)
        assertEquals(original.qualityMetrics, restored.qualityMetrics)
        assertEquals(original.backendPayloads.map { it.backend }, restored.backendPayloads.map { it.backend })
        val moss = restored.mossPayload()
        assertEquals(2, moss.promptAudioCodes.size)
        assertTrue(moss.promptAudioCodes[0].contentEquals(intArrayOf(1, 2, 3, 4)))
        assertTrue(moss.promptAudioCodes[1].contentEquals(intArrayOf(5, 6, 7, 8)))
        val pocket = restored.pocketPayload()
        assertTrue(pocket.shape.contentEquals(longArrayOf(1, 2, 1_024)))
        assertTrue(pocket.valuesCopy().contentEquals(FloatArray(2_048) { index -> index / 2_048f }))
    }

    @Test
    fun `single byte payload mutation fails closed`() {
        val encoded = TalosVoiceProfilePayloadCodec.encode(sampleProfile())
        val json = JSONObject(String(encoded, Charsets.UTF_8))
        val payloads = json.getJSONArray("payloads")
        val pocket = (0 until payloads.length())
            .map(payloads::getJSONObject)
            .single { it.getString("backend") == TalosPocketConditioningPayload.BACKEND }
        val data = pocket.getString("data")
        pocket.put("data", (if (data[0] == 'A') "B" else "A") + data.substring(1))

        assertThrows(IllegalArgumentException::class.java) {
            TalosVoiceProfilePayloadCodec.decode(json.toString().toByteArray(Charsets.UTF_8))
        }
    }

    @Test
    fun `duplicate backend payload is rejected`() {
        val profile = sampleProfile()
        val duplicate = profile.backendPayloads.first()

        assertThrows(IllegalArgumentException::class.java) {
            profile.copy(backendPayloads = profile.backendPayloads + duplicate)
        }
    }

    @Test
    fun `Pocket payload rejects non finite conditioning`() {
        assertThrows(IllegalArgumentException::class.java) {
            TalosPocketConditioningPayload(
                repository = TalosPocketConditioningPayload.REPOSITORY,
                revision = TalosPocketConditioningPayload.REVISION,
                sampleRate = 24_000,
                shape = longArrayOf(1, 1, 1_024),
                values = FloatArray(1_024).also { it[512] = Float.NaN },
            )
        }
    }

    private fun sampleProfile(): TalosVoiceProfileV2 {
        val header = TalosVoiceProfileHeaderV2(
            schemaVersion = 2,
            profileId = "a1b2c3d4-0000-0000-0000-000000000000",
            displayName = "La mia voce",
            language = "it-IT",
            style = "neutral",
            preferredBackend = TalosPocketConditioningPayload.BACKEND,
            createdAtEpochMs = 1_787_160_000_000L,
            enrollmentDurationMs = 24_000,
            consentVersion = 1,
            migratedFromSchemaVersion = 1,
        )
        val metrics = TalosVoiceQualityMetrics(
            durationMs = 24_000,
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
        val moss = TalosMossPromptPayload(
            codecFingerprint = "aa".repeat(32),
            promptSchemaFingerprint = "bb".repeat(32),
            frameRateMilliHz = 12_500,
            quantizerCount = 4,
            codebookSize = 1_024,
            promptAudioCodes = listOf(
                intArrayOf(1, 2, 3, 4),
                intArrayOf(5, 6, 7, 8),
            ),
        )
        val pocket = TalosPocketConditioningPayload(
            repository = TalosPocketConditioningPayload.REPOSITORY,
            revision = TalosPocketConditioningPayload.REVISION,
            sampleRate = 24_000,
            shape = longArrayOf(1, 2, 1_024),
            values = FloatArray(2_048) { index -> index / 2_048f },
        )
        return TalosVoiceProfileV2(header, metrics, listOf(moss, pocket))
    }
}
