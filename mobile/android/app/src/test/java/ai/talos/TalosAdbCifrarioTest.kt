package ai.talos

import ai.talos.agent.ponte.TalosAdbCifrario
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * ⭐⭐ FINALMENTE UNA PROVA CON VALORI NOTI.
 *
 * SPAKE2 non ne ha: AOSP non pubblica vettori, e la loro stessa prova è andata e
 * ritorno — [[andata-ritorno-non-prova-compatibilita]]. HKDF invece **sì**: RFC
 * 5869 pubblica i risultati attesi, quindi questo pezzo si verifica contro il
 * mondo e non contro sé stesso.
 */
class TalosAdbCifrarioTest {

    private fun daEsa(t: String) = ByteArray(t.length / 2) {
        t.substring(it * 2, it * 2 + 2).toInt(16).toByte()
    }

    private fun esa(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    /**
     * ⭐ RFC 5869, Appendice A.3 — «Test with SHA-256 and zero-length salt/info».
     *
     * È il caso NOSTRO: `adbd` chiama HKDF **senza sale**, e senza sale la
     * specifica dice «una sequenza di zeri lunga quanto l'hash» — non un array
     * vuoto. Se lo trattassimo diversamente, questo vettore non tornerebbe.
     */
    @Test
    fun `HKDF senza sale torna col vettore pubblicato di RFC 5869`() {
        val ikm = daEsa("0b".repeat(22))
        val atteso = "8da4e775a563c18f715f802a063c5a31" +
            "b8a11f5c5ee1879ec3454e5f3c738d2d" +
            "9d201395faa4b61a96c8"

        assertEquals(atteso, esa(TalosAdbCifrario.hkdf(ikm, ByteArray(0), 42)))
    }

    /**
     * ⛔ L'ETICHETTA SENZA LO ZERO FINALE. In C è `sizeof(info) - 1`, e quel
     * `-1` è la differenza fra una chiave giusta e una sbagliata: l'unico
     * sintomo sarebbe un messaggio che non si decifra.
     */
    @Test
    fun `l etichetta e la stringa NUDA, senza terminatore`() {
        assertEquals(32, TalosAdbCifrario.INFO.size)
        assertEquals(
            "adb pairing_auth aes-128-gcm key",
            String(TalosAdbCifrario.INFO, Charsets.US_ASCII),
        )
        assertFalse(TalosAdbCifrario.INFO.any { it == 0.toByte() })

        // E cambia davvero il risultato: con lo zero in coda la chiave e' altra.
        val materiale = ByteArray(64) { it.toByte() }
        assertFalse(
            TalosAdbCifrario.hkdf(materiale, TalosAdbCifrario.INFO, 16)
                .contentEquals(
                    TalosAdbCifrario.hkdf(materiale, TalosAdbCifrario.INFO + 0, 16),
                ),
        )
    }

    @Test
    fun `la chiave AES e di sedici byte, e il nonce di dodici`() {
        assertEquals(16, TalosAdbCifrario.LUNGHEZZA_CHIAVE)
        assertEquals(12, TalosAdbCifrario.NONCE)
        assertEquals(128, TalosAdbCifrario.TAG_BIT)
    }

    @Test
    fun `cifrato e decifrato torna il testo di partenza`() {
        val materiale = ByteArray(64) { (it * 3).toByte() }
        val chi = TalosAdbCifrario(materiale)
        val chiRiceve = TalosAdbCifrario(materiale)

        val chiaro = "la nostra chiave pubblica".toByteArray()
        assertArrayEquals(chiaro, chiRiceve.decifra(chi.cifra(chiaro)))
    }

    /**
     * ⛔ I DUE CONTATORI SEPARATI. Uno solo funziona per il primo messaggio e
     * poi smette — il modo peggiore di rompersi, perché sembra funzionare.
     *
     * Qui ogni lato ne manda DUE: se i contatori fossero condivisi, il secondo
     * non si decifrerebbe.
     */
    @Test
    fun `due messaggi di fila si decifrano tutti e due`() {
        val materiale = ByteArray(64) { 9 }
        val a = TalosAdbCifrario(materiale)
        val b = TalosAdbCifrario(materiale)

        val uno = "primo".toByteArray()
        val due = "secondo".toByteArray()
        assertArrayEquals(uno, b.decifra(a.cifra(uno)))
        assertArrayEquals(due, b.decifra(a.cifra(due)))
    }

    /** Il nonce cambia a ogni messaggio: due cifrature uguali non collidono. */
    @Test
    fun `lo stesso testo cifrato due volte NON da lo stesso risultato`() {
        val cifrario = TalosAdbCifrario(ByteArray(64) { 1 })
        val chiaro = "uguale".toByteArray()
        assertFalse(cifrario.cifra(chiaro).contentEquals(cifrario.cifra(chiaro)))
    }

    /** Un messaggio manomesso non si decifra: è un esito, non un guasto. */
    @Test
    fun `un messaggio manomesso torna null invece di esplodere`() {
        val materiale = ByteArray(64) { 4 }
        val a = TalosAdbCifrario(materiale)
        val b = TalosAdbCifrario(materiale)

        val cifrato = a.cifra("intatto".toByteArray())
        cifrato[3] = (cifrato[3] + 1).toByte()
        assertNull(b.decifra(cifrato))
    }

    /** Chiavi diverse non si capiscono. */
    @Test
    fun `due chiavi diverse non si leggono a vicenda`() {
        val a = TalosAdbCifrario(ByteArray(64) { 1 })
        val b = TalosAdbCifrario(ByteArray(64) { 2 })
        assertNull(b.decifra(a.cifra("segreto".toByteArray())))
    }

    /** GCM aggiunge sedici byte di etichetta: la misura si vede. */
    @Test
    fun `il cifrato e lungo quanto il chiaro piu l etichetta`() {
        val cifrario = TalosAdbCifrario(ByteArray(64) { 7 })
        val chiaro = ByteArray(100)
        assertEquals(100 + 16, cifrario.cifra(chiaro).size)
    }
}
