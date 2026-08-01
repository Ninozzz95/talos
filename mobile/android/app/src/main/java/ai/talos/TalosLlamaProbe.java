package ai.talos;

/**
 * Cosa significa che un backend ha dato la risposta GIUSTA.
 *
 * {@link TalosBenchmarkHarness} pretende un booleano — `answerCorrect` — e lo
 * controlla per primo, perché un backend veloce e sbagliato non è veloce, è
 * rotto. Questa classe è la definizione di quel booleano, e la definizione non
 * è ovvia.
 *
 * Non è «il modello ha risposto bene»: un modello da 135 milioni di parametri
 * sbaglia le domande e non è colpa del backend. È «questo backend ha prodotto
 * LO STESSO testo della CPU», che è la cosa che i driver GPU rotti su Android
 * non riescono a fare — restituiscono spazzatura plausibile invece di fallire.
 * La CPU è il riferimento e non deve dimostrare niente, esattamente come dice
 * {@link TalosBackendChoice}.
 *
 * Pura: nessun JNI, nessun Android. La regola si dimostra sulla JVM prima che
 * esista un telefono che la debba obbedire.
 */
public final class TalosLlamaProbe {

    /**
     * Quanti caratteri del confronto contano.
     *
     * Non tutto il testo, e il motivo è aritmetico: backend diversi sommano in
     * ordine diverso, quindi due esecuzioni entrambe corrette divergono prima o
     * poi anche con campionamento greedy. Una divergenza al primo token è un
     * driver rotto; una al centesimo è la virgola mobile. Confrontare tutto
     * scarterebbe backend sani, confrontare un carattere accetterebbe quelli
     * rotti.
     */
    static final int COMPARED_PREFIX = 48;

    private TalosLlamaProbe() {}

    /**
     * Il prompt della prova.
     *
     * Deve produrre abbastanza token da soddisfare il minimo dell'harness (32)
     * senza dipendere da quanto il modello sia bravo: chiede una continuazione,
     * non una risposta esatta.
     */
    public static final String PROMPT = "Count slowly from one to twenty, one number per line.";

    /**
     * Il TETTO dei token, non l'obiettivo.
     *
     * A fermare la prova è il tempo, non il conteggio
     * ({@link TalosLlamaEngine#MEASURE_FLOOR_MS}): un conteggio fisso misura
     * finestre diverse su telefoni diversi, ed è esattamente il modo in cui una
     * misura smette di voler dire qualcosa. Questo numero esiste solo perché
     * una generazione senza tetto non finirebbe mai.
     */
    public static final int TOKENS = 1024;

    /**
     * Il candidato concorda col riferimento?
     *
     * Un testo vuoto non concorda mai, nemmeno con un riferimento vuoto: un
     * backend che non produce niente ha fallito, e due silenzi non sono un
     * accordo.
     */
    public static boolean agreesWithReference(String reference, String candidate) {
        if (reference == null || candidate == null) return false;
        String left = reference.trim();
        String right = candidate.trim();
        if (left.isEmpty() || right.isEmpty()) return false;
        int compared = Math.min(COMPARED_PREFIX, Math.min(left.length(), right.length()));
        // Se uno dei due si ferma prima del prefisso confrontabile, la lunghezza
        // stessa è la divergenza: un backend che produce tre caratteri dove la
        // CPU ne produce cento non ha "concordato sui primi tre".
        if (left.length() < COMPARED_PREFIX || right.length() < COMPARED_PREFIX) {
            if (left.length() != right.length()) return false;
        }
        return left.regionMatches(0, right, 0, compared);
    }

    /**
     * La CPU è il pavimento: le si chiede solo di aver prodotto qualcosa.
     *
     * Non ha un riferimento contro cui essere confrontata — è lei il
     * riferimento — e un'app che conclude che nemmeno la CPU funziona è
     * un'app che non fa niente.
     */
    public static boolean referenceIsUsable(String reference) {
        return reference != null && !reference.trim().isEmpty();
    }

    /** Il verdetto dell'harness, tradotto nella prova che la scelta consuma. */
    public static TalosBackendChoice.Evidence evidenceOf(
            String backend, String driver, TalosBenchmarkHarness.Result result) {
        return new TalosBackendChoice.Evidence(
                backend, driver,
                TalosBenchmarkHarness.outcomeOf(result),
                result.tokensPerSecond);
    }
}
