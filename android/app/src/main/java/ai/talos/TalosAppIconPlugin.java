package ai.talos;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Switches the launcher icon by toggling the per-theme {@code <activity-alias>}
 * entries declared in AndroidManifest.xml (owner 2026-07-24: the launcher icon
 * follows the active theme preset).
 *
 * Web-research invariant (developer.android.com component-enabled-state): disabling
 * the currently-enabled launcher alias kills the process, so callers apply the
 * switch while the app is backgrounded. To stay always-launchable this ENABLES the
 * target alias BEFORE disabling the previous one, and never disables the target.
 */
@CapacitorPlugin(name = "TalosAppIcon")
public class TalosAppIconPlugin extends Plugin {

    private static final String PREFIX = "MainActivityIcon_";
    private static final String PREFS = "talos_app_icon";
    private static final String KEY_ACTIVE = "active_alias";
    private static final String DEFAULT_PRESET = "calm";

    // Mirrors TALOS_THEME_IDS (src/lib/talosThemes.ts) — the only aliases that exist.
    private static final Set<String> PRESETS = new HashSet<>(Arrays.asList(
        "forge", "paper", "terminal", "aurora", "glacier", "ember", "atlas",
        "noir", "signal", "violet", "claudius", "basicus", "telemetry", "calm"
    ));

    @PluginMethod
    public void getIcon(PluginCall call) {
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("preset", activePreset());
        call.resolve(ret);
    }

    @PluginMethod
    public void setIcon(PluginCall call) {
        String preset = call.getString("preset");
        if (preset == null || !PRESETS.contains(preset)) {
            call.reject("Unknown theme preset: " + preset);
            return;
        }
        String current = activePreset();
        if (preset.equals(current)) {
            call.resolve();
            return;
        }

        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        String pkg = ctx.getPackageName();

        // Enable the target FIRST, then disable the previous one, so a launcher
        // entry always exists between the two calls (never brick launchability).
        setAliasEnabled(pm, pkg, preset, true);
        if (current != null && !current.equals(preset)) {
            setAliasEnabled(pm, pkg, current, false);
        }

        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_ACTIVE, preset).apply();
        call.resolve();
    }

    private String activePreset() {
        return activePreset(getContext());
    }

    /**
     * ⭐ Il tema attivo, leggibile da CHIUNQUE nel nativo.
     *
     * Owner 2026-08-11: «mi raccomando aggancia tutto al motore dei temi». Il
     * pallino flottante deve seguire il tema come il resto, e per farlo deve
     * poter sapere quale sia — senza copiarsi la chiave delle preferenze, che
     * sarebbe una seconda verità da tenere allineata a mano.
     *
     * ⛔ `public` e statico: chi chiama sta in un altro package (`ai.talos.bolla`)
     * e non è un plugin, quindi non ha `getContext()`. Il valore di partenza
     * resta uno solo, qui.
     */
    public static String activePreset(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getString(KEY_ACTIVE, DEFAULT_PRESET);
    }

    private void setAliasEnabled(PackageManager pm, String pkg, String preset, boolean enabled) {
        ComponentName component = new ComponentName(pkg, pkg + "." + PREFIX + preset);
        int state = enabled
            ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        pm.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP);
    }
}
