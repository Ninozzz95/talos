package ai.talos

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.io.ByteArrayInputStream

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): la parte pura dell'endpoint che l'app serve a
 * r4 sul socket Unix privato — leggere la richiesta, controllare la chiave, capire la domanda OpenAI, scrivere i pezzi SSE come
 * `llama-server` (`tools/server`), che il kernel di r4 legge già (`talosHarness.mjs:1078-1269`, risposta del Desktop 18/10).
 */
class TalosMotoreOspiteHttpTest {
    private fun richiesta(testo: String) = ByteArrayInputStream(testo.toByteArray(Charsets.UTF_8))
    private val chiave = "a".repeat(64)

    @Test
    fun `HTTP-01 una POST con Content-Length si legge intera, intestazioni in minuscolo`() {
        val corpo = """{"messages":[]}"""
        val r = TalosMotoreOspiteHttp.leggi(richiesta(
            "POST /v1/chat/completions HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer $chiave\r\nContent-Type: application/json\r\n" +
                "Content-Length: ${corpo.toByteArray().size}\r\n\r\n$corpo"))
        assertEquals("POST", r.metodo)
        assertEquals("/v1/chat/completions", r.percorso)
        assertEquals("Bearer $chiave", r.intestazioni["authorization"])
        assertArrayEquals(corpo.toByteArray(), r.corpo)
        // una GET senza corpo
        val g = TalosMotoreOspiteHttp.leggi(richiesta("GET /props HTTP/1.1\r\nHost: localhost\r\n\r\n"))
        assertEquals("GET", g.metodo)
        assertEquals("/props", g.percorso)
        assertEquals(0, g.corpo.size)
    }

    @Test
    fun `HTTP-02 una richiesta storta e 400, un corpo oltre il tetto e 413, senza leggerlo`() {
        fun stato(testo: String): Int = try {
            TalosMotoreOspiteHttp.leggi(richiesta(testo)); fail("doveva rifiutare"); 0
        } catch (e: TalosMotoreOspiteHttp.ErroreHttp) { e.stato }
        assertEquals(400, stato("NIENTE\r\n\r\n"))
        assertEquals(400, stato("POST /v1/chat/completions HTTP/1.1\r\nContent-Length: dieci\r\n\r\n"))
        assertEquals(400, stato("POST /v1/chat/completions HTTP/1.1\r\nContent-Length: 50\r\n\r\ncorto"))
        assertEquals(413, stato("POST /v1/chat/completions HTTP/1.1\r\nContent-Length: ${TalosMotoreOspiteHttp.TETTO_CORPO + 1}\r\n\r\n"))
    }

    @Test
    fun `HTTP-03 la chiave e una Bearer esatta, tutto il resto no`() {
        fun con(valore: String?) = TalosMotoreOspiteHttp.Richiesta("POST", "/v1/chat/completions",
            if (valore == null) emptyMap() else mapOf("authorization" to valore), ByteArray(0))
        assertTrue(TalosMotoreOspiteHttp.autorizzata(con("Bearer $chiave"), chiave))
        assertFalse(TalosMotoreOspiteHttp.autorizzata(con("Bearer ${"b".repeat(64)}"), chiave))
        assertFalse(TalosMotoreOspiteHttp.autorizzata(con("Bearer $chiave "), chiave))
        assertFalse(TalosMotoreOspiteHttp.autorizzata(con("Basic $chiave"), chiave))
        assertFalse(TalosMotoreOspiteHttp.autorizzata(con(null), chiave))
        assertFalse(TalosMotoreOspiteHttp.autorizzata(con("Bearer "), ""))
    }

