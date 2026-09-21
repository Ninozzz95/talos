package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Real-upstream gate. It is compiled locally and runs only when the owner authorizes the USB Pad. */
@RunWith(AndroidJUnit4::class)
class TalosVoiceEnrollmentInstrumentedTest {
    private fun diskSnapshot(): Set<String> {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = context.filesDir
        return root.walkTopDown().filter { it.isFile }.map { it.relativeTo(root).path }.toSet()
    }

    @Test
    fun capturingOnePhraseWiresRecorderIntoQualityUsingTheRealMicrophone() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val enrollment = TalosVoiceEnrollment(context)
        val phrase = enrollment.captureOnePhrase(maxDurationMs = 1500)

        assertTrue("capture should return real samples", phrase.capture.pcm16Mono.isNotEmpty())
        assertEquals(phrase.capture.clientSilencedObserved, phrase.verdict.metrics.clientSilencedObserved)
        assertEquals(phrase.capture.droppedReadCount, phrase.verdict.metrics.droppedReadCount)
        val expectedDurationMs = phrase.capture.pcm16Mono.size.toLong() * 1000 / phrase.capture.sampleRate
        assertEquals(expectedDurationMs, phrase.verdict.metrics.durationMs)
    }

    @Test
    fun pocketV2EnrollmentBuildsPreviewsCommitsColdReopensAndLeavesNoRawPcmOnDisk() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val pocketRoot = TalosPocketModelManager.modelRoot(requireNotNull(context.getExternalFilesDir(null)))
        val manifest = TalosPocketModelManifest.fromJson(
            JSONObject(context.assets.open(MANIFEST_ASSET).bufferedReader().use { it.readText() }),
        ).requirePinnedBundle()
        val status = TalosPocketModelManager.validate(pocketRoot, manifest)
        assertTrue("Pocket model must be hash-verified before enrollment: $status", status is TalosPocketModelStatus.Ready)
        val referenceFile = File(pocketRoot, PUBLIC_REFERENCE)
        assertEquals(PUBLIC_REFERENCE_SHA256, sha256(referenceFile))
        val reference = readMonoPcm16Wav(referenceFile)
        val half = reference.samples.size / 2
        require(half > reference.sampleRate / 2) { "public reference is too short for two accepted phrases" }
        val captures = listOf(
            TalosVoiceCaptureResult(reference.samples.copyOfRange(0, half), reference.sampleRate, false, 0, false),
            TalosVoiceCaptureResult(reference.samples.copyOfRange(half, reference.samples.size), reference.sampleRate, false, 0, false),
        )

        var profileId: String? = null
        val beforeDisk = diskSnapshot()
        TalosVoiceHost.resetForTests()
        try {
            val host = TalosVoiceHost.get(context)
            val enrollment = TalosVoiceEnrollment(context)
            val built = host.buildPocketEnrollmentProfileBlocking(
                acceptedPhrases = captures,
                displayName = "Voce Pocket V2 di prova",
                language = "it-IT",
                style = "neutral",
                consentVersion = 1,
            )
            val profile = built.profile
            profileId = profile.header.profileId

            assertEquals(TalosVoiceProfileHeaderV2.SCHEMA_VERSION, profile.header.schemaVersion)
            assertEquals(TalosPocketConditioningPayload.BACKEND, profile.header.preferredBackend)
            assertEquals(null, profile.header.migratedFromSchemaVersion)
            assertEquals(1, profile.backendPayloads.size)
            assertTrue(profile.backendPayloads.single() is TalosPocketConditioningPayload)
            assertTrue(profile.backendPayloads.none { it is TalosMossPromptPayload })
            assertEquals(reference.sampleRate, built.sourceSampleRate)
            assertEquals(reference.samples.size, built.sourceSamples)
            assertTrue(built.referenceSamples <= reference.sampleRate * 12)
            assertTrue(built.stageMetrics.map { it.stage }.containsAll(REQUIRED_BUILD_STAGES))
            assertTrue(built.stageMetrics.all { it.durationNs >= 0L && it.startedAtNs > 0L && it.threadName == "talos-voice-owner" })
            assertEquals(beforeDisk, diskSnapshot())

            val preview = host.speakStreamingWithProfileBlocking(
                text = PREVIEW_TEXT,
                locale = profile.header.language,
                profile = profile,
                maxFrames = 4,
                seed = 19L,
            )
            assertFalse(preview.cancelled)
            assertEquals(TalosPocketConditioningPayload.BACKEND, preview.resolvedEngine)
            assertEquals("it-IT", preview.resolvedLocale)
            assertEquals(profile.header.profileId, preview.resolvedProfileId)
            assertEquals(TalosVoiceProfileHeaderV2.SCHEMA_VERSION, preview.resolvedProfileSchemaVersion)
            assertEquals(null, preview.fallbackReason)
            assertTrue(preview.generatedFrames > 0)

            enrollment.commit(profile)
            assertTrue(enrollment.listProfileIds().contains(profileId))
            val newFiles = diskSnapshot() - beforeDisk
            assertEquals(setOf("voice/profiles/$profileId.tvp"), newFiles)

            TalosVoiceHost.resetForTests()
            val reopenedEnrollment = TalosVoiceEnrollment(context)
            val loaded = reopenedEnrollment.loadProfile(requireNotNull(profileId))
            assertEquals(profile, loaded)
            val reopenedHost = TalosVoiceHost.get(context)
            val coldRead = reopenedHost.speakStreamingWithProfileBlocking(
                text = COLD_TEXT,
                locale = loaded.header.language,
                profile = loaded,
                maxFrames = 4,
                seed = 23L,
            )
            assertFalse(coldRead.cancelled)
            assertEquals(TalosPocketConditioningPayload.BACKEND, coldRead.resolvedEngine)
            assertEquals("it-IT", coldRead.resolvedLocale)
            assertEquals(profileId, coldRead.resolvedProfileId)
            assertEquals(null, coldRead.fallbackReason)

            writeEvidence(
                File(requireNotNull(context.getExternalFilesDir(null)), "research/voice/pocket-v2-enrollment.json"),
                JSONObject()
                    .put("schemaVersion", 1)
                    .put("profileSchemaVersion", profile.header.schemaVersion)
                    .put("backend", profile.header.preferredBackend)
                    .put("sourceSampleRate", built.sourceSampleRate)
                    .put("sourceSamples", built.sourceSamples)
                    .put("referenceSamples", built.referenceSamples)
                    .put("conditioningFrames", built.conditioningFrames)
                    .put("conditioningDimension", built.conditioningDimension)
                    .put("previewResolvedEngine", preview.resolvedEngine)
                    .put("previewResolvedLocale", preview.resolvedLocale)
                    .put("coldReadResolvedEngine", coldRead.resolvedEngine)
                    .put("stages", JSONArray(built.stageMetrics.map { metric ->
                        JSONObject()
                            .put("stage", metric.stage)
                            .put("startedAtNs", metric.startedAtNs)
                            .put("durationNs", metric.durationNs)
                            .put("threadName", metric.threadName)
                            .apply {
                                metric.inputFrames?.let { put("inputFrames", it) }
                                metric.outputSamples?.let { put("outputSamples", it) }
                            }
                    })),
            )

            reopenedEnrollment.deleteProfile(requireNotNull(profileId))
            assertFalse(reopenedEnrollment.listProfileIds().contains(profileId))
            profileId = null
        } finally {
            TalosVoiceHost.resetForTests()
            profileId?.let { TalosVoiceProfileStore(context).delete(it) }
        }
    }

    private data class Wav(val sampleRate: Int, val samples: ShortArray)

    private fun readMonoPcm16Wav(file: File): Wav {
        val bytes = file.readBytes()
        require(bytes.size >= 44 && ascii(bytes, 0, 4) == "RIFF" && ascii(bytes, 8, 4) == "WAVE") {
            "public reference is not RIFF/WAVE"
        }
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        var cursor = 12
        var channels = 0
        var sampleRate = 0
        var bitsPerSample = 0
        var audioFormat = 0
        var dataOffset = -1
        var dataSize = -1
        while (cursor + 8 <= bytes.size) {
            val id = ascii(bytes, cursor, 4)
            val size = buffer.getInt(cursor + 4)
            require(size >= 0 && cursor + 8L + size <= bytes.size.toLong()) { "invalid WAV chunk $id" }
            if (id == "fmt ") {
                require(size >= 16) { "WAV fmt chunk is truncated" }
                audioFormat = buffer.getShort(cursor + 8).toInt() and 0xffff
                channels = buffer.getShort(cursor + 10).toInt() and 0xffff
                sampleRate = buffer.getInt(cursor + 12)
                bitsPerSample = buffer.getShort(cursor + 22).toInt() and 0xffff
            } else if (id == "data") {
                dataOffset = cursor + 8
                dataSize = size
                break
            }
            cursor += 8 + size + (size and 1)
        }
        require(audioFormat == 1 && channels == 1 && bitsPerSample == 16 && sampleRate in 8_000..192_000) {
            "public reference must be mono PCM16"
        }
        require(dataOffset >= 0 && dataSize > 0 && dataSize % 2 == 0) { "WAV data chunk is invalid" }
        return Wav(
            sampleRate = sampleRate,
            samples = ShortArray(dataSize / 2) { index -> buffer.getShort(dataOffset + index * 2) },
        )
    }

    private fun ascii(bytes: ByteArray, offset: Int, length: Int): String =
        bytes.copyOfRange(offset, offset + length).toString(Charsets.US_ASCII)

    private fun sha256(file: File): String {
        require(file.isFile) { "missing Pocket enrollment reference: ${file.absolutePath}" }
        return MessageDigest.getInstance("SHA-256").digest(file.readBytes()).joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    private fun writeEvidence(file: File, value: JSONObject) {
        file.parentFile?.mkdirs()
        val temporary = File(file.parentFile, ".${file.name}.${System.nanoTime()}.tmp")
        temporary.outputStream().buffered().use { output ->
            output.write((value.toString(2) + "\n").toByteArray(Charsets.UTF_8))
        }
        check(temporary.renameTo(file)) { "could not commit Pocket enrollment evidence" }
    }

    private companion object {
        const val MANIFEST_ASSET = "voice/pocket-model-manifest.json"
        const val PUBLIC_REFERENCE = "reference_sample.wav"
        const val PUBLIC_REFERENCE_SHA256 = "88fbb0d31ec26674e97e531a71758cabe4e0e4e5b5a18dafa783021a7f5c9366"
        const val PREVIEW_TEXT = "Questa è l'anteprima italiana della nuova voce TALOS."
        const val COLD_TEXT = "Questa voce è stata riaperta dal profilo cifrato."
        val REQUIRED_BUILD_STAGES = setOf(
            "pocket_model_verify",
            "pocket_runtime_open",
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
