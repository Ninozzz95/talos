package ai.talos.parola

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.res.AssetManager
import android.util.Log
import java.nio.FloatBuffer

/**
 * ⭐⭐⭐ L'ORECCHIO DELLA PAROLA — tre modelli in fila, e la parola si ADDESTRA.
 *
 * ## Perché questo file esiste, e cosa ha sostituito
 *
 * Qui c'era sherpa-onnx con un riconoscitore a trasduttore: la parola si
 * SCRIVEVA, in token BPE (`▁HE Y ▁TA LO S`), e il modello doveva produrre
 * acusticamente proprio quella sequenza. Su un italiano che dice «TALOS» non la
 * produceva mai.
 *
 * MISURATO sul Pad il 2026-08-14 — il servizio era innocente su tutta la linea
 * (vivo, in primo piano, microfono preso, ciclo partito, interruttore sincero) e
 * su cinque tentativi ha fatto **zero** attivazioni. Il controllo che ha chiuso
 * il caso: la **dettatura**, sullo stesso microfono e collo stesso suono, ha
 * trascritto la frase senza sbagliare quasi niente. ⇒ Il microfono riceve; era
 * il riconoscitore a non sentire. La misura per esteso sta in
 * `jniLibs/PROVENIENZA-PAROLA.md`.
 *
 * ## Come è fatto adesso
 *
 * ```
 * 80 ms (1280 campioni) ─► mel ─► 8 fotogrammi × 32 bande
 *                                  │
 *                     ultimi 76 ───┴─► embedding ─► 1 vettore da 96
 *                                                    │
 *                                     ultimi 16 ─────┴─► classificatore ─► punteggio
 * ```
 *
 * Il vettore da 96 è il `speech_embedding` di Google, congelato: non lo
 * addestriamo, e non ci interessa. Sopra ci va un classificatore piccolo che
 * conosce **una parola sola** — ed è quello che addestriamo noi.
 *
 * ⇒ La parola non si scrive più: si addestra su migliaia di campioni. È la
 * differenza fra sperare che un modello inglese pronunci «TALOS» come lo
 * pronunci tu, e mostrargli come lo pronunci tu.
 *
 * ## ⛔⛔ I DUE dettagli che uccidono in silenzio
 *
 * 1. **⛔⛔ LA SCALA DEI CAMPIONI LA DECIDE CHI HA ADDESTRATO IL MODELLO** —
 *    e questa riga ha detto la cosa sbagliata per tre giorni.
 *
 *    Diceva: «int16 scritti in float, NON normalizzati; dividere per 32768 dà
 *    uno spettro completamente diverso». Era **vero**, ed è documentato dalla
 *    prova qui sotto: con `hey_jarvis` di openWakeWord la scala grezza dava
 *    0,9987. Quella pipeline legge i wav come int16.
 *
 *    ⛔ Ma il modello che usiamo oggi non viene da lì. `talos.onnx` è addestrato
 *    con **livekit-wakeword**, e il suo lettore è un'altra cosa —
 *    `data/features.py`, riga 56:
 *
 *        audio, sr = sf.read(str(wav_path))     # soundfile: restituisce -1..1
 *        audio = audio.astype(np.float32)       # e resta -1..1
 *
 *    `soundfile.read()` **normalizza**. Cioè il nostro classificatore ha visto
 *    solo valori fra -1 e 1, e noi gli passavamo numeri **32.768 volte più
 *    grandi**.
 *
 *    ## Quanto è costato, misurato il 2026-08-15 sulle stesse quattro clip
 *
 *    | clip | int16 grezzo | -1..1 |
 *    | --- | --- | --- |
 *    | clip_000034_r0 | 0,658 | **0,989** |
 *    | clip_000068_r1 | 0,908 | **0,973** |
 *    | clip_000102_r2 | 0,461 ✗ | **0,977** ✓ |
 *    | clip_000171_r0 | 0,239 ✗ | **0,983** ✓ |
 *
 *    ⇒ **2 su 4 diventano 4 su 4**, e i punteggi smettono di ballare fra 0,24 e
 *    0,91 per stare tutti sopra 0,97. È l'owner che l'aveva detto: «risponde 2
 *    volte su 10», «devo letteralmente urlare».
 *
 *    ⛔⛔ LA LEZIONE, che vale oltre questo file: una convenzione giusta per un
 *    modello **non è una proprietà del formato audio**. Cambiando la libreria di
 *    addestramento cambia, e non lo dice nessun errore: il punteggio scende e
 *    basta. Si legge nel sorgente di CHI ADDESTRA come legge i file, e la
 *    risposta si mette qui accanto al numero.
 *
 *    ⇒ Prima di tarare soglia, guadagno o rumore, si controlla la scala: sono
 *    tutte manopole a valle di questa, e girarle su una scala sbagliata dà
 *    miglioramenti veri che non arrivano da nessuna parte. È successo.
 * 2. **La trasformazione `x/10 + 2` sul mel.** Non è un abbellimento: allinea
 *    l'uscita del modello ONNX a quella TensorFlow originale di Google, che è
 *    quella su cui l'embedding è stato addestrato. Senza, i numeri sono
 *    plausibili e sbagliati.
 *
 * Nessuno dei due si sarebbe visto da un log. Si vedono solo da un punteggio
 * che non sale mai — cioè esattamente il difetto da cui veniamo.
 *
 * ## ⭐ La catena è stata provata PRIMA di compilare
 *
 * Riscritta in Python con queste stesse costanti e passata su file veri, con
 * `hey_jarvis` già addestrato da altri:
 *
 * | suono | punteggio |
 * | --- | --- |
 * | «hey jarvis» | **0,9987** |
 * | «hey talos» in inglese | 0,0683 |
 * | «hey talos» in italiano | 0,0025 |
 * | una frase italiana qualunque | 0,0000 |
 *
 * ⇒ Quando questo file gira sul Pad, un punteggio basso su «hey jarvis» accusa
 * il PORTING, non l'algoritmo. È la ragione per cui la prova si fa in
 * quest'ordine.
 */
