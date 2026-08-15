package ai.talos.parola

import android.Manifest
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * ⭐ L'INTERRUTTORE di «hey TALOS», e niente di più.
 *
 * ⛔ Il permesso del microfono si chiede QUI, non dentro il servizio: un
 * servizio non ha una finestra su cui mostrare una scheda di sistema, e uno che
 * parte e muore perché il permesso manca è indistinguibile da uno rotto. Qui
 * c'è l'Activity, quindi c'è qualcuno a cui chiedere.
 */
@CapacitorPlugin(
    name = "TalosParola",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microfono")],
)
class TalosParolaPlugin : Plugin() {

    @PluginMethod
    fun stato(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("accesa", TalosParola.accesa())
                .put("permesso", getPermissionState("microfono").toString()),
        )
    }

    @PluginMethod
    fun accendi(call: PluginCall) {
        if (getPermissionState("microfono") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "dopoIlPermesso")
            return
        }
        avvia(call)
    }

    @PermissionCallback
    private fun dopoIlPermesso(call: PluginCall) {
        if (getPermissionState("microfono") != com.getcapacitor.PermissionState.GRANTED) {
            call.resolve(JSObject().put("accesa", false).put("motivo", "permessoNegato"))
            return
        }
        avvia(call)
    }

    /**
     * ⛔⛔ «ACCESA» NON È UN AUGURIO: si CONTROLLA che il servizio sia partito.
     *
     * Owner 2026-08-12: «hey TALOS non dà segni di vita». MISURATO sul Pad, con
     * `dumpsys activity services ai.talos.dev`: fra i servizi vivi ci sono
     * `TalosAssistente`, la sua sessione e la WebView — e **`TalosParola` non
     * c'è**. Non è sordo: non esiste.
     *
     * E l'interruttore diceva di sì lo stesso, perché questa funzione rispondeva
     * `accesa = true` **senza guardare niente**: chiamava `startForegroundService`
     * e dichiarava vittoria. Ma quella chiamata è asincrona e può finire in tre
     * modi che qui erano tutti indistinguibili da un successo —
     *
     *   1. il servizio parte e va;
     *   2. parte e si ferma da solo (`onStartCommand` fa `stopSelf` se manca il
     *      permesso del microfono, oppure il modello non si apre);
     *   3. non parte affatto — su Android 14+ un servizio di tipo `microphone`
     *      avviato dal fondo lancia `ForegroundServiceStartNotAllowedException`.
     *
     * ⇒ Si guarda l'esito. Il servizio dichiara `vivo` quando ha davvero il
     * microfono in mano: si aspetta quel momento, per un tempo finito, e si
     * risponde con la verità. Un interruttore che mente è peggio di uno rotto,
     * perché toglie alla persona anche la possibilità di accorgersene.
     */
    private fun avvia(call: PluginCall) {
        try {
            TalosParola.accendi(context)
        } catch (errore: Exception) {
            // ⛔ Il motivo VERO viaggia col rifiuto, se no di qua si vede solo
            // «non funziona» e si cerca il guasto nel modello — che è dove NON è.
            call.resolve(
                JSObject()
                    .put("accesa", false)
                    .put("motivo", "${errore.javaClass.simpleName}: ${errore.message}"),
            )
            return
        }
        /*
         * ⛔ Si aspetta l'esito, non si indovina. `startForegroundService` torna
         * subito; il servizio nasce, chiede il microfono e apre il modello (che
         * pesa 4,8 MB) su un altro thread. Mezzo secondo è il tetto: oltre, la
         * risposta onesta è «non è partito», e la persona lo vede subito invece
         * di scoprirlo quando chiama TALOS e non risponde nessuno.
         */
        val mano = android.os.Handler(android.os.Looper.getMainLooper())
        val scadenza = android.os.SystemClock.uptimeMillis() + 1_500
        val controlla = object : Runnable {
            override fun run() {
                if (TalosParola.accesa()) {
                    call.resolve(JSObject().put("accesa", true))
                    return
                }
                if (android.os.SystemClock.uptimeMillis() >= scadenza) {
                    android.util.Log.w(
                        "TalosParola",
                        "l'interruttore è stato premuto ma il servizio non è vivo",
                    )
                    call.resolve(JSObject().put("accesa", false).put("motivo", "nonPartito"))
                    return
                }
                mano.postDelayed(this, 50)
            }
        }
        mano.postDelayed(controlla, 50)
    }

    @PluginMethod
    fun spegni(call: PluginCall) {
        TalosParola.spegni(context)
        call.resolve(JSObject().put("accesa", false))
    }
}
