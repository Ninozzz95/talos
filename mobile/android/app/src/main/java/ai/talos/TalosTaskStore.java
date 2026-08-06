package ai.talos;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Le attività da eseguire, in un posto che un lavoro in background può leggere.
 *
 * <h2>Perché non basta il database</h2>
 *
 * ⛔ Il database di TALOS è cifrato con una chiave avvolta dal PIN, e il PIN
 * esiste soltanto nella testa di chi lo ha scelto — senza recupero, per
 * decisione dell'owner. Un lavoro che parte alle sette del mattino non ha modo
 * di chiederglielo.
 *
 * Quindi un'attività che deve girare quando nessuno guarda non può vivere solo
 * lì dentro. Ne serve una copia dove il sistema può arrivare da solo.
 *
 * <h2>Ma nemmeno in chiaro</h2>
 *
 * «Riassumi le mie note sul referto» è contenuto personale quanto una chat.
 * Metterlo in un file leggibile per comodità smentirebbe la promessa dell'app.
 *
 * Quindi si cifra con una chiave dell'**Android Keystore** che appartiene a
 * questa app: hardware-backed dove il telefono lo permette, e che non lascia
 * mai il processo. È la stessa posizione in cui vive già la chiave del database
 * **quando il blocco è spento** — cioè la postura di sicurezza non cambia, si
 * estende a un secondo contenitore.
 *
 * <h2>⛔ E quando il blocco è ACCESO</h2>
 *
 * Non si scrive niente qui. Con il blocco acceso la promessa è che senza il PIN
 * non si legge nulla, e una copia leggibile dal Keystore la contraddirebbe.
 * L'attività resta nel database e viene eseguita al primo sblocco: chi decide di
 * proteggere tutto accetta che «tutto» comprenda anche il lavoro automatico.
 * Sta al lato JavaScript non chiamare qui quando il blocco è acceso, e
 * all'interfaccia dirlo prima invece che dopo.
 */
final class TalosTaskStore {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "talos.tasks.v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;
    private static final String PREFS = "talos.tasks";
    private static final String ENTRIES = "entries";

    /** Un'attività programmata, con tutto ciò che serve a eseguirla da sola. */
    static final class Entry {
        final String id;
        final long nextRunAtMillis;
        final String modelPath;
        final String instruction;
        final String title;
        /**
         * L'impronta dell'ultimo risultato.
         *
         * ⛔ Serve a `onlyIfChanged`, che è la risposta al difetto più citato di
         * «Pianificare» di ChatGPT: notifiche ripetute e inutili. Si conserva
         * l'impronta e non il testo perché per rispondere «è cambiato?» basta
         * il confronto, e tenere meno è sempre meglio.
         */
        final String lastResultHash;
        final boolean onlyIfChanged;

        Entry(String id, long nextRunAtMillis, String modelPath, String instruction,
              String title, String lastResultHash, boolean onlyIfChanged) {
            this.id = id;
            this.nextRunAtMillis = nextRunAtMillis;
            this.modelPath = modelPath;
            this.instruction = instruction;
            this.title = title;
            this.lastResultHash = lastResultHash;
            this.onlyIfChanged = onlyIfChanged;
        }

        JSONObject toJson() throws JSONException {
            JSONObject row = new JSONObject();
            row.put("id", id);
            row.put("nextRunAtMillis", nextRunAtMillis);
            row.put("modelPath", modelPath);
            row.put("instruction", instruction);
            row.put("title", title == null ? "" : title);
            row.put("lastResultHash", lastResultHash == null ? "" : lastResultHash);
            row.put("onlyIfChanged", onlyIfChanged);
            return row;
        }

        static Entry fromJson(JSONObject row) {
            return new Entry(
                    row.optString("id", ""),
                    row.optLong("nextRunAtMillis", 0L),
                    row.optString("modelPath", ""),
                    row.optString("instruction", ""),
                    row.optString("title", ""),
                    row.optString("lastResultHash", ""),
                    row.optBoolean("onlyIfChanged", false));
        }
    }

    private TalosTaskStore() {}

    static synchronized List<Entry> read(Context context) {
        List<Entry> fuori = new ArrayList<>();
        String sealed = prefs(context).getString(ENTRIES, null);
        if (sealed == null) return fuori;
        try {
            JSONArray rows = new JSONArray(decrypt(sealed));
            for (int index = 0; index < rows.length(); index++) {
                Entry entry = Entry.fromJson(rows.getJSONObject(index));
                if (!entry.id.isEmpty()) fuori.add(entry);
            }
        } catch (Exception unreadable) {
            // Un magazzino illeggibile è vuoto, non è un guasto da propagare:
            // le attività vivono comunque nel database, e la copia qui è una
            // comodità per il sistema. Peggio sarebbe impedire l'avvio.
            return new ArrayList<>();
        }
        return fuori;
    }

    static synchronized void write(Context context, List<Entry> entries) {
        try {
            JSONArray rows = new JSONArray();
            for (Entry entry : entries) rows.put(entry.toJson());
            prefs(context).edit().putString(ENTRIES, encrypt(rows.toString())).apply();
        } catch (Exception refused) {
            // Non si scrive niente a metà: mezzo elenco di attività è peggio di
            // nessun elenco, perché qualcuna girerebbe e qualcuna no senza che
            // si capisca quale.
        }
    }

    /** Tutto via: il blocco è stato acceso, o l'utente ha tolto le attività. */
    static synchronized void clear(Context context) {
        prefs(context).edit().remove(ENTRIES).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        KeyStore.Entry existing = store.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // ⛔ Nessuna autenticazione richiesta: se ne servisse una, un
                // lavoro che parte alle sette del mattino non potrebbe leggere
                // niente — che è esattamente ciò che questa classe esiste per
                // evitare. La protezione qui è «solo questa app, su questo
                // telefono», non «solo con un dito sul sensore».
                .setUserAuthenticationRequired(false)
                .build());
        return generator.generateKey();
    }

    private static String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] sealed = cipher.doFinal(plain.getBytes("UTF-8"));
        // Il vettore di inizializzazione viaggia col testo cifrato: non è un
        // segreto, e senza di lui il testo non si riapre.
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP);
    }

    private static String decrypt(String sealed) throws Exception {
        int separator = sealed.indexOf(':');
        if (separator < 0) throw new IllegalArgumentException("malformed");
        byte[] iv = Base64.decode(sealed.substring(0, separator), Base64.NO_WRAP);
        byte[] body = Base64.decode(sealed.substring(separator + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
        return new String(cipher.doFinal(body), "UTF-8");
    }
}
