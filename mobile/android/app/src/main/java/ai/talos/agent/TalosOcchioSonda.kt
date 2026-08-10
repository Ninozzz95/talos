package ai.talos.agent

import android.accessibilityservice.AccessibilityService
import android.os.SystemClock
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * ⛔ SONDA, NON FUNZIONE — 2026-08-10.
 *
 * Owner: «non partiamo se non abbiamo tutte le misurazioni e tutti i dubbi
 * chiusi al 100 per cento». Questo file esiste per chiuderne TRE in un colpo, e
 * per essere buttato o promosso dopo:
 *
 * **1. Quanto costa l'albero in-process.** `uiautomator dump` costa 2.216 ms
 * misurati, ed e' il 71% della percezione, perche' avvia un processo a ogni
 * giro. Qui l'albero e' una richiamata: si stampa in logcat il tempo di
 * `rootInActiveWindow` + la visita completa.
 *
 * **2. Se si puo' scrivere l'italiano.** `input text 'perché'` muore con
 * `NullPointerException: Attempt to get length of null array` — misurato. Un
 * servizio di accessibilita' scrive con `ACTION_SET_TEXT`, che passa una
 * stringa vera e non una sequenza di tasti: qui si prova con accenti e
 * apostrofi.
 *
 * **3. Se il dito si sente.** I nostri tocchi iniettati sono invisibili a
 * `getevent` (0 righe su due tocchi). Manca la meta' che serve una mano:
 * `TYPE_TOUCH_INTERACTION_START` deve arrivare quando l'owner tocca. Se arriva,
 * il freno «mi hai toccato, mi fermo» e' gratis.
 *
 * ⛔ Non tocca niente e non decide niente: guarda, misura, scrive in logcat.
 * Si legge con `adb logcat -s TalosOcchio`.
 */
class TalosOcchioSonda : AccessibilityService() {

    override fun onServiceConnected() {
        Log.i(TAG, "sonda agganciata")
        misuraAlbero("all-aggancio")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val tipo = event?.eventType ?: return
        if (tipo == AccessibilityEvent.TYPE_TOUCH_INTERACTION_START) {
            // ⭐ IL DITO. Se questa riga compare quando l'owner tocca lo schermo
            // — e NON quando tocchiamo noi con `input tap` — il freno e' fatto.
            Log.i(TAG, "DITO: TYPE_TOUCH_INTERACTION_START da ${event.packageName}")
            return
        }
        if (tipo == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            Log.i(TAG, "schermata cambiata: ${event.packageName}")
            misuraAlbero("dopo-cambio-schermata")
        }
    }

    override fun onInterrupt() {
        Log.i(TAG, "interrotta")
    }

    /**
     * Il numero che decide l'architettura: quanto costa avere l'albero QUI,
     * senza avviare un processo.
     */
    private fun misuraAlbero(quando: String) {
        val t0 = SystemClock.uptimeMillis()
        val radice = rootInActiveWindow
        val tRadice = SystemClock.uptimeMillis() - t0
        if (radice == null) {
            Log.i(TAG, "$quando: radice NULLA dopo $tRadice ms")
            return
        }
        var nodi = 0
        var toccabili = 0
        var conTesto = 0
        val pila = ArrayDeque<AccessibilityNodeInfo>()
        pila.addLast(radice)
        while (pila.isNotEmpty()) {
            val n = pila.removeLast()
            nodi += 1
            if (n.isClickable) toccabili += 1
            if (!n.text.isNullOrEmpty() || !n.contentDescription.isNullOrEmpty()) conTesto += 1
            for (i in 0 until n.childCount) n.getChild(i)?.let { pila.addLast(it) }
        }
        val tTotale = SystemClock.uptimeMillis() - t0
        Log.i(
            TAG,
            "$quando: radice ${tRadice} ms, visita completa ${tTotale} ms, " +
                "nodi=$nodi toccabili=$toccabili conTesto=$conTesto",
        )
        provaAScrivere(radice)
    }

    /**
     * ⛔ La prova che vale: un campo di testo accetta l'italiano accentato?
     * Si cerca un campo modificabile e gli si mette dentro una stringa che
     * `input text` non sa scrivere.
     */
    private fun provaAScrivere(radice: AccessibilityNodeInfo) {
        val campo = trovaCampo(radice) ?: run {
            Log.i(TAG, "scrittura: nessun campo modificabile su questa schermata")
            return
        }
        val argomenti = android.os.Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                "perché è così, però",
            )
        }
        val t0 = SystemClock.uptimeMillis()
        val fatto = campo.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, argomenti)
        Log.i(
            TAG,
            "scrittura accentata: esito=$fatto in ${SystemClock.uptimeMillis() - t0} ms " +
                "(campo: ${campo.className})",
        )
    }

    private fun trovaCampo(radice: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val pila = ArrayDeque<AccessibilityNodeInfo>()
        pila.addLast(radice)
        while (pila.isNotEmpty()) {
            val n = pila.removeLast()
            if (n.isEditable) return n
            for (i in 0 until n.childCount) n.getChild(i)?.let { pila.addLast(it) }
        }
        return null
    }

    private companion object {
        const val TAG = "TalosOcchio"
    }
}
