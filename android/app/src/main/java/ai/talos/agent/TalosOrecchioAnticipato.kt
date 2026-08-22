package ai.talos.agent

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.SpeechRecognizer
import android.util.Log

/**
 * ⭐⭐ L'ORECCHIO CHE SI APRE PRIMA DELLA FINESTRA — e la prima parola smette di
 * sparire.
 *
 * ## ⛔ Il difetto, misurato al millisecondo
 *
 * Owner 2026-08-11: «dico "apri Google Chrome" e ha sentito solo "Google
 * Chrome"». MISURATO sul Pad, dall'istante della richiesta di apertura:
 *
 *     +0 ms      richiesta di apertura della barra
 *     +569 ms    la barra si VEDE  (`Displayed`)
 *     +763 ms    il riconoscitore è pronto
 *     +2696 ms   ...e la prima sessione era già morta: si riapre
 *
 * Fra il tocco e il microfono vivo passano **763 ms**, e per gran parte di quel
 * tempo la barra non esiste ancora: l'ascolto partiva da `onMounted` di un
 * componente Vue, cioè **dopo** che era nata l'Activity, era nata la WebView,
 * era stato caricato il bundle e Vue si era montato. Una persona che tocca e
 * parla subito regala tre quarti di secondo al vuoto — e «apri» dura meno.
 *
 * ⇒ La cura non è un numero da alzare: è **spostare l'inizio**. Qui l'ascolto
 * comincia in `onCreate` dell'Activity, sul thread principale, prima che esista
 * una WebView. Quello che arriva nel frattempo si mette in coda; quando il lato
 * web è pronto si aggancia e se lo riprende tutto, invece di far ripartire il
 * motore da capo — che rifarebbe il buco.
 *
 * ## Perché una coda e non un secondo riconoscitore
 *
 * Due riconoscitori vivi vorrebbero dire due sessioni sullo stesso microfono, e
 * Android ne silenzia una senza dirlo. Qui il motore è **uno**: questo oggetto
 * lo accende presto e lo tiene; il plugin, quando il JS chiede di ascoltare, si
 * limita ad **agganciarsi** e a ricevere anche ciò che è successo prima di lui.
 *
 * ⛔ E se nessuno si aggancia — perché la barra è stata aperta per scrivere, non
 * per parlare — l'orecchio si spegne da solo dopo `SOLITUDINE_MS`. Un microfono
 * che resta aperto perché ci si è dimenticati di chiuderlo è la cosa peggiore
 * che questo file potrebbe fare.
 */
object TalosOrecchioAnticipato {

    /**
     * Un fatto avvenuto sul microfono, nella forma che il plugin sa consegnare.
     *
     * ⛔ `numero` esiste per il VOLUME, e non è un campo generico: era l'unico
     * fatto del microfono che questa classe non sapeva raccontare, e per questo
     * la waveform dell'assistente restava piatta. Vedi `onRmsChanged`.
     */
    data class Evento(
        val tipo: String,
        val testo: String = "",
        val codice: String = "",
        val numero: Float = 0f,
    )

    /** Nessuno si aggancia entro questo tempo ⇒ il microfono si chiude da solo. */
    private const val SOLITUDINE_MS = 12_000L

    /**
     * Quanto si aspetta prima di riaprire una sessione morta di silenzio.
     *
     * ⛔ Non zero: chiudere e riaprire nello stesso millisecondo mette questo
     * riconoscitore in uno stato da cui non riparte — misurato l'11 agosto,
     * `errore=CLIENT (5)`, ed è la ragione per cui `consegnaIlMotore` non
     * annulla. Sessanta millesimi non si sentono e bastano.
     */
    private const val RESPIRO_RIAPERTURA_MS = 60L

    /**
     * ⛔⛔ L'EPOCA, e senza di lei la consegna del motore fa più danni del male
     * che cura.
     *
     * MISURATO l'11 agosto, un millisecondo dopo aver consegnato il motore al
     * plugin: `errore=CLIENT (5)` — l'`onError` della sessione appena annullata,
     * che arriva DOPO ed è indistinguibile da un guasto vero. La barra lo
     * prendeva per tale e mostrava «riconoscimento fallito» su un ascolto
     * perfettamente sano.
     *
     * `cancel()` non è istantaneo: il servizio di Google chiude il turno con i
     * suoi tempi e le richiamate in volo atterrano comunque. L'unica difesa è
     * dichiarare quali sono ancora nostre — è la stessa lezione già pagata nel
     * plugin, e qui mancava perché questo ascoltatore è una seconda copia.
     */
    @Volatile
    private var epoca = 0

