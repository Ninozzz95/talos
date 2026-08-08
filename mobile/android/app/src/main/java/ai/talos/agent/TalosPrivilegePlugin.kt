package ai.talos.agent

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import rikka.shizuku.Shizuku
import java.io.BufferedReader
import java.io.InputStreamReader

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

    /** Il pacchetto di Shizuku: serve a distinguere «assente» da «spenta». */
    private val SHIZUKU = "moe.shizuku.privileged.api"

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
     * Porta dove si fa il passo successivo: l'app Shizuku, o le opzioni
     * sviluppatore.
     *
     * ⛔ Nativo e non un `AppLauncher` generico, per una ragione precisa: se
     * Shizuku **non è installato** va aperta la sua pagina, non l'app che non
     * c'è. Mandare al sito chi ce l'ha già installata gli fa perdere il filo;
     * aprire un'app assente non fa niente e sembra un difetto nostro. Sono due
     * casi, e chi li distingue è il `PackageManager`, che sta qui.
     */
    @PluginMethod
    fun open(call: PluginCall) {
        val dove = call.getString("target") ?: ""
        val intent = when (dove) {
            "shizuku" -> context.packageManager.getLaunchIntentForPackage(SHIZUKU)
                ?: android.content.Intent(
                    android.content.Intent.ACTION_VIEW,
                    android.net.Uri.parse("https://shizuku.rikka.app/"),
                )
            "developer" -> android.content.Intent(
                android.provider.Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS,
            )
            else -> {
                call.reject("TALOS_PRIVILEGE_UNKNOWN_TARGET")
                return
            }
        }
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        val esito = JSObject()
        runCatching { context.startActivity(intent) }
            .onSuccess { esito.put("opened", true) }
            .onFailure { esito.put("opened", false) }
        call.resolve(esito)
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

    /**
     * ⭐⭐ ESEGUIRE con l'identità della shell — e non farsi CONCEDERE niente.
     *
     * ## La misura che ha deciso questa forma
     *
     * Sul Pad dell'owner, 2026-08-08, OxygenOS 16.0.9.400. Il monitoraggio
     * permessi di Oppo blocca **una cosa sola**: che la shell **conceda**
     * permessi ad altre app. Non blocca che la shell **faccia** le cose:
     *
     * ```
     * pm grant …                      ⛔ SecurityException, uid 2000
     * appops set …                    ⛔ SecurityException, uid 2000
     * cmd wifi set-wifi-enabled …     ✅ spento e riacceso davvero
     * cmd bluetooth_manager disable   ✅ Success
     * cmd notification set_dnd …      ✅ eseguito
     * cmd notification allow_listener ✅ abilitato, senza il viaggio nelle impostazioni
     * settings put secure …           ✅ scritto e riletto
     * dumpsys usagestats              ✅ leggibile
     * ```
     *
     * ⛔ Quasi tutte le app che usano Shizuku lo usano per farsi **concedere**
     * i permessi una volta e poi lavorare da sole. Su questi telefoni quella è
     * **l'unica strada chiusa** — ed è il motivo per cui Shizuku avverte che
     * «le app che lo usano non funzioneranno correttamente». Per noi non è
     * vero, se facciamo l'opposto: passare da qui **ogni volta**.
     *
     * Si sposa con il vincolo che avevamo già accettato per altre ragioni:
     * Shizuku non sopravvive al riavvio, quindi il controllo del telefono è una
     * **capacità viva**, non un permesso acquisito. Questa misura dice che è
     * anche l'unica architettura che regge.
     *
     * ## ⛔ Perché un ELENCO di parole e non una riga di comando
     *
     * Perché una stringa data a una shell è un'iniezione che aspetta un
     * argomento con uno spazio dentro: il nome di una rete, il titolo di una
     * notifica, il testo di una risposta. `newProcess` prende già un array e
     * non interpreta nulla — nessuna virgoletta da mettere, nessun `;` che
     * possa diventare un secondo comando.
     *
     * E il primo elemento sta su una **lista bianca**. Non è diffidenza verso
     * il nostro codice: è che gli argomenti li sceglie il MODELLO, e un modello
     * che può scegliere anche il *programma* ha una shell in mano invece di uno
     * strumento.
     */
    @PluginMethod
    fun exec(call: PluginCall) {
        val esito = JSObject()
        val comando = mutableListOf<String>()
        val grezzo = call.getArray("command")
        if (grezzo != null) {
            for (indice in 0 until grezzo.length()) {
                comando.add(grezzo.getString(indice) ?: "")
            }
        }

        if (comando.isEmpty()) {
            call.resolve(esito.put("ok", false).put("reason", "no-command"))
            return
        }
        if (comando[0] !in PROGRAMMI_AMMESSI) {
            // Col nome vero dentro: chi legge il registro deve capire cosa è
            // stato rifiutato senza venire a rileggere questo file.
            call.resolve(esito.put("ok", false)
                .put("reason", "program-not-allowed").put("program", comando[0]))
            return
        }
        if (!Shizuku.pingBinder()) {
            call.resolve(esito.put("ok", false).put("reason", "shizuku-not-running"))
            return
        }
        if (Shizuku.checkSelfPermission() != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            call.resolve(esito.put("ok", false).put("reason", "shizuku-not-authorised"))
            return
        }

        try {
            val processo = avviaComeShell(comando.toTypedArray())
            if (processo == null) {
                call.resolve(esito.put("ok", false).put("reason", "exec-unavailable"))
                return
            }
            val uscita = BufferedReader(InputStreamReader(processo.inputStream)).use { it.readText() }
            val errori = BufferedReader(InputStreamReader(processo.errorStream)).use { it.readText() }
            val codice = processo.waitFor()
            /*
             * ⛔ Il codice di uscita NON basta a dire «riuscito». `cmd` e
             * `settings` restituiscono 0 anche quando stampano una
             * SecurityException su stderr — ed è esattamente così che il
             * monitoraggio permessi si manifesta. Quindi si guarda anche
             * l'errore, e lo si riporta INTERO invece di riassumerlo: chi
             * legge deve poter capire perché, non soltanto che.
             */
            val negato = errori.contains("SecurityException")
            esito.put("ok", codice == 0 && !negato)
            esito.put("exitCode", codice)
            esito.put("output", uscita.trim())
            esito.put("error", errori.trim())
            if (negato) esito.put("reason", "denied-by-system")
            call.resolve(esito)
        } catch (fallito: Exception) {
            call.resolve(esito.put("ok", false).put("reason", "exec-failed")
                .put("error", fallito.message ?: fallito.javaClass.simpleName))
        }
    }

    /**
     * ⛔ `Shizuku.newProcess` è **privata** nell'API pubblica, e ci si arriva
     * per riflessione.
     *
     * Non è un aggiramento: è la strada che l'autore di Shizuku ha lasciato
     * aperta e non promette. La tiene fuori dall'API perché la vera interfaccia
     * sanzionata è `ShizukuBinderWrapper` sui singoli servizi di sistema —
     * `IWifiManager`, `INotificationManager`, uno per uno, ciascuno col proprio
     * AIDL nascosto e la propria differenza fra versioni di Android.
     *
     * Qui si sceglie il processo per una ragione precisa: **è quello che ho
     * misurato**. Tutte e otto le capacità di T2 le ho provate come comandi
     * (`cmd wifi`, `cmd notification`, `settings put`, `dumpsys`), e so che
     * funzionano su questo telefono. Reimplementarle una per una in AIDL
     * significherebbe riscrivere in codice non provato ciò che ho già visto
     * riuscire — e scoprire le differenze fra versioni una alla volta, sul
     * dispositivo di qualcun altro.
     *
     * ⛔ Il prezzo è dichiarato: se un domani Shizuku togliesse questo metodo,
     * si smette di poter agire. Per questo il fallimento è **esplicito**
     * (`exec-unavailable`) e non un errore generico: quel giorno il registro
     * dirà cosa è successo, invece di far sembrare rotto il telefono.
     */
    private fun avviaComeShell(comando: Array<String>): Process? = runCatching {
        val metodo = Shizuku::class.java.getDeclaredMethod(
            "newProcess",
            Array<String>::class.java,
            Array<String>::class.java,
            String::class.java,
        )
        metodo.isAccessible = true
        metodo.invoke(null, comando, null, null) as? Process
    }.getOrNull()

    private companion object {
        /**
         * I programmi che il ponte accetta di lanciare: cinque nomi, tutti di
         * Android, tutti con una superficie che sappiamo descrivere.
         */
        val PROGRAMMI_AMMESSI = setOf("cmd", "settings", "dumpsys", "pm", "am")
    }
}