    @Test
    fun `HTTP-04 la domanda OpenAI passa messaggi e attrezzi come sono, e dice stream, ragionamento e tetto`() {
        val messaggi = JSONArray("""[{"role":"system","content":"S"},{"role":"user","content":"U"},
            {"role":"assistant","content":null,"tool_calls":[{"id":"c1","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"a\"}"}}]},
            {"role":"tool","tool_call_id":"c1","content":"testo"}]""")
        val attrezzi = JSONArray("""[{"type":"function","function":{"name":"read_file","parameters":{"type":"object"}}}]""")
        val d = TalosMotoreOspiteHttp.domanda(JSONObject().put("model", "x").put("messages", messaggi).put("tools", attrezzi)
            .put("stream", true).put("max_tokens", 300).toString().toByteArray())
        assertEquals(messaggi.toString(), JSONArray(d.messaggiJson).toString())
        assertEquals(attrezzi.toString(), JSONArray(d.attrezziJson).toString())
        assertTrue(d.stream)
        assertTrue(d.pensa)
        assertEquals(300, d.maxToken)
        // il ragionamento spento in uno dei due modi che i client usano
        assertFalse(TalosMotoreOspiteHttp.domanda("""{"messages":[{"role":"user","content":"x"}],"reasoning_effort":"none"}""".toByteArray()).pensa)
        assertFalse(TalosMotoreOspiteHttp.domanda("""{"messages":[{"role":"user","content":"x"}],"reasoning":{"effort":"none"}}""".toByteArray()).pensa)
        assertFalse(TalosMotoreOspiteHttp.domanda("""{"messages":[{"role":"user","content":"x"}],"chat_template_kwargs":{"enable_thinking":false}}""".toByteArray()).pensa)
        // max_completion_tokens vince su max_tokens; senza nessuno dei due, il tetto di serie
        assertEquals(77, TalosMotoreOspiteHttp.domanda("""{"messages":[{"role":"user","content":"x"}],"max_tokens":5,"max_completion_tokens":77}""".toByteArray()).maxToken)
        assertEquals(TalosMotoreOspiteHttp.MAX_TOKEN_DI_SERIE, TalosMotoreOspiteHttp.domanda("""{"messages":[{"role":"user","content":"x"}]}""".toByteArray()).maxToken)
        // tool_choice «none»: niente attrezzi al template; senza tools, null
        assertNull(TalosMotoreOspiteHttp.domanda(JSONObject().put("messages", messaggi).put("tools", attrezzi).put("tool_choice", "none").toString().toByteArray()).attrezziJson)
        assertNull(TalosMotoreOspiteHttp.domanda("""{"messages":[{"role":"user","content":"x"}],"tools":[]}""".toByteArray()).attrezziJson)
        assertFalse(TalosMotoreOspiteHttp.domanda("""{"messages":[{"role":"user","content":"x"}]}""".toByteArray()).stream)
        // senza messaggi, o non JSON: 400
        for (storto in listOf("""{"messages":[]}""", """{"model":"x"}""", "non json", """{"messages":[{"role":"user","content":"x"}],"max_tokens":0}""")) {
            try { TalosMotoreOspiteHttp.domanda(storto.toByteArray()); fail(storto) } catch (e: TalosMotoreOspiteHttp.ErroreHttp) { assertEquals(400, e.stato) }
        }
    }

    @Test
    fun `HTTP-06 i pezzi SSE sono chat completion chunk, poi l'uso e DONE`() {
        val p = TalosMotoreOspiteHttp.pezzo("id1", "m", 7, JSONObject().put("content", "x"), null)
        assertEquals("chat.completion.chunk", p.getString("object"))
        assertEquals("m", p.getString("model"))
        val scelta = p.getJSONArray("choices").getJSONObject(0)
        assertEquals(0, scelta.getInt("index"))
        assertEquals("x", scelta.getJSONObject("delta").getString("content"))
        assertTrue(scelta.isNull("finish_reason"))
        val fine = TalosMotoreOspiteHttp.pezzo("id1", "m", 7, JSONObject(), "tool_calls").getJSONArray("choices").getJSONObject(0)
        assertEquals("tool_calls", fine.getString("finish_reason"))
        val uso = TalosMotoreOspiteHttp.pezzoUso("id1", "m", 7, 2573, 96, null)
        assertEquals(0, uso.getJSONArray("choices").length())
        assertEquals(2573, uso.getJSONObject("usage").getInt("prompt_tokens"))
        assertEquals(96, uso.getJSONObject("usage").getInt("completion_tokens"))
        assertEquals(2669, uso.getJSONObject("usage").getInt("total_tokens"))
        assertEquals("data: {\"a\":1}\n\n", TalosMotoreOspiteHttp.evento(JSONObject().put("a", 1)))
        assertEquals("data: [DONE]\n\n", TalosMotoreOspiteHttp.FINE_SSE)
        // il motivo della fine: attrezzi chiamati, tetto raggiunto, oppure fine normale
        assertEquals("tool_calls", TalosMotoreOspiteHttp.motivoDellaFine(true, false))
        assertEquals("length", TalosMotoreOspiteHttp.motivoDellaFine(false, true))
        assertEquals("stop", TalosMotoreOspiteHttp.motivoDellaFine(false, false))
    }

