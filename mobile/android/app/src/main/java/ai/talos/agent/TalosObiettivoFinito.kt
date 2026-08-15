package ai.talos.agent

import android.view.accessibility.AccessibilityNodeInfo

/**
 * ⭐⭐⭐ «È PARTITO DAVVERO?» — la finalizzazione dell'obiettivo, per QUALSIASI app.
 *
 * ## La richiesta
 *
 * Owner 2026-08-15: «mi piacerebbe dopo l'invio una conferma da parte della
 * chat, perché "invio un messaggio a Shadina" non significa che l'abbia inviato
 * veramente. Dobbiamo inventare… un sistema di finalizzazione dell'obiettivo
 * **dinamico per tutte le app**».
 *
 * ## Perché quello che avevamo non basta
 *
 * C'era UNA prova: il pulsante premuto sparisce. È vera e utile — un pulsante
 * «invia» che se ne va di solito vuol dire che ha fatto effetto — ma è **una
 * euristica sola**, e una sola euristica è una scommessa:
 *
 *  · un pulsante può sparire perché la schermata è cambiata per altro;
 *  · può restare visibile in app che lo tengono sempre a schermo;
 *  · può non avere né `viewId` né testo (i pulsanti di chiamata di WhatsApp).
 *
 * ⇒ E il costo dello sbaglio non è simmetrico: dire «inviato» quando non lo è
 * fa perdere alla persona un messaggio che credeva partito. È il difetto che
 * l'owner nomina dal 13 agosto.
 *
 * ## ⛔ LE TRE PROVE, e perché la seconda è quella forte
 *
 * ```
 * 1. IL CAMPO SI È SVUOTATO     il testo non sta più in un nodo `isEditable`
 * 2. IL TESTO È MIGRATO         lo stesso testo ora sta in un nodo NON modificabile
 * 3. IL PULSANTE È SPARITO      quello che già facevamo
 * ```
 *
 * La **2** è la prova universale, e non ha niente di scritto a mano: in
 * qualunque app di messaggistica un messaggio inviato **cambia natura** — smette
 * di essere una bozza modificabile e diventa un pezzo di conversazione, cioè un
 * nodo che non si può più editare. Nessun elenco di pacchetti, nessuna regola
 * per WhatsApp: si guarda il testo e si guarda dov'è finito.
 *
 * ⛔ Da sola nemmeno la 2 basta: alcune app mostrano l'anteprima del testo in un
 * nodo non modificabile mentre lo stai ancora scrivendo. Per questo si contano.
 *
 * ## Il verdetto, e i suoi TRE stati
 *
 * ```
 * campo ancora pieno             → NON PARTITO      (certezza negativa)
 * due prove su tre               → PARTITO
 * una sola prova                 → NON CONFERMATO   (e si dice così)
 * ```
 *
 * ⛔ Tre stati e non due: «non confermato» è una risposta vera che la persona
 * può usare — «guarda tu» — mentre costringere a scegliere fra «inviato» e
 * «fallito» obbliga a mentire una volta su due. È la stessa lezione di
 * `ok-false-su-un-elenco-fa-inventare`.
 */
object TalosObiettivoFinito {

    enum class Verdetto {
        /** Il campo è ancora pieno: il gesto non ha avuto effetto. */
        NON_PARTITO,

        /** Almeno due prove indipendenti concordano. */
        PARTITO,

        /** Una prova sola: può essere andata, e non lo sappiamo. */
        NON_CONFERMATO,
    }

    data class Esito(
        val verdetto: Verdetto,
        val campoSvuotato: Boolean,
        val testoMigrato: Boolean,
        val pulsanteSparito: Boolean,
    ) {
        /** Le prove che hanno detto sì, per il registro e per la spiegazione. */
        val prove: Int
            get() = (if (campoSvuotato) 1 else 0) +
                (if (testoMigrato) 1 else 0) +
                (if (pulsanteSparito) 1 else 0)
    }

    /**
     * Il testo sta in un nodo che si può ancora modificare?
     *
     * ⛔ `isEditable` e non il nome della classe: `EditText` è solo una delle
     * implementazioni, e le app scritte in Compose non ne usano nessuna. La
     * proprietà è ciò che il sistema promette all'accessibilità, ed è l'unica
     * cosa vera in tutte e due i mondi.
     */
    private fun inUnCampoModificabile(radice: AccessibilityNodeInfo, testo: String): Boolean {
        val atteso = testo.trim()
        if (atteso.isEmpty()) return false
        val trovati = radice.findAccessibilityNodeInfosByText(atteso) ?: return false
        return trovati.any { nodo ->
            nodo.isEditable && (nodo.text?.toString()?.trim() == atteso)
        }
    }

    /**
     * Il testo è comparso in un nodo che NON si può modificare — cioè è
     * diventato un pezzo di conversazione invece di una bozza.
     *
     * ⛔ Si esclude il nodo modificabile con lo stesso testo: mentre scrivi,
     * molte app mostrano un'anteprima. Quello che conta è che ne esista uno
     * **non** modificabile, ed è ciò che prima dell'invio non c'era.
     */
    private fun diventatoConversazione(radice: AccessibilityNodeInfo, testo: String): Boolean {
        val atteso = testo.trim()
        if (atteso.isEmpty()) return false
        val trovati = radice.findAccessibilityNodeInfosByText(atteso) ?: return false
        return trovati.any { nodo ->
            !nodo.isEditable && (nodo.text?.toString()?.trim()?.contains(atteso) == true)
        }
    }

    /**
     * Guarda lo schermo e dice se l'obiettivo è finito.
     *
     * @param pulsanteSparito l'esito della prova che facevamo già, passato da
     *   chi ha premuto — questa funzione non ripete quel lavoro.
     */
    fun verifica(
        radice: AccessibilityNodeInfo?,
        testo: String,
        pulsanteSparito: Boolean,
    ): Esito {
        if (radice == null) {
            // ⛔ Senza schermo non si giudica: dire «partito» qui sarebbe la
            // bugia più facile, e dire «non partito» accuserebbe senza prove.
            return Esito(Verdetto.NON_CONFERMATO, false, false, pulsanteSparito)
        }

        val ancoraNelCampo = inUnCampoModificabile(radice, testo)
        val campoSvuotato = !ancoraNelCampo
        val migrato = diventatoConversazione(radice, testo)

        /*
         * ⛔ IL CAMPO ANCORA PIENO VINCE SU TUTTO. Se il testo è lì da
         * modificare, quel messaggio non è partito — non importa quante altre
         * prove sembrino dire di sì. È l'unica certezza negativa che abbiamo,
         * e vale più di due indizi.
         */
        if (ancoraNelCampo) {
            return Esito(Verdetto.NON_PARTITO, false, migrato, pulsanteSparito)
        }

        val esito = Esito(Verdetto.NON_CONFERMATO, campoSvuotato, migrato, pulsanteSparito)
        return if (esito.prove >= 2) esito.copy(verdetto = Verdetto.PARTITO) else esito
    }
}
