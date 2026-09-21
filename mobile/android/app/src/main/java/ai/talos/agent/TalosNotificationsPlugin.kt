package ai.talos.agent

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Il ponte fra la chat e le notifiche del telefono.
 *
 * ⛔ Il plugin non decide niente: non sa cosa sia un permesso di TALOS, non
 * conosce la grammatica read/write/outbound, non filtra. Quelle decisioni
 * stanno già in un posto solo, e duplicarle qui vorrebbe dire averne due che
 * prima o poi divergono. Qui c'è soltanto: chiedere al sistema, e riferire.
 */
@CapacitorPlugin(name = "TalosNotifications")
class TalosNotificationsPlugin : Plugin() {

    /**
     * Lo stato, in tre risposte diverse — e le tre sono diverse apposta.
     *
     * - `granted=false` ⇒ la persona non ha ancora acceso l'accesso: si offre la
     *   pagina di sistema.
     * - `granted=true, connected=false` ⇒ il permesso c'è ma il sistema non ci
     *   ha ancora collegati. Una lettura ora tornerebbe vuota, e dire «non hai
     *   notifiche» sarebbe falso.
     * - `connected=true` ⇒ si può leggere.
     *
     * ⛔ Il difetto che questa distinzione evita l'abbiamo già pagato altrove:
     * un ripiego che non distingue le cause manda la persona a fare la cosa
     * sbagliata.
     */
    @PluginMethod
    fun status(call: PluginCall) {
        val nostro = ComponentName(context, TalosNotificationListener::class.java)
        val abilitati = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners",
        ) ?: ""
        val concesso = abilitati.split(':').any { voce ->
            val pulita = voce.trim()
            pulita == nostro.flattenToString() || pulita == nostro.flattenToShortString()
        }
        call.resolve(
            JSObject()
                .put("granted", concesso)
                .put("connected", TalosNotificationListener.vivo),
        )
    }

    /** Apre la pagina di sistema dell'accesso alle notifiche. */
    @PluginMethod
    fun openSettings(call: PluginCall) {
        val esito = runCatching {
            val intento = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intento)
            true
        }.getOrDefault(false)
        call.resolve(JSObject().put("opened", esito))
    }

    @PluginMethod
    fun list(call: PluginCall) {
        val servizio = TalosNotificationListener.Ponte.servizio()
        if (servizio == null) {
            call.resolve(JSObject().put("ok", false).put("reason", "listener-not-connected"))
            return
        }
        /*
         * ⛔ Un tetto, sempre. Cinquanta notifiche di chat finiscono nel
         * contesto di un modello e costano token veri: senza limite, una
         * domanda banale diventa un prompt da migliaia di token.
         */
        val limite = (call.getInt("limit") ?: 20).coerceIn(1, 50)
        val elenco = JSArray()
        for (voce in servizio.elenca(limite)) {
            val oggetto = JSObject()
            for ((chiave, valore) in voce) oggetto.put(chiave, valore)
            elenco.put(oggetto)
        }
        call.resolve(JSObject().put("ok", true).put("notifications", elenco))
    }

    @PluginMethod
    fun reply(call: PluginCall) {
        val servizio = TalosNotificationListener.Ponte.servizio()
        if (servizio == null) {
            call.resolve(JSObject().put("ok", false).put("reason", "listener-not-connected"))
            return
        }
        val chiave = call.getString("key")
        val testo = call.getString("text")
        if (chiave.isNullOrEmpty() || testo.isNullOrEmpty()) {
            call.resolve(JSObject().put("ok", false).put("reason", "missing-argument"))
            return
        }
        val motivo = servizio.rispondi(chiave, testo)
        call.resolve(
            JSObject().put("ok", motivo == null).apply { if (motivo != null) put("reason", motivo) },
        )
    }

    @PluginMethod
    fun dismiss(call: PluginCall) {
        val servizio = TalosNotificationListener.Ponte.servizio()
        if (servizio == null) {
            call.resolve(JSObject().put("ok", false).put("reason", "listener-not-connected"))
            return
        }
        val chiave = call.getString("key")
        if (chiave.isNullOrEmpty()) {
            call.resolve(JSObject().put("ok", false).put("reason", "missing-argument"))
            return
        }
        val motivo = servizio.scarta(chiave)
        call.resolve(
            JSObject().put("ok", motivo == null).apply { if (motivo != null) put("reason", motivo) },
        )
    }
}
