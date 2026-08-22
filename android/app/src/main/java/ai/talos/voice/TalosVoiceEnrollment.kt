package ai.talos.voice

import android.content.Context
import java.io.File
import java.util.UUID

/**
 * Blueprint §11.1's flow, the backend half - capture, quality gate,
 * reference assembly, codec encode, preview, commit. The guided multi-phrase
 * wizard itself is Fase 4 (UI); this is what it will call.
 *
 * §6.4 / §7.1's temporary-PCM step does not exist here on purpose, not by
 * omission: [TalosVoiceRecorder.capture] already returns PCM in memory
 * (`ShortArray`), and [TalosMossRuntime.encodeReferenceAudio] takes memory
 * directly too - the whole capture-to-codes pipeline never needs a
 * a `cacheDir/voice-enrollment/` file (glob `.pcm.tmp`) blueprint §7.1
 * describes as a location, because nothing here ever serializes raw audio to
 * disk in the first place. Research before writing this file confirmed why
 * that is the stronger property, not a shortcut: `File.delete()` does not
 * securely erase on Android (recoverable from a physical image until
 * overwritten), and overwrite-before-delete trades flash wear and battery
 * for a guarantee it still cannot make on wear-leveled NAND - blueprint
 * §7.2 itself says not to claim guaranteed physical erasure. Audio that was
 * never written is stronger than audio that was written and then
 * best-effort scrubbed.
 */
