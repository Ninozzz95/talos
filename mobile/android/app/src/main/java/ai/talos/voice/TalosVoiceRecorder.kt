package ai.talos.voice

import ai.talos.parola.TalosParola
import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Build
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Blueprint §11.3: enrollment needs fidelity, which is not the same
 * preprocessing wake-word recognition wants. `UNPROCESSED` only if the
 * device actually advertises it - never assumed just because the API
 * constant compiles.
 */
internal fun talosVoiceEnrollmentAudioSource(audioManager: AudioManager): Int {
    val raw = audioManager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true"
    return if (raw) MediaRecorder.AudioSource.UNPROCESSED else MediaRecorder.AudioSource.VOICE_RECOGNITION
}

internal data class TalosVoiceCaptureResult(
    val pcm16Mono: ShortArray,
    /** What the device actually delivered - §11.7 says verify at runtime, never assume the request was honored exactly. */
    val sampleRate: Int,
    val clientSilencedObserved: Boolean,
    val droppedReadCount: Int,
    val cancelled: Boolean,
)

/**
 * Blueprint §11.4-§11.6: privacy-sensitive, wake-word-arbitrated microphone
 * capture for one enrollment phrase. This is the one place in the personal
 * voice engine that touches a live microphone, and it carries one of the
 * five P0 zero-tolerance gates (blueprint §5, `.claude/CONSEGNA-0.1.18-VOCE.md`
 * §5): **0 cases where enrollment leaves the wake-word microphone ceded
 * forever**. `TalosParola.riprendi()` runs in a `finally` around the entire
 * capture, so every return path - success, cancel, silenced-capture abort,
 * `AudioRecord` init failure, any exception - gives the microphone back.
 */
internal class TalosVoiceRecorder(private val context: Context) {

    /**
     * Captures up to [maxDurationMs] of mono PCM16 audio, stopping early if
     * [isCancelled] returns true or the system silences this client
     * (`AudioRecordingConfiguration.isClientSilenced()`, blueprint §11.6 -
     * detected, not guessed: 20 seconds of zeros must never pass as a valid
     * reference sample). The wake-word microphone is ceded for the entire
     * call and always returned, regardless of how the call ends.
     */
    fun capture(maxDurationMs: Int, isCancelled: () -> Boolean = { false }): TalosVoiceCaptureResult {
        TalosParola.cedi()
        try {
            return captureWithMicrophoneAlreadyCeded(maxDurationMs, isCancelled)
        } finally {
            TalosParola.riprendi()
        }
    }

    private fun captureWithMicrophoneAlreadyCeded(maxDurationMs: Int, isCancelled: () -> Boolean): TalosVoiceCaptureResult {
        // Explicit check, not just relying on the manifest declaration: the
        // consent screen (blueprint §11.1) asks for this before enrollment
        // ever reaches here, but a person can still revoke it from Settings
        // between that screen and this call, and AudioRecord.Builder.build()
        // otherwise fails with an opaque SecurityException.
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            error("RECORD_AUDIO permission is not granted - enrollment must not reach TalosVoiceRecorder without it")
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val source = talosVoiceEnrollmentAudioSource(audioManager)
        val minBufferBytes = AudioRecord.getMinBufferSize(TARGET_SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        require(minBufferBytes > 0) { "AudioRecord.getMinBufferSize returned $minBufferBytes for enrollment capture format" }

        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(TARGET_SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        val builder = AudioRecord.Builder()
            .setAudioSource(source)
            .setAudioFormat(format)
            .setBufferSizeInBytes(minBufferBytes * 4)
        if (Build.VERSION.SDK_INT >= 30) {
            builder.setPrivacySensitive(true)
        }
        val record = builder.build()
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            error("AudioRecord failed to initialize for enrollment capture (source=$source)")
        }

        // §11.6's isClientSilenced() needs API 29; minSdk is 26. Below 29 this
        // specific detection is unavailable - blueprint's own wording ("on
        // supported Android versions") anticipates exactly this, not a gap
        // introduced here. §12.2's other hard rejections (near-zero signal,
        // excessive silence) still catch a genuinely silenced capture on
        // those older devices, just later - after decoding, not during it.
        val silenced = AtomicBoolean(false)
        val callback = object : AudioManager.AudioRecordingCallback() {
            override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                if (Build.VERSION.SDK_INT < 29) return
                val mine = configs.firstOrNull { it.clientAudioSessionId == record.audioSessionId } ?: return
                if (mine.isClientSilenced) silenced.set(true)
            }
        }
        val callbackExecutor = Executors.newSingleThreadExecutor()
        record.registerAudioRecordingCallback(callbackExecutor, callback)

        val samples = ArrayList<Short>((TARGET_SAMPLE_RATE.toLong() * maxDurationMs / 1000).toInt().coerceAtLeast(1))
        var droppedReadCount = 0
        var cancelled = false
        try {
            record.startRecording()
            if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                error("AudioRecord.startRecording() did not reach RECORDSTATE_RECORDING")
            }
            val chunk = ShortArray((minBufferBytes / 2).coerceAtLeast(1))
            val deadline = System.currentTimeMillis() + maxDurationMs
            while (System.currentTimeMillis() < deadline) {
                if (isCancelled()) {
                    cancelled = true
                    break
                }
                if (silenced.get()) {
                    break
                }
                val read = record.read(chunk, 0, chunk.size)
                if (read < 0) {
                    droppedReadCount++
                    continue
                }
                for (i in 0 until read) samples.add(chunk[i])
            }
        } finally {
            runCatching { record.stop() }
            record.unregisterAudioRecordingCallback(callback)
            record.release()
            callbackExecutor.shutdown()
        }

        return TalosVoiceCaptureResult(
            pcm16Mono = samples.toShortArray(),
            sampleRate = record.sampleRate,
            clientSilencedObserved = silenced.get(),
            droppedReadCount = droppedReadCount,
            cancelled = cancelled,
        )
    }

    companion object {
        const val TARGET_SAMPLE_RATE = 48000
    }
}
