package ai.talos.terminal

import android.content.Context
import android.system.Os
import android.util.Log
import java.io.File
import java.security.SecureRandom

/**
 * K2-B, B4 (ledger `LEDGER-K2B-R4-NELL-APP-2026-10-14.md`): il server r4 nell'app di sviluppo.
 *
 * Owner 14/10, «Affiancato»: r4 parte ACCANTO al server del Codice di oggi, sulla porta di prova [PORTA], finché l'interfaccia del
 * Codice non è allineata (K3). Esiste solo se la build ha messo l'archivio negli asset (`-PtalosR4Archivio`, solo debug).
 *
 * I segreti NON passano dall'ambiente (resterebbero in `/proc/<pid>/environ`, leggibili dai comandi del Codice): token di r4 e
 * chiave dati del portachiavi vanno nello stdin del server, nella forma di Nino1 (`TALOS_HARNESS_UI_SEGRETI_DA=stdin`, righe
 * `NOME=valore`, poi lo stdin si chiude). Le chiavi dei fornitori r4 le tiene nel suo portachiavi (K2-C), mai nell'ambiente.
 */
object TalosR4Avvio {
    private const val TAG = "TalosR4Avvio"
    const val PORTA = 4178
    const val ASSET_ARCHIVIO = "talos-r4/r4.tar"
    const val ASSET_PORTACHIAVI = "talos-r4/portachiavi-android.mjs"
    private const val VAR_TOKEN = "TALOS_HARNESS_UI_TOKEN"
    private const val VAR_CHIAVE = "TALOS_R4_PORTACHIAVI_CHIAVE"
    private const val TETTO_STDIN = 4096
    private val NOME_SEGRETO = Regex("^[A-Z][A-Z0-9_]*$")

    /** Da chi chiama passa solo questo: niente chiavi, niente scelte su dove e come il server ascolta. */
    private val AMMESSE_DAL_CHIAMANTE = setOf("TALOS_HARNESS_UI_PROJECT_DIRS")

    class Disposizione(
        val radice: File, val pacchetto: File, val serverJs: File, val stato: File, val chiavi: File, val portachiavi: File,
        val sigillo: File, val modulo: File, val registro: File, val marcatore: File, val attrezzi: File,
    )

    fun disposizione(radice: File): Disposizione {
        val r = radice.canonicalFile
        val pacchetto = File(r, TalosR4Archivio.CARTELLA_PACCHETTO)
        val chiavi = File(r, "chiavi")
        return Disposizione(
            radice = r, pacchetto = pacchetto, serverJs = File(pacchetto, "harness-ui/server.mjs"), stato = File(r, "state"),
            chiavi = chiavi, portachiavi = File(chiavi, "portachiavi.json"), sigillo = File(chiavi, "chiave-dati.sigillo"),
            modulo = File(r, "talos-mobile/portachiavi-android.mjs"), registro = File(r, "harness-ui.log"),
            marcatore = File(r, ".apk-last-update-time"), attrezzi = File(r, "bin"),
        )
    }

    fun nuovoToken(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }

    /** I segreti per lo stdin di r4: righe `NOME=valore`, ognuna chiusa da `\n`. */
    fun righeSegreti(token: String, chiave: ByteArray): ByteArray {
        require(token.length >= 32 && token.none { it.isWhitespace() }) { "the r4 token must have at least 32 characters, no spaces" }
        require(chiave.size == TalosChiaveDatiR4.BYTE_CHIAVE) { "the data key must be ${TalosChiaveDatiR4.BYTE_CHIAVE} bytes" }
        val voci = listOf(VAR_TOKEN to token, VAR_CHIAVE to java.util.Base64.getEncoder().encodeToString(chiave))
        val testo = voci.joinToString("") { (nome, valore) ->
            require(NOME_SEGRETO.matches(nome) && valore.isNotEmpty() && '\n' !in valore && '\r' !in valore)
            "$nome=$valore\n"
        }
        val byte = testo.toByteArray(Charsets.UTF_8)
        require(byte.size <= TETTO_STDIN) { "secrets exceed the $TETTO_STDIN-byte stdin limit" }
        return byte
    }

