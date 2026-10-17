package ai.talos.agent

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * SONDA, solo nella build di prova (source set `debug`): mai nell'APK di rilascio.
 *
 * Owner 13/10/2026: «come proponi di risolvere al meglio senza usare il ponte ADB? … importare per intero la CLI
 * nell'applicazione» → «parti con la prima misura». MISURATO lo stesso giorno: senza ponte il server del Codice non parte.
 * Il 28/08 Node dentro il processo dell'app era stato scartato su una RICERCA (dominio SELinux `untrusted_app`, seccomp),
 * non su una misura fatta qui (`TalosTerminalPlugin.kt`, commento di classe). Questa sonda fa la misura: avvia il Node che è
 * già nell'APK come figlio del processo dell'app, e riferisce che cosa regge e che cosa no.
 *
 * Non decide niente e non cambia niente: legge i file che `TalosTerminalPlugin` ha già copiato in `files/talos-node-staging`.
 */
@CapacitorPlugin(name = "TalosSondaNode")
class TalosSondaNodePlugin : Plugin() {
    private val lavoro = Executors.newSingleThreadExecutor { r -> Thread(r, "talos-sonda-node").apply { isDaemon = true } }

    @PluginMethod
    fun prova(call: PluginCall) {
        val copione = call.getString("copione") ?: ""
        val attesa = (call.getInt("attesaSecondi") ?: 25).coerceIn(5, 120)
        lavoro.execute {
            val esito = JSObject()
            try {
                // K2-A (14/10/2026): Node e le sue librerie stanno fra le native, con RUNPATH=$ORIGIN.
                val cartella = File(context.applicationInfo.nativeLibraryDir)
                val binario = File(cartella, ai.talos.terminal.TalosNodeNativo.BINARIO)
                esito.put("binarioPresente", binario.isFile)
                esito.put("cartellaNativa", context.applicationInfo.nativeLibraryDir)
                if (!binario.isFile) { call.resolve(esito); return@execute }
                esito.put("resoEseguibile", binario.canExecute())
                val casa = File(context.filesDir, "sonda-node-casa").apply { mkdirs() }
                val script = File(context.cacheDir, "sonda-node.js").apply { writeText(copione) }
                val prove = JSArray()
                val elenco = mutableListOf(
                    "diretto --version" to listOf(binario.absolutePath, "--version"),
                    "linker64 --version" to listOf("/system/bin/linker64", binario.absolutePath, "--version"),
                )
                if (copione.isNotBlank()) {
                    elenco += "diretto copione" to listOf(binario.absolutePath, script.absolutePath)
                    elenco += "linker64 copione" to listOf("/system/bin/linker64", binario.absolutePath, script.absolutePath)
                }
                for ((nome, comando) in elenco) prove.put(esegui(nome, comando, cartella, casa, attesa))
                esito.put("prove", prove)
            } catch (guasto: Throwable) {
                esito.put("guasto", "${guasto.javaClass.simpleName}: ${guasto.message}".take(300))
            }
            call.resolve(esito)
        }
    }

