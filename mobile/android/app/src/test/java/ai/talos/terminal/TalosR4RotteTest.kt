package ai.talos.terminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * K3-B1 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il client nativo di r4. La pagina chiede un percorso dell'API; il
 * nativo lo manda SOLO a 127.0.0.1 sulla porta di r4, col cookie del token messo da sé (la pagina non vede mai il token) e SENZA
 * Origin né Sec-Fetch-Site: così passa le guardie di r4 (Nino1, 15/10) senza cambiare r4.
 */
class TalosR4RotteTest {
    @Test
    fun `R4CL-01 solo percorsi dell'API v1, niente uscite`() {
        for (buono in listOf(
            "/api/v1/sessions", "/api/v1/sessions/ce97b3bd-6d45-4e11-9391-f6069aedcbb2/events",
            "/api/v1/sessions/abc/events?after=12", "/api/v1/sessions/abc/resume", "/api/v1/providers/openrouter/key",
        )) assertTrue(buono, TalosR4Rotte.percorsoAmmesso(buono))
        for (cattivo in listOf(
            "", "/", "/api/v2/sessions", "/api/v1/../server.mjs", "/api/v1//sessions", "http://evil/api/v1/sessions",
            "//evil/api/v1/sessions", "/api/v1/sessions\n", "/api/v1/sessions?after=1#x", "/api/v1/sessi ons", "api/v1/sessions",
            "/?token=abc", "/api/v1/%2e%2e/x",
        )) assertFalse(cattivo, TalosR4Rotte.percorsoAmmesso(cattivo))
    }

    @Test
    fun `R4CL-02 l'indirizzo e' sempre 127_0_0_1 sulla porta data`() {
        assertEquals("http://127.0.0.1:4178/api/v1/sessions", TalosR4Rotte.indirizzo(4178, "/api/v1/sessions"))
        assertTrue(runCatching { TalosR4Rotte.indirizzo(4178, "/api/v1/../x") }.exceptionOrNull() is IllegalArgumentException)
        assertEquals(setOf("GET", "POST"), TalosR4Rotte.METODI)
    }

    @Test
    fun `R4CL-03 il cookie c'e', Origin e Sec-Fetch-Site mai, Content-Type solo col corpo`() {
        val token = "a".repeat(64)
        val senza = TalosR4Rotte.intestazioni(token, conCorpo = false)
        assertEquals("talos_token=$token", senza["Cookie"])
        assertFalse(senza.containsKey("Content-Type"))
        val con = TalosR4Rotte.intestazioni(token, conCorpo = true)
        assertEquals("application/json", con["Content-Type"])
        for (h in listOf(senza, con)) {
            assertFalse(h.keys.any { it.equals("Origin", ignoreCase = true) || it.equals("Sec-Fetch-Site", ignoreCase = true) })
        }
        assertTrue(runCatching { TalosR4Rotte.intestazioni("corto", conCorpo = false) }.exceptionOrNull() is IllegalArgumentException)
    }

    // ⛔ K3-TERM T2 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): la WebSocket del Terminale di r4 (`terminal-ws.mjs`).

    @Test
    fun `R4CL-04 la WebSocket del terminale va solo a 127_0_0_1, con un id semplice`() {
        assertEquals(
            "ws://127.0.0.1:4178/api/v1/terminal/ws?id=ce97b3bd-6d45-4e11-9391-f6069aedcbb2",
            TalosR4Terminale.indirizzo(4178, "ce97b3bd-6d45-4e11-9391-f6069aedcbb2"),
        )
        for (cattivo in listOf("", "a b", "a&id=b", "../x", "a/b", "a%2f", "a?b", "a#b", "x".repeat(201), "a\nb")) {
            assertFalse(cattivo, TalosR4Terminale.idAmmesso(cattivo))
            assertTrue(cattivo, runCatching { TalosR4Terminale.indirizzo(4178, cattivo) }.exceptionOrNull() is IllegalArgumentException)
        }
        assertTrue(TalosR4Terminale.idAmmesso("x".repeat(200)))
    }

    @Test
    fun `R4CL-05 i frame di r4 avanti e indietro, e uno vuoto o di tipo ignoto si scarta`() {
        val dati = TalosR4Terminale.frameDati("ls -la\r€")
        assertEquals(0, dati[0].toInt())
        assertEquals("ls -la\r€", String(dati, 1, dati.size - 1, Charsets.UTF_8))
        val r = TalosR4Terminale.frameRidimensiona(100, 30)
        assertEquals(1, r[0].toInt())
        assertEquals("""{"tipo":"resize","cols":100,"rows":30}""", String(r, 1, r.size - 1, Charsets.UTF_8))
        for ((cols, rows) in listOf(0 to 30, 100 to 0, 1001 to 30, 100 to 1001)) {
            assertTrue("$cols x $rows", runCatching { TalosR4Terminale.frameRidimensiona(cols, rows) }.exceptionOrNull() is IllegalArgumentException)
        }
        assertEquals(TalosR4Terminale.Frame(0, "ciao\r\n"), TalosR4Terminale.leggiFrame(byteArrayOf(0) + "ciao\r\n".toByteArray()))
        assertEquals(TalosR4Terminale.Frame(1, """{"evento":"uscita","codice":0}"""),
            TalosR4Terminale.leggiFrame(byteArrayOf(1) + """{"evento":"uscita","codice":0}""".toByteArray()))
        assertEquals(null, TalosR4Terminale.leggiFrame(ByteArray(0)))
        assertEquals(null, TalosR4Terminale.leggiFrame(byteArrayOf(7, 65)))
    }