    fun ambiente(
        d: Disposizione,
        lavoro: File,
        attrezzi: File,
        cache: File,
        dalChiamante: Map<String, String>,
        pathDiSistema: String = System.getenv("PATH") ?: "",
    ): Map<String, String> {
        val a = LinkedHashMap<String, String>()
        a["TALOS_HARNESS_UI_PORT"] = PORTA.toString()
        a["TALOS_HARNESS_UI_STATE_DIR"] = d.stato.path
        // ⛔ Senza queste due r4 scrive sessioni, database di contesto e output dei processi accanto a `server.mjs`, cioè dentro il
        // pacchetto, che si sostituisce a ogni aggiornamento dell'APK (misurato sul Pad, 15/10).
        a["TALOS_HARNESS_UI_SESSIONS_DIR"] = File(d.stato, "sessions-store").path
        a["TALOS_DESKTOP_DATA_DIR"] = File(d.stato, "dati").path
        a["TALOS_HARNESS_UI_PROJECT_DIRS"] = lavoro.path
        a["TALOS_HARNESS_UI_KEYRING"] = "modulo:${d.modulo.path}"
        a["TALOS_R4_PORTACHIAVI_FILE"] = d.portachiavi.path
        a["TALOS_HARNESS_UI_SEGRETI_DA"] = "stdin"
        a["HOME"] = d.radice.path
        a["TMPDIR"] = cache.path
        a["PATH"] = if (pathDiSistema.isEmpty()) attrezzi.path else "${attrezzi.path}:$pathDiSistema"
        for ((nome, valore) in dalChiamante) if (nome in AMMESSE_DAL_CHIAMANTE) a[nome] = valore
        // ⛔ K3-R4SPOSTA (r4 2161afb32): gli obiettivi restano spenti finché il mobile non mostra l'obiettivo del modello. r4 toglie
        // l'attrezzo e rifiuta POST /goal (422 GOAL_NOT_ALLOWED goal-not-in-this-host): un obiettivo che nessuno vede non si ferma.
        a["TALOS_HARNESS_UI_GOALS"] = "0"
        // ⛔ Owner 18/10/2026 («Spento nel telefono»): r4 della desktop 0.1.33 accende di serie gli attrezzi differiti (`server.mjs`);
        // misurati solo su glm via OpenRouter e su ChatGPT Luna, mai su DeepSeek e Gemini del Codice del telefono. Spenti finché il
        // banco del desktop non li misura.
        a["TALOS_ATTREZZI_DIFFERITI"] = "0"
        // ⛔ CHATGPT NEL CODICE (owner 18/10/2026, «un solo accesso»; r4 f6c6625ac `server.mjs:191`): il custode del piano è l'app, che
        // spinge il token prima di ogni giro (`POST /api/v1/providers/chatgpt/access`); r4 non rinnova mai. Dopo il chiamante.
        a["TALOS_CHATGPT_CUSTODE"] = "app"
        // ⛔ CODICE COL MOTORE LOCALE (owner 18/10/2026; r4 `locale-ospite`): r4 accetta il socket del motore solo dentro questa
        // cartella, quella dove `TalosMotoreOspite` apre `motore-<casuale>.sock` (0700), accanto a `files/codice-r4`. Dopo il chiamante.
        a["TALOS_LOCALE_OSPITE_DIR"] = File(d.radice.parentFile, "locale-ospite").path
        // ⛔ K3-TERM T1 (16/10): il Terminale di r4 apre `$SHELL || /bin/bash` (`pty-terminal.mjs` `sceltaShell`); su Android la
        // shell è /system/bin/sh, e /bin/bash non esiste. Messa dopo il chiamante: non si sceglie da fuori.
        a["SHELL"] = "/system/bin/sh"
        return a
    }

