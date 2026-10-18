package ai.talos.agent

import ai.talos.TalosModelSeal
import ai.talos.TalosModelStore
import ai.talos.TalosTransferSession
import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.k2fsa.sherpa.onnx.OfflineModelConfig
import com.k2fsa.sherpa.onnx.OfflineRecognizer
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig
import com.k2fsa.sherpa.onnx.OfflineTransducerModelConfig
import com.k2fsa.sherpa.onnx.WaveReader
import java.io.File
import java.io.OutputStream
import java.util.concurrent.TimeUnit
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.Executors

/**
 * N12 — il riconoscimento vocale LOCALE: Parakeet TDT 0.6B v3 (int8) con sherpa-onnx, dentro il telefono.
 *
 * Decisioni dell'owner (12-13/10/2026): questo motore, modello scaricato al primo uso, in ibrido col riconoscitore di
 * sistema che resta come riserva. Libreria e interfaccia Kotlin sono quelle ufficiali, fissate per impronta
 * (`src/main/jniLibs/PROVENIENZA-ASR.md`).
 *
 * ⛔ Passo 2 del piano: qui c'è SOLO ciò che si prova senza microfono — lo stato del motore e la decodifica di un file
 * audio. La cattura dal microfono, le pause e la composizione col riconoscitore di sistema arrivano dopo.
 *
 * Il riconoscitore è pesante (carica ~650 MB): si crea una volta, fuori dal thread principale, e si tiene. Un lavoro alla
 * volta: sherpa-onnx non promette niente a chi decodifica due flussi insieme sullo stesso riconoscitore da thread diversi.
 */
@CapacitorPlugin(name = "TalosAsrLocale")
class TalosAsrLocalePlugin : Plugin() {

    private val lavoro = Executors.newSingleThreadExecutor { r -> Thread(r, "talos-asr-locale").apply { isDaemon = true } }
    private var riconoscitore: OfflineRecognizer? = null
    private var cartellaCaricata: String? = null

    /** Che cosa c'è: i file del modello in quella cartella (nomi e pesi, mai un giudizio sull'impronta — quello è di chi scarica). */
    @PluginMethod
    fun stato(call: PluginCall) {
        val cartella = cartellaDi(call)
        val trovati = JSObject()
        // Il SIGILLO: l'impronta che il motore dei download ha verificato per quel file, valida solo se il file non è
        // più cambiato da allora (`TalosModelSeal`). Un file copiato a mano non ha sigillo: c'è, ma non è «verificato».
        val sigilli = JSObject()
        for (nome in FILE_DEL_MODELLO) {
            val f = File(cartella, nome)
            trovati.put(nome, if (cartella.isNotEmpty() && f.isFile) f.length() else -1L)
            sigilli.put(nome, if (f.isFile) (TalosModelSeal.sealedSha256(context, f) ?: "") else "")
        }
        call.resolve(JSObject().apply {
            put("file", trovati)
            put("sigilli", sigilli)
            put("caricato", riconoscitore != null && cartellaCaricata == cartella)
        })
    }

