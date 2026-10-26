package ai.talos.aggiornamenti

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * ⛔ D-UPD-1 (26/10/2026): l'aggiornatore non ha mai scaricato un byte da GitHub. `…/releases/download/<tag>/<file>` risponde SEMPRE
 * con un 302 verso un indirizzo firmato su un altro host (`release-assets.githubusercontent.com`, `se=` di circa un'ora), e il
 * runner condiviso coi modelli i rinvii non li segue di proposito (`TalosTransferRunner.open`). Per i modelli il passo lo fa
 * `TalosTransferSession.resolveOn`; per l'aggiornamento mancava. Le regole sono quelle di Obtainium (`http_service.dart:185-240`):
 * rinvii seguiti a mano, un tetto, mai da https a http, nessuna credenziale all'altro host.
 *
 * Nessun server vero: `risolvi` riceve chi apre le connessioni, e qui le apre un GitHub finto che risponde per indirizzo.
 */
class TalosRinvioAggiornamentoTest {

    private class Risposta(val stato: Int, val intestazioni: Map<String, String> = emptyMap())

    /** Una connessione finta: risponde con lo stato e le intestazioni dati, e ricorda come è stata usata. */
    private class Finta(url: URL, private val risposta: Risposta) : HttpURLConnection(url) {
        var richiestaAutorizzazione: String? = null
        override fun connect() = Unit
        override fun disconnect() = Unit
        override fun usingProxy() = false
        override fun getResponseCode() = risposta.stato
        override fun getHeaderField(name: String?): String? =
            risposta.intestazioni.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value
        override fun setRequestProperty(key: String?, value: String?) {
            if (key.equals("Authorization", ignoreCase = true)) richiestaAutorizzazione = value
            super.setRequestProperty(key, value)
        }
    }

    private class GitHubFinto(private val risposte: Map<String, Risposta>) {
        val aperte = mutableListOf<Finta>()
        val apri: (URL) -> HttpURLConnection = { url ->
            val risposta = risposte[url.toString()] ?: throw AssertionError("richiesta inattesa: $url")
            Finta(url, risposta).also { aperte += it }
        }
    }

    private val origine = "https://github.com/Ninozzz95/talos/releases/download/mobile-v0.1.46/TALOS-0.1.46.apk"
    private val firmato = "https://release-assets.githubusercontent.com/github-production-release-asset/1/abc" +
        "?sp=r&sv=2018-11-09&sr=b&spr=https&se=2026-10-26T11%3A27%3A46Z&rscd=attachment&sig=x"
    /** Il `Date` del server un'ora prima di `se=`: la firma vive 3600 s. */
    private val dataServer = "Mon, 26 Oct 2026 10:27:46 GMT"
    private val adesso = { 1_000_000L }

    private fun rinvio(verso: String, stato: Int = 302) = Risposta(stato, mapOf("Location" to verso, "Date" to dataServer))

    @Test
    fun `UPD-RIN-01 un 302 verso un altro host torna l'indirizzo firmato, senza richiederlo`() {
        val gh = GitHubFinto(mapOf(origine to rinvio(firmato)))
        val risolto = TalosRinvioAggiornamento.risolvi(origine, gh.apri, adesso)
        assertEquals(firmato, risolto.url)
        assertEquals("solo github.com è stato interrogato", listOf(origine), gh.aperte.map { it.url.toString() })
        assertEquals("HEAD", gh.aperte.single().requestMethod)
        assertTrue("i rinvii si seguono a mano", !gh.aperte.single().instanceFollowRedirects)
    }

    @Test
    fun `UPD-RIN-02 rinvii sullo stesso host si seguono, poi l'altro host`() {
        val altroPercorso = "https://github.com/Ninozzz95/talos-nuovo/releases/download/mobile-v0.1.46/TALOS-0.1.46.apk"
        val gh = GitHubFinto(mapOf(
            origine to rinvio(altroPercorso, 301),
            altroPercorso to rinvio("/Ninozzz95/talos-nuovo/releases/download/mobile-v0.1.46/x.apk", 307),
            "https://github.com/Ninozzz95/talos-nuovo/releases/download/mobile-v0.1.46/x.apk" to rinvio(firmato),
        ))
        assertEquals(firmato, TalosRinvioAggiornamento.risolvi(origine, gh.apri, adesso).url)
        assertEquals(3, gh.aperte.size)
    }

    @Test
    fun `UPD-RIN-03 oltre cinque rinvii sullo stesso host e' un rifiuto definitivo`() {
        val passi = (0..6).map { "https://github.com/a/$it" }
        val gh = GitHubFinto(passi.zipWithNext().associate { (da, a) -> da to rinvio(a) })
        rifiutato("troppi-rinvii") { TalosRinvioAggiornamento.risolvi(passi[0], gh.apri, adesso) }
        assertEquals(TalosRinvioAggiornamento.MASSIMO_SALTI + 1, gh.aperte.size)
    }

    @Test
    fun `UPD-RIN-04 da https a http e' un rifiuto definitivo`() {
        val gh = GitHubFinto(mapOf(origine to rinvio("http://release-assets.githubusercontent.com/x?se=2026-10-26T11%3A27%3A46Z")))
        rifiutato("rinvio-non-sicuro") { TalosRinvioAggiornamento.risolvi(origine, gh.apri, adesso) }
    }

    @Test
    fun `UPD-RIN-05 una risposta diretta torna lo stesso indirizzo, e la fonte di prova resta su 127_0_0_1`() {
        val diretto = "http://127.0.0.1:4391/download/v0.1.90/TALOS-0.1.90.apk"
        assertEquals(diretto, TalosRinvioAggiornamento.risolvi(diretto, GitHubFinto(mapOf(diretto to Risposta(200))).apri, adesso).url)
        val firmatoDiProva = "http://127.0.0.1:4392/firmato/v0.1.90/TALOS-0.1.90.apk?se=2026-10-26T11%3A27%3A46Z"
        assertEquals(firmatoDiProva, TalosRinvioAggiornamento.risolvi(diretto, GitHubFinto(mapOf(diretto to rinvio(firmatoDiProva))).apri, adesso).url)
        // http fuori da 127.0.0.1 no, nemmeno partendo dalla fonte di prova
        rifiutato("rinvio-non-sicuro") {
            TalosRinvioAggiornamento.risolvi(diretto, GitHubFinto(mapOf(diretto to rinvio("http://example.com/x"))).apri, adesso)
        }
    }

    @Test
    fun `UPD-RIN-06 la scadenza viene da se= o da X-Amz, in tempo monotono, e senza resta ignota`() {
        val gh = GitHubFinto(mapOf(origine to rinvio(firmato)))
        assertEquals(1_000_000L + 3_600_000L, TalosRinvioAggiornamento.risolvi(origine, gh.apri, adesso).deadlineMs)

        val amz = "https://objects.githubusercontent.com/x?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261026T102746Z&X-Amz-Expires=1800&X-Amz-Signature=y"
        assertEquals(1_000_000L + 1_800_000L,
            TalosRinvioAggiornamento.risolvi(origine, GitHubFinto(mapOf(origine to rinvio(amz))).apri, adesso).deadlineMs)

        val senza = "https://release-assets.githubusercontent.com/x?sig=z"
        assertEquals(Long.MIN_VALUE,
            TalosRinvioAggiornamento.risolvi(origine, GitHubFinto(mapOf(origine to rinvio(senza))).apri, adesso).deadlineMs)
        // senza `Date` del server la durata non si può misurare: ignota, mai inventata
        val senzaData = GitHubFinto(mapOf(origine to Risposta(302, mapOf("Location" to firmato))))
        assertEquals(Long.MIN_VALUE, TalosRinvioAggiornamento.risolvi(origine, senzaData.apri, adesso).deadlineMs)
    }

    /**
     * ⛔ Regressione vista sul Pad il 26/10 (server di prova con firme da 20 s): il runner rifirma quando mancano meno di
     * `RESOLVE_MARGIN_MS` (5 min) alla scadenza, quindi una firma più corta nasceva già scaduta e la risoluzione ripartiva senza
     * attesa: 11 379 HEAD in un minuto, zero byte. GitHub è stato visto dare firme da 300 s (`X-Amz-Expires=300`).
     */
    @Test
    fun `UPD-RIN-11 una firma piu' corta del margine del runner non ha scadenza, se no si rifirma all'infinito`() {
        val corta = "https://objects.githubusercontent.com/x?X-Amz-Date=20261026T102746Z&X-Amz-Expires=300&X-Amz-Signature=y"
        assertEquals(Long.MIN_VALUE,
            TalosRinvioAggiornamento.risolvi(origine, GitHubFinto(mapOf(origine to rinvio(corta))).apri, adesso).deadlineMs)
        val venti = "https://release-assets.githubusercontent.com/x?se=2026-10-26T10%3A28%3A06Z&sig=z"
        assertEquals(Long.MIN_VALUE,
            TalosRinvioAggiornamento.risolvi(origine, GitHubFinto(mapOf(origine to rinvio(venti))).apri, adesso).deadlineMs)
        // appena sopra il margine la scadenza c'è, e il runner rifirmerà prima del 403
        val sopra = "https://objects.githubusercontent.com/x?X-Amz-Date=20261026T102746Z&X-Amz-Expires=301&X-Amz-Signature=y"
        assertEquals(1_000_000L + 301_000L,
            TalosRinvioAggiornamento.risolvi(origine, GitHubFinto(mapOf(origine to rinvio(sopra))).apri, adesso).deadlineMs)
    }

    @Test
    fun `UPD-RIN-07 un Location relativo si risolve sull'indirizzo corrente`() {
        val gh = GitHubFinto(mapOf(
            origine to rinvio("../mobile-v0.1.46b/TALOS-0.1.46.apk"),
            "https://github.com/Ninozzz95/talos/releases/download/mobile-v0.1.46b/TALOS-0.1.46.apk" to Risposta(200),
        ))
        assertEquals("https://github.com/Ninozzz95/talos/releases/download/mobile-v0.1.46b/TALOS-0.1.46.apk",
            TalosRinvioAggiornamento.risolvi(origine, gh.apri, adesso).url)
    }

    @Test
    fun `UPD-RIN-08 nessuna credenziale mandata, a nessun host`() {
        val gh = GitHubFinto(mapOf(origine to rinvio(firmato)))
        TalosRinvioAggiornamento.risolvi(origine, gh.apri, adesso)
        assertTrue(gh.aperte.all { it.richiestaAutorizzazione == null })
    }

    @Test
    fun `UPD-RIN-09 un 3xx senza Location e' un rifiuto definitivo, non un giro infinito`() {
        val gh = GitHubFinto(mapOf(origine to Risposta(302, mapOf("Date" to dataServer))))
        rifiutato("rinvio-senza-indirizzo") { TalosRinvioAggiornamento.risolvi(origine, gh.apri, adesso) }
        assertEquals(1, gh.aperte.size)
    }

    @Test
    fun `UPD-RIN-10 un guasto di rete resta un guasto da riprovare, non un rifiuto`() {
        val apri: (URL) -> HttpURLConnection = { throw IOException("rete giù") }
        try {
            TalosRinvioAggiornamento.risolvi(origine, apri, adesso)
            fail("doveva lanciare")
        } catch (rifiuto: TalosRinvioRifiutato) {
            fail("un guasto di rete non è un rifiuto: ${rifiuto.motivo}")
        } catch (atteso: IOException) {
            assertEquals("rete giù", atteso.message)
        }
    }

    private fun rifiutato(motivo: String, blocco: () -> Unit) {
        try {
            blocco()
            fail("doveva rifiutare con $motivo")
        } catch (rifiuto: TalosRinvioRifiutato) {
            assertEquals(motivo, rifiuto.motivo)
        }
    }
}