    /**
     * Seconda misura: il VERO server del Codice (quello negli asset dell'APK), avviato dentro il processo dell'app, senza
     * ponte. Stessa disposizione di cartelle e stesso ambiente di `TalosTerminalPlugin.avviaServerHarness`, ma sotto la
     * cartella privata dell'app invece che in `/data/local/tmp/talos`. Resta vivo `secondi`, poi viene fermato.
     */
    @PluginMethod
    fun server(call: PluginCall) {
        val porta = call.getInt("porta") ?: 4175
        val secondi = (call.getInt("secondi") ?: 20).coerceIn(5, 600)
        lavoro.execute {
            val esito = JSObject()
            try {
                val nodo = File(context.applicationInfo.nativeLibraryDir)
                // ⛔ Percorso VERO (canonico): `server.mjs` parte solo se `process.argv[1]` coincide con `import.meta.url`, e
                // `/data/user/0` è un collegamento a `/data/data` — col percorso non canonico usciva in silenzio (misurato).
                val radice = File(context.filesDir, "sonda-talos").canonicalFile
                val copiati = intArrayOf(0)
                copia("talos-harness-ui/harness-ui", File(radice, "AVM/harness-ui"), copiati)
                copia("talos-harness-ui/kernel", File(radice, "AVM-harness/mobile/scripts/harness-talos"), copiati)
                copia("talos-harness-ui/mobile-public", File(radice, "AVM/mobile/public/harness-ui"), copiati)
                esito.put("fileCopiati", copiati[0])
                val lavoro = File(radice, "workspace").apply { mkdirs() }
                val stato = File(radice, "state").apply { mkdirs() }
                val costruttore = ProcessBuilder(
                    "/system/bin/linker64", File(nodo, ai.talos.terminal.TalosNodeNativo.BINARIO).absolutePath,
                    File(radice, "AVM/harness-ui/server.mjs").absolutePath,
                ).directory(File(radice, "AVM/harness-ui"))
                costruttore.environment().apply {
                    put("HOME", radice.absolutePath)
                    put("TMPDIR", context.cacheDir.absolutePath)
                    put("TALOS_KERNEL_SUL_TELEFONO", "1")
                    put("TALOS_BANCO_DIR", File(radice, "banco-locale").apply { mkdirs() }.absolutePath)
                    put("TALOS_HARNESS_UI_PUBLIC_DIR", File(radice, "AVM/mobile/public/harness-ui").absolutePath)
                    put("TALOS_HARNESS_UI_PORT", porta.toString())
                    put("TALOS_HARNESS_UI_STATE_DIR", stato.absolutePath)
                    put("TALOS_HARNESS_UI_PROJECT_DIRS", lavoro.absolutePath)
                    call.getObject("ambiente")?.let { extra -> extra.keys().forEach { k -> extra.getString(k)?.let { put(k, it) } } }
                }
                val prima = System.currentTimeMillis()
                val processo = costruttore.start()
                val uscita = StringBuilder(); val errore = StringBuilder()
                Thread { runCatching { processo.inputStream.bufferedReader().forEachLine { synchronized(uscita) { uscita.appendLine(it) } } } }.start()
                Thread { runCatching { processo.errorStream.bufferedReader().forEachLine { synchronized(errore) { errore.appendLine(it) } } } }.start()
                val richieste = JSArray()
                var prontoDopo = -1L
                val percorsi = call.getArray("percorsi")?.toList<String>() ?: listOf("/")
                val fine = prima + secondi * 1000L
                while (System.currentTimeMillis() < fine && processo.isAlive) {
                    Thread.sleep(500)
                    if (prontoDopo < 0 && chiedi(porta, "/").first > 0) {
                        prontoDopo = System.currentTimeMillis() - prima
                        for (percorso in percorsi) {
                            val (codice, corpo) = chiedi(porta, percorso)
                            richieste.put(JSObject().apply { put("percorso", percorso); put("stato", codice); put("corpo", corpo.take(300)) })
                        }
                        if (call.getBoolean("tieniVivo", false) != true) break
                    }
                }
                esito.put("vivoAllaFine", processo.isAlive)
                if (!processo.isAlive) esito.put("codiceUscita", processo.exitValue())
                esito.put("prontoDopoMs", prontoDopo)
                esito.put("richieste", richieste)
                processo.destroy()
                if (!processo.waitFor(4, TimeUnit.SECONDS)) processo.destroyForcibly()
                esito.put("uscita", synchronized(uscita) { uscita.toString().take(3000) })
                esito.put("errore", synchronized(errore) { errore.toString().lineSequence().filterNot { it.contains("linker_hwasan") }.joinToString(" | ").take(3000) })
            } catch (guasto: Throwable) {
                esito.put("guasto", "${guasto.javaClass.simpleName}: ${guasto.message}".take(400))
            }
            call.resolve(esito)
        }
    }

    private fun chiedi(porta: Int, percorso: String): Pair<Int, String> = try {
        val c = java.net.URL("http://127.0.0.1:$porta$percorso").openConnection() as java.net.HttpURLConnection
        c.connectTimeout = 800; c.readTimeout = 3000
        val codice = c.responseCode
        val corpo = runCatching { (if (codice in 200..399) c.inputStream else c.errorStream)?.bufferedReader()?.readText() ?: "" }.getOrDefault("")
        c.disconnect()
        codice to corpo
    } catch (guasto: Throwable) { -1 to (guasto.javaClass.simpleName) }

    private fun copia(asset: String, dest: File, contati: IntArray) {
        val figli = context.assets.list(asset) ?: emptyArray()
        if (figli.isEmpty()) {
            dest.parentFile?.mkdirs()
            context.assets.open(asset).use { ingresso -> dest.outputStream().use { ingresso.copyTo(it) } }
            contati[0] += 1
        } else {
            dest.mkdirs()
            for (f in figli) copia("$asset/$f", File(dest, f), contati)
        }
    }

    private fun esegui(nome: String, comando: List<String>, cartella: File, casa: File, attesa: Int): JSObject {
        val r = JSObject().apply { put("nome", nome) }
        val prima = System.currentTimeMillis()
        try {
            val costruttore = ProcessBuilder(comando).redirectErrorStream(false).directory(casa)
            costruttore.environment().apply {
                put("HOME", casa.absolutePath)
                put("TMPDIR", context.cacheDir.absolutePath)
                put("SONDA_LINKER", if (comando.first().endsWith("linker64")) "1" else "0")
                put("SONDA_BINARIO", File(cartella, ai.talos.terminal.TalosNodeNativo.BINARIO).absolutePath)
            }
            val processo = costruttore.start()
            val uscita = StringBuilder()
            val errore = StringBuilder()
            val t1 = Thread { runCatching { uscita.append(processo.inputStream.bufferedReader().readText()) } }.apply { start() }
            val t2 = Thread { runCatching { errore.append(processo.errorStream.bufferedReader().readText()) } }.apply { start() }
            val finito = processo.waitFor(attesa.toLong(), TimeUnit.SECONDS)
            if (!finito) processo.destroyForcibly()
            t1.join(2000); t2.join(2000)
            r.put("finito", finito)
            if (finito) r.put("codice", processo.exitValue())
            r.put("uscita", uscita.toString().take(6000))
            r.put("errore", errore.toString().take(1500))
        } catch (guasto: Throwable) {
            r.put("nonPartito", "${guasto.javaClass.simpleName}: ${guasto.message}".take(300))
        }
        r.put("ms", System.currentTimeMillis() - prima)
        return r
    }
}
