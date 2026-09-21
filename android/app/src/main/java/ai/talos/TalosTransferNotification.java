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

/** Independent, grouped progress notifications for model transfers. */
public final class TalosTransferNotification {

    public static final String CHANNEL_ID = "talos.download";
    public static final int NOTIFICATION_ID = 4712;
    public static final int SUMMARY_NOTIFICATION_ID = 4700;
    public static final String GROUP_KEY = "ai.talos.group.MODEL_DOWNLOADS";
    public static final String EXTRA_TRANSFER_ID = "ai.talos.extra.TRANSFER_ID";

    public static final String ACTION_PAUSE = "ai.talos.action.PAUSE_TRANSFER";
    @Deprecated public static final String ACTION_STOP = ACTION_PAUSE;

    private TalosTransferNotification() {}

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Model downloads", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Progress while models are downloading, and how they ended.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    public static Notification building(
            Context context,
            String transferId,
            int jobId,
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

        Intent pause = new Intent(context, TalosTransferControl.class).setAction(ACTION_PAUSE);
        pause.putExtra(EXTRA_TRANSFER_ID, transferId);
        PendingIntent pausing = PendingIntent.getBroadcast(
                context,
                jobId,
                pause,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return base(context, notificationId(jobId), modelName, detail)
                .setProgress(100, percent, totalBytes <= 0)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setGroup(GROUP_KEY)
                .addAction(0, "Pause", pausing)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    /** Compatibility for callers compiled against the single-transfer shape. */
    public static Notification building(
            Context context,
            String modelName,
            long haveBytes,
            long totalBytes,
            TalosTransferProgress progress) {
        return building(
                context, "legacy", TalosTransferJournal.LEGACY_JOB_ID,
                modelName, haveBytes, totalBytes, progress);
    }

    public static Notification summary(Context context, int count) {
        return base(
                context,
                SUMMARY_NOTIFICATION_ID,
                "Model downloads",
                count == 1 ? "1 transfer active" : count + " transfers active")
                .setGroup(GROUP_KEY)
                .setGroupSummary(true)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .build();
    }

    public static void announceEnd(
            Context context,
            String transferId,
            int jobId,
            String modelName,
            String reason) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(notificationId(jobId));
        TalosDoneNotification.post(
                context,
                doneNotificationId(jobId),
                modelName,
                explain(reason),
                "/settings/models/local");
    }

    public static void announceEnd(Context context, String modelName, String reason) {
        announceEnd(
                context,
                "legacy",
                TalosTransferJournal.LEGACY_JOB_ID,
                modelName,
                reason);
    }

    static int notificationId(int jobId) {
        return jobId;
    }

    static int doneNotificationId(int jobId) {
        return 1_000_000 + Math.floorMod(jobId, 1_000_000);
    }

    private static NotificationCompat.Builder base(
            Context context,
            int requestCode,
            String title,
            String text) {
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(TalosDoneNotification.EXTRA_ROUTE, "/settings/models/local");
        PendingIntent pending = PendingIntent.getActivity(
                context,
                requestCode,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

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
