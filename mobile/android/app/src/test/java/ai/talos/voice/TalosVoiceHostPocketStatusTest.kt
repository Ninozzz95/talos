package ai.talos.voice

import java.nio.file.Files
import java.util.concurrent.atomic.AtomicInteger
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test


class TalosVoiceHostPocketStatusTest {
    /*
     * D-V-1 (12/09): la rotta si decide sulla lingua CHIESTA. Un profilo Pocket
     * italiano con richiesta inglese viene rifiutato prima dell'accettazione;
     * la stessa richiesta in italiano, col modello mancante, dice perche'.
     */
    @Test
    fun `POCKET-HOST-ROUTE-01 the requested locale decides the rejection before acceptance`() {
        val root = Files.createTempDirectory("talos-pocket-route").toFile()
        val host = TalosVoiceHost(
            modelRoot = root,
            pocketModelStatusProvider = { TalosPocketModelStatus.Ready(root, 8) },
        )
        try {
            val profile = italianPocketProfile()
            assertNull(host.routeRejectionFor(profile, "it-IT"))
            val english = host.routeRejectionFor(profile, "en-US")
            assertTrue(english.orEmpty(), english.orEmpty().contains("pocketLocaleUnsupported:en-US"))
        } finally {
            host.close()
            root.deleteRecursively()
        }
    }

    @Test
    fun `POCKET-HOST-ROUTE-02 a missing Pocket model is refused before acceptance with its reason`() {
        val root = Files.createTempDirectory("talos-pocket-route").toFile()
        val host = TalosVoiceHost(
            modelRoot = root,
            pocketModelStatusProvider = { TalosPocketModelStatus.Missing("bundle.json") },
        )
        try {
            val reason = host.routeRejectionFor(italianPocketProfile(), "it-IT")
            assertTrue(reason.orEmpty(), reason.orEmpty().contains("pocketModelMissing"))
        } finally {
            host.close()
            root.deleteRecursively()
        }
    }

    private fun italianPocketProfile(): TalosVoiceProfileV2 = TalosVoiceProfileV2(
        header = TalosVoiceProfileHeaderV2(
            schemaVersion = TalosVoiceProfileHeaderV2.SCHEMA_VERSION,
            profileId = "profile-route",
            displayName = "Voce italiana",
            language = "it-IT",
            style = "neutral",
            preferredBackend = TalosPocketConditioningPayload.BACKEND,
            createdAtEpochMs = 1L,
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
                shape = longArrayOf(1, 1, TalosPocketConditioningPayload.CONDITIONING_DIM.toLong()),
                values = FloatArray(TalosPocketConditioningPayload.CONDITIONING_DIM),
            ),
        ),
    )

    @Test
    fun `POCKET-HOST-STATUS-01 cached and forced refresh stay on owner lane and expose measurement`() {
        val root = Files.createTempDirectory("talos-pocket-status").toFile()
        val calls = AtomicInteger(0)
        val host = TalosVoiceHost(
            modelRoot = root,
            pocketModelStatusProvider = {
                when (calls.incrementAndGet()) {
                    1 -> TalosPocketModelStatus.Missing("bundle.json")
                    else -> TalosPocketModelStatus.Ready(root, 8)
                }
            },
        )
        try {
            val first = host.pocketModelStatusBlocking()
            val cached = host.pocketModelStatusBlocking()
            val refreshed = host.pocketModelStatusBlocking(refresh = true)

            assertEquals(2, calls.get())
            assertFalse(first.cacheHit)
            assertTrue(cached.cacheHit)
            assertFalse(refreshed.cacheHit)
            assertTrue(first.status is TalosPocketModelStatus.Missing)
            assertTrue(refreshed.status is TalosPocketModelStatus.Ready)
            assertTrue(first.verificationStartedAtNs > 0L)
            assertTrue(first.verificationDurationNs >= 0L)
            assertEquals("talos-voice-owner", first.verificationThreadName)
            assertEquals(first.verificationStartedAtNs, cached.verificationStartedAtNs)
            assertEquals(first.verificationDurationNs, cached.verificationDurationNs)
        } finally {
            host.close()
            root.deleteRecursively()
        }
    }
}
