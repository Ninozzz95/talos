package ai.talos.remoto

import ai.talos.remoto.TalosSvegliaAvvisi.Tipo
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): dopo una sveglia il telefono legge `sessions.list` del PC e
 * sceglie QUALI notifiche mostrare. Il PC non dice perché ha svegliato (carico `{v, w}`, Sygnal `event_id_only`): lo si capisce dalle
 * righe, con le STESSE regole del PC (`sveglia.mjs`, r4 a16cb10e7 + la cura del Desktop del 21/10): richieste della persona; per una
 * figlia (`padreId` o `profonditaDelega > 0`) solo MCP e piano sulla SUA riga (permesso e domanda passano dalla madre,
 * `inAttesaDiscendente`, C2-R7); giro chiuso = `fineGiroAlle` (scritto su RunFinished e RunError; `null` = nessun giro chiuso noto),
 * avvisa solo se fallito o lungo (≥ 2 min fra `inizioGiroAlle` e `fineGiroAlle`), mai la fine di un passo di Workflow, mai
 * 'fermata'/'in-pausa'.
 */
class TalosSvegliaAvvisiTest {
    private fun riga(id: String, vararg campi: Pair<String, Any?>) = JSONObject().put("sessionId", id).apply {
        for ((k, v) in campi) put(k, v ?: JSONObject.NULL)
    }

    private fun elenco(vararg righe: JSONObject) = JSONArray().apply { righe.forEach { put(it) } }

    /** Un giro chiuso che dura `minuti`, finito alle 10:00 del 21/10 (più `spostamento` minuti). */
    private fun giro(minuti: Int, esito: String = "ok", motivo: String? = null, spostamento: Int = 0): Array<Pair<String, Any?>> {
        val fine = java.time.Instant.parse("2026-10-21T10:00:00Z").plusSeconds(spostamento * 60L)
        return arrayOf("conclusa" to true, "ultimoEsito" to esito, "motivoChiusura" to motivo,
            "inizioGiroAlle" to fine.minusSeconds(minuti * 60L).toString(), "fineGiroAlle" to fine.toString())
    }

    @Test
    fun `SVA-01 ogni richiesta della persona diventa un avviso del suo tipo, le richieste prima dei giri finiti`() {
        val righe = elenco(
            riga("s-fine", *giro(3)),
            riga("s-perm", "nome" to "Login", "inAttesaApprovazione" to true),
            riga("s-dom", "inAttesaDomanda" to true),
            riga("s-piano", "inAttesaPiano" to true),
            riga("s-mcp", "inAttesaRichiestaMcp" to true),
            riga("s-niente"),
        )
        val (avvisi, _) = TalosSvegliaAvvisi.scegli(righe, firmePrima = emptyMap(), attivataAlle = 0)
        assertEquals(listOf("s-perm" to Tipo.PERMESSO, "s-dom" to Tipo.DOMANDA, "s-piano" to Tipo.PIANO, "s-mcp" to Tipo.MCP, "s-fine" to Tipo.FINITO),
            avvisi.map { it.sessionId to it.tipo })
        assertEquals("Login", avvisi.first().nome)
        assertEquals(java.time.Instant.parse("2026-10-21T10:00:00Z").toEpochMilli(), avvisi.last().alle)
    }

    @Test
    fun `SVA-02 la madre porta permesso e domanda della figlia - la figlia ha solo MCP e piano suoi, sulla sua riga`() {
        val righe = elenco(
            riga("madre", "inAttesaDiscendente" to true),
            riga("figlia", "padreId" to "madre", "profonditaDelega" to 1, "inAttesaDomanda" to true),
            riga("nipote-sola", "profonditaDelega" to 2, "inAttesaApprovazione" to true),
            riga("figlia-mcp", "padreId" to "madre", "profonditaDelega" to 1, "inAttesaRichiestaMcp" to true),
            riga("figlia-finita", "padreId" to "madre", *giro(9, "errore", "errore")),
        )
        val (avvisi, _) = TalosSvegliaAvvisi.scegli(righe, firmePrima = emptyMap(), attivataAlle = 0)
        assertEquals(listOf("madre" to Tipo.AIUTANTE, "figlia-mcp" to Tipo.MCP), avvisi.map { it.sessionId to it.tipo })
        assertEquals("figlia", avvisi[0].chiedeDa)
    }

