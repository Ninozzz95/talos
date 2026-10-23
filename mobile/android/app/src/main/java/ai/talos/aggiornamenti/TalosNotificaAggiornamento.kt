package ai.talos.aggiornamenti

import ai.talos.MainActivity
import ai.talos.R
import ai.talos.TalosNotificationIds
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

/**
 * Le due notifiche dell'aggiornamento: «pronta» (solo con «Avvisami quando è pronta», o quando Android chiede una conferma che in
 * sottofondo non si può aprire) e «aggiornata» (dopo l'installazione, perché la riapertura da sola non è garantita da Android 10).
 * Nomi e testi in `R.string`, nelle due lingue (N0, D-N0-6; `TalosCanaliLinguaTest`).
 */
object TalosNotificaAggiornamento {

    const val CANALE = "talos_aggiornamenti"

    fun rinominaCanale(context: Context) = canale(context, rinomina = true)

    private fun canale(context: Context, rinomina: Boolean) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (!rinomina && manager.getNotificationChannel(CANALE) != null) return
        if (rinomina && manager.getNotificationChannel(CANALE) == null) return
        val c = NotificationChannel(CANALE, context.getString(R.string.talos_canale_aggiornamenti_nome), NotificationManager.IMPORTANCE_DEFAULT)
        c.description = context.getString(R.string.talos_canale_aggiornamenti_descrizione)
        manager.createNotificationChannel(c)
    }

    fun pronta(context: Context) {
        val versione = TalosStatoAggiornamento.trovata(context)?.versione ?: return
        pubblica(context, context.getString(R.string.talos_aggiornamento_pronta_titolo, versione),
            context.getString(R.string.talos_aggiornamento_pronta_testo))
    }

    fun fatta(context: Context, versione: String) {
        pubblica(context, context.getString(R.string.talos_aggiornamento_fatta_titolo, versione),
            context.getString(R.string.talos_aggiornamento_fatta_testo))
    }

    /** Alla riapertura di TALOS la notifica non serve più: il cassetto dice la stessa cosa. */
    fun togli(context: Context) {
        context.getSystemService(NotificationManager::class.java)?.cancel(TalosNotificationIds.AGGIORNAMENTO)
    }

    private fun pubblica(context: Context, titolo: String, testo: String) {
        canale(context, rinomina = false)
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val apri = Intent(context, MainActivity::class.java)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        val attesa = PendingIntent.getActivity(context, TalosNotificationIds.AGGIORNAMENTO, apri,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        manager.notify(TalosNotificationIds.AGGIORNAMENTO, NotificationCompat.Builder(context, CANALE)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentIntent(attesa)
            .setAutoCancel(true)
            .build())
    }
}
