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
 * Un `AudioRecord` a 16 kHz mono, letto a blocchi da **80 ms**, versato in
 * `TalosOrecchio`. Il riconoscitore non trascrive: dà un numero fra 0 e 1 per
 * una parola sola. Non c'è nessun testo che esce da qui, e nessun audio che
 * viene salvato.
 *
 * ⛔ Gli 80 ms non sono una preferenza: sono il passo su cui l'embedding è stato
 * addestrato. Con blocchi di lunghezza diversa i fotogrammi non si allineano e
 * il punteggio non sale mai — senza nessun errore.
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

    /*
     * Stato della sonda del livello — vedi il commento lungo nel ciclo. Vive qui
     * e non nel ciclo perché deve sopravvivere fra un blocco e l'altro.
     */
    private var bloccoNumero = 0L
    private var piccoDellaFinestra = 0
    private val sondaAccesa: Boolean by lazy {
        runCatching {
            val classe = Class.forName("android.os.SystemProperties")
            val leggi = classe.getMethod("get", String::class.java, String::class.java)
            (leggi.invoke(null, "debug.talos.sonda", "0") as? String) == "1"
        }.getOrDefault(false)
    }

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

    private var orecchio: TalosOrecchio? = null

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
        orecchio?.chiudi()
        orecchio = null
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
        val riconoscitore = TalosOrecchio.apri(assets, PAROLA)
        if (riconoscitore == null) {
            Log.e(MARCHIO, "il motore non si è aperto: mi fermo")
            stopSelf()
            return
        }
        orecchio = riconoscitore

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

        /*
         * ⛔⛔ IL BLOCCO È DI 1280 CAMPIONI, e non è arrotondabile.
         *
         * Prima era `FREQUENZA / 10`, cioè 1600 — 100 ms, un numero scelto
         * perché è tondo. Il modello dell'embedding è addestrato su passi da
         * 80 ms: con blocchi diversi i fotogrammi non si allineano e il
         * punteggio non sale mai, senza che niente segnali un errore.
         */
        val blocco = ShortArray(TalosOrecchio.CAMPIONI_PER_BLOCCO)
        var dentro = 0
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
                    riconoscitore.azzera()
                    dentro = 0
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
            /*
             * ⛔ Si legge riempiendo, non «un blocco per giro»: `read` può
             * consegnare MENO di quanto chiesto, e trattare una consegna parziale
             * come un blocco intero sposterebbe tutto l'allineamento in avanti
             * per sempre — di nuovo un guasto silenzioso.
             */
            val letti = presa.read(blocco, dentro, blocco.size - dentro)
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
            dentro += letti
            if (dentro < blocco.size) continue
            dentro = 0

            /*
             * ⛔⛔ IL GUADAGNO — «devo letteralmente urlare», owner 2026-08-15.
             *
             * ## Perché il volume conta, e non dovrebbe
             *
             * I campioni entrano nel modello mel come **int16 non normalizzati**
             * (è giusto: quel modello è stato addestrato così, e dividerli per
             * 32768 dà uno spettro completamente diverso — sta in
             * `PROVENIENZA-PAROLA.md`). ⇒ Una frase detta piano produce uno
             * spettro **più debole** di tutto ciò che il classificatore ha visto.
             *
             * E non l'ha mai visto per un motivo preciso, trovato nel codice
             * della libreria di addestramento: `AugmentationConfig` espone solo
             * `clip_duration`, `batch_size`, `rounds`, `background_paths`,
             * `rir_paths`. **Nessun parametro di volume.** Le clip vengono
             * sporcate con rumore e riverbero, ma mai attenuate: il modello ha
             * sentito solo voce a volume pieno.
             *
             * ## La cura: si porta la voce al livello che il modello conosce
             *
             * Non è una normalizzazione cieca — quella amplificherebbe anche il
             * silenzio, e un silenzio amplificato diventa un falso positivo.
             * Tre guardie:
             *
             *   1. si alza **solo** se il picco è sopra `RUMORE_MINIMO`, cioè
             *      solo quando c'è qualcosa che somiglia a una voce;
             *   2. il fattore ha un **tetto** (`GUADAGNO_MASSIMO`): una voce
             *      lontanissima non viene tirata su a forza fino a diventare
             *      rumore squadrato;
             *   3. **non si abbassa mai** chi è già forte: chi urla resta com'è,
             *      e il comportamento che oggi funziona non cambia.
             *
             * ⇒ È la leva 2 delle quattro in
             * `docs/superpowers/research/2026-08-15-hey-talos-iper-preciso.md`.
             */
            var picco = 0
            for (c in blocco) { val v = if (c < 0) -c.toInt() else c.toInt(); if (v > picco) picco = v }
            var fattoreUsato = 1f
            if (picco in (RUMORE_MINIMO + 1)..<LIVELLO_ATTESO) {
                fattoreUsato = minOf(LIVELLO_ATTESO.toFloat() / picco, GUADAGNO_MASSIMO)
                for (i in blocco.indices) {
                    blocco[i] = (blocco[i] * fattoreUsato).toInt().coerceIn(-32768, 32767).toShort()
                }
            }
            /*
             * ⛔ La sonda del guadagno: senza, «non scatta» non distingue «il
             * guadagno non agisce» da «agisce e non basta» — due difetti in due
             * posti diversi. Si scrive solo quando c'è qualcosa da sentire, se
             * no allaga il registro con il silenzio.
             */
            if (picco > RUMORE_MINIMO) {
                Log.i(MARCHIO, "livello: picco=$picco fattore=${"%.1f".format(fattoreUsato)}")
            }

            /*
             * ⛔⛔ LA SONDA CHE PARLA ANCHE QUANDO NON SCATTA NIENTE.
             *
             * Il difetto che l'ha resa necessaria, misurato il 2026-08-15: le
             * clip suonate dalle casse del PC non facevano scattare la parola, e
             * il registro era **vuoto**. Vuoto non è un dato: non distingue
             *
             *   - «al microfono non arriva niente»  (aria, distanza, volume)
             *   - «arriva ma sotto RUMORE_MINIMO»   (soglia tarata male)
             *   - «arriva forte e il modello non riconosce» (modello)
             *
             * ⇒ Tre guasti in tre posti diversi, indistinguibili dallo stesso
             * silenzio. Il picco massimo su una finestra scritto **sempre** li
             * separa in una misura sola.
             *
             * ⛔ Ogni 25 blocchi, cioè ogni 2 secondi: abbastanza per seguire una
             * prova, troppo poco per allagare il registro.
             *
             * ⛔ E si accende solo con `setprop debug.talos.sonda 1`: è
             * strumentazione da banco, non una spia da tenere accesa addosso a
             * chi usa l'app.
             */
            bloccoNumero++
            if (sondaAccesa && bloccoNumero % BLOCCHI_FRA_SONDE == 0L) {
                Log.i(MARCHIO, "sonda: picco=$piccoDellaFinestra soglia=$RUMORE_MINIMO")
                piccoDellaFinestra = 0
            } else if (picco > piccoDellaFinestra) {
                piccoDellaFinestra = picco
            }

            val punteggio = riconoscitore.ascolta(blocco, blocco.size) ?: continue
            /*
             * ⛔ Si registrano anche i quasi: un punteggio a 0,3 dice che la
             * parola è stata sentita e non creduta, ed è l'unico dato con cui si
             * tara una soglia. Sopra 0,1 succede di rado, quindi non allaga il
             * registro.
             */
            if (punteggio > CURIOSITA) Log.i(MARCHIO, "punteggio ${"%.3f".format(punteggio)}")
            if (punteggio >= SOGLIA) {
                riconoscitore.azzera()
                sentita(punteggio)
            }
        }

        runCatching { presa.stop() }
        this.presa = null
        presa.release()
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
    private fun sentita(punteggio: Float) {
        val adesso = SystemClock.elapsedRealtime()
        if (adesso - ultima < RIPOSO_MS) return
        ultima = adesso
        Log.i(MARCHIO, "SENTITA «$PAROLA» con ${"%.3f".format(punteggio)}")
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
        /*
         * ⛔⛔⛔ SE LA BARRA È GIÀ DAVANTI, NON SI CHIEDE UNA SESSIONE: SI CHIAMA.
         *
         * Owner 2026-08-14: «hey jarvis non funziona quando la barra è già
         * aperta — se TALOS non è in listening, non fa ripartire l'ascolto come
         * se premessi il pulsante del microfono».
         *
         * `showSession` su una sessione **già mostrata** non produce niente:
         * nessun intent nuovo arriva alla barra, il lato web non conta nessuna
         * chiamata nuova, e l'ascolto non riparte. Da fuori: la parola viene
         * sentita — sta scritto in logcat — e non succede niente.
         *
         * ⇒ Con la barra davanti si manda un intent, che `onNewIntent` timbra
         * come apertura nuova. Il lato web ha già la strada giusta per questo
         * caso e la usa da giorni: `modo.chiamata += 1` → `vogliAscoltare`. È
         * letteralmente «come premere il pulsante del microfono».
         *
         * ⛔ E solo quando è DAVANTI: a barra chiusa la strada dell'assistente
         * resta la prima, perché è l'unica che porta il contesto dello schermo
         * (`SHOW_WITH_ASSIST`) — e quello è metà del mestiere dell'assistente.
         */
        val davanti = ai.talos.TalosBarraActivity.eDavanti()
        val aperta = if (davanti) {
            Log.i(MARCHIO, "la barra è già davanti: le mando una chiamata nuova")
            false
        } else {
            ai.talos.agent.TalosAssistente.apriComeAssistente()
        }
        if (!aperta) {
            if (!davanti) Log.w(MARCHIO, "il sistema non ci ha dato la sessione: apro la barra da solo")
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

    companion object {
        private const val MARCHIO = "TalosParola"
        private const val CANALE = "talos-parola"
        private const val AVVISO = 4711
        private const val FREQUENZA = 16_000

        /**
         * ⭐⭐⭐ LA NOSTRA PAROLA — `talos.onnx`, addestrato il 2026-08-15.
         *
         * Ha preso il posto di `hey_jarvis.onnx`, che era un banco di prova:
         * un classificatore pubblicato da altri serviva a sapere se il
         * montaggio su Android fosse giusto **prima** di spendere una notte ad
         * addestrare. Ha scattato sul Pad, quindi la catena era sana.
         *
         * ⛔ Il codice non è cambiato per la sostituzione, ed era il punto: il
         * nome dell'ingresso del modello lo legge `TalosOrecchio` dalla
         * sessione (`x.1` per openWakeWord, `embeddings` per i modelli di
         * `livekit-wakeword`), quindi cambiare parola è cambiare questa riga e
         * il file. La provenienza, i numeri dell'addestramento e le due soglie
         * stanno in `PROVENIENZA-PAROLA.md`.
         */
        private const val PAROLA = "talos.onnx"

        /**
         * ⛔⛔ 0,89 è MISURATO SUL NOSTRO MODELLO, non più un prestito.
         *
         * `train` ha calcolato i due punti di lavoro sul set di validazione:
         *
         * ```
         *   soglia 0,50 →  Recall 88,2%   FPPH 0,53
         *   soglia 0,89 →  Recall 74,8%   FPPH 0,00   ← questa
         * ```
         *
         * Cioè: a 0,50 ti sente 88 volte su 100 ma si apre da sola **ogni due
         * ore circa**; a 0,89 non si apre mai da sola ma ti perde **una volta
         * su quattro**.
         *
         * ⛔⛔ SCESA DA 0,89 A 0,50 il 2026-08-15, e a decidere è stata la
         * misura in stanza, non il laboratorio.
         *
         * Owner, provando l'APK: «adesso risponde **2 volte su 10**». Cioè un
         * recall reale del ~20% dove il set di validazione ne prometteva 74,8.
         * ⇒ Fra il laboratorio e la stanza si perdeva quasi tutto, e la soglia
         * alta era la causa più diretta e più facile da togliere.
         *
         * 0,50 è anche il valore che openWakeWord dichiara come punto di
         * partenza — «users are encouraged to determine the best threshold for
         * their environment… a **lower** threshold may result in significantly
         * better performance».
         *
         * ⛔ Il prezzo dichiarato: FPPH 0,53, cioè circa **una falsa apertura
         * ogni due ore**. Si accetta come passo intermedio perché il difetto
         * opposto — un assistente che non risponde 8 volte su 10 — è peggio, e
         * perché le altre tre leve della ricerca (guadagno adattivo, VAD, clip
         * attenuate in addestramento) servono proprio a riprendersi quei falsi
         * senza rialzare la soglia.
         *
         * Il piano intero, con le fonti:
         * `docs/superpowers/research/2026-08-15-hey-talos-iper-preciso.md`
         *
         * ⛔ Il valore precedente, 0,5, era il riferimento di openWakeWord: un
         * numero giusto per il LORO classificatore, e senza significato per il
         * nostro.
         */
        private const val SOGLIA = 0.5f

        /** Sotto la soglia ma sopra questo, si scrive comunque: vedi `ciclo`. */
        private const val CURIOSITA = 0.1f

        /**
         * ⛔ Il livello a cui il modello è abituato, e i due freni.
         *
         * `LIVELLO_ATTESO` è circa un terzo del fondo scala di un int16: è la
         * zona in cui vivono le clip TTS su cui il classificatore è stato
         * addestrato. `RUMORE_MINIMO` tiene fuori il silenzio — sotto quella
         * soglia non c'è voce da alzare, c'è solo fruscio da non amplificare.
         * `GUADAGNO_MASSIMO` impedisce che un sussurro lontano venga tirato su
         * di venti volte fino a diventare un'altra cosa.
         *
         * ⛔ Tre numeri di partenza, non tre misure: vanno tarati su dieci
         * tentativi veri con la voce dell'owner, a voce normale e bassa.
         */
        /*
         * ⛔ 20.000, e il numero viene dalle CLIP CHE IL MODELLO HA VISTO.
         *
         * MISURATO il 2026-08-15 su 200 clip aumentate di addestramento:
         *
         *     picco mediano   32.768   (fondo scala)
         *     primo quarto    19.816
         *     minimo           4.632
         *
         * Cioè il classificatore ha imparato su voce forte, quasi sempre al
         * massimo. Il primo valore (11.000) era una scommessa e puntava sotto
         * l'intero primo quarto: portava la voce debole a un livello che il
         * modello ha visto **di rado**.
         *
         * ⛔ E non 32.768: quello è il fondo scala, e mirarci significa
         * tosare le creste di ogni voce già normale. Il primo quarto porta
         * dentro la distribuzione senza saturare.
         */
        private const val LIVELLO_ATTESO = 20000

        /*
         * ⛔ 1.800 e non 500, e il numero viene dalla STANZA.
         *
         * MISURATO sul Pad con la sonda del guadagno, in silenzio:
         *
         *     livello: picco=514 fattore=8,0
         *     livello: picco=590 fattore=8,0
         *     livello: picco=632 fattore=8,0
         *
         * Cioè col primo valore (500) il guadagno amplificava **il fruscio**
         * otto volte, e un fruscio amplificato è esattamente ciò che produce
         * false attivazioni. Il fondo di questa stanza sta fra 500 e 650: la
         * soglia va sopra, con margine.
         *
         * ⛔ E non troppo sopra: la clip attenuata al 15% che ha fatto scattare
         * la parola arrivava al microfono con picco **11.918**, quindi c'è
         * spazio abbondante. Il numero si rivede se cambia la stanza.
         */
        private const val RUMORE_MINIMO = 1800
        private const val GUADAGNO_MASSIMO = 8f

        /** Ogni quanti blocchi da 80 ms la sonda scrive il picco: 25 ≈ 2 s. */
        private const val BLOCCHI_FRA_SONDE = 25L

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

        /*
         * ⛔ Qui c'era `PAROLE`: «hey TALOS» scritta a mano in token BPE
         * (`▁HE Y ▁TA LO S :1.5 #0.25`), con una nota lunga su come si
         * scompone e su quanto fosse facile sbagliarla.
         *
         * Era anche CODICE MORTO — nessuno la leggeva, perché le parole vere
         * stavano in `assets/kws/keywords.txt` — ma il punto è un altro: una
         * parola SCRITTA è una speranza che il modello la pronunci come te.
         * Adesso la parola si addestra, e non c'è nessuna stringa da azzeccare.
         */

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
        /**
         * ⛔⛔ CHI ha chiesto il microfono, scritto nel registro.
         *
         * MISURATO il 2026-08-14: dopo un'attivazione la parola è rimasta sorda
         * per 45 secondi e il registro diceva soltanto «nessuno ha preso il
         * microfono: me lo riprendo» — cioè che la scadenza era arrivata, non
         * **chi** aveva ceduto né **perché** nessuno avesse restituito. Con tre
         * chiamanti possibili (la barra, la dettatura, l'orecchio anticipato)
         * quel registro non permette di distinguere un'ipotesi dall'altra, e
         * senza distinguerle si tira a indovinare.
         *
         * ⇒ Costa una riga per cessione, che succede una volta ogni chiamata.
         */
        private fun chiHaChiesto(): String {
            val pila = Throwable().stackTrace
            // 0 = questa funzione, 1 = cedi/riprendi, 2 = chi le ha chiamate.
            return pila.getOrNull(2)?.let { "${it.className.substringAfterLast('.')}.${it.methodName}" }
                ?: "sconosciuto"
        }

        @JvmStatic
        fun cedi() {
            val chi = istanza ?: return
            Log.i(MARCHIO, "microfono CEDUTO su richiesta di ${chiHaChiesto()}")
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
            Log.i(MARCHIO, "microfono RESTITUITO da ${chiHaChiesto()}")
            chi.mano.removeCallbacks(chi.riprendiDaSolo)
            chi.ceduto = false
        }
    }
}
