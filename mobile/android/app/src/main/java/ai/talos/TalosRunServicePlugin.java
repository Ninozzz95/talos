package ai.talos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Set;

/**
 * Capacitor v8 adapter for {@link TalosRunService}.
 *
 * Native state is normalized before it crosses the bridge. The plugin never
 * owns the TALOS run itself; JavaScript persists the canonical checkpoint.
 */
@CapacitorPlugin(name = "TalosRunService")
public class TalosRunServicePlugin extends Plugin {

    private static final Set<String> VALID_STATUSES = Set.of(
            TalosRunService.STATUS_RUNNING,
            TalosRunService.STATUS_STOPPED,
            TalosRunService.STATUS_CANCELLED,
            TalosRunService.STATUS_TIMED_OUT
    );

    private final BroadcastReceiver stateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            try {
                notifyListeners("stateChanged", stateFromIntent(intent), true);
            } catch (IllegalStateException invalid) {
                // A malformed app-private event is ignored fail-closed.
            }
        }
    };
    private boolean receiverRegistered = false;

    @Override
    public void load() {
        ContextCompat.registerReceiver(
                getContext(),
                stateReceiver,
                new IntentFilter(TalosRunService.ACTION_STATE_CHANGED),
                ContextCompat.RECEIVER_NOT_EXPORTED
        );
        receiverRegistered = true;
    }

    @Override
    protected void handleOnDestroy() {
        if (receiverRegistered) {
            getContext().unregisterReceiver(stateReceiver);
            receiverRegistered = false;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void start(PluginCall call) {
        final String title = call.getString("title", "TALOS is working");
        final String text = call.getString("text", "");
        final String runId = nullableRunId(call.getString("runId"));
        final boolean cancelable = Boolean.TRUE.equals(call.getBoolean("cancelable", false)) && runId != null;
        try {
            final Context context = getContext();
            final Intent intent = new Intent(context, TalosRunService.class)
                    .putExtra(TalosRunService.EXTRA_TITLE, title)
                    .putExtra(TalosRunService.EXTRA_TEXT, text)
                    .putExtra(TalosRunService.EXTRA_RUN_ID, runId)
                    .putExtra(TalosRunService.EXTRA_CANCELABLE, cancelable);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            call.resolve(ok(true));
        } catch (Exception failure) {
            call.resolve(ok(false));
        }
    }

    /** Same notification, new progress. */
    @PluginMethod
    public void update(PluginCall call) {
        final String title = call.getString("title", "TALOS is working");
        final String text = call.getString("text", "");
        final String runId = nullableRunId(call.getString("runId"));
        final boolean cancelable = Boolean.TRUE.equals(call.getBoolean("cancelable", false)) && runId != null;
        try {
            final Context context = getContext();
            TalosRunService.ensureChannel(context);
            final android.app.NotificationManager manager =
                    context.getSystemService(android.app.NotificationManager.class);
            if (manager != null) {
                manager.notify(
                        TalosRunService.NOTIFICATION_ID,
                        TalosRunService.build(context, title, text, runId, cancelable)
                );
            }
            call.resolve(ok(true));
        } catch (Exception failure) {
            call.resolve(ok(false));
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            final Context context = getContext();
            final String runId = TalosRunService.state(context)
                    .getString(TalosRunService.PREF_RUN_ID, null);
            TalosRunService.recordState(context, runId, TalosRunService.STATUS_STOPPED);
            context.stopService(new Intent(context, TalosRunService.class));
            call.resolve(ok(true));
        } catch (Exception failure) {
            call.resolve(ok(false));
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        try {
            call.resolve(currentState(getContext()));
        } catch (IllegalStateException invalid) {
            call.reject("TALOS_RUN_SERVICE_STATE_INVALID");
        }
    }

    private JSObject currentState(Context context) {
        final SharedPreferences preferences = TalosRunService.state(context);
        final String status = preferences.getString(
                TalosRunService.PREF_STATUS,
                TalosRunService.STATUS_STOPPED
        );
        if (!VALID_STATUSES.contains(status)) {
            throw new IllegalStateException("TALOS_RUN_SERVICE_STATE_INVALID");
        }
        return state(
                preferences.getString(TalosRunService.PREF_RUN_ID, null),
                status,
                preferences.getLong(TalosRunService.PREF_UPDATED_AT, 0)
        );
    }

    private JSObject stateFromIntent(Intent intent) {
        if (intent == null) throw new IllegalStateException("TALOS_RUN_SERVICE_STATE_INVALID");
        final String status = intent.getStringExtra(TalosRunService.EXTRA_STATUS);
        if (!VALID_STATUSES.contains(status)) {
            throw new IllegalStateException("TALOS_RUN_SERVICE_STATE_INVALID");
        }
        return state(
                nullableRunId(intent.getStringExtra(TalosRunService.EXTRA_RUN_ID)),
                status,
                intent.getLongExtra(TalosRunService.EXTRA_UPDATED_AT, 0)
        );
    }

    private JSObject state(String runId, String status, long updatedAt) {
        final JSObject result = new JSObject();
        result.put("contract", TalosRunService.CONTRACT);
        result.put("status", status);
        result.put("runId", runId);
        result.put("updatedAt", updatedAt);
        return result;
    }

    private String nullableRunId(String value) {
        if (value == null) return null;
        if (!value.matches("^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")) {
            throw new IllegalStateException("TALOS_RUN_SERVICE_STATE_INVALID");
        }
        return value;
    }

    private JSObject ok(boolean value) {
        final JSObject result = new JSObject();
        result.put("ok", value);
        return result;
    }
}