    @Test
    fun `SVA-03 finito e fallito si distinguono - fermata e in pausa non avvisano - un giro gia visto non torna`() {
        val righe = elenco(
            riga("ok", *giro(3)),
            riga("ko", *giro(0, "errore", "giri-finiti")),
            riga("ferma", *giro(5, "errore", "fermata")),
            riga("pausa", *giro(5, "errore", "in-pausa")),
        )
        val (avvisi, firme) = TalosSvegliaAvvisi.scegli(righe, firmePrima = emptyMap(), attivataAlle = 0)
        assertEquals(listOf("ok" to Tipo.FINITO, "ko" to Tipo.FALLITO), avvisi.map { it.sessionId to it.tipo })
        val (dopo, _) = TalosSvegliaAvvisi.scegli(righe, firmePrima = firme, attivataAlle = 0)
        assertTrue(dopo.isEmpty())
        val ancora = elenco(riga("ok", *giro(3, spostamento = 5)))
        assertEquals(listOf(Tipo.FINITO), TalosSvegliaAvvisi.scegli(ancora, firmePrima = firme, attivataAlle = 0).first.map { it.tipo })
    }

    @Test
    fun `SVA-04 alla prima sveglia i giri chiusi prima dell'attivazione fanno da base e non avvisano`() {
        val attivata = java.time.Instant.parse("2026-10-21T09:00:00Z").toEpochMilli()
        val righe = elenco(
            riga("vecchio", *giro(5, spostamento = -24 * 60)),
            riga("vecchio-ko", *giro(1, "errore", "errore", spostamento = -120)),
            riga("nuovo", *giro(5)),
        )
        val (avvisi, firme) = TalosSvegliaAvvisi.scegli(righe, firmePrima = null, attivataAlle = attivata)
        assertEquals(listOf("nuovo"), avvisi.map { it.sessionId })
        assertEquals(setOf("vecchio", "vecchio-ko", "nuovo"), firme.keys)
    }

    @Test
    fun `SVA-05 righe storte si scartano - le richieste non si perdono per il tetto dei giri chiusi`() {
        val righe = JSONArray().put("testo").put(JSONObject.NULL).put(JSONObject().put("sessionId", ""))
            .put(JSONObject().put("sessionId", 7).put("inAttesaDomanda", true))
        for (i in 0 until 12) righe.put(riga("s$i", "inAttesaDomanda" to true, "nome" to "x".repeat(300)))
        for (i in 0 until 9) righe.put(riga("f$i", *giro(4)))
        val (avvisi, firme) = TalosSvegliaAvvisi.scegli(righe, firmePrima = emptyMap(), attivataAlle = 0)
        assertEquals(12, avvisi.count { it.tipo == Tipo.DOMANDA })
        assertEquals(TalosSvegliaAvvisi.CHIUSI_MASSIMI, avvisi.count { it.tipo == Tipo.FINITO })
        assertTrue(avvisi.all { (it.nome?.length ?: 0) <= 80 })
        // i giri oltre il tetto non si dicono e non si ricordano: alla sveglia dopo, se sono ancora lì, toccano a loro
        assertEquals(TalosSvegliaAvvisi.CHIUSI_MASSIMI, firme.size)
    }