    private val coda = ArrayDeque<Evento>()
    private var motore: SpeechRecognizer? = null
    private var consegna: ((Evento) -> Unit)? = null
    private val mano = Handler(Looper.getMainLooper())
    private var apertura = 0L

    /** Vero fra `accendi` e la fine della sessione: il plugin lo consulta. */
    @Volatile
    var acceso = false
        private set

    /**
     * ⭐⭐ CON QUALE RICHIESTA È PARTITO — e serve al plugin per decidere se
     * questa sessione si può ADOTTARE o va rifatta.
     *
     * ## ⛔ Perché non poteva bastare «parte coi valori di default»
     *
     * MISURATO il 12 agosto: l'adozione non scattava MAI. La barra chiede anche
     * `allowedLanguages` — le lingue che la persona ha in casa — e qui si partiva
     * senza. Due ascolti diversi, e la guardia li rifiutava giustamente.
     *
     * ⛔ E indovinare non si poteva: questo oggetto nasce in `onCreate`, prima
     * della WebView, quindi non può CHIEDERE niente a nessuno. Ma non deve
     * indovinare — deve **ricordare**: il plugin scrive la firma di ogni
     * richiesta, e alla prossima apertura si riparte da quella. Al primo avvio
     * assoluto non c'è memoria e la firma non combacia: si ricade sul motore
     * caldo, cioè sul comportamento di prima.
     */
    @Volatile
    var firma: String? = null
        private set

    /**
     * ⛔⛔ QUANDO L'ULTIMA SESSIONE SU QUESTO MOTORE È FINITA — chiunque l'abbia
     * finita.
     *
     * MISURATO il 12 agosto, e il difetto l'avevo appena creato io. Avevo
     * raffinato il respiro così: «lo si deve solo se abbiamo INTERROTTO qualcosa
     * di vivo». Sembra più preciso ed è falso — il riconoscitore ci mette il suo
     * tempo a chiudere anche quando il turno finisce **da solo**. Sul Pad:
     *
     *     «avvia» epoca=1 respiro=0ms
     *     «pronto» epoca=1/1 PRESA
     *     …e poi NIENTE per diciassette secondi
     *
     * Nessun errore, nessun risultato: la sessione era nata morta. È il guasto
     * MUTO che il commento sul `destroy()` descrive da giorni — «non sente più
     * niente e non lo dice» — e ci sono cascato dall'altra porta.
     *
     * ⇒ Il debito si misura dall'ultima FINE, non dall'ultima interruzione.
     */
    @Volatile
    var ultimaFine = 0L
        private set

    /**
     * ⛔⛔ L'ULTIMO VOLUME MISURATO, anche mentre nessuno guarda.
     *
     * MISURATO il 12 agosto con la sonda sull'onda: per i primi DUE secondi le
     * ventotto barre restano a zero —
     *
     *     onda campioni=12  picco=0.00
     *     onda campioni=24  picco=0.00
     *     primo volume dal microfono db=0.16   ← solo adesso
     *     onda campioni=48  picco=0.49
     *
     * — ed e' esattamente l'istante in cui la persona guarda la barra che si
     * apre. Il volume in quei due secondi ESISTE: lo sta gia' misurando questo
     * ascoltatore, aperto mezzo secondo prima della WebView. Semplicemente non
     * lo consegnavamo, perche' il livello non si accoda (giustamente: una coda
     * di livelli vecchi disegnerebbe un'onda del passato).
     *
     * ⇒ Non si accoda la STORIA, si tiene l'ULTIMO. All'aggancio si consegna
     * quello, una volta: e' vero adesso, ed e' il solo modo perche' l'onda nasca
     * viva invece di accendersi due secondi dopo.
     */
    @Volatile
    private var ultimoVolume: Float? = null

