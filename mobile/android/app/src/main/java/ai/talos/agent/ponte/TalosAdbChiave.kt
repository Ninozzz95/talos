package ai.talos.agent.ponte

import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyPair
import java.security.Signature
import java.security.interfaces.RSAPrivateKey
import java.security.interfaces.RSAPublicKey
import java.util.Base64

/**
 * ⭐⭐ LA CHIAVE — l'identità del ponte, nel formato che `adbd` pretende.
 *
 * ## Perché non basta «la chiave pubblica»
 *
 * `adbd` non legge una chiave RSA in nessuno dei formati normali. Vuole una
 * struttura sua, di **524 byte esatti**, pensata per essere usata da un
 * bootloader senza libreria di grandi numeri:
 *
 * ```c
 *   uint32_t modulus_size_words;   // 64, cioè 2048 bit / 32
 *   uint32_t n0inv;                // -1 / n[0]  (mod 2^32)
 *   uint8_t  modulus[256];         // little-endian
 *   uint8_t  rr[256];              // R^2 mod n, little-endian, con R = 2^2048
 *   uint32_t exponent;             // 3 oppure 65537
 * ```
 *
 * ⛔ I due campi che quasi tutte le implementazioni sbagliano sono `n0inv` e
 * `rr`, e li sbagliano in silenzio: la chiave viene accettata come stringa,
 * spedita, e il telefono **non risponde**. Non c'è un messaggio d'errore che
 * dica «la tua aritmetica di Montgomery è sbagliata».
 *
 * - `n0inv` è l'inverso NEGATO della prima parola del modulo, modulo 2^32. Non
 *   l'inverso: il negato dell'inverso.
 * - `rr` è `R^2 mod n` con `R = 2^2048`, non `2^256` né la dimensione in byte.
 *
 * ⛔ E il **verso dei byte**: modulo e `rr` si scrivono little-endian, mentre
 * `BigInteger` in Java lavora big-endian. Un'implementazione che dimentica di
 * rovesciarli produce anche lei una chiave che il telefono ignora.
 *
 * Sono tutte cose che si provano qui, con dell'aritmetica, senza un telefono.
 */
internal object TalosAdbChiave {

    /** 2048 bit, i soli che `adbd` accetta oggi. */
    const val BIT = 2048
    private const val PAROLE = BIT / 32
    private const val BYTE_MODULO = BIT / 8

    /** `4 + 4 + 256 + 256 + 4`. Se non torna, non è la struttura giusta. */
    const val STRUTTURA = 4 + 4 + BYTE_MODULO + BYTE_MODULO + 4

    /**
     * L'intestazione ASN.1 di un digest SHA-1, quella che `adb` mette davanti al
     * gettone prima di firmarlo.
     *
     * ⛔ `adbd` verifica con `RSA_verify(NID_sha1, …)`, che si aspetta di trovare
     * questi 15 byte davanti ai 20 del gettone dentro il riempimento PKCS#1.
     * Firmare il gettone nudo produce una firma valida come matematica e
     * **rifiutata** come autenticazione — di nuovo senza un messaggio che lo
     * spieghi.
     */
    val PREFISSO_SHA1 = byteArrayOf(
        0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e,
        0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14,
    )

    /**
     * La chiave pubblica nel formato di `adbd`: i 524 byte, in base64, e un nome.
     *
     * Il nome dopo lo spazio è quello che il telefono mostra nella richiesta
     * «consentire il debug da questo dispositivo?». ⇒ Ci si scrive chi siamo,
     * perché è l'unica cosa che la persona vedrà per decidere.
     */
    fun pubblicaPerAdb(pubblica: RSAPublicKey, nome: String): ByteArray {
        val base = Base64.getEncoder().encodeToString(struttura(pubblica))
        // ⛔ Lo ZERO finale non è un dettaglio: `adbd` legge questo carico come
        // una stringa C. Senza terminatore continua a leggere oltre, e il nome
        // che mostra alla persona diventa quello più quel che c'era dopo.
        // Scritto come sequenza di fuga e non come byte battuto dentro il
        // sorgente sarebbe invisibile a chi rilegge, e cancellabile per sbaglio.
        return "$base $nome\u0000".toByteArray(Charsets.UTF_8)
    }

    /** I 524 byte, senza base64 e senza nome. Separata per poterla provare. */
    fun struttura(pubblica: RSAPublicKey): ByteArray {
        val n = pubblica.modulus
        require(n.bitLength() == BIT) { "il modulo deve essere di $BIT bit" }

        // n0inv = -(n^-1) mod 2^32, calcolato sulla PRIMA PAROLA del modulo.
        val dueAl32 = BigInteger.ONE.shiftLeft(32)
        val n0inv = dueAl32.subtract(n.mod(dueAl32).modInverse(dueAl32))

        // R = 2^2048 (la dimensione in BIT del modulo), rr = R^2 mod n.
        val rr = BigInteger.ONE.shiftLeft(BIT * 2).mod(n)

        return ByteBuffer.allocate(STRUTTURA).order(ByteOrder.LITTLE_ENDIAN).apply {
            putInt(PAROLE)
            putInt(n0inv.toInt())
            put(aLittleEndian(n))
            put(aLittleEndian(rr))
            putInt(pubblica.publicExponent.toInt())
        }.array()
    }

    /**
     * Firma il gettone della sfida `AUTH`.
     *
     * `NONEwithRSA` è voluto: il riempimento PKCS#1 lo mette Java, il prefisso
     * del digest lo mettiamo noi. Usare `SHA1withRSA` farebbe calcolare a Java
     * lo SHA-1 **del gettone**, mentre il gettone È già un digest.
     */
    fun firma(privata: RSAPrivateKey, gettone: ByteArray): ByteArray =
        Signature.getInstance("NONEwithRSA").run {
            initSign(privata)
            update(PREFISSO_SHA1)
            update(gettone)
            sign()
        }

    /** Il controllo speculare, per poter provare la firma senza un telefono. */
    fun firmaValida(pubblica: RSAPublicKey, gettone: ByteArray, firma: ByteArray): Boolean =
        Signature.getInstance("NONEwithRSA").run {
            initVerify(pubblica)
            update(PREFISSO_SHA1)
            update(gettone)
            runCatching { verify(firma) }.getOrDefault(false)
        }

    /**
     * Un numero in `BYTE_MODULO` byte, little-endian.
     *
     * ⛔ `BigInteger.toByteArray()` è big-endian e può avere uno zero davanti
     * (il segno) oppure essere più corto del dovuto. Vanno gestiti tutti e due i
     * casi: tagliare senza guardare perde il byte più significativo, e non
     * riempire lascia in coda spazzatura che cambia il numero.
     */
    private fun aLittleEndian(valore: BigInteger): ByteArray {
        val grande = valore.toByteArray()
        val utile = if (grande.size > BYTE_MODULO) {
            grande.copyOfRange(grande.size - BYTE_MODULO, grande.size)
        } else {
            ByteArray(BYTE_MODULO - grande.size) + grande
        }
        val piccolo = ByteArray(BYTE_MODULO)
        for (i in 0 until BYTE_MODULO) piccolo[i] = utile[BYTE_MODULO - 1 - i]
        return piccolo
    }

    /** Comodità per le prove e per chi genera la coppia. */
    fun pubblicaDi(coppia: KeyPair): RSAPublicKey = coppia.public as RSAPublicKey

    fun privataDi(coppia: KeyPair): RSAPrivateKey = coppia.private as RSAPrivateKey
}
