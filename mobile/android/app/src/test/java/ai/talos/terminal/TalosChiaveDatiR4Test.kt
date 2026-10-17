package ai.talos.terminal

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * K2-B, parte B1 (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`): la chiave dati del portachiavi di r4. Nasce una volta, si
 * custodisce sigillata con l'archivio sicuro, arriva al server SOLO dallo stdin (owner 14/10 «Dallo stdin»). Qui la parte pura.
 */
class TalosChiaveDatiR4Test {
    private fun byte(n: Int, valore: Int) = ByteArray(n) { valore.toByte() }

    @Test
    fun `R4K-01 il sigillo va e torna, e con magia o lunghezza sbagliate non si apre`() {
        val nonce = byte(12, 7)
        val cifrato = byte(48, 9)
        val sigillo = TalosChiaveDatiR4.sigilla(nonce, cifrato)
        assertEquals(5 + 12 + 48, sigillo.size)
        val aperto = TalosChiaveDatiR4.apriSigillo(sigillo)!!
        assertArrayEquals(nonce, aperto.first)
        assertArrayEquals(cifrato, aperto.second)
        assertNull(TalosChiaveDatiR4.apriSigillo(sigillo.copyOf(sigillo.size - 1)))
        assertNull(TalosChiaveDatiR4.apriSigillo(sigillo + 0))
        val altraMagia = sigillo.copyOf().also { it[0] = 'X'.code.toByte() }
        assertNull(TalosChiaveDatiR4.apriSigillo(altraMagia))
        assertNull(TalosChiaveDatiR4.apriSigillo(ByteArray(0)))
    }

    /** ⛔ Portachiavi presente ma chiave persa: MAI una chiave nuova, che lo renderebbe illeggibile per sempre. */
    @Test
    fun `R4K-02 una chiave nuova nasce solo se non c'e' niente da leggere`() {
        assertEquals(TalosChiaveDatiR4.Scelta.USA, TalosChiaveDatiR4.decidi(sigilloEsiste = true, portachiaviEsiste = true))
        assertEquals(TalosChiaveDatiR4.Scelta.USA, TalosChiaveDatiR4.decidi(sigilloEsiste = true, portachiaviEsiste = false))
        assertEquals(TalosChiaveDatiR4.Scelta.CREA, TalosChiaveDatiR4.decidi(sigilloEsiste = false, portachiaviEsiste = false))
        assertEquals(TalosChiaveDatiR4.Scelta.PERSA, TalosChiaveDatiR4.decidi(sigilloEsiste = false, portachiaviEsiste = true))
    }

    @Test
    fun `R4K-03 la riga per lo stdin e' quella che il modulo di r4 accetta`() {
        val chiave = ByteArray(32) { (it * 37 + 11).toByte() }
        val riga = String(TalosChiaveDatiR4.rigaPerLoStdin(chiave), Charsets.US_ASCII)
        assertTrue(riga.endsWith("\n"))
        val base64 = riga.trim()
        assertEquals(44, base64.length)
        // la stessa espressione di `portachiavi-android.mjs` dopo `trim`
        assertTrue(Regex("^[A-Za-z0-9+/]+={0,2}$").matches(base64))
        assertArrayEquals(chiave, java.util.Base64.getDecoder().decode(base64))
        val errore = runCatching { TalosChiaveDatiR4.rigaPerLoStdin(ByteArray(16)) }.exceptionOrNull()
        assertTrue(errore is IllegalArgumentException)
    }
}
