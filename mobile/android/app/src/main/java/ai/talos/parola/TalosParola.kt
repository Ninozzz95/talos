package ai.talos.parola

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import kotlin.concurrent.thread

/**
 * ⭐⭐ «HEY TALOS» — la porta che su ColorOS non esisteva.
 *
 * ## Perché questa funzione esiste
 *
 * Owner 2026-08-11: «su ColorOS cinese non c'è un modo per mappare i gesti per
 * l'assistente, quindi ho bisogno di questa cosa». Su quella ROM la barra di
 * TALOS **non ha nessuna porta** assegnabile a un gesto: o si chiama con la
 * voce, o non si chiama.
 *
 * ⛔ Android una porta sua ce l'avrebbe — `createAlwaysOnHotwordDetector`, che
 * fa lavorare il DSP e non costa quasi batteria — ma vuole un modello di
 * parola **già registrato nel sistema**, e gli unici registrati sono quelli di
 * Google. Per una parola nostra non è raggiungibile. Da qui il riconoscitore in
 * casa: 23,6 MB di libreria e 5,5 di modello, che l'owner ha approvato sapendo
 * il numero.
 *
 * ## Come è fatto
 *
 * Un `AudioRecord` a 16 kHz mono, letto a blocchi da 100 ms, versato in uno
 * `OnlineStream` di sherpa-onnx. Il riconoscitore non trascrive: cerca **solo**
 * le parole dichiarate, in token BPE. Non c'è nessun testo che esce da qui, e
 * nessun audio che viene salvato.
 *
 * ⛔ `VOICE_RECOGNITION` come sorgente, e non `MIC`: è quella che i quattro
 * assistenti liberi censiti (Dicio, Sayboard, Kõnele, FUTO) usano **tutti**,
 * perché applica la cancellazione d'eco e il controllo di guadagno pensati per
 * il parlato invece che per la registrazione ambientale.
 *
 * ## ⛔ Il microfono è UNO SOLO, e questa è la regola che tiene in piedi tutto
 *
 * Se questo servizio tiene il microfono mentre la barra apre il suo
 * riconoscitore, Android **silenzia uno dei due senza dirlo** (lo dice la
 * documentazione della cattura concorrente: «silencing its captured audio
 * rather than preventing an application from starting»). Il risultato sarebbe
 * il difetto peggiore che abbiamo già pagato: un microfono che sembra acceso e
 * non sente.
 *
 * ⇒ Qui c'è `cedi()` / `riprendi()`: chi apre l'ascolto vero chiede la
 * precedenza, e questo servizio molla la presa restando vivo. Non è una
 * cortesia: è l'unico modo per non avere due padroni sullo stesso microfono.
 */
class TalosParola : Service() {

    private var vivo = false

    @Volatile
    private var ceduto = false

    /**
     * ⛔⛔ LA PRESA, tenuta come campo per poterla MOLLARE SUBITO.
     *
     * Owner 2026-08-11: «se hey TALOS è abilitato e provo a parlare non sente le
     * parole; se dico "prova" e dopo 500 ms dico altre parole, sente solo la
     * prima». È la cattura concorrente: Android, quando due catture insistono
     * sullo stesso microfono, **silenzia una delle due senza dirlo** — lo dice
     * la sua documentazione, «silencing its captured audio rather than
     * preventing an application from starting».
     *
     * La cessione c'era già, ma era una BANDIERINA: il ciclo se ne accorgeva al
     * giro successivo, cioè fino a ~250 ms dopo (una lettura da 100 ms più una
     * pausa da 150). In quella finestra registravano in due, e chi perdeva
     * restava muto per tutto il turno.
     *
     * ⇒ Tenere la presa qui permette a `cedi()` di chiamare `stop()` **subito**,
     * dal thread di chi sta per ascoltare. `AudioRecord.stop()` si può chiamare
     * da un altro thread, e il ciclo se ne accorge perché `read()` smette di
     * consegnare. Non è più una richiesta: è un rilascio.
     */
    @Volatile
    private var presa: AudioRecord? = null

    private var motore: KeywordSpotter? = null

    private val mano = android.os.Handler(android.os.Looper.getMainLooper())

