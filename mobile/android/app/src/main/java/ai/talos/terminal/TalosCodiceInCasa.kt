package ai.talos.terminal

import android.content.Context
import android.system.Os
import android.util.Log
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket

/**
 * ⭐ IL CODICE IN CASA — il server del Codice avviato dall'app, senza il ponte ADB.
 *
 * Owner 13/10/2026, dopo aver visto il Codice muto a ponte scollegato: «come proponi di risolvere al meglio senza usare
 * il ponte ADB?» → «sì, parti con la prima fase». Ledger: `.claude/ragionamento/LEDGER-CODICE-SENZA-PONTE-2026-10-13.md`.
 *
 * ## Perché adesso si può, e il 28/08 no
 * Il 28/08 Node dentro il processo dell'app fu scartato su una RICERCA (vedi [TalosTerminalPlugin], commento di classe).
 * MISURATO sul Pad il 13/10/2026: lo stesso Node v24.18.0, figlio del processo dell'app (dominio `untrusted_app`), regge
 * file, sqlite, fili di lavoro, server locale, rete e sottoprocessi; il vero server del Codice è pronto in 0,63 s.
 *
 * ## Come parte
 * Android non lascia eseguire un file dalla cartella dei dati dell'app (regola W^X, «Behavior changes: apps targeting
 * API 29+»), e indica di spedire gli eseguibili DENTRO l'APK. Per questo Node sta fra le librerie native
 * ([NOME_LIBRERIA_NODE]) e parte con un avvio diretto. K2-A (14/10/2026): anche le sue nove librerie stanno lì, e Node le
 * trova da sé (`DT_RUNPATH=$ORIGIN`, [TalosNodeNativo]); niente più `LD_LIBRARY_PATH`, che il server r4 toglie ai figli.
 * ⛔ Non si passa dal `linker64`: funziona (misurato), ma è un varco che il sistema registra a ogni uso e può chiudere.
 *
 * ## Che cosa resta del ponte
 * Niente di obbligatorio. Il ponte dà al terminale i poteri di `shell`; qui il server gira coi permessi dell'app.
 * Se in questo APK Node fra le librerie native non c'è, [avvia] risponde `null` e chi chiama usa la strada del ponte.
 *
 * ⛔ Le chiavi arrivano nell'ambiente del processo e NON si scrivono mai nel registro.
 */
object TalosCodiceInCasa {
    private const val TAG = "TalosCodiceInCasa"

    const val PORTA = 4174
    const val NOME_LIBRERIA_NODE = TalosNodeNativo.BINARIO
    private const val ASSET_SERVER = "talos-harness-ui"
    private const val MARCATORE = ".apk-last-update-time"
    val CAMPAGNE = listOf("esiti-22ago-progetti", "esiti-22ago-storia")

    /** Ciò che decide dove e come il server ascolta e dove tiene lo stato: chi chiama non lo può cambiare. */
    private val RISERVATE = setOf(
        "TALOS_HARNESS_UI_PORT", "TALOS_HARNESS_UI_HOST", "TALOS_HARNESS_UI_STATE_DIR", "TALOS_HARNESS_UI_PUBLIC_DIR",
        "TALOS_BANCO_DIR", "TALOS_KERNEL_SUL_TELEFONO", "LD_LIBRARY_PATH", "HOME", "TMPDIR", "PATH",
    )

    class Disposizione(
        val radice: File, val serverJs: File, val kernel: File, val pubblica: File, val stato: File, val lavoro: File,
        val segreto: File, val banco: File, val campagne: List<File>, val registro: File,
        /** ⛔ COD-NODE-01: gli attrezzi della shell dell'agente (il collegamento `node`), in testa al PATH. */
        val attrezzi: File,
    )

    /**
     * Dove sta ogni cosa sotto `radice`. ⛔ Percorsi CANONICI: `server.mjs` parte solo se `process.argv[1]` coincide con
     * `import.meta.url`, e sul telefono `/data/user/0` è un collegamento a `/data/data` (misurato: usciva in silenzio).
     * Gli alberi `AVM/harness-ui` e `AVM-harness/…/harness-talos` stanno fianco a fianco perché il server importa il
     * kernel con un percorso relativo.
     */
    fun disposizione(radice: File): Disposizione {
        val r = radice.canonicalFile
        val stato = File(r, "state")
        val banco = File(r, "banco-locale")
        return Disposizione(
            radice = r,
            serverJs = File(r, "AVM/harness-ui/server.mjs"),
            kernel = File(r, "AVM-harness/mobile/scripts/harness-talos"),
            pubblica = File(r, "AVM/mobile/public/harness-ui"),
            stato = stato,
            lavoro = File(r, "workspace"),
            segreto = File(stato, "server-token"),
            banco = banco,
            campagne = CAMPAGNE.map { File(banco, it) },
            registro = File(r, "harness-ui.log"),
            attrezzi = File(r, "bin"),
        )
    }

