package ai.talos.agent

/**
 * Come si riconosce che il ponte c'è ma **nessuno è dall'altra parte**.
 *
 * ## Perché sta in un file suo, senza una riga di Android
 *
 * Perché è l'unica parte del ponte che si può provare senza un telefono, e
 * perché è quella che ha sbagliato. Il 2026-08-09 `shell()` guardava una frase
 * sola — «no devices» — e `adb` ne usa **tre** a seconda di come è caduta la
 * connessione. Le altre due passavano come errori generici, il riaggancio non
 * partiva, e ogni comando privilegiato degradava al pannello di sistema.
 *
 * Una condizione scritta dentro una funzione che lancia processi non si prova;
 * scritta qui, si prova con una stringa.
 */
object TalosPonteStato {

    /**
     * I modi in cui `adb` dice «non ho un dispositivo».
     *
     * ⛔ Sono tre e non uno: mai stabilita (`no devices`), caduta mentre era
     * aperta (`device offline`), o un riferimento rimasto a un indirizzo che non
     * risponde più (`device not found`). Guardarne una sola vuol dire non
     * riagganciare negli altri due casi — e quelli sono esattamente ciò che
     * succede dopo il riavvio dell'app o del telefono.
     */
    private val SEGNI = listOf("no devices", "device offline")

    /**
     * ⛔ Vero SOLO se il comando è fallito: `adb` scrive «device offline» anche
     * in righe informative mentre le cose funzionano, e trattare quello come
     * uno scollegamento farebbe rifare l'aggancio a ogni comando riuscito —
     * cioè sei secondi di scoperta buttati ogni volta.
     */
    @JvmStatic
    fun staccato(riuscito: Boolean, errore: String): Boolean {
        if (riuscito) return false
        if (SEGNI.any { errore.contains(it, ignoreCase = true) }) return true
        /*
         * ⛔ Il terzo caso NON è una frase: è una frase con l'INDIRIZZO in
         * mezzo — `device '192.0.2.95:33331' not found`. La prima versione
         * cercava «device not found» come stringa unica e non lo trovava mai;
         * l'ha scoperto il test, non il telefono.
         */
        return errore.contains("device", ignoreCase = true)
            && errore.contains("not found", ignoreCase = true)
    }
}
