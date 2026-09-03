package ai.talos.artifact

import android.content.Context
import android.util.AtomicFile
import java.io.File
import java.util.regex.Pattern

/**
 * ⛔⛔⛔ Owner 2026-08-27 — «creare artefatti HTML con schemi avanzati e
 * interagibili in chat, come fa ChatGPT». Ricerca commissionata e verificata
 * contro il codice vero (vedi `TalosArtifactActivity`): l'HTML scritto dal
 * modello vive QUI, mai dentro un `Intent` — un `Intent` passa per `Binder`,
 * è loggato da `dumpsys activity`, e ha un tetto di dimensione (~1 MB) che un
 * "schema avanzato" supererebbe facilmente. L'Activity riceve solo l'UUID.
 *
 * `filesDir/artifacts/<uuid>.html` — stesso pattern di
 * `TalosVoiceProfileStore` (`filesDir/voice/profiles/<uuid>.tvp`):
 * storage interno dell'app, mai esterno/condiviso, `allowBackup="false"` a
 * livello di manifest lo tiene fuori da backup/export.
 */
internal class TalosArtifactStore(private val context: Context) {

    private val artifactsDir: File
        get() = File(context.applicationContext.filesDir, "artifacts").apply { mkdirs() }

    /**
     * ⛔ L'id arriva da un segmento di URL dentro `WebViewAssetLoader` — anche
     * se oggi lo generiamo sempre noi (`UUID.randomUUID()`, Blocco 2), la
     * difesa vive qui e non dove viene generato: un id che non passa QUESTA
     * forma non diventa mai un `File`, indipendentemente da chi l'ha scritto.
     * Niente `..`, niente `/`, niente sorprese — solo la forma di un UUID.
     */
    fun isValidId(id: String): Boolean = UUID_SHAPE.matcher(id).matches()

    private fun fileFor(id: String): File {
        require(isValidId(id)) { "TALOS_ARTIFACT_ID_INVALID" }
        return File(artifactsDir, "$id.html")
    }

    /** Byte grezzi UTF-8, o `null` se l'artefatto non esiste (mai un'eccezione per l'assenza). */
    fun read(id: String): ByteArray? {
        if (!isValidId(id)) return null
        val file = fileFor(id)
        if (!file.isFile) return null
        return AtomicFile(file).readFully()
    }

    /**
     * ⛔ Tetto reale, non simbolico: uno "schema avanzato" con animazioni può
     * crescere, ma un documento generato da un modello che sfugge a ogni
     * limite è lo stesso difetto già corretto nel Forge (`limits.ts`,
     * `MAX_OUTPUT_BYTES`) — qui la stessa disciplina, in Kotlin.
     */
    fun write(id: String, html: ByteArray) {
        require(isValidId(id)) { "TALOS_ARTIFACT_ID_INVALID" }
        require(html.size <= MAX_ARTIFACT_BYTES) { "TALOS_ARTIFACT_TOO_LARGE" }
        val atomic = AtomicFile(fileFor(id))
        val stream = atomic.startWrite()
        try {
            stream.write(html)
            atomic.finishWrite(stream)
        } catch (error: Exception) {
            atomic.failWrite(stream)
            throw error
        }
    }

    fun delete(id: String) {
        if (!isValidId(id)) return
        fileFor(id).delete()
    }

    companion object {
        private val UUID_SHAPE: Pattern = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
        )
        const val MAX_ARTIFACT_BYTES = 512 * 1024
    }
}
