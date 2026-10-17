package ai.talos.terminal

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * «Codice in casa» (owner 13/10/2026: il Codice senza il ponte ADB; ledger
 * `.claude/ragionamento/LEDGER-CODICE-SENZA-PONTE-2026-10-13.md`). Qui si prova ciò che non ha bisogno di Android: dove
 * stanno le cose, con quale ambiente parte il server, quali processi sono nostri. L'avvio vero si prova sul Pad.
 */
class TalosCodiceInCasaTest {
    private fun radice(): File = Files.createTempDirectory("talos-codice").toFile()

    @Test
    fun laDisposizioneELaStessaCheIlServerSiAspetta() {
        val r = radice()
        val d = TalosCodiceInCasa.disposizione(r)
        // `agent-service.mjs` importa `../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`: i due alberi
        // devono stare fianco a fianco, con questi nomi.
        assertEquals(File(r, "AVM/harness-ui/server.mjs").canonicalFile, d.serverJs)
        assertEquals(File(r, "AVM-harness/mobile/scripts/harness-talos").canonicalFile, d.kernel)
        assertEquals(File(r, "AVM/mobile/public/harness-ui").canonicalFile, d.pubblica)
        assertEquals(File(r, "state").canonicalFile, d.stato)
        assertEquals(File(r, "workspace").canonicalFile, d.lavoro)
        assertEquals(File(r, "state/server-token").canonicalFile, d.segreto)
        assertEquals(listOf("esiti-22ago-progetti", "esiti-22ago-storia"), d.campagne.map { it.name })
        assertTrue(d.campagne.all { it.parentFile == File(r, "banco-locale").canonicalFile })
    }

    /** ⛔ MISURATO sul Pad: `/data/user/0` è un collegamento a `/data/data`; col percorso non canonico `server.mjs` usciva in silenzio. */
    @Test
    fun iPercorsiSonoCanonici() {
        val vera = radice()
        val collegamento = File(vera.parentFile, vera.name + "-coll")
        try {
            Files.createSymbolicLink(collegamento.toPath(), vera.toPath())
        } catch (_: Throwable) {
            return // su questo sistema non si possono creare collegamenti: la prova non ha materia
        }
        val d = TalosCodiceInCasa.disposizione(collegamento)
        assertTrue(d.serverJs.path.startsWith(vera.canonicalPath))
        assertFalse(d.serverJs.path.contains("-coll"))
    }

    @Test
    fun lAmbienteEQuelloDellAvvioDiOggiConIPercorsiInCasa() {
        val r = radice()
        val d = TalosCodiceInCasa.disposizione(r)
        val a = TalosCodiceInCasa.ambiente(d, File(r, "cache"), mapOf("OPENROUTER_API_KEY" to "sk-prova"))
        assertEquals("1", a["TALOS_KERNEL_SUL_TELEFONO"])
        assertEquals(File(r, "banco-locale").canonicalPath, a["TALOS_BANCO_DIR"])
        assertEquals(d.pubblica.path, a["TALOS_HARNESS_UI_PUBLIC_DIR"])
        assertEquals("4174", a["TALOS_HARNESS_UI_PORT"])
        assertEquals(d.stato.path, a["TALOS_HARNESS_UI_STATE_DIR"])
        assertEquals(d.lavoro.path, a["TALOS_HARNESS_UI_PROJECT_DIRS"])
        assertNull(a["LD_LIBRARY_PATH"])
        assertEquals(d.radice.path, a["HOME"])
        assertEquals("sk-prova", a["OPENROUTER_API_KEY"])
        // l'host non si passa: resta 127.0.0.1, come oggi
        assertNull(a["TALOS_HARNESS_UI_HOST"])
    }

    /**
     * ⛔ COD-NODE-01 (14/10/2026): nella shell del Codice in casa `node` non c'era (`node --test` → «inaccessible or not
     * found»), mentre con la strada del ponte i test si lanciavano. La cartella degli attrezzi (col collegamento `node`) va
     * in testa al PATH, e chi chiama non la può togliere.
     */
    @Test
    fun `COD-NODE-01 la cartella degli attrezzi sta in testa al PATH e chi chiama non la cambia`() {
        val r = radice()
        val d = TalosCodiceInCasa.disposizione(r)
        assertEquals(File(r.canonicalFile, "bin").path, d.attrezzi.path)
        val a = TalosCodiceInCasa.ambiente(
            d, File("cache"), mapOf("PATH" to "/male"), pathDiSistema = "/system/bin:/vendor/bin",
        )
        assertEquals("${d.attrezzi.path}:/system/bin:/vendor/bin", a["PATH"])
        val senza = TalosCodiceInCasa.ambiente(d, File("cache"), emptyMap(), pathDiSistema = "")
        assertEquals(d.attrezzi.path, senza["PATH"])
    }

