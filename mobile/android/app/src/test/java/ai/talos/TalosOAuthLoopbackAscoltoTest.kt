package ai.talos

import java.net.InetAddress
import java.net.Socket
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Revisione del 13/10/2026 (`.claude/ragionamento/REVIEW-N15-ACCESSO-2026-10-13.md`) — l'ascolto nativo, provato con porte
 * VERE su 127.0.0.1 (porta 0, chiuse a fine prova). Prima non c'era nessuna prova del suo comportamento: solo del tempo e
 * della pagina. Ogni prova qui sotto è un difetto trovato leggendo il codice, col suo verso contrario.
 */
class TalosOAuthLoopbackAscoltoTest {
    /** Chi aspetta il ritorno: ciò che il plugin fa con la chiamata JavaScript, qui messo in coda. */
    private class Raccolta : TalosOAuthLoopbackPlugin.Attesa {
        val coda = LinkedBlockingQueue<String>()
        override fun arrivato(target: String) { coda.put("OK $target") }
        override fun finito(codice: String) { coda.put("NO $codice") }
        fun prossimo(ms: Long = 3_000): String? = coda.poll(ms, TimeUnit.MILLISECONDS)
    }

    /** Una richiesta come la fa un browser: torna tutta la risposta. */
    private fun chiedi(porta: Int, target: String): String =
        Socket(InetAddress.getByName("127.0.0.1"), porta).use { s ->
            s.soTimeout = 5_000
            s.getOutputStream().apply { write("GET $target HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n".toByteArray()); flush() }
            s.getInputStream().readBytes().toString(Charsets.UTF_8)
        }

    /**
     * LOOPBACK-A1 — vinceva la PRIMA richiesta, qualunque fosse: un'altra app che bussava (`GET /`) chiudeva la porta e il
     * ritorno vero trovava «Connessione negata». Col percorso atteso, ciò che non è il ritorno riceve 404 e si continua.
     */
    @Test
    fun colPercorsoAtteso_unaRichiestaEstraneaNonChiudeLAscolto() {
        val ascolto = TalosOAuthLoopbackPlugin.apri("prova-a1", "/auth/callback", 30_000)
        try {
            val attesa = Raccolta()
            ascolto.aspetta(attesa)
            assertTrue(chiedi(ascolto.porta(), "/").startsWith("HTTP/1.1 404"))
            assertTrue(chiedi(ascolto.porta(), "/auth/callbackX?code=1").startsWith("HTTP/1.1 404"))
            assertNull(attesa.prossimo(200))
            assertTrue(chiedi(ascolto.porta(), "/auth/callback?code=1&state=ALTRO").contains("TALOS"))
            assertEquals("OK /auth/callback?code=1&state=ALTRO", attesa.prossimo())
            // lo stato lo giudica JavaScript: se non era il suo, torna ad aspettare sulla STESSA porta
            assertTrue(ascolto.aperto())
            val ancora = Raccolta()
            ascolto.aspetta(ancora)
            chiedi(ascolto.porta(), "/auth/callback?code=2&state=GIUSTO")
            assertEquals("OK /auth/callback?code=2&state=GIUSTO", ancora.prossimo())
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("prova-a1", null)
        }
    }

