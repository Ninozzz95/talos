package ai.talos.voice

import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosPocketEnrollmentProfileBuilderTest {
    private val createdPcm16 = mutableListOf<ShortArray>()
    private val createdPcmFloat = mutableListOf<FloatArray>()

    private fun builder(
        encoder: TalosPocketEnrollmentReferenceEncoder,
        profileId: String = PROFILE_ID,
        createdAtEpochMs: Long = CREATED_AT_MS,
    ) = TalosPocketEnrollmentProfileBuilder(
        encoder = encoder,
        profileIdFactory = { profileId },
        currentTimeMillis = { createdAtEpochMs },
        pcm16Factory = { size -> ShortArray(size).also(createdPcm16::add) },
        pcmFloatFactory = { size -> FloatArray(size).also(createdPcmFloat::add) },
    )

    @Test
    fun `builds a Pocket only V2 profile from capped accepted PCM and reports every measured stage`() {
        val first = capture(seconds = 8.0, hz = 220.0)
        val second = capture(seconds = 8.0, hz = 330.0)
        val sourceSnapshots = listOf(first.pcm16Mono.copyOf(), second.pcm16Mono.copyOf())
        var encodedSnapshot = FloatArray(0)
        val result = builder(
            TalosPocketEnrollmentReferenceEncoder { pcm, sampleRate, onStage ->
                assertEquals(SAMPLE_RATE, sampleRate)
                encodedSnapshot = pcm.copyOf()
                onStage(stage("reference_resample", inputFrames = pcm.size, outputSamples = pcm.size / 2))
                onStage(stage("mimi_encoder", inputFrames = null, outputSamples = CONDITIONING_FRAMES))
                pocketPayload(CONDITIONING_FRAMES)
            },
        ).build(
            acceptedPhrases = listOf(first, second),
            displayName = "Antonino",
            language = "it-IT",
            style = "neutral",
            consentVersion = 1,
        )

        assertEquals(SAMPLE_RATE * 16, result.sourceSamples)
        assertEquals(SAMPLE_RATE * 12, result.referenceSamples)
        assertEquals(SAMPLE_RATE, result.sourceSampleRate)
        assertEquals(16_000, result.profile.header.enrollmentDurationMs)
        assertEquals(TalosVoiceProfileHeaderV2.SCHEMA_VERSION, result.profile.header.schemaVersion)
        assertEquals(PROFILE_ID, result.profile.header.profileId)
        assertEquals(CREATED_AT_MS, result.profile.header.createdAtEpochMs)
        assertEquals(TalosPocketConditioningPayload.BACKEND, result.profile.header.preferredBackend)
        assertEquals(null, result.profile.header.migratedFromSchemaVersion)
        assertEquals(1, result.profile.backendPayloads.size)
        assertEquals(CONDITIONING_FRAMES.toLong(), result.profile.pocketPayload().shape[1])
        assertTrue(result.profile.backendPayloads.none { it is TalosMossPromptPayload })
        assertEquals(SAMPLE_RATE * 12, encodedSnapshot.size)
        assertTrue("the encoder must receive real non-zero PCM", encodedSnapshot.any { it != 0f })
        assertEquals(REQUIRED_STAGES, result.stageMetrics.mapTo(linkedSetOf(), TalosVoiceEnrollmentStageMetric::stage))
        assertTrue(result.stageMetrics.all { it.startedAtNs > 0L && it.durationNs >= 0L && it.threadName.isNotBlank() })
        assertOwnedBuffersAreZero()
        assertTrue(first.pcm16Mono.contentEquals(sourceSnapshots[0]))
        assertTrue(second.pcm16Mono.contentEquals(sourceSnapshots[1]))
    }

    @Test
    fun `zero phrases fail before allocating or encoding`() {
        var encoded = false
        val subject = builder(TalosPocketEnrollmentReferenceEncoder { _, _, _ -> encoded = true; pocketPayload(1) })

        assertThrows(IllegalArgumentException::class.java) {
            subject.build(emptyList(), "Antonino", "it-IT", "neutral", 1)
        }

        assertFalse(encoded)
        assertTrue(createdPcm16.isEmpty())
        assertTrue(createdPcmFloat.isEmpty())
    }

    @Test
    fun `mixed sample rates fail before encoding`() {
        var encoded = false
        val subject = builder(TalosPocketEnrollmentReferenceEncoder { _, _, _ -> encoded = true; pocketPayload(1) })

        assertThrows(IllegalArgumentException::class.java) {
            subject.build(
                listOf(capture(1.0, sampleRate = 48_000), capture(1.0, sampleRate = 24_000)),
                "Antonino",
                "it-IT",
                "neutral",
                1,
            )
        }

        assertFalse(encoded)
        assertTrue(createdPcm16.isEmpty())
        assertTrue(createdPcmFloat.isEmpty())
    }

    @Test
    fun `non Italian locale fails before encoding`() {
        var encoded = false
        val subject = builder(TalosPocketEnrollmentReferenceEncoder { _, _, _ -> encoded = true; pocketPayload(1) })

        assertThrows(IllegalArgumentException::class.java) {
            subject.build(listOf(capture(1.0)), "Antonino", "en-US", "neutral", 1)
        }

        assertFalse(encoded)
        assertTrue(createdPcm16.isEmpty())
        assertTrue(createdPcmFloat.isEmpty())
    }

    @Test
    fun `merged quality rejection zeroes assembled PCM and never encodes`() {
        var encoded = false
        val rejected = TalosVoiceCaptureResult(
            pcm16Mono = ShortArray(SAMPLE_RATE) { if (it % 2 == 0) Short.MAX_VALUE else Short.MIN_VALUE },
            sampleRate = SAMPLE_RATE,
            clientSilencedObserved = false,
            droppedReadCount = 0,
            cancelled = false,
        )
        val sourceSnapshot = rejected.pcm16Mono.copyOf()
        val subject = builder(TalosPocketEnrollmentReferenceEncoder { _, _, _ -> encoded = true; pocketPayload(1) })

        assertThrows(IllegalArgumentException::class.java) {
            subject.build(listOf(rejected), "Antonino", "it-IT", "neutral", 1)
        }

        assertFalse(encoded)
        assertEquals(1, createdPcm16.size)
        assertTrue(createdPcmFloat.isEmpty())
        assertOwnedBuffersAreZero()
        assertTrue(rejected.pcm16Mono.contentEquals(sourceSnapshot))
    }

    @Test
    fun `encoder failure zeroes every owned PCM buffer and preserves source captures`() {
        val source = capture(1.0)
        val sourceSnapshot = source.pcm16Mono.copyOf()
        var encoderInput: FloatArray? = null
        val subject = builder(
            TalosPocketEnrollmentReferenceEncoder { pcm, _, _ ->
                encoderInput = pcm
                throw IllegalStateException("mimi encoder failed")
            },
        )

        val failure = assertThrows(IllegalStateException::class.java) {
            subject.build(listOf(source), "Antonino", "it-IT", "neutral", 1)
        }

        assertEquals("mimi encoder failed", failure.message)
        assertTrue(encoderInput === createdPcmFloat.single())
        assertOwnedBuffersAreZero()
        assertTrue(source.pcm16Mono.contentEquals(sourceSnapshot))
    }

    @Test
    fun `cancellation after conversion zeroes every owned PCM buffer and never encodes`() {
        var cancelled = false
        var encoded = false
        val observedStages = mutableListOf<String>()
        val subject = builder(TalosPocketEnrollmentReferenceEncoder { _, _, _ -> encoded = true; pocketPayload(1) })

        assertThrows(TalosVoiceEnrollmentCancelledException::class.java) {
            subject.build(
                acceptedPhrases = listOf(capture(1.0)),
                displayName = "Antonino",
                language = "it-IT",
                style = "neutral",
                consentVersion = 1,
                cancellation = TalosVoiceEnrollmentCancellation { cancelled },
                onStage = { metric ->
                    observedStages += metric.stage
                    if (metric.stage == "enrollment_pcm_convert") cancelled = true
                },
            )
        }

        assertFalse(encoded)
        assertTrue("conversion stage must be observed before cancellation", "enrollment_pcm_convert" in observedStages)
        assertOwnedBuffersAreZero()
    }

    @Test
    fun `invalid post encode metadata still zeroes every owned PCM buffer`() {
        val subject = builder(
            encoder = TalosPocketEnrollmentReferenceEncoder { _, _, _ -> pocketPayload(1) },
            profileId = "",
        )

        assertThrows(IllegalArgumentException::class.java) {
            subject.build(listOf(capture(1.0)), "Antonino", "it-IT", "neutral", 1)
        }

        assertOwnedBuffersAreZero()
    }

    private fun assertOwnedBuffersAreZero() {
        assertTrue("every owned PCM16 buffer must be zeroed", createdPcm16.all { values -> values.all { it == 0.toShort() } })
        assertTrue("every owned float PCM buffer must be zeroed", createdPcmFloat.all { values -> values.all { it == 0f } })
    }

    private fun capture(
        seconds: Double,
        hz: Double = 220.0,
        sampleRate: Int = SAMPLE_RATE,
    ): TalosVoiceCaptureResult {
        val samples = ShortArray((seconds * sampleRate).toInt()) { index ->
            (sin(2.0 * Math.PI * hz * index / sampleRate) * 0.3 * Short.MAX_VALUE).toInt().toShort()
        }
        return TalosVoiceCaptureResult(samples, sampleRate, false, 0, false)
    }

    private fun pocketPayload(frames: Int) = TalosPocketConditioningPayload(
        repository = TalosPocketConditioningPayload.REPOSITORY,
        revision = TalosPocketConditioningPayload.REVISION,
        sampleRate = TalosPocketConditioningPayload.SAMPLE_RATE,
        shape = longArrayOf(1, frames.toLong(), TalosPocketConditioningPayload.CONDITIONING_DIM.toLong()),
        values = FloatArray(frames * TalosPocketConditioningPayload.CONDITIONING_DIM) { index -> index / 10_000f },
    )

    private fun stage(stage: String, inputFrames: Int?, outputSamples: Int?) = TalosVoiceEnrollmentStageMetric(
        stage = stage,
        startedAtNs = System.nanoTime(),
        durationNs = 1L,
        threadName = Thread.currentThread().name,
        inputFrames = inputFrames,
        outputSamples = outputSamples,
    )

    private companion object {
        const val SAMPLE_RATE = 48_000
        const val CONDITIONING_FRAMES = 6
        const val PROFILE_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde"
        const val CREATED_AT_MS = 1_777_777_777_000L
        val REQUIRED_STAGES = linkedSetOf(
            "enrollment_reference_assemble",
            "enrollment_quality_gate",
            "enrollment_pcm_convert",
            "pocket_reference_encode",
            "reference_resample",
            "mimi_encoder",
            "enrollment_pcm_zeroed",
        )
    }
}
