package ai.talos.voice

import android.content.Context
import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import org.json.JSONObject

/**
 * Blueprint §7.1: `filesDir/voice/profiles/<uuid>.tvp` - internal app
 * storage, not external/shared storage, and `allowBackup="false"` already
 * keeps it out of backup/export flows (verified: manifest-level, not
 * per-file - this store adds nothing new to export by construction, it
 * just does not opt back in).
 *
 * File framing is a small header this store owns (nonce length, nonce,
 * ciphertext) around the AEAD envelope [TalosVoiceProfileCipher] produces -
 * the ciphertext itself is opaque; only [TalosVoiceProfileV1.toJson]'s
 * plaintext has structure, and that never touches disk unencrypted.
 */
internal class TalosVoiceProfileStore(private val context: Context) {

    private val profilesDir: File
        get() = File(context.filesDir, "voice/profiles").apply { mkdirs() }

    /** §6.4: fsync before the atomic rename - a crash between write and rename must never leave a half-written file at the real path. */
    fun save(profile: TalosVoiceProfileV1) {
        val plaintext = profile.toJson().toString().toByteArray(Charsets.UTF_8)
        val sealed = TalosVoiceProfileCipher.encrypt(profile.header.profileId, plaintext)
        val target = fileFor(profile.header.profileId)
        val tmp = File(target.parentFile, "${target.name}.tmp")

        FileOutputStream(tmp).use { out ->
            DataOutputStream(out).apply {
                writeInt(sealed.nonce.size)
                write(sealed.nonce)
                write(sealed.ciphertext)
                flush()
            }
            out.fd.sync()
        }
        if (!tmp.renameTo(target)) {
            tmp.delete()
            error("Failed to atomically commit profile file: ${target.absolutePath}")
        }
    }

    fun load(profileId: String): TalosVoiceProfileV1 {
        val file = fileFor(profileId)
        require(file.isFile) { "No profile file for $profileId: ${file.absolutePath}" }
        val bytes = file.readBytes()
        val input = DataInputStream(ByteArrayInputStream(bytes))
        val nonceLength = input.readInt()
        require(nonceLength in 1..64) { "Corrupted profile file (implausible nonce length $nonceLength): ${file.absolutePath}" }
        val nonce = ByteArray(nonceLength).also { input.readFully(it) }
        val ciphertext = ByteArray(bytes.size - 4 - nonceLength).also { input.readFully(it) }
        val plaintext = TalosVoiceProfileCipher.decrypt(profileId, TalosVoiceCiphertext(nonce, ciphertext))
        return TalosVoiceProfileV1.fromJson(JSONObject(String(plaintext, Charsets.UTF_8)))
    }

    fun exists(profileId: String): Boolean = fileFor(profileId).isFile

    fun list(): List<String> = profilesDir.listFiles { file -> file.extension == "tvp" }
        ?.map { it.nameWithoutExtension }
        ?: emptyList()

    /** §7.2: delete = delete file + delete the Keystore alias - cryptographic erasure, both halves, every time. */
    fun delete(profileId: String) {
        fileFor(profileId).delete()
        TalosVoiceProfileCipher.deleteKey(profileId)
    }

    fun rename(profileId: String, newDisplayName: String) {
        val profile = load(profileId)
        save(profile.copy(header = profile.header.copy(displayName = newDisplayName)))
    }

    private fun fileFor(profileId: String) = File(profilesDir, "$profileId.tvp")
}
