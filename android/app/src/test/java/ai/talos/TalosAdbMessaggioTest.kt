package ai.talos

import ai.talos.agent.ponte.TalosAdbMessaggio
import ai.talos.agent.ponte.TalosAdbRifiutato
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * ⭐ Il protocollo ADB detto da noi, provato senza dispositivo.
 *
 * Queste sono le regole che, sbagliate, danno un ponte che «non si collega» con
 * un errore che non assomiglia alla causa. Provarle qui costa millisecondi;
 * scoprirle sul telefono è costato ore, due volte.
 */
class TalosAdbMessaggioTest {

    private fun parolaA(byte: ByteArray, indice: Int): Int =
        ByteBuffer.wrap(byte).order(ByteOrder.LITTLE_ENDIAN).getInt(indice * 4)

    @Test
    fun `l intestazione e sei parole little-endian, e il magic e il comando negato`() {
        val carico = "host::talos".toByteArray()
        val testa = TalosAdbMessaggio.intestazione(TalosAdbMessaggio.CNXN, 0x01000001, 1024, carico)

        assertEquals(TalosAdbMessaggio.INTESTAZIONE, testa.size)
        assertEquals(TalosAdbMessaggio.CNXN, parolaA(testa, 0))
        assertEquals(0x01000001, parolaA(testa, 1))
        assertEquals(1024, parolaA(testa, 2))
        assertEquals(carico.size, parolaA(testa, 3))
        assertEquals(TalosAdbMessaggio.somma(carico), parolaA(testa, 4))
        assertEquals(TalosAdbMessaggio.CNXN xor -1, parolaA(testa, 5))
    }

    /**
     * ⛔ LO SCOGLIO. In AOSP il campo si chiama `data_crc32`, ma **è la somma
     * dei byte**. E i byte vanno letti senza segno: in Kotlin un `Byte` va da
     * -128 a 127, quindi sommarli com'è darebbe un numero diverso su qualunque
     * carico binario — cioè su tutti quelli veri.
     *
     * Un byte solo, `0xFF`: la somma giusta è 255. Senza `and 0xFF` sarebbe -1.
     */
    @Test
    fun `la somma legge i byte SENZA segno`() {
        assertEquals(255, TalosAdbMessaggio.somma(byteArrayOf(0xFF.toByte())))
        assertEquals(0, TalosAdbMessaggio.somma(ByteArray(0)))
        // 0x80 + 0x7F = 128 + 127 = 255. Col segno farebbe -128 + 127 = -1.
        assertEquals(255, TalosAdbMessaggio.somma(byteArrayOf(0x80.toByte(), 0x7F)))
        // Un carico lungo di soli 0xFF: 300 * 255. Nessun troncamento a byte.
        assertEquals(300 * 255, TalosAdbMessaggio.somma(ByteArray(300) { 0xFF.toByte() }))
    }

    @Test
    fun `un intestazione nostra si rilegge identica`() {
        val carico = ByteArray(64) { (it * 7).toByte() }
        val testa = TalosAdbMessaggio.intestazione(TalosAdbMessaggio.WRTE, 7, 9, carico)

        val letto = TalosAdbMessaggio.leggi(testa).getOrThrow()
        assertEquals(TalosAdbMessaggio.WRTE, letto.comando)
        assertEquals(7, letto.arg0)
        assertEquals(9, letto.arg1)
        assertEquals(64, letto.lunghezza)
        assertTrue(TalosAdbMessaggio.caricoIntegro(letto, carico))
    }

    /**
     * ⛔ Il `magic` non è sicurezza: è il modo per accorgersi di essere fuori
     * sincrono nel flusso. Senza il controllo, un byte perso trasforma il resto
     * della conversazione in rumore letto come comandi.
     */
    @Test
    fun `un magic che non torna e RIFIUTATO, non interpretato`() {
        val testa = TalosAdbMessaggio.intestazione(TalosAdbMessaggio.OKAY, 1, 2, ByteArray(0))
        testa[20] = (testa[20] + 1).toByte()

        val motivo = (TalosAdbMessaggio.leggi(testa).exceptionOrNull() as TalosAdbRifiutato).motivo
        assertEquals(TalosAdbMessaggio.Rifiuto.MAGIC, motivo)
    }

