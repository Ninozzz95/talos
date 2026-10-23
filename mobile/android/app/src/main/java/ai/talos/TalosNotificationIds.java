package ai.talos;

/**
 * Tutti gli id delle notifiche di TALOS, in un posto solo (N0, 21/10/2026, D-N0-5).
 *
 * La `NotificationManager` è una sola e il tag è sempre nullo: due notifiche con lo stesso id si sostituiscono. Prima ognuno
 * sceglieva il suo numero e si scontravano: il servizio dei giri e quello della parola d'attivazione avevano entrambi 4711 (chi
 * si fermava per secondo toglieva la notifica in primo piano dell'altro), le attività pianificate 4900-5899 stavano dentro il
 * centro 5000-104999 e la prima era uguale al suo ripiego 4900, la barra dei download (jobId da 100000) stava dentro il centro.
 *
 * Forma presa dal registro notizia ↔ id di Thunderbird (`feature/notification/api/.../NotificationRegistry.kt:13-71`), in piccolo:
 * qui solo gli intervalli, e `TalosNotificationIdsTest` prova che non si toccano.
 */
public final class TalosNotificationIds {
    /** Il codice d'accoppiamento del debug wireless (`agent/TalosAccoppiamentoNotifica`). */
    public static final int PAIRING = 4127;
    /** Il riassunto del gruppo dei download. */
    public static final int TRANSFER_SUMMARY = 4700;
    /** Il servizio in primo piano dei giri (`TalosRunService`). */
    public static final int RUN = 4711;
    /** La barra di un download senza jobId. */
    public static final int TRANSFER_BAR = 4712;
    /** Il servizio in primo piano della parola d'attivazione (`parola/TalosParola`): era 4711 come `RUN`. */
    public static final int VOICE = 4713;
    /** La fine di una ricerca. */
    public static final int RESEARCH = 4801;
    /** La fine di un download col ponte vecchio, senza jobId. */
    public static final int TRANSFER_DONE_LEGACY = 4802;
    /** L'aggiornamento dell'app: «pronta» e poi «aggiornata», la stessa notifica che cambia. */
    public static final int AGGIORNAMENTO = 4803;

    /** Le attività pianificate: 4900 + |hash % 1000|. */
    public static final int[] TASKS = {4900, 5899};
    /** La barra di un download: il suo jobId (`TalosTransferJournal`, 100000 + 800000). */
    public static final int[] TRANSFER_BARS = {100_000, 899_999};
    /** La fine di un download: 1000000 + jobId. */
    public static final int[] TRANSFER_DONE = {1_000_000, 1_999_999};
    /** Le notizie del registro dentro l'app (`TalosNotificationCentre`), per chiave. */
    public static final int[] CENTRE = {2_000_000, 9_999_999};
    /** Le notifiche della sveglia dal PC (`remoto/TalosSvegliaAvvisi.idNotifica`): sha256 su 30 bit, sopra 2^30. */
    public static final int SVEGLIA_MIN = 0x40000000;
    public static final int[] SVEGLIA = {SVEGLIA_MIN, Integer.MAX_VALUE};

    /** Tutti, singoli e intervalli: è ciò che la prova confronta a due a due. */
    static final int[][] INTERVALLI = {
            {PAIRING, PAIRING},
            {TRANSFER_SUMMARY, TRANSFER_SUMMARY},
            {RUN, RUN},
            {TRANSFER_BAR, TRANSFER_BAR},
            {VOICE, VOICE},
            {RESEARCH, RESEARCH},
            {TRANSFER_DONE_LEGACY, TRANSFER_DONE_LEGACY},
            {AGGIORNAMENTO, AGGIORNAMENTO},
            TASKS,
            TRANSFER_BARS,
            TRANSFER_DONE,
            CENTRE,
            SVEGLIA,
    };

    private TalosNotificationIds() {}

    /** La formula di sempre (revisione avversaria 7): cambiarla lascerebbe due notifiche della stessa attività dopo l'aggiornamento. */
    public static int task(String id) {
        return TASKS[0] + Math.abs((id == null ? 0 : id.hashCode()) % (TASKS[1] - TASKS[0] + 1));
    }

    public static int transferBar(int jobId) {
        return jobId;
    }

    public static int transferDone(int jobId) {
        return TRANSFER_DONE[0] + Math.floorMod(jobId, TRANSFER_DONE[1] - TRANSFER_DONE[0] + 1);
    }

    /**
     * Un id stabile per la stessa chiave, e diverso per chiavi diverse. La collisione di `hashCode` resta possibile ma innocua: due
     * notizie che si sostituiscono a vicenda sono un fastidio raro, un id che cambia a ogni aggiornamento è dieci notifiche per un
     * download.
     */
    public static int centre(String key) {
        return CENTRE[0] + Math.floorMod(key == null ? 0 : key.hashCode(), CENTRE[1] - CENTRE[0] + 1);
    }
}
