package ai.talos

import ai.talos.agent.ponte.TalosEd25519
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger

/**
 * ⭐⭐⭐ Il gruppo Ed25519, provato con le proprietà che DEVONO valere.
 *
 * ⛔ Il punto di queste prove: la crittografia sbagliata **funziona lo stesso**.
 * Produce numeri, li scrive, li rilegge, non lancia niente. Fallisce solo alla
 * fine, contro l'altro capo, con un messaggio che non assomiglia alla causa.
 *
 * Le proprietà qui sotto sono l'unico modo di accorgersene prima: sono vere per
 * la curva vera e false per qualunque sua imitazione.
 */
class TalosEd25519Test {

    /** Il punto base, come lo scrive RFC 8032. È una costante pubblica e nota. */
    private val BASE_ATTESA = "5866666666666666666666666666666666666666666666666666666666666666"

    private fun esa(byte: ByteArray) = byte.joinToString("") { "%02x".format(it) }

    private fun daEsa(testo: String) = ByteArray(testo.length / 2) {
        testo.substring(it * 2, it * 2 + 2).toInt(16).toByte()
    }

    /**
     * ⭐ LA PROVA PIÙ FORTE che si possa fare senza l'altro capo: il nostro punto
     * base, codificato, deve dare **esattamente** la costante pubblicata.
     *
     * Ci passano dentro: il valore di `d`, il recupero di `x` da `y`, la scelta
     * della parità, l'ordine dei byte e il bit del segno. Se uno solo di questi
     * fosse sbagliato, questa stringa non tornerebbe.
     */
    @Test
    fun `il punto base codificato e la costante di RFC 8032`() {
        assertEquals(BASE_ATTESA, esa(TalosEd25519.scrivi(TalosEd25519.BASE)))
    }

    @Test
    fun `il punto base sta sulla curva, e il neutro anche`() {
        assertTrue(TalosEd25519.sullaCurva(TalosEd25519.BASE))
        assertTrue(TalosEd25519.sullaCurva(TalosEd25519.NEUTRO))
        assertTrue(TalosEd25519.NEUTRO.neutro())
    }

    /**
     * ⭐ La proprietà che definisce l'ordine del gruppo: `L` volte il punto base
     * torna al neutro. È il controllo che smaschera una costante `L` sbagliata,
     * una somma sbagliata e una moltiplicazione sbagliata, tutte insieme.
     */
    @Test
    fun `L volte il punto base torna al NEUTRO`() {
        assertTrue(TalosEd25519.per(TalosEd25519.L, TalosEd25519.BASE).neutro())
    }

    /** E `L+1` volte torna al punto base: il giro si chiude davvero. */
    @Test
    fun `L piu uno volte il punto base e di nuovo il punto base`() {
        assertEquals(
            TalosEd25519.BASE,
            TalosEd25519.per(TalosEd25519.L.add(BigInteger.ONE), TalosEd25519.BASE),
        )
    }

    @Test
    fun `zero volte un punto e il neutro, una volta e se stesso`() {
        assertTrue(TalosEd25519.per(BigInteger.ZERO, TalosEd25519.BASE).neutro())
        assertEquals(TalosEd25519.BASE, TalosEd25519.per(BigInteger.ONE, TalosEd25519.BASE))
    }

    /** La somma è commutativa e il neutro è neutro davvero. */
    @Test
    fun `la somma si comporta da somma`() {
        val a = TalosEd25519.per(BigInteger.valueOf(7), TalosEd25519.BASE)
        val b = TalosEd25519.per(BigInteger.valueOf(11), TalosEd25519.BASE)

        assertEquals(TalosEd25519.somma(a, b), TalosEd25519.somma(b, a))
        assertEquals(a, TalosEd25519.somma(a, TalosEd25519.NEUTRO))
        // 7B + 11B = 18B
        assertEquals(
            TalosEd25519.per(BigInteger.valueOf(18), TalosEd25519.BASE),
            TalosEd25519.somma(a, b),
        )
        // E il raddoppio è un caso della stessa formula, non un caso speciale.
        assertEquals(
            TalosEd25519.per(BigInteger.valueOf(14), TalosEd25519.BASE),
            TalosEd25519.somma(a, a),
        )
    }

    /** Distributività: `(m+n)·B = m·B + n·B`, su numeri grandi a caso. */
    @Test
    fun `moltiplicare e sommare vanno d accordo`() {
        val m = BigInteger("48291039481029348102934810293481029348102934")
        val n = BigInteger("77712345678901234567890123456789012345678901")

        assertEquals(
            TalosEd25519.per(m.add(n), TalosEd25519.BASE),
            TalosEd25519.somma(
                TalosEd25519.per(m, TalosEd25519.BASE),
                TalosEd25519.per(n, TalosEd25519.BASE),
            ),
        )
    }

