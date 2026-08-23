package ai.talos.voice

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosVoiceProfileMigrationTest {
    @Test
    fun `profile envelope reads legacy V1 and writes explicit V2 without guessing keys`() {
        val legacyNonce = ByteArray(12) { it.toByte() }
        val legacyCiphertext = ByteArray(31) { (it * 3).toByte() }
        val legacyBytes = ByteArrayOutputStream().use { bytes ->
            DataOutputStream(bytes).use { output ->
                output.writeInt(legacyNonce.size)
                output.write(legacyNonce)
                output.write(legacyCiphertext)
            }
            bytes.toByteArray()
        }

        val legacy = TalosVoiceProfileEnvelope.decode(legacyBytes)
        assertEquals(1, legacy.schemaVersion)
        assertArrayEquals(legacyNonce, legacy.sealed.nonce)
        assertArrayEquals(legacyCiphertext, legacy.sealed.ciphertext)

        val v2Bytes = TalosVoiceProfileEnvelope.encode(
            schemaVersion = 2,
            sealed = TalosVoiceCiphertext(legacyNonce, legacyCiphertext),
        )
        val v2 = TalosVoiceProfileEnvelope.decode(v2Bytes)
        assertEquals(2, v2.schemaVersion)
        assertArrayEquals(legacyNonce, v2.sealed.nonce)
        assertArrayEquals(legacyCiphertext, v2.sealed.ciphertext)
    }

    @Test
    fun `profile envelope rejects truncated V2 before Keystore access`() {
        val encoded = TalosVoiceProfileEnvelope.encode(
            schemaVersion = 2,
            sealed = TalosVoiceCiphertext(ByteArray(12), ByteArray(16)),
        )

        assertThrows(IllegalArgumentException::class.java) {
            TalosVoiceProfileEnvelope.decode(encoded.copyOf(15))
        }
    }

    @Test
    fun `V1 migration preserves id name timestamps and rollback payload`() {
        val legacy = sampleLegacyProfile()
        val pocket = samplePocketPayload()

        val migrated = TalosVoiceProfileV2.migratedFrom(legacy, pocket)

        assertEquals(legacy.header.profileId, migrated.header.profileId)
        assertEquals(legacy.header.displayName, migrated.header.displayName)
        assertEquals(legacy.header.createdAtEpochMs, migrated.header.createdAtEpochMs)
        assertEquals(legacy.header.enrollmentDurationMs, migrated.header.enrollmentDurationMs)
        assertEquals(1, migrated.header.migratedFromSchemaVersion)
        assertEquals(TalosPocketConditioningPayload.BACKEND, migrated.header.preferredBackend)
        val rollback = migrated.mossPayload()
        assertEquals(legacy.header.codecFingerprint, rollback.codecFingerprint)
        assertEquals(legacy.header.promptSchemaFingerprint, rollback.promptSchemaFingerprint)
        legacy.promptAudioCodes.indices.forEach { index ->
            assertTrue(legacy.promptAudioCodes[index].contentEquals(rollback.promptAudioCodes[index]))
        }
    }

    @Test
    fun `migration failure leaves original V1 byte identical`() {
        val original = ByteArray(91) { index -> (index * 17).toByte() }
        val candidate = ByteArray(137) { index -> (255 - index).toByte() }
        var current = original.copyOf()
        var rollback: ByteArray? = null

        val failure = assertThrows(IllegalStateException::class.java) {
            TalosVoiceProfileMigrationTransaction.run(
                original = original,
                candidate = candidate,
                writeRollback = { rollback = it.copyOf() },
                readRollback = { rollback!!.copyOf() },
                writeCurrent = { current = it.copyOf() },
                readCurrent = { current.copyOf() },
                authenticate = { bytes -> bytes.size },
                verify = { throw IllegalStateException("preview rejected") },
            )
        }

        assertEquals("preview rejected", failure.message)
        assertArrayEquals(original, current)
        assertArrayEquals(original, rollback)
    }

    @Test
    fun `successful migration authenticates committed V2 and retains V1 rollback`() {
        val original = byteArrayOf(1, 3, 5, 7)
        val candidate = byteArrayOf(2, 4, 6, 8, 10)
        var current = original.copyOf()
        var rollback: ByteArray? = null

        val authenticatedLength = TalosVoiceProfileMigrationTransaction.run(
            original = original,
            candidate = candidate,
            writeRollback = { rollback = it.copyOf() },
            readRollback = { rollback!!.copyOf() },
            writeCurrent = { current = it.copyOf() },
            readCurrent = { current.copyOf() },
            authenticate = { bytes -> bytes.size },
            verify = { length -> assertEquals(candidate.size, length) },
        )

        assertEquals(candidate.size, authenticatedLength)
        assertArrayEquals(candidate, current)
        assertArrayEquals(original, rollback)
    }

    private fun sampleLegacyProfile(): TalosVoiceProfileV1 {
        val metrics = TalosVoiceQualityMetrics(
            durationMs = 8_000,
            speechRatio = 0.8,
            peakAbs = 0.5,
            rmsDbfs = -17.0,
            clippedSampleRatio = 0.0,
            dcOffset = 0.0,
            noiseFloorDbfs = -48.0,
            snrEstimateDb = 25.0,
            longestSilenceMs = 200,
            zeroFrameRatio = 0.01,
            droppedReadCount = 0,
            clientSilencedObserved = false,
        )
        return TalosVoiceProfileV1(
            header = TalosVoiceProfileHeaderV1(
                schemaVersion = 1,
                profileId = "a1b2c3d4-0000-0000-0000-000000000000",
                displayName = "Voce originale",
                language = "it-IT",
                style = "neutral",
                backend = TalosMossPromptPayload.BACKEND,
                codecFingerprint = "aa".repeat(32),
                promptSchemaFingerprint = "bb".repeat(32),
                frameRateMilliHz = 12_500,
                quantizerCount = 4,
                codebookSize = 1_024,
                frameCount = 2,
                createdAtEpochMs = 1_787_160_000_000L,
                enrollmentDurationMs = 8_000,
                consentVersion = 1,
            ),
            qualityMetrics = metrics,
            promptAudioCodes = listOf(intArrayOf(1, 2, 3, 4), intArrayOf(5, 6, 7, 8)),
        )
    }

    private fun samplePocketPayload(): TalosPocketConditioningPayload = TalosPocketConditioningPayload(
        repository = TalosPocketConditioningPayload.REPOSITORY,
        revision = TalosPocketConditioningPayload.REVISION,
        sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
        shape = longArrayOf(1, 1, TalosPocketConditioningPayload.CONDITIONING_DIM.toLong()),
        values = FloatArray(TalosPocketConditioningPayload.CONDITIONING_DIM) { index -> index / 1_024f },
    )
}
