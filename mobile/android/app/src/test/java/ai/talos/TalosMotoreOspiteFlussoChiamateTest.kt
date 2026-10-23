package ai.talos

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Sessione lunga sul Pad, 21/10/2026 (diario del motore, `chatcmpl-…5247ca31`): token che crescono, testo grezzo che cresce, e verso
 * r4 niente per minuti — il modello stava scrivendo una chiamata ad attrezzo, che usciva solo INTERA alla fine. Oltre i 300 s il
 * guardiano dei dati di r4 chiude la richiesta. Le chiamate escono a pezzi come in llama-server e OpenAI (contratto del Desktop, 21/10):
 * primo pezzo `{index, id, type:'function', function:{name, arguments:''}}`, poi solo `{index, function:{arguments:'<pezzo>'}}`
 * aggiunti in coda; una chiamata nuova = un indice nuovo, mai indietro; alla fine solo ciò che manca.
 */
class TalosMotoreOspiteFlussoChiamateTest {
    private fun chiamata(nome: String, argomenti: String, id: String = "") =
        JSONObject().put("id", id).put("name", nome).put("arguments", argomenti)
    private fun lista(vararg c: JSONObject) = JSONArray().apply { c.forEach { put(it) } }
    private fun voce(delta: JSONObject) = delta.getJSONArray("tool_calls").getJSONObject(0)
    private fun finale(chiamate: JSONArray) = JSONObject().put("content", "").put("reasoning", "").put("toolCalls", chiamate)

