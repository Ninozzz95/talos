package ai.talos.voice

import android.content.Context

/**
 * Blueprint §11.1's Android capture/store boundary. Reference assembly,
 * quality recheck and Pocket conditioning are owned by
 * [TalosPocketEnrollmentProfileBuilder] on [TalosVoiceHost]'s owner lane;
 * this class never opens a neural runtime.
 *
 * §6.4 / §7.1's temporary-PCM step does not exist here on purpose, not by
 * omission: [TalosVoiceRecorder.capture] already returns PCM in memory
 * (`ShortArray`), and the Pocket builder takes memory directly too - the
 * whole capture-to-conditioning pipeline never needs a
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

    /** Only after the caller has previewed and gotten a real yes - §11.1's last step. */
    fun commit(profile: TalosVoiceProfileV2) {
        store.save(profile)
    }

    fun deleteProfile(profileId: String) = store.delete(profileId)

    fun loadProfile(profileId: String): TalosVoiceProfileV2 = store.loadV2(profileId)

    fun listProfileIds(): List<String> = store.list()
}

internal data class TalosVoicePhraseCapture(
    val capture: TalosVoiceCaptureResult,
    val verdict: TalosVoiceQualityVerdict,
)
