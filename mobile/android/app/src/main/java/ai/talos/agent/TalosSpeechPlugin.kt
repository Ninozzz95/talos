package ai.talos.agent

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.speech.tts.TextToSpeech
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
 * **2. Rispetta il silenzioso.** Un telefono in vibrazione o in silenzioso è
 * una persona che ha detto «non fare rumore». Parlare lo stesso è ignorare una
 * richiesta esplicita, ed è il modo più rapido di far spegnere la voce per
 * sempre. Si controlla il profilo PRIMA, e si risponde `spoken: false` con il
 * motivo — non si finge di aver parlato.
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
        val result = JSObject()
        result.put("available", motore != null)
        result.put("speaking", stoParlando)
        result.put("silenced", audio?.ringerMode != AudioManager.RINGER_MODE_NORMAL)
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

        val forzato = call.getBoolean("force", false) == true
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        if (!forzato && audio?.ringerMode != AudioManager.RINGER_MODE_NORMAL) {
            // ⛔ Non si finge di aver parlato: chi chiama deve poter mostrare
            // «il telefono e' in silenzioso» invece di un'icona che si accende
            // e si spegne senza che esca un suono.
            result.put("spoken", false)
            result.put("reason", "silenced")
            call.resolve(result)
            return
        }

        // La lingua dell'interfaccia, non quella del telefono: TALOS risponde
        // nella lingua in cui sta parlando, e sono due cose che possono
        // divergere.
        call.getString("language")?.let { tag ->
            runCatching { tts.language = Locale.forLanguageTag(tag) }
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
