package ai.talos.aggiornamenti

import ai.talos.BuildConfig
import ai.talos.TalosScaricamentoAggiornamento
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * `ACTION_MY_PACKAGE_REPLACED`: arriva alla sola app aggiornata, già col codice NUOVO. È qui che l'aggiornamento è davvero fatto
 * (F-Droid `SelfUpdateReceiver.kt:42-64`): stato «aggiornata», APK cancellato, e dopo «Riavvia ora» si prova a riaprire TALOS.
 * Da Android 10 un'app in sottofondo non può aprire un'Activity: la prova può non riuscire, quindi c'è sempre anche la notifica.
 *
 * ⛔ Visto sul Pad il 22/10/2026: il segnale arriva per OGNI sostituzione del pacchetto, anche un APK installato a mano. Si
 * annuncia («Aggiornata», notifica, riapertura) solo ciò che ha installato TALOS; il resto si ripulisce in silenzio.
 */
class TalosRicevitorePacchettoSostituito : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val nostra = daAnnunciare(TalosStatoAggiornamento.fase(context))
        val riapri = TalosStatoAggiornamento.riapri(context)
        TalosStatoAggiornamento.ripulisciDopoInstallazione(context, if (nostra) BuildConfig.VERSION_NAME else null)
        TalosScaricamentoAggiornamento.ripulisci(context, null)
        TalosLavoroAggiornamenti.programmaControllo(context)
        if (!nostra) return
        if (riapri) {
            context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ?.let { runCatching { context.startActivity(it) } }
        }
        TalosNotificaAggiornamento.fatta(context, BuildConfig.VERSION_NAME)
    }

    companion object {
        /** La sessione d'installazione l'aveva aperta TALOS (`TalosInstallatoreAggiornamento.installa`). */
        fun daAnnunciare(faseDiPrima: TalosFaseAggiornamento): Boolean = faseDiPrima == TalosFaseAggiornamento.IN_INSTALLAZIONE
    }
}