    @Test
    fun `CHIAM-01 la chiamata comincia col nome e poi escono solo gli argomenti nuovi, trattenendo la coda incerta`() {
        val f = TalosMotoreOspiteFlusso()
        val primo = f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"const""")), "id7")
        val testa = voce(primo[0])
        assertEquals(0, testa.getInt("index"))
        assertEquals("id7_0", testa.getString("id"))
        assertEquals("function", testa.getString("type"))
        assertEquals("scrivi", testa.getJSONObject("function").getString("name"))
        assertEquals("", testa.getJSONObject("function").getString("arguments"))
        // gli argomenti escono senza gli ultimi caratteri, che la lettura parziale può ancora cambiare
        val pezzo1 = voce(primo[1])
        assertEquals(0, pezzo1.getInt("index"))
        assertFalse(pezzo1.has("id"))
        assertFalse(pezzo1.getJSONObject("function").has("name"))
        val detto1 = pezzo1.getJSONObject("function").getString("arguments")
        assertTrue("""{"percorso":"a.js","contenuto":"const""".startsWith(detto1))
        assertTrue(detto1.length < """{"percorso":"a.js","contenuto":"const""".length)
        // la lettura dopo aggiunge solo il nuovo
        val secondo = f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"const x = 1;\n""")), "id7")
        assertEquals(1, secondo.size)
        val detto2 = voce(secondo[0]).getJSONObject("function").getString("arguments")
        assertTrue("""{"percorso":"a.js","contenuto":"const x = 1;\n""".startsWith(detto1 + detto2))
        // nessuna novità ⇒ niente
        assertEquals(0, f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"const x = 1;\n""")), "id7").size)
    }

    @Test
    fun `CHIAM-02 alla fine si manda solo il resto degli argomenti, senza ripetere la chiamata, e il JSON concatenato e quello finale`() {
        val f = TalosMotoreOspiteFlusso()
        val usciti = mutableListOf<JSONObject>()
        usciti += f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"con""")), "id8")
        usciti += f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"const y = 2""")), "id8")
        val completo = """{"percorso":"a.js","contenuto":"const y = 2;"}"""
        usciti += f.chiudi(finale(lista(chiamata("scrivi", completo))), "id8")
        val argomenti = usciti.flatMap { d ->
            val v = d.optJSONArray("tool_calls") ?: return@flatMap emptyList<String>()
            (0 until v.length()).map { v.getJSONObject(it) }.filter { it.getInt("index") == 0 }
                .map { it.getJSONObject("function").optString("arguments", "") }
        }.joinToString("")
        assertEquals(completo, argomenti)
        // una sola intestazione col nome
        val conNome = usciti.sumOf { d ->
            val v = d.optJSONArray("tool_calls") ?: return@sumOf 0
            (0 until v.length()).count { v.getJSONObject(it).getJSONObject("function").has("name") }
        }
        assertEquals(1, conNome)
        assertTrue(f.haChiamato())
    }

    @Test
    fun `CHIAM-03 una seconda chiamata prende l'indice dopo, e alla fine una chiamata mai vista esce intera`() {
        val f = TalosMotoreOspiteFlusso()
        f.avanzaChiamate(lista(chiamata("leggi", """{"percorso":"a.js"}""")), "id9")
        val seconda = f.avanzaChiamate(lista(chiamata("leggi", """{"percorso":"a.js"}"""), chiamata("shell", """{"comando":"node a.js"""")), "id9")
        val indici = seconda.flatMap { d -> d.optJSONArray("tool_calls")?.let { v -> (0 until v.length()).map { v.getJSONObject(it).getInt("index") } } ?: emptyList() }
        assertTrue(indici.contains(1))
        assertTrue(indici.all { it >= 0 })
        val fine = f.chiudi(finale(lista(chiamata("leggi", """{"percorso":"a.js"}"""), chiamata("shell", """{"comando":"node a.js"}"""),
            chiamata("leggi", """{"percorso":"b.js"}"""))), "id9")
        val nuove = fine.flatMap { d -> d.optJSONArray("tool_calls")?.let { v -> (0 until v.length()).map { v.getJSONObject(it) } } ?: emptyList() }
        val terza = nuove.single { it.getInt("index") == 2 }
        assertEquals("leggi", terza.getJSONObject("function").getString("name"))
        assertEquals("""{"percorso":"b.js"}""", terza.getJSONObject("function").getString("arguments"))
    }

    @Test
    fun `CHIAM-04 una lettura che cambia idea sugli argomenti non manda altri pezzi di quella chiamata`() {
        val f = TalosMotoreOspiteFlusso()
        f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"abcdefghij""")), "id1")
        assertEquals(0, f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"b.js","contenuto":"abcdefghijkl""")), "id1").size)
    }

    @Test
    fun `CHIAM-05 senza nome ancora non esce niente`() {
        val f = TalosMotoreOspiteFlusso()
        assertEquals(0, f.avanzaChiamate(lista(chiamata("", "")), "id1").size)
        assertFalse(f.haChiamato())
    }

    private fun argomentiPer(usciti: List<JSONObject>, indice: Int) = usciti.flatMap { d ->
        val v = d.optJSONArray("tool_calls") ?: return@flatMap emptyList<String>()
        (0 until v.length()).map { v.getJSONObject(it) }.filter { it.getInt("index") == indice }
            .map { it.getJSONObject("function").optString("arguments", "") }
    }.joinToString("")

    /*
     * Revisione avversaria (1), confermata contro `consumaFlussoSSE` di r4 @625: quattro `leggi` nella stessa risposta. r4 chiude la
     * chiamata j quando arriva l'intestazione di j+1 e ne conta la firma: con la coda trattenuta erano tutte `{"percorso":"t` ⇒ alla
     * terza «valanga», flusso chiuso, una chiamata con JSON rotto e tre scartate. Una chiamata che ha già una successiva è CHIUSA:
     * i suoi argomenti escono interi prima dell'intestazione della prossima.
     */
    @Test
    fun `CHIAM-06 una chiamata gia chiusa esce intera prima dell'intestazione della successiva`() {
        val f = TalosMotoreOspiteFlusso()
        val usciti = mutableListOf<JSONObject>()
        val tutte = (1..4).map { chiamata("leggi", """{"percorso":"t$it.js"}""") }
        for (n in 1..4) usciti += f.avanzaChiamate(lista(*tutte.take(n).toTypedArray()), "id1")
        for (i in 0..2) {
            assertEquals("""{"percorso":"t${i + 1}.js"}""", argomentiPer(usciti.takeWhile { d ->
                val v = d.optJSONArray("tool_calls")
                v == null || !(0 until v.length()).any { v.getJSONObject(it).getInt("index") == i + 1 }
            }, i))
        }
    }

    /** Revisione avversaria (6): il taglio della coda in unità UTF-16 spezzava le emoji, e i byte UTF-8 diventavano «??». */
    @Test
    fun `CHIAM-07 il taglio non spezza mai un carattere fuori dal piano base`() {
        val f = TalosMotoreOspiteFlusso()
        val testo = """{"contenuto":"ok 😀😀😀 fine"""
        for (fine in 15..testo.length) {
            for (d in f.avanzaChiamate(lista(chiamata("scrivi", testo.substring(0, fine))), "id1")) {
                val a = d.getJSONArray("tool_calls").getJSONObject(0).getJSONObject("function").optString("arguments", "")
                if (a.isNotEmpty()) {
                    assertFalse("pezzo che finisce a metà carattere: $a", Character.isHighSurrogate(a.last()))
                    assertFalse("pezzo che comincia a metà carattere: $a", Character.isLowSurrogate(a.first()))
                }
            }
        }
    }

    /** Revisione avversaria (5): una lettura che ha cambiato idea per un attimo non deve impedire alla finale di completare. */
    @Test
    fun `CHIAM-08 dopo un blocco la lettura finale che prolunga quanto detto manda il resto`() {
        val f = TalosMotoreOspiteFlusso()
        val usciti = mutableListOf<JSONObject>()
        usciti += f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"abcdefghij""")), "id1")
        usciti += f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"b.js","contenuto":"abcdefghijkl""")), "id1")
        val completo = """{"percorso":"a.js","contenuto":"abcdefghijklmn"}"""
        usciti += f.chiudi(finale(lista(chiamata("scrivi", completo))), "id1")
        assertEquals(completo, argomentiPer(usciti, 0))
    }

    /** Revisione avversaria (7): nei formati con l'id DOPO il nome (Mistral `[CALL_ID]`) l'intestazione aspetta i primi argomenti. */
    @Test
    fun `CHIAM-09 l'intestazione aspetta i primi argomenti, e porta l'id che a quel punto e completo`() {
        val f = TalosMotoreOspiteFlusso()
        assertEquals(0, f.avanzaChiamate(lista(chiamata("scrivi", "", id = "ab")), "id1").size)
        val dopo = f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"x""", id = "abc123XYZ")), "id1")
        assertEquals("abc123XYZ", voce(dopo[0]).getString("id"))
    }

    /** Revisione avversaria (4): una chiamata cominciata nello streaming e assente nella lettura finale non è una chiamata fatta. */
    @Test
    fun `CHIAM-10 se la lettura finale non ha chiamate il giro non e chiuso come tool_calls`() {
        val f = TalosMotoreOspiteFlusso()
        f.avanzaChiamate(lista(chiamata("scrivi", """{"percorso":"a.js","contenuto":"tagliato a met""")), "id1")
        f.chiudi(finale(JSONArray()), "id1")
        assertFalse(f.haChiamato())
    }
}