    /** La rete di sicurezza della cessione: vedi `sentita`. */
    private val riprendiDaSolo = Runnable {
        if (ceduto) {
            Log.i(MARCHIO, "nessuno ha preso il microfono: me lo riprendo")
            ceduto = false
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        istanza = this
    }

    /**
     * ⛔⛔ `START_NOT_STICKY`, e non è una svista: **un microfono non resuscita
     * da solo**.
     *
     * Con `START_STICKY` Android riaccende il servizio dopo che il processo è
     * morto — e lo farebbe senza che nessuno l'abbia chiesto, magari ore dopo,
     * su un telefono in tasca. Per qualunque altro servizio sarebbe una
     * gentilezza; per questo è la differenza fra «ascolta perché gliel'hai
     * detto» e «ascolta perché si è riavviato».
     *
     * MISURATO l'11 agosto: il processo dell'app è morto durante una prova e il
     * servizio NON è tornato (zero `ServiceRecord`, `appops duration=0`). Il
     * comportamento giusto era già quello, ma per caso — adesso è dichiarato.
     *
     * ⇒ Se il sistema ci uccide, la parola resta spenta finché la persona non
     * la riaccende. Perdere una funzione è meglio che tenere un microfono
     * acceso che nessuno ricorda di aver acceso.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (vivo) return START_NOT_STICKY
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(MARCHIO, "niente permesso microfono: non parto")
            stopSelf()
            return START_NOT_STICKY
        }
        avviaInPrimoPiano()
        vivo = true
        thread(name = "talos-parola") { ciclo() }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        vivo = false
        istanza = null
        motore?.release()
        motore = null
        super.onDestroy()
    }

    /**
     * ⛔ La notifica NON è burocrazia: è l'unico posto in cui una persona vede
     * che TALOS sta ascoltando, e da cui può spegnerlo. Un microfono sempre
     * aperto senza una riga che lo dica è esattamente ciò che non si fa.
     */
    private fun avviaInPrimoPiano() {
        val gestore = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            gestore.createNotificationChannel(
                NotificationChannel(CANALE, "TALOS in ascolto", NotificationManager.IMPORTANCE_LOW)
                    .apply { description = "Mostra quando TALOS aspetta la parola di attivazione" },
            )
        }
        val avviso = Notification.Builder(this, CANALE)
            .setContentTitle("TALOS aspetta «hey TALOS»")
            .setContentText("Il microfono resta acceso finché non lo spegni.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                AVVISO,
                avviso,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            )
        } else {
            startForeground(AVVISO, avviso)
        }
    }

    private fun ciclo() {
        val riconoscitore = runCatching { costruisci() }.getOrElse {
            Log.e(MARCHIO, "il motore non si è aperto: ${it.message}")
            stopSelf()
            return
        }
        motore = riconoscitore

        val minimo = AudioRecord.getMinBufferSize(
            FREQUENZA,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val presa = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            FREQUENZA,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            maxOf(minimo, FREQUENZA * 2),
        )
        this.presa = presa
        if (presa.state != AudioRecord.STATE_INITIALIZED) {
            Log.e(MARCHIO, "il microfono non si è inizializzato")
            presa.release()
            stopSelf()
            return
        }

        // ⛔ Vuoto di proposito: le parole sono già quelle di
        // `assets/kws/keywords.txt`, e ripeterle qui vorrebbe dire due sorgenti
        // per lo stesso dato — l'errore che oggi è già costato due volte.
        val flusso = riconoscitore.createStream("")
        val blocco = ShortArray(FREQUENZA / 10)
        val campioni = FloatArray(blocco.size)
        presa.startRecording()
        Log.i(MARCHIO, "in ascolto della parola")

        var eraCeduto = false
        while (vivo) {
            if (ceduto) {
                /*
                 * ⛔ Ceduto il microfono si FERMA la registrazione, non si legge
                 * a vuoto: tenere aperto un `AudioRecord` che nessuno consuma
                 * lascia comunque l'app fra chi cattura, ed è proprio quello che
                 * fa scattare il silenziamento dell'altro.
                 */
                if (!eraCeduto) {
                    // ⛔ `stop()` l'ha già chiamato `cedi()` dal thread di chi
                    // ascolta: qui si ripulisce soltanto. Rifarlo non fa danno e
                    // copre il caso in cui la bandierina arrivi da sola.
                    runCatching { presa.stop() }
                    riconoscitore.reset(flusso)
                    eraCeduto = true
                    Log.i(MARCHIO, "microfono ceduto a chi ascolta davvero")
                }
                Thread.sleep(150)
                continue
            }
            if (eraCeduto) {
                runCatching { presa.startRecording() }
                eraCeduto = false
                Log.i(MARCHIO, "microfono ripreso")
            }
            val letti = presa.read(blocco, 0, blocco.size)
            if (letti <= 0) {
                /*
                 * ⛔⛔ SI DORME, e non si gira a vuoto.
                 *
                 * Trovato dallo scouting agentico il 12 agosto e confermato: se
                 * il microfono smette di consegnare — chiamata in arrivo, presa
                 * persa, `stop()` da un altro thread — `read()` torna 0 o un
                 * codice d'errore e questo ciclo ripartiva SUBITO. Un `while`
                 * senza pausa su un thread dedicato è un core al 100% finché
                 * qualcuno non spegne il servizio: batteria bruciata mentre la
                 * notifica dice tranquillamente «sto aspettando».
                 *
                 * ⛔ E un errore VERO va detto: `ERROR_INVALID_OPERATION` o
                 * `ERROR_DEAD_OBJECT` non sono «zero campioni», sono il
                 * microfono che non c'è più. Continuare a girare lì sopra è
                 * fingere di ascoltare.
                 */
                if (letti < 0) {
                    Log.w(MARCHIO, "il microfono non consegna più (codice $letti): mi fermo")
                    break
                }
                Thread.sleep(20)
                continue
            }
            for (i in 0 until letti) campioni[i] = blocco[i] / 32768.0f
            flusso.acceptWaveform(campioni.copyOf(letti), FREQUENZA)
            while (riconoscitore.isReady(flusso)) riconoscitore.decode(flusso)
            val esito = riconoscitore.getResult(flusso)
            if (esito.keyword.isNotEmpty()) {
                riconoscitore.reset(flusso)
                sentita(esito.keyword)
            }
        }

        runCatching { presa.stop() }
        this.presa = null
        presa.release()
        flusso.release()
    }

    /**
     * ⭐⭐ SENTITA — e si apre la porta dell'ASSISTENTE, non l'activity.
     *
     * `apriComeAssistente` chiede al sistema di mostrare la sessione: è la
     * stessa strada del gesto, e per questo la barra nasce **con lo schermo già
     * dentro**. Aprire l'activity direttamente darebbe una barra cieca — è il
     * difetto che il pallino aveva fino a stasera.
     *
     * ⛔ E si cede subito il microfono: fra un attimo lo vorrà il riconoscitore
     * vero, e due padroni sullo stesso microfono fanno un'app che finge di
     * ascoltare.
     */
    private fun sentita(parola: String) {
        val adesso = SystemClock.elapsedRealtime()
        if (adesso - ultima < RIPOSO_MS) return
        ultima = adesso
        Log.i(MARCHIO, "SENTITA «$parola»")
        ceduto = true
        /*
         * ⛔⛔ LA CESSIONE HA UNA SCADENZA, se no la parola resta sorda per sempre.
         *
         * Trovato dallo scouting agentico il 12 agosto, ed è il difetto che
         * l'owner aveva già sentito: «hey TALOS funziona una volta sola».
         * `ceduto` passa a vero qui, e tornava falso SOLO se qualcuno chiudeva
         * la dettatura o distruggeva la barra. Basta che la barra venga chiusa
         * in un modo che non passa da lì — o che la sessione dell'assistente non
         * apra nessuna dettatura — e il servizio resta vivo, la notifica
         * continua a dire che sta aspettando, e non sente più niente.
         *
         * ⇒ Chi cede aspetta un tempo e poi si RIPRENDE da solo. Se davvero
         * qualcuno sta ascoltando, la sua `cedi()` arriva prima e rimanda
         * indietro la scadenza; se non arriva nessuno, non c'era nessun ascolto
         * da proteggere.
         *
         * ⛔ Una funzione che si spegne per sempre senza dirlo è peggio di una
         * che non c'è: chi si fida smette di controllare.
         */
        mano.removeCallbacks(riprendiDaSolo)
        mano.postDelayed(riprendiDaSolo, CESSIONE_MASSIMA_MS)
        val aperta = ai.talos.agent.TalosAssistente.apriComeAssistente()
        if (!aperta) {
            Log.w(MARCHIO, "il sistema non ci ha dato la sessione: apro la barra da solo")
            runCatching {
                startActivity(
                    Intent(
                        Intent.ACTION_VIEW,
                        android.net.Uri.parse("talos://barra?voce=1&nodi=0&immagine=0"),
                        this,
                        ai.talos.TalosBarraActivity::class.java,
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }
        }
    }

    private fun costruisci(): KeywordSpotter {
        val config = KeywordSpotterConfig(
            featConfig = FeatureConfig(sampleRate = FREQUENZA, featureDim = 80),
            modelConfig = OnlineModelConfig(
                transducer = OnlineTransducerModelConfig(
                    encoder = "kws/encoder.int8.onnx",
                    decoder = "kws/decoder.int8.onnx",
                    joiner = "kws/joiner.int8.onnx",
                ),
                tokens = "kws/tokens.txt",
                modelType = "zipformer2",
                // ⛔ Due thread e non uno: il modello gira per ore, e su un
                // telefono il costo di un thread in più si sente meno del
                // ritardo di riconoscimento con uno solo.
                numThreads = 2,
            ),
            /*
             * ⛔ IL FILE SERVE DAVVERO, e lasciarlo vuoto costa un crash muto.
             *
             * MISURATO sul Pad l'11 agosto: con `keywordsFile = ""` la libreria
             * si carica, la configurazione arriva, e poi il processo muore con
             * `F/sherpa-onnx: Read binary file: Load '' failed` — un errore
             * FATALE su un percorso vuoto, che dall'app si vede solo come un
             * servizio che riparte all'infinito.
             *
             * Passare le parole a `createStream()` NON sostituisce il file: le
             * AGGIUNGE. La base va letta da qui.
             */
            keywordsFile = "kws/keywords.txt",
        )
        return KeywordSpotter(assetManager = assets, config = config)
    }

    companion object {
        private const val MARCHIO = "TalosParola"
        private const val CANALE = "talos-parola"
        private const val AVVISO = 4711
        private const val FREQUENZA = 16_000

        /**
         * Quanto al massimo la parola resta in disparte dopo aver aperto la
         * barra. Oltre, si riprende il microfono da sola: vedi `sentita`.
         */
        private const val CESSIONE_MASSIMA_MS = 45_000L

        /** Due attivazioni a meno di questo non sono due chiamate: è un'eco. */
        private const val RIPOSO_MS = 2_500L

        private var ultima = 0L

        @Volatile
        private var istanza: TalosParola? = null

        /**
         * ⛔⛔ LE PAROLE IN TOKEN BPE, e non si indovinano.
         *
         * Il modello non riconosce lettere: riconosce **token**. La
         * scomposizione dipende dal `bpe.model` di QUESTO modello e cambia da
         * modello a modello. MISURATO l'11 agosto con `sentencepiece` sul
         * `bpe.model` vero del pacchetto:
         *
         *     HEY TALOS  ->  ▁HE Y ▁TA LO S
         *     TALOS      ->  ▁TA LO S
         *
         * ⛔ Una nota precedente diceva `▁T AL OS` ed era **sbagliata**: se la
         * si fosse copiata, il riconoscitore avrebbe cercato una parola che non
         * esiste e non si sarebbe attivato mai, senza dare nessun errore.
         *
         * ⭐ `HEY TALOS` ha la stessa forma di `HEY SIRI` (`▁HE Y ▁S I RI`), che
         * è l'esempio di riferimento di questo modello: cinque token, nessuno
         * fuori vocabolario.
         *
         * ## I due numeri in coda
         *
         * `:1.5` è il punteggio che aiuta la parola a sopravvivere alla ricerca,
         * `#0.25` la soglia acustica minima. Sono i valori di riferimento della
         * documentazione; ⛔ **vanno tarati con la voce dell'owner**, perché una
         * parola corta come `TALOS` da sola si attiva più facilmente per sbaglio
         * — per questo ha una soglia più alta della frase intera.
         */
        private val PAROLE = listOf(
            "▁HE Y ▁TA LO S :1.5 #0.25",
            "▁TA LO S :1.0 #0.35",
        ).joinToString("\n")

        /** Dove si ricorda che la persona la vuole accesa. */
        private const val MEMORIA = "talos_parola"
        private const val VOLUTA = "voluta"

        @JvmStatic
        fun accendi(contesto: Context) {
            ricorda(contesto, true)
            contesto.startForegroundService(Intent(contesto, TalosParola::class.java))
        }

        @JvmStatic
        fun spegni(contesto: Context) {
            ricorda(contesto, false)
            contesto.stopService(Intent(contesto, TalosParola::class.java))
        }

        private fun ricorda(contesto: Context, voluta: Boolean) {
            contesto.getSharedPreferences(MEMORIA, Context.MODE_PRIVATE)
                .edit().putBoolean(VOLUTA, voluta).apply()
        }

        /**
         * ⭐⭐ LA PAROLA TORNA VIVA QUANDO L'APP TORNA DAVANTI — e senza questo
         * muore la prima notte e non lo dice a nessuno.
         *
         * ## ⛔ Il difetto, misurato
         *
         * Owner 2026-08-12: «hey TALOS non dà segni di vita». MISURATO sul Pad
         * con `dumpsys activity services ai.talos.dev`: fra i servizi vivi
         * c'erano `TalosAssistente`, la sua sessione e la WebView — e
         * `TalosParola` **non c'era**. Non era sordo: non esisteva.
         *
         * La ragione è a monte ed è strutturale. Questo servizio è
         * `START_NOT_STICKY` di proposito — un microfono non deve resuscitare da
         * solo — ma **nessuno lo riaccendeva mai**. Basta un riavvio del
         * telefono, un `force-stop`, o il sistema che recupera memoria, e la
         * funzione è finita per sempre con l'interruttore che dice ancora «sì».
         *
         * ## ⛔ E il ricevitore d'avvio NON è la cura: sarebbe un guasto
         *
         * La documentazione Android lo dice esplicito: «Apps that target Android
         * 14 or higher are **not allowed** to launch a microphone foreground
         * service from a `BOOT_COMPLETED` broadcast receiver», e chi ci prova
         * riceve `ForegroundServiceStartNotAllowedException`. `RECORD_AUDIO` è un
         * permesso *while-in-use*: dal fondo non si esercita, e questa è una
         * regola giusta — un'app che si riprende il microfono da sola mentre
         * nessuno guarda è esattamente ciò che quella regola impedisce.
         *
         * ⇒ Si ricorda l'INTENZIONE e la si onora al primo momento legittimo:
         * quando l'app torna davanti alla persona. Non è un ripiego — è l'unico
         * istante in cui il sistema, e chi possiede il telefono, sono d'accordo.
         */
        @JvmStatic
        fun riprendiSeVoluta(contesto: Context) {
            if (accesa()) return
            val voluta = contesto.getSharedPreferences(MEMORIA, Context.MODE_PRIVATE)
                .getBoolean(VOLUTA, false)
            if (!voluta) return
            if (contesto.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED
            ) {
                Log.w(MARCHIO, "la parola era voluta ma il permesso del microfono non c'è più")
                return
            }
            Log.i(MARCHIO, "la parola era voluta e non era viva: la riaccendo")
            runCatching { contesto.startForegroundService(Intent(contesto, TalosParola::class.java)) }
                .onFailure { Log.w(MARCHIO, "non ho potuto riaccenderla: ${it.javaClass.simpleName}") }
        }

        @JvmStatic
        fun accesa(): Boolean = istanza?.vivo == true

        /**
         * ⛔ «Mollami il microfono»: lo chiama chi sta per aprire l'ascolto vero.
         * Il servizio resta vivo — spegnerlo e riaccenderlo costerebbe il
         * caricamento del modello ogni volta.
         */
        /**
         * ⛔⛔ MOLLA IL MICROFONO ADESSO, non al prossimo giro.
         *
         * La chiama chi sta per aprire l'ascolto vero, PRIMA di aprirlo. Il
         * `stop()` è immediato e sincrono: quando questa funzione torna, la
         * nostra cattura è già chiusa, quindi non esiste nessuna finestra in cui
         * due catture insistono sullo stesso microfono — che è la condizione in
         * cui Android ne silenzia una in silenzio.
         *
         * ⛔ Il servizio resta VIVO: spegnerlo e riaccenderlo costerebbe il
         * caricamento del modello a ogni frase.
         */
        @JvmStatic
        fun cedi() {
            val chi = istanza ?: return
            chi.ceduto = true
            runCatching { chi.presa?.stop() }
            // ⛔ Anche la cessione chiesta da fuori scade: chi ascolta può
            // morire senza restituire niente, e allora la parola deve tornare.
            chi.mano.removeCallbacks(chi.riprendiDaSolo)
            chi.mano.postDelayed(chi.riprendiDaSolo, CESSIONE_MASSIMA_MS)
        }

        @JvmStatic
        fun riprendi() {
            val chi = istanza ?: return
            chi.mano.removeCallbacks(chi.riprendiDaSolo)
            chi.ceduto = false
        }
    }
}