    /**
     * Decodifica un file WAV mono (PCM a 16 bit). Torna il testo, quanto è durato l'audio e quanto è costato decodificarlo:
     * i due numeri insieme sono il RTF, cioè la sola cosa che dice se questo telefono ce la fa in tempo reale.
     */
    @PluginMethod
    fun decodificaFile(call: PluginCall) {
        val cartella = cartellaDi(call)
        val percorso = call.getString("file") ?: ""
        val fili = call.getInt("fili") ?: FILI_DI_SERIE
        lavoro.execute {
            try {
                val mancante = primoFileMancante(File(cartella))
                if (mancante != null) {
                    // messaggio (col file che manca), poi codice
                    call.reject("TALOS_ASR_MODEL_MISSING:$mancante", "TALOS_ASR_MODEL_MISSING")
                    return@execute
                }
                val audio = File(percorso)
                if (!audio.isFile) {
                    call.reject("TALOS_ASR_AUDIO_MISSING", "TALOS_ASR_AUDIO_MISSING")
                    return@execute
                }
                val primaDelCarico = SystemClock.elapsedRealtime()
                val motore = riconoscitorePer(cartella, fili)
                val caricoMs = SystemClock.elapsedRealtime() - primaDelCarico

                val onda = WaveReader.readWave(audio.absolutePath)
                val audioMs = if (onda.sampleRate > 0) onda.samples.size * 1000L / onda.sampleRate else 0L
                val prima = SystemClock.elapsedRealtime()
                val flusso = motore.createStream()
                val testo = try {
                    flusso.acceptWaveform(onda.samples, onda.sampleRate)
                    motore.decode(flusso)
                    motore.getResult(flusso).text
                } finally {
                    flusso.release()
                }
                call.resolve(JSObject().apply {
                    put("testo", testo.trim())
                    put("audioMs", audioMs)
                    put("decodificaMs", SystemClock.elapsedRealtime() - prima)
                    put("caricoMs", caricoMs)
                    put("campionamento", onda.sampleRate)
                })
            } catch (guasto: Throwable) {
                // UnsatisfiedLinkError compreso: una libreria che non si carica è un fatto da dire, non un crash.
                call.reject("TALOS_ASR_FAILED:${guasto.javaClass.simpleName}:${guasto.message ?: ""}".take(300), "TALOS_ASR_FAILED")
            }
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Passo 3 — la cattura dal microfono. Il riconoscitore di sistema continua a dare le parole vive col SUO ascolto
    // (`TalosDictationPlugin`); qui si tiene lo stesso parlato per ridarlo a Parakeet quando la persona ha finito.
    // ---------------------------------------------------------------------------------------------------------------

    @Volatile private var cattura: Cattura? = null

    /** Apre il microfono e tiene ciò che sente, fino a `trascrivi` o `annulla`. Non carica il modello: quello pesa, e arriva dopo. */
    @SuppressLint("MissingPermission") // controllato a mano qui sotto: senza permesso si risponde, non si crasha
    @PluginMethod
    fun ascolta(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            call.reject("TALOS_ASR_NO_MIC", "TALOS_ASR_NO_MIC")
            return
        }
        cattura?.ferma()
        prendiIlMicrofono()
        try {
            val minimo = AudioRecord.getMinBufferSize(CAMPIONAMENTO, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            val registratore = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION, CAMPIONAMENTO,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimo, CAMPIONAMENTO),
            )
            if (registratore.state != AudioRecord.STATE_INITIALIZED) {
                registratore.release()
                cattura = null
                rendiIlMicrofono()
                call.reject("TALOS_ASR_MIC_BUSY", "TALOS_ASR_MIC_BUSY")
                return
            }
            val nuova = Cattura(registratore, call.getInt("massimoSecondi") ?: SECONDI_MASSIMI)
            cattura = nuova
            anticipato = null
            // Il livello di ogni blocco da 100 ms: la pagina ci decide la fine del turno (800 ms di silenzio dopo le parole).
            nuova.sulLivello = { rms -> notifyListeners("talosAsrLivello", JSObject().apply { put("rms", rms.toDouble()) }) }
            val vive = call.getBoolean("vive", false) == true && Build.VERSION.SDK_INT >= 33
            if (vive) {
                // Le stesse scelte di lingua della dettatura di oggi: una lingua fissa, oppure il rilevamento fra quelle ammesse.
                val lingua = call.getString("lingua")
                val automatica = call.getBoolean("automatica", lingua.isNullOrBlank()) == true
                val ammesse = call.getArray("lingueAmmesse", JSArray())?.toList<String>()?.filter { it.isNotBlank() } ?: emptyList()
                apriLeVive(nuova, lingua, automatica, ammesse, call.getInt("silenzioMs") ?: 0)
            }
            nuova.parti()
            // Il modello si carica ADESSO, mentre la persona parla (4 s misurati sul Pad): allo stop Parakeet è già pronto.
            val cartella = cartellaDi(call)
            lavoro.execute { runCatching { if (primoFileMancante(File(cartella)) == null) riconoscitorePer(cartella, FILI_DI_SERIE) } }
            call.resolve(JSObject().apply {
                put("campionamento", CAMPIONAMENTO)
                put("vive", vive)
            })
        } catch (guasto: Throwable) {
            cattura?.ferma()
            cattura = null
            rendiIlMicrofono()
            call.reject("TALOS_ASR_MIC_FAILED:${guasto.javaClass.simpleName}".take(200), "TALOS_ASR_MIC_FAILED")
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // ⛔ IL MICROFONO È UNO SOLO (N12, fetta «barra», 13/10/2026). Prima di aprire la nostra cattura si spegne l'orecchio
    // anticipato (un riconoscitore di sistema già in ascolto: due ascolti insieme non si possono fare, misurato) e la
    // parola di attivazione molla la presa, come fa `TalosDictationPlugin`. La cessione della parola SCADE da sola
    // (45 s, `TalosParola.CESSIONE_MASSIMA_MS`): finché la cattura è aperta la si rinnova, e alla fine la si restituisce.
    // ---------------------------------------------------------------------------------------------------------------

    private val rinnovaLaCessione = object : Runnable {
        override fun run() {
            if (cattura == null) return
            ai.talos.parola.TalosParola.cedi()
            mano.postDelayed(this, CESSIONE_RINNOVO_MS)
        }
    }

    /** Aspetta che il filo dell'interfaccia abbia liberato il microfono: aprire prima vorrebbe dire trovarlo occupato. */
    private fun prendiIlMicrofono() {
        val fatto = CountDownLatch(1)
        mano.post {
            runCatching {
                // ⛔ Prima l'orecchio, poi la cessione: `spegni()` restituisce il microfono alla parola, e la cessione deve venire dopo.
                TalosOrecchioAnticipato.spegni()
                ai.talos.parola.TalosParola.cedi()
            }
            mano.removeCallbacks(rinnovaLaCessione)
            mano.postDelayed(rinnovaLaCessione, CESSIONE_RINNOVO_MS)
            fatto.countDown()
        }
        if (Looper.myLooper() != Looper.getMainLooper()) fatto.await(ATTESA_MICROFONO_MS, TimeUnit.MILLISECONDS)
    }

    private fun rendiIlMicrofono() {
        mano.post {
            mano.removeCallbacks(rinnovaLaCessione)
            if (cattura == null) runCatching { ai.talos.parola.TalosParola.riprendi() }
        }
    }

    /** Chiude il microfono e dà a Parakeet tutto ciò che ha sentito. Torna anche il picco: un audio muto è un fatto da dire. */
    @PluginMethod
    fun trascrivi(call: PluginCall) {
        val cartella = cartellaDi(call)
        val fili = call.getInt("fili") ?: FILI_DI_SERIE
        val usaAnticipo = call.getBoolean("anticipo", false) == true
        val presa = cattura
        cattura = null
        if (presa == null) {
            call.reject("TALOS_ASR_NOT_LISTENING", "TALOS_ASR_NOT_LISTENING")
            return
        }
        lavoro.execute {
            try {
                val campioni = presa.ferma()
                // Il microfono è chiuso: la parola di attivazione torna ad aspettare mentre Parakeet rilegge.
                rendiIlMicrofono()
                val audioMs = campioni.size * 1000L / CAMPIONAMENTO
                val forte = picco(campioni)
                val mancante = primoFileMancante(File(cartella))
                if (mancante != null) {
                    call.reject("TALOS_ASR_MODEL_MISSING:$mancante", "TALOS_ASR_MODEL_MISSING")
                    return@execute
                }
                val prima = SystemClock.elapsedRealtime()
                // N12-ANTICIPO: se la pagina dice che dopo l'ultima rilettura non si è più parlato, quel testo È il testo.
                // Questo lavoro gira sullo stesso filo della rilettura, quindi qui lei è già finita (o non è mai partita).
                val gia = anticipato.takeIf { usaAnticipo && it?.di === presa }
                anticipato = null
                val testo = gia?.testo ?: decodifica(riconoscitorePer(cartella, fili), campioni)
                call.resolve(JSObject().apply {
                    put("testo", testo.trim())
                    put("audioMs", audioMs)
                    put("decodificaMs", SystemClock.elapsedRealtime() - prima)
                    put("picco", forte.toDouble())
                    put("tagliato", presa.tagliato)
                    put("anticipato", gia != null)
                })
            } catch (guasto: Throwable) {
                call.reject("TALOS_ASR_FAILED:${guasto.javaClass.simpleName}:${guasto.message ?: ""}".take(300), "TALOS_ASR_FAILED")
            }
        }
    }

    // ---------------------------------------------------------------------------------------------------------------
    // N12-ANTICIPO (owner 13/10/2026: «Parakeet rilegge mentre parli»). MISURATO sul Pad: a turno chiuso la rilettura
    // costa ~1 s. La pagina la chiede alla prima pausa: si rilegge ciò che la cattura ha sentito FINORA, senza fermarla.
    // Se poi non si parla più, `trascrivi({ anticipo: true })` usa questo testo invece di rifare il lavoro.
    // ---------------------------------------------------------------------------------------------------------------

    private class Anticipato(val di: Cattura, val testo: String)
    @Volatile private var anticipato: Anticipato? = null

    @PluginMethod
    fun anticipa(call: PluginCall) {
        val presa = cattura
        if (presa == null) { call.resolve(); return }
        val cartella = cartellaDi(call)
        val fili = call.getInt("fili") ?: FILI_DI_SERIE
        lavoro.execute {
            // Se nel frattempo la cattura è cambiata o è finita, questo lavoro non serve più a nessuno.
            if (cattura !== presa) return@execute
            runCatching {
                if (primoFileMancante(File(cartella)) != null) return@runCatching
                val testo = decodifica(riconoscitorePer(cartella, fili), presa.finora())
                // ⛔ Si tiene ANCHE se nel frattempo è arrivato `trascrivi` (che toglie `cattura`): è proprio il caso in cui
                // serve, e buttarlo vorrebbe dire rileggere due volte. Vale solo per QUESTA cattura (`di`), quindi non può
                // finire nel testo di un'altra; una cattura nuova lo azzera.
                anticipato = Anticipato(presa, testo)
                // ⛔ N12-ANTEPRIMA (owner 18/10/2026: l'anteprima «si blocca a metà»; «Parakeet aggiorna l'anteprima alle pause»):
                // le parole vive del sistema arrivano in ritardo, il testo di Parakeet va anche alla pagina. Solo a cattura aperta.
                if (cattura === presa && testo.isNotBlank()) notifyListeners("talosAsrRiletto", JSObject().put("text", testo))
            }
        }
        call.resolve()
    }

    private fun decodifica(motore: OfflineRecognizer, campioni: FloatArray): String {
        val flusso = motore.createStream()
        return try {
            flusso.acceptWaveform(campioni, CAMPIONAMENTO)
            motore.decode(flusso)
            motore.getResult(flusso).text
        } finally {
            flusso.release()
        }
    }

    /** Chiude il microfono e butta ciò che ha sentito. */
    @PluginMethod
    fun annulla(call: PluginCall) {
        cattura?.ferma()
        cattura = null
        anticipato = null
        rendiIlMicrofono()
        call.resolve()
    }

    // ---------------------------------------------------------------------------------------------------------------
    // Le parole VIVE dell'ibrido. ⛔ MISURATO sul Pad il 13/10/2026: due ascolti insieme non si possono fare — con la
    // nostra cattura aperta il riconoscitore di sistema sente silenzio (`NO_MATCH`), in tutti e due gli ordini. Quindi
    // il microfono lo apre UNO solo (noi), e lo stesso audio va al riconoscitore di sistema da un tubo
    // (`EXTRA_AUDIO_SOURCE`, API 33): lui dà le parole mentre si parla, Parakeet il testo giusto alla fine.
    // Se le vive si guastano la cattura CONTINUA: si perde solo l'anteprima, e lo si dice con un evento.
    // ---------------------------------------------------------------------------------------------------------------

    private val mano = Handler(Looper.getMainLooper())

    private fun apriLeVive(presa: Cattura, lingua: String?, automatica: Boolean, ammesse: List<String>, silenzioMs: Int) {
        mano.post {
            val orecchio = try { SpeechRecognizer.createSpeechRecognizer(context) } catch (guasto: Throwable) {
                notifyListeners("talosAsrViveFinite", JSObject().put("code", "START_FAILED:${guasto.javaClass.simpleName}"))
                return@post
            }
            var lettura: ParcelFileDescriptor? = null
            var riaperture = 0
            presa.allaFine = Runnable {
                mano.post {
                    runCatching { orecchio.cancel() }
                    runCatching { orecchio.destroy() }
                    runCatching { lettura?.close() }
                }
            }

            /**
             * Una sessione del riconoscitore, col suo tubo NUOVO: un tubo già letto fino in fondo non si riusa.
             * ⛔ MISURATO sul Pad il 13/10/2026: se chi parla tarda un paio di secondi la sessione finisce da sola con
             * `NO_MATCH`, e così a ogni silenzio lungo. La cattura però è ancora aperta (la chiude la persona): le vive si
             * riaprono, con un respiro, finché la cattura vive. Stessa lezione di `ilSilenzioNonEUnEsito` nella dettatura.
             */
            fun parti() {
                if (cattura !== presa) return
                try {
                    runCatching { lettura?.close() }
                    val tubo = ParcelFileDescriptor.createPipe()
                    lettura = tubo[0]
                    presa.verso?.chiudi()
                    presa.verso = Tubo(ParcelFileDescriptor.AutoCloseOutputStream(tubo[1]))
                    // La stessa richiesta della dettatura di oggi (formattazione, sessione a segmenti, tempi), con la fonte cambiata.
                    val intento = talosIntentoDiAscolto(
                        context, lingua, automatica, ammesse, true, false,
                        if (silenzioMs > 0) silenzioMs else TALOS_PAUSA_FINE_FRASE_MS, TALOS_ATTESA_INIZIO_MS,
                    )
                    intento.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE, tubo[0])
                    intento.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_CHANNEL_COUNT, 1)
                    intento.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
                    intento.putExtra(RecognizerIntent.EXTRA_AUDIO_SOURCE_SAMPLING_RATE, CAMPIONAMENTO)
                    orecchio.startListening(intento)
                } catch (guasto: Throwable) {
                    presa.verso?.chiudi()
                    presa.verso = null
                    notifyListeners("talosAsrViveFinite", JSObject().put("code", "START_FAILED:${guasto.javaClass.simpleName}"))
                }
            }

            fun riapri(perche: String) {
                if (cattura !== presa) return
                riaperture += 1
                if (riaperture > RIAPERTURE_MASSIME) {
                    notifyListeners("talosAsrViveFinite", JSObject().put("code", perche))
                    return
                }
                notifyListeners("talosAsrViveRiaperte", JSObject().put("code", perche).put("volta", riaperture))
                mano.postDelayed({ parti() }, RESPIRO_VIVE_MS)
            }

            orecchio.setRecognitionListener(object : RecognitionListener {
                private fun testo(b: Bundle?) = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                private fun manda(evento: String, t: String) {
                    if (cattura === presa && t.isNotEmpty()) notifyListeners(evento, JSObject().put("text", t))
                }
                override fun onPartialResults(partialResults: Bundle?) = manda("talosAsrViva", testo(partialResults))
                override fun onSegmentResults(segmentResults: Bundle) = manda("talosAsrTratto", testo(segmentResults))
                override fun onResults(results: Bundle?) {
                    manda("talosAsrTratto", testo(results))
                    riapri("END")
                }
                override fun onError(error: Int) {
                    val nome = talosNomeErrore(error)
                    // Silenzio e fine del tratto non sono guasti: si riapre. Il resto si dice, e la cattura continua da sola.
                    if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) riapri(nome)
                    else if (cattura === presa) notifyListeners("talosAsrViveFinite", JSObject().put("code", nome))
                }
                override fun onEndOfSegmentedSession() = riapri("END")
                /** La lingua che il riconoscitore ha SENTITO (API 34): serve a rispondere nella stessa lingua, come oggi. */
                override fun onLanguageDetection(results: Bundle) {
                    val rilevata = results.getString(SpeechRecognizer.DETECTED_LANGUAGE)
                    if (cattura === presa && !rilevata.isNullOrBlank()) notifyListeners("talosAsrLingua", JSObject().put("language", rilevata))
                }
                override fun onReadyForSpeech(params: Bundle?) = Unit
                override fun onBeginningOfSpeech() = Unit
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onEvent(eventType: Int, params: Bundle?) = Unit
            })
            parti()
        }
    }

    /**
     * Il tubo verso il riconoscitore di sistema. Scrive da un filo suo: se chi legge rallenta o sparisce, la cattura non
     * deve fermarsi ad aspettarlo. Coda piena o scrittura fallita ⇒ il tubo si chiude e la cattura va avanti da sola.
     */
    internal class Tubo(private val uscita: OutputStream, capienza: Int = 100) {
        private val coda = ArrayBlockingQueue<ByteArray>(capienza)
        @Volatile var aperto = true
            private set
        private val filo = Thread({
            try {
                while (true) {
                    val pezzo = coda.take()
                    if (pezzo.isEmpty()) break
                    uscita.write(pezzo)
                }
            } catch (_: Throwable) {
                // chi leggeva se n'è andato
            } finally {
                aperto = false
                runCatching { uscita.close() }
            }
        }, "talos-asr-tubo").apply { isDaemon = true; start() }

        /** Mai bloccante. Torna falso se il tubo è (o diventa) chiuso. */
        fun scrivi(campioni: ShortArray, quanti: Int): Boolean {
            if (!aperto) return false
            if (!coda.offer(inByte(campioni, quanti))) { chiudi(); return false }
            return true
        }

        fun chiudi() {
            if (!aperto) return
            aperto = false
            coda.clear()
            coda.offer(ByteArray(0))
            // se il filo è fermo in una scrittura, la chiusura la sblocca
            runCatching { uscita.close() }
        }
    }

    /** Una registrazione: un thread che legge dal microfono finché non la si ferma o non raggiunge il tetto. */
    private class Cattura(private val registratore: AudioRecord, secondiMassimi: Int) {
        private val tetto = secondiMassimi.coerceIn(1, SECONDI_MASSIMI) * CAMPIONAMENTO
        private val pezzi = ArrayList<ShortArray>()
        private var presi = 0
        @Volatile private var viva = true
        @Volatile var tagliato = false
            private set
        /** Dove va ANCHE l'audio mentre arriva (il tubo delle parole vive), se c'è. */
        @Volatile var verso: Tubo? = null
        /** Che cosa chiudere quando la cattura finisce (il riconoscitore delle parole vive). */
        @Volatile var allaFine: Runnable? = null
        /** A chi dire il livello di ogni blocco (0-1): serve a decidere la fine del turno dal silenzio (N12-TURNO). */
        @Volatile var sulLivello: ((Float) -> Unit)? = null
        private val filo = Thread({
            val tampone = ShortArray(CAMPIONAMENTO / 10)
            while (viva) {
                val letti = registratore.read(tampone, 0, tampone.size)
                if (letti <= 0) break
                verso?.let { if (!it.scrivi(tampone, letti)) verso = null }
                sulLivello?.invoke(livello(tampone, letti))
                synchronized(pezzi) {
                    val spazio = tetto - presi
                    if (spazio <= 0) { tagliato = true; viva = false } else {
                        val quanti = minOf(letti, spazio)
                        pezzi.add(tampone.copyOf(quanti))
                        presi += quanti
                    }
                }
            }
        }, "talos-asr-cattura").apply { isDaemon = true }

        fun parti() {
            registratore.startRecording()
            filo.start()
        }

        /** Ciò che ha sentito finora, senza fermarsi (per la rilettura anticipata). */
        fun finora(): FloatArray = synchronized(pezzi) { inVirgolaMobile(pezzi, presi) }

        /** Ferma (una volta sola ha effetto) e torna tutto il parlato in virgola mobile fra -1 e 1, come lo vuole sherpa-onnx. */
        fun ferma(): FloatArray {
            viva = false
            try { registratore.stop() } catch (_: Throwable) { /* già fermo */ }
            try { filo.join(1500) } catch (_: Throwable) { /* interrotto: si usa ciò che c'è */ }
            try { registratore.release() } catch (_: Throwable) { /* già rilasciato */ }
            verso?.chiudi()
            verso = null
            allaFine?.run()
            allaFine = null
            synchronized(pezzi) { return inVirgolaMobile(pezzi, presi) }
        }
    }

    /** Lascia andare il modello (650 MB di memoria): quando la dettatura è spenta non deve restare caricato. */
    @PluginMethod
    fun scarica(call: PluginCall) {
        lavoro.execute {
            riconoscitore?.release()
            riconoscitore = null
            cartellaCaricata = null
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        // Un microfono aperto non sopravvive alla sua schermata.
        cattura?.ferma()
        cattura = null
        rendiIlMicrofono()
        lavoro.execute {
            riconoscitore?.release()
            riconoscitore = null
            cartellaCaricata = null
        }
        super.handleOnDestroy()
    }

    /** La cartella del modello: quella detta da chi chiama, o di serie `files/asr/parakeet` dentro l'app (dove lo mette il download). */
    private fun cartellaDi(call: PluginCall): String {
        call.getString("cartella")?.takeIf { it.isNotBlank() }?.let { return it }
        // Dove il motore dei download dell'app mette i file di quel deposito a quella revisione: è la strada vera.
        val deposito = call.getString("deposito")
        val revisione = call.getString("revisione")
        if (!deposito.isNullOrBlank() && !revisione.isNullOrBlank()) {
            try {
                val posto = TalosModelStore(TalosTransferSession.rootFor(context)).slot(deposito, revisione, "tokens.txt").finished.parentFile
                if (posto != null) return posto.absolutePath
            } catch (_: Throwable) {
                // nomi non ammessi dal deposito dei modelli: si ricade sulla cartella di serie
            }
        }
        return File(context.filesDir, CARTELLA_DI_SERIE).absolutePath
    }

    /**
     * Verifica i file del modello e li SIGILLA. ⛔ MISURATO sul Pad il 13/10/2026: appena finito lo scaricamento i quattro
     * file c'erano, col peso giusto, ma senza sigillo valido — il sigillo del download nasce nello stesso secondo dell'ultima
     * modifica del file, e la regola di `TalosModelSeal` (deve nascere in un secondo SUCCESSIVO) lo scarta. Qui l'impronta
     * si ricalcola dal file com'è adesso (670 MB: qualche secondo) e si sigilla in un secondo successivo. Chi chiama
     * confronta poi le impronte con quelle fissate alla fonte: questo metodo dice solo ciò che i file SONO.
     */
    @PluginMethod
    fun verifica(call: PluginCall) {
        val cartella = cartellaDi(call)
        lavoro.execute {
            val sigilli = JSObject()
            try {
                for (nome in FILE_DEL_MODELLO) {
                    val f = File(cartella, nome)
                    if (!f.isFile) { sigilli.put(nome, ""); continue }
                    var impronta = TalosModelSeal.sealedSha256(context, f)
                    if (impronta == null) {
                        impronta = improntaDi(f)
                        // il sigillo vale solo se nasce in un secondo successivo all'ultima modifica del file
                        val manca = f.lastModified() / 1000L * 1000L + 1100L - System.currentTimeMillis()
                        if (manca > 0) Thread.sleep(manca)
                        TalosModelSeal.seal(context, f, impronta, "computed")
                    }
                    sigilli.put(nome, impronta)
                }
                call.resolve(JSObject().put("sigilli", sigilli))
            } catch (guasto: Throwable) {
                call.reject("TALOS_ASR_VERIFY_FAILED:${guasto.javaClass.simpleName}".take(200), "TALOS_ASR_VERIFY_FAILED")
            }
        }
    }

    /** Toglie il modello dal telefono (670 MB): prima lo scarica dalla memoria, poi cancella i suoi quattro file. */
    @PluginMethod
    fun rimuovi(call: PluginCall) {
        val cartella = cartellaDi(call)
        lavoro.execute {
            riconoscitore?.release()
            riconoscitore = null
            cartellaCaricata = null
            var tolti = 0
            for (nome in FILE_DEL_MODELLO) {
                val f = File(cartella, nome)
                if (f.isFile && f.delete()) tolti += 1
            }
            call.resolve(JSObject().put("tolti", tolti))
        }
    }

    private fun riconoscitorePer(cartella: String, fili: Int): OfflineRecognizer {
        riconoscitore?.let { if (cartellaCaricata == cartella) return it }
        riconoscitore?.release()
        riconoscitore = null
        val nuovo = OfflineRecognizer(config = configurazione(File(cartella), fili))
        riconoscitore = nuovo
        cartellaCaricata = cartella
        return nuovo
    }

    companion object {
        /** I quattro file del modello, coi nomi della fonte (`mobile/src/lib/voice/modelloParakeet.ts`). */
        val FILE_DEL_MODELLO = listOf("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt")

        /** Misurato sul Pad l'11/10/2026 con lo strumento ufficiale: 4 fili, RTF 0,09. */
        const val FILI_DI_SERIE = 4

        /** Dentro la cartella privata dell'app. */
        const val CARTELLA_DI_SERIE = "asr/parakeet"

        /** Parakeet lavora a 16 kHz mono: si registra già così, senza ricampionare. */
        const val CAMPIONAMENTO = 16_000

        /** Quanto può durare una dettatura tenuta in memoria: 10 minuti sono 19 MB di campioni. Oltre, si taglia e lo si dice. */
        const val SECONDI_MASSIMI = 600

        /** Fra una sessione delle parole vive e la successiva: riaprire nello stesso millisecondo è ciò che il riconoscitore non perdona. */
        const val RESPIRO_VIVE_MS = 250L

        /** Dieci minuti di cattura con una pausa ogni pochi secondi stanno larghi qui dentro; oltre, le vive si fermano e si dice. */
        const val RIAPERTURE_MASSIME = 400

        /** La cessione della parola di attivazione scade a 45 s: si rinnova prima, finché la cattura è aperta. */
        const val CESSIONE_RINNOVO_MS = 30_000L

        /** Quanto si aspetta il filo dell'interfaccia prima di aprire il microfono: oltre si apre lo stesso, e se è occupato si dice. */
        const val ATTESA_MICROFONO_MS = 1_500L

        /** Il livello di un blocco: radice della media dei quadrati, fra 0 (silenzio) e 1 (onda quadra piena). */
        fun livello(campioni: ShortArray, quanti: Int): Float {
            if (quanti <= 0) return 0f
            var somma = 0.0
            for (i in 0 until quanti) { val v = campioni[i] / 32768.0; somma += v * v }
            return Math.sqrt(somma / quanti).toFloat()
        }

        /** Da interi a 16 bit a virgola mobile fra -1 e 1, nell'ordine in cui sono arrivati. */
        fun inVirgolaMobile(pezzi: List<ShortArray>, quanti: Int): FloatArray {
            val uscita = FloatArray(quanti)
            var i = 0
            for (pezzo in pezzi) {
                for (campione in pezzo) {
                    if (i >= quanti) return uscita
                    uscita[i++] = campione / 32768f
                }
            }
            return uscita
        }

        /** L'impronta SHA-256 di un file, in esadecimale minuscolo, letta a pezzi (il modello pesa 650 MB). */
        fun improntaDi(file: File): String {
            val conto = java.security.MessageDigest.getInstance("SHA-256")
            file.inputStream().use { ingresso ->
                val tampone = ByteArray(1 shl 20)
                while (true) {
                    val letti = ingresso.read(tampone)
                    if (letti < 0) break
                    conto.update(tampone, 0, letti)
                }
            }
            return conto.digest().joinToString("") { "%02x".format(it) }
        }

        /** Interi a 16 bit in byte, il basso prima (PCM little-endian): come li vuole il riconoscitore di sistema. */
        fun inByte(campioni: ShortArray, quanti: Int): ByteArray {
            val n = quanti.coerceIn(0, campioni.size)
            val uscita = ByteArray(n * 2)
            for (i in 0 until n) {
                val c = campioni[i].toInt()
                uscita[i * 2] = (c and 0xFF).toByte()
                uscita[i * 2 + 1] = ((c shr 8) and 0xFF).toByte()
            }
            return uscita
        }

        /** Il campione più forte, fra 0 e 1: vicino a zero vuol dire che il microfono non ha sentito niente. */
        fun picco(campioni: FloatArray): Float {
            var massimo = 0f
            for (c in campioni) { val a = if (c < 0) -c else c; if (a > massimo) massimo = a }
            return massimo
        }

        /** Il primo file del modello che manca (o è vuoto) in quella cartella, o `null` se ci sono tutti. */
        fun primoFileMancante(cartella: File): String? =
            FILE_DEL_MODELLO.firstOrNull { nome -> File(cartella, nome).let { !it.isFile || it.length() == 0L } }

        /** La configurazione di sherpa-onnx per Parakeet TDT (famiglia NeMo, trasduttore), dai file di quella cartella. */
        fun configurazione(cartella: File, fili: Int = FILI_DI_SERIE): OfflineRecognizerConfig =
            OfflineRecognizerConfig(
                modelConfig = OfflineModelConfig(
                    transducer = OfflineTransducerModelConfig(
                        encoder = File(cartella, "encoder.int8.onnx").absolutePath,
                        decoder = File(cartella, "decoder.int8.onnx").absolutePath,
                        joiner = File(cartella, "joiner.int8.onnx").absolutePath,
                    ),
                    tokens = File(cartella, "tokens.txt").absolutePath,
                    modelType = "nemo_transducer",
                    numThreads = fili.coerceIn(1, 8),
                    provider = "cpu",
                ),
            )
    }
}