    /** L'ambiente del server: quello di `TalosTerminalPlugin.avviaServerHarness`, con i percorsi in casa. */
    fun ambiente(
        d: Disposizione,
        cache: File,
        dalChiamante: Map<String, String>,
        pathDiSistema: String = System.getenv("PATH") ?: "",
    ): Map<String, String> {
        val a = LinkedHashMap<String, String>()
        a["TALOS_KERNEL_SUL_TELEFONO"] = "1"
        a["TALOS_BANCO_DIR"] = d.banco.path
        a["TALOS_HARNESS_UI_PUBLIC_DIR"] = d.pubblica.path
        a["TALOS_HARNESS_UI_PORT"] = PORTA.toString()
        a["TALOS_HARNESS_UI_STATE_DIR"] = d.stato.path
        // Di serie; chi chiama può indicarne un'altra, come sulla strada del ponte.
        a["TALOS_HARNESS_UI_PROJECT_DIRS"] = d.lavoro.path
        // ⛔ COD-NODE-02 (K2-A): niente LD_LIBRARY_PATH; resta fra le RISERVATE, così chi chiama non lo rimette.
        a["HOME"] = d.radice.path
        a["TMPDIR"] = cache.path
        // ⛔ COD-NODE-01 (14/10/2026): senza, `node --test` nella shell dell'agente era «inaccessible or not found».
        a["PATH"] = if (pathDiSistema.isEmpty()) d.attrezzi.path else "${d.attrezzi.path}:$pathDiSistema"
        for ((nome, valore) in dalChiamante) {
            if (nome in RISERVATE || !TalosPonteSegreti.nomeValido(nome)) continue
            a[nome] = valore
        }
        return a
    }

    /**
     * I processi che eseguono QUEL server: Node con `serverJs` come script, anche se lanciato dal `linker64`. Una shell
     * che nomina il file, un altro script o il server della strada del ponte restano fuori.
     */
    fun serverNostri(processi: Map<Int, List<String>>, serverJs: String): List<Int> =
        processi.filter { (_, argomenti) ->
            val daLinker = argomenti.firstOrNull()?.endsWith("linker64") == true
            argomenti.getOrNull(if (daLinker) 2 else 1) == serverJs
        }.keys.sorted()

    /** Il segreto che il server scrive a ogni avvio (`server-token`), o `null` se non c'è ancora o non ha la forma. */
    fun leggiSegreto(d: Disposizione): String? =
        runCatching { d.segreto.takeIf { it.isFile }?.readText() }.getOrNull()?.let { TalosSegretoServer.valido(it) }

    // ---------------------------------------------------------------------------------------------------------------
    // La parte che ha bisogno del telefono.
    // ---------------------------------------------------------------------------------------------------------------

    class Esito(val ok: Boolean, val giaAttivo: Boolean, val motivo: String?)
    class Lettura(val segreto: String?)

    @Volatile private var processo: Process? = null

    private fun radiceDi(context: Context) = File(context.filesDir, "codice")
    private fun nodeNativo(context: Context): File? =
        File(context.applicationInfo.nativeLibraryDir, NOME_LIBRERIA_NODE).takeIf { it.isFile }

    /** In questo APK Node fra le librerie native c'è: il Codice può girare in casa. */
    fun disponibile(context: Context): Boolean = nodeNativo(context) != null

    /** Il server in casa è acceso adesso? */
    fun acceso(): Boolean = processo?.isAlive == true

