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
import android.os.StatFs
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.AlarmClock
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
        val intent = Intent(azione)
        // Alcune schermate vogliono sapere DI CHI parlano — i permessi
        // speciali, per esempio — e senza il pacchetto aprono l'elenco di
        // tutte le app invece della nostra riga.
        if (call.getBoolean("forThisApp", false) == true) {
            intent.data = Uri.fromParts("package", context.packageName, null)
        }
        call.resolve(avvia(intent))
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
            "call" -> Intent(Intent.ACTION_DIAL, Uri.parse("tel:$valore"))
            "sms" -> Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$valore"))
                .putExtra("sms_body", call.getString("text").orEmpty())
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
    private fun avvia(intent: Intent): JSObject {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val result = JSObject()
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
}
