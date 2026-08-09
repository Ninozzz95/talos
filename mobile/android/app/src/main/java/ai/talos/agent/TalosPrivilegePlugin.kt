package ai.talos.agent

import ai.talos.agent.ponte.TalosFilaPonte
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
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

    /**
     * ⛔⛔⛔ IL PONTE NON GIRA MAI SUL THREAD DEI PLUGIN. Mai.
     *
     * ## Il difetto che ha pagato questa riga
     *
     * Owner 2026-08-09: «Caricamento chat» durava **dieci secondi** a ogni
     * avvio. Dodici misure hanno escluso ogni sospetto ovvio — i dati (vuoto =
     * pieno), la chiave (44 ms), l'apertura cifrata (8 ms), le risorse (104 ms),
     * il keystore (1 ms), SQLCipher (3 ms), i venti `registerPlugin` (187 ms in
     * tutto). Tre cure sono state scritte e poi rimosse perché la misura le
     * bocciava.
     *
     * La firma vera era questa: sette chiamate spedite fra 302 ms e 8.708 ms
     * arrivavano al nativo **tutte nello stesso millisecondo**, 10.032 ms dopo
     * la prima. Non lentezza: una **coda**.
     *
     * Campionando la pila del thread colpevole (`TalosSpiaIlThread`) è venuto
     * fuori il nome, con le righe:
     *
     * ```
     *   TalosPrivilegePlugin.exec:234
     *    └─ conIlPonte:267
     *        ├─ shell:315 → esegui("shell …")     ~3,2 s
     *        ├─ shell:316 → riaggancia:361
     *        │    └─ scopri:517  (mDNS)           ~6,0 s
     *        └─ collega:278 → esegui("connect …") ~0,8 s
     * ```
     *
     * ## Perché un blocco qui ferma cose che non c'entrano niente
     *
     * Capacitor ha **un thread solo** per i metodi di **tutti** i plugin:
     *
     * ```
     *   Bridge.java:138   HandlerThread("CapacitorPlugins")
     *   Bridge.java:854   taskHandler.post(currentThreadTask)
     * ```
     *
     * Chi lo occupa ferma il database, la chat, la voce, tutto. E nessuno
     * aspettava il ponte: il guardiano delle capacità parte **senza essere
     * atteso** (`App.vue:768`). La chat non aspettava lui — aspettava il thread
     * che lui teneva. Danno collaterale puro.
     *
     * ⛔ `bridge.execute()` NON è la via d'uscita: posta sullo stesso thread
     * (`Bridge.java:906`). L'unica strada è un esecutore nostro; risolvere una
     * `PluginCall` da un altro thread è confermato sicuro dai manutentori di
     * Capacitor.
     *
     * ## Perché UN thread e non un pool
     *
     * Perché le operazioni del ponte sono **seriali per natura**: `riaggancia`
     * non deve correre insieme a una `shell`, e due riagganci insieme
     * litigherebbero sulla stessa porta. Un thread solo conserva esattamente la
     * serializzazione che c'era prima — toglie solo il disturbo agli altri.
     *
     * ## ⛔ La regola, per chi aggiunge un metodo domani
     *
     * Ogni `@PluginMethod` che tocca `TalosPonteAdb` passa da qui. Se ne aggiungi
     * uno che non lo fa, hai rimesso il difetto: non si vede in questo file, si
     * vede come un girello di dieci secondi da un'altra parte dell'app.
     */
    private fun sulPonte(call: PluginCall, opera: () -> JSObject) {
        TalosFilaPonte.esegui {
            try {
                call.resolve(opera())
            }
            catch (guasto: Throwable) {
                // ⛔ Senza questo, un'eccezione qui sarebbe una promessa che non
                // si risolve MAI: il lato JavaScript resterebbe appeso per
                // sempre, che e' il difetto peggiore di quello che curiamo.
                //
                // ⛔ E si cattura `Throwable`, non `Exception`: `reject` vuole
                // una `Exception`, ma prendere solo quelle lascerebbe passare
                // un `Error` — e allora la promessa resterebbe appesa proprio
                // nel caso peggiore, che e' l'unico in cui conta davvero.
                call.reject(
                    guasto.message ?: "bridge-failed",
                    guasto as? Exception ?: RuntimeException(guasto),
                )
            }
        }
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
     * Porta dove si fa il passo successivo: le opzioni sviluppatore.
     *
     * ⛔⛔ Il bersaglio `shizuku` NON è stato tolto, ed è una scelta.
     *
     * Un'installazione vecchia ha ancora quel nome scritto nella sua interfaccia
     * e lo chiederà. Rispondere `TALOS_PRIVILEGE_UNKNOWN_TARGET` a un pulsante
     * che qualcuno sta guardando sarebbe un comando morto — il difetto che
     * inseguiamo da settimane.
     *
     * Quindi si risponde, e si risponde con la cosa **utile adesso**: le opzioni
     * sviluppatore, che è dove si accende il Debug wireless e quindi dove
     * comincia l'unico ponte rimasto.
     */
    @PluginMethod
    fun open(call: PluginCall) {
        val dove = call.getString("target") ?: ""
        val intent = when (dove) {
            "shizuku", "developer" -> android.content.Intent(
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
            /*
             * ⛔ Senza Shizuku non c'e' piu' un permesso da CHIEDERE a
             * qualcuno: il ponte in casa non concede, si accoppia. Lo stato
             * resta nell'enumerazione perche' un'installazione vecchia puo'
             * ancora leggerlo dal disco, e sparire in silenzio sarebbe peggio
             * che dire «va accoppiato».
             */
            TalosPrivilegeSnapshot.Stato.DA_AUTORIZZARE -> result.put("outcome", "pair")
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
    fun exec(call: PluginCall) = sulPonte(call) {
        val esito = JSObject()
        val comando = mutableListOf<String>()
        val grezzo = call.getArray("command")
        if (grezzo != null) {
            for (indice in 0 until grezzo.length()) {
                comando.add(grezzo.getString(indice) ?: "")
            }
        }

        if (comando.isEmpty()) {
            return@sulPonte esito.put("ok", false).put("reason", "no-command")
        }
        if (comando[0] !in PROGRAMMI_AMMESSI) {
            // Col nome vero dentro: chi legge il registro deve capire cosa è
            // stato rifiutato senza venire a rileggere questo file.
            return@sulPonte esito.put("ok", false)
                .put("reason", "program-not-allowed").put("program", comando[0])
        }
        /*
         * ⭐⭐⭐ UNA STRADA SOLA, ED È LA NOSTRA — owner 2026-08-09.
         *
         * ## Cosa c'era prima
         *
         * Si tentava Shizuku, e il ponte in casa era il ripiego. Aveva senso
         * finché il ponte era nuovo e non provato.
         *
         * ## Perché adesso non ne ha più
         *
         * Le due strade arrivano **alla stessa identità**: uid 2000, la shell.
         * Non c'è niente che Shizuku sappia fare e il ponte no. E su OxygenOS 16
         * — misurato il 2026-08-08 — Shizuku non riesce nemmeno ad autorizzarci,
         * perché lo fa con un `pm grant` che questa ROM alla shell ha tolto:
         *
         *   SecurityException: grantRuntimePermission: Neither user 2000 nor
         *   current process has android.permission.GRANT_RUNTIME_PERMISSIONS
         *
         * ⇒ Su questo telefono la strada «preferita» era quella che non
         * funziona, e il ripiego era l'unica che funzionasse.
         *
         * ## E il costo che pagava la persona
         *
         * Un'app di terzi da cercare, installare, avviare, e riavviare a ogni
         * riavvio del telefono. Il ponte chiede **sei cifre, una volta**.
         *
         * ⛔ Resta una cosa che Shizuku faceva meglio, e va detta invece di
         * nasconderla: il suo server sopravvive allo spegnimento del Debug
         * wireless, la nostra connessione no. È il prossimo passo, non una
         * ragione per tenersi una dipendenza che qui non funziona.
         */
        conIlPonte(esito, comando, "solo-ponte")
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
    private fun conIlPonte(esito: JSObject, comando: List<String>, motivoDiPartenza: String): JSObject {
        if (!TalosPonteAdb.disponibile(context)) {
            return esito.put("ok", false).put("reason", motivoDiPartenza).put("via", "none")
        }
        val ponte = TalosPonteAdb.shell(context, comando, PROGRAMMI_AMMESSI)
        if (ponte.ok) {
            return esito.put("ok", true).put("via", "bridge")
                .put("output", ponte.uscita).put("error", ponte.errore).put("exitCode", ponte.codice)
        }
        return esito.put("ok", false)
            .put("reason", ponte.motivo ?: motivoDiPartenza)
            // ⛔ Si chiamava `shizukuReason` — un nome che dopo l'uscita di
            // Shizuku non descriveva piu' niente. Un campo che porta il nome di
            // una cosa che non esiste piu' e' un indizio falso per chi indaga.
            .put("motivoDiPartenza", motivoDiPartenza)
            .put("via", "none")
            .put("output", ponte.uscita)
            .put("error", ponte.errore)
    }

    /** Se il ponte è impacchettato, e se in questo istante è collegato. */
    @PluginMethod
    fun bridgeStatus(call: PluginCall) = sulPonte(call) {
        val presente = TalosPonteAdb.disponibile(context)
        JSObject().put("packaged", presente)
            // ⛔ Si CHIEDE al ponte, non si ricorda: il Debug wireless muore
            // al riavvio, e un valore ricordato racconterebbe un telefono
            // che non c'è più.
            .put("connected", presente && TalosPonteAdb.collegato(context))
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
    ) = sulPonte(call) {
        val scelto = call.getString("address")?.takeIf { it.isNotBlank() }
        val candidati = if (scelto != null) listOf(scelto) else TalosPonteAdb.scopri(context, annuncio)
        if (candidati.isEmpty()) {
            return@sulPonte JSObject().put("ok", false).put("reason", seNessuno).put("tried", 0)
        }
        var ultimo: TalosPonteAdb.Esito? = null
        for (indirizzo in candidati) {
            val esito = azione(indirizzo)
            ultimo = esito
            if (esito.ok) {
                return@sulPonte JSObject().put("ok", true).put("address", indirizzo)
                    .put("tried", candidati.size)
                    .put("output", esito.uscita).put("error", esito.errore)
            }
        }
        JSObject().put("ok", false)
            .put("reason", ultimo?.motivo ?: seNessuno)
            .put("tried", candidati.size)
            .put("output", ultimo?.uscita ?: "").put("error", ultimo?.errore ?: "")
    }

    /** Chiude il server e la porta locale che teneva aperta. */
    @PluginMethod
    fun bridgeStop(call: PluginCall) = sulPonte(call) {
        JSObject().put("ok", TalosPonteAdb.spegni(context).ok)
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
             *
             * ⛔⛔ E precisamente su QUELLO del ponte, non su uno qualunque.
             * Prima era un `Thread {}` sciolto, e andava bene finché il ponte
             * girava su un thread solo per caso. Ora che [sulPonte] ne ha uno
             * suo, un thread sciolto correrebbe **in parallelo** a un `exec`:
             * due `adb` sulla stessa porta, cioè il difetto che la
             * serializzazione esiste per impedire.
             */
            TalosFilaPonte.esegui {
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
            }
        }
        call.resolve(JSObject().put("shown", mostrata))
    }

    /** Toglie la notifica dell'accoppiamento. */
    @PluginMethod
    fun pairNotificationClose(call: PluginCall) {
        TalosAccoppiamentoNotifica.chiudi(context)
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

    private companion object {
        /**
         * I programmi che il ponte accetta di lanciare: cinque nomi, tutti di
         * Android, tutti con una superficie che sappiamo descrivere.
         */
        val PROGRAMMI_AMMESSI = setOf("cmd", "settings", "dumpsys", "pm", "am")
    }
}