    @Test
    fun `SVA-06 il dettaglio viene da session pending - percorso o comando del permesso, testo della domanda, su una riga`() {
        fun approvazione(azione: JSONObject) = JSONObject().put("tipo", "approvazione").put("requestId", "r").put("azione", azione)
        assertEquals("src/login.ts", TalosSvegliaAvvisi.dettaglio(approvazione(JSONObject().put("tipo", "scrivi").put("percorso", "src/login.ts"))))
        assertEquals("npm test -- --run", TalosSvegliaAvvisi.dettaglio(approvazione(JSONObject().put("tipo", "shell").put("comando", "npm  test\n-- --run"))))
        val domanda = JSONObject().put("tipo", "domanda").put("requestId", "r")
            .put("questions", JSONArray().put(JSONObject().put("question", "Quale database?")))
        assertEquals("Quale database?", TalosSvegliaAvvisi.dettaglio(domanda))
        assertNull(TalosSvegliaAvvisi.dettaglio(null))
        assertNull(TalosSvegliaAvvisi.dettaglio(approvazione(JSONObject().put("tipo", "scrivi"))))
        assertNull(TalosSvegliaAvvisi.dettaglio(JSONObject().put("tipo", "domanda").put("questions", "no")))
        assertEquals(120, TalosSvegliaAvvisi.dettaglio(approvazione(JSONObject().put("comando", "a".repeat(500))))!!.length)
    }

    @Test
    fun `SVA-07 id di notifica stabili - una richiesta per sessione si sostituisce, il finito ha il suo - rotta e istanza`() {
        val richiesta = TalosSvegliaAvvisi.idNotifica("pc-1", "s-1", Tipo.PERMESSO)
        assertEquals(richiesta, TalosSvegliaAvvisi.idNotifica("pc-1", "s-1", Tipo.DOMANDA))
        assertNotEquals(richiesta, TalosSvegliaAvvisi.idNotifica("pc-1", "s-1", Tipo.FINITO))
        assertEquals(TalosSvegliaAvvisi.idNotifica("pc-1", "s-1", Tipo.FINITO), TalosSvegliaAvvisi.idNotifica("pc-1", "s-1", Tipo.FALLITO))
        assertNotEquals(richiesta, TalosSvegliaAvvisi.idNotifica("pc-2", "s-1", Tipo.PERMESSO))
        assertTrue(richiesta > 0)
        assertEquals("/computer/pc%201/codice/s%2F1", TalosSvegliaAvvisi.rotta("pc 1", "s/1"))
        val istanza = TalosSvegliaAvvisi.istanza("pc-1")
        assertTrue(istanza, Regex("^pc:[0-9a-f]{16}$").matches(istanza))
        assertNotEquals(istanza, TalosSvegliaAvvisi.istanza("pc-2"))
        // i job della sveglia stanno fra 6000 e 6999: 4900-5899 sono delle attività (`TalosTaskRunPlugin.jobId`), da 100000 i download.
        // Revisione R-M5a (16): due PC non si contendono mai lo stesso posto, che si assegna e si ricorda per PC
        assertEquals(6000, TalosSvegliaAvvisi.idLavoro(0, sveglia = false))
        assertEquals(6999, TalosSvegliaAvvisi.idLavoro(499, sveglia = true))
        assertEquals(0, TalosSvegliaAvvisi.postoLibero(emptySet()))
        assertEquals(2, TalosSvegliaAvvisi.postoLibero(setOf(0, 1, 3)))
    }

    /** Revisione R-M5a (5, 6): niente «ha finito» per una chat appena aperta, un giro corto riuscito o la fine di un passo di Workflow. */
    @Test
    fun `SVA-08 niente avviso senza un giro chiuso noto, per un giro corto riuscito o per un passo di Workflow`() {
        val righe = elenco(
            riga("appena-aperta", "conclusa" to true, "ultimoEsito" to null, "fineGiroAlle" to null),
            riga("corto", *giro(1)),
            riga("passo", "passoWorkflow" to JSONObject().put("runId", "r").put("nodeId", "n"), *giro(10)),
            riga("passo-ko", "passoWorkflow" to JSONObject().put("runId", "r").put("nodeId", "m"), *giro(10, "errore", "errore")),
            riga("passo-chiede", "passoWorkflow" to JSONObject().put("runId", "r").put("nodeId", "q"), "inAttesaApprovazione" to true),
        )
        val (avvisi, firme) = TalosSvegliaAvvisi.scegli(righe, firmePrima = emptyMap(), attivataAlle = 0)
        assertEquals(listOf("passo-chiede" to Tipo.PERMESSO), avvisi.map { it.sessionId to it.tipo })
        assertTrue("appena-aperta" !in firme)
        assertTrue("corto" in firme)
    }

