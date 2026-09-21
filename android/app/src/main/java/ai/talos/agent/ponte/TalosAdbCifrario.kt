package ai.talos.agent.ponte

import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * ⭐⭐ IL CIFRARIO DELL'ACCOPPIAMENTO — HKDF e AES-128-GCM come li vuole `adbd`.
 *
 * ## Dove sta, nel percorso
 *
 * Finita la stretta SPAKE2 le due parti hanno 64 byte di chiave condivisa. Da
 * lì si ricava una chiave AES da 16 byte, e con quella si scambiano i
 * certificati: è l'ultimo passo dell'accoppiamento, quello che fa entrare la
 * nostra chiave pubblica fra quelle che il telefono si fida.
 *
 * ## ⛔ Le tre cose che si sbagliano
 *
 * 1. **`info` non porta lo zero finale.** In C è `uint8_t info[] = "..."` e poi
 *    `sizeof(info) - 1`: cioè i caratteri **senza** il terminatore. Chi copia la
 *    stringa da C e ne prende `sizeof` intero deriva una chiave diversa, e
 *    l'unico sintomo è che il messaggio non si decifra.
 * 2. **Il sale è ASSENTE, non vuoto di lunghezza zero.** In HKDF un sale
 *    mancante vale come una sequenza di zeri lunga quanto l'hash. Passare un
 *    array vuoto a una implementazione che non lo tratta così dà un altro
 *    risultato.
 * 3. **Il nonce porta il CONTATORE, little-endian, nei primi otto byte** dei
 *    dodici, e il resto a zero. E ci sono **due contatori distinti**, uno per
 *    quello che spediamo e uno per quello che riceviamo: usarne uno solo
 *    funziona per il primo messaggio e poi smette, che è il modo peggiore di
 *    rompersi.
 *
 * ⭐ A differenza di SPAKE2, qui una prova vera esiste: **RFC 5869 pubblica i
 * valori attesi di HKDF**. Quel pezzo si verifica senza telefono.
 */
internal class TalosAdbCifrario(chiaveCondivisa: ByteArray) {

    private val chiave: SecretKeySpec = SecretKeySpec(
        hkdf(chiaveCondivisa, INFO, LUNGHEZZA_CHIAVE),
        "AES",
    )

    /** Quanti messaggi abbiamo spedito, e quanti ne abbiamo ricevuti. Separati. */
    private var spediti = 0L
    private var ricevuti = 0L

    fun cifra(chiaro: ByteArray): ByteArray {
        val fuori = Cipher.getInstance("AES/GCM/NoPadding").run {
            init(Cipher.ENCRYPT_MODE, chiave, GCMParameterSpec(TAG_BIT, nonce(spediti)))
            doFinal(chiaro)
        }
        spediti++
        return fuori
    }

    /** `null` se il messaggio non è autentico: un esito, non un guasto. */
    fun decifra(cifrato: ByteArray): ByteArray? {
        val fuori = runCatching {
            Cipher.getInstance("AES/GCM/NoPadding").run {
                init(Cipher.DECRYPT_MODE, chiave, GCMParameterSpec(TAG_BIT, nonce(ricevuti)))
                doFinal(cifrato)
            }
        }.getOrNull() ?: return null
        ricevuti++
        return fuori
    }

    /** Dodici byte: il contatore little-endian davanti, il resto a zero. */
    private fun nonce(sequenza: Long): ByteArray =
        ByteBuffer.allocate(NONCE).order(ByteOrder.LITTLE_ENDIAN)
            .putLong(sequenza).array()

    companion object {
        /** AES-128: sedici byte. */
        const val LUNGHEZZA_CHIAVE = 16

        /** Il nonce di GCM: dodici byte. */
        const val NONCE = 12

        /** L'etichetta di GCM: sedici byte, cioè 128 bit. */
        const val TAG_BIT = 128

        /**
         * ⛔ SENZA lo zero finale. In C è `sizeof(info) - 1`, e quel `-1` è
         * esattamente la differenza fra una chiave giusta e una sbagliata.
         */
        val INFO = "adb pairing_auth aes-128-gcm key".toByteArray(Charsets.US_ASCII)

        /**
         * HKDF-SHA256, come RFC 5869: prima si estrae, poi si espande.
         *
         * ⛔ Senza sale significa **una sequenza di zeri lunga quanto l'hash**,
         * non un array vuoto. È scritto nella specifica e si dimentica sempre.
         */
        fun hkdf(materiale: ByteArray, info: ByteArray, quanti: Int): ByteArray {
            val mac = Mac.getInstance("HmacSHA256")
            val lunghezzaHash = mac.macLength

            // Estrazione: la pseudo-chiave.
            mac.init(SecretKeySpec(ByteArray(lunghezzaHash), "HmacSHA256"))
            val pseudo = mac.doFinal(materiale)

            // Espansione: blocchi concatenati, ognuno numerato da uno in poi.
            val fuori = ByteArray(quanti)
            var precedente = ByteArray(0)
            var scritti = 0
            var contatore = 1
            while (scritti < quanti) {
                mac.init(SecretKeySpec(pseudo, "HmacSHA256"))
                mac.update(precedente)
                mac.update(info)
                mac.update(contatore.toByte())
                precedente = mac.doFinal()
                val quanti0 = minOf(precedente.size, quanti - scritti)
                System.arraycopy(precedente, 0, fuori, scritti, quanti0)
                scritti += quanti0
                contatore++
            }
            return fuori
        }
    }
}
