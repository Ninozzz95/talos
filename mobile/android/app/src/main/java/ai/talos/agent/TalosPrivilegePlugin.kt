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
        /*
         * ⛔ CLEAR_TASK, e non solo NEW_TASK.
         *
         * Misurato il 2026-08-08 alle 22:54: Impostazioni era gia' aperta su
         * un'altra pagina (quella del permesso della finestra flottante), e
         * `startActivity` con il solo NEW_TASK ha RIPRESO quel compito invece di
         * navigare — la persona si e' ritrovata davanti la pagina sbagliata,
         * col nostro campo che le chiedeva un codice che li' non c'era.
         */
        intent.addFlags(
            android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK,
        )
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
            // Shizuku non c'è. Non è più la fine della strada: il ponte in casa
            // non dipende da lui, ed è l'unico che funziona su OxygenOS 16.
            call.resolve(conIlPonte(esito, comando, "shizuku-not-running"))
            return
        }
        /*
         * ⛔ SI PROVA LO STESSO, e si riferisce cosa risponde il server.
         *
         * ## Cosa è stato misurato il 2026-08-08, su OxygenOS 16
         *
         * Shizuku vivo e avviato da adb. L'app chiede l'autorizzazione e non
         * arriva mai, perché Shizuku la concede con un `pm grant` e questa ROM
         * ha tolto alla shell il potere di concedere:
         *
         *   SecurityException: grantRuntimePermission: Neither user 2000 nor
         *   current process has android.permission.GRANT_RUNTIME_PERMISSIONS
         *
         * Quindi `checkSelfPermission` qui non dirà MAI «concesso» — e
         * fermarsi su quel controllo significa non provare mai, su un
         * dispositivo dove la shell esegue benissimo (Wi-Fi acceso e spento
         * dalla shell: provato).
         *
         * ## Perché non è un aggiramento
         *
         * Non stiamo scavalcando nessun controllo: chi decide se accettarci è
         * il server di Shizuku, e continua a decidere lui. Noi smettiamo solo
         * di indovinare la sua risposta al posto suo. Se rifiuta, il rifiuto
         * arriva da lui, con le sue parole, e finisce in `reason` — che è
         * un'informazione, mentre «shizuku-not-authorised» era una previsione.
         */
        val autorizzatoSecondoAndroid =
            Shizuku.checkSelfPermission() == android.content.pm.PackageManager.PERMISSION_GRANTED

        try {
            val processo = avviaComeShell(comando.toTypedArray())
            if (processo == null) {
                // Il caso più comune sul Pad dell'owner: il server di Shizuku ci
                // ha respinti. Prima si diceva soltanto quale delle due cose era
                // successa; adesso si PROVA l'altra strada, perché ce n'è una.
                call.resolve(conIlPonte(
                    esito,
                    comando,
                    if (autorizzatoSecondoAndroid) "exec-unavailable" else "shizuku-refused",
                ).put("androidPermission", autorizzatoSecondoAndroid)
                    .put("detail", ultimoRifiuto ?: ""))
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
            call.resolve(conIlPonte(esito, comando, "exec-failed")
                .put("error", fallito.message ?: fallito.javaClass.simpleName))
        }
    }

    /**
     * ⭐⭐ LA SECONDA STRADA, quando Shizuku non c'è o ci ha respinti.
     *
     * ## Perché il ripiego sta QUI e non in cima
     *
     * Perché Shizuku, dove funziona, è più veloce e non chiede niente
     * all'utente: parla direttamente col suo server, senza avviare un processo
     * né aprire una porta. Metterlo per primo significa che chi ha un telefono
     * dove Shizuku va **non paga nulla** per l'esistenza del ponte.
     *
     * ## ⛔ E perché NON si ripiega quando la ROM ha detto di no
     *
     * Le due strade arrivano alla stessa identità: uid 2000, la shell. Se il
     * monitoraggio permessi ha rifiutato a Shizuku, rifiuterà identicamente al
     * ponte — riprovare sarebbe solo lento, e produrrebbe un secondo «no» che
     * qualcuno potrebbe leggere come una causa diversa. Il ripiego scatta solo
     * quando Shizuku **non ha potuto provare**: assente, spento, o rifiutato dal
     * suo server.
     *
     * ## I due motivi si riferiscono ENTRAMBI
     *
     * Se falliscono tutte e due, la risposta porta sia il motivo del ponte sia
     * quello di Shizuku. Chi indaga con un motivo solo in mano ricomincia da
     * capo per scoprire l'altro — l'ho fatto io il 2026-08-08 con
     * `shizuku-refused` che spariva dietro una frase generica.
     */
    private fun conIlPonte(esito: JSObject, comando: List<String>, motivoShizuku: String): JSObject {
        if (!TalosPonteAdb.disponibile(context)) {
            return esito.put("ok", false).put("reason", motivoShizuku).put("via", "none")
        }
        val ponte = TalosPonteAdb.shell(context, comando, PROGRAMMI_AMMESSI)
        if (ponte.ok) {
            return esito.put("ok", true).put("via", "bridge")
                .put("output", ponte.uscita).put("error", ponte.errore).put("exitCode", ponte.codice)
        }
        return esito.put("ok", false)
            .put("reason", ponte.motivo ?: motivoShizuku)
            .put("shizukuReason", motivoShizuku)
            .put("via", "none")
            .put("output", ponte.uscita)
            .put("error", ponte.errore)
    }

    /** Se il ponte è impacchettato, e se in questo istante è collegato. */
    @PluginMethod
    fun bridgeStatus(call: PluginCall) {
        val presente = TalosPonteAdb.disponibile(context)
        call.resolve(
            JSObject().put("packaged", presente)
                // ⛔ Si CHIEDE al ponte, non si ricorda: il Debug wireless muore
                // al riavvio, e un valore ricordato racconterebbe un telefono
                // che non c'è più.
                .put("connected", presente && TalosPonteAdb.collegato(context)),
        )
    }

    /**
     * L'accoppiamento. ⭐ L'indirizzo **lo trova TALOS**: alla persona resta da
     * leggere il codice a sei cifre che la finestrella le sta già mostrando.
     *
     * `address` resta accettato come scorciatoia per quando l'annuncio non
     * arriva — su una rete che blocca il multicast succede, e allora è meglio
     * un campo da compilare che un vicolo cieco.
     */
    @PluginMethod
    fun bridgePair(call: PluginCall) {
        provaOgniIndirizzo(
            call,
            TalosPonteAdb.ANNUNCIO_ACCOPPIAMENTO,
            "pairing-not-announced",
        ) { indirizzo -> TalosPonteAdb.accoppia(context, indirizzo, call.getString("code") ?: "") }
    }

    /** Il collegamento, che è l'ALTRA porta. Anche questa se la trova da sé. */
    @PluginMethod
    fun bridgeConnect(call: PluginCall) {
        provaOgniIndirizzo(
            call,
            TalosPonteAdb.ANNUNCIO_COLLEGAMENTO,
            "connect-not-announced",
        ) { indirizzo -> TalosPonteAdb.collega(context, indirizzo) }
    }

    /**
     * ⭐ Prova ogni candidato annunciato, e dice QUALE ha funzionato.
     *
     * ⛔ Non si prende «il primo»: misurato il 2026-08-08 che l'annuncio in
     * testa era un residuo di una sessione precedente ancora in cache, e
     * collegarcisi dava `Connection refused` mentre il telefono era lì, acceso e
     * raggiungibile. Un ponte che fallisce a caso è peggio di un ponte assente,
     * perché alla persona sembra colpa sua.
     *
     * `address` esplicito scavalca tutto: su una rete che blocca il multicast
     * l'annuncio non arriva, e un campo da compilare è meglio di un vicolo cieco.
     */
    private fun provaOgniIndirizzo(
        call: PluginCall,
        annuncio: String,
        seNessuno: String,
        azione: (String) -> TalosPonteAdb.Esito,
    ) {
        val scelto = call.getString("address")?.takeIf { it.isNotBlank() }
        val candidati = if (scelto != null) listOf(scelto) else TalosPonteAdb.scopri(context, annuncio)
        if (candidati.isEmpty()) {
            call.resolve(JSObject().put("ok", false).put("reason", seNessuno).put("tried", 0))
            return
        }
        var ultimo: TalosPonteAdb.Esito? = null
        for (indirizzo in candidati) {
            val esito = azione(indirizzo)
            ultimo = esito
            if (esito.ok) {
                call.resolve(
                    JSObject().put("ok", true).put("address", indirizzo)
                        .put("tried", candidati.size)
                        .put("output", esito.uscita).put("error", esito.errore),
                )
                return
            }
        }
        call.resolve(
            JSObject().put("ok", false)
                .put("reason", ultimo?.motivo ?: seNessuno)
                .put("tried", candidati.size)
                .put("output", ultimo?.uscita ?: "").put("error", ultimo?.errore ?: ""),
        )
    }

    /** Chiude il server e la porta locale che teneva aperta. */
    @PluginMethod
    fun bridgeStop(call: PluginCall) {
        val esito = TalosPonteAdb.spegni(context)
        call.resolve(JSObject().put("ok", esito.ok))
    }

    /** Se il sistema ci lascia disegnare sopra le altre app. */
    @PluginMethod
    fun overlayStatus(call: PluginCall) {
        call.resolve(
            JSObject().put("allowed", TalosPonteOverlay.consentito(context))
                .put("open", TalosPonteOverlay.aperta()),
        )
    }

    /**
     * Apre la pagina di sistema del permesso.
     *
     * ⛔ Nativo e non un launcher generico: l'intent vuole `package:` col NOSTRO
     * nome, altrimenti si apre l'elenco di tutte le app e la persona deve
     * cercarci dentro — che è il modo più rapido di far abbandonare un permesso.
     */
    @PluginMethod
    fun overlayRequest(call: PluginCall) {
        val intent = android.content.Intent(
            android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:${context.packageName}"),
        ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        val esito = JSObject()
        runCatching { context.startActivity(intent) }
            .onSuccess { esito.put("opened", true) }
            .onFailure { esito.put("opened", false) }
        call.resolve(esito)
    }

    /**
     * ⭐⭐ Il campo che galleggia sopra Impostazioni.
     *
     * Le parole arrivano da JavaScript perché è lì che vivono i dizionari: una
     * finestra di sistema scritta in italiano dentro il Kotlin sarebbe l'unica
     * superficie di TALOS che non parla la lingua scelta dalla persona.
     */
    @PluginMethod
    fun overlayPair(call: PluginCall) {
        if (!TalosPonteOverlay.consentito(context)) {
            call.resolve(JSObject().put("shown", false).put("reason", "overlay-not-allowed"))
            return
        }
        val attivita = activity
        if (attivita == null) {
            call.resolve(JSObject().put("shown", false).put("reason", "no-activity"))
            return
        }
        val titolo = call.getString("title") ?: "Pairing code"
        val istruzione = call.getString("instruction") ?: ""
        val pulsante = call.getString("action") ?: "Pair"

        attivita.runOnUiThread {
            val mostrata = TalosPonteOverlay.mostra(
                context,
                titolo,
                istruzione,
                pulsante,
                accoppia = { codice, risposta ->
                    /*
                     * ⛔ Su un thread a parte: qui si scopre un servizio di rete
                     * e si lancia un processo. Farlo sul thread principale
                     * bloccherebbe la finestrella di sistema che stiamo
                     * cercando di tenere viva — cioè romperebbe esattamente la
                     * cosa che questa finestra esiste per proteggere.
                     */
                    Thread {
                        val indirizzi = TalosPonteAdb.scopri(
                            context,
                            TalosPonteAdb.ANNUNCIO_ACCOPPIAMENTO,
                        )
                        if (indirizzi.isEmpty()) {
                            risposta(false, call.getString("notHeard") ?: "pairing-not-announced")
                            return@Thread
                        }
                        var ultimo = ""
                        for (indirizzo in indirizzi) {
                            val esito = TalosPonteAdb.accoppia(context, indirizzo, codice)
                            if (esito.ok) {
                                // ⭐ Subito il collegamento: è l'ALTRA porta, e
                                // chiedere un secondo tocco qui sarebbe far fare
                                // alla persona un passo che sappiamo già.
                                val collegato = TalosPonteAdb.scopri(
                                    context,
                                    TalosPonteAdb.ANNUNCIO_COLLEGAMENTO,
                                ).firstOrNull { TalosPonteAdb.collega(context, it).ok }
                                notifyListeners(
                                    "talosPonteChanged",
                                    JSObject().put("connected", collegato != null),
                                )
                                risposta(true, collegato ?: "")
                                return@Thread
                            }
                            ultimo = esito.motivo ?: esito.errore
                        }
                        risposta(false, ultimo.ifBlank { call.getString("failed") ?: "pair-failed" })
                    }.start()
                },
                quandoFinisce = { riuscito, _ ->
                    notifyListeners("talosPonteChanged", JSObject().put("connected", riuscito))
                },
            )
            call.resolve(JSObject().put("shown", mostrata))
        }
    }

    /**
     * ⭐⭐ ACCOPPIAMENTO DALLA TENDINA: il codice si scrive in una NOTIFICA.
     *
     * ## Perché sostituisce la finestra flottante
     *
     * Owner, 2026-08-09: «appena entro in dev settings la finestra flottante
     * viene coperta». Da Android 15 la pagina delle opzioni sviluppatore
     * dichiara il proprio contenuto protetto dalla condivisione schermo, e su
     * OxygenOS quella protezione si porta via anche le finestre di sistema
     * disegnate sopra.
     *
     * La tendina no: la disegna SystemUI e si apre **sopra qualunque
     * schermata**, comprese quelle protette. È la stessa strada di Shizuku
     * (`AdbPairingService`), cercata prima di scrivere una riga.
     *
     * ## Come si chiude il giro
     *
     * La notifica resta finché non arriva un codice. Quando arriva, qui si fa
     * lo stesso lavoro dell'altra strada — scopri, accoppia, e **subito**
     * collega, perché sono due porte diverse e chiedere un secondo tocco alla
     * persona sarebbe farle fare un passo che sappiamo già.
     */
    @PluginMethod
    fun pairNotification(call: PluginCall) {
        val mostrata = TalosAccoppiamentoNotifica.mostra(
            context,
            call.getString("title") ?: "Pairing code",
            call.getString("instruction") ?: "",
            call.getString("action") ?: "Pair",
        ) { codice ->
            /*
             * ⛔ Su un thread a parte: qui si scopre un servizio di rete e si
             * lancia un processo, e questo arriva dal ricevitore di una
             * notifica — cioè sul thread principale. Bloccarlo significherebbe
             * un ANR mentre la persona guarda.
             */
            Thread {
                val indirizzi = TalosPonteAdb.scopri(context, TalosPonteAdb.ANNUNCIO_ACCOPPIAMENTO)
                var riuscito = false
                for (indirizzo in indirizzi) {
                    if (!TalosPonteAdb.accoppia(context, indirizzo, codice).ok) continue
                    val collegato = TalosPonteAdb.scopri(
                        context,
                        TalosPonteAdb.ANNUNCIO_COLLEGAMENTO,
                    ).firstOrNull { TalosPonteAdb.collega(context, it).ok }
                    riuscito = collegato != null
                    break
                }
                if (riuscito) TalosAccoppiamentoNotifica.chiudi(context)
                notifyListeners("talosPonteChanged", JSObject().put("connected", riuscito))
            }.start()
        }
        call.resolve(JSObject().put("shown", mostrata))
    }

    /** Toglie la notifica dell'accoppiamento. */
    @PluginMethod
    fun pairNotificationClose(call: PluginCall) {
        TalosAccoppiamentoNotifica.chiudi(context)
        call.resolve(JSObject().put("closed", true))
    }

    /** Toglie la finestra flottante. */
    @PluginMethod
    fun overlayClose(call: PluginCall) {
        activity?.runOnUiThread { TalosPonteOverlay.chiudi(context) }
        call.resolve(JSObject().put("closed", true))
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
    /**
     * L'ultimo motivo per cui l'avvio non è riuscito, con le parole di chi ha
     * rifiutato.
     *
     * ⛔ Prima qui c'era `runCatching { … }.getOrNull()` e basta: l'eccezione
     * spariva, e chiunque indagasse trovava soltanto un `null` — cioè «non ha
     * funzionato», che è la stessa cosa che si vedeva a schermo. Un errore
     * ingoiato costa più della riga che serviva a tenerlo.
     */
    private var ultimoRifiuto: String? = null

    private fun avviaComeShell(comando: Array<String>): Process? = runCatching {
        val metodo = Shizuku::class.java.getDeclaredMethod(
            "newProcess",
            Array<String>::class.java,
            Array<String>::class.java,
            String::class.java,
        )
        metodo.isAccessible = true
        metodo.invoke(null, comando, null, null) as? Process
    }.onFailure {
        // La riflessione impacchetta tutto in InvocationTargetException: quella
        // che dice qualcosa è la causa, non l'involucro.
        ultimoRifiuto = (it.cause ?: it).toString()
    }.onSuccess { ultimoRifiuto = null }.getOrNull()

    private companion object {
        /**
         * I programmi che il ponte accetta di lanciare: cinque nomi, tutti di
         * Android, tutti con una superficie che sappiamo descrivere.
         */
        val PROGRAMMI_AMMESSI = setOf("cmd", "settings", "dumpsys", "pm", "am")
    }
}
