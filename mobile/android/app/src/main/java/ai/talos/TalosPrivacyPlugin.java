package ai.talos;

import android.app.Activity;
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
}
