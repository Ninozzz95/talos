package ai.talos;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.os.PowerManager;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Debt S2 (security review): the app had NO FLAG_SECURE anywhere, so Android's
 * task snapshot — taken at pause — put the open chat in the recents card, fully
 * readable without the PIN. Screenshots and screen recording were equally free.
 *
 * FLAG_SECURE tells the system this window's pixels must not be captured. It is
 * applied while the app lock is enabled (a lock that leaves the content
 * screenshot-able is not a lock).
 */
@CapacitorPlugin(name = "TalosPrivacy")
public class TalosPrivacyPlugin extends Plugin {

    @PluginMethod
    public void setSecure(PluginCall call) {
        final Boolean enabled = call.getBoolean("enabled", Boolean.FALSE);
        final boolean secure = enabled != null && enabled;
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("TALOS_PRIVACY_NO_ACTIVITY");
            return;
        }
        // Window flags must be touched on the UI thread, and the call resolves
        // from INSIDE the runnable: an await that returns before the flag is
        // applied reports a security guarantee that does not exist yet.
        activity.runOnUiThread(() -> {
            final Window window = activity.getWindow();
            if (window == null) {
                call.reject("TALOS_PRIVACY_NO_WINDOW");
                return;
            }
            if (secure) {
                window.addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
            JSObject result = new JSObject();
            result.put("secure", secure);
            call.resolve(result);
        });
    }

    /**
     * Did the DEVICE take the app away, or did the user just switch apps?
     *
     * Owner 2026-07-29: locking the phone has to lock TALOS immediately. The web
     * layer only sees "went to background" and cannot tell the two apart, so the
     * answer has to come from here. The decision itself lives in
     * TalosDeviceLockPolicy so it can be tested without an emulator.
     *
     * This resolves rather than rejects when a service is missing: the caller
     * treats an unavailable answer as "not a device lock" and falls back to the
     * grace window, because failing closed here would mean a PIN prompt every
     * time the user glanced at a notification.
     */
    @PluginMethod
    public void isDeviceLocked(PluginCall call) {
        final Context context = getContext();
        final JSObject result = new JSObject();
        if (context == null) {
            result.put("locked", false);
            result.put("available", false);
            call.resolve(result);
            return;
        }
        final KeyguardManager keyguard =
            (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        final PowerManager power =
            (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (keyguard == null || power == null) {
            result.put("locked", false);
            result.put("available", false);
            call.resolve(result);
            return;
        }
        result.put(
            "locked",
            TalosDeviceLockPolicy.tookAppAway(keyguard.isKeyguardLocked(), power.isInteractive())
        );
        result.put("available", true);
        call.resolve(result);
    }
}
