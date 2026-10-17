package ai.talos.terminal

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * ⛔ Sessioni del Codice dall'area del ponte all'app (owner 14/10/2026: «Sessioni + cartella di lavoro», «Da solo, una
 * volta»; ledger `LEDGER-SESSIONI-DAL-PONTE-2026-10-14.md`). Qui la parte senza Android: la riscrittura della cartella, la
 * copia che non sovrascrive mai, i file che non si leggono, la catena dei lettori.
 */
class TalosPassaggioDalPonteTest {
    @get:Rule val tmp = TemporaryFolder()

    private val vecchia = "/data/local/tmp/talos/workspace"
    private val nuova = "/data/data/ai.talos.dev/files/codice/workspace"

    @Test
    fun `COD-PONTE-01 si riscrive solo il campo cartella che è la vecchia cartella di lavoro o sta sotto`() {
        val intestazione = """{"tipo":"intestazione","sessionId":"s","cartella":"$vecchia","task":{"consegna":"x"}}"""
        assertEquals(
            """{"tipo":"intestazione","sessionId":"s","cartella":"$nuova","task":{"consegna":"x"}}""",
            TalosPassaggioDalPonte.riscriviCartella(intestazione, vecchia, nuova),
        )
        val sotto = """{"type":"RunStarted","input":{"cartella":"$vecchia/qa-campagna"}}"""
        assertEquals(
            """{"type":"RunStarted","input":{"cartella":"$nuova/qa-campagna"}}""",
            TalosPassaggioDalPonte.riscriviCartella(sotto, vecchia, nuova),
        )
        // La storia non si tocca: il percorso dentro un testo resta com'era.
        val testo = """{"role":"tool","content":"ls -la $vecchia\n4 file"}"""
        assertEquals(testo, TalosPassaggioDalPonte.riscriviCartella(testo, vecchia, nuova))
        // Un'altra cartella (il genitore, un nome che comincia uguale) resta.
        val genitore = """{"tipo":"intestazione","cartella":"/data/local/tmp"}"""
        assertEquals(genitore, TalosPassaggioDalPonte.riscriviCartella(genitore, vecchia, nuova))
        val simile = """{"cartella":"${vecchia}2"}"""
        assertEquals(simile, TalosPassaggioDalPonte.riscriviCartella(simile, vecchia, nuova))
    }

    private fun sorgente(): File {
        val s = tmp.newFolder("ponte")
        File(s, "state/sessions-store").mkdirs()
        File(s, "state/artifacts").mkdirs()
        File(s, "state/automations").mkdirs()
        File(s, "workspace/qa-campagna").mkdirs()
        File(s, "state/sessions-store/a.jsonl").writeText(
            """{"tipo":"intestazione","sessionId":"a","cartella":"$vecchia"}""" + "\n" + """{"role":"user","content":"ciao"}""" + "\n",
        )
        File(s, "state/artifacts/p.html").writeText("<p>pagina</p>")
        File(s, "workspace/qa-campagna/sconto.js").writeText("module.exports = 1\n")
        File(s, "workspace/prova.bin").writeBytes(byteArrayOf(0, 1, 2, -1))
        return s
    }

    private fun destinazione(): TalosCodiceInCasa.Disposizione = TalosCodiceInCasa.disposizione(tmp.newFolder("codice"))

