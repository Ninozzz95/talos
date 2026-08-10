package ai.talos.agent

import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.StatFs
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.AlarmClock
import android.provider.Settings
import android.view.KeyEvent
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * ⭐ Le capacità che costano ZERO a chi usa TALOS.
 *
 * Nessun dialogo, nessun viaggio nelle impostazioni, ogni telefono. Sono undici,
 * e messe insieme coprono quasi tutto ciò che Gemini fa **senza** essere
 * l'assistente predefinito.
 *
 * ## ⛔ Il regime, che è la cosa che conta
 *
 * Tutto qui dentro **chiede** — un intent, un'API pubblica — oppure **legge**.
 * Niente indovina. Il 43% di riuscita dell'automazione UI è il soffitto di chi
 * deduce dai pixel dove sia un pulsante, e non è un limite fisico: è la misura
 * di un metodo che qui non si usa. Un intent non ha una percentuale di
 * riuscita — o la schermata esiste, o non esiste, e in quel caso lo si dice.
 *
 * ## Perché ogni metodo dice cosa è successo DAVVERO
 *
 * Un tablet senza vibratore, un telefono senza torcia, un'app non installata,
 * una schermata di impostazioni che questo produttore non espone: sono **esiti
 * previsti**, non guasti. Rispondere «fatto» quando non è successo niente è la
 * bugia più facile da raccontare e la più difficile da scoprire — e insegna a
 * non fidarsi di tutti gli altri tool.
 *
 * ⇒ Ogni metodo torna un booleano di esito **e il motivo**, e chi chiama lo
 * riporta invece di nasconderlo.
 */
@CapacitorPlugin(name = "TalosDevice")
class TalosDevicePlugin : Plugin() {

    /** Oltre, non è un segnale ma un fastidio. */
    private val MAX_VIBRATE_MS = 2_000L

    // ─────────────────────────────────────────────── vibrazione

