package ai.talos;

/**
 * ⭐⭐⭐ IL CONTRATTO A TEMPO — il modello non si butta alla prima occasione.
 *
 * Prima, appena l'app usciva dallo schermo ({@code TRIM_MEMORY_UI_HIDDEN}), il
 * modello veniva scaricato — anche col telefono pieno di memoria libera. E
 * riaprirlo, misurato sul Pad, costa quattro secondi caldi e quasi nove a
 * freddo: tutto il costo sta nell'apertura, non nella generazione. Chi cambiava
 * app per un attimo e tornava li pagava tutti.
 *
 * ⛔ Ma il commento vecchio aveva ragione su un punto: tenere gigabyte mentre si
 * e in secondo piano e un motivo in piu per essere uccisi dal sistema. Le due
 * verita non si escludono — si conciliano con un TEMPO.
 *
 * <pre>
 * l'app esce dallo schermo (UI_HIDDEN)
 *     |
 *     +-- pressione VERA di memoria?  --> scarica subito, al confine sicuro
 *     |
 *     +-- no pressione               --> parte un contratto a tempo
 *                                         |
 *                                         +-- si torna in primo piano --> annulla
 *                                         +-- il tempo scade          --> scarica
 *                                         +-- arriva pressione vera    --> scarica
 * </pre>
 *
 * ## ⛔ Perché due soglie diverse, e non una
 *
 * Lo stato dell'arte (2026) e chiaro: la KV cache si rilascia gia a
 * {@code RUNNING_LOW}, il modello INTERO solo a {@code COMPLETE}. E {@code
 * UI_HIDDEN} non e pressione — e un'occasione, e un'occasione non e un ordine.
 *
 * ## ⛔ Questa classe NON ha lo stato del modello, e non deve
 *
 * Decide soltanto: «di fronte a questo segnale, e ora di scaricare?». Chi possiede
 * il motore resta il plugin. Una decisione pura si prova con una tabella di casi,
 * senza un telefono e senza un modello caricato — ed e l'unico modo di essere
 * sicuri che la parte pericolosa (liberare gigabyte al momento sbagliato) faccia
 * sempre la cosa giusta.
 *
 * ⛔ Il tempo si INIETTA (`adesso`): un contratto che legge l'orologio di sistema
 * non si puo provare senza aspettare davvero, e un test che aspetta e un test che
 * qualcuno spegne.
 */
final class TalosContrattoCaldo {

    /** ComponentCallbacks2, dichiarate qui: i nomi valgono piu dei numeri. */
    static final int TRIM_MEMORY_RUNNING_LOW = 10;
    static final int TRIM_MEMORY_UI_HIDDEN = 20;
    static final int TRIM_MEMORY_COMPLETE = 80;

    /**
     * ⛔ NON MISURATO come ottimo: e un punto di partenza ragionato, non tarato.
     *
     * Trenta secondi coprono il caso vero — si esce per rispondere a un messaggio,
     * si controlla una cosa, si torna — senza tenere gigabyte per minuti mentre il
     * sistema cerca memoria. Va rivisto guardando quanto spesso, sul Pad, un
     * ritorno entro questa finestra trova ancora il modello caldo.
     */
    static final long DURATA_PREDEFINITA_MS = 30_000L;

    private final long durataMs;
    /** Quando scade il contratto in corso, o -1 se non ce n'e uno. */
    private long scadenza = -1;

    TalosContrattoCaldo() {
        this(DURATA_PREDEFINITA_MS);
    }

    TalosContrattoCaldo(long durataMs) {
        this.durataMs = durataMs;
    }

    /**
     * Un segnale di memoria e arrivato. Torna {@code true} se il modello va
     * scaricato ORA.
     *
     * ⛔ Durante una generazione non si decide qui: chi chiama rinvia prima di
     * arrivarci, perche liberare il contesto sotto chi decodifica e un crash, non
     * un risparmio. Questa classe presume di essere chiamata a motore fermo.
     */
    boolean vaScaricato(int level, long adesso) {
        // ⛔ Pressione VERA: si scarica subito, e un eventuale contratto in corso
        // non conta piu. RUNNING_LOW e peggio vogliono dire che il sistema sta
        // gia cercando memoria mentre siamo ancora davanti.
        if (level >= TRIM_MEMORY_RUNNING_LOW && level < TRIM_MEMORY_UI_HIDDEN) {
            scadenza = -1;
            return true;
        }
        if (level >= TRIM_MEMORY_COMPLETE) {
            scadenza = -1;
            return true;
        }

        // ⛔ UI_HIDDEN esatto: non e pressione. Se non c'e gia un contratto, se ne
        // apre uno e NON si scarica. Se ce n'e uno e il tempo e passato, si
        // scarica. Un secondo UI_HIDDEN non prolunga il contratto: la finestra
        // parte da quando si e usciti, non da ogni segnale.
        if (level == TRIM_MEMORY_UI_HIDDEN) {
            if (scadenza < 0) {
                scadenza = adesso + durataMs;
                return false;
            }
            if (adesso >= scadenza) {
                scadenza = -1;
                return true;
            }
            return false;
        }

        // Sotto UI_HIDDEN: nessuna pressione, nessuna occasione. Non si tocca
        // niente, e un contratto in corso resta in corso.
        return false;
    }

    /**
     * Si e tornati in primo piano: il contratto si annulla e il modello resta.
     *
     * ⛔ Va chiamato all'uso locale che torna, non solo al ritorno visivo: se la
     * persona apre una chat col modello locale, quel modello NON deve sparire fra
     * un secondo perche un vecchio contratto stava per scadere.
     */
    void ripreso() {
        scadenza = -1;
    }

    /** C'e un contratto in corso? Serve solo a chi vuole raccontarlo, non a decidere. */
    boolean contrattoAperto() {
        return scadenza >= 0;
    }
}
