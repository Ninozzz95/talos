package ai.talos

import ai.talos.aggiornamenti.TalosRinvioAggiornamento
import ai.talos.aggiornamenti.TalosRinvioRifiutato
import android.content.Context
import android.net.Network
import android.os.SystemClock
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection

/**
 * Lo scaricamento dell'APK di un aggiornamento: 193 MB (v0.1.43), quindi deve riprendere da dove si è fermato. Non si scrive un
 * secondo scaricatore: si riusa `TalosTransferRunner` dei modelli (ripresa dal punto esatto, indirizzi firmati che scadono, politica
 * di stallo) con uno `Slot` nella cartella `files/aggiornamenti/`. Sta in `ai.talos` perché `Slot` è visibile solo al pacchetto.
 *
 * L'impronta qui NON si controlla (il runner conosce solo SHA-256, il manifesto dà SHA-512): si controlla mentre i byte entrano
 * nella sessione d'installazione, sugli stessi byte che Android installerà (`TalosInstallatoreAggiornamento`).
 */
object TalosScaricamentoAggiornamento {

    fun cartella(context: Context): File = File(context.filesDir, "aggiornamenti")

    fun apk(context: Context, path: String): File = File(cartella(context), path)

    /** Toglie ogni file che non sia dell'APK di `path` (versioni vecchie, pezzi lasciati a metà). `path` null: tutto. */
    fun ripulisci(context: Context, path: String?) {
        val tieni = path?.let { setOf(it, it + TalosModelStore.PARTIAL_SUFFIX, it + TalosModelStore.SIDECAR_SUFFIX) } ?: emptySet()
        cartella(context).listFiles()?.forEach { if (it.name !in tieni) it.delete() }
    }

    /**
     * Bloccante. Torna null se l'APK è intero, altrimenti il motivo del runner ("stopped", "io", "no-space"…) o del rinvio
     * rifiutato ("rinvio-senza-indirizzo", "rinvio-non-sicuro", "troppi-rinvii": definitivi).
     */
    fun scarica(
        context: Context,
        path: String,
        size: Long,
        indirizzo: String,
        rete: Network?,
        fermati: () -> Boolean,
        avanzamento: (Long, Long) -> Unit,
    ): String? {
        ripulisci(context, path)
        val slot = TalosModelStore.Slot(apk(context, path))
        if (slot.finished.isFile && slot.finished.length() == size) return null
        try {
            slot.prepare(size, TalosStorageReservation(context))
        } catch (pieno: IOException) {
            return "no-space"
        }
        var motivo: String? = "stopped"
        var rifiuto: String? = null
        TalosTransferRunner(slot, size, null, rete, object : TalosTransferRunner.Host {
            // ⛔ D-UPD-1: GitHub dà l'APK solo dopo un 302 verso un host firmato, e il runner i rinvii non li segue. Si risolve
            // qui, a ogni RESOLVE del runner (anche quando la firma scade). Un rinvio rifiutato è definitivo: si ferma il runner.
            override fun resolve(): TalosTransferRunner.Resolved = try {
                TalosRinvioAggiornamento.risolvi(indirizzo, { url -> (rete?.openConnection(url) ?: url.openConnection()) as HttpURLConnection },
                    SystemClock::elapsedRealtime)
            } catch (rifiutato: TalosRinvioRifiutato) {
                rifiuto = rifiutato.motivo
                throw IOException(rifiutato.motivo)
            }
            override fun onProgress(haveBytes: Long, totalBytes: Long) = avanzamento(haveBytes, totalBytes)
            override fun onFinished(reason: String?) { motivo = reason }
            override fun stopRequested() = fermati() || rifiuto != null
        }).run()
        return rifiuto ?: motivo
    }
}