internal class TalosVoiceEnrollment(
    private val context: Context,
    private val modelRoot: File,
) {
    private val recorder = TalosVoiceRecorder(context)
    private val store = TalosVoiceProfileStore(context)

    /** Captures one guided phrase and evaluates it - never persisted, never committed. The caller (Fase 4's wizard) decides retry/keep/discard. */
    fun captureOnePhrase(
        maxDurationMs: Int,
        isCancelled: () -> Boolean = { false },
        onLevel: ((Float) -> Unit)? = null,
    ): TalosVoicePhraseCapture {
        val capture = recorder.capture(maxDurationMs, isCancelled, onLevel)
        val verdict = TalosVoiceQuality.evaluate(capture)
        return TalosVoicePhraseCapture(capture, verdict)
    }

    /**
     * Builds a profile in memory from the accepted phrases - concatenated
     * mono PCM, encoded once through the real codec (§15.1's
     * `codecEncodeSession`). Not saved yet: the caller previews with
     * [TalosMossRuntime.generateAudioTokensWithReference] on
     * [TalosVoiceProfileV1.promptAudioCodes] first (§11.1: "preview
     * synthesis -> user accepts -> encrypted profile commit"), then calls
     * [commit] only after a real yes.
     */
    fun buildProfile(
        acceptedPhrases: List<TalosVoiceCaptureResult>,
        displayName: String,
        language: String,
        style: String,
        consentVersion: Int,
        runtime: TalosMossRuntime,
    ): TalosVoiceProfileV1 {
        require(acceptedPhrases.isNotEmpty()) { "cannot build a profile from zero accepted phrases" }
        val sampleRate = acceptedPhrases.first().sampleRate
        require(acceptedPhrases.all { it.sampleRate == sampleRate }) { "all accepted phrases must share one sample rate, got ${acceptedPhrases.map { it.sampleRate }}" }

        val mergedPcm16 = ShortArray(acceptedPhrases.sumOf { it.pcm16Mono.size })
        var offset = 0
        for (phrase in acceptedPhrases) {
            phrase.pcm16Mono.copyInto(mergedPcm16, offset)
            offset += phrase.pcm16Mono.size
        }
        val mergedQuality = TalosVoiceQuality.evaluate(
            TalosVoiceCaptureResult(
                pcm16Mono = mergedPcm16,
                sampleRate = sampleRate,
                clientSilencedObserved = acceptedPhrases.any { it.clientSilencedObserved },
                droppedReadCount = acceptedPhrases.sumOf { it.droppedReadCount },
                cancelled = false,
            ),
        )
        // Defense in depth, not redundant with the caller's per-phrase gate:
        // each accepted phrase passed §12.2 on its own, but concatenation
        // can still push a MERGED property over a threshold no single phrase
        // did (e.g. inter-phrase silence raising zeroFrameRatio) - blueprint
        // §12 says "do not encode every recording simply because AudioRecord
        // returned bytes", and that applies to the assembled reference too.
        require(mergedQuality.accepted) { "merged reference failed quality gate: ${mergedQuality.rejectionReasons}" }

        // short->float via /32768, TalosVoiceQuality's own read-side convention (bit-pattern-preserving,
        // confirmed against the asymmetric Int16 range) - not the /32767 write-side clamp TalosPcmPlayer/TalosMossRuntime use going the other way.
        val mergedMono = FloatArray(mergedPcm16.size) { i -> mergedPcm16[i] / 32768f }

        // ⭐⭐⭐ Owner 22/8, riprodotto due volte sul Pad con dati reali:
        // lowmemorykiller uccide ai.talos con "process memory is leaking"
        // durante encodeReferenceAudio() - crescita continua per tutta la
        // Run(), non un picco al caricamento, il segno di un costo che
        // scala con la lunghezza della sequenza (self-attention di un
        // codec a base transformer è quadratica lì). Il chiamante ora
        // preferisce già solo le frasi 'normale' (§ TalosNeuralVoicePlugin),
        // ma questo è il tetto di sicurezza che vale SEMPRE, anche se
        // arrivasse qui un insieme più grande: la documentazione ufficiale
        // di MOSS-TTS dice "optimal reference clip length is 3-10
        // seconds... clips longer than ~15 seconds may introduce noise
        // artifacts or degrade quality" - un riferimento più corto non è
        // un compromesso sulla qualità, è la scelta giusta anche a
        // memoria infinita.
        val cappedMono = if (mergedMono.size > maxReferenceSamples(sampleRate)) {
            mergedMono.copyOfRange(0, maxReferenceSamples(sampleRate))
        } else {
            mergedMono
        }

        val promptAudioCodes = runtime.encodeReferenceAudio(cappedMono, sampleRate)
        require(promptAudioCodes.isNotEmpty()) { "codec encode produced zero reference frames from ${mergedMono.size} samples" }

        val header = TalosVoiceProfileHeaderV1(
            schemaVersion = 1,
            profileId = UUID.randomUUID().toString(),
            displayName = displayName,
            language = language,
            style = style,
            backend = "moss-tts-nano",
            codecFingerprint = TalosVoiceProfileCompatibility.codecFingerprint(modelRoot),
            promptSchemaFingerprint = TalosVoiceProfileCompatibility.promptSchemaFingerprint(),
            frameRateMilliHz = UNKNOWN_FRAME_RATE_MILLIHZ,
            quantizerCount = promptAudioCodes.first().size,
            codebookSize = CODEBOOK_SIZE_UNKNOWN,
            frameCount = promptAudioCodes.size,
            createdAtEpochMs = System.currentTimeMillis(),
            enrollmentDurationMs = mergedQuality.metrics.durationMs.toInt(),
            consentVersion = consentVersion,
        )

        return TalosVoiceProfileV1(header, mergedQuality.metrics, promptAudioCodes)
    }

    /** Only after the caller has previewed and gotten a real yes - §11.1's last step. */
    fun commit(profile: TalosVoiceProfileV1) {
        store.save(profile)
    }

    fun deleteProfile(profileId: String) = store.delete(profileId)

    fun loadProfile(profileId: String): TalosVoiceProfileV1 = store.load(profileId)

    fun listProfileIds(): List<String> = store.list()

    fun isProfileStillCompatible(profileId: String): Boolean =
        TalosVoiceProfileCompatibility.isCompatible(store.load(profileId).header, modelRoot)

    companion object {
        // Both left as an explicit sentinel rather than a guessed constant -
        // §6.2 warns against hardcoding codec numbers, and neither is
        // load-bearing for synthesis (only quantizerCount/frameCount are,
        // and both come from the real encoded codes, not a guess).
        // TalosMossCodecMeta carries no downsample_rate/codebook_size field
        // today (checked, not assumed) - a future pass should add one there
        // rather than have this class reach past it or guess a number.
        private const val UNKNOWN_FRAME_RATE_MILLIHZ = -1
        private const val CODEBOOK_SIZE_UNKNOWN = -1

        // MOSS-TTS's own model card: "optimal reference clip length is
        // 3-10 seconds... clips longer than ~15 seconds may introduce
        // noise artifacts or degrade quality" - 12s sits inside that
        // window with headroom under the degradation line, not chosen for
        // being a round number.
        private const val MAX_REFERENCE_SECONDS = 12
        private fun maxReferenceSamples(sampleRate: Int): Int = MAX_REFERENCE_SECONDS * sampleRate
    }
}

internal data class TalosVoicePhraseCapture(
    val capture: TalosVoiceCaptureResult,
    val verdict: TalosVoiceQualityVerdict,
)