    /** Un turno è finito, comunque sia finito: da qui parte il respiro. */
    private fun turnoFinito() {
        acceso = false
        ultimaFine = SystemClock.uptimeMillis()
    }

    /**
     * ⭐⭐⭐ L'INTENTO DI QUESTA SESSIONE, per poterla RIFARE senza rifare i conti.
     *
     * Serve alla ripartenza silenziosa qui sotto: la sessione che si riapre deve
     * essere **identica** a quella che è morta, se no la firma cambia e il lato
     * web non può più adottarla — cioè si curerebbe la sordità creando la
     * sessione buttata che questo file esiste per evitare.
     */
    private var intentoDiQuestaSessione: Intent? = null

    /** Vero appena arriva del TESTO: allora la sessione ha fatto il suo lavoro. */
    @Volatile
    private var qualcosaDetto = false

    /**
     * ⛔⛔⛔ IL SILENZIO NON CHIUDE L'ORECCHIO — e questa è la cura del difetto
     * che l'owner ha descritto il 2026-08-14:
     *
     * > «Quando dico *hey jarvis* e parlo subito dopo che compare la barra, non
     * > prende bene le mie parole… rischia di mangiarsi parole.»
     *
     * ## La misura, sul Pad, con la frase detta subito dopo la parola
     *
     *     16:50:20.806  anticipato: pronto a +140 ms     ← il microfono è aperto
     *     16:50:22.244  barra: accendo l'ascolto          ← la WebView arriva a +1,6 s
     *     16:50:22.304  anticipato: agganciato a +1639 ms
     *     16:50:22.490  anticipato: PARLA a +1825 ms      ← la persona sta parlando
     *     16:50:22.541  anticipato «errore» +1876ms NO_MATCH   ← e 51 ms dopo muore
     *     16:50:23.046  barra: chiamo toggle              ← mezzo secondo di respiro
     *     16:50:23.373  «pronto» PRESA +0ms               ← sessione nuova a +2,5 s
     *
     * Tre misure in tre aperture diverse: **+1836, +1864, +1876 ms**. È il
     * riconoscitore di Google che applica il silenzio di fine frase — 1.600 ms —
     * anche PRIMA che qualcuno abbia parlato: la sessione nasce in una stanza
     * muta (la parola di attivazione è appena finita) e muore di quel silenzio
     * proprio nell'istante in cui la WebView si aggancia.
     *
     * ⇒ Il buco è fra +1,9 s e +2,5 s, ed è esattamente dove una persona che
     * vede comparire la barra comincia a parlare. Le parole ci cadevano dentro.
     *
     * ## ⛔ Perché si riapre invece di allungare il silenzio
     *
     * Allungare `EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS` cambierebbe
     * anche la fine del turno — cioè quanto TALOS aspetta prima di mandare — che
     * è un numero tarato altrove, contro un'altra misura (2.500 ms totali). Un
     * parametro che serve a due cose è un parametro che un giorno si taglia
     * sbagliando quale delle due.
     *
     * ⇒ Il turno finito senza una parola non è un esito: è la stessa attesa che
     * continua. Si riapre **la stessa identica sessione**, e chi sta parlando
     * non se ne accorge.
     *
     * ⛔ E si riapre SOLO se non è stato detto niente. Un NO_MATCH dopo che è
     * arrivato del testo è un esito vero e sale al lato web, che sa cosa farne.
     */
    private fun ilSilenzioNonEUnEsito(errore: Int): Boolean {
        if (qualcosaDetto) return false
        if (errore != SpeechRecognizer.ERROR_NO_MATCH
            && errore != SpeechRecognizer.ERROR_SPEECH_TIMEOUT
        ) return false
        val riconoscitore = motore ?: return false
        val intento = intentoDiQuestaSessione ?: return false
        /*
         * ⛔ E non all'infinito: dopo `SOLITUDINE_MS` il silenzio è una risposta.
         * È lo stesso tetto che questo file usa già per «nessuno si è agganciato»
         * — un microfono aperto senza nessuno che ascolti è la cosa che non deve
         * succedere mai, e riaprirlo di continuo sarebbe proprio quello.
         */
        if (SystemClock.elapsedRealtime() - apertura >= SOLITUDINE_MS) return false
        /*
         * ⛔ Un respiro prima di ripartire: chiudere e riaprire nello stesso
         * millisecondo è la cosa che questo riconoscitore non perdona — sta
         * scritto in `consegnaIlMotore`, e ci è costata `errore=CLIENT (5)`.
         * Qui non c'è nemmeno un `cancel()` di mezzo, ma il respiro resta.
         */
        mano.postDelayed({
            if (!acceso) return@postDelayed
            runCatching { riconoscitore.startListening(intento) }
                .onFailure { Log.w(ORECCHIO, "anticipato: non si è riaperto — ${it.message}") }
        }, RESPIRO_RIAPERTURA_MS)
        Log.i(
            ORECCHIO,
            "anticipato: silenzio a +${SystemClock.elapsedRealtime() - apertura} ms,"
                + " nessuno ha ancora parlato: riapro senza dirlo a nessuno",
        )
        return true
    }