    /** Revisione R-M5a (3): una richiesta già detta non suona di nuovo a ogni sveglia; una nuova nella stessa sessione sì. */
    @Test
    fun `SVA-09 la firma di una richiesta cambia con la richiesta, non con la sveglia`() {
        val a = TalosSvegliaAvvisi.Avviso("s", "Login", Tipo.PERMESSO, requestId = "r1", dettaglio = "src/a.ts")
        assertEquals(TalosSvegliaAvvisi.firmaRichiesta(a), TalosSvegliaAvvisi.firmaRichiesta(a.copy(nome = "Login 2")))
        assertNotEquals(TalosSvegliaAvvisi.firmaRichiesta(a), TalosSvegliaAvvisi.firmaRichiesta(a.copy(requestId = "r2")))
        assertNotEquals(TalosSvegliaAvvisi.firmaRichiesta(a), TalosSvegliaAvvisi.firmaRichiesta(a.copy(tipo = Tipo.DOMANDA)))
        // senza `requestId` (piano, MCP) vale il tipo col dettaglio
        assertNotEquals(TalosSvegliaAvvisi.firmaRichiesta(a.copy(requestId = null)), TalosSvegliaAvvisi.firmaRichiesta(a.copy(requestId = null, dettaglio = "src/b.ts")))
    }

    /** Revisione R-M5a (2): la prova si riconosce dal carico se il PC la segna (`p:1`); senza il campo decide il segno del telefono. */
    @Test
    fun `SVA-10 il carico dice se la sveglia e la prova`() {
        assertEquals(true, TalosSvegliaAvvisi.eUnaProva("""{"v":1,"w":"abc","p":1}""".toByteArray()))
        assertEquals(false, TalosSvegliaAvvisi.eUnaProva("""{"v":1,"w":"abc","p":0}""".toByteArray()))
        assertNull(TalosSvegliaAvvisi.eUnaProva("""{"v":1,"w":"abc"}""".toByteArray()))
        assertNull(TalosSvegliaAvvisi.eUnaProva("rotto".toByteArray()))
    }

    /**
     * Decisione owner 21/10/2026 (AskUserQuestion, «Sempre generiche col blocco»): col PIN di TALOS acceso la notifica dal computer non
     * dice né la sessione né il dettaglio, anche a schermo sbloccato (OWASP MASWE-0037): solo che una sessione ha bisogno, o che un
     * lavoro è finito o si è fermato. Senza blocco: il testo del suo tipo, col dettaglio se c'è.
     */
    @Test
    fun `SVA-11 col blocco dell'app le notifiche sono generiche - senza, il testo del tipo col dettaglio`() {
        val r = ai.talos.R.string::class.java
        fun id(nome: String) = r.getField(nome).getInt(null)
        for (tipo in listOf(Tipo.PERMESSO, Tipo.DOMANDA, Tipo.PIANO, Tipo.MCP, Tipo.AIUTANTE)) {
            assertEquals(tipo.name, id("talos_sveglia_riservata_richiesta"), TalosSvegliaAvvisi.testoDa(tipo, conDettaglio = true, riservata = true))
        }
        assertEquals(id("talos_sveglia_riservata_finito"), TalosSvegliaAvvisi.testoDa(Tipo.FINITO, conDettaglio = false, riservata = true))
        assertEquals(id("talos_sveglia_riservata_fallito"), TalosSvegliaAvvisi.testoDa(Tipo.FALLITO, conDettaglio = false, riservata = true))
        assertEquals(id("talos_sveglia_permesso_con"), TalosSvegliaAvvisi.testoDa(Tipo.PERMESSO, conDettaglio = true, riservata = false))
        assertEquals(id("talos_sveglia_permesso"), TalosSvegliaAvvisi.testoDa(Tipo.PERMESSO, conDettaglio = false, riservata = false))
        assertEquals(id("talos_sveglia_domanda_con"), TalosSvegliaAvvisi.testoDa(Tipo.DOMANDA, conDettaglio = true, riservata = false))
        assertEquals(id("talos_sveglia_fallito"), TalosSvegliaAvvisi.testoDa(Tipo.FALLITO, conDettaglio = false, riservata = false))
    }