    /**
     * Accende il server in casa. Torna `null` se in questo APK Node fra le librerie native non c'è (chi chiama usa il
     * ponte); altrimenti l'esito. Si può richiamare: se è già acceso lo dice e non ne accende un altro.
     */
    @Synchronized
    fun avvia(context: Context, dalChiamante: Map<String, String>): Esito? {
        val node = nodeNativo(context) ?: return null
        if (acceso()) return Esito(ok = true, giaAttivo = true, motivo = null)
        return try {
            val d = disposizione(radiceDi(context))
            fermaRimasti(d)
            if (!portaLibera()) {
                // La 4174 risponde già e non è un nostro figlio: è un server della strada del ponte, rimasto acceso.
                // È un server che funziona: lo si usa, come oggi. Sparisce al riavvio del telefono.
                Log.i(TAG, "la $PORTA è già occupata da un server non nostro: lo si lascia")
                return Esito(ok = true, giaAttivo = true, motivo = null)
            }
            prepara(context, d)
            // Le sessioni fatte con la strada del ponte, una volta sola: il server legge `sessions-store` all'avvio.
            TalosPassaggioDalPonte.portaUnaVolta(context, d)
            // ⛔ COD-NODE-04: il runtime di prima (~92 MB) non serve più a nessuno.
            TalosNodeNativo.pulisciRuntimeVecchio(File(context.filesDir, "talos-node-staging"))
            val costruttore = ProcessBuilder(node.path, d.serverJs.path)
                .directory(d.serverJs.parentFile)
                .redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.to(d.registro))
            val ambienteDelServer = costruttore.environment()
            // L'ambiente di partenza è quello dell'app: un LD_LIBRARY_PATH ereditato non deve arrivare al server.
            ambienteDelServer.remove("LD_LIBRARY_PATH")
            ambienteDelServer.putAll(ambiente(d, context.cacheDir, dalChiamante))
            processo = costruttore.start()
            Log.i(TAG, "server del Codice avviato in casa")
            Esito(ok = true, giaAttivo = false, motivo = null)
        } catch (guasto: Throwable) {
            Log.e(TAG, "avvio in casa non riuscito: ${guasto.javaClass.simpleName}")
            Esito(ok = false, giaAttivo = false, motivo = "avvio in casa non riuscito: ${guasto.javaClass.simpleName}")
        }
    }

    /** Il segreto, se il server acceso è quello in casa; `null` se non lo è (chi chiama lo chiede al ponte). */
    fun segretoSeInCasa(context: Context): Lettura? =
        if (acceso()) Lettura(leggiSegreto(disposizione(radiceDi(context)))) else null

    @Synchronized
    fun ferma() {
        processo?.let { p ->
            p.destroy()
            if (!runCatching { p.waitFor(3, java.util.concurrent.TimeUnit.SECONDS) }.getOrDefault(false)) p.destroyForcibly()
        }
        processo = null
    }

    private fun portaLibera(): Boolean = try {
        ServerSocket(PORTA, 1, InetAddress.getByName("127.0.0.1")).use { true }
    } catch (_: Throwable) {
        false
    }

    /**
     * Un server nostro rimasto da un'altra vita dell'app (il processo dell'app può morire senza portarsi via il figlio)
     * terrebbe la porta e il codice vecchio: è il difetto 6 del 24/09, sulla strada del ponte. Qui lo si cerca fra i
     * processi che QUESTA app può vedere e lo si ferma, con la stessa regola di [TalosArrestoServer].
     */
    private fun fermaRimasti(d: Disposizione) {
        val processi = HashMap<Int, List<String>>()
        File("/proc").listFiles { f -> f.isDirectory && f.name.all(Char::isDigit) }?.forEach { cartella ->
            val riga = runCatching { File(cartella, "cmdline").readText() }.getOrNull() ?: return@forEach
            if (riga.isNotEmpty()) processi[cartella.name.toInt()] = riga.split('\u0000').filter { it.isNotEmpty() }
        }
        for (pid in serverNostri(processi, d.serverJs.path)) {
            val esito = TalosArrestoServer.ferma(
                pid = pid.toString(),
                percorsoServer = d.serverJs.path,
                rigaDiComando = { p -> runCatching { File("/proc/$p/cmdline").readText() }.getOrDefault("") },
                vivo = { p -> File("/proc/$p").exists() },
                segnala = { p, segnale -> android.os.Process.sendSignal(p.toInt(), if (segnale == "-9") 9 else 15) },
                dormi = { ms -> Thread.sleep(ms) },
            )
            Log.i(TAG, "server in casa rimasto ($pid): $esito")
        }
    }

    /** Copia server e kernel dagli asset; li rifà da capo quando l'APK è cambiato. Stato e spazio di lavoro non si toccano. */
    private fun prepara(context: Context, d: Disposizione) {
        val installazione = runCatching {
            context.packageManager.getPackageInfo(context.packageName, 0).lastUpdateTime.toString()
        }.getOrNull()
        val marcatore = File(d.radice, MARCATORE)
        val uguale = installazione != null && marcatore.isFile && marcatore.readText().trim() == installazione
        if (!uguale || !d.serverJs.isFile) {
            File(d.radice, "AVM").deleteRecursively()
            File(d.radice, "AVM-harness").deleteRecursively()
            copia(context, "$ASSET_SERVER/harness-ui", d.serverJs.parentFile!!)
            copia(context, "$ASSET_SERVER/kernel", d.kernel)
            copia(context, "$ASSET_SERVER/mobile-public", d.pubblica)
            if (installazione != null) marcatore.writeText(installazione)
        }
        (d.campagne + d.stato + d.lavoro).forEach { it.mkdirs() }
        collegaNode(context, d)
    }

    /**
     * ⛔ COD-NODE-01 (14/10/2026; ledger `LEDGER-CODICE-SENZA-PONTE-2026-10-13.md` §18): `node` per la shell dell'agente.
     * Android non esegue file dalla cartella dati dell'app, ma un collegamento simbolico verso la libreria nativa sì
     * (misurato: `node -v` = v24.18.0). Si rifà a ogni accensione: la cartella dell'APK cambia a ogni aggiornamento.
     */
    private fun collegaNode(context: Context, d: Disposizione) {
        val node = nodeNativo(context) ?: return
        runCatching {
            d.attrezzi.mkdirs()
            val collegamento = File(d.attrezzi, "node")
            collegamento.delete()
            Os.symlink(node.path, collegamento.path)
        }.onFailure { Log.w(TAG, "collegamento a node non riuscito: ${it.javaClass.simpleName}") }
    }

    private fun copia(context: Context, asset: String, dest: File) {
        val figli = context.assets.list(asset) ?: emptyArray()
        if (figli.isEmpty()) {
            dest.parentFile?.mkdirs()
            context.assets.open(asset).use { ingresso -> dest.outputStream().use { ingresso.copyTo(it) } }
        } else {
            dest.mkdirs()
            for (f in figli) copia(context, "$asset/$f", File(dest, f))
        }
    }
}
