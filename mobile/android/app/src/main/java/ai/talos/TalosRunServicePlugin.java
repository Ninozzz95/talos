package ai.talos;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The bridge to {@link TalosRunService}.
 *
 * Every method is safe to call when the service is not running, and none of them
 * reject on a platform that refuses the service: a failure to start the keeper
 * must never fail the WORK. The worst case is what happens today — the operation
 * dies if the user leaves the app — and turning that into a thrown error would
 * make a long answer impossible instead of merely fragile.
 */
@CapacitorPlugin(name = "TalosRunService")
public class TalosRunServicePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        final String title = call.getString("title", "TALOS is working");
        final String text = call.getString("text", "");
        try {
            final Context context = getContext();
            final Intent intent = new Intent(context, TalosRunService.class);
            intent.putExtra(TalosRunService.EXTRA_TITLE, title);
            intent.putExtra(TalosRunService.EXTRA_TEXT, text);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            call.resolve(ok(true));
        } catch (Exception failure) {
            // Reported, never thrown: the operation continues without the
            // keeper, exactly as it did before this existed.
            call.resolve(ok(false));
        }
    }

    /** Same notification, new text: progress, not a second notification. */
    @PluginMethod
    public void update(PluginCall call) {
        final String title = call.getString("title", "TALOS is working");
        final String text = call.getString("text", "");
        try {
            final Context context = getContext();
            TalosRunService.ensureChannel(context);
            final NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.notify(4711, TalosRunService.build(context, title, text));
            }
            call.resolve(ok(true));
        } catch (Exception failure) {
            call.resolve(ok(false));
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), TalosRunService.class));
            call.resolve(ok(true));
        } catch (Exception failure) {
            call.resolve(ok(false));
        }
    }

    private JSObject ok(boolean value) {
        final JSObject result = new JSObject();
        result.put("ok", value);
        return result;
    }
}
