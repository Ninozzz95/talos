package ai.talos.voice

import ai.talos.voice.pocket.TalosPocketCallback
import ai.talos.voice.pocket.TalosPocketCancellation
import ai.talos.voice.pocket.TalosPocketConditioning
import ai.talos.voice.pocket.TalosPocketSynthesisResult
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class TalosVoiceHostEnrollmentTest {
    @Test
    fun `verified Pocket enrollment runs status open and Mimi encode only on the voice owner lane`() {
        val pocketRoot = Files.createTempDirectory("talos-pocket-enrollment-ready").toFile()
        val statusThread = AtomicReference<String>()
        val factoryThread = AtomicReference<String>()
        val runtime = FakeHostRuntime()
        val host = TalosVoiceHost(
            modelRoot = File(pocketRoot, "unused-moss"),
            pocketModelStatusProvider = {
                statusThread.set(Thread.currentThread().name)
                TalosPocketModelStatus.Ready(pocketRoot, verifiedFiles = 8)
            },
            pocketRuntimeFactory = { root, threads ->
                assertEquals(pocketRoot.canonicalFile, root)
                assertEquals(4, threads)
                factoryThread.set(Thread.currentThread().name)
                runtime
            },
        )
        try {
            val result = host.buildPocketEnrollmentProfileBlocking(
                acceptedPhrases = listOf(capture()),
                displayName = "Antonino",
                language = "it-IT",
                style = "neutral",
                consentVersion = 1,
            )

            assertEquals("talos-voice-owner", statusThread.get())
            assertEquals("talos-voice-owner", factoryThread.get())
            assertEquals("talos-voice-owner", runtime.encodeThread.get())
            assertEquals(TalosPocketConditioningPayload.BACKEND, result.profile.header.preferredBackend)
            assertEquals(1, result.profile.backendPayloads.size)
            assertTrue(result.stageMetrics.map { it.stage }.containsAll(REQUIRED_HOST_STAGES))
            assertTrue(result.stageMetrics.all { it.threadName == "talos-voice-owner" })
        } finally {
            host.close()
        }
        assertEquals(1, runtime.closeCount.get())
    }

    @Test
    fun `missing or unverified Pocket bundle fails before runtime open`() {
        val root = Files.createTempDirectory("talos-pocket-enrollment-missing").toFile()
        for (status in listOf<TalosPocketModelStatus>(
            TalosPocketModelStatus.Missing("mimi_encoder.onnx"),
            TalosPocketModelStatus.Ready(root, verifiedFiles = 0),
        )) {
            val factoryCalls = AtomicInteger(0)
            val host = TalosVoiceHost(
                modelRoot = File(root, "unused-moss"),
                pocketModelStatusProvider = { status },
                pocketRuntimeFactory = { _, _ -> factoryCalls.incrementAndGet(); FakeHostRuntime() },
            )
            try {
                assertThrows(IllegalStateException::class.java) {
                    host.buildPocketEnrollmentProfileBlocking(
                        listOf(capture()),
                        "Antonino",
                        "it-IT",
                        "neutral",
                        1,
                    )
                }
                assertEquals(0, factoryCalls.get())
            } finally {
                host.close()
            }
        }
    }

    @Test
    fun `second enrollment reuses the verified status and one Pocket runtime with explicit cache stages`() {
        val root = Files.createTempDirectory("talos-pocket-enrollment-cache").toFile()
        val statusCalls = AtomicInteger(0)
        val factoryCalls = AtomicInteger(0)
        val runtime = FakeHostRuntime()
        val host = TalosVoiceHost(
            modelRoot = File(root, "unused-moss"),
            pocketModelStatusProvider = {
                statusCalls.incrementAndGet()
                TalosPocketModelStatus.Ready(root, verifiedFiles = 8)
            },
            pocketRuntimeFactory = { _, _ -> factoryCalls.incrementAndGet(); runtime },
        )
        try {
            val first = host.buildPocketEnrollmentProfileBlocking(listOf(capture()), "Uno", "it-IT", "neutral", 1)
            val second = host.buildPocketEnrollmentProfileBlocking(listOf(capture(hz = 330.0)), "Due", "it-IT", "neutral", 1)

            assertEquals(1, statusCalls.get())
            assertEquals(1, factoryCalls.get())
            assertTrue(first.stageMetrics.any { it.stage == "pocket_model_verify" })
            assertTrue(first.stageMetrics.any { it.stage == "pocket_runtime_open" })
            assertTrue(second.stageMetrics.any { it.stage == "pocket_model_status_cache" })
            assertTrue(second.stageMetrics.any { it.stage == "pocket_runtime_reuse" })
        } finally {
            host.close()
        }
    }

    @Test
    fun `cancel at a Pocket graph boundary fails closed and never returns a profile`() {
        val root = Files.createTempDirectory("talos-pocket-enrollment-cancel").toFile()
        val firstBoundary = CountDownLatch(1)
        val releaseEncoder = CountDownLatch(1)
        val finished = CountDownLatch(1)
        val outcome = AtomicReference<Result<TalosVoiceEnrollmentBuildResult>>()
        val runtime = FakeHostRuntime(
            encodeBody = { pcm, callback ->
                callback?.onStage(pocketStage("reference_resample", inputFrames = pcm.size, outputSamples = pcm.size / 2))
                firstBoundary.countDown()
                assertTrue(releaseEncoder.await(5, TimeUnit.SECONDS))
                callback?.onStage(pocketStage("mimi_encoder", inputFrames = null, outputSamples = 4))
                conditioning()
            },
        )
        val host = TalosVoiceHost(
            modelRoot = File(root, "unused-moss"),
            pocketModelStatusProvider = { TalosPocketModelStatus.Ready(root, verifiedFiles = 8) },
            pocketRuntimeFactory = { _, _ -> runtime },
        )
        try {
            host.submitBuildPocketEnrollmentProfile(
                acceptedPhrases = listOf(capture()),
                displayName = "Antonino",
                language = "it-IT",
                style = "neutral",
                consentVersion = 1,
            ) { result ->
                outcome.set(result)
                finished.countDown()
            }
            assertTrue(firstBoundary.await(5, TimeUnit.SECONDS))
            host.cancel()
            releaseEncoder.countDown()
            assertTrue(finished.await(5, TimeUnit.SECONDS))

            assertTrue(outcome.get().isFailure)
            assertTrue(outcome.get().exceptionOrNull() is TalosVoiceEnrollmentCancelledException)
            assertFalse(outcome.get().isSuccess)
        } finally {
            releaseEncoder.countDown()
            host.close()
        }
    }

    private class FakeHostRuntime(
        private val encodeBody: (FloatArray, TalosPocketCallback?) -> TalosPocketConditioning = { _, callback ->
            callback?.onStage(pocketStage("reference_resample", inputFrames = SAMPLE_RATE, outputSamples = SAMPLE_RATE / 2))
            callback?.onStage(pocketStage("mimi_encoder", inputFrames = null, outputSamples = 4))
            conditioning()
        },
    ) : TalosPocketHostRuntimeContract {
        val encodeThread = AtomicReference<String>()
        val closeCount = AtomicInteger(0)

        override fun encodeReference(
            pcmFloatMono: FloatArray,
            sampleRate: Int,
            callback: TalosPocketCallback?,
        ): TalosPocketConditioning {
            assertEquals(SAMPLE_RATE, sampleRate)
            encodeThread.set(Thread.currentThread().name)
            return encodeBody(pcmFloatMono, callback)
        }

        override fun synthesize(
            source: String,
            conditioning: TalosPocketConditioning,
            maxFramesPerSentence: Int?,
            seed: Long,
            cancellation: TalosPocketCancellation,
            callback: TalosPocketCallback,
        ): TalosPocketSynthesisResult = error("synthesis is not part of an enrollment build")

        override fun close() {
            closeCount.incrementAndGet()
        }
    }

    private fun capture(hz: Double = 220.0): TalosVoiceCaptureResult {
        val pcm = ShortArray(SAMPLE_RATE) { index ->
            (sin(2.0 * Math.PI * hz * index / SAMPLE_RATE) * 0.3 * Short.MAX_VALUE).toInt().toShort()
        }
        return TalosVoiceCaptureResult(pcm, SAMPLE_RATE, false, 0, false)
    }

    private companion object {
        const val SAMPLE_RATE = 48_000
        val REQUIRED_HOST_STAGES = setOf(
            "pocket_model_verify",
            "pocket_runtime_open",
            "enrollment_reference_assemble",
            "enrollment_quality_gate",
            "enrollment_pcm_convert",
            "reference_resample",
            "mimi_encoder",
            "pocket_reference_encode",
            "enrollment_pcm_zeroed",
        )

        fun conditioning(): TalosPocketConditioning = TalosPocketConditioning.create(
            longArrayOf(1, 4, 1_024),
            FloatArray(4 * 1_024) { it / 10_000f },
        )

        fun pocketStage(stage: String, inputFrames: Int?, outputSamples: Int?) =
            ai.talos.voice.pocket.TalosPocketStageMetric(
                runIndex = 1,
                stage = stage,
                startedAtNs = System.nanoTime(),
                durationNs = 1,
                threadName = Thread.currentThread().name,
                inputFrames = inputFrames,
                outputSamples = outputSamples,
            )
    }
}
