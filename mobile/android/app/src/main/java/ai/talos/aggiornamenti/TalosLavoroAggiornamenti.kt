package ai.talos.aggiornamenti

import ai.talos.BuildConfig
import ai.talos.TalosModelTransferService
import ai.talos.TalosRunService
import ai.talos.TalosScaricamentoAggiornamento
import android.app.ActivityManager
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * I tre lavori dell'aggiornamento, con JobScheduler: il progetto ha un solo scheduler (`TalosTaskRunPlugin`, «Perché JobScheduler e
 * non WorkManager»). Id 8100-8102, fuori da quelli già usati (4712, 4900-5899, 6000+, 7000+, 100 000-899 999).
 *
 * - CONTROLLO: una volta al giorno (owner 22/10, 2), qualunque rete; solo con «Aggiornamenti automatici» acceso.
 * - SCARICA: l'APK, ripristinabile; con «Solo con Wi-Fi» una rete non a consumo, sempre a batteria non bassa (F-Droid
 *   `AppUpdateWorker.kt:56-74`). Fermato da Android, riprende dal punto esatto.
 * - INSTALLA: «Al prossimo avvio» (owner 22/10, 3) — quando TALOS è in sottofondo e niente lavora; altrimenti riprova più tardi.
 */
class TalosLavoroAggiornamenti : JobService() {

    private val fermati = ConcurrentHashMap<Int, AtomicBoolean>()

    override fun onStartJob(params: JobParameters): Boolean {
        val stop = AtomicBoolean(false)
        fermati[params.jobId] = stop
        Thread({
            val rifai = try {
                when (params.jobId) {
                    CONTROLLO -> { controllaEApplica(applicationContext, dallaPersona = false); false }
                    SCARICA -> scarica(applicationContext, params, stop)
                    INSTALLA -> installaAllUscita(applicationContext)
                    else -> false
                }
            } catch (guasto: Exception) {
                true
            } finally {
                fermati.remove(params.jobId)
            }
            if (!stop.get()) jobFinished(params, rifai)
        }, "talos-aggiornamenti-${params.jobId}").start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        fermati[params.jobId]?.set(true)
        // riprende: lo scaricamento dal punto esatto, il controllo e l'installazione al prossimo giro
        return true
    }

