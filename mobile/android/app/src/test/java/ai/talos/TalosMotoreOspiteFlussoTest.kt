package ai.talos

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger, emendamento «streaming senza compute_diffs»): durante lo streaming escono solo testo e
 * ragionamento NUOVI (per prefisso: una lettura parziale che non estende quanto già detto si tiene); alla fine, dalla lettura
 * finale (quella col rimedio a llama.cpp #20260), il resto e le chiamate agli attrezzi INTERE.
 */
class TalosMotoreOspiteFlussoTest {
    private fun parziale(content: String, reasoning: String = "") = JSONObject().put("content", content).put("reasoning", reasoning)
    private fun finale(content: String, reasoning: String = "", chiamate: JSONArray = JSONArray()) =
        JSONObject().put("content", content).put("reasoning", reasoning).put("toolCalls", chiamate)

    @Test
    fun `FLUSSO-01 escono solo le parti nuove, prima il ragionamento poi il testo`() {
        val f = TalosMotoreOspiteFlusso()
        assertEquals("""{"reasoning_content":"Pen"}""", f.avanza(parziale("", "Pen")).toString())
        assertEquals("""{"reasoning_content":"so"}""", f.avanza(parziale("", "Penso")).toString())
        assertEquals("""{"content":"Ci"}""", f.avanza(parziale("Ci", "Penso")).toString())
        assertNull(f.avanza(parziale("Ci", "Penso")))
        assertEquals("""{"content":"ao"}""", f.avanza(parziale("Ciao", "Penso")).toString())
    }

    @Test
    fun `FLUSSO-02 una lettura che non estende quanto gia detto si tiene, e alla fine si dice solo cio che manca`() {
        val f = TalosMotoreOspiteFlusso()
        f.avanza(parziale("Ciao a"))
        // il parser ha cambiato idea (non è un prolungamento): niente delta, niente ritiro
        assertNull(f.avanza(parziale("Ciao")))
        assertNull(f.avanza(parziale("Salve")))
        val fine = f.chiudi(finale("Ciao a tutti"), "id1")
        assertEquals(1, fine.size)
        assertEquals(" tutti", fine[0].getString("content"))
    }

    @Test
    fun `FLUSSO-03 alla fine le chiamate escono intere, con indice, id e nome, dopo il resto del testo`() {
        val f = TalosMotoreOspiteFlusso()
        f.avanza(parziale("Leggo il file", "devo leggere"))
        val chiamate = JSONArray()
            .put(JSONObject().put("id", "c1").put("name", "read_file").put("arguments", """{"path":"a.txt"}"""))
            .put(JSONObject().put("id", "").put("name", "list_files").put("arguments", "{}"))
        val fine = f.chiudi(finale("Leggo il file.", "devo leggere", chiamate), "id9")
        assertEquals(2, fine.size)
        assertEquals(".", fine[0].getString("content"))
        assertFalse(fine[0].has("tool_calls"))
        val voci = fine[1].getJSONArray("tool_calls")
        assertEquals(2, voci.length())
        val prima = voci.getJSONObject(0)
        assertEquals(0, prima.getInt("index"))
        assertEquals("c1", prima.getString("id"))
        assertEquals("function", prima.getString("type"))
        assertEquals("read_file", prima.getJSONObject("function").getString("name"))
        assertEquals("""{"path":"a.txt"}""", prima.getJSONObject("function").getString("arguments"))
        val seconda = voci.getJSONObject(1)
        assertEquals(1, seconda.getInt("index"))
        assertEquals("id9_1", seconda.getString("id"))
        assertTrue(f.haChiamato())
    }

    @Test
    fun `FLUSSO-04 senza novita alla fine non esce niente, e senza chiamate haChiamato e falso`() {
        val f = TalosMotoreOspiteFlusso()
        f.avanza(parziale("Fatto"))
        assertEquals(0, f.chiudi(finale("Fatto"), "id1").size)
        assertFalse(f.haChiamato())
        // anche una lettura finale col solo ragionamento aggiunto
        val g = TalosMotoreOspiteFlusso()
        val fine = g.chiudi(finale("", "pensiero"), "id2")
        assertEquals("""{"reasoning_content":"pensiero"}""", fine.single().toString())
    }
}
