package ai.talos.remoto

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): il taglio dei messaggi del filo,
 * uguale a `harness-ui/src/remoto/filo.mjs` (`codifica`, `creaLettore`, `BYTE_MASSIMI`) di r4 `aeab15222`.
 */
class TalosRemotoFiloTest {
    @Test
    fun `FILO-K-01 codifica come il PC - 4 byte di lunghezza big-endian e il JSON in UTF-8`() {
        val json = """{"v":1,"t":"ping","s":"è"}"""
        val corpo = json.toByteArray(Charsets.UTF_8)
        val atteso = byteArrayOf(0, 0, 0, corpo.size.toByte()) + corpo
        assertArrayEquals(atteso, TalosRemotoFilo.codifica(json))
    }

    @Test
    fun `FILO-K-02 il lettore ricompone i messaggi da pezzi qualunque, anche più messaggi in un pezzo`() {
        val a = TalosRemotoFilo.codifica("""{"v":1,"t":"a"}""")
        val b = TalosRemotoFilo.codifica("""{"v":1,"t":"bb"}""")
        val tutto = a + b
        val lettore = TalosRemotoFilo.Lettore()
        val usciti = mutableListOf<String>()
        for (i in tutto.indices) usciti += lettore.aggiungi(byteArrayOf(tutto[i]))
        assertEquals(listOf("""{"v":1,"t":"a"}""", """{"v":1,"t":"bb"}"""), usciti)
        assertEquals(0, lettore.inSospeso)
        assertEquals(listOf("""{"v":1,"t":"a"}""", """{"v":1,"t":"bb"}"""), TalosRemotoFilo.Lettore().aggiungi(tutto))
    }

    @Test
    fun `FILO-K-03 il tetto di 1 MiB - oltre si rifiuta in uscita e in entrata, prima di leggere il corpo`() {
        val grande = "x".repeat(TalosRemotoFilo.BYTE_MASSIMI + 1)
        val e = assertThrows(TalosRemotoFilo.ErroreFilo::class.java) { TalosRemotoFilo.codifica(grande) }
        assertEquals("TOO_LARGE", e.codice)
        val testa = byteArrayOf(0, 0x10, 0, 1) // 1 MiB + 1 dichiarati, nessun corpo
        val e2 = assertThrows(TalosRemotoFilo.ErroreFilo::class.java) { TalosRemotoFilo.Lettore().aggiungi(testa) }
        assertEquals("TOO_LARGE", e2.codice)
        assertEquals(TalosRemotoFilo.BYTE_MASSIMI, TalosRemotoFilo.codifica("y".repeat(TalosRemotoFilo.BYTE_MASSIMI)).size - 4)
    }

    @Test
    fun `FILO-K-04 un corpo che non è UTF-8 valido è BAD_MESSAGE`() {
        val rotto = byteArrayOf(0, 0, 0, 2, 0xC3.toByte(), 0x28)
        val e = assertThrows(TalosRemotoFilo.ErroreFilo::class.java) { TalosRemotoFilo.Lettore().aggiungi(rotto) }
        assertEquals("BAD_MESSAGE", e.codice)
    }
}
