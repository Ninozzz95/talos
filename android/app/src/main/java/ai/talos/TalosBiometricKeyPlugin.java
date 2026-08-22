package ai.talos;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.concurrent.Executor;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Owner 2026-07-26: "quando chiudo e riapro l'app non mi chiede il biometrics
 * ... mi chiede solo pin."
 *
 * That was not a UI bug. TALOS encrypts its database with a random key that is
 * WRAPPED by a key derived from the PIN (owner decision: the PIN is the key,
 * there is no recovery). A fingerprint carries no material a PBKDF2 derivation
 * can use, so the lock screen deliberately refused biometrics whenever the
 * database was protected — which is always, once the user sets a PIN.
 *
 * The fix is the one the platform documents: wrap the SAME database key a
 * second time, with an AES-256-GCM key that lives in the Android Keystore and
 * is bound to the user's biometrics in hardware. The private key material never
 * enters this process — `Cipher` is handed to `BiometricPrompt` inside a
 * `CryptoObject`, and the Keystore only lets it operate after a successful
 * authentication. Reading the wrapped blob off the device buys an attacker
 * nothing; there is no copy of the unwrapping key to steal.
 *
 * Chosen over "authenticate, then read a plain key out of secure storage",
 * which the available plugins would have made trivial: that key is readable by
 * anything running as this app, so on a rooted device the fingerprint becomes
 * decoration. The owner picked the hardware binding knowing it cost native code.
 *
 * Two deliberate properties:
 *  - `setInvalidatedByBiometricEnrollment(true)`: enrolling a new fingerprint
 *    destroys the key. Someone who can add their own finger to a stolen phone
 *    must not inherit access to the data; TALOS falls back to the PIN, which is
 *    the honest outcome.
 *  - `setUserAuthenticationRequired(true)` with no validity window: every single
 *    unwrap costs a fresh authentication. No "unlocked for 30 seconds" grace.
 */
