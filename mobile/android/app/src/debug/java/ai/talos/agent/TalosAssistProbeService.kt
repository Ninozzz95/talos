package ai.talos.agent

import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.content.Intent
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log

/**
 * E0 — la prova che decide se TALOS puo' leggere lo schermo GRATIS.
 *
 * ## La domanda, precisa
 *
 * Chiedere il ruolo di assistente (D8) e' «la porta piu' economica alla lettura
 * schermo»: se il sistema consegna una `AssistStructure`, TALOS vede l'albero
 * della finestra in primo piano **senza** AccessibilityService e **senza**
 * MediaProjection — cioe' senza i due permessi che Google tratta come sensibili
 * e che l'utente vede come invasivi.
 *
 * Ma su ColorOS non e' verificato da nessuna fonte. Quindi si prova.
 *
 * ## Cosa registra, e perche' cosi'
 *
 * Scrive in logcat con un tag fisso: la prova la legge `adb logcat`, non un
 * pezzo di interfaccia. Un'interfaccia costerebbe codice nel processo
 * principale — e questa e' una sonda, non una funzione.
 *
 * ⛔ Vive nel source set `debug`: un `VoiceInteractionService` in una build di
 * rilascio e' una promessa all'utente, e questa e' una domanda a noi stessi.
 */
class TalosAssistProbeService : VoiceInteractionService() {

    override fun onReady() {
        super.onReady()
        Log.i(TAG, "$MARK service-ready")
    }

    companion object {
        const val TAG = "TalosAssistProbe"
        const val MARK = "talos.e0"
    }
}

/** La fabbrica della sessione: il sistema la crea quando l'assistente e' invocato. */
class TalosAssistProbeSessionService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession =
        TalosAssistProbeSession(this)
}

/**
 * La sessione, che e' dove arriva la risposta alla domanda.
 *
 * `onHandleAssist` riceve la struttura della finestra in primo piano. Se arriva
 * **non nulla e con almeno una finestra**, la lettura schermo tramite ruolo
 * assistente funziona su ColorOS. Se arriva nulla, non funziona — e D19
 * (`screen_read`) deve passare da un'altra porta.
 */
class TalosAssistProbeSession(service: TalosAssistProbeSessionService) :
    VoiceInteractionSession(service) {

    override fun onHandleAssist(state: AssistState) {
        super.onHandleAssist(state)
        val structure: AssistStructure? = state.assistStructure
        val content: AssistContent? = state.assistContent
        val windows = structure?.windowNodeCount ?: -1
        // Il conteggio dei nodi del primo albero: una struttura con zero nodi
        // e' una struttura vuota, e vuota vuol dire «non funziona» anche se
        // l'oggetto non e' nullo.
        val nodi = if (windows > 0) {
            contaNodi(structure!!.getWindowNodeAt(0).rootViewNode)
        } else 0
        Log.i(
            TalosAssistProbeService.TAG,
            "${TalosAssistProbeService.MARK} assist" +
                " structure=${structure != null}" +
                " windows=$windows" +
                " nodes=$nodi" +
                " content=${content != null}",
        )
        hide()
    }

    override fun onHandleScreenshot(screenshot: android.graphics.Bitmap?) {
        super.onHandleScreenshot(screenshot)
        Log.i(
            TalosAssistProbeService.TAG,
            "${TalosAssistProbeService.MARK} screenshot present=${screenshot != null}",
        )
    }

    private fun contaNodi(node: AssistStructure.ViewNode?): Int {
        if (node == null) return 0
        var totale = 1
        for (index in 0 until node.childCount) totale += contaNodi(node.getChildAt(index))
        return totale
    }
}

/**
 * Il riconoscimento vocale che il ruolo assistente pretende.
 *
 * Non riconosce niente: esiste perche' senza un `RecognitionService` dichiarato
 * il sistema, su diverse versioni, rifiuta di assegnare il ruolo. E' un
 * requisito di forma, e va soddisfatto per poter fare la domanda vera.
 */
class TalosAssistProbeRecognition : android.speech.RecognitionService() {
    override fun onStartListening(intent: Intent?, listener: Callback?) {
        listener?.error(android.speech.SpeechRecognizer.ERROR_CLIENT)
    }
    override fun onCancel(listener: Callback?) = Unit
    override fun onStopListening(listener: Callback?) = Unit
}
