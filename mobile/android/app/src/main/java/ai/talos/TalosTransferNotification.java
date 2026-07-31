package ai.talos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.text.format.Formatter;

import androidx.core.app.NotificationCompat;

/**
 * The download bar, the way a serious app does one.
 *
 * Its own channel, deliberately. Sharing the run service's channel would mean
 * that turning off "TALOS is working" — which a user reasonably might, it fires
 * for long answers — also turns off the only visible sign that four gigabytes
 * are moving on their data plan. Two different promises, two different switches.
 *
 * The numbers come from `TalosTransferProgress`, which is proved on the JVM: a
 * remaining time that lurches between four minutes and four hours is worse than
 * no remaining time, because the user stops believing the screen.
 */
public final class TalosTransferNotification {

    public static final String CHANNEL_ID = "talos.download";
    public static final int NOTIFICATION_ID = 4712;

    /** The stop button. Broadcast rather than an activity: it must not open the app. */
    public static final String ACTION_STOP = "ai.talos.action.STOP_TRANSFER";

    private TalosTransferNotification() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Model downloads", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Progress while a model is downloading, and how it ended.");
        // LOW and silent: this reports work over hours. A bar that buzzes is a
        // bar the user turns off, and then a 4 GB transfer is invisible.
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    public static Notification building(
            Context context,
            String modelName,
            long haveBytes,
            long totalBytes,
            TalosTransferProgress progress) {
        int percent = progress.percent(haveBytes, totalBytes);
        long seconds = progress.secondsRemaining(haveBytes, totalBytes);

        String sizes = Formatter.formatShortFileSize(context, haveBytes)
                + " / " + Formatter.formatShortFileSize(context, totalBytes);
        String detail = seconds == TalosTransferProgress.UNKNOWN
                ? sizes
                : sizes + " · " + remaining(seconds) + " left";

        Intent stop = new Intent(context, TalosTransferControl.class).setAction(ACTION_STOP);
        PendingIntent stopping = PendingIntent.getBroadcast(
                context, 0, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return base(context, modelName, detail)
                .setProgress(100, percent, totalBytes <= 0)
                // Without this the bar re-alerts on every update, which for a
                // four-gigabyte download is thousands of times.
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .addAction(0, "Stop", stopping)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    /**
     * How it ended, stated plainly and left on screen.
     *
     * A download that fails while the phone is in a pocket and clears its own
     * notification is a download the user believes finished — and then they go
     * looking for a model that is not there.
     */
    public static Notification ended(Context context, String modelName, String reason) {
        return base(context, modelName, explain(reason))
                .setOngoing(false)
                .setAutoCancel(true)
                .build();
    }

    private static NotificationCompat.Builder base(Context context, String title, String text) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(context, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentIntent(pending)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW);
    }

    private static String remaining(long seconds) {
        if (seconds < 60) return seconds + "s";
        if (seconds < 3600) return (seconds / 60) + "m";
        return (seconds / 3600) + "h " + ((seconds % 3600) / 60) + "m";
    }

    /**
     * Named causes, not "an error occurred". Every one of these tells the user
     * something they can act on, which is the whole difference between a
     * failure and a dead end.
     */
    private static String explain(String reason) {
        if (reason == null) return "Downloaded and verified";
        switch (reason) {
            case "file-changed": return "The file changed on the server — start again";
            case "hash-mismatch": return "The file did not match its checksum and was removed";
            case "gone": return "The file is no longer published";
            case "unreachable": return "Could not reach the server — try again later";
            case "no-space": return "Not enough free space";
            case "stopped": return "Paused — resumes where it left off";
            default: return "Stopped: " + reason;
        }
    }
}