    /**
     * LOOPBACK-RITORNO-01 (13/10/2026, owner: «ritorno automatico all'app: sì») — quando arriva IL ritorno di questo accesso
     * (percorso giusto E stato giusto) si avvisa chi riporta l'app davanti, una volta sola. Uno stato sbagliato o un altro
     * percorso non riportano niente: la scheda non si chiude in faccia alla persona per una richiesta che non è la sua.
     */
    @Test
    fun ilRitornoGiustoRiportaLAppDavanti_unaVoltaSola_eSoloLui() {
        val tornate = java.util.concurrent.atomic.AtomicInteger(0)
        val ascolto = TalosOAuthLoopbackPlugin.apri("prova-ritorno", "/auth/callback", 30_000, 4_000, "STATO-MIO") { tornate.incrementAndGet() }
        try {
            val attesa = Raccolta()
            ascolto.aspetta(attesa)
            chiedi(ascolto.porta(), "/")
            chiedi(ascolto.porta(), "/auth/callback?code=1&state=STATO-ALTRUI")
            assertEquals("OK /auth/callback?code=1&state=STATO-ALTRUI", attesa.prossimo())
            assertEquals(0, tornate.get())
            val ancora = Raccolta()
            ascolto.aspetta(ancora)
            chiedi(ascolto.porta(), "/auth/callback?state=STATO-MIO&code=2")
            assertEquals("OK /auth/callback?state=STATO-MIO&code=2", ancora.prossimo())
            // un rifiuto della persona con lo stato giusto è comunque IL ritorno: si torna a TALOS, che lo dice
            chiedi(ascolto.porta(), "/auth/callback?error=access_denied&state=STATO-MIO")
            Thread.sleep(150)
            assertEquals(1, tornate.get())
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("prova-ritorno", null)
        }
    }

    /**
     * ⛔ LOOPBACK-RIPRESA-01 — MISURATO sul Pad il 13/10/2026 (dimensione del testo cambiata con la scheda davanti): il
     * ritorno arriva, viene dato alla pagina che aspettava, e SUBITO dopo Android ricrea l'attività. Quella pagina è morta
     * senza averlo usato, e il ritorno era perso: l'app ripartiva «non collegata», in silenzio. Ora ciò che è stato dato a
     * una pagina che poi muore torna da parte, e la pagina nuova lo ritrova. Senza attività distrutta NON si ridà: chi
     * torna ad aspettare dopo uno stato non suo deve aspettare il prossimo, non rivedere lo stesso.
     */
    @Test
    fun ilRitornoDatoAUnaPaginaChePoiMuoreTornaDaParte() {
        val ascolto = TalosOAuthLoopbackPlugin.apri("prova-ripresa", "/auth/callback", 30_000)
        try {
            val vecchia = Raccolta()
            ascolto.aspetta(vecchia)
            chiedi(ascolto.porta(), "/auth/callback?code=1&state=S")
            assertEquals("OK /auth/callback?code=1&state=S", vecchia.prossimo())
            // la pagina è viva e torna ad aspettare: NON rivede lo stesso ritorno
            val ancoraViva = Raccolta()
            ascolto.aspetta(ancoraViva)
            assertNull(ancoraViva.prossimo(200))
            // l'attività muore con quel ritorno in mano
            chiedi(ascolto.porta(), "/auth/callback?code=2&state=S")
            assertEquals("OK /auth/callback?code=2&state=S", ancoraViva.prossimo())
            ascolto.dimenticaAttesa()
            val nuova = Raccolta()
            ascolto.aspetta(nuova)
            assertEquals("OK /auth/callback?code=2&state=S", nuova.prossimo())
            // e una volta sola
            val dopo = Raccolta()
            ascolto.aspetta(dopo)
            assertNull(dopo.prossimo(200))
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("prova-ripresa", null)
        }
    }

    /** LOOPBACK-RITORNO-02 — chi riporta l'app davanti e fallisce non ferma l'ascolto: il ritorno si consegna lo stesso. */
    @Test
    fun seNonSiRiesceATornareIlRitornoSiConsegnaLoStesso() {
        val ascolto = TalosOAuthLoopbackPlugin.apri("prova-ritorno-2", "/auth/callback", 30_000, 4_000, "S") { throw IllegalStateException("niente attività") }
        try {
            val attesa = Raccolta()
            ascolto.aspetta(attesa)
            assertTrue(chiedi(ascolto.porta(), "/auth/callback?code=1&state=S").contains("TALOS"))
            assertEquals("OK /auth/callback?code=1&state=S", attesa.prossimo())
            assertTrue(ascolto.aperto())
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("prova-ritorno-2", null)
        }
    }

