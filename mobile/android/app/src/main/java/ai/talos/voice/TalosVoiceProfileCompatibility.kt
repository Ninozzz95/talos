package ai.talos.voice

import java.io.File
import java.security.MessageDigest

/**
 * Blueprint §6.1's "critical compatibility rule": profile compatibility is
 * keyed to the audio codec (encoder/decoder graphs + config + quantizer
 * count) and the prompt serialization schema this code builds - NOT to the
 * TTS model version. OpenMOSS's own note, quoted in the blueprint: existing
 * prompt audio codes need not be regenerated when the audio tokenizer stays
 * fixed, even across a TTS weight upgrade. A profile whose fingerprint still
 * matches after a TTS update may be reused once a regression suite passes;
 * that suite does not exist yet (§6.1's own caveat) - this only computes and
 * compares the fingerprint, not "TTS-swap tested and safe."
 */
internal object TalosVoiceProfileCompatibility {
    /** Bump this if [TalosMossRuntime]'s input-row construction (`buildInputRows`) changes in a way that would make old prompt codes decode differently. */
    private const val PROMPT_SCHEMA_VERSION = 1

    /** SHA-256 over the codec metadata JSON + every codec ONNX graph's real bytes + the active quantizer count - not file size or mtime, the actual content. */
    fun codecFingerprint(modelRoot: File): String {
        val manifestPath = TalosMossManifest.resolveManifestPath(modelRoot)
        val manifestDir = manifestPath.parentFile ?: modelRoot
        val manifest = TalosMossManifest.fromJson(TalosMossManifest.readJson(manifestPath))
        val codecMetaPath = TalosMossManifest.resolveManifestRelativePath(manifestDir, manifest.modelFiles.codecMeta)
        val codecMetaBytes = codecMetaPath.readBytes()
        val codecMeta = TalosMossCodecMeta.fromJson(org.json.JSONObject(String(codecMetaBytes, Charsets.UTF_8)))
        val codecDir = codecMetaPath.parentFile ?: manifestDir

        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(codecMetaBytes)
        updateWithFile(digest, File(codecDir, codecMeta.decodeFullFile))
        updateWithFile(digest, File(codecDir, codecMeta.decodeStepFile))
        updateWithFile(digest, File(codecDir, codecMeta.encodeFile))
        digest.update(codecMeta.numQuantizers.toString().toByteArray(Charsets.UTF_8))
        digest.update(codecMeta.sampleRate.toString().toByteArray(Charsets.UTF_8))
        digest.update(codecMeta.channels.toString().toByteArray(Charsets.UTF_8))
        return digest.digest().toHexLowercase()
    }

    fun promptSchemaFingerprint(): String {
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update("talos-prompt-schema-v$PROMPT_SCHEMA_VERSION".toByteArray(Charsets.UTF_8))
        return digest.digest().toHexLowercase()
    }

    /** True only if BOTH fingerprints on the profile still match what this device's currently-installed codec produces - either one drifting means the codes may decode wrong, silently. */
    fun isCompatible(header: TalosVoiceProfileHeaderV1, modelRoot: File): Boolean =
        header.codecFingerprint == codecFingerprint(modelRoot) && header.promptSchemaFingerprint == promptSchemaFingerprint()

    /** Streamed, not loaded whole - codec graphs can be tens to hundreds of MB, and this is not the place to risk an OOM. */
    private fun updateWithFile(digest: MessageDigest, file: File) {
        require(file.isFile) { "Missing codec file for fingerprinting: ${file.absolutePath}" }
        file.inputStream().use { stream ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
                val read = stream.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
    }

    private fun ByteArray.toHexLowercase(): String = joinToString("") { "%02x".format(it) }
}
