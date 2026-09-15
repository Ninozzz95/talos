package ai.talos;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Reading one secret from the app's own secure store, with no WebView alive.
 *
 * The download job runs for hours while the app is closed, and a gated
 * repository needs a Hugging Face token — which must NEVER travel in the job's
 * extras, because the system persists those in the clear and this app will be
 * distributed. So the job holds the NAME of a secret and fetches the value
 * itself, from the same Android Keystore the rest of the app already uses.
 *
 * Nothing new is invented here and nothing new is stored: this reads exactly
 * what `@aparajita/capacitor-secure-storage` wrote — same preferences file,
 * same alias, same AES/GCM transformation. Writing a second secret store beside
 * the working one would be two things to audit and two things to get wrong.
 *
 * The coupling is real and therefore PINNED: the library's key prefix is a fact
 * this class depends on, and a test fails if a dependency bump changes it,
 * rather than background downloads quietly losing their token.
 */
public final class TalosSecretReader {

    /** The library's own preferences file. Not ours to choose. */
    static final String PREFERENCES = "WSSecureStorageSharedPreferences";

    /** The library's default key prefix, pinned by TalosSecretReaderTest. */
    static final String PREFIX = "capacitor-storage_";

    /** Where the app keeps provider credentials — see services/secureKeyStore.ts. */
    static final String PROVIDER_KEY_PREFIX = "talos.provider.key.";

    private static final String KEY_STORE = "AndroidKeyStore";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final char DATA_IV_SEPARATOR = '';
    private static final int BASE64_FLAGS = Base64.NO_PADDING + Base64.NO_WRAP;
    private static final int TAG_BITS = 128;

    private TalosSecretReader() {}

    /** The Keystore alias for one provider's credential. */
    static String aliasForProvider(String provider) {
        return PREFIX + PROVIDER_KEY_PREFIX + provider;
    }

    /**
     * Split what the store wrote: base64 ciphertext, a separator, base64 IV.
     *
     * Null for anything that is not exactly two parts. A malformed entry is a
     * secret we do not have — which the caller treats as "download anonymously"
     * — and never a half-decrypted string handed to an HTTP header.
     */
    static String[] splitCiphertext(String stored) {
        if (stored == null) return null;
        String[] parts = stored.split(String.valueOf(DATA_IV_SEPARATOR), -1);
        if (parts.length != 2) return null;
        if (parts[0].isEmpty() || parts[1].isEmpty()) return null;
        return parts;
    }

    /**
     * The store writes JSON, so a string arrives wrapped in quotes.
     *
     * `SecureStorage.set` does `JSON.stringify` before handing the value down
     * (dist/esm/base.js) and `get` does `JSON.parse` on the way back, so the
     * JavaScript side round-trips cleanly and nothing looks wrong from there.
     * Reading it natively without unwrapping produced
     * `Authorization: Bearer "hf_xxx"` — quotes included — which the Hub rejects
     * on every authenticated request, silently turning a token nobody could see
     * was broken into a rate limit nobody could explain.
     *
     * Found by an adversarial review, 2026-08-01. The guard beside it pinned the
     * key prefix and the cipher and never the ENCODING — it missed the one
     * property that actually breaks.
     */
    static String unwrapJson(String stored) {
        if (stored == null) return null;
        String value = stored;
        if (value.length() >= 2 && value.charAt(0) == '"' && value.charAt(value.length() - 1) == '"') {
            value = value.substring(1, value.length() - 1)
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
        }
        return value.isEmpty() ? null : value;
    }

    /**
     * The token, or null.
     *
     * Null is an ordinary answer, not a failure: most repositories are public
     * and most users will never set one. The caller downloads anonymously and
     * the Hub says plainly when that is not enough.
     */
    public static String providerKey(Context context, String provider) {
        String alias = aliasForProvider(provider);
        try {
            SharedPreferences preferences =
                    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
            String[] parts = splitCiphertext(preferences.getString(alias, null));
            if (parts == null) return null;

            KeyStore keyStore = KeyStore.getInstance(KEY_STORE);
            keyStore.load(null);
            KeyStore.SecretKeyEntry entry = (KeyStore.SecretKeyEntry) keyStore.getEntry(alias, null);
            if (entry == null) return null;

            byte[] data = Base64.decode(parts[0], BASE64_FLAGS);
            byte[] iv = Base64.decode(parts[1], BASE64_FLAGS);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, entry.getSecretKey(), new GCMParameterSpec(TAG_BITS, iv));
            return unwrapJson(new String(cipher.doFinal(data), "UTF-8"));
        } catch (Exception unreadable) {
            // A locked, wiped or re-keyed Keystore reads as "no token". Throwing
            // here would turn a public download into a crash.
            return null;
        }
    }
}