    @Test
    fun `HTTP-07 senza stream la risposta e un chat completion intero, con ragionamento, attrezzi e uso`() {
        // la forma di `nativeParseReply` (`talos_llama_jni.cpp`: content, reasoning, toolCalls[{name, arguments, id}])
        val msg = JSONObject().put("content", "fatto").put("reasoning", "penso")
            .put("toolCalls", JSONArray().put(JSONObject().put("id", "c1").put("name", "read_file").put("arguments", "{}"))
                .put(JSONObject().put("id", "").put("name", "list_files").put("arguments", "{}")))
        val r = TalosMotoreOspiteHttp.completo("id1", "m", 7, msg, "tool_calls", 10, 4, null)
        assertEquals("chat.completion", r.getString("object"))
        val m = r.getJSONArray("choices").getJSONObject(0).getJSONObject("message")
        assertEquals("assistant", m.getString("role"))
        assertEquals("fatto", m.getString("content"))
        assertEquals("penso", m.getString("reasoning_content"))
        val c = m.getJSONArray("tool_calls").getJSONObject(0)
        assertEquals("c1", c.getString("id"))
        assertEquals("function", c.getString("type"))
        assertEquals("read_file", c.getJSONObject("function").getString("name"))
        assertEquals("{}", c.getJSONObject("function").getString("arguments"))
        // un modello che non dà l'id: ne serve uno, unico nella risposta (r4 abbina i risultati per id)
        val senzaId = m.getJSONArray("tool_calls").getJSONObject(1).getString("id")
        assertTrue(senzaId.isNotEmpty() && senzaId != "c1")
        assertEquals("tool_calls", r.getJSONArray("choices").getJSONObject(0).getString("finish_reason"))
        // senza attrezzi niente `tool_calls`, e un testo vuoto resta una stringa
        val solo = TalosMotoreOspiteHttp.completo("id2", "m", 7, JSONObject().put("content", "").put("reasoning", "").put("toolCalls", JSONArray()), "stop", 1, 1, null)
            .getJSONArray("choices").getJSONObject(0).getJSONObject("message")
        assertFalse(solo.has("tool_calls"))
        assertFalse(solo.has("reasoning_content"))
        assertEquals("", solo.getString("content"))
        assertEquals(14, r.getJSONObject("usage").getInt("total_tokens"))
    }

    @Test
    fun `HTTP-08 le risposte HTTP chiudono la connessione e gli errori sono la busta OpenAI col codice`() {
        val testo = String(TalosMotoreOspiteHttp.risposta(503, TalosMotoreOspiteHttp.errore("LOCAL_ENGINE_BUSY", "busy").toString()), Charsets.UTF_8)
        assertTrue(testo.startsWith("HTTP/1.1 503 "))
        assertTrue(testo.contains("\r\nContent-Type: application/json\r\n"))
        assertTrue(testo.contains("\r\nConnection: close\r\n"))
        val corpo = JSONObject(testo.substringAfter("\r\n\r\n"))
        assertEquals("LOCAL_ENGINE_BUSY", corpo.getJSONObject("error").getString("code"))
        assertTrue(testo.contains("Content-Length: ${corpo.toString().toByteArray().size}\r\n"))
        val sse = String(TalosMotoreOspiteHttp.inizioSse(), Charsets.UTF_8)
        assertTrue(sse.startsWith("HTTP/1.1 200 OK\r\n"))
        assertTrue(sse.contains("\r\nContent-Type: text/event-stream\r\n"))
        assertTrue(sse.contains("\r\nConnection: close\r\n"))
        assertTrue(sse.endsWith("\r\n\r\n"))
    }

