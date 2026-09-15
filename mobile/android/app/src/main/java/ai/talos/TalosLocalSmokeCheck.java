package ai.talos;

import java.util.Locale;

/**
 * P0-3 — Q0, il livello che oggi non esiste: "il motore si apre e risponde
 * per davvero", senza il costo di Q1 (poche run comunque, ma un confronto
 * CPU/GPU completo con `MAX_PROBE_ATTEMPTS` tentativi) né tantomeno di Q2 (9
 * run, banco di ricerca).
 *
 * ⛔ CR-06 del piano sorgente (BLOCCANTE): "La distinzione Q0/Q1/Q2 è
 * mandatory... nessun 9-run/sustained sweep automatico al primo 'ciao'".
 * Verificato sul codice REALE prima di scrivere qui: Q1 (TalosLlamaPlugin.
 * runQualification) esiste già ed è già bounded — {@code MAX_PROBE_ATTEMPTS
 * = 4}, mai 9 — e Q2 (TalosLocalBaselineDeviceTest) esiste già come
 * androidTest, strutturalmente irraggiungibile da un APK di produzione. Il
 * gap vero non era "i tre livelli", era che Q0 non esisteva come un passo a
 * sé — la sonda "il modello funziona affatto" restava annegata dentro Q1,
 * che costa un giro CPU+GPU completo per scoprire un fallimento che una
 * generazione di sedici token avrebbe già detto.
 *
 * ⛔ Piano sorgente, §8.3: "open, semantic tiny golden, short PP, short TG,
 * Stop smoke... Non produce 'massimo profilo' se la campagna è troppo
 * corta" — Q0 NON scrive in {@link TalosLocalProfileStore}: un verdetto
 * PASSED qui dice solo "questo backend non è rotto", non "questo backend è
 * il più veloce", e le due frasi non vanno confuse nello stesso store.
 *
 * Pura: nessun JNI, nessun Android. Il verdetto si dimostra sulla JVM prima
 * che esista un telefono che lo debba applicare — stesso principio di
 * {@link TalosLlamaProbe} e {@link TalosBackendChoice}.
 */
public final class TalosLocalSmokeCheck {

    private TalosLocalSmokeCheck() {}

    /**
     * Il "semantic tiny golden": non un'istruzione, un COMPLETAMENTO — stesso
     * genere del prompt di {@link TalosLlamaProbe} ("Count slowly..."), non
     * per caso.
     *
     * ⛔⛔ MISURATO sul Pad: il primo tentativo era un'istruzione esplicita
     * ("Reply with exactly one word: OK."), passata a
     * {@link TalosLlamaEngine#run} — che genera in modalità completamento
     * grezzo, SENZA il chat template che {@link TalosLlamaEngine#chatPrompt}
     * applica altrove. Un modello in modalità completamento non "obbedisce"
     * a un'istruzione dentro il testo, la CONTINUA come narrativa: la
     * risposta reale è stata {@code " \n\nIf the user says \"I need to find
     * a way to improve my English"} — non un modello rotto, un prompt che
     * chiedeva instruction-following a un motore che non lo stava dando.
     * Un fatto elementare ("la capitale della Francia è") non ha questo
     * problema: qualunque modello con training generico lo completa
     * correttamente anche in modalità raw, esattamente come "Count slowly"
     * funziona senza bisogno di un ruolo "assistant".
     */
    public static final String PROMPT = "The capital of France is";

    /** Il TETTO, non l'obiettivo — Q0 è "breve" per definizione (piano sorgente, §8.3). */
    public static final int MAX_TOKENS = 16;

    /**
     * Quanto aspettare prima di chiedere lo Stop.
     *
     * ⛔ Non zero e non "dopo che ha finito": uno smoke che annulla PRIMA che
     * la generazione sia partita non prova niente sullo Stop, e uno che
     * annulla DOPO la fine naturale prova solo che un cancel su un motore
     * già fermo non esplode (utile, ma un'altra prova). 300 ms cade dentro
     * il prefill su un TTFT CPU misurato a ~500 ms su questo device
     * (P0-2, ttftMs=501) — "Stop durante il prefill" è il caso che il banco
     * di ricerca chiama STOP-prefill, e che questo smoke eredita a costo
     * quasi zero.
     *
     * ⛔⛔ MISURATO sul Pad: con questo prompt di OTTO token (molto più corto
     * di quello di Q1) il cancel a 300 ms NON cade più a colpo sicuro
     * durante il prefill — un giro reale ha troncato la generazione DOPO
     * che qualche token era già uscito, dando un GOLDEN_MISMATCH che non
     * era "il modello ha sbagliato", era "l'ho interrotto prima che
     * finisse". Per questo il golden e lo Stop sono due giri SEPARATI (vedi
     * {@link TalosLlamaPlugin#runSmokeCheck}): confonderli in un solo
     * tentativo tronca il primo per misurare il secondo.
     */
    public static final long STOP_DELAY_MS = 300;

    /**
     * Il budget di latenza dello Stop. Non lo stesso tetto usato altrove nel
     * progetto per un motore GPU sotto carico prolungato (quello misura
     * decine di secondi in scenari patologici) — qui il motore è aperto da
     * pochi istanti su un prompt minuscolo, e uno Stop che impiega più di
     * cinque secondi in QUESTE condizioni è un segnale di guasto, non di
     * lentezza normale.
     */
    public static final long STOP_BUDGET_MS = 5_000;

    public enum Verdict {
        /** Il motore si apre, risponde correttamente, e si ferma quando richiesto. */
        PASSED,
        /** {@link TalosLlamaEngine#tryOpen} non ha prodotto un motore. */
        OPEN_FAILED,
        /** La generazione non ha prodotto nessun testo utilizzabile. */
        EMPTY_OUTPUT,
        /** Il testo non contiene il fatto atteso — il completamento non è quello di un modello sano. */
        GOLDEN_MISMATCH,
        /** Lo Stop è arrivato, ma oltre il budget. */
        STOP_TOO_SLOW,
    }

    /**
     * Non byte-identity: "Paris" può arrivare con punteggiatura, maiuscole
     * diverse, o dentro una frase più lunga se il modello continua oltre il
     * fatto stesso. Quello che conta è che il completamento CORRETTO ci sia
     * — la stessa tolleranza pragmatica di
     * {@link TalosLlamaProbe#agreesWithReference}, adattata a un confronto
     * con un valore noto invece che con un secondo backend.
     */
    public static boolean goldenMatches(String text) {
        return text != null && text.toLowerCase(Locale.ROOT).contains("paris");
    }

    /**
     * Il verdetto, da fatti già misurati — niente qui tocca un motore o un
     * orologio.
     *
     * @param text la risposta di un giro COMPLETO, mai troncato dal cancel
     *     di questa stessa classe — vedi {@link #STOP_DELAY_MS} per il
     *     motivo per cui i due giri sono separati.
     * @param stopLatencyMs la latenza di un secondo giro, dedicato SOLO allo
     *     Stop — il testo che produce non conta qui, solo quanto ci mette il
     *     motore a tornare dopo il cancel.
     */
    public static Verdict judge(String text, long stopLatencyMs) {
        if (text == null || text.trim().isEmpty()) return Verdict.EMPTY_OUTPUT;
        if (!goldenMatches(text)) return Verdict.GOLDEN_MISMATCH;
        if (stopLatencyMs > STOP_BUDGET_MS) return Verdict.STOP_TOO_SLOW;
        return Verdict.PASSED;
    }
}