class TalosOrecchio private constructor(
    private val ambiente: OrtEnvironment,
    private val mel: OrtSession,
    private val vettoriale: OrtSession,
    private val classificatore: OrtSession,
    private val ingressoClassificatore: String,
) {

    /**
     * I campioni che restano da un blocco al successivo.
     *
     * ⛔ Il modello mel perde tre salti alla finestra: per avere 8 fotogrammi
     * nuovi da 1280 campioni gliene servono 1760, e i 480 in più sono la CODA
     * del blocco precedente. Senza, ogni blocco perderebbe i suoi primi 30 ms e
     * l'attacco della parola cadrebbe nella cucitura.
     */
    private val coda = FloatArray(SGUARDO_INDIETRO)

    private val finestra = FloatArray(SGUARDO_INDIETRO + CAMPIONI_PER_BLOCCO)

    /**
     * Gli ultimi 76 fotogrammi di spettro, che sono ciò che l'embedding guarda.
     *
     * ⛔ Nasce pieno di UNO e non di zero: è così in openWakeWord, e uno spettro
     * di zeri è un silenzio innaturale che il modello non ha mai visto.
     */
    private val magazzino = FloatArray(FINESTRA_MEL * BANDE) { 1f }

    private val vettori = FloatArray(VETTORI * DIMENSIONE)

    /** Quanti vettori veri ci sono dentro: sotto 16 non si giudica. */
    private var quanti = 0

    private var fotogrammiVisti = -1

    /**
     * Un blocco da 80 ms. Torna il punteggio, o `null` finché non c'è ancora
     * abbastanza storia per giudicare (i primi ~1,3 s dopo l'avvio o un azzera).
     *
     * ⛔ Torna `null` invece di 0: «non lo so ancora» e «ho ascoltato e non è
     * lei» sono due cose diverse, e confonderle è il difetto che questa casa
     * paga da settimane.
     */
    fun ascolta(blocco: ShortArray, letti: Int): Float? {
        if (letti != CAMPIONI_PER_BLOCCO) return null

        System.arraycopy(coda, 0, finestra, 0, SGUARDO_INDIETRO)
        for (i in 0 until CAMPIONI_PER_BLOCCO) {
            // ⛔ DIVISO 32768: la scala la decide CHI HA ADDESTRATO. Vedi la
            // nota in testa al file — la regola opposta era vera per un altro
            // modello, ed è costata «risponde 2 volte su 10».
            finestra[SGUARDO_INDIETRO + i] = blocco[i] / SCALA_PIENA
        }
        System.arraycopy(finestra, CAMPIONI_PER_BLOCCO, coda, 0, SGUARDO_INDIETRO)

        val fotogrammi = spettro() ?: return null
        versaNelMagazzino(fotogrammi)
        val vettore = vettore() ?: return null
        versaFraIVettori(vettore)

        if (quanti < VETTORI) return null
        return giudica()
    }

    /** Lo spettro dei 1760 campioni: `fotogrammi × 32`, già trasformato. */
    private fun spettro(): FloatArray? {
        return OnnxTensor.createTensor(
            ambiente,
            FloatBuffer.wrap(finestra),
            longArrayOf(1, finestra.size.toLong()),
        ).use { ingresso ->
            mel.run(mapOf(NOME_MEL to ingresso)).use { esito ->
                val uscita = esito.get(0) as OnnxTensor
                val piatta = uscita.floatBuffer
                val quanti = piatta.remaining()
                if (quanti % BANDE != 0) {
                    Log.e(MARCHIO, "lo spettro non è un multiplo di $BANDE bande: $quanti")
                    return@use null
                }
                val fuori = FloatArray(quanti)
                piatta.get(fuori)
                /*
                 * ⛔ LA TRASFORMAZIONE, e non è un abbellimento: allinea questo
                 * modello ONNX all'originale TensorFlow di Google, che è quello
                 * su cui l'embedding qui sotto è stato addestrato.
                 */
                for (i in fuori.indices) fuori[i] = fuori[i] / 10f + 2f
                if (fotogrammiVisti < 0) {
                    fotogrammiVisti = quanti / BANDE
                    Log.i(MARCHIO, "spettro: ${finestra.size} campioni -> $fotogrammiVisti fotogrammi")
                }
                fuori
            }
        }
    }

    /** Fa scorrere il magazzino di quanti fotogrammi sono arrivati. */
    private fun versaNelMagazzino(fotogrammi: FloatArray) {
        val nuovi = fotogrammi.size / BANDE
        if (nuovi >= FINESTRA_MEL) {
            System.arraycopy(
                fotogrammi, (nuovi - FINESTRA_MEL) * BANDE,
                magazzino, 0, FINESTRA_MEL * BANDE,
            )
            return
        }
        val restano = (FINESTRA_MEL - nuovi) * BANDE
        System.arraycopy(magazzino, nuovi * BANDE, magazzino, 0, restano)
        System.arraycopy(fotogrammi, 0, magazzino, restano, nuovi * BANDE)
    }

    /** Il vettore da 96 degli ultimi 76 fotogrammi. */
    private fun vettore(): FloatArray? {
        return OnnxTensor.createTensor(
            ambiente,
            FloatBuffer.wrap(magazzino),
            longArrayOf(1, FINESTRA_MEL.toLong(), BANDE.toLong(), 1),
        ).use { ingresso ->
            vettoriale.run(mapOf(NOME_EMBEDDING to ingresso)).use { esito ->
                val piatta = (esito.get(0) as OnnxTensor).floatBuffer
                if (piatta.remaining() != DIMENSIONE) {
                    Log.e(MARCHIO, "il vettore non è da $DIMENSIONE: ${piatta.remaining()}")
                    return@use null
                }
                val fuori = FloatArray(DIMENSIONE)
                piatta.get(fuori)
                fuori
            }
        }
    }

    private fun versaFraIVettori(vettore: FloatArray) {
        System.arraycopy(vettori, DIMENSIONE, vettori, 0, (VETTORI - 1) * DIMENSIONE)
        System.arraycopy(vettore, 0, vettori, (VETTORI - 1) * DIMENSIONE, DIMENSIONE)
        if (quanti < VETTORI) quanti++
    }

    private fun giudica(): Float? {
        return OnnxTensor.createTensor(
            ambiente,
            FloatBuffer.wrap(vettori),
            longArrayOf(1, VETTORI.toLong(), DIMENSIONE.toLong()),
        ).use { ingresso ->
            classificatore.run(mapOf(ingressoClassificatore to ingresso)).use { esito ->
                val piatta = (esito.get(0) as OnnxTensor).floatBuffer
                if (piatta.remaining() < 1) null else piatta.get(0)
            }
        }
    }

    /**
     * Dimentica quello che ha sentito finora.
     *
     * ⛔ Si chiama dopo un'attivazione e dopo aver ripreso il microfono: senza,
     * i sedici vettori che hanno fatto scattare la parola restano in canna e la
     * fanno riscattare da soli.
     */
    fun azzera() {
        java.util.Arrays.fill(coda, 0f)
        java.util.Arrays.fill(magazzino, 1f)
        java.util.Arrays.fill(vettori, 0f)
        quanti = 0
    }

    fun chiudi() {
        runCatching { classificatore.close() }
        runCatching { vettoriale.close() }
        runCatching { mel.close() }
    }

    companion object {

        /**
         * ⛔ La scala su cui il classificatore è stato addestrato: `soundfile`
         * restituisce -1..1, quindi i short vanno divisi per il fondo scala.
         * Vedi la nota in testa al file per la misura che l'ha stabilito.
         */
        private const val SCALA_PIENA = 32768f

        /*
         * ⛔ `TalosOrecchioParola` e non `TalosOrecchio`: quel marchio E' GIA'
         * USATO da un altro pezzo dell'app, e nel registro del telefono le due
         * voci si mescolavano — misurato subito, `TalosOrecchio: web: consegna:
         * freddo` in mezzo ai punteggi della parola. Due componenti diversi
         * sotto lo stesso nome rendono il registro inutilizzabile proprio
         * quando serve.
         */
        private const val MARCHIO = "TalosOrecchioParola"

        /** 80 ms a 16 kHz: è il passo su cui l'embedding è stato addestrato. */
        const val CAMPIONI_PER_BLOCCO = 1280

        /** I tre salti da 160 che il modello mel perde alla finestra. */
        private const val SGUARDO_INDIETRO = 480

        private const val FINESTRA_MEL = 76
        private const val BANDE = 32
        private const val VETTORI = 16
        private const val DIMENSIONE = 96

        private const val NOME_MEL = "input"
        private const val NOME_EMBEDDING = "input_1"

        private const val CARTELLA = "parola"

        /**
         * ⭐⭐ Apre i tre modelli. `parola` è il nome del file del
         * classificatore dentro `assets/parola/`.
         *
         * ⛔ Il nome dell'ingresso del classificatore si LEGGE dalla sessione e
         * non si scrive qui: i modelli di openWakeWord lo chiamano `x.1`, quelli
         * addestrati con `livekit-wakeword` lo chiamano `embeddings`. Leggerlo è
         * ciò che permette di sostituire la parola senza toccare il codice — che
         * è esattamente quello che faremo quando «hey TALOS» sarà pronto.
         */
        fun apri(assets: AssetManager, parola: String): TalosOrecchio? {
            val ambiente = OrtEnvironment.getEnvironment()
            return runCatching {
                val opzioni = OrtSession.SessionOptions()
                /*
                 * ⛔ UN thread, e non è avarizia. Questo gira per ore su un
                 * telefono in tasca: i tre modelli insieme sono qualche
                 * millisecondo ogni 80, e un secondo thread comprerebbe una
                 * latenza che non serve pagando batteria che serve.
                 */
                opzioni.setIntraOpNumThreads(1)
                opzioni.setInterOpNumThreads(1)

                val fabbrica = { nome: String ->
                    ambiente.createSession(assets.open("$CARTELLA/$nome").use { it.readBytes() }, opzioni)
                }
                val mel = fabbrica("melspectrogram.onnx")
                val vettoriale = fabbrica("embedding_model.onnx")
                val classificatore = fabbrica(parola)
                val ingresso = classificatore.inputNames.first()
                Log.i(
                    MARCHIO,
                    "aperti: mel=${mel.inputNames} emb=${vettoriale.inputNames} " +
                        "parola=$parola ingresso=$ingresso uscita=${classificatore.outputNames}",
                )
                TalosOrecchio(ambiente, mel, vettoriale, classificatore, ingresso)
            }.getOrElse {
                Log.e(MARCHIO, "i modelli non si sono aperti: ${it.javaClass.simpleName}: ${it.message}")
                null
            }
        }
    }
}