    private fun scarica(context: Context, params: JobParameters, stop: AtomicBoolean): Boolean {
        val trovata = TalosStatoAggiornamento.trovata(context) ?: return false
        if (TalosStatoAggiornamento.fase(context) != TalosFaseAggiornamento.IN_SCARICAMENTO) return false
        val size = trovata.size ?: run {
            TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.FALLITA, "dimensione"); return false
        }
        val fonte = TalosControlloAggiornamenti.fonte(context) ?: return false
        val motivo = TalosScaricamentoAggiornamento.scarica(context, trovata.path, size, fonte.file(trovata.tag, trovata.path),
            params.network, { stop.get() }, { _, _ -> })
        return when (motivo) {
            null -> {
                TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.PRONTA)
                if (TalosStatoAggiornamento.scelte(context).avvisami && !inPrimoPiano(context)) TalosNotificaAggiornamento.pronta(context)
                false
            }
            "no-space" -> { TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.FALLITA, "spazio"); false }
            else -> true
        }
    }

    companion object {
        const val CONTROLLO = 8100
        const val SCARICA = 8101
        const val INSTALLA = 8102
        private const val UN_GIORNO_MS = 24L * 60 * 60 * 1000
        private const val MARGINE_MS = 6L * 60 * 60 * 1000
        private const val ATTESA_USCITA_MS = 60_000L
        private const val RIPROVA_USCITA_MS = 5L * 60 * 1000

        private fun scheduler(context: Context) = context.getSystemService(JobScheduler::class.java)
        private fun componente(context: Context) = ComponentName(context, TalosLavoroAggiornamenti::class.java)

        /** All'avvio dell'app e dopo ogni cambio delle scelte: il controllo giornaliero c'è solo con gli aggiornamenti automatici. */
        fun programmaControllo(context: Context) {
            val js = scheduler(context) ?: return
            if (!TalosStatoAggiornamento.scelte(context).automatici) { js.cancel(CONTROLLO); js.cancel(SCARICA); return }
            if (js.getPendingJob(CONTROLLO) != null) return
            js.schedule(JobInfo.Builder(CONTROLLO, componente(context))
                .setPeriodic(UN_GIORNO_MS, MARGINE_MS)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build())
        }

        fun programmaScaricamento(context: Context, dallaPersona: Boolean) {
            val js = scheduler(context) ?: return
            val trovata = TalosStatoAggiornamento.trovata(context) ?: return
            val soloWifi = TalosStatoAggiornamento.scelte(context).soloWifi && !dallaPersona
            js.schedule(JobInfo.Builder(SCARICA, componente(context))
                .setRequiredNetworkType(if (soloWifi) JobInfo.NETWORK_TYPE_UNMETERED else JobInfo.NETWORK_TYPE_ANY)
                .setRequiresBatteryNotLow(!dallaPersona)
                .setEstimatedNetworkBytes(trovata.size ?: JobInfo.NETWORK_BYTES_UNKNOWN.toLong(), 0)
                .setPersisted(true)
                .build())
        }

        fun programmaInstallazioneAllUscita(context: Context, attesaMs: Long = ATTESA_USCITA_MS) {
            val js = scheduler(context) ?: return
            js.schedule(JobInfo.Builder(INSTALLA, componente(context)).setMinimumLatency(attesaMs).build())
        }

        /** Il controllo e ciò che ne segue. Bloccante. */
        fun controllaEApplica(context: Context, dallaPersona: Boolean): TalosEsitoControllo {
            val esito = TalosControlloAggiornamenti.controlla(context)
            val fase = TalosStatoAggiornamento.fase(context)
            when (esito) {
                is TalosEsitoControllo.Trovata -> {
                    val gia = TalosStatoAggiornamento.trovata(context)
                    val stessa = gia?.versione == esito.trovata.versione && gia.sha512 == esito.trovata.sha512
                    val intera = stessa && TalosScaricamentoAggiornamento.apk(context, esito.trovata.path).isFile
                    if (stessa && fase == TalosFaseAggiornamento.PRONTA && intera) return esito
                    TalosStatoAggiornamento.segnaTrovata(context, esito.trovata, TalosFaseAggiornamento.IN_SCARICAMENTO)
                    if (dallaPersona || TalosStatoAggiornamento.scelte(context).automatici) programmaScaricamento(context, dallaPersona)
                }
                is TalosEsitoControllo.Rifiutato -> {
                    TalosStatoAggiornamento.segnaRifiutato(context, esito.impronta)
                    TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.FALLITA, esito.motivo)
                }
                TalosEsitoControllo.Aggiornata -> {
                    val trovata = TalosStatoAggiornamento.trovata(context)
                    // installata per altra via (a mano, da un altro dispositivo): la versione trovata non serve più
                    if (trovata == null || !TalosVersioneAggiornamento.piuNuova(trovata.versione, BuildConfig.VERSION_NAME)) {
                        if (fase != TalosFaseAggiornamento.AGGIORNATA) TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.NESSUNA)
                        TalosScaricamentoAggiornamento.ripulisci(context, null)
                    }
                }
                TalosEsitoControllo.GiaRifiutato, is TalosEsitoControllo.Irraggiungibile -> Unit
            }
            return esito
        }

        /** Torna `true` per riprovare più tardi. */
        private fun installaAllUscita(context: Context): Boolean {
            if (!TalosStatoAggiornamento.installaAllUscita(context)) return false
            if (TalosStatoAggiornamento.fase(context) != TalosFaseAggiornamento.PRONTA) return false
            if (!aRiposo(context)) { programmaInstallazioneAllUscita(context, RIPROVA_USCITA_MS); return false }
            TalosInstallatoreAggiornamento.installa(context, dallaPersona = false)
            return false
        }

        fun inPrimoPiano(context: Context): Boolean {
            val info = ActivityManager.RunningAppProcessInfo()
            ActivityManager.getMyMemoryState(info)
            return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
        }

        /** TALOS non è in primo piano e niente lavora (un giro lungo, uno scaricamento di modelli): solo allora si installa. */
        fun aRiposo(context: Context): Boolean {
            if (inPrimoPiano(context)) return false
            val am = context.getSystemService(ActivityManager::class.java) ?: return false
            val occupati = setOf(TalosRunService::class.java.name, TalosModelTransferService::class.java.name)
            @Suppress("DEPRECATION")
            return am.getRunningServices(Int.MAX_VALUE).none { it.service.className in occupati && it.started }
        }
    }
}
