package ai.talos.terminal

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * K2-B, parte B1 (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`): la chiave dati del portachiavi di r4
 * (`portachiavi-android.mjs`, K2-C). Nasce casuale una volta, 32 byte. Si custodisce sigillata AES-256-GCM con una chiave
 * dell'archivio sicuro di Android, non esportabile (stesso schema di `TalosVoiceProfileCipher`). Arriva al server SOLO dallo
 * stdin (owner 14/10, «Dallo stdin»): nell'ambiente resterebbe in `/proc/<pid>/environ`, leggibile dai comandi del Codice.
 */
object TalosChiaveDatiR4 {
    const val ALIAS = "talos.r4.portachiavi.v1"
    private const val MAGIA = "TR4K1"
    const val BYTE_CHIAVE = 32
    private const val BYTE_NONCE = 12
    private const val BYTE_TAG = 16
    private const val KEYSTORE = "AndroidKeyStore"
    private const val TRASFORMAZIONE = "AES/GCM/NoPadding"
    private val AAD = "talos.r4.portachiavi|v1".toByteArray(Charsets.UTF_8)

    enum class Scelta { USA, CREA, PERSA }

    /** Il file sigillato: magia, nonce, chiave cifrata con il suo tag. */
    fun sigilla(nonce: ByteArray, cifrato: ByteArray): ByteArray = MAGIA.toByteArray(Charsets.US_ASCII) + nonce + cifrato

    /** `null` se non è un sigillo di questa versione: mai una chiave a metà. */
    fun apriSigillo(byte: ByteArray): Pair<ByteArray, ByteArray>? {
        val magia = MAGIA.toByteArray(Charsets.US_ASCII)
        if (byte.size != magia.size + BYTE_NONCE + BYTE_CHIAVE + BYTE_TAG) return null
        if (!byte.copyOfRange(0, magia.size).contentEquals(magia)) return null
        val nonce = byte.copyOfRange(magia.size, magia.size + BYTE_NONCE)
        return nonce to byte.copyOfRange(magia.size + BYTE_NONCE, byte.size)
    }

    /**
     * ⛔ Portachiavi presente e chiave assente = PERSA: una chiave nuova renderebbe il portachiavi illeggibile per sempre. Il
     * server non parte e lo dice, invece di ripartire vuoto sopra le chiavi dell'utente.
     */
    fun decidi(sigilloEsiste: Boolean, portachiaviEsiste: Boolean): Scelta = when {
        sigilloEsiste -> Scelta.USA
        portachiaviEsiste -> Scelta.PERSA
        else -> Scelta.CREA
    }

    /** Ciò che si scrive nello stdin del server: base64 standard, un a capo. Lo legge `portachiavi-android.mjs`. */
    fun rigaPerLoStdin(chiave: ByteArray): ByteArray {
        require(chiave.size == BYTE_CHIAVE) { "the data key must be $BYTE_CHIAVE bytes" }
        return (java.util.Base64.getEncoder().encodeToString(chiave) + "\n").toByteArray(Charsets.US_ASCII)
    }

    class ChiavePersa : IllegalStateException(
        "The r4 keychain exists but its data key is gone: refusing to create a new one, which would make it unreadable.",
    )

    /** La chiave dati: aperta dal sigillo, o creata se non c'è niente da leggere. `portachiavi` è il file del modulo JS. */
    fun chiaveDati(sigillo: File, portachiavi: File): ByteArray =
        when (decidi(sigillo.isFile, portachiavi.isFile)) {
            Scelta.USA -> apri(sigillo)
            Scelta.PERSA -> throw ChiavePersa()
            Scelta.CREA -> ByteArray(BYTE_CHIAVE).also { SecureRandom().nextBytes(it); scrivi(sigillo, it) }
        }

    /** Scrive la chiave nello stdin del server, lo chiude, e azzera l'array. */
    fun consegna(processo: Process, chiave: ByteArray) {
        val riga = rigaPerLoStdin(chiave)
        try {
            processo.outputStream.use { it.write(riga); it.flush() }
        } finally {
            riga.fill(0)
            chiave.fill(0)
        }
    }

    private fun apri(sigillo: File): ByteArray {
        val (nonce, cifrato) = apriSigillo(sigillo.readBytes())
            ?: throw IllegalStateException("The r4 data key file is not a v1 seal.")
        val cifra = Cipher.getInstance(TRASFORMAZIONE)
        cifra.init(Cipher.DECRYPT_MODE, chiaveDellArchivio(crea = false), GCMParameterSpec(BYTE_TAG * 8, nonce))
        cifra.updateAAD(AAD)
        return cifra.doFinal(cifrato)
    }

    private fun scrivi(sigillo: File, chiave: ByteArray) {
        val cifra = Cipher.getInstance(TRASFORMAZIONE)
        cifra.init(Cipher.ENCRYPT_MODE, chiaveDellArchivio(crea = true))
        cifra.updateAAD(AAD)
        val cifrato = cifra.doFinal(chiave)
        sigillo.parentFile?.mkdirs()
        val provvisorio = File(sigillo.path + ".tmp")
        provvisorio.outputStream().use { uscita -> uscita.write(sigilla(cifra.iv, cifrato)); uscita.fd.sync() }
        if (!provvisorio.renameTo(sigillo)) { provvisorio.delete(); throw java.io.IOException("rename of the r4 data key failed") }
    }

    private fun chiaveDellArchivio(crea: Boolean): SecretKey {
        val archivio = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        if (!archivio.containsAlias(ALIAS)) {
            if (!crea) throw ChiavePersa()
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).apply {
                init(
                    KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .setRandomizedEncryptionRequired(true)
                        .build(),
                )
                generateKey()
            }
        }
        return (archivio.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: throw ChiavePersa()
    }
}
