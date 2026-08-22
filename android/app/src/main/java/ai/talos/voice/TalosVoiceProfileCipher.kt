package ai.talos.voice

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Blueprint §7.2: one AES-256-GCM key per profile, generated inside Android
 * Keystore (hardware-backed where the device supports it - never exported,
 * never in application memory as raw key material), alias
 * `talos.voice.profile.v1.<uuid>`. Deleting a profile deletes the Keystore
 * alias too - "cryptographic erasure": the ciphertext left on disk is
 * useless the moment its unique key is gone, whether or not the filesystem
 * bytes themselves are ever overwritten.
 */
internal object TalosVoiceProfileCipher {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val GCM_TAG_BITS = 128
    private const val KEY_SIZE_BITS = 256

    fun aliasFor(profileId: String): String = "talos.voice.profile.v1.$profileId"

    /** Generates the profile's key if it does not already exist - idempotent, safe to call before every encrypt. */
    fun ensureKey(profileId: String) {
        val alias = aliasFor(profileId)
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        if (keyStore.containsAlias(alias)) return

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(KEY_SIZE_BITS)
            .setRandomizedEncryptionRequired(true)
            .build()
        generator.init(spec)
        generator.generateKey()
    }

    /** Random 96-bit (12-byte) nonce per write, as GCM requires and §7.2 asks for explicitly - `cipher.iv` after init, never reused. */
    fun encrypt(profileId: String, plaintext: ByteArray): TalosVoiceCiphertext {
        ensureKey(profileId)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, loadKey(profileId))
        val nonce = cipher.iv
        val ciphertext = cipher.doFinal(plaintext)
        return TalosVoiceCiphertext(nonce = nonce, ciphertext = ciphertext)
    }

    fun decrypt(profileId: String, sealed: TalosVoiceCiphertext): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, loadKey(profileId), GCMParameterSpec(GCM_TAG_BITS, sealed.nonce))
        return cipher.doFinal(sealed.ciphertext)
    }

    /** File + Keystore alias both gone is the caller's job (`TalosVoiceProfileStore`) - this only ever removes the key half. */
    fun deleteKey(profileId: String) {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val alias = aliasFor(profileId)
        if (keyStore.containsAlias(alias)) {
            keyStore.deleteEntry(alias)
        }
    }

    fun hasKey(profileId: String): Boolean {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        return keyStore.containsAlias(aliasFor(profileId))
    }

    private fun loadKey(profileId: String): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val alias = aliasFor(profileId)
        val entry = keyStore.getEntry(alias, null) as? KeyStore.SecretKeyEntry
            ?: error("No Keystore key for profile $profileId (alias=$alias) - was it deleted, or never created?")
        return entry.secretKey
    }
}

internal data class TalosVoiceCiphertext(val nonce: ByteArray, val ciphertext: ByteArray)