    @Test
    fun ilChiamantePuoCambiareLaCartellaDiLavoroMaNonDoveAscoltaIlServer() {
        val d = TalosCodiceInCasa.disposizione(radice())
        val a = TalosCodiceInCasa.ambiente(
            d, File("cache"),
            mapOf(
                "TALOS_HARNESS_UI_PROJECT_DIRS" to "/altrove",
                "TALOS_HARNESS_UI_PORT" to "9999",
                "TALOS_HARNESS_UI_HOST" to "0.0.0.0",
                "LD_LIBRARY_PATH" to "/male",
                "nome non valido" to "x",
            ),
        )
        assertEquals("/altrove", a["TALOS_HARNESS_UI_PROJECT_DIRS"])
        assertEquals("4174", a["TALOS_HARNESS_UI_PORT"])
        assertNull(a["TALOS_HARNESS_UI_HOST"])
        assertFalse(a.containsKey("nome non valido"))
    }

    /**
     * ⛔ COD-NODE-02 (K2-A, 14/10/2026; ledger `LEDGER-K2A-NODE-AUTOSUFFICIENTE-2026-10-14.md`): Node trova le sue librerie da sé
     * (`DT_RUNPATH=$ORIGIN`). `LD_LIBRARY_PATH` non si imposta più, e chi chiama non lo può rimettere: una libreria messa davanti
     * a quelle di Node cambierebbe il codice che il server carica.
     */
    @Test
    fun `COD-NODE-02 LD_LIBRARY_PATH non c'è e chi chiama non lo mette`() {
        val d = TalosCodiceInCasa.disposizione(radice())
        val a = TalosCodiceInCasa.ambiente(d, File("cache"), mapOf("LD_LIBRARY_PATH" to "/male"))
        assertFalse(a.containsKey("LD_LIBRARY_PATH"))
    }

    @Test
    fun nostriSonoSoloIProcessiCheEseguonoQuelServer() {
        val server = "/data/data/ai.talos/files/codice/AVM/harness-ui/server.mjs"
        val node = "/data/app/x/lib/arm64/libtalosnode.so"
        val righe = mapOf(
            101 to listOf(node, server),
            102 to listOf(node, "/data/data/ai.talos/files/codice/AVM/harness-ui/altro.mjs"),
            103 to listOf("/system/bin/sh", "-c", "cat $server"),
            104 to listOf("/system/bin/linker64", node, server),
            105 to listOf(node, "/data/local/tmp/talos/AVM/harness-ui/server.mjs"),
            106 to emptyList(),
        )
        assertEquals(listOf(101, 104), TalosCodiceInCasa.serverNostri(righe, server))
    }

    @Test
    fun ilSegretoSiLeggeDalFileDelServerEVieneRifiutatoSeNonHaLaForma() {
        val d = TalosCodiceInCasa.disposizione(radice())
        assertNull(TalosCodiceInCasa.leggiSegreto(d))
        d.segreto.parentFile!!.mkdirs()
        d.segreto.writeText("a".repeat(64) + "\n")
        assertEquals("a".repeat(64), TalosCodiceInCasa.leggiSegreto(d))
        d.segreto.writeText("non un segreto")
        assertNull(TalosCodiceInCasa.leggiSegreto(d))
    }

    /** Prova di struttura: il plugin prova prima in casa, legge il segreto in casa, e niente dell'ambiente finisce nel registro. */
    @Test
    fun ilPluginPassaDallaCasaENonScriveSegretiNelRegistro() {
        fun leggi(nome: String) = sequenceOf("src/main/java/ai/talos/terminal/$nome", "app/src/main/java/ai/talos/terminal/$nome")
            .map { File(it) }.first { it.isFile }.readText().replace("\r", "")
        val plugin = leggi("TalosTerminalPlugin.kt")
        val avvia = plugin.substringAfter("fun avviaServerHarness(call: PluginCall)").substringBefore("fun leggiSegretoServer")
        assertTrue(avvia.indexOf("TalosCodiceInCasa.avvia(") in 0 until avvia.indexOf("assicuraRuntimeSulTelefono()"))
        val segreto = plugin.substringAfter("fun leggiSegretoServer(call: PluginCall)")
        assertTrue(segreto.indexOf("TalosCodiceInCasa.segretoSeInCasa(") in 0 until segreto.indexOf("FILE_SEGRETO_REMOTO"))
        val casa = leggi("TalosCodiceInCasa.kt")
        assertFalse(Regex("Log\\.[a-z]\\([^)]*ambiente").containsMatchIn(casa))
        assertTrue(casa.contains("redirectErrorStream(true)"))
    }
}
