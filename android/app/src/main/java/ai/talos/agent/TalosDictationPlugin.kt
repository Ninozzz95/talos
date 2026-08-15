package ai.talos.agent

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.util.Locale

/** Il marchio in `logcat` della sonda che misura il livello del microfono. */
internal const val ORECCHIO = "TalosOrecchio"

/**
 * Quanto aspettare, dopo aver ricevuto il motore caldo dall'orecchio anticipato,
 * prima di aprirci una sessione nuova. Vedi il commento in `avvia`.
 */
private const val RESPIRO_CONSEGNA_MS = 250L

/**
 * Quanto si aspetta prima di riaprire una sessione morta di silenzio.
 *
 * ⛔ Non zero: chiudere e riaprire nello stesso millisecondo mette questo
 * riconoscitore in uno stato da cui non riparte — misurato l'11 agosto,
 * `errore=CLIENT (5)`. Sessanta millesimi non si sentono e bastano.
 */
private const val RESPIRO_RIAPERTURA_MS = 60L

/**
 * ⭐⭐ I DUE TEMPI DELL'ASCOLTO — **una sola sorgente**, e sta qui.
 *
 * ## ⛔ Perché nel nativo e non nel lato web, dove erano
 *
 * L'11 agosto questi due numeri sono stati la causa di due difetti diversi
 * nella stessa giornata: prima non arrivavano affatto al ponte (il microfono si
 * chiudeva dopo 2000 ms, cioè il default del motore), poi arrivavano solo alla
 * barra e non alla chat. Ogni volta la causa era la stessa: **più di un posto
 * che decide lo stesso numero**.
 *
 * Dall'11 agosto ci sono TRE posti che aprono il microfono — il plugin per la
 * barra, il plugin per la chat, e `TalosOrecchioAnticipato` che parte in
 * `onCreate` prima che una WebView esista. Il terzo non può leggere una costante
 * TypeScript: nasce prima del JavaScript. ⇒ O il numero sta nel nativo, o le
 * copie diventano tre.
 *
 * Il lato web può ancora sovrascriverli (`silenceMillis`, `minimumMillis`) — ma
 * nessuna schermata lo fa, e chi lo facesse dichiarerebbe di volere un ascolto
 * DIVERSO, che è una scelta, non una dimenticanza.
 *
 * ## ⛔ E perché 2200, che è un numero e non un'opinione
 *
 * Owner: «l'ascolto è molto corto, non faccio in tempo a finire di parlare che
 * invia». Le pause DENTRO un turno di parlato spontaneo non sono sparse a caso:
 * si addensano intorno a **150, 500 e 1500 ms** (Heldner & Edlund, *Pauses, gaps
 * and overlaps in conversations*, tre corpora, tre lingue), con la
 * classificazione classica corta < 200, media < 1000, lunga fino a 3000 ms.
 * La soglia di prima era 1500: **piantata sulla terza moda**, cioè a metà del
 * gruppo più numeroso di «sto pensando». 2200 sta nella valle sopra.
 *
 * ⛔ Non si copiano i 500-800 ms degli agenti vocali (OpenAI Realtime usa 500):
 * là la conversazione è interrompibile e tagliare presto costa una frase
 * ripetuta; qui costa **il resto della domanda**. I due errori non pesano
 * uguale, quindi il numero non può essere lo stesso.
 *
 * ## ⭐ 2.200 → 1.600, e il numero l'ha scelto un CANCELLO, non io
 *
 * Owner 2026-08-14: «c'è un po' troppo tempo di delay tra la fine del mio
 * discorso e quando viene inviato». Misurato: **3.100 ms**, perché dietro
 * questa pausa ce n'è un'altra — la finestra di grazia della barra
 * (`GRAZIA_MS`), che aspetta ancora prima di spedire.
 *
 * ⇒ Le due attese proteggevano dallo **stesso** rischio: che la frase non sia
 * finita. Ma la grazia lo fa meglio, perché non è un'attesa cieca — se
 * arrivano altre parole **annulla l'invio**. Pagare due volte la stessa
 * assicurazione è il motivo per cui eravamo a 3,1 s contro i 300-800 ms che la
 * letteratura sull'endpointing indica come soglia oltre la quale il ritardo si
 * sente a ogni turno.
 *
 * ⛔⛔ E il primo tentativo è stato **1.400**, che un cancello esistente ha
 * respinto: `dictationTempiCondivisi` pretende che questa soglia stia **sopra
 * la moda dei 1.500 ms**, perché piantarla lì taglia a metà il gruppo più
 * numeroso di «sto pensando, non ho finito» — cioè il difetto che l'owner
 * aveva segnalato prima («non faccio in tempo a finire di parlare che invia»).
 *
 * Il cancello aveva ragione e non l'ho allentato: mi sono spostato io. 1.600 è
 * il primo valore che sta sopra quella moda, e il totale scende comunque da
 * 3.100 a 2.500 ms.
 *
 * ⛔ Il costo vero di abbassare questo numero non è tagliare la frase — è la
 * finestra sorda di 437-560 ms fra la chiusura di una sessione e la
 * riapertura, MISURATA e documentata su `RESPIRO_MS`. Chi riprende a parlare
 * esattamente lì dentro non viene sentito.
 */
internal const val TALOS_PAUSA_FINE_FRASE_MS = 1_600

/**
 * Quanto il microfono resta aperto ANCHE se non hai ancora aperto bocca.
 *
 * ⛔ Separato dalla pausa di fine frase: sono due decisioni diverse. Legarli —
 * come faceva un `silenzio * 5` scelto senza misura — vuol dire che non puoi
 * accorciare l'invio senza accorciare anche la pazienza.
 */
internal const val TALOS_ATTESA_INIZIO_MS = 8_000

/**
 * ⭐⭐ TALOS che ASCOLTA — e non chiede più in che lingua parli.
 *
 * ## Perché in casa, e non il plugin di terzi
 *
 * Owner 2026-08-10, dopo un difetto pagato: parlava italiano con la dettatura
 * impostata su inglese, il motore non ha sentito niente ed era **giusto così**.
 * La colpa non è di chi parla: è di un'app che chiede a una persona di
 * dichiarare in anticipo la lingua di ogni singola frase.
 *
 * MISURATO nel sorgente di `@capgo/capacitor-speech-recognition`: mette dieci
 * `putExtra` e **nessuno** è di rilevamento o di cambio lingua — passa
 * `EXTRA_LANGUAGE`, una e una sola. Dalla sua strada la lingua dinamica non è
 * raggiungibile: non è una configurazione mancante, è una chiave che non
 * esiste. Da qui il riconoscitore di casa.
 *
 * ## Le chiavi che Android regala e che nessuno usava
 *
 * - `EXTRA_ENABLE_LANGUAGE_DETECTION` (+ `onLanguageDetection`, API 34): il
 *   motore **dice** che lingua ha sentito, con le alternative.
 * - `EXTRA_ENABLE_LANGUAGE_SWITCH` (API 34): cambia lingua **dentro** la frase.
 *   Tre sensibilità; usiamo `BALANCED` — `QUICK_RESPONSE` scambia una parola
 *   isolata per un cambio di lingua, `HIGH_PRECISION` aspetta troppo.
 * - `ACTION_GET_LANGUAGE_DETAILS`: l'elenco delle lingue lo **dichiara il
 *   dispositivo**. ⛔ Nessuna lista scritta a mano: quella di prima aveva due
 *   voci, e su un telefono che ne sa fare cinquanta era una gabbia.
 * - `EXTRA_ENABLE_FORMATTING` (API 33): punteggiatura e maiuscole dal motore,
 *   invece che a carico di chi detta.
 * - `EXTRA_BIASING_STRINGS` (API 33): si sbilancia il riconoscimento verso
 *   parole che sappiamo probabili in questo momento (nomi in rubrica, titoli).
 *
 * ## ⛔ Le tre trappole, tutte già pagate da qualcuno
 *
 * **1. `SpeechRecognizer` vive sul thread principale.** Crearlo o chiamarlo da
 * un altro thread non lancia sempre un'eccezione: a volte semplicemente non
 * arriva mai una richiamata, che è il guasto peggiore perché somiglia al
 * silenzio. Ogni tocco al motore passa da `runOnUiThread`.
 *
 * **2. L'epoca.** Una sessione chiusa può ancora ricevere eventi in ritardo dal
 * servizio; senza un contatore che li scarta, un errore vecchio spegne una
 * sessione nuova. Stessa lezione della dettatura in JS.
 *
 * **3. Il silenzio non è un guasto.** `ERROR_NO_MATCH` e `ERROR_SPEECH_TIMEOUT`
 * si consegnano com'è giusto — col loro nome — e chi sta sopra decide come
 * mostrarli. Qui non si travestono da guasto.
 */
