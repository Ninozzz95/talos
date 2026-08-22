package ai.talos.voice

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * `encodeReferenceAudio` (blueprint §15.1's `codecEncodeSession`, enrollment
 * only) has no live human voice to encode in an automated test, so this
 * proves it the way that is actually testable without one: decode a builtin
 * voice's own `prompt_audio_codes` back to real PCM (through the same
 * `TalosMossCodecStream` §16's streaming decode already uses), re-encode
 * that PCM with the new encode session, and use the RESULT as the reference
 * for a fresh synthesis - end to end, through
 * `generateAudioTokensWithReference`, the exact door §7's future enrolled
 * profiles will use. A broken encode path would show up here as garbage
 * codes that make synthesis fail or produce no audio - not as a subtle
 * voice-similarity difference, which is the one thing this test cannot
 * judge without a human ear.
 */
@RunWith(AndroidJUnit4::class)
class TalosMossRuntimeEncodeReferenceInstrumentedTest {

    private fun modelRoot(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        return TalosVoiceModelManager.modelRoot(context.getExternalFilesDir(null)!!)
    }

    @Test
    fun encodedReferenceRoundTripsIntoWorkingSynthesis() {
        val root = modelRoot()
        assumeTrue(TalosVoiceModelManager.describeMissing(root), TalosVoiceModelManager.isPresent(root))

        val manifestPath = TalosMossManifest.resolveManifestPath(root)
        val manifest = TalosMossManifest.fromJson(TalosMossManifest.readJson(manifestPath))
        val builtin = manifest.builtinVoices.firstOrNull { it.promptAudioCodes.isNotEmpty() }
            ?: error("no builtin voice with prompt_audio_codes in the manifest - cannot run this test")

        val runtime = TalosMossRuntime.open(root, cpuThreads = 4)
        try {
            // Step 1: decode the builtin voice's own reference codes to real
            // stereo PCM, through the streaming decoder - the same one Fase 2
            // already proved correct against decode_full.
            val stream = runtime.openCodecStream()
            val decoded = try {
                stream.runFrames(builtin.promptAudioCodes) ?: error("decode of builtin reference produced no audio")
            } finally {
                stream.close()
            }
            assertTrue("decoded reference must have real samples", decoded.samples > 0)

            // Down-mix to mono for encodeReferenceAudio's input contract.
            val channels = runtime.channels
            val mono = FloatArray(decoded.samples) { i ->
                var sum = 0f
                for (c in 0 until channels) sum += decoded.interleavedPcm[i * channels + c]
                sum / channels
            }

            // Step 2: re-encode that PCM - the function under test.
            val reEncoded = runtime.encodeReferenceAudio(mono, runtime.sampleRate)
            assertTrue("re-encoding must produce at least one audio-code frame", reEncoded.isNotEmpty())
            val rowWidth = reEncoded[0].size
            assertTrue("each frame must carry real quantizer codes, got width $rowWidth", rowWidth > 0)
            for (frame in reEncoded) {
                assertEquals("every frame must have the same quantizer count", rowWidth, frame.size)
                for (code in frame) {
                    assertTrue("audio codes must be non-negative indices, got $code", code >= 0)
                }
            }

            // Step 3: the real proof - use the RE-ENCODED reference (not the
            // original manifest codes) to synthesize new speech, through the
            // exact door an enrolled personal profile will use.
            val tokenizerModel = TalosSentencePieceModel.parse(File(root, "MOSS-TTS-Nano-100M-ONNX/tokenizer.model").readBytes())
            val tokenizer = TalosVoiceBpeTokenizer(tokenizerModel)
            val textTokenIds = tokenizer.encode("Ciao, questo e' un test del riferimento vocale codificato di nuovo.")

            val (audioTokens, cancelled) = runtime.generateAudioTokensWithReference(
                textTokenIds = textTokenIds,
                promptAudioCodes = reEncoded,
                maxFrames = 64,
            )
            assertTrue(!cancelled)
            assertTrue("synthesis with the re-encoded reference must produce real frames", audioTokens.size >= 4)

            android.util.Log.i(
                "TalosEncodeReferenceDiag",
                "OK decodedSamples=${decoded.samples} reEncodedFrames=${reEncoded.size} originalFrames=${builtin.promptAudioCodes.size} synthesizedFrames=${audioTokens.size}",
            )
        } finally {
            runtime.close()
        }
    }
}
