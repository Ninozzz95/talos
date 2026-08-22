package ai.talos;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Pure allowlist for the Android per-app locale bridge. Keeping this outside
 * the Capacitor plugin makes malformed JS input testable without Android.
 */
final class TalosLocalePolicy {

    private static final Set<String> MODES = new HashSet<>(Arrays.asList(
        "system", "en", "it"
    ));

    private TalosLocalePolicy() {}

    static String requireMode(String mode) {
        if (mode == null || !MODES.contains(mode)) {
            throw new IllegalArgumentException("TALOS_LOCALE_MODE_UNSUPPORTED");
        }
        return mode;
    }

    static String applicationLanguageTag(String mode) {
        String accepted = requireMode(mode);
        return "system".equals(accepted) ? "" : accepted;
    }
}