    @Test
    fun `R4CL-06 la WebSocket porta solo il cookie, mai Origin, Sec-Fetch-Site o Content-Type`() {
        val token = "b".repeat(64)
        val h = TalosR4Terminale.intestazioni(token)
        assertEquals(mapOf("Cookie" to "talos_token=$token"), h)
        assertTrue(runCatching { TalosR4Terminale.intestazioni("corto") }.exceptionOrNull() is IllegalArgumentException)
    }

    /**
     * K3-C Allegati A2 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): l'anteprima vera di un'immagine mandata a r4. Il nativo la rilegge
     * intera in base64 SOLO da `GET /api/v1/chat-images/<id>`, con l'id fatto di 64 esadecimali (`chat-image-attachments.mjs` @ 2161afb32),
     * e non oltre il tetto di 12 MiB (il totale delle immagini di un messaggio in r4).
     */
    @Test
    fun `R4CL-07 l'immagine si rilegge solo dalla sua rotta, con un id di 64 esadecimali`() {
        val id = "eb690c940a96f9e41664cce48f63b2d068a5e293367075e0076a695fa04b242f"
        assertEquals("/api/v1/chat-images/$id", TalosR4Rotte.percorsoImmagine(id))
        for (cattivo in listOf("", "x", id.dropLast(1), id + "0", id.uppercase(), "../$id", "$id?x=1", id.take(63) + "g"))
            assertTrue(cattivo, runCatching { TalosR4Rotte.percorsoImmagine(cattivo) }.exceptionOrNull() is IllegalArgumentException)
        assertEquals(12 * 1024 * 1024, TalosR4Rotte.MASSIMO_IMMAGINE)
    }

    /**
     * K3-C Allegati A3 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`): i nomi dei file allegati, come l'helper del desktop
     * (`native/chat-file-upload/main.go` @ 2161afb32, `validName` e `numberedName`). Un nome esistente non si tocca mai: si cerca il
     * primo libero fra `nome`, `nome-2`, `nome-3`…; il tronco si accorcia per caratteri interi così il nome resta entro 255 byte.
     * In più del desktop: `.` e `..` non sono nomi di file (il Go li lascia passare e poi il `Link` fallisce).
     */
    @Test
    fun `R4CL-08 i nomi degli allegati come l'helper del desktop`() {
        for (buono in listOf("a.txt", "LEGGIMI", ".bashrc", "Relazione finale (v2).pdf", "è".repeat(127)))
            assertTrue(buono, TalosR4Rotte.nomeAllegatoValido(buono))
        for (cattivo in listOf("", ".", "..", "a/b", "a\\b", "a\u0000b", "../x", "x".repeat(256), "è".repeat(128), "a\uD800b"))
            assertTrue(cattivo, !TalosR4Rotte.nomeAllegatoValido(cattivo))
        assertEquals("a.txt", TalosR4Rotte.nomeNumerato("a.txt", 1))
        assertEquals("a-2.txt", TalosR4Rotte.nomeNumerato("a.txt", 2))
        assertEquals("archivio.tar-3.gz", TalosR4Rotte.nomeNumerato("archivio.tar.gz", 3))
        assertEquals(".bashrc-2", TalosR4Rotte.nomeNumerato(".bashrc", 2))
        assertEquals("LEGGIMI-10", TalosR4Rotte.nomeNumerato("LEGGIMI", 10))
        // 252 byte di tronco + «.md» = 255: con «-2» il tronco scende a 250 byte, cioè 125 «è» interi
        assertEquals("è".repeat(125) + "-2.md", TalosR4Rotte.nomeNumerato("è".repeat(126) + ".md", 2))
        // un'estensione che occupa tutto: nessun nome numerato possibile
        assertEquals(null, TalosR4Rotte.nomeNumerato("a." + "x".repeat(253), 2))
        assertEquals(25L * 1024 * 1024, TalosR4Rotte.MASSIMO_FILE)
        assertEquals(5 * 1024 * 1024, TalosR4Rotte.MASSIMO_IMMAGINE_SCELTA)
        assertEquals(200_000, TalosR4Rotte.MASSIMO_TESTO)
    }

    /**
     * ⛔ K3-C Allegati A3, difetto trovato sul Pad il 16/10: due file scelti insieme si copiano in parallelo e la prima volta
     * `allegati/` non c'è. Tutti e due la creano; il `mkdirs()` del secondo torna `false` perché la cartella ora esiste, e il file
     * finiva rifiutato con `FOLDER_INVALID`. La cartella è buona se c'è alla fine, chiunque l'abbia creata.
     */
    @Test
    fun `R4CL-09 la cartella degli allegati regge le copie in parallelo e non esce dalla cartella di lavoro`() {
        // la corsa non è deterministica: 30 giri, ognuno su una cartella di lavoro nuova
        repeat(30) { giro ->
            val lavoro = java.nio.file.Files.createTempDirectory("talos-r4cl09").toFile()
            try {
                val quanti = 16
                val via = java.util.concurrent.CyclicBarrier(quanti)
                val esiti = java.util.Collections.synchronizedList(mutableListOf<java.io.File?>())
                val fili = (1..quanti).map { Thread { via.await(); esiti += TalosR4Rotte.cartellaAllegati(lavoro) } }
                fili.forEach { it.start() }
                fili.forEach { it.join() }
                val attesa = java.io.File(lavoro.canonicalFile, "allegati")
                assertEquals("giro $giro", List(quanti) { attesa }, esiti.toList())
            } finally { lavoro.deleteRecursively() }
        }
        // un file che si chiama «allegati» non è una cartella
        val altro = java.nio.file.Files.createTempDirectory("talos-r4cl09b").toFile()
        try {
            java.io.File(altro, "allegati").writeText("non una cartella")
            assertEquals(null, TalosR4Rotte.cartellaAllegati(altro))
        } finally { altro.deleteRecursively() }
    }
}
