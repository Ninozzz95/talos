package ai.talos.voice

import android.Manifest
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Blueprint §41's `TalosNeuralVoicePlugin` skeleton, grown to the real
 * method set Fase 4 needs: playback (`status`/`profiles`/`speak`/`stop`,
 * §41's own shape) plus enrollment (§42's recorder, §11.1's guided flow),
 * both routed through the Fase 1-3 native classes this same session already
 * built and device-verified - `TalosVoiceHost`, `TalosVoiceEnrollment`.
 *
 * ⛔ No PCM, no audio codes, no ONNX tensors ever cross this bridge as a
 * plugin call result - the same rule `TalosVoiceHost`/`TalosMossRuntime`
 * already enforce natively. Captured phrases during enrollment live in
 * [enrollmentSlots], native memory only, keyed by the slot index the wizard
 * is showing; a not-yet-committed built profile lives in [pendingProfile].
 * Nothing here ever writes raw audio to a file, for the same reason
 * `TalosVoiceEnrollment`'s own class doc gives.
 */
@CapacitorPlugin(
    name = "TalosNeuralVoice",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microfono")],
)
class TalosNeuralVoicePlugin : Plugin() {

    /**
     * One lane for every enrollment-session call, independent of whatever
     * thread Capacitor itself runs `@PluginMethod`s on. Not a performance
     * choice - `TalosVoiceRecorder.capture()` cedes the wake-word microphone
     * for its whole duration (`TalosParola.cedi/riprendi`), and two
     * concurrent captures (a double-tap on "record") would race for it.
     * Serializing here is the same discipline [TalosVoiceHost]'s own owner
     * executor already applies to generation.
     */
    private val enrollmentLane = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "talos-voice-enrollment").apply { priority = Thread.NORM_PRIORITY }
    }

    private val captureCancelled = AtomicBoolean(false)
    private val enrollmentSlots = ConcurrentHashMap<Int, TalosVoiceCaptureResult>()
    @Volatile private var pendingProfile: TalosVoiceProfileV1? = null

    private val host: TalosVoiceHost
        get() = TalosVoiceHost.get(context.applicationContext)

    private fun modelRoot(): File =
        TalosVoiceModelManager.modelRoot(context.applicationContext.getExternalFilesDir(null)!!)

    private fun enrollment(): TalosVoiceEnrollment = TalosVoiceEnrollment(context.applicationContext, modelRoot())

    // ---------------------------------------------------------------
    // Status / profiles / playback - §41's shape.
    // ---------------------------------------------------------------

    /**
     * `active` is deliberately absent here: this class has no knowledge of
     * `settings.voice.engine` (that lives in the TS store), so it cannot
     * honestly say whether personal voice is the one currently selected -
     * only whether it COULD be. The TS-side router (Fase 4 block 3) merges
     * this with settings state to produce the full
     * `TalosPersonalVoiceStatus`.
     */
    @PluginMethod
    fun status(call: PluginCall) {
        val root = modelRoot()
        val supported = TalosVoiceModelManager.isPresent(root)
        val payload = JSObject()
            .put("supported", supported)
            .put("installed", supported)
        if (!supported) payload.put("failure", TalosVoiceModelManager.describeMissing(root))
        call.resolve(payload)
    }

    @PluginMethod
    fun profiles(call: PluginCall) {
        val enrollment = enrollment()
        val array = JSArray()
        for (id in enrollment.listProfileIds()) {
            runCatching { enrollment.loadProfile(id) }.getOrNull()?.let { profile ->
                array.put(profileSummaryJson(enrollment, profile.header))
            }
        }
        call.resolve(JSObject().put("profiles", array))
    }

    @PluginMethod
    fun renameProfile(call: PluginCall) {
        val profileId = call.getString("profileId")
        val name = call.getString("name")?.trim()
        if (profileId.isNullOrBlank() || name.isNullOrBlank()) {
            call.reject("profileId and name are required")
            return
        }
        enrollmentLane.execute {
            runCatching {
                val store = TalosVoiceProfileStore(context.applicationContext)
                store.rename(profileId, name)
            }.fold(
                onSuccess = { call.resolve() },
                onFailure = { call.reject(it.message ?: "rename failed", it as? Exception) },
            )
        }
    }

    @PluginMethod
    fun deleteProfile(call: PluginCall) {
        val profileId = call.getString("profileId")
        if (profileId.isNullOrBlank()) {
            call.reject("profileId is required")
            return
        }
        enrollmentLane.execute {
            runCatching { enrollment().deleteProfile(profileId) }.fold(
                onSuccess = { call.resolve() },
                onFailure = { call.reject(it.message ?: "delete failed", it as? Exception) },
            )
        }
    }

    /** `accepted` mirrors §41's skeleton: this resolves once the request is enqueued on [TalosVoiceHost]'s owner lane, not once speech is done - completion arrives as `talosNeuralVoiceDone`/`talosNeuralVoiceError`, the same split `TalosSpeechPlugin` already uses for the system engine. */
    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text")?.trim().orEmpty()
        val profileId = call.getString("profileId")
        val readingId = call.getString("readingId")
        if (text.isEmpty() || profileId.isNullOrBlank() || readingId.isNullOrBlank()) {
            call.reject("text, profileId and readingId are required")
            return
        }
        val rate = call.getFloat("rate") ?: 1f
        val pitch = call.getFloat("pitch") ?: 1f

        val profile = runCatching { enrollment().loadProfile(profileId) }.getOrNull()
        if (profile == null) {
            call.resolve(JSObject().put("accepted", false).put("reason", "profileNotFound"))
            return
        }

        // rate/pitch are accepted for contract parity with §40 but not yet wired
        // into TalosMossRuntime - there is no post-synthesis resampling/pitch
        // path on the native side today. Declaring that here rather than
        // silently ignoring the caller's values.
        val ratePitchApplied = rate == 1f && pitch == 1f

        host.submitSpeakStreamingWithReference(text, profile.promptAudioCodes) { result ->
            val payload = result.fold(
                onSuccess = { r ->
                    JSObject()
                        .put("readingId", readingId)
                        .put("cancelled", r.cancelled)
                        .put("hardwareUnderruns", r.hardwareUnderruns)
                        .put("elapsedMs", r.elapsedMs)
                },
                onFailure = { e ->
                    JSObject().put("readingId", readingId).put("error", e.message ?: "synthesis failed")
                },
            )
            notifyListeners(if (result.isSuccess) "talosNeuralVoiceDone" else "talosNeuralVoiceError", payload)
        }
        call.resolve(JSObject().put("accepted", true).put("ratePitchApplied", ratePitchApplied))
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        host.cancel()
        call.resolve()
    }

    // ---------------------------------------------------------------
    // Enrollment - §11.1's guided flow, §42's recorder.
    // ---------------------------------------------------------------

    @PluginMethod
    fun startEnrollmentSession(call: PluginCall) {
        enrollmentSlots.clear()
        pendingProfile = null
        captureCancelled.set(false)
        call.resolve()
    }

    /** Cancels whatever `captureEnrollmentPhrase` call is in flight right now - checked by [TalosVoiceRecorder] on every read loop iteration, same mechanism [TalosVoiceHost.cancel] already relies on for generation. */
    @PluginMethod
    fun stopEnrollmentCapture(call: PluginCall) {
        captureCancelled.set(true)
        call.resolve()
    }

    @PluginMethod
    fun captureEnrollmentPhrase(call: PluginCall) {
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "afterMicPermissionForCapture")
            return
        }
        runCaptureEnrollmentPhrase(call)
    }

    @PermissionCallback
    private fun afterMicPermissionForCapture(call: PluginCall) {
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            call.reject("RECORD_AUDIO permission denied")
            return
        }
        runCaptureEnrollmentPhrase(call)
    }

    private fun runCaptureEnrollmentPhrase(call: PluginCall) {
        val slotIndex = call.getInt("slotIndex")
        val maxDurationMs = call.getInt("maxDurationMs") ?: DEFAULT_PHRASE_MAX_DURATION_MS
        if (slotIndex == null) {
            call.reject("slotIndex is required")
            return
        }
        captureCancelled.set(false)
        enrollmentLane.execute {
            runCatching {
                val phrase = enrollment().captureOnePhrase(maxDurationMs) { captureCancelled.get() }
                if (phrase.verdict.accepted) enrollmentSlots[slotIndex] = phrase.capture
                phrase
            }.fold(
                onSuccess = { phrase -> call.resolve(phraseVerdictJson(phrase)) },
                onFailure = { e -> call.reject(e.message ?: "capture failed", e as? Exception) },
            )
        }
    }

    @PluginMethod
    fun buildEnrollmentProfile(call: PluginCall) {
        val displayName = call.getString("displayName")?.trim()
        val language = call.getString("language")?.trim()
        val style = call.getString("style")?.trim() ?: "neutral"
        val consentVersion = call.getInt("consentVersion")
        if (displayName.isNullOrBlank() || language.isNullOrBlank() || consentVersion == null) {
            call.reject("displayName, language and consentVersion are required")
            return
        }
        val accepted = enrollmentSlots.values.toList()
        if (accepted.isEmpty()) {
            call.reject("no accepted phrases in this session")
            return
        }
        enrollmentLane.execute {
            val outcome = runCatching {
                val runtime = TalosMossRuntime.open(modelRoot(), cpuThreads = 4)
                try {
                    enrollment().buildProfile(accepted, displayName, language, style, consentVersion, runtime)
                } finally {
                    runtime.close()
                }
            }
            outcome.fold(
                onSuccess = { profile ->
                    pendingProfile = profile
                    call.resolve(
                        JSObject()
                            .put("frameCount", profile.header.frameCount)
                            .put("quantizerCount", profile.header.quantizerCount)
                            .put("enrollmentDurationMs", profile.header.enrollmentDurationMs),
                    )
                },
                onFailure = { e -> call.reject(e.message ?: "build failed", e as? Exception) },
            )
        }
    }

    /** Speaks `text` with the built-but-not-yet-committed profile from [buildEnrollmentProfile] - §11.1's "preview synthesis -> user accepts -> encrypted profile commit", the preview half. */
    @PluginMethod
    fun previewEnrollmentProfile(call: PluginCall) {
        val text = call.getString("text")?.trim().orEmpty()
        val readingId = call.getString("readingId")
        val profile = pendingProfile
        if (text.isEmpty() || readingId.isNullOrBlank()) {
            call.reject("text and readingId are required")
            return
        }
        if (profile == null) {
            call.reject("no built profile to preview - call buildEnrollmentProfile first")
            return
        }
        host.submitSpeakStreamingWithReference(text, profile.promptAudioCodes) { result ->
            val payload = result.fold(
                onSuccess = { r -> JSObject().put("readingId", readingId).put("cancelled", r.cancelled) },
                onFailure = { e -> JSObject().put("readingId", readingId).put("error", e.message ?: "preview failed") },
            )
            notifyListeners(if (result.isSuccess) "talosNeuralVoiceDone" else "talosNeuralVoiceError", payload)
        }
        call.resolve(JSObject().put("accepted", true))
    }

    @PluginMethod
    fun commitEnrollmentProfile(call: PluginCall) {
        val profile = pendingProfile
        if (profile == null) {
            call.reject("no built profile to commit - call buildEnrollmentProfile first")
            return
        }
        enrollmentLane.execute {
            runCatching {
                val enrollment = enrollment()
                enrollment.commit(profile)
                enrollmentSlots.clear()
                pendingProfile = null
                profileSummaryJson(enrollment, profile.header)
            }.fold(
                onSuccess = { summary -> call.resolve(JSObject().put("profile", summary)) },
                onFailure = { e -> call.reject(e.message ?: "commit failed", e as? Exception) },
            )
        }
    }

    @PluginMethod
    fun discardEnrollmentSession(call: PluginCall) {
        enrollmentSlots.clear()
        pendingProfile = null
        captureCancelled.set(false)
        call.resolve()
    }

    private fun profileSummaryJson(enrollment: TalosVoiceEnrollment, header: TalosVoiceProfileHeaderV1): JSObject =
        JSObject()
            .put("id", header.profileId)
            .put("name", header.displayName)
            .put("language", header.language)
            .put("style", header.style)
            .put("engineBuild", header.codecFingerprint)
            .put("compatible", runCatching { enrollment.isProfileStillCompatible(header.profileId) }.getOrDefault(false))
            .put("createdAtEpochMs", header.createdAtEpochMs)
            .put("enrollmentDurationMs", header.enrollmentDurationMs)

    private fun phraseVerdictJson(phrase: TalosVoicePhraseCapture): JSObject {
        val reasons = JSArray()
        phrase.verdict.rejectionReasons.forEach { reasons.put(it) }
        val metrics = phrase.verdict.metrics
        return JSObject()
            .put("accepted", phrase.verdict.accepted)
            .put("rejectionReasons", reasons)
            .put("durationMs", metrics.durationMs)
            .put("peakAbs", metrics.peakAbs)
            .put("rmsDbfs", metrics.rmsDbfs)
            .put("clippedSampleRatio", metrics.clippedSampleRatio)
            .put("zeroFrameRatio", metrics.zeroFrameRatio)
            .put("clientSilencedObserved", metrics.clientSilencedObserved)
    }

    override fun handleOnDestroy() {
        // §41: client/UI destruction is not the process-scoped voice runtime's
        // lifetime. TalosVoiceHost.get() is a singleton this plugin does not
        // own and must not close here. The enrollment lane IS this plugin's
        // own, and a fresh plugin instance gets a fresh one.
        enrollmentLane.shutdownNow()
    }

    companion object {
        private const val DEFAULT_PHRASE_MAX_DURATION_MS = 8_000
    }
}
