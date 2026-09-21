package ai.talos.voice

import java.io.File

/**
 * Presence only - no downloader. Durable model installation is blueprint
 * Phase 5, explicitly out of scope for the 0.1.18 (`.claude/CONSEGNA-0.1.18-VOCE.md`
 * §4). Model files still arrive the way Phase 0's did: pushed by hand with
 * `adb push` into `externalFilesDir/moss/…`; this class only answers "is a
 * usable set of them actually there right now", the same question
 * `TalosMossPhase0SmokeTest.modelsPresent()` answered inline, generalized so
 * both the runtime and its tests ask it the same way.
 */
internal object TalosVoiceModelManager {

    fun modelRoot(externalFilesDir: File): File = File(externalFilesDir, "moss")

    /**
     * True only if the manifest, both onnx metadata files, and the
     * tokenizer resolve to real files under [modelRoot] - not just that the
     * `moss/` directory exists. A partially-pushed model set must read as
     * absent, not as a confusing later crash.
     */
    fun isPresent(modelRoot: File): Boolean = runCatching {
        val manifestPath = TalosMossManifest.resolveManifestPath(modelRoot)
        val manifestDir = manifestPath.parentFile ?: modelRoot
        val manifest = TalosMossManifest.fromJson(TalosMossManifest.readJson(manifestPath))

        val ttsMetaPath = TalosMossManifest.resolveManifestRelativePath(manifestDir, manifest.modelFiles.ttsMeta)
        val codecMetaPath = TalosMossManifest.resolveManifestRelativePath(manifestDir, manifest.modelFiles.codecMeta)
        val tokenizerModelFile = File(manifestDir, "tokenizer.model")

        ttsMetaPath.isFile && codecMetaPath.isFile && tokenizerModelFile.isFile
    }.getOrDefault(false)

    fun describeMissing(modelRoot: File): String =
        "modello MOSS assente o incompleto sotto ${modelRoot.absolutePath} " +
            "(atteso: manifest, tts meta, codec meta, tokenizer.model)"
}
