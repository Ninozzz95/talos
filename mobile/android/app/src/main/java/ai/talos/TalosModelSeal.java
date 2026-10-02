package ai.talos;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;

/**
 * ⭐ IL SIGILLO DEL MODELLO — l'impronta di un GGUF si calcola UNA volta,
 * quando il file entra, e all'apertura si confrontano solo i dati di `stat`.
 *
 * ## Perché (misurato sul Pad il 01/10/2026)
 *
 * Rileggere tutto il file per riconoscerlo costava 24-29 s (2,5 GB) a ogni
 * apertura di una chat: l'impronta serve ai profili di velocità
 * ({@link TalosLocalProfileIdentity}), e veniva ricalcolata ogni volta.
 *
 * ## Il metodo, preso da chi lo fa da vent'anni
 *
 * - git (racy-git, git-scm.com/docs/racy-git): nell'indice si tengono i dati di
 *   `lstat` — dimensione, data, inode — e si rilegge solo se cambiano. Un file
 *   modificato nello stesso secondo del salvataggio è «racily clean»: la data
 *   non basta a dire che non è cambiato dopo, e non ci si fida.
 * - Hugging Face e Ollama calcolano l'impronta UNA volta, quando il file arriva.
 * Noi la prendiamo dal download (calcolata mentre scarica, verificata contro
 * quella pubblicata) o dalla copia dell'importazione: zero letture in più.
 *
 * ⛔ Nel dubbio il sigillo non vale e si ricalcola: dimensione, data, inode o
 * dispositivo diversi, o un sigillo nato nello stesso secondo della modifica.
 */
public final class TalosModelSeal {

    private static final String PREFS = "talos_model_seal";

    private TalosModelSeal() {}

    /** I dati di `stat` che bastano a dire «è lo stesso file». */
    public static final class Stat {
        public final long bytes;
        public final long mtimeMs;
        public final long inode;
        public final long device;

        public Stat(long bytes, long mtimeMs, long inode, long device) {
            this.bytes = bytes;
            this.mtimeMs = mtimeMs;
            this.inode = inode;
            this.device = device;
        }
    }

    /** Un'impronta e il file a cui appartiene. */
    public static final class Seal {
        public final String sha256;
        public final Stat stat;
        /** {@code download}, {@code import} o {@code computed}. */
        public final String source;
        public final long sealedAtMs;

        public Seal(String sha256, Stat stat, String source, long sealedAtMs) {
            this.sha256 = sha256;
            this.stat = stat;
            this.source = source;
            this.sealedAtMs = sealedAtMs;
        }
    }

    /**
     * Se il sigillo vale ancora per il file com'è adesso.
     *
     * La regola racy-git: il sigillo deve essere nato in un secondo SUCCESSIVO a
     * quello dell'ultima modifica. Se sono nello stesso secondo, il file potrebbe
     * essere cambiato dopo il calcolo senza che la data lo mostri.
     */
    public static boolean stillValid(Seal seal, Stat now) {
        if (seal == null || now == null || seal.stat == null) return false;
        if (seal.sha256 == null || seal.sha256.isEmpty()) return false;
        Stat a = seal.stat;
        if (a.bytes != now.bytes || a.mtimeMs != now.mtimeMs
                || a.inode != now.inode || a.device != now.device) {
            return false;
        }
        return seal.sealedAtMs / 1000L > now.mtimeMs / 1000L;
    }

    /** I dati di `stat` di un file, o null se non si leggono. */
    public static Stat statOf(File file) {
        if (file == null || !file.isFile()) return null;
        try {
            android.system.StructStat s = android.system.Os.stat(file.getAbsolutePath());
            return new Stat(s.st_size, file.lastModified(), s.st_ino, s.st_dev);
        } catch (android.system.ErrnoException | RuntimeException illeggibile) {
            return null;
        }
    }

    /** L'impronta sigillata di questo file se il sigillo vale ancora; altrimenti null. */
    public static String sealedSha256(Context context, File file) {
        if (context == null || file == null) return null;
        Stat now = statOf(file);
        if (now == null) return null;
        Seal seal = load(context, file);
        return stillValid(seal, now) ? seal.sha256 : null;
    }

    /**
     * Sigilla un file con un'impronta calcolata da chi chiama (download,
     * importazione o calcolo completo). Lo `stat` si legge QUI, dopo il calcolo:
     * se il file è cambiato nel frattempo, la regola racy-git lo scoprirà.
     */
    public static void seal(Context context, File file, String sha256, String source) {
        if (context == null || file == null || sha256 == null || sha256.isEmpty()) return;
        Stat stat = statOf(file);
        if (stat == null) return;
        try {
            JSONObject json = new JSONObject()
                    .put("sha256", sha256.toLowerCase(java.util.Locale.ROOT))
                    .put("bytes", stat.bytes)
                    .put("mtimeMs", stat.mtimeMs)
                    .put("inode", stat.inode)
                    .put("device", stat.device)
                    .put("source", source == null ? "" : source)
                    .put("sealedAtMs", System.currentTimeMillis());
            prefs(context).edit().putString(file.getAbsolutePath(), json.toString()).apply();
        } catch (JSONException impossibile) {
            // Un sigillo non scritto vuol dire solo ricalcolare la volta dopo.
        }
    }

    private static Seal load(Context context, File file) {
        String raw = prefs(context).getString(file.getAbsolutePath(), null);
        if (raw == null) return null;
        try {
            JSONObject json = new JSONObject(raw);
            Stat stat = new Stat(json.getLong("bytes"), json.getLong("mtimeMs"),
                    json.getLong("inode"), json.getLong("device"));
            return new Seal(json.getString("sha256"), stat, json.optString("source", ""),
                    json.getLong("sealedAtMs"));
        } catch (JSONException rovinato) {
            return null;
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
