package ai.talos;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * What the device has actually granted, and the one door out to system settings.
 *
 * Written in-house rather than taken from a third-party plugin: TALOS needs a
 * surface no catalogue plugin provides (a notification state that distinguishes
 * "never asked" from "permanently denied", and the app-details intent), and this
 * sits on the security-sensitive path where one less dependency is worth the
 * thirty lines.
 *
 * The distinction that makes the permissions screen honest lives here. Android's
 * own API cannot tell "never asked" from "permanently denied" —
 * `shouldShowRequestPermissionRationale` returns false for both — so a screen
 * built on it alone would show an Allow button that, past a permanent denial,
 * silently does nothing. Capacitor keeps the extra bit in its own cache, and
 * `getPermissionState` reads it.
 */
@CapacitorPlugin(
    name = "TalosDevicePermissions",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class TalosDevicePermissionsPlugin extends Plugin {

    /**
     * Below Android 13 there is no notification permission at all: notifications
     * are on unless the user turned the whole app's off, and reporting "prompt"
     * would invite a request that can never happen.
     */
    @PluginMethod
    public void state(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            result.put("notifications", enabled ? "granted" : "denied");
            result.put("notificationsRuntime", false);
        } else {
            // Capacitor's own state, which carries the bit Android does not:
            // `denied` here means permanently denied, `prompt` means never asked.
            result.put("notifications", getPermissionState("notifications").toString());
            result.put("notificationsRuntime", true);
        }
        result.put("microphone", micState());
        call.resolve(result);
    }

    private String micState() {
        boolean granted = getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED;
        if (granted) return "granted";
        // The activity knows whether a rationale is owed, which is what tells a
        // first-time ask apart from a denial the user can still reverse.
        boolean rationale = getActivity() != null
            && getActivity().shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO);
        return rationale ? "prompt-with-rationale" : "prompt";
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Nothing to request: the only control is the app's notification
            // settings, so send the caller there instead of resolving a lie.
            call.resolve(new JSObject().put("state", "granted"));
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve(new JSObject().put("state", getPermissionState("notifications").toString()));
    }

    /**
     * The app's own page in system settings.
     *
     * There is no way to deep-link a single toggle, which is why the screen
     * shows numbered steps beside this button. Guarded because the docs are
     * explicit that a matching activity may not exist.
     */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception error) {
            // Never reject: a device without that screen is not a failure the
            // user can act on, and the row already tells them what to look for.
            call.resolve(new JSObject().put("opened", false));
        }
    }

    /** The notification channel screen, which is the useful one on Android 8+. */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception error) {
            openAppSettings(call);
        }
    }

    private Context context() {
        return getContext();
    }
}
