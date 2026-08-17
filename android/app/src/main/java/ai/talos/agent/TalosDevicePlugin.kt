package ai.talos.agent

import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/**
 * Il lato del quadrato in cui si disegna l'icona di un'app, in pixel fisici.
 *
 * ⛔ Uno solo per tutte, e deciso QUI invece che da chi disegna: icone di
 * dimensioni diverse in colonna sono la prima cosa che fa sembrare sciatta una
 * scheda, e lasciare la scelta al CSS vorrebbe dire ingrandire un'icona piccola
 * — cioè sfocarla. 144 px coprono i 48 dp del bersaglio di tocco anche a densità
 * 3× senza doverli inventare.
 */
private const val MISURA_ICONA = 144

/**
 * ⛔ Il tag del registro per la posta: una stringa sola, perché due tag diversi
 * sono due `grep` da ricordare — e la causa di un provider muto si cerca quando
 * si ha fretta.
 */
private const val TAG_POSTA = "TalosPosta"

/**
 * ⛔⛔ IL PERMESSO DI GMAIL È `dangerous`, cioè SI CHIEDE — MISURATO, non dedotto.
 *
 * Dichiararlo nel manifest non basta e il telefono lo dice a chiare lettere. Il
 * 2026-08-14, sul Pad, con la riga già nel manifest:
 *
 * ```
 *   SecurityException: Permission Denial: opening provider
 *   com.google.android.gm.provider.PublicContentProvider from ai.talos.dev
 *   requires com.google.android.gm.permission.READ_CONTENT_PROVIDER
 *
 *   dumpsys package permission …READ_CONTENT_PROVIDER → prot=dangerous
 * ```
 *
 * ⛔ E `dumpsys package ai.talos.dev` mostrava quel nome lo stesso: comparire
 * fra i permessi RICHIESTI non vuol dire essere stati AUTORIZZATI — è lo stesso
 * inganno di `adb install` che dice «Success» installando un'altra app.
 *
 * ⇒ Si chiede alla persona col dialogo di sistema, una volta, come per il
 * calendario e la rubrica. Non sta in `Manifest.permission` perché non è di
 * Android: lo definisce Gmail.
 */