    /**
     * ⛔ D-RM5-4 (dal Pad, 21/10/2026, 4178 a 94971e7db): telefono collegato sul Codice di T, carta di T sullo schermo e confermata
     * (`device.seen`); una sveglia per S fa partire il lavoro, che rilegge TUTTO e notificava anche la domanda di T, che la persona
     * stava guardando. Le carte viste nell'app (chiavi di `carteAperteR4`: `approvazione:<requestId>`, `domanda:<requestId>`,
     * `piano:<id>`) non si notificano; la carta di una figlia disegnata nella madre ha la chiave della figlia sotto la madre.
     */
    @Test
    fun `SVA-12 una carta gia vista nell'app non diventa notifica`() {
        val viste = setOf("s-t|domanda:q1", "s-m|approvazione:r-figlia", "s-p|piano:m9")
        assertTrue(TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-t", null, Tipo.DOMANDA, chiaveCarta = "domanda:q1"), viste))
        assertTrue(!TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-t", null, Tipo.DOMANDA, chiaveCarta = "domanda:q2"), viste))
        assertTrue(!TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-s", null, Tipo.DOMANDA, chiaveCarta = "domanda:q1"), viste))
        assertTrue(TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-m", null, Tipo.AIUTANTE, chiedeDa = "f", chiaveCarta = "approvazione:r-figlia"), viste))
        assertTrue(TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-p", null, Tipo.PIANO), viste))
        assertTrue(!TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-x", null, Tipo.PIANO), viste))
        // senza chiave (pending illeggibile) non si sa: si notifica
        assertTrue(!TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-t", null, Tipo.DOMANDA), viste))
        assertTrue(!TalosSvegliaAvvisi.giaVista(TalosSvegliaAvvisi.Avviso("s-t", null, Tipo.MCP), viste))
        assertEquals("approvazione:r1", TalosSvegliaAvvisi.chiaveCarta(JSONObject().put("tipo", "approvazione").put("requestId", "r1")))
        assertEquals("domanda:q1", TalosSvegliaAvvisi.chiaveCarta(JSONObject().put("tipo", "domanda").put("requestId", "q1")))
        assertNull(TalosSvegliaAvvisi.chiaveCarta(null))
    }

    /**
     * Revisione R-M5a bis (2): un piano visto restava «visto» per sempre e zittiva i piani dopo. Le carte viste si potano a ogni
     * lettura: restano solo quelle delle sessioni che aspettano ancora (anche per una figlia, tramite la madre).
     */
    @Test
    fun `SVA-13 le carte viste di chi non aspetta piu si dimenticano`() {
        val righe = elenco(
            riga("s-piano-chiuso"),
            riga("s-aspetta", "inAttesaDomanda" to true),
            riga("madre", "inAttesaDiscendente" to true),
        )
        val viste = listOf("s-piano-chiuso|piano:m1", "s-aspetta|domanda:q1", "madre|approvazione:rf", "sparita|domanda:q9")
        assertEquals(listOf("s-aspetta|domanda:q1", "madre|approvazione:rf"), TalosSvegliaAvvisi.potaViste(viste, righe))
    }

    /** Revisione R-M5a bis (4): la carta della figlia vista nella pagina della FIGLIA vale anche per l'«aiutante» della madre. */
    @Test
    fun `SVA-14 l'aiutante si zittisce anche se la carta e stata vista nella figlia`() {
        val a = TalosSvegliaAvvisi.Avviso("madre", null, Tipo.AIUTANTE, chiedeDa = "figlia", chiaveCarta = "approvazione:r1")
        assertTrue(TalosSvegliaAvvisi.giaVista(a, setOf("figlia|approvazione:r1")))
        assertTrue(!TalosSvegliaAvvisi.giaVista(a, setOf("altra|approvazione:r1")))
    }

    /** Revisione R-M5a bis (8): le viste in JSON (niente separatori nei requestId), la più recente in fondo, tetto dalle più vecchie. */
    @Test
    fun `SVA-15 elenco delle viste - JSON, ordine dell'ultima volta, tetto`() {
        val prima = listOf("a|domanda:1", "b|domanda:2")
        assertEquals(listOf("b|domanda:2", "a|domanda:1"), TalosSvegliaAvvisi.aggiungiViste(prima, listOf("a|domanda:1"), tetto = 10))
        assertEquals(listOf("b|domanda:2", "c|x"), TalosSvegliaAvvisi.aggiungiViste(prima, listOf("c|x"), tetto = 2))
        val strana = listOf("s|domanda:a|b\nc")
        assertEquals(strana, TalosSvegliaAvvisi.daJsonViste(TalosSvegliaAvvisi.inJsonViste(strana)))
        assertEquals(emptyList<String>(), TalosSvegliaAvvisi.daJsonViste("rotto"))
    }

    /** Revisione R-M5a bis (10): dopo il blocco le richieste ancora aperte tornano generiche, ma IN SILENZIO (la persona le aveva già). */
    @Test
    fun `SVA-16 ripubblicare - uguale si salta, segnata dal blocco torna in silenzio, nuova suona`() {
        assertEquals(TalosSvegliaAvvisi.Ripubblica.SALTA, TalosSvegliaAvvisi.ripubblica("PERMESSO|r1|", "PERMESSO|r1|"))
        assertEquals(TalosSvegliaAvvisi.Ripubblica.SILENZIOSA, TalosSvegliaAvvisi.ripubblica("~PERMESSO|r1|", "PERMESSO|r1|"))
        assertEquals(TalosSvegliaAvvisi.Ripubblica.NUOVA, TalosSvegliaAvvisi.ripubblica("~PERMESSO|r1|", "PERMESSO|r2|"))
        assertEquals(TalosSvegliaAvvisi.Ripubblica.NUOVA, TalosSvegliaAvvisi.ripubblica(null, "PERMESSO|r1|"))
        assertEquals(7000, TalosSvegliaAvvisi.idRiallinea(0))
        assertEquals(7499, TalosSvegliaAvvisi.idRiallinea(499))
    }

    /** N0 (21/10/2026), D-N0-5: l'id della sveglia (sha256) poteva cadere su quelli del telefono; ora sta sopra 2^30, dove non c'è nessun altro. */
    @Test
    fun `SVA-17 l'id della sveglia sta nel suo intervallo`() {
        for (pc in listOf("pc-1", "pc-2", "2d3c38f1")) for (s in listOf("s-1", "s-2", "\u0000provvisoria")) for (t in Tipo.values()) {
            val id = TalosSvegliaAvvisi.idNotifica(pc, s, t)
            assertTrue("$pc $s $t: $id", id >= ai.talos.TalosNotificationIds.SVEGLIA_MIN)
        }
        assertTrue(TalosSvegliaAvvisi.idProvvisoria("pc-1") >= ai.talos.TalosNotificationIds.SVEGLIA_MIN)
    }
}
