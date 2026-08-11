package ai.talos.agent

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * ⭐⭐ L'OCCHIO: quello che TALOS vede, e la mano con cui tocca.
 *
 * Nasce dalla sonda del 2026-08-10, che ha chiuso tre dubbi in un colpo e
 * adesso diventa la funzione. I numeri che l'hanno decisa, misurati sul Pad:
 *
 * | come si guarda            | costo      |
 * |---------------------------|------------|
 * | `uiautomator dump`        | 2.216 ms   |
 * | questo, in-process        | **2-26 ms** |
 *
 * ⇒ ~100 volte. Con `dump` la percezione era il 71% del giro; adesso è nulla, e
 * il collo di bottiglia è il modello.
 *
 * ## ⛔ Si agisce sul NODO, non sul pixel
 *
 * I benchmark convertono l'indice in coordinate e iniettano un tocco: resta
 * un'ultima traduzione che sbaglia sugli elementi parzialmente coperti. Qui
 * `ACTION_CLICK` va **sul nodo**. Nessuna coordinata, in nessun punto.
 *
 * E per scrivere: `input text 'perché'` muore con
 * `NullPointerException: Attempt to get length of null array` — misurato.
 * `ACTION_SET_TEXT` scrive l'italiano vero in 2-6 ms, verificato leggendo il
 * campo dopo (`text="perché è così, però"`).
 *
 * ## ⛔ Gli indici sono di QUESTO sguardo, non eterni
 *
 * Ogni `interattivi()` rinumera e conserva i nodi visti. Un indice di uno
 * sguardo vecchio non si esegue: lo schermo intanto è cambiato, e toccare il
 * numero 4 di ieri è il modo esatto di comprare qualcosa per sbaglio.
 */
class TalosOcchio : AccessibilityService() {

    /** Cosa il pilota può toccare, con l'indice che gli abbiamo dato. */
    data class Elemento(
        val indice: Int,
        val tipo: String,
        val etichetta: String,
        val attivo: Boolean?,
        val nodo: AccessibilityNodeInfo,
    )

    override fun onServiceConnected() {
        vivo = this
        Log.i(TAG, "occhio aperto")
    }

    override fun onDestroy() {
        if (vivo === this) vivo = null
        super.onDestroy()
    }

    override fun onInterrupt() {
        if (vivo === this) vivo = null
    }

