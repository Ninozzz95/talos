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
     * ⛔⛔ QUESTA STRADA È CHIUSA, e resta scritta perché non la riprovi nessuno.
     *
     * MISURATO col dito dell'owner il 2026-08-10: `TYPE_TOUCH_INTERACTION_START`
     * **non arriva**. Android lo consegna solo a un servizio che chiede
     * l'esplorazione al tocco — che cambierebbe il modo in cui la persona usa il
     * telefono (un tocco legge, due attivano). Per accorgersi di una mano non si
     * stravolge il telefono di quella mano.
     *
     * ⇒ Il dito si sente al livello GREZZO: vedi `TalosDitoVero`.
     */
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

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
        if (SystemClock.uptimeMillis() - sguardoAl > VITA_SGUARDO_MS) return "sguardoVecchio"
        val e = elenco.getOrNull(indice) ?: return "indiceFuoriElenco"
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

        @Volatile private var vivo: TalosOcchio? = null
        @Volatile private var sguardo: List<Elemento> = emptyList()
        @Volatile private var sguardoAl: Long = 0
        fun aperto(): TalosOcchio? = vivo
    }
}
