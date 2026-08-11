package ai.talos.bolla

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * L'interruttore della bolla, per la schermata. SOLO IN SVILUPPO.
 *
 * ## ⛔ Come fa la produzione a non mostrare la scheda
 *
 * Non con un `if (sviluppo)` nel TypeScript: **il pacchetto web è lo stesso**
 * per le due varianti, quindi un controllo lì sarebbe una riga che nella
 * release resta e va indovinata giusta. Qui invece è la CLASSE a non esistere:
 * in release `registerPlugin` non trova niente, ogni chiamata fallisce, e la
 * schermata nasconde la scheda perché il ponte le ha risposto «non ci sono».
 *
 * ⇒ L'assenza è la prova. Vedi `talosBollaDisponibile()` nel TypeScript.
 */
@CapacitorPlugin(name = "TalosBolla")
class TalosBollaPlugin : Plugin() {

    /**
     * Stato: il permesso c'è, e la bolla è accesa?
     *
     * ⛔ Due domande separate, come per il ruolo di assistente: «non hai il
     * permesso» e «ce l'hai ma è spenta» portano a due schermate diverse, e un
     * booleano solo costringerebbe a indovinare quale.
     */
    @PluginMethod
    fun state(call: PluginCall) {
        val esito = JSObject()
        esito.put("available", true)
        esito.put("granted", Settings.canDrawOverlays(context))
        esito.put("on", accesa)
        call.resolve(esito)
    }

    @PluginMethod
    fun enable(call: PluginCall) {
        if (!Settings.canDrawOverlays(context)) {
            /*
             * ⛔ Non si apre la pagina e basta: si RILEGGE al ritorno. Il
             * permesso di finestra flottante non torna nessun esito, e una
             * schermata che desse per concesso ciò che ha solo chiesto è il
             * difetto che ci è già costato «Fatto ✅» su una notifica mai
             * rimossa.
             */
            val pagina = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val esito = JSObject()
            runCatching { context.startActivity(pagina) }
                .onSuccess { esito.put("opened", true) }
                .onFailure { esito.put("opened", false) }
            esito.put("granted", false)
            esito.put("on", false)
            call.resolve(esito)
            return
        }
        TalosBolla.accendi(context)
        accesa = true
        val esito = JSObject()
        esito.put("opened", false)
        esito.put("granted", true)
        esito.put("on", true)
        call.resolve(esito)
    }

    @PluginMethod
    fun disable(call: PluginCall) {
        TalosBolla.spegni(context)
        accesa = false
        val esito = JSObject()
        esito.put("granted", Settings.canDrawOverlays(context))
        esito.put("on", false)
        call.resolve(esito)
    }

    /**
     * ⛔⛔ LA SONDA CHE DECIDE L'ARCHITETTURA DI «HEY TALOS».
     *
     * Domanda: quando il servizio sentirà la parola magica mentre la persona è
     * in un'altra app, Android lo lascerà aprire la barra? Da Android 15 avviare
     * un'activity dal sottofondo è vietato, e fra le esenzioni c'è
     * `SYSTEM_ALERT_WINDOW` — ma **solo se l'app ha una finestra flottante
     * VISIBILE in quel momento**.
     *
     * Se è vero, «hey TALOS» dovrà mostrare un velo «ti ascolto» PRIMA di
     * aprire la barra (che è anche la cosa giusta da mostrare). Se è falso,
     * quel velo non serve e l'architettura è più semplice.
     *
     * ⛔ Non si deduce dalla documentazione: si misura sul telefono. La sonda
     * aspetta `attesaMs` — il tempo di andare in un'altra app — e poi prova ad
     * aprire la barra dal servizio, col velo o senza a seconda di `conVelo`.
     * L'esito si legge in `mCurrentFocus`, non qui.
     */
    @PluginMethod
    fun probeApriDaSfondo(call: PluginCall) {
        val attesa = call.getInt("attesaMs") ?: 6_000
        val conVelo = call.getBoolean("conVelo") ?: false
        TalosBolla.sonda(context, attesa.toLong(), conVelo)
        val esito = JSObject()
        esito.put("partita", true)
        esito.put("attesaMs", attesa)
        esito.put("conVelo", conVelo)
        call.resolve(esito)
    }

    private companion object {
        /*
         * ⛔ Lo stato sta QUI e non nel servizio perché la domanda è «l'ho
         * accesa io?», e chi risponde deve poterlo fare anche quando il servizio
         * non è in piedi. Non è la verità sul processo: è la verità sulla
         * volontà della persona, ed è quella che la schermata deve mostrare.
         */
        var accesa = false
    }
}