    @Test
    fun `COD-PONTE-02 si copiano sessioni riscritte, artefatti, automazioni e la cartella di lavoro intera`() {
        val s = sorgente()
        val d = destinazione()
        val esito = TalosPassaggioDalPonte.porta(TalosPassaggioDalPonte.LettoreDiretto(), s.path, d, vecchia)
        assertEquals(4, esito.copiati)
        assertEquals(0, esito.mancati)
        val sessione = File(d.stato, "sessions-store/a.jsonl").readText()
        assertTrue(sessione.contains(""""cartella":"${d.lavoro.path}""""))
        assertTrue(sessione.endsWith("""{"role":"user","content":"ciao"}""" + "\n"))
        assertEquals("<p>pagina</p>", File(d.stato, "artifacts/p.html").readText())
        assertEquals("module.exports = 1\n", File(d.lavoro, "qa-campagna/sconto.js").readText())
        assertArrayEquals(byteArrayOf(0, 1, 2, -1), File(d.lavoro, "prova.bin").readBytes())
    }

    @Test
    fun `COD-PONTE-03 un file che c'è già in casa vince e non si sovrascrive`() {
        val s = sorgente()
        val d = destinazione()
        File(d.lavoro, "qa-campagna").mkdirs()
        File(d.lavoro, "qa-campagna/sconto.js").writeText("versione di casa")
        val esito = TalosPassaggioDalPonte.porta(TalosPassaggioDalPonte.LettoreDiretto(), s.path, d, vecchia)
        assertEquals("versione di casa", File(d.lavoro, "qa-campagna/sconto.js").readText())
        assertEquals(1, esito.saltati)
        assertEquals(3, esito.copiati)
    }

    @Test
    fun `COD-PONTE-04 un file che non si sa leggere finisce fra i mancati e il resto si copia`() {
        val s = sorgente()
        val d = destinazione()
        val cieco = object : TalosPassaggioDalPonte.Lettore {
            private val diretto = TalosPassaggioDalPonte.LettoreDiretto()
            override fun elenca(percorso: String) = diretto.elenca(percorso)
            override fun leggi(percorso: String) = if (percorso.endsWith("p.html")) null else diretto.leggi(percorso)
        }
        val esito = TalosPassaggioDalPonte.porta(cieco, s.path, d, vecchia)
        assertEquals(1, esito.mancati)
        assertEquals(3, esito.copiati)
        assertFalse(File(d.stato, "artifacts/p.html").exists())
    }

    @Test
    fun `COD-PONTE-05 nella catena il secondo lettore serve solo dove il primo non arriva`() {
        val chiesti = mutableListOf<String>()
        val primo = object : TalosPassaggioDalPonte.Lettore {
            override fun elenca(percorso: String) = listOf(TalosPassaggioDalPonte.Voce("x", false))
            override fun leggi(percorso: String): ByteArray? = if (percorso == "/chiuso") null else byteArrayOf(1)
        }
        val secondo = object : TalosPassaggioDalPonte.Lettore {
            override fun elenca(percorso: String): List<TalosPassaggioDalPonte.Voce>? { chiesti += "elenca $percorso"; return null }
            override fun leggi(percorso: String): ByteArray? { chiesti += "leggi $percorso"; return byteArrayOf(2) }
        }
        val catena = TalosPassaggioDalPonte.LettoreInCatena(primo, secondo)
        assertArrayEquals(byteArrayOf(1), catena.leggi("/aperto"))
        assertArrayEquals(byteArrayOf(2), catena.leggi("/chiuso"))
        assertEquals(listOf("leggi /chiuso"), chiesti)
    }

    @Test
    fun `COD-PONTE-06 senza area del ponte niente da fare e nessun errore`() {
        val d = destinazione()
        val esito = TalosPassaggioDalPonte.porta(TalosPassaggioDalPonte.LettoreDiretto(), File(tmp.root, "non-c-e").path, d, vecchia)
        assertEquals(TalosPassaggioDalPonte.Esito(0, 0, 0), esito)
        assertNull(File(d.stato, "sessions-store").listFiles()?.takeIf { it.isNotEmpty() })
    }

    @Test
    fun `COD-PONTE-07 la sorgente resta identica dopo il passaggio`() {
        val s = sorgente()
        val prima = s.walkTopDown().filter { it.isFile }.associate { it.relativeTo(s).path to it.readBytes().toList() }
        TalosPassaggioDalPonte.porta(TalosPassaggioDalPonte.LettoreDiretto(), s.path, destinazione(), vecchia)
        val dopo = s.walkTopDown().filter { it.isFile }.associate { it.relativeTo(s).path to it.readBytes().toList() }
        assertEquals(prima, dopo)
    }
}
