package ai.talos

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.Callable
import java.util.concurrent.Executors

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): il servizio che risponde a r4 sul socket,
 * con un motore FINTO. Si prova il percorso intero di una domanda: chiave, rotte di `llama-server`, motore occupato o assente,
 * tutto il lavoro del motore sull'ATTORE, streaming (testo, poi chiamate intere, fine, uso, DONE), finestra, r4 che se ne va.
 */
class TalosMotoreOspiteServizioTest {
    private val chiave = "k".repeat(64)
    private val attore = Executors.newSingleThreadExecutor { r -> Thread(r, "attore-finto") }

    /** Un motore che «scrive» `pezzi` uno alla volta e alla fine si legge in `finale`. */
    private inner class Finto(
        val pezzi: List<String> = listOf("Leggo ", "il file"),
        val finale: JSONObject = JSONObject().put("content", "Leggo il file").put("reasoning", "")
            .put("toolCalls", JSONArray().put(JSONObject().put("id", "c1").put("name", "read_file").put("arguments", """{"path":"a"}"""))),
        var esito: TalosMotoreCondiviso.Esito = TalosMotoreCondiviso.Esito.PRESO,
        val promptToken: Int = 100,
        val ctx: Int = 32768,
        val nome: String? = "LFM2.5-2.6B-QAD-Q4_0.gguf",
        // "" = il template di chat del GGUF ha rifiutato la conversazione (il nativo dà un prompt vuoto)
        val prompt: String = "PROMPT",
    ) : TalosMotoreOspiteServizio.MotoreDaServire {
        @Volatile var testo = ""
        var lasciato = 0
        var annullato = 0
        var maxChiesti = -1
        var pensaChiesto: Boolean? = null
        /** La lettura parziale dice anche le chiamate in corso: tutto ciò che segue «CALL:» sono gli argomenti di `scrivi`. */
        var chiamateParziali = false
        var azzeraAnnullamento = false
        /** Il testo che il motore ha ancora dalla risposta di PRIMA, finché la generazione nuova non lo azzera (dopo `ritardoAvvioMs`). */
        var testoDiPrima = ""
        var ritardoAvvioMs = 0L
        /** Le prime `occupatoPerPrese` prese trovano il motore occupato (la chat, o un giro appena abbandonato che si sta fermando). */
        var occupatoPerPrese = 0
        private var prese = 0
        /** Il motore VERO condiviso fra più richieste: una sola lo tiene (`TalosMotoreCondiviso.OCCUPATO`); `null` = come prima. */
        var condiviso: java.util.concurrent.atomic.AtomicBoolean? = null
        @Volatile var generazioni = 0
        val fuoriDallAttore = mutableListOf<String>()
        private fun soloAttore(cosa: String) { if (Thread.currentThread().name != "attore-finto") fuoriDallAttore += cosa }
        override fun prendi(): TalosMotoreCondiviso.Esito {
            val c = condiviso
            if (c != null) return if (c.compareAndSet(false, true)) esito else TalosMotoreCondiviso.Esito.OCCUPATO
            return if (prese++ < occupatoPerPrese) TalosMotoreCondiviso.Esito.OCCUPATO else esito
        }
        override fun lascia() { lasciato += 1; condiviso?.set(false) }
        override fun modello() = nome
        override fun finestra() = ctx
        override fun <T> sullAttore(lavoro: Callable<T>): T = attore.submit(lavoro).get()
        override fun chatPrompt(messaggiJson: String, attrezziJson: String?, pensa: Boolean): String { soloAttore("chatPrompt"); pensaChiesto = pensa; return prompt }
        override fun promptTokens(prompt: String): Int { soloAttore("promptTokens"); return promptToken }
        override fun generateBlocking(prompt: String, maxTokens: Int) {
            soloAttore("generateBlocking"); maxChiesti = maxTokens; generazioni += 1
            if (ritardoAvvioMs > 0) Thread.sleep(ritardoAvvioMs)
            // come `nativeGenerate` (jni:5006): l'avvio azzera la richiesta d'annullamento
            if (azzeraAnnullamento) annullato = 0
            testo = ""
            for (p in pezzi) { if (annullato > 0) return; testo += p; Thread.sleep(40) }
        }
        override fun textSoFar() = testo
        override fun parseReplyPartial(text: String): String {
            val parziale = JSONObject().put("content", text.substringBefore("CALL:")).put("reasoning", "")
            if (chiamateParziali && text.contains("CALL:")) parziale.put("toolCalls", JSONArray().put(JSONObject().put("id", "")
                .put("name", "scrivi").put("arguments", text.substringAfter("CALL:"))))
            return parziale.toString()
        }
        override fun parseReply(text: String): String { soloAttore("parseReply"); return finale.toString() }
        override fun tokensProduced() = pezzi.size
        override fun cancel() { annullato += 1 }
        /** I tempi dell'ultima generazione, nella forma di `nativeLastTimings`; `null` = il motore non li dà. */
        var tempiNativi: String? = """{"tokenizeMs":5,"prefixMs":10,"prefillMs":510,"firstTokenMs":530,"totalMs":1010,"promptTokens":100,""" +
            """"reusedTokens":60,"newTokens":40,"producedTokens":2,"reusedContext":true,"partialTrimRefused":false}"""
        override fun ultimiTempi(): String? = tempiNativi
    }

