package ai.talos.voice

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosVoiceAvailabilityTest {
    @Test
    fun `POCKET-STATUS-01 missing and corrupt Pocket never report installed`() {
        val missing = TalosVoiceAvailabilityResolver.forModel(
            snapshot(TalosPocketModelStatus.Missing("mimi_encoder.onnx")),
        )
        val corrupt = TalosVoiceAvailabilityResolver.forModel(
            snapshot(TalosPocketModelStatus.Corrupt("tokenizer.model", "sha256")),
        )

        assertTrue(missing.supported)
        assertFalse(missing.installed)
        assertEquals("missing", missing.modelState)
        assertTrue(missing.failure!!.contains("mimi_encoder.onnx"))
        assertTrue(corrupt.supported)
        assertFalse(corrupt.installed)
        assertEquals("corrupt", corrupt.modelState)
        assertTrue(corrupt.failure!!.contains("tokenizer.model"))
        assertTrue(corrupt.failure!!.contains("sha256"))
    }

    @Test
    fun `POCKET-STATUS-02 Ready requires at least one hash verified file`() {
        val unverified = TalosVoiceAvailabilityResolver.forModel(
            snapshot(TalosPocketModelStatus.Ready(File("pocket"), 0)),
        )
        val ready = TalosVoiceAvailabilityResolver.forModel(
            snapshot(TalosPocketModelStatus.Ready(File("pocket"), 8), cacheHit = true),
        )

        assertFalse(unverified.installed)
        assertEquals("unverified", unverified.modelState)
        assertEquals(0, unverified.verifiedFiles)
        assertTrue(ready.installed)
        assertEquals("ready", ready.modelState)
        assertEquals(8, ready.verifiedFiles)
        assertTrue(ready.cacheHit)
        assertEquals(TalosPocketConditioningPayload.BACKEND, ready.backend)
        assertEquals(TalosPocketConditioningPayload.REVISION, ready.engineBuild)
    }

    @Test
    fun `POCKET-PROFILE-01 Pocket only V2 is compatible iff the production router selects Pocket`() {
        val profile = profile(includeMoss = false)
        val missing = TalosVoiceAvailabilityResolver.forProfile(
            profile = profile,
            pocketStatus = TalosPocketModelStatus.Missing("bundle.json"),
            mossCompatible = false,
        )
        val ready = TalosVoiceAvailabilityResolver.forProfile(
            profile = profile,
            pocketStatus = TalosPocketModelStatus.Ready(File("pocket"), 8),
            mossCompatible = false,
        )

        assertFalse(missing.compatible)
        assertNull(missing.resolvedBackend)
        assertTrue(missing.incompatibilityReason!!.contains("no verified voice backend"))
        assertTrue(ready.compatible)
        assertEquals(TalosPocketConditioningPayload.BACKEND, ready.resolvedBackend)
        assertNull(ready.fallbackReason)
        assertNull(ready.incompatibilityReason)
    }

    @Test
    fun `POCKET-PROFILE-02 dual migrated profile needs a real MOSS fallback when Pocket is missing`() {
        val profile = profile(includeMoss = true)
        val unavailable = TalosVoiceAvailabilityResolver.forProfile(
            profile = profile,
            pocketStatus = TalosPocketModelStatus.Missing("bundle.json"),
            mossCompatible = false,
        )
        val fallback = TalosVoiceAvailabilityResolver.forProfile(
            profile = profile,
            pocketStatus = TalosPocketModelStatus.Missing("bundle.json"),
            mossCompatible = true,
        )

        assertFalse(unavailable.compatible)
        assertTrue(fallback.compatible)
        assertEquals(TalosMossPromptPayload.BACKEND, fallback.resolvedBackend)
        assertEquals("pocketModelMissing:bundle.json", fallback.fallbackReason)
    }

    private fun snapshot(
        status: TalosPocketModelStatus,
        cacheHit: Boolean = false,
    ) = TalosPocketModelStatusSnapshot(
        status = status,
        cacheHit = cacheHit,
        verificationStartedAtNs = 10L,
        verificationDurationNs = 20L,
        verificationThreadName = "talos-voice-owner",
    )

    private fun profile(includeMoss: Boolean): TalosVoiceProfileV2 {
        val pocket = TalosPocketConditioningPayload(
            repository = TalosPocketConditioningPayload.REPOSITORY,
            revision = TalosPocketConditioningPayload.REVISION,
            sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
            shape = longArrayOf(1, 1, TalosPocketConditioningPayload.CONDITIONING_DIM.toLong()),
            values = FloatArray(TalosPocketConditioningPayload.CONDITIONING_DIM),
        )
        val payloads = mutableListOf<TalosVoiceBackendPayload>(pocket)
        if (includeMoss) {
            payloads += TalosMossPromptPayload(
                codecFingerprint = "a".repeat(64),
                promptSchemaFingerprint = "b".repeat(64),
                frameRateMilliHz = 12_500,
                quantizerCount = 1,
                codebookSize = 1_024,
                promptAudioCodes = listOf(intArrayOf(1)),
            )
        }
        return TalosVoiceProfileV2(
            header = TalosVoiceProfileHeaderV2(
                schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
                profileId = "profile-1",
                displayName = "Voce italiana",
                language = "it-IT",
                style = "neutral",
                preferredBackend = TalosPocketConditioningPayload.BACKEND,
                createdAtEpochMs = 1L,
                enrollmentDurationMs = 4_000,
                consentVersion = 1,
                migratedFromSchemaVersion = if (includeMoss) 1 else null,
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
            backendPayloads = payloads,
        )
    }
}