    private fun vibratore(): Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    /**
     * ⛔ `hasVibrator` PRIMA di provare: su un dispositivo senza motore la
     * chiamata non fallisce, semplicemente non fa niente.
     */
    @PluginMethod
    fun vibrate(call: PluginCall) {
        val chiesti = (call.getInt("milliseconds") ?: 200).toLong()
        // Si tronca invece di rifiutare: chi chiede dieci secondi vuole «un
        // segnale forte», non un errore — e il tetto lo dice nella risposta.
        val durata = chiesti.coerceIn(1L, MAX_VIBRATE_MS)
        val v = vibratore()
        val result = JSObject()
        result.put("requestedMs", chiesti)
        result.put("appliedMs", durata)
        if (v == null || !v.hasVibrator()) {
            result.put("done", false)
            result.put("reason", "no-vibrator")
            call.resolve(result)
            return
        }
        val esito = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(durata, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") v.vibrate(durata)
            }
        }
        result.put("done", esito.isSuccess)
        if (esito.isFailure) result.put("reason", "refused")
        call.resolve(result)
    }

    // ─────────────────────────────────────────────── torcia

    /**
     * ⭐ La torcia NON chiede la fotocamera.
     *
     * `setTorchMode` esiste da Android 6 apposta: accendere il LED non è
     * riprendere, e Android lo riconosce. Chiedere `CAMERA` per una torcia
     * sarebbe domandare alla persona molto più di quanto serve — il difetto
     * che rende le app sospette.
     */
    @PluginMethod
    fun torch(call: PluginCall) {
        val acceso = call.getBoolean("on", true) == true
        val cm = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
        val result = JSObject()
        result.put("on", acceso)
        if (cm == null) {
            result.put("done", false)
            result.put("reason", "no-camera-service")
            call.resolve(result)
            return
        }
        // La prima fotocamera che dichiara di avere un flash: su un telefono è
        // la posteriore, e cercarla invece di assumerla evita il caso — reale —
        // dei dispositivi dove la 0 e' la frontale e non ce l'ha.
        val id = runCatching {
            cm.cameraIdList.firstOrNull { camera ->
                cm.getCameraCharacteristics(camera)
                    .get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
        }.getOrNull()
        if (id == null) {
            result.put("done", false)
            result.put("reason", "no-torch")
            call.resolve(result)
            return
        }
        val esito = runCatching { cm.setTorchMode(id, acceso) }
        result.put("done", esito.isSuccess)
        if (esito.isFailure) result.put("reason", "refused")
        call.resolve(result)
    }

    // ─────────────────────────────────────────────── volume

    /**
     * Il volume di un flusso, in percentuale.
     *
     * ⛔ In percentuale e non in «tacche»: i passi cambiano da telefono a
     * telefono — quindici su uno, sette su un altro — e un numero assoluto
     * significherebbe cose diverse su dispositivi diversi. La percentuale è
     * l'unica unità che vuol dire la stessa cosa ovunque.
     */
    @PluginMethod
    fun volume(call: PluginCall) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val result = JSObject()
        if (am == null) {
            result.put("done", false)
            result.put("reason", "no-audio-service")
            call.resolve(result)
            return
        }
        val flusso = when (call.getString("stream")) {
            "ring" -> AudioManager.STREAM_RING
            "alarm" -> AudioManager.STREAM_ALARM
            "notification" -> AudioManager.STREAM_NOTIFICATION
            else -> AudioManager.STREAM_MUSIC
        }
        val massimo = am.getStreamMaxVolume(flusso)
        val percento = call.getInt("percent")
        if (percento == null) {
            // Senza percentuale è una LETTURA: «quanto è alto adesso».
            result.put("done", true)
            result.put("percent", if (massimo > 0) am.getStreamVolume(flusso) * 100 / massimo else 0)
            call.resolve(result)
            return
        }
        val voluto = percento.coerceIn(0, 100) * massimo / 100
        val esito = runCatching { am.setStreamVolume(flusso, voluto, 0) }
        result.put("done", esito.isSuccess)
        result.put("percent", if (massimo > 0) voluto * 100 / massimo else 0)
        if (esito.isFailure) {
            // ⛔ Su Android moderno alzare la suoneria da zero tocca il «non
            // disturbare», che e' un permesso speciale. Dirlo per nome invece
            // di un fallimento muto e' cio' che permette di offrire il passo.
            result.put("reason", "needs-dnd-access")
        }
        call.resolve(result)
    }

    // ─────────────────────────────────────────────── sveglia e timer

    /**
     * ⭐ La sveglia la crea l'app orologio, non noi.
     *
     * È deliberato: un intent verso l'app che possiede le sveglie fa comparire
     * la sveglia **dove la persona la cerca**, con la sua interfaccia e le sue
     * regole. Una sveglia nostra sarebbe una sveglia che non suona se qualcuno
     * disinstalla TALOS, e nessuno se lo aspetterebbe.
     */
    @PluginMethod
    fun alarm(call: PluginCall) {
        val timer = call.getInt("seconds")
        val intent = if (timer != null) {
            Intent(AlarmClock.ACTION_SET_TIMER)
                .putExtra(AlarmClock.EXTRA_LENGTH, timer)
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        } else {
            Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, call.getInt("hour") ?: 7)
                .putExtra(AlarmClock.EXTRA_MINUTES, call.getInt("minute") ?: 0)
                // ⛔ Senza SKIP_UI si apre l'app e la persona deve confermare.
                // Con, la sveglia c'e' e basta. Chi l'ha chiesta a voce non
                // vuole poi toccare lo schermo.
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        }
        call.getString("label")?.let { intent.putExtra(AlarmClock.EXTRA_MESSAGE, it) }
        call.resolve(avvia(intent))
    }

    // ─────────────────────────────────────────────── aprire

    /** Apre un'app per nome di pacchetto, o dice che non c'è. */
    @PluginMethod
    fun openApp(call: PluginCall) {
        val pacchetto = call.getString("package").orEmpty()
        val result = JSObject()
        if (pacchetto.isEmpty()) {
            result.put("done", false)
            result.put("reason", "no-package")
            call.resolve(result)
            return
        }
        val intent = context.packageManager.getLaunchIntentForPackage(pacchetto)
        if (intent == null) {
            // ⛔ «Non installata» e «non si apre» sono cose diverse, e chi legge
            // deve poter distinguere «installala» da «qualcosa non va».
            result.put("done", false)
            result.put("reason", "not-installed")
            call.resolve(result)
            return
        }
        call.resolve(avvia(intent))
    }

    /**
     * ⭐⭐ LE APP AVVIABILI COL NOME CHE LA PERSONA LEGGE.
     *
     * ## ⛔ Il difetto, trovato incrociando i provider
     *
     * L'elenco passava dal ponte (`cmd package query-activities`) e restituiva
     * **solo nomi di pacchetto**. Il modello doveva sapere a memoria che
     * Telegram X si chiama `org.thunderdog.challegram`.
     *
     * MISURATO sul Pad il 2026-08-10, stesso telefono, stessa domanda
     * «Apri Telegram», tre provider:
     *
     * ```
     *   anthropic/claude-sonnet-5   «Non ho trovato Telegram»          ⛔ SBAGLIATO
     *   openai/gpt-5.6              «Non trovo Telegram»               ⛔ SBAGLIATO
     *   google/gemini-3.6-flash     apre org.thunderdog.challegram     ✅
     * ```
     *
     * Telegram X **era installato**. Due modelli su tre hanno risposto che non
     * c'era, e non per pigrizia: dei 65 pacchetti avviabili molti non dicono
     * cosa sono — `cn.wps.moffice_eng`, `com.wispr.flowapp`,
     * `com.binary.hyperdroid`, `andes.oplus.documentsreader`. Dare al modello
     * un id opaco e pretendere che ne conosca la mappa è chiedergli di
     * indovinare, e chi indovina sbaglia una volta su tre.
     *
     * ## ⭐ E non serve nessun privilegio
     *
     * `<queries>` per MAIN/LAUNCHER è già dichiarato nel manifest, quindi
     * `queryIntentActivities` vede esattamente le app che «apri un'app» sa
     * aprire, e `loadLabel` dà il nome vero. Niente shell, niente ponte: questo
     * elenco funziona anche su un telefono dove il ponte non si accenderà mai.
     *
     * Formato: una riga per app, `Etichetta<TAB>pacchetto`, ordinate per
     * etichetta. Il tool filtra sulla riga intera, quindi cercare «telegram»
     * trova un pacchetto che quella parola non la contiene.
     */
    @PluginMethod
    fun listApps(call: PluginCall) {
        val pm = context.packageManager
        val intento = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val result = JSObject()
        try {
            val righe = pm.queryIntentActivities(intento, 0)
                .asSequence()
                .mapNotNull { info ->
                    val pacchetto = info.activityInfo?.packageName ?: return@mapNotNull null
                    val etichetta = info.loadLabel(pm).toString().trim()
                    // ⛔ Un'app con due icone comparirebbe due volte: si tiene
                    // il pacchetto una volta sola, e sarebbe rumore altrimenti.
                    pacchetto to (if (etichetta.isEmpty()) pacchetto else etichetta)
                }
                .distinctBy { it.first }
                .sortedBy { it.second.lowercase() }
                .map { "${it.second}\t${it.first}" }
                .toList()
            result.put("done", true)
            result.put("output", righe.joinToString("\n"))
            result.put("count", righe.size)
        }
        catch (e: Exception) {
            // ⛔ Si DICE che non si è potuto leggere, invece di restituire un
            // elenco vuoto che il modello riferirebbe come «nessuna app».
            result.put("done", false)
            result.put("reason", e.javaClass.simpleName)
        }
        call.resolve(result)
    }

    /**
     * ⭐ IL RIPIEGO UNIVERSALE: portare la persona dove la cosa si fa a mano.
     *
     * È il metodo che rende ogni «non posso» ancora utile. Quando una capacità
     * non c'è — perché serve un permesso, perché il produttore blocca, perché
     * Android non la espone alle app — la risposta giusta non è «non posso»: è
     * aprire la schermata esatta e dire cosa toccare.
     *
     * Nessun'altra app assistente lo fa: Gemini dice «non posso farlo» e ti
     * lascia lì.
     */
    @PluginMethod
    fun openSettingsScreen(call: PluginCall) {
        val azione = call.getString("action").orEmpty()
        val result = JSObject()
        if (azione.isEmpty()) {
            result.put("done", false)
            result.put("reason", "no-action")
            call.resolve(result)
            return
        }
        // Alcune schermate vogliono sapere DI CHI parlano — i permessi
        // speciali, per esempio — e senza il pacchetto aprono l'elenco di
        // tutte le app invece della nostra riga.
        val perQuestaApp = call.getBoolean("forThisApp", false) == true
        val dato = Uri.fromParts("package", context.packageName, null)
        // ⛔ `chiedendoPrima = false`: queste sono schermate di SISTEMA, e
        // chiedere chi risponde a un intent di sistema ottiene «non te lo dico»
        // dal filtro di visibilita' dei pacchetti — non «non esiste». Il perche'
        // per esteso sta su `avvia`, insieme alla misura che l'ha smascherato.
        val primo = avvia(
            Intent(azione).also { if (perQuestaApp) it.data = dato },
            chiedendoPrima = false,
        )
        if (primo.optBoolean("done", false)) {
            primo.put("scope", if (perQuestaApp) "app" else "general")
            call.resolve(primo)
            return
        }
        /*
         * ⛔⛔ IL RIPIEGO NELL'ALTRO VERSO — ed è il difetto del 2026-08-10.
         *
         * Owner, dal telefono: «Il telefono non offre questa schermata, quindi
         * non posso abilitare l'accesso alle notifiche da qui». La schermata
         * c'era. A romperla era il DATO `package:`, che il modello chiede in
         * buona fede — glielo dice la descrizione dello strumento, «mettilo
         * quando la schermata riguarda TALOS», e l'accesso alle notifiche
         * riguarda TALOS.
         *
         * MISURATO su questo telefono, sette schermate, nei due versi:
         *
         * | schermata                              | con `package:` | senza |
         * |----------------------------------------|----------------|-------|
         * | ACTION_NOTIFICATION_LISTENER_SETTINGS  | **no**         | sì    |
         * | NOTIFICATION_POLICY_ACCESS_SETTINGS    | **no**         | sì    |
         * | WIFI_SETTINGS                          | **no**         | sì    |
         * | action.MANAGE_WRITE_SETTINGS           | sì             | sì    |
         * | USAGE_ACCESS_SETTINGS                  | sì             | sì    |
         * | action.MANAGE_OVERLAY_PERMISSION       | sì             | sì    |
         * | APPLICATION_DETAILS_SETTINGS           | sì             | **no**|
         *
         * ⇒ Dal NOME non si capisce, e l'ultima riga dimostra che serve anche
         * il verso opposto: quella pagina, senza il dato, non si apre. Quindi
         * non si indovina e non si scrive una tabella che invecchia con la
         * prossima ROM: si PROVA, e se la prima forma non si apre si prova
         * l'altra. Un elenco generale aperto vale infinitamente più di un «non
         * si può», purche' si dica QUALE si e' aperto — ed e' `scope`.
         */
        val secondo = avvia(
            Intent(azione).also { if (!perQuestaApp) it.data = dato },
            chiedendoPrima = false,
        )
        if (secondo.optBoolean("done", false)) {
            secondo.put("scope", if (perQuestaApp) "general" else "app")
        }
        call.resolve(secondo)
    }

    /** Prepara una ricerca, una chiamata, un SMS. La persona conferma. */
    @PluginMethod
    fun compose(call: PluginCall) {
        val tipo = call.getString("kind").orEmpty()
        val valore = call.getString("value").orEmpty()
        val intent = when (tipo) {
            // ⛔ ACTION_DIAL e non ACTION_CALL: comporre il numero e lasciare
            // che sia la persona a premere «chiama». Chiamare per conto suo
            // vorrebbe il permesso del telefono e, soprattutto, sarebbe una
            // telefonata che non ha deciso lei.
            "call" -> {
                val numero = numeroPerTelefono(valore)
                if (numero == null) {
                    call.resolve(JSObject().put("done", false).put("reason", "not-a-number"))
                    return
                }
                Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", numero, null))
            }
            "sms" -> {
                val numero = numeroPerTelefono(valore)
                if (numero == null) {
                    call.resolve(JSObject().put("done", false).put("reason", "not-a-number"))
                    return
                }
                Intent(Intent.ACTION_SENDTO, Uri.fromParts("smsto", numero, null))
                    .putExtra("sms_body", call.getString("text").orEmpty())
            }
            "share" -> Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .putExtra(Intent.EXTRA_TEXT, valore)
                .let { Intent.createChooser(it, null) }
            "search" -> Intent(Intent.ACTION_WEB_SEARCH)
                .putExtra(SearchManager.QUERY, valore)
            "url" -> Intent(Intent.ACTION_VIEW, Uri.parse(valore))
            else -> {
                val result = JSObject()
                result.put("done", false)
                result.put("reason", "unknown-kind")
                call.resolve(result)
                return
            }
        }
        call.resolve(avvia(intent))
    }

    // ─────────────────────────────────────────────── stato

    /**
     * Come sta il telefono adesso. Sola lettura, nessun permesso.
     *
     * ⛔ Niente identificatori: né IMEI, né numero di serie, né rete alla quale
     * si è connessi per nome. È lo stato che serve a rispondere «quanta
     * batteria ho», non una carta d'identità del dispositivo — e la differenza
     * fra le due è ciò che separa una funzione utile da una raccolta di dati.
     */
    @PluginMethod
    fun status(call: PluginCall) {
        val result = JSObject()

        /*
         * ⭐ CHE TELEFONO SEI. Owner 2026-08-10, dallo screenshot: TALOS
         * rispondeva «non ho accesso al nome commerciale o al modello di marca
         * del tuo telefono (per motivi di privacy…)». Non era vero, ed era una
         * privacy che nessuno aveva chiesto: erano dati che il telefono dà a
         * chiunque, e senza i quali TALOS non può nemmeno dire se un modello
         * locale ci gira.
         *
         * ⛔ `Build.MODEL` da solo NON basta: qui vale `OPD2415`, che non è il
         * nome che la persona conosce. Il nome vero sta in
         * `Settings.Global.DEVICE_NAME` — API PUBBLICA, misurata su questo
         * telefono: «OnePlus Pad 3». Il codice resta accanto, perché è quello
         * che serve per cercare le specifiche.
         */
        result.put("manufacturer", Build.MANUFACTURER)
        result.put("model", Build.MODEL)
        result.put("androidVersion", Build.VERSION.RELEASE)
        runCatching {
            Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)
        }.getOrNull()?.takeIf { it.isNotBlank() }?.let { result.put("deviceName", it) }

        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
        bm?.let {
            result.put("batteryPercent", it.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
            result.put("charging", it.isCharging)
        }

        runCatching {
            val stat = StatFs(Environment.getDataDirectory().path)
            result.put("freeStorageBytes", stat.availableBytes)
            result.put("totalStorageBytes", stat.totalBytes)
        }

        runCatching {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val info = android.app.ActivityManager.MemoryInfo()
            am.getMemoryInfo(info)
            result.put("freeMemoryBytes", info.availMem)
            result.put("totalMemoryBytes", info.totalMem)
            result.put("lowMemory", info.lowMemory)
        }

        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        result.put("ringerMode", when (audio?.ringerMode) {
            AudioManager.RINGER_MODE_SILENT -> "silent"
            AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
            AudioManager.RINGER_MODE_NORMAL -> "normal"
            else -> "unknown"
        })

        // Il TIPO di rete, non quale: «wifi» risponde a «sto consumando dati?»,
        // il nome della rete no e sarebbe un dato in più senza una domanda.
        runCatching {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE)
                as android.net.ConnectivityManager
            val caps = cm.getNetworkCapabilities(cm.activeNetwork)
            result.put("network", when {
                caps == null -> "none"
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                else -> "other"
            })
        }

        call.resolve(result)
    }

    // ─────────────────────────────────────────────── il pezzo comune

    /**
     * Avvia un intent e dice cosa è successo.
     *
     * ⛔ `ActivityNotFoundException` non è un guasto: è un produttore che non
     * espone quella schermata, o un telefono senza quell'app. Distinguerlo da
     * un errore vero è ciò che permette di dire «su questo telefono non c'è»
     * invece di «qualcosa è andato storto».
     */
    /**
     * ⛔ `FLAG_ACTIVITY_CLEAR_TOP` non è ornamento: senza, la SECONDA volta non
     * succede niente.
     *
     * Difetto dell'owner, 2026-08-08: «ho provato a far digitare un numero,
     * prima funzionava, adesso no, è altalenante». Riprodotto in due comandi:
     *
     * ```
     * am start -a android.intent.action.DIAL -d tel:3331234567   → Starting
     * am start -a android.intent.action.DIAL -d tel:+39…         → Warning:
     *     Activity not started, intent has been delivered to currently
     *     running top-most instance.
     * ```
     *
     * Col solo `NEW_TASK`, se l'app telefono è **già aperta** Android consegna
     * l'intent all'istanza viva invece di riavviarla — e quella, a seconda di
     * come è scritta, il numero nuovo non lo guarda nemmeno. Da fuori sembra
     * capriccio: la prima volta funziona, la seconda no. Non è capriccio, è lo
     * stato in cui si trovava il telefono.
     *
     * `CLEAR_TOP` insieme a `NEW_TASK` porta l'attività in cima **con il nuovo
     * intent**, ed è ciò che rende il gesto ripetibile: «componi QUESTO
     * numero» deve valere anche la decima volta di fila.
     */
    /**
     * @param chiedendoPrima se domandare al sistema chi risponde all'intent.
     *   ⛔ Va messo a `false` per le schermate di **sistema**: il perché è
     *   scritto per esteso qui sotto, ed è un difetto che abbiamo pagato.
     */
    private fun avvia(intent: Intent, chiedendoPrima: Boolean = true): JSObject {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val result = JSObject()
        /*
         * ⛔⛔ «Il telefono non offre una schermata compatibile» — DETTO DI UNA
         * SCHERMATA CHE C'ERA.
         *
         * ## Il difetto, visto dall'owner il 2026-08-09
         *
         * Alla domanda «apri le impostazioni per l'accesso alle notifiche»,
         * TALOS rispondeva: «Il telefono non offre una schermata compatibile.
         * Non posso quindi leggerle direttamente.» Misurato sul Pad un minuto
         * dopo:
         *
         *     cmd package resolve-activity -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
         *     name=com.android.settings.Settings$NotificationAccessSettingsActivity
         *     enabled=true exported=true
         *
         * La schermata c'era, accesa ed esportata.
         *
         * ## Perché `resolveActivity` diceva di no
         *
         * Dal filtro di **visibilità dei pacchetti** di Android 11: un'app vede
         * solo ciò che ha dichiarato in `<queries>`. Le nostre dichiarano il
         * telefono, l'SMS, la condivisione — non le decine di schermate di
         * sistema.
         *
         * ⇒ `resolveActivity` non rispondeva «non esiste». Rispondeva **«non te
         * lo dico»**, e noi lo traducevamo in «non esiste», e il modello lo
         * traduceva in «il tuo telefono non ce l'ha». Tre traduzioni, e alla
         * fine una persona convinta di avere un telefono limitato.
         *
         * ## Perché la guardia resta, ma non qui
         *
         * Era stata messa per una ragione vera: `startActivity` verso un'app
         * disabilitata a volte non lancia e non fa niente, e allora si
         * direbbe «fatto» a vuoto. Vale per le app di terzi.
         *
         * Per le schermate di sistema no: il filtro **impedisce di
         * interrogarle, non di avviarle**. Lì l'unico giudice onesto è provare
         * e guardare l'eccezione.
         */
        if (chiedendoPrima && intent.resolveActivity(context.packageManager) == null) {
            result.put("done", false)
            result.put("reason", "not-available-here")
            return result
        }
        try {
            context.startActivity(intent)
            result.put("done", true)
        } catch (mancante: ActivityNotFoundException) {
            result.put("done", false)
            result.put("reason", "not-available-here")
        } catch (altro: Exception) {
            result.put("done", false)
            result.put("reason", "refused")
        }
        return result
    }

    /**
     * Il numero come lo scrive un MODELLO, ridotto a quello che `tel:` accetta.
     *
     * ## Perché serve, e perché è l'altra metà dello stesso difetto
     *
     * `Uri.parse("tel:$valore")` prende la stringa così com'è. Ma un modello
     * scrive `+39 333 123 4567` una volta e `3331234567` un'altra, a seconda di
     * come gliel'ha detto la persona — e negli URI:
     *
     * - gli **spazi** non sono ammessi e rompono l'analisi;
     * - il **cancelletto** apre il frammento, quindi `*111#` diventa `*111` e
     *   il codice non è più quello.
     *
     * Si tengono le cifre, il `+` iniziale, e `*` `#` `,` `;` che nella
     * telefonia significano qualcosa (codici brevi, pause). Tutto il resto —
     * spazi, trattini, parentesi, punti — è ornamento umano e si toglie.
     *
     * `Uri.fromParts` invece di `parse`: costruisce l'URI dai pezzi e codifica
     * lui ciò che va codificato, che è esattamente la parte che sbagliavamo.
     */
    private fun numeroPerTelefono(grezzo: String): String? {
        val pulito = buildString {
            for ((indice, carattere) in grezzo.trim().withIndex()) {
                when {
                    carattere.isDigit() -> append(carattere)
                    carattere == '+' && indice == 0 -> append(carattere)
                    carattere in "*#,;" -> append(carattere)
                }
            }
        }
        // Un numero senza nemmeno una cifra non è un numero: meglio dirlo che
        // aprire il telefono su niente.
        return if (pulito.any { it.isDigit() }) pulito else null
    }
    // ─────────────────────────────────────────────── sfondo

    /**
     * ⭐ Lo sfondo. TALOS disegna un'immagine e te la mette sul telefono.
     *
     * ⛔ I byte arrivano da JavaScript in base64 e non da un percorso: un
     * percorso vorrebbe dire che questo metodo legge un file scelto dal
     * modello, cioe' un tool che apre qualunque file del dispositivo travestito
     * da «cambia sfondo». I byte li sceglie chi chiama, dentro la Libreria
     * cifrata, sotto le stesse regole di lettura di tutti gli altri.
     *
     * `SET_WALLPAPER` e' un permesso di installazione: non c'e' nessun dialogo
     * da mostrare e nessun viaggio nelle impostazioni.
     *
     * `where`: `home`, `lock` o `both`. Su Android 7 e oltre le due superfici
     * sono distinte; sotto, `setBitmap` le cambia entrambe e lo diciamo invece
     * di far finta di aver ubbidito.
     */
    @PluginMethod
    fun wallpaper(call: PluginCall) {
        val result = JSObject()
        val base64 = call.getString("imageBase64")
        if (base64.isNullOrBlank()) {
            result.put("done", false)
            result.put("reason", "no-image")
            call.resolve(result)
            return
        }

        val bitmap = runCatching {
            val byte = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
            android.graphics.BitmapFactory.decodeByteArray(byte, 0, byte.size)
        }.getOrNull()
        if (bitmap == null) {
            result.put("done", false)
            result.put("reason", "not-an-image")
            call.resolve(result)
            return
        }

        val manager = android.app.WallpaperManager.getInstance(context)
        // ⛔ Alcuni produttori disattivano il cambio sfondo da app. Chiederlo
        // PRIMA evita un'eccezione raccontata come «rifiutato», che manderebbe
        // il modello a riprovare una cosa che non puo' riuscire mai.
        if (!manager.isWallpaperSupported || !manager.isSetWallpaperAllowed) {
            result.put("done", false)
            result.put("reason", "wallpaper-not-allowed")
            call.resolve(result)
            return
        }

        val dove = call.getString("where") ?: "home"
        val esito = runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val quale = when (dove) {
                    "lock" -> android.app.WallpaperManager.FLAG_LOCK
                    "both" -> android.app.WallpaperManager.FLAG_SYSTEM or
                        android.app.WallpaperManager.FLAG_LOCK
                    else -> android.app.WallpaperManager.FLAG_SYSTEM
                }
                manager.setBitmap(bitmap, null, true, quale)
            } else {
                @Suppress("DEPRECATION")
                manager.setBitmap(bitmap)
                0
            }
        }
        result.put("done", esito.isSuccess)
        result.put("appliedTo", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) dove else "both")
        if (esito.isFailure) result.put("reason", "refused")
        call.resolve(result)
    }

    // ─────────────────────────────────────────────── schermo sveglio

    /**
     * ⭐ Tenere acceso lo schermo mentre si segue qualcosa: una ricetta con le
     * mani sporche, delle indicazioni, una procedura.
     *
     * ## ⛔ Perche' il flag della finestra e NON un `WakeLock`
     *
     * `WAKE_LOCK` e' un permesso che avremmo gratis, ma un wake lock che
     * qualcuno dimentica di rilasciare **tiene acceso lo schermo per sempre** e
     * la persona se ne accorge dalla batteria, cioe' troppo tardi, senza avere
     * idea di chi sia stato. `FLAG_KEEP_SCREEN_ON` non ha quel modo di
     * fallire: vive attaccato alla finestra e muore con lei — quando TALOS va
     * in secondo piano o viene chiuso, lo schermo torna a spegnersi da solo.
     *
     * E' esattamente la disciplina del controllo del telefono deciso qui: una
     * capacita' VIVA finche' serve, che non sopravvive a chi l'ha chiesta.
     */
    @PluginMethod
    fun keepAwake(call: PluginCall) {
        val result = JSObject()
        val voluto = call.getBoolean("on") ?: true
        val finestra = activity?.window
        if (finestra == null) {
            result.put("done", false)
            result.put("reason", "no-window")
            call.resolve(result)
            return
        }
        activity.runOnUiThread {
            if (voluto) {
                finestra.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                finestra.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        result.put("done", true)
        result.put("on", voluto)
        call.resolve(result)
    }

    // ─────────────────────────────────────────────── media

    /**
     * ⭐⭐ IL CONTROLLO MEDIA NON COSTA NIENTE ALLA PERSONA — e non serve il ponte.
     *
     * `AudioManager.dispatchMediaKeyEvent` è la stessa porta da cui entrano i
     * telecomandi Bluetooth e le cuffie col tasto: non chiede permessi, non
     * chiede di essere l'assistente predefinito. ⇒ Su questa riga Gemini pretende
     * che l'app Google sia l'assistente del telefono; noi non pretendiamo niente.
     *
     * ## ⛔⛔ E QUI SI APPLICA LA LEZIONE DEL 2026-08-09
     *
     * `dispatchMediaKeyEvent` torna **void**. Se non c'è nessuna sessione media
     * attiva, il tasto va nel vuoto — e non fallisce. È **esattamente** la forma
     * del difetto di stanotte, dove `cancelNotification` con una chiave
     * sconosciuta non faceva niente e riferiva successo.
     *
     * ⇒ Due presidi, e nessuno dei due è facoltativo:
     *
     * 1. **Prima**: per mettere in pausa, fermare o cambiare traccia serve che
     *    stia suonando qualcosa. Se non suona niente si risponde
     *    `nothing-playing`, che è una risposta vera e utile — non un «fatto».
     * 2. **Dopo**: si riguarda `isMusicActive` e si riferisce lo stato REALE.
     *    Se la pausa non ha morso, chi legge lo viene a sapere da noi.
     *
     * `isMusicActive` non chiede permessi: chiede al servizio audio se qualcosa
     * sta uscendo dagli altoparlanti, ed è la sola verifica che si può fare
     * senza pretendere dalla persona l'accesso alle notifiche.
     *
     * ⛔ Il cambio traccia NON è verificabile così: `avanti` lascia la musica
     * attiva esattamente come prima. Si riferisce `playing` e la descrizione
     * dello strumento dice al modello di non promettere quale brano è partito.
     */
    @PluginMethod
    fun media(call: PluginCall) {
        val azione = call.getString("action").orEmpty()
        val codice = when (azione) {
            "play_pause" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
            "play" -> KeyEvent.KEYCODE_MEDIA_PLAY
            "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
            "next" -> KeyEvent.KEYCODE_MEDIA_NEXT
            "previous" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
            "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
            else -> null
        }
        if (codice == null) {
            call.resolve(JSObject().put("done", false).put("reason", "unknown-action"))
            return
        }
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (audio == null) {
            call.resolve(JSObject().put("done", false).put("reason", "no-audio-service"))
            return
        }

        val suonavaPrima = audio.isMusicActive
        // ⛔ Presidio 1: fermare o saltare cio' che non suona e' un tasto nel vuoto.
        if (!suonavaPrima && azione != "play" && azione != "play_pause") {
            call.resolve(
                JSObject().put("done", false).put("reason", "nothing-playing").put("playing", false),
            )
            return
        }

        val quando = SystemClock.uptimeMillis()
        val inviato = runCatching {
            audio.dispatchMediaKeyEvent(KeyEvent(quando, quando, KeyEvent.ACTION_DOWN, codice, 0))
            audio.dispatchMediaKeyEvent(KeyEvent(quando, quando, KeyEvent.ACTION_UP, codice, 0))
            true
        }.getOrDefault(false)
        if (!inviato) {
            call.resolve(JSObject().put("done", false).put("reason", "dispatch-failed"))
            return
        }

        /*
         * ⛔ Presidio 2: si guarda l'ESITO, non la chiamata. E si aspetta, perche'
         * l'app che suona riceve il tasto e reagisce in un altro processo: leggere
         * `isMusicActive` nell'istante dopo l'invio misurerebbe il PRIMA.
         *
         * Mezzo secondo e' abbastanza perche' il servizio audio si aggiorni, e
         * poco abbastanza da non far sembrare la chat bloccata. Si aspetta su un
         * Handler e non con uno sleep: il thread principale non si blocca mai.
         */
        Handler(Looper.getMainLooper()).postDelayed({
            val suonaDopo = runCatching { audio.isMusicActive }.getOrDefault(false)
            val riuscito = when (azione) {
                "pause", "stop" -> !suonaDopo
                "play" -> suonaDopo
                "play_pause" -> suonaDopo != suonavaPrima
                // Cambio traccia: l'unica cosa vera che si puo' dire e' che sta
                // ancora suonando. Vedi la nota in cima.
                else -> suonaDopo
            }
            call.resolve(
                JSObject()
                    .put("done", riuscito)
                    .put("playing", suonaDopo)
                    .put("action", azione)
                    .apply { if (!riuscito) put("reason", "no-media-app-took-it") },
            )
        }, 500)
    }
}
