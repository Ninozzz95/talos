package ai.talos;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * ⛔⛔ L'accettazione delle condizioni del software Qualcomm, e la regola che
 * accende l'NPU solo se c'è.
 *
 * ## Perché esiste (owner, 01/10/2026)
 *
 * Il PKLA di Qualcomm (QTIL) permette di distribuire il codice oggetto dentro
 * TALOS (2.1 b) solo «pursuant to a binding agreement» con chi lo usa, con
 * restrizioni simili alle sue (sezioni 3, 9 e 13). L'owner ha deciso che
 * l'NPU entra nella release e che si fa tutto il possibile per rispettare il
 * contratto: il testo che l'utente accetta è `npu-qualcomm-v1`, approvato da
 * lui il 01/10/2026 (`.claude/conformita/NPU-QUALCOMM-CONDIZIONI-v1.md`).
 *
 * ## Perché qui, nel nativo
 *
 * Il blocco vale solo se sta dove l'NPU si tocca davvero: il caricamento del
 * modulo ({@link TalosLlamaNative}), la prova dei motori e l'apertura
 * ({@link TalosLlamaPlugin}). Un errore dell'interfaccia non deve poterlo
 * aggirare: senza accettazione il modulo NPU non viene nemmeno caricato.
 *
 * ## Il registro è la prova (PKLA 12)
 *
 * Si conservano versione, impronta sha256 del testo mostrato, lingua, versione
 * dell'app e data. Un testo nuovo cambia {@link #VERSION} e chiede una nuova
 * accettazione.
 */
public final class TalosNpuTerms {

    /** La versione delle condizioni in vigore. Cambia SOLO con un testo nuovo approvato dall'owner. */
    public static final String VERSION = "npu-qualcomm-v1";

    private static final String PREFS = "talos_npu_terms";

    private TalosNpuTerms() {}

    /** Un'accettazione registrata. */
    public static final class Record {
        public final String version;
        public final String textSha256;
        public final String locale;
        public final String appVersion;
        public final long acceptedAtMs;

        public Record(String version, String textSha256, String locale, String appVersion, long acceptedAtMs) {
            this.version = version;
            this.textSha256 = textSha256;
            this.locale = locale;
            this.appVersion = appVersion;
            this.acceptedAtMs = acceptedAtMs;
        }
    }

    /**
     * Se con questa accettazione l'NPU si può usare.
     *
     * ⛔ Nel dubbio no: nessun record, una versione diversa da quella in vigore,
     * o un record senza l'impronta del testo (che non proverebbe COSA è stato
     * accettato) tengono l'NPU spenta.
     */
    public static boolean allowsNpu(Record record, String currentVersion) {
        return record != null
                && currentVersion != null
                && currentVersion.equals(record.version)
                && record.textSha256 != null
                && !record.textSha256.isEmpty()
                && record.acceptedAtMs > 0;
    }

    /** L'accettazione registrata su questo dispositivo, o null. */
    public static Record load(Context context) {
        if (context == null) return null;
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String version = prefs.getString("version", null);
        if (version == null) return null;
        return new Record(
                version,
                prefs.getString("textSha256", ""),
                prefs.getString("locale", ""),
                prefs.getString("appVersion", ""),
                prefs.getLong("acceptedAtMs", 0L));
    }

    /** Se le condizioni in vigore sono accettate su questo dispositivo. */
    public static boolean accepted(Context context) {
        return allowsNpu(load(context), VERSION);
    }

    /** Registra un'accettazione. `commit()`, non `apply()`: chi chiama poi carica l'NPU e deve trovarla scritta. */
    public static boolean accept(Context context, Record record) {
        if (context == null || record == null) return false;
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("version", record.version)
                .putString("textSha256", record.textSha256)
                .putString("locale", record.locale)
                .putString("appVersion", record.appVersion)
                .putLong("acceptedAtMs", record.acceptedAtMs)
                .commit();
    }

    /**
     * Ritira il consenso. Il modulo già caricato non si può scaricare da ggml:
     * da qui in poi l'apertura e la prova rifiutano l'NPU, e al prossimo avvio
     * il modulo non viene più caricato.
     */
    public static boolean withdraw(Context context) {
        if (context == null) return false;
        // Chi ritira il consenso non vuole che la proposta gli torni davanti da sola.
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .clear()
                .putBoolean("promptDeclined", true)
                .commit();
    }

    /**
     * «Non ora» sulla proposta automatica (owner, 01/10/2026: le condizioni si
     * mostrano UNA volta, alla scelta del modello; chi risponde «Non ora» le
     * ritrova in Modelli e non le vede più comparire da sole).
     */
    public static boolean declinePrompt(Context context) {
        if (context == null) return false;
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putBoolean("promptDeclined", true)
                .commit();
    }

    /** Se la proposta automatica è già stata rifiutata su questo dispositivo. */
    public static boolean promptDeclined(Context context) {
        if (context == null) return false;
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("promptDeclined", false);
    }
}