    private fun chiedi(m: Finto, richiesta: String, uscita: OutputStream = ByteArrayOutputStream()): String {
        TalosMotoreOspiteServizio(chiave, m, { 1_700_000_000L }, 5L).servi(ByteArrayInputStream(richiesta.toByteArray()), uscita)
        return if (uscita is ByteArrayOutputStream) uscita.toString("UTF-8") else ""
    }
    private fun post(corpo: String, chiaveUsata: String = chiave) =
        "POST /v1/chat/completions HTTP/1.1\r\nAuthorization: Bearer $chiaveUsata\r\nContent-Length: ${corpo.toByteArray().size}\r\n\r\n$corpo"
    private fun get(percorso: String) = "GET $percorso HTTP/1.1\r\nAuthorization: Bearer $chiave\r\n\r\n"
    private fun stato(risposta: String) = risposta.substringBefore("\r\n").split(" ")[1].toInt()
    private fun corpo(risposta: String) = JSONObject(risposta.substringAfter("\r\n\r\n"))
    private fun eventi(risposta: String) = risposta.substringAfter("\r\n\r\n").split("\n\n").filter { it.startsWith("data: ") }.map { it.removePrefix("data: ") }
    private val domanda = """{"model":"LFM2.5-2.6B-QAD-Q4_0.gguf","messages":[{"role":"user","content":"leggi a"}],"tools":[{"type":"function","function":{"name":"read_file"}}],"stream":true,"max_tokens":500}"""

    @Test
    fun `SERV-01 senza chiave 401, percorso ignoto 404, metodo sbagliato 405, e il motore non si tocca`() {
        val m = Finto()
        assertEquals(401, stato(chiedi(m, post(domanda, "x".repeat(64)))))
        assertEquals(401, stato(chiedi(m, "GET /props HTTP/1.1\r\n\r\n")))
        assertEquals(404, stato(chiedi(m, get("/v1/embeddings"))))
        assertEquals(405, stato(chiedi(m, get("/v1/chat/completions"))))
        assertEquals(0, m.lasciato)
        assertEquals(-1, m.maxChiesti)
    }

    @Test
    fun `SERV-02 props e models come llama-server, senza modello 503 LOCAL_RUNTIME_NOT_READY`() {
        val props = corpo(chiedi(Finto(), get("/props")))
        assertEquals(32768, props.getJSONObject("default_generation_settings").getInt("n_ctx"))
        val modelli = corpo(chiedi(Finto(), get("/v1/models")))
        assertEquals("list", modelli.getString("object"))
        assertEquals("LFM2.5-2.6B-QAD-Q4_0.gguf", modelli.getJSONArray("data").getJSONObject(0).getString("id"))
        val senza = chiedi(Finto(nome = null), get("/props"))
        assertEquals(503, stato(senza))
        assertEquals("LOCAL_RUNTIME_NOT_READY", corpo(senza).getJSONObject("error").getString("code"))
    }

    @Test
    fun `SERV-03 lo streaming porta il testo a pezzi, poi le chiamate intere, la fine, l'uso e DONE, tutto dall'attore`() {
        val m = Finto()
        val risposta = chiedi(m, post(domanda))
        assertEquals(200, stato(risposta))
        assertTrue(risposta.contains("Content-Type: text/event-stream"))
        val ev = eventi(risposta)
        assertEquals("[DONE]", ev.last())
        val pezzi = ev.dropLast(1).map { JSONObject(it) }
        val testo = pezzi.mapNotNull { p -> p.getJSONArray("choices").optJSONObject(0)?.getJSONObject("delta")?.optString("content", null) }.joinToString("")
        assertEquals("Leggo il file", testo)
        val chiamate = pezzi.mapNotNull { p -> p.getJSONArray("choices").optJSONObject(0)?.getJSONObject("delta")?.optJSONArray("tool_calls") }
        assertEquals(1, chiamate.size)
        assertEquals("read_file", chiamate[0].getJSONObject(0).getJSONObject("function").getString("name"))
        val fine = pezzi.mapNotNull { p -> p.getJSONArray("choices").optJSONObject(0)?.optString("finish_reason", "")?.takeIf { it.isNotEmpty() && it != "null" } }
        assertEquals(listOf("tool_calls"), fine)
        val uso = pezzi.last().getJSONObject("usage")
        assertEquals(100, uso.getInt("prompt_tokens"))
        assertEquals(2, uso.getInt("completion_tokens"))
        assertEquals(1, m.lasciato)
        assertEquals(emptyList<String>(), m.fuoriDallAttore)
        assertEquals(500, m.maxChiesti)
        assertEquals(true, m.pensaChiesto)
    }

