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
        vivo = this
        Log.i(TAG, "$SEGNO pronto")
    }

    override fun onShutdown() {
        vivo = null
        super.onShutdown()
    }

    companion object {
        const val TAG = "TalosAssistente"
        const val SEGNO = "talos.assist"

        /**
         * Il servizio vivo, quando il sistema lo tiene acceso perché TALOS è
         * l'assistente scelto. `null` se qualcun altro ha quel posto.
         */
        @Volatile private var vivo: TalosAssistente? = null

        /**
         * ⭐⭐ APRE TALOS **PASSANDO DALL'ASSISTENTE** — cioè per la porta che
         * consegna lo schermo.
         *
         * ## ⛔ Il difetto: due porte che sembrano una
         *
         * Owner 2026-08-11: «sul telefono TALOS non vede lo schermo, sul tablet
         * sì, la versione è identica, devo abilitare qualche permesso?».
         *
         * Non era un permesso. MISURATO su tutti e due i dispositivi:
         * `voice_interaction_service`, il ruolo assistente e i due
         * `assist_*_enabled` erano **identici** — e i due interruttori che
         * sembravano i colpevoli non esistono nemmeno sul dispositivo che
         * funziona. La differenza era **come si apriva**: sul tablet col gesto,
         * sul telefono dal pallino.
         *
         * ⇒ Il gesto chiede al sistema di mostrare l'assistente, e il sistema
         * allora consegna `AssistStructure`. Il pallino e la tendina facevano
         * `startActivity` sulla barra: aprono la stessa finestra, ma **saltano
         * l'assistente**, e su quella strada nessuno riceve niente. Due porte
         * che sembrano uguali e portano dati diversi — il tipo di difetto che
         * sembra un permesso mancante e non lo è.
         *
         * ## Come si chiude
         *
         * TALOS **è** il servizio assistente, quindi può chiedere al sistema di
         * mostrare la propria sessione: `showSession` è la stessa strada del
         * gesto, ed è anche quella che userà la parola di attivazione. Con
         * `SHOW_WITH_ASSIST` e `SHOW_WITH_SCREENSHOT` si dichiara cosa serve; il
         * sistema decide se darlo, e se dice di no la barra si apre lo stesso —
         * solo senza occhio, e la spia lo dice.
         *
         * Torna `false` se il sistema non ci sta tenendo accesi come assistente:
         * allora chi chiama apre la barra come ha sempre fatto.
         */
        /**
         * ⭐⭐⭐ CHIAMA TALOS — la porta unica per ogni scorciatoia.
         *
         * Le tre strade, in quest'ordine, e l'ordine È il contenuto:
         *
         * 1. **La barra è già davanti** → un intent NUOVO. `showSession` su una
         *    sessione già mostrata non produce niente: nessun intent arriva alla
         *    barra, il lato web non conta nessuna chiamata, l'ascolto non
         *    riparte. È il difetto che l'owner ha visto il 2026-08-14 con «hey
         *    jarvis a barra aperta», e la cura è mandare un intent che
         *    `onNewIntent` timbra come apertura nuova.
         * 2. **La sessione dell'assistente** (`showSession`) — l'unica che porta
         *    il CONTESTO DELLO SCHERMO. Vedi [[due-porte-che-sembrano-una]]: il
         *    gesto passa di qui e riceve `AssistStructure`; `startActivity`
         *    apre la stessa finestra e non riceve niente.
         * 3. **La barra da sola**, se il sistema non ci tiene accesi come
         *    assistente. Meglio senza occhio che niente.
         *
         * ⛔ `TalosParola` ha ancora questa stessa forma scritta dentro di sé,
         * con intorno la sua contabilità (`ceduto`, il riposo dell'eco). NON è
         * stata spostata qui in questo giro per una ragione sola: quella strada
         * si prova **con una voce vera**, e una cura che non si può riprovare non
         * si tocca. Quando ci sarà `talos.onnx` e una prova ripetibile, quella
         * copia sparisce e chiama questa.
         */
        @JvmStatic
        fun chiama(contesto: android.content.Context, motivo: String): Boolean {
            if (ai.talos.TalosBarraActivity.eDavanti()) {
                Log.i(TAG, "$SEGNO $motivo: la barra è davanti, le mando una chiamata nuova")
                return apriLaBarra(contesto)
            }
            if (apriComeAssistente()) {
                Log.i(TAG, "$SEGNO $motivo: sessione assistente")
                return true
            }
            Log.w(TAG, "$SEGNO $motivo: niente sessione, apro la barra da sola")
            return apriLaBarra(contesto)
        }

        /**
         * ⭐⭐⭐ IL RIENTRO — la barra torna, e NON riapre il microfono.
         *
         * ## Perché non basta `chiama()`
         *
         * `chiama()` apre con `voce=1`, perché chi invoca l'assistente sta per
         * parlare. Ma chi RIENTRA dopo che TALOS ha mandato un WhatsApp non sta
         * parlando: sta guardando la spunta comparire.
         *
         * MISURATO sul OnePlus 13 il 2026-08-15, alla prima versione del
         * rientro: la barra torna, riapre il microfono, nessuno dice niente, e
         * dopo dieci secondi compare
         *
         *     «Non ho sentito niente. Tocca il microfono per riprovare.»
         *
         * sopra una risposta che diceva «Ho inviato il messaggio a un contatto su
         * WhatsApp». Cioè TALOS accusa la persona di non aver parlato subito
         * dopo aver eseguito quello che gli aveva chiesto. È la stessa famiglia
         * del difetto del 14 agosto, in un posto nuovo.
         *
         * ⇒ `voce=0`: la barra torna, mostra com'è andata, e aspetta. Se la
         * persona vuole dire altro, il microfono è a un tocco.
         */
        @JvmStatic
        fun rientra(contesto: android.content.Context): Boolean = runCatching {
            contesto.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    android.net.Uri.parse("talos://barra?voce=0&nodi=0&immagine=0&rientro=1"),
                    contesto,
                    ai.talos.TalosBarraActivity::class.java,
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            Log.i(TAG, "$SEGNO rientro: la barra torna davanti, senza riaprire il microfono")
            true
        }.getOrElse {
            Log.w(TAG, "$SEGNO rientro non riuscito: ${it.message}")
            false
        }

        /** L'ultima strada: la finestra nostra, senza contesto dello schermo. */
        private fun apriLaBarra(contesto: android.content.Context): Boolean = runCatching {
            contesto.startActivity(
                Intent(
                    Intent.ACTION_VIEW,
                    android.net.Uri.parse("talos://barra?voce=1&nodi=0&immagine=0"),
                    contesto,
                    ai.talos.TalosBarraActivity::class.java,
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        }.getOrElse {
            Log.w(TAG, "$SEGNO nemmeno la barra si è aperta: ${it.message}")
            false
        }

        @JvmStatic
        fun apriComeAssistente(): Boolean {
            val servizio = vivo ?: return false
            return runCatching {
                servizio.showSession(
                    android.os.Bundle(),
                    android.service.voice.VoiceInteractionSession.SHOW_WITH_ASSIST
                        or android.service.voice.VoiceInteractionSession.SHOW_WITH_SCREENSHOT,
                )
                Log.i(TAG, "$SEGNO sessione chiesta da noi (pallino/tendina)")
                true
            }.getOrElse {
                Log.w(TAG, "$SEGNO showSession rifiutata: ${it.message}")
                false
            }
        }

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

        /**
         * ⭐⭐ IL TESTO DELLO SCHERMO, e si consegna UNA VOLTA SOLA.
         *
         * Il commento qui sopra diceva — giustamente — che non si tiene l'albero
         * in una variabile statica, e che «quando servirà davvero, passerà per un
         * consenso e per una porta dichiarata». Quel giorno è arrivato: owner
         * 2026-08-11, «se chiedo cosa vedi mi risponde che non vede nulla».
         *
         * La porta dichiarata esiste già ed è **l'occhio nella pillola**: dice
         * quanti elementi TALOS ha visto, e un tocco lo spegne. Quello che
         * mancava era il contenuto dietro il numero.
         *
         * ⛔ Perciò questo campo NON è un magazzino: `prendiIlTesto()` lo
         * restituisce e lo AZZERA. Lo schermo di un'altra app resta in memoria il
         * tempo di attraversare il ponte, non finché a qualcuno serve.
         */
        @Volatile private var testoSchermo: String = ""

        /**
         * Prende il testo e lo cancella: si consegna una volta sola.
         *
         * ⛔ `@JvmStatic` e pubblica: chi la chiama è il plugin, che è in Java e
         * in un altro package. Senza, il ponte non la vedrebbe — e la porta
         * dichiarata resterebbe una porta murata.
         */
        /** Quanti nodi ha visto l'ultima chiamata. Statica per il ponte. */
        @JvmStatic
        fun quantiNodiVisti(): Int = nodiVisti

        /**
         * ⭐ L'indirizzo della pagina che la persona sta guardando, o vuoto.
         *
         * ⛔ `@JvmStatic` come i due qui sopra: il ponte della barra è in Java,
         * e una proprietà Kotlin dentro un `companion object` da lì non si vede.
         */
        @JvmStatic
        fun indirizzoDellaPagina(): String = indirizzoPagina ?: ""

        @JvmStatic
        fun prendiIlTestoDiSchermo(): String {
            val ora = testoSchermo
            testoSchermo = ""
            return ora
        }

        /** ⛔ Da chiamare quando la barra si chiude: niente resta indietro. */
        internal fun dimenticaIlTesto() {
            testoSchermo = ""
        }

        /**
         * ⭐⭐⭐ L'INDIRIZZO DELLA PAGINA CHE LA PERSONA STA GUARDANDO.
         *
         * Owner, rilievo #4: «quando dici apri Chrome, Gemini apre Chrome e
         * l'assistente si chiude. Rilanciare l'assistente con la NUOVA pagina
         * mostrata, così la conversazione continua».
         *
         * ⛔ E NON si legge dallo schermo: Chrome lo CONSEGNA. Quando
         * l'assistente viene mostrato come **sessione**, il sistema passa un
         * `AssistContent`, e Chrome ci scrive dentro l'URL della scheda aperta
         * (`onProvideAssistContent` → `setWebUri`, verificato nel codice di
         * Chromium). Ricostruirlo dai pixel sarebbe indovinare una cosa che ci
         * viene data.
         *
         * ⛔ In incognito Chrome non lo dà, di proposito. Allora resta `null`, e
         * chi legge dice «non lo so» invece di inventare un indirizzo.
         */
        @Volatile var indirizzoPagina: String? = null
            private set

        internal fun annota(
            nodi: Int,
            immagine: Boolean,
            testo: String = "",
            indirizzo: String? = null,
        ) {
            nodiVisti = nodi
            immagineVista = immagine
            if (testo.isNotEmpty()) testoSchermo = testo
            indirizzoPagina = indirizzo
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
 * ## ⛔ Apre LA BARRA, non l'app — e il primo disegno faceva il contrario
 *
 * La prima versione apriva TALOS a schermo pieno. L'owner l'ha bocciata in una
 * riga: «potrei farlo con un tap». Vero: il punto della funzione è **restare
 * dove sei**, chiedere mentre stai facendo altro.
 *
 * ⭐ E non è un pannello nativo disegnato da zero, che sarebbe una SECONDA
 * interfaccia di chat — con la sua voce, i suoi consensi, il suo elenco di
 * strumenti — accanto a quella che esiste già. Due superfici che fanno la stessa
 * cosa divergono sempre, e la seconda resta indietro proprio sui pezzi che
 * contano (i permessi, il freno, le schede di consenso).
 *
 * La barra è la STESSA app web su una faccia compatta: una superficie sola, che
 * è la ragione per cui questa app è coerente. Il come sta in `onShow`.
 */
class TalosAssistenteSessione(private val servizio: TalosAssistenteSessioneService) :
    VoiceInteractionSession(servizio) {

    private var nodi = 0
    private var immagine = false

    /** La barra è già a schermo: il contesto che arriva dopo va MANDATO, non messo via. */
    private var barraAperta = false

    /**
     * ⛔⛔ L'IDENTITÀ DI QUESTA APERTURA — e la dichiara chi apre, non chi riceve.
     *
     * ## Il difetto, misurato il 12 agosto
     *
     * Owner: «col gesto mi dice *speech recognition failed*, col pulsante no».
     * In `logcat`, per UN SOLO gesto:
     *
     *     47.601  START … TalosBarraActivity … result code=0   ← la apriamo
     *     47.629  START … TalosBarraActivity … result code=3   ← e la riapriamo
     *
     * Ventotto millisecondi dopo. È **voluto**: la seconda partenza esiste per
     * consegnare il conteggio dei nodi, che a `onShow` non è ancora arrivato
     * (vedi il commento in `onHandleAssist`). Ma erano due Intent DIVERSI, e
     * `TalosBarraActivity` timbrava ognuno con l'istante in cui lo riceveva ⇒ due
     * timbri ⇒ per il lato web **due chiamate**, quindi due ascolti aperti nello
     * stesso millisecondo, quindi l'errore della sessione morente raccolto da chi
     * non era ancora nato.
     *
     * ⛔ Il timbro dell'Activity cura la doppia CONSEGNA dello stesso intent
     * (Capacitor, issue #971) e non poteva curare questo: qui gli intent sono
     * genuinamente due. Nessuna euristica sui dati poteva distinguerli — sono
     * indistinguibili da due chiamate vere consecutive, e infatti l'unica cosa
     * che li separa è **l'intenzione di chi li manda**.
     *
     * ⇒ La sessione dichiara il proprio istante di apertura e lo mette su
     * ENTRAMBI gli intent. Il secondo aggiorna i nodi e NON conta come chiamata
     * nuova: una apertura, un ascolto.
     */
    private var apertura = 0L

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
        // ⛔ E si TIENE, non si conta e basta: vedi `raccogliTesto`.
        val testo = if (finestre > 0) {
            val dentro = StringBuilder()
            raccogliTesto(struttura!!.getWindowNodeAt(0).rootViewNode, dentro)
            dentro.toString().trim()
        } else {
            ""
        }
        /*
         * ⛔ `webUri` e non il testo: se la persona sta guardando una pagina,
         * l'indirizzo è il dato utile — con quello TALOS la legge davvero,
         * invece di ricostruirla dai nodi dello schermo.
         */
        val indirizzo = contenuto?.webUri?.toString()
        TalosAssistente.annota(nodi, immagine, testo, indirizzo)
        Log.i(
            TalosAssistente.TAG,
            "${TalosAssistente.SEGNO} contesto finestre=$finestre nodi=$nodi" +
                " contenuto=${contenuto != null} pagina=${indirizzo ?: "-"}",
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
         * quando il numero arriva glielo si manda: l'activity è `singleTask`,
         * quindi il secondo `startActivity` non ne crea un'altra — entra da
         * `onNewIntent`, che Capacitor consegna al lato web come `appUrlOpen`.
         * (Era `singleInstance` fino a `f7b4d422`: un task ISOLATO impediva al
         * sistema di comporre l'app sottostante, e Chrome spariva.)
         */
        if (barraAperta && nodi > 0) servizio.startActivity(intentDellaBarra())
    }

    /*
     * ⛔⛔ LA SESSIONE NON MUORE PERCHÉ TALOS HA APERTO UN'APP.
     *
     * ## Il difetto, owner 2026-08-15
     *
     * > «se chiedo "invia un messaggio a un contatto" lui mette il messaggio nel
     * > campo input ma non lo invia, **la barra assistente non ricompare**, e se
     * > dico "invia" non invia nulla.»
     *
     * ## ⛔ Le due porte che chiudono, e non le abbiamo scritte noi
     *
     * Dalla documentazione di `VoiceInteractionSession`:
     *
     * > «Sessions automatically watch for requests that all system UI be closed
     * > (such as when the user presses HOME), which will appear here.
     * > **The default implementation always calls `finish()`.**»
     *
     * e per `onTaskFinished`: «The default implementation calls `finish()`».
     *
     * ⇒ Aprire un'app fa chiudere la system UI, quindi il sistema ci chiedeva di
     * sparire e noi — non avendo scritto niente — obbedivamo. La conversazione
     * finiva perché TALOS aveva fatto il suo lavoro.
     *
     * ## La politica: la sessione vive quanto la barra
     *
     * Non «mai chiudere» — sarebbe una sessione vocale immortale, e il sistema
     * ha ragione a volerla chiudere quando non serve più. Ma finché la barra è
     * a schermo, la conversazione è viva: chiuderla mentre la persona la sta
     * usando è il difetto, non la prudenza.
     *
     * ⛔ E resta il vincolo che nessun codice può aggirare: per RIENTRARE dopo
     * aver ceduto lo schermo serve una finestra ancora visibile
     * (`SYSTEM_ALERT_WINDOW` + overlay visibile su Android 15+). Questa
     * sovrascrittura tiene viva la sessione; **non basta da sola** a far
     * ricomparire la barra. Il resto sta in
     * `docs/superpowers/research/2026-08-15-rientro-assistente-dopo-apertura-app.md`.
     */
    override fun onCloseSystemDialogs() {
        if (barraAperta) {
            Log.i(TalosAssistente.TAG, "${TalosAssistente.SEGNO} resto viva: la barra è a schermo")
            return
        }
        super.onCloseSystemDialogs()
    }

    /*
     * ⛔ Stesso motivo: un'attività che finisce non è una conversazione che
     * finisce. Il default chiuderebbe la sessione appena l'app aperta si
     * congeda, che è esattamente il momento in cui TALOS deve tornare.
     */
    override fun onTaskFinished(intent: Intent?, taskId: Int) {
        if (barraAperta) {
            Log.i(TalosAssistente.TAG, "${TalosAssistente.SEGNO} attività finita, ma la barra c'è ancora")
            return
        }
        super.onTaskFinished(intent, taskId)
    }

    override fun onHandleScreenshot(screenshot: Bitmap?) {
        super.onHandleScreenshot(screenshot)
        immagine = screenshot != null
        TalosAssistente.annota(nodi, immagine)
    }

    /**
     * ⛔ La barra si apre QUI e non in `onHandleAssist`: quello arriva anche
     * quando la sessione non va mostrata, e comparire sopra l'app di chi non ha
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
        // ⛔ PRIMA di costruire l'intent: è il timbro che dice «questa apertura
        // è una sola», e lo porteranno tutti gli intent di questa sessione.
        apertura = android.os.SystemClock.uptimeMillis()
        /*
         * ⛔⛔ IL MICROFONO SI APRE QUI, non nell'Activity — owner 2026-08-15:
         * «possiamo anticipare ulteriormente il delay tra apertura barra
         * assistente e il punto da cui TALOS effettivamente ascolta?».
         *
         * ## MISURATO sul Pad, prima della cura (t0 = `onShow`)
         *
         * ```
         *   +  0 ms  onShow
         *   + 99 ms  anticipato: microfono aperto PRIMA della WebView
         *   +172 ms  anticipato: pronto
         *   +344 ms  Soda: start detection    ← QUI recepisce le parole
         *   +494 ms  primo volume (la WebView adotta, «1 eventi in coda»)
         * ```
         *
         * I 99 ms in testa non erano lavoro nostro: erano **il lancio
         * dell'Activity**. `accendi` stava in `TalosBarraActivity.onCreate` —
         * il primo punto utile *dentro l'Activity*, e già prima di
         * `super.onCreate` — ma l'Activity deve prima nascere.
         *
         * ⇒ La sessione e l'Activity vivono nello stesso processo, e
         * `TalosOrecchioAnticipato` è un oggetto statico: da qui si arriva allo
         * stesso microfono, un lancio di Activity prima.
         *
         * ⛔ RESTA anche in `onCreate` e non si sposta: quella è la strada di
         * chi apre la barra **senza** passare da qui (la tendina, il pallino,
         * `startActivity` diretto). `accendi` è idempotente (`if (acceso)
         * return`) e si posta da sé sul thread giusto, quindi la seconda
         * chiamata non costa niente. Toglierla di là spegnerebbe l'anticipo per
         * tutti gli altri ingressi.
         *
         * ⛔ E SOLO per la voce: `intentDellaBarra()` porta `voce=1`, cioè
         * questa apertura vuole il microfono. Un microfono acceso perché
         * qualcuno ha aperto la barra per SCRIVERE è esattamente ciò che non si
         * fa — la condizione è la stessa che l'Activity legge dall'indirizzo.
         */
        val apri = intentDellaBarra()
        if (apri.data?.getQueryParameter("voce") == "1") {
            TalosOrecchioAnticipato.accendi(servizio)
        }
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
            "talos://barra?voce=1&nodi=$nodi&immagine=${if (immagine) 1 else 0}" +
                // ⛔ Lo stesso su tutti gli intent di questa apertura: vedi il
                // commento su `apertura`. È ciò che distingue «ti mando il
                // contesto che mancava» da «ti sto chiamando di nuovo».
                "&apertura=$apertura",
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

    /**
     * ⭐⭐ IL TESTO DELLO SCHERMO — e prima lo CONTAVAMO soltanto.
     *
     * Owner 2026-08-11: «icona occhio a cosa serve? A vedere elementi su schermo
     * giusto? Ma se chiedo "cosa vedi" mi risponde che non vede nulla».
     *
     * Aveva ragione, e il difetto era esattamente questo: il sistema ci
     * consegnava la struttura intera, noi contavamo i nodi per far comparire
     * «357» nella spia, e poi la buttavamo. La barra mostrava un numero vero su
     * un contenuto che non esisteva più — la forma peggiore di difetto, perché
     * l'interfaccia promette e il modello smentisce.
     *
     * ⛔ Si raccolgono `text` e `contentDescription`, non uno solo: metà delle
     * app moderne mette l'etichetta in uno e metà nell'altro, e con uno solo si
     * perde mezza schermata senza accorgersene.
     *
     * ⛔ E c'è un TETTO. Una schermata lunga può valere decine di migliaia di
     * caratteri: infilarli in un prompt vuol dire pagarli a ogni domanda e
     * spingere fuori la conversazione. Si prende l'inizio — che è ciò che la
     * persona sta guardando — e si dichiara il taglio invece di nasconderlo.
     */
    private fun raccogliTesto(nodo: AssistStructure.ViewNode?, dentro: StringBuilder) {
        if (nodo == null || dentro.length >= TETTO_TESTO) return
        val scritto = nodo.text?.toString()?.trim()
        val descritto = nodo.contentDescription?.toString()?.trim()
        if (!scritto.isNullOrEmpty()) dentro.append(scritto).append(A_CAPO)
        else if (!descritto.isNullOrEmpty()) dentro.append(descritto).append(A_CAPO)
        for (i in 0 until nodo.childCount) raccogliTesto(nodo.getChildAt(i), dentro)
    }

    companion object {
        /**
         * ⛔ Quanto testo si porta via da una schermata.
         *
         * 8.000 caratteri sono circa due schermate piene di un articolo: quello
         * che la persona sta guardando, non l'archivio dell'app. Oltre, si paga
         * a ogni domanda e si spinge fuori la conversazione dal contesto del
         * modello — cioè si peggiora la risposta per avere più materiale.
         */
        const val TETTO_TESTO = 8_000

        /** Il carattere che separa una riga dello schermo dall'altra. */
        const val A_CAPO: Char = 10.toChar()

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
