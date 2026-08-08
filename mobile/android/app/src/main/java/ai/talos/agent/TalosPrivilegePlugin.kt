package ai.talos.agent

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import rikka.shizuku.Shizuku

/**
 * La porta verso il ponte privilegiato — e per adesso **guarda soltanto**.
 *
 * ## Perché comincia senza saper fare niente
 *
 * Perché il primo pezzo di un ponte privilegiato non è ciò che attraversa: è
 * sapere **se il ponte c'è**, e dirlo a chi deve decidere. Una schermata che
 * offre «controlla il telefono» quando Shizuku è spento manda la persona a
 * cercare un difetto nostro invece della causa vera.
 *
 * ⛔ E c'è una ragione di sicurezza per cui la prima versione non esegue: la
 * fotografia è ciò che il cancello dei permessi consulta per sapere se ha senso
 * perfino chiedere. Se nascesse insieme a un `esegui()`, il primo tool
 * privilegiato arriverebbe prima che qualcuno abbia deciso quale grammatica di
 * permessi lo governa — e quella decisione è già scritta:
 * **sempre / chiedi / nega**, una sola per tutto.
 *
 * ## Perché la richiesta è un metodo a parte
 *
 * `leggi()` è una lettura e non chiede niente. `chiedi()` apre la finestra di
 * sistema. Tenerli separati è ciò che impedisce a una schermata di stato di far
 * comparire una richiesta di permesso che nessuno ha invocato: chi si vede
 * arrivare quella finestra senza averla chiesta non sa cosa sta autorizzando, e
 * dice di sì o di no per il motivo sbagliato.
 */
@CapacitorPlugin(name = "TalosPrivilege")
class TalosPrivilegePlugin : Plugin() {

    /** Il codice con cui riconosciamo la NOSTRA richiesta fra le risposte. */
    private val richiesta = 4127

    private val ascoltatore = Shizuku.OnRequestPermissionResultListener { code, _ ->
        if (code != richiesta) return@OnRequestPermissionResultListener
        // Non si risponde alla chiamata da qui: la chiamata si e' gia' chiusa
        // dicendo «ho chiesto». Qui si annuncia il CAMBIO, e chi guarda la
        // schermata lo vede senza doverla riaprire.
        notifyListeners("talosPrivilegeChanged", JSObject())
    }

    override fun load() {
        runCatching { Shizuku.addRequestPermissionResultListener(ascoltatore) }
        // Il binder puo' arrivare DOPO l'avvio dell'app — Shizuku lo consegna
        // quando e' pronto. Senza questi due, una schermata aperta troppo
        // presto direbbe «spento» per sempre.
        runCatching {
            Shizuku.addBinderReceivedListenerSticky {
                notifyListeners("talosPrivilegeChanged", JSObject())
            }
            Shizuku.addBinderDeadListener {
                notifyListeners("talosPrivilegeChanged", JSObject())
            }
        }
    }

    override fun handleOnDestroy() {
        runCatching { Shizuku.removeRequestPermissionResultListener(ascoltatore) }
    }

    /** La fotografia: cosa si può fare adesso, e se non si può, perché. */
    @PluginMethod
    fun snapshot(call: PluginCall) {
        val f = TalosPrivilegeSnapshot.leggi(context.packageManager)
        val result = JSObject()
        result.put("state", f.stato.name.lowercase())
        result.put("version", f.versione)
        result.put("uid", f.uid)
        result.put("outdated", f.troppoVecchio)
        /*
         * ⛔ La riga che evita una promessa falsa.
         *
         * Con l'identita' della shell (uid 2000) i permessi NON si concedono su
         * ColorOS — misurato sul Pad. Con root si'. Dirlo qui, accanto allo
         * stato, e' cio' che permette alla schermata di non offrire una strada
         * che su questo dispositivo non esiste.
         */
        result.put("canGrantPermissions", f.uid == 0)
        call.resolve(result)
    }

    /**
     * Chiede l'autorizzazione. Un ATTO, e per questo separato dalla lettura.
     *
     * Non si richiede a chi ha già detto di no: si torna `denied` e la
     * schermata spiega. Insistere con una finestra di sistema dopo un rifiuto è
     * il modo più rapido di far disinstallare un'app.
     */
    @PluginMethod
    fun request(call: PluginCall) {
        val f = TalosPrivilegeSnapshot.leggi(context.packageManager)
        val result = JSObject()
        when (f.stato) {
            TalosPrivilegeSnapshot.Stato.PRONTO -> result.put("outcome", "already")
            TalosPrivilegeSnapshot.Stato.NEGATO -> result.put("outcome", "denied")
            TalosPrivilegeSnapshot.Stato.ASSENTE -> result.put("outcome", "missing")
            TalosPrivilegeSnapshot.Stato.SPENTO -> result.put("outcome", "stopped")
            TalosPrivilegeSnapshot.Stato.DA_AUTORIZZARE -> {
                runCatching { Shizuku.requestPermission(richiesta) }
                    .onFailure { result.put("outcome", "failed") }
                    .onSuccess { result.put("outcome", "asked") }
            }
        }
        call.resolve(result)
    }
}