    @Test
    fun `SERV-04 motore occupato 503 LOCAL_ENGINE_BUSY, nessun modello 503 LOCAL_RUNTIME_NOT_READY, e niente si genera`() {
        val occupato = Finto(esito = TalosMotoreCondiviso.Esito.OCCUPATO)
        val r = chiedi(occupato, post(domanda))
        assertEquals(503, stato(r))
        assertEquals("LOCAL_ENGINE_BUSY", corpo(r).getJSONObject("error").getString("code"))
        assertEquals(-1, occupato.maxChiesti)
        assertEquals(0, occupato.lasciato)
        val assente = Finto(esito = TalosMotoreCondiviso.Esito.NESSUN_MODELLO)
        assertEquals("LOCAL_RUNTIME_NOT_READY", corpo(chiedi(assente, post(domanda))).getJSONObject("error").getString("code"))
    }

    @Test
    fun `SERV-05 senza stream un chat completion intero, tetto raggiunto e length, il tetto non supera la finestra`() {
        val m = Finto(pezzi = listOf("a", "b", "c"), finale = JSONObject().put("content", "abc").put("reasoning", "").put("toolCalls", JSONArray()))
        val r = corpo(chiedi(m, post("""{"messages":[{"role":"user","content":"x"}],"max_tokens":3}""")))
        assertEquals("chat.completion", r.getString("object"))
        assertEquals("abc", r.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content"))
        assertEquals("length", r.getJSONArray("choices").getJSONObject(0).getString("finish_reason"))
        // un tetto più grande della finestra si riduce a quanto resta (finestra − prompt − 1)
        val stretto = Finto(ctx = 4096, promptToken = 4000)
        chiedi(stretto, post("""{"messages":[{"role":"user","content":"x"}],"max_tokens":3000}"""))
        assertEquals(95, stretto.maxChiesti)
        assertEquals(1, stretto.lasciato)
    }

    @Test
    fun `SERV-06 un prompt che non lascia spazio nella finestra e 400 CONTEXT_LENGTH_EXCEEDED, e il motore torna libero`() {
        val m = Finto(ctx = 4096, promptToken = 4096)
        val r = chiedi(m, post(domanda))
        assertEquals(400, stato(r))
        assertEquals("CONTEXT_LENGTH_EXCEEDED", corpo(r).getJSONObject("error").getString("code"))
        assertEquals(-1, m.maxChiesti)
        assertEquals(1, m.lasciato)
        // 22/10/2026: i numeri, nei campi di llama-server che r4 legge (`n_prompt_tokens`, `n_ctx`): la frase a schermo li dice
        assertEquals(4096, corpo(r).getJSONObject("error").getInt("n_prompt_tokens"))
        assertEquals(4096, corpo(r).getJSONObject("error").getInt("n_ctx"))
    }

    /**
     * SERV-26 — Pad 22/10/2026, Qwen3.5-2B Q4_0 nel Codice: il template Jinja del GGUF rifiutava la conversazione («System message
     * must be at the beginning») e il nativo dava un prompt VUOTO, che qui diventava CONTEXT_LENGTH_EXCEEDED con una finestra di
     * 24576 e un prompt di ~5.7k: un'etichetta falsa. Il template fallito è un rifiuto della richiesta (codice suo, MAI il contesto
     * pieno): r4 riprova senza attrezzi e, se resta, dice «il motore locale non ha accettato questa richiesta» (Desktop, 22/10).
     */
    @Test
    fun `SERV-26 un template che rifiuta la conversazione e 400 CHAT_TEMPLATE_FAILED, mai il contesto pieno, e il motore torna libero`() {
        val m = Finto(prompt = "", promptToken = 0)
        val r = chiedi(m, post(domanda))
        assertEquals(400, stato(r))
        val errore = corpo(r).getJSONObject("error")
        assertEquals("CHAT_TEMPLATE_FAILED", errore.getString("code"))
        assertFalse(errore.toString().contains("context", ignoreCase = true))
        assertEquals(-1, m.maxChiesti)
        assertEquals(0, m.generazioni)
        assertEquals(1, m.lasciato)
    }

    @Test
    fun `SERV-07 r4 che chiude la connessione a meta giro annulla la generazione e libera il motore`() {
        val m = Finto(pezzi = List(20) { "x" })
        var scritti = 0
        val chiusa = object : OutputStream() {
            override fun write(b: Int) { throw IOException("chiusa") }
            override fun write(b: ByteArray, off: Int, len: Int) { scritti += 1; if (scritti > 2) throw IOException("chiusa") }
        }
        chiedi(m, post(domanda), chiusa)
        assertTrue(m.annullato >= 1)
        assertEquals(1, m.lasciato)
        assertFalse(m.testo.length >= 20)
    }

    @Test
    fun `SERV-08 il ragionamento spento arriva al template`() {
        val m = Finto()
        chiedi(m, post("""{"messages":[{"role":"user","content":"x"}],"reasoning_effort":"none","stream":true}"""))
        assertEquals(false, m.pensaChiesto)
    }

    @Test
    fun `SERV-09 se nella chat e stato aperto un altro modello, il Codice lo sa invece di parlarci in silenzio`() {
        val m = Finto()
        val r = chiedi(m, post("""{"model":"Qwen3-4B.gguf","messages":[{"role":"user","content":"x"}],"stream":true}"""))
        assertEquals(409, stato(r))
        assertEquals("LOCAL_MODEL_CHANGED", corpo(r).getJSONObject("error").getString("code"))
        assertEquals(-1, m.maxChiesti)
        assertEquals(1, m.lasciato)
        // il nome giusto, o nessun nome, passa
        assertEquals(200, stato(chiedi(Finto(), post("""{"model":"LFM2.5-2.6B-QAD-Q4_0.gguf","messages":[{"role":"user","content":"x"}]}"""))))
        // r4 valida gli id senza badare alle maiuscole (contratto del Desktop, 4e8b977f1): lo stesso nome in minuscolo è lo stesso modello
        assertEquals(200, stato(chiedi(Finto(), post("""{"model":"lfm2.5-2.6b-qad-q4_0.gguf","messages":[{"role":"user","content":"x"}]}"""))))
    }

    /*
     * Sessione lunga sul Pad, 21/10/2026 (r4 625f422a7, LFM2.5-2.6B locale): al 12° passo il motore ha taciuto 5 minuti; r4 ha chiuso
     * la richiesta e l'ha ripresentata dopo 0,7 s; il motore, che non scriveva niente e quindi non sapeva che r4 se n'era andato,
     * stava ancora generando per nessuno ⇒ LOCAL_ENGINE_BUSY e giro morto; e il giro dopo è partito solo 7 minuti più tardi.
     * llama-server fa lo stesso lavoro coi «SSE comment pings» (`--sse-ping-interval`, di serie 30 s, tools/server/README.md).
     */
    private fun servizioVivo(m: Finto, pingMs: Long = 50L, attesaOccupatoMs: Long = 0L, sorveglia: Boolean = false) =
        TalosMotoreOspiteServizio(chiave, m, { 1_700_000_000L }, 5L, pingMs, attesaOccupatoMs, sorveglia)

    @Test
    fun `SERV-10 mentre il motore tace lo stream porta un ping, come llama-server, e i ping non sono dati`() {
        val m = Finto(pezzi = List(12) { "" } + listOf("fine"))
        val uscita = ByteArrayOutputStream()
        servizioVivo(m).servi(ByteArrayInputStream(post(domanda).toByteArray()), uscita)
        val r = uscita.toString("UTF-8")
        assertTrue("nessun ping in ${r.length} byte", r.contains("\n: ping\n\n") || r.contains("\r\n\r\n: ping\n\n"))
        assertTrue(eventi(r).none { it.contains("ping") })
        assertTrue(r.trimEnd().endsWith("data: [DONE]"))
    }

    @Test
    fun `SERV-11 r4 che se ne va mentre il motore tace annulla subito la generazione e libera il motore`() {
        val m = Finto(pezzi = List(100) { "" })
        val dentro = PipedInputStream(64 * 1024)
        val fuori = PipedOutputStream(dentro)
        fuori.write(post(domanda).toByteArray())
        fuori.flush()
        Thread { Thread.sleep(150); fuori.close() }.start()
        val t0 = System.nanoTime()
        servizioVivo(m, pingMs = 60_000L, sorveglia = true).servi(dentro, ByteArrayOutputStream())
        val ms = (System.nanoTime() - t0) / 1_000_000
        assertTrue(m.annullato >= 1)
        assertEquals(1, m.lasciato)
        assertTrue("ci ha messo $ms ms: la generazione non è stata fermata", ms < 2_000)
    }

    @Test
    fun `SERV-12 un motore occupato per un attimo si aspetta, uno occupato davvero resta LOCAL_ENGINE_BUSY`() {
        val breve = Finto().apply { occupatoPerPrese = 3 }
        val uscita = ByteArrayOutputStream()
        servizioVivo(breve, attesaOccupatoMs = 2_000L).servi(ByteArrayInputStream(post(domanda).toByteArray()), uscita)
        assertEquals(200, stato(uscita.toString("UTF-8")))
        val sempre = Finto(esito = TalosMotoreCondiviso.Esito.OCCUPATO)
        val altra = ByteArrayOutputStream()
        servizioVivo(sempre, attesaOccupatoMs = 200L).servi(ByteArrayInputStream(post(domanda).toByteArray()), altra)
        assertEquals("LOCAL_ENGINE_BUSY", corpo(altra.toString("UTF-8")).getJSONObject("error").getString("code"))
    }

    /** Desktop 21/10: «un registro nativo con l'ora di ogni token lo dice subito». Il diario dice quanto il motore produce e quanto esce. */
    @Test
    fun `SERV-13 il diario dice ogni tanto quanti token ha prodotto il motore e quanto testo e uscito`() {
        val righe = java.util.Collections.synchronizedList(mutableListOf<String>())
        val m = Finto(pezzi = List(12) { "" } + listOf("fine"))
        servizioVivo(m).apply { diario = java.util.function.Consumer { righe += it } }
            .servi(ByteArrayInputStream(post(domanda).toByteArray()), ByteArrayOutputStream())
        assertTrue(righe.joinToString(), righe.any { it.contains("token=") && it.contains("grezzo=") && it.contains("uscito=") })
        assertTrue(righe.joinToString(), righe.any { it.startsWith("fine") })
    }

    /*
     * Diario del motore sul Pad, 21/10 14:21:49 (`chatcmpl-…230e9322`): nei primi 15 s erano «usciti» 5.411 caratteri con token=0 e
     * testo grezzo vuoto — il testo della risposta PRECEDENTE, ancora nel buffer del motore, mandato a r4 come inizio della nuova
     * prima che la generazione lo azzerasse. r4 ha armato il guardiano dei dati (300 s) su un dato finto, il prefill di 16k token è
     * durato di più, e la richiesta è morta. Nessun testo vecchio deve uscire.
     */
    @Test
    fun `SERV-14 il testo della risposta di prima non esce come inizio di quella nuova`() {
        val m = Finto(pezzi = listOf("nuovo"), finale = JSONObject().put("content", "nuovo").put("reasoning", "").put("toolCalls", JSONArray()))
        m.testo = "RISPOSTA VECCHIA del giro di prima"
        m.ritardoAvvioMs = 200L
        val uscita = ByteArrayOutputStream()
        servizioVivo(m, pingMs = 0L).servi(ByteArrayInputStream(post(domanda).toByteArray()), uscita)
        val r = uscita.toString("UTF-8")
        assertFalse("il testo vecchio è uscito: $r", r.contains("VECCHIA"))
        assertTrue(eventi(r).any { it.contains("nuovo") })
    }

    /** Diario del Pad 21/10 (`…5247ca31`): una chiamata lunga teneva r4 senza dati. Gli argomenti escono a pezzi mentre il modello scrive. */
    @Test
    fun `SERV-15 una chiamata lunga esce a pezzi mentre il modello la scrive, e alla fine solo il resto`() {
        val argomenti = """{"percorso":"a.js","contenuto":"""" + "x".repeat(60) + """"}"""
        val pezzi = listOf("Scrivo il file. ", "CALL:") + argomenti.chunked(8)
        val m = Finto(pezzi = pezzi, finale = JSONObject().put("content", "Scrivo il file. ").put("reasoning", "")
            .put("toolCalls", JSONArray().put(JSONObject().put("id", "").put("name", "scrivi").put("arguments", argomenti))))
        m.chiamateParziali = true
        val uscita = ByteArrayOutputStream()
        servizioVivo(m, pingMs = 0L).servi(ByteArrayInputStream(post(domanda).toByteArray()), uscita)
        val ev = eventi(uscita.toString("UTF-8")).filter { it != "[DONE]" }.map { JSONObject(it) }
            .filter { it.getJSONArray("choices").length() > 0 }
        val conChiamate = ev.withIndex().filter { (_, e) -> e.getJSONArray("choices").getJSONObject(0).getJSONObject("delta").has("tool_calls") }
        assertTrue("la chiamata è uscita in un pezzo solo", conChiamate.size >= 3)
        val primoTesto = ev.indexOfFirst { it.getJSONArray("choices").getJSONObject(0).getJSONObject("delta").has("content") }
        assertTrue("il testo prima della chiamata esce prima", primoTesto in 0 until conChiamate.first().index)
        val concatenati = conChiamate.joinToString("") { (_, e) ->
            e.getJSONArray("choices").getJSONObject(0).getJSONObject("delta").getJSONArray("tool_calls").getJSONObject(0)
                .getJSONObject("function").optString("arguments", "")
        }
        assertEquals(argomenti, concatenati)
    }

    /*
     * Revisione avversaria (3): r4 che chiude fra l'intestazione SSE e l'avvio della generazione. La sentinella annullava, ma l'avvio
     * della generazione azzera l'annullamento (`nativeGenerate`, jni:5006) e la generazione andava fino in fondo per nessuno.
     */
    @Test
    fun `SERV-16 un annullamento arrivato prima dell'avvio della generazione non si perde`() {
        val m = Finto(pezzi = List(100) { "" })
        m.ritardoAvvioMs = 300L
        m.azzeraAnnullamento = true
        val dentro = PipedInputStream(64 * 1024)
        val fuori = PipedOutputStream(dentro)
        fuori.write(post(domanda).toByteArray())
        fuori.flush()
        Thread { Thread.sleep(50); fuori.close() }.start()
        val t0 = System.nanoTime()
        servizioVivo(m, pingMs = 60_000L, sorveglia = true).servi(dentro, ByteArrayOutputStream())
        val ms = (System.nanoTime() - t0) / 1_000_000
        assertTrue("ci ha messo $ms ms: l'annullamento si è perso", ms < 2_500)
    }

    private fun postA(percorso: String, corpo: String) =
        "POST $percorso HTTP/1.1\r\nAuthorization: Bearer $chiave\r\nContent-Length: ${corpo.toByteArray().size}\r\n\r\n$corpo"
    private val domandaFerma = domanda.replace("\"stream\":true", "\"stream\":false")

    /*
     * Giro 16 sul Pad, 21/10 17:30: il precalcolo del riassunto di r4 teneva il motore e la richiesta successiva DEL GIRO (stesso
     * socket, stesso cliente) ha avuto 503 LOCAL_ENGINE_BUSY dopo 3 s ⇒ giro chiuso in errore. Accordo col Desktop: una richiesta
     * del socket che trova il motore tenuto da un'altra richiesta del socket aspetta in coda finché la connessione è aperta.
     */
    @Test
    fun `SERV-17 una richiesta del socket aspetta in coda quella che tiene il motore, poi risponde`() {
        val m = Finto(pezzi = List(20) { "x" }).apply { condiviso = java.util.concurrent.atomic.AtomicBoolean(false) }
        val s = servizioVivo(m, pingMs = 50L, attesaOccupatoMs = 100L)
        val primaUscita = ByteArrayOutputStream()
        val prima = Thread { s.servi(ByteArrayInputStream(post(domanda).toByteArray()), primaUscita) }
        prima.start()
        Thread.sleep(150)
        val secondaUscita = ByteArrayOutputStream()
        s.servi(ByteArrayInputStream(post(domandaFerma).toByteArray()), secondaUscita)
        prima.join(10_000)
        assertEquals(200, stato(primaUscita.toString("UTF-8")))
        assertEquals("la seconda doveva aspettare, non dire occupato", 200, stato(secondaUscita.toString("UTF-8")))
        assertEquals(2, m.generazioni)
        assertEquals(2, m.lasciato)
    }

    /** In coda con lo streaming: l'intestazione SSE subito e i ping; se r4 se ne va mentre aspetta, il motore non si prende. */
    @Test
    fun `SERV-18 in coda lo stream porta i ping, e se r4 se ne va il motore non si prende`() {
        val m = Finto(pezzi = List(60) { "" }).apply { condiviso = java.util.concurrent.atomic.AtomicBoolean(false) }
        val s = servizioVivo(m, pingMs = 50L, attesaOccupatoMs = 100L)
        val prima = Thread { s.servi(ByteArrayInputStream(post(domanda).toByteArray()), ByteArrayOutputStream()) }
        prima.start()
        Thread.sleep(150)
        val visto = StringBuilder()
        val r4CheSeNeVa = object : OutputStream() {
            override fun write(b: Int) = write(byteArrayOf(b.toByte()), 0, 1)
            override fun write(b: ByteArray, off: Int, len: Int) {
                if (visto.contains(": ping")) throw IOException("r4 ha chiuso")
                visto.append(String(b, off, len, Charsets.UTF_8))
            }
        }
        val t0 = System.nanoTime()
        s.servi(ByteArrayInputStream(post(domanda).toByteArray()), r4CheSeNeVa)
        val ms = (System.nanoTime() - t0) / 1_000_000
        prima.join(10_000)
        assertTrue(visto.toString(), visto.contains("text/event-stream") && visto.contains(": ping"))
        assertTrue("la seconda doveva uscire appena r4 se n'è andato, ci ha messo $ms ms", ms < 1_500)
        assertEquals("il motore non doveva essere preso dalla seconda", 1, m.generazioni)
    }

    /** AL CONTRARIO: il motore tenuto da fuori dal socket (la chat dell'app) resta LOCAL_ENGINE_BUSY dopo l'attesa breve. */
    @Test
    fun `SERV-19 il motore tenuto dalla chat resta LOCAL_ENGINE_BUSY`() {
        val m = Finto().apply { condiviso = java.util.concurrent.atomic.AtomicBoolean(true) }
        val t0 = System.nanoTime()
        val r = ByteArrayOutputStream().also { servizioVivo(m, attesaOccupatoMs = 100L).servi(ByteArrayInputStream(post(domanda).toByteArray()), it) }.toString("UTF-8")
        assertEquals(503, stato(r))
        assertEquals("LOCAL_ENGINE_BUSY", corpo(r).getJSONObject("error").getString("code"))
        assertTrue((System.nanoTime() - t0) / 1_000_000 < 1_500)
    }

    /*
     * Il controllo della finestra di r4 contava con un'euristica (34.136 contro 23.851 esatti, giro 16). `/tokenize` col contratto di
     * vLLM (`TokenizeChatRequest`): lo stesso corpo della chat completion, e torna `count` e `max_model_len`.
     */
    @Test
    fun `SERV-20 tokenize col corpo della chat dice i token esatti e la finestra, senza generare`() {
        val m = Finto(promptToken = 23851)
        val r = chiedi(m, postA("/tokenize", """{"model":"LFM2.5-2.6B-QAD-Q4_0.gguf","messages":[{"role":"user","content":"leggi a"}],"tools":[{"type":"function","function":{"name":"read_file"}}]}"""))
        assertEquals(200, stato(r))
        assertEquals(23851, corpo(r).getInt("count"))
        assertEquals(32768, corpo(r).getInt("max_model_len"))
        assertEquals(0, m.generazioni)
        assertEquals(1, m.lasciato)
        assertEquals(emptyList<String>(), m.fuoriDallAttore)
        assertEquals(200, stato(chiedi(Finto(), postA("/v1/tokenize", """{"messages":[{"role":"user","content":"x"}]}"""))))
    }

    @Test
    fun `SERV-21 tokenize senza messaggi 400, con GET 405, e il motore non si tocca`() {
        val m = Finto()
        val senza = chiedi(m, postA("/tokenize", """{"model":"x"}"""))
        assertEquals(400, stato(senza))
        assertEquals("MESSAGES_REQUIRED", corpo(senza).getJSONObject("error").getString("code"))
        assertEquals(405, stato(chiedi(m, get("/tokenize"))))
        assertEquals(0, m.lasciato)
    }

    /** Un rifiuto dopo la coda, a flusso già aperto: un pacchetto d'errore come OpenRouter (r4 lo legge) e DONE, mai un secondo HTTP. */
    @Test
    fun `SERV-22 un rifiuto arrivato dopo la coda esce come pacchetto d'errore dentro lo stream`() {
        val m = Finto(pezzi = List(10) { "x" }).apply { condiviso = java.util.concurrent.atomic.AtomicBoolean(false) }
        val s = servizioVivo(m, pingMs = 50L, attesaOccupatoMs = 100L)
        val prima = Thread { s.servi(ByteArrayInputStream(post(domanda).toByteArray()), ByteArrayOutputStream()) }
        prima.start()
        Thread.sleep(150)
        val uscita = ByteArrayOutputStream()
        s.servi(ByteArrayInputStream(post(domanda.replace("LFM2.5-2.6B-QAD-Q4_0.gguf", "altro.gguf")).toByteArray()), uscita)
        prima.join(10_000)
        val r = uscita.toString("UTF-8")
        assertEquals(200, stato(r))
        assertEquals("una sola risposta HTTP", 1, Regex("HTTP/1\\.1 ").findAll(r).count())
        val ev = eventi(r)
        assertEquals("[DONE]", ev.last())
        val errore = JSONObject(ev[ev.size - 2])
        assertEquals("LOCAL_MODEL_CHANGED", errore.getJSONObject("error").getString("code"))
        assertEquals("error", errore.getJSONArray("choices").getJSONObject(0).getString("finish_reason"))
        assertEquals(1, m.generazioni)
    }

    /** Mutante Q5 rimasto vivo: uno stream messo in coda che poi genera porta UNA sola intestazione, e la risposta intera. */
    @Test
    fun `SERV-23 uno stream in coda che poi genera ha una sola intestazione e la risposta intera`() {
        val m = Finto(pezzi = List(10) { "x" }).apply { condiviso = java.util.concurrent.atomic.AtomicBoolean(false) }
        val s = servizioVivo(m, pingMs = 50L, attesaOccupatoMs = 100L)
        val prima = Thread { s.servi(ByteArrayInputStream(post(domanda).toByteArray()), ByteArrayOutputStream()) }
        prima.start()
        Thread.sleep(150)
        val uscita = ByteArrayOutputStream()
        s.servi(ByteArrayInputStream(post(domanda).toByteArray()), uscita)
        prima.join(10_000)
        val r = uscita.toString("UTF-8")
        assertEquals(200, stato(r))
        assertEquals("una sola intestazione", 1, Regex("HTTP/1\\.1 ").findAll(r).count())
        assertEquals(1, Regex("text/event-stream").findAll(r).count())
        assertEquals("[DONE]", eventi(r).last())
        assertEquals(2, m.generazioni)
    }

    /** Mutante T4 rimasto vivo: contare non chiede `max_tokens`, nemmeno quando il corpo della chat lo porta a 0. */
    @Test
    fun `SERV-24 tokenize conta anche un corpo con max_tokens a zero`() {
        val r = chiedi(Finto(), postA("/tokenize", """{"messages":[{"role":"user","content":"x"}],"max_tokens":0}"""))
        assertEquals(200, stato(r))
        assertEquals(100, corpo(r).getInt("count"))
    }

    /**
     * SERV-26 — i `timings` di llama-server sull'ULTIMO pacchetto (quello dell'uso, come `server-task.cpp:517`) e nel corpo senza
     * stream: il Desktop ci legge `prompt_per_second` per stimare quanto durerà il riassunto (contratto A1 §5). Senza tempi, niente.
     */
    @Test
    fun `SERV-26 i timings arrivano nell'ultimo pacchetto e nel corpo senza stream, mai inventati`() {
        val m = Finto()
        val pezzi = eventi(chiedi(m, post(domanda))).dropLast(1).map { JSONObject(it) }
        val ultimo = pezzi.last()
        assertTrue(ultimo.has("usage"))
        val t = ultimo.getJSONObject("timings")
        assertEquals(40, t.getInt("prompt_n"))
        assertEquals(60, t.getInt("cache_n"))
        assertEquals(80.0, t.getDouble("prompt_per_second"), 1e-9)
        assertEquals(2, t.getInt("predicted_n"))
        assertEquals(1, pezzi.count { it.has("timings") })

        val intero = corpo(chiedi(Finto(), post("""{"messages":[{"role":"user","content":"x"}],"max_tokens":50}""")))
        assertEquals(500.0, intero.getJSONObject("timings").getDouble("prompt_ms"), 1e-9)

        val senza = Finto().apply { tempiNativi = null }
        val pezziSenza = eventi(chiedi(senza, post(domanda))).dropLast(1).map { JSONObject(it) }
        assertTrue(pezziSenza.none { it.has("timings") })
        assertFalse(corpo(chiedi(Finto().apply { tempiNativi = null }, post("""{"messages":[{"role":"user","content":"x"}]}"""))).has("timings"))
    }

    /**
     * SERV-25 — anche SENZA streaming, r4 che chiude la connessione ferma la generazione e libera il motore, come llama-server
     * (`server-context.cpp:4333`, `rd.wait_for_all(req.should_stop)`: una connessione chiusa annulla il lavoro anche senza stream).
     * Prima il ramo senza stream non aveva la sentinella: il giro arrivava fino a `max_tokens` e la richiesta dopo aspettava in coda.
     * Chiesto dal Desktop il 21/10 come rete per chi chiama senza stream.
     */
    @Test
    fun `SERV-25 senza stream r4 che chiude la connessione annulla la generazione e libera il motore`() {
        val m = Finto(pezzi = List(100) { "x" }, finale = JSONObject().put("content", "x").put("reasoning", "").put("toolCalls", JSONArray()))
        val dentro = PipedInputStream(64 * 1024)
        val fuori = PipedOutputStream(dentro)
        fuori.write(post("""{"messages":[{"role":"user","content":"x"}],"stream":false,"max_tokens":200}""").toByteArray())
        fuori.flush()
        Thread { Thread.sleep(150); fuori.close() }.start()
        val uscita = ByteArrayOutputStream()
        val t0 = System.nanoTime()
        servizioVivo(m, pingMs = 60_000L, sorveglia = true).servi(dentro, uscita)
        val ms = (System.nanoTime() - t0) / 1_000_000
        assertTrue(m.annullato >= 1)
        assertEquals(1, m.lasciato)
        assertTrue("ci ha messo $ms ms: la generazione senza stream non è stata fermata", ms < 2_000)
        assertFalse(m.testo.length >= 100)
        // nessuno ascolta più: non si scrive una risposta a una connessione chiusa
        assertEquals("", uscita.toString(Charsets.UTF_8))
    }

    @Test
    fun `SERV-25b senza stream e con la connessione aperta la sentinella non tocca niente e la risposta arriva intera`() {
        val m = Finto(pezzi = listOf("a", "b", "c"), finale = JSONObject().put("content", "abc").put("reasoning", "").put("toolCalls", JSONArray()))
        val dentro = PipedInputStream(64 * 1024)
        val fuori = PipedOutputStream(dentro)
        fuori.write(post("""{"messages":[{"role":"user","content":"x"}],"stream":false,"max_tokens":50}""").toByteArray())
        fuori.flush()
        val uscita = ByteArrayOutputStream()
        servizioVivo(m, pingMs = 60_000L, sorveglia = true).servi(dentro, uscita)
        fuori.close()
        assertEquals(0, m.annullato)
        assertEquals(1, m.lasciato)
        val r = corpo(uscita.toString(Charsets.UTF_8))
        assertEquals("abc", r.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content"))
    }
}
