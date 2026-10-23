package ai.talos.aggiornamenti

import com.google.crypto.tink.subtle.Ed25519Verify
import java.util.Base64

/**
 * La firma Ed25519 del manifesto dell'aggiornamento (owner 22/10/2026: chiave SEPARATA da quella del desktop).
 *
 * La verifica è Tink (`subtle.Ed25519Verify`, RFC 8032, già nell'app con tink-android 1.8.0): non la scriviamo noi.
 * `TalosEd25519` del ponte resta lì, per i suoi conti lenti di gruppo.
 *
 * Come il desktop (`firma-aggiornamenti.mjs:66-76`) non lancia mai: un manifesto che non si riesce a verificare, per qualunque
 * motivo, è un manifesto NON verificato.
 */
object TalosFirmaAggiornamento {

    /** DER di una SubjectPublicKeyInfo Ed25519 (RFC 8410): questi 12 byte, poi i 32 della chiave. */
    private val PREFISSO_SPKI = byteArrayOf(
        0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
    )

    fun verifica(manifesto: ByteArray, firmaBase64: String, pubblicaPem: String): Boolean = try {
        val chiave = chiaveDa(pubblicaPem)
        val firma = Base64.getDecoder().decode(firmaBase64.trim())
        if (chiave == null || firma.size != 64) {
            false
        } else {
            Ed25519Verify(chiave).verify(firma, manifesto)
            true
        }
    } catch (ignorata: Exception) {
        false
    }

    /** I 32 byte della chiave, o null se il PEM non è una chiave pubblica Ed25519. */
    internal fun chiaveDa(pem: String): ByteArray? {
        val corpo = pem.trim()
        if (!corpo.startsWith("-----BEGIN PUBLIC KEY-----") || !corpo.endsWith("-----END PUBLIC KEY-----")) return null
        val der = Base64.getMimeDecoder().decode(
            corpo.removePrefix("-----BEGIN PUBLIC KEY-----").removeSuffix("-----END PUBLIC KEY-----"),
        )
        if (der.size != PREFISSO_SPKI.size + 32) return null
        for (i in PREFISSO_SPKI.indices) if (der[i] != PREFISSO_SPKI[i]) return null
        return der.copyOfRange(PREFISSO_SPKI.size, der.size)
    }
}
