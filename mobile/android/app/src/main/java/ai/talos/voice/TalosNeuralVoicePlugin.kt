package ai.talos.voice

import android.Manifest
import ai.talos.BuildConfig
import ai.talos.voice.research.TalosVoiceDiagnosticConfig
import ai.talos.voice.research.TalosVoiceDiagnosticProbe
import ai.talos.voice.research.TalosVoiceDiagnosticRoute
import ai.talos.voice.research.TalosVoiceDiagnosticSession
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
import java.io.FileInputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import org.json.JSONObject

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
    private val micLevelPeekActive = AtomicBoolean(false)
    private val enrollmentSlots = ConcurrentHashMap<Int, TalosVoiceCaptureResult>()
    private val diagnosticSessions = ConcurrentHashMap<String, TalosVoiceDiagnosticSession>()
    @Volatile private var pendingProfile: TalosVoiceProfileV2? = null
    private val enrollmentGeneration = AtomicLong(0L)
    private val sessionStore: TalosVoiceEnrollmentSessionStore
        get() = TalosVoiceEnrollmentSessionStore(context.applicationContext)

    /**
     * ⛔⛔ `load()` gira sul thread CONDIVISO dei plugin — stessa nota di
     * `TalosSpeechPlugin.load()`: quello che ferma TUTTI gli altri se lo si
     * blocca. Le recovery MOSS legacy e Pocket fanno I/O di file veri
     * (rename, `deleteRecursively` su un `.previous` orfano che potrebbe
     * portare centinaia di MB) — mai chiamato inline qui dentro. Girato su
     * questa lane invece, cosi `load()` torna subito e gli altri plugin non
     * aspettano un file system che nel caso comune non ha niente da fare,
     * ma nel caso raro (una promozione interrotta) potrebbe metterci un
     * momento.
     */
    override fun load() {
        enrollmentLane.execute {
            val externalFilesDir = context.applicationContext.getExternalFilesDir(null) ?: return@execute
            runCatching {
                val manifest = readMossManifest()
                for (artifact in manifest.artifacts) {
                    TalosVoiceModelActivation.recover(externalFilesDir, artifact)
                }
            }
            runCatching {
                TalosPocketModelInstaller(externalFilesDir, readPocketManifest()).recover()
            }
            // ⛔ Silenzioso di proposito: se un manifesto manca o è
            // malformato, `installManifest`/`activateModel` lo diranno
            // chiaramente quando qualcuno li chiama davvero. `load()` non è
            // il posto per un errore che nessuno vede — è avvio dell'app,
            // non un'azione della persona.
        }
    }

    private val host: TalosVoiceHost
        get() = TalosVoiceHost.get(context.applicationContext)

    private fun modelRoot(): File =
        TalosVoiceModelManager.modelRoot(context.applicationContext.getExternalFilesDir(null)!!)

    private fun enrollment(): TalosVoiceEnrollment = TalosVoiceEnrollment(context.applicationContext)

    // ---------------------------------------------------------------
    // Status / profiles / playback - §41's shape.
    // ---------------------------------------------------------------

    /**
     * Opt-in and fail-closed. The host campaign supplies Git/APK/USB
     * provenance; this method recomputes the installed APK hash before it
     * arms the one-shot production probe. Normal speech never creates a
     * session and therefore pays no diagnostic work.
     */
    @PluginMethod
    fun beginDiagnostics(call: PluginCall) {
        val traceId = call.getString("traceId")
        val readingId = call.getString("readingId")
        val source = call.getString("source")
        val requestedLocale = call.getString("requestedLocale")
        val requestedEngine = call.getString("requestedEngine")
        val requestedProfileId = call.getString("requestedProfileId")
        val appCommit = call.getString("appCommit")
        val expectedApkSha256 = call.getString("expectedApkSha256")
        val usbTransportProof = call.getString("usbTransportProof")
        if (
            traceId.isNullOrBlank() || readingId.isNullOrBlank() || source.isNullOrBlank() ||
            requestedLocale.isNullOrBlank() || requestedEngine.isNullOrBlank() ||
            appCommit.isNullOrBlank() || expectedApkSha256.isNullOrBlank() || usbTransportProof.isNullOrBlank()
        ) {
            call.reject("diagnostic route and provenance are required")
            return
        }

        enrollmentLane.execute {
            runCatching {
                val route = TalosVoiceDiagnosticRoute(
                    traceId = traceId,
                    readingId = readingId,
                    source = source,
                    requestedLocale = requestedLocale,
                    requestedEngine = requestedEngine,
                    requestedProfileId = requestedProfileId,
                )
                val apk = File(context.applicationInfo.sourceDir)
                val actualApkSha256 = sha256(apk)
                require(actualApkSha256 == expectedApkSha256) {
                    "APK SHA-256 mismatch: expected=$expectedApkSha256 actual=$actualApkSha256"
                }
                val manifest = readPocketManifest().toVoiceModelManifest()
                val external = context.applicationContext.getExternalFilesDir(null)
                    ?: error("no-external-storage")
                val session = TalosVoiceDiagnosticSession(
                    TalosVoiceDiagnosticConfig(
                        outputDirectory = File(external, "research/voice"),
                        route = route,
                        appVersion = BuildConfig.VERSION_NAME,
                        appCommit = appCommit,
                        apkSha256 = actualApkSha256,
                        modelRevision = manifest.engineBuild,
                        modelSha256 = modelManifestSha256(manifest),
                        deviceFingerprint = android.os.Build.FINGERPRINT,
                        usbTransportProof = usbTransportProof,
                    ),
                )
                check(diagnosticSessions.putIfAbsent(traceId, session) == null) {
                    "diagnostic trace already exists: $traceId"
                }
                try {
                    TalosVoiceDiagnosticProbe.armNextProductionRun(session)
                } catch (error: Throwable) {
                    diagnosticSessions.remove(traceId, session)
                    throw error
                }
                actualApkSha256
            }.fold(
                onSuccess = { actualApkSha256 ->
                    call.resolve(
                        JSObject()
                            .put("armed", true)
                            .put("actualApkSha256", actualApkSha256),
                    )
                },
                onFailure = { error -> call.reject(error.message ?: "begin diagnostics failed", error as? Exception) },
            )
        }
    }

    @PluginMethod
    fun endDiagnostics(call: PluginCall) {
        resolveFinishedDiagnostic(call, includeEventCount = true)
    }

    @PluginMethod
    fun exportDiagnostics(call: PluginCall) {
        resolveFinishedDiagnostic(call, includeEventCount = false)
    }

    private fun resolveFinishedDiagnostic(call: PluginCall, includeEventCount: Boolean) {
        val traceId = call.getString("traceId")
        if (traceId.isNullOrBlank()) {
            call.reject("traceId is required")
            return
        }
        val session = diagnosticSessions[traceId]
        if (session == null) {
            call.reject("diagnostic trace not found: $traceId")
            return
        }
        val artifact = session.artifactFileOrNull()
        if (artifact == null || !artifact.isFile) {
            call.reject("diagnostic trace is not finished: $traceId")
            return
        }
        val payload = JSObject()
            .put("traceId", traceId)
            .put("artifactPath", artifact.absolutePath)
        if (includeEventCount) payload.put("eventCount", session.eventCount())
        call.resolve(payload)
    }

    private fun modelManifestSha256(manifest: TalosVoiceModelManifest): String {
        val canonical = buildString {
            append(manifest.schemaVersion).append('|').append(manifest.engineBuild).append('|')
            append(manifest.installRoot).append('|')
            manifest.artifacts.sortedBy { it.targetDir }.forEach { artifact ->
                append(artifact.repo).append('@').append(artifact.revision).append('/').append(artifact.targetDir).append('|')
                artifact.files.sortedBy { it.path }.forEach { file ->
                    append(file.path).append('>').append(file.targetPath).append(':')
                        .append(file.size).append(':').append(file.sha256).append('|')
                }
            }
        }
        return sha256(canonical.toByteArray(Charsets.UTF_8))
    }

    private fun sha256(file: File): String {
        require(file.isFile) { "file does not exist for SHA-256: ${file.absolutePath}" }
        val digest = MessageDigest.getInstance("SHA-256")
        FileInputStream(file).use { input ->
            val buffer = ByteArray(1024 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                if (read > 0) digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }

    private fun modelAvailabilityJson(availability: TalosVoiceModelAvailability): JSObject =
        JSObject()
            .put("supported", availability.supported)
            .put("installed", availability.installed)
            .put("backend", availability.backend)
            .put("engineBuild", availability.engineBuild)
            .put("modelState", availability.modelState)
            .put("verifiedFiles", availability.verifiedFiles)
            .put("cacheHit", availability.cacheHit)
            .put("verificationDurationMs", availability.verificationDurationNs / 1_000_000.0)
            .apply { availability.failure?.let { put("failure", it) } }

    private fun pocketInstallResultJson(result: TalosPocketInstallResult): JSObject {
        val measurement = result.stageMetrics.lastOrNull { it.stage.endsWith("_verify") }
            ?: result.stageMetrics.lastOrNull()
        val snapshot = TalosPocketModelStatusSnapshot(
            status = result.status,
            cacheHit = false,
            verificationStartedAtNs = measurement?.startedAtNs ?: System.nanoTime(),
            verificationDurationNs = measurement?.durationNs ?: 0L,
            verificationThreadName = measurement?.threadName ?: Thread.currentThread().name,
        )
        return modelAvailabilityJson(TalosVoiceAvailabilityResolver.forModel(snapshot))
            .put("activated", result.activated)
            .put("stages", pocketInstallStagesJson(result.stageMetrics))
    }

    private fun pocketInstallStagesJson(metrics: List<TalosPocketInstallStageMetric>): JSArray {
        val stages = JSArray()
        for (metric in metrics) {
            stages.put(
                JSObject()
                    .put("stage", metric.stage)
                    .put("startedAtNs", metric.startedAtNs)
                    .put("durationNs", metric.durationNs)
                    .put("threadName", metric.threadName)
                    .put("outcome", metric.outcome)
                    .apply {
                        metric.inputFiles?.let { put("inputFiles", it) }
                        metric.outputFiles?.let { put("outputFiles", it) }
                        metric.detail?.let { put("detail", it) }
                    },
            )
        }
        return stages
    }

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
        enrollmentLane.execute {
            runCatching {
                TalosVoiceAvailabilityResolver.forModel(host.pocketModelStatusBlocking(refresh = true))
            }.fold(
                onSuccess = { availability -> call.resolve(modelAvailabilityJson(availability)) },
                onFailure = { error -> call.reject(error.message ?: "Pocket status failed", error as? Exception) },
            )
        }
    }

    // ---------------------------------------------------------------
    // ⭐⭐⭐ Fase 5, Blocco 3b — installazione durevole del modello.
    //
    // ⛔ Il download vero passa dal plugin GENERICO già esistente,
    // `TalosModelTransferPlugin` (`start`/`status`/`cancel`...): un
    // `Request` è un `Request`, il motore non sa né gli importa se i byte
    // sono un GGUF di chat o il motore voce. `requestFrom()` là dentro
    // legge esattamente `{repo, revision, modelName, files:[{path, bytes,
    // sha256}]}` - la stessa forma che [installManifest] restituisce qui
    // sotto, campo per campo. Nessun secondo motore di trasferimento.
    // ---------------------------------------------------------------

    private fun readMossManifest(): TalosVoiceModelManifest {
        val json = context.assets.open("voice/model-manifest.json").bufferedReader().use { it.readText() }
        return TalosVoiceModelManifest.fromJson(JSONObject(json))
    }

    private fun readPocketManifest(): TalosPocketModelManifest {
        val json = context.assets.open("voice/pocket-model-manifest.json").bufferedReader().use { it.readText() }
        return TalosPocketModelManifest.fromJson(JSONObject(json)).requirePinnedBundle()
    }

    /**
     * Il manifesto pinnato (Blocco 1), tradotto nella forma che
     * `TalosModelTransferPlugin.start` capisce già. Pocket pubblica il
     * bundle italiano in un solo repository: il lato TS avvia una richiesta
     * e poi chiama `status`/`activateModel`.
     */
    @PluginMethod
    fun installManifest(call: PluginCall) {
        val manifest = try {
            readPocketManifest().toVoiceModelManifest()
        } catch (broken: Exception) {
            call.reject("pocket-model-manifest.json missing or malformed", broken)
            return
        }
        val artifacts = JSArray()
        for (artifact in manifest.artifacts) {
            val files = JSArray()
            for (file in artifact.files) {
                files.put(JSObject().put("path", file.path).put("bytes", file.size).put("sha256", file.sha256))
            }
            artifacts.put(
                JSObject()
                    .put("repo", artifact.repo)
                    .put("revision", artifact.revision)
                    .put("modelName", "${manifest.engineBuild}/${artifact.targetDir}")
                    .put("targetDir", artifact.targetDir)
                    .put("files", files),
            )
        }
        call.resolve(JSObject().put("engineBuild", manifest.engineBuild).put("artifacts", artifacts))
    }

    /**
     * ⭐⭐ L'ATTIVAZIONE ATOMICA — chiamato dal lato TS solo dopo che
     * `TalosModelTransferPlugin.status` conferma finito l'unico artifact di
     * [installManifest]. L'installer verifica il bundle Pocket nello staging,
     * lo promuove con rename atomico, lo verifica di nuovo nella posizione
     * attiva e soltanto allora elimina rollback e cache sorgente. Ogni fase
     * torna al chiamante con tempo, thread, conteggi ed esito.
     */
    @PluginMethod
    fun activateModel(call: PluginCall) {
        enrollmentLane.execute {
            runCatching {
                val externalFilesDir = context.applicationContext.getExternalFilesDir(null)
                    ?: error("no-external-storage")
                val result = TalosPocketModelInstaller(externalFilesDir, readPocketManifest()).activateFromCache()
                val evidence = pocketInstallResultJson(result)
                if (!result.activated || result.status !is TalosPocketModelStatus.Ready || result.status.verifiedFiles <= 0) {
                    call.reject("Pocket activation did not produce a verified bundle", evidence)
                    return@execute
                }
                // The active directory may have changed below an already-open
                // ORT session. FIFO owner-lane refresh closes that state before
                // the following hash verification can report success.
                host.refreshPocketModel()
                val availability = TalosVoiceAvailabilityResolver.forModel(
                    host.pocketModelStatusBlocking(refresh = true),
                )
                val payload = modelAvailabilityJson(availability)
                    .put("activated", availability.installed)
                    .put("stages", pocketInstallStagesJson(result.stageMetrics))
                if (!availability.installed) {
                    call.reject("Pocket activation failed post-promotion verification", payload)
                    return@execute
                }
                call.resolve(payload)
            }.onFailure { error ->
                call.reject(error.message ?: "Pocket activation failed", error as? Exception)
            }
        }
    }

    /**
     * ⛔⛔ [load] già chiama [ai.talos.voice.TalosVoiceModelActivation.recover]
     * da sola a ogni avvio, in background — se il processo è morto fra
     * `stage` e `promote` in una sessione precedente, l'app si autoripara
     * senza che nessuno lo chieda. Questo metodo esiste per il lato TS che
     * vuole sapere CON CERTEZZA che la ripresa è finita (dopo un tentativo
     * di installazione che sembrava interrotto, prima di riprovare) invece
     * di fidarsi del passaggio silenzioso di `load()`.
     */
    @PluginMethod
    fun recoverModelInstall(call: PluginCall) {
        enrollmentLane.execute {
            runCatching {
                val externalFilesDir = context.applicationContext.getExternalFilesDir(null)
                    ?: error("no-external-storage")
                val result = TalosPocketModelInstaller(externalFilesDir, readPocketManifest()).recover()
                host.refreshPocketModel()
                val availability = TalosVoiceAvailabilityResolver.forModel(
                    host.pocketModelStatusBlocking(refresh = true),
                )
                modelAvailabilityJson(availability)
                    .put("activated", result.activated)
                    .put("stages", pocketInstallStagesJson(result.stageMetrics))
            }.fold(
                onSuccess = call::resolve,
                onFailure = { error -> call.reject(error.message ?: "Pocket recovery failed", error as? Exception) },
            )
        }
    }

    @PluginMethod
    fun profiles(call: PluginCall) {
        enrollmentLane.execute {
            runCatching {
                val enrollment = enrollment()
                val store = TalosVoiceProfileStore(context.applicationContext)
                val storedProfiles = enrollment.listProfileIds().mapNotNull { id ->
                    runCatching { store.loadAny(id) }.getOrNull()
                }
                val pocketStatus = if (storedProfiles.isEmpty()) {
                    null
                } else {
                    host.pocketModelStatusBlocking().status
                }
                val needsMossFingerprint = storedProfiles.any { stored ->
                    stored is TalosStoredVoiceProfile.Legacy ||
                        (stored is TalosStoredVoiceProfile.Current &&
                            stored.profile.backendPayloads.any { it is TalosMossPromptPayload })
                }
                val mossFingerprints = if (needsMossFingerprint) activeMossFingerprints() else null
                val array = JSArray()
                for (stored in storedProfiles) {
                    when (stored) {
                        is TalosStoredVoiceProfile.Legacy -> {
                            val compatible = isMossCompatible(stored.profile.header, mossFingerprints)
                            array.put(profileSummaryJson(stored.profile.header, compatible))
                        }
                        is TalosStoredVoiceProfile.Current -> {
                            val compatibleMoss = isMossCompatible(stored.profile, mossFingerprints)
                            val availability = TalosVoiceAvailabilityResolver.forProfile(
                                profile = stored.profile,
                                pocketStatus = requireNotNull(pocketStatus),
                                mossCompatible = compatibleMoss,
                            )
                            array.put(profileSummaryJson(stored.profile, availability))
                        }
                    }
                }
                JSObject().put("profiles", array)
            }.fold(
                onSuccess = { payload -> call.resolve(payload) },
                onFailure = { error -> call.reject(error.message ?: "profile status failed", error as? Exception) },
            )
        }
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
        val utteranceId = call.getString("utteranceId") ?: readingId
        val locale = call.getString("locale")?.trim()
        if (
            text.isEmpty() || profileId.isNullOrBlank() || readingId.isNullOrBlank() ||
            utteranceId.isNullOrBlank() || locale.isNullOrBlank()
        ) {
            call.reject("text, profileId, readingId and locale are required")
            return
        }
        if (!VOICE_LOCALE.matches(locale)) {
            call.reject("locale is not a valid BCP-47 language tag")
            return
        }
        val rate = call.getFloat("rate") ?: 1f
        val pitch = call.getFloat("pitch") ?: 1f
        val queueMode = try {
            TalosVoiceQueueMode.fromWire(call.getString("queue"))
        } catch (error: IllegalArgumentException) {
            call.reject(error.message ?: "invalid queue mode", error)
            return
        }
        val traceId = call.getString("traceId")
        val diagnosticRoute = if (traceId != null) {
            val source = call.getString("source")
            if (source.isNullOrBlank()) {
                call.reject("source is required when traceId is present")
                return
            }
            try {
                TalosVoiceDiagnosticRoute(
                    traceId = traceId,
                    readingId = readingId,
                    source = source,
                    requestedLocale = locale,
                    requestedEngine = "personal",
                    requestedProfileId = profileId,
                )
            } catch (error: IllegalArgumentException) {
                call.reject(error.message ?: "invalid diagnostic route", error)
                return
            }
        } else {
            null
        }

        val profileStore = TalosVoiceProfileStore(context.applicationContext)
        val storedProfile = runCatching { profileStore.loadAny(profileId) }.getOrElse {
            val reason = if (runCatching { profileStore.exists(profileId) }.getOrDefault(false)) {
                "profileUnreadable"
            } else {
                "profileNotFound"
            }
            call.resolve(JSObject().put("accepted", false).put("reason", reason))
            return
        }

        // rate/pitch are accepted for contract parity with §40 but not yet wired
        // into TalosMossRuntime - there is no post-synthesis resampling/pitch
        // path on the native side today. Declaring that here rather than
        // silently ignoring the caller's values.
        val ratePitchApplied = rate == 1f && pitch == 1f

        val completion: (Result<TalosVoiceStreamResult>) -> Unit = { result ->
            val payload = result.fold(
                onSuccess = { r ->
                    val completed = JSObject()
                        .put("readingId", utteranceId)
                        .put("cancelled", r.cancelled)
                        .put("hardwareUnderruns", r.hardwareUnderruns)
                        .put("elapsedMs", r.elapsedMs)
                        .put("resolvedEngine", r.resolvedEngine ?: TalosMossPromptPayload.BACKEND)
                        .put("resolvedLocale", r.resolvedLocale ?: "und")
                        .put("resolvedProfileId", r.resolvedProfileId ?: profileId)
                        .put("resolvedProfileSchemaVersion", r.resolvedProfileSchemaVersion)
                        .put("profileMigrationCommitted", r.profileMigrationCommitted)
                    r.fallbackReason?.let { completed.put("fallbackReason", it) }
                    completed
                },
                onFailure = { e ->
                    JSObject().put("readingId", utteranceId).put("error", e.message ?: "synthesis failed")
                },
            )
            notifyListeners(if (result.isSuccess) "talosNeuralVoiceDone" else "talosNeuralVoiceError", payload)
        }
        host.submitSpeakStreamingWithStoredProfile(
            text = text,
            locale = locale,
            storedProfile = storedProfile,
            migrationCommitter = TalosVoiceProfileStoreMigrationCommitter(profileStore),
            diagnosticRoute = diagnosticRoute,
            queueMode = queueMode,
            onComplete = completion,
        )
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

    /**
     * ⭐⭐⭐ Owner 22/8: NON pulisce più per costruzione - riprende. Un
     * crash reale durante `buildEnrollmentProfile` (misurato: pressione di
     * memoria di sistema) portava via tutte e 12 le frasi appena accettate,
     * mai scritte da nessuna parte. Ora ogni frase accettata è già su disco
     * cifrato ([TalosVoiceEnrollmentSessionStore]) nel momento in cui viene
     * accettata - questa chiamata le rilegge in [enrollmentSlots] invece di
     * ripartire da zero, e dice al chiamante quali indici sono già fatti.
     */
    @PluginMethod
    fun startEnrollmentSession(call: PluginCall) {
        enrollmentGeneration.incrementAndGet()
        host.cancel()
        enrollmentSlots.clear()
        pendingProfile = null
        captureCancelled.set(false)
        enrollmentLane.execute {
            runCatching { sessionStore.loadPersistedSlots() }.getOrDefault(emptyMap()).forEach { (index, capture) ->
                enrollmentSlots[index] = capture
            }
            val resumed = JSArray()
            enrollmentSlots.keys.sorted().forEach { resumed.put(it) }
            call.resolve(JSObject().put("resumedSlotIndexes", resumed))
        }
    }

    /** Cancels whatever `captureEnrollmentPhrase` call is in flight right now - checked by [TalosVoiceRecorder] on every read loop iteration, same mechanism [TalosVoiceHost.cancel] already relies on for generation. */
    @PluginMethod
    fun stopEnrollmentCapture(call: PluginCall) {
        captureCancelled.set(true)
        call.resolve()
    }

    /**
     * ⭐⭐⭐ Owner 22/8: la schermata «trova un posto silenzioso» non
     * cattura nessuna frase - qui il livello è tutto quello che serve, e
     * [TalosVoiceRecorder.peekLevel] esiste apposta per questo (nessun
     * campione tenuto, nessun cancello di qualità). Idempotente: un secondo
     * `startMicLevelPeek` mentre uno è già attivo non apre un secondo
     * `AudioRecord` sopra al primo.
     */
    @PluginMethod
    fun startMicLevelPeek(call: PluginCall) {
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "afterMicPermissionForPeek")
            return
        }
        runStartMicLevelPeek(call)
    }

    @PermissionCallback
    private fun afterMicPermissionForPeek(call: PluginCall) {
        if (getPermissionState("microfono") != PermissionState.GRANTED) {
            call.reject("RECORD_AUDIO permission denied")
            return
        }
        runStartMicLevelPeek(call)
    }

    private fun runStartMicLevelPeek(call: PluginCall) {
        if (micLevelPeekActive.getAndSet(true)) {
            call.resolve()
            return
        }
        enrollmentLane.execute {
            runCatching {
                TalosVoiceRecorder(context.applicationContext).peekLevel(
                    { micLevelPeekActive.get() },
                    { level -> notifyListeners("talosVoiceEnrollmentLevel", JSObject().put("level", level.toDouble())) },
                )
            }
            micLevelPeekActive.set(false)
        }
        call.resolve()
    }

    /** ⛔ Ferma il ciclo cooperativamente (`shouldContinue` torna false al prossimo giro) - non c'è nient'altro da cancellare, il peek non tiene stato oltre il flag. */
    @PluginMethod
    fun stopMicLevelPeek(call: PluginCall) {
        micLevelPeekActive.set(false)
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
                val phrase = enrollment().captureOnePhrase(
                    maxDurationMs,
                    { captureCancelled.get() },
                    { level -> notifyListeners("talosVoiceEnrollmentLevel", JSObject().put("level", level.toDouble())) },
                )
                if (phrase.verdict.accepted) {
                    enrollmentSlots[slotIndex] = phrase.capture
                    // ⭐⭐⭐ Owner 22/8: scritta SUBITO, non solo tenuta in
                    // memoria - è esattamente il dato che un crash a metà
                    // sessione (misurato: pressione di memoria di sistema
                    // durante l'encode) portava via.
                    runCatching { sessionStore.saveSlot(slotIndex, phrase.capture) }
                }
                phrase
            }.fold(
                onSuccess = { phrase -> call.resolve(phraseVerdictJson(phrase)) },
                onFailure = { e -> call.reject(e.message ?: "capture failed", e as? Exception) },
            )
        }
    }

    /**
     * ⭐⭐⭐ Owner 22/8, live durante la prova sul Pad: "dopo ogni frase
     * voglio un pulsante che riproduca quello che ho appena registrato".
     *
     * Non serve una nuova sintesi: [enrollmentSlots] tiene già il PCM grezzo
     * ACCETTATO di ogni slot in memoria (mai su disco, stesso motivo della
     * classe di `TalosVoiceEnrollment`). Qui si riproduce quello, con
     * [TalosPcmPlayer] a piccoli blocchi (mai in un colpo solo — confermato
     * da ricerca: la modalità STREAM è pensata per blocchi ripetuti, e la
     * sua stessa nota misurata sul Pad lo impone), bloccando finché non
     * finisce: una ripetizione di ~1-3 s non ha bisogno del pattern
     * evento-di-completamento che usa `speak`/`previewEnrollmentProfile`.
     */
    @PluginMethod
    fun playCapturedPhrase(call: PluginCall) {
        val slotIndex = call.getInt("slotIndex")
        if (slotIndex == null) {
            call.reject("slotIndex is required")
            return
        }
        val capture = enrollmentSlots[slotIndex]
        if (capture == null) {
            call.reject("no accepted capture for slot $slotIndex")
            return
        }
        enrollmentLane.execute {
            runCatching {
                val player = TalosPcmPlayer(capture.sampleRate, 1)
                try {
                    val floatPcm = FloatArray(capture.pcm16Mono.size) { i -> capture.pcm16Mono[i] / 32768f }
                    var offset = 0
                    while (offset < floatPcm.size) {
                        val end = (offset + PLAYBACK_CHUNK_SAMPLES).coerceAtMost(floatPcm.size)
                        if (!player.write(floatPcm.copyOfRange(offset, end))) break
                        offset = end
                    }
                    player.awaitDrain(PLAYBACK_DRAIN_TIMEOUT_MS)
                } finally {
                    player.close()
                }
            }.fold(
                onSuccess = { call.resolve() },
                onFailure = { e -> call.reject(e.message ?: "playback failed", e as? Exception) },
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
        // Le frasi normali (4..7) sono la reference conversazionale. Il
        // builder Host applica comunque il cap misurato e riporta sia i
        // campioni sorgente sia quelli realmente passati a Mimi.
        val normalTierSlots = (NORMAL_TIER_FIRST_SLOT..NORMAL_TIER_LAST_SLOT).mapNotNull { enrollmentSlots[it] }
        val accepted = if (normalTierSlots.size == (NORMAL_TIER_LAST_SLOT - NORMAL_TIER_FIRST_SLOT + 1)) {
            normalTierSlots
        } else {
            enrollmentSlots.toSortedMap().values.toList()
        }
        if (accepted.isEmpty()) {
            call.reject("no accepted phrases in this session")
            return
        }
        pendingProfile = null
        val buildGeneration = enrollmentGeneration.incrementAndGet()
        host.submitBuildPocketEnrollmentProfile(
            acceptedPhrases = accepted,
            displayName = displayName,
            language = language,
            style = style,
            consentVersion = consentVersion,
        ) { outcome ->
            if (enrollmentGeneration.get() != buildGeneration) {
                call.reject("enrollment build superseded")
                return@submitBuildPocketEnrollmentProfile
            }
            outcome.fold(
                onSuccess = { result ->
                    pendingProfile = result.profile
                    call.resolve(enrollmentBuildJson(result))
                },
                onFailure = { error ->
                    call.reject(error.message ?: "build failed", error as? Exception)
                },
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
        val previewGeneration = enrollmentGeneration.get()
        host.submitSpeakStreamingWithProfile(text, profile.header.language, profile) { rawResult ->
            val result = rawResult.mapCatching { observed ->
                check(observed.cancelled || observed.resolvedEngine == TalosPocketConditioningPayload.BACKEND) {
                    "enrollment preview did not use Pocket"
                }
                check(observed.cancelled || observed.resolvedLocale == profile.header.language) {
                    "enrollment preview changed the selected locale"
                }
                check(observed.cancelled || observed.resolvedProfileId == profile.header.profileId) {
                    "enrollment preview changed the pending profile"
                }
                check(observed.cancelled || observed.resolvedProfileSchemaVersion == TalosVoiceProfileHeaderV2.SCHEMA_VERSION) {
                    "enrollment preview did not use schema V2"
                }
                check(observed.cancelled || observed.fallbackReason == null) {
                    "enrollment preview used a fallback"
                }
                observed
            }
            if (enrollmentGeneration.get() != previewGeneration) return@submitSpeakStreamingWithProfile
            val payload = result.fold(
                onSuccess = { observed ->
                    JSObject()
                        .put("readingId", readingId)
                        .put("cancelled", observed.cancelled)
                        .put("hardwareUnderruns", observed.hardwareUnderruns)
                        .put("elapsedMs", observed.elapsedMs)
                        .put("generatedFrames", observed.generatedFrames)
                        .put("resolvedEngine", observed.resolvedEngine)
                        .put("resolvedLocale", observed.resolvedLocale)
                        .put("resolvedProfileId", observed.resolvedProfileId)
                        .put("resolvedProfileSchemaVersion", observed.resolvedProfileSchemaVersion)
                },
                onFailure = { error ->
                    JSObject().put("readingId", readingId).put("error", error.message ?: "preview failed")
                },
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
        val commitGeneration = enrollmentGeneration.get()
        enrollmentLane.execute {
            runCatching {
                check(enrollmentGeneration.get() == commitGeneration && pendingProfile?.header?.profileId == profile.header.profileId) {
                    "pending enrollment profile changed before commit"
                }
                val enrollment = enrollment()
                enrollment.commit(profile)
                enrollmentSlots.clear()
                pendingProfile = null
                enrollmentGeneration.incrementAndGet()
                // Il profilo vero e cifrato esiste ora - la copia di
                // servizio per la ripresa non serve più, stessa erasure
                // crittografica di TalosVoiceProfileStore.delete().
                runCatching { sessionStore.clearSession() }
                val pocketStatus = host.pocketModelStatusBlocking(refresh = true).status
                val mossFingerprints = if (profile.backendPayloads.any { it is TalosMossPromptPayload }) {
                    activeMossFingerprints()
                } else {
                    null
                }
                val availability = TalosVoiceAvailabilityResolver.forProfile(
                    profile = profile,
                    pocketStatus = pocketStatus,
                    mossCompatible = isMossCompatible(profile, mossFingerprints),
                )
                profileSummaryJson(profile, availability)
            }.fold(
                onSuccess = { summary -> call.resolve(JSObject().put("profile", summary)) },
                onFailure = { e -> call.reject(e.message ?: "commit failed", e as? Exception) },
            )
        }
    }

    @PluginMethod
    fun discardEnrollmentSession(call: PluginCall) {
        enrollmentGeneration.incrementAndGet()
        host.cancel()
        enrollmentSlots.clear()
        pendingProfile = null
        captureCancelled.set(false)
        micLevelPeekActive.set(false)
        enrollmentLane.execute {
            runCatching { sessionStore.clearSession() }
            call.resolve()
        }
    }

    private fun profileSummaryJson(header: TalosVoiceProfileHeaderV1, compatible: Boolean): JSObject =
        JSObject()
            .put("id", header.profileId)
            .put("name", header.displayName)
            .put("language", header.language)
            .put("style", header.style)
            .put("engineBuild", header.codecFingerprint)
            .put("compatible", compatible)
            .apply {
                if (compatible) {
                    put("resolvedBackend", TalosMossPromptPayload.BACKEND)
                } else {
                    put("incompatibilityReason", "active MOSS codec does not match this legacy profile")
                }
            }
            .put("createdAtEpochMs", header.createdAtEpochMs)
            .put("enrollmentDurationMs", header.enrollmentDurationMs)

    private fun profileSummaryJson(
        profile: TalosVoiceProfileV2,
        availability: TalosVoiceProfileAvailability,
    ): JSObject = JSObject()
            .put("id", profile.header.profileId)
            .put("name", profile.header.displayName)
            .put("language", profile.header.language)
            .put("style", profile.header.style)
            .put(
                "engineBuild",
                profile.backendPayloads.filterIsInstance<TalosPocketConditioningPayload>().singleOrNull()?.revision
                    ?: profile.backendPayloads.filterIsInstance<TalosMossPromptPayload>().single().codecFingerprint,
            )
            .put("compatible", availability.compatible)
            .apply {
                availability.resolvedBackend?.let { put("resolvedBackend", it) }
                availability.fallbackReason?.let { put("fallbackReason", it) }
                availability.incompatibilityReason?.let { put("incompatibilityReason", it) }
            }
            .put("createdAtEpochMs", profile.header.createdAtEpochMs)
            .put("enrollmentDurationMs", profile.header.enrollmentDurationMs)

    private fun activeMossFingerprints(): Pair<String, String>? = runCatching {
        TalosVoiceProfileCompatibility.codecFingerprint(modelRoot()) to
            TalosVoiceProfileCompatibility.promptSchemaFingerprint()
    }.getOrNull()

    private fun isMossCompatible(
        header: TalosVoiceProfileHeaderV1,
        active: Pair<String, String>?,
    ): Boolean = active != null &&
        header.codecFingerprint == active.first &&
        header.promptSchemaFingerprint == active.second

    private fun isMossCompatible(
        profile: TalosVoiceProfileV2,
        active: Pair<String, String>?,
    ): Boolean {
        val payload = profile.backendPayloads.filterIsInstance<TalosMossPromptPayload>().singleOrNull()
            ?: return false
        return active != null &&
            payload.codecFingerprint == active.first &&
            payload.promptSchemaFingerprint == active.second
    }

    private fun enrollmentBuildJson(result: TalosVoiceEnrollmentBuildResult): JSObject {
        val stages = JSArray()
        result.stageMetrics.forEach { metric ->
            val encoded = JSObject()
                .put("stage", metric.stage)
                .put("startedAtNs", metric.startedAtNs)
                .put("durationNs", metric.durationNs)
                .put("threadName", metric.threadName)
            metric.inputFrames?.let { encoded.put("inputFrames", it) }
            metric.outputSamples?.let { encoded.put("outputSamples", it) }
            stages.put(encoded)
        }
        return JSObject()
            .put("backend", result.profile.header.preferredBackend)
            .put("profileSchemaVersion", result.profile.header.schemaVersion)
            .put("sourceSampleRate", result.sourceSampleRate)
            .put("sourceSamples", result.sourceSamples)
            .put("referenceSamples", result.referenceSamples)
            .put("referenceDurationMs", result.referenceDurationMs)
            .put("conditioningFrames", result.conditioningFrames)
            .put("conditioningDimension", result.conditioningDimension)
            .put("enrollmentDurationMs", result.profile.header.enrollmentDurationMs)
            .put("stages", stages)
    }

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
        private val VOICE_LOCALE = Regex("^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
        private const val DEFAULT_PHRASE_MAX_DURATION_MS = 8_000
        // Stesso ordine hardcoded lato JS (PHRASES in
        // TalosMobilePersonalVoiceEnrollment.vue): whisper 0-3, normale
        // 4-7, forte 8-11. Un accoppiamento implicito già esistente
        // altrove (12 frasi, lo stesso limite di durata) - non nuovo qui.
        private const val NORMAL_TIER_FIRST_SLOT = 4
        private const val NORMAL_TIER_LAST_SLOT = 7
        // ⛔ Non lo stesso buffer di TalosPcmPlayer (quello è dimensionato per
        // l'HAL in uscita) - questo è quanto float PCM si converte e scrive
        // per iterazione: piccolo apposta, per la stessa ragione documentata
        // su TalosPcmPlayer.write() (mai l'intera clip in un colpo solo).
        private const val PLAYBACK_CHUNK_SAMPLES = 4_096
        private const val PLAYBACK_DRAIN_TIMEOUT_MS = 8_000L
    }
}
