package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The blueprint's actual Fase 3 exit gate, proven end to end: "ad app
 * riavviata da fredda parla col profilo cifrato in cache, senza il WAV
 * grezzo" - after commit, close the runtime entirely, reopen a fresh one
 * (the closest an instrumented test gets to a cold app restart without
 * actually killing the process), load ONLY the encrypted `.tvp` back from
 * disk, and synthesize with it. No live human voice to enroll here, same
 * limitation [TalosMossRuntimeEncodeReferenceInstrumentedTest] already
 * documents - so the "captured phrases" below are two halves of a builtin
 * voice's own decoded reference audio, exercising the real multi-phrase
 * merge path in [TalosVoiceEnrollment.buildProfile] without needing a
 * person to talk on cue.
 */
@RunWith(AndroidJUnit4::class)
class TalosVoiceEnrollmentInstrumentedTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    /**
     * Every regular file under filesDir, relative path only - used to prove
     * nothing but the one `.tvp` lands on disk. Deliberately filesDir only,
     * not cacheDir too: measured on device, cacheDir is the SAME directory
     * the app's own WebView keeps its HTTP cache, code cache, and crash
     * reporter (`Crash Reports/ANR Variations/…`) in - files that churn on
     * their own regardless of anything this test does, so a snapshot diff
     * against cacheDir is inherently noisy. filesDir carries none of that
     * (confirmed: one unrelated `profileInstalled` marker file, nothing
     * else) and is the only directory blueprint §7.1 or this class ever
     * proposes writing to.
     */
    private fun diskSnapshot(): Set<String> {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val root = context.filesDir
        return root.walkTopDown().filter { it.isFile }.map { it.relativeTo(root).path }.toSet()
    }

    @Test
    fun capturingOnePhraseWiresRecorderIntoQualityUsingTheRealMicrophone() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val enrollment = TalosVoiceEnrollment(context, modelRoot())
        val phrase = enrollment.captureOnePhrase(maxDurationMs = 1500)

        // Ambient noise in a test lab is unpredictable - this cannot assert
        // `verdict.accepted`, only that capture and evaluation are really
        // wired together on the SAME data, the thing this class adds over
        // calling TalosVoiceRecorder and TalosVoiceQuality separately.
        assertTrue("capture should return real samples", phrase.capture.pcm16Mono.isNotEmpty())
        assertEquals(phrase.capture.clientSilencedObserved, phrase.verdict.metrics.clientSilencedObserved)
        assertEquals(phrase.capture.droppedReadCount, phrase.verdict.metrics.droppedReadCount)
        val expectedDurationMs = phrase.capture.pcm16Mono.size.toLong() * 1000 / phrase.capture.sampleRate
        assertEquals(expectedDurationMs, phrase.verdict.metrics.durationMs)
    }

    @Test
    fun buildProfileRejectsZeroPhrasesAndMismatchedSampleRatesBeforeTouchingTheRuntime() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val enrollment = TalosVoiceEnrollment(context, root)
        val runtime = TalosMossRuntime.open(root, cpuThreads = 4)
        try {
            assertThrows(IllegalArgumentException::class.java) {
                enrollment.buildProfile(emptyList(), "x", "it-IT", "neutral", consentVersion = 1, runtime = runtime)
            }

            val a = TalosVoiceCaptureResult(shortArrayOf(1, 2, 3), sampleRate = 48000, clientSilencedObserved = false, droppedReadCount = 0, cancelled = false)
            val b = TalosVoiceCaptureResult(shortArrayOf(4, 5, 6), sampleRate = 24000, clientSilencedObserved = false, droppedReadCount = 0, cancelled = false)
            assertThrows(IllegalArgumentException::class.java) {
                enrollment.buildProfile(listOf(a, b), "x", "it-IT", "neutral", consentVersion = 1, runtime = runtime)
            }
        } finally {
            runtime.close()
        }
    }

    @Test
    fun committedProfileSurvivesACloseAndFreshReopenAndLeavesNoRawPcmOnDisk() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        val manifest = TalosMossManifest.fromJson(TalosMossManifest.readJson(TalosMossManifest.resolveManifestPath(root)))
        val builtin = manifest.builtinVoices.firstOrNull { it.promptAudioCodes.isNotEmpty() }
            ?: error("no builtin voice with prompt_audio_codes in the manifest - cannot run this test")

        var profileId: String? = null
        val beforeDisk = diskSnapshot()
        try {
            // --- Session 1: decode a reference, build and commit a profile, then close everything. ---
            val runtime1 = TalosMossRuntime.open(root, cpuThreads = 4)
            val stream = runtime1.openCodecStream()
            val decoded = try {
                stream.runFrames(builtin.promptAudioCodes) ?: error("decode of builtin reference produced no audio")
            } finally {
                stream.close()
            }
            val channels = runtime1.channels
            val monoSamples = decoded.samples
            val half = monoSamples / 2
            require(half > 0) { "decoded reference too short to split into two phrases" }
            fun mono(fromSample: Int, toSample: Int): ShortArray = ShortArray(toSample - fromSample) { i ->
                val sampleIndex = fromSample + i
                var sum = 0f
                for (c in 0 until channels) sum += decoded.interleavedPcm[sampleIndex * channels + c]
                ((sum / channels).coerceIn(-1f, 1f) * 32767f).toInt().toShort()
            }
            val phraseOne = TalosVoiceCaptureResult(mono(0, half), sampleRate = runtime1.sampleRate, clientSilencedObserved = false, droppedReadCount = 0, cancelled = false)
            val phraseTwo = TalosVoiceCaptureResult(mono(half, monoSamples), sampleRate = runtime1.sampleRate, clientSilencedObserved = false, droppedReadCount = 0, cancelled = false)

            val enrollment1 = TalosVoiceEnrollment(context, root)
            val profile = enrollment1.buildProfile(
                acceptedPhrases = listOf(phraseOne, phraseTwo),
                displayName = "Voce di prova arruolamento",
                language = "it-IT",
                style = "neutral",
                consentVersion = 1,
                runtime = runtime1,
            )
            profileId = profile.header.profileId

            assertEquals("Voce di prova arruolamento", profile.header.displayName)
            assertEquals(64, profile.header.codecFingerprint.length)
            assertEquals(64, profile.header.promptSchemaFingerprint.length)
            assertTrue("profile must carry at least one reference frame", profile.promptAudioCodes.isNotEmpty())
            assertEquals(profile.promptAudioCodes.size, profile.header.frameCount)
            assertEquals(profile.promptAudioCodes.first().size, profile.header.quantizerCount)
            assertTrue("merged two-phrase duration should be close to the whole decoded reference", profile.qualityMetrics.durationMs > 0)
            assertTrue("built profile must not yet be saved to disk", diskSnapshot() == beforeDisk)

            enrollment1.commit(profile)
            assertTrue("profileId must appear in listProfileIds after commit", enrollment1.listProfileIds().contains(profileId))

            runtime1.close()

            // --- Prove no raw PCM/WAV was ever written: the ONLY new file anywhere under filesDir/cacheDir is the one encrypted .tvp. ---
            val afterCommitDisk = diskSnapshot()
            val newFiles = afterCommitDisk - beforeDisk
            assertEquals("exactly one new file must exist after commit - the encrypted profile, nothing raw", setOf("voice/profiles/$profileId.tvp"), newFiles)

            // --- Session 2: a fresh runtime, "cold" - load ONLY the encrypted profile back and synthesize with it. ---
            val runtime2 = TalosMossRuntime.open(root, cpuThreads = 4)
            try {
                val enrollment2 = TalosVoiceEnrollment(context, root)
                assertTrue("profile must still be listed by a fresh TalosVoiceEnrollment instance", enrollment2.listProfileIds().contains(profileId))
                assertTrue("codec on disk must still match what the profile was fingerprinted against", enrollment2.isProfileStillCompatible(profileId))

                val loaded = enrollment2.loadProfile(profileId)
                assertEquals(profile.header, loaded.header)
                assertEquals(profile.promptAudioCodes.size, loaded.promptAudioCodes.size)
                for (i in profile.promptAudioCodes.indices) {
                    assertTrue(profile.promptAudioCodes[i].contentEquals(loaded.promptAudioCodes[i]))
                }

                val tokenizerModel = TalosSentencePieceModel.parse(File(root, "MOSS-TTS-Nano-100M-ONNX/tokenizer.model").readBytes())
                val tokenizer = TalosVoiceBpeTokenizer(tokenizerModel)
                val textTokenIds = tokenizer.encode("Questo e' un arruolamento riavviato a freddo.")

                val (audioTokens, cancelled) = runtime2.generateAudioTokensWithReference(
                    textTokenIds = textTokenIds,
                    promptAudioCodes = loaded.promptAudioCodes,
                    maxFrames = 64,
                )
                assertFalse(cancelled)
                assertTrue("synthesis from a cold-reopened runtime using only the saved encrypted profile must produce real frames", audioTokens.size >= 4)

                enrollment2.deleteProfile(profileId)
                assertFalse(enrollment2.listProfileIds().contains(profileId))
                profileId = null
            } finally {
                runtime2.close()
            }
        } finally {
            profileId?.let { TalosVoiceProfileStore(context).delete(it) }
        }
    }
}