    /**
     * ⭐⭐ IL FRENO CHE NON CHIEDE LA SHELL: la mano si sente dagli EVENTI.
     *
     * Il freno grezzo (`TalosDitoVero`) legge `/dev/input`, e `/dev/input` vuole
     * l'identità della shell. Su un telefono senza il ponte acceso quel freno non
     * si arma, e il pilota **si rifiutava di partire**: la funzione esisteva solo
     * per chi aveva già fatto un giro nelle impostazioni di sviluppo. Qui c'è il
     * freno che funziona ovunque, perché si appoggia al servizio che il pilota
     * richiede comunque per esistere.
     *
     * ⇒ **Se TALOS può vedere lo schermo, TALOS può sentire la tua mano.**
     *
     * ## Le misure che l'hanno deciso (Pad, 11 agosto)
     *
     * | cosa succede                     | cosa arriva qui              |
     * |----------------------------------|------------------------------|
     * | nessuno tocca, 8 secondi         | **0 eventi** — silenzio vero |
     * | un dito su un elemento           | `TYPE_VIEW_CLICKED`          |
     * | un dito che scorre               | 6 × `TYPE_VIEW_SCROLLED`     |
     * | un dito **sul vuoto**            | **0 eventi** ⛔ vedi sotto   |
     * | un tocco di TALOS                | `TYPE_VIEW_CLICKED` a +5-27 ms |
     *
     * ⛔⛔ PRIMA misura fallita, e va detta: il filtro del servizio dichiarava
     * `typeWindowStateChanged|typeWindowContentChanged|typeTouchInteractionStart`
     * — `typeViewClicked` **non c'era**. Il 2026-08-10 ne avevo concluso «gli
     * eventi non arrivano»: non arrivavano perché non li avevamo chiesti. Il
     * servizio non era sordo, era **tappato**.
     *
     * ## ⛔ Il nostro tocco e quello della persona sono IDENTICI per tipo
     *
     * `performAction(ACTION_CLICK)` produce lo stesso `TYPE_VIEW_CLICKED` di un
     * dito: misurato. Quindi non si distingue dal **cosa**, si distingue dal
     * **quando** — e il quando lo sappiamo perché l'azione la facciamo noi.
     * Dopo ogni nostra azione si è sordi per [SORDITA_MS]; fuori da quella
     * finestra, un evento di interazione è una mano.
     *
     * I 400 ms sono ~15 volte il ritardo peggiore misurato (27 ms su quattro
     * tocchi: 9, 27, 5, 13) e restano un'inezia rispetto ai **secondi** che
     * passano fra un passo e l'altro, che è il tempo in cui una mano arriva
     * davvero. Il rischio residuo è simmetrico e va nominato: un tocco della
     * persona nei 400 ms dopo il nostro non ferma la corsa. Ne bastano due, e
     * chi vuole riprendersi il telefono non tocca una volta sola.
     *
     * ## ⛔ IL LIMITE, misurato e non nascosto
     *
     * Un dito appoggiato dove non c'è niente di interattivo non produce nessun
     * evento — provato anche tenendolo premuto un secondo. Questo freno sente
     * ogni tocco che **fa qualcosa**; il freno grezzo sente ogni tocco e basta.
     * Per questo i due convivono e `frenoTipo` dice quale è in servizio: un
     * freno che promette più di quel che sente è peggio di nessun freno.
     */
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val tipo = event?.eventType ?: return
        if (tipo and INTERAZIONI == 0) return
        if (SystemClock.uptimeMillis() - nostraAzioneAl <= SORDITA_MS) return
        manoVista = true
    }

    /**
     * Lo sguardo: gli elementi con cui si può interagire, numerati.
     *
     * ⛔ Si scartano gli invisibili e quelli senza riquadro — `validate_ui_element`
     * di AndroidWorld fa lo stesso, e per lo stesso motivo: sono nell'albero ma
     * non a schermo, e toccarli non fa niente o fa qualcosa altrove.
     */
    fun interattivi(): List<Elemento> {
        val radice = rootInActiveWindow ?: return emptyList()
        val fuori = mutableListOf<Elemento>()
        val pila = ArrayDeque<AccessibilityNodeInfo>()
        pila.addLast(radice)
        while (pila.isNotEmpty()) {
            val n = pila.removeLast()
            for (i in 0 until n.childCount) n.getChild(i)?.let { pila.addLast(it) }
            if (!n.isVisibleToUser) continue
            val riquadro = android.graphics.Rect().also { n.getBoundsInScreen(it) }
            if (riquadro.width() <= 0 || riquadro.height() <= 0) continue
            val tipo = when {
                n.isEditable -> "campo"
                n.isCheckable -> "interruttore"
                n.isScrollable -> "scorri"
                n.isClickable || n.isLongClickable -> "tocca"
                else -> continue
            }
            val etichetta = (n.text ?: n.contentDescription ?: "").toString().trim()
            fuori.add(
                Elemento(
                    indice = fuori.size,
                    tipo = tipo,
                    etichetta = etichetta,
                    attivo = if (n.isCheckable) n.isChecked else null,
                    nodo = n,
                ),
            )
        }
        sguardo = fuori
        sguardoAl = SystemClock.uptimeMillis()
        return fuori
    }

    /**
     * Esegue sul nodo. Torna `null` se è andata, o il motivo se no.
     *
     * ⛔ Il motivo è una stringa parlante e non un booleano: «false» costringe
     * chi sta sopra a indovinare, e su un agente che tocca un telefono altrui
     * indovinare è il difetto.
     */
    fun esegui(indice: Int, azione: String, testo: String?): String? {
        val elenco = sguardo
        if (elenco.isEmpty()) return "nessunoSguardo"
        val atteso = elenco.getOrNull(indice) ?: return "indiceFuoriElenco"
        /*
         * ⛔⛔ SCADUTO NON VUOL DIRE PERDUTO: si RIGUARDA e si confronta.
         *
         * MISURATO sul Pad il 2026-08-10, prima corsa vera del pilota: ogni
         * passo costa una chiamata al modello — SECONDI — e mezzo secondo di
         * vita dello sguardo era finito da un pezzo quando l'azione arrivava.
         * Esito: `sguardoVecchio` a ogni singolo passo, il tetto del tempo che
         * scatta dopo due passi, e un pilota che non arriva mai da nessuna
         * parte. Il tetto ha funzionato; la funzione no.
         *
         * ⛔ E la cura NON è allungare la vita dello sguardo: sarebbe toccare
         * su una schermata che non c'è più, cioè il difetto che quei 500 ms
         * esistono per impedire. Si riguarda, e si tocca solo se all'indice
         * c'è ANCORA la stessa cosa — stesso tipo e stessa etichetta. Se lo
         * schermo è cambiato si risponde `schermoCambiato`, e chi guida
         * riguarda: costa 16 ms e non compra niente per sbaglio.
         */
        val e = if (SystemClock.uptimeMillis() - sguardoAl > VITA_SGUARDO_MS) {
            val adesso = interattivi().getOrNull(indice) ?: return "schermoCambiato"
            if (adesso.tipo != atteso.tipo || adesso.etichetta != atteso.etichetta) {
                return "schermoCambiato"
            }
            adesso
        }
        else {
            atteso
        }
        // ⛔ Si marca PRIMA di toccare: fra la marcatura e l'evento passano
        // 5-27 ms, e marcare dopo lascerebbe fuori proprio l'evento nostro.
        segnaNostraAzione()
        val fatto = when (azione) {
            "tocca" -> e.nodo.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            "scrivi" -> {
                if (testo == null) return "testoMancante"
                e.nodo.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                e.nodo.performAction(
                    AccessibilityNodeInfo.ACTION_SET_TEXT,
                    Bundle().apply {
                        putCharSequence(
                            AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                            testo,
                        )
                    },
                )
            }
            "scorri" -> e.nodo.performAction(
                AccessibilityNodeInfo.ACTION_SCROLL_FORWARD,
            )
            else -> return "azioneSconosciuta"
        }
        // ⛔ Lo sguardo si INVALIDA subito: dopo un'azione lo schermo cambia, e
        // un indice di prima non vale piu' niente. Chi vuole agire ancora deve
        // riguardare — che e' anche la verifica dell'effetto.
        sguardo = emptyList()
        return if (fatto) null else "rifiutata"
    }

    /** Dopo un'azione di sistema lo schermo cambia: gli indici non valgono piu'. */
    fun dimenticaSguardo() {
        sguardo = emptyList()
    }

    companion object {
        private const val TAG = "TalosOcchio"

        /**
         * ⛔ Mezzo secondo. Uno sguardo piu' vecchio di cosi' descrive uno
         * schermo che probabilmente non c'e' piu': meglio riguardare (costa
         * 16 ms) che toccare al buio.
         */
        private const val VITA_SGUARDO_MS = 500L

        /**
         * ⛔ Quanto si resta sordi dopo una NOSTRA azione.
         *
         * MISURATO su quattro tocchi (Pad, 11 agosto): l'evento del nostro
         * tocco arriva dopo 9, 27, 5, 13 ms. Quattrocento è quindici volte il
         * peggiore — largo abbastanza da non sentirsi da soli anche quando il
         * telefono è occupato, e stretto abbastanza da essere invisibile fra
         * due passi che costano secondi.
         */
        private const val SORDITA_MS = 400L

        /**
         * Solo gli eventi che vuol dire «qualcuno ha INTERAGITO».
         *
         * ⛔ Fuori restano `TYPE_WINDOW_CONTENT_CHANGED` e
         * `TYPE_WINDOW_STATE_CHANGED`: sono conseguenze, non tocchi, e arrivano
         * a raffica anche quando TALOS apre un'app da solo. Un freno che li
         * ascoltasse si fermerebbe da sé al primo passo.
         */
        private val INTERAZIONI = AccessibilityEvent.TYPE_VIEW_CLICKED or
            AccessibilityEvent.TYPE_VIEW_LONG_CLICKED or
            AccessibilityEvent.TYPE_VIEW_SCROLLED or
            AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED

        @Volatile private var vivo: TalosOcchio? = null
        @Volatile private var sguardo: List<Elemento> = emptyList()
        @Volatile private var sguardoAl: Long = 0
        @Volatile private var nostraAzioneAl: Long = 0
        @Volatile private var manoVista: Boolean = false

        fun aperto(): TalosOcchio? = vivo

        /**
         * Da adesso in poi, un'interazione è una mano.
         *
         * ⛔ Si azzera all'ARMAMENTO e non a ogni sguardo: un tocco arrivato
         * mentre il modello pensava deve sopravvivere fino al controllo, se no
         * il freno sente solo le mani abbastanza fortunate da toccare nel
         * millisecondo giusto.
         */
        fun armaIlFrenoDegliEventi() {
            manoVista = false
            nostraAzioneAl = SystemClock.uptimeMillis()
        }

        /** Marca l'istante di una nostra azione: da qui parte la sordità. */
        fun segnaNostraAzione() {
            nostraAzioneAl = SystemClock.uptimeMillis()
        }

        /** Una mano ha interagito da quando il freno è stato armato? */
        fun manoVistaDagliEventi(): Boolean = manoVista
    }
}