    /**
     * HTTP-09 — i `timings` di llama-server (`server_slot_stats::to_json`, b11312 = master del 21/10) dai tempi del motore. Il nativo dà
     * ISTANTI dall'ingresso in JNI: il prompt dura `prefillMs − prefixMs`, la generazione `totalMs − prefillMs` (come
     * `t_token_generation`, dalla fine del prompt). Il Desktop ci stima la durata del riassunto prima di chiamarlo (contratto A1 §5).
     */
    @Test
    fun `HTTP-09 i timings sono quelli di llama-server, calcolati dai tempi del motore`() {
        val nativi = """{"tokenizeMs":20,"prefixMs":120,"prefillMs":2120,"firstTokenMs":2200,"totalMs":6120,"promptTokens":1500,""" +
            """"reusedTokens":1100,"newTokens":400,"producedTokens":80,"reusedContext":true,"partialTrimRefused":false}"""
        val t = TalosMotoreOspiteHttp.tempi(nativi)!!
        assertEquals(1100, t.getInt("cache_n"))
        assertEquals(400, t.getInt("prompt_n"))
        assertEquals(2000.0, t.getDouble("prompt_ms"), 1e-9)
        assertEquals(5.0, t.getDouble("prompt_per_token_ms"), 1e-9)
        assertEquals(200.0, t.getDouble("prompt_per_second"), 1e-9)
        assertEquals(80, t.getInt("predicted_n"))
        assertEquals(4000.0, t.getDouble("predicted_ms"), 1e-9)
        assertEquals(50.0, t.getDouble("predicted_per_token_ms"), 1e-9)
        assertEquals(20.0, t.getDouble("predicted_per_second"), 1e-9)
        assertEquals(
            setOf("cache_n", "prompt_n", "prompt_ms", "prompt_per_token_ms", "prompt_per_second",
                "predicted_n", "predicted_ms", "predicted_per_token_ms", "predicted_per_second"),
            t.keys().asSequence().toSet(),
        )
    }

    /** HTTP-10 — mai numeri inventati: una divisione per zero è `null` (come llama-server serializza inf/NaN); tempi assenti, nessun timings. */
    @Test
    fun `HTTP-10 divisioni per zero null, tempi mancanti o storti niente timings`() {
        val tuttoInCache = """{"prefixMs":100,"prefillMs":100,"totalMs":100,"reusedTokens":900,"newTokens":0,"producedTokens":0}"""
        val t = TalosMotoreOspiteHttp.tempi(tuttoInCache)!!
        assertEquals(0, t.getInt("prompt_n"))
        assertTrue(t.isNull("prompt_per_second"))
        assertTrue(t.isNull("prompt_per_token_ms"))
        assertTrue(t.isNull("predicted_per_second"))
        assertTrue(t.isNull("predicted_per_token_ms"))
        assertEquals(0.0, t.getDouble("prompt_ms"), 1e-9)
        // un giro interrotto prima del primo token ha i tempi a -1: nessun timings
        assertNull(TalosMotoreOspiteHttp.tempi("""{"prefixMs":-1,"prefillMs":-1,"totalMs":-1,"reusedTokens":0,"newTokens":0,"producedTokens":0}"""))
        assertNull(TalosMotoreOspiteHttp.tempi("""{"prefixMs":100,"prefillMs":-1,"totalMs":400,"reusedTokens":0,"newTokens":3,"producedTokens":1}"""))
        assertNull(TalosMotoreOspiteHttp.tempi(null))
        assertNull(TalosMotoreOspiteHttp.tempi(""))
        assertNull(TalosMotoreOspiteHttp.tempi("{storto"))
        // e i pacchetti li portano solo quando ci sono
        val conTempi = TalosMotoreOspiteHttp.pezzoUso("id", "m", 1L, 10, 2, TalosMotoreOspiteHttp.tempi(tuttoInCache))
        assertTrue(conTempi.has("timings"))
        assertFalse(TalosMotoreOspiteHttp.pezzoUso("id", "m", 1L, 10, 2, null).has("timings"))
    }
}
