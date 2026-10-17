package ai.talos.terminal

import ai.talos.agent.TalosPonteAdb
import android.content.Context
import android.util.Log
import java.io.File
import java.util.Base64
import java.util.concurrent.atomic.AtomicBoolean

/**
 * ⛔ Le sessioni del Codice dall'area del ponte all'app (owner 14/10/2026; ledger `LEDGER-SESSIONI-DAL-PONTE-2026-10-14.md`).
 *
 * Prima del «Codice in casa» il server girava come utente `shell` e salvava in `/data/local/tmp/talos`. Owner: «Sessioni +
 * cartella di lavoro», «Da solo, una volta». Si copiano le sessioni (riscrivendo SOLO il campo `"cartella"`, come chi
 * sposta un progetto in Claude Code riscrive `cwd`), le pagine degli artefatti, le automazioni e la cartella di lavoro.
 * Mai sovrascrivere un file che c'è già in casa; l'area del ponte non si scrive e non si cancella.
 *
 * MISURATO sul Pad: l'app (`untrusted_app`) legge da sola i file `rw-rw-rw-` del ponte, non quelli `rw-------` (gli
 * artefatti). Quindi due lettori: quello diretto prima di accendere il server (veloce, niente rete), quello del ponte solo
 * per ciò che resta, su un filo a parte (`adb devices` può costare secondi e il server non deve aspettarlo).
 */
object TalosPassaggioDalPonte {
    private const val TAG = "TalosPassaggioDalPonte"
    const val SORGENTE = "/data/local/tmp/talos"
    const val NOME_SEGNO = ".passaggio-dal-ponte"

    data class Voce(val nome: String, val cartella: Boolean)

    interface Lettore {
        /** Il contenuto di una cartella, o `null` se non si vede (non c'è, o non si può leggere). */
        fun elenca(percorso: String): List<Voce>?

        /** I byte di un file, o `null` se non si può leggere. */
        fun leggi(percorso: String): ByteArray?
    }

    class LettoreDiretto : Lettore {
        override fun elenca(percorso: String): List<Voce>? =
            runCatching { File(percorso).listFiles()?.map { Voce(it.name, it.isDirectory) } }.getOrNull()

        override fun leggi(percorso: String): ByteArray? =
            runCatching { File(percorso).takeIf { it.isFile }?.readBytes() }.getOrNull()
    }

    /** Attraverso il ponte ADB, cioè come utente `shell`: legge anche i file `rw-------` dell'area. */
    class LettorePonte(private val context: Context) : Lettore {
        private fun tra(apici: String) = "'" + apici.replace("'", "'\\''") + "'"

        override fun elenca(percorso: String): List<Voce>? {
            val esito = TalosPonteAdb.esegui(context, listOf("shell", "ls -1p ${tra(percorso)}"))
            if (!esito.ok) return null
            return esito.uscita.lines().map { it.trimEnd('\r') }.filter { it.isNotEmpty() }
                .map { if (it.endsWith("/")) Voce(it.dropLast(1), true) else Voce(it, false) }
        }

        override fun leggi(percorso: String): ByteArray? {
            val esito = TalosPonteAdb.esegui(context, listOf("shell", "base64 -w 0 ${tra(percorso)}"))
            if (!esito.ok) return null
            return runCatching { Base64.getMimeDecoder().decode(esito.uscita.trim()) }.getOrNull()
        }
    }

    /** Il secondo lettore solo dove il primo non arriva. */
    class LettoreInCatena(private val primo: Lettore, private val secondo: Lettore) : Lettore {
        override fun elenca(percorso: String) = primo.elenca(percorso) ?: secondo.elenca(percorso)
        override fun leggi(percorso: String) = primo.leggi(percorso) ?: secondo.leggi(percorso)
    }

    data class Esito(val copiati: Int, val saltati: Int, val mancati: Int)

    /**
     * Solo il valore del campo `"cartella"` che è [vecchia] o sta sotto. La storia (un percorso dentro un testo) non si
     * tocca, e il resto della riga resta byte per byte.
     */
    fun riscriviCartella(riga: String, vecchia: String, nuova: String): String =
        Regex("\"cartella\":\"" + Regex.escape(vecchia) + "(?=[\"/])")
            .replace(riga, Regex.escapeReplacement("\"cartella\":\"$nuova"))