    @Test
    fun ilParametroSiLeggeGrezzoDallaRigaDiIndirizzo() {
        assertEquals("abc-_1", TalosOAuthLoopbackPlugin.parametro("/auth/callback?code=x&state=abc-_1", "state"))
        assertNull(TalosOAuthLoopbackPlugin.parametro("/auth/callback?code=x&xstate=1", "state"))
        assertNull(TalosOAuthLoopbackPlugin.parametro("/auth/callback", "state"))
        assertNull(TalosOAuthLoopbackPlugin.parametro(null, "state"))
    }

    /**
     * LOOPBACK-A2 — il tempo era solo sull'`accept`: una connessione che non manda niente teneva il thread fermo sulla
     * lettura per sempre, e il ritorno vero restava in coda senza risposta. Ora la lettura ha il suo tempo.
     */
    @Test
    fun unaConnessioneMutaNonBloccaIlRitornoVero() {
        val ascolto = TalosOAuthLoopbackPlugin.apri("prova-a2", "/auth/callback", 30_000, 300)
        val muta = Socket(InetAddress.getByName("127.0.0.1"), ascolto.porta())
        try {
            val attesa = Raccolta()
            ascolto.aspetta(attesa)
            assertTrue(chiedi(ascolto.porta(), "/auth/callback?code=1").contains("TALOS"))
            assertEquals("OK /auth/callback?code=1", attesa.prossimo())
        } finally {
            muta.close()
            TalosOAuthLoopbackPlugin.chiudi("prova-a2", null)
        }
    }

    /**
     * LOOPBACK-A3/A4 — la porta era UNA: `open` chiudeva quella di chiunque, e chi finiva chiudeva «quella corrente». Ora
     * c'è un ascolto per canale (OpenRouter quello senza nome, ChatGPT il suo) e ognuno ha un numero: aprire su un canale
     * non tocca l'altro, e chiudere con un numero vecchio non chiude l'ascolto nuovo.
     */
    /**
     * LOOPBACK-A5 — gate android della `main` pubblica dopo la v0.1.42 (run 39120178851): la prova qui sotto è caduta alla riga
     * `assertFalse(primo.aperto())`. Chiudere chiudeva solo la porta, e lo stato «chiuso» lo scriveva il thread dell'ascolto quando
     * se ne accorgeva: per un attimo un ascolto chiuso si diceva ancora aperto. Chiuso da fuori, è chiuso subito.
     */
    @Test
    fun chiusoDaFuori_eChiusoSubito_ancheSenzaAspettareIlSuoThread() {
        repeat(300) { giro ->
            val a = TalosOAuthLoopbackPlugin.apri("prova-a5", "/auth/callback", 30_000)
            TalosOAuthLoopbackPlugin.chiudi("prova-a5", a.id)
            assertFalse("giro $giro: chiuso con chiudi(), si dice ancora aperto", a.aperto())
            val b = TalosOAuthLoopbackPlugin.apri("prova-a5", "/auth/callback", 30_000)
            val c = TalosOAuthLoopbackPlugin.apri("prova-a5", "/auth/callback", 30_000)
            assertFalse("giro $giro: sostituito da un ascolto nuovo, si dice ancora aperto", b.aperto())
            TalosOAuthLoopbackPlugin.chiudi("prova-a5", c.id)
        }
    }

    @Test
    fun dueCanaliNonSiChiudonoAVicenda_eUnNumeroVecchioNonChiudeIlNuovo() {
        val openRouter = TalosOAuthLoopbackPlugin.apri("", null, 30_000)
        val primo = TalosOAuthLoopbackPlugin.apri("prova-a3", "/auth/callback", 30_000)
        try {
            assertTrue(openRouter.aperto())
            val secondo = TalosOAuthLoopbackPlugin.apri("prova-a3", "/auth/callback", 30_000)
            assertFalse(primo.aperto())
            assertTrue(openRouter.aperto())
            val attesa = Raccolta()
            secondo.aspetta(attesa)
            TalosOAuthLoopbackPlugin.chiudi("prova-a3", primo.id)
            assertTrue(secondo.aperto())
            assertNull(attesa.prossimo(200))
            TalosOAuthLoopbackPlugin.chiudi("prova-a3", secondo.id)
            assertEquals("NO TALOS_OAUTH_CANCELLED", attesa.prossimo())
            assertFalse(secondo.aperto())
            assertTrue(openRouter.aperto())
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("", null)
            TalosOAuthLoopbackPlugin.chiudi("prova-a3", null)
        }
    }

