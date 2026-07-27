package ai.talos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * R-1 native keeper for one user-initiated long operation.
 *
 * The service owns process importance and notification state only. The
 * canonical run, checkpoints and policy remain in encrypted SQLite.
 */
public class TalosRunService extends Service {

    static final String CONTRACT = "talos.mobile.run-service.v1";
    static final String CHANNEL_ID = "talos.run";
    static final String ACTION_CANCEL = "ai.talos.action.CANCEL_RUN";
    static final String ACTION_STATE_CHANGED = "ai.talos.action.RUN_STATE_CHANGED";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    static final String EXTRA_RUN_ID = "runId";
    static final String EXTRA_CANCELABLE = "cancelable";
    static final String EXTRA_STATUS = "status";
    static final String EXTRA_UPDATED_AT = "updatedAt";
    static final String STATUS_RUNNING = "running";
    static final String STATUS_STOPPED = "stopped";
    static final String STATUS_CANCELLED = "cancelled";
    static final String STATUS_TIMED_OUT = "timed_out";
    static final String PREFERENCES = "talos.run.service";
    static final String PREF_RUN_ID = "run_id";
    static final String PREF_STATUS = "status";
    static final String PREF_UPDATED_AT = "updated_at";
    static final int NOTIFICATION_ID = 4711;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String storedRunId = state(this).getString(PREF_RUN_ID, null);
        final String runId = intent != null && intent.getStringExtra(EXTRA_RUN_ID) != null
                ? intent.getStringExtra(EXTRA_RUN_ID)
                : storedRunId;

        if (intent != null && ACTION_CANCEL.equals(intent.getAction())) {
            recordState(this, runId, STATUS_CANCELLED);
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        final String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null
                ? intent.getStringExtra(EXTRA_TITLE)
                : "TALOS is working";
        final String text = intent != null && intent.getStringExtra(EXTRA_TEXT) != null
                ? intent.getStringExtra(EXTRA_TEXT)
                : "";
        final boolean cancelable = intent != null
                && intent.getBooleanExtra(EXTRA_CANCELABLE, false)
                && runId != null;

        ensureChannel(this);
        recordState(this, runId, STATUS_RUNNING);
        final Notification notification = build(this, title, text, runId, cancelable);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_NOT_STICKY;
    }

    /**
     * Android 15+ gives a timed-out dataSync service only a few seconds to
     * terminate. Persist and broadcast first, then remove the notification and
     * stop this exact start instance.
     */
    @Override
    public void onTimeout(int startId, int fgsType) {
        final String runId = state(this).getString(PREF_RUN_ID, null);
        recordState(this, runId, STATUS_TIMED_OUT);
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf(startId);
    }

    static SharedPreferences state(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    static void recordState(Context context, String runId, String status) {
        final long updatedAt = System.currentTimeMillis();
        final SharedPreferences.Editor editor = state(context)
                .edit()
                .putString(PREF_STATUS, status)
                .putLong(PREF_UPDATED_AT, updatedAt);
        if (runId == null) {
            editor.remove(PREF_RUN_ID);
        } else {
            editor.putString(PREF_RUN_ID, runId);
        }
        editor.apply();

        final Intent changed = new Intent(ACTION_STATE_CHANGED)
                .setPackage(context.getPackageName())
                .putExtra(EXTRA_RUN_ID, runId)
                .putExtra(EXTRA_STATUS, status)
                .putExtra(EXTRA_UPDATED_AT, updatedAt);
        context.sendBroadcast(changed);
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        final NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        final NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Work in progress",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shown while TALOS is answering, searching or making a document.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    static Notification build(
            Context context,
            String title,
            String text,
            String runId,
            boolean cancelable
    ) {
        final Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        final PendingIntent openPending = PendingIntent.getActivity(
                context,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        final NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentIntent(openPending)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);

        if (cancelable && runId != null) {
            final Intent cancel = new Intent(context, TalosRunService.class)
                    .setAction(ACTION_CANCEL)
                    .putExtra(EXTRA_RUN_ID, runId);
            final PendingIntent cancelPending = PendingIntent.getService(
                    context,
                    1,
                    cancel,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.addAction(new NotificationCompat.Action.Builder(
                    android.R.drawable.ic_menu_close_clear_cancel,
                    "Cancel",
                    cancelPending
            )
                    .setShowsUserInterface(false)
                    .build());
        }
        return builder.build();
    }
}