    fun porta(lettore: Lettore, sorgente: String, d: TalosCodiceInCasa.Disposizione, vecchia: String): Esito {
        var copiati = 0
        var saltati = 0
        var mancati = 0

        fun copia(da: String, a: File, sessioni: Boolean) {
            val voci = lettore.elenca(da) ?: return
            for (voce in voci) {
                val origine = "$da/${voce.nome}"
                val destino = File(a, voce.nome)
                if (voce.cartella) {
                    copia(origine, destino, sessioni)
                    continue
                }
                if (destino.exists()) {
                    saltati += 1
                    continue
                }
                val byte = lettore.leggi(origine)
                if (byte == null) {
                    mancati += 1
                    continue
                }
                val contenuto = if (sessioni && voce.nome.endsWith(".jsonl")) {
                    riscriviCartella(String(byte, Charsets.UTF_8), vecchia, d.lavoro.path).toByteArray(Charsets.UTF_8)
                } else {
                    byte
                }
                a.mkdirs()
                val provvisorio = File(a, ".${voce.nome}.parziale")
                provvisorio.writeBytes(contenuto)
                if (provvisorio.renameTo(destino)) copiati += 1 else { provvisorio.delete(); mancati += 1 }
            }
        }

        copia("$sorgente/state/sessions-store", File(d.stato, "sessions-store"), sessioni = true)
        copia("$sorgente/state/artifacts", File(d.stato, "artifacts"), sessioni = false)
        copia("$sorgente/state/automations", File(d.stato, "automations"), sessioni = false)
        copia("$sorgente/workspace", d.lavoro, sessioni = false)
        return Esito(copiati, saltati, mancati)
    }

    private val inCorso = AtomicBoolean(false)

    /**
     * Una volta sola, prima di accendere il server (che legge `sessions-store` all'avvio). Mai un'eccezione verso chi chiama:
     * senza il passaggio il Codice in casa funziona come prima.
     */
    fun portaUnaVolta(context: Context, d: TalosCodiceInCasa.Disposizione) {
        val segno = File(d.stato, NOME_SEGNO)
        if (segno.exists() || !inCorso.compareAndSet(false, true)) return
        val vecchia = "$SORGENTE/workspace"
        try {
            val diretto = LettoreDiretto()
            if (diretto.elenca(SORGENTE) != null) {
                val esito = porta(diretto, SORGENTE, d, vecchia)
                Log.i(TAG, "lettura diretta: ${esito.copiati} copiati, ${esito.saltati} già in casa, ${esito.mancati} da leggere col ponte")
                if (esito.mancati == 0) {
                    segna(segno, esito)
                    inCorso.set(false)
                    return
                }
            }
        } catch (guasto: Throwable) {
            Log.w(TAG, "lettura diretta non riuscita: ${guasto.javaClass.simpleName}")
        }
        // Ciò che resta (o tutto, se l'area non si vede), col ponte e senza far aspettare il server.
        val app = context.applicationContext
        Thread({
            try {
                if (TalosPonteAdb.disponibile(app) && TalosPonteAdb.collegato(app)) {
                    val esito = porta(LettoreInCatena(LettoreDiretto(), LettorePonte(app)), SORGENTE, d, vecchia)
                    Log.i(TAG, "col ponte: ${esito.copiati} copiati, ${esito.saltati} già in casa, ${esito.mancati} mancati")
                    if (esito.mancati == 0) segna(segno, esito)
                } else {
                    Log.i(TAG, "ponte non collegato: il passaggio si riprova alla prossima accensione")
                }
            } catch (guasto: Throwable) {
                Log.w(TAG, "passaggio col ponte non riuscito: ${guasto.javaClass.simpleName}")
            } finally {
                inCorso.set(false)
            }
        }, "talos-passaggio-dal-ponte").apply { isDaemon = true }.start()
    }

    private fun segna(segno: File, esito: Esito) {
        segno.parentFile?.mkdirs()
        segno.writeText(
            """{"copiati":${esito.copiati},"saltati":${esito.saltati},"fatto":"${java.time.Instant.now()}"}""" + "\n",
        )
    }
}
