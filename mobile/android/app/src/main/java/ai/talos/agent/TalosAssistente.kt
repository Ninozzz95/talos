package ai.talos.agent

import android.app.assist.AssistContent
import android.app.assist.AssistStructure
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.util.Log

/**
 * ⭐⭐ TALOS COME ASSISTENTE DEL TELEFONO — lo chiami e c'è.
 *
 * Owner 2026-08-08: «un pulsante flottante o una parola magica che chiama TALOS
 * e lo fa parlare». Poi, l'11 agosto, il via a promuovere la sonda a funzione.
 *
 * ## ⭐ Perché questa strada e non l'accessibilità
 *
 * MISURATO sul Pad l'11 agosto, con TALOS nominato assistente e il gesto
 * provocato:
 *
 *     talos.e0 assist structure=true windows=1 nodes=49  content=true
 *     talos.e0 screenshot present=true
 *
 * E non è un guscio: i nodi seguono la schermata — **49** su Impostazioni,
 * **212** sull'elenco app, 143 dentro TALOS.
 *
 * | per vedere lo schermo     | cosa si chiede alla persona            |
 * |---------------------------|----------------------------------------|
 * | servizio di accessibilità | una schermata di sistema con un avviso serio |
 * | MediaProjection           | un permesso a ogni sessione, barra rossa |
 * | **ruolo assistente**      | **una scelta sola, e dà anche l'immagine** |
 *
 * ⛔ E NON sostituisce l'occhio del pilota: questo arriva quando la persona
 * CHIAMA, quello guarda in continuazione. Sono l'invito e il permesso
 * permanente, e servono tutti e due.
 *
 * ## ⛔ Perché adesso sta in `main` e prima stava in `debug`
 *
 * Il commento della sonda diceva: «un VoiceInteractionService in una build di
 * rilascio è una promessa all'utente, questa è una domanda a noi stessi». La
 * domanda ha risposto sì, quindi la promessa si può fare — ma resta una
 * promessa: da qui in poi TALOS **compare** fra gli assistenti che il telefono
 * offre, e chi lo sceglie si aspetta che risponda.
 */
class TalosAssistente : VoiceInteractionService() {

    override fun onReady() {
        super.onReady()
        Log.i(TAG, "$SEGNO pronto")
    }

    companion object {
        const val TAG = "TalosAssistente"
        const val SEGNO = "talos.assist"

        /**
         * L'ultimo contesto raccolto, per chi lo chiede subito dopo.
         *
         * ⛔ Solo un CONTEGGIO e un istante, non l'albero e non l'immagine.
         * Tenere in memoria lo schermo di un'altra app finché qualcuno passa a
         * riprenderselo è esattamente il genere di cosa che un assistente non
         * deve fare di nascosto: quando servirà davvero, passerà per un
         * consenso e per una porta dichiarata, non per una variabile statica.
         */
        @Volatile var nodiVisti: Int = 0
            private set

        @Volatile var immagineVista: Boolean = false
            private set

        internal fun annota(nodi: Int, immagine: Boolean) {
            nodiVisti = nodi
            immagineVista = immagine
        }
    }
}

/** La fabbrica della sessione: il sistema la crea quando l'assistente è invocato. */
class TalosAssistenteSessioneService : VoiceInteractionSessionService() {
    override fun onNewSession(args: Bundle?): VoiceInteractionSession =
        TalosAssistenteSessione(this)
}

/**
 * La sessione: quello che succede quando chiami TALOS da fuori.
 *
 * ## ⛔ Perché APRE L'APP invece di disegnare un pannello suo
 *
 * Un pannello nativo sopra l'app che stai guardando sarebbe più elegante, e un
 * giorno si farà. Ma vorrebbe dire una SECONDA interfaccia di chat — con la sua
 * voce, i suoi consensi, il suo elenco di strumenti — accanto a quella che
 * esiste già. Due superfici che fanno la stessa cosa divergono sempre, e la
 * seconda resta indietro proprio sui pezzi che contano (i permessi, il freno,
 * le schede di consenso).
 *
 * `startVoiceActivity` è la strada che il sistema offre: apre TALOS sapendo che
 * arriva da un'invocazione vocale. Chi chiama si ritrova dentro TALOS, con la
 * stessa chat e le stesse regole. ⇒ Una superficie sola, che è la ragione per
 * cui questa app è coerente.
 */
