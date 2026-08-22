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
    @Volatile private var pendingProfile: TalosVoiceProfileV1? = null
    private val sessionStore: TalosVoiceEnrollmentSessionStore
        get() = TalosVoiceEnrollmentSessionStore(context.applicationContext)

    /**
     * ⛔⛔ `load()` gira sul thread CONDIVISO dei plugin — stessa nota di
     * `TalosSpeechPlugin.load()`: quello che ferma TUTTI gli altri se lo si
     * blocca. `TalosVoiceModelActivation.recover()` fa I/O di file veri
     * (rename, `deleteRecursively` su un `.previous` orfano che potrebbe
     * portare centinaia di MB) — mai chiamato inline qui dentro. Girato su
     * questa lane invece, cosi `load()` torna subito e gli altri plugin non
     * aspettano un file system che nel caso comune non ha niente da fare,
     * ma nel caso raro (una promozione interrotta) potrebbe metterci un
     * momento.
     */
    override fun load() {
        enrollmentLane.execute {
            runCatching {
                val manifest = readManifest()
                val externalFilesDir = context.applicationContext.getExternalFilesDir(null) ?: return@runCatching
                for (artifact in manifest.artifacts) {
                    TalosVoiceModelActivation.recover(externalFilesDir, artifact.targetDir)
                }
            }
            // ⛔ Silenzioso di proposito: se il manifesto manca o è
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

    private fun readManifest(): TalosVoiceModelManifest {
        val json = context.assets.open("voice/model-manifest.json").bufferedReader().use { it.readText() }
        return TalosVoiceModelManifest.fromJson(JSONObject(json))
    }

    /**
     * Il manifesto pinnato (Blocco 1), tradotto nella forma che
     * `TalosModelTransferPlugin.start` capisce già - un oggetto per
     * artifact, cosi il lato TS chiama `start` due volte (una per
     * repository) e poi `status`/`activateModel` per seguirli.
     */
    @PluginMethod
    fun installManifest(call: PluginCall) {
        val manifest = try {
            readManifest()
        } catch (broken: Exception) {
            call.reject("model-manifest.json missing or malformed", broken)
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
     * `TalosModelTransferPlugin.status` conferma finiti TUTTI gli artifact
     * di [installManifest]. Mette in staging OGNI artifact prima di
     * promuoverne anche solo uno: un download riuscito a metà (mancasse un
     * file di UN artifact) non tocca `moss/` per niente, non solo per
     * quell'artifact.
     *
     * ⛔ Onestà sul residuo: una volta iniziata la promozione, i due
     * `promote()` restano due operazioni separate — se la seconda fallisse
     * (un I/O raro, a valle di un download già interamente verificato) la
     * voce resterebbe con un artifact nuovo e uno vecchio finché non si
     * ritenta. Non è il caso di questa prima attivazione sul dispositivo di
     * riferimento (i file "vecchi" sul Pad sono BYTE PER BYTE gli stessi
     * pinnati nel Blocco 1 — non c'è disallineamento possibile), e per un
     * vero aggiornamento futuro `TalosVoiceModelManager.isPresent()`
     * continuerebbe comunque a rispondere in base ai file REALI su disco,
     * mai a un flag che potrebbe mentire.
     */
    @PluginMethod
    fun activateModel(call: PluginCall) {
        val manifest = try {
            readManifest()
        } catch (broken: Exception) {
            call.reject("model-manifest.json missing or malformed", broken)
            return
        }
        val externalFilesDir = context.applicationContext.getExternalFilesDir(null)
        if (externalFilesDir == null) {
            call.reject("no-external-storage")
            return
        }

        val staged = mutableListOf<String>()
        for (artifact in manifest.artifacts) {
            when (val outcome = TalosVoiceModelActivation.stage(externalFilesDir, artifact)) {
                is TalosVoiceModelActivation.Outcome.Activated -> staged.add(artifact.targetDir)
                is TalosVoiceModelActivation.Outcome.Incomplete -> {
                    call.reject("not-downloaded:${artifact.targetDir}:${outcome.missingPath}")
                    return
                }
                is TalosVoiceModelActivation.Outcome.Failed -> {
                    call.reject("stage-failed:${artifact.targetDir}:${outcome.reason}")
                    return
                }
            }
        }

        for (targetDir in staged) {
            val outcome = TalosVoiceModelActivation.promote(externalFilesDir, targetDir)
            if (outcome !is TalosVoiceModelActivation.Outcome.Activated) {
                call.reject("promote-failed:$targetDir")
                return
            }
        }
        // ⛔ Non prima di qui: solo dopo che ENTRAMBI gli artifact sono
        // promossi la pulizia della versione vecchia è onesta - prima
        // sarebbe stata pulizia di un rollback che potrebbe ancora servire.
        for (targetDir in staged) TalosVoiceModelActivation.cleanupPrevious(externalFilesDir, targetDir)

        call.resolve(JSObject().put("activated", true).put("supported", TalosVoiceModelManager.isPresent(modelRoot())))
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
        val manifest = try {
            readManifest()
        } catch (broken: Exception) {
            call.reject("model-manifest.json missing or malformed", broken)
            return
        }
        val externalFilesDir = context.applicationContext.getExternalFilesDir(null)
        if (externalFilesDir == null) {
            call.reject("no-external-storage")
            return
        }
        for (artifact in manifest.artifacts) {
            TalosVoiceModelActivation.recover(externalFilesDir, artifact.targetDir)
        }
        call.resolve(JSObject().put("supported", TalosVoiceModelManager.isPresent(modelRoot())))
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
        // ⭐⭐⭐ Owner 22/8, riprodotto sul Pad due volte con dati reali:
        // `lowmemorykiller` uccide ai.talos con "process memory is leaking"
        // durante l'encode, RSS in crescita CONTINUA per tutta la durata
        // della chiamata - non un picco al caricamento. Ricerca: l'encoder
        // di un codec neurale a base transformer ha un costo quadratico
        // nella lunghezza della sequenza (self-attention) - concatenare
        // TUTTE e 12 le frasi (whisper+normale+forte, anche 20-40s veri) in
        // un'unica encodeReferenceAudio() è esattamente il caso che
        // esplode. La documentazione UFFICIALE di MOSS-TTS lo conferma da
        // un'altra direzione, indipendente dalla memoria: "optimal
        // reference clip length is 3-10 seconds... clips longer than ~15
        // seconds may introduce noise artifacts or degrade quality" - un
        // riferimento più corto non è un compromesso, è quello giusto.
        // ⇒ Le frasi 'normale' (indici 4-7 nel wizard, mai sussurrate né
        // gridate - le più rappresentative di una voce di conversazione
        // vera) bastano da sole, ~4 frasi invece di 12: il cancello di
        // qualità resta invariato su TUTTE e 12 (misura la registrazione,
        // non la scelta del riferimento), solo l'audio che finisce
        // davvero nel codec cambia.
        val normalTierSlots = (NORMAL_TIER_FIRST_SLOT..NORMAL_TIER_LAST_SLOT).mapNotNull { enrollmentSlots[it] }
        val accepted = if (normalTierSlots.size == (NORMAL_TIER_LAST_SLOT - NORMAL_TIER_FIRST_SLOT + 1)) {
            normalTierSlots
        } else {
            // Sessione anomala (mai osservata dal wizard reale, ma non si
            // assume): meglio l'insieme intero - buildProfile() applica
            // comunque il proprio tetto di durata più sotto.
            enrollmentSlots.values.toList()
        }
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
                // Il profilo vero e cifrato esiste ora - la copia di
                // servizio per la ripresa non serve più, stessa erasure
                // crittografica di TalosVoiceProfileStore.delete().
                runCatching { sessionStore.clearSession() }
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
        micLevelPeekActive.set(false)
        enrollmentLane.execute {
            runCatching { sessionStore.clearSession() }
            call.resolve()
        }
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