@CapacitorPlugin(
    name = "TalosDictation",
    permissions = [Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microfono")],
)
class TalosDictationPlugin : Plugin() {

    private var motore: SpeechRecognizer? = null

    /** L'intento della sessione in corso, per poterla rifare identica. */
    private var intentoDiQuestaSessione: Intent? = null

    /** Vero appena arriva del TESTO: allora la sessione ha fatto il suo lavoro. */
    @Volatile
    private var qualcosaDetto = false

    /** Quando è stato aperto il microfono, per non riaprirlo all'infinito. */
    private var ascoltoApertoA = 0L

    /**
     * ⛔⛔⛔ LA PAZIENZA DICHIARATA È OTTO SECONDI, E IL MOTORE NE DÀ MENO DI DUE.
     *
     * `TALOS_ATTESA_INIZIO_MS` dice quanto il microfono resta aperto **anche se
     * non hai ancora aperto bocca**: otto secondi. Il riconoscitore di Google
     * quel numero lo ignora — MISURATO sul Pad il 2026-08-14, tre aperture
     * diverse: `NO_MATCH` a **+1.701, +1.732, +1.753 ms**. Applica il silenzio
     * di fine frase (1.600 ms) anche prima che qualcuno abbia parlato.
     *
     * Chi sta sopra reagisce riaprendo dopo mezzo secondo di respiro, e la
     * sessione nuova ci mette il suo: **~800 ms in cui il microfono non c'è**,
     * proprio dove una persona che ha esitato un attimo comincia a parlare. È
     * l'altra metà del difetto che l'owner ha descritto come «si mangia le
     * parole», e la prima metà stava nell'orecchio anticipato.
     *
     * ⇒ Un turno chiuso dal silenzio, senza una sola parola, non è un esito: è
     * la stessa attesa che continua. Si riapre la sessione identica, e chi sta
     * sopra non se ne accorge — il buco passa da ~800 ms a ~110.
     *
     * ⛔ E si riapre SOLO fino agli otto secondi dichiarati: da lì in poi il
     * silenzio è una risposta, e sale intatto. Questo è il numero che rende vera
     * la promessa di `TALOS_ATTESA_INIZIO_MS` invece di lasciarla scritta.
     *
     * ⛔ Un `NO_MATCH` dopo che è arrivato del testo NON si tocca: è un esito
     * vero, e chi sta sopra sa cosa farne.
     */
    private fun ilSilenzioNonEUnEsito(errore: Int): Boolean {
        if (qualcosaDetto) return false
        if (errore != SpeechRecognizer.ERROR_NO_MATCH
            && errore != SpeechRecognizer.ERROR_SPEECH_TIMEOUT
        ) return false
        val riconoscitore = motore ?: return false
        val intento = intentoDiQuestaSessione ?: return false
        val aperto = android.os.SystemClock.uptimeMillis() - ascoltoApertoA
        if (ascoltoApertoA == 0L || aperto >= TALOS_ATTESA_INIZIO_MS) return false
        // ⛔ Un respiro: chiudere e riaprire nello stesso millisecondo è la cosa
        // che questo riconoscitore non perdona — `errore=CLIENT (5)`, misurato.
        mano.postDelayed({
            if (!inAscolto) return@postDelayed
            runCatching { riconoscitore.startListening(intento) }
                .onFailure {
                    android.util.Log.w(ORECCHIO, "non si è riaperto: ${it.message}")
                }
        }, RESPIRO_RIAPERTURA_MS)
        android.util.Log.i(
            ORECCHIO,
            "silenzio a +${aperto}ms, nessuno ha ancora parlato: riapro senza dirlo a nessuno",
        )
        return true
    }

    /**
     * ⛔ Scarta gli eventi delle sessioni morte. Si incrementa a ogni avvio e a
     * ogni chiusura: un evento che arriva con l'epoca sbagliata non tocca
     * niente.
     */
    @Volatile private var epoca = 0

    @Volatile private var inAscolto = false

    /**
     * ⛔⛔ IL RESPIRO APPARTIENE AL MOTORE, NON A CHI LO CHIEDE — e questa riga
     * è la cura del difetto del 12 agosto.
     *
     * ## Il difetto, con le righe di log che lo provano
     *
     * Owner: «col gesto mi dice *speech recognition failed* anche se mi rileva
     * qualche parola; col pulsante dentro l'assistente funziona bene».
     *
     *     48.205  web: avvio:casa                     ← due avvii...
     *     48.205  web: avvio:casa                     ← ...nello stesso ms
     *     48.207  anticipato: consegno il motore caldo
     *     48.211  errore=CLIENT (5) a +321388049 ms   ← di una sessione MAI aperta
     *     48.212  web: dett: onError recognitionFailed
     *
     * Il `+321388049 ms` è la firma: quell'ascoltatore non aveva mai ricevuto
     * `onReadyForSpeech`, quindi la sua origine valeva zero. L'errore veniva da
     * un'ALTRA sessione — quella annullata dalla consegna del motore.
     *
     * ## Perché il guardiano `nata` non l'ha fermato
     *
     * Il respiro di 250 ms era legato alla CHIAMATA (`appenaConsegnato`), non al
     * motore. Il primo avvio prendeva il motore caldo e rimandava la partenza;
     * il secondo, un millisecondo dopo, trovava `motore != null`, concludeva «a
     * me non l'ha consegnato nessuno», **partiva subito** e si dichiarava nato —
     * proprio nell'istante in cui l'errore della sessione morente era in volo.
     * Un guardiano giusto, aggirato da una premessa sbagliata.
     *
     * ⇒ Chi ha interrotto una sessione viva lo scrive QUI, e il debito vale per
     * chiunque chieda di ripartire. Un riconoscitore che sta chiudendo un turno
     * non ne apre un altro: è una proprietà del motore, e va misurata sul motore.
     *
     * ⛔ E non rallenta il pulsante: lì nessuno ha interrotto niente, il debito
     * è già scaduto da un pezzo e `respiroDovuto()` torna zero.
     */
    @Volatile private var sessioneInterrottaA = 0L

    private val mano = android.os.Handler(android.os.Looper.getMainLooper())

    /**
     * La partenza rimandata, se ce n'è una in attesa del respiro.
     *
     * ⛔ Va tenuta per poterla ANNULLARE: MISURATO il 12 agosto, la partenza
     * rimandata del primo avvio scattava lo stesso 250 ms dopo e faceva un
     * secondo `startListening` sullo stesso riconoscitore — due `pronto epoca=2`
     * a 48.255 e 48.497, cioè la sessione appena nata uccisa dalla precedente
     * che arrivava in ritardo. È il buco dove finiva la prima parola.
     */
    private var partenzaInAttesa: Runnable? = null

    /** La promessa del lato web che quella partenza doveva sciogliere. */
    private var chiamataInAttesa: PluginCall? = null

    /** L'epoca di cui abbiamo già annunciato il primo livello. Vedi `inoltra`. */
    @Volatile private var primoLivello = -1

    /** Quanti millisecondi mancano prima che il motore possa ripartire. */
    private fun respiroDovuto(): Long {
        // ⛔ Il MASSIMO fra le due fini: il riconoscitore è uno solo, e non gli
        // importa chi ha chiuso il turno precedente — noi o l'orecchio
        // anticipato. Guardarne una sola vuol dire ripartire sopra una sessione
        // che sta ancora morendo, e quella non sente più niente **e non lo dice**.
        val fine = maxOf(sessioneInterrottaA, TalosOrecchioAnticipato.ultimaFine)
        val passato = android.os.SystemClock.uptimeMillis() - fine
        return if (passato >= RESPIRO_CONSEGNA_MS) 0L else RESPIRO_CONSEGNA_MS - passato
    }

    // ---------------------------------------------------------------- stato

    @PluginMethod
    fun available(call: PluginCall) {
        val ok = SpeechRecognizer.isRecognitionAvailable(context)
        val inCasa = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        } else {
            false
        }
        call.resolve(
            JSObject()
                .put("available", ok)
                .put("onDevice", inCasa)
                .put("sdk", Build.VERSION.SDK_INT)
                // Le due capacità che cambiano l'interfaccia: se il dispositivo
                // non sa rilevare la lingua, «Automatica» sarebbe una promessa
                // che non possiamo mantenere, e chi sta sopra deve saperlo.
                .put("canDetectLanguage", Build.VERSION.SDK_INT >= 34)
                .put("canSwitchLanguage", Build.VERSION.SDK_INT >= 34),
        )
    }

    /**
     * Le lingue che il DISPOSITIVO dichiara di saper ascoltare, più quella che
     * la persona ha già scelto per la voce di sistema.
     *
     * ⛔ Risponde per broadcast ordinata, quindi può non rispondere mai: se il
     * servizio vocale non gestisce `ACTION_GET_LANGUAGE_DETAILS` la richiamata
     * non arriva. Si consegna comunque un esito — con la lingua di sistema —
     * invece di lasciare una promessa appesa.
     */
    @PluginMethod
    fun languages(call: PluginCall) {
        val consegnato = java.util.concurrent.atomic.AtomicBoolean(false)
        val diSistema = Locale.getDefault().toLanguageTag()

        fun consegna(elenco: List<String>, preferita: String?) {
            if (!consegnato.compareAndSet(false, true)) return
            val pulite = elenco.filter { it.isNotBlank() }.distinct()
            call.resolve(
                JSObject()
                    .put("languages", JSArray.from(pulite.toTypedArray()))
                    .put("preferred", preferita ?: diSistema)
                    .put("system", diSistema),
            )
        }

        val intent = RecognizerIntent.getVoiceDetailsIntent(context)
            ?: Intent(RecognizerIntent.ACTION_GET_LANGUAGE_DETAILS)
        try {
            context.sendOrderedBroadcast(
                intent,
                null,
                object : BroadcastReceiver() {
                    override fun onReceive(c: Context?, i: Intent?) {
                        val extra = getResultExtras(true)
                        val elenco = extra
                            .getStringArrayList(RecognizerIntent.EXTRA_SUPPORTED_LANGUAGES)
                            ?: arrayListOf()
                        val preferita = extra
                            .getString(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE)
                        consegna(elenco, preferita)
                    }
                },
                null,
                Activity.RESULT_OK,
                null,
                null,
            )
        } catch (errore: Exception) {
            consegna(emptyList(), null)
            return
        }

        // Rete di sicurezza: nessuna risposta entro 1,5 s = nessun elenco.
        android.os.Handler(android.os.Looper.getMainLooper())
            .postDelayed({ consegna(emptyList(), null) }, 1_500)
    }

    // --------------------------------------------------------------- ascolto

    /**
     * ⛔ IL DIARIO DEL LATO WEB, detto ad alta voce.
     *
     * `services/dictation.ts` tiene già un diario delle transizioni della
     * dettatura, e finora si poteva leggere solo dal pannello del Doctor —
     * cioè da dentro l'app, cioè non mentre riproduci il difetto guardando un
     * altro schermo. E la via ovvia non c'è: un `console.info` dalla WebView di
     * questa app **non arriva in logcat** (misurato l'11 agosto).
     *
     * Qui le due metà si incontrano: le decisioni del JS finiscono nello stesso
     * flusso, con lo stesso marchio, dei tempi veri del motore.
     */
    @PluginMethod
    fun traccia(call: PluginCall) {
        android.util.Log.i(ORECCHIO, "web: ${call.getString("testo") ?: "?"}")
        call.resolve()
    }

    @PluginMethod
    fun start(call: PluginCall) {
        if (getPermissionState("microfono") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microfono", call, "dopoIlPermesso")
            return
        }
        avvia(call)
    }

    @PermissionCallback
    private fun dopoIlPermesso(call: PluginCall) {
        if (getPermissionState("microfono") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("permissionDenied")
            return
        }
        avvia(call)
    }

    private fun avvia(call: PluginCall) {
        val lingua = call.getString("language")
        val automatica = call.getBoolean("autoLanguage", true) == true
        val consentite = call.getArray("allowedLanguages", JSArray())
            ?.toList<String>()
            ?.filter { it.isNotBlank() }
            ?: emptyList()
        val parziali = call.getBoolean("partialResults", true) == true
        val offline = call.getBoolean("preferOffline", false) == true
        val silenzio = call.getInt("silenceMillis") ?: TALOS_PAUSA_FINE_FRASE_MS
        val minimo = call.getInt("minimumMillis") ?: TALOS_ATTESA_INIZIO_MS

        val mia = ++epoca
        val attivita = activity
        if (attivita == null) {
            call.reject("noActivity")
            return
        }

        attivita.runOnUiThread {
            /*
             * ⛔⛔ SI RIUSA IL RICONOSCITORE, non si distrugge e ricrea.
             *
             * MISURATO sul Pad il 2026-08-10, col difetto che l'owner ha
             * trovato premendo il microfono subito dopo una risposta letta ad
             * alta voce: due giri su sei fallivano in meno di mezzo secondo.
             *
             * ⛔ E la traccia diceva dove NON era: il microfono si apriva
             * davvero (`RecognitionService#onMicrophoneOpened`, col segnale
             * acustico), e l'evento d'errore del plugin non arrivava MAI
             * (`eventi: []` con un ascoltatore nostro attaccato apposta). ⇒ Non
             * era il motore e non era l'evento: era `startListening` che
             * lanciava, e il rifiuto della chiamata diventava «riconoscimento
             * fallito» passando dal classificatore.
             *
             * La causa e' qui: `destroy()` su un riconoscitore che sta ancora
             * chiudendo la sessione precedente lo lascia in uno stato in cui il
             * successivo `startListening` non parte — e lo fa a intermittenza,
             * perche' dipende da quanto ci mette il servizio di Google a
             * finire. Un'istanza sola, `cancel()` prima di ripartire, e il
             * problema non esiste: e' anche il modo in cui Android vuole che si
             * usi questa classe.
             */
            /*
             * ⭐⭐ SI ADOTTA L'ASCOLTO GIÀ APERTO, invece di aprirne un altro.
             *
             * `TalosOrecchioAnticipato` ha acceso il microfono in `onCreate`,
             * quando la WebView non esisteva ancora: fra quel momento e questo
             * passano ~760 ms MISURATI, ed è dove finiva la prima parola.
             * Ripartire da capo qui butterebbe via proprio quei millisecondi —
             * più il buco della riapertura. Ci si aggancia, e la coda di quello
             * che è già stato sentito arriva subito.
             */
            // ⛔ IL MICROFONO E' UNO SOLO: la parola di attivazione molla la
            // presa, se no Android silenzia uno dei due senza dirlo.
            ai.talos.parola.TalosParola.cedi()
            /*
             * ⛔⛔ UNA PARTENZA IN ATTESA SI ANNULLA, non si lascia scattare.
             *
             * MISURATO il 12 agosto: due `avvia` nello stesso millisecondo (il
             * gesto apre la barra DUE volte — vedi `TalosAssistente`), e la
             * partenza rimandata del primo scattava lo stesso 250 ms dopo,
             * facendo un secondo `startListening` sul motore del secondo. In
             * logcat: `pronto epoca=2` a 48.255 e ANCORA a 48.497.
             *
             * ⛔ E la promessa del lato web si scioglie: lasciarla appesa
             * bloccherebbe `engine.start()` fino al cane da guardia degli 8 s.
             */
            partenzaInAttesa?.let { mano.removeCallbacks(it) }
            partenzaInAttesa = null
            chiamataInAttesa?.resolve(JSObject().put("started", false).put("superata", true))
            chiamataInAttesa = null
            /*
             * ⭐⭐ SI PRENDE IL MOTORE CALDO, NON LA SESSIONE.
             *
             * Owner 2026-08-11: «col pulsante funziona molto bene, col gesto no».
             * Adottare la sessione aperta in `onCreate` voleva dire ereditare un
             * turno cominciato mezzo secondo prima che la barra si vedesse, e a
             * servizio di riconoscimento ancora freddo — MISURATO: quella prima
             * sessione muore dopo ~1,6 s contro i ~5 delle successive.
             *
             * ⇒ Del lavoro fatto presto si tiene solo la parte che vale davvero:
             * il legame col servizio di Google, che è la parte lenta. La sessione
             * si rifà qui, adesso, esattamente come quando la persona preme il
             * microfono. Una strada sola.
             */
            /*
             * ⭐⭐ SE L'ORECCHIO È GIÀ APERTO CI SI AGGANCIA, non si ricomincia.
             *
             * ## Il difetto, misurato al millisecondo il 12 agosto
             *
             * Owner: «molto meglio, ma vorrei che l'assistente ascoltasse da
             * prima, adesso c'è un leggerissimo delay». Il log lo dice esatto:
             *
             *     11.979  anticipato: pronto a +507 ms    ← il microfono È VIVO
             *     12.243  anticipato: consegno il motore   ← e noi lo UCCIDIAMO
             *     12.516  «pronto» PRESA                   ← torna vivo 273 ms dopo
             *
             * Due danni sommati: i **264 ms** in cui il microfono sentiva e noi
             * buttavamo via la coda, e i **273 ms** in cui era chiuso davvero.
             * Mezzo secondo di sordità piazzato esattamente dove la persona
             * comincia a parlare.
             *
             * ## Perché adesso si può, e l'11 agosto no
             *
             * L'11 agosto l'adozione era stata tolta perché «quella sessione
             * muore dopo ~1,6 s». Quella misura era presa mentre il gesto apriva
             * la barra DUE volte (vedi `TalosAssistente`): due ascolti nello
             * stesso millisecondo si ammazzavano a vicenda. Tolta la causa, la
             * sessione anticipata è una sessione come le altre — stessi tempi,
             * stessa `talosIntentoDiAscolto` — con un vantaggio che nessuna
             * altra ha: è aperta da mezzo secondo prima che la barra si veda.
             *
             * ⛔ Si adotta SOLO se la richiesta è identica a quella con cui
             * l'orecchio è partito. Chi chiede una lingua precisa, o tempi suoi,
             * chiede un'altra cosa: quello si serve col motore caldo, come prima.
             */
            val firma = talosFirmaRichiesta(lingua, automatica, consentite, parziali, offline, silenzio, minimo)
            /*
             * ⛔ SI RICORDA COSA È STATO CHIESTO, così la prossima apertura
             * l'orecchio parte già giusto. Non è una preferenza da configurare:
             * è ciò che questa app ha chiesto l'ultima volta, e nessuno lo sa
             * meglio di lei. Se nel frattempo la persona cambia impostazioni, la
             * firma non combacia e si ricade sul motore caldo — che è il
             * comportamento di prima, non un guasto.
             */
            context.getSharedPreferences(MEMORIA_ORECCHIO, android.content.Context.MODE_PRIVATE)
                .edit().putString("firma", firma).apply()
            if (motore == null && TalosOrecchioAnticipato.firma == firma &&
                TalosOrecchioAnticipato.acceso &&
                TalosOrecchioAnticipato.collega { evento -> inoltra(evento, mia) }
            ) {
                inAscolto = true
                android.util.Log.i(ORECCHIO, "«adotto» epoca=$mia la sessione già aperta")
                call.resolve(JSObject().put("started", true).put("adottata", true))
                return@runOnUiThread
            }
            if (motore == null) {
                // ⛔ Il debito NON si calcola qui: `consegnaIlMotore` chiude un
                // turno e lo timbra da sé (`turnoFinito`). Dedurlo due volte, da
                // due parti, è come sono nati i due difetti di questa giornata.
                motore = TalosOrecchioAnticipato.consegnaIlMotore()
            }
            val riconoscitore = motore ?: SpeechRecognizer.createSpeechRecognizer(context).also {
                motore = it
            }
            val respiro = respiroDovuto()
            /*
             * ⛔⛔ NON si annulla DUE volte, e questa è l'altra metà della cura.
             *
             * Questo `cancel()` serve a chiudere una nostra sessione precedente.
             * Se il motore deve ancora un respiro, una sessione l'ha già chiusa
             * qualcun altro un istante fa e qui non c'è niente di nostro da
             * chiudere: annullare di nuovo è esattamente il gesto che, misurato
             * l'11 agosto, lascia il riconoscitore in uno stato da cui non
             * riparte (`errore=CLIENT (5)`).
             */
            if (respiro == 0L) runCatching { riconoscitore.cancel() }
            val nata = java.util.concurrent.atomic.AtomicBoolean(false)
            riconoscitore.setRecognitionListener(ascoltatore(mia, Build.VERSION.SDK_INT >= 33, nata))
            inAscolto = true

            /*
             * ⛔⛔ IL RESPIRO DELLA CONSEGNA — 250 ms, e senza non parte niente.
             *
             * MISURATO l'11 agosto, due volte di fila: prendendo il motore
             * caldo dall'orecchio anticipato e chiamando `startListening` un
             * millisecondo dopo la chiusura della sua sessione, arriva
             * `errore=CLIENT (5)` — il servizio di Google che rifiuta la
             * partenza. È lo stesso stato che il commento qui sopra descrive per
             * `destroy()`: un riconoscitore che sta ancora chiudendo un turno
             * non ne apre un altro.
             *
             * ⛔ Il respiro si paga SOLO alla consegna, cioè una volta per
             * apertura e prima che la barra sia visibile — non a ogni ascolto.
             * Chi preme il microfono non lo paga mai, ed è per questo che quel
             * percorso funzionava già bene.
             */
            val parti = Runnable {
                partenzaInAttesa = null
                chiamataInAttesa = null
                // ⛔ Nel frattempo può essere arrivato un avvio più recente: la
                // sua epoca ha già scavalcato la nostra, e far partire il motore
                // adesso vorrebbe dire ucciderne la sessione.
                if (mia != epoca) {
                    android.util.Log.i(ORECCHIO, "«partenza» mia=$mia epoca=$epoca SCARTATA (superata)")
                    call.resolve(JSObject().put("started", false).put("superata", true))
                    return@Runnable
                }
                try {
                    // ⛔ Prima di far partire: da qui in poi gli eventi sono
                    // nostri. Metterlo dopo lascerebbe scoperto proprio
                    // l'istante in cui il motore risponde più in fretta.
                    nata.set(true)
                    // ⛔ L'intento si TIENE: la riapertura silenziosa (vedi
                    // `ilSilenzioNonEUnEsito`) deve ripartire con la sessione
                    // identica, non con una ricalcolata che potrebbe differire.
                    val intento = talosIntentoDiAscolto(
                        context, lingua, automatica, consentite, parziali, offline, silenzio, minimo,
                    )
                    intentoDiQuestaSessione = intento
                    qualcosaDetto = false
                    ascoltoApertoA = android.os.SystemClock.uptimeMillis()
                    riconoscitore.startListening(intento)
                    call.resolve(JSObject().put("started", true))
                } catch (errore: Exception) {
                    inAscolto = false
                    // ⛔ Il motivo VERO viaggia col rifiuto: senza, chi sta sopra
                    // vede solo «riconoscimento fallito» e cerca il guasto nel
                    // motore — che e' esattamente dove NON era.
                    call.reject("startFailed: ${errore.javaClass.simpleName}: ${errore.message}")
                }
            }
            android.util.Log.i(ORECCHIO, "«avvia» epoca=$mia respiro=${respiro}ms")
            if (respiro > 0L) {
                partenzaInAttesa = parti
                chiamataInAttesa = call
                mano.postDelayed(parti, respiro)
            } else {
                parti.run()
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val attivita = activity
        if (attivita == null) {
            call.resolve()
            return
        }
        attivita.runOnUiThread {
            // ⛔ Anche quello anticipato: è un microfono aperto come gli altri, e
            // «ferma» deve fermare tutto ciò che ascolta, non la metà che
            // ricordiamo.
            TalosOrecchioAnticipato.spegni()
            // Finito di ascoltare davvero: la parola di attivazione può tornare
            // ad aspettare.
            ai.talos.parola.TalosParola.riprendi()
            try {
                motore?.stopListening()
            } catch (ignorato: Exception) {
                // Fermare un motore già fermo non è un errore da riferire.
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        epoca += 1
        // ⛔ Se c'era una sessione viva, il motore da adesso deve un respiro a
        // chiunque voglia ripartire — anche a chi riapre subito dopo, che è
        // esattamente quello che fa la barra quando il silenzio chiude un turno.
        val eraViva = inAscolto
        inAscolto = false
        val attivita = activity
        if (attivita == null) {
            call.resolve()
            return
        }
        attivita.runOnUiThread {
            partenzaInAttesa?.let { mano.removeCallbacks(it) }
            partenzaInAttesa = null
            chiamataInAttesa?.resolve(JSObject().put("started", false).put("superata", true))
            chiamataInAttesa = null
            /*
             * ⛔⛔ SI ANNULLA CIÒ CHE ASCOLTA, non «il nostro motore».
             *
             * Da quando la sessione anticipata si può ADOTTARE, `motore` è null
             * proprio nel caso in cui il microfono è aperto: annullare solo lui
             * lascerebbe il microfono acceso dopo che la persona ha premuto per
             * fermare. È lo stesso difetto che `stop()` aveva già pagato — «fermare
             * deve fermare tutto ciò che ascolta, non la metà che ricordiamo».
             */
            TalosOrecchioAnticipato.spegni()
            /*
             * ⛔⛔⛔ E LA PAROLA DI ATTIVAZIONE RIPRENDE — qui MANCAVA, e la
             * mancanza rendeva TALOS sordo per 45 secondi.
             *
             * Owner 2026-08-14: «hey jarvis non funziona quando la barra è già
             * aperta, se TALOS non è in listening non fa ripartire l'ascolto».
             *
             * La causa è la simmetria rotta fra i due modi di smettere:
             * `stop()` restituiva il microfono alla parola, `cancel()` no. E la
             * barra chiama SEMPRE `cancel()` — i dieci secondi che scadono,
             * l'invio, il pulsante del microfono, il turno che si chiude. Quindi
             * dopo ogni ascolto la parola restava «ceduta» fino alla scadenza
             * della cessione, che è **45 secondi**: la barra a schermo, il
             * servizio vivo, la notifica che dice che sta aspettando, e nessuno
             * che sente niente.
             *
             * ⇒ Chi smette di ascoltare RESTITUISCE il microfono. Tutti e due i
             * modi di smettere, senza eccezioni: un solo verbo mancante ha
             * spento una funzione intera senza rompere niente di visibile.
             */
            ai.talos.parola.TalosParola.riprendi()
            // ⛔ Si annulla, NON si distrugge: l'istanza si riusa, e distruggerla
            // qui riporterebbe il difetto intermittente al giro dopo.
            runCatching { motore?.cancel() }
            if (eraViva) sessioneInterrottaA = android.os.SystemClock.uptimeMillis()
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        epoca += 1
        // ⛔ Una partenza rimandata su un'app che sta chiudendo farebbe partire
        // il microfono dopo che la barra non c'è più.
        partenzaInAttesa?.let { mano.removeCallbacks(it) }
        partenzaInAttesa = null
        chiamataInAttesa = null
        try {
            motore?.destroy()
        } catch (ignorato: Exception) {
            // L'app sta chiudendo: non c'è nessuno a cui riferirlo.
        }
        motore = null
    }

    // ------------------------------------------------------------ richiamate

    /**
     * ⛔⛔ `aSegmenti` NON È UN DETTAGLIO: cambia CHI chiude il turno.
     *
     * Owner 2026-08-11: «dico "buonasera fratello" e lui manda "buonasera"».
     *
     * PROVATO sul sorgente AOSP di `RecognitionListener`, verbatim:
     *
     *   `onResults`  — «Called with the results for the **full speech**… To get
     *                  recognition results **in segments** rather than for the
     *                  full session see `EXTRA_SEGMENTED_SESSION`»
     *   `onSegmentResults` — «might be called **any number of times** between
     *                  `onReadyForSpeech` and `onEndOfSegmentedSession`»
     *
     * ⇒ In una sessione a segmenti la fine è `onEndOfSegmentedSession`, e
     * `onResults` è la strada dell'ALTRA modalità. Noi chiediamo sempre i
     * segmenti da API 33 in su, e poi in `onResults` facevamo `stato("stopped")`:
     * il PRIMO segmento chiudeva il turno e la barra spediva, mentre la persona
     * stava ancora parlando. Un contratto letto a metà.
     */
    private fun ascoltatore(
        mia: Int,
        aSegmenti: Boolean,
        nata: java.util.concurrent.atomic.AtomicBoolean,
    ): RecognitionListener = object : RecognitionListener {
        /**
         * ⛔⛔ Viva significa DUE cose, e la seconda è costata una serata.
         *
         * `mia == epoca` scarta gli eventi delle sessioni chiuse. Ma ne esiste
         * un altro genere: quelli che arrivano PRIMA che la nostra sia
         * cominciata.
         *
         * MISURATO l'11 agosto, otto millisecondi dopo aver preso il motore
         * caldo dall'orecchio anticipato: `errore=CLIENT (5)`. Non era la nostra
         * partenza che falliva — era l'`onError` del `cancel()` della sessione
         * PRECEDENTE, che atterrava sull'ascoltatore nuovo perché nel frattempo
         * l'avevamo già installato. La barra lo mostrava come «riconoscimento
         * fallito» su un ascolto che un secondo dopo funzionava benissimo
         * (`PARLA a +1523 ms` nello stesso log).
         *
         * ⇒ Un ascoltatore installato non è un ascoltatore in servizio. Lo
         * diventa quando la SUA `startListening` è passata.
         */
        private fun viva() = mia == epoca && nata.get()

        /**
         * ⛔⛔ ANCHE GLI EVENTI SCARTATI LASCIANO UNA RIGA — ed è il metodo, non
         * un dettaglio.
         *
         * ## Perché esiste
         *
         * Ogni richiamata qui dentro comincia con `if (!viva()) return`. Uno
         * scarto e una consegna, da fuori, erano **indistinguibili**: nessuno dei
         * due lasciava niente. E questa famiglia di difetti vive esattamente lì —
         * un errore che appartiene a un'altra sessione e che passa (12 agosto),
         * oppure un risultato buono che viene buttato. Due guasti opposti, la
         * stessa assenza di prova.
         *
         * ⇒ Si scrive PRIMA del guardiano, con tutto ciò che serve a rifare il
         * suo ragionamento: la mia epoca, quella corrente, se sono nato, e il
         * verdetto. Chi legge non deve più indovinare quale delle tre porte ha
         * scattato.
         *
         * ## `ORFANO` — la parola che nomina il difetto
         *
         * `apertura` la scrive `onReadyForSpeech`. Un evento che arriva con
         * `apertura == 0` viene da una sessione che QUESTO ascoltatore non ha mai
         * visto nascere: è un evento di qualcun altro. Il 12 agosto quella firma
         * c'era già, travestita da numero assurdo — `errore=CLIENT (5) a
         * +321388049 ms`, cioè il tempo dall'accensione del dispositivo. Adesso
         * ha un nome, e chi legge il log non deve accorgersi che quel numero è
         * troppo grande.
         *
         * ## Come si legge, in un comando
         *
         *     adb logcat -c && adb shell input keyevent 219 && adb logcat -d -s TalosOrecchio
         *
         * Esce la storia intera in ordine: chi ha aperto il microfono, cosa ha
         * risposto il motore, cosa abbiamo scartato e perché, e cosa ha deciso il
         * lato web (che scrive qui dentro con `traccia`).
         */
        private fun eco(cosa: String, extra: String = "") {
            val quando = if (apertura == 0L) {
                "ORFANO"
            } else {
                "+${android.os.SystemClock.elapsedRealtime() - apertura}ms"
            }
            android.util.Log.i(
                ORECCHIO,
                "«$cosa» epoca=$mia/$epoca nata=${nata.get()} ${if (viva()) "PRESA" else "SCARTATA"} $quando $extra",
            )
        }

        /*
         * ⛔ L'ORECCHIO — la sonda che dice se l'audio ARRIVA, non se il motore
         * è contento.
         *
         * Owner 2026-08-11: «l'assistente parte, dice che ascolta, io parlo e
         * non succede niente». Per settimane si è discusso se il motore
         * "sentisse": nessuno lo stava misurando. `onRmsChanged` era un metodo
         * vuoto, cioè l'unico posto dove il livello del microfono passa davvero
         * e non veniva guardato da nessuno.
         *
         * ⇒ Va in `logcat`, non sul ponte: trenta eventi al secondo attraverso
         * Capacitor costerebbero più di quanto valgono, ma un riassunto ogni
         * mezzo secondo con MASSIMO e CONTEGGIO risponde alla sola domanda che
         * conta — «al riconoscitore sta arrivando del suono, sì o no?».
         *
         * Un `rms` piatto a -2 dB con la persona che parla significa microfono
         * muto o rubato; un `rms` che sale mentre il testo non compare sposta
         * la colpa sul riconoscimento, non sulla cattura. Sono due difetti
         * diversi con due cure diverse, e senza questa riga si confondono.
         */
        private var picco = Float.NEGATIVE_INFINITY
        private var campioni = 0
        private var ultimoRapporto = 0L
        private var apertura = 0L

        /** Il picco da mandare a schermo, e quando l'abbiamo mandato. Vedi `onRmsChanged`. */
        private var piccoPonte = Float.NEGATIVE_INFINITY
        private var ultimoPonte = 0L

        override fun onReadyForSpeech(params: Bundle?) {
            apertura = android.os.SystemClock.elapsedRealtime()
            picco = Float.NEGATIVE_INFINITY
            campioni = 0
            ultimoRapporto = apertura
            eco("pronto")
            if (viva()) stato("ready")
        }

        override fun onBeginningOfSpeech() {
            eco("PARLA")
            if (viva()) stato("listening")
        }

        override fun onRmsChanged(rms: Float) {
            campioni += 1
            if (rms > picco) picco = rms
            val ora = android.os.SystemClock.elapsedRealtime()
            /*
             * ⭐⭐ IL SUONO VERO ARRIVA A SCHERMO — owner 2026-08-12: «quando
             * parli con Gemini non fa vedere il testo, fa vedere solo una wave
             * che reagisce al suono».
             *
             * ⛔ E finora quella wave, da noi, era FINTA: tre barre con
             * un'animazione CSS a ciclo fisso, più un `level` calcolato in
             * JavaScript da **quanto cresce il testo trascritto**
             * (`text.length`). Reagiva al riconoscimento, non alla voce — cioè
             * si muoveva mezzo secondo dopo, e restava ferma mentre parlavi.
             *
             * Qui c'è l'unico posto dell'app dove passa il livello vero del
             * microfono. Il commento sopra spiegava perché non lo mandavamo:
             * trenta eventi al secondo attraverso Capacitor costano più di
             * quanto valgono. ⇒ Se ne manda il PICCO ogni 80 ms — dodici al
             * secondo, che è il ritmo con cui si muovono le waveform dei
             * messaggi vocali — e il rapporto lungo per `logcat` resta a 500 ms.
             *
             * ⛔ Si manda il dB GREZZO, non un valore fra 0 e 1: la scala di
             * `onRmsChanged` non è dichiarata da nessuna parte e cambia col
             * dispositivo. Normalizzare qui vorrebbe dire scrivere a mano un
             * fondo scala che è un fatto sul telefono — si misura di là, con una
             * finestra che si adatta a quello che sente davvero.
             */
            if (ora - ultimoPonte >= 80L) {
                ultimoPonte = ora
                if (viva()) notifyListeners("talosDictationLevel", JSObject().put("db", piccoPonte))
                piccoPonte = Float.NEGATIVE_INFINITY
            }
            if (rms > piccoPonte) piccoPonte = rms
            if (ora - ultimoRapporto < 500L) return
            android.util.Log.i(
                ORECCHIO,
                "livello picco=$picco campioni=$campioni finestra=${ora - apertura} ms",
            )
            ultimoRapporto = ora
            picco = Float.NEGATIVE_INFINITY
            campioni = 0
        }

        override fun onBufferReceived(buffer: ByteArray?) = Unit

        override fun onEndOfSpeech() {
            eco("fine del parlato")
            if (viva()) stato("stopping")
        }

        override fun onError(error: Int) {
            eco("errore", "${talosNomeErrore(error)} ($error)")
            if (!viva()) return
            // ⛔ PRIMA di chiudere il turno: un silenzio senza una parola, dentro
            // la pazienza dichiarata, non è un esito. Vedi `ilSilenzioNonEUnEsito`.
            if (ilSilenzioNonEUnEsito(error)) return
            epoca += 1
            inAscolto = false
            sessioneInterrottaA = android.os.SystemClock.uptimeMillis()
            notifyListeners(
                "talosDictationError",
                JSObject().put("code", talosNomeErrore(error)).put("raw", error),
            )
        }

        override fun onResults(results: Bundle?) {
            eco("risultato")
            if (!viva()) return
            val testo = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            if (testo.isNotEmpty()) qualcosaDetto = true
            if (aSegmenti) {
                /*
                 * ⛔ In una sessione a segmenti questo NON è «ha finito di
                 * parlare»: è un pezzo. Si consegna come segmento — chi sta
                 * sopra li accumula già — e la sessione resta aperta finché non
                 * arriva `onEndOfSegmentedSession`. Chiudere qui era il difetto
                 * di «buonasera fratello» che partiva come «buonasera».
                 */
                if (testo.isNotEmpty()) {
                    notifyListeners("talosDictationSegment", JSObject().put("text", testo))
                }
                return
            }
            epoca += 1
            inAscolto = false
            sessioneInterrottaA = android.os.SystemClock.uptimeMillis()
            notifyListeners("talosDictationResult", JSObject().put("text", testo))
            stato("stopped")
        }

        override fun onPartialResults(partialResults: Bundle?) {
            if (!viva()) {
                // ⛔ Uno scarto qui è il difetto «sente solo la prima parola»
                // visto dall'altra parte: le parole c'erano, le buttavamo noi.
                eco("parziale")
                return
            }
            val testo = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            if (testo.isNotEmpty()) {
                // ⛔ È il TESTO che segna «qualcuno ha parlato», non
                // `onBeginningOfSpeech`: MISURATO, il motore ha annunciato PARLA
                // e 51 ms dopo ha risposto NO_MATCH senza una sola parola. Un
                // rumore basta a far scattare l'annuncio; solo il testo prova
                // che c'è una voce.
                qualcosaDetto = true
                notifyListeners("talosDictationPartial", JSObject().put("text", testo))
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) = Unit

        /**
         * ⭐ Un SEGMENTO e' finito: la persona ha preso fiato, non ha smesso.
         *
         * ⛔ Il testo qui e' definitivo per QUEL pezzo, e le parziali che
         * arrivano dopo ripartono da zero — chi sta sopra deve accumulare, o
         * ogni respiro cancellerebbe quello che si e' detto prima.
         */
        override fun onSegmentResults(segmentResults: Bundle) {
            eco("segmento")
            if (!viva()) return
            val testo = segmentResults
                .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            if (testo.isNotEmpty()) {
                qualcosaDetto = true
                notifyListeners("talosDictationSegment", JSObject().put("text", testo))
            }
        }

        override fun onEndOfSegmentedSession() {
            eco("fine della sessione a segmenti")
            if (!viva()) return
            epoca += 1
            inAscolto = false
            sessioneInterrottaA = android.os.SystemClock.uptimeMillis()
            stato("stopped")
        }

        /**
         * ⭐ API 34: il motore dice che lingua ha sentito. Non serve a cambiare
         * l'ascolto — a quello pensa `EXTRA_ENABLE_LANGUAGE_SWITCH` da solo —
         * serve a chi sta sopra per rispondere e per LEGGERE nella stessa
         * lingua in cui gli hanno parlato.
         */
        override fun onLanguageDetection(results: Bundle) {
            if (!viva()) return
            val rilevata = results.getString(SpeechRecognizer.DETECTED_LANGUAGE)
            if (rilevata.isNullOrBlank()) return
            notifyListeners(
                "talosDictationLanguage",
                JSObject()
                    .put("language", rilevata)
                    .put(
                        "confidence",
                        results.getInt(SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL, -1),
                    ),
            )
        }
    }

    /**
     * Gli eventi dell'orecchio anticipato, consegnati al lato web nella forma
     * che già conosce — così di là non cambia niente, e questo file resta l'unico
     * posto che sa che esistono due modi di aprire il microfono.
     */
    private fun inoltra(evento: TalosOrecchioAnticipato.Evento, mia: Int) {
        if (mia != epoca) return
        when (evento.tipo) {
            // ⛔ Il VOLUME della sessione adottata. Senza questa riga la waveform
            // dell'assistente resta piatta mentre nella chat funziona — owner
            // 2026-08-12. Le due strade attaccano due ascoltatori diversi, e
            // quello dell'orecchio anticipato passa di qui.
            "livello" -> {
                // ⛔ UNA riga per sessione, non dodici al secondo: serve a
                // rispondere «il volume passa, sì o no?» senza dover parlare nel
                // microfono per scoprirlo. È la domanda che oggi è costata una
                // build.
                if (primoLivello != mia) {
                    primoLivello = mia
                    android.util.Log.i(ORECCHIO, "«livello» epoca=$mia il volume della sessione adottata passa")
                }
                notifyListeners("talosDictationLevel", JSObject().put("db", evento.numero))
            }
            "parziale" -> notifyListeners("talosDictationPartial", JSObject().put("text", evento.testo))
            "segmento" -> notifyListeners("talosDictationSegment", JSObject().put("text", evento.testo))
            "risultato" -> notifyListeners("talosDictationResult", JSObject().put("text", evento.testo))
            "errore" -> {
                epoca += 1
                inAscolto = false
                notifyListeners("talosDictationError", JSObject().put("code", evento.codice))
            }
            else -> {
                if (evento.codice == "stopped") {
                    epoca += 1
                    inAscolto = false
                }
                stato(evento.codice)
            }
        }
    }

    private fun stato(quale: String) {
        notifyListeners("talosDictationState", JSObject().put("state", quale))
    }
}


/*
 * ⛔ TOP-LEVEL, e non un metodo del plugin, per una ragione precisa.
 *
 * Dall'11 agosto ci sono DUE posti che aprono il microfono: il plugin, quando
 * il lato web lo chiede, e `TalosOrecchioAnticipato`, che parte in `onCreate`
 * dell'Activity per non perdere la prima parola. Se ognuno costruisse il
 * proprio intento, i due ascolti divergerebbero in silenzio — ed è esattamente
 * il difetto che oggi è costato una giornata, quando barra e chat si sono
 * scostate sui tempi di ascolto. Un costruttore solo, per tutti.
 */
internal fun talosIntentoDiAscolto(
    context: Context,
    lingua: String?,
    automatica: Boolean,
    consentite: List<String>,
    parziali: Boolean,
    offline: Boolean,
    silenzio: Int,
    minimo: Int,
): Intent {
    val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
    i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, parziali)
    // Chiave non pubblica ma di fatto necessaria: senza, il motore chiude
    // alla prima pausa e una dettatura lunga si taglia a metà.
    i.putExtra("android.speech.extra.DICTATION_MODE", parziali)
    i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    if (offline) i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    if (silenzio > 0) {
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, silenzio)
        i.putExtra(
            RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS,
            silenzio,
        )
    }

    /*
     * ⛔⛔ E QUANTO ASPETTARE PRIMA CHE UNO COMINCI, che è un'altra cosa.
         *
         * I due `SILENCE` qui sopra dicono «quanto silenzio DOPO che ha
         * parlato». Nessuno dei due dice al motore di non chiudere prima che
         * la persona abbia aperto bocca — e il default è corto. Owner
         * 2026-08-11: «la modalità ascolto rimane ma non ascolta niente, al
         * primo avvio». Il motore chiudeva dopo un secondo, noi riaprivamo, e
         * `startListening` chiamata di continuo **fallisce in silenzio**:
         * `onBeginningOfSpeech` non arriva più (comportamento noto e
         * documentato della classe).
         *
     * ⇒ Si dice al motore di aspettare, invece di riaprirlo a raffica.
     *
     * ⛔ E si dichiara SEPARATO dal silenzio. Prima era `silenzio * 5`, un
     * numero che avevo scelto senza misurarlo: legava due attese che non
     * hanno niente in comune. Accorciare la pausa che vuol dire «ho finito»
     * — perché la domanda deve partire subito — accorciava anche il tempo
     * che TALOS concede a chi sta ancora pensando. Sono due decisioni di
     * prodotto diverse e adesso si scrivono in due posti diversi.
     */
    if (minimo > 0) {
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, minimo)
    }

    // ⛔ La lingua si mette SOLO se qualcuno l'ha chiesta davvero. Senza
    // questa chiave il motore usa la lingua di sistema, che è già la
    // risposta giusta nella stragrande maggioranza dei casi — mentre una
    // lingua sbagliata scritta qui è il difetto che ha aperto questo file.
    if (!lingua.isNullOrBlank()) i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lingua)

    if (automatica && Build.VERSION.SDK_INT >= 34) {
        i.putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_DETECTION, true)
        i.putExtra(
            RecognizerIntent.EXTRA_ENABLE_LANGUAGE_SWITCH,
            RecognizerIntent.LANGUAGE_SWITCH_BALANCED,
        )
        if (consentite.isNotEmpty()) {
            val elenco = ArrayList(consentite)
            i.putStringArrayListExtra(
                RecognizerIntent.EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES,
                elenco,
            )
            i.putStringArrayListExtra(
                RecognizerIntent.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES,
                elenco,
            )
        }
    }

    if (Build.VERSION.SDK_INT >= 33) {
        // Punteggiatura e maiuscole a carico del motore: chi detta non
        // dovrebbe dire «virgola» ad alta voce.
        i.putExtra(
            RecognizerIntent.EXTRA_ENABLE_FORMATTING,
            RecognizerIntent.FORMATTING_OPTIMIZE_QUALITY,
        )
        // ⛔⛔ SESSIONE A SEGMENTI — la differenza fra dettare una frase e
        // dettare un pensiero. Senza, il riconoscitore chiude al primo
        // respiro: chi si ferma a pensare si ritrova la dettatura finita a
        // meta'. Con questa, i risultati arrivano a SEGMENTI
        // (`onSegmentResults`) e la sessione dura finche' non la si chiude.
        i.putExtra(
            RecognizerIntent.EXTRA_SEGMENTED_SESSION,
            RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
        )
        if (silenzio <= 0) {
            // Il respiro di chi pensa: due secondi chiudono un SEGMENTO, non
            // la sessione. Il numero non e' un gusto — sotto il secondo si
            // spezzano le frasi a meta', sopra i tre la trascrizione arriva
            // a blocchi e sembra ferma.
            i.putExtra(
                RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,
                2_000,
            )
        }
    }
    return i
}


/**
 * I nomi, non i numeri. ⛔ `NO_MATCH` e `SPEECH_TIMEOUT` restano distinti da
 * tutto il resto: sono «non hai parlato», non «si è rotto qualcosa», e
 * confonderli è il difetto che l'owner ha sentito il 2026-08-10.
 */
/** I nomi degli errori, condivisi dai due posti che aprono il microfono. */
/**
 * ⭐⭐ LA FIRMA DI UNA RICHIESTA D'ASCOLTO — «stai chiedendo la STESSA cosa?».
 *
 * Serve a una domanda sola, e senza di lei si risponde a occhio: la sessione che
 * `TalosOrecchioAnticipato` ha già aperto va bene per chi arriva adesso, oppure
 * va rifatta? Confrontare i campi a mano è il modo per dimenticarne uno il
 * giorno in cui se ne aggiunge un altro — e dimenticarlo vuol dire adottare una
 * sessione che ascolta in un modo diverso da quello chiesto, in silenzio.
 *
 * ⛔ MISURATO il 12 agosto: l'adozione non scattava mai, e la ragione era
 * `allowedLanguages` — la barra le passa, l'orecchio partiva senza. La guardia
 * faceva il suo mestiere; era l'orecchio a partire con la richiesta sbagliata.
 */
internal fun talosFirmaRichiesta(
    lingua: String?,
    automatica: Boolean,
    consentite: List<String>,
    parziali: Boolean,
    offline: Boolean,
    silenzio: Int,
    minimo: Int,
): String = listOf(
    lingua ?: "-",
    automatica.toString(),
    consentite.sorted().joinToString(","),
    parziali.toString(),
    offline.toString(),
    silenzio.toString(),
    minimo.toString(),
).joinToString("|")

/** Dove l'orecchio anticipato va a leggere com'è andata l'ultima volta. */
internal const val MEMORIA_ORECCHIO = "talos_orecchio_anticipato"

internal fun talosNomeErrore(codice: Int): String = when (codice) {
    SpeechRecognizer.ERROR_AUDIO -> "AUDIO"
    SpeechRecognizer.ERROR_CLIENT -> "CLIENT"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "INSUFFICIENT_PERMISSIONS"
    SpeechRecognizer.ERROR_NETWORK -> "NETWORK"
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "NETWORK_TIMEOUT"
    SpeechRecognizer.ERROR_NO_MATCH -> "NO_MATCH"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "RECOGNIZER_BUSY"
    SpeechRecognizer.ERROR_SERVER -> "SERVER"
    SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "SERVER_DISCONNECTED"
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "SPEECH_TIMEOUT"
    else -> "UNKNOWN_$codice"
}