    // ---------------------------------------------------------------------------------------------------------------
    // La parte che ha bisogno del telefono.
    // ---------------------------------------------------------------------------------------------------------------

    @Volatile private var processo: Process? = null
    @Volatile private var tokenAttivo: String? = null

    private fun radiceDi(context: Context) = File(context.filesDir, "codice-r4")

    /** Solo nella build di sviluppo fatta con `-PtalosR4Archivio`. */
    fun disponibile(context: Context): Boolean =
        runCatching { context.assets.open(ASSET_ARCHIVIO).close(); true }.getOrDefault(false)

    fun acceso(): Boolean = processo?.isAlive == true

    /** Il token del server acceso, solo per il client nativo ([TalosR4ClientePlugin], K3-B1); `null` se r4 è spento. */
    fun token(): String? = if (acceso()) tokenAttivo else null

    @Synchronized
    fun avvia(context: Context, dalChiamante: Map<String, String>): String? {
        if (!disponibile(context)) return "r4 non è in questa build"
        if (acceso()) return null
        val node = File(context.applicationInfo.nativeLibraryDir, TalosNodeNativo.BINARIO)
        if (!node.isFile) return "Node non c'è fra le librerie native"
        val d = disposizione(radiceDi(context))
        return try {
            prepara(context, d, node)
            val chiave = TalosChiaveDatiR4.chiaveDati(d.sigillo, d.portachiavi)
            val token = nuovoToken()
            val righe = righeSegreti(token, chiave)
            chiave.fill(0)
            val lavoro = TalosCodiceInCasa.disposizione(File(context.filesDir, "codice")).lavoro.apply { mkdirs() }
            val costruttore = ProcessBuilder(node.path, d.serverJs.path)
                .directory(d.serverJs.parentFile)
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.to(d.registro))
            val ambienteDelServer = costruttore.environment()
            ambienteDelServer.remove("LD_LIBRARY_PATH")
            ambienteDelServer.putAll(ambiente(d, lavoro, d.attrezzi, context.cacheDir, dalChiamante))
            val avviato = costruttore.start()
            try {
                avviato.outputStream.use { it.write(righe); it.flush() }
            } finally {
                righe.fill(0)
            }
            processo = avviato
            tokenAttivo = token
            Log.i(TAG, "r4 avviato accanto al Codice, porta $PORTA")
            null
        } catch (_: TalosChiaveDatiR4.ChiavePersa) {
            "il portachiavi di r4 c'è ma la sua chiave no: r4 non parte, per non perdere le chiavi"
        } catch (guasto: Throwable) {
            Log.e(TAG, "avvio di r4 non riuscito: ${guasto.javaClass.simpleName}")
            "avvio di r4 non riuscito: ${guasto.javaClass.simpleName}"
        }
    }

    @Synchronized
    fun ferma() {
        processo?.let { p ->
            p.destroy()
            if (!runCatching { p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS) }.getOrDefault(false)) p.destroyForcibly()
        }
        processo = null
        tokenAttivo = null
    }

    /** Il pacchetto dall'archivio quando l'APK è cambiato; il portachiavi a ogni avvio; `node` per la shell dell'agente. */
    private fun prepara(context: Context, d: Disposizione, node: File) {
        val installazione = context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime.toString()
        val uguale = d.marcatore.isFile && d.marcatore.readText().trim() == installazione && d.serverJs.isFile
        if (!uguale) {
            context.assets.open(ASSET_ARCHIVIO).use { TalosR4Archivio.installa(it, d.radice) }
            d.marcatore.writeText(installazione)
        }
        d.modulo.parentFile?.mkdirs()
        context.assets.open(ASSET_PORTACHIAVI).use { ingresso -> d.modulo.outputStream().use { ingresso.copyTo(it) } }
        listOf(d.stato, d.chiavi, d.attrezzi).forEach { it.mkdirs() }
        runCatching {
            val collegamento = File(d.attrezzi, "node")
            collegamento.delete()
            Os.symlink(node.path, collegamento.path)
        }
    }
}