    /**
     * LOOPBACK-A5/A6 — l'attività ricreata: chi aspettava non c'è più, il ritorno arriva lo stesso e resta da parte NEL SUO
     * canale. La ripresa di OpenRouter (canale senza nome) non lo vede; quella di ChatGPT lo ritira una volta sola.
     */
    @Test
    fun ilRitornoArrivatoSenzaNessunoRestaDaParteNelSuoCanale_eSiRitiraUnaVolta() {
        val openRouter = TalosOAuthLoopbackPlugin.apri("", null, 30_000)
        val ascolto = TalosOAuthLoopbackPlugin.apri("prova-a5", "/auth/callback", 30_000)
        try {
            val morta = Raccolta()
            ascolto.aspetta(morta)
            ascolto.dimenticaAttesa()
            chiedi(ascolto.porta(), "/auth/callback?code=1&state=S")
            assertNull(morta.prossimo(200))
            assertNull(openRouter.ritira())
            assertEquals("/auth/callback?code=1&state=S", TalosOAuthLoopbackPlugin.ascolto("prova-a5").ritira())
            assertNull(ascolto.ritira())
            // e chi torna ad aspettare dopo trova ciò che arriva, senza riaprire niente
            chiedi(ascolto.porta(), "/auth/callback?code=2&state=S")
            val nuova = Raccolta()
            ascolto.aspetta(nuova)
            assertEquals("OK /auth/callback?code=2&state=S", nuova.prossimo())
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("", null)
            TalosOAuthLoopbackPlugin.chiudi("prova-a5", null)
        }
    }

    /** LOOPBACK-D1 — il tempo finito ha il SUO codice: chi aspetta distingue «scaduto» da «chiuso da qualcuno». */
    @Test
    fun ilTempoFinitoSiDiceColSuoCodice_ancheAChiArrivaDopo() {
        val ascolto = TalosOAuthLoopbackPlugin.apri("prova-d1", "/auth/callback", 250)
        try {
            val attesa = Raccolta()
            ascolto.aspetta(attesa)
            assertEquals("NO TALOS_OAUTH_TIMEOUT", attesa.prossimo())
            assertFalse(ascolto.aperto())
            val dopo = Raccolta()
            ascolto.aspetta(dopo)
            assertEquals("NO TALOS_OAUTH_TIMEOUT", dopo.prossimo())
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("prova-d1", null)
        }
    }

    /**
     * AL CONTRARIO — OpenRouter non cambia: senza percorso vale la prima richiesta, la porta si chiude subito, e il ritorno
     * resta anche da parte finché non lo si ritira (è ciò su cui conta `openRouterLogin.ts`).
     */
    @Test
    fun senzaPercorso_valeLaPrimaRichiestaComeSempre() {
        val ascolto = TalosOAuthLoopbackPlugin.apri("", null, 30_000)
        try {
            val attesa = Raccolta()
            ascolto.aspetta(attesa)
            assertTrue(chiedi(ascolto.porta(), "/talos-openrouter?code=OR").contains("TALOS"))
            assertEquals("OK /talos-openrouter?code=OR", attesa.prossimo())
            for (i in 1..50) { if (!ascolto.aperto()) break; Thread.sleep(20) }
            assertFalse(ascolto.aperto())
            assertEquals("/talos-openrouter?code=OR", TalosOAuthLoopbackPlugin.ascolto("").ritira())
            assertNull(TalosOAuthLoopbackPlugin.ascolto("").ritira())
            val tardi = Raccolta()
            ascolto.aspetta(tardi)
            assertEquals("NO TALOS_OAUTH_NOT_LISTENING", tardi.prossimo())
        } finally {
            TalosOAuthLoopbackPlugin.chiudi("", null)
        }
    }
}
