package ai.talos.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosVoiceProfileMigratorTest {
    @Test
    fun `decoded V1 reference is zeroed and committed only after an exact Pocket preview`() {
        val legacy = legacyProfile()
        val transientPcm = floatArrayOf(0.25f, -0.5f, 0.75f, -1f)
        val boundaries = mutableListOf<String>()
        val metrics = mutableListOf<TalosVoiceProfileMigrationMetric>()
        val migrator = TalosVoiceProfileMigrator(
            decoder = TalosLegacyReferenceDecoder { promptCodes ->
                boundaries += "decode"
                assertTrue(promptCodes.indices.all { promptCodes[it].contentEquals(legacy.promptAudioCodes[it]) })
                TalosDecodedVoiceReference(transientPcm, sampleRate = 48_000)
            },
            encoder = TalosPocketReferenceEncoder { pcm, sampleRate ->
                boundaries += "encode"
                assertSame(transientPcm, pcm)
                assertEquals(48_000, sampleRate)
                pocketPayload()
            },
        )

        val outcome = migrator.migrate(
            legacy = legacy,
            requestedLocale = "it-IT",
            cancellation = TalosVoiceProfileMigrationCancellation { false },
            preview = { candidate ->
                boundaries += "preview"
                assertTrue(transientPcm.all { it == 0f })
                TalosVoiceProfilePreview(
                    cancelled = false,
                    resolvedEngine = TalosPocketConditioningPayload.BACKEND,
                    resolvedLocale = "it-IT",
                    resolvedProfileId = candidate.header.profileId,
                    fallbackReason = null,
                )
            },
            commit = TalosVoiceProfileMigrationCommitter { expected, candidate ->
                boundaries += "commit"
                assertSame(legacy, expected)
                candidate
            },
            onMetric = metrics::add,
        )

        assertEquals(listOf("decode", "encode", "preview", "commit"), boundaries)
        assertEquals(legacy.header.profileId, outcome.profile.header.profileId)
        assertEquals(legacy.header.displayName, outcome.profile.header.displayName)
        assertEquals(legacy.header.createdAtEpochMs, outcome.profile.header.createdAtEpochMs)
        assertEquals(1, outcome.profile.header.migratedFromSchemaVersion)
        assertEquals(TalosPocketConditioningPayload.BACKEND, outcome.profile.header.preferredBackend)
        assertEquals(TalosPocketConditioningPayload.BACKEND, outcome.preview.resolvedEngine)
        assertEquals(
            listOf(
                "moss_reference_decode",
                "pocket_reference_encode",
                "profile_migration_pcm_zeroed",
                "profile_migration_preview",
                "profile_migration_commit",
            ),
            metrics.map { it.stage },
        )
    }

    @Test
    fun `cancellation after decode zeroes PCM and never encodes previews or commits`() {
        val transientPcm = floatArrayOf(0.4f, -0.4f)
        var cancelled = false
        var encoderCalled = false
        var previewCalled = false
        var commitCalled = false
        val migrator = TalosVoiceProfileMigrator(
            decoder = TalosLegacyReferenceDecoder {
                cancelled = true
                TalosDecodedVoiceReference(transientPcm, 48_000)
            },
            encoder = TalosPocketReferenceEncoder { _, _ ->
                encoderCalled = true
                pocketPayload()
            },
        )

        assertThrows(TalosVoiceProfileMigrationCancelledException::class.java) {
            migrator.migrate(
                legacy = legacyProfile(),
                requestedLocale = "it-IT",
                cancellation = TalosVoiceProfileMigrationCancellation { cancelled },
                preview = {
                    previewCalled = true
                    exactPocketPreview(it)
                },
                commit = TalosVoiceProfileMigrationCommitter { _, candidate ->
                    commitCalled = true
                    candidate
                },
            )
        }

        assertTrue(transientPcm.all { it == 0f })
        assertFalse(encoderCalled)
        assertFalse(previewCalled)
        assertFalse(commitCalled)
    }

    @Test
    fun `MOSS preview fallback is rejected and never commits V2`() {
        var commitCalled = false
        val migrator = workingMigrator()

        assertThrows(IllegalStateException::class.java) {
            migrator.migrate(
                legacy = legacyProfile(),
                requestedLocale = "it-IT",
                cancellation = TalosVoiceProfileMigrationCancellation { false },
                preview = { candidate ->
                    TalosVoiceProfilePreview(
                        cancelled = false,
                        resolvedEngine = TalosMossPromptPayload.BACKEND,
                        resolvedLocale = "und",
                        resolvedProfileId = candidate.header.profileId,
                        fallbackReason = "pocketRuntimeFailure:IllegalStateException",
                    )
                },
                commit = TalosVoiceProfileMigrationCommitter { _, candidate ->
                    commitCalled = true
                    candidate
                },
            )
        }

        assertFalse(commitCalled)
    }

    @Test
    fun `commit failure propagates after preview without claiming migration`() {
        val failure = IllegalStateException("deliberate atomic commit failure")
        val observed = assertThrows(IllegalStateException::class.java) {
            workingMigrator().migrate(
                legacy = legacyProfile(),
                requestedLocale = "it-IT",
                cancellation = TalosVoiceProfileMigrationCancellation { false },
                preview = ::exactPocketPreview,
                commit = TalosVoiceProfileMigrationCommitter { _, _ -> throw failure },
            )
        }

        assertSame(failure, observed)
    }

    @Test
    fun `non finite decoded PCM is zeroed before failing closed`() {
        val transientPcm = floatArrayOf(0.1f, Float.NaN)
        var encoderCalled = false
        val migrator = TalosVoiceProfileMigrator(
            decoder = TalosLegacyReferenceDecoder { TalosDecodedVoiceReference(transientPcm, 48_000) },
            encoder = TalosPocketReferenceEncoder { _, _ ->
                encoderCalled = true
                pocketPayload()
            },
        )

        assertThrows(IllegalArgumentException::class.java) {
            migrator.migrate(
                legacy = legacyProfile(),
                requestedLocale = "it-IT",
                cancellation = TalosVoiceProfileMigrationCancellation { false },
                preview = ::exactPocketPreview,
                commit = TalosVoiceProfileMigrationCommitter { _, candidate -> candidate },
            )
        }

        assertTrue(transientPcm.all { it == 0f })
        assertFalse(encoderCalled)
    }

    @Test
    fun `committer returning a different profile fails closed`() {
        assertThrows(IllegalStateException::class.java) {
            workingMigrator().migrate(
                legacy = legacyProfile(),
                requestedLocale = "it-IT",
                cancellation = TalosVoiceProfileMigrationCancellation { false },
                preview = ::exactPocketPreview,
                commit = TalosVoiceProfileMigrationCommitter { _, candidate ->
                    candidate.copy(header = candidate.header.copy(displayName = "Wrong profile"))
                },
            )
        }
    }

    private fun workingMigrator(): TalosVoiceProfileMigrator = TalosVoiceProfileMigrator(
        decoder = TalosLegacyReferenceDecoder {
            TalosDecodedVoiceReference(floatArrayOf(0.2f, -0.2f), sampleRate = 48_000)
        },
        encoder = TalosPocketReferenceEncoder { _, _ -> pocketPayload() },
    )

    private fun exactPocketPreview(candidate: TalosVoiceProfileV2): TalosVoiceProfilePreview =
        TalosVoiceProfilePreview(
            cancelled = false,
            resolvedEngine = TalosPocketConditioningPayload.BACKEND,
            resolvedLocale = "it-IT",
            resolvedProfileId = candidate.header.profileId,
            fallbackReason = null,
        )

    private fun legacyProfile(): TalosVoiceProfileV1 = TalosVoiceProfileV1(
        header = TalosVoiceProfileHeaderV1(
            schemaVersion = 1,
            profileId = "profile-1",
            displayName = "Voce italiana",
            language = "it-IT",
            style = "neutral",
            backend = TalosMossPromptPayload.BACKEND,
            codecFingerprint = "aa".repeat(32),
            promptSchemaFingerprint = "bb".repeat(32),
            frameRateMilliHz = 12_500,
            quantizerCount = 2,
            codebookSize = 1_024,
            frameCount = 2,
            createdAtEpochMs = 123L,
            enrollmentDurationMs = 4_000,
            consentVersion = 1,
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
        promptAudioCodes = listOf(intArrayOf(1, 2), intArrayOf(3, 4)),
    )

    private fun pocketPayload(): TalosPocketConditioningPayload = TalosPocketConditioningPayload(
        repository = TalosPocketConditioningPayload.REPOSITORY,
        revision = TalosPocketConditioningPayload.REVISION,
        sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
        shape = longArrayOf(1, 1, TalosPocketConditioningPayload.CONDITIONING_DIM.toLong()),
        values = FloatArray(TalosPocketConditioningPayload.CONDITIONING_DIM) { index -> index / 1_024f },
    )
}
