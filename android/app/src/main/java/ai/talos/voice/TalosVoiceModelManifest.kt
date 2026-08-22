package ai.talos.voice

import ai.talos.TalosTransferSession
import org.json.JSONArray
import org.json.JSONObject

/**
 * ⭐⭐⭐ FASE 5, BLOCCO 2 — dal manifesto pinnato ai `Request` che il motore
 * di trasferimento già capisce.
 *
 * `assets/voice/model-manifest.json` (Blocco 1, provato in
 * [TalosVoiceModelManifestPinTest]) descrive DUE repository HuggingFace —
 * il TTS e il tokenizzatore audio sono pubblicati separatamente a monte,
 * non è una scelta nostra. `TalosTransferSession.Request` porta UN
 * `repo`+`revision` con più `paths[]` (i frammenti GGUF, nel caso dei
 * modelli di chat): due repository voce significano due `Request`, non uno
 * — l'installer li scarica entrambi prima di considerare la voce
 * installata (l'attivazione atomica, Blocco 3, aspetta tutti e due).
 *
 * ⛔ Pura analisi, zero I/O: il file `.json` arriva già come `String` (letto
 * da `assets/` con `AssetManager`, o da un `File` nei test — la stessa
 * separazione tenuta da `TalosMossManifest.readJson`/`fromJson`), così
 * questa classe resta provabile sulla JVM come tutto il resto del motore di
 * trasferimento (`TalosTransferPlan`, `TalosModelDownloadPolicy`).
 */
internal data class TalosVoiceModelManifest(
    val schemaVersion: Int,
    val engineBuild: String,
    val installRoot: String,
    val artifacts: List<Artifact>,
) {
    data class Artifact(
        val repo: String,
        val revision: String,
        val targetDir: String,
        val files: List<File>,
    ) {
        data class File(val path: String, val size: Long, val sha256: String)
    }

    /**
     * Un [TalosTransferSession.Request] per artifact — il `modelName` porta
     * `engineBuild` più la cartella di destinazione, cosi' due download
     * della voce non condividono mai una riga di progresso con un GGUF di
     * chat o fra loro.
     */
    fun toTransferRequests(): List<TalosTransferSession.Request> = artifacts.map { artifact ->
        TalosTransferSession.Request(
            artifact.repo,
            artifact.revision,
            artifact.files.map { it.path }.toTypedArray(),
            artifact.files.map { it.size }.toLongArray(),
            artifact.files.map { it.sha256 }.toTypedArray(),
            "$engineBuild/${artifact.targetDir}",
        )
    }

    companion object {
        fun fromJson(json: JSONObject): TalosVoiceModelManifest {
            val artifacts = json.getJSONArray("artifacts").toArtifactList()
            return TalosVoiceModelManifest(
                schemaVersion = json.getInt("schemaVersion"),
                engineBuild = json.getString("engineBuild"),
                installRoot = json.getString("installRoot"),
                artifacts = artifacts,
            )
        }

        private fun JSONArray.toArtifactList(): List<Artifact> =
            (0 until length()).map { i ->
                val a = getJSONObject(i)
                Artifact(
                    repo = a.getString("repo"),
                    revision = a.getString("revision"),
                    targetDir = a.getString("targetDir"),
                    files = a.getJSONArray("files").toFileList(),
                )
            }

        private fun JSONArray.toFileList(): List<Artifact.File> =
            (0 until length()).map { i ->
                val f = getJSONObject(i)
                Artifact.File(
                    path = f.getString("path"),
                    size = f.getLong("size"),
                    sha256 = f.getString("sha256"),
                )
            }
    }
}