    /**
     * ⛔ La lunghezza arriva dall'altro capo del filo. Crederci e allocare
     * significa fargli decidere quanta memoria prendiamo: si controlla PRIMA.
     */
    @Test
    fun `una lunghezza spropositata e rifiutata PRIMA di allocare`() {
        val testa = TalosAdbMessaggio.intestazione(TalosAdbMessaggio.WRTE, 1, 2, ByteArray(0))
        ByteBuffer.wrap(testa).order(ByteOrder.LITTLE_ENDIAN).putInt(12, Int.MAX_VALUE)

        val motivo = (TalosAdbMessaggio.leggi(testa).exceptionOrNull() as TalosAdbRifiutato).motivo
        assertEquals(TalosAdbMessaggio.Rifiuto.TROPPO_GRANDE, motivo)
    }

    /** E anche una lunghezza NEGATIVA, che un `Int` permette di scrivere. */
    @Test
    fun `una lunghezza negativa e rifiutata`() {
        val testa = TalosAdbMessaggio.intestazione(TalosAdbMessaggio.WRTE, 1, 2, ByteArray(0))
        ByteBuffer.wrap(testa).order(ByteOrder.LITTLE_ENDIAN).putInt(12, -1)

        val motivo = (TalosAdbMessaggio.leggi(testa).exceptionOrNull() as TalosAdbRifiutato).motivo
        assertEquals(TalosAdbMessaggio.Rifiuto.TROPPO_GRANDE, motivo)
    }

    @Test
    fun `un comando che non conosciamo e rifiutato invece di essere ignorato`() {
        val testa = TalosAdbMessaggio.intestazione(0x11223344, 0, 0, ByteArray(0))

        val motivo = (TalosAdbMessaggio.leggi(testa).exceptionOrNull() as TalosAdbRifiutato).motivo
        assertEquals(TalosAdbMessaggio.Rifiuto.COMANDO_IGNOTO, motivo)
    }

    @Test
    fun `un intestazione tagliata e rifiutata, non completata a caso`() {
        val testa = TalosAdbMessaggio.intestazione(TalosAdbMessaggio.CNXN, 0, 0, ByteArray(0))

        val motivo = (TalosAdbMessaggio.leggi(testa.copyOf(23)).exceptionOrNull() as TalosAdbRifiutato)
            .motivo
        assertEquals(TalosAdbMessaggio.Rifiuto.CORTA, motivo)
    }

    /** Un carico corrotto in transito non deve passare per buono. */
    @Test
    fun `un carico che non torna con la sua somma NON e integro`() {
        val carico = ByteArray(32) { it.toByte() }
        val letto = TalosAdbMessaggio.leggi(
            TalosAdbMessaggio.intestazione(TalosAdbMessaggio.WRTE, 1, 1, carico),
        ).getOrThrow()

        val storto = carico.copyOf().also { it[5] = (it[5] + 1).toByte() }
        assertFalse(TalosAdbMessaggio.caricoIntegro(letto, storto))
        // E nemmeno uno della lunghezza sbagliata, somma a parte.
        assertFalse(TalosAdbMessaggio.caricoIntegro(letto, carico.copyOf(31)))
        assertTrue(TalosAdbMessaggio.caricoIntegro(letto, carico))
    }

    /**
     * I quattro comandi sono lettere ASCII lette al contrario. Scritto come
     * prova perché una costante sbagliata qui produce un ponte muto, e il
     * confronto con le lettere e' il modo di accorgersene senza un telefono.
     */
    @Test
    fun `le costanti sono le quattro lettere, little-endian`() {
        fun parole(valore: Int) = ByteBuffer.allocate(4)
            .order(ByteOrder.LITTLE_ENDIAN).putInt(valore).array()

        assertArrayEquals("CNXN".toByteArray(), parole(TalosAdbMessaggio.CNXN))
        assertArrayEquals("AUTH".toByteArray(), parole(TalosAdbMessaggio.AUTH))
        assertArrayEquals("STLS".toByteArray(), parole(TalosAdbMessaggio.STLS))
        assertArrayEquals("OPEN".toByteArray(), parole(TalosAdbMessaggio.OPEN))
        assertArrayEquals("OKAY".toByteArray(), parole(TalosAdbMessaggio.OKAY))
        assertArrayEquals("WRTE".toByteArray(), parole(TalosAdbMessaggio.WRTE))
        assertArrayEquals("CLSE".toByteArray(), parole(TalosAdbMessaggio.CLSE))
        assertArrayEquals("SYNC".toByteArray(), parole(TalosAdbMessaggio.SYNC))
    }
}
