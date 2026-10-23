package ai.talos

import android.content.Context
import android.net.Network
import java.io.File
import java.io.IOException

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

    /** Bloccante. Torna null se l'APK è intero, altrimenti il motivo del runner ("stopped", "io", "no-space"…). */
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
        TalosTransferRunner(slot, size, null, rete, object : TalosTransferRunner.Host {
            override fun resolve() = TalosTransferRunner.Resolved(indirizzo, Long.MIN_VALUE)
            override fun onProgress(haveBytes: Long, totalBytes: Long) = avanzamento(haveBytes, totalBytes)
            override fun onFinished(reason: String?) { motivo = reason }
            override fun stopRequested() = fermati()
        }).run()
        return motivo
    }
}
