package ai.talos.agent

import ai.talos.agent.ponte.TalosFilaPonte
import ai.talos.agent.ponte.TalosScossaPonte
import ai.talos.agent.ponte.TalosSentinelle
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
     * ⭐ Le due cause di una caduta, ascoltate invece che cercate.
     *
     * MISURATO: guarire costava 128 ms, accorgersene 7,7-9,1 s. Il perché di
     * ogni scelta sta su [TalosScossaPonte]; qui c'è solo il collegamento — la
     * scossa diventa un evento per la pagina, che rilegge davvero.
     *
     * ⛔ NON porta lo stato dentro l'evento. Dire «connected: false» da qui
     * sarebbe indovinare: solo `adb devices` lo sa. L'evento dice «riguarda».
     */
    private val scossa = TalosScossaPonte { causa ->
        notifyListeners("talosPonteScosso", JSObject().put("causa", causa))
        riagganciaSeRichiesto(causa)
    }

    /**
     * ⭐⭐ «MANTIENI ACCESO» — la vigilanza che vive FUORI dalla sua schermata.
     *
     * Owner 2026-08-16: «mettiamo uno switch nelle impostazioni, così l'utente
     * decide se vuole il debug wireless mantenuto sempre acceso oppure
     * attivarlo manualmente ogni volta».
     *
     * ⛔ E il nome promette più di quanto Android conceda. MISURATO: TALOS NON
     * può accendere il debug wireless da solo — `settings put adb_wifi_enabled
     * 1` scrive il valore e la porta TLS resta chiusa, `setprop
     * persist.adb.tls_server.enable` risponde «Failed to set property», e
     * `pm grant WRITE_SECURE_SETTINGS` è rifiutato perché è
     * signature|privileged. Quell'interruttore lo tocca solo il sistema.
     *
     * ⇒ Quello che si può fare, e che questo fa: **essere lì quando torna**.
     * Il riaggancio automatico esisteva già, ma viveva dentro la schermata
     * Controllo telefono — chiusa quella, nessuno guardava più. Qui vive nel
     * plugin, cioè quanto il processo.
     *
     * ⛔ E la chiave non si perde mai: `dumpsys adb` elenca TALOS fra le
     * `user_keys` autorizzate, e il sistema ricorda su quale Wi-Fi. Al ritorno
     * dell'interruttore non serve riappaiare — serve solo qualcuno che provi.
     *
     * ⛔ Spento di default, e la scelta è della persona: un ponte che si
     * riaggancia sempre è più vicino a «permesso acquisito» che a «capacità
     * viva», che è ciò che TALOS dichiara di essere.
     */
    private fun riagganciaSeRichiesto(causa: String) {
        // Solo quando il debug wireless TORNA: sulle altre cause non c'è niente
        // di nuovo da tentare, e ritentare a vuoto è rumore che costa batteria.
        if (causa != "debug-wireless-acceso" && causa != "rete-arrivata") return
        val voluto = context.getSharedPreferences(MEMORIA_PONTE, android.content.Context.MODE_PRIVATE)
            .getBoolean(SEMPRE_ACCESO, false)
        if (!voluto) return
        // ⛔ MAI sul thread dei plugin: il ponte fa I/O di rete. È la regola
        // che questo file ripete più volte, e vale anche qui.
        Thread {
            runCatching {
                if (TalosPonteAdb.collegato(context)) return@runCatching
                val tornato = TalosPonteAdb.riaggancia(context)
                android.util.Log.i(
                    "TalosPonte",
                    if (tornato) "mantieni-acceso: ponte ripreso dopo «$causa»"
                    else "mantieni-acceso: nessun ponte dopo «$causa»",
                )
                if (tornato) {
                    notifyListeners("talosPonteScosso", JSObject().put("causa", "riagganciato"))
                }
            }
        }.start()
    }

    /**
     * Lo switch, dal lato della persona. Il valore vive in SharedPreferences e
     * non in memoria: la vigilanza deve valere anche quando il processo è
     * appena nato e la WebView non ha ancora detto niente.
     */
    @PluginMethod
    fun ponteSempreAcceso(call: PluginCall) {
        val attivo = call.getBoolean("attivo")
        if (attivo != null) {
            context.getSharedPreferences(MEMORIA_PONTE, android.content.Context.MODE_PRIVATE)
                .edit().putBoolean(SEMPRE_ACCESO, attivo).apply()
        }
        val ora = context.getSharedPreferences(MEMORIA_PONTE, android.content.Context.MODE_PRIVATE)
            .getBoolean(SEMPRE_ACCESO, false)
        call.resolve(JSObject().put("attivo", ora))
    }

    override fun load() {
        super.load()
        // Costa un ContentObserver e un NetworkCallback: nessun polling, nessun
        // risveglio. Vive quanto il processo, come le sentinelle.
        scossa.accendi(context)
    }

    override fun handleOnDestroy() {
        scossa.spegni(context)
        super.handleOnDestroy()
    }

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
     * ⭐⭐ IL RUOLO DI ASSISTENTE: TALOS lo sa, e lo può CHIEDERE.
     *
     * Owner 2026-08-11, provando l'app sul suo telefono: «la funzione assistenza
     * è collegata all'app? tutte le impostazioni sono predisposte per settarla
     * dall'app?». La risposta era NO: si metteva solo dalle Impostazioni di
     * sistema (o da `adb`), e l'app non sapeva nemmeno di averlo.
     *
     * ⛔ E c'è di peggio, misurato: **il ruolo si azzera a ogni reinstallazione
     * dell'APK**. Nel giro di sviluppo la barra smetteva di funzionare da sola e
     * sembrava un difetto nostro. Senza questa lettura non c'era modo di dirlo.
     *
     * Due risposte separate perché sono due domande diverse:
     * - `held` — TALOS è l'assistente ADESSO;
     * - `canRequest` — il sistema ha una finestra da mostrare per chiederlo.
     *   ⛔ Su alcune ROM `isRoleAvailable` è falso pur esistendo il ruolo: in
     *   quel caso l'unica strada resta la pagina di sistema, e chi disegna la
     *   schermata deve poterlo sapere invece di offrire un pulsante morto.
     */
    /**
     * ⭐⭐⭐ I PRESET PER CHIAMARE TALOS — lo stato VERO, chiesto al telefono.
     *
     * Owner 2026-08-14: «bisogna mettere dei preset per mappare l'assistente a
     * hold pulsante Power (menu accensione si sposta a Power più volume), gesture
     * angolo sinistro o destro, o altri tasti di sistema».
     *
     * ## ⛔ Cosa un'app PUÒ davvero, e cosa no — MISURATO
     *
     * Power tenuto premuto e gesto d'angolo **non sono impostazioni nostre**:
     * chiamano l'assistente predefinito, e l'unico modo onesto di finirci dentro
     * è **prendere il ruolo**. Nessuna app si assegna un tasto di sistema, e
     * fingere il contrario sarebbe un pulsante morto.
     *
     * La scorciatoia di accessibilità — i due tasti del volume tenuti premuti, e
     * il pulsante che galleggia — è invece l'unica che un'app può occupare.
     * MISURATO sul Pad il 2026-08-14:
     * `settings get secure accessibility_shortcut_target_service` è **vuoto**:
     * la casella è libera.
     *
     * ## ⛔ E si LEGGE, non si indovina
     *
     * ⛔ `AccessibilityManager.getAccessibilityShortcutTargets` sarebbe la
     * domanda elegante, e **non esiste per noi**: compilando contro l'SDK 36 il
     * compilatore risponde `Unresolved reference` — è `@SystemApi`, riservata
     * alle app di sistema. Non è una scelta di stile: è una porta chiusa, e
     * l'ho scoperto dalla macchina invece che dedurlo.
     *
     * ⇒ Si leggono le due chiavi che il sistema scrive davvero
     * (`accessibility_shortcut_target_service` per i tasti del volume,
     * `accessibility_button_targets` per il pulsante che galleggia). Leggere le
     * impostazioni sicure è concesso a chiunque; scriverle no, e infatti non le
     * scriviamo: **l'ultimo tocco lo dà la persona**, dalla schermata di
     * sistema.
     *
     * Le chiavi della ROM (`assist_long_press_home_enabled` e le due di ColorOS)
     * viaggiano come **testo grezzo**, `null` compreso: chi disegna dice «non lo
     * so» invece di tradurre un'assenza in uno spento.
     */
    /**
     * ⭐⭐⭐ RICHIAMA L'ASSISTENTE SULLA PAGINA APPENA APERTA — rilievo #4.
     *
     * Owner: «quando dici apri Chrome, Gemini apre Chrome e l'assistente si
     * chiude. Rilanciare l'assistente con la NUOVA pagina mostrata, così la
     * conversazione continua senza ripremere il pulsante».
     *
     * ## ⛔ Perché la SESSIONE e non un'activity — misurato sul Pad il 15/8
     *
     * Le due porte sembrano una e portano dati diversi:
     *
     * | come si apre | cosa arriva |
     * | --- | --- |
     * | `startActivity` sulla barra | niente: nessuna struttura, nessun URL |
     * | `showSession` (questa) | `AssistStructure` **e** `AssistContent` |
     *
     * E `AssistContent` è il punto: Chrome ci scrive dentro l'indirizzo della
     * scheda (`setWebUri`), quindi TALOS **riceve la pagina** invece di
     * indovinarla dai pixel. In incognito Chrome non lo dà, di proposito.
     *
     * ⛔ MISURATO su questa ROM: nessun gesto di sistema passa dalla sessione —
     * il tasto assistente e la scorciatoia lanciano la nostra **activity**, e
     * lì di contesto non ne arriva. Se la sessione non la chiediamo noi, non
     * arriva mai.
     *
     * ⛔ Torna `mostrata: false` senza fingere: se il sistema non ci tiene
     * accesi come assistente, chi chiama lo dice invece di promettere un
     * contesto che non avrà.
     */
    @PluginMethod
    fun richiamaAssistente(call: PluginCall) {
        val mostrata = TalosAssistente.apriComeAssistente()
        call.resolve(
            JSObject()
                .put("mostrata", mostrata)
                .put("pagina", TalosAssistente.indirizzoPagina ?: ""),
        )
    }

    /** L'indirizzo che l'ultima sessione ha ricevuto da chi era davanti, o vuoto. */
    @PluginMethod
    fun paginaDellAssistente(call: PluginCall) {
        call.resolve(JSObject().put("pagina", TalosAssistente.indirizzoPagina ?: ""))
    }

    @PluginMethod
    fun scorciatoie(call: PluginCall) {
        val esito = JSObject()
        val mio = android.content.ComponentName(context, TalosOcchio::class.java).flattenToString()

        /*
         * ⛔ Il confronto NON è `==`: la stessa riga può essere
         * `ai.talos.dev/ai.talos.agent.TalosOcchio` o la forma corta
         * `ai.talos.dev/.agent.TalosOcchio`, e sono lo stesso servizio. Si
         * confrontano i ComponentName, che sanno di esserlo.
         *
         * ⛔ E la lista è separata da DUE PUNTI, non da virgole: è la forma di
         * `accessibility_*_targets` in AOSP.
         */
        fun ciSiamo(grezzo: String?): Boolean = (grezzo ?: "")
            .split(":")
            .any { android.content.ComponentName.unflattenFromString(it)?.flattenToString() == mio }

        esito.put("volume", ciSiamo(leggiSicura("accessibility_shortcut_target_service")))
        esito.put("bottone", ciSiamo(leggiSicura("accessibility_button_targets")))
        esito.put("servizio", mio)
        /*
         * Le chiavi di sistema, grezze. `assist_long_press_home_enabled` è di
         * Android; le altre due le definisce ColorOS e possono non esserci.
         */
        val chiavi = JSObject()
        for (chiave in listOf(
            "assist_long_press_home_enabled",
            "assistant_screen_type",
            "disable_google_asssist_power_wakeup",
        )) {
            chiavi.put(chiave, leggiSicura(chiave))
        }
        esito.put("chiavi", chiavi)
        call.resolve(esito)
    }

    /** Una lettura sola per tutte le chiavi: `null` resta `null`. */
    private fun leggiSicura(chiave: String): String? = runCatching {
        android.provider.Settings.Secure.getString(context.contentResolver, chiave)
    }.getOrNull()

    @PluginMethod
    fun assistantRole(call: PluginCall) {
        val result = JSObject()
        val gestore = context.getSystemService(android.app.role.RoleManager::class.java)
        if (gestore == null) {
            result.put("held", false)
            result.put("canRequest", false)
            result.put("reason", "no-role-manager")
            call.resolve(result)
            return
        }
        val disponibile = gestore.isRoleAvailable(android.app.role.RoleManager.ROLE_ASSISTANT)
        result.put("held", gestore.isRoleHeld(android.app.role.RoleManager.ROLE_ASSISTANT))
        result.put("canRequest", disponibile)
        if (!disponibile) result.put("reason", "role-unavailable")
        call.resolve(result)
    }

    /**
     * Chiede il ruolo con la finestra di SISTEMA — un tocco, non un viaggio.
     *
     * ⛔ `createRequestRoleIntent` è l'unica via onesta: la decisione resta al
     * sistema e alla persona, noi non possiamo assegnarci niente. Se la ROM non
     * offre la finestra si ripiega sulla pagina delle impostazioni assistente,
     * che esiste sempre — meglio due tocchi che un pulsante che non fa niente.
     *
     * ## ⛔⛔ PERCHÉ `startActivityForResult` E NON `startActivity`
     *
     * Il 2026-08-11 la finestra si apriva e si chiudeva **da sola**, sul telefono
     * ColorOS dell'owner E sul Pad OxygenOS. Avevo concluso «è la ROM cinese che
     * non offre nessun assistente». Era falso, e l'ha detto la macchina:
     *
     *     W RequestRoleActivity: Package name cannot be null or empty: null
     *     I RequestRoleFragment: … requestingPackageName=null qualifyingCount=-1
     *     D ActivityClient: activity finished by caller: … onCreate:97
     *
     * `RequestRoleActivity` legge **`getCallingPackage()`** per sapere CHI sta
     * chiedendo il ruolo, e quella è `null` per chiunque parta con
     * `startActivity`: il nome del chiamante esiste solo nella forma **con
     * request code**. Senza nome non c'è nessuno a cui dare il ruolo, e
     * l'activity si chiude in `onCreate` — muta, in meno di un fotogramma.
     *
     * La documentazione lo dice in due punti che combaciano: `createRequestRoleIntent`
     * torna «an Intent suitable for passing to **startActivityForResult()**», e
     * `getCallingPackage` è «null if the calling activity did not use the
     * **startActivityForResult** form that includes a request code».
     *
     * ⭐ E il risultato non è solo la cura del difetto: è un guadagno. Prima
     * l'app tirava a indovinare se la persona avesse detto sì (aspettava 2,5 s e
     * rileggeva il ruolo); adesso il sistema **risponde**, e `granted` dice cosa
     * è successo davvero.
     */
    @PluginMethod
    fun requestAssistantRole(call: PluginCall) {
        val gestore = context.getSystemService(android.app.role.RoleManager::class.java)
        if (gestore == null || activity == null) {
            call.reject("TALOS_ROLE_UNAVAILABLE")
            return
        }
        if (!gestore.isRoleAvailable(android.app.role.RoleManager.ROLE_ASSISTANT)) {
            /*
             * ⛔ Nessuna finestra da aspettare: la pagina delle impostazioni non
             * torna nessun esito, quindi si risponde subito e si dice che il
             * ruolo NON è stato dato. Chi legge saprà di dover rileggere al
             * rientro invece di credere a un sì che non c'è stato.
             */
            val ripiego = android.content.Intent(android.provider.Settings.ACTION_VOICE_INPUT_SETTINGS)
            val esito = JSObject()
            runCatching { activity.startActivity(ripiego) }
                .onSuccess { esito.put("opened", true) }
                .onFailure { esito.put("opened", false) }
            esito.put("shown", false)
            esito.put("granted", false)
            esito.put("reason", "role-unavailable")
            call.resolve(esito)
            return
        }
        val intent = gestore.createRequestRoleIntent(android.app.role.RoleManager.ROLE_ASSISTANT)
        try {
            quandoHoChiestoIlRuolo = android.os.SystemClock.elapsedRealtime()
            startActivityForResult(call, intent, "tornaDallaFinestraDelRuolo")
        } catch (errore: android.content.ActivityNotFoundException) {
            // ⛔ Il motivo si consegna a chi lo mostrerà: una schermata che dice
            // «non è riuscito» senza dire perché è la cosa che ci ha già
            // fregato con Shizuku.
            call.reject("TALOS_ROLE_NO_SCREEN", errore)
        }
    }

    /** Quando è partita la finestra del ruolo, per sapere se è stata LETTA. */
    private var quandoHoChiestoIlRuolo = 0L

    /**
     * L'esito della finestra di sistema, quando si richiude.
     *
     * ⛔ `granted` NON si prende da `resultCode`: si RILEGGE dal `RoleManager`.
     * Un `RESULT_OK` dice che la finestra è stata chiusa con un sì, ma è il
     * sistema a essere l'autorità su chi tiene il ruolo — ed è la stessa regola
     * che ci ha già salvato altrove: non si crede all'esito di un comando, si
     * guarda lo stato.
     *
     * ## ⛔ `shown`: la differenza fra «ho detto no» e «non ho visto niente»
     *
     * Chi chiama deve decidere se ripiegare sul ponte, e le due cose vogliono
     * risposte opposte: un rifiuto si rispetta, una finestra mai comparsa si
     * aggira. `resultCode` non li distingue — sono entrambi `RESULT_CANCELED`.
     * Li distingue il TEMPO: la finestra che si autochiudeva moriva dentro
     * `onCreate`, in decine di millisecondi (misurato: 6 ms fra l'apertura e
     * `removeAppToken`), mentre nessuna persona legge una scelta e decide in
     * meno di mezzo secondo. La soglia è quella, ed è una misura, non un gusto.
     */
    @com.getcapacitor.annotation.ActivityCallback
    fun tornaDallaFinestraDelRuolo(call: PluginCall?, risultato: androidx.activity.result.ActivityResult?) {
        if (call == null) return
        val quantoEDurata = android.os.SystemClock.elapsedRealtime() - quandoHoChiestoIlRuolo
        val gestore = context.getSystemService(android.app.role.RoleManager::class.java)
        val esito = JSObject()
        esito.put("opened", true)
        esito.put("shown", quantoEDurata >= SOGLIA_FINESTRA_LETTA_MS)
        esito.put("elapsedMs", quantoEDurata)
        esito.put("granted", gestore?.isRoleHeld(android.app.role.RoleManager.ROLE_ASSISTANT) == true)
        esito.put("resultCode", risultato?.resultCode ?: android.app.Activity.RESULT_CANCELED)
        call.resolve(esito)
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
        /*
         * ⛔ `probe` = una DOMANDA, non un atto. Chi chiede se il ponte c'e' non
         * deve pagare i sei secondi di scoperta mDNS per riagganciarlo: la
         * misura di quel costo sta su `TalosPonteAdb.shell`.
         */
        conIlPonte(esito, comando, "solo-ponte", riaggancia = call.getBoolean("probe", false) != true)
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
    private fun conIlPonte(
        esito: JSObject,
        comando: List<String>,
        motivoDiPartenza: String,
        riaggancia: Boolean = true,
    ): JSObject {
        if (!TalosPonteAdb.disponibile(context)) {
            return esito.put("ok", false).put("reason", motivoDiPartenza).put("via", "none")
        }
        val ponte = TalosPonteAdb.shell(context, comando, PROGRAMMI_AMMESSI, riagganciaSeStaccato = riaggancia)
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
        // ⛔ Si CHIEDE al ponte, non si ricorda: il Debug wireless muore al
        // riavvio, e un valore ricordato racconterebbe un telefono che non c'è
        // più.
        val collegato = presente && TalosPonteAdb.collegato(context)
        /*
         * ⭐ LA SENTINELLA DEL COLLEGAMENTO SI ACCENDE QUI, e proprio qui.
         *
         * Questo battito è l'unico posto dell'app che sa, con continuità, se il
         * ponte è su o giù — la pagina lo chiama ogni 2 s quando è giù e ogni
         * 6 s quando è su. Legare l'ascolto mDNS a questa risposta vuol dire
         * che l'indirizzo di `_adb-tls-connect._tcp` è già in mano nell'istante
         * in cui serve, e che mentre il ponte regge non si manda un pacchetto.
         *
         * MISURATO sul Pad, tre volte: riagganciarsi col censimento costa
         * **9.131 ms**, con l'indirizzo noto **3.124 ms**. Sono 6.007 ms per
         * riaggancio che questa riga toglie.
         *
         * ⛔ E si SPEGNE quando è collegato: un ascolto multicast lasciato
         * acceso per un evento che non arriva è il costo che non si presenta
         * mai come difetto.
         */
        if (presente && !collegato) TalosSentinelle.collegamento.accendi(context)
        if (collegato) TalosSentinelle.collegamento.spegni(context)
        JSObject().put("packaged", presente).put("connected", collegato)
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
        var provati = 0
        var ultimo: TalosPonteAdb.Esito? = null

        /** Prova in ordine e si ferma al primo che regge. `null` = nessuno. */
        fun prova(indirizzi: List<String>): JSObject? {
            for (indirizzo in indirizzi) {
                provati++
                val esito = azione(indirizzo)
                ultimo = esito
                if (esito.ok) {
                    return JSObject().put("ok", true).put("address", indirizzo)
                        .put("tried", provati)
                        .put("output", esito.uscita).put("error", esito.errore)
                }
            }
            return null
        }

        fun fallito() = JSObject().put("ok", false)
            .put("reason", ultimo?.motivo ?: seNessuno)
            .put("tried", provati)
            .put("output", ultimo?.uscita ?: "").put("error", ultimo?.errore ?: "")

        // 1. L'indirizzo scritto a mano scavalca tutto: su una rete che blocca
        //    il multicast l'annuncio non arriva, e un campo da compilare è
        //    meglio di un vicolo cieco.
        if (scelto != null) return@sulPonte prova(listOf(scelto)) ?: fallito()

        /*
         * 2. ⭐ QUELLO CHE LA SENTINELLA HA VISTO ARRIVARE, per primo.
         *
         * È vivo per costruzione — è comparso mentre eravamo in ascolto — e
         * prima di questa riga costava un censimento intero comunque.
         * MISURATO: 9.131 ms col censimento, 3.124 ms con l'indirizzo noto.
         */
        val subito = when (annuncio) {
            TalosPonteAdb.ANNUNCIO_COLLEGAMENTO -> TalosSentinelle.collegamento.indirizzoPronto()
            TalosPonteAdb.ANNUNCIO_ACCOPPIAMENTO -> TalosSentinelle.accoppiamento.indirizzoPronto()
            else -> null
        }
        if (subito != null) prova(listOf(subito))?.let { return@sulPonte it }

        /*
         * 3. Il censimento, e SOLO se il primo non ha chiuso.
         *
         * ⛔ Il ripiego non è un lusso: un indirizzo che la sentinella ha visto
         * mezz'ora fa può essere scaduto, e senza questo passo un riaggancio
         * fallirebbe mandando la persona a cercare un codice di cui non ha
         * bisogno. Veloce quando si può, giusto sempre.
         */
        prova(TalosPonteAdb.scopri(context, annuncio).filter { it != subito })
            ?: fallito()
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
            call.getString("working") ?: "Pairing…",
            call.getString("failed") ?: "Pairing failed. Open wireless debugging again and enter the new code.",
            call.getString("ready") ?: "Found it. Type the six digits now.",
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
            // ⭐ Prima di tutto: dirle che è partito. Il lavoro qui sotto può
            // durare fino a 36 secondi, e fino a ieri li passava in silenzio
            // assoluto — la foto dell'owner è quella.
            TalosAccoppiamentoNotifica.lavora(context)
            TalosFilaPonte.esegui {
                /*
                 * ⭐⭐⭐ L'INDIRIZZO E' GIA' IN MANO, e questo e' il taglio grosso.
                 *
                 * Owner 2026-08-09: «accoppiamento TROPPO LENTO». La lentezza
                 * NON era l'accoppiamento: era la scoperta che lo precedeva.
                 *
                 * `scopri()` costa fino a **6 secondi** e li paga sempre, perche'
                 * fa un censimento: da una fotografia sola non distingue un
                 * annuncio vivo da uno scaduto, e l'unica difesa era aspettare
                 * la finestra intera. Il commento su `scopri` lo dichiara.
                 *
                 * La sentinella e' in ascolto da quando la notifica e' comparsa:
                 * quando la persona apre «Accoppia dispositivo con codice»,
                 * l'annuncio arriva a NOI, e un annuncio che arriva mentre
                 * guardiamo e' vivo per costruzione. Quando il codice viene
                 * scritto, l'indirizzo e' li' da secondi.
                 *
                 * ⛔ Il ripiego resta, e non e' pigrizia: su una rete che blocca
                 * il multicast l'annuncio non arriva MAI. Senza `scopri` di
                 * scorta, quella persona non avrebbe piu' nessuna strada — e la
                 * strada lenta e' comunque meglio di nessuna strada.
                 */
                val subito = TalosSentinelle.accoppiamento.indirizzoPronto()
                val indirizzi = if (subito != null) {
                    listOf(subito)
                } else {
                    TalosPonteAdb.scopri(context, TalosPonteAdb.ANNUNCIO_ACCOPPIAMENTO)
                }
                var riuscito = false
                // ⛔ Il motivo si TIENE. Un fallimento senza motivo manda la
                // persona a ripetere lo stesso gesto: non ha modo di sapere se
                // ha sbagliato il codice, se l'annuncio non è arrivato, o se il
                // telefono ha chiuso la porta mentre lei scriveva.
                var motivo: String? = if (indirizzi.isEmpty()) "pairing-not-announced" else null
                for (indirizzo in indirizzi) {
                    val paio = TalosPonteAdb.accoppia(context, indirizzo, codice)
                    if (!paio.ok) { motivo = paio.motivo ?: "pair-refused"; continue }
                    val collegato = TalosPonteAdb.scopri(
                        context,
                        TalosPonteAdb.ANNUNCIO_COLLEGAMENTO,
                    ).firstOrNull { TalosPonteAdb.collega(context, it).ok }
                    riuscito = collegato != null
                    if (!riuscito) motivo = "connect-refused"
                    break
                }
                if (riuscito) {
                    TalosSentinelle.accoppiamento.spegni(context)
                    TalosAccoppiamentoNotifica.chiudi(context)
                } else {
                    // Il campo torna, col motivo accanto: la porta è cambiata e
                    // il codice è un altro, quindi la cosa utile è poterlo
                    // riscrivere qui invece di rifare tutto il giro.
                    TalosAccoppiamentoNotifica.riprova(context, motivo)
                }
                notifyListeners(
                    "talosPonteChanged",
                    JSObject().put("connected", riuscito).put("reason", motivo),
                )
            }
        }
        /*
         * ⭐ La sentinella parte INSIEME alla notifica, non quando serve.
         *
         * Deve essere gia' in ascolto nel momento in cui la persona apre
         * «Accoppia dispositivo con codice», perche' e' l'ARRIVO dell'annuncio a
         * dire che quello e' vivo. Accenderla dopo vorrebbe dire tornare a fare
         * una fotografia, cioe' tornare ai sei secondi.
         *
         * ⛔ E solo se la notifica c'e' davvero: `mostrata` e' falsa quando i
         * permessi di notifica mancano, e una sentinella accesa per una notifica
         * che nessuno vedra' e' solo traffico multicast a fondo perduto.
         */
        if (mostrata) {
            TalosSentinelle.accoppiamento.accendi(context) {
                // Non serve l'indirizzo qui: la sentinella lo tiene. Serve dire
                // alla persona che il momento e' ADESSO.
                TalosAccoppiamentoNotifica.pronta(context)
                notifyListeners("talosPonteAnnuncio", JSObject().put("ready", true))
            }
        }
        call.resolve(JSObject().put("shown", mostrata))
    }

    /** Toglie la notifica dell'accoppiamento. */
    @PluginMethod
    fun pairNotificationClose(call: PluginCall) {
        // ⛔ Sempre e comunque: una scoperta mDNS lasciata accesa manda pacchetti
        // finche' il processo vive, e non si presenta mai come difetto.
        TalosSentinelle.accoppiamento.spegni(context)
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
        /** Dove vive lo switch «mantieni acceso»: SharedPreferences e non
         *  memoria — deve valere anche a processo appena nato, prima che la
         *  WebView abbia detto qualcosa. */
        const val MEMORIA_PONTE = "talos-ponte"
        const val SEMPRE_ACCESO = "sempre-acceso"

        /**
         * I programmi che il ponte accetta di lanciare: cinque nomi, tutti di
         * Android, tutti con una superficie che sappiamo descrivere.
         */
        val PROGRAMMI_AMMESSI = setOf("cmd", "settings", "dumpsys", "pm", "am")

        /**
         * Sotto questa durata la finestra del ruolo NON è stata letta da
         * nessuno: si è chiusa da sola. Misurato l'11 agosto 2026 sul Pad —
         * fra l'apertura di `RequestRoleActivity` e il suo `removeAppToken`
         * passavano **6 ms**, e nel mezzo `finish()` dentro `onCreate`.
         */
        const val SOGLIA_FINESTRA_LETTA_MS = 500L
    }
}
