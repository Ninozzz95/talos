package ai.talos.agent

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Build
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.speech.tts.UtteranceProgressListener
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale

/**
 * ⭐ TALOS che PARLA.
 *
 * Owner 2026-08-08: «un pulsante flottante o una parola magica che chiama TALOS
 * e lo fa parlare». Questa è la metà che parla; ascoltare lo sa già fare.
 *
 * ⭐ Non chiede **nessun permesso**: `TextToSpeech` è a disposizione di
 * chiunque. È la capacità con il rapporto valore/costo più alto di tutto
 * l'inventario.
 *
 * ## ⛔ Le tre cose che rendono una voce sopportabile
 *
 * **1. Si ferma.** Una voce che non si interrompe è peggio di nessuna voce: chi
 * l'ha fatta partire per sbaglio in una stanza con altre persone deve poterla
 * spegnere *subito*, non aspettare la fine del paragrafo. È lo stesso difetto
 * dello Stop che abbiamo già pagato una volta sul motore locale — lì il segnale
 * arrivava al JS e non al nativo, e il modello continuava a macinare.
 *
 * **2. ⛔ RIVISTA dall'owner il 2026-08-10: conta il VOLUME, non la suoneria.**
 *
 * Diceva: «un telefono in silenzioso è una persona che ha detto non fare
 * rumore», e rifiutava di parlare se `ringerMode != NORMAL`. Owner, parole sue:
 * «bisogna fare in modo che il volume del TTS si senta anche quando il telefono
 * è silenzioso. Basta che il volume non zero».
 *
 * Ed è la lettura giusta di Android, non un'eccezione: la suoneria in
 * silenzioso zittisce **squilli e notifiche** — cose che arrivano da fuori e
 * non le hai chieste. Una lettura ad alta voce l'hai chiesta tu, adesso, ed è
 * dell'altra famiglia: media e accessibilità. Il segnale onesto è **il volume
 * del flusso su cui esce la voce**: se è a zero non si sentirebbe comunque, e
 * allora si dice; se non è a zero, si parla.
 *
 * ⇒ La voce esce con `USAGE_ASSISTANCE_ACCESSIBILITY`, che è esattamente
 * «qualcuno legge a voce alta per me» e Android non lo tratta come una
 * notifica.
 *
 * **3. Dice quando ha finito.** L'interfaccia deve poter mostrare che sta
 * parlando e smettere di mostrarlo al momento giusto. Senza, resta un'icona
 * accesa su una stanza silenziosa.
 *
 * ## Perché il motore si tiene aperto
 *
 * `TextToSpeech` ci mette qualche centinaio di millisecondi a inizializzarsi, e
 * crearlo a ogni frase metterebbe quel ritardo davanti a ogni risposta —
 * proprio nel momento in cui la persona sta aspettando di sentire qualcosa. Si
 * apre una volta e si chiude quando il plugin muore.
 */
@CapacitorPlugin(name = "TalosSpeech")
class TalosSpeechPlugin : Plugin() {

    private var motore: TextToSpeech? = null
    /** Vero fra `speak` e la fine — l'interfaccia lo usa per l'indicatore. */
    @Volatile private var stoParlando = false

