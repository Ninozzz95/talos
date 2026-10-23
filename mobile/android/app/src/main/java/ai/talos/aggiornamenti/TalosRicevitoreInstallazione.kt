package ai.talos.aggiornamenti

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/**
 * L'esito della sessione d'installazione (Signal `ApkUpdatePackageInstallerReceiver.kt:30-83`). Su un aggiornamento di sé stessi
 * `STATUS_SUCCESS` spesso non arriva: il processo muore prima. Il successo vero lo dice `TalosRicevitorePacchettoSostituito`.
 */
class TalosRicevitoreInstallazione : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val stato = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val dallaPersona = intent.getBooleanExtra(TalosInstallatoreAggiornamento.EXTRA_DALLA_PERSONA, false)
        when (stato) {
            PackageInstaller.STATUS_SUCCESS -> Unit
            PackageInstaller.STATUS_PENDING_USER_ACTION -> chiediAllaPersona(context, intent, dallaPersona)
            else -> {
                // la versione resta PRONTA: un rifiuto passeggero (spazio, tempo) si riprova; il motivo si dice
                TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.PRONTA, motivoDi(stato))
                TalosStatoAggiornamento.segnaRiapri(context, false)
            }
        }
    }

    private fun chiediAllaPersona(context: Context, intent: Intent, dallaPersona: Boolean) {
        val conferma = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
        TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.PRONTA, "conferma")
        if (dallaPersona && conferma != null) {
            // la persona ha appena toccato «Riavvia ora»: TALOS è in primo piano e può aprire la conferma di sistema
            runCatching { context.startActivity(conferma.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                .onFailure { TalosNotificaAggiornamento.pronta(context) }
        } else {
            // in sottofondo non si apre niente sopra un'altra app (Signal :63-66): una notifica, e il cassetto alla riapertura
            TalosNotificaAggiornamento.pronta(context)
        }
    }

    private fun motivoDi(stato: Int): String = when (stato) {
        PackageInstaller.STATUS_FAILURE_ABORTED -> "annullata"
        PackageInstaller.STATUS_FAILURE_BLOCKED -> "bloccata"
        PackageInstaller.STATUS_FAILURE_CONFLICT -> "conflitto"
        PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "incompatibile"
        PackageInstaller.STATUS_FAILURE_INVALID -> "non-valida"
        PackageInstaller.STATUS_FAILURE_STORAGE -> "spazio"
        PackageInstaller.STATUS_FAILURE_TIMEOUT -> "tempo"
        else -> "installazione"
    }
}
