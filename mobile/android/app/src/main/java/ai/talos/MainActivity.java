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
        super.onCreate(savedInstanceState);
    }
}
