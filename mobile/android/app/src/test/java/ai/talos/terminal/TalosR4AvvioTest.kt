package ai.talos.terminal

import java.io.File
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * K2-B, B4 (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`; owner 14/10 «Affiancato» e «Token di r4 dallo stdin»): l'avvio di r4
 * nell'app di sviluppo, accanto al server di oggi. Qui la parte pura: i segreti per lo stdin nella forma di Nino1, il token,
 * l'ambiente, la disposizione.
 */
class TalosR4AvvioTest {
    private fun radice(): File = Files.createTempDirectory("talos-r4-avvio").toFile()
    private val chiave = ByteArray(32) { (it * 7 + 3).toByte() }

    @Test
    fun `R4AV-01 i segreti per lo stdin sono righe NOME=valore, e niente di storto passa`() {
        val token = "a".repeat(64)
        val testo = String(TalosR4Avvio.righeSegreti(token, chiave), Charsets.UTF_8)
        val b64 = java.util.Base64.getEncoder().encodeToString(chiave)
        assertEquals("TALOS_HARNESS_UI_TOKEN=$token\nTALOS_R4_PORTACHIAVI_CHIAVE=$b64\n", testo)
        for (riga in testo.trimEnd('\n').split('\n')) {
            assertTrue(riga, Regex("^[A-Z][A-Z0-9_]*=[^\\r\\n]+$").matches(riga))
        }
        assertTrue(testo.toByteArray().size <= 4096)
        for (cattivo in listOf("corto", "a".repeat(40) + " " + "b".repeat(10), "a".repeat(40) + "\n")) {
            assertTrue(cattivo, runCatching { TalosR4Avvio.righeSegreti(cattivo, chiave) }.exceptionOrNull() is IllegalArgumentException)
        }
        assertTrue(runCatching { TalosR4Avvio.righeSegreti(token, ByteArray(16)) }.exceptionOrNull() is IllegalArgumentException)
    }

    @Test
    fun `R4AV-02 il token e' di 64 caratteri esadecimali, nuovo ogni volta`() {
        val uno = TalosR4Avvio.nuovoToken()
        val due = TalosR4Avvio.nuovoToken()
        assertTrue(Regex("^[0-9a-f]{64}$").matches(uno))
        assertNotEquals(uno, due)
    }

    @Test
    fun `R4AV-03 l'ambiente porta r4 sulla porta di prova, col portachiavi, e nessun segreto`() {
        val d = TalosR4Avvio.disposizione(radice())
        val lavoro = File("/data/data/ai.talos.dev/files/codice/workspace")
        val attrezzi = File("/data/data/ai.talos.dev/files/codice/bin")
        val a = TalosR4Avvio.ambiente(
            d, lavoro, attrezzi, File("cache"),
            mapOf(
                "TALOS_HARNESS_UI_PROJECT_DIRS" to "/altrove",
                "OPENROUTER_API_KEY" to "sk-or-v1-segreta",
                "TALOS_HARNESS_UI_TOKEN" to "x".repeat(40),
                "TALOS_HARNESS_UI_PORT" to "9999",
                "TALOS_HARNESS_UI_KEYRING" to "memoria",
                "LD_LIBRARY_PATH" to "/male",
            ),
            pathDiSistema = "/system/bin",
        )
        assertEquals("4178", a["TALOS_HARNESS_UI_PORT"])
        assertEquals(d.stato.path, a["TALOS_HARNESS_UI_STATE_DIR"])
        assertEquals("modulo:${d.modulo.path}", a["TALOS_HARNESS_UI_KEYRING"])
        assertEquals(d.portachiavi.path, a["TALOS_R4_PORTACHIAVI_FILE"])
        assertEquals("stdin", a["TALOS_HARNESS_UI_SEGRETI_DA"])
        // ⛔ B4 sul Pad (15/10): senza queste due r4 scriveva sessioni, database di contesto e output dei processi DENTRO la
        // cartella del pacchetto, che si sostituisce a ogni aggiornamento dell'APK. Tutto fuori, sotto lo stato.
        assertEquals(File(d.stato, "sessions-store").path, a["TALOS_HARNESS_UI_SESSIONS_DIR"])
        assertEquals(File(d.stato, "dati").path, a["TALOS_DESKTOP_DATA_DIR"])
        assertTrue(a.filterKeys { it.endsWith("_DIR") }.values.none { it.startsWith(d.pacchetto.path) })
        assertEquals("/altrove", a["TALOS_HARNESS_UI_PROJECT_DIRS"])
        assertEquals("${attrezzi.path}:/system/bin", a["PATH"])
        assertEquals(d.radice.path, a["HOME"])
        for (vietata in listOf("OPENROUTER_API_KEY", "TALOS_HARNESS_UI_TOKEN", "TALOS_R4_PORTACHIAVI_CHIAVE", "LD_LIBRARY_PATH")) {
            assertFalse(vietata, a.containsKey(vietata))
        }
        assertTrue(a.values.none { "segreta" in it })
        val senza = TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), emptyMap(), pathDiSistema = "")
        assertEquals(lavoro.path, senza["TALOS_HARNESS_UI_PROJECT_DIRS"])
        assertEquals(attrezzi.path, senza["PATH"])
    }

    @Test
    fun `R4AV-03b gli obiettivi sono spenti sul telefono, e il chiamante non li riaccende`() {
        // ⛔ K3-R4SPOSTA (15/10, desktop 2161afb32): il mobile non mostra ancora l'obiettivo del modello; con TALOS_HARNESS_UI_GOALS=0
        // r4 toglie l'attrezzo e rifiuta POST /goal (422 GOAL_NOT_ALLOWED goal-not-in-this-host). Un obiettivo invisibile non si ferma.
        val d = TalosR4Avvio.disposizione(radice())
        val lavoro = File("/data/data/ai.talos.dev/files/codice/workspace")
        val attrezzi = File("/data/data/ai.talos.dev/files/codice/bin")
        assertEquals("0", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), emptyMap())["TALOS_HARNESS_UI_GOALS"])
        assertEquals("0", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), mapOf("TALOS_HARNESS_UI_GOALS" to "1"))["TALOS_HARNESS_UI_GOALS"])
    }

    @Test
    fun `R4AV-03c il Terminale di r4 apre la shell di Android, e il chiamante non la cambia`() {
        // ⛔ K3-TERM T1 (16/10): r4 sceglie `$SHELL || /bin/bash` (`pty-terminal.mjs` `sceltaShell`); su Android /bin/bash non c'è.
        val d = TalosR4Avvio.disposizione(radice())
        val lavoro = File("/data/data/ai.talos.dev/files/codice/workspace")
        val attrezzi = File("/data/data/ai.talos.dev/files/codice/bin")
        assertEquals("/system/bin/sh", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), emptyMap())["SHELL"])
        assertEquals("/system/bin/sh", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), mapOf("SHELL" to "/bin/bash"))["SHELL"])
    }

    @Test
    fun `R4AV-03d gli attrezzi differiti sono spenti sul telefono, e il chiamante non li riaccende`() {
        // ⛔ Owner 18/10/2026 («Spento nel telefono»): r4 della desktop 0.1.33 (a813c2377) accende di serie il ponte degli attrezzi
        // differiti (`server.mjs`, `TALOS_ATTREZZI_DIFFERITI !== '0'`). Misurato solo su glm via OpenRouter e su ChatGPT Luna, mai su
        // DeepSeek e Gemini che il Codice del telefono usa: resta spento finché il banco non li misura.
        val d = TalosR4Avvio.disposizione(radice())
        val lavoro = File("/data/data/ai.talos.dev/files/codice/workspace")
        val attrezzi = File("/data/data/ai.talos.dev/files/codice/bin")
        assertEquals("0", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), emptyMap())["TALOS_ATTREZZI_DIFFERITI"])
        assertEquals("0", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), mapOf("TALOS_ATTREZZI_DIFFERITI" to "1"))["TALOS_ATTREZZI_DIFFERITI"])
    }

    @Test
    fun `R4AV-03e il custode del piano ChatGPT e l'app, e il chiamante non lo cambia`() {
        // ⛔ CHATGPT NEL CODICE (owner 18/10/2026, «un solo accesso»; r4 f6c6625ac `server.mjs:191`): r4 non rinnova mai il token del
        // piano, lo riceve dall'app. Senza la variabile r4 terrebbe una custodia sua, e due custodi si bruciano il refresh token.
        val d = TalosR4Avvio.disposizione(radice())
        val lavoro = File("/data/data/ai.talos.dev/files/codice/workspace")
        val attrezzi = File("/data/data/ai.talos.dev/files/codice/bin")
        assertEquals("app", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), emptyMap())["TALOS_CHATGPT_CUSTODE"])
        assertEquals("app", TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), mapOf("TALOS_CHATGPT_CUSTODE" to "r4"))["TALOS_CHATGPT_CUSTODE"])
    }

    @Test
    fun `R4AV-03f la cartella del motore locale e files-locale-ospite, e il chiamante non la sposta`() {
        // ⛔ CODICE COL MOTORE LOCALE (owner 18/10/2026; fonte r4 `locale-ospite`): r4 accetta un socket solo dentro questa cartella.
        // È quella dove `TalosMotoreOspite` apre `motore-<casuale>.sock` (0700), accanto a `files/codice-r4`.
        val r = radice()
        val d = TalosR4Avvio.disposizione(r)
        val lavoro = File("/data/data/ai.talos.dev/files/codice/workspace")
        val attrezzi = File("/data/data/ai.talos.dev/files/codice/bin")
        val attesa = File(r.canonicalFile.parentFile, "locale-ospite").path
        assertEquals(attesa, TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), emptyMap())["TALOS_LOCALE_OSPITE_DIR"])
        assertEquals(attesa, TalosR4Avvio.ambiente(d, lavoro, attrezzi, File("cache"), mapOf("TALOS_LOCALE_OSPITE_DIR" to "/sdcard"))["TALOS_LOCALE_OSPITE_DIR"])
    }

    @Test
    fun `R4AV-04 tutto sta sotto la cartella di r4, coi percorsi canonici`() {
        val r = radice()
        val d = TalosR4Avvio.disposizione(r)
        val base = r.canonicalFile
        assertEquals(File(base, "pacchetto"), d.pacchetto)
        assertEquals(File(base, "pacchetto/harness-ui/server.mjs"), d.serverJs)
        assertEquals(File(base, "state"), d.stato)
        assertEquals(File(base, "chiavi/portachiavi.json"), d.portachiavi)
        assertEquals(File(base, "chiavi/chiave-dati.sigillo"), d.sigillo)
        assertEquals(File(base, "talos-mobile/portachiavi-android.mjs"), d.modulo)
        assertTrue(listOf(d.pacchetto, d.stato, d.chiavi, d.modulo, d.registro, d.marcatore).all { it.path.startsWith(base.path) })
        assertEquals(TalosR4Archivio.CARTELLA_PACCHETTO, d.pacchetto.name)
    }

    /**
     * ⛔ D-0145-2 (Desktop, Pad 25/10 notte): ai.talos e la copia affiancata ai.talos.dev accendevano r4 sulla STESSA porta; quella
     * che partiva dopo trovava la porta presa e il suo client parlava all'r4 dell'altra col proprio token: 401 AUTH_REQUIRED nella
     * lista del Codice. La copia affiancata ha la sua porta; la release resta sulla 4178 (r4 legge `TALOS_HARNESS_UI_PORT` e
     * ammette le origini della porta su cui ascolta, `http-app.mjs:2908` @ d5bed0a16).
     */
    @Test
    fun `R4AV-09 la copia affiancata accende r4 su una porta sua, la release sulla 4178`() {
        assertEquals(4178, TalosR4Avvio.portaPer("ai.talos"))
        assertEquals(4188, TalosR4Avvio.portaPer("ai.talos.dev"))
        assertNotEquals(TalosR4Avvio.portaPer("ai.talos"), TalosR4Avvio.portaPer("ai.talos.dev"))
        val d = TalosR4Avvio.disposizione(radice())
        assertEquals(TalosR4Avvio.PORTA.toString(), TalosR4Avvio.ambiente(d, radice(), radice(), radice(), emptyMap())["TALOS_HARNESS_UI_PORT"])
    }
}
