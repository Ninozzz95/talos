package ai.talos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * R-1b — the thing that keeps a long operation alive.
 *
 * Owner 2026-07-26: leaving the app while an answer was being written produced
 * "network error". The streaming path is `fetch` INSIDE the WebView, and Android
 * suspends a backgrounded WebView — so the request did not fail, it was killed.
 * No amount of retry logic fixes that, because nothing was holding the process.
 *
 * A foreground service is what holds it. The notification is not decoration:
 * Android requires it, and it is also the honest thing — an app doing work you
 * cannot see, on your battery, should say so.
 *
 * Deliberately NOT started for every message. A two-second reply that flashes a
 * persistent notification is worse than the problem; the JavaScript side starts
 * this only when an operation is genuinely long (a tool round, or streaming that
 * outlives a threshold).
 */
public class TalosRunService extends Service {

    static final String CHANNEL_ID = "talos.run";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TEXT = "text";
    private static final int NOTIFICATION_ID = 4711;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        final String title = intent != null && intent.getStringExtra(EXTRA_TITLE) != null
                ? intent.getStringExtra(EXTRA_TITLE)
                : "TALOS is working";
        final String text = intent != null && intent.getStringExtra(EXTRA_TEXT) != null
                ? intent.getStringExtra(EXTRA_TEXT)
                : "";

        ensureChannel(this);
        final Notification notification = build(this, title, text);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14+ demands the type be declared at start, and it must
            // match the manifest or the service is refused outright.
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        // NOT_STICKY: if Android kills us anyway, it must not resurrect the
        // service on its own. The run's state is on disk, and the app decides
        // whether to resume — a service that restarts itself without the app
        // would hold a notification for work nobody is doing.
        return START_NOT_STICKY;
    }

    /**
     * Android 15+ gives a `dataSync` service a SIX-HOUR budget per day, and
     * calls this when it runs out. An app that does not stop itself within a
     * few seconds is killed with `ForegroundServiceDidNotStopInTimeException` —
     * a crash, not a warning.
     *
     * This service was written before that rule and had no override at all, on
     * a build targeting SDK 36. Found on 2026-07-31 by a review that was
     * looking at something else entirely: the six-hour budget is SHARED, so a
     * future model download on this path would spend it and crash the app on
     * the way out.
     *
     * Stopping is the only correct answer — the budget is gone and no amount of
     * asking gets it back. The work itself is not cancelled here: its state
     * lives on disk and the WebView keeps running while the app is in front.
     * What is lost is the guarantee that it survives being backgrounded, and
     * that is exactly what the notification was claiming, so the notification
     * goes with it rather than lying for the rest of the day.
     */
    @Override
    public void onTimeout(int startId, int fgsType) {
        stopKeeper();
    }

    /** API 34's single-argument form; kept so the behaviour is not version-shaped. */
    @Override
    public void onTimeout(int startId) {
        stopKeeper();
    }

    private void stopKeeper() {
        try {
            // minSdk is 26, so the constant form is always available.
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Exception ignored) {
            // Stopping must happen regardless; a failure here must not prevent
            // stopSelf() below, which is the part that avoids the crash.
        }
        stopSelf();
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        final NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        final NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Work in progress", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Shown while TALOS is answering, searching or making a document.");
        // LOW, and no sound or vibration: this reports work, it does not
        // interrupt. A notification that buzzes for every long answer is one the
        // user turns off, and then they cannot see the work at all.
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    static Notification build(Context context, String title, String text) {
        final Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        final PendingIntent pending = PendingIntent.getActivity(
                context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_notify_sync)
                .setContentIntent(pending)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }
}