    private val solitudine = Runnable {
        if (consegna == null && acceso) {
            Log.i(ORECCHIO, "anticipato: nessuno si è agganciato, chiudo")
            spegni()
        }
    }

    /**
     * Accende il microfono adesso, senza aspettare nessuno.
     *
     * ⛔ Va chiamato dal thread principale: `SpeechRecognizer` non è utilizzabile
     * da altri thread e il modo in cui fallisce è il peggiore — a volte non
     * lancia, semplicemente non arriva più nessuna richiamata.
     */
    @JvmStatic
    fun accendi(context: Context) {
        if (acceso) return
        if (Looper.myLooper() != Looper.getMainLooper()) {
            mano.post { accendi(context) }
            return
        }
        if (context.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
            != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            // Nessun permesso: si tace e si lascia decidere al lato web, che ha
            // una scheda da mostrare. Qui non c'è nessuno a cui chiedere.
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) return

        // ⛔ Anche qui: questo orecchio si apre PRIMA di tutto, quindi è il
        // primo che deve chiedere la precedenza sul microfono.
        ai.talos.parola.TalosParola.cedi()
        coda.clear()
        apertura = SystemClock.elapsedRealtime()
        val riconoscitore = motore ?: SpeechRecognizer.createSpeechRecognizer(context).also { motore = it }
        runCatching { riconoscitore.cancel() }
        riconoscitore.setRecognitionListener(ascoltatore(android.os.Build.VERSION.SDK_INT >= 33, ++epoca))
        acceso = true
        /*
         * ⛔⛔ SI RIPARTE DA COM'È ANDATA L'ULTIMA VOLTA, non da valori scelti qui.
         *
         * Il lato web non è ancora nato e non può dirci niente; ma ha parlato
         * l'ultima volta, e il plugin ha scritto la firma di quella richiesta.
         * Ricordarla è l'unico modo perché questa sessione sia ADOTTABILE invece
         * che buttata — e buttarla costava mezzo secondo di sordità esattamente
         * dove la persona comincia a parlare (owner, 12 agosto: «vorrei che
         * l'assistente ascoltasse da prima»).
         */
        val ricordata = context
            .getSharedPreferences(MEMORIA_ORECCHIO, android.content.Context.MODE_PRIVATE)
            .getString("firma", null)
        val pezzi = ricordata?.split("|")?.takeIf { it.size == 7 }
        val lingua = pezzi?.get(0)?.takeIf { it != "-" }
        val automatica = pezzi?.get(1)?.toBoolean() ?: true
        val consentite = pezzi?.get(2)?.split(",")?.filter { it.isNotBlank() } ?: emptyList()
        val parziali = pezzi?.get(3)?.toBoolean() ?: true
        val offline = pezzi?.get(4)?.toBoolean() ?: false
        val silenzio = pezzi?.get(5)?.toIntOrNull() ?: TALOS_PAUSA_FINE_FRASE_MS
        val minimo = pezzi?.get(6)?.toIntOrNull() ?: TALOS_ATTESA_INIZIO_MS
        // ⛔ La firma si RICALCOLA da ciò che si sta per usare davvero, non si
        // copia da quella letta: se il ricordo fosse malformato useremmo i
        // default e dichiareremmo un'altra cosa — cioè adotteremmo una sessione
        // che ascolta in un modo che nessuno ha chiesto.
        firma = talosFirmaRichiesta(lingua, automatica, consentite, parziali, offline, silenzio, minimo)
        // ⛔ Si TIENE l'intento, non si ricalcola: la riapertura silenziosa deve
        // ripartire con la sessione identica, se no la firma cambia e il lato
        // web non può più adottarla. Vedi `ilSilenzioNonEUnEsito`.
        val intento = talosIntentoDiAscolto(
            context = context,
            lingua = lingua,
            automatica = automatica,
            consentite = consentite,
            parziali = parziali,
            offline = offline,
            silenzio = silenzio,
            minimo = minimo,
        )
        intentoDiQuestaSessione = intento
        qualcosaDetto = false
        try {
            riconoscitore.startListening(intento)
            Log.i(ORECCHIO, "anticipato: microfono aperto PRIMA della WebView")
        } catch (errore: Exception) {
            acceso = false
            Log.w(ORECCHIO, "anticipato: non è partito — ${errore.message}")
            return
        }
        mano.removeCallbacks(solitudine)
        mano.postDelayed(solitudine, SOLITUDINE_MS)
    }

