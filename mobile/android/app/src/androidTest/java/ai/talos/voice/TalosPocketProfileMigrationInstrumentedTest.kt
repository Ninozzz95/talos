package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith


@RunWith(AndroidJUnit4::class)
class TalosPocketProfileMigrationInstrumentedTest {
    @Test
    fun migrationCommitterRejectsAChangedV1SnapshotBeforeWritingV2() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = TalosVoiceProfileStore(context)
        val legacy = sampleLegacyProfile()
        try {
            store.save(legacy)
            store.rename(legacy.header.profileId, "Profilo modificato durante la preview")
            val candidate = TalosVoiceProfileV2.migratedFrom(legacy, samplePocketPayload())

            assertThrows(IllegalStateException::class.java) {
                TalosVoiceProfileStoreMigrationCommitter(store).commit(legacy, candidate)
            }

            val active = store.loadAny(legacy.header.profileId)
            assertTrue(active is TalosStoredVoiceProfile.Legacy)
            assertEquals(
                "Profilo modificato durante la preview",
                (active as TalosStoredVoiceProfile.Legacy).profile.header.displayName,
            )
            assertFalse(store.hasV1Rollback(legacy.header.profileId))
            assertFalse(
                TalosVoiceProfileCipher.hasKey(
                    legacy.header.profileId,
                    TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                ),
            )
        } finally {
            store.delete(legacy.header.profileId)
        }
    }

    @Test
    fun migrationFailureRestoresTheExactV1CiphertextAndDeletesTheV2Key() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = TalosVoiceProfileStore(context)
        val legacy = sampleLegacyProfile()
        val profileFile = File(context.filesDir, "voice/profiles/${legacy.header.profileId}.tvp")
        try {
            store.save(legacy)
            val originalBytes = profileFile.readBytes()

            assertThrows(IllegalStateException::class.java) {
                store.migrateV1ToV2Atomically(
                    profileId = legacy.header.profileId,
                    convert = { TalosVoiceProfileV2.migratedFrom(it, samplePocketPayload()) },
                    verify = { throw IllegalStateException("preview rejected") },
                )
            }

            assertArrayEquals(originalBytes, profileFile.readBytes())
            assertEquals(legacy.header, store.load(legacy.header.profileId).header)
            assertFalse(
                TalosVoiceProfileCipher.hasKey(
                    legacy.header.profileId,
                    TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                ),
            )
        } finally {
            store.delete(legacy.header.profileId)
        }
    }

    @Test
    fun successfulMigrationKeepsBothFallbacksAndCanRestoreV1ByteIdentical() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val store = TalosVoiceProfileStore(context)
        val legacy = sampleLegacyProfile()
        val profileFile = File(context.filesDir, "voice/profiles/${legacy.header.profileId}.tvp")
        try {
            store.save(legacy)
            val originalBytes = profileFile.readBytes()

            val migrated = store.migrateV1ToV2Atomically(
                profileId = legacy.header.profileId,
                convert = { TalosVoiceProfileV2.migratedFrom(it, samplePocketPayload()) },
                verify = { profile -> assertEquals(TalosPocketConditioningPayload.BACKEND, profile.header.preferredBackend) },
            )

            assertEquals(migrated, store.loadV2(legacy.header.profileId))
            assertTrue(store.hasV1Rollback(legacy.header.profileId))
            assertTrue(TalosVoiceProfileCipher.hasKey(legacy.header.profileId, 1))
            assertTrue(
                TalosVoiceProfileCipher.hasKey(
                    legacy.header.profileId,
                    TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                ),
            )

            val restored = store.rollbackToV1(legacy.header.profileId)
            assertEquals(legacy.header, restored.header)
            assertArrayEquals(originalBytes, profileFile.readBytes())
            assertFalse(store.hasV1Rollback(legacy.header.profileId))
            assertFalse(
                TalosVoiceProfileCipher.hasKey(
                    legacy.header.profileId,
                    TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                ),
            )
        } finally {
            store.delete(legacy.header.profileId)
        }
    }

    private fun sampleLegacyProfile(): TalosVoiceProfileV1 {
        val profileId = UUID.randomUUID().toString()
        return TalosVoiceProfileV1(
            header = TalosVoiceProfileHeaderV1(
                schemaVersion = 1,
                profileId = profileId,
                displayName = "Migrazione Pocket",
                language = "it-IT",
                style = "neutral",
                backend = TalosMossPromptPayload.BACKEND,
                codecFingerprint = "aa".repeat(32),
                promptSchemaFingerprint = "bb".repeat(32),
                frameRateMilliHz = 12_500,
                quantizerCount = 4,
                codebookSize = 1_024,
                frameCount = 2,
                createdAtEpochMs = System.currentTimeMillis(),
                enrollmentDurationMs = 8_000,
                consentVersion = 1,
            ),
            qualityMetrics = TalosVoiceQualityMetrics(
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
            ),
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
