package ai.talos.terminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ F4 (14/10/2026, owner «Notifica solo mentre lavora»; ledger `LEDGER-CODICE-SENZA-PONTE-2026-10-13.md` §15). Sul Pad la
 * WebView in secondo piano è congelata: la fine del giro del Codice la deve vedere il nativo, chiedendo lo stato al server
 * in casa. Qui la parte senza Android: lettura della risposta, quando seguire, quando rilasciare.
 */
class TalosCodiceCustodeTest {
    private fun risposta(vararg voci: String) = """{"ok":true,"data":{"items":[${voci.joinToString(",")}]}}"""
    private fun voce(id: String, conclusa: Boolean, interrotta: Boolean = false) =
        """{"sessionId":"$id","conclusa":$conclusa,"interrotta":$interrotta,"ultimoMessaggio":null}"""

    @Test
    fun `COD-F4-N-01 la risposta del server dice quali sessioni lavorano, e niente se è rotta`() {
        val stati = TalosCodiceCustode.statiDaRisposta(
            risposta(voce("viva", false), voce("finita", true), voce("morta", false, interrotta = true)),
        )
        assertEquals(mapOf("viva" to true, "finita" to false, "morta" to false), stati)
        assertNull(TalosCodiceCustode.statiDaRisposta("{rotto"))
        assertNull(TalosCodiceCustode.statiDaRisposta("""{"ok":false}"""))
        assertNull(TalosCodiceCustode.statiDaRisposta("""{"ok":true,"data":{}}"""))
    }

    @Test
    fun `COD-F4-N-02 si segue solo una sessione che il server dice al lavoro (i giri vecchi ripetuti non accendono niente)`() {
        val registro = TalosCodiceCustode.Registro()
        assertTrue(registro.daSeguire("viva", mapOf("viva" to true)))
        assertFalse(registro.daSeguire("finita", mapOf("finita" to false)))
        assertFalse(registro.daSeguire("ignota", mapOf("viva" to true)))
        assertFalse(registro.daSeguire("viva", null))
    }

    @Test
    fun `COD-F4-N-03 finché lavora non si rilascia, a fine giro sì`() {
        val registro = TalosCodiceCustode.Registro()
        registro.aggiungi("s")
        assertEquals(emptyList<String>(), registro.passo(mapOf("s" to true)))
        assertEquals(listOf("s"), registro.passo(mapOf("s" to false)))
        assertTrue(registro.vuoto())
    }

    @Test
    fun `COD-F4-N-04 server che non risponde tre volte di fila, o sessione sparita, rilascia`() {
        val registro = TalosCodiceCustode.Registro()
        registro.aggiungi("s")
        repeat(TalosCodiceCustode.ASSENZE - 1) { assertEquals(emptyList<String>(), registro.passo(null)) }
        assertEquals(listOf("s"), registro.passo(null))
        registro.aggiungi("t")
        repeat(TalosCodiceCustode.ASSENZE - 1) { assertEquals(emptyList<String>(), registro.passo(mapOf("altra" to true))) }
        assertEquals(listOf("t"), registro.passo(mapOf("altra" to true)))
    }

    @Test
    fun `COD-F4-N-05 una risposta buona in mezzo azzera le assenze`() {
        val registro = TalosCodiceCustode.Registro()
        registro.aggiungi("s")
        repeat(TalosCodiceCustode.ASSENZE - 1) { registro.passo(null) }
        assertEquals(emptyList<String>(), registro.passo(mapOf("s" to true)))
        repeat(TalosCodiceCustode.ASSENZE - 1) { assertEquals(emptyList<String>(), registro.passo(null)) }
        assertFalse(registro.vuoto())
    }

    @Test
    fun `COD-F4-N-06 due sessioni insieme si rilasciano ognuna alla sua fine, togliere due volte non rompe niente`() {
        val registro = TalosCodiceCustode.Registro()
        registro.aggiungi("a")
        registro.aggiungi("b")
        registro.aggiungi("a")
        assertEquals(listOf("a"), registro.passo(mapOf("a" to false, "b" to true)))
        assertFalse(registro.vuoto())
        assertTrue(registro.togli("b"))
        assertFalse(registro.togli("b"))
        assertTrue(registro.vuoto())
    }
}
