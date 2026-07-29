package ai.talos;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Owner 2026-07-24: per-theme launcher icon switching (activity-alias toggles).
        registerPlugin(TalosAppIconPlugin.class);
        // Debt S2: FLAG_SECURE control (recents thumbnail / screenshots).
        registerPlugin(TalosPrivacyPlugin.class);
        // Owner 2026-07-26: fingerprint unlock for a PIN-encrypted database —
        // a second wrapping of the SAME key, bound to biometrics in hardware.
        registerPlugin(TalosBiometricKeyPlugin.class);
        // R-1b: keeps long operations alive when the app is backgrounded.
        registerPlugin(TalosRunServicePlugin.class);
        registerPlugin(TalosDevicePermissionsPlugin.class);
        // Owner 2026-07-28: durable, user-chosen Save-As for encrypted Library
        // files. The plugin accepts only TALOS's private export staging path.
        registerPlugin(TalosFileExportPlugin.class);
        // Android per-app language state; JS remains the catalog owner.
        registerPlugin(TalosLocalePlugin.class);
        // Arbitrary model-selected page reads use DNS-pinned public addresses
        // and per-hop redirect validation, never unrestricted Capacitor HTTP.
        registerPlugin(TalosSafeWebPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