class TalosAssistenteSessione(private val servizio: TalosAssistenteSessioneService) :
    VoiceInteractionSession(servizio) {

    private var nodi = 0
    private var immagine = false

    /** La barra è già a schermo: il contesto che arriva dopo va MANDATO, non messo via. */
    private var barraAperta = false

    override fun onCreate() {
        super.onCreate()
        Log.i(TalosAssistente.TAG, "${TalosAssistente.SEGNO} sessione creata")
    }

    override fun onHandleAssist(state: AssistState) {
        super.onHandleAssist(state)
        val struttura: AssistStructure? = state.assistStructure
        val contenuto: AssistContent? = state.assistContent
        val finestre = struttura?.windowNodeCount ?: -1
        // ⛔ Una struttura con zero nodi è vuota, e vuota vuol dire «non
        // funziona» anche quando l'oggetto non è nullo.
        nodi = if (finestre > 0) contaNodi(struttura!!.getWindowNodeAt(0).rootViewNode) else 0
        TalosAssistente.annota(nodi, immagine)
        Log.i(
            TalosAssistente.TAG,
            "${TalosAssistente.SEGNO} contesto finestre=$finestre nodi=$nodi" +
                " contenuto=${contenuto != null}",
        )
        /*
         * ⛔⛔ IL CONTESTO ARRIVA DOPO CHE LA BARRA È GIÀ APERTA — misurato.
         *
         * L'ordine vero, letto in logcat l'11 agosto:
         *
         *     talos.assist sessione creata
         *     talos.assist onShow flags=7          ← qui apriamo la barra
         *     talos.assist contesto … nodi=403     ← e QUI arrivano i nodi
         *
         * Risultato a schermo: la spia diceva «non vedo la schermata» mentre il
         * log ne contava 403. Non era il chip a sbagliare: era il numero a non
         * esistere ancora quando l'abbiamo scritto nell'indirizzo.
         *
         * ⛔ Aspettare il contesto PRIMA di aprire sarebbe la cura sbagliata:
         * ritarderebbe la comparsa della barra di un tempo che non controlliamo,
         * per un dato che è un'aggiunta e non una condizione. Si apre subito, e
         * quando il numero arriva glielo si manda: l'activity è `singleInstance`,
         * quindi il secondo `startActivity` non ne crea un'altra — entra da
         * `onNewIntent`, che Capacitor consegna al lato web come `appUrlOpen`.
         */
        if (barraAperta && nodi > 0) servizio.startActivity(intentDellaBarra())
    }

    override fun onHandleScreenshot(screenshot: Bitmap?) {
        super.onHandleScreenshot(screenshot)
        immagine = screenshot != null
        TalosAssistente.annota(nodi, immagine)
    }

    /**
     * ⛔ Si apre l'app QUI e non in `onHandleAssist`: quello arriva anche
     * quando la sessione non va mostrata, e aprire una schermata a chi non ha
     * chiesto niente è il difetto peggiore che un assistente possa avere.
     */
    override fun onShow(args: Bundle?, showFlags: Int) {
        super.onShow(args, showFlags)
        Log.i(TalosAssistente.TAG, "${TalosAssistente.SEGNO} onShow flags=$showFlags")
        /*
         * ⛔⛔ SI APRE LA BARRA, NON L'APP — e questo l'ha corretto l'owner.
         *
         * La prima versione apriva TALOS a schermo pieno. Bocciata in una riga:
         * «potrei farlo con un tap». Il punto della funzione è **restare dove
         * sei**: chiedere a TALOS mentre stai facendo altro.
         *
         * Misurato su Gemini l'11 agosto: chiamata da Chrome, Chrome resta vivo
         * e visibile sotto, e compare solo una barra in basso. Questa è la
         * stessa forma, fatta in casa.
         */
        /*
         * ⛔⛔ IL MODO VA SCRITTO NELL'INDIRIZZO, NON IN UN EXTRA — e non è una
         * questione di gusto.
         *
         * Gli extra li legge il codice NATIVO; qui chi deve sapere è l'app WEB,
         * che gira dentro la stessa WebView di sempre e non ha modo di guardare
         * quale Activity la ospita. Le tre strade per dirglielo, e perché questa:
         *
         *   1. un plugin nostro nuovo che legge l'extra → codice nativo in più
         *      e un giro di ponte su OGNI avvio, anche quelli che barra non sono;
         *   2. `evaluateJavascript` dopo `super.onCreate` → vale per il
         *      caricamento SUCCESSIVO della pagina, e qui la pagina la sta già
         *      caricando `super.onCreate`: una corsa fra due cose che partono
         *      insieme, cioè un difetto che compare una volta su venti;
         *   3. `setData(...)` → dall'altra parte è esattamente ciò che
         *      `App.getLaunchUrl()` restituisce, ed è già dentro l'Intent quando
         *      l'Activity nasce. Nessuna corsa, nessun codice nuovo.
         *
         * Gli extra restano lo stesso: costano niente e il lato nativo li legge
         * senza passare per una stringa da spacchettare.
         */
        val apri = intentDellaBarra()
        barraAperta = true
        /*
         * ⛔ `startActivity` e NON `startVoiceActivity`, e l'ho imparato
         * misurando: la seconda apre l'activity DENTRO la sessione vocale, e
         * pretende che l'activity dichiari `android.intent.category.VOICE`. La
         * nostra non lo fa, quindi la chiamata non apriva niente e non diceva
         * niente — `onShow flags=7` compariva nel log e lo schermo restava dov'era.
         *
         * Il contratto giusto per noi è l'altro: TALOS è un'app intera, non un
         * pannello vocale, e chi lo chiama vuole finirci dentro con la sua chat
         * e le sue regole. Vedi il commento in testa alla classe.
         */
        servizio.startActivity(apri)
        hide()
    }

    /**
     * L'indirizzo della barra, col contesto che c'è ADESSO.
     *
     * ⛔ Si costruisce ogni volta invece di tenerne uno: il numero cambia fra la
     * prima chiamata e la seconda, ed è tutto il motivo per cui la seconda
     * esiste. Un intent riusato porterebbe di nuovo lo zero.
     */
    private fun intentDellaBarra(): Intent {
        val indirizzo = android.net.Uri.parse(
            "talos://barra?voce=1&nodi=$nodi&immagine=${if (immagine) 1 else 0}",
        )
        return Intent(Intent.ACTION_VIEW, indirizzo, servizio, ai.talos.TalosBarraActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            putExtra(ai.talos.TalosBarraActivity.EXTRA_BARRA, true)
            // Chi chiama TALOS con la voce si aspetta di parlare, non di
            // trovarsi davanti una tastiera: la barra lo sa da qui.
            putExtra(EXTRA_DA_VOCE, true)
            // ⭐ E il contesto si DICHIARA, non si usa di nascosto: la barra sa
            // quanto ha visto, e lo dice a chi legge invece di far finta di
            // indovinare. È il primo dei nostri sorpassi sui concorrenti.
            putExtra(EXTRA_NODI, nodi)
            putExtra(EXTRA_IMMAGINE, immagine)
        }
    }

    private fun contaNodi(nodo: AssistStructure.ViewNode?): Int {
        if (nodo == null) return 0
        var totale = 1
        for (i in 0 until nodo.childCount) totale += contaNodi(nodo.getChildAt(i))
        return totale
    }

    companion object {
        /** Lo dice alla barra: sei arrivato di voce, quindi ascolta. */
        const val EXTRA_DA_VOCE = "ai.talos.DA_VOCE"

        /**
         * ⭐ Quanto contesto è arrivato — e serve a DIRLO, non a usarlo di nascosto.
         *
         * Misurato l'11 agosto: 49 nodi su Impostazioni, 315 su Chrome, più lo
         * screenshot. I concorrenti il contesto lo usano e basta; questo numero
         * esiste perché TALOS possa dire «vedo la pagina che stai guardando» e
         * lasciartelo negare.
         */
        const val EXTRA_NODI = "ai.talos.CONTESTO_NODI"
        const val EXTRA_IMMAGINE = "ai.talos.CONTESTO_IMMAGINE"
    }
}

/**
 * Il riconoscimento vocale che il ruolo assistente pretende.
 *
 * ⛔ Non riconosce niente, e non è pigrizia: senza un `RecognitionService`
 * dichiarato il sistema, su diverse versioni, rifiuta di assegnare il ruolo.
 * L'ascolto vero di TALOS passa dal riconoscitore di sistema attraverso il
 * plugin di dettatura che esiste già — duplicarlo qui vorrebbe dire due motori
 * per la stessa cosa.
 */
class TalosAssistenteRiconoscimento : android.speech.RecognitionService() {
    override fun onStartListening(intent: Intent?, listener: Callback?) {
        listener?.error(android.speech.SpeechRecognizer.ERROR_CLIENT)
    }
    override fun onCancel(listener: Callback?) = Unit
    override fun onStopListening(listener: Callback?) = Unit
}