@CapacitorPlugin(name = "TalosBiometricKey")
public class TalosBiometricKeyPlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "talos.db.biometric.kek.v1";
    private static final String TRANSFORMATION =
            KeyProperties.KEY_ALGORITHM_AES + "/" + KeyProperties.BLOCK_MODE_GCM
                    + "/" + KeyProperties.ENCRYPTION_PADDING_NONE;
    private static final int TAG_BITS = 128;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        final JSObject result = new JSObject();
        result.put("available", strongBiometryReady());
        result.put("enrolled", hasStoredKey());
        call.resolve(result);
    }

    /** Wraps a secret under a freshly created, biometry-bound Keystore key. */
    @PluginMethod
    public void wrap(PluginCall call) {
        final String secret = call.getString("secret");
        if (secret == null || secret.isEmpty()) {
            call.reject("TALOS_BIO_KEY_SECRET_MISSING");
            return;
        }
        if (!strongBiometryReady()) {
            call.reject("TALOS_BIO_KEY_UNAVAILABLE");
            return;
        }
        try {
            // Re-created every time the user re-arms biometrics, so a stale key
            // from a previous enrolment can never be reused.
            deleteStoredKey();
            final SecretKey key = createKey();
            final Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            authenticate(call, cipher, "Confirm it is you to enable fingerprint unlock", result -> {
                try {
                    final Cipher authorized = result.getCryptoObject() == null
                            ? null
                            : result.getCryptoObject().getCipher();
                    if (authorized == null) {
                        call.reject("TALOS_BIO_KEY_NO_CIPHER");
                        return;
                    }
                    final byte[] sealed = authorized.doFinal(secret.getBytes("UTF-8"));
                    final JSObject payload = new JSObject();
                    payload.put("iv", Base64.encodeToString(authorized.getIV(), Base64.NO_WRAP));
                    payload.put("sealed", Base64.encodeToString(sealed, Base64.NO_WRAP));
                    call.resolve(payload);
                } catch (Exception failure) {
                    call.reject("TALOS_BIO_KEY_WRAP_FAILED", failure);
                }
            });
        } catch (Exception failure) {
            call.reject("TALOS_BIO_KEY_WRAP_FAILED", failure);
        }
    }

    /** Unwraps it again, which the Keystore permits only after a live scan. */
    @PluginMethod
    public void unwrap(PluginCall call) {
        final String iv = call.getString("iv");
        final String sealed = call.getString("sealed");
        if (iv == null || sealed == null) {
            call.reject("TALOS_BIO_KEY_PAYLOAD_MISSING");
            return;
        }
        try {
            final SecretKey key = loadStoredKey();
            if (key == null) {
                call.reject("TALOS_BIO_KEY_ABSENT");
                return;
            }
            final Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key,
                    new GCMParameterSpec(TAG_BITS, Base64.decode(iv, Base64.NO_WRAP)));
            authenticate(call, cipher, "Unlock TALOS", result -> {
                try {
                    final Cipher authorized = result.getCryptoObject() == null
                            ? null
                            : result.getCryptoObject().getCipher();
                    if (authorized == null) {
                        call.reject("TALOS_BIO_KEY_NO_CIPHER");
                        return;
                    }
                    final byte[] plain = authorized.doFinal(Base64.decode(sealed, Base64.NO_WRAP));
                    final JSObject payload = new JSObject();
                    payload.put("secret", new String(plain, "UTF-8"));
                    call.resolve(payload);
                } catch (Exception failure) {
                    call.reject("TALOS_BIO_KEY_UNWRAP_FAILED", failure);
                }
            });
        } catch (KeyPermanentlyInvalidatedException invalidated) {
            // A fingerprint was added or removed since the key was created. The
            // wrapped copy is now undecryptable BY DESIGN — say so plainly so
            // the caller drops it and falls back to the PIN instead of retrying.
            deleteStoredKey();
            call.reject("TALOS_BIO_KEY_INVALIDATED", invalidated);
        } catch (Exception failure) {
            call.reject("TALOS_BIO_KEY_UNWRAP_FAILED", failure);
        }
    }

    /** Forgetting the key makes every existing wrapped copy permanently dead. */
    @PluginMethod
    public void forget(PluginCall call) {
        deleteStoredKey();
        call.resolve();
    }

    private interface Authorized {
        void run(BiometricPrompt.AuthenticationResult result);
    }

    private void authenticate(PluginCall call, Cipher cipher, String title, Authorized onSuccess) {
        final FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) {
            call.reject("TALOS_BIO_KEY_NO_ACTIVITY");
            return;
        }
        activity.runOnUiThread(() -> {
            final Executor executor = androidx.core.content.ContextCompat.getMainExecutor(activity);
            final BiometricPrompt prompt = new BiometricPrompt(activity, executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override
                        public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                            onSuccess.run(result);
                        }

                        @Override
                        public void onAuthenticationError(int code, CharSequence message) {
                            // A cancel is not a failure of the app: the caller
                            // shows the PIN pad, which always works.
                            if (code == BiometricPrompt.ERROR_USER_CANCELED
                                    || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                    || code == BiometricPrompt.ERROR_CANCELED) {
                                call.reject("TALOS_BIO_KEY_CANCELLED");
                                return;
                            }
                            call.reject("TALOS_BIO_KEY_ERROR_" + code, message == null ? "" : message.toString());
                        }
                    });
            final BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle("Your data stays encrypted on this device")
                    // No device-credential fallback here on purpose: the PIN
                    // that opens TALOS is the app's own, not the phone's, and
                    // offering the phone's would unlock nothing.
                    .setNegativeButtonText("Use PIN")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .setConfirmationRequired(false)
                    .build();
            prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
        });
    }

    private boolean strongBiometryReady() {
        try {
            final int status = BiometricManager.from(getContext())
                    .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG);
            return status == BiometricManager.BIOMETRIC_SUCCESS;
        } catch (Exception ignored) {
            return false;
        }
    }

    private SecretKey createKey() throws Exception {
        final KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        final KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Adding a finger on a stolen phone must not inherit the data.
            spec.setInvalidatedByBiometricEnrollment(true);
        }
        generator.init(spec.build());
        return generator.generateKey();
    }

    private SecretKey loadStoredKey() throws Exception {
        final KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    private boolean hasStoredKey() {
        try {
            return loadStoredKey() != null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void deleteStoredKey() {
        try {
            final KeyStore store = KeyStore.getInstance(KEYSTORE);
            store.load(null);
            if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // Nothing to forget, or the Keystore is unavailable: either way the
            // caller's next wrap starts from scratch.
        }
    }
}