    override fun load() {
        // ⛔ `load()` gira sul thread CONDIVISO dei plugin: quello che ferma
        // tutti gli altri se lo si blocca. Qui va bene — misurato 2 ms, perche'
        // il costruttore di TextToSpeech si aggancia al servizio e torna
        // subito, e l'esito arriva nella richiamata. Se un giorno qualcuno
        // aggiunge qui una cosa che ASPETTA, il prezzo lo paga tutta l'app:
        // la spiegazione lunga sta su TalosPrivilegePlugin.sulPonte.
        motore = TextToSpeech(context) { stato ->
            if (stato != TextToSpeech.SUCCESS) {
                motore = null
                return@TextToSpeech
            }
            motore?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    stoParlando = true
                    notifyListeners("talosSpeechStarted", JSObject())
                }

                override fun onDone(utteranceId: String?) {
                    stoParlando = false
                    notifyListeners("talosSpeechDone", JSObject())
                }

                @Deprecated("Il contratto vecchio; il nuovo arriva sotto.")
                override fun onError(utteranceId: String?) {
                    stoParlando = false
                    notifyListeners("talosSpeechDone", JSObject())
                }

                override fun onError(utteranceId: String?, errorCode: Int) {
                    stoParlando = false
                    val payload = JSObject()
                    payload.put("errorCode", errorCode)
                    notifyListeners("talosSpeechDone", payload)
                }
            })
        }
    }

    override fun handleOnDestroy() {
        runCatching {
            motore?.stop()
            motore?.shutdown()
        }
        motore = null
    }

    /**
     * Se si può parlare adesso, e se no perché.
     *
     * ⛔ Una lettura, come la fotografia dei privilegi: chi disegna
     * l'interfaccia deve poter sapere se offrire il pulsante della voce, senza
     * doverlo scoprire facendola partire.
     */
    @PluginMethod
    fun status(call: PluginCall) {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val flusso = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioManager.STREAM_ACCESSIBILITY
        } else {
            AudioManager.STREAM_MUSIC
        }
        val result = JSObject()
        result.put("available", motore != null)
        result.put("speaking", stoParlando)
        /*
         * ⛔ `silenced` ADESSO VUOL DIRE «non uscirebbe suono», non «la
         * suoneria è giù» — owner 2026-08-10. Il nome è rimasto perché è quello
         * che l'interfaccia deve sapere; è cambiata la domanda che risponde.
         * Il profilo silenzioso non zittisce la voce: solo il volume a zero.
         */
        val volume = audio?.getStreamVolume(flusso) ?: 0
        val volumeMedia = audio?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 0
        result.put("silenced", volume == 0 && volumeMedia == 0)
        result.put("volume", volume)
        result.put("volumeMax", audio?.getStreamMaxVolume(flusso) ?: 0)
        result.put("ringerSilent", audio?.ringerMode != AudioManager.RINGER_MODE_NORMAL)
        call.resolve(result)
    }

    /**
     * ⭐⭐ LE VOCI VERE DEL DISPOSITIVO, con la loro qualità dichiarata.
     *
     * Owner 2026-08-10: «la voce è troppo robotica… voglio il meglio del
     * meglio». Il primo passo non è installare niente: è **smettere di
     * accettare la voce predefinita**. Android espone `tts.voices` con
     * `quality`, `latency`, se serve la rete, e le `features` — fra cui
     * `notInstalled`, che distingue una voce che si può scaricare da una che
     * non c'è.
     *
     * ⛔ Su questo telefono il motore è uno solo (`com.google.android.tts`) e
     * nessuna preferenza è salvata: TALOS stava usando **quella che capitava**.
     * Con questo elenco si può scegliere la migliore, e farlo vedere.
     *
     * Ogni voce porta:
     *  · `name`      l'id da passare a `setVoice`
     *  · `locale`    il tag BCP-47
     *  · `quality`   100/300/400/500 secondo Android (più alto è meglio)
     *  · `network`   se ha bisogno della rete (più bella, ma non offline)
     *  · `notInstalled` se va scaricata prima
     *  · `latency`   quanto ci mette a partire
     */
    @PluginMethod
    fun voices(call: PluginCall) {
        val tts = motore
        val result = JSObject()
        if (tts == null) {
            result.put("available", false)
            result.put("reason", "unavailable")
            call.resolve(result)
            return
        }
        val elenco = org.json.JSONArray()
        runCatching {
            val tutte: Set<Voice> = tts.voices ?: emptySet()
            for (v in tutte) {
                val riga = JSObject()
                riga.put("name", v.name)
                riga.put("locale", v.locale.toLanguageTag())
                riga.put("quality", v.quality)
                riga.put("latency", v.latency)
                riga.put("network", v.isNetworkConnectionRequired)
                riga.put(
                    "notInstalled",
                    v.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) == true,
                )
                elenco.put(riga)
            }
        }
        result.put("available", true)
        result.put("voices", elenco)
        result.put("current", runCatching { tts.voice?.name }.getOrNull())
        result.put("engine", runCatching { tts.defaultEngine }.getOrNull())
        call.resolve(result)
    }

    /**
     * Sceglie una voce per nome, e dice se ci è riuscito.
     *
     * ⛔ Non si fida del nome: se il motore la rifiuta si risponde `false`,
     * perché una preferenza salvata che il motore ignora è peggio di nessuna
     * preferenza — la persona crede di aver scelto e sente altro.
     */
    @PluginMethod
    fun setVoice(call: PluginCall) {
        val nome = call.getString("name").orEmpty()
        val tts = motore
        val result = JSObject()
        if (tts == null || nome.isEmpty()) {
            result.put("done", false)
            result.put("reason", if (tts == null) "unavailable" else "no-name")
            call.resolve(result)
            return
        }
        val voce = runCatching { tts.voices?.firstOrNull { it.name == nome } }.getOrNull()
        if (voce == null) {
            result.put("done", false)
            result.put("reason", "not-found")
            call.resolve(result)
            return
        }
        val esito = runCatching { tts.setVoice(voce) }.getOrDefault(TextToSpeech.ERROR)
        result.put("done", esito == TextToSpeech.SUCCESS)
        if (esito != TextToSpeech.SUCCESS) result.put("reason", "refused")
        call.resolve(result)
    }

    /**
     * Parla — o dice onestamente perché non l'ha fatto.
     *
     * `force` esiste per il caso in cui la persona ha appena premuto «leggi ad
     * alta voce»: lì il silenzioso non è più una richiesta di non fare rumore,
     * è una configurazione che l'ha preceduta. Ma il predefinito e' rispettarlo.
     */
    @PluginMethod
    fun speak(call: PluginCall) {
        val testo = call.getString("text")?.trim().orEmpty()
        val result = JSObject()
        if (testo.isEmpty()) {
            result.put("spoken", false)
            result.put("reason", "empty")
            call.resolve(result)
            return
        }
        val tts = motore
        if (tts == null) {
            result.put("spoken", false)
            result.put("reason", "unavailable")
            call.resolve(result)
            return
        }

        /*
         * ⛔ IL CANCELLO È IL VOLUME, NON LA SUONERIA — owner 2026-08-10.
         *
         * Prima c'era `ringerMode != NORMAL` → rifiuto. Ma il silenzioso
         * zittisce ciò che arriva da fuori (squilli, notifiche), non ciò che la
         * persona ha appena chiesto. La domanda onesta è una sola: **uscirebbe
         * un suono?** E la risposta sta nel volume del flusso su cui parliamo.
         *
         * `force` resta e ora vuol dire «parla comunque»: serve a chi ha appena
         * premuto «leggi ad alta voce» su un telefono col volume a zero, per
         * far dire all'interfaccia «alza il volume» invece di tacere e basta.
         */
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val forzato = call.getBoolean("force", false) == true
        val flusso = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioManager.STREAM_ACCESSIBILITY
        } else {
            AudioManager.STREAM_MUSIC
        }
        val volume = audio?.getStreamVolume(flusso) ?: 0
        val volumeMedia = audio?.getStreamVolume(AudioManager.STREAM_MUSIC) ?: 0
        if (!forzato && volume == 0 && volumeMedia == 0) {
            // ⛔ Non si finge di aver parlato: chi chiama deve poter dire «alza
            // il volume» invece di mostrare un'icona che si accende e si spegne
            // senza che esca un suono.
            result.put("spoken", false)
            result.put("reason", "volume-zero")
            call.resolve(result)
            return
        }

        // La lingua dell'interfaccia, non quella del telefono: TALOS risponde
        // nella lingua in cui sta parlando, e sono due cose che possono
        // divergere.
        call.getString("language")?.let { tag ->
            runCatching { tts.language = Locale.forLanguageTag(tag) }
        }

        /*
         * ⭐ LA VOCE ESCE COME «QUALCUNO LEGGE PER ME», non come una notifica.
         *
         * `USAGE_ASSISTANCE_ACCESSIBILITY` è la famiglia dei lettori di
         * schermo: Android la instrada su `STREAM_ACCESSIBILITY`, che ha il
         * suo cursore del volume e **non** viene zittita dal profilo
         * silenzioso. È la traduzione esatta della richiesta dell'owner —
         * «basta che il volume non sia zero» — invece di un'eccezione scritta
         * a mano.
         *
         * ⛔ Si applica a ogni frase e non una volta sola: `setAudioAttributes`
         * vale per le chiamate successive, e un motore che si riavvia (cambio
         * di voce, aggiornamento del servizio) tornerebbe al predefinito.
         */
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            runCatching {
                tts.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build(),
                )
            }
        }

        /*
         * ⛔⛔ VELOCITÀ E TONALITÀ, che prima non arrivavano MAI.
         *
         * Owner 2026-08-10: «quando cambio un parametro della voce, la voce si
         * deve aggiornare». MISURATO leggendo il codice: `speak` riceveva solo
         * `{ text }`, e in questo file non comparivano né `setSpeechRate` né
         * `setPitch`. ⇒ I due cursori del pannello erano **inerti su Android**:
         * non è che la voce non si aggiornava, è che non era mai cambiata.
         *
         * ⛔ Si applicano a OGNI frase, come la voce: il motore torna ai valori
         * predefiniti quando il servizio si riavvia, e una preferenza applicata
         * una volta sola è una preferenza che un giorno sparisce da sola.
         *
         * I limiti sono quelli di Android — `setSpeechRate` e `setPitch`
         * accettano da 0 in su, e sotto 0,1 la voce diventa incomprensibile.
         * Si stringe qui invece di fidarsi del chiamante: un cursore rotto non
         * deve poter produrre una voce inutilizzabile.
         */
        call.getFloat("rate")?.let { v ->
            runCatching { tts.setSpeechRate(v.coerceIn(0.1f, 3.0f)) }
        }
        call.getFloat("pitch")?.let { v ->
            runCatching { tts.setPitch(v.coerceIn(0.1f, 2.0f)) }
        }

        val id = "talos-${System.nanoTime()}"
        // QUEUE_FLUSH: una frase nuova ZITTISCE la precedente. Accodarle
        // significherebbe che chi manda due messaggi si sente leggere il primo
        // mentre guarda il secondo.
        val esito = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            tts.speak(testo, TextToSpeech.QUEUE_FLUSH, null, id)
        } else {
            @Suppress("DEPRECATION")
            tts.speak(testo, TextToSpeech.QUEUE_FLUSH, null)
        }
        result.put("spoken", esito == TextToSpeech.SUCCESS)
        if (esito != TextToSpeech.SUCCESS) result.put("reason", "refused")
        call.resolve(result)
    }

    /**
     * Zitto, adesso.
     *
     * ⛔ Il metodo che rende accettabile tutto il resto. `stop()` sul motore
     * nativo, non una bandiera in JavaScript: e' esattamente la distinzione che
     * ci era costata lo Stop del modello locale, dove il segnale arrivava al JS
     * e il nativo continuava.
     */
    @PluginMethod
    fun stop(call: PluginCall) {
        runCatching { motore?.stop() }
        stoParlando = false
        val result = JSObject()
        result.put("stopped", true)
        call.resolve(result)
    }
}
