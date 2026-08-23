package ai.talos.voice

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest


internal sealed interface TalosPocketModelStatus {
    data class Ready(val root: File, val verifiedFiles: Int) : TalosPocketModelStatus
    data class Missing(val path: String) : TalosPocketModelStatus
    data class Corrupt(val path: String, val reason: String) : TalosPocketModelStatus
}


internal object TalosPocketModelManager {
    fun modelRoot(externalFilesDir: File): File = File(externalFilesDir, "pocket/italian")

    fun validate(root: File, manifest: TalosPocketModelManifest): TalosPocketModelStatus {
        val canonicalRoot = runCatching { root.canonicalFile }.getOrElse {
            return TalosPocketModelStatus.Corrupt(".", "canonical-root")
        }
        for (contract in manifest.files) {
            val candidate = runCatching { File(canonicalRoot, contract.path).canonicalFile }.getOrElse {
                return TalosPocketModelStatus.Corrupt(contract.path, "canonical-path")
            }
            if (candidate.parentFile == null || !candidate.path.startsWith(canonicalRoot.path + File.separator)) {
                return TalosPocketModelStatus.Corrupt(contract.path, "path")
            }
            if (!candidate.isFile) return TalosPocketModelStatus.Missing(contract.path)
            if (candidate.length() != contract.size) {
                return TalosPocketModelStatus.Corrupt(contract.path, "size")
            }
            val actual = runCatching { sha256(candidate) }.getOrElse {
                return TalosPocketModelStatus.Corrupt(contract.path, "read")
            }
            if (actual != contract.sha256) {
                return TalosPocketModelStatus.Corrupt(contract.path, "sha256")
            }
        }
        return TalosPocketModelStatus.Ready(canonicalRoot, manifest.files.size)
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        FileInputStream(file).use { input ->
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                if (count > 0) digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { byte -> "%02x".format(byte.toInt() and 0xff) }
    }
}