    /**
     * Il lato web è pronto: si prende tutto quello che è successo finora e da
     * qui in poi riceve in diretta.
     *
     * Torna `false` se non c'era nessuna sessione da adottare — allora chi
     * chiama fa partire la sua, come ha sempre fatto.
     */
    fun collega(destinatario: (Evento) -> Unit): Boolean {
        if (!acceso) return false
        mano.removeCallbacks(solitudine)
        consegna = destinatario
        Log.i(ORECCHIO, "anticipato: agganciato a +${SystemClock.elapsedRealtime() - apertura} ms, ${coda.size} eventi in coda")
        while (coda.isNotEmpty()) destinatario(coda.removeFirst())
        // ⛔ E il volume di ADESSO, una volta: senza, l'onda parte da zero e si
        // accende due secondi dopo — misurato.
        ultimoVolume?.let { destinatario(Evento("livello", numero = it)) }
        return true
    }

    /** Il lato web se ne va (chiusura della barra) ma la sessione può restare. */
    fun stacca() {
        consegna = null
    }

    /**
     * ⭐⭐ CONSEGNA IL MOTORE, non la sessione — e questa è la differenza fra
     * «funziona bene» e «non sente».
     *
     * ## Il difetto, riferito dall'owner l'11 agosto
     *
     * «Se nell'assistente premo il pulsante microfono funziona molto bene, ma se
     * uso il gesto non funziona bene la ricezione delle parole.»
     *
     * Aveva ragione, ed erano due strade diverse:
     *   - il PULSANTE apre una sessione **nuova**, nel momento in cui la persona
     *     decide di parlare;
     *   - il GESTO faceva **adottare** al lato web la sessione aperta in
     *     `onCreate`, mezzo secondo prima che la barra fosse visibile.
     *
     * Quella sessione ha già consumato mezzo secondo di silenzio prima che la
     * persona veda qualcosa, e nasce mentre il servizio di riconoscimento è
     * ancora freddo: è la stessa sessione che MISURATA muore dopo ~1,6 s invece
     * dei ~5 delle successive.
     *
     * ## Cosa si tiene e cosa si butta
     *
     * Si butta la SESSIONE, si tiene il MOTORE. Creare un `SpeechRecognizer`
     * significa legarsi al servizio di Google, ed è la parte lenta: farlo in
     * `onCreate` resta un guadagno vero. Quello che non va tenuto è il turno
     * cominciato troppo presto.
     *
     * ⇒ Da qui esce un riconoscitore **già legato e senza sessione**, che il
     * plugin usa esattamente come quello del pulsante. Una strada sola, quella
     * che l'owner ha visto funzionare.
     */
    fun consegnaIlMotore(): SpeechRecognizer? {
        val riconoscitore = motore ?: return null
        // ⛔ PRIMA di annullare: da questo istante le richiamate in volo — e ne
        // arriva sempre almeno una, misurata — non appartengono più a nessuno.
        epoca += 1
        mano.removeCallbacks(solitudine)
        turnoFinito()
        consegna = null
        coda.clear()
        /*
         * ⛔⛔ NON si annulla qui, e questa riga tolta è la cura.
         *
         * MISURATO l'11 agosto: annullando qui e lasciando che il plugin
         * annullasse a sua volta un millisecondo dopo — come fa sempre, prima di
         * ogni `startListening` — arrivava `errore=CLIENT (5)`, cioè il servizio
         * di Google che rifiuta la partenza. Due `cancel()` a distanza di un
         * millisecondo mettono il riconoscitore in uno stato da cui non riparte.
         *
         * ⇒ Qui si chiude la sessione UNA volta, e chi riceve aspetta un
         * respiro prima di aprirne una nuova (vedi `RESPIRO_CONSEGNA_MS` nel
         * plugin). Chiudere e riaprire nello stesso millisecondo è la cosa che
         * il riconoscitore non perdona.
         */
        runCatching { riconoscitore.cancel() }
        motore = null
        intentoDiQuestaSessione = null
        Log.i(ORECCHIO, "anticipato: consegno il motore caldo, la sessione si rifà")
        return riconoscitore
    }

