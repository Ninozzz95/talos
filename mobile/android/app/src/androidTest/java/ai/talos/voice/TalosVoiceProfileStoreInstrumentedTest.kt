package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Android Keystore only means something on a real device - there is no
 * host-JVM keystore to fake it against. Blueprint §7.2's whole point,
 * proven here: delete a profile and its ciphertext becomes permanently
 * unreadable, not "harder to read" - the key is gone, not just the file.
 */
@RunWith(AndroidJUnit4::class)
class TalosVoiceProfileStoreInstrumentedTest {

    private fun store(): TalosVoiceProfileStore {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceProfileStore(context)
    }

    private fun sampleProfile(profileId: String = UUID.randomUUID().toString(), displayName: String = "Voce di prova"): TalosVoiceProfileV1 {
        val header = TalosVoiceProfileHeaderV1(
            schemaVersion = 1,
            profileId = profileId,
            displayName = displayName,
            language = "it-IT",
            style = "neutral",
            backend = "moss-tts-nano",
            codecFingerprint = "aa".repeat(32),
            promptSchemaFingerprint = "bb".repeat(32),
            frameRateMilliHz = 12500,
            quantizerCount = 16,
            codebookSize = 1024,
            frameCount = 3,
            createdAtEpochMs = System.currentTimeMillis(),
            enrollmentDurationMs = 20000,
            consentVersion = 1,
        )
        val metrics = TalosVoiceQualityMetrics(
            durationMs = 20000, speechRatio = 0.7, peakAbs = 0.5, rmsDbfs = -20.0,
            clippedSampleRatio = 0.0, dcOffset = 0.0, noiseFloorDbfs = -50.0, snrEstimateDb = 25.0,
            longestSilenceMs = 200, zeroFrameRatio = 0.01, droppedReadCount = 0, clientSilencedObserved = false,
        )
        val codes = listOf(intArrayOf(1, 2, 3, 4), intArrayOf(5, 6, 7, 8), intArrayOf(9, 10, 11, 12))
        return TalosVoiceProfileV1(header, metrics, codes)
    }

    @Test
    fun saveThenLoadRoundTripsExactly() {
        val s = store()
        val profile = sampleProfile()
        try {
            s.save(profile)
            assertTrue(s.exists(profile.header.profileId))
            val loaded = s.load(profile.header.profileId)
            assertEquals(profile.header, loaded.header)
            assertEquals(profile.qualityMetrics, loaded.qualityMetrics)
            for (i in profile.promptAudioCodes.indices) {
                assertTrue(profile.promptAudioCodes[i].contentEquals(loaded.promptAudioCodes[i]))
            }
        } finally {
            s.delete(profile.header.profileId)
        }
    }

    /**
     * The contrary case, and blueprint §7.2's actual point: after delete,
     * the ciphertext on disk (if it somehow survived) must be
     * undecryptable - not just "the file is gone", the KEY is gone. This
     * deletes only the Keystore alias underneath a still-present file to
     * isolate exactly that claim.
     */
    @Test
    fun deletingTheKeyAloneMakesSurvivingCiphertextPermanentlyUnreadable() {
        val s = store()
        val profile = sampleProfile()
        s.save(profile)
        val profileId = profile.header.profileId
        try {
            assertTrue(TalosVoiceProfileCipher.hasKey(profileId))
            TalosVoiceProfileCipher.deleteKey(profileId)
            assertFalse(TalosVoiceProfileCipher.hasKey(profileId))

            // The file is still on disk (delete() was not called) - only the key is gone.
            assertThrows(Exception::class.java) { s.load(profileId) }
        } finally {
            s.delete(profileId) // real cleanup: file + whatever key state remains
        }
    }

    @Test
    fun deleteRemovesBothTheFileAndTheKey() {
        val s = store()
        val profile = sampleProfile()
        s.save(profile)
        val profileId = profile.header.profileId
        assertTrue(s.exists(profileId))
        assertTrue(TalosVoiceProfileCipher.hasKey(profileId))

        s.delete(profileId)

        assertFalse(s.exists(profileId))
        assertFalse(TalosVoiceProfileCipher.hasKey(profileId))
    }

    @Test
    fun twoProfilesGetIndependentKeysAndDeletingOneLeavesTheOtherIntact() {
        val s = store()
        val a = sampleProfile(displayName = "Voce A")
        val b = sampleProfile(displayName = "Voce B")
        s.save(a)
        s.save(b)
        try {
            assertNotEquals(a.header.profileId, b.header.profileId)
            s.delete(a.header.profileId)
            assertFalse(s.exists(a.header.profileId))
            // The real proof of independence: B is still fully readable after A is gone.
            val stillLoadable = s.load(b.header.profileId)
            assertEquals(b.header.displayName, stillLoadable.header.displayName)
        } finally {
            s.delete(a.header.profileId)
            s.delete(b.header.profileId)
        }
    }

    @Test
    fun renameChangesOnlyDisplayNameEverythingElseSurvives() {
        val s = store()
        val profile = sampleProfile(displayName = "Prima del cambio")
        s.save(profile)
        val profileId = profile.header.profileId
        try {
            s.rename(profileId, "Dopo il cambio")
            val renamed = s.load(profileId)
            assertEquals("Dopo il cambio", renamed.header.displayName)
            assertEquals(profile.header.copy(displayName = "Dopo il cambio"), renamed.header)
            for (i in profile.promptAudioCodes.indices) {
                assertTrue(profile.promptAudioCodes[i].contentEquals(renamed.promptAudioCodes[i]))
            }
        } finally {
            s.delete(profileId)
        }
    }

    @Test
    fun listIncludesSavedProfilesAndExcludesDeletedOnes() {
        val s = store()
        val profile = sampleProfile()
        val profileId = profile.header.profileId
        assertFalse(s.list().contains(profileId))
        s.save(profile)
        try {
            assertTrue(s.list().contains(profileId))
        } finally {
            s.delete(profileId)
        }
        assertFalse(s.list().contains(profileId))
    }

    @Test
    fun codecFingerprintIsStableAcrossRepeatedComputationsOnTheSameFiles() {
        val root = TalosVoiceModelManager.modelRoot(
            InstrumentationRegistry.getInstrumentation().targetContext.getExternalFilesDir(null)!!,
        )
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val first = TalosVoiceProfileCompatibility.codecFingerprint(root)
        val second = TalosVoiceProfileCompatibility.codecFingerprint(root)
        assertEquals("hashing the same real codec files twice must give the same fingerprint", first, second)
        assertTrue(first.length == 64) // SHA-256 hex
    }
}
