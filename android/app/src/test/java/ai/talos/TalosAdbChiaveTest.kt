package ai.talos

import ai.talos.agent.ponte.TalosAdbChiave
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.util.Base64

/**
 * ⭐⭐ La chiave del ponte, provata con l'ARITMETICA invece che con un telefono.
 *
 * ⛔ Il punto di queste prove: `adbd`, davanti a una chiave sbagliata, **non
 * risponde e basta**. Non dice «il tuo n0inv è sbagliato». Ogni regola qui sotto
 * è una di quelle che, sbagliata, dà un ponte muto senza un indizio.
 */
class TalosAdbChiaveTest {

    companion object {
        private lateinit var coppia: KeyPair

        @BeforeClass
        @JvmStatic
        fun generaUnaVolta() {
            // Deterministico dove si può; la generazione RSA resta cara, quindi
            // una sola coppia per tutta la classe.
            coppia = KeyPairGenerator.getInstance("RSA").apply {
                initialize(TalosAdbChiave.BIT, SecureRandom())
            }.generateKeyPair()
        }
    }

    private val pubblica get() = TalosAdbChiave.pubblicaDi(coppia)
    private val privata get() = TalosAdbChiave.privataDi(coppia)

    private fun parola(dati: ByteArray, offset: Int): Int =
        ByteBuffer.wrap(dati).order(ByteOrder.LITTLE_ENDIAN).getInt(offset)

    private fun daLittleEndian(dati: ByteArray, offset: Int, quanti: Int): BigInteger =
        BigInteger(1, ByteArray(quanti) { dati[offset + quanti - 1 - it] })

    @Test
    fun `la struttura e lunga esattamente 524 byte`() {
        assertEquals(524, TalosAdbChiave.STRUTTURA)
        assertEquals(524, TalosAdbChiave.struttura(pubblica).size)
    }

    @Test
    fun `dichiara 64 parole e l esponente vero`() {
        val s = TalosAdbChiave.struttura(pubblica)
        assertEquals(64, parola(s, 0))
        assertEquals(65537, parola(s, 4 + 4 + 256 + 256))
        assertEquals(BigInteger.valueOf(65537), pubblica.publicExponent)
    }

    /**
     * ⛔ IL PRIMO CAMPO SBAGLIATO DA TUTTI. `n0inv` è l'inverso **negato** della
     * prima parola del modulo, modulo 2^32. La proprietà che deve valere:
     *
     *     n[0] * n0inv ≡ -1  (mod 2^32)
     *
     * Chi mette l'inverso senza negarlo passa ogni controllo di forma e ottiene
     * un telefono che non risponde.
     */
    @Test
    fun `n0inv soddisfa n0 per n0inv congruo a meno uno`() {
        val s = TalosAdbChiave.struttura(pubblica)
        val n0inv = BigInteger.valueOf(parola(s, 4).toLong() and 0xFFFFFFFFL)
        val dueAl32 = BigInteger.ONE.shiftLeft(32)
        val n0 = pubblica.modulus.mod(dueAl32)

        assertEquals(dueAl32.subtract(BigInteger.ONE), n0.multiply(n0inv).mod(dueAl32))
    }

    /**
     * ⛔ IL SECONDO. `rr` è `R^2 mod n` con **R = 2^2048** — la dimensione in
     * BIT del modulo. Chi usa 2^256 (i byte) produce un numero plausibile e
     * inservibile.
     */
    @Test
    fun `rr e R al quadrato modulo n, con R uguale a due alla 2048`() {
        val s = TalosAdbChiave.struttura(pubblica)
        val rr = daLittleEndian(s, 4 + 4 + 256, 256)

        assertEquals(BigInteger.ONE.shiftLeft(4096).mod(pubblica.modulus), rr)
        // E per essere espliciti su cosa NON è:
        assertFalse(rr == BigInteger.ONE.shiftLeft(512).mod(pubblica.modulus))
    }

    /**
     * ⛔ IL TERZO: il verso dei byte. `BigInteger` è big-endian, `adbd` vuole
     * little-endian. Rileggendo al contrario deve tornare il modulo esatto.
     */
    @Test
    fun `il modulo e scritto little-endian`() {
        val s = TalosAdbChiave.struttura(pubblica)
        assertEquals(pubblica.modulus, daLittleEndian(s, 8, 256))

        // E letto nel verso sbagliato NON torna: la prova che il verso conta.
        val alContrario = BigInteger(1, ByteArray(256) { s[8 + it] })
        assertFalse(pubblica.modulus == alContrario)
    }

    /**
     * ⛔ IL QUINTO, e si vede solo sul telefono: il carico finisce con uno ZERO.
     * `adbd` lo legge come una stringa C. Senza terminatore continua a leggere
     * oltre, e il nome che mostra alla persona nella richiesta «consentire il
     * debug?» diventa il nostro più quello che c'era dopo in memoria.
     */
    @Test
    fun `la riga per adbd e base64, il nostro nome, e uno ZERO finale`() {
        val byte = TalosAdbChiave.pubblicaPerAdb(pubblica, "talos@pad")

        assertEquals(0.toByte(), byte[byte.size - 1])

        val riga = String(byte, 0, byte.size - 1, Charsets.UTF_8)
        val pezzi = riga.split(" ")
        assertEquals(2, pezzi.size)
        assertEquals("talos@pad", pezzi[1])
        assertEquals(524, Base64.getDecoder().decode(pezzi[0]).size)
    }

    /**
     * ⛔ IL QUARTO, e il più insidioso: il gettone **è già un digest**. `adbd`
     * verifica con `RSA_verify(NID_sha1, …)`, che cerca i 15 byte di
     * intestazione ASN.1 davanti ai 20 del gettone dentro il riempimento.
     *
     * Firmare con `SHA1withRSA` farebbe calcolare a Java lo SHA-1 DEL GETTONE:
     * una firma matematicamente valida e rifiutata come autenticazione.
     */
    @Test
    fun `la firma mette il prefisso ASN1 davanti al gettone`() {
        val gettone = ByteArray(20) { (it * 11).toByte() }
        val firma = TalosAdbChiave.firma(privata, gettone)

        assertEquals(256, firma.size)
        assertTrue(TalosAdbChiave.firmaValida(pubblica, gettone, firma))

        // Un gettone diverso non passa: la firma è legata a QUELLA sfida.
        assertFalse(TalosAdbChiave.firmaValida(pubblica, ByteArray(20), firma))
    }

    /** Il prefisso è quello dello SHA-1, byte per byte. */
    @Test
    fun `il prefisso ASN1 e quello dello SHA-1`() {
        assertEquals(15, TalosAdbChiave.PREFISSO_SHA1.size)
        assertEquals(0x30.toByte(), TalosAdbChiave.PREFISSO_SHA1[0])
        assertEquals(0x21.toByte(), TalosAdbChiave.PREFISSO_SHA1[1])
        assertEquals(0x14.toByte(), TalosAdbChiave.PREFISSO_SHA1[14])
    }
}