    fun spegni() {
        ai.talos.parola.TalosParola.riprendi()
        mano.removeCallbacks(solitudine)
        turnoFinito()
        consegna = null
        coda.clear()
        // ⛔ Anche l'intento: senza, una riapertura già in coda troverebbe di che
        // ripartire. La guardia su `acceso` basta, ma due guardie su un microfono
        // che si riaccende da solo non sono troppe.
        intentoDiQuestaSessione = null
        runCatching { motore?.cancel() }
    }

    private fun manda(evento: Evento) {
        val destinatario = consegna
        if (destinatario != null) destinatario(evento) else coda.addLast(evento)
    }

    private fun ascoltatore(aSegmenti: Boolean, mia: Int): RecognitionListener = object : RecognitionListener {
        /** Falso appena il motore passa di mano: da lì in poi non siamo più noi. */
        private fun viva() = mia == epoca

        /**
         * ⛔⛔ ANCHE QUI GLI SCARTI LASCIANO UNA RIGA — vedi `eco` nel plugin.
         *
         * Questo ascoltatore, fino al 12 agosto, registrava in `logcat` solo
         * «pronto» e «PARLA»: errori, risultati e segmenti uscivano MUTI. E
         * l'errore che ha morso quel giorno — `CLIENT (5)` della sessione
         * annullata dalla consegna — nasce proprio qui. Metà del difetto era
         * invisibile perché metà del motore non parlava.
         */
        private fun eco(cosa: String, extra: String = "") = Log.i(
            ORECCHIO,
            "anticipato «$cosa» epoca=$mia/$epoca ${if (viva()) "PRESA" else "SCARTATA"}" +
                " +${SystemClock.elapsedRealtime() - apertura}ms $extra",
        )
        /** Quando abbiamo mandato l'ultimo livello: vedi `onRmsChanged`. */
        private var ultimoLivello = 0L

        private fun primaParola(bundle: Bundle?): String = bundle
            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            ?.firstOrNull()
            .orEmpty()

        override fun onReadyForSpeech(params: Bundle?) {
            if (!viva()) return
            Log.i(ORECCHIO, "anticipato: pronto a +${SystemClock.elapsedRealtime() - apertura} ms")
            manda(Evento("stato", codice = "ready"))
        }

        override fun onBeginningOfSpeech() {
            if (!viva()) return
            Log.i(ORECCHIO, "anticipato: PARLA a +${SystemClock.elapsedRealtime() - apertura} ms")
            manda(Evento("stato", codice = "listening"))
        }

        /**
         * ⛔⛔ IL VOLUME PASSA ANCHE DI QUI — e senza questa riga la waveform
         * dell'assistente era PIATTA.
         *
         * Owner 2026-08-12, dopo aver provato la build: «nella chat la waveform
         * funziona bene, ma nell'assistente è piatta, non rileva il volume».
         *
         * La causa è la differenza fra le due strade, e adesso che le conosco è
         * ovvia: nella chat il microfono lo apre il plugin, quindi è attaccato il
         * SUO ascoltatore, che manda il livello. Nell'assistente la sessione
         * viene **adottata** da qui (vedi `collega`), quindi è attaccato questo —
         * e questo faceva `= Unit`, cioè buttava via l'unico dato che serviva.
         *
         * ⛔ Una copia dell'ascoltatore che implementa metà contratto è una
         * bomba a orologeria: era già successo con `onResults` a segmenti, la
         * stessa mattina, e per la stessa ragione — due ascoltatori, uno letto
         * per intero e l'altro no.
         *
         * ## Perché NON si mette in coda
         *
         * Gli altri eventi si accodano se nessuno è ancora agganciato: sono
         * fatti che non si possono perdere (una parola sentita prima che la
         * barra esistesse). Il volume è il contrario — vale solo ADESSO, e una
         * coda di livelli vecchi disegnerebbe, all'aggancio, un'onda di mezzo
         * secondo fa. Se non c'è nessuno che ascolta, si butta.
         */
        override fun onRmsChanged(rms: Float) {
            if (!viva()) return
            // ⛔ Si ricorda SEMPRE, anche quando non c'e' nessuno agganciato: e'
            // il valore che fa nascere viva l'onda della barra.
            ultimoVolume = rms
            val destinatario = consegna ?: return
            val ora = SystemClock.elapsedRealtime()
            if (ora - ultimoLivello < 80L) return
            ultimoLivello = ora
            destinatario(Evento("livello", numero = rms))
        }

        override fun onBufferReceived(buffer: ByteArray?) = Unit

        override fun onEndOfSpeech() {
            if (!viva()) return
            manda(Evento("stato", codice = "stopping"))
        }

        override fun onError(error: Int) {
            eco("errore", "${talosNomeErrore(error)} ($error)")
            if (!viva()) return
            // ⛔ PRIMA di `turnoFinito()`, che spegne `acceso`: un turno chiuso
            // dal silenzio, senza che nessuno abbia parlato, non è finito — è la
            // stessa attesa che continua. Vedi `ilSilenzioNonEUnEsito`.
            if (ilSilenzioNonEUnEsito(error)) return
            turnoFinito()
            manda(Evento("errore", codice = talosNomeErrore(error)))
        }

        /**
         * ⛔ In una sessione a SEGMENTI questo non è la fine — è un pezzo.
         *
         * Il contratto AOSP di `RecognitionListener` lo dice esplicitamente:
         * `onResults` porta «the results for the **full speech**», ed è la
         * strada dell'altra modalità; con `EXTRA_SEGMENTED_SESSION` i pezzi
         * arrivano da `onSegmentResults` e la fine è `onEndOfSegmentedSession`.
         * Chiudere qui era il difetto di «buonasera fratello» che partiva come
         * «buonasera», e lo stesso errore stava nel plugin: due copie
         * dell'ascoltatore, lo stesso contratto letto a metà tutte e due le
         * volte.
         */
        override fun onResults(results: Bundle?) {
            if (!viva()) return
            val testo = primaParola(results)
            if (testo.isNotEmpty()) qualcosaDetto = true
            if (aSegmenti) {
                if (testo.isNotEmpty()) manda(Evento("segmento", testo = testo))
                return
            }
            turnoFinito()
            manda(Evento("risultato", testo = testo))
            manda(Evento("stato", codice = "stopped"))
        }

        override fun onPartialResults(partialResults: Bundle?) {
            if (!viva()) return
            val testo = primaParola(partialResults)
            if (testo.isEmpty()) return
            // ⛔ È il TESTO che segna «qualcuno ha parlato», non `onBeginningOfSpeech`:
            // MISURATO sul Pad, il motore ha annunciato PARLA a +1825 ms e 51 ms
            // dopo ha risposto NO_MATCH senza una sola parola. Un rumore basta a
            // far scattare quell'annuncio; solo il testo prova che c'è una voce.
            qualcosaDetto = true
            manda(Evento("parziale", testo = testo))
        }

        override fun onSegmentResults(segment: Bundle) {
            if (!viva()) return
            val testo = primaParola(segment)
            if (testo.isEmpty()) return
            qualcosaDetto = true
            manda(Evento("segmento", testo = testo))
        }

        override fun onEndOfSegmentedSession() {
            if (!viva()) return
            turnoFinito()
            manda(Evento("stato", codice = "stopped"))
        }

        override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }
}