    /**
     * ⛔ IL BIT DEL SEGNO. Un punto si scrive come la sola `y`, e la parità di
     * `x` sta nel bit più alto. Dimenticarlo dà un punto che si rilegge
     * benissimo — ed è lo SPECCHIO di quello scritto.
     */
    @Test
    fun `scritto e riletto e lo stesso punto, specchio incluso`() {
        for (k in listOf(1L, 2L, 3L, 255L, 65537L, 123456789L)) {
            val punto = TalosEd25519.per(BigInteger.valueOf(k), TalosEd25519.BASE)
            val riletto = TalosEd25519.leggi(TalosEd25519.scrivi(punto))
            assertEquals("k=$k", punto, riletto)
            assertTrue(TalosEd25519.sullaCurva(riletto!!))
        }
    }

    /** Lo specchio esiste, ha la stessa `y`, e NON è lo stesso punto. */
    @Test
    fun `lo specchio ha la stessa y e una x diversa`() {
        val punto = TalosEd25519.per(BigInteger.valueOf(9), TalosEd25519.BASE)
        val byte = TalosEd25519.scrivi(punto)
        byte[31] = (byte[31].toInt() xor 0x80).toByte()

        val specchio = TalosEd25519.leggi(byte)!!
        assertEquals(punto.y, specchio.y)
        assertNotEquals(punto.x, specchio.x)
        assertEquals(TalosEd25519.P, punto.x.add(specchio.x))
        assertTrue(TalosEd25519.sullaCurva(specchio))
    }

    /**
     * ⛔ LA RADICE CHE NON ESISTE. La maggior parte delle sequenze di 32 byte non
     * è un punto. Decodificarle senza controllare significa proseguire con un
     * valore fuori dal gruppo, e ogni conto dopo è spazzatura silenziosa.
     */
    @Test
    fun `dei byte qualunque NON sono un punto, e si dice`() {
        var rifiutati = 0
        for (seme in 0 until 40) {
            val byte = ByteArray(32) { ((seme * 31 + it * 7) and 0xFF).toByte() }
            byte[31] = (byte[31].toInt() and 0x7F).toByte()
            if (TalosEd25519.leggi(byte) == null) rifiutati++
        }
        // Circa la metà dei valori non sta sulla curva: se fossero zero, il
        // controllo della radice non starebbe funzionando.
        assertTrue("rifiutati=$rifiutati su 40", rifiutati > 5)
    }

    /** Una `y` oltre il campo non è un punto, e non va ridotta in silenzio. */
    @Test
    fun `una y fuori dal campo e rifiutata invece di essere ridotta`() {
        val byte = ByteArray(32) { 0xFF.toByte() }
        byte[31] = 0x7F
        assertNull(TalosEd25519.leggi(byte))
        assertNull(TalosEd25519.leggi(ByteArray(31)))
        assertNull(TalosEd25519.leggi(ByteArray(33)))
    }

    /** Le costanti del campo e della curva, per numero. */
    @Test
    fun `le costanti sono quelle della curva vera`() {
        assertEquals(
            BigInteger("57896044618658097711785492504343953926634992332820282019728792003956564819949"),
            TalosEd25519.P,
        )
        assertEquals(
            BigInteger("7237005577332262213973186563042994240857116359379907606001950938285454250989"),
            TalosEd25519.L,
        )
        // d = -121665/121666 mod p, il valore pubblicato.
        assertEquals(
            BigInteger("37095705934669439343138083508754565189542113879843219016388785533085940283555"),
            TalosEd25519.D,
        )
        // sqrt(-1) al quadrato fa -1.
        assertEquals(
            TalosEd25519.P.subtract(BigInteger.ONE),
            TalosEd25519.I.multiply(TalosEd25519.I).mod(TalosEd25519.P),
        )
    }

    /** Il punto base riletto dalla sua costante pubblicata è il nostro. */
    @Test
    fun `la costante pubblicata si rilegge nel nostro punto base`() {
        assertEquals(TalosEd25519.BASE, TalosEd25519.leggi(daEsa(BASE_ATTESA)))
    }

    /** Un punto di ordine piccolo non è il neutro ma L volte lo diventa. */
    @Test
    fun `un multiplo qualunque resta sulla curva`() {
        val punto = TalosEd25519.per(BigInteger("999999999999999999999"), TalosEd25519.BASE)
        assertTrue(TalosEd25519.sullaCurva(punto))
        assertFalse(punto.neutro())
        assertArrayEquals(
            TalosEd25519.scrivi(punto),
            TalosEd25519.scrivi(TalosEd25519.leggi(TalosEd25519.scrivi(punto))!!),
        )
    }
}