private const val PERMESSO_POSTA = "com.google.android.gm.permission.READ_CONTENT_PROVIDER"

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
@CapacitorPlugin(
    name = "TalosDevice",
    permissions = [
        Permission(strings = [PERMESSO_POSTA], alias = "posta"),
    ],
)
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
                /*
                 * ⛔ Senza SKIP_UI si apre l'app e la persona deve confermare.
                 * Con, la sveglia c'e' e basta. Chi l'ha chiesta a voce non
                 * vuole poi toccare lo schermo.
                 *
                 * ⛔⛔ MA QUESTA ROM LO IGNORA — misurato sul Pad il 2026-08-14
                 * da uno stato pulito, con l'intent sparato da `adb`:
                 *
                 *     PRIMA  com.android.launcher
                 *     DOPO   com.oneplus.deskclock/…AlarmClock   (sveglia creata)
                 *
                 * La sveglia si crea davvero, ma la persona finisce
                 * nell'Orologio. Non e' un difetto nostro e non si aggira con
                 * un altro extra: l'unica alternativa sarebbe una sveglia
                 * NOSTRA, che non suonerebbe piu' se qualcuno disinstalla TALOS
                 * — vedi il commento in cima. Si tiene l'intent e si dichiara
                 * il limite invece di fingere che non ci sia.
                 */
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        }
        call.getString("label")?.let { intent.putExtra(AlarmClock.EXTRA_MESSAGE, it) }
        call.resolve(avvia(intent))
    }

    /**
     * ⭐⭐⭐ SPEGNERE UNA SVEGLIA — il verso che non esisteva.
     *
     * ## Il difetto, misurato sul Pad il 2026-08-13
     *
     * A «annulla la sveglia delle 7 e 30» succedevano **tre cose sbagliate in
     * una**: la sveglia restava armata, ne compariva una **seconda** alle 07:30,
     * e si apriva **l'app Orologio** in faccia alla persona. Causa unica: il
     * modello aveva un solo attrezzo per le sveglie, `device_alarm`, che sa
     * **soltanto mettere**. Gli si chiedeva di annullare e lui rifaceva.
     *
     * ⇒ Non era un difetto del modello: era un attrezzo **senza il suo
     * contrario**. Nello stesso confronto Gemini annullava davvero.
     *
     * ## Perché `ACTION_DISMISS_ALARM` e non una cancellazione
     *
     * L'API delle sveglie di Android **non ha** un «elimina»: possiede solo
     * `ACTION_DISMISS_ALARM`, che spegne l'istanza trovata. Si sceglie **come**
     * cercarla con `EXTRA_ALARM_SEARCH_MODE`:
     *
     * - orario preciso, quando la persona lo dice («quella delle 7 e 30»)
     * - la prossima, quando dice solo «annulla la sveglia»
     * - tutte, quando dice «tutte»
     *
     * ⛔ `EXTRA_SKIP_UI` va messo anche qui: senza, l'orologio si apre per far
     * scegliere quale — ed è esattamente la cosa che non deve succedere
     * («non spostare mai la persona»). Con, se la ricerca trova una sveglia sola
     * la spegne in silenzio.
     */
    @PluginMethod
    fun alarmDismiss(call: PluginCall) {
        val hour = call.getInt("hour")
        val minute = call.getInt("minute")
        val intent = Intent(AlarmClock.ACTION_DISMISS_ALARM)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        when {
            call.getBoolean("all") == true ->
                intent.putExtra(AlarmClock.EXTRA_ALARM_SEARCH_MODE, AlarmClock.ALARM_SEARCH_MODE_ALL)
            hour != null ->
                intent
                    .putExtra(AlarmClock.EXTRA_ALARM_SEARCH_MODE, AlarmClock.ALARM_SEARCH_MODE_TIME)
                    .putExtra(AlarmClock.EXTRA_HOUR, hour)
                    .putExtra(AlarmClock.EXTRA_MINUTES, minute ?: 0)
            else ->
                intent.putExtra(AlarmClock.EXTRA_ALARM_SEARCH_MODE, AlarmClock.ALARM_SEARCH_MODE_NEXT)
        }
        call.resolve(avvia(intent))
    }

    // ─────────────────────────────────────────────── aprire

    /** Apre un'app per nome di pacchetto, o dice che non c'è. */
    /**
     * ⭐⭐ APRE UN URI — il motore degli intent passa tutto da qui.
     *
     * MISURATO sul Pad il 2026-08-13: allo stesso compito Gemini manda un
     * WhatsApp in ~20 s **senza mai aprire l'app**, TALOS lo pilotava in 20
     * passi e 27,8 s senza concludere. La differenza e' un URI.
     *
     * ⛔ `resolveActivity` PRIMA di partire, e non un try/catch dopo: un
     * `ActivityNotFoundException` intercettato dice «e' fallito» quando la
     * verita' e' «nessuno sa aprirlo», e su quella differenza si decide se
     * provare la via successiva o arrendersi.
     *
     * ⛔ E da Android 11 serve la voce in `<queries>`: senza, il sistema
     * NASCONDE chi saprebbe aprirlo e `resolveActivity` torna null. Ogni
     * schema del registro deve avere la sua riga nel manifest, o la capacita'
     * e' morta in silenzio.
     */
    @PluginMethod
    fun apriUri(call: PluginCall) {
        val uri = call.getString("uri").orEmpty()
        val result = JSObject()
        if (uri.isEmpty()) {
            call.resolve(result.put("done", false).put("reason", "no-uri"))
            return
        }
        val intent = android.content.Intent(
            android.content.Intent.ACTION_VIEW,
            android.net.Uri.parse(uri),
        ).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        /*
         * ⛔⛔⛔ L'APP PRIMA DEL BROWSER — owner: «NON SPOSTARE MAI LA PERSONA».
         *
         * MISURATO sul Pad il 2026-08-14, «metti su Pink Floyd su Spotify»:
         *
         *     START act=VIEW dat=https://open.spotify.com/…
         *           cmp=com.android.chrome/…IntentDispatcher      ⇐ il BROWSER
         *
         * Spotify era installato. L'indirizzo `https://open.spotify.com/...` è
         * un app-link che l'app sa aprire, ma senza vincolo Android lo consegna
         * al gestore predefinito — Chrome — e la persona si ritrova la pagina
         * web al posto della sua musica. È esattamente il contrario del motivo
         * per cui esiste il registro degli intenti.
         *
         * ⇒ Se chi chiama dichiara un pacchetto, l'URI si prova PRIMA dentro
         * quello. Non è una preferenza estetica: `spotify:search:` e
         * `https://open.spotify.com` portano allo stesso posto solo se ad
         * aprirli è Spotify.
         *
         * ⛔ E se quell'app non lo sa aprire — non è installata, o non dichiara
         * quel link — **si toglie il vincolo e si riprova**. La regola scritta
         * in `intentiTools` dice «se l'app manca, apre il web invece di
         * fallire», e restringere senza ripiegare la trasformerebbe in un
         * fallimento nuovo. Il ripiego resta, ma diventa il piano B invece che
         * il piano A.
         */
        val pacchetto = call.getString("pacchetto")?.takeIf { it.isNotEmpty() }
        if (pacchetto != null) {
            intent.setPackage(pacchetto)
            if (intent.resolveActivity(context.packageManager) == null) {
                intent.setPackage(null)
            }
        }
        if (intent.resolveActivity(context.packageManager) == null) {
            call.resolve(result.put("done", false).put("reason", "nessuno-lo-apre"))
            return
        }
        call.resolve(avvia(intent))
    }

    /**
     * ⭐⭐⭐ CHI SA FARE QUESTA COSA? — la domanda si fa al TELEFONO.
     *
     * ## Perché esiste, con le misure che l'hanno imposta
     *
     * Owner, 2026-08-13: «non puoi mettere delle righe predeterminate. La chat
     * ha già una lista delle applicazioni esistenti. Dobbiamo fare in modo che
     * chiami in quelle e non usi delle righe generiche».
     *
     * Aveva ragione, e il registro scritto a mano lo dimostrava da solo —
     * MISURATO sul Pad lo stesso giorno:
     *
     * - `com.android.dialer` **non esiste** (il vero è `com.google.android.dialer`);
     * - `spotify:search:` **non ha più un gestore**, cade sul launcher;
     * - **9 pacchetti su 21** del registro non sono installati;
     * - l'HTTPS di Spotify finisce in Chrome perché il dominio **non è
     *   verificato** — un fatto del dispositivo, che nessuna tabella può sapere.
     *
     * ⇒ Qui si chiede al `PackageManager` chi accetta una certa AZIONE, e la
     * risposta è vera oggi, su QUESTO telefono, comprese le app installate
     * dopo che questo codice è stato scritto.
     *
     * MISURATO sul Pad: `ACTION_SEND`+`text/plain` → **20 app**;
     * `ACTION_SEARCH` → **20 app**, fra cui Spotify e YouTube.
     *
     * ⛔ Torna l'ETICHETTA insieme al pacchetto. Un id non dice niente a un
     * modello: è già costato una diagnosi sbagliata su questo progetto —
     * `org.thunderdog.challegram` non somiglia a «Telegram», e due provider su
     * tre dissero che Telegram non era installato.
     *
     * ⛔ E serve la voce in `<queries>`: da Android 11, senza dichiarazione il
     * sistema NASCONDE le altre app e questa risposta arriva vuota — che è
     * indistinguibile da «nessuno lo sa fare».
     */
    @PluginMethod
    fun chiAccetta(call: PluginCall) {
        val azione = call.getString("azione").orEmpty()
        if (azione.isEmpty()) {
            call.resolve(JSObject().put("app", JSArray()))
            return
        }
        val intent = android.content.Intent(azione)
        val tipo = call.getString("tipo")
        if (!tipo.isNullOrEmpty()) intent.type = tipo
        call.getString("uri")?.takeIf { it.isNotEmpty() }?.let {
            intent.data = android.net.Uri.parse(it)
        }
        val pm = context.packageManager
        val righe = JSArray()
        val visti = HashSet<String>()
        for (info in pm.queryIntentActivities(intent, 0)) {
            val pacchetto = info.activityInfo?.packageName ?: continue
            // ⛔ Noi non contiamo: TALOS che offre TALOS è rumore, e in un
            // elenco di scelte è anche un modo per premere il proprio pulsante.
            if (pacchetto == context.packageName) continue
            if (!visti.add(pacchetto)) continue
            righe.put(
                JSObject()
                    .put("pacchetto", pacchetto)
                    .put("nome", info.loadLabel(pm)?.toString().orEmpty())
                    .put("attivita", info.activityInfo?.name.orEmpty()),
            )
        }
        call.resolve(JSObject().put("app", righe))
    }

    /**
     * ⭐⭐⭐ QUANTE EMAIL NON LETTE — chiesto al TELEFONO, non a Google.
     *
     * ## La misura che l'ha imposta
     *
     * Censimento contro Gemini, 2026-08-14: a «quante email non lette ho in
     * Gmail» lui risponde col numero; TALOS apriva Gmail e basta. Era l'ultima
     * cosa che lui faceva e noi no.
     *
     * ## ⛔ Perché il provider e non l'API di Google
     *
     * `gmail.readonly` è uno scope **ristretto**: verifica più assessment CASA,
     * che per gli scope ristretti arriva al **Tier 3 — un penetration test** con
     * laboratorio approvato, da rifare ogni 12 mesi. E in stato «Testing», il
     * solo raggiungibile senza quella trafila, il **refresh token scade ogni 7
     * giorni**: riautorizzare TALOS ogni settimana, per sempre.
     *
     * ⇒ Gmail espone un content provider **pubblico e documentato**
     * (`GmailContract`) con le etichette e i loro conteggi. Un permesso normale
     * nel manifest, nessun giro dal cloud, nessuna approvazione esterna.
     *
     * ## ⛔ Dà i CONTEGGI, non il testo — ed è una virtù
     *
     * Non esiste, da questa strada, un modo di leggere il corpo di una email:
     * l'unico dato che esce è **quante** e **in quale etichetta**. Mittente e
     * oggetto restano quelli delle notifiche, che la persona ha già visto
     * comparire sul suo schermo.
     *
     * ## ⛔ Gli account si chiedono al sistema
     *
     * Nessun indirizzo scritto da noi: `AccountManager` con tipo `com.google`
     * dice quali ci sono davvero. Un indirizzo indovinato darebbe un provider
     * muto e una diagnosi sbagliata.
     */
    @PluginMethod
    fun postaNonLetta(call: PluginCall) {
        val esito = JSObject()
        val caselle = JSArray()
        /*
         * ⛔ `GET_ACCOUNTS` non si chiede più da Android 8 per i propri tipi,
         * ma il sistema può comunque rendere una lista vuota: quello NON è
         * «zero email», è «non lo so», e va detto diverso.
         */
        val conti = runCatching {
            android.accounts.AccountManager.get(context).getAccountsByType("com.google")
        }.getOrNull()
        if (conti == null || conti.isEmpty()) {
            call.resolve(esito.put("letto", false).put("motivo", "nessun-account").put("caselle", caselle))
            return
        }
        /*
         * ⛔ Il permesso PRIMA della domanda, e con un motivo suo: senza, una
         * negazione si travestiva da «provider muto» e il modello raccontava un
         * guasto di Gmail al posto di una casella da spuntare.
         */
        if (context.checkSelfPermission(PERMESSO_POSTA) != PackageManager.PERMISSION_GRANTED) {
            call.resolve(esito.put("letto", false).put("motivo", "permesso-mancante").put("caselle", caselle))
            return
        }
        var almenoUna = false
        for (conto in conti) {
            val uri = android.net.Uri.parse(
                "content://com.google.android.gm/${conto.name}/labels",
            )
            runCatching {
                val cursore = context.contentResolver.query(uri, null, null, null, null)
                if (cursore == null) {
                    android.util.Log.w(TAG_POSTA, "provider muto: cursore nullo per $uri")
                }
                cursore?.use { c ->
                    /*
                     * ⛔ Le colonne che ci sono DAVVERO, non quelle che ci
                     * aspettiamo: se un domani Gmail le rinomina, questa riga
                     * dice quali sono invece di lasciarci indovinare.
                     */
                    val iCanonico = c.getColumnIndex("canonicalName")
                    val iNonLette = c.getColumnIndex("numUnreadConversations")
                    val iEtichetta = c.getColumnIndex("name")
                    if (iCanonico < 0 || iNonLette < 0) {
                        android.util.Log.w(
                            TAG_POSTA,
                            "colonne diverse dal previsto: ${c.columnNames.joinToString(",")}",
                        )
                        return@use
                    }
                    /*
                     * ⛔⛔ LA POSTA IN ARRIVO NON È SEMPRE UNA RIGA SOLA — e il
                     * telefono me l'ha detto dopo che avevo scritto il
                     * contrario.
                     *
                     * MISURATO sul Pad il 2026-08-14. Il codice cercava `^i`
                     * (`GmailContract…CANONICAL_NAME_INBOX`) e il commento
                     * spiegava che le categorie sono sotto-insiemi, quindi
                     * sommarle conterebbe due volte. Su questo account **`^i`
                     * non esiste**: 22 etichette, e la posta in arrivo è divisa
                     * in quattro sezioni.
                     *
                     * ```
                     *   ^sq_ig_i_personal=3804  ^sq_ig_i_promo=21951
                     *   ^sq_ig_i_social=1783    ^sq_ig_i_notification=415
                     *   ^t=8  ^f=32  ^s=100  ^assistive_purchase=921  ^all=30833
                     * ```
                     *
                     * Confronto con lo schermo di Gmail, stessa ora: Speciali 8,
                     * Inviati 32, Spam 100, Acquisti 921 — quattro numeri
                     * identici, quindi la colonna è quella giusta. Principale
                     * mostra «+99», che è il tetto del display, non il conto.
                     *
                     * ⇒ La regola giusta: `^i` se c'è (posta classica), se no la
                     * SOMMA delle sezioni `^sq_ig_i_*`, che sono disgiunte. Non
                     * si sceglie a tavolino: si guarda cosa risponde questo
                     * telefono, per questo account.
                     */
                    var inArrivo = -1
                    var sommaSezioni = 0
                    var sezioniViste = false
                    val sezioni = JSArray()
                    while (c.moveToNext()) {
                        val canonico = c.getString(iCanonico) ?: continue
                        val nonLette = c.getInt(iNonLette)
                        if (canonico == "^i") {
                            inArrivo = nonLette
                            continue
                        }
                        if (!canonico.startsWith("^sq_ig_i_")) continue
                        sezioniViste = true
                        sommaSezioni += nonLette
                        /*
                         * ⭐ Il nome lo dà GMAIL, non noi: «Promozioni»,
                         * «Social», «Aggiornamenti» sono le stesse parole che la
                         * persona legge nel suo cassetto, già nella sua lingua.
                         *
                         * ⛔ E si prende SOLO per queste righe: `name` su
                         * un'etichetta personale è roba della persona, e qui non
                         * serve a niente.
                         */
                        val nome = if (iEtichetta >= 0) c.getString(iEtichetta) else null
                        sezioni.put(
                            JSObject()
                                .put("nome", nome ?: canonico)
                                .put("nonLette", nonLette),
                        )
                    }
                    if (inArrivo < 0 && sezioniViste) inArrivo = sommaSezioni
                    if (inArrivo < 0) {
                        // Nessuna riga di posta in arrivo: non è «zero», è «non lo so».
                        android.util.Log.w(TAG_POSTA, "nessuna riga di posta in arrivo fra ${c.count} etichette")
                        return@use
                    }
                    almenoUna = true
                    caselle.put(
                        JSObject()
                            .put("conto", conto.name)
                            .put("nonLette", inArrivo)
                            .put("sezioni", sezioni),
                    )
                }
            }.onFailure { android.util.Log.w(TAG_POSTA, "query fallita su $uri", it) }
        }
        if (!almenoUna) {
            /*
             * ⛔ TRE stati, non due: «zero non lette» e «il provider non ha
             * risposto» sono fatti diversi, e appiattirli farebbe dire «non hai
             * posta» a chi ce l'ha. Il permesso può mancare, Gmail può essere
             * troppo vecchio, l'account può non essere sincronizzato.
             */
            call.resolve(esito.put("letto", false).put("motivo", "provider-muto").put("caselle", caselle))
            return
        }
        call.resolve(esito.put("letto", true).put("caselle", caselle))
    }

    /**
     * Chiede alla persona il permesso di Gmail, col dialogo di sistema.
     *
     * ⛔ Separato dalla lettura, come per il calendario: **chiedere è un
     * gesto**, e va fatto quando serve — non all'avvio, insieme a tutti gli
     * altri, dove una persona dice di sì a tutto o di no a tutto.
     */
    @PluginMethod
    fun chiediPermessoPosta(call: PluginCall) {
        requestPermissionForAlias("posta", call, "esitoPermessoPosta")
    }

    @com.getcapacitor.annotation.PermissionCallback
    private fun esitoPermessoPosta(call: PluginCall) {
        call.resolve(
            JSObject().put(
                "permesso",
                context.checkSelfPermission(PERMESSO_POSTA) == PackageManager.PERMISSION_GRANTED,
            ),
        )
    }

    /**
     * ⭐⭐ LO SCREENSHOT, e il motivo per cui passa dall'occhio.
     *
     * L'unica strada che non chiede un consenso nuovo a ogni scatto è il
     * servizio di accessibilità: `MediaProjection` fa comparire una scheda di
     * sistema **ogni volta**, e per «fai uno screenshot» sarebbe una domanda al
     * posto di una risposta. L'occhio la persona l'ha già acceso una volta, con
     * cognizione, e questa è una delle cose che ha acceso.
     *
     * ⛔ E se l'occhio è chiuso si dice **quale** permesso manca: un
     * `done: false` muto manderebbe il modello a inventare la causa — difetto
     * già misurato su questo progetto, e non una volta sola.
     */
    @PluginMethod
    fun schermata(call: PluginCall) {
        val esito = JSObject()
        if (TalosOcchio.aperto() == null) {
            call.resolve(esito.put("done", false).put("reason", "occhio-chiuso"))
            return
        }
        val fatto = TalosOcchio.scattaSchermata()
        call.resolve(
            esito.put("done", fatto)
                .apply { if (!fatto) put("reason", "rifiutato-dal-sistema") },
        )
    }

    /**
     * ⭐⭐⭐ LE ICONE VERE DELLE APP — owner 2026-08-14: «icone pulite e coerenti
     * nelle schede per ogni app prevista».
     *
     * ## ⛔ Perché si chiedono al telefono e non si disegnano
     *
     * Un'icona disegnata da noi per WhatsApp sarebbe una **riga predeterminata**
     * col vestito grafico: invecchia al primo restyling, e per l'app installata
     * domani non esiste proprio. `getApplicationIcon` restituisce quella che la
     * persona vede ogni giorno sul suo launcher — compresa la forma che la sua
     * ROM applica alle icone adattive.
     *
     * ## ⛔ E si chiedono SOLO quando si disegnano
     *
     * Non entrano nei metadati del messaggio: una scheda con diciassette app a
     * ~6 kB l'una sarebbero **cento kilobyte** salvati per sempre nel database
     * della chat, e ricopiati in ogni backup, per un dato che il telefono ha già
     * e che cambia quando l'app si aggiorna. La scheda porta il **pacchetto** —
     * che è il fatto — e chiede l'icona nel momento in cui la mostra.
     *
     * ## Perché tutte insieme
     *
     * Un giro di ponte per icona vorrebbe dire diciassette giri per una scheda.
     * Qui si chiede un elenco e si risponde con una mappa: chi manca
     * semplicemente non c'è, e chi disegna mostra il posto vuoto senza rompersi.
     *
     * ⛔ `MISURA` è in pixel fisici e non dipende dal tema: le icone escono
     * tutte della stessa dimensione, che è metà del lavoro per farle sembrare
     * «pulite e coerenti». L'altra metà è la cornice, e quella sta nel CSS.
     */
    @PluginMethod
    fun iconeApp(call: PluginCall) {
        val chiesti = call.getArray("pacchetti")
        val icone = JSObject()
        if (chiesti == null) {
            call.resolve(JSObject().put("icone", icone))
            return
        }
        val pm = context.packageManager
        for (indice in 0 until chiesti.length()) {
            val pacchetto = runCatching { chiesti.getString(indice) }.getOrNull()
            if (pacchetto.isNullOrEmpty()) continue
            /*
             * ⛔ Ogni icona nel suo `runCatching`: un pacchetto disinstallato fra
             * l'elenco e il disegno solleva `NameNotFoundException`, e una
             * scheda intera senza icone per colpa di una riga sarebbe il difetto
             * peggiore di quello che stiamo curando.
             */
            runCatching {
                val disegno = pm.getApplicationIcon(pacchetto)
                val tela = android.graphics.Bitmap.createBitmap(
                    MISURA_ICONA,
                    MISURA_ICONA,
                    android.graphics.Bitmap.Config.ARGB_8888,
                )
                val pennello = android.graphics.Canvas(tela)
                /*
                 * ⭐⭐ LA MASCHERA DEL SISTEMA — è questa a rendere l'elenco
                 * «coerente», e non la sceglie TALOS.
                 *
                 * MISURATO sul Pad il 2026-08-14, prima scheda con le icone:
                 * Spotify e Google Play Services riempivano il quadrato mentre
                 * Gmail, Contatti e Chrome stavano dentro un cerchio. La colpa
                 * non è delle app: `getApplicationIcon` restituisce l'icona
                 * ADATTIVA **non ritagliata**, e il ritaglio lo fa il launcher.
                 *
                 * ⇒ Si chiede la stessa maschera al sistema
                 * (`AdaptiveIconDrawable.getIconMask()`) e si applica a tutte:
                 * l'elenco viene fuori con la forma che quella persona vede sul
                 * suo telefono, non con una forma decisa da noi.
                 *
                 * ⛔ Solo per le adattive: un'icona vecchia non ha un fondo da
                 * estendere, e ritagliarla le taglierebbe un pezzo di disegno.
                 * Restano quadrate, sono poche, e la cornice del CSS le tiene
                 * comunque in riga.
                 */
                if (disegno is android.graphics.drawable.AdaptiveIconDrawable) {
                    val maschera = android.graphics.Path(disegno.iconMask)
                    val misura = android.graphics.Matrix()
                    val bordi = android.graphics.RectF()
                    maschera.computeBounds(bordi, true)
                    misura.setRectToRect(
                        bordi,
                        android.graphics.RectF(0f, 0f, MISURA_ICONA.toFloat(), MISURA_ICONA.toFloat()),
                        android.graphics.Matrix.ScaleToFit.FILL,
                    )
                    maschera.transform(misura)
                    pennello.clipPath(maschera)
                }
                disegno.setBounds(0, 0, MISURA_ICONA, MISURA_ICONA)
                disegno.draw(pennello)
                val sacco = java.io.ByteArrayOutputStream()
                tela.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, sacco)
                tela.recycle()
                icone.put(
                    pacchetto,
                    "data:image/png;base64,"
                        + android.util.Base64.encodeToString(
                            sacco.toByteArray(),
                            android.util.Base64.NO_WRAP,
                        ),
                )
            }
        }
        call.resolve(JSObject().put("icone", icone))
    }

    /**
     * ⭐⭐⭐ LANCIA UN'AZIONE, non un URI — con i parametri DENTRO.
     *
     * ## La misura che l'ha resa necessaria
     *
     * Un URI porta i parametri solo se l'app li legge, e MISURATO sul Pad il
     * 2026-08-13 spesso non li legge:
     *
     * | capacità | con l'URI | con l'azione |
     * |---|---|---|
     * | traduci | Traduttore sulla schermata iniziale, **testo perso** | `ACTION_SEND`+`text/plain` → **«girasole» a schermo** |
     * | calendario | scheda evento aperta, **titolo perso** | (nessuna strada trovata su questo dispositivo) |
     *
     * ⇒ Qui i valori viaggiano negli **extra**, che è il modo in cui Android li
     * ha sempre trasportati.
     *
     * ⛔ I nomi degli extra arrivano da chi chiama, e sono le costanti di
     * Android (`android.intent.extra.TEXT`, `query`): questo metodo resta
     * generico e non impara niente su nessuna app. Il giorno che un'app nuova
     * vuole un extra diverso, cambia un dato — non questo file.
     */
    @PluginMethod
    fun apriAzione(call: PluginCall) {
        val azione = call.getString("azione").orEmpty()
        val esito = JSObject()
        if (azione.isEmpty()) {
            call.resolve(esito.put("done", false).put("reason", "no-azione"))
            return
        }
        val intent = android.content.Intent(azione)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        call.getString("tipo")?.takeIf { it.isNotEmpty() }?.let { intent.type = it }
        call.getString("uri")?.takeIf { it.isNotEmpty() }?.let {
            intent.data = android.net.Uri.parse(it)
        }
        // ⛔ Il pacchetto RESTRINGE, e non è un dettaglio: senza, «manda questo
        // testo» apre il foglio di condivisione con venti app, e la persona
        // deve scegliere. Con, arriva dove ha chiesto.
        call.getString("pacchetto")?.takeIf { it.isNotEmpty() }?.let { intent.setPackage(it) }
        call.getObject("extra")?.let { extra ->
            val chiavi = extra.keys()
            while (chiavi.hasNext()) {
                val k = chiavi.next()
                intent.putExtra(k, extra.getString(k))
            }
        }
        /*
         * ⛔⛔⛔ DUE DOMANDE DIVERSE ALLO STESSO TELEFONO, E DAVANO RISPOSTE
         * DIVERSE — è il difetto visto sul Pad il 2026-08-14.
         *
         * La scheda «quale app» elenca chi sa fare una cosa con
         * `queryIntentActivities`; toccare una riga arrivava qui, dove
         * `resolveActivity` diceva **no**, e sullo schermo compariva «Non si è
         * aperta» su un'app che il telefono aveva appena dichiarato capace.
         * Misurato toccando Chrome su `android.intent.action.SEARCH`.
         *
         * Non è un capriccio: `resolveActivity` cerca solo attività che
         * dichiarano `CATEGORY_DEFAULT`, perché è così che Android sceglie
         * quando l'intent è implicito. `queryIntentActivities` risponde alla
         * domanda vera — «chi ha un filtro per questa azione?» — e per
         * `ACTION_SEARCH` quasi nessuno aggiunge quella categoria: quelle
         * attività si aprono per **componente esplicito**, che è esattamente
         * come le apre il motore di ricerca di sistema.
         *
         * ⇒ Se la strada implicita non c'è, si chiede al telefono **quale
         * attività** di quel pacchetto sa farlo e la si apre per nome. È la
         * stessa risposta che ha riempito l'elenco: così ciò che la scheda
         * promette e ciò che il tocco fa tornano a essere la stessa cosa.
         *
         * ⛔ Solo dentro il pacchetto CHIESTO: senza quel vincolo questa riga
         * diventerebbe «apri qualcosa che somigli», cioè aprire un'app a caso.
         * E se non c'è nemmeno lì, si dice di no com'è giusto.
         */
        if (intent.resolveActivity(context.packageManager) == null) {
            val pacchetto = intent.`package`
            val trovata = if (pacchetto.isNullOrEmpty()) {
                null
            } else {
                context.packageManager
                    .queryIntentActivities(intent, 0)
                    .firstOrNull { it.activityInfo?.packageName == pacchetto }
                    ?.activityInfo
            }
            if (trovata == null) {
                call.resolve(esito.put("done", false).put("reason", "nessuno-lo-fa"))
                return
            }
            intent.component = android.content.ComponentName(trovata.packageName, trovata.name)
        }
        /*
         * ⛔ `chiedendoPrima = false` quando abbiamo il componente esplicito: la
         * guardia di `avvia` è un'altra `resolveActivity`, cioè la domanda che
         * abbiamo appena scoperto essere quella sbagliata. Con un componente in
         * mano l'unico giudice onesto è provare e guardare l'eccezione — che è
         * la stessa conclusione già scritta lì dentro per le schermate di
         * sistema.
         */
        call.resolve(avvia(intent, chiedendoPrima = intent.component == null))
    }

    /**
     * ⭐⭐⭐ MANDARE UN FILE A UN'ALTRA APP — owner 2026-08-13.
     *
     * > «si possa dire alla chat di **inviare un file della libreria via social
     * > media o app di messaggistica**»
     *
     * `apriAzione` sopra manda solo TESTO. Un file e' un'altra cosa, e le
     * differenze non sono di forma: sono le tre che rompono l'invio.
     *
     * ## 1. `file://` NON si puo' mandare, da Android 7
     *
     * Passare un `Uri.fromFile(...)` in `EXTRA_STREAM` lancia
     * `FileUriExposedException`. Serve un `content://` prodotto da un
     * `FileProvider`, piu' `FLAG_GRANT_READ_URI_PERMISSION` — altrimenti l'app
     * che riceve vede l'URI e non puo' aprirlo.
     *
     * ⛔ E il `FileProvider` deve DICHIARARE la cartella: i file della libreria
     * stanno in `filesDir`, che le due righe scritte da Capacitor in
     * `file_paths.xml` non coprivano. Senza `<files-path>`, `getUriForFile`
     * lancia `Failed to find configured root`.
     *
     * ## 2. `ClipData`, o l'anteprima e il permesso saltano
     *
     * Da Android 10 il foglio di condivisione copia la `ClipData` e NON
     * `EXTRA_STREAM`: senza `ClipData.newRawUri`, chi riceve mostra un
     * rettangolo vuoto — e diverse app trattano il permesso come non concesso.
     * Si mettono entrambi, che e' cio' che la documentazione descrive.
     *
     * ## 3. Il MIME decide CHI puo' riceverlo
     *
     * Non e' una formalita': con un MIME di immagine l'elenco di
     * `queryIntentActivities` e' diverso che con `text` semplice. Per questo il
     * tipo arriva da chi chiama e non si indovina qui — e per questo l'elenco
     * delle app di destinazione si chiede al telefono con `chiAccetta`, non a
     * una tabella scritta a mano.
     *
     * ⛔ NOTA per chi tocchera' questo commento: in Kotlin i commenti a blocco
     * si ANNIDANO. Scrivere qui dentro la stella di un MIME preceduta da una
     * barra apre un commento interno, e la chiusura qui sotto chiude solo
     * quello — il resto del file diventa commento fino alla prima chiusura che
     * capita, che era dentro una stringa. Costato una compilazione.
     *
     * ⛔ Il percorso e' RELATIVO a `filesDir` e viene ripulito: un `..` che
     * uscisse da li' significherebbe mandare a un'altra app un file che non e'
     * della libreria. La guardia confronta i percorsi CANONICI, che e' l'unica
     * forma che regge ai collegamenti simbolici.
     */
    /**
     * ⭐⭐⭐ IL DESTINATARIO, che salta il selettore dei contatti.
     *
     * ## Il difetto che la fa nascere — misurato il 2026-08-13
     *
     * `invia_file` funzionava e non sapeva A CHI: si arrivava a
     * `com.whatsapp.contact.ui.picker.ExternalShareAlias`, cioe' all'elenco dei
     * contatti, e la persona doveva finire a mano. Peggio: non avendo un campo
     * per il destinatario, il modello infilava il nome nel TESTO — la scheda di
     * consenso diceva `TESTO: Antonino Rizzo`, e il file sarebbe partito con
     * quella frase dentro.
     *
     * ## ⛔ Non e' un'API ufficiale, ed e' scritto qui perche' si veda
     *
     * L'extra `jid` non compare in nessuna documentazione di WhatsApp: e' un
     * meccanismo noto alla comunita' degli sviluppatori, come lo era il mime
     * `vnd.android.cursor.item/vnd.com.whatsapp.voip.call` per le chiamate.
     * Puo' smettere di funzionare con un aggiornamento loro.
     *
     * ⇒ Per questo NON si rompe niente se non funziona: senza `jid` l'intent
     * resta esattamente quello di prima e si finisce sul selettore, che e' la
     * strada che gia' funzionava. La rete di sicurezza e' la vecchia strada,
     * non un errore.
     *
     * ⛔ E si verifica dal DISPOSITIVO, non da qui: se ha funzionato, il fuoco
     * e' su `com.whatsapp.Conversation`; se no, su `ExternalShareAlias`. Sono
     * due nomi diversi, quindi la domanda ha una risposta secca.
     */
    private fun destinatarioDentro(call: PluginCall, intent: android.content.Intent) {
        val jid = call.getString("destinatario").orEmpty()
        if (jid.isEmpty()) return
        intent.putExtra("jid", jid)
        android.util.Log.i("TalosDevice", "destinatario: jid messo, salto il selettore")
    }

    @PluginMethod
    fun condividiFile(call: PluginCall) {
        val percorso = call.getString("percorso").orEmpty()
        val tipo = call.getString("tipo").orEmpty().ifEmpty { "*/*" }
        val esito = JSObject()
        if (percorso.isEmpty()) {
            call.resolve(esito.put("done", false).put("reason", "no-percorso"))
            return
        }
        val radice = context.filesDir
        val file = java.io.File(radice, percorso)
        val dentro = try {
            file.canonicalPath.startsWith(radice.canonicalPath + java.io.File.separator)
        } catch (_: java.io.IOException) {
            false
        }
        if (!dentro) {
            android.util.Log.i("TalosDevice", "condividiFile: percorso fuori dalla libreria, rifiuto")
            call.resolve(esito.put("done", false).put("reason", "percorso-fuori"))
            return
        }
        if (!file.isFile) {
            call.resolve(esito.put("done", false).put("reason", "file-assente"))
            return
        }
        /*
         * ⛔⛔ IL FILE DEVE ARRIVARE COL SUO NOME — misurato il 2026-08-13.
         *
         * Il primo invio riuscito e' arrivato in WhatsApp chiamandosi
         * `e2aaabf5-7e73-43df-aafb-50b9ca372bb1.md`: il `FileProvider` prende il
         * nome dal file SU DISCO, e sul disco la libreria usa l'id interno
         * (`talos-vault/files/<id>.<est>`). Chi riceve vedeva un UUID.
         *
         * ⇒ Si copia in cache col nome vero e si condivide quella. La cartella
         * di cache e' gia' dichiarata in `file_paths.xml` (`cache-path`), quindi
         * non serve nient'altro, e il sistema la svuota da se'.
         *
         * ⛔ Il nome viene SANIFICATO: arriva dal nome che la persona ha dato al
         * file, e una barra o dei puntini dentro un nome vorrebbero dire
         * scrivere fuori dalla cartella.
         */
        val nomeVero = call.getString("nome").orEmpty()
            .replace(Regex("[\\/:*?\"<>|]"), "_")
            .replace("..", "_")
            .take(120)
            .trim()
        val daMandare = if (nomeVero.isEmpty() || nomeVero == file.name) file else {
            val cartella = java.io.File(context.cacheDir, "talos-condivisi")
            cartella.mkdirs()
            val copia = java.io.File(cartella, nomeVero)
            try {
                file.inputStream().use { dentro -> copia.outputStream().use { fuori -> dentro.copyTo(fuori) } }
                copia
            } catch (errore: java.io.IOException) {
                // Il nome e' una cortesia, il file e' la cosa: se la copia non
                // riesce si manda l'originale con l'id, invece di non mandare.
                android.util.Log.i("TalosDevice", "condividiFile: copia col nome fallita — ${errore.message}")
                file
            }
        }
        val uri = try {
            androidx.core.content.FileProvider.getUriForFile(
                context,
                context.packageName + ".fileprovider",
                daMandare,
            )
        } catch (errore: IllegalArgumentException) {
            // La cartella non e' dichiarata in `file_paths.xml`. E' un difetto
            // nostro, non della persona: si dice cos'e' invece di «non riesco».
            android.util.Log.i("TalosDevice", "condividiFile: cartella non dichiarata — ${errore.message}")
            call.resolve(esito.put("done", false).put("reason", "cartella-non-dichiarata"))
            return
        }
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND)
            .setType(tipo)
            .putExtra(android.content.Intent.EXTRA_STREAM, uri)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.clipData = android.content.ClipData.newRawUri(null, uri)
        call.getString("testo")?.takeIf { it.isNotEmpty() }?.let {
            intent.putExtra(android.content.Intent.EXTRA_TEXT, it)
        }
        call.getString("pacchetto")?.takeIf { it.isNotEmpty() }?.let { intent.setPackage(it) }
        destinatarioDentro(call, intent)
        if (intent.resolveActivity(context.packageManager) == null) {
            call.resolve(esito.put("done", false).put("reason", "nessuno-lo-fa"))
            return
        }
        call.resolve(avvia(intent).put("uri", uri.toString()).put("tipo", tipo))
    }

    /**
     * ⭐⭐⭐ MANDARE UN FILE CHE STA SUL TELEFONO — owner 2026-08-13.
     *
     * > «e poi anche successivamente inviare un file che abbiamo nella memoria,
     * > salvato nel dispositivo, e inviarlo dove voglio noi»
     *
     * ## Perche' un metodo a parte, e non `condividiFile`
     *
     * Quello risolve un percorso DENTRO la nostra cartella privata e ne fabbrica
     * un `content://` col `FileProvider`. Qui il `content://` c'e' gia': arriva
     * dal selettore di sistema, che ce l'ha consegnato insieme al permesso di
     * leggerlo. Rifabbricarlo non si puo' e non serve.
     *
     * ## ⛔ Perche' si passa dal selettore, e non e' una scorciatoia
     *
     * MISURATO nella documentazione, non dedotto: per un file dentro
     * `MediaStore.Downloads` che l'app non ha creato, Android **obbliga** a
     * passare dallo Storage Access Framework. Non esiste una query che lo
     * trovi. Per immagini e video una query esisterebbe, ma vuole i permessi
     * `READ_MEDIA_*` — cioe' l'accesso all'INTERA libreria di foto della
     * persona per mandarne una.
     *
     * ⇒ Il selettore e' la strada che regge per OGNI tipo di file e non chiede
     * nessun permesso pericoloso: la persona sceglie, e quel gesto E' il
     * permesso. E' la «procedura guidata col nostro ponte» per ciò che le API
     * davvero non possono fare.
     *
     * ⛔ Il permesso di lettura si RIGIRA: lo abbiamo noi e lo passiamo a chi
     * riceve con `FLAG_GRANT_READ_URI_PERMISSION` piu' la `ClipData`, che da
     * Android 10 e' quella che il foglio di condivisione copia davvero.
     */
    @PluginMethod
    fun condividiUri(call: PluginCall) {
        val testoUri = call.getString("uri").orEmpty()
        val tipo = call.getString("tipo").orEmpty().ifEmpty { "*/*" }
        val esito = JSObject()
        if (testoUri.isEmpty()) {
            call.resolve(esito.put("done", false).put("reason", "no-uri"))
            return
        }
        val uri = android.net.Uri.parse(testoUri)
        /*
         * ⛔ Solo `content://`. Un `file://` qui lancerebbe
         * `FileUriExposedException` nell'app che riceve — e il punto e' che
         * arriverebbe da noi, quindi il difetto sarebbe nostro e sembrerebbe
         * suo.
         */
        if (uri.scheme != "content") {
            android.util.Log.i("TalosDevice", "condividiUri: schema ${uri.scheme}, rifiuto")
            call.resolve(esito.put("done", false).put("reason", "non-e-content"))
            return
        }
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND)
            .setType(tipo)
            .putExtra(android.content.Intent.EXTRA_STREAM, uri)
            .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            .addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        intent.clipData = android.content.ClipData.newRawUri(null, uri)
        call.getString("testo")?.takeIf { it.isNotEmpty() }?.let {
            intent.putExtra(android.content.Intent.EXTRA_TEXT, it)
        }
        call.getString("pacchetto")?.takeIf { it.isNotEmpty() }?.let { intent.setPackage(it) }
        destinatarioDentro(call, intent)
        if (intent.resolveActivity(context.packageManager) == null) {
            call.resolve(esito.put("done", false).put("reason", "nessuno-lo-fa"))
            return
        }
        call.resolve(avvia(intent).put("uri", testoUri).put("tipo", tipo))
    }

    /**
     * ⭐⭐⭐ LA RIGA DI RUBRICA CON CUI UN'APP FA UNA COSA — se esiste.
     *
     * ## Perche' esiste, e perche' torna `null` senza vergogna
     *
     * Owner, 2026-08-13: «predisponi l'API nativa di WhatsApp se c'e' la riga,
     * se no usiamo il ponte». Questa e' la domanda che decide fra le due.
     *
     * MISURATO sul Pad, tre passaggi:
     * 1. `https://wa.me/<numero>` apre la CHAT, non una chiamata;
     * 2. WhatsApp dichiara `.accountsync.CallContactLandingActivity` per
     *    `ACTION_VIEW` + `vnd.android.cursor.item/vnd.com.whatsapp.voip.call`
     *    ⇒ **l'API esiste**;
     * 3. ⛔ ma nella rubrica di sistema non c'e' nessun account `com.whatsapp`
     *    — solo `com.google` e `tachyon` — quindi **la riga non c'e'**.
     *
     * ⇒ L'API sa fare la cosa; su QUESTO telefono le manca il dato. E' la
     * differenza fra «non si puo'» e «non si puo' qui», e solo il dispositivo
     * la conosce.
     *
     * ⛔ Dalla ricerca (owner: «non dobbiamo inventarci nulla se e' gia'
     * scritto nel web»): il modo e' quello qui sotto — trovare il contatto dal
     * numero, poi la sua riga con quel mimetype. ⛔ **Non e' un'API ufficiale
     * di WhatsApp**: le fonti la chiamano «undocumented or unsupported». Per
     * questo si PROVA e si ripiega, invece di dipenderne.
     *
     * ⛔ Due passaggi e non uno: `PhoneLookup` normalizza il numero come lo fa
     * Android (prefissi, spazi, formati locali). Confrontare stringhe di numeri
     * a mano e' il modo classico di non trovare un contatto che c'e'.
     */
    @PluginMethod
    fun rigaDiContatto(call: PluginCall) {
        val numero = call.getString("numero").orEmpty()
        val mime = call.getString("mime").orEmpty()
        val esito = JSObject()
        if (numero.isEmpty() || mime.isEmpty()) {
            call.resolve(esito.put("uri", null as String?).put("motivo", "richiesta-incompleta"))
            return
        }
        try {
            val lookup = android.net.Uri.withAppendedPath(
                android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                android.net.Uri.encode(numero),
            )
            var contattoId: Long? = null
            context.contentResolver.query(
                lookup,
                arrayOf(android.provider.ContactsContract.PhoneLookup.CONTACT_ID),
                null, null, null,
            )?.use { c -> if (c.moveToFirst()) contattoId = c.getLong(0) }
            val id = contattoId
            if (id == null) {
                call.resolve(esito.put("uri", null as String?).put("motivo", "contatto-non-trovato"))
                return
            }
            var rigaId: Long? = null
            context.contentResolver.query(
                android.provider.ContactsContract.Data.CONTENT_URI,
                arrayOf(android.provider.ContactsContract.Data._ID),
                "${android.provider.ContactsContract.Data.CONTACT_ID}=? AND " +
                    "${android.provider.ContactsContract.Data.MIMETYPE}=?",
                arrayOf(id.toString(), mime),
                null,
            )?.use { c -> if (c.moveToFirst()) rigaId = c.getLong(0) }
            val riga = rigaId
            if (riga == null) {
                // ⛔ «Il contatto c'e' ma quell'app non ha la sua riga» NON e'
                // un errore: e' la risposta, ed e' quella che fa scegliere il
                // ponte. Confonderla con un fallimento farebbe rinunciare.
                call.resolve(esito.put("uri", null as String?).put("motivo", "riga-assente"))
                return
            }
            call.resolve(
                esito.put("uri", "content://com.android.contacts/data/$riga").put("motivo", "trovata"),
            )
        }
        catch (errore: SecurityException) {
            // Senza il permesso contatti la domanda non ha risposta: «non lo so»,
            // che e' diverso da «non c'e'» e porta a un'altra cosa da dire.
            call.resolve(esito.put("uri", null as String?).put("motivo", "senza-permesso"))
        }
    }

    /** L'app c'e'? Serve a spiegare un fallimento, non a vietare un tentativo. */
    @PluginMethod
    fun appInstallata(call: PluginCall) {
        val pacchetto = call.getString("package").orEmpty()
        val presente = pacchetto.isNotEmpty() &&
            context.packageManager.getLaunchIntentForPackage(pacchetto) != null
        call.resolve(JSObject().put("presente", presente))
    }

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
        /*
         * ⭐⭐⭐ LA PAGINA DOVE TALOS C'E' DAVVERO — misurato sul Pad, 2026-08-17.
         *
         * Aperte le impostazioni di accessibilita', su questo telefono si vede:
         * «Menu Accessibilita'», «Pulsante Accessibilita'», «Scelta rapida dalla
         * schermata di blocco», «App scaricate». TALOS NON C'E': sta dentro «App
         * scaricate», un livello sotto. E la nostra frase diceva «trova TALOS
         * nella lista».
         *
         * ⛔ Chiesto al telefono, non scritto a memoria. `dumpsys package`
         * elenca un'AZIONE — non un nome di classe da far invecchiare con la
         * prossima ROM:
         *
         *   oplus.intent.action.settings.ACCESSIBILITY_DOWNLOAD
         *
         * ⛔ E NON e' l'ACTION_ACCESSIBILITY_DETAILS_SETTINGS di AOSP, che
         * porterebbe dritti alla scheda del servizio con la levetta: quella e'
         * chiusa a un'app normale — il telefono dice `prot=signature|installer`.
         *
         * ⇒ Si prova la piu' precisa e si torna sempre alla generale. Su un
         * telefono che non e' OPPO/OnePlus l'azione non risolve e non succede
         * niente: nessun ramo, nessuna condizione sul produttore.
         */
        val piuPrecisa = when (azione) {
            Settings.ACTION_ACCESSIBILITY_SETTINGS ->
                "oplus.intent.action.settings.ACCESSIBILITY_DOWNLOAD"
            else -> null
        }
        if (piuPrecisa != null && !perQuestaApp) {
            /*
             * ⛔ `chiedendoPrima = true`, al contrario delle due righe sotto: qui
             * NON e' un'azione di sistema che il filtro di visibilita' nasconde,
             * e' un'azione di UN produttore. Chiedere prima costa una query e
             * evita di far partire un intent che quasi ovunque non risolve.
             */
            val preciso = avvia(Intent(piuPrecisa), chiedendoPrima = true)
            if (preciso.optBoolean("done", false)) {
                preciso.put("scope", "service")
                call.resolve(preciso)
                return
            }
        }
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
        /*
         * ⛔⛔ «COLLEGATO» E «IN CARICA» SONO DUE FATTI DIVERSI — MISURATO.
         *
         * Owner, 2026-08-15: TALOS ha risposto «l'89%, dispositivo **non in
         * carica**» col cavo attaccato. Il telefono, nello stesso istante:
         *
         *     USB powered: true      ← il cavo C'È
         *     status: 4              ← BATTERY_STATUS_NOT_CHARGING
         *
         * Cioè `isCharging` diceva il vero — ColorOS a 89% col porto da 500 mA
         * **smette** di caricare — ma la frase che ne usciva suonava come «non
         * sei collegato», che è falso. Un fatto vero detto in modo che si legge
         * come un altro fatto è una bugia con l'alibi.
         *
         * ⇒ Si consegnano TUTTI E DUE, e il terzo stato — collegato ma fermo —
         * smette di essere invisibile. È anche l'unico che spiega perché la
         * percentuale non sale.
         */
        runCatching {
            val stato = context.registerReceiver(
                null,
                android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED),
            )
            val spina = stato?.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) ?: 0
            val codice = stato?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            result.put("plugged", spina != 0)
            result.put(
                "power",
                when {
                    spina == 0 -> "unplugged"
                    codice == BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
                    codice == BatteryManager.BATTERY_STATUS_FULL -> "plugged-full"
                    // ⛔ Il terzo stato, quello che mancava: cavo attaccato e
                    // batteria ferma. Il telefono lo fa apposta, e va detto.
                    else -> "plugged-not-charging"
                },
            )
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
            /*
             * ⭐⭐⭐ IL PALLINO NASCE QUI — un istante PRIMA di cedere lo schermo.
             *
             * ## Il difetto, owner 2026-08-15
             *
             * > «apre WhatsApp, mette il messaggio nel campo, **la barra
             * > assistente non ricompare**, e se dico "invia" non invia nulla.»
             *
             * ## ⛔ Perché il momento è QUESTO e non un altro
             *
             * Rientrare dopo aver ceduto lo schermo è un background activity
             * launch: su Android 15+ serve `SYSTEM_ALERT_WINDOW` **e una
             * finestra ancora visibile**. ⇒ La finestra deve esistere **prima**
             * che TALOS sparisca, non dopo: dopo, il diritto è già decaduto.
             *
             * ## ⛔ E perché non nel ciclo di vita della barra, dove l'avevo messo
             *
             * MISURATO sul Pad, con TALOS che apriva Chrome da solo:
             *
             * ```
             *   TalosBarra: davanti=false (onPause) personaAndataVia=true
             *   TalosBarra: onDestroy
             * ```
             *
             * Due sorprese in due righe. La barra non va in background: **muore**.
             * E `onUserLeaveHint` scatta **anche quando è TALOS ad aprire l'app**
             * — cioè il contrario di ciò che il commento in `TalosBarraActivity`
             * dava per contratto. ⇒ Dal ciclo di vita della barra non si può
             * distinguere «me ne sto andando io» da «mi hanno mandato via», e su
             * quella distinzione il pallino non compariva mai.
             *
             * Qui invece non c'è niente da indovinare: **siamo noi che apriamo**.
             *
             * ⛔ E vale per OGNI app, che è la richiesta dell'owner
             * («universale per tutte le app possibili»): questo è l'unico
             * `startActivity` di questo plugin, ci passano tutte.
             */

        /*
         * ⛔⛔ STACCATO IL 2026-08-15 — e si stacca invece di lasciare un crash.
         *
         * Il pallino FUNZIONA: misurato `attaccato=true 126x126 visibile=true`,
         * visibile sopra Chrome nello scatto. Ma il servizio che deve tenerlo in
         * vita non riesce a prendere il primo piano in tempo, e Android uccide
         * l'app con `ForegroundServiceDidNotStartInTimeException` — cioè un
         * CRASH, a venti secondi da ogni apertura di app.
         *
         * Provate e MISURATE, in ordine:
         *   1. permesso `FOREGROUND_SERVICE_SPECIAL_USE` mancante → aggiunto,
         *      crash uguale;
         *   2. `startForeground` spostato da `onStartCommand` a `onCreate`
         *      (il sistema diceva «Bringing down service while still waiting for
         *      start foreground») → crash uguale.
         *
         * ⇒ Manca ancora una condizione, e non la conosco. Consegnare una
         * funzione che fa saltare l'app a ogni apertura è peggio di consegnarla
         * mancante: la riga si riaccende quando il servizio regge, e la prova
         * che deve passare è «apri Chrome, aspetta un minuto, l'app è viva».
         */
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

    /**
     * ⭐⭐⭐ GUARDARE UN PDF DENTRO TALOS — e senza un solo byte di libreria.
     *
     * ## Il difetto, misurato sul Pad il 2026-08-17
     *
     * TALOS genera un PDF, lo salva in Libreria, e la scheda lo mostra col nome
     * e il peso. Toccandola non succede NIENTE: e un etichetta muta. L owner:
     * «il PDF bisogna poterlo visualizzare dentro la app».
     *
     * ## ⛔ Perche il renderer di Android e non una libreria
     *
     * Cercato prima di scrivere, ed e una scelta con dei numeri dietro:
     *
     *   PdfRenderer (framework)   0 byte di APK, 0 dipendenze, da API 21
     *   AndroidPdfViewer/Pdfium   ~16 MB di .so, una copia per architettura
     *   pdf.js dentro la WebView  megabyte di JS nel grafo d avvio, che ha
     *                             un tetto di 605.000 byte
     *
     * ⇒ La terza sarebbe stata la piu comoda da scrivere e l unica che non
     * possiamo permetterci: il tetto d avvio esiste perche il motore locale
     * gira su questo telefono, e un visualizzatore non e una ragione per
     * alzarlo.
     *
     * ## ⛔ Rende UNA pagina per chiamata, e dice quante ce ne sono
     *
     * Rendere tutto insieme vorrebbe dire tenere N bitmap a piena risoluzione
     * in memoria per un documento di cui la persona guardera la prima pagina.
     * Chi chiama sfoglia; noi rispondiamo una pagina alla volta e diciamo
     * `pagine` cosi sa dove puo andare.
     *
     * ⛔ E la larghezza la decide CHI CHIAMA, perche solo lui sa quanto e largo
     * lo schermo. Un valore scritto qui sarebbe un telefono indovinato.
     */
    @PluginMethod
    fun renderizzaPdf(call: PluginCall) {
        val percorso = call.getString("percorso").orEmpty()
        val pagina = call.getInt("pagina") ?: 0
        val larghezza = (call.getInt("larghezza") ?: 1080).coerceIn(200, 4096)
        if (percorso.isEmpty()) {
            call.resolve(JSObject().put("done", false).put("reason", "no-path"))
            return
        }
        var descrittore: android.os.ParcelFileDescriptor? = null
        var renderer: android.graphics.pdf.PdfRenderer? = null
        try {
            /*
             * ⛔ Si accetta sia un `content://` sia un percorso di file: la
             * Libreria conserva `private_uri`, e chi ha scelto un file dal
             * telefono ha un content URI. Indovinare quale sia vorrebbe dire
             * funzionare per una sorgente sola.
             */
            descrittore = if (percorso.startsWith("content://")) {
                context.contentResolver.openFileDescriptor(Uri.parse(percorso), "r")
            } else {
                /*
                 * ⛔⛔ IL PERCORSO DELLA LIBRERIA E' RELATIVO — e il primo giro
                 * sul Pad e' fallito esattamente qui.
                 *
                 * Il visualizzatore si apriva e diceva «Non sono riuscito ad
                 * aprire questo PDF». Il motivo l'ho saputo perche' lo faccio
                 * VIAGGIARE: senza, sarebbe stato un riquadro vuoto e avrei
                 * cercato il difetto nel renderer.
                 *
                 * `private_uri` non e' un percorso di sistema: e' una chiave
                 * RELATIVA dentro `Directory.Data` di Capacitor — per esempio
                 * `talos-vault/files/abc.pdf`. Da qui, aprirla come file
                 * assoluto cerca `/talos-vault/...` sulla radice, che non
                 * esiste.
                 *
                 * ⇒ Un percorso che non comincia per `/` si risolve dentro
                 * `filesDir`, che e' cio' che `Directory.Data` significa sul
                 * lato Android. E' la stessa famiglia del valore che muore
                 * all'ultimo ponte: giusto per quattro strati, sbagliato nel
                 * quinto.
                 */
                val file = java.io.File(percorso.removePrefix("file://"))
                val vero = if (file.isAbsolute) file else java.io.File(context.filesDir, percorso)
                if (!vero.exists()) {
                    call.resolve(
                        JSObject().put("done", false).put("reason", "not-found"),
                    )
                    return
                }
                android.os.ParcelFileDescriptor.open(
                    vero,
                    android.os.ParcelFileDescriptor.MODE_READ_ONLY,
                )
            }
            if (descrittore == null) {
                call.resolve(JSObject().put("done", false).put("reason", "not-readable"))
                return
            }
            renderer = android.graphics.pdf.PdfRenderer(descrittore)
            val quante = renderer.pageCount
            if (quante == 0) {
                call.resolve(JSObject().put("done", false).put("reason", "empty").put("pagine", 0))
                return
            }
            /*
             * ⛔ La pagina si LIMITA invece di far esplodere: una richiesta
             * fuori intervallo e un errore di chi chiama, e restituire la prima
             * pagina con `pagine` accanto gli dice come rimediare. Un'eccezione
             * qui diventerebbe uno schermo bianco senza spiegazione.
             */
            val quale = pagina.coerceIn(0, quante - 1)
            val foglio = renderer.openPage(quale)
            val altezza = (larghezza.toLong() * foglio.height / foglio.width).toInt().coerceAtLeast(1)
            val tela = android.graphics.Bitmap.createBitmap(
                larghezza, altezza, android.graphics.Bitmap.Config.ARGB_8888,
            )
            /*
             * ⛔ Fondo BIANCO prima di rendere. Un PDF disegna solo il proprio
             * inchiostro: senza questa riga il resto resta trasparente, e su un
             * tema scuro un documento nero su bianco diventa nero su nero —
             * cioe illeggibile, con TALOS che dice di averlo mostrato.
             */
            tela.eraseColor(android.graphics.Color.WHITE)
            foglio.render(tela, null, null, android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            foglio.close()
            val sacco = java.io.ByteArrayOutputStream()
            tela.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, sacco)
            tela.recycle()
            call.resolve(
                JSObject()
                    .put("done", true)
                    .put("pagine", quante)
                    .put("pagina", quale)
                    .put("larghezza", larghezza)
                    .put("altezza", altezza)
                    .put(
                        "png",
                        "data:image/png;base64,"
                            + android.util.Base64.encodeToString(sacco.toByteArray(), android.util.Base64.NO_WRAP),
                    ),
            )
        } catch (e: Exception) {
            // ⛔ Il motivo VIAGGIA: «non si apre» e «non e un PDF» portano a due
            // frasi diverse per chi legge, e a due decisioni diverse.
            call.resolve(
                JSObject().put("done", false).put("reason", e.javaClass.simpleName),
            )
        } finally {
            try { renderer?.close() } catch (_: Exception) {}
            try { descrittore?.close() } catch (_: Exception) {}
        }
    }
}
