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

    /**
     * ⛔ Scarta gli eventi delle sessioni morte. Si incrementa a ogni avvio e a
     * ogni chiusura: un evento che arriva con l'epoca sbagliata non tocca
     * niente.
     */
    @Volatile private var epoca = 0

    @Volatile private var inAscolto = false

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
        val silenzio = call.getInt("silenceMillis") ?: 0

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
            val riconoscitore = motore ?: SpeechRecognizer.createSpeechRecognizer(context).also {
                motore = it
            }
            runCatching { riconoscitore.cancel() }
            riconoscitore.setRecognitionListener(ascoltatore(mia))
            inAscolto = true
            try {
                riconoscitore.startListening(
                    intentoDiAscolto(lingua, automatica, consentite, parziali, offline, silenzio),
                )
                call.resolve(JSObject().put("started", true))
            } catch (errore: Exception) {
                inAscolto = false
                // ⛔ Il motivo VERO viaggia col rifiuto: senza, chi sta sopra
                // vede solo «riconoscimento fallito» e cerca il guasto nel
                // motore — che e' esattamente dove NON era.
                call.reject("startFailed: ${errore.javaClass.simpleName}: ${errore.message}")
            }
        }
    }

    private fun intentoDiAscolto(
        lingua: String?,
        automatica: Boolean,
        consentite: List<String>,
        parziali: Boolean,
        offline: Boolean,
        silenzio: Int,
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

    @PluginMethod
    fun stop(call: PluginCall) {
        val attivita = activity
        if (attivita == null) {
            call.resolve()
            return
        }
        attivita.runOnUiThread {
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
        inAscolto = false
        val attivita = activity
        if (attivita == null) {
            call.resolve()
            return
        }
        attivita.runOnUiThread {
            // ⛔ Si annulla, NON si distrugge: l'istanza si riusa, e distruggerla
            // qui riporterebbe il difetto intermittente al giro dopo.
            runCatching { motore?.cancel() }
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        epoca += 1
        try {
            motore?.destroy()
        } catch (ignorato: Exception) {
            // L'app sta chiudendo: non c'è nessuno a cui riferirlo.
        }
        motore = null
    }

    // ------------------------------------------------------------ richiamate

    private fun ascoltatore(mia: Int): RecognitionListener = object : RecognitionListener {
        private fun viva() = mia == epoca

        override fun onReadyForSpeech(params: Bundle?) {
            if (viva()) stato("ready")
        }

        override fun onBeginningOfSpeech() {
            if (viva()) stato("listening")
        }

        override fun onRmsChanged(rms: Float) {
            // Il livello lo disegna già il JS dalle parziali: mandarne trenta
            // al secondo attraverso il ponte costerebbe più di quanto vale.
        }

        override fun onBufferReceived(buffer: ByteArray?) = Unit

        override fun onEndOfSpeech() {
            if (viva()) stato("stopping")
        }

        override fun onError(error: Int) {
            if (!viva()) return
            epoca += 1
            inAscolto = false
            notifyListeners(
                "talosDictationError",
                JSObject().put("code", nomeErrore(error)).put("raw", error),
            )
        }

        override fun onResults(results: Bundle?) {
            if (!viva()) return
            epoca += 1
            inAscolto = false
            val testo = results
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            notifyListeners("talosDictationResult", JSObject().put("text", testo))
            stato("stopped")
        }

        override fun onPartialResults(partialResults: Bundle?) {
            if (!viva()) return
            val testo = partialResults
                ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            if (testo.isNotEmpty()) {
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
            if (!viva()) return
            val testo = segmentResults
                .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                ?.firstOrNull()
                .orEmpty()
            if (testo.isNotEmpty()) {
                notifyListeners("talosDictationSegment", JSObject().put("text", testo))
            }
        }

        override fun onEndOfSegmentedSession() {
            if (!viva()) return
            epoca += 1
            inAscolto = false
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

    private fun stato(quale: String) {
        notifyListeners("talosDictationState", JSObject().put("state", quale))
    }

    /**
     * I nomi, non i numeri. ⛔ `NO_MATCH` e `SPEECH_TIMEOUT` restano distinti da
     * tutto il resto: sono «non hai parlato», non «si è rotto qualcosa», e
     * confonderli è il difetto che l'owner ha sentito il 2026-08-10.
     */
    private fun nomeErrore(codice: Int): String = when (codice) {
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
}
